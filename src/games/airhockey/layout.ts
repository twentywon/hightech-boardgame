import type { TableSubject } from "../table/view";
import { HALF_X, HALF_Z } from "./sim";

/**
 * Numbers of the air hockey table that browser tests aim with, free of Vite-only imports. The table lies across the
 * screen as table soccer does (the user asked): the camera stands at its long side (`ORBIT`, a quarter turn round),
 * so my goal (+z) is at the left and the computer's at the right. `AIRHOCKEY_SUBJECT` is what it keeps in view
 * (`half` across the screen is the table's length), `DROP` how far below the playing surface the pub's floor lies,
 * and `RAIL` the rails.
 */
export const ORBIT = Math.PI / 2;
export const RAIL = { width: 0.3, high: 0.16 };
export const DROP = 3.2;
export const airHockeySubject = (aspect: number): TableSubject => ({
  half: HALF_Z + RAIL.width + (aspect < 1.2 ? 0.25 : 0.55),
  halfZ: HALF_X + RAIL.width + 0.45,
  height: 0.5,
  // Looking a little higher sets the table lower on the screen, clear of the scoreboard over it.
  lookY: aspect >= 2 ? 0.85 : 0.5,
  tilt: 1.08,
});
