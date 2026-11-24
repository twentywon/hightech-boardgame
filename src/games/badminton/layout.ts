import type * as T from "three";
import { HALF_L } from "./sim";

/**
 * The eye, free of Vite-only imports (browser tests aim with it). Semi first person (the user asked): the eye stands
 * just behind and above my player's head and goes with it as it runs and jumps, so that my own body is not seen, only
 * my racket coming into the lower right as it swings. It looks down the court toward the far back line, up after a
 * shuttle that comes high over me and down toward one that comes low near me (`lift`, negative for down). A narrow screen steps back a little to keep the side lines in sight.
 */
export const BEHIND = 1.55,
  ABOVE = 2.25,
  /** A little to the left of the head, so that the racket arm comes in at the lower right. */
  ASIDE = -0.22,
  LOOK = { y: 0.95, z: -HALF_L + 0.6 },
  FOV = 60,
  /** How far the point looked at follows my player across (the rest of the way the eye turns with it). */
  LOOK_FOLLOW = 0.45;
export function courtCamera(camera: T.PerspectiveCamera, aspect: number, me: { x: number; y: number; z: number }, lift = 0, shake = { x: 0, y: 0 }) {
  const back = aspect < 1.45 ? (1.45 - aspect) * 1.6 : 0;
  camera.fov = aspect > 1.9 ? FOV - 6 : aspect < 1.2 ? FOV + 8 : FOV;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.position.set(me.x + ASIDE + shake.x, ABOVE + me.y + back * 0.4 + shake.y, me.z + BEHIND + back);
  // Up after a high shuttle (looking further off), down toward a low one near me (looking nearer).
  camera.lookAt(me.x * LOOK_FOLLOW, LOOK.y + lift, LOOK.z + (lift > 0 ? lift * 2.2 : -lift * 4));
  camera.updateMatrixWorld();
}
/** How far the eye looks up after a shuttle `height` metres up coming down over me. */
export const liftFor = (height: number) => Math.max(0, Math.min(2.2, (height - 2.2) * 0.45));
/** How far the eye looks down at a shuttle coming low (`height`) and `near` metres from me, so that the racket swinging up from below is seen. */
export const dipFor = (height: number, near: number) => (height >= 1.5 ? 0 : -Math.min(1.7, (1.5 - height) * 1.9) * Math.max(0, Math.min(1, (4.5 - near) / 2.5)));
/** How a swipe's speed (canvas heights a second) becomes the stroke's power (0.85: deep, near the back line; beyond 1.3: long). */
export const powerOf = (speed: number) => Math.max(0, (speed - 0.6) / 5);
/** A swipe's lean across: its angle from straight up the screen (radians, + to the right), held within a wide angle. */
export const yawOf = (dx: number, dy: number) => Math.max(-0.5, Math.min(0.5, Math.atan2(dx, Math.max(1, Math.abs(dy))) * 0.7));
