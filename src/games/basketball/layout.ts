import type * as T from "three";
import { HOOP } from "./sim";

/**
 * Numbers of the machine that browser tests aim with, free of Vite-only imports: the ground the cabinet stands on,
 * how much of the canvas's height a throw at full power is pushed across, and the shooter's eye.
 */
export const GROUND = -0.75;
/** A swipe up across this share of the canvas's height is a throw at full power; up to `OVER` of it is allowed. */
export const FULL_SWIPE = 0.5,
  OVER = 1.15;
/** Shorter than this share of the height, a swipe throws nothing. */
export const LEAST_SWIPE = 0.04;
/** How much the turn of a throw follows the slant of the swipe. */
export const YAW_PER_SLANT = 0.32;
/** The power and turn of a swipe of `dx`, `dy` pixels on a canvas `height` pixels tall (y grows downward); null if it throws nothing. */
export function swipe(dx: number, dy: number, height: number) {
  const length = Math.hypot(dx, dy);
  if (dy >= 0 || length < LEAST_SWIPE * height) return null;
  return { power: Math.min(OVER, length / (FULL_SWIPE * height)), yaw: Math.atan2(dx, -dy) * YAW_PER_SLANT };
}
/** The swipe (in pixels) that throws `power` turned by `yaw`, on a canvas `height` pixels tall. */
export function swipeFor(power: number, yaw: number, height: number) {
  const length = power * FULL_SWIPE * height,
    slant = yaw / YAW_PER_SLANT;
  return { dx: Math.sin(slant) * length, dy: -Math.cos(slant) * length };
}
/** The shooter's eye: behind the tray, a little above the hand, looking down the lane under the hoop. */
export const EYE = { y: 2.7, z: 6.8 },
  LOOK = { y: 1.95, z: HOOP.z };
export function shooterCamera(camera: T.PerspectiveCamera, aspect: number) {
  // Narrow screens step back so that the cabinet's sides stay in sight.
  const back = aspect < 1.3 ? (1.3 - aspect) * 3.2 : 0;
  camera.position.set(0, EYE.y + back * 0.15, EYE.z + back);
  camera.lookAt(0, LOOK.y, LOOK.z);
  camera.updateMatrixWorld();
}
