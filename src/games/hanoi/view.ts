import * as T from "three";
import { wood, glossy, block, capable } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { MOST, stageOf, type State } from "./rules";
import { flicker, temple, type Temple } from "./temple";

export const HANOI_COLORS: [string, string] = ["#c8553a", "#b9b3a4"];
/** Where the pegs stand: three as always, or four for the four-peg kind. */
export const pegXs = (count: number) => (count === 4 ? [-4.8, -1.6, 1.6, 4.8] : [-3.5, 0, 3.5]);
/** How thick a disc is, how tall a peg, the base, and the discs' glazes from the smallest up. */
const THICK = 0.38,
  PEG_TALL = 3.7,
  BASE = 0.3,
  GLAZE = ["#e2483d", "#f08a2c", "#f2c230", "#6cb84a", "#2fa6a0", "#3b78d8", "#7a55c7", "#c44f9a"];
/** How wide a disc of a size is in a tower of `discs`: narrower on four pegs, which stand closer. */
const radius = (size: number, discs: number, pegs: number) => {
  const [least, most] = pegs === 4 ? [0.5, 1.4] : [0.56, 1.54];
  return least + ((size - 1) / Math.max(1, discs - 1)) * (most - least);
};
/** A glaze with a fine crackle and a few specks, laid round a disc; its colour is the disc's own. */
function crackle(keep: <R extends { dispose(): void }>(r: R) => R) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const pen = c.getContext("2d")!;
  pen.fillStyle = "#ffffff";
  pen.fillRect(0, 0, 512, 64);
  let seed = 71;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  pen.strokeStyle = "rgba(60,40,30,0.16)";
  pen.lineWidth = 0.8;
  for (let i = 0; i < 70; i++) {
    let x = random() * 512,
      y = random() * 64;
    pen.beginPath();
    pen.moveTo(x, y);
    for (let k = 0; k < 4; k++) pen.lineTo((x += (random() - 0.5) * 40), (y += (random() - 0.5) * 18));
    pen.stroke();
  }
  for (let i = 0; i < 160; i++) {
    pen.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.35)" : "rgba(40,24,16,0.12)";
    pen.fillRect(random() * 512, random() * 64, 1.5, 1.5);
  }
  const texture = keep(new T.CanvasTexture(c));
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = T.RepeatWrapping;
  return texture;
}
/**
 * A stand of dark wood with brass pegs (three, or four) on the lacquered offering table of a temple hall at night
 * (`temple.ts`), and glazed discs with a gilt rim that are lifted off one peg, carried over in an arc and let down
 * another. A finished tower's discs hop one after another and shine.
 */
export class HanoiView extends TableView<State> {
  private discs: T.Group[] = [];
  private bodies: T.Mesh[] = [];
  private from: T.Mesh;
  private cursor: T.Mesh;
  private arrow = new T.Group();
  private lifted: number | null = null;
  /** The peg whose top disc the pointer carries, and where it is carried; then where it was let go, for the fall. */
  private held: { peg: number; on: number | null; x: number; y: number; dy: number } | null = null;
  private dropped: { x: number; y: number } | null = null;
  private turned = new Map<number, T.BufferGeometry>();
  private pegX: number[];
  private hall: Temple;
  private clock = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low", variant = "3") {
    super(host, quality, "#1a1410");
    this.pegX = pegXs(stageOf(variant).pegs);
    const half = this.pegX[this.pegX.length - 1] + 2.2;
    this.daylight("#ffe6c4", "#3a281c", "#ffe0b4", 10, 2.1);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.hall = temple(this.scene, own, (options) => this.standard(options), half);
    const dark = this.standard({ map: this.own(wood(true)), roughness: 0.45 }),
      brass = this.standard({ color: "#c9a44a", roughness: 0.28, metalness: 0.85 }),
      gilt = this.standard({ color: "#d9b25a", roughness: 0.3, metalness: 0.9 });
    // The stand: a dark base on a wider plinth, a gilt line along its front, a turned foot at each end.
    this.add(block(half * 2, BASE, 3.9), dark, 0, BASE / 2, 0);
    this.add(block(half * 2 + 0.4, 0.12, 4.3), dark, 0, 0.06, 0);
    this.add(new T.BoxGeometry(half * 2 - 0.3, 0.035, 0.03), gilt, 0, BASE * 0.6, 1.96).castShadow = false;
    for (const x of this.pegX) {
      this.add(new T.CylinderGeometry(0.1, 0.1, PEG_TALL, 20), brass, x, BASE + PEG_TALL / 2, 0);
      this.add(new T.SphereGeometry(0.15, 20, 14), brass, x, BASE + PEG_TALL, 0);
      this.add(new T.CylinderGeometry(0.3, 0.34, 0.08, 28), brass, x, BASE + 0.04, 0);
    }
    const glaze = crackle(own);
    for (let i = 0; i < MOST; i++) {
      const disc = new T.Group(),
        body = new T.Mesh(this.lathe(1), this.own(glossy({ color: GLAZE[i % GLAZE.length], map: glaze, roughness: 0.28 }))),
        rim = new T.Mesh(this.own(new T.TorusGeometry(1, 0.018, 6, 56).rotateX(Math.PI / 2)), gilt);
      body.castShadow = body.receiveShadow = true;
      rim.position.y = THICK - 0.05;
      rim.name = "rim";
      disc.add(body, rim);
      disc.visible = false;
      this.discs.push(disc);
      this.bodies.push(body);
      this.scene.add(disc);
    }
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
    // Candles flicker and smoke rises only where a graphics card draws and motion is welcome.
    if (capable() && !this.reducedMotion) this.clock = requestAnimationFrame(this.idle);
  }
  private idle = (now: number) => {
    if (this.disposed) return;
    flicker(this.hall, now / 1000, this.camera);
    this.redraw();
    this.clock = requestAnimationFrame(this.idle);
  };
  dispose() {
    cancelAnimationFrame(this.clock);
    super.dispose();
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
    if (!state || state.winner !== null || point < 0 || point >= this.pegX.length || !state.pegs[point].length) return false;
    // The disc stays where it lies until the pointer draws it up the peg.
    const y = this.floorOn(state, point, point);
    this.held = { peg: point, on: point, x: this.pegX[point], y, dy: y - at.y };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const held = this.held,
      state = this.state;
    if (!held || !state) return;
    const edge = this.pegX[this.pegX.length - 1] + 1.7,
      wantX = Math.max(-edge, Math.min(edge, at.x)),
      wantY = Math.min(this.above + 2.2, at.y + held.dy);
    if (held.on !== null) {
      // Threaded on a peg: it slides up and down, and comes free above the peg's top.
      held.x = this.pegX[held.on];
      held.y = Math.max(this.floorOn(state, held.on, held.peg), wantY);
      if (held.y >= this.above) held.on = null;
    }
    if (held.on === null) {
      held.x = wantX;
      const near = this.pegX.findIndex((x) => Math.abs(x - wantX) < 0.4);
      if (wantY >= this.above) held.y = wantY;
      else if (near >= 0 && this.fits(state, held.peg, near)) {
        // Brought down over a peg it may lie on: it goes onto that peg.
        held.on = near;
        held.x = this.pegX[near];
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
    const to = !at ? held.peg : (held.on ?? this.pegX.reduce((best, x, peg) => (Math.abs(x - held.x) < Math.abs(this.pegX[best] - held.x) ? peg : best), 0));
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
    return { x: this.pegX[peg], y: BASE + level * THICK };
  }
  private readonly above = BASE + PEG_TALL + 0.35;
  protected subject(aspect: number): TableSubject {
    const wide = this.pegX.length === 4 ? 1.3 : 0;
    return { half: (aspect < 1 ? 5.4 : 6.3) + wide, halfZ: 2.3, height: 6.8, lookY: 2.5, tilt: 0.4 };
  }
  protected spots(): Spot[] {
    // A peg is chosen anywhere along its height.
    return this.pegX.flatMap((x, point) => [0.6, 1.8, 3, 4.2].map((y) => ({ x, y, z: 0, r: this.pegX.length === 4 ? 1.35 : 1.5, point })));
  }
  /** Gives each disc the width it has in this tower, and lays it level. */
  private shape(state: State, size: number) {
    const disc = this.discs[size - 1],
      r = radius(size, state.discs, state.pegs.length);
    this.bodies[size - 1].geometry = this.lathe(r);
    disc.getObjectByName("rim")!.scale.set(r - 0.06, 1, r - 0.06);
    disc.rotation.set(0, 0, 0);
    disc.scale.setScalar(1);
    (this.bodies[size - 1].material as T.MeshStandardMaterial).emissive.setRGB(0, 0, 0);
    return disc;
  }
  protected place(state: State) {
    this.discs.forEach((disc, i) => (disc.visible = i < state.discs));
    state.pegs.forEach((peg, p) =>
      peg.forEach((size, level) => {
        const disc = this.shape(state, size),
          at = this.rest(p, level),
          // The top disc of the chosen peg hangs over it.
          top = level === peg.length - 1 && state.winner === null,
          up = top && this.lifted === p;
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
      ease = (p: number) => p * p * (3 - 2 * p),
      carried = this.dropped;
    this.lifted = null;
    this.dropped = null;
    this.held = null;
    this.place(before);
    /** Down the peg to its place, quickening, with a small bounce and a knock as it lands. */
    const settle = (delay: number, fromY: number) => {
      const drop = Math.max(0.01, fromY - end.y),
        time = 120 + Math.sqrt(drop) * 70;
      this.tween(delay, time, (p) => {
        disc.position.x = end.x;
        disc.position.y = end.y + drop * (1 - p * p);
        if (p === 1) this.onContact();
      });
      this.tween(delay + time, 110, (p) => (disc.position.y = end.y + Math.sin(Math.PI * p) * Math.min(0.05, drop * 0.03)));
      return delay + time + 110;
    };
    let done: number;
    if (carried !== null) {
      // Let go by the pointer: it slides over its peg and comes down.
      const slide = Math.abs(carried.x - end.x) > 0.01 ? 110 : 0;
      disc.position.set(carried.x, carried.y, 0);
      if (slide) this.tween(0, slide, (p) => (disc.position.x = carried.x + (end.x - carried.x) * ease(p)));
      done = settle(slide, carried.y);
    } else {
      // Drawn up its peg, then carried over in an arc that rises with the distance, leaning into the way it goes.
      const rise = start < this.above ? 150 + (this.above - start) * 22 : 0,
        span = this.pegX[last.to] - this.pegX[last.from],
        flight = 260 + Math.abs(span) * 26,
        arc = 0.45 + Math.abs(span) * 0.09;
      disc.position.y = start;
      if (rise) this.tween(0, rise, (p) => (disc.position.y = start + (this.above - start) * ease(p)));
      this.tween(rise, flight, (p) => {
        const e = ease(p);
        disc.position.x = this.pegX[last.from] + span * e;
        disc.position.y = this.above + Math.sin(Math.PI * p) * arc;
        disc.rotation.z = -Math.sign(span) * Math.sin(Math.PI * p) * 0.16;
      });
      done = settle(rise + flight, this.above);
    }
    if (state.winner === 0 && before.winner === null) this.cheer(state, last.to, done);
    return true;
  }
  /** The tower is home: from the top down each disc hops and glows warm, and a chime is heard. */
  private cheer(state: State, peg: number, delay: number) {
    const tower = state.pegs[peg],
      wait = 90;
    this.tween(delay, 10, (p) => p === 1 && this.onKnock?.("pocket", 1));
    tower
      .slice()
      .reverse()
      .forEach((size, k) => {
        const disc = this.discs[size - 1],
          body = this.bodies[size - 1].material as T.MeshStandardMaterial,
          y = this.rest(peg, tower.length - 1 - k).y;
        this.tween(delay + k * wait, 420, (p) => {
          disc.position.y = y + Math.sin(Math.PI * p) * 0.32;
          disc.rotation.y = p * Math.PI * 0.5;
          body.emissive.setRGB(0.32, 0.22, 0.06).multiplyScalar(Math.sin(Math.PI * p));
        });
      });
  }
  protected mark(marks: Marks) {
    const state = this.state,
      count = this.pegX.length,
      lifted = marks.selected !== null && marks.selected >= 0 && marks.selected < count ? marks.selected : null;
    if (lifted !== this.lifted) {
      this.lifted = lifted;
      if (state && !this.animating) this.place(state);
    }
    const ring = (mesh: T.Mesh, peg: number | null | undefined) => {
      mesh.visible = peg !== null && peg !== undefined && peg >= 0 && peg < count;
      if (mesh.visible) {
        mesh.position.set(this.pegX[peg!], BASE + 0.02, 0);
        mesh.scale.setScalar(count === 4 ? 0.85 : 1);
      }
    };
    ring(this.cursor, marks.cursor);
    // A hint: a gold ring round the peg to take from, an arrow over the peg to put on.
    ring(this.from, marks.hint?.from);
    this.arrow.visible = !!marks.hint;
    if (marks.hint) this.arrow.position.set(this.pegX[marks.hint.to], this.above + 0.7, 0);
  }
}
