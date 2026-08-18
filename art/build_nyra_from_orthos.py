"""Build Nyra from the four ortho sheets via visual hull + projected albedo.

Rodin is out of trial credits; this reconstructs the silhouette from the
same images and paints it with view-weighted colors from those sheets.
"""
from __future__ import annotations

import math

import bpy
import numpy as np
from mathutils import Vector

H = 1.68
W = H * 682.0 / 1024.0
NX, NY, NZ = 96, 88, 160
REF = r"C:/Users/PC/Documents/GITHUBprojects/RPG GROK/art/refs"


def rgba(name: str) -> np.ndarray:
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.load(f"{REF}/{name}")
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    return px


def silhouette(px: np.ndarray) -> np.ndarray:
    # Ignore anti-aliased paper halo; keep only clearly inked pixels.
    mx = px[:, :, :3].max(axis=2)
    sil = mx < 0.94
    return erode2d(sil, 1)


def erode2d(sil: np.ndarray, steps: int) -> np.ndarray:
    d = sil.copy()
    for _ in range(steps):
        p = np.pad(d, 1, constant_values=False)
        d = (
            p[1:-1, 1:-1]
            & p[:-2, 1:-1]
            & p[2:, 1:-1]
            & p[1:-1, :-2]
            & p[1:-1, 2:]
        )
    return d


def sample_bool(sil: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    h, w = sil.shape
    valid = (u >= 0.0) & (u <= 1.0) & (v >= 0.0) & (v <= 1.0)
    ix = np.clip((u * (w - 1)).astype(np.int32), 0, w - 1)
    iy = np.clip((v * (h - 1)).astype(np.int32), 0, h - 1)
    out = np.zeros(u.shape, dtype=bool)
    out[valid] = sil[iy[valid], ix[valid]]
    return out


def sample_rgb(px: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    h, w = px.shape[:2]
    valid = (u >= 0.0) & (u <= 1.0) & (v >= 0.0) & (v <= 1.0)
    ix = np.clip((u * (w - 1)).astype(np.int32), 0, w - 1)
    iy = np.clip((v * (h - 1)).astype(np.int32), 0, h - 1)
    out = np.ones(u.shape + (3,), dtype=np.float32)
    out[valid] = px[iy[valid], ix[valid], :3]
    return out


def sample_rgb_ink(px: np.ndarray, u: np.ndarray, v: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rgb = sample_rgb(px, u, v)
    ink = rgb.max(axis=-1) < 0.92
    return rgb, ink


def dilate(occ: np.ndarray) -> np.ndarray:
    d = occ.copy()
    d[1:, :, :] |= occ[:-1, :, :]
    d[:-1, :, :] |= occ[1:, :, :]
    d[:, 1:, :] |= occ[:, :-1, :]
    d[:, :-1, :] |= occ[:, 1:, :]
    d[:, :, 1:] |= occ[:, :, :-1]
    d[:, :, :-1] |= occ[:, :, 1:]
    return d


def occupancy() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    front = rgba("nyra_front.png")
    back = rgba("nyra_back.png")
    left = rgba("nyra_left.png")
    right = rgba("nyra_right.png")
    sf, sb, sl, sr = map(silhouette, (front, back, left, right))

    xs = np.linspace(-W * 0.52, W * 0.52, NX, dtype=np.float32)
    ys = np.linspace(-W * 0.48, W * 0.48, NY, dtype=np.float32)
    zs = np.linspace(0.01, H * 0.99, NZ, dtype=np.float32)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")

    v = Z / H
    u_f = (X + W * 0.5) / W
    u_b = (W * 0.5 - X) / W
    u_l = (Y + W * 0.5) / W
    u_r = (W * 0.5 - Y) / W

    ink_f = sample_bool(sf, u_f, v)
    ink_b = sample_bool(sb, u_b, v)
    ink_l = sample_bool(sl, u_l, v)
    ink_r = sample_bool(sr, u_r, v)
    votes = ink_f.astype(np.uint8) + ink_b.astype(np.uint8) + ink_l.astype(np.uint8) + ink_r.astype(np.uint8)
    # Body needs 3 views. The head is thinner in the side sheets, so
    # requiring all four punches holes through the face.
    head = Z > (H * 0.72)
    occ = ink_f & (((~head) & (votes >= 3)) | (head & (votes >= 2)))
    print("occupied", int(occ.sum()), "of", occ.size)
    return occ, xs, ys, zs


def surface_cubes(occ: np.ndarray, xs: np.ndarray, ys: np.ndarray, zs: np.ndarray) -> bpy.types.Object:
    pad = np.pad(occ, 1, mode="constant")
    surface = occ & ~(
        pad[2:, 1:-1, 1:-1]
        & pad[:-2, 1:-1, 1:-1]
        & pad[1:-1, 2:, 1:-1]
        & pad[1:-1, :-2, 1:-1]
        & pad[1:-1, 1:-1, 2:]
        & pad[1:-1, 1:-1, :-2]
    )
    idx = np.argwhere(surface)
    print("surface voxels", len(idx))
    dx = float(xs[1] - xs[0]) * 0.52
    dy = float(ys[1] - ys[0]) * 0.52
    dz = float(zs[1] - zs[0]) * 0.52
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    corners = np.array(
        [
            [-1, -1, -1],
            [1, -1, -1],
            [1, 1, -1],
            [-1, 1, -1],
            [-1, -1, 1],
            [1, -1, 1],
            [1, 1, 1],
            [-1, 1, 1],
        ],
        dtype=np.float32,
    )
    quads = (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (2, 6, 7, 3),
        (0, 3, 7, 4),
        (1, 5, 6, 2),
    )
    for i, j, k in idx:
        base = len(verts)
        cx, cy, cz = float(xs[i]), float(ys[j]), float(zs[k])
        for c in corners:
            verts.append((cx + c[0] * dx, cy + c[1] * dy, cz + c[2] * dz))
        for q in quads:
            faces.append((base + q[0], base + q[1], base + q[2], base + q[3]))

    old = bpy.data.objects.get("NyraHull")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    mesh = bpy.data.meshes.new("NyraHull")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("NyraHull", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def drop_islands(obj: bpy.types.Object, min_verts: int) -> None:
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    seen: set[int] = set()
    islands: list[list] = []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        island = []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.link_edges:
                oth = e.other_vert(cur)
                if oth.index not in seen:
                    seen.add(oth.index)
                    stack.append(oth)
        islands.append(island)
    islands.sort(key=len, reverse=True)
    removed = 0
    for isl in islands[1:]:
        if len(isl) < min_verts:
            removed += len(isl)
            for v in isl:
                bm.verts.remove(v)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    print("dropped island verts", removed, "islands", len(islands))


def remesh_smooth(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new("Vox", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = 0.015
    bpy.ops.object.modifier_apply(modifier="Vox")
    sm = obj.modifiers.new("Smooth", "SMOOTH")
    sm.factor = 0.55
    sm.iterations = 8
    bpy.ops.object.modifier_apply(modifier="Smooth")
    bpy.ops.object.shade_smooth()
    drop_islands(obj, min_verts=500)
    # Sit on the ground.
    zs = [v.co.z for v in obj.data.vertices]
    dz = min(zs)
    for v in obj.data.vertices:
        v.co.z -= dz
    obj.data.update()
    print("hull verts", len(obj.data.vertices), "z", round(min(v.co.z for v in obj.data.vertices), 3), round(max(v.co.z for v in obj.data.vertices), 3))


def paint_vertex_colors(obj: bpy.types.Object) -> None:
    front = rgba("nyra_front.png")
    back = rgba("nyra_back.png")
    left = rgba("nyra_left.png")
    right = rgba("nyra_right.png")
    mesh = obj.data
    nverts = len(mesh.vertices)
    pos = np.array([v.co[:] for v in mesh.vertices], dtype=np.float32)
    # Face-weighted vertex normals.
    nrm = np.zeros((nverts, 3), dtype=np.float32)
    mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        n = np.array(tri.normal[:], dtype=np.float32)
        for vi in tri.vertices:
            nrm[vi] += n
    lens = np.linalg.norm(nrm, axis=1, keepdims=True)
    lens[lens < 1e-8] = 1.0
    nrm /= lens

    x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
    v = np.clip(z / H, 0.0, 1.0)
    cf, inf = sample_rgb_ink(front, (x + W * 0.5) / W, v)
    cb, inb = sample_rgb_ink(back, (W * 0.5 - x) / W, v)
    cl, inl = sample_rgb_ink(left, (y + W * 0.5) / W, v)
    cr, inr = sample_rgb_ink(right, (W * 0.5 - y) / W, v)
    wf = np.clip(-nrm[:, 1], 0, None) * inf
    wb = np.clip(nrm[:, 1], 0, None) * inb
    wl = np.clip(nrm[:, 0], 0, None) * inl
    wr = np.clip(-nrm[:, 0], 0, None) * inr
    wt = wf + wb + wl + wr
    fallback = inf | inb | inl | inr
    # If the normal-weighted views were paper, fall back to any inked view.
    wf2 = inf.astype(np.float32)
    wb2 = inb.astype(np.float32)
    wl2 = inl.astype(np.float32)
    wr2 = inr.astype(np.float32)
    thin = wt < 1e-5
    wf[thin] = wf2[thin]
    wb[thin] = wb2[thin]
    wl[thin] = wl2[thin]
    wr[thin] = wr2[thin]
    wt = wf + wb + wl + wr
    wt[wt < 1e-5] = 1.0
    col = (cf * wf[:, None] + cb * wb[:, None] + cl * wl[:, None] + cr * wr[:, None]) / wt[:, None]
    col = np.clip(col, 0.0, 1.0)

    if "Col" in mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes["Col"])
    attr = mesh.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="POINT")
    for i, rgb in enumerate(col):
        attr.data[i].color = (float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0)

    # Front-projected UV so the albedo also exists as a map.
    uv = mesh.uv_layers.new(name="UVMap") if not mesh.uv_layers else mesh.uv_layers.active
    for loop in mesh.loops:
        p = mesh.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((p.x + W * 0.5) / W, p.z / H)


def make_material(obj: bpy.types.Object) -> None:
    mat = bpy.data.materials.get("NyraOrthoMat") or bpy.data.materials.new("NyraOrthoMat")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Specular IOR Level"].default_value = 0.18
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def parent_to_nyra(obj: bpy.types.Object) -> None:
    root = bpy.data.objects["Nyra"]
    obj.parent = root
    obj.matrix_parent_inverse = root.matrix_world.inverted()
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_render = False


def run() -> None:
    occ, xs, ys, zs = occupancy()
    obj = surface_cubes(occ, xs, ys, zs)
    remesh_smooth(obj)
    paint_vertex_colors(obj)
    make_material(obj)
    ht = max(v.co.z for v in obj.data.vertices)
    s = 1.65 / max(0.001, ht)
    obj.scale = (s, s, s)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    parent_to_nyra(obj)
    print("NyraHull ready", tuple(round(x, 3) for x in obj.dimensions))


run()
