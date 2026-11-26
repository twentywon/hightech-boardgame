import type { TableSubject } from "../table/view";
import { GATE, RUN } from "./sim";

/**
 * How the valley of 금화 쟁탈전 is framed, free of Vite-only imports (the tests reckon with it). It is seen from the
 * side, almost level, and is much longer than a screen: the eye follows a bandit along it.
 *
 * `goldRaidFrame` is a view's shape: the air over the highest ledge up to where a jump from it reaches (`ABOVE`) must
 * fit over the road, and at least `LEAST_WIDE` of the valley across (a tall screen). `road` is how far down the
 * canvas the road lies, as a share: a phone's buttons stand at the bottom, so there the road is lifted clear of them
 * and the earth under it fills the strip they cover.
 *
 * `aimX` is where the eye wants to look across: a little ahead of the bandit, the way it faces and runs, never past
 * the castles at the valley's ends (`END`). `follow` brings the eye there smoothly.
 *
 * Two at one screen (`pairView`): while the two are near enough, one view holds both, drawing back (up to `ZOOM_MOST`
 * times the usual width) as they part; farther apart, the screen is split down the middle, the left half following
 * whichever is to the left in the valley and the right half the other, so that the seam stands where the gap between
 * them is (and each person's buttons, at their own side, are mostly under their own half). They come back into one
 * view once they are a little nearer again than where they split, so that it does not flicker between the two.
 */
export const ABOVE = 7.8,
  TILT = 0.1,
  LEAST_WIDE = 13,
  /** How far from the middle the view may reach: just past the back of a castle. */
  END = GATE + 4.6,
  /** How much of the view's width the eye looks ahead of a bandit: by the way it faces, and more by how it runs. */
  LEAD_FACE = 0.06,
  LEAD_RUN = 0.12,
  /** How quickly the eye comes to where it wants to look (1/s). */
  FOLLOW = 3,
  /** Two at one screen: the room kept beside each, how far the one view may draw back, and how much nearer they come before it is one view again. */
  ROOM = 2.6,
  ZOOM_MOST = 1.45,
  MERGE = 0.85;
export interface Frame {
  /** The height and width of valley in view (at the road's plane), where the eye looks up to, and the road's place down the canvas. */
  span: number;
  wide: number;
  lookY: number;
  road: number;
}
export function goldRaidFrame(aspect: number, pad: boolean): Frame {
  const road = pad || aspect < 1.2 ? 0.68 : 0.78,
    span = Math.max(LEAST_WIDE / aspect, ABOVE / road);
  return { span, wide: span * aspect, lookY: (road - 0.5) * span, road };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** The farthest the middle of a view `wide` across may stand from the valley's middle. */
export const reach = (wide: number) => Math.max(0, END - wide / 2);
/** Where the eye wants to look across for a bandit at `x` running at `vx`, facing `face`, in a view `wide` across. */
export function aimX(x: number, vx: number, face: number, wide: number) {
  const ahead = x + wide * (LEAD_FACE * face + LEAD_RUN * clamp(vx / RUN, -1, 1)),
    most = reach(wide);
  return clamp(ahead, -most, most);
}
/** The eye `dt` seconds on from `from` toward `to`: smoothly, the farther the quicker. */
export const follow = (from: number, to: number, dt: number) => from + (to - from) * (1 - Math.exp(-FOLLOW * dt));
export interface Pair {
  /** Whether the screen is split; else the one view's middle across and how far it has drawn back (1: the usual width). */
  split: boolean;
  x: number;
  zoom: number;
}
/** Two at one screen, at `a` and `b`, a view being `wide` across; `split`: whether it is split now. */
export function pairView(a: number, b: number, wide: number, split: boolean): Pair {
  const zoom = Math.max(1, (Math.abs(a - b) + 2 * ROOM) / wide);
  if (split ? zoom > ZOOM_MOST * MERGE : zoom > ZOOM_MOST) return { split: true, x: (a + b) / 2, zoom: ZOOM_MOST };
  const most = reach(wide * zoom);
  return { split: false, x: clamp((a + b) / 2, -most, most), zoom };
}
export const goldRaidSubject = (_aspect: number): TableSubject => ({ half: LEAST_WIDE / 2, halfZ: 0.5, height: ABOVE, lookY: 3, tilt: TILT });
