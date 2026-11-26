import * as T from "three";
import { FOV } from "../../engine/camera";
import { capable, glossy } from "../../engine/scene-utils";
import { noZoom } from "../../engine/zoom";
import type { LiveGuest, LiveHost, LiveSession } from "../../net/live";
import { capturing, shout } from "../../ui/banner";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { follow, hostWants, inputOf, laySlice, readSnap, snapOf } from "./net";
import { FieldPaint, grass, nameTag } from "./paint";
import { COLORS, COLOR_NAMES, END, OUT, moverName, packEnd, seatOfMover, type State } from "./rules";
import { CELLS, COUNTDOWN, DT, N, autopilot, createWorld, secondsLeft, step, ticks, type Event, type World } from "./sim";

export const TERRITORY_COLORS: [string, string] = [COLORS[0], COLORS[1]];
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** Where a cell of the field is in the scene: the field's middle at the origin, its rows running toward the viewer. */
const sx = (x: number) => x - N / 2,
  sz = (y: number) => y - N / 2;
/** How much of the field the eye takes in across and down (cells), and how steeply it looks down. */
const WIDE = 20,
  TALL = 12,
  TILT = 1.02;
/** How much larger than a cell a mover is drawn (its body; its name over it keeps its size). */
const FIGURE = 1.3;
/** The lever's dead middle (a lean under it steers nothing). */
const DEAD = 0.25;
/** A trail's half width, and the most points a trail's line holds. */
const HALF = 0.34,
  MOST = 1600;
const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
};
interface Figure {
  group: T.Group;
  body: T.Group;
  roller: T.Mesh;
  tag: T.Sprite;
  /** Its trail's line: points along the way it went since it left its land. */
  path: { x: number; y: number }[];
  line: T.Mesh;
  positions: Float32Array;
  last: { x: number; y: number };
  rolled: number;
  /** When it came back (for its pop) and whether it was in play when last drawn. */
  born: number;
  alive: boolean;
}
interface Burst {
  points: T.Points;
  velocity: Float32Array;
  age: number;
}
/**
 * 땅따먹기 on a field of cloth laid in a meadow: each mover a round little painter of our own make — a glossy body in
 * its colour, big eyes, a feeler with a bobble, and a paint roller in front that turns as it goes — leaving a
 * ribbon of its colour off its own land; the land itself painted on the cloth in the mover's pattern (`paint.ts`).
 * A low white rail runs round the field; outside it, grass, hedges, trees and flowers. The eye follows my mover.
 *
 * Steering: the arrow keys or WASD; a mouse over the field (the mover heads for the pointer); on a touch screen a
 * lever at the lower left, or a finger drawn anywhere over the field. Over the field stand the clock and my share
 * (upper left), the shares of all (upper right) and a small map of the whole field (lower right).
 */
export class TerritoryView extends TableView<State> {
  private world: World | null = null;
  private built = false;
  private figures: Figure[] = [];
  private paint: FieldPaint | null = null;
  private ground: T.Mesh | null = null;
  private sun: T.DirectionalLight | null = null;
  private bursts: Burst[] = [];
  private rings: { mesh: T.Mesh; age: number }[] = [];
  private rich = capable();
  private coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private hud: HTMLElement;
  private clock: HTMLElement;
  private board: HTMLElement;
  /** The map is drawn on a canvas off the page and shown as a picture (the page's only canvas stays the field's). */
  private map: HTMLElement;
  private mapCanvas = document.createElement("canvas");
  private pad: HTMLElement;
  private pops: HTMLElement;
  private boardText = "";
  private mapAt = 0;
  private eye = { x: N / 2, y: N / 2, set: false };
  /** The mover this screen steers (null: watching), and what my hand asks: keys held, the pointer, the lever, a finger. */
  private mine: number | null = 0;
  private keys = new Set<string>();
  private mouse: { x: number; y: number } | null = null;
  private lever: { x: number; y: number } | null = null;
  private swipe: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private paused = false;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private turn = 0;
  /** What of the round a guest has seen so far (to sound and show what changed since). */
  private heard: { tick: number; alive: boolean[]; outs: number[]; kos: number[]; land: number[] } | null = null;
  private owner = new Uint8Array(CELLS);
  private changed = new Set<number>();
  private counts = { claims: 0, outs: 0 };
  /** The sounds of the field (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  private readonly keyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly keyUp = (e: KeyboardEvent) => this.key(e, false);
  private readonly letGo = () => {
    this.keys.clear();
    this.lever = null;
    this.swipe = null;
    this.drawKnob(0, 0);
  };
  private readonly hidden = () => document.hidden && this.letGo();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
    private live: LiveSession | null = null,
  ) {
    super(host, quality, "#a8d7ef");
    this.camera.far = 260;
    noZoom(this.renderer.domElement);
    this.hud = document.createElement("div");
    this.hud.className = "ld-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.clock = document.createElement("div");
    this.clock.className = "ld-clock";
    this.board = document.createElement("ol");
    this.board.className = "ld-board";
    this.map = document.createElement("div");
    this.map.className = "ld-map";
    this.mapCanvas.width = this.mapCanvas.height = N * 2;
    this.pops = document.createElement("div");
    this.pops.className = "ld-pops";
    this.hud.append(this.clock, this.board, this.map, this.pops);
    this.pad = document.createElement("div");
    this.pad.className = "ld-pad";
    host.append(this.hud, this.pad);
    this.makePad();
    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "crosshair";
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") this.mouse = { x: e.clientX, y: e.clientY };
      else if (this.swipe && this.swipe.id === e.pointerId) {
        this.swipe.x = e.clientX;
        this.swipe.y = e.clientY;
      }
    });
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.mouse = null;
    });
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      this.swipe = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
    });
    const lift = (e: PointerEvent) => {
      if (this.swipe?.id === e.pointerId) this.swipe = null;
    };
    el.addEventListener("pointerup", lift);
    el.addEventListener("pointercancel", lift);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("touchstart", (e) => e.cancelable && e.preventDefault(), { passive: false });
    el.addEventListener("touchmove", (e) => e.cancelable && e.preventDefault(), { passive: false });
    document.addEventListener("keydown", this.keyDown);
    document.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.letGo);
    document.addEventListener("visibilitychange", this.hidden);
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The round never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.letGo();
  }
  private running() {
    return !!this.world && !!this.state && this.state.ranking === null && this.world.closed === null && !this.paused && !document.hidden && (!!this.live || !document.querySelector("dialog[open]"));
  }
  private key(e: KeyboardEvent, down: boolean) {
    if (!KEYS[e.code] || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && target !== this.renderer.domElement && target.closest("input, select, textarea, dialog")) return;
    if (down && document.querySelector("dialog[open]")) return;
    e.preventDefault();
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
  }
  /** The heading my hand asks for now, on the field (x to the right, y toward the viewer), or null: straight on. */
  private want(): number | null {
    let kx = 0,
      ky = 0;
    for (const code of this.keys) {
      kx += KEYS[code][0];
      ky += KEYS[code][1];
    }
    if (kx || ky) return Math.atan2(ky, kx);
    if (this.lever && Math.hypot(this.lever.x, this.lever.y) > DEAD) return Math.atan2(-this.lever.y, this.lever.x);
    if (this.swipe) {
      const dx = this.swipe.x - this.swipe.x0,
        dy = this.swipe.y - this.swipe.y0;
      if (Math.hypot(dx, dy) > 14) {
        // The finger's start follows it a little way behind, so that a long draw still turns at once.
        const far = Math.hypot(dx, dy);
        if (far > 60) {
          this.swipe.x0 = this.swipe.x - (dx / far) * 60;
          this.swipe.y0 = this.swipe.y - (dy / far) * 60;
        }
        return Math.atan2(dy, dx);
      }
      return null;
    }
    if (this.mouse && this.world && this.mine !== null) {
      // Toward the pointer from where my mover stands on the screen.
      const m = this.world.movers[this.mine],
        p = new T.Vector3(sx(m.x), 0.3, sz(m.y)).project(this.camera),
        box = this.renderer.domElement.getBoundingClientRect(),
        px = box.left + ((p.x + 1) / 2) * box.width,
        py = box.top + ((1 - p.y) / 2) * box.height,
        dx = this.mouse.x - px,
        dy = this.mouse.y - py;
      if (Math.hypot(dx, dy) > 18) return Math.atan2(dy, dx);
    }
    return null;
  }
  /** The lever at the lower left, for a touch screen: lean it the way to go. */
  private makePad() {
    if (!this.coarse) return;
    this.pad.innerHTML = `<div class="ld-stick" role="slider" aria-label="레버: 미는 쪽으로 방향 바꾸기"><span class="ld-knob"></span></div>`;
    const stick = this.pad.querySelector<HTMLElement>(".ld-stick")!;
    let finger: number | null = null;
    const lean = (cx: number, cy: number) => {
      const box = stick.getBoundingClientRect(),
        reach = box.width * 0.32;
      let x = (cx - (box.x + box.width / 2)) / reach,
        y = -(cy - (box.y + box.height / 2)) / reach;
      const far = Math.hypot(x, y);
      if (far > 1) (x /= far), (y /= far);
      this.lever = { x, y };
      this.drawKnob(x, y);
    };
    stick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      finger = e.pointerId;
      try {
        stick.setPointerCapture(e.pointerId);
      } catch {
        // Held without capture.
      }
      stick.classList.add("on");
      lean(e.clientX, e.clientY);
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId === finger) lean(e.clientX, e.clientY);
    });
    const lift = (e: PointerEvent) => {
      if (e.pointerId !== finger) return;
      finger = null;
      this.lever = null;
      stick.classList.remove("on");
      this.drawKnob(0, 0);
    };
    stick.addEventListener("pointerup", lift);
    stick.addEventListener("pointercancel", lift);
    stick.addEventListener("lostpointercapture", lift);
    stick.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  private drawKnob(x: number, y: number) {
    const stick = this.pad.querySelector<HTMLElement>(".ld-stick"),
      knob = stick?.querySelector<HTMLElement>(".ld-knob");
    if (!stick || !knob) return;
    const reach = stick.getBoundingClientRect().width * 0.32;
    knob.style.transform = x || y ? `translate(${(x * reach).toFixed(1)}px, ${(-y * reach).toFixed(1)}px)` : "";
  }

  // ── The scene ──────────────────────────────────────────────────────────────────────────────────────────────────
  private build(state: State) {
    this.built = true;
    if (this.live) {
      const k = this.live.seat === null ? -1 : (state.seats ?? []).indexOf(this.live.seat);
      this.mine = k >= 0 ? k : null;
    } else this.mine = 0;
    this.world = createWorld(state.movers, state.seconds, Math.floor(Math.random() * 2 ** 31));
    if (this.live && !this.live.host) {
      // A guest's field is what the host tells; nothing of its own is laid.
      this.world.owner.fill(0);
      this.world.movers.forEach((m) => (m.land = 0));
    }
    this.owner.set(this.world.owner);
    const own: Own = (r) => this.own(r),
      seats = this.world.movers.map((_, k) => seatOfMover(state, k));
    this.scene.fog = new T.Fog("#b9def0", 60, 150);
    // On a graphics card the reflected room lights everything as well (`realism`): the lamps are turned down for it.
    this.scene.add(new T.HemisphereLight("#dff2ff", "#6f8f4a", this.rich ? 0.75 : 1.9));
    const sun = new T.DirectionalLight("#fff4dd", this.rich ? 1.9 : 2.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.rich ? 2048 : 1024, this.rich ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    this.sun = sun;
    // The field: the cloth with the lands painted on it.
    this.paint = new FieldPaint(seats);
    this.own(this.paint.texture);
    this.paint.all(this.owner);
    const fieldMaterial = this.rich ? this.standard({ map: this.paint.texture, roughness: 0.92, envMapIntensity: 0.45 }) : own(new T.MeshLambertMaterial({ map: this.paint.texture }));
    const field = new T.Mesh(own(new T.PlaneGeometry(N, N)), fieldMaterial);
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    this.scene.add(field);
    this.ground = field;
    this.meadow(own);
    for (let k = 0; k < state.movers; k++) this.figures.push(this.makeFigure(own, k, seats[k], state));
    this.resize();
  }
  /** Round the field: a low white rail, then grass with hedges, trees, flowers and stones out to the haze. */
  private meadow(own: Own) {
    const lawn = grass();
    lawn.repeat.set(40, 40);
    own(lawn);
    const turf = new T.Mesh(own(new T.PlaneGeometry(320, 320)), this.rich ? this.standard({ map: lawn, roughness: 1, envMapIntensity: 0.45 }) : own(new T.MeshLambertMaterial({ map: lawn })));
    turf.rotation.x = -Math.PI / 2;
    turf.position.y = -0.04;
    turf.receiveShadow = true;
    this.scene.add(turf);
    // The rail: posts and a rounded white bar, each side, and a strip of pale stone under it.
    const white = this.standard({ color: "#fbfaf4", roughness: 0.45 }),
      stone = this.standard({ color: "#d9d2c1", roughness: 0.9 }),
      half = N / 2;
    for (const [x, z, w, d] of [
      [0, -half - 0.35, N + 1.4, 0.7],
      [0, half + 0.35, N + 1.4, 0.7],
      [-half - 0.35, 0, 0.7, N],
      [half + 0.35, 0, 0.7, N],
    ]) {
      const kerb = this.add(new T.BoxGeometry(w, 0.12, d), stone, x, 0.02, z);
      kerb.castShadow = false;
      const bar = this.add(new T.BoxGeometry(w > d ? w : 0.18, 0.16, w > d ? 0.18 : d), white, x, 0.42, z);
      bar.castShadow = true;
    }
    const post = own(new T.CylinderGeometry(0.09, 0.11, 0.5, 8)),
      posts = new T.InstancedMesh(post, white, Math.ceil((N / 4) * 4) + 8);
    let p = 0;
    const m4 = new T.Matrix4();
    for (let i = 0; i <= N; i += 4)
      for (const [x, z] of [
        [i - half, -half - 0.35],
        [i - half, half + 0.35],
        [-half - 0.35, i - half],
        [half + 0.35, i - half],
      ]) {
        if (p >= posts.count) break;
        posts.setMatrixAt(p++, m4.makeTranslation(x, 0.25, z));
      }
    posts.count = p;
    posts.castShadow = true;
    this.scene.add(posts);
    // Hedges just outside the rail, broken here and there: rows of leafy clumps, each a squashed ball.
    const clumps: { x: number; z: number; s: number }[] = [];
    let hs = 5;
    const hr = () => ((hs = (hs * 16807) % 2147483647) / 2147483647);
    for (const side of [0, 1, 2, 3])
      for (let i = -half + 2; i < half - 2; i += 0.85) {
        if (Math.floor((i + half) / 9) % 3 === 2 && (i + half) % 9 < 2.2) continue;
        const out = half + 2.2 + (hr() - 0.5) * 0.3;
        clumps.push({ x: side < 2 ? i : side === 2 ? -out : out, z: side < 2 ? (side === 0 ? -out : out) : i, s: 0.75 + hr() * 0.35 });
      }
    const hedge = new T.InstancedMesh(own(new T.IcosahedronGeometry(1, 2)), this.standard({ color: "#ffffff", roughness: 0.95, flatShading: true }), clumps.length),
      hm = new T.Matrix4(),
      hq = new T.Quaternion(),
      hv = new T.Vector3(),
      hsc = new T.Vector3(),
      ht = new T.Color();
    clumps.forEach((c, i) => {
      hq.setFromEuler(new T.Euler(hr() * 3, hr() * 3, hr() * 3));
      hedge.setMatrixAt(i, hm.compose(hv.set(c.x, 0.55 * c.s, c.z), hq, hsc.set(0.85 * c.s, 0.7 * c.s, 0.85 * c.s)));
      hedge.setColorAt(i, ht.set("#3f8a35").offsetHSL((hr() - 0.5) * 0.03, 0, (hr() - 0.5) * 0.1));
    });
    hedge.castShadow = hedge.receiveShadow = true;
    this.scene.add(hedge);
    // Trees and flowers in the grass beyond, scattered from a fixed seed.
    let seed = 31;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spot = (near: number, far: number) => {
      for (;;) {
        const x = (r() - 0.5) * 2 * (half + far),
          z = (r() - 0.5) * 2 * (half + far);
        if (Math.max(Math.abs(x), Math.abs(z)) > half + near) return { x, z };
      }
    };
    const trees = this.rich ? 150 : 70,
      trunk = new T.InstancedMesh(own(new T.CylinderGeometry(0.16, 0.24, 1.6, 7)), this.standard({ color: "#7a5434", roughness: 0.9 }), trees),
      crown = new T.InstancedMesh(own(new T.IcosahedronGeometry(1, 1)), this.standard({ color: "#4f9a3c", roughness: 0.85, flatShading: true }), trees * 2),
      q = new T.Quaternion(),
      s = new T.Vector3(),
      v = new T.Vector3(),
      tint = new T.Color();
    for (let i = 0; i < trees; i++) {
      const at = spot(4.5, 34),
        size = 0.8 + r() * 0.7;
      trunk.setMatrixAt(i, m4.compose(v.set(at.x, 0.8 * size, at.z), q.identity(), s.set(size, size, size)));
      for (let j = 0; j < 2; j++) {
        const lift = 1.9 + j * 0.9;
        q.setFromEuler(new T.Euler(r(), r() * 6, r()));
        crown.setMatrixAt(i * 2 + j, m4.compose(v.set(at.x + (r() - 0.5) * 0.4, lift * size, at.z + (r() - 0.5) * 0.4), q, s.setScalar((1.15 - j * 0.3) * size)));
        crown.setColorAt(i * 2 + j, tint.set(r() < 0.5 ? "#4f9a3c" : "#5fae46").offsetHSL(0, 0, (r() - 0.5) * 0.08));
      }
    }
    trunk.castShadow = crown.castShadow = true;
    this.scene.add(trunk, crown);
    const flowers = this.rich ? 420 : 160,
      bloom = new T.InstancedMesh(own(new T.SphereGeometry(0.13, 6, 4)), own(new T.MeshLambertMaterial({ color: "#ffffff" })), flowers),
      palette = ["#ff7aa8", "#ffd84a", "#ffffff", "#b98cff", "#ff9b4a"];
    for (let i = 0; i < flowers; i++) {
      const at = spot(3.2, 26);
      bloom.setMatrixAt(i, m4.makeTranslation(at.x, 0.12, at.z));
      bloom.setColorAt(i, tint.set(palette[i % palette.length]));
    }
    this.scene.add(bloom);
    const rocks = new T.InstancedMesh(own(new T.DodecahedronGeometry(0.4, 0)), this.standard({ color: "#a7a294", roughness: 0.95, flatShading: true }), 40);
    for (let i = 0; i < 40; i++) {
      const at = spot(3.5, 30);
      rocks.setMatrixAt(i, m4.compose(v.set(at.x, 0.1, at.z), q.setFromEuler(new T.Euler(r(), r(), r())), s.set(1 + r(), 0.6 + r() * 0.5, 1 + r())));
    }
    rocks.castShadow = true;
    this.scene.add(rocks);
  }
  /**
   * A mover of our own make: a round glossy body in its colour with a pale belly, two big eyes with shine, a feeler
   * with a bobble, little feet, and a paint roller in front on two arms, its drum the colour of its land.
   */
  private makeFigure(own: Own, k: number, seat: number, state: State): Figure {
    const color = COLORS[seat],
      group = new T.Group(),
      body = new T.Group(),
      paint = own(glossy({ color, roughness: 0.28 }, 0.6)),
      belly = this.standard({ color: "#fff6e8", roughness: 0.6 }),
      dark = this.standard({ color: "#1b1d22", roughness: 0.4 }),
      white = this.standard({ color: "#ffffff", roughness: 0.25 }),
      ball = own(new T.SphereGeometry(1, 24, 16));
    const shell = new T.Mesh(ball, paint);
    shell.scale.set(0.46, 0.4, 0.42);
    shell.position.y = 0.44;
    shell.castShadow = true;
    body.add(shell);
    const front = new T.Mesh(ball, belly);
    front.scale.set(0.2, 0.26, 0.3);
    front.position.set(0.31, 0.4, 0);
    body.add(front);
    for (const z of [-0.15, 0.15]) {
      const eye = new T.Mesh(ball, white);
      eye.scale.setScalar(0.12);
      eye.position.set(0.36, 0.6, z);
      body.add(eye);
      const pupil = new T.Mesh(ball, dark);
      pupil.scale.setScalar(0.062);
      pupil.position.set(0.46, 0.61, z * 1.05);
      body.add(pupil);
      const shine = new T.Mesh(ball, white);
      shine.scale.setScalar(0.022);
      shine.position.set(0.5, 0.64, z * 1.05 - 0.02);
      body.add(shine);
      const foot = new T.Mesh(ball, dark);
      foot.scale.set(0.12, 0.06, 0.1);
      foot.position.set(0.05, 0.05, z * 1.4);
      body.add(foot);
    }
    const feeler = new T.Mesh(own(new T.CylinderGeometry(0.018, 0.018, 0.3, 6)), dark);
    feeler.position.set(-0.05, 0.92, 0);
    feeler.rotation.z = 0.3;
    body.add(feeler);
    const bobble = new T.Mesh(ball, paint);
    bobble.scale.setScalar(0.075);
    bobble.position.set(-0.1, 1.07, 0);
    body.add(bobble);
    // The roller: two arms forward and a drum across, turning as it goes.
    for (const z of [-0.3, 0.3]) {
      const arm = new T.Mesh(own(new T.BoxGeometry(0.34, 0.04, 0.04)), dark);
      arm.position.set(0.52, 0.2, z);
      arm.rotation.z = -0.35;
      body.add(arm);
    }
    const drumMap = (() => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 16;
      const g = c.getContext("2d")!;
      g.fillStyle = new T.Color(color).lerp(new T.Color("#ffffff"), 0.15).getStyle();
      g.fillRect(0, 0, 64, 16);
      g.fillStyle = new T.Color(color).lerp(new T.Color("#000000"), 0.2).getStyle();
      for (let i = 0; i < 64; i += 8) g.fillRect(i, 0, 3, 16);
      const t = own(new T.CanvasTexture(c));
      t.colorSpace = T.SRGBColorSpace;
      return t;
    })();
    const roller = new T.Mesh(own(new T.CylinderGeometry(0.13, 0.13, 0.66, 16)), this.standard({ map: drumMap, roughness: 0.75 }));
    roller.rotation.x = Math.PI / 2;
    roller.position.set(0.7, 0.13, 0);
    roller.castShadow = true;
    body.add(roller);
    body.scale.setScalar(FIGURE);
    group.add(body);
    // Its name over it: 나 for mine.
    const mine = k === this.mine,
      name = this.live ? (mine ? "나" : COLOR_NAMES[seat]) : moverName(state, k),
      tag = new T.Sprite(own(new T.SpriteMaterial({ map: own(nameTag(name, color, mine)), depthTest: false, transparent: true })));
    tag.scale.set(mine ? 1.55 : 1.35, mine ? 0.58 : 0.5, 1);
    tag.position.y = 1.95;
    tag.renderOrder = 10;
    group.add(tag);
    this.scene.add(group);
    // The trail's ribbon: a strip of its colour, a little lighter, a hair over the cloth.
    const positions = new Float32Array(MOST * 2 * 3),
      geometry = own(new T.BufferGeometry()),
      index: number[] = [];
    for (let i = 0; i < MOST - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);
    const line = new T.Mesh(
      geometry,
      own(new T.MeshBasicMaterial({ color: new T.Color(color).lerp(new T.Color("#ffffff"), 0.3), transparent: true, opacity: 0.88, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    );
    line.frustumCulled = false;
    line.renderOrder = 2;
    this.scene.add(line);
    return { group, body, roller, tag, path: [], line, positions, last: { x: 0, y: 0 }, rolled: 0, born: -9, alive: true };
  }

  // ── The round ──────────────────────────────────────────────────────────────────────────────────────────────────
  private advance(now: number) {
    const real = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const world = this.world,
      live = this.live;
    if (!world) return;
    if (live && !live.host) this.followHost(now);
    else if (this.running()) {
      this.left += real;
      while (this.left >= DT && this.running()) {
        this.left -= DT;
        const wants = live
          ? hostWants(world, this.state!.seats ?? [], (seat) => live.control(seat), (seat) => (live as LiveHost).latest(seat), this.mine === null ? null : this.want(), this.level)
          : world.movers.map((_, k) => (k === this.mine ? this.want() : autopilot(world, k, this.level)));
        for (const event of step(world, wants)) this.tell(event);
      }
      if (world.changed.size) {
        for (const c of world.changed) this.changed.add(c);
        world.changed.clear();
        this.owner.set(world.owner);
      }
    } else this.left = 0;
    if (live?.host && this.state) live.tick(() => snapOf(world, this.turn++), now);
    if (this.changed.size && this.paint) {
      this.paint.paint(this.owner, this.changed);
      this.changed.clear();
    }
    this.pose(real, now);
    this.redraw();
  }
  /**
   * A guest's frame: my hand is sent to the host, and the host's round is drawn a moment behind; the field is laid
   * from the slices the two states either side carry (and the newest), and what changed is heard and shown here.
   */
  private followHost(now: number) {
    const live = this.live as LiveGuest,
      world = this.world!;
    const playing = this.mine !== null && this.running() && !live.paused;
    live.tick(() => (this.mine === null ? null : inputOf(playing ? this.want() : null)), now);
    const frame = live.frame(now);
    if (!frame) return;
    const a = readSnap(frame.a.data),
      b = readSnap(frame.b.data);
    if (!a || !b) return;
    for (const snap of [a, b]) laySlice(this.owner, snap, this.changed, world.movers.length);
    follow(world, a, b, frame.t);
    const heard = this.heard,
      start = ticks(COUNTDOWN);
    if (heard) {
      for (const n of [1, 2]) if (heard.tick < ticks(n) && world.tick >= ticks(n) && world.tick < start) this.tell({ kind: "count", n });
      if (heard.tick < start && world.tick >= start) this.tell({ kind: "go" });
      world.movers.forEach((m, k) => {
        if (heard.alive[k] && !m.alive) this.tell({ kind: "out", who: k, by: m.outs > heard.outs[k] ? this.cutter(heard.kos, world) : -1, how: "cut" }, true);
        if (!heard.alive[k] && m.alive) this.tell({ kind: "back", who: k }, true);
        if (m.alive && heard.alive[k] && m.land - heard.land[k] > 2) this.tell({ kind: "claim", who: k, cells: m.land - heard.land[k] }, true);
      });
    }
    this.heard = { tick: world.tick, alive: world.movers.map((m) => m.alive), outs: world.movers.map((m) => m.outs), kos: world.movers.map((m) => m.kos), land: world.movers.map((m) => m.land) };
  }
  /** Who put someone out between two states a guest saw: the mover whose count of others put out went up. */
  private cutter(before: number[], world: World) {
    return world.movers.findIndex((m, k) => m.kos > before[k]);
  }
  /** What a slice of the round did, told to the screen (moves), the eye and the ear. `seen`: a guest's, no moves. */
  private tell(event: Event, seen = false) {
    const world = this.world!,
      mine = (k: number) => k === this.mine,
      name = (k: number) => (this.live ? COLOR_NAMES[seatOfMover(this.state!, k)] : moverName(this.state!, k));
    if (event.kind === "count") {
      shout(String(COUNTDOWN - event.n));
      this.onKnock?.("count", 0.5);
    } else if (event.kind === "go") {
      shout("시작!");
      this.onKnock?.("go", 1);
    } else if (event.kind === "claim") {
      this.counts.claims++;
      const share = event.cells / CELLS;
      if (mine(event.who)) {
        this.onKnock?.("claim", Math.min(1, 0.3 + share * 12));
        this.pop(event.who, `+${(share * 100).toFixed(1)}%`, share > 0.02);
      }
    } else if (event.kind === "out") {
      this.counts.outs++;
      const f = this.figures[event.who];
      this.burst(f.group.position.x, f.group.position.z, COLORS[seatOfMover(this.state!, event.who)]);
      if (mine(event.who)) {
        shout(event.by >= 0 && event.by !== event.who ? `${this.live ? name(event.by) : moverName(this.state!, event.by)}에게 잘림!` : "탈락!");
        this.onKnock?.("out", 1);
      } else {
        if (event.by === this.mine) {
          shout(`${name(event.who)} 잡았다!`);
          this.onKnock?.("cut", 1);
        } else this.onKnock?.("out", 0.45);
      }
      if (!seen) this.onMove({ from: -1, to: OUT + event.who, extra: event.by >= 0 && event.by !== event.who ? event.by : -1 });
    } else if (event.kind === "back") {
      this.figures[event.who].born = performance.now();
      this.ring(event.who);
      if (mine(event.who)) this.onKnock?.("back", 0.8);
    } else if (event.kind === "end") {
      if (!seen) this.onMove({ from: -1, to: END, extra: packEnd(event.ranking, event.shares) });
    }
  }
  /** A word rising over a mover for a moment (+3.2%). */
  private pop(k: number, text: string, big: boolean) {
    if (capturing()) return;
    const f = this.figures[k],
      p = f.group.position.clone().setY(1.9).project(this.camera),
      el = document.createElement("span");
    el.className = `ld-pop${big ? " ld-big" : ""}`;
    el.textContent = text;
    el.style.left = `${((p.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - p.y) / 2) * 100}%`;
    this.pops.append(el);
    setTimeout(() => el.remove(), 1300);
  }
  /** Confetti in a mover's colour where it was put out. */
  private burst(x: number, z: number, color: string) {
    const n = this.rich ? 70 : 36,
      positions = new Float32Array(n * 3),
      velocity = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions.set([x, 0.5, z], i * 3);
      const a = Math.random() * Math.PI * 2,
        s = 1.5 + Math.random() * 3;
      velocity.set([Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s], i * 3);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    const points = new T.Points(geometry, new T.PointsMaterial({ color, size: 0.22, transparent: true }));
    this.scene.add(points);
    this.bursts.push({ points, velocity, age: 0 });
  }
  /** A ring that widens where a mover comes back. */
  private ring(k: number) {
    const m = this.world!.movers[k],
      mesh = new T.Mesh(new T.RingGeometry(0.6, 0.85, 40), new T.MeshBasicMaterial({ color: COLORS[seatOfMover(this.state!, k)], transparent: true, side: T.DoubleSide, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(sx(m.x), 0.06, sz(m.y));
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0 });
  }
  /** Everything where the round has it: the movers, their trails, the eye, the board and the map. */
  private pose(real: number, now: number) {
    const world = this.world!;
    world.movers.forEach((m, k) => {
      const f = this.figures[k];
      if (!f) return;
      const x = sx(m.x),
        z = sz(m.y);
      // The trail's line: the way it went since it left its land, up to where it is now.
      if (!m.alive || !m.trail.length) f.path = [];
      else {
        if (!f.path.length) f.path.push({ ...f.last });
        const end = f.path[f.path.length - 1];
        if (Math.hypot(end.x - m.x, end.y - m.y) > 0.3 && f.path.length < MOST - 2) f.path.push({ x: m.x, y: m.y });
      }
      f.last = { x: m.x, y: m.y };
      this.ribbon(f, m.alive ? { x: m.x, y: m.y } : null);
      f.group.visible = m.alive;
      if (!m.alive) return;
      const moved = Math.hypot(x - f.group.position.x, z - f.group.position.z);
      f.rolled += moved;
      f.group.position.set(x, 0, z);
      f.group.rotation.y = -m.heading;
      f.roller.rotation.y = -f.rolled / 0.13;
      // A little bob as it goes, and a pop when it comes back.
      const age = (now - f.born) / 1000,
        grow = age < 0.35 ? 0.4 + 0.6 * Math.sin((age / 0.35) * (Math.PI / 2)) * 1.08 : 1;
      f.body.position.y = Math.abs(Math.sin(f.rolled * 2.4)) * 0.06;
      f.body.scale.setScalar(grow * FIGURE);
    });
    // Confetti falls and fades; rings widen and fade.
    this.bursts = this.bursts.filter((b) => {
      b.age += real;
      const pos = b.points.geometry.getAttribute("position") as T.BufferAttribute;
      for (let i = 0; i < b.velocity.length; i += 3) {
        b.velocity[i + 1] -= 9 * real;
        pos.array[i] += b.velocity[i] * real;
        pos.array[i + 1] = Math.max(0.03, pos.array[i + 1] + b.velocity[i + 1] * real);
        pos.array[i + 2] += b.velocity[i + 2] * real;
      }
      pos.needsUpdate = true;
      (b.points.material as T.PointsMaterial).opacity = Math.max(0, 1 - b.age / 1.2);
      if (b.age < 1.2) return true;
      this.scene.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as T.Material).dispose();
      return false;
    });
    this.rings = this.rings.filter((r) => {
      r.age += real;
      r.mesh.scale.setScalar(1 + r.age * 4);
      (r.mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, 1 - r.age / 0.7);
      if (r.age < 0.7) return true;
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as T.Material).dispose();
      return false;
    });
    this.aim(real);
    this.describe(now);
  }
  /** A mover's trail as a ribbon along its points, up to its head. */
  private ribbon(f: Figure, head: { x: number; y: number } | null) {
    const pts = head && f.path.length ? [...f.path, head] : [],
      pos = f.positions,
      geometry = f.line.geometry;
    if (pts.length < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b.x - a.x,
        dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const x = sx(pts[i].x),
        z = sz(pts[i].y);
      pos.set([x - dy * HALF, 0.035, z + dx * HALF, x + dy * HALF, 0.035, z - dx * HALF], i * 6);
    }
    (geometry.getAttribute("position") as T.BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, (pts.length - 1) * 6);
  }
  /** The eye: over my mover (or the first in play, watching), drawn smoothly after it; the sun's shadows with it. */
  private aim(real: number) {
    const world = this.world!,
      k = this.mine ?? Math.max(0, world.movers.findIndex((m) => m.alive)),
      m = world.movers[k],
      to = { x: m.x, y: m.y };
    if (!this.eye.set) {
      this.eye = { ...to, set: true };
    } else {
      const t = 1 - Math.exp(-6 * real);
      this.eye.x += (to.x - this.eye.x) * t;
      this.eye.y += (to.y - this.eye.y) * t;
    }
    this.lookAtEye();
  }
  private lookAtEye() {
    const aspect = this.camera.aspect || 1,
      v = (FOV * Math.PI) / 360,
      h = Math.atan(Math.tan(v) * aspect),
      // Far enough back for `WIDE` cells across and `TALL` down (a tall phone sees fewer across).
      distance = Math.max((Math.min(WIDE, Math.max(11, TALL * aspect * 1.1)) / 2) / Math.tan(h), TALL / 2 / Math.tan(v)),
      x = sx(this.eye.x),
      z = sz(this.eye.y);
    this.camera.position.set(x, Math.sin(TILT) * distance, z + Math.cos(TILT) * distance);
    this.camera.lookAt(x, 0, z);
    if (this.sun) {
      this.sun.position.set(x - 10, 26, z + 8);
      this.sun.target.position.set(x, 0, z);
    }
  }
  protected resize() {
    super.resize();
    if (this.world) this.lookAtEye();
  }
  /** The clock and my share, the board of shares, the map; and what browser tests read off the canvas. */
  private describe(now: number) {
    const world = this.world!,
      state = this.state!,
      over = world.closed !== null || state.ranking !== null,
      left = Math.ceil(secondsLeft(world) - (world.tick < ticks(COUNTDOWN) ? COUNTDOWN : 0)),
      shown = Math.max(0, Math.min(state.seconds, left)),
      clock = `${Math.floor(shown / 60)}:${String(shown % 60).padStart(2, "0")}`,
      share = (k: number) => world.movers[k].land / CELLS,
      mine = this.mine,
      order = world.movers.map((_, k) => k).sort((a, b) => world.movers[b].land - world.movers[a].land || a - b),
      rows = order
        .map((k, i) => {
          const m = world.movers[k],
            seat = seatOfMover(state, k),
            name = this.live ? (k === mine ? "나" : COLOR_NAMES[seat]) : moverName(state, k);
          return `<li class="${k === mine ? "ld-me" : ""}${m.alive ? "" : " ld-out"}"><b>${i + 1}</b><i style="background:${COLORS[seat]}"></i><span>${name}</span><em>${(share(k) * 100).toFixed(1)}%</em></li>`;
        })
        .join(""),
      head = `<b>${clock}</b>${mine !== null ? `<span style="--me:${COLORS[seatOfMover(state, mine)]}">${(share(mine) * 100).toFixed(1)}%</span>` : ""}`;
    if (rows !== this.boardText) {
      this.boardText = rows;
      this.board.innerHTML = rows;
    }
    if (this.clock.innerHTML !== head) this.clock.innerHTML = head;
    if (now - this.mapAt > 200) {
      this.mapAt = now;
      this.drawMap();
    }
    const data = this.renderer.domElement.dataset;
    data.phase = over ? "over" : world.tick < ticks(COUNTDOWN) ? "countdown" : "play";
    data.movers = String(world.movers.length);
    data.mine = mine === null ? "" : String(mine);
    data.shares = world.movers.map((_, k) => (share(k) * 100).toFixed(2)).join(",");
    data.alive = world.movers.map((m) => (m.alive ? 1 : 0)).join(",");
    data.outs = world.movers.map((m) => m.outs).join(",");
    data.kos = world.movers.map((m) => m.kos).join(",");
    data.trails = world.movers.map((m) => m.trail.length).join(",");
    data.pos = world.movers.map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)}`).join(";");
    data.heading = world.movers.map((m) => m.heading.toFixed(2)).join(",");
    data.claims = String(this.counts.claims);
    data.left = String(shown);
  }
  /** The whole field small: each cell its owner's colour, the movers as dots (mine ringed), what is in view as a frame. */
  private drawMap() {
    const g = this.mapCanvas.getContext("2d");
    if (!g || !this.state) return;
    const world = this.world!,
      image = g.createImageData(N * 2, N * 2),
      bare = [238, 234, 220],
      tones = world.movers.map((_, k) => new T.Color(COLORS[seatOfMover(this.state!, k)])),
      rgb = tones.map((c) => [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)]);
    // (The colour's components are in the page's working space; near enough for a map.)
    for (let c = 0; c < CELLS; c++) {
      const who = this.owner[c],
        col = who ? rgb[who - 1] : bare,
        x = (c % N) * 2,
        y = Math.floor(c / N) * 2;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((y + dy) * N * 2 + x + dx) * 4;
        image.data[i] = col[0];
        image.data[i + 1] = col[1];
        image.data[i + 2] = col[2];
        image.data[i + 3] = 235;
      }
    }
    g.putImageData(image, 0, 0);
    world.movers.forEach((m, k) => {
      if (!m.alive) return;
      const f = this.figures[k];
      if (f && f.path.length > 1) {
        g.strokeStyle = `rgba(${rgb[k].join(",")},0.65)`;
        g.lineWidth = 1.5;
        g.beginPath();
        f.path.forEach((p, i) => (i ? g.lineTo(p.x * 2, p.y * 2) : g.moveTo(p.x * 2, p.y * 2)));
        g.lineTo(m.x * 2, m.y * 2);
        g.stroke();
      }
      g.fillStyle = `rgb(${rgb[k].join(",")})`;
      g.strokeStyle = "#ffffff";
      g.lineWidth = k === this.mine ? 2.5 : 1.5;
      g.beginPath();
      g.arc(m.x * 2, m.y * 2, k === this.mine ? 4 : 3, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    });
    this.map.style.backgroundImage = `url(${this.mapCanvas.toDataURL()})`;
  }
  protected subject(_aspect: number): TableSubject {
    return { half: WIDE / 2, halfZ: TALL / 2, height: 1, lookY: 0, tilt: TILT };
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    if (!this.built) this.build(state);
  }
  protected animate() {
    return false;
  }
  protected mark() {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    document.removeEventListener("keydown", this.keyDown);
    document.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.letGo);
    document.removeEventListener("visibilitychange", this.hidden);
    for (const b of this.bursts) {
      b.points.geometry.dispose();
      (b.points.material as T.Material).dispose();
    }
    for (const r of this.rings) {
      r.mesh.geometry.dispose();
      (r.mesh.material as T.Material).dispose();
    }
    this.hud.remove();
    this.pad.remove();
    super.dispose();
  }
}
