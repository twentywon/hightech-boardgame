import { powerOf, yawOf } from "./layout";
import { MOST } from "./sim";

/**
 * A finger (or a pressed mouse) on the court, read as strokes. Free of the page: it takes places in pixels with
 * their times in ms, and the canvas height (speeds are in canvas heights a second).
 *
 * Let go, a swipe is a stroke as before: its speed over its last `WINDOW` ms is the power, its way from where it began
 * the aim (from `LET_GO_FAR` of the height on). Still held, a quick slide is a stroke too (the user asked: no need to
 * lift the finger each time): once it has gone `HELD_FAR` of the height at `HELD_SPEED` or quicker, it strikes as it
 * slows (to `FADE` of its quickest) or stops (no move for `HELD_STILL` ms), with the power of its quickest; the next
 * slide is reckoned from there. A slow move, the racket only led about, strikes nothing until it is let go.
 */
export interface SlidePoint {
  x: number;
  y: number;
  t: number;
}
export interface Slide {
  power: number;
  yaw: number;
}
export const WINDOW = 100,
  LET_GO_FAR = 0.04,
  HELD_FAR = 0.06,
  HELD_SPEED = 1.1,
  FADE = 0.55,
  HELD_STILL = 70;
/** Only the last places are kept (and where the slide began). */
const KEPT = 40;
export class SlideReader {
  private points: SlidePoint[];
  private peak = 0;
  /** Whether a held slide has struck since the press (then what is left at the lift must be a quick slide too). */
  private struck = false;
  constructor(
    readonly id: number,
    start: SlidePoint,
  ) {
    this.points = [start];
  }
  /** The speed over the last `WINDOW` ms up to the newest place (from where this slide began, for a shorter one). */
  private speed(height: number) {
    const pts = this.points,
      end = pts[pts.length - 1],
      from = [...pts].reverse().find((p) => end.t - p.t >= WINDOW) ?? pts[0],
      span = Math.max(16, end.t - from.t) / 1000;
    return Math.hypot(end.x - from.x, end.y - from.y) / height / span;
  }
  /** How far this slide has gone from where it began, in canvas heights, and its way. */
  private way(height: number) {
    const first = this.points[0],
      end = this.points[this.points.length - 1],
      dx = end.x - first.x,
      dy = end.y - first.y;
    return { dx, dy, far: Math.hypot(dx, dy) / height };
  }
  private quick(height: number) {
    return this.peak >= HELD_SPEED && this.way(height).far >= HELD_FAR;
  }
  /** The held slide struck: its quickest speed the power; the next slide begins at the newest place. */
  private strike(height: number): Slide {
    const { dx, dy } = this.way(height),
      slide = { power: Math.min(MOST, powerOf(this.peak)), yaw: yawOf(dx, dy) };
    this.points = [this.points[this.points.length - 1]];
    this.peak = 0;
    this.struck = true;
    return slide;
  }
  /** A move while held: a stroke when a quick slide has just slowed down. */
  move(p: SlidePoint, height: number): Slide | null {
    this.points.push(p);
    if (this.points.length > KEPT) this.points.splice(1, this.points.length - KEPT);
    const v = this.speed(height);
    this.peak = Math.max(this.peak, v);
    return this.quick(height) && v < FADE * this.peak ? this.strike(height) : null;
  }
  /** A frame with no move: a quick slide whose finger has stopped on the screen is a stroke. */
  still(now: number, height: number): Slide | null {
    const last = this.points[this.points.length - 1];
    return now - last.t > HELD_STILL && this.quick(height) ? this.strike(height) : null;
  }
  /** Let go: what is left of the slide is a stroke as a swipe always was, or, after a held stroke, only a quick slide. */
  release(p: SlidePoint, height: number): Slide | null {
    this.points.push(p);
    const v = this.speed(height);
    this.peak = Math.max(this.peak, v);
    if (this.struck) return this.quick(height) ? this.strike(height) : null;
    const { dx, dy, far } = this.way(height);
    if (far < LET_GO_FAR) return null;
    return { power: Math.min(MOST, powerOf(v)), yaw: yawOf(dx, dy) };
  }
}
