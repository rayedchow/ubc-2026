"""Seeded, buildable terraces in the atlas's projected world units."""

from dataclasses import dataclass
from math import cos, sin, pi
from random import Random

from buildings import CREAM, WHITE, octagon
from mesh import blend

MEADOW = 9.3
# Heights above the shared road. The first lot is the upland gym.
RELIEF = {
    "forge": ((24, 42), (5, 13), (27, 49)),
    "ledger": ((12, 24), (3, 9), (11, 23)),
    "counsel": ((24, 36), (7, 16), (24, 40)),
}


@dataclass(frozen=True)
class Lot:
    x: float
    y: float  # The top landing at the entrance, facing towards increasing y.
    scale: float
    rise: int


def lots_for(kind, realm_id, seed):
    rng = Random(f"{seed}/{realm_id}/lots")
    upper, lower, _ = RELIEF[kind]
    return (
        Lot(
            rng.randint(-43, -34),
            rng.randint(3, 6),
            rng.uniform(0.59, 0.69),
            rng.randint(*upper),
        ),
        Lot(
            rng.randint(42, 48),
            rng.randint(5, 9),
            rng.uniform(0.45, 0.54),
            rng.randint(*lower),
        ),
    )


def gym_terrace(s, lot, turf, rock, shade, rng):
    """Give the hall a level footprint and a flight of steps to the common road."""
    w, d = 94 * lot.scale + 5, 49 * lot.scale + 5
    levels = max(2, round(lot.rise / 8))
    z = MEADOW
    # A clear landing in the centre leaves both shoulders free to follow the hillside.
    left, right = rng.uniform(2, 6), rng.uniform(2, 7)
    for i in range(levels):
        margin = (levels - i - 1) * 1.65
        h = lot.rise / levels
        x, y = lot.x - w / 2 - margin, lot.y - d - margin
        rim = octagon(x, y, w + 2 * margin, d + margin + 1.2, 4 + margin * 0.55)
        # Widen the outside shoulders and leave the front edge flush with the stairs.
        rim[2] = (rim[2][0] + right + margin * 0.65, rim[2][1])
        rim[7] = (rim[7][0] - left - margin * 0.8, rim[7][1])
        s.slab(rim, z, h - 1.5, blend(shade, rock, 0.45 + 0.5 * i / levels))
        s.slab(rim, z + h - 1.5, 1.5, blend(turf, WHITE, rng.uniform(0.03, 0.15)))
        for side in (-1, 1):
            px = lot.x + side * rng.uniform(9, w * 0.35)
            py = lot.y + 1.22
            chip = rng.uniform(2.4, 5.3)
            s.profile(
                [
                    (px, z + h * 0.24),
                    (px + chip, z + h * 0.38),
                    (px + chip + 1, z + h * 0.63),
                    (px + 1, z + h * 0.49),
                ],
                py,
                0.2,
                blend(rock, CREAM, 0.27),
            )
        z += h
    # Place the highest tread flush with the upper landing and the lowest on the road.
    steps = max(3, round(lot.rise / 2.4))
    run = (21 - lot.y) / steps
    for i in range(steps):
        z = lot.rise * (steps - i) / steps
        y = lot.y + i * run
        s.box(lot.x - 4.4, y, MEADOW, 8.8, run + 0.12, z, rock)
        s.box(lot.x - 4.4, y, MEADOW + z, 8.8, run + 0.12, 0.32, CREAM)


def rear_ridge(s, kind, realm_id, seed, turf, rock, shade):
    """Build an asymmetric massif in the back country, usable by scenery and trees."""
    rng = Random(f"{seed}/{realm_id}/ridge")
    cx, cy = rng.uniform(4, 13), rng.uniform(-35, -30)
    rx, ry = rng.uniform(24, 30), rng.uniform(13, 16)
    count = {"forge": 4, "ledger": 2, "counsel": 3}[kind]
    rise = rng.randint(*RELIEF[kind][2])
    angles = [i * 2 * pi / 12 for i in range(12)]
    roughness = [rng.uniform(0.86, 1.02) for _ in angles]
    z = MEADOW
    for level in range(count):
        shrink = 1 - (level / count) * 0.24
        foot = [
            (cx + rx * shrink * r * cos(a), cy + ry * shrink * r * sin(a))
            for a, r in zip(angles, roughness)
        ]
        h = rise / count
        s.slab(foot, z, h * 0.67, blend(rock, shade, 0.52 - 0.30 * level / count))
        s.slab(foot, z + h * 0.67, h * 0.19, blend(rock, CREAM, 0.29))
        s.slab(foot, z + h * 0.86, h * 0.14, blend(turf, WHITE, 0.09))
        z += h
    return cx, cy, z


def foothills(s, kind, realm_id, seed, turf, rock, shade):
    """A low crop of shale, river hummocks or wooded tors alongside the road."""
    rng = Random(f"{seed}/{realm_id}/foothills")
    foreground = (-22, 35) if kind == "forge" else (37, 32)
    for cx, cy in [(-71, 1), (65, -18), foreground]:
        for j in range(rng.randint(2, 4)):
            x, y = cx + rng.uniform(-5, 5), cy + rng.uniform(-3, 3)
            radius = rng.uniform(4, 8) if cy > 28 else rng.uniform(6, 11)
            rise = rng.uniform(4, 10) if cy > 28 else rng.uniform(8, 18)
            if kind == "forge":
                s.drum(x, y, MEADOW, radius, radius * 0.63, rise * 0.65, rock, 6, 0.82)
                s.drum(
                    x,
                    y,
                    MEADOW + rise * 0.65,
                    radius * 0.82,
                    radius * 0.52,
                    rise * 0.35,
                    "#eda24b",
                    6,
                    0.50,
                )
            elif kind == "ledger":
                s.drum(
                    x,
                    y,
                    MEADOW,
                    radius,
                    radius * 0.68,
                    rise * 0.48,
                    blend(rock, turf, 0.40),
                    8,
                    0.83,
                )
                s.drum(
                    x,
                    y,
                    MEADOW + rise * 0.48,
                    radius * 0.83,
                    radius * 0.55,
                    2,
                    turf,
                    8,
                    0.75,
                )
                for dx in (-2, 0, 2):
                    s.drum(
                        x + dx,
                        y,
                        MEADOW + rise * 0.48 + 2,
                        0.8,
                        0.6,
                        rng.uniform(2, 5),
                        "#799737",
                        5,
                        0.32,
                    )
            else:
                s.drum(x, y, MEADOW, radius, radius * 0.62, rise * 0.70, shade, 7, 0.70)
                s.drum(
                    x,
                    y,
                    MEADOW + rise * 0.70,
                    radius * 0.70,
                    radius * 0.44,
                    rise * 0.30,
                    "#ba94c2",
                    7,
                    0.52,
                )
