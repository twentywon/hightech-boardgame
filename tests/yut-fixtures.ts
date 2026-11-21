import type { Random } from "../src/core/random";
import type { Result } from "../src/games/yut/rules";

const STICKS: Record<Result, boolean[]> = {
  [-1]: [true, false, false, false],
  1: [false, true, false, false],
  2: [true, true, false, false],
  3: [true, true, true, false],
  4: [true, true, true, true],
  5: [false, false, false, false],
};
/** Random values that make the sticks show `results`, four values a throw. */
export const throwValues = (results: Result[]) =>
  results.flatMap((r) => STICKS[r].map((flat) => (flat ? 0.25 : 0.75)));
/** A Random that throws `results` in order, then 개 for ever. */
export function throwing(results: Result[]): Random {
  const values = throwValues(results);
  let i = 0;
  return () => (i < values.length ? values[i++] : i++ % 4 < 2 ? 0.25 : 0.75);
}
