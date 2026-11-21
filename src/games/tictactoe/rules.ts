import type { Effect, Move, PointGame, Winner } from "../points/types";

/**
 * Tic-tac-toe in five ways (the user asked for several modes):
 *
 * - classic: three in a row on three by three wins;
 * - vanish: each side keeps only three marks, the oldest going when a fourth
 *   is set, so the game cannot end in a full board;
 * - misère: three in a row loses;
 * - ultimate: nine small boards in a big one; the square a mark is set in
 *   sends the other player to that small board; a small board is taken by
 *   three in a row on it, and three small boards in a row win;
 * - cube: four layers of four by four, four in a row along any of the 76
 *   lines of the cube.
 *
 * Side 0 is X and plays first. A move is a cell (`to`).
 */
export type Mode = "classic" | "vanish" | "misere" | "ultimate" | "cube";
export const MODES: { value: Mode; label: string; note: string }[] = [
  { value: "classic", label: "클래식", note: "3×3, 세 줄이면 승리" },
  { value: "vanish", label: "사라지는 틱택토", note: "말은 셋까지, 넷째를 두면 가장 오래된 말이 사라짐" },
  { value: "misere", label: "거꾸로 틱택토", note: "세 줄을 만들면 짐" },
  { value: "ultimate", label: "울티밋 틱택토", note: "작은 판 아홉 개, 둔 칸이 상대가 둘 판을 정함" },
  { value: "cube", label: "입체 틱택토", note: "4×4×4, 네 줄이면 승리" },
];
export const modeOf = (variant: string): Mode => (MODES.some((m) => m.value === variant) ? (variant as Mode) : "classic");
/** How many marks each side keeps in the vanishing game, and how long it may go on before it is called a draw. */
export const KEEP = 3,
  VANISH_LIMIT = 60;
export type Board = 0 | 1 | "draw" | null;
export interface State {
  mode: Mode;
  cells: (0 | 1 | null)[];
  /** In the vanishing game, each side's marks in the order they were set. */
  order: [number[], number[]];
  /** In the ultimate game: who took each small board, and the small board the next mark must go in (-1 for any). */
  boards: Board[];
  active: number;
  turn: 0 | 1;
  winner: Winner;
  /** The cells of the line that decided the game (in the ultimate game, the small boards). */
  line: number[] | null;
  /** The last mark set, and the mark that vanished with it. */
  last: { cell: number; gone: number | null } | null;
  ply: number;
}
/** The eight lines of three by three. */
export const LINES3 = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
/** The 76 lines of four of the four by four by four cube; a cell is layer × 16 + row × 4 + column. */
export const CUBE_LINES: number[][] = (() => {
  const lines: number[][] = [],
    seen = new Set<string>();
  for (let dl = -1; dl <= 1; dl++)
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dl && !dr && !dc) continue;
        for (let l = 0; l < 4; l++)
          for (let r = 0; r < 4; r++)
            for (let c = 0; c < 4; c++) {
              const line: number[] = [];
              for (let k = 0; k < 4; k++) {
                const [L, R, C] = [l + dl * k, r + dr * k, c + dc * k];
                if (L < 0 || L > 3 || R < 0 || R > 3 || C < 0 || C > 3) break;
                line.push(L * 16 + R * 4 + C);
              }
              if (line.length < 4) continue;
              const key = [...line].sort((a, b) => a - b).join();
              if (!seen.has(key)) {
                seen.add(key);
                lines.push(line);
              }
            }
      }
  return lines;
})();
const sizeOf = (mode: Mode) => (mode === "ultimate" ? 81 : mode === "cube" ? 64 : 9);
export function createGame(mode: Mode = "classic"): State {
  return { mode, cells: new Array(sizeOf(mode)).fill(null), order: [[], []], boards: mode === "ultimate" ? new Array(9).fill(null) : [], active: -1, turn: 0, winner: null, line: null, last: null, ply: 0 };
}
/** The cells of small board `b` of the ultimate game. */
export const smallBoard = (b: number) => Array.from({ length: 9 }, (_, k) => b * 9 + k);
/** The lines that pass through a cell, in a game's own lines. */
const linesOf = (mode: Mode): number[][] => (mode === "cube" ? CUBE_LINES : LINES3);
const through = new Map<string, number[][]>();
function linesThrough(mode: Mode, cell: number) {
  const key = `${mode}:${cell}`;
  let found = through.get(key);
  if (!found) {
    found = mode === "ultimate" ? LINES3.filter((l) => l.includes(cell % 9)).map((l) => l.map((k) => Math.floor(cell / 9) * 9 + k)) : linesOf(mode).filter((l) => l.includes(cell));
    through.set(key, found);
  }
  return found;
}
/** A line through `cell` that `side` holds whole, or null. */
const madeLine = (cells: (0 | 1 | null)[], mode: Mode, cell: number, side: 0 | 1) => linesThrough(mode, cell).find((line) => line.every((k) => cells[k] === side)) ?? null;
/** The cells the side to move may set a mark in. */
export function open(state: State): number[] {
  if (state.winner !== null) return [];
  if (state.mode === "ultimate") {
    const where = state.active >= 0 && state.boards[state.active] === null ? [state.active] : state.boards.flatMap((b, i) => (b === null ? [i] : []));
    return where.flatMap((b) => smallBoard(b).filter((k) => state.cells[k] === null));
  }
  return state.cells.flatMap((c, i) => (c === null ? [i] : []));
}
export const moves = (state: State): Move[] => open(state).map((to) => ({ from: -1, to, extra: -1 }));
export function play(state: State, move: Move): State | null {
  if (state.winner !== null || move.from !== -1 || move.extra !== -1 || !open(state).includes(move.to)) return null;
  const side = state.turn,
    cell = move.to,
    cells = state.cells.slice(),
    order: [number[], number[]] = [state.order[0].slice(), state.order[1].slice()];
  cells[cell] = side;
  let gone: number | null = null,
    winner: Winner = null,
    line: number[] | null = null,
    boards = state.boards,
    active = -1;
  if (state.mode === "vanish") {
    order[side].push(cell);
    if (order[side].length > KEEP) {
      gone = order[side].shift()!;
      cells[gone] = null;
    }
  }
  if (state.mode === "ultimate") {
    const b = Math.floor(cell / 9),
      small = madeLine(cells, "ultimate", cell, side);
    boards = state.boards.slice();
    if (small) boards[b] = side;
    else if (smallBoard(b).every((k) => cells[k] !== null)) boards[b] = "draw";
    const big = LINES3.find((l) => l.every((k) => boards[k] === side));
    if (big) [winner, line] = [side, big];
    else if (boards.every((x) => x !== null)) winner = "draw";
    // The square played sends the other to that small board, unless it is already decided.
    const next = cell % 9;
    active = boards[next] === null ? next : -1;
  } else {
    const made = madeLine(cells, state.mode, cell, side);
    if (made) [winner, line] = [state.mode === "misere" ? ((1 - side) as 0 | 1) : side, made];
    else if (state.mode === "vanish" ? state.ply + 1 >= VANISH_LIMIT : cells.every((c) => c !== null)) winner = "draw";
  }
  return { mode: state.mode, cells, order, boards, active, turn: (1 - side) as 0 | 1, winner, line, last: { cell, gone }, ply: state.ply + 1 };
}
/** How good the cells look to `side`: lines it could still complete, more for those nearly done (less, in misère, where lines hurt). */
function lineScore(state: State, side: 0 | 1) {
  const lines = state.mode === "ultimate" ? [] : linesOf(state.mode),
    full = state.mode === "cube" ? 4 : 3;
  let score = 0;
  for (const line of lines) {
    let mine = 0,
      theirs = 0;
    for (const k of line) {
      const c = state.cells[k];
      if (c === side) mine++;
      else if (c !== null) theirs++;
    }
    if (mine && !theirs) score += mine === full - 1 ? 9 : mine * mine;
    else if (theirs && !mine) score -= theirs === full - 1 ? 11 : theirs * theirs;
  }
  return state.mode === "misere" ? -score : score;
}
/** The big board of the ultimate game seen the same way, small boards weighted by their own lines. */
function ultimateScore(state: State, side: 0 | 1) {
  let score = 0;
  for (const line of LINES3) {
    const mine = line.filter((b) => state.boards[b] === side).length,
      theirs = line.filter((b) => state.boards[b] === 1 - side).length,
      dead = line.some((b) => state.boards[b] === "draw");
    if (dead) continue;
    if (mine && !theirs) score += mine * mine * 10;
    if (theirs && !mine) score -= theirs * theirs * 10;
  }
  return score;
}
export function evaluate(state: State, side: 0 | 1) {
  if (state.winner === side) return 1000;
  if (state.winner === 1 - side) return -1000;
  if (state.winner === "draw") return 0;
  return state.mode === "ultimate" ? ultimateScore(state, side) : lineScore(state, side);
}
/** Perfect play on three by three (classic and misère), remembered by position: the value for the side to move. */
const solved = new Map<string, number>();
function perfect(state: State): number {
  if (state.winner !== null) return state.winner === "draw" ? 0 : state.winner === state.turn ? 10 - state.ply * 0.1 : -10 + state.ply * 0.1;
  const key = `${state.mode}${state.turn}${state.cells.map((c) => (c === null ? "." : c)).join("")}`;
  const known = solved.get(key);
  if (known !== undefined) return known;
  let best = -Infinity;
  for (const m of moves(state)) best = Math.max(best, -perfect(play(state, m)!));
  solved.set(key, best);
  return best;
}
/** Negamax with alpha-beta to `depth`, the line score at its leaves. */
function search(state: State, depth: number, alpha: number, beta: number): number {
  if (state.winner !== null || depth === 0) return evaluate(state, state.turn) - (state.winner !== null ? 0 : 0);
  let best = -Infinity;
  for (const m of ordered(state)) {
    const value = -search(play(state, m)!, depth - 1, -beta, -alpha);
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
/** Moves in a promising order: the middle first, then cells with more of the side's lines open. */
function ordered(state: State) {
  const list = moves(state);
  if (state.mode !== "cube") return list;
  const weight = (cell: number) => linesThrough("cube", cell).filter((line) => !line.some((k) => state.cells[k] === 1 - state.turn)).length;
  return list.sort((a, b) => weight(b.to) - weight(a.to));
}
/** A move that wins at once for the side to move, or that the other would win with next. */
function urgent(state: State): Move | null {
  const list = moves(state);
  for (const m of list) if (play(state, m)!.winner === state.turn) return m;
  if (state.mode === "misere") return null;
  const other = { ...state, turn: (1 - state.turn) as 0 | 1 };
  for (const m of list) {
    const after = play(other, m);
    if (after && after.winner === other.turn) return m;
  }
  return null;
}
/** Monte Carlo tree search for the ultimate game: random games played out from each choice, the most visited chosen. */
function treeSearch(state: State, iterations: number, budget: number, random: () => number): Move | null {
  const deadline = performance.now() + budget;
  interface Node {
    state: State;
    move: Move | null;
    parent: Node | null;
    children: Node[];
    untried: Move[];
    visits: number;
    wins: number;
  }
  const root: Node = { state, move: null, parent: null, children: [], untried: moves(state), visits: 0, wins: 0 };
  if (!root.untried.length) return null;
  for (let i = 0; i < iterations; i++) {
    let node = root;
    while (!node.untried.length && node.children.length) {
      const log = Math.log(node.visits);
      node = node.children.reduce((a, b) => (b.wins / b.visits + Math.sqrt((2 * log) / b.visits) > a.wins / a.visits + Math.sqrt((2 * log) / a.visits) ? b : a));
    }
    if (node.untried.length) {
      const move = node.untried.splice(Math.floor(random() * node.untried.length) % node.untried.length, 1)[0],
        child: Node = { state: play(node.state, move)!, move, parent: node, children: [], untried: [], visits: 0, wins: 0 };
      child.untried = moves(child.state);
      node.children.push(child);
      node = child;
    }
    const result = playout(node.state, random);
    // Each node counts the wins of the side that moved into it.
    for (let up: Node | null = node; up; up = up.parent) {
      up.visits++;
      const mover = (1 - up.state.turn) as 0 | 1;
      up.wins += result === "draw" ? 0.5 : result === mover ? 1 : 0;
    }
    if (performance.now() > deadline) break;
  }
  return root.children.reduce((a, b) => (b.visits > a.visits ? b : a)).move;
}
/**
 * An ultimate game played out to its end at random on plain arrays (no states made on the way): a mark that takes a
 * small board at once is preferred. Returns who won.
 */
function playout(state: State, random: () => number): Winner {
  if (state.winner !== null) return state.winner;
  const cells = Int8Array.from(state.cells, (c) => (c === null ? -1 : c)),
    boards = Int8Array.from(state.boards, (b) => (b === null ? -1 : b === "draw" ? 2 : b)),
    free = new Int8Array(9),
    list = new Int16Array(81);
  for (let i = 0; i < 81; i++) if (cells[i] < 0) free[Math.floor(i / 9)]++;
  let active = state.active,
    turn: number = state.turn;
  const takes = (cell: number, side: number) => {
    const base = cell - (cell % 9),
      k = cell % 9;
    for (const line of LINES3) {
      if (!line.includes(k)) continue;
      let all = true;
      for (const j of line) if (j !== k && cells[base + j] !== side) all = false;
      if (all) return true;
    }
    return false;
  };
  for (;;) {
    let n = 0;
    const anywhere = active < 0 || boards[active] >= 0;
    for (let b = 0; b < 9; b++) {
      if (boards[b] >= 0 || (!anywhere && b !== active)) continue;
      for (let k = 0; k < 9; k++) if (cells[b * 9 + k] < 0) list[n++] = b * 9 + k;
    }
    if (!n) return "draw";
    let cell = list[Math.floor(random() * n) % n];
    for (let i = 0; i < n; i++)
      if (takes(list[i], turn)) {
        cell = list[i];
        break;
      }
    const b = Math.floor(cell / 9);
    cells[cell] = turn;
    free[b]--;
    if (takes(cell, turn)) {
      boards[b] = turn;
      for (const line of LINES3) if (line.every((j) => boards[j] === turn)) return turn as 0 | 1;
    } else if (!free[b]) boards[b] = 2;
    if (boards.every((x) => x >= 0)) return "draw";
    active = boards[cell % 9] < 0 ? cell % 9 : -1;
    turn = 1 - turn;
  }
}
/** How often a level plays a random move, and how deep or long it thinks. */
const SLIP = { easy: 0.4, normal: 0.12, hard: 0 },
  DEPTH = { vanish: { easy: 1, normal: 3, hard: 6 }, cube: { easy: 1, normal: 2, hard: 3 } },
  RUNS = { easy: 150, normal: 1500, hard: 6000 },
  BUDGET = { easy: 120, normal: 350, hard: 900 };
export function chooseMove(state: State, level: "easy" | "normal" | "hard", random: () => number): Move | null {
  const list = moves(state);
  if (!list.length) return null;
  if (random() < SLIP[level]) return list[Math.floor(random() * list.length) % list.length];
  if (state.mode === "classic" || state.mode === "misere") {
    // The best moves by perfect play, one of them at random.
    const values = list.map((m) => -perfect(play(state, m)!)),
      top = Math.max(...values),
      best = list.filter((_, i) => values[i] >= top - 1e-9);
    return best[Math.floor(random() * best.length) % best.length];
  }
  const now = urgent(state);
  if (now && level !== "easy") return now;
  if (state.mode === "ultimate") return treeSearch(state, RUNS[level], BUDGET[level], random);
  const depth = DEPTH[state.mode][level];
  let best: Move[] = [],
    top = -Infinity;
  for (const m of ordered(state)) {
    const value = -search(play(state, m)!, depth - 1, -Infinity, Infinity) + random() * 0.01;
    if (value > top) [top, best] = [value, [m]];
  }
  return best[0] ?? list[0];
}
const NAMES = ["X", "O"];
export const tictactoe: PointGame<State> = {
  create: (variant) => createGame(modeOf(variant)),
  moves,
  play: (s, m) => play(s, m),
  choose: (s, level, random) => chooseMove(s, level, random),
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: (s) => s.cells,
  effect: (s): Effect | null => (s.last ? { kind: "place", from: -1, to: s.last.cell, converted: [], removed: s.last.gone === null ? [] : [s.last.gone] } : null),
  ply: (s) => s.ply,
  evaluate: (s, p) => evaluate(s, p),
  hint: (s) => {
    if (s.mode === "ultimate") return s.active >= 0 && s.boards[s.active] === null ? "빛나는 작은 판의 빈칸에 두세요." : "아직 끝나지 않은 아무 작은 판의 빈칸에 두세요.";
    if (s.mode === "vanish" && s.order[s.turn].length >= KEEP) return "빈칸에 두세요. 흐려진 가장 오래된 말이 사라집니다.";
    if (s.mode === "misere") return "빈칸에 두세요. 세 줄을 만들면 집니다.";
    return s.mode === "cube" ? "네 층 가운데 빈칸에 두세요. 어느 방향이든 네 줄이면 이깁니다." : "빈칸에 두세요.";
  },
  tally: (s) => (s.mode === "ultimate" ? ([0, 1].map((p) => `작은 판 ${s.boards.filter((b) => b === p).length}개`) as [string, string]) : ["", ""]),
  reason: (s) => {
    if (s.winner === "draw") return s.mode === "vanish" ? `${VANISH_LIMIT}수가 지나도록 승부가 나지 않아 무승부입니다.` : "무승부입니다. 더 둘 곳이 없습니다.";
    const winner = s.winner as 0 | 1,
      loser = (1 - winner) as 0 | 1;
    if (s.mode === "misere") return `${NAMES[winner]}의 승리입니다. ${NAMES[loser]}가 세 줄을 만들었습니다.`;
    if (s.mode === "ultimate") return `${NAMES[winner]}의 승리입니다. 작은 판 세 개를 한 줄로 차지했습니다.`;
    return `${NAMES[winner]}의 승리입니다. ${s.mode === "cube" ? "네" : "세"} 줄을 만들었습니다.`;
  },
};
