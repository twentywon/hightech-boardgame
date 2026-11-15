import * as T from "three";
import { planks, block, glossy, veneer, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BURNT, N, type State } from "./rules";

export const AMAZON_COLORS: [string, string] = ["#f1ead8", "#2a2522"];
const S = 0.7;
export const AMAZON_SUBJECT: TableSubject = { half: 4.0, halfZ: 4.0, height: 1.0, lookY: 0, tilt: 1.08 };
/** The centre of a square. */
export const squareAt = (s: number) => ({ x: ((s % N) - 4.5) * S, z: (Math.floor(s / N) - 4.5) * S });
/** An amazon: a turned figure with a crown of points, as a queen of chess but slimmer. */
function figure() {
  const profile = [
    [0, 0], [0.27, 0], [0.28, 0.06], [0.22, 0.1], [0.2, 0.14], [0.13, 0.22], [0.1, 0.42], [0.09, 0.56], [0.15, 0.6], [0.11, 0.64], [0.13, 0.76], [0.16, 0.84], [0, 0.86],
  ].map(([r, y]) => new T.Vector2(r, y));
  return new T.LatheGeometry(profile, 28);
}
/** A board of maple and walnut squares in a dark frame, four amazons a side, and burnt squares where arrows have struck. */
export class AmazonsView extends TableView<State> {
  private amazons = new T.Group();
  private arrows = new T.Group();
  private body: T.BufferGeometry;
  private point: T.BufferGeometry;
  private paints: T.Material[];
  private char: T.BufferGeometry;
  private burnt: T.Material;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  private landing: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2b2017");
    this.daylight("#fff5e4", "#4a3828", "#fff0d8", 7, 2.2);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard(planks(8, keep)), 0, -0.2, 0).castShadow = false;
    const frame = this.standard({ map: keep(wood(true)), roughness: 0.45 });
    this.add(block(N * S + 0.5, 0.22, N * S + 0.5, 0.08), frame, 0, -0.11, 0);
    const light = this.standard({ map: keep(veneer(false)), roughness: 0.5 }),
      dark = this.standard({ map: keep(veneer(true)), roughness: 0.5 }),
      tile = keep(new T.BoxGeometry(S, 0.02, S));
    for (let s = 0; s < N * N; s++) {
      const p = squareAt(s),
        mesh = new T.Mesh(tile, (Math.floor(s / N) + (s % N)) % 2 ? dark : light);
      mesh.position.set(p.x, 0.01, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this.body = keep(figure());
    this.point = keep(new T.ConeGeometry(0.035, 0.1, 8));
    this.paints = AMAZON_COLORS.map((color) => keep(glossy({ color, roughness: 0.35 })));
    // A burnt square: a charred plug set into the board, with a tuft of feathers where the arrow went in.
    this.char = keep(block(S * 0.86, 0.06, S * 0.86, 0.03));
    this.burnt = this.standard({ color: "#3a1f12", roughness: 0.9 });
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 100; i++) {
      const ring = ringMesh(own, 0.22, 0.29, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.3, 0.35, "#ffffff");
    this.chosen = ringMesh(own, 0.26, 0.33, "#ff8a3c");
    this.landing = ringMesh(own, 0.26, 0.33, "#5ad1ff");
    this.scene.add(this.amazons, this.arrows, this.cursor, this.chosen, this.landing);
    this.begin();
  }
  private amazon(side: number) {
    const g = new T.Group(),
      body = new T.Mesh(this.body, this.paints[side]);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    for (let i = 0; i < 6; i++) {
      const tip = new T.Mesh(this.point, this.paints[side]),
        a = (i / 6) * Math.PI * 2;
      tip.position.set(Math.cos(a) * 0.12, 0.88, Math.sin(a) * 0.12);
      g.add(tip);
    }
    g.scale.setScalar(0.95);
    return g;
  }
  private arrow(s: number) {
    const p = squareAt(s),
      mesh = new T.Mesh(this.char, this.burnt);
    mesh.position.set(p.x, 0.04, p.z);
    mesh.receiveShadow = true;
    return mesh;
  }
  protected subject() {
    return AMAZON_SUBJECT;
  }
  protected spots(): Spot[] {
    return Array.from({ length: N * N }, (_, s) => ({ ...squareAt(s), y: 0.2, r: S * 0.6, point: s }));
  }
  protected place(state: State) {
    this.amazons.clear();
    this.arrows.clear();
    state.board.forEach((p, s) => {
      if (p === BURNT) this.arrows.add(this.arrow(s));
      else if (p === 0 || p === 1) {
        const g = this.amazon(p),
          at = squareAt(s);
        g.position.set(at.x, 0.02, at.z);
        g.userData.square = s;
        this.amazons.add(g);
      }
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    this.place(before);
    const mover = this.amazons.children.find((g) => g.userData.square === last.from);
    if (!mover) return false;
    const a = squareAt(last.from),
      b = squareAt(last.to),
      c = squareAt(last.arrow),
      far = Math.hypot(b.x - a.x, b.z - a.z),
      // The arrow: a dark streak flying from the amazon to its square.
      shaft = new T.Mesh(this.point, this.burnt);
    shaft.scale.set(1.2, 3, 1.2);
    shaft.visible = false;
    this.scene.add(shaft);
    const glide = 220 + far * 90;
    this.tween(0, glide, (p) => {
      const e = p * p * (3 - 2 * p);
      mover.position.set(a.x + (b.x - a.x) * e, 0.02 + Math.sin(Math.PI * p) * 0.25, a.z + (b.z - a.z) * e);
      if (p === 1) this.onContact();
    });
    this.tween(glide + 80, 360, (p) => {
      shaft.visible = p < 1;
      shaft.position.set(b.x + (c.x - b.x) * p, 0.6 + Math.sin(Math.PI * p) * 0.8 - p * 0.5, b.z + (c.z - b.z) * p);
      shaft.rotation.set(Math.PI / 2, 0, -Math.atan2(c.x - b.x, c.z - b.z));
      if (p === 1) {
        shaft.removeFromParent();
        this.arrows.add(this.arrow(last.arrow));
        this.onContact();
      }
    });
    return true;
  }
  protected mark(marks: Marks) {
    const lit = [...marks.movable, ...marks.targets];
    this.rings.forEach((ring, i) => {
      const s = lit[i];
      ring.visible = s !== undefined && s >= 0 && s < N * N;
      if (ring.visible) ring.position.set(squareAt(s).x, 0.025, squareAt(s).z);
    });
    for (const [ring, s] of [
      [this.cursor, marks.cursor],
      [this.chosen, marks.selected],
      [this.landing, marks.pending ?? null],
    ] as [T.Mesh, number | null][]) {
      ring.visible = s !== null && s >= 0 && s < N * N;
      if (ring.visible) ring.position.set(squareAt(s!).x, 0.03, squareAt(s!).z);
    }
  }
}
