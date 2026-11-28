/**
 * Simplified national flags, drawn rather than loaded, for the city spaces.
 * They keep each flag's colours and layout; fine emblems are reduced to
 * plain shapes.
 */
type Ctx = CanvasRenderingContext2D;
const bands = (ctx: Ctx, x: number, y: number, w: number, h: number, colors: string[], across = false) =>
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    if (across) ctx.fillRect(x + (i * w) / colors.length, y, w / colors.length + 0.5, h);
    else ctx.fillRect(x, y + (i * h) / colors.length, w, h / colors.length + 0.5);
  });
const disc = (ctx: Ctx, x: number, y: number, r: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};
const star = (ctx: Ctx, x: number, y: number, r: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      d = i % 2 ? r * 0.4 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.fill();
};
const cross = (ctx: Ctx, x: number, y: number, w: number, h: number, cx: number, t: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x + cx - t / 2, y, t, h);
  ctx.fillRect(x, y + h / 2 - t / 2, w, t);
};
const FLAGS: Record<string, (ctx: Ctx, x: number, y: number, w: number, h: number) => void> = {
  VN: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#da251d"]), star(c, x + w / 2, y + h / 2, h * 0.32, "#ffcd00")),
  TH: (c, x, y, w, h) => bands(c, x, y, w, h, ["#a51931", "#f4f5f8", "#2d2a4a", "#2d2a4a", "#f4f5f8", "#a51931"]),
  ID: (c, x, y, w, h) => bands(c, x, y, w, h, ["#ce1126", "#ffffff"]),
  IN: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#ff9933", "#ffffff", "#138808"]), disc(c, x + w / 2, y + h / 2, h * 0.13, "#000080")),
  AE: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#00732f", "#ffffff", "#000000"]), bands(c, x, y, w * 0.27, h, ["#ff0000"])),
  TR: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#e30a17"]);
    disc(c, x + w * 0.38, y + h / 2, h * 0.27, "#ffffff");
    disc(c, x + w * 0.44, y + h / 2, h * 0.21, "#e30a17");
    star(c, x + w * 0.6, y + h / 2, h * 0.13, "#ffffff");
  },
  EG: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#ce1126", "#ffffff", "#000000"]), disc(c, x + w / 2, y + h / 2, h * 0.1, "#c09300")),
  KE: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#000000", "#000000", "#000000", "#ffffff", "#bb0000", "#bb0000", "#bb0000", "#ffffff", "#006600", "#006600", "#006600"]);
    c.fillStyle = "#bb0000";
    c.beginPath();
    c.ellipse(x + w / 2, y + h / 2, w * 0.09, h * 0.32, 0, 0, Math.PI * 2);
    c.fill();
  },
  ZA: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#e03c31", "#ffffff", "#007749", "#ffffff", "#001489"]);
    c.fillStyle = "#007749";
    c.fillRect(x, y + h * 0.36, w, h * 0.28);
    c.fillStyle = "#ffb81c";
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w * 0.42, y + h / 2);
    c.lineTo(x, y + h);
    c.fill();
    c.fillStyle = "#000000";
    c.beginPath();
    c.moveTo(x, y + h * 0.14);
    c.lineTo(x + w * 0.3, y + h / 2);
    c.lineTo(x, y + h * 0.86);
    c.fill();
  },
  GR: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#0d5eaf", "#ffffff", "#0d5eaf", "#ffffff", "#0d5eaf", "#ffffff", "#0d5eaf", "#ffffff", "#0d5eaf"]);
    c.fillStyle = "#0d5eaf";
    c.fillRect(x, y, w * 0.37, (h * 5) / 9);
    cross(c, x, y, w * 0.37, (h * 5) / 9, w * 0.185, h / 9, "#ffffff");
  },
  IT: (c, x, y, w, h) => bands(c, x, y, w, h, ["#009246", "#ffffff", "#ce2b37"], true),
  ES: (c, x, y, w, h) => bands(c, x, y, w, h, ["#aa151b", "#f1bf00", "#f1bf00", "#aa151b"]),
  FR: (c, x, y, w, h) => bands(c, x, y, w, h, ["#0055a4", "#ffffff", "#ef4135"], true),
  GB: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#012169"]);
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    for (const [color, t] of [["#ffffff", h * 0.2], ["#c8102e", h * 0.08]] as const) {
      c.strokeStyle = color;
      c.lineWidth = t;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + w, y + h);
      c.moveTo(x + w, y);
      c.lineTo(x, y + h);
      c.stroke();
    }
    c.restore();
    cross(c, x, y, w, h, w / 2, h * 0.3, "#ffffff");
    cross(c, x, y, w, h, w / 2, h * 0.18, "#c8102e");
  },
  DE: (c, x, y, w, h) => bands(c, x, y, w, h, ["#000000", "#dd0000", "#ffce00"]),
  SE: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#006aa7"]), cross(c, x, y, w, h, w * 0.36, h * 0.2, "#fecc00")),
  MX: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#006847", "#ffffff", "#ce1126"], true), disc(c, x + w / 2, y + h / 2, h * 0.14, "#8a5a2b")),
  CA: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#ff0000", "#ffffff", "#ffffff", "#ff0000"], true), star(c, x + w / 2, y + h / 2, h * 0.3, "#ff0000")),
  US: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#b22234", "#ffffff", "#b22234", "#ffffff", "#b22234", "#ffffff", "#b22234"]);
    c.fillStyle = "#3c3b6e";
    c.fillRect(x, y, w * 0.42, (h * 4) / 7);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) disc(c, x + w * (0.06 + k * 0.1), y + h * (0.1 + r * 0.17), h * 0.035, "#ffffff");
  },
  BR: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#009b3a"]);
    c.fillStyle = "#fedf00";
    c.beginPath();
    c.moveTo(x + w * 0.1, y + h / 2);
    c.lineTo(x + w / 2, y + h * 0.12);
    c.lineTo(x + w * 0.9, y + h / 2);
    c.lineTo(x + w / 2, y + h * 0.88);
    c.fill();
    disc(c, x + w / 2, y + h / 2, h * 0.22, "#002776");
  },
  AR: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#74acdf", "#ffffff", "#74acdf"]), disc(c, x + w / 2, y + h / 2, h * 0.11, "#f6b40e")),
  AU: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#012169"]);
    cross(c, x, y, w * 0.45, h * 0.5, w * 0.225, h * 0.12, "#ffffff");
    cross(c, x, y, w * 0.45, h * 0.5, w * 0.225, h * 0.06, "#c8102e");
    star(c, x + w * 0.24, y + h * 0.77, h * 0.12, "#ffffff");
    for (const [sx, sy] of [[0.74, 0.2], [0.86, 0.44], [0.74, 0.8], [0.62, 0.5]]) star(c, x + w * sx, y + h * sy, h * 0.07, "#ffffff");
  },
  SG: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#ed2939", "#ffffff"]);
    disc(c, x + w * 0.22, y + h * 0.25, h * 0.17, "#ffffff");
    disc(c, x + w * 0.27, y + h * 0.25, h * 0.15, "#ed2939");
    for (const [sx, sy] of [[0.36, 0.14], [0.31, 0.3], [0.41, 0.3], [0.33, 0.22], [0.39, 0.22]]) star(c, x + w * sx, y + h * sy, h * 0.035, "#ffffff");
  },
  NL: (c, x, y, w, h) => bands(c, x, y, w, h, ["#ae1c28", "#ffffff", "#21468b"]),
  NG: (c, x, y, w, h) => bands(c, x, y, w, h, ["#008751", "#ffffff", "#008751"], true),
  AT: (c, x, y, w, h) => bands(c, x, y, w, h, ["#ed2939", "#ffffff", "#ed2939"]),
  PL: (c, x, y, w, h) => bands(c, x, y, w, h, ["#ffffff", "#dc143c"]),
  PE: (c, x, y, w, h) => bands(c, x, y, w, h, ["#d91023", "#ffffff", "#d91023"], true),
  JP: (c, x, y, w, h) => (bands(c, x, y, w, h, ["#ffffff"]), disc(c, x + w / 2, y + h / 2, h * 0.3, "#bc002d")),
  KR: (c, x, y, w, h) => {
    bands(c, x, y, w, h, ["#ffffff"]);
    const cx = x + w / 2,
      cy = y + h / 2,
      r = h * 0.25;
    c.fillStyle = "#cd2e3a";
    c.beginPath();
    c.arc(cx, cy, r, Math.PI, 0);
    c.fill();
    c.fillStyle = "#0047a0";
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI);
    c.fill();
    disc(c, cx - r / 2, cy, r / 2, "#cd2e3a");
    disc(c, cx + r / 2, cy, r / 2, "#0047a0");
    // The four trigrams, as three bars each.
    c.fillStyle = "#000000";
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      c.save();
      c.translate(cx + sx * w * 0.33, cy + sy * h * 0.27);
      c.rotate(Math.atan2(sy * h, sx * w) + Math.PI / 2);
      for (let i = -1; i <= 1; i++) c.fillRect(-w * 0.07, i * h * 0.075 - h * 0.022, w * 0.14, h * 0.044);
      c.restore();
    }
  },
};
/** Paints the flag of `country` in the rectangle, with a thin outline. */
export function drawFlag(ctx: Ctx, country: string, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  (FLAGS[country] ?? ((c) => bands(c, x, y, w, h, ["#cccccc"])))(ctx, x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}
