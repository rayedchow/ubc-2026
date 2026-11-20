// Run with Node 22.18+ from the repository root.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { floatsPerVertex, generateLandscape } from "../lib/landscape.ts";

const catalog = JSON.parse(readFileSync(new URL("../lib/realm-catalog.json", import.meta.url)));
const software = JSON.parse(readFileSync(new URL("../lib/software-catalog.json", import.meta.url)));
catalog.realms.push(...software.realms);
catalog.gyms.push(...software.gyms);
const halls = readFileSync(new URL("../public/realms/halls.bin", import.meta.url));
const buffer = halls.buffer.slice(halls.byteOffset, halls.byteOffset + halls.byteLength);
const make = (seed, domains = catalog.realms) => generateLandscape(seed, domains, buffer, catalog.gyms);
const digest = (array) => createHash("sha256").update(array).digest("hex");

function shore(map) {
  const water = [];
  for (let i = 0; i < map.vertices.length; i += floatsPerVertex) {
    if (map.vertices[i + 6] === 0) water.push(...map.vertices.subarray(i, i + 6));
  }
  return digest(new Float32Array(water));
}

// Invert the orthographic mesh projection and inspect the actual rendered tile under every roof.
function verifyFlatPlots(map) {
  const tiles = new Map(),
    halls = new Map();
  function world(index) {
    const v = map.vertices,
      u = v[index] * map.width - 76,
      vScreen = v[index + 1] * map.height - 108;
    const depth = (1 - v[index + 2]) * 1070 - 100;
    const y = (vScreen + depth + (0.169 * u) / 1.01) / (1.59 + (0.169 * 0.14) / 1.01);
    const x = (u - 0.14 * y) / 1.01;
    return { x, y, z: (0.79 * y - 0.084 * x - vScreen) / 0.91 };
  }
  const pixel = 3.5,
    near = (x, y) => Math.abs(x - y) < 0.005;
  for (let i = 0; i < map.vertices.length; i += 3 * floatsPerVertex) {
    const owner = map.vertices[i + 6];
    if (!owner) continue;
    const tri = [world(i), world(i + floatsPerVertex), world(i + 2 * floatsPerVertex)];
    if (owner >= map.stride) {
      const box = halls.get(owner) ?? [Infinity, Infinity, -Infinity, -Infinity, Infinity];
      for (const { x, y, z } of tri) {
        box[0] = Math.min(box[0], x);
        box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x);
        box[3] = Math.max(box[3], y);
        box[4] = Math.min(box[4], z);
      }
      halls.set(owner, box);
      continue;
    }
    const [a, b, c] = tri;
    if (
      near(a.z, b.z) &&
      near(a.z, c.z) &&
      near(b.x - a.x, pixel) &&
      near(b.y, a.y) &&
      near(c.y - b.y, pixel) &&
      near(c.x, b.x)
    )
      tiles.set(Math.round(a.x / pixel) + "," + Math.round(a.y / pixel), a.z);
  }
  for (const [hall, [x0, y0, x1, y1, z]] of halls) {
    for (let y = Math.floor(y0 / pixel); y <= Math.floor(y1 / pixel); y++)
      for (let x = Math.floor(x0 / pixel); x <= Math.floor(x1 / pixel); x++)
        assert(
          near(tiles.get(x + "," + y), z),
          `Hall ${hall} must sit flush on one existing terrace across its entire footprint`,
        );
  }
}

const seeds = [0, 17, 42, 83, 1234, 422074, 2471588027, 0xffffffff];
const coasts = new Set();
for (const seed of seeds) {
  const map = make(seed);
  verifyFlatPlots(map);
  assert.equal(map.vertices.length % (3 * floatsPerVertex), 0);
  assert(map.vertices.every(Number.isFinite));
  const owners = new Set();
  for (let i = 6; i < map.vertices.length; i += 3 * floatsPerVertex) {
    owners.add(map.vertices[i]);
    const vertex = (i - 6) / floatsPerVertex;
    assert.equal(vertex >= map.buildings.first && vertex < map.buildings.first + map.buildings.count, map.vertices[i] >= map.stride, "Only gym triangles may cast a building shadow");
    assert.equal(map.vertices[i], map.vertices[i + floatsPerVertex]);
    assert.equal(map.vertices[i], map.vertices[i + 2 * floatsPerVertex]);
  }
  assert.deepEqual(
    owners,
    new Set([
      0,
      ...catalog.realms.map((_, i) => i + 1),
      ...catalog.gyms.map((g, i) => map.stride * (i + 1) + 1 + catalog.realms.findIndex((d) => d.id === g.realm)),
    ]),
  );
  assert.equal(Object.keys(map.places).length, catalog.gyms.length);
  for (const { id } of catalog.realms) {
    const { anchor } = map.regions[id];
    const [x, y, w, h] = map.bounds;
    assert(anchor[0] >= x && anchor[0] <= x + w && anchor[1] >= y && anchor[1] <= y + h);
  }
  const coastline = shore(map);
  assert(!coasts.has(coastline), "Different seeds must change the water geometry");
  coasts.add(coastline);
  assert.equal(digest(map.vertices), digest(make(seed).vertices), "Seed must replay exactly");
  assert.equal(
    coastline,
    shore(make(seed, [...catalog.realms].reverse())),
    "Domain order must preserve geography",
  );
}
console.log(
  `Verified ${seeds.length} distinct coasts, deterministic seed replay, domain independence, flat hall footprints and triangle ownership.`,
);

const extra = { id: "third-forge", realm: "robotics" };
const grown = generateLandscape(17, catalog.realms, buffer, [...catalog.gyms, extra]);
const original = make(17);
for (const g of catalog.gyms) assert.deepEqual(grown.places[g.id], original.places[g.id]);
assert(grown.places[extra.id]);
