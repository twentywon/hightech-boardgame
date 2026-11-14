import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { MAX, PEGS, type State } from "./rules";

export const HANOI_COLORS: [string, string] = ["#c8553a", "#b9b3a4"];
/** Where the pegs stand, how thick a disc is, how tall a peg, and the discs' glazes from the smallest up. */
const PEG_X = [-3.5, 0, 3.5],
  THICK = 0.38,
  PEG_TALL = 3.7,
  BASE = 0.3,
  GLAZE = ["#e2483d", "#f08a2c", "#f2c230", "#6cb84a", "#2fa6a0", "#3b78d8", "#7a55c7", "#c44f9a"];
/** How wide a disc of a size is in a tower of `discs`. */
const radius = (size: number, discs: number) => 0.56 + ((size - 1) / Math.max(1, discs - 1)) * 0.98;
/**
 * A stand of dark wood with three brass pegs on a desk, and glazed discs
 * that are lifted off one peg, carried over and let down another.
 */
export class HanoiView extends TableView<State> {
  private discs: T.Mesh[] = [];
  private from: T.Mesh;
  private cursor: T.Mesh;
  private arrow = new T.Group();
  private lifted: number | null = null;
  /** The peg whose top disc the pointer carries, and where it is carried; then where it was let go, for the fall. */
  private held: { peg: number; on: number | null; x: number; y: number; dy: number } | null = null;
  private dropped: { x: number; y: number } | null = null;
  private turned = new Map<number, T.BufferGeometry>();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#d9cdb8");
    this.daylight("#fff8ec", "#8a6f52", "#fff0d2", 9, 2.2);
    const desk = this.own(wood(false, 0.6));
    desk.repeat.set(3, 3);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ map: desk, roughness: 0.75 }), 0, -0.2, 0).castShadow = false;
    const dark = this.standard({ map: this.own(wood(true)), roughness: 0.45 }),
      brass = this.standard({ color: "#c9a44a", roughness: 0.28, metalness: 0.85 });
    this.add(new T.BoxGeometry(11.4, BASE, 3.9), dark, 0, BASE / 2, 0);
    this.add(new T.BoxGeometry(11.8, 0.12, 4.3), dark, 0, 0.06, 0);
    for (const x of PEG_X) {
      this.add(new T.CylinderGeometry(0.1, 0.1, PEG_TALL, 20), brass, x, BASE + PEG_TALL / 2, 0);
      this.add(new T.SphereGeometry(0.15, 20, 14), brass, x, BASE + PEG_TALL, 0);
      this.add(new T.CylinderGeometry(0.3, 0.34, 0.08, 28), brass, x, BASE + 0.04, 0);
    }
    for (let i = 0; i < MAX; i++) {
      const disc = new T.Mesh(this.lathe(1), this.standard({ color: GLAZE[i], roughness: 0.25 }));
      disc.castShadow = disc.receiveShadow = true;
      disc.visible = false;
      this.discs.push(disc);
      this.scene.add(disc);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.from = ringMesh(own, 1.75, 1.92, "#ffb21f");
    this.cursor = ringMesh(own, 1.75, 1.9, "#3f8cff");
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffb21f", depthTest: false, transparent: true, opacity: 0.97, side: T.DoubleSide })),
      tip = new T.Mesh(this.own(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.46, 0.6), new T.Vector2(0.46, 0.6)]))), gold),
      shaft = new T.Mesh(this.own(new T.PlaneGeometry(0.28, 0.8)), gold);
    shaft.position.y = 0.98;
    shaft.renderOrder = tip.renderOrder = 9;
    this.arrow.add(shaft, tip);
    this.arrow.visible = false;
    this.scene.add(this.from, this.cursor, this.arrow);
    // The pointer is followed on the upright plane the pegs stand in.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), 0);
    this.begin();
  }
  /** A disc is carried by the pointer from its peg and let go over another: nothing moves by a tap. */
  /** How high a disc carried to a peg may come down on it: onto what lies there (its own place, on the peg it came from). */
  private floorOn(state: State, peg: number, from: number) {
    return BASE + (state.pegs[peg].length - (peg === from ? 1 : 0)) * THICK;
  }
  /** Whether the top disc of `from` may lie on `peg`. */
  private fits(state: State, from: number, peg: number) {
    return peg === from || state.pegs[from][state.pegs[from].length - 1] < (state.pegs[peg][state.pegs[peg].length - 1] ?? Infinity);
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null || point < 0 || point >= PEGS || !state.pegs[point].length) return false;
    // The disc stays where it lies until the pointer draws it up the peg.
    const y = this.floorOn(state, point, point);
    this.held = { peg: point, on: point, x: PEG_X[point], y, dy: y - at.y };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const held = this.held,
      state = this.state;
    if (!held || !state) return;
    const wantX = Math.max(-5.2, Math.min(5.2, at.x)),
      wantY = Math.min(this.above + 2.2, at.y + held.dy);
    if (held.on !== null) {
      // Threaded on a peg: it slides up and down, and comes free above the peg's top.
      held.x = PEG_X[held.on];
      held.y = Math.max(this.floorOn(state, held.on, held.peg), wantY);
      if (held.y >= this.above) held.on = null;
    }
    if (held.on === null) {
      held.x = wantX;
      const near = PEG_X.findIndex((x) => Math.abs(x - wantX) < 0.4);
      if (wantY >= this.above) held.y = wantY;
      else if (near >= 0 && this.fits(state, held.peg, near)) {
        // Brought down over a peg it may lie on: it goes onto that peg.
        held.on = near;
        held.x = PEG_X[near];
        held.y = Math.max(this.floorOn(state, near, held.peg), wantY);
      } else held.y = this.above;
    }
    this.place(state);
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const held = this.held,
      state = this.state;
    this.held = null;
    if (!held || !state) return;
    const to = !at ? held.peg : (held.on ?? PEG_X.reduce((best, x, peg) => (Math.abs(x - held.x) < Math.abs(PEG_X[best] - held.x) ? peg : best), 0));
    // Let go over its own peg, or over a smaller disc: it goes back where it was.
    if (to === held.peg || !this.fits(state, held.peg, to)) return this.place(state);
    this.dropped = { x: held.x, y: held.y };
    this.onMove({ from: held.peg, to, extra: -1 });
  }
  /** A disc of a width, turned on a lathe: flat faces, a rounded rim, and a hole through its middle for the peg. Made once for each width. */
  private lathe(r: number) {
    const key = Math.round(r * 1000);
    let geometry = this.turned.get(key);
    if (!geometry) {
      const hole = 0.17,
        profile = [[hole, 0], [r - 0.1, 0], [r - 0.02, 0.05], [r, 0.14], [r, THICK - 0.14], [r - 0.02, THICK - 0.05], [r - 0.1, THICK], [hole, THICK], [hole, 0]].map(([x, y]) => new T.Vector2(x, y));
      geometry = this.own(new T.LatheGeometry(profile, 56));
      this.turned.set(key, geometry);
    }
    return geometry;
  }
  /** Where the `level`-th disc from the bottom of a peg lies. */
  private rest(peg: number, level: number) {
    return { x: PEG_X[peg], y: BASE + level * THICK };
  }
  private readonly above = BASE + PEG_TALL + 0.35;
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.4 : 6.3, halfZ: 2.3, height: 6.8, lookY: 2.5, tilt: 0.4 };
  }
  protected spots(): Spot[] {
    // A peg is chosen anywhere along its height.
    return PEG_X.flatMap((x, point) => [0.6, 1.8, 3, 4.2].map((y) => ({ x, y, z: 0, r: 1.5, point })));
  }
  protected place(state: State) {
    this.discs.forEach((disc, i) => (disc.visible = i < state.discs));
    state.pegs.forEach((peg, p) =>
      peg.forEach((size, level) => {
        const disc = this.discs[size - 1],
          r = radius(size, state.discs),
          at = this.rest(p, level),
          // The top disc of the chosen peg hangs over it.
          top = level === peg.length - 1 && state.winner === null,
          up = top && this.lifted === p;
        disc.geometry = this.lathe(r);
        if (top && this.held?.peg === p) disc.position.set(this.held.x, this.held.y, 0);
        else disc.position.set(at.x, up ? this.above : at.y, 0);
      }),
    );
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.discs !== state.discs) return false;
    const size = state.pegs[last.to][state.pegs[last.to].length - 1],
      disc = this.discs[size - 1],
      start = this.lifted === last.from ? this.above : this.rest(last.from, before.pegs[last.from].length - 1).y,
      end = this.rest(last.to, state.pegs[last.to].length - 1),
      rise = start < this.above ? 170 : 0,
      ease = (p: number) => p * p * (3 - 2 * p),
      carried = this.dropped;
    this.lifted = null;
    this.dropped = null;
    this.held = null;
    this.place(before);
    if (carried !== null) {
      // Let go by the pointer: it slides over its peg and comes down.
      const slide = Math.abs(carried.x - end.x) > 0.01 ? 110 : 0;
      disc.position.set(carried.x, carried.y, 0);
      if (slide) this.tween(0, slide, (p) => (disc.position.x = carried.x + (end.x - carried.x) * ease(p)));
      this.tween(slide, 190, (p) => {
        disc.position.x = end.x;
        disc.position.y = carried.y + (end.y - carried.y) * p * p;
        if (p === 1) this.onContact();
      });
      return true;
    }
    disc.position.y = start;
    if (rise) this.tween(0, rise, (p) => (disc.position.y = start + (this.above - start) * ease(p)));
    this.tween(rise, 210, (p) => {
      disc.position.x = PEG_X[last.from] + (end.x - PEG_X[last.from]) * ease(p);
      disc.position.y = this.above + Math.sin(p * Math.PI) * 0.25;
    });
    this.tween(rise + 210, 190, (p) => {
      disc.position.x = end.x;
      disc.position.y = this.above + (end.y - this.above) * p * p;
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      lifted = marks.selected !== null && marks.selected >= 0 && marks.selected < PEGS ? marks.selected : null;
    if (lifted !== this.lifted) {
      this.lifted = lifted;
      if (state && !this.animating) this.place(state);
    }
    const ring = (mesh: T.Mesh, peg: number | null | undefined) => {
      mesh.visible = peg !== null && peg !== undefined && peg >= 0 && peg < PEGS;
      if (mesh.visible) mesh.position.set(PEG_X[peg!], BASE + 0.02, 0);
    };
    ring(this.cursor, marks.cursor);
    // A hint: a gold ring round the peg to take from, an arrow over the peg to put on.
    ring(this.from, marks.hint?.from);
    this.arrow.visible = !!marks.hint;
    if (marks.hint) this.arrow.position.set(PEG_X[marks.hint.to], this.above + 0.7, 0);
  }
}
