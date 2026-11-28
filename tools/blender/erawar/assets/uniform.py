"""
시대 전쟁's uniforms (see ../README.md, "Artist-made people"): the gunpowder era's long coat (turned-back skirts,
contrasting cuffs, collar and lapels, brass buttons, a waistcoat, breeches, gaiters and shoes) and the modern era's
combat uniform (a jacket with pockets, trousers with cargo pockets bloused into boots, gloves, an original camouflage).
Both are original, not any real regiment's or army's.

Each is made from Quaternius' base body itself (CC0): a copy of it, its head (and, under the coat, its hands) cut
away, every vertex pushed out along its normal by what lies there (a coat over the chest and arms, breeches over the
thighs, a turned-back cuff at the wrist, trousers ballooning over the boot tops...). So it keeps the body's skin
weights and bends with it at every joint, and keeps its uvs, squeezed into the lower four fifths of the picture; the
coat's skirts, a separate open-fronted shell with a lining, take the top fifth.

The pictures are painted where each texel lies on the body: the copy's triangles are rasterised in uv space into a map
of their rest positions, normals and bones, and the paint is worked out from that (seams, pockets, buttons, cuffs and
camouflage blotches all fall where they should on the body, continuous across the uv islands).

people.py builds the garments (`garment`, `tails`, `girth`); run alone, this paints the pictures:

    blender -b --python uniform.py -- <packs dir> <work dir>

writing <work dir>/coat0.png, coat1.png (each side's coat; coat0p.png, coat1p.png their broad areas alone, which
people.py samples into the processor's figure's vertex colours) and combat.png.
"""
import math, os, sys
import numpy as np
import bpy, bmesh

ATLAS = 0.8  # the body's uvs take v in [0, ATLAS); the coat's skirts the rest
SIDES = ["#d2452b", "#2f6ed0"]
GROUPS = ("torso", "neck", "head", "uarm", "larm", "hand", "thigh", "calf", "foot")


def group_of(bone):
    if bone in ("Head",):
        return "head"
    if bone == "neck_01":
        return "neck"
    if bone.startswith(("upperarm",)):
        return "uarm"
    if bone.startswith(("lowerarm",)):
        return "larm"
    if bone.startswith(("hand", "thumb", "index", "middle", "ring", "pinky")):
        return "hand"
    if bone.startswith("thigh"):
        return "thigh"
    if bone.startswith("calf"):
        return "calf"
    if bone.startswith(("foot", "ball")):
        return "foot"
    return "torso"


def weights(o):
    """Each vertex's weight per group (vertices × GROUPS), normalised."""
    names = {g.index: group_of(g.name) for g in o.vertex_groups}
    W = np.zeros((len(o.data.vertices), len(GROUPS)))
    for v in o.data.vertices:
        for g in v.groups:
            if g.group in names:
                W[v.index, GROUPS.index(names[g.group])] += g.weight
    s = W.sum(1, keepdims=True)
    W[s[:, 0] < 1e-6, 0] = 1
    return W / np.maximum(W.sum(1, keepdims=True), 1e-9)


def step(a, b, x):
    u = np.clip((np.asarray(x, dtype=np.float64) - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


# ─────────────── noise (value noise, 3D) ───────────────


def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(P, seed=0):
    P = np.asarray(P, dtype=np.float64)
    i = np.floor(P).astype(np.int64)
    f = P - i
    u = f * f * (3 - 2 * f)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[..., 0] if dx else 1 - u[..., 0]) * (u[..., 1] if dy else 1 - u[..., 1]) * (u[..., 2] if dz else 1 - u[..., 2])
                out = out + w * _hash(i[..., 0] + dx, i[..., 1] + dy, i[..., 2] + dz, seed)
    return out


def fbm(P, octaves=4, seed=0):
    s, a, t = 0.0, 0.5, 0.0
    for o in range(octaves):
        s = s + a * vnoise(np.asarray(P) * (2**o), seed + o * 31)
        t += a
        a *= 0.5
    return s / t


# ─────────────── the garment ───────────────

# How far the cloth stands off the skin (pack metres), by what it covers.
STANDOFF = {
    "coat": {"torso": 0.022, "neck": 0.014, "head": 0.0, "uarm": 0.018, "larm": 0.017, "hand": 0.0, "thigh": 0.013, "calf": 0.010, "foot": 0.009},
    "combat": {"torso": 0.026, "neck": 0.015, "head": 0.0, "uarm": 0.022, "larm": 0.020, "hand": 0.004, "thigh": 0.022, "calf": 0.020, "foot": 0.012},
}
BOOT_TOP = 0.27  # the combat boots' tops (pack z)
SMOOTH = {"coat": 8, "combat": 6}  # rounds of smoothing (washing out the body's muscles under the cloth)


def garment(body, style):
    """A copy of the base body (in its rest pose, before the arms come down) made into the uniform's cloth."""
    g = body.copy()
    g.data = body.data.copy()
    g.name = f"Uniform_{style}"
    bpy.context.scene.collection.objects.link(g)
    me = g.data
    W = weights(g)
    P = np.array([v.co[:] for v in me.vertices])
    gi = {n: i for i, n in enumerate(GROUPS)}
    head = W[:, gi["head"]] + W[:, gi["neck"]] * (P[:, 2] > 1.565)
    hand = W[:, gi["hand"]]
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    gone = [f for f in bm.faces if any(head[v.index] > 0.3 or (style == "coat" and hand[v.index] > 0.6) for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # (Cloth does not show every muscle: the surface smoothed (each vertex toward its neighbours; the shrink made up in
    # the standoff) where cloth hangs loose — the chest,
    # back and belly, the arms and legs — not on the hands; the feet more, into shoes and boots.)
    bm.verts.ensure_lookup_table()
    deform = bm.verts.layers.deform.active
    names = {g.index: group_of(g.name) for g in g.vertex_groups}
    loose, feet = [], []
    for v in bm.verts:
        w = {}
        for gi_, wt in v[deform].items():
            k = names.get(gi_)
            w[k] = w.get(k, 0) + wt
        tight = w.get("hand", 0) + w.get("head", 0) + w.get("neck", 0)
        if tight < 0.05 and not v.is_boundary:
            (feet if w.get("foot", 0) > 0.3 else loose).append(v)
    for _ in range(SMOOTH[style]):
        bmesh.ops.smooth_vert(bm, verts=loose, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    # (The toes run together into a shoe's or a boot's toe cap.)
    for _ in range(14):
        bmesh.ops.smooth_vert(bm, verts=feet, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()
    # (Its own uvs, squeezed into the atlas's lower part; one picture, named for the game.)
    uv = me.uv_layers.active
    a = np.empty(len(me.loops) * 2)
    uv.data.foreach_get("uv", a)
    a = a.reshape(-1, 2)
    a[:, 1] *= ATLAS
    uv.data.foreach_set("uv", a.ravel())
    for i in reversed(range(len(me.uv_layers))):
        if me.uv_layers[i] != uv:
            me.uv_layers.remove(me.uv_layers[i])
    me.materials.clear()
    mat = bpy.data.materials.get("tex:" + style) or bpy.data.materials.new("tex:" + style)
    me.materials.append(mat)
    # Pushed out along its normals.
    W = weights(g)
    P = np.array([v.co[:] for v in me.vertices])
    me.update()
    N = np.array([v.normal[:] for v in me.vertices])
    off = W @ np.array([STANDOFF[style][k] for k in GROUPS])
    off += 0.004 * (1 - W[:, gi["hand"]] - W[:, gi["foot"]] - W[:, gi["neck"]])  # (what the smoothing took)
    s = np.abs(P[:, 0])
    arm = W[:, gi["uarm"]] + W[:, gi["larm"]] + W[:, gi["hand"]]
    if style == "coat":
        off += 0.012 * step(0.575, 0.6, s) * step(0.3, 0.6, arm)  # the turned-back cuffs
        off += 0.006 * step(0.62, 0.52, P[:, 2]) * step(0.4, 0.5, P[:, 2]) * W[:, gi["calf"]]  # the gaiters' tops
    else:
        bl = step(BOOT_TOP - 0.005, BOOT_TOP + 0.03, P[:, 2]) * step(BOOT_TOP + 0.12, BOOT_TOP + 0.05, P[:, 2])
        off += 0.024 * bl * (W[:, gi["calf"]] + W[:, gi["thigh"]])  # the trousers bloused over the boots
        boot = step(BOOT_TOP + 0.005, BOOT_TOP - 0.01, P[:, 2])
        off = off * (1 - boot) + (0.012 + 0.002 * step(0.12, 0.02, P[:, 2])) * boot
        off += 0.008 * step(0.6, 0.66, s) * step(0.3, 0.6, arm) * (1 - W[:, gi["hand"]])  # sleeve cuffs
    # (Cloth hangs in soft folds, more where it bunches: elbows, knees, the small of the back.)
    cloth = 1 - W[:, gi["hand"]] - W[:, gi["foot"]]
    if style == "combat":
        cloth = cloth * (1 - step(BOOT_TOP + 0.005, BOOT_TOP - 0.01, P[:, 2]))
    folds = fbm(P * 14, 3, 7) - 0.5
    bunch = 1 + step(0.06, 0.0, np.abs(s - 0.46)) * arm + step(0.06, 0.0, np.abs(P[:, 2] - 0.52)) * (W[:, gi["thigh"]] + W[:, gi["calf"]])
    off += 0.006 * folds * cloth * bunch
    for v, d, n in zip(me.vertices, off, N):
        v.co = (v.co[0] + n[0] * d, v.co[1] + n[1] * d, v.co[2] + n[2] * d)
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    return g


def girth(objs, z, band=0.012):
    """The middle and half-widths (x, y) of the given meshes' vertices at height z (world, pack metres)."""
    pts = []
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            if abs(p.z - z) < band and abs(p.x) < 0.3:
                pts.append((p.x, p.y))
    p = np.array(pts)
    lo, hi = p.min(0), p.max(0)
    return (lo + hi) / 2, (hi - lo) / 2


def tails(garm, new_mesh):
    """
    The coat's skirts: an open-fronted shell from the waist to the knee, flaring, with its lining inside (one picture,
    the top fifth of the atlas: the outside on its left half, the lining on its right). Its vertices follow the hips
    and, lower down, the thigh on their side, so it swings with the legs and parts at the back vent.
    """
    top, bottom = 1.06, 0.52
    rings, n = 11, 40
    gap = math.radians(34)  # half the opening at the front (-y)
    a0, a1 = -math.pi / 2 + gap, 1.5 * math.pi - gap
    centre, half = girth([garm], top)
    V, F, U = [], [], []
    for layer in (0, 1):
        for r in range(rings):
            t = r / (rings - 1)
            z = top + (bottom - top) * t
            c, h = girth([garm], z) if z > 0.62 else (centre, half)
            rx = max(half[0] + 0.012, h[0] + 0.016) + 0.07 * t**1.3 - 0.004 * layer
            ry = max(half[1] + 0.012, h[1] + 0.016) + 0.05 * t**1.3 - 0.004 * layer
            cx, cy = centre[0], (centre[1] + c[1]) / 2 if z > 0.62 else centre[1]
            for i in range(n + 1):
                a = a0 + (a1 - a0) * i / n
                V.append((cx + rx * math.cos(a), cy + ry * math.sin(a), z))
                U.append((0.5 * i / n + 0.5 * layer, ATLAS + (1 - ATLAS) * (1 - t) * 0.999))
        base = layer * rings * (n + 1)
        for r in range(rings - 1):
            for i in range(n):
                q = (base + r * (n + 1) + i, base + r * (n + 1) + i + 1, base + (r + 1) * (n + 1) + i + 1, base + (r + 1) * (n + 1) + i)
                F.append(q if layer else q[::-1])

    def gw(co):
        low = float(step(top - 0.12, bottom + 0.1, co.z)) * 0.85
        left = float(1 / (1 + math.exp(-co.x / 0.03)))
        out = [("pelvis", 1 - low)]
        if low > 0:
            out += [("thigh_l", low * left), ("thigh_r", low * (1 - left))]
        return out

    o = new_mesh("CoatTails", V, F, gw, "coat", recalc=False)
    me = o.data
    me.materials.clear()
    me.materials.append(bpy.data.materials.get("tex:coat") or bpy.data.materials.new("tex:coat"))
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            uv.data[li].uv = U[me.loops[li].vertex_index]
    return o


# ─────────────── painting ───────────────


def raster(o, size, feats):
    """The mesh's triangles drawn in uv space (`size` square, row 0 at v = 0): per-vertex features interpolated."""
    me = o.data
    me.calc_loop_triangles()
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2) * size
    lv = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("loops", tris)
    tris = tris.reshape(-1, 3)
    C = feats.shape[1]
    out = np.zeros((size, size, C), dtype=np.float32)
    mask = np.zeros((size, size), dtype=bool)
    for t in tris:
        p = uv[t]
        x0, y0 = np.floor(p.min(0)).astype(int)
        x1, y1 = np.ceil(p.max(0)).astype(int) + 1
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size), min(y1, size)
        if x1 <= x0 or y1 <= y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        a, b, c = p
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        l1 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        l2 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        l3 = 1 - l1 - l2
        inside = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
        if not inside.any():
            continue
        f = feats[lv[t]]
        val = l1[..., None] * f[0] + l2[..., None] * f[1] + l3[..., None] * f[2]
        sub = out[y0:y1, x0:x1]
        sub[inside] = val[inside]
        mask[y0:y1, x0:x1] |= inside
    # (Grown past the islands' edges, so that filtering never reaches the empty gutter.)
    for _ in range(8):
        grow = np.zeros_like(out)
        cnt = np.zeros(mask.shape)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            m = np.roll(np.roll(mask, dx, 1), dy, 0)
            grow += np.roll(np.roll(out, dx, 1), dy, 0) * m[..., None]
            cnt += m
        new = (~mask) & (cnt > 0)
        out[new] = grow[new] / cnt[new][:, None]
        mask |= new
    return out, mask


def hexrgb(c):
    return np.array([int(c[i : i + 2], 16) / 255 for i in (1, 3, 5)])


def mix(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return a * (1 - t) + b * t


def dot(d, centre, radius):
    """A round button (0..1 coverage) and its dome's shading at the texel-to-centre distance d."""
    cover = step(radius, radius * 0.75, d)
    dome = np.sqrt(np.clip(1 - (d / radius) ** 2, 0, 1))
    return cover, dome


def buttons(P, pts, radius):
    """Coverage and shading of brass buttons at 3D points pts (the nearest one for each texel)."""
    best = np.full(P.shape[:-1], 9.0)
    for q in pts:
        best = np.minimum(best, np.linalg.norm(P - np.asarray(q), axis=-1))
    return dot(best, None, radius)


def brass(cover, dome, base):
    metal = mix(np.array([0.45, 0.32, 0.1]), np.array([0.98, 0.86, 0.5]), dome)
    rim = step(0.2, 0.05, dome) * cover
    return mix(mix(base, metal, cover), np.array([0.25, 0.17, 0.06]), rim * 0.7)


def paint_coat(F, side, plain=False):
    """The long coat (the body part of the atlas), for one side. `plain`: only its broad areas (for the vertex colours
    of the processor's thinned figure, where lapels, piping and buttons would only smear)."""
    P, N, W = F[..., 0:3], F[..., 3:6], F[..., 6:]
    g = {n: W[..., i] for i, n in enumerate(GROUPS)}
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    s = np.abs(x)
    coat = hexrgb(SIDES[side]) * 0.86
    facing = hexrgb(SIDES[1 - side]) * 0.7 if side == 0 else hexrgb(SIDES[0]) * 0.92
    cream = np.array([0.88, 0.84, 0.72])
    white = np.array([0.9, 0.89, 0.84])
    black = np.array([0.07, 0.07, 0.075])
    wool = 0.9 + 0.1 * fbm(P * 220, 2, 3) + 0.06 * (fbm(P * 18, 3, 5) - 0.5)
    arm = g["uarm"] + g["larm"]
    torso = g["torso"] + g["neck"]
    front = step(-0.25, -0.55, N[..., 1])
    col = coat * wool[..., None]
    # Folds: darker in the creases at the elbows and the small of the back.
    crease = 0.5 + 0.5 * np.sin(z * 90 + fbm(P * 8, 2, 9) * 6)
    col *= (1 - 0.12 * crease * step(0.06, 0.0, np.abs(s - 0.46)) * arm)[..., None]
    # The waistcoat and the lapels down the front, the collar.
    lapw = 0.06 + 0.03 * step(1.15, 1.45, z)
    chest = torso * front * step(1.08, 1.12, z) * step(1.5, 1.47, z)
    waistc = chest * step(0.04, 0.032, s)
    lapel = chest * step(0.032, 0.04, s) * step(lapw + 0.008, lapw, s)
    if plain:
        lapel, waistc = chest * step(0.1, 0.08, s), chest * 0
    col = mix(col, facing * wool[..., None], lapel)
    col = mix(col, cream * (0.92 + 0.08 * wool)[..., None], waistc)
    edge = chest * step(0.006, 0.0, np.abs(s - lapw)) + chest * step(0.004, 0.0, np.abs(s - 0.036))
    col *= (1 - 0.35 * np.clip(edge, 0, 1))[..., None]
    # (Below the lapels the coat is cut away: the waistcoat's skirts, then the breeches.)
    below = torso * front * step(1.12, 1.09, z) * step(0.13, 0.11, s) * step(1.0, 1.02, z)
    col = mix(col, cream * wool[..., None], below)
    collar = np.clip(g["neck"] + torso * step(1.5, 1.53, z), 0, 1) * step(0.11, 0.09, s)
    col = mix(col, facing * wool[..., None], collar)
    # Breeches over the hips and thighs, gaiters below the knee, shoes.
    hips = torso * step(1.0, 0.97, z)
    breeches = step(0.35, 0.55, g["thigh"] + hips) * step(0.47, 0.5, z)
    col = mix(col, white * (0.92 + 0.08 * wool)[..., None], breeches)
    knee = step(0.012, 0.0, np.abs(z - 0.5)) * (g["thigh"] + g["calf"])
    col *= (1 - 0.3 * knee)[..., None]
    gaiter = step(0.35, 0.55, g["calf"] + g["foot"] * step(0.07, 0.1, z)) * step(0.5, 0.47, z)
    col = mix(col, black * (0.85 + 0.3 * wool)[..., None], gaiter)
    shoe = step(0.35, 0.55, g["foot"]) * step(0.1, 0.07, z)
    leather = black + 0.12 * step(0.5, 0.95, N[..., 2])[..., None]
    col = mix(col, leather, shoe)
    # Cuffs (the facing colour, a row of buttons on top) and the shoulder seam.
    cuff = step(0.35, 0.55, arm) * step(0.575, 0.59, s)
    col = mix(col, facing * wool[..., None], cuff)
    col *= (1 - 0.35 * arm * step(0.005, 0.0, np.abs(s - 0.59)))[..., None]
    col *= (1 - 0.3 * step(0.006, 0.0, np.abs(s - 0.215)) * step(1.3, 1.36, z))[..., None]
    # Seams down the back and the sides.
    back = step(0.2, 0.5, N[..., 1]) * torso
    col *= (1 - 0.3 * back * step(0.004, 0.0, s))[..., None]
    if plain:
        return col
    # Brass buttons: down the lapels, on the cuffs; small pewter ones on the waistcoat and the gaiters.
    lap_pts = [(sx * 0.072, -0.2, zz) for sx in (-1, 1) for zz in np.arange(1.19, 1.46, 0.05)]
    lap_pts = [(px, None, pz) for px, _, pz in lap_pts]
    d = np.full(z.shape, 9.0)
    for px, _, pz in lap_pts:
        d = np.minimum(d, np.hypot(x - px, z - pz))
    cv, dm = dot(d, None, 0.011)
    col = brass(cv * chest, dm, col)
    d = np.full(z.shape, 9.0)
    for zz in np.arange(1.13, 1.47, 0.035):
        d = np.minimum(d, np.hypot(x, z - zz))
    cv, dm = dot(d, None, 0.0065)
    col = brass(cv * waistc, dm * 0.6, col)
    d = np.full(z.shape, 9.0)
    for xx in (0.6, 0.635, 0.67):
        d = np.minimum(d, np.hypot(s - xx, y - 0.065))
    top = step(0.3, 0.7, N[..., 2])
    cv, dm = dot(d, None, 0.009)
    col = brass(cv * cuff * top, dm, col)
    outer = step(0.3, 0.7, N[..., 0] * np.sign(x))
    d = np.full(z.shape, 9.0)
    for zz in np.arange(0.14, 0.47, 0.045):
        d = np.minimum(d, np.hypot(z - zz, y - 0.085))
    cv, dm = dot(d, None, 0.006)
    col = mix(col, np.array([0.55, 0.55, 0.58]) * (0.6 + 0.4 * dm)[..., None], cv * gaiter * outer)
    buckle = shoe * step(0.4, 0.7, N[..., 2]) * step(0.018, 0.012, np.abs(y + 0.005)) * step(0.022, 0.015, np.abs(s - 0.1)) * step(0.05, 0.06, z)
    col = mix(col, np.array([0.8, 0.7, 0.4]), buckle)
    return col


def paint_tails(size, side, plain=False):
    """The coat's skirts (outside, then lining): the coat colour with turnbacks in the facing colour, a hem, pocket
    flaps with buttons, the back vent."""
    h = int(size * (1 - ATLAS)) + 2
    v, u = np.meshgrid(np.linspace(1, 0, h), np.linspace(0, 1, size), indexing="ij")  # v: 1 at the waist
    coat = hexrgb(SIDES[side]) * 0.86
    facing = hexrgb(SIDES[1 - side]) * 0.7 if side == 0 else hexrgb(SIDES[0]) * 0.92
    P = np.stack([u * 3, v * 1.2, np.zeros_like(u)], -1)
    wool = 0.9 + 0.1 * vnoise(P * 60, 4) + 0.06 * (fbm(P * 4, 3, 6) - 0.5)
    outside = u < 0.5
    w = np.where(outside, u * 2, u * 2 - 1)  # 0..1 round from one front edge to the other
    depth = 1 - v  # 0 at the waist, 1 at the hem
    col = coat * wool[..., None]
    # Turnbacks: wedges of the facing colour along both front edges and either side of the back vent, widening down.
    wedge = 0.02 + 0.07 * depth
    turn = step(wedge + 0.006, wedge, w) + step(1 - wedge - 0.006, 1 - wedge, w) + step(wedge * 0.8 + 0.006, wedge * 0.8, np.abs(w - 0.5))
    turn = np.clip(turn, 0, 1) * step(0.15, 0.3, depth) * (0 if plain else 1)
    col = mix(col, facing * wool[..., None], turn)
    vent = step(0.004, 0.0, np.abs(w - 0.5)) * step(0.3, 0.32, depth)
    col *= (1 - 0.45 * vent)[..., None]
    # Folds hanging down.
    fold = 0.5 + 0.5 * np.sin(w * 2 * math.pi * 9 + vnoise(P * 3, 8) * 3)
    col *= (1 - 0.14 * fold * depth)[..., None]
    # Pocket flaps on the hips, buttons on them and at the vent's top.
    for c in (() if plain else (0.22, 0.78)):
        flap = step(0.07, 0.065, np.abs(w - c)) * step(0.05, 0.045, np.abs(depth - 0.22))
        col = mix(col, coat * 0.8 * wool[..., None], flap)
        col *= (1 - 0.4 * flap * step(0.004, 0.0, np.abs(depth - 0.265)))[..., None]
        for k in (-0.04, 0.0, 0.04):
            d = np.hypot((w - c - k) * 1.6, (depth - 0.22) * 0.55)
            cv, dm = dot(d, None, 0.012)
            col = brass(cv, dm, col)
    for dd in (() if plain else (0.05, 0.16, 0.27)):
        d = np.hypot((w - 0.5 - 0.012) * 1.6, (depth - dd) * 0.55)
        cv, dm = dot(d, None, 0.012)
        col = brass(cv * outside, dm, col)
    hem = step(0.97, 0.985, depth)
    col *= (1 - 0.35 * hem)[..., None]
    col = np.where(outside[..., None], col, facing * (0.85 + 0.15 * wool)[..., None])
    return col


def camo(P):
    """An original four-colour woodland camouflage: khaki ground, olive and brown blotches, dark streaks."""
    q = P * 4.4
    warp = np.stack([fbm(q + 11, 2, 40), fbm(q + 23, 2, 41), fbm(q + 37, 2, 42)], -1) - 0.5
    q = q + warp * 1.4
    n1, n2, n3 = fbm(q, 3, 50), fbm(q * 1.3 + 5, 3, 60), fbm(q * 1.9 + 9, 3, 70)
    k = np.array([0.55, 0.52, 0.39])
    col = np.broadcast_to(k, P.shape).copy()
    col = mix(col, np.array([0.35, 0.38, 0.22]), step(0.47, 0.49, n1))
    col = mix(col, np.array([0.43, 0.32, 0.2]), step(0.53, 0.55, n2) * step(0.5, 0.47, n1))
    col = mix(col, np.array([0.15, 0.16, 0.12]), step(0.58, 0.6, n3) * step(0.45, 0.48, n1 * 0.5 + n2 * 0.5))
    return col


def paint_combat(F):
    P, N, W = F[..., 0:3], F[..., 3:6], F[..., 6:]
    g = {n: W[..., i] for i, n in enumerate(GROUPS)}
    x, y, z = P[..., 0], P[..., 1], P[..., 2]
    s = np.abs(x)
    weave = 0.93 + 0.07 * fbm(P * 260, 2, 3)
    col = camo(P) * weave[..., None]
    arm = g["uarm"] + g["larm"]
    torso = g["torso"] + g["neck"]
    front = step(-0.25, -0.55, N[..., 1])
    outer = step(0.3, 0.7, N[..., 0] * np.sign(x))
    top = step(0.3, 0.7, N[..., 2])
    seam = lambda m: (1 - 0.35 * np.clip(m, 0, 1))[..., None]
    # Creases at the elbows and the knees.
    crease = 0.5 + 0.5 * np.sin(z * 120 + fbm(P * 9, 2, 9) * 6)
    col *= (1 - 0.14 * crease * step(0.06, 0.0, np.abs(s - 0.46)) * arm)[..., None]
    crease = 0.5 + 0.5 * np.sin(x * 140 * np.sign(x) + fbm(P * 9, 2, 19) * 6)
    col *= (1 - 0.14 * crease * step(0.07, 0.0, np.abs(z - 0.52)) * (g["thigh"] + g["calf"]))[..., None]
    # The jacket: a placket with buttons down the front, chest pockets with flaps, sleeve pockets, cuffs, shoulder seams,
    # a hem over the hips, a collar.
    placket = torso * front * step(0.012, 0.009, s) * step(1.0, 1.02, z)
    col *= seam(placket * 0.6 + torso * front * step(0.002, 0.0, np.abs(s - 0.011)))
    for zz in np.arange(1.06, 1.5, 0.07):
        cv, dm = dot(np.hypot(x, z - zz), None, 0.006)
        col = mix(col, np.array([0.12, 0.12, 0.1]) * (0.7 + 0.5 * dm)[..., None], cv * torso * front)
    for sx in (-1, 1):
        pk = torso * front * step(0.06, 0.055, np.abs(x - sx * 0.095)) * step(1.25, 1.255, z) * step(1.42, 1.415, z)
        col *= seam(torso * front * step(0.06, 0.055, np.abs(x - sx * 0.095)) * step(1.25, 1.255, z) * step(1.42, 1.415, z) * (1 - step(0.052, 0.046, np.abs(x - sx * 0.095)) * step(1.258, 1.265, z) * step(1.41, 1.405, z)))
        flap = torso * front * step(0.062, 0.057, np.abs(x - sx * 0.095)) * step(1.38, 1.385, z) * step(1.44, 1.435, z)
        col = mix(col, col * 0.82, flap)
        col *= seam(flap * step(0.003, 0.0, np.abs(z - 1.382)))
        cv, dm = dot(np.hypot(x - sx * 0.095, z - 1.395), None, 0.006)
        col = mix(col, np.array([0.12, 0.12, 0.1]) * (0.7 + 0.5 * dm)[..., None], cv * front * torso)
    sp = arm * top * step(0.05, 0.045, np.abs(s - 0.33)) * step(0.045, 0.04, np.abs(y - 0.065))
    col *= seam(sp * (1 - step(0.04, 0.035, np.abs(s - 0.33)) * step(0.035, 0.03, np.abs(y - 0.065))))
    col *= seam(arm * step(0.004, 0.0, np.abs(s - 0.655)))
    col *= seam(step(0.005, 0.0, np.abs(s - 0.215)) * step(1.28, 1.34, z))
    col *= seam(torso * step(0.004, 0.0, np.abs(z - 0.99)))
    collar = np.clip(g["neck"] + torso * step(1.5, 1.53, z), 0, 1)
    col *= seam(collar * step(0.004, 0.0, np.abs(z - 1.535)))
    # A webbing belt under the hem.
    belt = torso * step(0.955, 0.96, z) * step(0.985, 0.98, z)
    col = mix(col, np.array([0.3, 0.3, 0.22]) * weave[..., None], belt)
    buckle = belt * front * step(0.03, 0.025, s)
    col = mix(col, np.array([0.18, 0.18, 0.16]), buckle)
    # The trousers: cargo pockets on the thighs' outsides, a seam down the outside.
    tz = 0.7
    cargo = g["thigh"] * outer * step(0.08, 0.075, np.abs(z - tz)) * step(0.06, 0.055, np.abs(y - 0.03))
    col *= seam(cargo * (1 - step(0.072, 0.068, np.abs(z - tz)) * step(0.052, 0.048, np.abs(y - 0.03))))
    flapc = g["thigh"] * outer * step(0.065, 0.06, np.abs(y - 0.03)) * step(0.03, 0.025, np.abs(z - (tz + 0.06)))
    col = mix(col, col * 0.82, flapc)
    col *= seam((g["thigh"] + g["calf"]) * step(0.004, 0.0, np.abs(y - 0.06)) * outer * step(0.3, 0.32, z))
    # Boots: dark leather, laced up the front; gloves.
    boot = step(0.3, 0.5, g["calf"] + g["foot"]) * step(BOOT_TOP + 0.005, BOOT_TOP - 0.005, z)
    leather = np.array([0.13, 0.11, 0.09]) * (0.85 + 0.3 * fbm(P * 40, 3, 21))[..., None]
    leather = leather + 0.08 * step(0.5, 0.95, N[..., 2])[..., None]
    col = mix(col, leather, np.clip(boot, 0, 1))
    lace = boot * front * step(0.018, 0.012, np.abs(x - np.sign(x) * 0.09)) * (0.5 + 0.5 * np.sign(np.sin(z * 260)))
    col = mix(col, np.array([0.05, 0.05, 0.05]), lace * step(0.08, 0.1, z))
    sole = step(0.025, 0.018, z) * g["foot"]
    col = mix(col, np.array([0.05, 0.05, 0.05]), sole)
    glove = np.clip(g["hand"] * 1.4, 0, 1) * step(0.66, 0.68, s)
    gl = np.array([0.2, 0.21, 0.17]) * (0.8 + 0.35 * fbm(P * 60, 2, 31))[..., None]
    col = mix(col, gl, glove)
    return col


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import people as Pp

    work = Pp.WORK
    size = 1024
    for style in ("coat", "combat"):
        Pp.reset()
        objs = Pp.imp(Pp.BODY)
        body = next(o for o in objs if o.type == "MESH" and o.name.startswith("SuperHero"))
        g = garment(body, style)
        me = g.data
        # (Painted where the cloth itself lies, in the rest pose.)
        W = weights(g)
        P = np.array([v.co[:] for v in me.vertices])
        me.update()
        N = np.array([v.normal[:] for v in me.vertices])
        feats = np.concatenate([P, N, W], 1).astype(np.float32)
        F, mask = raster(g, size, feats)
        if style == "coat":
            for side in (0, 1):
                for plain in (False, True):
                    col = paint_coat(F, side, plain)
                    rows = int(size * ATLAS)
                    tail = paint_tails(size, side, plain)
                    col[rows:] = tail[: size - rows][::-1][: size - rows]
                    save(col, os.path.join(work, f"coat{side}{'p' if plain else ''}.png"))
        else:
            col = paint_combat(F)
            save(col, os.path.join(work, "combat.png"))
        print("PAINTED", style, flush=True)


def save(col, path):
    """Row 0 is v = 0 (Blender's own order for an image's pixels)."""
    h, w, _ = col.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = np.clip(col, 0, 1)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


if __name__ == "__main__":
    main()
