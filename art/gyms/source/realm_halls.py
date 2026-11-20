"""Atlas hall families. All doors meet the same local (48, 102, 0) landing."""

from random import Random

from buildings import (
    CREAM,
    DARK,
    GLASS,
    GOLD,
    OAK,
    PALE,
    SLATE,
    WHITE,
    clock,
    column,
    door,
    exterior,
    hipped,
    octagon,
    pane,
)
from mesh import Scene, blend

FAMILIES = {
    "forge": ("forge", "gantry", "hangar"),
    "ledger": ("ledger", "exchange", "counting"),
    "counsel": ("counsel", "rotunda", "court"),
}
ROOFS = {
    "forge": ("#ef6340", "#257ca2", "#e5a53b"),
    "ledger": ("#189980", "#e4a33c", "#337ea5"),
    "counsel": ("#9752c6", "#d77082", "#5165aa"),
}


def hall_pair(kind, realm_id, seed):
    rng = Random(f"{seed}/{realm_id}/halls")
    return list(
        zip(rng.sample(FAMILIES[kind], 2), rng.sample(ROOFS[kind], 2), strict=True)
    )


def hall(family, roof, rng):
    if family in ("forge", "ledger", "counsel"):
        return exterior(family, roof)
    s = Scene()
    w = rng.choice([68, 74, 80])
    x = 48 - w / 2
    h = rng.randint(23, 31)
    s.slab(octagon(x - 2, 60, w + 4, 38, 3), 0, 2, SLATE)
    industrial = family in ("gantry", "hangar")
    wall = "#739baa" if industrial else CREAM
    s.box(x, 62, 2, w, 31, h, wall)
    for px in (x + 4, x + w - 17):
        pane(s, px, 93, 9, 13, h - 11, not industrial)
    s.box(x - 2, 60, h + 2, w + 4, 35, 2.4, DARK)
    z = h + 4.4
    if family == "gantry":
        # The crane straddles a low, flat workshop. Its open truss reads against the sky.
        s.box(x - 1, 61, z, w + 2, 33, 2, roof)
        for dx in (-19, 9):
            s.box(48 + dx, 67, z + 2, 13, 12, 4, SLATE)
            for j in range(3):
                s.box(49 + dx + j * 4, 68, z + 6, 1.3, 10, 1, GLASS)
        steel = "#e18931"
        for gx in (x - 1, x + w - 3):
            s.box(gx, 79, 2, 4, 5, z + 24, steel)
            s.box(gx - 1, 78, 2, 6, 7, 4, SLATE)
        for dz in (18, 27):
            s.box(x - 2, 77, z + dz, w + 4, 5, 2.5, GOLD)
        for dx in range(0, w - 7, 12):
            gx = x + dx
            s.profile(
                [
                    (gx, z + 20),
                    (gx + 2.5, z + 20),
                    (gx + 12, z + 27),
                    (gx + 9.5, z + 27),
                ],
                78,
                3,
                steel,
            )
        s.box(54, 77, z + 15, 9, 7, 5, SLATE)
        s.box(58, 82, z + 6, 1.4, 1, 10, DARK)
        s.box(55, 82, z + 5, 4.4, 1.1, 2, GOLD)
    elif family == "hangar":
        # Broad, ribbed barrel vault with a glazed roof monitor and a roller shutter.
        profile = [
            (x - 2, z),
            (x + w + 2, z),
            (x + w - 2, z + 10),
            (x + w - 14, z + 20),
            (x + 14, z + 20),
            (x + 2, z + 10),
        ]
        s.profile(profile, 61, 33, roof)
        for yy in (62, 72, 82, 92):
            s.profile(
                [(a, b + 1) for a, b in profile], yy, 1.6, blend(roof, WHITE, 0.48)
            )
        s.box(31, 69, z + 20, 34, 11, 5, GLASS)
        s.box(30, 68, z + 25, 36, 13, 1.6, SLATE)
        s.box(x + 3, 95.2, 3, 19, 1, h - 4, DARK)
        for j in range(4):
            s.box(x + 4, 96.2, 5 + j * 4, 17, 0.4, 3, "#99b1ae")
    elif family in ("exchange", "counting"):
        if family == "counting":
            # A merchant hall with a full-height stepped canal gable.
            hipped(s, 48, 77, z, w + 4, 36, 19, w - 16, 5, roof)
            for i in range(5):
                s.box(31 + i * 3, 90, z - 1 + i * 4, 34 - i * 6, 5, 4.2, wall)
                s.box(30 + i * 3, 90, z + 2.5 + i * 4, 36 - i * 6, 6, 1.2, roof)
            clock(s, 48, 95.5, z + 5, 5.4)
        else:
            # A low banking arcade with an offset square clock tower.
            hipped(s, 48, 77, z, w + 4, 36, 10, w - 12, 15, roof)
            tx = rng.choice([x + 8, x + w - 9])
            s.box(tx - 7.5, 72, z, 15, 12, 24, OAK)
            clock(s, tx, 84, z + 16, 6)
            hipped(s, tx, 78, z + 24, 19, 16, 13, 3, 2, roof)
        for px in (x + 1, x + w - 2):
            column(s, px, 94, 2, h)
    else:
        if family == "rotunda":
            radius = w * 0.44
            s.drum(48, 77, z, radius, 16, 7, CREAM, 12)
            for frac, base, cap, dz in [
                (1.08, 0, 1, 4),
                (1, 4, 0.84, 8),
                (0.84, 12, 0.52, 8),
                (0.52, 20, 0.14, 5),
            ]:
                s.drum(
                    48,
                    77,
                    z + 7 + base,
                    radius * frac,
                    17 * frac,
                    dz,
                    roof,
                    12,
                    cap / frac,
                )
            s.drum(48, 77, z + 32, 2, 1.3, 4, GOLD)
        else:
            hipped(s, 48, 77, z, w + 5, 36, 12, w - 15, 8, roof)
        # A deep columned porch makes both court silhouettes legible at map scale.
        for px in (26, 34, 62, 70):
            column(s, px, 96, 2, h + 1)
        s.profile([(22, z - 1), (74, z - 1), (48, z + 13)], 86, 13, roof)
        s.profile([(26, z + 0.7), (70, z + 0.7), (48, z + 10)], 98.5, 1, WHITE)
        s.drum(48, 81, z + 1, 3, 2, 2, PALE)
    if industrial:
        # A high-contrast work entrance reads even when the crane is seen end-on.
        s.box(34, 92, h - 1, 28, 8, 2.2, SLATE)
        for j in range(5):
            s.box(35 + j * 5, 99, h, 3, 1.2, 1.5, GOLD)
        if family == "hangar":
            for gx in (37, 44, 51, 58):
                s.box(gx, 70, z + 26.6, 2, 9, 1.2, PALE)
    elif family in ("exchange", "counting"):
        # Tiled roofs, glazed dormers and a striped awning frame the public counter.
        for gx in (x + 16, x + w - 26):
            s.box(gx, 78, z + 1, 10, 8, 8, CREAM)
            s.profile([(gx - 2, z + 9), (gx + 12, z + 9), (gx + 5, z + 15)], 76, 11, roof)
            s.box(gx + 2, 86, z + 2, 6, 1.2, 6, GLASS)
        for j in range(7):
            s.box(34 + j * 4, 92, h, 4, 7, 2.3, PALE if j % 2 else roof)
    else:
        # A seal and facing banners distinguish the court from the counting house.
        s.box(45, 99.5, z + 3, 6, .8, 4.5, GOLD)
        for gx in (x + 4, x + w - 9):
            s.box(gx, 94, 11, 5, 1.2, 12, roof)
            s.box(gx - 1, 94, 23, 7, 1.8, 1.6, GOLD)
    door(s, 93, roof, "open")
    s.box(37, 97, 0, 22, 5, 1.4, OAK)
    return s
