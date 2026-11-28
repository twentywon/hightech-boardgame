import { seededRandom, type Difficulty } from "../../core/ai";
import {
  canPass,
  kindOf,
  legalMoves,
  other,
  pseudoMoves,
  sideOf,
  xOf,
  yOf,
  type Move,
  type Side,
  type State,
} from "./rules";

export interface Profile {
  label: string;
  depth: number;
  /** Extra plies of captures searched past the horizon. */
  quiet: number;
  timeMs: number;
  /** Picks at random among moves this close to the best one. */
  slack: number;
}
export const profiles: Record<Difficulty, Profile> = {
  beginner: { label: "입문", depth: 1, quiet: 0, timeMs: 200, slack: 60 },
  easy: { label: "쉬움", depth: 2, quiet: 0, timeMs: 500, slack: 15 },
  normal: { label: "보통", depth: 3, quiet: 1, timeMs: 1500, slack: 0 },
  hard: { label: "어려움", depth: 4, quiet: 2, timeMs: 2500, slack: 0 },
  expert: { label: "전문가", depth: 8, quiet: 3, timeMs: 3500, slack: 0 },
};
export interface SearchResult {
  /** The move to play; null with `pass` when the side should pass. */
  move: Move | null;
  pass: boolean;
  depth: number;
  nodes: number;
}
export interface SearchOptions {
  seed?: number;
  /** Overrides the profile's time budget. */
  timeMs?: number;
}
const WORTH: Record<string, number> = { K: 0, R: 130, C: 70, N: 50, E: 30, A: 30, P: 20 };
const MATE = 100_000;
/** Material and a little placement, from `side`'s point of view. */
function evaluate(cells: readonly string[], side: Side) {
  let score = 0;
  for (let i = 0; i < cells.length; i++) {
    const piece = cells[i];
    if (piece === ".") continue;
    const owner = sideOf(piece)!,
      kind = kindOf(piece),
      y = yOf(i),
      // Ranks advanced from the owner's back rank.
      advanced = owner === "cho" ? 9 - y : y;
    let value = WORTH[kind];
    if (kind === "P") value += advanced * 2 + (4 - Math.abs(xOf(i) - 4));
    else if (kind === "N" || kind === "E") value += advanced > 0 ? 6 : 0;
    else if (kind === "R") value += advanced > 0 ? 4 : 0;
    score += owner === side ? value : -value;
  }
  return score;
}
class Timeout extends Error {}
/**
 * Chooses a move for the side to move with alpha-beta search. Inside the
 * tree moves are generated without the own-king test; capturing a king is
 * scored as a win, which rejects them one ply later.
 */
export function search(
  state: State,
  difficulty: Difficulty,
  options: SearchOptions = {},
): SearchResult {
  const profile = profiles[difficulty],
    roots = legalMoves(state);
  if (!roots.length) return { move: null, pass: canPass(state), depth: 0, nodes: 0 };
  const cells = [...state.board],
    deadline = Date.now() + (options.timeMs ?? profile.timeMs) * 0.9,
    random = seededRandom((options.seed ?? 1) + state.moves.length * 7919);
  let nodes = 0;
  const ordered = (side: Side, capturesOnly: boolean) => {
    const moves = pseudoMoves(cells, side);
    const scored: { move: Move; gain: number }[] = [];
    for (const move of moves) {
      const victim = cells[move.to];
      if (capturesOnly && victim === ".") continue;
      scored.push({
        move,
        gain: victim === "." ? 0 : victim.toUpperCase() === "K" ? MATE : WORTH[kindOf(victim)] * 8 - WORTH[kindOf(cells[move.from])],
      });
    }
    scored.sort((a, b) => b.gain - a.gain);
    return scored;
  };
  const negamax = (side: Side, depth: number, alpha: number, beta: number, ply: number, quiet: number): number => {
    if ((++nodes & 511) === 0 && Date.now() > deadline) throw new Timeout();
    const resting = depth <= 0;
    let best = -Infinity;
    if (resting) {
      best = evaluate(cells, side);
      if (quiet <= 0 || best >= beta) return best;
      if (best > alpha) alpha = best;
    }
    for (const { move, gain } of ordered(side, resting)) {
      if (gain >= MATE) return MATE - ply;
      const taken = cells[move.to],
        piece = cells[move.from];
      cells[move.to] = piece;
      cells[move.from] = ".";
      let value: number;
      try {
        value = -negamax(other(side), depth - 1, -beta, -alpha, ply + 1, resting ? quiet - 1 : quiet);
      } finally {
        cells[move.from] = piece;
        cells[move.to] = taken;
      }
      if (value > best) best = value;
      if (value > alpha) alpha = value;
      if (alpha >= beta) break;
    }
    // A side may always pass; when it is in check the reply takes the king,
    // so the pass scores as lost by itself.
    if (!resting && alpha < beta) {
      const value = -negamax(other(side), depth - 1, -beta, -alpha, ply + 1, quiet);
      if (value > best) best = value;
    }
    return best === -Infinity ? evaluate(cells, side) : best;
  };
  // Score every legal root move, deepening until the profile's depth or the clock.
  let scores = roots.map((move) => ({ move, value: 0 })),
    reached = 0;
  try {
    for (let depth = 1; depth <= profile.depth; depth++) {
      const round: typeof scores = [];
      let alpha = -Infinity;
      for (const { move } of scores) {
        const taken = cells[move.to],
          piece = cells[move.from];
        cells[move.to] = piece;
        cells[move.from] = ".";
        let value: number;
        try {
          // A window just under the best so far keeps near-equal moves comparable.
          value = -negamax(other(state.turn), depth - 1, -Infinity, -(alpha - profile.slack - 1), 1, profile.quiet);
        } finally {
          cells[move.from] = piece;
          cells[move.to] = taken;
        }
        round.push({ move, value });
        if (value > alpha) alpha = value;
      }
      round.sort((a, b) => b.value - a.value);
      scores = round;
      reached = depth;
      if (round[0].value > MATE / 2) break;
    }
  } catch (error) {
    if (!(error instanceof Timeout)) throw error;
  }
  const top = scores[0].value,
    close = scores.filter((s) => s.value >= top - profile.slack);
  const choice = close[Math.floor(random() * close.length)];
  return { move: choice.move, pass: false, depth: reached, nodes };
}
