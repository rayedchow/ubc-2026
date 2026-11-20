"""Build the four portable district packs. Requires Pillow and NumPy."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from buildings import PACKS, exterior
from grounds import grounds
from mesh import S, oblique, render, write_glb
from rooms import PROPS, interior

ART = Path(__file__).resolve().parents[1]
ROOFS = ["default", "#f0a3a0", "#94bff0", "#96d9b0", "#9fb4f2", "#f0cf8a"]
STATUS = ["open", "exclusive", "soon"]
CELL = (64, 48)


def prop_sheet(scene, names):
    sheet = Image.new("RGBA", (CELL[0] * 3, CELL[1] * 2))
    for i, name in enumerate(names):
        pts = np.concatenate([p for p, _, _ in scene.parts[name]])
        sx, sy = pts[:, 0], pts[:, 1] - pts[:, 2]
        origin = (
            np.floor((sx.min() + sx.max() - CELL[0]) / 2),
            np.ceil(sy.max()) - CELL[1] + 3,
        )
        tile = render(scene, CELL, offset=origin, groups=[name])
        sheet.paste(tile, ((i % 3) * CELL[0], (i // 3) * CELL[1]))
    return sheet


def archive(source, target):
    with ZipFile(target, "w") as zip_file:
        for file in sorted(source.iterdir()):
            entry = ZipInfo(file.name, (2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            zip_file.writestr(entry, file.read_bytes(), compresslevel=9)


def build_pack(k, path):
    title = PACKS[k][0]
    outside = exterior(k)
    building = render(outside, (96, 104))
    building.save(path / "building.png")
    grounds(outside, k)
    site = render(outside, (144, 136), offset=(-24, -2))
    site.save(path / "grounds.png")
    diorama = oblique(outside, -27, 0.83)
    diorama.save(path / "exterior-angle.png")
    room = interior(k)
    inside = render(room, (240, 128))
    inside.save(path / "interior.png")
    oblique(room, -27).save(path / "interior-angle.png")
    write_glb(outside, path / "exterior.glb", (48, 0, 92 / S))
    write_glb(room, path / "interior.glb", (120, 0, 81 / S))
    props = prop_sheet(room, PROPS[k])
    props.save(path / "props.png")
    atlas = Image.new("RGBA", (48 * len(ROOFS), 52 * len(STATUS)))
    for row, status in enumerate(STATUS):
        for col, roof in enumerate(ROOFS):
            model = exterior(k, None if col == 0 else roof, status)
            tile = render(model, (48, 52), scale=0.5)
            if status == "soon":
                alpha = tile.getchannel("A")
                tile = Image.blend(tile, Image.new("RGBA", tile.size, "#82a397"), 0.34)
                tile.putalpha(alpha)
            atlas.paste(tile, (col * 48, row * 52))
    atlas.save(path / "map-atlas.png")
    manifest = dict(
        name=title,
        district=k,
        map=dict(
            cell=[48, 52],
            columns=ROOFS,
            rows=STATUS,
            drawOffset=[0, -4],
            doorTileOffset=[1, 3],
        ),
        interior=dict(size=[240, 128], modelFeet=[120, 98], leaderTopLeft=[146, 26]),
        props=dict(cell=CELL, columns=3, rows=2, names=PROPS[k]),
    )
    (path / "pack.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (path / "README.md").write_text(f"""# {title}

A {k.title()} district gym for Modélmon.

Open `exterior.glb` or `interior.glb` in Blender or a glTF 2.0 viewer. Both use meters, Y up, and +Z toward the entrance. Named meshes have local pivots at their bases. The landscaping nodes start with “Grounds” and can be hidden as a group. The unlit vertex colors carry the painted palette.

`exterior-angle.png` and `interior-angle.png` show the models in three-quarter view. `grounds.png` is the landscaped exterior. `building.png` is the standalone transparent building. `interior.png` is the empty training room, ready for the game's live leader and model sprites.

`map-atlas.png` contains the three availability states and six roof palettes. `props.png` contains six isolated furnishings in a 3 × 2 grid, in reading order. Use nearest-neighbor sampling. See `pack.json` for cell sizes, names, and placement anchors.
""")
    archive(path, ART / (k + ".zip"))
    return diorama, inside, props


def proof_sheet(previews):
    def font(size, bold=False):
        names = (
            ["DejaVuSans-Bold.ttf", "Arial Bold.ttf"]
            if bold
            else ["DejaVuSans.ttf", "Arial.ttf"]
        )
        for name in names:
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                continue
        return ImageFont.load_default(size=size)

    width, height = 1240, 1432
    board = Image.new("RGB", (width, height), "#f2eee3")
    d = ImageDraw.Draw(board)
    ink = "#29383d"
    d.text((32, 20), "District gyms", font=font(36, True), fill=ink)
    d.text(
        (width - 32, 33),
        "3D pixel art collection",
        anchor="ra",
        font=font(20),
        fill="#536363",
    )
    d.line((32, 76, width - 32, 76), fill="#939c8e")
    for x, label in [(42, "BUILDINGS"), (350, "TRAINING ROOMS"), (856, "FURNISHINGS")]:
        d.text((x, 91), label, font=font(13, True), fill="#566766")
    for i, (k, (site, room, props)) in enumerate(previews.items()):
        y = 117 + i * 325
        accent = PACKS[k][1]
        d.rounded_rectangle(
            (28, y, 1212, y + 316), radius=6, fill="#fffcf2", outline="#dad5c9"
        )
        d.rectangle((43, y + 15, 47, y + 42), fill=accent)
        d.text((57, y + 10), PACKS[k][0], font=font(23, True), fill=ink)
        d.text(
            (57, y + 37), k.capitalize() + " district", font=font(13), fill="#616968"
        )
        im = site.crop(site.getbbox())
        im = im.resize((im.width * 2, im.height * 2), Image.Resampling.NEAREST)
        board.paste(im, (47 + (272 - im.width) // 2, y + 306 - im.height), im)
        interior_image = room.resize((480, 256), Image.Resampling.NEAREST)
        board.paste(interior_image, (350, y + 30), interior_image)
        for n, name in enumerate(PROPS[k]):
            xx = 852 + (n % 3) * 117
            yy = y + 20 + (n // 3) * 139
            prop = props.crop(
                ((n % 3) * 64, (n // 3) * 48, (n % 3 + 1) * 64, (n // 3 + 1) * 48)
            )
            prop = prop.crop(prop.getbbox())
            prop = prop.resize(
                (prop.width * 2, prop.height * 2), Image.Resampling.NEAREST
            )
            board.paste(
                prop, (xx + (110 - prop.width) // 2, yy + 97 - prop.height), prop
            )
            d.text(
                (xx + 55, yy + 107), name, anchor="ma", font=font(13), fill="#495857"
            )
    board.save(ART / "preview.png", optimize=True)


def main():
    previews = {}
    for k in PACKS:
        with TemporaryDirectory() as temp:
            previews[k] = build_pack(k, Path(temp))
    proof_sheet(previews)


if __name__ == "__main__":
    main()
