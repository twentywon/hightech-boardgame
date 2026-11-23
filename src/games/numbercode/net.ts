import type { NetSpec } from "../../net/points";
import { playing, turned } from "../../net/hidden";
import type { GameOptions, Move, PointGame } from "../points/types";
import { chooseMove } from "./ai";
import { numberCode } from "./game";
import { GAP, HELPER, codeIndex, codeSeat, createGame, isJoker, isTileCode, play, tileCode, type State } from "./rules";

/**
 * 숫자 코드 over one Wi-Fi (와이파이 여럿이, the user asked): two to four devices, one row each, in the room's seat order
 * (a seat may be closed, or the host's computer's). Before the first turn every player places the jokers dealt to them
 * on their own device, all at once; then 1번 (the first seat in play) begins. A player whose tiles are all face up is
 * out and watches; the last one with a hidden tile wins. The deal comes from the room's shared seed (the "honest
 * devices" of `src/net/hidden.ts`); each device is shown its own seat's view: the table turned so that its row is the
 * near one (seat 0 of the game, as against the computers), the others following it to the left, their tiles with
 * their backs to it.
 *
 * Moves in the room's terms name a tile by the room's player (`tileCode(player, index)`); a view names it by the seat
 * of the view. The rest (the pool, a gap of my row, a number said, stop, go on, the helper) is the same in both.
 */
type Net = NonNullable<State["net"]>;
const record = (s: State): Net => s.net ?? { seats: Array.from({ length: s.seats }, (_, p) => p), waiting: s.rows.map(() => []), helpers: s.rows.map(() => s.helper), champion: null };
/** Whether jokers dealt are still being placed (before the first turn). */
const opening = (s: State) => record(s).waiting.some((w) => w.length > 0);
/** The player a room's seat is, or -1. */
const playerOf = (s: State, seat: number) => record(s).seats.indexOf(seat);
const shift = (seat: number, by: number, n: number) => (((seat + by) % n) + n) % n;
/** A tile code turned by `by` places; any other point as it is. */
const turnCode = (code: number, by: number, n: number) => (isTileCode(code) && codeSeat(code) < n ? tileCode(shift(codeSeat(code), by, n), codeIndex(code)) : code);

/** A new game over Wi-Fi: one player for each seat taken, every dealt joker still to be placed by its owner. */
export function netCreate(options: GameOptions, seated: boolean[], random: () => number): State {
  const seats = playing(seated).slice(0, 4),
    dealt = createGame({ ...options, rivals: Math.max(1, seats.length - 1) }, random),
    // The deal placed the others' jokers at random and kept the first player's: each takes theirs back to place.
    waiting = dealt.rows.map((row, p) => (p === 0 ? dealt.waiting : row.filter(isJoker))),
    rows = dealt.rows.map((row) => row.filter((id) => !isJoker(id)));
  return {
    ...dealt,
    rows,
    waiting: [],
    phase: dealt.pool.some((id) => id !== null) ? "draw" : "guess",
    net: { seats, waiting, helpers: rows.map(() => options.helper === true), champion: null },
  };
}

/** The state turned so that player `p` sits at seat 0 of the game, nothing masked. */
function seatedAt(s: State, p: number): State {
  const n = s.seats,
    net = record(s),
    back = (seat: number) => shift(seat, -p, n);
  return {
    ...s,
    rows: turned(s.rows, p),
    out: turned(s.out, p),
    seat: back(s.seat),
    fallen: s.fallen.map(back),
    last: s.last && { ...s.last, seat: back(s.last.seat), out: s.last.out.map(back) },
    waiting: net.waiting[p] ?? [],
    // Placing a dealt joker is my move whatever the turn: the game is shown with me to place it.
    ...(net.waiting[p]?.length ? { phase: "joker" as const, seat: 0, held: null, heldAt: null } : {}),
    helper: net.helpers[p] ?? s.helper,
    winner: s.winner === null || s.winner === "draw" ? s.winner : net.champion === p ? 0 : 1,
  };
}
/** What a room's seat's device shows (a seat not in the game sees the first player's). */
export const netView = (s: State, seat: number) => seatedAt(s, Math.max(0, playerOf(s, seat)));
/** A move of a seat's view, in the room's terms. */
export function netMove(move: Move, seat: number, s: State): Move {
  return { ...move, to: turnCode(move.to, Math.max(0, playerOf(s, seat)), s.seats) };
}

export function netPlay(s: State, move: Move, _random: () => number, seat: number): State | null {
  const p = playerOf(s, seat),
    net = record(s);
  if (p < 0 || s.winner !== null || move.from !== -1) return null;
  const helpers = () => net.helpers.map((on, k) => (k === p ? !on : on));
  if (opening(s)) {
    const left = net.waiting[p];
    if (!left.length) return null;
    if (move.to === HELPER && move.extra === -1) return { ...s, net: { ...net, helpers: helpers() } };
    const k = move.to - GAP;
    if (move.extra !== -1 || !Number.isInteger(k) || k < 0 || k > s.rows[p].length) return null;
    const rows = s.rows.map((row) => [...row]),
      waiting = net.waiting.map((w) => [...w]),
      joker = waiting[p].shift()!;
    rows[p].splice(k, 0, joker);
    return { ...s, rows, net: { ...net, waiting }, last: { kind: "joker", seat: p, target: null, said: null, tile: joker, out: [] }, ply: s.ply + 1 };
  }
  if (s.seat !== p) return null;
  if (move.to === HELPER && move.extra === -1) return { ...s, net: { ...net, helpers: helpers() } };
  // Played as seat 0 of the game, then turned back.
  const n = s.seats,
    done = play(seatedAt(s, p), { ...move, to: turnCode(move.to, -p, n) });
  if (!done) return null;
  const back = (seat: number) => shift(seat, p, n),
    next: State = {
      ...done,
      rows: turned(done.rows, shift(0, -p, n)),
      out: turned(done.out, shift(0, -p, n)),
      seat: back(done.seat),
      fallen: done.fallen.map(back),
      last: done.last && { ...done.last, seat: back(done.last.seat), out: done.last.out.map(back) },
      waiting: [],
      helper: s.helper,
      winner: null,
      net,
    };
  const alive = next.out.flatMap((out, k) => (out ? [] : [k]));
  if (alive.length <= 1) return { ...next, winner: 0, net: { ...net, champion: alive[0] ?? p } };
  return next;
}
/** Who may move: each player with a joker still to place, at once; then the player whose turn it is. */
export function netMovers(s: State) {
  const net = record(s);
  if (opening(s)) return net.waiting.flatMap((w, p) => (w.length ? [net.seats[p]] : []));
  return [net.seats[s.seat]];
}

/** The game the screen plays the views with: words for people, and the computer for whichever seat it plays. */
const viewed: PointGame<State> = {
  ...numberCode,
  choose: (s, level, random) => chooseMove(s, level, random),
  reason: (s) => (s.winner === 0 ? "다른 사람의 코드를 모두 풀었습니다." : "마지막까지 숨은 타일을 지켰습니다."),
};

/** The seats' colours, for the room's window. */
const COLOURS = ["#d9a521", "#2f62c0", "#c9392b", "#3f9a5a"];
export const numberCodeNet: NetSpec<State> = {
  seats: () =>
    ["1번", "2번", "3번", "4번"].map((label, i) => ({ label, color: COLOURS[i], kinds: i < 2 ? ["computer"] : ["computer", "closed"] })),
  create: (_variant, options, seated, random) => netCreate(options, seated, random),
  play: netPlay,
  movers: netMovers,
  toMove: (s) => netMovers(s)[0],
  winnerSeat: (s) => record(s).seats[record(s).champion ?? 0] ?? null,
  hidden: {
    view: netView,
    move: netMove,
    // Side 1 of a view is whoever else is to move (the status line names the seat).
    seatOf: (s, side, seat) => {
      if (!side) return seat;
      const to = netMovers(s).find((x) => x !== seat);
      return to ?? record(s).seats[shift(Math.max(0, playerOf(s, seat)), 1, s.seats)];
    },
    waiting: (s, seat) => (opening(s) && !record(s).waiting[playerOf(s, seat)]?.length ? "다른 사람이 받은 조커를 놓을 자리를 고르는 중입니다." : null),
    game: viewed,
  },
};
