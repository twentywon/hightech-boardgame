import type { Random } from "../src/core/random";

/** Random values that make the dice show `faces`, in rolling order. */
export const rollValues = (faces: number[]) => faces.map((face) => (face - 0.5) / 6);
/** A Random that rolls `faces` in order, then sixes. */
export function rolling(faces: number[]): Random {
  const values = rollValues(faces);
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.999999);
}
