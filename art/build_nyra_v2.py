"""Clean stylized Nyra matching the scout ortho sheet.

Built in world space facing -Y, then parented onto the existing N* joints.
"""
from __future__ import annotations

import math

import bpy
import bmesh
from mathutils import Vector

COLL = bpy.context.scene.collection


def mat(name, color, metallic=0.0, roughness=0.52):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (*color, 1.0)
    return m


SKIN = mat("NSkin", (0.86, 0.68, 0.54), 0.0, 0.48)
ROSY = mat("NRosy", (0.82, 0.48, 0.42), 0.0, 0.5)
HAIR = mat("NHair", (0.20, 0.11, 0.06), 0.0, 0.62)
CAPE = mat("NCape", (0.14, 0.26, 0.16), 0.0, 0.7)
TUNIC = mat("NTunic", (0.78, 0.68, 0.46), 0.0, 0.58)
LEATHER = mat("NLeather", (0.30, 0.17, 0.09), 0.0, 0.64)
PANTS = mat("NPants", (0.16, 0.24, 0.14), 0.0, 0.66)
GOLD = mat("NGold", (0.78, 0.56, 0.14), 0.82, 0.32)
WOOD = mat("NWood", (0.42, 0.26, 0.12), 0.0, 0.55)
STEEL = mat("NSteel", (0.72, 0.74, 0.78), 0.7, 0.35)
WHITE = mat("NWhite", (0.95, 0.95, 0.97), 0.0, 0.32)
IRIS = mat("NIris", (0.28, 0.16, 0.08), 0.0, 0.34)
PUPIL = mat("NPupil", (0.04, 0.03, 0.02), 0.0, 0.22)
LIP = mat("NLip", (0.70, 0.38, 0.34), 0.0, 0.42)


def finish(bm, name, loc, rot, material):
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    COLL.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    if material:
        obj.data.materials.append(material)
    return obj


def sphere(name, loc, r, scale=(1, 1, 1), segs=28, rings=16, material=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    sx, sy, sz = scale
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    return finish(bm, name, loc, rot, material)


def cube(name, loc, size, material=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    return finish(bm, name, loc, rot, material)


def cyl(name, loc, r1, r2, depth, segs=24, material=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    return finish(bm, name, loc, rot, material)


def subdiv(obj, levels=2):
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    return obj


def bevel(obj, width=0.01, segments=3):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    return obj


def parent_keep(obj, joint_name):
    joint = bpy.data.objects[joint_name]
    obj.parent = joint
    obj.matrix_parent_inverse = joint.matrix_world.inverted()


def delete_old_meshes():
    import re

    for o in list(bpy.data.objects):
        if o.type != "MESH":
            continue
        if o.name.startswith("NYRA_"):
            continue
        if re.match(r"^N[A-Z]", o.name) or o.name.startswith("Nyra"):
            bpy.data.objects.remove(o, do_unlink=True)


def make_cape():
    nx, ny = 14, 18
    bm = bmesh.new()
    grid = {}
    top_z, bot_z = 1.40, 0.38
    for j in range(ny + 1):
        t = j / ny
        z = bot_z + t * (top_z - bot_z)
        width = 0.28 + (1.0 - t) * 0.18
        for i in range(nx + 1):
            s = i / nx * 2.0 - 1.0
            # Wrap around the shoulders at the top, hang in +Y (back).
            wrap = 0.55 + 0.35 * t
            ang = s * wrap
            rad = 0.16 + (1.0 - t) * 0.22
            y = 0.04 + rad * math.cos(ang * 0.9)
            x = rad * math.sin(ang)
            y += (1.0 - t) * 0.12
            if t > 0.82:
                y -= 0.10 * (t - 0.82) / 0.18
            grid[(i, j)] = bm.verts.new((x, y, z))
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))
    obj = finish(bm, "NyraCape", (0, 0, 0), (0, 0, 0), CAPE)
    solid = obj.modifiers.new("Solidify", "SOLIDIFY")
    solid.thickness = 0.034
    solid.offset = 1.0
    subdiv(obj, 2)
    return obj


def make_hair():
    clumps = [
        (0.00, -0.04, 1.62, 0.15, (1.15, 1.05, 0.85)),
        (0.10, -0.02, 1.58, 0.12, (1.1, 1.0, 0.9)),
        (-0.10, -0.02, 1.58, 0.12, (1.1, 1.0, 0.9)),
        (0.14, 0.04, 1.52, 0.10, (1.0, 1.05, 0.95)),
        (-0.14, 0.04, 1.52, 0.10, (1.0, 1.05, 0.95)),
        (0.00, 0.08, 1.56, 0.13, (1.2, 0.9, 0.85)),
        (0.08, -0.10, 1.50, 0.09, (1.0, 1.1, 1.0)),
        (-0.08, -0.10, 1.50, 0.09, (1.0, 1.1, 1.0)),
        (0.00, -0.12, 1.44, 0.08, (1.2, 0.9, 1.0)),
        (0.16, -0.02, 1.44, 0.08, (1.0, 1.0, 1.1)),
        (-0.16, -0.02, 1.44, 0.08, (1.0, 1.0, 1.1)),
        (0.06, 0.10, 1.46, 0.09, (1.1, 0.85, 1.0)),
        (-0.06, 0.10, 1.46, 0.09, (1.1, 0.85, 1.0)),
    ]
    pieces = []
    for i, (x, y, z, r, sc) in enumerate(clumps):
        pieces.append(sphere(f"NyraHair_{i}", (x, y, z), r, sc, 18, 10, HAIR))
    bpy.ops.object.select_all(action="DESELECT")
    for p in pieces:
        p.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    hair = bpy.context.view_layer.objects.active
    hair.name = "NyraHair"
    subdiv(hair, 1)
    return hair


def make_bow():
    # Recurve standing in the right hand, facing -Y.
    bm = bmesh.new()
    pts = []
    for i in range(28):
        t = i / 27.0
        z = 0.52 + t * 1.10
        # Recurve in Y (forward).
        y = -0.34 - 0.10 * math.sin(t * math.pi)
        x = -0.34
        pts.append((x, y, z))
    for i, co in enumerate(pts):
        me = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.016)
        for v in me["verts"]:
            v.co += Vector(co)
            if i < 3 or i > 24:
                v.co *= Vector((1.0, 1.0, 1.0))
    obj = finish(bm, "NyraBow", (0, 0, 0), (0, 0, 0), WOOD)
    # Gold tips
    t1 = sphere("NyraBowTip1", (-0.34, -0.34, 0.54), 0.02, material=GOLD)
    t2 = sphere("NyraBowTip2", (-0.34, -0.34, 1.60), 0.02, material=GOLD)
    grip = cyl("NyraBowGrip", (-0.34, -0.38, 1.06), 0.018, 0.018, 0.12, 10, LEATHER, (math.radians(90), 0, 0))
    return [obj, t1, t2, grip]


def run():
    bpy.context.view_layer.update()
    delete_old_meshes()

    # Head
    skull = subdiv(sphere("NyraSkull", (0.0, -0.04, 1.48), 0.15, (1.02, 0.95, 1.08), 32, 18, SKIN), 1)
    cheek_l = sphere("NyraCheekL", (0.07, -0.12, 1.44), 0.055, (1.1, 0.8, 0.9), 16, 10, ROSY)
    cheek_r = sphere("NyraCheekR", (-0.07, -0.12, 1.44), 0.055, (1.1, 0.8, 0.9), 16, 10, ROSY)
    nose = sphere("NyraNose", (0.0, -0.18, 1.47), 0.028, (0.85, 1.1, 0.9), 12, 8, SKIN)
    ear_l = sphere("NyraEarL", (0.15, -0.02, 1.48), 0.035, (0.55, 0.7, 1.1), 10, 8, SKIN)
    ear_r = sphere("NyraEarR", (-0.15, -0.02, 1.48), 0.035, (0.55, 0.7, 1.1), 10, 8, SKIN)
    eye_wl = sphere("NyraEyeWL", (0.055, -0.155, 1.505), 0.032, (1.05, 0.7, 1.0), 16, 10, WHITE)
    eye_wr = sphere("NyraEyeWR", (-0.055, -0.155, 1.505), 0.032, (1.05, 0.7, 1.0), 16, 10, WHITE)
    iris_l = sphere("NyraIrisL", (0.055, -0.175, 1.505), 0.018, material=IRIS)
    iris_r = sphere("NyraIrisR", (-0.055, -0.175, 1.505), 0.018, material=IRIS)
    pup_l = sphere("NyraPupilL", (0.055, -0.188, 1.505), 0.009, material=PUPIL)
    pup_r = sphere("NyraPupilR", (-0.055, -0.188, 1.505), 0.009, material=PUPIL)
    mouth = cube("NyraMouth", (0.0, -0.16, 1.39), (0.07, 0.02, 0.018), LIP, (0.15, 0, 0))
    hair = make_hair()
    hood = subdiv(sphere("NyraHood", (0.0, 0.04, 1.50), 0.18, (1.15, 1.05, 0.72), 24, 14, CAPE, (0.35, 0, 0)), 1)

    # Torso
    chest = subdiv(sphere("NyraChest", (0.0, -0.02, 1.18), 0.20, (1.05, 0.72, 1.15), 28, 16, TUNIC), 1)
    belly = subdiv(sphere("NyraBelly", (0.0, 0.0, 0.98), 0.18, (1.1, 0.7, 0.85), 24, 14, TUNIC), 1)
    strap = cube("NyraStrap", (0.02, -0.12, 1.14), (0.07, 0.04, 0.42), LEATHER, (0.0, 0.55, 0.0))
    bevel(strap, 0.008)
    belt = cyl("NyraBelt", (0.0, 0.0, 0.92), 0.19, 0.19, 0.06, 28, LEATHER)
    buckle = cube("NyraBuckle", (0.0, -0.20, 0.92), (0.07, 0.03, 0.05), GOLD)
    pouch_l = cube("NyraPouchL", (0.16, -0.06, 0.84), (0.10, 0.08, 0.12), LEATHER)
    pouch_r = cube("NyraPouchR", (-0.16, -0.06, 0.84), (0.08, 0.07, 0.10), LEATHER)
    bevel(pouch_l, 0.012)
    bevel(pouch_r, 0.01)
    emblem = cube("NyraEmblem", (0.16, -0.11, 0.86), (0.045, 0.01, 0.045), GOLD)
    brooch = cyl("NyraBrooch", (0.0, -0.18, 1.34), 0.035, 0.035, 0.02, 16, GOLD, (math.radians(90), 0, 0))
    leaf = cube("NyraLeaf", (0.0, -0.20, 1.34), (0.03, 0.01, 0.03), GOLD)
    pauldron = cube("NyraPauldron", (0.22, -0.02, 1.32), (0.12, 0.10, 0.10), LEATHER, (0.2, 0, 0.3))
    bevel(pauldron, 0.016, 3)

    cape = make_cape()
    quiver = cyl("NyraQuiver", (0.12, 0.22, 1.18), 0.05, 0.055, 0.38, 16, LEATHER, (0.55, 0, 0.4))
    for i, z in enumerate((1.32, 1.36, 1.40, 1.28)):
        cyl(f"NyraArrow{i}", (0.10 + i * 0.01, 0.18, z), 0.008, 0.008, 0.22, 8, WOOD, (0.55, 0, 0.4))

    # Arms — character left = +X, right = -X
    ual = subdiv(cyl("NyraUpperArmL", (0.28, -0.04, 1.22), 0.055, 0.048, 0.26, 16, TUNIC, (0.35, 0, 0.4)), 1)
    uar = subdiv(cyl("NyraUpperArmR", (-0.28, -0.04, 1.22), 0.055, 0.048, 0.26, 16, TUNIC, (0.35, 0, -0.4)), 1)
    fal = subdiv(cyl("NyraForeL", (0.34, -0.08, 0.98), 0.048, 0.042, 0.24, 16, LEATHER, (0.2, 0, 0.15)), 1)
    far = subdiv(cyl("NyraForeR", (-0.34, -0.08, 0.98), 0.048, 0.042, 0.24, 16, LEATHER, (0.2, 0, -0.15)), 1)
    hand_l = sphere("NyraHandL", (0.36, -0.12, 0.84), 0.045, (1.1, 0.8, 1.0), 12, 8, SKIN)
    hand_r = sphere("NyraHandR", (-0.36, -0.12, 0.84), 0.045, (1.1, 0.8, 1.0), 12, 8, SKIN)

    dagger_g = cyl("NyraDaggerGrip", (0.38, -0.16, 0.78), 0.012, 0.012, 0.08, 8, LEATHER)
    dagger_x = cube("NyraDaggerGuard", (0.38, -0.16, 0.73), (0.05, 0.018, 0.014), GOLD)
    dagger_b = cyl("NyraDaggerBlade", (0.38, -0.16, 0.58), 0.004, 0.016, 0.22, 4, STEEL)

    bows = make_bow()

    # Legs
    hip = subdiv(sphere("NyraHip", (0.0, 0.0, 0.90), 0.16, (1.15, 0.75, 0.7), 20, 12, PANTS), 1)
    thigh_l = subdiv(cyl("NyraThighL", (0.10, -0.02, 0.68), 0.075, 0.058, 0.32, 16, PANTS, (0.08, 0, 0.04)), 1)
    thigh_r = subdiv(cyl("NyraThighR", (-0.10, -0.02, 0.68), 0.075, 0.058, 0.32, 16, PANTS, (0.08, 0, -0.04)), 1)
    shin_l = subdiv(cyl("NyraShinL", (0.11, -0.02, 0.40), 0.055, 0.048, 0.22, 14, PANTS), 1)
    shin_r = subdiv(cyl("NyraShinR", (-0.11, -0.02, 0.40), 0.055, 0.048, 0.22, 14, PANTS), 1)
    boot_l = subdiv(cube("NyraBootL", (0.11, 0.04, 0.14), (0.13, 0.22, 0.20), LEATHER), 1)
    boot_r = subdiv(cube("NyraBootR", (-0.11, 0.04, 0.14), (0.13, 0.22, 0.20), LEATHER), 1)
    buckle_l = cube("NyraBootBuckleL", (0.11, -0.08, 0.16), (0.08, 0.02, 0.03), GOLD)
    buckle_r = cube("NyraBootBuckleR", (-0.11, -0.08, 0.16), (0.08, 0.02, 0.03), GOLD)

    bind = {
        "NHead": [
            skull, cheek_l, cheek_r, nose, ear_l, ear_r, eye_wl, eye_wr,
            iris_l, iris_r, pup_l, pup_r, mouth, hair, hood,
        ],
        "NTorso": [chest, belly, strap, brooch, leaf, pauldron, cape, quiver],
        "NHip": [hip, belt, buckle, pouch_l, pouch_r, emblem],
        "NArmL": [ual],
        "NArmR": [uar],
        "NForeL": [fal, hand_l, dagger_g, dagger_x, dagger_b],
        "NForeR": [far, hand_r],
        "NWeapon": bows,
        "NLegL": [thigh_l],
        "NLegR": [thigh_r],
        "NShinL": [shin_l, boot_l, buckle_l],
        "NShinR": [shin_r, boot_r, buckle_r],
    }
    # Arrows live on torso
    for o in list(bpy.data.objects):
        if o.name.startswith("NyraArrow"):
            bind["NTorso"].append(o)

    bpy.context.view_layer.update()
    for joint, objs in bind.items():
        for o in objs:
            parent_keep(o, joint)
            print("parent", o.name, "->", joint)

    print("nyra v2 built")


run()
