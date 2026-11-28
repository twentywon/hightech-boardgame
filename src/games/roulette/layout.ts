import { cameraDistance } from "../../engine/camera";
import type { TableSubject } from "../table/view";
import { SPOTS } from "./bets";

/**
 * Numbers of the roulette table that browser tests aim with, free of Vite-only imports. The table's top is y = 0;
 * the betting layout lies on it centred on the origin (its own coordinates, `bets.ts`, shifted by `FELT_AT`), and the
 * wheel stands at its left end (`WHEEL_AT`), its own metres (`sim.ts`) scaled up by `WHEEL_SCALE` and raised by
 * `WHEEL_BASE`. While one bets the camera keeps the layout in view (`betSubject`); while the wheel spins it comes
 * down over the wheel (`wheelSubject`, looked at from the wheel's middle).
 */
export const FELT_AT = { x: 0.15, z: -0.42 },
  FELT_Y = 0.003,
  WHEEL_AT = { x: -3.75, z: -0.3 },
  WHEEL_SCALE = 2.7,
  WHEEL_BASE = 0.09;
/** The table's top (felt) and the padded rail round it. */
export const TABLE = { left: -5.15, right: 2.65, far: -1.55, near: 1.75 };
/**
 * What the camera keeps in view while one bets: the layout and the chips on it, and room at the foot of the table for
 * the bar of chips and buttons (a phone held sideways comes closer).
 */
export const BET_SUBJECT: TableSubject = { half: 3.72, halfZ: 1.3, height: 0.35, lookY: 0, tilt: 1.02 };
export const BET_WIDE: TableSubject = { half: 2.3, halfZ: 1.32, height: 0.35, lookY: 0, tilt: 1.02 };
export const betSubject = (aspect: number) => (aspect > 1.9 ? BET_WIDE : BET_SUBJECT);
/**
 * Where the betting view looks across the table: on a screen of ordinary shape the wheel and the layout together
 * (the middle between them), on a short wide one (a phone held sideways) the layout alone, larger, for its spots.
 */
export const betAcross = (aspect: number) => (aspect > 1.9 ? 0 : -1.38);
/** The camera over the layout for a canvas of `aspect`: where it stands and the point it looks at. */
export function betCamera(aspect: number) {
  const subject = betSubject(aspect),
    distance = cameraDistance(aspect, false, subject),
    across = betAcross(aspect);
  return { position: { x: across, y: Math.sin(subject.tilt) * distance, z: Math.cos(subject.tilt) * distance }, target: { x: across, y: subject.lookY, z: 0 } };
}
/** What the camera keeps in view over the spinning wheel, round its middle. */
export const WHEEL_SUBJECT: TableSubject = { half: 1.35, halfZ: 1.3, height: 0.4, lookY: 0.1, tilt: 1.08 };
/** Where a spot's chips lie on the table. */
export const spotPlace = (id: number) => ({ x: SPOTS[id].x + FELT_AT.x, y: FELT_Y, z: SPOTS[id].z + FELT_AT.z });
