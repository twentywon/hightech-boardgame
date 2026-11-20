/**
 * 네모 러너's room, stepped in fixed slices by the view (free of Three.js and DOM).
 *
 * The room is a square of `N` × `N` cells inside a frame. The runner runs by himself along its inner sides, always
 * the same way round (counter-clockwise on the screen: right along the floor, up the right wall, left along the
 * ceiling, down the left wall), with gravity toward the side he runs on. His place is given on that side: `u` the way
 * along it (0 to N, growing the way he runs when `dir` is 1) and `h` his feet's height above it.
 *
 * - A jump leaps away from the side. When the frame's next side is within `REACH` of his front, the jump turns him a
 *   quarter onto it instead, and he runs on up that wall; a jump that is still in the air when it meets the wall turns
 *   him too. Running into the wall on his feet costs a heart, and he is then set on the wall all the same.
 * - Stacks of squares stand on the sides. He steps up one or two by himself; three or more must be jumped, or he runs
 *   into them, loses a heart and is thrown over. Slopes are terrain he follows.
 * - Squares fly in. A strike (punch, or kick in the air) knocks away any square in the box before him; a square that
 *   touches him costs a heart and a moment of blinking safety.
 * - Holes in the frame are portals in pairs: falling into one brings him out of the other, still going his way round.
 * - In a boss stage a big figure of squares throws squares at him; a square he strikes flies at the boss and hurts it.
 *
 * The step reports what happened as events; the view turns those into moves for the rules (hearts, clock, boss).
 */
export const N = 14,
  DT = 1 / 120,
  /** Half the runner's width along the side, and his height. */
  HALF = 0.3,
  TALL = 1.2,
  GRAVITY = 36,
  /** The jump's speed: a peak of JUMP² / 2G = 4.5 cells, about a second in the air. */
  JUMP = 18,
  /** A wall this near his front turns him onto it at a jump. */
  REACH = 3,
  /** Steps this high he climbs by himself. */
  STEP = 2,
  TOL = 0.3,
  HEARTS = 3,
  /** Seconds of blinking safety after a hurt, and at the start. */
  SAFE = 1.6,
  STRIKE_TIME = 0.16,
  STRIKE_COOL = 0.26,
  /** The strike's box, in the runner's own frame: behind and ahead of his middle, and up from his feet. */
  STRIKE_BACK = 0.5,
  STRIKE_AHEAD = 2.1,
  STRIKE_UP = 2.4,
  /** A flying square's side, and how long one takes to appear (harmless and out of reach meanwhile). */
  SQUARE = 0.8,
  APPEAR = 0.7,
  TUMBLE = 0.32,
  /** How fast a struck square flies, and how much quicker a speed band makes him. */
  KNOCKED = 15,
  BAND = 1.5,
  /** The boss's half size, and the box its middle keeps to. */
  BOSS_HALF = 1.7,
  BOSS_BOX: [number, number] = [5.4, 8.6],
  /** How long before a change of direction it is warned of. */
  WARN = 1.6,
  /** Where along the floor he starts; how long after walking off an edge a jump is still a jump, and how long a jump pressed in the air waits for the ground. */
  START = 3.4,
  COYOTE = 0.14,
  BUFFER = 0.16,
  /** A drop this low he steps down instead of falling. */
  DROP = 1.05;
export type Side = 0 | 1 | 2 | 3;
/** The way along each side for `dir` 1, and away from it, on the screen (x right, y down). */
export const FORWARD: [number, number][] = [
  [1, 0],
  [0, -1],
  [-1, 0],
  [0, 1],
];
export const UP: [number, number][] = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];
/** A point given on a side (way along, height) on the screen's room (0 to N each way). */
export function toWorld(side: number, u: number, h: number): [number, number] {
  if (side === 0) return [u, N - h];
  if (side === 1) return [N - h, N - u];
  if (side === 2) return [N - u, h];
  return [h, u];
}
/** The cell at `depth` from a side in its column `col`. */
export function cellOf(side: number, col: number, depth: number): [number, number] {
  if (side === 0) return [col, N - 1 - depth];
  if (side === 1) return [N - 1 - depth, N - 1 - col];
  if (side === 2) return [N - 1 - col, depth];
  return [depth, col];
}
export type Kind = "drift" | "homing" | "spin" | "rain" | "shot";
export interface Ramp {
  side: number;
  col: number;
  /** Heights at the column's two ends, the low u end first. */
  from: number;
  to: number;
}
export interface Hole {
  side: number;
  col: number;
}
export interface Piston {
  side: number;
  col: number;
  /** Seconds a rise and fall take, where in it it starts, and how high it rises. */
  period: number;
  phase: number;
  top: number;
}
export interface Band {
  side: number;
  from: number;
  to: number;
}
export interface StageSpec {
  name: string;
  note: string;
  /** Seconds to survive; 0 for a boss stage, won by beating the boss. */
  time: number;
  speed: number;
  /** Squares: one comes every `every` seconds (or so) while fewer than `max` are about, of these kinds by weight. */
  every: number;
  max: number;
  kinds: Partial<Record<Exclude<Kind, "shot">, number>>;
  squareSpeed: number;
  /** Cells of stacks: per side, column → height (laid the same on each side listed). */
  stacks?: [number, number, number][];
  /** Whole cells laid anywhere (a ring in the middle). */
  cells?: [number, number][];
  /** Stairs filling each corner, `stairs` high. */
  stairs?: number;
  ramps?: Ramp[];
  holes?: [Hole, Hole][];
  pistons?: Piston[];
  bands?: Band[];
  /** The way round turns about every so many seconds. */
  flip?: number;
  /** A dark room: only round the runner is seen. */
  dark?: boolean;
  boss?: { hp: number; every: number; speed: number; name: string };
}
const sides4 = (col: number, height: number): [number, number, number][] => [0, 1, 2, 3].map((side) => [side, col, height]);
/** Zig-zag slopes on a side: up two, down two, from `col`. */
const hill = (side: number, col: number): Ramp[] => [
  { side, col, from: 0, to: 1 },
  { side, col: col + 1, from: 1, to: 2 },
  { side, col: col + 2, from: 2, to: 1 },
  { side, col: col + 3, from: 1, to: 0 },
];
const bump = (side: number, col: number): Ramp[] => [
  { side, col, from: 0, to: 1 },
  { side, col: col + 1, from: 1, to: 0 },
];
/** The ten stages. */
export const STAGES: StageSpec[] = [
  {
    name: "연습 방",
    note: "날아오는 네모 치기",
    time: 40,
    speed: 4.2,
    every: 3.2,
    max: 3,
    kinds: { drift: 1 },
    squareSpeed: 1.6,
  },
  {
    name: "기둥 방",
    note: "세 칸 기둥은 점프",
    time: 45,
    speed: 4.5,
    every: 3,
    max: 3,
    kinds: { drift: 1 },
    squareSpeed: 1.8,
    stacks: [
      [0, 5, 1],
      [0, 8, 3],
      [1, 5, 2],
      [1, 8, 1],
      [2, 4, 3],
      [2, 8, 2],
      [3, 4, 1],
      [3, 5, 1],
      [3, 8, 3],
    ],
  },
  {
    name: "비탈 방",
    note: "오르내리는 비탈, 따라오는 네모",
    time: 45,
    speed: 4.6,
    every: 2.8,
    max: 4,
    kinds: { drift: 2, homing: 1 },
    squareSpeed: 1.8,
    ramps: [...hill(0, 4), ...bump(0, 9), ...bump(1, 4), ...hill(1, 7), ...hill(2, 3), ...bump(2, 9), ...hill(3, 5)],
  },
  {
    name: "계단 방",
    note: "모서리 계단, 도는 네모",
    time: 50,
    speed: 4.8,
    every: 2.8,
    max: 6,
    kinds: { drift: 2, spin: 1 },
    squareSpeed: 1.8,
    stairs: 3,
    cells: [
      [5, 5],
      [6, 5],
      [7, 5],
      [8, 5],
      [5, 8],
      [6, 8],
      [7, 8],
      [8, 8],
      [5, 6],
      [5, 7],
      [8, 6],
      [8, 7],
    ],
  },
  {
    name: "구멍 방",
    note: "구멍에 빠지면 다른 벽으로",
    time: 50,
    speed: 4.8,
    every: 2.6,
    max: 4,
    kinds: { drift: 2, homing: 1 },
    squareSpeed: 1.9,
    holes: [
      [
        { side: 0, col: 6 },
        { side: 2, col: 5 },
      ],
      [
        { side: 1, col: 7 },
        { side: 3, col: 4 },
      ],
    ],
    stacks: [
      [0, 10, 1],
      [2, 9, 2],
      [1, 3, 1],
      [3, 9, 2],
    ],
  },
  {
    name: "피스톤 방",
    note: "오르내리는 기둥과 가속 띠",
    time: 50,
    speed: 4.8,
    every: 2.6,
    max: 4,
    kinds: { drift: 2, homing: 1 },
    squareSpeed: 1.9,
    pistons: [
      { side: 0, col: 6, period: 3.2, phase: 0, top: 3 },
      { side: 1, col: 7, period: 3.2, phase: 0.5, top: 3 },
      { side: 2, col: 5, period: 2.8, phase: 0.25, top: 3 },
      { side: 2, col: 9, period: 2.8, phase: 0.75, top: 2 },
      { side: 3, col: 6, period: 3.6, phase: 0.6, top: 3 },
    ],
    bands: [
      { side: 1, from: 1, to: 5 },
      { side: 3, from: 9, to: 12 },
    ],
  },
  {
    name: "네모 떼",
    note: "쏟아지는 네모",
    time: 55,
    speed: 5,
    every: 1.5,
    max: 8,
    kinds: { drift: 3, homing: 2, rain: 2, spin: 1 },
    squareSpeed: 2,
    stacks: [
      [0, 7, 1],
      [1, 6, 1],
      [2, 7, 1],
      [3, 6, 1],
    ],
  },
  {
    name: "네모 왕",
    note: "쳐낸 네모로 보스를 맞히기",
    time: 0,
    speed: 4.8,
    every: 4,
    max: 2,
    kinds: { drift: 1 },
    squareSpeed: 1.7,
    stacks: [
      [0, 5, 1],
      [2, 8, 1],
    ],
    boss: { hp: 8, every: 2.6, speed: 4.8, name: "네모 왕" },
  },
  {
    name: "뒤죽박죽",
    note: "어둠, 거꾸로 달리기, 빨라짐",
    time: 60,
    speed: 5.4,
    every: 2,
    max: 6,
    kinds: { drift: 2, homing: 2, spin: 1 },
    squareSpeed: 2,
    dark: true,
    flip: 11,
    holes: [
      [
        { side: 0, col: 9 },
        { side: 1, col: 4 },
      ],
    ],
    pistons: [
      { side: 2, col: 6, period: 3, phase: 0, top: 3 },
      { side: 3, col: 7, period: 3.4, phase: 0.4, top: 2 },
    ],
    stacks: [
      [0, 4, 2],
      [1, 9, 1],
      [2, 10, 1],
    ],
  },
  {
    name: "최후의 네모",
    note: "더 센 보스, 구멍과 도는 네모",
    time: 0,
    speed: 5.2,
    every: 3,
    max: 6,
    kinds: { drift: 1, spin: 1 },
    squareSpeed: 1.9,
    holes: [
      [
        { side: 1, col: 5 },
        { side: 3, col: 8 },
      ],
    ],
    stacks: [
      [0, 6, 2],
      [2, 7, 2],
    ],
    boss: { hp: 12, every: 2.1, speed: 5.4, name: "최후의 네모" },
  },
];
export const stageOf = (stage: number) => STAGES[Math.max(1, Math.min(STAGES.length, Math.round(stage) || 1)) - 1];
export interface Runner {
  side: number;
  u: number;
  h: number;
  vh: number;
  dir: 1 | -1;
  air: boolean;
  /** Seconds of safety left, of the strike's box, before the next strike, of the tumble onto a wall. */
  safe: number;
  strike: number;
  cool: number;
  tumble: number;
  /** The side he tumbled from (for the drawing), and the pose of the strike. */
  from: number;
  pose: "punch" | "kick";
  /** Thrown over a stack after running into it: faces are let through until he lands. */
  vault: boolean;
  /** How far he has run on his feet (the run cycle), and a step climbed still being eased (drawn only). */
  run: number;
  lift: number;
  /** Just walked off an edge (a jump is still allowed), and a jump pressed just before landing (made on landing). */
  coyote: number;
  buffer: number;
  /** Strikes and jumps that did something, for the page. */
  strikes: number;
  jumps: number;
}
export interface Square {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds before it is there in earnest. */
  appear: number;
  knocked: boolean;
  /** Its turn as drawn, and how fast it turns. */
  angle: number;
  spin: number;
  /** A spinning cluster: the middle it turns round, the middle's speed, its radius, angle and angular speed. */
  orbit: { cx: number; cy: number; vx: number; vy: number; r: number; a: number; w: number } | null;
  /** Its quarter of the orbit. */
  slot: number;
}
export interface Boss {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  max: number;
  /** Seconds to its next throw, of its flash after a hit, of its wind-up before a throw. */
  next: number;
  flash: number;
}
export interface World {
  stage: number;
  spec: StageSpec;
  /** Cells squares bounce off (stacks, stairs, the slopes' cells), y × N + x. */
  solid: Uint8Array;
  /** Each side's columns: their heights at both ends (the low u end first), or null for a hole. */
  columns: ([number, number] | null)[][];
  holes: (Hole & { pair: number })[];
  pistons: (Piston & { height: number })[];
  runner: Runner;
  squares: Square[];
  boss: Boss | null;
  time: number;
  /** Seconds to the next square, and when the way round next turns (Infinity for never). */
  next: number;
  flipAt: number;
  seed: number;
  ids: number;
}
export type Event =
  | { kind: "hurt"; by: "wall" | "stack" | "square" | "boss" }
  | { kind: "smash"; x: number; y: number }
  | { kind: "shatter"; x: number; y: number; knocked: boolean }
  | { kind: "boss"; x: number; y: number; hp: number }
  | { kind: "turn" }
  | { kind: "portal"; from: Hole; to: Hole }
  | { kind: "jump" }
  | { kind: "land" }
  | { kind: "flip" };
/** The room's own little generator (mulberry32), so that a world steps the same from the same seed. */
function rand(world: World) {
  let t = (world.seed = (world.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** The cells of a stage as laid at the start (stacks, stairs, ring, slopes' cells), y × N + x. */
export function solidOf(spec: StageSpec): Uint8Array {
  const solid = new Uint8Array(N * N),
    put = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < N && y < N) solid[y * N + x] = 1;
    };
  for (const [side, col, height] of spec.stacks ?? []) for (let d = 0; d < height; d++) put(...cellOf(side, col, d));
  for (const [x, y] of spec.cells ?? []) put(x, y);
  if (spec.stairs)
    for (let a = 0; a < spec.stairs; a++)
      for (let b = 0; a + b < spec.stairs; b++)
        for (const [x, y] of [
          [a, b],
          [N - 1 - a, b],
          [a, N - 1 - b],
          [N - 1 - a, N - 1 - b],
        ])
          put(x, y);
  // A slope's cells: those wholly under it.
  for (const ramp of spec.ramps ?? []) for (let d = 0; d < Math.min(ramp.from, ramp.to); d++) put(...cellOf(ramp.side, ramp.col, d));
  return solid;
}
/** The height of the stack in a side's column: cells laid from the side up without a gap. */
function stackOf(solid: Uint8Array, side: number, col: number) {
  let d = 0;
  while (d < N) {
    const [x, y] = cellOf(side, col, d);
    if (!solid[y * N + x]) break;
    d++;
  }
  return d;
}
export function createWorld(stage = 1, seed = 1): World {
  const spec = stageOf(stage),
    solid = solidOf(spec),
    columns = [0, 1, 2, 3].map((side) => Array.from({ length: N }, (_, col): [number, number] | null => [stackOf(solid, side, col), stackOf(solid, side, col)]));
  for (const ramp of spec.ramps ?? []) columns[ramp.side][ramp.col] = [ramp.from, ramp.to];
  const holes: World["holes"] = [];
  (spec.holes ?? []).forEach(([a, b]) => {
    holes.push({ ...a, pair: holes.length + 1 }, { ...b, pair: holes.length });
    columns[a.side][a.col] = columns[b.side][b.col] = null;
  });
  const boss = spec.boss ? { x: 7, y: 7, vx: 0.9, vy: 0.6, hp: spec.boss.hp, max: spec.boss.hp, next: 2.2, flash: 0 } : null;
  return {
    stage: STAGES.indexOf(spec) + 1,
    spec,
    solid,
    columns,
    holes,
    pistons: (spec.pistons ?? []).map((p) => ({ ...p, height: 0 })),
    runner: { side: 0, u: START, h: 0, vh: 0, dir: 1, air: false, safe: 0.6, strike: 0, cool: 0, tumble: 0, from: 0, pose: "punch", vault: false, run: 0, lift: 0, coyote: 0, buffer: 0, strikes: 0, jumps: 0 },
    squares: [],
    boss,
    time: 0,
    next: 1.5,
    flipAt: spec.flip ?? Infinity,
    seed: seed | 0 || 1,
    ids: 0,
  };
}
/** A piston's height at a time: a smooth rise and fall between nothing and its top, resting a little at both. */
const pistonHeight = (p: Piston, time: number) => {
  const t = (((time / p.period + p.phase) % 1) + 1) % 1,
    wave = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  return p.top * Math.min(1, Math.max(0, (wave - 0.12) / 0.76));
};
/** A column's heights at its two ends, pistons included; null for a hole. */
export function profile(world: World, side: number, col: number): [number, number] | null {
  const base = world.columns[side][col];
  if (!base) return null;
  for (const p of world.pistons) if (p.side === side && p.col === col && p.height > base[0]) return [p.height, p.height];
  return base;
}
/** The ground's height under a point of a side (−Infinity over a hole). */
export function groundAt(world: World, side: number, u: number) {
  const col = Math.max(0, Math.min(N - 1, Math.floor(u))),
    p = profile(world, side, col);
  if (!p) return -Infinity;
  return p[0] + (p[1] - p[0]) * Math.max(0, Math.min(1, u - col));
}
/** Whether a cell of the room stops a square: a laid cell or a piston risen into it. */
export function solidAt(world: World, x: number, y: number) {
  if (x < 0 || y < 0 || x >= N || y >= N) return true;
  if (world.solid[y * N + x]) return true;
  for (const p of world.pistons)
    for (let d = 0; d < Math.ceil(p.height - 0.05); d++) {
      const [cx, cy] = cellOf(p.side, p.col, d);
      if (cx === x && cy === y) return true;
    }
  return false;
}
/** The runner's box on the screen: left, top, right, bottom. */
export function runnerBox(r: Runner, shrink = 0): [number, number, number, number] {
  return box(r.side, r.u - HALF + shrink, r.u + HALF - shrink, r.h + shrink, r.h + TALL - shrink);
}
/** The middle of the runner on the screen. */
export const runnerCentre = (r: Runner) => toWorld(r.side, r.u, r.h + TALL / 2);
/** The box a strike knocks squares out of, on the screen. */
export function strikeBox(r: Runner): [number, number, number, number] {
  const a = r.u - r.dir * STRIKE_BACK,
    b = r.u + r.dir * STRIKE_AHEAD;
  return box(r.side, Math.min(a, b), Math.max(a, b), r.h - 0.3, r.h + STRIKE_UP);
}
function box(side: number, u0: number, u1: number, h0: number, h1: number): [number, number, number, number] {
  const [ax, ay] = toWorld(side, u0, h0),
    [bx, by] = toWorld(side, u1, h1);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}
const overlaps = (a: [number, number, number, number], s: Square, grow = 0) =>
  s.x + SQUARE / 2 + grow > a[0] && s.x - SQUARE / 2 - grow < a[2] && s.y + SQUARE / 2 + grow > a[1] && s.y - SQUARE / 2 - grow < a[3];
/** How far his front is from the frame's wall ahead. */
export const aheadOf = (r: Runner) => (r.dir > 0 ? N - (r.u + HALF) : r.u - HALF);
/** He tumbles a quarter onto the wall ahead, his middle kept where it was (or as near as the room allows). */
function turn(world: World, r: Runner) {
  const cu = r.u,
    ch = r.h + TALL / 2,
    from = r.side;
  let u: number, h: number;
  if (r.dir > 0) {
    r.side = (r.side + 1) % 4;
    u = ch;
    h = N - cu - TALL / 2;
  } else {
    r.side = (r.side + 3) % 4;
    u = N - ch;
    h = cu - TALL / 2;
  }
  r.u = Math.max(HALF, Math.min(N - HALF, u));
  const g = groundAt(world, r.side, r.u);
  r.h = Math.max(h, g === -Infinity ? 0 : g);
  r.air = r.h > g + 0.01;
  r.vh = 0;
  r.vault = false;
  r.tumble = TUMBLE;
  r.from = from;
}
function hurt(r: Runner, by: "wall" | "stack" | "square" | "boss", events: Event[]) {
  if (r.safe > 0) return false;
  r.safe = SAFE;
  events.push({ kind: "hurt", by });
  return true;
}
/** A jump pressed: a turn onto the wall when it is near, else a leap if he is on his feet. True when it did something. */
export function jump(world: World, events: Event[] = []) {
  const r = world.runner;
  if (r.tumble > TUMBLE * 0.4) return false;
  if (aheadOf(r) <= REACH) {
    turn(world, r);
    r.jumps++;
    events.push({ kind: "turn" });
    return true;
  }
  if (r.air && r.coyote <= 0) {
    // Pressed a moment too early: made as he lands.
    r.buffer = BUFFER;
    return false;
  }
  leap(r);
  events.push({ kind: "jump" });
  return true;
}
function leap(r: Runner) {
  r.air = true;
  r.vh = JUMP;
  r.coyote = 0;
  r.buffer = 0;
  r.jumps++;
}
/** A strike pressed (a tap): a punch on his feet, a kick in the air or as the second of two quick ones. */
export function strike(world: World) {
  const r = world.runner;
  if (r.cool > 0) return false;
  r.pose = r.air || (r.pose === "punch" && r.cool > -0.3) ? "kick" : "punch";
  r.strike = STRIKE_TIME;
  r.cool = STRIKE_COOL;
  r.strikes++;
  return true;
}
/** The runner's step: running, climbing, falling, the walls ahead and the holes. */
function stepRunner(world: World, events: Event[]) {
  const r = world.runner,
    dt = DT;
  r.safe -= dt;
  r.strike -= dt;
  r.cool -= dt;
  r.tumble = Math.max(0, r.tumble - dt);
  r.coyote -= dt;
  r.buffer -= dt;
  r.lift *= Math.exp(-dt / 0.05);
  // The way round turns now and then in some stages.
  if (world.time >= world.flipAt) {
    r.dir = r.dir > 0 ? -1 : 1;
    world.flipAt += world.spec.flip ?? Infinity;
    events.push({ kind: "flip" });
  }
  if (r.air) {
    r.vh -= GRAVITY * dt;
    r.h += r.vh * dt;
  }
  const col = Math.floor(Math.max(0, Math.min(N - 1e-6, r.u))),
    banded = (world.spec.bands ?? []).some((b) => b.side === r.side && col >= b.from && col <= b.to),
    du = r.dir * world.spec.speed * (banded ? BAND : 1) * dt,
    nu = r.u + du,
    front = nu + r.dir * HALF;
  if (front >= N || front <= 0) {
    r.u = r.dir > 0 ? N - HALF : HALF;
    // Into the wall: on his feet it hurts; in the air (or blinking) he simply takes to it.
    if (!r.air) hurt(r, "wall", events);
    turn(world, r);
    events.push({ kind: "turn" });
    return;
  }
  const was = Math.floor(r.u + r.dir * HALF),
    next = Math.floor(front);
  let to = nu;
  if (next !== was && next >= 0 && next < N) {
    const p = profile(world, r.side, next),
      entry = p ? (r.dir > 0 ? p[0] : p[1]) : -Infinity;
    if (entry > r.h + TOL && !r.vault) {
      if (!r.air && entry - r.h <= STEP + 0.05) {
        // A low step: up he goes by himself (eased in the drawing).
        r.lift += r.h - entry;
        r.h = entry;
      } else {
        to = r.dir > 0 ? next - HALF - 1e-4 : next + 1 + HALF + 1e-4;
        if (!r.air) {
          // Into a tall stack: a heart, and he is thrown back and over it.
          hurt(r, "stack", events);
          to -= r.dir * 0.9;
          r.air = true;
          r.vh = JUMP;
          r.vault = true;
        }
      }
    }
  }
  r.u = Math.max(HALF, Math.min(N - HALF, to));
  const g = groundAt(world, r.side, r.u);
  if (r.air) {
    if (r.vh <= 0 && r.h <= g) {
      r.h = g;
      r.air = false;
      r.vh = 0;
      r.vault = false;
      events.push({ kind: "land" });
      if (r.buffer > 0) {
        leap(r);
        events.push({ kind: "jump" });
      }
    }
  } else if (g === -Infinity || g < r.h - DROP) {
    // Off an edge he falls (a jump is still his for a moment); a hole draws him in, so that he does not skip over it at speed.
    r.air = true;
    r.vh = g === -Infinity ? -6 : 0;
    r.coyote = g === -Infinity ? 0 : COYOTE;
  } else {
    // On the ground, slopes and low steps down included (a step down eased in the drawing).
    if (g < r.h - TOL) r.lift += r.h - g;
    r.run += Math.abs(du);
    r.h = g;
  }
  // Fallen into a hole: out of its pair, popping up and still going his way round.
  if (r.air && r.vh < 0 && r.h < -0.9) {
    const at = Math.floor(r.u),
      hole = world.holes.find((x) => x.side === r.side && x.col === at);
    if (hole) {
      const out = world.holes[hole.pair];
      r.side = out.side;
      r.u = out.col + 0.5;
      r.h = -0.9;
      r.vh = 12;
      r.tumble = 0;
      events.push({ kind: "portal", from: { side: hole.side, col: hole.col }, to: { side: out.side, col: out.col } });
    } else r.h = Math.max(r.h, -0.9);
  }
}
/** A new square somewhere clear of the runner. */
function spawn(world: World) {
  const { spec } = world,
    weights = Object.entries(spec.kinds) as [Exclude<Kind, "shot">, number][],
    total = weights.reduce((sum, [, w]) => sum + w, 0);
  let pick = rand(world) * total,
    kind: Exclude<Kind, "shot"> = weights[0][0];
  for (const [k, w] of weights) {
    if ((pick -= w) < 0) {
      kind = k;
      break;
    }
  }
  const [rx, ry] = runnerCentre(world.runner),
    speed = spec.squareSpeed * (0.8 + 0.4 * rand(world));
  for (let tries = 0; tries < 30; tries++) {
    const x = kind === "spin" ? 3 + rand(world) * (N - 6) : 1.5 + rand(world) * (N - 3),
      y = kind === "rain" ? 1.2 : kind === "spin" ? 3 + rand(world) * (N - 6) : 1.5 + rand(world) * (N - 3);
    if (Math.hypot(x - rx, y - ry) < (kind === "rain" ? 4 : 5)) continue;
    if (solidAt(world, Math.floor(x), Math.floor(y)) || (world.boss && Math.abs(x - world.boss.x) < BOSS_HALF + 1 && Math.abs(y - world.boss.y) < BOSS_HALF + 1)) continue;
    const a = rand(world) * Math.PI * 2;
    if (kind === "spin") {
      // Four squares turning round one middle that drifts: they share the orbit, each at its own quarter.
      const orbit = { cx: x, cy: y, vx: Math.cos(a) * speed * 0.6, vy: Math.sin(a) * speed * 0.6, r: 0.75, a: rand(world) * Math.PI, w: (rand(world) < 0.5 ? -1 : 1) * 2.2 };
      for (let slot = 0; slot < 4; slot++) world.squares.push({ id: world.ids++, kind, x, y, vx: 0, vy: 0, appear: APPEAR, knocked: false, angle: 0, spin: orbit.w, orbit, slot });
    } else
      world.squares.push({
        id: world.ids++,
        kind,
        x,
        y,
        vx: kind === "rain" ? 0 : Math.cos(a) * speed,
        vy: kind === "rain" ? 0 : Math.sin(a) * speed,
        appear: APPEAR,
        knocked: false,
        angle: 0,
        spin: (rand(world) - 0.5) * 3,
        orbit: null,
        slot: 0,
      });
    return;
  }
}
/** Squares that count toward a stage's crowd (a spinning four counts as two). */
const crowd = (world: World) => world.squares.reduce((n, s) => n + (s.knocked || s.kind === "shot" ? 0 : s.kind === "spin" ? 0.5 : 1), 0);
/** Moves a square straight on; true when it ran into the frame or a cell (it then bounces, unless it breaks). */
function slide(world: World, s: Square, dt: number) {
  const half = SQUARE / 2;
  let hit = false;
  const blocked = (x: number, y: number) =>
    x - half < 0 || y - half < 0 || x + half > N || y + half > N || [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([sx, sy]) => solidAt(world, Math.floor(x + sx * half * 0.95), Math.floor(y + sy * half * 0.95)));
  // Caught inside something (a piston rose into it): it moves freely until it is out.
  if (blocked(s.x, s.y)) {
    s.x = Math.max(half, Math.min(N - half, s.x + s.vx * dt));
    s.y = Math.max(half, Math.min(N - half, s.y + s.vy * dt));
    return false;
  }
  const nx = s.x + s.vx * dt;
  if (blocked(nx, s.y)) {
    s.vx = -s.vx;
    hit = true;
  } else s.x = nx;
  const ny = s.y + s.vy * dt;
  if (blocked(s.x, ny)) {
    s.vy = -s.vy;
    hit = true;
  } else s.y = ny;
  return hit;
}
function knock(world: World, s: Square, r: Runner) {
  s.knocked = true;
  s.orbit = null;
  s.appear = 0;
  if (world.boss) {
    const dx = world.boss.x - s.x,
      dy = world.boss.y - s.y,
      d = Math.hypot(dx, dy) || 1;
    s.vx = (dx / d) * KNOCKED;
    s.vy = (dy / d) * KNOCKED;
  } else {
    const [fx, fy] = FORWARD[r.side],
      [ux, uy] = UP[r.side],
      vx = fx * r.dir + ux * 0.45,
      vy = fy * r.dir + uy * 0.45,
      d = Math.hypot(vx, vy);
    s.vx = (vx / d) * KNOCKED;
    s.vy = (vy / d) * KNOCKED;
  }
  s.spin = 14 * r.dir;
}
function stepSquares(world: World, events: Event[]) {
  const dt = DT,
    r = world.runner,
    [rx, ry] = runnerCentre(r),
    gone = new Set<Square>(),
    moved = new Set<object>();
  for (const s of world.squares) {
    s.angle += s.spin * dt;
    if (s.appear > 0) {
      s.appear -= dt;
      continue;
    }
    if (s.knocked || s.kind === "shot") {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const boss = world.boss;
      if (s.knocked && boss && boss.hp > 0 && Math.abs(s.x - boss.x) < BOSS_HALF + SQUARE / 2 && Math.abs(s.y - boss.y) < BOSS_HALF + SQUARE / 2) {
        gone.add(s);
        boss.hp--;
        boss.flash = 0.35;
        events.push({ kind: "boss", x: s.x, y: s.y, hp: boss.hp });
        continue;
      }
      if (s.x < SQUARE / 2 || s.y < SQUARE / 2 || s.x > N - SQUARE / 2 || s.y > N - SQUARE / 2 || solidAt(world, Math.floor(s.x), Math.floor(s.y))) {
        gone.add(s);
        events.push({ kind: "shatter", x: s.x, y: s.y, knocked: s.knocked });
      }
      continue;
    }
    if (s.kind === "spin" && s.orbit) {
      const o = s.orbit;
      if (!moved.has(o)) {
        moved.add(o);
        o.a += o.w * dt;
        const reach = o.r + SQUARE / 2 + 0.05;
        o.cx += o.vx * dt;
        o.cy += o.vy * dt;
        if (o.cx < reach || o.cx > N - reach) {
          o.vx = -o.vx;
          o.cx = Math.max(reach, Math.min(N - reach, o.cx));
        }
        if (o.cy < reach || o.cy > N - reach) {
          o.vy = -o.vy;
          o.cy = Math.max(reach, Math.min(N - reach, o.cy));
        }
      }
      const a = o.a + (s.slot * Math.PI) / 2;
      s.x = o.cx + Math.cos(a) * o.r;
      s.y = o.cy + Math.sin(a) * o.r;
      s.angle = a;
      continue;
    }
    if (s.kind === "rain") {
      s.vy = Math.min(7, s.vy + 7 * dt);
      s.y += s.vy * dt;
      if (s.y > N - SQUARE / 2 || solidAt(world, Math.floor(s.x), Math.floor(s.y + SQUARE / 2))) {
        gone.add(s);
        events.push({ kind: "shatter", x: s.x, y: s.y, knocked: false });
      }
      continue;
    }
    if (s.kind === "homing") {
      const dx = rx - s.x,
        dy = ry - s.y,
        d = Math.hypot(dx, dy) || 1,
        speed = world.spec.squareSpeed * 1.1,
        k = Math.min(1, 1.1 * dt);
      s.vx += ((dx / d) * speed - s.vx) * k;
      s.vy += ((dy / d) * speed - s.vy) * k;
    }
    slide(world, s, dt);
  }
  // A struck square flying through others knocks them on too.
  for (const s of world.squares)
    if (s.knocked && !gone.has(s))
      for (const t of world.squares)
        if (t !== s && !t.knocked && t.appear <= 0 && !gone.has(t) && Math.abs(t.x - s.x) < SQUARE && Math.abs(t.y - s.y) < SQUARE) {
          knock(world, t, r);
          t.vx = s.vx * 0.9 - s.vy * 0.3;
          t.vy = s.vy * 0.9 + s.vx * 0.3;
          events.push({ kind: "smash", x: t.x, y: t.y });
        }
  // The strike knocks away what is in its box; what touches him otherwise hurts.
  const reach = strikeBox(r),
    body = runnerBox(r, 0.08);
  for (const s of world.squares) {
    if (gone.has(s) || s.knocked || s.appear > 0) continue;
    if (r.strike > 0 && overlaps(reach, s)) {
      knock(world, s, r);
      events.push({ kind: "smash", x: s.x, y: s.y });
      continue;
    }
    if (overlaps(body, s) && hurt(r, "square", events)) {
      gone.add(s);
      events.push({ kind: "shatter", x: s.x, y: s.y, knocked: false });
    }
  }
  if (gone.size) world.squares = world.squares.filter((s) => !gone.has(s));
}
function stepBoss(world: World, events: Event[]) {
  const boss = world.boss,
    r = world.runner;
  if (!boss || boss.hp <= 0) return;
  const dt = DT,
    angry = 1 + (1 - boss.hp / boss.max) * 0.8;
  boss.flash = Math.max(0, boss.flash - dt);
  boss.x += boss.vx * angry * dt;
  boss.y += boss.vy * angry * dt;
  for (const axis of ["x", "y"] as const) {
    const v = axis === "x" ? "vx" : "vy";
    if (boss[axis] < BOSS_BOX[0] || boss[axis] > BOSS_BOX[1]) {
      boss[v] = -boss[v];
      boss[axis] = Math.max(BOSS_BOX[0], Math.min(BOSS_BOX[1], boss[axis]));
    }
  }
  boss.next -= dt;
  if (boss.next <= 0) {
    const spec = world.spec.boss!,
      [rx, ry] = runnerCentre(r),
      far = Math.hypot(rx - boss.x, ry - boss.y),
      [fx, fy] = FORWARD[r.side],
      lead = (far / spec.speed) * world.spec.speed * r.dir * 0.8,
      tx = r.air ? rx : rx + fx * lead,
      ty = r.air ? ry : ry + fy * lead,
      d = Math.hypot(tx - boss.x, ty - boss.y) || 1;
    world.squares.push({ id: world.ids++, kind: "shot", x: boss.x, y: boss.y, vx: ((tx - boss.x) / d) * spec.speed, vy: ((ty - boss.y) / d) * spec.speed, appear: 0, knocked: false, angle: 0, spin: 4, orbit: null, slot: 0 });
    boss.next = spec.every * (0.55 + 0.45 * (boss.hp / boss.max)) * (0.85 + 0.3 * rand(world));
  }
  // Touching the boss hurts, as a square does.
  const body = runnerBox(r, 0.1);
  if (body[2] > boss.x - BOSS_HALF && body[0] < boss.x + BOSS_HALF && body[3] > boss.y - BOSS_HALF && body[1] < boss.y + BOSS_HALF) hurt(r, "boss", events);
}
/** One slice of the room. */
export function step(world: World): Event[] {
  const events: Event[] = [];
  world.time += DT;
  for (const p of world.pistons) p.height = pistonHeight(p, world.time);
  stepRunner(world, events);
  stepBoss(world, events);
  world.next -= DT;
  if (world.next <= 0) {
    if (crowd(world) < world.spec.max) spawn(world);
    world.next = world.spec.every * (0.75 + 0.5 * rand(world));
  }
  stepSquares(world, events);
  return events;
}
/** Seconds until the way round turns, when that is near enough to be warned of; null otherwise. */
export const flipWarning = (world: World) => (world.flipAt - world.time <= WARN ? Math.max(0, world.flipAt - world.time) : null);
