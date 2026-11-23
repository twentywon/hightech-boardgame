import type { NetSpec } from "../../net/points";
import { steady } from "../../net/hidden";
import type { Move, PointGame } from "../points/types";
import { CELLS, FLEET, LAY_REST, aimShot, play, seaBattle, sunk, type Ship, type State } from "./rules";

/**
 * 배틀십 over one Wi-Fi (와이파이 여럿이, the user asked): two devices, each laying its own fleet on its own device at
 * the same time, then 선공 (the host's seat) fires first. The room's state has both fleets; each device is shown its
 * own seat's view (`src/net/hidden.ts`): its own chart open as side 0, the other's ships masked until they are hit
 * (a square hit is known, the rest of the ship is not) and shown whole once sunk or at the end.
 *
 * Moves in the room's terms: while laying, a square of the mover's own waters (0–99), `TURN_SHIP` or `LAY_REST`
 * (the seat that moves tells whose fleet); in the battle, a square of the waters fired at (0–99 seat 0's, 100–199
 * seat 1's), as at one screen.
 */
const other = (seat: number) => (seat ? 0 : 1);
/** The state turned about: seat 1 is side 0. */
function flip(s: State): State {
  return {
    ...s,
    fleets: [s.fleets[1], s.fleets[0]],
    shots: [s.shots[1], s.shots[0]],
    turn: other(s.turn) as 0 | 1,
    winner: s.winner === 0 ? 1 : s.winner === 1 ? 0 : s.winner,
    last: s.last && { ...s.last, point: (s.last.point + CELLS) % (CELLS * 2) },
  };
}
const full = (s: State, seat: number) => s.fleets[seat].length >= FLEET.length;
/** The game as `seat` plays it, nothing masked: its fleet as side 0, laying it until it is laid, its own way of turning the next ship. */
function own(s: State, seat: number): State {
  const turned = seat ? flip(s) : s;
  return { ...turned, phase: full(s, seat) ? "battle" : "place", across: s.net?.across[seat] ?? true };
}
/** A ship of the other's as `seat` knows it: the squares hit, the rest unknown (-1), until it is sunk. */
const masked = (s: State, side: number, ship: Ship): Ship => (sunk(s, side, ship) ? ship : { name: ship.name, cells: ship.cells.map((c) => (s.shots[side][c] ? c : -1)) });

/** A new game over Wi-Fi: both fleets still to be laid, each by its own seat. */
export const netCreate = (): State => ({
  phase: "place",
  across: true,
  fleets: [[], []],
  shots: [Array(CELLS).fill(false), Array(CELLS).fill(false)],
  turn: 0,
  winner: null,
  last: null,
  ply: 0,
  net: { across: [true, true] },
});

export function netPlay(s: State, move: Move, random: () => number, seat: number): State | null {
  if (seat !== 0 && seat !== 1) return null;
  if (s.phase === "battle") return s.turn === seat ? play(s, move, random) : null;
  if (full(s, seat)) return null;
  const done = play(own(s, seat), move, random);
  if (!done) return null;
  const back = seat ? flip(done) : done,
    across: [boolean, boolean] = [...(s.net?.across ?? [true, true])] as [boolean, boolean];
  across[seat] = done.across;
  const fleets: [Ship[], Ship[]] = seat ? [s.fleets[0], back.fleets[1]] : [back.fleets[0], s.fleets[1]];
  return { ...s, fleets, net: { across }, phase: fleets.every((f) => f.length >= FLEET.length) ? "battle" : "place" };
}
/** Who may move: both, while laying (each its own fleet); then the one firing. */
export const netMovers = (s: State) => (s.phase === "place" ? [0, 1].filter((seat) => !full(s, seat)) : [s.turn]);

/** What `seat`'s device shows. */
export function netView(s: State, seat: number): State {
  const v = own(s, seat);
  if (v.winner !== null) return v;
  // Kept the same object while nothing new is known, as the view builds the ships anew for a new one.
  const fleets = steady<[Ship[], Ship[]]>(`seabattle:${seat}`, [v.fleets[0], v.fleets[1].map((ship) => masked(v, 1, ship))]);
  return { ...v, fleets };
}
/** A move of `seat`'s view in the room's terms: a shot of seat 1 falls on the other half of the points. */
export function netMove(move: Move, seat: number, s: State): Move {
  if (s.phase === "place" || !seat || move.to < 0 || move.to >= CELLS * 2) return move;
  return { ...move, to: (move.to + CELLS) % (CELLS * 2) };
}

/** The game the screen plays the views with: a computer seat lays its fleet at random, then fires as against a person. */
const viewed: PointGame<State> = {
  ...seaBattle,
  choose: (s, level, random) => (s.phase === "place" ? { from: -1, to: LAY_REST, extra: -1 } : aimShot(s, level, random)),
};

export function seaBattleNet(colors: [string, string]): NetSpec<State> {
  return {
    seats: () => [
      { label: "선공", color: colors[0], kinds: ["computer"] },
      { label: "후공", color: colors[1], kinds: ["computer"] },
    ],
    create: () => netCreate(),
    play: netPlay,
    movers: netMovers,
    toMove: (s) => netMovers(s)[0] ?? s.turn,
    hidden: {
      view: netView,
      move: netMove,
      waiting: (s, seat) => (s.phase === "place" && full(s, seat) ? "상대가 배를 놓는 중입니다. 다 놓으면 선공부터 쏩니다." : null),
      game: viewed,
    },
  };
}
