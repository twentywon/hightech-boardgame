/** Where things lie on the One Card bed, free of Vite-only imports so that browser tests can aim. */
export const ONECARD = {
  SUBJECT: { half: 6.2, halfZ: 4.1, height: 0.4, lookY: 0, tilt: 1.12 },
  HAND_Z: 3.25,
  /** The computer across from me (north), and those at my left and right (west and east). */
  RIVAL_Z: -3.3,
  SIDE_X: 5.45,
  PILE: { x: -1.1, z: -0.1 },
  DISCARD: { x: 0.9, z: -0.1 },
};
/** Where the `i`-th of `n` cards of my hand lies across the table. */
export function handX(i: number, n: number) {
  const step = Math.min(0.8, 8.6 / Math.max(1, n));
  return (i - (n - 1) / 2) * step;
}
/** Where the `i`-th of `n` cards of a computer's hand lies, and how it is turned: across the far side (seat 2), or down my left and right (seats 1 and 3). */
export function rivalCard(seat: number, i: number, n: number) {
  if (seat === 2) {
    const step = Math.min(0.5, 6.4 / Math.max(1, n));
    return { x: (i - (n - 1) / 2) * step, z: ONECARD.RIVAL_Z, turn: Math.PI };
  }
  const step = Math.min(0.42, 4.6 / Math.max(1, n)),
    along = (i - (n - 1) / 2) * step;
  return seat === 1 ? { x: -ONECARD.SIDE_X, z: -along, turn: Math.PI / 2 } : { x: ONECARD.SIDE_X, z: along, turn: -Math.PI / 2 };
}
