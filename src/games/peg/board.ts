import type { BoardSpec } from "../points/view";
import { HOLES, SIZE } from "./rules";

const GAP = 0.86,
  points = HOLES.map(({ x, z }) => ({ x: (x - (SIZE - 1) / 2) * GAP, z: (z - (SIZE - 1) / 2) * GAP }));
const COBALT = "#1d3f93",
  WASH = "#7f9bd6";
/**
 * The skin of a marble: white porcelain painted in cobalt, as on old blue
 * and white ware. From the top down: a dot, a ring of lotus petals, a band
 * of scrolling vine, a key fret. Seen from above the petals make a flower.
 */
function porcelain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const glaze = ctx.createLinearGradient(0, 0, 0, h);
  glaze.addColorStop(0, "#fbfaf4");
  glaze.addColorStop(1, "#e9edf0");
  ctx.fillStyle = glaze;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ctx.fillStyle = COBALT;
  ctx.lineCap = ctx.lineJoin = "round";
  const line = (y: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  };
  // The dot on top, and the ring round it.
  ctx.fillRect(0, 0, w, h * 0.05);
  line(h * 0.085, h * 0.012);
  // Eight lotus petals, each washed pale with a darker rib.
  const petals = 8,
    pw = w / petals;
  for (let i = 0; i < petals; i++) {
    const x = i * pw,
      top = h * 0.11,
      bottom = h * 0.33;
    ctx.beginPath();
    ctx.moveTo(x + pw * 0.08, top);
    ctx.bezierCurveTo(x + pw * 0.02, bottom * 0.75, x + pw * 0.3, bottom * 0.95, x + pw * 0.5, bottom);
    ctx.bezierCurveTo(x + pw * 0.7, bottom * 0.95, x + pw * 0.98, bottom * 0.75, x + pw * 0.92, top);
    ctx.closePath();
    ctx.fillStyle = WASH;
    ctx.fill();
    ctx.lineWidth = h * 0.014;
    ctx.stroke();
    ctx.lineWidth = h * 0.01;
    ctx.beginPath();
    ctx.moveTo(x + pw * 0.5, top + h * 0.02);
    ctx.lineTo(x + pw * 0.5, bottom - h * 0.05);
    ctx.stroke();
  }
  line(h * 0.365, h * 0.016);
  line(h * 0.395, h * 0.008);
  // A vine that rises and falls round the middle, with a curl in every bend.
  const waves = 6,
    ww = w / waves,
    mid = h * 0.5,
    swing = h * 0.055;
  ctx.lineWidth = h * 0.016;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const y = mid + Math.sin((x / ww) * Math.PI * 2) * swing;
    if (x) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < waves * 2; i++) {
    const up = i % 2 === 0,
      cx = (i + 0.5) * (ww / 2),
      cy = mid + (up ? -1 : 1) * swing * 0.1;
    // A curl: a spiral wound one and a half times, opening toward the stem.
    ctx.lineWidth = h * 0.012;
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.04) {
      const angle = (up ? 1 : -1) * (Math.PI * 0.5 + t * Math.PI * 3),
        r = (1 - t) * h * 0.05,
        px = cx + Math.cos(angle) * r * 1.5,
        py = cy + (up ? 1 : -1) * swing * 0.9 - Math.sin(angle) * r * (up ? 1 : -1) * 0.9;
      if (t) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = COBALT;
    ctx.beginPath();
    ctx.arc(cx, cy + (up ? 1 : -1) * swing * 0.9, h * 0.011, 0, Math.PI * 2);
    ctx.fill();
  }
  line(h * 0.605, h * 0.008);
  line(h * 0.635, h * 0.016);
  // A key fret below, and the foot in solid blue.
  const keys = 16,
    kw = w / keys,
    ky = h * 0.67,
    kh = h * 0.1;
  ctx.lineWidth = h * 0.012;
  for (let i = 0; i < keys; i++) {
    const x = i * kw;
    ctx.beginPath();
    ctx.moveTo(x, ky + kh);
    ctx.lineTo(x, ky);
    ctx.lineTo(x + kw * 0.78, ky);
    ctx.lineTo(x + kw * 0.78, ky + kh * 0.72);
    ctx.lineTo(x + kw * 0.3, ky + kh * 0.72);
    ctx.lineTo(x + kw * 0.3, ky + kh * 0.36);
    ctx.lineTo(x + kw * 0.54, ky + kh * 0.36);
    ctx.stroke();
  }
  line(h * 0.8, h * 0.016);
  ctx.fillStyle = COBALT;
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
}
/** A round wooden board with thirty-three hollows in a cross, and porcelain marbles painted in blue in them. */
export const pegBoard = (): BoardSpec => ({
  points,
  half: 3.5,
  centreZ: 0,
  theme: "wood",
  radius: 0.3,
  marbles: true,
  marblePaint: porcelain,
  colors: ["#1d3f93", "#f1ead9"],
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
