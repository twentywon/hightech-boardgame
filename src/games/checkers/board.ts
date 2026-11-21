import type { BoardSpec } from "../points/view";

const STEP = 0.86;
const points = Array.from({ length: 64 }, (_, s) => ({ x: ((s % 8) - 3.5) * STEP, z: (Math.floor(s / 8) - 3.5) * STEP }));
/** An 8×8 chequered board on a wooden table. */
export const checkersBoard = (): BoardSpec => ({
  points,
  half: 3.7,
  centreZ: 0,
  theme: "wood",
  radius: 0.34,
  colors: ["#a3271c", "#f3ecdc"],
  subject: { half: 3.85, halfZ: 3.85, height: 0.6, lookY: 0, tilt: (55 * Math.PI) / 180 },
  paint(ctx, px, unit) {
    points.forEach((p, s) => {
      const [x, y] = px(p.x, p.z);
      ctx.fillStyle = (Math.floor(s / 8) + (s % 8)) % 2 ? "#5b3b24" : "#e8d3a8";
      ctx.fillRect(x - (STEP * unit) / 2, y - (STEP * unit) / 2, STEP * unit + 1, STEP * unit + 1);
    });
    ctx.strokeStyle = "#2c2118";
    ctx.lineWidth = unit * 0.06;
    const [x0, y0] = px(-4 * STEP, -4 * STEP);
    ctx.strokeRect(x0, y0, 8 * STEP * unit, 8 * STEP * unit);
  },
});
