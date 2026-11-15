import * as T from "three";
import { block, stuff } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { GRASS, SET, TENT, crowded, lineState, type State } from "./rules";

export const TENTS_COLORS: [string, string] = ["#e0782e", "#2f6b3a"];
const CELL = 0.9,
  TOP = 0.12,
  OUT = 0.62;
/** The centre of a square. */
export function cellAt(size: number, index: number) {
  return { x: ((index % size) - (size - 1) / 2) * CELL, z: (Math.floor(index / size) - (size - 1) / 2) * CELL };
}
/** What the camera frames for a field of `size` (browser tests aim with it too). */
export function tentsSubject(size: number, aspect: number): TableSubject {
  const half = (size * CELL) / 2 + OUT + 0.35;
  return { half: aspect < 1 ? half : half + 0.3, halfZ: half + 0.2, height: 0.8, lookY: 0.1, tilt: 1.05 };
}
/** The grass of the field: squares in two greens with a fine seam between. */
function fieldTexture(size: number) {
  const u = 96,
    c = document.createElement("canvas");
  c.width = c.height = size * u;
  const ctx = c.getContext("2d")!;
  let seed = size * 7919;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let r = 0; r < size; r++)
    for (let q = 0; q < size; q++) {
      ctx.fillStyle = (r + q) % 2 ? "#7fae55" : "#89b85d";
      ctx.fillRect(q * u, r * u, u, u);
      // Blades of grass.
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = rand() < 0.5 ? "rgba(60, 100, 40, 0.5)" : "rgba(170, 210, 120, 0.5)";
        ctx.lineWidth = 2;
        const x = q * u + rand() * u,
          y = r * u + rand() * u;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 6, y - 6 - rand() * 6);
        ctx.stroke();
      }
    }
  ctx.strokeStyle = "rgba(40, 70, 30, 0.55)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(i * u, 0);
    ctx.lineTo(i * u, size * u);
    ctx.moveTo(0, i * u);
    ctx.lineTo(size * u, i * u);
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/**
 * A campsite seen from above: a field of grass squares on a raised bed of earth, trees modelled in code (pines and
 * round leafy trees), orange tents pitched as ridged prisms with a dark doorway, tufts of grass for the squares
 * marked empty, and the numbers on wooden plates along the top and the left (green when met, red when passed).
 */
export class TentsView extends TableView<State> {
  private size = 0;
  private built = "";
  private board = new T.Group();
  private things = new T.Group();
  private plates: { row: boolean; k: number; mesh: T.Mesh }[] = [];
  private numbers = new Map<string, T.Material[]>();
  private parts: Record<string, T.BufferGeometry> = {};
  private paint: Record<string, T.Material> = {};
  private meshes = new Map<number, T.Object3D>();
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#5d7d44");
    this.daylight("#eaf4ff", "#4e6a34", "#fff2d6", 8, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...stuff("grass", "#6f9a4a", 6, keep), roughness: 1 }), 0, -0.2, 0).castShadow = false;
    const g = (name: string, geometry: T.BufferGeometry) => (this.parts[name] = this.own(geometry));
    g("trunk", new T.CylinderGeometry(0.06, 0.08, 0.32, 10));
    g("cone", new T.ConeGeometry(0.3, 0.42, 14));
    g("crown", new T.IcosahedronGeometry(0.3, 1));
    // A tent: a triangular prism lying along z, its ridge up, and a dark doorway on the end toward me.
    const tent = new T.CylinderGeometry(0.3, 0.3, 0.56, 3, 1);
    tent.rotateX(-Math.PI / 2);
    g("tent", tent);
    const door = new T.BufferGeometry().setFromPoints([new T.Vector3(-0.09, 0, 0), new T.Vector3(0.09, 0, 0), new T.Vector3(0, 0.3, 0)]);
    door.setIndex([0, 1, 2]);
    door.computeVertexNormals();
    g("door", door);
    g("blade", new T.ConeGeometry(0.035, 0.22, 5));
    g("plate", block(0.5, 0.06, 0.5, 0.025));
    const p = (name: string, options: T.MeshStandardMaterialParameters) => (this.paint[name] = this.standard(options));
    p("bark", { color: "#6b4a2e", roughness: 0.9 });
    p("pine", { color: "#2f6b3a", roughness: 0.8 });
    p("leaf", { color: "#4f8f3a", roughness: 0.8 });
    p("canvas", { color: "#e0782e", roughness: 0.7 });
    p("crowded", { color: "#d2352a", roughness: 0.6, emissive: "#5a0c06" });
    p("door", { color: "#3a2416", roughness: 0.9, side: T.DoubleSide });
    p("tuft", { color: "#b9d97a", roughness: 0.8 });
    p("earth", { ...stuff("earth", "#7a5a3a", 1.2, keep), roughness: 1 });
    p("wood", { color: "#8a5a32", roughness: 0.6 });
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.36, 0.41, "#ffffff");
    this.hintRing = ringMesh(own, 0.35, 0.43, "#ffb21f");
    this.scene.add(this.board, this.things, this.cursor, this.hintRing);
    this.begin();
  }
  private mesh(part: string, paint: string, x = 0, y = 0, z = 0, parent: T.Object3D = this.things) {
    const m = new T.Mesh(this.parts[part], this.paint[paint]);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** A tree: pines and round trees by turns, as the square's number falls. */
  private tree(i: number) {
    const group = new T.Group();
    this.mesh("trunk", "bark", 0, 0.16, 0, group);
    if ((i * 7) % 3) {
      this.mesh("cone", "pine", 0, 0.42, 0, group);
      this.mesh("cone", "pine", 0, 0.62, 0, group).scale.setScalar(0.75);
    } else this.mesh("crown", "leaf", 0, 0.52, 0, group);
    return group;
  }
  private tent(bad: boolean) {
    const group = new T.Group();
    this.mesh("tent", bad ? "crowded" : "canvas", 0, 0.15, 0, group);
    this.mesh("door", "door", 0, 0.002, 0.282, group);
    return group;
  }
  private tuft() {
    const group = new T.Group();
    for (const [x, z, lean] of [[-0.08, 0, -0.3], [0, -0.05, 0], [0.08, 0.02, 0.3], [0.02, 0.07, 0.15]]) this.mesh("blade", "tuft", x, 0.1, z, group).rotation.z = lean;
    return group;
  }
  private label(text: string, tone: "open" | "done" | "over") {
    const key = `${text}|${tone}`;
    let material = this.numbers.get(key);
    if (!material) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = tone === "done" ? "#2f7d4a" : tone === "over" ? "#a3241c" : "#f2ead6";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = tone === "open" ? "#22262c" : "#fff6e0";
      ctx.font = '800 84px Inter, "Noto Sans KR", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 70);
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      const face = this.standard({ map: texture, roughness: 0.5 }),
        wood = this.paint.wood;
      material = [wood, wood, face, wood, wood, wood];
      this.numbers.set(key, material);
    }
    return material;
  }
  /** Builds the field, its trees and the number plates when the puzzle changes. */
  private lay(state: State) {
    const key = `${state.size}:${state.trees.map(Number).join("")}`;
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    this.board.clear();
    const n = state.size,
      span = n * CELL,
      top = this.standard({ map: this.own(fieldTexture(n)), roughness: 0.95 }),
      earth = this.paint.earth;
    const bed = new T.Mesh(this.own(block(span + 0.2, 0.24, span + 0.2, 0.05)), [earth, earth, top, earth, earth, earth]);
    bed.position.y = TOP - 0.12;
    bed.receiveShadow = bed.castShadow = true;
    this.board.add(bed);
    state.trees.forEach((tree, i) => {
      if (!tree) return;
      const p = cellAt(n, i),
        model = this.tree(i);
      model.position.set(p.x, TOP, p.z);
      model.rotation.y = i;
      this.board.add(model);
    });
    this.plates = [];
    for (const row of [true, false])
      for (let k = 0; k < n; k++) {
        const along = (k - (n - 1) / 2) * CELL,
          out = -(span / 2 + OUT),
          mesh = new T.Mesh(this.parts.plate, this.label(String(row ? state.rows[k] : state.cols[k]), "open"));
        mesh.position.set(row ? out : along, 0.03, row ? along : out);
        mesh.castShadow = true;
        this.board.add(mesh);
        this.plates.push({ row, k, mesh });
      }
    if (resized) this.resize();
  }
  protected subject(aspect: number): TableSubject {
    return tentsSubject(this.size || 6, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.cells.map((_, i) => ({ ...cellAt(state.size, i), y: TOP + 0.1, r: CELL * 0.55, point: i }));
  }
  protected place(state: State) {
    this.lay(state);
    this.things.clear();
    this.meshes.clear();
    const bad = crowded(state);
    state.cells.forEach((mark, i) => {
      if (mark !== TENT && mark !== GRASS) return;
      const p = cellAt(state.size, i),
        model = mark === TENT ? this.tent(bad[i]) : this.tuft();
      model.position.set(p.x, TOP, p.z);
      this.things.add(model);
      this.meshes.set(i, model);
    });
    for (const { row, k, mesh } of this.plates) mesh.material = this.label(String(row ? state.rows[k] : state.cols[k]), lineState(state, row, k));
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    this.place(state);
    const model = this.meshes.get(state.last);
    if (!model) return false;
    // A tent goes up from the ground; a tuft springs up.
    this.tween(0, 240, (p) => {
      const e = 1 - (1 - p) ** 3;
      model.scale.set(1, Math.max(0.05, e), 1);
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
        const p = cellAt(state.size, point!);
        mesh.position.set(p.x, TOP + 0.02, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    const hinted = marks.hint && marks.hint.to >= SET ? Math.floor((marks.hint.to - SET) / 3) : null;
    ring(this.hintRing, hinted);
  }
}
