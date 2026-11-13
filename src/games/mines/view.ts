import { FlatView } from "../flat/view";
import { near, type State } from "./rules";

export const MINE_COLORS: [string, string] = ["#5fa84a", "#b9b3a4"];
/** The inks of the numbers one to eight. */
const INK = ["", "#2463c9", "#2c8a3a", "#d0352b", "#5a2fa0", "#a35312", "#1f8f95", "#30343a", "#7a7f88"];
/**
 * The field drawn flat: turf where nothing has been opened, bare earth
 * with a number where it has, small red flags, and the mines when the game
 * is over.
 */
export class MinesView extends FlatView<State> {
  private box = { x: 0, y: 0, cell: 1 };
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    this.begin();
  }
  protected changed(before: State | null, state: State) {
    if (before && state.last !== null && state.ply === before.ply + 1) this.onContact();
  }
  protected released(x: number, y: number) {
    const s = this.state;
    if (!s) return;
    const c = Math.floor((x - this.box.x) / this.box.cell),
      r = Math.floor((y - this.box.y) / this.box.cell);
    if (c >= 0 && c < s.cols && r >= 0 && r < s.rows) this.onPick(r * s.cols + c);
  }
  protected paint(pen: CanvasRenderingContext2D, w: number, h: number) {
    const s = this.state;
    pen.fillStyle = "#e9dfc8";
    pen.fillRect(0, 0, w, h);
    if (!s) return;
    const top = 56 * this.ratio,
      foot = 30 * this.ratio,
      // Room is left at either side for the flag button in the lower right corner, and below for the table's small print.
      cell = Math.floor(Math.min((w - 236 * this.ratio) / s.cols, (h - top - foot) / s.rows)),
      x0 = Math.round((w - cell * s.cols) / 2),
      y0 = Math.round(top + (h - top - foot - cell * s.rows) / 2),
      over = s.winner !== null,
      edge = Math.max(2, cell * 0.08);
    this.box = { x: x0, y: y0, cell };
    pen.fillStyle = "#6b4a2c";
    pen.fillRect(x0 - edge * 1.6, y0 - edge * 1.6, cell * s.cols + edge * 3.2, cell * s.rows + edge * 3.2);
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    for (let i = 0; i < s.open.length; i++) {
      const c = i % s.cols,
        r = Math.floor(i / s.cols),
        x = x0 + c * cell,
        y = y0 + r * cell,
        odd = (r + c) % 2,
        mined = !!s.mine?.[i];
      if (s.open[i] || (over && mined && s.winner === 1 && !s.flag[i])) {
        pen.fillStyle = i === s.boom ? "#e2483d" : odd ? "#e9d9b4" : "#f1e3c2";
        pen.fillRect(x, y, cell, cell);
        pen.strokeStyle = "rgba(120,96,60,0.25)";
        pen.lineWidth = 1;
        pen.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
        if (mined) this.mine(pen, x + cell / 2, y + cell / 2, cell);
        else {
          const count = near(s, i);
          if (count) {
            pen.fillStyle = INK[count];
            pen.font = `900 ${cell * 0.62}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
            pen.fillText(String(count), x + cell / 2, y + cell / 2 + cell * 0.04);
          }
        }
        continue;
      }
      pen.fillStyle = odd ? "#63ad4c" : "#70ba56";
      pen.fillRect(x, y, cell, cell);
      pen.fillStyle = "rgba(255,255,255,0.28)";
      pen.fillRect(x, y, cell, edge);
      pen.fillRect(x, y, edge, cell);
      pen.fillStyle = "rgba(20,60,20,0.3)";
      pen.fillRect(x, y + cell - edge, cell, edge);
      pen.fillRect(x + cell - edge, y, edge, cell);
      if (s.flag[i] || (over && mined && s.winner === 0)) {
        pen.fillStyle = "#3a2c22";
        pen.fillRect(x + cell * 0.46, y + cell * 0.2, cell * 0.07, cell * 0.6);
        pen.fillRect(x + cell * 0.3, y + cell * 0.76, cell * 0.4, cell * 0.07);
        pen.fillStyle = "#e2362c";
        pen.beginPath();
        pen.moveTo(x + cell * 0.5, y + cell * 0.18);
        pen.lineTo(x + cell * 0.82, y + cell * 0.33);
        pen.lineTo(x + cell * 0.5, y + cell * 0.5);
        pen.closePath();
        pen.fill();
        // A flag that stood on clear ground is struck through once the field is shown.
        if (over && s.winner === 1 && !mined) {
          pen.strokeStyle = "#1f2933";
          pen.lineWidth = cell * 0.09;
          pen.beginPath();
          pen.moveTo(x + cell * 0.2, y + cell * 0.2);
          pen.lineTo(x + cell * 0.8, y + cell * 0.8);
          pen.moveTo(x + cell * 0.8, y + cell * 0.2);
          pen.lineTo(x + cell * 0.2, y + cell * 0.8);
          pen.stroke();
        }
      }
    }
    const cursor = this.marks.cursor;
    if (cursor !== null && cursor >= 0 && cursor < s.open.length) {
      pen.strokeStyle = "#2f6fff";
      pen.lineWidth = Math.max(3, cell * 0.1);
      pen.strokeRect(x0 + (cursor % s.cols) * cell + 2, y0 + Math.floor(cursor / s.cols) * cell + 2, cell - 4, cell - 4);
    }
  }
  private mine(pen: CanvasRenderingContext2D, x: number, y: number, cell: number) {
    pen.strokeStyle = pen.fillStyle = "#22262c";
    pen.lineWidth = cell * 0.08;
    pen.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      pen.beginPath();
      pen.moveTo(x - Math.cos(a) * cell * 0.34, y - Math.sin(a) * cell * 0.34);
      pen.lineTo(x + Math.cos(a) * cell * 0.34, y + Math.sin(a) * cell * 0.34);
      pen.stroke();
    }
    pen.beginPath();
    pen.arc(x, y, cell * 0.23, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#ffffff";
    pen.beginPath();
    pen.arc(x - cell * 0.08, y - cell * 0.08, cell * 0.05, 0, Math.PI * 2);
    pen.fill();
  }
}
