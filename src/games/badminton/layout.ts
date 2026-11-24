import type * as T from "three";
import { HALF_L } from "./sim";

/**
 * The eye, free of Vite-only imports (browser tests aim with it). Semi first person (the user asked): the eye stands
 * just behind and above my player's head and goes with it as it runs and jumps, so that my own body is not seen, only
 * my racket coming into the lower right as it swings. Between rallies it looks down the court toward the far back line
 * (`restingLook`); while the shuttle flies it looks at the shuttle (the user asked: a high one or one near the floor was
 * hard to find), keeping a little of the court in view (`lookAt`). A narrow screen steps back a little.
 */
export const BEHIND = 1.55,
  ABOVE = 2.25,
  /** A little to the left of the head, so that the racket comes in at the lower right. */
  ASIDE = -0.22,
  LOOK = { y: 0.95, z: -HALF_L + 0.6 },
  FOV = 60,
  /** How far the resting look follows my player across. */
  LOOK_FOLLOW = 0.45,
  /** How much of the way from the resting look to the shuttle the eye turns while it flies. */
  FOLLOW = 0.85;
/** Where the eye stands for my player at `me`, on a screen of `aspect`. */
export function eyeAt(me: { x: number; y: number; z: number }, aspect: number) {
  const back = aspect < 1.45 ? (1.45 - aspect) * 1.6 : 0;
  return { x: me.x + ASIDE, y: ABOVE + me.y + back * 0.4, z: me.z + BEHIND + back };
}
/** Where the eye looks between rallies: down the court, toward the far back line. */
export const restingLook = (me: { x: number }) => ({ x: me.x * LOOK_FOLLOW, y: LOOK.y, z: LOOK.z });
/**
 * Where the eye looks while the shuttle is at `s`: most of the way toward it from the resting look; a shuttle that has
 * come level with the eye or behind it is looked at as if it were a little in front, so that the eye never turns round.
 */
export function lookToward(me: { x: number; y: number; z: number }, s: { x: number; y: number; z: number }, aspect: number) {
  const rest = restingLook(me),
    eye = eyeAt(me, aspect),
    z = Math.min(s.z, eye.z - 1.6);
  return { x: rest.x + (s.x - rest.x) * FOLLOW, y: rest.y + (s.y - rest.y) * FOLLOW, z: rest.z + (z - rest.z) * FOLLOW };
}
export function courtCamera(camera: T.PerspectiveCamera, aspect: number, me: { x: number; y: number; z: number }, look = restingLook(me), shake = { x: 0, y: 0 }) {
  camera.fov = aspect > 1.9 ? FOV - 6 : aspect < 1.2 ? FOV + 8 : FOV;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const eye = eyeAt(me, aspect);
  camera.position.set(eye.x + shake.x, eye.y + shake.y, eye.z);
  camera.lookAt(look.x, look.y, look.z);
  camera.updateMatrixWorld();
}
/** How a swipe's speed (canvas heights a second) becomes the stroke's power (0.85: deep, near the back line). */
export const powerOf = (speed: number) => Math.max(0, (speed - 0.6) / 5);
/** A swipe's lean across: its angle from straight up the screen (radians, + to the right), held within a wide angle. */
export const yawOf = (dx: number, dy: number) => Math.max(-0.5, Math.min(0.5, Math.atan2(dx, Math.max(1, Math.abs(dy))) * 0.7));
