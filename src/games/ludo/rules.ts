import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Ludo for two: four tokens each go once round the cross-shaped board and up
 * their own column to the middle. A six brings a token out of the yard and
 * earns another roll; a token landed on is sent back to its yard, except on
 * the marked safe squares. The middle is reached by an exact roll. First to
 * bring all four home wins.
 */
/** The 52 squares of the road, as column and row of a 15×15 grid, clockwise. */
export const ROAD: [number, number][] = [];
{
  const add = (c: number, r: number) => ROAD.push([c, r]);
  for (let c = 1; c <= 5; c++) add(c, 6);
  for (let r = 5; r >= 0; r--) add(6, r);
  add(7, 0);
  for (let r = 0; r <= 5; r++) add(8, r);
  for (let c = 9; c <= 14; c++) add(c, 6);
  add(14, 7);
  for (let c = 14; c >= 9; c--) add(c, 8);
  for (let r = 9; r <= 14; r++) add(8, r);
  add(7, 14);
  for (let r = 14; r >= 9; r--) add(6, r);
  for (let c = 5; c >= 0; c--) add(c, 8);
  add(0, 7);
  add(0, 6);
}
/** Where each side comes onto the road: side 0 at the near arm, side 1 at the far one. */
export const START = [39, 13],
  /** Squares where a token cannot be sent back: the four entries and the four stars. */
  SAFE = [0, 13, 26, 39, 8, 21, 34, 47],
  /** A token's way: 0–50 on the road, 51–55 up its own column, 56 home; -1 in the yard. */
  LAST_ROAD = 50,
  HOME = 56,
  YARD = -1,
  /** The point of the die; tokens are points 0–3 (side 0) and 4–7 (side 1). */
  ROLL = 8,
  DEST_BASE = 100;
export const roadSquare = (side: number, progress: number) => (START[side] + progress) % 52;
export interface State {
  tokens: [number[], number[]];
  turn: 0 | 1;
  phase: "roll" | "move";
  die: number;
  winner: Winner;
  /** What the last step was: a roll, or a token moved (with the tokens it sent back). */
  last: { side: 0 | 1; rolled: number; token: number; from: number; to: number; sent: number[] } | null;
  ply: number;
}
export const createGame = (): State => ({ tokens: [[YARD, YARD, YARD, YARD], [YARD, YARD, YARD, YARD]], turn: 0, phase: "roll", die: 1, winner: null, last: null, ply: 0 });
/** Where a token would be after the roll, or null when it cannot move by it. */
export function advance(progress: number, die: number) {
  if (progress === HOME) return null;
  if (progress === YARD) return die === 6 ? 0 : null;
  return progress + die <= HOME ? progress + die : null;
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  if (state.phase === "roll") return [{ from: -1, to: ROLL, extra: -1 }];
  const out: Move[] = [],
    seen = new Set<number>();
  state.tokens[state.turn].forEach((progress, k) => {
    const to = advance(progress, state.die);
    // Tokens waiting together in the yard are one choice.
    if (to === null || (progress === YARD && seen.has(YARD))) return;
    seen.add(progress);
    out.push({ from: state.turn * 4 + k, to: DEST_BASE + to, extra: -1 });
  });
  return out;
}
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const me = state.turn,
    other = (me ? 0 : 1) as 0 | 1;
  if (state.phase === "roll") {
    const die = 1 + Math.floor(random() * 6),
      rolled: State = { ...state, die, phase: "move", ply: state.ply + 1, last: { side: me, rolled: die, token: -1, from: 0, to: 0, sent: [] } };
    // Nothing can move: the roll is spent and the dice pass on.
    return moves(rolled).length ? rolled : { ...rolled, phase: "roll", turn: other };
  }
  const k = move.from - me * 4,
    from = state.tokens[me][k],
    to = move.to - DEST_BASE,
    tokens: [number[], number[]] = [state.tokens[0].slice(), state.tokens[1].slice()],
    sent: number[] = [];
  tokens[me][k] = to;
  if (to <= LAST_ROAD && !SAFE.includes(roadSquare(me, to)))
    tokens[other].forEach((progress, j) => {
      if (progress >= 0 && progress <= LAST_ROAD && roadSquare(other, progress) === roadSquare(me, to)) {
        tokens[other][j] = YARD;
        sent.push(other * 4 + j);
      }
    });
  const won = tokens[me].every((p) => p === HOME),
    // A six, a capture or a token brought home earns another roll.
    again = state.die === 6 || sent.length > 0 || to === HOME;
  return { ...state, tokens, phase: "roll", turn: won || again ? me : other, winner: won ? me : null, ply: state.ply + 1, last: { side: me, rolled: 0, token: move.from, from, to, sent } };
}
/** The computer's choice of token: it sends back, comes home, comes out, and keeps clear of danger, in that order of liking. */
export function chooseToken(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (legal.length <= 1 || (level === "easy" && random() < 0.5)) return legal[Math.floor(random() * legal.length)] ?? null;
  const me = state.turn,
    other = me ? 0 : 1,
    // How many of the other side's tokens stand one to six squares behind a square of the road.
    threat = (progress: number) =>
      progress > LAST_ROAD || SAFE.includes(roadSquare(me, progress))
        ? 0
        : state.tokens[other].filter((p) => p >= 0 && p <= LAST_ROAD && [1, 2, 3, 4, 5, 6].includes((roadSquare(me, progress) - roadSquare(other, p) + 52) % 52)).length;
  let best = legal[0],
    top = -Infinity;
  for (const move of legal) {
    const next = play(state, move)!,
      from = state.tokens[me][move.from - me * 4],
      to = move.to - DEST_BASE,
      score =
        next.last!.sent.length * 50 +
        (to === HOME ? 40 : 0) +
        (from === YARD ? 30 : 0) +
        (to > LAST_ROAD && from <= LAST_ROAD ? 12 : 0) +
        (from >= 0 ? threat(from) * 14 : 0) -
        threat(to) * (level === "hard" ? 16 : 8) +
        to * 0.2 +
        random();
    if (score > top) {
      top = score;
      best = move;
    }
  }
  return best;
}
const effect = (state: State): Effect | null =>
  state.last && state.last.token >= 0 ? { kind: "move", from: state.last.token, to: state.last.token, converted: [], removed: state.last.sent } : null;
export const ludo: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: chooseToken,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => [0, 0, 0, 0, 1, 1, 1, 1, null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.tokens[player].reduce((n, p) => n + p, 0) - s.tokens[player ? 0 : 1].reduce((n, p) => n + p, 0),
  hint: (s) =>
    s.phase === "roll"
      ? s.last && s.last.token < 0 && s.last.side !== s.turn
        ? `상대가 ${s.last.rolled}이(가) 나와 움직일 말이 없었습니다. 주사위를 굴리세요.`
        : "주사위를 굴리세요."
      : `${s.die}이(가) 나왔습니다. 움직일 말을 고르세요.`,
  tally: (s) => [0, 1].map((p) => `집 ${s.tokens[p].filter((t) => t === HOME).length} · 마당 ${s.tokens[p].filter((t) => t === YARD).length}`) as [string, string],
  reason: () => "말 네 개를 모두 가운데 집에 넣었습니다.",
};
