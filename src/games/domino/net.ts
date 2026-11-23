import type { NetSpec } from "../../net/points";
import { createGame, type State } from "./rules";

/**
 * 도미노 over one Wi-Fi (와이파이 여럿이, the user asked): two devices, one hand each; 선공 (the host's seat) lays first.
 * The deal comes from the room's shared seed, so every device holds both hands and the pile (the "honest devices" of
 * `src/net/hidden.ts`); each device is shown its own seat's view: its hand as side 0, face up at the near edge, the
 * other's standing on end with its back to it, the pile face down, as against the computer. The rules are the same
 * for both sides, so a view is the state turned about and a move (a tile, an end of the line, the pile, a pass) is
 * the same in the room's terms.
 */
export function netView(s: State, seat: number): State {
  if (!seat) return s;
  return { ...s, hands: [s.hands[1], s.hands[0]], turn: s.turn ? 0 : 1, winner: s.winner === 0 ? 1 : s.winner === 1 ? 0 : s.winner };
}

export function dominoNet(colors: [string, string]): NetSpec<State> {
  return {
    seats: () => [
      { label: "선공", color: colors[0], kinds: ["computer"] },
      { label: "후공", color: colors[1], kinds: ["computer"] },
    ],
    create: (_variant, _options, _seated, random) => createGame(random),
    hidden: { view: netView, move: (move) => move },
  };
}
