"""
시대 전쟁's people from artist-made models (see ../README.md, "Artist-made people"): Quaternius' Universal Base
Characters (the body, head, eyes, brows, hair and beard) dressed in his Modular Character Outfits - Fantasy (the
peasant's shirt, vest, trousers and shoes; the ranger's hood, jerkin, bracers, belts and boots), all CC0. Blender
puts the arms down (the packs stand in a T), keeps only the head and neck of the body under clothes, adds what the
packs lack (a hide wrap and a band for the stone age, helms, a tricorn, cross-belts, a modern helmet and vest, side
bands), thins the shapes, bakes Cycles' ambient occlusion into the vertices and writes, for each era and kind,
a<era><kind>.glb (lit, about 10k triangles) and a<era><kind>l.glb (where the processor draws, about 3.5k), each part
a primitive named after its picture ("tex:peasant0") or a game paint ("team", "steel"), each vertex carrying the
two game joints that move it, its baked light and its picture's colour for each side.

    blender -b --python people.py -- <packs dir> <work dir (tex.py's PNGs)> <out dir> [era kind ...]
"""
import math, os, sys, json, struct
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1 :]
SRC, WORK, OUT = argv[:3]
ONLY = [(int(argv[i]), int(argv[i + 1])) for i in range(3, len(argv) - 1, 2)]
UBC = os.path.join(SRC, "Universal Base Characters[Standard]")
FIT = os.path.join(SRC, "Modular Character Outfits - Fantasy[Standard]", "Exports", "glTF (Godot-Unreal)")
HAIR = os.path.join(UBC, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
BODY = os.path.join(UBC, "Base Characters", "Godot - UE", "Superhero_Male_FullBody.gltf")
SCALE = 0.707  # 1.81 m to the game's 1.28
RICH, LO = 10000, 3500
SAMPLES = int(os.environ.get("AO_SAMPLES", "48"))

BONES = ["body", "leg0", "knee0", "leg1", "knee1", "chest", "head", "arm0", "elbow0", "arm1", "elbow1"]
JOINT = {
    "root": "body", "pelvis": "body",
    "thigh_l": "leg0", "calf_l": "knee0", "foot_l": "knee0", "ball_l": "knee0",
    "thigh_r": "leg1", "calf_r": "knee1", "foot_r": "knee1", "ball_r": "knee1",
    "spine_01": "chest", "spine_02": "chest", "spine_03": "chest", "clavicle_l": "chest", "clavicle_r": "chest",
    "neck_01": "head", "Head": "head",
    "upperarm_l": "arm0", "lowerarm_l": "elbow0", "upperarm_r": "arm1", "lowerarm_r": "elbow1",
}


def bone_joint(name):
    """The game joint a pack bone's vertices follow (by name: the legs' and feet's to the leg and knee, the hands'
    and fingers' to the forearm; anything else to the body)."""
    if name in JOINT:
        return JOINT[name]
    side = "0" if name.endswith("_l") else "1" if name.endswith("_r") else None
    if side is not None:
        if any(k in name for k in ("ball", "foot", "toe", "calf")):
            return "knee" + side
        if "thigh" in name:
            return "leg" + side
        if any(k in name for k in ("hand", "thumb", "index", "middle", "ring", "pinky", "lowerarm")):
            return "elbow" + side
        if "upperarm" in name:
            return "arm" + side
    return "body"


# What each era and kind wears (kind 2's rider reuses kind 0, the gunner kind 1), and its hands (left, right): a fist
# round what it holds (a weapon, a shield, the reins), or at rest, a little curled. The swordsman's left arm carries
# the shield ("shield": the forearm across its back, the hand at its grip).
DRESS = {
    (0, 0): dict(hands=("rest", "fist"), body=True, skin="skinHide", hair="Hair_Long+Hair_Buzzed", hairTint=(0.23, 0.15, 0.09), beard=True, extras=["wrap", "band"]),
    (0, 1): dict(hands=("rest", "fist"), body=True, skin="skinHide", hair="Hair_Buzzed", hairTint=(0.33, 0.17, 0.08), beard=True, extras=["wrap", "band", "sash"]),
    (1, 0): dict(hands=("fist", "fist"), pose="shield", outfit="Male_Peasant", tex="peasant", hair="Hair_Buzzed", hairTint=(0.33, 0.17, 0.08), beard=True, extras=["helm"]),
    (1, 1): dict(hands=("fist", "fist"), outfit="Male_Ranger", tex="ranger", hair="Hair_SimpleParted", hairTint=(0.3, 0.2, 0.1), beard=False, extras=[]),
    (2, 0): dict(hands=("fist", "fist"), outfit="Male_Peasant", tex="peasant", hair="Hair_SimpleParted", hairTint=(0.18, 0.12, 0.08), beard=False, extras=["tricorn", "belts"]),
    (2, 1): dict(hands=("fist", "fist"), outfit="Male_Peasant", tex="peasant", hair="Hair_SimpleParted", hairTint=(0.35, 0.25, 0.14), beard=True, extras=["tricorn", "belts"]),
    (3, 0): dict(hands=("fist", "fist"), outfit="Male_Peasant", tex="peasantOlive", team=False, hair="Hair_Buzzed", hairTint=(0.2, 0.14, 0.09), beard=False, extras=["helmet", "vest", "armband"]),
    (3, 1): dict(hands=("fist", "fist"), outfit="Male_Peasant", tex="peasantOlive", team=False, hair="Hair_Buzzed", hairTint=(0.12, 0.09, 0.07), beard=True, extras=["helmet", "vest", "armband"]),
}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in list(new):
        if o.type == "MESH" and o.name.startswith("Icosphere"):
            bpy.data.objects.remove(o)
            new.remove(o)
    return new


def picture(mat):
    """The colour map's name of an imported material (None for none)."""
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            link = n.inputs["Base Color"].links
            if link:
                src = link[0].from_node
                while src.type != "TEX_IMAGE" and src.inputs and any(i.links for i in src.inputs):
                    src = next(i.links[0].from_node for i in src.inputs if i.links)
                if src.type == "TEX_IMAGE" and src.image:
                    return src.image.name
    return None


def gather_model(dress):
    """The body (or its head), hair and clothes on one armature."""
    arm = None
    meshes = []

    def take(objs, keep=lambda o: True):
        nonlocal arm
        a = next(o for o in objs if o.type == "ARMATURE")
        for o in objs:
            if o.type != "MESH":
                continue
            if not keep(o):
                bpy.data.objects.remove(o)
                continue
            meshes.append(o)
            if arm is not None and a is not arm:
                mw = o.matrix_world.copy()
                o.parent = arm
                o.matrix_world = mw
                for m in o.modifiers:
                    if m.type == "ARMATURE":
                        m.object = arm
        if arm is None:
            arm = a
        elif a is not arm:
            bpy.data.objects.remove(a)

    take(imp(BODY))
    for hair in dress["hair"].split("+"):
        take(imp(os.path.join(HAIR, hair + ".gltf")))
    if dress.get("beard"):
        take(imp(os.path.join(HAIR, "Hair_Beard.gltf")))
    if "outfit" in dress:
        take(imp(os.path.join(FIT, "Outfits", dress["outfit"] + ".gltf")))
    return arm, meshes


FINGERS = ("index", "middle", "ring", "pinky")
# How far each joint of a finger bends (degrees): a fist round a grip, or a hand at rest.
CURL = {"fist": (78, 96, 62), "rest": (18, 26, 16)}
THUMB = {"fist": (32, 38, 40), "rest": (8, 10, 10)}
# The shield arm (pack frame: faces -y, +x the left): the upper arm forward and a little down (the elbow out in front
# of the chest, where the game's side view sees it), the forearm across the front toward the right, the fist at the
# shield's grip.
SHIELD_ARM = {"upperarm_l": (0.22, -0.78, -0.58), "lowerarm_l": (-0.66, -0.73, 0.16), "hand_l": (-0.6, -0.76, 0.24)}


def turn_bone(arm, name, axis, degrees):
    """A pose bone turned about a world axis through its head (its children follow)."""
    bpy.context.view_layer.update()
    pb = arm.pose.bones[name]
    inv = arm.matrix_world.inverted().to_3x3()
    M = pb.matrix.copy()
    head = M.translation.copy()
    R = Matrix.Rotation(math.radians(degrees), 4, (inv @ Vector(axis)).normalized())
    pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M
    bpy.context.view_layer.update()


def curl_hands(arm, hands):
    """In the packs' T (palms down, fingers along ±x), each hand closed as `hands` says: the fingers bent down under
    the palm joint by joint, the thumb turned under and across them."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for (l, s), how in zip((("l", 1), ("r", -1)), hands):
        a, b, c = CURL[how]
        for f in FINGERS:
            for j, deg in ((1, a), (2, b), (3, c)):
                turn_bone(arm, f"{f}_0{j}_{l}", (0, s, 0), deg)
        t1, t2, t3 = THUMB[how]
        # (The thumb: its root swung under the palm toward the fingers, its joints bent across them.)
        turn_bone(arm, f"thumb_01_{l}", (s, 0, 0), -t1)
        turn_bone(arm, f"thumb_01_{l}", (0, 0, 1), s * t1 * 0.6)
        turn_bone(arm, f"thumb_02_{l}", (0, s, 0), t2)
        turn_bone(arm, f"thumb_03_{l}", (0, s, 0), t3)
    bpy.ops.object.mode_set(mode="OBJECT")


def pose_arms(arm, pose=None):
    """Arms from the T down by the sides, a little out and the forearms a touch forward (the game's rest); with
    `pose` "shield", the left arm raised to carry a shield."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    inv = arm.matrix_world.inverted()

    def aim(name, d):
        bpy.context.view_layer.update()
        pb = arm.pose.bones[name]
        M = pb.matrix.copy()
        head = M.translation.copy()
        cur = (pb.tail - pb.head).normalized()
        target = (inv.to_3x3() @ Vector(d)).normalized()
        R = cur.rotation_difference(target).to_matrix().to_4x4()
        pb.matrix = Matrix.Translation(head) @ R @ Matrix.Translation(-head) @ M
        bpy.context.view_layer.update()

    for s, l in ((1, "l"), (-1, "r")):
        aim(f"clavicle_{l}", (s * 1.0, 0.02, -0.12))
        if pose == "shield" and l == "l":
            for name, d in SHIELD_ARM.items():
                aim(name, d)
            continue
        aim(f"upperarm_{l}", (s * 0.16, -0.02, -1.0))
        aim(f"lowerarm_{l}", (s * 0.08, -0.22, -1.0))
        aim(f"hand_{l}", (s * 0.04, -0.2, -1.0))
    bpy.ops.object.mode_set(mode="OBJECT")


def apply_pose(meshes):
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            if m.type == "ARMATURE":
                bpy.ops.object.modifier_apply(modifier=m.name)


def keep_head(o):
    """Of the body under clothes, only what the head and neck move (the rest is hidden)."""
    groups = {g.index: g.name for g in o.vertex_groups}
    keep = np.zeros(len(o.data.vertices), dtype=bool)
    for v in o.data.vertices:
        w = sum(g.weight for g in v.groups if groups.get(g.group) in ("Head", "neck_01"))
        keep[v.index] = w > 0.3 and v.co.z > 1.4
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    gone = [f for f in bm.faces if not all(keep[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(o.data)
    bm.free()


# ─────────────── what the packs lack ───────────────


def new_mesh(name, verts, faces, group_of, paint):
    """A mesh with its vertices given to the armature's bones (`group_of(co)` → [(bone, weight)])."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    mat = bpy.data.materials.get("paint:" + paint) or bpy.data.materials.new("paint:" + paint)
    me.materials.append(mat)
    for i, v in enumerate(me.vertices):
        for bone, w in group_of(v.co):
            g = o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone)
            g.add([i], w, "REPLACE")
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return o


def ring_shape(rings, n=24):
    """A tube by rings: [(z, cx, cy, rx, ry, jag)], each ring n points round; faces between."""
    V, F = [], []
    for z, cx, cy, rx, ry, jag in rings:
        for i in range(n):
            a = 2 * math.pi * i / n
            k = 1 + jag * (0.5 + 0.5 * math.sin(i * 2.7 + z * 40))
            V.append((cx + rx * k * math.cos(a), cy + ry * k * math.sin(a), z - (jag * 0.06 * ((i * 7) % 3))))
    for r in range(len(rings) - 1):
        for i in range(n):
            a, b = r * n + i, r * n + (i + 1) % n
            F.append((a, b, b + n, a + n))
    return V, F


def lathe_shape(profile, n=28, cx=0.0, cy=0.0, sx=1.0, sy=1.0):
    """Turned round z: profile [(r, z)] from the rim up; a cap at the top."""
    V, F = [], []
    for r, z in profile:
        for i in range(n):
            a = 2 * math.pi * i / n
            V.append((cx + r * sx * math.cos(a), cy + r * sy * math.sin(a), z))
    for j in range(len(profile) - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            F.append((a, b, b + n, a + n))
    top = len(V)
    V.append((cx, cy, profile[-1][1] + 0.002))
    base = (len(profile) - 1) * n
    for i in range(n):
        F.append((base + i, base + (i + 1) % n, top))
    return V, F


def head_frame(arm):
    pb = arm.pose.bones["Head"]
    h = arm.matrix_world @ pb.head
    return h  # the head bone's root (top of the neck)


def extras_for(arm, dress, era, kind):
    out = []
    hb = head_frame(arm)
    hx, hy, hz = hb.x, hb.y, hb.z
    on_head = lambda co: [("Head", 1.0)]
    for e in dress["extras"]:
        if e == "wrap":
            # A hide wrap round the hips, ragged at the hem; the hem follows the thighs.
            rings = [(1.03, 0, 0.01, 0.175, 0.13, 0.0), (0.97, 0, 0.0, 0.19, 0.145, 0.02), (0.86, 0, -0.005, 0.215, 0.165, 0.06), (0.74, 0, -0.01, 0.235, 0.18, 0.12)]
            V, F = ring_shape(rings, 28)

            def g(co):
                low = min(1, max(0, (0.98 - co.z) / 0.24))
                leg = "thigh_l" if co.x > 0 else "thigh_r"
                return [("pelvis", 1 - low * 0.8), (leg, low * 0.8)] if low > 0 else [("pelvis", 1.0)]

            out.append(new_mesh("wrap", V, F, g, "fur"))
        elif e == "band":
            V, F = ring_shape([(hz + 0.115, hx, hy + 0.005, 0.098, 0.112, 0), (hz + 0.145, hx, hy + 0.005, 0.096, 0.11, 0)], 24)
            out.append(new_mesh("band", V, F, on_head, "team"))
        elif e == "sash":
            # A side-coloured sash from the left shoulder to the right hip.
            V, F = [], []
            n = 14
            for i in range(n + 1):
                t = i / n
                a = math.pi * 2 * t
                x = 0.16 * math.cos(a) * (1 - 0.15 * t)
                y = 0.13 * math.sin(a)
                z = 1.42 - 0.38 * t + 0.08 * math.cos(a)
                for w in (-0.035, 0.035):
                    V.append((x, y, z + w))
            for i in range(n):
                F.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
            out.append(new_mesh("sash", V, F, lambda co: [("spine_02", 1.0)], "team"))
        elif e == "helm":
            # A nasal helm: a pointed iron cap, a rim, a nose guard; a side-coloured plume.
            prof = [(0.122, hz + 0.075), (0.126, hz + 0.1), (0.124, hz + 0.16), (0.112, hz + 0.21), (0.08, hz + 0.25), (0.035, hz + 0.275), (0.0, hz + 0.285)]
            V, F = lathe_shape(prof, 28, hx, hy + 0.008, 1.0, 1.08)
            out.append(new_mesh("helm", V, F, on_head, "steel"))
            V, F = ring_shape([(hz + 0.07, hx, hy + 0.008, 0.128, 0.138, 0), (hz + 0.095, hx, hy + 0.008, 0.13, 0.14, 0)], 28)
            out.append(new_mesh("rim", V, F, on_head, "iron"))
            ny = hy - 0.142
            V = [(hx - 0.013, ny, hz + 0.1), (hx + 0.013, ny, hz + 0.1), (hx + 0.01, ny - 0.004, hz - 0.0), (hx - 0.01, ny - 0.004, hz - 0.0),
                 (hx - 0.013, ny + 0.012, hz + 0.1), (hx + 0.013, ny + 0.012, hz + 0.1), (hx + 0.01, ny + 0.008, hz - 0.0), (hx - 0.01, ny + 0.008, hz - 0.0)]
            F = [(0, 1, 2, 3), (5, 4, 7, 6), (0, 4, 5, 1), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)]
            out.append(new_mesh("nasal", V, F, on_head, "iron"))
            V, F = ring_shape([(hz + 0.26 + 0.02 * i, hx, hy + 0.03 + 0.03 * i, 0.012 + 0.004 * math.sin(i), 0.03, 0) for i in range(6)], 10)
            out.append(new_mesh("plume", V, F, on_head, "team"))
        elif e == "tricorn":
            # A felt tricorn: a crown and a brim turned up on three sides, gold lace on its edge.
            V, F = lathe_shape([(0.112, hz + 0.155), (0.118, hz + 0.2), (0.108, hz + 0.235), (0.07, hz + 0.255), (0.0, hz + 0.26)], 30, hx, hy + 0.01, 1, 1.08)
            out.append(new_mesh("crown", V, F, on_head, "black"))
            V, F = [], []
            n = 48
            a0 = -math.pi / 2 - math.pi / 3  # a corner to the front (the pack faces -y)
            for i in range(n):
                a = 2 * math.pi * i / n
                up = 0.5 + 0.5 * math.cos(3 * (a - a0))  # 0 at the three corners, 1 between
                for r, lift in ((0.108, 0.0), (0.135, 0.012 + 0.03 * up), (0.16, 0.02 + 0.075 * up)):
                    rr = r - (r - 0.108) * 0.45 * up  # (the turned-up sides stand nearly upright)
                    V.append((hx + rr * math.cos(a), hy + 0.01 + rr * 1.06 * math.sin(a), hz + 0.16 + lift))
            for i in range(n):
                for k2 in range(2):
                    a, b = 3 * i + k2, 3 * ((i + 1) % n) + k2
                    F.append((a, b, b + 1, a + 1))
            out.append(new_mesh("brim", V, F, on_head, "black"))
            V2 = [(x, y, z + 0.003) for (x, y, z) in V[2::3]]
            Vg, Fg = [], []
            for i in range(n):
                x, y, z = V2[i]
                Vg += [(x, y, z), (x, y, z - 0.012)]
            for i in range(n):
                a, b = 2 * i, 2 * ((i + 1) % n)
                Fg.append((a, b, b + 1, a + 1))
            out.append(new_mesh("lace", Vg, Fg, on_head, "gold" if kind == 0 else "white"))
        elif e == "belts":
            # White cross-belts over the shirt and vest.
            for s in (1, -1):
                V, F = [], []
                n = 16
                for i in range(n + 1):
                    t = i / n
                    a = math.pi * 2 * t
                    x = (0.165 + 0.01 * math.sin(a * 2)) * math.cos(a)
                    y = 0.135 * math.sin(a) - 0.005
                    z = 1.43 - 0.0 + s * 0.2 * math.cos(a) - 0.2
                    for w in (-0.022, 0.022):
                        V.append((x, y, z + w))
                for i in range(n):
                    F.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
                out.append(new_mesh(f"belt{s}", V, F, lambda co: [("spine_02", 1.0)], "white"))
        elif e == "helmet":
            prof = [(0.155, hz + 0.09), (0.152, hz + 0.105), (0.135, hz + 0.115), (0.135, hz + 0.16), (0.122, hz + 0.21), (0.09, hz + 0.25), (0.045, hz + 0.27), (0.0, hz + 0.276)]
            V, F = lathe_shape(prof, 30, hx, hy + 0.012, 1.0, 1.1)
            out.append(new_mesh("helmet", V, F, on_head, "olive"))
            V, F = ring_shape([(hz + 0.125, hx, hy + 0.012, 0.138, 0.152, 0), (hz + 0.145, hx, hy + 0.012, 0.137, 0.151, 0)], 30)
            out.append(new_mesh("strap", V, F, on_head, "oliveDark"))
        elif e == "vest":
            # A plate carrier: front and back plates over the shirt, pouches at the front.
            rings = [(1.47, 0, 0.0, 0.2, 0.162, 0), (1.36, 0, 0.0, 0.21, 0.17, 0), (1.22, 0, 0.0, 0.2, 0.162, 0), (1.12, 0, 0.0, 0.195, 0.155, 0)]
            V, F = ring_shape(rings, 28)
            out.append(new_mesh("vest", V, F, lambda co: [("spine_02", 1.0)], "olive"))
            for i, x in enumerate((-0.09, 0.0, 0.09)):
                V = []
                for dx in (-0.035, 0.035):
                    for dy in (-0.182, -0.142):
                        for z in (1.15, 1.25):
                            V.append((x + dx, dy, z))
                F = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
                out.append(new_mesh(f"pouch{i}", V, F, lambda co: [("spine_02", 1.0)], "oliveDark"))
        elif e == "armband":
            ua = arm.matrix_world @ arm.pose.bones["upperarm_r"].head
            la = arm.matrix_world @ arm.pose.bones["lowerarm_r"].head
            c = ua.lerp(la, 0.35)
            V, F = ring_shape([(c.z - 0.03, c.x, c.y, 0.058, 0.058, 0), (c.z + 0.03, c.x, c.y, 0.06, 0.06, 0)], 18)
            out.append(new_mesh("armband", V, F, lambda co: [("upperarm_r", 1.0)], "team"))
    for o in out:
        o.parent = arm
    return out


# ─────────────── thin, light, write ───────────────


def decimate(meshes, budget):
    total = sum(len(o.data.polygons) for o in meshes) * 1.6  # (quads)
    tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    ratio = min(1.0, budget / max(tri, 1))
    for o in meshes:
        if ratio >= 0.999 or len(o.data.polygons) < 60:
            continue
        bpy.context.view_layer.objects.active = o
        m = o.modifiers.new("thin", "DECIMATE")
        m.ratio = ratio
        m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    return ratio


def bake_ao(meshes, floor=0.6, reach=0.22):
    scene = bpy.context.scene
    world = bpy.data.worlds.get("sky") or bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    world.light_settings.distance = reach
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    for o in meshes:
        for mat in o.data.materials:
            if mat and not mat.use_nodes:
                mat.use_nodes = True
        attrs = o.data.color_attributes
        if "ao" not in attrs:
            attrs.new("ao", "FLOAT_COLOR", "POINT")
        attrs.active_color = attrs["ao"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    out = {}
    for o in meshes:
        a = o.data.color_attributes["ao"]
        v = np.empty(len(a.data) * 4, dtype=np.float32)
        a.data.foreach_get("color", v)
        out[o.name] = floor + (1 - floor) * np.clip(v[0::4], 0, 1)
    return out


PICTURES = {}


def pixels(name):
    if name not in PICTURES:
        im = bpy.data.images.load(os.path.join(WORK, name + ".png"))
        w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        PICTURES[name] = a.reshape(h, w, 4)[..., :3]  # (row 0 at the bottom: v up)
    return PICTURES[name]


def sample(name, uv):
    """A picture's colour (sRGB, 0..1) at uvs (Blender's: v up), averaged over a small patch."""
    a = pixels(name)
    h, w, _ = a.shape
    out = np.zeros((len(uv), 3))
    for du in (-2, 0, 2):
        for dv in (-2, 0, 2):
            x = np.clip(np.round((uv[:, 0] % 1) * (w - 1)).astype(int) + du, 0, w - 1)
            y = np.clip(np.round((uv[:, 1] % 1) * (h - 1)).astype(int) + dv, 0, h - 1)
            out += a[y, x]
    return out / 9


# The packs' pictures to the game's (with the side's variant where the clothes take a side's colour).
def tex_key(img, dress):
    if img is None:
        return None
    n = img.split(".")[0]
    if n.startswith("T_Superhero_Male"):
        return dress.get("skin", "skin")
    if n.startswith("T_Regular_Male"):
        return "hands"
    if n.startswith("T_Hair_1"):
        return "hair1"
    if n.startswith("T_Hair_2"):
        return "hair2"
    if n.startswith("T_Eye"):
        return "eye"
    if n.startswith("T_Peasant"):
        return dress.get("tex", "peasant")
    if n.startswith("T_Ranger"):
        return dress.get("tex", "ranger")
    return None


def to_game(P):
    """Blender (the pack faces -y, z up) to the game's frame (faces +x, y up, +z the near side), scaled."""
    P = np.asarray(P, dtype=np.float64)
    return np.stack([-P[:, 1], P[:, 2], -P[:, 0]], axis=1) * SCALE


def collect(meshes, arm, dress, ao):
    """Per picture or paint: positions, normals, uvs, joints, light and colours, and triangles."""
    out = {}
    team = dress.get("team", True)
    for o in meshes:
        me = o.data
        me.calc_loop_triangles()
        groups = {g.index: g.name for g in o.vertex_groups}
        nv = len(me.vertices)
        W = np.zeros((nv, len(BONES)))
        for v in me.vertices:
            for g in v.groups:
                name = groups.get(g.group)
                if name is None:
                    continue
                W[v.index, BONES.index(bone_joint(name))] += g.weight
        none = W.sum(1) < 1e-6
        W[none, BONES.index("chest")] = 1
        order = np.argsort(-W, axis=1)
        j0, j1 = order[:, 0], order[:, 1]
        w0 = W[np.arange(nv), j0]
        w1 = W[np.arange(nv), j1]
        wf = w0 / np.maximum(w0 + w1, 1e-9)
        j1 = np.where(w1 > 1e-4, j1, j0)
        mw = o.matrix_world
        co = np.array([tuple(mw @ v.co) for v in me.vertices])
        no = np.array([tuple((mw.to_3x3() @ v.normal).normalized()) for v in me.vertices])
        light = ao.get(o.name, np.ones(nv))
        uvl = me.uv_layers.active
        nl = len(me.loops)
        luv = np.zeros((nl, 2))
        if uvl:
            tmp = np.empty(nl * 2)
            uvl.data.foreach_get("uv", tmp)
            luv = tmp.reshape(-1, 2)
        lvert = np.empty(nl, dtype=np.int64)
        me.loops.foreach_get("vertex_index", lvert)
        tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("loops", tris)
        tris = tris.reshape(-1, 3)
        mats = np.empty(len(me.loop_triangles), dtype=np.int64)
        me.loop_triangles.foreach_get("material_index", mats)
        for mi, mat in enumerate(me.materials):
            sel = tris[mats == mi]
            if not len(sel):
                continue
            if mat.name.startswith("paint:"):
                key, tex = mat.name[6:], None
            else:
                tex = tex_key(picture(mat), dress)
                if tex is None:
                    continue
                key = "tex:" + tex
            # One vertex per (vertex, uv) pair.
            loops = np.unique(sel)
            keyv = np.stack([lvert[loops], np.round(luv[loops, 0] * 8192), np.round(luv[loops, 1] * 8192)], 1)
            _, first, inv = np.unique(keyv, axis=0, return_index=True, return_inverse=True)
            inv = inv.reshape(-1)
            reps = loops[first]
            remap = np.full(nl, -1)
            remap[loops] = inv
            vi = lvert[reps]
            d = out.setdefault(key, {"P": [], "N": [], "U": [], "J": [], "W": [], "A": [], "C0": [], "C1": [], "T": [], "n": 0})
            d["T"].append(remap[sel] + d["n"])
            d["P"].append(co[vi])
            d["N"].append(no[vi])
            uv = luv[reps]
            if tex is None:
                # (A game paint's picture laid on by its main facing, as the sculpted units' are: 0.8 m across.)
                P, N = to_game(co[vi]), to_game(no[vi])
                a = np.abs(N)
                u = np.where(a[:, 0] >= np.maximum(a[:, 1], a[:, 2]), P[:, 2], P[:, 0])
                v = np.where(a[:, 1] > np.maximum(a[:, 0], a[:, 2]), P[:, 2], P[:, 1])
                d["U"].append(np.stack([u / 0.8 / SCALE * 0.707, v / 0.8 / SCALE * 0.707], 1))
            else:
                d["U"].append(np.stack([uv[:, 0], 1 - uv[:, 1]], 1))
            d["J"].append(np.stack([j0[vi], j1[vi]], 1))
            d["W"].append(wf[vi])
            d["A"].append(light[vi])
            if tex:
                if tex in ("peasant", "ranger"):
                    c0 = sample(tex + "0", uv)
                    c1 = sample(tex + "1", uv)
                else:
                    c0 = c1 = sample(tex, uv)
                tint = tint_of(tex, dress)
                d["C0"].append(c0 * tint)
                d["C1"].append(c1 * tint)
            else:
                d["C0"].append(np.ones((len(vi), 3)))
                d["C1"].append(np.ones((len(vi), 3)))
            d["n"] += len(vi)
    for key, d in out.items():
        for k in ("P", "N", "U", "J", "W", "A", "C0", "C1", "T"):
            d[k] = np.concatenate(d[k])
        d["P"] = to_game(d["P"])
        d["N"] = to_game(d["N"]) / SCALE
    # The side's variant for team pictures: "tex:peasant" (both sides) rather than "tex:peasant0".
    for key, d in out.items():
        if key in ("tex:peasant", "tex:ranger"):
            d["team"] = True
    return out


def tint_of(tex, dress):
    if tex.startswith("hair"):
        return np.array(dress.get("hairTint", (0.25, 0.17, 0.1))) / 0.56
    return np.ones(3)


def write_glb(path, prims, extras):
    """POSITION SHORT (its box in the node's extras), NORMAL BYTE, TEXCOORD_0 SHORT ×1/4096, _SKIN UBYTE (joint,
    joint, first weight, light), COLOR_0 / COLOR_1 UBYTE (the picture's colour for side 0 / side 1)."""
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
        P = d["P"]
        N = d["N"] / np.maximum(np.linalg.norm(d["N"], axis=1, keepdims=True), 1e-9)
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
        c1 = np.zeros((n, 4), dtype=np.uint8)
        c1[:, :3] = np.round(np.clip(d["C1"], 0, 1) * 255)
        tri = d["T"].reshape(-1)
        big = n > 65535
        attrs = {
            "POSITION": add(qp.tobytes(), 5122, "VEC3", n, stride=8),
            "NORMAL": add(qn.tobytes(), 5120, "VEC3", n, normalized=True, stride=4),
            "TEXCOORD_0": add(quv.tobytes(), 5122, "VEC2", n),
            "_SKIN": add(skin.tobytes(), 5121, "VEC4", n),
            "COLOR_0": add(c0.tobytes(), 5121, "VEC4", n, normalized=True),
        }
        if d.get("team"):
            attrs["COLOR_1"] = add(c1.tobytes(), 5121, "VEC4", n, normalized=True)
        ia = add(tri.astype(np.uint32 if big else np.uint16).tobytes(), 5125 if big else 5123, "SCALAR", len(tri), target=34963)
        meshes.append({"name": name, "primitives": [{"attributes": attrs, "indices": ia}]})
        ex = {"lo": lo.tolist(), "hi": hi.tolist()}
        if name.startswith("tex:hair"):
            ex["tint"] = [round(float(x) / 0.56, 3) for x in extras["hairTint"]]
        if d.get("team"):
            ex["team"] = True
        nodes.append({"name": name, "mesh": len(meshes) - 1, "extras": ex})
    while len(blob) % 4:
        blob += b"\0"
    doc = {
        "asset": {"version": "2.0", "generator": "tools/blender/erawar/assets/people.py", "extras": extras},
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


SHIELD_OUT = 0.075  # the shield's back off the forearm's line (pack metres)
SHIELD_ON = 0.0  # its middle further on along the forearm than the forearm's own middle


def joints_of(arm, pose=None):
    """The game's joints where the posed armature has them (game frame, the body's own space)."""
    def at(bone, frac=0.0):
        pb = arm.pose.bones[bone]
        p = arm.matrix_world @ (pb.head.lerp(pb.tail, frac))
        return to_game(np.array([tuple(p)]))[0].round(4).tolist()

    def grip(l):
        """Where a held shaft passes through the fist: the middle of the loops the four fingers make."""
        pts = []
        for f in FINGERS:
            for j in ("01", "02", "03", "04_leaf"):
                pts.append(tuple(arm.matrix_world @ arm.pose.bones[f"{f}_{j}_{l}"].head))
        return to_game(np.array([np.mean(pts, axis=0)]))[0].round(4).tolist()

    out = {
        "leg0": at("thigh_l"), "knee0": at("calf_l"), "leg1": at("thigh_r"), "knee1": at("calf_r"),
        "chest": at("spine_01"), "head": at("neck_01"),
        "arm0": at("upperarm_l"), "elbow0": at("lowerarm_l"), "hand0": grip("l"),
        "arm1": at("upperarm_r"), "elbow1": at("lowerarm_r"), "hand1": grip("r"),
        "top": to_game(np.array([[0, 0, 1.81]]))[0].round(4).tolist(),
    }
    if pose == "shield":
        # The shield strapped on the left forearm: its middle just out from the forearm's, its face turned away from
        # the arm (its back on the forearm), its length upright. Its frame's axes (x across, y up, z its face) go with it.
        e = np.array(tuple(arm.matrix_world @ arm.pose.bones["lowerarm_l"].head))
        h = np.array(tuple(arm.matrix_world @ arm.pose.bones["lowerarm_l"].tail))
        d = (h - e) / np.linalg.norm(h - e)
        up = np.array([0.0, 0.0, 1.0])
        face = np.cross(d, up)
        face /= np.linalg.norm(face)
        if face[1] > 0:  # (its face forward, away from the body; the forearm across its back)
            face = -face
        yv = up - face * np.dot(up, face)
        yv /= np.linalg.norm(yv)
        xv = np.cross(yv, face)
        centre = e + (h - e) * 0.62 + d * SHIELD_ON + face * SHIELD_OUT
        g = lambda v: to_game(np.array([v]))[0] / SCALE
        out["shield"] = to_game(np.array([centre]))[0].round(4).tolist()
        out["shieldBasis"] = np.concatenate([g(xv), g(yv), g(face)]).round(4).tolist()
    return out


def one(era, kind):
    reset()
    dress = DRESS[(era, kind)]
    arm, meshes = gather_model(dress)
    curl_hands(arm, dress["hands"])
    pose_arms(arm, dress.get("pose"))
    apply_pose(meshes)
    if not dress.get("body"):
        for o in meshes:
            if o.name.startswith("SuperHero"):
                keep_head(o)
    meshes = [o for o in meshes if len(o.data.polygons)]
    meshes += extras_for(arm, dress, era, kind)
    joints = joints_of(arm, dress.get("pose"))
    sizes = {}
    for lod, budget in (("", RICH), ("l", LO)):
        objs = []
        for o in meshes:
            c = o.copy()
            c.data = o.data.copy()
            bpy.context.scene.collection.objects.link(c)
            objs.append(c)
        if lod == "l":
            # (Where the processor draws the eyes and brows are lost at a lane's size.)
            for c in [c for c in objs if c.name.startswith(("Eyes", "Eyebrows"))]:
                objs.remove(c)
                bpy.data.objects.remove(c)
        ratio = decimate(objs, budget)
        ao = bake_ao(objs)
        prims = collect(objs, arm, dress, ao)
        tris = sum(len(d["T"]) for d in prims.values())
        sizes[lod or "rich"] = (tris, write_glb(os.path.join(OUT, f"a{era}{kind}{lod}.glb"), prims, {"bones": BONES, "joints": joints, "era": era, "kind": kind, "hairTint": list(dress.get("hairTint", (0.25, 0.17, 0.1)))}))
        for c in objs:
            bpy.data.objects.remove(c)
    print("DONE", era, kind, sizes, flush=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for era, kind in ONLY or sorted(DRESS):
        one(era, kind)
