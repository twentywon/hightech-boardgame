import { Chess, type Move } from "chess.js";
import { seededRandom, type Difficulty } from "../../core/ai";
import {
  action,
  createEngine,
  currentKey,
  repetitions,
  halfmoves,
  type State,
  type Action,
} from "./rules";
import { profiles } from "./difficulty";
import { evaluate, values } from "./evaluator";
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
  qNodes: number;
  depth: number;
  elapsedMs: number;
  timedOut: boolean;
  nodeLimited: boolean;
  tableHits: number;
  score: number | null;
  reason: string;
}
export interface SearchResult {
  move: Action | null;
  claim: boolean;
  stats: SearchStats;
}
interface Entry {
  depth: number;
  value: number;
  flag: "exact" | "lower" | "upper";
  move: string;
}
const MATE = 100000,
  INF = 1000000,
  STOP = Symbol("budget");
export const mateToTable = (v: number, ply: number) =>
  v > MATE - 1000 ? v + ply : v < -MATE + 1000 ? v - ply : v;
export const mateFromTable = (v: number, ply: number) =>
  v > MATE - 1000 ? v - ply : v < -MATE + 1000 ? v + ply : v;
const id = (m: { from: string; to: string; promotion?: string }) =>
  m.from + m.to + (m.promotion ?? "");
// chess.js's 64-bit Zobrist hash includes side, castling and en passant. Include
// the halfmove clock AND full repetition-count context to make draw reuse safe.
export const tableKey = (game: Chess, counts: Map<string, number>) =>
  `${game.hash()}:${halfmoves(game)}:${[...counts]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}=${n}`)
    .join(";")}`;

export function* searchSteps(
  state: State,
  difficulty: Difficulty = "normal",
  options: SearchOptions = {},
): Generator<void, SearchResult, void> {
  const profile = profiles[difficulty],
    now = options.now ?? (() => performance.now()),
    began = now();
  const deadline = began + Math.max(0, options.timeMs ?? profile.timeMs),
    rng = seededRandom(options.seed ?? 1);
  const game = createEngine(state),
    counts = repetitions(game);
  const stats: SearchStats = {
    nodes: 0,
    qNodes: 0,
    depth: 0,
    elapsedMs: 0,
    timedOut: false,
    nodeLimited: false,
    tableHits: 0,
    score: null,
    reason: "evaluation",
  };
  let best: Action | null = null,
    claim = false,
    slice = now();
  const finish = (): SearchResult => ({
    move: best,
    claim,
    stats: { ...stats, elapsedMs: Math.max(0, now() - began) },
  });
  let root = game.moves({ verbose: true });
  const terminal = (moves: Move[], ply: number) => {
    if (!moves.length) return game.isCheck() ? -MATE + ply : 0;
    if (
      game.isInsufficientMaterial() ||
      halfmoves(game) >= 150 ||
      (counts.get(currentKey(game)) ?? 0) >= 5
    )
      return 0;
    return null;
  };
  if (state.outcome || terminal(root, 0) !== null) {
    stats.reason = "finished";
    return finish();
  }
  best = action(root[0]);
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
  function* cooperate(): Generator<void, void, void> {
    check();
    if (now() - slice >= 8) {
      yield;
      check();
      slice = now();
    }
  }
  const claimable = () =>
    halfmoves(game) >= 100 || (counts.get(currentKey(game)) ?? 0) >= 3;
  const push = (m: Move) => {
    game.move(m);
    const k = currentKey(game);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  };
  const pop = () => {
    const k = currentKey(game),
      n = counts.get(k)! - 1;
    if (n) counts.set(k, n);
    else counts.delete(k);
    game.undo();
  };
  const history = new Map<string, number>(),
    killers = new Map<number, string>();
  const order = (moves: Move[]) =>
    [...moves].sort((a, b) => rank(b) - rank(a) || id(a).localeCompare(id(b)));
  function rank(m: Move): number {
    return (
      (m.captured ? 10000 + values[m.captured] * 10 - values[m.piece] : 0) +
      (m.promotion ? values[m.promotion] + 8000 : 0) +
      (m.san.includes("+") ? 1200 : 0) +
      (history.get(id(m)) ?? 0)
    );
  }
  const ordered = (moves: Move[], preferred = "", ply = 0) =>
    order(moves).sort(
      (a, b) =>
        Number(id(b) === preferred) * 100000 -
        Number(id(a) === preferred) * 100000 +
        (profile.advanced
          ? Number(id(b) === killers.get(ply)) * 1000 -
            Number(id(a) === killers.get(ply)) * 1000
          : 0),
    );
  const table = new Map<string, Entry>(),
    useTable = options.useTable ?? difficulty === "expert";
  function* quiet(
    alpha: number,
    beta: number,
    remaining: number,
    ply: number,
    moves: Move[],
  ): Generator<void, number, void> {
    yield* cooperate();
    stats.nodes++;
    stats.qNodes++;
    const end = terminal(moves, ply);
    if (end !== null) return end;
    const inCheck = game.isCheck(),
      canDraw = claimable();
    let value = canDraw ? 0 : -INF;
    if (!inCheck) {
      value = Math.max(
        value,
        evaluate(game, profile.advanced, false, moves.length),
      );
      if (value >= beta || remaining <= 0) return value;
      alpha = Math.max(alpha, value);
    } else if (canDraw) {
      alpha = Math.max(alpha, 0);
      if (alpha >= beta) return 0;
    }
    // A checked node never stands pat, even beyond the normal q-depth limit.
    for (const m of ordered(
      inCheck ? moves : moves.filter((m) => m.captured || m.promotion),
    )) {
      check();
      push(m);
      let score: number;
      try {
        const next = game.moves({ verbose: true });
        score = -(yield* quiet(-beta, -alpha, remaining - 1, ply + 1, next));
        if (claimable()) score = Math.max(0, score); // the mover may declare this intended move
      } finally {
        pop();
      }
      value = Math.max(value, score);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }
  function* negamax(
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
  ): Generator<void, number, void> {
    yield* cooperate();
    const moves = game.moves({ verbose: true }),
      end = terminal(moves, ply);
    if (end !== null) {
      stats.nodes++;
      return end;
    }
    if (depth <= 0) {
      if (profile.qDepth)
        return yield* quiet(alpha, beta, profile.qDepth, ply, moves);
      stats.nodes++;
      return Math.max(
        claimable() ? 0 : -INF,
        evaluate(game, profile.advanced, false, moves.length),
      );
    }
    stats.nodes++;
    const key = useTable ? tableKey(game, counts) : "",
      entry = table.get(key);
    const originalAlpha = alpha,
      originalBeta = beta;
    if (entry && entry.depth >= depth) {
      stats.tableHits++;
      const v = mateFromTable(entry.value, ply);
      if (entry.flag === "exact") return v;
      if (entry.flag === "lower") alpha = Math.max(alpha, v);
      else beta = Math.min(beta, v);
      if (alpha >= beta) return v;
    }
    let value = claimable() ? 0 : -INF,
      move = "";
    alpha = Math.max(alpha, value);
    if (alpha >= beta) return value;
    for (const m of ordered(moves, entry?.move, ply)) {
      check();
      push(m);
      let score: number;
      try {
        score = -(yield* negamax(depth - 1, -beta, -alpha, ply + 1));
        if (claimable()) score = Math.max(0, score);
      } finally {
        pop();
      }
      if (score > value) {
        value = score;
        move = id(m);
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) {
        if (!m.captured) {
          killers.set(ply, id(m));
          history.set(
            id(m),
            Math.min(3000, (history.get(id(m)) ?? 0) + depth * depth),
          );
        }
        break;
      }
    }
    if (useTable) {
      if (table.size >= 6000) table.clear();
      table.set(key, {
        depth,
        value: mateToTable(value, ply),
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
    check();
    root = ordered(root);
    // Every tier recognizes mate in one before heuristic mistakes or tree search.
    for (const m of root) {
      yield* cooperate();
      // Verbose legal moves already contain SAN, including the mate suffix.
      // Replaying every candidate here duplicates chess.js's mate detection.
      if (m.san.endsWith("#")) {
        best = action(m);
        stats.score = MATE - 1;
        stats.reason = "mate in one";
        return finish();
      }
    }
    if (difficulty === "beginner") {
      const ranked: { move: Action; score: number; claim: boolean }[] = [];
      for (const m of root) {
        yield* cooperate();
        push(m);
        let score: number, canDraw: boolean;
        try {
          score = game.isStalemate() ? 0 : -evaluate(game, false, true);
          canDraw = claimable();
          if (canDraw) score = Math.max(0, score);
        } finally {
          pop();
        }
        ranked.push({ move: action(m), score, claim: canDraw && score === 0 });
        if (score > (stats.score ?? -INF)) {
          best = action(m);
          stats.score = score;
          claim = canDraw && score === 0;
        }
      }
      ranked.sort((a, b) => b.score - a.score);
      const chosen =
        ranked[
          rng() < 0.4 ? Math.floor(rng() * Math.min(4, ranked.length)) : 0
        ];
      best = chosen.move;
      stats.score = chosen.score;
      claim = chosen.claim;
      if (claimable() && chosen.score <= 0) {
        best = null;
        claim = true;
        stats.score = 0;
      }
      return finish();
    }
    for (
      let depth = 1;
      depth <= Math.min(options.maxDepth ?? profile.depth, profile.depth);
      depth++
    ) {
      let value = claimable() ? 0 : -INF,
        iterationBest: Action | null = claimable() ? null : best,
        iterationClaim = claimable(),
        alpha = value;
      const scores: { move: Action; score: number; claim: boolean }[] = [];
      for (const m of ordered(root, best ? id(best) : "")) {
        yield* cooperate();
        push(m);
        let score: number, canDraw: boolean;
        try {
          score = -(yield* negamax(
            depth - 1,
            -INF,
            difficulty === "easy" ? INF : -alpha,
            1,
          ));
          canDraw = claimable();
          if (canDraw) score = Math.max(0, score);
        } finally {
          pop();
        }
        const usesClaim = canDraw && score === 0;
        scores.push({ move: action(m), score, claim: usesClaim });
        if (score > value) {
          value = score;
          iterationBest = action(m);
          iterationClaim = usesClaim;
        }
        alpha = Math.max(alpha, value);
      }
      best = iterationBest;
      claim = iterationClaim;
      stats.score = value;
      stats.depth = depth;
      stats.reason = "search";
      if (difficulty === "easy" && depth === 2 && rng() < 0.12 && !claim) {
        // Easy root alternatives use full windows, so their scores are exact.
        const near = scores.filter((s) => s.score >= value - 15);
        if (near.length) {
          const s = near[Math.floor(rng() * near.length)];
          best = s.move;
          claim = s.claim;
          stats.score = s.score;
        }
      }
      if (Math.abs(value) > MATE - 1000) break;
    }
  } catch (e) {
    if (e !== STOP) throw e;
    stats.reason = "budget";
  }
  return finish();
}
export function search(
  state: State,
  difficulty: Difficulty = "normal",
  options: SearchOptions = {},
): SearchResult {
  const iterator = searchSteps(state, difficulty, options);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}
