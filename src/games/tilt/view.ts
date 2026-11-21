import * as T from "three";
import { wood, planks, glossy, block } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { LEFT, RIGHT, type State } from "./rules";

export const TILT_COLORS: [string, string] = ["#d8432f", "#2f6fd0"];
/** A cell's side; how far the dial stands above the desk; the dial's radius for a maze of a size. */
const CELL = 0.62,
  WALL = 0.08,
  RAISE = 0.5,
  radiusOf = (size: number) => (size * CELL) / Math.SQRT2 + 0.35;
/**
 * A wooden dial standing upright on a stand on the desk, with a square maze of brass walls let into its face. It
 * turns a quarter at a time; the two glazed blocks, red with a ring and blue with a cross, then drop straight down.
 * Their marks are inlaid in the floor of the maze. Two round knobs below the dial turn it left and right.
 */
export class TiltView extends TableView<State> {
  private size = 0;
  private built = "";
  private dial = new T.Group();
  private maze = new T.Group();
  private blocks: T.Group[] = [];
  private knobs: T.Group[] = [];
  private hintGlow: T.Mesh[] = [];
  private shown = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#cfc3ad");
    this.daylight("#fff8ec", "#8a6f52", "#fff0d2", 9, 2.2);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard(planks(8, (r) => this.own(r))), 0, -0.2, 0).castShadow = false;
    this.dial.add(this.maze);
    this.scene.add(this.dial);
    // Two glazed blocks, each with its sign raised on the face toward me.
    const sign = this.standard({ color: "#fff6e6", roughness: 0.4 });
    TILT_COLORS.forEach((color, i) => {
      const g = new T.Group(),
        body = new T.Mesh(this.own(block(CELL * 0.82, CELL * 0.82, CELL * 0.5, 0.06)), this.own(glossy({ color, roughness: 0.3 })));
      body.castShadow = body.receiveShadow = true;
      g.add(body);
      if (i === 0) {
        const ring = new T.Mesh(this.own(new T.TorusGeometry(CELL * 0.2, CELL * 0.045, 10, 32)), sign);
        ring.position.z = CELL * 0.26;
        g.add(ring);
      } else
        for (const a of [Math.PI / 4, -Math.PI / 4]) {
          const bar = new T.Mesh(this.own(new T.BoxGeometry(CELL * 0.5, CELL * 0.09, CELL * 0.05)), sign);
          bar.rotation.z = a;
          bar.position.z = CELL * 0.26;
          g.add(bar);
        }
      this.blocks.push(g);
      this.maze.add(g);
    });
    // The knobs: brass rounds with an arrow curling the way they turn the dial.
    const brass = this.standard({ color: "#c9a44a", roughness: 0.3, metalness: 0.85 }),
      face = (right: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#2a1c12";
        ctx.beginPath();
        ctx.arc(64, 64, 64, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle = "#f2d78a";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        // The arrow curls over the top toward the way the knob turns the dial: drawn for the right and mirrored for the left.
        if (!right) {
          ctx.translate(128, 0);
          ctx.scale(-1, 1);
        }
        ctx.beginPath();
        ctx.arc(64, 70, 30, Math.PI * 1.05, Math.PI * 1.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(78, 66);
        ctx.lineTo(110, 66);
        ctx.lineTo(94, 90);
        ctx.closePath();
        ctx.fill();
        const t = this.own(new T.CanvasTexture(canvas));
        t.colorSpace = T.SRGBColorSpace;
        return this.standard({ map: t, roughness: 0.5 });
      };
    for (const right of [false, true]) {
      const knob = new T.Group(),
        rim = new T.Mesh(this.own(new T.CylinderGeometry(0.42, 0.46, 0.22, 40).rotateX(Math.PI / 2)), brass),
        cap = new T.Mesh(this.own(new T.CircleGeometry(0.36, 40)), face(right));
      rim.castShadow = true;
      cap.position.z = 0.115;
      knob.add(rim, cap);
      this.knobs.push(knob);
      this.scene.add(knob);
    }
    for (let i = 0; i < 2; i++) {
      const glow = new T.Mesh(this.own(new T.RingGeometry(0.48, 0.58, 40)), this.own(new T.MeshBasicMaterial({ color: "#ffb21f", transparent: true, opacity: 0.95, depthWrite: false })));
      glow.visible = false;
      this.hintGlow.push(glow);
      this.scene.add(glow);
    }
    // The pointer is followed on the upright face of the dial.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), -0.3);
    this.begin();
  }
  private centreY() {
    return RAISE + radiusOf(this.size || 5);
  }
  /** Where a cell's centre lies on the face of the maze, in the dial's own turning frame. */
  private cell(index: number) {
    const n = this.size,
      r = Math.floor(index / n),
      c = index % n;
    return { x: (c - (n - 1) / 2) * CELL, y: ((n - 1) / 2 - r) * CELL };
  }
  /** Builds the dial, its stand and its maze for a puzzle, when its walls change. */
  private lay(state: State) {
    const key = `${state.size}:${state.floor.map(Number).join("")}:${state.side.map(Number).join("")}:${state.marks.join(",")}`;
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    for (const child of [...this.dial.children]) if (child !== this.maze) this.dial.remove(child);
    for (const child of [...this.maze.children]) if (!this.blocks.includes(child as T.Group)) this.maze.remove(child);
    for (const child of [...this.scene.children]) if (child.userData.stand) this.scene.remove(child);
    const n = state.size,
      span = n * CELL,
      radius = radiusOf(n),
      y = this.centreY(),
      dark = this.standard({ map: this.own(wood(true)), roughness: 0.45 }),
      light = this.standard({ map: this.own(wood(false)), color: "#e9d2a8", roughness: 0.55 }),
      // Light brass that reads against the wood under any light.
      brass = this.standard({ color: "#e0bd62", roughness: 0.42, metalness: 0.35 });
    this.dial.position.set(0, y, 0);
    // The dial: a thick round of dark wood, and the maze's pale floor let into it.
    const disc = new T.Mesh(this.own(new T.CylinderGeometry(radius, radius, 0.3, 72).rotateX(Math.PI / 2)), dark);
    disc.castShadow = disc.receiveShadow = true;
    this.dial.add(disc);
    const floorPlate = new T.Mesh(this.own(new T.BoxGeometry(span, span, 0.04)), light);
    floorPlate.position.z = 0.16;
    floorPlate.receiveShadow = true;
    this.dial.add(floorPlate);
    // The stand: two cheeks and a foot, not turning.
    for (const x of [-radius * 0.55, radius * 0.55]) {
      const cheek = this.add(block(0.3, y, 0.5), dark, x, y / 2, -0.35);
      cheek.userData.stand = true;
    }
    const foot = this.add(block(radius * 1.8, 0.16, 1.2), dark, 0, 0.08, -0.2);
    foot.userData.stand = true;
    // Walls of brass: the frame round the maze, and the inner walls under and beside cells.
    const wall = (x: number, yy: number, w: number, h: number) => {
      const m = new T.Mesh(this.own(new T.BoxGeometry(w, h, 0.3)), brass);
      m.position.set(x, yy, 0.33);
      m.castShadow = m.receiveShadow = true;
      this.maze.add(m);
    };
    wall(0, span / 2, span + WALL, WALL);
    wall(0, -span / 2, span + WALL, WALL);
    wall(-span / 2, 0, WALL, span + WALL);
    wall(span / 2, 0, WALL, span + WALL);
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n),
        c = i % n,
        p = this.cell(i);
      if (r < n - 1 && state.floor[i]) wall(p.x, p.y - CELL / 2, CELL + WALL, WALL);
      if (c < n - 1 && state.side[i]) wall(p.x + CELL / 2, p.y, WALL, CELL + WALL);
    }
    // The marks: a red ring and a blue cross inlaid in the floor.
    const red = this.own(new T.MeshStandardMaterial({ color: "#d8432f", roughness: 0.5 })),
      blue = this.own(new T.MeshStandardMaterial({ color: "#2f6fd0", roughness: 0.5 })),
      [rm, bm] = state.marks.map((m) => this.cell(m)),
      ring = new T.Mesh(this.own(new T.RingGeometry(CELL * 0.18, CELL * 0.3, 32)), red);
    ring.position.set(rm.x, rm.y, 0.185);
    this.maze.add(ring);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new T.Mesh(this.own(new T.PlaneGeometry(CELL * 0.62, CELL * 0.12)), blue);
      bar.rotation.z = a;
      bar.position.set(bm.x, bm.y, 0.185);
      this.maze.add(bar);
    }
    // The knobs below the dial, either side.
    this.knobs.forEach((knob, i) => knob.position.set((i ? 1 : -1) * (radius + 0.75), 0.75, 0.25));
    if (resized) this.resize();
  }
  private put(state: State) {
    state.blocks.forEach((cell, i) => {
      const p = this.cell(cell);
      this.blocks[i].position.set(p.x, p.y, 0.43);
    });
  }
  protected subject(aspect: number): TableSubject {
    const radius = radiusOf(this.size || 5),
      half = radius + 1.3;
    return { half: aspect < 1 ? half : half + 0.3, halfZ: 0.9, height: RAISE + radius * 2 + 0.25, lookY: RAISE + radius, tilt: 0.16 };
  }
  protected spots(): Spot[] {
    return this.knobs.map((knob, i) => ({ x: knob.position.x, y: knob.position.y, z: knob.position.z, r: 0.6, point: i ? RIGHT : LEFT }));
  }
  protected place(state: State) {
    this.lay(state);
    this.shown = state.turn;
    this.dial.rotation.z = (-state.turn * Math.PI) / 2;
    this.put(state);
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1 || state.size !== before.size) return false;
    this.lay(state);
    this.put(before);
    const from = (-this.shown * Math.PI) / 2,
      dir = state.last === RIGHT ? -1 : 1,
      knob = this.knobs[state.last === RIGHT ? 1 : 0],
      ease = (p: number) => p * p * (3 - 2 * p);
    this.shown = state.turn;
    // The dial turns a quarter (the knob with it), then the blocks drop, faster as they fall.
    this.tween(0, 420, (p) => {
      this.dial.rotation.z = from + (dir * Math.PI * ease(p)) / 2;
      // The knob gives a quarter turn and springs back, so that its arrow stands upright again.
      knob.rotation.z = (dir * Math.PI * Math.sin(Math.PI * p)) / 4;
    });
    state.blocks.forEach((cell, i) => {
      const a = this.cell(before.blocks[i]),
        b = this.cell(cell),
        cells = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / CELL);
      if (!cells) return;
      this.tween(440, 90 + cells * 70, (p) => {
        const t = p * p;
        this.blocks[i].position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.43);
        if (p === 1) this.onContact();
      });
    });
    return true;
  }
  protected mark(marks: Marks) {
    const to = marks.hint?.to;
    this.hintGlow.forEach((glow, i) => {
      glow.visible = to === (i ? RIGHT : LEFT);
      const knob = this.knobs[i];
      glow.position.set(knob.position.x, knob.position.y, knob.position.z + 0.13);
    });
  }
}
