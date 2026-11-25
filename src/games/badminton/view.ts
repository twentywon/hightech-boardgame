import * as T from "three";
import { aim, capable, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { noZoom } from "../../engine/zoom";
import { blend, type LiveGuest, type LiveSession } from "../../net/live";
import { inputOf, noCounts, readInput, readSnap, snapOf, takeInput, type Counts } from "./net";
import { featherPicture, hall } from "./court";
import { SHOULDER, aimArm, figure, pose, type Figure } from "./figure";
import { courtCamera, lookToward, restingLook } from "./layout";
import { SlideReader, type Slide } from "./swipe";
import { fromRight, serverOf, type State } from "./rules";
import { DT, HALF_L, HALF_W, SWING, WHY, airborne, createWorld, inReach, jump, jumpNow, path, serve, smashable, step, swing, type Happening, type Level, type World } from "./sim";

export const BADMINTON_COLORS: [string, string] = ["#e0402c", "#2a72e0"];
/** How long the shuttle of an ended rally is left on the floor before the next serve. */
const DEAD_WAIT = 1.3;
const canvasTexture = (canvas: HTMLCanvasElement) => {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
};
/** A soft round glow (the reach ring and the landing mark), or a dark one (a shadow). */
function glow(colour: string, ring: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring) {
    g.addColorStop(0, `${colour}00`);
    g.addColorStop(0.62, `${colour}00`);
    g.addColorStop(0.78, `${colour}ff`);
    g.addColorStop(0.86, `${colour}aa`);
    g.addColorStop(1, `${colour}00`);
  } else {
    g.addColorStop(0, colour);
    g.addColorStop(0.5, `${colour}88`);
    g.addColorStop(1, `${colour}00`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}
interface Word {
  sprite: T.Sprite;
  at: number;
  x: number;
  y: number;
  z: number;
}
/**
 * A badminton hall seen from behind my back line: my player in red from behind in the lower middle, the computer in
 * blue across the net, the shuttle with its shadow. The rally is played in real time (`sim.ts`) and each point won is
 * reported as a move. A swipe anywhere on the court swings my racket (its speed the stroke's power, its lean the aim);
 * the jump button at the lower left jumps, and a swipe in the air smashes (the user asked for both).
 */
export class BadmintonView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private world: World = this.newWorld();
  private figures: [Figure, Figure];
  private shuttle: T.Group;
  private shadow: T.Mesh;
  private ring: T.Mesh;
  private landMark: T.Mesh;
  private trail: T.Mesh[] = [];
  private trailAt: T.Vector3[] = [];
  private words: Word[] = [];
  private tip: HTMLElement;
  private jumpButton: HTMLButtonElement;
  private swipe: SlideReader | null = null;
  /** The keyboard's stroke keys: their powers and leans. */
  private paused = false;
  private begun = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private heard = 0;
  /** Where the eye stands (it follows my player's head, eased), how far it looks up after a high shuttle, and a smash's shake. */
  private eye = { x: 0, y: 0, z: HALF_L };
  /** Where the eye looks (eased toward the shuttle while it flies, back down the court between rallies). */
  private look = { x: 0, y: 0.95, z: -6.1 };
  private shook = -1;
  private reachShown = 0;
  /** Where on the screen the pointer that holds my racket is (the mouse over the court, a finger held down), and the ray through it. */
  private pointer: { clientX: number; clientY: number } | null = null;
  private pointerRay = new T.Raycaster();
  /** Where each racket was aimed when it struck, held through the follow-through (the shuttle has gone by then). */
  private lastAim: (T.Vector3 | null)[] = [null, null];
  /** The glow round the shuttle while my racket can reach it. */
  private halo: T.Sprite;
  /** The last power a swipe had (for the browser tests), and how many swipes swung. */
  private swung = 0;
  private lastPower = -1;
  /**
   * Over Wi-Fi (`live`): the side this device plays (seat 1 stands behind the far end), read from the room every frame.
   * The host's view runs the one court, a person's swipes and jumps on each side that has one (mine, a guest's as the
   * room feeds them), the computer on a side whose person is away; it tells the court to all (`snapOf`). A guest's view
   * runs no court: it draws the host's a moment behind and sends its swipes and jumps as counts (`inputOf`).
   */
  private mine: 0 | 1 = 0;
  private seatKnown = false;
  /** What the court has done that makes a sound or a word (told to guests), and what a guest has heard of it. */
  private counts: Counts = noCounts();
  private heard_: Counts | null = null;
  /** A guest's swipes and jumps so far, and its last swipe; on the host, each guest's taken so far. */
  private swings = 0;
  private jumps = 0;
  private lastSwipe = { power: 0, yaw: 0 };
  private taken = [
    { swings: 0, jumps: 0 },
    { swings: 0, jumps: 0 },
  ];
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
    private live: LiveSession | null = null,
  ) {
    super(host, quality, "#c9d2dc");
    const el = this.renderer.domElement;
    // A swipe is the game's: two fingers do not zoom here (one may hold the jump button while the other swipes).
    noZoom(el);
    el.style.touchAction = "none";
    if (!capable()) this.renderer.setPixelRatio(1);
    const keep_ = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.add(new T.HemisphereLight("#f6f8ff", "#7a5a3c", 1.25));
    const sun = new T.DirectionalLight("#fff4e0", 2.1);
    sun.position.set(3, 14, 4);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 10, bottom: -10, near: 2, far: 30 });
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun, sun.target);
    const fill = new T.DirectionalLight("#dfe8ff", 0.7);
    fill.position.set(-6, 8, -8);
    this.scene.add(fill);
    hall(this.scene, keep_);
    this.figures = [figure(keep_, "#d8322a", "#2a1d14", "#e23b2a"), figure(keep_, "#2363d0", "#121418", "#1f8adf")];
    for (const f of this.figures) this.scene.add(f.root);
    this.dress();
    // The shuttle: a white cork at its nose and a skirt of feathers, made along -y (the nose) so that it can be turned along its way.
    this.shuttle = new T.Group();
    const cork = new T.Mesh(keep_(new T.SphereGeometry(0.014, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), this.standard({ color: "#f7f5ee", roughness: 0.55 })),
      band = new T.Mesh(keep_(new T.CylinderGeometry(0.0142, 0.0142, 0.008, 16)), this.standard({ color: "#2a4fb0", roughness: 0.5 })),
      skirt = new T.Mesh(keep_(new T.CylinderGeometry(0.033, 0.0135, 0.062, 24, 1, true)), keep_(glossy({ map: keep_(featherPicture(keep_)), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.7 }, 0)));
    cork.position.y = 0;
    band.position.y = 0.004;
    skirt.position.y = 0.039;
    for (const part of [cork, band, skirt]) {
      part.castShadow = true;
      this.shuttle.add(part);
    }
    this.scene.add(this.shuttle);
    this.shadow = new T.Mesh(keep_(new T.CircleGeometry(0.06, 20).rotateX(-Math.PI / 2)), keep_(new T.MeshBasicMaterial({ map: keep_(glow("#000000", false)), transparent: true, depthWrite: false, opacity: 0.5 })));
    this.shadow.renderOrder = 2;
    this.ring = new T.Mesh(keep_(new T.CircleGeometry(0.9, 40).rotateX(-Math.PI / 2)), keep_(new T.MeshBasicMaterial({ map: keep_(glow("#c8ff5c", true)), transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    this.ring.renderOrder = 3;
    this.ring.visible = false;
    this.halo = new T.Sprite(keep_(new T.SpriteMaterial({ map: keep_(glow("#ffffff", true)), transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending })));
    this.halo.renderOrder = 19;
    this.halo.visible = false;
    this.scene.add(this.halo);
    this.landMark = new T.Mesh(keep_(new T.CircleGeometry(0.32, 32).rotateX(-Math.PI / 2)), keep_(new T.MeshBasicMaterial({ map: keep_(glow("#ffe05a", true)), transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    this.landMark.renderOrder = 3;
    this.landMark.visible = false;
    this.scene.add(this.shadow, this.ring, this.landMark);
    const ghost = keep_(new T.SphereGeometry(0.02, 8, 6));
    for (let k = 0; k < 8; k++) {
      const m = new T.Mesh(ghost, keep_(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4 * (1 - k / 8), depthWrite: false })));
      m.visible = false;
      this.scene.add(m);
      this.trail.push(m);
    }
    // A word over the court while it is my serve (decoration: the status line says the same for readers).
    this.tip = document.createElement("div");
    this.tip.className = "tt-tip bd-tip";
    this.tip.setAttribute("aria-hidden", "true");
    this.tip.textContent = "화면을 위로 밀어 서브하세요 · 빠를수록 멀리 갑니다";
    this.tip.hidden = true;
    host.append(this.tip);
    // The jump button at the lower left: pressed, my player jumps; a swipe in the air is a smash.
    this.jumpButton = document.createElement("button");
    this.jumpButton.type = "button";
    this.jumpButton.className = "bd-jump";
    this.jumpButton.setAttribute("aria-label", "점프 (공중에서 밀면 스매싱)");
    this.jumpButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 8h-4.5v8h-5v-8H5z" fill="currentColor"/></svg><span>점프</span>`;
    this.jumpButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.leap();
    });
    this.jumpButton.addEventListener("click", (e) => e.preventDefault());
    host.append(this.jumpButton);
    // My racket follows the pointer (the user asked): the mouse over the court, or a finger while it stays on the screen.
    el.addEventListener("pointerdown", (e) => {
      this.pointer = { clientX: e.clientX, clientY: e.clientY };
      if (!this.running()) return;
      el.setPointerCapture?.(e.pointerId);
      this.swipe = new SlideReader(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || e.buttons || this.swipe?.id === e.pointerId) this.pointer = { clientX: e.clientX, clientY: e.clientY };
      const swipe = this.swipe;
      if (!swipe || swipe.id !== e.pointerId) return;
      // Still held, a quick slide strikes too (the user asked: the finger need not be lifted each time).
      this.flick(swipe.move({ x: e.clientX, y: e.clientY, t: performance.now() }, this.height()));
    });
    const done = (e: PointerEvent) => {
      // A finger lifted lets the racket go back to turning toward the shuttle by itself; a mouse stays where it is.
      if (e.pointerType !== "mouse") this.pointer = null;
      const swipe = this.swipe;
      if (!swipe || swipe.id !== e.pointerId) return;
      this.swipe = null;
      if (e.type === "pointercancel") return;
      this.flick(swipe.release({ x: e.clientX, y: e.clientY, t: performance.now() }, this.height()));
    };
    el.addEventListener("pointerup", done);
    el.addEventListener("pointercancel", done);
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.pointer = null;
    });
    // The keyboard: ↑ a clear, ↓ a drop, ← and → a shot to that side, Space (or J) the jump.
    const KEYS: Record<string, [number, number]> = { ArrowUp: [0.82, 0], ArrowDown: [0.22, 0], ArrowLeft: [0.6, -0.35], ArrowRight: [0.6, 0.35] };
    el.addEventListener("keydown", (e) => {
      if (e.repeat || !this.running()) return;
      const key = KEYS[e.key];
      if (key) {
        e.preventDefault();
        this.stroke(key[0], key[1]);
      } else if (e.key === " " || e.key === "Spacebar" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        this.leap();
      }
    });
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  get animating() {
    return false;
  }
  setQuality(quality: "high" | "low") {
    super.setQuality(quality);
    if (!capable()) {
      this.renderer.setPixelRatio(1);
      this.resize();
    }
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.swipe = null;
  }
  private running() {
    // Over Wi-Fi a window open on one device does not stop the court for the others (a pause does, for all).
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && (!!this.live || !document.querySelector("dialog[open]"));
  }
  private newWorld() {
    return createWorld(1 + Math.floor(Math.random() * 2e9));
  }
  /** The canvas's height, in which a swipe's speed is reckoned. */
  private height() {
    return this.renderer.domElement.clientHeight || 1;
  }
  /** A swipe read as a stroke (`SlideReader`: let go, or a quick slide still held): its power and aim swing my racket. */
  private flick(slide: Slide | null) {
    if (slide) this.stroke(slide.power, slide.yaw);
  }
  /** Whether this device sends its strokes to the host instead of playing them itself (a guest over Wi-Fi). */
  private get guest() {
    return !!this.live && !this.live.host;
  }
  /** Whether this device holds a racket (one watching over Wi-Fi does not). */
  private get playing() {
    return !this.live || this.live.seat === 0 || this.live.seat === 1;
  }
  private stroke(power: number, yaw: number) {
    if (!this.running() || !this.playing) return;
    if (this.guest) {
      // Counted for the host, which swings my side with it (or serves, if it is my serve).
      this.swings++;
      this.lastSwipe = { power, yaw };
      this.swung++;
      this.lastPower = power;
      return;
    }
    if (swing(this.world, this.mine, power, yaw)) {
      this.swung++;
      this.lastPower = power;
    }
  }
  private leap() {
    if (!this.running() || !this.playing) return;
    if (this.guest) {
      if (!airborne(this.world, this.mine) && this.world.phase === "flying") this.jumps++;
      return;
    }
    if (jump(this.world, this.mine)) this.jumpButton.classList.add("on");
  }
  /**
   * Of my own player only the racket is drawn (semi first person, the user asked: no arm), still moved by the unseen
   * arm's swing; the other player whole. Done again when my side changes (over Wi-Fi).
   */
  private dress() {
    this.figures.forEach((f, side) => {
      const racket = f.racket;
      f.root.traverse((part) => {
        if (!(part instanceof T.Mesh)) return;
        let inRacket = false;
        for (let at: T.Object3D | null = part; at; at = at.parent) if (at === racket) inRacket = true;
        part.visible = side !== this.mine || inRacket;
        part.castShadow = part.visible;
      });
    });
  }
  /** Over Wi-Fi, my side read from the room every frame (it may be known only after the court is built, or change). */
  private sideCheck() {
    const live = this.live;
    if (!live) return;
    const mine: 0 | 1 = live.seat === 1 ? 1 : 0;
    if (mine === this.mine && this.seatKnown) return;
    this.seatKnown = true;
    this.mine = mine;
    this.dress();
    const me = this.world.players[mine];
    this.eye = { x: me.x, y: me.y, z: me.z };
    this.look = restingLook(me, mine);
  }
  private advance(now: number) {
    const real = Math.min(0.2, (now - this.last) / 1000),
      running = this.running(),
      live = this.live;
    this.last = now;
    this.sideCheck();
    // A quick slide whose finger has stopped on the screen strikes (no move comes to say so).
    if (this.swipe) this.flick(this.swipe.still(now, this.height()));
    if (live && !live.host) return this.followHost(now, real);
    if (running || (this.state && this.state.winner !== null && !this.paused)) {
      if (live) {
        // The host's court has a person on each side that has one (mine, a guest's), the computer on the others; a
        // guest's swipes and jumps are taken as its counts go up.
        for (const side of [0, 1] as const) {
          const by = live.control(side);
          this.world.people[side] = by === "me" || by === "remote";
          if (by === "remote" && running) this.taken[side] = takeInput(this.world, side, readInput(live.latest(side)), this.taken[side]);
        }
      }
      this.left += real;
      while (this.left >= DT) {
        this.left -= DT;
        this.hear(step(this.world, this.level), now, running);
      }
      if (running && this.state && this.state.winner === null && this.world.phase === "dead" && this.world.dead > DEAD_WAIT) serve(this.world, serverOf(this.state), fromRight(this.state));
    }
    // The host tells its court to the guests, paused or not (so that one coming back sees it).
    if (live?.host && this.state) live.tick(() => snapOf(this.world, this.counts), now);
    this.pose(now, real);
    this.redraw();
  }
  /**
   * A guest's frame: my swipes and jumps are sent to the host as counts, and the host's court is drawn a moment
   * behind; the sounds and words follow the court's counts.
   */
  private followHost(now: number, real: number) {
    const live = this.live as LiveGuest,
      playing = this.playing && this.running() && !live.paused;
    live.tick(() => (playing ? inputOf(this.swings, this.lastSwipe.power, this.lastSwipe.yaw, this.jumps) : null), now);
    const frame = live.frame(now),
      a = frame && readSnap(frame.a.data),
      b = frame && readSnap(frame.b.data);
    if (frame && a && b) {
      const t = frame.t,
        w = this.world,
        [x, y, z] = blend([a.shuttle.x, a.shuttle.y, a.shuttle.z], [b.shuttle.x, b.shuttle.y, b.shuttle.z], t);
      // The guest's court keeps its own clock at a fixed moment; each player's swing and stroke are set back from it.
      w.time = 10;
      w.shuttle = { x, y, z, vx: b.shuttle.vx, vy: b.shuttle.vy, vz: b.shuttle.vz };
      ([0, 1] as const).forEach((side) => {
        const [px, pz, py, vx, vz] = blend(
          [a.players[side].x, a.players[side].z, a.players[side].y, a.players[side].vx, a.players[side].vz],
          [b.players[side].x, b.players[side].z, b.players[side].y, b.players[side].vx, b.players[side].vz],
          t,
        );
        const p = w.players[side],
          q = b.players[side];
        Object.assign(p, { x: px, z: pz, y: py, vx, vz, vy: 0, struck: w.time - q.struck, high: q.high, swing: q.swing >= 0 ? { at: w.time - q.swing, power: 0, yaw: 0, smash: py > 0.04 } : null });
      });
      Object.assign(w, { phase: b.phase, server: b.server, hitter: b.hitter, served: b.served, netted: b.netted, even: b.even, people: [true, true] });
      this.heardFrom(b.counts, now);
    }
    this.pose(now, real);
    this.redraw();
  }
  /** A guest hears the host's court: each count gone up since it last heard is a sound (and a smash a word). */
  private heardFrom(counts: Counts, now: number) {
    const was = this.heard_;
    this.heard_ = { ...counts, smashes: [...counts.smashes] as [number, number] };
    if (!was) return;
    if (counts.hits > was.hits) this.knock("disc", 0.5, now);
    if (counts.lands > was.lands) this.knock("cushion", 0.5, now);
    if (counts.nets > was.nets) this.knock("pocket", 0.5, now);
    for (const side of [0, 1] as const) if (counts.smashes[side] > was.smashes[side]) this.say("스매싱!", side === this.mine ? "#ff8a3a" : "#9fd0ff", now, this.world.shuttle.x, side);
  }
  private hear(events: Happening[], now: number, running: boolean) {
    for (const event of events) {
      // Counted for the guests, who make their own sounds and words of them.
      const c = this.counts;
      if (event.kind === "hit") [c.hits, c.smashes[event.side]] = [c.hits + 1, c.smashes[event.side] + (event.smash ? 1 : 0)];
      else if (event.kind === "land") c.lands++;
      else if (event.kind === "net") c.nets++;
      if (event.kind === "hit") {
        this.knock("disc", Math.max(0.25, event.strength), now);
        if (event.smash) {
          this.say("스매싱!", event.side === this.mine ? "#ff8a3a" : "#9fd0ff", now, this.world.shuttle.x, event.side);
          // My smash shakes the eye a moment.
          if (event.side === this.mine && !this.reducedMotion) this.shook = now;
        }
      } else if (event.kind === "land") this.knock("cushion", 0.3 + event.strength * 0.5, now);
      else if (event.kind === "net") this.knock("pocket", 0.5, now);
      else if (event.kind === "point" && running && this.state?.winner === null) {
        this.say(WHY[event.why], event.to === this.mine ? "#ffd34a" : "#9fd0ff", now, 0, sideOfWord(this.world));
        this.onMove({ from: -1, to: event.to, extra: event.why });
      }
    }
  }
  private knock(kind: "disc" | "cushion" | "pocket", strength: number, now: number) {
    if (now - this.heard < 30) return;
    this.heard = now;
    this.onKnock?.(kind, strength);
  }
  /** A word that rises over the net (or over the striker) and fades. */
  private say(text: string, colour: string, now: number, x = 0, side: 0 | 1 = 1) {
    if (capturing()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const pen = canvas.getContext("2d")!;
    pen.font = '900 84px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = 16;
    pen.strokeStyle = "rgba(12, 18, 36, 0.85)";
    pen.strokeText(text, 256, 66, 490);
    pen.fillStyle = colour;
    pen.fillText(text, 256, 66, 490);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthTest: false }));
    sprite.scale.set(2.6, 0.65, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    // Over the striker's half, a little toward the far side of whoever looks.
    const toward = this.mine === 0 ? 1 : -1;
    this.words.push({ sprite, at: now, x: Math.max(-1.5, Math.min(1.5, x)), y: 2.6, z: side === this.mine ? toward : -1.5 * toward });
  }
  private pose(now: number, real: number) {
    const w = this.world,
      s = w.shuttle;
    // The shuttle, nose first along its way (at rest, nose down); drawn larger far off so that it never shrinks to a speck.
    this.shuttle.position.set(s.x, Math.max(0.012, s.y), s.z);
    const far = this.camera.position.distanceTo(this.shuttle.position),
      grow = Math.min(5, Math.max(1.4, far / 2.2));
    this.shuttle.scale.setScalar(grow);
    const v = new T.Vector3(s.vx, s.vy, s.vz);
    if (v.lengthSq() > 0.04 && (w.phase === "flying" || s.y > 0.02)) this.shuttle.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), v.normalize());
    else if (w.phase === "ready") this.shuttle.quaternion.identity();
    else this.shuttle.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI / 2.2);
    this.shadow.position.set(s.x, 0.004, s.z);
    this.shadow.scale.setScalar(grow * (1 + s.y * 0.25));
    (this.shadow.material as T.MeshBasicMaterial).opacity = 0.55 / (1 + s.y * 0.6);
    const flying = w.phase === "flying";
    if (real > 0) {
      this.trailAt.unshift(this.shuttle.position.clone());
      this.trailAt.length = Math.min(this.trailAt.length, this.trail.length + 1);
    }
    this.trail.forEach((ghost, k) => {
      const at = this.trailAt[k + 1];
      ghost.visible = flying && !!at && !capturing() && at.distanceTo(this.shuttle.position) > 0.06;
      if (ghost.visible) {
        ghost.position.copy(at);
        ghost.scale.setScalar(grow * (1 - k * 0.08));
      }
    });
    // The players: where they stand and how high they jump, facing the net, posed by their run and their stroke.
    w.players.forEach((p, side) => {
      const f = this.figures[side],
        since = w.time - p.struck,
        swingAt = p.swing ? w.time - p.swing.at : -1,
        // The computer waits to serve with its racket low; mine stays held up in front of me until I swing (low, it
        // would look like a racket lying on the floor from my eye).
        serving = w.phase === "ready" && w.server === side && side === 1;
      f.root.position.set(p.x, p.y, p.z);
      f.body.rotation.y = side === 0 ? Math.PI : 0;
      // A stroke: the swing's wind-up while it looks for the shuttle, then its follow-through once struck.
      let phase = 0,
        high = p.high;
      if (swingAt >= 0) {
        phase = Math.min(0.34, (swingAt / SWING) * 0.34);
        high = s.y > 1.5 || airborne(w, side as 0 | 1);
      } else if (since >= 0 && since < 0.4) phase = 0.34 + (since / 0.4) * 0.66;
      pose(f, { speed: Math.hypot(p.vx, p.vz), air: p.y, swing: phase, high, dt: real, serve: serving || (since < 0.4 && w.served && w.hitter === side), lean: (side === 0 ? 1 : -1) * Math.max(-1, Math.min(1, p.vx / 4)) });
      // The racket turns toward the shuttle as it comes near this player (low, to the side, high), and swings through
      // that way: up from below for a low one, down from above for a high one. A serve keeps its own underarm pose.
      if (serving) return;
      const turned = side === 0 ? -1 : 1,
        shoulder = new T.Vector3(p.x + turned * SHOULDER.x, p.y + SHOULDER.y, p.z),
        coming = flying && w.hitter !== side && !w.netted,
        near = Math.hypot(s.x - p.x, s.z - p.z),
        weight = coming ? Math.max(0, Math.min(1, (3.6 - near) / 2.2)) : swingAt >= 0 || (since >= 0 && since < 0.4) ? 1 : 0,
        to = new T.Vector3(s.x - shoulder.x, s.y - shoulder.y, s.z - shoulder.z);
      // Into the body's own frame (it faces +z; mine is turned round to face the net).
      to.set(to.x * turned, to.y, to.z * turned);
      if (to.lengthSq() < 1e-4) to.set(0, 1, 0.3);
      to.normalize();
      const held = side === this.mine && this.playing ? this.pointed(shoulder) : null,
        toward = held ? new T.Vector3(held.x * turned, held.y, held.z * turned) : weight > 0 ? new T.Vector3(-0.3, 0.78, 0.55).normalize().lerp(to, weight).normalize() : null;
      // The swing: wound up while it waits for the shuttle (to about 0.4), through the shuttle at the stroke, followed through after.
      const stroke = swingAt >= 0 ? Math.min(0.4, (swingAt / SWING) * 0.4) : since >= 0 && since < 0.4 ? 0.45 + (since / 0.4) * 0.55 : null;
      aimArm(f, stroke !== null && since >= 0 && since < 0.4 && swingAt < 0 ? this.lastAim[side] ?? toward : toward, stroke, stroke !== null && swingAt < 0 ? p.high : s.y > 1.55 || airborne(w, side as 0 | 1));
      if (stroke === null || swingAt >= 0) this.lastAim[side] = toward?.clone() ?? null;
    });
    // My reach: a glow round the shuttle while my racket can meet it; at the easiest level, where it will come down.
    const me = w.players[this.mine],
      can = this.playing && inReach(w, this.mine) && !capturing(),
      fade = 1 - Math.exp(-(real || 0) / 0.06);
    this.reachShown += ((can ? 1 : 0) - this.reachShown) * (real > 0 ? fade : 1);
    // In flight a soft orange glow keeps the white shuttle in sight against the light walls; lime and bright in reach.
    const glowing = flying && !capturing(),
      halo = this.halo.material as T.SpriteMaterial;
    this.halo.visible = glowing || this.reachShown > 0.03;
    this.halo.position.copy(this.shuttle.position);
    this.halo.scale.setScalar((0.2 + 0.1 * this.reachShown) * grow);
    halo.color.setRGB(1 - this.reachShown * 0.2, 0.55 + this.reachShown * 0.45, 0.25 + this.reachShown * 0.1);
    halo.opacity = Math.max(glowing ? 0.55 : 0, this.reachShown);
    const coming = flying && w.hitter !== this.mine && this.level === "easy" && !this.live && !capturing();
    if (coming) {
      const way = path(w),
        endAt = way[way.length - 1];
      if (endAt && endAt.z > 0) this.landMark.position.set(endAt.x, 0.008, endAt.z);
      this.landMark.visible = !!endAt && endAt.z > 0;
    } else this.landMark.visible = false;
    // The eye goes with my player's head (eased, so that a quick step does not jerk it) and up with its jump; it looks up
    // after a shuttle coming high over me; a smash of mine shakes it a moment.
    const ease = real > 0 ? 1 - Math.exp(-real * 9) : 1;
    this.eye.x += (me.x - this.eye.x) * ease;
    this.eye.z += (me.z - this.eye.z) * ease;
    this.eye.y += (me.y - this.eye.y) * (real > 0 ? 1 - Math.exp(-real * 20) : 1);
    // The eye follows the shuttle while it flies, wherever it is (high, near the floor, far), and between rallies looks
    // down the court; quickly enough to keep up with a smash, eased so that it does not jerk.
    const aspect = this.camera.aspect,
      goal = flying || (w.phase === "dead" && s.y > 0.05) ? lookToward(this.eye, s, aspect, this.mine) : restingLook(this.eye, this.mine),
      follow = real > 0 ? 1 - Math.exp(-real * (flying ? 7 : 3)) : 1;
    this.look.x += (goal.x - this.look.x) * follow;
    this.look.y += (goal.y - this.look.y) * follow;
    this.look.z += (goal.z - this.look.z) * follow;
    const since = (now - this.shook) / 1000,
      shake = this.shook >= 0 && since < 0.3 ? (1 - since / 0.3) * 0.05 : 0;
    courtCamera(this.camera, aspect, this.eye, this.look, { x: shake * Math.sin(now * 0.09), y: shake * Math.cos(now * 0.11) }, this.mine);
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 1300;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.set(word.x, word.y + p * 0.5, word.z);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
    // The word over the court: my serve; or, for a shuttle coming high over me, the jump that smashes it.
    const mine = this.playing && w.phase === "ready" && w.server === this.mine,
      high = this.playing && this.running() && smashable(w, this.mine) && !airborne(w, this.mine);
    // The jump button pulses only when a jump begun now meets the shuttle in the air (the moment for the smash).
    const now_ = high && jumpNow(w, this.mine);
    this.tip.textContent = mine ? "화면을 위로 밀어 서브하세요 · 빠를수록 멀리 갑니다" : now_ ? "지금 점프! 그리고 밀면 스매싱" : "높이 떴습니다! 점프 버튼이 깜박이면 뛰세요";
    this.tip.hidden = !(this.running() && (mine || high)) || capturing();
    const canJump = this.playing && this.running() && flying && !airborne(w, this.mine);
    this.jumpButton.classList.toggle("hint", now_ && !capturing());
    this.jumpButton.classList.toggle("on", airborne(w, this.mine));
    this.jumpButton.classList.toggle("off", !canJump && !airborne(w, this.mine));
    this.jumpButton.hidden = capturing() || !this.state || this.state.winner !== null;
    // For the browser tests: where the shuttle and the players are, and how the point stands.
    const data = this.renderer.domElement.dataset;
    data.shuttle = `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`;
    data.me = `${me.x.toFixed(2)},${me.y.toFixed(2)},${me.z.toFixed(2)}`;
    // Both players (red;blue), for the Wi-Fi browser tests.
    data.players = w.players.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(";");
    data.phase = w.phase;
    data.server = String(w.server);
    data.hitter = String(w.hitter);
    data.reach = can ? "1" : "0";
    data.smashable = high ? "1" : "0";
    data.jumpnow = now_ ? "1" : "0";
    data.swung = String(this.swung);
    data.power = this.lastPower.toFixed(2);
  }
  /**
   * The way (in the court's frame) from my shoulder to where the pointer points: the point under it at a racket's reach
   * from the shoulder (a sphere round it, its near side if that is in front, else its far side), or, where the ray passes
   * outside that reach, the ray's nearest point. Null without a pointer.
   */
  private pointed(shoulder: T.Vector3) {
    if (!this.pointer || capturing()) return null;
    aim(this.pointerRay, this.pointer as PointerEvent, this.renderer.domElement, this.camera);
    const { origin, direction } = this.pointerRay.ray,
      reach = 1.15,
      to = origin.clone().sub(shoulder),
      b = to.dot(direction),
      c = to.lengthSq() - reach * reach,
      disc = b * b - c;
    let t: number;
    if (disc >= 0) {
      const near = -b - Math.sqrt(disc),
        far = -b + Math.sqrt(disc),
        front = origin.clone().addScaledVector(direction, near);
      t = near > 0 && front.z < shoulder.z + 0.15 ? near : far;
    } else t = Math.max(0, -b);
    const way = origin.clone().addScaledVector(direction, t).sub(shoulder);
    return way.lengthSq() > 1e-4 ? way.normalize() : null;
  }
  protected subject(_aspect: number): TableSubject {
    return { half: HALF_W + 1, halfZ: HALF_L + 1, height: 2, lookY: 0, tilt: 0.4 };
  }
  protected resize() {
    super.resize();
    courtCamera(this.camera, this.camera.aspect, this.eye, this.look, undefined, this.mine);
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new match, known by the count of moves going back to nothing; the first point of all is served at once.
    const anew = state.ply === 0 && this.shown > 0;
    if (anew || !this.begun) {
      if (anew) this.world = this.newWorld();
      this.begun = true;
      serve(this.world, serverOf(state), fromRight(state));
      const me = this.world.players[this.mine];
      this.eye = { x: me.x, y: me.y, z: me.z };
      this.look = restingLook(me, this.mine);
    }
    // A guest's court ends no rally itself: the point the host told is said over the net here.
    if (this.live && !this.live.host && state.ply > this.shown && state.last !== null && state.why >= 0) this.say(WHY[state.why], state.last === this.mine ? "#ffd34a" : "#9fd0ff", performance.now(), 0, sideOfWord(this.world));
    this.shown = state.ply;
    this.pose(performance.now(), 0);
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    this.tip.remove();
    this.jumpButton.remove();
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
/** Over whose half a point's word stands: the loser's, where the shuttle came down. */
const sideOfWord = (w: World): 0 | 1 => (w.shuttle.z >= 0 ? 0 : 1);
