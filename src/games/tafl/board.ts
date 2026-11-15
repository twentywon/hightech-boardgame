import type { BoardSpec } from "../points/view";
import { CORNERS, N, THRONE } from "./rules";

const STEP = 0.62;
const points = Array.from({ length: N * N }, (_, s) => ({ x: ((s % N) - 5) * STEP, z: (Math.floor(s / N) - 5) * STEP }));
export const RAIDER = "#2a2522",
  DEFENDER = "#efe4c8";
/** A board of 11 × 11 squares burnt into pale wood, the throne and the four corners marked with a knot. */
export const taflBoard = (variant: string): BoardSpec => ({
  points,
  half: 3.75,
  centreZ: 0,
  theme: "wood",
  radius: 0.25,
  colors: variant === "attackers" ? [RAIDER, DEFENDER] : [DEFENDER, RAIDER],
  subject: { half: 3.85, halfZ: 3.85, height: 0.7, lookY: 0, tilt: (58 * Math.PI) / 180 },
  paint(ctx, px, unit) {
    const size = STEP * unit;
    points.forEach((p, s) => {
      const [x, y] = px(p.x, p.z),
        marked = s === THRONE || CORNERS.includes(s);
      ctx.fillStyle = marked ? "#6e3b1e" : (Math.floor(s / N) + (s % N)) % 2 ? "#d8b47a" : "#e4c58e";
      ctx.fillRect(x - size / 2, y - size / 2, size + 1, size + 1);
      if (marked) {
        // A knot of interlaced lines, as on old boards.
        ctx.strokeStyle = "#f2d9a6";
        ctx.lineWidth = unit * 0.035;
        ctx.beginPath();
        ctx.moveTo(x - size * 0.32, y - size * 0.32);
        ctx.lineTo(x + size * 0.32, y + size * 0.32);
        ctx.moveTo(x + size * 0.32, y - size * 0.32);
        ctx.lineTo(x - size * 0.32, y + size * 0.32);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.strokeStyle = "#5a3a20";
    ctx.lineWidth = unit * 0.02;
    for (let i = 0; i <= N; i++) {
      const a = (i - 5.5) * STEP;
      ctx.beginPath();
      ctx.moveTo(...px(a, -5.5 * STEP));
      ctx.lineTo(...px(a, 5.5 * STEP));
      ctx.moveTo(...px(-5.5 * STEP, a));
      ctx.lineTo(...px(5.5 * STEP, a));
      ctx.stroke();
    }
    ctx.lineWidth = unit * 0.06;
    const [x0, y0] = px(-5.5 * STEP, -5.5 * STEP);
    ctx.strokeRect(x0, y0, N * size, N * size);
  },
});
