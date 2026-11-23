import * as T from "three";
import { block } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { DRAW, FACE_Y, FACE_Z, archerCamera, dragAim, rising, tremor } from "./layout";
import { FAR, blow, buildRange, windVector, type Range } from "./range";
import { DISTANCE, SET_ARROWS, aimCode, fly, type Arrow, type State, type Wind } from "./rules";

/** The vanes and nocks of each side's arrows. */
export const ARCHERY_COLORS: [string, string] = ["#e2392d", "#2f6fe0"];
/** How long an arrow wobbles once it has struck, how long the camera takes to draw back after a release (ms). */
const WOBBLE = 320,
  EASE_OUT = 650,
  /** The arrows are drawn a little larger than life, so that they read at seventy metres. */
  LARGER = 1.3,
  /** How deep an arrow's point goes into the boss (m). */
  SUNK = 0.1,
  /** Where the computer stands on the line, beside me (m to the left). */
  BESIDE = -1.25,
  /** The arrow in flight is shown once it is this far down the range (m): nearer, it would pass through the eye. */
  SHOWN_FROM = 1.4,
  /** How far before it strikes the inset comes up (s), so that the arrow is seen arriving. */
  INSET_EARLY = 0.12,
  /** How far before the eye the sight's aperture is held (m), and the field the bow is modelled for (degrees). */
  APERTURE = 0.9,
  BOW_FOV = 17;
/** Where an arrow's vanes stand round its shaft. */
const VANES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
/**
 * The range from the shooting line, in the first person. At rest the eye takes in the field; a press draws the bow,
 * the eye closes on the target and the sight's aperture comes up with its pin, which trembles and wanders as a hand
 * does (`tremor`), more and more the longer the bow is held; a drag moves it. Letting go shoots at the point the pin
 * was on: the move names it and the rules fly the arrow through its wind. The arrow is seen arcing down the range;
 * a close camera on the target (the inset, as on television) comes up as it strikes and stays until the next draw.
 * The wind of the arrow to be shot shows on the socks, the target's flag and a small gauge.
 */
export class ArcheryView extends TableView<State> {
  private range: Range;
  private models: T.Group[] = [];
  private vaneSides: T.Material[];
  private trail: T.Line;
  private trailAt: Float32Array;
  /** The bow in the hand: a group under the camera (`bow`) and the rig in it that follows the pin (`rig`). */
  private bow = new T.Group();
  private rig = new T.Group();
  private aperture: T.Object3D[] = [];
  /** The draw under way: where the press began and how far it has moved (pixels), when it began, where in the tremor. */
  private drawn: { pointer: number | null; x: number; y: number; dx: number; dy: number; since: number; seed: number } | null = null;
  /** The keyboard's aim (mm), kept while a key holds the bow drawn. */
  private keyAim = { x: 0, y: 0 };
  /** How far the eye has closed on the target (0 to 1), and when the bow was last let go (for its follow-through). */
  private zoom = 0;
  private released = -1;
  /** The wind shown on the socks and flag (a vector over the ground), and the wind of the arrow to come. */
  private shownWind = { x: 0, z: 0 };
  private wind: Wind = { speed: 0, dir: 0 };
  /** Old arrows taken out of the target as the first of a new end is drawn: the count of arrows shot when it was. */
  private clearedAt = -1;
  /** The inset: its camera, whether it is up, and where on the canvas (CSS pixels from the top left). */
  private tvCamera = new T.PerspectiveCamera(30, 1.25, 0.4, 16);
  private tvOn = false;
  private tvRect = { x: 0, y: 0, w: 0, h: 0 };
  private insetRendering = false;
  /** The words over the table: the inset's frame and caption, the score bug and the wind gauge. */
  private hud: HTMLElement;
  private frame = 0;
  private lastTick = 0;
  private flutter = 0;
  /** Each arrow's last direction of flight, by where it struck and its wind, for laying it in the boss. */
  private heading = new Map<string, T.Vector3>();
  private watch: MutationObserver;
  /** A shot's sounds: the bow let go ("cushion"), the arrow striking the boss ("disc", its value over ten) or the grass ("pocket"). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai",
  ) {
    super(host, quality, "#cfe0ec");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.camera.near = 0.3;
    this.camera.far = 700;
    this.camera.layers.enable(FAR);
    this.scene.add(this.camera);
    // A clear summer afternoon: sky light, a sun from behind the archer's left, a soft fill.
    this.scene.add(new T.HemisphereLight("#dcebff", "#4d6a32", 1.45));
    const sun = new T.DirectionalLight("#fff2dc", 2.5);
    sun.position.set(-22, 38, FACE_Z + 46);
    sun.target.position.set(0, FACE_Y, FACE_Z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 20, far: 90 });
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    this.range = buildRange(this.scene, keep, (g, m, x, y, z, parent) => this.add(g, m, x, y, z, parent), (o) => this.standard(o));
    // The arrows: a steel point, a carbon shaft, a nock and three vanes of the side's colour.
    this.vaneSides = ARCHERY_COLORS.map((c) => this.standard({ color: c, roughness: 0.55, side: T.DoubleSide }));
    for (let k = 0; k < 8; k++) this.models.push(this.arrowModel(keep));
    // The arrow's way through the air, left behind it as a thin line.
    this.trailAt = new Float32Array(3 * 400);
    const trail = keep(new T.BufferGeometry());
    trail.setAttribute("position", new T.BufferAttribute(this.trailAt, 3));
    trail.setDrawRange(0, 0);
    this.trail = new T.Line(trail, keep(new T.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false })));
    this.trail.frustumCulled = false;
    this.trail.layers.set(FAR);
    this.scene.add(this.trail);
    this.buildBow(keep);
    // The inset looks at the face from close in front, from where the arrows come (a little above, as they come
    // down), so that they are seen nearly end on, each by its hole; a little from the right, for depth.
    this.tvCamera.position.set(0.16, FACE_Y + 0.3, FACE_Z + 2.6);
    this.tvCamera.lookAt(0, FACE_Y, FACE_Z);
    this.scene.onAfterRender = (renderer) => this.renderInset(renderer);
    // The words over the table: decoration for the eye (the panel, unseen, keeps them for readers).
    host.style.position = "relative";
    this.hud = document.createElement("div");
    this.hud.className = "ar-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.hud.innerHTML = `<div class="ar-tv" hidden><span class="ar-tv-tag">TARGET CAM</span><div class="ar-tv-cap"><i></i><b></b><span></span><em></em></div></div><div class="ar-bug"></div><div class="ar-wind"><svg viewBox="-22 -22 44 44"><circle class="ar-wind-dial" r="19"></circle><path class="ar-wind-tick" d="M19 0H15M0 19V15M-19 0H-15"></path><circle class="ar-wind-goal" cy="-18" r="3.2"></circle><g><path class="ar-wind-arrow" d="M0 12V-11M-6 -4 0 -12 6 -4"></path></g></svg><div><small>바람</small><b>0.0</b><small>m/s</small></div></div>`;
    host.append(this.hud);
    // A thumbnail being captured: the inset (drawn into the picture itself) and the bow are left out from then on.
    this.watch = new MutationObserver(() => {
      if (capturing()) this.inset(false);
      this.poseBow(performance.now());
      this.redraw();
    });
    this.watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-capture"] });
    // The shooter's eye is the camera; presses are the hand's, taken here and not as picks.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), -FACE_Z);
    this.listen();
    this.begin();
  }
  /** One arrow, pointing along −z with its point at the origin (its tail along +z). */
  private arrowModel(keep: <R extends { dispose(): void }>(r: R) => R) {
    const L = 0.74,
      R = 0.0035,
      g = new T.Group(),
      steel = this.models.length ? (this.models[0].userData.steel as T.Material) : this.standard({ color: "#d5d9de", roughness: 0.25, metalness: 0.9 }),
      carbon = this.models.length ? (this.models[0].userData.carbon as T.Material) : this.standard({ color: "#202326", roughness: 0.35, metalness: 0.3 }),
      shapes = this.models.length
        ? (this.models[0].userData.shapes as T.BufferGeometry[])
        : (() => {
            const point = keep(new T.ConeGeometry(R * 1.2, 0.035, 10).rotateX(-Math.PI / 2).translate(0, 0, 0.0175)),
              shaft = keep(new T.CylinderGeometry(R, R, L - 0.05, 8).rotateX(Math.PI / 2).translate(0, 0, 0.035 + (L - 0.05) / 2)),
              nock = keep(new T.CylinderGeometry(R * 1.15, R * 1.3, 0.022, 8).rotateX(Math.PI / 2).translate(0, 0, L - 0.011)),
              outline = new T.Shape();
            // A vane: low at its front, rising to a rounded back.
            outline.moveTo(0, 0);
            outline.quadraticCurveTo(0.004, 0.06, 0.016, 0.085);
            outline.lineTo(0.004, 0.095);
            outline.lineTo(0, 0.095);
            outline.closePath();
            const vane = keep(new T.ShapeGeometry(outline, 6).rotateX(Math.PI / 2).translate(R, 0, L - 0.13));
            return [point, shaft, nock, vane];
          })();
    // The arrows cast no shadow: on the face their shadows read as more arrows in the inset.
    for (const [shape, paint] of [[shapes[0], steel], [shapes[1], carbon], [shapes[2], this.vaneSides[0]]] as const) {
      const mesh = new T.Mesh(shape, paint);
      g.add(mesh);
      if (shape === shapes[2]) g.userData.nock = mesh;
    }
    const vanes: T.Mesh[] = [];
    VANES.forEach((a, i) => {
      // The first vane (the cock vane) is white; the others are the side's colour.
      const holder = new T.Group(),
        mesh = new T.Mesh(shapes[3], i === 0 ? (this.models.length ? (this.models[0].userData.cock as T.Material) : this.standard({ color: "#f4f4f0", roughness: 0.55, side: T.DoubleSide })) : this.vaneSides[0]);
      holder.rotation.z = a;
      holder.add(mesh);
      g.add(holder);
      if (i) vanes.push(mesh);
      if (i === 0) g.userData.cock = mesh.material;
    });
    g.userData = { ...g.userData, steel, carbon, shapes, vanes };
    g.scale.setScalar(LARGER);
    g.visible = false;
    this.scene.add(g);
    return g;
  }
  /** Gives an arrow the colours of the side that shot it. */
  private paint(model: T.Group, side: 0 | 1) {
    const paint = this.vaneSides[side];
    for (const vane of model.userData.vanes as T.Mesh[]) vane.material = paint;
    (model.userData.nock as T.Mesh).material = paint;
  }
  /**
   * The bow in the archer's hand, modelled as seen at the eye with the field of view at rest (`BOW_FOV`): the sight's
   * aperture with its pin (the rig's origin), the sight's bar to the riser at the left, the riser and its limbs going
   * out of sight above and below, a long rod forward, and the arrow on the rest. The group under the camera is
   * squeezed across as the eye closes in, so that the bow keeps its size on the screen while the target grows.
   */
  private buildBow(keep: <R extends { dispose(): void }>(r: R) => R) {
    this.camera.add(this.bow);
    this.bow.add(this.rig);
    this.bow.visible = false;
    const riser = this.standard({ color: "#28406e", roughness: 0.35, metalness: 0.6 }),
      limb = this.standard({ color: "#17191c", roughness: 0.4, metalness: 0.2 }),
      silver = this.standard({ color: "#b9bfc6", roughness: 0.3, metalness: 0.8 }),
      grip = this.standard({ color: "#6b4a30", roughness: 0.7 }),
      carbon = this.standard({ color: "#202326", roughness: 0.4, metalness: 0.3 }),
      vane = this.vaneSides[0];
    const bar = (from: T.Vector3, to: T.Vector3, w: number, d: number, paint: T.Material) => {
      const length = from.distanceTo(to),
        mesh = new T.Mesh(keep(block(w, length, d, Math.min(w, d) * 0.3)), paint);
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this.rig.add(mesh);
      return mesh;
    };
    const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
    // The aperture: a black housing, a thin ring, and a bright pin at its middle on a fine stem.
    const front = { depthTest: false, depthWrite: false, transparent: true } as const,
      housing = new T.Mesh(keep(new T.RingGeometry(0.0118, 0.0152, 40)), keep(new T.MeshBasicMaterial({ color: "#121416", opacity: 0.92, ...front }))),
      ring = new T.Mesh(keep(new T.RingGeometry(0.0112, 0.0122, 40)), keep(new T.MeshBasicMaterial({ color: "#f2f4f6", opacity: 0.85, ...front }))),
      stem = new T.Mesh(keep(new T.PlaneGeometry(0.0005, 0.0108).translate(0, -0.0064, 0)), keep(new T.MeshBasicMaterial({ color: "#16181a", opacity: 0.8, ...front }))),
      halo = new T.Mesh(keep(new T.CircleGeometry(0.0017, 20)), keep(new T.MeshBasicMaterial({ color: "#0b1a0b", opacity: 0.85, ...front }))),
      pin = new T.Mesh(keep(new T.CircleGeometry(0.00115, 20)), keep(new T.MeshBasicMaterial({ color: "#4dff6a", ...front })));
    [housing, ring, stem, halo, pin].forEach((m, i) => {
      m.renderOrder = 40 + i;
      this.rig.add(m);
      this.aperture.push(m);
    });
    // The sight's block and bar back to the riser.
    bar(V(-0.017, -0.017, 0.004), V(-0.1, -0.05, 0.17), 0.004, 0.006, silver);
    const mount = new T.Mesh(keep(block(0.009, 0.016, 0.014, 0.002)), silver);
    mount.position.set(-0.017, -0.016, 0.006);
    this.rig.add(mount);
    // The riser, its grip, the limbs; the long rod and its weight; the arrow lying on the rest.
    bar(V(-0.118, -0.3, 0.2), V(-0.114, 0.24, 0.19), 0.017, 0.045, riser);
    bar(V(-0.122, -0.36, 0.22), V(-0.12, -0.22, 0.215), 0.024, 0.055, grip);
    bar(V(-0.114, 0.22, 0.19), V(-0.13, 0.7, 0.36), 0.026, 0.01, limb);
    bar(V(-0.118, -0.28, 0.2), V(-0.132, -0.76, 0.37), 0.026, 0.01, limb);
    bar(V(-0.112, -0.16, 0.17), V(-0.09, -0.3, -0.75), 0.01, 0.01, carbon);
    const weight = new T.Mesh(keep(new T.CylinderGeometry(0.014, 0.014, 0.05, 12).rotateX(Math.PI / 2)), silver);
    weight.position.set(-0.09, -0.3, -0.76);
    this.rig.add(weight);
    bar(V(-0.1, -0.055, 0.16), V(-0.012, -0.13, 0.55), 0.004, 0.004, carbon);
    const tip = new T.Mesh(keep(new T.ConeGeometry(0.0028, 0.02, 8).rotateX(-Math.PI / 2)), silver);
    tip.position.set(-0.103, -0.052, 0.148);
    this.rig.add(tip);
    // Two vanes near the eye, out of focus at the bottom of the view.
    for (const a of [0.5, 2.6]) {
      const v = new T.Mesh(keep(new T.PlaneGeometry(0.012, 0.07)), vane);
      v.position.set(-0.016, -0.124, 0.5);
      v.rotation.set(Math.PI / 2 - 0.2, a, 0);
      this.rig.add(v);
    }
    this.rig.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
  }
  /** Who may draw now by hand. */
  private canDraw() {
    const state = this.state;
    return !!state && state.winner === null && !this.animating && (this.netSide === undefined ? this.mode === "local" || state.turn === 0 : this.marks.targets.length > 0) && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** The hand: a press draws, a drag moves the pin, letting go shoots; Space or Enter held draws, the arrows move it. */
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.drawn || !this.canDraw()) return;
      this.draw(e.pointerId, e.clientX, e.clientY);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.drawn || this.drawn.pointer !== e.pointerId) return;
      this.drawn.dx = e.clientX - this.drawn.x;
      this.drawn.dy = e.clientY - this.drawn.y;
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.drawn || this.drawn.pointer !== e.pointerId) return;
      if (cancelled) this.letDown();
      else this.loose();
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => {
      const steps: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (steps[e.key]) {
        e.preventDefault();
        const by = e.shiftKey ? 2 : 10;
        this.keyAim = { x: Math.max(-900, Math.min(900, this.keyAim.x + steps[e.key][0] * by)), y: Math.max(-900, Math.min(900, this.keyAim.y + steps[e.key][1] * by)) };
        this.wake();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (e.repeat || this.drawn || !this.canDraw()) return;
        this.draw(null, 0, 0);
      } else if (e.key === "Escape" && this.drawn) this.letDown();
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key === " " || e.key === "Enter") && this.drawn && this.drawn.pointer === null) {
        e.preventDefault();
        this.loose();
      }
    });
    el.addEventListener("blur", () => {
      if (this.drawn?.pointer === null) this.letDown();
    });
  }
  /** The bow is drawn: the eye closes in, old arrows of a finished end come out of the target, the inset goes. */
  private draw(pointer: number | null, x: number, y: number) {
    const state = this.state!;
    this.drawn = { pointer, x, y, dx: 0, dy: 0, since: performance.now(), seed: Math.random() * 1000 };
    if (pointer === null && state.arrows.length === 0) this.keyAim = { x: 0, y: 0 };
    if (state.arrows.length === 0) {
      this.clearedAt = state.ply;
      this.place(state);
    }
    this.inset(false);
    this.wake();
  }
  /** Let down without shooting (let go too soon, cancelled, or no longer allowed). */
  private letDown() {
    this.drawn = null;
    this.wake();
  }
  /** Where the pin is now (mm from the face's middle): the aim of the drag or the keys, the hand's tremor, the bow still coming up. */
  private pin(now = performance.now()) {
    const d = this.drawn!,
      height = this.renderer.domElement.clientHeight || 1,
      base = d.pointer === null ? this.keyAim : dragAim(d.dx, d.dy, height),
      t = (now - d.since) / 1000,
      hand = tremor(t, d.seed, Math.max(0, t - DRAW / 1000));
    return { x: base.x + hand.x, y: base.y + hand.y + rising(now - d.since) };
  }
  /** The string let go: at full draw the arrow goes where the pin is; sooner, the bow is let down. */
  private loose() {
    const d = this.drawn;
    if (!d) return;
    const now = performance.now();
    if (now - d.since < DRAW || !this.canDraw()) return this.letDown();
    const at = this.pin(now);
    this.drawn = null;
    this.released = now;
    this.wake();
    this.onMove({ from: -1, to: aimCode(at.x, at.y), extra: 0 });
  }
  /** Asks for the view's own frames: the eye closing in or drawing back, the pin, the bow, the wind on the socks. */
  private wake() {
    if (this.frame || this.disposed) return;
    this.lastTick = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    this.frame = 0;
    if (this.disposed) return;
    // Real time, even when frames come slowly (a software-drawn page): the eye closes in as fast as the bow is drawn.
    const dt = Math.min(1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    if (this.drawn && !this.canDraw()) this.drawn = null;
    let more = !!this.drawn;
    // The eye closes in while the bow comes up, and draws back after.
    const want = this.drawn ? 1 : 0;
    if (this.zoom !== want) {
      this.zoom = want ? Math.min(1, this.zoom + (dt * 1000) / DRAW) : Math.max(0, this.zoom - (dt * 1000) / EASE_OUT);
      more = true;
    }
    this.aimCamera();
    // The socks and the flag turn toward the wind of the arrow to come.
    const target = windVector(this.wind),
      k = 1 - Math.exp(-dt * 2.4);
    this.shownWind.x += (target.x - this.shownWind.x) * k;
    this.shownWind.z += (target.z - this.shownWind.z) * k;
    this.flutter += dt;
    const settling = Math.hypot(target.x - this.shownWind.x, target.z - this.shownWind.z) > 0.02;
    this.blowAll();
    // The bow is laid every frame (it must not be skipped because something else already asks for the next one).
    const moving = this.poseBow(now);
    more = more || settling || this.animating || moving;
    this.redraw();
    if (more) this.frame = requestAnimationFrame(this.tick);
  };
  private blowAll() {
    for (const vane of [...this.range.socks, this.range.flag]) blow(vane, this.shownWind.x, this.shownWind.z, this.flutter);
  }
  private aimCamera() {
    archerCamera(this.camera, this.camera.aspect, this.zoom);
    // The bow keeps its size on the screen as the field narrows.
    const s = Math.tan((this.camera.fov * Math.PI) / 360) / Math.tan((BOW_FOV * Math.PI) / 360);
    this.bow.scale.set(s, s, 1);
  }
  /** Lays the bow where the pin is; true while it is moving (drawn, or following through after a release). */
  private poseBow(now: number) {
    const el = this.renderer.domElement,
      d = this.drawn,
      after = this.released >= 0 ? (now - this.released) / 420 : 1;
    let said = "";
    if (!d && after >= 1) {
      this.bow.visible = false;
      if (el.dataset.aim) el.dataset.aim = "";
      el.dataset.drawn = "false";
      return false;
    }
    this.bow.visible = !capturing();
    const half = Math.tan((BOW_FOV * Math.PI) / 360),
      aspect = this.camera.aspect;
    let lower = 0,
      ahead = 0;
    if (d) {
      const at = this.pin(now),
        p = new T.Vector3(at.x / 1000, FACE_Y + at.y / 1000, FACE_Z).project(this.camera),
        up = Math.min(1, (now - d.since) / DRAW);
      this.rig.position.set(p.x * APERTURE * half * aspect, p.y * APERTURE * half, -APERTURE);
      lower = (1 - up) ** 2 * 0.45;
      for (const m of this.aperture) (m as T.Mesh).visible = up > 0.6;
      if (up >= 1) said = `${at.x.toFixed(1)},${at.y.toFixed(1)}`;
    } else {
      // The follow-through: the bow springs forward and drops away.
      ahead = Math.sin(Math.min(1, after * 2.2) * Math.PI * 0.5) * 0.08;
      lower = after * after * 0.5;
      for (const m of this.aperture) (m as T.Mesh).visible = false;
    }
    this.rig.position.y -= lower;
    this.rig.position.z = -APERTURE - ahead;
    // Where the pin is (millimetres on the face), for readers of the page and the tests, once the bow is at full draw.
    if (el.dataset.aim !== said) el.dataset.aim = said;
    el.dataset.drawn = String(!!d);
    return true;
  }
  /** Every press is the hand's, never a pick. */
  protected dragStart() {
    return this.canDraw();
  }
  protected subject(): TableSubject {
    return { half: 2, halfZ: 2, height: 1, lookY: FACE_Y, tilt: 0.1 };
  }
  protected resize() {
    super.resize();
    this.aimCamera();
    // The inset: lower right, over the wind gauge (clear of the scoreboard and the socks), about a third of the table's height.
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (w && h && this.hud) {
      const short = h < 500,
        height = Math.round(Math.max(96, Math.min(h * (short ? 0.36 : 0.32), (w * 0.27) / 1.25, 260))),
        width = Math.round(height * 1.25),
        below = (this.hud.querySelector<HTMLElement>(".ar-wind")?.offsetHeight ?? 50) + (short ? 30 : 42) + 8;
      this.tvRect = { x: w - width - (short ? 10 : 16), y: Math.max(short ? 40 : 56, h - below - height), w: width, h: height };
      const tv = this.hud.querySelector<HTMLElement>(".ar-tv")!;
      Object.assign(tv.style, { left: `${this.tvRect.x}px`, top: `${this.tvRect.y}px`, width: `${width}px`, height: `${height}px` });
    }
    this.poseBow(performance.now());
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Shows or hides the inset. */
  private inset(on: boolean) {
    this.tvOn = on && !capturing();
    this.hud.querySelector<HTMLElement>(".ar-tv")!.hidden = !this.tvOn;
    this.redraw();
  }
  /** Draws the inset over its corner of the picture, after the main picture, from the close camera (near things only). */
  private renderInset(renderer: T.WebGLRenderer) {
    if (!this.tvOn || this.insetRendering || this.disposed || capturing()) return;
    const { x, y, w, h } = this.tvRect,
      size = renderer.getSize(new T.Vector2());
    if (!w || !h) return;
    this.insetRendering = true;
    const bottom = size.y - y - h,
      autoUpdate = renderer.shadowMap.autoUpdate;
    this.tvCamera.aspect = w / h;
    this.tvCamera.fov = (2 * Math.atan(0.78 / Math.max(1, (w / h) * 0.8) / 2.55) * 180) / Math.PI;
    this.tvCamera.updateProjectionMatrix();
    renderer.shadowMap.autoUpdate = false;
    renderer.setScissorTest(true);
    renderer.setViewport(x, bottom, w, h);
    renderer.setScissor(x, bottom, w, h);
    const trail = this.trail.visible;
    this.trail.visible = false;
    renderer.render(this.scene, this.tvCamera);
    this.trail.visible = trail;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, size.x, size.y);
    renderer.setScissor(0, 0, size.x, size.y);
    renderer.shadowMap.autoUpdate = autoUpdate;
    this.insetRendering = false;
  }
  /** Where an arrow leaves the bow, across (m): beside me for the computer, at my place for everyone else. */
  private launchX(side: 0 | 1) {
    return this.mode === "ai" && side === 1 ? BESIDE : 0;
  }
  /** An arrow's way down the range in the world, from the bow to the face, with the time at each point. */
  private path(arrow: Arrow) {
    const sent = arrow.sent,
      off = this.launchX(arrow.side);
    return fly(sent.x, sent.y, arrow.wind, 4).path.map((p) => ({ at: new T.Vector3(p.x + off * (1 - p.d / DISTANCE), p.y, -p.d), t: p.t }));
  }
  /** The way an arrow was going as it struck (unit vector, point first). */
  private headingOf(arrow: Arrow) {
    const key = `${arrow.side}|${arrow.sent.x},${arrow.sent.y}|${arrow.wind.speed},${arrow.wind.dir}`;
    let way = this.heading.get(key);
    if (!way) {
      const path = this.path(arrow),
        a = path[path.length - 2].at,
        b = path[path.length - 1].at;
      way = b.clone().sub(a).normalize();
      this.heading.set(key, way);
    }
    return way;
  }
  /** Points an arrow along `way` (its point leading). */
  private aimArrow(model: T.Object3D, way: T.Vector3) {
    model.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), way);
  }
  /** Lays an arrow stuck in the boss where it struck; one that went past the boss is not seen. */
  private lay(model: T.Group, arrow: Arrow, spin: number) {
    this.paint(model, arrow.side);
    model.visible = arrow.boss;
    if (!arrow.boss) return;
    const way = this.headingOf(arrow);
    model.position.set(arrow.x / 1000, FACE_Y + arrow.y / 1000, FACE_Z).addScaledVector(way, SUNK);
    this.aimArrow(model, way);
    model.rotateZ(spin);
  }
  /** The arrows in the target: those of the end under way, or of the end just shot until the next is begun. */
  private stuck(state: State): Arrow[] {
    if (state.arrows.length) return state.arrows;
    if (this.clearedAt === state.ply || !state.closed) return [];
    return state.history[state.history.length - 1]?.arrows ?? [];
  }
  protected place(state: State) {
    const shown = this.stuck(state);
    this.models.forEach((model, k) => {
      if (k < shown.length) this.lay(model, shown[k], k * 2.1);
      else model.visible = false;
    });
    this.wind = state.winds[state.arrows.length] ?? this.wind;
    if (!this.animating) this.trail.visible = false;
    if (!state.last) this.inset(false);
    // The first time (a new table), the socks stand in the wind at once.
    if (state.ply === 0 && !this.animating) {
      this.shownWind = windVector(this.wind);
      this.blowAll();
    }
    this.writeBoard(state);
    this.writeHud(state);
    const el = this.renderer.domElement;
    el.dataset.wind = `${this.wind.speed.toFixed(1)},${this.wind.dir}`;
    el.dataset.sets = `${state.setPoints[0]},${state.setPoints[1]}`;
    el.dataset.totals = `${state.totals[0]},${state.totals[1]}`;
    // The arrow shot last: where the pin was and where it struck (mm), and its score.
    const last = state.last;
    el.dataset.last = last ? `${last.aim.x},${last.aim.y};${last.x},${last.y};${last.label}` : "";
    this.wake();
  }
  protected animate(before: State, state: State) {
    const arrow = state.last;
    if (!arrow || state.ply !== before.ply + 1) return false;
    const index = before.arrows.length,
      model = this.models[index],
      path = this.path(arrow),
      flight = path[path.length - 1].t,
      way = this.headingOf(arrow),
      strike = new T.Vector3(arrow.x / 1000, FACE_Y + arrow.y / 1000, FACE_Z);
    // The first arrow of an end: the last end's arrows have been taken out.
    if (index === 0) for (const m of this.models) m.visible = false;
    this.paint(model, arrow.side);
    model.visible = false;
    this.wind = arrow.wind;
    this.onKnock?.("cushion", 1);
    let shown = 0,
      tv = false;
    this.trail.visible = true;
    this.trail.geometry.setDrawRange(0, 0);
    (this.trail.material as T.LineBasicMaterial).opacity = 0.55;
    this.tween(0, flight * 1000, (p) => {
      const t = p * flight;
      // Where along its way the arrow is now.
      let i = 0;
      while (i < path.length - 2 && path[i + 1].t < t) i++;
      const a = path[i],
        b = path[i + 1],
        f = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, b.t - a.t))),
        at = a.at.clone().lerp(b.at, f);
      model.visible = -at.z >= SHOWN_FROM;
      model.position.copy(at);
      this.aimArrow(model, b.at.clone().sub(a.at).normalize());
      model.rotateZ(t * 9);
      // The trail behind it.
      while (shown < path.length && path[shown].t <= t && shown < 399) {
        const q = path[shown].at;
        this.trailAt.set([q.x, q.y, q.z], shown * 3);
        shown++;
      }
      this.trailAt.set([at.x, at.y, at.z], shown * 3);
      this.trail.geometry.attributes.position.needsUpdate = true;
      this.trail.geometry.setDrawRange(0, shown + 1);
      if (!tv && t >= flight - INSET_EARLY) {
        tv = true;
        this.writeInset(state, arrow);
        this.inset(true);
      }
      if (p === 1) {
        if (arrow.boss) {
          this.lay(model, arrow, index * 2.1);
          this.onContact();
          this.onKnock?.("disc", arrow.value / 10);
        } else {
          model.visible = false;
          this.onKnock?.("pocket", 0.5);
        }
      }
    });
    if (arrow.boss)
      this.tween(flight * 1000, WOBBLE, (p) => {
        // The shaft quivers about its point, dying away.
        const swing = Math.sin(p * Math.PI * 6) * (1 - p) * 0.05;
        model.position.copy(strike).addScaledVector(way, SUNK);
        this.aimArrow(model, way);
        model.rotateZ(index * 2.1);
        model.rotateX(swing);
        (this.trail.material as T.LineBasicMaterial).opacity = 0.55 * (1 - p);
      });
    else this.tween(flight * 1000, 200, (p) => ((this.trail.material as T.LineBasicMaterial).opacity = 0.55 * (1 - p)));
    this.wake();
    return true;
  }
  /** Over Wi-Fi the board and the score bug name the people. */
  protected seated() {
    if (!this.state) return;
    this.writeBoard(this.state);
    this.writeHud(this.state);
  }
  /** The names of the two sides as the table calls them. */
  private names(state: State): [string, string] {
    if (state.format !== "match") return ["나", ""];
    return this.netNames ?? (this.mode === "ai" ? ["나", "컴퓨터"] : ["플레이어 1", "플레이어 2"]);
  }
  /** The inset's caption: who shot, that end's arrows, and the value just shot. */
  private writeInset(state: State, arrow: Arrow) {
    const cap = this.hud.querySelector<HTMLElement>(".ar-tv-cap")!,
      own = (state.arrows.length ? state.arrows : (state.history[state.history.length - 1]?.arrows ?? [])).filter((a) => a.side === arrow.side);
    cap.querySelector("i")!.style.background = ARCHERY_COLORS[arrow.side];
    cap.querySelector("b")!.textContent = this.names(state)[arrow.side];
    cap.querySelector("span")!.textContent = own.map((a) => a.label).join(" ");
    const value = cap.querySelector("em")!;
    value.textContent = arrow.label;
    value.dataset.ring = arrow.label === "X" || arrow.value >= 9 ? "gold" : arrow.value >= 7 ? "red" : arrow.value >= 5 ? "blue" : arrow.value >= 3 ? "black" : "white";
  }
  /** The score bug at the lower left and the wind gauge at the lower right. */
  private writeHud(state: State) {
    const names = this.names(state),
      match = state.format === "match",
      slots = match ? (state.shootOff ? 1 : SET_ARROWS) : state.perEnd,
      shots = this.stuck(state),
      ended = !state.arrows.length && shots.length > 0,
      head = match ? (ended ? `${state.history.length}세트 끝` : state.shootOff ? "슛오프" : `${state.history.length + 1}세트`) : `${Math.min(state.ends, state.history.length + (ended ? 0 : 1))}/${state.ends}엔드`,
      row = (side: 0 | 1) => {
        const own = shots.filter((a) => a.side === side),
          boxes = Array.from({ length: Math.max(slots, own.length) }, (_, k) => `<s${own[k] ? ` data-ring="${ring(own[k])}"` : ""}>${own[k]?.label ?? ""}</s>`).join(""),
          big = match ? state.setPoints[side] : state.totals[side],
          sum = own.reduce((s, a) => s + a.value, 0);
        return `<div class="ar-row${state.winner === null && state.turn === side ? " on" : ""}"><i style="background:${ARCHERY_COLORS[side]}"></i><b>${names[side]}</b><em>${big}</em><span>${boxes}</span><u>${own.length ? sum : ""}</u></div>`;
      };
    this.hud.querySelector(".ar-bug")!.innerHTML = `<div class="ar-head">${head}<small>${match ? "세트 점수" : "합계"}</small></div>${row(0)}${match ? row(1) : ""}`;
    const gauge = this.hud.querySelector<HTMLElement>(".ar-wind")!;
    gauge.querySelector("b")!.textContent = this.wind.speed.toFixed(1);
    gauge.querySelector<SVGGElement>("svg g")!.setAttribute("transform", `rotate(${this.wind.dir})`);
    gauge.dataset.calm = String(this.wind.speed < 0.3);
    this.hud.hidden = capturing();
  }
  /** The electric scoreboard: the set (or end), each side's set points (or total) and the arrows of the end. */
  private writeBoard(state: State) {
    const { canvas, texture } = this.range.board,
      ctx = canvas.getContext("2d")!,
      W = canvas.width,
      H = canvas.height,
      match = state.format === "match",
      names = this.names(state),
      shots = this.stuck(state);
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, W, H);
    // A faint grid of lamps behind the lettering.
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 6; y < H; y += 12) for (let x = 6; x < W; x += 12) ctx.fillRect(x, y, 5, 5);
    ctx.textBaseline = "middle";
    const font = (size: number, weight = 800) => (ctx.font = `${weight} ${size}px "Inter", "Noto Sans KR", sans-serif`);
    ctx.fillStyle = "#1c2a40";
    ctx.fillRect(0, 0, W, 92);
    font(46);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("ARCHERY 70M", 32, 48);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffbf3c";
    ctx.fillText(match ? (state.shootOff ? "SHOOT-OFF" : `SET ${Math.min(5, state.history.length + (state.arrows.length || !shots.length ? 1 : 0))}`) : `END ${Math.min(state.ends, state.history.length + (state.arrows.length || !shots.length ? 1 : 0))}/${state.ends}`, W - 32, 48);
    const rows = match ? [0, 1] : [0],
      top = match ? 150 : 210,
      gap = 170;
    rows.forEach((side, r) => {
      const y = top + r * gap,
        own = shots.filter((a) => a.side === side);
      ctx.fillStyle = ARCHERY_COLORS[side];
      ctx.fillRect(32, y - 40, 18, 80);
      ctx.textAlign = "left";
      ctx.fillStyle = state.winner === null && state.turn === side ? "#ffffff" : "#c9d1db";
      font(52, 700);
      ctx.fillText(names[side], 72, y);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffbf3c";
      font(104, 900);
      ctx.fillText(String(match ? state.setPoints[side] : state.totals[side]), match ? 430 : 370, y + 4);
      // Three boxes for a set, six (narrower) for an end alone, clear of the number and of the screen's edge.
      const slots = match ? (state.shootOff ? 1 : SET_ARROWS) : state.perEnd,
        cell = match ? 108 : 70,
        space = match ? 10 : 8,
        x0 = match ? 530 : 486;
      for (let k = 0; k < Math.max(slots, own.length); k++) {
        const x = x0 + k * (cell + space);
        ctx.fillStyle = "#1a2230";
        ctx.fillRect(x, y - 44, cell, 88);
        if (!own[k]) continue;
        ctx.fillStyle = ringColour(own[k]);
        ctx.fillRect(x + 4, y - 40, cell - 8, 80);
        ctx.fillStyle = ringInk(own[k]);
        font(own[k].label.length > 1 ? 50 : 58, 900);
        ctx.fillText(own[k].label, x + cell / 2, y + 3);
      }
    });
    if (state.winner !== null) {
      ctx.fillStyle = "#ffbf3c";
      ctx.textAlign = "center";
      font(44, 800);
      ctx.fillText(match ? `${names[state.winner === 1 ? 1 : 0]} 승리` : "경기 끝", W / 2, H - 46);
    }
    texture.needsUpdate = true;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.frame);
    this.watch.disconnect();
    this.scene.onAfterRender = () => {};
    this.hud.remove();
    super.dispose();
  }
}
/** The colour of the zone an arrow struck, for its box on the boards. */
const ring = (a: Arrow) => (a.label === "X" || a.value >= 9 ? "gold" : a.value >= 7 ? "red" : a.value >= 5 ? "blue" : a.value >= 3 ? "black" : a.value >= 1 ? "white" : "miss");
const ringColour = (a: Arrow) => ({ gold: "#ffd93a", red: "#ec3a3f", blue: "#22a5dc", black: "#2b2b2b", white: "#f4f4f0", miss: "#5a616b" })[ring(a)];
const ringInk = (a: Arrow) => (ring(a) === "black" || ring(a) === "miss" || ring(a) === "blue" || ring(a) === "red" ? "#ffffff" : "#111111");
