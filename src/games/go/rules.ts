import type { Effect, Move, PointGame, Winner } from "../points/types";
import { BLACK, Board, Rng, WHITE, ownership } from "./engine";

/**
 * Go (바둑) on nine, thirteen or nineteen lines, free of Three.js and DOM. Side 0 is black and plays first; white
 * receives `KOMI`. A move is a point (`to`, row × size + column), `PASS` or `RESIGN`.
 *
 * A stone with no liberty left is taken off; a move that would leave its own chain without a liberty is refused
 * unless it takes something. No move may bring back a position the board has been in before (positional superko,
 * which holds the simple ko rule as well). Two passes in a row end the game, and it is counted as in Korea and
 * Japan: territory, plus the stones each side took, plus komi for white. Which stones are dead is told by many
 * random games played out from the final position (`counting`, seeded from the position, so that a position is
 * always counted alike): a chain that the other side mostly ends up holding is dead, taken off, and counted with
 * the prisoners. An empty region bordered by one colour is its territory; in a region still open to both (a
 * border left unclosed when the players passed) each point goes to the side holding it in most of those games.
 */
export type Size = 9 | 13 | 19;
export const SIZES: Size[] = [19, 13, 9];
export const sizeOf = (variant: string): Size => (variant === "9" ? 9 : variant === "13" ? 13 : 19);
export const KOMI = 6.5;
/** The moves that are not a point. */
export const PASS = 1000,
  RESIGN = 1001;
export const NAMES = ["흑", "백"] as const;
export interface Count {
  /** Empty points each side surrounds, dead stones' points included. */
  territory: [number, number];
  /** Stones each side took during the game, and dead stones of the other side at the end. */
  prisoners: [number, number];
  komi: number;
  total: [number, number];
}
export interface State {
  size: Size;
  /** Who holds each point: 0 black, 1 white, null empty; row × size + column, row 0 the far side. */
  cells: (0 | 1 | null)[];
  turn: 0 | 1;
  /** How many stones each side has taken (they lie in its bowl's lid). */
  captured: [number, number];
  /** Every position the board has stood in, written as a string: the ko rule refuses a move that brings one back. */
  history: string[];
  /** Every move so far: a point, `PASS` or `RESIGN`. */
  record: number[];
  /** The last move, who made it and what it took. */
  last: { point: number; side: 0 | 1; removed: number[] } | null;
  /** Passes in a row. */
  passes: number;
  ply: number;
  winner: 0 | 1 | null;
  /** The side that resigned, or null. */
  resigned: 0 | 1 | null;
  /** At the end of a counted game: the stones judged dead, who holds each point, and the count. */
  dead: number[];
  area: (0 | 1 | null)[] | null;
  count: Count | null;
}
const keyOf = (cells: readonly (0 | 1 | null)[]) => cells.map((c) => (c === null ? "." : c === 0 ? "b" : "w")).join("");
/** The neighbours of each point, by board size. */
const NEIGHBOURS = new Map<number, number[][]>();
export function neighbours(size: number) {
  let list = NEIGHBOURS.get(size);
  if (!list) {
    list = [];
    for (let p = 0; p < size * size; p++) {
      const r = Math.floor(p / size),
        c = p % size,
        around: number[] = [];
      if (r > 0) around.push(p - size);
      if (r < size - 1) around.push(p + size);
      if (c > 0) around.push(p - 1);
      if (c < size - 1) around.push(p + 1);
      list.push(around);
    }
    NEIGHBOURS.set(size, list);
  }
  return list;
}
/** The chain on `p` and how many liberties it has. */
export function chain(cells: readonly (0 | 1 | null)[], size: number, p: number) {
  const color = cells[p],
    near = neighbours(size),
    stones = [p],
    seen = new Set([p]),
    liberties = new Set<number>();
  for (let i = 0; i < stones.length; i++)
    for (const q of near[stones[i]]) {
      if (cells[q] === null) liberties.add(q);
      else if (cells[q] === color && !seen.has(q)) {
        seen.add(q);
        stones.push(q);
      }
    }
  return { stones, liberties: liberties.size };
}
/** The board after `side` plays at `p`, and the stones it took; null when the point is taken or the move is suicide. */
function simulate(cells: readonly (0 | 1 | null)[], size: number, p: number, side: 0 | 1) {
  if (cells[p] !== null) return null;
  const next = cells.slice(),
    removed: number[] = [];
  next[p] = side;
  for (const q of neighbours(size)[p]) {
    if (next[q] !== 1 - side) continue;
    const group = chain(next, size, q);
    if (group.liberties === 0)
      for (const s of group.stones) {
        next[s] = null;
        removed.push(s);
      }
  }
  if (!removed.length && chain(next, size, p).liberties === 0) return null;
  return { cells: next, removed };
}
export function createGame(size: Size = 19): State {
  const cells = new Array<0 | 1 | null>(size * size).fill(null);
  return { size, cells, turn: 0, captured: [0, 0], history: [keyOf(cells)], record: [], last: null, passes: 0, ply: 0, winner: null, resigned: null, dead: [], area: null, count: null };
}
interface Legal {
  moves: Move[];
  /** Points refused only because they would bring a position back (ko). */
  ko: number[];
}
const legalCache = new WeakMap<State, Legal>(),
  seenCache = new WeakMap<State, Set<string>>();
function seen(state: State) {
  let set = seenCache.get(state);
  if (!set) seenCache.set(state, (set = new Set(state.history)));
  return set;
}
function legal(state: State): Legal {
  let known = legalCache.get(state);
  if (known) return known;
  known = { moves: [], ko: [] };
  if (state.winner === null) {
    const before = seen(state);
    for (let p = 0; p < state.cells.length; p++) {
      const after = simulate(state.cells, state.size, p, state.turn);
      if (!after) continue;
      if (before.has(keyOf(after.cells))) known.ko.push(p);
      else known.moves.push({ from: -1, to: p, extra: -1 });
    }
    known.moves.push({ from: -1, to: PASS, extra: -1 }, { from: -1, to: RESIGN, extra: -1 });
  }
  legalCache.set(state, known);
  return known;
}
/** Every legal move: the points, `PASS` and `RESIGN`; nothing once the game is over. */
export const moves = (state: State) => legal(state).moves;
/** Points the side to move may not take now because of ko. */
export const koPoints = (state: State) => legal(state).ko;
/** Whether the side to move may play at `p`. */
export const canPlay = (state: State, p: number) => legal(state).moves.some((m) => m.to === p);
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  const side = state.turn,
    other = (1 - side) as 0 | 1,
    base = { ...state, turn: other, ply: state.ply + 1, record: [...state.record, move.to] };
  if (move.to === RESIGN) return { ...base, turn: side, winner: other, resigned: side, passes: 0, last: { point: RESIGN, side, removed: [] } };
  if (move.to === PASS) {
    const next: State = { ...base, passes: state.passes + 1, last: { point: PASS, side, removed: [] } };
    return next.passes >= 2 ? finish(next) : next;
  }
  if (!canPlay(state, move.to)) return null;
  const after = simulate(state.cells, state.size, move.to, side)!,
    captured: [number, number] = [...state.captured];
  captured[side] += after.removed.length;
  return { ...base, cells: after.cells, captured, history: [...state.history, keyOf(after.cells)], passes: 0, last: { point: move.to, side, removed: after.removed } };
}
/** How many random games the count plays out from the final position, by board size. */
const COUNT_RUNS: Record<Size, number> = { 9: 600, 13: 400, 19: 260 },
  /** How much more often one side must hold a point of an open region for it to be counted as its territory. */
  OPEN_HELD = 0.5;
/** A number from a string, the same each time: the count of one position always comes out the same. */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
/**
 * The count of the board as it stands: dead stones (chains the other side holds in most of the random games played
 * out from here), who holds each point once they are off, and the totals. The random games are seeded from the
 * position, so a position is always counted the same way.
 */
export function counting(state: State) {
  const { size, cells } = state,
    board = Board.from(size, cells),
    own = ownership(board, state.turn === 0 ? BLACK : WHITE, COUNT_RUNS[size], new Rng(hash(keyOf(cells)) ^ size)),
    dead: number[] = [],
    done = new Set<number>();
  for (let p = 0; p < cells.length; p++) {
    if (cells[p] === null || done.has(p)) continue;
    const group = chain(cells, size, p),
      sign = cells[p] === 0 ? 1 : -1;
    let held = 0;
    for (const s of group.stones) {
      done.add(s);
      held += own[s] * sign;
    }
    // Held by the other side more often than by its own: dead.
    if (held / group.stones.length < 0) dead.push(...group.stones);
  }
  const alive = cells.slice();
  for (const p of dead) alive[p] = null;
  // Empty regions (the dead stones' points among them) bordered by one colour only are its territory.
  const area = new Array<0 | 1 | null>(cells.length).fill(null),
    near = neighbours(size),
    visited = new Uint8Array(cells.length),
    territory: [number, number] = [0, 0];
  for (let p = 0; p < cells.length; p++) {
    if (alive[p] !== null || visited[p]) continue;
    const region = [p];
    let black = false,
      white = false;
    visited[p] = 1;
    for (let i = 0; i < region.length; i++)
      for (const q of near[region[i]]) {
        if (alive[q] === null) {
          if (!visited[q]) {
            visited[q] = 1;
            region.push(q);
          }
        } else if (alive[q] === 0) black = true;
        else white = true;
      }
    if (black !== white) {
      const owner: 0 | 1 = black ? 0 : 1;
      for (const q of region) area[q] = owner;
      territory[owner] += region.length;
      continue;
    }
    // A region still open to both sides (a border not yet closed when the game was ended): each point goes to
    // the side that holds it in most of the random games, and a point neither holds is neutral.
    for (const q of region) {
      const owner = own[q] >= OPEN_HELD ? 0 : own[q] <= -OPEN_HELD ? 1 : null;
      if (owner === null) continue;
      area[q] = owner;
      territory[owner]++;
    }
  }
  const deadOf = (side: 0 | 1) => dead.filter((p) => cells[p] === side).length,
    prisoners: [number, number] = [state.captured[0] + deadOf(1), state.captured[1] + deadOf(0)];
  const count: Count = { territory, prisoners, komi: KOMI, total: [territory[0] + prisoners[0], territory[1] + prisoners[1] + KOMI] };
  return { dead, area, count };
}
/** Two passes in a row: the game is counted. */
function finish(state: State): State {
  const { dead, area, count } = counting(state);
  return { ...state, dead, area, count, winner: count.total[0] > count.total[1] ? 0 : 1 };
}
/** A number of points as it is said: 7, 7.5. */
export const points = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export function reason(state: State) {
  if (state.winner === null) return "";
  const winner = state.winner,
    loser = (1 - winner) as 0 | 1;
  if (state.resigned !== null) return `${NAMES[winner]} 불계승. ${NAMES[loser]}이 돌을 던졌습니다.`;
  const c = state.count!,
    margin = Math.abs(c.total[0] - c.total[1]);
  return `${NAMES[winner]} ${points(margin)}집 승. 흑 집 ${c.territory[0]} + 사석 ${c.prisoners[0]} = ${points(c.total[0])}, 백 집 ${c.territory[1]} + 사석 ${c.prisoners[1]} + 덤 ${points(c.komi)} = ${points(c.total[1])}.`;
}
export const go: PointGame<State> = {
  create: (variant) => createGame(sizeOf(variant)),
  moves,
  play: (state, move) => play(state, move),
  turn: (s) => s.turn,
  winner: (s): Winner => s.winner,
  owners: (s) => s.cells,
  effect: (s): Effect | null => (s.last && s.last.point < PASS ? { kind: "place", from: -1, to: s.last.point, converted: [], removed: s.last.removed } : null),
  ply: (s) => s.ply,
  // Stones on the board and stones taken, for a game the computer does not count itself.
  evaluate: (s, player) => {
    let d = 0;
    for (const c of s.cells) if (c !== null) d += c === player ? 1 : -1;
    return d + 2 * (s.captured[player] - s.captured[1 - player]);
  },
  hint: (s) => {
    if (s.last?.point === PASS) return "상대가 한 수 쉬었습니다. 나도 쉬면 대국을 마치고 계가합니다.";
    if (koPoints(s).length) return "빈 교차점에 돌을 놓으세요. □ 표시는 패라서 지금 바로 따낼 수 없습니다.";
    return "빈 교차점에 돌을 놓으세요.";
  },
  tally: (s): [string, string] => {
    if (s.count) return [`${points(s.count.total[0])}집`, `${points(s.count.total[1])}집`];
    if (s.resigned !== null) return s.resigned === 0 ? ["기권", "불계승"] : ["불계승", "기권"];
    return [`따낸 돌 ${s.captured[0]}`, `따낸 돌 ${s.captured[1]}`];
  },
  reason,
};
