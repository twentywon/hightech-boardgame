import type { Symbol } from "./layout";

/**
 * Lays the path of a colour's symbol, centred on (cx, cy) and about `r` in radius, for the caller to fill or stroke:
 * a disc, a triangle, a star, a square, a diamond, a cross, a heart and a crescent moon.
 */
export function symbolPath(ctx: CanvasRenderingContext2D, kind: Symbol, cx: number, cy: number, r: number) {
  ctx.beginPath();
  const poly = (points: [number, number][]) => {
    points.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r)));
    ctx.closePath();
  };
  switch (kind) {
    case "circle":
      ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      break;
    case "triangle":
      poly([
        [0, -0.95],
        [0.92, 0.7],
        [-0.92, 0.7],
      ]);
      break;
    case "star":
      poly(Array.from({ length: 10 }, (_, k) => {
        const a = -Math.PI / 2 + (k * Math.PI) / 5,
          s = k % 2 ? 0.42 : 1;
        return [Math.cos(a) * s, Math.sin(a) * s + 0.06] as [number, number];
      }));
      break;
    case "square":
      poly([
        [-0.72, -0.72],
        [0.72, -0.72],
        [0.72, 0.72],
        [-0.72, 0.72],
      ]);
      break;
    case "diamond":
      poly([
        [0, -1],
        [0.78, 0],
        [0, 1],
        [-0.78, 0],
      ]);
      break;
    case "cross": {
      const a = 0.3,
        b = 0.9;
      poly([
        [-a, -b],
        [a, -b],
        [a, -a],
        [b, -a],
        [b, a],
        [a, a],
        [a, b],
        [-a, b],
        [-a, a],
        [-b, a],
        [-b, -a],
        [-a, -a],
      ]);
      break;
    }
    case "heart":
      ctx.moveTo(cx, cy + 0.9 * r);
      ctx.bezierCurveTo(cx - 1.25 * r, cy + 0.05 * r, cx - 0.85 * r, cy - 1.05 * r, cx, cy - 0.42 * r);
      ctx.bezierCurveTo(cx + 0.85 * r, cy - 1.05 * r, cx + 1.25 * r, cy + 0.05 * r, cx, cy + 0.9 * r);
      ctx.closePath();
      break;
    case "moon":
      // A crescent: the outer circle round the left from where it meets a circle set off toward the upper right,
      // then back along the inner edge of that circle (the angles are where the two circles cross).
      ctx.arc(cx, cy, r * 0.9, 0.5056, 4.941, false);
      ctx.arc(cx + r * 0.45, cy - r * 0.2, r * 0.72, 4.3637, 1.0832, true);
      ctx.closePath();
      break;
  }
}
