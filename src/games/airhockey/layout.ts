import type { TableSubject } from "../table/view";

/**
 * Numbers of the air hockey table that browser tests aim with, free of Vite-only imports: what the camera keeps in
 * view (the table seen from my end, the scoreboard over the far end), the ground of the park, and the rails.
 */
export const AIRHOCKEY_SUBJECT: TableSubject = { half: 2.75, halfZ: 5.15, height: 2.7, lookY: 0.5, tilt: 0.98 };
export const GROUND = -2.6;
export const RAIL = { width: 0.3, high: 0.16 };
