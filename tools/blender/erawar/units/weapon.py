"""
The weapons of 시대 전쟁, modelled in Blender (see ../README.md), each in the frame of the game's pivot that holds it
(`soldier` in models.ts), edges bevelled: a club of knotted wood with a lashed stone head set with flint; a sling;
a spear with a knapped flint head; a sword (wrapped grip, pommel, guard, a blade with its fuller and bevelled edges)
and a kite shield (curved, rimmed, bossed, a cross on it); a longbow; a lance with its vamplate; a musket (stock,
barrel, lock and hammer, bands, ramrod, the fusilier's bayonet); a rifle; a machine gun with its jacket, bipod and
belt. One GLB per era and kind, w<era><kind>.glb, its nodes per paint, each vertex tagged with the pivot it sits on.

    blender -b --python weapon.py -- <out dir>
"""
import math, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from lib import *  # noqa


def rock(r, centre, paint, seed=0, n=14):
    s = ellipsoid((1, 1, 1), (0, 0, 0), paint, n, n * 2 // 3)
    d = norm(s.v)
    k = 1 + 0.16 * fbm(d * 2.2, 3, seed) + 0.06 * np.sign(np.sin(d[:, 0] * 7 + d[:, 1] * 5)) * 0.5
    s.v = d * np.asarray(r) * k[:, None] + np.asarray(centre)
    return s


def knots(seed):
    def fn(P, N, paints):
        wood = np.isin(paints, ["wood", "woodDark"])
        return np.where(wood, 0.0025 * fbm(P * np.array([40, 6, 40]), 3, seed) + 0.002 * np.sin(P[:, 1] * 90), 0)

    return fn


def club():
    P = [Part("shaft", lathe([(0.0, -0.06), (0.022, -0.055), (0.024, 0.0), (0.026, 0.1), (0.031, 0.25), (0.034, 0.36), (0.0, 0.38)], 10, "wood"), rigid(0), subdiv=1)]
    P[0].push(knots(1))
    P.append(Part("stone", rock((0.085, 0.1, 0.075), (0, 0.42, 0), "stone", 3), rigid(0), sharp=50))
    for y in (0.33, 0.355, 0.38):
        P.append(Part(f"thong{y}", loft([{"c": (0.04 * math.cos(t), y + 0.006 * math.sin(3 * t), 0.036 * math.sin(t)), "a": 0.006, "b": 0.006} for t in np.linspace(0, 2 * math.pi, 15)], n=5, paint="leather", caps=(False, False)), rigid(0)))
    chips = []
    for i in range(5):
        a = i / 5 * 2 * math.pi + 0.4
        c = (math.cos(a) * 0.075, 0.43 + (i % 2) * 0.03, math.sin(a) * 0.065)
        chips.append(slab([(0, 0), (0.025, 0.012), (0.0, 0.05), (-0.022, 0.012)], 0.012, "flint").moved(at(*c) @ rot("y", -a) @ rot("z", -math.pi / 2 + 0.3)))
    P.append(bevelled("chips", Shape.join(chips), 0, 0.003, 1))
    return ["club"], P


def sling():
    P = [Part("cords", Shape.join([tube([(0, 0, s * 0.006), (0.01, -0.09, s * 0.012), (0, -0.17, s * 0.01)], 0.004, 0.004, n=5, paint="rope") for s in (-1, 1)]), rigid(0))]
    P.append(Part("pouch", ellipsoid((0.04, 0.026, 0.04), (0, -0.18, 0), "hide", 10, 7), rigid(0)))
    P.append(Part("stone", rock((0.028, 0.026, 0.028), (0, -0.165, 0), "stone", 5, 10), rigid(0)))
    return ["hand"], P


def spear():
    P = [Part("shaft", lathe([(0.0, -0.25), (0.016, -0.24), (0.019, 0.3), (0.016, 0.64), (0.0, 0.65)], 8, "wood"), rigid(0), subdiv=1)]
    P[0].push(knots(2))
    head = slab([(-0.036, 0.0), (-0.028, 0.06), (-0.012, 0.14), (0.0, 0.18), (0.012, 0.14), (0.028, 0.06), (0.036, 0.0), (0.0, -0.03)], 0.016, "flint")
    # Knapped: the faces pushed into shallow scallops.
    head.v[:, 2] *= 1 - 0.6 * (np.abs(head.v[:, 0]) / 0.036) ** 2
    P.append(bevelled("head", head.moved(at(0, 0.64, 0) @ rot("y", math.pi / 2)), 0, 0.004, 1))
    P.append(Part("lash", Shape.join([loft([{"c": (0.023 * math.cos(t), 0.6 + y + 0.004 * math.cos(t), 0.023 * math.sin(t)), "a": 0.005, "b": 0.005} for t in np.linspace(0, 2 * math.pi, 13)], n=5, paint="leather", caps=(False, False)) for y in (0.0, 0.015, 0.03)]), rigid(0)))
    P.append(bevelled("streamer", slab([(0, 0), (0.09, -0.01), (0.08, -0.05), (0, -0.04)], 0.004, "team").moved(at(0.02, 0.56, 0)), 0, 0.0015, 1))
    return ["spear"], P


def kite_outline():
    pts = [(math.cos(math.pi - i / 8 * math.pi) * 0.15, 0.2 + math.sin(math.pi - i / 8 * math.pi) * 0.1) for i in range(9)]
    return pts + [(0.13, 0.02), (0.0, -0.34), (-0.13, 0.02)]


def sword_and_shield():
    P = []
    P.append(Part("grip", lathe([(0.0, -0.05), (0.017, -0.05), (0.019, 0.0), (0.017, 0.05), (0.0, 0.05)], 10, "leatherDark"), rigid(0), subdiv=1))
    wraps = [loft([{"c": (0.0185 * math.cos(t), y + 0.006 * math.sin(t), 0.0185 * math.sin(t)), "a": 0.003, "b": 0.003} for t in np.linspace(0, 2 * math.pi, 11)], n=4, paint="leather", caps=(False, False)) for y in np.linspace(-0.04, 0.04, 5)]
    P.append(Part("wraps", Shape.join(wraps), rigid(0)))
    P.append(Part("pommel", lathe([(0.0, -0.09), (0.02, -0.088), (0.028, -0.07), (0.022, -0.052), (0.012, -0.048), (0.0, -0.048)], 12, "brass"), rigid(0), subdiv=1))
    P.append(bevelled("guard", Shape.join([box((0.026, 0.02, 0.18), (0, 0.06, 0), "brass"), ellipsoid((0.014, 0.014, 0.014), (0, 0.06, 0.092), "brass", 8, 6), ellipsoid((0.014, 0.014, 0.014), (0, 0.06, -0.092), "brass", 8, 6)]), 0, 0.005, 2))
    # The blade: a flat diamond section, its edges bevelled, a fuller down its middle.
    secs = []
    for y, w in ((0.07, 0.025), (0.3, 0.023), (0.5, 0.019), (0.56, 0.008), (0.585, 0.001)):
        secs.append({"c": (0, y, 0), "a": 0.005, "b": w, "p": 1.1, "u": (1, 0, 0)})
    blade = loft(secs, n=8, paint="steel", up=(1, 0, 0), caps=(True, False), cap_len=0.002)
    P.append(Part("blade", blade, rigid(0), sharp=30))
    P.append(bevelled("fuller", box((0.0105, 0.36, 0.009), (0, 0.28, 0), "iron"), 0, 0.002, 1))
    # The shield on its own pivot: curved round the arm, rimmed, bossed, a cross on its face.
    kite = slab(kite_outline(), 0.03, "team")
    kite.v[:, 2] -= 0.5 * kite.v[:, 0] ** 2
    P.append(bevelled("kite", kite, 1, 0.006, 2))
    rim = [np.array([x * 1.01, y * 1.01, 0.016 - 0.5 * x * x]) for x, y in kite_outline()]
    rim.append(rim[0])
    P.append(Part("rim", tube(rim, 0.012, 0.012, n=6, paint="gold", samples=60), rigid(1)))
    P.append(Part("boss", lathe([(0.05, 0.0), (0.05, 0.008), (0.035, 0.03), (0.0, 0.04)], 14, "iron").moved(at(0, 0.1, 0.03) @ rot("x", math.pi / 2)), rigid(1), subdiv=1, sharp=45))
    cross = Shape.join([box((0.035, 0.38, 0.008), (0, -0.02, 0.026), "gold"), box((0.22, 0.035, 0.008), (0, 0.1, 0.026), "gold")])
    cross.v[:, 2] -= 0.5 * cross.v[:, 0] ** 2
    P.append(bevelled("cross", cross, 1, 0.003, 1))
    return ["sword", "shield"], P


def bow():
    pts = [(-0.03, -0.46, 0), (0.06, -0.36, 0), (0.14, -0.18, 0), (0.165, 0, 0), (0.14, 0.18, 0), (0.06, 0.36, 0), (-0.03, 0.46, 0)]
    stave = Shape.join([tube(pts[:4], 0.008, 0.018, n=8, paint="wood", samples=12), tube(pts[3:], 0.018, 0.008, n=8, paint="wood", samples=12)])
    P = [Part("stave", stave, rigid(0))]
    P.append(Part("string", tube([(-0.03, -0.46, 0), (-0.03, 0.46, 0)], 0.003, 0.003, n=4, paint="rope", samples=2), rigid(0)))
    P.append(Part("grip", lathe([(0.0, -0.045), (0.022, -0.045), (0.024, 0.0), (0.022, 0.045), (0.0, 0.045)], 10, "leather").moved(at(0.165, 0, 0)), rigid(0)))
    P.append(Part("nocks", Shape.join([ellipsoid((0.012, 0.016, 0.012), p, "bone", 6, 5) for p in ((-0.03, -0.46, 0), (-0.03, 0.46, 0))]), rigid(0)))
    return ["bow"], P


def lance():
    P = [Part("shaft", lathe([(0.0, -0.3), (0.03, -0.28), (0.045, -0.05), (0.04, 0.2), (0.016, 1.33), (0.0, 1.34)], 10, "wood"), rigid(0), subdiv=1)]
    P.append(Part("grip", lathe([(0.046, -0.04), (0.048, -0.04), (0.048, 0.04), (0.046, 0.04)], 12, "leatherDark", closed=(False, False)), rigid(0)))
    P.append(Part("vamplate", lathe([(0.0, -0.02), (0.03, -0.02), (0.09, 0.1), (0.085, 0.11), (0.0, 0.11)], 16, "team").moved(at(0, 0.05, 0)), rigid(0), subdiv=1, sharp=40))
    P.append(Part("tip", lathe([(0.0, 0.0), (0.02, 0.0), (0.026, 0.03), (0.0, 0.15)], 6, "steel").moved(at(0, 1.32, 0)), rigid(0), sharp=30))
    return ["lance"], P


def musket(bayonet):
    stock = slab([(-0.2, -0.075), (-0.2, 0.025), (-0.05, 0.012), (0.07, 0.014), (0.62, 0.008), (0.62, -0.012), (0.08, -0.02), (0.02, -0.035), (-0.06, -0.075)], 0.045, "wood")
    P = [bevelled("stock", stock.moved(rot("z", math.pi / 2)), 0, 0.008, 2)]
    P.append(Part("barrel", lathe([(0.0, 0.0), (0.016, 0.0), (0.015, 0.4), (0.012, 0.82), (0.008, 0.822), (0.0, 0.822)], 10, "dark").moved(at(-0.022, 0, 0)), rigid(0), sharp=40))
    P.append(bevelled("lock", box((0.03, 0.06, 0.01), (-0.005, 0.07, 0.026), "steel"), 0, 0.003, 1))
    P.append(bevelled("hammer", box((0.03, 0.012, 0.008), (0, 0, 0), "dark").moved(at(-0.03, 0.05, 0.026) @ rot("z", 0.5)), 0, 0.002, 1))
    P.append(bevelled("pan", box((0.012, 0.02, 0.012), (-0.02, 0.09, 0.024), "brass"), 0, 0.002, 1))
    P.append(bevelled("butt", box((0.1, 0.012, 0.048), (0.025, -0.202, 0), "brass"), 0, 0.002, 1))
    for y in (0.32, 0.5, 0.6):
        P.append(Part(f"band{y}", lathe([(0.021, -0.006), (0.024, -0.006), (0.024, 0.006), (0.021, 0.006)], 10, "brass", closed=(False, False)).moved(at(-0.014, y, 0)), rigid(0), sharp=40))
    P.append(Part("ramrod", lathe([(0.0, -0.19), (0.004, -0.19), (0.004, 0.19), (0.0, 0.19)], 6, "dark").moved(at(0.01, 0.42, 0)), rigid(0)))
    P.append(Part("trigger", tube([(0.03, 0.02, 0), (0.05, 0.03, 0), (0.05, 0.06, 0), (0.03, 0.07, 0)], 0.005, 0.005, n=5, paint="brass"), rigid(0)))
    if bayonet:
        blade = slab([(-0.006, 0), (0.006, 0), (0, 0.22)], 0.006, "steel").moved(at(-0.036, 0.8, 0) @ rot("y", math.pi / 2))
        P.append(bevelled("bayonet", blade, 0, 0.002, 1))
        P.append(Part("socket", lathe([(0.017, -0.03), (0.019, -0.03), (0.019, 0.03), (0.017, 0.03)], 10, "steel", closed=(False, False)).moved(at(-0.022, 0.79, 0)), rigid(0)))
    return ["gun"], P


def rifle():
    body = slab([(-0.2, -0.06), (-0.2, 0.02), (-0.02, 0.03), (0.24, 0.03), (0.24, -0.01), (0.05, -0.02), (0.02, -0.06), (-0.02, -0.02), (-0.1, -0.03)], 0.04, "black")
    P = [bevelled("body", body.moved(rot("z", math.pi / 2)), 0, 0.005, 2)]
    P.append(bevelled("handguard", box((0.045, 0.16, 0.045), (-0.008, 0.32, 0), "oliveDark"), 0, 0.01, 2))
    for k in range(4):
        P.append(bevelled(f"slot{k}", box((0.047, 0.012, 0.047), (-0.008, 0.26 + k * 0.04, 0), "black"), 0, 0.002, 1))
    mag = slab([(0, 0), (0.05, 0), (0.065, -0.1), (0.02, -0.11)], 0.025, "black").moved(at(0.03, 0.12, 0) @ rot("z", math.pi / 2))
    P.append(bevelled("mag", mag, 0, 0.004, 1))
    P.append(Part("barrel", lathe([(0.0, 0.0), (0.009, 0.0), (0.009, 0.14), (0.013, 0.15), (0.013, 0.19), (0.0, 0.192)], 10, "dark").moved(at(-0.01, 0.38, 0)), rigid(0), sharp=40))
    P.append(bevelled("sight", box((0.025, 0.06, 0.02), (-0.045, 0.12, 0), "dark"), 0, 0.004, 1))
    P.append(bevelled("frontsight", box((0.02, 0.012, 0.008), (-0.04, 0.37, 0), "dark"), 0, 0.002, 1))
    P.append(Part("sling", tube([(0.03, -0.15, 0.025), (0.06, 0.05, 0.03), (0.03, 0.3, 0.025)], 0.004, 0.004, n=4, paint="webbing"), rigid(0)))
    return ["gun"], P


def machine_gun():
    body = slab([(-0.2, -0.05), (-0.2, 0.03), (0.3, 0.035), (0.3, -0.03), (0.05, -0.035), (0.02, -0.08), (-0.03, -0.035)], 0.06, "black")
    P = [bevelled("body", body.moved(rot("z", math.pi / 2)), 0, 0.006, 2)]
    P.append(Part("jacket", lathe([(0.0, 0.0), (0.03, 0.0), (0.03, 0.24), (0.024, 0.26), (0.0, 0.262)], 12, "dark").moved(at(-0.005, 0.3, 0)), rigid(0), sharp=40))
    holes = [ellipsoid((0.006, 0.01, 0.006), (-0.005 + 0.031 * math.cos(a), 0.34 + k * 0.05, 0.031 * math.sin(a)), "black", 5, 4) for k in range(4) for a in np.linspace(0, 2 * math.pi, 6, endpoint=False)]
    P.append(Part("holes", Shape.join(holes), rigid(0)))
    P.append(Part("barrel", lathe([(0.0, 0.0), (0.011, 0.0), (0.011, 0.18), (0.015, 0.19), (0.015, 0.22), (0.0, 0.222)], 10, "black").moved(at(-0.005, 0.56, 0)), rigid(0), sharp=40))
    P.append(Part("handle", tube([(-0.03, 0.16, 0), (-0.075, 0.18, 0), (-0.075, 0.22, 0), (-0.03, 0.24, 0)], 0.007, 0.007, n=5, paint="black"), rigid(0)))
    for z in (-0.03, 0.03):
        P.append(Part(f"bipod{z}", tube([(0.03, 0.47, z), (0.05, 0.66, z * 1.4)], 0.006, 0.005, n=5, paint="dark", samples=2), rigid(0)))
    rounds = [lathe([(0.0, 0.0), (0.006, 0.0), (0.007, 0.022), (0.003, 0.034), (0.0, 0.035)], 6, "brass").moved(at(0.04 + i * 0.012, 0.1 - i * 0.03, 0.04) @ rot("x", math.pi / 2)) for i in range(7)]
    P.append(Part("rounds", Shape.join(rounds), rigid(0)))
    return ["gun"], P


MAKERS = {
    "w00": club,
    "w01": sling,
    "w02": spear,
    "w10": sword_and_shield,
    "w11": bow,
    "w12": lance,
    "w20": lambda: musket(True),
    "w21": lambda: musket(False),
    "w30": rifle,
    "w31": machine_gun,
}

if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :]
    out = argv[0]
    which = argv[1:] or list(MAKERS)
    os.makedirs(out, exist_ok=True)
    for name in which:
        reset()
        bones, parts = MAKERS[name]()
        for p in parts:
            p.finish()
        bake_ao(parts, samples=int(os.environ.get("BAKE_SAMPLES", "48")), reach=0.06, floor=0.6)
        prims = gather(parts, bones)
        size = write_glb(os.path.join(out, f"{name}.glb"), prims, {"bones": bones})
        nv = sum(len(d["P"]) for d in prims.values())
        print(f"DONE {name}: {len(prims)} paints, {nv} vertices, {size} bytes")
