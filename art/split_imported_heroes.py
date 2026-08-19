"""Slice NyraMesh / SerisMesh onto dummy joints so the game walk cycle can move limbs."""
from __future__ import annotations

from collections import defaultdict

import bpy
from mathutils import Vector


def world_pos(name: str) -> Vector:
    return bpy.data.objects[name].matrix_world.translation.copy()


def assign_nyra(p: Vector) -> str:
    x, y, z = p.x, p.y, p.z
    if z > 1.42 and abs(x) < 0.20 and y < 0.12:
        return "NHead"
    # Arms, cloak, pauldron, and bow stay on the torso so the back
    # does not open at the shoulder. Only the front legs swing.
    if z < 0.28 and y < 0.08:
        return "NShinL" if x > 0 else "NShinR"
    if 0.28 < z < 0.82 and y < 0.05 and abs(x) < 0.22:
        if z < 0.48:
            return "NShinL" if x > 0 else "NShinR"
        return "NLegL" if x > 0 else "NLegR"
    if z > 0.95:
        return "NTorso"
    return "NHip"


def assign_seris(p: Vector) -> str:
    x, y, z = p.x, p.y, p.z
    if z > 1.38 and abs(x) < 0.22:
        return "SHead"
    if x < -0.28 and z > 0.35:
        return "SWeapon"
    if x < -0.16 and z > 0.92:
        return "SForeR" if z < 1.18 else "SArmR"
    if x > 0.16 and z > 0.95:
        return "SForeL" if z < 1.22 else "SArmL"
    if z < 0.22:
        return "SShinL" if x > 0 else "SShinR"
    if z < 1.08:
        return "SHip"
    if z > 1.12:
        return "STorso"
    return "SHip"


def extract_mesh(src, faces: list[int], name: str):
    mesh = src.data
    used = sorted({i for f in faces for i in mesh.polygons[f].vertices})
    remap = {old: new for new, old in enumerate(used)}
    verts = [mesh.vertices[i].co.copy() for i in used]
    loops = []
    for fi in faces:
        loops.append([remap[i] for i in mesh.polygons[fi].vertices])
    new = bpy.data.meshes.new(name)
    new.from_pydata(verts, [], loops)
    new.update()
    if mesh.uv_layers:
        uv_src = mesh.uv_layers.active
        uv_dst = new.uv_layers.new(name="UVMap")
        dst_loop = 0
        for fi in faces:
            poly = mesh.polygons[fi]
            for k in range(poly.loop_total):
                uv_dst.data[dst_loop].uv = uv_src.data[poly.loop_start + k].uv
                dst_loop += 1
    if mesh.materials:
        new.materials.append(mesh.materials[0])
    for p in new.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, new)
    bpy.context.scene.collection.objects.link(obj)
    obj.matrix_world = src.matrix_world.copy()
    return obj


def split(src_name: str, assign, prefix: str) -> None:
    src = bpy.data.objects[src_name]
    mw = src.matrix_world
    owners: list[str] = []
    counts: dict[str, int] = defaultdict(int)
    for v in src.data.vertices:
        g = assign(mw @ v.co)
        owners.append(g)
        counts[g] += 1
    print(src_name, "vert counts", dict(counts))

    faces_by: dict[str, list[int]] = defaultdict(list)
    for poly in src.data.polygons:
        votes = [owners[i] for i in poly.vertices]
        g = max(set(votes), key=votes.count)
        faces_by[g].append(poly.index)

    for joint, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(src, faces, f"{prefix}_{joint}")
        empty = bpy.data.objects[joint]
        empty.hide_set(False)
        mw = obj.matrix_world.copy()
        obj.parent = empty
        obj.matrix_parent_inverse.identity()
        obj.matrix_world = mw
        print("parented", obj.name, "->", joint, "faces", len(faces))

    src.hide_set(True)
    src.hide_render = True
    print("hid", src_name)


def export_hero(root_name: str, path: str) -> None:
    def select_tree(obj: bpy.types.Object) -> None:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
        for child in obj.children:
            select_tree(child)

    bpy.ops.object.select_all(action="DESELECT")
    root = bpy.data.objects[root_name]
    root.location = (0.0, 0.0, 0.0)
    select_tree(root)
    # Keep the original unsplit mesh out of the GLB.
    solid = bpy.data.objects.get(root_name + "Mesh")
    if solid and solid.select_get():
        solid.select_set(False)
        solid.hide_set(True)
        solid.hide_render = True
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_extras=False,
        export_lights=False,
        export_skins=False,
        export_animations=False,
    )
    print("exported", root_name)


def run(which: str) -> None:
    base = r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\public\models"
    if which == "nyra":
        split("NyraMesh", assign_nyra, "Nyra")
        export_hero("Nyra", base + r"\nyra.glb")
    elif which == "seris":
        split("SerisMesh", assign_seris, "Seris")
        export_hero("Seris", base + r"\seris.glb")
    else:
        raise ValueError(which)
