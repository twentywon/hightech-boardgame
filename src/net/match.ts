import type { Random } from "../core/random";
import type { Move } from "../games/points/types";
import type { NetMove, StartInfo } from "./protocol";
import { streamFor } from "./random";

/** The seat to move is the host's device alone (hex conquest's map and start), or nobody (the game is over). */
export const HOST_ONLY = -1,
  NOBODY = -2;

/** What a room needs of a game: free of the page and of Three.js, like the rules it wraps. */
export interface NetRules<S> {
  /** The game a `start` lays, its chance drawn from `random` (stream 0 of the shared seed). */
  create(start: StartInfo, random: Random): S;
  /** The game's own `play`. */
  play(state: S, move: Move, random: Random): S | null;
  /** The seat to move: a seat's index, `HOST_ONLY` or `NOBODY`. */
  toMove(state: S): number;
  /** Words refusing a move the rules allow but a game over Wi-Fi does not; null lets it through. */
  allow?(state: S, move: Move): string | null;
  /** A move never taken back by an undo (janggi's formation, chosen before the first move). */
  firm?(move: Move): boolean;
}

/**
 * One game of a room as a list of moves from a start: the state after each, rebuilt by replaying through `play`,
 * each move's chance drawn from its own stream of the shared seed. Every device of a room keeps one; the host's is
 * the one that decides.
 */
export class Match<S> {
  readonly states: S[];
  readonly moves: NetMove[] = [];
  constructor(
    readonly rules: NetRules<S>,
    readonly start: StartInfo,
  ) {
    this.states = [rules.create(start, streamFor(start.seed, 0))];
  }
  get state(): S {
    return this.states[this.states.length - 1];
  }
  get ply(): number {
    return this.moves.length;
  }
  /** The seat to move now. */
  get toMove(): number {
    return this.rules.toMove(this.state);
  }
  /** The state `move` by `seat` would lead to, or the words why it may not be made. `host`: asked by the host's device. */
  try(move: Move, seat: number, host: boolean): { state: S } | { text: string } {
    const to = this.toMove;
    if (to === NOBODY) return { text: "게임이 끝났습니다." };
    if (to === HOST_ONLY ? !host : to !== seat) return { text: to === HOST_ONLY ? "방장이 고르는 차례입니다." : "상대 차례입니다." };
    const not = this.rules.allow?.(this.state, move);
    if (not) return { text: not };
    const next = this.rules.play(this.state, move, streamFor(this.start.seed, this.ply + 1));
    return next ? { state: next } : { text: "둘 수 없는 수입니다." };
  }
  /** Plays `move` for `seat` whoever's turn it is (the host has checked it): the new state, or null if illegal. */
  push(move: Move, seat: number): S | null {
    const next = this.rules.play(this.state, move, streamFor(this.start.seed, this.ply + 1));
    if (!next) return null;
    this.states.push(next);
    this.moves.push({ move, seat });
    return next;
  }
  /** Takes the list back to its first `length` moves. */
  truncate(length: number) {
    this.states.length = Math.max(0, length) + 1;
    this.moves.length = Math.max(0, length);
  }
  /** Plays a whole list after the start; false when one of it does not play (the match then holds what did). */
  replay(moves: readonly NetMove[]): boolean {
    this.truncate(0);
    for (const m of moves) if (!this.push(m.move, m.seat)) return false;
    return true;
  }
  /** How long the list is once the last move of `seat`, and everything after it, is taken back; null if it made none. */
  undoFor(seat: number): number | null {
    for (let i = this.moves.length - 1; i >= 0; i--) if (this.moves[i].seat === seat) return this.rules.firm?.(this.moves[i].move) ? null : i;
    return null;
  }
}
