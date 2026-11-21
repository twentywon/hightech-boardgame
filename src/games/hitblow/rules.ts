import { cryptoRandom, type Random } from "../../core/random";
import type { Effect, Move, PointGame, Winner } from "../points/types";
import type { Level } from "../points/ai";

/**
 * Number baseball: each side hides a number of different digits and the two
 * take turns to guess the other's. A digit in its right place is a strike,
 * a right digit in the wrong place a ball. Both guess the same number of
 * times; whoever finds the other's number first wins.
 * Points 0–9 are the digit keys, then the two below; the computer's whole
 * guess is one move to `GUESS_BASE` + its digits read as a number.
 */
export const BACK = 10,
  ENTER = 11,
  GUESS_BASE = 100;
export interface Guess {
  digits: number[];
  strikes: number;
  balls: number;
}
export interface State {
  size: number;
  /** Whether a digit may come more than once in a number. */
  repeat: boolean;
  /** "secret" while side 0 still chooses its own number. */
  phase: "secret" | "play";
  secrets: [number[] | null, number[]];
  /** The digits side 0 has keyed in so far. */
  entry: number[];
  guesses: [Guess[], Guess[]];
  turn: 0 | 1;
  winner: Winner;
  ply: number;
}
/** Every number of `size` different digits. */
const numbers = new Map<string, number[][]>();
export function allNumbers(size: number, repeat = false) {
  const key = `${size}${repeat}`,
    known = numbers.get(key);
  if (known) return known;
  const out: number[][] = [],
    build = (digits: number[]) => {
      if (digits.length === size) return void out.push(digits);
      for (let d = 0; d <= 9; d++) if (repeat || !digits.includes(d)) build([...digits, d]);
    };
  build([]);
  numbers.set(key, out);
  return out;
}
export function judge(secret: number[], digits: number[]) {
  let strikes = 0,
    balls = 0;
  // Digits out of place are matched one for one, so a digit that comes twice is not counted more often than it is there.
  const left = Array<number>(10).fill(0),
    thrown: number[] = [];
  digits.forEach((d, i) => {
    if (secret[i] === d) strikes++;
    else {
      left[secret[i]]++;
      thrown.push(d);
    }
  });
  for (const d of thrown)
    if (left[d] > 0) {
      left[d]--;
      balls++;
    }
  return { strikes, balls };
}
export function createGame(size = 3, random: Random = cryptoRandom, repeat = false): State {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    secret: number[] = [];
  while (secret.length < size) secret.push(repeat ? Math.floor(random() * 10) : pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return { size, repeat, phase: "secret", secrets: [null, secret], entry: [], guesses: [[], []], turn: 0, winner: null, ply: 0 };
}
const code = (digits: number[]) => GUESS_BASE + digits.reduce((n, d) => n * 10 + d, 0);
const digitsOf = (point: number, size: number) => String(point - GUESS_BASE).padStart(size, "0").split("").map(Number);
export function moves(state: State): Move[] {
  if (state.winner !== null) return [];
  const to = (point: number): Move => ({ from: -1, to: point, extra: -1 });
  if (state.turn === 1) return allNumbers(state.size, state.repeat).filter((n) => !state.guesses[1].some((g) => g.digits.join() === n.join())).map((n) => to(code(n)));
  const out: Move[] = [];
  if (state.entry.length < state.size) for (let d = 0; d <= 9; d++) if (state.repeat || !state.entry.includes(d)) out.push(to(d));
  if (state.entry.length) out.push(to(BACK));
  if (state.entry.length === state.size && !(state.phase === "play" && state.guesses[0].some((g) => g.digits.join() === state.entry.join()))) out.push(to(ENTER));
  return out;
}
export function play(state: State, move: Move): State | null {
  if (move.from !== -1 || move.extra !== -1 || !moves(state).some((m) => m.to === move.to)) return null;
  if (state.turn === 0) {
    if (move.to <= 9) return { ...state, entry: [...state.entry, move.to] };
    if (move.to === BACK) return { ...state, entry: state.entry.slice(0, -1) };
    if (state.phase === "secret") return { ...state, phase: "play", secrets: [state.entry, state.secrets[1]], entry: [] };
    const guess = { digits: state.entry, ...judge(state.secrets[1], state.entry) };
    // The computer answers with its own guess of the round before the round is counted.
    return { ...state, guesses: [[...state.guesses[0], guess], state.guesses[1]], entry: [], turn: 1, ply: state.ply + 1 };
  }
  const digits = digitsOf(move.to, state.size),
    guess = { digits, ...judge(state.secrets[0]!, digits) },
    mine = state.guesses[0][state.guesses[0].length - 1].strikes === state.size,
    theirs = guess.strikes === state.size;
  return {
    ...state,
    guesses: [state.guesses[0], [...state.guesses[1], guess]],
    turn: 0,
    ply: state.ply + 1,
    winner: mine && theirs ? "draw" : mine ? 0 : theirs ? 1 : null,
  };
}
/**
 * The computer's guess. It works only from the answers its own guesses got:
 * the numbers still possible are those that would have got the same answers.
 */
export function chooseGuess(state: State, level: Level, random: Random = Math.random): Move | null {
  const legal = moves(state);
  if (!legal.length || state.turn !== 1) return legal[0] ?? null;
  const mine = state.guesses[1],
    possible = allNumbers(state.size, state.repeat).filter((n) => mine.every((g) => {
      const answer = judge(n, g.digits);
      return answer.strikes === g.strikes && answer.balls === g.balls;
    })),
    any = <X>(list: X[]) => list[Math.floor(random() * list.length)];
  // The easy level forgets what it has learnt every other time.
  if (level === "easy" && random() < 0.5) return any(legal);
  if (level !== "hard" || possible.length <= 2) return { from: -1, to: code(any(possible)), extra: -1 };
  // The guess that would split the numbers still possible into the most different answers.
  const sample = possible.length > 60 ? Array.from({ length: 60 }, () => any(possible)) : possible;
  let best = sample[0],
    top = -1;
  for (const guess of sample) {
    const answers = new Set(possible.slice(0, 400).map((n) => {
      const a = judge(n, guess);
      return a.strikes * 10 + a.balls;
    })).size;
    if (answers > top) {
      top = answers;
      best = guess;
    }
  }
  return { from: -1, to: code(best), extra: -1 };
}
const effect = (): Effect | null => null;
const count = (g: Guess) => (g.strikes || g.balls ? `${g.strikes}S ${g.balls}B` : "아웃");
export const hitBlow: PointGame<State> = {
  create: (variant) => createGame(variant.startsWith("4") ? 4 : 3, cryptoRandom, variant.endsWith("d")),
  moves,
  play: (state, move) => play(state, move),
  choose: chooseGuess,
  turn: (s) => s.turn,
  winner: (s) => s.winner,
  owners: () => Array(12).fill(null),
  effect,
  ply: (s) => s.ply,
  evaluate: () => 0,
  hint: (s) =>
    s.phase === "secret"
      ? `상대가 맞힐 내 숫자 ${s.size}자리를 정하세요 (${s.repeat ? "같은 숫자를 여러 번 써도 됩니다" : "서로 다른 숫자"}).`
      : s.entry.length === s.size
        ? "확인을 눌러 던지세요."
        : `상대 숫자 ${s.size}자리를 맞혀 보세요.`,
  tally: (s) => [0, 1].map((p) => {
    const last = s.guesses[p][s.guesses[p].length - 1];
    return last ? `${s.guesses[p].length}번째 · ${count(last)}` : "아직 던지지 않음";
  }) as [string, string],
  // Only now may the hidden number be told.
  reason: (s) => `컴퓨터의 숫자는 ${s.secrets[1].join("")}, 내 숫자는 ${s.secrets[0]?.join("") ?? ""}였습니다.`,
};
export const describeGuess = count;
