import * as T from "three";
import { aim, block, capable, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { hall, paintFlip, tennisTable, type FlipBoard } from "./hall";
import { HAND_Y, rallyCamera } from "./layout";
import { serverOf, type State } from "./rules";
import { BALL, BLADE, DEEP, DT, FLOOR, HALF_L, HALF_W, PACE, WHY, createWorld, keep, place as placePaddle, serve, step, toss, type Happening, type Level, type World } from "./sim";

export const TABLE_TENNIS_COLORS: [string, string] = ["#e0402c", "#2a72e0"];
/** How long, in the hall's time, the ball of an ended rally is left to fall before the next serve. */
const DEAD_WAIT = 1.15;
/**
 * How stiffly the eye follows my reach when I step back for a high ball or come forward again: a critically damped
 * spring of this rate (a second of the wall clock), so that it sets off and arrives gently and never overshoots.
 */
const EYE_RATE = 6.5;
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
  private world: World = createWorld(1 + Math.floor(Math.random() * 2e9));
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
  /**
   * How far back the eye stands now (metres behind its usual place: it follows my side's reach, `stepped`, as I
   * step back for a high ball and come forward again) and how fast it is going there.
   */
  private eye = 0;
  private eyeSpeed = 0;
  /** Where on the screen the mouse is, or a finger held down: aimed again through the eye whenever the eye moves. */
  private pointer: { clientX: number; clientY: number } | null = null;
  private still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    // My paddle is moved over a plane at the one height both blades are held at.
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
    // A finger lifted leaves the paddle where it was; a mouse that leaves the table too.
    for (const type of ["pointerup", "pointercancel", "pointerleave"] as const)
      el.addEventListener(type, (e) => {
        if (e.pointerType !== "mouse" || type === "pointerleave") this.pointer = null;
      });
    this.aimAgain = () => {
      if (!this.pointer) return false;
      aim(ray, this.pointer as PointerEvent, el, this.camera);
      if (ray.ray.intersectPlane(this.floor, hit)) this.reach(hit.x, hit.z);
      return true;
    };
    // The arrows go as the table is seen: up away from me, toward the net. Space tosses my serve, or strikes.
    const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    el.addEventListener("keydown", (e) => {
      const way = ARROWS[e.key];
      if (way) {
        e.preventDefault();
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
  /** Sets the hand again where the pointer now points through the eye (false when no pointer is over the table). */
  private aimAgain: () => boolean = () => false;
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
  /**
   * The hand over the table: my paddle goes there, at no speed limit. The hand may go as far back as I could ever
   * step; the table holds the paddle within the reach I have now (further back only while a high ball is coming).
   */
  private reach(x: number, z: number) {
    this.hand = keep(0, x, z, undefined, DEEP);
  }
  /**
   * The eye follows my reach back and forward like a player stepping back for a high ball: eased by a critically
   * damped spring, or (under reduced motion) set at once to where the reach is going. The hand moves with the body:
   * a pointer is aimed again through the moved eye, so that the paddle stays under it; without one (the keyboard,
   * a lifted finger) the hand is carried along by as much as the eye moved.
   */
  private follow(real: number, running: boolean) {
    const target = this.still ? this.world.deep[0] : this.world.stepped[0],
      was = this.eye;
    if (this.still) {
      this.eye = target;
      this.eyeSpeed = 0;
    } else
      for (let left = real; left > 1e-6; left -= 1 / 120) {
        const dt = Math.min(1 / 120, left);
        this.eyeSpeed += (EYE_RATE * EYE_RATE * (target - this.eye) - 2 * EYE_RATE * this.eyeSpeed) * dt;
        this.eye += this.eyeSpeed * dt;
      }
    if (Math.abs(target - this.eye) < 1e-4 && Math.abs(this.eyeSpeed) < 1e-3) {
      this.eye = target;
      this.eyeSpeed = 0;
    }
    if (this.eye === was) return;
    rallyCamera(this.camera, this.camera.aspect, this.eye);
    if (running && !this.aimAgain()) this.reach(this.hand.x, this.hand.z + (this.eye - was));
  }
  /**
   * Every press is the hand's, and tosses my serve. A finger sets the paddle straight down where it presses (without
   * sweeping the way there); a mouse has it there already, and keeps its swing.
   */
  protected dragStart(_point: number, at: { x: number; z: number }) {
    if (!this.running()) return false;
    this.reach(at.x, at.z);
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
    this.follow(real, running);
    this.pose(now, real);
    this.redraw();
  }
  /** What the table has done: its knocks are heard, and a point won is told to the screen with a word over the net. */
  private hear(events: Happening[], now: number, running: boolean) {
    for (const event of events) {
      if (event.kind === "hit") this.knock("disc", event.strength, now);
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
  private say(text: string, colour: string, now: number) {
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
    this.words.push({ sprite, at: now, x: 0, y: 0.42, z: -0.2 });
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
    this.tip.hidden = !(this.running() && this.world.phase === "ready" && this.world.server === 0) || capturing();
    // For the browser tests: where the ball and my paddle are, and how the point stands.
    const data = this.renderer.domElement.dataset;
    data.ball = `${ball.x.toFixed(2)},${ball.y.toFixed(2)},${ball.z.toFixed(2)}`;
    data.paddle = `${paddles[0].x.toFixed(2)},${paddles[0].z.toFixed(2)}`;
    data.step = this.eye.toFixed(3);
    data.reach = this.world.stepped[0].toFixed(3);
    data.phase = this.world.phase;
    data.server = String(this.world.server);
  }
  protected subject(aspect: number): TableSubject {
    return { half: HALF_W + 0.6, halfZ: HALF_L + 0.8, height: 0.4, lookY: 0, tilt: aspect > 1 ? 0.3 : 0.4 };
  }
  protected resize() {
    super.resize();
    rallyCamera(this.camera, this.camera.aspect, this.eye);
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new match, known by the count of moves going back to nothing; the first point of all is served at once.
    const anew = state.ply === 0 && this.shown > 0;
    if (anew || !this.begun) {
      if (anew) this.world = createWorld(1 + Math.floor(Math.random() * 2e9));
      this.begun = true;
      this.eye = this.eyeSpeed = 0;
      rallyCamera(this.camera, this.camera.aspect, 0);
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
