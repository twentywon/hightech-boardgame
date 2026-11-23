import { josa } from "../../core/josa";
import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Ludo for two (at one screen) to four (over Wi-Fi): four tokens each go once round the cross-shaped board and up
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
/** The four colours, in the order of the room's seats: 빨강 and 초록 face each other (the game for two), then 노랑 and 파랑. */
export const COLOR_NAMES = ["빨강", "초록", "노랑", "파랑"];
/** Where each colour comes onto the road: red at the near arm, green at the far one, yellow at the left, blue at the right. */
export const START = [39, 13, 0, 26],
  /** The colours in the order the road runs past their starts (clockwise), which is the order of play. */
  CLOCKWISE = [0, 2, 1, 3],
  /** Squares where a token cannot be sent back: the four entries and the four stars. */
  SAFE = [0, 13, 26, 39, 8, 21, 34, 47],
  /** A token's way: 0–50 on the road, 51–55 up its own column, 56 home; -1 in the yard. */
  LAST_ROAD = 50,
  HOME = 56,
  YARD = -1,
  /** The point of the die; the tokens are points 0–3 (the first side to play), 4–7 (the second) and so on. */
  ROLL = 16,
  DEST_BASE = 100;
/** The square of the road a token of `color` stands on at `progress`. */
export const roadSquare = (color: number, progress: number) => (START[color] + progress) % 52;
export interface State {
  /** The tokens of each side, in the order of play. */
  tokens: number[][];
  /** The colour each side plays (red and green at one screen; over Wi-Fi the colours seated). */
  colors: number[];
  /** The side to roll or move. */
  turn: number;
  phase: "roll" | "move";
  die: number;
  /** The side that brought its four home first. */
  winner: number | null;
  /** What the last step was: a roll, or a token moved (with the tokens it sent back). */
  last: { side: number; rolled: number; token: number; from: number; to: number; sent: number[] } | null;
  ply: number;
}
/** A new game for the colours given, played in the road's order (red and green, the game for two, by default). */
export function createGame(colors: number[] = [0, 1]): State {
  const order = CLOCKWISE.filter((c) => colors.includes(c));
  return { tokens: order.map(() => [YARD, YARD, YARD, YARD]), colors: order, turn: 0, phase: "roll", die: 1, winner: null, last: null, ply: 0 };
}
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
/** The side after `side` in the order of play. */
const nextOf = (state: State, side: number) => (side + 1) % state.tokens.length;
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const me = state.turn;
  if (state.phase === "roll") {
    const die = 1 + Math.floor(random() * 6),
      rolled: State = { ...state, die, phase: "move", ply: state.ply + 1, last: { side: me, rolled: die, token: -1, from: 0, to: 0, sent: [] } };
    // Nothing can move: the roll is spent and the dice pass on.
    return moves(rolled).length ? rolled : { ...rolled, phase: "roll", turn: nextOf(state, me) };
  }
  const k = move.from - me * 4,
    from = state.tokens[me][k],
    to = move.to - DEST_BASE,
    tokens = state.tokens.map((t) => t.slice()),
    sent: number[] = [];
  tokens[me][k] = to;
  const square = roadSquare(state.colors[me], to);
  if (to <= LAST_ROAD && !SAFE.includes(square))
    tokens.forEach((theirs, other) => {
      if (other === me) return;
      theirs.forEach((progress, j) => {
        if (progress >= 0 && progress <= LAST_ROAD && roadSquare(state.colors[other], progress) === square) {
          theirs[j] = YARD;
          sent.push(other * 4 + j);
        }
      });
    });
  const won = tokens[me].every((p) => p === HOME),
    // A six, a capture or a token brought home earns another roll.
    again = state.die === 6 || sent.length > 0 || to === HOME;
  return { ...state, tokens, phase: "roll", turn: won || again ? me : nextOf(state, me), winner: won ? me : null, ply: state.ply + 1, last: { side: me, rolled: 0, token: move.from, from, to, sent } };
}
/** The computer's choice of token: it sends back, comes home, comes out, and keeps clear of danger, in that order of liking. */
export function chooseToken(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (legal.length <= 1 || (level === "easy" && random() < 0.5)) return legal[Math.floor(random() * legal.length)] ?? null;
  const me = state.turn,
    mine = state.colors[me],
    // How many of the other sides' tokens stand one to six squares behind a square of the road.
    threat = (progress: number) =>
      progress > LAST_ROAD || SAFE.includes(roadSquare(mine, progress))
        ? 0
        : state.tokens.reduce(
            (n, theirs, other) =>
              other === me
                ? n
                : n + theirs.filter((p) => p >= 0 && p <= LAST_ROAD && [1, 2, 3, 4, 5, 6].includes((roadSquare(mine, progress) - roadSquare(state.colors[other], p) + 52) % 52)).length,
            0,
          );
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
/**
 * The side the screen names for `player`: itself in a game of two; in a game of three or four every side is the
 * screen's side 0 (it knows only two), so the side to move (or the winner, once there is one) stands for it.
 */
export const sideFor = (state: State, player: number) => (state.tokens.length <= 2 ? player : (state.winner ?? state.turn));
const effect = (state: State): Effect | null =>
  state.last && state.last.token >= 0 ? { kind: "move", from: state.last.token, to: state.last.token, converted: [], removed: state.last.sent } : null;
export const ludo: PointGame<State> = {
  create: () => createGame(),
  moves,
  play,
  choose: chooseToken,
  // Three or four sides are told apart by `sideFor` and the room's seats (`colors`); the screen sees side 0.
  turn: (s) => (s.tokens.length > 2 ? 0 : (s.turn as 0 | 1)),
  winner: (s) => (s.winner === null ? null : s.tokens.length > 2 ? 0 : (s.winner as 0 | 1)),
  owners: (s) => [...s.tokens.flatMap((t, side) => t.map(() => (side ? 1 : 0) as 0 | 1)), ...Array(ROLL - s.tokens.length * 4).fill(null), null],
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => s.tokens[player].reduce((n, p) => n + p, 0) - Math.max(...s.tokens.filter((_, side) => side !== player).map((t) => t.reduce((n, p) => n + p, 0))),
  hint: (s) =>
    s.phase === "roll"
      ? s.last && s.last.token < 0 && s.last.side !== s.turn
        ? `상대가 ${s.last.rolled}${josa(s.last.rolled, "이", "가")} 나와 움직일 말이 없었습니다. 주사위를 굴리세요.`
        : "주사위를 굴리세요."
      : `${s.die}${josa(s.die, "이", "가")} 나왔습니다. 움직일 말을 고르세요.`,
  tally: (s) => [0, 1].map((p) => `집 ${s.tokens[p].filter((t) => t === HOME).length} · 마당 ${s.tokens[p].filter((t) => t === YARD).length}`) as [string, string],
  reason: () => "말 네 개를 모두 가운데 집에 넣었습니다.",
};
