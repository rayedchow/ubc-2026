"""Trace the renderer's visible ownership pixels into closed, pixel-aligned SVG paths."""

from collections import defaultdict

import numpy as np


def silhouette(mask):
    padded = np.pad(mask, 1)
    neighbours = (
        padded[:-2, 1:-1],
        padded[1:-1, 2:],
        padded[2:, 1:-1],
        padded[1:-1, :-2],
    )
    # Clockwise edges keep the interior on the right, including around holes.
    directions = ((1, 0), (0, 1), (-1, 0), (0, -1))
    corners = ((0, 0), (1, 0), (1, 1), (0, 1))
    edges = defaultdict(set)
    for d, adjacent in enumerate(neighbours):
        dx, dy = corners[d]
        for y, x in zip(*np.nonzero(mask & ~adjacent)):
            edges[int(x) + dx, int(y) + dy].add(d)
    commands = []
    while edges:
        start = point = next(iter(edges))
        d = min(edges[point])
        commands.append(f"M{point[0]} {point[1]}")
        run = 0
        while True:
            choices = edges[point]
            choices.remove(d)
            if not choices:
                del edges[point]
            dx, dy = directions[d]
            point = (point[0] + dx, point[1] + dy)
            run += 1
            if point == start:
                commands.append("z")
                break
            # At a diagonal contact, turn right to keep the two components separate.
            following = next(
                candidate % 4
                for candidate in (d + 1, d, d - 1)
                if candidate % 4 in edges[point]
            )
            if following != d:
                commands.append(f"h{run * dx}" if dx else f"v{run * dy}")
                run = 0
            d = following
    return "".join(commands)


def region_manifest(image, owners, ids):
    if not np.array_equal(owners != 0, np.asarray(image.getchannel("A")) != 0):
        raise ValueError("Every painted atlas pixel must belong to a realm")
    regions = {}
    for index, realm_id in enumerate(ids, 1):
        mask = owners == index
        y, x = np.nonzero(mask)
        if not len(x):
            raise ValueError(f"Realm {realm_id} has no visible pixels")
        regions[realm_id] = {
            "bounds": [
                int(x.min()),
                int(y.min()),
                int(x.max() - x.min() + 1),
                int(y.max() - y.min() + 1),
            ],
            "path": silhouette(mask),
        }
    return {"width": image.width, "height": image.height, "regions": regions}
