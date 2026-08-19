"""Import copperbeetle.glb, scale, split head/legs, export beetle.glb."""
from __future__ import annotations

import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Euler, Vector

SRC = Path(r"C:\Users\PC\Downloads\copperbeetle.glb")
OUT = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\public\models\beetle.glb")
LENGTH = 1.22
EXPAND_RINGS = 4
LEGS = [
    ("BLeg0", 1, -0.70, -0.22),
    ("BLeg1", 1, -0.22, 0.10),
    ("BLeg2", 1, 0.10, 0.55),
    ("BLeg3", -1, -0.70, -0.22),
    ("BLeg4", -1, -0.22, 0.10),
    ("BLeg5", -1, 0.10, 0.55),
]


def log(msg: str) -> None:
    print(msg, flush=True)


def make_empty(name: str, parent: bpy.types.Object, world: Vector) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.06
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    obj.location = world - parent.matrix_world.translation
    bpy.context.view_layer.update()
    return obj


def select_tree(obj: bpy.types.Object) -> None:
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    for child in obj.children:
        select_tree(child)


def mean_pt(pts: list[Vector], ids, pred=None) -> Vector | None:
    sel = [pts[i] for i in ids if pred is None or pred(pts[i])]
    if not sel:
        return None
    return Vector(
        (
            sum(p.x for p in sel) / len(sel),
            sum(p.y for p in sel) / len(sel),
            sum(p.z for p in sel) / len(sel),
        )
    )


def extract_mesh(src, faces: list[int], name: str):
    mesh = src.data
    used = sorted({i for f in faces for i in mesh.polygons[f].vertices})
    remap = {old: new for new, old in enumerate(used)}
    verts = [mesh.vertices[i].co.copy() for i in used]
    loops = [[remap[i] for i in mesh.polygons[fi].vertices] for fi in faces]
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


def flood(pts, adj, pred_seed, pred_keep) -> set[int]:
    q: deque[int] = deque(i for i, p in enumerate(pts) if pred_seed(p))
    seen: set[int] = set()
    while q:
        i = q.popleft()
        if i in seen:
            continue
        if not pred_keep(pts[i]):
            continue
        seen.add(i)
        for j in adj[i]:
            if j not in seen:
                q.append(j)
    return seen


def run() -> None:
    log("import")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    mesh = next(o for o in bpy.context.selected_objects if o.type == "MESH" and len(o.data.vertices) > 100)
    log(f"mesh {mesh.name} verts {len(mesh.data.vertices)}")

    mw = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.matrix_world = mw
    bpy.context.view_layer.update()
    bbox = [mw @ Vector(c) for c in mesh.bound_box]
    mins = Vector((min(p[i] for p in bbox) for i in range(3)))
    maxs = Vector((max(p[i] for p in bbox) for i in range(3)))
    scale = LENGTH / (maxs.y - mins.y)
    log(f"scale {scale:.4f} from length {maxs.y - mins.y:.3f}")
    n = len(mesh.data.vertices)
    pts: list[Vector] = [Vector((0, 0, 0))] * n
    for i, vert in enumerate(mesh.data.vertices):
        w = (mw @ vert.co - Vector(((mins.x + maxs.x) * 0.5, (mins.y + maxs.y) * 0.5, mins.z))) * scale
        vert.co = w
        pts[i] = w
    mesh.matrix_world = Euler((0, 0, 0), "XYZ").to_matrix().to_4x4()
    mesh.location = (0.0, 0.0, 0.0)
    mesh.rotation_euler = (0.0, 0.0, 0.0)
    mesh.scale = (1.0, 1.0, 1.0)
    mesh.data.update()
    mesh.name = "BeetleMesh"
    for poly in mesh.data.polygons:
        poly.use_smooth = True

    adj: list[list[int]] = [[] for _ in range(n)]
    for poly in mesh.data.polygons:
        vs = list(poly.vertices)
        m = len(vs)
        for i, a in enumerate(vs):
            b = vs[(i + 1) % m]
            adj[a].append(b)
            adj[b].append(a)

    groups: dict[str, set[int]] = {}
    taken: set[int] = set()
    for name, sign, y0, y1 in LEGS:
        rear = y0 > 0

        def seed(p, s=sign, a=y0, b=y1, r=rear):
            wide = 0.20 if r else 0.28
            return p.z < (0.18 if r else 0.10) and p.x * s > wide and a <= p.y <= b

        def keep(p, s=sign, a=y0, b=y1, r=rear):
            if p.x * s < (0.12 if r else 0.16):
                return False
            if not (a - 0.05 <= p.y <= b + 0.05):
                return False
            if p.z > (0.40 if r else 0.32) and abs(p.x) < 0.26:
                return False
            return True

        ids = flood(pts, adj, seed, keep) - taken
        groups[name] = ids
        taken |= ids
        log(f"flood {name}={len(ids)}")

    head = (
        flood(
            pts,
            adj,
            lambda p: p.y < -0.42 and abs(p.x) < 0.22,
            lambda p: p.y < -0.18 and abs(p.x) < 0.38 and p.z < 0.38,
        )
        - taken
    )
    groups["BHead"] = head
    taken |= head
    body = {i for i in range(n) if i not in taken}
    groups["BHip"] = body
    log(f"flood head={len(head)} body={len(body)}")

    owners = ["BHip"] * n
    for name, ids in groups.items():
        for i in ids:
            owners[i] = name

    faces_by: dict[str, set[int]] = defaultdict(set)
    vert_faces: list[list[int]] = [[] for _ in range(n)]
    face_owner: dict[int, str] = {}
    for poly in mesh.data.polygons:
        votes = [owners[i] for i in poly.vertices]
        g = max(set(votes), key=votes.count)
        faces_by[g].add(poly.index)
        face_owner[poly.index] = g
        for vi in poly.vertices:
            vert_faces[vi].append(poly.index)

    core = {"BHip", "BHead"}
    for joint in [n for n, *_ in LEGS] + ["BHead"]:
        extra = set(faces_by[joint])
        allowed = core | {joint}
        for _ in range(EXPAND_RINGS):
            ring: set[int] = set()
            verts = {v for fi in extra for v in mesh.data.polygons[fi].vertices}
            for v in verts:
                for fi in vert_faces[v]:
                    if face_owner.get(fi) in allowed:
                        ring.add(fi)
            extra |= ring
        faces_by[joint] |= extra

    hip_p = mean_pt(pts, body, lambda p: p.z > 0.18) or Vector((0.0, 0.05, 0.28))
    head_p = mean_pt(pts, head) or Vector((0.0, -0.38, 0.22))
    root = bpy.data.objects.new("Beetle", None)
    bpy.context.scene.collection.objects.link(root)
    hip = make_empty("BHip", root, hip_p)
    make_empty("BHead", hip, head_p)
    for name, ids in ((n, groups[n]) for n, *_ in LEGS):
        loc = mean_pt(pts, ids, lambda p: p.z > 0.12) or mean_pt(pts, ids) or hip_p
        make_empty(name, hip, loc)
        log(f"joint {name} {tuple(round(c, 2) for c in loc)}")

    for joint, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(mesh, sorted(faces), f"Beetle_{joint}")
        empty = bpy.data.objects[joint]
        kept = obj.matrix_world.copy()
        obj.parent = empty
        obj.matrix_parent_inverse.identity()
        obj.matrix_world = kept
        log(f"parented {obj.name} -> {joint} faces {len(faces)}")

    mesh.hide_set(True)
    mesh.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    select_tree(root)
    if mesh.select_get():
        mesh.select_set(False)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
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
    log(f"exported {OUT}")


if __name__ == "__main__":
    try:
        run()
    except Exception:
        import traceback

        traceback.print_exc()
        sys.exit(1)
