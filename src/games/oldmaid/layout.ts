/** Where things lie on the Old Maid table, free of Vite-only imports so that browser tests can aim. */
export const OLDMAID = {
  SUBJECT: { half: 5.3, halfZ: 4.0, height: 0.4, lookY: 0, tilt: 1.12 },
  HAND_Z: 3.2,
  /** The two computers sit across the table, at the left and at the right. */
  RIVAL: [
    { x: -2.75, z: -2.9 },
    { x: 2.75, z: -2.9 },
  ],
};
/** Where the `i`-th of `n` cards of a seat lies: my hand spread wide, the computers' fans narrower. */
export function seatSpot(seat: number, i: number, n: number) {
  if (seat === 0) {
    const step = Math.min(0.8, 9 / Math.max(1, n));
    return { x: (i - (n - 1) / 2) * step, z: OLDMAID.HAND_Z };
  }
  const step = Math.min(0.42, 4.4 / Math.max(1, n)),
    at = OLDMAID.RIVAL[seat - 1];
  return { x: at.x + (i - (n - 1) / 2) * step, z: at.z };
}
