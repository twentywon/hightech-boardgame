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
        inset = cell * (0.08 + (this.dip?.cell === i ? 0.05 * Math.sin((1 - (this.dip.until - now) / 160) * Math.PI) : 0)),
        size = cell - inset * 2,
        face = pen.createLinearGradient(0, y, 0, y + cell);
      if (lit) {
        face.addColorStop(0, "#ffe07a");
        face.addColorStop(1, "#ffb22e");
      } else {
        face.addColorStop(0, "#3d4656");
        face.addColorStop(1, "#2c3340");
      }
      rounded(pen, x + inset, y + inset, size, size, size * 0.18);
      pen.fillStyle = face;
      pen.fill();
      // A lit edge above and a shaded one below make it a button.
      pen.strokeStyle = lit ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.1)";
      pen.lineWidth = 1.5 * this.ratio;
      pen.stroke();
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
}
