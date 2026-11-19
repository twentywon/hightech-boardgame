import type { Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { HOLES, PAR, type P } from "./course";
import { aimedShot } from "./ai";
import { SPEED_MAX, SPEED_MIN, roll, type Result, type Shot } from "./sim";

/**
 * Mini golf on a course of nine holes, the usual way: each side plays a hole out, stroke by stroke, until its ball
 * is in the cup, then the next. A ball in a pond costs a stroke more and is played again from where it was hit. A
 * hole counts at most `MAX_STROKES`: a ball not in after that many is picked up. The lowest total after nine holes
 * wins; one person may play alone, against the course's par.
 *
 * Two sides play each hole one after the other; the side that took fewer strokes on the hole before goes first (the
 * honour), and with a tie the order stays.
 *
 * A putt is one move: its direction and speed (`to`) and the moment it was struck at, as the windmill's sails stood
 * (`extra`). `play` rolls it through the hole's physics (`sim.ts`) and records where the ball ended; the view runs
 * the same physics to show it.
 */
export const MAX_STROKES = 8,
  /** A putt is a move from the ball (0) to `SHOT + angle × 1000 + speed`, struck at the sails' phase `extra` (thousandths). */
  SHOT = 1000,
  ANGLES = 3600,
  SPEEDS = 999;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The move for a putt, rounded to the steps a move can say. */
export function shotMove(s: Shot): Move {
  const turn = ((s.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
    angle = Math.round((turn / (2 * Math.PI)) * ANGLES) % ANGLES,
    speed = clamp(Math.round(((s.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * SPEEDS), 0, SPEEDS),
    phase = ((Math.round(s.phase * 1000) % 1000) + 1000) % 1000;
  return { from: 0, to: SHOT + angle * 1000 + speed, extra: phase };
}
/** The putt a move says, or null when it is none. */
export function shotOf(move: Move): Shot | null {
  const code = move.to - SHOT,
    angle = Math.floor(code / 1000),
    speed = code % 1000;
  if (move.from !== 0 || !Number.isInteger(move.to) || code < 0 || angle >= ANGLES || speed > SPEEDS) return null;
  if (!Number.isInteger(move.extra) || move.extra < 0 || move.extra > 999) return null;
  return { angle: (angle / ANGLES) * 2 * Math.PI, speed: SPEED_MIN + (speed / SPEEDS) * (SPEED_MAX - SPEED_MIN), phase: move.extra / 1000 };
}
export interface Last {
  side: 0 | 1;
  hole: number;
  move: Move;
  /** Where the ball was hit from, and where it ended (in the cup, at rest, or where it went into the water). */
  from: P;
  end: P;
  result: Result;
  /** The side's strokes on the hole after this one, penalty included. */
  strokes: number;
  /** The hole is over for this side: holed, or picked up after the last stroke allowed. */
  done: boolean;
  picked: boolean;
}
export interface State {
  /** Two sides, or one person alone against par. */
  two: boolean;
  hole: number;
  /** Who plays the hole first and who second, and which of them is playing it now. */
  order: [0 | 1, 0 | 1];
  seat: 0 | 1;
  turn: 0 | 1;
  /** Where the ball of the side to play lies. */
  ball: P;
  /** Strokes taken on this hole by the side to play. */
  strokes: number;
  /** Each side's count on each hole played out (null before). */
  cards: [(number | null)[], (number | null)[]];
  last: Last | null;
  winner: Winner;
  ply: number;
}
const tee = (hole: number): P => ({ ...HOLES[hole].tee });
export function createGame(two = true): State {
  return {
    two,
    hole: 0,
    order: [0, 1],
    seat: 0,
    turn: 0,
    ball: tee(0),
    strokes: 0,
    cards: [HOLES.map(() => null), HOLES.map(() => null)],
    last: null,
    winner: null,
    ply: 0,
  };
}
/** A side's strokes over the holes it has played out. */
export const total = (card: (number | null)[]) => card.reduce<number>((sum, n) => sum + (n ?? 0), 0);
/** The par of the holes a side has played out, to set its total against. */
export const parPlayed = (card: (number | null)[]) => card.reduce<number>((sum, n, k) => sum + (n === null ? 0 : HOLES[k].par), 0);
/** Records a putt that ended so, and moves on to the next stroke, side or hole. */
export function record(state: State, end: { x: number; z: number; result: Result }, move: Move): State {
  const side = state.turn,
    holed = end.result === "cup",
    lost = end.result === "water" || end.result === "out";
  // In the water: a stroke's penalty, and the ball back where it was.
  let strokes = state.strokes + 1 + (lost ? 1 : 0);
  const ball = lost ? { ...state.ball } : { x: end.x, z: end.z },
    done = holed || strokes >= MAX_STROKES,
    picked = !holed && done;
  strokes = Math.min(strokes, MAX_STROKES);
  const cards: State["cards"] = [[...state.cards[0]], [...state.cards[1]]];
  if (done) cards[side][state.hole] = strokes;
  const last: Last = { side, hole: state.hole, move, from: { ...state.ball }, end: { x: end.x, z: end.z }, result: end.result, strokes, done, picked };
  const next: State = { ...state, cards, last, ply: state.ply + 1 };
  if (!done) return { ...next, ball, strokes };
  // The other side plays the hole now.
  if (state.two && state.seat === 0) return { ...next, seat: 1, turn: state.order[1], ball: tee(state.hole), strokes: 0 };
  // Every side has played the hole: on to the next, or the end.
  if (state.hole === HOLES.length - 1) {
    const a = total(cards[0]),
      b = total(cards[1]);
    return { ...next, strokes, ball, winner: !state.two ? 0 : a < b ? 0 : b < a ? 1 : "draw" };
  }
  const k = state.hole,
    a = cards[0][k] ?? 0,
    b = cards[1][k] ?? 0,
    order: [0 | 1, 0 | 1] = !state.two ? [0, 1] : a < b ? [0, 1] : b < a ? [1, 0] : state.order;
  return { ...next, hole: k + 1, order, seat: 0, turn: order[0], ball: tee(k + 1), strokes: 0 };
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  // A few putts stand for every one the hand can make.
  return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) => shotMove({ angle, speed: 1.5, phase: 0 }));
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null) return null;
  const shot = shotOf(move);
  if (!shot) return null;
  return record(state, roll(HOLES[state.hole], state.ball, shot), move);
}
/** The computer's putt: planned through the same physics, made by a hand as steady as its level. */
export function chooseMove(state: State, level: Level, random: Random = Math.random): Move | null {
  if (state.winner !== null) return null;
  return shotMove(aimedShot(HOLES[state.hole], state.ball, level, random));
}
/** A count against par, as a golfer says it: "+2", "−1", "E". */
export const toPar = (strokes: number, par: number) => (strokes === par ? "E" : strokes > par ? `+${strokes - par}` : `−${par - strokes}`);
const effect = (): Effect | null => null;
export const minigolf: PointGame<State> = {
  create: (variant) => createGame(variant !== "solo"),
  moves,
  play: (state, move) => play(state, move),
  choose: (state, level, random) => chooseMove(state, level, random),
  turn: (state) => state.turn,
  winner: (state) => state.winner,
  owners: () => [],
  effect,
  ply: (state) => state.ply,
  evaluate: (state, player) => total(state.cards[1 - player]) - total(state.cards[player]),
  // How to putt is told before the first stroke; after that, where the round stands.
  hint: (state) =>
    `${state.hole + 1}번 홀 · 파 ${HOLES[state.hole].par} · ${state.strokes + 1}타째${state.ply === 0 ? " — 공을 누른 채 뒤로 당겼다 놓으세요." : ""}`,
  tally: (state) => [`${total(state.cards[0])}타`, `${total(state.cards[1])}타`],
  reason: (state) => {
    const a = total(state.cards[0]),
      b = total(state.cards[1]);
    if (!state.two) {
      const over = a - PAR;
      return `${a}타로 아홉 홀을 마쳤습니다. ${over === 0 ? `파 ${PAR}와 같습니다.` : over > 0 ? `파 ${PAR}보다 ${over}타 많습니다.` : `파 ${PAR}보다 ${-over}타 적습니다!`}`;
    }
    return state.winner === "draw" ? `${a}타로 같습니다.` : `${a}타 대 ${b}타입니다.`;
  },
};
