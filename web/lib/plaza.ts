import type { Painter as Ctx } from "./gl";
type Palette = Record<string,string>;
const INK="#1c3050";
const TRAINER = [
  "....HHHHHHHH....",
  "...HHHhhhhHHH...",
  "..HHHhhEEhhHHH..",
  "..HHHhhEEhhHHH..",
  ".HHHHHHHHHHHHHH.",
  ".RRKKKKKKKKKKRR.",
  "RRRFFFFFFFFFFRRR",
  ".RRFKFFFFFFKFRR.",
  ".RFFKFFFFFFKFFR.",
  "..FFFFFFFFFFFF..",
  "..FFFFfKKfFFFF..",
  "...FFFFFFFFFF...",
  "....jJTTTTJj....",
  "..JJJjTTTTjJJJ..",
  ".JJJJjTTTTjJJJJ.",
  ".JJJJjJJJJjJJJJ.",
  ".JJ.JjJJJJjJ.JJ.",
  ".FF.JJJJJJJJ.FF.",
  "....JJJJJJJJ....",
  "....NNNNNNNN....",
  "....NNNNNNNN....",
  "....NNN..NNN....",
  "....NNN..NNN....",
  "....NNN..NNN....",
  "....NNN..NNN....",
  "...OOOO..OOOO...",
];

const TRAINER_COLORS: Palette = {
  H: "#6fb1ee",
  h: "#eef6ff",
  E: "#f5d78e",
  R: "#22344f",
  K: INK,
  F: "#f0c8a8",
  f: "#d9a888",
  J: "#3f72b3",
  j: "#f5d78e",
  T: "#eef6ff",
  N: "#2a4266",
  O: "#f0a3a0",
};

function drawRows(ctx: Ctx, rows: string[], ox: number, oy: number, pal: Palette) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = pal[row[x]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

export function drawTrainer(ctx: Ctx) {
  drawRows(ctx,TRAINER,0,0,TRAINER_COLORS);
}
const TILE = 16;
const GRASS = "#74ad98";
const GRASS_ALT = "#70a894";
const SCENERY: Palette = {
  G: "#5c9c8c",
  D: "#3f7a76",
  L: "#84c2a8",
  M: "#356864",
  T: "#7a5c66",
  t: "rgba(28,48,80,0.25)",
};

const TREE = [
  ".....DDDDDD.....",
  "...DDGGGGGGDD...",
  "..DGGLLGGGGGGD..",
  ".DGLLLGGGGGGGGD.",
  ".DGLLGGGGGGGGGD.",
  "DGGGGGGGGGGGGGGD",
  "DGGGGGGGGGGGGGGD",
  "DGGGGGGGGGGGGGGD",
  "DGGGGGGGGGGGGMGD",
  "DGGGGGGGGGGGMMGD",
  ".DGGGGGGGGMMMMD.",
  ".DGGGGGGMMMMMMD.",
  "..DMMMMMMMMMMD..",
  "...DDMMMMMMDD...",
  ".....DDTTDD.....",
  "......TTTT......",
  "......TTTT......",
  "....ttTTTTtt....",
];

const BUSH = ["..DDDDDD..", ".DGGLLGGD.", "DGGLGGGGGD", "DGGGGGGMGD", "DGGGGMMMMD", ".DMMMMMMD.", "..DDDDDD.."];

function cellHash(col: number, row: number, seed = 0): number {
  let h = (col * 374761393 + row * 668265263 + seed * 974634541) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function drawGrass(ctx: Ctx, x: number, y: number, col: number, row: number) {
  ctx.fillStyle = (col + row) % 2 ? GRASS : GRASS_ALT;
  ctx.fillRect(x, y, TILE, TILE);
  const h = cellHash(col, row);
  ctx.fillStyle = "#639c88";
  ctx.fillRect(x + (h % 13), y + ((h >> 4) % 14), 2, 1);
  ctx.fillRect(x + ((h >> 8) % 13), y + ((h >> 12) % 14), 2, 1);
  ctx.fillStyle = "#8ac0aa";
  ctx.fillRect(x + ((h >> 16) % 14), y + ((h >> 20) % 14), 1, 1);
}

function drawFlower(ctx: Ctx, x: number, y: number, petal: string) {
  ctx.fillStyle = petal;
  ctx.fillRect(x + 1, y, 1, 3);
  ctx.fillRect(x, y + 1, 3, 1);
  ctx.fillStyle = "#f5d78e";
  ctx.fillRect(x + 1, y + 1, 1, 1);
}

export const PLAZA_SCALE = 4;

/**
 * A forest clearing seen from above, washed in the page's blue so it reads as night and melts into the
 * background. Trees only grow outside `clearR` (art pixels from the centre),
 * which is where the trainer and the models stand.
 */
export function drawPlaza(ctx: Ctx, w: number, h: number, cx: number, cy: number, clearR: number) {
  const cols = Math.ceil(w / TILE);
  const rows = Math.ceil(h / TILE);
  const far = (col: number, row: number) => Math.hypot(col * TILE + 8 - cx, row * TILE + 8 - cy);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * TILE;
      const y = row * TILE;
      drawGrass(ctx, x, y, col, row);
      const hsh = cellHash(col, row, 11);
      if (hsh % 100 < 16) {
        drawFlower(ctx, x + 2 + (hsh % 4), y + 3 + ((hsh >> 3) % 3), hsh % 3 ? "#d9cdf7" : "#f2a3b8");
        drawFlower(ctx, x + 9 + ((hsh >> 6) % 3), y + 9 + ((hsh >> 9) % 3), "#e9ebff");
      }
    }
  }

  // A worn patch of earth where the trainer stands.
  ctx.fillStyle = "#dcc9c0";
  for (let dy = -9; dy <= 9; dy++) {
    const half = Math.round(20 * Math.sqrt(1 - (dy * dy) / 81));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, 1);
  }

  // Trees and bushes thicken with distance from the clearing. Back rows are drawn first.
  for (let row = -1; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const beyond = far(col, row) - clearR;
      if (beyond < 0) continue;
      const roll = cellHash(col, row, 5) % 100;
      if (roll < Math.min(55, 12 + beyond * 0.5)) drawRows(ctx, TREE, col * TILE, (row + 1) * TILE - TREE.length, SCENERY);
      else if (roll > 92) drawRows(ctx, BUSH, col * TILE + 3, row * TILE + 6, SCENERY);
    }
  }

  // Night wash: pull every colour towards the page's blue.
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#7da6dc";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(31,61,100,0.16)";
  ctx.fillRect(0, 0, w, h);
}
