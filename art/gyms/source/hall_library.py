"""Export the reusable hall models for the live WebGL landscape. No terrain is baked."""

import json
from pathlib import Path
from random import Random
from struct import Struct

from mesh import C, S, oblique, triangles
from realm_halls import FAMILIES, ROOFS, hall

PUBLIC = Path(__file__).resolve().parents[3] / "web/public/realms"
VERTEX = Struct("<hhhBBBx")


def export():
    data = bytearray()
    library = {}
    for kit, families in FAMILIES.items():
        library[kit] = []
        for index, family in enumerate(families):
            model = hall(family, ROOFS[kit][index], Random(family))
            oblique(model, 13).save(PUBLIC / f"hall-{kit}-{index}.png")
            start = len(data) // VERTEX.size
            for face, _, color, _ in triangles(model):
                for x, y, z in face:
                    # Origin at the footprint centre, in world-space units.
                    point = ((x - 48) * 16, (y - 77) * 16 / S, z * 16 / C)
                    data.extend(VERTEX.pack(*map(round, point), *color))
            library[kit].append({"start": start, "count": len(data) // VERTEX.size - start})
    (PUBLIC / "halls.bin").write_bytes(data)
    (PUBLIC / "halls.json").write_text(json.dumps(library, indent=2) + "\n")


if __name__ == "__main__":
    export()
