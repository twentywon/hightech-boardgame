import type { BoardSpec } from "../points/view";
import { HOLES, SIZE } from "./rules";

const GAP = 0.86,
  points = HOLES.map(({ x, z }) => ({ x: (x - (SIZE - 1) / 2) * GAP, z: (z - (SIZE - 1) / 2) * GAP }));
/** A round wooden board with thirty-three hollows in a cross, and glass marbles in them. */
export const pegBoard = (): BoardSpec => ({
  points,
  half: 3.5,
  centreZ: 0,
  theme: "wood",
  radius: 0.3,
  marbles: true,
  colors: ["#2b6fb3", "#f1ead9"],
  subject: { half: 3.7, halfZ: 3.7, height: 0.7, lookY: 0, tilt: (58 * Math.PI) / 180 },
  paint(ctx, px, unit) {
    // A groove round the cross, and a hollow for every marble.
    ctx.save();
    ctx.strokeStyle = "rgba(40, 24, 12, 0.35)";
    ctx.lineWidth = unit * 0.05;
    ctx.beginPath();
    ctx.arc(...px(0, 0), unit * 3.25, 0, Math.PI * 2);
    ctx.stroke();
    for (const p of points) {
      const [cx, cy] = px(p.x, p.z),
        shade = ctx.createRadialGradient(cx, cy - unit * 0.05, unit * 0.04, cx, cy, unit * 0.27);
      shade.addColorStop(0, "rgba(30, 18, 8, 0.75)");
      shade.addColorStop(1, "rgba(30, 18, 8, 0.25)");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(cx, cy, unit * 0.27, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
});
