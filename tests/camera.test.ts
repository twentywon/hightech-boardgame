import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  cameraDistance,
  type Subject,
} from "../src/engine/camera";

function bounds(aspect: number, top: boolean, game: keyof typeof SUBJECTS, scale = 1) {
  const s: Subject = SUBJECTS[game],
    depth = s.halfZ ?? s.half,
    d = cameraDistance(aspect, top, s) * scale,
    a = top ? OVERHEAD : (s.tilt ?? TILT),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 200);
  camera.position.set(0, Math.sin(a) * d, Math.cos(a) * d);
  camera.lookAt(0, s.lookY, 0);
  camera.updateMatrixWorld();
  let x = 0,
    up = -1,
    down = 1;
  for (const cx of [-s.half, s.half])
    for (const cz of [-depth, depth])
      for (const cy of [0, s.height]) {
        const v = new Vector3(cx, cy, cz).project(camera);
        x = Math.max(x, Math.abs(v.x));
        up = Math.max(up, v.y);
        down = Math.min(down, v.y);
      }
  return { x, up, down };
}
describe("camera fitting", () => {
  const aspects = [0.5, 0.75, 1, 1.35, 1.78, 2.4];
  for (const game of Object.keys(SUBJECTS) as (keyof typeof SUBJECTS)[])
    for (const top of [false, true])
      it(`${game} ${top ? "overhead" : "tilted"} fills the canvas without clipping`, () => {
        for (const aspect of aspects) {
          const b = bounds(aspect, top, game);
          expect(b.x).toBeLessThanOrEqual(1.0401);
          expect(b.up).toBeLessThanOrEqual(0.9001);
          expect(b.down).toBeGreaterThanOrEqual(-0.9401);
          // Tight: at least one side touches its limit.
          const slack = Math.min(1.04 - b.x, 0.9 - b.up, b.down + 0.94);
          expect(slack).toBeLessThan(0.002);
          // Moving 3% closer would overflow that side.
          const closer = bounds(aspect, top, game, 0.97);
          expect(
            closer.x > 1.04 || closer.up > 0.9 || closer.down < -0.94,
          ).toBe(true);
        }
      });
  it("is closer than the previous fixed distances on common screens", () => {
    for (const aspect of [0.75, 1, 1.35, 1.78]) {
      const old = Math.max(11.7, 12.8 / Math.min(aspect, 1)) * 0.9;
      expect(cameraDistance(aspect, false, SUBJECTS.gomoku)).toBeLessThan(old);
      expect(cameraDistance(aspect, false, SUBJECTS.reversi)).toBeLessThan(old);
    }
  });
});
