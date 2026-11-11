/**
 * Two-player games played with pieces on the points of a drawn board.
 * A move names up to three points in the order the player chooses them; a
 * field a game does not use is -1.
 */
export interface Move {
  /** The piece that moves, or -1 when a new piece is placed. */
  from: number;
  to: number;
  /** A further choice the move needs, such as a piece to take; else -1. */
  extra: number;
}
export type Winner = 0 | 1 | "draw" | null;
/** What the last move did, for the board to animate. */
export interface Effect {
  kind: "move" | "jump" | "clone" | "place";
  from: number;
  to: number;
  /** Points whose piece changed sides. */
  converted: number[];
  /** Points whose piece was taken off. */
  removed: number[];
}
export interface PointGame<S> {
  create(variant: string): S;
  /** Every legal move of the player to move; empty once the game is over. */
  moves(state: S): Move[];
  /**
   * The state after `move`, or null when it is not legal. Never changes
   * `state`. Games of chance draw from `random`.
   */
  play(state: S, move: Move, random?: () => number): S | null;
  /** Points whose piece stands taller (a crowned checker). */
  crowned?(state: S): boolean[];
  /** The moves worth searching, when that is fewer than every legal one. */
  candidates?(state: S): Move[];
  turn(state: S): 0 | 1;
  winner(state: S): Winner;
  /** Who holds each point. */
  owners(state: S): (0 | 1 | null)[];
  effect(state: S): Effect | null;
  /** Moves played so far. */
  ply(state: S): number;
  /** How good the position looks to `player`, for a state that is not over. */
  evaluate(state: S, player: 0 | 1): number;
  /** What the player to move has to do, in a few words. */
  hint(state: S): string;
  /** A short count for each side, shown beside its name. */
  tally(state: S): [string, string];
  /** Why the game ended. */
  reason(state: S): string;
}
export const sameMove = (a: Move, b: Move) => a.from === b.from && a.to === b.to && a.extra === b.extra;
