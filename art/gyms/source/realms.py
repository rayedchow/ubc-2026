"""Bake the realm mockups from a catalog and a repeatable landscape seed."""

import argparse
import json
from functools import lru_cache
from math import cos, sin, pi
from pathlib import Path
from random import Random

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from buildings import (
    PALE,
    DARK,
    WOOD,
    OAK,
    CREAM,
    GOLD,
    WHITE,
    SLATE,
    BRICK,
    GLASS,
    TEAL,
    octagon,
)
from grounds import tree, flower
from mesh import C, S, Scene, blend, oblique, oblique_frame, render, triangles
from realm_halls import hall, hall_pair
from realm_relief import MEADOW, foothills, gym_terrace, lots_for, rear_ridge
from realm_regions import region_manifest
from rooms import (
    cabinet,
    interior,
    table,
    paper,
    fern,
    bookcase,
    back_window,
    circular_face,
)

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "web/public/realms"
CATALOG = json.loads((ROOT / "web/lib/realm-catalog.json").read_text())
SEEDS = [17, 42, 83]
# Terrain reads from the turf down through the cliff faces. Station fabrics
# repeat the roof colour indoors with two neighbouring hues.
TERRAIN = {
    "forge": ("#ffb14c", "#d65b38", "#833c56", ["#16785c", "#35b768", "#a8e361"]),
    "ledger": ("#84df56", "#ba8b45", "#3f8870", ["#107b5d", "#1ebc71", "#86e956"]),
    "counsel": ("#89d2a0", "#9573ba", "#584185", ["#923876", "#ec5d9d", "#ff9eb7"]),
}
STATION_FABRICS = {
    "forge": ("#f45e3b", "#f48938", "#e95052"),
    "ledger": ("#1cb78e", "#24c4a8", "#1aa4a7"),
    "counsel": ("#9a58d9", "#b458ca", "#8661d8"),
}


def stamp(dst, src, x, y, z=0, size=1, only=None, anchor=None):
    """Place a reusable mesh at the center of its base, in scene coordinates."""
    faces = [
        face
        for name, part in src.parts.items()
        if only is None or name in only
        for face in part
    ]
    p = np.concatenate([v for v, _, _ in faces])
    base = (
        np.array(anchor)
        if anchor is not None
        else np.array(
            [(p[:, 0].min() + p[:, 0].max()) / 2, p[:, 1].max(), p[:, 2].min()]
        )
    )
    dst.parts[dst.part].extend(
        ((v - base) * size + [x, y, z], n, c) for v, n, c in faces
    )


@lru_cache(None)
def kit_room(kit):
    return interior(kit)


def beam(s, x1, z1, x2, z2, y, depth, r, color):
    dx, dz = x2 - x1, z2 - z1
    length = (dx * dx + dz * dz) ** 0.5
    a, b = -dz * r / length, dx * r / length
    s.profile(
        [(x1 + a, z1 + b), (x2 + a, z2 + b), (x2 - a, z2 - b), (x1 - a, z1 - b)],
        y,
        depth,
        color,
    )


def arm(s, x, y, z, scale=1):
    rig = Scene()
    rig.drum(0, 0, 0, 8, 4.5, 2, DARK)
    rig.drum(0, 0, 2, 5, 3.4, 3, GOLD, 8, 0.8)
    for x1, z1, x2, z2 in [(0, 5, -6, 16), (-6, 16, 5, 26), (5, 26, 14, 21)]:
        beam(rig, x1, z1, x2, z2, -1.3, 2.6, 2.2, "#ffb524")
        circular_face(rig, x1, 1.4, z1, 2.7, 2.7, DARK)
        circular_face(rig, x1, 2.3, z1, 1.4, 1.4, GLASS)
    for dx in [-1, 1]:
        beam(rig, 14, 21, 14 + dx * 3, 18, 0, 1.7, 0.9, SLATE)
        beam(rig, 14 + dx * 3, 18, 14 + dx * 2.5, 15, 0, 1.7, 0.7, DARK)
    stamp(s, rig, x, y, z, scale, anchor=[0, 0, 0])


def realm_scene(realm, seed, joins=()):
    kind, realm_id = realm["kit"], realm["id"]
    rng = Random(f"{seed}/{realm_id}/coast")
    s = Scene()
    turf, rock, shade, leaves = TERRAIN[kind]
    n = 32
    ring = []
    phase = rng.uniform(0, 2 * pi)
    for i in range(n):
        a = i * 2 * pi / n
        r = 0.94 + 0.085 * cos(a * 3 + phase) + rng.uniform(-0.065, 0.065)
        ring.append((113 * r * cos(a), 60 * r * sin(a)))
    # Neighbours use the same vertices in opposite order along an inland border.
    inland = {}
    for indices, points, border_color in joins:
        for i, point in zip(indices, points, strict=True):
            ring[i] = point
        for i in indices[:-1]:
            inland[i] = border_color

    for i, (x, y) in enumerate(ring):
        xx, yy = ring[(i + 1) % n]
        wedge = [(0, 0), (x, y), (xx, yy)]
        s.slab(wedge, -9, 8, blend(shade, rock, rng.uniform(0.02, 0.27)))
        s.slab(wedge, -1, 8, blend(rock, turf, rng.uniform(0.01, 0.12)))
        if i in inland:
            # Keep a single level surface as grass, clay and woodland meet.
            edge = np.array([(x, y), (xx, yy)])
            s.slab([(0, 0), *(edge * 0.76)], 7, 2.3, turf)
            for inner, outer, tint in [
                (0.76, 0.85, 0.2),
                (0.85, 0.93, 0.5),
                (0.93, 1, 0.85),
            ]:
                a, b = edge * inner
                c, d = edge * outer
                s.slab([a, c, d, b], 7, 2.3, blend(turf, inland[i], tint))
        else:
            s.slab(wedge, 7, 2.3, turf)
        # Exposed strata and a few detached rocks on the coast.
        if i < n // 2 and i % 3 == 1:
            cx, cy = (x + xx) / 2, (y + yy) / 2
            radius = rng.uniform(3, 6)
            if i not in inland:
                s.drum(cx * 1.05, cy * 1.06, -8, radius, 2.4, 4, rock, 6, 0.68)
    ridge_x, ridge_y, ridge_z = rear_ridge(s, kind, realm_id, seed, turf, rock, shade)
    foothills(s, kind, realm_id, seed, turf, rock, shade)
    lots = lots_for(kind, realm_id, seed)
    for i, lot in enumerate(lots):
        gym_terrace(s, lot, turf, rock, shade, Random(f"{seed}/{realm_id}/strata/{i}"))
    # Landmarks and vegetation occupy the high and low ground around the gym lots.
    if kind == "forge":
        for x, y, r, h in [
            (-73, -19, 16, 16),
            (-59, -33, 14, 23),
            (37, -33, 11, 14),
            (75, 8, 9, 11),
        ]:
            h += rng.randint(-3, 4)
            s.drum(x, y, 9.3, r, r * 0.62, h * 0.56, rock, 7, 0.89)
            s.drum(
                x, y, 9.3 + h * 0.56, r * 0.89, r * 0.55, h * 0.2, "#ffd35d", 7, 0.94
            )
            s.drum(
                x, y, 9.3 + h * 0.76, r * 0.84, r * 0.52, h * 0.24, "#e47c42", 7, 0.73
            )
        for i in range(5):
            s.box(-66 + i * 3, 29, 9.4, 2.2, 5, 1, "#71636a")
        s.box(-67, 30, 10.4, 16, 0.7, 0.55, SLATE)
        s.box(-67, 33, 10.4, 16, 0.7, 0.55, SLATE)
    elif kind == "counsel":
        for xx, yy in [(-88, 5), (55, -31), (-56, 30)]:
            s.drum(xx, yy, 9.3, 7.7, 4.7, 3.3, "#ac8cbd", 7, 0.79)
            s.drum(xx - 1, yy, 12.6, 4.6, 3, 3, "#e7bdce", 7, 0.48)
    else:
        for j in range(4):
            s.box(-68 + j * 5.1, 24 + j * 0.4, 9.5, 4.5, 10, 1.8, "#b99e24")
            for stalk in range(4):
                s.drum(
                    -66 + j * 5.1,
                    25.5 + j * 0.4 + stalk * 2.5,
                    11.3,
                    1.3,
                    0.8,
                    2.7,
                    "#ffcc3a",
                    5,
                    0.3,
                )
    # Coarse and fine vegetation stay clear of the two gym footprints.
    for _ in range(95):
        x, y = rng.uniform(-100, 100), rng.uniform(-50, 50)
        if (x / 102) ** 2 + (y / 50) ** 2 < 0.83:
            s.slab(
                [
                    (x, y),
                    (x + 1, y - 1),
                    (x + 3, y),
                    (x + 4, y - 0.5),
                    (x + 3, y + 0.6),
                ],
                9.31,
                0.15,
                blend(turf, leaves[0], 0.25),
            )
    for x, y in [
        (-88, -8),
        (-80, 15),
        (-55, -34),
        (-32, -39),
        (28, -38),
        (69, -24),
        (86, -5),
        (78, 24),
        (-70, 33),
        (-80, -19),
        (-17, -40),
        (58, -30),
        (82, 10),
    ]:
        x += rng.uniform(-4, 4)
        y += rng.uniform(-3, 3)
        if any(
            abs(x - lot.x) < 50 * lot.scale + 5
            and lot.y - 52 * lot.scale - 4 < y < lot.y + 3
            for lot in lots
        ):
            continue
        if ((x - ridge_x) / 30) ** 2 + ((y - ridge_y) / 16) ** 2 < 1:
            continue
        if kind == "forge" and x > 55:
            for j in range(3):
                s.drum(
                    x + j * 2,
                    y + j % 2,
                    9,
                    4 - j * 0.7,
                    3 - j * 0.5,
                    8 + j * 2,
                    blend(rock, "#ffe035", j * 0.18),
                    6,
                    0.38,
                )
        else:
            sapling = Scene()
            tree(sapling, 0, 0, rng.uniform(0.57, 0.92), leaves, kind == "forge")
            stamp(s, sapling, x, y, 9, anchor=[0, 0, 0])

    # A connected path leads from both training halls to the south gate.
    for x0, y0, x1, y1 in [(-49, 18, 53, 23), (-4, 21, 4, 47)]:
        s.box(x0, y0, 9.34, x1 - x0, y1 - y0, 0.24, "#ffe4a0")
    for i, (lot, (family, roof)) in enumerate(
        zip(lots, hall_pair(kind, realm_id, seed), strict=True)
    ):
        s.group(f"Gym {i + 1}")
        model = hall(family, roof, Random(f"{seed}/{realm_id}/facade/{i}"))
        stamp(s, model, lot.x, lot.y, MEADOW + lot.rise, lot.scale, anchor=[48, 102, 0])

    s.group("Landmark")
    if kind == "forge":
        s.slab(octagon(ridge_x - 11, ridge_y - 6, 22, 12, 2), ridge_z, 2.3, SLATE)
        arm(s, ridge_x, ridge_y, ridge_z + 2.3, 1.12)
        for j in range(6):
            s.box(17 + j * 5, 29, 9.6, 2, 6, 1, "#776952")
        for yy in [29.4, 33.4]:
            s.box(15, yy, 10.6, 32, 1, 0.8, SLATE)
    elif kind == "ledger":
        # Follow the seed-specific coastline to the lip of a waterfall.
        waterfall_x, waterfall_y = ring[7]
        channel = [
            (-9, -39),
            (-7, -27),
            (-2, -11),
            (9, 0),
            (10, 11),
            (16, 21),
            (10, 34),
            (waterfall_x, waterfall_y),
        ]
        for (x, y), (xx, yy) in zip(channel, channel[1:]):
            s.slab(
                [(x - 4, y), (x + 4, y), (xx + 4, yy), (xx - 4, yy)],
                9.62,
                0.18,
                "#10c6dd",
            )
            s.slab(
                [(x - 0.5, y), (x + 0.6, y), (xx + 1, yy), (xx, yy)],
                9.81,
                0.1,
                "#95fff0",
            )
        s.box(waterfall_x - 3.8, waterfall_y - 0.7, -7.8, 7.8, 1.5, 17.6, "#20b7df")
        for j in range(3):
            s.box(
                waterfall_x - 3 + j * 2.6,
                waterfall_y + 0.75,
                -6 + j,
                1,
                0.2,
                15 - j,
                "#c0fff3",
            )
        for i in range(9):
            s.box(8 + i * 1.6, 15, 10, 1.6, 6.6, 1.1, OAK)
        for xx in [8, 20]:
            for yy in [15, 20]:
                s.box(xx, yy, 10, 1.3, 1.3, 4, WOOD)
        for dx in [-11, 0, 11]:
            s.drum(ridge_x + dx, ridge_y, ridge_z, 4, 3, 11, CREAM, 8)
            s.drum(ridge_x + dx, ridge_y, ridge_z + 11, 4.8, 3.4, 4, TEAL, 8, 0.2)
        for i in range(13):
            x, y = rng.uniform(-68, -38), rng.uniform(28, 36)
            s.drum(x, y, 9.5, 1.7, 1, 2.6, GOLD, 5, 0.35)
    else:
        s.drum(ridge_x, ridge_y, ridge_z, 13, 7, 3.5, CREAM, 10)
        for j in range(8):
            a = 2 * pi * j / 8
            x, y = ridge_x + 10 * cos(a), ridge_y + 5.5 * sin(a)
            s.drum(x, y, ridge_z + 3.5, 1.5, 1, 12, CREAM, 6)
        s.drum(ridge_x, ridge_y, ridge_z + 15.5, 14, 8, 2, OAK, 10)
        s.drum(ridge_x, ridge_y, ridge_z + 17.5, 14, 8, 6, "#9251bf", 10, 0.19)
        for j in range(12):
            x, y = rng.uniform(-55, -18), rng.uniform(26, 38)
            fl = Scene()
            flower(fl, 0, 0, "#ffadd3")
            stamp(s, fl, x, y, 9.4, 0.62, anchor=[0, 0, 0])
    return s


def connected_world(realms, seed, mesh_path=None):
    """Join coast meshes in world space before projecting roads and landmarks."""
    s = Scene()
    origins = [(i * 177, -18 * i + 5 * sin(i * 2.5)) for i in range(len(realms))]
    joins = [[] for _ in realms]
    rng = Random(seed)
    for i, ((lx, ly), (rx, ry)) in enumerate(zip(origins, origins[1:])):
        center_x, center_y = (lx + rx) / 2, (ly + ry) / 2
        points = [
            (center_x + dx + rng.uniform(-2, 2), center_y + dy)
            for dx, dy in [
                (2, -44),
                (-3, -34),
                (0, -24),
                (5, -14),
                (4, -3),
                (-3, 7),
                (-7, 19),
                (-4, 32),
                (1, 42),
            ]
        ]
        left, right = realms[i]["kit"], realms[i + 1]["kit"]
        turf = blend(TERRAIN[left][0], TERRAIN[right][0], 0.5)
        joins[i].append(
            (
                [28, 29, 30, 31, 0, 1, 2, 3, 4],
                [(x - lx, y - ly) for x, y in points],
                turf,
            )
        )
        joins[i + 1].append(
            (range(12, 21), [(x - rx, y - ry) for x, y in reversed(points)], turf)
        )
    for realm, (x, y), borders in zip(realms, origins, joins, strict=True):
        s.group(realm["id"])
        stamp(s, realm_scene(realm, seed, borders), x, y, anchor=[0, 0, 0])

    for i, ((lx, ly), (rx, ry)) in enumerate(zip(origins, origins[1:])):
        cx, cy = (lx + rx) / 2, (ly + ry) / 2
        road = [
            (lx + 44, ly + 20.5),
            (lx + 60, ly + 22),
            (cx - 16, cy + 28),
            (cx - 2, cy + 26),
            (cx + 13, cy + 18),
            (rx - 60, ry + 20),
            (rx - 38, ry + 20.5),
        ]
        for j, ((x, y), (xx, yy)) in enumerate(zip(road, road[1:])):
            s.group(realms[i + (j >= 3)]["id"])
            for width, z, col in [(2.8, 9.6, "#ccab71"), (1.95, 9.83, "#ffe4a0")]:
                s.slab(
                    [
                        (x, y - width),
                        (xx, yy - width),
                        (xx, yy + width),
                        (x, y + width),
                    ],
                    z,
                    0.15,
                    col,
                )
        # Wayfinding details sit beside the road where the two terrains interlock.
        s.group(realms[i]["id"])
        x, y = road[3]
        s.box(x - 1, y - 5, 9.4, 1.7, 1.6, 6, WOOD)
        s.profile(
            [(x - 4, 13), (x + 2, 13), (x + 4, 14.5), (x + 2, 16), (x - 4, 16)],
            y - 5,
            1.3,
            OAK,
        )
        for j in range(20):
            x = cx + rng.uniform(-15, 15)
            y = cy + rng.uniform(-27, 10)
            s.group(realms[i + (x > cx)]["id"])
            if i == 0:
                s.drum(
                    x,
                    y,
                    9.4,
                    1.6,
                    0.9,
                    1.7,
                    rng.choice(["#d3af50", "#a4bf5a", "#ddcc70"]),
                    5,
                    0.35,
                )
            else:
                shrub = Scene()
                flower(shrub, 0, 0, rng.choice(["#ffd67a", "#f9a2bc", WHITE]))
                stamp(s, shrub, x, y, 9.4, 0.55, anchor=[0, 0, 0])

    scale = 1.30
    view, size, offset = oblique_frame(s, -14, scale)
    owners = np.zeros((size[1], size[0]), dtype=np.int32)
    ids = {realm["id"]: i for i, realm in enumerate(realms, 1)}
    image = render(view, size, scale, offset, ownership=(owners, ids))
    if mesh_path is not None:
        # Camera-space XYZ, quantized to three normalized uint16 values, plus realm ID.
        # The orthographic projection registers these meshes to the baked light and ink texture.
        vertices, groups = [], []
        for face, normal, _, group in triangles(view):
            if normal @ [0, S, C] > 0.00001:
                vertices.append(face)
                groups.extend([ids[group]] * 3)
        x, y, z = np.concatenate(vertices).T
        xy = (np.column_stack((x, y - z)) - offset) * scale / size
        depth = y + z
        depth = (depth.max() - depth) / np.ptp(depth)
        packed = np.column_stack((np.rint(xy * 65535), np.rint(depth * 65535), groups))
        mesh_path.write_bytes(packed.astype("<u2").tobytes())
    return image, region_manifest(image, owners, ids)


def chart():
    """Transparent cartographic ink lets both backgrounds share the same marks."""
    w, h = 650, 208
    im = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(im)
    rng = Random(104)
    for _ in range(155):
        x, y = rng.randrange(w), rng.randrange(h)
        ink = (255, 255, 237, 65) if y % 3 else (45, 79, 89, 28)
        d.line(
            [(x, y), (x + 2, y + 1), (x + 4, y), (x + 6, y + 1), (x + 8, y)], fill=ink
        )
    for x in range(14, w, 39):
        for y in range(13, h, 37):
            d.point((x, y), fill=(35, 72, 84, 54))
    im.save(PUBLIC / "chart.png", optimize=True)


def station(prop):
    s = Scene()
    previous = {
        "statements": ("ledger", "Cash counter"),
        "tax": ("ledger", "Adding machine"),
        "reconcile": ("ledger", "Balance scales"),
        "audit": ("ledger", "Ledger cabinet"),
        "writing": ("counsel", "Reading desk"),
        "catalogue": ("counsel", "Card catalogue"),
        "scope": ("forge", "Signal scope"),
    }
    if prop in previous:
        kit, group = previous[prop]
        stamp(s, kit_room(kit), 0, 0, 0, only=[group])
    elif prop == "journal" or prop == "redline":
        table(s, -19, -11, 38, 11, 9)
        for i in range(4):
            s.box(
                -16 + i * 0.6,
                -7,
                10 + i * 1.3,
                10,
                5,
                1.25,
                [BRICK, TEAL, OAK, CREAM][i],
            )
        paper(s, 0, -9, 10, 10, 6)
        s.drum(14, -5, 10, 2, 1.5, 2.8, "#57506b")
        beam(s, 14, 12, 18, 19, -5, 1, 0.7, WHITE)
    elif prop == "books":
        bookcase(s, -18, -9, 36, 25, 123)
    elif prop == "scales":
        stamp(s, kit_room("ledger"), 0, 0, 0, 1.15, ["Balance scales"])
    elif prop == "arm":
        s.slab(octagon(-19, -11, 38, 12, 2), 0, 2.5, SLATE)
        arm(s, -3, -5, 2.5)
        s.box(8, -6, 2.5, 7, 5, 4, BRICK)
    elif prop == "conveyor":
        table(s, -22, -10, 44, 10, 7, SLATE)
        for i in range(10):
            s.box(-20 + i * 4.1, -9, 8, 1.7, 8, 0.8, "#9ab0b2")
        for x in (-10, 7):
            s.box(x, -7, 8.8, 6, 5, 4.8, OAK)
            s.box(x + 2, -7, 13.6, 1.5, 5, 0.3, CREAM)
    elif prop == "rover":
        for x in [-13, 6]:
            for y in [-6, 0]:
                circular_face(s, x, y, 3.8, 4.3, 3.8, DARK, 2.2)
        s.taper(-3, -3, 4, 25, 8, 5, 20, 7, TEAL)
        s.drum(-4, -3, 9, 5, 3, 3, CREAM)
        s.box(1, -2, 9, 1.5, 1.5, 6, GOLD)
    elif prop == "route":
        table(s, -19, -12, 38, 12, 8, TEAL)
        s.box(-16, -11, 9, 31, 9, 0.6, CREAM)
        for i in range(10):
            s.box(-14 + i * 2.7, -8 + 1.5 * sin(i), 9.6, 2, 1, 0.5, BRICK)
    elif prop == "jig":
        table(s, -19, -10, 38, 10, 8)
        for x in [-15, 7]:
            s.box(x, -8, 9, 7, 6, 3.8, SLATE)
            s.box(x + 2, -7, 12.8, 3, 3, 5.5, TEAL)
        s.box(-4, -7, 9, 6, 5, 5, GOLD)
    else:
        raise ValueError(prop)
    return s


def floorplan(gym, realm):
    s = Scene()
    kind = realm["kit"]
    rng = Random(gym["id"])
    fabrics = STATION_FABRICS[kind]
    accent = fabrics[0]
    floor = {"ledger": "#edc582", "forge": "#7dabc3", "counsel": "#db9974"}[kind]
    wall = {"ledger": "#fff2b9", "forge": "#ffc984", "counsel": "#ffe1c0"}[kind]
    w, h = 300, 164
    s.box(0, 26, -3, w, h - 26, 3, floor)
    s.box(0, 25, 0, w, 3, 29, wall)
    for yy in range(28, h, 7):
        for xx in range(-(yy % 2) * 14, w, 28):
            x = max(xx, 0)
            width = min(xx + 28, w) - x
            s.box(
                x,
                yy,
                0,
                width - 0.5,
                min(6.5, h - yy),
                0.12,
                blend(floor, WHITE, rng.uniform(0.02, 0.12)),
            )
    if kind == "forge":
        for x in range(8, w, 30):
            for y in range(32, h, 14):
                s.box(x, y, 0.15, 1.2, 1, 0.1, "#697a82")
        for z in (14, 17):
            s.box(0, 28.3, z, 300, 0.8, 1, SLATE)
    for x in range(5, w, 24):
        s.box(x, 28, 1, 2, 1, 27, WOOD if kind != "forge" else SLATE)
    for x in (21, 76, 141, 201, 260):
        back_window(s, x, 28.2, 7, 17, 17, kind == "counsel")
    s.box(0, 28, 1, w, 1, 2, WOOD)
    s.box(0, 28, 25, w, 1.4, 2.4, OAK)
    cols = (len(gym["skills"]) + 2) // 2
    bay_width = (w - 14) / cols
    anchors = []
    for i in range(cols * 2):
        row, col = divmod(i, cols)
        left = 7 + col * bay_width
        cx = left + bay_width / 2
        top = 33 + row * 68
        foot = top + 43
        is_vault = i == cols * 2 - 1
        carpet = "#53688d" if is_vault else fabrics[i % len(fabrics)]
        for inset, colour in [
            (0, blend(carpet, DARK, 0.4)),
            (1.3, carpet),
            (3, blend(carpet, CREAM, 0.55)),
            (4, carpet),
        ]:
            s.slab(
                octagon(
                    left + 4 + inset,
                    top + 1 + inset,
                    bay_width - 8 - inset * 2,
                    47 - inset * 2,
                    3,
                ),
                0.2 + inset * 0.12,
                0.18,
                colour,
            )
        # Dividers are open to the aisle. Each bay has its own furnishings.
        if col:
            s.box(left - 0.8, top + 3, 0.2, 1.6, 37, 5.3, WOOD)
            s.box(left - 1.6, top + 2, 5.5, 3.2, 39, 1.4, OAK)
        for xx in [left + 4, left + bay_width - 19]:
            s.box(xx, top + 43, 0.5, 14, 1.4, 3, WOOD)
            s.box(xx - 0.3, top + 42.6, 3.5, 14.6, 2.3, 1.1, OAK)
        if is_vault:
            stamp(s, kit_room(kind), cx, foot - 6, 1, 0.95, ["Sealed grader vault"])
            for xx in [cx - 22, cx + 22]:
                s.box(xx, foot - 11, 0.6, 2, 2, 12, SLATE)
                s.drum(xx + 1, foot - 10, 12.6, 2, 1.5, 2, GOLD)
            vault_anchor = [round(cx), round(foot + 5)]
        elif i < len(gym["skills"]):
            prop = gym["skills"][i]["prop"]
            stamp(s, station(prop), cx, foot - 8, 1, 1.05)
            for j in range(2):
                # Reference trays, books and sample parts kept against the back of each bay.
                x = left + 8 + j * 7
                if kind == "forge":
                    s.box(x, top + 8, 1, 5, 3, 2, SLATE)
                    s.drum(x + 2, top + 9, 3, 1.6, 1, 1.5, GOLD)
                elif kind == "counsel":
                    s.box(x, top + 8, 1, 6, 4, 1.5, [TEAL, BRICK][j])
                    s.box(x + 0.8, top + 12, 1.5, 4.5, 0.2, 0.65, PAPER)
                else:
                    s.drum(x + 2, top + 9, 1, 2.5, 1.7, 2 + j * 1.3, OAK)
            end = left + bay_width - 10
            if kind == "forge":
                for yy in [top + 12, top + 16, top + 20]:
                    s.slab(
                        [
                            (end - 4, yy),
                            (end - 2, yy - 1.6),
                            (end + 1, yy - 1.6),
                            (end - 1, yy),
                        ],
                        0.81,
                        0.15,
                        GOLD,
                    )
                s.box(end - 8, top + 7, 1, 8, 4, 8, SLATE)
                for j in range(3):
                    s.box(
                        end - 7,
                        top + 11,
                        2 + j * 2.2,
                        5,
                        0.35,
                        0.9,
                        PALE if j == 0 else DARK,
                    )
            elif kind == "ledger":
                cabinet(s, end - 11, top + 7, 12, 5, 7, 2)
                for j in range(3):
                    s.box(end - 9, top + 8, 8.5 + j, 6, 3, 0.8, [CREAM, TEAL, OAK][j])
                s.drum(cx + 13, foot - 3, 1, 1.6, 1, 4.5, WOOD)
                s.drum(cx + 13, foot - 3, 5.5, 3.8, 2.2, 1.2, TEAL)
            else:
                bookcase(s, end - 12, top + 6, 14, 12, 60 + i)
                for j in range(3):
                    s.box(
                        cx - 17 + j * 0.5,
                        foot - 3,
                        1 + j * 1.2,
                        7,
                        4,
                        1.15,
                        [BRICK, TEAL, OAK][j],
                    )
            anchors.append([round(cx), round(foot + 5)])
        else:
            fern(s, cx - 9, foot - 9, 1.2)
            table(s, cx + 5, foot - 16, 20, 7, 7)
            paper(s, cx + 9, foot - 14, 8)
    for xx in [4, 294]:
        fern(s, xx, 96, 0.59)
    s.slab(octagon(128, 153, 44, 10, 2), 0.2, 0.5, accent)
    for y in (155, 160):
        s.box(130, y, 0.7, 40, 1, 0.2, CREAM)
    return render(s, (w, h)), dict(stations=anchors, vault=vault_anchor)


PAPER = "#f3e4bb"


def examples(seed, plans):
    """A contact sheet linking each landmark, floor station and catalog entry."""
    out = ROOT / "art/realms"
    out.mkdir(parents=True, exist_ok=True)

    def font(size, bold=False):
        for name in (
            ["DejaVuSans-Bold.ttf", "Arial Bold.ttf"]
            if bold
            else ["DejaVuSans.ttf", "Arial.ttf"]
        ):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default(size=size)

    sheet = Image.new("RGB", (1376, 110 + 376 * len(CATALOG["realms"])), "#fff0d0")
    d = ImageDraw.Draw(sheet)
    ink = "#223d38"
    d.text((34, 22), "Realm atlas", font=font(39, True), fill=ink)
    d.text(
        (1340, 39),
        "Gym interiors and skill stations",
        font=font(19),
        anchor="ra",
        fill="#4e635c",
    )
    d.line((34, 82, 1340, 82), fill="#b9b9a4")
    for i, realm in enumerate(CATALOG["realms"]):
        gym = next(g for g in CATALOG["gyms"] if g["realm"] == realm["id"])
        y = 100 + i * 376
        d.rounded_rectangle(
            (30, y, 1346, y + 360), radius=8, fill="#fffdf4", outline="#d5d0bc"
        )
        d.rectangle((47, y + 17, 51, y + 42), fill=realm["accent"])
        d.text((60, y + 10), realm["name"], font=font(25, True), fill=ink)
        island = Image.open(PUBLIC / f"{realm['id']}-{seed}.png").convert("RGBA")
        island = island.crop(island.getbbox())
        factor = min(1.58, 334 / island.width, 242 / island.height)
        island = island.resize(
            (round(island.width * factor), round(island.height * factor)),
            Image.Resampling.NEAREST,
        )
        sheet.paste(
            island,
            (47 + (344 - island.width) // 2, y + 74 + (245 - island.height) // 2),
            island,
        )
        neighbours = [
            g["name"]
            for g in CATALOG["gyms"]
            if g["realm"] == realm["id"] and g["id"] != gym["id"]
        ]
        if neighbours:
            d.text(
                (59, y + 326),
                "Also here · " + neighbours[0],
                font=font(13),
                fill="#4e635c",
            )
        room = Image.open(PUBLIC / (gym["id"] + ".png")).resize(
            (570, 312), Image.Resampling.NEAREST
        )
        ox, oy = 399, y + 24
        sheet.paste(room, (ox, oy))

        def pin(pos, label, fixed=False):
            x, y = round(ox + pos[0] * 1.9), round(oy + pos[1] * 1.9)
            w = 42 if fixed else 11
            d.rounded_rectangle(
                (x - w, y - 10, x + w, y + 10),
                radius=3,
                fill="#42406e" if fixed else realm["accent"],
                outline="#efe6bb",
            )
            d.text(
                (x, y - 1),
                label,
                anchor="mm",
                font=font(11 if fixed else 12, True),
                fill="#fff5db",
            )

        for n, pos in enumerate(plans[gym["id"]]["stations"]):
            pin(pos, str(n + 1))
        pin(plans[gym["id"]]["vault"], "Sealed vault", True)
        x = 991
        d.text((x, y + 23), gym["name"], font=font(23, True), fill=ink)
        available = sum(sum(s["training"]) + len(s.get("records", [])) for s in gym["skills"])
        d.text(
            (x, y + 56),
            f"{len(gym['skills'])} skills  ·  {available:,} training tasks",
            font=font(14),
            fill="#52655b",
        )
        for j, skill in enumerate(gym["skills"]):
            yy = y + 94 + j * 40
            d.line((x, yy - 6, 1321, yy - 6), fill="#dedbcb")
            d.text((x, yy), str(j + 1), font=font(14, True), fill=realm["accent"])
            d.text((x + 24, yy), skill["name"], font=font(16), fill=ink)
            d.text(
                (1321, yy + 2),
                f"{sum(skill['training']) + len(skill.get('records', [])):,}",
                font=font(14),
                anchor="ra",
                fill="#52655b",
            )
    sheet.save(out / "examples.png", optimize=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed",
        type=int,
        action="append",
        help="Bake another island variant using this seed.",
    )
    args = parser.parse_args()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    chart()
    seeds = list(dict.fromkeys(args.seed or SEEDS))
    (PUBLIC / "seeds.json").write_text(json.dumps(seeds) + "\n")
    maps = []
    for seed in seeds:
        land, geometry = connected_world(
            CATALOG["realms"], seed, PUBLIC / f"world-{seed}.mesh"
        )
        maps.append({"seed": seed, **geometry})
        land.save(PUBLIC / f"world-{seed}.png", optimize=True)
    (PUBLIC / "atlas.json").write_text(json.dumps(maps, indent=2) + "\n")
    plans = {}
    for realm in CATALOG["realms"]:
        for seed in seeds:
            img = oblique(realm_scene(realm, seed), -14, 0.98)
            img.save(PUBLIC / f"{realm['id']}-{seed}.png", optimize=True)
        for gym in CATALOG["gyms"]:
            if gym["realm"] == realm["id"]:
                img, plans[gym["id"]] = floorplan(gym, realm)
                img.save(PUBLIC / f"{gym['id']}.png", optimize=True)
    (PUBLIC / "floorplans.json").write_text(json.dumps(plans, indent=2) + "\n")
    examples(seeds[0], plans)


if __name__ == "__main__":
    main()
