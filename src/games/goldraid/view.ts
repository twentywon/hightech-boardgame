import * as T from "three";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { FOV } from "../../engine/camera";
import { END, TILT, aimX, follow, goldRaidFrame, goldRaidSubject, pairView, type Frame } from "./layout";
import { TIME, depositMove, raidedMove, type State } from "./rules";
import { BLAST, BODY, CAP, CART, DT, FUSE, LOOT_LIFE, SWING, createWorld, gateOf, step, think, timeLeft, type Bandit, type Happening, type Input, type Loot, type LootKind, type World } from "./sim";
import { Hand, LEVER_JUMP, leverRun, type Act } from "./hands";
import { CLOUDS, GAUGE_TALL, SIDE_COLORS, SUNLIGHT, buildValley, type Valley } from "./valley";
import { capable } from "../../engine/scene-utils";
import { Effects } from "./fx";
import { glint, glow, painted, stream } from "./paint";

export const GOLD_RAID_COLORS: [string, string] = SIDE_COLORS;
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The keys of the first person at the screen and of the second (against the computer both sets are mine). */
const FIRST: Record<string, Act> = { KeyA: "left", KeyD: "right", KeyW: "jump", KeyS: "strike", KeyF: "strike", Space: "jump" };
const SECOND: Record<string, Act> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "jump", ArrowDown: "strike", Slash: "strike", Numpad0: "strike" };
/** A bandit king's figure: what of it moves. */
interface Figure {
  group: T.Group;
  lean: T.Group;
  legs: [T.Group, T.Group];
  arm: T.Group;
  /** The arm away from the eye, and the cape. */
  back: T.Group;
  cape: T.Group;
  sack: T.Mesh;
  loot: T.Mesh;
  stars: T.Group;
  tag: T.Sprite | null;
  /** Whether it was in the air at the last pose, when it last came down (it squashes and kicks up dust), and when its feet last threw dust. */
  air: boolean;
  landed: number;
  puffed: number;
}
interface CartModel {
  group: T.Group;
  wheels: T.Group[];
  cover: T.Object3D;
  legs: T.Object3D[];
  heap: T.Object3D;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The figures are drawn a little larger than the bodies the valley reckons with, to be read on a phone. */
const DRAWN = 1.22;

/**
 * 금화 쟁탈전: the valley of `valley.ts` seen from the side, two bandit kings (jointed figures with a crown, a sword and
 * a sack that swells as it fills), the loot that falls (coins, pouches, gems, chests, bombs), the merchant's ox cart,
 * and the two castles whose towers fill with gold. The view steps the valley in real time (`sim.ts`) and reports
 * deposits, robberies and the clock's end as moves; a board over the canvas shows both treasuries and sacks.
 *
 * Keys: the first person A D to run, W (or Space) to jump, S or F to strike; the second ← →, ↑, and ↓ or /; against
 * the computer both sets are mine. A touch screen gets a lever (sideways runs, up jumps) and 치기 (for two at one screen
 * a lever and 치기 at each side).
 */
export class GoldRaidView extends TableView<State> {
  private world: World | null = null;
  private valley: Valley;
  private figures: Figure[] = [];
  private lootMeshes = new Map<number, { item: Loot; mesh: T.Group; kind: LootKind; glints: T.Sprite | null; spark: T.Sprite | null }>();
  private lootParts: Record<string, { geometry: T.BufferGeometry; material: T.Material }[]> = {};
  private cart: CartModel;
  private arrows: T.Mesh[] = [];
  private coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private blasts: { mesh: T.Mesh; material: T.MeshBasicMaterial; age: number }[] = [];
  private sparks: { points: T.Points; pos: Float32Array; vel: Float32Array; life: Float32Array; next: number };
  private hands = [new Hand(), new Hand()];
  private hud: HTMLElement;
  private board: HTMLElement;
  /** The strip under the board: the whole valley small, with the castles, the bandits, the cart, chests and what is in view. */
  private map: HTMLElement;
  private charted = new Map<HTMLElement, string>();
  /** The line down the middle while two at one screen are split. */
  private seam: HTMLElement;
  private pad: HTMLElement;
  private sun: T.DirectionalLight;
  private rich: boolean;
  private fx: Effects;
  private flash: T.PointLight | null = null;
  private flashed_at = -9;
  private tip = new T.Vector3();
  private cartDust = 0;
  /** The eye: against the computer it follows my bandit; two at one screen, one view holds both or the screen is split. */
  private eye = { x: 0, zoom: 1, split: false, halves: [0, 0] as [number, number], set: false };
  /** The right half's camera while the screen is split (the left half's is the view's own). */
  private second = new T.PerspectiveCamera(FOV, 1, 0.1, 200);
  /** The canvas's shape (the cameras' own aspects are each half's while split). */
  private shape = 16 / 9;
  private word: HTMLElement;
  private pops: HTMLElement;
  private hudText = "";
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private counts = { jumps: [0, 0], swings: [0, 0], pickups: [0, 0], deposits: [0, 0], hits: 0, booms: 0, carts: 0, raids: 0 };
  /** When each gate last took gold (its ring flashes), and when the ground last shook. */
  private flashed = [-9, -9];
  private shook = -9;
  private rang = -9;
  /** The sounds of the valley (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  private readonly keyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly keyUp = (e: KeyboardEvent) => this.key(e, false);
  private readonly letGo = () => {
    this.hands.forEach((h) => h.clear());
    this.pad?.querySelectorAll<HTMLElement>(".gr-stick").forEach((stick) => {
      this.drawKnob(stick, 0, 0);
      stick.classList.remove("on");
    });
    this.pad?.querySelectorAll(".gr-btn.on").forEach((b) => b.classList.remove("on"));
  };
  private readonly hidden = () => document.hidden && this.letGo();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private two: boolean,
    private level: Level,
  ) {
    super(host, quality, "#a9d8f2");
    const own: Own = (r) => this.own(r);
    // Several fingers on this canvas are the game's own (two players at one screen).
    noZoom(this.renderer.domElement);
    this.camera.far = 200;
    // A graphics card gets the richer valley (relief, torch light, soft shadows, more grass); where the processor
    // draws (and in the browser tests) it keeps to what is cheap.
    const rich = (this.rich = capable());
    this.scene.add(new T.HemisphereLight("#d6e8ff", "#6f7a44", 1.75));
    // The low afternoon sun goes along with the eye (`light`): its shadows are drawn round what is in view.
    const sun = (this.sun = new T.DirectionalLight(SUNLIGHT, 2.7));
    sun.position.set(7, 9, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -19, right: 19, top: 11, bottom: -3, near: 1, far: 40 });
    sun.shadow.normalBias = 0.03;
    if (rich) {
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      // A bomb's flash lights what is round it.
      this.flash = new T.PointLight("#ffb060", 0, 7, 2);
      this.scene.add(this.flash);
    }
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    this.valley = buildValley(this.scene, own, rich);
    this.fx = new Effects(this.scene, own);
    this.cart = this.makeCart(own);
    // An arrow over each gate, shown to a person carrying gold: bring it here.
    const cone = own(new T.ConeGeometry(0.26, 0.5, 4));
    for (const side of [0, 1] as const) {
      const arrow = new T.Mesh(cone, own(new T.MeshBasicMaterial({ color: "#ffd84a" })));
      arrow.rotation.x = Math.PI;
      arrow.position.set(gateOf(side), 2.6, 0.5);
      arrow.visible = false;
      this.scene.add(arrow);
      this.arrows.push(arrow);
    }
    for (const side of [0, 1] as const) this.figures.push(this.makeFigure(own, side));
    this.sparks = this.makeSparks(own);
    const sphere = own(new T.SphereGeometry(1, 20, 14));
    for (let k = 0; k < 4; k++) {
      const material = own(new T.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0, depthWrite: false })),
        mesh = new T.Mesh(sphere, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.blasts.push({ mesh, material, age: 9 });
    }
    // The board over the canvas, a word called out, small numbers that rise where gold is taken, and the touch buttons.
    const el = (cls: string) => {
      const d = document.createElement("div");
      d.className = cls;
      d.setAttribute("aria-hidden", "true");
      host.append(d);
      return d;
    };
    this.hud = el("gr-hud");
    this.board = document.createElement("div");
    this.map = document.createElement("div");
    this.map.className = "gr-map";
    this.map.innerHTML =
      `<i class="gr-map-road"></i><b class="gr-map-eye"></b><b class="gr-map-eye"></b>` +
      [0, 1].map((side) => `<i class="gr-map-castle gr-s${side}"></i>`).join("") +
      `<i class="gr-map-cart"></i>` +
      `<i class="gr-map-chest"></i>`.repeat(4) +
      [1, 0].map((side) => `<i class="gr-map-man gr-s${side}${side === 0 || this.two ? " gr-mine" : ""}"></i>`).join("");
    this.hud.append(this.board, this.map);
    this.seam = el("gr-seam");
    this.word = el("gr-word");
    this.pops = el("gr-pops");
    this.pad = el("gr-pad");
    this.makePad();
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.style.cursor = "default";
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
  /** The scene is our own daylight: the reflected room of the table games would grey it. */
  protected photographic() {
    return false;
  }
  /** The valley never makes the screen wait: gold may be brought home at any moment. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.letGo();
  }
  private running() {
    return !!this.world && !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** A key for a person's hand, from anywhere on the page but a field, a window or another button. */
  private key(e: KeyboardEvent, down: boolean) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let hand = 0,
      act: Act | undefined = FIRST[e.code];
    if (!act) {
      act = SECOND[e.code];
      if (act && this.two) hand = 1;
    }
    if (!act) return;
    const target = e.target;
    if (target instanceof Element && target !== this.renderer.domElement && target.closest("input, select, textarea, dialog, button")) return;
    if (down && document.querySelector("dialog[open]")) return;
    e.preventDefault();
    const h = this.hands[hand];
    if (down) {
      if (!e.repeat && !h.keys.has(act)) h.press(act);
      h.keys.add(act);
    } else h.keys.delete(act);
  }
  /**
   * The touch controls: a lever at the lower left (lean it sideways to run, the further the faster; up to jump) and
   * 치기 at the lower right for one person; for two at one screen each has a lever at its own edge and 치기 beside it.
   * Several fingers at once: two levers and two buttons.
   */
  private makePad() {
    if (!this.coarse) return;
    const strike = (side: number) =>
        `<button type="button" class="gr-btn gr-strike" tabindex="-1" data-side="${side}" data-act="strike" aria-label="치기" style="--side:${SIDE_COLORS[side]}"><span aria-hidden="true">치기</span></button>`,
      lever = (side: number) =>
        `<div class="gr-stick" data-side="${side}" role="slider" aria-label="${this.two ? `${side + 1}P ` : ""}레버: 옆으로 달리기, 위로 점프" style="--side:${SIDE_COLORS[side]}"><i class="gr-ways" aria-hidden="true"><b class="gr-w-l">◀</b><b class="gr-w-u">▲</b><b class="gr-w-r">▶</b></i><span class="gr-knob"></span></div>`;
    this.pad.classList.toggle("gr-two", this.two);
    this.pad.innerHTML = this.two
      ? `<div class="gr-cluster gr-at-left">${lever(0)}${strike(0)}</div><div class="gr-cluster gr-at-right">${strike(1)}${lever(1)}</div>`
      : `<div class="gr-cluster gr-at-left">${lever(0)}</div><div class="gr-cluster gr-at-right">${strike(0)}</div>`;
    type Finger = { side: number; el: HTMLElement } & ({ kind: "act"; act: Act } | { kind: "lever" });
    const fingers = new Map<number, Finger>();
    /** A lever's lean under a finger at (cx, cy), and its knob drawn there. */
    const lean = (f: Finger, cx: number, cy: number) => {
      const box = f.el.getBoundingClientRect(),
        reach = box.width * 0.3;
      let x = (cx - (box.x + box.width / 2)) / reach,
        y = -(cy - (box.y + box.height / 2)) / reach;
      const far = Math.hypot(x, y);
      if (far > 1) (x /= far), (y /= far);
      this.hands[f.side].lean(x, y);
      this.drawKnob(f.el, x, y);
    };
    const lift = (e: PointerEvent) => {
      const f = fingers.get(e.pointerId);
      if (!f) return;
      fingers.delete(e.pointerId);
      const others = [...fingers.values()];
      if (f.kind === "lever") {
        if (others.some((o) => o.kind === "lever" && o.side === f.side)) return;
        this.hands[f.side].lean(0, 0);
        this.drawKnob(f.el, 0, 0);
        f.el.classList.remove("on");
        return;
      }
      // Another finger may still hold the same button.
      if (!others.some((o) => o.kind === "act" && o.side === f.side && o.act === f.act)) {
        this.hands[f.side].touch.delete(f.act);
        f.el.classList.remove("on");
      }
    };
    this.pad.addEventListener("pointerdown", (e) => {
      if (this.disposed) return;
      const target = e.target as HTMLElement,
        stick = target.closest<HTMLElement>(".gr-stick"),
        b = stick ? null : target.closest<HTMLElement>(".gr-btn"),
        el = stick ?? b;
      if (!el) return;
      e.preventDefault();
      const side = Number(el.dataset.side);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer the page cannot capture: it is held without.
      }
      if (stick) {
        const f: Finger = { side, el: stick, kind: "lever" };
        fingers.set(e.pointerId, f);
        stick.classList.add("on");
        lean(f, e.clientX, e.clientY);
        return;
      }
      const act = el.dataset.act as Act,
        hand = this.hands[side];
      fingers.set(e.pointerId, { side, el, kind: "act", act });
      if (!hand.touch.has(act)) hand.press(act);
      hand.touch.add(act);
      el.classList.add("on");
    });
    this.pad.addEventListener("pointermove", (e) => {
      const f = fingers.get(e.pointerId);
      if (f?.kind === "lever") lean(f, e.clientX, e.clientY);
    });
    this.pad.addEventListener("pointerup", lift);
    this.pad.addEventListener("pointercancel", lift);
    this.pad.addEventListener("lostpointercapture", lift);
    this.pad.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  /** A lever's knob where it leans, and its arrows lit the way it goes. */
  private drawKnob(stick: HTMLElement, x: number, y: number) {
    const box = stick.getBoundingClientRect(),
      reach = box.width * 0.3,
      knob = stick.querySelector<HTMLElement>(".gr-knob")!;
    knob.style.transform = x || y ? `translate(${(x * reach).toFixed(1)}px, ${(-y * reach).toFixed(1)}px)` : "";
    const run = leverRun(x);
    stick.classList.toggle("gr-go-l", run < 0);
    stick.classList.toggle("gr-go-r", run > 0);
    stick.classList.toggle("gr-go-u", y > LEVER_JUMP);
  }
  /** A bandit king: boots and legs, a tunic in its side's colour, a bearded head under a gold crown, a sword and a sack. */
  private makeFigure(own: Own, side: 0 | 1): Figure {
    const m = (color: string, roughness = 0.7, extra: T.MeshStandardMaterialParameters = {}) => this.standard({ color, roughness, ...extra }),
      colour = new T.Color(SIDE_COLORS[side]),
      // The tunic: woven cloth in the side's colour with a gold hem.
      tunic = m("#ffffff", 0.75, {
        map: painted(own, 128, 128, (ctx) => {
          ctx.fillStyle = colour.getStyle();
          ctx.fillRect(0, 0, 128, 128);
          const random = stream(side + 3);
          for (let k = 0; k < 900; k++) {
            ctx.fillStyle = random() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.07)";
            ctx.fillRect(Math.floor(random() * 64) * 2, Math.floor(random() * 64) * 2, 2, 2);
          }
          // Folds down the cloth, and the gold hem near the bottom.
          for (let x = 0; x < 128; x += 16) {
            const g = ctx.createLinearGradient(x, 0, x + 16, 0);
            g.addColorStop(0, "rgba(0,0,0,0.12)");
            g.addColorStop(0.5, "rgba(255,255,255,0.06)");
            g.addColorStop(1, "rgba(0,0,0,0.12)");
            ctx.fillStyle = g;
            ctx.fillRect(x, 70, 16, 58);
          }
          ctx.fillStyle = "#e8b830";
          ctx.fillRect(0, 108, 128, 7);
          ctx.fillStyle = "#fff0a0";
          ctx.fillRect(0, 108, 128, 1.5);
        }),
      }),
      sleeve = m(colour.clone().offsetHSL(0, 0, -0.05).getStyle(), 0.75),
      trousers = m("#3a3a48", 0.85),
      boot = m("#5a3a22", 0.55),
      leather = m("#4a2e1a", 0.5),
      skin = m("#f2c49c", 0.65),
      cheek = m("#f0a890", 0.7),
      hair = m(side === 0 ? "#5a3a22" : "#e2ddd2", 0.9),
      white = m("#ffffff", 0.4),
      pupil = m("#1a1410", 0.3),
      gold = m("#ffcc33", 0.25, { metalness: 0.6, emissive: "#6a4a00", emissiveIntensity: 0.35 }),
      ermine = m("#f6f2ea", 0.95),
      wood = m("#8a5a34", 0.7),
      steel = m("#7a7a82", 0.35, { metalness: 0.7 }),
      cloth = m("#ffffff", 0.95, {
        map: painted(own, 64, 64, (ctx) => {
          ctx.fillStyle = "#a8824e";
          ctx.fillRect(0, 0, 64, 64);
          const random = stream(side + 11);
          for (let y = 0; y < 64; y += 3)
            for (let x = 0; x < 64; x += 3) {
              ctx.fillStyle = (x + y) % 6 ? "rgba(60,40,20,0.2)" : "rgba(255,230,180,0.15)";
              ctx.fillRect(x, y, 2, 2);
            }
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = "rgba(70,50,30,0.3)";
            ctx.fillRect(random() * 64, random() * 64, 10, 6);
          }
        }),
      }),
      capeCloth = this.own(
        new T.MeshStandardMaterial({
          side: T.DoubleSide,
          roughness: 0.8,
          map: painted(own, 64, 128, (ctx) => {
            const g = ctx.createLinearGradient(0, 0, 64, 0);
            g.addColorStop(0, colour.clone().offsetHSL(0, 0, -0.18).getStyle());
            g.addColorStop(0.5, colour.clone().offsetHSL(0, 0, -0.08).getStyle());
            g.addColorStop(1, colour.clone().offsetHSL(0, 0, -0.2).getStyle());
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 64, 128);
            ctx.fillStyle = "#e8b830";
            ctx.fillRect(0, 120, 64, 8);
          }),
        }),
      ),
      group = new T.Group(),
      lean = new T.Group(),
      cyl = own(new T.CylinderGeometry(1, 1, 1, 12)),
      ball = own(new T.SphereGeometry(1, 18, 14));
    group.add(lean);
    const part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: T.Object3D = lean) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // Legs: trousers into boots with turned-down cuffs.
    const legs = [0.1, -0.1].map((z) => {
      const leg = new T.Group();
      leg.position.set(0, 0.48, z);
      part(cyl, trousers, 0, -0.17, 0, 0.078, 0.34, 0.078, leg);
      part(cyl, boot, 0, -0.36, 0, 0.082, 0.18, 0.082, leg);
      part(cyl, leather, 0, -0.27, 0, 0.095, 0.04, 0.095, leg);
      part(own(new T.CapsuleGeometry(0.06, 0.14, 4, 10)), boot, 0.05, -0.44, 0, 1, 1, 1, leg).rotation.z = Math.PI / 2;
      lean.add(leg);
      return leg;
    }) as [T.Group, T.Group];
    // The cape, behind the body, hung from the shoulders.
    const cape = new T.Group();
    cape.position.set(-0.08, 1.0, -0.12);
    const capeShape = own(new T.PlaneGeometry(0.2, 0.62, 1, 5));
    capeShape.translate(-0.06, -0.31, 0);
    part(capeShape, capeCloth, 0, 0, 0, 1, 1, 1, cape);
    lean.add(cape);
    // The body: the tunic, a belt with a gold buckle and a pouch, a collar.
    part(own(new T.CapsuleGeometry(0.2, 0.26, 8, 16)), tunic, 0, 0.74, 0, 1, 1, 1);
    part(cyl, leather, 0, 0.58, 0, 0.216, 0.065, 0.216);
    part(own(new T.BoxGeometry(0.05, 0.09, 0.1)), gold, 0.205, 0.58, 0, 1, 1, 1);
    part(ball, leather, 0.1, 0.52, 0.16, 0.06, 0.07, 0.05);
    part(own(new T.TorusGeometry(0.15, 0.04, 8, 18)), ermine, 0.01, 0.97, 0, 1, 1, 1).rotation.x = Math.PI / 2;
    // The head: hair at the back, the face turned the way it runs (eyes, brows, a round nose, rosy cheeks), a
    // moustache over a full beard, and the crown on an ermine band, set with stones.
    part(ball, skin, 0.02, 1.08, 0, 0.18, 0.18, 0.18);
    part(ball, hair, -0.06, 1.12, 0, 0.15, 0.13, 0.17);
    part(ball, hair, 0.08, 0.98, 0, 0.15, 0.13, 0.16);
    part(ball, hair, 0.12, 0.93, 0, 0.1, 0.1, 0.12);
    for (const z of [0.06, -0.06]) part(ball, hair, 0.18, 1.03, z, 0.05, 0.025, 0.06).rotation.y = z * 4;
    part(ball, skin, 0.2, 1.07, 0, 0.042, 0.042, 0.042);
    for (const z of [0.075, -0.075]) {
      part(ball, cheek, 0.15, 1.04, z, 0.03, 0.025, 0.02);
      part(ball, white, 0.16, 1.13, z, 0.032, 0.036, 0.03);
      part(ball, pupil, 0.185, 1.13, z, 0.018, 0.022, 0.018);
      part(own(new T.BoxGeometry(0.07, 0.018, 0.035)), hair, 0.165, 1.18, z, 1, 1, 1).rotation.z = 0.15;
    }
    part(own(new T.TorusGeometry(0.155, 0.035, 8, 20)), ermine, 0.02, 1.215, 0, 1, 1, 1).rotation.x = Math.PI / 2;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      part(ball, pupil, 0.02 + Math.cos(a) * 0.17, 1.215, Math.sin(a) * 0.17, 0.008, 0.012, 0.008);
    }
    part(own(new T.CylinderGeometry(0.16, 0.15, 0.11, 16, 1, true)), own(new T.MeshStandardMaterial({ color: "#ffcc33", roughness: 0.25, metalness: 0.6, emissive: "#6a4a00", emissiveIntensity: 0.35, side: T.DoubleSide })), 0.02, 1.29, 0, 1, 1, 1);
    part(ball, m("#b02030", 0.6), 0.02, 1.27, 0, 0.13, 0.06, 0.13);
    const spike = own(new T.ConeGeometry(0.035, 0.1, 6));
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      part(spike, gold, 0.02 + Math.cos(a) * 0.15, 1.39, Math.sin(a) * 0.15, 1, 1, 1);
      part(ball, gold, 0.02 + Math.cos(a) * 0.15, 1.45, Math.sin(a) * 0.15, 0.018, 0.018, 0.018);
    }
    const stones = ["#e8304a", "#3aa0ff", "#38d070"];
    for (let k = 0; k < 3; k++) {
      const a = -0.6 + k * 0.6;
      part(ball, m(stones[(k + side) % 3], 0.15, { emissive: stones[(k + side) % 3], emissiveIntensity: 0.35 }), 0.02 + Math.cos(a) * 0.162, 1.3, Math.sin(a) * 0.162, 0.025, 0.025, 0.02);
    }
    // The sack on its back: it swells as it fills, gold showing at its mouth; its strap across the chest.
    const sack = part(ball, cloth, -0.27, 0.78, 0, 0.16, 0.18, 0.16),
      loot = part(ball, gold, -0.27, 0.95, 0, 0.09, 0.05, 0.09);
    part(cyl, leather, -0.1, 0.9, -0.18, 0.03, 0.32, 0.03).rotation.z = 0.9;
    part(cyl, leather, 0.02, 0.8, 0.19, 0.022, 0.42, 0.022).rotation.z = -0.8;
    // The arm away from the eye, swinging as it runs.
    const back = new T.Group();
    back.position.set(0.0, 0.92, -0.2);
    part(cyl, sleeve, 0, -0.13, 0, 0.06, 0.26, 0.06, back);
    part(cyl, ermine, 0, -0.26, 0, 0.065, 0.03, 0.065, back);
    part(ball, skin, 0, -0.3, 0, 0.06, 0.06, 0.06, back);
    lean.add(back);
    // The sword arm, toward the eye (the user asked for a sword in place of the club): a gold pommel over a grip bound in
    // leather, a gold crossguard, a long bright blade with a dark fuller down its middle and a pointed tip.
    const arm = new T.Group();
    arm.position.set(0.02, 0.92, 0.22);
    part(own(new T.SphereGeometry(1, 12, 10)), sleeve, 0, 0, 0, 0.085, 0.085, 0.085, arm);
    part(cyl, sleeve, 0, -0.14, 0, 0.065, 0.28, 0.065, arm);
    part(cyl, ermine, 0, -0.27, 0, 0.07, 0.03, 0.07, arm);
    part(ball, skin, 0, -0.3, 0, 0.065, 0.065, 0.065, arm);
    const blade = m("#e8edf5", 0.22, { metalness: 0.6, emissive: "#6a7484", emissiveIntensity: 0.45 }),
      fuller = m("#8d96a6", 0.3, { metalness: 0.8 });
    part(ball, gold, 0, -0.22, 0, 0.035, 0.035, 0.035, arm);
    part(cyl, leather, 0, -0.33, 0, 0.026, 0.17, 0.026, arm);
    for (const y of [-0.28, -0.33, -0.38]) part(cyl, wood, 0, y, 0, 0.029, 0.012, 0.029, arm);
    part(own(new T.BoxGeometry(1, 1, 1)), gold, 0, -0.43, 0, 0.22, 0.04, 0.05, arm);
    for (const x of [-0.11, 0.11]) part(ball, gold, x, -0.43, 0, 0.028, 0.028, 0.028, arm);
    // The blade's flat faces the eye (the swing turns it in the picture's plane).
    part(own(new T.BoxGeometry(1, 1, 1)), blade, 0, -0.76, 0, 0.085, 0.62, 0.018, arm);
    part(own(new T.BoxGeometry(1, 1, 1)), fuller, 0, -0.72, 0, 0.018, 0.46, 0.022, arm);
    const tip = part(own(new T.ConeGeometry(0.053, 0.13, 4)), blade, 0, -1.13, 0, 1, 1, 1, arm);
    tip.rotation.set(Math.PI, Math.PI / 4, 0);
    tip.scale.set(0.85, 1, 0.24);
    lean.add(arm);
    // Stars round its head while it is stunned.
    const stars = new T.Group(),
      star = own(new T.OctahedronGeometry(0.07)),
      yellow = own(new T.MeshBasicMaterial({ color: "#fff06a" })),
      twinkle = own(new T.SpriteMaterial({ map: glint(own, 64), color: "#fff6a0", transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    for (let k = 0; k < 4; k++) {
      const s = new T.Mesh(star, yellow),
        a = (k * Math.PI * 2) / 4;
      s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
      const t = new T.Sprite(twinkle);
      t.scale.setScalar(0.3);
      s.add(t);
      stars.add(s);
    }
    stars.position.y = 1.58;
    stars.visible = false;
    group.add(stars);
    this.scene.add(group);
    return { group, lean, legs, arm, back, cape, sack, loot, stars, tag: null, air: false, landed: -9, puffed: 0 };
  }
  /** A name over a bandit's head (나, 1P, 2P). */
  private makeTag(own: Own, text: string, color: string) {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.font = '900 44px "Inter", "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#1b1f24";
    ctx.strokeText(text, 80, 38);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 80, 38);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#1b1f24";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(66, 68);
    ctx.lineTo(94, 68);
    ctx.lineTo(80, 90);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    const map = own(new T.CanvasTexture(c));
    map.colorSpace = T.SRGBColorSpace;
    const tag = new T.Sprite(own(new T.SpriteMaterial({ map, depthTest: false, transparent: true })));
    tag.scale.set(1.2, 0.72, 1);
    tag.renderOrder = 10;
    this.scene.add(tag);
    return tag;
  }
  /** The merchant's cart: a plank wagon under a patched canvas cover with gold heaped at its tail, on two iron-shod spoked wheels, drawn by an ox under a yoke. */
  private makeCart(own: Own): CartModel {
    const m = (color: string, roughness = 0.8, extra: T.MeshStandardMaterialParameters = {}) => this.standard({ color, roughness, ...extra }),
      boards = m("#ffffff", 0.85, {
        map: painted(own, 256, 64, (ctx) => {
          const random = stream(71);
          for (let b = 0; b < 4; b++) {
            ctx.fillStyle = ["#8a5a34", "#94623a", "#7e522f", "#8f5d36"][b];
            ctx.fillRect(0, b * 16, 256, 16);
            for (let k = 0; k < 12; k++) {
              ctx.strokeStyle = "rgba(50,30,14,0.3)";
              ctx.lineWidth = 1;
              const y = b * 16 + random() * 16;
              ctx.beginPath();
              ctx.moveTo(0, y);
              ctx.lineTo(256, y + (random() - 0.5) * 3);
              ctx.stroke();
            }
            ctx.fillStyle = "rgba(30,18,8,0.7)";
            ctx.fillRect(0, b * 16, 256, 1.5);
          }
          ctx.fillStyle = "#2c2824";
          for (const x of [20, 128, 236]) ctx.fillRect(x, 0, 8, 64);
        }),
      }),
      wood = m("#8a5a34"),
      dark = m("#3a2a1e"),
      iron = m("#3a3a40", 0.4, { metalness: 0.6 }),
      canvasCloth = m("#ffffff", 0.95, {
        side: T.DoubleSide,
        map: painted(own, 256, 128, (ctx) => {
          ctx.fillStyle = "#efe4c8";
          ctx.fillRect(0, 0, 256, 128);
          for (let x = 0; x < 256; x += 32) {
            ctx.fillStyle = "rgba(190,70,50,0.75)";
            ctx.fillRect(x, 0, 12, 128);
          }
          const random = stream(19);
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = ["#d8c49a", "#c9b48a", "#e2d2aa"][k % 3];
            const x = random() * 220,
              y = random() * 90;
            ctx.fillRect(x, y, 26, 22);
            ctx.strokeStyle = "rgba(80,60,40,0.6)";
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(x, y, 26, 22);
            ctx.setLineDash([]);
          }
          for (let k = 0; k < 400; k++) {
            ctx.fillStyle = "rgba(120,100,70,0.12)";
            ctx.fillRect(random() * 256, random() * 128, 2, 2);
          }
        }),
      }),
      hide = m("#a87a4e", 0.85),
      belly = m("#d8bc94", 0.9),
      horn = m("#f2ead8", 0.5),
      gold = m("#ffcc33", 0.25, { metalness: 0.6, emissive: "#7a5a00", emissiveIntensity: 0.5 }),
      group = new T.Group(),
      add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = group) => {
        const mesh = new T.Mesh(own(geometry), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
      };
    add(new T.BoxGeometry(1.5, 0.1, 0.9), boards, -0.5, 0.52, 0);
    for (const z of [0.44, -0.44]) add(new T.BoxGeometry(1.5, 0.3, 0.05), boards, -0.5, 0.7, z);
    add(new T.BoxGeometry(0.05, 0.3, 0.9), boards, -1.24, 0.7, 0);
    add(new T.BoxGeometry(1.56, 0.05, 0.06), dark, -0.5, 0.86, 0.45);
    const cover = new T.Group();
    const hoop = add(new T.CylinderGeometry(0.5, 0.5, 1.1, 18, 1, true, 0, Math.PI), canvasCloth, -0.32, 0.82, 0, cover);
    hoop.rotation.set(0, 0, Math.PI / 2);
    hoop.rotation.order = "ZYX";
    hoop.rotation.y = Math.PI / 2;
    // Ribs over the canvas.
    for (const x of [-0.82, -0.32, 0.18]) {
      const rib = add(new T.TorusGeometry(0.505, 0.018, 5, 16, Math.PI), wood, x + 0.05, 0.82, 0, cover);
      rib.rotation.y = Math.PI / 2;
    }
    group.add(cover);
    // The gold at its tail: a heap of coins and pouches, catching the light.
    const heap = new T.Group(),
      coin = own(new T.CylinderGeometry(0.07, 0.07, 0.02, 14)),
      random = stream(29);
    for (let k = 0; k < 22; k++) {
      const c = new T.Mesh(coin, gold);
      c.position.set(-1.1 + random() * 0.24, 0.62 + random() * 0.25, -0.34 + random() * 0.68);
      c.rotation.set(random() * 3, random() * 3, random() * 3);
      heap.add(c);
    }
    for (let k = 0; k < 3; k++) add(new T.SphereGeometry(0.11, 12, 10), m("#9c6b3c", 0.95), -1.0, 0.72, -0.25 + k * 0.25, heap);
    const shine = new T.Sprite(own(new T.SpriteMaterial({ map: glint(own, 64), color: "#fff0b0", transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    shine.position.set(-1.05, 0.95, 0.35);
    shine.scale.setScalar(0.5);
    heap.add(shine);
    group.add(heap);
    const wheels = [0.5, -0.5].map((z) => {
      const wheel = new T.Group();
      wheel.position.set(-0.5, 0.38, z);
      add(new T.TorusGeometry(0.34, 0.04, 8, 28), wood, 0, 0, 0, wheel);
      add(new T.TorusGeometry(0.365, 0.018, 6, 28), iron, 0, 0, 0, wheel);
      for (let k = 0; k < 4; k++) add(new T.BoxGeometry(0.64, 0.04, 0.035), wood, 0, 0, 0, wheel).rotation.z = (k * Math.PI) / 4;
      add(new T.CylinderGeometry(0.07, 0.07, 0.1, 12), dark, 0, 0, 0, wheel).rotation.x = Math.PI / 2;
      add(new T.CylinderGeometry(0.035, 0.035, 0.12, 8), iron, 0, 0, z > 0 ? 0.03 : -0.03, wheel).rotation.x = Math.PI / 2;
      group.add(wheel);
      return wheel;
    });
    // The pole, the yoke and the ox: a deep body, a paler belly, a broad head with a muzzle and curved horns, a tail.
    add(new T.BoxGeometry(0.9, 0.05, 0.05), wood, 0.55, 0.52, 0);
    const body = add(new T.CapsuleGeometry(0.24, 0.5, 6, 14), hide, 0.95, 0.7, 0);
    body.rotation.z = Math.PI / 2;
    body.scale.set(1, 1, 0.85);
    const under = add(new T.CapsuleGeometry(0.18, 0.4, 6, 12), belly, 0.95, 0.6, 0);
    under.rotation.z = Math.PI / 2;
    under.scale.set(1, 1, 0.8);
    add(new T.SphereGeometry(0.2, 14, 12), hide, 1.3, 0.82, 0).scale.set(1, 1.1, 0.9);
    const head = add(new T.SphereGeometry(0.16, 14, 12), hide, 1.53, 0.8, 0);
    head.scale.set(1.15, 1, 0.9);
    add(new T.SphereGeometry(0.1, 12, 10), m("#e8cfae", 0.8), 1.68, 0.72, 0).scale.set(1, 0.8, 1.1);
    for (const z of [0.06, -0.06]) add(new T.SphereGeometry(0.018, 6, 6), dark, 1.76, 0.73, z);
    for (const z of [0.09, -0.09]) add(new T.SphereGeometry(0.022, 8, 6), dark, 1.6, 0.86, z);
    for (const s of [1, -1]) {
      const h = add(new T.TorusGeometry(0.11, 0.022, 6, 12, Math.PI * 0.7), horn, 1.5, 0.98, s * 0.08);
      h.rotation.set(s * 0.3, s > 0 ? 0 : Math.PI, 0.4);
      const ear = add(new T.SphereGeometry(0.05, 8, 6), hide, 1.46, 0.9, s * 0.15);
      ear.scale.set(0.6, 0.4, 1.2);
    }
    // The yoke over its neck, and the bell under it.
    add(new T.BoxGeometry(0.08, 0.06, 0.6), wood, 1.3, 1.0, 0);
    add(new T.SphereGeometry(0.06, 10, 8), gold, 1.36, 0.55, 0);
    const tail = add(new T.CylinderGeometry(0.015, 0.02, 0.4, 5), hide, 0.6, 0.62, 0);
    tail.rotation.z = -0.4;
    const legs = [
      [0.72, 0.14],
      [0.72, -0.14],
      [1.2, 0.14],
      [1.2, -0.14],
    ].map(([x, z]) => {
      const leg = new T.Group();
      leg.position.set(x, 0.5, z);
      add(new T.CylinderGeometry(0.055, 0.045, 0.44, 8), hide, 0, -0.22, 0, leg);
      add(new T.CylinderGeometry(0.05, 0.055, 0.06, 8), dark, 0, -0.47, 0, leg);
      group.add(leg);
      return leg;
    });
    group.visible = false;
    this.scene.add(group);
    return { group, wheels, cover, legs, heap };
  }
  private makeSparks(own: Own) {
    const n = 140,
      pos = new Float32Array(n * 3).fill(-999),
      geometry = own(new T.BufferGeometry());
    geometry.setAttribute("position", new T.BufferAttribute(pos, 3));
    const points = new T.Points(geometry, own(new T.PointsMaterial({ color: "#ffd860", map: glow(own, 64, 0.3), size: 0.22, transparent: true, opacity: 1, depthWrite: false, blending: T.AdditiveBlending })));
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, pos, vel: new Float32Array(n * 3), life: new Float32Array(n), next: 0 };
  }
  private sparkle(x: number, y: number, count: number, force = 3) {
    const s = this.sparks;
    for (let k = 0; k < count; k++) {
      const i = s.next;
      s.next = (s.next + 1) % s.life.length;
      const a = Math.random() * Math.PI * 2,
        v = force * (0.4 + Math.random() * 0.6);
      s.pos.set([x, y, 0.8], i * 3);
      s.vel.set([Math.cos(a) * v, Math.abs(Math.sin(a)) * v + 1, (Math.random() - 0.5) * 1.5], i * 3);
      s.life[i] = 0.45 + Math.random() * 0.3;
    }
  }
  /** The shapes of a kind of loot, made once and shared by every piece of it. */
  private partsOf(kind: string) {
    if (this.lootParts[kind]) return this.lootParts[kind];
    const own: Own = (r) => this.own(r),
      m = (color: string, roughness = 0.5, extra: T.MeshStandardMaterialParameters = {}) => this.standard({ color, roughness, ...extra }),
      gold = m("#ffcc33", 0.25, { metalness: 0.6, emissive: "#8a6200", emissiveIntensity: 0.5 }),
      at = (geometry: T.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => {
        geometry.rotateX(rx);
        geometry.rotateZ(rz);
        geometry.translate(x, y, z);
        return own(geometry);
      },
      // A sphere pushed in and out a little: cloth that sags, a pot thrown by hand.
      lumpy = (r: number, seed: number, rough: number) => {
        const g = new T.SphereGeometry(r, 18, 14),
          pos = g.getAttribute("position") as T.BufferAttribute,
          p = new T.Vector3();
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i);
          const u = p.clone().normalize(),
            n = Math.sin(u.x * 4.1 + seed) * Math.sin(u.y * 3.3 + seed) * Math.sin(u.z * 4.7 + seed * 2) + 0.4 * Math.sin(u.x * 9 + u.z * 7);
          p.multiplyScalar(1 + rough * n);
          // Sagging: the bottom flattens on what it lies on.
          if (p.y < -r * 0.55) p.y = -r * 0.55 - (p.y + r * 0.55) * 0.3;
          pos.setXYZ(i, p.x, p.y, p.z);
        }
        g.computeVertexNormals();
        return g;
      };
    let parts: { geometry: T.BufferGeometry; material: T.Material }[];
    if (kind === "pouch") {
      const burlap = m("#ffffff", 0.95, {
          map: painted(own, 128, 128, (ctx) => {
            ctx.fillStyle = "#9c6b3c";
            ctx.fillRect(0, 0, 128, 128);
            for (let y = 0; y < 128; y += 4)
              for (let x = 0; x < 128; x += 4) {
                ctx.fillStyle = (x / 4 + y / 4) % 2 ? "rgba(60,36,16,0.28)" : "rgba(220,170,110,0.22)";
                ctx.fillRect(x, y, 3, 3);
              }
            const random = stream(5);
            for (let k = 0; k < 10; k++) {
              ctx.strokeStyle = "rgba(50,30,14,0.4)";
              ctx.lineWidth = 2;
              const x = random() * 128;
              ctx.beginPath();
              ctx.moveTo(x, 0);
              ctx.quadraticCurveTo(x + 10, 64, x - 6, 128);
              ctx.stroke();
            }
          }),
        }),
        rope = m("#d8b47a", 0.9),
        neck = new T.CylinderGeometry(0.06, 0.12, 0.13, 12, 1, true),
        pos = neck.getAttribute("position") as T.BufferAttribute;
      // Gathered folds at the neck.
      for (let i = 0; i < pos.count; i++) {
        const a = Math.atan2(pos.getZ(i), pos.getX(i)),
          f = 1 + 0.18 * Math.sin(a * 6);
        pos.setXYZ(i, pos.getX(i) * f, pos.getY(i), pos.getZ(i) * f);
      }
      neck.computeVertexNormals();
      parts = [
        { geometry: at(lumpy(0.2, 1.3, 0.08), 0, 0.1, 0), material: burlap },
        { geometry: at(neck, 0, 0.3, 0), material: burlap },
        { geometry: at(new T.TorusGeometry(0.075, 0.022, 6, 16), 0, 0.27, 0, Math.PI / 2), material: rope },
        { geometry: at(new T.CylinderGeometry(0.012, 0.012, 0.16, 5), 0.07, 0.22, 0.05, 0.3, 0.6), material: rope },
        { geometry: at(new T.CylinderGeometry(0.055, 0.055, 0.016, 16), -0.02, 0.38, 0.01, 0.5, 0.3), material: gold },
        { geometry: at(new T.CylinderGeometry(0.05, 0.05, 0.016, 16), 0.04, 0.37, -0.02, -0.3, -0.4), material: gold },
        { geometry: at(new T.CylinderGeometry(0.045, 0.045, 0.016, 16), 0.0, 0.4, -0.03, 1.2, 0.1), material: gold },
      ];
    } else if (kind === "coin")
      parts = [{ geometry: at(new T.CylinderGeometry(0.17, 0.17, 0.045, 20), 0, 0.06, 0, Math.PI / 2), material: gold }];
    else if (kind === "gem")
      parts = [{ geometry: at(new T.OctahedronGeometry(0.22), 0, 0.14, 0), material: m("#4ae0ff", 0.1, { emissive: "#0a8ab0", emissiveIntensity: 0.9, flatShading: true }) }];
    else if (kind === "chest")
      parts = [
        { geometry: at(new T.BoxGeometry(0.62, 0.32, 0.42), 0, 0.06, 0), material: m("#7a4a26", 0.8) },
        { geometry: at(new T.BoxGeometry(0.07, 0.56, 0.44), -0.2, 0.14, 0), material: gold },
        { geometry: at(new T.BoxGeometry(0.07, 0.56, 0.44), 0.2, 0.14, 0), material: gold },
      ];
    else if (kind === "pot")
      // A fire pot: a clay pot with a rope handle (its flame is the piece's own).
      parts = [
        { geometry: at(lumpy(0.2, 3.1, 0.05), 0, 0.12, 0), material: m("#b0562e", 0.85) },
        { geometry: at(new T.CylinderGeometry(0.09, 0.12, 0.1, 12, 1, true), 0, 0.3, 0), material: m("#9a4824", 0.85) },
        { geometry: at(new T.TorusGeometry(0.1, 0.018, 6, 14), 0, 0.33, 0, Math.PI / 2), material: m("#3a2a1e") },
      ];
    else {
      // A bomb: a black iron ball with a riveted band, a cap and a curled fuse (its spark is the piece's own).
      const fuse = new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.36, 0), new T.Vector3(0.03, 0.43, 0), new T.Vector3(0.09, 0.47, 0), new T.Vector3(0.13, 0.44, 0)]), 10, 0.014, 5),
        iron = m("#22232a", 0.35, { metalness: 0.65 });
      parts = [
        { geometry: at(new T.SphereGeometry(0.22, 20, 16), 0, 0.12, 0), material: iron },
        { geometry: at(new T.TorusGeometry(0.222, 0.018, 6, 28), 0, 0.12, 0, Math.PI / 2), material: m("#4a4a52", 0.4, { metalness: 0.7 }) },
        { geometry: at(new T.CylinderGeometry(0.06, 0.075, 0.08, 10), 0, 0.35, 0), material: m("#5a5a62", 0.45, { metalness: 0.6 }) },
        { geometry: own(fuse), material: m("#c8a46a", 0.9) },
      ];
    }
    return (this.lootParts[kind] = parts);
  }
  /** The shared sprites of the loot: the gold's glint, and a fuse's spark (or a fire pot's flame). */
  private lootSprites: { glint: T.SpriteMaterial; spark: T.SpriteMaterial } | null = null;
  private makeLoot(item: Loot) {
    const group = new T.Group(),
      kind = item.pot ? "pot" : item.kind;
    for (const p of this.partsOf(kind)) {
      const mesh = new T.Mesh(p.geometry, p.material);
      mesh.castShadow = true;
      group.add(mesh);
    }
    if (!this.lootSprites) {
      const own: Own = (r) => this.own(r);
      this.lootSprites = {
        glint: own(new T.SpriteMaterial({ map: glint(own, 64), color: "#fff2c0", transparent: true, depthWrite: false, blending: T.AdditiveBlending })),
        spark: own(new T.SpriteMaterial({ map: glow(own, 64, 0.25), color: "#ffb040", transparent: true, depthWrite: false, blending: T.AdditiveBlending })),
      };
    }
    let glints: T.Sprite | null = null,
      spark: T.Sprite | null = null;
    if (kind === "pouch" || kind === "coin" || kind === "gem" || kind === "chest") {
      glints = new T.Sprite(this.lootSprites.glint);
      glints.position.set(0.04, 0.4, 0.12);
      group.add(glints);
    } else {
      spark = new T.Sprite(this.lootSprites.spark);
      spark.position.set(kind === "pot" ? 0 : 0.13, kind === "pot" ? 0.42 : 0.45, 0.02);
      group.add(spark);
    }
    this.scene.add(group);
    return { group, glints, spark };
  }
  /** A number or a word that rises from a place in the valley and fades. */
  private pop(text: string, x: number, y: number, cls = "") {
    if (capturing()) return;
    // Split, it rises in the half whose eye is nearer.
    const right = this.eye.split && Math.abs(x - this.eye.halves[1]) < Math.abs(x - this.eye.halves[0]),
      at = new T.Vector3(x, y, 0.4).project(right ? this.second : this.camera),
      el = document.createElement("span");
    el.className = `gr-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${(this.eye.split ? (right ? 0.5 : 0) + (at.x + 1) / 4 : (at.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - at.y) / 2) * 100}%`;
    el.addEventListener("animationend", () => el.remove());
    this.pops.append(el);
    while (this.pops.childElementCount > 14) this.pops.firstElementChild!.remove();
  }
  /** A word called out over the valley for a moment. */
  private say(text: string, colour: string) {
    if (capturing()) return;
    this.word.textContent = text;
    this.word.style.color = colour;
    this.word.classList.remove("gr-show");
    void this.word.offsetWidth;
    this.word.classList.add("gr-show");
  }
  private names(): [string, string] {
    return this.two ? ["1P", "2P"] : ["나", "컴퓨터"];
  }
  /** What a slice did, told to the screen (moves), the ear and the eye. */
  private tell(events: Happening[]) {
    const knock = (kind: string, strength = 1) => this.onKnock?.(kind, strength),
      world = this.world!,
      c = this.counts;
    for (const e of events) {
      if (e.kind === "jump") {
        c.jumps[e.side]++;
        knock("jump");
        const j = world.bandits[e.side];
        this.fx.emit("dust", j.x, j.y + 0.04, 0.45, 3, { speed: 0.9, up: 0.15, size: 0.28, life: 0.45 });
      } else if (e.kind === "swing") {
        c.swings[e.side]++;
        knock("swing");
      } else if (e.kind === "pickup") {
        c.pickups[e.side]++;
        knock(e.what === "chest" ? "chest" : e.what === "gem" ? "gem" : "coin", Math.min(1, 0.4 + e.value / 8));
        this.sparkle(e.x, e.y + 0.2, 4 + Math.min(10, e.value * 2), 2.4);
        this.fx.emit("glint", e.x, e.y + 0.5, 0.7, 3, { speed: 1.6, up: 1.5, size: 0.45, life: 0.5 });
        this.pop(`+${e.value}`, e.x, e.y + 0.7, `gr-s${e.side}`);
      } else if (e.kind === "deposit") {
        c.deposits[e.side]++;
        knock("deposit", Math.min(1, 0.5 + e.amount / 20));
        this.flashed[e.side] = performance.now();
        this.sparkle(gateOf(e.side), 1, 10 + e.amount, 4);
        this.fx.emit("glint", gateOf(e.side), 1.4, 0.7, 4 + Math.min(8, e.amount / 2), { speed: 2.4, up: 2.2, size: 0.55, life: 0.7 });
        this.pop(`금화 +${e.amount}`, gateOf(e.side), 2.6, `gr-big gr-s${e.side}`);
        this.onMove(depositMove(e.side, e.amount));
      } else if (e.kind === "hit") {
        c.hits++;
        knock("hit");
        const o = world.bandits[e.on];
        this.sparkle(o.x, o.y + 0.9, 8, 3);
        this.fx.emit("star", o.x, o.y + 1.2, 0.8, 4, { speed: 2.2, up: 1.2, size: 0.5, life: 0.5 });
        this.fx.emit("dust", o.x, o.y + 0.1, 0.5, 4, { speed: 1.2, up: 0.4, size: 0.35, life: 0.6 });
        if (e.dropped > 0) this.say("강탈!", SIDE_COLORS[e.by]);
      } else if (e.kind === "boom") {
        c.booms++;
        knock("boom");
        this.shook = performance.now();
        const blast = this.blasts.reduce((a, b) => (b.age > a.age ? b : a));
        blast.age = 0;
        blast.mesh.position.set(e.x, e.y + 0.2, 0.5);
        blast.mesh.visible = true;
        // Fire, smoke rolling up, and bits thrown about; on a graphics card the flash lights the valley round it.
        this.fx.emit("fire", e.x, e.y + 0.35, 0.6, 9, { speed: 2.4, up: 1.2, size: 0.7, grow: 1.8, life: 0.4 });
        this.fx.emit("smoke", e.x, e.y + 0.5, 0.4, 9, { speed: 1.4, up: 1.2, size: 0.6, grow: 2.6, life: 1.4 });
        this.fx.emit("chip", e.x, e.y + 0.3, 0.6, 8, { speed: 4, up: 3, size: 0.09, life: 0.9 });
        if (this.flash) {
          this.flash.position.set(e.x, e.y + 0.8, 1.2);
          this.flashed_at = performance.now();
        }
      } else if (e.kind === "drop") {
        if (e.what === "chest") {
          knock("fall");
          this.say("보물 상자!", "#ffe14a");
        }
      } else if (e.kind === "cart") {
        c.carts++;
        knock("bells");
        this.say("대상 행렬!", "#ffffff");
      } else if (e.kind === "shed") {
        knock("shed");
        this.sparkle(e.x, 1, 8, 3);
        this.fx.emit("chip", e.x, 0.9, 0.2, 3, { speed: 2.5, up: 2, size: 0.07, life: 0.7 });
      } else if (e.kind === "broken") {
        knock("broken");
        this.sparkle(e.x, 1, 26, 5);
        this.fx.emit("dust", e.x, 0.4, 0.2, 10, { speed: 2, up: 0.8, size: 0.6, life: 1 });
        this.fx.emit("chip", e.x, 0.9, 0.2, 10, { speed: 4, up: 3, size: 0.1, life: 1 });
        this.fx.emit("glint", e.x, 1, 0.5, 6, { speed: 3, up: 2.5, size: 0.5, life: 0.7 });
        this.say("수레가 부서졌다!", "#ffe14a");
      } else if (e.kind === "raid") {
        c.raids++;
        knock("raid");
        this.say("성문 습격!", SIDE_COLORS[e.by]);
        this.onMove(raidedMove(1 - e.by, e.amount));
      } else if (e.kind === "time") this.onMove({ from: -1, to: TIME, extra: -1 });
      if (this.state?.winner !== null) break;
    }
  }
  private advance(now: number) {
    const real = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const world = this.world;
    if (world && this.running()) {
      this.left += real;
      while (this.left >= DT && this.running()) {
        this.left -= DT;
        const second: Input = this.two ? this.hands[1].input() : think(world, 1, this.level);
        this.tell(step(world, [this.hands[0].input(), second]));
      }
    } else this.left = 0;
    if (world) this.pose(now, this.running() ? real : 0);
    this.redraw();
  }
  /** A bandit's figure where the valley has it: its run, its jump, its swing, its sack, its daze. */
  private poseBandit(f: Figure, b: Bandit, t: number, moving: boolean, depth: number) {
    const stunned = b.stun > 0,
      running = b.ground && Math.abs(b.vx) > 0.4,
      phase = b.stride * 5.2;
    // Coming down it squashes a moment and kicks up dust; going up it stretches a little.
    if (!b.ground) f.air = true;
    else if (f.air) {
      f.air = false;
      f.landed = t;
      if (moving) this.fx.emit("dust", b.x, b.y + 0.05, depth, 5, { speed: 1.4, up: 0.3, size: 0.32, life: 0.55 });
    }
    const since = t - f.landed,
      squash = since < 0.2 ? Math.sin((since / 0.2) * Math.PI) * 0.14 : 0,
      stretch = !b.ground && b.vy > 1 ? Math.min(0.07, b.vy * 0.012) : 0;
    f.group.position.set(b.x, b.y, depth);
    f.group.scale.set(b.face * DRAWN * (1 + squash * 0.6 - stretch * 0.5), DRAWN * (1 - squash + stretch), DRAWN * (1 + squash * 0.6));
    // Running feet throw a little dust behind.
    if (moving && running && t - f.puffed > 0.24) {
      f.puffed = t;
      this.fx.emit("dust", b.x - b.face * 0.15, 0.06 + b.y, depth - 0.05, 1, { speed: 0.5, up: 0.25, size: 0.2, life: 0.45, way: -b.face * 0.4 });
    }
    f.legs[0].rotation.z = !b.ground ? 0.55 : running ? Math.sin(phase) * 0.8 : 0;
    f.legs[1].rotation.z = !b.ground ? -0.45 : running ? -Math.sin(phase) * 0.8 : 0;
    f.lean.position.y = running ? Math.abs(Math.sin(phase)) * 0.05 : 0;
    // A heavy sack bows it forward (and slows it: `runOf`).
    f.lean.rotation.z = stunned ? 0.55 + Math.sin(t * 20) * 0.08 : (running ? -0.12 : 0) - 0.16 * (b.carry / CAP);
    // The sword: at rest held forward and down; a swing raises it over the head and brings it down.
    const p = b.swing < 0 ? -1 : b.swing / SWING;
    f.arm.rotation.z = p < 0 ? 0.85 + (running ? Math.sin(phase) * 0.25 : 0) : p < 0.3 ? lerp(0.85, 3.2, p / 0.3) : lerp(3.2, 1.0, (p - 0.3) / 0.7);
    // The other arm swings against the legs; in the air both are thrown up a little; dazed it hangs.
    f.back.rotation.z = stunned ? -0.2 : !b.ground ? -1.1 : running ? -Math.sin(phase) * 0.9 : Math.sin(t * 1.7) * 0.05;
    // The cape streams back with speed and in the air, and flutters.
    const speed = Math.min(1, Math.abs(b.vx) / 2.8);
    f.cape.rotation.z = -(0.08 + speed * 0.5 + (b.ground ? 0 : 0.35) + Math.sin(t * (6 + speed * 8)) * (0.03 + speed * 0.06));
    const full = b.carry / CAP,
      size = 0.14 + 0.2 * Math.sqrt(full);
    f.sack.scale.set(size, size * 1.12, size);
    f.sack.position.set(-0.2 - size * 0.55, 0.62 + size, 0);
    f.loot.visible = b.carry > 0;
    f.loot.position.set(f.sack.position.x, f.sack.position.y + size * 1.0, 0);
    f.loot.scale.set(size * 0.6, size * 0.3, size * 0.6);
    f.stars.visible = stunned;
    f.stars.rotation.y = t * 7;
    if (f.tag) f.tag.position.set(b.x, b.y + BODY.tall * DRAWN + 0.8, 0.8);
  }
  /** Everything where the valley has it, the board over the canvas, and what browser tests read. */
  private pose(now: number, dt: number) {
    const world = this.world!,
      state = this.state!,
      t = now / 1000;
    this.aim(dt);
    // Side by side they do not stand in each other: the first a little nearer the eye.
    world.bandits.forEach((b, side) => this.poseBandit(this.figures[side], b, t, dt > 0, side === 0 ? 0.52 : 0.38));
    // Loot: a mesh for each piece, gone with it.
    const alive = new Set<number>();
    for (const item of world.loot) {
      alive.add(item.id);
      let held = this.lootMeshes.get(item.id);
      if (!held) {
        const made = this.makeLoot(item);
        this.lootMeshes.set(item.id, (held = { item, mesh: made.group, kind: item.kind, glints: made.glints, spark: made.spark }));
      }
      const g = held.mesh,
        lit = item.kind === "bomb";
      g.position.set(item.x, item.y - 0.12, 0.34 + (item.id % 5) * 0.03);
      if (item.kind === "coin" || item.kind === "gem") g.rotation.y = t * 4 + item.id;
      else if (!item.rest) g.rotation.z = Math.sin(t * 5 + item.id) * 0.25;
      else g.rotation.z = 0;
      // About to be gone: it blinks; a lit bomb swells and blinks faster as its fuse burns.
      const fading = !lit && item.rest && item.age > LOOT_LIFE - 3;
      g.visible = !fading || Math.floor(t * 8) % 2 === 0;
      const swell = lit && item.rest ? 1 + 0.25 * (item.age / FUSE) * (0.5 + 0.5 * Math.sin(t * (18 + 30 * (item.age / FUSE)))) : 1;
      // A pouch spilled with less than a full three in it is smaller.
      g.scale.setScalar(swell * (item.kind === "chest" ? 1.15 : item.kind === "pouch" ? 0.7 + 0.3 * Math.min(1, item.value / 3) : 1));
      // Gold catches the sun now and then; a fuse sparks (hotter once it burns), a fire pot flames.
      if (held.glints) {
        const w = Math.max(0, Math.sin(t * 2.3 + item.id * 1.7));
        held.glints.scale.setScalar(0.05 + 0.5 * Math.pow(w, 6));
        held.glints.material.rotation = t * 0.8;
      }
      if (held.spark) {
        const burning = item.pot || item.rest,
          f = 0.75 + 0.25 * Math.sin(t * 40 + item.id) * Math.sin(t * 23);
        held.spark.scale.setScalar((burning ? (item.pot ? 0.55 : 0.34) : 0.16) * f);
        if (burning && dt > 0 && Math.random() < dt * (item.pot ? 10 : 6)) {
          const tip = held.spark.getWorldPosition(this.tip);
          this.fx.emit(item.pot ? "fire" : "glint", tip.x, tip.y, tip.z, 1, { speed: 0.6, up: 0.6, size: item.pot ? 0.22 : 0.12, life: 0.35 });
        }
      }
    }
    for (const [id, held] of this.lootMeshes)
      if (!alive.has(id)) {
        held.mesh.removeFromParent();
        this.lootMeshes.delete(id);
      }
    // The cart.
    const cart = world.cart,
      model = this.cart;
    model.group.visible = !!cart;
    if (cart) {
      const broken = cart.broken >= 0,
        shake = cart.shaken < 0.3 ? Math.sin(cart.shaken * 60) * 0.06 * (1 - cart.shaken / 0.3) : 0;
      model.group.position.set(cart.x, broken ? -Math.min(0.2, cart.broken * 0.4) : 0, -0.35);
      model.group.scale.set(cart.dir * (broken ? Math.max(0.01, 1 - Math.max(0, cart.broken - 1.9) / 0.6) : 1), broken ? Math.max(0.01, 1 - Math.max(0, cart.broken - 1.9) / 0.6) : 1, 1);
      model.group.rotation.z = shake + (broken ? -cart.dir * Math.min(0.28, cart.broken * 0.9) : 0);
      model.cover.visible = !broken;
      model.heap.visible = cart.gold > 0;
      const turn = (-cart.x / 0.34) * cart.dir;
      model.wheels.forEach((w) => (w.rotation.z = turn));
      model.legs.forEach((leg, k) => (leg.rotation.z = broken ? 0 : Math.sin(cart.x * 5 + (k % 2 ? Math.PI : 0)) * 0.35));
    }
    // The castles: gold in the towers' slits, windows lit, flags, the gates' rings.
    const most = state.seconds ? Math.max(60, world.treasury[0], world.treasury[1]) : world.target;
    this.valley.castles.forEach((castle, side) => {
      const share = Math.min(1, world.treasury[side] / most),
        tall = Math.max(0.001, share * GAUGE_TALL);
      castle.gauge.scale.y = tall;
      castle.gauge.position.y = 1.2 + tall / 2;
      castle.windows.forEach((w, k) => w.color.set(share >= (k + 1) / 4 ? "#ffd86a" : "#3a3028"));
      const since = (now - this.flashed[side]) / 1000;
      (castle.ring.material as T.MeshBasicMaterial).opacity = since < 0.6 ? 1 : world.bandits[side].carry > 0 ? 0.55 + 0.3 * Math.sin(t * 6) : 0.4;
      castle.ring.scale.setScalar(since < 0.6 ? 1 + 0.5 * (since / 0.6) : 1);
      const arrow = this.arrows[side];
      arrow.visible = (side === 0 || this.two) && world.bandits[side].carry > 0 && !world.over;
      arrow.position.y = 2.75 + Math.sin(t * 5) * 0.14;
      arrow.rotation.y = t * 2;
    });
    this.valley.tick(t, dt);
    this.fx.update(dt);
    if (this.flash) {
      const since = (now - this.flashed_at) / 1000;
      this.flash.intensity = since < 0.35 ? 40 * (1 - since / 0.35) : 0;
    }
    // The cart's wheels throw a little dust as it rolls.
    if (cart && cart.broken < 0 && dt > 0 && t - this.cartDust > 0.3) {
      this.cartDust = t;
      this.fx.emit("dust", cart.x - cart.dir * 0.5, 0.06, -0.0, 1, { speed: 0.4, up: 0.2, size: 0.3, life: 0.6, way: -cart.dir * 0.3 });
    }
    this.valley.clouds.forEach((cloud, k) => {
      cloud.position.x += dt * (0.12 + k * 0.03);
      if (cloud.position.x > CLOUDS) cloud.position.x = -CLOUDS;
    });
    // Blasts and sparks.
    for (const b of this.blasts) {
      if (b.age > 0.4) {
        b.mesh.visible = false;
        continue;
      }
      b.age += dt || 0.016;
      const p = Math.min(1, b.age / 0.4);
      b.mesh.scale.setScalar(0.3 + BLAST * p);
      b.material.opacity = 0.75 * (1 - p);
    }
    const s = this.sparks;
    for (let k = 0; k < s.life.length; k++) {
      if (s.life[k] <= 0) continue;
      s.life[k] -= dt;
      s.vel[k * 3 + 1] -= 12 * dt;
      for (let a = 0; a < 3; a++) s.pos[k * 3 + a] += s.vel[k * 3 + a] * dt;
      if (s.life[k] <= 0) s.pos[k * 3 + 1] = -999;
    }
    (s.points.geometry.getAttribute("position") as T.BufferAttribute).needsUpdate = true;
    // A blast shakes the eye a little.
    const shake = (now - this.shook) / 1000;
    this.scene.position.set(0, shake < 0.3 && !this.reducedMotion ? Math.sin(shake * 70) * 0.06 * (1 - shake / 0.3) : 0, 0);
    // The cart's bells while it rolls.
    if (cart && cart.broken < 0 && dt > 0 && now - this.rang > 620) {
      this.rang = now;
      this.onKnock?.("bell", 0.35);
    }
    this.describe();
  }
  private describe() {
    const world = this.world!,
      state = this.state!,
      names = this.names(),
      left = timeLeft(world),
      most = state.seconds ? Math.max(60, world.treasury[0], world.treasury[1]) : world.target,
      clock = left === null ? "" : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`,
      side = (p: number) =>
        `<div class="gr-side gr-s${p}"><b>${names[p]}</b><span class="gr-bar"><i style="width:${Math.min(100, (world.treasury[p] / most) * 100).toFixed(1)}%"></i></span><em class="gr-gold gr-gold-${p}">${world.treasury[p]}${state.seconds ? "" : `<small>/${world.target}</small>`}</em><span class="gr-sack${world.bandits[p].carry >= CAP ? " full" : ""}">자루 ${world.bandits[p].carry}</span></div>`,
      text = `<div class="gr-board">${side(0)}<div class="gr-mid${left !== null && left < 20 ? " late" : ""}">${clock || "VS"}</div>${side(1)}</div>`;
    if (text !== this.hudText) {
      this.hudText = text;
      this.board.innerHTML = text;
    }
    this.chart();
    const d = this.renderer.domElement.dataset,
      b = world.bandits,
      c = this.counts;
    d.phase = state.winner !== null || world.over ? "over" : this.paused ? "paused" : "play";
    d.two = String(this.two);
    d.men = b.map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)}`).join(";");
    d.face = b.map((m) => m.face).join(",");
    d.carry = b.map((m) => m.carry).join(",");
    d.stun = b.map((m) => (m.stun > 0 ? 1 : 0)).join(",");
    d.gold = world.treasury.join(",");
    d.jumps = c.jumps.join(",");
    d.swings = c.swings.join(",");
    d.pickups = c.pickups.join(",");
    d.deposits = c.deposits.join(",");
    d.loot = world.loot.map((i) => `${i.kind}:${i.x.toFixed(2)}:${i.y.toFixed(2)}:${i.rest ? 1 : 0}`).join(";");
    d.cart = world.cart ? `${world.cart.x.toFixed(2)},${world.cart.gold}` : "";
    d.time = (world.tick * DT).toFixed(2);
    d.split = String(this.eye.split);
    d.eye = (this.eye.split ? this.eye.halves : [this.eye.x]).map((x) => x.toFixed(2)).join(",");
    d.zoom = this.eye.zoom.toFixed(2);
    d.target = String(world.target);
  }
  protected subject(aspect: number): TableSubject {
    return goldRaidSubject(aspect);
  }
  /** The cameras are set by the valley's own framing (`layout.ts`): the road lifted clear of a phone's buttons. */
  protected resize() {
    super.resize();
    if (this.disposed || !this.host.clientWidth || !this.host.clientHeight) return;
    this.shape = this.host.clientWidth / this.host.clientHeight;
    this.aim(0);
    this.redraw();
  }
  /** A camera looking at `x` across with `frame`, drawn back `zoom` times. */
  private look(camera: T.PerspectiveCamera, frame: Frame, aspect: number, x: number, zoom = 1) {
    const distance = (frame.span * zoom) / (2 * Math.tan((FOV * Math.PI) / 360)),
      y = frame.lookY * zoom;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    camera.position.set(x, y + Math.sin(TILT) * distance, Math.cos(TILT) * distance);
    camera.lookAt(x, y, 0);
  }
  /**
   * The eye `dt` seconds on: against the computer it follows my bandit, looking a little ahead of it; two at one
   * screen, one view holds both (drawing back as they part) until they are too far apart, and then each half of the
   * screen follows one (`pairView`).
   */
  private aim(dt: number) {
    const eye = this.eye,
      world = this.world,
      full = goldRaidFrame(this.shape, this.coarse),
      [a, b] = world ? world.bandits : [null, null];
    if (!a || !b) {
      this.look(this.camera, full, this.shape, eye.x);
      return;
    }
    // A new match starts with the eye where it belongs; after that it follows (and stands while the valley is still).
    const to = (from: number, at: number) => (eye.set ? follow(from, at, Math.max(0, dt)) : at);
    if (!this.two) {
      eye.x = to(eye.x, aimX(a.x, a.vx, a.face, full.wide));
      eye.zoom = 1;
      this.look(this.camera, full, this.shape, eye.x);
    } else {
      const pair = pairView(a.x, b.x, full.wide, eye.split);
      if (pair.split) {
        const half = goldRaidFrame(this.shape / 2, this.coarse),
          [l, r] = a.x <= b.x ? [a, b] : [b, a],
          aims = [aimX(l.x, l.vx, l.face, half.wide), aimX(r.x, r.vx, r.face, half.wide)];
        eye.halves = eye.split && eye.set ? [to(eye.halves[0], aims[0]), to(eye.halves[1], aims[1])] : [aims[0], aims[1]];
        this.look(this.camera, half, this.shape / 2, eye.halves[0]);
        this.look(this.second, half, this.shape / 2, eye.halves[1]);
      } else {
        const fresh = eye.split || !eye.set;
        eye.x = fresh ? pair.x : to(eye.x, pair.x);
        eye.zoom = fresh ? pair.zoom : to(eye.zoom, pair.zoom);
        this.look(this.camera, full, this.shape, eye.x, eye.zoom);
      }
      eye.split = pair.split;
      this.seam.classList.toggle("on", pair.split);
    }
    eye.set = true;
  }
  /** The sun and the sky's sun go along with an eye looking at `x`. */
  private light(x: number) {
    this.sun.position.set(x + 5, 11, 9);
    this.sun.target.position.set(x, 0, 0);
    this.sun.target.updateMatrixWorld();
    this.valley.sun.position.x = x * 0.92;
  }
  /** The picture: one view, or the two halves of a split screen side by side. */
  protected drawPicture() {
    const r = this.renderer;
    if (!this.eye.split) {
      this.light(this.eye.x);
      r.render(this.scene, this.camera);
      return;
    }
    const size = r.getSize(new T.Vector2()),
      half = Math.floor(size.x / 2);
    r.setScissorTest(true);
    for (const k of [0, 1]) {
      const x = k ? half : 0,
        w = k ? size.x - half : half;
      r.setViewport(x, 0, w, size.y);
      r.setScissor(x, 0, w, size.y);
      this.light(this.eye.halves[k]);
      r.render(this.scene, k ? this.second : this.camera);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    r.setScissor(0, 0, size.x, size.y);
  }
  /** The strip under the board: everything at its place along the whole valley. */
  private chart() {
    const world = this.world!,
      at = (x: number) => ((x + END) / (2 * END)) * 100,
      put = (el: Element | undefined, left: number | null, width?: number) => {
        if (!(el instanceof HTMLElement)) return;
        const key = left === null ? "" : `${left.toFixed(1)}|${width?.toFixed(1) ?? ""}`;
        if (this.charted.get(el) === key) return;
        this.charted.set(el, key);
        el.hidden = left === null;
        if (left !== null) el.style.left = `${left}%`;
        if (width !== undefined) el.style.width = `${width}%`;
      },
      eyes = this.map.querySelectorAll(".gr-map-eye"),
      chests = this.map.querySelectorAll(".gr-map-chest"),
      eye = this.eye;
    // What is in view: one window, or one for each half.
    const windows = eye.split ? eye.halves.map((x) => ({ x, wide: goldRaidFrame(this.shape / 2, this.coarse).wide })) : [{ x: eye.x, wide: goldRaidFrame(this.shape, this.coarse).wide * eye.zoom }];
    eyes.forEach((el, k) => {
      const w = windows[k];
      put(el, w ? at(w.x - w.wide / 2) : null, w ? (w.wide / (2 * END)) * 100 : undefined);
    });
    this.map.querySelectorAll(".gr-map-castle").forEach((el, side) => put(el, at(gateOf(side))));
    put(this.map.querySelector(".gr-map-cart") ?? undefined, world.cart && world.cart.broken < 0 ? at(world.cart.x) : null);
    const lying = world.loot.filter((i) => i.kind === "chest");
    chests.forEach((el, k) => put(el, lying[k] ? at(lying[k].x) : null));
    this.map.querySelectorAll(".gr-map-man").forEach((el) => put(el, at(world.bandits[el.classList.contains("gr-s0") ? 0 : 1].x)));
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Nothing in the valley is chosen by a tap. */
  protected dragStart() {
    return true;
  }
  protected place(state: State) {
    // A new match (the count of moves back at nothing), or the first: a fresh valley, the treasuries as the state has them.
    const anew = !this.world || (state.ply === 0 && this.shown > 0);
    this.shown = state.ply;
    if (anew) {
      for (const held of this.lootMeshes.values()) held.mesh.removeFromParent();
      this.lootMeshes.clear();
      this.world = createWorld(Math.floor(Math.random() * 2e9) + 1, state.target, state.seconds);
      this.world.treasury = [state.gold[0], state.gold[1]];
      this.eye.set = false;
      this.eye.split = false;
      this.counts = { jumps: [0, 0], swings: [0, 0], pickups: [0, 0], deposits: [0, 0], hits: 0, booms: 0, carts: 0, raids: 0 };
      this.letGo();
      if (!this.figures[0].tag) {
        const own: Own = (r) => this.own(r),
          names = this.names();
        this.figures[0].tag = this.makeTag(own, names[0], SIDE_COLORS[0]);
        if (this.two) this.figures[1].tag = this.makeTag(own, names[1], SIDE_COLORS[1]);
      }
    }
    if (state.winner !== null) {
      this.world!.over = true;
    }
    this.pose(performance.now(), 0);
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
    for (const el of [this.hud, this.seam, this.word, this.pops, this.pad]) el.remove();
    super.dispose();
  }
}
