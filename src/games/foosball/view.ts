import * as T from "three";
import { aim, wood } from "../../engine/scene-utils";
import { pub } from "../../engine/scenery";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BALL_R, DT, GOAL, HALF_X, HALF_Z, MAX_SLIDE, RODS, createWorld, foot, offset, steer, step, type World } from "./sim";
import { GOALS, type State } from "./rules";

export const FOOSBALL_COLORS: [string, string] = ["#c8321f", "#e7b416"];
/** How high the rods run over the pitch, and how tall the walls stand. */
const ROD_Y = 0.78,
  WALL = 1.05,
  LEG = 0.66;
function pitch() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext("2d")!,
    px = (x: number) => 256 + (x / HALF_X) * 256,
    pz = (z: number) => 512 + (z / HALF_Z) * 512;
  // Mown stripes.
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? "#2f8f4a" : "#2a8544";
    ctx.fillRect(0, i * 102.4, 512, 103);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 1008);
  ctx.beginPath();
  ctx.moveTo(8, 512);
  ctx.lineTo(504, 512);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(256, 512, 84, 0, Math.PI * 2);
  ctx.stroke();
  for (const end of [-1, 1]) {
    ctx.strokeRect(px(-1.7), end < 0 ? 8 : pz(HALF_Z - 1.5), px(1.7) - px(-1.7), pz(1.5) - pz(0) - 8);
    ctx.strokeRect(px(-GOAL), end < 0 ? 8 : pz(HALF_Z - 0.6), px(GOAL) - px(-GOAL), pz(0.6) - pz(0) - 8);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The rod football table: the view plays the table in real time and reports each goal as a move. */
export class FoosballView extends TableView<State> {
  private root = new T.Group();
  private world: World = createWorld(0, (Math.random() - 0.5) * 0.6);
  private rods: { group: T.Group; figures: T.Group }[] = [];
  private ball: T.Mesh;
  private beads: T.Mesh[][] = [[], []];
  /** How far across I have pushed my rods, in table units, and whether a kick is waiting to be taken. */
  private target = 0;
  private kick = false;
  private held = 0;
  /** Seconds before the ball is let go after a goal. */
  private wait = 0.8;
  private last = performance.now();
  private left = 0;
  private frame = 0;
  private clicked = 0;
  private ticker = 0;
  private own_ = <R extends { dispose(): void }>(r: R) => this.own(r);
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
  ) {
    super(host, quality, "#16110d");
    this.scene.add(new T.HemisphereLight("#d8cdb8", "#221a14", 1.6));
    const lamp = new T.SpotLight("#fff0cf", 3.4, 0, 0.9, 0.5, 0);
    lamp.position.set(0, 12, 0.5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    pub(this.scene, this.own_, HALF_Z + 1.2, 3.6);
    // The table lies across the screen, as one stands at it: my goal at the left, the other at the right,
    // and the rods running toward me. Everything of the table is built lengthwise and turned as one.
    const root = this.root;
    root.rotation.y = -Math.PI / 2;
    this.scene.add(root);
    const put = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x = 0, y = 0, z = 0) => this.add(geometry, material, x, y, z, root);
    const timber = this.standard({ map: this.own(wood(true)), roughness: 0.5 }),
      dark = this.standard({ color: "#141414", roughness: 0.6 }),
      steel = this.standard({ color: "#c9ccd0", roughness: 0.25, metalness: 0.9 }),
      grip = this.standard({ color: "#18181a", roughness: 0.7 });
    // The pitch and the cabinet round it.
    const field = put(new T.PlaneGeometry(HALF_X * 2, HALF_Z * 2), this.standard({ map: this.own(pitch()), roughness: 0.85 }));
    field.rotation.x = -Math.PI / 2;
    field.castShadow = false;
    const thick = 0.32,
      body = WALL + 0.9;
    for (const side of [-1, 1]) put(new T.BoxGeometry(thick, body, HALF_Z * 2 + thick * 2), timber, side * (HALF_X + thick / 2), WALL - body / 2, 0);
    for (const end of [-1, 1]) {
      const z = end * (HALF_Z + thick / 2),
        wing = HALF_X - GOAL;
      for (const side of [-1, 1]) put(new T.BoxGeometry(wing, body, thick), timber, side * (GOAL + wing / 2), WALL - body / 2, z);
      // Over and under the goal mouth, and the box the ball drops into.
      put(new T.BoxGeometry(GOAL * 2, WALL - 0.5, thick), timber, 0, 0.5 + (WALL - 0.5) / 2, z);
      put(new T.BoxGeometry(GOAL * 2, 0.9, thick), timber, 0, -0.45, z);
      put(new T.BoxGeometry(GOAL * 2, 0.5, 0.05), dark, 0, 0.25, z + end * 0.1);
    }
    put(new T.BoxGeometry(HALF_X * 2 + thick * 2, 0.2, HALF_Z * 2 + thick * 2), timber, 0, -0.8, 0);
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        put(new T.BoxGeometry(0.45, 2.8, 0.45), dark, x * (HALF_X - 0.1), -2.2, z * (HALF_Z - 0.4));
        put(new T.CylinderGeometry(0.3, 0.3, 0.08, 20), steel, x * (HALF_X - 0.1), -3.56, z * (HALF_Z - 0.4));
      }
    // The rods: steel through the walls, a grip on the player's own side, and the figures.
    const colours = FOOSBALL_COLORS.map((color) => this.standard({ color, roughness: 0.45 })),
      skin = this.standard({ color: "#f0cfa8", roughness: 0.6 }),
      bar = this.own(new T.CylinderGeometry(0.055, 0.055, 1, 12)),
      handle = this.own(new T.CylinderGeometry(0.13, 0.11, 0.7, 16)),
      torso = this.own(new T.BoxGeometry(0.3, 0.44, 0.2)),
      head = this.own(new T.SphereGeometry(0.12, 14, 10)),
      legs = this.own(new T.BoxGeometry(0.24, 0.34, 0.16)),
      boot = this.own(new T.BoxGeometry(0.28, 0.1, 0.24));
    const part = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, x: number, y: number, z = 0) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    for (const rod of RODS) {
      const group = new T.Group(),
        figures = new T.Group(),
        // My grips stick out to the right, the other side's to the left.
        out = rod.side === 0 ? 1 : -1,
        reach = HALF_X + thick + rod.travel,
        length = reach * 2 + 0.9,
        shaft = part(bar, steel, group, out * 0.45, 0);
      group.position.set(0, ROD_Y, rod.z);
      shaft.rotation.z = Math.PI / 2;
      shaft.scale.y = length;
      part(handle, grip, group, out * (reach + 0.75), 0).rotation.z = Math.PI / 2;
      for (const x of rod.figures) {
        const figure = new T.Group();
        figure.position.x = x;
        part(torso, colours[rod.side], figure, 0, 0.02);
        part(head, skin, figure, 0, 0.36);
        part(legs, dark, figure, 0, -0.36);
        part(boot, colours[rod.side], figure, 0, -LEG + 0.07);
        figures.add(figure);
      }
      group.add(figures);
      root.add(group);
      this.rods.push({ group, figures });
    }
    this.ball = put(new T.SphereGeometry(BALL_R, 24, 16), this.standard({ color: "#f4f1e6", roughness: 0.35 }));
    // The counters: five beads on a wire over each goal, pushed across as goals are scored.
    const bead = this.own(new T.BoxGeometry(0.16, 0.2, 0.2));
    for (const side of [0, 1]) {
      const z = (side === 0 ? 1 : -1) * (HALF_Z + thick / 2),
        wire = put(new T.CylinderGeometry(0.02, 0.02, 2.6, 8), steel, 0, WALL + 0.2, z);
      wire.rotation.z = Math.PI / 2;
      for (const x of [-1.3, 1.3]) put(new T.BoxGeometry(0.06, 0.26, 0.06), steel, x, WALL + 0.1, z);
      for (let i = 0; i < GOALS; i++) {
        const mesh = new T.Mesh(bead, colours[side]);
        mesh.position.set(0, WALL + 0.2, z);
        mesh.castShadow = true;
        root.add(mesh);
        this.beads[side].push(mesh);
      }
    }
    // The hand: a mouse that moves over the table slides the rods; a press kicks.
    const el = this.renderer.domElement,
      ray = new T.Raycaster(),
      hit = new T.Vector3();
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed) return;
      aim(ray, e, el, this.camera);
      if (!ray.ray.intersectPlane(this.floor, hit)) return;
      // A mouse needs no button held: wherever it goes (toward me or away), the rods go as far.
      if (this.grip !== null && e.buttons === 0) this.push(hit.z - this.grip);
      if (e.buttons === 0) this.grip = hit.z;
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp") this.held = -1;
      else if (e.key === "ArrowDown") this.held = 1;
      else if (e.key === " " || e.key === "Enter") this.kick = true;
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key === "ArrowUp" && this.held < 0) || (e.key === "ArrowDown" && this.held > 0)) this.held = 0;
    });
    el.addEventListener("blur", () => (this.held = 0));
    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && e.buttons === 0) this.grip = null;
    });
    this.pose();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The table never makes the screen wait: a goal can be reported at any moment. */
  get animating() {
    return false;
  }
  /** The rods go exactly as far as the hand does. */
  private push(by: number) {
    this.target = Math.max(-MAX_SLIDE, Math.min(MAX_SLIDE, this.target + by));
  }
  private grip: number | null = null;
  protected dragStart(_point: number, at: { x: number; z: number }) {
    this.grip = at.z;
    this.kick = true;
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    if (this.grip !== null) this.push(at.z - this.grip);
    this.grip = at.z;
  }
  protected dragEnd() {
    this.grip = null;
  }
  /** Runs the table for the time that has passed since the last frame. */
  private advance(now: number) {
    // The table itself never jumps more than a twentieth of a second; a held key counts the whole time, however slow the frames.
    const real = Math.min(0.3, (now - this.last) / 1000),
      passed = Math.min(0.05, real);
    this.last = now;
    if (!this.state || this.state.winner !== null || document.hidden || document.querySelector("dialog[open]")) return;
    if (this.held) this.push(this.held * 4.5 * real);
    if (this.wait > 0) {
      this.wait -= passed;
      this.kick = false;
      return;
    }
    this.left += passed;
    while (this.left >= DT) {
      this.left -= DT;
      const scorer = step(this.world, [{ target: this.target, kick: this.kick }, steer(this.world, 1, this.level)]);
      this.kick = false;
      if (scorer !== null) {
        this.left = 0;
        this.wait = 1;
        // The side that let it in gets the ball.
        this.world = createWorld(scorer === 0 ? 1 : 0, (Math.random() - 0.5) * 0.6);
        this.onMove({ from: -1, to: scorer, extra: -1 });
        break;
      }
    }
    if (this.world.hit) {
      this.world.hit = false;
      if (now - this.clicked > 70) {
        this.clicked = now;
        this.onContact();
      }
    }
    this.pose();
    this.redraw();
  }
  /** Puts the rods, figures and ball where the table has them. */
  private pose() {
    const { world } = this;
    RODS.forEach((rod, i) => {
      const { group, figures } = this.rods[i],
        kick = foot(world.swing[rod.side]);
      group.position.x = offset(rod, world.slide[rod.side]);
      figures.rotation.x = Math.asin(Math.max(-1, Math.min(1, kick.reach / LEG))) * (rod.side === 0 ? 1 : -1);
    });
    this.ball.position.set(world.ball.x, BALL_R, world.ball.z);
    if (++this.frame % 6 === 0) {
      const data = this.renderer.domElement.dataset;
      data.ball = `${world.ball.x.toFixed(2)},${world.ball.z.toFixed(2)}`;
      data.slide = (world.slide[0] / MAX_SLIDE).toFixed(2);
    }
  }
  protected subject(aspect: number): TableSubject {
    // The length of the table across the screen; the rods and their grips reach toward me and away.
    return { half: HALF_Z + (aspect < 1.2 ? 0.9 : 1.6), halfZ: HALF_X + 2.3, height: WALL, lookY: 0.2, tilt: 1.02 };
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // Scored beads are pushed to the right of the wire, the rest wait on the left.
    for (const side of [0, 1])
      this.beads[side].forEach((bead, i) => {
        const done = i < state.score[side];
        bead.position.x = done ? 1.1 - i * 0.19 : -1.1 + (GOALS - 1 - i) * 0.19;
      });
    if (state.ply === 0 && (this.world.ball.z !== 0 || this.world.idle)) {
      this.world = createWorld(0, (Math.random() - 0.5) * 0.6);
      this.wait = 0.8;
    }
    this.pose();
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
