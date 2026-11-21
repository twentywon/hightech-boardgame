/**
 * Numbers the carom view and its browser test share (free of Vite-only imports): what the camera keeps in view, from
 * which side the table is seen, and where the balls lie for the first shot.
 */
export { HALF_X, HALF_Z, R } from "./sim";
export { opening, WHITE, YELLOW, RED, RED2, HEAD, FOOT, BESIDE } from "./rules";
/** The table is seen from its long side, the shooter's end (+z) at the left, as in pocket ball. */
export const ORBIT = Math.PI / 2;
/** The cloth with its rails, and room above the far rail for the wall and its scoreboard. */
export const CAROM_SUBJECT = { half: 5.95, halfZ: 3.25, height: 0.5, lookY: 0, tilt: 0.92 };
/** On a short, wide screen (a phone held sideways) the table is framed a little tighter. */
export const CAROM_SUBJECT_SHORT = { half: 5.8, halfZ: 3.1, height: 0.4, lookY: 0, tilt: 0.84 };
/** What the camera keeps in view on a canvas this many pixels high. */
export const caromSubject = (height: number) => (height < 500 ? CAROM_SUBJECT_SHORT : CAROM_SUBJECT);
