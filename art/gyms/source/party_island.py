"""Render the party's grassy clearing with the gym art pack's light, trees and camera."""

from math import cos, pi, sin
from pathlib import Path
from random import Random

from grounds import flower, tree
from mesh import Scene, render
from realms import stamp


def party_island(seed=17):
    rng = Random(seed)
    scene = Scene()
    angles = [i * 2 * pi / 64 for i in range(64)]
    phases = [rng.uniform(0, 2 * pi) for _ in range(3)]

    def shore(a):
        return (
            1
            + 0.067 * sin(3 * a + phases[0])
            + 0.053 * cos(5 * a + phases[1])
            + 0.026 * sin(8 * a + phases[2])
        )

    def ring(radius, z):
        return [
            (121 * radius * shore(a) * cos(a), 79 * radius * shore(a) * sin(a), z)
            for a in angles
        ]

    # Each band uses the same sampled shoreline so its strata meet on the cliffs.
    layers = [
        (1.048, -7),
        (1.02, -5.2),
        (1, -4),
        (0.985, -0.5),
        (0.979, 2.2),
        (0.966, 4.4),
    ]
    stone = ["#70787c", "#a19983", "#797971", "#898579", "#797c78"]
    for band, (lower, upper) in enumerate(zip(layers, layers[1:])):
        bottom, top = ring(*lower), ring(*upper)
        for i, first in enumerate(bottom):
            j = (i + 1) % len(bottom)
            color = (
                "#e6d49f",
                "#bdad8b",
                stone[(i // 3) % len(stone)],
                "#b0a47e",
                "#7fa15f",
            )[band]
            scene.solid(
                [first, bottom[j], top[j], top[i], (0, 0, 0)], [[0, 1, 2, 3]], color
            )
    top = ring(*layers[-1])
    for i, first in enumerate(top):
        scene.solid(
            [(0, 0, 4.4), first, top[(i + 1) % len(top)], (0, 0, 0)],
            [[0, 1, 2]],
            "#95bf73",
        )
    for _ in range(400):
        a = rng.uniform(0, 2 * pi)
        r = rng.random() ** 0.5 * shore(a) * 0.95
        x, y = 121 * r * cos(a), 79 * r * sin(a)
        color = rng.choice(["#89b46c", "#a3c77c", "#7fa763", "#a6c77a"])
        length = rng.uniform(1.4, 4)
        scene.box(x, y, 4.48, length, 1, 0.18, color)
        if rng.random() < 0.3:
            scene.box(x + length - 1, y - 1, 4.49, 1.1, 1, 0.22, color)
    greens = ["#376f56", "#588c60", "#7fac60"]
    for start, count in [(2.76, 4), (3.94, 4), (5.68, 5), (0.76, 2)]:
        for i in range(count):
            a = start + 0.10 * i + rng.uniform(-0.035, 0.035)
            r = rng.uniform(0.79, 0.91) * shore(a)
            x, y = 121 * r * cos(a), 79 * r * sin(a)
            prop = Scene()
            tree(prop, 0, 0, rng.uniform(0.56, 0.94), greens, i % 2 == 0)
            stamp(scene, prop, x, y, 4.5, anchor=(0, 0, 0))
    for group in range(6):
        a = group * pi / 3 + 0.28
        r = 0.75 * shore(a)
        x, y = 121 * r * cos(a), 79 * r * sin(a)
        for j in range(rng.randint(2, 4)):
            prop = Scene()
            flower(prop, 0, 0, ["#ffde74", "#fff1ce", "#f4a789"][group % 3])
            stamp(
                scene,
                prop,
                x + rng.uniform(-4, 4),
                y + rng.uniform(-3, 3),
                4.5,
                0.6,
                anchor=(0, 0, 0),
            )
    for i in range(14):
        a = rng.uniform(0, 2 * pi)
        r = rng.choice([0.90, 1.055]) * shore(a)
        sz = rng.uniform(1.5, 4.0)
        scene.drum(
            121 * r * cos(a),
            79 * r * sin(a),
            4.45 if r < shore(a) else -7,
            sz,
            sz * 0.67,
            sz * 0.88,
            "#90958a",
            6,
            0.56,
        )
    return render(scene, (286, 202), offset=(-143, -101))


if __name__ == "__main__":
    target = Path(__file__).resolve().parents[3] / "web/public/realms/party-island.png"
    party_island().save(target)
