import * as T from "three";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { FOV } from "../../engine/camera";
import { TILT, goldRaidFrame, goldRaidSubject } from "./layout";
import { TIME, depositMove, raidedMove, type State } from "./rules";
import { BLAST, BODY, CAP, CART, DT, FUSE, LOOT_LIFE, SWING, createWorld, gateOf, step, think, timeLeft, type Bandit, type Happening, type Input, type Loot, type LootKind, type World } from "./sim";
import { GAUGE_TALL, SIDE_COLORS, buildValley, type Valley } from "./valley";

export const GOLD_RAID_COLORS: [string, string] = SIDE_COLORS;
type Own = <R extends { dispose(): void }>(resource: R) => R;
type Act = "left" | "right" | "jump" | "strike";
/** The keys of the first person at the screen and of the second (against the computer both sets are mine). */
const FIRST: Record<string, Act> = { KeyA: "left", KeyD: "right", KeyW: "jump", KeyS: "strike", KeyF: "strike", Space: "jump" };
const SECOND: Record<string, Act> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "jump", ArrowDown: "strike", Slash: "strike", Numpad0: "strike" };
/** A person's hands at this screen: keys and buttons held, and the presses of jump and strike counted. */
class Hand {
  keys = new Set<Act>();
  touch = new Set<Act>();
  jumps = 0;
  strikes = 0;
  private usedJumps = 0;
  private usedStrikes = 0;
  private holds(act: Act) {
    return this.keys.has(act) || this.touch.has(act);
  }
  press(act: Act) {
    if (act === "jump") this.jumps++;
    else if (act === "strike") this.strikes++;
  }
  /** One slice's controls: a press counted since the last slice is a press now. */
  input(): Input {
    const input = { x: (this.holds("right") ? 1 : 0) - (this.holds("left") ? 1 : 0), jump: this.jumps > this.usedJumps, strike: this.strikes > this.usedStrikes };
    this.usedJumps = this.jumps;
    this.usedStrikes = this.strikes;
    return input;
  }
  clear() {
    this.keys.clear();
    this.touch.clear();
  }
}
/** A bandit king's figure: what of it moves. */
interface Figure {
  group: T.Group;
  lean: T.Group;
  legs: [T.Group, T.Group];
  arm: T.Group;
  sack: T.Mesh;
  loot: T.Mesh;
  stars: T.Group;
  tag: T.Sprite | null;
}
interface CartModel {
  group: T.Group;
  wheels: T.Group[];
  cover: T.Object3D;
  legs: T.Mesh[];
  heap: T.Object3D;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** The figures are drawn a little larger than the bodies the valley reckons with, to be read on a phone. */
const DRAWN = 1.22;

/**
 * 금화 쟁탈전: the valley of `valley.ts` seen from the side, two bandit kings (jointed figures with a crown, a club and
 * a sack that swells as it fills), the loot that falls (coins, pouches, gems, chests, bombs), the merchant's ox cart,
 * and the two castles whose towers fill with gold. The view steps the valley in real time (`sim.ts`) and reports
 * deposits, robberies and the clock's end as moves; a board over the canvas shows both treasuries and sacks.
 *
 * Keys: the first person A D to run, W (or Space) to jump, S or F to strike; the second ← →, ↑, and ↓ or /; against
 * the computer both sets are mine. A touch screen gets ◀ ▶ and 점프, 치기 (for two at one screen a set at each side).
 */
export class GoldRaidView extends TableView<State> {
  private world: World | null = null;
  private valley: Valley;
  private figures: Figure[] = [];
  private lootMeshes = new Map<number, { item: Loot; mesh: T.Group; kind: LootKind }>();
  private lootParts: Record<string, { geometry: T.BufferGeometry; material: T.Material }[]> = {};
  private cart: CartModel;
  private arrows: T.Mesh[] = [];
  private coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private blasts: { mesh: T.Mesh; material: T.MeshBasicMaterial; age: number }[] = [];
  private sparks: { points: T.Points; pos: Float32Array; vel: Float32Array; life: Float32Array; next: number };
  private hands = [new Hand(), new Hand()];
  private hud: HTMLElement;
  private pad: HTMLElement;
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
  private readonly letGo = () => this.hands.forEach((h) => h.clear());
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
    this.scene.add(new T.HemisphereLight("#eaf4ff", "#6a7a4a", 1.9));
    const sun = new T.DirectionalLight("#fff1d6", 2.3);
    sun.position.set(5, 11, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 11, bottom: -3, near: 1, far: 40 });
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.valley = buildValley(this.scene, own);
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
   * The touch buttons: ◀ ▶ at the lower left and 치기, 점프 at the lower right for one person; for two at one screen
   * each has all four at its own side. Held with several fingers at once.
   */
  private makePad() {
    if (!this.coarse) return;
    const button = (side: number, act: Act, text: string, label: string) =>
      `<button type="button" class="gr-btn gr-${act}" tabindex="-1" data-side="${side}" data-act="${act}" aria-label="${label}" style="--side:${SIDE_COLORS[side]}"><span aria-hidden="true">${text}</span></button>`;
    const run = (side: number) => button(side, "left", "◀", "왼쪽") + button(side, "right", "▶", "오른쪽"),
      acts = (side: number) => button(side, "strike", "치기", "치기") + button(side, "jump", "점프", "점프");
    this.pad.classList.toggle("gr-two", this.two);
    this.pad.innerHTML = this.two
      ? `<div class="gr-cluster gr-at-left">${run(0)}${acts(0)}</div><div class="gr-cluster gr-at-right">${run(1)}${acts(1)}</div>`
      : `<div class="gr-cluster gr-at-left">${run(0)}</div><div class="gr-cluster gr-at-right">${acts(0)}</div>`;
    const fingers = new Map<number, { side: number; act: Act; button: HTMLElement }>();
    const lift = (e: PointerEvent) => {
      const f = fingers.get(e.pointerId);
      if (!f) return;
      fingers.delete(e.pointerId);
      // Another finger may still hold the same button.
      if (![...fingers.values()].some((o) => o.side === f.side && o.act === f.act)) {
        this.hands[f.side].touch.delete(f.act);
        f.button.classList.remove("on");
      }
    };
    this.pad.addEventListener("pointerdown", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".gr-btn");
      if (!b || this.disposed) return;
      e.preventDefault();
      const side = Number(b.dataset.side),
        act = b.dataset.act as Act,
        hand = this.hands[side];
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // A pointer the page cannot capture: it is held without.
      }
      fingers.set(e.pointerId, { side, act, button: b });
      if (!hand.touch.has(act)) hand.press(act);
      hand.touch.add(act);
      b.classList.add("on");
    });
    this.pad.addEventListener("pointerup", lift);
    this.pad.addEventListener("pointercancel", lift);
    this.pad.addEventListener("lostpointercapture", lift);
    this.pad.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  /** A bandit king: boots and legs, a tunic in its side's colour, a bearded head under a gold crown, a club and a sack. */
  private makeFigure(own: Own, side: 0 | 1): Figure {
    const m = (color: string, roughness = 0.7, extra: T.MeshStandardMaterialParameters = {}) => this.standard({ color, roughness, ...extra }),
      tunic = m(SIDE_COLORS[side], 0.6),
      dark = m("#2a2420"),
      skin = m("#f0c39a"),
      beard = m(side === 0 ? "#5a3a22" : "#d8d2c4"),
      gold = m("#ffcc33", 0.3, { emissive: "#7a5a00", emissiveIntensity: 0.4 }),
      wood = m("#8a5a34"),
      cloth = m("#a8824e", 0.9),
      group = new T.Group(),
      lean = new T.Group(),
      cyl = own(new T.CylinderGeometry(1, 1, 1, 10)),
      ball = own(new T.SphereGeometry(1, 16, 12));
    group.add(lean);
    const part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: T.Object3D = lean) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const legs = [0.1, -0.1].map((z) => {
      const leg = new T.Group();
      leg.position.set(0, 0.48, z);
      part(cyl, dark, 0, -0.2, 0, 0.075, 0.4, 0.075, leg);
      part(own(new T.BoxGeometry(0.24, 0.1, 0.15)), m("#3a2a1e"), 0.05, -0.43, 0, 1, 1, 1, leg);
      lean.add(leg);
      return leg;
    }) as [T.Group, T.Group];
    part(own(new T.CapsuleGeometry(0.2, 0.26, 6, 12)), tunic, 0, 0.74, 0, 1, 1, 1);
    part(cyl, dark, 0, 0.58, 0, 0.215, 0.06, 0.215);
    part(ball, gold, 0.2, 0.58, 0, 0.04, 0.04, 0.04);
    // The head: a face turned the way it runs, a beard, and the crown.
    part(ball, skin, 0.02, 1.07, 0, 0.18, 0.18, 0.18);
    part(ball, beard, 0.07, 0.99, 0, 0.15, 0.13, 0.16);
    part(ball, skin, 0.2, 1.07, 0, 0.04, 0.04, 0.04);
    for (const z of [0.07, -0.07]) part(ball, dark, 0.17, 1.12, z, 0.025, 0.03, 0.025);
    part(own(new T.CylinderGeometry(0.16, 0.14, 0.1, 12, 1, true)), own(new T.MeshStandardMaterial({ color: "#ffcc33", roughness: 0.3, emissive: "#7a5a00", emissiveIntensity: 0.4, side: T.DoubleSide })), 0.02, 1.25, 0, 1, 1, 1);
    const spike = own(new T.ConeGeometry(0.035, 0.09, 5));
    for (let k = 0; k < 6; k++) part(spike, gold, 0.02 + Math.cos((k * Math.PI) / 3) * 0.15, 1.34, Math.sin((k * Math.PI) / 3) * 0.15, 1, 1, 1);
    part(ball, m(side === 0 ? "#3aa0ff" : "#ff5a5a", 0.3, { emissive: side === 0 ? "#104a80" : "#801010", emissiveIntensity: 0.5 }), 0.17, 1.26, 0, 0.028, 0.028, 0.028);
    // The sack on its back: it swells as it fills, gold showing at its mouth.
    const sack = part(ball, cloth, -0.27, 0.78, 0, 0.16, 0.18, 0.16),
      loot = part(ball, gold, -0.27, 0.95, 0, 0.09, 0.05, 0.09);
    part(cyl, cloth, -0.1, 0.9, -0.18, 0.045, 0.3, 0.045).rotation.z = 0.9;
    // The club arm, toward the eye.
    const arm = new T.Group();
    arm.position.set(0.02, 0.92, 0.22);
    part(cyl, tunic, 0, -0.14, 0, 0.065, 0.28, 0.065, arm);
    part(ball, skin, 0, -0.3, 0, 0.065, 0.065, 0.065, arm);
    part(own(new T.CylinderGeometry(0.075, 0.04, 0.56, 9)), wood, 0, -0.56, 0, 1, 1, 1, arm);
    for (const y of [-0.66, -0.76]) part(cyl, dark, 0, y, 0, 0.078, 0.02, 0.078, arm);
    lean.add(arm);
    // Stars round its head while it is stunned.
    const stars = new T.Group(),
      star = own(new T.OctahedronGeometry(0.07)),
      yellow = own(new T.MeshBasicMaterial({ color: "#fff06a" }));
    for (let k = 0; k < 3; k++) {
      const s = new T.Mesh(star, yellow);
      s.position.set(Math.cos((k * Math.PI * 2) / 3) * 0.32, 0, Math.sin((k * Math.PI * 2) / 3) * 0.32);
      stars.add(s);
    }
    stars.position.y = 1.52;
    stars.visible = false;
    group.add(stars);
    this.scene.add(group);
    return { group, lean, legs, arm, sack, loot, stars, tag: null };
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
  /** The merchant's cart: a wagon under a canvas cover with gold heaped at its tail, on two spoked wheels, drawn by an ox. */
  private makeCart(own: Own): CartModel {
    const m = (color: string, roughness = 0.8, extra: T.MeshStandardMaterialParameters = {}) => this.standard({ color, roughness, ...extra }),
      wood = m("#8a5a34"),
      dark = m("#4a3220"),
      canvas = m("#efe6cf", 0.95),
      hide = m("#b98a5c"),
      gold = m("#ffcc33", 0.3, { emissive: "#7a5a00", emissiveIntensity: 0.5 }),
      group = new T.Group(),
      add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = group) => {
        const mesh = new T.Mesh(own(geometry), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        parent.add(mesh);
        return mesh;
      };
    add(new T.BoxGeometry(1.5, 0.1, 0.9), wood, -0.5, 0.52, 0);
    for (const z of [0.44, -0.44]) add(new T.BoxGeometry(1.5, 0.3, 0.05), wood, -0.5, 0.7, z);
    add(new T.BoxGeometry(0.05, 0.3, 0.9), wood, -1.24, 0.7, 0);
    const cover = add(new T.CylinderGeometry(0.5, 0.5, 1.1, 14, 1, false, 0, Math.PI), canvas, -0.32, 0.82, 0);
    cover.rotation.set(0, 0, Math.PI / 2);
    cover.rotation.order = "ZYX";
    cover.rotation.y = Math.PI / 2;
    const heap = new T.Group();
    for (let k = 0; k < 7; k++) add(new T.SphereGeometry(0.11, 10, 8), gold, -1.05 + (k % 3) * 0.1, 0.86 + Math.floor(k / 3) * 0.1, -0.24 + (k % 4) * 0.16, heap);
    group.add(heap);
    const wheels = [0.5, -0.5].map((z) => {
      const wheel = new T.Group();
      wheel.position.set(-0.5, 0.38, z);
      const rim = add(new T.TorusGeometry(0.34, 0.045, 8, 22), dark, 0, 0, 0, wheel);
      rim.castShadow = true;
      for (let k = 0; k < 3; k++) add(new T.BoxGeometry(0.62, 0.05, 0.04), wood, 0, 0, 0, wheel).rotation.z = (k * Math.PI) / 3;
      group.add(wheel);
      return wheel;
    });
    // The pole and the ox.
    add(new T.BoxGeometry(0.9, 0.05, 0.05), wood, 0.55, 0.52, 0);
    add(new T.BoxGeometry(0.85, 0.46, 0.42), hide, 0.95, 0.68, 0);
    add(new T.BoxGeometry(0.3, 0.3, 0.3), hide, 1.5, 0.78, 0);
    add(new T.BoxGeometry(0.12, 0.12, 0.22), m("#e8d0b0"), 1.67, 0.72, 0);
    for (const z of [0.13, -0.13]) add(new T.ConeGeometry(0.035, 0.18, 6), m("#f4eedd"), 1.5, 1.0, z).rotation.x = z > 0 ? 0.5 : -0.5;
    const legs = [
      [0.64, 0.14],
      [0.64, -0.14],
      [1.26, 0.14],
      [1.26, -0.14],
    ].map(([x, z]) => add(new T.BoxGeometry(0.1, 0.46, 0.1), hide, x, 0.23, z));
    // A bell at its neck.
    add(new T.SphereGeometry(0.06, 10, 8), gold, 1.4, 0.55, 0);
    group.visible = false;
    this.scene.add(group);
    return { group, wheels, cover, legs, heap };
  }
  private makeSparks(own: Own) {
    const n = 140,
      pos = new Float32Array(n * 3).fill(-999),
      geometry = own(new T.BufferGeometry());
    geometry.setAttribute("position", new T.BufferAttribute(pos, 3));
    const points = new T.Points(geometry, own(new T.PointsMaterial({ color: "#ffe066", size: 0.16, transparent: true, opacity: 0.95, depthWrite: false })));
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
      gold = m("#ffcc33", 0.3, { emissive: "#8a6200", emissiveIntensity: 0.55 }),
      at = (geometry: T.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => {
        geometry.rotateX(rx);
        geometry.rotateZ(rz);
        geometry.translate(x, y, z);
        return own(geometry);
      };
    let parts: { geometry: T.BufferGeometry; material: T.Material }[];
    if (kind === "coin")
      parts = [
        { geometry: at(new T.CylinderGeometry(0.17, 0.17, 0.045, 20), 0, 0.06, 0, Math.PI / 2), material: gold },
        { geometry: at(new T.CylinderGeometry(0.11, 0.11, 0.055, 16), 0, 0.06, 0, Math.PI / 2), material: m("#ffe27a", 0.3, { emissive: "#8a6200", emissiveIntensity: 0.4 }) },
      ];
    else if (kind === "pouch")
      parts = [
        { geometry: at(new T.SphereGeometry(0.2, 14, 10), 0, 0.1, 0), material: m("#9a6a3a", 0.9) },
        { geometry: at(new T.CylinderGeometry(0.07, 0.11, 0.12, 10), 0, 0.3, 0), material: m("#9a6a3a", 0.9) },
        { geometry: at(new T.TorusGeometry(0.08, 0.02, 6, 14), 0, 0.26, 0, Math.PI / 2), material: m("#3a2a1e") },
        { geometry: at(new T.SphereGeometry(0.07, 10, 8), 0, 0.37, 0), material: gold },
      ];
    else if (kind === "gem")
      parts = [{ geometry: at(new T.OctahedronGeometry(0.22), 0, 0.14, 0), material: m("#4ae0ff", 0.1, { emissive: "#0a8ab0", emissiveIntensity: 0.9, flatShading: true }) }];
    else if (kind === "chest")
      parts = [
        { geometry: at(new T.BoxGeometry(0.62, 0.32, 0.42), 0, 0.06, 0), material: m("#7a4a26", 0.8) },
        { geometry: at(new T.CylinderGeometry(0.21, 0.21, 0.62, 14, 1, false, 0, Math.PI), 0, 0.22, 0, 0, Math.PI / 2), material: m("#8a5630", 0.8) },
        { geometry: at(new T.BoxGeometry(0.07, 0.56, 0.44), -0.2, 0.14, 0), material: gold },
        { geometry: at(new T.BoxGeometry(0.07, 0.56, 0.44), 0.2, 0.14, 0), material: gold },
        { geometry: at(new T.BoxGeometry(0.12, 0.12, 0.05), 0, 0.2, 0.22), material: gold },
      ];
    else
      parts = [
        { geometry: at(new T.SphereGeometry(0.22, 16, 12), 0, 0.12, 0), material: kind === "pot" ? m("#b0562e", 0.8) : m("#1c1c22", 0.35) },
        { geometry: at(new T.CylinderGeometry(0.05, 0.07, 0.08, 8), 0, 0.36, 0), material: m("#5a5a62", 0.5) },
        { geometry: at(new T.SphereGeometry(0.07, 8, 6), 0.03, 0.46, 0), material: own(new T.MeshBasicMaterial({ color: "#ff8a2a" })) },
      ];
    return (this.lootParts[kind] = parts);
  }
  private makeLoot(item: Loot) {
    const group = new T.Group();
    for (const p of this.partsOf(item.pot ? "pot" : item.kind)) {
      const mesh = new T.Mesh(p.geometry, p.material);
      mesh.castShadow = true;
      group.add(mesh);
    }
    this.scene.add(group);
    return group;
  }
  /** A number or a word that rises from a place in the valley and fades. */
  private pop(text: string, x: number, y: number, cls = "") {
    if (capturing()) return;
    const at = new T.Vector3(x, y, 0.4).project(this.camera),
      el = document.createElement("span");
    el.className = `gr-pop ${cls}`;
    el.textContent = text;
    el.style.left = `${((at.x + 1) / 2) * 100}%`;
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
      } else if (e.kind === "swing") {
        c.swings[e.side]++;
        knock("swing");
      } else if (e.kind === "pickup") {
        c.pickups[e.side]++;
        knock(e.what === "chest" ? "chest" : e.what === "gem" ? "gem" : "coin", Math.min(1, 0.4 + e.value / 8));
        this.sparkle(e.x, e.y + 0.2, 4 + Math.min(10, e.value * 2), 2.4);
        this.pop(`+${e.value}`, e.x, e.y + 0.7, `gr-s${e.side}`);
      } else if (e.kind === "deposit") {
        c.deposits[e.side]++;
        knock("deposit", Math.min(1, 0.5 + e.amount / 20));
        this.flashed[e.side] = performance.now();
        this.sparkle(gateOf(e.side), 1, 10 + e.amount, 4);
        this.pop(`금화 +${e.amount}`, gateOf(e.side), 2.6, `gr-big gr-s${e.side}`);
        this.onMove(depositMove(e.side, e.amount));
      } else if (e.kind === "hit") {
        c.hits++;
        knock("hit");
        const o = world.bandits[e.on];
        this.sparkle(o.x, o.y + 0.9, 8, 3);
        if (e.dropped > 0) this.say("강탈!", SIDE_COLORS[e.by]);
      } else if (e.kind === "boom") {
        c.booms++;
        knock("boom");
        this.shook = performance.now();
        const blast = this.blasts.reduce((a, b) => (b.age > a.age ? b : a));
        blast.age = 0;
        blast.mesh.position.set(e.x, e.y + 0.2, 0.5);
        blast.mesh.visible = true;
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
      } else if (e.kind === "broken") {
        knock("broken");
        this.sparkle(e.x, 1, 26, 5);
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
    f.group.position.set(b.x, b.y, depth);
    f.group.scale.set(b.face * DRAWN, DRAWN, DRAWN);
    const stunned = b.stun > 0,
      running = b.ground && Math.abs(b.vx) > 0.4,
      phase = b.stride * 5.2;
    f.legs[0].rotation.z = !b.ground ? 0.55 : running ? Math.sin(phase) * 0.8 : 0;
    f.legs[1].rotation.z = !b.ground ? -0.45 : running ? -Math.sin(phase) * 0.8 : 0;
    f.lean.position.y = running ? Math.abs(Math.sin(phase)) * 0.05 : 0;
    f.lean.rotation.z = stunned ? 0.55 + Math.sin(t * 20) * 0.08 : running ? -0.12 : 0;
    // The club: at rest held forward and down; a swing raises it over the head and brings it down.
    const p = b.swing < 0 ? -1 : b.swing / SWING;
    f.arm.rotation.z = p < 0 ? 0.85 + (running ? Math.sin(phase) * 0.25 : 0) : p < 0.3 ? lerp(0.85, 3.2, p / 0.3) : lerp(3.2, 1.0, (p - 0.3) / 0.7);
    const full = b.carry / CAP,
      size = 0.14 + 0.2 * Math.sqrt(full);
    f.sack.scale.set(size, size * 1.12, size);
    f.sack.position.set(-0.2 - size * 0.55, 0.62 + size, 0);
    f.loot.visible = b.carry > 0;
    f.loot.position.set(f.sack.position.x, f.sack.position.y + size * 1.0, 0);
    f.loot.scale.set(size * 0.6, size * 0.3, size * 0.6);
    f.stars.visible = stunned;
    f.stars.rotation.y = t * 7;
    // Safe from another blow for a moment: it flickers.
    f.lean.visible = stunned || b.safe <= 0 || !moving || Math.floor(t * 14) % 2 === 0;
    if (f.tag) f.tag.position.set(b.x, b.y + BODY.tall * DRAWN + 0.8, 0.8);
  }
  /** Everything where the valley has it, the board over the canvas, and what browser tests read. */
  private pose(now: number, dt: number) {
    const world = this.world!,
      state = this.state!,
      t = now / 1000;
    // Side by side they do not stand in each other: the first a little nearer the eye.
    world.bandits.forEach((b, side) => this.poseBandit(this.figures[side], b, t, dt > 0, side === 0 ? 0.52 : 0.38));
    // Loot: a mesh for each piece, gone with it.
    const alive = new Set<number>();
    for (const item of world.loot) {
      alive.add(item.id);
      let held = this.lootMeshes.get(item.id);
      if (!held) this.lootMeshes.set(item.id, (held = { item, mesh: this.makeLoot(item), kind: item.kind }));
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
      g.scale.setScalar(swell * (item.kind === "chest" ? 1.15 : 1));
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
      castle.flag.rotation.y = Math.sin(t * 2.4 + side) * 0.35;
      const since = (now - this.flashed[side]) / 1000;
      (castle.ring.material as T.MeshBasicMaterial).opacity = since < 0.6 ? 1 : world.bandits[side].carry > 0 ? 0.55 + 0.3 * Math.sin(t * 6) : 0.4;
      castle.ring.scale.setScalar(since < 0.6 ? 1 + 0.5 * (since / 0.6) : 1);
      const arrow = this.arrows[side];
      arrow.visible = (side === 0 || this.two) && world.bandits[side].carry > 0 && !world.over;
      arrow.position.y = 2.75 + Math.sin(t * 5) * 0.14;
      arrow.rotation.y = t * 2;
    });
    this.valley.clouds.forEach((cloud, k) => {
      cloud.position.x += dt * (0.12 + k * 0.03);
      if (cloud.position.x > 30) cloud.position.x = -30;
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
      this.hud.innerHTML = text;
    }
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
    d.target = String(world.target);
  }
  protected subject(aspect: number): TableSubject {
    return goldRaidSubject(aspect);
  }
  /** The camera is set by the valley's own framing (`goldRaidFrame`): the road lifted clear of a phone's buttons. */
  protected resize() {
    super.resize();
    const frame = goldRaidFrame(this.camera.aspect, this.coarse),
      distance = frame.span / (2 * Math.tan((FOV * Math.PI) / 360));
    this.camera.position.set(0, frame.lookY + Math.sin(TILT) * distance, Math.cos(TILT) * distance);
    this.camera.lookAt(0, frame.lookY, 0);
    this.redraw();
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
    for (const el of [this.hud, this.word, this.pops, this.pad]) el.remove();
    super.dispose();
  }
}
