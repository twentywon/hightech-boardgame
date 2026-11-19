import type { Random } from "../../core/random";
import { continentName, territoryName } from "./names";

/**
 * A world made anew for every game (so that no map is copied): continents are land masses grown on a sea of grid
 * cells, each cut into territories by growing them from seeds spread over it (a Voronoi-like division, relaxed twice),
 * and joined across the sea by links where they come nearest, so that every territory can be reached. Everything is
 * drawn from the `random` passed in, so a seed replays the same world. Free of Three.js and DOM.
 */
export type Size = "small" | "medium" | "large";
export interface Territory {
  id: number;
  name: string;
  continent: number;
  /** Where its armies stand: the cell deepest inside it, in grid units (cell centres are at half units). */
  x: number;
  y: number;
  /** How many grid cells it covers. */
  cells: number;
  /** Every territory one may attack or move to from here, by land or by sea, in increasing order. */
  neighbours: number[];
  /** The neighbours reached only across the sea. */
  sea: number[];
}
export interface Continent {
  id: number;
  name: string;
  territories: number[];
  /** Territories from which another continent can be reached. */
  borders: number;
  /** Armies a turn for holding all of it. */
  bonus: number;
  /** Where its name is written, in the sea beside it (grid units). */
  label: { x: number; y: number };
}
/** A crossing by sea, drawn dashed from coast to coast. */
export interface SeaLink {
  a: number;
  b: number;
  /** The two coast points it joins, in grid units. */
  from: { x: number; y: number };
  to: { x: number; y: number };
}
export interface WorldMap {
  size: Size;
  cols: number;
  rows: number;
  /** The territory of each cell (row by row), or -1 for the sea. */
  cell: Int16Array;
  territories: Territory[];
  continents: Continent[];
  links: SeaLink[];
  /** Seeds of the drawing's wavy borders and relief: the same map is always drawn the same way. */
  seed: number;
}
/** The three sizes the setup offers. */
export const SIZES: Record<Size, { label: string; cols: number; rows: number; territories: number; continents: number; extra: number }> = {
  small: { label: "작게", cols: 40, rows: 25, territories: 18, continents: 4, extra: 1 },
  medium: { label: "보통", cols: 48, rows: 30, territories: 30, continents: 5, extra: 2 },
  large: { label: "크게", cols: 56, rows: 35, territories: 42, continents: 6, extra: 3 },
};
/** Share of the grid that is land, the sea kept between two continents (in cells), and the smallest continent. */
const LAND = 0.44,
  GAP = 2,
  SMALLEST = 3;
/** A continent's bonus: more for more territories, less for fewer ways in. */
export const bonusFor = (territories: number, borders: number) => Math.max(2, Math.round(0.5 * territories + 0.5 * borders - 0.5));

/** A number in [0, 1) for a lattice point, the same for the same seed. */
export function hash(i: number, j: number, seed: number) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1): `scale` cells between lattice points. */
export function noise(x: number, y: number, seed: number, scale: number) {
  const u = x / scale,
    v = y / scale,
    i = Math.floor(u),
    j = Math.floor(v),
    fu = u - i,
    fv = v - j,
    su = fu * fu * (3 - 2 * fu),
    sv = fv * fv * (3 - 2 * fv),
    a = hash(i, j, seed),
    b = hash(i + 1, j, seed),
    c = hash(i, j + 1, seed),
    d = hash(i + 1, j + 1, seed);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}
/** Two octaves of noise, for coasts and relief. */
export const fbm = (x: number, y: number, seed: number, scale: number) => 0.65 * noise(x, y, seed, scale) + 0.35 * noise(x, y, seed + 17, scale / 2.3);
/** How far the drawn borders wander from the grid, in cells. */
const WARP = 0.42;
/** Where a point of the map is looked up in the grid: borders drawn this way wander instead of following the cells. */
export const warped = (seed: number, x: number, y: number) => ({ u: x + (noise(x, y, seed + 101, 2.6) - 0.5) * 2 * WARP, v: y + (noise(x, y, seed + 202, 2.6) - 0.5) * 2 * WARP });
/** The territory at a point of the map (grid units), following the wavy borders the map is drawn with; -1 for sea. */
export function territoryAt(map: WorldMap, x: number, y: number) {
  const { u, v } = warped(map.seed, x, y),
    i = Math.floor(u),
    j = Math.floor(v);
  if (i < 0 || j < 0 || i >= map.cols || j >= map.rows) return -1;
  return map.cell[j * map.cols + i];
}

/** A small binary heap of cells by priority. */
class Heap {
  private keys: number[] = [];
  private items: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const keys = this.keys,
      items = this.items;
    let k = items.length;
    keys.push(key);
    items.push(item);
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[k] = keys[parent];
      items[k] = items[parent];
      k = parent;
    }
    keys[k] = key;
    items[k] = item;
  }
  pop() {
    const keys = this.keys,
      items = this.items,
      top = items[0],
      lastKey = keys.pop()!,
      lastItem = items.pop()!;
    if (items.length) {
      let k = 0;
      for (;;) {
        let child = 2 * k + 1;
        if (child >= items.length) break;
        if (child + 1 < items.length && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        keys[k] = keys[child];
        items[k] = items[child];
        k = child;
      }
      keys[k] = lastKey;
      items[k] = lastItem;
    }
    return top;
  }
}
const STEPS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** How many territories each continent gets: at least `SMALLEST`, the rest shared out unevenly. */
function shares(total: number, count: number, random: Random) {
  const out = Array.from({ length: count }, () => SMALLEST),
    weights = out.map(() => 0.45 + random()),
    cap = Math.max(SMALLEST + 2, Math.ceil((total / count) * 1.7));
  let left = total - SMALLEST * count;
  while (left > 0) {
    const sum = weights.reduce((s, w, c) => s + (out[c] < cap ? w : 0), 0);
    let r = random() * sum;
    for (let c = 0; c < count; c++) {
      if (out[c] >= cap) continue;
      r -= weights[c];
      if (r <= 0 || c === count - 1) {
        out[c]++;
        break;
      }
    }
    left--;
  }
  return out;
}

/** Makes a new world of the given size. A world that came out short of a continent, or not joined up, is made again. */
export function generateMap(size: Size, random: Random): WorldMap {
  let map = build(size, random);
  for (let tries = 0; tries < 6 && (map.continents.length < SIZES[size].continents || !connected(map)); tries++) map = build(size, random);
  return map;
}
function build(size: Size, random: Random): WorldMap {
  const spec = SIZES[size],
    { cols, rows } = spec,
    seed = Math.floor(random() * 2147483647),
    counts = shares(spec.territories, spec.continents, random),
    perTerritory = Math.floor((cols * rows * LAND) / spec.territories),
    targets = counts.map((k) => k * perTerritory),
    land = new Int16Array(cols * rows).fill(-1),
    index = (i: number, j: number) => j * cols + i;
  // Continent centres: the largest first, each where it keeps the most room from the others and from the edges.
  const order = counts.map((_, c) => c).sort((a, b) => targets[b] - targets[a] || a - b),
    centres: { x: number; y: number; r: number }[] = new Array(spec.continents);
  for (const c of order) {
    const r = Math.sqrt(targets[c] / Math.PI);
    let best = { x: cols / 2, y: rows / 2, r },
      room = -Infinity;
    for (let k = 0; k < 48; k++) {
      const x = r * 0.75 + 1.5 + random() * Math.max(0.1, cols - 2 * (r * 0.75 + 1.5)),
        y = r * 0.7 + 1.5 + random() * Math.max(0.1, rows - 2 * (r * 0.7 + 1.5));
      // Nothing grows from the open corner at the lower left.
      if (x < cols * 0.26 + r * 0.7 && y > rows * 0.74 - r * 0.7) continue;
      let clear = Math.min(x - r * 0.5, cols - x - r * 0.5, (y - r * 0.5) * 1.3, (rows - y - r * 0.5) * 1.3);
      for (const other of centres) if (other) clear = Math.min(clear, Math.hypot(other.x - x, other.y - y) - other.r - r);
      if (clear > room) {
        room = clear;
        best = { x, y, r };
      }
    }
    centres[c] = best;
  }
  // Continents grow from their centres a cell at a time, the one furthest behind its size first, always keeping a
  // strait of sea between them; noise in the order makes bays and peninsulas.
  const fronts = centres.map(() => new Heap()),
    grown = counts.map(() => 0),
    priority = (c: number, i: number, j: number) =>
      Math.hypot(i + 0.5 - centres[c].x, (j + 0.5 - centres[c].y) * 1.15) / centres[c].r + (fbm(i, j, seed + 7 + c, 5) - 0.5) * 1.3 + random() * 0.04;
  centres.forEach((centre, c) => {
    const i = Math.max(1, Math.min(cols - 2, Math.floor(centre.x))),
      j = Math.max(1, Math.min(rows - 2, Math.floor(centre.y)));
    fronts[c].push(index(i, j), 0);
  });
  const blocked = (c: number, i: number, j: number) => {
    if (i < 1 || j < 1 || i >= cols - 1 || j >= rows - 1) return true;
    // The lower left corner stays open sea: the players' figures are written over it.
    if (i < cols * 0.26 && j > rows * 0.74) return true;
    for (let dj = -GAP; dj <= GAP; dj++)
      for (let di = -GAP; di <= GAP; di++) {
        const x = i + di,
          y = j + dj;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const owner = land[index(x, y)];
        if (owner !== -1 && owner !== c) return true;
      }
    return false;
  };
  for (;;) {
    let c = -1,
      behind = Infinity;
    for (let k = 0; k < counts.length; k++) {
      const share = grown[k] / targets[k];
      if (grown[k] < targets[k] && fronts[k].size && share < behind) {
        behind = share;
        c = k;
      }
    }
    if (c < 0) break;
    while (fronts[c].size) {
      const cell = fronts[c].pop(),
        i = cell % cols,
        j = (cell - i) / cols;
      if (land[cell] !== -1 || blocked(c, i, j)) continue;
      land[cell] = c;
      grown[c]++;
      for (const [di, dj] of STEPS) {
        const x = i + di,
          y = j + dj;
        if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1 && land[index(x, y)] === -1) fronts[c].push(index(x, y), priority(c, x, y));
      }
      break;
    }
  }
  // Lakes held by one continent alone are filled in: every sea cell reaches the edge of the world.
  const open = new Uint8Array(cols * rows),
    queue: number[] = [];
  for (let i = 0; i < cols; i++) for (const j of [0, rows - 1]) if (land[index(i, j)] === -1 && !open[index(i, j)]) (open[index(i, j)] = 1), queue.push(index(i, j));
  for (let j = 0; j < rows; j++) for (const i of [0, cols - 1]) if (land[index(i, j)] === -1 && !open[index(i, j)]) (open[index(i, j)] = 1), queue.push(index(i, j));
  for (let q = 0; q < queue.length; q++) {
    const cell = queue[q],
      i = cell % cols,
      j = (cell - i) / cols;
    for (const [di, dj] of STEPS) {
      const x = i + di,
        y = j + dj;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const next = index(x, y);
      if (land[next] === -1 && !open[next]) {
        open[next] = 1;
        queue.push(next);
      }
    }
  }
  for (let cell = 0; cell < land.length; cell++) {
    if (land[cell] !== -1 || open[cell]) continue;
    // The whole pocket and the land round it.
    const pocket = [cell],
      shores = new Set<number>();
    open[cell] = 2;
    for (let q = 0; q < pocket.length; q++) {
      const at = pocket[q],
        i = at % cols,
        j = (at - i) / cols;
      for (const [di, dj] of STEPS) {
        const next = index(i + di, j + dj);
        if (land[next] !== -1) shores.add(land[next]);
        else if (!open[next]) {
          open[next] = 2;
          pocket.push(next);
        }
      }
    }
    if (shores.size === 1) {
      const c = [...shores][0];
      for (const at of pocket) land[at] = c;
      grown[c] += pocket.length;
    }
  }
  // A continent that could not grow enough for its territories gives some up.
  const minCells = Math.max(6, Math.floor(perTerritory * 0.45));
  counts.forEach((k, c) => (counts[c] = Math.max(2, Math.min(k, Math.floor(grown[c] / minCells)))));
  // Territories: seeds spread over each continent (each the cell furthest from those already chosen), grown together
  // the smallest first, then moved to the middle of what they grew and grown again.
  const cell = new Int16Array(cols * rows).fill(-1),
    starts: number[] = [];
  let next = 0;
  const reach = new Int32Array(cols * rows);
  for (let c = 0; c < counts.length; c++) {
    const mine: number[] = [];
    for (let k = 0; k < land.length; k++) if (land[k] === c) mine.push(k);
    if (!mine.length) continue;
    const seeds = [mine[Math.floor(random() * mine.length) % mine.length]];
    // The first seed is moved to the cell furthest from it, so that seeds start from the continent's ends.
    const far = (from: number[]) => {
      reach.fill(-1);
      const q = [...from];
      for (const s of from) reach[s] = 0;
      let last = from[0];
      for (let h = 0; h < q.length; h++) {
        const at = q[h],
          i = at % cols,
          j = (at - i) / cols;
        last = at;
        for (const [di, dj] of STEPS) {
          const n = index(i + di, j + dj);
          if (land[n] === c && reach[n] < 0) {
            reach[n] = reach[at] + 1;
            q.push(n);
          }
        }
      }
      return last;
    };
    seeds[0] = far(seeds);
    while (seeds.length < counts[c]) seeds.push(far(seeds));
    const grow = (from: number[]) => {
      for (const k of mine) cell[k] = -1;
      const heaps = from.map(() => new Heap()),
        sizes = from.map(() => 1),
        ids = from.map((_, t) => next + t);
      from.forEach((s, t) => {
        cell[s] = ids[t];
        const i = s % cols,
          j = (s - i) / cols;
        for (const [di, dj] of STEPS) heaps[t].push(index(i + di, j + dj), 0);
      });
      const sx = from.map((s) => (s % cols) + 0.5),
        sy = from.map((s) => Math.floor(s / cols) + 0.5);
      for (let left = mine.length - from.length; left > 0; ) {
        let t = -1;
        for (let k = 0; k < from.length; k++) {
          while (heaps[k].size) {
            const top = heaps[k].pop();
            if (land[top] === c && cell[top] === -1) {
              heaps[k].push(top, -1);
              break;
            }
          }
          if (heaps[k].size && (t < 0 || sizes[k] < sizes[t])) t = k;
        }
        if (t < 0) break;
        const at = heaps[t].pop(),
          i = at % cols,
          j = (at - i) / cols;
        cell[at] = ids[t];
        sizes[t]++;
        left--;
        for (const [di, dj] of STEPS) {
          const n = index(i + di, j + dj);
          if (land[n] === c && cell[n] === -1) heaps[t].push(n, Math.hypot(i + di + 0.5 - sx[t], j + dj + 0.5 - sy[t]) + (fbm(i + di, j + dj, seed + 31, 3) - 0.5) * 2.2 + random() * 0.05);
        }
      }
    };
    let chosen = seeds;
    for (let round = 0; round < 3; round++) {
      grow(chosen);
      if (round === 2) break;
      // Each seed moves to its territory's cell nearest the territory's middle.
      chosen = chosen.map((_, t) => {
        let sx = 0,
          sy = 0,
          n = 0;
        for (const k of mine)
          if (cell[k] === next + t) {
            sx += k % cols;
            sy += Math.floor(k / cols);
            n++;
          }
        sx /= n;
        sy /= n;
        let best = chosen[t],
          d = Infinity;
        for (const k of mine)
          if (cell[k] === next + t) {
            const e = Math.hypot((k % cols) - sx, Math.floor(k / cols) - sy);
            if (e < d) {
              d = e;
              best = k;
            }
          }
        return best;
      });
    }
    starts.push(next);
    next += seeds.length;
  }
  // Every territory's place for its armies (the cell deepest inside it), its size and its neighbours by land.
  const total = next,
    depth = new Int32Array(cols * rows).fill(-1),
    border: number[] = [];
  for (let k = 0; k < cell.length; k++) {
    if (cell[k] < 0) continue;
    const i = k % cols,
      j = (k - i) / cols;
    if (STEPS.some(([di, dj]) => cell[index(i + di, j + dj)] !== cell[k])) {
      depth[k] = 0;
      border.push(k);
    }
  }
  for (let h = 0; h < border.length; h++) {
    const at = border[h],
      i = at % cols,
      j = (at - i) / cols;
    for (const [di, dj] of STEPS) {
      const n = index(i + di, j + dj);
      if (cell[n] === cell[at] && depth[n] < 0) {
        depth[n] = depth[at] + 1;
        border.push(n);
      }
    }
  }
  const continentOf: number[] = [],
    areas = new Array(total).fill(0),
    mx = new Array(total).fill(0),
    my = new Array(total).fill(0),
    anchor = new Array(total).fill(-1),
    links = Array.from({ length: total }, () => new Set<number>());
  for (let k = 0; k < cell.length; k++) {
    const t = cell[k];
    if (t < 0) continue;
    continentOf[t] = land[k];
    areas[t]++;
    mx[t] += (k % cols) + 0.5;
    my[t] += Math.floor(k / cols) + 0.5;
    const i = k % cols,
      j = (k - i) / cols;
    for (const [di, dj] of [
      [1, 0],
      [0, 1],
    ]) {
      const n = cell[index(i + di, j + dj)];
      if (n >= 0 && n !== t) {
        links[t].add(n);
        links[n].add(t);
      }
    }
  }
  for (let t = 0; t < total; t++) {
    mx[t] /= areas[t];
    my[t] /= areas[t];
  }
  for (let k = 0; k < cell.length; k++) {
    const t = cell[k];
    if (t < 0) continue;
    const a = anchor[t],
      x = (k % cols) + 0.5,
      y = Math.floor(k / cols) + 0.5,
      score = depth[k] - Math.hypot(x - mx[t], y - my[t]) * 0.35;
    if (a < 0) anchor[t] = k;
    else {
      const ax = (a % cols) + 0.5,
        ay = Math.floor(a / cols) + 0.5;
      if (score > depth[a] - Math.hypot(ax - mx[t], ay - my[t]) * 0.35) anchor[t] = k;
    }
  }
  // Coasts, and for every two territories of different continents the nearest their coasts come.
  const coast: number[][] = Array.from({ length: total }, () => []);
  for (let k = 0; k < cell.length; k++) {
    if (cell[k] < 0) continue;
    const i = k % cols,
      j = (k - i) / cols;
    if (STEPS.some(([di, dj]) => cell[index(i + di, j + dj)] === -1)) coast[cell[k]].push(k);
  }
  const candidates: { a: number; b: number; d: number; from: number; to: number }[] = [];
  for (let a = 0; a < total; a++)
    for (let b = a + 1; b < total; b++) {
      if (continentOf[a] === continentOf[b]) continue;
      let d = Infinity,
        from = -1,
        to = -1;
      for (const p of coast[a])
        for (const q of coast[b]) {
          const e = Math.hypot((p % cols) - (q % cols), Math.floor(p / cols) - Math.floor(q / cols));
          if (e < d) {
            d = e;
            from = p;
            to = q;
          }
        }
      if (from >= 0) candidates.push({ a, b, d, from, to });
    }
  candidates.sort((x, y) => x.d - y.d || x.a - y.a || x.b - y.b);
  const centre = (k: number) => ({ x: (k % cols) + 0.5, y: Math.floor(k / cols) + 0.5 }),
    // A crossing may not run over a third continent's land, nor across a crossing already made.
    crosses = (p: { x: number; y: number }, q: { x: number; y: number }, ca: number, cb: number) => {
      const length = Math.hypot(q.x - p.x, q.y - p.y),
        steps = Math.ceil(length * 4);
      for (let s = 1; s < steps; s++) {
        const x = p.x + ((q.x - p.x) * s) / steps,
          y = p.y + ((q.y - p.y) * s) / steps,
          k = index(Math.floor(x), Math.floor(y)),
          c = land[k];
        if (c !== -1 && c !== ca && c !== cb) return true;
      }
      return false;
    },
    meet = (p1: { x: number; y: number }, p2: { x: number; y: number }, q1: { x: number; y: number }, q2: { x: number; y: number }) => {
      const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const d1 = cross(q1, q2, p1),
        d2 = cross(q1, q2, p2),
        d3 = cross(p1, p2, q1),
        d4 = cross(p1, p2, q2);
      return d1 * d2 < 0 && d3 * d4 < 0;
    },
    group = counts.map((_, c) => c),
    find = (c: number): number => (group[c] === c ? c : (group[c] = find(group[c]))),
    chosen: SeaLink[] = [],
    seaCount = new Array(total).fill(0),
    joined = new Set<string>(),
    fits = (cand: (typeof candidates)[number], strict: boolean) => {
      const p = centre(cand.from),
        q = centre(cand.to);
      if (strict && crosses(p, q, continentOf[cand.a], continentOf[cand.b])) return false;
      if (strict && chosen.some((l) => meet(p, q, l.from, l.to))) return false;
      return true;
    },
    take = (cand: (typeof candidates)[number]) => {
      chosen.push({ a: cand.a, b: cand.b, from: centre(cand.from), to: centre(cand.to) });
      seaCount[cand.a]++;
      seaCount[cand.b]++;
      joined.add(`${continentOf[cand.a]}:${continentOf[cand.b]}`);
      joined.add(`${continentOf[cand.b]}:${continentOf[cand.a]}`);
      links[cand.a].add(cand.b);
      links[cand.b].add(cand.a);
    };
  // The fewest crossings that join everything (the shortest first), then a few more for other ways round.
  for (const strict of [true, false])
    for (const cand of candidates) {
      const ga = find(continentOf[cand.a]),
        gb = find(continentOf[cand.b]);
      if (ga === gb || !fits(cand, strict)) continue;
      group[ga] = gb;
      take(cand);
    }
  const longest = Math.max(0, ...chosen.map((l) => Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y)));
  let extra = spec.extra;
  for (const cand of candidates) {
    if (extra <= 0) break;
    if (cand.d > longest * 1.5 + 2 || joined.has(`${continentOf[cand.a]}:${continentOf[cand.b]}`)) continue;
    if (seaCount[cand.a] >= 2 || seaCount[cand.b] >= 2 || !fits(cand, true)) continue;
    take(cand);
    extra--;
  }
  // Names and bonuses.
  const names = new Set<string>(),
    continents: Continent[] = [],
    territories: Territory[] = [];
  for (let t = 0; t < total; t++) {
    const a = anchor[t],
      sea = chosen.flatMap((l) => (l.a === t ? [l.b] : l.b === t ? [l.a] : [])).sort((x, y) => x - y);
    territories.push({ id: t, name: territoryName(random, names), continent: continentOf[t], x: (a % cols) + 0.5, y: Math.floor(a / cols) + 0.5, cells: areas[t], neighbours: [...links[t]].sort((x, y) => x - y), sea });
  }
  const cnames = new Set<string>();
  let id = 0;
  for (let c = 0; c < counts.length; c++) {
    const members = territories.filter((t) => t.continent === c).map((t) => t.id);
    if (!members.length) continue;
    const borders = members.filter((t) => territories[t].sea.length).length;
    continents.push({ id, name: continentName(random, cnames), territories: members, borders, bonus: bonusFor(members.length, borders), label: { x: 0, y: 0 } });
    for (const t of members) territories[t].continent = id;
    id++;
  }
  const map: WorldMap = { size, cols, rows, cell, territories, continents, links: chosen, seed };
  const labels: { x: number; y: number; w: number }[] = [];
  for (const continent of continents) continent.label = labelPlace(map, continent, labels);
  return map;
}
/**
 * Where a continent's name is written: the place in the sea nearest the continent where the words cover the least
 * land, no other continent's name, no crossing and not the open corner kept for the players' figures.
 */
function labelPlace(map: WorldMap, continent: Continent, taken: { x: number; y: number; w: number }[]) {
  const { cols, rows, cell } = map,
    mine = new Set(continent.territories),
    // The words' half width and half height in cells: a glyph is about a cell wide.
    w = (continent.name.length + 3) * 0.45 + 0.4,
    h = 0.8;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    sx = 0,
    sy = 0,
    n = 0;
  for (let k = 0; k < cell.length; k++)
    if (mine.has(cell[k])) {
      const x = k % cols,
        y = Math.floor(k / cols);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      sx += x + 0.5;
      sy += y + 0.5;
      n++;
    }
  const mx = sx / n,
    my = sy / n,
    dashes = map.links.flatMap((l) => Array.from({ length: 9 }, (_, k) => ({ x: l.from.x + ((l.to.x - l.from.x) * k) / 8, y: l.from.y + ((l.to.y - l.from.y) * k) / 8 })));
  let best = { x: mx, y: Math.min(rows - 1, maxY + 1.4) },
    lowest = Infinity;
  for (let y = minY - 3; y <= maxY + 4; y += 0.5)
    for (let x = minX - 3; x <= maxX + 4; x += 0.5) {
      if (x - w < 0.3 || x + w > cols - 0.3 || y - h < 0.3 || y + h > rows - 0.3) continue;
      let cost = 0,
        near = false;
      for (let j = Math.floor(y - h); j <= Math.floor(y + h); j++)
        for (let i = Math.floor(x - w); i <= Math.floor(x + w); i++) {
          const t = cell[j * cols + i];
          if (t >= 0) cost += mine.has(t) ? 6 : 12;
        }
      // It belongs beside its own continent: some of its land within reach of the words.
      for (let j = Math.floor(y - h - 2); j <= Math.floor(y + h + 2) && !near; j++)
        for (let i = Math.floor(x - w - 1); i <= Math.floor(x + w + 1) && !near; i++) if (i >= 0 && j >= 0 && i < cols && j < rows && mine.has(cell[j * cols + i])) near = true;
      if (!near) continue;
      for (const o of taken) if (Math.abs(o.x - x) < o.w + w + 0.5 && Math.abs(o.y - y) < h * 2 + 0.6) cost += 40;
      for (const d of dashes) if (Math.abs(d.x - x) < w + 0.3 && Math.abs(d.y - y) < h + 0.3) cost += 5;
      if (x - w < cols * 0.3 && y + h > rows * 0.72) cost += 1000;
      cost += Math.hypot(x - mx, (y - my) * 1.3) * 0.35;
      if (cost < lowest) {
        lowest = cost;
        best = { x, y };
      }
    }
  taken.push({ ...best, w });
  return best;
}
/** Whether every territory can be reached from every other. */
export function connected(map: WorldMap) {
  const seen = new Set([0]),
    queue = [0];
  for (let q = 0; q < queue.length; q++) for (const n of map.territories[queue[q]].neighbours) if (!seen.has(n)) seen.add(n), queue.push(n);
  return seen.size === map.territories.length;
}
