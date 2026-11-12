import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { HOLES, HOME, type State } from "./rules";

const STEP = 0.62,
  SUBJECT: TableSubject = { half: 5.6, halfZ: 5.6, height: 0.8, lookY: 0, tilt: 1.08 };
export const STAR_COLORS: [string, string] = ["#d2452f", "#2f62c0"];
/** Centre of a hole on the table. */
export const holeAt = (i: number) => ({ x: (HOLES[i].q + HOLES[i].r / 2) * STEP, z: HOLES[i].r * STEP * 0.866 });
function boardTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!,
    px = (v: number) => 512 + (v / 5.6) * 512;
  ctx.fillStyle = "#e7cf9c";
  ctx.beginPath();
  ctx.arc(512, 512, 506, 0, Math.PI * 2);
  ctx.fill();
  // The two home points wear their side's colour, faintly.
  HOME.forEach((holes, side) => {
    ctx.fillStyle = side === 0 ? "rgba(210,69,47,0.2)" : "rgba(47,98,192,0.2)";
    for (const i of holes) {
      const p = holeAt(i);
      ctx.beginPath();
      ctx.arc(px(p.x), px(p.z), 34, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  HOLES.forEach((_, i) => {
    const p = holeAt(i),
      shade = ctx.createRadialGradient(px(p.x) - 3, px(p.z) - 3, 2, px(p.x), px(p.z), 20);
    shade.addColorStop(0, "#6b4a26");
    shade.addColorStop(1, "#a17a45");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(px(p.x), px(p.z), 19, 0, Math.PI * 2);
    ctx.fill();
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A round board with a star of holes, and glass marbles in them. */
export class StarHopView extends TableView<State> {
  private marbles: (T.Mesh | null)[] = HOLES.map(() => null);
  private ball: T.BufferGeometry;
  private paints: T.Material[];
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9e7e1");
    this.daylight("#ffffff", "#c9c5bb", "#fff8ea", 9, 1.9);
    // A plain white table.
    const table = this.add(new T.PlaneGeometry(90, 90), this.standard({ color: "#f6f5f1", roughness: 0.45 }), 0, -0.3, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    const rim = this.standard({ color: "#8a5a2c", roughness: 0.5 });
    this.add(new T.CylinderGeometry(5.6, 5.6, 0.26, 72), [rim, this.standard({ map: this.own(boardTexture()), roughness: 0.6 }), rim], 0, -0.13, 0);
    this.ball = this.own(new T.SphereGeometry(0.24, 26, 18));
    this.paints = STAR_COLORS.map((color) => this.standard({ color, roughness: 0.15, metalness: 0.1 }));
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 40; i++) {
      const ring = ringMesh(own, 0.2, 0.27, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.28, 0.34, "#ffffff");
    this.chosen = ringMesh(own, 0.27, 0.34, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  protected spots(): Spot[] {
    return HOLES.map((_, i) => ({ ...holeAt(i), y: 0.1, r: 0.3, point: i }));
  }
  private marble(hole: number, owner: 0 | 1) {
    let mesh = this.marbles[hole];
    if (!mesh) {
      mesh = new T.Mesh(this.ball, this.paints[owner]);
      mesh.castShadow = true;
      this.marbles[hole] = mesh;
      this.scene.add(mesh);
    }
    mesh.material = this.paints[owner];
    mesh.position.set(holeAt(hole).x, 0.2, holeAt(hole).z);
    return mesh;
  }
  protected place(state: State) {
    state.cells.forEach((owner, hole) => {
      if (owner === null) {
        const mesh = this.marbles[hole];
        if (mesh) {
          this.scene.remove(mesh);
          this.marbles[hole] = null;
        }
      } else this.marble(hole, owner);
    });
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const { from, to, path } = state.last,
      mesh = this.marbles[from];
    if (!mesh) return false;
    // The marble is carried from hole to hole along its way; the state then puts it where it ended.
    this.marbles[from] = null;
    this.marbles[to]?.removeFromParent();
    this.marbles[to] = mesh;
    const stops = [from, ...path],
      each = path.length > 1 ? 230 : 260;
    path.forEach((_, k) => {
      const a = holeAt(stops[k]),
        b = holeAt(stops[k + 1]);
      this.tween(k * each, each, (p) => {
        mesh.position.set(a.x + (b.x - a.x) * p, 0.2 + Math.sin(Math.PI * p) * (path.length > 1 ? 0.7 : 0.25), a.z + (b.z - a.z) * p);
        if (p === 1) this.onContact();
      });
    });
    return true;
  }
  protected mark(marks: Marks) {
    this.rings.forEach((ring, i) => {
      const hole = marks.targets[i];
      ring.visible = hole !== undefined;
      if (hole !== undefined) ring.position.set(holeAt(hole).x, 0.012, holeAt(hole).z);
    });
    for (const [ring, hole] of [
      [this.cursor, marks.cursor],
      [this.chosen, marks.selected],
    ] as [T.Mesh, number | null][]) {
      ring.visible = hole !== null;
      if (hole !== null) ring.position.set(holeAt(hole).x, 0.014, holeAt(hole).z);
    }
  }
}
