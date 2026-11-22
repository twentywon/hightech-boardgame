import type { BoardSpec } from "../points/view";
import { CELLS, blockedIn } from "./rules";

/** From the middle of a cell to a corner of it. */
export const CELL = 0.56;
const ROOT3 = Math.sqrt(3);
const points = CELLS.map(([q, r]) => ({ x: CELL * 1.5 * q, z: CELL * ROOT3 * (r + q / 2) }));
/** A hexagon of `r` round (x, y) on a canvas, a corner at angle `start`. */
function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, start: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = start + (Math.PI / 3) * i;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}
/**
 * The hexagon of cells. The table is `HexaView` (a culture dish floating in space); the points, the camera's
 * subject and the colours here are what it and the browser test aim by, and `paint` draws the same dish small for
 * the map pictures of the setup window: a metal rim, the glass wall, the gel with its wells, and crystal plugs on
 * the walled-off cells.
 */
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
    const blocked = blockedIn(variant),
      [mx, my] = px(0, 0);
    // A few stars on the dark ground round the dish.
    let seed = 5;
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 26; i++) {
      const [x, y] = px((next() - 0.5) * 9.2, (next() - 0.5) * 9.2);
      ctx.fillStyle = `rgba(230,236,255,${0.35 + next() * 0.5})`;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    // The metal base and its rim, the glass wall, then the gel.
    const metal = ctx.createLinearGradient(mx - 4.9 * unit, my - 4.9 * unit, mx + 4.9 * unit, my + 4.9 * unit);
    metal.addColorStop(0, "#e4ebf0");
    metal.addColorStop(0.5, "#8e9ba6");
    metal.addColorStop(1, "#c3ccd4");
    hexPath(ctx, mx, my, 4.95 * unit, Math.PI / 2);
    ctx.fillStyle = metal;
    ctx.fill();
    hexPath(ctx, mx, my, 4.72 * unit, Math.PI / 2);
    ctx.fillStyle = "#9fdcf2";
    ctx.fill();
    hexPath(ctx, mx, my, 4.6 * unit, Math.PI / 2);
    ctx.fillStyle = "#a9c9c3";
    ctx.fill();
    for (const [i, p] of points.entries()) {
      const [cx, cy] = px(p.x, p.z),
        r = CELL * 0.86 * unit;
      hexPath(ctx, cx, cy, r, 0);
      if (blocked[i]) {
        // A crystal: violet, with its facets drawn from the middle.
        const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        g.addColorStop(0, "#e2d6ff");
        g.addColorStop(1, "#6a48d8");
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = Math.max(0.6, unit * 0.03);
        ctx.beginPath();
        for (let k = 0; k < 6; k += 2) {
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos((Math.PI / 3) * k) * r, cy + Math.sin((Math.PI / 3) * k) * r);
        }
        ctx.stroke();
        hexPath(ctx, cx, cy, r, 0);
        ctx.strokeStyle = "#4b5560";
        ctx.lineWidth = Math.max(1, unit * 0.06);
        ctx.stroke();
        continue;
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "#f2fbf6");
      g.addColorStop(1, "#b2d1ca");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, unit * 0.05);
      ctx.strokeStyle = "rgba(120, 150, 160, 0.9)";
      ctx.stroke();
    }
  },
});
