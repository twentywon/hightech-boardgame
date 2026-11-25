import type { TableSubject } from "../table/view";

/**
 * Numbers of the run that browser tests aim with, free of Vite-only imports. The camera is placed by the view itself
 * (`SnowboardView.follow`): it looks at the course from the side, `EYE_Z` metres in front of the line the rider rides
 * along, showing `VIEW_W` metres across on a wide screen and at least `VIEW_H` metres up and down.
 */
export const EYE_Z = 1,
  VIEW_W = 28,
  VIEW_H = 13,
  /** How far ahead of the rider (metres for each m/s of its speed, at most `LEAD_MOST`) the camera looks. */
  LEAD = 0.32,
  LEAD_MOST = 7;
// Only the course's rough size for the shared table code; the view sets the camera every frame.
export const SNOWBOARD_SUBJECT: TableSubject = { half: 17, halfZ: 4, height: 8, lookY: 0, tilt: 0.1 };
