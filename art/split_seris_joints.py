"""Split SerisRodin onto the existing joint empties so walk/attack can move limbs."""
from __future__ import annotations

from collections import defaultdict
from math import hypot

import bpy
from mathutils import Vector

JOINTS = [
    "SHead",
    "SForeL",
    "SForeR",
    "SWeapon",
    "SArmL",
    "SArmR",
    "SShinL",
    "SShinR",
    "SLegL",
    "SLegR",
    "STorso",
    "SHip",
]


def world_pos(name: str) -> Vector:
    return bpy.data.objects[name].matrix_world.translation.copy()


def assign(p: Vector, jp: dict[str, Vector]) -> str:
    x, y, z = p.x, p.y, p.z
    staff = hypot(x - jp["SWeapon"].x, y - jp["SWeapon"].y)
    if staff < 0.14 and z > 0.55:
        return "SWeapon"

    best = "SHip"
    best_d = 1e9
    for name in JOINTS:
        d = (p - jp[name]).length
        m = 1.0
        if name == "SHip":
            m = 1.35
        elif name == "STorso":
            m = 0.8 if 0.85 < z < 1.42 else 1.25
        elif name == "SHead":
            m = 0.5 if z > 1.26 else 1.75
        elif name == "SShinL":
            m = 0.4 if z < 0.36 and x > -0.02 else 1.4
        elif name == "SShinR":
            m = 0.4 if z < 0.36 and x < 0.02 else 1.4
        elif name == "SLegL":
            m = 0.65 if 0.32 < z < 0.92 and x > 0 else 1.5
        elif name == "SLegR":
            m = 0.65 if 0.32 < z < 0.92 and x < 0 else 1.5
        elif name == "SForeL":
            m = 0.48 if (p - jp["SForeL"]).length < 0.22 else 1.7
        elif name == "SForeR":
            m = 0.48 if (p - jp["SForeR"]).length < 0.22 else 1.7
        elif name == "SArmL":
            m = 0.62 if z > 1.12 and x > 0.14 else 1.45
        elif name == "SArmR":
            m = 0.62 if z > 1.12 and x < -0.14 else 1.45
        elif name == "SWeapon":
            m = 2.2
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
    if mesh.materials:
        new.materials.append(mesh.materials[0])
    for p in new.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, new)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def run():
    src = bpy.data.objects["SerisRodin"]
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
        obj = extract_mesh(src, faces, f"Seris_{name}")
        empty = bpy.data.objects[name]
        obj.parent = empty
        obj.matrix_parent_inverse = empty.matrix_world.inverted()
        obj.location = (0.0, 0.0, 0.0)
        created.append(obj.name)
        print("parented", obj.name, "->", name, "faces", len(faces))

    bpy.data.objects.remove(src, do_unlink=True)
    print("created", created)


run()
