"""
The knight's horse of 시대 전쟁 (b1.glb), sculpted in Blender as the mammoth is (mammoth.py, whose helpers it uses;
see ../README.md).

Its skin is one body melted from Blender's metaballs along the horse's own lines: a long head with its jowls, eyes,
nostrils and lips, cupped ears, an arched neck rising from the withers, a deep chest and sloping shoulder, a dipped
back and a rounded, sloping croup, slim legs with knees, hocks, fetlocks and pasterns on horn hooves; muscled where a
horse is (the crest, the shoulder and the arm, the forearm, the quarters and the gaskin, the tendons down the
cannons). Its coat is a bay's (red-brown, darker along the top, black from the knees and hocks down, a dark muzzle,
a white blaze); the mane, the forelock and the tail grow as locks of black strands. The game draws a thinner shell (the
skin, the mane and the tail melted together and thinned) onto which Cycles bakes the coat's colour, its relief and the
shade. The tack is the game's to paint: a caparison of the side's colour draped over the back and hanging in folds to
above the knees, hemmed and bossed in gold, a saddle with its pommel and cantle, a bridle (crownpiece, browband,
cheekpieces, noseband, throatlatch) with its bits; the reins the game draws itself, from the bits to the knight's
fist. The joints' places (the neck, the legs, the tail, where the rider sits, the bits) go with it.

    blender -b --python horse.py -- <out dir> <work dir>

writes <out dir>/b1.glb and <work dir>/tex/horse.png, horse_n.png (webp.py makes the game's WebPs of them).
`HORSE_TRIS` sets the shell's triangles (16000), `HORSE_TEX` the pictures' size (2048), `BAKE_SAMPLES` the shade's.
"""
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from lib import g2b, b2g, smoothstep, norm, fbm, reset  # noqa
import mammoth as M

OUT, WORK = M.OUT, M.WORK
TRIS = int(os.environ.get("HORSE_TRIS", "16000"))
HTEX = int(os.environ.get("HORSE_TEX", "2048"))
SAMPLES = M.SAMPLES
RNG = np.random.default_rng(23)

# ─────────────── the joints (the game's frame: x forward, y up, z across) ───────────────
BONES = ["beast", "head", "leg0", "knee0", "leg1", "knee1", "leg2", "knee2", "leg3", "knee3", "tail"]
BI = {n: i for i, n in enumerate(BONES)}
Z = 0.125  # the legs' distance from the middle
# Each leg's line, top to coronet (x, y): the fore straight under the shoulder, the hind from the stifle back to the
# hock and down.
FORE = [(0.42, 0.95), (0.425, 0.74), (0.43, 0.52), (0.432, 0.33), (0.438, 0.17), (0.46, 0.09), (0.48, 0.045)]
HIND = [(-0.38, 0.95), (-0.45, 0.74), (-0.5, 0.54), (-0.49, 0.34), (-0.475, 0.17), (-0.45, 0.09), (-0.43, 0.045)]
LEGS = [(FORE, -Z), (FORE, Z), (HIND, -Z), (HIND, Z)]
JOINTS = {
    "head": (0.5, 1.2, 0.0),
    "tail": (-0.64, 1.22, 0.0),
    "seat": (-0.06, 1.34, 0.0),
}
for i, (line, z) in enumerate(LEGS):
    JOINTS[f"leg{i}"] = (line[0][0], 0.9, z)
    JOINTS[f"knee{i}"] = (line[2][0], line[2][1], z)
POLL = np.array([0.86, 1.64, 0.0])
MUZZLE = np.array([1.13, 1.25, 0.0])
CREST = np.array([(0.84, 1.67, 0), (0.72, 1.6, 0), (0.6, 1.5, 0), (0.48, 1.4, 0), (0.36, 1.33, 0)])

# ─────────────── the skin ───────────────
BLOBS = []  # (centre, half-axes, turn about z)


def blob(c, r, turn=0.0):
    BLOBS.append((tuple(c), tuple(r), turn))


def chain(ctrl, rx, ry, rz, n=5):
    pts = M.catmull(ctrl, n)
    u = np.linspace(0, 1, len(pts))
    k = np.linspace(0, 1, len(rx))
    for p, a, b, c in zip(pts, np.interp(u, k, rx), np.interp(u, k, ry), np.interp(u, k, rz)):
        blob(p, (a, b, c))


# The barrel, the withers, the quarters, the chest and the shoulders.
blob((0.28, 1.08, 0), (0.3, 0.25, 0.2))
blob((0.0, 1.07, 0), (0.32, 0.21, 0.215))
blob((-0.32, 1.09, 0), (0.28, 0.22, 0.21))
blob((0.3, 1.27, 0), (0.2, 0.09, 0.08))
blob((-0.44, 1.16, 0), (0.25, 0.17, 0.215))
blob((-0.54, 1.05, 0), (0.14, 0.2, 0.17))
blob((0.55, 1.06, 0), (0.1, 0.13, 0.14))
for s in (-1, 1):
    blob((0.44, 1.1, s * 0.1), (0.2, 0.09, 0.09), turn=-1.1)
    blob((0.42, 0.97, s * 0.11), (0.11, 0.13, 0.08))
    blob((-0.4, 1.02, s * 0.12), (0.16, 0.2, 0.09))
# The neck, arched, deep at its root; the head, long, from the poll to the muzzle; the jowls.
chain([(0.4, 1.17, 0), (0.58, 1.38, 0), (0.72, 1.54, 0), (0.83, 1.62, 0)], [0.18, 0.15, 0.12, 0.1], [0.25, 0.19, 0.14, 0.11], [0.135, 0.11, 0.09, 0.08])
chain([(0.84, 1.66, 0), (0.95, 1.52, 0), (1.05, 1.39, 0), (1.115, 1.29, 0)], [0.085, 0.07, 0.058, 0.062], [0.09, 0.08, 0.066, 0.066], [0.1, 0.08, 0.06, 0.064])
for s in (-1, 1):
    blob((0.885, 1.5, s * 0.042), (0.095, 0.09, 0.055))
blob((1.1, 1.265, 0), (0.07, 0.06, 0.065))
# The legs: thick above the knee and hock, slim cannons, round fetlocks, slanting pasterns.
for line, z in LEGS:
    fore = line is FORE
    ctrl = [(x, y, z) for x, y in line]
    rx = [0.1, 0.075, 0.05, 0.031, 0.04, 0.029, 0.036] if fore else [0.13, 0.085, 0.056, 0.032, 0.04, 0.029, 0.036]
    rz = [0.08, 0.058, 0.042, 0.025, 0.034, 0.027, 0.034] if fore else [0.095, 0.062, 0.042, 0.025, 0.034, 0.027, 0.034]
    chain(ctrl, rx, [0.06] * 7, rz, n=6)
    if fore:
        # The knee's bones, in front.
        blob((line[2][0] + 0.012, line[2][1], z), (0.04, 0.04, 0.038))
    if not fore:
        # The point of the hock, behind.
        blob((line[2][0] - 0.04, line[2][1] + 0.02, z), (0.035, 0.04, 0.03))
# The dock of the tail.
chain([(-0.6, 1.24, 0), (-0.66, 1.2, 0), (-0.71, 1.1, 0)], [0.05, 0.04, 0.032], [0.05, 0.04, 0.032], [0.045, 0.036, 0.03], n=4)


def ears():
    """Two cupped ears on the poll, pricked and turned a little out."""
    out = []
    for s in (-1, 1):
        V, F = [], []
        n, rings = 10, 8
        for i in range(rings + 1):
            t = i / rings
            a = 0.042 * (1 - t) ** 0.65 + 0.002
            b = 0.024 * (1 - t) ** 0.8 + 0.002
            for k in range(n):
                ang = 2 * math.pi * k / n
                x, z = a * math.cos(ang), b * math.sin(ang)
                # The cup: the front face pressed in.
                if z > 0:
                    z *= 0.35
                V.append((x, t * 0.15, z))
        for i in range(rings):
            for k in range(n):
                k2 = (k + 1) % n
                F.append((i * n + k, i * n + k2, (i + 1) * n + k2, (i + 1) * n + k))
        V.append((0, 0.155, 0))
        tip = len(V) - 1
        for k in range(n):
            F.append((rings * n + k, rings * n + (k + 1) % n, tip, tip))
        V = np.array(V)
        # Stand it on the poll: tipped forward a little, turned out, its cup facing forward.
        ry, rx = -s * 0.35, s * 0.25
        R1 = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
        R2 = np.array([[1, 0, 0], [0, math.cos(rx), -math.sin(rx)], [0, math.sin(rx), math.cos(rx)]])
        V = V @ (R2 @ R1).T
        V = V @ np.array([[math.cos(0.25), -math.sin(0.25), 0], [math.sin(0.25), math.cos(0.25), 0], [0, 0, 1]]).T
        V = V + np.array([0.82, 1.665, s * 0.05])
        out.append(M.mesh_from(f"ear{s}", V, np.array(F)))
    return out


def skin_object():
    mb = bpy.data.metaballs.new("skin")
    mb.resolution = 0.009
    mb.render_resolution = 0.009
    mb.threshold = 0.6
    for c, r, turn in BLOBS:
        e = mb.elements.new(type="ELLIPSOID")
        e.co = Vector(g2b(c).tolist())
        rr = max(r)
        e.radius = rr * 1.62
        e.size_x, e.size_y, e.size_z = r[0] / rr, r[2] / rr, r[1] / rr
        e.stiffness = 2.2
        if turn:
            e.rotation = Quaternion(Vector((0, 1, 0)), -turn)
    o = bpy.data.objects.new("skinMB", mb)
    bpy.context.scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    o = bpy.context.view_layer.objects.active
    o.name = "skin"
    bpy.ops.object.select_all(action="DESELECT")
    es = ears()
    for e in es:
        e.select_set(True)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    M.apply(o, ("REMESH", {"mode": "VOXEL", "voxel_size": 0.0075}), ("SMOOTH", {"factor": 0.7, "iterations": 5}))
    return o


def lump(P, c, r, h, mirror=True):
    """A soft swelling (or hollow) round c, r its half-axes; on both sides when `mirror`."""
    out = np.zeros(len(P))
    for s in ((-1, 1) if mirror and c[2] else (1,)):
        q = (P - np.array([c[0], c[1], s * c[2]])) / np.array(r)
        out += h * np.exp(-np.sum(q * q, axis=1))
    return out


def sculpt(o):
    P, N, _ = M.mesh_arrays(o)
    d = np.zeros(len(P))
    # The crest of the neck; the shoulder's blade and the arm's muscle behind it; the forearm; the quarters and the
    # gaskin; the jowls; a hollow over each eye and the eyes' ridge.
    d += lump(P, (0.6, 1.52, 0), (0.2, 0.05, 0.05), 0.008, False)
    d += lump(P, (0.45, 1.16, 0.15), (0.05, 0.14, 0.05), 0.007)
    d += lump(P, (0.38, 0.98, 0.17), (0.08, 0.09, 0.05), 0.01)
    d += lump(P, (0.43, 0.76, 0.1), (0.04, 0.1, 0.04), 0.006)
    d += lump(P, (-0.42, 1.08, 0.18), (0.12, 0.12, 0.06), 0.01)
    d += lump(P, (-0.47, 0.72, 0.1), (0.05, 0.09, 0.04), 0.006)
    d += lump(P, (0.9, 1.5, 0.075), (0.05, 0.05, 0.03), 0.008)
    d += lump(P, (0.9, 1.6, 0.075), (0.02, 0.02, 0.02), -0.006)
    d += lump(P, (0.93, 1.585, 0.078), (0.025, 0.012, 0.02), 0.004)
    # The nostrils, deep, with a flared rim; the line of the lips; the chin.
    for s in (-1, 1):
        d += lump(P, (1.135, 1.285, s * 0.035), (0.012, 0.016, 0.012), -0.016, False)
        d += lump(P, (1.13, 1.288, s * 0.042), (0.022, 0.026, 0.015), 0.004, False)
    lips = np.exp(-(((P[:, 1] - (1.215 + (P[:, 0] - 1.1) * 0.3)) / 0.006) ** 2)) * smoothstep(1.03, 1.07, P[:, 0])
    d -= 0.005 * lips
    # Tendons down the backs of the cannons; the ribs, faintly; the coat's fine grain.
    for line, z in LEGS:
        x0 = np.interp(P[:, 1], [line[4][1], line[2][1]], [line[4][0], line[2][0]])
        behind = (P[:, 1] > line[4][1]) & (P[:, 1] < line[2][1]) & (np.abs(P[:, 2] - z) < 0.06) & (P[:, 0] < x0 - 0.02)
        d += behind * 0.004
    ribs = smoothstep(0.25, 0.05, np.abs(P[:, 0])) * smoothstep(0.9, 1.0, P[:, 1]) * smoothstep(1.2, 1.1, P[:, 1])
    d += 0.0012 * ribs * np.sin(P[:, 0] * 60)
    d += 0.0008 * fbm(P * 60, 2, 3)
    Q = P + N * d[:, None]
    Q[:, 1] = np.maximum(Q[:, 1], 0.0)
    M.set_points(o, Q)


def hooves():
    out = []
    for i, (line, z) in enumerate(LEGS):
        x = line[-1][0]
        path = np.array([(x + 0.012, 0.0, z), (x + 0.006, 0.035, z), (x, 0.07, z)])
        o = M.tube_mesh(f"hoof{i}", path, np.array([0.05, 0.046, 0.04]), sides=16, cap=True)
        out.append(o)
    return out


def colour_coat(skin):
    """A bay: red-brown, darker along the top, lighter under the belly, black from the knees and hocks down, a dark
    soft muzzle, darker round the eyes, black-rimmed ears, a white blaze down the face."""
    P, N, _ = M.mesh_arrays(skin)
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    bay = np.array([0.52, 0.26, 0.12])
    top = np.array([0.36, 0.17, 0.08])
    belly = np.array([0.6, 0.36, 0.2])
    c = bay[None] * np.ones((len(P), 1))
    c = c + (top - bay)[None] * (smoothstep(1.15, 1.4, y) * (x < 0.75))[:, None] * 0.8
    c = c + (belly - bay)[None] * smoothstep(-0.2, -0.8, N[:, 1])[:, None] * 0.7
    # A sheen of lighter hair over the quarters and shoulder (the coat's own dapples, faint).
    c *= (1 + 0.06 * fbm(P * 9, 3, 11))[:, None]
    black = np.array([0.05, 0.04, 0.035])
    points = np.zeros(len(P))
    for line, zz in LEGS:
        near = np.abs(z - zz) < 0.12
        points = np.maximum(points, near * smoothstep(line[2][1] + 0.1, line[2][1] - 0.04, y) * (y < 0.75))
    c = c * (1 - points[:, None]) + black[None] * points[:, None]
    muzzle = smoothstep(1.03, 1.1, x) * (y < 1.4)
    c = c * (1 - 0.75 * muzzle[:, None]) + np.array([0.12, 0.1, 0.09])[None] * 0.75 * muzzle[:, None]
    for s in (-1, 1):
        e = np.linalg.norm((P - np.array([0.925, 1.58, s * 0.08])) / np.array([0.03, 0.025, 0.03]), axis=1)
        c *= (1 - 0.45 * smoothstep(1.4, 0.6, e))[:, None]
    ear = (y > 1.68) & (x < 0.9)
    c = np.where(ear[:, None], c * 0.35, c)
    # The blaze: a white stripe down the front of the face.
    t = np.clip(((P - POLL) @ (MUZZLE - POLL)) / np.sum((MUZZLE - POLL) ** 2), 0, 1)
    face = (N @ norm(np.array([0.55, 0.83, 0]))) > 0.2
    width = 0.012 + 0.016 * np.sin(t * math.pi) ** 0.5
    blaze = face * (np.abs(z) < width + 0.004 * fbm(P * 30, 2, 4)) * smoothstep(0.12, 0.2, t) * smoothstep(0.92, 0.82, t) * (x > 0.86)
    c = c * (1 - blaze[:, None]) + np.array([0.9, 0.88, 0.84])[None] * blaze[:, None]
    M.paint_vertices(skin, M.srgb_lin(np.clip(c, 0, 1)))


def colour_hooves(hs):
    for o in hs:
        P = b2g(np.array([v.co for v in o.data.vertices]))
        streak = 0.85 + 0.15 * np.sin(np.arctan2(P[:, 2], P[:, 0]) * 9 + fbm(P * 40, 2, 2) * 3)
        c = np.array([0.16, 0.14, 0.12])[None] * streak[:, None]
        M.paint_vertices(o, M.srgb_lin(c))


# ─────────────── the mane, the forelock, the tail ───────────────


def cast_down(bvh, x, z):
    loc, nrm, _, _ = bvh.ray_cast(Vector(g2b((x, 3.0, z)).tolist()), Vector((0, 0, -1)))
    return (b2g(np.array(loc)), b2g(np.array(nrm))) if loc else (None, None)


def paths_from(roots, d0, L, heavy, bvh, S=7, wave=0.0):
    """Each lock's line from its root along d0, bending down by `heavy`, kept out of the skin."""
    down = np.array([0, -1.0, 0])
    out = np.zeros((len(roots), S + 1, 3))
    out[:, 0] = roots
    d = norm(d0)
    for k in range(1, S + 1):
        d = norm(d + down * heavy[:, None] + RNG.normal(0, 0.04, d.shape) + wave * np.array([0, 0, 1.0]) * math.sin(k * 1.3))
        out[:, k] = out[:, k - 1] + d * (L / S)[:, None]
    for i in range(len(roots)):
        for k in range(1, S + 1):
            q = Vector(g2b(out[i, k]).tolist())
            loc, nrm, _, _ = bvh.find_nearest(q)
            if loc is None:
                continue
            off = (q - loc).dot(nrm)
            if off < 0.006:
                out[i, k] = b2g(np.array(q + nrm * (0.006 - off)))
    return out


def hair(skin):
    """The locks of the mane (falling to the near side), the forelock and the tail: (paths, root normals, lengths,
    clump radii)."""
    bvh = BVHTree.FromObject(skin, bpy.context.evaluated_depsgraph_get())
    P, N, L, D, H, R = [], [], [], [], [], []
    # The mane along the crest, from the poll to the withers.
    for x in np.linspace(0.37, 0.83, 230):
        for _ in range(2):
            zz = RNG.uniform(-0.012, 0.012)
            p, n = cast_down(bvh, x + RNG.uniform(-0.004, 0.004), zz)
            if p is None:
                continue
            t = (x - 0.37) / 0.46
            P.append(p - n * 0.004)
            N.append(n)
            L.append((0.13 + 0.09 * math.sin(t * math.pi) ** 0.6) * RNG.uniform(0.85, 1.1))
            D.append(norm(np.array([-0.15, 0.55, 1.0]) + RNG.normal(0, 0.15, 3)))
            H.append(0.22)
            R.append(0.014)
    # The forelock over the brow.
    for _ in range(40):
        x = RNG.uniform(0.82, 0.88)
        p, n = cast_down(bvh, x, RNG.uniform(-0.02, 0.02))
        if p is None:
            continue
        P.append(p - n * 0.004)
        N.append(n)
        L.append(RNG.uniform(0.1, 0.14))
        D.append(norm(np.array([1.0, 0.5, RNG.uniform(-0.3, 0.3)])))
        H.append(0.3)
        R.append(0.012)
    # The tail from its dock, falling to above the hocks.
    Ps, Ns, _ = M.mesh_arrays(skin)
    dock = (Ps[:, 0] < -0.6) & (Ps[:, 1] > 1.06) & (np.abs(Ps[:, 2]) < 0.06) & (Ns[:, 0] < 0.2)
    idx = np.flatnonzero(dock)
    for i in RNG.choice(idx, min(420, len(idx)), replace=len(idx) < 420):
        P.append(Ps[i] - Ns[i] * 0.004)
        N.append(Ns[i])
        L.append(RNG.uniform(0.5, 0.64))
        D.append(norm(np.array([-0.7, -0.2, 0]) + Ns[i] * 0.4 + RNG.normal(0, 0.1, 3)))
        H.append(0.32)
        R.append(0.02)
    P, N, L, D, H, R = map(np.array, (P, N, L, D, H, R))
    paths = paths_from(P, D, L, H, bvh)
    print("HAIR", len(P), "locks")
    return paths, N, L, R


def strands(paths, normals, R, name):
    """Fine black ribbons, a clump to each lock, spread at the root and drawn together toward the tip."""
    S = paths.shape[1] - 1
    per = 14
    lock_of = np.repeat(np.arange(len(paths)), per)
    n = len(lock_of)
    rl = R[lock_of]
    tang = norm(np.cross(normals[lock_of], RNG.normal(0, 1, (n, 3))))
    off = tang * (rl * np.sqrt(RNG.random(n)))[:, None]
    f = np.linspace(0, 1, S + 1)
    scale = RNG.uniform(0.75, 1.03, n)
    u = np.clip(f[None, :] * scale[:, None], 0, 1) * S
    i0 = np.minimum(np.floor(u).astype(int), S - 1)
    tt = (u - i0)[..., None]
    lp = paths[lock_of]
    pts = np.take_along_axis(lp, i0[..., None].repeat(3, 2), 1) * (1 - tt) + np.take_along_axis(lp, (i0 + 1)[..., None].repeat(3, 2), 1) * tt
    pts = pts + off[:, None, :] * (1 - 0.6 * f[None, :, None]) + RNG.normal(0, 1, pts.shape) * (rl[:, None, None] * 0.15 * f[None, :, None])
    seg = np.gradient(pts, axis=1)
    side = norm(np.cross(seg, normals[lock_of][:, None, :]))
    width = (0.0026 * (1 - 0.6 * f))[None, :, None]
    V = np.stack([pts - side * width, pts + side * width], 2).reshape(-1, 3)
    base = (np.arange(n) * (S + 1) * 2)[:, None] + np.arange(S)[None, :] * 2
    F = np.stack([base, base + 1, base + 3, base + 2], -1).reshape(-1, 4)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V))
    me.vertices.foreach_set("co", g2b(V).reshape(-1).astype(np.float32))
    me.loops.add(len(F) * 4)
    me.loops.foreach_set("vertex_index", F.reshape(-1).astype(np.int32))
    me.polygons.add(len(F))
    me.polygons.foreach_set("loop_start", (np.arange(len(F)) * 4).astype(np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(F), 4, dtype=np.int32))
    me.update(calc_edges=True)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    # Black, a few strands browner, the tips a little sun-faded.
    c = np.array([0.06, 0.045, 0.035])[None] * RNG.uniform(0.8, 1.6, (n, 1))
    c = c + np.array([0.11, 0.06, 0.025])[None] * (RNG.random((n, 1)) < 0.3) * RNG.random((n, 1))
    col = c[:, None, :] * (0.7 + 0.5 * f[None, :, None])
    col = np.repeat(col[:, :, None, :], 2, 2).reshape(-1, 3)
    M.paint_vertices(o, M.srgb_lin(np.clip(col, 0, 1)))
    return o


def tubes(paths, normals, R, sides=6):
    S = paths.shape[1] - 1
    f = np.linspace(0, 1, S + 1)
    m = len(paths)
    r = R[:, None] * (1.1 - 0.6 * f)[None, :] + 0.003
    t = norm(np.gradient(paths, axis=1))
    a = norm(np.cross(t, normals[:, None, :]))
    b = np.cross(t, a)
    ang = 2 * np.pi * np.arange(sides) / sides
    ring = paths[:, :, None, :] + r[:, :, None, None] * (a[:, :, None, :] * np.cos(ang)[None, None, :, None] + b[:, :, None, :] * np.sin(ang)[None, None, :, None])
    V = ring.reshape(m, (S + 1) * sides, 3)
    V = np.concatenate([V, (paths[:, -1] + t[:, -1] * r[:, -1:])[:, None], (paths[:, 0] - t[:, 0] * 0.015)[:, None]], 1)
    per = V.shape[1]
    F = [(i * sides + k, i * sides + (k + 1) % sides, (i + 1) * sides + (k + 1) % sides, (i + 1) * sides + k) for i in range(S) for k in range(sides)]
    F += [(S * sides + k, S * sides + (k + 1) % sides, per - 2, per - 2) for k in range(sides)]
    F += [((k + 1) % sides, k, per - 1, per - 1) for k in range(sides)]
    F = np.array(F)
    Fs = (F[None] + (np.arange(m) * per)[:, None, None]).reshape(-1, 4)
    return M.mesh_from("hairTubes", V.reshape(-1, 3), Fs)


def make_shell(skin, hs, paths, normals, R):
    sk = skin.copy()
    sk.data = skin.data.copy()
    bpy.context.scene.collection.objects.link(sk)
    tb = tubes(paths, normals, R)
    bpy.ops.object.select_all(action="DESELECT")
    sk.select_set(True)
    tb.select_set(True)
    bpy.context.view_layer.objects.active = sk
    bpy.ops.object.join()
    shell = bpy.context.view_layer.objects.active
    shell.name = "shell"
    M.apply(shell, ("REMESH", {"mode": "VOXEL", "voxel_size": 0.008}), ("SMOOTH", {"factor": 0.4, "iterations": 1}))
    n = len(shell.data.polygons)
    M.apply(shell, ("DECIMATE", {"ratio": min(1.0, TRIS / max(1, n * 2))}), ("TRIANGULATE", {}))
    V = b2g(np.array([v.co for v in shell.data.vertices]))
    V[:, 1] = np.maximum(V[:, 1], 0.0)
    M.set_points(shell, V)
    n_body = len(shell.data.vertices)
    low = []
    for h in hs:
        c = h.copy()
        c.data = h.data.copy()
        bpy.context.scene.collection.objects.link(c)
        low.append(c)
    bpy.ops.object.select_all(action="DESELECT")
    for o in (shell, *low):
        o.select_set(True)
    bpy.context.view_layer.objects.active = shell
    bpy.ops.object.join()
    shell = bpy.context.view_layer.objects.active
    shell.data.polygons.foreach_set("use_smooth", [True] * len(shell.data.polygons))
    print("SHELL", n, "->", len(shell.data.polygons))
    return shell, n_body


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
    b.cage_extrusion = 0.02
    b.max_ray_distance = 0.05
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
        world.light_settings.distance = 0.12
        bpy.ops.object.bake(type="AO")


# ─────────────── the tack ───────────────
HEM = 0.6


def smooth_grid(r, raw, passes=5, lift=0.014):
    for _ in range(passes):
        r = np.maximum(r, raw)
        r[1:-1] = (r[:-2] + r[1:-1] * 2 + r[2:]) / 4
        r[:, 1:-1] = (r[:, :-2] + r[:, 1:-1] * 2 + r[:, 2:]) / 4
    return np.maximum(r, raw) + lift


def slab(top, thick, inner_dir):
    """A cloth or leather sheet (rows × cols points) with a thickness: its faces, front and back, and its rims."""
    ni, nj = top.shape[:2]
    bot = top - inner_dir * thick
    V = np.concatenate([top.reshape(-1, 3), bot.reshape(-1, 3)])
    off = ni * nj
    F, edge = [], []
    for i in range(ni - 1):
        for j in range(nj - 1):
            a, b, c, d = i * nj + j, (i + 1) * nj + j, (i + 1) * nj + j + 1, i * nj + j + 1
            F.append((a, b, c, d))
            F.append((d + off, c + off, b + off, a + off))
            edge.append(i in (0, ni - 2) or j in (0, nj - 2))
            edge.append(edge[-1])
    for i in range(ni - 1):
        for j in (0, nj - 1):
            a, b = i * nj + j, (i + 1) * nj + j
            F.append((a, a + off, b + off, b) if j == 0 else (b, b + off, a + off, a))
            edge.append(True)
    for j in range(nj - 1):
        for i in (0, ni - 1):
            a, b = i * nj + j, i * nj + j + 1
            F.append((b, b + off, a + off, a) if i == 0 else (a, a + off, b + off, b))
            edge.append(True)
    return V, np.array(F), np.array(edge)


def caparison(bvh):
    """Over the back from the withers to the croup, and down each side, hanging straight in folds to above the knees;
    its rows run from the near hem over the top to the far hem."""
    xs = np.linspace(-0.6, 0.44, 34)
    angs = np.linspace(-math.pi / 2, math.pi / 2, 21)
    cy = 1.07
    arc = np.array([M.ring_cast(bvh, x, angs, cy)[0] for x in xs])
    c = np.array([[[x, cy, 0]] for x in xs])
    raw = np.linalg.norm(arc - c, axis=2)
    r = smooth_grid(raw.copy(), raw, lift=0.014)
    dirs = np.stack([np.zeros_like(r), np.cos(angs)[None].repeat(len(xs), 0), np.sin(angs)[None].repeat(len(xs), 0)], 2)
    top = c + dirs * r[..., None]
    drops = 7
    cols = []
    for i, x in enumerate(xs):
        col = []
        for k in range(drops, 0, -1):
            f = k / drops
            p = top[i, 0].copy()
            p[1] = p[1] + (HEM - p[1]) * f
            p[2] = p[2] - 0.025 * f - 0.012 * f * math.sin(x * 34)
            col.append(p)
        col += list(top[i])
        for k in range(1, drops + 1):
            f = k / drops
            p = top[i, -1].copy()
            p[1] = p[1] + (HEM - p[1]) * f
            p[2] = p[2] + 0.025 * f + 0.012 * f * math.sin(x * 34 + 1)
            col.append(p)
        cols.append(col)
    grid = np.array(cols)
    inner = norm(grid - np.array([[[0, cy, 0]]]) * np.array([0, 1, 0]) - grid * np.array([1, 0, 0]))
    V, F, edge = slab(grid, 0.01, inner)
    # Its hem and edges gold; a gold boss on each flank.
    nj = grid.shape[1]
    team = [f for f, e in zip(F, edge) if not e]
    gold = [f for f, e in zip(F, edge) if e]
    bosses = []
    for side in (0, nj - 1):
        i = int(np.argmin(np.abs(xs + 0.05)))
        j = int(np.argmin(np.abs(grid[i, :, 1] - 0.88) + (np.abs(np.arange(nj) - side) > nj / 2) * 9))
        p = grid[i, j]
        out = np.array([0, 0, np.sign(p[2])])
        path = np.array([p, p + out * 0.012])
        bosses.append(M.tube_mesh("boss", path, np.array([0.1, 0.1]), sides=24, cap=True))
        bosses.append(M.tube_mesh("bossc", np.array([p + out * 0.01, p + out * 0.03]), np.array([0.035, 0.02]), sides=14, cap=True))
    return V, team, gold, bosses, grid


def saddle(cap_grid, xs_range=(-0.24, 0.13)):
    """The saddle on the caparison over the back: its seat dipped, the pommel and cantle raised, flaps down the sides."""
    xs = np.linspace(*xs_range, 14)
    nj = cap_grid.shape[1]
    mid = nj // 2
    capx = cap_grid[:, mid, 0]
    rows = []
    for x in xs:
        i = int(np.argmin(np.abs(capx - x)))
        sl = cap_grid[max(i - 1, 0) : i + 2, mid - 7 : mid + 8].mean(0)
        centre = np.array([x, 1.07, 0])
        sl[:, 0] = x
        d = norm(sl - centre)
        u = (x - xs_range[0]) / (xs_range[1] - xs_range[0])
        raise_ = 0.02 + 0.07 * smoothstep(0.75, 1.0, u) + 0.09 * smoothstep(0.2, 0.0, u)
        across = np.linspace(-1, 1, len(sl))
        lift = raise_ * np.clip(1 - across ** 2 * 2.2, 0, 1) + 0.024
        rows.append(sl + d * lift[:, None])
    grid = np.array(rows)
    inner = norm(grid - np.array([0, 1.07, 0]) * np.array([0, 1, 0]) - grid * np.array([1, 0, 0]))
    V, F, _ = slab(grid, 0.025, inner)
    seat_y = float(grid[int(len(xs) * 0.45), grid.shape[1] // 2, 1])
    return V, F, seat_y


def head_frame(t):
    axis = norm(MUZZLE - POLL)
    c = POLL + (MUZZLE - POLL) * t
    n1 = norm(np.cross(np.array([0, 0, 1.0]), axis))
    n2 = np.array([0, 0, 1.0])
    return c, axis, n1, n2


def ring_on(bvh, t, phis, lift=0.006, tilt=0.0):
    """Points round the head at t (0 the poll, 1 the muzzle) at angles phis (0 the top), on its skin."""
    c, axis, n1, n2 = head_frame(t)
    out = []
    for ph in phis:
        d = norm(n1 * math.cos(ph) + n2 * math.sin(ph) + axis * tilt * math.cos(ph))
        loc, nrm, _, _ = bvh.ray_cast(Vector(g2b(c + d * 0.5).tolist()), Vector(g2b(-d).tolist()))
        out.append(b2g(np.array(loc)) + d * lift if loc else c + d * 0.08)
    return np.array(out)


def onto(bvh, pts, lift=0.006):
    out = []
    for p in pts:
        loc, nrm, _, _ = bvh.find_nearest(Vector(g2b(p).tolist()))
        out.append(b2g(np.array(loc)) + b2g(np.array(nrm)) * lift)
    return np.array(out)


def bridle(bvh):
    """The headstall's straps (the crownpiece behind the ears down to the cheeks, the browband, the noseband, the
    throatlatch) as thin leather tubes on the head, the cheekpieces down to the bits; and the bits' iron rings."""
    straps = []
    full = np.linspace(-math.pi, math.pi, 33)
    straps.append(ring_on(bvh, 0.66, full))
    front = np.linspace(-1.4, 1.4, 15)
    straps.append(ring_on(bvh, 0.07, front, tilt=0.6))
    crown = ring_on(bvh, -0.04, np.linspace(-math.pi / 2, math.pi / 2, 15))
    straps.append(crown)
    straps.append(ring_on(bvh, 0.02, np.linspace(math.pi / 2, 3 * math.pi / 2, 15), tilt=-0.9))
    bits = []
    for s, end in ((-1, crown[0]), (1, crown[-1])):
        bit = onto(bvh, [np.array([1.075, 1.235, s * 0.06])], lift=0.004)[0]
        line = np.array([end + (bit - end) * u for u in np.linspace(0, 1, 12)])
        straps.append(onto(bvh, line))
        bits.append(bit)
    tubes = [M.tube_mesh("strap", st, np.full(len(st), 0.0065), sides=6, cap=False) for st in straps]
    rings = []
    for s, bit in zip((-1, 1), bits):
        ang = np.linspace(0, 2 * math.pi, 17)
        ring = np.array([bit + np.array([0.022 * math.cos(a), 0.022 * math.sin(a), s * 0.004]) for a in ang])
        rings.append(M.tube_mesh("bit", ring, np.full(len(ring), 0.004), sides=6, cap=False))
    return tubes, rings, bits


def objs_arrays(objs):
    Ps, Ns, Ts, n = [], [], [], 0
    for o in objs:
        P, N, T = M.mesh_arrays(o)
        Ps.append(P)
        Ns.append(N)
        Ts.append(T + n)
        n += len(P)
    return np.concatenate(Ps), np.concatenate(Ns), np.concatenate(Ts)


def weights(P, hoof_mask):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    n = len(P)
    W = np.zeros((n, len(BONES)))
    W[:, BI["head"]] = smoothstep(0.4, 0.58, x) * smoothstep(1.02, 1.2, y)
    W[:, BI["tail"]] = smoothstep(-0.6, -0.68, x) * (np.abs(z) < 0.16) * (y > 0.4)
    for i, (line, zz) in enumerate(LEGS):
        pts = np.array(line)
        seg = M.catmull(pts, 6)
        d2 = np.min(np.hypot(x[:, None] - seg[None, :, 0], y[:, None] - seg[None, :, 1]), axis=1)
        inleg = smoothstep(0.15, 0.1, d2) * smoothstep(0.13, 0.085, np.abs(z - zz)) * smoothstep(0.98, 0.84, y)
        knee = inleg * smoothstep(line[2][1] + 0.05, line[2][1] - 0.05, y)
        W[:, BI[f"leg{i}"]] = inleg - knee
        W[:, BI[f"knee{i}"]] = knee
        W[hoof_mask[i]] = 0
        W[hoof_mask[i], BI[f"knee{i}"]] = 1
    W[:, BI["head"]] *= 1 - W[:, [BI[f"leg{i}"] for i in range(4)]].sum(1).clip(0, 1)
    W[:, BI["beast"]] = np.clip(1 - W.sum(1), 0, 1)
    order = np.argsort(-W, 1)
    j0, j1 = order[:, 0], order[:, 1]
    w0, w1 = W[np.arange(n), j0], W[np.arange(n), j1]
    return np.stack([j0, j1], 1), w0 / np.maximum(w0 + w1, 1e-9)


def rigid(n, bone):
    return np.tile(np.array([BI[bone], BI[bone]]), (n, 1)), np.ones(n)


def plain(P, N, T, bone, light=0.9):
    j, w = rigid(len(P), bone)
    return {"P": P, "N": N, "U": np.zeros((len(P), 2)), "J": j, "W": w, "A": np.full(len(P), light), "C0": np.zeros((len(P), 3)), "T": T}


if __name__ == "__main__":
    reset()
    skin = skin_object()
    sculpt(skin)
    skin.data.polygons.foreach_set("use_smooth", [True] * len(skin.data.polygons))
    hs = hooves()
    colour_coat(skin)
    colour_hooves(hs)
    vm = M.material("vcol", attr="col", rough=0.45)
    for o in (skin, *hs):
        o.data.materials.clear()
        o.data.materials.append(vm)
        o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
    print("SKIN", len(skin.data.vertices), "verts")
    if os.environ.get("STAGE") == "skin":
        M.preview(os.path.join(WORK, "skin.png"), [skin, *hs], eye=(2.6, 1.5, 2.6), look=(0.25, 0.9, 0.0))
        M.preview(os.path.join(WORK, "skin-side.png"), [skin, *hs], eye=(0.2, 1.0, 4.4), look=(0.2, 0.95, 0))
        M.preview(os.path.join(WORK, "skin-head.png"), [skin, *hs], eye=(1.9, 1.75, 0.9), look=(0.95, 1.45, 0.0))
        sys.exit(0)
    paths, hn, hl, hr = hair(skin)
    mane = strands(paths, hn, hr, "mane")
    mane.data.materials.append(vm)
    if os.environ.get("STAGE") == "hair":
        M.preview(os.path.join(WORK, "hair.png"), [skin, mane, *hs], eye=(2.6, 1.5, 2.6), look=(0.25, 0.9, 0.0), samples=24)
        M.preview(os.path.join(WORK, "hair-side.png"), [skin, mane, *hs], eye=(0.2, 1.0, 4.4), look=(0.2, 0.95, 0), samples=24)
        sys.exit(0)
    shell, n_body = make_shell(skin, hs, paths, hn, hr)
    M.unwrap(shell)
    bm = bpy.data.materials.new("bakem")
    bm.use_nodes = True
    node = bm.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = "bake"
    shell.data.materials.clear()
    shell.data.materials.append(bm)
    highs = [skin, mane, *hs]
    col, nrm, ao = M.new_image("col", HTEX), M.new_image("nrm", HTEX, True), M.new_image("ao", HTEX, True)
    bake(shell, highs, col, "COLOR", 8)
    bake(shell, highs, nrm, "NORMAL", 8)
    bake(shell, highs, ao, "AO", SAMPLES)
    C, Nm, A = M.pixels(col), M.pixels(nrm), M.pixels(ao)
    final = np.clip(C[..., :3] * (0.45 + 0.55 * A[..., :1]), 0, 1)
    tex = os.path.join(WORK, "tex")
    os.makedirs(tex, exist_ok=True)
    M.save_png(final, os.path.join(tex, "horse.png"), data=True)
    M.save_png(Nm[..., :3], os.path.join(tex, "horse_n.png"), data=True)
    P, N, U, T, vi = M.split_by_uv(shell)
    nh = len(shell.data.vertices) - n_body
    hoof_mask = []
    per = nh // 4
    for i in range(4):
        hoof_mask.append((vi >= n_body + i * per) & (vi < n_body + (i + 1) * per))
    J, Wt = weights(P, hoof_mask)
    prims = {"tex:horse": {"P": P, "N": N, "U": np.stack([U[:, 0], 1 - U[:, 1]], 1), "J": J, "W": Wt, "A": np.ones(len(P)), "C0": M.sample(final, U), "T": T}}
    sbvh = BVHTree.FromObject(shell, bpy.context.evaluated_depsgraph_get())
    # The eyes, dark and glossy, in their sockets.
    eyes = []
    for s in (-1, 1):
        loc, nr, _, _ = sbvh.find_nearest(Vector(g2b((0.925, 1.585, s * 0.09)).tolist()))
        c = b2g(np.array(loc)) - b2g(np.array(nr)) * 0.006
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.019)
        eo = bpy.context.active_object
        ep, en, et = M.mesh_arrays(eo)
        bpy.data.objects.remove(eo)
        eyes.append((ep * np.array([1.2, 0.9, 0.75]) + c, en, et))
    prims["pupil"] = plain(np.concatenate([e[0] for e in eyes]), np.concatenate([e[1] for e in eyes]), np.concatenate([eyes[0][2], eyes[1][2] + len(eyes[0][0])]), "head", 1.0)
    V, team, gold, bosses, cap_grid = caparison(sbvh)
    tp, tn, tt = M.tri_arrays(V, team)
    prims["team"] = plain(tp, tn, tt, "beast")
    gp, gn, gt = M.tri_arrays(V, gold)
    bp, bn, bt = objs_arrays(bosses)
    prims["gold"] = plain(np.concatenate([gp, bp]), np.concatenate([gn, bn]), np.concatenate([gt, bt + len(gp)]), "beast", 1.0)
    SV, SF, seat_y = saddle(cap_grid)
    sp, sn, st = M.tri_arrays(SV, SF)
    straps, rings, bits = bridle(sbvh)
    hp, hn2, ht = objs_arrays(straps)
    lt = {"P": np.concatenate([sp, hp]), "N": np.concatenate([sn, hn2])}
    js, ws = rigid(len(sp), "beast")
    jh, wh = rigid(len(hp), "head")
    prims["leatherDark"] = {"P": lt["P"], "N": lt["N"], "U": np.zeros((len(lt["P"]), 2)), "J": np.concatenate([js, jh]), "W": np.concatenate([ws, wh]), "A": np.full(len(lt["P"]), 0.9), "C0": np.zeros((len(lt["P"]), 3)), "T": np.concatenate([st, ht + len(sp)])}
    ip, inn, it = objs_arrays(rings)
    prims["iron"] = plain(ip, inn, it, "head", 1.0)
    JOINTS["seat"] = (JOINTS["seat"][0], seat_y, 0.0)
    for i, b in enumerate(bits):
        JOINTS[f"bit{i}"] = tuple(float(v) for v in b)
    size = M.write_glb(os.path.join(OUT, "b1.glb"), prims, {"bones": BONES, "joints": {k: [round(float(c), 4) for c in v] for k, v in JOINTS.items()}})
    tris = sum(len(d["T"]) for d in prims.values())
    print(f"DONE b1.glb: {size} bytes, {tris} triangles, {len(P)} shell vertices; seat {JOINTS['seat']}")
    if os.environ.get("PREVIEW"):
        M.preview(os.path.join(WORK, "beauty.png"), [skin, mane, *hs], eye=(2.6, 1.5, 2.6), look=(0.25, 0.9, 0.0), samples=32)
