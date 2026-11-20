"""Geometry and reproducibility contracts for the interactive atlas."""

import json
import re
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

from realm_halls import hall_pair
from realm_regions import silhouette
from realm_relief import lots_for
from realms import CATALOG, PUBLIC, connected_world


def fill_path(path, width, height):
    """Scan-convert the emitted rectilinear paths independently with even/odd fill."""
    crossings = np.zeros((height, width + 1), dtype=bool)
    x = y = 0
    for command, numbers in re.findall(r"([Mhvz])([-\d ]*)", path):
        if command == "M":
            x, y = map(int, numbers.split())
            start = (x, y)
            continue
        xx, yy = x, y
        if command == "h":
            xx += int(numbers)
        elif command == "v":
            yy += int(numbers)
        else:
            xx, yy = start
        if yy != y:
            if xx != x:
                raise ValueError("Unexpected diagonal edge")
            crossings[min(y, yy) : max(y, yy), x] ^= True
        x, y = xx, yy
    return np.bitwise_xor.accumulate(crossings.astype(np.uint8), axis=1)[
        :, :width
    ].astype(bool)


class RealmGeneration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.maps = json.loads((PUBLIC / "atlas.json").read_text())

    def test_coasts_holes_and_diagonal_contacts(self):
        rng = np.random.default_rng(83)
        for _ in range(50):
            mask = rng.random((12, 15)) < 0.5
            np.testing.assert_array_equal(fill_path(silhouette(mask), 15, 12), mask)

    def test_published_maps(self):
        seeds = json.loads((PUBLIC / "seeds.json").read_text())
        self.assertEqual(seeds, [m["seed"] for m in self.maps])
        for m in self.maps:
            with (
                self.subTest(seed=m["seed"]),
                Image.open(PUBLIC / f"world-{m['seed']}.png") as art,
            ):
                self.assertEqual(art.size, (m["width"], m["height"]))
                self.assertEqual(
                    set(m["regions"]), {r["id"] for r in CATALOG["realms"]}
                )
                owned = np.zeros((art.height, art.width), dtype=bool)
                for region in m["regions"].values():
                    mask = fill_path(region["path"], *art.size)
                    self.assertFalse((owned & mask).any())
                    y, x = np.nonzero(mask)
                    self.assertEqual(
                        region["bounds"],
                        [
                            x.min(),
                            y.min(),
                            x.max() - x.min() + 1,
                            y.max() - y.min() + 1,
                        ],
                    )
                    owned |= mask
                np.testing.assert_array_equal(
                    owned, np.asarray(art.getchannel("A")) > 0
                )

    def test_mesh_contract(self):
        for m in self.maps:
            with self.subTest(seed=m["seed"]):
                mesh = np.fromfile(PUBLIC / f"world-{m['seed']}.mesh", dtype="<u2")
                faces = mesh.reshape(-1, 3, 4)
                owners = faces[:, :, 3]
                self.assertEqual(
                    set(np.unique(owners)), set(range(1, 1 + len(m["regions"])))
                )
                self.assertTrue((owners == owners[:, :1]).all())
                self.assertGreater(np.ptp(faces[:, :, 2]), 0)

    def test_rebake_from_source(self):
        entry = self.maps[0]
        seed = entry["seed"]
        with TemporaryDirectory() as scratch:
            mesh = Path(scratch) / "world.mesh"
            image, metadata = connected_world(CATALOG["realms"], seed, mesh)
            self.assertEqual(mesh.read_bytes(), (PUBLIC / f"world-{seed}.mesh").read_bytes())
        self.assertEqual({"seed": seed, **metadata}, entry)
        with Image.open(PUBLIC / f"world-{seed}.png") as published:
            self.assertEqual(image.tobytes(), published.tobytes())

    def test_relief_and_architecture_vary(self):
        for realm in CATALOG["realms"]:
            rises, families = set(), set()
            for seed in range(12):
                args = (realm["kit"], realm["id"], seed)
                upper, lower = lots_for(*args)
                self.assertGreater(upper.rise, lower.rise)
                rises.add((upper.rise, lower.rise))
                pair = [family for family, _ in hall_pair(*args)]
                self.assertNotEqual(*pair)
                families.update(pair)
            self.assertGreater(len(rises), 1)
            self.assertGreaterEqual(len(families), 3)


if __name__ == "__main__":
    unittest.main()
