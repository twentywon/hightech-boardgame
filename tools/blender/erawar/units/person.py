"""
The people of 시대 전쟁, sculpted in Blender (see ../README.md): one body — hips, a waist, a chest with its pectorals
and shoulder blades, a neck, a head with a jaw, cheekbones, sockets, a nose, lips, ears and eyes, arms with deltoids,
biceps and an elbow, closed hands with four fingers and a thumb round the grip, legs with thighs, knees and calves —
dressed by each era: fur and bone and war paint; mail, a tabard and a helm, or a jerkin and a hood; a coat with its
skirts, tails, facings and cross-belts; fatigues with pockets, a vest of pouches and a helmet. Cloth is pushed into
folds, fur into tufts. Each vertex follows the game's joints (body, legs and knees, chest, head, arms and elbows),
shared smoothly where they meet, so that a leg or an arm bends without a gap.

    blender -b --python person.py -- <out dir> [era kind ...]

writes p<era><kind>.glb for each (all eight by default) and, with PREVIEW=1, a Cycles picture of each.
"""
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from lib import *  # noqa

BONES = ["body", "leg0", "knee0", "leg1", "knee1", "chest", "head", "arm0", "elbow0", "arm1", "elbow1"]
B = {n: i for i, n in enumerate(BONES)}
HEADP = np.array([0.01, 1.14, 0.0])
CLOTH = {"team", "teamDark", "green", "olive", "oliveDark", "white", "hood", "cloth", "khaki", "webbing"}

# ─────────────── the head ───────────────
HX, HY, HZ = 0.106, 0.13, 0.118


def shape_head(d):
    """The head's surface in directions d (working frame: face toward -z), as the game's own head (sculpt.ts)."""
    x, y, z = d[:, 0], d[:, 1], d[:, 2]
    low = smoothstep(0.1, -0.9, y)
    back = smoothstep(-0.1, 0.8, z)
    fx = 1 - 0.3 * low**1.4
    fz = 1 - 0.38 * low * back - 0.08 * low * (1 - back)
    fy = 1 - 0.06 * smoothstep(0.6, 1, y)
    r = np.ones(len(d))
    for s in (-1, 1):
        r += bump(d, (s * 0.62, -0.14, -0.74), 0.3, 0.06)
        r -= bump(d, (s * 0.36, 0.1, -0.92), 0.2, 0.07)
        r += bump(d, (s * 0.33, 0.3, -0.9), 0.24, 0.045)
        r -= bump(d, (s * 0.86, 0.32, -0.32), 0.35, 0.04)
        r -= bump(d, (s * 0.45, -0.42, -0.78), 0.25, 0.03)
        r += bump(d, (s * 0.2, -0.55, -0.8), 0.22, 0.02)
    r += bump(d, (0, 0.42, 0.85), 0.6, 0.07)
    r += bump(d, (0, -0.78, -0.62), 0.28, 0.07)
    r += bump(d, (0, 0.32, -0.94), 0.3, 0.02)
    return np.stack([x * HX * fx * r, y * HY * fy * r, z * HZ * fz * r], axis=1)


def turn(p):
    """Working frame (face -z) to the figure's (face +x)."""
    return np.stack([-p[:, 2], p[:, 1], p[:, 0]], axis=1)


def on_face(across, up, rise=0.0):
    dx, dy = -across / HX, up / HY
    for _ in range(14):
        d = norm(np.array([[dx, dy, -math.sqrt(max(0.02, 1 - dx * dx - dy * dy))]]))
        p = shape_head(d)[0]
        dx = d[0, 0] + (-across - p[0]) / HX
        dy = d[0, 1] + (up - p[1]) / HY
    p = p + d[0] * rise
    return turn(p[None])[0] + HEADP


def sphere_dirs(n=40, m=28):
    s = ellipsoid((1, 1, 1), n=n, m=m)
    return norm(s.v), s.f


def head_shape(paint):
    d, f = sphere_dirs(30, 22)
    return Shape(turn(shape_head(d)) + HEADP, f, paint)


GROW = {
    "crop": lambda d: (1 - smoothstep(-0.05, -0.35, d[:, 2]) * smoothstep(0.44 - 0.16 * abs(d[:, 0]) + 0.06, 0.44 - 0.16 * abs(d[:, 0]) - 0.02, d[:, 1]))
    * smoothstep(-0.02 - 0.42 * smoothstep(-0.1, 0.35, d[:, 2]), 0.08 - 0.42 * smoothstep(-0.1, 0.35, d[:, 2]), d[:, 1]),
    "wild": lambda d: (1 - smoothstep(-0.2, -0.55, d[:, 2]) * smoothstep(0.75, 0.5, abs(d[:, 0])) * smoothstep(0.38, 0.28, d[:, 1])) * smoothstep(-0.95, -0.75, d[:, 1]),
    "beard": lambda d: np.maximum(
        0,
        smoothstep(-0.12, -0.38, d[:, 1]) * smoothstep(0.35, -0.2, d[:, 2])
        - smoothstep(0.12, 0.02, abs(d[:, 0])) * smoothstep(-0.3, -0.42, d[:, 1]) * smoothstep(-0.55, -0.5, d[:, 1]) * smoothstep(-0.6, -0.85, d[:, 2]),
    ),
    "tache": lambda d: smoothstep(0.3, 0.15, abs(d[:, 0])) * smoothstep(-0.26, -0.33, d[:, 1]) * smoothstep(-0.46, -0.38, d[:, 1]) * smoothstep(-0.7, -0.9, d[:, 2]),
    "hood": lambda d: 1 - smoothstep(-0.35, -0.6, d[:, 2]) * smoothstep(1.05, 0.9, np.hypot(d[:, 0] / 0.62, (d[:, 1] + 0.08) / 0.62)),
    "cap": lambda d: smoothstep(0.1, 0.3, d[:, 1]),
}


def shell(grow, lift, paint, swell=None, strands=0.0, n=30, m=22, seed=1):
    """A shell over the head where `grow` says (hair, a beard, a hood, a coif), `lift` off the skin, locks by `strands`."""
    d, f = sphere_dirs(n, m)
    k = grow(d)
    rise = lift + (swell(d) if swell else 0)
    if strands:
        # Locks: ridges running down the head, broken by noise.
        a = np.arctan2(d[:, 0], d[:, 2])
        rise = rise + strands * (0.55 * np.sin(a * 38 + 3 * fbm(d * 3, 3, seed)) + 0.45 * fbm(d * 9, 3, seed + 5))
    rise = rise * k - 0.006 * (1 - k)
    p = shape_head(d) + d * rise[:, None]
    keep = [face for face in f if max(k[list(face)]) > 0.02]
    return Shape(turn(p) + HEADP, keep, paint)


def nose(paint):
    s = ellipsoid((1, 1, 1), n=10, m=8)
    x, y, z = s.v[:, 0], s.v[:, 1], s.v[:, 2]
    below = smoothstep(0.1, -1, y)
    front = np.maximum(0, x)
    v = np.stack([x * 0.011 + front * 0.016 * smoothstep(0.9, -0.4, y), y * 0.026, z * (0.009 + 0.01 * below * below)], axis=1)
    return Shape(v + on_face(0, -0.018, -0.006), s.f, paint)


def face_parts(skin, hair, brows=True):
    out = []
    for s in (-1, 1):
        e = on_face(s * 0.037, 0.014, -0.004)
        p = on_face(s * 0.037, 0.013, 0.0045)
        out.append(ellipsoid((0.008, 0.011, 0.015), e, "eye", 8, 6))
        out.append(ellipsoid((0.004, 0.0085, 0.0075), p, "pupil", 6, 4))
        if brows:
            b = on_face(s * 0.04, 0.044, 0.001)
            out.append(ellipsoid((0.006, 0.0062, 0.025), b, hair, 8, 4).moved(at(*b) @ rot("x", s * -0.18) @ at(*-b)))
        ear = ellipsoid((0.024, 0.034, 0.011), (0, 0, 0), skin, 10, 6)
        ear.v[:, 2] -= s * 0.006 * np.exp(-((ear.v[:, 0] / 0.016) ** 2 + (ear.v[:, 1] / 0.024) ** 2)) * (np.sign(ear.v[:, 2]) == s)
        out.append(ear.moved(at(HEADP[0] - 0.014, HEADP[1] - 0.004, s * 0.103)))
    out.append(ellipsoid((0.007, 0.0075, 0.027), on_face(0, -0.058, -0.002), "lip", 8, 4))
    out.append(nose(skin))
    return out


# ─────────────── the body ───────────────
TORSO = [
    (0.47, 0.0, 0.07, 0.11, 2.2),
    (0.52, -0.005, 0.088, 0.134, 2.3),
    (0.585, -0.008, 0.097, 0.142, 2.4),
    (0.65, 0.0, 0.085, 0.127, 2.4),
    (0.72, 0.005, 0.088, 0.129, 2.5),
    (0.8, 0.01, 0.097, 0.136, 2.6),
    (0.87, 0.012, 0.104, 0.138, 2.6),
    (0.925, 0.006, 0.098, 0.142, 2.6),
    (0.962, -0.004, 0.086, 0.142, 2.5),
    (0.995, -0.002, 0.066, 0.1, 2.1),
    (1.02, 0.006, 0.05, 0.058, 2.0),
    (1.045, 0.013, 0.046, 0.045, 2.0),
]



def torso(paint, fat=1.0, cut=None):
    secs = []
    for y, x, a, b, p in TORSO + [(1.09, 0.016, 0.043, 0.042, 2.0)]:
        k = fat if y < 1.0 else 1.0
        secs.append({"c": (x, y, 0.0), "a": a * k, "b": b * k, "p": p})
    s = loft(secs, n=16, paint=paint, up=(1, 0, 0), caps=(True, True))
    if cut:
        s.paint = [cut(np.mean(s.v[list(f)], axis=0)) or paint for f in s.f]
    return s


def leg(z, paint, fat=1.0, cut=None):
    rows = [
        (0.62, 0.0, 0.07, 0.072),
        (0.56, 0.005, 0.08, 0.077),
        (0.49, 0.009, 0.078, 0.072),
        (0.42, 0.009, 0.07, 0.064),
        (0.35, 0.007, 0.06, 0.056),
        (0.305, 0.008, 0.053, 0.05),
        (0.27, 0.006, 0.05, 0.047),
        (0.23, -0.005, 0.052, 0.046),
        (0.19, -0.011, 0.056, 0.047),
        (0.15, -0.009, 0.05, 0.042),
        (0.11, -0.004, 0.038, 0.035),
        (0.072, -0.002, 0.031, 0.03),
    ]
    secs = [{"c": (x, y, z), "a": a * fat, "b": b * fat} for y, x, a, b in rows]
    s = loft(secs, n=11, paint=paint, up=(1, 0, 0), cap_rings=2)
    if cut:
        s.paint = [cut(np.mean(s.v[list(f)], axis=0)) or paint for f in s.f]
    return s


def arm(z, paint, fat=1.0, cut=None):
    rows = [
        (0.99, -0.004, 0.042, 0.042),
        (0.968, 0.0, 0.058, 0.06),
        (0.935, 0.002, 0.056, 0.056),
        (0.9, 0.004, 0.05, 0.048),
        (0.855, 0.007, 0.05, 0.045),
        (0.81, 0.003, 0.044, 0.042),
        (0.765, 0.0, 0.04, 0.04),
        (0.73, 0.003, 0.044, 0.043),
        (0.68, 0.003, 0.042, 0.04),
        (0.63, 0.002, 0.034, 0.032),
        (0.595, 0.0, 0.029, 0.027),
    ]
    secs = [{"c": (x, y, z), "a": a * fat * 0.88, "b": b * fat * 0.88} for y, x, a, b in rows]
    s = loft(secs, n=10, paint=paint, up=(1, 0, 0), cap_rings=2)
    if cut:
        s.paint = [cut(np.mean(s.v[list(f)], axis=0)) or paint for f in s.f]
    return s


def hand(z, paint):
    """A fist closed round a grip running forward (x) at (0, 0.55, z): the back of the hand outward, four fingers
    curled round from the outside, the thumb over them from the front."""
    s = 1 if z > 0 else -1
    zh = z + s * 0.02
    parts = [loft([{"c": (0, 0.6, z), "a": 0.03, "b": 0.026}, {"c": (0, 0.578, zh - s * 0.002), "a": 0.036, "b": 0.02}, {"c": (0, 0.558, zh + s * 0.008), "a": 0.036, "b": 0.016}], n=10, paint=paint, up=(1, 0, 0), cap_rings=2)]
    for i, (x, l) in enumerate([(-0.027, 0.85), (-0.009, 1.0), (0.009, 1.0), (0.027, 0.9)]):
        pts = [(x, 0.562, zh + s * 0.018), (x, 0.538, zh + s * 0.022 * l), (x, 0.527, zh + s * 0.002), (x, 0.535, zh - s * 0.016 * l), (x * 0.9, 0.549, zh - s * 0.017 * l)]
        parts.append(tube(pts, 0.0092, 0.0078, n=6, paint=paint, samples=7))
    parts.append(tube([(0.03, 0.585, zh - s * 0.014), (0.042, 0.565, zh - s * 0.02), (0.036, 0.548, zh - s * 0.012), (0.024, 0.546, zh - s * 0.0)], 0.0105, 0.0085, n=6, paint=paint, samples=6))
    return Shape.join(parts)


def boot(z, paint, high=0.11, sole="black"):
    """A boot (or a wrapped foot): the shaft to `high` above the ankle, the foot forward, a sole."""
    shaft = loft(
        [
            {"c": (-0.005, 0.03, z), "a": 0.052, "b": 0.044},
            {"c": (-0.005, 0.075, z), "a": 0.046, "b": 0.04},
            {"c": (-0.006, 0.075 + high * 0.5, z), "a": 0.045, "b": 0.041},
            {"c": (-0.008, 0.075 + high, z), "a": 0.049, "b": 0.044},
        ],
        n=12,
        paint=paint,
        up=(1, 0, 0),
        caps=(False, False),
    )
    foot = loft(
        [
            {"c": (-0.06, 0.035, z), "a": 0.03, "b": 0.042, "u": (0, 1, 0)},
            {"c": (-0.03, 0.04, z), "a": 0.04, "b": 0.047, "u": (0, 1, 0)},
            {"c": (0.03, 0.035, z), "a": 0.033, "b": 0.05, "u": (0, 1, 0)},
            {"c": (0.08, 0.028, z), "a": 0.026, "b": 0.048, "u": (0, 1, 0)},
            {"c": (0.115, 0.024, z), "a": 0.02, "b": 0.04, "u": (0, 1, 0)},
        ],
        n=12,
        paint=paint,
        up=(0, 1, 0),
        cap_len=0.02,
    )
    foot.v[:, 1] = np.maximum(foot.v[:, 1], 0.006)
    sole_ = loft(
        [
            {"c": (-0.075, 0.006, z), "a": 0.006, "b": 0.04, "u": (0, 1, 0)},
            {"c": (0.0, 0.006, z), "a": 0.006, "b": 0.05, "u": (0, 1, 0)},
            {"c": (0.12, 0.006, z), "a": 0.006, "b": 0.042, "u": (0, 1, 0)},
        ],
        n=8,
        paint=sole,
        up=(0, 1, 0),
        cap_len=0.02,
    )
    return Shape.join([shaft, foot, sole_])


# ─────────────── how each part moves ───────────────


def torso_rig():
    return chain([B["body"], B["chest"], B["head"]], [((0, 0.64, 0), (0, 1, 0), 0.045), ((0, 1.075, 0), (0, 1, 0), 0.02)])


def leg_rig(i):
    z = -0.085 if i == 0 else 0.085
    return chain([B[f"leg{i}"], B[f"knee{i}"]], [((0, 0.285, z), (0, -1, 0), 0.035)])


def arm_rig(i):
    z = -0.19 if i == 0 else 0.19
    return chain([B[f"arm{i}"], B[f"elbow{i}"]], [((0, 0.765, z), (0, -1, 0), 0.03)])


def skirt_rig(follow=0.7, top=0.56, bottom=0.36):
    """A skirt or a coat's tails: the hips' above, more and more each leg's below (by side)."""

    def rig(P):
        n = len(P)
        f = smoothstep(top, bottom, P[:, 1]) * follow
        side = np.where(P[:, 2] >= 0, 1, 0)
        legs = np.where(side == 1, B["leg1"], B["leg0"])
        mid = 0.5 + 0.5 * smoothstep(0.0, 0.04, np.abs(P[:, 2]))
        f = f * mid
        idx = np.stack([np.full(n, B["body"]), legs], axis=1)
        above = P[:, 1] > 0.66
        idx[above] = (B["chest"], B["chest"])
        w = np.where(above, 1.0, 1 - f)
        return idx, w

    return rig


# ─────────────── cloth, fur and skin ───────────────


def surface(kind, seed=0, amount=1.0):
    """How a part's surface is pushed, by paint: folds in cloth, tufts in fur, a rough weave in mail."""

    def fn(P, N, paints):
        d = np.zeros(len(P))
        cloth = np.isin(paints, list(CLOTH))
        fur = np.isin(paints, ["fur", "furDark", "furLight", "shag"])
        mail = paints == "mail"
        hide = np.isin(paints, ["hide", "leather", "leatherDark"])
        if cloth.any():
            # Long soft folds hanging down, and creases gathered round the elbows, knees and waist.
            hang = 0.0055 * fbm(P * np.array([16, 3.5, 16]), 3, seed)
            gather = np.zeros(len(P))
            for cy, span in ((0.765, 0.05), (0.285, 0.06), (0.64, 0.05)):
                env = np.exp(-(((P[:, 1] - cy) / span) ** 2))
                gather += env * 0.004 * np.sin(P[:, 1] * 240 + 6 * fbm(P * 9, 2, seed + 3))
            d += np.where(cloth, (hang + gather) * kind.get("cloth", 1.0), 0)
        if fur.any():
            a = np.arctan2(P[:, 2], P[:, 0])
            tuft = 0.006 * fbm(P * 45, 3, seed + 7) + 0.004 * np.sin(a * 40 + P[:, 1] * 90 + 4 * fbm(P * 12, 2, seed))
            d += np.where(fur, tuft * kind.get("fur", 1.0), 0)
        if mail.any():
            d += np.where(mail, 0.0012 * fbm(P * 80, 2, seed + 11), 0)
        if hide.any():
            d += np.where(hide, 0.0015 * fbm(P * 30, 3, seed + 13), 0)
        return d * amount

    return fn


def muscles(strength):
    """Pectorals, shoulder blades, buttocks, collar bones and a spine's groove on the torso."""

    def fn(P, N, paints):
        d = np.zeros(len(P))
        for s in (-1, 1):
            d += bump(P, (0.1, 0.875, s * 0.062), 0.055, 0.011, (0.6, 0.75, 1.25))
            d += bump(P, (-0.095, 0.87, s * 0.068), 0.05, 0.007, (0.6, 1.2, 0.9))
            d += bump(P, (-0.09, 0.545, s * 0.06), 0.06, 0.013)
            d += bump(P, (0.075, 0.982, s * 0.055), 0.018, 0.004, (1, 0.8, 3.0))
            d += bump(P, (0.085, 0.74, s * 0.03), 0.03, 0.004, (0.6, 1.5, 0.8))
        d -= bump(P, (-0.1, 0.78, 0), 0.012, 0.004, (1, 12, 1))
        d -= bump(P, (0.11, 0.8, 0), 0.01, 0.003, (1, 8, 1))
        return d * strength

    return fn


def limb_muscles(strength):
    def fn(P, N, paints):
        d = np.zeros(len(P))
        for z in (-0.19, 0.19):
            d += bump(P, (0.04, 0.85, z), 0.03, 0.006, (0.8, 1.4, 1))
            d += bump(P, (-0.035, 0.87, z), 0.03, 0.004, (0.8, 1.6, 1))
            d += bump(P, (-0.04, 0.765, z), 0.014, 0.004)
            d += bump(P, (0.0, 0.975, z + np.sign(z) * 0.03), 0.04, 0.005)
            d += bump(P, (0.03, 0.7, z), 0.025, 0.003, (1, 1.6, 1))
        for z in (-0.085, 0.085):
            d += bump(P, (0.05, 0.278, z), 0.022, 0.007)
            d += bump(P, (0.055, 0.45, z), 0.045, 0.006, (0.8, 1.5, 1))
            d += bump(P, (-0.05, 0.2, z), 0.035, 0.007, (1, 1.4, 1))
            d -= bump(P, (-0.05, 0.285, z), 0.018, 0.003)
        return d * strength

    return fn


# ─────────────── each era's dress ───────────────


def body_parts(dress):
    """The body under the clothes: torso, legs, arms, head, hands and boots, painted by region."""
    fat = dress.get("fat", 1.0)
    parts = []
    tp = dress["torso"]
    parts.append(Part("torso", torso(dress["cloth"], fat, tp), torso_rig(), subdiv=1))
    for i, z in enumerate((-0.085, 0.085)):
        parts.append(Part(f"leg{i}", leg(z, dress["legs"], fat, dress.get("legcut")), leg_rig(i), subdiv=1))
        parts.append(Part(f"boot{i}", boot(z, dress["boot"], dress.get("high", 0.11), dress.get("sole", "black")), rigid(B[f"knee{i}"]), subdiv=0, sharp=None))
    for i, z in enumerate((-0.19, 0.19)):
        parts.append(Part(f"arm{i}", arm(z, dress["sleeve"], fat, dress.get("armcut")), arm_rig(i), subdiv=1))
        parts.append(Part(f"hand{i}", hand(z, dress.get("glove", dress["skin"])), rigid(B[f"elbow{i}"]), subdiv=0))
    parts.append(Part("head", head_shape(dress["skin"]), rigid(B["head"]), subdiv=0))
    parts.append(Part("face", Shape.join(face_parts(dress["skin"], dress.get("hair", "hair"), True)), rigid(B["head"]), subdiv=0))
    style = dress.get("style", "crop")
    hair = dress.get("hair", "hair")
    if style == "wild":
        parts.append(Part("hair", shell(GROW["wild"], 0.02, hair, swell=lambda d: 0.022 * smoothstep(0, 1, -d[:, 1]), strands=0.006), rigid(B["head"]), subdiv=0))
    elif style == "crop":
        parts.append(Part("hair", shell(GROW["crop"], 0.008, hair, strands=0.0015), rigid(B["head"]), subdiv=0))
    if dress.get("beard"):
        parts.append(Part("beard", shell(GROW["beard"], 0.013, "beard", swell=lambda d: 0.014 * smoothstep(0, 1, -d[:, 1] - 0.4), strands=0.004), rigid(B["head"]), subdiv=0))
    if dress.get("tache"):
        parts.append(Part("tache", shell(GROW["tache"], 0.007, hair, strands=0.001), rigid(B["head"]), subdiv=0))
    return parts


def skirt(low, high, room, paint, jag=0.0, flare=0.0, fat=1.0, open_front=0.0, open_sides=0.0, seed=3, n=30):
    """A garment's skirt from the waist down: open at the front (a coat) or slit at the sides (a jerkin, a hauberk)."""
    rows = []
    for y in np.linspace(high, low, 6):
        t = (high - y) / max(high - low, 1e-6)
        # The hips' outline, widening below them.
        a = (0.097 if y < 0.62 else 0.088) * fat + room + flare * t * 0.6
        b = (0.142 if y < 0.62 else 0.13) * fat + room + flare * t
        rows.append({"c": (-0.006, y, 0), "a": a, "b": b, "p": 2.3})
    s = loft(rows, n=n, paint=paint, up=(1, 0, 0), caps=(False, False))
    v = s.v
    if jag:
        low_ring = np.isclose(v[:, 1], low, atol=1e-6)
        a = np.arctan2(v[:, 2], v[:, 0])
        v[low_ring, 1] -= jag * (0.5 + 0.5 * np.sin(a[low_ring] * 9) * np.sin(a[low_ring] * 5 + 1))
    keep = []
    for f in s.f:
        c = np.mean(v[list(f)], axis=0)
        ang = math.degrees(math.atan2(c[2], c[0]))
        if open_front and abs(ang) < open_front and c[1] < high - 0.03:
            continue
        if open_sides and (abs(abs(ang) - 90) < open_sides) and c[1] < 0.56:
            continue
        keep.append(f)
    s.f = keep
    s.paint = [paint] * len(keep)
    return s


def shell_body(low, high, room, paint, fat=1.0, n=20):
    """A layer over the torso (a vest, a tabard's top, a tunic): the torso's outline `room` out, open at both ends."""
    rows = []
    src = [r for r in TORSO if 0.55 < r[0] < 1.01]
    ys = np.array([r[0] for r in src])
    for y in np.linspace(low, high, 6):
        i = np.interp(y, ys, np.arange(len(ys)))
        k, t = int(min(i, len(src) - 2)), i - int(min(i, len(src) - 2))
        r = [src[k][j] * (1 - t) + src[k + 1][j] * t for j in range(5)]
        rows.append({"c": (r[1], y, 0), "a": r[2] * fat + room, "b": r[3] * fat + room, "p": r[4]})
    return loft(rows, n=n, paint=paint, up=(1, 0, 0), caps=(False, False))


def headband(y, lift, paint, tilt=0.0):
    """A band round the head (over the hair): follows the head's outline at that height."""
    t = np.linspace(0, 2 * np.pi, 33)
    d = norm(np.stack([np.sin(t), np.full_like(t, y), np.cos(t)], axis=1))
    p = shape_head(d)
    out = d * 1.0
    p = p + out * lift
    p[:, 1] += tilt * np.cos(t)
    pts = turn(p) + HEADP
    secs = []
    for i, c in enumerate(pts):
        o = norm(np.array([c[0] - HEADP[0], 0, c[2]]))
        secs.append({"c": c, "a": 0.004, "b": 0.012, "u": o})
    return loft(secs, n=8, paint=paint, caps=(False, False))


def strap(points, width, thick, paint, centre_axis=(0, None, 0), samples=None):
    """A flat strap along points round the body (its broad face outward from the body's upright axis)."""
    P = catmull(np.asarray(points), samples or max(8, 4 * len(points)))
    secs = []
    for c in P:
        o = norm(np.array([c[0] - centre_axis[0], 0, c[2] - (centre_axis[2] or 0)]))
        secs.append({"c": c, "a": thick, "b": width, "u": o})
    return loft(secs, n=8, paint=paint, caps=(True, True), cap_rings=1, cap_len=0.002)




def torso_at(y, ang, room=0.0, fat=1.0):
    """The torso's surface (as `torso` lofts it) at height y and angle ang round it (0 the front, +90° the near side)."""
    ys = np.array([r[0] for r in TORSO])
    i = float(np.interp(y, ys, np.arange(len(ys))))
    k = int(min(i, len(TORSO) - 2))
    t = i - k
    r = [TORSO[k][j] * (1 - t) + TORSO[k + 1][j] * t for j in range(5)]
    k_ = fat if y < 1.0 else 1.0
    c, s = math.cos(ang), math.sin(ang)
    e = 2.0 / r[4]
    cx, sx = math.copysign(abs(c) ** e, c), math.copysign(abs(s) ** e, s)
    p = np.array([r[1] + (r[2] * k_) * cx, y, (r[3] * k_) * sx])
    out = norm(np.array([p[0] - r[1], 0, p[2]]))
    return p + out * room, out


def band(yfn, room, width, thick, paint, fat=1.0, n=36):
    """A belt, sash, collar or cross-belt lying on the torso: round it at heights yfn(angle), `room` out."""
    secs = []
    for ang in np.linspace(0, 2 * np.pi, n + 1):
        p, o = torso_at(yfn(ang), ang, room + thick, fat)
        secs.append({"c": p, "a": thick, "b": width, "u": o})
    return loft(secs, n=6, paint=paint, caps=(False, False))


def ellipse_points(y, a, b, n=32, cx=0.0, tilt=0.0, phase=0.0):
    t = np.linspace(0, 2 * np.pi, n + 1) + phase
    return np.stack([cx + a * np.cos(t), y + tilt * np.cos(t), b * np.sin(t)], axis=1)


def loop_strap(y, a, b, width, thick, paint, cx=0.0, tilt=0.0):
    P = ellipse_points(y, a, b, 28, cx, tilt)
    secs = []
    for c in P:
        o = norm(np.array([c[0] - cx, 0, c[2]]))
        secs.append({"c": c, "a": thick, "b": width, "u": o})
    return loft(secs, n=6, paint=paint, caps=(False, False))


def rounded_box(size, centre, paint, rot_=None):
    s = box(size, (0, 0, 0), paint)
    m = at(*centre) @ (rot_ if rot_ is not None else np.eye(4))
    return s.moved(m)


def dress_of(era, kind):
    team = "team"
    if era == 0:
        return {
            "cloth": "skin2", "legs": "skin2", "sleeve": "skin2", "skin": "skin2", "boot": "hide", "sole": "leatherDark",
            "beard": kind != 1, "hair": "hairRed" if kind == 1 else "hair", "style": "wild", "high": 0.05, "fat": 1.06, "torso": None, "muscle": 1.0,
        }
    if era == 1 and kind == 1:
        return {
            "cloth": "green", "legs": "leather", "sleeve": "green", "skin": "skin", "boot": "leatherDark", "sole": "black", "hair": "hairRed",
            "style": "none", "torso": lambda c: "skin" if c[1] > 1.0 else "leather" if c[1] < 0.6 else None, "high": 0.16, "muscle": 0.4,
        }
    if era == 1:
        return {
            "cloth": "mail", "legs": "mail", "sleeve": "mail", "skin": "skin", "boot": "leatherDark", "sole": "black", "hair": "hairRed",
            "style": "none", "tache": True, "glove": "leatherDark", "torso": lambda c: "skin" if c[1] > 1.02 else None, "high": 0.12, "muscle": 0.35,
        }
    if era == 2:
        return {
            "cloth": team, "legs": "white", "sleeve": team, "skin": "skin", "boot": "black", "sole": "black", "hair": "hair", "style": "crop",
            "tache": kind == 1,
            "torso": lambda c: ("skin" if c[1] > 1.035 else "teamDark" if c[1] > 0.99 else "white" if (c[0] > 0.05 and abs(c[2]) < 0.048 and 0.7 < c[1] < 0.99) or c[1] < 0.6 else None),
            "legcut": lambda c: "black" if c[1] < 0.3 else None,
            "armcut": lambda c: "white" if c[1] < 0.64 else None,
            "high": 0.03, "muscle": 0.4,
        }
    return {
        "cloth": "olive", "legs": "olive", "sleeve": "olive", "skin": "skin", "boot": "black", "sole": "rubber", "glove": "rubber", "style": "none",
        "torso": lambda c: "skin" if c[1] > 1.03 else None, "high": 0.16, "muscle": 0.4,
    }


def gear(era, kind):
    """Each era's clothes and kit over the body (beyond what is painted on it)."""
    team = "team"
    P = []

    def add(name, shape, rig, subdiv=0, sharp=None, crease=None):
        # (Small parts as they are; boxes rounded by one subdivision, their edges creased.)
        P.append(Part(name, shape, rig, subdiv=max(subdiv, 1 if crease is not None else 0), sharp=sharp, crease=crease))

    if era == 0:
        fat = 1.06
        tunic = shell_body(0.6, 0.93, 0.014, "hide" if kind == 1 else "fur", fat)
        # Over one shoulder: the near side's top cut away below the strap.
        keep = []
        for f in tunic.f:
            c = np.mean(tunic.v[list(f)], axis=0)
            if c[2] > 0.02 and c[1] > 0.84 - (c[2] - 0.02) * 0.6:
                continue
            keep.append(f)
        tunic.f, tunic.paint = keep, [tunic.paint[0]] * len(keep)
        add("tunic", tunic, chain([B["body"], B["chest"]], [((0, 0.64, 0), (0, 1, 0), 0.045)]), subdiv=1)
        add("tunicskirt", skirt(0.42, 0.62, 0.016, "hide" if kind == 1 else "fur", jag=0.045, flare=0.05, fat=fat, open_sides=8), skirt_rig(0.65, 0.56, 0.4), subdiv=1)
        add("furstrap", tube([(0.1, 0.84, 0.07), (0.07, 0.99, -0.06), (-0.04, 1.0, -0.09), (-0.1, 0.84, 0.06)], 0.03, 0.026, n=10, paint="hide" if kind == 1 else "furDark"), rigid(B["chest"]))
        add("sash", band(lambda a: 0.635 + 0.012 * math.cos(a), 0.016, 0.02, 0.006, team, fat), rigid(B["body"]))
        add("necklace", Shape.join([loop_strap(0.985, 0.06, 0.07, 0.003, 0.003, "rope", cx=0.01, tilt=-0.02)] + [ellipsoid((0.005, 0.016, 0.005), (0.072 - abs(i - 2) * 0.006, 0.955 - abs(i - 2) * 0.008, -0.04 + i * 0.02), "bone", 6, 5) for i in range(5)]), rigid(B["chest"]), subdiv=0)
        for i, z in enumerate((-0.19, 0.19)):
            add(f"armband{i}", loop_strap(0.875, 0.054, 0.052, 0.009, 0.005, team, cx=0.004).moved(at(0, 0, z)), rigid(B[f"arm{i}"]))
            for y in (0.2, 0.15):
                add(f"wrap{i}{y}", loop_strap(y, 0.056, 0.048, 0.008, 0.004, "hide", cx=-0.009).moved(at(0, 0, -0.085 if i == 0 else 0.085)), rigid(B[f"knee{i}"]))
        add("headband", headband(0.42, 0.024, team, tilt=0.012), rigid(B["head"]))
        for s in (-1, 1):
            c = on_face(s * 0.055, -0.02, 0.0005)
            add(f"paint{s}", ellipsoid((0.003, 0.006, 0.022), c, team, 8, 5).moved(at(*c) @ rot("y", s * 0.5) @ at(*-c)), rigid(B["head"]), subdiv=0)
        if kind == 1:
            add("hidecap", shell(GROW["cap"], 0.032, "hide"), rigid(B["head"]), subdiv=0)
        else:
            feather = slab([(0, 0), (0.02, 0.06), (0.022, 0.13), (0.008, 0.19), (-0.008, 0.13), (-0.012, 0.06)], 0.004, "feather")
            add("feather1", feather.moved(at(HEADP[0] - 0.07, HEADP[1] + 0.07, 0.08) @ rot("x", -0.3) @ rot("z", 0.5)), rigid(B["head"]), subdiv=1)
            f2 = feather.moved(at(HEADP[0] - 0.09, HEADP[1] + 0.06, 0.09) @ rot("x", -0.45) @ rot("z", 0.85) @ scale(0.8, 0.8, 1))
            add("feather2", Shape(f2.v, f2.f, team), rigid(B["head"]), subdiv=1)
    elif era == 1 and kind == 1:
        add("jerkinskirt", skirt(0.4, 0.66, 0.012, "green", flare=0.06, open_sides=7), skirt_rig(0.7, 0.58, 0.42), subdiv=1)
        add("belt", band(lambda a: 0.645, 0.013, 0.014, 0.006, team), rigid(B["body"]))
        add("pouch", rounded_box((0.03, 0.06, 0.05), (0.07, 0.6, 0.11), "leather"), rigid(B["body"]), crease=60)
        add("hood", shell(GROW["hood"], 0.018, "hood", swell=lambda d: 0.012 * smoothstep(0, 1, d[:, 2] + 0.2)), rigid(B["head"]), subdiv=0)
        add("liripipe", tube([HEADP + (-0.1, 0.06, 0), HEADP + (-0.17, 0.0, 0), HEADP + (-0.21, -0.12, 0.01), HEADP + (-0.2, -0.22, 0.02)], 0.032, 0.008, n=10, paint="hood"), rigid(B["head"]))
        cape = shell_body(0.83, 1.02, 0.03, "hood", n=30)
        cape.v[:, 0] -= 0.004
        lowest = cape.v[:, 1] < 0.84
        a = np.arctan2(cape.v[:, 2], cape.v[:, 0])
        cape.v[lowest, 1] -= 0.012 * (1 + np.sin(a[lowest] * 7))
        add("cape", cape, rigid(B["chest"]), subdiv=1)
        add("quiver", quiver(), rigid(B["chest"]))
    elif era == 1:
        add("hauberk", skirt(0.37, 0.66, 0.01, "mail", flare=0.05, open_front=10), skirt_rig(0.75, 0.58, 0.38), subdiv=1)
        tab_top = shell_body(0.62, 0.985, 0.018, team)
        # A tabard: sleeveless, open under the arms.
        keep = []
        for f in tab_top.f:
            c = np.mean(tab_top.v[list(f)], axis=0)
            ang = abs(math.degrees(math.atan2(c[2], c[0])))
            if 60 < ang < 120 and c[1] > 0.76:
                continue
            keep.append(f)
        tab_top.f, tab_top.paint = keep, [team] * len(keep)
        add("tabard", tab_top, chain([B["body"], B["chest"]], [((0, 0.64, 0), (0, 1, 0), 0.045)]), subdiv=1)
        panels = skirt(0.4, 0.635, 0.024, team, flare=0.03, open_sides=40)
        add("tabardskirt", panels, skirt_rig(0.7, 0.6, 0.42), subdiv=1)
        add("cross", Shape.join([rounded_box((0.008, 0.17, 0.034), (0.117, 0.8, 0), "gold"), rounded_box((0.008, 0.034, 0.12), (0.118, 0.84, 0), "gold")]), rigid(B["chest"]), crease=60)
        add("belt", band(lambda a: 0.645, 0.02, 0.015, 0.006, "leatherDark"), rigid(B["body"]))
        add("buckle", rounded_box((0.012, 0.034, 0.034), (0.117, 0.645, 0), "brass"), rigid(B["body"]), crease=60)
        for i, z in enumerate((-0.19, 0.19)):
            pd = lathe([(0.0, 0.07), (0.035, 0.066), (0.06, 0.045), (0.072, 0.012), (0.074, -0.03), (0.071, -0.032), (0.06, 0.01), (0.05, 0.04), (0.03, 0.058), (0.0, 0.062)], 16, "iron")
            add(f"pauldron{i}", pd.moved(at(0, 0.965, z) @ rot("x", (1 if z > 0 else -1) * 0.25)), rigid(B[f"arm{i}"]), subdiv=1, sharp=50)
        add("coif", shell(GROW["hood"], 0.013, "mail"), rigid(B["head"]), subdiv=0)
        helm = lathe([(0.0, 0.015), (0.126, 0.018), (0.128, 0.06), (0.12, 0.11), (0.092, 0.165), (0.05, 0.21), (0.012, 0.236), (0.0, 0.24)], 28, "iron", 1.02, 0.96)
        add("helm", helm.moved(at(HEADP[0] - 0.005, HEADP[1], 0)), rigid(B["head"]), subdiv=1)
        add("helmrim", loop_strap(HEADP[1] + 0.03, 0.13 * 1.02, 0.13 * 0.96, 0.012, 0.006, "brass", cx=HEADP[0] - 0.005), rigid(B["head"]))
        add("nasal", rounded_box((0.012, 0.09, 0.022), (HEADP[0] + 0.124, HEADP[1] + 0.0, 0), "steel"), rigid(B["head"]), crease=60)
        add("plume", tube([HEADP + (0, 0.23, 0), HEADP + (-0.05, 0.31, 0), HEADP + (-0.15, 0.33, 0), HEADP + (-0.22, 0.27, 0)], 0.026, 0.01, n=10, paint=team), rigid(B["head"]))
    elif era == 2:
        coat = skirt(0.42, 0.65, 0.012, team, flare=0.05, open_front=38)
        add("coatskirt", coat, skirt_rig(0.6, 0.58, 0.44), subdiv=1)
        for s in (-1, 1):
            tail = slab([(0, 0), (0.06, 0), (0.05, -0.3), (0.0, -0.34)], 0.012, "teamDark")
            add(f"tail{s}", tail.moved(at(-0.105, 0.63, s * 0.05) @ rot("y", math.pi / 2) @ rot("x", 0)), skirt_rig(0.55, 0.6, 0.34), crease=70)
        for i in range(5):
            for s in (-1, 1):
                add(f"button{i}{s}", ellipsoid((0.006, 0.009, 0.009), (0.11 + 0.004 * (i == 4), 0.74 + i * 0.055, s * 0.04), "brass", 8, 6), rigid(B["chest"]), subdiv=0)
        for s in (-1, 1):
            add(f"crossbelt{s}", band(lambda a, s=s: 0.82 + 0.15 * math.cos(a - s * math.radians(80)), 0.014, 0.016, 0.005, "white"), rigid(B["chest"]))
        add("collar", band(lambda a: 1.0, 0.004, 0.018, 0.012, "teamDark"), rigid(B["chest"]))
        add("pack", rounded_box((0.08, 0.2, 0.22), (-0.145, 0.81, 0), "leatherDark"), rigid(B["chest"]), crease=50)
        add("blanket", loft([{"c": (-0.135, 0.94, z), "a": 0.04, "b": 0.04} for z in np.linspace(-0.13, 0.13, 6)], n=14, paint="cloth", up=(0, 1, 0)), rigid(B["chest"]))
        for i, z in enumerate((-0.19, 0.19)):
            add(f"cuff{i}", loop_strap(0.64, 0.044, 0.04, 0.018, 0.008, "white").moved(at(0, 0, z)), rigid(B[f"elbow{i}"]))
            add(f"gaiterbuttons{i}", Shape.join([ellipsoid((0.004, 0.005, 0.005), (0.0, 0.09 + j * 0.05, (z / 0.19) * 0.085 + (0.045 if z > 0 else -0.045)), "brass", 6, 4) for j in range(3)]), rigid(B[f"knee{i}"]), subdiv=0)
        if kind == 0:
            add("tricorn", tricorn().moved(at(HEADP[0] - 0.005, HEADP[1] + 0.07, 0)), rigid(B["head"]), subdiv=0)
            add("cockade", lathe([(0.0, 0.0), (0.026, 0.0), (0.026, 0.008), (0.0, 0.008)], 14, team).moved(at(HEADP[0] + 0.06, HEADP[1] + 0.13, 0.1) @ rot("y", -0.5) @ rot("x", math.pi / 2)), rigid(B["head"]), subdiv=0)
        else:
            sh = lathe([(0.0, 0.02), (0.114, 0.02), (0.114, 0.06), (0.12, 0.2), (0.126, 0.26), (0.0, 0.262)], 28, "black")
            add("shako", sh.moved(at(HEADP[0] - 0.005, HEADP[1] + 0.02, 0)), rigid(B["head"]), subdiv=1, sharp=40)
            peak = loft([{"c": (HEADP[0] + 0.1 + 0.02 * abs(t), HEADP[1] + 0.05 - 0.02 * t * t, t * 0.1), "a": 0.003, "b": 0.03, "u": (0, 1, 0)} for t in np.linspace(-1, 1, 9)], n=8, paint="black", up=(0, 1, 0), caps=(True, True), cap_len=0.002)
            add("peak", peak, rigid(B["head"]))
            add("plate", rounded_box((0.006, 0.08, 0.06), (HEADP[0] + 0.122, HEADP[1] + 0.14, 0), "brass"), rigid(B["head"]), crease=60)
            add("shakocord", loop_strap(HEADP[1] + 0.2, 0.122, 0.122, 0.005, 0.004, "white", cx=HEADP[0] - 0.005, tilt=-0.02), rigid(B["head"]))
            add("shakoplume", ellipsoid((0.03, 0.07, 0.03), (HEADP[0] + 0.03, HEADP[1] + 0.33, 0), team, 12, 8), rigid(B["head"]))
    else:
        vest = shell_body(0.6, 0.99, 0.02, "oliveDark")
        keep = []
        for f in vest.f:
            c = np.mean(vest.v[list(f)], axis=0)
            ang = abs(math.degrees(math.atan2(c[2], c[0])))
            if 62 < ang < 118 and c[1] > 0.8:
                continue
            keep.append(f)
        vest.f, vest.paint = keep, ["oliveDark"] * len(keep)
        add("vest", vest, chain([B["body"], B["chest"]], [((0, 0.64, 0), (0, 1, 0), 0.045)]), subdiv=1)
        for i in range(3):
            add(f"pouch{i}", rounded_box((0.036, 0.075, 0.062), (0.122, 0.68, -0.08 + i * 0.08), "webbing"), rigid(B["chest"]), crease=55)
        add("chestpouch", rounded_box((0.028, 0.055, 0.055), (0.127, 0.85, 0.065), "webbing"), rigid(B["chest"]), crease=55)
        add("belt", band(lambda a: 0.6, 0.008, 0.018, 0.007, "webbing"), rigid(B["body"]))
        add("canteen", rounded_box((0.04, 0.085, 0.065), (-0.04, 0.56, 0.155), "olive"), rigid(B["body"]), crease=45)
        add("pack", rounded_box((0.1, 0.24, 0.24), (-0.16, 0.8, 0), "khaki"), rigid(B["chest"]), crease=50)
        add("mat", loft([{"c": (-0.155, 0.95, z), "a": 0.046, "b": 0.046} for z in np.linspace(-0.13, 0.13, 6)], n=14, paint="oliveDark", up=(0, 1, 0)), rigid(B["chest"]))
        for i, z in enumerate((-0.19, 0.19)):
            add(f"armband{i}", loop_strap(0.89, 0.053, 0.052, 0.014, 0.004, team, cx=0.004).moved(at(0, 0, z)), rigid(B[f"arm{i}"]))
            lz = -0.085 if i == 0 else 0.085
            add(f"cargo{i}", rounded_box((0.065, 0.08, 0.024), (0.0, 0.42, lz + (0.066 if lz > 0 else -0.066)), "olive"), rigid(B[f"leg{i}"]), crease=55)
            add(f"laces{i}", Shape.join([loop_strap(0.1 + j * 0.03, 0.048, 0.043, 0.003, 0.003, "black", cx=-0.006).moved(at(0, 0, lz)) for j in range(3)]), rigid(B[f"knee{i}"]), subdiv=0)
        helmet = lathe([(0.0, -0.005), (0.152, -0.012), (0.154, -0.004), (0.138, 0.012), (0.138, 0.06), (0.126, 0.11), (0.092, 0.155), (0.046, 0.176), (0.0, 0.18)], 24, "oliveDark", 1.04, 0.98)
        add("helmet", helmet.moved(at(HEADP[0] - 0.01, HEADP[1] + 0.035, 0)), rigid(B["head"]), subdiv=1, sharp=55)
        add("goggleband", loop_strap(HEADP[1] + 0.085, 0.142, 0.14, 0.01, 0.005, "rubber", cx=HEADP[0] - 0.01, tilt=0.02), rigid(B["head"]))
        for z in (-0.04, 0.04):
            add(f"goggle{z}", lathe([(0.0, 0.0), (0.026, 0.0), (0.028, 0.022), (0.0, 0.022)], 14, "glass").moved(at(HEADP[0] + 0.13, HEADP[1] + 0.105, z) @ rot("z", -(math.pi / 2 - 0.3))), rigid(B["head"]), subdiv=0)
        add("strap", Shape.join([tube([HEADP + (-0.01, 0.03, s * 0.128), HEADP + (0.03, -0.07, s * 0.1), HEADP + (0.07, -0.12, s * 0.045), HEADP + (0.075, -0.13, 0)], 0.005, 0.005, n=6, paint="webbing") for s in (-1, 1)]), rigid(B["head"]))
        add("helmpatch", rounded_box((0.05, 0.03, 0.008), (HEADP[0] - 0.02, HEADP[1] + 0.155, 0.145), team, rot("x", -0.25)), rigid(B["head"]), crease=60)
        if kind == 1:
            for z in (-0.11, 0.11):
                add(f"earcup{z}", lathe([(0.0, 0.0), (0.03, 0.0), (0.032, 0.026), (0.0, 0.026)], 16, "oliveDark").moved(at(HEADP[0] - 0.012, HEADP[1] - 0.01, z) @ rot("x", (1 if z > 0 else -1) * math.pi / 2) @ at(0, -0.013, 0)), rigid(B["head"]), subdiv=1, sharp=50)
            add("radio", rounded_box((0.07, 0.16, 0.12), (-0.21, 0.82, -0.06), "dark"), rigid(B["chest"]), crease=50)
            add("aerial", tube([(-0.21, 0.92, -0.1), (-0.212, 1.2, -0.1), (-0.215, 1.42, -0.1)], 0.005, 0.003, n=5, paint="black"), rigid(B["chest"]), subdiv=0)
    return P


def quiver():
    """The archer's quiver of fletched arrows on the back (as the code had it: at the chest's (-0.13, 0.2, -0.06), leaning)."""
    m = at(-0.13, 0.82, -0.06) @ rot("z", 0.35)
    q = lathe([(0.0, -0.17), (0.042, -0.165), (0.05, 0.0), (0.055, 0.15), (0.0, 0.152)], 16, "leather")
    parts = [q]
    for i in range(4):
        x, z = 0.015 * (i - 1.5), 0.012 * (i % 2)
        parts.append(lathe([(0.0, 0.13), (0.006, 0.13), (0.006, 0.27), (0.0, 0.27)], 6, "wood").moved(at(x, 0, z)))
        parts.append(slab([(0, 0), (0.012, 0.012), (0.012, 0.05), (0, 0.06), (-0.012, 0.05), (-0.012, 0.012)], 0.003, "feather").moved(at(x, 0.24, z)))
    return Shape.join(parts).moved(m)


def tricorn():
    n = 40
    verts, faces = [], []
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    for t in th:
        corner = abs(math.cos(t * 3 / 2)) ** 3
        r = 0.13 + 0.07 * corner
        verts.append((math.cos(t) * 0.115, 0.0, math.sin(t) * 0.115))
        verts.append((math.cos(t) * (0.115 + r) / 2 * 1.02, 0.012 + 0.02 * corner, math.sin(t) * (0.115 + r) / 2 * 1.02))
        verts.append((math.cos(t) * r, 0.06 + 0.05 * corner, math.sin(t) * r))
    for j in range(n):
        j2 = (j + 1) % n
        for k in range(2):
            faces.append((j * 3 + k, j2 * 3 + k, j2 * 3 + k + 1, j * 3 + k + 1))
    brim = Shape(np.array(verts), faces, "black")
    brim2 = Shape(np.array(verts) + np.array([0, 0.004, 0]), [f[::-1] for f in faces], "black")
    crown = lathe([(0.0, 0.0), (0.115, 0.0), (0.112, 0.06), (0.09, 0.11), (0.0, 0.125)], 24, "black")
    return Shape.join([brim, brim2, crown])


def build(era, kind):
    dress = dress_of(era, kind)
    parts = body_parts(dress)
    by = {p.name: p for p in parts}
    by["torso"].push(muscles(dress.get("muscle", 1.0)))
    for name in ("arm0", "arm1", "leg0", "leg1"):
        by[name].push(limb_muscles(dress.get("muscle", 1.0)))
    parts += gear(era, kind)
    for i, p in enumerate(parts):
        p.push(surface({}, seed=i))
        p.finish()
    return parts


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :]
    out = argv[0]
    which = [(int(argv[i]), int(argv[i + 1])) for i in range(1, len(argv) - 1, 2)] or [(e, k) for e in range(4) for k in (0, 1)]
    os.makedirs(out, exist_ok=True)
    for era, kind in which:
        reset()
        parts = build(era, kind)
        bake_ao(parts, samples=int(os.environ.get("BAKE_SAMPLES", "48")))
        prims = gather(parts, BONES)
        size = write_glb(os.path.join(out, f"p{era}{kind}.glb"), prims, {"bones": BONES, "era": era, "kind": kind})
        if os.environ.get("COUNT"):
            print("PARTS", sorted(((len(p.obj.data.vertices), p.name) for p in parts), reverse=True)[:25])
        nv = sum(len(d["P"]) for d in prims.values())
        nt = sum(len(d["T"]) for d in prims.values())
        print(f"DONE p{era}{kind}: {len(prims)} paints, {nv} vertices, {nt} triangles, {size} bytes")
        if os.environ.get("PREVIEW"):
            render(os.path.join(out, f"p{era}{kind}.png"), parts, eye=(2.4, 1.05, 1.5), look=(0.0, 0.7, 0.0), size=(600, 800), samples=int(os.environ.get("PREVIEW_SAMPLES", "24")))
