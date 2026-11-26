import { ANGLE, POWER } from "./rules";

/**
 * How a drag draws the bow in 활잡이 결투, shared by the view and the browser tests (free of Three.js): a press
 * anywhere on the table takes the string, and the hand is pulled back from where it pressed. The arrow points the
 * other way from the pull (pull down and back to shoot up and ahead); the longer the pull, the harder the draw. The
 * angle is the bow's rise above the level toward the foe; a pull too short lets the bow down without shooting.
 */
/** The pull (a share of the canvas's shorter side) that gives the fullest draw, and the least that shoots at all (px). */
export const FULL_PULL = 0.42,
  LEAST_PULL = 14;
/** The draw as a share from the weakest (0) to the fullest (1), and the arrow's speed it gives (m/s), and back. */
export const powerOf = (share: number) => POWER.least + (POWER.most - POWER.least) * Math.max(0, Math.min(1, share));
export const shareOf = (power: number) => (power - POWER.least) / (POWER.most - POWER.least);
/**
 * The angle (degrees) and power (m/s) of a pull of `dx`, `dy` pixels (y grows downward) on a canvas `width` × `height`,
 * by an archer facing `face` on the screen (+1: toward the right), or null for a pull too short.
 */
export function pullAim(dx: number, dy: number, width: number, height: number, face: 1 | -1) {
  const length = Math.hypot(dx, dy);
  if (length < LEAST_PULL) return null;
  // The arrow goes against the pull: ahead is −dx as the archer faces, up is +dy (a pull downward).
  const ahead = -dx * face,
    up = dy,
    raw = (Math.atan2(up, ahead) * 180) / Math.PI,
    // A pull that would point the arrow down or back is taken as the nearest allowed (level, or near upright).
    angle = Math.max(ANGLE.least, Math.min(ANGLE.most, raw)),
    share = length / (FULL_PULL * Math.min(width, height));
  return { angle: Math.round(angle * 10) / 10, power: Math.round(powerOf(share) * 10) / 10 };
}
/** The pull (pixels) that gives `angle` and `power` for an archer facing `face` on a canvas `width` × `height`. */
export function pullFor(angle: number, power: number, width: number, height: number, face: 1 | -1) {
  const length = shareOf(power) * FULL_PULL * Math.min(width, height),
    a = (angle * Math.PI) / 180;
  return { dx: -Math.cos(a) * length * face, dy: Math.sin(a) * length };
}
/** The keyboard's steps: degrees of angle, metres a second of draw (Shift: finer). */
export const KEY_STEP = { angle: 1, power: 0.2, fine: 0.2 };
