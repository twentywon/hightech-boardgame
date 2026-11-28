/**
 * The coin pusher's machine, free of Three.js and the DOM, stepped in fixed slices of `DT` seconds so that the same
 * seed and the same drops always come to the same coins.
 *
 * Coins are discs of radius `R` and thickness `H` on two shelves: the lower playfield (its floor at y 0, its front
 * edge at `FIELD.front`, side walls up to `FIELD.gap` and open gutters beyond) and the top of the pusher (`PUSHER.top`
 * high), a shelf that slides back and forth under a fixed back wall (`FIELD.wall`), its front face pushing whatever
 * lies before it on the lower field. Coins on the pusher are held by friction as it slides back, the back wall
 * scrapes them forward, and they fall off its front edge onto the field.
 *
 * Each slice is a position-based step: gravity and speed move every coin, coins in the same layer are pushed apart
 * (`pairs`), walls and the pusher's face hold them in, and each coin then comes to rest on what lies under it
 * (`settle`): the floor, the pusher's top or the coins below, which may tilt it (a coin resting on another's edge and
 * on the floor lies tipped, as coins do in a real machine), tip it over an edge or let it slide off a steep heap.
 * Speeds follow from where the coins went, and friction with what carries them slows them. A coin that falls past the
 * front edge is won (`won`), one that falls into a side gutter is lost.
 *
 * A prize token among the coins (`kind` 1) that falls in starts the lamp roulette on the back wall
 * (`roulette`); where it stops, coins rain onto the field (`PRIZES[].shower`) or come into hand (`hand`).
 */
export const DT = 1 / 120;
/** A coin's radius and thickness. */
export const R = 0.115,
  H = 0.0265;
/** Gravity, at the machine's scale (gentler than true, so that a falling coin is seen falling). */
export const G = 25;
/**
 * The lower playfield: half its width between the side walls, its front edge (where coins fall into the win chute),
 * where the side walls end and the gutters open, and the back wall over the pusher's top.
 */
export const FIELD = { w: 1.6, front: 1.25, gap: 0.65, wall: -1.75 };
/** The pusher: the height of its top, its face's place drawn back and pushed forward, and the seconds a stroke takes. */
export const PUSHER = { top: 0.16, back: -1.0, reach: -0.35, period: 3.6 };
/** The coin chute at the top of the back wall: its mouth (height and depth), and how fast a coin leaves it. */
export const CHUTE = { y: 0.72, z: -1.5, speed: 3.5 };
/** How many places across the chute can be set to (`DROP + place`). */
export const AIMS = 25;
/** The most coins the machine holds at once. */
export const MAX = 900;
/** Friction with the floor, the pusher's top and another coin, and the slope a coin rests on before it slides. */
const MU = { floor: 0.42, pusher: 0.55, coin: 0.36 },
  MU_REST = 0.55;
/** Position passes a slice; the share of a coin's thickness by which two coins must differ in height to lie one on the other. */
const PASSES = 3,
  LAYER = 0.5 * H;
/** A token among the coins dropped. */
export const TOKEN_CHANCE = 0.13;
/** The roulette's eight lamps, round the ring from the top: coins that rain on the field, or coins into hand; and how often each comes up. */
export const PRIZES: { shower: number; hand: number; weight: number; jackpot?: boolean }[] = [
  { shower: 5, hand: 0, weight: 22 },
  { shower: 10, hand: 0, weight: 14 },
  { shower: 0, hand: 5, weight: 18 },
  { shower: 5, hand: 0, weight: 22 },
  { shower: 15, hand: 0, weight: 8 },
  { shower: 0, hand: 10, weight: 10 },
  { shower: 10, hand: 0, weight: 10 },
  { shower: 30, hand: 0, weight: 2, jackpot: true },
];
/** The roulette: how long the lamps run, and how long the one they stop on blinks before the prize comes. */
export const SPIN = 3.0,
  SHOW = 0.9;
/** Seconds between coins of a shower. */
const RAIN = 0.07;
/** The board counts as settled once nothing has fallen for this long (a stroke and a half), or this long after the last coin. */
export const SETTLE = 1.5 * PUSHER.period,
  SETTLE_CAP = 30;
/** Where a coin dropped at `place` (0 to `AIMS - 1`) leaves the chute, across the machine. */
export const aimX = (place: number) => {
  const span = FIELD.w - R - 0.05;
  return -span + (2 * span * Math.max(0, Math.min(AIMS - 1, place))) / (AIMS - 1);
};
/** The chute place nearest a point across the machine. */
export const placeAt = (x: number) => {
  const span = FIELD.w - R - 0.05;
  return Math.max(0, Math.min(AIMS - 1, Math.round(((x + span) / (2 * span)) * (AIMS - 1))));
};
/** Where the pusher's face is at time `t`, and how fast it goes (it starts drawn back). */
export function faceAt(t: number) {
  const mid = (PUSHER.back + PUSHER.reach) / 2,
    half = (PUSHER.reach - PUSHER.back) / 2,
    w = (2 * Math.PI) / PUSHER.period;
  return { z: mid - half * Math.cos(w * t), v: half * w * Math.sin(w * t) };
}
/** What a slice brought about, for the view to report, show and sound. */
export type Happening =
  | { kind: "won" | "lost"; sort: number; x: number; z: number }
  | { kind: "landed"; strength: number; x: number; z: number }
  | { kind: "token" }
  | { kind: "tick"; lamp: number }
  | { kind: "stop"; lamp: number }
  | { kind: "bonus"; prize: number }
  | { kind: "settled" };
export interface World {
  random: () => number;
  /** Seconds the machine has run. */
  t: number;
  face: number;
  faceV: number;
  /** Coins on the board. */
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  /** Where each was at the start of the slice. */
  ox: Float64Array;
  oy: Float64Array;
  oz: Float64Array;
  /** The slope each lies at (how its face rises along x and z), and its turn about the upright, for the picture. */
  gx: Float64Array;
  gz: Float64Array;
  yaw: Float64Array;
  /** 0 a coin, 1 a prize token. */
  kind: Uint8Array;
  /** What carries each: 0 nothing (in the air), 1 the floor, 2 the pusher, 3 a coin. */
  rest: Uint8Array;
  /** Coins in hand (meaningless when `endless`), won, lost, dropped by the player and rained by the roulette. */
  hand: number;
  endless: boolean;
  won: number;
  lost: number;
  dropped: number;
  showered: number;
  /** Coins still to rain, and when the next comes. */
  rain: number;
  rainAt: number;
  roulette: { queued: number; phase: "idle" | "spin" | "show"; since: number; from: number; lamp: number; prize: number; steps: number };
  /** When something last fell or was dropped, and when the player's last coin was dropped. */
  stirred: number;
  lastDrop: number;
  settled: boolean;
  /** Work space, kept rather than made every slice. */
  order: Int32Array;
  head: Int32Array;
  next: Int32Array;
  pairs: Int32Array;
  pairCount: number;
  same: Uint8Array;
  start: Int32Array;
  links: Int32Array;
  /** How far the pusher's face shoved each coin this slice. */
  shove: Float64Array;
}
/** The grid that finds neighbours: cells of a coin's width over the machine. */
const CELL = 2 * R,
  GX0 = -FIELD.w - 0.4,
  GZ0 = FIELD.wall - 0.2,
  COLS = Math.ceil((2 * FIELD.w + 0.8) / CELL),
  ROWS = Math.ceil((FIELD.front + 0.6 - GZ0) / CELL);
export function createWorld(coins: number | "endless", random: () => number): World {
  const f = () => new Float64Array(MAX),
    world: World = {
      random,
      t: 0,
      face: PUSHER.back,
      faceV: 0,
      n: 0,
      x: f(),
      y: f(),
      z: f(),
      vx: f(),
      vy: f(),
      vz: f(),
      ox: f(),
      oy: f(),
      oz: f(),
      gx: f(),
      gz: f(),
      yaw: f(),
      kind: new Uint8Array(MAX),
      rest: new Uint8Array(MAX),
      hand: coins === "endless" ? 0 : coins,
      endless: coins === "endless",
      won: 0,
      lost: 0,
      dropped: 0,
      showered: 0,
      rain: 0,
      rainAt: 0,
      roulette: { queued: 0, phase: "idle", since: 0, from: 0, lamp: 0, prize: 0, steps: 0 },
      stirred: 0,
      lastDrop: 0,
      settled: false,
      order: new Int32Array(MAX),
      head: new Int32Array(COLS * ROWS),
      next: new Int32Array(MAX),
      pairs: new Int32Array(MAX * 16),
      pairCount: 0,
      same: new Uint8Array(MAX * 8),
      start: new Int32Array(MAX + 1),
      links: new Int32Array(MAX * 16),
      shove: f(),
    };
  lay(world);
  return world;
}
/** Puts a coin on the board (false when the machine is full). */
function add(world: World, x: number, y: number, z: number, kind = 0, vx = 0, vy = 0, vz = 0) {
  if (world.n >= MAX) return false;
  const i = world.n++;
  world.x[i] = world.ox[i] = x;
  world.y[i] = world.oy[i] = y;
  world.z[i] = world.oz[i] = z;
  world.vx[i] = vx;
  world.vy[i] = vy;
  world.vz[i] = vz;
  world.gx[i] = world.gz[i] = 0;
  world.yaw[i] = world.random() * Math.PI * 2;
  world.kind[i] = kind;
  world.rest[i] = 0;
  world.order[i] = i;
  return true;
}
/** Puts a coin at rest (or in the air) on the board by hand, for tests: `kind` 1 is a prize token. */
export const place = (world: World, x: number, y: number, z: number, kind = 0) => add(world, x, y, z, kind);
/** Takes coin `i` off the board (the last coin takes its place). */
function remove(world: World, i: number) {
  const last = --world.n;
  if (i === last) return;
  for (const a of [world.x, world.y, world.z, world.vx, world.vy, world.vz, world.ox, world.oy, world.oz, world.gx, world.gz, world.yaw]) a[i] = a[last];
  world.kind[i] = world.kind[last];
  world.rest[i] = world.rest[last];
}
/**
 * The board a machine starts with: a close carpet of coins over the lower field in front of the pusher's reach, a
 * second and a third layer heaped toward the front edge, a few in the pusher's way, and a layer and a half on the
 * pusher's top; four prize tokens among them. A stroke of the pusher lets them settle, and what falls meanwhile is
 * not counted.
 */
function lay(world: World) {
  const random = world.random,
    gap = 2 * R * 1.035,
    row = gap * 0.866,
    left = -FIELD.w + R + 0.01;
  // The carpet, in rows of a close hexagonal pattern, each coin nudged a little.
  for (let k = 0, z = PUSHER.reach + R + 0.03; z < FIELD.front - R * 0.35; z += row, k++)
    for (let x = left + (k % 2 ? gap / 2 : 0); x < FIELD.w - R - 0.01; x += gap) add(world, x + (random() - 0.5) * 0.02, 0, z + (random() - 0.5) * 0.015);
  const carpet = world.n;
  // Further layers, thicker toward the front: each coin laid over a coin of the layer under it, off its middle.
  const heap = (count: number, from: number, layer: number) => {
    for (let k = 0, tries = 0; k < count && tries < count * 8; tries++) {
      const under = Math.floor(random() * world.n);
      if (world.z[under] < from || Math.abs(world.y[under] - (layer - 1) * H) > 0.007) continue;
      const a = random() * Math.PI * 2,
        r = random() * R * 0.75;
      add(world, world.x[under] + Math.cos(a) * r, layer * H + 0.003, world.z[under] + Math.sin(a) * r);
      k++;
    }
  };
  heap(85, -0.1, 1);
  heap(34, 0.45, 2);
  heap(10, 0.75, 3);
  // A few in the pusher's way, and on its top a close layer with a few more over it.
  for (let k = 0; k < 24; k++) add(world, left + random() * (2 * FIELD.w - 2 * R - 0.02), 0, PUSHER.back + R + 0.05 + random() * (PUSHER.reach - PUSHER.back - 0.1));
  const top = world.n;
  for (let k = 0, z = FIELD.wall + R + 0.02; z < PUSHER.back - R * 0.5; z += row, k++)
    for (let x = left + (k % 2 ? gap / 2 : 0); x < FIELD.w - R - 0.01; x += gap)
      if (random() < 0.85) add(world, x + (random() - 0.5) * 0.02, PUSHER.top + 0.002, z + (random() - 0.5) * 0.015);
  for (let k = 0; k < 10; k++) {
    const under = top + Math.floor(random() * (world.n - top));
    add(world, world.x[under] + (random() - 0.5) * R, PUSHER.top + H + 0.004, world.z[under] + (random() - 0.5) * R);
  }
  // Four tokens in the carpet's front half.
  for (let k = 0; k < 4; k++) {
    const i = Math.floor(random() * carpet);
    if (world.z[i] > 0.2) world.kind[i] = 1;
  }
  // A stroke of the pusher, ending drawn back as a game begins.
  world.t = -PUSHER.period;
  for (let k = 0; k < PUSHER.period / DT; k++) step(world, true);
  world.won = world.lost = 0;
  world.t = 0;
  world.stirred = world.lastDrop = 0;
  const at = faceAt(0);
  world.face = at.z;
  world.faceV = at.v;
}
/**
 * Drops a coin from the chute at `place`; false when none is left in hand. One coin in `TOKEN_CHANCE` is a prize
 * token. It leaves the chute a little faster or slower each time, so that it lands on the pusher's top or before it.
 */
export function drop(world: World, place: number) {
  if (!world.endless && world.hand <= 0) return false;
  if (!world.endless) world.hand--;
  world.dropped++;
  const kind = world.random() < TOKEN_CHANCE ? 1 : 0,
    x = aimX(place) + (world.random() - 0.5) * 0.03;
  add(world, x, CHUTE.y, CHUTE.z, kind, (world.random() - 0.5) * 0.08, -0.2, CHUTE.speed * (0.9 + world.random() * 0.2));
  world.stirred = world.lastDrop = world.t;
  world.settled = false;
  return true;
}
/** A coin raining down from above the pusher, part of a shower. */
function rainOne(world: World) {
  const r = world.random;
  add(world, -FIELD.w + R + 0.05 + r() * (2 * FIELD.w - 2 * R - 0.1), 0.95 + r() * 0.2, -1.25 + r() * 1.1, 0, (r() - 0.5) * 0.3, 0, 0.2 + r() * 0.5);
  world.showered++;
  world.stirred = world.t;
}
/** The lamp of the roulette a prize is drawn for, by the lamps' weights. */
function drawPrize(random: () => number) {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let roll = random() * total;
  for (let k = 0; k < PRIZES.length; k++) if ((roll -= PRIZES[k].weight) < 0) return k;
  return 0;
}
/** The roulette, a slice on: started by a token that fell in, the lamps run and slow, stop, blink, and the prize comes. */
function spin(world: World, out: Happening[]) {
  const wheel = world.roulette,
    lamps = PRIZES.length;
  if (wheel.phase === "idle" && wheel.queued > 0) {
    wheel.queued--;
    wheel.phase = "spin";
    wheel.since = world.t;
    wheel.from = wheel.lamp;
    wheel.prize = drawPrize(world.random);
    wheel.steps = lamps * 3 + ((wheel.prize - wheel.from + lamps) % lamps);
  }
  if (wheel.phase === "spin") {
    const p = Math.min(1, (world.t - wheel.since) / SPIN),
      eased = 1 - (1 - p) ** 3,
      lamp = (wheel.from + Math.floor(eased * wheel.steps + 1e-9)) % lamps;
    if (lamp !== wheel.lamp) {
      wheel.lamp = lamp;
      out.push({ kind: "tick", lamp });
    }
    if (p >= 1) {
      wheel.lamp = wheel.prize;
      wheel.phase = "show";
      wheel.since = world.t;
      out.push({ kind: "stop", lamp: wheel.prize });
    }
  } else if (wheel.phase === "show" && world.t - wheel.since >= SHOW) {
    const prize = PRIZES[wheel.prize];
    world.rain += prize.shower;
    if (!world.endless) world.hand += prize.hand;
    wheel.phase = "idle";
    world.stirred = world.t;
    out.push({ kind: "bonus", prize: wheel.prize });
  }
}
/** Collects the pairs of coins close enough to touch, and which of them lie in the same layer (by where they were). */
function neighbours(world: World) {
  const { head, next, pairs, same, x, z, oy, n } = world;
  head.fill(-1);
  for (let i = 0; i < n; i++) {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor((x[i] - GX0) / CELL))),
      r = Math.max(0, Math.min(ROWS - 1, Math.floor((z[i] - GZ0) / CELL))),
      cell = r * COLS + c;
    next[i] = head[cell];
    head[cell] = i;
  }
  let count = 0;
  const reach = (2 * R + 0.02) ** 2,
    limit = pairs.length / 2;
  // Rows from the back, so that a push from the pusher's face is passed forward within one pass.
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (let i = head[r * COLS + c]; i >= 0; i = next[i])
        for (let dr = 0; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc < 0) continue;
            const rr = r + dr,
              cc = c + dc;
            if (rr >= ROWS || cc < 0 || cc >= COLS) continue;
            for (let j = head[rr * COLS + cc]; j >= 0; j = next[j]) {
              if (dr === 0 && dc === 0 && j >= i) continue;
              const ddx = x[j] - x[i],
                ddz = z[j] - z[i];
              if (ddx * ddx + ddz * ddz > reach || count >= limit) continue;
              pairs[2 * count] = i;
              pairs[2 * count + 1] = j;
              same[count] = Math.abs(oy[i] - oy[j]) < LAYER ? 1 : 0;
              count++;
            }
          }
  world.pairCount = count;
  // Each coin's neighbours, for finding what it rests on.
  const { start, links } = world;
  start.fill(0, 0, n + 1);
  for (let k = 0; k < count; k++) {
    start[pairs[2 * k] + 1]++;
    start[pairs[2 * k + 1] + 1]++;
  }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const fill = world.next;
  for (let i = 0; i < n; i++) fill[i] = start[i];
  for (let k = 0; k < count; k++) {
    const a = pairs[2 * k],
      b = pairs[2 * k + 1];
    links[fill[a]++] = b;
    links[fill[b]++] = a;
  }
}
/** Coins in one layer pushed apart, then held in by the walls and the pusher's face. */
function separate(world: World) {
  const { pairs, same, x, z, y, n, face } = world,
    touch = 2 * R;
  for (let k = 0; k < world.pairCount; k++) {
    if (!same[k]) continue;
    const i = pairs[2 * k],
      j = pairs[2 * k + 1],
      dx = x[j] - x[i],
      dz = z[j] - z[i],
      d2 = dx * dx + dz * dz;
    if (d2 >= touch * touch) continue;
    let d = Math.sqrt(d2),
      nx = dx,
      nz = dz;
    if (d < 1e-9) {
      // Exactly on each other: apart along a fixed way, so that it comes out the same each time.
      nx = 1;
      nz = 0;
      d = 1;
    }
    const push = (touch - Math.sqrt(d2)) / 2 / d;
    x[i] -= nx * push;
    z[i] -= nz * push;
    x[j] += nx * push;
    z[j] += nz * push;
  }
  const wallX = FIELD.w - R;
  for (let i = 0; i < n; i++) {
    const low = y[i] < PUSHER.top - 0.3 * H,
      inside = Math.abs(x[i]) < FIELD.w + R * 0.5;
    if (low && inside && z[i] < face + R && z[i] > FIELD.wall - 0.5) {
      world.shove[i] += face + R - z[i];
      z[i] = face + R;
    }
    if (!low && z[i] < FIELD.wall + R) z[i] = FIELD.wall + R;
    if ((z[i] < FIELD.gap || !low) && inside && Math.abs(x[i]) > wallX && y[i] > -0.05) x[i] = Math.sign(x[i]) * wallX;
  }
}
/** Support points of one coin: height, offset from its middle, speed of what is under, friction, and what it is. */
const SUP = { h: new Float64Array(24), ox: new Float64Array(24), oz: new Float64Array(24), vx: new Float64Array(24), vz: new Float64Array(24), mu: new Float64Array(24), what: new Uint8Array(24) };
/** A flat shelf under coin `i` (the floor or the pusher's top), as a support point: under its middle, or its nearest edge within reach. */
function shelf(count: number, cx: number, cz: number, height: number, x0: number, x1: number, z0: number, z1: number, v: number, mu: number, what: number) {
  const px = Math.max(x0, Math.min(x1, cx)),
    pz = Math.max(z0, Math.min(z1, cz)),
    ox = px - cx,
    oz = pz - cz;
  if (ox * ox + oz * oz >= R * R * 0.98) return count;
  SUP.h[count] = height;
  SUP.ox[count] = ox;
  SUP.oz[count] = oz;
  SUP.vx[count] = 0;
  SUP.vz[count] = v;
  SUP.mu[count] = mu;
  SUP.what[count] = what;
  return count + 1;
}
/**
 * Brings coin `i` to rest on what lies under it, or lets it fall. The highest point under it is where it pivots; if
 * that is under its middle it lies flat there, else it tips away until it touches the next support on the far side
 * of its middle (the floor's edge, a lower coin), and lies at that slope. With nothing on the far side it tips over
 * and slides off. Returns the support's speed and friction in `carry`.
 */
function settle(world: World, i: number, carry: { vx: number; vz: number; mu: number; slide: number; ux: number; uz: number }) {
  const { x, y, z, oy, start, links } = world,
    cx = x[i],
    cz = z[i];
  let count = shelf(0, cx, cz, 0, -FIELD.w, FIELD.w, -Infinity, FIELD.front, 0, MU.floor, 1);
  if (oy[i] > PUSHER.top - 0.5 * H) count = shelf(count, cx, cz, PUSHER.top, -FIELD.w, FIELD.w, FIELD.wall, world.face, world.faceV, MU.pusher, 2);
  for (let k = start[i]; k < start[i + 1] && count < 24; k++) {
    const j = links[k];
    if (oy[i] - oy[j] < LAYER) continue;
    const dx = x[j] - cx,
      dz = z[j] - cz,
      d = Math.hypot(dx, dz);
    if (d >= 2 * R * 0.995) continue;
    const reachIn = d <= R ? 0 : (d - R) / d;
    SUP.h[count] = y[j] + H;
    SUP.ox[count] = dx * reachIn;
    SUP.oz[count] = dz * reachIn;
    SUP.vx[count] = world.vx[j];
    SUP.vz[count] = world.vz[j];
    SUP.mu[count] = MU.coin;
    SUP.what[count] = 3;
    count++;
  }
  carry.slide = 0;
  if (!count) return -Infinity;
  let a = 0;
  for (let k = 1; k < count; k++) {
    const better = SUP.h[k] - SUP.h[a];
    if (better > 1e-6 || (better > -1e-6 && SUP.ox[k] ** 2 + SUP.oz[k] ** 2 < SUP.ox[a] ** 2 + SUP.oz[a] ** 2)) a = k;
  }
  carry.vx = SUP.vx[a];
  carry.vz = SUP.vz[a];
  carry.mu = SUP.mu[a];
  world.rest[i] = SUP.what[a];
  for (let round = 0; round < 3; round++) {
    const da = Math.hypot(SUP.ox[a], SUP.oz[a]);
    if (da <= 0.12 * R) {
      world.gx[i] *= 0.7;
      world.gz[i] *= 0.7;
      return SUP.h[a];
    }
    const ux = SUP.ox[a] / da,
      uz = SUP.oz[a] / da;
    let b = -1,
      slope = Infinity,
      rb = 0;
    for (let k = 0; k < count; k++) {
      if (k === a) continue;
      const r = SUP.ox[k] * ux + SUP.oz[k] * uz;
      if (r >= da - 1e-6) continue;
      const s = (SUP.h[a] - SUP.h[k]) / (da - r);
      if (s < slope) {
        slope = s;
        b = k;
        rb = r;
      }
    }
    // Nothing beyond its middle on the other side: it tips over the edge it rests on.
    if (b < 0) break;
    if (rb <= 0.05 * R) {
      // Lies tipped between the two; on a slope too steep it slides down it.
      const tilt = Math.min(slope, 1.2);
      world.gx[i] += (ux * tilt - world.gx[i]) * 0.35;
      world.gz[i] += (uz * tilt - world.gz[i]) * 0.35;
      if (slope > MU_REST) {
        carry.slide = Math.min(1.5, slope - MU_REST);
        carry.ux = -ux;
        carry.uz = -uz;
      }
      return SUP.h[a] - slope * da;
    }
    a = b;
  }
  // Tipping off: it falls, turning over the edge and sliding away from it.
  const da = Math.hypot(SUP.ox[a], SUP.oz[a]) || 1,
    ux = SUP.ox[a] / da,
    uz = SUP.oz[a] / da;
  world.gx[i] += (ux * 1.1 - world.gx[i]) * 0.12;
  world.gz[i] += (uz * 1.1 - world.gz[i]) * 0.12;
  // Pushed off only while it still bears on that edge; once clear it simply falls.
  carry.slide = world.y[i] <= SUP.h[a] + 0.2 * H ? 1 : 0;
  carry.ux = -ux;
  carry.uz = -uz;
  world.rest[i] = 0;
  return -Infinity;
}
const carry = { vx: 0, vz: 0, mu: 0, slide: 0, ux: 0, uz: 0 };
/** One slice of the machine; `quiet` (while the board is laid) counts and reports nothing. */
export function step(world: World, quiet = false): Happening[] {
  const out: Happening[] = [];
  world.t += DT;
  const at = faceAt(world.t);
  world.face = at.z;
  world.faceV = at.v;
  if (!quiet) {
    spin(world, out);
    if (world.rain > 0 && world.t >= world.rainAt) {
      world.rain--;
      world.rainAt = world.t + RAIN;
      rainOne(world);
    }
  }
  const { x, y, z, vx, vy, vz, ox, oy, oz } = world;
  let n = world.n;
  for (let i = 0; i < n; i++) {
    ox[i] = x[i];
    oy[i] = y[i];
    oz[i] = z[i];
    vy[i] -= G * DT;
    x[i] += vx[i] * DT;
    y[i] += vy[i] * DT;
    z[i] += vz[i] * DT;
  }
  world.shove.fill(0, 0, n);
  neighbours(world);
  for (let pass = 0; pass < PASSES; pass++) separate(world);
  // From the lowest up, so that a coin comes to rest on coins that already have.
  const order = world.order;
  sortBy(order, n, oy);
  let loudest = 0,
    lx = 0,
    lz = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k],
      falling = vy[i],
      floor = settle(world, i, carry);
    let grounded = false;
    if (y[i] <= floor + 1e-4) {
      y[i] = floor;
      grounded = true;
      if (falling < -1.2 && -falling > loudest) {
        loudest = -falling;
        lx = x[i];
        lz = z[i];
      }
    } else world.rest[i] = 0;
    // Speeds from where it went.
    // The face's shove (a coin that drops in front of it, a coin it reaches) moves the coin but gives it no more
    // speed than the face's own.
    let ux = (x[i] - ox[i]) / DT,
      uz = (z[i] - oz[i] - world.shove[i]) / DT;
    if (world.shove[i] > 0) uz = Math.max(uz, world.faceV);
    if (carry.slide > 0) {
      ux += carry.ux * G * carry.slide * DT * (grounded ? 0.5 : 1);
      uz += carry.uz * G * carry.slide * DT * (grounded ? 0.5 : 1);
    }
    if (grounded) {
      vy[i] = 0;
      // A coin that comes down flat loses most of its sliding speed in the knock.
      if (falling < -1) {
        ux = carry.vx + (ux - carry.vx) * 0.45;
        uz = carry.vz + (uz - carry.vz) * 0.45;
      }
      // Friction with what carries it: it is brought to that thing's speed.
      const rx = ux - carry.vx,
        rz = uz - carry.vz,
        rel = Math.hypot(rx, rz),
        brake = carry.mu * G * DT;
      if (rel <= brake) {
        ux = carry.vx;
        uz = carry.vz;
      } else {
        ux -= (rx / rel) * brake;
        uz -= (rz / rel) * brake;
      }
    } else {
      vy[i] = Math.max(-9, (y[i] - oy[i]) / DT);
      world.gx[i] *= 0.995;
      world.gz[i] *= 0.995;
    }
    const speed = Math.hypot(ux, uz);
    if (speed > 6) {
      ux *= 6 / speed;
      uz *= 6 / speed;
    }
    vx[i] = ux;
    vz[i] = uz;
  }
  if (loudest > 0 && !quiet) out.push({ kind: "landed", strength: Math.min(1, loudest / 5), x: lx, z: lz });
  // Coins fallen off: down the front into the win chute, or into a gutter.
  for (let i = n - 1; i >= 0; i--) {
    if (y[i] > -0.3 && Math.abs(x[i]) < 3 && z[i] < 3) continue;
    const won = z[i] > FIELD.front - 0.15 && Math.abs(x[i]) <= FIELD.w + 0.02;
    if (!quiet) {
      if (won) world.won++;
      else world.lost++;
      out.push({ kind: won ? "won" : "lost", sort: world.kind[i], x: x[i], z: z[i] });
      if (won && world.kind[i] === 1) {
        world.roulette.queued++;
        out.push({ kind: "token" });
      }
      world.stirred = world.t;
    }
    remove(world, i);
    n--;
  }
  if (!quiet && !world.endless && !world.settled && world.hand <= 0 && world.rain <= 0 && world.roulette.phase === "idle" && world.roulette.queued === 0) {
    let airborne = false;
    for (let i = 0; i < world.n && !airborne; i++) airborne = world.rest[i] === 0;
    const still = world.t - world.stirred >= SETTLE && !airborne;
    if (still || world.t - world.lastDrop >= SETTLE_CAP) {
      world.settled = true;
      out.push({ kind: "settled" });
    }
  }
  return out;
}
/** Sorts the coins by `key` (their height), lowest first: a counting sort over slices of a quarter of a coin's thickness. */
const BUCKETS = 400,
  BOTTOM = -0.4,
  SLICE = H / 4,
  counts = new Int32Array(BUCKETS + 1),
  sorted = new Int32Array(MAX);
function sortBy(order: Int32Array, n: number, key: Float64Array) {
  counts.fill(0);
  const bucket = (i: number) => Math.max(0, Math.min(BUCKETS - 1, Math.floor((key[i] - BOTTOM) / SLICE)));
  for (let i = 0; i < n; i++) counts[bucket(i) + 1]++;
  for (let b = 0; b < BUCKETS; b++) counts[b + 1] += counts[b];
  for (let i = 0; i < n; i++) sorted[counts[bucket(i)]++] = i;
  order.set(sorted.subarray(0, n));
}
/** Coins on the board. */
export const onBoard = (world: World) => world.n;
/** Coins the machine has been given (laid at the start, dropped and rained) less those that have left it: the board's count by its books. */
export const booked = (world: World, laid: number) => laid + world.dropped + world.showered - world.won - world.lost;
