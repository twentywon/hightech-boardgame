import type { Input } from "./sim";

/** What a hand at the screen does: run either way, jump, strike. */
export type Act = "left" | "right" | "jump" | "strike";
/** The lever's dead middle, the lean from which the run is at its fastest, and the lean upward that jumps (and the lean back under which it may jump again). */
export const LEVER_DEAD = 0.2,
  LEVER_FULL = 0.85,
  LEVER_JUMP = 0.5,
  LEVER_REARM = 0.25;
/** The run a lever's sideways lean asks: nothing in its dead middle, then more the further, full near its rim. */
export function leverRun(x: number) {
  const a = Math.abs(x);
  return a <= LEVER_DEAD ? 0 : Math.sign(x) * Math.min(1, (a - LEVER_DEAD) / (LEVER_FULL - LEVER_DEAD));
}
/** A person's hands at this screen: keys, a lever and a button held, and the presses of jump and strike counted. */
export class Hand {
  keys = new Set<Act>();
  touch = new Set<Act>();
  /** The lever's lean, x to the right and y upward, inside the unit circle; `armed` while a lean upward would jump. */
  lever = { x: 0, y: 0, armed: true };
  jumps = 0;
  strikes = 0;
  private usedJumps = 0;
  private usedStrikes = 0;
  private holds(act: Act) {
    return this.keys.has(act) || this.touch.has(act);
  }
  press(act: Act) {
    if (act === "jump") this.jumps++;
    else if (act === "strike") this.strikes++;
  }
  /**
   * The lever leaned to (x, y). Leaning it up past `LEVER_JUMP` jumps once; it jumps again only once it has come back
   * under `LEVER_REARM`, so a thumb resting high while running does not hop on every landing.
   */
  lean(x: number, y: number) {
    const far = Math.hypot(x, y);
    if (far > 1) (x /= far), (y /= far);
    this.lever.x = x;
    this.lever.y = y;
    if (this.lever.armed && y > LEVER_JUMP) {
      this.lever.armed = false;
      this.press("jump");
    } else if (y < LEVER_REARM) this.lever.armed = true;
  }
  /** The way it runs now (−1 to 1): the keys, if held, outrank the lever. */
  way() {
    const keys = (this.holds("right") ? 1 : 0) - (this.holds("left") ? 1 : 0);
    return this.holds("right") || this.holds("left") ? keys : leverRun(this.lever.x);
  }
  /** One slice's controls: a press counted since the last slice is a press now. The keys, if held, outrank the lever. */
  input(): Input {
    const input = { x: this.way(), jump: this.jumps > this.usedJumps, strike: this.strikes > this.usedStrikes };
    this.usedJumps = this.jumps;
    this.usedStrikes = this.strikes;
    return input;
  }
  clear() {
    this.keys.clear();
    this.touch.clear();
    this.lever.x = this.lever.y = 0;
    this.lever.armed = true;
  }
}
