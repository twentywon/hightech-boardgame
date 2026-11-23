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
/** What the setup window set beyond the variant (numbers, rules on or off, choices), by the ids of `PointConfig.settings`. */
export type GameOptions = Record<string, number | boolean | string>;
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
  /**
   * A new game of `variant`; `options` are the numbers and rules set in the setup window, for a game that offers them.
   * A game that draws anything at random as it is laid (a map) draws it from `random` when it is given (a game over
   * Wi-Fi passes the room's shared stream, so every device lays the same).
   */
  create(variant: string, options?: GameOptions, random?: () => number): S;
  /** Every legal move of the player to move; empty once the game is over. */
  moves(state: S): Move[];
  /**
   * The state after `move`, or null when it is not legal. Never changes
   * `state`. Games of chance draw from `random`.
   */
  play(state: S, move: Move, random?: () => number): S | null;
  /** Points whose piece stands taller (a crowned checker). */
  crowned?(state: S): boolean[];
  /**
   * The computer's move, for a game the shared search does not suit (one
   * with hidden pieces). It may use only what the player to move can see.
   */
  choose?(state: S, level: "easy" | "normal" | "hard", random: () => number): Move | null;
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
