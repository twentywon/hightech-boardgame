"""
The land behind 시대 전쟁's lane, made in Blender (run headless, see README.md here):

    blender -b --python terrain.py -- <out dir> <picture width>

One sheet of ground 180 m wide from just behind the woods (10 m back) to the far range (95 m back): rolling hills in
front that rise into a range of ridged, gullied peaks with snow on their upper slopes. Its heights are fractal noise
(Blender's own, seeded), its paint a node material that chooses grass, scree, rock and snow by height and steepness
with noise in every border, and Cycles bakes that paint with the shade the land throws on itself (gullies, the feet of
the peaks) under an even sky into one picture. The game lays the sheet with that picture and its own lights.
Out: terrain.glb (shape and coordinates only) and terrain.png.
"""
import bpy, bmesh, math, os, sys
from mathutils import noise, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
OUT, WIDE = argv[0], int(argv[1])
SAMPLES = int(os.environ.get("BAKE_SAMPLES", "48"))
X0, X1, Y0, Y1 = -90.0, 90.0, 10.0, 95.0
NX, NY = 360, 170

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
layer = bpy.context.view_layer


def smooth(a, b, t):
    t = min(1.0, max(0.0, (t - a) / (b - a)))
    return t * t * (3 - 2 * t)


def fbm(x, y, octaves=5):
    return noise.fractal(Vector((x, y, 0.37)), 0.55, 2.03, octaves, noise_basis="PERLIN_ORIGINAL")


def ridged(x, y):
    return noise.ridged_multi_fractal(Vector((x, y, 1.7)), 0.9, 2.1, 6, 1.0, 2.0, noise_basis="PERLIN_ORIGINAL")


def height(x, y):
    # Rolling hills before the range, low near the woods so that the sheet's edge hides behind them.
    near = smooth(10, 22, y)
    hills = near * (2.2 + 2.6 * fbm(x / 26, y / 26) + 1.2 * fbm(x / 9, y / 9, 3))
    # The range: ridged peaks rising from about 45 m back, highest between 65 and 85 m, bunched into massifs.
    rise = smooth(40, 60, y) * (1 - 0.2 * smooth(85, 95, y))
    massif = max(0.15, 0.55 + 0.9 * fbm(x / 34, 3.1, 3))
    peaks = rise * massif * (3 + 13 * ridged(x / 22, y / 22) + 2.5 * fbm(x / 7, y / 7, 4))
    return hills + peaks - 0.6


bpy.ops.mesh.primitive_grid_add(x_subdivisions=NX, y_subdivisions=NY, size=1)
land = layer.objects.active
land.name = land.data.name = "Terrain"
me = land.data
for v in me.vertices:
    x = X0 + (v.co.x + 0.5) * (X1 - X0)
    y = Y0 + (v.co.y + 0.5) * (Y1 - Y0)
    v.co = Vector((x, y, height(x, y)))
me.update()
for p in me.polygons:
    p.use_smooth = True
top = max(v.co.z for v in me.vertices)
print("TOP", round(top, 1))

# The paint: by height and steepness, every border broken by noise.
mat = bpy.data.materials.new("land")
mat.use_nodes = True
t = mat.node_tree
nodes, links = t.nodes, t.links
bsdf = nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 1.0
geo = nodes.new("ShaderNodeNewGeometry")
sep = nodes.new("ShaderNodeSeparateXYZ")
links.new(geo.outputs["Position"], sep.inputs[0])
nsep = nodes.new("ShaderNodeSeparateXYZ")
links.new(geo.outputs["Normal"], nsep.inputs[0])
tex = nodes.new("ShaderNodeTexNoise")
tex.inputs["Scale"].default_value = 0.35
tex.inputs["Detail"].default_value = 8
links.new(geo.outputs["Position"], tex.inputs["Vector"])
fine = nodes.new("ShaderNodeTexNoise")
fine.inputs["Scale"].default_value = 2.2
fine.inputs["Detail"].default_value = 6
links.new(geo.outputs["Position"], fine.inputs["Vector"])


def math_node(op, a=None, b=None, value=None):
    n = nodes.new("ShaderNodeMath")
    n.operation = op
    for i, src in enumerate((a, b)):
        if src is None:
            continue
        if isinstance(src, (int, float)):
            n.inputs[i].default_value = src
        else:
            links.new(src, n.inputs[i])
    return n.outputs[0]


def mix(fac, a, b):
    n = nodes.new("ShaderNodeMix")
    n.data_type = "RGBA"
    links.new(fac, n.inputs["Factor"])
    for key, src in (("A", a), ("B", b)):
        if isinstance(src, tuple):
            n.inputs[key].default_value = (*src, 1)
        else:
            links.new(src, n.inputs[key])
    return n.outputs["Result"]


def ramp(fac, stops):
    n = nodes.new("ShaderNodeValToRGB")
    links.new(fac, n.inputs["Fac"])
    els = n.color_ramp.elements
    for i, (at, rgb) in enumerate(stops):
        e = els[i] if i < len(els) else els.new(at)
        e.position = at
        e.color = (*rgb, 1)
    return n.outputs["Color"]


def lin(hex_colour):
    out = []
    for i in (1, 3, 5):
        c = int(hex_colour[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# Grass, mottled; rock, banded and mottled; snow.
grass = ramp(tex.outputs["Fac"], [(0.3, lin("#4d7a2c")), (0.55, lin("#6b9440")), (0.75, lin("#7f9c4a"))])
rock = ramp(fine.outputs["Fac"], [(0.25, lin("#4e5a6c")), (0.5, lin("#6b788c")), (0.72, lin("#8792a4"))])
scree = mix(math_node("MULTIPLY", tex.outputs["Fac"], 1.0), lin("#7f8478"), lin("#8b8f86"))
snow = ramp(fine.outputs["Fac"], [(0.3, lin("#dfe6ef")), (0.6, lin("#f6f8fb"))])
height_n = math_node("DIVIDE", sep.outputs["Z"], top)
wobble = math_node("MULTIPLY", math_node("SUBTRACT", tex.outputs["Fac"], 0.5), 0.18)
h = math_node("ADD", height_n, wobble)
steep = math_node("SUBTRACT", 1.0, nsep.outputs["Z"])
# Grass gives way to scree and rock as the ground steepens and rises; snow lies above a ragged line, less on cliffs.
to_rock = math_node("MAXIMUM", math_node("MULTIPLY", math_node("SUBTRACT", steep, 0.16), 4.0), math_node("MULTIPLY", math_node("SUBTRACT", h, 0.2), 5.0))
to_rock = math_node("MINIMUM", math_node("MAXIMUM", to_rock, 0.0), 1.0)
ground = mix(to_rock, grass, mix(math_node("MULTIPLY", fine.outputs["Fac"], 1.0), scree, rock))
snowy = math_node("MULTIPLY", math_node("SUBTRACT", h, 0.36), 6.0)
snowy = math_node("SUBTRACT", snowy, math_node("MULTIPLY", steep, 0.8))
snowy = math_node("MINIMUM", math_node("MAXIMUM", snowy, 0.0), 1.0)
links.new(mix(snowy, ground, snow), bsdf.inputs["Base Color"])
me.materials.append(mat)

# The bake: an even sky, the land shading itself.
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.view_settings.view_transform = "Standard"
image = bpy.data.images.new("terrain", WIDE, WIDE // 2, alpha=False)
node = nodes.new("ShaderNodeTexImage")
node.image = image
nodes.active = node
bpy.ops.object.select_all(action="DESELECT")
land.select_set(True)
layer.objects.active = land
bpy.ops.object.bake(type="COMBINED", pass_filter={"DIRECT", "INDIRECT", "DIFFUSE", "GLOSSY", "EMIT"}, margin=2, use_clear=True)
image.filepath_raw = os.path.join(OUT, "terrain.png")
image.file_format = "PNG"
image.save()

# Lighter to draw: the flat foothills keep few triangles, the ridges more (the coordinates go along).
before = len(me.polygons) * 2
d = land.modifiers.new("cut", "DECIMATE")
d.ratio = float(os.environ.get("TERRAIN_KEEP", "0.3"))
d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="cut")
print("TRIANGLES terrain", before, "->", sum(len(p.vertices) - 2 for p in me.polygons))
me.materials.clear()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "terrain.glb"), export_format="GLB", export_materials="NONE", export_texcoords=True, export_normals=True, export_yup=True)
print("DONE terrain")
