import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Fox and geese, an old hunt game of northern Europe on the 33 points of a
 * cross. Thirteen geese try to pen the fox in; the fox takes geese by jumping
 * over them, as in draughts, and may jump again from where it lands. Geese
 * never go back toward their own end, and cannot jump. The geese move first.
 * Which side plays them is the state's `herd`: side 0 unless the player has
 * chosen the fox.
 */
export interface Point {
  col: number;
  row: number;
}
/** The 33 points, row by row from the far side: a 7×7 square without its four 2×2 corners. */
export const POINTS: Point[] = [];
for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) if ((col >= 2 && col <= 4) || (row >= 2 && row <= 4)) POINTS.push({ col, row });
export const indexOf = (col: number, row: number) => POINTS.findIndex((p) => p.col === col && p.row === row);
/** The eight ways from a point; slanted lines run only through points whose column and row add up to an even number. */
const WAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** Each point's lines: the way, the neighbour along it and the point beyond (−1 where there is none). */
export const LINES: { dc: number; dr: number; next: number; beyond: number }[][] = POINTS.map(({ col, row }) =>
  WAYS.flatMap(([dc, dr]) => {
    if (dc && dr && (col + row) % 2) return [];
    const next = indexOf(col + dc, row + dr);
    return next < 0 ? [] : [{ dc, dr, next, beyond: indexOf(col + 2 * dc, row + 2 * dr) }];
  }),
);
/** Pairs of joined points, for drawing the board. */
export const LINKS: [number, number][] = LINES.flatMap((lines, a) => lines.filter((l) => l.next > a).map((l) => [a, l.next] as [number, number]));
/** The fox has won when fewer geese are left than can pen it in. */
export const FEWEST = 6;
/** Goose moves in a row only sideways before the fox is let go. */
export const STALL_LIMIT = 20;
/** The fox's choice to stop jumping when it could go on. */
export const STAY = 100;
export interface State {
  /** The side that plays the geese. */
  herd: 0 | 1;
  geese: number[];
  fox: number;
  turn: 0 | 1;
  /** The fox has jumped and may jump on (or stay). */
  chain: boolean;
  stall: number;
  last: { from: number; to: number; taken: number | null } | null;
  winner: Winner;
  ply: number;
}
export const createGame = (herd: 0 | 1 = 0): State => ({
  herd,
  // The near arm and the row across the middle below the centre.
  geese: POINTS.flatMap((p, i) => (p.row >= 5 || p.row === 4 ? [i] : [])),
  fox: indexOf(3, 2),
  turn: herd,
  chain: false,
  stall: 0,
  last: null,
  winner: null,
  ply: 0,
});
const runner = (state: State) => (state.herd ? 0 : 1) as 0 | 1;
const busy = (state: State, point: number) => state.fox === point || state.geese.includes(point);
/** The fox's jumps from where it stands: over a goose to the free point straight beyond. */
const jumps = (state: State) => LINES[state.fox].filter((l) => l.beyond >= 0 && state.geese.includes(l.next) && !busy(state, l.beyond));
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  if (state.turn !== state.herd) {
    const leaps = jumps(state).map((l) => ({ from: state.fox, to: l.beyond, extra: -1 }));
    if (state.chain) return [...leaps, { from: -1, to: STAY, extra: -1 }];
    return [...LINES[state.fox].filter((l) => !busy(state, l.next)).map((l) => ({ from: state.fox, to: l.next, extra: -1 })), ...leaps];
  }
  // A goose steps forward (up the board) or sideways, never back.
  return state.geese.flatMap((from) => LINES[from].filter((l) => l.dr <= 0 && !busy(state, l.next)).map((l) => ({ from, to: l.next, extra: -1 })));
}
export function play(state: State, move: Move): State | null {
  if (move.extra !== -1 || !moves(state).some((m) => m.from === move.from && m.to === move.to)) return null;
  const other = (state.turn ? 0 : 1) as 0 | 1;
  let next: State;
  if (move.to === STAY) next = { ...state, chain: false, turn: other, ply: state.ply + 1, last: null };
  else if (state.turn !== state.herd) {
    const line = LINES[state.fox].find((l) => l.beyond === move.to && state.geese.includes(l.next)),
      taken = line && LINES[state.fox].every((l) => l.next !== move.to) ? line.next : null;
    next = { ...state, fox: move.to, geese: taken === null ? state.geese : state.geese.filter((g) => g !== taken), last: { from: move.from, to: move.to, taken }, ply: state.ply + 1, chain: false, turn: other };
    // After a jump the fox may jump on.
    if (taken !== null && jumps(next).length && next.geese.length >= FEWEST) next = { ...next, chain: true, turn: state.turn };
  } else {
    const geese = state.geese.map((g) => (g === move.from ? move.to : g)),
      ahead = POINTS[move.to].row < POINTS[move.from].row;
    next = { ...state, geese, stall: ahead ? 0 : state.stall + 1, last: { from: move.from, to: move.to, taken: null }, ply: state.ply + 1, turn: other };
  }
  if (next.geese.length < FEWEST || next.stall >= STALL_LIMIT) return { ...next, winner: runner(state) };
  // Whoever is to move and cannot has lost: a penned fox, or geese with nowhere to go.
  if (!moves(next).length) return { ...next, winner: next.turn === next.herd ? runner(next) : next.herd };
  return next;
}
/** The fox wants room and geese taken; the geese want the opposite, and to close up. */
export function evaluate(state: State, player: 0 | 1) {
  const room = LINES[state.fox].filter((l) => !busy(state, l.next)).length,
    threats = jumps(state).length,
    forFox = (13 - state.geese.length) * 12 + room * 3 + threats * 5 + state.stall * 0.5 + POINTS[state.fox].row * 0.6;
  return player === state.herd ? -forFox : forFox;
}
const effect = (state: State): Effect | null =>
  state.last ? { kind: state.last.taken !== null ? "jump" : "move", from: state.last.from, to: state.last.to, converted: [], removed: state.last.taken !== null ? [state.last.taken] : [] } : null;
export const foxGeese: PointGame<State> = {
  create: (variant) => createGame(variant === "fox" ? 1 : 0),
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => POINTS.map((_, i) => (s.geese.includes(i) ? s.herd : s.fox === i ? runner(s) : null)),
  // The fox stands taller than the geese.
  crowned: (s) => POINTS.map((_, i) => i === s.fox),
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: (s) => (s.turn === s.herd ? "움직일 거위를 고르세요. 거위는 뒤로 가지 못합니다." : s.chain ? "더 뛰어넘을 수 있습니다. 뛰거나 멈추세요." : "여우를 고른 뒤 갈 곳을 고르세요."),
  tally: (s) => {
    const texts: [string, string] = [`거위 ${s.geese.length}마리`, `잡은 거위 ${13 - s.geese.length}`];
    return s.herd ? [texts[1], texts[0]] : texts;
  },
  reason: (s) =>
    s.winner === s.herd
      ? "여우가 갈 곳이 없습니다."
      : s.geese.length < FEWEST
        ? `거위가 ${s.geese.length}마리만 남아 여우를 가둘 수 없습니다.`
        : s.stall >= STALL_LIMIT
          ? `거위가 ${STALL_LIMIT}번 잇달아 옆으로만 움직였습니다.`
          : "거위가 더 움직일 수 없습니다.",
};
