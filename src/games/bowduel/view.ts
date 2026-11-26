import * as T from "three";
import { capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { ARROW_LENGTH, arrowModel, buildArcher, paints, type Archer, type Paints } from "./figure";
import { buildField, skyTexture, HAZE_COLOUR, worldGround, type Field } from "./field";
import { KEY_STEP, pullAim, shareOf } from "./layout";
import { ANGLE, KEEP, POWER, facing, feet, flight, ground, type Land, type Shot, type State } from "./rules";

/** The two archers' colours: crimson and indigo. */
export const DUEL_COLOURS: [string, string] = ["#c3352b", "#2f5fae"];
/** The camera's field of view (degrees), how much of the field it takes in at least (half the height, half the width, m). */
const FOV = 34,
  LEAST_HALF_HEIGHT = 3.2,
  LEAST_HALF_WIDTH = 7.4,
  /** The arrow's flight is shown a little quicker than it flies. */
  QUICKER = 1.2,
  /** How long a computer's or the other device's archer takes to raise and draw its bow (ms), how long the camera holds on a landing. */
  RAISE = 750,
  HOLD = 650,
  /** How far an arrow's point goes in (m): into the ground, into an archer. */
  INTO_GROUND = 0.16,
  INTO_BODY = 0.06;
type Aim = { angle: number; power: number };
/**
 * The field from the side, the archers small at its two ends (one's own on the left: the other device sees the field
 * the other way round). At rest the camera stands by the archer to shoot, the foe out of sight beyond; a press anywhere
 * takes the string, a pull back draws (the angle and the draw shown in numbers, no line of flight), letting go looses.
 * The camera follows the arrow across the field until it strikes, holds there, and comes back to the next archer. The
 * strip at the top is the whole field: both archers, where each one's last arrow came down, and where the camera is.
 */
export class DuelView extends TableView<State> {
  private rich = capable();
  private paints: Paints;
  private archers: [Archer, Archer];
  private vanes: [T.Material, T.Material];
  private field: Field | null = null;
  private fieldKey = "";
  /** 1: side 0 on the left; −1: the field is seen from its other side (this device plays side 1 over Wi-Fi). */
  private mirror = 1;
  private flying: T.Group;
  private pool: T.Group[] = [];
  private trail: T.Line;
  private trailAt: Float32Array;
  /** Where the camera looks (world m) and where it is going; how quickly it follows (s). */
  private look = new T.Vector2(0, 2);
  private goal = new T.Vector2(0, 2);
  private lag = 0.5;
  private halfHeight = 4;
  /** The pull under way: where the press began and how far it has come (px); the keyboard's aim for each side. */
  private pull: { pointer: number | null; x: number; y: number; dx: number; dy: number } | null = null;
  private keyAim: [Aim, Aim] = [
    { angle: 45, power: 18 },
    { angle: 45, power: 18 },
  ];
  private keyHeld = false;
  /** This device's own release: its archer is already drawn, so the shot is not drawn again before it flies. */
  private loosedHere = false;
  /** The arrow in flight (world), for the camera and the strip. */
  private arrowAt: T.Vector2 | null = null;
  private hud: HTMLElement;
  private frame = 0;
  private lastTick = 0;
  private clock = 0;
  private lastAmbient = 0;
  /** Struck archers lean back for a moment: when, and how hard. */
  private flinch: [number, number] = [-1e9, -1e9];
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai",
  ) {
    super(host, quality, HAZE_COLOUR);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.camera.fov = FOV;
    this.camera.near = 0.3;
    this.camera.far = 1200;
    this.scene.background = skyTexture(keep);
    this.scene.fog = new T.Fog(HAZE_COLOUR, 140, 520);
    // A low sun from the upper left and in front, warm; the sky and the dry grass light the shadows.
    this.scene.add(new T.HemisphereLight("#cfdcff", "#8a6a44", 1.6));
    const sun = new T.DirectionalLight("#ffe0b2", 2.6);
    sun.position.set(-26, 34, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.rich ? 2048 : 1024, this.rich ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 24, bottom: -14, near: 5, far: 120 });
    sun.shadow.normalBias = 0.04;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    this.paints = paints(keep, this.rich);
    this.archers = [buildArcher(keep, this.paints, DUEL_COLOURS[0], this.rich), buildArcher(keep, this.paints, DUEL_COLOURS[1], this.rich)];
    for (const a of this.archers) {
      this.scene.add(a.root);
      a.rest();
    }
    const vane = (c: string) => keep(new T.MeshLambertMaterial({ color: c, side: T.DoubleSide }));
    this.vanes = [vane(DUEL_COLOURS[0]), vane(DUEL_COLOURS[1])];
    this.flying = arrowModel(keep, this.paints, this.vanes[0]);
    this.flying.visible = false;
    this.scene.add(this.flying);
    for (let k = 0; k < KEEP; k++) {
      const a = arrowModel(keep, this.paints, this.vanes[0]);
      a.visible = false;
      this.pool.push(a);
      this.scene.add(a);
    }
    // The arrow's way through the air, a faint line behind it while it flies (gone once it has struck).
    this.trailAt = new Float32Array(3 * 1200);
    const trail = keep(new T.BufferGeometry());
    trail.setAttribute("position", new T.BufferAttribute(this.trailAt, 3));
    trail.setDrawRange(0, 0);
    this.trail = new T.Line(trail, keep(new T.LineBasicMaterial({ color: "#fffaf0", transparent: true, opacity: 0.5, depthWrite: false })));
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    // The words over the table.
    host.style.position = "relative";
    this.hud = document.createElement("div");
    this.hud.className = "ad-hud";
    this.hud.setAttribute("aria-hidden", "true");
    const bar = (k: number) => `<div class="ad-bar ad-${k ? "r" : "l"}"><b class="ad-name"></b><span class="ad-life"><i></i></span><em class="ad-hp"></em></div>`;
    this.hud.innerHTML = `<div class="ad-top">${bar(0)}<div class="ad-mid"><svg class="ad-map" viewBox="0 0 300 40" preserveAspectRatio="none"><path class="ad-ground"></path><rect class="ad-eye" y="1" height="38"></rect><g class="ad-marks"></g><circle class="ad-man ad-m0" r="3.6"></circle><circle class="ad-man ad-m1" r="3.6"></circle><circle class="ad-dot" r="2.4"></circle></svg><div class="ad-wind"><span class="ad-arrow"></span><b>0.0</b><small>m/s</small></div></div>${bar(1)}</div><div class="ad-aim" hidden><span><small>각도</small><b class="ad-angle">0°</b></span><span><small>힘</small><b class="ad-power">0%</b></span><small class="ad-prev"></small></div><svg class="ad-pull" style="display:none"><line></line><circle r="7"></circle></svg>`;
    host.append(this.hud);
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), 0);
    this.listen();
    this.begin();
  }
  // ── Input ──
  private canDraw() {
    const s = this.state;
    return !!s && s.winner === null && !this.animating && (this.netSide === undefined ? this.mode === "local" || s.turn === 0 : this.marks.targets.length > 0) && !document.querySelector("dialog[open]");
  }
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.pull || !this.canDraw()) return;
      const box = el.getBoundingClientRect();
      this.pull = { pointer: e.pointerId, x: e.clientX - box.left, y: e.clientY - box.top, dx: 0, dy: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
      this.showPull();
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.pull || this.pull.pointer !== e.pointerId) return;
      const box = el.getBoundingClientRect();
      this.pull.dx = e.clientX - box.left - this.pull.x;
      this.pull.dy = e.clientY - box.top - this.pull.y;
      this.showPull();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.pull || this.pull.pointer !== e.pointerId) return;
      const aim = cancelled ? null : this.pullNow();
      this.pull = null;
      this.showPull();
      if (aim && this.canDraw()) this.loose(aim);
      else this.layShooter();
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => {
      const s = this.state;
      if (!s || !this.canDraw()) return;
      const aim = this.keyAim[s.turn],
        fine = e.shiftKey ? KEY_STEP.fine : 1;
      const moves: Record<string, () => void> = {
        ArrowUp: () => (aim.angle = Math.min(ANGLE.most, aim.angle + KEY_STEP.angle * fine)),
        ArrowDown: () => (aim.angle = Math.max(ANGLE.least, aim.angle - KEY_STEP.angle * fine)),
        ArrowRight: () => (aim.power = Math.min(POWER.most, aim.power + KEY_STEP.power * fine)),
        ArrowLeft: () => (aim.power = Math.max(POWER.least, aim.power - KEY_STEP.power * fine)),
      };
      if (moves[e.key]) {
        e.preventDefault();
        moves[e.key]();
        aim.angle = Math.round(aim.angle * 10) / 10;
        aim.power = Math.round(aim.power * 10) / 10;
        this.keyHeld = true;
        this.layShooter();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        this.keyHeld = false;
        this.loose({ ...aim });
      } else if (e.key === "Escape" && this.keyHeld) {
        this.keyHeld = false;
        this.layShooter();
      }
    });
  }
  /** The pull as an aim, or null while it is too short. */
  private pullNow(): Aim | null {
    const p = this.pull,
      s = this.state;
    if (!p || !s) return null;
    const el = this.renderer.domElement;
    return pullAim(p.dx, p.dy, el.clientWidth || 1, el.clientHeight || 1, this.screenFace(s.turn));
  }
  private loose(aim: Aim) {
    const s = this.state;
    if (!s) return;
    this.keyAim[s.turn] = { ...aim };
    // Taken by `animate` when the shot comes back as a move (at once here, or from the room's host).
    this.loosedHere = true;
    this.onMove({ from: -1, to: Math.round(aim.angle * 10), extra: Math.round(aim.power * 10) });
  }
  /** The pull's mark on the screen, the archer drawing with it, the numbers. */
  private showPull() {
    const svg = this.hud.querySelector<SVGSVGElement>(".ad-pull")!,
      p = this.pull;
    svg.style.display = p ? "" : "none";
    if (p) {
      const line = svg.querySelector("line")!,
        ring = svg.querySelector("circle")!;
      line.setAttribute("x1", String(p.x));
      line.setAttribute("y1", String(p.y));
      line.setAttribute("x2", String(p.x + p.dx));
      line.setAttribute("y2", String(p.y + p.dy));
      ring.setAttribute("cx", String(p.x));
      ring.setAttribute("cy", String(p.y));
    }
    this.layShooter();
  }
  /** The archer to shoot as the hand holds it: drawn to the pull or the keys' aim, else at rest; the numbers beside. */
  private layShooter() {
    const s = this.state,
      el = this.renderer.domElement,
      box = this.hud.querySelector<HTMLElement>(".ad-aim")!;
    if (!s || this.animating) return;
    const aim = this.pull ? this.pullNow() : this.keyHeld && this.canDraw() ? this.keyAim[s.turn] : null,
      shooter = this.archers[s.turn];
    if (aim) shooter.aim(aim.angle, shareOf(aim.power), true);
    else if (s.winner === null) shooter.rest();
    box.hidden = !aim || capturing();
    el.dataset.aim = aim ? `${aim.angle},${aim.power}` : "";
    el.dataset.drawn = String(!!aim);
    if (aim) {
      box.querySelector(".ad-angle")!.textContent = `${aim.angle.toFixed(1)}°`;
      box.querySelector(".ad-power")!.textContent = `${Math.round(shareOf(aim.power) * 100)}%`;
      const prev = s.prev[s.turn];
      box.querySelector(".ad-prev")!.textContent = prev ? `지난 화살 ${prev.angle.toFixed(1)}° · ${Math.round(shareOf(prev.power) * 100)}%` : "";
    }
    this.redraw();
    this.wake();
  }
  /** Every press is the hand's, never a pick. */
  protected dragStart() {
    return this.canDraw();
  }
  // ── The world ──
  /** Which way an archer faces on the screen (+1: toward the right). */
  private screenFace(side: 0 | 1): 1 | -1 {
    return (facing(side) * this.mirror) as 1 | -1;
  }
  private wx(x: number) {
    return x * this.mirror;
  }
  /** Lays the field for this state's land (again, when the land or the side seen from changes). */
  private ensureField(land: Land) {
    const mirror = this.netSide === 1 ? -1 : 1,
      key = `${JSON.stringify(land)}|${mirror}`;
    if (key === this.fieldKey) return false;
    this.mirror = mirror;
    this.field?.dispose();
    this.field = buildField(this.scene, land, mirror, DUEL_COLOURS, this.rich);
    this.fieldKey = key;
    return true;
  }
  /** Where the camera rests for `side`'s shot: the archer near the edge it stands at, the field ahead of it. */
  private restFor(land: Land, side: 0 | 1) {
    const f = feet(land, side),
      halfWidth = this.halfHeight * this.camera.aspect;
    return new T.Vector2(this.wx(f.x) + this.screenFace(side) * Math.min(halfWidth * 0.55, halfWidth - 1.6), f.y + 1.5);
  }
  private aimCamera() {
    const half = this.halfHeight,
      distance = half / Math.tan((FOV * Math.PI) / 360);
    this.camera.fov = FOV;
    this.camera.position.set(this.look.x, this.look.y + half * 0.16, distance);
    this.camera.lookAt(this.look.x, this.look.y, 0);
    this.camera.updateProjectionMatrix();
  }
  protected subject(): TableSubject {
    return { half: 6, halfZ: 2, height: 2, lookY: 1.5, tilt: 0.05 };
  }
  protected resize() {
    super.resize();
    const aspect = this.camera.aspect || 1;
    this.halfHeight = Math.max(LEAST_HALF_HEIGHT, LEAST_HALF_WIDTH / aspect);
    if (this.state && !this.animating) this.goal.copy(this.restFor(this.state.land, this.state.turn));
    this.aimCamera();
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Lays an arrow model at a point (world) pointing along `slope` (world radians), its point gone `into` metres in. */
  private layArrow(model: T.Object3D, x: number, y: number, slope: number, into: number) {
    model.position.set(x + Math.cos(slope) * into, y + Math.sin(slope) * into, 0);
    model.rotation.set(0, 0, slope);
  }
  /** A rules slope seen in the world (mirrored across when the field is). */
  private worldSlope(slope: number) {
    return Math.atan2(Math.sin(slope), Math.cos(slope) * this.mirror);
  }
  protected place(state: State) {
    const fresh = this.ensureField(state.land);
    // The archers on their mounds, each facing the other; one brought down lies where it fell.
    ([0, 1] as const).forEach((side) => {
      const a = this.archers[side],
        f = feet(state.land, side);
      a.root.position.set(this.wx(f.x), f.y, 0);
      a.root.scale.set(this.screenFace(side), 1, 1);
      a.body.rotation.z = state.health[side] <= 0 ? 1.45 : 0;
      a.body.position.y = state.health[side] <= 0 ? 0.12 : 0;
      if (side !== state.turn || state.winner !== null) a.rest();
    });
    // The arrows standing: in the ground, or in an archer (moving with it).
    state.stuck.forEach((s, k) => {
      const model = this.pool[k];
      this.paintArrow(model, s.side);
      model.visible = true;
      if (s.in === -1) {
        if (model.parent !== this.scene) this.scene.add(model);
        this.layArrow(model, this.wx(s.x), s.y, this.worldSlope(s.slope), INTO_GROUND);
        model.scale.set(1, 1, 1);
      } else {
        const body = this.archers[s.in].body;
        if (model.parent !== body) body.add(model);
        this.layArrow(model, s.x, s.y, s.slope, INTO_BODY);
      }
    });
    for (let k = state.stuck.length; k < this.pool.length; k++) {
      const model = this.pool[k];
      model.visible = false;
      if (model.parent !== this.scene) this.scene.add(model);
    }
    if (!this.animating) {
      this.flying.visible = false;
      this.trail.visible = false;
      this.arrowAt = null;
    }
    // The camera: at a new table it starts at the foe and comes back to the first archer, so the gap is seen.
    if (!this.animating) {
      const fallen = state.winner !== null ? (state.health[0] <= 0 ? 0 : 1) : null;
      this.goal.copy(fallen !== null ? this.restFor(state.land, fallen as 0 | 1) : this.restFor(state.land, state.turn));
      if (fresh && state.ply === 0) {
        this.look.copy(this.restFor(state.land, state.turn === 0 ? 1 : 0));
        this.lag = 0.9;
        this.aimCamera();
      } else this.lag = 0.55;
    }
    this.writeHud(state);
    const el = this.renderer.domElement;
    el.dataset.health = `${state.health[0]},${state.health[1]}`;
    el.dataset.wind = state.wind.toFixed(1);
    el.dataset.span = String(state.land.span);
    // The field itself, for readers of the page and the browser tests (which reckon a shot as the computer does).
    el.dataset.land = JSON.stringify(state.land);
    el.dataset.face = String(this.screenFace(state.turn));
    el.dataset.mirror = String(this.mirror);
    const last = state.last;
    el.dataset.last = last ? `${last.side},${last.part ?? (last.lost ? "lost" : "ground")},${last.hurt},${last.x}` : "";
    this.layShooter();
    this.redraw();
    this.wake();
  }
  private paintArrow(model: T.Group, side: 0 | 1) {
    model.traverse((m) => {
      if (m instanceof T.Mesh && (m.material === this.vanes[0] || m.material === this.vanes[1])) m.material = this.vanes[side];
    });
  }
  protected animate(before: State, state: State) {
    const shot = state.last;
    if (!shot || state.ply !== before.ply + 1) return false;
    const land = before.land,
      shooter = this.archers[shot.side],
      way = flight(land, shot.side, shot.angle, shot.power, shot.wind, 3),
      path = way.path,
      time = path[path.length - 1].t,
      flyMs = (time * 1000) / QUICKER,
      raise = this.loosedHere ? 0 : RAISE,
      share = shareOf(shot.power),
      el = this.renderer.domElement;
    this.loosedHere = false;
    this.pull = null;
    this.keyHeld = false;
    this.hud.querySelector<HTMLElement>(".ad-aim")!.hidden = true;
    el.dataset.aim = "";
    el.dataset.drawn = "false";
    // The archer raises its bow and draws (one that was drawn here is already drawn).
    if (raise)
      this.tween(0, raise, (p) => {
        const e = p * p * (3 - 2 * p);
        shooter.aim(-62 + (shot.angle + 62) * Math.min(1, e * 1.6), share * Math.max(0, (e - 0.35) / 0.65), true);
      });
    else shooter.aim(shot.angle, share, true);
    this.paintArrow(this.flying, shot.side);
    let shown = 0,
      loosed = false;
    const from = new T.Vector2();
    this.trailAt.fill(0);
    this.tween(raise, flyMs, (p) => {
      if (!loosed) {
        loosed = true;
        from.copy(this.look);
        shooter.aim(shot.angle, 0, false);
        this.onKnock?.("cushion", share);
        this.trail.visible = true;
        (this.trail.material as T.LineBasicMaterial).opacity = 0.5;
      }
      const t = p * time;
      let i = 0;
      while (i < path.length - 2 && path[i + 1].t < t) i++;
      const a = path[i],
        b = path[i + 1] ?? a,
        f = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t))),
        x = a.x + (b.x - a.x) * f,
        y = a.y + (b.y - a.y) * f,
        slope = Math.atan2(b.y - a.y, b.x - a.x);
      this.flying.visible = p < 1;
      this.layArrow(this.flying, this.wx(x), y, this.worldSlope(slope), 0);
      this.arrowAt = new T.Vector2(this.wx(x), y);
      // The camera keeps the arrow in sight, a little ahead of it, the ground in view as long as it can: it leaves
      // the archer for the arrow over the first half second and then goes with it (however slowly frames come).
      const ground0 = worldGround(land, this.mirror, this.wx(x)),
        ahead = Math.sign(Math.cos(this.worldSlope(slope))) * this.halfHeight * this.camera.aspect * 0.18,
        blend = Math.min(1, t / 0.5),
        ease = blend * blend * (3 - 2 * blend);
      if (p === 0 || t === 0) from.copy(this.look);
      this.goal.set(this.wx(x) + ahead, Math.max(ground0 + 1.4, y - this.halfHeight * 0.2));
      this.look.lerpVectors(from, this.goal, ease);
      this.lag = 0.12;
      this.aimCamera();
      while (shown < path.length && path[shown].t <= t && shown < 1198) {
        this.trailAt.set([this.wx(path[shown].x), path[shown].y, 0], shown * 3);
        shown++;
      }
      this.trailAt.set([this.wx(x), y, 0], shown * 3);
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.geometry.setDrawRange(0, shown + 1);
      if (p === 1) {
        this.arrowAt = null;
        if (shot.target !== null) {
          this.flinch[shot.target] = performance.now();
          this.onContact();
          this.onKnock?.("disc", shot.part === "head" ? 1 : shot.part === "body" ? 0.6 : 0.3);
        } else this.onKnock?.("pocket", shot.lost ? 0 : 0.6);
        // The arrow stands where it struck at once (the state is laid when the table rests).
        this.place(state);
        this.flying.visible = false;
      }
      this.wake();
    });
    // A beaten archer falls; a struck one staggers. The trail fades while the camera holds on the landing.
    const fallen = state.winner !== null ? (state.health[0] <= 0 ? 0 : 1) : null;
    if (fallen !== null) {
      const body = this.archers[fallen].body;
      this.tween(raise + flyMs + 150, 900, (p) => {
        const e = p < 0.7 ? (p / 0.7) ** 2 : 1 + Math.sin(((p - 0.7) / 0.3) * Math.PI) * 0.04;
        body.rotation.z = 1.45 * e;
        body.position.y = 0.12 * e;
      });
    }
    this.tween(raise + flyMs, HOLD + (fallen !== null ? 900 : 0), (p) => {
      (this.trail.material as T.LineBasicMaterial).opacity = 0.5 * (1 - p);
      if (p === 1) this.trail.visible = false;
    });
    this.wake();
    return true;
  }
  protected seated() {
    if (this.state) this.place(this.state);
  }
  protected mark(_marks: Marks) {
    this.layShooter();
  }
  // ── The words over the table ──
  private names(): [string, string] {
    return this.netNames ?? (this.mode === "ai" ? ["나", "컴퓨터"] : ["플레이어 1", "플레이어 2"]);
  }
  private writeHud(state: State) {
    const names = this.names(),
      left: 0 | 1 = this.mirror === 1 ? 0 : 1;
    ([left, (1 - left) as 0 | 1] as const).forEach((side, k) => {
      const bar = this.hud.querySelector<HTMLElement>(`.ad-${k ? "r" : "l"}`)!;
      bar.style.setProperty("--tone", DUEL_COLOURS[side]);
      bar.querySelector(".ad-name")!.textContent = names[side];
      bar.querySelector<HTMLElement>(".ad-life i")!.style.width = `${state.health[side]}%`;
      bar.querySelector(".ad-hp")!.textContent = String(state.health[side]);
      bar.classList.toggle("on", state.winner === null && state.turn === side);
      bar.dataset.low = String(state.health[side] <= 30);
    });
    // The strip: the field's profile, the archers, where each one's last arrow came down.
    const reach = state.land.span / 2 + 8,
      sx = (x: number) => ((this.wx(x) + reach) / (2 * reach)) * 300,
      lowest = -1,
      highest = 5,
      sy = (y: number) => 34 - ((y - lowest) / (highest - lowest)) * 26,
      points: string[] = [];
    for (let x = -reach; x <= reach; x += reach / 60) points.push(`${sx(x).toFixed(1)},${sy(ground(state.land, x)).toFixed(1)}`);
    const map = this.hud.querySelector<SVGSVGElement>(".ad-map")!;
    map.querySelector(".ad-ground")!.setAttribute("d", `M0,40 L${points.join(" L")} L300,40 Z`);
    ([0, 1] as const).forEach((side) => {
      const f = feet(state.land, side),
        dot = map.querySelector(`.ad-m${side}`)!;
      dot.setAttribute("cx", sx(f.x).toFixed(1));
      dot.setAttribute("cy", (sy(f.y) - 4).toFixed(1));
      dot.setAttribute("fill", DUEL_COLOURS[side]);
    });
    map.querySelector(".ad-marks")!.innerHTML = state.prev
      .map((shot: Shot | null, side) =>
        shot && !shot.lost ? `<path d="M${sx(shot.x).toFixed(1)},${(sy(shot.y) - 9).toFixed(1)} l-3,-5 h6 z" fill="${DUEL_COLOURS[side]}" stroke="#fff" stroke-width="0.8"></path>` : "",
      )
      .join("");
    const wind = this.hud.querySelector<HTMLElement>(".ad-wind")!,
      w = state.wind * this.mirror;
    wind.hidden = state.variant === "calm";
    wind.querySelector("b")!.textContent = Math.abs(state.wind).toFixed(1);
    wind.dataset.way = w > 0.05 ? "right" : w < -0.05 ? "left" : "none";
    wind.querySelector<HTMLElement>(".ad-arrow")!.style.setProperty("--w", String(Math.min(1, Math.abs(w) / 6)));
    this.hud.hidden = capturing();
    this.moveEye();
  }
  /** The camera's window on the strip, and the arrow while it flies. */
  private moveEye() {
    const s = this.state;
    if (!s) return;
    const reach = s.land.span / 2 + 8,
      sx = (x: number) => ((x + reach) / (2 * reach)) * 300,
      half = this.halfHeight * this.camera.aspect,
      map = this.hud.querySelector<SVGSVGElement>(".ad-map")!,
      eye = map.querySelector(".ad-eye")!,
      a = Math.max(0, sx(this.look.x - half)),
      b = Math.min(300, sx(this.look.x + half));
    eye.setAttribute("x", a.toFixed(1));
    eye.setAttribute("width", Math.max(2, b - a).toFixed(1));
    const dot = map.querySelector<SVGCircleElement>(".ad-dot")!;
    dot.style.display = this.arrowAt ? "" : "none";
    if (this.arrowAt) {
      dot.setAttribute("cx", sx(this.arrowAt.x).toFixed(1));
      dot.setAttribute("cy", Math.max(3, 34 - ((this.arrowAt.y + 1) / 6) * 26).toFixed(1));
    }
  }
  // ── The view's own frames: the camera following, the banners and grass in the wind, a struck archer staggering ──
  private wake() {
    if (this.frame || this.disposed) return;
    this.lastTick = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.clock += dt;
    let more = this.animating;
    // The camera eases toward its goal.
    const k = 1 - Math.exp(-dt / Math.max(0.05, this.lag)),
      gap = this.look.distanceTo(this.goal);
    if (gap > 0.004) {
      this.look.lerp(this.goal, k);
      more = true;
    } else this.look.copy(this.goal);
    this.aimCamera();
    // A struck archer staggers back and recovers.
    ([0, 1] as const).forEach((side) => {
      const since = (now - this.flinch[side]) / 1000,
        s = this.state;
      if (!s || s.health[side] <= 0) return;
      if (since < 0.6) {
        this.archers[side].body.rotation.z = Math.sin(Math.min(1, since / 0.6) * Math.PI) * 0.22;
        more = true;
      } else if (since < 1) this.archers[side].body.rotation.z = 0;
    });
    // The banners and the grass move only where a graphics card draws (each frame costs the processor dearly).
    if (this.field && this.rich && !capturing()) {
      this.field.tick(this.clock, (this.state?.wind ?? 0) * this.mirror);
      if (now - this.lastAmbient > 33 || more) {
        this.lastAmbient = now;
        this.redraw();
      }
      more = true;
    } else if (this.field && this.clock < 0.2) this.field.tick(0.6, (this.state?.wind ?? 0) * this.mirror);
    this.moveEye();
    if (more) this.redraw();
    if (more || this.rich) this.frame = requestAnimationFrame(this.tick);
  };
  dispose() {
    cancelAnimationFrame(this.frame);
    this.field?.dispose();
    this.hud.remove();
    super.dispose();
  }
}
/** How long an arrow in flight takes to land as the view shows it (ms), for the browser tests' patience. */
export const shownFlight = (time: number) => (time * 1000) / QUICKER;
export { ARROW_LENGTH };
