import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * The Game of the Amazons (Walter Zamkauskas, 1988), on 10 × 10 squares, or on the smaller boards added in the
 * upgrade (8 × 8 and 6 × 6, four amazons a side as well; with two a side 6 × 6 was always won by white, by the count of squares). A turn is two things: an amazon moves like a chess
 * queen, then from where it lands shoots an arrow, also like a queen, onto an empty square, which is burnt and
 * blocked for the rest of the game. Nothing is ever taken. The side that cannot move loses. The board's size is
 * read from its length, so every function takes boards of any of the sizes.
 */
export const N = 10;
/** The boards a game may be played on, by variant: "" is the classic 10 × 10 (as always), "8" and "6" the smaller. */
export const SIZES = [10, 8, 6];
/** What stands on a square: nothing, an amazon of side 0 or 1, or a burnt square. */
export const EMPTY = -1,
  BURNT = 2;
export interface State {
  board: number[];
  turn: 0 | 1;
  last: { from: number; to: number; arrow: number } | null;
  winner: Winner;
  ply: number;
}
/** The side of a board, from its length. */
export const sizeOf = (board: number[]) => Math.round(Math.sqrt(board.length));
/** The size a variant plays on. */
export const variantSize = (variant: string | undefined) => (SIZES.includes(Number(variant)) ? Number(variant) : N);
/**
 * Where the amazons start, as [column, row from the far side]: white (side 0) on the near side, black mirrored across.
 * 10 × 10: white at a4, d1, g1 and j4, black at a7, d10, g10 and j7, as always.
 */
const STARTS: Record<number, [number, number][]> = {
  10: [[0, 6], [3, 9], [6, 9], [9, 6]],
  8: [[0, 5], [2, 7], [5, 7], [7, 5]],
  6: [[0, 4], [2, 5], [3, 5], [5, 4]],
};
export function createGame(size = N): State {
  const n = SIZES.includes(size) ? size : N,
    board = new Array(n * n).fill(EMPTY);
  for (const [c, r] of STARTS[n]) {
    board[r * n + c] = 0;
    board[(n - 1 - r) * n + c] = 1;
  }
  return { board, turn: 0, last: null, winner: null, ply: 0 };
}
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The empty squares a queen on `from` reaches, with `gone` standing as empty (the amazon that has just left it). */
export function reach(board: number[], from: number, gone = -1): number[] {
  const n = sizeOf(board),
    out: number[] = [],
    c0 = from % n,
    r0 = Math.floor(from / n);
  for (const [dc, dr] of DIRS)
    for (let c = c0 + dc, r = r0 + dr; c >= 0 && c < n && r >= 0 && r < n; c += dc, r += dr) {
      const s = r * n + c;
      if (board[s] !== EMPTY && s !== gone) break;
      out.push(s);
    }
  return out;
}
/** The empty squares beside `s` (a king's step away). */
function beside(board: number[], s: number, n: number) {
  const out: number[] = [];
  for (const [dc, dr] of DIRS) {
    const c = (s % n) + dc,
      r = Math.floor(s / n) + dr;
    if (c >= 0 && c < n && r >= 0 && r < n && board[r * n + c] === EMPTY) out.push(r * n + c);
  }
  return out;
}
/** Whether a side has any move: an amazon with an empty square beside it can always move there and shoot back. */
export function canMove(board: number[], side: number) {
  const n = sizeOf(board);
  return board.some((p, s) => p === side && beside(board, s, n).length > 0);
}
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  return state.board.flatMap((p, from) =>
    p !== state.turn ? [] : reach(state.board, from).flatMap((to) => reach(state.board, to, from).map((arrow) => ({ from, to, extra: arrow }))),
  );
}
export function play(state: State, move: Move): State | null {
  const { from, to, extra: arrow } = move;
  if (state.winner !== null || state.board[from] !== state.turn || !reach(state.board, from).includes(to) || !reach(state.board, to, from).includes(arrow)) return null;
  const board = state.board.slice();
  board[to] = state.turn;
  board[from] = EMPTY;
  board[arrow] = BURNT;
  const other = (1 - state.turn) as 0 | 1,
    next: State = { board, turn: other, last: { from, to, arrow }, winner: null, ply: state.ply + 1 };
  return canMove(board, other) ? next : { ...next, winner: state.turn };
}
/** The fewest moves from any amazon of `side` to every square (Infinity where none reaches): by queen moves, or by king steps. */
function distances(board: number[], side: number, king = false) {
  const n = sizeOf(board),
    dist = new Array(board.length).fill(Infinity),
    queue: number[] = [];
  board.forEach((p, s) => {
    if (p === side) {
      dist[s] = 0;
      queue.push(s);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head];
    for (const t of king ? beside(board, s, n) : reach(board, s))
      if (dist[t] === Infinity) {
        dist[t] = dist[s] + 1;
        queue.push(t);
      }
  }
  return dist;
}
/** Squares `side` reaches sooner than the other, minus the other's; nearness breaks ties a little. */
export function territory(board: number[], side: 0 | 1) {
  const mine = distances(board, side),
    theirs = distances(board, 1 - side);
  let score = 0;
  board.forEach((p, s) => {
    if (p !== EMPTY) return;
    if (mine[s] < theirs[s]) score += 1;
    else if (theirs[s] < mine[s]) score -= 1;
  });
  // Room round each amazon: one shut in is nearly lost.
  const room = (who: number) => board.reduce((n, p, s) => n + (p === who ? Math.min(reach(board, s).length, 12) : 0), 0);
  return score + (room(side) - room(1 - side)) * 0.15;
}
/**
 * A finer reckoning for the strongest level: territory by queen moves and by king steps (who would win a race to each
 * square step by step, which counts most while the board is open), with the side to move given half a square in a
 * tie, and room round each amazon, its fewest free ways weighed most. Squares nobody reaches count for neither.
 */
export function judge(board: number[], side: 0 | 1, toMove: 0 | 1) {
  const n = sizeOf(board),
    q = [distances(board, 0), distances(board, 1)],
    k = [distances(board, 0, true), distances(board, 1, true)],
    me = side,
    you = 1 - side;
  let queen = 0,
    king = 0,
    empty = 0;
  for (let s = 0; s < board.length; s++) {
    if (board[s] !== EMPTY) continue;
    empty++;
    const race = (d: number[][]) => {
      if (d[me][s] === Infinity && d[you][s] === Infinity) return 0;
      if (d[me][s] < d[you][s]) return 1;
      if (d[you][s] < d[me][s]) return -1;
      return toMove === me ? 0.2 : -0.2;
    };
    queen += race(q);
    king += race(k);
  }
  // Room: the free squares beside each amazon, the most cramped one counted twice.
  const room = (who: number) => {
    const ways = board.flatMap((p, s) => (p === who ? [beside(board, s, n).length] : []));
    return ways.reduce((a, b) => a + b, 0) + Math.min(...ways) * 2;
  };
  const open = empty / board.length;
  return queen + king * (0.15 + 0.6 * open) + (room(me) - room(you)) * (0.1 + 0.3 * open);
}
type Scored = { from: number; to: number; extra: number; score: number };
/** The best `count` whole moves for the side to move, by `value` of the board after them; amazon steps are first ranked and only the best `width` are tried with every arrow. */
function best(state: State, width: number, count: number, value: (board: number[]) => number, random: () => number, jitter: number): Scored[] {
  const me = state.turn,
    steps = state.board.flatMap((p, from) => (p !== me ? [] : reach(state.board, from).map((to) => ({ from, to }))));
  const ranked = steps
    .map((m) => {
      const board = state.board.slice();
      board[m.to] = me;
      board[m.from] = EMPTY;
      return { ...m, score: value(board) + random() * 0.01 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, width);
  const out: Scored[] = [];
  for (const m of ranked) {
    const board = state.board.slice();
    board[m.to] = me;
    board[m.from] = EMPTY;
    for (const arrow of reach(board, m.to)) {
      board[arrow] = BURNT;
      const score = (canMove(board, 1 - me) ? value(board) : 1e6) + random() * jitter;
      board[arrow] = EMPTY;
      out.push({ from: m.from, to: m.to, extra: arrow, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count);
}
/**
 * The computer's move. Easy and normal rank amazon moves by the room they leave, try the best few with every arrow and
 * play the one that leaves the most territory (easy looks at fewer and slips). Hard (made stronger in the upgrade)
 * reckons by `judge` and looks one turn further: for each of its best moves it finds the other side's best answer,
 * and plays the move whose answer leaves it best off.
 */
export function chooseMove(state: State, level: Level, random: () => number = Math.random): Move | null {
  const me = state.turn;
  if (!state.board.some((p, s) => p === me && reach(state.board, s).length)) return null;
  if (level !== "hard") {
    const top = best(state, level === "easy" ? 4 : 10, 1, (board) => territory(board, me), random, level === "easy" ? 3 : 0.01)[0];
    return top ? { from: top.from, to: top.to, extra: top.extra } : null;
  }
  const n = sizeOf(state.board),
    // Fewer candidates on the big board, where every reckoning costs more.
    [width, keep, answerWidth] = n >= 10 ? [10, 6, 5] : n >= 8 ? [12, 8, 6] : [30, 16, 30],
    you = (1 - me) as 0 | 1,
    mine = best(state, width, keep, (board) => judge(board, me, you), random, 0.001);
  let choice: Scored | null = null,
    top = -Infinity;
  for (const m of mine) {
    if (m.score >= 1e6) return { from: m.from, to: m.to, extra: m.extra };
    const after = play(state, { from: m.from, to: m.to, extra: m.extra });
    if (!after) continue;
    if (after.winner !== null) return { from: m.from, to: m.to, extra: m.extra };
    // The other side's best answer, reckoned from its own side; mine is what that leaves me.
    const answer = best(after, answerWidth, 1, (board) => judge(board, you, me), random, 0)[0],
      score = answer ? (answer.score >= 1e6 ? -1e6 : -answer.score) : 1e6;
    if (score > top) {
      top = score;
      choice = m;
    }
  }
  const pick = choice ?? mine[0];
  return pick ? { from: pick.from, to: pick.to, extra: pick.extra } : null;
}
const effect = (state: State): Effect | null => (state.last ? { kind: "move", from: state.last.from, to: state.last.to, converted: [], removed: [] } : null);
export const amazons: PointGame<State> = {
  create: (variant) => createGame(variantSize(variant)),
  moves,
  play: (state, move) => play(state, move),
  choose: (state, level, random) => chooseMove(state, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.board.map((p) => (p === 0 || p === 1 ? p : null)),
  effect,
  ply: (s) => s.ply,
  evaluate: (s, player) => territory(s.board, player),
  hint: () => "아마존을 고르고, 갈 칸을 고른 뒤, 화살을 쏠 칸을 고르세요.",
  tally: (s) => [0, 1].map((p) => `영역 ${Math.round(territory(s.board, p as 0 | 1))}`) as [string, string],
  reason: () => "상대가 더 움직일 수 없습니다.",
};
