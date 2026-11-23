import * as T from "three";
import { block, capable, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { HOLES, PAR, heightAt, type P } from "./course";
import { garden, plant, type Bloom, type Garden } from "./garden";
import { buildGreen, parts, type Green } from "./greens";
import { aimPose, ballWorld, onCanvas, overviewPose, powerOf, pullShot, setPose, speedOf, type Pose } from "./layout";
import { MAX_STROKES, parPlayed, shotMove, shotOf, total, type State } from "./rules";
import { DT, R, along, aimYaw, createWorld, free, step, type Shot, type World } from "./sim";

export const GOLF_COLORS: [string, string] = ["#ff4f5e", "#2f7fff"];
/** How long my putter takes from the pull let go to the strike, and the computer's whole swing. */
const FORWARD = 140,
  SWING = 700;
/** How long the view stays on what a putt came to: dropped in, in the water, at rest, picked up. */
const AFTER = { cup: 950, water: 1400, rest: 380, picked: 900 };
const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const EYE_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4"/><path d="M12 16V7l4 2-4 2"/></svg>`,
  BALL_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="5"/><path d="M5 20h14"/></svg>`;
/** A putt being shown: the swing, the roll in step with the clock, then what it came to. */
interface Run {
  state: State;
  k: number;
  side: 0 | 1;
  shot: Shot;
  world: World;
  from: P;
  /** When the putter meets the ball, and how far it was drawn back (metres). */
  strike: number;
  back: number;
  mine: boolean;
  stage: "swing" | "roll" | "after";
  ended: number;
  heard: number;
  /** The eye's offset from the ball as the roll began, kept while it follows the ball. */
  offset: T.Vector3;
  ahead: T.Vector3;
}
/**
 * A seaside putting course of nine holes, seen from behind the ball. A press on the ball pulled back and let go
 * putts it the other way (or ← → and Space held); the view runs the putt through the hole's physics (`sim.ts`) in
 * step with the clock, the eye following the ball, and then glides behind the ball for the next stroke, or flies on
 * to the next hole. A button in the table's corner looks over the whole hole.
 */
export class MiniGolfView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private greens: Green[] = [];
  private garden: Garden;
  private balls: T.Mesh[] = [];
  private putter = new T.Group();
  private dots: T.Mesh[] = [];
  private ring: T.Mesh;
  private splash: { ring: T.Mesh; drops: T.Mesh[]; at: T.Vector3; start: number } | null = null;
  private sun: T.DirectionalLight;
  private card: HTMLDivElement;
  private meter: HTMLDivElement;
  private button: HTMLButtonElement;
  /** Where the eye is now, and a glide under way to where it goes next. */
  private pose: Pose = { eye: new T.Vector3(0, 2, 4), look: new T.Vector3() };
  private glide: { from: Pose; to: Pose; start: number; ms: number; rise: number } | null = null;
  private overview = false;
  private run: Run | null = null;
  /** My own putt just struck, waiting for the screen to make it. */
  private pending: { at: number; until: number; back: number } | null = null;
  private press: { id: number; x: number; y: number; shot: { angle: number; speed: number; power: number } | null } | null = null;
  private keyYaw: number | null = null;
  private keyShown = 0;
  private charge: number | null = null;
  private epoch = performance.now();
  private ticker = 0;
  private frameNo = 0;
  private lastSound = 0;
  private painted = "";
  private capable = capable();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai" = "ai",
  ) {
    super(host, quality, "#cfeaf8");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.camera.far = 400;
    this.scene.fog = new T.Fog("#d9effa", 28, 150);
    this.scene.add(new T.HemisphereLight("#e6f4ff", "#6a9a48", 1.55));
    this.sun = new T.DirectionalLight("#fff3dc", 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -5;
    cam.right = cam.top = 5;
    cam.near = 1;
    cam.far = 30;
    this.sun.shadow.normalBias = 0.02;
    this.own(this.sun.shadow);
    this.scene.add(this.sun, this.sun.target);
    // The course, and the garden and the sea round it.
    const blooms: Bloom[] = [],
      shared = parts(keep);
    HOLES.forEach((_, k) => {
      const origin = { x: ballWorld(k, { x: 0, z: 0 }).x, z: 0 },
        green = buildGreen(k, origin, keep, shared, (spots) => blooms.push(...spots));
      this.scene.add(green.group);
      this.greens.push(green);
    });
    this.garden = garden(this.scene, keep, blooms);
    plant(this.scene, keep, blooms);
    // The two balls, glossy, one colour a side.
    const sphere = keep(new T.SphereGeometry(R, 32, 20));
    GOLF_COLORS.forEach((colour) => {
      const ball = new T.Mesh(sphere, keep(glossy({ color: colour, roughness: 0.32 })));
      ball.castShadow = ball.receiveShadow = true;
      ball.visible = false;
      this.scene.add(ball);
      this.balls.push(ball);
    });
    // The putter: a steel head on a shaft with a black grip, leaning to the golfer's side.
    const steel = keep(new T.MeshStandardMaterial({ color: "#d4d8de", roughness: 0.28, metalness: 0.85 })),
      grip = keep(new T.MeshStandardMaterial({ color: "#1d1f24", roughness: 0.7 })),
      head = new T.Mesh(keep(block(0.1, 0.028, 0.03, 0.008)), steel),
      shaft = new T.Group();
    head.position.set(0, 0.016, 0.006);
    head.castShadow = true;
    const rod = new T.Mesh(keep(new T.CylinderGeometry(0.0055, 0.0055, 0.62, 8)), steel),
      handle = new T.Mesh(keep(new T.CylinderGeometry(0.011, 0.009, 0.24, 10)), grip);
    rod.position.y = 0.31;
    handle.position.y = 0.73;
    rod.castShadow = handle.castShadow = true;
    shaft.add(rod, handle);
    shaft.position.set(-0.03, 0.03, 0.01);
    shaft.rotation.set(0.12, 0, 0.4);
    this.putter.add(head, shaft);
    this.putter.visible = false;
    this.scene.add(this.putter);
    // The aiming dots and the ring round a ball that may be putted.
    const dot = keep(new T.CircleGeometry(0.011, 12).rotateX(-Math.PI / 2)),
      dotPaint = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false }));
    for (let i = 0; i < 22; i++) {
      const m = new T.Mesh(dot, dotPaint);
      m.visible = false;
      m.renderOrder = 6;
      this.scene.add(m);
      this.dots.push(m);
    }
    this.ring = this.flatRing(R + 0.014, R + 0.024);
    this.scene.add(this.ring);
    // The score card, the strength of the pull, and the button that looks over the whole hole.
    this.card = document.createElement("div");
    this.card.className = "mg-card";
    this.card.setAttribute("aria-hidden", "true");
    this.meter = document.createElement("div");
    this.meter.className = "mg-power";
    this.meter.setAttribute("aria-hidden", "true");
    this.meter.hidden = true;
    this.meter.innerHTML = "<i></i><b></b>";
    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "mg-view";
    this.button.setAttribute("aria-pressed", "false");
    this.button.addEventListener("click", () => {
      this.setOverview(!this.overview);
      this.renderer.domElement.focus({ preventScroll: true });
    });
    host.append(this.card, this.meter, this.button);
    this.labelButton();
    this.listen();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.frame(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** A white ring lying on the ground, one-sided (it is only seen from above). */
  private flatRing(inner: number, outer: number) {
    const ring = new T.Mesh(this.own(new T.RingGeometry(inner, outer, 40).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthWrite: false })));
    ring.visible = false;
    ring.renderOrder = 5;
    return ring;
  }
  protected subject(): TableSubject {
    return { half: 1, halfZ: 1, height: 0.2, lookY: 0, tilt: 0.6 };
  }
  protected spots(): Spot[] {
    return [];
  }
  get animating() {
    return super.animating || !!this.run;
  }
  /** Whether a putt of mine may be made now: my turn, the ball at rest, the eye still, nothing over the table. */
  private ready() {
    const s = this.state;
    return !!s && s.winner === null && this.marks.movable.length > 0 && !this.animating && !this.glide && !document.hidden && !document.querySelector("dialog[open]");
  }
  private labelButton() {
    this.button.innerHTML = this.overview ? BALL_ICON : EYE_ICON;
    this.button.setAttribute("aria-label", this.overview ? "공 뒤에서 보기" : "홀 전체 보기");
    this.button.setAttribute("aria-pressed", String(this.overview));
  }
  private setOverview(on: boolean) {
    this.overview = on;
    this.labelButton();
    if (!this.run && this.state) this.glideTo(this.restPose(this.state), 750);
  }
  /** Where the eye rests for a state: behind the ball looking along the way to play, or over the whole hole. */
  private restPose(state: State): Pose {
    if (this.overview || state.winner !== null) return overviewPose(state.hole, this.camera.aspect || 1.6);
    return aimPose(state.hole, state.ball, this.yawFor(state));
  }
  private yawFor(state: State) {
    return aimYaw(HOLES[state.hole], state.ball);
  }
  private apply(pose: Pose) {
    this.pose = { eye: pose.eye.clone(), look: pose.look.clone() };
    setPose(this.camera, this.pose);
    this.garden?.sky.position.copy(this.camera.position);
    this.renderer.domElement.dataset.camera = this.glide ? "moving" : this.run ? "following" : this.overview ? "overview" : "aim";
    this.redraw();
  }
  private glideTo(to: Pose, ms: number) {
    const far = to.eye.distanceTo(this.pose.eye);
    if (far < 1e-3 && to.look.distanceTo(this.pose.look) < 1e-3) {
      this.glide = null;
      this.apply(to);
      return;
    }
    this.glide = { from: { eye: this.pose.eye.clone(), look: this.pose.look.clone() }, to, start: performance.now(), ms: this.reducedMotion ? 1 : ms, rise: far > 2.5 ? Math.min(1.4, far * 0.18) : 0 };
    this.renderer.domElement.dataset.camera = "moving";
  }
  protected resize() {
    super.resize();
    if (!this.glide && !this.run && this.state) this.apply(this.restPose(this.state));
    else this.apply(this.pose);
  }
  /** The windmill's sails as the view turns them: on, all the time, from the view's own clock. */
  private sails(hole: number, time: number) {
    const mill = HOLES[hole].windmill;
    return mill ? (2 * Math.PI * ((time - this.epoch) / 1000)) / mill.period : 0;
  }
  /** How far the sails stand from one to the next at `time`, as a putt struck then says it (`Shot.phase`). */
  private millPhase(hole: number, time: number) {
    const mill = HOLES[hole].windmill;
    if (!mill) return 0;
    const turns = (((time - this.epoch) / 1000) * mill.blades) / mill.period;
    return turns - Math.floor(turns);
  }
  /** Where the ball of a state lies on the screen, in page pixels, and how big it looks there. */
  private ballOnScreen(state: State) {
    const el = this.renderer.domElement,
      box = el.getBoundingClientRect(),
      at = ballWorld(state.hole, state.ball),
      c = onCanvas(this.camera, at, box.width, box.height),
      right = new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(R),
      e = onCanvas(this.camera, at.clone().add(right), box.width, box.height);
    return { x: box.left + c.x, y: box.top + c.y, r: Math.hypot(e.x - c.x, e.y - c.y), box, at };
  }
  /** Every press is the hand's (so that nothing is picked by a tap); only one on the ball draws the putter back. */
  protected dragStart() {
    return this.ready();
  }
  private listen() {
    const el = this.renderer.domElement;
    const local = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top, box };
    };
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.press || !this.ready()) return;
      const state = this.state!,
        ball = this.ballOnScreen(state);
      if (Math.hypot(e.clientX - ball.x, e.clientY - ball.y) > Math.max(46, ball.r * 3.2)) return;
      const at = local(e);
      this.press = { id: e.pointerId, x: at.x, y: at.y, shot: null };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer already gone.
      }
    });
    el.addEventListener("pointermove", (e) => {
      const press = this.press;
      if (!press || press.id !== e.pointerId || !this.state) return;
      const at = local(e);
      press.shot = pullShot(this.camera, press, at, at.box.width, at.box.height, ballWorld(this.state.hole, this.state.ball).y);
      this.aimShown();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      this.press = null;
      if (!cancelled && press.shot && this.ready()) this.shoot(press.shot.angle, press.shot.speed, press.shot.power);
      this.aimShown();
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    // The keyboard: ← → turn the aim (with Shift finely), Space held gathers strength and let go putts, V looks over the hole.
    el.addEventListener("keydown", (e) => {
      if (e.key === "v" || e.key === "V" || e.key === "ㅍ") {
        e.preventDefault();
        this.setOverview(!this.overview);
        return;
      }
      if (!this.ready()) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const turn = ((e.shiftKey ? 0.25 : 1.2) * Math.PI) / 180;
        this.keyYaw = (this.keyYaw ?? this.yawFor(this.state!)) + (e.key === "ArrowLeft" ? -turn : turn);
        this.keyShown = performance.now();
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (!e.repeat && this.charge === null) this.charge = performance.now();
      } else return;
      this.aimShown();
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key !== " " && e.key !== "Spacebar") || this.charge === null) return;
      e.preventDefault();
      const power = this.charged(performance.now());
      this.charge = null;
      if (this.ready() && power >= 0.02) this.shoot(this.keyYaw ?? this.yawFor(this.state!), speedOf(power), power);
      this.aimShown();
    });
    el.addEventListener("blur", () => {
      this.charge = null;
      this.aimShown();
    });
  }
  /** The keyboard's strength: up to full in 1.6 seconds and down again, over and over while Space is held. */
  private charged(now: number) {
    const t = this.charge === null ? 0 : ((now - this.charge) / 1600) % 2;
    return t < 1 ? t : 2 - t;
  }
  /** Putts my ball: the move says its direction and speed, and how the windmill's sails stood as it was struck. */
  private shoot(angle: number, speed: number, power: number) {
    const state = this.state!,
      now = performance.now(),
      at = now + FORWARD;
    this.pending = { at, until: now + 1500, back: 0.03 + power * 0.2 };
    this.onMove(shotMove({ angle, speed, phase: this.millPhase(state.hole, at) }));
  }
  /** What the pull or the keys aim at: the putter drawn back, a row of dots ahead and the strength at the side. */
  private aimShown() {
    const state = this.state,
      now = performance.now();
    let aim: { angle: number; power: number } | null = null;
    if (state && this.press?.shot) aim = { angle: this.press.shot.angle, power: this.press.shot.power };
    else if (state && (this.charge !== null || now - this.keyShown < 1800)) aim = { angle: this.keyYaw ?? this.yawFor(state), power: this.charge !== null ? this.charged(now) : 0.35 };
    if (!aim || !state || !this.ready() || capturing()) {
      for (const dot of this.dots) dot.visible = false;
      this.meter.hidden = true;
      if (!this.run) this.putter.visible = false;
      this.redraw();
      return;
    }
    const hole = HOLES[state.hole],
      d = along(aim.angle),
      reach = 0.22 + aim.power * 1.6;
    this.dots.forEach((dot, i) => {
      const s = R + 0.06 + i * 0.085,
        x = state.ball.x + d.x * s,
        z = state.ball.z + d.z * s;
      dot.visible = s < reach && free(hole, x, z, 0.02);
      const w = ballWorld(state.hole, { x, z });
      dot.position.set(w.x, w.y - R + 0.004, w.z);
    });
    this.showPutter(state.hole, state.ball, aim.angle, 0.03 + aim.power * 0.2);
    this.meter.hidden = false;
    this.meter.style.setProperty("--power", String(aim.power));
    this.meter.querySelector("b")!.textContent = `${Math.round(aim.power * 100)}`;
    this.redraw();
  }
  /** The putter behind a ball, its face square to `angle`, drawn back `back` metres from the ball. */
  private showPutter(k: number, at: P, angle: number, back: number) {
    const d = along(angle),
      s = R + 0.016 + back,
      x = at.x - d.x * s,
      z = at.z - d.z * s,
      w = ballWorld(k, { x, z });
    this.putter.position.set(w.x, w.y - R, w.z);
    this.putter.rotation.set(0, -angle, 0);
    this.putter.visible = true;
  }
  sync(state: State, animate = true) {
    // A new state while a putt is shown (a new game): it is cut short.
    if (this.run && state !== this.state) this.run = null;
    if (!animate) {
      this.glide = null;
      this.splash && (this.splash.ring.visible = false);
    }
    super.sync(state, animate);
  }
  protected animate(before: State, state: State) {
    const last = state.last,
      shot = last ? shotOf(last.move) : null;
    if (!last || !shot || state.ply !== before.ply + 1) return false;
    const now = performance.now(),
      mine = !!this.pending && this.pending.until > now;
    let strike: number, back: number;
    if (mine) {
      strike = Math.max(now, this.pending!.at);
      back = this.pending!.back;
    } else {
      // The computer draws its putter back and swings; at the windmill it waits for the sails to stand as its putt says.
      strike = Math.max(now, this.glide ? this.glide.start + this.glide.ms : now) + SWING;
      const mill = HOLES[last.hole].windmill;
      if (mill) {
        const wait = (((shot.phase - this.millPhase(last.hole, strike)) % 1) + 1) % 1;
        strike += (wait * mill.period * 1000) / mill.blades;
      }
      back = 0.03 + powerOf(shot.speed) * 0.2;
    }
    this.pending = null;
    this.press = null;
    this.charge = null;
    for (const dot of this.dots) dot.visible = false;
    this.meter.hidden = true;
    this.ring.visible = false;
    this.run = {
      state,
      k: last.hole,
      side: last.side,
      shot,
      world: createWorld(HOLES[last.hole], last.from, shot),
      from: last.from,
      strike,
      back,
      mine,
      stage: "swing",
      ended: 0,
      heard: 0,
      offset: new T.Vector3(),
      ahead: new T.Vector3(),
    };
    return true;
  }
  /** Everything that moves by itself: the sails, the sea, the lamp, a putt being shown, the eye gliding. */
  private frame(now: number) {
    this.frameNo++;
    const busy = !!this.run || !!this.glide || !!this.press || this.charge !== null || now - this.keyShown < 1900 || !!this.splash,
      shown = this.state?.hole ?? 0,
      // With nothing else moving, the picture is drawn again only at the windmill, for its sails (and the sea, the
      // lamp and the boats move with it); elsewhere they wait for the next putt.
      idle = !this.reducedMotion && !!HOLES[shown].windmill && (this.capable || this.frameNo % 2 === 0);
    if (!busy && !idle) return;
    this.greens.forEach((green, k) => {
      if (green.sails) green.sails.rotation.z = this.sails(k, now);
      if (green.water) green.water.offset.set((now / 9000) % 1, (now / 13000) % 1);
    });
    this.garden.sea.offset.set((now / 40000) % 1, (now / 23000) % 1);
    this.garden.lamp.rotation.y = now / 1400;
    this.garden.boats.forEach((boat, i) => (boat.position.y = -0.3 + Math.sin(now / 900 + i * 2) * 0.03));
    if (this.run) this.advance(this.run, now);
    if (this.glide) {
      const g = this.glide,
        p = ease(clamp((now - g.start) / g.ms, 0, 1)),
        eye = g.from.eye.clone().lerp(g.to.eye, p),
        look = g.from.look.clone().lerp(g.to.look, p);
      eye.y += Math.sin(Math.PI * p) * g.rise;
      if (p >= 1) this.glide = null;
      this.apply({ eye, look });
      if (!this.glide) this.mark(this.marks);
    }
    if (this.splash) this.splashing(now);
    if (!this.run && (this.press || this.charge !== null || now - this.keyShown < 1900)) this.aimShown();
    if (!this.run && this.ring.visible) (this.ring.material as T.MeshBasicMaterial).opacity = 0.55 + 0.4 * Math.sin(now / 260);
    this.redraw();
  }
  /** A putt in step with the clock: the swing, the roll, then a moment on what it came to. */
  private advance(run: Run, now: number) {
    const hole = HOLES[run.k],
      ball = this.balls[run.side],
      w = run.world;
    if (run.stage === "swing") {
      // The putter is drawn back and swung through to the ball (mine is drawn back already, by the pull).
      const angle = run.shot.angle,
        start = run.mine ? run.strike - FORWARD : run.strike - SWING;
      let back: number;
      if (run.mine) back = run.back * (1 - ease(clamp((now - start) / FORWARD, 0, 1)));
      else {
        const p = (now - start) / SWING;
        back = p < 0 ? 0 : p < 0.72 ? run.back * ease(p / 0.72) : run.back * (1 - ease((p - 0.72) / 0.28));
      }
      this.showPutter(run.k, run.from, angle, Math.max(0, back));
      const at = ballWorld(run.k, run.from);
      ball.visible = true;
      ball.position.copy(at);
      if (now < run.strike) return;
      run.stage = "roll";
      this.onKnock?.("disc", clamp(powerOf(run.shot.speed) * 1.1 + 0.15, 0.2, 1));
      run.offset.copy(this.pose.eye).sub(at);
      run.ahead.copy(this.pose.look).sub(at);
    }
    if (run.stage === "roll") {
      const due = Math.floor((now - run.strike) / (DT * 1000));
      while (w.steps < due && !w.result) step(w);
      // What the ball meets is heard, not more than one sound in a short while.
      for (; run.heard < w.knocks.length; run.heard++) {
        const knock = w.knocks[run.heard];
        if (knock.kind === "water") this.onContact();
        else if (knock.kind === "cup") this.onKnock?.("pocket", 1);
        else if (now - this.lastSound > 70) this.onKnock?.(knock.kind === "post" ? "disc" : "cushion", clamp(knock.strength / 2.5, 0.12, 1));
        this.lastSound = now;
      }
      const at = ballWorld(run.k, { x: w.x, z: w.z }),
        dx = at.x - ball.position.x,
        dz = at.z - ball.position.z,
        moved = Math.hypot(dx, dz);
      if (moved > 1e-6 && moved < 0.5) ball.rotateOnWorldAxis(new T.Vector3(dz, 0, -dx).normalize(), moved / R);
      ball.position.copy(at);
      // The putter follows through a moment, then is put away.
      const since = now - run.strike;
      if (since < 260) this.showPutter(run.k, run.from, run.shot.angle, -0.05 * Math.min(1, since / 120));
      else this.putter.visible = false;
      // The eye goes with the ball, a little behind it.
      if (!this.glide) {
        const eye = at.clone().add(run.offset),
          look = at.clone().add(run.ahead),
          lag = this.overview ? 0 : 0.12;
        this.apply({ eye: this.pose.eye.clone().lerp(eye, this.overview ? 0 : 1 - lag), look: this.pose.look.clone().lerp(look, this.overview ? 0 : 1 - lag) });
      }
      this.lift(run.k, Math.hypot(w.x - hole.cup.x, w.z - hole.cup.z));
      if (!w.result) return;
      run.stage = "after";
      run.ended = now;
      if (w.result === "water" || w.result === "out") this.splashAt(at, now);
    }
    // What it came to.
    const last = run.state.last!,
      t = now - run.ended,
      at = ballWorld(run.k, { x: w.x, z: w.z }),
      length = w.result === "cup" ? AFTER.cup : w.result === "rest" ? AFTER.rest : AFTER.water;
    if (w.result === "cup") {
      // Down into the cup.
      const cupY = heightAt(hole, hole.cup.x, hole.cup.z);
      ball.position.set(at.x, at.y - Math.min(1, t / 220) * (at.y - (cupY - 0.075)), at.z);
    } else if (w.result !== "rest") {
      // Under the water, then set down again where it was hit.
      if (t < 380) ball.position.set(at.x, at.y - (t / 380) * 0.16, at.z);
      else if (t < 800 || last.picked) ball.visible = false;
      else {
        const p = clamp((t - 800) / 450, 0, 1),
          home = ballWorld(run.k, run.from);
        ball.visible = true;
        ball.position.set(home.x, home.y + (1 - p) * (1 - p) * 0.35, home.z);
      }
    }
    // A ball picked up after the last stroke allowed rises out of play.
    const picked = last.picked && w.result !== "cup";
    if (picked && t > length - 200) {
      const p = clamp((t - (length - 200)) / AFTER.picked, 0, 1);
      ball.visible = p < 1;
      ball.position.y += p * 0.35;
      ball.scale.setScalar(Math.max(0.01, 1 - p));
    }
    if (t < length + (picked ? AFTER.picked - 200 : 0)) return;
    ball.scale.setScalar(1);
    this.finish(run);
  }
  /** The putt has been shown: the state is laid out, the eye glides on to the next stroke, and the screen is told. */
  private finish(run: Run) {
    const state = run.state;
    this.run = null;
    this.putter.visible = false;
    const to = this.restPose(state),
      far = to.eye.distanceTo(this.pose.eye);
    this.glideTo(to, Math.min(2300, 650 + far * 260));
    this.place(state);
    this.onSettled();
  }
  /** A splash where the ball went in: a ring spreading on the water and a few drops thrown up. */
  private splashAt(at: T.Vector3, now: number) {
    if (!this.splash) {
      const ring = this.flatRing(0.6, 1),
        drop = this.own(new T.SphereGeometry(0.009, 8, 6)),
        paint = this.standard({ color: "#d9f4ff", roughness: 0.2 });
      this.scene.add(ring);
      this.splash = { ring, drops: Array.from({ length: 7 }, () => {
        const m = new T.Mesh(drop, paint);
        this.scene.add(m);
        return m;
      }), at: at.clone(), start: now };
    }
    this.splash.at.copy(at);
    this.splash.at.y = -0.04;
    this.splash.start = now;
    this.splash.ring.visible = true;
  }
  private splashing(now: number) {
    const s = this.splash!,
      t = (now - s.start) / 1000;
    if (t > 1 || this.reducedMotion) {
      s.ring.visible = false;
      s.drops.forEach((d) => (d.visible = false));
      this.splash = null;
      return;
    }
    s.ring.visible = true;
    s.ring.position.set(s.at.x, s.at.y + 0.002, s.at.z);
    s.ring.scale.setScalar(0.04 + t * 0.32);
    (s.ring.material as T.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    s.drops.forEach((d, i) => {
      const a = (i / s.drops.length) * Math.PI * 2,
        v = 0.9 + (i % 3) * 0.25,
        y = s.at.y + v * t - 4.9 * t * t;
      d.visible = y > s.at.y - 0.01;
      d.position.set(s.at.x + Math.cos(a) * 0.12 * t * v, y, s.at.z + Math.sin(a) * 0.12 * t * v);
    });
  }
  /** The flag of a hole is drawn up out of its cup as a ball comes near, and fades away. */
  private lift(k: number, distance: number) {
    const green = this.greens[k],
      up = clamp((0.85 - distance) / 0.45, 0, 1),
      hole = HOLES[k];
    green.flag.position.y = heightAt(hole, hole.cup.x, hole.cup.z) - 0.06 + up * 0.45;
    green.flag.visible = up < 0.98;
    for (const paint of green.flagPaint) paint.opacity = 1 - up;
  }
  protected place(state: State) {
    if (this.run) return;
    this.paintCard(state);
    const k = state.hole,
      hole = HOLES[k];
    // The ball of the side to play where it lies; the other's is in its owner's pocket, and at the end both are.
    this.balls.forEach((ball, side) => {
      ball.visible = side === state.turn && state.winner === null;
      ball.scale.setScalar(1);
      if (side === state.turn) ball.position.copy(ballWorld(k, state.ball));
    });
    this.greens.forEach((_, i) => this.lift(i, i === k && state.winner === null ? Math.hypot(state.ball.x - hole.cup.x, state.ball.z - hole.cup.z) : 9));
    this.keyYaw = null;
    // The sun keeps the hole being played in its shadows.
    const centre = ballWorld(k, { x: (hole.tee.x + hole.cup.x) / 2, z: (hole.tee.z + hole.cup.z) / 2 });
    this.sun.position.set(centre.x - 4, 9, centre.z + 5);
    this.sun.target.position.set(centre.x, 0, centre.z);
    this.sun.target.updateMatrixWorld();
    if (!this.glide) this.apply(this.restPose(state));
    const el = this.renderer.domElement;
    el.dataset.hole = String(k + 1);
    el.dataset.strokes = String(state.strokes);
    el.dataset.side = String(state.turn);
    this.mark(this.marks);
    this.redraw();
  }
  protected mark(marks: Marks) {
    const state = this.state,
      mine = !!state && state.winner === null && marks.movable.length > 0 && !this.animating && !this.glide && !capturing();
    this.ring.visible = mine;
    if (state && mine) {
      const at = ballWorld(state.hole, state.ball);
      this.ring.position.set(at.x, at.y - R + 0.003, at.z);
    }
    this.button.hidden = capturing();
    this.redraw();
  }
  /** The score card over the table: each hole's par and each side's strokes, the hole being played lit. */
  /** Over Wi-Fi the card names the people. */
  protected seated() {
    if (this.state) this.paintCard(this.state);
  }
  private paintCard(state: State) {
    const names = !state.two ? ["나"] : (this.netNames ?? (this.mode === "ai" ? ["나", "컴퓨터"] : ["1P", "2P"])),
      said = JSON.stringify([names, state.cards, state.hole, state.turn, state.strokes, state.winner]);
    if (said === this.painted) return;
    this.painted = said;
    const head = `<tr><th>홀</th>${HOLES.map((_, k) => `<th class="${k === state.hole && state.winner === null ? "now" : ""}">${k + 1}</th>`).join("")}<th>계</th></tr>`,
      par = `<tr class="par"><th>파</th>${HOLES.map((h, k) => `<td class="${k === state.hole && state.winner === null ? "now" : ""}">${h.par}</td>`).join("")}<td>${PAR}</td></tr>`,
      rows = names
        .map((name, side) => {
          const card = state.cards[side],
            cells = HOLES.map((h, k) => {
              const n = card[k],
                now = k === state.hole && state.winner === null,
                playing = now && state.turn === side && n === null && state.strokes > 0;
              if (n === null) return `<td class="${now ? "now" : ""}" data-hole="${k}" data-side="${side}">${playing ? `<em>${state.strokes}</em>` : ""}</td>`;
              const kind = n === 1 ? "ace" : n < h.par ? "under" : n > h.par ? (n >= MAX_STROKES ? "cap" : "over") : "even";
              return `<td class="${kind}${now ? " now" : ""}" data-hole="${k}" data-side="${side}">${n}</td>`;
            }).join(""),
            sum = total(card),
            diff = sum - parPlayed(card);
          return `<tr class="side${state.winner === null && state.turn === side ? " turn" : ""}"><th><i style="background:${GOLF_COLORS[side]}"></i>${name}</th>${cells}<td class="sum" data-side="${side}">${sum}<small>${card.some((n) => n !== null) ? (diff === 0 ? "E" : diff > 0 ? `+${diff}` : `−${-diff}`) : ""}</small></td></tr>`;
        })
        .join("");
    this.card.innerHTML = `<table>${head}${par}${rows}</table>`;
  }
  dispose() {
    cancelAnimationFrame(this.ticker);
    this.card.remove();
    this.meter.remove();
    this.button.remove();
    super.dispose();
  }
}
