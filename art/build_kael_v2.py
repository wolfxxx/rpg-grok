"""Rebuild Kael as a clean stylized warrior matching the four orthos.

Joints stay named for the game GLB pipeline. Character is built in local +Y
forward; Kael root stays rotated 180° around Z so the face exports toward -Y.
"""
from __future__ import annotations

import math

import bpy
import bmesh
from mathutils import Matrix, Vector

COLL = bpy.context.scene.collection


def _mat(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    m.diffuse_color = (*color, 1.0)
    return m


STEEL = _mat("KSteel", (0.70, 0.74, 0.78), 0.72, 0.38)
GOLD = _mat("KGold", (0.78, 0.55, 0.12), 0.85, 0.28)
BLUE = _mat("KBlue", (0.06, 0.10, 0.36), 0.0, 0.86)
LEATHER = _mat("KLeather", (0.28, 0.16, 0.09), 0.0, 0.68)
CHAIN = _mat("KChain", (0.18, 0.20, 0.22), 0.55, 0.48)
SKIN = _mat("KSkin", (0.86, 0.66, 0.52), 0.0, 0.52)
ROSY = _mat("KRosy", (0.86, 0.48, 0.42), 0.0, 0.55)
HAIR = _mat("KHair", (0.28, 0.14, 0.08), 0.0, 0.62)
IRIS = _mat("KIris", (0.18, 0.10, 0.06), 0.0, 0.38)
WHITE = _mat("KWhite", (0.94, 0.94, 0.96), 0.0, 0.35)
PUPIL = _mat("KPupil", (0.04, 0.03, 0.02), 0.0, 0.25)
LIP = _mat("KLip", (0.72, 0.38, 0.34), 0.0, 0.45)


def _link(obj, parent):
    if obj.name not in COLL.objects:
        COLL.objects.link(obj)
    obj.parent = parent
    return obj


def _finish(bm, name, parent, loc, rot, mat):
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    COLL.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    obj.rotation_euler = rot
    if mat:
        obj.data.materials.append(mat)
    return obj


def sphere(name, parent, loc, r, scale=(1, 1, 1), segs=28, rings=16, mat=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    sx, sy, sz = scale
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    return _finish(bm, name, parent, loc, rot, mat)


def cube(name, parent, loc, size, mat=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    return _finish(bm, name, parent, loc, rot, mat)


def cyl(name, parent, loc, r1, r2, depth, segs=24, mat=None, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segs,
        radius1=r1,
        radius2=r2,
        depth=depth,
    )
    return _finish(bm, name, parent, loc, rot, mat)


def torus(name, parent, loc, major, minor, maj=28, minor_seg=12, mat=None, rot=(0, 0, 0)):
    verts = []
    faces = []
    for i in range(maj):
        u = i / maj * math.tau
        cu, su = math.cos(u), math.sin(u)
        for j in range(minor_seg):
            v = j / minor_seg * math.tau
            cv, sv = math.cos(v), math.sin(v)
            r = major + minor * cv
            verts.append((r * cu, r * su, minor * sv))

    def idx(i, j):
        return (i % maj) * minor_seg + (j % minor_seg)

    for i in range(maj):
        for j in range(minor_seg):
            faces.append((idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)))

    bm = bmesh.new()
    vs = [bm.verts.new(co) for co in verts]
    bm.verts.ensure_lookup_table()
    for f in faces:
        try:
            bm.faces.new((vs[f[0]], vs[f[1]], vs[f[2]], vs[f[3]]))
        except ValueError:
            pass
    return _finish(bm, name, parent, loc, rot, mat)


def cone(name, parent, loc, r1, r2, depth, segs=16, mat=None, rot=(0, 0, 0)):
    return cyl(name, parent, loc, r1, r2, depth, segs, mat, rot)


def bevel(obj, width=0.012, segments=3):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    return obj


def subdiv(obj, levels=1):
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = max(levels, 2)
    return obj


def solidify(obj, thick=0.018):
    mod = obj.modifiers.new("Solidify", "SOLIDIFY")
    mod.thickness = thick
    mod.offset = 0.0
    return obj


def delete_meshes(obj):
    for child in list(obj.children):
        delete_meshes(child)
        if child.type == "MESH":
            bpy.data.objects.remove(child, do_unlink=True)


def make_cape(parent, cloth, trim):
    nx, ny = 12, 16
    bm = bmesh.new()
    grid = {}
    top_z, bot_z = 0.22, -0.92
    for j in range(ny + 1):
        t = j / ny
        for i in range(nx + 1):
            s = i / nx * 2.0 - 1.0
            width = 0.46 + (1.0 - t) * 0.16
            wave = 0.05 * math.sin(s * 3.1) * (0.25 + 0.75 * (1.0 - t))
            x = s * width
            z = bot_z + t * (top_z - bot_z)
            y = -0.28 - (1.0 - t) * 0.20 + wave - abs(s) * 0.03 * (1.0 - t)
            if t > 0.78:
                y += 0.10 * (t - 0.78) / 0.22
                width_pin = 0.46
                x = s * (width_pin + (width - width_pin) * (1.0 - (t - 0.78) / 0.22))
            grid[(i, j)] = bm.verts.new((x, y, z))
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]))
    cape = _finish(bm, "Cape", parent, (0.0, 0.02, 0.32), (0, 0, 0), cloth)
    solidify(cape, 0.028)
    subdiv(cape, 1)

    tbm = bmesh.new()
    n_tri = 15
    w = 0.62
    for k in range(n_tri):
        s0 = k / n_tri * 2.0 - 1.0
        s1 = (k + 1) / n_tri * 2.0 - 1.0
        sm = (s0 + s1) * 0.5
        y0 = -0.48 - abs(s0) * 0.03
        y1 = -0.48 - abs(s1) * 0.03
        ym = -0.50 - abs(sm) * 0.03
        v0 = tbm.verts.new((s0 * w, y0, bot_z))
        v1 = tbm.verts.new((s1 * w, y1, bot_z))
        v2 = tbm.verts.new((sm * w, ym, bot_z - 0.08))
        tbm.faces.new((v0, v1, v2))
    trim_obj = _finish(tbm, "CapeTrim", parent, (0.0, 0.02, 0.32), (0, 0, 0), trim)
    bevel(trim_obj, 0.004, 2)
    return cape


def make_emblem(parent, loc):
    """Gold winged-droplet smile for the shield."""
    drop = sphere("EmblemDrop", parent, loc, 0.07, (0.72, 0.42, 1.15), 20, 12, GOLD, (math.radians(12), 0, 0))
    tip = cone("EmblemTip", parent, (loc[0], loc[1], loc[2] + 0.09), 0.028, 0.002, 0.08, 12, GOLD)
    wing_l = cube("EmblemWingL", parent, (loc[0] - 0.08, loc[1], loc[2] + 0.01), (0.09, 0.03, 0.045), GOLD, (0, 0, math.radians(28)))
    wing_r = cube("EmblemWingR", parent, (loc[0] + 0.08, loc[1], loc[2] + 0.01), (0.09, 0.03, 0.045), GOLD, (0, 0, math.radians(-28)))
    smile = torus("EmblemSmile", parent, (loc[0], loc[1] + 0.02, loc[2] - 0.02), 0.028, 0.007, 16, 8, PUPIL, (math.radians(90), 0, 0))
    eye_l = sphere("EmblemEyeL", parent, (loc[0] - 0.018, loc[1] + 0.02, loc[2] + 0.012), 0.008, (1, 0.6, 1), 10, 8, PUPIL)
    eye_r = sphere("EmblemEyeR", parent, (loc[0] + 0.018, loc[1] + 0.02, loc[2] + 0.012), 0.008, (1, 0.6, 1), 10, 8, PUPIL)
    for o in (drop, tip, wing_l, wing_r, smile, eye_l, eye_r):
        bevel(o, 0.004, 2)
    return drop


def build():
    kael = bpy.data.objects["Kael"]
    hip = bpy.data.objects["Hip"]
    torso = bpy.data.objects["Torso"]
    head = bpy.data.objects["Head"]
    arm_l = bpy.data.objects["ArmL"]
    arm_r = bpy.data.objects["ArmR"]
    fore_l = bpy.data.objects["ForeL"]
    fore_r = bpy.data.objects["ForeR"]
    weapon = bpy.data.objects["Weapon"]
    leg_l = bpy.data.objects["LegL"]
    leg_r = bpy.data.objects["LegR"]
    shin_l = bpy.data.objects["ShinL"]
    shin_r = bpy.data.objects["ShinR"]

    delete_meshes(kael)
    leftovers = [
        o
        for o in list(bpy.data.objects)
        if o.type == "MESH"
        and o.name
        in {
            "Skull",
            "Cape",
            "CapeTrim",
            "Chest",
            "Shield",
            "Blade",
            "Cowl",
            "Belt",
            "PauldronL",
            "PauldronR",
        }
    ]
    for o in leftovers:
        bpy.data.objects.remove(o, do_unlink=True)

    hip.location = (0.0, 0.0, 0.62)
    torso.location = (0.0, 0.0, 0.26)
    head.location = (0.0, 0.04, 0.44)
    arm_l.location = (-0.40, 0.05, 0.20)
    arm_r.location = (0.40, 0.05, 0.20)
    arm_l.rotation_euler = (0.12, -0.38, 0.08)
    arm_r.rotation_euler = (0.12, 0.38, -0.08)
    fore_l.location = (0.0, 0.03, -0.24)
    fore_r.location = (0.0, 0.03, -0.24)
    fore_l.rotation_euler = (0.15, 0.0, 0.0)
    fore_r.rotation_euler = (0.10, 0.0, 0.0)
    weapon.location = (0.0, 0.04, -0.28)
    weapon.rotation_euler = (0.0, 0.0, 0.0)
    leg_l.location = (-0.15, 0.03, -0.06)
    leg_r.location = (0.15, 0.03, -0.06)
    shin_l.location = (0.0, 0.03, -0.30)
    shin_r.location = (0.0, 0.03, -0.30)

    # --- Head / face ---
    skull = sphere("Skull", head, (0.0, 0.02, 0.14), 0.185, (1.08, 0.96, 1.12), 32, 20, SKIN)
    subdiv(skull, 1)
    sphere("Chin", head, (0.0, 0.06, -0.02), 0.10, (1.15, 0.95, 0.70), 20, 12, SKIN)
    sphere("CheekL", head, (-0.11, 0.10, 0.06), 0.075, (1.05, 0.9, 0.9), 16, 12, ROSY)
    sphere("CheekR", head, (0.11, 0.10, 0.06), 0.075, (1.05, 0.9, 0.9), 16, 12, ROSY)
    sphere("Nose", head, (0.0, 0.175, 0.06), 0.042, (0.85, 1.35, 1.05), 16, 12, SKIN)
    sphere("EarL", head, (-0.195, -0.01, 0.06), 0.045, (0.55, 0.95, 1.15), 14, 10, SKIN)
    sphere("EarR", head, (0.195, -0.01, 0.06), 0.045, (0.55, 0.95, 1.15), 14, 10, SKIN)
    sphere("Neck", head, (0.0, 0.01, -0.10), 0.08, (1.15, 1.0, 0.85), 16, 10, SKIN)

    sphere("EyeWhiteL", head, (-0.075, 0.162, 0.10), 0.055, (1.15, 0.62, 1.05), 16, 12, WHITE)
    sphere("EyeWhiteR", head, (0.075, 0.162, 0.10), 0.055, (1.15, 0.62, 1.05), 16, 12, WHITE)
    sphere("IrisL", head, (-0.075, 0.178, 0.102), 0.026, (1.05, 0.5, 1.05), 14, 10, IRIS)
    sphere("IrisR", head, (0.075, 0.178, 0.102), 0.026, (1.05, 0.5, 1.05), 14, 10, IRIS)
    sphere("PupilL", head, (-0.075, 0.190, 0.102), 0.012, (1.0, 0.45, 1.0), 10, 8, PUPIL)
    sphere("PupilR", head, (0.075, 0.190, 0.102), 0.012, (1.0, 0.45, 1.0), 10, 8, PUPIL)
    sphere("GlintL", head, (-0.062, 0.196, 0.116), 0.009, (1, 1, 1), 8, 6, WHITE)
    sphere("GlintR", head, (0.088, 0.196, 0.116), 0.009, (1, 1, 1), 8, 6, WHITE)

    cube("BrowL", head, (-0.075, 0.155, 0.162), (0.09, 0.028, 0.02), HAIR, (0.0, 0.0, math.radians(10)))
    cube("BrowR", head, (0.075, 0.155, 0.162), (0.09, 0.028, 0.02), HAIR, (0.0, 0.0, math.radians(-10)))
    smile = torus("Smile", head, (0.0, 0.158, 0.015), 0.052, 0.008, 20, 8, LIP, (math.radians(72), 0, 0))
    smile.scale = (1.2, 0.45, 1.0)

    sphere("HairCap", head, (0.0, -0.04, 0.20), 0.188, (1.10, 1.08, 0.78), 24, 14, HAIR)
    clumps = [
        ("HairTuft", (0.0, 0.02, 0.30), 0.07, (1.15, 1.0, 0.8)),
        ("HairSideL", (-0.15, -0.04, 0.16), 0.07, (0.85, 1.05, 1.0)),
        ("HairSideR", (0.15, -0.04, 0.16), 0.07, (0.85, 1.05, 1.0)),
        ("HairBack", (0.0, -0.14, 0.16), 0.09, (1.1, 0.8, 0.95)),
    ]
    for n, loc, r, sc in clumps:
        sphere(n, head, loc, r, sc, 16, 10, HAIR)

    # --- Torso armor ---
    chest = sphere("Chest", torso, (0.0, 0.12, 0.06), 0.28, (1.32, 0.82, 1.05), 32, 20, STEEL)
    subdiv(chest, 1)
    bevel(torus("ChestGoldBot", torso, (0.0, 0.12, -0.16), 0.28, 0.014, 28, 10, GOLD, (math.radians(12), 0, 0)), 0.004)
    bevel(torus("ChestGoldCollar", torso, (0.0, 0.10, 0.24), 0.20, 0.012, 24, 8, GOLD, (math.radians(18), 0, 0)), 0.003)
    bevel(cube("Medallion", torso, (0.0, 0.32, 0.14), (0.08, 0.035, 0.11), GOLD), 0.01, 3)

    cowl = torus("Cowl", torso, (0.0, 0.06, 0.30), 0.145, 0.048, 24, 12, BLUE, (math.radians(22), 0, 0))
    subdiv(cowl, 1)
    sphere("CowlBunch", torso, (0.0, -0.06, 0.32), 0.11, (1.2, 0.75, 0.62), 20, 12, BLUE)

    make_cape(torso, BLUE, GOLD)

    # Pauldrons — large domes, thin gold rims, one rivet each
    for side, sx in (("L", -1.0), ("R", 1.0)):
        loc = (sx * 0.38, 0.02, 0.26)
        paul = sphere(f"Pauldron{side}", torso, loc, 0.145, (1.12, 1.0, 0.88), 24, 16, STEEL)
        subdiv(paul, 1)
        rim = torus(f"PaulRim{side}", torso, (sx * 0.38, 0.03, 0.18), 0.12, 0.012, 24, 10, GOLD, (math.radians(78), 0, sx * math.radians(12)))
        bevel(rim, 0.003)
        sphere(f"PaulRivet{side}", torso, (sx * 0.50, 0.04, 0.24), 0.02, (1, 1, 1), 12, 8, GOLD)
        cube(f"Strap{side}", torso, (sx * 0.12, 0.26, 0.12), (0.05, 0.03, 0.22), LEATHER, (math.radians(-32), 0, sx * math.radians(-18)))
        cube(f"StrapBuckle{side}", torso, (sx * 0.08, 0.28, 0.04), (0.035, 0.025, 0.04), GOLD)

    # Chain at shoulders / skirt
    cyl("ChainSkirt", hip, (0.0, 0.02, -0.16), 0.24, 0.28, 0.16, 24, CHAIN)
    belt = torus("Belt", hip, (0.0, 0.08, -0.02), 0.28, 0.045, 28, 10, LEATHER, (math.radians(8), 0, 0))
    bevel(cube("Buckle", hip, (0.0, 0.30, -0.02), (0.10, 0.04, 0.08), GOLD), 0.008)
    pouch = cube("Pouch", hip, (-0.28, 0.14, -0.10), (0.10, 0.08, 0.12), LEATHER)
    bevel(pouch, 0.01)
    cube("PouchFlap", hip, (-0.28, 0.16, -0.04), (0.10, 0.06, 0.04), LEATHER)
    sphere("PouchBtn", hip, (-0.28, 0.21, -0.04), 0.015, (1, 1, 1), 8, 6, GOLD)

    # Tassets
    for side, sx in (("L", -1.0), ("R", 1.0)):
        tasset = cube(f"Tasset{side}", hip, (sx * 0.16, 0.12, -0.22), (0.14, 0.08, 0.16), STEEL, (math.radians(8), 0, sx * math.radians(8)))
        bevel(tasset, 0.012)
        cube(f"TassetGold{side}", hip, (sx * 0.16, 0.155, -0.22), (0.13, 0.02, 0.15), GOLD)

    # --- Arms ---
    for arm, fore, side, sx in ((arm_l, fore_l, "L", -1.0), (arm_r, fore_r, "R", 1.0)):
        cyl(f"UpperArm{side}", arm, (0.0, 0.0, -0.10), 0.065, 0.072, 0.20, 16, CHAIN)
        sphere(f"Elbow{side}", arm, (0.0, 0.01, -0.20), 0.05, (1, 1, 1), 14, 10, CHAIN)
        bicep = cube(f"Bicep{side}", arm, (0.0, 0.03, -0.08), (0.12, 0.10, 0.14), STEEL)
        bevel(bicep, 0.016)
        vam = cyl(f"Vambrace{side}", fore, (0.0, 0.02, -0.08), 0.085, 0.078, 0.22, 18, STEEL)
        subdiv(vam, 1)
        torus(f"VamGold{side}", fore, (0.0, 0.02, -0.17), 0.082, 0.012, 18, 8, GOLD, (math.radians(90), 0, 0))
        hand = sphere(f"Hand{side}", fore, (0.0, 0.03, -0.22), 0.058, (1.1, 0.85, 1.15), 14, 10, LEATHER)
        subdiv(hand, 1)

    # Shield on left forearm — facing character +Y
    shield = cyl("Shield", fore_l, (0.0, 0.18, -0.08), 0.27, 0.27, 0.04, 48, BLUE, (math.radians(90), 0, 0))
    subdiv(shield, 1)
    rim = torus("ShieldRim", fore_l, (0.0, 0.18, -0.08), 0.268, 0.032, 48, 14, GOLD, (math.radians(90), 0, 0))
    for i in range(8):
        ang = i / 8 * math.tau
        sphere(
            f"ShieldRivet{i}",
            fore_l,
            (math.sin(ang) * 0.265, 0.205, -0.08 + math.cos(ang) * 0.265),
            0.012,
            (1, 1, 1),
            8,
            6,
            GOLD,
        )
    make_emblem(fore_l, (0.0, 0.22, -0.08))

    # Sword — blade along Blender -Z so glTF Y-up maps to Three.js -Y
    pommel = sphere("Pommel", weapon, (0.0, 0.0, 0.06), 0.035, (1, 1, 1), 14, 10, GOLD)
    grip = cyl("Grip", weapon, (0.0, 0.0, -0.02), 0.018, 0.022, 0.12, 12, GOLD)
    guard = cube("Guard", weapon, (0.0, 0.0, -0.09), (0.16, 0.04, 0.035), GOLD)
    bevel(guard, 0.008)
    cube("GuardDiamond", weapon, (0.0, 0.0, -0.09), (0.05, 0.05, 0.04), GOLD)
    blade = cube("Blade", weapon, (0.0, 0.0, -0.34), (0.055, 0.014, 0.46), STEEL)
    bevel(blade, 0.004, 2)
    cube("Fuller", weapon, (0.0, 0.0, -0.32), (0.012, 0.016, 0.38), STEEL)
    tip = cone("Tip", weapon, (0.0, 0.0, -0.60), 0.028, 0.002, 0.10, 8, STEEL)

    # --- Legs ---
    for leg, shin, side, sx in ((leg_l, shin_l, "L", -1.0), (leg_r, shin_r, "R", 1.0)):
        cyl(f"Thigh{side}", leg, (0.0, 0.02, -0.12), 0.085, 0.078, 0.26, 16, LEATHER)
        knee = sphere(f"Knee{side}", shin, (0.0, 0.06, 0.02), 0.065, (1.2, 1.05, 0.9), 16, 12, STEEL)
        subdiv(knee, 1)
        torus(f"KneeGold{side}", shin, (0.0, 0.06, 0.02), 0.06, 0.009, 16, 8, GOLD, (math.radians(90), 0, 0))
        shin_p = cube(f"ShinPlate{side}", shin, (0.0, 0.07, -0.12), (0.11, 0.08, 0.18), STEEL)
        bevel(shin_p, 0.014)
        boot = sphere(f"Boot{side}", shin, (0.0, 0.10, -0.28), 0.09, (1.0, 1.55, 0.82), 18, 12, LEATHER)
        subdiv(boot, 1)
        cube(f"Sole{side}", shin, (0.0, 0.11, -0.355), (0.11, 0.22, 0.035), LEATHER)
        for k, z in enumerate((-0.24, -0.30)):
            cube(f"BootStrap{side}{k}", shin, (0.0, 0.14, z), (0.12, 0.04, 0.03), LEATHER)
            cube(f"BootBuckle{side}{k}", shin, (0.0, 0.17, z), (0.035, 0.025, 0.025), GOLD)

    # Hide other heroes / refs for beauty shots
    for n in ("Golem", "Seris", "Nyra"):
        o = bpy.data.objects.get(n)
        if o:
            o.hide_set(True)
            o.hide_render = True
    for n in ("REF_Front", "REF_Back", "REF_Left", "REF_Right"):
        o = bpy.data.objects.get(n)
        if o:
            o.hide_set(True)
            o.hide_render = True
            o.hide_viewport = True

    print("kael_v2_built")


build()
