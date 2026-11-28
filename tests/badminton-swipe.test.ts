import { describe, expect, test } from "vitest";
import { HELD_STILL, SlideReader } from "../src/games/badminton/swipe";
import { powerOf } from "../src/games/badminton/layout";

/** A canvas 800 pixels high; places every 16 ms along a straight way up the screen. */
const H = 800;
function slide(reader: SlideReader, from: { x: number; y: number; t: number }, dy: number, ms: number, dx = 0) {
  const struck = [];
  const n = Math.max(1, Math.round(ms / 16));
  for (let k = 1; k <= n; k++) {
    const s = reader.move({ x: from.x + (dx * k) / n, y: from.y + (dy * k) / n, t: from.t + (ms * k) / n }, H);
    if (s) struck.push(s);
  }
  return { struck, end: { x: from.x + dx, y: from.y + dy, t: from.t + ms } };
}

describe("badminton: a swipe read as strokes, the finger let go or still held", () => {
  test("held, a quick slide up strikes as it stops, with the power of its speed; the finger stays down", () => {
    const r = new SlideReader(1, { x: 400, y: 600, t: 0 });
    // 0.5 of the height in 160 ms: about 3 heights a second.
    const a = slide(r, { x: 400, y: 600, t: 0 }, -400, 160);
    expect(a.struck).toHaveLength(0);
    // The finger stops on the screen: no move comes, and the next frame strikes.
    expect(r.still(a.end.t + 20, H)).toBeNull();
    const s = r.still(a.end.t + HELD_STILL + 5, H)!;
    expect(s).not.toBeNull();
    expect(s.power).toBeCloseTo(powerOf(400 / H / 0.16), 1);
    expect(Math.abs(s.yaw)).toBeLessThan(0.01);
    // Struck once: the still finger does not strike again, nor does lifting it there.
    expect(r.still(a.end.t + 400, H)).toBeNull();
    expect(r.release({ ...a.end, t: a.end.t + 450 }, H)).toBeNull();
  });
  test("held, a quick slide that slows strikes without stopping; a second slide strikes again, its own way", () => {
    const r = new SlideReader(1, { x: 400, y: 700, t: 0 });
    const fast = slide(r, { x: 400, y: 700, t: 0 }, -360, 130);
    // Slowed right down: a crawl strikes the quick part.
    const slow = slide(r, fast.end, -6, 120);
    expect([...fast.struck, ...slow.struck]).toHaveLength(1);
    // Back down slowly (no stroke), then a quick slide up and to the right: struck again, aimed right.
    const back = slide(r, slow.end, 300, 900);
    expect(back.struck).toHaveLength(0);
    const again = slide(r, back.end, -380, 140, 160);
    const late = again.struck.length ? null : r.still(again.end.t + HELD_STILL + 5, H);
    const second = again.struck[0] ?? late;
    expect(second).not.toBeNull();
    expect(second!.yaw).toBeGreaterThan(0.1);
  });
  test("held, a slow move only leads the racket about: no stroke until it is let go", () => {
    const r = new SlideReader(1, { x: 400, y: 600, t: 0 });
    const a = slide(r, { x: 400, y: 600, t: 0 }, -200, 1200, 120);
    expect(a.struck).toHaveLength(0);
    expect(r.still(a.end.t + 300, H)).toBeNull();
  });
  test("let go, a swipe strikes as it always did: any speed, from a short way on", () => {
    const r = new SlideReader(1, { x: 400, y: 600, t: 0 });
    const a = slide(r, { x: 400, y: 600, t: 0 }, -60, 60);
    const s = r.release(a.end, H)!;
    expect(s).not.toBeNull();
    expect(s.power).toBeCloseTo(powerOf(60 / H / 0.06), 1);
    // A tap is no stroke.
    const tap = new SlideReader(2, { x: 400, y: 600, t: 0 });
    expect(tap.release({ x: 402, y: 599, t: 90 }, H)).toBeNull();
  });
});
