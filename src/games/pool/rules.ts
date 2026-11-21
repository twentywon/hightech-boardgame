import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { copy, settle, shotCode, shotOf, strike, type Arena, type Disc } from "../flick/physics";

/**
 * Eight-ball pool for two: seven plain balls, seven striped, the black eight
 * and the white cue ball on a table with six pockets. Whoever first pockets
 * a ball takes that kind; pocketing one of one's own earns another shot.
 * With all seven down, the eight wins the game; down too early, or with the
 * cue ball, it loses it.
 */
export const HALF_X = 2.6,
  HALF_Z = 5,
  R = 0.19,
  ARENA: Arena = {
    halfX: HALF_X,
    halfZ: HALF_Z,
    cushions: true,
    pockets: [
      ...[-1, 1].flatMap((x) => [-1, 1].map((z) => ({ x: x * (HALF_X - 0.06), z: z * (HALF_Z - 0.06), r: 0.37 }))),
      ...[-1, 1].map((x) => ({ x: x * (HALF_X + 0.06), z: 0, r: 0.33 })),
    ],
    // Cloth, not a floor: a ball rolls a long way.
    friction: 0.95,
    bounce: 0.8,
  },
  CUE = 0,
  EIGHT = 8,
  /** Where the cue ball is put for the break and after it has gone down. */
  HEAD = { x: 0, z: 2.9 };
/** How fast the cue ball leaves the cue for a strength of 1–20. */
export const cueSpeed = (power: number) => 1.2 + power * 0.62;
/** 0 plain (1–7), 1 striped (9–15); null for the cue ball and the eight. */
export const kind = (id: number) => (id >= 1 && id <= 7 ? 0 : id >= 9 ? 1 : null);
export interface State {
  discs: Disc[];
  turn: 0 | 1;
  /** The kind each side plays, once a ball has gone down. */
  groups: [0 | 1, 0 | 1] | null;
  winner: Winner;
  last: { code: number; by: 0 | 1; from: { x: number; z: number } } | null;
  sunk: number[];
  foul: boolean;
  /** The mover may put the cue ball where they like: the other side pocketed it. */
  hand: boolean;
  /** The cue ball has been put down by hand in this turn. */
  placed: boolean;
  ply: number;
}
/** A place for the cue ball, told in fiftieths of a unit from the far left corner. */
export const PLACE_BASE = 1_000_000,
  GRID = 0.02;
export const placeCode = (x: number, z: number) => PLACE_BASE + Math.round((x + HALF_X) / GRID) * 1000 + Math.round((z + HALF_Z) / GRID);
export function placeOf(code: number) {
  const value = code - PLACE_BASE;
  if (!Number.isInteger(code) || value < 0) return null;
  return { x: Math.floor(value / 1000) * GRID - HALF_X, z: (value % 1000) * GRID - HALF_Z };
}
/** Whether the cue ball may lie there: on the cloth, off the pockets and clear of every other ball. */
export const free = (discs: Disc[], x: number, z: number) =>
  Math.abs(x) <= HALF_X - R + 1e-9 &&
  Math.abs(z) <= HALF_Z - R + 1e-9 &&
  ARENA.pockets.every((p) => Math.hypot(x - p.x, z - p.z) > p.r + 0.06) &&
  discs.every((d) => d.id === CUE || !d.on || Math.hypot(d.x - x, d.z - z) > R * 2 + 0.02);
/** The place nearest to a point where the cue ball may be put by hand, on the grid, or null when there is none close by. */
export function spotFor(state: State, x: number, z: number) {
  const snap = (v: number, half: number) => Math.round((Math.max(-half + R, Math.min(half - R, v)) + half) / GRID) * GRID - half,
    cx = snap(x, HALF_X),
    cz = snap(z, HALF_Z);
  // Rings of points round the one asked for, nearest first.
  for (let ring = 0; ring <= 30; ring++)
    for (let k = 0; k < (ring ? 16 : 1); k++) {
      const a = (k / 16) * Math.PI * 2,
        px = snap(cx + Math.cos(a) * ring * 0.05, HALF_X),
        pz = snap(cz + Math.sin(a) * ring * 0.05, HALF_Z);
      if (free(state.discs, px, pz)) return { x: px, z: pz };
    }
  return null;
}
const ball = (id: number, x: number, z: number): Disc => ({ id, x, z, vx: 0, vz: 0, r: R, m: 1, on: true });
export function createGame(): State {
  // The rack: five rows widening away from the breaker, the eight in the middle, a plain and a striped ball in the far corners.
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15],
    discs: Disc[] = [ball(CUE, HEAD.x, HEAD.z)],
    gap = R * 2 + 0.012;
  let n = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) discs.push(ball(order[n++], (k - row / 2) * gap, -2 - row * gap * 0.866));
  discs.sort((a, b) => a.id - b.id);
  return { discs, turn: 0, groups: null, winner: null, last: null, sunk: [], foul: false, hand: false, placed: false, ply: 0 };
}
/** The balls a side still has to pocket before the eight. */
export const left = (state: State, side: number) => (state.groups ? state.discs.filter((d) => d.on && kind(d.id) === state.groups![side]).length : 7);
/** The balls the mover may aim at now. */
export function targets(state: State) {
  const mine = state.groups ? state.groups[state.turn] : null,
    own = state.discs.filter((d) => d.on && kind(d.id) !== null && (mine === null || kind(d.id) === mine));
  return own.length ? own : state.discs.filter((d) => d.id === EIGHT && d.on);
}
/** Shots that send the cue ball at a ball so as to drive it toward a pocket. */
export function aimed(state: State): Move[] {
  const cue = state.discs[CUE],
    out: Move[] = [];
  for (const target of targets(state))
    for (const pocket of ARENA.pockets) {
      const dx = target.x - pocket.x,
        dz = target.z - pocket.z,
        d = Math.hypot(dx, dz),
        // Where the cue ball's middle must be when it meets the ball.
        gx = target.x + (dx / d) * R * 2,
        gz = target.z + (dz / d) * R * 2,
        degrees = (Math.atan2(gz - cue.z, gx - cue.x) * 180) / Math.PI,
        // A ball cannot be cut by more than a right angle.
        along = (gx - cue.x) * -dx + (gz - cue.z) * -dz;
      if (along <= 0) continue;
      for (const power of [7, 11, 15]) out.push({ from: CUE, to: shotCode(degrees, power), extra: -1 });
    }
  if (!out.length) out.push({ from: CUE, to: shotCode(270, 10), extra: -1 });
  return out;
}
export const moves = (state: State): Move[] => (state.winner !== null ? [] : aimed(state));
export function play(state: State, move: Move): State | null {
  const shot = shotOf(move.to),
    me = state.turn,
    other = (me ? 0 : 1) as 0 | 1,
    spot = move.to >= PLACE_BASE ? placeOf(move.to) : null;
  if (state.winner !== null || move.from !== CUE || move.extra !== -1) return null;
  if (spot) {
    // Ball in hand: the cue ball is set down, as often as wished, before it is struck.
    if (!state.hand || !free(state.discs, spot.x, spot.z)) return null;
    const discs = copy(state.discs);
    discs[CUE].x = spot.x;
    discs[CUE].z = spot.z;
    return { ...state, discs, placed: true, last: null, sunk: [] };
  }
  if (!shot) return null;
  const discs = copy(state.discs),
    from = { x: discs[CUE].x, z: discs[CUE].z },
    cleared = state.groups !== null && left(state, me) === 0;
  strike(discs[CUE], shot.angle, cueSpeed(shot.power));
  const { gone } = settle(discs, ARENA),
    foul = gone.includes(CUE),
    eight = gone.includes(EIGHT),
    balls = gone.filter((id) => kind(id) !== null);
  let groups = state.groups;
  // The first ball down, cleanly, decides who plays which kind.
  if (!groups && balls.length && !foul) groups = kind(balls[0]) === 0 ? (me === 0 ? [0, 1] : [1, 0]) : me === 0 ? [1, 0] : [0, 1];
  const own = balls.filter((id) => groups && kind(id) === groups[me]).length;
  if (foul) {
    // The cue ball comes back at the head of the table, clear of the others.
    const cue = discs[CUE];
    cue.on = true;
    for (let k = 0; k < 60; k++) {
      cue.x = HEAD.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;
      cue.z = HEAD.z;
      if (discs.every((d) => d === cue || !d.on || Math.hypot(d.x - cue.x, d.z - cue.z) > R * 2 + 0.01)) break;
    }
  }
  return {
    ...state,
    discs,
    groups,
    turn: !foul && own > 0 ? me : other,
    // The eight wins only after one's own seven, and never with the cue ball.
    winner: eight ? (cleared && !foul ? me : other) : null,
    last: { code: move.to, by: me, from },
    sunk: gone,
    foul,
    hand: foul && !eight,
    placed: false,
    ply: state.ply + 1,
  };
}
/** Where the computer would put the cue ball by hand: the place from which a straight shot does most. */
function handSpot(state: State) {
  const me = state.turn;
  let best: { x: number; z: number } | null = null,
    top = -Infinity;
  for (const target of targets(state))
    for (const pocket of ARENA.pockets) {
      const dx = target.x - pocket.x,
        dz = target.z - pocket.z,
        d = Math.hypot(dx, dz);
      for (const back of [1.1, 0.7]) {
        const x = target.x + (dx / d) * back,
          z = target.z + (dz / d) * back,
          spot = spotFor(state, x, z);
        if (!spot || Math.hypot(spot.x - x, spot.z - z) > 0.05) continue;
        const placed = play(state, { from: CUE, to: placeCode(spot.x, spot.z), extra: -1 }),
          degrees = (Math.atan2(-dz, -dx) * 180) / Math.PI,
          next = placed && play(placed, { from: CUE, to: shotCode(degrees, 9), extra: -1 });
        if (!next) continue;
        const mine = next.groups ? next.sunk.filter((id) => kind(id) === next.groups![me]).length : next.sunk.filter((id) => kind(id) !== null).length,
          score = mine * 10 - (next.foul ? 15 : 0) + (next.winner === me ? 100 : next.winner !== null ? -100 : 0) - d * 0.2;
        if (score > top) {
          top = score;
          best = spot;
        }
        break;
      }
    }
  return best;
}
/** The computer tries its aimed shots in its head and keeps the best; its cue is less sure at the lower levels. */
export function chooseShot(state: State, level: Level, random: Random = Math.random): Move | null {
  const me = state.turn;
  // With the ball in hand it is first set behind a ball, in line with a pocket (not at the easy level).
  if (state.hand && !state.placed && level !== "easy") {
    const spot = handSpot(state);
    if (spot) return { from: CUE, to: placeCode(spot.x, spot.z), extra: -1 };
  }
  let best: Move | null = null,
    top = -Infinity;
  for (const move of aimed(state)) {
    const next = play(state, move);
    if (!next) continue;
    const mine = next.groups ? next.sunk.filter((id) => kind(id) === next.groups![me]).length : 0,
      theirs = next.groups ? next.sunk.filter((id) => kind(id) === next.groups![me ? 0 : 1]).length : 0,
      score = mine * 10 - theirs * 4 - (next.foul ? 15 : 0) + (next.winner === me ? 100 : next.winner !== null ? -100 : 0) + random() * (level === "easy" ? 12 : 1);
    if (score > top) {
      top = score;
      best = move;
    }
  }
  if (!best) return null;
  const shot = shotOf(best.to)!,
    wobble = level === "easy" ? 4 : level === "normal" ? 1.5 : 0.4;
  return { ...best, to: shotCode(shot.degrees + (random() * 2 - 1) * wobble, shot.power) };
}
const effect = (state: State): Effect | null => (state.last ? { kind: "move", from: CUE, to: CUE, converted: [], removed: state.sunk } : null);
const NAMES = ["단색 (1–7)", "줄무늬 (9–15)"];
export const pool: PointGame<State> = {
  create: () => createGame(),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseShot,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.discs.map((d) => (d.on && s.groups ? (kind(d.id) === null ? null : s.groups[0] === kind(d.id) ? 0 : 1) : null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => left(s, player ? 0 : 1) - left(s, player),
  hint: (s) =>
    `${s.hand ? (s.placed ? "흰 공을 당겨서 치세요. 다른 곳을 누르면 다시 놓습니다. " : "흰 공이 빠졌습니다. 흰 공을 끌어 원하는 곳에 놓으세요. ") : ""}${!s.groups ? "아직 공이 정해지지 않았습니다. 아무 공이나 넣으세요." : left(s, s.turn) ? `내 공은 ${NAMES[s.groups[s.turn]]}입니다. 흰 공을 당겼다 놓아 치세요.` : "내 공을 다 넣었습니다. 검은 8번을 넣으면 이깁니다."}`,
  tally: (s) => [0, 1].map((p) => (s.groups ? `${NAMES[s.groups[p]]} · 남은 공 ${left(s, p)}` : "공 미정")) as [string, string],
  reason: (s) => {
    const loser = s.winner === 0 ? 1 : 0;
    return s.last?.by === loser ? (s.foul ? "8번과 함께 흰 공이 빠졌습니다." : "자기 공을 다 넣기 전에 8번을 넣었습니다.") : "자기 공을 모두 넣고 8번을 넣었습니다.";
  },
};
