"""Reusable furniture bays, entrance and wall tiles for rooms composed from gym JSON."""
import json
from PIL import Image
from realms import CATALOG, PUBLIC, floorplan

PROPS = "arm audit books catalogue conveyor jig journal reconcile redline route rover scales scope statements tax writing".split()
W, H = 95, 68


def export():
    keys = [*PROPS, "vault", "wall", "entry", "lounge"]
    for realm in CATALOG["realms"]:
        sheet = Image.new("RGB", (W * 4, H * ((len(keys) + 3) // 4)))
        for batch in range(0, len(PROPS), 4):
            props = PROPS[batch:batch + 4]
            gym = {"id": "room-tiles", "skills": [{"prop": p} for p in [*props, *(["books"]*(4-len(props)))]]}
            room, _ = floorplan(gym, realm)
            for i, prop in enumerate(props):
                col, row = i % 3, i // 3
                x = round(7 + col * 286 / 3)
                y = 27 + row * 68
                tile = room.crop((x, y, x + W, y + H))
                index = keys.index(prop)
                sheet.paste(tile, (index % 4 * W, index // 4 * H))
        # The last bay is always the sealed evaluator. The unoccupied bay is a lounge.
        for key, crop in [
            ("vault", (198, 95, 293, 151)), ("wall", (101, 0, 196, 27)),
            ("entry", (103, 151, 198, 164)), ("lounge", (103, 95, 198, 151)),
        ]:
            index = keys.index(key)
            tile = room.crop(crop)
            sheet.paste(tile, (index % 4 * W, index // 4 * H))
        sheet.save(PUBLIC / f"room-{realm['kit']}.png", optimize=True)
    (PUBLIC / "room-tiles.json").write_text(json.dumps(keys) + "\n")


if __name__ == "__main__":
    export()
