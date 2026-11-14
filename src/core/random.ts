/** Returns a number in [0, 1). Injected in tests to make shuffles and rolls reproducible. */
export type Random = () => number;
/**
 * One 32-bit draw per call from the platform's secure generator. Scaling it
 * to a small range (a die face, a card index) leaves a bias far below one in
 * a million, which games without stakes can ignore.
 */
export const cryptoRandom: Random = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
};
