/**
 * The steering wheel on the screen (주차 요원, at the wheel): a thumb turns it round its middle like a real one, and
 * how far it is turned is how far the front wheels are. Pure numbers, free of the page, so that the unit tests try them.
 *
 * Angles are in radians, measured on the screen with y down, so that a positive turn is clockwise (to the right).
 */

/** Lock to lock: three quarters of a turn either way is the front wheels as far as they go. */
export const WHEEL_LOCK = (Math.PI * 3) / 2;
/** Nearer the wheel's middle than this share of its radius a finger's angle jumps about, so it is not followed there. */
export const WHEEL_HOLD = 0.18;
/** Let go, the wheel comes back to the middle by itself (as a car's does when it rolls): this much of the way each second… */
export const WHEEL_RETURN = 7;
/** …and the last little bit at once. */
const SETTLED = 0.01;

/** The way from angle `from` to angle `to` the short way round, in (−π, π]. */
export function turnBetween(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** The wheel at `angle` turned on by a finger going from angle `from` to angle `to` round its middle, held within the lock. */
export function turnWheel(angle: number, from: number, to: number) {
  return Math.max(-WHEEL_LOCK, Math.min(WHEEL_LOCK, angle + turnBetween(from, to)));
}

/** The steering the wheel at `angle` asks for, −1 (full left) to 1 (full right). */
export function steerOf(angle: number) {
  return Math.max(-1, Math.min(1, angle / WHEEL_LOCK));
}

/** The wheel let go for `dt` seconds: it comes back toward the middle, smoothly and not at once. */
export function centred(angle: number, dt: number) {
  const next = angle * Math.exp(-WHEEL_RETURN * dt);
  return Math.abs(next) < SETTLED ? 0 : next;
}

/** A finger's angle round the wheel's middle (`dx`, `dy` from it, in pixels), or null so near the middle that it is not followed. */
export function fingerAngle(dx: number, dy: number, radius: number) {
  return Math.hypot(dx, dy) < radius * WHEEL_HOLD ? null : Math.atan2(dy, dx);
}
