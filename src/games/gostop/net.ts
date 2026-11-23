import type { NetSpec } from "../../net/points";
import type { Move, PointGame } from "../points/types";
import { aliases, blindOf, masksFor } from "../deck/blind";
import { CARDS, createGame, gostop, play, type State } from "./rules";

/**
 * 고스톱 (맞고) over one Wi-Fi (와이파이 여럿이, the user asked): two devices across the blanket, one hand each; 선공 (the
 * host's seat) is 선 and plays first. The deal comes from the room's shared seed (the "honest devices" of
 * `src/net/hidden.ts`); each device is shown its own seat's view: its hand near, as against the computer, the other's
 * hand and the pile blind cards (`deck/blind.ts`) until the game is over. Every choice is a move of the seat whose turn
 * it is, made on its own device: go or stop, shaking or a bomb, which of two floor cards to take, September's animal.
 * The card a player is about to play (lifted while it asks to shake or which card to take) and the three shown when
 * shaking are in sight of both, as at a real blanket.
 */
type Net = NonNullable<State["net"]>;
const net = (s: State): Net => s.net ?? { masks: Array.from({ length: CARDS }, (_, i) => i) };
const pair = <X>(p: [X, X]): [X, X] => [p[1], p[0]];
const other = (side: 0 | 1) => (side ? 0 : 1) as 0 | 1;
/** The state with its two sides changed round (side 0 is seat 1). */
export function flip(s: State): State {
  const stuck: Record<number, 0 | 1> = {};
  for (const [month, side] of Object.entries(s.stuck)) stuck[Number(month)] = other(side);
  return {
    ...s,
    hands: pair(s.hands),
    taken: pair(s.taken),
    turn: other(s.turn),
    first: other(s.first),
    gukjin: pair(s.gukjin),
    shakes: pair(s.shakes),
    bombs: pair(s.bombs),
    dummies: pair(s.dummies),
    gos: pair(s.gos),
    saidAt: pair(s.saidAt),
    stuck,
    last: s.last && { ...s.last, side: other(s.last.side), achieved: pair(s.last.achieved) },
    winner: s.winner === 0 || s.winner === 1 ? other(s.winner) : s.winner,
    resume: s.resume && { ...s.resume, base: flip(s.resume.base) },
  };
}
/** A new game over Wi-Fi: 1번's hand first, 1번 the 선. */
export function netCreate(random: () => number): State {
  return { ...createGame(random, 0), net: { masks: masksFor(CARDS, random) } };
}
export function netPlay(s: State, move: Move, _random: () => number, seat: number): State | null {
  if (s.turn !== seat || s.winner !== null) return null;
  return play(s, move);
}
/** `s` (already turned so that the seat is side 0) with what side 0 may not see blind. */
function masked(s: State, masks: number[]): State {
  const over = s.winner !== null,
    lifted = s.pending !== null && (s.phase === "declare" || s.phase === "choose") ? [s.pending] : [],
    seen = new Set([...s.hands[0], ...s.floor, ...s.taken[0], ...s.taken[1], ...lifted, ...(s.last?.shown ?? []), ...(over ? s.hands[1] : [])]),
    see = (id: number) => (seen.has(id) ? id : blindOf(masks, id)),
    { net: _, ...rest } = s;
  return {
    ...rest,
    hands: [s.hands[0], s.hands[1].map(see)],
    pile: s.pile.map(see),
    last: s.last && { ...s.last, drawn: s.last.drawn === null ? null : see(s.last.drawn) },
    resume: s.resume && { ...s.resume, base: masked(s.resume.base, masks) },
    blinds: aliases(masks, seen),
  };
}
/** What a room's seat's device shows: its hand near, the other's and the pile blind until the end. */
export const netView = (s: State, seat: number) => masked(seat ? flip(s) : s, net(s).masks);

/** The game the screen plays the views with: 상대 for 컴퓨터. */
const viewed: PointGame<State> = { ...gostop, play: (s, move) => play(s, move), hint: (s) => gostop.hint(s).replace("컴퓨터", "상대") };

export function gostopNet(colors: [string, string]): NetSpec<State> {
  return {
    seats: () => [
      { label: "선공", color: colors[0], kinds: ["computer"] },
      { label: "후공", color: colors[1], kinds: ["computer"] },
    ],
    create: (_variant, _options, _seated, random) => netCreate(random),
    play: netPlay,
    hidden: { view: netView, move: (move) => move, game: viewed },
  };
}
