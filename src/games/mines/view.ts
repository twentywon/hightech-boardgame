import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { near, type State } from "./rules";

export const MINE_COLORS: [string, string] = ["#5fa84a", "#b9b3a4"];
/** Pixels to a square on the painted field, and the inks of the numbers one to eight. */
const PX = 64,
  INK = ["", "#2463c9", "#2c8a3a", "#d0352b", "#5a2fa0", "#a35312", "#1f8f95", "#30343a", "#7a7f88"];
/** How large a square is on the table, for a field of this many rows and columns. */
const cellOf = (rows: number, cols: number) => Math.min(12.6 / cols, 8.4 / rows, 1.05);
/**
 * A field in a wooden tray on a desk: turf where nothing has been opened,
 * bare earth with a number where it has, small red flags, and the mines
 * when the game is over. The field is painted on one canvas, redrawn when
 * it changes.
 */
export class MinesView extends TableView<State> {
  private canvas = document.createElement("canvas");
  private texture: T.CanvasTexture;
  private field: T.Mesh;
  private tray: T.Mesh;
  private cursor: T.Mesh;
  private shape = "";
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#cdbf9f");
    this.daylight("#ffffff", "#8a7a5c", "#fff3d8", 9, 2.0);
    const desk = this.own(wood(false, 0.6));
    desk.repeat.set(3, 3);
    this.add(new T.BoxGeometry(44, 0.4, 32), this.standard({ map: desk, roughness: 0.8 }), 0, -0.36, 0).castShadow = false;
    this.texture = this.own(new T.CanvasTexture(this.canvas));
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.tray = this.add(new T.BoxGeometry(1, 0.3, 1), this.standard({ map: this.own(wood(true)), roughness: 0.5 }), 0, -0.05, 0);
    this.field = this.add(new T.PlaneGeometry(1, 1), this.own(new T.MeshStandardMaterial({ map: this.texture, roughness: 0.9 })), 0, 0.105, 0);
    this.field.rotation.x = -Math.PI / 2;
    this.field.castShadow = false;
    this.cursor = ringMesh(<R extends { dispose(): void }>(r: R) => this.own(r), 0.36, 0.48, "#2f6fff");
    this.scene.add(this.cursor);
    this.begin();
  }
  private cell() {
    return this.state ? cellOf(this.state.rows, this.state.cols) : 1;
  }
  private at(point: number) {
    const s = this.state!,
      size = this.cell();
    return { x: ((point % s.cols) - (s.cols - 1) / 2) * size, z: (Math.floor(point / s.cols) - (s.rows - 1) / 2) * size };
  }
  protected subject(aspect: number): TableSubject {
    const s = this.state,
      size = this.cell(),
      half = s ? (s.cols * size) / 2 + 0.5 : 5,
      halfZ = s ? (s.rows * size) / 2 + 0.5 : 4.5;
    return { half: aspect < 1 ? Math.min(half, 5.2) : half, halfZ, height: 0.3, lookY: 0, tilt: 1.42 };
  }
  protected spots(): Spot[] {
    const s = this.state;
    return s ? s.open.map((_, point) => ({ ...this.at(point), y: 0.1, r: this.cell() * 0.5, point })) : [];
  }
  /** Paints the field as the state has it. */
  private paint(s: State) {
    const pen = this.canvas.getContext("2d")!,
      over = s.winner !== null;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    for (let i = 0; i < s.open.length; i++) {
      const c = i % s.cols,
        r = Math.floor(i / s.cols),
        x = c * PX,
        y = r * PX,
        odd = (r + c) % 2,
        mined = !!s.mine?.[i];
      if (s.open[i] || (over && mined && s.winner === 1 && !s.flag[i])) {
        // Opened ground: earth, a number, or the mine that lay there.
        pen.fillStyle = i === s.boom ? "#e2483d" : odd ? "#e9d9b4" : "#f1e3c2";
        pen.fillRect(x, y, PX, PX);
        pen.strokeStyle = "rgba(120,96,60,0.28)";
        pen.lineWidth = 2;
        pen.strokeRect(x + 1, y + 1, PX - 2, PX - 2);
        if (mined) this.mine(pen, x + PX / 2, y + PX / 2);
        else {
          const count = near(s, i);
          if (count) {
            pen.fillStyle = INK[count];
            pen.font = `900 ${PX * 0.62}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
            pen.fillText(String(count), x + PX / 2, y + PX / 2 + 3);
          }
        }
        continue;
      }
      // Covered: a tile of turf with a lit edge above and a shaded one below.
      pen.fillStyle = odd ? "#63ad4c" : "#70ba56";
      pen.fillRect(x, y, PX, PX);
      pen.fillStyle = "rgba(255,255,255,0.28)";
      pen.fillRect(x, y, PX, 5);
      pen.fillRect(x, y, 5, PX);
      pen.fillStyle = "rgba(20,60,20,0.3)";
      pen.fillRect(x, y + PX - 5, PX, 5);
      pen.fillRect(x + PX - 5, y, 5, PX);
      if (s.flag[i] || (over && mined && s.winner === 0)) {
        pen.fillStyle = "#3a2c22";
        pen.fillRect(x + PX * 0.46, y + PX * 0.2, 5, PX * 0.6);
        pen.fillRect(x + PX * 0.3, y + PX * 0.76, PX * 0.4, 5);
        pen.fillStyle = "#e2362c";
        pen.beginPath();
        pen.moveTo(x + PX * 0.5, y + PX * 0.18);
        pen.lineTo(x + PX * 0.82, y + PX * 0.33);
        pen.lineTo(x + PX * 0.5, y + PX * 0.5);
        pen.closePath();
        pen.fill();
        // A flag that stood on clear ground is struck through once the field is shown.
        if (over && s.winner === 1 && !mined) {
          pen.strokeStyle = "#1f2933";
          pen.lineWidth = 6;
          pen.beginPath();
          pen.moveTo(x + 12, y + 12);
          pen.lineTo(x + PX - 12, y + PX - 12);
          pen.moveTo(x + PX - 12, y + 12);
          pen.lineTo(x + 12, y + PX - 12);
          pen.stroke();
        }
      }
    }
    this.texture.needsUpdate = true;
  }
  private mine(pen: CanvasRenderingContext2D, x: number, y: number) {
    pen.strokeStyle = pen.fillStyle = "#22262c";
    pen.lineWidth = 5;
    pen.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      pen.beginPath();
      pen.moveTo(x - Math.cos(a) * PX * 0.34, y - Math.sin(a) * PX * 0.34);
      pen.lineTo(x + Math.cos(a) * PX * 0.34, y + Math.sin(a) * PX * 0.34);
      pen.stroke();
    }
    pen.beginPath();
    pen.arc(x, y, PX * 0.23, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#ffffff";
    pen.beginPath();
    pen.arc(x - PX * 0.08, y - PX * 0.08, PX * 0.05, 0, Math.PI * 2);
    pen.fill();
  }
  protected place(state: State) {
    const shape = `${state.rows}x${state.cols}`,
      size = cellOf(state.rows, state.cols);
    if (shape !== this.shape) {
      // Another field: the canvas, the tray and the camera are fitted to it.
      this.shape = shape;
      this.canvas.width = state.cols * PX;
      this.canvas.height = state.rows * PX;
      this.texture.dispose();
      this.field.scale.set(state.cols * size, state.rows * size, 1);
      this.tray.scale.set(state.cols * size + 0.5, 1, state.rows * size + 0.5);
      this.paint(state);
      this.resize();
      return;
    }
    this.paint(state);
  }
  protected animate(_before: State, state: State) {
    if (state.last !== null) this.onContact();
    return false;
  }
  protected mark(marks: Marks) {
    const s = this.state;
    this.cursor.visible = !!s && marks.cursor !== null && marks.cursor >= 0 && marks.cursor < s.open.length;
    if (!this.cursor.visible) return;
    const { x, z } = this.at(marks.cursor!);
    this.cursor.position.set(x, 0.13, z);
    this.cursor.scale.setScalar(this.cell());
  }
}
