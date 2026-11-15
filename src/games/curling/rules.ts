import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";
import { copy, settle, shotCode, shotOf, strike, type Arena, type Disc } from "../flick/physics";

/**
 * Curling on a short sheet of ice seen from the side: the hack at the left,
 * the house at the right. Each end both sides slide four stones in turn,
 * pulled back and let go like the other flicked games, with a turn that
 * makes a stone curl as it slows. A stone must cross the hog line and stay
 * short of the back line and on the sheet. When all eight have been played,
 * the side with the stone nearest the button scores one for every stone of
 * its own nearer than the other side's nearest, inside the house. Four ends;
 * the side that scores throws first in the next end, so the other has the
 * last stone (the hammer).
 */
export const STONES = 4,
  ENDS = 4,
  R = 0.17,
  HACK = { x: -6.6, z: 0 },
  HOG = 1.6,
  TEE = 4.6,
  BACK = 6.0,
  HOUSE = 1.4,
  /** The stone at the hack is the point a pull begins on; the turn is a tool. */
  STONE = 100,
  SPIN = 300;
export const ARENA: Arena = { halfX: 7.2, halfZ: 1.75, cushions: false, pockets: [], friction: 0.42, bounce: 0.85 };
/** How fast a stone leaves the hack for a strength of 1–20, and how much it curls for each turn (none, clockwise, counter). */
/** It is set so that the distance it slides grows evenly with the strength: 11 to 15 stop in the house, harder clears it. */
export const speedOf = (power: number) => Math.sqrt(2 * 0.42 * (3 + power * 0.62));
export const CURL = [0, -0.05, 0.05];
export interface State {
  /** Stones on the ice this end (id: side × 4 + k). */
  stones: Disc[];
  /** Stones each side has thrown this end. */
  thrown: [number, number];
  end: number;
  /** Points each side made in each end so far. */
  scores: [number[], number[]];
  /** The side with the last stone this end. */
  hammer: 0 | 1;
  turn: 0 | 1;
  /** The turn the side to throw has chosen: 0 none, 1 clockwise, 2 counter-clockwise. */
  spin: number;
  /** The end has been scored and its stones still lie as they stopped, until the next stone is thrown. */
  done: boolean;
  last: { side: 0 | 1; id: number; code: number; spin: number; points: [number, number] | null } | null;
  winner: Winner;
  ply: number;
}
export function createGame(): State {
  return { stones: [], thrown: [0, 0], end: 1, scores: [[], []], hammer: 1, turn: 0, spin: 0, done: false, last: null, winner: null, ply: 0 };
}
const total = (s: State, side: number) => s.scores[side].reduce((n, p) => n + p, 0);
const toButton = (d: Disc) => Math.hypot(d.x - TEE, d.z);
/** Who scores how many with the stones as they lie. */
export function count(stones: Disc[]): [number, number] {
  const inside = stones.filter((d) => d.on && toButton(d) - R <= HOUSE).sort((a, b) => toButton(a) - toButton(b));
  if (!inside.length) return [0, 0];
  const side = Math.floor(inside[0].id / STONES),
    rival = inside.find((d) => Math.floor(d.id / STONES) !== side),
    n = inside.filter((d) => Math.floor(d.id / STONES) === side && (!rival || toButton(d) < toButton(rival))).length;
  return side === 0 ? [n, 0] : [0, n];
}
/** The stones of an end with one more slid from the hack: they come to rest, and those out of play are taken off. */
export function slide(stones: Disc[], id: number, degrees: number, power: number, spin: number) {
  const discs = copy(stones),
    stone: Disc = { id, x: HACK.x, z: HACK.z, vx: 0, vz: 0, r: R, m: 1, on: true, curl: CURL[spin] || undefined };
  strike(stone, (degrees * Math.PI) / 180, speedOf(power));
  discs.push(stone);
  return discs;
}
export function rest(discs: Disc[], thrown: number) {
  settle(discs, ARENA);
  // Short of the hog line (the stone just thrown), past the back line, or off the sheet: out of play.
  return discs.filter((d) => d.on && d.x - R <= BACK && !(d.id === thrown && d.x - R <= HOG)).map((d) => ({ ...d, curl: undefined }));
}
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  // A few shots stand for every pull of the stone at the hack; the turn is chosen first.
  return [{ from: -1, to: SPIN, extra: -1 }, ...[11, 13, 18].map((power) => ({ from: STONE, to: shotCode(0, power), extra: -1 }))];
}
export function play(s: State, move: Move): State | null {
  if (s.winner !== null || move.extra !== -1) return null;
  if (move.to === SPIN) return { ...s, spin: (s.spin + 1) % 3 };
  const shot = shotOf(move.to);
  if (!shot || move.from !== STONE) return null;
  const side = s.turn,
    base = s.done ? { ...s, stones: [], thrown: [0, 0] as [number, number], done: false } : s,
    id = side * STONES + base.thrown[side],
    stones = rest(slide(base.stones, id, shot.degrees, shot.power, s.spin), id),
    thrown: [number, number] = [base.thrown[0], base.thrown[1]];
  thrown[side]++;
  let next: State = { ...base, stones, thrown, spin: 0, ply: s.ply + 1, last: { side, id, code: move.to, spin: s.spin, points: null } };
  if (thrown[0] + thrown[1] < 2 * STONES) {
    // The side without the hammer throws first; then by turns.
    return { ...next, turn: (1 - side) as 0 | 1 };
  }
  const points = count(stones),
    scores: [number[], number[]] = [[...s.scores[0], points[0]], [...s.scores[1], points[1]]],
    scorer = points[0] ? 0 : points[1] ? 1 : null,
    // The side that scores throws first next end: the other has the hammer. A blank end leaves it where it was.
    hammer = scorer === null ? s.hammer : ((1 - scorer) as 0 | 1);
  next = { ...next, scores, done: true, hammer, last: { ...next.last!, points }, end: s.end + 1, turn: (1 - hammer) as 0 | 1 };
  if (s.end >= ENDS) {
    const a = scores[0].reduce((n, p) => n + p, 0),
      b = scores[1].reduce((n, p) => n + p, 0);
    return { ...next, end: s.end, winner: a > b ? 0 : b > a ? 1 : "draw" };
  }
  return next;
}
/** How an end looks to `side` as the stones lie: the score it would make, and how near its best stone is. */
function judge(stones: Disc[], side: number) {
  const [a, b] = count(stones),
    mine = side === 0 ? a - b : b - a,
    best = (who: number) => Math.min(9, ...stones.filter((d) => Math.floor(d.id / STONES) === who).map(toButton));
  return mine * 3 + (best(1 - side) - best(side)) * 0.8;
}
/**
 * The computer's stone: shots at a spread of strengths, slight angles and both turns are slid with the same
 * physics, and the one that leaves the end best is played, with a hand that is less steady at the easier levels.
 */
export function chooseMove(s: State, level: Level, random: Random = Math.random): Move | null {
  if (s.winner !== null) return null;
  const side = s.turn,
    base = s.done ? [] : s.stones,
    thrown = s.done ? 0 : s.thrown[side],
    id = side * STONES + thrown;
  let best = { degrees: 0, power: 9, spin: 0 },
    top = -Infinity;
  for (const spin of [0, 1, 2])
    for (let power = 9; power <= 20; power++)
      for (const degrees of [-2.4, -1.6, -0.8, 0, 0.8, 1.6, 2.4]) {
        const stones = rest(slide(base, id, degrees, power, spin), id),
          value = judge(stones, side) + random() * 0.05;
        if (value > top) {
          top = value;
          best = { degrees, power, spin };
        }
      }
  // The hand shakes a little: more at the easy level.
  const shake = level === "easy" ? 1.6 : level === "normal" ? 0.6 : 0.2,
    degrees = Math.round(best.degrees + (random() - 0.5) * shake * 2),
    power = Math.max(1, Math.min(20, Math.round(best.power + (random() - 0.5) * shake * 1.5)));
  // The turn is set first (a move of its own), then the stone is slid.
  if (s.spin !== best.spin) return { from: -1, to: SPIN, extra: -1 };
  return { from: STONE, to: shotCode(degrees, power), extra: -1 };
}
const effect = (): Effect | null => null;
export const curling: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, p) => total(s, p) - total(s, 1 - p),
  hint: (s) => (s.turn === 0 ? `${s.end}엔드 · 스톤 ${(s.done ? 0 : s.thrown[0]) + 1}/${STONES} — 스톤을 뒤로 당겼다 놓아 미세요.` : `${s.end}엔드 · 컴퓨터 차례`),
  tally: (s) => [0, 1].map((p) => `${total(s, p)}점`) as [string, string],
  reason: (s) => (s.winner === "draw" ? `${ENDS}엔드를 마치고 같은 점수입니다.` : `${ENDS}엔드를 마치고 ${total(s, 0)} 대 ${total(s, 1)}입니다.`),
};
export const totals = (s: State) => [total(s, 0), total(s, 1)];
