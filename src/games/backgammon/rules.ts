import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Backgammon for two, without the doubling cube. Each side brings fifteen
 * checkers round the 24 points into its home board and bears them off. Two
 * dice say how far; doubles are played four times; as much of a roll as can
 * be played must be played (and the larger die when only one can). A lone
 * checker (a blot) landed on goes to the bar and must come in again before
 * anything else moves; a point held by two or more is closed. A win is a
 * gammon (2) when the loser has borne nothing off, a backgammon (3) when the
 * loser still has a checker on the bar or in the winner's home board.
 *
 * Points are 0–23 for the board's points 1–24 as side 0 counts them: side 0
 * moves down toward 0 and its home is 0–5; side 1 moves up and its home is
 * 18–23. `BAR` and `OFF` are the points of the bar and of bearing off.
 */
export const BAR = 24,
  OFF = 25,
  /** The point of the dice, tapped to throw. */
  ROLL = 26;
export interface State {
  /** How many checkers each side has on each point. */
  points: [number[], number[]];
  bar: [number, number];
  off: [number, number];
  turn: 0 | 1;
  phase: "roll" | "move";
  /** The dice thrown, and those still to be played. */
  dice: number[];
  left: number[];
  last: { side: 0 | 1; from: number; to: number; hit: boolean; rolled: boolean } | null;
  winner: Winner;
  /** What the win is worth: 1, 2 for a gammon, 3 for a backgammon. */
  stake: number;
  ply: number;
}
export function createGame(): State {
  const points: [number[], number[]] = [new Array(24).fill(0), new Array(24).fill(0)];
  // Side 0: two on its 24-point, five on its 13, three on its 8, five on its 6.
  for (const [p, n] of [[23, 2], [12, 5], [7, 3], [5, 5]]) {
    points[0][p] = n;
    points[1][23 - p] = n;
  }
  return { points, bar: [0, 0], off: [0, 0], turn: 0, phase: "roll", dice: [], left: [], last: null, winner: null, stake: 1, ply: 0 };
}
const dir = (side: number) => (side === 0 ? -1 : 1);
/** How far a checker of `side` still has to go from point `p` (25 from the bar). */
const distanceOf = (side: number, p: number) => (p === BAR ? 25 : side === 0 ? p + 1 : 24 - p);
const home = (side: number, p: number) => (side === 0 ? p <= 5 : p >= 18);
const allHome = (s: State, side: number) => s.bar[side] === 0 && s.points[side].every((n, p) => n === 0 || home(side, p));
/** The single steps a die allows: [from, to]. */
function steps(s: State, side: 0 | 1, die: number): [number, number][] {
  const other = 1 - side,
    out: [number, number][] = [],
    open = (p: number) => s.points[other][p] < 2;
  if (s.bar[side] > 0) {
    const to = side === 0 ? 24 - die : die - 1;
    return open(to) ? [[BAR, to]] : [];
  }
  const bearing = allHome(s, side);
  for (let p = 0; p < 24; p++) {
    if (!s.points[side][p]) continue;
    const to = p + dir(side) * die;
    if (to >= 0 && to < 24) {
      if (open(to)) out.push([p, to]);
    } else if (bearing) {
      const need = distanceOf(side, p);
      // Exactly, or with a larger die from the farthest checker.
      const farther = s.points[side].some((n, q) => n > 0 && distanceOf(side, q) > need);
      if (die === need || (die > need && !farther)) out.push([p, OFF]);
    }
  }
  return out;
}
/** The position after one checker moves (a blot hit goes to the bar). */
function apply(s: State, side: 0 | 1, from: number, to: number): State {
  const points: [number[], number[]] = [s.points[0].slice(), s.points[1].slice()],
    bar: [number, number] = [s.bar[0], s.bar[1]],
    off: [number, number] = [s.off[0], s.off[1]],
    other = (1 - side) as 0 | 1;
  if (from === BAR) bar[side]--;
  else points[side][from]--;
  let hit = false;
  if (to === OFF) off[side]++;
  else {
    if (points[other][to] === 1) {
      points[other][to] = 0;
      bar[other]++;
      hit = true;
    }
    points[side][to]++;
  }
  return { ...s, points, bar, off, last: { side, from, to, hit, rolled: false } };
}
/** Every way of playing the dice left as far as it goes: sequences of [from, to, die]. */
function sequences(s: State, side: 0 | 1, dice: number[]): [number, number, number][][] {
  if (!dice.length) return [[]];
  const out: [number, number, number][][] = [],
    tried = new Set<number>();
  for (let i = 0; i < dice.length; i++) {
    const die = dice[i];
    if (tried.has(die)) continue;
    tried.add(die);
    const rest = [...dice.slice(0, i), ...dice.slice(i + 1)];
    for (const [from, to] of steps(s, side, die)) for (const tail of sequences(apply(s, side, from, to), side, rest)) out.push([[from, to, die], ...tail]);
  }
  return out.length ? out : [[]];
}
/** The sequences that play as much of the roll as can be played (the larger die when only one can be). */
export function plays(s: State): [number, number, number][][] {
  if (s.phase !== "move" || s.winner !== null) return [];
  const all = sequences(s, s.turn, s.left),
    most = Math.max(...all.map((q) => q.length));
  let best = all.filter((q) => q.length === most);
  if (most === 1 && s.left.length === 2 && s.left[0] !== s.left[1]) {
    const high = Math.max(...best.map((q) => q[0][2]));
    best = best.filter((q) => q[0][2] === high);
  }
  return most ? best : [];
}
export function moves(s: State): Move[] {
  if (s.winner !== null) return [];
  if (s.phase === "roll") return [{ from: -1, to: ROLL, extra: -1 }];
  const seen = new Set<string>(),
    out: Move[] = [];
  for (const q of plays(s)) {
    const [from, to] = q[0],
      key = `${from}>${to}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ from, to, extra: -1 });
    }
  }
  return out;
}
/** The die a first step uses: the one its distance needs, or the smallest that bears off. */
function dieFor(s: State, from: number, to: number) {
  const legal = plays(s).filter((q) => q[0][0] === from && q[0][1] === to).map((q) => q[0][2]);
  return legal.length ? Math.min(...legal) : null;
}
function endTurn(s: State): State {
  return { ...s, phase: "roll", left: [], turn: (1 - s.turn) as 0 | 1 };
}
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (state.winner !== null || move.extra !== -1) return null;
  const side = state.turn;
  if (state.phase === "roll") {
    if (move.to !== ROLL) return null;
    const a = 1 + (Math.floor(random() * 6) % 6),
      b = 1 + (Math.floor(random() * 6) % 6),
      dice = [a, b],
      thrown: State = { ...state, phase: "move", dice, left: a === b ? [a, a, a, a] : [a, b], ply: state.ply + 1, last: { side, from: -1, to: -1, hit: false, rolled: true } };
    // Nothing can be played: the dice pass on.
    return plays(thrown).length ? thrown : endTurn(thrown);
  }
  const die = dieFor(state, move.from, move.to);
  if (die === null) return null;
  let next = apply(state, side, move.from, move.to);
  const left = [...state.left];
  left.splice(left.indexOf(die), 1);
  next = { ...next, left, ply: state.ply + 1 };
  if (next.off[side] === 15) {
    const other = 1 - side,
      // The loser has borne nothing off: a gammon; and with a checker on the bar or in the winner's home, a backgammon.
      caught = next.bar[other] > 0 || next.points[other].some((n, p) => n > 0 && home(side, p)),
      stake = next.off[other] > 0 ? 1 : caught ? 3 : 2;
    return { ...next, winner: side, stake, phase: "roll", left: [] };
  }
  return left.length && plays(next).length ? next : endTurn(next);
}
/** The pips a side still has to travel. */
export const pips = (s: State, side: number) => s.bar[side] * 25 + s.points[side].reduce((n, c, p) => n + c * distanceOf(side, p), 0);
/** How a position looks to `side`: the race, its blots in reach of the other side, the points it holds at home and in a row. */
export function judge(s: State, side: 0 | 1) {
  const other = (1 - side) as 0 | 1,
    race = pips(s, other) - pips(s, side);
  let blots = 0,
    made = 0,
    prime = 0,
    run = 0;
  for (let p = 0; p < 24; p++) {
    const n = s.points[side][p];
    if (n === 1) {
      // A blot the other side's checkers behind it (or on the bar) can reach with one die or two.
      const shooters = s.points[other].reduce((k, c, q) => k + (c > 0 && (q - p) * dir(other) < 0 && Math.abs(q - p) <= 12 ? 1 : 0), 0) + (s.bar[other] ? 1 : 0);
      if (shooters) blots += home(other, p) ? 1.5 : 1;
    }
    if (n >= 2) {
      made += home(side, p) ? 1.6 : 0.8;
      run++;
      prime = Math.max(prime, run);
    } else run = 0;
  }
  return race * 0.12 + made * 1.4 + prime * 1.1 - blots * 1.8 + s.off[side] * 1.5 + s.bar[other] * 3 - s.bar[side] * 3;
}
/** The computer's next checker: the first step of the play of its whole roll that leaves the best position. */
export function chooseMove(s: State, level: Level, random: Random = Math.random): Move | null {
  if (s.phase === "roll") return { from: -1, to: ROLL, extra: -1 };
  const all = plays(s);
  if (!all.length) return null;
  let best = all[0],
    top = -Infinity;
  for (const q of all) {
    let t = s;
    for (const [from, to] of q) t = apply(t, s.turn, from, to);
    const score = judge(t, s.turn) + random() * (level === "easy" ? 6 : 0.05);
    if (score > top) {
      top = score;
      best = q;
    }
  }
  return { from: best[0][0], to: best[0][1], extra: -1 };
}
const effect = (s: State): Effect | null => (s.last && !s.last.rolled ? { kind: "move", from: s.last.from, to: s.last.to, converted: [], removed: [] } : null);
export const backgammon: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => judge(s, player),
  hint: (s) =>
    s.phase === "roll"
      ? "주사위를 굴리세요."
      : s.bar[s.turn]
        ? `${s.left.join(", ")} — 바에 있는 말부터 들여보내세요.`
        : `${s.left.join(", ")} — 움직일 말을 고르세요.`,
  tally: (s) => [0, 1].map((p) => `남은 거리 ${pips(s, p)} · 나간 말 ${s.off[p]}`) as [string, string],
  reason: (s) => (s.stake === 3 ? "백개먼! 세 배로 이겼습니다." : s.stake === 2 ? "개먼! 두 배로 이겼습니다." : "말 열다섯 개를 모두 내보냈습니다."),
};
