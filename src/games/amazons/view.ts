import * as T from "three";
import { block, glossy, veneer, wood } from "../../engine/scene-utils";
import { jungle } from "../../engine/scenery";
import { queenFigure, queenShapes, type QueenShapes } from "../queens/queen";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BURNT, N, type State } from "./rules";

export const AMAZON_COLORS: [string, string] = ["#ecdcb4", "#1d1a18"];
const S = 0.7;
export const AMAZON_SUBJECT: TableSubject = { half: 4.0, halfZ: 4.0, height: 1.15, lookY: 0, tilt: 1.08 };
/** The queens of 체스판의 퀸 stand here a little smaller, for the smaller squares (the user asked for that queen). */
const QUEEN = 0.78;
/** An arrow's length, half the bow's height, and the height the bow is held at (about an amazon's shoulder). */
const ARROW = 0.6,
  BOW = 0.42,
  HAND = 0.7;
const UP = new T.Vector3(0, 1, 0),
  FORWARD = new T.Vector3(1, 0, 0);
/** Where the middle of an arrow stuck in a square stands (from the square's middle): back along the way it came, its head in the plug. */
const stuckOffset = (yaw: number, pitch: number) => {
  const half = ARROW / 2 - 0.05;
  return new T.Vector3(-Math.cos(yaw) * Math.cos(pitch) * half, 0.05 + Math.sin(pitch) * half, -Math.sin(yaw) * Math.cos(pitch) * half);
};
/** The centre of a square. */
export const squareAt = (s: number) => ({ x: ((s % N) - 4.5) * S, z: (Math.floor(s / N) - 4.5) * S });
/**
 * A board of maple and walnut squares in a dark frame on a mossy stone slab in a rainforest clearing (`jungle`), four
 * amazons a side as the boxwood and ebony queens of 체스판의 퀸, and burnt squares where arrows have struck.
 */
export class AmazonsView extends TableView<State> {
  private amazons = new T.Group();
  private arrows = new T.Group();
  private shapes: QueenShapes;
  private point: T.BufferGeometry;
  private paints: T.Material[];
  private char: T.BufferGeometry;
  private burnt: T.Material;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  private landing: T.Mesh;
  /** The bow an amazon draws to shoot, its string, and the shapes and paints of an arrow (shaft, head, three vanes). */
  private bow = new T.Group();
  private strings: T.Mesh[] = [];
  private kit: { shaft: T.BufferGeometry; head: T.BufferGeometry; vane: T.BufferGeometry; wood: T.Material; steel: T.Material; feather: T.Material[] };
  /** Which way the arrow stuck in a square leans and how steeply, as it flew there (one not seen flying leans a way of its own). */
  private leans = new Map<number, { yaw: number; pitch: number }>();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2c4a26");
    this.daylight("#f2ffe0", "#2c3a22", "#fff3d6", 7, 2.3);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // A clearing in a jungle (the user asked), the board on a stone slab in it.
    jungle(this.scene, keep, (N * S) / 2 + 0.95, (N * S) / 2 + 0.95, -0.2);
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
    this.shapes = queenShapes(keep);
    this.point = keep(new T.ConeGeometry(0.035, 0.1, 8));
    // Boxwood and ebony, as in 체스판의 퀸 (the lathe shells are open, so both sides are painted).
    this.paints = AMAZON_COLORS.map((color) => keep(glossy({ color, roughness: 0.4, side: T.DoubleSide })));
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
    // An arrow: an ash shaft, a steel head and three vanes of red and white feather (it points along +x).
    this.kit = {
      shaft: keep(new T.CylinderGeometry(0.016, 0.016, ARROW, 8).rotateZ(Math.PI / 2)),
      head: keep(new T.ConeGeometry(0.034, 0.1, 4).rotateZ(-Math.PI / 2)),
      vane: keep(new T.PlaneGeometry(0.15, 0.05).translate(0, 0.03, 0)),
      wood: this.standard({ color: "#c9a06a", roughness: 0.6 }),
      steel: this.standard({ color: "#9aa3ad", roughness: 0.3, metalness: 0.8 }),
      feather: ["#c8321f", "#f2ede2", "#c8321f"].map((color) => this.standard({ color, roughness: 0.8, side: T.DoubleSide })),
    };
    // The bow: a recurved stave of dark wood with a leather grip, and its string in two runs to the nock.
    const stave = new T.QuadraticBezierCurve3(new T.Vector3(-0.07, BOW, 0), new T.Vector3(0.2, 0, 0), new T.Vector3(-0.07, -BOW, 0)),
      limb = this.add(new T.TubeGeometry(stave, 24, 0.016, 6), this.standard({ color: "#5a3420", roughness: 0.5 }), 0, 0, 0, this.bow);
    limb.castShadow = true;
    this.add(new T.CylinderGeometry(0.024, 0.024, 0.11, 8), this.standard({ color: "#2a1a12", roughness: 0.8 }), 0.065, 0, 0, this.bow);
    const cord = keep(new T.CylinderGeometry(0.0045, 0.0045, 1, 5).translate(0, 0.5, 0)),
      linen = this.standard({ color: "#f2ead8", roughness: 0.7 });
    for (let k = 0; k < 2; k++) {
      const run = new T.Mesh(cord, linen);
      this.bow.add(run);
      this.strings.push(run);
    }
    this.bow.visible = false;
    this.scene.add(this.bow);
    this.begin();
  }
  /** An arrow: shaft, head at the front (+x) and three vanes at the back. */
  private arrowModel() {
    const g = new T.Group(),
      { shaft, head, vane, wood, steel, feather } = this.kit;
    g.add(new T.Mesh(shaft, wood));
    const tip = new T.Mesh(head, steel);
    tip.position.x = ARROW / 2 + 0.04;
    g.add(tip);
    feather.forEach((paint, k) => {
      const v = new T.Mesh(vane, paint);
      v.position.x = -ARROW / 2 + 0.08;
      v.rotation.x = (k * Math.PI * 2) / 3;
      g.add(v);
    });
    g.traverse((o) => ((o as T.Mesh).castShadow = true));
    return g;
  }
  /** The bow's string drawn back `draw` from its rest, its two runs from the tips to the nock. */
  private drawString(draw: number) {
    const nock = new T.Vector3(-0.07 - draw, 0, 0);
    [BOW, -BOW].forEach((y, k) => {
      const from = new T.Vector3(-0.07, y, 0),
        way = nock.clone().sub(from),
        run = this.strings[k];
      run.position.copy(from);
      run.scale.set(1, way.length(), 1);
      run.quaternion.setFromUnitVectors(UP, way.normalize());
    });
  }
  /** An amazon: the turned queen of 체스판의 퀸, in boxwood or ebony. */
  private amazon(side: number) {
    const g = queenFigure(this.shapes, this.paints[side]);
    g.scale.setScalar(QUEEN);
    return g;
  }
  /** A square an arrow has struck: a charred plug set into the board, with the arrow standing in it, leaning back the way it came. */
  private arrow(s: number) {
    const p = squareAt(s),
      g = new T.Group(),
      mesh = new T.Mesh(this.char, this.burnt);
    mesh.position.y = 0.02;
    mesh.receiveShadow = true;
    g.add(mesh);
    const stuck = this.arrowModel(),
      { yaw, pitch } = this.leans.get(s) ?? { yaw: ((s * 137) % 360) * (Math.PI / 180), pitch: 0.95 };
    // Head down in the plug: the arrow's +x turned down by its pitch and toward where it flew.
    stuck.quaternion.setFromEuler(new T.Euler(0, -yaw, -pitch, "YXZ"));
    stuck.position.copy(stuckOffset(yaw, pitch));
    g.add(stuck);
    g.position.set(p.x, 0.02, p.z);
    return g;
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
      // The arrow: the amazon raises a bow, draws it, and an arrow flies in an arc to its square and sticks there.
      flying = this.arrowModel(),
      yaw = Math.atan2(c.z - b.z, c.x - b.x),
      reach = Math.hypot(c.x - b.x, c.z - b.z),
      hand = new T.Vector3(b.x + Math.cos(yaw) * 0.32, HAND, b.z + Math.sin(yaw) * 0.32),
      rise = 0.35 + reach * 0.06,
      // It comes down as steeply as its arc does at the end, and stays in the square at that angle.
      pitch = Math.atan2(Math.PI * rise + HAND, reach),
      end = stuckOffset(yaw, pitch).add(new T.Vector3(c.x, 0.02, c.z)),
      at = (t: number) => new T.Vector3().lerpVectors(hand, end, t).setY(hand.y + (end.y - hand.y) * t + Math.sin(Math.PI * t) * rise);
    flying.visible = false;
    this.scene.add(flying);
    this.leans.set(last.arrow, { yaw, pitch });
    const glide = 220 + far * 90,
      raise = 180,
      pull = 320,
      flight = 260 + reach * 55,
      // The bow faces the square to be shot, upright, its string toward the amazon.
      aimBow = (scale: number, draw: number) => {
        this.bow.visible = scale > 0.01;
        this.bow.position.copy(hand);
        this.bow.rotation.set(0, -yaw, 0);
        this.bow.scale.setScalar(Math.max(0.01, scale));
        this.drawString(draw);
      };
    this.tween(0, glide, (p) => {
      const e = p * p * (3 - 2 * p);
      mover.position.set(a.x + (b.x - a.x) * e, 0.02 + Math.sin(Math.PI * p) * 0.25, a.z + (b.z - a.z) * e);
      if (p === 1) this.onContact();
    });
    // The bow comes up with an arrow on the string, and is drawn.
    this.tween(glide + 40, raise, (p) => {
      aimBow(p, 0);
      flying.visible = true;
      flying.position.copy(hand).add(new T.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(ARROW / 2 - 0.07));
      flying.rotation.set(0, -yaw, 0);
    });
    this.tween(glide + 40 + raise, pull, (p) => {
      const draw = 0.22 * (1 - (1 - p) ** 2);
      aimBow(1, draw);
      flying.position.copy(hand).add(new T.Vector3(Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(ARROW / 2 - 0.07 - draw));
    });
    // Let go: it flies along its arc, pointing the way it goes, and the string twangs back.
    const loosed = glide + 40 + raise + pull;
    this.tween(loosed, flight, (p) => {
      const here = at(p),
        ahead = at(Math.min(1, p + 0.02)),
        way = p < 1 ? ahead.sub(here) : at(1).sub(at(0.98));
      flying.position.copy(here);
      flying.quaternion.setFromUnitVectors(FORWARD, way.normalize());
      if (p === 1) {
        flying.removeFromParent();
        this.arrows.add(this.arrow(last.arrow));
        this.onContact();
      }
    });
    this.tween(loosed, 260, (p) => aimBow(1, 0.22 * Math.cos(p * Math.PI * 3) * (1 - p) * 0.4));
    this.tween(loosed + 300, 220, (p) => aimBow(1 - p, 0));
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
