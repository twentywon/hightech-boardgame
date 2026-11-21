import { COLS, HEXES, NEIGHBOURS, colOf, distance, hexOf, rowOf } from "./board";

/*
 * Random maps for 헥스 정복전, our own generator. A map is drawn in tries, each from the same stream of numbers, and
 * the first try that is fair (or the fairest of them all) is kept:
 *  1. A capital is set near each corner (two choices of column and of row each).
 *  2. A height field is summed from soft blobs: one on each corner, a few more of land at random, and a few of
 *     water kept away from the corners (seas, lakes and the straits between them), with a little noise; the highest
 *     58–68% of the hexes are land. Specks of land and of water are smoothed away, small islands without anything
 *     on them sink, and each capital always stands on land with land round it.
 *  3. The board is shared among the four corners by distance (each corner's reach); a try whose reaches hold very
 *     different amounts of land is not fair.
 *  4. Towns: about one for every ten hexes of land, as many in each corner's reach, never next to another town, a
 *     port or a capital.
 *  5. Ports: on coasts, one in each reach where it can be, and at least one on every land mass that holds a town or a
 *     capital, apart from every other estate.
 *  6. Every capital and estate must be reachable from every capital by land, or by a port and the sea.
 * Free of Three.js and DOM.
 */
export const NONE = 0,
  CAPITAL = 1,
  TOWN = 2,
  PORT = 3;
export type Estate = typeof NONE | typeof CAPITAL | typeof TOWN | typeof PORT;
export interface HexMap {
  land: boolean[];
  estate: Estate[];
  /** The hex of the capital near each corner, for nations 0–3: lower left (mine), upper left, upper right, lower right. */
  corners: number[];
}
/** A quick generator of its own, seeded by one number drawn from the game's random, so that a map can be laid again. */
export function seeded(seed: number) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ROOT3 = Math.sqrt(3);
/** Where a hex's middle is, in hex widths (columns 1.5 apart). */
export const centreOf = (h: number) => ({ x: 1.5 * colOf(h), z: ROOT3 * (rowOf(h) + (colOf(h) & 1) / 2) });
const apart = (a: number, b: number) => {
  const p = centreOf(a),
    q = centreOf(b);
  return Math.hypot(p.x - q.x, p.z - q.z);
};
/** Which corner's reach each hex lies in: the nearest capital, ties to the lower number. */
export function reaches(corners: number[]) {
  return Array.from({ length: HEXES }, (_, h) => {
    let best = 0;
    corners.forEach((c, i) => {
      if (apart(h, c) < apart(h, corners[best]) - 1e-9) best = i;
    });
    return best;
  });
}
/**
 * Every hex an army could reach from `from` if no army stood in the way: land to land, water to water, a port onto
 * the water, and the water onto any land.
 */
export function reachable(map: Pick<HexMap, "land" | "estate">, from: number) {
  const seen = new Array<boolean>(HEXES).fill(false),
    queue = [from];
  seen[from] = true;
  while (queue.length) {
    const h = queue.shift()!;
    for (const n of NEIGHBOURS[h]) {
      if (seen[n]) continue;
      if (map.land[h] && !map.land[n] && map.estate[h] !== PORT) continue;
      seen[n] = true;
      queue.push(n);
    }
  }
  return seen;
}
/** The land in each corner's reach and the towns in it, and how fair that is: the least land over the most. */
export function fairness(map: HexMap) {
  const reach = reaches(map.corners),
    land = [0, 0, 0, 0],
    towns = [0, 0, 0, 0];
  for (let h = 0; h < HEXES; h++) {
    if (!map.land[h]) continue;
    land[reach[h]]++;
    if (map.estate[h] === TOWN) towns[reach[h]]++;
  }
  return { land, towns, ratio: Math.min(...land) / Math.max(...land) };
}
/** The groups of hexes joined to each other, of land (or of water). */
function components(land: boolean[], ofLand: boolean) {
  const group = new Array<number>(HEXES).fill(-1),
    sizes: number[] = [];
  for (let h = 0; h < HEXES; h++) {
    if (land[h] !== ofLand || group[h] >= 0) continue;
    const id = sizes.length,
      stack = [h];
    group[h] = id;
    let size = 0;
    while (stack.length) {
      const x = stack.pop()!;
      size++;
      for (const n of NEIGHBOURS[x])
        if (land[n] === ofLand && group[n] < 0) {
          group[n] = id;
          stack.push(n);
        }
    }
    sizes.push(size);
  }
  return { group, sizes };
}
function attempt(random: () => number): HexMap | null {
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  // 1. The four capitals, near the corners.
  const corners = [
    hexOf(1 + Math.floor(random() * 2), 8 + Math.floor(random() * 2)),
    hexOf(1 + Math.floor(random() * 2), 1 + Math.floor(random() * 2)),
    hexOf(COLS - 2 - Math.floor(random() * 2), 1 + Math.floor(random() * 2)),
    hexOf(COLS - 2 - Math.floor(random() * 2), 8 + Math.floor(random() * 2)),
  ];
  // 2. A height field of soft blobs.
  const blobs: { at: { x: number; z: number }; w: number; r: number }[] = corners.map((c) => ({ at: centreOf(c), w: 1, r: 2.6 + random() * 0.8 }));
  const anywhere = () => ({ x: random() * 1.5 * (COLS - 1), z: random() * ROOT3 * 10.5 });
  const lands = 4 + Math.floor(random() * 4);
  for (let i = 0; i < lands; i++) blobs.push({ at: anywhere(), w: 0.55 + random() * 0.5, r: 2 + random() * 2.6 });
  const seas = 2 + Math.floor(random() * 3);
  for (let i = 0, tries = 0; i < seas && tries < 60; tries++) {
    const at = anywhere();
    if (corners.some((c) => Math.hypot(centreOf(c).x - at.x, centreOf(c).z - at.z) < 4.2)) continue;
    blobs.push({ at, w: -(0.7 + random() * 0.6), r: 1.3 + random() * 1.8 });
    i++;
  }
  const height = Array.from({ length: HEXES }, (_, h) => {
    const p = centreOf(h);
    let v = random() * 0.32;
    for (const b of blobs) v += b.w * Math.exp(-((p.x - b.at.x) ** 2 + (p.z - b.at.z) ** 2) / (b.r * b.r));
    return v;
  });
  const share = 0.58 + random() * 0.1,
    sorted = [...height].sort((a, b) => b - a),
    level = sorted[Math.floor(share * HEXES)];
  let land = height.map((v) => v > level);
  const ground = () => {
    for (const c of corners) {
      land[c] = true;
      for (const n of NEIGHBOURS[c]) land[n] = true;
    }
  };
  ground();
  // Specks smoothed away: lone land sinks, water shut in by land fills up unless it is a lake worth keeping.
  land = land.map((on, h) => {
    const around = NEIGHBOURS[h].filter((n) => land[n]).length;
    if (on && around <= 1) return false;
    if (!on && around === NEIGHBOURS[h].length && random() < 0.6) return true;
    return on;
  });
  ground();
  // Small islands with nothing on them sink.
  const { group, sizes } = components(land, true);
  for (let h = 0; h < HEXES; h++) if (land[h] && sizes[group[h]] < 3 && !corners.includes(h)) land[h] = false;
  ground();
  const estate: Estate[] = new Array(HEXES).fill(NONE);
  for (const c of corners) estate[c] = CAPITAL;
  // 3. Fair shares: each corner's reach must hold about as much land as the others.
  const reach = reaches(corners),
    landIn = [0, 0, 0, 0];
  for (let h = 0; h < HEXES; h++) if (land[h]) landIn[reach[h]]++;
  if (Math.min(...landIn) / Math.max(...landIn) < 0.72) return null;
  const free = (h: number) => land[h] && estate[h] === NONE && NEIGHBOURS[h].every((n) => estate[n] === NONE);
  // 4. Towns, as many in each reach.
  const total = landIn.reduce((a, b) => a + b, 0),
    each = Math.max(2, Math.round(total / 40));
  for (let r = 0; r < 4; r++)
    for (let t = 0; t < each; t++) {
      const spots = [];
      for (let h = 0; h < HEXES; h++) if (reach[h] === r && free(h) && distance(h, corners[r]) >= 2) spots.push(h);
      if (!spots.length) return null;
      estate[pick(spots)] = TOWN;
    }
  // 5. Ports on coasts: one in each reach where it can be, then one on every land mass that holds an estate without one.
  const water = components(land, false),
    coast = (h: number) => NEIGHBOURS[h].some((n) => !land[n] && water.sizes[water.group[n]] >= 3);
  for (let r = 0; r < 4; r++) {
    const spots = [];
    for (let h = 0; h < HEXES; h++) if (reach[h] === r && free(h) && coast(h)) spots.push(h);
    if (spots.length) estate[pick(spots)] = PORT;
  }
  const masses = components(land, true);
  for (let id = 0; id < masses.sizes.length; id++) {
    const hexes = [];
    for (let h = 0; h < HEXES; h++) if (masses.group[h] === id) hexes.push(h);
    if (masses.sizes.length === 1) break;
    if (!hexes.some((h) => estate[h] !== NONE) || hexes.some((h) => estate[h] === PORT)) continue;
    const spots = hexes.filter((h) => free(h) && coast(h)),
      // A small island may have no room apart from its town: the port may then stand beside it.
      near = spots.length ? spots : hexes.filter((h) => land[h] && estate[h] === NONE && coast(h));
    if (!near.length) return null;
    estate[pick(near)] = PORT;
  }
  // 6. Every capital and estate reachable from every capital.
  const map: HexMap = { land, estate, corners };
  for (const c of corners) {
    const seen = reachable(map, c);
    for (let h = 0; h < HEXES; h++) if (estate[h] !== NONE && !seen[h]) return null;
  }
  return map;
}
/** A fair map drawn from `random` (the fairest of the tries when none is fair enough). */
export function generateMap(random: () => number): HexMap {
  let best: HexMap | null = null,
    bestRatio = -1;
  for (let i = 0; i < 200; i++) {
    const map = attempt(random);
    if (!map) continue;
    const { ratio } = fairness(map);
    if (ratio >= 0.85) return map;
    if (ratio > bestRatio) {
      best = map;
      bestRatio = ratio;
    }
    if (i >= 40 && best) break;
  }
  return best ?? plain();
}
/** Land everywhere but a sea in the middle, for the unlikely case that no try came out at all. */
function plain(): HexMap {
  const corners = [hexOf(1, 9), hexOf(1, 1), hexOf(18, 1), hexOf(18, 9)],
    land = Array.from({ length: HEXES }, (_, h) => !(Math.abs(colOf(h) - 9.5) < 2 && Math.abs(rowOf(h) - 5) < 2)),
    estate: Estate[] = new Array(HEXES).fill(NONE);
  for (const c of corners) estate[c] = CAPITAL;
  for (const t of [hexOf(4, 7), hexOf(4, 3), hexOf(15, 3), hexOf(15, 7), hexOf(9, 1), hexOf(10, 9)]) estate[t] = TOWN;
  for (const p of [hexOf(7, 5), hexOf(12, 5)]) estate[p] = PORT;
  return { land, estate, corners };
}
