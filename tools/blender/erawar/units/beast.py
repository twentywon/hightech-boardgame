"""
The mounts of 시대 전쟁, sculpted in Blender (see ../README.md): the knight's horse — a deep chest, the withers, a
dipped back and round quarters, muscled forearms and gaskins over slim cannons, fetlocks and hooves, an arched neck
with its mane, a long head with jowls, ears, eyes and nostrils, a flowing tail — barded in a caparison of the side's
colour hemmed in gold, with a saddle, an iron chanfron and a bridle; and the woolly mammoth — a hump over the
shoulders, a back sloping to the rump, long shaggy hair hanging in a fringe, a domed head with flapping ears, curling
tusks and a wrinkled trunk, pillar legs with toenails — under a blanket of the side's colour. Skinned on the game's
joints: the body, the head (and the trunk and ears), four legs with their knees, the tail.

    blender -b --python beast.py -- <out dir> [horse|mammoth ...]

writes b1.glb (the horse) and b0.glb (the mammoth).
"""
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from lib import *  # noqa

# ─────────────── the horse ───────────────
HORSE_BONES = ["beast", "head", "leg0", "knee0", "leg1", "knee1", "leg2", "knee2", "leg3", "knee3", "tail"]
HB = {n: i for i, n in enumerate(HORSE_BONES)}
HORSE_LEGS = [(0.38, -0.13), (0.38, 0.13), (-0.4, -0.13), (-0.4, 0.13)]
# The barrel: (x, centre height, half height, half width).
BARREL = [(-0.67, 1.1, 0.1, 0.09), (-0.6, 1.09, 0.2, 0.18), (-0.47, 1.07, 0.255, 0.225), (-0.25, 1.03, 0.255, 0.215), (0.0, 1.01, 0.265, 0.218), (0.25, 1.0, 0.285, 0.225), (0.44, 1.03, 0.285, 0.215), (0.58, 1.06, 0.22, 0.17), (0.66, 1.09, 0.1, 0.1)]


def barrel_at(x):
    xs = [r[0] for r in BARREL]
    return [float(np.interp(x, xs, [r[k] for r in BARREL])) for k in range(1, 4)]


def horse():
    P = []
    body = loft([{"c": (x, cy, 0), "a": a, "b": b, "p": 2.2, "u": (0, 1, 0)} for x, cy, a, b in BARREL], n=18, paint="horse", up=(0, 1, 0))

    def body_shape(Pt, N, paints):
        d = np.zeros(len(Pt))
        for s in (-1, 1):
            d += bump(Pt, (0.42, 0.97, s * 0.2), 0.12, 0.022, (1, 1.4, 1))
            d += bump(Pt, (-0.44, 1.1, s * 0.21), 0.15, 0.024)
            d += bump(Pt, (-0.2, 0.96, s * 0.2), 0.1, -0.008, (2.0, 0.6, 1))
        d += bump(Pt, (0.38, 1.3, 0), 0.08, 0.025, (1.2, 0.7, 1))
        return d

    P.append(Part("body", body, rigid(HB["beast"]), subdiv=1).push(body_shape))
    # The neck, arched, from the withers to the poll, and the head down to the muzzle.
    neck_pts = catmull(np.array([(0.36, 1.1, 0), (0.5, 1.3, 0), (0.63, 1.47, 0), (0.73, 1.59, 0)]), 8)
    radii = np.linspace(0, 1, len(neck_pts))
    neck = loft([{"c": c, "a": 0.17 - 0.085 * t, "b": 0.135 - 0.065 * t, "u": (-1, 1, 0)} for c, t in zip(neck_pts, radii)], n=12, paint="horse", up=(-1, 1, 0))
    head_pts = catmull(np.array([(0.7, 1.63, 0), (0.78, 1.55, 0), (0.88, 1.43, 0), (0.96, 1.33, 0), (1.0, 1.27, 0)]), 8)
    hr = [(0.075, 0.07), (0.1, 0.092), (0.092, 0.08), (0.075, 0.066), (0.065, 0.058), (0.06, 0.056), (0.056, 0.054), (0.05, 0.05)]
    head = loft([{"c": c, "a": a, "b": b, "u": (1, 1, 0)} for c, (a, b) in zip(head_pts, hr)], n=12, paint="horse", up=(1, 1, 0), cap_len=0.03)

    def head_shape(Pt, N, paints):
        d = np.zeros(len(Pt))
        for s in (-1, 1):
            d += bump(Pt, (0.76, 1.5, s * 0.06), 0.06, 0.02)
            d -= bump(Pt, (1.01, 1.27, s * 0.03), 0.014, 0.006)
            d += bump(Pt, (0.82, 1.56, s * 0.07), 0.025, 0.006)
        return d

    neck_rig = chain([HB["beast"], HB["head"]], [((0.44, 1.18, 0), (0.7, 0.7, 0), 0.06)])
    P.append(Part("neck", neck, neck_rig, subdiv=1))
    P.append(Part("head", head, rigid(HB["head"]), subdiv=1).push(head_shape))
    ears = []
    for s in (-1, 1):
        ear = lathe([(0.0, 0.0), (0.026, 0.0), (0.028, 0.04), (0.016, 0.08), (0.0, 0.1)], 8, "horse", 1.0, 0.6)
        ears.append(ear.moved(at(0.72, 1.64, s * 0.05) @ rot("x", -s * 0.25) @ rot("z", -0.25)))
        ears.append(ellipsoid((0.016, 0.02, 0.012), (0.83, 1.56, s * 0.082), "pupil", 8, 6))
    P.append(Part("ears", Shape.join(ears), rigid(HB["head"])))
    # The mane along the crest, and the forelock.
    crest = catmull(np.array([(0.4, 1.3, 0), (0.52, 1.45, 0), (0.64, 1.6, 0), (0.71, 1.68, 0)]), 12)
    mane = loft([{"c": c + (0, 0.02, 0), "a": 0.07 - 0.02 * t, "b": 0.022, "u": (-1, 1, 0)} for c, t in zip(crest, np.linspace(0, 1, len(crest)))], n=10, paint="mane", up=(-1, 1, 0))
    mane_rig = chain([HB["beast"], HB["head"]], [((0.44, 1.18, 0), (0.7, 0.7, 0), 0.06)])
    P.append(Part("mane", mane, mane_rig, subdiv=1))
    P.append(Part("forelock", tube([(0.72, 1.67, 0), (0.78, 1.63, 0.0), (0.82, 1.56, 0.0)], 0.025, 0.012, n=8, paint="mane"), rigid(HB["head"])))
    # Legs: fore (forearm, knee, cannon, fetlock) and hind (gaskin, hock), each into a hoof.
    fore = [(0.98, 0.0, 0.1, 0.085), (0.86, 0.01, 0.11, 0.086), (0.72, 0.01, 0.085, 0.07), (0.58, 0.0, 0.058, 0.054), (0.49, 0.003, 0.054, 0.05), (0.41, 0.0, 0.043, 0.039), (0.26, -0.005, 0.039, 0.035), (0.16, -0.012, 0.05, 0.045), (0.1, 0.006, 0.04, 0.038), (0.07, 0.012, 0.042, 0.04)]
    hind = [(1.02, 0.0, 0.15, 0.11), (0.86, 0.01, 0.14, 0.1), (0.72, 0.025, 0.09, 0.07), (0.6, -0.02, 0.062, 0.055), (0.5, -0.03, 0.055, 0.05), (0.41, -0.01, 0.043, 0.039), (0.26, -0.005, 0.039, 0.035), (0.16, -0.012, 0.05, 0.045), (0.1, 0.006, 0.04, 0.038), (0.07, 0.012, 0.042, 0.04)]
    for i, (x, z) in enumerate(HORSE_LEGS):
        rows = fore if i < 2 else hind
        leg = loft([{"c": (x + dx, y, z), "a": a, "b": b} for y, dx, a, b in rows], n=9, paint="horse", up=(1, 0, 0))
        rig = chain([HB["beast"], HB[f"leg{i}"], HB[f"knee{i}"]], [((x, 0.85, z), (0, -1, 0), 0.07), ((x, 0.46, z), (0, -1, 0), 0.04)])
        P.append(Part(f"leg{i}", leg, rig, subdiv=1))
        hoof = lathe([(0.0, 0.0), (0.062, 0.0), (0.058, 0.04), (0.047, 0.08), (0.0, 0.08)], 14, "black", 1.1, 1.0)
        P.append(Part(f"hoof{i}", hoof.moved(at(x + 0.018, 0, z)), rigid(HB[f"knee{i}"]), subdiv=1, sharp=50))
    # The tail, from the dock, sweeping down.
    tail = tube([(-0.6, 1.16, 0), (-0.7, 1.12, 0), (-0.77, 0.95, 0), (-0.79, 0.75, 0), (-0.77, 0.6, 0)], 0.05, 0.03, n=10, paint="mane")
    P.append(Part("tail", tail, chain([HB["beast"], HB["tail"]], [((-0.6, 1.12, 0), (-1, 0, 0), 0.03)]), subdiv=1))
    # The barding: a caparison over the back and down both flanks to above the knees, hemmed and badged in gold.
    xs = np.linspace(-0.6, 0.58, 16)
    cols = []
    angs = np.linspace(-np.pi / 2, np.pi / 2, 11)
    for x in xs:
        cy, a, b = barrel_at(x)
        col = []
        for drop in np.linspace(0.6, 0.0, 4):
            col.append((x, cy - (cy - 0.6) * drop / 0.6 * 1.0 if drop > 0 else cy, -(b + 0.035 + 0.04 * drop)))
        for t in angs[1:-1]:
            e = 2 / 2.2
            c, s = math.cos(t), math.sin(t)
            col.append((x, cy + (a + 0.03) * math.copysign(abs(c) ** e, c), (b + 0.035) * math.copysign(abs(s) ** e, s)))
        for drop in np.linspace(0.0, 0.6, 4):
            col.append((x, cy - (cy - 0.6) * drop / 0.6 if drop > 0 else cy, b + 0.035 + 0.04 * drop))
        cols.append(col)
    V = np.array(cols).reshape(-1, 3)
    m = len(cols[0])
    F = [(i * m + j, i * m + j + 1, (i + 1) * m + j + 1, (i + 1) * m + j) for i in range(len(xs) - 1) for j in range(m - 1)]
    cap = Shape(V, F, "team")
    # Folds hanging down the flanks.
    hang = np.abs(V[:, 2]) > 0.2
    V[:, 2] += np.where(hang, np.sign(V[:, 2]) * 0.012 * np.sin(V[:, 0] * 34) * smoothstep(1.0, 0.6, V[:, 1]), 0)
    P.append(Part("caparison", cap, rigid(HB["beast"]), subdiv=1, outward=("axis", (0, 0, 0))))
    hems = []
    for s in (-1, 1):
        hems.append(loft([{"c": (x, 0.62, s * (barrel_at(x)[2] + 0.077)), "a": 0.022, "b": 0.006, "u": (0, 1, 0)} for x in np.linspace(-0.6, 0.58, 12)], n=6, paint="gold", up=(0, 1, 0)))
        hems.append(lathe([(0.0, 0.0), (0.11, 0.0), (0.11, 0.012), (0.0, 0.012)], 18, "gold").moved(at(-0.05, 0.86, s * (barrel_at(-0.05)[2] + 0.07)) @ rot("x", s * math.pi / 2)))
    P.append(Part("hem", Shape.join(hems), rigid(HB["beast"])))
    top = barrel_at(-0.05)
    P.append(Part("saddle", Shape.join([box((0.36, 0.08, 0.3), (-0.05, top[0] + top[1] + 0.06, 0), "leatherDark"), box((0.05, 0.1, 0.24), (-0.22, top[0] + top[1] + 0.1, 0), "leatherDark")]), rigid(HB["beast"]), subdiv=1, crease=50))
    # The chanfron down the face, the bridle round the muzzle and cheek.
    chan = loft([{"c": c + norm(np.array([1, 1, 0])) * 0.06, "a": 0.008, "b": w, "u": (1, 1, 0)} for c, w in zip(head_pts[1:6], (0.06, 0.06, 0.05, 0.045, 0.04))], n=8, paint="iron", up=(1, 1, 0))
    P.append(Part("chanfron", chan, rigid(HB["head"]), subdiv=1))
    bridle = [loop for loop in []]
    for c, r in ((head_pts[5], (0.062, 0.06)), (head_pts[2], (0.1, 0.086))):
        t = np.linspace(0, 2 * np.pi, 25)
        axis = norm(np.array([0.5, -0.6, 0]))
        u = norm(np.array([1, 1, 0.0]))
        v = np.cross(axis, u)
        pts = [c + u * r[0] * math.cos(a) + v * r[1] * math.sin(a) for a in t]
        bridle.append(loft([{"c": p, "a": 0.004, "b": 0.01, "u": norm(p - c)} for p in pts], n=6, paint="leatherDark", caps=(False, False)))
    P.append(Part("bridle", Shape.join(bridle), rigid(HB["head"])))
    return P


# ─────────────── the mammoth ───────────────
MAMMOTH_BONES = ["beast", "head", "strike", "flap0", "flap1", "leg0", "knee0", "leg1", "knee1", "leg2", "knee2", "leg3", "knee3", "tail"]
MB = {n: i for i, n in enumerate(MAMMOTH_BONES)}
MAMMOTH_LEGS = [(0.45, -0.26), (0.45, 0.26), (-0.45, -0.26), (-0.45, 0.26)]
MHEAD = np.array([0.74, 1.32, 0.0])
TRUNK = MHEAD + (0.3, -0.06, 0)
HUMP = [(-0.9, 1.15, 0.2, 0.2), (-0.78, 1.12, 0.42, 0.42), (-0.45, 1.12, 0.56, 0.5), (0.0, 1.15, 0.6, 0.53), (0.3, 1.18, 0.68, 0.53), (0.47, 1.2, 0.72, 0.5), (0.68, 1.22, 0.56, 0.42), (0.86, 1.25, 0.26, 0.28)]


def hump_at(x):
    xs = [r[0] for r in HUMP]
    return [float(np.interp(x, xs, [r[k] for r in HUMP])) for k in range(1, 4)]


def shaggy(amount, seed=0, fringe=0.0):
    """Long hair: tufts and locks pushed out, the lower parts hanging in a ragged fringe."""

    def fn(Pt, N, paints):
        a = np.arctan2(Pt[:, 2], Pt[:, 0])
        locks = 0.5 + 0.5 * np.sin(a * 30 + Pt[:, 1] * 14 + 5 * fbm(Pt * 4, 3, seed))
        d = amount * (0.6 * locks + 0.6 * fbm(Pt * 14, 3, seed + 3))
        return d

    return fn


def mammoth():
    P = []
    body = loft([{"c": (x, cy, 0), "a": a, "b": b, "p": 2.0, "u": (0, 1, 0)} for x, cy, a, b in HUMP], n=18, paint="shag", up=(0, 1, 0))
    part = Part("body", body, rigid(MB["beast"]), subdiv=1)
    # The fringe: the lower body's hair hangs down past the belly, ragged.
    Pt = part.points()
    cy = np.array([hump_at(x)[0] for x in Pt[:, 0]])
    below = smoothstep(0.0, -0.5, Pt[:, 1] - cy)
    drop = below * (0.12 + 0.08 * fbm(Pt * np.array([9, 2, 9]), 3, 4))
    Pt[:, 1] -= drop
    part.set_points(Pt)
    part.push(shaggy(0.03, 1))
    P.append(part)
    head = ellipsoid((0.36, 0.38, 0.34), (0, 0, 0), "shag", 16, 11)
    hv = head.v
    d = norm(hv)
    crown = np.exp(-(((d[:, 0] + 0.2) / 0.5) ** 2)) * smoothstep(0.2, 1, d[:, 1])
    front = smoothstep(0, 1, d[:, 0])
    head.v = np.stack([d[:, 0] * (0.36 - 0.04 * front), d[:, 1] * 0.38 + crown * 0.16, d[:, 2] * (0.34 - 0.06 * front)], axis=1) + MHEAD
    P.append(Part("head", head, chain([MB["beast"], MB["head"]], [((0.5, 1.3, 0), (1, 0, 0), 0.08)]), subdiv=1).push(shaggy(0.018, 2)))
    for s, bone in ((-1, "flap0"), (1, "flap1")):
        ear = ellipsoid((0.09, 0.15, 0.035), (0, -0.04, s * 0.02), "furDark", 10, 7)
        P.append(Part(f"ear{s}", ear.moved(at(*(MHEAD + (-0.1, 0.06, s * 0.3)))), rigid(MB[bone])).push(shaggy(0.008, 5)))
        P.append(Part(f"eye{s}", ellipsoid((0.026, 0.024, 0.02), MHEAD + (0.27, 0.08, s * 0.19), "pupil", 8, 6), rigid(MB["head"])))
        tusk = tube([MHEAD + (0.22, -0.18, s * 0.14), MHEAD + (0.42, -0.4, s * 0.2), MHEAD + (0.72, -0.4, s * 0.24), MHEAD + (0.86, -0.18, s * 0.2), MHEAD + (0.84, 0.0, s * 0.12)], 0.055, 0.012, n=8, paint="tusk", samples=12)
        P.append(Part(f"tusk{s}", tusk, rigid(MB["head"]), subdiv=1))
    trunk = tube([TRUNK + (0, 0.05, 0), TRUNK + (0.12, -0.3, 0), TRUNK + (0.1, -0.62, 0), TRUNK + (0.18, -0.82, 0), TRUNK + (0.28, -0.8, 0)], 0.12, 0.035, n=10, paint="shag", samples=14)
    tr = Part("trunk", trunk, chain([MB["head"], MB["strike"]], [(TRUNK, (1, -1, 0), 0.05)]), subdiv=1)

    def wrinkles(Pt, N, paints):
        return 0.006 * np.sin(np.linalg.norm(Pt - TRUNK, axis=1) * 120) + 0.004 * fbm(Pt * 20, 2, 9)

    tr.push(wrinkles)
    P.append(tr)
    for i, (x, z) in enumerate(MAMMOTH_LEGS):
        rows = [(1.05, 0.21), (0.9, 0.21), (0.7, 0.19), (0.5, 0.165), (0.42, 0.155), (0.25, 0.15), (0.1, 0.16), (0.03, 0.175)]
        leg = loft([{"c": (x, y, z), "a": r, "b": r * 0.95} for y, r in rows], n=11, paint="shag", up=(1, 0, 0), cap_len=0.03)
        lp = Part(f"leg{i}", leg, chain([MB["beast"], MB[f"leg{i}"], MB[f"knee{i}"]], [((x, 0.92, z), (0, -1, 0), 0.08), ((x, 0.47, z), (0, -1, 0), 0.05)]), subdiv=1)
        lp.push(shaggy(0.016, 10 + i))
        P.append(lp)
        nails = [ellipsoid((0.03, 0.03, 0.04), (x + 0.15, 0.04, z + (t - 1) * 0.07), "bone", 8, 6) for t in range(3)]
        P.append(Part(f"nails{i}", Shape.join(nails), rigid(MB[f"knee{i}"])))
    tail = Shape.join([tube([(-0.84, 1.2, 0), (-0.92, 1.05, 0), (-0.94, 0.85, 0)], 0.035, 0.02, n=8, paint="furDark"), ellipsoid((0.05, 0.08, 0.05), (-0.94, 0.8, 0), "furDark", 10, 8)])
    P.append(Part("tail", tail, chain([MB["beast"], MB["tail"]], [((-0.84, 1.2, 0), (-1, 0, 0), 0.03)])))
    # The blanket over the back, hemmed in gold.
    xs = np.linspace(-0.38, 0.28, 12)
    cols = []
    for x in xs:
        cy, a, b = hump_at(x)
        col = []
        for t in np.linspace(-1.0, 1.0, 13):
            c, s = math.cos(t), math.sin(t)
            col.append((x, cy + (a + 0.035) * c, (b + 0.035) * s))
        cols.append(col)
    V = np.array(cols).reshape(-1, 3)
    m = len(cols[0])
    F = [(i * m + j, i * m + j + 1, (i + 1) * m + j + 1, (i + 1) * m + j) for i in range(len(xs) - 1) for j in range(m - 1)]
    paint = ["gold" if (i in (0, len(xs) - 2) or j in (0, m - 2)) else "team" for i in range(len(xs) - 1) for j in range(m - 1)]
    P.append(Part("blanket", Shape(V, F, paint), rigid(MB["beast"]), subdiv=1, outward=("axis", (0, 0, 0))))
    return P


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :]
    out = argv[0]
    which = argv[1:] or ["horse", "mammoth"]
    os.makedirs(out, exist_ok=True)
    for name in which:
        reset()
        parts = horse() if name == "horse" else mammoth()
        bones = HORSE_BONES if name == "horse" else MAMMOTH_BONES
        for i, p in enumerate(parts):
            p.finish()
        bake_ao(parts, samples=int(os.environ.get("BAKE_SAMPLES", "48")), reach=0.3)
        prims = gather(parts, bones)
        file = "b1.glb" if name == "horse" else "b0.glb"
        size = write_glb(os.path.join(out, file), prims, {"bones": bones})
        nv = sum(len(d["P"]) for d in prims.values())
        print(f"DONE {file}: {len(prims)} paints, {nv} vertices, {size} bytes")
        if os.environ.get("PREVIEW"):
            render(os.path.join(out, file.replace(".glb", ".png")), parts, eye=(3.2, 1.6, 2.6), look=(0.0, 0.9, 0.0), size=(900, 700), samples=int(os.environ.get("PREVIEW_SAMPLES", "24")))
