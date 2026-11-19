import * as T from "three";
import { glossy, planks, weave, block } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import type { Arena, Disc } from "../flick/physics";
import { DT, HALF_X, HALF_Z, R, isCushion, moving, step, type Ball, type Contact } from "./sim";
import { TIP_STEPS, cueOf, nearestTip, shotCode, struck, tipCode, tipOf, type State } from "./rules";
import { BeadBoard, FLOOR, hall } from "./hall";
import { ORBIT, caromSubject } from "./layout";

export const CAROM_COLORS: [string, string] = ["#f4f1e6", "#f2c230"];
/** The cloth: tournament blue, heated, with the three spots on the long string and the sights' lines faintly. */
function cloth() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext("2d")!,
    px = (x: number) => 256 + (x / HALF_X) * 256,
    pz = (z: number) => 512 + (z / HALF_Z) * 512;
  ctx.fillStyle = "#2b5fae";
  ctx.fillRect(0, 0, 512, 1024);
  for (let i = 0; i < 7000; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(0,0,20,0.045)";
    ctx.fillRect((i * 193) % 512, (i * 419) % 1024, 2, 2);
  }
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const z of [HALF_Z / 2, 0, -HALF_Z / 2]) {
    ctx.beginPath();
    ctx.arc(px(0), pz(z), 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // The spots beside the head spot where the breaker's ball may stand.
  for (const x of [-0.64, 0.64]) {
    ctx.beginPath();
    ctx.arc(px(x), pz(HALF_Z / 2), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A carom ball's skin: its colour, with small dots of another (white and yellow carry red, the reds white) so that its turning is seen. */
function skin(color: string, dot: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = dot;
  // Four dots round the middle and one at each pole.
  for (const u of [0, 64, 128, 192, 256]) {
    ctx.beginPath();
    ctx.ellipse(u, 64, 6.5, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, 0, 256, 5);
  ctx.fillRect(0, 123, 256, 5);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** The diamonds (sights) on the rails: mother-of-pearl dots, eight spaces along a long rail and four across a short one. */
function sights(own: <R extends { dispose(): void }>(r: R) => R) {
  const dot = own(new T.CircleGeometry(0.045, 16)),
    pearl = own(new T.MeshStandardMaterial({ color: "#f5f0e2", roughness: 0.3, metalness: 0.1 })),
    group = new T.Group(),
    out = 0.3;
  const place = (x: number, z: number) => {
    const m = new T.Mesh(dot, pearl);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, RAIL_TOP + 0.002, z);
    group.add(m);
  };
  for (let k = 1; k < 8; k++) for (const x of [HALF_X + out, -HALF_X - out]) place(x, -HALF_Z + (k * 2 * HALF_Z) / 8);
  for (let k = 1; k < 4; k++) for (const z of [HALF_Z + out, -HALF_Z - out]) place(-HALF_X + (k * 2 * HALF_X) / 4, z);
  return group;
}
const CUE_LENGTH = 5.0,
  CUE_TILT = 0.07,
  /** The top of the rails, and how far they reach beyond the cushions' faces. */
  RAIL_TOP = 0.24,
  RAIL_OUT = 0.6,
  CUSHION_W = 0.14;
/** The disc a pull is aimed from. */
const asDisc = (b: Ball): Disc => ({ id: b.id, x: b.x, z: b.z, vx: 0, vz: 0, r: R, m: 1, on: true });
/**
 * A heated carom table in a Korean billiard hall, seen from its long side. A pull back from my cue ball aims it and
 * sets its strength, as in pocket ball; the little ball in the table's corner (당점) says where the tip strikes it. A
 * shot is replayed with the same physics the rules ran, ball by ball and slice by slice, each ball turning as it
 * rolls and spins.
 */
export class CaromView extends FlickView<State> {
  protected filmic() {
    return true;
  }
  protected aimColor() {
    return "#ffffff";
  }
  protected orbit = ORBIT;
  private meshes: T.Group[] = [];
  private ring: T.Mesh;
  private cue = new T.Group();
  private beads: BeadBoard;
  /** Where my tip will strike, in steps (`tipOf`): set on the picker. */
  private tip = { side: 0, high: 0 };
  private picker: HTMLDivElement;
  private pad: HTMLButtonElement;
  private dot: SVGCircleElement;
  /** The move count of the state last laid out, to tell a new shot from a state shown again. */
  private laid = -1;
  private shotClock = 0;
  private beadClock = 0;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai",
  ) {
    super(host, quality, "#14110e");
    this.scene.add(new T.HemisphereLight("#e8e2d4", "#2a2420", 1.45));
    const lamp = new T.SpotLight("#fff6e6", 3.2, 0, 0.95, 0.55, 0);
    lamp.position.set(-0.4, 11, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    const keep = <X extends { dispose(): void }>(r: X) => this.own(r);
    this.beads = hall(this.scene, keep);
    // The table: a heated slate bed under blue cloth, cushions of the same cloth, wide wooden rails with sights, a deep body.
    const timber = (turned: boolean) => {
        const wood = planks(3, keep, 0.3);
        if (turned) for (const map of [wood.map, wood.normalMap, wood.roughnessMap]) if (map) map.rotation = Math.PI / 2;
        return this.standard({ ...wood, color: "#d9b79c", roughness: 0.55 });
      },
      rail = timber(false),
      railAcross = timber(true),
      felt = { roughness: 0.92, ...weave(5, 9, keep) },
      cushion = this.standard({ color: "#2a5aa4", ...felt }),
      body = this.standard({ ...planks(2, keep, 0.4), color: "#8a6a52", roughness: 0.6 });
    const bed = HALF_X * 2 + CUSHION_W * 2,
      long = HALF_Z * 2 + CUSHION_W * 2;
    this.add(new T.BoxGeometry(bed, 0.4, long), [body, body, this.standard({ map: this.own(cloth()), ...felt }), body, body, body], 0, -0.2, 0);
    // Cushions: their faces where a ball's edge meets them, their noses a little above its middle.
    for (const z of [HALF_Z + CUSHION_W / 2, -HALF_Z - CUSHION_W / 2]) this.add(new T.BoxGeometry(bed, 0.2, CUSHION_W), cushion, 0, 0.1, z);
    for (const x of [HALF_X + CUSHION_W / 2, -HALF_X - CUSHION_W / 2]) this.add(new T.BoxGeometry(CUSHION_W, 0.2, HALF_Z * 2), cushion, x, 0.1, 0);
    const outer = RAIL_OUT - CUSHION_W;
    for (const [x, z, w, d] of [
      [0, HALF_Z + CUSHION_W + outer / 2, bed + outer * 2, outer],
      [0, -HALF_Z - CUSHION_W - outer / 2, bed + outer * 2, outer],
      [HALF_X + CUSHION_W + outer / 2, 0, outer, long],
      [-HALF_X - CUSHION_W - outer / 2, 0, outer, long],
    ])
      this.add(new T.BoxGeometry(w, RAIL_TOP + 0.2, d), w > d ? railAcross : rail, x, (RAIL_TOP - 0.2) / 2, z);
    this.scene.add(sights(keep));
    // The deep body of a carom table, its apron, and six stout legs to the carpet.
    this.add(block(bed + outer * 2 - 0.1, 0.9, long + outer * 2 - 0.1, 0.06), body, 0, -0.65, 0);
    const leg = this.standard({ color: "#3a2a1e", roughness: 0.55 });
    for (const x of [-1, 1]) for (const z of [-1, 0, 1]) this.add(block(0.7, -FLOOR - 1.05, 0.7, 0.08), leg, x * (HALF_X - 0.2), (FLOOR - 1.1) / 2, z * (HALF_Z - 0.8));
    // A little heater lamp on the apron, glowing: the slate is kept warm.
    this.add(new T.SphereGeometry(0.05, 10, 8), this.own(new T.MeshBasicMaterial({ color: "#ff5a3a" })), HALF_X + RAIL_OUT - 0.02, -0.55, HALF_Z - 0.4);
    // Chalk on the rail.
    this.add(block(0.18, 0.18, 0.18, 0.025), this.standard({ color: "#2f7fc0", roughness: 0.9 }), HALF_X + 0.38, RAIL_TOP + 0.09, -HALF_Z + 0.9);
    // The balls.
    const sphere = this.own(new T.SphereGeometry(R, 32, 20)),
      skins: [string, string][] = [
        ["#f6f3ea", "#c8281e"],
        ["#f2c230", "#c8281e"],
        ["#c8281e", "#f4ead6"],
        ["#c8281e", "#f4ead6"],
      ];
    for (const [id, [color, dot]] of skins.entries()) {
      const g = new T.Group(),
        body = new T.Mesh(sphere, this.own(glossy({ map: this.own(skin(color, dot)), roughness: 0.16 })));
      body.castShadow = true;
      // A turn at random for each, so that their dots do not all face the same way.
      body.rotation.set(id * 0.9, id * 1.7, id * 0.4);
      g.add(body);
      this.meshes.push(g);
      this.scene.add(g);
    }
    this.top = R;
    this.ring = ringMesh(keep, R + 0.08, R + 0.14, "#ffd24a");
    this.scene.add(this.ring);
    // The cue: a carom cue, maple shaft with a white ferrule and a blue tip, an ebony butt with a pale inlay.
    const stick = new T.Group(),
      piece = (from: number, to: number, a: number, b: number, color: string) => {
        const mesh = new T.Mesh(this.own(new T.CylinderGeometry(b, a, to - from, 14)), this.standard({ color, roughness: 0.35 }));
        mesh.rotation.z = Math.PI / 2;
        mesh.position.x = -(from + to) / 2;
        mesh.castShadow = true;
        stick.add(mesh);
      };
    piece(0, 0.04, 0.026, 0.026, "#3f7fd0");
    piece(0.04, 0.14, 0.026, 0.028, "#f4f1e6");
    piece(0.14, CUE_LENGTH * 0.6, 0.028, 0.048, "#e2c48e");
    piece(CUE_LENGTH * 0.6, CUE_LENGTH * 0.66, 0.048, 0.052, "#efe4c8");
    piece(CUE_LENGTH * 0.66, CUE_LENGTH, 0.052, 0.066, "#1d1410");
    stick.rotation.z = -CUE_TILT;
    this.cue.add(stick);
    this.cue.visible = false;
    this.scene.add(this.cue);
    // The tip picker (당점): a ball seen from behind the cue, a tap on it sets where the tip strikes.
    this.picker = document.createElement("div");
    this.picker.className = "ca-tip";
    this.picker.innerHTML = `<button type="button" class="ca-tip-ball"><svg viewBox="-60 -60 120 120" aria-hidden="true"><defs><radialGradient id="ca-tip-shade" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.62" stop-color="#ece6d6"/><stop offset="1" stop-color="#b9b19e"/></radialGradient></defs><circle r="54" fill="url(#ca-tip-shade)" stroke="#00000055" stroke-width="2"/><circle r="27" fill="none" stroke="#00000030" stroke-width="1.5" stroke-dasharray="4 4"/><path d="M-54 0H54M0 -54V54" stroke="#00000038" stroke-width="1.5"/><circle class="ca-tip-dot" r="9" fill="#d8262c" stroke="#ffffff" stroke-width="3"/></svg></button><span class="ca-tip-word" aria-hidden="true">당점</span>`;
    host.append(this.picker);
    this.pad = this.picker.querySelector("button")!;
    this.dot = this.picker.querySelector(".ca-tip-dot")!;
    this.bindPicker();
    this.showTip();
    this.begin();
  }
  protected subject(): TableSubject {
    return caromSubject(this.host.clientHeight);
  }
  /** Whose shot it is, and whether a person at this screen makes it. */
  private mine() {
    const s = this.state;
    return !!s && s.winner === null && (this.mode === "local" || s.turn === 0) && this.marks.movable.includes(cueOf(s.turn));
  }
  private bindPicker() {
    const pad = this.pad;
    let held: number | null = null;
    const set = (e: PointerEvent) => {
      const box = pad.getBoundingClientRect(),
        // The ball's circle fills 54 of the 60 half-width of the picture.
        reach = (box.width / 2) * (54 / 60),
        side = ((e.clientX - (box.left + box.width / 2)) / reach) * TIP_STEPS,
        high = (-(e.clientY - (box.top + box.height / 2)) / reach) * TIP_STEPS;
      this.setTip(nearestTip(side, high));
    };
    pad.addEventListener("pointerdown", (e) => {
      if (!this.mine() || this.animating) return;
      e.preventDefault();
      held = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      set(e);
    });
    pad.addEventListener("pointermove", (e) => {
      if (held === e.pointerId) set(e);
    });
    const let_go = (e: PointerEvent) => {
      if (held === e.pointerId) held = null;
    };
    pad.addEventListener("pointerup", let_go);
    pad.addEventListener("pointercancel", let_go);
    // The keyboard moves the tip a step at a time; 0 (or Home) brings it back to the middle.
    pad.addEventListener("keydown", (e) => {
      const moves: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (moves[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.mine()) return;
        const [ds, dh] = moves[e.key],
          next = { side: this.tip.side + ds, high: this.tip.high + dh };
        if (next.side ** 2 + next.high ** 2 <= TIP_STEPS ** 2) this.setTip(next);
      } else if (e.key === "0" || e.key === "Home") {
        e.preventDefault();
        if (this.mine()) this.setTip({ side: 0, high: 0 });
      }
    });
    pad.addEventListener("click", (e) => e.preventDefault());
  }
  private setTip(tip: { side: number; high: number }) {
    this.tip = { side: tip.side, high: tip.high };
    this.showTip();
  }
  /** Draws the tip on the picker and says it in words for readers. */
  private showTip(tip = this.tip) {
    const r = 54 / TIP_STEPS;
    this.dot.setAttribute("cx", String(tip.side * r));
    this.dot.setAttribute("cy", String(-tip.high * r));
    const words = tip.side === 0 && tip.high === 0 ? "가운데" : [tip.high > 0 ? `위 ${tip.high}` : tip.high < 0 ? `아래 ${-tip.high}` : "", tip.side > 0 ? `오른쪽 ${tip.side}` : tip.side < 0 ? `왼쪽 ${-tip.side}` : ""].filter(Boolean).join(", ");
    this.pad.setAttribute("aria-label", `당점: ${words}. 공의 어느 곳을 칠지 누르거나 방향키로 고릅니다`);
    this.picker.dataset.side = String(tip.side);
    this.picker.dataset.high = String(tip.high);
    this.renderer.domElement.dataset.tip = `${tip.side},${tip.high}`;
  }
  protected discs(state: State): Disc[] {
    return state.balls.map(asDisc);
  }
  protected arena(): Arena {
    return { halfX: HALF_X, halfZ: HALF_Z, cushions: true, pockets: [], friction: 0, bounce: 1 };
  }
  /** Not used: a shot is replayed by this view's own physics. */
  protected struck(): Disc[] | null {
    return null;
  }
  protected mesh(id: number) {
    return this.meshes[id];
  }
  protected shooter(point: number) {
    const s = this.state;
    if (!s || !this.mine() || point !== cueOf(s.turn)) return null;
    const b = s.balls[point];
    return { x: b.x, z: b.z };
  }
  protected shoot(point: number, degrees: number, power: number) {
    this.onMove({ from: point, to: shotCode(degrees, power), extra: tipCode(this.tip.side, this.tip.high) });
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s || !this.mine()) return [];
    const b = s.balls[cueOf(s.turn)];
    return [{ x: b.x, y: R, z: b.z, r: 0.5, point: b.id }];
  }
  protected place(state: State) {
    this.meshes.forEach((mesh, id) => {
      const b = state.balls[id];
      mesh.visible = !!b;
      if (b) mesh.position.set(b.x, R, b.z);
    });
    // A new shot to come: the tip is back in the middle.
    if (state.ply !== this.laid) {
      const fresh = this.laid === -1 || state.ply === 0;
      this.laid = state.ply;
      this.tip = { side: 0, high: 0 };
      this.beads.set(state.score, state.target, fresh);
      this.runBeads();
    }
    this.showTip();
    const canvas = this.renderer.domElement;
    canvas.dataset.turn = String(state.turn);
    canvas.dataset.score = state.score.join(",");
    canvas.dataset.kind = state.kind;
    canvas.dataset.balls = state.balls.map((b) => `${b.x.toFixed(3)},${b.z.toFixed(3)}`).join(";");
    const played = state.last && tipOf(state.last.extra);
    if (played) canvas.dataset.lastTip = `${played.side},${played.high}`;
    this.picker.classList.toggle("off", !this.mine());
    this.picker.hidden = state.winner !== null;
  }
  /** The beads slide to the score in a frame loop of their own. */
  private runBeads() {
    cancelAnimationFrame(this.beadClock);
    let then = performance.now();
    const go = () => {
      const now = performance.now(),
        moved = this.beads.tick(Math.min(0.25, (now - then) / 1000));
      then = now;
      this.redraw();
      if (moved && !this.disposed) this.beadClock = requestAnimationFrame(go);
    };
    this.beadClock = requestAnimationFrame(go);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const live = struck(before, { from: cueOf(before.turn), to: state.last.code, extra: state.last.extra });
    if (!live) return false;
    // The computer's tip is shown on the picker while its shot runs.
    const tip = tipOf(state.last.extra);
    if (tip) this.showTip(tip);
    this.run(live, () => {
      cancelAnimationFrame(this.shotClock);
      this.settleNow();
      this.place(state);
      this.onSettled();
      this.redraw();
    });
    return true;
  }
  /** Runs the balls in step with the clock, as the rules ran them, turning each as it rolls and spins, and sounding its knocks. */
  private run(live: Ball[], done: () => void) {
    cancelAnimationFrame(this.shotClock);
    // A long tween stands for the run meanwhile, so that the table counts as busy.
    this.tween(0, 120000, () => {});
    const started = performance.now(),
      contacts: Contact[] = [],
      turn = new T.Quaternion(),
      axis = new T.Vector3();
    let count = 0,
      heard = 0;
    const frame = () => {
      const due = Math.floor((performance.now() - started) / (DT * 1000));
      while (count < due && moving(live)) {
        step(live, contacts, count);
        count++;
        for (const b of live) {
          const w = Math.sqrt(b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
          if (w < 1e-6) continue;
          this.meshes[b.id].children[0].quaternion.premultiply(turn.setFromAxisAngle(axis.set(b.wx / w, b.wy / w, b.wz / w), w * DT));
        }
      }
      // What was struck since the last frame, heard as hard as the hardest of each kind.
      let ball = 0,
        rail = 0;
      for (; heard < contacts.length; heard++) {
        const c = contacts[heard];
        if (isCushion(c.b)) rail = Math.max(rail, c.speed);
        else ball = Math.max(ball, c.speed);
      }
      if (this.onKnock) {
        if (ball > 0.25) this.onKnock("disc", Math.min(1, ball / 7));
        if (rail > 0.3) this.onKnock("cushion", Math.min(1, rail / 7));
      } else if (ball > 0.25 || rail > 0.3) this.onContact();
      for (const b of live) this.meshes[b.id].position.set(b.x, R, b.z);
      this.redraw();
      if (moving(live)) this.shotClock = requestAnimationFrame(frame);
      else done();
    };
    this.shotClock = requestAnimationFrame(frame);
  }
  /** The cue behind my ball, drawn back with the pull, its tip where the picker says it strikes; raised over the rail when it must be. */
  protected aimed(aim: { x: number; z: number; angle: number; power: number } | null) {
    this.cue.visible = !!aim;
    if (!aim) return;
    const bx = -Math.cos(aim.angle),
      bz = -Math.sin(aim.angle),
      along = (d: number) => ({ x: aim.x + bx * d, z: aim.z + bz * d }),
      onCloth = (d: number) => {
        const p = along(d);
        return Math.abs(p.x) < HALF_X - 0.05 && Math.abs(p.z) < HALF_Z - 0.05;
      },
      overRail = (d: number) => {
        const p = along(d);
        return Math.abs(p.x) < HALF_X + RAIL_OUT && Math.abs(p.z) < HALF_Z + RAIL_OUT;
      };
    let edge = 0;
    while (edge < 20 && onCloth(edge)) edge += 0.02;
    const offset = Math.min(R + 0.05 + aim.power * 0.045, Math.max(R + 0.04, edge - 0.06)),
      side = (this.tip.side / TIP_STEPS) * 0.5 * R,
      high = (this.tip.high / TIP_STEPS) * 0.5 * R;
    let tilt = CUE_TILT;
    for (let d = offset; d <= offset + CUE_LENGTH; d += 0.05) {
      if (onCloth(d) || !overRail(d) || d - offset < 0.02) continue;
      const need = RAIL_TOP + 0.03 + 0.04 * ((d - offset) / CUE_LENGTH) + 0.03;
      tilt = Math.max(tilt, Math.atan2(need - R - high, d - offset));
    }
    // The tip goes where it strikes: aside along the right of the shot, up or down from the ball's middle.
    const rx = -Math.sin(aim.angle),
      rz = Math.cos(aim.angle);
    this.cue.position.set(aim.x + rx * side, R + high, aim.z + rz * side);
    this.cue.rotation.y = -aim.angle;
    const stick = this.cue.children[0];
    stick.position.x = -offset;
    stick.rotation.z = -Math.min(tilt, 1.0);
  }
  protected mark(_marks: Marks) {
    const s = this.state;
    const show = !!s && this.mine();
    this.ring.visible = show;
    if (s && show) {
      const b = s.balls[cueOf(s.turn)];
      this.ring.position.set(b.x, 0.012, b.z);
    }
    if (s) {
      this.picker.classList.toggle("off", !show);
      this.pad.disabled = !show;
    }
  }
  /** A state laid out afresh (a new game) stops a shot still running. */
  sync(state: State, animate = true) {
    cancelAnimationFrame(this.shotClock);
    super.sync(state, animate);
  }
  dispose() {
    cancelAnimationFrame(this.shotClock);
    cancelAnimationFrame(this.beadClock);
    this.picker.remove();
    super.dispose();
  }
}
