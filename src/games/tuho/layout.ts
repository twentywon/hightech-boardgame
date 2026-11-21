import type * as T from "three";
import { IDEAL } from "./rules";
import { DISTANCE } from "./sim";

/**
 * Numbers of the tuho court that the view and browser tests share, free of Vite-only imports: the scale of the scene,
 * the thrower's eye, and how a pull (or a swipe) turns into the turn and speed of a throw.
 */
/** Scene units to the metre (the yard round the pot is built about half a metre to a unit). */
export const SCALE = 2;
/** The eye: a step behind the thrower and a little above, so that the whole arc is seen; and where it looks. */
export const EYE = { x: 0.04, y: 1.95, z: DISTANCE + 1.25 },
  LOOK = { x: 0.08, y: 0.82, z: -0.3 };
/** The first-person view from the line, its field widened on narrow screens so that the pot and the board fit. */
export function tuhoCamera(camera: T.PerspectiveCamera, aspect: number) {
  const tall = 31,
    wide = 50,
    // The vertical field that keeps `wide` degrees across.
    across = (2 * Math.atan(Math.tan((wide * Math.PI) / 360) / aspect) * 180) / Math.PI;
  camera.fov = Math.max(tall, Math.min(70, across));
  camera.aspect = aspect;
  camera.position.set(EYE.x * SCALE, EYE.y * SCALE, EYE.z * SCALE);
  camera.lookAt(LOOK.x * SCALE, LOOK.y * SCALE, LOOK.z * SCALE);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
/**
 * A gesture's length, as a share of the canvas's height, that throws at `CENTRE_SPEED` (about the speed that reaches
 * the mouth); each share more or less adds or takes `GAIN` m/s. Shorter than `LEAST` it throws nothing.
 */
export const CENTRE = 0.3,
  CENTRE_SPEED = IDEAL[0].speed,
  GAIN = 2.4,
  LEAST = 0.05;
/** How far the turn follows the slant of the gesture, and the turn a straight gesture throws with (at the mouth from the hand). */
export const YAW_PER_SLANT = 0.25,
  STRAIGHT = IDEAL[0].yaw;
/**
 * The throw of a gesture of `dx`, `dy` pixels on a canvas `height` pixels tall (y grows downward): pulled back
 * (down) like a sling, it throws the opposite way; pushed up, it throws that way. Null if it throws nothing.
 */
export function gesture(dx: number, dy: number, height: number) {
  const length = Math.hypot(dx, dy) / (height || 1);
  if (length < LEAST || Math.abs(dy) < Math.abs(dx) * 0.4) return null;
  // The way the arrow goes: up the screen and to the side.
  const side = dy > 0 ? -dx : dx,
    up = Math.abs(dy);
  return { yaw: STRAIGHT + Math.atan2(side, up) * YAW_PER_SLANT, speed: CENTRE_SPEED + (length - CENTRE) * GAIN };
}
/** The pull (in pixels, downward) that throws with `yaw` and `speed` on a canvas `height` pixels tall. */
export function pullFor(yaw: number, speed: number, height: number) {
  const length = (CENTRE + (speed - CENTRE_SPEED) / GAIN) * height,
    slant = (yaw - STRAIGHT) / YAW_PER_SLANT;
  return { dx: -Math.sin(slant) * length, dy: Math.cos(slant) * length };
}
/**
 * A person's unsteady hand while holding the arrow back: how far it moves the turn (rad) and the speed (m/s), about
 * one standard deviation each, and the quick shake over it.
 */
export const TREMOR = { yaw: 0.005, speed: 0.014, shake: 0.18 };
const SWELLS = [
    [[0.19, 1], [0.33, 0.6], [0.57, 0.38]],
    [[0.23, 1], [0.41, 0.55], [0.67, 0.4]],
  ],
  QUICK = [[8.7, 1], [10.9, 0.6]],
  SIZES = [TREMOR.yaw, TREMOR.speed].map((size, axis) => size / Math.sqrt(SWELLS[axis].reduce((s, [, w]) => s + w * w, 0) / 2));
/** Where the hand has moved the throw `t` seconds into holding it; `seed` starts each hold somewhere else in the swells. */
export function tremor(t: number, seed: number) {
  let s = (Math.abs(Math.floor(seed * 7919)) % 2147483646) + 1;
  const phase = () => ((s = (s * 16807) % 2147483647) / 2147483647) * Math.PI * 2,
    out = [0, 0];
  for (let axis = 0; axis < 2; axis++) {
    let v = 0;
    for (const [rate, share] of SWELLS[axis]) v += SIZES[axis] * share * Math.sin(2 * Math.PI * rate * t + phase());
    for (const [rate, share] of QUICK) v += SIZES[axis] * TREMOR.shake * share * Math.sin(2 * Math.PI * rate * t + phase());
    out[axis] = v;
  }
  return { yaw: out[0], speed: out[1] };
}
