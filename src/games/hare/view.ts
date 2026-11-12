import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { LINKS, PLACES, type State } from "./rules";

const STEP = 2.1,
  SUBJECT: TableSubject = { half: 5.6, halfZ: 3.6, height: 1.4, lookY: 0, tilt: 0.95 };
export const HARE_COLORS: [string, string] = ["#7a4a2b", "#f1ece0"];
/** Where a point of the board lies on the table. */
export const placeAt = (i: number) => ({ x: (PLACES[i].col - 2) * STEP, z: (PLACES[i].row - 1) * STEP });
function boardTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext("2d")!,
    px = (i: number) => {
      const p = placeAt(i);
      return [512 + p.x * 88, 320 + p.z * 88] as [number, number];
    };
  // A meadow: mown grass with lighter flecks.
  ctx.fillStyle = "#5d8a45";
  ctx.fillRect(0, 0, 1024, 640);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 3 ? "rgba(255,255,220,0.07)" : "rgba(20,50,10,0.09)";
    ctx.fillRect((i * 193) % 1024, (i * 419) % 640, 3, 9);
  }
  ctx.strokeStyle = "#f3ecd6";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  for (const [a, b] of LINKS) {
    ctx.beginPath();
    ctx.moveTo(...px(a));
    ctx.lineTo(...px(b));
    ctx.stroke();
  }
  PLACES.forEach((_, i) => {
    const [x, y] = px(i);
    ctx.fillStyle = "#f3ecd6";
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a7436";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The board on a table, with three modelled hounds and a hare. */
export class HareView extends TableView<State> {
  private hounds: T.Group[] = [];
  private hare: T.Group;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#4b3626");
    this.daylight("#fff6e0", "#4a3a2c", "#fff1d6", 8);
    const table = this.add(new T.PlaneGeometry(90, 90), this.standard({ map: this.own(wood(true)) }), 0, -0.2, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    const edge = this.standard({ color: "#6a4a2c", roughness: 0.6 });
    this.add(new T.BoxGeometry(11.9, 0.18, 7.5), [edge, edge, this.standard({ map: this.own(boardTexture()), roughness: 0.95 }), edge, edge, edge], 0, -0.09, 0);
    for (let k = 0; k < 3; k++) this.hounds.push(this.hound());
    this.hare = this.rabbit();
    for (const piece of [...this.hounds, this.hare]) piece.scale.setScalar(1.3);
    this.scene.add(...this.hounds, this.hare);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    PLACES.forEach(() => {
      const ring = ringMesh(own, 0.5, 0.6, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    });
    this.cursor = ringMesh(own, 0.64, 0.72, "#ffffff");
    this.chosen = ringMesh(own, 0.5, 0.62, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    this.begin();
  }
  /** A sitting hound, facing +x (toward the hare's end). */
  private hound() {
    const g = new T.Group(),
      coat = this.standard({ color: HARE_COLORS[0], roughness: 0.7 }),
      dark = this.standard({ color: "#3d2414", roughness: 0.7 }),
      part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
        const mesh = this.add(geometry, material, x, y, z, g);
        mesh.scale.set(sx, sy, sz);
        return mesh;
      };
    part(new T.SphereGeometry(0.34, 20, 14), coat, -0.05, 0.42, 0, 1.45, 0.95, 0.85);
    part(new T.SphereGeometry(0.24, 18, 12), coat, 0.42, 0.78, 0);
    part(new T.BoxGeometry(0.3, 0.16, 0.2), coat, 0.66, 0.72, 0);
    part(new T.SphereGeometry(0.06, 10, 8), dark, 0.82, 0.76, 0);
    for (const side of [-1, 1]) {
      part(new T.BoxGeometry(0.1, 0.3, 0.16), dark, 0.36, 0.8, side * 0.24).rotation.x = side * 0.5;
      part(new T.SphereGeometry(0.035, 8, 6), dark, 0.6, 0.86, side * 0.11);
      for (const along of [-0.34, 0.26]) part(new T.CylinderGeometry(0.075, 0.065, 0.4, 10), coat, along, 0.2, side * 0.17);
    }
    part(new T.CylinderGeometry(0.035, 0.06, 0.42, 8), dark, -0.56, 0.62, 0).rotation.z = 0.9;
    part(new T.TorusGeometry(0.2, 0.035, 8, 20), this.standard({ color: "#c63a2a" }), 0.3, 0.62, 0).rotation.y = Math.PI / 2;
    return g;
  }
  /** A hare on its haunches, facing -x (toward the hounds). */
  private rabbit() {
    const g = new T.Group(),
      fur = this.standard({ color: HARE_COLORS[1], roughness: 0.9 }),
      pink = this.standard({ color: "#e9a9a4" }),
      dark = this.standard({ color: "#2a2320" }),
      part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
        const mesh = this.add(geometry, material, x, y, z, g);
        mesh.scale.set(sx, sy, sz);
        return mesh;
      };
    part(new T.SphereGeometry(0.36, 20, 14), fur, 0.06, 0.4, 0, 1.1, 1.05, 0.9);
    part(new T.SphereGeometry(0.23, 18, 12), fur, -0.28, 0.82, 0);
    part(new T.SphereGeometry(0.05, 8, 6), pink, -0.5, 0.8, 0);
    part(new T.SphereGeometry(0.13, 12, 10), fur, 0.46, 0.34, 0);
    for (const side of [-1, 1]) {
      const ear = part(new T.CapsuleGeometry(0.06, 0.42, 4, 10), fur, -0.2, 1.22, side * 0.1);
      ear.rotation.set(side * 0.18, 0, 0.25);
      const inner = part(new T.CapsuleGeometry(0.03, 0.34, 4, 8), pink, -0.235, 1.22, side * 0.1);
      inner.rotation.copy(ear.rotation);
      part(new T.SphereGeometry(0.036, 8, 6), dark, -0.44, 0.88, side * 0.12);
      part(new T.SphereGeometry(0.12, 10, 8), fur, -0.2, 0.1, side * 0.2, 1.5, 0.6, 0.8);
    }
    return g;
  }
  protected subject() {
    return SUBJECT;
  }
  protected spots(): Spot[] {
    return PLACES.map((_, i) => ({ ...placeAt(i), y: 0.3, r: 0.9, point: i }));
  }
  private stand(piece: T.Group, point: number) {
    const p = placeAt(point);
    piece.position.set(p.x, 0, p.z);
  }
  protected place(state: State) {
    state.hounds.forEach((point, k) => this.stand(this.hounds[k], point));
    this.stand(this.hare, state.hare);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const { from, to } = state.last,
      piece = before.hare === from ? this.hare : this.hounds[before.hounds.indexOf(from)],
      a = placeAt(from),
      b = placeAt(to);
    if (!piece) return false;
    // Two hops along the line.
    // Its voice is heard as it sets off.
    this.onContact();
    this.tween(0, 420, (p) => piece.position.set(a.x + (b.x - a.x) * p, Math.abs(Math.sin(p * Math.PI * 2)) * 0.45, a.z + (b.z - a.z) * p));
    return true;
  }
  protected mark(marks: Marks) {
    this.rings.forEach((ring, i) => {
      const p = placeAt(i);
      ring.position.set(p.x, 0.02, p.z);
      ring.visible = marks.targets.includes(i) || marks.movable.includes(i);
    });
    for (const [ring, point] of [
      [this.cursor, marks.cursor],
      [this.chosen, marks.selected],
    ] as [T.Mesh, number | null][]) {
      ring.visible = point !== null;
      if (point !== null) ring.position.set(placeAt(point).x, 0.03, placeAt(point).z);
    }
  }
}
