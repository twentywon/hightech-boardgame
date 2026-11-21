import type * as T from "three";
import { ANGLE_MAX, SPEED_MAX, SPEED_MIN } from "./rules";
import { HEAD, START_D } from "./sim";

/**
 * Numbers of the lane that the view and browser tests share, free of Vite-only imports. The lane runs away from
 * the bowler: a place `d` metres down it is at z = −d, and `x` is across it, to the right.
 */
export const zOf = (d: number) => -d;
/** Where the ball waits before it is thrown: on the approach, just behind the foul line, a little right of the middle until it is moved. */
export const BALL_Z = zOf(START_D),
  START_X = 0.3;
/**
 * The bowler's eye: behind the ball and above it, looking down the lane at the pins (`back` and `height` from the
 * ball's spot, `ahead` where it looks). While a ball rolls the eye goes after it, up to `CHASE` down the lane, and
 * comes down and turns to the rack (`CLOSE`), so that the pins are seen near as they fall.
 */
export const EYE = { back: 3.3, height: 1.55, ahead: 7, look: 0.1 },
  CLOSE = { before: 3.5, height: 0.85, look: 0.12 };
export const CHASE = BALL_Z + EYE.back + HEAD - CLOSE.before;
/** Sets a camera at the bowler's eye, moved `shift` metres down the lane; browser tests aim with the same. */
export function bowlerCamera(camera: T.PerspectiveCamera, shift = 0) {
  const p = Math.max(0, Math.min(1, shift / CHASE)),
    z = BALL_Z + EYE.back - shift,
    ahead = z - EYE.back - EYE.ahead,
    rack = zOf(HEAD + 0.45);
  camera.position.set(0, EYE.height + (CLOSE.height - EYE.height) * p, z);
  camera.lookAt(0, EYE.look + (CLOSE.look - EYE.look) * p, ahead + (rack - ahead) * p);
  camera.updateMatrixWorld();
}
/** A swipe up across this share of the canvas's height throws at full speed; shorter than `LEAST_SWIPE` it throws nothing. */
export const FULL_SWIPE = 0.45,
  LEAST_SWIPE = 0.05;
/** The lane's angle for the slant of a swipe (radians from upright): fine near straight, wider toward the sides. */
const angleOf = (slant: number) => Math.max(-ANGLE_MAX, Math.min(ANGLE_MAX, 0.025 * slant + 0.027 * slant ** 3));
/** The speed and direction of a swipe of `dx`, `dy` pixels on a canvas `height` pixels tall (y grows downward); null if it throws nothing. */
export function swipe(dx: number, dy: number, height: number) {
  const length = Math.hypot(dx, dy);
  if (dy >= 0 || length < LEAST_SWIPE * height) return null;
  const power = Math.min(1, length / (FULL_SWIPE * height));
  return { speed: SPEED_MIN + (SPEED_MAX - SPEED_MIN) * power, angle: angleOf(Math.atan2(dx, -dy)) };
}
/** The swipe (in pixels) that throws at `speed` in the direction `angle`, on a canvas `height` pixels tall. */
export function swipeFor(speed: number, angle: number, height: number) {
  // The slant for the angle, found by halving.
  let lo = -1.5,
    hi = 1.5;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (angleOf(mid) < angle) lo = mid;
    else hi = mid;
  }
  const slant = (lo + hi) / 2,
    length = ((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * FULL_SWIPE * height;
  return { dx: Math.sin(slant) * length, dy: -Math.cos(slant) * length };
}
