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
        r = unit * 0.28,
        // Darkest under the far lip, where the light does not reach, and paler toward the near side.
        shade = ctx.createRadialGradient(cx, cy - r * 0.38, r * 0.08, cx, cy, r);
      shade.addColorStop(0, "rgba(22, 12, 5, 0.92)");
      shade.addColorStop(0.6, "rgba(30, 18, 8, 0.66)");
      shade.addColorStop(1, "rgba(30, 18, 8, 0.38)");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // The lip: a dark edge on the far side and a line of light on the near one.
      ctx.lineWidth = unit * 0.022;
      ctx.strokeStyle = "rgba(18, 9, 3, 0.55)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 236, 200, 0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    }
    ctx.restore();
  },
});
