import type * as T from "three";
import { HALF_L, HAND_Y } from "./sim";

/**
 * Numbers of the table tennis table that browser tests aim with, free of Vite-only imports. The table is seen in the
 * first person, from behind my end and a little above, the table running away from me: `EYE` is where the eye
 * stands, `LOOK` where it looks, `RALLY_FOV` how wide it sees (more than the other tables, so that the paddle near
 * me and the far end both stay in view; less on a wide screen). My paddle moves over the plane y = `HAND_Y` (re-exported here).
 */
export const EYE = { y: 0.62, z: HALF_L + 1.25 },
  LOOK = { y: -0.02, z: -0.9 },
  RALLY_FOV = 50;
export { HAND_Y };
/** Puts the eye where the player stands; a narrow screen steps back and up so that the table's sides stay in sight. */
export function rallyCamera(camera: T.PerspectiveCamera, aspect: number) {
  const back = aspect < 1.35 ? (1.35 - aspect) * 1.6 : 0;
  // A wide screen sees enough across: it looks a little closer, so that the far end is not too small.
  camera.fov = aspect > 1.6 ? Math.max(42, RALLY_FOV - (aspect - 1.6) * 9) : RALLY_FOV;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.position.set(0, EYE.y + back * 0.3, EYE.z + back);
  camera.lookAt(0, LOOK.y, LOOK.z);
  camera.updateMatrixWorld();
}
