import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 활잡이 결투 (Archer Duel): two archers on two mounds far apart take turns loosing one arrow at the other. A shot is
 * a move whose `to` is the angle the bow is raised above the level (tenths of a degree) and whose `extra` is how hard
 * the string is drawn, as the arrow's speed off the bow (tenths of a metre a second). There is no aiming line: the
 * arrow flies a true arc under gravity (there is no wind: the user had the windy field taken out), and one learns from where the last arrow
 * came down. An arrow striking an archer hurts by where it strikes (the head the most, the legs the least); the first
 * brought to nothing loses (an arrow can still strike its own archer in the rules, but with no wind none of the bow's
 * shots comes back down on it).
 *
 * The field is laid when the game is made, from the `random` passed in (over Wi-Fi the room's shared stream): the gap
 * between the archers, the rise of the two mounds and the roll of the ground between. Free of Three.js: the view and the tests fly arrows with `flight`.
 *
 * Coordinates are the rules' own, in metres: x along the field (side 0 stands at −span/2 and faces +x, side 1 at
 * +span/2 and faces −x), y up (0 the field's mean level). The view may show the field mirrored (a device whose own
 * archer is side 1 sees itself on the left).
 */
/** The one field: calm (the windy one was taken out; a remembered or a room's old "wind" is read as calm). */
export type Variant = "calm";
export const variantOf = (_v: string): Variant => "calm";
/** Gravity (m/s²), the field's span between the archers (m, drawn between these), each archer's health. */
export const GRAVITY = 9.81,
  SPAN = { least: 30, most: 48 },
  HEALTH = 100;
/** The bow: the arrow's speed off the string at the weakest and the fullest draw (m/s), and the angles allowed (degrees). */
export const POWER = { least: 10, most: 30 },
  ANGLE = { least: 0, most: 89 };
/**
 * An archer as the arrows find it, from the feet (m): the legs, the body and the head (a circle), the bow hand where
 * the arrow leaves (ahead of the feet toward the foe and up). The hurt of each: two arrows in the head end a duel.
 */
export const FIGURE = {
  legs: { half: 0.16, low: 0, high: 0.86 },
  body: { half: 0.22, low: 0.86, high: 1.46 },
  head: { y: 1.63, r: 0.16 },
  hand: { ahead: 0.3, up: 1.42 },
};
export const HURT = { head: 50, body: 25, legs: 12 } as const;
export type Part = keyof typeof HURT;
/** Arrows left standing in the field and in the archers (the oldest pulled out as more come). */
export const KEEP = 24;
/** The ground's shape: the two mounds' rise (m) and the roll between (amplitude m, wave number per m, phase). */
export interface Land {
  span: number;
  mounds: [number, number];
  roll: [number, number, number][];
}
/** An arrow standing in the ground or in an archer: where its point is (rules' metres), its slope (radians, the way it flew), who loosed it. */
export interface Stuck {
  x: number;
  y: number;
  slope: number;
  side: 0 | 1;
  /** -1 in the ground; else the archer it stands in (its point given from that archer's feet, x toward the archer's front). */
  in: -1 | 0 | 1;
  part?: Part;
}
/** A shot played: who, how, and what it struck. */
export interface Shot {
  side: 0 | 1;
  angle: number;
  power: number;
  /** Where it came to rest (rules' metres), its slope there, how long it flew (s). */
  x: number;
  y: number;
  slope: number;
  time: number;
  /** The archer struck and where (null: the ground, or out of the field). */
  target: 0 | 1 | null;
  part: Part | null;
  hurt: number;
  /** It flew out over the field's end and was not seen to land. */
  lost: boolean;
}
export interface State {
  variant: Variant;
  land: Land;
  health: [number, number];
  turn: 0 | 1;
  /** Shots each side has loosed. */
  shots: [number, number];
  /** Each side's last shot, and the shot played last. */
  prev: [Shot | null, Shot | null];
  last: Shot | null;
  stuck: Stuck[];
  winner: Winner;
  ply: number;
}
const round = (v: number, k = 1000) => Math.round(v * k) / k;
const other = (side: 0 | 1): 0 | 1 => (side ? 0 : 1);
/** Where an archer stands along the field (its feet), and the way it faces (+1 toward +x). */
export const standX = (land: Land, side: 0 | 1) => (side ? land.span / 2 : -land.span / 2);
export const facing = (side: 0 | 1) => (side ? -1 : 1);
/** A smooth hump of `rise` metres over `reach` metres either side of its top. */
const hump = (d: number, rise: number, reach = 6) => (Math.abs(d) >= reach ? 0 : rise * (0.5 + 0.5 * Math.cos((Math.PI * d) / reach)));
/** The ground's height at `x` (m). */
export function ground(land: Land, x: number) {
  let y = hump(x - standX(land, 0), land.mounds[0]) + hump(x - standX(land, 1), land.mounds[1]);
  for (const [a, k, p] of land.roll) y += a * Math.sin(k * x + p);
  return y;
}
/** Where an archer's feet are. */
export const feet = (land: Land, side: 0 | 1) => ({ x: standX(land, side), y: ground(land, standX(land, side)) });
/** Where an archer's arrow leaves the bow. */
export function hand(land: Land, side: 0 | 1) {
  const f = feet(land, side);
  return { x: f.x + facing(side) * FIGURE.hand.ahead, y: f.y + FIGURE.hand.up };
}
/** The field: the gap between the archers, their mounds, the ground's roll. */
export function drawLand(random: Random): Land {
  const span = round(SPAN.least + (SPAN.most - SPAN.least) * random(), 10),
    mounds: [number, number] = [round(0.6 + 2.4 * random(), 100), round(0.6 + 2.4 * random(), 100)],
    roll: [number, number, number][] = [0, 1].map((k) => [round((k ? 0.25 : 0.55) * (0.5 + random()), 100), round((k ? 0.37 : 0.13) * (0.8 + 0.4 * random()), 1000), round(random() * Math.PI * 2, 1000)]);
  return { span, mounds, roll };
}
export function createGame(variant: Variant = "calm", random: Random = cryptoRandom): State {
  const land = drawLand(random);
  return {
    variant,
    land,
    health: [HEALTH, HEALTH],
    turn: 0,
    shots: [0, 0],
    prev: [null, null],
    last: null,
    stuck: [],
    winner: null,
    ply: 0,
  };
}
/** A move's angle and power, and back. */
export const shotMove = (angle: number, power: number): Move => ({ from: -1, to: Math.round(angle * 10), extra: Math.round(power * 10) });
export function readShot(move: Move) {
  if (move.from !== -1 || !Number.isInteger(move.to) || !Number.isInteger(move.extra)) return null;
  const angle = move.to / 10,
    power = move.extra / 10;
  if (angle < ANGLE.least || angle > ANGLE.most || power < POWER.least || power > POWER.most) return null;
  return { angle, power };
}
/** Whether a point (rules' metres) is in an archer, and where: the head first, then the body, then the legs. */
export function partAt(land: Land, side: 0 | 1, x: number, y: number): Part | null {
  const f = feet(land, side),
    dx = x - f.x,
    dy = y - f.y;
  if (Math.hypot(dx, dy - FIGURE.head.y) <= FIGURE.head.r) return "head";
  if (Math.abs(dx) <= FIGURE.body.half && dy >= FIGURE.body.low && dy <= FIGURE.body.high) return "body";
  if (Math.abs(dx) <= FIGURE.legs.half && dy >= FIGURE.legs.low && dy < FIGURE.legs.high) return "legs";
  return null;
}
/** One fixed step of the flight (s). */
export const STEP = 1 / 300;
/** The longest flight followed (s) and how far beyond an archer the field goes (m): past it an arrow is lost. */
const LONGEST = 12,
  BEYOND = 60;
export interface FlightPoint {
  x: number;
  y: number;
  t: number;
}
/**
 * Flies an arrow loosed by `side` at `angle` degrees with `power` m/s until it strikes an archer, the
 * ground, or flies out of the field. An arrow cannot strike its own archer until it has been in the air a little
 * (it leaves from the bow hand, in front of the body). `every` keeps a point of the way every so many steps.
 */
export function flight(land: Land, side: 0 | 1, angle: number, power: number, every = 0) {
  const from = hand(land, side),
    a = (angle * Math.PI) / 180,
    face = facing(side),
    path: FlightPoint[] = [];
  let x = from.x,
    y = from.y,
    vx = face * power * Math.cos(a),
    vy = power * Math.sin(a),
    t = 0,
    n = 0;
  if (every) path.push({ x, y, t });
  const end = (target: 0 | 1 | null, part: Part | null, lost = false) => {
    if (every) path.push({ x, y, t });
    return { x, y, t, slope: Math.atan2(vy, vx), target, part, lost, path };
  };
  while (t < LONGEST) {
    // Exact for a constant pull (gravity): no error builds up over the flight.
    const h = STEP;
    x += vx * h;
    y += vy * h - 0.5 * GRAVITY * h * h;
    vy -= GRAVITY * h;
    t += h;
    for (const s of [other(side), side] as (0 | 1)[]) {
      if (s === side && t < 0.35) continue;
      const part = partAt(land, s, x, y);
      if (part) return end(s, part);
    }
    const floor = ground(land, x);
    if (y <= floor) {
      // Back along the last step to where it met the ground.
      let lo = 0,
        hi = h;
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2,
          bx = x - vx * mid,
          by = y - vy * mid;
        if (by <= ground(land, bx)) lo = mid;
        else hi = mid;
      }
      x -= vx * lo;
      y = ground(land, x);
      return end(null, null);
    }
    if (Math.abs(x) > land.span / 2 + BEYOND) return end(null, null, true);
    if (every && ++n % every === 0) path.push({ x, y, t });
  }
  return end(null, null, true);
}
/**
 * A shot: the arrow is flown, the archer it strikes is hurt, it stays where it stands, and the other side shoots.
 */
export function play(state: State, move: Move): State | null {
  if (state.winner !== null) return null;
  const read = readShot(move);
  if (!read) return null;
  const side = state.turn,
    f = flight(state.land, side, read.angle, read.power),
    hurt = f.part ? HURT[f.part] : 0,
    shot: Shot = {
      side,
      angle: read.angle,
      power: read.power,
      x: round(f.x),
      y: round(f.y),
      slope: round(f.slope),
      time: round(f.t),
      target: f.target,
      part: f.part,
      hurt,
      lost: f.lost,
    },
    health: [number, number] = [...state.health];
  if (f.target !== null) health[f.target] = Math.max(0, health[f.target] - hurt);
  const stuck = [...state.stuck];
  if (!f.lost) {
    if (f.target === null) stuck.push({ x: shot.x, y: shot.y, slope: shot.slope, side, in: -1 });
    else {
      // In an archer: its point from that archer's feet, across as the archer faces (so it moves with the archer).
      const at = feet(state.land, f.target);
      stuck.push({ x: round((shot.x - at.x) * facing(f.target)), y: round(shot.y - at.y), slope: round(Math.atan2(Math.sin(f.slope), Math.cos(f.slope) * facing(f.target))), side, in: f.target, part: f.part! });
    }
  }
  while (stuck.length > KEEP) stuck.shift();
  const prev: [Shot | null, Shot | null] = [...state.prev];
  prev[side] = shot;
  const shots: [number, number] = [...state.shots];
  shots[side]++;
  const fallen = health[0] <= 0 ? 0 : health[1] <= 0 ? 1 : null;
  return {
    ...state,
    health,
    stuck,
    prev,
    shots,
    last: shot,
    turn: fallen === null ? other(side) : side,
    winner: fallen === null ? null : other(fallen),
    ply: state.ply + 1,
  };
}
/** A few shots that stand for all of them (any angle and draw may be loosed). */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return [30, 45, 60].flatMap((angle) => [16, 20, 24].map((power) => shotMove(angle, power)));
}
/**
 * Where an arrow at `angle` and `power` comes down to the height of the foe's middle (or the ground before it): how
 * far it falls short (negative) or long (positive) of the foe, measured toward the foe. Free of the archers: the
 * computer reckons its shot as a person would, by the arc alone.
 */
export function overshoot(land: Land, side: 0 | 1, angle: number, power: number) {
  const from = hand(land, side),
    foe = feet(land, other(side)),
    face = facing(side),
    aimY = foe.y + (FIGURE.body.low + FIGURE.body.high) / 2,
    a = (angle * Math.PI) / 180;
  let x = from.x,
    y = from.y,
    vx = face * power * Math.cos(a),
    vy = power * Math.sin(a),
    t = 0;
  const h = STEP * 3;
  while (t < LONGEST) {
    const px = x,
      py = y;
    x += vx * h;
    y += vy * h - 0.5 * GRAVITY * h * h;
    vy -= GRAVITY * h;
    t += h;
    // Coming down through the foe's middle height, or into the ground.
    if ((vy < 0 && py >= aimY && y < aimY) || y <= ground(land, x)) {
      const f = vy < 0 && py >= aimY && y < aimY ? (py - aimY) / Math.max(1e-9, py - y) : 1,
        cx = px + (x - px) * f;
      return (cx - foe.x) * face;
    }
    if (Math.abs(x) > land.span / 2 + BEYOND) return (x - foe.x) * face;
  }
  return (x - foe.x) * face;
}
/** The draw (m/s) that brings an arrow at `angle` down on the foe, as near as the bow allows. */
export function powerFor(land: Land, side: 0 | 1, angle: number) {
  let lo = POWER.least,
    hi = POWER.most;
  if (overshoot(land, side, angle, hi) < 0) return hi;
  if (overshoot(land, side, angle, lo) > 0) return lo;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (overshoot(land, side, angle, mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export type Level = "easy" | "normal" | "hard";
/**
 * The computer's archers: how far off its first draw is (a share of the draw, one standard deviation), how much of
 * that is left after each shot as it learns from where its arrows fall (`learn`), the least it ever comes to (`steady`),
 */
export const LEVELS: Record<Level, { label: string; first: number; learn: number; steady: number }> = {
  easy: { label: "쉬움", first: 0.12, learn: 0.8, steady: 0.035 },
  normal: { label: "보통", first: 0.09, learn: 0.68, steady: 0.016 },
  hard: { label: "어려움", first: 0.06, learn: 0.55, steady: 0.008 },
};
const gauss = (random: Random) => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
/**
 * The computer's shot: it keeps the angle it began with (a person learns the draw for one angle), reckons the draw
 * for that angle, and is off by a share that shrinks with every arrow it has loosed:
 * it watches where they came down and closes in.
 */
export function chooseShot(state: State, level: Level, random: Random = cryptoRandom): Move | null {
  if (state.winner !== null) return null;
  const side = state.turn,
    L = LEVELS[level] ?? LEVELS.normal,
    before = state.prev[side],
    angle = before ? before.angle : Math.round(38 + 14 * random()),
    exact = powerFor(state.land, side, angle),
    spread = Math.max(L.steady, L.first * L.learn ** state.shots[side]),
    power = Math.min(POWER.most, Math.max(POWER.least, exact * (1 + gauss(random) * spread)));
  return shotMove(angle, Math.round(power * 10) / 10);
}
const effect = (): Effect | null => null;
export const PART_NAMES: Record<Part, string> = { head: "머리", body: "몸통", legs: "다리" };
export const bowDuel: PointGame<State> = {
  // Over Wi-Fi the field comes from the room's shared random, so every device lays the same.
  create: (variant, _options, random) => createGame(variantOf(variant), random ?? cryptoRandom),
  moves,
  play,
  choose: (state, level, random) => chooseShot(state, level, random),
  turn: (state) => state.turn,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state, player) => state.health[player] - state.health[other(player)],
  hint: (state) => {
    const k = state.shots[state.turn] + 1,
      how = state.ply < 2 ? " · 화면을 끌어 활을 당기고 놓으면 쏩니다" : "";
    return `${k}번째 화살${how}`;
  },
  tally: (state) => [0, 1].map((side) => `체력 ${state.health[side]}`) as [string, string],
  reason: (state) => {
    const last = state.last,
      how = last?.part ? `${PART_NAMES[last.part]}에 맞은 화살로 ` : "";
    if (last && last.target === last.side) return `${how}제 화살에 쓰러졌습니다 (체력 ${state.health[0]} 대 ${state.health[1]}).`;
    return `${how}승부가 났습니다 (체력 ${state.health[0]} 대 ${state.health[1]}, 화살 ${state.shots[0]}발 대 ${state.shots[1]}발).`;
  },
};
