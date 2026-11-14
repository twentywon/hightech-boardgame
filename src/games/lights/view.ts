import { FlatView, rounded } from "../flat/view";
import type { State } from "./rules";

export const LIGHT_COLORS: [string, string] = ["#ffc94a", "#b9b3a4"];
/**
 * The lamp panel drawn flat: a dark board of rounded squares, amber and
 * glowing where a lamp is lit. A press makes the lamp shrink for a moment.
 */
export class LightsView extends FlatView<State> {
  /** Where the board is on the canvas: left, top and the side of a square. */
  private box = { x: 0, y: 0, cell: 1 };
  private dip: { cell: number; until: number } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    this.begin();
  }
  protected frame(now: number) {
    if (!this.dip) return false;
    if (now >= this.dip.until) this.dip = null;
    return true;
  }
  protected changed(before: State | null, state: State) {
    if (before && state.last !== null && state.ply === before.ply + 1) {
      this.dip = { cell: state.last, until: performance.now() + 160 };
      this.onContact();
    }
  }
  protected released(x: number, y: number) {
    const s = this.state;
    if (!s) return;
    const c = Math.floor((x - this.box.x) / this.box.cell),
      r = Math.floor((y - this.box.y) / this.box.cell);
    if (c >= 0 && c < s.size && r >= 0 && r < s.size) this.onPick(r * s.size + c);
  }
  protected paint(pen: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const s = this.state;
    pen.fillStyle = "#14171c";
    pen.fillRect(0, 0, w, h);
    if (!s) return;
    // The status line stands over the top of the table: the board keeps clear of it.
    const top = 56 * this.ratio,
      foot = 30 * this.ratio,
      side = Math.min(w * 0.94, h - top - foot) * 0.96,
      cell = side / s.size,
      x0 = (w - side) / 2,
      y0 = top + (h - top - foot - side) / 2;
    this.box = { x: x0, y: y0, cell };
    rounded(pen, x0 - cell * 0.12, y0 - cell * 0.12, side + cell * 0.24, side + cell * 0.24, cell * 0.2);
    pen.fillStyle = "#22262e";
    pen.fill();
    pen.strokeStyle = "#3a4250";
    pen.lineWidth = 2 * this.ratio;
    pen.stroke();
    const at = (i: number) => ({ x: x0 + (i % s.size) * cell, y: y0 + Math.floor(i / s.size) * cell });
    // The light thrown round each lit lamp, under the lamps themselves.
    s.on.forEach((lit, i) => {
      if (!lit) return;
      const { x, y } = at(i),
        glow = pen.createRadialGradient(x + cell / 2, y + cell / 2, cell * 0.2, x + cell / 2, y + cell / 2, cell * 0.78);
      glow.addColorStop(0, "rgba(255,190,70,0.42)");
      glow.addColorStop(1, "rgba(255,190,70,0)");
      pen.fillStyle = glow;
      pen.fillRect(x - cell * 0.3, y - cell * 0.3, cell * 1.6, cell * 1.6);
    });
    s.on.forEach((lit, i) => {
      const { x, y } = at(i),
        press = this.dip?.cell === i ? 1 - 0.1 * Math.sin((1 - (this.dip.until - now) / 160) * Math.PI) : 1;
      // The socket each bulb sits in: a shallow square of the panel.
      rounded(pen, x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.16);
      pen.fillStyle = lit ? "#3a3626" : "#1b1f26";
      pen.fill();
      pen.strokeStyle = "rgba(255,255,255,0.07)";
      pen.lineWidth = 1.5 * this.ratio;
      pen.stroke();
      this.bulb(pen, x + cell / 2, y + cell / 2, cell * 0.8 * press, lit);
    });
    const ring = (cell_: number | null | undefined, color: string, width: number) => {
      if (cell_ === null || cell_ === undefined || cell_ < 0 || cell_ >= s.on.length) return;
      const { x, y } = at(cell_);
      rounded(pen, x + cell * 0.04, y + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.2);
      pen.strokeStyle = color;
      pen.lineWidth = width * this.ratio;
      pen.stroke();
    };
    ring(this.marks.hint?.to, "#ff4f38", 5);
    ring(this.marks.cursor, "#6fb0ff", 3.5);
  }
  /** A light bulb standing on its cap, `size` tall, lit or dark. */
  private bulb(pen: CanvasRenderingContext2D, cx: number, cy: number, size: number, lit: boolean) {
    const r = size * 0.33,
      gy = cy - size * 0.13,
      neck = size * 0.15,
      capTop = gy + r * 0.86,
      capTall = size * 0.2,
      glass = pen.createRadialGradient(cx - r * 0.3, gy - r * 0.35, r * 0.05, cx, gy, r * 1.05);
    if (lit) {
      glass.addColorStop(0, "#fffbe6");
      glass.addColorStop(0.45, "#ffe27a");
      glass.addColorStop(1, "#ffa726");
    } else {
      glass.addColorStop(0, "#8a94a6");
      glass.addColorStop(0.5, "#596274");
      glass.addColorStop(1, "#3a4252");
    }
    // The glass: a ball drawn down into a neck.
    pen.beginPath();
    pen.arc(cx, gy, r, Math.PI * 0.72, Math.PI * 0.28, false);
    pen.quadraticCurveTo(cx + neck * 1.25, capTop - size * 0.02, cx + neck, capTop + size * 0.02);
    pen.lineTo(cx - neck, capTop + size * 0.02);
    pen.quadraticCurveTo(cx - neck * 1.25, capTop - size * 0.02, cx + Math.cos(Math.PI * 0.72) * r, gy + Math.sin(Math.PI * 0.72) * r);
    pen.closePath();
    pen.fillStyle = glass;
    pen.fill();
    pen.strokeStyle = lit ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.16)";
    pen.lineWidth = 1.5 * this.ratio;
    pen.stroke();
    // The filament: two posts and a coil between them.
    pen.strokeStyle = lit ? "#fffef2" : "#252b36";
    pen.lineWidth = Math.max(1, size * 0.022);
    pen.lineCap = "round";
    pen.beginPath();
    pen.moveTo(cx - neck * 0.55, capTop);
    pen.lineTo(cx - r * 0.34, gy + r * 0.05);
    for (let k = 1; k <= 6; k++) pen.lineTo(cx - r * 0.34 + (r * 0.68 * k) / 6, gy + r * 0.05 + (k % 2 ? -r * 0.16 : 0));
    pen.lineTo(cx + neck * 0.55, capTop);
    pen.stroke();
    // A glint on the glass.
    pen.beginPath();
    pen.ellipse(cx - r * 0.42, gy - r * 0.42, r * 0.2, r * 0.1, -0.8, 0, Math.PI * 2);
    pen.fillStyle = lit ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)";
    pen.fill();
    // The screw cap and its contact.
    const metal = pen.createLinearGradient(cx - neck, 0, cx + neck, 0);
    metal.addColorStop(0, "#6f7682");
    metal.addColorStop(0.45, "#d9dee6");
    metal.addColorStop(1, "#5d6470");
    rounded(pen, cx - neck, capTop + size * 0.015, neck * 2, capTall, size * 0.03);
    pen.fillStyle = metal;
    pen.fill();
    pen.strokeStyle = "rgba(20,24,30,0.55)";
    pen.lineWidth = Math.max(1, size * 0.016);
    for (let k = 1; k <= 3; k++) {
      const y = capTop + size * 0.015 + (capTall * k) / 4;
      pen.beginPath();
      pen.moveTo(cx - neck, y + size * 0.012);
      pen.lineTo(cx + neck, y - size * 0.012);
      pen.stroke();
    }
    pen.beginPath();
    pen.ellipse(cx, capTop + size * 0.015 + capTall + size * 0.012, neck * 0.42, size * 0.028, 0, 0, Math.PI * 2);
    pen.fillStyle = "#2a2f38";
    pen.fill();
  }
}
