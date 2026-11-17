import type { TableSubject } from "../table/view";

/*
 * Where things stand in the swamp, in table units: kept free of Vite-only imports, so that browser tests can aim with
 * the same numbers as the view. The row of stumps runs across the screen (along x) at z = 0; the water is at y = 0.
 */
/** From one stump's middle to the next. */
export const SPACING = 1.22;
/** The stumps' tops, by place in the row (a fixed sequence, so that a row always stands the same). */
const TOPS = [0.56, 0.5, 0.61, 0.53, 0.58, 0.49, 0.6, 0.52, 0.57];
/** A little in and out of line, as stumps stand in a swamp. */
const WOBBLE = [0.05, -0.07, 0.03, -0.04, 0.07, -0.03, 0.05, -0.06, 0.02];
/** The radius of a stump's top. */
export const STUMP_RADIUS = 0.4;
/** How high a sitting frog's middle is over the top of its stump (taps aim there). */
export const FROG_MIDDLE = 0.22;
/** The middle of stump `index` of a row of `count`, at its top. */
/** How long a hop to the next stump and a jump over a frog last (ms), and the share of that time the frog lands at. */
export const HOP_MS = 420,
  JUMP_MS = 560,
  LANDS_AT = 0.84;
/** Seconds from a frog leaving its stump (`from`) to its landing on `to`: where its 폴짝 sets it down. */
export const landingAfter = (from: number, to: number) => ((Math.abs(to - from) === 2 ? JUMP_MS : HOP_MS) * LANDS_AT) / 1000;
export function stumpAt(count: number, index: number) {
  return { x: (index - (count - 1) / 2) * SPACING, z: WOBBLE[index % WOBBLE.length], top: TOPS[index % TOPS.length] };
}
/** Where a tap on the frog sitting on stump `index` aims: the middle of its body. */
export function frogAt(count: number, index: number) {
  const at = stumpAt(count, index);
  return { x: at.x, y: at.top + FROG_MIDDLE, z: at.z };
}
/** What the camera frames: the whole row with its frogs and the arc of a jump over them. */
export function frogSubject(count: number, aspect: number): TableSubject {
  const row = ((count - 1) / 2) * SPACING;
  return { half: row + (aspect < 1.2 ? 0.62 : 0.85), halfZ: 1.05, height: 1.45, lookY: 0.42, tilt: 0.62 };
}
/** The colours frogs and ribbons come in: their paint, a darker shade for lines and symbols, and a name for readers. */
export const FROG_PAINTS = [
  { paint: "#e5392c", dark: "#8a1a10", name: "빨강" },
  { paint: "#ff9818", dark: "#9a4a00", name: "주황" },
  { paint: "#ffd62a", dark: "#8a6a00", name: "노랑" },
  { paint: "#4fcc3c", dark: "#1f6414", name: "초록" },
  { paint: "#2ad0c6", dark: "#0b6560", name: "청록" },
  { paint: "#2f5cff", dark: "#142a8a", name: "파랑" },
  { paint: "#9b4fe6", dark: "#4a1c80", name: "보라" },
  { paint: "#f2efe6", dark: "#5c5648", name: "흰색" },
];
/** Each colour's own symbol, on its ribbon and on the belly of its frogs, so that the colours are told apart without seeing them. */
export const SYMBOLS = ["circle", "triangle", "star", "square", "diamond", "cross", "heart", "moon"] as const;
export type Symbol = (typeof SYMBOLS)[number];
