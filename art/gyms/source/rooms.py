"""Furnished rooms. Positions are measured at the feet of the furniture."""

from math import cos, sin, pi
from random import Random

from mesh import Scene, blend
from buildings import (
    PACKS,
    MARKS,
    DARK,
    WOOD,
    OAK,
    CREAM,
    GOLD,
    GLASS,
    WHITE,
    LEAF,
    TEAL,
    PALE,
    SLATE,
    BRICK,
    emboss,
    octagon,
    clock,
)

PAPER = "#f3e4bb"
BOOKS = ["#c87665", "#64969b", "#d6b56b", "#9a8fae", "#8bae7d", "#7099bd"]
PROPS = {
    "forge": [
        "Kiln",
        "Tool board",
        "Signal scope",
        "Parts trolley",
        "Relay cabinet",
        "Solder bench",
    ],
    "ledger": [
        "Teller window",
        "Balance scales",
        "Adding machine",
        "Coin tray",
        "Ledger cabinet",
        "Cash counter",
    ],
    "counsel": [
        "Bookcase",
        "Brass orrery",
        "Reading desk",
        "Specimen fern",
        "Atlas stand",
        "Card catalogue",
    ],
    "harbor": [
        "Helm",
        "Chart table",
        "Rope reel",
        "Buoy rack",
        "Radio desk",
        "Cargo crate",
    ],
}


def table(s, x, y, w, d, h, top=OAK):
    for a in [x + 1, x + w - 3]:
        for b in [y + 0.5, y + d - 2.7]:
            s.box(a, b, 0, 2.3, 2.2, h, WOOD)
            s.box(a - 0.3, b - 0.2, 0, 2.9, 2.6, 1.5, DARK)
    s.box(x + 0.7, y + 0.5, h - 3, w - 1.4, d - 1, 3, "#925f48")
    s.box(x, y, h - 1, w, d, 2, top)
    s.box(x + 0.5, y + d - 0.1, h, w - 1, 0.5, 1, blend(top, WHITE, 0.35))


def paper(s, x, y, h, w=8, d=4):
    s.box(x, y, h, w, d, 0.5, PAPER)
    for j in [1, 2.4]:
        s.box(x + 1.2, y + j, h + 0.5, w * 0.58, 0.48, 0.15, "#919a98")


def volumes(s, x, y, z, n, seed):
    rng = Random(seed)
    for i in range(n):
        w = rng.choice([1.6, 2.1, 2.6])
        h = rng.uniform(4.4, 7.9)
        c = BOOKS[rng.randrange(len(BOOKS))]
        s.box(x, y, z, w, 2.8, h, c)
        s.box(x, y + 2.81, z + h * 0.7, w, 0.18, 0.75, CREAM)
        x += w + 0.45


def cabinet(s, x, y, w, d, h, drawers=3):
    s.box(x + 1, y + 1, 0, w - 2, d - 1, 2, DARK)
    s.box(x, y, 1, w, d, h, WOOD)
    s.box(x - 0.5, y - 0.4, h, w + 1, d + 0.8, 1.5, OAK)
    pitch = (h - 2) / drawers
    for j in range(drawers):
        z = 2 + j * pitch
        s.box(x + 1, y + d, z, w - 2, 0.6, pitch - 1, "#c68d5b")
        s.box(x + w * 0.45, y + d + 0.6, z + pitch * 0.36, w * 0.12, 0.45, 1.2, GOLD)


def fern(s, x, y, scale=1):
    def drum(z, r, d, h, c, top=1):
        s.drum(x, y, z * scale, r * scale, d * scale, h * scale, c, 8, top)

    drum(0, 4, 2.8, 6, "#a66c5a", 1.2)
    drum(5.5, 5.2, 3.6, 2.2, OAK)
    drum(7.5, 4, 2.5, 1, "#73584a")
    for i in range(9):
        angle = i * 2 * pi / 9
        a = cos(angle) * scale
        b = sin(angle) * scale * 0.6
        length = (6 + (i % 3)) * 1.16
        high = (13 + (i % 2) * 3) * scale
        start = (x, y, 8 * scale)
        tip = (x + a * length, y + b * length, high)
        left = (
            x + a * length * 0.48 - b * 2.6,
            y + b * length * 0.48 + a * 1.1,
            high + 1.2 * scale,
        )
        right = (
            x + a * length * 0.48 + b * 2.6,
            y + b * length * 0.48 - a * 1.1,
            high + 1.2 * scale,
        )
        ridge = (x + a * length * 0.53, y + b * length * 0.53, high + 2.7 * scale)
        s.solid(
            [start, left, tip, right, ridge],
            [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
            [LEAF, "#77ad6c", "#a1c979"][i % 3],
        )


def circular_face(s, x, y, z, rx, rz, color, depth=0.8):
    points = [(x + rx * cos(i * pi / 8), z + rz * sin(i * pi / 8)) for i in range(16)]
    s.profile(points, y, depth, color)


def back_window(s, x, y, z, w, h, night=False):
    def arch(x, z, w, h):
        return [
            (x, z),
            (x + w, z),
            (x + w, z + h - 4),
            (x + w - 4, z + h),
            (x + 4, z + h),
            (x, z + h - 4),
        ]

    s.profile(arch(x, z, w, h), y, 1.2, DARK)
    s.profile(
        arch(x + 2, z + 2, w - 4, h - 4),
        y + 1.2,
        0.4,
        "#536390" if night else "#83bfcd",
    )
    if night:
        for a, b in [(5, 8), (9, 14), (15, 11), (w - 5, 7)]:
            s.box(x + a, y + 1.65, z + b, 1.3, 0.2, 1.2, WHITE)
        circular_face(s, x + w * 0.69, y + 1.65, z + h * 0.66, 2.6, 2.6, GOLD, 0.3)
    else:
        s.box(x + 2, y + 1.6, z + 2, w - 4, 0.3, 4, "#94c39c")
        for a, b in [(3, 3), (6, 5), (w - 8, 4)]:
            s.profile(
                [(x + a, z + 3), (x + a + 3, z + 3 + b), (x + a + 6, z + 3)],
                y + 1.92,
                0.2,
                "#6b9c87",
            )
        s.box(x + 5, y + 1.8, z + h * 0.68, 5, 0.3, 1.2, WHITE)
    s.box(x + w / 2 - 1, y + 2, z + 1, 2, 0.7, h - 2, WOOD)
    s.box(x + 1, y + 2, z + h * 0.56, w - 2, 0.6, 1.4, WOOD)
    s.box(x - 1, y + 0.4, z - 1, w + 2, 3, 2, OAK)


def shell(s, k):
    _, accent, floor, rug = PACKS[k]
    wall = {
        "forge": "#c8a796",
        "ledger": "#d6ceb1",
        "counsel": "#d5bfb0",
        "harbor": "#c6d8c5",
    }[k]
    s.group("Architecture • floor and back wall")
    s.box(0, 33, -2, 240, 95, 2, floor)
    s.box(0, 31, 0, 240, 3, 38, wall)
    s.box(0, 34, 1, 240, 0.8, 7, blend(wall, WOOD, 0.48))
    s.box(0, 34.8, 1, 240, 1.2, 2.2, WOOD)
    s.box(0, 34, 8, 240, 1.2, 1.4, OAK)
    for x in [2, 58, 100, 139, 181, 235]:
        s.box(x, 34, 0, 2.3, 1.6, 37, WOOD if k != "forge" else SLATE)
    s.box(0, 34, 32, 240, 1.6, 2.8, blend(wall, WOOD, 0.55))
    s.group("Architecture • floor inlay")
    rng = Random(22)
    for j, y in enumerate(range(34, 128, 8 if k != "ledger" else 12)):
        pitch = {"forge": 24, "ledger": 16, "counsel": 32, "harbor": 42}[k]
        offset = (j % 2) * pitch // 2 if k != "ledger" else 0
        for x in range(-offset, 240, pitch):
            a = max(x, 0)
            w = min(240, x + pitch) - a
            if w < 1:
                continue
            col = blend(floor, WHITE, rng.choice([0.04, 0.065, 0.09, 0.12]))
            d = min(128 - y, 7.4 if k != "ledger" else 11.4)
            s.box(a, y, 0.01, w - 0.65, d, 0.13, col)
            if k == "ledger":
                if (x // pitch + j) % 2 == 0:
                    s.slab(
                        [
                            (a + w / 2 - 2, y + 5),
                            (a + w / 2, y + 3.5),
                            (a + w / 2 + 2, y + 5),
                            (a + w / 2, y + 6.5),
                        ],
                        0.14,
                        0.06,
                        "#b2ab98",
                    )
            elif k == "forge":
                for bolt in [a + 1.7, a + w - 2.5]:
                    s.box(bolt, y + 1.3, 0.15, 1.2, 0.9, 0.08, "#646e79")
            elif rng.random() < 0.35 and w > 8:
                s.box(
                    a + 2,
                    y + 3,
                    0.14,
                    max(2, w * 0.25),
                    0.45,
                    0.05,
                    blend(floor, WHITE, 0.18),
                )

    s.group("Training carpet")
    # Successive clipped borders leave a clear center for the live character.
    w, d = {
        "forge": (94, 48),
        "ledger": (100, 50),
        "counsel": (98, 54),
        "harbor": (90, 48),
    }[k]
    x, y = 120 - w / 2, 87 - d / 2
    borders = [
        (0, blend(rug, DARK, 0.64)),
        (1.2, rug),
        (3, blend(rug, CREAM, 0.65)),
        (4.3, rug),
        (6, blend(rug, DARK, 0.18)),
        (7.2, rug),
    ]
    for inset, col in borders:
        z = 0.22 + inset * 0.03
        width, depth = w - 2 * inset, d - 2 * inset
        if k == "harbor":
            s.drum(120, 87, z, width * 0.5, depth * 0.5, 0.18, col, 16)
        else:
            cut = {"forge": 10, "ledger": 2, "counsel": 5}[k]
            s.slab(octagon(x + inset, y + inset, width, depth, cut), z, 0.18, col)
    for fx in (x + 14, x + w - 14):
        for fy in (y + 11, y + d - 11):
            s.slab(
                [(fx - 3, fy), (fx, fy - 2), (fx + 3, fy), (fx, fy + 2)],
                0.68,
                0.15,
                CREAM,
            )
    emboss(s, MARKS[k], 111, 79, 0.68, blend(rug, CREAM, 0.23), 2, True)
    # A woven entrance mat repeats the district stripe at the south threshold.
    s.box(105, 119, 0.25, 30, 9, 0.3, blend(accent, DARK, 0.23))
    for yy in (120, 125):
        s.box(106, yy, 0.58, 28, 1, 0.15, blend(accent, CREAM, 0.65))
    for xx in range(106, 135, 3):
        s.box(xx, 127, 0.21, 1, 1, 0.15, CREAM)


def vault(s, k):
    s.group("Sealed grader vault")
    accent = PACKS[k][1]
    s.box(106, 38, 0, 28, 8, 2.2, DARK)
    s.box(107, 37, 2, 26, 9, 19, SLATE)
    s.box(106, 36, 20, 28, 10.5, 2.4, blend(SLATE, WHITE, 0.3))
    s.box(109, 46, 4, 22, 0.7, 15, DARK)
    s.box(110.5, 46.7, 5.2, 19, 0.5, 12.5, "#70828c")
    for xx in [109, 128]:
        for zz in [5, 15]:
            s.box(xx, 47.1, zz, 2.5, 1, 1.5, GOLD)
    s.box(117.6, 47.2, 10, 5.6, 1, 5.6, DARK)
    s.box(119, 48.2, 11, 3, 0.5, 3.5, accent)
    s.box(116.8, 47.6, 8, 7, 1.4, 4.4, GOLD)
    s.box(119.5, 49, 8.8, 1.6, 0.45, 2.2, DARK)
    s.box(109, 37, 22.4, 22, 7.9, 2.5, blend(SLATE, WHITE, 0.27))
    s.box(111, 38, 24.9, 18, 5.6, 0.7, accent)
    for xx in [110, 127]:
        s.box(xx, 37, 23, 2, 8.4, 2.8, OAK)
        s.box(xx, 46.8, 5, 1.4, 0.7, 12.8, OAK)


def monitor(s, x, y, z, w=14, h=9):
    s.box(x + 3, y, z, w - 6, 4.5, 1.5, DARK)
    s.box(x + w * 0.4, y + 1, z + 1, w * 0.2, 2, 2, SLATE)
    s.box(x, y, z + 2, w, 4, h, SLATE)
    s.box(x + 1, y + 4, z + 3, w - 2, 0.6, h - 2, DARK)
    s.box(x + 2, y + 4.6, z + 4, w - 4, 0.25, h - 4, TEAL)
    for i in range(int(w) - 6):
        zz = z + 5 + (i % 5 if i % 5 <= 2 else 4 - i % 5)
        s.box(x + 3 + i, y + 5, zz, 1, 0.2, 1, PALE)


def bookcase(s, x, y, w, h, seed):
    s.box(x, y, 0, w, 5, h, WOOD)
    s.box(x + 1, y + 5, 1, w - 2, 0.3, h - 2, "#635054")
    for i, z in enumerate(range(2, h - 4, 9)):
        volumes(s, x + 2, y + 4, z + 1, int((w - 3) / 2.7), seed + i * 34)
        s.box(x, y + 3, z, w, 5, 1.3, OAK)
    s.box(x - 0.5, y - 0.5, h, w + 1, 8, 2, OAK)
    for a in [x, x + w - 1.4]:
        s.box(a, y + 5, 0, 1.4, 2.8, h, WOOD)


def forge_room(s):
    s.group("Kiln")
    x, y = 9, 42
    s.box(x, y, 0, 36, 11, 23, "#a56855")
    s.box(x - 1, y - 1, 22, 38, 13, 2.2, SLATE)
    for xx in [x + 5, x + 25]:
        s.drum(xx, y + 4, 24, 3.8, 2.5, 9, "#8f7979")
        s.drum(xx, y + 4, 29, 4.4, 3.0, 2, SLATE)
    s.profile([(14, 2), (39, 2), (39, 14), (34, 19), (19, 19), (14, 14)], 53, 1.2, DARK)
    s.profile(
        [(17, 4), (36, 4), (36, 12), (32, 16), (21, 16), (17, 12)], 54.2, 0.6, "#c75945"
    )
    for i, h in enumerate([4, 7, 6, 9, 5, 7]):
        xx = 18 + i * 2.7
        s.profile(
            [(xx, 4), (xx + 2.7, 4 + h), (xx + 3.4, 4)],
            55,
            0.6,
            GOLD if i % 2 else "#ef9053",
        )
    for xx in [18, 23, 28, 33]:
        s.box(xx, 56, 3, 1.2, 1, 11, DARK)
    s.group("Tool board")
    s.box(57, 35, 10, 37, 1.2, 21, WOOD)
    s.box(58, 36.4, 11, 35, 0.5, 19, "#b59170")
    for i in range(6):
        x = 60 + i * 5.8
        s.box(x, 37, 14 + i % 3, 1.4, 0.8, 10 - i % 3, DARK)
        s.box(x - 0.8, 37.3, 22, 3, 0.8, 3.5, SLATE if i % 2 else GOLD)
        s.box(x - 0.5, 37.5, 13 + i % 3, 2.2, 0.75, 4, BRICK)
    s.group("Signal scope")
    table(s, 8, 70, 37, 11, 10)
    monitor(s, 10, 72, 11, 17, 11)
    for x in (30, 35):
        s.drum(x, 75, 11, 2, 1.3, 4, "#8a9aa2")
        s.drum(x, 75, 15, 1.7, 1, 1, GOLD)
    s.group("Relay cabinet")
    for i in range(2):
        x = 183 + i * 21
        s.box(x, 37, 0, 19, 8, 29, SLATE)
        s.box(x + 1, 45, 1, 17, 0.75, 27, DARK)
        for j in range(4):
            z = 3 + j * 6
            s.box(x + 2, 45.8, z, 15, 0.5, 4, "#697e89")
            s.box(x + 3, 46.4, z + 1, 6, 0.2, 1, PALE if j % 2 else GOLD)
            for n in range(2):
                s.box(x + 12 + n * 2.2, 46.4, z + 1, 1, 0.3, 1.2, BRICK if n else LEAF)
    s.group("Parts trolley")
    cabinet(s, 188, 87, 24, 10, 12, 2)
    for x in [190, 201]:
        s.box(x, 88, 13.5, 8, 6, 1.7, SLATE)
        for i in range(2):
            s.drum(x + 2 + i * 3.5, 91, 15, 1.5, 1, 1.4, GOLD)
    s.group("Solder bench")
    table(s, 17, 111, 41, 11, 13)
    paper(s, 38, 114, 14, 11)
    monitor(s, 18, 111, 14, 12, 8)
    s.box(50, 115, 14, 4, 3, 3, TEAL)
    s.group("Kiln vents")
    for x in [3, 146, 163, 225]:
        s.box(x, 34.3, 17, 12, 1, 9, SLATE)
        for z in (19, 22, 25):
            s.box(x + 2, 35.4, z, 8, 0.35, 0.8, DARK)
    s.group("Shop stool")
    for x in [28, 212]:
        s.drum(x, 98, 0, 2, 1.4, 6, DARK)
        s.drum(x, 98, 6, 5, 3, 2, BRICK)


def ledger_room(s):
    s.group("Teller window")
    cabinet(s, 8, 42, 42, 10, 13, 2)
    s.box(8, 44, 14, 42, 2, 14, WOOD)
    s.box(10, 46, 15, 38, 0.5, 11, "#7eac9f")
    for x in range(11, 48, 4):
        s.box(x, 46.6, 15, 1, 0.6, 12, GOLD)
    s.box(7, 42, 28, 44, 6, 2.2, OAK)
    s.box(8, 50, 14, 42, 3, 1.2, CREAM)
    s.group("Balance scales")
    table(s, 11, 75, 31, 9, 10)
    s.box(23, 78, 11, 7, 3, 2, DARK)
    s.box(26, 79, 13, 1.4, 1, 12, GOLD)
    s.box(16, 79, 22, 21, 1.4, 1.4, GOLD)
    for cx in [17, 35]:
        s.box(cx, 79, 17, 0.85, 0.85, 5.3, OAK)
        s.drum(cx + 0.4, 79.5, 16, 4.5, 2, 1.7, GOLD, 8, 1.1)
    s.group("Adding machine")
    cabinet(s, 181, 85, 31, 10, 13, 2)
    s.taper(196, 90, 14.5, 15, 7, 4, 13, 4.8, TEAL)
    s.box(191, 86, 18, 11, 4, 6, CREAM)
    for j in range(3):
        s.box(193, 90, 19 + j * 1.2, 6, 0.35, 0.5, SLATE)
    for i in range(4):
        s.box(191 + i * 2.7, 91, 18, 1.6, 1, 0.75, GOLD)
    s.group("Coin tray")
    s.box(57, 43, 0, 19, 9, 7, WOOD)
    s.box(56, 42, 7, 21, 10, 1.4, TEAL)
    for i, (x, y, h) in enumerate([(60, 47, 4), (67, 45, 5), (71, 48, 3)]):
        for j in range(h):
            s.drum(x, y, 8.4 + j * 1.1, 2.6, 1.8, 1, GOLD if j % 2 else OAK)
    s.group("Ledger cabinet")
    cabinet(s, 179, 38, 36, 9, 23, 4)
    volumes(s, 181, 40, 24.6, 8, 30)
    s.group("Cash counter")
    table(s, 12, 110, 44, 11, 13, TEAL)
    paper(s, 15, 114, 14, 12)
    s.box(32, 113, 14, 13, 6, 2, BRICK)
    s.box(33, 112.8, 16, 11, 5.5, 0.6, OAK)
    s.drum(47, 116, 14, 3.5, 2, 1.2, DARK)
    s.drum(47, 116, 15, 2.8, 1.8, 2.3, GOLD, 8, 0.45)
    s.group("Exchange windows")
    for x in [6, 61, 151, 211]:
        back_window(s, x, 34, 10, 23, 19)
    s.group("Exchange clock")
    clock(s, 120, 35, 25, 5.8)
    s.group("Exchange topiary")
    fern(s, 224, 65, 0.85)
    fern(s, 221, 117)


def counsel_room(s):
    s.group("Bookcase")
    bookcase(s, 5, 37, 43, 28, 13)
    s.group("Atlas shelves")
    bookcase(s, 184, 37, 48, 27, 94)
    s.group("Brass orrery")
    x, y = 34, 78
    s.drum(x, y, 0, 7, 4, 2, DARK)
    s.drum(x, y, 2, 5, 3, 7, WOOD, 8, 0.62)
    s.drum(x, y, 9, 12, 6, 1.8, OAK)
    # Open polygonal meridian, with separate sun and planet on the brass arm.
    for i in range(16):
        a, b = i * pi / 8, (i + 1) * pi / 8
        points = [
            (x + r * cos(t), 21 + r * sin(t))
            for t, r in [(a, 11), (b, 11), (b, 9.5), (a, 9.5)]
        ]
        s.profile(points, y, 0.95, GOLD)
    s.drum(x, y, 11, 1.6, 1.2, 9, OAK)
    s.drum(x, y, 18, 5.5, 3.5, 4, "#719ca1", 10, 1.03)
    s.drum(x, y, 22, 5.7, 3.6, 4, GLASS, 10, 0.45)
    s.box(x + 3, y + 0.5, 20, 11, 1, 1.2, GOLD)
    s.drum(x + 12, y + 1, 21, 2.2, 1.7, 3, BRICK, 7, 0.65)
    s.group("Reading desk")
    table(s, 9, 111, 42, 11, 12)
    paper(s, 13, 112, 13, 12, 7)
    paper(s, 25.4, 112, 13, 12, 7)
    s.box(25, 112, 13.5, 0.8, 7, 0.4, BRICK)
    s.drum(43, 115, 13, 2.5, 1.8, 3, TEAL)
    s.profile([(43, 15), (44, 22), (48, 24), (46, 18)], 115, 1, CREAM)
    s.group("Specimen fern")
    fern(s, 213, 109, 1.35)
    s.group("Atlas stand")
    x, y = 187, 80
    s.box(x + 3, y + 1, 0, 10, 5, 2, DARK)
    s.box(x + 6, y + 2, 2, 4, 3, 8, WOOD)
    s.box(x - 3, y - 1, 10, 23, 10, 2, OAK)
    for i in range(2):
        paper(s, x - 2 + i * 10.8, y, 12, 10, 7)
    s.group("Card catalogue")
    cabinet(s, 62, 43, 29, 8, 14, 3)
    for xx in [72, 80]:
        s.box(xx, 51.7, 2, 0.8, 0.4, 12, WOOD)
    s.group("Clerestory windows")
    for xx in [54, 79, 141, 161]:
        back_window(s, xx, 34, 12, 17, 21, True)
    s.group("Reading stool")
    s.drum(58, 101, 0, 3, 2, 6, WOOD)
    s.drum(58, 101, 6, 5, 3, 2.2, "#a88094")


def harbor_room(s):
    s.group("Helm")
    x, y = 28, 51
    s.box(x - 8, y - 1, 0, 16, 4, 2.2, WOOD)
    s.box(x - 2, y, 2, 4, 2.4, 12, WOOD)
    for i in range(8):
        a = i * pi / 4
        dx, dz = cos(a), sin(a)

        def p(r, width):
            return x + r * dx - width * dz, 18 + r * dz + width * dx

        s.profile([p(0, -0.75), p(14, -0.75), p(14, 0.75), p(0, 0.75)], y + 2, 1.3, OAK)
        circular_face(s, x + 13 * dx, y + 2.9, 18 + 13 * dz, 1.4, 1.4, WOOD, 0.7)
    for i in range(12):
        a, b = i * pi / 6, (i + 1) * pi / 6
        pts = [
            (x + r * cos(t), 18 + r * sin(t))
            for t, r in [(a, 10), (b, 10), (b, 7.7), (a, 7.7)]
        ]
        s.profile(pts, y + 3, 1.1, WOOD)
    circular_face(s, x, y + 4.2, 18, 2.7, 2.7, GOLD)
    s.group("Chart table")
    table(s, 7, 78, 44, 13, 12, WOOD)
    s.box(10, 79, 13, 36, 9, 0.45, PAPER)
    for xx, yy, ww in [(13, 80, 8), (18, 81, 5), (33, 84, 7), (36, 82, 3), (28, 80, 3)]:
        s.slab(octagon(xx, yy, ww, 2.5, 0.7), 13.45, 0.2, "#80b1a2")
    for xx in [9, 45]:
        s.box(xx, 78.6, 13, 2.4, 10, 1.8, CREAM)
    s.group("Rope reel")
    x, y = 196, 87
    s.drum(x, y, 0, 7, 4, 2.5, WOOD)
    for j in range(5):
        s.drum(x, y, 2 + j * 1.4, 5.7, 3.5, 1.2, CREAM if j % 2 else OAK)
    s.drum(x, y, 9, 7, 4, 2, WOOD)
    s.drum(x, y, 11, 1.7, 1.4, 1.5, DARK)
    s.group("Buoy rack")
    s.box(182, 38, 0, 39, 8, 2.4, WOOD)
    s.box(184, 39, 2, 2, 2, 21, WOOD)
    s.box(217, 39, 2, 2, 2, 21, WOOD)
    s.box(183, 39, 21, 37, 2.5, 2, OAK)
    for i, col in enumerate([BRICK, TEAL, GOLD]):
        x = 190 + i * 11
        s.box(x - 0.5, 41, 16, 1, 1, 6, CREAM)
        s.drum(x, 42, 4, 2.3, 1.7, 4, CREAM, 8, 1.6)
        s.drum(x, 42, 8, 3.7, 2.7, 5, col)
        s.drum(x, 42, 13, 3.7, 2.7, 4, CREAM, 8, 0.45)
    s.group("Radio desk")
    cabinet(s, 14, 110, 38, 11, 12, 2)
    monitor(s, 16, 112, 13.5, 17, 9)
    for i in range(3):
        s.drum(37 + i * 4, 115, 13.5, 1.3, 1, 2, SLATE)
    s.box(44, 111, 13.5, 1.1, 1, 14, DARK)
    s.group("Cargo crate")
    for x, y, z in [(209, 109, 0), (192, 110, 0), (210, 108, 8)]:
        s.box(x, y, z, 16, 8, 8, WOOD)
        for xx in (x + 1, x + 12):
            s.box(xx, y - 0.2, z, 2.5, 8.5, 8.5, OAK)
        s.box(x + 5, y + 8, z + 3, 5, 0.5, 2.3, CREAM)
    s.group("Chart house portholes")
    for x in [13, 47, 78, 158, 226]:
        circular_face(s, x, 34.5, 22, 7.4, 7.4, OAK)
        circular_face(s, x, 35.4, 22, 6, 6, DARK)
        circular_face(s, x, 36.4, 22, 4.9, 4.9, GLASS)
        s.box(x - 3, 37.3, 23, 4, 0.3, 1, PALE)
    s.group("Signal flags")
    s.box(52, 35, 28, 46, 0.5, 0.8, WOOD)
    for i, col in enumerate([BRICK, GOLD, TEAL, CREAM, BRICK]):
        x = 53 + i * 9
        s.profile(
            [(x, 28), (x + 7, 28), (x + 7, 21), (x + 3, 19), (x, 21)], 35.6, 0.45, col
        )
        s.box(x + 2, 36.1, 22, 1.4, 0.3, 5, WHITE)
    s.group("Harbour stool")
    s.drum(57, 98, 0, 2, 1.4, 6, WOOD)
    s.drum(57, 98, 6, 4.7, 3, 2, TEAL)


def finishing(s, k):
    # Each ring is fitted for its district, with the central model footprint clear.
    rug = PACKS[k][3]
    trim = blend(rug, CREAM, 0.51)
    s.group("Training carpet • district weave")
    if k == "forge":
        for x in [77, 154]:
            for y in [67, 100]:
                for step in range(3):
                    xx = x + step * 3.3
                    s.slab(
                        [(xx, y + 3), (xx + 2, y), (xx + 4, y), (xx + 2, y + 3)],
                        0.77,
                        0.15,
                        GOLD,
                    )
        for xx in [68, 164]:
            s.slab(octagon(xx, 77, 8, 22, 1.6), 0.20, 0.8, SLATE)
            for yy in range(79, 95, 4):
                s.box(xx + 1, yy, 1, 6, 1.6, 0.2, "#abb3aa")
        s.group("Service pipes")
        for z in [24, 27]:
            s.box(152, 35, z, 28, 1.2, 1.5, "#a19080")
            for xx in [153, 165, 177]:
                s.box(xx, 35, z - 0.6, 1.3, 1.7, 2.7, SLATE)
        s.group("Bench bin")
        for x in [42, 47]:
            s.box(x, 113, 14, 3.7, 4, 2.1, BRICK)
    if k == "ledger":
        for x in [80, 160]:
            for y in range(71, 105, 5):
                s.slab(
                    [(x - 1.8, y), (x, y - 1.4), (x + 1.8, y), (x, y + 1.4)],
                    0.77,
                    0.12,
                    trim,
                )
        s.group("Teller queue")
        for x in [19, 41, 62]:
            s.drum(x, 61, 0, 2.4, 1.5, 1.1, DARK)
            s.drum(x, 61, 1, 1.0, 0.8, 7, GOLD)
            s.drum(x, 61, 8, 1.7, 1.2, 1.8, GOLD, 8, 0.8)
        for x in [19, 41]:
            for j, h in enumerate([6.4, 5, 4.2, 5, 6.4]):
                s.box(x + j * 4.3, 61, h, 4.4, 0.8, 1.2, "#ad6776")
    if k == "counsel":
        for x in [80, 151]:
            for y in [73, 96]:
                emboss(
                    s, ["..#..", "..#..", "#####", "..#..", "..#.."], x, y, 0.76, trim
                )
        s.group("Reading lamp")
        s.drum(15, 112, 13, 2.4, 1.6, 1, DARK)
        s.drum(15, 112, 14, 1, 0.8, 6, GOLD)
        s.drum(15, 112, 19, 4.3, 2.3, 3, "#82ad88", 8, 0.6)
        s.group("Returned books")
        for i, c in enumerate(BOOKS[:3]):
            s.box(179 + i % 2, 110, 1.4 * i, 10, 6, 1.35, c)
            s.box(179 + i % 2 + 0.7, 116, 1.4 * i + 0.35, 8, 0.25, 0.65, PAPER)
    if k == "harbor":
        for x in [92, 139]:
            for y in [74, 95]:
                emboss(s, ["..##..##.", ".##.##.##", "##......#"], x, y, 0.77, trim)
        for i in range(8):
            a = i * pi / 4
            dx, dy = cos(a), sin(a)
            px, py = -dy, dx
            tip = (120 + dx * 21, 87 + dy * 12)
            left = (120 + dx * 8 + px * 2.2, 87 + dy * 4.4 + py * 1.4)
            right = (120 + dx * 8 - px * 2.2, 87 + dy * 4.4 - py * 1.4)
            s.slab([(120 + dx * 8, 87 + dy * 4.4), left, tip], 0.76, 0.11, trim)
            s.slab(
                [(120 + dx * 8, 87 + dy * 4.4), right, tip],
                0.76,
                0.11,
                blend(rug, DARK, 0.25),
            )
        s.group("Notice chart")
        s.box(61, 36, 8, 30, 1.1, 11, WOOD)
        s.box(62, 37.2, 9, 28, 0.4, 9, PAPER)
        for x, z in [(65, 11), (68, 13), (80, 10)]:
            s.box(x, 37.7, z, 5, 0.2, 2, TEAL)
        s.group("Lifebuoy")
        for i in range(12):
            a, b = i * pi / 6, (i + 1) * pi / 6
            pts = [
                (175 + r * cos(t), 16 + r * sin(t))
                for t, r in [(a, 6), (b, 6), (b, 3.4), (a, 3.4)]
            ]
            s.profile(pts, 36, 1.3, BRICK if i % 3 == 0 else WHITE)


def interior(kind):
    s = Scene()
    shell(s, kind)
    vault(s, kind)
    {
        "forge": forge_room,
        "ledger": ledger_room,
        "counsel": counsel_room,
        "harbor": harbor_room,
    }[kind](s)
    finishing(s, kind)
    return s
