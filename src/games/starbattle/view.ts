import * as T from "three";
import { planks, block, glossy } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DOT, SET, STAR, clashes, type State } from "./rules";

export const STAR_COLORS: [string, string] = ["#e8b830", "#3b4a6b"];
const CELL = 0.82,
  TOP = 0.12;
/** Soft colours for the regions, one each. */
const TINTS = ["#f4c7c3", "#c9e4c5", "#c6d8f0", "#f6e3b4", "#e0cdf0", "#bfe6e6", "#f3d0e4", "#d9e7b8", "#f0d5bf"];
/** The centre of a square. */
export function squareOf(size: number, index: number) {
  return { x: ((index % size) - (size - 1) / 2) * CELL, z: (Math.floor(index / size) - (size - 1) / 2) * CELL };
}
/** What the camera frames for a grid of `size` (browser tests aim with it too). */
export function starSubject(size: number, aspect: number): TableSubject {
  const half = (size * CELL) / 2 + 0.45;
  return { half: aspect < 1 ? half : half + 0.2, halfZ: half, height: 0.4, lookY: 0, tilt: 1.12 };
}
/** The grid's top: each square in its region's colour, thin lines between squares and thick ones between regions. */
function gridTexture(state: State) {
  const n = state.size,
    u = 120,
    c = document.createElement("canvas");
  c.width = c.height = n * u;
  const ctx = c.getContext("2d")!;
  state.region.forEach((g, i) => {
    ctx.fillStyle = TINTS[g % TINTS.length];
    ctx.fillRect((i % n) * u, Math.floor(i / n) * u, u, u);
  });
  ctx.strokeStyle = "rgba(40, 40, 50, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * u, 0);
    ctx.lineTo(i * u, n * u);
    ctx.moveTo(0, i * u);
    ctx.lineTo(n * u, i * u);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2a2a35";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  for (let r = 0; r < n; r++)
    for (let q = 0; q < n; q++) {
      const g = state.region[r * n + q];
      if (q + 1 < n && state.region[r * n + q + 1] !== g) {
        ctx.beginPath();
        ctx.moveTo((q + 1) * u, r * u);
        ctx.lineTo((q + 1) * u, (r + 1) * u);
        ctx.stroke();
      }
      if (r + 1 < n && state.region[(r + 1) * n + q] !== g) {
        ctx.beginPath();
        ctx.moveTo(q * u, (r + 1) * u);
        ctx.lineTo((q + 1) * u, (r + 1) * u);
        ctx.stroke();
      }
    }
  ctx.lineWidth = 14;
  ctx.strokeRect(0, 0, n * u, n * u);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A five-pointed star, flat with bevelled edges, lying face up. */
function starShape() {
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      r = i % 2 ? 0.13 : 0.3;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2 });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0.1, 0);
  return geometry;
}
/**
 * The grid on a board on a table: squares tinted by region with heavy lines between regions, gold stars set on
 * the squares (red when they break a rule), small dark studs for the squares marked empty.
 */
export class StarBattleView extends TableView<State> {
  private size = 0;
  private built = "";
  private board = new T.Group();
  private things = new T.Group();
  private star: T.BufferGeometry;
  private stud: T.BufferGeometry;
  private gold: T.Material;
  private red: T.Material;
  private dark: T.Material;
  private meshes = new Map<number, T.Mesh>();
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1f2430");
    this.daylight("#eef2ff", "#3a3a48", "#fff4e0", 7, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard(planks(7, keep)), 0, -0.2, 0).castShadow = false;
    this.star = this.own(starShape());
    this.stud = this.own(new T.SphereGeometry(0.06, 12, 8));
    this.gold = this.own(glossy({ color: "#e8b830", roughness: 0.3, metalness: 0.55 }));
    this.red = this.own(glossy({ color: "#d63a2c", roughness: 0.35, metalness: 0.3, emissive: "#5a0c06" }));
    this.dark = this.standard({ color: "#3a3a48", roughness: 0.5 });
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.33, 0.38, "#ffffff");
    this.hintRing = ringMesh(own, 0.32, 0.39, "#ff8a1f");
    this.scene.add(this.board, this.things, this.cursor, this.hintRing);
    this.begin();
  }
  private lay(state: State) {
    const key = `${state.size}:${state.region.join(",")}`;
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    this.board.clear();
    const span = state.size * CELL,
      frame = this.standard({ color: "#2a2a35", roughness: 0.5 }),
      top = this.standard({ map: this.own(gridTexture(state)), roughness: 0.6 }),
      board = new T.Mesh(this.own(block(span + 0.3, 0.24, span + 0.3, 0.06)), [frame, frame, frame, frame, frame, frame]),
      face = new T.Mesh(this.own(new T.PlaneGeometry(span, span)), top);
    board.position.y = TOP - 0.12;
    board.receiveShadow = board.castShadow = true;
    face.rotation.x = -Math.PI / 2;
    face.position.y = TOP + 0.001;
    face.receiveShadow = true;
    this.board.add(board, face);
    if (resized) this.resize();
  }
  protected subject(aspect: number): TableSubject {
    return starSubject(this.size || 6, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.cells.map((_, i) => ({ ...squareOf(state.size, i), y: TOP + 0.05, r: CELL * 0.55, point: i }));
  }
  protected place(state: State) {
    this.lay(state);
    this.things.clear();
    this.meshes.clear();
    const bad = clashes(state);
    state.cells.forEach((mark, i) => {
      if (mark !== STAR && mark !== DOT) return;
      const p = squareOf(state.size, i),
        mesh = new T.Mesh(mark === STAR ? this.star : this.stud, mark === STAR ? (bad[i] ? this.red : this.gold) : this.dark);
      mesh.position.set(p.x, TOP + (mark === DOT ? 0.02 : 0), p.z);
      mesh.castShadow = true;
      this.things.add(mesh);
      this.meshes.set(i, mesh);
    });
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    this.place(state);
    const mesh = this.meshes.get(state.last);
    if (!mesh) return false;
    // A star drops in turning; a dot pops up.
    this.tween(0, 260, (p) => {
      const e = 1 - (1 - p) ** 3;
      mesh.scale.setScalar(Math.max(0.05, e));
      mesh.rotation.y = (1 - e) * 2;
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const ring = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = point !== null && point !== undefined && point >= 0 && point < state.cells.length;
      if (mesh.visible) {
        const p = squareOf(state.size, point!);
        mesh.position.set(p.x, TOP + 0.01, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    ring(this.hintRing, marks.hint && marks.hint.to >= SET ? Math.floor((marks.hint.to - SET) / 3) : null);
  }
}
