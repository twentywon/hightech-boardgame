import type * as T from "three";
import { HALF_L } from "./sim";

/**
 * Where the eye stands, free of Vite-only imports (browser tests aim with it): behind my back line and above it, so
 * that my player is seen from behind in the lower middle and the whole far court beyond the net. It follows my player
 * across a little (`across`). A narrow screen steps back and up to keep the side lines in sight.
 */
export const EYE = { y: 5.3, z: HALF_L + 5.4 },
  LOOK = { y: 0, z: -0.6 },
  FOV = 46,
  /** How far the eye follows my player across, and how far the point it looks at does. */
  FOLLOW = 0.45,
  LOOK_FOLLOW = 0.2;
export function courtCamera(camera: T.PerspectiveCamera, aspect: number, across = 0) {
  const back = aspect < 1.45 ? (1.45 - aspect) * 5 : 0;
  camera.fov = aspect > 1.9 ? FOV - 4 : FOV;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.position.set(across * FOLLOW, EYE.y + back * 0.45, EYE.z + back);
  // A wide screen (a phone held sideways) looks a little higher, so that the far court comes down from under the scoreboard.
  const wide = Math.max(0, Math.min(1, (aspect - 1.75) / 0.5));
  camera.lookAt(across * LOOK_FOLLOW, LOOK.y + wide * 1.1, LOOK.z - wide * 0.6);
  camera.updateMatrixWorld();
}
/** How a swipe's speed (canvas heights a second) becomes the stroke's power (1: a clear from the middle to the back line). */
export const powerOf = (speed: number) => Math.max(0, (speed - 0.6) / 5);
/** A swipe's lean across: its angle from straight up the screen (radians, + to the right), held within a wide angle. */
export const yawOf = (dx: number, dy: number) => Math.max(-0.5, Math.min(0.5, Math.atan2(dx, Math.max(1, Math.abs(dy))) * 0.7));
