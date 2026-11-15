/** Where things lie on the One Card table, free of Vite-only imports so that browser tests can aim. */
export const ONECARD = {
  SUBJECT: { half: 5.2, halfZ: 4.1, height: 0.4, lookY: 0, tilt: 1.12 },
  HAND_Z: 3.25,
  RIVAL_Z: -3.3,
  PILE: { x: -1.1, z: -0.1 },
  DISCARD: { x: 0.9, z: -0.1 },
};
/** Where the `i`-th of `n` cards of my hand lies across the table. */
export function handX(i: number, n: number) {
  const step = Math.min(0.8, 8.6 / Math.max(1, n));
  return (i - (n - 1) / 2) * step;
}
