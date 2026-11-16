import * as T from "three";
import { aim, block, glossy } from "../../engine/scene-utils";
import { funfair } from "../../engine/scenery";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { GOALS, type State } from "./rules";
import { DT, GOAL, HALF_X, HALF_Z, MALLET, PUCK, aimAt, createWorld, keep, step, think, type World } from "./sim";
import { AIRHOCKEY_SUBJECT, GROUND, RAIL } from "./layout";

export const AIRHOCKEY_COLORS: [string, string] = ["#e0322a", "#2a6fe0"];
/** The playing surface: white with a field of tiny air holes, the red centre line, blue circles and the creases before the goals. */
function surface() {
  const W = 512,
    H = Math.round((W * HALF_Z) / HALF_X),
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    px = (x: number) => ((x + HALF_X) / (HALF_X * 2)) * W,
    pz = (z: number) => ((z + HALF_Z) / (HALF_Z * 2)) * H,
    unit = W / (HALF_X * 2);
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, W, H);
  // The air holes, in rows.
  ctx.fillStyle = "rgba(90,100,115,0.35)";
  for (let y = 6; y < H; y += 12) for (let x = (y / 12) % 2 ? 12 : 6; x < W; x += 12) ctx.fillRect(x, y, 1.6, 1.6);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#d8352c";
  ctx.beginPath();
  ctx.moveTo(0, pz(0));
  ctx.lineTo(W, pz(0));
  ctx.stroke();
  ctx.strokeStyle = "#2f6fd0";
  for (const z of [-HALF_Z * 0.5, HALF_Z * 0.5]) {
    ctx.beginPath();
    ctx.moveTo(0, pz(z));
    ctx.lineTo(W, pz(z));
    ctx.stroke();
  }
  ctx.strokeStyle = "#d8352c";
  ctx.beginPath();
  ctx.arc(px(0), pz(0), unit * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  // The creases before each goal.
  ctx.strokeStyle = "#2f6fd0";
  for (const end of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(px(0), pz(end * HALF_Z), unit * 1.2, end < 0 ? 0 : Math.PI, end < 0 ? Math.PI : Math.PI * 2);
    ctx.stroke();
  }
  ctx.font = `900 ${Math.round(unit * 0.32)}px "Inter", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(216,53,44,0.85)";
  ctx.fillText("AIR HOCKEY", px(0), pz(0));
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/**
 * An air hockey table in the amusement park (with the whack-a-mole machine and the claw machine), seen from my end:
 * a white surface full of air holes between padded rails, a goal slot at each end, an amber puck, my red mallet near
 * me and the computer's blue one far off, and a lit scoreboard over the far end. The view plays the table in real
 * time (`sim.ts`) and reports each goal as a move.
 */
export class AirHockeyView extends TableView<State> {
  private world: World = createWorld(0, 0);
  private puck: T.Group;
  private mallets: T.Group[] = [];
  private led: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private fair: { wheel: T.Group; bulbs: T.MeshStandardMaterial[] };
  /** Seconds before the puck is let go after a goal; keys held; the last frame; time owed to the table. */
  private wait = 0.9;
  private keys = { x: 0, z: 0 };
  private last = performance.now();
  private left = 0;
  private paused = false;
  private frame = 0;
  private clicked = 0;
  private ticker = 0;
  private shown = 0;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
  ) {
    super(host, quality, "#d8efff");
    this.scene.add(new T.HemisphereLight("#fff6e8", "#40305a", 1.6));
    const sun = new T.DirectionalLight("#fff2dc", 2.0);
    sun.position.set(-3, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
    sun.shadow.camera.right = sun.shadow.camera.top = 7;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    const keep_ = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The amusement park round it (the same as the other arcade machines'); its wheel turns and its bulbs twinkle.
    this.fair = funfair(this.scene, keep_, GROUND);
    // The table: the white surface, padded rails with the goal slots, a blue body on four legs.
    const field = this.add(new T.PlaneGeometry(HALF_X * 2, HALF_Z * 2).rotateX(-Math.PI / 2), this.standard({ map: keep_(surface()), roughness: 0.25 }), 0, 0, 0);
    field.castShadow = false;
    const rail = keep_(glossy({ color: "#1f4fae", roughness: 0.35 }, 0.5)),
      pad = this.standard({ color: "#14171c", roughness: 0.6 }),
      body = this.standard({ color: "#1b3d86", roughness: 0.5 }),
      chrome = this.standard({ color: "#d7dde4", roughness: 0.25, metalness: 0.85 }),
      W = RAIL.width,
      high = RAIL.high;
    for (const sx of [-1, 1]) this.add(block(W, high, HALF_Z * 2 + W * 2, 0.06), rail, sx * (HALF_X + W / 2), high / 2, 0);
    for (const sz of [-1, 1]) {
      const wing = HALF_X - GOAL;
      for (const sx of [-1, 1]) this.add(block(wing, high, W, 0.06), rail, sx * (GOAL + wing / 2), high / 2, sz * (HALF_Z + W / 2));
      // The goal slot: a dark mouth in the end rail, and the chute under it.
      this.add(new T.BoxGeometry(GOAL * 2, high * 0.5, W), pad, 0, high * 0.75, sz * (HALF_Z + W / 2)).castShadow = false;
      this.add(new T.BoxGeometry(GOAL * 2 + 0.1, 0.4, 0.5), pad, 0, -0.25, sz * (HALF_Z + 0.35)).castShadow = false;
    }
    // A thin black pad along the rails' inner faces.
    for (const sx of [-1, 1]) this.add(new T.BoxGeometry(0.03, high * 0.7, HALF_Z * 2), pad, sx * (HALF_X + 0.015), high * 0.4, 0).castShadow = false;
    const depth = 0.9;
    this.add(block(HALF_X * 2 + W * 2 + 0.1, depth, HALF_Z * 2 + W * 2 + 0.1, 0.08), body, 0, -depth / 2 - 0.01, 0);
    this.add(new T.BoxGeometry(HALF_X * 2 + W * 2 + 0.14, 0.06, HALF_Z * 2 + W * 2 + 0.14), chrome, 0, -0.04, 0).castShadow = false;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        this.add(new T.CylinderGeometry(0.16, 0.2, -GROUND - depth, 14), body, sx * (HALF_X - 0.2), (GROUND - depth) / 2, sz * (HALF_Z - 0.4));
        this.add(new T.CylinderGeometry(0.26, 0.26, 0.06, 18), chrome, sx * (HALF_X - 0.2), GROUND + 0.03, sz * (HALF_Z - 0.4));
      }
    // The scoreboard over the far end on two posts.
    const board = new T.Group(),
      canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 192;
    const texture = keep_(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    this.add(block(3.6, 1.0, 0.25, 0.06), body, 0, 0, 0, board);
    this.add(new T.PlaneGeometry(3.3, 0.82), keep_(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, 0, 0.13, board).castShadow = false;
    for (const sx of [-1, 1]) this.add(new T.CylinderGeometry(0.06, 0.06, 1.8, 10), chrome, sx * 1.6, -0.9, -0.05, board);
    board.position.set(0, 1.75, -HALF_Z - W - 0.35);
    board.rotation.x = 0.25;
    this.scene.add(board);
    this.led = { canvas, texture, said: "" };
    // The puck, and the two mallets (a disc with a rounded rim and a knob to hold).
    this.puck = new T.Group();
    this.add(new T.CylinderGeometry(PUCK, PUCK, 0.06, 32), keep_(glossy({ color: "#ffb21f", roughness: 0.3 }, 0.6)), 0, 0.03, 0, this.puck);
    this.add(new T.TorusGeometry(PUCK * 0.62, 0.012, 6, 28).rotateX(Math.PI / 2), this.standard({ color: "#c46a00" }), 0, 0.062, 0, this.puck).castShadow = false;
    this.scene.add(this.puck);
    const lathe = (points: number[][]) => keep_(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), 36)),
      base = lathe([[0, 0], [MALLET, 0], [MALLET + 0.02, 0.03], [MALLET, 0.08], [MALLET * 0.7, 0.1], [0.15, 0.11], [0.12, 0.14], [0, 0.14]]),
      knob = lathe([[0, 0.12], [0.11, 0.12], [0.1, 0.26], [0.14, 0.3], [0.13, 0.36], [0.06, 0.39], [0, 0.39]]);
    AIRHOCKEY_COLORS.forEach((color) => {
      const g = new T.Group(),
        paint = keep_(glossy({ color, roughness: 0.3 }, 0.6));
      this.add(base, paint, 0, 0, 0, g);
      this.add(knob, paint, 0, 0, 0, g);
      this.scene.add(g);
      this.mallets.push(g);
    });
    // The hand: a mouse moves my mallet wherever it goes over the table (no button needed); keys move it too.
    const el = this.renderer.domElement,
      ray = new T.Raycaster(),
      hit = new T.Vector3();
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed || !this.running()) return;
      aim(ray, e, el, this.camera);
      if (ray.ray.intersectPlane(this.floor, hit)) aimAt(this.world, 0, hit.x, hit.z);
    });
    const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    el.addEventListener("keydown", (e) => {
      const way = ARROWS[e.key];
      if (!way) return;
      e.preventDefault();
      if (way[0]) this.keys.x = way[0];
      if (way[1]) this.keys.z = way[1];
    });
    el.addEventListener("keyup", (e) => {
      const way = ARROWS[e.key];
      if (!way) return;
      if (way[0] && this.keys.x === way[0]) this.keys.x = 0;
      if (way[1] && this.keys.z === way[1]) this.keys.z = 0;
    });
    el.addEventListener("blur", () => (this.keys = { x: 0, z: 0 }));
    this.score([0, 0]);
    this.pose(performance.now());
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The table never makes the screen wait: a goal may be reported at any moment. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.keys = { x: 0, z: 0 };
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** A press anywhere on the table takes my mallet there, and it follows the finger. */
  protected dragStart(_point: number, at: { x: number; z: number }) {
    if (!this.running()) return false;
    aimAt(this.world, 0, at.x, at.z);
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    if (this.running()) aimAt(this.world, 0, at.x, at.z);
  }
  /** Runs the table for the time that has passed since the last frame. */
  private advance(now: number) {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      if (this.keys.x || this.keys.z) {
        const t = this.world.targets[0];
        aimAt(this.world, 0, t.x + this.keys.x * 7 * real, t.z + this.keys.z * 7 * real);
      }
      if (this.wait > 0) this.wait -= real;
      else {
        this.left += real;
        while (this.left >= DT) {
          this.left -= DT;
          think(this.world, this.level);
          const scorer = step(this.world, this.level);
          if (scorer !== null) {
            this.left = 0;
            this.wait = 1.1;
            // The side that let it in has the puck.
            const mine = this.world.targets[0];
            this.world = createWorld(scorer === 0 ? 1 : 0, (Math.random() - 0.5) * 0.8);
            this.world.targets[0] = keep(0, mine.x, mine.z);
            this.onMove({ from: -1, to: scorer, extra: -1 });
            break;
          }
        }
        if (this.world.hit || this.world.wall) {
          if (now - this.clicked > 60) {
            this.clicked = now;
            this.onContact();
          }
          this.world.hit = this.world.wall = 0;
        }
      }
    }
    this.pose(now);
    this.redraw();
  }
  /** Puts the puck and the mallets where the table has them; the park's wheel turns and its bulbs twinkle. */
  private pose(now: number) {
    const { puck, mallets } = this.world;
    this.puck.position.set(puck.x, 0, puck.z);
    this.puck.visible = Math.abs(puck.z) < HALF_Z + PUCK * 2;
    mallets.forEach((m, i) => this.mallets[i].position.set(m.x, 0, m.z));
    const { wheel, bulbs } = this.fair;
    wheel.rotation.z = now / 9000;
    for (const car of wheel.children) if (car.userData.gondola) car.rotation.z = -wheel.rotation.z;
    bulbs.forEach((bulb, k) => (bulb.emissiveIntensity = (k + Math.floor(now / 300)) % 3 === 0 ? 1.4 : 0.5));
    if (++this.frame % 6 === 0) {
      const data = this.renderer.domElement.dataset;
      data.puck = `${puck.x.toFixed(2)},${puck.z.toFixed(2)}`;
      data.mallet = `${mallets[0].x.toFixed(2)},${mallets[0].z.toFixed(2)}`;
    }
  }
  /** The scoreboard: my goals in red, the computer's in blue. */
  private score(score: [number, number]) {
    const said = score.join(":");
    if (said === this.led.said) return;
    this.led.said = said;
    const ctx = this.led.canvas.getContext("2d")!;
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0, 0, 768, 192);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '800 30px "Inter", Arial, sans-serif';
    ctx.fillStyle = "#ffd45a";
    ctx.fillText(`나`, 192, 34);
    ctx.fillText(`컴퓨터`, 576, 34);
    ctx.fillText(`${GOALS}골 선승`, 384, 34);
    ctx.font = '900 120px "Courier New", monospace';
    for (const [x, value, color] of [[192, score[0], "#ff4a3a"], [576, score[1], "#4aa8ff"]] as const) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = color;
      ctx.fillText(String(value).padStart(2, "0"), x, 118);
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffd45a";
    ctx.fillText(":", 384, 112);
    this.led.texture.needsUpdate = true;
  }
  protected subject(aspect: number): TableSubject {
    return { ...AIRHOCKEY_SUBJECT, half: aspect < 1.1 ? AIRHOCKEY_SUBJECT.half : AIRHOCKEY_SUBJECT.half + 0.6 };
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    this.score(state.score);
    // A new match, known by the count of moves going back to nothing.
    if (state.ply === 0 && this.shown > 0) {
      this.world = createWorld(0, 0);
      this.wait = 0.9;
    }
    this.shown = state.ply;
    this.pose(performance.now());
  }
  protected animate() {
    return false;
  }
  protected mark() {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
