import { strokeLines, type BoardSpec } from "../points/view";
import { LINKS, POINTS } from "./rules";

const STEP = 0.9;
const points = POINTS.map(({ col, row }) => ({ x: (col - 3) * STEP, z: (row - 3) * STEP }));
export const GOOSE = "#f4f1e8",
  FOX = "#d2691e";
/** The cross of 33 points with its slanted lines, cut into a wooden board; side colours follow who plays the geese. */
export const foxGeeseBoard = (variant: string): BoardSpec => ({
  points,
  half: 3.4,
  centreZ: 0,
  theme: "wood",
  radius: 0.3,
  colors: variant === "fox" ? [FOX, GOOSE] : [GOOSE, FOX],
  subject: { half: 3.55, halfZ: 3.55, height: 0.7, lookY: 0, tilt: (56 * Math.PI) / 180 },
  paint(ctx, px, unit) {
    // The cross itself, a shade darker than the board round it.
    ctx.fillStyle = "rgba(60, 36, 18, 0.16)";
    for (const [c0, r0, c1, r1] of [[2, 0, 4, 6], [0, 2, 6, 4]]) {
      const [x0, y0] = px((c0 - 3.45) * STEP, (r0 - 3.45) * STEP),
        [x1, y1] = px((c1 - 2.55) * STEP, (r1 - 2.55) * STEP);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    ctx.lineWidth = unit * 0.05;
    strokeLines(ctx, px, points, LINKS);
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(...px(p.x, p.z), unit * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});
