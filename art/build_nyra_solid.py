"""Solid fused Nyra: overlapping world-space primitives, join, remesh, paint from orthos."""
from __future__ import annotations

import math

import bpy
import bmesh
import numpy as np
from mathutils import Vector

H = 1.65
W = 1.68 * 682.0 / 1024.0
REF = r"C:/Users/PC/Documents/GITHUBprojects/RPG GROK/art/refs"
COLL = bpy.context.scene.collection


def wipe():
    import re

    for o in list(bpy.data.objects):
        if o.type not in {"MESH", "META", "CURVE"}:
            continue
        if o.name.startswith("NYRA_"):
            continue
        if o.name.startswith("Nyra") or re.match(r"^N[A-Z]", o.name):
            bpy.data.objects.remove(o, do_unlink=True)


def finish(bm, name):
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    COLL.objects.link(obj)
    return obj


def sphere(name, loc, r, scale=(1, 1, 1), segs=24, rings=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    sx, sy, sz = scale
    for v in bm.verts:
        v.co.x = v.co.x * sx + loc[0]
        v.co.y = v.co.y * sy + loc[1]
        v.co.z = v.co.z * sz + loc[2]
    return finish(bm, name)


def cyl(name, loc, r1, r2, depth, rot=(0, 0, 0), segs=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=depth)
    bmesh.ops.rotate(
        bm,
        verts=bm.verts,
        cent=(0, 0, 0),
        matrix=__import__("mathutils").Euler(rot).to_matrix().to_4x4(),
    )
    for v in bm.verts:
        v.co += Vector(loc)
    return finish(bm, name)


def parts():
    objs = []
    # Head + hair
    objs.append(sphere("p", (0.0, -0.04, 1.48), 0.155, (1.05, 0.95, 1.08), 28, 16))
    objs.append(sphere("p", (0.0, -0.02, 1.58), 0.13, (1.2, 1.0, 0.85), 20, 12))
    objs.append(sphere("p", (0.11, 0.00, 1.54), 0.10, (1.0, 1.0, 0.95), 16, 10))
    objs.append(sphere("p", (-0.11, 0.00, 1.54), 0.10, (1.0, 1.0, 0.95), 16, 10))
    objs.append(sphere("p", (0.0, 0.08, 1.50), 0.12, (1.15, 0.85, 0.9), 16, 10))
    objs.append(sphere("p", (0.0, -0.10, 1.44), 0.09, (1.2, 0.8, 1.0), 14, 10))
    # Hood / cowl connecting head to torso
    objs.append(sphere("p", (0.0, 0.04, 1.38), 0.16, (1.2, 1.0, 0.7), 20, 12))
    # Neck
    objs.append(cyl("p", (0.0, -0.02, 1.34), 0.07, 0.08, 0.14, (0, 0, 0), 14))
    # Torso
    objs.append(sphere("p", (0.0, -0.02, 1.18), 0.20, (1.08, 0.78, 1.12), 28, 16))
    objs.append(sphere("p", (0.0, 0.00, 1.00), 0.18, (1.12, 0.75, 0.9), 24, 14))
    objs.append(sphere("p", (0.0, 0.00, 0.90), 0.16, (1.15, 0.72, 0.7), 20, 12))
    # Cape — overlapping the back, not a distant slab
    objs.append(sphere("p", (0.0, 0.10, 1.16), 0.18, (1.15, 0.55, 1.15), 24, 14))
    objs.append(sphere("p", (0.0, 0.12, 0.88), 0.16, (1.2, 0.45, 1.1), 20, 12))
    objs.append(sphere("p", (0.0, 0.10, 0.58), 0.13, (1.15, 0.4, 1.0), 18, 12))
    # Shoulders / arms — overlap torso
    objs.append(sphere("p", (0.20, -0.02, 1.28), 0.10, (1.1, 0.9, 0.9), 16, 10))
    objs.append(sphere("p", (-0.20, -0.02, 1.28), 0.10, (1.1, 0.9, 0.9), 16, 10))
    objs.append(cyl("p", (0.28, -0.05, 1.14), 0.06, 0.05, 0.28, (0.45, 0, 0.35), 14))
    objs.append(cyl("p", (-0.28, -0.05, 1.14), 0.06, 0.05, 0.28, (0.45, 0, -0.35), 14))
    objs.append(cyl("p", (0.34, -0.10, 0.94), 0.05, 0.045, 0.26, (0.25, 0, 0.12), 14))
    objs.append(cyl("p", (-0.34, -0.10, 0.94), 0.05, 0.045, 0.26, (0.25, 0, -0.12), 14))
    objs.append(sphere("p", (0.36, -0.13, 0.80), 0.05, (1.15, 0.85, 1.0), 12, 8))
    objs.append(sphere("p", (-0.36, -0.13, 0.80), 0.05, (1.15, 0.85, 1.0), 12, 8))
    # Legs — overlap hips
    objs.append(cyl("p", (0.10, 0.00, 0.70), 0.08, 0.06, 0.34, (0.08, 0, 0.05), 14))
    objs.append(cyl("p", (-0.10, 0.00, 0.70), 0.08, 0.06, 0.34, (0.08, 0, -0.05), 14))
    objs.append(cyl("p", (0.11, 0.00, 0.42), 0.06, 0.05, 0.26, (0, 0, 0), 14))
    objs.append(cyl("p", (-0.11, 0.00, 0.42), 0.06, 0.05, 0.26, (0, 0, 0), 14))
    objs.append(sphere("p", (0.11, 0.05, 0.14), 0.09, (1.15, 1.35, 0.85), 16, 10))
    objs.append(sphere("p", (-0.11, 0.05, 0.14), 0.09, (1.15, 1.35, 0.85), 16, 10))
    # Pouches
    objs.append(sphere("p", (0.16, -0.08, 0.84), 0.07, (1.2, 0.9, 1.0), 12, 8))
    objs.append(sphere("p", (-0.15, -0.08, 0.84), 0.06, (1.15, 0.9, 1.0), 12, 8))
    # Quiver
    objs.append(cyl("p", (0.12, 0.16, 1.14), 0.05, 0.055, 0.34, (0.7, 0, 0.35), 12))
    return objs


def join_remesh(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = "NyraHull"
    mod = body.modifiers.new("Vox", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = 0.018
    bpy.ops.object.modifier_apply(modifier="Vox")
    sm = body.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.7
    sm.iterations = 12
    bpy.ops.object.modifier_apply(modifier="Smooth")
    bpy.ops.object.shade_smooth()
    mz = min(v.co.z for v in body.data.vertices)
    for v in body.data.vertices:
        v.co.z -= mz
    body.data.update()
    ht = max(v.co.z for v in body.data.vertices)
    s = H / max(0.001, ht)
    body.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    print("fused verts", len(body.data.vertices), "dim", tuple(round(x, 3) for x in body.dimensions))
    return body


def rgba(name):
    img = bpy.data.images.get(name) or bpy.data.images.load(f"{REF}/{name}")
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)


def sample_rgb(px, u, v):
    h, w = px.shape[:2]
    valid = (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
    ix = np.clip((u * (w - 1)).astype(np.int32), 0, w - 1)
    iy = np.clip((v * (h - 1)).astype(np.int32), 0, h - 1)
    out = np.ones(u.shape + (3,), dtype=np.float32)
    out[valid] = px[iy[valid], ix[valid], :3]
    ink = valid & (out.max(axis=-1) < 0.93)
    return out, ink


def paint(obj):
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
    lens[lens < 1e-8] = 1
    nrm /= lens
    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    zmax = float(z.max()) or 1
    vv = np.clip(z / zmax, 0, 1)
    cf, inf = sample_rgb(front, (x + W * 0.5) / W, vv)
    cb, inb = sample_rgb(back, (W * 0.5 - x) / W, vv)
    cl, inl = sample_rgb(left, (y + W * 0.5) / W, vv)
    cr, inr = sample_rgb(right, (W * 0.5 - y) / W, vv)
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
    wt[wt < 1e-5] = 1
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
        bsdf.inputs["Specular IOR Level"].default_value = 0.14
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


def extra_sphere(name, loc, r, scale=(1, 1, 1), material=None, segs=16):
    obj = sphere(name, loc, r, scale, segs, max(8, segs // 2))
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return obj


def make_bow():
    curve_data = bpy.data.curves.new("NyraBowCrv", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 0.013
    curve_data.bevel_resolution = 4
    curve_data.fill_mode = "FULL"
    spl = curve_data.splines.new("BEZIER")
    spl.bezier_points.add(2)
    pts = [(-0.36, -0.30, 0.58), (-0.36, -0.42, 1.08), (-0.36, -0.30, 1.58)]
    handles = [(0.0, -0.04, 0.18), (0.0, 0.0, 0.22), (0.0, 0.04, 0.18)]
    for i, (co, h) in enumerate(zip(pts, handles)):
        p = spl.bezier_points[i]
        p.co = co
        p.handle_left_type = "FREE"
        p.handle_right_type = "FREE"
        p.handle_left = (co[0] + h[0], co[1] + h[1], co[2] - h[2])
        p.handle_right = (co[0] - h[0], co[1] - h[1], co[2] + h[2])
    obj = bpy.data.objects.new("NyraBow", curve_data)
    COLL.objects.link(obj)
    obj.data.materials.append(mat("NWood", (0.42, 0.25, 0.11), 0.0, 0.48))
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


def extras():
    white = mat("NWhite", (0.96, 0.96, 0.98), 0.0, 0.28)
    iris = mat("NIris", (0.30, 0.16, 0.07), 0.0, 0.3)
    pupil = mat("NPupil", (0.03, 0.02, 0.02), 0.0, 0.18)
    gold = mat("NGold", (0.78, 0.56, 0.14), 0.85, 0.28)
    steel = mat("NSteel", (0.76, 0.77, 0.82), 0.72, 0.3)
    out = [
        extra_sphere("NyraEyeL", (0.05, -0.17, 1.50), 0.026, (1.1, 0.6, 1.0), white),
        extra_sphere("NyraEyeR", (-0.05, -0.17, 1.50), 0.026, (1.1, 0.6, 1.0), white),
        extra_sphere("NyraIrisL", (0.05, -0.185, 1.50), 0.015, material=iris),
        extra_sphere("NyraIrisR", (-0.05, -0.185, 1.50), 0.015, material=iris),
        extra_sphere("NyraPupilL", (0.05, -0.195, 1.50), 0.007, material=pupil),
        extra_sphere("NyraPupilR", (-0.05, -0.195, 1.50), 0.007, material=pupil),
        extra_sphere("NyraBrooch", (0.0, -0.19, 1.34), 0.028, material=gold),
        extra_sphere("NyraBowTip1", (-0.36, -0.30, 0.58), 0.016, material=gold),
        extra_sphere("NyraBowTip2", (-0.36, -0.30, 1.58), 0.016, material=gold),
    ]
    bow = make_bow()
    out.append(bow)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.004, radius2=0.014, depth=0.22)
    for v in bm.verts:
        v.co.z -= 0.11
        v.co += Vector((0.37, -0.16, 0.64))
    dagger = finish(bm, "NyraDagger")
    dagger.data.materials.append(steel)
    out.append(dagger)
    return out


def parent_keep(obj, joint):
    j = bpy.data.objects[joint]
    obj.parent = j
    obj.matrix_parent_inverse = j.matrix_world.inverted()


def run():
    bpy.context.view_layer.update()
    wipe()
    body = join_remesh(parts())
    paint(body)
    parent_keep(body, "NHip")
    for o in extras():
        if o.name.startswith("NyraEye") or o.name.startswith("NyraIris") or o.name.startswith("NyraPupil") or o.name == "NyraBrooch":
            parent_keep(o, "NHead")
        elif "Bow" in o.name:
            parent_keep(o, "NWeapon")
        elif o.name == "NyraDagger":
            parent_keep(o, "NForeL")
        else:
            parent_keep(o, "NHip")
    print("solid nyra ready")


run()
