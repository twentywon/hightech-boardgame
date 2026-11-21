import * as T from "three";
import { capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import { bench, benchProps, bulbKit, flickerOff, flickerOn, framedBoard, makeBulb, placesOf, shine, spanOf, workshop, type Bulb, type Kit } from "../bulblink/kit";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BOARD_TOP, BULB_Y, NEIGHBOUR_DELAY, REACH, SWITCH_MS, cellAt, cellUnder, lightsSubject } from "./layout";
import { reach, type State } from "./rules";

export const LIGHT_COLORS: [string, string] = ["#ffc35a", "#6c7178"];
/**
 * The lamp board of lights on, made like bulb link's bench (the user asked for the same look): a pegboard on a framed
 * board lying on the plank bench, a glass bulb with its filament and brass base in a black socket at every place,
 * dark when off and glowing warm when lit. A press makes the bulb pressed sink a little in its socket while it and its
 * four neighbours switch with a short flicker; when every bulb is lit they flare one after another outward from the
 * last one pressed. Marks: the hint's gold ring and the keyboard's (or the mouse's) white one, left out of a picture
 * taken for the collection.
 */
export class LightsView extends TableView<State> {
  private kit: Kit;
  private size = 0;
  private bulbs = new Map<number, Bulb>();
  private layer = new T.Group();
  /** What belongs to the board laid now (made again for a board of another size). */
  private boardOwned: { dispose(): void }[] = [];
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private cursorRing: T.Mesh;
  private hovered = -1;
  private hinted = -1;
  private caster = new T.Raycaster();
  private live: boolean;
  private clock = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a221c");
    const soft = !capable(),
      keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.live = !soft && !this.reducedMotion;
    workshop(this.scene, keep);
    this.kit = bulbKit(keep, soft);
    bench(this.scene, this.kit, keep);
    this.scene.add(this.layer);
    this.hintRing = ringMesh(keep, 0.33, 0.44, "#ffc21f");
    this.cursorRing = ringMesh(keep, 0.4, 0.45, "#ffffff");
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(0.44, 32)), keep(new T.MeshBasicMaterial({ color: "#ffd56a", transparent: true, opacity: 0.35, depthWrite: false })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    this.scene.add(this.hintRing, this.cursorRing, this.hintGlow);
    this.begin();
    this.kick();
  }
  /** The frame, the pegboard and a bulb at every place for a board of `n`, made anew. */
  private build(n: number) {
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    this.layer.clear();
    this.bulbs.clear();
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r);
    this.size = n;
    framedBoard(this.layer, n, this.kit, keep);
    for (let cell = 0; cell < n * n; cell++) this.bulbs.set(cell, makeBulb(this.layer, this.kit, n, cell, keep));
    benchProps(this.layer, this.kit, spanOf(n), keep);
  }
  protected subject(aspect: number): TableSubject {
    return lightsSubject(this.size || 3, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null) return [];
    return state.on.map((_, i) => ({ ...cellAt(state.size, i), y: BULB_Y, r: REACH, point: i }));
  }
  /** What a ray points at: the bulb it strikes first, else the socket under it on the board. */
  protected pick(ray: T.Ray): number | null {
    const state = this.state;
    if (!state || state.winner !== null) return -1;
    this.caster.ray.copy(ray);
    for (const hit of this.caster.intersectObjects(this.layer.children.filter((o) => o.userData.cell !== undefined), true))
      for (let o: T.Object3D | null = hit.object; o; o = o.parent) if (o.userData.cell !== undefined) return o.userData.cell as number;
    const at = new T.Vector3();
    return ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP), at) ? cellUnder(state.size, at.x, at.z) : -1;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    this.hovered = point;
    this.mark(this.marks);
  }
  protected place(state: State) {
    if (state.size !== this.size) {
      this.build(state.size);
      // The camera is set for the board's size, which lays it out again.
      this.resize();
    }
    const won = state.winner === 0;
    for (const bulb of this.bulbs.values()) {
      shine(this.kit, bulb, state.on[bulb.cell] ? (won ? 1.08 : 1) : 0);
      bulb.root.position.y = 0;
    }
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const pressed = state.last;
    if (pressed === null || state.ply !== before.ply + 1 || state.size !== before.size || !this.bulbs.has(pressed)) return false;
    // The bulb pressed sinks a little in its socket and comes back.
    const root = this.bulbs.get(pressed)!.root;
    this.onContact();
    this.tween(0, 220, (p) => (root.position.y = -0.035 * Math.sin(p * Math.PI)));
    // It and its neighbours switch, each with a flicker; the neighbours a moment after it.
    for (const cell of reach(state.size, pressed)) {
      const bulb = this.bulbs.get(cell)!,
        on = state.on[cell];
      this.tween(cell === pressed ? 0 : NEIGHBOUR_DELAY, SWITCH_MS, (p) => shine(this.kit, bulb, on ? flickerOn(p) : flickerOff(p)));
    }
    if (state.winner === 0) {
      // Every bulb lit: a wave of light outward from the last one pressed.
      const n = state.size,
        start = NEIGHBOUR_DELAY + SWITCH_MS + 120;
      for (const bulb of this.bulbs.values()) {
        const ring = Math.abs(Math.floor(bulb.cell / n) - Math.floor(pressed / n)) + Math.abs((bulb.cell % n) - (pressed % n));
        this.tween(start + ring * 90, 520, (p) => shine(this.kit, bulb, 1 + Math.sin(p * Math.PI) * 0.9 + p * 0.08));
      }
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state || state.size !== this.size) return;
    const n = this.size,
      live = state.winner === null && !capturing(),
      hint = live && marks.hint ? marks.hint.to : -1,
      cursor = live ? (marks.cursor ?? this.hovered) : -1,
      ringAt = (ring: T.Mesh, cell: number, lift = 0) => {
        const at = cellAt(n, cell);
        ring.position.set(at.x, BOARD_TOP + 0.067 + lift, at.z);
      };
    this.hinted = hint;
    this.hintRing.visible = this.hintGlow.visible = hint >= 0;
    if (hint >= 0) {
      ringAt(this.hintRing, hint, 0.002);
      ringAt(this.hintGlow, hint, -0.001);
    }
    this.cursorRing.visible = cursor >= 0 && cursor < n * n;
    if (this.cursorRing.visible) ringAt(this.cursorRing, cursor, 0.003);
    // For browser tests: the board's size, the bulbs lit, the hint, the cursor, and where every bulb lies on the canvas.
    const el = this.renderer.domElement;
    el.dataset.size = String(n);
    el.dataset.lit = state.on.flatMap((on, i) => (on ? [i] : [])).join(" ");
    el.dataset.hint = String(hint);
    el.dataset.cursor = String(this.cursorRing.visible ? cursor : -1);
    el.dataset.places = placesOf(this.camera, el, n, () => true);
    this.redraw();
  }
  /** The bench's own frame loop: the hint's glow breathes. */
  private kick() {
    if (!this.clock && !this.disposed && this.live) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    if (this.hinted >= 0) {
      (this.hintGlow.material as T.MeshBasicMaterial).opacity = 0.25 + 0.18 * Math.sin((now / 1000) * 4);
      this.redraw();
    }
    this.kick();
  };
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    super.dispose();
  }
}
