"""
Bakes the soft shade of one 시대 전쟁 unit in Blender (run headless, see README.md here):

    blender -b --python ao.py -- <in.glb> <out.json> [reach]

The unit comes from the game's own kit (export.ts): its meshes named m0_mail, m1_skin, … in the order `aoMeshes`
lists them, each still holding the code's own vertices. Cycles bakes ambient occlusion into each mesh's vertices
(the shade inside a helmet, under a collar, between straps and folds, where an arm meets the body): each jointed group
pulled away from the others first, since a moving part's shade on its neighbours would be wrong as soon as it moves,
and looked at from both sides of every face, keeping the lighter (the code's mirrored parts leave some faces wound
inward). Out: for each mesh its vertex count and one byte of light per vertex, which the game multiplies into its paint.
"""
import base64, json, os, sys
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = argv[0], argv[1]
REACH = float(argv[2]) if len(argv) > 2 else 0.16
SAMPLES = int(os.environ.get("BAKE_SAMPLES", "96"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=False)
scene = bpy.context.scene
layer = bpy.context.view_layer
meshes = [o for o in scene.objects if o.type == "MESH" and o.name.startswith("m")]


def gltf_positions(path):
    """Each mesh node's own vertex positions, in the order the game holds them (Blender drops unused ones on import)."""
    import struct

    data = open(path, "rb").read()
    length = struct.unpack("<I", data[12:16])[0]
    doc = json.loads(data[20 : 20 + length])
    binary = data[20 + length + 8 :]
    out = {}
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        acc = doc["accessors"][doc["meshes"][node["mesh"]]["primitives"][0]["attributes"]["POSITION"]]
        view = doc["bufferViews"][acc["bufferView"]]
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        out[node["name"]] = np.frombuffer(binary, dtype=np.float32, count=acc["count"] * 3, offset=start).reshape(-1, 3)
    return out


source = gltf_positions(SRC)
key = lambda x, y, z: (round(x, 4), round(y, 4), round(z, 4))
# Where each of the game's vertices is among Blender's (glTF's y up is Blender's z up: (x, y, z) -> (x, -z, y)).
where = {}
for o in meshes:
    at = {key(*v.co): v.index for v in o.data.vertices}
    where[o.name] = [at.get(key(float(x), -float(z), float(y)), -1) for x, y, z in source[o.name]]

# Each group's meshes pulled apart from the rest (kept where they are relative to one another).
by_group = {}
for o in meshes:
    by_group.setdefault(o.parent.name if o.parent else "", []).append(o)
for o in meshes:
    world = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = world
for i, (name, group) in enumerate(sorted(by_group.items())):
    for o in group:
        o.location.x += 10 * (i + 1)
    for o in group:
        # (The code shares shapes among parts: each gets its own before its vertices are painted.)
        o.data = o.data.copy()

world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
world.light_settings.distance = REACH
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False


def bake():
    for o in meshes:
        attrs = o.data.color_attributes
        for a in [a for a in attrs]:
            attrs.remove(a)
        attrs.new("ao", "FLOAT_COLOR", "POINT")
        attrs.active_color = attrs["ao"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    layer.objects.active = meshes[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    out = {}
    for o in meshes:
        a = o.data.color_attributes["ao"]
        values = np.empty(len(a.data) * 4, dtype=np.float32)
        a.data.foreach_get("color", values)
        out[o.name] = values[0::4].copy()
    return out


front = bake()
for o in meshes:
    o.data.flip_normals()
back = bake()

result = {}
missing = 0
for o in meshes:
    light = np.maximum(front[o.name], back[o.name])
    # Light always reaches in (sky bounces off cloth and skin): the deepest shade is a little over half, so that a
    # joint tucked into a sleeve or a shoulder into a tunic darkens without going black.
    light = 0.56 + 0.44 * np.clip(light, 0, 1)
    index = np.array(where[o.name])
    missing += int((index < 0).sum())
    mine = np.where(index >= 0, light[np.maximum(index, 0)], 1.0)
    result[o.name] = {"n": len(index), "ao": base64.b64encode((mine * 255 + 0.5).astype(np.uint8).tobytes()).decode()}
with open(OUT, "w") as f:
    json.dump(result, f, separators=(",", ":"))
print("DONE", os.path.basename(OUT), len(result), "meshes,", missing, "vertices unused")
