import * as T from "three";
import { capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot } from "../table/view";
import { COMPLAINTS, COUNT, complaint, judge, lineOf, step, type State } from "./rules";
import { ARROW, DIR_XZ, FRAME_CORNER, GUTTER_Y, MARBLE_R, PICK_Y, PLATEAU, REST_Y, STEP, TOP, arrowAt, bowlSlot, cellAt, gutterAt, pushSubject } from "./layout";
import { buildBoard } from "./board";
import { PUSH_COLORS, marbleKit } from "./marbles";
import { gardenRoom } from "./room";

/** Spots of the direction arrows are numbered from here: `ARROWS + dir`. */
export const ARROWS = 100;
/** How long a move slides, how long a marble pushed off takes to tip over into the gutter, and to run out into its bowl. */
const SLIDE = 340,
  TIP = 300,
  OUT = 420;
/** How far a chosen marble is lifted out of its cup. */
const LIFT = 0.07;
/** Keys that move the chosen group: W E up-left and up-right, A D left and right, Z X down-left and down-right (by `code`, so that a Korean keyboard works too). */
const DIR_KEYS: Record<string, number> = { KeyE: 1, KeyW: 2, KeyA: 3, KeyD: 0, KeyZ: 4, KeyX: 5 };
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
/** The gutter's middle line, sampled: points and the distance along from the right corner. */
const LOOP = (() => {
  const n = 720,
    points = Array.from({ length: n }, (_, i) => gutterAt(i / n));
  return { n, points };
})();
/** The inside of the plateau's hexagon: how far from the middle along a direction its edge is, from a point. */
function toEdge(x: number, z: number, dx: number, dz: number) {
  let best = Infinity;
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3,
      nx = Math.cos(a),
      nz = -Math.sin(a),
      along = dx * nx + dz * nz;
    if (along <= 1e-6) continue;
    best = Math.min(best, (PLATEAU.apothem - (x * nx + z * nz)) / along);
  }
  return best;
}
/** A flat arrow pointing along +x, lying on the table plane. */
function arrowShape(length: number, width: number) {
  const s = new T.Shape(),
    shaft = width * 0.36,
    neck = length * 0.06;
  s.moveTo(-length / 2, -shaft / 2);
  s.lineTo(neck, -shaft / 2);
  s.lineTo(neck, -width / 2);
  s.lineTo(length / 2, 0);
  s.lineTo(neck, width / 2);
  s.lineTo(neck, shaft / 2);
  s.lineTo(-length / 2, shaft / 2);
  s.closePath();
  return new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
}
/**
 * 구슬 밀기's table: a turned stone board with 61 cups and a gutter round it, amber glass and lapis marbles, and a
 * bowl at either corner for the marbles pushed off. The view does the choosing itself: a press on one's own marble
 * picks it, a press on another in line (or a drag across them) makes a group of up to three, and a press on a cell
 * or on one of the six arrows round the group makes the move, reported whole through `onMove` (a refused one is told
 * in words by the screen's `refusal`). Enter presses the cell under the keyboard's cursor; W E A D Z X move the group.
 */
export class PushView extends TableView<State> {
  private marbles: (T.Mesh | null)[] = Array.from({ length: COUNT }, () => null);
  private bowls: [T.Mesh[], T.Mesh[]] = [[], []];
  private ball: T.BufferGeometry;
  private paints: [T.Material, T.Material];
  /** The marbles chosen, in line, from one end to the other. */
  private group: number[] = [];
  private press: { cell: number; point: number; moved: boolean } | null = null;
  private hovered = -1;
  private chosenRings: T.Mesh[] = [];
  private extendRings: T.Mesh[] = [];
  private cursorRing: T.Mesh;
  private arrows: { root: T.Group; fill: T.MeshBasicMaterial; legal: boolean }[] = [];
  private ghost: T.InstancedMesh;
  private trail: T.InstancedMesh;
  private live: boolean;
  private ticking = 0;
  private shaking = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private readonly mode: "local" | "ai",
  ) {
    super(host, quality, "#e6ece9");
    const rich = capable(),
      own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.live = rich && !this.reducedMotion;
    const sun = this.daylight("#fff8ec", "#b9ab95", "#fff2da", 9, 2.15);
    sun.position.set(-5, 12, 6);
    if (!rich) sun.shadow.mapSize.set(1024, 1024);
    gardenRoom(this.scene, own, rich);
    this.scene.add(buildBoard(own, rich));
    ({ ball: this.ball, paints: this.paints } = marbleKit(own, rich, MARBLE_R));
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -PICK_Y);
    for (let i = 0; i < 3; i++) {
      const ring = ringMesh(own, 0.25, 0.32, "#ffd24a");
      this.chosenRings.push(ring);
      this.scene.add(ring);
    }
    for (let i = 0; i < 6; i++) {
      const ring = ringMesh(own, 0.26, 0.3, "#ffffff");
      (ring.material as T.MeshBasicMaterial).opacity = 0.75;
      this.extendRings.push(ring);
      this.scene.add(ring);
    }
    this.cursorRing = ringMesh(own, 0.33, 0.4, "#ffffff");
    this.scene.add(this.cursorRing);
    const shape = own(arrowShape(ARROW.length, ARROW.width)),
      shadow = own(new T.MeshBasicMaterial({ color: "#1c1408", transparent: true, opacity: 0.42, depthWrite: false }));
    for (let d = 0; d < 6; d++) {
      const root = new T.Group(),
        fill = own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.95, depthWrite: false })),
        under = new T.Mesh(shape, shadow),
        over = new T.Mesh(shape, fill);
      under.scale.setScalar(1.22);
      under.position.y = -0.004;
      under.renderOrder = 7;
      over.renderOrder = 8;
      root.add(under, over);
      root.visible = false;
      root.rotation.y = Math.atan2(-DIR_XZ[d].z, DIR_XZ[d].x);
      this.scene.add(root);
      this.arrows.push({ root, fill, legal: false });
    }
    const dots = (color: string, radius: number, opacity: number, count: number) => {
      const mesh = new T.InstancedMesh(own(new T.CircleGeometry(radius, 24).rotateX(-Math.PI / 2)), own(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })), count);
      mesh.count = 0;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.ghost = dots("#ffffff", 0.2, 0.5, 4);
    this.trail = dots("#ffffff", 0.08, 0.8, 4);
    this.renderer.domElement.addEventListener("keydown", this.keys);
    this.begin();
    if (this.live) this.ticking = requestAnimationFrame(this.tick);
  }
  protected subject(aspect: number) {
    return pushSubject(aspect);
  }
  /** Whether a person may choose now: the screen offers moves only then (its marks list the marbles that can move). */
  private get open() {
    return !!this.state && this.state.winner === null && this.marks.movable.length > 0 && !this.animating && !(this.mode === "ai" && this.state.turn === 1);
  }
  protected spots(): Spot[] {
    const spots: Spot[] = [];
    for (let c = 0; c < COUNT; c++) {
      const p = cellAt(c);
      spots.push({ x: p.x, y: TOP + (this.state?.cells[c] !== null ? 0.2 : 0.02), z: p.z, r: 0.34, point: c });
    }
    if (this.group.length) for (let d = 0; d < 6; d++) spots.push({ ...arrowAt(this.group, d), r: 0.27, point: ARROWS + d });
    return spots;
  }
  /** The cell under a place on the plateau, or -1. */
  private cellUnder(at: { x: number; z: number }) {
    let best = -1,
      nearest = STEP * 0.6;
    for (let c = 0; c < COUNT; c++) {
      const p = cellAt(c),
        d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < nearest) {
        nearest = d;
        best = c;
      }
    }
    return best;
  }
  private newMarble(owner: 0 | 1, seed: number) {
    const mesh = new T.Mesh(this.ball, this.paints[owner]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Each marble lies its own way round.
    mesh.rotation.set(seed * 1.7, seed * 2.3, seed * 0.9);
    this.scene.add(mesh);
    return mesh;
  }
  protected place(state: State) {
    state.cells.forEach((owner, c) => {
      let mesh = this.marbles[c];
      if (owner === null) {
        if (mesh) {
          this.scene.remove(mesh);
          this.marbles[c] = null;
        }
        return;
      }
      if (!mesh) mesh = this.marbles[c] = this.newMarble(owner, c);
      mesh.material = this.paints[owner];
      const p = cellAt(c);
      mesh.position.set(p.x, REST_Y, p.z);
    });
    for (const side of [0, 1] as const) {
      const list = this.bowls[side],
        count = state.lost[side ? 0 : 1];
      while (list.length > count) this.scene.remove(list.pop()!);
      while (list.length < count) list.push(this.newMarble(side ? 0 : 1, 70 + side * 7 + list.length));
      list.forEach((mesh, k) => {
        const slot = bowlSlot(side, k);
        mesh.material = this.paints[side ? 0 : 1];
        mesh.position.set(slot.x, slot.y, slot.z);
      });
    }
    this.drawTrail(state);
    this.renderer.domElement.dataset.cells = state.cells.map((o) => (o === null ? "." : o)).join("");
    this.renderer.domElement.dataset.lost = state.lost.join(",");
    this.refresh();
  }
  /** Small dots where the last move's marbles set off from (the cells it left empty), in the mover's colour. */
  private drawTrail(state: State) {
    const last = state.last;
    this.trail.count = 0;
    if (!last || capturing() || this.animating) return;
    const left = last.group.filter((c) => state.cells[c] === null),
      m = new T.Matrix4();
    left.forEach((c, k) => {
      const p = cellAt(c);
      this.trail.setMatrixAt(k, m.makeTranslation(p.x, TOP + 0.004, p.z));
    });
    this.trail.count = left.length;
    this.trail.instanceMatrix.needsUpdate = true;
    (this.trail.material as T.MeshBasicMaterial).color.set(PUSH_COLORS[last.side]).lerp(new T.Color("#ffffff"), 0.35);
  }
  sync(state: State, animate = true) {
    if (state !== this.state) {
      this.group = [];
      this.press = null;
    }
    super.sync(state, animate);
  }
  /** Turns a marble as it rolls along the table by (dx, dz). */
  private roll(mesh: T.Object3D, dx: number, dz: number) {
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-6) return;
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(dz / distance, 0, -dx / distance), distance / MARBLE_R);
    mesh.quaternion.premultiply(q);
  }
  /** Calls `fn` once, the first time a tween's frame reaches it. */
  private once(at: number, fn: () => void) {
    let done = false;
    this.tween(at, 1, () => {
      if (done) return;
      done = true;
      fn();
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    const cells = [...last.group, ...last.pushed],
      meshes = cells.map((c) => this.marbles[c]);
    if (meshes.some((m) => !m)) return false;
    this.group = [];
    this.trail.count = 0;
    this.ghost.count = 0;
    const next = this.marbles.slice();
    for (const c of cells) next[c] = null;
    cells.forEach((c, i) => {
      if (c !== last.off) next[step(c, last.dir)] = meshes[i];
    });
    this.marbles = next;
    const pushing = last.pushed.length > 0;
    cells.forEach((c, i) => {
      const mesh = meshes[i]!,
        from = cellAt(c),
        pushed = i >= last.group.length;
      if (c === last.off) return this.pushOff(mesh, from, last.dir, last.side, before.lost[last.side ? 0 : 1]);
      const to = cellAt(step(c, last.dir)),
        start = pushed ? 45 : 0;
      let prev = 0;
      this.tween(start, SLIDE - start, (p) => {
        const e = ease(p);
        mesh.position.set(from.x + (to.x - from.x) * e, REST_Y + (pushed ? 0 : Math.sin(Math.PI * e) * 0.02), from.z + (to.z - from.z) * e);
        this.roll(mesh, (e - prev) * (to.x - from.x), (e - prev) * (to.z - from.z));
        prev = e;
      });
    });
    // The click of the group meeting the row it pushes, and the marbles settling in their cups.
    if (pushing) this.once(45, () => this.onKnock?.("disc", Math.min(1, 0.45 + last.pushed.length * 0.2)));
    this.once(SLIDE - 30, () => this.onContact());
    return true;
  }
  /**
   * The marble pushed over the edge: it rolls with the row to the plateau's edge, tips over into the gutter, runs
   * round the gutter to the corner of the side that pushed it, out through the let-down rim and into that side's bowl,
   * where it settles at its place in the ring (`slot`, the marbles that side had pushed off before).
   */
  private pushOff(mesh: T.Mesh, from: { x: number; z: number }, dir: number, side: 0 | 1, slot: number) {
    const d = DIR_XZ[dir],
      edge = toEdge(from.x, from.z, d.x, d.z),
      over = { x: from.x + d.x * (edge + MARBLE_R * 0.35), z: from.z + d.z * (edge + MARBLE_R * 0.35) };
    // Where it lands in the gutter: the nearest point of its middle line.
    let land = 0,
      nearest = Infinity;
    LOOP.points.forEach((p, i) => {
      const dd = Math.hypot(p.x - over.x - d.x * 0.15, p.z - over.z - d.z * 0.15);
      if (dd < nearest) {
        nearest = dd;
        land = i;
      }
    });
    // Round the gutter the short way to the corner of the bowl: the right one (index 0) for side 0, the left one for side 1.
    const goal = side === 0 ? 0 : LOOP.n / 2,
      forward = (goal - land + LOOP.n) % LOOP.n,
      way = forward <= LOOP.n / 2 ? 1 : -1,
      count = way > 0 ? forward : LOOP.n - forward,
      path: { x: number; z: number }[] = [];
    for (let k = 0; k <= count; k++) path.push(LOOP.points[(land + way * k + LOOP.n) % LOOP.n]);
    const lengths = [0];
    for (let k = 1; k < path.length; k++) lengths.push(lengths[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].z - path[k - 1].z));
    const total = lengths[lengths.length - 1],
      round = Math.min(1500, Math.max(180, total * 190)),
      landing = path[0];
    const sign = side === 0 ? 1 : -1,
      lip = { x: sign * (FRAME_CORNER - 0.02), z: 0 },
      rest = bowlSlot(side, slot);
    let at = { x: from.x, z: from.z };
    const moveTo = (x: number, y: number, z: number) => {
      this.roll(mesh, x - at.x, z - at.z);
      at = { x, z };
      mesh.position.set(x, y, z);
    };
    // With the row to the edge.
    this.tween(45, SLIDE - 45, (p) => {
      const e = ease(p);
      moveTo(from.x + (over.x - from.x) * e, REST_Y, from.z + (over.z - from.z) * e);
    });
    // Over the edge and down into the gutter, with a small bounce.
    this.tween(SLIDE, TIP, (p) => {
      const fall = Math.min(1, p / 0.7),
        bounce = p > 0.7 ? Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.05 : 0;
      moveTo(over.x + (landing.x - over.x) * Math.sqrt(fall), REST_Y + (GUTTER_Y - REST_Y) * fall * fall + bounce, over.z + (landing.z - over.z) * Math.sqrt(fall));
    });
    this.once(SLIDE + TIP * 0.7, () => this.onKnock?.("cushion", 0.9));
    // Round the gutter, slowing as it nears the corner.
    this.tween(SLIDE + TIP, round, (p) => {
      // Quick at first, easing as it nears the corner.
      const along = Math.min(total, Math.max(0, total * (1 - (1 - p) * (1 - p) * 0.35 - (1 - p) * 0.65)));
      let k = 1;
      while (k < lengths.length - 1 && lengths[k] < along) k++;
      const a = path[k - 1] ?? path[0],
        b = path[k] ?? path[0],
        span = lengths[k] - lengths[k - 1] || 1,
        t = Math.min(1, Math.max(0, (along - lengths[k - 1]) / span));
      moveTo(a.x + (b.x - a.x) * t, GUTTER_Y, a.z + (b.z - a.z) * t);
    });
    // Out over the let-down rim and into the bowl.
    const start = SLIDE + TIP + round;
    this.tween(start, OUT, (p) => {
      const corner = path[path.length - 1];
      if (p < 0.4) {
        const q = p / 0.4;
        moveTo(corner.x + (lip.x - corner.x) * q, GUTTER_Y, corner.z + (lip.z - corner.z) * q);
        return;
      }
      const q = (p - 0.4) / 0.6,
        fall = Math.min(1, q / 0.75),
        bounce = q > 0.75 ? Math.sin(((q - 0.75) / 0.25) * Math.PI) * 0.035 : 0;
      // A little arc over the bowl's lip, then down onto its floor.
      moveTo(lip.x + (rest.x - lip.x) * Math.sqrt(fall), GUTTER_Y + (rest.y - GUTTER_Y) * fall * fall + Math.sin(Math.PI * fall) * 0.07 + bounce, lip.z + (rest.z - lip.z) * Math.sqrt(fall));
    });
    this.once(start + OUT * (0.4 + 0.6 * 0.75), () => this.onKnock?.("pocket", 0.7));
    // From now on it belongs to the bowl.
    this.bowls[side].push(mesh);
  }
  /** Lifts the chosen marbles, sets the rings, the arrows and the ghost of the move hovered. */
  private refresh() {
    const state = this.state;
    if (!state) return;
    if (!this.open && !this.animating) this.group = [];
    const group = this.group,
      hide = capturing();
    if (!this.animating)
      this.marbles.forEach((mesh, c) => {
        if (mesh) mesh.position.y = REST_Y + (group.includes(c) ? LIFT : 0);
      });
    this.chosenRings.forEach((ring, i) => {
      const c = group[i];
      ring.visible = c !== undefined && !hide;
      if (c !== undefined) ring.position.set(cellAt(c).x, TOP + 0.012, cellAt(c).z);
    });
    // Marbles of mine that would lengthen the group.
    const longer = group.length && group.length < 3 ? this.extensions() : [];
    this.extendRings.forEach((ring, i) => {
      const c = longer[i];
      ring.visible = c !== undefined && !hide;
      if (c !== undefined) ring.position.set(cellAt(c).x, TOP + 0.012, cellAt(c).z);
    });
    const legal: number[] = [];
    this.arrows.forEach((arrow, d) => {
      const show = group.length > 0 && !hide;
      arrow.root.visible = show;
      if (!show) return;
      const v = judge(state.cells, state.turn, group[0], group[group.length - 1], d);
      arrow.legal = v.ok;
      if (v.ok) legal.push(d);
      const p = arrowAt(group, d);
      arrow.root.position.set(p.x, p.y, p.z);
      arrow.fill.color.set(!v.ok ? "#c9c4bb" : v.off >= 0 ? "#ff5a3c" : v.pushed.length ? "#ff9a2e" : "#ffd24a");
      arrow.fill.opacity = v.ok ? 0.96 : 0.42;
      arrow.root.scale.setScalar(this.hovered === ARROWS + d ? 1.18 : 1);
    });
    this.drawGhost();
    const cursor = this.marks.cursor;
    this.cursorRing.visible = cursor !== null && cursor >= 0 && cursor < COUNT && !hide;
    if (this.cursorRing.visible) this.cursorRing.position.set(cellAt(cursor!).x, TOP + 0.014, cellAt(cursor!).z);
    const canvas = this.renderer.domElement;
    canvas.dataset.group = group.join(",");
    canvas.dataset.arrows = legal.join(",");
    // Where each cell (a marble's top, or the cup's floor) and each arrow is on the canvas, in its pixels, for browser tests.
    canvas.dataset.places = JSON.stringify(Array.from({ length: COUNT }, (_, c) => this.onCanvas({ ...cellAt(c), y: state.cells[c] === null ? TOP : REST_Y + 0.12 })));
    canvas.dataset.arrowPlaces = JSON.stringify(group.length ? DIR_XZ.map((_, d) => this.onCanvas(arrowAt(group, d))) : []);
    this.redraw();
  }
  /** A point of the table in the canvas's own pixels. */
  private onCanvas(p: { x: number; y: number; z: number }) {
    this.camera.updateMatrixWorld();
    const v = new T.Vector3(p.x, p.y, p.z).project(this.camera),
      el = this.renderer.domElement;
    return [Math.round(((v.x + 1) / 2) * el.clientWidth), Math.round(((1 - v.y) / 2) * el.clientHeight)];
  }
  /** The cells of my own marbles that would make the chosen group one longer. */
  private extensions() {
    const state = this.state!,
      group = this.group,
      me = state.turn,
      out: number[] = [];
    const ends = group.length === 1 ? [0, 1, 2, 3, 4, 5].map((d) => step(group[0], d)) : [step(group[group.length - 1], this.axis()), step(group[0], (this.axis() + 3) % 6)];
    for (const c of ends) if (c >= 0 && state.cells[c] === me) out.push(c);
    return out;
  }
  /** The direction from the group's first marble to its second. */
  private axis() {
    const [a, b] = this.group;
    for (let d = 0; d < 6; d++) if (step(a, d) === b) return d;
    return 0;
  }
  /** The move the pointer rests on (an arrow, or a cell the group would go to): its new cells, shown faintly. */
  private drawGhost() {
    this.ghost.count = 0;
    const state = this.state,
      group = this.group;
    if (!state || !group.length || this.animating || capturing()) return;
    const dir = this.hovered >= ARROWS ? this.hovered - ARROWS : this.hovered >= 0 ? this.directionsTo(this.hovered).find((d) => judge(state.cells, state.turn, group[0], group[group.length - 1], d).ok) : undefined;
    if (dir === undefined || !judge(state.cells, state.turn, group[0], group[group.length - 1], dir).ok) return;
    const m = new T.Matrix4();
    group.forEach((c, k) => {
      const p = cellAt(step(c, dir));
      this.ghost.setMatrixAt(k, m.makeTranslation(p.x, TOP + 0.006, p.z));
    });
    this.ghost.count = group.length;
    this.ghost.instanceMatrix.needsUpdate = true;
    (this.ghost.material as T.MeshBasicMaterial).color.set(PUSH_COLORS[state.turn]).lerp(new T.Color("#ffffff"), 0.4);
  }
  /** The directions in which the chosen group would go to (or push) the marble on `cell`. */
  private directionsTo(cell: number) {
    const state = this.state!,
      group = this.group,
      out: number[] = [];
    if (!group.length || group.includes(cell)) return out;
    for (let d = 0; d < 6; d++) {
      const v = judge(state.cells, state.turn, group[0], group[group.length - 1], d),
        inline = group.length === 1 || this.axis() === d || (this.axis() + 3) % 6 === d,
        lead = inline ? (group.length === 1 || this.axis() === d ? group[group.length - 1] : group[0]) : -1,
        reached = inline ? [step(lead, d), ...(v.ok ? v.pushed : [])] : group.map((c) => step(c, d));
      if (reached.includes(cell)) out.push(d);
    }
    return out;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.refresh();
  }
  protected mark(marks: Marks) {
    this.marks = marks;
    this.refresh();
  }
  protected dragStart(point: number, at: { x: number; z: number }) {
    if (!this.open) return false;
    this.press = { cell: point >= 0 && point < COUNT ? point : this.cellUnder(at), point, moved: false };
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    const press = this.press,
      state = this.state;
    if (!press || !state || press.point >= ARROWS || state.cells[press.cell] !== state.turn) return;
    const cell = this.cellUnder(at);
    if (cell < 0 || cell === press.cell) return;
    // A drag across my own marbles in a line chooses them all.
    const line = lineOf(press.cell, cell);
    if (!line || line.cells.some((c) => state.cells[c] !== state.turn)) return;
    press.moved = true;
    this.group = line.cells;
    this.refresh();
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const press = this.press;
    this.press = null;
    if (!press || !at || press.moved) return;
    this.tap(press.point >= ARROWS ? press.point : press.cell);
  }
  /** A press that was not a drag: on an arrow, a cell, or nothing. */
  private tap(point: number) {
    const state = this.state;
    if (!state || !this.open) return;
    const me = state.turn,
      group = this.group;
    if (point >= ARROWS) {
      if (group.length) this.submit(point - ARROWS);
      return;
    }
    if (point < 0) {
      this.group = [];
      return this.refresh();
    }
    const owner = state.cells[point];
    if (owner === me) return this.choose(point);
    if (!group.length) return this.onMove(complaint(owner === null ? COMPLAINTS.nothing : COMPLAINTS.theirs));
    const ways = this.directionsTo(point);
    if (!ways.length) {
      if (owner !== null) return this.onMove(complaint(COMPLAINTS.theirs));
      this.group = [];
      return this.refresh();
    }
    const legal = ways.filter((d) => judge(state.cells, me, group[0], group[group.length - 1], d).ok);
    if (legal.length > 1) return this.onMove(complaint(COMPLAINTS.twoWays));
    this.submit(legal[0] ?? ways[0]);
  }
  /** A press on one of my own marbles: it starts, lengthens, shortens or changes the group. */
  private choose(cell: number) {
    const state = this.state!,
      group = this.group,
      mine = (c: number) => state.cells[c] === state.turn;
    if (group.includes(cell)) {
      if (group.length === 1) this.group = [];
      else if (cell === group[0]) this.group = group.slice(1);
      else if (cell === group[group.length - 1]) this.group = group.slice(0, -1);
      else this.group = [cell];
      return this.refresh();
    }
    if (group.length) {
      // From either end of the group to the marble pressed, if that is one straight line of mine of three at most.
      for (const end of [group[0], group[group.length - 1]]) {
        const line = lineOf(end, cell);
        if (line && group.every((c) => line.cells.includes(c)) && line.cells.every(mine)) {
          this.group = line.cells;
          return this.refresh();
        }
      }
      // In line and joined, but longer than three: said so, and the group stays.
      const far = group.length === 1 ? null : this.axis();
      for (const [end, d] of far === null ? [] : ([[group[group.length - 1], far], [group[0], (far + 3) % 6]] as const)) {
        let at = end,
          n = group.length;
        while ((at = step(at, d)) >= 0 && mine(at)) {
          n++;
          if (at === cell && n > 3) return this.onMove(complaint(COMPLAINTS.long));
        }
      }
    }
    this.group = [cell];
    this.refresh();
  }
  private submit(dir: number) {
    const group = this.group;
    if (!group.length) return;
    this.onMove({ from: group[0], to: group[group.length - 1], extra: dir });
  }
  /** The screen refused a move of mine: the group gives a little shake (its own frames, so that the next press is not held up). */
  refused(move: { from: number }) {
    if (move.from < 0 || !this.group.length || this.reducedMotion) return;
    cancelAnimationFrame(this.shaking);
    const meshes = this.group.map((c) => this.marbles[c]).filter((m): m is T.Mesh => !!m),
      home = meshes.map((m) => m.position.x),
      start = performance.now();
    const shake = (now: number) => {
      const p = (now - start) / 280;
      meshes.forEach((m, i) => (m.position.x = home[i] + (p < 1 ? Math.sin(p * Math.PI * 6) * 0.035 * (1 - p) : 0)));
      this.redraw();
      if (p < 1 && !this.disposed) this.shaking = requestAnimationFrame(shake);
    };
    this.shaking = requestAnimationFrame(shake);
  }
  /** Enter or Space presses the cell under the keyboard's cursor; W E A D Z X move the chosen group; Escape lets it go. */
  private keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      this.group = [];
      this.refresh();
      return;
    }
    if (!this.open) return;
    const dir = DIR_KEYS[e.code];
    if ((e.key === "Enter" || e.key === " ") && this.marks.cursor !== null) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.tap(this.marks.cursor);
    } else if (dir !== undefined && this.group.length && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.submit(dir);
    }
  };
  /** Where a graphics card draws: the chosen marbles bob a little and the arrows of the moves that can be made glow. */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    if (this.animating || !this.group.length) return;
    const t = now / 1000;
    this.group.forEach((c, i) => {
      const mesh = this.marbles[c];
      if (mesh) mesh.position.y = REST_Y + LIFT + 0.018 * Math.sin(t * 3.4 + i * 0.7);
    });
    for (const arrow of this.arrows) if (arrow.root.visible && arrow.legal) arrow.fill.opacity = 0.8 + 0.18 * Math.sin(t * 4);
    this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    cancelAnimationFrame(this.shaking);
    this.renderer.domElement.removeEventListener("keydown", this.keys);
    super.dispose();
  }
}
