import type { BoardSpec } from "../points/view";
import { CELLS, blockedIn } from "./rules";

const SIZE = 0.56,
  ROOT3 = Math.sqrt(3);
const points = CELLS.map(([q, r]) => ({ x: SIZE * 1.5 * q, z: SIZE * ROOT3 * (r + q / 2) }));
/** The hexagon of cells as tiles on a dark bench. */
export const hexaBoard = (variant: string): BoardSpec => ({
  points,
  half: 4.6,
  centreZ: 0,
  theme: "lab",
  space: true,
  radius: 0.34,
  colors: ["#3f8cff", "#ff5a4a"],
  subject: { half: 4.3, halfZ: 4.5, height: 1.6, lookY: 0, tilt: 1.02 },
  paint(ctx, px, unit) {
    const blocked = blockedIn(variant);
    for (const [i, p] of points.entries()) {
      if (blocked[i]) continue;
      const [cx, cy] = px(p.x, p.z);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.lineTo(cx + Math.cos(a) * SIZE * 0.94 * unit, cy + Math.sin(a) * SIZE * 0.94 * unit);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(210, 232, 226, 0.92)";
      ctx.fill();
      ctx.lineWidth = unit * 0.035;
      ctx.strokeStyle = "rgba(64, 132, 120, 0.9)";
      ctx.stroke();
    }
  },
});
