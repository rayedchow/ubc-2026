/** Seeded continuous relief. Domains and buildings are assigned only after the land exists. */
import halls from "../public/realms/halls.json" with { type: "json" };

type Point = { x: number; y: number; z: number };
type Ground = Point & { level: number; cliff: number; shelf: number };
type Color = readonly [number, number, number];
type Domain = { id: string; kit: string };
export const gymsPerSheet = 3;
export const floatsPerVertex = 8;
export const ownerStride = (domainCount: number) => 2 ** Math.ceil(Math.log2(domainCount + 1));
type GymSite = { id: string; realm: string };
type Region = { bounds: number[]; anchor: number[] };
export type Landscape = {
  seed: number;
  width: number;
  height: number;
  bounds: number[];
  regions: Record<string, Region>;
  places: Record<string, { anchor: number[]; roof: number[]; variant: number }>;
  buildings: { first: number; count: number };
  stride: number;
  vertices: Float32Array<ArrayBuffer>;
};

const step = 7,
  cols = 133,
  rows = 115;
const pixel = step / 2;
const width = 1170,
  height = 820;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const shade = (rgb: Color, brightness: number): Color => [
  rgb[0] * brightness,
  rgb[1] * brightness,
  rgb[2] * brightness,
];
const blend = (a: Color, b: Color, t: number): Color => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];

function hash(x: number, y: number, seed: number) {
  let n = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ seed;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function hallVariant(seed: number, domainIndex: number, slot: number) {
  return (Math.floor(hash(domainIndex, 0, seed ^ 72) * 3) + slot) % 3;
}

function noise(x: number, y: number, seed: number) {
  const i = Math.floor(x),
    j = Math.floor(y),
    u = smooth(x - i),
    v = smooth(y - j);
  return mix(
    mix(hash(i, j, seed), hash(i + 1, j, seed), u),
    mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), u),
    v,
  );
}

function camera(p: Point) {
  return [
    76 + p.x * 1.01 + p.y * 0.14,
    108 + p.y * 0.79 - p.x * 0.084 - p.z * 0.91,
    1 - (100 + p.y * 0.8 - p.x * 0.085 + p.z * 0.91) / 1070,
  ];
}

// Project a ray from the upper left onto the sea-level plane in atlas coordinates.
const shadowTip = camera({ x: 0.96, y: 0.44, z: 0 });
const shadowOrigin = camera({ x: 0, y: 0, z: 1 });
export const shadowStep = [
  (shadowTip[0] - shadowOrigin[0]) / width,
  (shadowTip[1] - shadowOrigin[1]) / height,
];

function terrain(seed: number, firstWindow: number) {
  let grid: Ground[] = [];
  let bestWindow: Ground[] = [];
  let bestCapacity = -1;
  const sizeX = (cols - 1) * step,
    sizeY = (rows - 1) * step;
  const sea = 0.52 + 0.055 * hash(0, 0, seed ^ 13);
  // Survey neighbouring windows of one continuous field. Keep naturally closed coasts.
  // Boundary-connected land continues beyond our survey and is left out of this archipelago.
  for (let window = 0; window < 8; window++) {
    grid = [];
    const offsetX = ((firstWindow + window) % 8) * sizeX,
      offsetY = Math.floor((firstWindow + window) / 8) * sizeY;
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const x = i * step,
          y = j * step,
          wx = x + offsetX,
          wy = y + offsetY;
        const u = wx + 57 * (noise(wx / 107, wy / 107, seed ^ 5) - 0.5);
        const v = wy + 57 * (noise(wx / 107, wy / 107, seed ^ 11) - 0.5);
        const level =
          0.51 * noise(u / 107, v / 107, seed) +
          0.32 * noise(u / 58, v / 58, seed ^ 25) +
          0.17 * noise(u / 23, v / 23, seed ^ 55) -
          sea;
        const cliff = smooth(clamp((noise(wx / 99, wy / 99, seed ^ 71) - 0.3) / 0.44));
        const hills = Math.max(0, level) * (74 + 124 * noise(wx / 146, wy / 146, seed ^ 73));
        grid.push({ x, y, z: 1.2 + 14 * cliff + hills, level, cliff, shelf: 0 });
      }
    const visited = new Uint8Array(grid.length);
    let habitable = 0;
    for (let k = 0; k < grid.length; k++) {
      if (visited[k] || grid[k].level <= 0) continue;
      let touchesEdge = false;
      const component = [k];
      visited[k] = 1;
      for (let front = 0; front < component.length; front++) {
        const at = component[front],
          x = at % cols,
          y = Math.floor(at / cols);
        if (x === 0 || x === cols - 1 || y === 0 || y === rows - 1) touchesEdge = true;
        // The mesh splits each square along the NW–SE diagonal.
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [1, 1],
          [-1, 0],
          [0, -1],
          [-1, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            n = ny * cols + nx;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || visited[n] || grid[n].level <= 0) continue;
          visited[n] = 1;
          component.push(n);
        }
      }
      if (touchesEdge) for (const n of component) grid[n].level = -0.3;
      else habitable += component.filter((n) => grid[n].level > 0.065).length;
    }
    if (habitable >= 450) break;
    if (habitable > bestCapacity) {
      bestWindow = grid;
      bestCapacity = habitable;
    }
    if (window === 7) grid = bestWindow;
  }
  // Distance to the retained shoreline controls underwater shelves and surf.
  const distance: number[] = grid.map((p) => (p.level > 0 ? 0 : 200));
  for (const direction of [1, -1]) {
    for (let n = 0; n < grid.length; n++) {
      const k = direction === 1 ? n : grid.length - 1 - n,
        x = k % cols,
        y = Math.floor(k / cols);
      for (const [dx, dy, cost] of [
        [-direction, 0, 1],
        [0, -direction, 1],
        [-direction, -direction, 1.4],
        [direction, -direction, 1.4],
      ]) {
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && xx < cols && yy >= 0 && yy < rows)
          distance[k] = Math.min(distance[k], distance[yy * cols + xx] + cost);
      }
    }
  }
  grid.forEach((p, i) => {
    p.shelf = clamp(1 - distance[i] / (4 + 4 * (1 - p.cliff)));
  });
  function interpolate(x: number, y: number): Ground {
    const fx = clamp(x / step, 0, cols - 1.0001),
      fy = clamp(y / step, 0, rows - 1.0001);
    const i = Math.floor(fx),
      j = Math.floor(fy),
      u = fx - i,
      v = fy - j;
    const a = grid[j * cols + i],
      d = grid[(j + 1) * cols + i + 1];
    const b = u > v ? grid[j * cols + i + 1] : grid[(j + 1) * cols + i];
    const wa = 1 - Math.max(u, v),
      wb = Math.abs(u - v),
      wd = Math.min(u, v);
    return {
      x,
      y,
      shelf: wa * a.shelf + wb * b.shelf + wd * d.shelf,
      z: wa * a.z + wb * b.z + wd * d.z,
      level: wa * a.level + wb * b.level + wd * d.level,
      cliff: wa * a.cliff + wb * b.cliff + wd * d.cliff,
    };
  }
  // Each map pixel is a flat part of a geological shelf. Sample this same raster for
  // rendering, trees, paths and foundations so nothing can land between two levels.
  const nx = (cols - 1) * 2,
    ny = (rows - 1) * 2;
  const cells = Array.from({ length: nx * ny }, (_, i) => {
    const p = interpolate(((i % nx) + 0.5) * pixel, (Math.floor(i / nx) + 0.5) * pixel);
    p.z = p.level > 0 ? 3 + 7 * Math.floor(p.z / 12) : 0;
    return p;
  });
  function cell(x: number, y: number) {
    return cells[clamp(Math.floor(y / pixel), 0, ny - 1) * nx + clamp(Math.floor(x / pixel), 0, nx - 1)];
  }
  function sample(x: number, y: number): Ground {
    return { ...cell(x, y), x, y };
  }
  function clearance(p: Ground) {
    for (let ring = 1; ring <= 4; ring++) {
      for (let d = -ring; d <= ring; d++) {
        if (
          [
            [d, -ring],
            [d, ring],
            [-ring, d],
            [ring, d],
          ].some(([dx, dy]) => cell(p.x + dx * pixel, p.y + dy * pixel).z !== p.z)
        )
          return (ring - 0.5) * pixel;
      }
    }
    return 4.5 * pixel;
  }
  return { cells, nx, ny, sample, clearance, sizeX, sizeY };
}

export function generateLandscape(
  seed: number,
  domains: Domain[],
  library: ArrayBuffer,
  gyms: GymSite[],
): Landscape {
  // Move the survey window when even one district lacks enough natural sites.
  // This preserves the noise field and avoids sculpting land for a building.
  for (let window = 0; window < 256; window += 8) {
    const map = surveyLandscape(seed, domains, library, gyms, window);
    if (map) return map;
  }
  throw new Error("No habitable survey found.");
}

function surveyLandscape(
  seed: number,
  domains: Domain[],
  library: ArrayBuffer,
  gyms: GymSite[],
  firstWindow: number,
): Landscape | null {
  const { cells, nx, ny, sample, clearance, sizeX, sizeY } = terrain(seed, firstWindow);
  const vertices: number[] = [];
  const stride = ownerStride(domains.length);

  let sequence = 0;
  const random = () => hash(sequence++, 0, seed ^ 0x71bcc);
  function vertex(p: Point, rgb: Color, owner: number) {
    const [x, y, z] = camera(p);
    vertices.push(
      x / width,
      y / height,
      z,
      clamp(rgb[0] / 255),
      clamp(rgb[1] / 255),
      clamp(rgb[2] / 255),
      owner,
      p.z,
    );
  }
  function tri(a: Point, b: Point, c: Point, color: Color, owner: number) {
    vertex(a, color, owner);
    vertex(b, color, owner);
    vertex(c, color, owner);
  }
  function quad(a: Point, b: Point, c: Point, d: Point, color: Color, owner: number) {
    tri(a, b, c, color, owner);
    tri(a, c, d, color, owner);
  }
  const dry = cells.filter((p) => p.z > 0);
  // The complete footprint of every authored hall fits inside 46 world units from its origin.
  const maxFootprint = 46;
  const candidates = cells
    .filter((p, i) => p.z > 0 && (i % nx) % 2 === 0 && Math.floor(i / nx) % 2 === 0)
    .map((p) => {
      const room = clearance(p);
      return { p, room, score: Math.min(room, 14) * 1.7 + p.level * 45 };
    })
    .sort((a, b) => b.score - a.score);
  const ranked = candidates.filter((c) => c.room >= 2.5 * pixel);
  if (ranked.length < domains.length * gymsPerSheet) return null;
  const prime = ranked.filter((c) => {
    const local = ranked.filter((n) => dist(c.p, n.p) > 34 && dist(c.p, n.p) < 72);
    // Each domain needs room for neighbours on dry ground, including a future third hall.
    return local.some((a) => local.some((b) => dist(a.p, b.p) > 44));
  });
  const districts = prime.length >= domains.length ? prime : ranked;
  const lots = districts.slice(0, Math.max(12, Math.round(ranked.length * 0.67))).map((v) => v.p);
  const centers: Ground[] = [];
  for (let i = 0; i < domains.length; i++) {
    // Survey one locality. All three domains may share an island or occupy separate shores.
    const focal = centers[0] ?? districts[0].p;
    const nearby = lots.filter((p) => dist(p, focal) < 165 && centers.every((q) => dist(q, p) > 48));
    const pool = nearby.length ? nearby : lots;
    const merit = (p: Ground) =>
      i === 0
        ? -dist(p, focal) * 0.24
        : Math.min(...centers.map((q) => dist(q, p))) - Math.max(0, dist(p, focal) - 135) * 1.5;
    const choices = pool.map((p) => ({ p, weight: merit(p) + hash(p.x, p.y, seed ^ i) * 32 }));
    centers.push(choices.reduce((best, next) => (next.weight > best.weight ? next : best)).p);
  }
  function ownerOf(p: Point) {
    let best = 0;
    for (let i = 1; i < centers.length; i++) if (dist(centers[i], p) < dist(centers[best], p)) best = i;
    return best + 1;
  }
  // Survey all plots on a sheet first, so adding a gym does not move an existing building.
  const plots = centers.map((center) => [center]);
  for (let slot = 1; slot < gymsPerSheet; slot++)
    for (const [i, center] of centers.entries()) {
      const available = ranked.filter((c) => ownerOf(c.p) === i + 1 && !plots.flat().includes(c.p));
      if (!available.length) return null;
      const used = plots.flat();
      const weight = (c: (typeof ranked)[number]) => {
        const p = c.p;
        const gap = Math.min(...used.map((q) => dist(q, p)));
        const projectedGap = Math.min(
          ...used.map((q) => {
            const a = camera(p),
              b = camera(q);
            return Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.25);
          }),
        );
        return (
          Math.min(56, gap) * 1.5 +
          Math.min(56, projectedGap) * 1.6 -
          Math.max(0, dist(p, center) - 78) * 1.2 +
          c.score * 0.9 +
          Math.min(14, Math.abs(p.z - center.z)) * 1.7 +
          hash(p.x, p.y, seed ^ slot) * 7
        );
      };
      plots[i].push(available.reduce((best, c) => (weight(c) > weight(best) ? c : best)).p);
    }
  const populations = domains.map((d) => gyms.filter((g) => g.realm === d.id));
  const settlements = plots.map((sites, i) => sites.slice(0, populations[i].length));
  const places: Landscape["places"] = {};
  // Walk short links along the sampled surface. Long channels stay open.
  const paths: { a: Point; b: Point; owner: number }[] = [];
  const bridges: { a: Point; b: Point; owner: number }[] = [];
  const links = settlements.flatMap((s) => s.slice(1).map((p) => [s[0], p]));
  for (let i = 1; i < settlements.length; i++) {
    const neighbours = settlements.slice(0, i).flat();
    const pairs = settlements[i].flatMap((a) => neighbours.map((b) => [a, b]));
    if (!pairs.length) continue;
    const pair = pairs.reduce((best, v) => (dist(v[0], v[1]) < dist(best[0], best[1]) ? v : best));
    if (dist(pair[0], pair[1]) < 135) links.push(pair);
  }
  for (const [i, sites] of links.entries()) {
    const [a, b] = sites.map((p) => sample(p.x, p.y + 8));
    const bend = (hash(i, 0, seed ^ 163) - 0.5) * 17,
      steps = Math.ceil(dist(a, b) / 2);
    const samples = Array.from({ length: steps + 1 }, (_, j) => {
      const t = j / steps;
      return sample(
        mix(a.x, b.x, t) + Math.sin(t * Math.PI) * bend,
        mix(a.y, b.y, t) + Math.sin(t * Math.PI) * bend,
      );
    });
    if (samples[0].level < 0 || samples.at(-1)!.level < 0) continue;
    const trail = [],
      spans = [];
    let connected = true;
    for (let j = 1; j < samples.length; j++) {
      if (samples[j].level > 0 && samples[j - 1].level > 0)
        trail.push({ a: samples[j - 1], b: samples[j], owner: ownerOf(samples[j]) });
      else {
        const from = j - 1;
        while (j < samples.length && samples[j].level <= 0) j++;
        if (j === samples.length || dist(samples[from], samples[j]) > 35) {
          connected = false;
          break;
        }
        spans.push({ a: samples[from], b: samples[j], owner: ownerOf(samples[from]) });
      }
    }
    if (connected) {
      paths.push(...trail);
      bridges.push(...spans);
    }
  }
  const palettes: Record<string, { grass: [Color, Color]; rock: Color; tree: [Color, Color] }> = {
    software: {
      grass: [
        [100, 159, 179],
        [154, 209, 194],
      ],
      rock: [85, 111, 143],
      tree: [
        [33, 132, 122],
        [113, 180, 121],
      ],
    },
    forge: {
      grass: [
        [226, 142, 58],
        [255, 205, 99],
      ],
      rock: [179, 94, 64],
      tree: [
        [32, 140, 106],
        [111, 185, 80],
      ],
    },
    ledger: {
      grass: [
        [120, 187, 77],
        [180, 221, 108],
      ],
      rock: [135, 143, 82],
      tree: [
        [26, 140, 105],
        [116, 185, 73],
      ],
    },
    counsel: {
      grass: [
        [115, 194, 150],
        [178, 224, 163],
      ],
      rock: [130, 103, 157],
      tree: [
        [169, 85, 159],
        [246, 150, 186],
      ],
    },
  };
  const palette = (id: number) => palettes[domains[id - 1].id] ?? palettes[domains[id - 1].kit];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p = cells[j * nx + i];
      if (!p.z && !p.shelf) continue;
      const x = i * pixel,
        y = j * pixel;
      const a = { x, y, z: p.z },
        b = { x: x + pixel, y, z: p.z },
        c = { x: x + pixel, y: y + pixel, z: p.z },
        d = { x, y: y + pixel, z: p.z };
      if (!p.z) {
        const margin = Math.min(p.x, sizeX - p.x, p.y, sizeY - p.y);
        const shelf = p.shelf * smooth(clamp(margin / (step * 4)));
        quad(a, b, c, d, [(Math.round(shelf * 14) * 255) / 14, 0, 0], 0);
        continue;
      }
      const id = ownerOf(p),
        ink = palette(id);
      const patch = noise(p.x / 28, p.y / 28, seed ^ 121);
      const grain = hash(i, j, seed ^ 187);
      const tone = clamp(Math.floor((patch + 0.2 * (grain - 0.5)) * 5) / 5 + 0.08);
      const turf = blend(...ink.grass, tone);
      const beach = p.level < 0.027 && p.cliff < 0.45;
      quad(a, b, c, d, beach ? blend([224, 180, 109], [253, 226, 153], tone) : turf, id);
      // Connected shelf edges are shared by the landscape. Only exposed risers have rock faces.
      const edges = [
        [a, b, cells[(j - 1) * nx + i]],
        [b, c, i + 1 < nx ? cells[j * nx + i + 1] : undefined],
        [c, d, cells[(j + 1) * nx + i]],
        [d, a, i ? cells[j * nx + i - 1] : undefined],
      ] as const;
      for (const [u, v, neighbor] of edges) {
        const low = neighbor?.z ?? 0;
        if (low >= p.z) continue;
        const edge = (z: number, upper: number, color: Color) =>
          quad({ ...u, z }, { ...v, z }, { ...v, z: upper }, { ...u, z: upper }, color, id);
        const tint = u.x === v.x ? 0.88 : 1;
        const ledge = p.z - 1;
        edge(low, low + (ledge - low) * 0.32, shade(ink.rock, tint * 0.76));
        edge(
          low + (ledge - low) * 0.32,
          ledge,
          shade(ink.rock, tint * (0.95 + 0.07 * Math.floor(grain * 3))),
        );
        edge(ledge, p.z, shade(turf, 0.87));
      }
    }
  function ribbon(a: Point, b: Point, w: number, lift: number, color: Color, id: number) {
    const span = Math.max(0.01, dist(a, b)),
      dx = ((b.y - a.y) * w) / span,
      dy = ((a.x - b.x) * w) / span;
    quad(
      { x: a.x + dx, y: a.y + dy, z: a.z + lift },
      { x: b.x + dx, y: b.y + dy, z: b.z + lift },
      { x: b.x - dx, y: b.y - dy, z: b.z + lift },
      { x: a.x - dx, y: a.y - dy, z: a.z + lift },
      color,
      id,
    );
  }
  paths.forEach(({ a, b, owner }) => ribbon(a, b, 1.95, 0.55, [229, 208, 148], owner));
  bridges.forEach(({ a, b, owner }) => {
    ribbon(a, b, 2.3, 1, [161, 104, 61], owner);
    for (let i = 0; i < dist(a, b); i += 2) {
      const t = i / dist(a, b),
        t2 = Math.min(1, t + 0.012);
      const at = (t: number) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z: mix(a.z, b.z, t) });
      ribbon(at(t), at(t2), 2.35, 1.15, [216, 165, 96], owner);
    }
  });

  for (const [i, sites] of settlements.entries()) {
    const landings = [];
    for (const site of sites)
      for (let j = 0; j < 24; j++) {
        const theta = (2 * Math.PI * j) / 24,
          dx = Math.cos(theta),
          dy = Math.sin(theta);
        const along = (d: number) => sample(site.x + d * dx, site.y + d * dy);
        let d = 10;
        while (d < 60 && along(d).level > 0) d += 2;
        const beach = along(d - 2),
          sea = along(d + 11);
        if (
          d < 60 &&
          beach.level > 0 &&
          beach.z < 8 &&
          sea.shelf > 0.23 &&
          [d, d + 4, d + 8, d + 12, d + 16].every((t) => along(t).level < 0)
        ) {
          landings.push({ site, beach, sea, dx, dy, cost: d + beach.z * 3 });
        }
      }
    if (!landings.length) continue;
    const { site, beach, sea, dx, dy } = landings.reduce((best, v) => (v.cost < best.cost ? v : best));
    const id = i + 1,
      length = dist(site, beach);
    for (let d = 8; d < length; d += 2) {
      const a = sample(site.x + dx * d, site.y + dy * d),
        b = sample(site.x + dx * (d + 2), site.y + dy * (d + 2));
      ribbon(a, b, 1.35, 0.55, [225, 201, 139], id);
    }
    const at = (t: number, side: number, z: number) => ({
      x: mix(beach.x, sea.x, t) - side * dy,
      y: mix(beach.y, sea.y, t) + side * dx,
      z,
    });
    const deck = (t: number) => mix(beach.z + 1.2, 2.8, t);
    for (let j = 0; j < 9; j++) {
      const t = j / 9,
        u = (j + 0.92) / 9;
      quad(
        at(t, -2, deck(t)),
        at(t, 2, deck(t)),
        at(u, 2, deck(u)),
        at(u, -2, deck(u)),
        j % 3 ? [185, 136, 82] : [209, 157, 94],
        id,
      );
    }
    for (const t of [0.22, 0.9])
      for (const side of [-1.55, 1.55]) {
        quad(
          at(t - 0.028, side, 0),
          at(t + 0.028, side, 0),
          at(t + 0.028, side, deck(t) + 1.4),
          at(t - 0.028, side, deck(t) + 1.4),
          [118, 85, 61],
          id,
        );
      }
    const boat = (x: number, y: number, z: number) => ({
      x: sea.x + x * dx - (y + 5.8) * dy,
      y: sea.y + x * dy + (y + 5.8) * dx,
      z,
    });
    const keel = boat(0, 0, 0.4),
      rim = [
        boat(-6, 0, 2),
        boat(-2, -2, 1.6),
        boat(4, -1.7, 1.8),
        boat(6.5, 0, 2.5),
        boat(3, 2, 1.8),
        boat(-2, 1.8, 1.6),
      ];
    for (let k = 0; k < rim.length; k++)
      tri(keel, rim[k], rim[(k + 1) % rim.length], k < 3 ? [112, 76, 56] : [182, 129, 75], id);
    quad(boat(-0.25, 0, 1), boat(0.25, 0, 1), boat(0.25, 0, 11), boat(-0.25, 0, 11), [98, 76, 55], id);
    tri(boat(0, 0, 10.5), boat(-4.8, -0.7, 3.6), boat(0, 0, 3.2), [255, 230, 164], id);
    tri(boat(0.4, 0, 8.8), boat(4.6, 0.3, 3.5), boat(0.4, 0, 3.4), [238, 149, 95], id);
  }

  function contact(p: Point, rx: number, ry: number, id: number) {
    const ground = (x: number, y: number) => {
      const q = sample(x, y);
      return { ...q, z: q.z + 0.26 };
    };
    const shadow = shade(palette(id).grass[0], 0.8);
    const mid = ground(p.x + rx * 0.22, p.y + ry * 0.18);
    for (let n = 0; n < 8; n++) {
      const edge = (k: number) =>
        ground(mid.x + rx * Math.cos((k * Math.PI) / 4), mid.y + ry * Math.sin((k * Math.PI) / 4));
      tri(mid, edge(n), edge(n + 1), shadow, id);
    }
  }
  const firstBuilding = vertices.length / floatsPerVertex;
  const data = new DataView(library);
  for (const [i, sites] of settlements.entries()) {
    const models = halls[domains[i].kit as keyof typeof halls];

    for (const [j, p] of sites.entries()) {
      const gym = populations[i][j],
        variant = hallVariant(seed, i, j);
      const code = i + 1 + stride * (gyms.indexOf(gym) + 1);
      const model = models[variant];
      const gap = Math.min(
        ...plots
          .flat()
          .filter((q) => q !== p)
          .map((q) => dist(p, q)),
      );
      const size = Math.min(
        0.24 + hash(p.x, p.y, seed ^ 57) * 0.016,
        (clearance(p) - 0.5) / maxFootprint,
        gap / 100,
      );
      const deck = p.z;
      const roof = [Infinity, Infinity, -Infinity, -Infinity];
      places[gym.id] = { anchor: camera({ ...p, z: deck + size * 29 }).slice(0, 2), roof, variant };
      for (let k = model.start; k < model.start + model.count; k++) {
        const off = k * 10,
          s = size / 16;
        const point = {
          x: p.x + data.getInt16(off, true) * s,
          y: p.y + data.getInt16(off + 2, true) * s,
          z: deck + data.getInt16(off + 4, true) * s,
        };
        const [x, y] = camera(point);
        roof[0] = Math.min(roof[0], x);
        roof[1] = Math.min(roof[1], y);
        roof[2] = Math.max(roof[2], x);
        roof[3] = Math.max(roof[3], y);
        vertex(point, [data.getUint8(off + 6), data.getUint8(off + 7), data.getUint8(off + 8)], code);
      }
    }
  }
  const buildings = { first: firstBuilding, count: vertices.length / floatsPerVertex - firstBuilding };
  // Uneven stands, bare headlands, meadow flecks and offshore rocks share the seed.
  function crown(p: Point, r: number, h: number, color: Color, id: number, conifer = false) {
    const phase = random() * Math.PI,
      n = conifer ? 6 : 7;
    const ring = (scale: number, z: number) =>
      Array.from({ length: n }, (_, i) => {
        const angle = phase + (i * 2 * Math.PI) / n;
        return { x: p.x + r * scale * Math.cos(angle), y: p.y + r * scale * Math.sin(angle), z: p.z + z };
      });
    const lower = ring(0.65, 0),
      rim = ring(1, h * 0.25),
      upper = ring(conifer ? 0.12 : 0.64, h * 0.77);
    for (let k = 0; k < n; k++) {
      const next = (k + 1) % n,
        tint = 0.79 + 0.18 * Math.cos(phase + (k * 2 * Math.PI) / n + 2.4);
      quad(lower[k], lower[next], rim[next], rim[k], shade(color, tint * 0.9), id);
      quad(rim[k], rim[next], upper[next], upper[k], shade(color, tint + 0.09), id);
      tri(upper[k], upper[next], { x: p.x - r * 0.13, y: p.y, z: p.z + h }, shade(color, tint + 0.2), id);
    }
  }
  const reserved = settlements.flat();
  for (let i = 0; i < cols * rows * 0.75; i++) {
    const p = sample(random() * sizeX, random() * sizeY),
      growth = noise(p.x / 58, p.y / 58, seed ^ 175),
      id = ownerOf(p);
    if (
      reserved.some((q) => Math.abs(q.x - p.x) < 20 && Math.abs(q.y - p.y) < 15) ||
      paths.some(({ a }) => dist(p, a) < 5)
    )
      continue;
    if (p.level < 0) {
      if (p.shelf > 0.71 && random() < 0.15)
        crown({ ...p, z: -0.8 }, 1.7 + random() * 3, 2 + random() * 4, [139, 147, 142], id);
      continue;
    }
    if (growth > 0.42 && random() < 0.13 + (growth - 0.42) * 0.64) {
      const size = 2.6 + random() * 3.2,
        pine = growth > 0.66;
      contact(p, size * 1.12, size * 0.84, id);
      crown(p, size * 0.33, size * 0.9, [128, 100, 67], id);
      crown(
        { ...p, z: p.z + size * 0.54 },
        size,
        size * (pine ? 2.8 : 1.85),
        blend(...palette(id).tree, random()),
        id,
        pine,
      );
    } else if (p.cliff > 0.64 && growth < 0.4 && random() < 0.18) {
      const r = 1.7 + random() * 2.6;
      crown(p, r, r * (0.6 + random() * 0.55), [155, 157, 143], id);
    } else if (random() < 0.43) {
      const color: Color = random() < 0.82 ? [121, 159, 76] : [250, 220, 133];
      tri(
        p,
        { x: p.x + 2.5, y: p.y + 0.3, z: p.z + 0.1 },
        { x: p.x + 1, y: p.y + 0.4, z: p.z + 1.7 },
        color,
        id,
      );
    }
  }
  // Frame the inhabited stretch of coast. Distant islands may continue beyond the viewport.
  function cameraBounds(sites: Point[], padding: number) {
    const pins = sites.map(camera),
      xs = pins.map((p) => p[0]),
      ys = pins.map((p) => p[1]);
    const left = Math.min(...xs) - padding,
      top = Math.min(...ys) - padding;
    return [left, top, Math.max(...xs) - left + padding, Math.max(...ys) - top + padding * 0.84];
  }
  const bounds = cameraBounds([...centers, ...settlements.flat()], 52);
  const regions = Object.fromEntries(
    domains.map((domain, i) => {
      const territory = dry
        .filter((p) => ownerOf(p) === i + 1)
        .map(camera)
        .filter(
          ([x, y]) =>
            x >= bounds[0] && x <= bounds[0] + bounds[2] && y >= bounds[1] && y <= bounds[1] + bounds[3],
        );
      const [cx, cy] = territory.reduce(
        ([sx, sy], [x, y]) => [sx + x / territory.length, sy + y / territory.length],
        [0, 0],
      );
      const distance = ([x, y]: number[]) => Math.hypot(x - cx, y - cy);
      const anchor = territory.length
        ? territory.reduce((a, b) => (distance(a) < distance(b) ? a : b))
        : camera(centers[i]);
      const sites = settlements[i].length ? settlements[i] : [centers[i]];
      return [domain.id, { bounds: cameraBounds(sites, 42), anchor: anchor.slice(0, 2) }];
    }),
  );

  return {
    seed,
    width,
    height,
    bounds,
    places,
    regions,
    buildings,
    stride,
    vertices: new Float32Array(vertices),
  };
}
