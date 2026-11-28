"""
The woolly mammoth of 시대 전쟁 (b0.glb), sculpted in Blender (see ../README.md).

Its skin is modelled as one body (Blender's metaballs: a domed skull, a hump over the shoulders, a back sloping to the
rump, pillar legs on round pads, a trunk that tapers to a fingered tip, small ears, a short tail), wrinkled and
grooved; long hair grows on it as clumped locks of fine strands (tens of thousands, curving under their weight, longest
on the flanks, the throat and the belly where they hang in a ragged fringe, shorter on the legs, a tuft on the crown and
at the tail, a little on the trunk), with long spiral tusks and toenails. The game draws a thinner shell: the skin and
the locks melted into one shaggy surface (voxel remeshing) and thinned, onto which Cycles bakes the hair's colour, its
relief (a normal map) and the shade the locks throw on one another. Its vertices carry the joints that move them
(the body, the head, the trunk, the ears, four legs and their knees, the tail); the joints' places go with it.

    blender -b --python mammoth.py -- <out dir> <work dir>

writes <out dir>/b0.glb (the shell wearing its picture, the eyes, the blanket) and <out dir>/tex/mammoth.webp, mammoth_n.webp (and preview pictures in <work dir>
with PREVIEW=1). `MAMMOTH_TEX` sets the pictures' size (1024), `MAMMOTH_TRIS` the shell's triangles (9000),
`BAKE_SAMPLES` the shade's samples (32).
"""
import math, os, sys, json, struct

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lib import g2b, b2g, smoothstep, norm, fbm, vnoise, reset  # noqa

ARGV = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = ARGV[0] if ARGV else "/tmp/mammoth-out"
WORK = ARGV[1] if len(ARGV) > 1 else "/tmp/mammoth-work"
STAGE = os.environ.get("STAGE", "all")
TEX = int(os.environ.get("MAMMOTH_TEX", "1024"))
TRIS = int(os.environ.get("MAMMOTH_TRIS", "9000"))
SAMPLES = int(os.environ.get("BAKE_SAMPLES", "32"))
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)
RNG = np.random.default_rng(11)

# ─────────────── the joints (the game's frame: x forward, y up, z across) ───────────────
BONES = ["beast", "head", "strike", "flap0", "flap1", "leg0", "knee0", "leg1", "knee1", "leg2", "knee2", "leg3", "knee3", "tail"]
BI = {n: i for i, n in enumerate(BONES)}
LEGS = [(0.47, -0.27), (0.47, 0.27), (-0.5, -0.27), (-0.5, 0.27)]
HIP_Y = 1.0
KNEE_Y = 0.5
JOINTS = {
    "head": (0.62, 1.52, 0.0),
    "strike": (1.02, 1.36, 0.0),
    "flap0": (0.7, 1.74, -0.22),
    "flap1": (0.7, 1.74, 0.22),
    "tail": (-0.9, 1.42, 0.0),
    "seat": (-0.12, 1.9, 0.0),
}
for i, (x, z) in enumerate(LEGS):
    JOINTS[f"leg{i}"] = (x, HIP_Y, z)
    JOINTS[f"knee{i}"] = (x, KNEE_Y, z)

# The trunk's line, from its root under the eyes down, curling forward at the tip.
TRUNK = np.array([(0.99, 1.46, 0), (1.07, 1.26, 0), (1.1, 1.02, 0), (1.1, 0.8, 0), (1.12, 0.6, 0), (1.18, 0.47, 0), (1.27, 0.43, 0)])
TRUNK_R = np.array([0.13, 0.11, 0.09, 0.075, 0.062, 0.052, 0.045])


def catmull(pts, n):
    pts = np.asarray(pts, dtype=np.float64)
    P = np.vstack([pts[0] * 2 - pts[1], pts, pts[-1] * 2 - pts[-2]])
    out = []
    for i in range(1, len(P) - 2):
        for t in np.linspace(0, 1, n, endpoint=(i == len(P) - 3)):
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return np.array(out)


# ─────────────── the skin ───────────────
# Ellipsoids (centre, half-axes) in the game's frame, melted together by Blender's metaballs (each element's field
# reaches past its half-axes; `skin_object` sizes them so that one alone would be about that big).
BLOBS = [
    # The barrel: a deep chest under the hump, the belly, the haunch; the hump over the shoulders, the back sloping
    # steeply to the rump.
    ((0.32, 1.32, 0), (0.42, 0.46, 0.4)),
    ((-0.1, 1.24, 0), (0.48, 0.4, 0.42)),
    ((-0.58, 1.18, 0), (0.36, 0.34, 0.38)),
    ((0.3, 1.62, 0), (0.3, 0.22, 0.27)),
    ((-0.12, 1.48, 0), (0.4, 0.2, 0.32)),
    ((-0.55, 1.36, 0), (0.3, 0.18, 0.3)),
    # The neck, short and deep; the skull high and domed, the face, the cheeks where the tusks come out.
    ((0.64, 1.44, 0), (0.22, 0.3, 0.26)),
    ((0.84, 1.78, 0), (0.17, 0.2, 0.17)),
    ((0.9, 1.54, 0), (0.17, 0.25, 0.19)),
    ((0.95, 1.34, 0), (0.12, 0.14, 0.18)),
]
for i, (x, z) in enumerate(LEGS):
    fore = i < 2
    # Each leg a pillar from the shoulder or thigh to its round pad.
    line = catmull([(x + (0.03 if fore else -0.05), 1.12, z * 0.9), (x, 0.8, z), (x, 0.45, z), (x + 0.01, 0.2, z), (x + 0.02, 0.08, z)], 4)
    rad = np.interp(np.linspace(0, 1, len(line)), [0, 0.3, 0.6, 0.85, 1], [0.2 if fore else 0.23, 0.16, 0.14, 0.14, 0.155])
    for c, r in zip(line, rad):
        BLOBS.append((tuple(c), (r, r, r * 0.95)))
for c, r in zip(catmull(TRUNK, 4), np.interp(np.linspace(0, 1, len(catmull(TRUNK, 4))), np.linspace(0, 1, len(TRUNK_R)), TRUNK_R)):
    BLOBS.append((tuple(c), (r, r, r)))
for s in (-1, 1):
    # Small round ears, set back on the head.
    BLOBS.append(((0.7, 1.7, s * 0.21), (0.08, 0.09, 0.03)))
# The tail, short, hanging from the rump.
for c, r in zip(catmull([(-0.85, 1.4, 0), (-0.95, 1.36, 0), (-1.0, 1.22, 0), (-1.02, 1.1, 0)], 3), np.linspace(0.06, 0.03, 10)):
    BLOBS.append((tuple(c), (r, r, r)))


def skin_object():
    mb = bpy.data.metaballs.new("skin")
    mb.resolution = 0.02
    mb.render_resolution = 0.02
    mb.threshold = 0.6
    for c, r in BLOBS:
        e = mb.elements.new(type="ELLIPSOID")
        e.co = Vector(g2b(c).tolist())
        rr = max(r)
        e.radius = rr * 1.62
        e.size_x, e.size_y, e.size_z = r[0] / rr, r[2] / rr, r[1] / rr
        e.stiffness = 2.2
    o = bpy.data.objects.new("skinMB", mb)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.view_layer.objects.active
    o.name = "skin"
    # An even mesh, a little smoothed.
    rm = o.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.014
    sm = o.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.8
    sm.iterations = 6
    bpy.ops.object.modifier_apply(modifier="remesh")
    bpy.ops.object.modifier_apply(modifier="smooth")
    return o


def mesh_arrays(o):
    me = o.data
    n = len(me.vertices)
    P = np.empty(n * 3)
    me.vertices.foreach_get("co", P)
    me.calc_loop_triangles()
    N = np.empty(n * 3)
    me.vertices.foreach_get("normal", N)
    T = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", T)
    return b2g(P.reshape(-1, 3)), b2g(N.reshape(-1, 3)), T.reshape(-1, 3)


def set_points(o, Pg):
    o.data.vertices.foreach_set("co", g2b(Pg).reshape(-1).astype(np.float32))
    o.data.update()


def near_trunk(P):
    """How far along the trunk (0 its root .. 1 its tip) and how far from its line, for points."""
    line = catmull(TRUNK, 10)
    d = np.linalg.norm(P[:, None, :] - line[None, :, :], axis=2)
    j = d.argmin(1)
    return j / (len(line) - 1), d[np.arange(len(P)), j]


def sculpt_skin(o):
    """The skin's own relief: rings round the trunk, its fingered tip, wrinkles at the knees, the toes' rims."""
    P, N, _ = mesh_arrays(o)
    d = np.zeros(len(P))
    t, dist = near_trunk(P)
    on_trunk = (dist < 0.2) & (P[:, 0] > 0.98)
    # Rings along the trunk, deeper on its underside.
    ring = np.sin(t * 95) * 0.5 + 0.5
    d += np.where(on_trunk, -0.007 * ring ** 3 * (0.6 + 0.4 * smoothstep(0.2, -0.6, N[:, 1])), 0)
    # The two fingers at the tip: one above and forward, one below (the mammoth's own).
    tip = TRUNK[-1]
    for c, r, h in (((tip[0] + 0.05, tip[1] + 0.035, 0), 0.03, 0.025), ((tip[0] + 0.02, tip[1] - 0.035, 0), 0.03, 0.012)):
        e = np.linalg.norm(P - np.array(c), axis=1)
        d += h * np.exp(-((e / r) ** 2))
    # Wrinkles across the legs' joints and fine skin noise everywhere.
    for x, z in LEGS:
        for y in (KNEE_Y, 0.22):
            e = np.hypot(P[:, 0] - x, P[:, 2] - z)
            band = np.exp(-(((P[:, 1] - y) / 0.06) ** 2)) * (e < 0.3)
            d += -0.004 * band * (np.sin(P[:, 1] * 160) * 0.5 + 0.5)
    d += 0.002 * fbm(P * 40, 3, 5)
    Q = P + N * d[:, None]
    # The soles flat on the ground.
    Q[:, 1] = np.maximum(Q[:, 1], 0.0)
    set_points(o, Q)


def tusk_shape(s):
    """A tusk: out of the cheek down and forward, sweeping out to the side and up, its tip turning back in."""
    ctrl = np.array([(0.96, 1.36, 0.11), (1.08, 1.12, 0.17), (1.26, 0.92, 0.3), (1.48, 0.95, 0.44), (1.62, 1.16, 0.44), (1.6, 1.38, 0.3), (1.5, 1.5, 0.16)])
    ctrl[:, 2] *= s
    path = catmull(ctrl, 8)
    t = np.linspace(0, 1, len(path))
    r = 0.062 * (1 - t) ** 0.7 + 0.012
    return path, r


def tube_mesh(name, path, radius, sides=12, cap=True):
    """A tube along a path (game frame) with a radius per point, as a Blender object."""
    path = np.asarray(path)
    n = len(path)
    tang = norm(np.gradient(path, axis=0))
    ref = np.array([0, 0, 1.0])
    verts, faces = [], []
    prev = None
    for i in range(n):
        tt = tang[i]
        a = np.cross(tt, ref if abs(tt @ ref) < 0.9 else np.array([0, 1.0, 0]))
        a = a / np.linalg.norm(a)
        b = np.cross(tt, a)
        if prev is not None and (a @ prev) < 0:
            a, b = -a, -b
        prev = a
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            verts.append(path[i] + radius[i] * (a * math.cos(ang) + b * math.sin(ang)))
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            faces.append((i * sides + k, i * sides + k2, (i + 1) * sides + k2, (i + 1) * sides + k))
    if cap:
        verts.append(path[-1] + tang[-1] * radius[-1] * 0.8)
        tip = len(verts) - 1
        for k in range(sides):
            faces.append(((n - 1) * sides + k, (n - 1) * sides + (k + 1) % sides, tip))
    me = bpy.data.meshes.new(name)
    me.from_pydata(g2b(np.array(verts)).tolist(), [], faces)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def make_tusks():
    out = []
    for s in (-1, 1):
        path, r = tusk_shape(s)
        out.append(tube_mesh(f"tusk{s}", path, r, sides=14))
    return out


def make_nails():
    """Five broad toenails round the front of each fore foot, four on the hind (as the mammoth's)."""
    out = []
    for i, (x, z) in enumerate(LEGS):
        k = 5 if i < 2 else 4
        for j in range(k):
            a = (j - (k - 1) / 2) * 0.42
            c = np.array([x + 0.02 + 0.16 * math.cos(a), 0.045, z + 0.155 * math.sin(a)])
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1)
            o = bpy.context.active_object
            o.name = f"nail{i}{j}"
            o.scale = (0.035, 0.035, 0.032)
            o.rotation_euler = (0, 0, -a)
            o.location = Vector(g2b(c).tolist())
            out.append(o)
    return out


def material(name, color=None, attr=None, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    if attr:
        a = nt.nodes.new("ShaderNodeVertexColor")
        a.layer_name = attr
        nt.links.new(a.outputs["Color"], bsdf.inputs["Base Color"])
    elif color:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    return m


def paint_vertices(o, colors, name="col"):
    """Colours per vertex (linear RGB, game order) into a point colour attribute."""
    me = o.data
    if name in me.color_attributes:
        me.color_attributes.remove(me.color_attributes[name])
    a = me.color_attributes.new(name, "FLOAT_COLOR", "POINT")
    c = np.ones((len(me.vertices), 4), dtype=np.float32)
    c[:, :3] = colors
    a.data.foreach_set("color", c.reshape(-1))
    return a


def preview(path, objs, eye=(3.6, 1.9, 3.4), look=(0.15, 1.0, 0.0), size=(900, 700), samples=16):
    scene = bpy.context.scene
    for o in scene.objects:
        if o.type == "MESH":
            o.hide_render = o not in objs and o.name != "ground"
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    world = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.62, 0.72, 0.85, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    cam_data = bpy.data.cameras.get("cam") or bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.get("cam") or bpy.data.objects.new("cam", cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    cam.location = tuple(g2b(eye))
    d = g2b(np.asarray(look)) - g2b(np.asarray(eye))
    cam.rotation_euler = Vector(d.tolist()).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    if not bpy.data.objects.get("sun"):
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 3.5
        sun.angle = 0.1
        so = bpy.data.objects.new("sun", sun)
        so.rotation_euler = (math.radians(45), math.radians(5), math.radians(40))
        scene.collection.objects.link(so)
        ground = bpy.data.meshes.new("ground")
        ground.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new("ground", ground)
        ground.materials.append(material("groundm", (0.2, 0.3, 0.12)))
        scene.collection.objects.link(g)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ─────────────── the coat ───────────────
EYES = []  # where the eyes sit on the skin (set by `place_eyes`)


def place_eyes(skin):
    bvh = BVHTree.FromObject(skin, bpy.context.evaluated_depsgraph_get())
    for s in (-1, 1):
        loc, nrm, _, _ = bvh.find_nearest(Vector(g2b((0.93, 1.6, s * 0.2)).tolist()))
        EYES.append(b2g(np.array(loc)))
FRINGE = 0.46  # the lowest the body's hair hangs (a little above the knees' wrinkles)


def sample_surface(P, N, T, count):
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    idx = RNG.choice(len(T), count, p=area / area.sum())
    r1, r2 = RNG.random(count), RNG.random(count)
    s = np.sqrt(r1)
    u, v, w = 1 - s, s * (1 - r2), s * r2
    pos = a[idx] * u[:, None] + b[idx] * v[:, None] + c[idx] * w[:, None]
    nrm = norm(N[T[idx, 0]] * u[:, None] + N[T[idx, 1]] * v[:, None] + N[T[idx, 2]] * w[:, None])
    return pos, nrm


def coat(P, N):
    """The hair's length where it grows (0: none), and how thickly (0..1)."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ny = N[:, 1]
    # The body: short along the top of the back, longer down the flanks, longest where the skin faces the ground.
    L = 0.09 + 0.34 * smoothstep(0.6, -0.5, ny) + 0.05 * smoothstep(0.0, 0.5, x) * smoothstep(-0.2, 0.6, ny)
    # The hump and shoulders shaggier than the rump.
    L += 0.06 * smoothstep(-0.2, 0.4, x) * smoothstep(1.2, 1.5, y)
    dens = np.ones(len(P))
    # Legs: hanging hair to below the knees, the feet bare (their pads and toenails show).
    leg = np.zeros(len(P), dtype=bool)
    for lx, lz in LEGS:
        leg |= (np.hypot(x - lx, z - lz) < 0.27) & (y < 0.88)
    L = np.where(leg, 0.04 + 0.2 * smoothstep(0.16, 0.62, y), L)
    dens = np.where(leg & (y < 0.14), 0.0, dens)
    # The crown's tuft, the face short-haired, a long beard under the throat and chest.
    crown = smoothstep(1.62, 1.82, y) * (x > 0.62)
    L = L * (1 - crown) + 0.13 * crown
    face = smoothstep(0.86, 0.96, x) * (y > 1.12) * (y < 1.74)
    L = L * (1 - face) + 0.045 * face
    beard = smoothstep(0.48, 0.62, x) * smoothstep(1.05, 0.92, x) * smoothstep(1.55, 1.3, y) * smoothstep(0.45, -0.25, ny)
    L = np.maximum(L, 0.4 * beard)
    # The trunk: a little hair on its upper part, none towards the tip.
    t, dist = near_trunk(P)
    tr = (x > 0.97) & (dist < 0.16) & (y < 1.42)
    L = np.where(tr, 0.03 * smoothstep(0.75, 0.25, t), L)
    dens = np.where(tr, 0.35 * smoothstep(0.75, 0.25, t), dens)
    # The ears, furry; the tail short-haired with a long tuft at its end.
    for s in (-1, 1):
        ear = np.linalg.norm((P - np.array([0.7, 1.7, s * 0.21])) / np.array([0.1, 0.11, 0.07]), axis=1) < 1
        L = np.where(ear, 0.05, L)
    for e in EYES:
        L = np.where(np.linalg.norm(P - e, axis=1) < 0.055, 0.0, L)
    tail = (x < -0.84) & (y > 1.0) & (np.abs(z) < 0.13)
    L = np.where(tail, np.where(y < 1.17, 0.24, 0.05), L)
    # (The body's hair hangs no lower than the fringe.)
    body = ~leg & ~tr & ~tail
    L = np.where(body, np.minimum(L, np.maximum(y - FRINGE, 0.04) / 0.92), L)
    return L, dens


def lock_paths(roots, normals, L, bvh, S=6):
    """Each lock's line: out of the skin, bending under its weight, swept back, kept outside the skin."""
    x, y = roots[:, 0], roots[:, 1]
    down = np.array([0, -1.0, 0])
    back = np.array([-1.0, 0, 0])
    short = smoothstep(0.12, 0.04, L)
    crown = (smoothstep(1.62, 1.82, y) * (x > 0.62))[:, None]
    tuft = ((x < -0.84) & (y < 1.17))[:, None]
    d = norm(normals * (0.35 + 0.5 * short[:, None]) + down * 0.45 + back * 0.3 + RNG.normal(0, 0.12, roots.shape))
    d = norm(d * (1 - crown) + crown * norm(normals * 0.55 + np.array([-0.8, 0.05, 0]) + RNG.normal(0, 0.2, roots.shape)))
    d = np.where(tuft, norm(down + RNG.normal(0, 0.15, roots.shape)), d)
    heavy = (0.08 + 0.3 * smoothstep(0.08, 0.3, L))[:, None] * (1 - 0.6 * crown)
    out = np.zeros((len(roots), S + 1, 3))
    out[:, 0] = roots
    step = (L / S)[:, None]
    for k in range(1, S + 1):
        d = norm(d + down * heavy + RNG.normal(0, 0.05, d.shape))
        out[:, k] = out[:, k - 1] + d * step
    # Out of the skin (a little more the further along).
    for i in range(len(roots)):
        for k in range(1, S + 1):
            q = Vector(g2b(out[i, k]).tolist())
            loc, nrm, _, dist = bvh.find_nearest(q)
            if loc is None:
                continue
            gap = 0.008 + 0.012 * k / S
            off = (q - loc).dot(nrm)
            if off < gap:
                q = q + nrm * (gap - off)
                out[i, k] = b2g(np.array(q))
    return out


def srgb_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def make_coat(skin):
    P, N, T = mesh_arrays(skin)
    bvh = BVHTree.FromObject(skin, bpy.context.evaluated_depsgraph_get())
    count = int(os.environ.get("MAMMOTH_LOCKS", "6000"))
    roots, normals = sample_surface(P, N, T, count * 4)
    L, dens = coat(roots, normals)
    # (The head thicker-haired than its share of the skin would give it.)
    head = smoothstep(0.55, 0.7, roots[:, 0]) * (roots[:, 1] > 1.25)
    dens = dens * (0.42 + 0.58 * head)
    keep = (RNG.random(len(roots)) < dens) & (L > 0.015)
    roots, normals, L = roots[keep][:count], normals[keep][:count], L[keep][:count]
    L = L * RNG.uniform(0.85, 1.12, len(L))
    paths = lock_paths(roots, normals, L, bvh)
    # The strands: each lock a clump, its strands spread at the root and drawn together toward the tip.
    S = paths.shape[1] - 1
    per = np.clip((6 + 40 * L).astype(int), 6, 20)
    lock_of = np.repeat(np.arange(len(L)), per)
    n = len(lock_of)
    rl = (0.01 + 0.08 * L)[lock_of]
    tang = norm(np.cross(normals[lock_of], RNG.normal(0, 1, (n, 3))))
    off = tang * (rl * np.sqrt(RNG.random(n)))[:, None]
    scale = RNG.uniform(0.7, 1.05, n)
    f = np.linspace(0, 1, S + 1)
    u = np.clip(f[None, :] * scale[:, None], 0, 1) * S
    i0 = np.minimum(np.floor(u).astype(int), S - 1)
    tt = (u - i0)[..., None]
    lp = paths[lock_of]
    pts = np.take_along_axis(lp, i0[..., None].repeat(3, 2), 1) * (1 - tt) + np.take_along_axis(lp, (i0 + 1)[..., None].repeat(3, 2), 1) * tt
    clump = 0.75
    pts = pts + off[:, None, :] * (1 - clump * f[None, :, None]) + RNG.normal(0, 1, pts.shape) * (rl[:, None, None] * 0.18 * f[None, :, None])
    # Ribbons facing out of the skin, thinning to the tip.
    seg = np.gradient(pts, axis=1)
    side = norm(np.cross(seg, normals[lock_of][:, None, :]))
    width = (0.0042 * (1 - 0.65 * f))[None, :, None]
    V = np.stack([pts - side * width, pts + side * width], 2).reshape(-1, 3)
    base = (np.arange(n) * (S + 1) * 2)[:, None] + np.arange(S)[None, :] * 2
    F = np.stack([base, base + 1, base + 3, base + 2], -1).reshape(-1, 4)
    me = bpy.data.meshes.new("coat")
    me.vertices.add(len(V))
    me.vertices.foreach_set("co", g2b(V).reshape(-1).astype(np.float32))
    me.loops.add(len(F) * 4)
    me.loops.foreach_set("vertex_index", F.reshape(-1).astype(np.int32))
    me.polygons.add(len(F))
    me.polygons.foreach_set("loop_start", (np.arange(len(F)) * 4).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(F), 4, dtype=np.int32))
    me.update(calc_edges=True)
    o = bpy.data.objects.new("coat", me)
    bpy.context.scene.collection.objects.link(o)
    # Colours: each lock between a dark brown and a ginger, every strand a little its own, dark at the root and
    # paler (sun-bleached) at the tip.
    mix = RNG.beta(2.0, 2.4, len(L))[lock_of] * 0.85 + RNG.random(n) * 0.15
    dark, ginger = np.array([0.2, 0.12, 0.065]), np.array([0.5, 0.29, 0.135])
    c = dark[None] * (1 - mix[:, None]) + ginger[None] * mix[:, None]
    c = c * RNG.uniform(0.85, 1.12, (n, 1))
    along_f = np.repeat(f[None, :], n, 0)
    shade = (0.45 + 0.75 * along_f ** 0.8)[..., None]
    col = np.clip(c[:, None, :] * shade, 0, 1)
    col = np.repeat(col[:, :, None, :], 2, 2).reshape(-1, 3)
    paint_vertices(o, srgb_lin(col))
    print("COAT", len(L), "locks", n, "strands", len(F) * 2, "triangles")
    return o, roots, normals, L, paths


# ─────────────── the shell the game draws ───────────────


def lock_tubes(paths, L, normals, sides=6):
    """Closed tubes round the long locks (as thick as the clump, thinning to its tip)."""
    S = paths.shape[1] - 1
    f = np.linspace(0, 1, S + 1)
    m = len(paths)
    r = (0.01 + 0.08 * L)[:, None] * (1 - 0.68 * f)[None, :] + 0.004
    t = norm(np.gradient(paths, axis=1))
    a = norm(np.cross(t, normals[:, None, :]))
    b = np.cross(t, a)
    ang = 2 * np.pi * np.arange(sides) / sides
    ring = paths[:, :, None, :] + r[:, :, None, None] * (a[:, :, None, :] * np.cos(ang)[None, None, :, None] + b[:, :, None, :] * np.sin(ang)[None, None, :, None])
    V = ring.reshape(m, (S + 1) * sides, 3)
    tips = paths[:, -1] + t[:, -1] * r[:, -1:] * 0.8
    roots = paths[:, 0] - t[:, 0] * 0.02
    V = np.concatenate([V, tips[:, None], roots[:, None]], 1)
    per = V.shape[1]
    F = []
    for i in range(S):
        for k in range(sides):
            k2 = (k + 1) % sides
            F.append((i * sides + k, i * sides + k2, (i + 1) * sides + k2, (i + 1) * sides + k))
    quads = np.array(F)
    tipf = np.array([(S * sides + k, S * sides + (k + 1) % sides, per - 2, per - 2) for k in range(sides)])
    rootf = np.array([((k + 1) % sides, k, per - 1, per - 1) for k in range(sides)])
    allf = np.concatenate([quads, tipf, rootf])
    Fs = (allf[None, :, :] + (np.arange(m) * per)[:, None, None]).reshape(-1, 4)
    return V.reshape(-1, 3), Fs


def mesh_from(name, V, F):
    """A Blender object from game-frame vertices and faces (quads; a repeated last index makes a triangle)."""
    me = bpy.data.meshes.new(name)
    faces = [tuple(dict.fromkeys(f)) for f in F.tolist()]
    me.from_pydata(g2b(V).tolist(), [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def apply(o, *mods):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    for kind, opts in mods:
        m = o.modifiers.new(kind, kind)
        for k, v in opts.items():
            setattr(m, k, v)
        bpy.ops.object.modifier_apply(modifier=m.name)


def make_shell(skin, normals, L, paths):
    # The skin swollen by its short hair...
    sk = skin.copy()
    sk.data = skin.data.copy()
    bpy.context.scene.collection.objects.link(sk)
    P, N, _ = mesh_arrays(sk)
    Lv, _ = coat(P, N)
    set_points(sk, P + N * (np.minimum(Lv, 0.07) * 0.6 + 0.004)[:, None])
    # ...and the long locks round it, melted into one surface.
    long = L > 0.08
    V, F = lock_tubes(paths[long], L[long], normals[long])
    tubes = mesh_from("tubes", V, F)
    bpy.ops.object.select_all(action="DESELECT")
    sk.select_set(True)
    tubes.select_set(True)
    bpy.context.view_layer.objects.active = sk
    bpy.ops.object.join()
    shell = bpy.context.view_layer.objects.active
    shell.name = "shell"
    apply(shell, ("REMESH", {"mode": "VOXEL", "voxel_size": 0.013}), ("SMOOTH", {"factor": 0.5, "iterations": 2}))
    n = len(shell.data.polygons)
    apply(shell, ("DECIMATE", {"ratio": min(1.0, TRIS / max(1, n * 2))}))
    apply(shell, ("TRIANGULATE", {}))
    V = b2g(np.array([v.co for v in shell.data.vertices]))
    V[:, 1] = np.maximum(V[:, 1], 0.0)
    set_points(shell, V)
    print("SHELL", n, "->", len(shell.data.polygons))
    return shell


def unwrap(o):
    """Its pictures' layout: worked out on a much smoothed copy (the locks' lumps would break it into crumbs), whose
    pieces are big and few, then given back to the shell (the same vertices, in the same order)."""
    proxy = o.copy()
    proxy.data = o.data.copy()
    bpy.context.scene.collection.objects.link(proxy)
    apply(proxy, ("SMOOTH", {"factor": 1.0, "iterations": 40}))
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = proxy
    proxy.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.006, area_weight=1.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = np.empty(len(proxy.data.loops) * 2)
    proxy.data.uv_layers.active.data.foreach_get("uv", uv)
    if not o.data.uv_layers:
        o.data.uv_layers.new(name="UVMap")
    o.data.uv_layers.active.data.foreach_set("uv", uv)
    bpy.data.objects.remove(proxy)


def low_tusks(tusks):
    out = []
    for s in (-1, 1):
        path, r = tusk_shape(s)
        out.append(tube_mesh(f"tuskLow{s}", path[::2], r[::2], sides=9))
    return out


def colour_skin(skin):
    """The skin's colour: woolly brown under the coat, grey-brown on the trunk and the soles."""
    P, N, _ = mesh_arrays(skin)
    t, dist = near_trunk(P)
    trunk = ((P[:, 0] > 0.97) & (dist < 0.17) & (P[:, 1] < 1.42)) * smoothstep(0.1, 0.4, t)
    sole = np.zeros(len(P))
    for x, z in LEGS:
        sole = np.maximum(sole, (np.hypot(P[:, 0] - x, P[:, 2] - z) < 0.3) * smoothstep(0.16, 0.08, P[:, 1]))
    bare = np.maximum(trunk, sole)
    wool = np.array([0.16, 0.095, 0.055])
    grey = np.array([0.26, 0.22, 0.19]) * (0.85 + 0.15 * fbm(P * 30, 2, 3)[:, None])
    c = wool[None] * (1 - bare[:, None]) + grey * bare[:, None]
    paint_vertices(skin, srgb_lin(c))


def colour_tusks(tusks):
    for o in tusks:
        P = b2g(np.array([v.co for v in o.data.vertices]))
        n = len(P)
        k = np.arange(n) // 14
        u = np.clip(k / max(1, k.max()), 0, 1)
        base = np.array([0.5, 0.4, 0.27])
        ivory = np.array([0.86, 0.79, 0.64])
        tip = np.array([0.93, 0.9, 0.8])
        c = base[None] * (1 - smoothstep(0.0, 0.25, u))[:, None] + ivory[None] * (smoothstep(0.0, 0.25, u) - smoothstep(0.75, 1.0, u))[:, None] + tip[None] * smoothstep(0.75, 1.0, u)[:, None]
        # Growth rings and streaks along it.
        c *= (0.93 + 0.05 * np.sin(u * 180) + 0.04 * fbm(P * np.array([6, 30, 30]), 2, 8))[:, None]
        paint_vertices(o, srgb_lin(np.clip(c, 0, 1)))


def colour_flat(objs, rgb):
    for o in objs:
        paint_vertices(o, np.tile(srgb_lin(np.array(rgb)), (len(o.data.vertices), 1)))


def new_image(name, size, data=False):
    im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    if data:
        im.colorspace_settings.name = "Non-Color"
    return im


def bake(low, highs, image, kind, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    mat = low.data.materials[0]
    node = mat.node_tree.nodes["bake"]
    node.image = image
    mat.node_tree.nodes.active = node
    for o in scene.objects:
        o.hide_render = False
    bpy.ops.object.select_all(action="DESELECT")
    for h in highs:
        h.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    b = scene.render.bake
    b.use_selected_to_active = True
    b.use_cage = False
    b.cage_extrusion = 0.035
    b.max_ray_distance = 0.12
    b.margin = 6
    b.margin_type = "EXTEND"
    if kind == "COLOR":
        b.use_pass_direct = False
        b.use_pass_indirect = False
        b.use_pass_color = True
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    elif kind == "NORMAL":
        b.normal_space = "TANGENT"
        bpy.ops.object.bake(type="NORMAL")
    else:
        world = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
        scene.world = world
        world.use_nodes = True
        world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
        world.light_settings.distance = 0.18
        bpy.ops.object.bake(type="AO")


def pixels(im):
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def save_png(arr, path, data=False):
    h, w = arr.shape[:2]
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    if data:
        im.colorspace_settings.name = "Non-Color"
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = arr[..., :3]
    im.pixels.foreach_set(rgba.reshape(-1))
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()


def split_by_uv(o):
    """Per-vertex arrays for the GLB from an object with a UV map: a vertex for each (vertex, uv) pair."""
    me = o.data
    me.calc_loop_triangles()
    nl = len(me.loops)
    lv = np.empty(nl, dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    uv = np.empty(nl * 2)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    key = np.stack([lv, np.round(uv[:, 0] * 65536).astype(np.int64), np.round(uv[:, 1] * 65536).astype(np.int64)], 1)
    uniq, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    tl = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("loops", tl)
    P, N, _ = mesh_arrays(o)
    vi = lv[first]
    return P[vi], N[vi], uv[first], inv[tl].reshape(-1, 3), vi


def sample(img, uv):
    h, w = img.shape[:2]
    x = np.clip(uv[:, 0] * (w - 1), 0, w - 1)
    y = np.clip(uv[:, 1] * (h - 1), 0, h - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    return img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy


def weights(P, tusk_mask):
    """The two joints that move each vertex and the first one's weight."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    W = np.zeros((n, len(BONES)))
    head = smoothstep(0.5, 0.74, x) * smoothstep(0.95, 1.2, y)
    beard = smoothstep(0.5, 0.74, x) * (1 - smoothstep(0.95, 1.2, y)) * 0.5
    head = np.maximum(head, beard)
    t, dist = near_trunk(P)
    trunk = ((x > 0.95) & (dist < 0.22) & (y < 1.4)) * smoothstep(0.03, 0.25, t)
    W[:, BI["strike"]] = trunk
    W[:, BI["head"]] = head * (1 - trunk)
    for i, s in enumerate((-1, 1)):
        e = np.linalg.norm((P - np.array([0.7, 1.7, s * 0.23])) / np.array([0.13, 0.15, 0.1]), axis=1)
        ear = smoothstep(1.2, 0.8, e) * (z * s > 0.17)
        W[:, BI[f"flap{i}"]] = ear
        W[:, BI["head"]] *= 1 - ear
    tail = smoothstep(-0.86, -0.96, x) * (np.abs(z) < 0.16) * (y > 0.9)
    W[:, BI["tail"]] = tail
    for i, (lx, lz) in enumerate(LEGS):
        r = np.hypot(x - lx, z - lz)
        inleg = smoothstep(0.36, 0.25, r) * smoothstep(0.98, 0.76, y)
        knee = inleg * smoothstep(KNEE_Y + 0.1, KNEE_Y - 0.12, y)
        W[:, BI[f"leg{i}"]] = inleg - knee
        W[:, BI[f"knee{i}"]] = knee
    W[tusk_mask] = 0
    W[tusk_mask, BI["head"]] = 1
    W[:, BI["beast"]] = np.clip(1 - W.sum(1), 0, 1)
    order = np.argsort(-W, 1)
    j0, j1 = order[:, 0], order[:, 1]
    w0, w1 = W[np.arange(n), j0], W[np.arange(n), j1]
    tot = np.maximum(w0 + w1, 1e-9)
    return np.stack([j0, j1], 1), w0 / tot


def ring_cast(bvh, x, angles, centre_y, out=0.0):
    """Where rays from outside, aimed at the body's middle line at x, meet the shell (one per angle from the top)."""
    pts, nrms = [], []
    for a in angles:
        d = np.array([0, math.cos(a), math.sin(a)])
        c = np.array([x, centre_y, 0])
        o = c + d * 2.0
        loc, nrm, _, _ = bvh.ray_cast(Vector(g2b(o).tolist()), Vector(g2b(-d).tolist()))
        if loc is None:
            pts.append(c + d * 0.5)
            nrms.append(d)
        else:
            pts.append(b2g(np.array(loc)) + d * out)
            nrms.append(b2g(np.array(nrm)))
    return np.array(pts), np.array(nrms)


def blanket(shell):
    """A blanket over the back where the rider sits, in the side's colour hemmed in gold, draped over the hair."""
    bvh = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
    sx = JOINTS["seat"][0]
    xs = np.linspace(sx - 0.34, sx + 0.3, 27)
    angs = np.linspace(-1.25, 1.25, 33)
    grid = np.array([ring_cast(bvh, x, angs, 1.25)[0] for x in xs])
    # Draped: the hair's lumps smoothed out under it, laid a little above them.
    c = np.array([[[x, 1.25, 0]] for x in xs])
    r = np.linalg.norm(grid - c, axis=2)
    raw = r.copy()
    for _ in range(6):
        r = np.maximum(r, raw)
        r[1:-1] = (r[:-2] + r[1:-1] * 2 + r[2:]) / 4
        r[:, 1:-1] = (r[:, :-2] + r[:, 1:-1] * 2 + r[:, 2:]) / 4
    r = np.maximum(r, raw) + 0.024
    dirs = np.stack([np.zeros_like(r), np.cos(angs)[None].repeat(len(xs), 0), np.sin(angs)[None].repeat(len(xs), 0)], 2)
    top = c + dirs * r[..., None]
    # The hanging sides fall a little straighter than the hair.
    hang = smoothstep(0.7, 1.25, np.abs(angs))[None, :, None]
    top = top + np.array([0, -0.02, 0]) * hang
    bot = top - dirs * 0.012
    ni, nj = top.shape[:2]
    V = np.concatenate([top.reshape(-1, 3), bot.reshape(-1, 3)])
    off = ni * nj
    team, gold = [], []
    for i in range(ni - 1):
        for j in range(nj - 1):
            a, b, cc, d = i * nj + j, (i + 1) * nj + j, (i + 1) * nj + j + 1, i * nj + j + 1
            edge = i in (0, ni - 2) or j in (0, nj - 2)
            (gold if edge else team).append((a, b, cc, d))
            (gold if edge else team).append((d + off, cc + off, b + off, a + off))
    # The rims between the faces.
    for i in range(ni - 1):
        for j in (0, nj - 1):
            a, b = i * nj + j, (i + 1) * nj + j
            gold.append((a, a + off, b + off, b) if j == 0 else (b, b + off, a + off, a))
    for j in range(nj - 1):
        for i in (0, ni - 1):
            a, b = i * nj + j, i * nj + j + 1
            gold.append((b, b + off, a + off, a) if i == 0 else (a, a + off, b + off, b))
    return V, np.array(team), np.array(gold)


def tri_arrays(V, F):
    F = np.asarray(F)
    T = np.concatenate([F[:, [0, 1, 2]], F[:, [0, 2, 3]]])
    T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
    used = np.unique(T)
    remap = -np.ones(len(V), dtype=np.int64)
    remap[used] = np.arange(len(used))
    P = V[used]
    T = remap[T]
    # Smooth normals.
    N = np.zeros_like(P)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3):
        np.add.at(N, T[:, k], fn)
    return P, norm(N), T


def write_glb(path, prims, extras):
    """POSITION SHORT (its box in the node's extras), NORMAL BYTE, TEXCOORD_0 SHORT ×1/4096, _SKIN UBYTE (joint, joint,
    first weight, light), COLOR_0 UBYTE (the picture's colour, for the processor's drawing) — as the people's."""
    blob = bytearray()
    views, accessors, nodes, meshes = [], [], [], []

    def add(data, ctype, kind, count, normalized=False, target=34962, stride=None):
        nonlocal blob
        while len(blob) % 4:
            blob += b"\0"
        off = len(blob)
        blob += data
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(data), **({"target": target} if target else {}), **({"byteStride": stride} if stride else {})})
        acc = {"bufferView": len(views) - 1, "componentType": ctype, "count": count, "type": kind}
        if normalized:
            acc["normalized"] = True
        accessors.append(acc)
        return len(accessors) - 1

    for name, d in prims.items():
        P, N = d["P"], norm(d["N"])
        n = len(P)
        lo, hi = P.min(0), P.max(0)
        span = np.maximum(hi - lo, 1e-6)
        qp = np.zeros((n, 4), dtype=np.int16)
        qp[:, :3] = np.round((P - lo) / span * 65535 - 32768).astype(np.int16)
        qn = np.zeros((n, 4), dtype=np.int8)
        qn[:, :3] = np.round(N * 127).astype(np.int8)
        quv = np.clip(np.round(d["U"] * 4096), -32768, 32767).astype(np.int16)
        skin = np.zeros((n, 4), dtype=np.uint8)
        skin[:, 0:2] = d["J"]
        skin[:, 2] = np.round(np.clip(d["W"], 0, 1) * 255)
        skin[:, 3] = np.round(np.clip(d["A"], 0, 1) * 255)
        c0 = np.zeros((n, 4), dtype=np.uint8)
        c0[:, :3] = np.round(np.clip(d["C0"], 0, 1) * 255)
        tri = d["T"].reshape(-1)
        big = n > 65535
        attrs = {
            "POSITION": add(qp.tobytes(), 5122, "VEC3", n, stride=8),
            "NORMAL": add(qn.tobytes(), 5120, "VEC3", n, normalized=True, stride=4),
            "TEXCOORD_0": add(quv.tobytes(), 5122, "VEC2", n),
            "_SKIN": add(skin.tobytes(), 5121, "VEC4", n),
            "COLOR_0": add(c0.tobytes(), 5121, "VEC4", n, normalized=True),
        }
        ia = add(tri.astype(np.uint32 if big else np.uint16).tobytes(), 5125 if big else 5123, "SCALAR", len(tri), target=34963)
        meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": ia}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1, "extras": {"lo": lo.tolist(), "hi": hi.tolist(), **d.get("extras", {})}})
    while len(blob) % 4:
        blob += b"\0"
    doc = {
        "asset": {"version": "2.0", "generator": "tools/blender/erawar/units/mammoth.py", "extras": extras},
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


def rigid(n, bone):
    return np.tile(np.array([BI[bone], BI[bone]]), (n, 1)), np.ones(n)




if __name__ == "__main__":
    reset()
    skin = skin_object()
    sculpt_skin(skin)
    skin.data.materials.append(material("skinm", (0.12, 0.09, 0.07), rough=0.7))
    tusks = make_tusks()
    tm = material("tuskm", (0.75, 0.66, 0.5), rough=0.4)
    for t in tusks:
        t.data.materials.append(tm)
        t.data.polygons.foreach_set("use_smooth", [True] * len(t.data.polygons))
    nails = make_nails()
    for n in nails:
        n.data.materials.append(tm)
    skin.data.polygons.foreach_set("use_smooth", [True] * len(skin.data.polygons))
    print("SKIN", len(skin.data.vertices), "verts")
    if STAGE == "skin":
        preview(os.path.join(WORK, "skin.png"), [skin, *tusks, *nails])
        preview(os.path.join(WORK, "skin-side.png"), [skin, *tusks, *nails], eye=(0.1, 1.2, 5.2), look=(0.1, 1.1, 0))
        sys.exit(0)
    place_eyes(skin)
    coat_o, roots, normals, L, paths = make_coat(skin)
    coat_o.data.materials.append(material("coatm", attr="col", rough=0.6))
    colour_skin(skin)
    colour_tusks(tusks)
    colour_flat(nails, (0.62, 0.56, 0.45))
    vm = material("vcol", attr="col", rough=0.7)
    for o in (skin, *tusks, *nails):
        o.data.materials.clear()
        o.data.materials.append(vm)
    if STAGE == "hair":
        preview(os.path.join(WORK, "hair.png"), [skin, coat_o, *tusks, *nails], samples=24)
        preview(os.path.join(WORK, "hair-side.png"), [skin, coat_o, *tusks, *nails], eye=(0.1, 1.2, 5.2), look=(0.1, 1.1, 0), samples=24)
        sys.exit(0)
    shell = make_shell(skin, normals, L, paths)
    lows = low_tusks(tusks)
    bpy.ops.object.select_all(action="DESELECT")
    for o in (shell, *lows):
        o.select_set(True)
    bpy.context.view_layer.objects.active = shell
    n_shell = len(shell.data.vertices)
    bpy.ops.object.join()
    shell = bpy.context.view_layer.objects.active
    shell.data.polygons.foreach_set("use_smooth", [True] * len(shell.data.polygons))
    unwrap(shell)
    bm = bpy.data.materials.new("bakem")
    bm.use_nodes = True
    node = bm.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "bake"
    shell.data.materials.clear()
    shell.data.materials.append(bm)
    highs = [skin, coat_o, *tusks, *nails]
    big = TEX * 2
    col, nrm, ao = new_image("col", big), new_image("nrm", big, True), new_image("ao", big, True)
    bake(shell, highs, col, "COLOR", 4)
    bake(shell, highs, nrm, "NORMAL", 4)
    bake(shell, highs, ao, "AO", SAMPLES)
    C, Nm, A = pixels(col), pixels(nrm), pixels(ao)

    def half(a):
        return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4

    C, Nm, A = half(C), half(Nm), half(A)
    # The colour (as the picture holds it, sRGB) with the locks' shade in it.
    final_srgb = np.clip(C[..., :3] * (0.36 + 0.64 * A[..., :1]), 0, 1)
    tex = os.path.join(WORK, "tex")
    os.makedirs(tex, exist_ok=True)
    save_png(final_srgb, os.path.join(tex, "mammoth.png"), data=True)
    save_png(Nm[..., :3], os.path.join(tex, "mammoth_n.png"), data=True)
    # The GLB: the shell (its vertices split where its pictures' pieces meet), the eyes, the blanket.
    P, N, U, T, vi = split_by_uv(shell)
    tusk_mask = vi >= n_shell
    J, Wt = weights(P, tusk_mask)
    C0 = sample(final_srgb, U)
    prims = {"tex:mammoth": {"P": P, "N": N, "U": np.stack([U[:, 0], 1 - U[:, 1]], 1), "J": J, "W": Wt, "A": np.ones(len(P)), "C0": C0, "T": T}}
    sbvh = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
    eyes = []
    for e in EYES:
        loc, nr, _, _ = sbvh.find_nearest(Vector(g2b(e).tolist()))
        c = b2g(np.array(loc)) + b2g(np.array(nr)) * 0.004
        bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=7, radius=0.026)
        eo = bpy.context.active_object
        ep, en, et = mesh_arrays(eo)
        eyes.append((ep * np.array([0.8, 1.0, 1.0]) + c, en, et))
        bpy.data.objects.remove(eo)
    EP = np.concatenate([e[0] for e in eyes])
    EN = np.concatenate([e[1] for e in eyes])
    ET = np.concatenate([eyes[0][2], eyes[1][2] + len(eyes[0][0])])
    j, w = rigid(len(EP), "head")
    prims["pupil"] = {"P": EP, "N": EN, "U": np.zeros((len(EP), 2)), "J": j, "W": w, "A": np.ones(len(EP)), "C0": np.zeros((len(EP), 3)), "T": ET}
    V, team, gold = blanket(shell)
    for name, F in (("team", team), ("gold", gold)):
        bp, bn, bt = tri_arrays(V, F)
        j, w = rigid(len(bp), "beast")
        prims[name] = {"P": bp, "N": bn, "U": np.zeros((len(bp), 2)), "J": j, "W": w, "A": np.full(len(bp), 0.9), "C0": np.zeros((len(bp), 3)), "T": bt}
    # Where the rider sits: on the blanket, his hips a little above it.
    top = ring_cast(sbvh, JOINTS["seat"][0], [0.0], 1.25)[0][0]
    JOINTS["seat"] = (JOINTS["seat"][0], float(top[1]) + 0.03, 0.0)
    size = write_glb(os.path.join(OUT, "b0.glb"), prims, {"bones": BONES, "joints": {k: [round(float(c), 4) for c in v] for k, v in JOINTS.items()}})
    tris = sum(len(d["T"]) for d in prims.values())
    print(f"DONE b0.glb: {size} bytes, {tris} triangles, {len(P)} shell vertices; seat {JOINTS['seat']}")
    if os.environ.get("PREVIEW"):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, "mammoth.blend"))
        preview(os.path.join(WORK, "beauty.png"), [skin, coat_o, *tusks, *nails], samples=48, size=(1200, 900))
