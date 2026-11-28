"""
The pictures 시대 전쟁's people wear (see ../README.md, "Artist-made people"): the packs' own colour maps, cut down to
1024 px, and the variants the game needs — the peasant's shirt in each side's colour, the ranger's
greens in each side's colour. Plain Python with Pillow and NumPy (not inside Blender):

    python3 tex.py <packs dir> <work dir> <game texture dir>

writes PNGs (for people.py to read each vertex's colour) to the work dir and WebPs (for the game) to the texture dir.
"""
import os, sys, colorsys
import numpy as np
from PIL import Image

SRC, WORK, GAME = sys.argv[1:4]
SIZE = 1024
SIDES = ["#d2452b", "#2f6ed0"]
UBC = os.path.join(SRC, "Universal Base Characters[Standard]", "Base Characters", "Textures")
OUT = os.path.join(SRC, "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)", "Outfits")


def load(path):
    return np.asarray(Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64) / 255


def hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0)
    gc = np.where(m, (mx - g) / np.where(m, d, 1), 0)
    bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = (h / 6) % 1
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def step(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def hexrgb(c):
    return np.array([int(c[i : i + 2], 16) / 255 for i in (1, 3, 5)])


def save(name, a):
    im = Image.fromarray(np.clip(np.round(a * 255), 0, 255).astype(np.uint8))
    im.save(os.path.join(WORK, name + ".png"))
    im.save(os.path.join(GAME, name + ".webp"), quality=82, method=6)


def lift(a, g=0.8):
    """The peasant's dark browns a little lighter (at a lane's distance they read as black)."""
    return a**g


def sleeves():
    m = np.load(os.path.join(WORK, "peasantSleeves.npy")).astype(np.float64)
    # (A pixel's grow, so that the dye reaches the islands' edges.)
    g = m.copy()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        g = np.maximum(g, np.roll(np.roll(m, dx, 1), dy, 0))
    return g


def shirt(a, colour, strength=0.92):
    """The peasant's pale linen (low saturation, bright) and his sleeves dyed `colour`, folds and shading kept."""
    h, s, v = hsv(a)
    lum = a.mean(-1, keepdims=True)
    pale = step(0.42, 0.34, s) * step(0.38, 0.48, v) * step(0.08, 0.1, h) * step(0.2, 0.17, h)
    out = a * (1 - pale[..., None] * strength) + colour * np.clip(lum / 0.55, 0, 1.25) ** 1.2 * pale[..., None] * strength
    sl = sleeves()[..., None] * strength
    return out * (1 - sl) + colour * np.clip(lum / 0.26, 0, 1.3) ** 1.1 * 0.85 * sl


def regreen(a, colour):
    """The ranger's greens turned to `colour`'s hue (their lightness and grain kept)."""
    h, s, v = hsv(a)
    th, ts, tv = colorsys.rgb_to_hsv(*colour)
    mask = step(0.15, 0.2, h) * step(0.5, 0.44, h) * step(0.12, 0.22, s)
    out = rgb(np.full_like(h, th), np.clip(s * 0.9 + ts * 0.15, 0, 1), np.clip(v * (0.75 + 0.5 * tv), 0, 1))
    return a * (1 - mask[..., None]) + out * mask[..., None]


def hide(a):
    """The base body's black shorts to a hide wrap's browns (for the stone age)."""
    h, s, v = hsv(a)
    dark = step(0.32, 0.26, v) * step(0.14, 0.08, s)
    rng = np.random.default_rng(3)
    grain = rng.normal(0, 0.05, a.shape[:2])
    tone = np.array([0.36, 0.24, 0.13])[None, None] * (1 + grain[..., None]) * (0.55 + 2.2 * v[..., None])
    return a * (1 - dark[..., None]) + tone * dark[..., None]


os.makedirs(WORK, exist_ok=True)
os.makedirs(GAME, exist_ok=True)
skin = load(os.path.join(UBC, "T_Superhero_Male_Dark.png"))
save("skin", skin)
save("skinHide", hide(skin))
save("hands", load(os.path.join(OUT, "T_Regular_Male_Dark_BaseColor.png")))
save("hair1", load(os.path.join(UBC, "T_Hair_1_BaseColor.png")))
save("hair2", load(os.path.join(UBC, "T_Hair_2_BaseColor.png")))
eye = np.asarray(Image.open(os.path.join(UBC, "T_Eye_Brown.png")).convert("RGB").resize((256, 256))).astype(np.float64) / 255
save("eye", eye)
peasant = lift(load(os.path.join(OUT, "T_Peasant_BaseColor.png")))
ranger = load(os.path.join(OUT, "T_Ranger_BaseColor.png"))
for i, c in enumerate(SIDES):
    save(f"peasant{i}", shirt(peasant, hexrgb(c)))
    save(f"ranger{i}", regreen(ranger, hexrgb(c)))
print("done")
