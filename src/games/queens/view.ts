import * as T from "three";
import { wood, planks, veneer, glossy, block, fall } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { clashing, type State } from "./rules";

export const QUEEN_COLORS: [string, string] = ["#ecdcb4", "#1d1a18"];
/** A square's side, the height of its top, and how much smaller a queen stands than a chess queen. */
const CELL = 0.78,
  TOP = 0.21,
  SCALE = 0.92;
/** The centre of a square of a board of `size`. */
export function cellAt(size: number, index: number) {
  const r = Math.floor(index / size),
    c = index % size;
  return { x: (c - (size - 1) / 2) * CELL, z: (r - (size - 1) / 2) * CELL };
}
/**
 * A chessboard of maple and walnut veneer in a dark rim on a wooden table, sized to the puzzle, and turned queens
 * in the Staunton manner: the given ones in ebony with a brass ring at the foot, mine in boxwood. A queen that
 * stands on the line of another glows red until it is moved.
 */
export class QueensView extends TableView<State> {
  private size = 0;
  private board = new T.Group();
  private queens = new T.Group();
  private shapes: T.BufferGeometry[] = [];
  private paints: { mine: T.Material; given: T.Material; clash: T.Material; brass: T.Material };
  private meshes = new Map<number, T.Group>();
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#65452f");
    this.daylight("#fff2d7", "#283c35", "#fff5df", 7, 2.4);
    this.add(new T.BoxGeometry(60, 0.2, 60), this.standard(planks(10, (r) => this.own(r))), 0, -0.35, 0).castShadow = false;
    this.paints = {
      mine: this.own(glossy({ color: QUEEN_COLORS[0], roughness: 0.4, side: T.DoubleSide })),
      given: this.own(glossy({ color: QUEEN_COLORS[1], roughness: 0.4, side: T.DoubleSide })),
      clash: this.own(glossy({ color: "#e0533e", emissive: "#5a1208", roughness: 0.35, side: T.DoubleSide })),
      brass: this.standard({ color: "#c9a44a", roughness: 0.3, metalness: 0.85 }),
    };
    // The queen's turned body, its coronet of balls and the ball on top, shared by every queen.
    const lathe = (points: number[][]) => this.own(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), 32));
    this.shapes.push(
      lathe([[0, 0], [0.3, 0], [0.315, 0.025], [0.315, 0.07], [0.29, 0.1], [0.25, 0.115], [0.235, 0.145], [0.255, 0.175], [0.24, 0.205], [0.19, 0.235], [0.16, 0.3], [0.138, 0.4], [0.125, 0.5], [0.14, 0.545], [0.2, 0.565], [0.215, 0.59], [0.2, 0.612], [0.12, 0.628], [0, 0.63]]),
      lathe([[0.19, 0.61], [0.125, 0.66], [0.1, 0.8], [0.095, 0.98], [0.13, 1.04], [0.21, 1.07], [0.215, 1.1], [0.15, 1.12], [0.13, 1.16], [0.185, 1.25], [0.235, 1.305], [0.2, 1.305], [0.12, 1.25], [0, 1.26]]),
      this.own(new T.SphereGeometry(0.042, 14, 10)),
      this.own(new T.SphereGeometry(0.13, 22, 14).scale(1, 0.6, 1)),
      this.own(new T.SphereGeometry(0.05, 16, 12)),
      this.own(new T.TorusGeometry(0.31, 0.022, 8, 40).rotateX(Math.PI / 2)),
    );
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.31, 0.35, "#fff2c6");
    this.hintRing = ringMesh(own, 0.3, 0.37, "#ffb21f");
    this.scene.add(this.board, this.queens, this.cursor, this.hintRing);
    this.begin();
  }
  /** Lays the board out again when the puzzle's size changes. */
  private lay(size: number) {
    if (size === this.size) return;
    this.size = size;
    this.board.clear();
    const span = size * CELL,
      rim = this.add(block(span + 0.5, 0.35, span + 0.5), this.standard({ map: this.own(wood(false)), color: "#b27450", roughness: 0.34 }), 0, 0, 0, this.board),
      light = this.standard({ map: veneer(false), roughness: 0.38, color: "#fff4e0" }),
      dark = this.standard({ map: veneer(true), roughness: 0.38, color: "#9a7458" });
    // The rim is a lighter, warmer, polished wood than the table under it, so that the board stands apart (the user asked).
    rim.castShadow = rim.receiveShadow = true;
    // Squares of veneer, each cut from another part of its sheet so that no two have the same grain.
    let cut = 11;
    const sheet = () => (cut = (cut * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < size * size; i++) {
      const tile = new T.BoxGeometry(CELL, 0.035, CELL),
        uv = tile.getAttribute("uv"),
        u0 = sheet() * 0.5,
        v0 = sheet() * 0.5;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.5);
      const p = cellAt(size, i),
        square = this.add(tile, (Math.floor(i / size) + (i % size)) % 2 ? dark : light, p.x, 0.19, p.z, this.board);
      square.castShadow = false;
    }
  }
  /** A queen: the given ones in ebony with a brass ring at the foot, mine in boxwood, red while it stands in another's way. */
  private queen(given: boolean, clash: boolean) {
    const g = new T.Group(),
      // A given queen keeps its ebony; one of mine that stands in another's way glows red.
      paint = given ? this.paints.given : clash ? this.paints.clash : this.paints.mine,
      put = (shape: T.BufferGeometry, x: number, y: number, z: number, material = paint) => {
        const m = new T.Mesh(shape, material);
        m.position.set(x, y, z);
        m.castShadow = m.receiveShadow = true;
        g.add(m);
      };
    const [body, crown, ball, dome, top, ring] = this.shapes;
    put(body, 0, 0, 0);
    put(crown, 0, 0, 0);
    for (let n = 0; n < 8; n++) put(ball, Math.cos((n * Math.PI) / 4) * 0.218, 1.325, Math.sin((n * Math.PI) / 4) * 0.218);
    put(dome, 0, 1.27, 0);
    put(top, 0, 1.38, 0);
    if (given) put(ring, 0, 0.05, 0, clash ? this.paints.clash : this.paints.brass);
    g.scale.setScalar(SCALE);
    return g;
  }
  protected subject(aspect: number): TableSubject {
    const half = (this.size || 5) * CELL * 0.5 + 0.3;
    return { half: aspect < 1 ? half : half + 0.4, halfZ: half, height: 1.3, lookY: 0.1, tilt: 0.98 };
  }
  protected spots(): Spot[] {
    const size = this.size;
    return Array.from({ length: size * size }, (_, i) => ({ ...cellAt(size, i), y: TOP, r: CELL * 0.5, point: i }));
  }
  protected place(state: State) {
    const resized = state.size !== this.size;
    this.lay(state.size);
    if (resized) this.resize();
    this.queens.clear();
    this.meshes.clear();
    const clash = new Set(clashing(state));
    state.queens.forEach((on, i) => {
      if (!on) return;
      const q = this.queen(state.fixed[i], clash.has(i)),
        p = cellAt(state.size, i);
      q.position.set(p.x, TOP, p.z);
      this.queens.add(q);
      this.meshes.set(i, q);
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (last === null || state.ply !== before.ply + 1 || state.size !== before.size) return false;
    this.place(state);
    const q = this.meshes.get(last);
    if (q) {
      // Set down: it drops onto its square and settles.
      this.tween(0, 320, (p) => {
        q.position.y = TOP + fall(p) * 1.1;
        if (p === 1) this.onContact();
      });
      return true;
    }
    // Taken off: it lifts away from its square and is gone.
    const gone = this.queen(false, false),
      p0 = cellAt(state.size, last);
    gone.position.set(p0.x, TOP, p0.z);
    this.queens.add(gone);
    this.tween(0, 220, (p) => {
      gone.position.y = TOP + p * 0.9;
      gone.scale.setScalar(SCALE * (1 - p * 0.9));
      if (p === 1) this.queens.remove(gone);
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const ring = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = point !== null && point !== undefined && point >= 0 && point < state.size * state.size;
      if (mesh.visible) {
        const p = cellAt(state.size, point!);
        mesh.position.set(p.x, TOP + 0.012, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    ring(this.hintRing, marks.hint?.to);
  }
}
