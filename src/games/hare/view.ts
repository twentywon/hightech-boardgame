import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { capable, furry, hop, travel } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { PLACES, type State } from "./rules";
import { LAWN, STONE_TOP, garden, pawPrint, placeAt } from "./garden";

export { placeAt };
const SUBJECT: TableSubject = { half: 5.6, halfZ: 3.6, height: 1.4, lookY: 0, tilt: 0.95 };
export const HARE_COLORS: [string, string] = ["#7a4a2b", "#f1ece0"];
/** How large the animals stand on the board. */
const SIZE = 1.3,
  /** How long a move takes, as before the animals ran. */
  RUN = 420;
const capturing = () => document.documentElement.dataset.capture === "1";
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** Parts of a figure gathered by material and merged into one mesh each, under `parent`. */
class Parts {
  private lists = new Map<T.Material, T.BufferGeometry[]>();
  put(geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, scale: [number, number, number] = [1, 1, 1], turn: [number, number, number] = [0, 0, 0]) {
    const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(...turn)), new T.Vector3(...scale));
    const g = geometry.clone().applyMatrix4(m);
    if (!this.lists.has(material)) this.lists.set(material, []);
    this.lists.get(material)!.push(g);
  }
  build(parent: T.Object3D, own: Own) {
    for (const [material, list] of this.lists) {
      const mesh = new T.Mesh(own(mergeGeometries(list)!), material);
      list.forEach((g) => g.dispose());
      mesh.castShadow = true;
      parent.add(mesh);
    }
  }
}
interface Hound {
  group: T.Group;
  head: T.Group;
  ears: T.Group[];
  /** Front left, front right, hind left, hind right. */
  legs: T.Group[];
  tail: T.Group;
}
interface Hare {
  group: T.Group;
  body: T.Group;
  head: T.Group;
  ears: T.Group[];
}
/** The angle a figure turns to face (dx, dz), for a figure that faces +x unturned (`back`: −x). */
const facing = (dx: number, dz: number, back = false) => (back ? Math.atan2(dz, -dx) : Math.atan2(-dz, dx));
/** From angle a toward b by q, the short way round. */
const turnTo = (a: number, b: number, q: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * q;
};
/** The board in a garden, with three small furry beagles and a hare that run and bound from point to point. */
export class HareView extends TableView<State> {
  private hounds: Hound[] = [];
  private hare: Hare;
  private rings: T.Mesh[] = [];
  private pools: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  /** Paw prints from the last move, until the next. */
  private prints: T.InstancedMesh;
  private printPaint: T.MeshBasicMaterial;
  private live: boolean;
  private ticking = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, LAWN);
    const rich = capable();
    this.live = rich && !this.reducedMotion;
    const sun = this.daylight("#eef6ff", "#5d7a3c", "#fff1d6", 9.5);
    sun.position.set(-5, 11, 4);
    // Under software drawing a smaller shadow map keeps the frame near the old one's cost.
    if (!rich) sun.shadow.mapSize.set(1024, 1024);
    const own: Own = (r) => this.own(r);
    garden(this.scene, own, rich);
    // Shared coats: a tricolour beagle's brown, black saddle and cream; the hare's pale coat and cream front.
    const fur = (color: string, amount = 0.8) => this.own(furry({ color, roughness: 0.85 }, amount, 3, 2, own));
    const coats = {
      brown: fur(HARE_COLORS[0]),
      saddle: fur("#33231a"),
      cream: fur("#efe2c8"),
      hare: fur("#e8dfcc", 1),
      white: fur("#fbf8f1", 1),
      black: this.own(new T.MeshStandardMaterial({ color: "#151110", roughness: 0.25 })),
      pink: this.standard({ color: "#e3a19b" }),
      tip: this.standard({ color: "#3b2a22", roughness: 0.8 }),
      collar: this.standard({ color: "#c63a2a", roughness: 0.5 }),
    };
    for (let k = 0; k < 3; k++) this.hounds.push(this.hound(coats));
    this.hare = this.rabbit(coats);
    this.scene.add(...this.hounds.map((h) => h.group), this.hare.group);
    PLACES.forEach(() => {
      const pool = new T.Mesh(this.own(new T.CircleGeometry(0.62, 32).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.28, depthWrite: false })));
      pool.visible = false;
      pool.renderOrder = 4;
      this.pools.push(pool);
      const ring = ringMesh(own, 0.62, 0.72, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(pool, ring);
    });
    this.cursor = ringMesh(own, 0.76, 0.84, "#ffffff");
    this.chosen = ringMesh(own, 0.62, 0.74, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    const paw = this.own(pawPrint());
    this.printPaint = this.own(new T.MeshBasicMaterial({ map: paw, transparent: true, opacity: 0.6, depthWrite: false }));
    this.prints = new T.InstancedMesh(this.own(new T.PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2)), this.printPaint, 4);
    this.prints.count = 0;
    this.prints.renderOrder = 3;
    this.prints.frustumCulled = false;
    this.scene.add(this.prints);
    this.begin();
    if (this.live) this.ticking = requestAnimationFrame(this.tick);
  }
  /** A small standing beagle, facing +x (toward the hare's end): legs, ears, head and tail each move. */
  private hound(c: Record<string, T.Material>): Hound {
    const own: Own = (r) => this.own(r),
      group = new T.Group(),
      body = new Parts(),
      ball = (r: number) => new T.SphereGeometry(r, 14, 10),
      capsule = (r: number, l: number) => new T.CapsuleGeometry(r, l, 3, 8);
    group.rotation.order = "YXZ";
    body.put(ball(0.34), c.brown, -0.02, 0.56, 0, [1.5, 0.9, 0.8]);
    body.put(ball(0.3), c.saddle, -0.1, 0.66, 0, [1.3, 0.6, 0.84]);
    body.put(ball(0.25), c.cream, 0.02, 0.47, 0, [1.4, 0.72, 0.74]);
    body.put(ball(0.2), c.cream, 0.32, 0.56, 0, [1, 1.1, 0.88]);
    body.put(capsule(0.12, 0.2), c.brown, 0.4, 0.74, 0, [1, 1, 1], [0, 0, -0.6]);
    body.put(new T.TorusGeometry(0.14, 0.03, 8, 20), c.collar, 0.42, 0.76, 0, [1, 1, 1], [0, Math.PI / 2, 0.6]);
    body.build(group, own);
    const head = new T.Group();
    head.position.set(0.47, 0.86, 0);
    const face = new Parts();
    face.put(ball(0.2), c.brown, 0.04, 0.06, 0, [1.1, 1, 0.95]);
    face.put(capsule(0.09, 0.14), c.cream, 0.24, -0.01, 0, [1, 1, 1], [0, 0, Math.PI / 2]);
    face.put(ball(0.075), c.cream, 0.08, 0.17, 0, [1.6, 0.5, 0.6]);
    face.put(ball(0.05), c.black, 0.36, 0.01, 0);
    for (const s of [-1, 1]) face.put(ball(0.033), c.black, 0.18, 0.11, s * 0.11);
    face.build(head, own);
    const ears = [-1, 1].map((s) => {
      const ear = new T.Group();
      ear.position.set(0.0, 0.13, s * 0.17);
      ear.rotation.x = s * 0.25;
      const flap = new T.Mesh(own(ball(0.12).scale(0.55, 1.5, 0.25).translate(0, -0.14, 0)), c.saddle);
      flap.castShadow = true;
      ear.add(flap);
      head.add(ear);
      return ear;
    });
    group.add(head);
    const legGeometry = own(mergeGeometries([capsule(0.065, 0.3).translate(0, -0.22, 0), ball(0.07).scale(1.3, 0.6, 1).translate(0.03, -0.42, 0)])!);
    const legs = [
      [0.28, 1],
      [0.28, -1],
      [-0.32, 1],
      [-0.32, -1],
    ].map(([x, s]) => {
      const leg = new T.Group();
      leg.position.set(x, 0.46, s * 0.14);
      const mesh = new T.Mesh(legGeometry, x > 0 ? c.cream : c.brown);
      mesh.castShadow = true;
      leg.add(mesh);
      group.add(leg);
      return leg;
    });
    const tail = new T.Group();
    tail.position.set(-0.52, 0.66, 0);
    tail.rotation.z = 0.9;
    const tailParts = new Parts();
    tailParts.put(capsule(0.04, 0.34), c.brown, 0, 0.2, 0);
    tailParts.put(ball(0.055), c.white, 0, 0.4, 0);
    tailParts.build(tail, own);
    group.add(tail);
    group.scale.setScalar(SIZE);
    return { group, head, ears, legs, tail };
  }
  /** A hare crouched on its haunches, facing −x (toward the hounds), its long ears up. */
  private rabbit(c: Record<string, T.Material>): Hare {
    const own: Own = (r) => this.own(r),
      group = new T.Group(),
      body = new T.Group(),
      parts = new Parts(),
      ball = (r: number) => new T.SphereGeometry(r, 14, 10),
      capsule = (r: number, l: number) => new T.CapsuleGeometry(r, l, 3, 8);
    group.rotation.order = "YXZ";
    parts.put(ball(0.36), c.hare, 0.08, 0.42, 0, [1.25, 0.95, 0.85]);
    parts.put(ball(0.26), c.white, -0.17, 0.37, 0, [1, 1, 0.84]);
    for (const s of [-1, 1]) {
      parts.put(ball(0.22), c.hare, 0.22, 0.31, s * 0.2, [1.2, 1, 0.6]);
      parts.put(capsule(0.065, 0.32), c.hare, 0.04, 0.07, s * 0.21, [1, 1, 1], [0, 0, Math.PI / 2]);
      parts.put(capsule(0.045, 0.2), c.white, -0.32, 0.16, s * 0.1);
    }
    parts.put(ball(0.11), c.white, 0.52, 0.45, 0);
    parts.build(body, own);
    group.add(body);
    const head = new T.Group();
    head.position.set(-0.36, 0.78, 0);
    const face = new Parts();
    face.put(ball(0.2), c.hare, 0, 0, 0, [1.15, 0.95, 0.9]);
    face.put(ball(0.11), c.white, -0.17, -0.06, 0);
    face.put(ball(0.035), c.pink, -0.27, -0.02, 0);
    for (const s of [-1, 1]) face.put(ball(0.045), c.black, -0.08, 0.06, s * 0.14);
    face.build(head, own);
    const ears = [-1, 1].map((s) => {
      const ear = new T.Group();
      ear.position.set(0.05, 0.14, s * 0.07);
      ear.rotation.set(s * 0.3, 0, -0.55);
      const p = new Parts();
      p.put(capsule(0.11, 0.48), c.hare, 0, 0.33, 0, [1, 1, 0.36]);
      p.put(capsule(0.075, 0.4), c.pink, -0.045, 0.32, 0, [0.9, 1, 0.3]);
      p.put(ball(0.09), c.tip, 0, 0.6, 0, [1.1, 0.9, 0.38]);
      p.build(ear, own);
      head.add(ear);
      return ear;
    });
    group.add(head);
    group.scale.setScalar(SIZE);
    return { group, body, head, ears };
  }
  protected subject() {
    return SUBJECT;
  }
  protected spots(): Spot[] {
    return PLACES.map((_, i) => ({ ...placeAt(i), y: 0.3, r: 0.9, point: i }));
  }
  /** Where each animal looks at rest: the hounds at the hare, the hare at the nearest hound. */
  private restYaw(state: State, point: number, isHare: boolean) {
    const p = placeAt(point);
    if (!isHare) {
      const h = placeAt(state.hare);
      return h.x === p.x && h.z === p.z ? 0 : facing(h.x - p.x, h.z - p.z);
    }
    let best: { x: number; z: number } | null = null;
    for (const q of state.hounds.map(placeAt)) if (!best || Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)) best = q;
    return best ? facing(best.x - p.x, best.z - p.z, true) : 0;
  }
  private pose(hound: Hound) {
    hound.legs.forEach((leg) => (leg.rotation.z = 0));
    hound.ears.forEach((ear) => (ear.rotation.z = 0));
    hound.head.rotation.set(0, 0, 0);
    hound.tail.rotation.set(0, 0, 0.9);
    hound.group.rotation.z = 0;
  }
  protected place(state: State) {
    state.hounds.forEach((point, k) => {
      const h = this.hounds[k],
        p = placeAt(point);
      h.group.position.set(p.x, STONE_TOP, p.z);
      h.group.rotation.y = this.restYaw(state, point, false);
      this.pose(h);
    });
    const p = placeAt(state.hare);
    this.hare.group.position.set(p.x, STONE_TOP, p.z);
    this.hare.group.rotation.set(0, this.restYaw(state, state.hare, true), 0);
    this.hare.body.scale.set(1, 1, 1);
    this.drawPrints(state);
  }
  /** Paw prints along the way the last animal went, white for the hare and dark for a hound. */
  private drawPrints(state: State) {
    this.prints.count = 0;
    const last = state.last;
    if (!last || capturing() || this.animating) return;
    const a = placeAt(last.from),
      b = placeAt(last.to),
      length = Math.hypot(b.x - a.x, b.z - a.z),
      yaw = facing(b.x - a.x, b.z - a.z) - Math.PI / 2,
      m = new T.Matrix4(),
      q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
      side = new T.Vector3(-(b.z - a.z) / length, 0, (b.x - a.x) / length);
    [0.3, 0.45, 0.6, 0.75].forEach((t, k) => {
      const s = (k % 2 ? 1 : -1) * 0.16;
      m.compose(new T.Vector3(a.x + (b.x - a.x) * t + side.x * s, 0.012, a.z + (b.z - a.z) * t + side.z * s), q, new T.Vector3(1, 1, 1));
      this.prints.setMatrixAt(k, m);
    });
    this.prints.count = 4;
    this.prints.instanceMatrix.needsUpdate = true;
    this.printPaint.color.set(state.hare === last.to ? "#5c4a38" : "#3a2414");
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const { from, to } = state.last,
      isHare = before.hare === from,
      hound = isHare ? null : this.hounds[before.hounds.indexOf(from)],
      group = isHare ? this.hare.group : hound?.group,
      a = placeAt(from),
      b = placeAt(to);
    if (!group) return false;
    this.prints.count = 0;
    // Its voice is heard as it sets off.
    this.onContact();
    const start = group.rotation.y,
      way = facing(b.x - a.x, b.z - a.z, isHare),
      end = this.restYaw(state, to, isHare);
    this.tween(0, RUN, (p) => {
      const along = isHare ? travel(p) : p * p * (3 - 2 * p);
      group.position.x = a.x + (b.x - a.x) * along;
      group.position.z = a.z + (b.z - a.z) * along;
      // It turns to the way it goes, runs, and turns to look where it will look at rest.
      group.rotation.y = p < 0.8 ? turnTo(start, way, Math.min(1, p / 0.15)) : turnTo(way, end, (p - 0.8) / 0.2);
      if (isHare) {
        // One long bound, stretched out in the air, ears laid back.
        group.position.y = STONE_TOP + hop(p) * 0.75;
        const air = Math.sin(Math.PI * Math.min(1, p / 0.84));
        this.hare.body.scale.set(1 + 0.28 * air, 1 - 0.12 * air, 1);
        group.rotation.z = -0.25 * Math.sin(Math.PI * 2 * Math.min(1, p / 0.84)) * (p < 0.84 ? 1 : 0);
        this.hare.ears.forEach((ear) => (ear.rotation.z = -0.55 - 0.6 * air));
      } else if (hound) {
        // Two bounds of a gallop: legs reaching and gathering, ears flapping.
        const stride = Math.sin(Math.PI * 4 * p),
          lift = Math.sin(Math.PI * p);
        group.position.y = STONE_TOP + Math.abs(Math.sin(Math.PI * 2 * p)) * 0.2;
        group.rotation.z = 0.12 * stride * lift;
        hound.legs.forEach((leg, k) => (leg.rotation.z = (k < 2 ? 0.9 : -0.9) * Math.sin(Math.PI * 4 * p + (k % 2) * 0.5 + (k < 2 ? 0 : 0.8)) * lift));
        hound.ears.forEach((ear) => (ear.rotation.z = 0.6 * Math.abs(stride) * lift));
        hound.tail.rotation.z = 0.9 + 0.4 * lift;
      }
    });
    return true;
  }
  protected mark(marks: Marks) {
    this.rings.forEach((ring, i) => {
      const p = placeAt(i),
        shown = marks.targets.includes(i) || marks.movable.includes(i);
      ring.position.set(p.x, STONE_TOP + 0.012, p.z);
      ring.visible = shown;
      this.pools[i].position.set(p.x, STONE_TOP + 0.008, p.z);
      // A place to go is filled softly; a piece to pick up is only ringed.
      this.pools[i].visible = marks.targets.includes(i);
    });
    for (const [ring, point] of [
      [this.cursor, marks.cursor],
      [this.chosen, marks.selected],
    ] as [T.Mesh, number | null][]) {
      ring.visible = point !== null;
      if (point !== null) ring.position.set(placeAt(point).x, STONE_TOP + 0.02, placeAt(point).z);
    }
  }
  /**
   * Where a graphics card draws (and motion is not reduced) the animals live a little: tails wag, hounds pant and
   * glance about, the hare twitches its ears, the place marks glow, and the winners jump for joy. Drawn by the
   * processor alone the table is drawn only when something moves, as before.
   */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    const s = this.state;
    if (this.animating || !s) return;
    const t = now / 1000,
      won = s.winner === null || s.winner === "draw" ? null : s.winner === s.hunter ? "hounds" : "hare";
    this.hounds.forEach((h, k) => {
      h.tail.rotation.set(0.5 * Math.sin(t * 9 + k * 2), 0, 0.9);
      h.head.rotation.set(0, 0.25 * Math.sin(t * 0.7 + k * 2.1), 0.06 * Math.sin(t * 6 + k));
      h.group.position.y = STONE_TOP + (won === "hounds" ? Math.abs(Math.sin(t * 6 + k)) * 0.3 : 0);
    });
    const twitch = Math.max(0, Math.sin(t * 1.3)) ** 12;
    this.hare.ears.forEach((ear, k) => (ear.rotation.z = -0.55 + 0.25 * twitch * Math.sin(t * 40 + k)));
    this.hare.body.scale.set(1, 1 + 0.02 * Math.sin(t * 5), 1);
    this.hare.group.position.y = STONE_TOP + (won === "hare" ? Math.abs(Math.sin(t * 5)) * 0.45 : 0);
    if (won === "hare") this.hare.group.rotation.y += 0.04;
    const glow = 0.2 + 0.12 * Math.sin(t * 4);
    for (const pool of this.pools) if (pool.visible) (pool.material as T.MeshBasicMaterial).opacity = glow;
    this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
