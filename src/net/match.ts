import type { Random } from "../core/random";
import type { Move } from "../games/points/types";
import type { NetMove, StartInfo } from "./protocol";
import { streamFor } from "./random";
import { adopt } from "./settled";

/** The seat to move is the host's device alone (hex conquest's map and start), or nobody (the game is over). */
export const HOST_ONLY = -1,
  NOBODY = -2;

/** What a room needs of a game: free of the page and of Three.js, like the rules it wraps. */
export interface NetRules<S> {
  /** The game a `start` lays, its chance drawn from `random` (stream 0 of the shared seed). */
  create(start: StartInfo, random: Random): S;
  /** The game's own `play`; `seat` is the seat that moves (`HOST_ONLY` for the host's own), for games whose seats move at once. */
  play(state: S, move: Move, random: Random, seat?: number): S | null;
  /** The seat to move: a seat's index, `HOST_ONLY` or `NOBODY`. */
  toMove(state: S): number;
  /** Words refusing a move the rules allow but a game over Wi-Fi does not; null lets it through. */
  allow?(state: S, move: Move): string | null;
  /** A move never taken back by an undo (janggi's formation, chosen before the first move). */
  firm?(move: Move): boolean;
  /**
   * The host's state after each move goes with it and every other device takes it over its own (`settled.ts`): for
   * a shot game, whose `play` runs floating-point physics that two engines might end a hair apart.
   */
  settled?: boolean;
  /**
   * The seats that may move now, for a game where several may at once (secrets each player chooses on their own
   * device: 배틀십's fleets, 숫자야구's numbers); left out, only the one `toMove` names. `toMove` still names one of
   * them (the one the status lines speak of), and nobody may move while it is `HOST_ONLY` or `NOBODY`.
   */
  movers?(state: S): number[];
}

/**
 * One game of a room as a list of moves from a start: the state after each, rebuilt by replaying through `play`,
 * each move's chance drawn from its own stream of the shared seed and of the salt the host drew for it (kept in the
 * list, so a replay draws the same). Every device of a room keeps one; the host's is the one that decides.
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
  /** Every seat that may move now (`NetRules.movers`): the one to move, or several choosing at once; none when it is over or the host's alone. */
  get movers(): number[] {
    const to = this.toMove;
    return to < 0 ? [] : (this.rules.movers?.(this.state) ?? [to]);
  }
  /**
   * The state `move` by `seat` would lead to, or the words why it may not be made. `host`: asked by the host's device.
   * `salt`: the one the move will be played with (a guest checking its own move knows none yet: its chance may differ).
   */
  try(move: Move, seat: number, host: boolean, salt = 0): { state: S } | { text: string } {
    const to = this.toMove;
    if (to === NOBODY) return { text: "게임이 끝났습니다." };
    if (to === HOST_ONLY ? !host : !this.movers.includes(seat)) return { text: to === HOST_ONLY ? "방장이 고르는 차례입니다." : "상대 차례입니다." };
    const not = this.rules.allow?.(this.state, move);
    if (not) return { text: not };
    const next = this.rules.play(this.state, move, this.stream(salt), seat);
    return next ? { state: next } : { text: "둘 수 없는 수입니다." };
  }
  /** The chance of the next move under `salt`. */
  private stream(salt: number) {
    return streamFor(this.start.seed, this.ply + 1, salt);
  }
  /**
   * Plays `move` for `seat` whoever's turn it is (the host has checked it), its chance under `salt`: the new state, or
   * null if illegal. `settled`: the host's state after it, for a game whose rules are `settled`, taken over this
   * device's own (and played even where this device's own play refused the move).
   */
  push(move: Move, seat: number, salt = 0, settled?: unknown): S | null {
    const played = this.rules.play(this.state, move, this.stream(salt), seat),
      next = this.rules.settled && settled !== undefined ? adopt(played, settled, this.state) : played;
    if (!next) return null;
    this.states.push(next);
    this.moves.push(salt ? { move, seat, salt } : { move, seat });
    return next;
  }
  /** Takes the list back to its first `length` moves. */
  truncate(length: number) {
    this.states.length = Math.max(0, length) + 1;
    this.moves.length = Math.max(0, length);
  }
  /**
   * Plays a whole list after the start; false when one of it does not play (the match then holds what did).
   * `settled`: the host's state after the last, for a `settled` game; a move of it this device's own play refuses
   * (its numbers had parted from the host's) then keeps the list going, and the host's state ends it.
   */
  replay(moves: readonly NetMove[], settled?: unknown): boolean {
    this.truncate(0);
    const carried = !!this.rules.settled && settled !== undefined;
    for (const m of moves)
      if (!this.push(m.move, m.seat, m.salt ?? 0)) {
        if (!carried) return false;
        this.states.push(this.state);
        this.moves.push(m.salt ? { move: m.move, seat: m.seat, salt: m.salt } : { move: m.move, seat: m.seat });
      }
    if (carried) this.states[this.states.length - 1] = adopt(this.state, settled, this.state) ?? this.state;
    return true;
  }
  /** How long the list is once the last move of `seat`, and everything after it, is taken back; null if it made none. */
  undoFor(seat: number): number | null {
    for (let i = this.moves.length - 1; i >= 0; i--) if (this.moves[i].seat === seat) return this.rules.firm?.(this.moves[i].move) ? null : i;
    return null;
  }
}
