import { describe, expect, test } from "vitest";
import type * as T from "three";
import { MOST_PIXELS, capped } from "../src/engine/zoom";

/** A stand-in for a WebGL renderer, as three's own keeps its size and density (setPixelRatio sets the size again). */
function fake() {
  const r = {
    w: 0,
    h: 0,
    ratio: 1,
    setSize(w: number, h: number) {
      r.w = w;
      r.h = h;
    },
    setPixelRatio(value: number) {
      r.ratio = value;
      (r as unknown as T.WebGLRenderer).setSize(r.w, r.h, false);
    },
    getPixelRatio: () => r.ratio,
    getSize: (v: { x: number; y: number; set?: unknown }) => Object.assign(v, { x: r.w, y: r.h }),
  };
  return r;
}

describe("a table's drawing buffer", () => {
  test("a tablet's large screen at twice the density is drawn a little less dense, a phone's not at all", () => {
    const tablet = fake();
    capped(tablet as unknown as T.WebGLRenderer);
    tablet.setPixelRatio(2);
    tablet.setSize(1280, 800);
    expect(tablet.ratio).toBeLessThan(2);
    expect(tablet.w * tablet.h * tablet.ratio ** 2).toBeLessThanOrEqual(MOST_PIXELS + 1);
    const phone = fake();
    capped(phone as unknown as T.WebGLRenderer);
    phone.setPixelRatio(2);
    phone.setSize(915, 412);
    expect(phone.ratio).toBe(2);
    // Made smaller again, the tablet's canvas gets back the density it asked for; never below one.
    tablet.setSize(800, 500);
    expect(tablet.ratio).toBe(2);
    tablet.setSize(4000, 3000);
    expect(tablet.ratio).toBe(1);
  });
});
