/**
 * 땅따먹기 (the user asked, after a picture of a game where each player paints land of its own): a square field `N`
 * across and two to four movers, each always on the go. The land is kept in fine cells, `R` to a unit each way (`G` ×
 * `G` of them), so that what a loop takes follows the way the mover went, any shape (the user asked: not squares). A mover's own land is safe; out of it, it leaves a
 * trail behind, and coming back onto its own land takes the trail and everything the trail closes round (whoever's
 * land it was) as its own. A mover whose trail is crossed — by anyone, itself too — is out: its trail and its land are
 * wiped, and after `RESPAWN` seconds it comes back somewhere free with a small patch. Two heads running into each other
 * put out whichever of them stands off its own land. The field's edge is a low wall: a mover slides along it. The
 * round runs for a number of seconds; the most land wins, and land over `WIN_SHARE` of the field wins at once.
 *
 * Fixed slices of `DT`; free of Three.js and the page (the host's view runs it, the tests run it bare).
 */
export const N = 64,
  /** Cells to a unit, each way, and the cells across the field. */
  R = 2,
  G = N * R,
  CELLS = G * G,
  DT = 1 / 60,
  /** Cells a second, and how fast a mover turns (radians a second): a U-turn is about three cells across. */
  SPEED = 5.2,
  TURN = 4.2,
  /** A new home: a round patch, the cells whose middles lie within this many units of its middle. */
  HOME = 2.6,
  RESPAWN = 3,
  COUNTDOWN = 3,
  WIN_SHARE = 0.5,
  /** The last few cells of a trail never cut it (a tight turn passes beside them). */
  SAFE_TAIL = 3 * R,
  /** How near two heads are when they run into each other, in cells. */
  BUMP = 0.7;
export type Level = "easy" | "normal" | "hard";
export const ticks = (seconds: number) => Math.round(seconds / DT);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const cellOf = (x: number, y: number) => clamp(Math.floor(y * R), 0, G - 1) * G + clamp(Math.floor(x * R), 0, G - 1);
/** Where a cell's middle is, in units. */
export const cellX = (c: number) => ((c % G) + 0.5) / R,
  cellY = (c: number) => (Math.floor(c / G) + 0.5) / R;
/** Each cell whose middle lies within `r` units of (`x`, `y`). */
function disc(x: number, y: number, r: number, visit: (c: number) => void) {
  for (let gy = Math.max(0, Math.floor((y - r) * R)); gy <= Math.min(G - 1, Math.floor((y + r) * R)); gy++)
    for (let gx = Math.max(0, Math.floor((x - r) * R)); gx <= Math.min(G - 1, Math.floor((x + r) * R)); gx++)
      if (Math.hypot((gx + 0.5) / R - x, (gy + 0.5) / R - y) <= r) visit(gy * G + gx);
}
/** How many cells a new home patch holds. */
export const PATCH = (() => {
  let n = 0;
  disc(N / 2 + 0.5, N / 2 + 0.5, HOME, () => n++);
  return n;
})();

/** What a computer mover has in mind: a loop of points to run through, or home, or someone's trail to cut. */
export interface Plan {
  points: { x: number; y: number }[];
  mode: "loop" | "home" | "hunt";
  /** The tick it next thinks again (an easy one is slow to see danger). */
  next: number;
  /** Its distance to its own land, unit by unit (`Infinity` where it cannot go), and when that was reckoned. */
  field: Float32Array | null;
  fieldAt: number;
  victim: number;
}
export interface Mover {
  x: number;
  y: number;
  heading: number;
  alive: boolean;
  /** Seconds until it comes back, while out. */
  wait: number;
  cell: number;
  /** Its trail, oldest first (cells). */
  trail: number[];
  /** How many cells of land it holds. */
  land: number;
  /** How many times it was put out, and how many others it put out. */
  outs: number;
  kos: number;
  plan: Plan | null;
}
export interface World {
  /** Whose land each cell is: 0 nobody's, k + 1 mover k's. */
  owner: Uint8Array;
  /** Whose trail runs over each cell: 0 none, k + 1 mover k's. */
  trail: Uint8Array;
  movers: Mover[];
  tick: number;
  /** The tick the round runs out at. */
  end: number;
  /** The tick the round was closed at, or null while it runs. */
  closed: number | null;
  seed: number;
  /** Every cell that changed owner since the view last looked (it clears it). */
  changed: Set<number>;
}
export type Event =
  | { kind: "count"; n: number }
  | { kind: "go" }
  | { kind: "claim"; who: number; cells: number }
  | { kind: "out"; who: number; by: number; how: "cut" | "self" | "bump" | "engulfed" }
  | { kind: "back"; who: number }
  | { kind: "end"; ranking: number[]; shares: number[] };

function random(world: World) {
  // mulberry32
  let t = (world.seed = (world.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Where each mover begins: near the four corners, two of them facing each other across the field. */
export const STARTS = [
  { x: 0.24, y: 0.24 },
  { x: 0.76, y: 0.76 },
  { x: 0.76, y: 0.24 },
  { x: 0.24, y: 0.76 },
];
/** A new home for mover k: a round patch about the middle of unit (`cx`, `cy`). */
function settle(world: World, k: number, cx: number, cy: number) {
  const m = world.movers[k];
  disc(cx + 0.5, cy + 0.5, HOME, (c) => setOwner(world, c, k + 1));
  m.x = cx + 0.5;
  m.y = cy + 0.5;
  m.cell = cellOf(m.x, m.y);
  m.heading = Math.atan2(N / 2 - m.y, N / 2 - m.x);
  m.alive = true;
  m.wait = 0;
  m.trail = [];
  m.plan = null;
}
export function createWorld(count: number, seconds: number, seed: number): World {
  const n = clamp(Math.round(count), 2, 4);
  const world: World = {
    owner: new Uint8Array(CELLS),
    trail: new Uint8Array(CELLS),
    movers: Array.from({ length: n }, () => ({ x: 0, y: 0, heading: 0, alive: true, wait: 0, cell: 0, trail: [], land: 0, outs: 0, kos: 0, plan: null })),
    tick: 0,
    end: ticks(COUNTDOWN + seconds),
    closed: null,
    seed: seed | 0,
    changed: new Set(),
  };
  world.movers.forEach((_, k) => settle(world, k, Math.round(STARTS[k].x * N), Math.round(STARTS[k].y * N)));
  return world;
}
function setOwner(world: World, cell: number, who: number) {
  const was = world.owner[cell];
  if (was === who) return;
  if (was) world.movers[was - 1].land--;
  if (who) world.movers[who - 1].land++;
  world.owner[cell] = who;
  world.changed.add(cell);
}
/** Each mover's share of the field, 0 to 1. */
export const shares = (world: World) => world.movers.map((m) => m.land / CELLS);
/** The movers by land, most first (fewer times out, then the lower number, before a tie). */
export const ranking = (world: World) =>
  world.movers.map((_, k) => k).sort((a, b) => world.movers[b].land - world.movers[a].land || world.movers[a].outs - world.movers[b].outs || a - b);

function knockOut(world: World, k: number, by: number, how: "cut" | "self" | "bump" | "engulfed", events: Event[]) {
  const m = world.movers[k];
  if (!m.alive) return;
  for (const c of m.trail) if (world.trail[c] === k + 1) world.trail[c] = 0;
  m.trail = [];
  for (let c = 0; c < CELLS; c++) if (world.owner[c] === k + 1) setOwner(world, c, 0);
  m.alive = false;
  m.wait = RESPAWN;
  m.plan = null;
  m.outs++;
  if (by >= 0 && by !== k) world.movers[by].kos++;
  events.push({ kind: "out", who: k, by, how });
}
function respawn(world: World, k: number, events: Event[]) {
  // A free place for a new patch, away from the others' heads: a few tries at random, then the emptiest of them.
  let best: { x: number; y: number; score: number } | null = null;
  const edge = Math.ceil(HOME) + 2;
  for (let i = 0; i < 160; i++) {
    const cx = edge + Math.floor(random(world) * (N - 2 * edge)),
      cy = edge + Math.floor(random(world) * (N - 2 * edge));
    let score = 0;
    // (Cells counted a quarter of a unit's worth each, as a unit was.)
    disc(cx + 0.5, cy + 0.5, HOME + 1, (c) => {
      if (world.owner[c] || world.trail[c]) score += 10 / (R * R);
    });
    for (const [j, o] of world.movers.entries()) if (j !== k && o.alive && Math.hypot(o.x - cx, o.y - cy) < 8) score += 40;
    if (!best || score < best.score) best = { x: cx, y: cy, score };
    if (score === 0) break;
  }
  const at = best!;
  disc(at.x + 0.5, at.y + 0.5, HOME, (c) => {
    const t = world.trail[c];
    // A trail under the new patch is cut by it, as by a mover coming through.
    if (t && t !== k + 1) knockOut(world, t - 1, k, "cut", events);
  });
  settle(world, k, at.x, at.y);
  events.push({ kind: "back", who: k });
}
/** Takes mover k's trail and everything it closes round as k's land. */
function claim(world: World, k: number, events: Event[]) {
  const m = world.movers[k],
    mine = k + 1,
    before = m.land;
  for (const c of m.trail) {
    if (world.trail[c] === mine) world.trail[c] = 0;
    setOwner(world, c, mine);
  }
  m.trail = [];
  // Whatever the outside cannot reach without crossing k's land is closed in.
  const out = new Uint8Array(CELLS),
    queue = new Int32Array(CELLS);
  let head = 0,
    tail = 0;
  const visit = (c: number) => {
    if (out[c] || world.owner[c] === mine) return;
    out[c] = 1;
    queue[tail++] = c;
  };
  for (let i = 0; i < G; i++) {
    visit(i);
    visit((G - 1) * G + i);
    visit(i * G);
    visit(i * G + G - 1);
  }
  while (head < tail) {
    const c = queue[head++],
      x = c % G,
      y = (c - x) / G;
    if (x > 0) visit(c - 1);
    if (x < G - 1) visit(c + 1);
    if (y > 0) visit(c - G);
    if (y < G - 1) visit(c + G);
  }
  for (let c = 0; c < CELLS; c++) if (!out[c] && world.owner[c] !== mine) setOwner(world, c, mine);
  events.push({ kind: "claim", who: k, cells: m.land - before });
  // A mover left with no land at all has nowhere to come back to.
  world.movers.forEach((o, j) => {
    if (j !== k && o.alive && o.land === 0) knockOut(world, j, k, "engulfed", events);
  });
}
/** Mover k comes into `cell`. */
function enter(world: World, k: number, cell: number, events: Event[]) {
  const m = world.movers[k];
  m.cell = cell;
  const t = world.trail[cell];
  if (t) {
    if (t === k + 1) {
      const at = m.trail.lastIndexOf(cell);
      if (at >= 0 && at < m.trail.length - SAFE_TAIL) return knockOut(world, k, k, "self", events);
    } else knockOut(world, t - 1, k, "cut", events);
  }
  if (!m.alive) return;
  if (world.owner[cell] === k + 1) {
    if (m.trail.length) claim(world, k, events);
    return;
  }
  if (world.trail[cell] !== k + 1) {
    world.trail[cell] = k + 1;
    m.trail.push(cell);
  }
}
/** Moves mover k one slice toward `want` (a heading, or null to keep on), cell by cell. */
function move(world: World, k: number, want: number | null, events: Event[]) {
  const m = world.movers[k];
  if (want !== null && Number.isFinite(want)) m.heading = wrap(m.heading + clamp(wrap(want - m.heading), -TURN * DT, TURN * DT));
  let nx = m.x + Math.cos(m.heading) * SPEED * DT,
    ny = m.y + Math.sin(m.heading) * SPEED * DT;
  // The low wall round the field: it slides along it (and turns that way).
  const lo = 0.35,
    hi = N - 0.35;
  if (nx < lo || nx > hi) {
    nx = clamp(nx, lo, hi);
    m.heading = Math.sin(m.heading) >= 0 ? Math.PI / 2 : -Math.PI / 2;
    if (Math.abs(Math.sin(m.heading)) > 0.99 && (ny <= lo + 0.2 || ny >= hi - 0.2)) m.heading = ny < N / 2 ? Math.PI / 2 : -Math.PI / 2;
  }
  if (ny < lo || ny > hi) {
    ny = clamp(ny, lo, hi);
    m.heading = Math.cos(m.heading) >= 0 ? 0 : Math.PI;
    if (nx <= lo + 0.2 || nx >= hi - 0.2) m.heading = nx < N / 2 ? 0 : Math.PI;
  }
  const ox = clamp(Math.floor(m.x * R), 0, G - 1),
    oy = clamp(Math.floor(m.y * R), 0, G - 1),
    cx = clamp(Math.floor(nx * R), 0, G - 1),
    cy = clamp(Math.floor(ny * R), 0, G - 1);
  m.x = nx;
  m.y = ny;
  if (cx === ox && cy === oy) return;
  // A diagonal step goes through the cell beside it first, so that a trail is always joined edge to edge.
  if (cx !== ox && cy !== oy) {
    enter(world, k, oy * G + cx, events);
    if (!m.alive) return;
  }
  enter(world, k, cy * G + cx, events);
}
/**
 * One slice of the round: `wants` is each mover's wanted heading (null: straight on). Returns what happened.
 */
export function step(world: World, wants: (number | null)[]): Event[] {
  const events: Event[] = [];
  if (world.closed !== null) return events;
  world.tick++;
  const start = ticks(COUNTDOWN);
  if (world.tick < start) {
    // 3, 2, 1: a second each.
    for (const n of [0, 1, 2]) if (world.tick === Math.max(1, ticks(n))) events.push({ kind: "count", n });
    return events;
  }
  if (world.tick === start) events.push({ kind: "go" });
  world.movers.forEach((m, k) => {
    if (m.alive) return;
    m.wait -= DT;
    if (m.wait <= 0) respawn(world, k, events);
  });
  world.movers.forEach((m, k) => {
    if (m.alive) move(world, k, wants[k] ?? null, events);
  });
  // Heads that run into each other: whichever stands off its own land is out.
  const ms = world.movers;
  for (let a = 0; a < ms.length; a++)
    for (let b = a + 1; b < ms.length; b++) {
      const A = ms[a],
        B = ms[b];
      if (!A.alive || !B.alive || Math.hypot(A.x - B.x, A.y - B.y) > BUMP) continue;
      const aSafe = world.owner[A.cell] === a + 1,
        bSafe = world.owner[B.cell] === b + 1;
      if (!aSafe) knockOut(world, a, b, "bump", events);
      if (!bSafe) knockOut(world, b, a, "bump", events);
    }
  const over = world.tick >= world.end || ms.some((m) => m.land >= WIN_SHARE * CELLS);
  if (over) {
    world.closed = world.tick;
    events.push({ kind: "end", ranking: ranking(world), shares: shares(world) });
  }
  return events;
}
/** Seconds left in the round (the countdown included at its start). */
export const secondsLeft = (world: World) => Math.max(0, (world.end - world.tick) * DT);

// ── The computer's movers ──────────────────────────────────────────────────────────────────────────────────────────

/** How each level plays: the loops it runs, how far it reaches out, how soon it sees danger, whether it hunts. */
export const LEVELS: Record<Level, { out: [number, number]; side: [number, number]; most: number; think: number; margin: number; hunt: number; wobble: number }> = {
  easy: { out: [3, 6], side: [3, 7], most: 22, think: 0.45, margin: 1.2, hunt: 0, wobble: 0.35 },
  normal: { out: [4, 9], side: [4, 10], most: 34, think: 0.2, margin: 1.6, hunt: 6, wobble: 0.12 },
  hard: { out: [5, 12], side: [5, 14], most: 48, think: 0.08, margin: 2, hunt: 11, wobble: 0 },
};
/**
 * Each cell's distance (in steps) to mover k's land, going round its own trail and the field's edge: kept a cell
 * clear of the trail where it can be (a mover cannot turn on the spot), else only off the trail itself.
 */
function homeField(world: World, k: number) {
  // Reckoned a unit at a time (the fine cells are four to a unit: a quarter of the work, near enough to steer by): a
  // unit is home where any of its cells is k's land, and in the way where any is k's older trail.
  const m = world.movers[k],
    mine = k + 1,
    home = new Uint8Array(N * N),
    hard = new Uint8Array(N * N),
    soft = new Uint8Array(N * N),
    unit = (c: number) => Math.floor(Math.floor(c / G) / R) * N + Math.floor((c % G) / R);
  for (let c = 0; c < CELLS; c++) if (world.owner[c] === mine) home[unit(c)] = 1;
  for (let i = 0; i < m.trail.length - 1; i++) hard[unit(m.trail[i])] = 1;
  for (let u = 0; u < N * N; u++) {
    if (!hard[u]) continue;
    const x = u % N;
    for (const n of [x > 0 ? u - 1 : -1, x < N - 1 ? u + 1 : -1, u - N, u + N]) if (n >= 0 && n < N * N && !hard[n]) soft[n] = 1;
  }
  // The units about the head itself are never kept clear: it has to set off from somewhere.
  const hx = Math.floor(m.x),
    hy = Math.floor(m.y),
    at = Math.min(N - 1, Math.max(0, hy)) * N + Math.min(N - 1, Math.max(0, hx));
  for (let y = hy - 1; y <= hy + 1; y++) for (let x = hx - 1; x <= hx + 1; x++) if (x >= 0 && y >= 0 && x < N && y < N) soft[y * N + x] = 0;
  hard[at] = 0;
  const run = (blocked: (u: number) => boolean) => {
    const field = new Float32Array(N * N).fill(Infinity),
      queue = new Int32Array(N * N);
    let head = 0,
      tail = 0;
    for (let u = 0; u < N * N; u++)
      if (home[u]) {
        field[u] = 0;
        queue[tail++] = u;
      }
    while (head < tail) {
      const u = queue[head++],
        x = u % N,
        d = field[u] + 1;
      for (const n of [x > 0 ? u - 1 : -1, x < N - 1 ? u + 1 : -1, u - N, u + N]) {
        if (n < 0 || n >= N * N || field[n] <= d || blocked(n)) continue;
        field[n] = d;
        queue[tail++] = n;
      }
    }
    return field;
  };
  const wide = run((u) => !!hard[u] || (!!soft[u] && !home[u]));
  return Number.isFinite(wide[at]) ? wide : run((u) => !!hard[u]);
}
/** The unit a mover stands in (the home field's index). */
const unitOf = (m: Mover) => Math.min(N - 1, Math.max(0, Math.floor(m.y))) * N + Math.min(N - 1, Math.max(0, Math.floor(m.x)));
/** The fewest units any other mover needs to reach any cell of k's trail (Infinity with no trail). */
function threat(world: World, k: number) {
  const m = world.movers[k];
  let least = Infinity;
  world.movers.forEach((o, j) => {
    if (j === k || !o.alive) return;
    for (let i = 0; i < m.trail.length; i += 2 * R) {
      const c = m.trail[i],
        d = Math.abs(cellX(c) - o.x) + Math.abs(cellY(c) - o.y);
      if (d < least) least = d;
    }
  });
  return least;
}
/**
 * How long mover k could follow `want` (turning toward it as it really turns) before it runs into its own trail,
 * looking `AHEAD` seconds on: `AHEAD` when it never does.
 */
const AHEAD = 0.75;
function clearFor(world: World, k: number, want: number) {
  const m = world.movers[k],
    recent = new Set(m.trail.slice(-SAFE_TAIL)),
    slice = DT * 3;
  let x = m.x,
    y = m.y,
    h = m.heading,
    last = m.cell;
  for (let t = slice; t <= AHEAD; t += slice) {
    h = wrap(h + clamp(wrap(want - h), -TURN * slice, TURN * slice));
    x += Math.cos(h) * SPEED * slice;
    y += Math.sin(h) * SPEED * slice;
    if (x < 0.4 || y < 0.4 || x > N - 0.4 || y > N - 0.4) return t;
    const c = cellOf(x, y);
    if (c !== last) {
      if (world.trail[c] === k + 1 && !recent.has(c)) return t;
      last = c;
    }
  }
  return AHEAD;
}
/** A heading toward `want` that does not run into my own trail: the nearest turn either way that stays clear longest. */
function safeHeading(world: World, k: number, want: number) {
  let best = { h: want, clear: -1 };
  for (const turn of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, 2.8, -2.8]) {
    const h = wrap(want + turn),
      clear = clearFor(world, k, h);
    if (clear >= AHEAD) return h;
    if (clear > best.clear + 0.05) best = { h, clear };
  }
  return best.h;
}
const towards = (m: Mover, p: { x: number; y: number }) => Math.atan2(p.y - m.y, p.x - m.x);
/** Plans a loop out of mover k's land: out one way in a bow, and back. */
function planLoop(world: World, k: number, level: Level): Plan {
  const m = world.movers[k],
    L = LEVELS[level],
    span = (r: [number, number]) => r[0] + random(world) * (r[1] - r[0]);
  // Of the four ways, the one with the most that is not mine within reach (and room before the wall).
  let best = { dir: 0, score: -Infinity };
  for (let i = 0; i < 4; i++) {
    const dir = (i * Math.PI) / 2 + (random(world) - 0.5) * 0.3,
      reach = L.out[1] + 3;
    let score = 0;
    for (let d = 1; d <= reach; d++) {
      const px = m.x + Math.cos(dir) * d,
        py = m.y + Math.sin(dir) * d;
      if (px < 2 || py < 2 || px > N - 2 || py > N - 2) {
        score -= 6;
        break;
      }
      const o = world.owner[cellOf(px, py)];
      score += o === k + 1 ? 0 : o ? 1.4 : 1;
    }
    score += random(world) * 2;
    if (score > best.score) best = { dir, score };
  }
  // From the edge of my land that way.
  let ex = m.x,
    ey = m.y;
  for (let d = 0; d < N && world.owner[cellOf(ex, ey)] === k + 1; d++) {
    ex += Math.cos(best.dir);
    ey += Math.sin(best.dir);
  }
  // A rounded loop, as a hand draws one: out in a bow and back along a curve a little to the side (an egg, a bean,
  // a petal by how far out and how far aside it reaches), its points a few units apart.
  const out = span(L.out),
    side = span(L.side) * (random(world) < 0.5 ? 1 : -1),
    lean = (random(world) - 0.5) * 0.6,
    keep = (p: { x: number; y: number }) => ({ x: clamp(p.x, 1.5, N - 1.5), y: clamp(p.y, 1.5, N - 1.5) }),
    fx = Math.cos(best.dir),
    fy = Math.sin(best.dir),
    points: { x: number; y: number }[] = [];
  for (const t of [0.22, 0.42, 0.6, 0.78, 0.94]) {
    const a = t * Math.PI,
      ahead = out * Math.sin(a) * (1 + lean * Math.cos(a)),
      aside = (side * (1 - Math.cos(a))) / 2;
    points.push(keep({ x: ex + fx * ahead - fy * aside, y: ey + fy * ahead + fx * aside }));
  }
  return { points, mode: "loop", next: 0, field: null, fieldAt: -1, victim: -1 };
}
/**
 * The heading a computer's mover wants now (null: straight on). It runs loops out of its land and back; it heads
 * home the shortest way round its trail as soon as someone could reach its trail before it is home, or once its
 * trail is long; at the levels that hunt it goes for a trail in reach that it can cut before its owner is home.
 */
export function autopilot(world: World, k: number, level: Level): number | null {
  const m = world.movers[k];
  if (!m.alive || world.closed !== null || world.tick < ticks(COUNTDOWN)) return null;
  const L = LEVELS[level];
  const plan = (m.plan ??= planLoop(world, k, level)),
    home = world.owner[m.cell] === k + 1;
  // Thinking: how far home, and who could cut me first.
  if (world.tick >= plan.next) {
    plan.next = world.tick + Math.max(1, ticks(L.think));
    if (!home && m.trail.length) {
      if (!plan.field || world.tick - plan.fieldAt > 5) {
        plan.field = homeField(world, k);
        plan.fieldAt = world.tick;
      }
      const toHome = plan.field[unitOf(m)],
        danger = threat(world, k);
      if (plan.mode !== "home" && (danger < (toHome + 1) * L.margin || m.trail.length > L.most * R)) plan.mode = "home";
    }
    // A trail of someone else's in reach, which I can cut before its owner is home: go for it.
    if (L.hunt && plan.mode !== "home" && m.trail.length < (L.most * R) / 2) {
      let target: { x: number; y: number; d: number; j: number } | null = null;
      world.movers.forEach((o, j) => {
        if (j === k || !o.alive || o.trail.length < 3 * R) return;
        for (const c of o.trail) {
          const tx = cellX(c),
            ty = cellY(c),
            d = Math.hypot(tx - m.x, ty - m.y);
          if (d > L.hunt || (target && d >= target.d)) continue;
          // Its owner's own way home, roughly: as the crow flies to the nearest of its land is not known here, so
          // the length of trail still to run back is taken as a guess.
          if (d < (o.trail.length / R) * 0.5 + 2) target = { x: tx, y: ty, d, j };
        }
      });
      if (target) {
        const t = target as { x: number; y: number; d: number; j: number };
        plan.mode = "hunt";
        plan.points = [{ x: t.x, y: t.y }];
        plan.victim = t.j;
      } else if (plan.mode === "hunt") plan.mode = "home";
    }
  }
  if (plan.mode === "home") {
    // Home, the trail taken: a new loop from the next slice.
    if (home && !m.trail.length) {
      m.plan = null;
      return null;
    }
    if (!plan.field || world.tick - plan.fieldAt > 5) {
      plan.field = homeField(world, k);
      plan.fieldAt = world.tick;
    }
    // Downhill on the field: the neighbouring unit nearest home.
    const here = unitOf(m),
      x = here % N,
      y = Math.floor(here / N);
    let best = { c: here, d: plan.field[here] };
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const c = ny * N + nx,
        d = plan.field[c] + (dx && dy ? 0.4 : 0);
      if (d < best.d) best = { c, d };
    }
    // Home is a unit or two away: straight for the nearest of my cells there (a unit may hold only a corner of my land).
    if (plan.field[here] <= 1) {
      let near: { x: number; y: number; d: number } | null = null;
      for (let gy = Math.max(0, (y - 1) * R); gy < Math.min(G, (y + 2) * R); gy++)
        for (let gx = Math.max(0, (x - 1) * R); gx < Math.min(G, (x + 2) * R); gx++) {
          if (world.owner[gy * G + gx] !== k + 1) continue;
          const px = (gx + 0.5) / R,
            py = (gy + 0.5) / R,
            d = Math.hypot(px - m.x, py - m.y);
          if (!near || d < near.d) near = { x: px, y: py, d };
        }
      if (near) return safeHeading(world, k, towards(m, near));
    }
    if (best.c === here) return safeHeading(world, k, m.heading);
    return safeHeading(world, k, towards(m, { x: (best.c % N) + 0.5, y: Math.floor(best.c / N) + 0.5 }));
  }
  // A loop's corners (or a trail to cut), one after another; then home.
  while (plan.points.length && Math.hypot(plan.points[0].x - m.x, plan.points[0].y - m.y) < 0.9) plan.points.shift();
  if (!plan.points.length) {
    plan.mode = "home";
    if (home && !m.trail.length) m.plan = null;
    return null;
  }
  let want = towards(m, plan.points[0]);
  if (L.wobble) want += (random(world) - 0.5) * L.wobble;
  return safeHeading(world, k, want);
}
