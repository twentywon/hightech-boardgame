import { strokeLines, type BoardSpec } from "../points/view";
import { MILLS } from "./rules";

// Corners and side middles of a square, clockwise from the top left.
const ROUND = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const points = [3, 2, 1].flatMap((reach) => ROUND.map(([x, z]) => ({ x: x * reach, z: z * reach })));
const lines = MILLS.flatMap(([a, b, c]) => [[a, b], [b, c]] as [number, number][]);
/** Three squares joined at the middles of their sides, on a wooden board. */
export const morrisBoard = (): BoardSpec => ({
  points,
  half: 3.7,
  centreZ: 0,
  theme: "wood",
  radius: 0.3,
  colors: ["#1f2933", "#f1ead9"],
  subject: { half: 3.9, halfZ: 3.9, height: 0.6, lookY: 0, tilt: (55 * Math.PI) / 180 },
  paint(ctx, px, unit) {
    strokeLines(ctx, px, points, lines);
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(...px(p.x, p.z), unit * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});
