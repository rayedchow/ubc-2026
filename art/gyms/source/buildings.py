"""Exterior architecture and small details shared with the cutaway rooms."""

from math import cos, sin, pi
from mesh import Scene, blend

DARK = "#403547"
WOOD = "#ae7750"
OAK = "#d7a75f"
CREAM = "#f3dfac"
GOLD = "#f4c366"
GLASS = "#58d0d7"
WHITE = "#fff1c8"
LEAF = "#4e9669"
TEAL = "#477e83"
PALE = "#a2e0d9"
SLATE = "#58667a"
BRICK = "#c56850"

PACKS = {
    "forge": ("Cinder Relay", "#d66852", "#8a9296", "#896583"),
    "ledger": ("Mint Exchange", "#58a78d", "#bfb298", "#468c83"),
    "counsel": ("Aster Archive", "#876cb3", "#b98e73", "#826594"),
    "harbor": ("Beacon Quay", "#4f8aaf", "#bd9a71", "#528d9b"),
}

MARKS = {
    "forge": [
        "....#....",
        "...##..#.",
        "..###.##.",
        ".######..",
        ".##.####.",
        "###..###.",
        "##...###.",
        ".##.###..",
        "..####...",
    ],
    "ledger": [
        "...###...",
        ".#######.",
        "##.....##",
        ".#######.",
        ".#.....#.",
        ".#######.",
        ".#.....#.",
        ".#######.",
        "...###...",
    ],
    "counsel": [
        ".........",
        "###...###",
        "#..#.#..#",
        "#...#...#",
        "#...#...#",
        "#...#...#",
        "####.####",
        "...###...",
        "....#....",
    ],
    "harbor": [
        "...###...",
        "...#.#...",
        "...###...",
        ".#######.",
        "....#....",
        "#...#...#",
        "##..#..##",
        ".#######.",
        "...###...",
    ],
}

LETTERS = {
    "F": ["111", "100", "110", "100", "100"],
    "O": ["010", "101", "101", "101", "010"],
    "R": ["110", "101", "110", "101", "101"],
    "G": ["011", "100", "101", "101", "011"],
    "E": ["111", "100", "110", "100", "111"],
    "M": ["101", "111", "111", "101", "101"],
    "I": ["111", "010", "010", "010", "111"],
    "N": ["101", "111", "111", "111", "101"],
    "T": ["111", "010", "010", "010", "010"],
    "A": ["010", "101", "111", "101", "101"],
    "L": ["100", "100", "100", "100", "111"],
    "S": ["011", "100", "010", "001", "110"],
    "P": ["110", "101", "110", "100", "100"],
}


def emboss(s, rows, x, y, z, color, unit=1, ground=False):
    for j, row in enumerate(rows):
        i = 0
        while i < len(row):
            if row[i] not in "#1":
                i += 1
                continue
            end = i + 1
            while end < len(row) and row[end] in "#1":
                end += 1
            if ground:
                s.box(
                    x + i * unit, y + j * unit, z, (end - i) * unit, unit, 0.13, color
                )
            else:
                s.box(
                    x + i * unit,
                    y,
                    z + (len(rows) - 1 - j) * unit,
                    (end - i) * unit,
                    0.22,
                    unit,
                    color,
                )
            i = end


def plaque(s, word, cx, y, z):
    rows = [".".join(LETTERS[c][r] for c in word) for r in range(5)]
    width = len(rows[0])
    cx = round(cx - width / 2) + width / 2
    s.box(cx - width / 2 - 3, y - 1, z - 2, width + 6, 2, 9, DARK)
    s.box(cx - width / 2 - 2, y + 1, z - 1, width + 4, 0.45, 7, "#425968")
    emboss(s, rows, cx - width / 2, y + 1.5, z, WHITE)


def octagon(x, y, w, d, cut):
    return [
        (x + cut, y),
        (x + w - cut, y),
        (x + w, y + cut),
        (x + w, y + d - cut),
        (x + w - cut, y + d),
        (x + cut, y + d),
        (x, y + d - cut),
        (x, y + cut),
    ]


def pane(s, x, y, z, w, h, arched=False):
    if arched:
        s.profile(
            [
                (x, z),
                (x + w, z),
                (x + w, z + h - 3),
                (x + w - 3, z + h),
                (x + 3, z + h),
                (x, z + h - 3),
            ],
            y,
            1.3,
            DARK,
        )
    else:
        s.box(x, y, z, w, 1.3, h, DARK)
    s.box(x + 1.5, y + 1.3, z + 1.4, w - 3, 0.4, h - 4.5, GLASS)
    s.box(x + 2, y + 1.75, z + h * 0.61, w - 4, 0.3, max(1, h * 0.20), PALE)
    s.box(x + 2, y + 1.8, z + 2.7, 1.2, 0.35, h * 0.37, PALE)
    s.box(x + w * 0.5 - 0.5, y + 2, z + 1, 1.4, 0.5, h - 2, WOOD)
    s.box(x - 1, y + 0.3, z - 1, w + 2, 2.6, 1.6, OAK)


def planter(s, x, y, w, count=3):
    s.box(x, y, 1, w, 4, 3, WOOD)
    s.box(x - 0.5, y - 0.3, 3, w + 1, 4.6, 1.3, OAK)
    for i in range(count):
        cx = x + (i + 0.5) * w / count
        s.drum(cx, y + 1.8, 4, 3.2, 1.8, 2.8, LEAF, 7, 0.7)
        s.drum(cx + 1.3, y + 2.6, 6.1, 1.9, 1.3, 1.1, WHITE, 5, 0.8)
        s.box(cx + 0.8, y + 2.2, 7.1, 1.1, 1, 0.6, GOLD)


def column(s, x, y, z, h):
    s.box(x - 2.2, y - 0.8, z, 4.4, 3, 2.5, CREAM)
    s.box(x - 1.5, y, z + 2, 3, 2, h - 4, CREAM)
    s.box(x - 0.8, y + 1.95, z + 3, 0.65, 0.25, h - 6, WHITE)
    s.box(x - 2.3, y - 0.8, z + h - 3, 4.6, 3.2, 3, OAK)


def door(s, y, accent, status):
    s.group("Entry • transom and door")
    s.box(39, y, 2, 18, 2, 26, DARK)
    s.box(40.5, y + 2, 3, 15, 1, 23, WOOD)
    s.box(42, y + 3, 4, 12, 1, 19, "#554351" if status != "open" else "#344452")
    s.box(42, y + 4, 16, 12, 0.4, 7, GLASS)
    s.box(43, y + 4.4, 20, 10, 0.25, 2, PALE)
    s.box(47.4, y + 4.6, 4, 1.2, 0.4, 19, DARK)
    s.box(50, y + 4.4, 11, 1.4, 0.8, 2.4, GOLD)
    s.box(39, y + 0.5, 26, 18, 3, 2, accent)
    if status == "exclusive":
        s.box(39, y + 5.2, 10, 18, 0.8, 3.2, BRICK)
        s.box(47, y + 6, 9, 3, 0.6, 4, GOLD)
    if status == "soon":
        for z in [8, 14]:
            s.box(40, y + 5, z, 16, 0.8, 2.4, OAK)
    for x in [36, 58]:
        s.box(x, y + 1, 15, 2.3, 1.5, 6, DARK)
        s.box(x + 0.35, y + 2.5, 16, 1.6, 0.6, 3.5, GOLD)


def hipped(s, cx, cy, z, w, d, h, topw, topd, roof):
    for f in range(4):
        a = f / 4
        b = (f + 1) / 4
        low_w = w + (topw - w) * a
        low_d = d + (topd - d) * a
        up_w = w + (topw - w) * b
        up_d = d + (topd - d) * b
        s.taper(
            cx,
            cy,
            z + h * a,
            low_w + 0.8,
            low_d + 0.65,
            h / 4,
            up_w,
            up_d,
            blend(roof, WHITE, f * 0.037),
        )
    s.box(
        cx - topw / 2 - 0.7,
        cy - topd / 2 - 0.35,
        z + h,
        topw + 1.4,
        topd + 0.7,
        1.5,
        blend(roof, WHITE, 0.28),
    )


def clock(s, cx, y, z, r):
    for size, depth, col in [(r, 0, DARK), (r - 0.9, 0.65, GOLD), (r - 2, 1.3, CREAM)]:
        s.profile(
            [
                (cx + size * cos(i * pi / 6), z + size * sin(i * pi / 6))
                for i in range(12)
            ],
            y + depth,
            0.72,
            col,
        )
    s.box(cx - 0.5, y + 2.08, z, 1, 0.4, r - 2.3, DARK)
    s.box(cx, y + 2.1, z - 0.6, r - 2.5, 0.5, 1.2, DARK)


def forge(s, r):
    s.group("Kiln • brick envelope")
    s.box(7, 58, 3, 82, 35, 29, "#ca8c70")
    for row in range(5):
        for x in range(9 + (row % 2) * 4, 85, 9):
            s.box(
                x,
                93.05,
                4 + row * 5,
                5,
                0.35,
                1.15,
                "#dda583" if row % 2 else "#aa705f",
            )
    for x in (8, 31, 63, 86):
        s.box(x, 92, 3, 2.2, 2.2, 28, "#855b5a")
    s.group("Kiln • sawtooth monitors")
    s.box(4, 54, 31, 88, 41, 3, DARK)
    for x in [5, 34, 63]:
        s.profile([(x, 34), (x + 28, 34), (x + 5, 50), (x, 50)], 55, 39, r)
        s.profile(
            [(x + 2, 36), (x + 22, 36), (x + 5, 46), (x + 2, 46)], 94, 1.0, "#4d717d"
        )
        s.profile([(x + 4, 37), (x + 17, 37), (x + 5, 44), (x + 4, 44)], 95, 0.4, GLASS)
        s.box(x + 3, 54.5, 49, 3.2, 40, 2, blend(r, WHITE, 0.45))
        for yy in [62, 71, 80, 89]:
            s.profile(
                [(x + 5, 50.3), (x + 28, 34.3), (x + 28, 35.1), (x + 5, 51.1)],
                yy,
                1.1,
                blend(r, DARK, 0.26),
            )
        for xx in [10, 18]:
            zz = 50 - (xx - 5) * 16 / 23
            s.box(x + xx, 57, zz - 0.6, 0.9, 34, 1.3, blend(r, WHITE, 0.13))
    s.group("Kiln • banded stacks")
    for x, y, h in [(17, 69, 62), (27, 65, 56)]:
        s.taper(x, y, 30, 8, 6, h - 30, 6.4, 5, BRICK)
        for z in range(39, h, 9):
            s.box(x - 3.7, y - 3, z, 7.4, 6, 2, "#e3a68b")
        s.box(x - 4.5, y - 3.6, h - 2, 9, 7.2, 3, DARK)
        s.box(x - 2.9, y - 2.3, h + 1, 5.8, 4.6, 0.3, "#554957")
    s.group("Kiln • gauges and glazing")
    for x in (11, 67):
        pane(s, x, 93, 10, 17, 14)
    plaque(s, "FORGE", 48, 97, 28)
    planter(s, 8, 94, 20, 4)
    planter(s, 70, 94, 16)


def ledger(s, r):
    s.group("Exchange • sandstone body")
    s.box(8, 61, 3, 80, 32, 30, "#e2c39c")
    for x in [9, 30, 64, 85]:
        column(s, x, 93, 3, 26)
    for x in [15, 68]:
        pane(s, x, 93, 9, 12, 17, True)
    s.group("Exchange • copper mansard")
    s.box(5, 58, 31, 86, 38, 3, DARK)
    s.box(5, 58, 34, 86, 38, 2, CREAM)
    hipped(s, 48, 76, 36, 86, 38, 16, 66, 21, r)
    for cx in [20, 76]:
        s.box(cx - 5, 77, 44, 10, 13, 9, CREAM)
        pane(s, cx - 3.5, 90, 45, 7, 8)
        s.profile([(cx - 6, 53), (cx, 58), (cx + 6, 53)], 77, 14, blend(r, DARK, 0.25))
    for xx in [14, 27, 39, 51, 63, 75]:
        s.box(xx, 66.5, 53.5, 0.95, 19, 1.0, blend(r, DARK, 0.26))
    s.group("Exchange • clock pediment")
    s.box(33, 83, 26, 30, 13, 6, CREAM)
    s.profile([(30, 32), (48, 46), (66, 32)], 84, 13, DARK)
    s.profile([(33, 33), (48, 44), (63, 33)], 85, 12.6, CREAM)
    clock(s, 48, 97.7, 36.5, 5)
    for x in [34, 62]:
        column(s, x, 96, 2, 26)
    planter(s, 11, 95, 18)
    planter(s, 68, 95, 17)


def counsel(s, r):
    s.group("Archive • half-timber hall")
    s.box(7, 61, 3, 80, 31, 31, "#e8ceae")
    for x in [8, 27, 36, 60, 78, 85]:
        s.box(x, 92, 2, 2, 1.3, 32, WOOD)
    s.box(7, 92, 8, 80, 1.2, 2, WOOD)
    for x in [13, 66]:
        pane(s, x, 92, 12, 13, 15, True)
    s.group("Archive • tiled hall roof")
    s.box(5, 60, 32, 85, 35, 3, DARK)
    hipped(s, 48, 77, 35, 85, 36, 18, 58, 6, r)
    for row in range(4):
        t = (row + 0.15) / 4
        yy = 95 - 15 * t
        zz = 35 + 18 * t
        width = 84 - 27 * t
        s.box(48 - width / 2, yy - 0.6, zz, width, 1.1, 0.7, blend(r, DARK, 0.31))
        for xx in range(12 + row % 2 * 4, 87, 9):
            if abs(xx - 48) < width / 2 - 3:
                s.profile(
                    [(xx, zz), (xx + 0.8, zz), (xx + 0.8, zz + 3.3), (xx, zz + 3.3)],
                    yy - 2.5,
                    0.65,
                    blend(r, DARK, 0.19),
                )
    s.group("Archive • stepped frontispiece")
    for i in range(4):
        s.box(33 + i * 3, 83, 29 + i * 4, 30 - i * 6, 14, 4.2, CREAM)
        s.box(32 + i * 3, 82, 32 + i * 4, 32 - i * 6, 15.5, 1.3, OAK)
    plaque(s, "ATLAS", 48, 98, 29)
    s.group("Archive • stargazer turret")
    s.drum(78, 90, 2, 14, 9.6, 42, "#e0c4a0", 8)
    s.drum(78, 90, 8, 14.2, 9.8, 2.4, OAK, 8)
    s.drum(78, 90, 39, 14.2, 9.8, 3, OAK, 8)
    s.drum(78, 90, 42, 16, 11, 3, DARK, 8)
    s.drum(78, 90, 45, 16.4, 11.8, 7, r, 8, 0.91)
    s.drum(78, 90, 52, 15, 10.7, 7, blend(r, WHITE, 0.1), 8, 0.72)
    s.drum(78, 90, 59, 10.8, 7.7, 5, blend(r, WHITE, 0.22), 8, 0.40)
    s.drum(78, 90, 64, 4.3, 3.1, 2, GOLD, 8, 0.65)
    s.box(77.3, 89.5, 66, 1.4, 1, 5, GOLD)
    s.profile([(76.6, 71), (78, 76), (79.4, 71), (78, 66)], 89.5, 1.4, GOLD)
    s.profile([(74, 71), (78, 72), (82, 71), (78, 70)], 89.5, 1.4, GOLD)
    pane(s, 73, 98.8, 18, 10, 15, True)
    planter(s, 9, 94, 18)
    planter(s, 69, 94, 16)


def harbor(s, r):
    s.group("Harbour • pilot house")
    s.box(26, 61, 3, 62, 32, 28, "#e2dfbb")
    for h in [7, 12, 17, 22, 27]:
        s.box(26, 93, h, 62, 0.55, 1.2, "#8aa4a7")
    for x in [28, 34, 61, 85]:
        s.box(x, 92, 3, 2.5, 2, 27, WOOD)
    pane(s, 29, 93, 12, 7, 11)
    pane(s, 66, 93, 11, 15, 13)
    s.group("Harbour • standing-seam roof")
    s.box(25, 58, 29, 66, 38, 3, DARK)
    hipped(s, 58, 76, 32, 66, 38, 14, 54, 5, r)
    for xx in [37, 46, 55, 64, 73, 82]:
        # Standing seams follow the roof pitch.
        for j in range(7):
            s.box(xx, 92.3 - j * 2.4, 32 + j * 2, 1.2, 2.7, 2.4, blend(r, WHITE, 0.28))
    s.group("Harbour • striped beacon")
    for z, radius, h, col in [
        (3, 11, 18, CREAM),
        (21, 10, 10, BRICK),
        (31, 9.4, 12, CREAM),
        (43, 9, 8, BRICK),
        (51, 8.6, 4, CREAM),
    ]:
        s.drum(17, 85, z, radius, radius * 0.68, h, col, 8, 0.97)
    s.drum(17, 85, 54, 12, 8, 2.5, DARK)
    s.drum(17, 85, 56, 8, 5, 7, GOLD)
    for x in [10, 16.5, 23]:
        s.box(x, 88, 56, 1.5, 1.5, 7, DARK)
    s.drum(17, 85, 63, 11, 7.5, 6, BRICK, 8, 0.22)
    s.drum(17, 85, 69, 2.5, 2, 2, GOLD)
    plaque(s, "PORT", 48, 97, 28)
    s.group("Harbour • mooring posts")
    for x in [9, 83]:
        s.drum(x, 96, 2, 2.4, 1.8, 7, WOOD)
        s.drum(x, 96, 6, 2.5, 1.9, 1.2, CREAM)
    planter(s, 67, 94, 13, 2)


def service_elevation(s, kind):
    """The service door and sash windows are also visible when orbiting the GLB."""
    rear = {"forge": 58, "ledger": 61, "counsel": 61, "harbor": 61}[kind]
    right = {"forge": 89, "ledger": 88, "counsel": 87, "harbor": 88}[kind]
    s.group("Service elevation")
    for y in [65, 78]:
        s.box(right - 0.4, y, 10, 1.1, 8.5, 13, DARK)
        s.box(right + 0.7, y + 0.7, 11, 0.5, 7, 10.3, GLASS)
        s.box(right + 1.2, y + 0.8, 18, 0.25, 6.8, 2.6, PALE)
        s.box(right + 1.5, y + 3.9, 11, 0.4, 0.9, 10.8, WOOD)
        s.box(right - 0.3, y - 0.6, 9, 2.8, 9.7, 1.7, OAK)
    s.box(43, rear - 1.4, 3, 12, 1.7, 22, DARK)
    s.box(44, rear - 1.8, 4, 10, 0.6, 20, WOOD)
    s.box(45, rear - 2.1, 15, 8, 0.4, 7, GLASS)
    s.box(51, rear - 2.5, 11, 1.2, 0.5, 2, GOLD)
    for x in [32, 64]:
        s.box(x, rear - 1, 16, 7, 1, 5, SLATE)
        for h in [17, 19]:
            s.box(x + 0.8, rear - 1.4, h, 5.4, 0.4, 0.8, DARK)


def exterior(kind, roof=None, status="open"):
    s = Scene()
    r = roof or PACKS[kind][1]
    s.group("Foundation and entry steps")
    s.slab(octagon(4, 56, 88, 42, 3), 0, 2.6, SLATE)
    s.box(35, 96, 0, 26, 6, 1.3, "#b3a49d")
    s.box(37, 95, 1.3, 22, 5, 1.3, "#dfc5aa")
    {"forge": forge, "ledger": ledger, "counsel": counsel, "harbor": harbor}[kind](s, r)
    door(s, 93 if kind != "counsel" else 92, r, status)
    service_elevation(s, kind)
    return s
