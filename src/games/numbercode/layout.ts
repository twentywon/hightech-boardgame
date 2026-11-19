/**
 * Where everything of 숫자 코드 stands on the table, free of Three.js and Vite-only imports so that browser tests can
 * aim with the same numbers. Lengths are in table units; y is up, +z toward me.
 */
export const TILE = { w: 0.56, h: 0.8, d: 0.24 };
export const RACK = { h: 0.12, d: 0.5 };
/** How far tiles lean on their racks: mine back from me, so that I read them; the others' back toward their owners, so that I see their backs. */
export const LEAN = { mine: 0.32, theirs: 0.2, held: 0.62 };
type Vec = [number, number, number];
/** A seat's rack: its middle, the way its order runs (smallest first), the way to its owner, and its length. */
export interface Frame {
  x: number;
  z: number;
  along: [number, number];
  out: [number, number];
  length: number;
}
/**
 * The racks for two, three or four players: mine along the near edge; one across; two side by side across; or three,
 * at my left, across and at my right. Every row rises as I read round the table from my left (across, from left to
 * right), so that the others' rows read as mine does.
 */
export function frames(seats: number): Frame[] {
  if (seats === 2)
    return [
      { x: 0, z: 3.05, along: [1, 0], out: [0, 1], length: 7.8 },
      { x: 0, z: -3.05, along: [1, 0], out: [0, -1], length: 7.8 },
    ];
  if (seats === 3)
    return [
      { x: 0, z: 3.05, along: [1, 0], out: [0, 1], length: 7.6 },
      { x: -2.5, z: -3.05, along: [1, 0], out: [0, -1], length: 4.6 },
      { x: 2.5, z: -3.05, along: [1, 0], out: [0, -1], length: 4.6 },
    ];
  return [
    { x: 0, z: 3.35, along: [1, 0], out: [0, 1], length: 6.2 },
    { x: -4.75, z: 0, along: [0, -1], out: [-1, 0], length: 5.6 },
    { x: 0, z: -3.35, along: [1, 0], out: [0, -1], length: 6.2 },
    { x: 4.75, z: 0, along: [0, 1], out: [1, 0], length: 5.6 },
  ];
}
/** The spacing of `n` tiles on a rack. */
export const pitchOf = (frame: Frame, n: number) => Math.min(0.64, (frame.length - 0.3) / Math.max(1, n));
/** How far along its rack the `i`-th of `n` tiles stands from the middle. */
export const alongOf = (frame: Frame, i: number, n: number) => (i - (n - 1) / 2) * pitchOf(frame, n);
const at = (frame: Frame, u: number, toward: number, y: number): Vec => [frame.x + frame.along[0] * u + frame.out[0] * toward, y, frame.z + frame.along[1] * u + frame.out[1] * toward];
/** A tile's place and its own axes: x across its face, y up its face, z out of its face. */
export interface Pose {
  p: Vec;
  x: Vec;
  y: Vec;
  z: Vec;
}
/** A tile standing on a rack, leaning by `lean` (its top toward `-out` for mine, toward `out` for the others'). */
function standing(frame: Frame, u: number, mine: boolean, lean: number, lift = 0, toward = 0): Pose {
  const [ox, oz] = frame.out,
    c = Math.cos(lean),
    s = Math.sin(lean),
    sign = mine ? -1 : 1;
  // The face looks toward its owner, tipped up (mine) or down (the others', whose backs then look up at me).
  const y: Vec = [ox * s * sign, c, oz * s * sign],
    z: Vec = [ox * c, -s * sign, oz * c],
    x: Vec = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]],
    base = at(frame, u, toward, RACK.h + (TILE.d / 2) * s + lift);
  return { p: [base[0] + (y[0] * TILE.h) / 2, base[1] + (y[1] * TILE.h) / 2, base[2] + (y[2] * TILE.h) / 2], x, y, z };
}
/** The `i`-th of `n` tiles of `seat`, standing hidden on its rack. */
export const standAt = (seats: number, seat: number, i: number, n: number) => {
  const frame = frames(seats)[seat];
  return standing(frame, alongOf(frame, i, n), seat === 0, seat === 0 ? LEAN.mine : LEAN.theirs);
};
/** Face up on the table in front of its rack, read the right way up from my seat. */
const FACE_UP = { x: [1, 0, 0] as Vec, y: [0, 0, -1] as Vec, z: [0, 1, 0] as Vec };
/** The `i`-th of `n` tiles of `seat`, laid face up in front of its place (two lines on the side racks, so that they do not overlap). */
export function lieAt(seats: number, seat: number, i: number, n: number): Pose {
  const frame = frames(seats)[seat],
    side = frame.out[0] !== 0,
    pitch = pitchOf(frame, n),
    // Along the row a laid tile takes its width on the near and far racks and its height on the side ones.
    span = side ? TILE.h : TILE.w,
    across = side ? TILE.w : TILE.h,
    stagger = pitch < span + 0.04 && i % 2 === 1 ? across + 0.06 : 0;
  return { p: at(frame, alongOf(frame, i, n), -(RACK.d / 2 + across / 2 + 0.1 + stagger), TILE.d / 2), ...FACE_UP };
}
/** The tile `seat` has drawn and holds at the end of its row, `n` tiles long: mine raised and turned up to me. */
export function heldAt(seats: number, seat: number, n: number): Pose {
  const frame = frames(seats)[seat],
    u = ((Math.max(1, n) - 1) / 2) * pitchOf(frame, Math.max(1, n)) + 0.8;
  return seat === 0 ? standing(frame, u, true, LEAN.held, 0.28, 0.12) : standing(frame, u, false, LEAN.theirs, 0.14);
}
/** Where a joker would go between my tiles: gap `k` of a row of `n`. */
export function gapAt(seats: number, k: number, n: number) {
  const frame = frames(seats)[0],
    p = at(frame, (k - n / 2) * pitchOf(frame, n), 0, RACK.h + 0.5);
  return { x: p[0], y: p[1], z: p[2] };
}
/** How the pool's places are laid out: rows of six (five when there are fewer than sixteen). */
export const poolColumns = (count: number) => (count >= 16 ? 6 : 5);
/** The `slot`-th face-down tile of a pool of `count` places, a little askew. */
export function poolAt(slot: number, count: number) {
  const cols = poolColumns(count),
    rows = Math.ceil(count / cols),
    row = Math.floor(slot / cols),
    inRow = row === rows - 1 ? count - row * cols : cols,
    col = slot % cols;
  return {
    x: (col - (inRow - 1) / 2) * 0.72 + Math.sin(slot * 12.9) * 0.04,
    y: TILE.d / 2,
    z: (row - (rows - 1) / 2) * 0.98 + Math.cos(slot * 7.7) * 0.04,
    turn: Math.sin(slot * 5.3) * 0.12,
  };
}
/** Where each seat's name stands: on the felt beyond the left end of its rack (the side racks: beyond the far end). */
export function nameAt(seats: number, seat: number) {
  const frame = frames(seats)[seat],
    side = frame.out[0] !== 0,
    far = frame.along[1] < 0 ? 1 : -1,
    p = side ? at(frame, far * (frame.length / 2 + 0.45), -0.35, 0.1) : at(frame, -(frame.length / 2 + 0.6), 0, 0.1);
  return { x: p[0], y: p[1], z: p[2] };
}
/** What the camera keeps in view. */
export function codeSubject(seats: number, _aspect = 1.6) {
  return seats === 4 ? { half: 5.35, halfZ: 3.95, height: 0.9, lookY: 0.1, tilt: 0.98 } : { half: 4.75, halfZ: 3.65, height: 0.9, lookY: 0.1, tilt: 0.98 };
}
