"""Removable landscaping around each exterior, including the south approach."""

from random import Random
from buildings import (
    DARK,
    WOOD,
    OAK,
    CREAM,
    GOLD,
    WHITE,
    LEAF,
    PACKS,
    MARKS,
    emboss,
    octagon,
)


def tree(s, x, y, size, colors, pine=False):
    s.drum(x, y, 0, 2.7 * size, 2 * size, 14 * size, WOOD, 7, 0.8)
    s.drum(x, y, 0, 3.3 * size, 2.2 * size, 2 * size, "#846052", 7, 0.76)
    if pine:
        for i, (r, z) in enumerate([(11, 9), (8.4, 15), (5.8, 21)]):
            s.drum(
                x, y, z * size, r * size, r * 0.58 * size, 9 * size, colors[i], 8, 0.16
            )
        return
    for dx, dy, z, r, c in [
        (0, 0, 9, 10, 0),
        (-4, -0.3, 14, 7.7, 1),
        (4, 1, 13, 6.6, 0),
        (1, -1.5, 18, 7, 2),
        (-4, 1.5, 17, 4.8, 1),
        (4.2, 2, 17, 4.2, 1),
    ]:
        s.drum(
            x + dx * size,
            y + dy * size,
            z * size,
            r * size,
            r * 0.63 * size,
            4.2 * size,
            colors[c],
            8,
            0.9,
        )
        s.drum(
            x + dx * size,
            y + dy * size,
            (z + 4.2) * size,
            r * 0.90 * size,
            r * 0.57 * size,
            3 * size,
            colors[c],
            8,
            0.45,
        )


def flower(s, x, y, c):
    s.drum(x, y, 0.15, 3.1, 1.65, 1.6, "#39765c", 6, 0.82)
    s.drum(x + 1.1, y - 0.1, 1, 2.2, 1.4, 1.9, "#69a464", 6, 0.75)
    s.box(x - 0.65, y - 0.3, 2, 0.9, 0.7, 2.1, LEAF)
    s.box(x - 2, y - 0.5, 3.4, 3.5, 0.9, 1.3, c)
    s.box(x - 0.8, y - 1.3, 3.2, 1.3, 2.7, 1.3, c)
    s.box(x - 0.6, y - 0.5, 4.55, 1.1, 0.9, 0.37, GOLD)


def grounds(s, k):
    accent = PACKS[k][1]
    rng = Random(135)
    grass = {
        "forge": "#83ad76",
        "ledger": "#8cb77b",
        "counsel": "#83af82",
        "harbor": "#8bb493",
    }[k]
    s.group("Grounds • earth and paving")
    outline = octagon(-18, 52, 132, 77, 6)
    s.slab(outline, -4, 2, "#987758")
    s.slab(outline, -2, 1.5, "#61876a")
    s.slab(outline, -0.5, 0.55, grass)
    # A light path widens where it meets the front edge of the plot.
    s.slab(
        [
            (36, 94),
            (60, 94),
            (63, 123),
            (67, 127),
            (64, 129),
            (33, 129),
            (29, 126),
            (33, 122),
        ],
        0.06,
        0.22,
        "#dbbd8e",
    )
    s.slab(
        [
            (37.3, 95),
            (58.8, 95),
            (61.5, 123),
            (65, 128),
            (33, 128),
            (31.5, 126),
            (34.5, 123),
        ],
        0.29,
        0.11,
        "#f2d7a4",
    )
    for yy in [103, 116, 124]:
        x = rng.choice([37, 42, 50])
        s.box(x, yy, 0.41, 3.4, 0.7, 0.16, "#d9b889")
    s.group("Grounds • grass tufts")
    for i in range(96):
        x, y = rng.randrange(-14, 110), rng.randrange(55, 125)
        if (2 < x < 92 and y < 99) or (28 < x < 66 and y > 94):
            continue
        c = rng.choice(["#68956c", "#a2c77e", "#729e70"])
        s.slab(
            [
                (x, y),
                (x + 1.1, y - 1.7),
                (x + 2.4, y),
                (x + 4, y - 0.8),
                (x + 3.6, y + 0.7),
                (x + 1.7, y + 0.7),
            ],
            0.08,
            0.20,
            c,
        )
    s.group("Grounds • orchard")
    greens = {
        "forge": ["#3e7d62", "#5e9965", "#87b366"],
        "ledger": ["#448867", "#6ca268", "#9abb70"],
        "counsel": ["#a67591", "#cb96a9", "#e6b7bb"],
        "harbor": ["#3a7769", "#52967d", "#78ad82"],
    }[k]
    tree(s, -7, 79, 1.03, greens, k == "harbor")
    tree(s, 102, 71, 0.84, greens, k == "harbor")
    tree(s, 103, 91, 0.72, greens, k == "harbor")
    s.group("Grounds • flower borders")
    for x, y, w in [(-6, 104, 32), (70, 101, 32)]:
        s.slab(octagon(x, y, w, 6.5, 1.5), 0.12, 0.9, "#657656")
        for i in range(10):
            xx = x + 2 + (i % 5) * (w - 4) / 5 + (i // 5) * 1.1
            yy = y + 1.4 + 3.1 * (i // 5)
            c = (
                [WHITE, "#f2b289", WHITE]
                if k != "counsel"
                else ["#d7bcdd", WHITE, "#ebb6ad"]
            )
            flower(s, xx, yy, c[i % 3])
    s.group("Grounds • entrance sign")
    s.box(78, 117, 0, 2.4, 2.5, 11, WOOD)
    s.box(90, 117, 0, 2.4, 2.5, 11, WOOD)
    s.box(76, 116, 5, 18, 3, 12, WOOD)
    s.box(77, 119, 6, 16, 0.5, 10, CREAM)
    s.box(75, 115.6, 16.6, 20, 4.4, 1.5, accent)
    emboss(s, MARKS[k], 81, 119.5, 6.5, DARK, 0.9)
    s.group("Grounds • boundary")
    if k == "harbor":
        for x in [-8, 5, 18]:
            s.drum(x, 118, 0, 2, 1.6, 10, WOOD)
            s.drum(x, 118, 8, 2.1, 1.7, 1.7, CREAM)
        for x in [-8, 5]:
            for j, h in enumerate([7.5, 6.3, 5.6, 6.0, 7.4]):
                s.box(x + j * 2.6, 118, h, 2.8, 0.85, 1, CREAM)
    else:
        for x in [-9, 4, 17]:
            s.box(x, 117, 0, 2.8, 2.8, 8.4, CREAM)
            s.taper(x + 1.4, 118.4, 8.4, 3, 3, 2.3, 0.9, 0.9, OAK)
        for z in (3.6, 6.9):
            s.box(-9, 117, z, 28, 1.4, 1.5, OAK)
