/*
 * The grid of 헥스 정복전: 20 columns by 11 rows of hexes with flat tops, odd columns set half a hex lower (toward the
 * near edge of the table). A hex is numbered row by row, `row * COLS + col`; row 0 is the far edge. Free of Three.js
 * and DOM, shared by the rules, the computer, the view and browser tests.
 */
export const COLS = 20,
  ROWS = 11,
  HEXES = COLS * ROWS;
export const colOf = (h: number) => h % COLS;
export const rowOf = (h: number) => Math.floor(h / COLS);
export const hexOf = (col: number, row: number) => (col >= 0 && col < COLS && row >= 0 && row < ROWS ? row * COLS + col : -1);
/** Cube coordinates of a hex (q along the columns, r down them, s = −q − r). */
function cube(h: number) {
  const q = colOf(h),
    r = rowOf(h) - (q - (q & 1)) / 2;
  return { q, r, s: -q - r };
}
/** How many steps apart two hexes are. */
export function distance(a: number, b: number) {
  const p = cube(a),
    o = cube(b);
  return Math.max(Math.abs(p.q - o.q), Math.abs(p.r - o.r), Math.abs(p.s - o.s));
}
const DIRECTIONS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
const fromCube = (q: number, r: number) => (q < 0 || q >= COLS ? -1 : hexOf(q, r + (q - (q & 1)) / 2));
/** The hexes next to each hex, clockwise from the one above it. */
export const NEIGHBOURS: number[][] = Array.from({ length: HEXES }, (_, h) => {
  const { q, r } = cube(h);
  return DIRECTIONS.map(([dq, dr]) => fromCube(q + dq, r + dr)).filter((n) => n >= 0);
});
/** The hexes two steps from each hex, each with the one or two hexes between them. */
export const RING2: { to: number; via: number[] }[][] = Array.from({ length: HEXES }, (_, h) => {
  const out: { to: number; via: number[] }[] = [];
  for (let to = 0; to < HEXES; to++) {
    if (distance(h, to) !== 2) continue;
    out.push({ to, via: NEIGHBOURS[h].filter((m) => NEIGHBOURS[to].includes(m)) });
  }
  return out;
});
/** The hexes within two steps of each hex (itself left out). */
export const NEAR2: number[][] = Array.from({ length: HEXES }, (_, h) => [...NEIGHBOURS[h], ...RING2[h].map((r) => r.to)]);
