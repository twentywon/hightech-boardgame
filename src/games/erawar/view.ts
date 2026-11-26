import * as T from "three";
import { noZoom } from "../../engine/zoom";
import { capable } from "../../engine/scene-utils";
import { FOV } from "../../engine/camera";
import { capturing } from "../../ui/banner";
import type { LiveGuest, LiveSession } from "../../net/live";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { Effects } from "../goldraid/fx";
import { eraFrame, eraWarSubject, EDGE, type Frame } from "./layout";
import { fallMove, type State } from "./rules";
import {
  ABILITY_COOL,
  BASE_X,
  DT,
  ERAS,
  LAST_ERA,
  QUEUE,
  SLOTS,
  computerSide,
  rankCost,
  createWorld,
  freshMind,
  step,
  think,
  turretAt,
  turretCost,
  type Command,
  type Happening,
  type Kind,
  type Level,
  type Mind,
  type ShotKind,
  type World,
} from "./sim";
import { Inbox, Orders, blendPictures, packPicture, pictureOf, readPicture, type Picture, type SidePic } from "./net";
import { Kit, SIDE_COLORS, makeFigure, poseFigure, type Figure } from "./models";
import { MAST_Z, buildField, type Field } from "./field";

export const ERA_WAR_COLORS: [string, string] = SIDE_COLORS;
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A soldier as drawn: its figure, the ground it has walked (for the stride), and, once dead, how long since. */
interface Drawn {
  f: Figure;
  key: string;
  dist: number;
  x: number;
  dead: number;
}
const UNIT_ICONS = [
  // A sword, a bow, a heavy shield.
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3l2 2-9.5 9.5-2-2z M8 14l2 2-3 3-2-2z M6 13l5 5-1 1-5-5z" fill="currentColor"/></svg>`,
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3c8 3 13 8 16 16" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M5 3l16 16" stroke="currentColor" stroke-width="1" fill="none"/><path d="M4 20l12-12m0 0l-1 4m1-4l-4 1" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>`,
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 6v12M7 11h10" stroke="#0006" stroke-width="1.6"/></svg>`,
];
const ABILITY_WORDS = ["낙석!", "화살비!", "일제 포격!", "공습!"];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 시대 전쟁 drawn: the lane seen from the side (the plain, the woods and mountains behind), both bases as their eras
 * build them with their turrets, every soldier as a jointed figure that walks and fights, the shots in the air, the
 * special attacks raining down, smoke and fire. Over the canvas: both bases' strength and eras at the top with the
 * clock, a strip of the whole lane under them (tap it to look there), and my commands along the bottom (three soldiers
 * to train with the queue, three turret slots, the special attack, the next era).
 *
 * Against the computer my base is the left one (side 0). Over Wi-Fi (`live`) each device sees its own base at the left
 * (seat 1's whole picture is mirrored), the host runs the one lane (its own orders, its guest's by `Inbox`, the
 * computer's for a seat whose person is away) and tells it as pictures (`net.ts`); a guest draws those a moment behind
 * and sends its orders (`Orders`). Every screen draws from a picture, so all draw alike.
 *
 * The eye follows the fighting along the lane; a drag across the canvas (or A D, ← →) looks elsewhere for a while.
 */
export class EraWarView extends TableView<State> {
  private world: World | null = null;
  private pic: Picture | null = null;
  private kit: Kit;
  private field: Field;
  private root = new T.Group();
  private fx: Effects;
  private drawn = new Map<number, Drawn>();
  private spare = new Map<string, Figure[]>();
  private shots = new Map<number, { mesh: T.Object3D; x: number; y: number; seen: number }>();
  private shotParts: Record<string, () => T.Object3D>;
  private turrets: ({ era: number; group: T.Group } | null)[][] = [
    [null, null, null],
    [null, null, null],
  ];
  private shownEra = [-1, -1];
  private fallen = [false, false];
  private planes: { mesh: T.Group; x: number; dir: number; age: number }[] = [];
  private planeModel: T.Group;
  private sun: T.DirectionalLight;
  private flash: T.PointLight | null = null;
  private flashed = -9;
  /** This device's side (null: only watching), whether the picture is mirrored for it. */
  private mine: 0 | 1 | null = 0;
  private flip = 1;
  private minds: [Mind, Mind] = [freshMind(), freshMind()];
  private inbox = new Inbox();
  private orders = new Orders();
  /** My orders given since the last step (the host's own, or against the computer). */
  private given: Command[] = [];
  private heard = 0;
  private hud: HTMLElement;
  private bar: HTMLElement;
  private word: HTMLElement;
  private hudKey = "";
  private eye = { x: -6, manual: 0, set: false, drag: null as null | { id: number; from: number; x: number } };
  private shape = 16 / 9;
  private frame: Frame;
  private coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private clock = 0;
  private armed = -1;
  private armedAt = 0;
  private sounded = new Map<string, number>();
  private counts = { trained: [0, 0], deaths: 0, shots: 0, impacts: 0, abilities: 0, eras: 0 };
  onKnock: ((kind: string, strength: number) => void) | null = null;
  private readonly keyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly keyUp = (e: KeyboardEvent) => this.key(e, false);
  private keysHeld = new Set<string>();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
    private live: LiveSession | null = null,
  ) {
    super(host, quality, "#9cc8ee");
    const own: Own = (r) => this.own(r);
    noZoom(this.renderer.domElement);
    this.camera.far = 220;
    if (live) {
      const seat = live.seat;
      this.mine = seat === 0 || seat === 1 ? seat : null;
    }
    this.flip = this.mine === 1 ? -1 : 1;
    this.root.scale.x = this.flip;
    this.scene.add(this.root);
    const rich = capable();
    this.kit = new Kit(own, rich);
    this.scene.add(new T.HemisphereLight("#dcecff", "#5a6a3a", 1.7));
    const sun = (this.sun = new T.DirectionalLight("#fff1d6", 2.6));
    sun.position.set(6, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(rich ? 2048 : 1024, rich ? 2048 : 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 9, bottom: -4, near: 1, far: 50 });
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    if (rich) {
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.flash = new T.PointLight("#ffb060", 0, 9, 2);
      this.root.add(this.flash);
    }
    // The plain, the bases and turrets: their meshes go under the root, which is mirrored for seat 1.
    const fieldScene = new T.Scene();
    this.field = buildField(fieldScene, own, this.kit, rich);
    this.scene.background = fieldScene.background;
    this.scene.fog = fieldScene.fog;
    this.root.add(...fieldScene.children);
    // (Bases built later are added to the field's scene: they are moved under the root as they are built.)
    this.fieldScene = fieldScene;
    // (The puffs go under the root too, so that they are mirrored with the lane.)
    this.fx = new Effects(this.root as unknown as T.Scene, own, 140);
    this.shotParts = this.makeShots();
    this.planeModel = this.makePlane();
    this.frame = eraFrame(this.shape, this.coarse);
    // The board over the canvas, a word called out, my commands.
    const el = (cls: string, tag = "div") => {
      const d = document.createElement(tag);
      d.className = cls;
      host.append(d);
      return d;
    };
    this.hud = el("ew-hud");
    this.hud.setAttribute("aria-hidden", "true");
    this.word = el("ew-word");
    this.word.setAttribute("aria-hidden", "true");
    this.bar = el("ew-bar");
    this.makeBar();
    this.hud.addEventListener("pointerdown", (e) => this.mapTap(e));
    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.disposed) return;
      this.eye.drag = { id: e.pointerId, from: e.clientX, x: this.eye.x };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Not captured: followed while over the canvas.
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      const d = this.eye.drag;
      if (!d || d.id !== e.pointerId) return;
      const across = this.frame.wide / Math.max(1, canvas.clientWidth);
      if (Math.abs(e.clientX - d.from) > 3) {
        this.eye.x = clamp(d.x - (e.clientX - d.from) * across, -this.reach(), this.reach());
        this.eye.manual = 6;
      }
    });
    const lift = (e: PointerEvent) => {
      if (this.eye.drag?.id === e.pointerId) this.eye.drag = null;
    };
    canvas.addEventListener("pointerup", lift);
    canvas.addEventListener("pointercancel", lift);
    document.addEventListener("keydown", this.keyDown);
    document.addEventListener("keyup", this.keyUp);
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  private fieldScene: T.Scene;
  protected photographic() {
    return false;
  }
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.keysHeld.clear();
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && (!!this.live || !document.querySelector("dialog[open]"));
  }
  /** How far the eye's middle may go from the lane's middle. */
  private reach() {
    return Math.max(0, EDGE - this.frame.wide / 2);
  }

  // ── Commands ──
  /** An order of mine: carried out at the next step here, or sent to the host from a guest. */
  private give(c: Command) {
    if (this.mine === null || !this.state || this.state.winner !== null || this.paused) return;
    if (this.live && !this.live.host) this.orders.give(c);
    else this.given.push(c);
    this.onKnock?.("click", 0.5);
  }
  private makeBar() {
    if (this.mine === null) {
      this.bar.hidden = true;
      return;
    }
    const units = [0, 1, 2]
        .map((k) => `<button type="button" class="ew-unit" data-unit="${k}"><span class="ew-icon">${UNIT_ICONS[k]}</span><b></b><em></em><kbd>${k + 1}</kbd></button>`)
        .join(""),
      queue = `<span class="ew-queue" aria-label="훈련 대기"><i class="ew-train"><i></i></i>${Array.from({ length: QUEUE }, () => `<i class="ew-q"></i>`).join("")}</span>`,
      slots = Array.from({ length: SLOTS }, (_, s) => `<button type="button" class="ew-slot" data-slot="${s}"><b></b><em></em><kbd>${"ZXC"[s]}</kbd></button>`).join("");
    this.bar.innerHTML =
      `<div class="ew-money"><b class="ew-gold"></b><span class="ew-xp"><i></i><em></em></span></div>` +
      `<div class="ew-group ew-units">${units}${queue}</div>` +
      `<div class="ew-group ew-slots">${slots}</div>` +
      `<div class="ew-group ew-powers"><button type="button" class="ew-ability"><i class="ew-cool"></i><b></b><em></em><kbd>Q</kbd></button><button type="button" class="ew-era-up"><b>다음 시대</b><em></em><kbd>E</kbd></button></div>`;
    this.bar.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.bar.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b || b.disabled) return;
      if (b.dataset.unit) this.give({ kind: "train", unit: Number(b.dataset.unit) as Kind });
      else if (b.dataset.slot) this.slot(Number(b.dataset.slot));
      else if (b.classList.contains("ew-ability")) this.give({ kind: "ability" });
      else if (b.classList.contains("ew-era-up")) this.give({ kind: "era" });
    });
  }
  /** A turret slot pressed: an empty one builds; a built one asks once more, then sells. */
  private slot(s: number, sell = false) {
    const side = this.mySide();
    if (!side) return;
    if (side.turrets[s] < 0) return this.give({ kind: "turret", slot: s });
    if (sell || (this.armed === s && performance.now() - this.armedAt < 2500)) {
      this.armed = -1;
      this.give({ kind: "sell", slot: s });
    } else {
      this.armed = s;
      this.armedAt = performance.now();
      this.hudKey = "";
    }
  }
  private key(e: KeyboardEvent, down: boolean) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target;
    if (target instanceof Element && target !== this.renderer.domElement && target.closest("input, select, textarea, dialog, button")) return;
    if (down && document.querySelector("dialog[open]")) return;
    const code = e.code,
      pan = code === "KeyA" || code === "ArrowLeft" ? -1 : code === "KeyD" || code === "ArrowRight" ? 1 : 0;
    if (pan) {
      e.preventDefault();
      if (down) this.keysHeld.add(code);
      else this.keysHeld.delete(code);
      return;
    }
    if (!down || e.repeat) return;
    const unit = ["Digit1", "Digit2", "Digit3", "Numpad1", "Numpad2", "Numpad3"].indexOf(code);
    if (unit >= 0) this.give({ kind: "train", unit: (unit % 3) as Kind });
    else if (code === "KeyQ" || code === "Space") this.give({ kind: "ability" });
    else if (code === "KeyE") this.give({ kind: "era" });
    else if (code === "KeyZ" || code === "KeyX" || code === "KeyC") this.slot("ZXC".indexOf(code[3]), e.shiftKey);
    else return;
    e.preventDefault();
  }
  private mySide(): SidePic | null {
    return this.mine === null || !this.pic ? null : this.pic.sides[this.mine];
  }

  // ── The lane run ──
  private advance(now: number) {
    const real = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.clock += real;
    const live = this.live;
    if (live && !live.host) this.follow(now);
    else {
      const world = this.world;
      if (world && this.running()) {
        this.left += real;
        while (this.left >= DT && this.running()) {
          this.left -= DT;
          const orders: [Command[], Command[]] = [[], []];
          for (const side of [0, 1] as const) {
            const control = live ? live.control(side) : side === 0 ? "me" : "computer";
            if (control === "me") orders[side] = this.given.splice(0);
            else if (control === "remote") orders[side] = this.inbox.take(live!.latest(side));
            else if (control === "computer") orders[side] = think(world, side, live ? "hard" : this.level, this.minds[side]);
          }
          this.tell(step(world, orders));
          if (world.over) {
            this.left = 0;
            break;
          }
        }
      } else this.left = 0;
      if (world) {
        this.pic = pictureOf(world);
        if (live?.host) live.tick(() => packPicture(this.pic!), now);
        if (world.over && this.state?.winner === null) this.end(world);
      }
    }
    if (this.pic) this.draw(real);
    this.redraw();
  }
  /** The end, reported once as the match's move: a base fallen (there is no time limit). */
  private end(world: World) {
    this.onMove(fallMove(world.winner === 0 ? 1 : 0));
  }
  /** A guest's frame: my orders sent, the host's picture drawn a moment behind, its happenings heard. */
  private follow(now: number) {
    const live = this.live as LiveGuest;
    live.tick(() => (this.mine !== null ? this.orders.data() : null), now);
    const f = live.frame(now);
    if (!f) return;
    const a = readPicture(f.a.data),
      b = readPicture(f.b.data);
    if (!a || !b) return;
    this.pic = blendPictures(a, b, f.t);
    const fresh = b.events.filter((e) => e.seq > this.heard);
    if (fresh.length) {
      // A device that comes in late hears only from now on.
      if (this.heard > 0) this.tell(fresh);
      this.heard = Math.max(...fresh.map((e) => e.seq));
    }
  }
  /** What a step did, told to the ear and the eye (and counted for the tests). */
  private tell(events: Happening[]) {
    const c = this.counts;
    for (const e of events) {
      this.heard = Math.max(this.heard, e.seq);
      const x = e.x;
      switch (e.code) {
        case "spawn":
          c.trained[e.side]++;
          this.sound("spawn", 0.4);
          this.fx.emit("dust", x, 0.1, 0.2, 3, { speed: 0.8, up: 0.3, size: 0.4, life: 0.6 });
          break;
        case "die": {
          c.deaths++;
          const era = Math.floor(e.extra / 3),
            big = e.extra % 3 === 2;
          this.sound("die", big ? 1 : 0.5);
          this.fx.emit("dust", x, 0.3, 0.2, big ? 9 : 4, { speed: 1.2, up: 0.6, size: big ? 0.8 : 0.45, life: 0.8 });
          if (big && era >= 2) this.boom(x, 0.6, 0.8);
          break;
        }
        case "melee":
          this.sound(`melee${Math.min(3, e.extra)}`, 0.6);
          this.fx.emit("star", x, 0.95, 0.4, 2, { speed: 1.2, up: 0.6, size: 0.3, life: 0.3 });
          break;
        case "shoot": {
          c.shots++;
          const kind = shotName(e.extra);
          this.sound(`shoot-${kind}`, 0.5);
          if (kind === "bullet" || kind === "ball" || kind === "shell") {
            this.fx.emit("fire", x + (e.side ? -0.35 : 0.35), kind === "bullet" ? 1.05 : 0.75, 0.3, kind === "bullet" ? 1 : 3, { speed: 0.5, up: 0, size: kind === "bullet" ? 0.25 : 0.6, life: 0.12 });
            this.fx.emit("smoke", x + (e.side ? -0.3 : 0.3), 0.9, 0.2, kind === "bullet" ? 1 : 4, { speed: 0.6, up: 0.6, size: 0.4, grow: 2, life: 1 });
          }
          break;
        }
        case "impact": {
          c.impacts++;
          const kind = shotName(e.extra);
          if (kind === "ball" || kind === "shell" || kind === "fallShell" || kind === "bomb") this.boom(x, 0.2, kind === "bomb" ? 1.3 : kind === "ball" ? 0.7 : 1);
          else if (kind === "fallRock") {
            this.sound("rock", 1);
            this.fx.emit("dust", x, 0.2, 0.3, 6, { speed: 1.8, up: 0.8, size: 0.7, life: 0.9 });
            this.fx.emit("chip", x, 0.3, 0.3, 5, { speed: 3, up: 3, size: 0.12, life: 0.8 });
          } else {
            this.sound(`hit-${kind}`, 0.4);
            this.fx.emit("dust", x, 0.25, 0.3, 2, { speed: 0.8, up: 0.4, size: 0.3, life: 0.4 });
          }
          break;
        }
        case "base":
          this.sound("base", 0.6);
          this.fx.emit("chip", x + (e.side ? -0.2 : 0.2), 1 + Math.random() * 1.5, 0.6, 2, { speed: 2, up: 1.5, size: 0.1, life: 0.7 });
          break;
        case "ability": {
          c.abilities++;
          this.say(ABILITY_WORDS[e.extra] ?? "특수 공격!", SIDE_COLORS[e.side]);
          this.sound("ability", 1);
          if (e.extra === 3) this.fly(e.side, x);
          break;
        }
        case "era":
          c.eras++;
          this.say(`${ERAS[e.extra].name} 시대!`, SIDE_COLORS[e.side]);
          this.sound("era", 1);
          this.fx.emit("glint", e.side ? BASE_X : -BASE_X, 3, 0.8, 12, { speed: 3, up: 3, size: 0.6, life: 1 });
          break;
        case "turret":
          this.sound("turret", 0.7);
          break;
        case "sell":
          this.sound("sell", 0.7);
          break;
        case "fall":
          if (e.extra >= 0) {
            this.boom(x, 2, 2);
            this.boom(x + 1, 1, 1.6);
          }
          this.sound("fall", 1);
          break;
      }
    }
  }
  /** A sound, kept from repeating within a few hundredths of a second (a volley is one sound). */
  private sound(kind: string, strength: number) {
    const now = performance.now(),
      gap = kind.startsWith("shoot-bullet") ? 70 : 45;
    if (now - (this.sounded.get(kind) ?? -1e9) < gap) return;
    this.sounded.set(kind, now);
    this.onKnock?.(kind, strength);
  }
  private boom(x: number, y: number, size: number) {
    this.sound("boom", Math.min(1, 0.4 + size * 0.4));
    this.fx.emit("fire", x, y + 0.3, 0.4, Math.round(5 * size), { speed: 2 * size, up: 1, size: 0.6 * size, grow: 1.8, life: 0.4 });
    this.fx.emit("smoke", x, y + 0.5, 0.3, Math.round(6 * size), { speed: 1.2, up: 1.2, size: 0.6 * size, grow: 2.4, life: 1.5 });
    this.fx.emit("chip", x, y + 0.3, 0.4, Math.round(5 * size), { speed: 3.5, up: 3, size: 0.09, life: 0.9 });
    if (this.flash) {
      this.flash.position.set(x, y + 1, 1.2);
      this.flashed = this.clock;
    }
  }
  private say(text: string, colour: string) {
    if (capturing()) return;
    this.word.textContent = text;
    this.word.style.color = colour;
    this.word.classList.remove("ew-show");
    void this.word.offsetWidth;
    this.word.classList.add("ew-show");
  }
  /** Bombers flying over the lane toward the enemy (the modern special attack). */
  private fly(side: number, x: number) {
    const dir = side === 0 ? 1 : -1;
    for (let k = 0; k < 3; k++) {
      const mesh = this.planeModel.clone();
      mesh.scale.x = dir;
      this.root.add(mesh);
      this.planes.push({ mesh, x: x - dir * (14 + k * 2.5), dir, age: -k * 0.25 });
    }
  }

  // ── Drawing ──
  private makePlane() {
    const g = new T.Group(),
      k = this.kit;
    k.mesh("cyl", "oliveDark", 0, 0, 0, 0.18, 2.2, 0.18, g).rotation.z = Math.PI / 2;
    k.mesh("cone", "oliveDark", 1.25, 0, 0, 0.18, 0.4, 0.18, g).rotation.z = -Math.PI / 2;
    k.mesh("box", "olive", 0.1, 0, 0, 0.5, 0.05, 2.4, g);
    k.mesh("box", "olive", -0.95, 0.1, 0, 0.3, 0.04, 0.9, g);
    k.mesh("box", "olive", -0.95, 0.3, 0, 0.3, 0.4, 0.04, g);
    for (const z of [-0.7, 0.7]) k.mesh("cyl", "dark", 0.3, -0.05, z, 0.12, 0.4, 0.12, g).rotation.z = Math.PI / 2;
    return g;
  }
  private makeShots(): Record<string, () => T.Object3D> {
    const k = this.kit,
      own: Own = (r) => this.own(r),
      hot = own(new T.MeshBasicMaterial({ color: "#ffe38a" })),
      group = (build: (g: T.Group) => void) => () => {
        const g = new T.Group();
        build(g);
        return g;
      };
    return {
      rock: group((g) => k.mesh("ballLo", "stone", 0, 0, 0, 0.07, 0.06, 0.07, g)),
      fallRock: group((g) => k.mesh("ballLo", "stone", 0, 0, 0, 0.32, 0.27, 0.3, g)),
      arrow: group((g) => {
        k.mesh("cyl", "wood", 0, 0, 0, 0.012, 0.6, 0.012, g).rotation.z = Math.PI / 2;
        k.mesh("cone4", "iron", 0.32, 0, 0, 0.025, 0.08, 0.025, g).rotation.z = -Math.PI / 2;
        k.mesh("box", "white", -0.27, 0, 0, 0.1, 0.05, 0.01, g);
      }),
      fallArrow: group((g) => {
        k.mesh("cyl", "wood", 0, 0, 0, 0.016, 0.8, 0.016, g).rotation.z = Math.PI / 2;
        k.mesh("cone4", "iron", 0.42, 0, 0, 0.03, 0.1, 0.03, g).rotation.z = -Math.PI / 2;
        k.mesh("box", "team0", -0.36, 0, 0, 0.12, 0.06, 0.01, g);
      }),
      bullet: group((g) => {
        const m = new T.Mesh(k.g.ballLo, hot);
        m.scale.set(0.14, 0.025, 0.025);
        g.add(m);
      }),
      ball: group((g) => k.mesh("ball", "black", 0, 0, 0, 0.1, 0.1, 0.1, g)),
      shell: group((g) => {
        k.mesh("cyl", "dark", 0, 0, 0, 0.05, 0.22, 0.05, g).rotation.z = Math.PI / 2;
        const t = new T.Mesh(k.g.ballLo, hot);
        t.scale.set(0.12, 0.04, 0.04);
        t.position.x = -0.16;
        g.add(t);
      }),
      fallShell: group((g) => {
        k.mesh("cyl", "black", 0, 0, 0, 0.1, 0.4, 0.1, g).rotation.z = Math.PI / 2;
        k.mesh("cone", "black", 0.25, 0, 0, 0.1, 0.12, 0.1, g).rotation.z = -Math.PI / 2;
      }),
      bomb: group((g) => {
        k.mesh("ball", "oliveDark", 0, 0, 0, 0.32, 0.13, 0.13, g);
        k.mesh("box", "dark", -0.3, 0, 0, 0.12, 0.2, 0.02, g);
        k.mesh("box", "dark", -0.3, 0, 0, 0.12, 0.02, 0.2, g);
      }),
    };
  }
  /** A figure for a soldier, from the spare ones of its kind when there are. */
  private figure(era: number, kind: Kind, side: number) {
    const key = `${era}${kind}${side}`,
      spare = this.spare.get(key)?.pop();
    const f = spare ?? makeFigure(this.kit, era, kind, side);
    f.root.visible = true;
    f.root.rotation.set(0, 0, 0);
    this.root.add(f.root);
    return { f, key };
  }
  private draw(dt: number) {
    const pic = this.pic!,
      t = this.clock;
    // Bases as their eras build them; a fallen one sinks and leans.
    for (const side of [0, 1] as const) {
      const s = pic.sides[side];
      if (this.shownEra[side] !== s.era) {
        if (this.shownEra[side] >= 0) this.field.base(side, this.shownEra[side]).visible = false;
        const b = this.field.base(side, s.era);
        if (b.parent !== this.root) this.root.add(b);
        b.visible = true;
        this.shownEra[side] = s.era;
      }
      const base = this.field.base(side, s.era),
        down = s.hp <= 0;
      if (down && !this.fallen[side]) this.fallen[side] = true;
      if (this.fallen[side]) {
        base.position.y = Math.max(-1.6, base.position.y - dt * 0.8);
        base.rotation.z = Math.min(0.18, base.rotation.z + dt * 0.12) * (side ? -1 : 1);
      } else {
        base.position.y = 0;
        base.rotation.z = 0;
      }
      base.traverse((o) => {
        if (o.userData.flicker) o.scale.y = 0.5 + 0.12 * Math.sin(t * 17 + o.id) + 0.06 * Math.sin(t * 31);
        if (o.userData.spin) o.rotation.y = t * 0.8;
        if (o.userData.flag) o.rotation.y = Math.sin(t * 3 + side) * 0.18;
      });
      // A base hurt smokes, and burns when badly hurt.
      const hurt = 1 - s.hp / s.max;
      if (hurt > 0.45 && !capturing() && Math.random() < dt * (hurt > 0.75 ? 7 : 3)) {
        const x = (side ? 1 : -1) * (BASE_X - 0.5 + Math.random() * 1.5);
        this.fx.emit("smoke", x, 2.6 + Math.random(), -0.2, 1, { speed: 0.4, up: 1.2, size: 0.9, grow: 2.5, life: 2.2 });
        if (hurt > 0.75) this.fx.emit("fire", x, 2.2 + Math.random() * 0.8, 0.2, 1, { speed: 0.3, up: 0.8, size: 0.6, life: 0.5 });
      }
      // The turrets.
      for (let slot = 0; slot < SLOTS; slot++) {
        const era = s.turrets[slot],
          have = this.turrets[side][slot];
        if (have && have.era !== era) {
          this.root.remove(have.group);
          this.turrets[side][slot] = null;
        }
        if (era >= 0 && !this.turrets[side][slot]) {
          const group = this.field.turret(era),
            at = turretAt(side, slot);
          group.position.set(at.x, at.y - 0.06, MAST_Z);
          group.scale.x = side ? -1 : 1;
          this.root.add(group);
          this.turrets[side][slot] = { era, group };
        }
        const tur = this.turrets[side][slot];
        if (tur) {
          const kick = s.fired[slot] < 0.25 ? 1 - s.fired[slot] / 0.25 : 0,
            barrel = tur.group.userData.barrel as T.Group;
          barrel.position.x = (barrel.userData.x ?? (barrel.userData.x = barrel.position.x)) - kick * 0.12;
        }
      }
    }
    // The soldiers: each drawn where the picture has it, walking or striking; the dead fall and sink, then go.
    const seen = new Set<number>();
    for (const u of pic.units) {
      seen.add(u.id);
      let d = this.drawn.get(u.id);
      if (!d) {
        const { f, key } = this.figure(u.era, u.kind, u.side);
        d = { f, key, dist: 0, x: u.x, dead: -1 };
        this.drawn.set(u.id, d);
      }
      d.dist += Math.abs(u.x - d.x);
      d.x = u.x;
      const depth = ((u.id * 37) % 7) - 3,
        big = u.kind === 2;
      d.f.root.position.set(u.x, 0, big ? -0.25 : depth * 0.07);
      poseFigure(d.f, d.dist, u.walking, u.since, u.life, t + u.id);
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      if (d.dead < 0) d.dead = 0;
      d.dead += dt;
      const p = Math.min(1, d.dead / 0.35);
      // Over backward, away from the way it went.
      d.f.root.rotation.z = (d.key.endsWith("1") ? -1 : 1) * p * 1.35;
      d.f.root.position.y = -Math.max(0, d.dead - 0.6) * 0.9;
      d.f.bar.visible = d.f.barBack.visible = false;
      if (d.dead > 1.8) {
        this.root.remove(d.f.root);
        const list = this.spare.get(d.key) ?? [];
        list.push(d.f);
        this.spare.set(d.key, list);
        this.drawn.delete(id);
      }
    }
    // The shots in the air, each pointed the way it flies.
    const flying = new Set<number>();
    for (const s of pic.shots) {
      flying.add(s.id);
      let held = this.shots.get(s.id);
      if (!held) {
        held = { mesh: this.shotParts[s.kind](), x: s.x, y: s.y, seen: 0 };
        this.root.add(held.mesh);
        this.shots.set(s.id, held);
      }
      const dx = s.x - held.x,
        dy = s.y - held.y;
      if (Math.abs(dx) + Math.abs(dy) > 1e-4) held.mesh.rotation.z = Math.atan2(dy, dx);
      else if (s.kind.startsWith("fall") || s.kind === "bomb") held.mesh.rotation.z = -Math.PI / 2;
      if (s.kind === "rock" || s.kind === "fallRock" || s.kind === "ball") held.mesh.rotation.z += t * 9;
      held.mesh.position.set(s.x, s.y, s.kind === "bomb" || s.kind.startsWith("fall") ? 0.1 : 0.15);
      held.x = s.x;
      held.y = s.y;
    }
    for (const [id, held] of this.shots)
      if (!flying.has(id)) {
        this.root.remove(held.mesh);
        this.shots.delete(id);
      }
    // Bombers over the lane.
    this.planes = this.planes.filter((p) => {
      p.age += dt;
      p.x += p.dir * 11 * dt;
      p.mesh.position.set(p.x, 9 + Math.sin(p.age * 2) * 0.2, -1.5);
      p.mesh.visible = p.age >= 0;
      if (p.age > 4) {
        this.root.remove(p.mesh);
        return false;
      }
      return true;
    });
    for (const c of this.field.clouds) c.position.x = ((c.position.x + 50 + dt * 0.4) % 110) - 50;
    if (this.flash) this.flash.intensity = Math.max(0, 1 - (this.clock - this.flashed) / 0.35) * 26;
    this.aim(dt);
    this.describe();
  }
  /** The eye: on the fighting (the two foremost soldiers' middle), unless a drag looked elsewhere a moment ago. */
  private aim(dt: number) {
    const pic = this.pic!,
      fronts = [0, 1].map((side) => {
        let best: number | null = null;
        for (const u of pic.units) if (u.side === side && (best === null || (side === 0 ? u.x > best : u.x < best))) best = u.x;
        return best;
      }),
      [a, b] = fronts,
      mine = this.mine ?? 0,
      // In my own picture (mirrored for seat 1).
      focus = a !== null && b !== null ? (a + b) / 2 : a !== null ? a + 2 : b !== null ? b - 2 : (mine === 0 ? -1 : 1) * (BASE_X - 6),
      want = clamp(focus * this.flip, -this.reach(), this.reach());
    if (this.keysHeld.size) {
      const way = [...this.keysHeld].reduce((n, k) => n + (k === "KeyA" || k === "ArrowLeft" ? -1 : 1), 0);
      this.eye.x = clamp(this.eye.x + way * 9 * dt, -this.reach(), this.reach());
      this.eye.manual = 6;
    } else if (this.eye.manual > 0 && !this.eye.drag) this.eye.manual -= dt;
    if (!this.eye.set) {
      this.eye.x = want;
      this.eye.set = true;
    } else if (this.eye.manual <= 0 && !this.eye.drag) this.eye.x += (want - this.eye.x) * (1 - Math.exp(-1.6 * dt));
    this.look();
  }
  private look() {
    const f = this.frame,
      distance = f.span / (2 * Math.tan((FOV * Math.PI) / 360)),
      x = this.eye.x,
      camera = this.camera;
    if (camera.aspect !== this.shape) {
      camera.aspect = this.shape;
      camera.updateProjectionMatrix();
    }
    camera.position.set(x, f.lookY + Math.sin(f.tilt) * distance, Math.cos(f.tilt) * distance);
    camera.lookAt(x, f.lookY, 0);
    this.sun.position.set(x + 6, 14, 10);
    this.sun.target.position.set(x, 0, 0);
    this.sun.target.updateMatrixWorld();
  }
  protected resize() {
    super.resize();
    if (this.disposed || !this.host.clientWidth || !this.host.clientHeight) return;
    this.shape = this.host.clientWidth / this.host.clientHeight;
    this.frame = eraFrame(this.shape, this.coarse);
    this.eye.x = clamp(this.eye.x, -this.reach(), this.reach());
    this.look();
    this.redraw();
  }
  protected subject(aspect: number): TableSubject {
    return eraWarSubject(aspect);
  }
  /** A tap on the strip of the whole lane looks there. */
  private mapTap(e: PointerEvent) {
    const map = (e.target as HTMLElement).closest<HTMLElement>(".ew-map");
    if (!map) return;
    const box = map.getBoundingClientRect(),
      p = (e.clientX - box.left) / box.width;
    this.eye.x = clamp((p * 2 - 1) * EDGE, -this.reach(), this.reach());
    this.eye.manual = 8;
  }

  // ── The board and the commands ──
  private describe() {
    const pic = this.pic!,
      me = this.mine ?? 0,
      left = pic.sides[me],
      right = pic.sides[1 - me],
      names = this.live ? (this.mine === null ? ["1번", "2번"] : ["나", "상대"]) : ["나", "컴퓨터"],
      side = (s: SidePic, who: string, cls: string, team: number) =>
        `<div class="ew-side ${cls}" style="--team:${SIDE_COLORS[team]}"><span class="ew-era">${ERAS[s.era].name}${s.rank ? `<small>★${s.rank}</small>` : ""}</span><b>${who}</b><span class="ew-hp"><i style="width:${Math.max(0, Math.min(100, (s.hp / s.max) * 100)).toFixed(1)}%"></i><em>${Math.max(0, Math.ceil(s.hp))}</em></span></div>`,
      at = (x: number) => (((x * this.flip) / EDGE + 1) / 2) * 100,
      dots = pic.units.map((u) => `<i class="ew-dot ew-d${u.side}${u.kind === 2 ? " ew-big" : ""}" style="left:${at(u.x).toFixed(1)}%"></i>`).join(""),
      wide = (this.frame.wide / (2 * EDGE)) * 100,
      view = `<b class="ew-view" style="left:${(((this.eye.x / EDGE + 1) / 2) * 100 - wide / 2).toFixed(1)}%;width:${wide.toFixed(1)}%"></b>`,
      map = `<div class="ew-map"><i class="ew-lane"></i><i class="ew-castle ew-d${me}" style="left:${at(me ? BASE_X : -BASE_X)}%"></i><i class="ew-castle ew-d${1 - me}" style="left:${at(me ? -BASE_X : BASE_X)}%"></i>${dots}${view}</div>`,
      html = `<div class="ew-top">${side(left, names[0], "ew-left", this.mine === null ? 0 : me)}<div class="ew-vs">VS</div>${side(right, names[1], "ew-right", this.mine === null ? 1 : 1 - me)}</div>${map}`;
    if (html !== this.hudKey) {
      this.hudKey = html;
      this.hud.innerHTML = html;
    }
    this.commands();
    const d = this.renderer.domElement.dataset,
      [s0, s1] = pic.sides;
    d.phase = pic.over || this.state?.winner !== null ? "over" : this.paused ? "paused" : "play";
    d.gold = `${Math.floor(s0.gold)},${Math.floor(s1.gold)}`;
    d.xp = `${s0.xp},${s1.xp}`;
    d.era = `${s0.era},${s1.era}`;
    d.hp = `${Math.ceil(s0.hp)},${Math.ceil(s1.hp)}`;
    d.units = `${pic.units.filter((u) => u.side === 0).length},${pic.units.filter((u) => u.side === 1).length}`;
    d.front = pic.units.length ? pic.units.map((u) => u.x).reduce((m, x) => Math.max(m, x), -99).toFixed(2) : "";
    d.queue = `${s0.queue.length},${s1.queue.length}`;
    d.turrets = `${s0.turrets.join(" ")},${s1.turrets.join(" ")}`;
    d.ability = `${s0.ability.toFixed(1)},${s1.ability.toFixed(1)}`;
    d.trained = this.counts.trained.join(",");
    d.shots = String(this.counts.shots);
    d.deaths = String(this.counts.deaths);
    d.eras = String(this.counts.eras);
    d.abilities = String(this.counts.abilities);
    d.mine = String(this.mine);
    d.eye = this.eye.x.toFixed(2);
    d.time = (pic.tick * DT).toFixed(1);
  }
  /** My commands as the picture has my side: costs, what can be paid for, the queue, the slots, the powers. */
  private commands() {
    const s = this.mySide();
    if (!s || this.bar.hidden) return;
    const era = ERAS[s.era],
      over = !!this.pic?.over || this.state?.winner !== null,
      key = JSON.stringify([s.era, s.rank, Math.floor(s.gold), s.xp, s.queue, s.turrets, Math.ceil(s.ability), Math.round(s.training * 20), this.armed, over, s.next]);
    if (this.bar.dataset.key === key) return;
    this.bar.dataset.key = key;
    if (this.armed >= 0 && performance.now() - this.armedAt > 2500) this.armed = -1;
    this.bar.querySelector(".ew-gold")!.textContent = String(Math.floor(s.gold));
    const xp = this.bar.querySelector<HTMLElement>(".ew-xp")!;
    xp.querySelector("i")!.style.width = `${s.next ? Math.min(100, (s.xp / s.next) * 100) : 100}%`;
    xp.querySelector("em")!.textContent = s.next ? `경험 ${s.xp}/${s.next}` : `경험 ${s.xp}`;
    this.bar.querySelectorAll<HTMLButtonElement>(".ew-unit").forEach((b, k) => {
      const u = era.units[k];
      b.querySelector("b")!.textContent = u.name;
      b.querySelector("em")!.textContent = String(u.cost);
      b.disabled = over || s.gold < u.cost || s.queue.length >= QUEUE;
      b.setAttribute("aria-label", `${u.name} 훈련, ${u.cost}골드`);
    });
    const qs = this.bar.querySelectorAll<HTMLElement>(".ew-q");
    qs.forEach((q, k) => {
      const code = s.queue[k];
      q.className = `ew-q${code === undefined ? "" : ` on ew-k${code % 3}`}`;
    });
    this.bar.querySelector<HTMLElement>(".ew-train > i")!.style.width = `${(s.training * 100).toFixed(0)}%`;
    this.bar.querySelectorAll<HTMLButtonElement>(".ew-slot").forEach((b, slot) => {
      const tEra = s.turrets[slot],
        empty = tEra < 0,
        cost = turretCost(s.era);
      b.classList.toggle("built", !empty);
      b.classList.toggle("armed", this.armed === slot);
      b.querySelector("b")!.textContent = empty ? ERAS[s.era].turret.name : this.armed === slot ? "다시 눌러 팔기" : ERAS[tEra].turret.name;
      b.querySelector("em")!.textContent = empty ? `${cost}` : `팔기 +${Math.round(turretCost(tEra) * 0.5)}`;
      b.disabled = over || (empty && s.gold < cost);
      b.setAttribute("aria-label", empty ? `포탑 ${slot + 1}: ${ERAS[s.era].turret.name} 세우기, ${cost}골드` : `포탑 ${slot + 1}: ${ERAS[tEra].turret.name} 팔기`);
    });
    const ability = this.bar.querySelector<HTMLButtonElement>(".ew-ability")!,
      ready = s.ability <= 0;
    ability.querySelector("b")!.textContent = era.ability.name;
    ability.querySelector("em")!.textContent = ready ? "준비됨" : `${Math.ceil(s.ability)}초`;
    ability.querySelector<HTMLElement>(".ew-cool")!.style.height = `${ready ? 0 : (s.ability / ABILITY_COOL) * 100}%`;
    ability.classList.toggle("ready", ready && !over);
    ability.disabled = over || !ready;
    ability.setAttribute("aria-label", `특수 공격 ${era.ability.name}${ready ? "" : `, ${Math.ceil(s.ability)}초 남음`}`);
    // In the last era the button buys a rank (강화) with gold.
    const up = this.bar.querySelector<HTMLButtonElement>(".ew-era-up")!,
      last = s.era >= LAST_ERA,
      price = rankCost(s.rank),
      can = last ? s.gold >= price : s.next !== null && s.xp >= s.next;
    up.classList.toggle("ew-rank-up", last);
    up.querySelector("b")!.textContent = last ? `강화 ★${s.rank + 1}` : "다음 시대";
    up.querySelector("em")!.textContent = last ? String(price) : `${ERAS[s.era + 1].name}`;
    up.classList.toggle("ready", can && !over);
    up.disabled = over || !can;
    up.setAttribute("aria-label", last ? `강화 ${s.rank + 1}단계, ${price}골드` : `다음 시대 ${ERAS[s.era + 1].name}로, 경험 ${s.xp} / ${s.next}`);
  }
  protected spots(): Spot[] {
    return [];
  }
  protected dragStart() {
    return true;
  }
  protected place(state: State) {
    const anew = (!this.world && !(this.live && !this.live.host)) || (state.ply === 0 && this.shown > 0);
    this.shown = state.ply;
    if (anew && !(this.live && !this.live.host)) {
      this.world = createWorld(Math.floor(Math.random() * 2e9) + 1);
      if (!this.live) computerSide(this.world, 1, this.level);
      else for (const side of [0, 1] as const) if (this.live.host && this.live.control(side) === "computer") computerSide(this.world, side, "hard");
      this.minds = [freshMind(), freshMind()];
      this.given = [];
      this.eye.set = false;
      this.counts = { trained: [0, 0], deaths: 0, shots: 0, impacts: 0, abilities: 0, eras: 0 };
      this.pic = pictureOf(this.world);
    }
    if (state.winner !== null && this.world) this.world.over = true;
    if (this.pic) this.draw(0);
  }
  protected animate() {
    return false;
  }
  protected mark() {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    document.removeEventListener("keydown", this.keyDown);
    document.removeEventListener("keyup", this.keyUp);
    for (const el of [this.hud, this.bar, this.word]) el.remove();
    super.dispose();
  }
}
const shotName = (n: number): ShotKind => (["rock", "arrow", "bullet", "ball", "shell", "fallRock", "fallArrow", "fallShell", "bomb"] as ShotKind[])[n] ?? "rock";
