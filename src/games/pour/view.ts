import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { goalText, holding, vesselsOf, type State } from "./rules";

export const POUR_COLORS: [string, string] = ["#2f8fd0", "#b9b3a4"];
/** Where the beakers stand (three, or four on the harder stages), how wide they are, and how tall a litre makes them. */
export const vesselXs = (count: number) => (count === 4 ? [-4.5, -1.5, 1.5, 4.5] : [-3.4, 0, 3.4]);
const RADIUS = 0.95,
  INNER = RADIUS * 0.93,
  LITRE = 0.3,
  FLOOR = 0.07;
/** How a beaker is held: where its foot is, how far it is tipped toward its spout, and how far it is turned round. */
interface Pose {
  x: number;
  y: number;
  tilt: number;
  turn: number;
}
/** Pale wall tiles, as in a laboratory. */
function tiles() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e9f0f1";
  ctx.fillRect(0, 0, 256, 256);
  const sheen = ctx.createLinearGradient(0, 0, 256, 256);
  sheen.addColorStop(0, "rgba(255,255,255,0.5)");
  sheen.addColorStop(1, "rgba(190,205,210,0.25)");
  ctx.fillStyle = sheen;
  ctx.fillRect(6, 6, 244, 244);
  ctx.strokeStyle = "#c2cfd3";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 256);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(26, 13);
  return t;
}
/** A wall chart: rows of coloured boxes, as a table of the elements looks from across the room. */
function chart() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fbfbf7";
  ctx.fillRect(0, 0, 512, 320);
  const paints = ["#e58a7a", "#f0c36a", "#8fc79a", "#7fb4e0", "#b79ad6", "#f2a6c2"];
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 18; col++) {
      // The gap in the upper rows gives the chart its shape.
      if ((row === 0 && col > 0 && col < 17) || (row < 3 && col > 1 && col < 12)) continue;
      ctx.fillStyle = paints[col < 2 ? 0 : col < 12 ? 1 + (row % 2) : col < 17 ? 3 + ((col + row) % 2) : 5];
      ctx.fillRect(22 + col * 26, 44 + row * 36, 22, 30);
      ctx.fillStyle = "rgba(30,40,50,0.55)";
      ctx.fillRect(27 + col * 26, 52 + row * 36, 12, 4);
    }
  ctx.fillStyle = "#33424c";
  ctx.fillRect(22, 14, 180, 12);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/**
 * A laboratory bench: three plain beakers without marks, the liquid in them,
 * a card before each with what it holds, and a board with the goal. A pour is
 * shown as it is made: the beaker is lifted, turned so that its spout faces
 * the other, tipped until the liquid reaches the lip, and set back. The
 * liquid stays level however the beaker is held: it is the beaker's inside,
 * cut off by a level plane, with its surface laid on that plane.
 */
export class PourView extends TableView<State> {
  private beakers: T.Group[] = [];
  /** The parts of a beaker that are as tall as it is, and those that sit at its top. */
  private walls: T.Object3D[][] = [];
  private tops: T.Object3D[] = [];
  private liquids: T.Mesh[] = [];
  private surfaces: T.Group[] = [];
  /** For each beaker: the level its liquid is cut at, and its floor and its top, which bound the surface. */
  private cuts: { level: T.Plane; floor: T.Plane; top: T.Plane }[] = [];
  /** The stream that falls from the spout in a curve, its paint, and what it makes where it lands: a ring spreading on the water and drops thrown up. */
  private stream: T.Mesh;
  private ripples: T.Mesh[] = [];
  private drops: T.Mesh[] = [];
  private cards: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }[] = [];
  private slate: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private chosen: T.Mesh;
  private aims: T.Mesh[] = [];
  private cursor: T.Mesh;
  private arrow = new T.Group();
  /** The liquids' paint, which glows a moment when the goal is met. */
  private waters: T.MeshPhysicalMaterial[] = [];
  private xs: number[];
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low", variant = "1") {
    super(host, quality, "#dfe7ea");
    const XS = (this.xs = vesselXs(vesselsOf(Number(variant) || 1)));
    // The liquid is cut level by a plane of its own in each beaker.
    this.renderer.localClippingEnabled = true;
    this.scene.add(new T.HemisphereLight("#ffffff", "#b4c0c4", 1.7));
    const sun = new T.DirectionalLight("#ffffff", 1.9);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
    sun.shadow.camera.right = sun.shadow.camera.top = 10;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 6;
    this.own(sun.shadow);
    this.scene.add(sun);
    const flat = (mesh: T.Mesh) => {
        mesh.castShadow = false;
        return mesh;
      },
      steel = this.standard({ color: "#a3afb5", roughness: 0.28, metalness: 0.75 }),
      white = this.standard({ color: "#f6f8f8", roughness: 0.3 }),
      clear = this.own(new T.MeshPhysicalMaterial({ color: "#e8f6fa", transparent: true, opacity: 0.32, roughness: 0.04, depthWrite: false, side: T.DoubleSide }));
    // The room: a tiled wall with a chart and a clock, a shelf of flasks, and the bench with its cupboards.
    flat(this.add(new T.PlaneGeometry(52, 26), this.standard({ map: this.own(tiles()), roughness: 0.45 }), 0, 8, -3.4));
    flat(this.add(new T.BoxGeometry(3.0, 1.95, 0.08), this.standard({ color: "#55636b", roughness: 0.5 }), -6.35, 6.6, -3.3));
    flat(this.add(new T.PlaneGeometry(2.8, 1.75), this.own(new T.MeshBasicMaterial({ map: this.own(chart()) })), -6.35, 6.6, -3.24));
    flat(this.add(new T.CylinderGeometry(0.7, 0.7, 0.1, 40), white, 6.3, 7.0, -3.3)).rotation.x = Math.PI / 2;
    flat(this.add(new T.TorusGeometry(0.7, 0.06, 10, 40), steel, 6.3, 7.0, -3.24));
    const hand = this.standard({ color: "#27333a" });
    flat(this.add(new T.BoxGeometry(0.06, 0.48, 0.03), hand, 6.3, 7.22, -3.2));
    flat(this.add(new T.BoxGeometry(0.36, 0.06, 0.03), hand, 6.46, 7.0, -3.2));
    flat(this.add(new T.BoxGeometry(15, 0.16, 1.2), white, 0, 5.2, -2.7));
    for (const x of [-6.4, 6.4]) flat(this.add(new T.BoxGeometry(0.14, 0.7, 1.0), steel, x, 4.82, -2.75));
    // Flasks: a cone of glass with a neck, turned on a lathe, and the liquid inside it.
    const outline = (scale: number) => [[0, 0], [0.62, 0], [0.66, 0.06], [0.2, 0.86], [0.17, 0.92]].map(([r, y]) => new T.Vector2(r * scale, y * scale + (1 - scale) * 0.02)),
      flaskGlass = this.own(new T.LatheGeometry([...outline(1), new T.Vector2(0.17, 1.42), new T.Vector2(0.21, 1.46)], 28)),
      flaskFill = this.own(new T.LatheGeometry([...outline(0.9).slice(0, 3), new T.Vector2(0.4, 0.42), new T.Vector2(0, 0.42)], 28));
    [["#e0a92a", -5.2], ["#3fa66b", -3.6], ["#c8452f", 3.8], ["#7a4fb5", 5.4]].forEach(([color, x]) => {
      flat(this.add(flaskFill, this.standard({ color: color as string, roughness: 0.2 }), x as number, 5.3, -2.7));
      flat(this.add(flaskGlass, clear, x as number, 5.28, -2.7));
    });
    this.add(new T.BoxGeometry(19, 0.5, 6), white, 0, -0.25, 0.4);
    flat(this.add(new T.BoxGeometry(19, 0.16, 0.12), steel, 0, -0.08, 3.42));
    flat(this.add(new T.BoxGeometry(19, 4, 5.6), this.standard({ color: "#5b6a73", roughness: 0.6 }), 0, -2.5, 0.3));
    for (let i = -3; i <= 3; i++) {
      flat(this.add(new T.BoxGeometry(2.4, 1.5, 0.06), this.standard({ color: "#6c7c85", roughness: 0.55 }), i * 2.6, -1.5, 3.13));
      flat(this.add(new T.BoxGeometry(0.8, 0.07, 0.07), steel, i * 2.6, -0.98, 3.2));
    }
    // A rack of tubes at the end of the bench.
    this.add(new T.BoxGeometry(3.0, 0.16, 0.8), this.standard({ color: "#b98a4e", roughness: 0.6 }), 6.9, 0.9, -1.7);
    this.add(new T.BoxGeometry(3.0, 0.3, 0.8), this.standard({ color: "#a47a43", roughness: 0.6 }), 6.9, 0.15, -1.7);
    for (let i = 0; i < 5; i++) {
      flat(this.add(new T.CylinderGeometry(0.13, 0.13, 1.6, 14), clear, 5.8 + i * 0.55, 1.05, -1.7));
      flat(this.add(new T.CylinderGeometry(0.105, 0.105, 0.5 + (i % 3) * 0.28, 14), this.standard({ color: ["#3fa66b", "#e0a92a", "#c8452f"][i % 3], roughness: 0.25 }), 5.8 + i * 0.55, 0.56 + (i % 3) * 0.14, -1.7));
    }
    const sign = (w: number, h: number, px: number, py: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = py;
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
      const mesh = new T.Mesh(this.own(new T.PlaneGeometry(w, h)), this.own(new T.MeshBasicMaterial({ map: texture })));
      this.scene.add(mesh);
      return { canvas, texture, said: "", mesh };
    };
    // A beaker: a straight wall of glass with a gleam down it, a thick rolled lip with one spout (to its right), a flat bottom.
    const wall = this.own(new T.CylinderGeometry(RADIUS, RADIUS, 1, 48, 1, true)),
      inside = this.own(new T.CylinderGeometry(INNER, INNER, 1, 48)),
      lip = this.own(new T.TorusGeometry(RADIUS * 1.03, 0.07, 10, 48)),
      spout = this.own(new T.ConeGeometry(0.21, 0.36, 14)),
      bottom = this.own(new T.CylinderGeometry(RADIUS, RADIUS, FLOOR, 48)),
      disc = this.own(new T.CircleGeometry(INNER, 48)),
      gleam = this.own(new T.PlaneGeometry(0.16, 1)),
      glass = this.own(new T.MeshPhysicalMaterial({ color: "#dff3f8", transparent: true, opacity: 0.22, roughness: 0.03, side: T.DoubleSide, depthWrite: false })),
      thick = this.own(new T.MeshPhysicalMaterial({ color: "#d6eef5", transparent: true, opacity: 0.8, roughness: 0.06 })),
      shine = this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.42, depthWrite: false })),
      own = <X extends { dispose(): void }>(r: X) => this.own(r);
    XS.forEach((x) => {
      const cut = { level: new T.Plane(new T.Vector3(0, -1, 0), 0), floor: new T.Plane(new T.Vector3(0, 1, 0), 0), top: new T.Plane(new T.Vector3(0, -1, 0), 0) },
        beaker = new T.Group(),
        vessel = new T.Mesh(wall, glass),
        water = this.own(new T.MeshPhysicalMaterial({ color: "#2f8fd0", transparent: true, opacity: 0.85, roughness: 0.12, clippingPlanes: [cut.level] })),
        fill = new T.Mesh(inside, water),
        streak = new T.Mesh(gleam, shine),
        streak2 = new T.Mesh(gleam, shine),
        rim = new T.Group(),
        ring = new T.Mesh(lip, thick),
        beak = new T.Mesh(spout, thick),
        base = new T.Mesh(bottom, thick),
        surface = new T.Group(),
        skin = new T.Mesh(disc, this.own(new T.MeshPhysicalMaterial({ color: "#6fbdf0", transparent: true, opacity: 0.92, roughness: 0.05, side: T.DoubleSide, clippingPlanes: [cut.floor, cut.top] })));
      ring.rotation.x = Math.PI / 2;
      beak.rotation.z = -1.9;
      beak.position.x = RADIUS + 0.13;
      rim.add(ring, beak);
      base.position.y = FLOOR / 2;
      streak.position.set(-RADIUS * 0.5, 0, RADIUS * 0.87);
      streak2.position.set(RADIUS * 0.62, 0, RADIUS * 0.79);
      streak2.scale.x = 0.45;
      vessel.renderOrder = 3;
      streak.renderOrder = streak2.renderOrder = 4;
      fill.renderOrder = 1;
      skin.renderOrder = 2;
      skin.rotation.x = -Math.PI / 2;
      surface.add(skin);
      fill.castShadow = true;
      beaker.add(fill, base, vessel, streak, streak2, rim);
      this.beakers.push(beaker);
      this.walls.push([vessel, fill, streak, streak2]);
      this.tops.push(rim);
      this.liquids.push(fill);
      this.waters.push(water);
      this.surfaces.push(surface);
      this.cuts.push(cut);
      this.scene.add(beaker, surface);
      // The card stands in a little holder before the beaker.
      const card = sign(1.9, 1.0, 304, 160);
      card.mesh.position.set(x, 0.56, 1.95);
      card.mesh.rotation.x = -0.35;
      this.add(new T.BoxGeometry(2.0, 0.1, 0.34), steel, x, 0.05, 2.02);
      this.cards.push(card);
    });
    // What runs from one beaker into the other while it is poured: a stream bent by its fall (laid anew each frame),
    // a ring that spreads where it strikes the water, and drops thrown up there.
    const streamPaint = this.own(new T.MeshPhysicalMaterial({ color: "#4fa6e6", transparent: true, opacity: 0.82, roughness: 0.08 }));
    this.stream = new T.Mesh(new T.BufferGeometry(), streamPaint);
    this.stream.visible = false;
    this.stream.renderOrder = 4;
    this.scene.add(this.stream);
    const ringShape = this.own(new T.RingGeometry(0.7, 1, 32).rotateX(-Math.PI / 2)),
      drop = this.own(new T.SphereGeometry(0.045, 8, 6));
    for (let i = 0; i < 3; i++) {
      const ripple = new T.Mesh(ringShape, this.own(new T.MeshBasicMaterial({ color: "#d8f0ff", transparent: true, opacity: 0, depthWrite: false })));
      ripple.visible = false;
      ripple.renderOrder = 5;
      this.ripples.push(ripple);
      this.scene.add(ripple);
    }
    for (let i = 0; i < 7; i++) {
      const bead = new T.Mesh(drop, streamPaint);
      bead.visible = false;
      this.drops.push(bead);
      this.scene.add(bead);
    }
    // More of the laboratory, at the ends of the bench: a microscope and a wash bottle at the left.
    const black = this.standard({ color: "#2b3236", roughness: 0.45 }),
      cream = this.standard({ color: "#ece8df", roughness: 0.5 }),
      left = XS[0] - 2.75;
    this.add(new T.BoxGeometry(0.9, 0.12, 1.0), black, left, 0.06, -1.5);
    this.add(new T.CylinderGeometry(0.09, 0.11, 1.1, 12), cream, left, 0.65, -1.85).rotation.x = 0.15;
    this.add(new T.BoxGeometry(0.7, 0.06, 0.6), black, left, 0.55, -1.42);
    const tube = this.add(new T.CylinderGeometry(0.11, 0.13, 0.95, 16), cream, left, 1.25, -1.6);
    tube.rotation.x = -0.45;
    this.add(new T.CylinderGeometry(0.05, 0.05, 0.25, 10), black, left, 1.72, -1.83).rotation.x = -0.45;
    this.add(new T.CylinderGeometry(0.16, 0.16, 0.1, 16), black, left + 0.28, 0.95, -1.8).rotation.z = Math.PI / 2;
    const bottle = this.own(new T.LatheGeometry([[0, 0], [0.26, 0], [0.28, 0.05], [0.28, 0.6], [0.2, 0.72], [0.09, 0.78], [0.09, 0.86], [0, 0.86]].map(([r, y]) => new T.Vector2(r, y)), 20));
    this.add(bottle, this.standard({ color: "#f3f6f7", roughness: 0.35, transparent: true, opacity: 0.88 }), left + 0.2, 0, 0.75);
    const nozzle = this.add(new T.CylinderGeometry(0.025, 0.025, 0.55, 8), this.standard({ color: "#f3f6f7", roughness: 0.4 }), left + 0.42, 0.98, 0.75);
    nozzle.rotation.z = -1.0;
    // The goal is written on a whiteboard in a frame, with a ledge for the pens.
    const slate = sign(9, 1.1, 1152, 140);
    slate.mesh.position.set(0, 8.0, -3.2);
    flat(this.add(new T.BoxGeometry(9.3, 1.4, 0.08), steel, 0, 8.0, -3.3));
    flat(this.add(new T.BoxGeometry(9.3, 0.08, 0.3), steel, 0, 7.3, -3.15));
    for (const [color, x] of [["#c8452f", -0.5], ["#2f62c0", 0], ["#27333a", 0.5]] as const) flat(this.add(new T.CylinderGeometry(0.05, 0.05, 0.4, 10), this.standard({ color }), x, 7.39, -3.1)).rotation.z = Math.PI / 2;
    this.slate = slate;
    this.chosen = ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#f0a020");
    this.cursor = ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#3f8cff");
    for (let i = 1; i < XS.length; i++) this.aims.push(ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#3fa66b"));
    // The arrow of a hint: it stands over the beaker that is to be poured into, pointing down into it.
    const gold = this.own(new T.MeshBasicMaterial({ color: "#f0a020", depthTest: false, transparent: true, opacity: 0.96, side: T.DoubleSide })),
      tip = new T.Mesh(this.own(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.5, 0.66), new T.Vector2(0.5, 0.66)]))), gold),
      shaft = new T.Mesh(this.own(new T.PlaneGeometry(0.32, 1.0)), gold);
    shaft.position.y = 1.14;
    shaft.renderOrder = tip.renderOrder = 9;
    this.arrow.add(shaft, tip);
    this.arrow.visible = false;
    this.scene.add(this.chosen, this.cursor, ...this.aims, this.arrow);
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    const wide = this.xs.length === 4 ? 1.15 : 0;
    return { half: (aspect < 1 ? 5.2 : 6.4) + wide, halfZ: 1.2, height: 8.2, lookY: 3.6, tilt: 0.3 };
  }
  protected spots(): Spot[] {
    const state = this.state;
    return state ? this.xs.map((x, i) => ({ x, y: (state.caps[i] * LITRE) / 2, z: 0, r: this.xs.length === 4 ? 1.4 : 1.5, point: i })) : [];
  }
  dispose() {
    this.stream.geometry.dispose();
    super.dispose();
  }
  private write(sign: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }, text: string, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    if (sign.said === text) return;
    sign.said = text;
    paint(sign.canvas.getContext("2d")!, sign.canvas.width, sign.canvas.height);
    sign.texture.needsUpdate = true;
  }
  /** Lays the beakers out with so much in each (fractions while a pour is shown); a beaker stands in its place unless `held` says otherwise. */
  private fill(state: State, amounts: number[], held?: { beaker: number; pose: Pose }) {
    // Once solved, the cards of the vessels that hold the goal turn green and the board is ticked.
    const won = state.winner === 0 && amounts === state.amounts ? (holding(state.amounts, state.goal) ?? []) : [];
    this.xs.forEach((x, i) => {
      const tall = state.caps[i] * LITRE + 0.25,
        deep = amounts[i] * LITRE,
        pose = held?.beaker === i ? held.pose : { x, y: 0, tilt: 0, turn: 0 },
        beaker = this.beakers[i];
      beaker.position.set(pose.x, pose.y, 0);
      beaker.rotation.set(0, pose.turn, -pose.tilt);
      for (const part of this.walls[i]) {
        part.scale.y = tall;
        part.position.y = tall / 2;
      }
      this.liquids[i].scale.y = tall - FLOOR;
      this.liquids[i].position.y = FLOOR + (tall - FLOOR) / 2;
      this.tops[i].position.y = tall;
      // Which way the beaker's own "up" points now, and the point on its axis that the liquid's surface passes through.
      const up = new T.Vector3(Math.sin(pose.tilt) * Math.cos(pose.turn), Math.cos(pose.tilt), -Math.sin(pose.tilt) * Math.sin(pose.turn)),
        foot = new T.Vector3(pose.x, pose.y, 0),
        middle = foot.clone().addScaledVector(up, FLOOR + deep),
        wet = amounts[i] > 0.001,
        { level, floor, top } = this.cuts[i];
      this.liquids[i].visible = this.surfaces[i].visible = wet;
      // The liquid is the inside of the beaker below a level plane; its surface lies on that plane, as wide as the tipped beaker cuts it.
      level.constant = middle.y;
      floor.normal.copy(up);
      floor.constant = -up.dot(foot) - FLOOR;
      top.normal.copy(up).negate();
      top.constant = up.dot(foot) + tall - 0.02;
      this.surfaces[i].position.copy(middle);
      this.surfaces[i].rotation.y = pose.turn;
      this.surfaces[i].scale.x = 1 / Math.max(0.12, Math.cos(pose.tilt));
      const now = Math.round(amounts[i]);
      const good = won.includes(i);
      this.write(this.cards[i], `${now}/${state.caps[i]}${good ? "!" : ""}`, (ctx, w, h) => {
        ctx.fillStyle = good ? "#e6f6df" : "#fbf7ec";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = good ? "#3a9a4a" : "#2f6fa8";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        // The amount large, the size of the vessel small beside it; both are made to fit the card whatever the numbers.
        const big = String(now),
          small = `/ ${state.caps[i]}리터`,
          room = w - 36;
        let size = 104;
        const widths = () => {
          ctx.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`;
          const a = ctx.measureText(big).width;
          ctx.font = `700 ${Math.round(size * 0.42)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
          return [a, ctx.measureText(small).width];
        };
        let [a, b] = widths();
        while (a + 12 + b > room && size > 40) {
          size -= 4;
          [a, b] = widths();
        }
        const left = (w - (a + 12 + b)) / 2;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = good ? "#2a7a3a" : "#1f5f98";
        ctx.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText(big, left, h * 0.54);
        ctx.fillStyle = "#5c5a55";
        ctx.font = `700 ${Math.round(size * 0.42)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
        ctx.fillText(small, left + a + 12, h * 0.6);
      });
    });
    const ticked = won.length > 0;
    this.write(this.slate, `${goalText(state)}${ticked ? "!" : ""}`, (ctx, w, h) => {
      // A whiteboard in a metal frame.
      ctx.fillStyle = "#fdfdfb";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#8f9ca2";
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = "#1f3a52";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // The longest goal must fit the slate as well as the shortest (with room for the tick once it is met).
      const room = w - 60 - (ticked ? 150 : 0);
      let size = 64;
      do ctx.font = `700 ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
      while (ctx.measureText(`목표: ${goalText(state)}`).width > room && (size -= 3) > 30);
      ctx.fillText(`목표: ${goalText(state)}`, w / 2 - (ticked ? 60 : 0), h / 2 + 4);
      if (ticked) {
        // Met: a tick in red marker at the end of the line, as a teacher would mark it.
        const end = w / 2 - 60 + ctx.measureText(`목표: ${goalText(state)}`).width / 2 + 40;
        ctx.strokeStyle = "#d0382a";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(end, h * 0.5);
        ctx.lineTo(end + 26, h * 0.78);
        ctx.lineTo(end + 80, h * 0.16);
        ctx.stroke();
      }
    });
  }
  protected place(state: State) {
    this.stream.visible = false;
    for (const ripple of this.ripples) ripple.visible = false;
    for (const bead of this.drops) bead.visible = false;
    for (const water of this.waters) water.emissive.setRGB(0, 0, 0);
    this.fill(state, state.amounts);
  }
  /** Lays the stream from the spout to where it strikes: it leaves the lip level and bends down as it falls, `thick` its width. */
  private bend(from: T.Vector3, to: T.Vector3, thick: number, wobble: number) {
    const points: T.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const s = k / 10;
      points.push(new T.Vector3(from.x + (to.x - from.x) * s + Math.sin(s * 9 + wobble) * 0.012 * s, from.y - (from.y - to.y) * s * s, Math.cos(s * 7 + wobble) * 0.01 * s));
    }
    this.stream.geometry.dispose();
    this.stream.geometry = new T.TubeGeometry(new T.CatmullRomCurve3(points), 22, Math.max(0.012, thick), 8);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    const XS = this.xs,
      { from, to } = last,
      way = Math.sign(XS[to] - XS[from]),
      tall = state.caps[from] * LITRE + 0.25,
      over = state.caps[to] * LITRE + 0.25,
      // A beaker carried past others is lifted clear of the tallest between.
      between = XS.flatMap((_, k) => ((k - from) * (k - to) < 0 ? [state.caps[k] * LITRE + 0.25] : [])),
      clearance = between.length ? Math.max(...between) + 0.2 : 0,
      smooth = (p: number) => p * p * (3 - 2 * p),
      span = (p: number, a: number, b: number) => smooth(Math.max(0, Math.min(1, (p - a) / (b - a)))),
      ms = 1700,
      landing = new T.Vector3(),
      spout = new T.Vector3();
    let heard = false;
    // Lifted, carried over (turned round when the other stands to its left, so that the spout leads), tipped until
    // the liquid reaches the lip, held there while it runs in a curve into the other, then carried back and set down.
    this.tween(0, ms, (p) => {
      const up = span(p, 0, 0.12) * (1 - span(p, 0.9, 1)),
        across = span(p, 0.06, 0.3) * (1 - span(p, 0.78, 0.94)),
        pouring = Math.max(0, Math.min(1, (p - 0.3) / 0.48)),
        amounts = before.amounts.map((v, i) => v + (state.amounts[i] - v) * smooth(pouring)),
        // Just far enough for the level liquid to reach the lip: more as the beaker empties.
        need = Math.max(0.35, Math.min(1.42, Math.atan((tall - FLOOR - amounts[from] * LITRE) / RADIUS) + 0.06)),
        tilt = across * need,
        turn = way < 0 ? Math.PI * across : 0,
        // Where the tipped beaker carries its spout, from its foot.
        reach = Math.cos(turn) * (RADIUS * Math.cos(tilt) + tall * Math.sin(tilt)),
        rise = tall * Math.cos(tilt) - RADIUS * Math.sin(tilt),
        x = XS[from] + (XS[to] - way * RADIUS * 0.4 - reach - XS[from]) * across,
        y = Math.max(over + 0.5 - rise, clearance + RADIUS * Math.sin(tilt), 0.6) * up;
      this.fill(state, amounts, { beaker: from, pose: { x, y, tilt, turn } });
      const running = pouring > 0.02 && pouring < 0.98,
        flow = Math.sqrt(Math.sin(Math.PI * pouring)),
        now = p * ms,
        level = FLOOR + amounts[to] * LITRE;
      this.stream.visible = running;
      spout.set(x + reach + way * 0.08, y + rise, 0);
      landing.set(XS[to] - way * 0.22, level, 0);
      if (running) {
        this.bend(spout, landing, 0.075 * flow, now / 90);
        if (!heard) {
          heard = true;
          this.onContact();
        }
      }
      // Rings spread on the water where it strikes, and drops leap up and fall back.
      this.ripples.forEach((ripple, k) => {
        const phase = (now / 460 + k / this.ripples.length) % 1;
        ripple.visible = running;
        ripple.position.set(landing.x, level + 0.012, 0);
        ripple.scale.setScalar(0.12 + phase * 0.62);
        (ripple.material as T.MeshBasicMaterial).opacity = 0.65 * (1 - phase) * flow;
      });
      this.drops.forEach((bead, k) => {
        const phase = (now / 380 + k / this.drops.length) % 1,
          a = (k / this.drops.length) * Math.PI * 2 + 0.6,
          far = (0.12 + (k % 3) * 0.08) * phase;
        bead.visible = running && flow > 0.35 && amounts[to] > 0.2;
        bead.position.set(landing.x + Math.cos(a) * far, level + 4 * phase * (1 - phase) * (0.16 + (k % 2) * 0.1), Math.sin(a) * far);
      });
    });
    if (state.winner === 0 && before.winner === null) {
      // Solved: the water that meets the goal glows a moment and a chime rings.
      const glowing = (holding(state.amounts, state.goal) ?? []).map((i) => this.waters[i]);
      let rang = false;
      this.tween(ms, 900, (p) => {
        if (!rang) {
          rang = true;
          this.onKnock?.("pocket", 1);
        }
        for (const water of glowing) water.emissive.setRGB(0.12, 0.32, 0.5).multiplyScalar(Math.sin(Math.PI * p));
      });
    }
    return true;
  }
  protected mark(marks: Marks) {
    const XS = this.xs,
      put = (ring: T.Mesh, point: number | null | undefined) => {
        ring.visible = point !== null && point !== undefined && point >= 0 && point < XS.length;
        if (ring.visible) ring.position.set(XS[point!], 0.012, 0);
      };
    put(this.chosen, marks.selected);
    put(this.cursor, marks.cursor);
    this.aims.forEach((ring, i) => put(ring, marks.targets[i]));
    const hint = marks.hint,
      state = this.state;
    this.arrow.visible = !!hint && !!state;
    if (hint && state) this.arrow.position.set(XS[hint.to], state.caps[hint.to] * LITRE + 0.7, 0.4);
  }
}
