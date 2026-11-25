/**
 * A finger (or a pressed mouse) drawing circles on the screen, read as turns of the reel's crank. Free of the page:
 * it takes places in pixels. The turns are how far the way the finger goes has turned round (a whole circle drawn is
 * one turn, wherever on the screen and however large), so only going round counts: a straight stroke turns nothing,
 * and a scrub back and forth (the way reversed at once) is no turn. Going round the other way counts as well, once
 * it has truly turned that way.
 */
/** Steps shorter than this many pixels are gathered until they are long enough to have a way. */
export const STEP = 4;
/** A turn of the way sharper than this (radians) is a reversal, not a circle. */
export const REVERSE = 2.2;
/** A turn the other way round must be at least this sharp (radians) to change the way the circles go. */
export const OTHER_WAY = 0.12;
export class CrankReader {
  private last: { x: number; y: number } | null = null;
  private way: number | null = null;
  private sense = 0;
  /** A new place of the finger: the turns of the crank it made (never less than 0). */
  add(x: number, y: number): number {
    if (!this.last) {
      this.last = { x, y };
      return 0;
    }
    const dx = x - this.last.x,
      dy = y - this.last.y;
    if (Math.hypot(dx, dy) < STEP) return 0;
    this.last = { x, y };
    const way = Math.atan2(dy, dx),
      before = this.way;
    this.way = way;
    if (before === null) return 0;
    let d = way - before;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > REVERSE) {
      this.sense = 0;
      return 0;
    }
    const sense = Math.sign(d);
    if (sense !== this.sense && sense !== 0) {
      if (this.sense !== 0 && Math.abs(d) < OTHER_WAY) return 0;
      this.sense = sense;
      if (Math.abs(d) < OTHER_WAY) return 0;
    }
    return Math.abs(d) / (2 * Math.PI);
  }
}
