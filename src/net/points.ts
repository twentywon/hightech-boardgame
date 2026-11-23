import type { GameOptions, Move, PointGame } from "../games/points/types";
import { NOBODY, type NetRules } from "./match";
import type { SeatKind } from "./protocol";
import type { HiddenView } from "./hidden";

/**
 * How a game is played over one Wi-Fi (와이파이 여럿이, the user asked): each device plays its own seat, and every
 * move goes through `play` on every device in the host's order (`src/net/`). Games with no clock opt in; a game with
 * hidden hands or secrets sets `hidden` (`src/net/hidden.ts`), so that each device shows only its own seat's view; chance (dice) is drawn from the `random` passed to `play`, which the host salts as it takes each move. Left out, a game has two seats (its two sides, either may be the host's computer),
 * is laid by `create` with the room's shared random stream, and the seat to move is `turn`.
 */
export interface NetSpec<S> {
  /** The seats: a name, a colour, and what the host may make an empty one (a computer's, closed). */
  seats?: (variant: string) => { label: string; color: string; kinds: SeatKind[] }[];
  /** The game a room starts, `seated` saying which seats a person or computer took. */
  create?: (variant: string, options: GameOptions, seated: boolean[], random: () => number) => S;
  /** The seat to move (`HOST_ONLY`: the host's device alone; `NOBODY`: over). */
  toMove?: (state: S) => number;
  /** The seat a side's name stands for in the status line, when it is not the side itself. */
  seatOf?: (state: S, player: number) => number;
  /** Words refusing a move the rules allow but a room does not. */
  allow?: (state: S, move: Move) => string | null;
  /** The seat that won, when it is not the side `winner` names. */
  winnerSeat?: (state: S) => number | null;
  /** False: no computer plays the seat of someone whose device dropped (it waits). */
  standIn?: boolean;
  /** The fewest people seated (2). */
  least?: number;
  /**
   * A shot game: the host's state after each move goes with it and every device takes it (`NetRules.settled`,
   * `settled.ts`), so floating-point physics that two engines end a hair apart cannot part the devices.
   */
  settled?: boolean;
  /** The variant a room plays for the one chosen in the setup (a variant played alone becomes the one for two). */
  variant?: (variant: string) => string;
  // ── Hidden information (`src/net/hidden.ts`): each device shows only what its own seat may see. ──
  /** The game's play as a room plays it, told the seat that moves (left out: `game.play`). */
  play?: (state: S, move: Move, random: () => number, seat: number) => S | null;
  /** The seats that may move now, when several may at once (secrets chosen on each device: `NetRules.movers`). */
  movers?: (state: S) => number[];
  /** What each seat's device shows: the state as that seat sees it, and its moves put back in the room's terms. */
  hidden?: HiddenView<S>;
}
/** A point game as a room plays it: laid from the room's start and seed, the seat to move, what a room refuses. */
export function pointRules<S>(game: PointGame<S>, spec: NetSpec<S>): NetRules<S> {
  return {
    create: (start, random) => {
      const seated = start.seats.map((t) => t.kind !== "closed");
      return spec.create ? spec.create(start.variant, start.options, seated, random) : game.create(start.variant, start.options, random);
    },
    play: (s, move, random, seat) => (spec.play ? spec.play(s, move, random, seat ?? -1) : game.play(s, move, random)),
    toMove: (s) => (game.winner(s) !== null ? NOBODY : (spec.toMove?.(s) ?? game.turn(s))),
    allow: spec.allow,
    settled: spec.settled,
    ...(spec.movers ? { movers: spec.movers } : {}),
  };
}
