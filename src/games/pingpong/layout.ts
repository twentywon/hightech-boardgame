import type * as T from "three";
import { HALF_L, HAND_Y, alongSight, handFor } from "./sim";

/**
 * Numbers of the table tennis table that browser tests aim with, free of Vite-only imports. The table is seen in the
 * first person, from behind my end and a little above, the table running away from me: `EYE` is where the eye
 * stands, `LOOK` where it looks, `RALLY_FOV` how wide it sees (more than the other tables, so that the paddle near
 * me and the far end both stay in view; less on a wide screen). The pointer is aimed onto the plane y = `HAND_Y`
 * (re-exported here) and my blade stands on the line of sight through that point at its own height (`alongSight`,
 * `handFor` re-exported), so that it is drawn under the finger however high it is raised.
 */
export const EYE = { y: 0.62, z: HALF_L + 1.25 },
  LOOK = { y: -0.02, z: -0.9 },
  RALLY_FOV = 50;
export { HAND_Y, alongSight, handFor };
/** How far the point the eye looks at goes with it when I step aside (the rest of the step turns the eye a little back toward the table). */
export const LOOK_SHARE = 0.55;
/**
 * How far the eye rises for a ball that will come up to `peak` over my end (`highest` in the sim): enough to stay
 * `LIFT_GAP` above it, so that the blade raised to meet it is still seen from above, under the finger; nothing for a
 * ball that stays low. For each metre it rises it also steps back `LIFT_BACK` and looks `LIFT_LOOK` higher, so that
 * the high ball and the blade raised to it stand in the upper middle of the view, under the scoreboard, with the
 * far end of the table still in sight.
 */
export const LIFT_GAP = 0.26,
  LIFT_BACK = 0.3,
  LIFT_LOOK = 0.45;
export const liftFor = (peak: number) => Math.max(0, peak + LIFT_GAP - EYE.y);
/**
 * Puts the eye where the player stands, `side` metres across from behind the middle (the view's `data-eye`: I step
 * aside for a wide ball), raised by `lift` for a high ball (`data-lift`); a narrow screen steps back and up so that
 * the table's sides stay in sight. `seat` 1 (the far end's player over Wi-Fi) stands behind the other end, turned round.
 */
export function rallyCamera(camera: T.PerspectiveCamera, aspect: number, side = 0, lift = 0, seat: 0 | 1 = 0) {
  const back = aspect < 1.35 ? (1.35 - aspect) * 1.6 : 0,
    turn = seat ? -1 : 1;
  // A wide screen sees enough across: it looks a little closer, so that the far end is not too small.
  camera.fov = aspect > 1.6 ? Math.max(42, RALLY_FOV - (aspect - 1.6) * 9) : RALLY_FOV;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.position.set(side * turn, EYE.y + back * 0.3 + lift, (EYE.z + back + lift * LIFT_BACK) * turn);
  camera.lookAt(side * LOOK_SHARE * turn, LOOK.y + lift * LIFT_LOOK, LOOK.z * turn);
  camera.updateMatrixWorld();
}
