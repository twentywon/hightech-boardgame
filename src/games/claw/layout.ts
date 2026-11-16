import type { TableSubject } from "../table/view";

/**
 * Numbers of the claw machine that browser tests aim with, free of Vite-only imports: what the camera keeps in
 * view (the pit seen through the front glass from where a player stands), the height of the plane a finger on the
 * glass is followed on (about the tops of the toys), and the big button on the control deck.
 */
export const CLAW_SUBJECT: TableSubject = { half: 3.05, halfZ: 3.1, height: 4.15, lookY: 1.0, tilt: 0.5 };
export const AIM_HEIGHT = 0.45;
/** The control deck in front of the glass (its middle and its slope toward the player), and its big button, which lies on it. */
export const DECK = { y: -0.18, z: 2.48, tilt: 0.32 };
export const BUTTON = { x: 1.65, y: DECK.y + 0.05 * Math.cos(DECK.tilt), z: DECK.z + 0.05 * Math.sin(DECK.tilt) };
