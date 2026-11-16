import type { TableSubject } from "../table/view";

/**
 * Numbers of the machine that browser tests aim with, free of Vite-only imports (the view's `capturing` is not):
 * the printed top's width and depth, the padded frame round it, how deep a hole goes, and what the camera keeps in view.
 */
export const FIELD = { w: 8.6, d: 6.9, frame: 0.75, pad: 0.42, well: 1.3 };
export const WHACK_SUBJECT: TableSubject = { half: 5.3, halfZ: 4.6, height: 1.2, lookY: 0.2, tilt: 1.0 };
