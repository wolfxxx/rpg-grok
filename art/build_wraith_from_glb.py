"""Import wraith.glb, scale, split head/arms, export wraith.glb."""
from __future__ import annotations

import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Euler, Vector

SRC = Path(r"C:\Users\PC\Downloads\wraith.glb")
OUT = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\public\models\wraith.glb")
HEIGHT = 2.15
EXPAND_RINGS = 4


def log(msg: str) -> None:
    print(msg, flush=True)


def make_empty(name: str, parent: bpy.types.Object, world: Vector) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.08
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
    scale = HEIGHT / (maxs.z - mins.z)
    log(f"scale {scale:.4f} from height {maxs.z - mins.z:.3f}")
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
    mesh.name = "WraithMesh"
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

    def keep_arm(sign: float):
        def keep(p: Vector) -> bool:
            if p.x * sign < 0.22:
                return False
            if p.z > 1.88:
                return False
            if p.z > 1.48 and abs(p.x) < 0.34:
                return False
            return True

        return keep

    arm_l = flood(pts, adj, lambda p: p.x > 0.40 and p.z < 1.45, keep_arm(1))
    arm_r = flood(pts, adj, lambda p: p.x < -0.40 and p.z < 1.45, keep_arm(-1))
    taken = arm_l | arm_r
    head = (
        flood(
            pts,
            adj,
            lambda p: p.z > 1.88 and abs(p.x) < 0.28,
            lambda p: p.z > 1.52 and abs(p.x) < 0.48,
        )
        - taken
    )
    body = {i for i in range(n) if i not in taken and i not in head}
    log(f"flood armL={len(arm_l)} armR={len(arm_r)} head={len(head)} body={len(body)}")

    owners = ["WHip"] * n
    for i in arm_l:
        owners[i] = "WArmL"
    for i in arm_r:
        owners[i] = "WArmR"
    for i in head:
        owners[i] = "WHead"

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

    core = {"WHip", "WHead"}
    for joint in ("WArmL", "WArmR", "WHead"):
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

    hip_p = mean_pt(pts, body, lambda p: 0.7 <= p.z <= 1.35) or Vector((0.0, 0.0, 1.05))
    head_p = mean_pt(pts, head) or Vector((0.0, 0.05, 1.92))

    def shoulder(ids: set[int], fallback: Vector) -> Vector:
        band = [i for i in ids if 1.35 <= pts[i].z <= 1.7]
        if not band:
            band = list(ids)
        band.sort(key=lambda i: abs(pts[i].x))
        take = band[: max(1, len(band) // 5)]
        return mean_pt(pts, take) or fallback

    arm_l_p = shoulder(arm_l, Vector((0.38, 0.05, 1.48)))
    arm_r_p = shoulder(arm_r, Vector((-0.38, 0.05, 1.48)))
    log(f"joints hip={tuple(round(c, 2) for c in hip_p)} head={tuple(round(c, 2) for c in head_p)}")

    root = bpy.data.objects.new("Wraith", None)
    bpy.context.scene.collection.objects.link(root)
    hip = make_empty("WHip", root, hip_p)
    make_empty("WHead", hip, head_p)
    make_empty("WArmL", hip, arm_l_p)
    make_empty("WArmR", hip, arm_r_p)

    for joint, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(mesh, sorted(faces), f"Wraith_{joint}")
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
