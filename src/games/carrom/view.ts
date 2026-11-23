import * as T from "three";
import { capable, glossy } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import { copy, shotCode, shotOf, speedOf, strike, type Disc } from "../flick/physics";
import { Specks } from "../alkkagi/pieces";
import { ARENA, BASE, QUEEN, SLOTS, STRIKER, clear, owner, slotX, type State } from "./rules";
import { NET_FLOOR, buildBoard } from "./board";
import { manGeometry, strikerGeometry } from "./men";
import { veranda } from "./veranda";

export const MEN_COLORS: [string, string] = ["#f4efe2", "#22252b"];
/** Points of the base line a tap moves the striker to. */
const SLOT_BASE = 100;
/** The pocket a man that has gone down lies in: the one nearest where it went in. */
const pocketOf = (d: Disc) => ARENA.pockets.reduce((best, p, i) => (Math.hypot(d.x - p.x, d.z - p.z) < Math.hypot(d.x - ARENA.pockets[best].x, d.z - ARENA.pockets[best].z) ? i : best), 0);
/** A carrom board on its stand in a veranda: turned wooden men, a striker, powder, and nets under the pockets. */
export class CarromView extends FlickView<State> {
  private meshes: T.Mesh[] = [];
  private ring: T.Mesh;
  private slot = Math.floor(SLOTS / 2);
  /** Powder thrown up where the striker is flicked and where a man drops into a pocket. */
  private dust: Specks;
  /** Where each disc dropping into a pocket was when it went over the edge. */
  private sinking = new Map<number, { x: number; z: number }>();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#5a3020");
    const rich = capable();
    this.daylight("#fff4e0", "#7a4a32", "#ffe9c8", 10, 2.0);
    buildBoard(this.scene, (r) => this.own(r), rich);
    veranda(this.scene, (r) => this.own(r), rich);
    const man = this.own(manGeometry(rich ? 40 : 22)),
      striker = this.own(strikerGeometry(rich ? 44 : 26)),
      paints = ["#efe2c4", "#2b2622", "#b3262b", "#f3efe6"].map((color, i) => this.own(glossy({ color, roughness: i === 1 ? 0.4 : 0.34, vertexColors: true }, 0.6)));
    for (let id = 0; id <= STRIKER; id++) {
      const r = id === STRIKER ? 0.31 : 0.23,
        mesh = new T.Mesh(id === STRIKER ? striker : man, paints[id === STRIKER ? 3 : id === QUEEN ? 2 : owner(id)!]);
      mesh.scale.set(r, 1, r);
      mesh.castShadow = true;
      mesh.receiveShadow = rich;
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
    this.top = 0.07;
    this.ring = ringMesh(<R extends { dispose(): void }>(r: R) => this.own(r), 0.36, 0.45, "#ffd24a");
    this.scene.add(this.ring);
    this.dust = new Specks(<R extends { dispose(): void }>(r: R) => this.own(r), 120, "#fbf8f0", false, 3.5, 1.6);
    this.scene.add(this.dust.points);
    this.begin();
  }
  protected resize() {
    super.resize();
    this.dust?.setScale((this.host.clientHeight * Math.min(devicePixelRatio, 2)) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }
  /** Men that have gone down lie in the net of the pocket they went into, one over another. */
  protected place(state: State) {
    for (const mesh of this.meshes) mesh.rotation.set(0, 0, 0);
    super.place(state);
    const counts = [0, 0, 0, 0];
    for (const d of state.discs) {
      if (d.on || d.id === STRIKER) continue;
      const at = this.netSpot(d, counts[pocketOf(d)]++),
        mesh = this.meshes[d.id];
      mesh.visible = true;
      mesh.position.set(at.x, at.y, at.z);
      mesh.rotation.set(at.tilt, 0, at.tilt * 0.6);
    }
  }
  /** Where the `k`-th man in a pocket's net lies. */
  private netSpot(d: Disc, k: number) {
    const p = ARENA.pockets[pocketOf(d)],
      a = d.id * 2.39996,
      off = k ? 0.1 : 0.02;
    return { x: p.x + Math.cos(a) * off, y: NET_FLOOR + 0.07 + k * 0.045, z: p.z + Math.sin(a) * off, tilt: ((d.id % 5) - 2) * 0.12 };
  }
  protected sink(id: number, mesh: T.Object3D, frame: number) {
    const state = this.state,
      disc = state?.discs[id];
    if (!disc || id === STRIKER || disc.on) {
      // The striker (a foul) drops through as before; it is fished out at once.
      super.sink(id, mesh, frame);
      return;
    }
    if (frame === 0) {
      this.sinking.set(id, { x: mesh.position.x, z: mesh.position.z });
      if (!this.reducedMotion) this.dust.burst(mesh.position.x, 0.05, mesh.position.z, 8, 0.9, 0.5, 0.07, id * 17 + 3);
    }
    const from = this.sinking.get(id) ?? { x: disc.x, z: disc.z },
      before = state.discs.filter((d) => !d.on && d.id !== STRIKER && d.id < id && pocketOf(d) === pocketOf(disc)).length,
      to = this.netSpot(disc, before),
      p = Math.min(1, frame / (this.sinkFrames - 1)),
      // It slides over the lip first, then drops into the net and settles with a little bounce.
      slide = Math.min(1, p / 0.35),
      drop = p < 0.35 ? 0 : Math.min(1, ((p - 0.35) / 0.5) ** 2),
      bounce = p > 0.85 ? Math.sin(((p - 0.85) / 0.15) * Math.PI) * 0.04 : 0;
    mesh.visible = true;
    mesh.position.set(from.x + (to.x - from.x) * slide, this.top + (to.y - this.top) * drop + bounce, from.z + (to.z - from.z) * slide);
    mesh.rotation.set(to.tilt * drop + (1 - drop) * slide * 0.5, 0, to.tilt * 0.6 * drop);
    if (frame >= this.sinkFrames - 1) this.sinking.delete(id);
  }
  protected beforeStep(_live: Disc[], _n: number) {
    this.dust.advance(1 / 120);
  }
  protected animate(before: State, state: State) {
    const going = super.animate(before, state);
    if (going && state.last && !this.reducedMotion) {
      // The striker's flick lifts a little powder from the board.
      this.dust.clear();
      this.dust.burst(slotX(state.last.slot), 0.03, state.last.by === 0 ? BASE : -BASE, 10, 0.7, 0.55, 0.06, state.ply);
    }
    return going;
  }
  protected subject(): TableSubject {
    return { half: 5.9, halfZ: 5.9, height: 0.6, lookY: 0, tilt: 1.08 };
  }
  /** Over Wi-Fi the black side's device sees the board from its own base line (the far side at one screen). */
  protected seated() {
    this.faceFrom(this.netSide === 1 ? Math.PI : 0);
  }
  /** Whether the striker is mine to place and shoot now. */
  private mine() {
    return !!this.state && this.state.winner === null && this.marks.movable.includes(STRIKER);
  }
  protected discs(state: State): Disc[] {
    const discs = copy(state.discs);
    if (this.mine()) {
      // The striker waits on my base line, at the nearest slot that is clear.
      if (!clear(state, this.slot)) this.slot = [...Array(SLOTS).keys()].sort((a, b) => Math.abs(a - this.slot) - Math.abs(b - this.slot)).find((slot) => clear(state, slot)) ?? this.slot;
      Object.assign(discs[STRIKER], { x: slotX(this.slot), z: state.turn === 0 ? BASE : -BASE, on: true });
    }
    return discs;
  }
  protected arena() {
    return ARENA;
  }
  protected mesh(id: number) {
    return this.meshes[id];
  }
  protected struck(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return null;
    const shot = shotOf(state.last.code)!,
      live = copy(before.discs);
    Object.assign(live[STRIKER], { x: slotX(state.last.slot), z: state.last.by === 0 ? BASE : -BASE, on: true });
    strike(live[STRIKER], shot.angle, speedOf(shot.power));
    // Men already in the nets stay there: only what is on the board is run (the order of the rest is kept, so the
    // shot runs exactly as the rules ran it).
    return live.filter((d) => d.on);
  }
  protected shooter(point: number) {
    const state = this.state;
    return state && point === STRIKER && this.mine() ? { x: slotX(this.slot), z: state.turn === 0 ? BASE : -BASE } : null;
  }
  protected dragStart(point: number, at: { x: number; z: number }) {
    if (point >= SLOT_BASE && this.mine()) {
      // A tap on the base line moves the striker there.
      this.slot = point - SLOT_BASE;
      if (this.state) this.place(this.state);
      this.mark(this.marks);
      this.redraw();
      return true;
    }
    return super.dragStart(point, at);
  }
  protected shoot(_point: number, degrees: number, power: number) {
    const state = this.state;
    if (!state) return;
    // Only up the board, away from my own side.
    const forward = state.turn === 0 ? Math.sin((degrees * Math.PI) / 180) < 0 : Math.sin((degrees * Math.PI) / 180) > 0;
    if (forward) this.onMove({ from: STRIKER, to: shotCode(degrees, power), extra: this.slot });
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || !this.mine()) return [];
    const z = state.turn === 0 ? BASE : -BASE,
      out: Spot[] = [{ x: slotX(this.slot), y: 0.1, z, r: 0.5, point: STRIKER }];
    // Slots under the striker itself are left out: a press there aims.
    for (let slot = 0; slot < SLOTS; slot++)
      if (clear(state, slot) && Math.abs(slotX(slot) - slotX(this.slot)) > 0.55) out.push({ x: slotX(slot), y: 0.05, z, r: 0.22, point: SLOT_BASE + slot });
    return out;
  }
  protected mark(_marks: Marks) {
    const state = this.state;
    // The striker comes and goes with my turn; a shot being replayed is left alone.
    if (state && !this.animating) this.place(state);
    this.ring.visible = this.mine();
    if (state && this.ring.visible) this.ring.position.set(slotX(this.slot), 0.012, state.turn === 0 ? BASE : -BASE);
  }
}
