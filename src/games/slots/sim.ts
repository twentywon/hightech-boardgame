/**
 * The slot machine's mathematics, free of Three.js and the page: three reels, each a strip of 24 symbols, of which
 * three show in the window (a row above, the middle row, a row below); five pay lines over them; the pay table; the
 * stop of each reel drawn at random, every place of its strip as likely as any other; and the return to the player
 * reckoned exactly over every stop of the three reels.
 *
 * A reel `stop` is the place of its strip in the middle row: the row above shows `stop - 1`, the row below `stop + 1`
 * (the strip runs down past the window, so the symbol above comes into the middle next).
 */
export const CHERRY = 0,
  LEMON = 1,
  PLUM = 2,
  BELL = 3,
  BAR = 4,
  SEVEN = 5,
  STAR = 6;
/** The symbols' names, for the pay table and the words of a win. */
export const SYMBOLS = ["체리", "레몬", "자두", "종", "BAR", "7", "별"];
const LETTERS: Record<string, number> = { C: CHERRY, L: LEMON, P: PLUM, B: BELL, R: BAR, "7": SEVEN, S: STAR };
/**
 * The three strips, top to bottom. The first two carry 3 cherries, 5 lemons, 5 plums, 4 bells, 3 BARs, 2 sevens and
 * 2 stars; the third 3, 6, 5, 4, 4, 1 and 1 (one seven and one star only, as the last reel of a machine has).
 */
export const STRIPS: number[][] = ["LPCBLRP7LBPSCLRPB7LPCBRS", "PLBC7LPRBLSPCLBR7PLCBSPR", "LBPLRCLPBRL7PLCBRPLSBCRP"].map((s) => [...s].map((c) => LETTERS[c]));
export const N = 24;
/** The rows of the window a line goes through, reel by reel (-1 the row above, 0 the middle, 1 the row below). */
export const LINES: [number, number, number][] = [
  [0, 0, 0],
  [-1, -1, -1],
  [1, 1, 1],
  [-1, 0, 1],
  [1, 0, -1],
];
/** How many lines may be played: the middle one, the three rows, or all five. */
export const LINE_CHOICES = [1, 3, 5];
/** The bets a line may take. */
export const BETS = [1, 2, 3, 5, 10];
/** Three of a kind on a line pays this many times the line's bet. */
export const THREE = [10, 10, 15, 20, 40, 100, 300];
/** Any three of BAR, 7 and star mixed; two cherries from the left; one cherry on the first reel. */
export const ANY_HIGH = 5,
  TWO_CHERRIES = 5,
  ONE_CHERRY = 2;
const high = (s: number) => s >= BAR;
/** What the symbols `a`, `b`, `c` on a line (first reel to third) pay for each coin bet on it. */
export function payOf(a: number, b: number, c: number) {
  if (a === b && b === c) return THREE[a];
  if (high(a) && high(b) && high(c)) return ANY_HIGH;
  if (a === CHERRY && b === CHERRY) return TWO_CHERRIES;
  if (a === CHERRY) return ONE_CHERRY;
  return 0;
}
/** The symbol of `reel` at `row` (-1, 0, 1) when it stops at `stop`. */
export const symbolAt = (reel: number, stop: number, row: number) => STRIPS[reel][(((stop + row) % N) + N) % N];
export interface LineWin {
  /** The line (index into `LINES`), what it pays in all (its multiple times the bet), and the symbols on it. */
  line: number;
  pay: number;
  symbols: [number, number, number];
}
/** The wins of a spin stopped at `stops` with the first `lines` lines played at `bet` a line, and their sum. */
export function evaluate(stops: readonly number[], lines: number, bet: number) {
  const wins: LineWin[] = [];
  for (let line = 0; line < lines; line++) {
    const rows = LINES[line],
      symbols = [0, 1, 2].map((r) => symbolAt(r, stops[r], rows[r])) as [number, number, number],
      multiple = payOf(...symbols);
    if (multiple) wins.push({ line, pay: multiple * bet, symbols });
  }
  return { wins, total: wins.reduce((sum, w) => sum + w.pay, 0) };
}
/** Three stops drawn at random, each place of a strip as likely as any other. */
export const drawStops = (random: () => number): [number, number, number] => [0, 1, 2].map(() => Math.min(N - 1, Math.floor(random() * N))) as [number, number, number];
/** The stops as one number (a move's `extra`), and back. */
export const packStops = (stops: readonly number[]) => stops[0] + N * stops[1] + N * N * stops[2];
export function unpackStops(code: number): [number, number, number] | null {
  if (!Number.isInteger(code) || code < 0 || code >= N * N * N) return null;
  return [code % N, Math.floor(code / N) % N, Math.floor(code / (N * N))];
}
/**
 * The return to the player: what every stop of the three reels together pays on `lines` lines at a coin a line,
 * over what they cost. Every line sees each strip's symbols equally often, so it is the same for 1, 3 or 5 lines.
 */
export function returnToPlayer(lines = 1) {
  let paid = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) for (let c = 0; c < N; c++) paid += evaluate([a, b, c], lines, 1).total;
  return paid / (N * N * N * lines);
}
/** A seeded sequence (for tests and a reproducible spin): the same seed, the same stops. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
