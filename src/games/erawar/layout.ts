import type { TableSubject } from "../table/view";
import { BASE_X } from "./sim";

/**
 * How the lane of 시대 전쟁 is framed, free of Vite-only imports (the tests reckon with it): seen from the side, nearly
 * level, a stretch of it `wide` across (more on a wide screen, never less than `LEAST`); the eye slides along it
 * between the bases (`EDGE`: the farthest a view reaches, just past a base's back). The ground lies `road` of the way
 * down the canvas: higher on a touch screen, whose command bar covers the bottom.
 */
export const LEAST = 12.5,
  MOST = 24,
  /** World height a view shows for a screen of shape 1:1 … at least this much is always in view, so a base fits. */
  TALL = 9.6,
  /** A touch screen (its command bar over the bottom) looks a little closer. */
  TALL_TOUCH = 8.4,
  TILT = 0.11,
  EDGE = BASE_X + 3;
export interface Frame {
  span: number;
  wide: number;
  lookY: number;
  tilt: number;
}
export function eraFrame(aspect: number, coarse: boolean): Frame {
  const tall = coarse ? TALL_TOUCH : TALL,
    wide = Math.max(LEAST, Math.min(MOST, tall * aspect)),
    span = Math.max(tall, wide / aspect),
    road = coarse || aspect < 1.2 ? 0.66 : 0.74;
  return { span, wide: span * aspect, lookY: (road - 0.5) * span, tilt: TILT };
}
export const eraWarSubject = (_aspect: number): TableSubject => ({ half: LEAST / 2, halfZ: 0.5, height: TALL, lookY: 3, tilt: TILT });
