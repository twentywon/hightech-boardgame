import * as T from "three";
import { aim, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BRICK, CLEAR, LIVES, LOST, type State } from "./rules";
import { BAT_DEEP, BAT_HALF, BAT_Z, BRICK_D, BRICK_W, DT, HALF_X, HALF_Z, R, createWorld, launch, step, type World } from "./sim";

export const BRICK_COLORS: [string, string] = ["#d06a3a", "#b9b3a4"];
/** Glazed bricks, a colour to each row from the far end. */
const ROW_PAINT = ["#b8433a", "#d06a3a", "#e0a92a", "#7a9a3a", "#2f9f8f", "#3f7fc0", "#6a56b0"];
/**
 * A walled table seen from above: the bricks at the far end, my bat near
 * me. The view plays the table in real time and reports each brick knocked
 * out, each ball lost and each wall cleared as a move.
 */
export class BricksView extends TableView<State> {
  private world: World = createWorld(1);
  private bricks: T.Mesh[] = [];
  private paints: T.Material[];
  private hard: T.Material;
  private cracked: T.Material;
  private ball: T.Mesh;
  private bat: T.Mesh;
  private spares: T.Mesh[] = [];
  private target = 0;
  private held = 0;
  private last = performance.now();
  private left = 0;
  private clicked = 0;
  private ticker = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#20262b");
    this.scene.add(new T.HemisphereLight("#eef3ff", "#30281f", 1.6));
    const lamp = new T.SpotLight("#fff4dc", 3.0, 0, 0.9, 0.6, 0);
    lamp.position.set(-2, 13, 3);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    // A workshop bench; on it a slate bed between three wooden walls, open toward me.
    const bench = this.own(wood(true));
    bench.repeat.set(4, 4);
    this.add(new T.BoxGeometry(60, 0.4, 44), this.standard({ map: bench, roughness: 0.7 }), 0, -0.6, 0).castShadow = false;
    this.add(new T.BoxGeometry(HALF_X * 2, 0.3, HALF_Z * 2 + 0.8), this.standard({ color: "#2f3a40", roughness: 0.95 }), 0, -0.15, 0.4).castShadow = false;
    const rail = this.standard({ map: this.own(wood()), roughness: 0.5 });
    for (const side of [-1, 1]) this.add(new T.BoxGeometry(0.3, 0.7, HALF_Z * 2 + 1.1), rail, side * (HALF_X + 0.15), 0.05, 0.25);
    this.add(new T.BoxGeometry(HALF_X * 2 + 0.6, 0.7, 0.3), rail, 0, 0.05, -HALF_Z - 0.15);
    // The line behind the bat: a ball that crosses it is lost.
    this.add(new T.BoxGeometry(HALF_X * 2, 0.01, 0.05), this.standard({ color: "#c8503c", roughness: 1 }), 0, 0.006, HALF_Z + 0.4).castShadow = false;
    const brick = this.own(new T.BoxGeometry(BRICK_W, 0.36, BRICK_D));
    this.paints = ROW_PAINT.map((color) => this.standard({ color, roughness: 0.3 }));
    this.hard = this.standard({ color: "#8d979e", roughness: 0.25, metalness: 0.7 });
    this.cracked = this.standard({ color: "#c9d0d4", roughness: 0.5, metalness: 0.3 });
    for (let i = 0; i < 63; i++) {
      const mesh = new T.Mesh(brick, this.paints[0]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      this.bricks.push(mesh);
      this.scene.add(mesh);
    }
    const sphere = this.own(new T.SphereGeometry(R, 24, 16)),
      steel = this.standard({ color: "#f2f4f5", roughness: 0.15, metalness: 0.6 });
    this.ball = new T.Mesh(sphere, steel);
    this.ball.castShadow = true;
    this.bat = new T.Mesh(this.own(new T.CapsuleGeometry(BAT_DEEP, BAT_HALF * 2 - BAT_DEEP * 2, 6, 16)), this.standard({ color: "#f0ede4", roughness: 0.35 }));
    this.bat.rotation.z = Math.PI / 2;
    this.bat.castShadow = true;
    this.scene.add(this.ball, this.bat);
    // The balls still to come wait in a dish beside the table.
    this.add(new T.CylinderGeometry(0.75, 0.6, 0.12, 28), this.standard({ color: "#d8cfbd", roughness: 0.6 }), HALF_X + 1.5, -0.34, BAT_Z - 0.4);
    for (let i = 0; i < LIVES - 1; i++) {
      const spare = new T.Mesh(sphere, steel);
      spare.position.set(HALF_X + 1.5 + (i - (LIVES - 2) / 2) * 0.42, -0.28 + R, BAT_Z - 0.4);
      spare.castShadow = true;
      this.spares.push(spare);
      this.scene.add(spare);
    }
    // A mouse steers the bat without a button held; a finger steers it while it is down.
    const el = this.renderer.domElement,
      ray = new T.Raycaster(),
      hit = new T.Vector3();
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed) return;
      aim(ray, e, el, this.camera);
      if (ray.ray.intersectPlane(this.floor, hit)) this.target = hit.x;
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this.held = -1;
      else if (e.key === "ArrowRight") this.held = 1;
      else if (e.key === " " || e.key === "Enter") this.send();
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key === "ArrowLeft" && this.held < 0) || (e.key === "ArrowRight" && this.held > 0)) this.held = 0;
    });
    el.addEventListener("blur", () => (this.held = 0));
    this.pose();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The table never makes the screen wait. */
  get animating() {
    return false;
  }
  private running() {
    return !!this.state && this.state.winner === null && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Sends the resting ball off. */
  private send() {
    if (this.running()) launch(this.world);
  }
  protected dragStart(_point: number, at: { x: number; z: number }) {
    this.target = at.x;
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    this.target = at.x;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    if (at) this.send();
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000),
      passed = Math.min(0.05, real);
    this.last = now;
    if (!this.running()) return;
    if (this.held) this.target = Math.max(-HALF_X, Math.min(HALF_X, this.world.bat + this.held * 9 * real));
    this.left += passed;
    let heard = false;
    loop: while (this.left >= DT) {
      this.left -= DT;
      for (const event of step(this.world, this.target)) {
        heard = true;
        if (event.kind === "brick" && event.gone) this.onMove({ from: -1, to: BRICK, extra: -1 });
        else if (event.kind === "lost" || event.kind === "clear") {
          // The table is laid afresh by the move it reports.
          this.left = 0;
          this.onMove({ from: -1, to: event.kind === "lost" ? LOST : CLEAR, extra: -1 });
          break loop;
        }
      }
    }
    if (heard && now - this.clicked > 60) {
      this.clicked = now;
      this.onContact();
    }
    this.pose();
    this.redraw();
  }
  /** Puts the bricks, the bat and the ball where the table has them. */
  private pose() {
    const { world } = this;
    this.bricks.forEach((mesh, i) => {
      const brick = world.bricks[i];
      mesh.visible = !!brick && brick.hits > 0;
      if (!brick || !brick.hits) return;
      mesh.material = brick.hard ? (brick.hits > 1 ? this.hard : this.cracked) : this.paints[brick.row % this.paints.length];
      mesh.position.set(brick.x, 0.18, brick.z);
    });
    this.bat.position.set(world.bat, BAT_DEEP, BAT_Z);
    this.ball.position.set(world.ball.x, R, world.ball.z);
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.0 : 6.6, halfZ: HALF_Z + 0.9, height: 0.6, lookY: 0, tilt: 1.24 };
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new wall is built when the level changes; the bat keeps its place.
    if (state.level !== this.world.level && state.winner === null) {
      const bat = this.world.bat;
      this.world = createWorld(state.level);
      this.world.bat = this.target = bat;
    }
    this.ball.visible = state.winner !== 1;
    this.spares.forEach((spare, i) => (spare.visible = i < state.lives - 1));
    this.pose();
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
