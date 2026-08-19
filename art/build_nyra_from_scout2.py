"""Import scout2.glb, split limbs onto N* joints, export nyra.glb.

Cloak, quiver, and bow stay on the torso so the hooded cape does not
open at the shoulder. Legs and the free right arm can swing.
"""
from __future__ import annotations

import shutil
import sys
from collections import defaultdict, deque
from pathlib import Path

import bpy
from mathutils import Euler, Vector

SRC = Path(r"C:\Users\PC\Downloads\scout2.glb")
OUT = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\public\models\nyra.glb")
BACKUP = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\art\backup\scout2_source.glb")
PREV = Path(r"C:\Users\PC\Documents\GITHUBprojects\RPG GROK\art\backup\nyra_scout1.glb")
HEIGHT = 1.68
ELBOW_R = 0.95
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
    if OUT.exists() and not PREV.exists():
        shutil.copy2(OUT, PREV)
        log(f"prev {PREV}")

    log("import")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH" and len(o.data.vertices) > 100)
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
        # Source faces +X. Game wants Blender -Y; left-hand bow becomes +X.
        w = Vector((w.y, -w.x, w.z))
        vert.co = w
        pts[i] = w
    mesh.matrix_world = Euler((0, 0, 0), "XYZ").to_matrix().to_4x4()
    mesh.location = (0.0, 0.0, 0.0)
    mesh.rotation_euler = (0.0, 0.0, 0.0)
    mesh.scale = (1.0, 1.0, 1.0)
    mesh.data.update()
    mesh.name = "NyraMesh"
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

    def keep_leg(p: Vector, sign: float) -> bool:
        sx = p.x * sign
        # Boots stick forward of the shin; the old y > -0.22 cut left a
        # static toe on the hip that showed up from the side.
        if p.z < 0.42:
            return 0.00 < sx < 0.32 and -0.42 < p.y < 0.20
        return p.z < 0.86 and 0.00 < sx < 0.22 and -0.22 < p.y < 0.14

    leg_l = flood(
        pts,
        adj,
        lambda p: (p.z < 0.18 and p.x > 0.04 and p.y < 0.18)
        or (0.40 < p.z < 0.68 and p.x > 0.08 and p.y < 0.10),
        lambda p: keep_leg(p, 1.0),
    )
    leg_r = flood(
        pts,
        adj,
        lambda p: (p.z < 0.18 and p.x < -0.04 and p.y < 0.18)
        or (0.40 < p.z < 0.68 and p.x < -0.08 and p.y < 0.10),
        lambda p: keep_leg(p, -1.0),
    )
    for i, p in enumerate(pts):
        if i in leg_l or i in leg_r:
            continue
        if p.z < 0.32 and p.y < 0.08 and 0.03 < abs(p.x) < 0.34:
            if p.x > 0:
                leg_l.add(i)
            else:
                leg_r.add(i)
    log(f"flood legs L={len(leg_l)} R={len(leg_r)}")
    taken = leg_l | leg_r
    arm_r = (
        flood(
            pts,
            adj,
            lambda p: p.x < -0.18 and 0.78 < p.z < 1.28,
            lambda p: -0.32 < p.x < -0.08 and 0.58 < p.z < 1.40 and p.y < 0.14 and not (p.z > 1.22 and p.x > -0.16),
        )
        - taken
    )
    head = (
        flood(
            pts,
            adj,
            lambda p: p.z > 1.40 and abs(p.x) < 0.14 and p.y < 0.08,
            lambda p: p.z > 1.24 and abs(p.x) < 0.24 and p.y < 0.20,
        )
        - taken
        - arm_r
    )
    log(f"flood armR={len(arm_r)} head={len(head)} legL={len(leg_l)} legR={len(leg_r)}")

    owners: list[str] = []
    counts: dict[str, int] = defaultdict(int)
    for i, p in enumerate(pts):
        if i in arm_r:
            g = "NForeR" if p.z < ELBOW_R else "NArmR"
        elif i in leg_l:
            g = "NShinL" if p.z < KNEE else "NLegL"
        elif i in leg_r:
            g = "NShinR" if p.z < KNEE else "NLegR"
        elif i in head or (p.z > 1.38 and abs(p.x) < 0.22 and p.y < 0.18):
            g = "NHead"
        elif p.y > 0.08 or p.z > 1.02:
            g = "NTorso"
        else:
            g = "NHip"
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
        "NArmR": {"NArmR", "NForeR"},
        "NForeR": {"NArmR", "NForeR"},
        "NLegL": {"NLegL", "NShinL"},
        "NShinL": {"NLegL", "NShinL"},
        "NLegR": {"NLegR", "NShinR"},
        "NShinR": {"NLegR", "NShinR"},
    }

    def expand(joint: str) -> None:
        allowed = limb_group.get(joint, {joint})
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

    for joint in ("NArmR", "NForeR", "NLegL", "NShinL", "NLegR", "NShinR"):
        expand(joint)

    def inward_shoulder(ids: set[int], fallback: Vector) -> Vector:
        band = [i for i in ids if 1.18 <= pts[i].z <= 1.34]
        if not band:
            band = list(ids)
        band.sort(key=lambda i: abs(pts[i].x))
        take = band[: max(1, len(band) // 5)]
        return mean_pt(pts, take) or fallback

    hip_p = mean_pt(pts, range(n), lambda p: 0.78 <= p.z <= 0.96 and abs(p.x) < 0.16) or Vector((0.0, 0.04, 0.88))
    torso_p = mean_pt(pts, range(n), lambda p: 1.08 <= p.z <= 1.22 and abs(p.x) < 0.18) or Vector((0.0, 0.04, 1.14))
    head_p = mean_pt(pts, head) or Vector((0.0, 0.02, 1.44))
    arm_r_p = inward_shoulder(arm_r, Vector((-0.20, 0.02, 1.26)))
    arm_l_p = Vector((0.20, 0.02, 1.26))
    fore_r_p = mean_pt(pts, arm_r, lambda p: abs(p.z - ELBOW_R) < 0.08) or Vector((-0.32, -0.04, ELBOW_R))
    fore_l_p = Vector((0.32, -0.04, 0.95))
    weap_p = fore_r_p + Vector((0.0, -0.08, -0.04))
    leg_l_p = mean_pt(pts, leg_l, lambda p: 0.72 <= p.z <= 0.86) or Vector((0.10, 0.02, 0.82))
    leg_r_p = mean_pt(pts, leg_r, lambda p: 0.72 <= p.z <= 0.86) or Vector((-0.10, 0.02, 0.82))
    shin_l_p = mean_pt(pts, leg_l, lambda p: abs(p.z - KNEE) < 0.08) or Vector((0.10, 0.04, KNEE))
    shin_r_p = mean_pt(pts, leg_r, lambda p: abs(p.z - KNEE) < 0.08) or Vector((-0.10, 0.04, KNEE))
    log(
        f"joints hip={tuple(round(c, 2) for c in hip_p)} "
        f"armR={tuple(round(c, 2) for c in arm_r_p)} head={tuple(round(c, 2) for c in head_p)}"
    )

    root = bpy.data.objects.new("Nyra", None)
    bpy.context.scene.collection.objects.link(root)
    hip = make_empty("NHip", root, hip_p)
    torso = make_empty("NTorso", hip, torso_p)
    make_empty("NHead", torso, head_p)
    arml = make_empty("NArmL", torso, arm_l_p)
    armr = make_empty("NArmR", torso, arm_r_p)
    make_empty("NForeL", arml, fore_l_p)
    forer = make_empty("NForeR", armr, fore_r_p)
    make_empty("NWeapon", forer, weap_p)
    legl = make_empty("NLegL", hip, leg_l_p)
    legr = make_empty("NLegR", hip, leg_r_p)
    make_empty("NShinL", legl, shin_l_p)
    make_empty("NShinR", legr, shin_r_p)

    for joint, faces in faces_by.items():
        if not faces:
            continue
        obj = extract_mesh(mesh, sorted(faces), f"Nyra_{joint}")
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
