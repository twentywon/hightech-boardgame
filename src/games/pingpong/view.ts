import * as T from "three";
import { aim, block, capable, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { hall, paintFlip, tennisTable, type FlipBoard } from "./hall";
import { HAND_Y, liftFor, rallyCamera } from "./layout";
import { serverOf, type State } from "./rules";
import { BALL, BLADE, DT, FLOOR, HALF_L, HALF_W, PACE, WHY, contact, createWorld, highest, keep, place as placePaddle, serve, step, toss, type Meeting, type Happening, type Level, type World } from "./sim";

export const TABLE_TENNIS_COLORS: [string, string] = ["#e0402c", "#2a72e0"];
/** How long, in the hall's time, the ball of an ended rally is left to fall before the next serve. */
const DEAD_WAIT = 1.15;
const canvasTexture = (canvas: HTMLCanvasElement) => {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};
/** The ball's skin: orange with a faint seam round it and a small printed star, so that its spin can be seen. */
function ballSkin() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ff8a1c";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,190,120,0.45)";
  ctx.fillRect(0, 62, 256, 4);
  ctx.fillStyle = "#b34a00";
  ctx.font = '900 30px "Inter", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("★★★", 64, 40);
  ctx.fillText("WTG", 192, 88);
  return canvasTexture(c);
}
/** How quickly the eye rises for a high ball and comes down again (a critically damped spring, in the hall's time). */
const LIFT_RATE = 7;
/** The contact marker's colour (a soft lime that stands out on the blue table and against the orange ball), its ring's size and the dots leading to it. */
const MARK = "#c8ff5c",
  MARK_SIZE = 0.17,
  MARK_DOTS = 14;
/** The contact marker's ring: a soft glow round an empty middle, so that the ball shows through it. */
function markRing() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(200,255,92,0)");
  g.addColorStop(0.5, "rgba(200,255,92,0)");
  g.addColorStop(0.62, "rgba(200,255,92,0.35)");
  g.addColorStop(0.72, "rgba(246,255,214,1)");
  g.addColorStop(0.8, "rgba(200,255,92,0.75)");
  g.addColorStop(1, "rgba(200,255,92,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}
/** A soft round dot, for the way to the contact marker. */
function markDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(246,255,214,1)");
  g.addColorStop(0.45, "rgba(200,255,92,0.8)");
  g.addColorStop(1, "rgba(200,255,92,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return canvasTexture(c);
}
/** A soft round shadow, for the ball's on the table or the floor. */
function blob() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(0,0,0,0.75)");
  g.addColorStop(0.55, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
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
 * A table tennis table in a club's hall, seen in the first person from behind my end: the blue table with its net,
 * the computer's paddle at the far end (held in a gloved hand) and mine near me, an orange ball with its shadow, and
 * round the court the barriers, the other tables, the banners and the umpire's flip scoreboard. The view plays the
 * rally in real time (`sim.ts`) and reports each point as a move; my paddle goes exactly where the hand is.
 */
export class TableTennisView extends TableView<State> {
  /** A knock to be heard: a paddle (`disc`), the table or the floor (`cushion`), the net (`pocket`). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private world: World = this.newWorld();
  /** How far across the eye stands now (it follows my step aside: `World.stance`). */
  private eye = 0;
  /** How far the eye has risen for a high ball (`liftFor`), and how fast it is rising. */
  private lift = 0;
  private liftV = 0;
  /**
   * The contact marker: a glowing ring where my blade will meet the coming ball (`contact` in the sim) and dots along
   * the ball's way to it, faded in while a ball is coming and out once it is struck or the point is over.
   */
  private ring: T.Sprite;
  private dots: T.Points;
  private markShown = 0;
  private marked: Meeting | null = null;
  /** Where on the screen the pointer that holds my paddle is (a mouse over the table, or a finger pressed), to be aimed again through the eye as it moves. */
  private pointer: { clientX: number; clientY: number } | null = null;
  private aimRay = new T.Raycaster();
  private aimHit = new T.Vector3();
  private ball: T.Mesh;
  private shadow: T.Mesh;
  /** A faint trail of where the ball was over the last frames, so that its way can be read. */
  private trail: T.Mesh[] = [];
  private trailAt: T.Vector3[] = [];
  private paddles: T.Group[] = [];
  private flip: FlipBoard;
  private flipped = "";
  private words: Word[] = [];
  private tip: HTMLElement;
  /** Where the hand has my paddle go, and where it was sent at the end of the last frame (the way between is swept). */
  private hand = { x: 0, z: HALF_L + 0.35 };
  private sent = { x: 0, z: HALF_L + 0.35 };
  /** The keyboard's arrows held, and a stroke it has set off (Space), as the wall clock's start of it. */
  private keys = { x: 0, z: 0 };
  private lunge = -1;
  private lungeSent = 0;
  private paused = false;
  private begun = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private heard = 0;
  /** Whether the press under way is a finger's (or a pen's) rather than a mouse's. */
  private finger = false;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
  ) {
    super(host, quality, "#cfd6de");
    // Where the processor draws the picture alone, a real-time table keeps to one pixel a point, or it falls to a frame a second.
    if (!capable()) this.renderer.setPixelRatio(1);
    this.scene.add(new T.HemisphereLight("#f4f6ff", "#6b4a35", 1.35));
    const lamp = new T.SpotLight("#fff6e4", 26, 0, 0.62, 0.55, 1.2);
    lamp.position.set(0.4, 5.2, 0.6);
    lamp.target.position.set(0, 0, -0.1);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    const fill = new T.DirectionalLight("#ffffff", 0.8);
    fill.position.set(-3, 6, 6);
    this.scene.add(fill);
    const keep_ = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.flip = hall(this.scene, keep_).flip;
    this.scene.add(tennisTable(keep_));
    // The paddles: mine with its red rubber toward the net, the computer's toward me, held in a gloved hand.
    this.paddles = [this.paddle(false), this.paddle(true)];
    // The ball, with a star printed on it so that its spin shows, and the round shadow under it.
    this.ball = this.add(new T.SphereGeometry(BALL, 28, 18), keep_(glossy({ map: keep_(ballSkin()), roughness: 0.32, emissive: "#ff6a00", emissiveIntensity: 0.12 }, 0.5)));
    this.ball.castShadow = false;
    this.shadow = new T.Mesh(keep_(new T.CircleGeometry(BALL * 1.4, 24).rotateX(-Math.PI / 2)), keep_(new T.MeshBasicMaterial({ map: keep_(blob()), transparent: true, depthWrite: false })));
    this.shadow.renderOrder = 2;
    this.scene.add(this.shadow);
    const dot = keep_(new T.SphereGeometry(BALL * 0.7, 12, 8));
    this.ring = new T.Sprite(keep_(new T.SpriteMaterial({ map: keep_(markRing()), transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending })));
    this.ring.scale.setScalar(MARK_SIZE);
    this.ring.renderOrder = 18;
    this.ring.visible = false;
    const way = keep_(new T.BufferGeometry());
    way.setAttribute("position", new T.BufferAttribute(new Float32Array(MARK_DOTS * 3), 3));
    this.dots = new T.Points(way, keep_(new T.PointsMaterial({ map: keep_(markDot()), color: MARK, size: 0.034, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    this.dots.frustumCulled = false;
    this.dots.renderOrder = 17;
    this.dots.visible = false;
    this.scene.add(this.ring, this.dots);
    for (let k = 0; k < 7; k++) {
      const ghost = new T.Mesh(dot, keep_(new T.MeshBasicMaterial({ color: "#ff9a2e", transparent: true, opacity: 0.55 * (1 - k / 7), depthWrite: false })));
      ghost.visible = false;
      this.scene.add(ghost);
      this.trail.push(ghost);
    }
    // A word over the table while it is my serve (decoration: the status line says the same for readers).
    this.tip = document.createElement("div");
    this.tip.className = "tt-tip";
    this.tip.setAttribute("aria-hidden", "true");
    this.tip.textContent = "화면을 눌러 공을 띄우고, 떨어질 때 위로 휘둘러 치세요";
    this.tip.hidden = true;
    host.append(this.tip);
    // My paddle is moved over a plane at the height the ball is mostly met at.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -HAND_Y);
    const el = this.renderer.domElement,
      ray = new T.Raycaster(),
      hit = new T.Vector3();
    el.style.cursor = "none";
    // Heard before the table's own handler, so that a press knows what made it.
    el.addEventListener(
      "pointerdown",
      (e) => {
        this.finger = e.pointerType !== "mouse";
        this.pointer = { clientX: e.clientX, clientY: e.clientY };
      },
      { capture: true },
    );
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || e.buttons) this.pointer = { clientX: e.clientX, clientY: e.clientY };
      if (e.pointerType !== "mouse" || this.disposed || !this.running()) return;
      aim(ray, e, el, this.camera);
      if (ray.ray.intersectPlane(this.floor, hit)) this.reach(hit.x, hit.z);
    });
    const lift = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") this.pointer = null;
    };
    el.addEventListener("pointerup", lift);
    el.addEventListener("pointercancel", lift);
    el.addEventListener("pointerleave", () => (this.pointer = null));
    // The arrows go as the table is seen: up away from me, toward the net. Space tosses my serve, or strikes.
    const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    el.addEventListener("keydown", (e) => {
      const way = ARROWS[e.key];
      if (way) {
        e.preventDefault();
        this.pointer = null;
        if (way[0]) this.keys.x = way[0];
        if (way[1]) this.keys.z = way[1];
      } else if ((e.key === " " || e.key === "Spacebar") && !e.repeat && this.running()) {
        e.preventDefault();
        if (!toss(this.world, 0)) this.lunge = performance.now();
      }
    });
    el.addEventListener("keyup", (e) => {
      const way = ARROWS[e.key];
      if (!way) return;
      if (way[0] && this.keys.x === way[0]) this.keys.x = 0;
      if (way[1] && this.keys.z === way[1]) this.keys.z = 0;
    });
    el.addEventListener("blur", () => (this.keys = { x: 0, z: 0 }));
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** A paddle: a wooden blade with red rubber on its face and black on its back, and a flared handle (held, for the computer). */
  private paddle(held: boolean) {
    const g = new T.Group(),
      blade = new T.Group(),
      core = this.standard({ color: "#d8b07a", roughness: 0.6 }),
      red = this.standard({ color: "#d22a20", roughness: 0.55 }),
      black = this.standard({ color: "#17181b", roughness: 0.6 }),
      handlePaint = this.standard({ color: "#c08a52", roughness: 0.55 }),
      disc = (radius: number, thick: number) => new T.CylinderGeometry(radius, radius, thick, 44).rotateX(Math.PI / 2).scale(1, 1.06, 1);
    this.add(disc(BLADE, 0.007), core, 0, 0, 0, blade);
    this.add(disc(BLADE * 0.975, 0.0025), red, 0, 0, 0.0045, blade);
    this.add(disc(BLADE * 0.975, 0.0025), black, 0, 0, -0.0045, blade);
    this.add(block(0.03, 0.105, 0.024, 0.008, 1), handlePaint, 0, -BLADE * 1.06 - 0.045, 0, blade);
    this.add(block(0.042, 0.026, 0.02, 0.006, 1), handlePaint, 0, -BLADE * 1.06 + 0.004, 0, blade);
    if (held) {
      // A glove round the handle, its thumb along the blade.
      const glove = this.standard({ color: "#f2f2f0", roughness: 0.7 });
      this.add(new T.SphereGeometry(0.036, 16, 12).scale(1.15, 1.35, 1), glove, 0, -BLADE * 1.06 - 0.05, -0.018, blade);
      this.add(new T.CapsuleGeometry(0.01, 0.05, 4, 8).rotateZ(0.35), glove, 0.016, -BLADE * 1.06 - 0.005, 0.016, blade);
      this.add(new T.CylinderGeometry(0.03, 0.026, 0.05, 14), this.standard({ color: "#1f5fc4", roughness: 0.7 }), 0, -BLADE * 1.06 - 0.11, -0.022, blade);
    }
    for (const part of blade.children) part.castShadow = true;
    g.add(blade);
    g.userData.blade = blade;
    this.scene.add(g);
    return g;
  }
  /** The table never makes the screen wait: a point may be reported at any moment. */
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
    this.keys = { x: 0, z: 0 };
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** A world of its own sequence; where the page asks for less motion I step aside only half as far. */
  private newWorld() {
    const world = createWorld(1 + Math.floor(Math.random() * 2e9));
    world.lean = this.reducedMotion ? 0.5 : 1;
    return world;
  }
  /**
   * The hand over the table: my paddle goes there, at no speed limit (and further to the side I have stepped to).
   * Held by a pointer, the hand is the point under it on the plane y = `HAND_Y`, and the blade keeps to the line of
   * sight through it (`World.sight`), wherever that line takes it.
   */
  private reach(x: number, z: number) {
    this.hand = this.pointer ? { x: Math.max(-8, Math.min(8, x)), z: Math.max(-12, Math.min(12, z)) } : keep(0, x, z, undefined, this.world.stance);
  }
  /**
   * The blade keeps to the line of sight through the pointer while one holds it; when it lets go (the keyboard, a
   * lifted finger, the mouse gone) the hand is set where the blade stands, so that nothing jumps.
   */
  private sighting() {
    const held = !!this.pointer && this.running(),
      pad = this.world.paddles[0];
    if (held) {
      const p = this.camera.position,
        fresh = !this.world.sight;
      this.world.sight = { x: p.x, y: p.y, z: p.z };
      // Taken up again (after a pause or a window): the hand is where the pointer is now.
      if (fresh) {
        aim(this.aimRay, this.pointer as PointerEvent, this.renderer.domElement, this.camera);
        if (this.aimRay.ray.intersectPlane(this.floor, this.aimHit)) {
          this.reach(this.aimHit.x, this.aimHit.z);
          this.sent = { ...this.hand };
        }
      }
    } else if (this.world.sight) {
      this.world.sight = null;
      this.hand = this.sent = keep(0, pad.x, pad.z, undefined, this.world.stance);
    }
  }
  /**
   * The eye goes where I stand, and rises for a high ball. The pointer stays over my paddle as it moves: the point
   * under it is aimed again through the moved eye; a paddle the keyboard (or a lifted finger) left is carried along
   * by the step.
   */
  private follow(real: number) {
    const goal = this.running() ? liftFor(highest(this.world)) : 0,
      dt = Math.min(0.05, real * PACE),
      a = LIFT_RATE * LIFT_RATE * (goal - this.lift) - 2 * LIFT_RATE * this.liftV;
    this.liftV += a * dt;
    this.lift = Math.max(0, this.lift + this.liftV * dt);
    const eye = this.world.stance,
      moved = eye - this.eye;
    if (Math.abs(moved) < 1e-5 && Math.abs(this.lift - this.lifted) < 1e-5) return;
    this.eye = eye;
    this.lifted = this.lift;
    rallyCamera(this.camera, this.camera.aspect, eye, this.lift);
    if (!this.running()) return;
    if (this.pointer) {
      aim(this.aimRay, this.pointer as PointerEvent, this.renderer.domElement, this.camera);
      if (this.aimRay.ray.intersectPlane(this.floor, this.aimHit)) this.reach(this.aimHit.x, this.aimHit.z);
    } else this.reach(this.hand.x + moved, this.hand.z);
  }
  /** The lift the camera was last set with. */
  private lifted = 0;
  /**
   * Every press is the hand's, and tosses my serve. A finger sets the paddle straight down where it presses (without
   * sweeping the way there); a mouse has it there already, and keeps its swing.
   */
  protected dragStart(_point: number, at: { x: number; z: number }) {
    if (!this.running()) return false;
    this.reach(at.x, at.z);
    this.sighting();
    if (this.finger) {
      placePaddle(this.world, 0, this.hand.x, this.hand.z);
      this.sent = { ...this.hand };
    }
    toss(this.world, 0);
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    if (this.running()) this.reach(at.x, at.z);
  }
  /** How far forward the keyboard's stroke has the paddle at `now`: out quickly, back slowly. */
  private lungeAt(now: number) {
    if (this.lunge < 0) return 0;
    const t = now - this.lunge;
    if (t < 90) return 0.32 * (t / 90);
    if (t < 320) return 0.32 * (1 - (t - 90) / 230);
    this.lunge = -1;
    return 0;
  }
  /** Runs the hall for the time that has passed since the last frame. */
  private advance(now: number) {
    // The hall keeps the wall clock's time down to five frames a second; slower than that it slows down with the screen.
    const real = Math.min(0.2, (now - this.last) / 1000),
      running = this.running();
    this.last = now;
    if (running || (this.state && this.state.winner !== null && !this.paused)) {
      this.follow(real);
      this.sighting();
      if (running && (this.keys.x || this.keys.z)) this.reach(this.hand.x + this.keys.x * 1.8 * real, this.hand.z + this.keys.z * 1.8 * real);
      this.left += real * PACE;
      // The hand's way over this frame is spread over its slices, so that the paddle sweeps it at its true speed.
      const slices = Math.floor(this.left / DT),
        from = this.sent,
        lunge = this.lungeAt(now);
      for (let k = 1; k <= slices; k++) {
        this.left -= DT;
        const share = k / slices;
        this.world.hands[0] = { x: from.x + (this.hand.x - from.x) * share, z: from.z + (this.hand.z - from.z) * share - (this.lungeSent + (lunge - this.lungeSent) * share) };
        this.hear(step(this.world, this.level), now, running);
      }
      if (slices) {
        this.sent = { ...this.hand };
        this.lungeSent = lunge;
      }
      // The ball of an ended rally falls for a moment; then the next point is served by whoever the rules say.
      if (running && this.state && this.state.winner === null && this.world.phase === "dead" && this.world.dead > DEAD_WAIT) serve(this.world, serverOf(this.state));
    }
    this.pose(now, real);
    this.redraw();
  }
  /** What the table has done: its knocks are heard, and a point won is told to the screen with a word over the net. */
  private hear(events: Happening[], now: number, running: boolean) {
    for (const event of events) {
      if (event.kind === "hit") {
        this.knock("disc", event.strength, now);
        if (event.smash) this.say("스매싱!", event.side === 0 ? "#ff8a3a" : "#9fd0ff", now, Math.max(-0.5, Math.min(0.5, this.world.ball.x)));
      }
      else if (event.kind === "bounce") this.knock("cushion", Math.min(1, event.strength / 3), now);
      else if (event.kind === "floor") this.knock("cushion", Math.min(0.6, event.strength / 4), now);
      else if (event.kind === "net") this.knock("pocket", 0.5, now);
      else if (event.kind === "let") this.say("렛 · 다시 서브", "#ffffff", now);
      else if (event.kind === "point" && running && this.state?.winner === null) {
        this.say(WHY[event.why], event.to === 0 ? "#ffd34a" : "#9fd0ff", now);
        this.onMove({ from: -1, to: event.to, extra: event.why });
      }
    }
  }
  private knock(kind: "disc" | "cushion" | "pocket", strength: number, now: number) {
    if (strength < 0.05 || now - this.heard < 35) return;
    this.heard = now;
    this.onKnock?.(kind, strength);
  }
  /** A word that rises over the net and fades. */
  private say(text: string, colour: string, now: number, x = 0) {
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
    sprite.scale.set(0.9, 0.225, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.words.push({ sprite, at: now, x, y: 0.42, z: -0.2 });
  }
  /** Puts the ball, its shadow and the paddles where the table has them. */
  private pose(now: number, real: number) {
    const { ball, paddles } = this.world;
    this.ball.position.set(ball.x, ball.y, ball.z);
    // Far off, the ball is drawn a little larger than it is, so that it never shrinks to a speck.
    const far = this.camera.position.distanceTo(this.ball.position),
      grow = Math.min(1.9, Math.max(1, far / 2.1));
    this.ball.scale.setScalar(grow);
    const flying = this.world.phase === "rally" || this.world.phase === "dead";
    if (real > 0) {
      this.trailAt.unshift(this.ball.position.clone());
      this.trailAt.length = Math.min(this.trailAt.length, this.trail.length + 1);
    }
    this.trail.forEach((ghost, k) => {
      const at = this.trailAt[k + 1];
      ghost.visible = flying && !!at && !capturing() && at.distanceTo(this.ball.position) > BALL * 2;
      if (ghost.visible) {
        ghost.position.copy(at);
        ghost.scale.setScalar(grow * (1 - k * 0.09));
      }
    });
    // The printed star turns with the spin, slowed so that the eye can follow it.
    const spin = new T.Vector3(ball.wx, ball.wy, ball.wz),
      turn = spin.length() * real * PACE * 0.12;
    if (turn > 1e-5) this.ball.rotateOnWorldAxis(spin.normalize(), turn);
    const over = Math.abs(ball.x) <= HALF_W && Math.abs(ball.z) <= HALF_L && ball.y >= -0.005,
      ground = over ? 0.0015 : FLOOR + 0.004,
      height = Math.max(0, ball.y - ground);
    this.shadow.position.set(ball.x, ground, ball.z);
    this.shadow.scale.setScalar(grow * (1 + height * 1.6));
    (this.shadow.material as T.MeshBasicMaterial).opacity = 0.75 / (1 + height * 4);
    paddles.forEach((pad, side) => {
      const g = this.paddles[side],
        blade = g.userData.blade as T.Group,
        f = side === 0 ? -1 : 1,
        since = this.world.time - this.world.struck[side],
        // A short follow-through after each stroke of the computer's (mine follows my hand alone).
        through = side === 1 && since >= 0 && since < 0.3 ? Math.sin((since / 0.3) * Math.PI) : 0;
      g.position.set(pad.x, pad.y, pad.z + f * through * 0.12);
      // Red toward the other end; the blade leans back a little, closes as it swings forward, and rolls to the side it is on.
      g.rotation.set(0, side === 0 ? Math.PI : 0, 0);
      blade.rotation.x = side === 0 ? -0.16 + Math.max(-0.45, Math.min(0.45, pad.vz * 0.05)) : 0.16 + through * 0.5;
      blade.rotation.z = (side === 0 ? 1 : -1) * Math.max(-0.75, Math.min(0.75, (pad.x - (side === 0 ? 0.1 : -0.1)) * 1.1));
    });
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 1300;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.set(word.x, word.y + p * 0.18, word.z);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
    this.markWay(real);
    this.tip.hidden = !(this.running() && this.world.phase === "ready" && this.world.server === 0) || capturing();
    // For the browser tests: where the ball and my paddle are, and how the point stands.
    const data = this.renderer.domElement.dataset;
    data.ball = `${ball.x.toFixed(2)},${ball.y.toFixed(2)},${ball.z.toFixed(2)}`;
    data.paddle = `${paddles[0].x.toFixed(2)},${paddles[0].z.toFixed(2)}`;
    // My blade's height too: on the screen it stands under the pointer at that height (`alongSight`).
    data.blade = `${paddles[0].x.toFixed(3)},${paddles[0].y.toFixed(3)},${paddles[0].z.toFixed(3)}`;
    data.lift = this.lifted.toFixed(4);
    data.contact = this.marked && this.markShown > 0.5 ? `${this.marked.x.toFixed(3)},${this.marked.y.toFixed(3)},${this.marked.z.toFixed(3)}` : "";
    data.phase = this.world.phase;
    data.server = String(this.world.server);
    // How far across the eye stands (browser tests aim through `rallyCamera` with it).
    data.eye = this.eye.toFixed(4);
  }
  /**
   * The contact marker, moved to where my blade will now meet the ball (it follows the prediction as my hand moves),
   * with dots along the ball's way to it; faded in while a ball is coming, out when it is struck or the point is over.
   * It is decoration: left out while a picture is captured, and shown only at the easiest level (the user asked).
   */
  private markWay(real: number) {
    const found = this.level === "easy" && this.running() && !capturing() ? contact(this.world) : null,
      fade = 1 - Math.exp(-(real || 0) / 0.09);
    if (found) this.marked = found;
    this.markShown += ((found ? 1 : 0) - this.markShown) * (real > 0 ? fade : 0);
    if (capturing() || !this.running()) this.markShown = found ? this.markShown : 0;
    const on = this.markShown > 0.02 && !!this.marked;
    this.ring.visible = this.dots.visible = on;
    if (!on || !this.marked) return;
    const mark = this.marked,
      breathe = this.reducedMotion ? 1 : 1 + 0.07 * Math.sin(performance.now() / 160);
    this.ring.position.set(mark.x, mark.y, mark.z);
    // A ring far off is drawn a little larger, like the ball, so that it does not shrink to a speck.
    const far = this.camera.position.distanceTo(this.ring.position);
    this.ring.scale.setScalar(MARK_SIZE * breathe * Math.min(1.6, Math.max(1, far / 2.1)));
    (this.ring.material as T.SpriteMaterial).opacity = this.markShown;
    (this.dots.material as T.PointsMaterial).opacity = 0.85 * this.markShown;
    // The dots: along the ball's way from a little ahead of it to the meeting (or, on a toss, down its column), the
    // last of them on the ring; none so close to the ball that it is hidden.
    // Fading out, the dots stay where they were last laid.
    if (!found) return;
    const at = this.dots.geometry.getAttribute("position") as T.BufferAttribute,
      { path, pathAt, ball } = this.world,
      points: T.Vector3[] = [];
    if (found.k >= 0) {
      const first = Math.max(0, pathAt + 1),
        span = found.k - first;
      for (let n = 1; n <= MARK_DOTS; n++) {
        const k = Math.round(first + (span * n) / MARK_DOTS);
        points.push(new T.Vector3(path[k * 4], path[k * 4 + 1], path[k * 4 + 2]));
      }
      // Where the ball will pass above the highest the blade goes, the last dots come down to the ring.
      const top = points[points.length - 1];
      if (top && top.y - mark.y > 0.04) for (let n = 1; n <= 3; n++) points.splice(points.length - n, 1, new T.Vector3(mark.x, mark.y + ((top.y - mark.y) * n) / 4, mark.z));
    } else {
      const drop = ball.y - mark.y;
      for (let n = 1; n <= MARK_DOTS && drop > 0.06; n++) points.push(new T.Vector3(mark.x, ball.y - (drop * n) / (MARK_DOTS + 1), mark.z));
    }
    const ballAt = this.ball.position,
      clear = BALL * this.ball.scale.x * 2.6;
    for (let n = 0; n < MARK_DOTS; n++) {
      const p = points[n];
      // A dot that would sit on the ball (or is not needed) is laid out of sight under the floor.
      if (!p || p.distanceTo(ballAt) < clear || p.distanceTo(this.ring.position) < MARK_SIZE * 0.3) at.setXYZ(n, 0, -50, 0);
      else at.setXYZ(n, p.x, p.y, p.z);
    }
    at.needsUpdate = true;
  }
  protected subject(aspect: number): TableSubject {
    return { half: HALF_W + 0.6, halfZ: HALF_L + 0.8, height: 0.4, lookY: 0, tilt: aspect > 1 ? 0.3 : 0.4 };
  }
  protected resize() {
    super.resize();
    rallyCamera(this.camera, this.camera.aspect, this.eye, this.lifted);
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
      this.hand = this.sent = { x: 0, z: HALF_L + 0.35 };
      serve(this.world, serverOf(state));
    }
    this.shown = state.ply;
    const said = `${state.score.join(":")}/${state.games.join(":")}`;
    if (said !== this.flipped) {
      this.flipped = said;
      paintFlip(this.flip, state.score, state.games);
    }
    this.pose(performance.now(), 0);
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    this.tip.remove();
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
