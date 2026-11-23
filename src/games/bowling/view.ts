import * as T from "three";
import { aim as aimRay, block } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot as TapSpot, type TableSubject } from "../table/view";
import { MASK, RETURN, ROOF, ballSkin, bowlingBall, buildAlley, holeParts, pinParts, type Alley } from "./alley";
import { BALL_Z, CHASE, START_X, bowlerCamera, swipe, zOf } from "./layout";
import { FRAMES, SPIN, SPIN_NAMES, START_MIN, marksOf, runningScores, throwMove, throwOf, total, type State } from "./rules";
import { BALL_R, DECK_END, DT, GUTTER, HEAD, LANE_HALF, LYING, OUT, PIN_H, ROW, START_D, createWorld, path, settled, step, type Pin, type Spot, type World } from "./sim";

export const BOWLING_COLORS: [string, string] = ["#2f6cf0", "#f0702f"];
/** The swirls of the two sides' balls. */
const SKINS: [string, string][] = [
  ["#1c3fb8", "#6fc8ff"],
  ["#c2361a", "#ffc23a"],
];
/** How long the pins are looked at once they rest, and how long the pinsetter takes to clear and set them. */
const HOLD = 450,
  RESET = 2600;
/** The pinsetter: the sweep bar's place before the deck, and the table that sets the pins, over the rack's middle. */
const SWEEP = { d: HEAD - 0.42, up: MASK.bottom + 0.35, down: 0.1 },
  SETTER = { d: HEAD + 1.5 * ROW, up: MASK.bottom + 0.5 };
/** Where the balls wait on the return's rails, one after the other. */
const slotOf = (k: number) => ({ x: RETURN.x, y: BALL_R + 0.07, z: RETURN.z + 0.72 + k * 0.24 });
const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** A pin's pose on the screen: where it stands or lies, how it leans. */
interface Pose {
  id: number;
  mode: number;
  x: number;
  d: number;
  tx: number;
  td: number;
  y: number;
}
const poseOf = (p: Pin): Pose => ({ id: p.id, mode: p.mode, x: p.x, d: p.d, tx: p.tx, td: p.td, y: p.y });
const upright = (s: Spot): Pose => ({ id: s.id, mode: 0, x: s.x, d: s.d, tx: 0, td: 0, y: 0 });
/** What the pinsetter does after a ball: clear the deck and set a full rack, or lift the pins standing, sweep the rest and set them down again. */
interface Reset {
  start: number;
  full: boolean;
  /** The pins as the ball left them, and the side whose ball comes back. */
  after: Pose[];
  thrown: number;
  /** Nothing is set again: the game is over. */
  final: boolean;
}
/**
 * A lane of the alley seen from behind the foul line. The ball is dragged sideways to where it is set, then swiped up
 * to throw it; the view runs the throw through the lane's physics (`sim.ts`), the eye going after the ball to the
 * pins, and the pinsetter then sweeps and sets them while the ball comes back through the return.
 */
export class BowlingView extends TableView<State> {
  /** What a throw is heard to do: roll (`cushion`, with its speed), strike pins (`disc`, how hard), drop into the gutter or the pit (`pocket`). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private alley: Alley;
  private pins: T.Mesh[] = [];
  /** Each side's ball, and the house balls waiting on the return. */
  private balls: T.Mesh[] = [];
  private sweepBar: T.Mesh;
  private setter: T.Group;
  private dots: T.Mesh[] = [];
  private spinMark: T.Mesh;
  private cursor: T.Mesh;
  private keyLight: T.DirectionalLight;
  private monitor = new T.Group();
  private face: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private pole: T.Mesh;
  /** Where each side sets its ball across the approach (the hand's choice, kept between balls). */
  private startX: [number, number] = [START_X, START_X];
  /** The throw being run, the pins it began at, and when the pins came to rest. */
  private world: World | null = null;
  private rolling = false;
  private restedAt = 0;
  private outAt = new Map<number, number>();
  private reset: Reset | null = null;
  private shift = 0;
  private ticker = 0;
  private sounded = { start: false, struck: false, gutter: false, gone: false, knocks: 0, at: 0 };
  /** The press under way, and the keyboard's aim and charge. */
  private press: { id: number; x: number; y: number; dx: number; dy: number; onBall: boolean; mode: "slide" | "swipe" | null } | null = null;
  private keyAngle = 0;
  private keyAimed = 0;
  private charge: number | null = null;
  private sight = new T.Raycaster();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai" = "ai",
  ) {
    super(host, quality, "#0c0a1c");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.add(new T.HemisphereLight("#cfc8ff", "#2a1d3a", 1.25));
    // The key light follows the eye down the lane, so that the ball and the pins near it cast their shadows.
    this.keyLight = new T.DirectionalLight("#fff3e2", 1.6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const cam = this.keyLight.shadow.camera;
    cam.left = cam.bottom = -3.2;
    cam.right = cam.top = 3.2;
    cam.near = 0.5;
    cam.far = 20;
    this.keyLight.shadow.normalBias = 0.02;
    this.own(this.keyLight.shadow);
    this.scene.add(this.keyLight, this.keyLight.target);
    // Over the pins, a light under the masking unit's edge; along the room, coloured lamps.
    const deck = new T.SpotLight("#fff1dc", 13, 6, 0.7, 0.6, 1.6);
    deck.position.set(0, MASK.bottom - 0.05, MASK.z + 0.1);
    deck.target.position.set(0, 0, zOf(HEAD + 0.5));
    deck.castShadow = true;
    deck.shadow.mapSize.set(512, 512);
    this.own(deck.shadow);
    this.scene.add(deck, deck.target);
    // Two lamps of colour over the lanes (each light costs every pixel, so there are few).
    for (const [x, z, colour, power] of [
      [-2.6, -4, "#ff6fd0", 8],
      [2.6, -9, "#5fe0ff", 8],
    ] as [number, number, string, number][]) {
      const lamp = new T.PointLight(colour, power, 16, 1.3);
      lamp.position.set(x, ROOF - 0.4, z);
      this.scene.add(lamp);
    }
    this.alley = buildAlley(this.scene, keep);
    // My lane's pins.
    const pin = pinParts(keep);
    for (let k = 0; k < 10; k++) {
      const mesh = new T.Mesh(pin.geometry, pin.material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.pins.push(mesh);
    }
    // The two sides' balls and two of the house's on the return.
    const sphere = keep(new T.SphereGeometry(BALL_R, 48, 32)),
      holes = holeParts(keep);
    [...SKINS, ["#127a4a", "#9dffcf"], ["#7a1f8f", "#ff9de0"]].forEach(([base, swirl], k) => {
      const ball = bowlingBall(keep, keep(ballSkin(base, swirl, 11 + k * 7)), holes, sphere);
      this.scene.add(ball);
      this.balls.push(ball);
      if (k >= 2) {
        const at = slotOf(k);
        ball.position.set(at.x, at.y, at.z);
        ball.rotation.set(0.4 * k, k, 0);
      }
    });
    // The pinsetter: the sweep bar and the table that sets the pins, both up inside the masking unit while idle.
    const machine = this.standard({ color: "#2a2c34", roughness: 0.4, metalness: 0.6 }),
      yellow = this.standard({ color: "#f2c230", roughness: 0.45, metalness: 0.2 });
    this.sweepBar = this.add(block(LANE_HALF * 2 + GUTTER * 2 - 0.04, 0.16, 0.05, 0.015), [machine, machine, yellow, machine, yellow, machine]);
    this.setter = new T.Group();
    this.add(block(LANE_HALF * 2 + 0.2, 0.05, 1.05, 0.02), machine, 0, 0.025, 0, this.setter);
    this.add(new T.BoxGeometry(LANE_HALF * 2 + 0.22, 0.02, 0.02), yellow, 0, 0.03, 0.53, this.setter);
    this.scene.add(this.setter);
    // The aiming dots, the spin shown on the lane before the ball, and the ring round the ball when it may be thrown.
    const dot = keep(new T.CircleGeometry(0.03, 16).rotateX(-Math.PI / 2)),
      dotPaint = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false }));
    for (let k = 0; k < 24; k++) {
      const mesh = new T.Mesh(dot, dotPaint);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      this.dots.push(mesh);
    }
    const hook = new T.Shape();
    hook.moveTo(-0.015, 0);
    hook.quadraticCurveTo(-0.02, 0.32, -0.16, 0.5);
    hook.lineTo(-0.2, 0.42);
    hook.lineTo(-0.21, 0.6);
    hook.lineTo(-0.05, 0.56);
    hook.lineTo(-0.12, 0.52);
    hook.quadraticCurveTo(0.025, 0.32, 0.015, 0);
    hook.closePath();
    this.spinMark = new T.Mesh(keep(new T.ShapeGeometry(hook).rotateX(-Math.PI / 2)), keep(new T.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.85, depthWrite: false, side: T.DoubleSide })));
    this.spinMark.renderOrder = 6;
    this.scene.add(this.spinMark);
    this.cursor = ringMesh(keep, BALL_R + 0.03, BALL_R + 0.055, "#ffd24a");
    this.scene.add(this.cursor);
    this.face = this.scoreScreen(keep);
    this.pole = this.add(new T.CylinderGeometry(0.025, 0.025, 1, 8), this.standard({ color: "#22232a", roughness: 0.4, metalness: 0.7 }));
    this.listen();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.frame(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The score screen over the approach: a dark case with its lit face, painted on a canvas. */
  private scoreScreen(keep: <R extends { dispose(): void }>(r: R) => R) {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 460;
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    const width = 1.6,
      height = 0.46;
    this.add(block(width + 0.08, height + 0.08, 0.07, 0.02), this.standard({ color: "#0b0c10", roughness: 0.4, metalness: 0.4 }), 0, 0, -0.04, this.monitor).castShadow = false;
    const lit = this.add(new T.PlaneGeometry(width, height), keep(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, 0, 0.001, this.monitor);
    lit.castShadow = lit.receiveShadow = false;
    this.scene.add(this.monitor);
    return { canvas, texture, said: "" };
  }
  /**
   * Stands the score screen where the bowler's eye sees it, square to it: over the middle of the lane at the top of
   * the view, or, on a short wide screen (a phone held sideways), in the upper right corner, where it leaves the
   * pins in sight.
   */
  private stand() {
    const eye = this.camera.clone();
    bowlerCamera(eye, 0);
    const short = this.host.clientHeight < 500 || eye.aspect > 1.9,
      top = short ? 0.135 : 0.095,
      depth = 3.2,
      tan = Math.tan((eye.fov * Math.PI) / 360),
      ratio = 1.6 / 0.46,
      // Its height as a share of the screen's, never wider than most of the screen (or of its right half on a phone).
      share = short ? Math.min(0.34, (0.43 * eye.aspect) / ratio) : Math.min(0.21, (0.7 * eye.aspect) / ratio),
      across = (share * ratio) / eye.aspect,
      centre = short ? 0.985 - across / 2 : 0.5,
      size = (share * 2 * depth * tan) / 0.46,
      ndc = new T.Vector3(centre * 2 - 1, 1 - (top + share / 2) * 2, 0.5).unproject(eye),
      ray = ndc.sub(eye.position).normalize(),
      forward = eye.getWorldDirection(new T.Vector3()),
      at = eye.position.clone().addScaledVector(ray, depth / ray.dot(forward));
    this.monitor.position.copy(at);
    this.monitor.quaternion.copy(eye.quaternion);
    this.monitor.scale.setScalar(size);
    this.monitor.updateMatrixWorld();
    const topAt = new T.Vector3(0, 0.27, 0).applyMatrix4(this.monitor.matrixWorld),
      rise = ROOF - topAt.y;
    this.pole.position.set(topAt.x, topAt.y + rise / 2, topAt.z);
    this.pole.scale.set(1, Math.max(0.01, rise), 1);
  }
  /** Paints the score screen: each side's frames with their marks and running scores, the frame being bowled lit. */
  /** Over Wi-Fi the score screen names the people. */
  protected seated() {
    if (this.state) this.paint(this.state);
  }
  private paint(state: State) {
    const names = !state.two ? ["나"] : (this.netNames ?? (this.mode === "ai" ? ["나", "컴퓨터"] : ["플레이어 1", "플레이어 2"])),
      said = JSON.stringify([names, state.frames, state.turn, state.frame, state.ball, state.winner, state.ply]);
    if (said === this.face.said) return;
    this.face.said = said;
    const ctx = this.face.canvas.getContext("2d")!,
      W = 1600,
      H = 460,
      font = (weight: number, size: number) => `${weight} ${size}px "Inter", "Noto Sans KR", sans-serif`;
    const field = ctx.createLinearGradient(0, 0, 0, H);
    field.addColorStop(0, "#14175a");
    field.addColorStop(1, "#0a0c33");
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, W, H);
    // A band of colour across the top, and the house's name and the lane.
    const band = ctx.createLinearGradient(0, 0, W, 0);
    band.addColorStop(0, "#ff3fb4");
    band.addColorStop(0.5, "#9b5bff");
    band.addColorStop(1, "#33e6ff");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, W, 8);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd23f";
    ctx.font = `italic ${font(900, 36)}`;
    ctx.fillText("STAR LANES", 30, 46);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = font(700, 28);
    ctx.fillText("LANE 7", 270, 47);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = font(700, 30);
    const thrown = state.last ? throwOf(state.last.move) : null,
      speed = thrown ? `공 속도 ${(thrown.speed * 3.6).toFixed(1)} km/h` : "";
    ctx.fillText(state.winner !== null ? `게임 종료${speed ? `  ·  ${speed}` : ""}` : `${state.frame + 1}프레임${speed ? `  ·  ${speed}` : ""}`, W - 30, 47);
    const rows = names.length,
      top = 88,
      rowH = rows === 1 ? 250 : 176,
      gap = rows === 1 ? 40 : 10,
      nameW = 230,
      frameW = 110,
      tenthW = 150,
      totalW = 140,
      left = 30;
    const frameX = (k: number) => left + nameW + k * frameW;
    names.forEach((name, side) => {
      const y = top + (rows === 1 ? 26 : 0) + side * (rowH + gap),
        frames = state.frames[side],
        scores = runningScores(frames),
        bowling = state.winner === null && state.turn === side;
      // The name, in the side's colour.
      ctx.fillStyle = bowling ? "rgba(255, 210, 63, 0.18)" : "rgba(255, 255, 255, 0.06)";
      ctx.fillRect(left, y, nameW - 8, rowH);
      ctx.fillStyle = BOWLING_COLORS[side];
      ctx.beginPath();
      ctx.arc(left + 34, y + rowH / 2, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = font(800, name.length > 4 ? 30 : 38);
      ctx.fillText(name, left + 62, y + rowH / 2 + 2);
      for (let k = 0; k < FRAMES; k++) {
        const x = frameX(k),
          w = k === FRAMES - 1 ? tenthW : frameW,
          lit = bowling && state.frame === k;
        ctx.fillStyle = lit ? "rgba(255, 210, 63, 0.22)" : "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(x, y, w - 4, rowH);
        ctx.strokeStyle = lit ? "#ffd23f" : "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = lit ? 4 : 2;
        ctx.strokeRect(x, y, w - 4, rowH);
        // The frame's number over its boxes.
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = font(700, 20);
        ctx.textAlign = "left";
        ctx.fillText(String(k + 1), x + 8, y + 20);
        // The small boxes for its balls at the top right, with their marks.
        const marks = marksOf(frames[k] ?? [], k),
          box = 38,
          count = k === FRAMES - 1 ? 3 : 2;
        for (let b = 0; b < count; b++) {
          const bx = x + w - 4 - (count - b) * box;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, y, box, box + 8);
          const mark = marks[b] ?? "";
          if (!mark) continue;
          ctx.textAlign = "center";
          ctx.fillStyle = mark === "X" ? "#ffd23f" : mark === "/" ? "#5fe6ff" : "#ffffff";
          ctx.font = font(900, mark === "X" || mark === "/" ? 34 : 28);
          ctx.fillText(mark, bx + box / 2, y + box / 2 + 6);
        }
        const score = scores[k];
        if (score !== null && frames[k]?.length) {
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffffff";
          ctx.font = font(800, rows === 1 ? 64 : 50);
          ctx.fillText(String(score), x + (w - 4) / 2, y + rowH * 0.66);
        }
      }
      // The total so far.
      const tx = frameX(FRAMES - 1) + tenthW + 6;
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(tx, y, totalW, rowH);
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = font(700, 20);
      ctx.fillText("TOTAL", tx + totalW / 2, y + 22);
      ctx.fillStyle = BOWLING_COLORS[side] === "#2f6cf0" ? "#8fb4ff" : "#ffb58a";
      ctx.font = font(900, rows === 1 ? 72 : 58);
      ctx.fillText(String(total(frames)), tx + totalW / 2, y + rowH * 0.6);
    });
    this.face.texture.needsUpdate = true;
    this.redraw();
  }
  private look() {
    bowlerCamera(this.camera, this.shift);
    // The key light keeps the part of the lane before the eye in its shadows.
    const focus = BALL_Z - this.shift - 3.4;
    this.keyLight.position.set(-1.6, 6.5, focus + 3.5);
    this.keyLight.target.position.set(0, 0, focus);
    this.keyLight.target.updateMatrixWorld();
    this.redraw();
  }
  protected resize() {
    super.resize();
    this.stand();
    this.look();
  }
  protected subject(): TableSubject {
    return { half: 1.2, halfZ: 2, height: 1, lookY: 0, tilt: 0.5 };
  }
  protected spots(): TapSpot[] {
    return [];
  }
  /** Whether a ball of mine may be thrown now: my turn, the lane at rest, nothing over the table. */
  private ready() {
    const state = this.state;
    return !!state && state.winner === null && !this.animating && this.marks.movable.length > 0 && !document.hidden && !document.querySelector("dialog[open]");
  }
  get animating() {
    return super.animating || this.rolling || !!this.reset;
  }
  /** Every press at the lane is the hand's: a drag of the ball sideways, or a swipe up that throws it. */
  protected dragStart() {
    return this.ready();
  }
  /** The ball's place on the screen, in page pixels, and how big it is there. */
  private ballOnScreen() {
    const el = this.renderer.domElement,
      box = el.getBoundingClientRect(),
      side = this.state?.turn ?? 0,
      at = new T.Vector3(this.startX[side], BALL_R, BALL_Z).project(this.camera),
      edge = new T.Vector3(this.startX[side] + BALL_R, BALL_R, BALL_Z).project(this.camera);
    return { x: box.left + ((at.x + 1) / 2) * box.width, y: box.top + ((1 - at.y) / 2) * box.height, r: Math.abs(edge.x - at.x) * box.width * 0.5 };
  }
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.press || !this.ready()) return;
      const ball = this.ballOnScreen(),
        onBall = Math.hypot(e.clientX - ball.x, e.clientY - ball.y) < Math.max(36, ball.r * 2.2);
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, onBall, mode: null };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer already gone.
      }
    });
    el.addEventListener("pointermove", (e) => {
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      press.dx = e.clientX - press.x;
      press.dy = e.clientY - press.y;
      if (!press.mode && Math.hypot(press.dx, press.dy) > 8) press.mode = press.onBall && (Math.abs(press.dx) > Math.abs(press.dy) * 0.9 || press.dy > 0) ? "slide" : press.dy < 0 ? "swipe" : null;
      if (press.mode === "slide") this.slideTo(e);
      this.aimShown();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      this.press = null;
      this.aimShown();
      if (cancelled || press.mode !== "swipe" || !this.ready()) return;
      const made = swipe(e.clientX - press.x, e.clientY - press.y, el.clientHeight || 1);
      if (made) this.bowl(made.speed, made.angle);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    // The keyboard: ← → set the ball across, A D (or Shift with the arrows) turn the aim, Space held and let go throws, S changes the spin.
    el.addEventListener("keydown", (e) => {
      if (!this.ready()) return;
      const side = this.state!.turn,
        key = e.key.toLowerCase(),
        turn = key === "a" || key === "ㅁ" || (e.shiftKey && e.key === "ArrowLeft") ? -1 : key === "d" || key === "ㅇ" || (e.shiftKey && e.key === "ArrowRight") ? 1 : 0;
      if (turn) {
        e.preventDefault();
        this.keyAngle = clamp(this.keyAngle + turn * 0.0008, -0.05, 0.05);
        this.keyAimed = performance.now();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        if (this.charge === null) this.setStart(this.startX[side] + (e.key === "ArrowLeft" ? -0.027 : 0.027));
        this.keyAimed = performance.now();
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (!e.repeat && this.charge === null) this.charge = performance.now();
      } else if ((key === "s" || key === "ㄴ") && !e.repeat) this.onMove({ from: -1, to: SPIN, extra: -1 });
      this.aimShown();
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key !== " " && e.key !== "Spacebar") || this.charge === null) return;
      e.preventDefault();
      const speed = this.charged(performance.now());
      this.charge = null;
      this.aimShown();
      if (this.ready()) this.bowl(speed, this.keyAngle);
    });
    el.addEventListener("blur", () => {
      this.charge = null;
      this.aimShown();
    });
  }
  /** The keyboard's charge: from slow to full speed in 1.4 seconds and back, over and over. */
  private charged(now: number) {
    const t = this.charge === null ? 0 : ((now - this.charge) / 1400) % 2;
    return 4 + 5.5 * (t < 1 ? t : 2 - t);
  }
  private setStart(x: number) {
    const side = this.state?.turn ?? 0;
    this.startX[side] = clamp(x, START_MIN, -START_MIN);
    if (this.state) this.place(this.state);
  }
  /** The ball follows the hand across the approach: where the line of sight meets the upright plane through the ball. */
  private slideTo(e: PointerEvent) {
    aimRay(this.sight, e, this.renderer.domElement, this.camera);
    const plane = new T.Plane(new T.Vector3(0, 0, 1), -BALL_Z),
      at = new T.Vector3();
    if (this.sight.ray.intersectPlane(plane, at)) this.setStart(at.x);
  }
  /** The aiming dots for the swipe or the keyboard's aim, along the first part of the ball's way. */
  private aimShown() {
    const state = this.state,
      el = this.renderer.domElement,
      side = state?.turn ?? 0;
    let aim: { speed: number; angle: number } | null = null;
    if (state && this.press?.mode === "swipe") aim = swipe(this.press.dx, this.press.dy, el.clientHeight || 1);
    else if (state && (this.charge !== null || performance.now() - this.keyAimed < 1600)) aim = { speed: this.charge !== null ? this.charged(performance.now()) : 7, angle: this.keyAngle };
    const shown =
      aim && state && !capturing() && this.ready()
        ? path({ x: this.startX[side], angle: aim.angle, speed: aim.speed, spin: state.spin[side] }, 1.5 + (aim.speed - 3.5) * 1.3, 0.42)
        : [];
    this.dots.forEach((dot, k) => {
      dot.visible = k < shown.length;
      if (dot.visible) dot.position.set(shown[k].x, 0.004, zOf(shown[k].d));
      (dot.material as T.MeshBasicMaterial).opacity = 0.9;
    });
    this.redraw();
  }
  /** Throws my ball: the move says where it was set, how it was aimed and how fast, and with what spin. */
  private bowl(speed: number, angle: number) {
    const state = this.state!,
      side = state.turn;
    this.onMove(throwMove({ x: this.startX[side], angle, speed, spin: state.spin[side] }));
  }
  sync(state: State, animate = true) {
    // A new throw while the pinsetter works (the computer's, or a new game): its work is cut short.
    if (this.reset && state !== this.state) this.endReset();
    if (this.rolling && state !== this.state) this.stopRoll();
    // A state laid out without its throw (a new game, a page shown again) is seen from behind the foul line.
    if (!animate) {
      this.shift = 0;
      this.look();
    }
    super.sync(state, animate);
  }
  protected animate(before: State, state: State) {
    const last = state.last,
      t = last ? throwOf(last.move) : null;
    if (!last || !t || state.ply !== before.ply + 1) return false;
    // The ball is carried to where it is set, then rolled.
    const side = last.side;
    const ball = this.balls[side],
      from = ball.position.clone(),
      to = new T.Vector3(t.x, BALL_R, zOf(START_D));
    this.startX[side] = t.x;
    this.world = createWorld(before.standing, t);
    this.rolling = true;
    this.outAt.clear();
    this.restedAt = 0;
    this.sounded = { start: false, struck: false, gutter: false, gone: false, knocks: 0, at: 0 };
    this.shift = 0;
    this.look();
    this.spinMark.visible = this.cursor.visible = false;
    for (const dot of this.dots) dot.visible = false;
    const carry = from.distanceTo(to) > 0.01 ? 380 : 0,
      began = performance.now() + carry;
    if (carry)
      this.tween(0, carry, (p) => {
        ball.position.lerpVectors(from, to, ease(p));
        ball.position.y = to.y + Math.sin(Math.PI * p) * 0.08;
      });
    // The world runs in step with the clock from `began`, in `frame`; meanwhile a long tween keeps the table busy.
    this.tween(carry, 20000, () => {});
    this.worldStart = began;
    return true;
  }
  private worldStart = 0;
  /** Runs everything that moves by itself: the throw, the pinsetter; the ceiling's strips pulse while anything moves. */
  private frame(now: number) {
    const aiming = !!this.press || this.charge !== null || (this.keyAimed > 0 && now - this.keyAimed < 1700);
    if (!this.rolling && !this.reset && !aiming) return;
    const glow = 1.5 + 0.4 * Math.sin(now / 700);
    this.alley.neon.forEach((paint, k) => (paint.emissiveIntensity = glow + 0.3 * Math.sin(now / 500 + k)));
    if (this.rolling && this.world && now >= this.worldStart) this.run(now);
    if (this.reset) this.resetting(now);
    if (aiming) this.aimShown();
    this.redraw();
  }
  /** The throw, in step with the clock: the ball, the pins, the eye going after the ball, and what is heard. */
  private run(now: number) {
    const world = this.world!,
      due = Math.floor((now - this.worldStart) / (DT * 1000));
    while (world.steps < due && !settled(world)) step(world);
    const ball = world.ball,
      mesh = this.balls[this.state?.last?.side ?? 0];
    // What is heard: the roll, the drop into the gutter, the crash of the pins, the knocks after.
    const s = this.sounded;
    if (!s.start) {
      s.start = true;
      this.onKnock?.("cushion", Math.min(1, Math.hypot(ball.vx, ball.vd) / 9.5));
    }
    if (!s.gutter && world.guttered >= 0) {
      s.gutter = true;
      this.onKnock?.("pocket", 0.4);
    }
    if (!s.struck && world.struck >= 0) {
      s.struck = true;
      s.knocks = world.knocks;
      s.at = now;
      this.onKnock?.("disc", Math.min(1, world.force / 8));
      world.force = 0;
    } else if (s.struck && world.knocks > s.knocks + 1 && now - s.at > 160) {
      s.knocks = world.knocks;
      s.at = now;
      this.onKnock?.("disc", Math.min(0.5, world.force / 12));
      world.force = 0;
    }
    if (!s.gone && ball.gone) {
      s.gone = true;
      this.onKnock?.("pocket", 0.8);
    }
    // The ball rolls, turning as far as it goes.
    const x = ball.x,
      z = zOf(ball.d),
      y = ball.gutter ? BALL_R - 0.045 : BALL_R,
      dx = x - mesh.position.x,
      dz = z - mesh.position.z,
      along = Math.hypot(dx, dz);
    if (along > 1e-5 && along < 1) mesh.rotateOnWorldAxis(new T.Vector3(-dz, 0, dx).normalize(), -along / BALL_R);
    // Past the deck it drops into the pit.
    mesh.position.set(x, y - Math.min(0.35, Math.max(0, ball.d - DECK_END) * 0.9), z);
    mesh.visible = !ball.gone;
    world.pins.forEach((p) => this.pose(this.pins[p.id - 1], poseOf(p), now));
    // The eye goes after the ball, as far as before the pins.
    this.shift = Math.max(this.shift, Math.min(CHASE, ball.d - START_D - 1.2));
    this.look();
    if (!settled(world)) return;
    if (!this.restedAt) this.restedAt = now;
    if (now - this.restedAt >= HOLD) this.finishRoll(now);
  }
  /** Lays a pin as a pose says: standing on its foot, leaning, or lying on the deck; gone into the pit, it drops out of sight. */
  private pose(mesh: T.Mesh, p: Pose, now: number) {
    mesh.visible = true;
    if (p.mode === OUT) {
      if (!this.outAt.has(p.id)) this.outAt.set(p.id, now);
      const fell = (now - this.outAt.get(p.id)!) / 1000;
      mesh.position.y = Math.max(-0.45, mesh.position.y - fell * fell * 4);
      mesh.visible = fell < 0.5;
      return;
    }
    let foot: [number, number],
      lean: number,
      ux: number,
      ud: number,
      height = p.y;
    if (p.mode === LYING) {
      ux = p.tx;
      ud = p.td;
      foot = [p.x - ux * PIN_H * 0.5, p.d - ud * PIN_H * 0.5];
      // On its belly and its head, the foot a little off the deck.
      lean = Math.PI / 2 + 0.12;
      height += 0.075;
    } else {
      lean = Math.hypot(p.tx, p.td);
      ux = lean > 1e-6 ? p.tx / lean : 1;
      ud = lean > 1e-6 ? p.td / lean : 0;
      foot = [p.x, p.d];
    }
    mesh.position.set(foot[0], height, zOf(foot[1]));
    // Turned about the level line across the way it leans: upright goes over toward (ux, 0, −ud).
    mesh.quaternion.setFromAxisAngle(new T.Vector3(-ud, 0, -ux).normalize(), lean);
  }
  /** The pins have rested: the pinsetter takes over, the eye stays a moment, then comes back. */
  private finishRoll(now: number) {
    const world = this.world!,
      state = this.state!;
    this.rolling = false;
    this.settleNow();
    // A full rack is set after the frame (or a strike or a spare in the tenth); else the pins standing are set down again.
    this.reset = { start: now, full: !!state.last?.reset, after: world.pins.map(poseOf), thrown: state.last?.side ?? 0, final: state.winner !== null };
    this.world = null;
    this.place(state);
    this.onSettled();
  }
  /** Stops a throw being run, as it is. */
  private stopRoll() {
    this.rolling = false;
    this.world = null;
  }
  /** The pinsetter's work after a ball, in step with the clock; the ball comes back meanwhile and the eye returns. */
  private resetting(now: number) {
    const r = this.reset!,
      state = this.state!,
      t = (now - r.start) / 1000,
      quick = this.reducedMotion ? 6 : 1;
    if (t * quick >= RESET / 1000) return this.endReset(true);
    const at = t * quick,
      phase = (a: number, b: number) => ease(clamp((at - a) / (b - a), 0, 1));
    // The eye stays on the pins a moment, then glides back to the foul line.
    const back = phase(1.15, 2.3);
    if (back > 0) this.shift = this.glideFrom * (1 - back);
    else this.glideFrom = this.shift;
    this.look();
    if (r.final) return;
    // The sweep bar drops before the deck, sweeps it back to the pit, returns and goes up.
    const keep = !r.full,
      drop = phase(0, 0.32),
      sweepOut = keep ? phase(1.05, 1.6) : phase(0.35, 0.95),
      sweepBack = keep ? phase(1.6, 1.9) : phase(0.95, 1.25),
      lift = phase(2.3, 2.55),
      barY = lerp(SWEEP.up, SWEEP.down, drop * (1 - lift)),
      barD = lerp(SWEEP.d, DECK_END + 0.05, sweepOut * (1 - sweepBack));
    this.sweepBar.position.set(0, barY, zOf(barD));
    // The setting table: down to take up the pins standing and back up, then down again to set them (or a full rack).
    const standing = new Set(state.standing.map((s) => s.id)),
      reach = PIN_H + 0.012,
      // Kept: down to the pins, up with them, down to set them, away. Full: down with a new rack, away.
      setterY = keep
        ? lerp(SETTER.up, reach, phase(0.35, 0.72)) + 0.32 * phase(0.75, 1.02) - 0.32 * phase(1.95, 2.25) + (SETTER.up - reach) * phase(2.28, 2.5)
        : lerp(SETTER.up, reach, phase(1.25, 1.9)) + (SETTER.up - reach) * phase(1.95, 2.25);
    this.setter.position.set(0, setterY, zOf(SETTER.d));
    const carried = (keep ? at >= 0.72 && at < 2.25 : at < 1.95) && setterY < SETTER.up;
    this.pins.forEach((mesh, k) => {
      const id = k + 1,
        before = r.after.find((p) => p.id === id),
        next = state.standing.find((s) => s.id === id);
      if (keep && next && standing.has(id) && before && before.mode === 0) {
        // Standing: taken up with the table and set down again where it stood.
        this.pose(mesh, upright(next), now);
        mesh.position.y = carried ? setterY - reach : 0;
        return;
      }
      if (!keep && at >= 1.2 && next) {
        // The new rack, hanging under the table as it comes down.
        this.pose(mesh, upright(next), now);
        mesh.position.y = carried ? setterY - reach : 0;
        mesh.visible = setterY - reach < MASK.bottom;
        return;
      }
      if (!before) {
        mesh.visible = false;
        return;
      }
      // Dead wood (and, at a frame's end, everything on the deck) is pushed back by the bar and drops into the pit.
      const p = { ...before },
        front = p.mode === LYING ? p.d - Math.abs(p.td) * PIN_H * 0.5 : p.d;
      if (barY < 0.4 && front < barD + 0.05 && sweepOut > 0 && sweepBack === 0) p.d += barD + 0.05 - front;
      if (p.mode !== OUT && p.d > DECK_END + 0.03) p.mode = OUT;
      this.pose(mesh, p, now);
      if (p.mode === OUT && mesh.visible) mesh.position.y = Math.min(mesh.position.y, 0);
      before.d = p.d;
      before.mode = p.mode;
    });
    // The ball comes back up through the return and rolls onto its rails; the next ball is carried to the approach.
    this.returning(at, r.thrown, state);
  }
  private glideFrom = 0;
  /** The ball thrown comes out of the return's hood and rolls to its place on the rails; the next to bowl is carried to its spot. */
  private returning(at: number, thrown: number, state: State) {
    const mouth = new T.Vector3(RETURN.x, BALL_R + 0.03, RETURN.z + 0.2),
      next = state.turn,
      spot = new T.Vector3(this.startX[next], BALL_R, BALL_Z);
    for (const side of state.two ? [0, 1] : [0]) {
      const ball = this.balls[side],
        slot = slotOf(side),
        rest = new T.Vector3(slot.x, slot.y, slot.z);
      let p: T.Vector3;
      if (side === thrown) {
        if (at < 0.9) {
          ball.visible = false;
          continue;
        }
        const out = ease(clamp((at - 0.9) / 0.6, 0, 1));
        p = mouth.clone().lerp(rest, out);
        if (out < 1) ball.rotateX(0.12);
      } else p = rest.clone();
      if (side === next) {
        const go = ease(clamp((at - 1.85) / 0.6, 0, 1));
        if (go > 0) {
          p = p.lerp(spot, go);
          p.y += Math.sin(Math.PI * go) * 0.35;
        }
      }
      ball.visible = true;
      ball.position.copy(p);
    }
  }
  /** The pinsetter's work is over (or cut short): the state is laid out as it stands. */
  private endReset(told = false) {
    const final = this.reset?.final ?? false;
    this.reset = null;
    if (!final || told) this.shift = 0;
    this.look();
    if (this.state) this.place(this.state);
    if (told) this.onSettled();
  }
  protected place(state: State) {
    this.paint(state);
    if (this.rolling || this.reset) return;
    // The pins standing for the next ball, upright where they stand; the rest are gone.
    const standing = new Map(state.standing.map((s) => [s.id, s]));
    this.pins.forEach((mesh, k) => {
      const s = standing.get(k + 1);
      mesh.visible = !!s;
      if (s) this.pose(mesh, upright(s), performance.now());
    });
    this.sweepBar.position.set(0, SWEEP.up, zOf(SWEEP.d));
    this.setter.position.set(0, SETTER.up, zOf(SETTER.d));
    // The ball of the side to bowl on its spot; the other's waits on the return.
    const side = state.turn;
    [0, 1].forEach((k) => {
      const ball = this.balls[k];
      ball.visible = k === 0 || state.two;
      if (k === side && state.winner === null) ball.position.set(this.startX[k], BALL_R, BALL_Z);
      else {
        const slot = slotOf(k);
        ball.position.set(slot.x, slot.y, slot.z);
      }
    });
    const spin = state.spin[side],
      ballX = this.startX[side];
    this.spinMark.visible = state.winner === null && spin !== 0 && !capturing();
    this.spinMark.position.set(ballX, 0.003, BALL_Z - 0.28);
    this.spinMark.scale.set(spin === 2 ? -1 : 1, 1, 1);
    this.renderer.domElement.dataset.standing = String(state.standing.length);
    this.renderer.domElement.dataset.spin = SPIN_NAMES[spin];
    this.mark(this.marks);
    this.redraw();
  }
  protected mark(marks: Marks) {
    const state = this.state,
      mine = !!state && state.winner === null && marks.movable.length > 0 && !this.animating && !capturing();
    this.cursor.visible = mine;
    if (state) this.cursor.position.set(this.startX[state.turn], 0.004, BALL_Z);
  }
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
