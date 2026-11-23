import type { GameOptions, Move, PointGame } from "../games/points/types";
import { NOBODY, type NetRules } from "./match";
import type { SeatKind } from "./protocol";

/**
 * How a game is played over one Wi-Fi (와이파이 여럿이, the user asked): each device plays its own seat, and every
 * move goes through `play` on every device in the host's order (`src/net/`). Only games with nothing hidden, no
 * chance and no clock opt in. Left out, a game has two seats (its two sides, either may be the host's computer),
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
}
/** A point game as a room plays it: laid from the room's start and seed, the seat to move, what a room refuses. */
export function pointRules<S>(game: PointGame<S>, spec: NetSpec<S>): NetRules<S> {
  return {
    create: (start, random) => {
      const seated = start.seats.map((t) => t.kind !== "closed");
      return spec.create ? spec.create(start.variant, start.options, seated, random) : game.create(start.variant, start.options, random);
    },
    play: (s, move, random) => game.play(s, move, random),
    toMove: (s) => (game.winner(s) !== null ? NOBODY : (spec.toMove?.(s) ?? game.turn(s))),
    allow: spec.allow,
  };
}
