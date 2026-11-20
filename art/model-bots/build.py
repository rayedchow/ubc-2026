"""Render aligned sprite frames, looping GIF demos and the runtime animation manifest."""

import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent
OUT = ART.parents[1] / "web/public/model-bots"
CELL = 24
COLS = 4
MODELS = {
    "rivet": ((8, 15), 12, "#49ffbb"),
    "pip": ((8, 14), 11, "#49ffbb"),
    "quill": ((8, 14), 13, "#a7ff46"),
}
COLLECTION = json.loads((ART / "heads" / "collection.json").read_text())
MODELS.update(COLLECTION)
# Durations are shared with the interactive player. Long idle holds make the blink legible.
TIMINGS = {
    "idle": [1000, 100, 100, 420],
    "left": [100, 120, 240, 260],
    "right": [100, 120, 240, 260],
    "up": [100, 120, 240, 260],
    "down": [100, 120, 240, 260],
    "focus": [160, 180, 240, 200],
    "alert": [100, 140, 260, 230],
    "happy": [100, 170, 220, 210],
}


def eye(draw, cx, cy, side, state, phase, glow, ink):
    if state == "idle" and phase in (1, 2):
        draw.rectangle((cx - 1, cy, cx, cy + (phase == 1)), fill=glow)
    elif state == "happy":
        draw.line([(cx - 1, cy), (cx, cy - 1), (cx + 1, cy)], fill=glow)
    elif state == "focus":
        draw.line([(cx - 1, cy - side), (cx, cy), (cx + 1, cy)], fill=glow)
    elif state == "alert":
        draw.rectangle((cx - 1, cy - 2, cx + 1, cy + 1), fill=glow)
        draw.point((cx, cy), fill=ink)
    else:
        draw.rectangle((cx - 1, cy - 1, cx, cy + 1), fill=glow)


def pose(head, bot, state, phase):
    face = head.copy()
    draw = ImageDraw.Draw(face)
    (left, right), y, glow = MODELS[bot]
    ink = face.getpixel((left, y))
    distance = (1, 2, 2, 1)[phase]
    dx = {"left": -distance, "right": distance}.get(state, 0)
    dy = {"up": -1, "down": 1}.get(state, 0)
    for cx, side in ((left, 1), (right, -1)):
        eye(draw, cx + dx, y + dy, side, state, phase, glow, ink)
    # Only the head moves. A one-pixel hop punctuates a greeting or surprise.
    lift = -1 if state in ("alert", "happy") and phase in (1, 2) else 0
    if bot == "pip" and state == "idle" and phase == 3:
        lift = -1
    frame = Image.new("RGBA", (CELL, CELL))
    frame.alpha_composite(face, (0, lift))
    return frame


def gif(frames, durations, path):
    # All colors in the animation fit GIF's palette. Use the same palette and
    # clear the previous frame so the hover and hop leave no stale pixels.
    strip = Image.new(
        "RGB", (frames[0].width, frames[0].height * len(frames)), (28, 32, 44)
    )
    for i, im in enumerate(frames):
        strip.paste(im.convert("RGB"), (0, i * im.height), im.getchannel("A"))
    palette = strip.quantize(colors=254, method=Image.Quantize.MEDIANCUT)
    pal = palette.getpalette()
    images = []
    for im in frames:
        f = im.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE)
        f.putpalette(pal[:765] + [0, 0, 0])
        f.paste(255, mask=im.getchannel("A").point(lambda a: 255 if a == 0 else 0))
        images.append(f)
    images[0].save(
        path,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        disposal=2,
        transparency=255,
        optimize=False,
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sequences = {}
    durations = [ms for timing in TIMINGS.values() for ms in timing]
    for bot in MODELS:
        with Image.open(ART / "heads" / f"{bot}.png") as source:
            poses = [
                pose(source.convert("RGBA"), bot, state, i)
                for state in TIMINGS
                for i in range(COLS)
            ]
        sheet = Image.new("RGBA", (CELL * COLS, CELL * len(TIMINGS)))
        for i, frame in enumerate(poses):
            row, col = divmod(i, COLS)
            sheet.alpha_composite(frame, (col * CELL, row * CELL))
        sheet.save(OUT / f"{bot}-sheet.png", optimize=True)
        gif(
            [f.resize((CELL * 6, CELL * 6), Image.Resampling.NEAREST) for f in poses],
            durations,
            OUT / f"{bot}.gif",
        )
        sequences[bot] = poses
    lineup = []
    for group in zip(*(sequences[k] for k in COLLECTION), strict=True):
        f = Image.new("RGBA", (CELL * 5, CELL * 2))
        for i, bot in enumerate(group):
            f.alpha_composite(bot, (CELL * (i % 5), CELL * (i // 5)))
        lineup.append(f.resize((CELL * 25, CELL * 10), Image.Resampling.NEAREST))
    gif(lineup, durations, ART / "model-lineup.gif")
    manifest = {
        "frameSize": CELL,
        "columns": COLS,
        "anchor": [12, 12],
        "rows": [
            {"state": state, "durationsMs": times} for state, times in TIMINGS.items()
        ],
        "models": {
            bot: {"sheet": f"{bot}-sheet.png", "preview": f"{bot}.gif"}
            for bot in MODELS
        },
    }
    (OUT / "animations.json").write_text(json.dumps(manifest, indent=2) + "\n")
    with ZipFile(OUT / "model-bots.zip", "w", ZIP_DEFLATED) as archive:
        for filename in [
            "animations.json",
            *(p for item in manifest["models"].values() for p in item.values()),
        ]:
            archive.write(OUT / filename, filename)
        for trainer in sorted((OUT.parent / "trainers").glob("*.png")):
            archive.write(trainer, "trainers/" + trainer.name)


if __name__ == "__main__":
    main()
