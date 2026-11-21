import { bonusFor, insideRings, type Continent, type SeaLink, type Territory, type WorldMap } from "./map";
import { WORLD_COLS, WORLD_CONTINENTS, WORLD_INERT, WORLD_LAND, WORLD_LINKS, WORLD_REGIONS, WORLD_RIDGES, WORLD_ROWS, WORLD_UNIT } from "./world-data";

/**
 * The map of the real world: Natural Earth's countries (public domain) grouped our own way into 48 regions on six
 * continents, the largest countries cut along lines of our own (see scripts/build-world.mjs, which writes
 * ./world-data.ts). Built once and kept; free of Three.js and DOM.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;
/** A ring written by the build script, as x, y pairs in grid units: steps zigzagged in five-bit groups, a sixth bit for more. */
export function decodeRing(text: string, unit = WORLD_UNIT) {
  const out: number[] = [],
    at = [0, 0];
  let k = 0;
  for (let i = 0; i < text.length; ) {
    let z = 0,
      shift = 0,
      c: number;
    do {
      c = VALUE[text.charCodeAt(i++)];
      z += (c & 31) * 2 ** shift;
      shift += 5;
    } while (c & 32);
    at[k] += z % 2 ? -(z + 1) / 2 : z / 2;
    out.push(at[k] / unit);
    k ^= 1;
  }
  return new Float32Array(out);
}
/** Secret missions to hold continents, our own pairs: 0 북아메리카, 1 남아메리카, 2 유럽, 3 아프리카, 4 아시아, 5 오세아니아. */
export const WORLD_MISSIONS = [
  { continents: [0, 1], extra: false },
  { continents: [2, 3], extra: false },
  { continents: [4, 5], extra: false },
  { continents: [0, 2], extra: false },
  { continents: [1, 3], extra: true },
  { continents: [1, 5], extra: true },
];
let built: WorldMap | null = null;
/** The world map (the same object every time: maps are never changed). */
export function worldMap(): WorldMap {
  if (built) return built;
  const shapes = WORLD_REGIONS.map((r) => r.rings.map((text) => decodeRing(text))),
    boxes = new Float32Array(shapes.length * 4);
  shapes.forEach((rings, t) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const ring of rings)
      for (let i = 0; i < ring.length; i += 2) {
        minX = Math.min(minX, ring[i]);
        maxX = Math.max(maxX, ring[i]);
        minY = Math.min(minY, ring[i + 1]);
        maxY = Math.max(maxY, ring[i + 1]);
      }
    boxes.set([minX, minY, maxX, maxY], t * 4);
  });
  const sea = WORLD_REGIONS.map(() => [] as number[]);
  for (const l of WORLD_LINKS) {
    sea[l.a].push(l.b);
    sea[l.b].push(l.a);
  }
  const territories: Territory[] = WORLD_REGIONS.map((r, id) => ({
    id,
    name: r.name,
    continent: r.continent,
    x: r.x,
    y: r.y,
    cells: Math.max(1, Math.round(r.area)),
    neighbours: [...new Set([...WORLD_LAND[id], ...sea[id]])].sort((a, b) => a - b),
    sea: sea[id].sort((a, b) => a - b),
  }));
  const continents: Continent[] = WORLD_CONTINENTS.map((c, id) => {
    const members = territories.filter((t) => t.continent === id).map((t) => t.id),
      // A way in is a territory with a neighbour on another continent, by land or by sea.
      borders = members.filter((t) => territories[t].neighbours.some((n) => territories[n].continent !== id)).length;
    return { id, name: c.name, territories: members, borders, bonus: bonusFor(members.length, borders), label: { x: c.x, y: c.y } };
  });
  const links: SeaLink[] = WORLD_LINKS.map((l) => ({ a: l.a, b: l.b, from: { x: l.from[0], y: l.from[1] }, to: { x: l.to[0], y: l.to[1] }, wrap: l.wrap }));
  const map: WorldMap = {
    size: "world",
    cols: WORLD_COLS,
    rows: WORLD_ROWS,
    cell: new Int16Array(WORLD_COLS * WORLD_ROWS).fill(-1),
    territories,
    continents,
    links,
    seed: 2024,
    shapes,
    boxes,
    inert: WORLD_INERT.map((text) => decodeRing(text)),
    ridges: WORLD_RIDGES.map(([height, width, points]) => ({ height, width, points })),
    missions: WORLD_MISSIONS,
  };
  // The coarse grid, for what reads cells: the territory under each cell's middle.
  for (let j = 0; j < WORLD_ROWS; j++)
    for (let i = 0; i < WORLD_COLS; i++) {
      let t = -1;
      for (let k = 0; k < shapes.length && t < 0; k++) {
        const x = i + 0.5,
          y = j + 0.5;
        if (x >= boxes[k * 4] && y >= boxes[k * 4 + 1] && x <= boxes[k * 4 + 2] && y <= boxes[k * 4 + 3] && insideRings(shapes[k], x, y)) t = k;
      }
      map.cell[j * WORLD_COLS + i] = t;
    }
  built = map;
  return map;
}
