import type { NetSpec } from "../../net/points";
import { playing, turned } from "../../net/hidden";
import type { GameOptions, Move, PointGame } from "../points/types";
import { chooseMove } from "./ai";
import { numberCode } from "./game";
import { GAP, HELPER, READY, codeIndex, codeSeat, createGame, isJoker, isTileCode, play, tileCode, type State } from "./rules";

/**
 * 숫자 코드 over one Wi-Fi (와이파이 여럿이, the user asked): two to four devices, one row each, in the room's seat order
 * (a seat may be closed, or the host's computer's). Before the first turn (when jokers are in) every player arranges
 * their row on their own device, all at once: places any joker dealt to them, and says 배열 완료 (`READY`), joker or
 * none. Nobody can tell who had a joker or where it went (the user asked): while the rows are being arranged each
 * device shows its own row alone; the others' come out together when all are done; placing a joker is not counted
 * as a move (only 배열 완료 is, once each) and leaves no trace in `last`. Then 1번 (the first seat in play) begins. A player whose tiles are all face up is
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
/** Whether player `p` has still to arrange its row (a joker to place, or 배열 완료 to say). */
const arranging = (s: State, p: number) => {
  const net = record(s);
  return (net.waiting[p]?.length ?? 0) > 0 || net.ready?.[p] === false;
};
/** Whether the rows are still being arranged (before the first turn). */
const opening = (s: State) => record(s).seats.some((_, p) => arranging(s, p));
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
    // With jokers in, every player says its row is arranged (joker or none); without, there is nothing to arrange.
    net: { seats, waiting, ready: rows.map(() => !dealt.jokers), helpers: rows.map(() => options.helper === true), champion: null },
  };
}

/** The state turned so that player `p` sits at seat 0 of the game, nothing masked. */
function seatedAt(s: State, p: number): State {
  const n = s.seats,
    net = record(s),
    back = (seat: number) => shift(seat, -p, n),
    // While the rows are being arranged, the others' are not shown (their tiles come out together at the start).
    secret = opening(s);
  return {
    ...s,
    rows: turned(s.rows, p).map((row, k) => (secret && k > 0 ? [] : row)),
    out: turned(s.out, p),
    seat: back(s.seat),
    fallen: s.fallen.map(back),
    last: s.last && { ...s.last, seat: back(s.last.seat), out: s.last.out.map(back) },
    waiting: net.waiting[p] ?? [],
    // Arranging my row is my move whatever the turn: the game is shown with me to place a joker, or to say it is done.
    ...(arranging(s, p) ? { phase: net.waiting[p]?.length ? ("joker" as const) : ("arrange" as const), seat: 0, held: null, heldAt: null } : {}),
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
    if (!arranging(s, p) || move.extra !== -1) return null;
    if (move.to === HELPER) return { ...s, net: { ...net, helpers: helpers() } };
    if (!net.waiting[p].length) {
      // 배열 완료: the one move of the opening that counts (every player makes it, joker or none).
      if (move.to !== READY) return null;
      const ready = (net.ready ?? net.seats.map(() => true)).map((r, k) => (k === p ? true : r));
      return { ...s, net: { ...net, ready }, ply: s.ply + 1 };
    }
    // A joker placed: not counted, and nothing said of it (`last` is left as it was).
    const k = move.to - GAP;
    if (!Number.isInteger(k) || k < 0 || k > s.rows[p].length) return null;
    const rows = s.rows.map((row) => [...row]),
      waiting = net.waiting.map((w) => [...w]),
      joker = waiting[p].shift()!;
    rows[p].splice(k, 0, joker);
    return { ...s, rows, net: { ...net, waiting } };
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
/** Who may move: each player still arranging its row, at once; then the player whose turn it is. */
export function netMovers(s: State) {
  const net = record(s);
  if (opening(s)) return net.seats.flatMap((seat, p) => (arranging(s, p) ? [seat] : []));
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
    // Who was dealt a joker is nobody else's to know (the user asked): everyone arranges, and the wait is the same for all.
    waiting: (s, seat) => (opening(s) && !arranging(s, Math.max(0, playerOf(s, seat))) ? "다른 사람이 패를 정리하는 중입니다." : null),
    game: viewed,
  },
};
