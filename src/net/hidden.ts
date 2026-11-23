import type { Move, PointGame } from "../games/points/types";

/**
 * Hidden information over one Wi-Fi (와이파이 여럿이, the user asked): hands, fleets and secret numbers. Each device
 * shows only what its own seat may see; the rest of the room is played as for every other game, one move list
 * replayed through `play` on every device (`match.ts`, `room.ts`).
 *
 * The model is "honest devices": every device keeps the whole game in memory (the deal comes from the room's
 * shared seed, and a secret chosen on one device travels to the others as a move), and only the screen hides what
 * is not its seat's. Nothing is kept from a device that reads its own memory; the room is for friends on one Wi-Fi,
 * not for strangers. Keeping secrets on the host alone would mean sending each guest a view of its own instead of
 * the moves, a second kind of room: not done.
 *
 * A point game opts in with `NetSpec.hidden` (`points.ts`), beside its `create`, `play` (told the seat that moves),
 * `toMove` and, where several seats choose a secret at once, `movers`. The screen (`src/ui/point-game.ts`) then
 *  - shows `view(state, mySeat)`: the room's state turned so that this seat is side 0, as against the computer (the
 *    game's own view draws side 0 open and the others hidden), with what this seat may not know masked where the
 *    game can do without it;
 *  - takes the moves made on that view and sends `move(m, mySeat, state)`, the same move in the room's terms;
 *  - lets the host's computer play a computer seat, or one whose device dropped, from that seat's own view (its
 *    `choose` sees nothing more than a person in that seat would);
 *  - draws the view as against the computer (the 6th argument of `PointConfig.view` is true over Wi-Fi), so no
 *    pass-the-device curtain ever comes up: each person has a device.
 * `view` must be a pure function of the state and the seat: every device draws its own seat from its own copy.
 */
export interface HiddenView<S> {
  /**
   * The state as `seat` sees it, in the game's one-device form: `seat` is side 0 (the near side, as against the
   * computer) and the others follow in seat order. Anything `seat` may not know (another's secret, a ship not yet
   * hit) is masked where the game's rules and view can do without it, and shown once the rules reveal it (a ship
   * sunk, the end of the game). It is what the screen and a computer for that seat play from.
   */
  view(state: S, seat: number): S;
  /** A move made on `view(state, seat)` (by the person at that device or by a computer for that seat), in the room's terms. */
  move(move: Move, seat: number, state: S): Move;
  /** The room's seat that side `side` of `view(state, seat)` stands for (side 0 is `seat`); left out: two seats, side 1 the other. */
  seatOf?(state: S, side: number, seat: number): number;
  /** The status line of `seat` while it waits on others choosing at once (their fleets, their numbers); null: the usual words. */
  waiting?(state: S, seat: number): string | null;
  /**
   * The game as the screen plays the views over Wi-Fi, where it differs from the game itself: words for people
   * (상대 rather than 컴퓨터), and a `choose` that plays any seat from its view (a secret chosen, a fleet laid).
   */
  game?: PointGame<S>;
}

/** The room's seats that are in a game (a person's or a computer's), in order: the game's players are these. */
export const playing = (seated: boolean[]) => seated.flatMap((on, seat) => (on ? [seat] : []));

/** A list turned so that it begins at `by` (the seat looking first, the others after it in order). */
export const turned = <X>(list: readonly X[], by: number): X[] => list.map((_, i) => list[(i + by) % list.length]);

/**
 * The value kept from the last call of the same `slot` when it is equal to `value` (by its JSON), else `value`:
 * for a view that rebuilds what it draws whenever an object is a new one (배틀십's fleets), since a view of the
 * state is made afresh at every move.
 */
const kept = new Map<string, { json: string; value: unknown }>();
export function steady<X>(slot: string, value: X): X {
  const json = JSON.stringify(value),
    last = kept.get(slot);
  if (last && last.json === json) return last.value as X;
  kept.set(slot, { json, value });
  return value;
}
