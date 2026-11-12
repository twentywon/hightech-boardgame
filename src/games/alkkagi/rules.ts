import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { copy, settle, shotCode, shotOf, speedOf, strike, type Arena, type Disc } from "../flick/physics";

/**
 * Alkkagi: stones are flicked with a finger to knock the other side's off
 * the board. A stone that leaves the board is lost, the flicked one too.
 * Whoever has stones left when the other has none wins.
 * With go stones each side first sets its stones on the lines of its own
 * half; with janggi pieces they stand where a game of janggi begins.
 */
export type Mode = "go" | "janggi";
export const GO = 19,
  GO_STEP = 0.5,
  /** The point of the tool that sets the remaining stones in a row. */
  LAY_ROW = 400;
export interface State {
  mode: Mode;
  phase: "place" | "play";
  discs: Disc[];
  owners: (0 | 1)[];
  /** What is written on a janggi piece; empty for go stones. */
  labels: string[];
  /** Stones each side still has to set down. */
  toPlace: [number, number];
  turn: 0 | 1;
  winner: Winner;
  last: { disc: number; code: number } | null;
  /** The stones the last shot sent off. */
  lost: number[];
  ply: number;
}
/** A janggi board folds in the middle: its two hinges stand up from the fold and stop a stone. */
export const HINGES = [-2.5, 2.5];
export const arenaOf = (mode: Mode): Arena =>
  mode === "go"
    ? { halfX: 4.8, halfZ: 4.8, cushions: false, pockets: [], friction: 7, bounce: 0.9 }
    : { halfX: 4.55, halfZ: 5.05, cushions: false, pockets: [], friction: 10.5, bounce: 0.9, posts: HINGES.flatMap((x) => [-0.26, 0, 0.26].map((dx) => ({ x: x + dx, z: 0, r: 0.13 }))) };
/** Where a line crossing of the go board lies. */
export const goPoint = (point: number) => ({ x: ((point % GO) - 9) * GO_STEP, z: (Math.floor(point / GO) - 9) * GO_STEP });
const disc = (id: number, x: number, z: number, r: number, m: number): Disc => ({ id, x, z, vx: 0, vz: 0, r, m, on: true });
/** The pieces of janggi at their starting places: [label, file, rank from its own back row, radius, mass]. */
const JANGGI: [string, number, number, number, number][] = [
  ["車", 0, 0, 0.31, 1.5], ["馬", 1, 0, 0.31, 1.5], ["象", 2, 0, 0.31, 1.5], ["士", 3, 0, 0.24, 0.9],
  ["士", 5, 0, 0.24, 0.9], ["象", 6, 0, 0.31, 1.5], ["馬", 7, 0, 0.31, 1.5], ["車", 8, 0, 0.31, 1.5],
  ["將", 4, 1, 0.4, 2.4], ["包", 1, 2, 0.31, 1.5], ["包", 7, 2, 0.31, 1.5],
  ["卒", 0, 3, 0.24, 0.9], ["卒", 2, 3, 0.24, 0.9], ["卒", 4, 3, 0.24, 0.9], ["卒", 6, 3, 0.24, 0.9], ["卒", 8, 3, 0.24, 0.9],
];
export function createGame(variant = "go-5"): State {
  const base = { turn: 0 as const, winner: null, last: null, lost: [], ply: 0 };
  if (variant === "janggi") {
    const discs: Disc[] = [],
      owners: (0 | 1)[] = [],
      labels: string[] = [];
    for (const side of [0, 1] as const)
      for (const [label, file, rank, r, m] of JANGGI) {
        // Cho (side 0) stands on the near ranks, Han on the far ones.
        discs.push(disc(discs.length, file - 4, side === 0 ? 4.5 - rank : rank - 4.5, r, m));
        owners.push(side);
        labels.push(label === "將" ? (side ? "漢" : "楚") : label === "卒" && side ? "兵" : label);
      }
    return { ...base, mode: "janggi", phase: "play", discs, owners, labels, toPlace: [0, 0] };
  }
  const count = Math.max(1, Math.min(10, Number(variant.split("-")[1]) || 5));
  return { ...base, mode: "go", phase: "place", discs: [], owners: [], labels: [], toPlace: [count, count] };
}
/** The crossings a side may still set a stone on: its own half, the middle line left free. */
function free(state: State, side: number) {
  const taken = new Set(state.discs.map((d) => Math.round(d.z / GO_STEP + 9) * GO + Math.round(d.x / GO_STEP + 9))),
    out: number[] = [];
  for (let point = 0; point < GO * GO; point++) {
    const row = Math.floor(point / GO);
    if ((side === 0 ? row >= 10 : row <= 8) && !taken.has(point)) out.push(point);
  }
  return out;
}
/** A row for the stones still to be set: two lines apart, in the middle of the side's half. */
function rowFor(state: State, side: number) {
  const open = new Set(free(state, side)),
    n = state.toPlace[side],
    out: number[] = [];
  for (const row of side === 0 ? [13, 15, 11, 17] : [5, 3, 7, 1])
    for (let i = 0; i < 10 && out.length < n; i++) {
      // From the middle outward: 9, 7, 11, 5, 13, …
      const col = 9 + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 2,
        point = row * GO + col;
      if (open.has(point)) out.push(point);
    }
  return out;
}
/** Shots aimed from each of the mover's stones at each of the other side's, at a few strengths. */
export function aimed(state: State): Move[] {
  const out: Move[] = [];
  state.discs.forEach((from) => {
    if (!from.on || state.owners[from.id] !== state.turn) return;
    state.discs.forEach((to) => {
      if (!to.on || state.owners[to.id] === state.turn) return;
      const degrees = (Math.atan2(to.z - from.z, to.x - from.x) * 180) / Math.PI;
      for (const power of [7, 11, 15, 20]) out.push({ from: from.id, to: shotCode(degrees, power), extra: -1 });
    });
  });
  return out;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  if (state.phase === "place") return [...free(state, state.turn).map((to) => ({ from: -1, to, extra: -1 })), { from: -1, to: LAY_ROW, extra: -1 }];
  return aimed(state);
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const me = state.turn,
    other = (me ? 0 : 1) as 0 | 1;
  if (state.phase === "place") {
    if (move.from !== -1) return null;
    const points = move.to === LAY_ROW ? rowFor(state, me) : free(state, me).includes(move.to) ? [move.to] : [];
    if (!points.length) return null;
    const discs = copy(state.discs),
      owners = state.owners.slice(),
      toPlace: [number, number] = [state.toPlace[0], state.toPlace[1]];
    for (const point of points) {
      discs.push(disc(discs.length, goPoint(point).x, goPoint(point).z, 0.235, 1));
      owners.push(me);
      toPlace[me]--;
    }
    // Each side sets all its stones, then the first shot is side 0's.
    const done = toPlace[me] === 0;
    return { ...state, discs, owners, labels: discs.map(() => ""), toPlace, turn: done ? other : me, phase: done && toPlace[other] === 0 ? "play" : "place" };
  }
  const shot = shotOf(move.to),
    mine = state.discs[move.from];
  if (!shot || !mine || !mine.on || state.owners[move.from] !== me) return null;
  const discs = copy(state.discs);
  strike(discs[move.from], shot.angle, speedOf(shot.power));
  const { gone } = settle(discs, arenaOf(state.mode)),
    left = [0, 1].map((side) => discs.filter((d) => d.on && state.owners[d.id] === side).length);
  return {
    ...state,
    discs,
    turn: other,
    last: { disc: move.from, code: move.to },
    lost: gone,
    ply: state.ply + 1,
    winner: left[0] && left[1] ? null : left[0] ? 0 : left[1] ? 1 : "draw",
  };
}
/** The computer's move: it tries the aimed shots in its head and keeps the one that clears most for least. */
export function chooseShot(state: State, level: Level, random: Random = Math.random): Move | null {
  if (state.winner !== null) return null;
  if (state.phase === "place") {
    // Spread out, away from its own stones.
    const open = free(state, state.turn),
      own = state.discs.filter((d) => state.owners[d.id] === state.turn),
      apart = open.filter((point) => {
        const row = Math.floor(point / GO),
          col = point % GO;
        return row >= 2 && row <= 16 && col >= 2 && col <= 16 && own.every((d) => Math.hypot(d.x - goPoint(point).x, d.z - goPoint(point).z) >= 1.4);
      }),
      pool = apart.length ? apart : open;
    return { from: -1, to: pool[Math.floor(random() * pool.length)], extra: -1 };
  }
  const me = state.turn,
    wobble = level === "easy" ? 9 : level === "normal" ? 3.5 : 0.8;
  let best: Move | null = null,
    top = -Infinity;
  for (const move of aimed(state)) {
    const next = play(state, move)!,
      knocked = next.lost.filter((id) => state.owners[id] !== me).length,
      wasted = next.lost.filter((id) => state.owners[id] === me).length,
      // Stones left near an edge are easy prey next turn.
      exposed = next.discs.filter((d) => d.on && state.owners[d.id] === me && Math.max(Math.abs(d.x), Math.abs(d.z)) > 3.9).length,
      score = knocked * 10 - wasted * 11 - exposed * 1.5 + (next.winner === me ? 100 : 0) + random() * (level === "easy" ? 12 : 1);
    if (score > top) {
      top = score;
      best = move;
    }
  }
  if (!best) return null;
  // The finger is not as sure as the eye.
  const shot = shotOf(best.to)!;
  return { ...best, to: shotCode(shot.degrees + (random() * 2 - 1) * wobble, shot.power) };
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: "move", from: state.last.disc, to: state.last.disc, converted: [], removed: state.lost } : null;
const alive = (state: State, side: number) => state.discs.filter((d) => d.on && state.owners[d.id] === side).length;
export const alkkagi: PointGame<State> = {
  create: (variant) => createGame(variant || "go-5"),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseShot,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  // In play the points are the stones themselves.
  owners: (s) => (s.phase === "play" ? s.discs.map((d) => (d.on ? s.owners[d.id] : null)) : Array(GO * GO).fill(null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => alive(s, player) - alive(s, player ? 0 : 1),
  hint: (s) =>
    s.phase === "place"
      ? `내 쪽 절반의 선 위에 알을 놓으세요 (남은 ${s.toPlace[s.turn]}개).`
      : "내 알을 누른 채 뒤로 당겼다 놓아 튕기세요.",
  tally: (s) => (s.phase === "place" ? (s.toPlace.map((n) => `놓을 알 ${n}개`) as [string, string]) : ([0, 1].map((p) => `남은 알 ${alive(s, p)}개`) as [string, string])),
  reason: (s) => (s.winner === "draw" ? "두 사람의 알이 함께 모두 떨어졌습니다." : "상대 알을 모두 판 밖으로 내보냈습니다."),
};
