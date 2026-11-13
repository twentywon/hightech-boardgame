import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Minesweeper: a field of covered squares, some hiding a mine. An opened
 * square tells how many of the eight round it are mined; a square with none
 * opens those round it too. Every square without a mine is to be opened.
 * The mines are laid only when the first square is opened, clear of it and
 * of the squares round it.
 */
export const FIELDS: { rows: number; cols: number; mines: number; name: string }[] = [
  { rows: 8, cols: 8, mines: 10, name: "쉬움" },
  { rows: 10, cols: 12, mines: 20, name: "보통" },
  { rows: 12, cols: 18, mines: 40, name: "어려움" },
];
/** The point that switches between opening squares and planting flags. */
export const FLAG = 1000;
export interface State {
  rows: number;
  cols: number;
  mines: number;
  /** Where the mines lie; null until the first square is opened. */
  mine: boolean[] | null;
  open: boolean[];
  flag: boolean[];
  /** True while a tap plants or lifts a flag instead of opening. */
  flagging: boolean;
  /** The mine that went off. */
  boom: number | null;
  last: number | null;
  winner: Winner;
  ply: number;
}
export function createGame(level = 1): State {
  const { rows, cols, mines } = FIELDS[Math.max(1, Math.min(FIELDS.length, Math.round(level) || 1)) - 1],
    blank = () => new Array<boolean>(rows * cols).fill(false);
  return { rows, cols, mines, mine: null, open: blank(), flag: blank(), flagging: false, boom: null, last: null, winner: null, ply: 0 };
}
/** The squares round a square. */
export function around(state: Pick<State, "rows" | "cols">, cell: number) {
  const r = Math.floor(cell / state.cols),
    c = cell % state.cols,
    out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr,
        cc = c + dc;
      if ((dr || dc) && rr >= 0 && rr < state.rows && cc >= 0 && cc < state.cols) out.push(rr * state.cols + cc);
    }
  return out;
}
/** How many mines lie round a square. */
export const near = (state: State, cell: number) => (state.mine ? around(state, cell).filter((i) => state.mine![i]).length : 0);
/** Lays the mines anywhere but on `safe` and the squares round it. */
function lay(state: State, safe: number, random: Random) {
  const kept = new Set([safe, ...around(state, safe)]),
    free = state.open.map((_, i) => i).filter((i) => !kept.has(i)),
    mine = new Array<boolean>(state.open.length).fill(false);
  for (let k = 0; k < state.mines && free.length; k++) mine[free.splice(Math.floor(random() * free.length), 1)[0]] = true;
  return mine;
}
const playable = (state: State, cell: number) => {
  if (state.flagging) return !state.open[cell];
  if (state.flag[cell]) return false;
  if (!state.open[cell]) return true;
  // An opened number with as many flags round it as it says opens the rest round it.
  const round = around(state, cell),
    count = near(state, cell);
  return count > 0 && round.filter((i) => state.flag[i]).length === count && round.some((i) => !state.open[i] && !state.flag[i]);
};
export const moves = (state: State): Move[] =>
  state.winner !== null ? [] : [...state.open.flatMap((_, to) => (playable(state, to) ? [{ from: -1, to, extra: -1 }] : [])), { from: -1, to: FLAG, extra: -1 }];
export function play(state: State, move: Move, random: Random = cryptoRandom): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1) return null;
  // Switching between opening and flagging is no move.
  if (move.to === FLAG) return { ...state, flagging: !state.flagging };
  const cell = move.to;
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.open.length || !playable(state, cell)) return null;
  if (state.flagging) {
    const flag = [...state.flag];
    flag[cell] = !flag[cell];
    return { ...state, flag, last: cell, ply: state.ply + 1 };
  }
  const mine = state.mine ?? lay(state, cell, random),
    open = [...state.open],
    laid = { ...state, mine },
    // Opening spreads from a square with no mine round it.
    queue = state.open[cell] ? around(state, cell).filter((i) => !state.open[i] && !state.flag[i]) : [cell];
  let boom: number | null = null;
  while (queue.length) {
    const at = queue.pop()!;
    if (open[at] || state.flag[at]) continue;
    open[at] = true;
    if (mine[at]) boom ??= at;
    else if (near(laid, at) === 0) queue.push(...around(state, at));
  }
  const cleared = open.every((o, i) => o || mine[i]);
  return { ...laid, open, boom, last: cell, ply: state.ply + 1, winner: boom !== null ? 1 : cleared ? 0 : null };
}
export const flags = (state: State) => state.flag.filter(Boolean).length;
export const opened = (state: State) => state.open.filter((o, i) => o && !state.mine?.[i]).length;
const effect = (): Effect | null => null;
export const mines: PointGame<State> = {
  create: (variant) => createGame(Number(variant) || 1),
  moves,
  play,
  turn: () => 0,
  winner: (s) => s.winner,
  owners: (s) => s.open.map(() => null),
  effect,
  ply: (s) => s.ply,
  evaluate: (s) => opened(s),
  hint: (s) => `남은 지뢰 ${s.mines - flags(s)}개 · ${s.flagging ? "깃발 꽂기: 지뢰라고 생각하는 칸을 누르세요." : s.mine ? "지뢰가 없는 칸을 모두 여세요." : "아무 칸이나 눌러 시작하세요. 첫 칸은 안전합니다."}`,
  tally: (s) => [`남은 지뢰 ${s.mines - flags(s)} · 연 칸 ${opened(s)}/${s.rows * s.cols - s.mines}`, ""],
  reason: (s) => (s.winner === 0 ? `성공! 지뢰 ${s.mines}개를 모두 피했습니다.` : `지뢰를 밟았습니다. 안전한 칸 ${s.rows * s.cols - s.mines}개 가운데 ${opened(s)}개를 열었습니다.`),
};
