import { seededRandom, type Difficulty } from "../../core/ai";
import {
  legalMoves,
  make,
  unmake,
  counts,
  other,
  point,
  type Board,
  type State,
  type Player,
  type Point,
  type LegalMove,
} from "./rules";
import { evaluate, positional, corners } from "./evaluator";
import { profiles } from "./difficulty";
export { profiles } from "./difficulty";
export interface SearchOptions {
  seed?: number;
  timeMs?: number;
  maxNodes?: number;
  maxDepth?: number;
  useTable?: boolean;
  now?: () => number;
}
export interface SearchStats {
  nodes: number;
  depth: number;
  elapsedMs: number;
  timedOut: boolean;
  nodeLimited: boolean;
  tableHits: number;
  solved: boolean;
  score: number | null;
  reason: string;
}
export interface SearchResult {
  move: Point | null;
  pass: boolean;
  stats: SearchStats;
}
const STOP = Symbol("budget"),
  INF = 1_000_000;
const random = seededRandom(0x8a31),
  keys = Array.from({ length: 128 }, () => [
    (random() * 0xffffffff) >>> 0,
    (random() * 0xffffffff) >>> 0,
  ]);
interface Entry {
  depth: number;
  value: number;
  flag: "exact" | "lower" | "upper";
  move: number;
}
export function* searchSteps(
  state: State,
  difficulty: Difficulty = "normal",
  options: SearchOptions = {},
): Generator<void, SearchResult, void> {
  const profile = profiles[difficulty],
    now = options.now ?? (() => performance.now()),
    start = now(),
    deadline = start + Math.max(0, options.timeMs ?? profile.timeMs);
  const stats: SearchStats = {
    nodes: 0,
    depth: 0,
    elapsedMs: 0,
    timedOut: false,
    nodeLimited: false,
    tableHits: 0,
    solved: false,
    score: null,
    reason: "evaluation",
  };
  const board = state.board.slice(),
    rootLegal = legalMoves(board, state.turn);
  let best = rootLegal[0]?.index ?? -1;
  const finish = (pass = false): SearchResult => ({
    move: best < 0 ? null : point(best),
    pass,
    stats: { ...stats, elapsedMs: Math.max(0, now() - start) },
  });
  if (state.winner !== null) {
    best = -1;
    stats.reason = "finished";
    return finish();
  }
  if (!rootLegal.length) {
    best = -1;
    const pass = legalMoves(board, other(state.turn)).length > 0;
    stats.reason = pass ? "pass" : "finished";
    stats.solved = !pass;
    return finish(pass);
  }
  const check = () => {
    if (now() >= deadline) {
      stats.timedOut = true;
      throw STOP;
    }
    if (stats.nodes >= (options.maxNodes ?? Infinity)) {
      stats.nodeLimited = true;
      throw STOP;
    }
  };
  const advanced = difficulty === "hard" || difficulty === "expert";
  const rng = seededRandom(options.seed ?? 1);
  const order = (moves: LegalMove[], player: Player, simple = false) =>
    moves
      .map((move) => {
        make(board, move, player);
        let score: number;
        try {
          score = simple
            ? move.flips.length * 8 + positional(board, player)
            : difficulty === "easy"
              ? positional(board, player) * 3 -
                legalMoves(board, other(player)).length * 10 +
                move.flips.length
              : -evaluate(board, other(player), advanced);
        } finally {
          unmake(board, move, player);
        }
        return { move, score };
      })
      .sort((a, b) => b.score - a.score || a.move.index - b.move.index);
  let h1 = 0,
    h2 = 0;
  for (let i = 0; i < 64; i++)
    if (board[i]) {
      const k = keys[i * 2 + board[i] - 1];
      h1 ^= k[0];
      h2 ^= k[1];
    }
  const toggle = (i: number, p: Player) => {
    const k = keys[i * 2 + p - 1];
    h1 ^= k[0];
    h2 ^= k[1];
  };
  const change = (m: LegalMove, p: Player) => {
    toggle(m.index, p);
    for (const i of m.flips) {
      toggle(i, other(p));
      toggle(i, p);
    }
  };
  const table = new Map<string, Entry>(),
    useTable = options.useTable ?? difficulty === "expert";
  const empties = counts(board).empty,
    exactTarget = difficulty === "expert" && empties <= 10;
  let sliceStarted = now();
  function* negamax(
    player: Player,
    depth: number,
    alpha: number,
    beta: number,
    passed: boolean,
  ): Generator<void, number, void> {
    check();
    if (now() - sliceStarted >= 8) {
      yield;
      check();
      sliceStarted = now();
    }
    stats.nodes++;
    const moves = legalMoves(board, player);
    if (!moves.length) {
      if (passed || !legalMoves(board, other(player)).length) {
        const c = counts(board);
        return (player === 1 ? c.black - c.white : c.white - c.black) * 10000;
      }
      return -(yield* negamax(other(player), depth, -beta, -alpha, true));
    }
    if (depth <= 0) return evaluate(board, player, advanced);
    const key = `${h1 >>> 0}:${h2 >>> 0}:${player}:${passed ? 1 : 0}:${exactTarget ? 1 : 0}`,
      entry = useTable ? table.get(key) : undefined;
    if (entry && entry.depth >= depth) {
      stats.tableHits++;
      if (entry.flag === "exact") return entry.value;
      if (entry.flag === "lower") alpha = Math.max(alpha, entry.value);
      else beta = Math.min(beta, entry.value);
      if (alpha >= beta) return entry.value;
    }
    const originalAlpha = alpha,
      originalBeta = beta;
    const ordered = order(moves, player).map((c) => c.move);
    if (entry) {
      const i = ordered.findIndex((m) => m.index === entry.move);
      if (i > 0) ordered.unshift(...ordered.splice(i, 1));
    }
    const list = exactTarget ? ordered : ordered.slice(0, profile.width);
    let value = -INF,
      bestMove = list[0].index;
    for (const move of list) {
      check();
      make(board, move, player);
      change(move, player);
      let score: number;
      try {
        score = -(yield* negamax(
          other(player),
          depth - 1,
          -beta,
          -alpha,
          false,
        ));
      } finally {
        change(move, player);
        unmake(board, move, player);
      }
      if (score > value) {
        value = score;
        bestMove = move.index;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    if (useTable) {
      if (table.size > 60000) table.clear();
      table.set(key, {
        depth,
        value,
        move: bestMove,
        flag:
          value <= originalAlpha
            ? "upper"
            : value >= originalBeta
              ? "lower"
              : "exact",
      });
    }
    return value;
  }
  try {
    check();
    const ranked = order(rootLegal, state.turn, difficulty === "beginner");
    best = ranked[0].move.index;
    if (difficulty === "beginner" || difficulty === "easy") {
      const corner = ranked.find((c) => corners.includes(c.move.index));
      if (corner) best = corner.move.index;
      else if (difficulty === "beginner" && rng() < 0.45)
        best =
          ranked[Math.floor(rng() * Math.min(4, ranked.length))].move.index;
      else if (difficulty === "easy" && rng() < 0.12) {
        const near = ranked
          .filter((c) => c.score >= ranked[0].score - 15)
          .slice(0, 3);
        best = near[Math.floor(rng() * near.length)].move.index;
      }
      return finish();
    }
    const root = (exactTarget ? ranked : ranked.slice(0, profile.width)).map(
      (c) => c.move,
    );
    const targetDepth = Math.min(
      options.maxDepth ?? Infinity,
      exactTarget ? empties : profile.depth,
    );
    for (let depth = 1; depth <= targetDepth; depth++) {
      let value = -INF,
        iterationBest = best,
        alpha = -INF;
      root.sort((a, b) => Number(b.index === best) - Number(a.index === best));
      for (const move of root) {
        check();
        make(board, move, state.turn);
        change(move, state.turn);
        let score: number;
        try {
          score = -(yield* negamax(
            other(state.turn),
            depth - 1,
            -INF,
            -alpha,
            false,
          ));
        } finally {
          change(move, state.turn);
          unmake(board, move, state.turn);
        }
        if (score > value) {
          value = score;
          iterationBest = move.index;
        }
        alpha = Math.max(alpha, value);
      }
      best = iterationBest;
      stats.depth = depth;
      stats.score = value;
      stats.reason = "search";
      if (depth >= empties) {
        stats.solved = true;
        break;
      }
    }
  } catch (error) {
    if (error !== STOP) throw error;
    stats.reason = "budget";
  }
  return finish();
}

// Pure synchronous entry point for tests and offline evaluation. Browser Workers
// drain the same generator cooperatively so search state and transpositions survive yields.
export function search(
  state: State,
  difficulty: Difficulty = "normal",
  options: SearchOptions = {},
): SearchResult {
  const iterator = searchSteps(state, difficulty, options);
  let result = iterator.next();
  while (!result.done) result = iterator.next();
  return result.value;
}
