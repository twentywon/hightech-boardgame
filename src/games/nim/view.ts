import * as T from "three";
import { block, glossy, hop, planks, travel, veneer, weave, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BASE, END, PITCH, RACK_Z, RING, RING_Y, ROD_RADIUS, ROD_Y, TRAY, nimShift, nimSubject, rackOf, ringAt, stackSpot, stacksOf, trayOf } from "./layout";
import { left, reach, take, takenBy, type State } from "./rules";

/** The two sides' colours: the felt of my tray (blue) and of the other side's (red). */
export const NIM_COLORS: [string, string] = ["#2f6fb8", "#b9442f"];
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** How high a ring or a scoop about to be taken is lifted. */
const LIFT = 0.07;
const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * What the two tables of 님 share. Everything on them is counted from the open end: a press on the thing at place
 * `k` is a take of `k + 1` (it and every one between it and the open end), refused with a shake when that is more
 * than may be taken; a mouse over a thing that may be taken lifts it and those before it, and so does the keyboard's
 * cursor. A press is taken whole (`dragStart`), so that a refused tap is still heard: the screen says why.
 */
export abstract class TakeView extends TableView<State> {
  /** The pocket ball's hook, used here for the rings knocking together as they start to slide. */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  protected hovered = -1;
  private pressed = -1;
  /** The place from the open end of the thing under the ray, or -1. */
  protected abstract placeUnder(ray: T.Ray): number;
  /** Lifts the first `count` things still on the table and lets the rest down. */
  protected abstract raise(count: number): void;
  /** The first `count` things shake their heads: more than may be taken at once. */
  protected abstract refuse(count: number): void;
  protected pick(ray: T.Ray) {
    return this.state && !this.animating ? this.placeUnder(ray) : -1;
  }
  protected spots(): Spot[] {
    return [];
  }
  protected hover(point: number) {
    this.hovered = point;
    this.lifted();
  }
  protected dragStart(point: number) {
    if (!this.state) return false;
    this.pressed = point;
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const k = this.pressed;
    this.pressed = -1;
    if (at && k >= 0) this.tap(k);
  }
  /** A tap on the thing at place `k`: the take it stands for, or a shake and the reason when it is too many. */
  private tap(k: number) {
    const state = this.state;
    // The screen offers places only while a person may take (not during the computer's turn or a move).
    if (!state || state.winner !== null || this.animating || !this.marks.targets.length || k >= left(state)) return;
    this.onMove(take(k + 1));
    if (this.state === state && k + 1 > reach(state)) this.refuse(k + 1);
  }
  protected mark(_marks: Marks) {
    this.lifted();
  }
  /** What a tap would take now is lifted: under the mouse, or at the keyboard's cursor. */
  protected lifted() {
    const state = this.state;
    if (!state || this.animating) return;
    const mine = this.marks.targets.length > 0 && !capturing(),
      k = this.hovered >= 0 ? this.hovered : (this.marks.cursor ?? -1),
      count = mine && k >= 0 && k < reach(state) ? k + 1 : 0;
    this.raise(count);
    this.renderer.domElement.style.cursor = !mine || this.hovered < 0 ? "default" : count ? "pointer" : "not-allowed";
    this.redraw();
  }
  private shaking: { things: T.Object3D[]; from: number[]; along: "x" | "z"; start: number } | null = null;
  private shakeFrame = 0;
  /**
   * Shakes things from side to side for a moment. It runs on a clock of its own, not as a tween, so that it holds
   * nothing up: a tap straight after it is taken.
   */
  protected shake(things: T.Object3D[], along: "x" | "z" = "x") {
    this.calm();
    if (this.reducedMotion || !things.length) return;
    this.shaking = { things, from: things.map((thing) => thing.position[along]), along, start: performance.now() };
    const frame = (now: number) => {
      const shaking = this.shaking;
      if (!shaking || this.disposed) return;
      const p = Math.min(1, (now - shaking.start) / 380),
        d = 0.045 * Math.sin(p * Math.PI * 6) * (1 - p);
      shaking.things.forEach((thing, i) => (thing.position[shaking.along] = shaking.from[i] + d));
      this.redraw();
      if (p < 1) this.shakeFrame = requestAnimationFrame(frame);
      else this.shaking = null;
    };
    this.shakeFrame = requestAnimationFrame(frame);
  }
  /** Stops a shake, putting what shook back where it was (before the table is laid out or a take moves anything). */
  protected calm() {
    cancelAnimationFrame(this.shakeFrame);
    const shaking = this.shaking;
    this.shaking = null;
    shaking?.things.forEach((thing, i) => (thing.position[shaking.along] = shaking.from[i]));
  }
  dispose() {
    this.calm();
    super.dispose();
  }
}

/** A ring's cross-section, a rounded rectangle, turned round the rod: its middle at the origin and its hole along x. */
function ringShape() {
  const { outer: R, inner: r, width } = RING,
    c = 0.035,
    h = width / 2,
    points: T.Vector2[] = [];
  const arc = (cx: number, cy: number, from: number) => {
    for (let s = 0; s <= 4; s++) {
      const a = from + (s / 4) * (Math.PI / 2);
      points.push(new T.Vector2(cx + c * Math.cos(a), cy + c * Math.sin(a)));
    }
  };
  // Round the section the other way from the clock (outer wall up, top inward, inner wall down), so its faces look out.
  arc(R - c, -h + c, -Math.PI / 2);
  arc(R - c, h - c, 0);
  arc(r + c, h - c, Math.PI / 2);
  arc(r + c, -h + c, Math.PI);
  points.push(points[0].clone());
  return new T.LatheGeometry(points, 44).rotateZ(-Math.PI / 2);
}
/** A board at an end of the rack, seen from the side: wide at its foot, narrower and rounded at the top. */
function endShape(height: number) {
  const s = new T.Shape(),
    foot = BASE.depth / 2 - 0.06,
    top = 0.3;
  s.moveTo(-foot, 0);
  s.lineTo(foot, 0);
  s.lineTo(top + 0.04, height - 0.16);
  s.quadraticCurveTo(top, height, top - 0.16, height);
  s.lineTo(-top + 0.16, height);
  s.quadraticCurveTo(-top, height, -top - 0.04, height - 0.16);
  s.closePath();
  return new T.ExtrudeGeometry(s, { depth: END.thickness - 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 10 }).rotateY(Math.PI / 2);
}
const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
const FONT = '"Inter", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

/**
 * 님 on a wooden counting rack, after the user's photograph of a teaching aid (our own wood, no maker's label): a
 * long pale beech base, an end board at each end, and a dowel held by the right one whose tip stops short of the
 * left one, so that rings slip off there. The rings stand on the rod side by side, pushed to the right end, in fives
 * of walnut and maple counted from that end. A take slides the rings left along the rod; they slip off its tip one
 * after another and drop into the taker's shallow tray (mine in front, the other side's behind), where they lie in
 * stacks of five. It all stands on a classroom desk before a chalkboard that has the rule written on it.
 */
export class NimView extends TakeView {
  private total = 0;
  private rack = new T.Group();
  private rings: T.Mesh[] = [];
  private ringGeometry: T.BufferGeometry;
  private paints: { walnut: T.Material; maple: T.Material; walnutLit: T.Material; mapleLit: T.Material; beech: T.Material; tray: T.Material; felt: T.Material[] };
  private caster = new T.Raycaster();
  private board: { ctx: CanvasRenderingContext2D; texture: T.CanvasTexture; said: string };
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#d9cdb8");
    const keep: Own = (r) => this.own(r);
    this.daylight("#fff7ea", "#a08a6c", "#fff1da", 9, 2.1);
    const dark = keep(wood(true)),
      maple = keep(veneer(false)),
      walnut = { map: dark, color: "#f0d8c4", roughness: 0.42 },
      pale = { map: maple, color: "#fff3e0", roughness: 0.45 };
    this.paints = {
      walnut: keep(glossy(walnut, 0.35)),
      maple: keep(glossy(pale, 0.35)),
      walnutLit: keep(glossy({ ...walnut, emissive: "#ffb347", emissiveIntensity: 0.28 }, 0.35)),
      mapleLit: keep(glossy({ ...pale, emissive: "#ffb347", emissiveIntensity: 0.22 }, 0.35)),
      beech: this.standard({ map: keep(wood(false, 0.55)), color: "#ffe8cc", roughness: 0.55 }),
      tray: this.standard({ map: keep(wood(false)), color: "#e2b98c", roughness: 0.55 }),
      felt: NIM_COLORS.map((color) => this.standard({ color: new T.Color(color).multiplyScalar(0.8), roughness: 1, ...weave(3, 1, keep, 0.6) })),
    };
    this.ringGeometry = keep(ringShape());
    // The classroom: a desk of dark wood against a wall, a chalkboard over it, and a few things of a pupil's at the back.
    const desk = this.add(new T.BoxGeometry(30, 0.4, 13), this.standard(planks(3.6, keep, 1.6)), 0, -0.2, 0.7);
    desk.castShadow = false;
    const wall = this.add(new T.PlaneGeometry(40, 14), this.standard({ color: "#e6dcc8", roughness: 0.95 }), 0, 6.5, -5.8);
    wall.castShadow = false;
    const { c, ctx } = canvasOf(1024, 384),
      texture = keep(new T.CanvasTexture(c));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    this.board = { ctx, texture, said: "" };
    const frame = this.standard({ map: keep(wood(false)), color: "#c8935e", roughness: 0.5 });
    this.add(block(12.4, 4.4, 0.14, 0.05), frame, 1.2, 3.1, -5.72).castShadow = false;
    this.add(new T.PlaneGeometry(12, 4), this.standard({ map: texture, roughness: 0.95 }), 1.2, 3.1, -5.63).castShadow = false;
    this.add(block(12, 0.08, 0.3, 0.03), frame, 1.2, 0.95, -5.5);
    // Chalk on the ledge, a cup of pencils, two exercise books and an apple, all well behind the rack.
    const chalk = this.standard({ color: "#f7f4ea", roughness: 0.95 });
    for (const [x, turn] of [[-2.2, 0.1], [-1.8, -0.2]]) this.add(new T.CylinderGeometry(0.04, 0.04, 0.32, 10), chalk, x, 1.03, -5.45).rotation.set(0, turn, Math.PI / 2);
    this.props(keep);
    this.scene.add(this.rack);
    this.begin();
  }
  /** A pencil cup, exercise books and an apple, at the back of the desk on the right. */
  private props(keep: Own) {
    const cup = this.standard({ color: "#3d8f7a", roughness: 0.4 });
    const holder = this.add(new T.CylinderGeometry(0.34, 0.3, 0.8, 28, 1, true), cup, 4.6, 0.4, -2.9);
    (holder.material as T.MeshStandardMaterial).side = T.DoubleSide;
    this.add(new T.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2), cup, 4.6, 0.02, -2.9);
    ["#f2c230", "#3c79c8", "#d9472f"].forEach((color, i) => {
      const pencil = this.add(new T.CylinderGeometry(0.045, 0.045, 1.25, 6), this.standard({ color, roughness: 0.5 }), 4.6 + (i - 1) * 0.12, 0.85, -2.9 + (i % 2) * 0.1);
      pencil.rotation.set(0.12 * (i - 1), 0, 0.15 * (1 - i));
    });
    const books = ["#3f6fa8", "#d98c3a"];
    books.forEach((color, i) => {
      const book = this.add(block(1.5, 0.12, 2.0, 0.03), this.standard({ color, roughness: 0.75 }), 2.6 + i * 0.1, 0.06 + i * 0.12, -3.0);
      book.rotation.y = 0.18 - i * 0.22;
      const pages = this.add(new T.BoxGeometry(1.44, 0.07, 1.94), this.standard({ color: "#f8f4ea", roughness: 0.95 }), 0, 0, 0, book);
      pages.position.set(0.02, 0, 0);
    });
    const apple = this.add(new T.SphereGeometry(0.3, 28, 20).scale(1, 0.9, 1), keep(glossy({ color: "#c8332a", roughness: 0.35 }, 0.6)), 5.9, 0.27, -2.4);
    this.add(new T.CylinderGeometry(0.018, 0.022, 0.16, 6), this.standard({ color: "#5a3a20" }), 0, 0.3, 0, apple);
  }
  /** The rule in chalk, as the teacher wrote it: how many at once, and what the last ring does. */
  private chalkboard(state: State) {
    const said = `${state.most}|${state.misere}`;
    if (this.board.said === said) return;
    this.board.said = said;
    const { ctx, texture } = this.board,
      w = 1024,
      h = 384;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#2f4a3c");
    g.addColorStop(1, "#253d31");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Old chalk wiped away, in clouds.
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      ctx.ellipse(((k * 263) % w) + 40, ((k * 151) % h) + 20, 120, 40, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(246, 243, 232, 0.92)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 64px ${FONT}`;
    ctx.fillText(`한 번에 1~${state.most}개`, w * 0.58, 130);
    ctx.font = `600 48px ${FONT}`;
    ctx.fillText(`마지막 고리를 가져가면 ${state.misere ? "진다" : "이긴다"}`, w * 0.58, 232);
    // Tally marks in fives at the left, as a pupil counts.
    ctx.strokeStyle = "rgba(246, 243, 232, 0.8)";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    for (let group = 0; group < 2; group++) {
      const x0 = 70 + group * 120;
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(x0 + k * 22, 300);
        ctx.lineTo(x0 + k * 22 + 4, 360);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x0 - 12, 350);
      ctx.lineTo(x0 + 82, 308);
      ctx.stroke();
    }
    texture.needsUpdate = true;
  }
  /** Builds the rack for `total` rings: the base, the end boards, the rod, the trays and the rings. */
  private build(total: number) {
    this.total = total;
    this.rack.clear();
    const put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => this.add(geometry, material, x, y, z, this.rack),
      rack = rackOf(total),
      { beech, tray: trayWood } = this.paints;
    const length = rack.rightBoard - rack.leftBoard + 0.1;
    put(block(length, BASE.height, BASE.depth, 0.045), beech, (rack.leftBoard + rack.rightBoard) / 2, BASE.height / 2, RACK_Z);
    put(endShape(END.height), beech, rack.right, BASE.height - 0.01, RACK_Z);
    put(endShape(END.height * 0.62), beech, rack.leftBoard, BASE.height - 0.01, RACK_Z);
    const rodLength = rack.right - rack.tip + END.thickness * 0.6;
    put(new T.CylinderGeometry(ROD_RADIUS, ROD_RADIUS, rodLength, 28).rotateZ(Math.PI / 2), beech, rack.tip + rodLength / 2, ROD_Y, RACK_Z);
    // The tip is rounded off, so that a ring slips over it.
    put(new T.SphereGeometry(ROD_RADIUS, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2).scale(0.55, 1, 1), beech, rack.tip, ROD_Y, RACK_Z);
    // The two trays, a felt in each side's colour.
    for (const side of [0, 1] as const) {
      const tray = trayOf(total, side),
        long = tray.x1 - tray.x0,
        mid = (tray.x0 + tray.x1) / 2,
        deep = TRAY.depth + 0.12;
      put(block(long, 0.045, deep, 0.02), trayWood, mid, 0.0225, tray.z);
      put(new T.PlaneGeometry(long - 0.12, TRAY.depth).rotateX(-Math.PI / 2), this.paints.felt[side], mid, TRAY.floor + 0.002, tray.z).castShadow = false;
      for (const s of [-1, 1]) {
        put(block(long, TRAY.rim, 0.06, 0.025), trayWood, mid, TRAY.rim / 2, tray.z + (s * deep) / 2);
        put(block(0.06, TRAY.rim, deep, 0.025), trayWood, mid + (s * long) / 2, TRAY.rim / 2, tray.z);
      }
      // Low walls between the stacks, so that each holds five.
      for (let k = 1; k < stacksOf(total); k++) put(block(0.025, 0.07, TRAY.depth - 0.1, 0.01), trayWood, tray.x0 + 0.08 + k * 0.98, 0.07, tray.z);
    }
    this.rings = Array.from({ length: total }, (_, j) => {
      const mesh = new T.Mesh(this.ringGeometry, Math.floor(j / 5) % 2 ? this.paints.maple : this.paints.walnut);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.ring = j;
      this.rack.add(mesh);
      return mesh;
    });
  }
  private paintOf(j: number, lit = false) {
    const maple = Math.floor(j / 5) % 2 === 1;
    return lit ? (maple ? this.paints.mapleLit : this.paints.walnutLit) : maple ? this.paints.maple : this.paints.walnut;
  }
  protected subject(aspect: number): TableSubject {
    return nimSubject(this.total || 21, aspect);
  }
  /** On a short, wide screen the camera moves left, so that the rack stands clear of the lettering at the lower left. */
  protected resize() {
    super.resize();
    const aspect = this.camera.aspect,
      shift = nimShift(this.total || 21, aspect);
    this.camera.position.x = -shift;
    this.camera.lookAt(-shift, nimSubject(this.total || 21, aspect).lookY, 0);
  }
  /** A press strikes the ring it meets first; one between rings, or just off them, the nearest along the rod. */
  protected placeUnder(ray: T.Ray) {
    const state = this.state!,
      n = left(state);
    if (!n) return -1;
    this.rack.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObjects(this.rings.slice(0, n), false)[0];
    if (hit) return n - 1 - (hit.object.userData.ring as number);
    const at = new T.Vector3();
    if (!ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), -RACK_Z), at)) return -1;
    if (Math.abs(at.y - RING_Y) > RING.outer + 0.08) return -1;
    const first = ringAt(state.total, n - 1).x,
      k = Math.round((at.x - first) / PITCH);
    return k >= 0 && k < n ? k : -1;
  }
  protected raise(count: number) {
    const state = this.state!,
      n = left(state);
    for (let j = 0; j < n; j++) {
      const mesh = this.rings[j],
        up = j >= n - count;
      mesh.position.y = RING_Y + (up ? LIFT : 0);
      mesh.material = this.paintOf(j, up);
    }
  }
  protected refuse(count: number) {
    const n = left(this.state!);
    this.shake(this.rings.slice(Math.max(0, n - count), n));
  }
  protected place(state: State) {
    this.calm();
    const built = state.total !== this.total;
    if (built) this.build(state.total);
    this.chalkboard(state);
    const total = state.total,
      n = left(state),
      counts = [0, 0];
    // Rings taken lie in their takers' trays in the order they were taken; the rest stand on the rod.
    const spot = new Map<number, { x: number; y: number; z: number }>();
    state.takers.forEach((side, k) => spot.set(total - 1 - k, stackSpot(total, side, counts[side]++)));
    this.rings.forEach((mesh, j) => {
      mesh.material = this.paintOf(j);
      if (j < n) {
        const at = ringAt(total, j);
        mesh.position.set(at.x, at.y, at.z);
        mesh.rotation.set(0, 0, 0);
      } else {
        const at = spot.get(j)!;
        mesh.position.set(at.x, at.y, at.z);
        mesh.rotation.set(0, 0, Math.PI / 2);
      }
    });
    const canvas = this.renderer.domElement;
    canvas.dataset.left = String(n);
    canvas.dataset.total = String(total);
    canvas.dataset.mode = "nim";
    this.lifted();
    if (built) this.resize();
  }
  protected animate(before: State, state: State) {
    this.calm();
    const t = state.takers.length - before.takers.length;
    if (t <= 0 || state.total !== this.total || !state.last) return false;
    const total = state.total,
      side = state.last.side,
      lead = before.takers.length,
      rack = rackOf(total),
      off = rack.tip + RING.width * 0.3,
      first = ringAt(total, total - 1 - lead).x,
      distance = Math.max(0, first - off),
      slide = Math.max(280, (distance / 6.5) * 1000),
      STEP = 170,
      FLY = 560,
      whole = slide + (t - 1) * STEP + FLY,
      already = takenBy(before, side);
    const moving = Array.from({ length: t }, (_, i) => {
      const j = total - 1 - lead - i;
      return { mesh: this.rings[j], x0: ringAt(total, j).x, to: stackSpot(total, side, already + i), turn: (i % 2 ? 1 : -1) * 0.5, landed: false };
    });
    this.onKnock?.("disc", 0.6);
    this.tween(0, whole, (p) => {
      const ms = p * whole;
      moving.forEach((ring, i) => {
        const leave = slide + i * STEP,
          mesh = ring.mesh;
        mesh.material = this.paintOf(mesh.userData.ring as number);
        if (ms < leave) {
          // The rings slide left together, then step on as each before them slips off the tip.
          const s = ms < slide ? distance * smooth(ms / slide) : distance + (PITCH * (ms - slide)) / STEP;
          mesh.position.set(ring.x0 - s, RING_Y, RACK_Z);
          mesh.rotation.set(0, 0, 0);
          return;
        }
        // Off the tip: it tips over as it drops, and lands lying flat on the stack it belongs to.
        const q = Math.min(1, (ms - leave) / FLY),
          a = travel(q),
          from = { x: off - 0.06, y: RING_Y, z: RACK_Z };
        mesh.position.set(from.x + (ring.to.x - from.x) * a, from.y + (ring.to.y - from.y) * a + hop(q) * 0.42, from.z + (ring.to.z - from.z) * a);
        const tip = smooth(Math.min(1, q / 0.84));
        mesh.rotation.set(ring.turn * Math.sin(Math.PI * tip), 0, (Math.PI / 2) * tip);
        if (!ring.landed && q >= 0.84) {
          ring.landed = true;
          this.onContact();
        }
      });
    });
    return true;
  }
}
