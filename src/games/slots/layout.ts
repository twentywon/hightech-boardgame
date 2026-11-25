import type { TableSubject } from "../table/view";

/**
 * Numbers of the slot machine that the view and browser tests share, free of Vite-only imports. The cabinet stands
 * with its front at z = `FRONT`, the room's floor at `ROOM`; the camera keeps the cabinet from the coin tray to the
 * top of its sign in view, from a little above the reel window.
 */
export const FRONT = 0.3,
  ROOM = -0.38;
export const SLOT_SUBJECT: TableSubject = { half: 1.05, halfZ: 0.3, height: 2.6, lookY: 1.25, tilt: 0.2 };
/** On a short wide screen (a phone held sideways) the cabinet fills the height; the room shows round it. */
export const SLOT_WIDE: TableSubject = { half: 0.95, halfZ: 0.3, height: 2.55, lookY: 1.27, tilt: 0.2 };
export const slotSubject = (aspect: number) => (aspect > 1.9 ? SLOT_WIDE : SLOT_SUBJECT);
/** The reel window: its middle's height, a row's height, the drums' radius, width and spacing. */
export const REELS = { y: 1.36, row: 0.17, radius: 0.65, width: 0.26, gap: 0.3 };
/** The lever on the cabinet's right: its pivot, the arm's length, and how far down a drag pulls it fully. */
export const LEVER = { x: 0.8, y: 1.0, z: -0.05, arm: 0.62, travel: 0.55 };
/** How far the lever must come down (0 to 1) before it trips the spin. */
export const TRIP = 0.85;
