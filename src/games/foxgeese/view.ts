import * as T from "three";
import { planks, block } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { LINKS, POINTS, type State } from "./rules";

const STEP = 1.0;
export const GOOSE = "#f4f1e8",
  FOX = "#d2691e";
export const FOX_SUBJECT: TableSubject = { half: 4.0, halfZ: 4.0, height: 0.9, lookY: 0, tilt: 1.0 };
/** Where a point of the cross lies on the board. */
export const pointAt = (i: number) => ({ x: (POINTS[i].col - 3) * STEP, z: (POINTS[i].row - 3) * STEP });
/** The board's top: the cross a shade darker than the wood round it, its lines and points burnt in. */
function boardTexture() {
  const size = 1024,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    u = size / 7.6,
    px = (i: number) => {
      const p = pointAt(i);
      return [size / 2 + (p.x / STEP) * u, size / 2 + (p.z / STEP) * u] as [number, number];
    };
  ctx.fillStyle = "#d9b27c";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(90, 52, 22, 0.16)";
  ctx.fillRect(size / 2 - 1.5 * u - u * 0.4, size / 2 - 3 * u - u * 0.4, 3 * u + u * 0.8, 6 * u + u * 0.8);
  ctx.fillRect(size / 2 - 3 * u - u * 0.4, size / 2 - 1.5 * u - u * 0.4, 6 * u + u * 0.8, 3 * u + u * 0.8);
  ctx.strokeStyle = "#3a2414";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  for (const [a, b] of LINKS) {
    ctx.beginPath();
    ctx.moveTo(...px(a));
    ctx.lineTo(...px(b));
    ctx.stroke();
  }
  ctx.fillStyle = "#3a2414";
  POINTS.forEach((_, i) => {
    ctx.beginPath();
    ctx.arc(...px(i), 13, 0, Math.PI * 2);
    ctx.fill();
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A cross of 33 points cut into a board on a table, with thirteen modelled geese and a fox. */
export class FoxGeeseView extends TableView<State> {
  private geese: T.Group[] = [];
  private fox: T.Group;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#4b3626");
    this.daylight("#fff6e0", "#4a3a2c", "#fff1d6", 7);
    const table = this.add(new T.PlaneGeometry(90, 90), this.standard(planks(11, (r) => this.own(r))), 0, -0.2, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    const edge = this.standard({ color: "#6a4a2c", roughness: 0.6 });
    this.add(block(7.6 * STEP, 0.2, 7.6 * STEP, 0.08), [edge, edge, this.standard({ map: this.own(boardTexture()), roughness: 0.7 }), edge, edge, edge], 0, -0.1, 0);
    // Larger than life on the board, and turned three-quarters toward me so that their faces are seen.
    for (let k = 0; k < 13; k++) {
      const goose = this.goose();
      goose.scale.setScalar(1.5);
      goose.rotation.y = Math.PI - 0.75;
      this.geese.push(goose);
    }
    this.fox = this.vixen();
    this.fox.scale.setScalar(1.65);
    this.fox.rotation.y = 0.65;
    this.scene.add(...this.geese, this.fox);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    POINTS.forEach(() => {
      const ring = ringMesh(own, 0.32, 0.4, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    });
    this.cursor = ringMesh(own, 0.42, 0.48, "#ffffff");
    this.chosen = ringMesh(own, 0.32, 0.42, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    this.begin();
  }
  private part(group: T.Group, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    const mesh = this.add(geometry, material, x, y, z, group);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  }
  /** A white goose standing, facing up the board (−z): a round body, a long neck, an orange beak and feet. */
  private goose() {
    const g = new T.Group(),
      down = this.standard({ color: "#f6f3ea", roughness: 0.85 }),
      grey = this.standard({ color: "#c9c4b8", roughness: 0.85 }),
      orange = this.standard({ color: "#e8892a", roughness: 0.55 }),
      dark = this.standard({ color: "#1d1b19", roughness: 0.4 }),
      part = (...args: [T.BufferGeometry, T.Material, number, number, number, number?, number?, number?]) => this.part(g, ...args);
    part(new T.SphereGeometry(0.2, 18, 12), down, 0, 0.26, 0.04, 0.85, 0.75, 1.25);
    // Folded wings, a little greyer, and a short raised tail.
    for (const side of [-1, 1]) part(new T.SphereGeometry(0.12, 12, 8), grey, side * 0.12, 0.29, 0.08, 0.4, 0.6, 1.3);
    part(new T.ConeGeometry(0.07, 0.16, 10), down, 0, 0.32, 0.3).rotation.x = Math.PI / 2 + 0.6;
    const neck = part(new T.CapsuleGeometry(0.05, 0.2, 4, 10), down, 0, 0.47, -0.15);
    neck.rotation.x = -0.35;
    part(new T.SphereGeometry(0.075, 14, 10), down, 0, 0.62, -0.2);
    part(new T.ConeGeometry(0.035, 0.12, 10), orange, 0, 0.6, -0.31).rotation.x = -Math.PI / 2;
    part(new T.SphereGeometry(0.025, 8, 6), orange, 0, 0.65, -0.25);
    for (const side of [-1, 1]) {
      part(new T.SphereGeometry(0.014, 8, 6), dark, side * 0.05, 0.64, -0.24);
      part(new T.CylinderGeometry(0.018, 0.018, 0.12, 6), orange, side * 0.07, 0.07, 0.04);
      part(new T.SphereGeometry(0.06, 10, 6), orange, side * 0.07, 0.012, -0.0, 0.8, 0.2, 1.1);
    }
    return g;
  }
  /** A red fox standing, facing down the board (+z): pointed ears, a white muzzle and chest, dark socks, a white-tipped brush. */
  private vixen() {
    const g = new T.Group(),
      red = this.standard({ color: "#cf6a24", roughness: 0.8 }),
      white = this.standard({ color: "#f3eee2", roughness: 0.85 }),
      dark = this.standard({ color: "#2a1d16", roughness: 0.6 }),
      part = (...args: [T.BufferGeometry, T.Material, number, number, number, number?, number?, number?]) => this.part(g, ...args);
    part(new T.SphereGeometry(0.2, 18, 12), red, 0, 0.36, -0.02, 0.8, 0.75, 1.45);
    part(new T.SphereGeometry(0.12, 14, 10), white, 0, 0.36, 0.2, 0.9, 1, 0.8);
    part(new T.SphereGeometry(0.13, 16, 12), red, 0, 0.55, 0.28);
    // The muzzle: a white cone with a black nose.
    part(new T.ConeGeometry(0.075, 0.18, 12), white, 0, 0.52, 0.43).rotation.x = Math.PI / 2;
    part(new T.SphereGeometry(0.025, 8, 6), dark, 0, 0.52, 0.52);
    for (const side of [-1, 1]) {
      const ear = part(new T.ConeGeometry(0.055, 0.15, 8), red, side * 0.075, 0.7, 0.25);
      ear.rotation.z = -side * 0.25;
      part(new T.ConeGeometry(0.03, 0.06, 8), dark, side * 0.09, 0.77, 0.255).rotation.z = -side * 0.25;
      part(new T.SphereGeometry(0.018, 8, 6), dark, side * 0.055, 0.58, 0.39);
      for (const along of [-0.18, 0.16]) part(new T.CapsuleGeometry(0.04, 0.2, 4, 8), dark, side * 0.09, 0.14, along);
    }
    // The brush, curving down behind, with its white tip.
    const brush = part(new T.SphereGeometry(0.1, 14, 10), red, 0, 0.32, -0.38, 0.9, 0.9, 2.2);
    brush.rotation.x = -0.5;
    part(new T.SphereGeometry(0.075, 12, 8), white, 0, 0.21, -0.58);
    return g;
  }
  protected subject() {
    return FOX_SUBJECT;
  }
  protected spots(): Spot[] {
    return POINTS.map((_, i) => ({ ...pointAt(i), y: 0.3, r: 0.45, point: i }));
  }
  private stand(piece: T.Object3D, point: number) {
    const p = pointAt(point);
    piece.position.set(p.x, 0, p.z);
    piece.visible = true;
  }
  protected place(state: State) {
    this.geese.forEach((goose, k) => {
      if (k < state.geese.length) this.stand(goose, state.geese[k]);
      else goose.visible = false;
    });
    this.stand(this.fox, state.fox);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    const { from, to, taken } = last,
      piece = before.fox === from ? this.fox : this.geese[before.geese.indexOf(from)],
      a = pointAt(from),
      b = pointAt(to);
    if (!piece) return false;
    // A goose waddles across in two little hops; the fox bounds, higher when it jumps.
    const high = taken !== null ? 0.9 : 0.3,
      hops = piece === this.fox ? 1 : 2;
    this.tween(0, taken !== null ? 520 : 400, (p) => {
      piece.position.set(a.x + (b.x - a.x) * p, Math.abs(Math.sin(p * Math.PI * hops)) * high, a.z + (b.z - a.z) * p);
      if (p === 1) this.onContact();
    });
    // The goose jumped over is carried off the board.
    if (taken !== null) {
      const goose = this.geese[before.geese.indexOf(taken)],
        c = pointAt(taken);
      if (goose)
        this.tween(260, 520, (p) => {
          goose.position.set(c.x + p * 5.5 * Math.sign(c.x || 1), Math.sin(p * Math.PI) * 1.2, c.z);
          goose.scale.setScalar(1.5 * (1 - p * 0.6));
          if (p === 1) {
            goose.visible = false;
            goose.scale.setScalar(1.5);
          }
        });
    }
    return true;
  }
  protected mark(marks: Marks) {
    this.rings.forEach((ring, i) => {
      const p = pointAt(i);
      ring.position.set(p.x, 0.012, p.z);
      ring.visible = marks.targets.includes(i) || marks.movable.includes(i);
    });
    for (const [ring, point] of [
      [this.cursor, marks.cursor],
      [this.chosen, marks.selected],
    ] as [T.Mesh, number | null][]) {
      ring.visible = point !== null && point >= 0 && point < POINTS.length;
      if (ring.visible) ring.position.set(pointAt(point!).x, 0.02, pointAt(point!).z);
    }
  }
}
