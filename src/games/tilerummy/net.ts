import type { NetSpec } from "../../net/points";
import type { Move, PointGame } from "../points/types";
import { MELD_BASE, REBUILD, chooseStep, createGame, play, tileRummy, type State } from "./rules";

/**
 * 타일 러미 over one Wi-Fi (와이파이 여럿이, the user asked): two devices, one rack each; 선공 (the host's seat) plays
 * first. Every tap of a turn (a tile picked up, a set laid, the turn reset or ended) is a move of the room, so the
 * other device sees the table change as it is worked on, as one sees the computer's. The deal comes from the room's
 * shared seed (the "honest devices" of `src/net/hidden.ts`); each device is shown its own seat's view: its rack as
 * side 0, the other's tiles standing with their backs to it, the bag closed, as against the computer.
 *
 * The rules are the same for both sides but for the computer's shortcuts, which side 1 alone has (`moves`): the
 * room plays a shortcut of either seat as side 1 plays it, so a computer standing in for either seat keeps them. A move
 * names tiles, sets and tools, the same in every seat's terms.
 */
export function flip(s: State): State {
  return { ...s, racks: [s.racks[1], s.racks[0]], opened: [s.opened[1], s.opened[0]], turn: s.turn ? 0 : 1, winner: s.winner === 0 ? 1 : s.winner === 1 ? 0 : s.winner };
}
export const netView = (s: State, seat: number) => (seat ? flip(s) : s);
export function netPlay(s: State, move: Move, _random: () => number, seat: number): State | null {
  if (s.turn !== seat) return null;
  // A person's tap is played as side 0 plays it; a computer's shortcut as side 1, which alone has them (and whose
  // moves take a search to list, spared for a tap).
  const side = move.from >= 0 || move.to === REBUILD || move.to >= MELD_BASE ? 1 : 0,
    next = play(seat === side ? s : flip(s), move);
  return next && (seat === side ? next : flip(next));
}
/** The game the screen plays the views with: the computer plays its seat as side 1 does, shortcuts and all. */
const viewed: PointGame<State> = { ...tileRummy, choose: (s, level, random) => chooseStep(flip(s), level, random) };

export function tileRummyNet(colors: [string, string]): NetSpec<State> {
  return {
    seats: () => [
      { label: "선공", color: colors[0], kinds: ["computer"] },
      { label: "후공", color: colors[1], kinds: ["computer"] },
    ],
    create: (_variant, _options, _seated, random) => createGame(random),
    play: netPlay,
    hidden: { view: netView, move: (move) => move, game: viewed },
  };
}
