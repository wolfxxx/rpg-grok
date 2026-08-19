"""Scale, ground, joint-split goblin / devilman / robotcrab for VELUM."""
from __future__ import annotations

import shutil
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Euler, Vector

ROOT = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK")
BACKUP = ROOT / "art" / "backup"
OUT_DIR = ROOT / "public" / "models"
EXPAND_RINGS = 4


def log(msg: str) -> None:
    print(msg, flush=True)


def wipe() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


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
        for slot in mesh.materials:
            if slot:
                new.materials.append(slot)
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


def import_mesh(src: Path):
    wipe()
    bpy.ops.import_scene.gltf(filepath=str(src))
    mesh = max(
        (o for o in bpy.context.scene.objects if o.type == "MESH"),
        key=lambda o: len(o.data.vertices),
    )
    mw = mesh.matrix_world.copy()
    mesh.parent = None
    mesh.matrix_world = mw
    bpy.context.view_layer.update()
    return mesh, mw


def ground_scale(mesh, mw, height: float, yaw90=False) -> list[Vector]:
    bbox = [mw @ Vector(c) for c in mesh.bound_box]
    mins = Vector((min(p[i] for p in bbox) for i in range(3)))
    maxs = Vector((max(p[i] for p in bbox) for i in range(3)))
    scale = height / max(0.001, maxs.z - mins.z)
    log(f"  scale {scale:.4f} from height {maxs.z - mins.z:.3f}")
    n = len(mesh.data.vertices)
    pts: list[Vector] = []
    cx = (mins.x + maxs.x) * 0.5
    cy = (mins.y + maxs.y) * 0.5
    for vert in mesh.data.vertices:
        w = (mw @ vert.co - Vector((cx, cy, mins.z))) * scale
        if yaw90:
            w = Vector((w.y, -w.x, w.z))
        vert.co = w
        pts.append(w)
    mesh.matrix_world = Euler((0, 0, 0), "XYZ").to_matrix().to_4x4()
    mesh.location = (0.0, 0.0, 0.0)
    mesh.rotation_euler = (0.0, 0.0, 0.0)
    mesh.scale = (1.0, 1.0, 1.0)
    mesh.data.update()
    for poly in mesh.data.polygons:
        poly.use_smooth = True
    return pts


def adjacency(mesh) -> list[list[int]]:
    n = len(mesh.data.vertices)
    adj: list[list[int]] = [[] for _ in range(n)]
    for poly in mesh.data.polygons:
        vs = list(poly.vertices)
        m = len(vs)
        for i, a in enumerate(vs):
            b = vs[(i + 1) % m]
            adj[a].append(b)
            adj[b].append(a)
    return adj


def export_root(root: bpy.types.Object, src_mesh, out: Path) -> None:
    src_mesh.hide_set(True)
    src_mesh.hide_render = True
    bpy.ops.object.select_all(action="DESELECT")
    select_tree(root)
    if src_mesh.select_get():
        src_mesh.select_set(False)
    bpy.context.view_layer.objects.active = root
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
    )
    log(f"  wrote {out}")


def assign_faces(mesh, owners: list[str]) -> dict[str, set[int]]:
    faces_by: dict[str, set[int]] = defaultdict(set)
    vert_faces: list[list[int]] = [[] for _ in range(len(mesh.data.vertices))]
    face_owner: dict[int, str] = {}
    for poly in mesh.data.polygons:
        votes = [owners[i] for i in poly.vertices]
        g = max(set(votes), key=votes.count)
        faces_by[g].add(poly.index)
        face_owner[poly.index] = g
        for vi in poly.vertices:
            vert_faces[vi].append(poly.index)
    return faces_by, vert_faces, face_owner


def expand_joints(mesh, faces_by, vert_faces, face_owner, joints, limb_group, core):
    def expand(joint: str) -> None:
        allowed = core | limb_group.get(joint, {joint})
        extra = set(faces_by[joint])
        for _ in range(EXPAND_RINGS):
            ring: set[int] = set()
            verts = {v for fi in extra for v in mesh.data.polygons[fi].vertices}
            for v in verts:
                for fi in vert_faces[v]:
                    if face_owner.get(fi) in allowed:
                        ring.add(fi)
            extra |= ring
        faces_by[joint] |= extra

    for joint in joints:
        expand(joint)


def parent_pieces(mesh, faces_by, prefix: str) -> None:
    for joint, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(mesh, sorted(faces), f"{prefix}_{joint}")
        empty = bpy.data.objects[joint]
        kept = obj.matrix_world.copy()
        obj.parent = empty
        obj.matrix_parent_inverse.identity()
        obj.matrix_world = kept
        log(f"  {obj.name} -> {joint} faces {len(faces)}")


def build_humanoid(src: Path, out: Path, root_name: str, height: float, yaw90=False) -> None:
    log(f"humanoid {src.name} -> {out.name} h={height}")
    mesh, mw = import_mesh(src)
    pts = ground_scale(mesh, mw, height, yaw90)
    mesh.name = f"{root_name}Mesh"
    n = len(pts)
    adj = adjacency(mesh)
    h = height
    # Face: mean Y of the head band. Negative Y is already Blender -Y (game front).
    head_band = [p for p in pts if p.z > h * 0.78]
    mean_y = sum(p.y for p in head_band) / max(1, len(head_band))
    log(f"  head mean Y {mean_y:.3f} (want negative for -Y face)")
    if mean_y > 0.04:
        log("  flipping 180 around Z so face is -Y")
        for i, p in enumerate(pts):
            w = Vector((-p.x, -p.y, p.z))
            mesh.data.vertices[i].co = w
            pts[i] = w
        mesh.data.update()

    leg_l = flood(
        pts,
        adj,
        lambda p: p.z < h * 0.12 and p.x > h * 0.06,
        lambda p: p.z < h * 0.50 and p.x > h * 0.03,
    )
    leg_r = flood(
        pts,
        adj,
        lambda p: p.z < h * 0.12 and p.x < -h * 0.06,
        lambda p: p.z < h * 0.50 and p.x < -h * 0.03,
    )
    taken = leg_l | leg_r
    arm_l = flood(
        pts,
        adj,
        lambda p: p.x > h * 0.22 and h * 0.42 < p.z < h * 0.82,
        lambda p: p.x > h * 0.10 and h * 0.28 < p.z < h * 0.88,
    ) - taken
    arm_r = flood(
        pts,
        adj,
        lambda p: p.x < -h * 0.22 and h * 0.42 < p.z < h * 0.82,
        lambda p: p.x < -h * 0.10 and h * 0.28 < p.z < h * 0.88,
    ) - taken
    head = flood(
        pts,
        adj,
        lambda p: p.z > h * 0.84 and abs(p.x) < h * 0.18,
        lambda p: p.z > h * 0.72 and abs(p.x) < h * 0.28,
    ) - taken - arm_l - arm_r
    log(f"  flood armL={len(arm_l)} armR={len(arm_r)} head={len(head)} legL={len(leg_l)} legR={len(leg_r)}")

    elbow = h * 0.55
    knee = h * 0.28
    owners: list[str] = []
    counts: dict[str, int] = defaultdict(int)
    for i, p in enumerate(pts):
        if i in arm_l:
            g = "ForeL" if p.z < elbow else "ArmL"
        elif i in arm_r:
            g = "ForeR" if p.z < elbow else "ArmR"
        elif i in leg_l:
            g = "ShinL" if p.z < knee else "LegL"
        elif i in leg_r:
            g = "ShinR" if p.z < knee else "LegR"
        elif i in head or p.z > h * 0.82:
            g = "Head"
        elif p.z > h * 0.58:
            g = "Torso"
        else:
            g = "Hip"
        owners.append(g)
        counts[g] += 1
    log(f"  verts {dict(counts)}")

    faces_by, vert_faces, face_owner = assign_faces(mesh, owners)
    limb_group = {
        "ArmL": {"ArmL", "ForeL"},
        "ForeL": {"ArmL", "ForeL"},
        "ArmR": {"ArmR", "ForeR"},
        "ForeR": {"ArmR", "ForeR"},
        "LegL": {"LegL", "ShinL"},
        "ShinL": {"LegL", "ShinL"},
        "LegR": {"LegR", "ShinR"},
        "ShinR": {"LegR", "ShinR"},
    }
    expand_joints(
        mesh,
        faces_by,
        vert_faces,
        face_owner,
        ("ArmL", "ForeL", "ArmR", "ForeR", "LegL", "ShinL", "LegR", "ShinR"),
        limb_group,
        {"Hip", "Torso", "Head"},
    )

    hip_p = mean_pt(pts, range(n), lambda p: h * 0.46 <= p.z <= h * 0.58 and abs(p.x) < h * 0.12) or Vector((0, 0, h * 0.52))
    torso_p = mean_pt(pts, range(n), lambda p: h * 0.62 <= p.z <= h * 0.74 and abs(p.x) < h * 0.14) or Vector((0, 0, h * 0.68))
    head_p = mean_pt(pts, head) or Vector((0, 0, h * 0.88))
    arm_l_p = mean_pt(pts, arm_l, lambda p: p.z > elbow) or Vector((h * 0.18, 0, h * 0.72))
    arm_r_p = mean_pt(pts, arm_r, lambda p: p.z > elbow) or Vector((-h * 0.18, 0, h * 0.72))
    fore_l_p = mean_pt(pts, arm_l, lambda p: abs(p.z - elbow) < h * 0.08) or Vector((h * 0.26, 0, elbow))
    fore_r_p = mean_pt(pts, arm_r, lambda p: abs(p.z - elbow) < h * 0.08) or Vector((-h * 0.26, 0, elbow))
    leg_l_p = mean_pt(pts, leg_l, lambda p: p.z > knee) or Vector((h * 0.09, 0, h * 0.48))
    leg_r_p = mean_pt(pts, leg_r, lambda p: p.z > knee) or Vector((-h * 0.09, 0, h * 0.48))
    shin_l_p = mean_pt(pts, leg_l, lambda p: abs(p.z - knee) < h * 0.06) or Vector((h * 0.1, 0, knee))
    shin_r_p = mean_pt(pts, leg_r, lambda p: abs(p.z - knee) < h * 0.06) or Vector((-h * 0.1, 0, knee))

    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    hip = make_empty("Hip", root, hip_p)
    torso = make_empty("Torso", hip, torso_p)
    make_empty("Head", torso, head_p)
    arml = make_empty("ArmL", torso, arm_l_p)
    armr = make_empty("ArmR", torso, arm_r_p)
    make_empty("ForeL", arml, fore_l_p)
    make_empty("ForeR", armr, fore_r_p)
    legl = make_empty("LegL", hip, leg_l_p)
    legr = make_empty("LegR", hip, leg_r_p)
    make_empty("ShinL", legl, shin_l_p)
    make_empty("ShinR", legr, shin_r_p)
    parent_pieces(mesh, faces_by, root_name)
    export_root(root, mesh, out)


def build_crab(src: Path, out: Path) -> None:
    log(f"crab {src.name} -> {out.name}")
    mesh, mw = import_mesh(src)
    # Use longest horizontal axis as length ~1.28m, keep Z as height.
    bbox = [mw @ Vector(c) for c in mesh.bound_box]
    mins = Vector((min(p[i] for p in bbox) for i in range(3)))
    maxs = Vector((max(p[i] for p in bbox) for i in range(3)))
    span_x = maxs.x - mins.x
    span_y = maxs.y - mins.y
    span_z = maxs.z - mins.z
    length = max(span_x, span_y)
    scale = 1.28 / max(0.001, length)
    log(f"  scale {scale:.4f} spans {span_x:.3f} {span_y:.3f} {span_z:.3f}")
    n = len(mesh.data.vertices)
    pts: list[Vector] = []
    cx = (mins.x + maxs.x) * 0.5
    cy = (mins.y + maxs.y) * 0.5
    for vert in mesh.data.vertices:
        w = (mw @ vert.co - Vector((cx, cy, mins.z))) * scale
        vert.co = w
        pts.append(w)
    mesh.matrix_world = Euler((0, 0, 0), "XYZ").to_matrix().to_4x4()
    mesh.location = (0.0, 0.0, 0.0)
    mesh.rotation_euler = (0.0, 0.0, 0.0)
    mesh.scale = (1.0, 1.0, 1.0)
    mesh.data.update()
    mesh.name = "CrabMesh"
    for poly in mesh.data.polygons:
        poly.use_smooth = True

    adj = adjacency(mesh)
    h = max(p.z for p in pts)
    # Six legs: low verts, away from body, binned by angle in XY.
    body_r = 0.22
    leg_ids = [i for i, p in enumerate(pts) if p.z < h * 0.42 and (p.x * p.x + p.y * p.y) ** 0.5 > body_r]
    bins: list[set[int]] = [set() for _ in range(6)]
    import math

    for i in leg_ids:
        p = pts[i]
        ang = (math.atan2(p.y, p.x) + math.pi) % (math.pi * 2)
        bins[min(5, int(ang / (math.pi * 2 / 6)))].add(i)
    log(f"  crab leg bins {[len(b) for b in bins]} body h={h:.3f}")

    owners = ["Hip"] * n
    counts: dict[str, int] = defaultdict(int)
    for bi, ids in enumerate(bins):
        name = f"BLeg{bi}"
        for i in ids:
            owners[i] = name
    for g in owners:
        counts[g] += 1
    log(f"  verts {dict(counts)}")

    faces_by, vert_faces, face_owner = assign_faces(mesh, owners)
    limb_group = {f"BLeg{i}": {f"BLeg{i}"} for i in range(6)}
    expand_joints(mesh, faces_by, vert_faces, face_owner, [f"BLeg{i}" for i in range(6)], limb_group, {"Hip"})

    hip_p = mean_pt(pts, range(n), lambda p: p.z > h * 0.35 and (p.x * p.x + p.y * p.y) ** 0.5 < 0.2) or Vector((0, 0, h * 0.45))
    root = bpy.data.objects.new("Crab", None)
    bpy.context.scene.collection.objects.link(root)
    hip = make_empty("Hip", root, hip_p)
    make_empty("Torso", hip, hip_p + Vector((0, 0, 0.08)))
    for bi, ids in enumerate(bins):
        jp = mean_pt(pts, ids) or Vector((0.3, 0, 0.12))
        make_empty(f"BLeg{bi}", hip, jp)
    parent_pieces(mesh, faces_by, "Crab")
    export_root(root, mesh, out)


def backup(src: Path, name: str) -> None:
    BACKUP.mkdir(parents=True, exist_ok=True)
    dest = BACKUP / name
    shutil.copy2(src, dest)
    log(f"backup {dest}")


def run() -> None:
    goblin = ROOT / "goblin.glb"
    crab = ROOT / "robotcrab.glb"
    devil = ROOT / "devilman.glb"
    backup(goblin, "goblin_source.glb")
    backup(crab, "robotcrab_source.glb")
    backup(devil, "devilman_source.glb")
    build_humanoid(goblin, OUT_DIR / "goblin.glb", "Goblin", 1.42)
    build_humanoid(devil, OUT_DIR / "devil.glb", "Devil", 1.88)
    build_crab(crab, OUT_DIR / "crab.glb")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        log(f"FAIL {exc}")
        raise
    sys.exit(0)
