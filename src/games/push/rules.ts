import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * 구슬 밀기 (MARBLE PUSH), a marble-pushing game for two in the manner of the board game the intro names once. The
 * classic public rules, as played here:
 *
 * - The board is a hexagon of 61 cells, five to a side: axial co-ordinates (q, r) with |q|, |r| and |q + r| at most 4.
 *   Cells are numbered row by row from the far row (r = -4) to the near one (r = 4), left to right; side 0 sits at
 *   the near side and moves first.
 * - Each side has 14 marbles, set out by the variant (`LAYOUTS`).
 * - A move takes one, two or three of one's own marbles that stand next to one another in a straight line (a group)
 *   and moves each of them one cell in the same one of the six directions.
 *   - In-line: along the group's own line (a single marble always moves in-line). The cell ahead of the leading
 *     marble must be empty, or hold the opponent's marbles that are pushed (below).
 *   - Broadside (sideways): in any of the four other directions; every cell the group moves into must be empty.
 *     Nothing is pushed sideways.
 * - Sumito, pushing: an in-line group may push the opponent's marbles standing in a row straight ahead of it, but only
 *   with more marbles than it pushes: three push two or one, two push one; one never pushes, and three never push
 *   three. The row pushed must end in an empty cell or at the edge, never against a marble of the pusher's own (no
 *   gap is jumped: the pushed row is only the marbles directly ahead). A marble pushed over the edge is out.
 * - One's own marble may never be moved off the board.
 * - The first side to push six of the other's marbles off wins.
 * - So that every game ends (our choice): the game is drawn when the same position, with the same side to move, has
 *   come up for the third time, or when `QUIET` moves in a row (both sides counted, so fifty each) pass without a
 *   marble being pushed off.
 *
 * A move is `{from, to, extra}`: the two end marbles of the group (`from` = `to` for a single marble) and the
 * direction 0–5 (`DIRS`). `moves` gives `from` as the trailing end of an in-line move (the leading one is `to`) and as
 * the lower-numbered end of a broadside one; `play` takes either order.
 */
export interface Cell {
  q: number;
  r: number;
}
export const CELLS: Cell[] = [];
for (let r = -4; r <= 4; r++) for (let q = Math.max(-4, -4 - r); q <= Math.min(4, 4 - r); q++) CELLS.push({ q, r });
export const COUNT = CELLS.length;
/** The six directions as axial steps, going round counter-clockwise as seen from above: east, north-east, north-west, west, south-west, south-east (north is away from side 0). */
export const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
export const opposite = (d: number) => (d + 3) % 6;
const index = new Map(CELLS.map((c, i) => [`${c.q},${c.r}`, i]));
export const cellOf = (q: number, r: number) => index.get(`${q},${r}`) ?? -1;
/** The next cell from each cell in each direction, or -1 past the edge: `NEXT[cell * 6 + dir]`. */
export const NEXT = new Int8Array(COUNT * 6);
CELLS.forEach((c, i) => DIRS.forEach(([dq, dr], d) => (NEXT[i * 6 + d] = cellOf(c.q + dq, c.r + dr))));
export const step = (cell: number, dir: number) => (cell < 0 ? -1 : NEXT[cell * 6 + dir]);
/** How many rings out from the middle a cell lies (0 the middle, 4 the edge). */
export const RING = Int8Array.from(CELLS, (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)));
/** Marbles out that win. */
export const TO_WIN = 6;
/** Moves in a row (both sides counted) without a marble pushed off that draw the game. */
export const QUIET = 100;
/** How many times one position may come up before the game is drawn. */
export const REPEATS = 3;

/**
 * The starting set-ups, written row by row from the far row to the near one ('a' side 0, 'b' side 1). The standard
 * one, and the two well-known daisy layouts under our own names.
 */
const PATTERNS: Record<string, string[]> = {
  standard: ["bbbbb", "bbbbbb", "..bbb..", "........", ".........", "........", "..aaa..", "aaaaaa", "aaaaa"],
  daisy: ["bb.aa", "bbbaaa", ".bb.aa.", "........", ".........", "........", ".aa.bb.", "aaabbb", "aa.bb"],
  inner: [".....", "bb..aa", "bbb.aaa", ".bb..aa.", ".........", ".aa..bb.", "aaa.bbb", "aa..bb", "....."],
};
export const LAYOUTS = [
  { value: "standard", label: "기본 배치" },
  { value: "daisy", label: "꽃 두 송이" },
  { value: "inner", label: "안쪽 꽃" },
];
export type Owner = 0 | 1 | null;
export function layout(variant: string): Owner[] {
  const rows = PATTERNS[variant] ?? PATTERNS.standard,
    cells: Owner[] = [];
  rows.forEach((row) => [...row].forEach((ch) => cells.push(ch === "a" ? 0 : ch === "b" ? 1 : null)));
  return cells;
}

/** What the last move did, for the table to show. */
export interface Last {
  /** The group's cells before the move, from the trailing end to the leading one for an in-line move. */
  group: number[];
  dir: number;
  inline: boolean;
  /** The opponent's marbles pushed, nearest first, where they stood before. */
  pushed: number[];
  /** The cell of the marble pushed off (the last of `pushed`), or -1. */
  off: number;
  /** Who moved. */
  side: 0 | 1;
}
export interface State {
  variant: string;
  cells: Owner[];
  turn: 0 | 1;
  /** Each side's marbles pushed off the board (lost). */
  lost: [number, number];
  winner: Winner;
  /** Why a drawn game was drawn. */
  drawn: "repeat" | "quiet" | null;
  ply: number;
  /** Moves since a marble was last pushed off. */
  quiet: number;
  /** The positions seen since a marble was last pushed off (none can come back after one has), with the side to move. */
  seen: string[];
  last: Last | null;
}
const keyOf = (cells: Owner[], turn: 0 | 1) => cells.map((c) => (c === null ? "." : c)).join("") + turn;
export function createGame(variant = "standard"): State {
  const cells = layout(variant);
  return { variant: PATTERNS[variant] ? variant : "standard", cells, turn: 0, lost: [0, 0], winner: null, drawn: null, ply: 0, quiet: 0, seen: [keyOf(cells, 0)], last: null };
}

/** Why a move is not legal, or what it does when it is. */
export type Verdict =
  | { ok: true; group: number[]; inline: boolean; pushed: number[]; off: number }
  | { ok: false; why: string };
/** The cells from `a` to `b` if they stand in one straight line of at most three, with its direction from `a`; else null. */
export function lineOf(a: number, b: number): { cells: number[]; axis: number } | null {
  if (a < 0 || b < 0 || a >= COUNT || b >= COUNT) return null;
  if (a === b) return { cells: [a], axis: -1 };
  for (let d = 0; d < 6; d++) {
    const cells = [a];
    let at = a;
    for (let k = 0; k < 2; k++) {
      at = step(at, d);
      if (at < 0) break;
      cells.push(at);
      if (at === b) return { cells, axis: d };
    }
  }
  return null;
}
/** Judges moving the group with ends `a` and `b` one cell toward `dir` for the side to move. */
export function judge(cells: Owner[], me: 0 | 1, a: number, b: number, dir: number): Verdict {
  if (dir < 0 || dir > 5 || !Number.isInteger(dir)) return { ok: false, why: "방향을 고르세요." };
  const line = lineOf(a, b);
  if (!line) return { ok: false, why: "구슬은 한 줄로 이어진 셋까지만 함께 옮길 수 있습니다." };
  if (line.cells.some((c) => cells[c] !== me)) return { ok: false, why: "내 구슬만 옮길 수 있습니다." };
  const inline = line.axis < 0 || line.axis === dir || opposite(line.axis) === dir;
  if (!inline) {
    for (const c of line.cells) {
      const to = step(c, dir);
      if (to < 0) return { ok: false, why: "내 구슬을 판 밖으로 옮길 수는 없습니다." };
      if (cells[to] !== null) return { ok: false, why: "옆으로 옮길 때는 들어갈 칸이 모두 비어 있어야 합니다. 옆으로는 밀 수 없습니다." };
    }
    return { ok: true, group: line.cells, inline: false, pushed: [], off: -1 };
  }
  // In-line: from the trailing marble to the leading one.
  const group = line.axis === dir || line.axis < 0 ? line.cells : line.cells.slice().reverse(),
    lead = group[group.length - 1];
  let at = step(lead, dir);
  if (at < 0) return { ok: false, why: "내 구슬을 판 밖으로 옮길 수는 없습니다." };
  if (cells[at] === null) return { ok: true, group, inline: true, pushed: [], off: -1 };
  if (cells[at] === me) return { ok: false, why: "앞에 내 구슬이 있습니다. 그 구슬까지 함께 고르면 한 줄로 옮길 수 있습니다." };
  if (group.length === 1) return { ok: false, why: "구슬 하나로는 밀 수 없습니다. 둘이나 셋을 한 줄로 고르세요." };
  const pushed: number[] = [];
  while (at >= 0 && cells[at] === (me ? 0 : 1)) {
    pushed.push(at);
    at = step(at, dir);
  }
  if (pushed.length >= group.length)
    return { ok: false, why: `상대 구슬 ${pushed.length}개를 밀려면 내 구슬이 ${pushed.length + 1}개 이상 한 줄로 있어야 합니다${pushed.length >= 3 ? " (셋이 넘으면 밀 수 없습니다)" : ""}.` };
  if (at >= 0 && cells[at] === me) return { ok: false, why: "밀리는 상대 구슬 바로 뒤에 내 구슬이 있어 밀 수 없습니다." };
  return { ok: true, group, inline: true, pushed, off: at < 0 ? pushed[pushed.length - 1] : -1 };
}
/** Every legal move of the side to move, in the canonical form of the head comment. */
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const out: Move[] = [],
    me = state.turn,
    { cells } = state;
  const tryMove = (a: number, b: number, dir: number) => {
    const v = judge(cells, me, a, b, dir);
    if (!v.ok) return;
    const from = v.inline ? v.group[0] : Math.min(a, b),
      to = v.inline ? v.group[v.group.length - 1] : Math.max(a, b);
    out.push({ from, to, extra: dir });
  };
  for (let c = 0; c < COUNT; c++) {
    if (cells[c] !== me) continue;
    for (let d = 0; d < 6; d++) tryMove(c, c, d);
    // Groups of two and three counted once, along the three directions that go "forward" from one end.
    for (let axis = 0; axis < 3; axis++) {
      const b1 = step(c, axis);
      if (b1 < 0 || cells[b1] !== me) continue;
      for (let d = 0; d < 6; d++) tryMove(c, b1, d);
      const b2 = step(b1, axis);
      if (b2 < 0 || cells[b2] !== me) continue;
      for (let d = 0; d < 6; d++) tryMove(c, b2, d);
    }
  }
  return out;
}
/** The cells and owners after a legal move, without the bookkeeping. */
export function applyCells(cells: Owner[], me: 0 | 1, v: Extract<Verdict, { ok: true }>, dir: number): Owner[] {
  const next = cells.slice(),
    them: Owner = me ? 0 : 1;
  // The pushed row moves first, far end first, then the group.
  for (let k = v.pushed.length - 1; k >= 0; k--) {
    const at = v.pushed[k],
      to = step(at, dir);
    next[at] = null;
    if (to >= 0) next[to] = them;
  }
  const order = v.inline ? v.group.slice().reverse() : v.group;
  for (const c of order) next[c] = null;
  for (const c of order) next[step(c, dir)] = me;
  return next;
}
export function play(state: State, move: Move): State | null {
  if (state.winner !== null) return null;
  const me = state.turn,
    v = judge(state.cells, me, move.from, move.to, move.extra);
  if (!v.ok) return null;
  const cells = applyCells(state.cells, me, v, move.extra),
    them: 0 | 1 = me ? 0 : 1,
    lost: [number, number] = [state.lost[0], state.lost[1]];
  if (v.off >= 0) lost[them]++;
  const turn = them,
    ply = state.ply + 1,
    quiet = v.off >= 0 ? 0 : state.quiet + 1,
    key = keyOf(cells, turn),
    seen = v.off >= 0 ? [key] : [...state.seen, key],
    times = seen.filter((k) => k === key).length;
  let winner: Winner = null,
    drawn: State["drawn"] = null;
  if (lost[them] >= TO_WIN) winner = me;
  else if (times >= REPEATS) {
    winner = "draw";
    drawn = "repeat";
  } else if (quiet >= QUIET) {
    winner = "draw";
    drawn = "quiet";
  }
  return {
    variant: state.variant,
    cells,
    turn,
    lost,
    winner,
    drawn,
    ply,
    quiet,
    seen,
    last: { group: v.group, dir: move.extra, inline: v.inline, pushed: v.pushed, off: v.off, side: me },
  };
}
/** Why a move of the side to move is refused, in words; null for a legal move. Moves with `from` -2 are the table's own complaints (`COMPLAINTS`). */
export const COMPLAINTS = {
  /** A tap on the other side's marble with nothing chosen. */
  theirs: 1,
  /** A marble tapped that would make the group longer than three. */
  long: 2,
  /** A cell two directions could reach: the arrows decide. */
  twoWays: 3,
  /** A cell tapped with nothing chosen. */
  nothing: 4,
} as const;
const COMPLAINT_TEXT: Record<number, string> = {
  1: "상대 구슬은 고를 수 없습니다. 내 구슬을 누르세요.",
  2: "한 번에 셋까지만 함께 옮길 수 있습니다.",
  3: "두 방향으로 갈 수 있는 칸입니다. 구슬 둘레의 화살표로 방향을 고르세요.",
  4: "먼저 옮길 내 구슬을 누르세요.",
};
export const complaint = (code: number): Move => ({ from: -2, to: -2, extra: code });
export function refusal(state: State, move: Move): string | null {
  if (state.winner !== null) return null;
  if (move.from === -2) return COMPLAINT_TEXT[move.extra] ?? null;
  const v = judge(state.cells, state.turn, move.from, move.to, move.extra);
  return v.ok ? null : v.why;
}

/** What the shared screen needs from the last move. */
const effect = (state: State): Effect | null => {
  const last = state.last;
  if (!last) return null;
  const lead = last.group[last.group.length - 1];
  return { kind: "move", from: last.group[0], to: step(lead, last.dir), converted: [], removed: last.off >= 0 ? [last.off] : [] };
};
/** A plain judgement of a position for `player`: marbles out, then marbles near the middle. The computer uses its own (`ai.ts`). */
export function evaluate(state: State, player: 0 | 1) {
  let centre = 0;
  state.cells.forEach((owner, c) => {
    if (owner !== null) centre += (owner === player ? 1 : -1) * (4 - RING[c]);
  });
  return (state.lost[player ? 0 : 1] - state.lost[player]) * 1000 + centre * 10;
}
export const marblePush: PointGame<State> = {
  create: (variant) => createGame(variant),
  moves,
  play,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.cells,
  effect,
  ply: (s) => s.ply,
  evaluate,
  hint: () => "구슬을 골라(한 줄로 셋까지) 화살표나 갈 칸을 누르세요.",
  tally: (s) => [`밀어낸 구슬 ${s.lost[1]} / ${TO_WIN}`, `밀어낸 구슬 ${s.lost[0]} / ${TO_WIN}`],
  reason: (s) =>
    s.winner === "draw"
      ? s.drawn === "repeat"
        ? `같은 배치가 ${REPEATS}번째 나와 비겼습니다.`
        : `${QUIET / 2}수씩 아무도 구슬을 밀어내지 못해 비겼습니다.`
      : `상대 구슬 ${TO_WIN}개를 판 밖으로 밀어냈습니다. 밀려난 구슬 ${s.lost[0]} : ${s.lost[1]}.`,
};
