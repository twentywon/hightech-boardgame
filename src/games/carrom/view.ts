import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import { copy, shotCode, shotOf, speedOf, strike, type Disc } from "../flick/physics";
import { ARENA, BASE, HALF, QUEEN, REACH, SLOTS, STRIKER, clear, owner, slotX, type State } from "./rules";

export const MEN_COLORS: [string, string] = ["#f4efe2", "#22252b"];
/** Points of the base line a tap moves the striker to. */
const SLOT_BASE = 100;
function marble() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f3f0ea";
  ctx.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // Veins: long, faint, wandering strokes.
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `rgba(120,125,135,${0.05 + rand() * 0.12})`;
    ctx.lineWidth = 0.6 + rand() * 2.4;
    ctx.beginPath();
    let x = rand() * 1024,
      y = rand() * 1024;
    ctx.moveTo(x, y);
    for (let k = 0; k < 9; k++) {
      x += (rand() - 0.3) * 190;
      y += (rand() - 0.5) * 150;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Inlaid stone flowers in a ring, the way a marble floor is set with them.
  const petal = (cx: number, cy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.62, r * 0.3, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#c9a23a";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    petal(512 + Math.cos(a) * 452, 512 + Math.sin(a) * 452, 26, k % 2 ? "#a8323a" : "#2f6b5a");
    ctx.strokeStyle = "#2f6b5a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(512, 512, 452, a + 0.09, a + Math.PI / 8 - 0.09);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c9a23a";
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, 980, 980);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function surface() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!,
    px = (v: number) => 512 + (v / HALF) * 512;
  ctx.fillStyle = "#ecd9ae";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = "#7a2e22";
  ctx.lineWidth = 5;
  // The two base lines with their end circles, the side lines, the middle circle and star.
  for (const z of [BASE, -BASE])
    for (const turn of [0, 1]) {
      const along = (a: number, b: number): [number, number] => (turn ? [px(b), px(a)] : [px(a), px(b)]);
      for (const offset of [-0.2, 0.2]) {
        ctx.beginPath();
        ctx.moveTo(...along(-REACH, z + offset));
        ctx.lineTo(...along(REACH, z + offset));
        ctx.stroke();
      }
      for (const end of [-REACH, REACH]) {
        ctx.fillStyle = "#a8323a";
        ctx.beginPath();
        ctx.arc(...along(end, z), 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  ctx.beginPath();
  ctx.arc(512, 512, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#7a2e22";
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(512, 512);
    ctx.lineTo(512 + Math.cos(a - 0.14) * 60, 512 + Math.sin(a - 0.14) * 60);
    ctx.lineTo(512 + Math.cos(a) * 88, 512 + Math.sin(a) * 88);
    ctx.lineTo(512 + Math.cos(a + 0.14) * 60, 512 + Math.sin(a + 0.14) * 60);
    ctx.fill();
  }
  for (const p of ARENA.pockets) {
    ctx.fillStyle = "#17110c";
    ctx.beginPath();
    ctx.arc(px(p.x), px(p.z), (p.r / HALF) * 512, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A carrom board set on a floor of inlaid white marble. */
export class CarromView extends FlickView<State> {
  private meshes: T.Mesh[] = [];
  private ring: T.Mesh;
  private slot = Math.floor(SLOTS / 2);
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e8e4dc");
    this.daylight("#ffffff", "#cfc8ba", "#fff7e6", 10, 2.0);
    const stone = this.own(marble()),
      floor = this.add(new T.PlaneGeometry(22, 22), this.standard({ map: stone, roughness: 0.25 }), 0, -0.6, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const plain = this.add(new T.PlaneGeometry(120, 120), this.standard({ color: "#efece5", roughness: 0.3 }), 0, -0.61, 0);
    plain.rotation.x = -Math.PI / 2;
    plain.castShadow = false;
    // The board: a playing surface inside a heavy wooden frame.
    const timber = this.standard({ map: this.own(wood(true)), roughness: 0.5 });
    this.add(new T.BoxGeometry(HALF * 2, 0.3, HALF * 2), [timber, timber, this.standard({ map: this.own(surface()), roughness: 0.55 }), timber, timber, timber], 0, -0.15, 0);
    for (const [x, z, w, d] of [[0, HALF + 0.3, HALF * 2 + 1.2, 0.6], [0, -HALF - 0.3, HALF * 2 + 1.2, 0.6], [HALF + 0.3, 0, 0.6, HALF * 2], [-HALF - 0.3, 0, 0.6, HALF * 2]])
      this.add(new T.BoxGeometry(w, 0.62, d), timber, x, -0.1, z);
    const man = this.own(new T.CylinderGeometry(1, 1, 0.14, 32)),
      paints = [...MEN_COLORS, "#b3262b", "#dfe9f5"].map((color) => this.standard({ color, roughness: 0.3 }));
    for (let id = 0; id <= STRIKER; id++) {
      const r = id === STRIKER ? 0.31 : 0.23,
        mesh = new T.Mesh(man, paints[id === STRIKER ? 3 : id === QUEEN ? 2 : owner(id)!]);
      mesh.scale.set(r, 1, r);
      mesh.castShadow = true;
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
    this.top = 0.07;
    this.ring = ringMesh(<R extends { dispose(): void }>(r: R) => this.own(r), 0.36, 0.45, "#ffd24a");
    this.scene.add(this.ring);
    this.begin();
  }
  protected subject(): TableSubject {
    return { half: 5.9, halfZ: 5.9, height: 0.6, lookY: 0, tilt: 1.08 };
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
    return live;
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
