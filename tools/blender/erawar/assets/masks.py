"""
Where on the peasant's picture its sleeves are (for tex.py to dye them in a side's colour with the shirt): every
triangle of the outfit's arms that wears the peasant's picture, drawn into a mask at the picture's place.

    blender -b --python masks.py -- <packs dir> <work dir>

writes <work dir>/peasantSleeves.npy (1024 × 1024, row 0 at the top, 1 where a sleeve is).
"""
import os, sys
import numpy as np
import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, WORK = argv[:2]
SIZE = 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)", "Outfits", "Male_Peasant.gltf"))
mask = np.zeros((SIZE, SIZE), dtype=np.uint8)
o = bpy.data.objects["Male_Peasant_Arms"]
me = o.data
me.calc_loop_triangles()
uv = np.empty(len(me.loops) * 2)
me.uv_layers.active.data.foreach_get("uv", uv)
uv = uv.reshape(-1, 2)
for t in me.loop_triangles:
    if not me.materials[t.material_index].name.startswith("MI_Peasant"):
        continue
    p = np.array([uv[l] for l in t.loops])
    p = np.stack([p[:, 0] * SIZE, (1 - p[:, 1]) * SIZE], 1)
    x0, y0 = np.floor(p.min(0)).astype(int) - 1
    x1, y1 = np.ceil(p.max(0)).astype(int) + 1
    xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, SIZE)), np.arange(max(y0, 0), min(y1, SIZE)))
    if not xs.size:
        continue
    q = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
    a, b, c = p
    d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(d) < 1e-9:
        continue
    l1 = ((b[1] - c[1]) * (q[:, 0] - c[0]) + (c[0] - b[0]) * (q[:, 1] - c[1])) / d
    l2 = ((c[1] - a[1]) * (q[:, 0] - c[0]) + (a[0] - c[0]) * (q[:, 1] - c[1])) / d
    inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
    mask[ys.ravel()[inside], xs.ravel()[inside]] = 1
os.makedirs(WORK, exist_ok=True)
np.save(os.path.join(WORK, "peasantSleeves.npy"), mask)
print("MASK", mask.mean())
