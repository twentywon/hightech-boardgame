import type { NetSpec } from "../../net/points";
import type { Move, PointGame } from "../points/types";
import { BACK, ENTER, GUESS_BASE, chooseGuess, code, createGame, digitsOf, hitBlow, judge, type State } from "./rules";

/**
 * 숫자야구 over one Wi-Fi (와이파이 여럿이, the user asked): two devices, each choosing its own number on its own device
 * at the same time; once both have chosen, 선공 (the host's seat) throws first and the two throw in turn, the same
 * number of times, as against the computer. The room's state keeps both numbers and what each seat has keyed in
 * (`State.net`); each device is shown its own seat's view (`src/net/hidden.ts`): its own number and keys as side 0,
 * the other's number masked (an empty list) until the game ends.
 *
 * Moves in the room's terms are those of the view: a digit key (0–9), `BACK` and `ENTER` of the seat that moves, or a
 * whole number `GUESS_BASE` + its digits (the host's computer, choosing or throwing for a seat at once).
 */
const other = (seat: number) => (seat ? 0 : 1) as 0 | 1;
const record = (s: State) => s.net ?? { secrets: [null, null] as [null, null], entries: [[], []] as [number[], number[]] };

/** A new game over Wi-Fi: neither number chosen yet. */
export function netCreate(variant: string): State {
  const base = createGame(variant.startsWith("4") ? 4 : 3, () => 0, variant.endsWith("d"));
  return { ...base, secrets: [null, []], net: { secrets: [null, null], entries: [[], []] } };
}
/** Whether a number of digits may be chosen or thrown. */
const fits = (s: State, digits: number[]) =>
  digits.length === s.size && digits.every((d) => Number.isInteger(d) && d >= 0 && d <= 9) && (s.repeat || new Set(digits).size === digits.length);

export function netPlay(s: State, move: Move, _random: () => number, seat: number): State | null {
  if ((seat !== 0 && seat !== 1) || move.from !== -1 || move.extra !== -1 || s.winner !== null) return null;
  const net = record(s),
    choosing = s.phase === "secret";
  if (choosing ? net.secrets[seat] !== null : s.turn !== seat) return null;
  const entry = net.entries[seat],
    entries: [number[], number[]] = [net.entries[0], net.entries[1]],
    keyed = (next: number[]): State => {
      entries[seat] = next;
      return { ...s, net: { secrets: net.secrets, entries } };
    };
  let digits: number[];
  if (move.to >= GUESS_BASE) {
    if (move.to >= GUESS_BASE + 10 ** s.size) return null;
    digits = digitsOf(move.to, s.size);
  } else if (move.to >= 0 && move.to <= 9) {
    return entry.length < s.size && (s.repeat || !entry.includes(move.to)) ? keyed([...entry, move.to]) : null;
  } else if (move.to === BACK) return entry.length ? keyed(entry.slice(0, -1)) : null;
  else if (move.to === ENTER) digits = entry;
  else return null;
  if (!fits(s, digits)) return null;
  entries[seat] = [];
  if (choosing) {
    const secrets: [number[] | null, number[] | null] = [net.secrets[0], net.secrets[1]];
    secrets[seat] = digits;
    return { ...s, net: { secrets, entries }, phase: secrets.every(Boolean) ? "play" : "secret", turn: 0 };
  }
  if (s.guesses[seat].some((g) => g.digits.join() === digits.join())) return null;
  const guess = { digits, ...judge(net.secrets[other(seat)]!, digits) },
    guesses: State["guesses"] = [s.guesses[0], s.guesses[1]];
  guesses[seat] = [...guesses[seat], guess];
  const next: State = { ...s, net: { secrets: net.secrets, entries }, guesses, turn: other(seat), ply: s.ply + 1 };
  // A round ends with 후공's throw: whoever found the other's number in it wins, both a draw.
  if (seat === 1) {
    const first = guesses[0][guesses[0].length - 1].strikes === s.size,
      second = guess.strikes === s.size;
    next.winner = first && second ? "draw" : first ? 0 : second ? 1 : null;
  }
  return next;
}
/** Who may move: both, while either has still to choose; then the one throwing. */
export const netMovers = (s: State) => (s.phase === "secret" ? [0, 1].filter((seat) => record(s).secrets[seat] === null) : [s.turn]);

/** What `seat`'s device shows: its number and keys as side 0; the other's number only once the game is over. */
export function netView(s: State, seat: number): State {
  const net = record(s),
    mine = net.secrets[seat],
    theirs = net.secrets[other(seat)],
    over = s.winner !== null,
    mover = s.phase === "secret" ? mine === null : s.turn === seat;
  return {
    size: s.size,
    repeat: s.repeat,
    phase: mine ? "play" : "secret",
    secrets: [mine, over ? (theirs ?? []) : []],
    entry: net.entries[seat],
    guesses: [s.guesses[seat], s.guesses[other(seat)]],
    turn: mover ? 0 : 1,
    winner: s.winner === null || s.winner === "draw" ? s.winner : s.winner === seat ? 0 : 1,
    ply: s.ply,
  };
}

/** The game the screen plays the views with: words for a person on the other side, and a computer for any seat. */
const viewed: PointGame<State> = {
  ...hitBlow,
  // The computer chooses its number at random; it throws from the answers its own throws got (as `chooseGuess` does for side 1).
  choose: (s, level, random) => {
    if (s.winner !== null || s.turn !== 0) return null;
    if (s.phase === "secret") {
      const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        digits: number[] = [];
      while (digits.length < s.size) digits.push(s.repeat ? Math.floor(random() * 10) : pool.splice(Math.floor(random() * pool.length), 1)[0]);
      return { from: -1, to: code(digits), extra: -1 };
    }
    return chooseGuess({ ...s, turn: 1, entry: [], guesses: [s.guesses[1], s.guesses[0]] }, level, random);
  },
  reason: (s) => `상대의 숫자는 ${s.secrets[1].join("")}, 내 숫자는 ${s.secrets[0]?.join("") ?? ""}였습니다.`,
};

export function hitBlowNet(colors: [string, string]): NetSpec<State> {
  return {
    seats: () => [
      { label: "선공", color: colors[0], kinds: ["computer"] },
      { label: "후공", color: colors[1], kinds: ["computer"] },
    ],
    create: (variant) => netCreate(variant),
    play: netPlay,
    movers: netMovers,
    toMove: (s) => netMovers(s)[0] ?? s.turn,
    hidden: {
      view: netView,
      // The view's keys are the room's.
      move: (move) => move,
      waiting: (s, seat) => (s.phase === "secret" && record(s).secrets[seat] !== null ? "상대가 숫자를 정하는 중입니다. 다 정하면 선공부터 던집니다." : null),
      game: viewed,
    },
  };
}
