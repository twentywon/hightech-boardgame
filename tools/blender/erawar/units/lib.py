"""
What every 시대 전쟁 unit script shares (run inside Blender, headless; see ../README.md).

Shapes are worked out in the game's own frame — x forward (the way a unit faces), y up, z across (+z the near side,
the hand that holds the weapon) — and handed to Blender as (x, -z, y), Blender's z being up. Each part is lofted from
cross-sections (a torso, a limb, a boot), turned (a helmet), or bent along a curve (a finger, a strap), then smoothed
by Blender's subdivision, pushed in and out by noise and bumps (muscles, cloth folds, fur), its hard edges split, and
lit by Cycles' baked ambient occlusion. `export` writes one GLB per unit: a primitive per paint (named after the game's
paint), each vertex carrying the two joints that move it and its baked light.
"""
import math, json, struct, os
import numpy as np
import bpy, bmesh

# ─────────────── frames ───────────────


def g2b(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def b2g(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def smoothstep(a, b, v):
    u = np.clip((np.asarray(v, dtype=np.float64) - a) / (b - a), 0.0, 1.0)
    return u * u * (3 - 2 * u)


def norm(v):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


# ─────────────── noise ───────────────


def _hash(ix, iy, iz, seed):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    h = h & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFF).astype(np.float64) / 65535.0


def vnoise(p, seed=0):
    """Smooth value noise in -1..1 at points p (n, 3)."""
    p = np.asarray(p, dtype=np.float64)
    i = np.floor(p)
    f = p - i
    u = f * f * (3 - 2 * f)
    ix, iy, iz = i[:, 0].astype(np.int64), i[:, 1].astype(np.int64), i[:, 2].astype(np.int64)
    out = np.zeros(len(p))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out += w * _hash(ix + dx, iy + dy, iz + dz, seed)
    return out * 2 - 1


def fbm(p, octaves=4, seed=0, lac=2.0, gain=0.5):
    p = np.asarray(p, dtype=np.float64)
    out = np.zeros(len(p))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        out += amp * vnoise(p * (lac**o), seed + o * 17)
        total += amp
        amp *= gain
    return out / total


def bump(P, centre, radius, height, stretch=(1, 1, 1)):
    """A soft swelling (or a hollow, for a negative height) round a point, `stretch` drawing it out along x, y, z."""
    d = (np.asarray(P) - np.asarray(centre)) / (np.asarray(stretch) * radius)
    return height * np.exp(-np.sum(d * d, axis=1))


# ─────────────── shapes ───────────────


class Shape:
    """Vertices (game frame) and faces, each face with its paint."""

    def __init__(self, verts, faces, paint):
        self.v = np.asarray(verts, dtype=np.float64)
        self.f = [tuple(int(i) for i in f) for f in faces]
        self.paint = list(paint) if isinstance(paint, (list, tuple)) else [paint] * len(self.f)

    @staticmethod
    def join(shapes):
        v, f, p, base = [], [], [], 0
        for s in shapes:
            v.append(s.v)
            f += [tuple(i + base for i in face) for face in s.f]
            p += s.paint
            base += len(s.v)
        return Shape(np.concatenate(v), f, p)

    def moved(self, m):
        """Transformed by a 4x4 matrix (game frame)."""
        v = np.c_[self.v, np.ones(len(self.v))] @ np.asarray(m).T
        return Shape(v[:, :3], self.f, self.paint)


def ring_dirs(n, p=2.0, phase=0.0):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False) + phase
    c, s = np.cos(t), np.sin(t)
    e = 2.0 / p
    return np.sign(c) * np.abs(c) ** e, np.sign(s) * np.abs(s) ** e, t


def loft(sections, n=16, paint="skin", caps=(True, True), cap_rings=3, up=(1, 0, 0), cap_len=None):
    """
    A tube through cross-sections: each a dict with `c` (centre), `a` (half size along the frame's u, which points as
    near to `up` as it can), `b` (half size along v = t × u), `p` (2 an ellipse, more a rounded box), and optional `off`
    (a function of the ring's angle giving extra radius in metres), `u` (its own reference). Ends rounded closed.
    """
    C = np.array([s["c"] for s in sections], dtype=np.float64)
    m = len(C)
    T_ = np.zeros_like(C)
    for i in range(m):
        a, b = C[max(i - 1, 0)], C[min(i + 1, m - 1)]
        T_[i] = norm(b - a)
    rings = []
    for i, s in enumerate(sections):
        t = T_[i]
        ref = np.asarray(s.get("u", up), dtype=np.float64)
        u = ref - np.dot(ref, t) * t
        if np.linalg.norm(u) < 1e-6:
            u = np.array([0, 0, 1.0]) - t[2] * t
        u = norm(u)
        v = np.cross(t, u)
        cx, sx, th = ring_dirs(n, s.get("p", 2.0))
        extra = s["off"](th) if "off" in s else 0.0
        a, b = s["a"], s["b"]
        ra = (a + extra) * cx
        rb = (b + extra) * sx
        rings.append(C[i] + np.outer(ra, u) + np.outer(rb, v))
    verts = list(np.concatenate(rings))
    faces = []
    for i in range(m - 1):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j))

    def cap(end):
        nonlocal verts
        i = 0 if end == 0 else m - 1
        sign = -1 if end == 0 else 1
        t = T_[i] * sign
        ring = rings[i]
        centre = C[i]
        rad = ring - centre
        length = cap_len if cap_len is not None else 0.6 * min(sections[i]["a"], sections[i]["b"])
        prev = list(range(i * n, i * n + n))
        for k in range(1, cap_rings + 1):
            ang = (k / (cap_rings + 1)) * (np.pi / 2)
            new = centre + rad * np.cos(ang) + t * length * np.sin(ang)
            base = len(verts)
            verts += list(new)
            cur = list(range(base, base + n))
            for j in range(n):
                j2 = (j + 1) % n
                faces.append((prev[j], prev[j2], cur[j2], cur[j]))
            prev = cur
        apex = len(verts)
        verts.append(centre + t * length)
        for j in range(n):
            faces.append((prev[j], prev[(j + 1) % n], apex))

    if caps[0]:
        cap(0)
    if caps[1]:
        cap(1)
    return Shape(np.array(verts), faces, paint)


def lathe(outline, n=24, paint="iron", sx=1.0, sz=1.0, closed=(True, True)):
    """Turned round y: outline of (radius, height) from bottom to top; x stretched by sx, z by sz."""
    verts, faces = [], []
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    for r, y in outline:
        for t in th:
            verts.append((np.cos(t) * r * sx, y, np.sin(t) * r * sz))
    m = len(outline)
    for i in range(m - 1):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((i * n + j, (i + 1) * n + j, (i + 1) * n + j2, i * n + j2))
    if closed[0] and outline[0][0] > 1e-4:
        c = len(verts)
        verts.append((0, outline[0][1], 0))
        for j in range(n):
            faces.append((c, j, (j + 1) % n))
    if closed[1] and outline[-1][0] > 1e-4:
        c = len(verts)
        verts.append((0, outline[-1][1], 0))
        b = (m - 1) * n
        for j in range(n):
            faces.append((c, b + (j + 1) % n, b + j))
    return Shape(np.array(verts), faces, paint)


def tube(points, r0, r1=None, n=8, paint="rope", caps=True, up=(0, 1, 0), samples=None):
    """A round tube along a smooth curve through points (Catmull-Rom), tapering from r0 to r1."""
    P = np.asarray(points, dtype=np.float64)
    r1 = r0 if r1 is None else r1
    k = samples or max(4, 3 * len(P))
    curve = catmull(P, k)
    secs = []
    for i, c in enumerate(curve):
        t = i / (len(curve) - 1)
        r = r0 + (r1 - r0) * t
        secs.append({"c": c, "a": r, "b": r})
    return loft(secs, n=n, paint=paint, caps=(caps, caps), cap_rings=2, up=up)


def catmull(P, k):
    P = np.asarray(P, dtype=np.float64)
    if len(P) == 2:
        return np.array([P[0] + (P[1] - P[0]) * t for t in np.linspace(0, 1, k)])
    ext = np.concatenate([[2 * P[0] - P[1]], P, [2 * P[-1] - P[-2]]])
    out = []
    segs = len(P) - 1
    for i in range(k):
        u = i / (k - 1) * segs
        s = min(int(u), segs - 1)
        t = u - s
        p0, p1, p2, p3 = ext[s], ext[s + 1], ext[s + 2], ext[s + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t**3))
    return np.array(out)


def box(size, centre=(0, 0, 0), paint="dark"):
    """A box (to be rounded by subdivision with creases, or bevelled)."""
    sx, sy, sz = np.asarray(size) / 2
    v = np.array([[x, y, z] for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]) + np.asarray(centre)
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return Shape(v, f, paint)


def ellipsoid(r, centre=(0, 0, 0), paint="skin", n=16, m=10):
    rx, ry, rz = r
    verts, faces = [], []
    for i in range(1, m):
        ph = np.pi * i / m
        for j in range(n):
            th = 2 * np.pi * j / n
            verts.append((np.sin(ph) * np.cos(th) * rx, np.cos(ph) * ry, np.sin(ph) * np.sin(th) * rz))
    top, bot = len(verts), len(verts) + 1
    verts += [(0, ry, 0), (0, -ry, 0)]
    for i in range(m - 2):
        for j in range(n):
            j2 = (j + 1) % n
            faces.append((i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j))
    for j in range(n):
        faces.append((top, (j + 1) % n, j))
        b = (m - 2) * n
        faces.append((bot, b + j, b + (j + 1) % n))
    return Shape(np.array(verts) + np.asarray(centre), faces, paint)


def slab(outline, depth, paint="wood"):
    """A flat outline (x, y) pushed out ±depth/2 along z (stocks, blades, flaps); rounded by a bevel later."""
    o = np.asarray(outline, dtype=np.float64)
    n = len(o)
    verts = [(x, y, -depth / 2) for x, y in o] + [(x, y, depth / 2) for x, y in o]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for j in range(n):
        j2 = (j + 1) % n
        faces.append((j, j2, n + j2, n + j))
    return Shape(np.array(verts), faces, paint)


def rot(axis, angle):
    """4x4 rotation about the game's x, y or z."""
    c, s = math.cos(angle), math.sin(angle)
    m = np.eye(4)
    if axis == "x":
        m[1:3, 1:3] = [[c, -s], [s, c]]
    elif axis == "y":
        m[0, 0], m[0, 2], m[2, 0], m[2, 2] = c, s, -s, c
    else:
        m[0:2, 0:2] = [[c, -s], [s, c]]
    return m


def at(x, y, z):
    m = np.eye(4)
    m[:3, 3] = (x, y, z)
    return m


def scale(x, y, z):
    return np.diag([x, y, z, 1.0])


# ─────────────── Blender objects ───────────────

PREVIEW = {
    # Rough colours for Blender's own pictures (the game uses its own paints).
    "skin": "#e0ad84", "skin2": "#b98058", "lip": "#9c4a3c", "eye": "#f4f1ea", "pupil": "#1b1612", "hair": "#3a2618",
    "hairRed": "#6e3418", "beard": "#2c1d12", "fur": "#7a5532", "furDark": "#4e3620", "furLight": "#a07a4c", "hide": "#9b7346",
    "bone": "#ece2c6", "feather": "#f2efe6", "wood": "#7b5532", "woodDark": "#4d331d", "stone": "#8d8a84", "flint": "#53565c",
    "iron": "#8f969e", "mail": "#7c838c", "steel": "#c9d0d8", "dark": "#2a2c30", "black": "#16171a", "leather": "#6a4426",
    "leatherDark": "#3f2a18", "cloth": "#d9cfb6", "green": "#4f6b35", "hood": "#3f5a2c", "white": "#eeeae0", "gold": "#d9a72c",
    "brass": "#c19a3e", "bronze": "#8a6634", "olive": "#5d6a3c", "oliveDark": "#424c2a", "khaki": "#8c845c", "webbing": "#6b6a46",
    "glass": "#2a3a40", "tusk": "#efe6cf", "horse": "#6b4426", "horseLight": "#8a5b34", "mane": "#24170d", "rope": "#b89b6a",
    "boot": "#2e241c", "rubber": "#1d1e20", "team": "#d2452b", "teamDark": "#82291a", "shag": "#6e4b2c",
}
METAL = {"iron", "mail", "steel", "dark", "black", "gold", "brass", "bronze"}


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    h = PREVIEW.get(name, "#888888").lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    bsdf.inputs["Base Color"].default_value = (*lin, 1)
    bsdf.inputs["Metallic"].default_value = 0.8 if name in METAL else 0.0
    bsdf.inputs["Roughness"].default_value = 0.35 if name in METAL else 0.75
    return m


class Part:
    """A Blender object made from a Shape, with how it moves (`rig`: a joint's name, or a function of positions)."""

    def __init__(self, name, shape, rig, subdiv=1, smooth=True, sharp=None, crease=None, outward=None):
        self.name = name
        self.rig = rig
        me = bpy.data.meshes.new(name)
        me.from_pydata(g2b(shape.v).tolist(), [], shape.f)
        me.update()
        paints = []
        for p in shape.paint:
            if p not in paints:
                paints.append(p)
        for p in paints:
            me.materials.append(material(p))
        me.polygons.foreach_set("material_index", [paints.index(p) for p in shape.paint])
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if outward is not None:
            # An open shell (hair, a hood, a skirt) faces away from a point, or from the upright axis through it.
            o = g2b(np.asarray(outward[1], dtype=np.float64))
            for f in bm.faces:
                c = np.asarray(f.calc_center_median())
                d = c - o
                if outward[0] == "axis":
                    d[2] = 0
                if np.dot(np.asarray(f.normal), d) < 0:
                    f.normal_flip()
        if crease is not None:
            # Hard edges kept through subdivision (a box stays a box with rounded corners).
            layer = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
            for e in bm.edges:
                if e.is_manifold and e.calc_face_angle(0) > math.radians(crease):
                    e[layer] = 0.85
        bm.to_mesh(me)
        bm.free()
        self.obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(self.obj)
        if subdiv:
            mod = self.obj.modifiers.new("sub", "SUBSURF")
            mod.levels = mod.render_levels = subdiv
            self.apply()
        self.obj.data.polygons.foreach_set("use_smooth", [smooth] * len(self.obj.data.polygons))
        self.sharp = sharp
        self.obj.data.update()

    def apply(self):
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.obj.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        old = self.obj.data
        self.obj.modifiers.clear()
        self.obj.data = me
        bpy.data.meshes.remove(old)

    def points(self):
        me = self.obj.data
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        return b2g(co.reshape(-1, 3))

    def normals(self):
        me = self.obj.data
        n = np.empty(len(me.vertices) * 3)
        me.vertex_normals.foreach_get("vector", n)
        return b2g(n.reshape(-1, 3))

    def set_points(self, P):
        me = self.obj.data
        me.vertices.foreach_set("co", g2b(P).reshape(-1).astype(np.float32))
        me.update()

    def vertex_paints(self):
        """Each vertex's paint (that of a face it is on)."""
        me = self.obj.data
        names = [m.name for m in me.materials]
        out = [None] * len(me.vertices)
        for poly in me.polygons:
            for vi in poly.vertices:
                if out[vi] is None:
                    out[vi] = names[poly.material_index]
        return np.array(out, dtype=object)

    def push(self, fn):
        """Moves each vertex along its normal by fn(points, normals, paints) metres."""
        P, N = self.points(), self.normals()
        d = fn(P, N, self.vertex_paints())
        self.set_points(P + N * np.asarray(d)[:, None])
        return self

    def finish(self):
        """Hard edges split (so a helmet's rim or a box's corner stays crisp)."""
        if self.sharp is not None:
            bm = bmesh.new()
            bm.from_mesh(self.obj.data)
            edges = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(self.sharp)]
            bmesh.ops.split_edges(bm, edges=edges)
            bm.to_mesh(self.obj.data)
            bm.free()
            self.obj.data.update()
        return self


# ─────────────── joints ───────────────


def chain(bones, cuts):
    """
    How a limb or a torso moves: `bones` from first to last, and between each two a cut (point, axis, half width): a
    vertex past the cut along the axis follows the next bone, within the half width it is shared smoothly.
    """

    def rig(P):
        n = len(P)
        idx = np.zeros((n, 2), dtype=np.int64)
        w = np.zeros(n)
        at = np.zeros(n, dtype=np.int64)
        blend = np.full(n, -1.0)
        for k, (point, axis, half) in enumerate(cuts):
            s = (P - np.asarray(point)) @ norm(axis)
            t = smoothstep(-half, half, s)
            past = s > half
            at = np.where(past, k + 1, at)
            inside = (s >= -half) & (s <= half)
            blend = np.where(inside, k + t, blend)
        for i in range(n):
            if blend[i] >= 0:
                k = int(math.floor(blend[i]))
                t = blend[i] - k
                idx[i] = (bones[k], bones[min(k + 1, len(bones) - 1)])
                w[i] = 1 - t
            else:
                idx[i] = (bones[at[i]], bones[at[i]])
                w[i] = 1.0
        return idx, w

    return rig


def rigid(bone):
    def rig(P):
        n = len(P)
        return np.full((n, 2), bone, dtype=np.int64), np.ones(n)

    return rig


# ─────────────── light and export ───────────────


def bake_ao(parts, samples=64, reach=0.18, floor=0.55):
    """Cycles' ambient occlusion baked into each part's vertices (both face sides, the lighter kept), floored."""
    scene = bpy.context.scene
    world = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.light_settings.distance = reach
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    objs = [p.obj for p in parts]

    def once():
        for o in objs:
            attrs = o.data.color_attributes
            for a in list(attrs):
                attrs.remove(a)
            attrs.new("ao", "FLOAT_COLOR", "POINT")
            attrs.active_color = attrs["ao"]
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        out = []
        for o in objs:
            a = o.data.color_attributes["ao"]
            v = np.empty(len(a.data) * 4, dtype=np.float32)
            a.data.foreach_get("color", v)
            out.append(v[0::4].copy())
        return out

    front = once()
    for o in objs:
        o.data.flip_normals()
    back = once()
    for o in objs:
        o.data.flip_normals()
    for p, f, b in zip(parts, front, back):
        p.ao = floor + (1 - floor) * np.clip(np.maximum(f, b), 0, 1)


def gather(parts, bones):
    """Per paint: positions, normals, uvs, the two joints and the first's weight, the light, and triangles."""
    out = {}
    for p in parts:
        me = p.obj.data
        P, N = p.points(), p.normals()
        idx, w = p.rig(P)
        ao = getattr(p, "ao", np.ones(len(P)))
        names = [m.name for m in me.materials]
        me.calc_loop_triangles()
        tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", tris)
        mats = np.empty(len(me.loop_triangles), dtype=np.int64)
        me.loop_triangles.foreach_get("material_index", mats)
        tris = tris.reshape(-1, 3)
        for mi, name in enumerate(names):
            sel = tris[mats == mi]
            if not len(sel):
                continue
            used = np.unique(sel)
            remap = np.full(len(P), -1)
            remap[used] = np.arange(len(used))
            d = out.setdefault(name, {"P": [], "N": [], "J": [], "W": [], "A": [], "T": [], "n": 0})
            d["T"].append(remap[sel] + d["n"])
            d["P"].append(P[used])
            d["N"].append(N[used])
            d["J"].append(idx[used])
            d["W"].append(w[used])
            d["A"].append(ao[used])
            d["n"] += len(used)
    for name, d in out.items():
        for k in "PNJWAT":
            d[k] = np.concatenate(d[k])
    return out


def box_uv(P, N, size=0.8):
    """Box-projected texture coordinates (a picture `size` metres across), by each vertex's main facing."""
    a = np.abs(N)
    u = np.where(a[:, 0] >= np.maximum(a[:, 1], a[:, 2]), P[:, 2], P[:, 0])
    v = np.where(a[:, 1] > np.maximum(a[:, 0], a[:, 2]), P[:, 2], P[:, 1])
    return np.stack([u / size, v / size], axis=1)


def write_glb(path, prims, extras):
    """
    One GLB: a node and mesh per primitive. POSITION as SHORT (KHR_mesh_quantization; its box in the node's extras),
    NORMAL as normalised BYTE, TEXCOORD_0 as SHORT (×1/4096), _SKIN as UNSIGNED_BYTE VEC4: first joint, second joint,
    first joint's weight (×1/255), baked light (×1/255).
    """
    blob = bytearray()
    views, accessors, nodes, meshes = [], [], [], []

    def add(data, ctype, kind, count, normalized=False, stride=None, target=34962, minmax=None):
        nonlocal blob
        while len(blob) % 4:
            blob += b"\0"
        off = len(blob)
        blob += data
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if stride:
            view["byteStride"] = stride
        if target:
            view["target"] = target
        views.append(view)
        acc = {"bufferView": len(views) - 1, "componentType": ctype, "count": count, "type": kind}
        if normalized:
            acc["normalized"] = True
        if minmax:
            acc["min"], acc["max"] = minmax
        accessors.append(acc)
        return len(accessors) - 1

    for name, d in prims.items():
        P, N = d["P"], norm(d["N"])
        n = len(P)
        lo, hi = P.min(0), P.max(0)
        span = np.maximum(hi - lo, 1e-6)
        q = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
        qp = np.zeros((n, 4), dtype=np.int16)
        qp[:, :3] = q
        qn = np.zeros((n, 4), dtype=np.int8)
        qn[:, :3] = np.round(N * 127).astype(np.int8)
        uv = box_uv(P, N, d.get("uvsize", 0.8))
        quv = np.clip(np.round(uv * 4096), -32768, 32767).astype(np.int16)
        skin = np.zeros((n, 4), dtype=np.uint8)
        skin[:, 0] = d["J"][:, 0]
        skin[:, 1] = d["J"][:, 1]
        skin[:, 2] = np.round(np.clip(d["W"], 0, 1) * 255)
        skin[:, 3] = np.round(np.clip(d["A"], 0, 1) * 255)
        tri = d["T"].reshape(-1)
        big = n > 65535
        ind = tri.astype(np.uint32 if big else np.uint16).tobytes()
        attrs = {
            "POSITION": add(qp.tobytes(), 5122, "VEC3", n, stride=8, minmax=(q.min(0).tolist(), q.max(0).tolist())),
            "NORMAL": add(qn.tobytes(), 5120, "VEC3", n, normalized=True, stride=4),
            "TEXCOORD_0": add(quv.tobytes(), 5122, "VEC2", n),
            "_SKIN": add(skin.tobytes(), 5121, "VEC4", n),
        }
        ia = add(ind, 5125 if big else 5123, "SCALAR", len(tri), target=34963)
        meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": ia}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1, "extras": {"lo": lo.tolist(), "hi": hi.tolist(), **d.get("extras", {})}})
    while len(blob) % 4:
        blob += b"\0"
    doc = {
        "asset": {"version": "2.0", "generator": "tools/blender/erawar/units", "extras": extras},
        "extensionsUsed": ["KHR_mesh_quantization"],
        "extensionsRequired": ["KHR_mesh_quantization"],
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(blob), 0x004E4942))
        f.write(blob)
    return total


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def render(path, parts, eye, look, size=(900, 1100), samples=48, lights=True):
    """A Cycles picture of the parts (for checking shapes, and the beauty shot)."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.72, 0.85, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
    world.light_settings.distance = 10
    cam_data = bpy.data.cameras.get("cam") or bpy.data.cameras.new("cam")
    cam_data.lens = 70
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    cam.location = tuple(g2b(eye))
    d = g2b(np.asarray(look)) - g2b(np.asarray(eye))
    import mathutils

    cam.rotation_euler = mathutils.Vector(d.tolist()).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    if lights and not bpy.data.objects.get("sun"):
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 3.2
        so = bpy.data.objects.new("sun", sun)
        so.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
        scene.collection.objects.link(so)
        ground = bpy.data.meshes.new("ground")
        ground.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new("ground", ground)
        gm = bpy.data.materials.new("groundm")
        gm.use_nodes = True
        gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.3, 0.12, 1)
        ground.materials.append(gm)
        scene.collection.objects.link(g)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
