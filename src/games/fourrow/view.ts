import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { COLS, ROWS, freeRow, type State } from "./rules";

const CELL = 1,
  HOLE = 0.41,
  DEPTH = 0.36,
  /** Height of the middle of the bottom row above the table. */
  FLOOR = 0.75;
export const DISC_COLORS: [string, string] = ["#d7352b", "#f2c230"];
/** Centre of a cell on the upright rack. */
export const cellAt = (cell: number) => ({ x: ((cell % COLS) - (COLS - 1) / 2) * CELL, y: FLOOR + Math.floor(cell / COLS) * CELL });
function cloth() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4ead8";
  ctx.fillRect(0, 0, 256, 256);
  // A gingham cloth in a soft green.
  ctx.fillStyle = "rgba(122,160,128,0.42)";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * 64, 0, 32, 256);
    ctx.fillRect(0, i * 64, 256, 32);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(9, 9);
  return t;
}
function wallpaper() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#efe2c8";
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 64) {
    ctx.fillStyle = "rgba(196,150,120,0.28)";
    ctx.fillRect(x, 0, 22, 256);
    ctx.fillStyle = "rgba(160,110,90,0.5)";
    for (let y = 20; y < 256; y += 64) {
      ctx.beginPath();
      ctx.arc(x + 43, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(10, 4);
  return t;
}
/** An upright rack on a care-home table: discs drop into its columns. */
export class FourRowView extends TableView<State> {
  private discs: (T.Mesh | null)[] = Array(COLS * ROWS).fill(null);
  private disc: T.BufferGeometry;
  private paints: T.Material[];
  private arrows: T.Mesh[] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#d9c9ab");
    this.daylight("#fff8ea", "#b79f84", "#fff2d8", 9, 2.0);
    // The room: a papered wall with a window, and the table under a gingham cloth.
    const wall = this.add(new T.PlaneGeometry(60, 24), this.standard({ map: this.own(wallpaper()), roughness: 1 }), 0, 9, -9);
    wall.castShadow = false;
    this.add(new T.BoxGeometry(60, 0.9, 0.2), this.standard({ color: "#f6efe2" }), 0, 1.0, -8.9);
    const frame = this.standard({ color: "#fbf6ec", roughness: 0.6 });
    this.add(new T.BoxGeometry(6.4, 5.4, 0.16), frame, -6.2, 6.6, -8.88);
    this.add(new T.PlaneGeometry(5.8, 4.8), this.own(new T.MeshBasicMaterial({ color: "#cfe6f2" })), -6.2, 6.6, -8.78);
    this.add(new T.BoxGeometry(0.14, 4.8, 0.1), frame, -6.2, 6.6, -8.74);
    this.add(new T.BoxGeometry(5.8, 0.14, 0.1), frame, -6.2, 6.6, -8.74);
    const curtain = this.standard({ color: "#e7c9b0", roughness: 1 });
    for (const x of [-9.7, -2.7]) this.add(new T.BoxGeometry(1.5, 6.2, 0.2), curtain, x, 6.5, -8.6);
    // A wall clock.
    this.add(new T.CylinderGeometry(1.1, 1.1, 0.14, 40), this.standard({ color: "#7a5236" }), 5.6, 7.4, -8.85).rotation.x = Math.PI / 2;
    this.add(new T.CylinderGeometry(0.95, 0.95, 0.16, 40), frame, 5.6, 7.4, -8.83).rotation.x = Math.PI / 2;
    const hand = this.standard({ color: "#2b2622" });
    this.add(new T.BoxGeometry(0.06, 0.7, 0.04), hand, 5.6, 7.72, -8.72);
    this.add(new T.BoxGeometry(0.5, 0.06, 0.04), hand, 5.82, 7.4, -8.72);
    const top = this.add(new T.PlaneGeometry(60, 30), this.standard({ map: this.own(cloth()), roughness: 1 }), 0, 0, 4);
    top.rotation.x = -Math.PI / 2;
    top.castShadow = false;
    // On the table: a cup of tea, reading glasses, a week's pill box, a ball of yarn.
    const china = this.standard({ color: "#fbf8f1", roughness: 0.35 });
    this.add(new T.CylinderGeometry(0.62, 0.5, 0.07, 32), china, -5.1, 0.04, 1.7);
    this.add(new T.CylinderGeometry(0.36, 0.26, 0.46, 28), china, -5.1, 0.3, 1.7);
    this.add(new T.CylinderGeometry(0.31, 0.31, 0.02, 28), this.standard({ color: "#a8672f", roughness: 0.3 }), -5.1, 0.5, 1.7);
    this.add(new T.TorusGeometry(0.16, 0.04, 8, 18), china, -4.7, 0.3, 1.7);
    const rim = this.standard({ color: "#4a3a2e", roughness: 0.4 });
    for (const x of [4.3, 5.2]) this.add(new T.TorusGeometry(0.34, 0.035, 8, 28), rim, x, 0.05, 2.3).rotation.x = Math.PI / 2;
    this.add(new T.BoxGeometry(0.24, 0.035, 0.035), rim, 4.75, 0.05, 2.3);
    for (const [x, turn] of [[3.6, 0.5], [5.9, -0.5]] as const) this.add(new T.BoxGeometry(1.0, 0.035, 0.035), rim, x, 0.05, 1.86).rotation.y = Math.PI / 2 + turn;
    const box = this.standard({ color: "#f7f3ea", roughness: 0.5 });
    this.add(new T.BoxGeometry(3.0, 0.2, 0.6), box, 4.9, 0.1, 3.9);
    ["#e98b7d", "#efb768", "#f0dc7a", "#9ccb8f", "#8cc3d8", "#9aa3dc", "#c79ad6"].forEach((color, i) =>
      this.add(new T.BoxGeometry(0.36, 0.06, 0.5), this.standard({ color, roughness: 0.5 }), 3.65 + i * 0.415, 0.22, 3.9),
    );
    this.add(new T.SphereGeometry(0.55, 24, 16), this.standard({ color: "#b7677a", roughness: 1 }), -4.6, 0.55, 3.8);
    for (const turn of [0.5, -0.4]) {
      const needle = this.add(new T.CylinderGeometry(0.03, 0.03, 2.2, 8), this.standard({ color: "#d9d2c2", roughness: 0.3 }), -4.4, 0.75, 3.7);
      needle.rotation.set(0.4, turn, 1.25);
    }
    // The rack: a blue sheet with forty-two round windows, on two feet.
    const shape = new T.Shape(),
      w = COLS * CELL + 0.3,
      h = ROWS * CELL + 0.3,
      y0 = FLOOR - CELL / 2 - 0.15;
    shape.moveTo(-w / 2, y0);
    shape.lineTo(w / 2, y0);
    shape.lineTo(w / 2, y0 + h);
    shape.lineTo(-w / 2, y0 + h);
    shape.closePath();
    for (let cell = 0; cell < COLS * ROWS; cell++) {
      const { x, y } = cellAt(cell),
        hole = new T.Path();
      hole.absarc(x, y, HOLE, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const blue = this.standard({ color: "#2458b8", roughness: 0.4 });
    for (const z of [DEPTH / 2 - 0.06, -DEPTH / 2])
      this.add(new T.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 20 }), blue, 0, 0, z);
    for (const x of [-w / 2 - 0.08, w / 2 + 0.08]) {
      this.add(new T.BoxGeometry(0.2, h + 0.3, DEPTH + 0.1), blue, x, y0 + h / 2 - 0.1, 0);
      this.add(new T.BoxGeometry(0.5, 0.16, 2.2), blue, x, 0.08, 0);
    }
    this.add(new T.BoxGeometry(w, 0.12, DEPTH), blue, 0, y0 - 0.02, 0);
    this.disc = this.own(new T.CylinderGeometry(0.455, 0.455, 0.2, 40));
    this.paints = DISC_COLORS.map((color) => this.standard({ color, roughness: 0.35 }));
    // Marks: an arrow over each column that can take a disc, and a halo round the winning discs.
    const cone = this.own(new T.ConeGeometry(0.22, 0.4, 20)),
      gold = this.own(new T.MeshBasicMaterial({ color: "#ffd24a" })),
      white = this.own(new T.MeshBasicMaterial({ color: "#ffffff" }));
    for (let col = 0; col < COLS; col++) {
      const arrow = new T.Mesh(cone, gold);
      arrow.rotation.x = Math.PI;
      arrow.position.set(cellAt(col).x, FLOOR + ROWS * CELL + 0.1, 0);
      arrow.userData.white = white;
      arrow.userData.gold = gold;
      this.arrows.push(arrow);
      this.scene.add(arrow);
    }
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    // Looked at from the front, a little from above; a narrow screen needs only the rack.
    return { half: aspect < 1 ? 4.1 : 6.4, halfZ: 0.6, height: aspect < 1 ? 9.4 : 7.6, lookY: aspect < 1 ? 3.9 : 3.2, tilt: 0.3 };
  }
  protected spots(): Spot[] {
    const out: Spot[] = [];
    for (let cell = 0; cell < COLS * ROWS; cell++) out.push({ ...cellAt(cell), z: 0, r: 0.52, point: cell % COLS });
    for (let col = 0; col < COLS; col++) out.push({ x: cellAt(col).x, y: FLOOR + ROWS * CELL + 0.1, z: 0, r: 0.52, point: col });
    return out;
  }
  private discAt(cell: number, player: 0 | 1) {
    let mesh = this.discs[cell];
    if (!mesh) {
      mesh = new T.Mesh(this.disc, this.paints[player]);
      mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true;
      this.discs[cell] = mesh;
      this.scene.add(mesh);
    }
    mesh.material = this.paints[player];
    const { x, y } = cellAt(cell);
    mesh.position.set(x, y, 0);
    mesh.scale.setScalar(1);
    return mesh;
  }
  protected place(state: State) {
    state.cells.forEach((owner, cell) => {
      if (owner === null) {
        const mesh = this.discs[cell];
        if (mesh) {
          this.scene.remove(mesh);
          this.discs[cell] = null;
        }
      } else this.discAt(cell, owner);
    });
    // The winning discs stand out.
    for (const cell of state.line) this.discs[cell]?.scale.setScalar(1.08);
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    const cell = state.last,
      mesh = this.discAt(cell, state.cells[cell]!),
      end = cellAt(cell).y,
      start = FLOOR + ROWS * CELL + 0.4,
      fall = 260 + (start - end) * 55;
    mesh.position.y = start;
    this.tween(0, fall, (p) => {
      // Falls faster and faster, then settles with one small bounce.
      mesh.position.y = start + (end - start) * p * p;
      if (p === 1) this.onContact();
    });
    this.tween(fall, 160, (p) => (mesh.position.y = end + Math.sin(p * Math.PI) * 0.12));
    return true;
  }
  protected mark(marks: Marks) {
    this.arrows.forEach((arrow, col) => {
      const cursor = marks.cursor === col;
      arrow.visible = marks.targets.includes(col) || cursor;
      arrow.material = cursor ? arrow.userData.white : arrow.userData.gold;
      arrow.scale.setScalar(cursor ? 1.35 : 1);
      // The arrow of a full column is never shown: it is not among the targets.
      if (this.state && freeRow(this.state, col) < 0) arrow.visible = false;
    });
  }
}
