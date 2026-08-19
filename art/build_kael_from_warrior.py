"""Import warrior.glb, split limbs onto game joints, export kael.glb."""
from __future__ import annotations

import shutil
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Euler, Vector

SRC = Path(r"C:\Users\PC\Downloads\warrior.glb")
OUT = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\public\models\kael.glb")
BACKUP = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\art\backup\warrior_source.glb")
HEIGHT = 1.72
ELBOW_L = 0.95
ELBOW_R = 0.92
KNEE = 0.48
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
    if SRC.exists():
        BACKUP.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SRC, BACKUP)
        log(f"backup {BACKUP}")

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
    mesh.name = "KaelMesh"
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

    # Legs first so the hanging sword cannot claim a boot.
    leg_l = flood(
        pts,
        adj,
        lambda p: p.z < 0.18 and p.x > 0.10 and p.y > -0.08,
        lambda p: p.z < 0.82 and p.x > 0.06 and p.y > -0.14,
    )
    leg_r = flood(
        pts,
        adj,
        lambda p: p.z < 0.18 and p.x < -0.10 and p.y > -0.08,
        lambda p: p.z < 0.82 and p.x < -0.06 and p.y > -0.14,
    )
    taken = leg_l | leg_r
    weap = (
        flood(
            pts,
            adj,
            lambda p: p.y < -0.22 and p.x < 0.0 and p.z < 1.0,
            lambda p: p.z < 1.10 and p.x < 0.06 and (p.y < -0.06 or (p.x < -0.22 and p.z < 0.95)),
        )
        - taken
    )
    taken |= weap
    arm_l = (
        flood(
            pts,
            adj,
            lambda p: p.x > 0.32 and 0.7 < p.z < 1.35,
            lambda p: p.x > 0.16 and 0.48 < p.z < 1.48 and not (p.z > 1.15 and p.x < 0.24),
        )
        - taken
    )
    arm_r = (
        flood(
            pts,
            adj,
            lambda p: p.x < -0.32 and 0.55 < p.z < 1.35,
            lambda p: p.x < -0.16 and 0.35 < p.z < 1.48 and not (p.z > 1.15 and p.x > -0.24),
        )
        - taken
    )
    head = (
        flood(
            pts,
            adj,
            lambda p: p.z > 1.48 and abs(p.x) < 0.22,
            lambda p: p.z > 1.32 and abs(p.x) < 0.32,
        )
        - taken
        - arm_l
        - arm_r
    )
    log(
        f"flood armL={len(arm_l)} armR={len(arm_r)} weap={len(weap)} "
        f"head={len(head)} legL={len(leg_l)} legR={len(leg_r)}"
    )

    owners: list[str] = []
    counts: dict[str, int] = defaultdict(int)
    for i, p in enumerate(pts):
        if i in weap or (i in arm_r and (p.y < -0.12 or p.z < 0.70)):
            g = "Weapon"
        elif i in arm_l:
            g = "ForeL" if p.z < ELBOW_L else "ArmL"
        elif i in arm_r:
            g = "ForeR" if p.z < ELBOW_R else "ArmR"
        elif i in leg_l:
            g = "ShinL" if p.z < KNEE else "LegL"
        elif i in leg_r:
            g = "ShinR" if p.z < KNEE else "LegR"
        elif i in head or p.z > 1.42:
            g = "Head"
        elif p.y > 0.10 or p.z > 1.06:
            # Cape stays on the torso so a hip twist does not open a belt seam.
            g = "Torso"
        else:
            g = "Hip"
        owners.append(g)
        counts[g] += 1
    log(f"vert counts {dict(counts)}")

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

    limb_group = {
        "ArmL": {"ArmL", "ForeL"},
        "ForeL": {"ArmL", "ForeL"},
        "ArmR": {"ArmR", "ForeR", "Weapon"},
        "ForeR": {"ArmR", "ForeR", "Weapon"},
        "Weapon": {"ArmR", "ForeR", "Weapon"},
        "LegL": {"LegL", "ShinL"},
        "ShinL": {"LegL", "ShinL"},
        "LegR": {"LegR", "ShinR"},
        "ShinR": {"LegR", "ShinR"},
    }
    core = {"Hip", "Torso", "Head"}

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

    for joint in ("ArmL", "ForeL", "ArmR", "ForeR", "Weapon", "LegL", "ShinL", "LegR", "ShinR"):
        expand(joint)

    def inward_shoulder(ids: set[int], fallback: Vector) -> Vector:
        band = [i for i in ids if 1.18 <= pts[i].z <= 1.40]
        if not band:
            band = list(ids)
        band.sort(key=lambda i: abs(pts[i].x))
        take = band[: max(1, len(band) // 5)]
        return mean_pt(pts, take) or fallback

    hip_p = mean_pt(pts, range(n), lambda p: 0.82 <= p.z <= 1.02 and abs(p.x) < 0.20) or Vector((0.0, 0.08, 0.92))
    torso_p = mean_pt(pts, range(n), lambda p: 1.14 <= p.z <= 1.28 and abs(p.x) < 0.22) or Vector((0.0, 0.06, 1.20))
    head_p = mean_pt(pts, head) or Vector((0.0, 0.04, 1.52))
    arm_l_p = inward_shoulder(arm_l, Vector((0.28, 0.04, 1.30)))
    arm_r_p = inward_shoulder(arm_r, Vector((-0.28, 0.04, 1.30)))
    fore_l_p = mean_pt(pts, arm_l, lambda p: abs(p.z - ELBOW_L) < 0.08) or Vector((0.42, 0.0, ELBOW_L))
    fore_r_p = mean_pt(pts, arm_r, lambda p: abs(p.z - ELBOW_R) < 0.08) or Vector((-0.42, 0.0, ELBOW_R))
    weap_p = mean_pt(pts, weap) or (fore_r_p + Vector((0.0, -0.18, -0.18)))
    leg_l_p = mean_pt(pts, leg_l, lambda p: 0.78 <= p.z <= 0.92) or Vector((0.16, 0.04, 0.88))
    leg_r_p = mean_pt(pts, leg_r, lambda p: 0.78 <= p.z <= 0.92) or Vector((-0.16, 0.04, 0.88))
    shin_l_p = mean_pt(pts, leg_l, lambda p: abs(p.z - KNEE) < 0.08) or Vector((0.18, 0.06, KNEE))
    shin_r_p = mean_pt(pts, leg_r, lambda p: abs(p.z - KNEE) < 0.08) or Vector((-0.18, 0.06, KNEE))
    log(
        f"joints hip={tuple(round(c, 2) for c in hip_p)} "
        f"armL={tuple(round(c, 2) for c in arm_l_p)} armR={tuple(round(c, 2) for c in arm_r_p)}"
    )

    root = bpy.data.objects.new("Kael", None)
    bpy.context.scene.collection.objects.link(root)
    hip = make_empty("Hip", root, hip_p)
    torso = make_empty("Torso", hip, torso_p)
    make_empty("Head", torso, head_p)
    arml = make_empty("ArmL", torso, arm_l_p)
    armr = make_empty("ArmR", torso, arm_r_p)
    make_empty("ForeL", arml, fore_l_p)
    forer = make_empty("ForeR", armr, fore_r_p)
    make_empty("Weapon", forer, weap_p)
    legl = make_empty("LegL", hip, leg_l_p)
    legr = make_empty("LegR", hip, leg_r_p)
    make_empty("ShinL", legl, shin_l_p)
    make_empty("ShinR", legr, shin_r_p)

    for joint, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(mesh, sorted(faces), f"Kael_{joint}")
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
    OUT.parent.mkdir(parents=True, exist_ok=True)
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
