import * as T from "three";
import { wood } from "../../engine/scene-utils";
import { pub } from "../../engine/scenery";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import { copy, shotCode, shotOf, strike, type Disc } from "../flick/physics";
import { ARENA, CUE, EIGHT, HALF_X, HALF_Z, R, cueSpeed, kind, placeCode, spotFor, type State } from "./rules";

export const POOL_COLORS: [string, string] = ["#e0b020", "#2f62c0"];
const BALLS = ["#f6f3ea", "#e7b416", "#2456b8", "#c8321f", "#5a2d91", "#e0701c", "#1f7a45", "#7a1f1f", "#16181a"];
function felt() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext("2d")!,
    px = (x: number) => 256 + (x / HALF_X) * 256,
    pz = (z: number) => 512 + (z / HALF_Z) * 512;
  ctx.fillStyle = "#1f7a52";
  ctx.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
    ctx.fillRect((i * 193) % 512, (i * 419) % 1024, 2, 2);
  }
  // The head line and the two spots.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px(-HALF_X), pz(2.9));
  ctx.lineTo(px(HALF_X), pz(2.9));
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (const z of [2.9, -2]) {
    ctx.beginPath();
    ctx.arc(256, pz(z), 6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of ARENA.pockets) {
    ctx.fillStyle = "#0c0c0c";
    ctx.beginPath();
    ctx.ellipse(px(p.x), pz(p.z), (p.r / HALF_X) * 256, (p.r / HALF_Z) * 512, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function numberDisc(id: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#16181a";
  ctx.font = '800 36px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(id), 32, 34);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A pool table under a lamp in a pub. */
export class PoolView extends FlickView<State> {
  /** White against the cloth. */
  protected aimColor() {
    return "#ffffff";
  }
  private meshes: T.Object3D[] = [];
  private ring: T.Mesh;
  /** A wider white ring round the cue ball while it may be put down by hand. */
  private halo: T.Mesh;
  private cue = new T.Group();
  /** The cue ball is being carried: where it would be set down, and how far its middle is from the finger. */
  private carried: { x: number; z: number; dx: number; dz: number } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#16110d");
    this.scene.add(new T.HemisphereLight("#d8cdb8", "#221a14", 1.5));
    const lamp = new T.SpotLight("#fff0cf", 3.4, 0, 0.9, 0.5, 0);
    lamp.position.set(0, 11, 0.5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    // The table is seen from its long side, so the room is turned to keep its wall behind it.
    const room = new T.Group();
    room.rotation.y = Math.PI / 2;
    this.scene.add(room);
    pub(room, (r) => this.own(r), HALF_Z + 0.9, 3.4);
    // The table: a slate bed under green cloth, wooden rails with cushions, and legs.
    const rail = this.standard({ map: this.own(wood(true)), roughness: 0.45 }),
      cushion = this.standard({ color: "#17643f", roughness: 0.9 }),
      side = this.standard({ color: "#3a2a1c", roughness: 0.6 });
    this.add(new T.BoxGeometry(HALF_X * 2, 0.4, HALF_Z * 2), [side, side, this.standard({ map: this.own(felt()), roughness: 0.95 }), side, side, side], 0, -0.2, 0);
    for (const [x, z, w, d] of [[0, HALF_Z + 0.33, HALF_X * 2 + 1.3, 0.66], [0, -HALF_Z - 0.33, HALF_X * 2 + 1.3, 0.66], [HALF_X + 0.33, 0, 0.66, HALF_Z * 2], [-HALF_X - 0.33, 0, 0.66, HALF_Z * 2]])
      this.add(new T.BoxGeometry(w, 0.75, d), rail, x, -0.08, z);
    for (const [x, z, w, d] of [[0, HALF_Z + 0.02, HALF_X * 2 - 0.9, 0.1], [0, -HALF_Z - 0.02, HALF_X * 2 - 0.9, 0.1]]) this.add(new T.BoxGeometry(w, 0.3, d), cushion, x, 0.14, z);
    for (const x of [HALF_X + 0.02, -HALF_X - 0.02]) for (const z of [HALF_Z / 2, -HALF_Z / 2]) this.add(new T.BoxGeometry(0.1, 0.3, HALF_Z - 0.9), cushion, x, 0.14, z);
    for (const x of [-1, 1]) for (const z of [-1, 1]) this.add(new T.BoxGeometry(0.7, 3.1, 0.7), side, x * (HALF_X - 0.3), -1.9, z * (HALF_Z - 0.6));
    // A chalk cube on the rail.
    this.add(new T.BoxGeometry(0.2, 0.2, 0.2), this.standard({ color: "#2f7fc0" }), HALF_X + 0.36, 0.4, 3.6);
    const sphere = this.own(new T.SphereGeometry(R, 28, 20)),
      band = this.own(new T.SphereGeometry(R * 1.012, 28, 12, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.4)),
      spot = this.own(new T.CircleGeometry(R * 0.5, 20)),
      white = this.standard({ color: BALLS[0], roughness: 0.12 });
    for (let id = 0; id <= 15; id++) {
      const g = new T.Group(),
        colour = this.standard({ color: id === EIGHT ? BALLS[8] : BALLS[id > 8 ? id - 8 : id], roughness: 0.12 }),
        body = new T.Mesh(sphere, kind(id) === 1 ? white : colour);
      body.castShadow = true;
      g.add(body);
      // A striped ball is white with a band of its colour.
      if (kind(id) === 1) g.add(new T.Mesh(band, colour));
      if (id !== CUE) {
        const label = new T.Mesh(spot, this.own(new T.MeshBasicMaterial({ map: this.own(numberDisc(id)), transparent: true })));
        label.rotation.x = -Math.PI / 2;
        label.position.y = R + 0.002;
        g.add(label);
      }
      this.meshes.push(g);
      this.scene.add(g);
    }
    this.top = R;
    this.ring = ringMesh(<X extends { dispose(): void }>(r: X) => this.own(r), 0.26, 0.33, "#ffd24a");
    this.halo = ringMesh(<X extends { dispose(): void }>(r: X) => this.own(r), 0.4, 0.45, "#ffffff");
    this.scene.add(this.ring, this.halo);
    // The cue: pale ash with a dark butt and a blue tip, lying behind the white ball along the line of the shot.
    const stick = new T.Group(),
      length = 5.2,
      piece = (from: number, to: number, a: number, b: number, color: string) => {
        // The geometry's upper end points away from the ball once laid down.
        const mesh = new T.Mesh(this.own(new T.CylinderGeometry(b, a, to - from, 14)), this.standard({ color, roughness: 0.4 }));
        mesh.rotation.z = Math.PI / 2;
        mesh.position.x = -(from + to) / 2;
        mesh.castShadow = true;
        stick.add(mesh);
      };
    piece(0, 0.05, 0.03, 0.03, "#3f7fd0");
    piece(0.05, 0.16, 0.03, 0.032, "#f4f1e6");
    piece(0.16, length * 0.62, 0.032, 0.052, "#d9b877");
    piece(length * 0.62, length, 0.052, 0.07, "#2a1a12");
    // The butt is held a little higher than the tip, clear of the rail.
    stick.rotation.z = -0.075;
    this.cue.add(stick);
    this.cue.visible = false;
    this.scene.add(this.cue);
    this.begin();
  }
  // The length of the table lies across the screen: the white ball's end at the left.
  protected orbit = Math.PI / 2;
  protected subject(): TableSubject {
    return { half: 6.3, halfZ: 4.1, height: 0.6, lookY: 0, tilt: 1.02 };
  }
  protected discs(state: State): Disc[] {
    return state.discs;
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
    strike(live[CUE], shot.angle, cueSpeed(shot.power));
    return live;
  }
  private mine() {
    return !!this.state && this.state.winner === null && this.marks.movable.includes(CUE);
  }
  protected shooter(point: number) {
    const cue = this.state?.discs[CUE];
    return cue && point === CUE && this.mine() ? { x: cue.x, z: cue.z } : null;
  }
  /** Ball in hand: until it has been set down any press carries the white ball; afterwards a press away from it sets it down again. */
  protected dragStart(point: number, at: { x: number; z: number }) {
    const state = this.state,
      cue = state?.discs[CUE];
    if (!state || !cue || !state.hand || !this.mine() || (state.placed && point === CUE)) return super.dragStart(point, at);
    if (point !== CUE && (Math.abs(at.x) > HALF_X + 0.4 || Math.abs(at.z) > HALF_Z + 0.4)) return false;
    // Taken by the ball itself it keeps its place under the finger; a press elsewhere brings it there.
    this.carried = { x: cue.x, z: cue.z, dx: point === CUE ? cue.x - at.x : 0, dz: point === CUE ? cue.z - at.z : 0 };
    this.dragMove(at);
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    const carried = this.carried;
    if (!carried || !this.state) return super.dragMove(at);
    const spot = spotFor(this.state, at.x + carried.dx, at.z + carried.dz);
    if (!spot) return;
    carried.x = spot.x;
    carried.z = spot.z;
    // Held a little above the cloth while it is carried.
    this.meshes[CUE].position.set(spot.x, R + 0.1, spot.z);
    this.ring.position.set(spot.x, 0.012, spot.z);
    this.halo.position.set(spot.x, 0.013, spot.z);
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const carried = this.carried;
    if (!carried) return super.dragEnd(at);
    this.carried = null;
    if (at) this.onMove({ from: CUE, to: placeCode(carried.x, carried.z), extra: -1 });
    // Refused or abandoned, the ball goes back to where the rules have it.
    if (this.state) this.place(this.state);
    this.mark(this.marks);
  }
  protected shoot(_point: number, degrees: number, power: number) {
    this.onMove({ from: CUE, to: shotCode(degrees, power), extra: -1 });
  }
  protected spots(): Spot[] {
    const cue = this.state?.discs[CUE];
    return cue && this.mine() ? [{ x: cue.x, y: R, z: cue.z, r: 0.5, point: CUE }] : [];
  }
  /** A ball turns as it rolls: about the level axis across its way, by the distance gone over its radius. */
  private turn = new T.Quaternion();
  private axis = new T.Vector3();
  protected rolled(_id: number, mesh: T.Object3D, dx: number, dz: number) {
    const gone = Math.hypot(dx, dz);
    if (gone < 1e-6 || gone > 1) return;
    mesh.quaternion.premultiply(this.turn.setFromAxisAngle(this.axis.set(dz / gone, 0, -dx / gone), gone / R));
  }
  protected aimed(aim: { x: number; z: number; angle: number; power: number } | null) {
    this.cue.visible = !!aim;
    if (!aim) return;
    // Drawn back farther the harder the shot.
    this.cue.position.set(aim.x, R, aim.z);
    this.cue.rotation.y = -aim.angle;
    this.cue.children[0].position.x = -(R + 0.06 + aim.power * 0.05);
  }
  protected mark(_marks: Marks) {
    const cue = this.state?.discs[CUE];
    this.ring.visible = !!cue && this.mine();
    if (cue && this.ring.visible) this.ring.position.set(cue.x, 0.012, cue.z);
    this.halo.visible = this.ring.visible && !!this.state?.hand;
    if (cue && this.halo.visible) this.halo.position.set(cue.x, 0.013, cue.z);
  }
}
