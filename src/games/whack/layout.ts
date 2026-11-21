import type { TableSubject } from "../table/view";

/**
 * Numbers of the machine that browser tests aim with, free of Vite-only imports (the view's `capturing` is not):
 * the deck's width and depth, the chrome trim round it, how deep a hole goes, the ground under the cabinet, the
 * height of the sign behind, and what the camera keeps in view.
 */
export const FIELD = { w: 8.6, d: 6.9, trim: 0.18, well: 1.3, ground: -3.0, marquee: 3.2 };
// The whole machine is kept in view, from the top of the sign to the foot of its front (the user found it cut).
export const WHACK_SUBJECT: TableSubject = { half: 4.2, halfZ: 3.0, height: 5, lookY: 0, tilt: 0.85 };
