import type { State, Point, Player } from "../rules";
import { profiles, seededRandom, type Difficulty } from "./difficulty";
import { rank, patternScore, type Board, type Candidate } from "./evaluator";
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
  reason: string;
}
export interface SearchResult {
  move: Point | null;
  stats: SearchStats;
}
const WIN = 100_000_000,
  STOP = Symbol("search budget");
// Two deterministic 32-bit Zobrist components form a 64-bit position key.
const random = seededRandom(0x51ab),
  keys = Array.from({ length: 450 }, () => [
    (random() * 0xffffffff) >>> 0,
    (random() * 0xffffffff) >>> 0,
  ]);
interface Entry {
  depth: number;
  value: number;
  flag: "exact" | "lower" | "upper";
  move: number;
}
export function search(
  state: State,
  difficulty: Difficulty = "normal",
  options: SearchOptions = {},
): SearchResult {
  const profile = profiles[difficulty],
    now = options.now ?? (() => performance.now()),
    start = now(),
    budget = Math.max(0, options.timeMs ?? profile.timeMs),
    deadline = start + budget;
  const stats: SearchStats = {
    nodes: 0,
    depth: 0,
    elapsedMs: 0,
    timedOut: false,
    nodeLimited: false,
    tableHits: 0,
    reason: "evaluation",
  };
  const board: Board = Int8Array.from(state.board.flat());
  const legal = board.findIndex((v) => v === 0);
  let best = legal;
  const finish = (): SearchResult => ({
    move: best < 0 ? null : { row: Math.floor(best / 15), col: best % 15 },
    stats: { ...stats, elapsedMs: Math.max(0, now() - start) },
  });
  if (state.winner !== null || legal < 0) {
    best = -1;
    stats.reason = "finished";
    return finish();
  }
  if (!board.some((v) => v !== 0)) {
    best = 112;
    stats.reason = "opening";
    return finish();
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
  let h1 = 0,
    h2 = 0;
  for (let i = 0; i < 225; i++)
    if (board[i]) {
      const k = keys[i * 2 + board[i] - 1];
      h1 ^= k[0];
      h2 ^= k[1];
    }
  const change = (index: number, player: Player) => {
    const k = keys[index * 2 + player - 1];
    h1 ^= k[0];
    h2 ^= k[1];
  };
  const table = new Map<string, Entry>();
  const useTable = options.useTable ?? profile.table;
  const tactical = (all: Candidate[]) => {
    const wins = all.filter((c) => c.attack.five);
    if (wins.length) return wins;
    const blocks = all.filter((c) => c.defense.five);
    return blocks.length ? blocks : all;
  };
  function evaluate(all: Candidate[]) {
    const attack = all.map((c) => patternScore(c.attack)).sort((a, b) => b - a),
      defend = all.map((c) => patternScore(c.defense)).sort((a, b) => b - a);
    return (
      Math.min(
        WIN / 4,
        (attack[0] ?? 0) + (attack[1] ?? 0) * 0.25 + (attack[2] ?? 0) * 0.1,
      ) -
      Math.min(
        WIN / 4,
        ((defend[0] ?? 0) + (defend[1] ?? 0) * 0.25 + (defend[2] ?? 0) * 0.1) *
          profile.defense,
      )
    );
  }
  function negamax(
    player: Player,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    extensions: number,
  ): number {
    check();
    stats.nodes++;
    const key = `${h1 >>> 0}:${h2 >>> 0}:${player}:${extensions}:${ply}`,
      entry = useTable ? table.get(key) : undefined;
    const originalDepth = depth;
    if (entry && entry.depth >= depth) {
      stats.tableHits++;
      if (entry.flag === "exact") return entry.value;
      if (entry.flag === "lower") alpha = Math.max(alpha, entry.value);
      else beta = Math.min(beta, entry.value);
      if (alpha >= beta) return entry.value;
    }
    const originalAlpha = alpha,
      originalBeta = beta;
    const all = rank(board, player, profile.defense, true, check);
    if (!all.length) return 0;
    if (all.some((c) => c.attack.five)) return WIN - ply;
    const blocked = all.filter((c) => c.defense.five);
    if (blocked.length > 1) return -WIN + ply + 1;
    let list = tactical(all);
    if (depth <= 0) {
      // Bounded forcing-line extension: resolve checks and examine four-producing moves.
      const forcing = blocked.length
        ? blocked
        : all.filter((c) => c.attack.openFour || c.attack.closedFour);
      if (extensions <= 0 || !forcing.length) return evaluate(all);
      list = forcing;
      extensions--;
      depth = 1;
    }
    list = list.slice(0, Math.max(5, profile.width - ply * 2));
    if (entry) {
      const i = list.findIndex((c) => c.index === entry.move);
      if (i > 0) list.unshift(...list.splice(i, 1));
    }
    let value = -Infinity,
      move = list[0].index;
    for (const c of list) {
      board[c.index] = player;
      change(c.index, player);
      let score: number;
      try {
        score = -negamax(
          player === 1 ? 2 : 1,
          depth - 1,
          -beta,
          -alpha,
          ply + 1,
          extensions,
        );
      } finally {
        board[c.index] = 0;
        change(c.index, player);
      }
      if (score > value) {
        value = score;
        move = c.index;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    if (useTable) {
      if (table.size > 30_000) table.clear();
      table.set(key, {
        depth: originalDepth,
        value,
        move,
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
    const all = rank(
      board,
      state.turn,
      profile.defense,
      difficulty !== "beginner",
      check,
    );
    let root = tactical(all);
    best = root[0]?.index ?? legal;
    if (root[0]?.attack.five) {
      stats.reason = "immediate win";
      return finish();
    }
    if (root.some((c) => c.defense.five)) {
      stats.reason =
        root.length === 1 ? "forced defense" : "multiple immediate losses";
      return finish();
    }
    const rng = seededRandom(options.seed ?? 1);
    if (difficulty === "beginner") {
      // Small local horizon, no fork bonus; occasionally choose a weaker nearby attack.
      const pool = root.slice(0, profile.width);
      best = pool[rng() < 0.4 ? Math.floor(rng() * pool.length) : 0].index;
      return finish();
    }
    if (difficulty === "easy") {
      // Never randomize a forcing tactic. Near-equal positional alternatives only.
      const pool = root
        .slice(0, 3)
        .filter((c) => c.score >= root[0].score * 0.8);
      if (root[0].score < 4000 && rng() < 0.15)
        best = pool[Math.floor(rng() * pool.length)].index;
      return finish();
    }
    root = root.slice(0, profile.width);
    const maxDepth = Math.min(
      profile.depth,
      options.maxDepth ?? profile.depth,
      state.moves.length < 4 ? 2 : profile.depth,
    );
    for (let depth = 1; depth <= maxDepth; depth++) {
      let value = -Infinity,
        iterationBest = best,
        alpha = -WIN * 2;
      root.sort(
        (a, b) =>
          Number(b.index === best) - Number(a.index === best) ||
          b.score - a.score ||
          a.index - b.index,
      );
      for (const c of root) {
        check();
        board[c.index] = state.turn;
        change(c.index, state.turn);
        let score: number;
        try {
          score = -negamax(
            state.turn === 1 ? 2 : 1,
            depth - 1,
            -WIN * 2,
            -alpha,
            1,
            profile.extensions,
          );
        } finally {
          board[c.index] = 0;
          change(c.index, state.turn);
        }
        if (score > value) {
          value = score;
          iterationBest = c.index;
        }
        alpha = Math.max(alpha, value);
      }
      best = iterationBest;
      stats.depth = depth;
      stats.reason = "search";
      if (Math.abs(value) > WIN - 100) break;
    }
  } catch (error) {
    if (error !== STOP) throw error;
    stats.reason = "budget";
  }
  return finish();
}
