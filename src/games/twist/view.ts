import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELLS, SIZE, TURN_BASE, quarterCells, twistOf, type State } from "./rules";

const STEP = 1.0,
  GAP = 0.14,
  EDGE = 3 * STEP + GAP,
  SUBJECT: TableSubject = { half: 5.1, halfZ: 4.1, height: 1.0, lookY: 0, tilt: 1.0 };
export const MARBLE_COLORS: [string, string] = ["#1c1d21", "#f3efe6"];
/** Centre of a cell, or of one of the eight turn buttons beside the board. */
export function pointAt(point: number) {
  if (point < CELLS) {
    const r = Math.floor(point / SIZE),
      c = point % SIZE;
    return { x: (c - 2.5) * STEP + (c < 3 ? -GAP : GAP), z: (r - 2.5) * STEP + (r < 3 ? -GAP : GAP) };
  }
  const { quarter, clockwise } = twistOf(point),
    left = quarter % 2 === 0,
    top = quarter < 2,
    // The two buttons of a quarter lie beside it, clockwise nearer the corner.
    z = (top ? -1 : 1) * (1.5 * STEP + GAP) + (clockwise === top ? -0.62 : 0.62);
  return { x: (left ? -1 : 1) * (EDGE + 0.85), z };
}
export const twistPoints = () => Array.from({ length: CELLS + 8 }, (_, i) => pointAt(i));
const quarterCentre = (quarter: number) => pointAt(quarterCells(quarter)[4]);
function quarterTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 384;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#b9482f";
  ctx.fillRect(0, 0, 384, 384);
  for (let r = 0; r < 3; r++)
    for (let col = 0; col < 3; col++) {
      const x = 64 + col * 128,
        y = 64 + r * 128,
        shade = ctx.createRadialGradient(x - 8, y - 8, 6, x, y, 46);
      shade.addColorStop(0, "#5f2014");
      shade.addColorStop(1, "#8b3320");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(x, y, 44, 0, Math.PI * 2);
      ctx.fill();
    }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
function buttonTexture(clockwise: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  if (!clockwise) {
    ctx.translate(128, 0);
    ctx.scale(-1, 1);
  }
  ctx.strokeStyle = ctx.fillStyle = "#3a2a10";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(64, 64, 32, Math.PI * 0.75, Math.PI * 0.2);
  ctx.stroke();
  // The head of the arrow, at the end of the arc.
  const ex = 64 + 32 * Math.cos(Math.PI * 0.2),
    ey = 64 + 32 * Math.sin(Math.PI * 0.2);
  ctx.beginPath();
  ctx.moveTo(ex - 20, ey - 4);
  ctx.lineTo(ex + 12, ey - 14);
  ctx.lineTo(ex + 2, ey + 18);
  ctx.closePath();
  ctx.fill();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A board of four turning quarters on a desk. */
export class TwistView extends TableView<State> {
  private quarters: T.Mesh[] = [];
  private marbles: (T.Mesh | null)[] = Array(CELLS).fill(null);
  private ball: T.BufferGeometry;
  private paints: T.Material[];
  private buttons: T.Mesh[] = [];
  private cursor: T.Mesh;
  private ghost: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3d2c20");
    this.daylight("#fff3dc", "#3a2c22", "#ffe9c4", 9, 2.1);
    const desk = this.add(new T.PlaneGeometry(90, 90), this.standard({ map: this.own(wood(true)), roughness: 0.6 }), 0, -0.3, 0);
    desk.rotation.x = -Math.PI / 2;
    desk.castShadow = false;
    // On the desk: a lamp, books, a cup of pencils, a notebook and a mug.
    const brass = this.standard({ color: "#b08a3e", roughness: 0.35, metalness: 0.6 }),
      shade = this.standard({ color: "#2f5d4a", roughness: 0.5, side: T.DoubleSide });
    this.add(new T.CylinderGeometry(0.7, 0.8, 0.12, 32), brass, -6.3, -0.24, -4.6);
    this.add(new T.CylinderGeometry(0.05, 0.05, 3.0, 10), brass, -6.3, 1.2, -4.6);
    const arm = this.add(new T.CylinderGeometry(0.05, 0.05, 2.0, 10), brass, -5.5, 2.9, -4.2);
    arm.rotation.set(0.35, 0, -1.0);
    this.add(new T.ConeGeometry(0.85, 0.9, 28, 1, true), shade, -4.6, 3.0, -3.8);
    this.add(new T.SphereGeometry(0.22, 14, 10), this.own(new T.MeshBasicMaterial({ color: "#fff2c4" })), -4.6, 2.8, -3.8);
    const glow = new T.PointLight("#ffdca0", 14, 14, 1.6);
    glow.position.set(-4.6, 2.6, -3.8);
    this.scene.add(glow);
    [["#7a2f2f", 2.6], ["#2f4f7a", 2.3], ["#3f6b47", 2.5]].forEach(([color, width], i) => {
      const book = this.add(new T.BoxGeometry(width as number, 0.34, 1.7), this.standard({ color: color as string }), 6.3, -0.13 + i * 0.35, -4.4);
      book.rotation.y = 0.12 - i * 0.1;
      this.add(new T.BoxGeometry((width as number) - 0.12, 0.26, 1.6), this.standard({ color: "#efe7d3" }), 6.36, -0.13 + i * 0.35, -4.36).rotation.y = book.rotation.y;
    });
    this.add(new T.CylinderGeometry(0.42, 0.36, 0.95, 24), this.standard({ color: "#3a3f4a", roughness: 0.5 }), 6.6, 0.18, 3.6);
    ["#d8452f", "#2f62c0", "#e0a020", "#3f9a5a"].forEach((color, i) => {
      const pencil = this.add(new T.CylinderGeometry(0.045, 0.045, 1.5, 8), this.standard({ color }), 6.48 + i * 0.08, 0.75, 3.55 + (i % 2) * 0.12);
      pencil.rotation.set(0.12 * (i - 1.5), 0, 0.1 * (i - 1.5));
    });
    const pad = this.add(new T.BoxGeometry(2.6, 0.1, 3.4), this.standard({ color: "#f3ecd9" }), -6.6, -0.25, 3.0);
    pad.rotation.y = 0.15;
    this.add(new T.CylinderGeometry(0.055, 0.055, 1.9, 8), this.standard({ color: "#22262e", roughness: 0.3 }), -6.2, -0.14, 3.1).rotation.set(Math.PI / 2, 0, 0.5);
    this.add(new T.CylinderGeometry(0.46, 0.4, 0.8, 26), this.standard({ color: "#e8e2d4", roughness: 0.35 }), -6.9, 0.1, -0.6);
    this.add(new T.CylinderGeometry(0.39, 0.39, 0.02, 26), this.standard({ color: "#3a2416", roughness: 0.2 }), -6.9, 0.49, -0.6);
    // The board: a dark tray carrying four quarters that turn.
    this.add(new T.BoxGeometry(EDGE * 2 + 0.5, 0.22, EDGE * 2 + 0.5), this.standard({ color: "#2a1c14", roughness: 0.5 }), 0, -0.2, 0);
    const side = this.standard({ color: "#8b3320", roughness: 0.55 }),
      face = this.standard({ map: this.own(quarterTexture()), roughness: 0.55 }),
      block = this.own(new T.BoxGeometry(3 * STEP - 0.06, 0.24, 3 * STEP - 0.06));
    for (let q = 0; q < 4; q++) {
      const mesh = new T.Mesh(block, [side, side, face, side, side, side]),
        centre = quarterCentre(q);
      mesh.position.set(centre.x, 0.02, centre.z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.quarters.push(mesh);
      this.scene.add(mesh);
    }
    this.ball = this.own(new T.SphereGeometry(0.36, 28, 20));
    this.paints = MARBLE_COLORS.map((color) => this.standard({ color, roughness: 0.18, metalness: 0.1 }));
    const disc = this.own(new T.CircleGeometry(0.52, 36));
    for (let t = 0; t < 8; t++) {
      const button = new T.Mesh(disc, this.own(new T.MeshBasicMaterial({ map: this.own(buttonTexture(t % 2 === 0)), transparent: true })));
      button.rotation.x = -Math.PI / 2;
      const p = pointAt(TURN_BASE + t);
      button.position.set(p.x, -0.26, p.z);
      button.visible = false;
      this.buttons.push(button);
      this.scene.add(button);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.42, 0.5, "#ffffff");
    this.ghost = new T.Mesh(this.ball, this.own(new T.MeshStandardMaterial({ color: "#ffd24a", transparent: true, opacity: 0.75, roughness: 0.3 })));
    this.ghost.visible = false;
    this.scene.add(this.cursor, this.ghost);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  protected spots(): Spot[] {
    return twistPoints().map((p, i) => ({ ...p, y: i < CELLS ? 0.3 : -0.2, r: i < CELLS ? 0.5 : 0.56, point: i }));
  }
  private marble(cell: number, player: 0 | 1) {
    let mesh = this.marbles[cell];
    if (!mesh) {
      mesh = new T.Mesh(this.ball, this.paints[player]);
      mesh.castShadow = true;
      this.marbles[cell] = mesh;
      this.scene.add(mesh);
    }
    mesh.material = this.paints[player];
    const p = pointAt(cell);
    mesh.position.set(p.x, 0.36, p.z);
    mesh.scale.setScalar(1);
    return mesh;
  }
  protected place(state: State) {
    this.quarters.forEach((quarter) => {
      quarter.rotation.y = 0;
      quarter.position.y = 0.02;
    });
    state.cells.forEach((owner, cell) => {
      if (owner === null) {
        const mesh = this.marbles[cell];
        if (mesh) {
          this.scene.remove(mesh);
          this.marbles[cell] = null;
        }
      } else this.marble(cell, owner);
    });
    for (const cell of state.line) this.marbles[cell]?.scale.setScalar(1.14);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const { cell, twist } = state.last,
      placed = this.marble(cell, before.turn),
      rest = placed.position.y;
    placed.position.y = rest + 1.6;
    this.tween(0, 240, (p) => {
      placed.position.y = rest + 1.6 * (1 - p * p);
      if (p === 1) this.onContact();
    });
    if (!twist) return true;
    // The quarter lifts, turns a quarter of a circle with its marbles, and settles.
    const centre = quarterCentre(twist.quarter),
      block = this.quarters[twist.quarter],
      riders = quarterCells(twist.quarter)
        .map((c) => this.marbles[c])
        .filter((m): m is T.Mesh => !!m)
        .map((mesh) => ({ mesh, dx: mesh.position.x - centre.x, dz: mesh.position.z - centre.z }));
    this.tween(320, 620, (p) => {
      const e = p * p * (3 - 2 * p),
        angle = (twist.clockwise ? -1 : 1) * (Math.PI / 2) * e,
        lift = Math.sin(Math.PI * p) * 0.35,
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      block.rotation.y = angle;
      block.position.y = 0.02 + lift;
      for (const { mesh, dx, dz } of riders) mesh.position.set(centre.x + dx * cos + dz * sin, 0.36 + lift, centre.z - dx * sin + dz * cos);
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    this.buttons.forEach((button, t) => {
      button.visible = marks.removable.includes(TURN_BASE + t);
      button.scale.setScalar(marks.cursor === TURN_BASE + t ? 1.25 : 1);
    });
    const cursor = marks.cursor;
    this.cursor.visible = cursor !== null && cursor < CELLS;
    if (cursor !== null && cursor < CELLS) this.cursor.position.set(pointAt(cursor).x, 0.16, pointAt(cursor).z);
    const pending = marks.pending ?? null;
    this.ghost.visible = pending !== null;
    if (pending !== null) this.ghost.position.set(pointAt(pending).x, 0.36, pointAt(pending).z);
  }
}
