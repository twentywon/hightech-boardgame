import * as T from "three";
import { capable, glossy } from "../../engine/scene-utils";
import { pub } from "../../engine/scenery";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import { copy, shotCode, shotOf, strike, type Disc } from "../flick/physics";
import { ARENA, CUE, HALF_X, HALF_Z, R, cueSpeed, lowest, placeCode, spotFor, type State } from "./rules";
import { RAIL_OUT, RAIL_TOP, buildTable, pocketRest } from "./table";
import { ballTexture, restingTurn } from "./balls";
import { poolCorner } from "./room";

export const POOL_COLORS: [string, string] = ["#e0b020", "#2f62c0"];
/** The cue's length and its least tilt. */
const CUE_LENGTH = 5.2,
  CUE_TILT = 0.075;
/** The cue's stroke, in milliseconds: the computer's (or another device's) cue first draws back, then every cue strikes and follows through. */
const ADDRESS = 520,
  HOLD = 140,
  FOLLOW = 150,
  LINGER = 260,
  /** How long a pocketed ball takes to drop to its place in the pocket. */
  DROP = 430;
type Pose = { x: number; z: number; angle: number; offset: number; tilt: number };
/**
 * A pool table in the corner of a pub, seen from its long side: the table of `table.ts` with its balls, the pub with
 * a hanging lamp, a cue stand and a ledge round it (`room.ts`). A shot is struck by the cue (drawn back with the pull,
 * then driven through the ball) and replayed with the same physics the rules ran; a pocketed ball drops into its
 * pocket and stays there to be seen.
 */
export class PoolView extends FlickView<State> {
  protected filmic() {
    return true;
  }
  /** White against the cloth. */
  protected aimColor() {
    return "#ffffff";
  }
  private meshes: T.Group[] = [];
  private ring: T.Mesh;
  /** A wider white ring round the cue ball while it may be put down by hand. */
  private halo: T.Mesh;
  /** Nine-ball: a thin white ring under the ball to strike first. */
  private next: T.Mesh;
  private cue = new T.Group();
  /** The cue ball is being carried: where it would be set down, and how far its middle is from the finger. */
  private carried: { x: number; z: number; dx: number; dz: number } | null = null;
  /** The balls lying in each pocket, in the order they dropped (`ARENA.pockets` order). */
  private holds: number[][] = ARENA.pockets.map(() => []);
  /** A ball on its way down into a pocket: where it went in, which pocket, and where it will rest (null: out of sight). */
  private dropping = new Map<number, { x: number; z: number; pocket: number; rest: { x: number; y: number; z: number } | null; at: number }>();
  /** Where the cue lies while a pull aims it (kept once it is let go, for `shoot`), and the pull just let go (a stroke begins from there). */
  private pose: Pose | null = null;
  private pulling = false;
  private released: (Pose & { at: number }) | null = null;
  private stroking = false;
  private cueClock = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#16110d");
    const rich = capable(),
      keep = <X extends { dispose(): void }>(r: X) => this.own(r);
    this.scene.add(new T.HemisphereLight("#d8cdb8", "#221a14", 1.5));
    const lamp = new T.SpotLight("#fff0cf", 3.4, 0, 0.9, 0.5, 0);
    lamp.position.set(0, 11, 0.5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    // The table is seen from its long side, so the pub is turned to keep its wall behind it.
    const room = new T.Group();
    room.rotation.y = Math.PI / 2;
    this.scene.add(room);
    pub(room, keep, HALF_Z + 0.9, 3.4);
    // The lamp, the cue stand, the chalkboard and the drinks table only where a graphics card draws: under software
    // drawing they cost nearly half as much again as the whole old table.
    if (rich) poolCorner(this.scene, keep, rich);
    else plainer(this.scene, keep);
    buildTable(this.scene, keep, rich);
    // The balls: one sphere each, its skin painted on its own map, a clear coat where a graphics card draws.
    const sphere = this.own(new T.SphereGeometry(R, rich ? 40 : 28, rich ? 28 : 20)),
      size = rich ? 512 : 256;
    for (let id = 0; id <= 15; id++) {
      const g = new T.Group(),
        body = new T.Mesh(sphere, this.own(glossy({ map: this.own(ballTexture(id, size)), roughness: 0.18 })));
      body.castShadow = true;
      g.add(body);
      g.quaternion.copy(restingTurn(id));
      this.meshes.push(g);
      this.scene.add(g);
    }
    this.top = R;
    this.ring = ringMesh(keep, 0.26, 0.33, "#ffd24a");
    this.halo = ringMesh(keep, 0.4, 0.45, "#ffffff");
    this.next = ringMesh(keep, R + 0.05, R + 0.09, "#ffffff");
    this.scene.add(this.ring, this.halo, this.next);
    // The cue: a leather tip, a white ferrule, a maple shaft, a brass joint, an ebony butt with a linen wrap and a rubber bumper.
    const stick = new T.Group(),
      piece = (from: number, to: number, a: number, b: number, material: T.Material) => {
        // The geometry's upper end points away from the ball once laid down.
        const mesh = new T.Mesh(this.own(new T.CylinderGeometry(b, a, to - from, 16)), material);
        mesh.rotation.z = Math.PI / 2;
        mesh.position.x = -(from + to) / 2;
        mesh.castShadow = true;
        stick.add(mesh);
      },
      paint = (color: string, roughness = 0.4, metalness = 0) => this.standard({ color, roughness, metalness }),
      L = CUE_LENGTH;
    piece(0, 0.045, 0.027, 0.028, paint("#2f6fc4", 0.8));
    piece(0.045, 0.15, 0.028, 0.03, paint("#f4f1e6", 0.3));
    piece(0.15, L * 0.5, 0.03, 0.045, paint("#e3c48f", 0.32));
    piece(L * 0.5, L * 0.515, 0.045, 0.047, paint("#c9a23a", 0.25, 0.8));
    piece(L * 0.515, L * 0.68, 0.047, 0.054, paint("#2a1712", 0.3));
    piece(L * 0.68, L * 0.86, 0.054, 0.06, paint("#1c1d22", 0.85));
    piece(L * 0.86, L * 0.985, 0.06, 0.064, paint("#2a1712", 0.3));
    piece(L * 0.985, L, 0.064, 0.06, paint("#0d0d0d", 0.9));
    // The butt is held a little higher than the tip; `aimed` raises it more where a rail is in the way.
    stick.rotation.z = -CUE_TILT;
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
  /** The pocket a place lies in (or nearest to). */
  private pocketAt(x: number, z: number) {
    let best = 0,
      nearest = Infinity;
    ARENA.pockets.forEach((p, i) => {
      const far = Math.hypot(p.x - x, p.z - z);
      if (far < nearest) {
        nearest = far;
        best = i;
      }
    });
    return best;
  }
  /** Lays the balls on the cloth, and those pocketed in their pockets (the cue ball is always on the table at rest). */
  protected place(state: State) {
    const present = new Set(state.discs.map((d) => d.id)),
      off = new Set(state.discs.filter((d) => !d.on && d.id !== CUE).map((d) => d.id));
    this.dropping.clear();
    // What is back on the table (a new game) leaves its pocket; what went down since is added, lowest number first.
    this.holds = this.holds.map((hold) => hold.filter((id) => off.has(id)));
    for (const d of state.discs)
      if (off.has(d.id) && !this.holds.some((hold) => hold.includes(d.id))) this.holds[this.pocketAt(d.x, d.z)].push(d.id);
    this.meshes.forEach((mesh, id) => (mesh.visible = present.has(id)));
    for (const d of state.discs) if (d.on) this.meshes[d.id].position.set(d.x, R, d.z);
    this.holds.forEach((hold, i) =>
      hold.forEach((id, k) => {
        const rest = pocketRest(ARENA.pockets[i], k, R),
          mesh = this.meshes[id];
        mesh.visible = !!rest;
        if (rest) mesh.position.set(rest.x, rest.y, rest.z);
      }),
    );
    if (!this.stroking && !this.pulling) this.cue.visible = false;
  }
  /**
   * A pocketed ball runs on over the lip and drops into the pocket, bouncing once on the leather, in `DROP` ms by the
   * clock (not by frames: a software-drawn page shows a few frames a second), starting where the physics took it.
   */
  protected gone(id: number, frames: number) {
    const drop = this.dropping.get(id);
    return frames >= 2 && (!drop || performance.now() - drop.at >= DROP);
  }
  protected sink(id: number, mesh: T.Object3D, _frame: number, disc?: Disc) {
    let drop = this.dropping.get(id);
    if (!drop) {
      const x = disc?.x ?? mesh.position.x,
        z = disc?.z ?? mesh.position.z,
        pocket = this.pocketAt(x, z),
        hold = this.holds[pocket],
        // The cue ball comes back up: it takes the place in the pocket without keeping it.
        rest = pocketRest(ARENA.pockets[pocket], hold.length, R);
      if (id !== CUE) hold.push(id);
      drop = { x, z, pocket, rest, at: performance.now() };
      this.dropping.set(id, drop);
    }
    const p = Math.min(1, (performance.now() - drop.at) / DROP),
      pocket = ARENA.pockets[drop.pocket],
      to = drop.rest ?? { x: pocket.x, y: -0.6, z: pocket.z },
      // Over the lip first, then down: the fall quickens, with one small bounce at the end.
      side = Math.min(1, p * 1.6),
      ease = side * (2 - side),
      fallen = p < 0.82 ? (p / 0.82) ** 2 : 1 - 0.06 * Math.sin((Math.PI * (p - 0.82)) / 0.18);
    mesh.visible = !!drop.rest || p < 1;
    mesh.position.set(drop.x + (to.x - drop.x) * ease, R + (to.y - R) * fallen, drop.z + (to.z - drop.z) * ease);
  }
  protected struck(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return null;
    const shot = shotOf(state.last.code)!,
      live = copy(before.discs);
    strike(live[CUE], shot.angle, cueSpeed(shot.power));
    return live;
  }
  /**
   * A shot is struck before it runs: the cue lies behind the white ball (drawn back first when the shot is not the
   * pull just let go here: the computer's, or another device's), is driven through it, and the balls start as the tip
   * meets the ball; it follows through and is put away.
   */
  protected animate(before: State, state: State) {
    const live = this.struck(before, state);
    if (!live || !state.last) return false;
    const shot = shotOf(state.last.code)!,
      { x, z } = before.discs[CUE],
      target = this.poseFor(x, z, shot.angle, shot.power),
      now = performance.now(),
      mine = this.released && now - this.released.at < 1500 && Math.abs(Math.cos(this.released.angle - shot.angle) - 1) < 0.01 && Math.hypot(this.released.x - x, this.released.z - z) < 0.01 ? this.released : null;
    this.released = null;
    // The table is busy from the first move of the cue; the replay's own stand-in takes over once the ball is struck.
    this.tween(0, 60000, () => {});
    const from = mine ? mine.offset : R + 0.32,
      pulled = mine ? mine.offset : target.offset,
      tilt = mine ? mine.tilt : target.tilt,
      address = mine ? 0 : ADDRESS,
      hold = mine ? 0 : HOLD,
      // A harder shot is a longer, quicker stroke: what it takes grows less than its length.
      drive = 70 + Math.sqrt(Math.max(0, pulled - R)) * 150,
      follow = 0.05 + shot.power * 0.004,
      started = now;
    let struckYet = false;
    this.stroking = true;
    cancelAnimationFrame(this.cueClock);
    const frame = () => {
      const t = performance.now() - started;
      let offset: number;
      if (t < address) {
        const p = t / address;
        offset = from + (pulled - from) * (p * p * (3 - 2 * p));
      } else if (t < address + hold) offset = pulled;
      else if (t < address + hold + drive) {
        const p = (t - address - hold) / drive;
        offset = pulled + (R - pulled) * p * p;
      } else {
        if (!struckYet) {
          struckYet = true;
          this.onKnock?.("disc", 0.12 + (shot.power / 20) * 0.3);
          this.replay(live, ARENA, () => {
            this.settleNow();
            this.place(state);
            this.onSettled();
            this.redraw();
          });
        }
        const after = t - address - hold - drive,
          p = Math.min(1, after / FOLLOW);
        offset = R - follow * p * (2 - p);
        if (after > FOLLOW + LINGER) {
          this.stroking = false;
          this.cue.visible = false;
          this.redraw();
          return;
        }
      }
      this.lay({ x, z, angle: shot.angle, offset, tilt });
      this.redraw();
      this.cueClock = requestAnimationFrame(frame);
    };
    this.lay({ x, z, angle: shot.angle, offset: from, tilt });
    this.cueClock = requestAnimationFrame(frame);
    return true;
  }
  /** A state laid out afresh (a new game) stops a stroke still under way. */
  sync(state: State, animate = true) {
    cancelAnimationFrame(this.cueClock);
    this.stroking = false;
    super.sync(state, animate);
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
    // The cue stays where the pull left it: the stroke begins there.
    const pose = this.pose;
    if (pose) {
      this.released = { ...pose, at: performance.now() };
      this.lay(pose);
    }
    this.pose = null;
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
  /**
   * Where the cue lies behind a ball at (x, z) for a shot along `angle` of `power`: drawn back farther the harder the
   * shot. It never passes through the table (the user saw it cut into the rail when pulled far back): its tip stays
   * on the cloth, short of the cushion behind the ball, and its butt is raised over the rail as a player jacks a cue
   * up, as steeply as the rail needs.
   */
  private poseFor(x: number, z: number, angle: number, power: number): Pose {
    const bx = -Math.cos(angle),
      bz = -Math.sin(angle),
      along = (d: number) => ({ x: x + bx * d, z: z + bz * d }),
      onCloth = (d: number) => {
        const p = along(d);
        return Math.abs(p.x) < HALF_X - 0.12 && Math.abs(p.z) < HALF_Z - 0.12;
      },
      overRail = (d: number) => {
        const p = along(d);
        return Math.abs(p.x) < HALF_X + RAIL_OUT && Math.abs(p.z) < HALF_Z + RAIL_OUT;
      };
    let edge = 0;
    while (edge < 20 && onCloth(edge)) edge += 0.02;
    const offset = Math.min(R + 0.06 + power * 0.05, Math.max(R + 0.06, edge - 0.08));
    let tilt = CUE_TILT;
    // Every part of the cue above the cushions and the rail must clear them, its own thickness and a little more.
    for (let d = offset; d <= offset + CUE_LENGTH; d += 0.05) {
      if (onCloth(d) || !overRail(d) || d - offset < 0.02) continue;
      const need = RAIL_TOP + 0.035 + 0.04 * ((d - offset) / CUE_LENGTH) + 0.03;
      tilt = Math.max(tilt, Math.atan2(need - R, d - offset));
    }
    return { x, z, angle, offset, tilt: Math.min(tilt, 1.0) };
  }
  /** Lays the cue: its tip `offset` behind the ball's middle along the shot, its butt raised by `tilt`. */
  private lay(pose: Pose) {
    this.cue.visible = true;
    this.cue.position.set(pose.x, R, pose.z);
    this.cue.rotation.y = -pose.angle;
    const stick = this.cue.children[0];
    stick.position.x = -pose.offset;
    stick.rotation.z = -pose.tilt;
  }
  /** The cue behind the white ball while a pull aims it. */
  protected aimed(aim: { x: number; z: number; angle: number; power: number } | null) {
    this.pulling = !!aim;
    if (!aim) {
      if (!this.stroking) this.cue.visible = false;
      return;
    }
    this.pose = this.poseFor(aim.x, aim.z, aim.angle, aim.power);
    this.lay(this.pose);
  }
  protected mark(_marks: Marks) {
    const cue = this.state?.discs[CUE];
    this.ring.visible = !!cue && this.mine();
    if (cue && this.ring.visible) this.ring.position.set(cue.x, 0.012, cue.z);
    this.halo.visible = this.ring.visible && !!this.state?.hand;
    if (cue && this.halo.visible) this.halo.position.set(cue.x, 0.013, cue.z);
    const aim = this.state?.nine ? this.state.discs.find((d) => d.id === lowest(this.state!)) : undefined;
    this.next.visible = !!aim && this.ring.visible;
    if (aim && this.next.visible) this.next.position.set(aim.x, 0.011, aim.z);
  }
  dispose() {
    cancelAnimationFrame(this.cueClock);
    super.dispose();
  }
}
/**
 * Where no graphics card draws, the pub round the table is lit the cheap way: its standard paint becomes Lambert
 * (the table and the balls keep theirs).
 */
function plainer(scene: T.Object3D, own: <R extends { dispose(): void }>(r: R) => R) {
  const swaps = new Map<T.Material, T.Material>();
  scene.traverse((thing) => {
    if (!(thing instanceof T.Mesh) || Array.isArray(thing.material) || !(thing.material instanceof T.MeshStandardMaterial)) return;
    const was = thing.material;
    let now = swaps.get(was);
    if (!now) {
      now = own(new T.MeshLambertMaterial({ map: was.map, color: was.color, transparent: was.transparent, opacity: was.opacity, side: was.side }));
      swaps.set(was, now);
    }
    thing.material = now;
  });
}
