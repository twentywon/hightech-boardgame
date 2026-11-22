import { capable, glossy, hop, travel } from "../../engine/scene-utils";
import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { HOLES, reach, type State } from "./rules";
import { BOARD_R, boardFace, holeAt, room, swirl } from "./room";

export { holeAt };
const SUBJECT: TableSubject = { half: 5.6, halfZ: 5.6, height: 0.8, lookY: 0, tilt: 1.08 };
export const STAR_COLORS: [string, string] = ["#d2452f", "#2f62c0"];
/** How high a marble's middle stands when it rests in its hole, and its radius. */
const REST = 0.2,
  RADIUS = 0.24,
  /** How far a marble picked up is lifted out of its hole. */
  LIFTED = 0.2;
const capturing = () => document.documentElement.dataset.capture === "1";
/** A lacquered star board on a white table, with glass marbles that hop from hole to hole. */
export class StarHopView extends TableView<State> {
  private marbles: (T.Mesh | null)[] = HOLES.map(() => null);
  private ball: T.BufferGeometry;
  private paints: T.Material[];
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  /** Small dots: where the last move's marble set off and touched down (its side's colour), and the way to a hovered hole. */
  private trail: T.InstancedMesh;
  private route: T.InstancedMesh;
  private hovered = -1;
  private live: boolean;
  private ticking = 0;
  private lifted: T.Mesh | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9e7e1");
    const rich = capable();
    this.live = rich && !this.reducedMotion;
    const sun = this.daylight("#ffffff", "#c9c5bb", "#fff8ea", 10, 1.9);
    // Under software drawing a smaller shadow map keeps the frame near the old one's cost.
    if (!rich) sun.shadow.mapSize.set(1024, 1024);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    room(this.scene, own, rich);
    // The board: a lacquered disc with a rounded, moulded edge standing on the white table.
    const rim = this.own(glossy({ color: "#5a1d14", roughness: 0.3 }, 0.8));
    const profile = [
      [BOARD_R - 0.02, 0.0],
      [BOARD_R + 0.06, -0.02],
      [BOARD_R + 0.12, -0.08],
      [BOARD_R + 0.12, -0.18],
      [BOARD_R + 0.04, -0.27],
      [BOARD_R - 0.3, -0.3],
    ].map(([r, y]) => new T.Vector2(r, y));
    this.add(new T.LatheGeometry(profile, 96), rim, 0, 0, 0).receiveShadow = true;
    // The face is a flat disc of its own: a cylinder's cap lays its picture a quarter turn round, which put the holes off the marbles.
    const map = this.own(new T.CanvasTexture(boardFace(rich ? 2048 : 1024)));
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = rich ? 8 : 4;
    const relief = rich ? this.own(new T.CanvasTexture(boardFace(1024, true))) : null;
    const face = this.add(
      new T.CircleGeometry(BOARD_R, 96),
      rich ? this.own(glossy({ map, bumpMap: relief!, bumpScale: 3, roughness: 0.38 }, 0.7)) : this.standard({ map, roughness: 0.45 }),
      0,
      0,
      0,
    );
    face.rotation.x = -Math.PI / 2;
    face.castShadow = false;
    // Glass marbles: a twisted vane in each, turned every which way.
    this.ball = this.own(new T.SphereGeometry(RADIUS, 26, 18));
    this.paints = STAR_COLORS.map((color) => this.own(glossy({ map: this.own(swirl(color)), roughness: 0.06, metalness: 0.05 })));
    for (let i = 0; i < 40; i++) {
      const ring = ringMesh(own, 0.23, 0.31, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.34, 0.4, "#ffffff");
    this.chosen = ringMesh(own, 0.31, 0.4, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    const dots = (color: string, radius: number, opacity: number) => {
      const mesh = new T.InstancedMesh(
        this.own(new T.CircleGeometry(radius, 20).rotateX(-Math.PI / 2)),
        this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })),
        24,
      );
      mesh.count = 0;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.trail = dots("#ffffff", 0.11, 0.85);
    this.route = dots("#ffd24a", 0.07, 0.95);
    this.begin();
    if (this.live) this.ticking = requestAnimationFrame(this.tick);
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
      // Each marble's vane lies its own way.
      mesh.rotation.set(hole * 1.7, hole * 2.3, hole * 0.9);
      this.marbles[hole] = mesh;
      this.scene.add(mesh);
    }
    mesh.material = this.paints[owner];
    mesh.position.set(holeAt(hole).x, REST, holeAt(hole).z);
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
    this.lifted = null;
    this.drawTrail(state);
  }
  /** Where the last marble set off and the holes it touched on its way: small dots in its side's colour. */
  private drawTrail(state: State | null) {
    const last = state?.last;
    this.trail.count = 0;
    if (!last || capturing() || this.animating) return;
    const m = new T.Matrix4(),
      stops = [last.from, ...last.path.slice(0, -1)];
    stops.forEach((hole, k) => {
      const p = holeAt(hole);
      this.trail.setMatrixAt(k, m.makeTranslation(p.x, 0.014, p.z));
    });
    this.trail.count = stops.length;
    this.trail.instanceMatrix.needsUpdate = true;
    (this.trail.material as T.MeshBasicMaterial).color.set(STAR_COLORS[state!.cells[last.to] ?? 0]).lerp(new T.Color("#ffffff"), 0.25);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const { from, to, path } = state.last,
      mesh = this.marbles[from];
    if (!mesh) return false;
    this.trail.count = 0;
    this.route.count = 0;
    // The marble is carried from hole to hole along its way; the state then puts it where it ended.
    this.marbles[from] = null;
    this.marbles[to]?.removeFromParent();
    this.marbles[to] = mesh;
    const stops = [from, ...path],
      jumps = path.length > 1 || !this.isStep(from, path[0]),
      each = path.length > 1 ? 230 : 260,
      high = jumps ? 0.7 : 0.25,
      spin = new T.Quaternion(),
      axis = new T.Vector3();
    path.forEach((_, k) => {
      const a = holeAt(stops[k]),
        b = holeAt(stops[k + 1]),
        // The marble jumped over lies halfway; it is pressed a little into its hole as the hopper passes.
        over = this.marbleAt((a.x + b.x) / 2, (a.z + b.z) / 2),
        distance = Math.hypot(b.x - a.x, b.z - a.z);
      let landed = false,
        start: T.Quaternion | null = null;
      this.tween(k * each, each, (p) => {
        start ??= mesh.quaternion.clone();
        const along = travel(p);
        mesh.position.set(a.x + (b.x - a.x) * along, REST + (p === 0 ? 0 : hop(p) * high), a.z + (b.z - a.z) * along);
        // It turns as it goes, as a marble rolled across would.
        axis.set(b.z - a.z, 0, a.x - b.x).normalize();
        mesh.quaternion.copy(spin.setFromAxisAngle(axis, (along * distance) / RADIUS).multiply(start));
        if (over && over !== mesh) over.position.y = REST - 0.035 * Math.sin(Math.PI * Math.min(1, Math.max(0, (p - 0.25) / 0.5)));
        if (p >= 0.84 && !landed) {
          landed = true;
          this.onContact();
        }
      });
    });
    return true;
  }
  private isStep(a: number, b: number) {
    const p = holeAt(a),
      q = holeAt(b);
    return Math.hypot(p.x - q.x, p.z - q.z) < 0.7;
  }
  private marbleAt(x: number, z: number) {
    for (const m of this.marbles) if (m && Math.hypot(m.position.x - x, m.position.z - z) < 0.1) return m;
    return null;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.drawRoute();
  }
  /** The way a marble picked up would take to the hole under the mouse: gold dots on the holes it would touch. */
  private drawRoute() {
    this.route.count = 0;
    const s = this.state,
      from = this.marks.selected;
    if (!s || from === null || this.hovered < 0 || !this.marks.targets.includes(this.hovered) || this.animating) return;
    const path = reach(s, from).get(this.hovered);
    if (!path || path.length < 2) return;
    const m = new T.Matrix4();
    path.slice(0, -1).forEach((hole, k) => {
      const p = holeAt(hole);
      this.route.setMatrixAt(k, m.makeTranslation(p.x, 0.016, p.z));
    });
    this.route.count = path.length - 1;
    this.route.instanceMatrix.needsUpdate = true;
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
    // The marble picked up stands out of its hole.
    if (!this.animating) {
      if (this.lifted) this.lifted.position.y = REST;
      this.lifted = marks.selected !== null ? this.marbles[marks.selected] : null;
      if (this.lifted) this.lifted.position.y = REST + LIFTED;
    }
    this.drawRoute();
  }
  /**
   * Where a graphics card draws (and motion is not reduced): the marble picked up bobs and the rings of the holes it
   * may go to glow softly. Drawn by the processor alone the table is drawn only when something moves, as before.
   */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    if (this.animating) return;
    const t = now / 1000;
    if (this.lifted) this.lifted.position.y = REST + LIFTED + 0.03 * Math.sin(t * 3.2);
    const glow = 0.72 + 0.23 * Math.sin(t * 4);
    for (const ring of this.rings) if (ring.visible) (ring.material as T.MeshBasicMaterial).opacity = glow;
    if (this.lifted || this.rings[0].visible) this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
