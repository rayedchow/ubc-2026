"""Faceted modelling primitives and an orthographic pixel renderer.

Artists work in projected pixel units. Ground depth and height are unscaled
before export so these are solid, proportionate Y-up models in a 3D editor.
"""

from collections import defaultdict
from functools import lru_cache
from math import cos, pi, sin, sqrt
import json
import struct

import numpy as np
from PIL import Image

S = 0.60
C = sqrt(1 - S * S)
UNIT = 0.08
INK = "#302b42"


@lru_cache(None)
def channels(color):
    return np.array(list(bytes.fromhex(color.lstrip("#"))), dtype=float)


def blend(a, b, t):
    return "#" + "".join(
        f"{n:02x}"
        for n in (channels(a) * (1 - t) + channels(b) * t).round().astype(int)
    )


class Scene:
    def __init__(self):
        self.parts = defaultdict(list)
        self.part = "Structure"

    def group(self, name):
        self.part = name

    def solid(self, verts, faces, color):
        points = np.array(verts, dtype=float)
        # Coordinates in glTF's right-handed metric space, before global scale.
        metric = points[:, [0, 2, 1]] / [1, C, S]
        middle = metric.mean(axis=0)
        for indices in faces:
            idx = list(indices)
            vertices = metric[idx]
            normal = np.cross(vertices[1] - vertices[0], vertices[2] - vertices[0])
            norm = np.linalg.norm(normal)
            if norm < 0.00001:
                continue
            normal /= norm
            if np.dot(normal, vertices.mean(axis=0) - middle) < 0:
                idx.reverse()
                normal *= -1
            # Five tonal steps, with the brightest faces facing the skylight.
            light = np.dot(normal, [-0.38, 0.87, 0.31])
            tone = round(np.clip(light, -1, 1) * 5) / 5
            base = channels(color)
            shade = np.clip(base * (0.83 + 0.20 * tone) + max(0, tone) * 7, 0, 255)
            self.parts[self.part].append(
                (points[idx], normal, shade.round().astype("uint8"))
            )

    def rings(self, lower, upper, color):
        n = len(lower)
        faces = [list(range(n)), list(range(n, 2 * n))]
        faces += [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        self.solid(lower + upper, faces, color)

    def box(self, x, y, z, w, d, h, color):
        corners = [(x, y), (x + w, y), (x + w, y + d), (x, y + d)]
        self.rings(
            [(a, b, z) for a, b in corners], [(a, b, z + h) for a, b in corners], color
        )

    def profile(self, points, y, depth, color):
        """Extrude a convex silhouette on a façade."""
        self.rings(
            [(x, y, z) for x, z in points],
            [(x, y + depth, z) for x, z in points],
            color,
        )

    def slab(self, points, z, height, color):
        self.rings(
            [(x, y, z) for x, y in points],
            [(x, y, z + height) for x, y in points],
            color,
        )

    def taper(self, x, y, z, w, d, height, top_w, top_d, color):
        def rect(w, d, z):
            return [
                (x - w / 2, y - d / 2, z),
                (x + w / 2, y - d / 2, z),
                (x + w / 2, y + d / 2, z),
                (x - w / 2, y + d / 2, z),
            ]

        self.rings(rect(w, d, z), rect(top_w, top_d, z + height), color)

    def drum(self, x, y, z, rx, ry, height, color, sides=8, top=1):
        def ring(z, scale):
            return [
                (
                    x + rx * scale * cos((i + 0.5) * 2 * pi / sides),
                    y + ry * scale * sin((i + 0.5) * 2 * pi / sides),
                    z,
                )
                for i in range(sides)
            ]

        self.rings(ring(z, 1), ring(z + height, top), color)


def triangles(scene, groups=None):
    for name, faces in scene.parts.items():
        if groups and name not in groups:
            continue
        for face, normal, color in faces:
            for i in range(1, len(face) - 1):
                yield face[[0, i, i + 1]], normal, color, name


def covered(triangle, width, height):
    """Return a small pixel window and barycentric weights at pixel centers."""
    a, b, c = triangle
    left, top = np.maximum(0, np.floor(triangle.min(axis=0))).astype(int)
    right, bottom = np.minimum([width, height], np.ceil(triangle.max(axis=0))).astype(
        int
    )
    if right <= left or bottom <= top:
        return
    den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(den) < 1e-8:
        return
    y, x = np.ogrid[top:bottom, left:right]
    x = x + 0.500037 - c[0]
    y = y + 0.500019 - c[1]
    u = ((b[1] - c[1]) * x + (c[0] - b[0]) * y) / den
    v = ((c[1] - a[1]) * x + (a[0] - c[0]) * y) / den
    w = 1 - u - v
    return (
        np.s_[top:bottom, left:right],
        (u >= -1e-7) & (v >= -1e-7) & (w >= -1e-7),
        u,
        v,
        w,
    )


def render(scene, size, scale=1, offset=(0, 0), groups=None, ownership=None):
    width, height = size
    tris = list(triangles(scene, groups))
    # Depth from a parallel upper-left light. The same pass shadows furniture,
    # sill recesses and projecting eaves without painting a shadow onto glass.
    lamp = np.array([0.38, -0.48])

    def light_xy(points):
        return points[:, :2] + points[:, 2, None] * lamp

    limits = np.concatenate([light_xy(p) for p, _, _, _ in tris])
    lo = np.floor(limits.min(axis=0)) - 1
    sw, sh = np.ceil((limits.max(axis=0) - lo + 1) * 2).astype(int)
    shadow = np.full((sh, sw), -1000.0)
    for p, n, _, _ in tris:
        if n[1] <= 0:
            continue
        sample = covered((light_xy(p) - lo) * 2, sw, sh)
        if sample:
            sl, mask, u, v, w = sample
            z = u * p[0, 2] + v * p[1, 2] + w * p[2, 2]
            np.maximum(shadow[sl], z, out=shadow[sl], where=mask)

    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    depth = np.full((height, width), -1000.0)
    normals = np.zeros((height, width, 3))
    for p, normal, color, group in tris:
        if np.dot(normal, [0, S, C]) <= 0.00001:
            continue
        screen = (np.stack([p[:, 0], p[:, 1] - p[:, 2]], axis=1) - offset) * scale
        sample = covered(screen, width, height)
        if not sample:
            continue
        sl, mask, u, v, w = sample
        pos = u[:, :, None] * p[0] + v[:, :, None] * p[1] + w[:, :, None] * p[2]
        z = pos[:, :, 2]
        distance = pos[:, :, 1] + z
        mask &= distance >= depth[sl] - 1e-7
        if not np.any(mask):
            continue
        lx, ly = np.moveaxis(
            (pos[:, :, :2] + z[:, :, None] * lamp - lo) * 2, -1, 0
        ).astype(int)
        dim = shadow[np.clip(ly, 0, sh - 1), np.clip(lx, 0, sw - 1)] > z + 1.8
        inked = color * 0.73 + [7, 5, 13]
        rgba[sl][:, :, :3][mask] = np.where(dim[:, :, None], inked, color)[mask]
        rgba[sl][:, :, 3][mask] = 255
        if ownership is not None:
            pixels, group_ids = ownership
            pixels[sl][mask] = group_ids[group]
        depth[sl][mask] = distance[mask]
        normals[sl][mask] = normal
    # One pixel of pigmented outline on the near side of a discontinuity.
    edge = np.zeros((height, width), dtype=bool)
    crease = edge.copy()
    for axis, step in [(0, 1), (0, -1), (1, 1), (1, -1)]:
        adjacent = np.roll(depth, step, axis)
        difference = depth - adjacent
        difference[
            (0 if step == 1 else -1) if axis == 0 else slice(None),
            (0 if step == 1 else -1) if axis == 1 else slice(None),
        ] = 0
        edge |= difference > 6 / scale
        crease |= (difference > 0) & (
            np.sum(normals * np.roll(normals, step, axis), axis=2) < 0.50
        )
    base = rgba[:, :, :3].astype(float)
    rgba[:, :, :3] = np.where(
        edge[:, :, None],
        base * 0.35 + channels(INK) * 0.65,
        np.where(crease[:, :, None], base * 0.82 + channels(INK) * 0.18, base),
    )
    return Image.fromarray(rgba)


def oblique_frame(scene, degrees, scale):
    """Fit a rotated view once for both the beauty render and its ownership buffer."""
    angle = np.radians(degrees)
    a, b = np.cos(angle), np.sin(angle)
    rotation = np.array([[a, 0, b], [0, 1, 0], [-b, 0, a]])
    view = Scene()
    for name, faces in scene.parts.items():
        for points, normal, color in faces:
            metric = points[:, [0, 2, 1]] / [1, C, S]
            turned = metric @ rotation.T
            coords = turned[:, [0, 2, 1]] * [1, S, C]
            view.parts[name].append((coords, rotation @ normal, color))
    points = np.concatenate([p for faces in view.parts.values() for p, _, _ in faces])
    projected = np.column_stack((points[:, 0], points[:, 1] - points[:, 2]))
    low = np.floor(projected.min(axis=0)) - 2
    high = np.ceil(projected.max(axis=0)) + 2
    return view, tuple(np.ceil((high - low) * scale).astype(int)), low


def oblique(scene, degrees, scale=1):
    view, size, low = oblique_frame(scene, degrees, scale)
    return render(view, size, scale, low)


def write_glb(scene, path, origin):
    """One independently movable indexed mesh per named prop, one draw material."""
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def accessor(array, shape, component, target, bounds=False):
        while len(binary) % 4:
            binary.append(0)
        views.append(
            dict(
                buffer=0, byteOffset=len(binary), byteLength=array.nbytes, target=target
            )
        )
        binary.extend(array.tobytes())
        acc = dict(
            bufferView=len(views) - 1,
            componentType=component,
            count=len(array),
            type=shape,
        )
        if bounds:
            acc.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        accessors.append(acc)
        return len(accessors) - 1

    for name, faces in scene.parts.items():
        positions, normals, colors, indices = [], [], [], []
        for face, normal, color in faces:
            start = len(positions)
            positions.extend(face[:, [0, 2, 1]] / [1, C, S])
            normals.extend([normal] * len(face))
            srgb = color.astype(float) / 255
            linear = np.where(
                srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4
            )
            colors.extend([linear] * len(face))
            for i in range(1, len(face) - 1):
                indices.extend([start, start + i, start + i + 1])
        pos = np.array(positions) * UNIT
        pivot = (pos.max(axis=0) + pos.min(axis=0)) * 0.5
        pivot[1] = pos[:, 1].min()
        attributes = {
            "POSITION": accessor(
                (pos - pivot).astype("<f4"), "VEC3", 5126, 34962, True
            ),
            "NORMAL": accessor(np.array(normals, dtype="<f4"), "VEC3", 5126, 34962),
            "COLOR_0": accessor(np.array(colors, dtype="<f4"), "VEC3", 5126, 34962),
        }
        index = accessor(np.array(indices, dtype="<u4"), "SCALAR", 5125, 34963)
        meshes.append(
            dict(
                name=name,
                primitives=[dict(attributes=attributes, indices=index, material=0)],
            )
        )
        nodes.append(
            dict(
                name=name,
                mesh=len(meshes) - 1,
                translation=(pivot - np.array(origin) * UNIT).tolist(),
            )
        )

    document = dict(
        asset=dict(version="2.0", generator="Modélmon gym workshop"),
        scene=0,
        scenes=[dict(nodes=list(range(len(nodes))))],
        nodes=nodes,
        meshes=meshes,
        materials=[
            dict(
                name="Pixel palette",
                pbrMetallicRoughness=dict(metallicFactor=0, roughnessFactor=1),
                extensions={"KHR_materials_unlit": {}},
            )
        ],
        extensionsUsed=["KHR_materials_unlit"],
        buffers=[dict(byteLength=len(binary))],
        bufferViews=views,
        accessors=accessors,
    )
    metadata = json.dumps(document, separators=(",", ":")).encode()
    metadata += b" " * (-len(metadata) % 4)
    binary += bytes(-len(binary) % 4)
    with path.open("wb") as file:
        file.write(struct.pack("<4sII", b"glTF", 2, 28 + len(metadata) + len(binary)))
        file.write(struct.pack("<I4s", len(metadata), b"JSON") + metadata)
        file.write(struct.pack("<I4s", len(binary), b"BIN\0") + binary)
