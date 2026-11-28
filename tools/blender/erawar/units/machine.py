"""
The machines of 시대 전쟁, modelled in Blender (see ../README.md), their edges bevelled: the field gun — a bronze
barrel turned with its mouldings, cascabel and muzzle swell, trunnions in a wooden trail carriage strapped and bolted
with iron, two spoked wheels (hub, twelve spokes, felloes and an iron tyre), its rammer and bucket — and the tank — a
hull of armour plates with a sloped glacis, hatches, lights, tow hooks, fenders and bolted side skirts, an engine deck
with its grille and exhausts, spare links and a toolbox; a cast turret with a bustle, the side's band and number,
smoke dischargers, a mantlet, a long gun with a fume extractor and a slotted muzzle brake, a cupola with periscopes,
a machine gun and an aerial; road wheels with rubber tyres and bolted hubs, and toothed sprockets. Each part follows
one of the game's pivots (the body, each wheel, the turret, the gun that recoils); the tank's tracks stay the
game's own, so that their links run.

    blender -b --python machine.py -- <out dir> [gun|tank ...]

writes m2.glb (the field gun) and m3.glb (the tank).
"""
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import bpy
from lib import *  # noqa


def bevelled(name, shape, bone, width=0.012, segments=2, sharp=35):
    """A hard part: its edges bevelled by Blender, its faces flat-shaded across sharp turns."""
    p = Part(name, shape, rigid(bone), subdiv=0)
    mod = p.obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    p.apply()
    p.obj.data.polygons.foreach_set("use_smooth", [True] * len(p.obj.data.polygons))
    p.sharp = sharp
    return p


def turned(outline, n, paint, m):
    return lathe(outline, n, paint).moved(m)


# ─────────────── the field gun ───────────────
GUN_BONES = ["gun", "wheel0", "wheel1", "strike"]
GB = {n: i for i, n in enumerate(GUN_BONES)}
BARREL = at(0.1, 0.72, 0) @ rot("z", 0.1)


def field_gun():
    P = []
    # The barrel along +x (turned round y, then laid along x), raised a little as the game's pivot has it.
    outline = [(0.0, -0.44), (0.045, -0.43), (0.05, -0.4), (0.03, -0.38), (0.13, -0.36), (0.148, -0.34), (0.14, -0.06), (0.152, -0.04), (0.132, -0.01), (0.124, 0.2), (0.136, 0.22), (0.116, 0.24), (0.098, 0.84), (0.118, 0.9), (0.122, 0.95), (0.084, 0.96), (0.03, 0.96), (0.03, 0.9), (0.0, 0.9)]
    barrel = turned(outline, 28, "bronze", BARREL @ rot("z", -math.pi / 2))
    P.append(Part("barrel", barrel, rigid(GB["strike"]), subdiv=1, sharp=40))
    P.append(Part("knob", ellipsoid((0.05, 0.05, 0.05), (-0.47, 0, 0), "bronze", 12, 8).moved(BARREL), rigid(GB["strike"])))
    P.append(Part("trunnions", lathe([(0.0, -0.21), (0.042, -0.21), (0.042, 0.21), (0.0, 0.21)], 12, "bronze").moved(BARREL @ rot("x", math.pi / 2)), rigid(GB["strike"]), subdiv=0, sharp=40))
    P.append(Part("band", lathe([(0.126, 0.0), (0.129, 0.0), (0.129, 0.04), (0.126, 0.04)], 28, "team", closed=(False, False)).moved(BARREL @ at(0.28, 0, 0) @ rot("z", -math.pi / 2)), rigid(GB["strike"])))
    P.append(Part("dolphins", Shape.join([tube([(-0.02, 0.13, s * 0.05), (0.04, 0.2, s * 0.05), (0.1, 0.13, s * 0.05)], 0.012, 0.012, n=6, paint="bronze") for s in (-1, 1)]).moved(BARREL), rigid(GB["strike"])))
    # The carriage: two cheeks from the trail on the ground up to the trunnions, the trail's end, transoms and straps.
    cheek = [(-0.98, 0.04), (-0.86, 0.02), (0.22, 0.5), (0.26, 0.62), (0.18, 0.72), (0.02, 0.72), (-0.18, 0.62), (-0.98, 0.16)]
    for z in (-0.15, 0.15):
        P.append(bevelled(f"cheek{z}", slab(cheek, 0.07, "wood").moved(at(-0.05, 0, z)), GB["gun"], 0.012))
        for x0, y0, x1, y1 in ((-0.55, 0.12, -0.5, 0.34), (-0.15, 0.32, -0.1, 0.5), (0.12, 0.45, 0.17, 0.66)):
            strap = slab([(x0, y0), (x0 + 0.04, y0 - 0.01), (x1 + 0.04, y1 - 0.01), (x1, y1)], 0.076, "iron").moved(at(-0.05, 0, z))
            P.append(Part(f"strap{z}{x0}", strap, rigid(GB["gun"]), subdiv=0, sharp=40))
        bolts = [ellipsoid((0.012, 0.012, 0.008), (x - 0.05, y, z + math.copysign(0.04, z)), "dark", 6, 4) for x, y in ((-0.7, 0.13), (-0.4, 0.28), (-0.1, 0.42), (0.1, 0.6), (-0.85, 0.1))]
        P.append(Part(f"bolts{z}", Shape.join(bolts), rigid(GB["gun"])))
    P.append(bevelled("trail", box((0.16, 0.14, 0.36), (-0.94, 0.09, 0), "woodDark"), GB["gun"], 0.015))
    P.append(bevelled("transom", box((0.12, 0.1, 0.26), (-0.3, 0.35, 0), "woodDark"), GB["gun"], 0.012))
    P.append(Part("ring", Shape.join([loft([{"c": (-1.02 + 0.06 * math.cos(t), 0.12 + 0.06 * math.sin(t), 0), "a": 0.012, "b": 0.012} for t in np.linspace(0, 2 * math.pi, 15)], n=6, paint="iron", caps=(False, False))]), rigid(GB["gun"])))
    P.append(bevelled("quoin", box((0.2, 0.06, 0.2), (-0.25, 0.6, 0), "woodDark"), GB["gun"], 0.01))
    P.append(Part("axle", lathe([(0.0, -0.42), (0.035, -0.42), (0.035, 0.42), (0.0, 0.42)], 12, "dark").moved(at(0.1, 0.42, 0) @ rot("x", math.pi / 2)), rigid(GB["gun"]), subdiv=0, sharp=40))
    P.append(Part("rammer", Shape.join([lathe([(0.0, -0.5), (0.012, -0.5), (0.012, 0.5), (0.0, 0.5)], 8, "wood"), lathe([(0.0, 0.5), (0.05, 0.5), (0.05, 0.6), (0.0, 0.6)], 12, "woodDark")]).moved(at(-0.55, 0.45, 0.26) @ rot("z", 1.2)), rigid(GB["gun"]), subdiv=0, sharp=40))
    P.append(Part("bucket", turned([(0.0, 0.0), (0.07, 0.0), (0.08, 0.14), (0.074, 0.14), (0.065, 0.01), (0.0, 0.01)], 16, "woodDark", at(-0.9, 0.05, 0.3)), rigid(GB["gun"]), subdiv=0, sharp=40))
    # The wheels, each round its own pivot.
    for i, z in enumerate((-0.37, 0.37)):
        c = np.array([0.1, 0.42, z])
        m = at(*c) @ rot("x", math.pi / 2)
        parts = [turned([(0.0, -0.09), (0.05, -0.09), (0.075, -0.05), (0.075, 0.05), (0.05, 0.09), (0.0, 0.09)], 16, "woodDark", m)]
        for s in range(12):
            a = s / 12 * 2 * math.pi
            d = np.array([math.cos(a), math.sin(a), 0])
            parts.append(tube([c + d * 0.07, c + d * 0.36], 0.02, 0.014, n=6, paint="wood", samples=3))
        felloe = []
        for t in np.linspace(0, 2 * math.pi, 37):
            felloe.append({"c": c + np.array([math.cos(t), math.sin(t), 0]) * 0.385, "a": 0.035, "b": 0.045, "u": np.array([math.cos(t), math.sin(t), 0])})
        parts.append(loft(felloe, n=8, paint="woodDark", caps=(False, False)))
        tyre = []
        for t in np.linspace(0, 2 * math.pi, 37):
            tyre.append({"c": c + np.array([math.cos(t), math.sin(t), 0]) * 0.428, "a": 0.01, "b": 0.05, "u": np.array([math.cos(t), math.sin(t), 0])})
        parts.append(loft(tyre, n=6, paint="iron", caps=(False, False)))
        P.append(Part(f"wheel{i}", Shape.join(parts), rigid(GB[f"wheel{i}"]), subdiv=0, sharp=45))
    return P


# ─────────────── the tank ───────────────
WHEELS = [(-0.72 + s * 0.36, 0.22, z * 0.525) for z in (-1, 1) for s in range(5)] + [(x, 0.27, z * 0.525) for z in (-1, 1) for x in (-0.98, 0.98)]
TANK_BONES = ["tank", "turret", "strike"] + [f"w{i}" for i in range(len(WHEELS))]
TB = {n: i for i, n in enumerate(TANK_BONES)}
TURRET = np.array([-0.1, 0.84, 0.0])
GUN = TURRET + (0.46, 0.13, 0)


def tank():
    P = []
    hull = slab([(-1.0, 0.34), (0.84, 0.34), (1.04, 0.52), (0.86, 0.78), (-0.9, 0.82), (-1.04, 0.66)], 1.0, "olive")
    P.append(bevelled("hull", hull, TB["tank"], 0.03, 2))
    for z in (-1, 1):
        P.append(bevelled(f"fender{z}", box((2.05, 0.03, 0.26), (0, 0.5, z * 0.462), "oliveDark"), TB["tank"], 0.008, 1))
        for s in range(4):
            P.append(bevelled(f"skirt{z}{s}", box((0.46, 0.17, 0.02), (-0.72 + s * 0.48, 0.41, z * 0.58), "oliveDark"), TB["tank"], 0.006, 1))
        bolts = [ellipsoid((0.01, 0.01, 0.006), (-0.9 + k * 0.12, 0.47, z * 0.592), "dark", 6, 4) for k in range(16)]
        P.append(Part(f"bolts{z}", Shape.join(bolts), rigid(TB["tank"])))
        P.append(Part(f"light{z}", turned([(0.0, 0.0), (0.04, 0.0), (0.05, 0.05), (0.045, 0.055), (0.0, 0.052)], 14, "dark", at(0.92, 0.66, z * 0.34) @ rot("z", -math.pi / 2)), rigid(TB["tank"]), subdiv=0, sharp=40))
        P.append(Part(f"lens{z}", ellipsoid((0.006, 0.038, 0.038), (0.975, 0.68, z * 0.34), "glass", 10, 6), rigid(TB["tank"])))
        P.append(Part(f"exhaust{z}", turned([(0.0, -0.08), (0.05, -0.08), (0.05, 0.08), (0.04, 0.08), (0.04, -0.06), (0.0, -0.06)], 14, "black", at(-1.06, 0.7, z * 0.24) @ rot("z", math.pi / 2)), rigid(TB["tank"]), subdiv=0, sharp=40))
        P.append(Part(f"hook{z}", tube([(0.98, 0.42, z * 0.3), (1.05, 0.42, z * 0.3), (1.05, 0.36, z * 0.3)], 0.02, 0.02, n=6, paint="dark"), rigid(TB["tank"])))
    # The engine deck's grille, the driver's hatch, spare links and a toolbox.
    for k in range(7):
        P.append(bevelled(f"slat{k}", box((0.04, 0.02, 0.6), (-0.85 + k * 0.07, 0.83, 0), "oliveDark"), TB["tank"], 0.004, 1))
    P.append(Part("hatchD", turned([(0.0, 0.0), (0.11, 0.0), (0.11, 0.025), (0.09, 0.035), (0.0, 0.035)], 18, "oliveDark", at(0.6, 0.79, 0.22)), rigid(TB["tank"]), subdiv=0, sharp=40))
    for s in range(3):
        P.append(bevelled(f"link{s}", box((0.08, 0.03, 0.2), (0.92 - s * 0.05, 0.6 + s * 0.06, -0.2 + s * 0.2), "dark").moved(at(0.92 - s * 0.05, 0.6 + s * 0.06, -0.2 + s * 0.2) @ rot("z", 0.95) @ at(-(0.92 - s * 0.05), -(0.6 + s * 0.06), 0.2 - s * 0.2)), TB["tank"], 0.006, 1))
    P.append(bevelled("toolbox", box((0.3, 0.08, 0.2), (-0.6, 0.86, 0.32), "khaki"), TB["tank"], 0.01, 1))
    # The cast turret: rounded, sloping in, a bustle behind; its ring, the side's band, the number.
    t = ellipsoid((1, 1, 1), (0, 0, 0), "olive", 30, 16)
    v = t.v
    top = v[:, 1] >= 0
    v[:, 1] = np.maximum(v[:, 1], 0) * 0.3
    v[:, 0] *= np.where(v[:, 0] > 0, 0.46, 0.58)
    v[:, 2] *= 0.42 - 0.05 * np.maximum(0, v[:, 0])
    t.v = v + TURRET + (0, 0.02, 0)
    P.append(Part("turret", t, rigid(TB["turret"]), subdiv=1))
    P.append(Part("ring", turned([(0.47, 0.0), (0.49, 0.0), (0.49, 0.05), (0.44, 0.06), (0.0, 0.06)], 30, "oliveDark", at(*(TURRET + (-0.04, -0.02, 0))) @ scale(1.08, 1, 0.92)), rigid(TB["turret"]), subdiv=0, sharp=40))
    band = []
    for a in np.linspace(0, 2 * math.pi, 41):
        r = 0.47 if math.cos(a) > 0 else 0.575
        band.append({"c": TURRET + (r * math.cos(a) * 1.0 - 0.0, 0.12, 0.39 * math.sin(a)), "a": 0.008, "b": 0.03, "u": norm(np.array([math.cos(a), 0, math.sin(a)]))})
    P.append(Part("band", loft(band, n=6, paint="team", caps=(False, False)), rigid(TB["turret"])))
    P.append(bevelled("number", box((0.16, 0.08, 0.01), (0, 0, 0), "white").moved(at(*(TURRET + (-0.12, 0.2, 0.37))) @ rot("x", -0.35)), TB["turret"], 0.003, 1))
    for z in (-1, 1):
        cans = [lathe([(0.0, 0.0), (0.022, 0.0), (0.022, 0.08), (0.0, 0.08)], 8, "dark").moved(at(*(TURRET + (0.12 + k * 0.05, 0.16, z * 0.36))) @ rot("x", -z * 0.9)) for k in range(3)]
        P.append(Part(f"smoke{z}", Shape.join(cans), rigid(TB["turret"]), subdiv=0, sharp=40))
    P.append(bevelled("mantlet", box((0.14, 0.2, 0.34), TURRET + (0.46, 0.13, 0), "oliveDark"), TB["turret"], 0.04, 3))
    P.append(Part("cupola", turned([(0.0, 0.0), (0.13, 0.0), (0.13, 0.07), (0.115, 0.09), (0.1, 0.1), (0.0, 0.1)], 18, "oliveDark", at(*(TURRET + (-0.2, 0.26, 0.12)))), rigid(TB["turret"]), subdiv=0, sharp=40))
    P.append(Part("cupolaHatch", turned([(0.0, 0.0), (0.1, 0.0), (0.1, 0.02), (0.0, 0.03)], 16, "olive", at(*(TURRET + (-0.2, 0.36, 0.12)))), rigid(TB["turret"]), subdiv=0, sharp=40))
    scopes = [box((0.04, 0.035, 0.05), TURRET + (-0.2 + 0.12 * math.cos(a), 0.31, 0.12 + 0.12 * math.sin(a)), "glass") for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)]
    P.append(Part("scopes", Shape.join(scopes), rigid(TB["turret"]), subdiv=0, sharp=40))
    P.append(bevelled("mg", box((0.18, 0.05, 0.04), TURRET + (-0.12, 0.45, -0.15), "black"), TB["turret"], 0.006, 1))
    P.append(Part("mgbarrel", lathe([(0.0, 0.0), (0.01, 0.0), (0.01, 0.24), (0.0, 0.24)], 8, "black").moved(at(*(TURRET + (-0.03, 0.46, -0.15))) @ rot("z", -math.pi / 2)), rigid(TB["turret"]), subdiv=0, sharp=40))
    P.append(Part("aerial", tube([TURRET + (-0.32, 0.3, -0.22), TURRET + (-0.32, 0.9, -0.22)], 0.007, 0.004, n=5, paint="dark"), rigid(TB["turret"])))
    # The gun, turned: its mount, the fume extractor, the slotted muzzle brake.
    gun = [(0.0, -0.05), (0.1, -0.05), (0.1, 0.16), (0.06, 0.2), (0.052, 0.6), (0.075, 0.64), (0.075, 0.86), (0.05, 0.9), (0.047, 1.28), (0.05, 1.28), (0.05, 1.3), (0.0, 1.3)]
    P.append(Part("gun", turned(gun, 20, "oliveDark", at(*GUN) @ rot("z", -math.pi / 2)), rigid(TB["strike"]), subdiv=0, sharp=40))
    brake = [box((0.12, 0.13, 0.15), GUN + (1.36, 0, 0), "dark")] + [box((0.025, 0.025, 0.16), GUN + (1.33 + k * 0.05, 0, 0), "black") for k in range(2)]
    P.append(bevelled("brake", Shape.join(brake), TB["strike"], 0.012, 1))
    # Road wheels (rubber tyre, dished disc, bolted hub) and toothed sprockets, each round its own pivot.
    for i, (x, y, z) in enumerate(WHEELS):
        s = 1 if z > 0 else -1
        m = at(x, y, z) @ rot("x", math.pi / 2)
        if i < 10:
            tyre = turned([(0.0, -0.028), (0.15, -0.028), (0.152, 0.0), (0.15, 0.028), (0.0, 0.028)], 22, "rubber", m)
            disc = turned([(0.0, s * 0.03), (0.11, s * 0.03), (0.12, s * 0.035), (0.06, s * 0.045), (0.04, s * 0.06), (0.0, s * 0.065)], 20, "olive", m)
            bolts = [ellipsoid((0.008, 0.008, 0.008), (x + 0.03 * math.cos(a), y + 0.03 * math.sin(a), z + s * 0.062), "dark", 5, 4) for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)]
            P.append(Part(f"wheel{i}", Shape.join([tyre, disc] + bolts), rigid(TB[f"w{i}"]), subdiv=0, sharp=40))
        else:
            hub = turned([(0.0, -0.03), (0.1, -0.03), (0.1, 0.03), (0.0, 0.03)], 16, "dark", m)
            teeth = [box((0.035, 0.05, 0.05), (x + 0.115 * math.cos(a), y + 0.115 * math.sin(a), z), "dark").moved(at(x + 0.115 * math.cos(a), y + 0.115 * math.sin(a), z) @ rot("z", a) @ at(-(x + 0.115 * math.cos(a)), -(y + 0.115 * math.sin(a)), -z)) for a in np.linspace(0, 2 * math.pi, 10, endpoint=False)]
            P.append(Part(f"wheel{i}", Shape.join([hub] + teeth), rigid(TB[f"w{i}"]), subdiv=0, sharp=40))
    return P


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :]
    out = argv[0]
    which = argv[1:] or ["gun", "tank"]
    os.makedirs(out, exist_ok=True)
    for name in which:
        reset()
        parts = field_gun() if name == "gun" else tank()
        bones = GUN_BONES if name == "gun" else TANK_BONES
        for p in parts:
            p.finish()
        bake_ao(parts, samples=int(os.environ.get("BAKE_SAMPLES", "48")), reach=0.25)
        prims = gather(parts, bones)
        file = "m2.glb" if name == "gun" else "m3.glb"
        size = write_glb(os.path.join(out, file), prims, {"bones": bones})
        nv = sum(len(d["P"]) for d in prims.values())
        print(f"DONE {file}: {len(prims)} paints, {nv} vertices, {size} bytes")
        if os.environ.get("PREVIEW"):
            render(os.path.join(out, file.replace(".glb", ".png")), parts, eye=(3.0, 1.8, 2.8), look=(0.0, 0.55, 0.0), size=(900, 700), samples=int(os.environ.get("PREVIEW_SAMPLES", "24")))
