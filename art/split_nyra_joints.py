"""Split NyraHull onto the existing N* joints so walk/attack can move limbs."""
from __future__ import annotations

from collections import defaultdict
from math import hypot

import bpy
from mathutils import Vector

JOINTS = [
    "NHead",
    "NForeL",
    "NForeR",
    "NWeapon",
    "NArmL",
    "NArmR",
    "NShinL",
    "NShinR",
    "NLegL",
    "NLegR",
    "NTorso",
    "NHip",
]


def world_pos(name: str) -> Vector:
    return bpy.data.objects[name].matrix_world.translation.copy()


def assign(p: Vector, jp: dict[str, Vector]) -> str:
    x, y, z = p.x, p.y, p.z
    # Bow lives on the character's right (world -X), held forward (-Y).
    if x < -0.18 and y < -0.12 and z > 0.45:
        return "NWeapon"
    # Dagger in the left hand (world +X).
    if x > 0.22 and y < -0.05 and 0.45 < z < 0.95:
        return "NForeL"

    best = "NHip"
    best_d = 1e9
    for name in JOINTS:
        d = (p - jp[name]).length
        m = 1.0
        if name == "NHip":
            m = 1.35
        elif name == "NTorso":
            m = 0.78 if 0.85 < z < 1.42 else 1.25
        elif name == "NHead":
            m = 0.48 if z > 1.28 else 1.8
        elif name == "NShinL":
            m = 0.4 if z < 0.38 and x > -0.02 else 1.4
        elif name == "NShinR":
            m = 0.4 if z < 0.38 and x < 0.02 else 1.4
        elif name == "NLegL":
            m = 0.62 if 0.32 < z < 0.92 and x > 0 else 1.5
        elif name == "NLegR":
            m = 0.62 if 0.32 < z < 0.92 and x < 0 else 1.5
        elif name == "NForeL":
            m = 0.48 if (p - jp["NForeL"]).length < 0.22 else 1.7
        elif name == "NForeR":
            m = 0.48 if (p - jp["NForeR"]).length < 0.22 else 1.7
        elif name == "NArmL":
            m = 0.62 if z > 1.10 and x > 0.14 else 1.45
        elif name == "NArmR":
            m = 0.62 if z > 1.10 and x < -0.14 else 1.45
        elif name == "NWeapon":
            m = 2.4
        scored = d * m
        if scored < best_d:
            best_d = scored
            best = name
    return best


def extract_mesh(src, faces, name: str):
    mesh = src.data
    used = sorted({i for f in faces for i in mesh.polygons[f].vertices})
    remap = {old: new for new, old in enumerate(used)}
    verts = [mesh.vertices[i].co.copy() for i in used]
    loops = []
    for fi in faces:
        poly = mesh.polygons[fi]
        loops.append([remap[i] for i in poly.vertices])
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
    if mesh.color_attributes:
        src_col = mesh.color_attributes[0]
        dst_col = new.color_attributes.new(name=src_col.name, type=src_col.data_type, domain=src_col.domain)
        if src_col.domain == "POINT":
            for new_i, old_i in enumerate(used):
                dst_col.data[new_i].color = src_col.data[old_i].color
    if mesh.materials:
        new.materials.append(mesh.materials[0])
    for p in new.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, new)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def run():
    src = bpy.data.objects["NyraHull"]
    mw = src.matrix_world
    jp = {n: world_pos(n) for n in JOINTS}

    owners = []
    counts = defaultdict(int)
    for v in src.data.vertices:
        g = assign(mw @ v.co, jp)
        owners.append(g)
        counts[g] += 1
    print("vert counts", dict(counts))

    faces_by = defaultdict(list)
    for poly in src.data.polygons:
        votes = [owners[i] for i in poly.vertices]
        g = max(set(votes), key=votes.count)
        faces_by[g].append(poly.index)

    created = []
    for name, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(src, faces, f"Nyra_{name}")
        empty = bpy.data.objects[name]
        obj.parent = empty
        obj.matrix_parent_inverse = empty.matrix_world.inverted()
        obj.location = (0.0, 0.0, 0.0)
        created.append(obj.name)
        print("parented", obj.name, "->", name, "faces", len(faces))

    bpy.data.objects.remove(src, do_unlink=True)
    print("created", created)


run()
