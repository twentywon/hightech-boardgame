import type { TableSubject } from "../table/view";

/**
 * Numbers of the coin pusher that browser tests aim with, free of Vite-only imports: what the camera keeps in view
 * (the machine seen through its front glass from where a player stands, the tray of coins won below it), and the
 * height the machine's playfield stands at, on whose plane a press is followed (the coin drops in the column under it).
 */
export const PUSHER_SUBJECT: TableSubject = { half: 2.25, halfZ: 2.2, height: 3.3, lookY: 1.2, tilt: 0.6 };
/** On a short wide screen (a phone held sideways) the view comes closer: the playfield larger, the room round it narrower. */
export const PUSHER_WIDE: TableSubject = { half: 1.95, halfZ: 2.0, height: 3.15, lookY: 1.25, tilt: 0.6 };
export const pusherSubject = (aspect: number) => (aspect > 1.9 ? PUSHER_WIDE : PUSHER_SUBJECT);
/** The playfield's floor above the room's floor: everything of the machine (`sim.ts` coordinates) stands this much higher. */
export const BASE = 1.0;
