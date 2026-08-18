"""Build Nyra as one fused metaball body painted from the four scout orthos."""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Vector

H = 1.65
W = 1.68 * 682.0 / 1024.0
REF = r"C:/Users/PC/Documents/GITHUBprojects/RPG GROK/art/refs"


def wipe_nyra_meshes():
    import re

    for o in list(bpy.data.objects):
        if o.type not in {"MESH", "META", "CURVE"}:
            continue
        if o.name.startswith("NYRA_"):
            continue
        if o.name.startswith("Nyra") or re.match(r"^N[A-Z]", o.name):
            bpy.data.objects.remove(o, do_unlink=True)


def add_ball(mb, co, radius, stiffness=2.2):
    el = mb.elements.new(type="BALL")
    el.co = co
    el.radius = radius
    el.stiffness = stiffness
    return el


def make_body():
    bpy.ops.object.metaball_add(type="BALL", location=(0.0, 0.0, 0.0))
    obj = bpy.context.active_object
    obj.name = "NyraMeta"
    mb = obj.data
    mb.resolution = 0.025
    mb.render_resolution = 0.02
    mb.elements.remove(mb.elements[0])

    # Head / hair volume
    add_ball(mb, (0.0, -0.04, 1.48), 0.16, 2.4)
    add_ball(mb, (0.0, -0.02, 1.58), 0.14, 2.0)
    add_ball(mb, (0.10, 0.00, 1.54), 0.11, 1.8)
    add_ball(mb, (-0.10, 0.00, 1.54), 0.11, 1.8)
    add_ball(mb, (0.0, 0.08, 1.52), 0.12, 1.8)
    add_ball(mb, (0.0, -0.10, 1.46), 0.10, 1.8)
    # Hood / cowl
    add_ball(mb, (0.0, 0.06, 1.40), 0.15, 1.7)
    # Torso + tunic
    add_ball(mb, (0.0, -0.02, 1.20), 0.20, 2.2)
    add_ball(mb, (0.0, 0.00, 1.02), 0.18, 2.0)
    add_ball(mb, (0.0, 0.02, 0.90), 0.16, 2.0)
    # Cape down the back
    add_ball(mb, (0.0, 0.14, 1.18), 0.16, 1.6)
    add_ball(mb, (0.0, 0.16, 0.92), 0.15, 1.5)
    add_ball(mb, (0.0, 0.14, 0.62), 0.13, 1.4)
    add_ball(mb, (0.0, 0.10, 0.42), 0.11, 1.3)
    # Shoulders / arms (left +, right -)
    add_ball(mb, (0.22, -0.02, 1.30), 0.10, 2.0)
    add_ball(mb, (-0.22, -0.02, 1.30), 0.10, 2.0)
    add_ball(mb, (0.30, -0.06, 1.12), 0.08, 2.0)
    add_ball(mb, (-0.30, -0.06, 1.12), 0.08, 2.0)
    add_ball(mb, (0.34, -0.10, 0.94), 0.07, 2.0)
    add_ball(mb, (-0.34, -0.10, 0.94), 0.07, 2.0)
    add_ball(mb, (0.36, -0.12, 0.80), 0.055, 2.0)
    add_ball(mb, (-0.36, -0.12, 0.80), 0.055, 2.0)
    # Legs / boots
    add_ball(mb, (0.10, 0.00, 0.68), 0.09, 2.0)
    add_ball(mb, (-0.10, 0.00, 0.68), 0.09, 2.0)
    add_ball(mb, (0.11, 0.00, 0.44), 0.075, 2.0)
    add_ball(mb, (-0.11, 0.00, 0.44), 0.075, 2.0)
    add_ball(mb, (0.11, 0.04, 0.16), 0.09, 2.1)
    add_ball(mb, (-0.11, 0.04, 0.16), 0.09, 2.1)
    # Pouches
    add_ball(mb, (0.16, -0.08, 0.84), 0.07, 1.8)
    add_ball(mb, (-0.16, -0.08, 0.84), 0.06, 1.8)
    # Quiver
    add_ball(mb, (0.10, 0.20, 1.16), 0.07, 1.6)

    bpy.ops.object.convert(target="MESH")
    body = bpy.context.active_object
    body.name = "NyraHull"
    bpy.ops.object.shade_smooth()
    zs = [v.co.z for v in body.data.vertices]
    dz = min(zs)
    for v in body.data.vertices:
        v.co.z -= dz
    body.data.update()
    ht = max(v.co.z for v in body.data.vertices)
    s = H / max(0.001, ht)
    body.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    print("body verts", len(body.data.vertices), "dim", tuple(round(x, 3) for x in body.dimensions))
    return body


def rgba(name: str) -> np.ndarray:
    img = bpy.data.images.get(name) or bpy.data.images.load(f"{REF}/{name}")
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


def sample_rgb(px: np.ndarray, u: np.ndarray, v: np.ndarray):
    h, w = px.shape[:2]
    valid = (u >= 0.0) & (u <= 1.0) & (v >= 0.0) & (v <= 1.0)
    ix = np.clip((u * (w - 1)).astype(np.int32), 0, w - 1)
    iy = np.clip((v * (h - 1)).astype(np.int32), 0, h - 1)
    out = np.ones(u.shape + (3,), dtype=np.float32)
    out[valid] = px[iy[valid], ix[valid], :3]
    ink = valid & (out.max(axis=-1) < 0.93)
    return out, ink


def paint(obj: bpy.types.Object) -> None:
    front, back, left, right = map(rgba, ("nyra_front.png", "nyra_back.png", "nyra_left.png", "nyra_right.png"))
    mesh = obj.data
    mesh.calc_loop_triangles()
    n = len(mesh.vertices)
    pos = np.array([v.co[:] for v in mesh.vertices], dtype=np.float32)
    nrm = np.zeros((n, 3), dtype=np.float32)
    for tri in mesh.loop_triangles:
        nn = np.array(tri.normal[:], dtype=np.float32)
        for vi in tri.vertices:
            nrm[vi] += nn
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1.0
    nrm /= lens
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    zmax = float(z.max()) or 1.0
    v = np.clip(z / zmax, 0.0, 1.0)
    cf, inf = sample_rgb(front, (x + W * 0.5) / W, v)
    cb, inb = sample_rgb(back, (W * 0.5 - x) / W, v)
    cl, inl = sample_rgb(left, (y + W * 0.5) / W, v)
    cr, inr = sample_rgb(right, (W * 0.5 - y) / W, v)
    wf = np.clip(-nrm[:, 1], 0, None) * inf
    wb = np.clip(nrm[:, 1], 0, None) * inb
    wl = np.clip(nrm[:, 0], 0, None) * inl
    wr = np.clip(-nrm[:, 0], 0, None) * inr
    wt = wf + wb + wl + wr
    thin = wt < 1e-5
    wf[thin] = inf[thin].astype(np.float32)
    wb[thin] = inb[thin].astype(np.float32)
    wl[thin] = inl[thin].astype(np.float32)
    wr[thin] = inr[thin].astype(np.float32)
    wt = wf + wb + wl + wr
    wt[wt < 1e-5] = 1.0
    col = np.clip((cf * wf[:, None] + cb * wb[:, None] + cl * wl[:, None] + cr * wr[:, None]) / wt[:, None], 0, 1)
    if "Col" in mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes["Col"])
    attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for i, rgb in enumerate(col):
        attr.data[i].color = (float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0)
    mat = bpy.data.materials.get("NyraOrthoMat") or bpy.data.materials.new("NyraOrthoMat")
    mat.use_nodes = True
    nt = mat.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    bsdf.inputs["Roughness"].default_value = 0.5
    try:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16
    except KeyError:
        pass
    nt.links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mesh.materials.clear()
    mesh.materials.append(mat)


def mat(name, color, metallic=0.0, roughness=0.45):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def sphere(name, loc, r, scale=(1, 1, 1), segs=20, material=None):
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(8, segs // 2), radius=r)
    sx, sy, sz = scale
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co += Vector(loc)
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def add_face_and_gear():
    white = mat("NWhite", (0.96, 0.96, 0.98), 0.0, 0.28)
    iris = mat("NIris", (0.28, 0.15, 0.07), 0.0, 0.32)
    pupil = mat("NPupil", (0.03, 0.02, 0.02), 0.0, 0.2)
    gold = mat("NGold", (0.78, 0.56, 0.14), 0.85, 0.3)
    wood = mat("NWood", (0.42, 0.25, 0.11), 0.0, 0.5)
    steel = mat("NSteel", (0.75, 0.76, 0.8), 0.7, 0.32)
    leather = mat("NLeatherAcc", (0.28, 0.15, 0.08), 0.0, 0.6)

    eye_l = sphere("NyraEyeL", (0.055, -0.175, 1.505), 0.028, (1.05, 0.65, 1.0), 16, white)
    eye_r = sphere("NyraEyeR", (-0.055, -0.175, 1.505), 0.028, (1.05, 0.65, 1.0), 16, white)
    iris_l = sphere("NyraIrisL", (0.055, -0.190, 1.505), 0.016, material=iris)
    iris_r = sphere("NyraIrisR", (-0.055, -0.190, 1.505), 0.016, material=iris)
    pup_l = sphere("NyraPupilL", (0.055, -0.200, 1.505), 0.008, material=pupil)
    pup_r = sphere("NyraPupilR", (-0.055, -0.200, 1.505), 0.008, material=pupil)
    brooch = sphere("NyraBrooch", (0.0, -0.20, 1.34), 0.03, material=gold)

    # Recurve bow as a tube of spheres along a curve, then we leave them parented as one join
    import bmesh

    bm = bmesh.new()
    for i in range(22):
        t = i / 21.0
        z = 0.55 + t * 1.05
        y = -0.32 - 0.11 * math.sin(t * math.pi)
        x = -0.36
        me = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.014)
        for v in me["verts"]:
            v.co += Vector((x, y, z))
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new("NyraBow")
    bm.to_mesh(mesh)
    bm.free()
    bow = bpy.data.objects.new("NyraBow", mesh)
    bpy.context.scene.collection.objects.link(bow)
    bow.data.materials.append(wood)
    tip1 = sphere("NyraBowTip1", (-0.36, -0.32, 0.55), 0.018, material=gold)
    tip2 = sphere("NyraBowTip2", (-0.36, -0.32, 1.58), 0.018, material=gold)

    # Dagger
    import bmesh as bm2mod

    bm = bm2mod.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.004, radius2=0.015, depth=0.22)
    for v in bm.verts:
        v.co.z -= 0.11
        v.co += Vector((0.38, -0.18, 0.62))
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new("NyraDagger")
    bm.to_mesh(mesh)
    bm.free()
    dagger = bpy.data.objects.new("NyraDagger", mesh)
    bpy.context.scene.collection.objects.link(dagger)
    dagger.data.materials.append(steel)
    return [
        eye_l, eye_r, iris_l, iris_r, pup_l, pup_r, brooch, bow, tip1, tip2, dagger,
    ]


def parent_keep(obj, joint):
    j = bpy.data.objects[joint]
    obj.parent = j
    obj.matrix_parent_inverse = j.matrix_world.inverted()


def run():
    bpy.context.view_layer.update()
    wipe_nyra_meshes()
    body = make_body()
    paint(body)
    extras = add_face_and_gear()
    parent_keep(body, "NHip")
    for o in extras:
        if o.name.startswith("NyraEye") or o.name.startswith("NyraIris") or o.name.startswith("NyraPupil") or o.name == "NyraBrooch":
            parent_keep(o, "NHead")
        elif o.name.startswith("NyraBow"):
            parent_keep(o, "NWeapon")
        elif o.name == "NyraDagger":
            parent_keep(o, "NForeL")
        else:
            parent_keep(o, "NHip")
    print("nyra metaball ready")


run()
