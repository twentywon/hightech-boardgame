import type { TableSubject } from "../table/view";

/**
 * Numbers of the machine that browser tests aim with, free of Vite-only imports (the view's `capturing` is not):
 * the printed top's width and depth, the padded frame round it, how deep a hole goes, and what the camera keeps in view.
 */
export const FIELD = { w: 8.6, d: 6.9, frame: 0.75, pad: 0.42, well: 1.3 };
// The whole machine is kept in view, from the top of the sign to the foot of its front (the user found it cut).
export const WHACK_SUBJECT: TableSubject = { half: 5.4, halfZ: 5.3, height: 2.0, lookY: -0.4, tilt: 1.0 };
