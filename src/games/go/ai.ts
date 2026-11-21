import type { Move } from "../points/types";
import { BLACK, Board, EMPTY, Rng, WHITE } from "./engine";
import { KOMI, PASS, RESIGN, counting, koPoints, moves, type State } from "./rules";

/**
 * The computer: a Monte Carlo tree search (UCT with RAVE) over light random games played out on the fast board
 * (`engine.ts`), run on the main thread for a fixed time whatever the board size. Every move of the tree starts
 * with a small prior (captures, escapes, the third and fourth lines, nearness to the last move), and moves that
 * would fill one's own eye are never considered, so a living group is never killed by its owner.
 *
 * It passes when the other side has just passed and the count would give it the game, or when the board is
 * settled: every point held by one side in nearly every playout, or a neutral point between living stones of
 * both. It resigns when it sees almost no chance late in the game.
 */
export const BUDGET = { easy: 150, normal: 400, hard: 900 } as const;
export type Level = keyof typeof BUDGET;
/** How strongly the tree trusts what the playouts say of a move anywhere (RAVE), and how it explores. */
const RAVE = 600,
  EXPLORE = 0.25,
  /** How much the heuristics count before a move has been tried, and how many tries it takes for that to halve. */
  BIAS = 0.6,
  FADE = 20,
  /** A point held this often by one side counts as settled. */
  SETTLED = 0.8,
  /** Below this chance of winning, late in the game, the computer resigns. */
  HOPELESS = 0.04;
interface Node {
  /** The padded point of the move into this node; 0 for a pass. */
  move: number;
  visits: number;
  /** Wins of the side that made the move into this node. */
  wins: number;
  /** All-moves-as-first: how often the move was played anywhere in a playout from the parent, and won. */
  rn: number;
  rw: number;
  /** The sum of the final area counts (for the side that made the move), at the root only. */
  score: number;
  /** What the heuristics think of the move, as a bonus that fades as the move is tried (progressive bias). */
  bias: number;
  children: Node[] | null;
}
const node = (move: number, rn = 0, rw = 0, bias = 0): Node => ({ move, visits: 0, wins: 0, rn, rw, score: 0, bias, children: null });
/** The moves of `c` worth a place in the tree, each with its prior: never one that fills its own eye. */
function expand(board: Board, c: number, last: number, pass: boolean): Node[] {
  const children: Node[] = [],
    { color, W, size } = board,
    o = 3 - c,
    opening = board.emptyCount > board.points.length * 0.8;
  for (let i = 0; i < board.points.length; i++) {
    const p = board.points[i];
    if (color[p] !== EMPTY || !board.legal(p, c) || board.eye(p, c)) continue;
    let value = 0.5,
      weight = 8;
    const line = board.line[p];
    // The edges are poor ground while the board is open; the third and fourth lines are where games begin.
    if (size >= 13) {
      if (line === 0) value = opening ? 0.1 : 0.3;
      else if (line === 1) value = opening ? 0.3 : 0.42;
      else if (line === 2 || line === 3) value = opening ? 0.62 : 0.53;
    } else if (line === 0) value = 0.3;
    else if (line === 1 && opening) value = 0.4;
    else if (line >= 2 && opening) value = 0.56;
    // Taking a chain in atari, and saving one's own.
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W,
        x = color[q];
      if (x !== BLACK && x !== WHITE) continue;
      const h = board.head[q];
      if (!board.atari(h)) continue;
      if (x === o) {
        value = Math.max(value, 0.8 + Math.min(0.15, board.stones[h] * 0.03));
        weight = 20;
      } else if (board.emptyAround(p) >= 2) {
        value = Math.max(value, 0.75);
        weight = 16;
      }
    }
    // Playing into atari oneself, with nothing taken, is usually bad.
    if (value < 0.75 && board.emptyAround(p) <= 1) {
      let others = 0;
      for (let k = 0; k < 4; k++) {
        const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W;
        if (color[q] === c && board.libs[board.head[q]] > 2) others++;
      }
      if (!others) value = Math.min(value, 0.3);
    }
    if (last > 0 && !opening) {
      const dr = Math.abs(Math.floor(p / W) - Math.floor(last / W)),
        dc = Math.abs((p % W) - (last % W));
      if (dr + dc <= 2) value += 0.06;
    }
    children.push(node(p, weight, weight * value, (value - 0.5) * BIAS));
  }
  if (pass) children.push(node(0));
  return children;
}
function select(parent: Node) {
  const children = parent.children!,
    log = Math.log(parent.visits + 1);
  let best = children[0],
    top = -Infinity;
  for (const child of children) {
    const n = child.visits;
    let q: number;
    if (child.rn > 0) {
      const beta = Math.sqrt(RAVE / (3 * n + RAVE)),
        amaf = child.rw / child.rn;
      q = n > 0 ? (1 - beta) * (child.wins / n) + beta * amaf : amaf;
    } else q = n > 0 ? child.wins / n : 0.5;
    const value = q + EXPLORE * Math.sqrt(log / (n + 1)) + (child.bias * FADE) / (FADE + n);
    if (value > top) {
      top = value;
      best = child;
    }
  }
  return best;
}
export interface Search {
  root: Node;
  /** Who holds each point at the end of the playouts, on average (+1 black), by plain index. */
  own: Float32Array;
  playouts: number;
}
/** Searches from `board` with `c` to move until `deadline` (by `now`), and says what it found. */
export function search(board: Board, c: number, last: number, deadline: number, rng: Rng, now: () => number = () => performance.now(), most = Infinity): Search {
  const root = node(-1),
    work = new Board(board.size),
    first = new Uint8Array(board.N),
    own = new Float32Array(board.size * board.size),
    path: Node[] = [],
    colors: number[] = [],
    limit = board.points.length * 3,
    expandAt = board.size >= 13 ? 3 : 2;
  // Passing is weighed only once the board has filled up: early on it is never right, and noise could favour it.
  root.children = expand(board, c, last, board.emptyCount < board.points.length * 0.55);
  let playouts = 0;
  if (!root.children.length) return { root, own, playouts };
  while (playouts < most) {
    if ((playouts & 7) === 0 && now() > deadline) break;
    work.copyFrom(board);
    first.fill(0);
    path.length = colors.length = 0;
    let at = root,
      turn = c,
      lastMove = last,
      passes = 0;
    path.push(root);
    colors.push(turn);
    // Down the tree.
    for (;;) {
      if (!at.children) {
        if (at.visits < expandAt || passes >= 2) break;
        at.children = expand(work, turn, lastMove, false);
      }
      if (!at.children.length) break;
      const child = select(at);
      if (child.move === 0) {
        work.pass();
        passes++;
        lastMove = -1;
      } else {
        work.place(child.move, turn);
        if (first[child.move] === 0) first[child.move] = turn;
        passes = 0;
        lastMove = child.move;
      }
      turn = 3 - turn;
      at = child;
      path.push(at);
      colors.push(turn);
    }
    // Played out at random, and counted by area.
    if (passes < 2) work.playout(turn, lastMove, rng, first, limit);
    const area = work.area() - KOMI,
      black = area > 0 ? 1 : 0;
    work.tallyOwners(own);
    playouts++;
    for (let i = 0; i < path.length; i++) {
      const n = path[i],
        // The side that moved into this node is the one that was to move at its parent.
        mover = i === 0 ? 3 - c : colors[i - 1],
        won = mover === BLACK ? black : 1 - black;
      n.visits++;
      n.wins += won;
      if (i === 1) n.score += mover === BLACK ? area : -area;
      // Every child of this node whose point its side played first anywhere below shares in the result.
      if (n.children) {
        const toMove = colors[i],
          result = toMove === BLACK ? black : 1 - black;
        for (const child of n.children)
          if (child.move && first[child.move] === toMove) {
            child.rn++;
            child.rw += result;
          }
      }
    }
  }
  if (playouts) for (let i = 0; i < own.length; i++) own[i] /= playouts;
  return { root, own, playouts };
}
/**
 * Whether nothing is left to play for: every point is held by one side in nearly every playout, or is a neutral
 * point between settled stones of both colours.
 */
export function settled(board: Board, own: Float32Array) {
  const { color, W } = board;
  for (let i = 0; i < board.points.length; i++) {
    const p = board.points[i];
    if (Math.abs(own[i]) >= SETTLED) continue;
    if (color[p] !== EMPTY) return false;
    let black = false,
      white = false,
      sure = true;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - 1 : k === 1 ? p + 1 : k === 2 ? p - W : p + W,
        x = color[q];
      if (x !== BLACK && x !== WHITE) continue;
      const held = own[board.plain(q)];
      if (x === BLACK) {
        black = true;
        if (held < SETTLED) sure = false;
      } else {
        white = true;
        if (held > -SETTLED) sure = false;
      }
    }
    if (!(black && white && sure)) return false;
  }
  return true;
}
const asMove = (to: number): Move => ({ from: -1, to, extra: -1 });
/** The fast board for a state, with the simple ko point set where the rules forbid a recapture. */
export function boardOf(state: State) {
  const board = Board.from(state.size, state.cells),
    ko = koPoints(state);
  if (ko.length === 1) board.ko = board.at(Math.floor(ko[0] / state.size), ko[0] % state.size);
  return board;
}
/** How many times the other side has passed lately, in the last `span` moves. */
const recentPasses = (state: State, span: number) => state.record.slice(-span).filter((m, i, list) => m === PASS && (list.length - i) % 2 === 1).length;
export function chooseMove(state: State, level: Level, random: () => number, now: () => number = () => performance.now(), resign = true): Move {
  const start = now(),
    deadline = start + BUDGET[level],
    legal = moves(state),
    open = new Set(legal.filter((m) => m.to < PASS).map((m) => m.to)),
    side = state.turn,
    c = side === 0 ? BLACK : WHITE,
    n = state.size * state.size;
  if (!legal.length) return asMove(PASS);
  const board = boardOf(state);
  // The other side has passed: if the count as it stands gives me the game, pass and end it.
  const answered = state.last?.point === PASS;
  if (answered) {
    const { total } = counting(state).count;
    if (total[side] > total[1 - side]) return asMove(PASS);
  }
  // A game that has gone on far too long is let go.
  if (state.ply > n * 2.5) return asMove(PASS);
  const last = state.last && state.last.point < PASS ? board.at(Math.floor(state.last.point / state.size), state.last.point % state.size) : -1,
    found = search(board, c, last, deadline, new Rng(Math.floor(random() * 4294967296)), now);
  // Only my own eyes are left to fill, nothing is left to play for, or the other side has passed again and again.
  if (!found.root.children!.length || settled(board, found.own) || (answered && recentPasses(state, 12) >= 3)) return asMove(PASS);
  const ranked = found.root.children!.filter((child) => child.visits > 0 && child.move !== 0 && open.has(board.plain(child.move))).sort((a, b) => b.visits - a.visits);
  if (!ranked.length) return asMove(PASS);
  const best = ranked[0],
    chance = best.wins / best.visits;
  if (resign && chance < HOPELESS && state.ply > n * 0.4 && found.playouts > 200) return asMove(RESIGN);
  // Behind by the count after a pass and with little hope of turning it round: accept the count.
  if (answered && chance < 0.3) return asMove(PASS);
  // Late in the game a pass that does as well as the best move, in the chance of winning and in the area it keeps,
  // says that what is left gains nothing (filling one's own territory loses a point when territory is counted).
  const pass = found.root.children!.find((child) => child.move === 0);
  if (pass && pass.visits >= 64 && pass.wins / pass.visits >= chance - 0.03 && pass.score / pass.visits >= best.score / best.visits - 0.5) return asMove(PASS);
  let chosen = best;
  // The easy computer often takes one of the next few moves instead of the best.
  if (level === "easy" && ranked.length > 1 && random() < 0.4) {
    const few = ranked.slice(0, 5);
    chosen = few[Math.floor(random() * few.length) % few.length];
  }
  return asMove(chosen.move === 0 ? PASS : board.plain(chosen.move));
}
