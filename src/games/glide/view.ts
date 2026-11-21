import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, glossy, stuff } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CUBE, SWIPE, TILE_TOP, WAY, arrowAt, cellAt, cellUnder, glideSubject, spotAt, swipeDir } from "./layout";
import { AIR, BACKSLASH, BLOCK, GATE, GOAL, ICE, PORTAL, SLASH, SWITCH, attempt, type State } from "./rules";
import { TURTLE_TOP, turtle, type Mood, type Turtle } from "./turtle";

export const GLIDE_COLORS: [string, string] = ["#4f9e3c", "#5a6472"];
/** The colours of the portal pairs and of the gates (with their switch), by tag. */
const PORTAL_PAINT = ["#a46bff", "#22c3ad"],
  GATE_PAINT = ["#2fa86b", "#e0563f"];
const SLAB = 0.92,
  SLAB_H = 0.26,
  /** The middle of the turtle (the piece the rules call the cube) at rest, and how tall the blocks, the ice and a raised gate stand. */
  REST = TILE_TOP + CUBE / 2,
  BLOCK_H = 0.72,
  GATE_H = 0.62,
  WELL = 0.32,
  /** How long a speech bubble stays, in seconds, the last part of it fading. */
  SAID = 1.15,
  FADE = 0.3;
/** A sequence for scenery, the same every time. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const canvasOf = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
const textureOf = (c: HTMLCanvasElement, srgb = true) => {
  const t = new T.CanvasTexture(c);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** Pale marble: a cream ground with soft clouds of grey and a few fine veins. */
function marble() {
  const { c, ctx } = canvasOf(512),
    rand = sequence(9137);
  ctx.fillStyle = "#ebe6dc";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    const x = rand() * 512,
      y = rand() * 512,
      r = 40 + rand() * 120,
      g = ctx.createRadialGradient(x, y, 0, x, y, r),
      tone = rand() < 0.5 ? "190, 184, 176" : "222, 214, 200";
    g.addColorStop(0, `rgba(${tone}, 0.22)`);
    g.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let v = 0; v < 7; v++) {
    let x = rand() * 512,
      y = rand() * 512,
      a = rand() * Math.PI * 2;
    ctx.strokeStyle = `rgba(120, 116, 112, ${0.18 + rand() * 0.25})`;
    ctx.lineWidth = 0.8 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 40; k++) {
      a += (rand() - 0.5) * 0.7;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return textureOf(c);
}
/** The sky behind everything: blue overhead, pale lilac and then a warm haze toward the mist below. */
function sky() {
  const { c, ctx } = canvasOf(4, 256),
    g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#86a9d6");
  g.addColorStop(0.45, "#d9d9ec");
  g.addColorStop(1, "#f4dccf");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return textureOf(c);
}
/** Soft clouds of mist that tile: white puffs on nothing. */
function clouds(seed: number) {
  const { c, ctx } = canvasOf(512),
    rand = sequence(seed);
  for (let i = 0; i < 90; i++) {
    const x = rand() * 512,
      y = rand() * 512,
      r = 30 + rand() * 90;
    for (const [dx, dy] of [
      [0, 0],
      [512, 0],
      [-512, 0],
      [0, 512],
      [0, -512],
    ]) {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      g.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  const t = textureOf(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A portal's swirl in its colour: a dark eye, arms of light turning in to a bright middle. */
function swirl(color: string) {
  const { c, ctx } = canvasOf(256),
    deep = new T.Color(color).multiplyScalar(0.45).getStyle(),
    g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.3, color);
  g.addColorStop(1, deep);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 127, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineCap = "round";
  for (let arm = 0; arm < 4; arm++) {
    ctx.lineWidth = 8;
    ctx.beginPath();
    for (let k = 0; k <= 60; k++) {
      const t = k / 60,
        a = arm * (Math.PI / 2) + t * Math.PI * 1.6,
        r = 12 + t * 104;
      const x = 128 + Math.cos(a) * r,
        y = 128 + Math.sin(a) * r;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  return textureOf(c);
}
/** The engraving on a "/" turner's tile: a curved arrow with a head at each end in each open half. */
function turnMarks() {
  const { c, ctx } = canvasOf(256);
  ctx.strokeStyle = ctx.fillStyle = "rgba(92, 62, 20, 0.72)";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  const head = (x: number, y: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(x + dx * 20, y + dy * 20);
    ctx.lineTo(x - dy * 13, y + dx * 13);
    ctx.lineTo(x + dy * 13, y - dx * 13);
    ctx.closePath();
    ctx.fill();
  };
  // North-west half: from the west side's middle round to the north side's; south-east likewise.
  ctx.beginPath();
  ctx.arc(0, 0, 92, 0.18, Math.PI / 2 - 0.18);
  ctx.stroke();
  head(90, 16, 0, -1);
  head(16, 90, -1, 0);
  ctx.beginPath();
  ctx.arc(256, 256, 92, Math.PI + 0.18, Math.PI * 1.5 - 0.18);
  ctx.stroke();
  head(166, 240, 0, 1);
  head(240, 166, 1, 0);
  return textureOf(c);
}
/** Cracks in clear ice: white lines from a few points, and a frost at the edges. */
function cracks() {
  const { c, ctx } = canvasOf(256),
    rand = sequence(4421);
  ctx.fillStyle = "#cfe9f7";
  ctx.fillRect(0, 0, 256, 256);
  const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 180);
  g.addColorStop(0, "rgba(255, 255, 255, 0)");
  g.addColorStop(1, "rgba(255, 255, 255, 0.7)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  for (let s = 0; s < 4; s++) {
    const x0 = 40 + rand() * 176,
      y0 = 40 + rand() * 176;
    for (let b = 0; b < 5; b++) {
      let x = x0,
        y = y0,
        a = rand() * Math.PI * 2;
      ctx.lineWidth = 1 + rand() * 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        a += (rand() - 0.5) * 0.9;
        x += Math.cos(a) * (8 + rand() * 14);
        y += Math.sin(a) * (8 + rand() * 14);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  return textureOf(c);
}
/** A soft beam of light: bright at its foot, fading upward and toward its edges. */
function beamTexture() {
  const { c, ctx } = canvasOf(64, 256),
    g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  g.addColorStop(0.5, "rgba(255, 255, 255, 0.25)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = "destination-in";
  const side = ctx.createLinearGradient(0, 0, 64, 0);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.5, "rgba(0,0,0,1)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 64, 256);
  return textureOf(c);
}
/** The inside of the well: dark at its lip, lit from below. */
function wellTexture() {
  const { c, ctx } = canvasOf(4, 128),
    g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#1a2a3a");
  g.addColorStop(0.6, "#2f7d95");
  g.addColorStop(1, "#bff6ff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return textureOf(c);
}
/** A rough rock hanging under a tile, as a turned cone with its apex down and its rim jagged (open at the top). */
function rock(seed: number) {
  const g = new T.ConeGeometry(0.5, 1, 8, 3, true).rotateX(Math.PI).translate(0, -0.5, 0),
    at = g.getAttribute("position"),
    rand = sequence(seed);
  for (let i = 0; i < at.count; i++) {
    const y = at.getY(i);
    if (y > -0.01) continue;
    const k = 1 + (rand() - 0.5) * 0.45;
    at.setXYZ(i, at.getX(i) * k, y * (0.9 + rand() * 0.2), at.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}
const merged = (pieces: T.BufferGeometry[]) => mergeGeometries(pieces.map((p) => (p.index ? p.toNonIndexed() : p)))!;
/** A flat arrow lying on the table, pointing north (−z), `length` long. */
function arrowShape(length: number, width: number) {
  const s = new T.Shape([
    new T.Vector2(-width * 0.32, -length / 2),
    new T.Vector2(width * 0.32, -length / 2),
    new T.Vector2(width * 0.32, length * 0.05),
    new T.Vector2(width * 0.7, length * 0.05),
    new T.Vector2(0, length / 2),
    new T.Vector2(-width * 0.7, length * 0.05),
    new T.Vector2(-width * 0.32, length * 0.05),
  ]);
  return new T.ShapeGeometry(s).rotateX(-Math.PI / 2);
}
/** One part of the cube's way: from one place to the next, by sliding or through a portal. */
interface Leg {
  from: { x: number; z: number };
  to: { x: number; z: number };
  warp: boolean;
  /** Where on the way (in cells) it begins and how long it is. */
  at: number;
  length: number;
  /** The cube is turned by a turner where this leg ends. */
  turn: boolean;
  /** A switch where it ends flips the gates of this colour. */
  toggle?: number;
  fall: boolean;
}
/**
 * Tiles of pale marble floating over a void of soft mist under a lilac sky, each with a rough rock hanging under it,
 * and far floating islands round about. On the tiles: blocks of dark basalt with rounded edges, turners as brass
 * ridges across the diagonal on engraved tiles, clear cracked ice that shatters into shards, portals as rings of
 * one colour round a swirl, switches as enamelled buttons and gates as enamelled blocks that sink flush, and the
 * goal as a well cut through its tile, lit from far below, with a beam rising from it. The piece the rules call the
 * cube is a turtle lying on its back (`turtle.ts`), paddling its legs. It slides cell by cell, eased, spinning round
 * on its shell, and comes to rest looking at the player; into a portal it shrinks away and grows out of the other;
 * off the edge it tips over and tumbles down into the mist crying 으아악!; against a block, ice or a gate it says
 * 아쿵! (speech bubbles over the canvas, decoration); on the goal it wriggles happily and sinks into the well. A
 * swipe anywhere (screen up is north), a tap on one of the four arrows round the cube, or a tap on the board in the
 * cube's row or column pushes it.
 */
export class GlideView extends TableView<State> {
  private board = new T.Group();
  private built: number[] | null = null;
  private laid: { dispose(): void }[] = [];
  private ice = new Map<number, T.Mesh>();
  private gates: { cell: number; tag: number; mesh: T.Mesh }[] = [];
  private paint: Record<string, T.Material> = {};
  private shapes: Record<string, T.BufferGeometry> = {};
  /** What moves over the tiles: the turtle, held so that its middle is at `REST`. */
  private cube = new T.Group();
  private critter: Turtle;
  private mood: Mood = "rest";
  /** The speech bubbles' layer over the canvas, the bubble, and when it was said (seconds, by the page's clock). */
  private layer: HTMLDivElement;
  private bubble: HTMLDivElement;
  private saidAt = -Infinity;
  private clock = 0;
  private well: { beam: T.Mesh; floor: T.MeshBasicMaterial; light: T.PointLight } | null = null;
  private arrows: T.Mesh[] = [];
  private arrowPaint: T.MeshBasicMaterial[] = [];
  private hintArrow: T.Mesh;
  private hintRing: T.Mesh;
  private shards: T.Mesh[] = [];
  private shardPaint: T.MeshStandardMaterial;
  private hovered = -1;
  private sliding = false;
  protected pressWhileMoving = true;
  /** Busy only while the cube travels (or falls, or sinks into the well); what follows a stop is decoration. */
  get animating() {
    return this.sliding || (super.animating && this.fallingOrHome);
  }
  private fallingOrHome = false;
  /** A press: where it began on the table and on the screen, and the arrow it began on. */
  private press: { point: number; at: { x: number; z: number }; screen: { x: number; y: number } } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9e0ea");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.background = keep(sky());
    this.scene.fog = new T.Fog("#c9cbe6", 16, 40);
    this.daylight("#f2f0ff", "#b9a7c4", "#fff1de", 8, 2.1);
    const p = (name: string, material: T.Material) => (this.paint[name] = this.own(material));
    p("marble", new T.MeshStandardMaterial({ map: keep(marble()), roughness: 0.42, metalness: 0.02 }));
    p("rock", new T.MeshStandardMaterial({ ...stuff("stone", "#8d8278", 1, keep), roughness: 0.95, flatShading: true }));
    p("basalt", new T.MeshStandardMaterial({ ...stuff("stone", "#3b3e44", 1, keep), roughness: 0.62, metalness: 0.05 }));
    p("brass", new T.MeshStandardMaterial({ color: "#c99a3e", metalness: 0.85, roughness: 0.3 }));
    p("turnMarks", new T.MeshBasicMaterial({ map: keep(turnMarks()), transparent: true, depthWrite: false }));
    p("ice", glossy({ color: "#a8dcf6", map: keep(cracks()), transparent: true, opacity: 0.78, roughness: 0.06, metalness: 0.05, emissive: "#3f9fd6", emissiveIntensity: 0.32 }));
    PORTAL_PAINT.forEach((color, i) => {
      p(`portal${i}`, new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.3 }));
      p(`swirl${i}`, new T.MeshBasicMaterial({ map: keep(swirl(color)) }));
    });
    GATE_PAINT.forEach((color, i) => {
      p(`gate${i}`, glossy({ color, roughness: 0.25, metalness: 0.1, emissive: color, emissiveIntensity: 0.12 }));
      p(`button${i}`, glossy({ color, roughness: 0.2, metalness: 0.1, emissive: color, emissiveIntensity: 0.3 }));
    });
    p("stripe", new T.MeshStandardMaterial({ color: "#f5f3ee", roughness: 0.5 }));
    p("wellWall", new T.MeshBasicMaterial({ map: keep(wellTexture()), side: T.BackSide }));
    p("deep", new T.MeshBasicMaterial({ color: "#9fabd8" }));
    p("mist", new T.MeshBasicMaterial({ map: keep(clouds(77)), transparent: true, opacity: 0.7, depthWrite: false }));
    p("haze", new T.MeshBasicMaterial({ map: keep(clouds(313)), transparent: true, opacity: 0.22, depthWrite: false }));
    p("grass", new T.MeshStandardMaterial({ ...stuff("grass", "#86ad62", 1, keep), roughness: 1 }));
    p("leaf", new T.MeshStandardMaterial({ color: "#5d8f4e", roughness: 0.9, flatShading: true }));
    p("bark", new T.MeshStandardMaterial({ color: "#6b4e38", roughness: 0.9 }));
    const g = (name: string, geometry: T.BufferGeometry) => (this.shapes[name] = this.own(geometry));
    g("slab", block(SLAB, SLAB_H, SLAB, 0.05).translate(0, TILE_TOP - SLAB_H / 2, 0));
    for (let k = 0; k < 4; k++) g(`rock${k}`, rock(101 + k * 37));
    g("block", block(0.84, BLOCK_H, 0.84, 0.11).translate(0, TILE_TOP + BLOCK_H / 2, 0));
    g("ice", block(0.84, BLOCK_H * 0.92, 0.84, 0.07).translate(0, TILE_TOP + (BLOCK_H * 0.92) / 2, 0));
    g("gate", block(0.84, GATE_H, 0.84, 0.06).translate(0, GATE_H / 2, 0));
    g("gateStripe", block(0.86, 0.07, 0.86, 0.02).translate(0, GATE_H * 0.72, 0));
    // A turner: a brass ridge of three-cornered section across the "/" diagonal, a post at each end.
    const ridge = new T.Shape([new T.Vector2(-0.11, 0), new T.Vector2(0.11, 0), new T.Vector2(0.025, 0.2), new T.Vector2(-0.025, 0.2)]),
      length = SLAB * Math.SQRT2 - 0.34;
    g(
      "turner",
      merged([
        new T.ExtrudeGeometry(ridge, { depth: length, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }).translate(0, 0, -length / 2).rotateY(-Math.PI / 4),
        new T.CylinderGeometry(0.07, 0.085, 0.3, 16).translate(-0.33, 0.15, 0.33),
        new T.CylinderGeometry(0.07, 0.085, 0.3, 16).translate(0.33, 0.15, -0.33),
        new T.SphereGeometry(0.075, 14, 10).translate(-0.33, 0.31, 0.33),
        new T.SphereGeometry(0.075, 14, 10).translate(0.33, 0.31, -0.33),
      ]).translate(0, TILE_TOP, 0),
    );
    g("decal", new T.PlaneGeometry(SLAB * 0.98, SLAB * 0.98).rotateX(-Math.PI / 2).translate(0, TILE_TOP + 0.004, 0));
    g("ring", new T.TorusGeometry(0.33, 0.055, 12, 40).rotateX(Math.PI / 2).translate(0, TILE_TOP + 0.05, 0));
    g("swirl", new T.CircleGeometry(0.3, 40).rotateX(-Math.PI / 2).translate(0, TILE_TOP + 0.012, 0));
    g("button", new T.CylinderGeometry(0.24, 0.26, 0.07, 32).translate(0, TILE_TOP + 0.035, 0));
    g("buttonRim", new T.TorusGeometry(0.29, 0.03, 10, 36).rotateX(Math.PI / 2).translate(0, TILE_TOP + 0.02, 0));
    // The goal's tile: a slab with a round well cut through it, a brass lip, and the well's lit wall below.
    const holed = new T.Shape([new T.Vector2(-SLAB / 2, -SLAB / 2), new T.Vector2(SLAB / 2, -SLAB / 2), new T.Vector2(SLAB / 2, SLAB / 2), new T.Vector2(-SLAB / 2, SLAB / 2)]);
    holed.holes.push(new T.Path().absarc(0, 0, WELL, 0, Math.PI * 2, true));
    g("holed", new T.ExtrudeGeometry(holed, { depth: SLAB_H, bevelEnabled: false, curveSegments: 40 }).rotateX(-Math.PI / 2).translate(0, TILE_TOP - SLAB_H, 0));
    g("lip", new T.TorusGeometry(WELL + 0.02, 0.035, 10, 44).rotateX(Math.PI / 2).translate(0, TILE_TOP + 0.01, 0));
    g("wellWall", new T.CylinderGeometry(WELL, WELL, 0.9, 40, 1, true).translate(0, TILE_TOP - 0.45, 0));
    g("wellFloor", new T.CircleGeometry(WELL, 40).rotateX(-Math.PI / 2).translate(0, TILE_TOP - 0.88, 0));
    g("beam", new T.CylinderGeometry(0.24, 0.31, 2.2, 32, 1, true).translate(0, TILE_TOP + 1.1, 0));
    g("arrow", arrowShape(0.42, 0.34));
    g("hintArrow", arrowShape(0.62, 0.46));
    g("shard", new T.TetrahedronGeometry(0.13, 0));
    // The turtle on its back, its shell on the tile.
    this.critter = turtle(keep);
    this.critter.root.position.y = TILE_TOP - REST;
    this.cube.add(this.critter.root);
    this.scene.add(this.board, this.cube);
    // Its speech bubbles: words over the canvas, decoration only.
    this.layer = document.createElement("div");
    this.layer.className = "gl-say";
    this.layer.setAttribute("aria-hidden", "true");
    Object.assign(this.layer.style, { position: "absolute", pointerEvents: "none", overflow: "hidden", zIndex: "3", left: "0", top: "0", width: "0", height: "0" });
    this.bubble = document.createElement("div");
    Object.assign(this.bubble.style, {
      position: "absolute",
      display: "none",
      padding: "0.28em 0.8em 0.32em",
      borderRadius: "1.1em",
      border: "3px solid #2b2233",
      fontWeight: "900",
      lineHeight: "1.1",
      whiteSpace: "nowrap",
      letterSpacing: "0.02em",
      webkitTextStroke: "0.035em currentColor",
      boxShadow: "0 4px 0 rgba(43, 34, 51, 0.28)",
      transformOrigin: "50% 100%",
    });
    const tail = document.createElement("span");
    Object.assign(tail.style, {
      position: "absolute",
      left: "50%",
      bottom: "-9px",
      width: "13px",
      height: "13px",
      marginLeft: "-8px",
      background: "inherit",
      borderRight: "3px solid #2b2233",
      borderBottom: "3px solid #2b2233",
      transform: "rotate(45deg)",
    });
    this.bubble.append(document.createElement("b"), tail);
    this.layer.append(this.bubble);
    host.append(this.layer);
    // The four arrows round the cube, and the hint's arrow and ring in gold.
    for (let d = 0; d < 4; d++) {
      const material = this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.78, depthTest: false, depthWrite: false })),
        arrow = new T.Mesh(this.shapes.arrow, material);
      arrow.rotation.y = -d * (Math.PI / 2);
      arrow.renderOrder = 6;
      arrow.visible = false;
      this.arrowPaint.push(material);
      this.arrows.push(arrow);
      this.scene.add(arrow);
    }
    this.hintArrow = new T.Mesh(this.shapes.hintArrow, this.own(new T.MeshBasicMaterial({ color: "#ffb21f", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })));
    this.hintArrow.renderOrder = 7;
    this.hintArrow.visible = false;
    this.hintRing = ringMesh(keep, 0.5, 0.58, "#ffb21f");
    this.scene.add(this.hintArrow, this.hintRing);
    this.shardPaint = this.own(new T.MeshStandardMaterial({ color: "#d8f3ff", transparent: true, opacity: 0.8, roughness: 0.1, emissive: "#8fd8ff", emissiveIntensity: 0.25 }));
    for (let k = 0; k < 14; k++) {
      const shard = new T.Mesh(this.shapes.shard, this.shardPaint);
      shard.visible = false;
      this.shards.push(shard);
      this.scene.add(shard);
    }
    this.scenery();
    this.begin();
    this.clock = requestAnimationFrame(this.idle);
  }
  /**
   * The turtle paddles its legs (held still under reduced motion), and a bubble follows it on the screen and fades.
   * At rest it paddles only where a graphics card draws: drawn by the processor alone (as in the browser tests) a frame
   * of this table took half a second, so there the legs move only while the table is drawn anyway.
   */
  private idle = (now: number) => {
    if (this.disposed) return;
    this.clock = requestAnimationFrame(this.idle);
    const t = now / 1000;
    if (!this.reducedMotion && this.cube.visible && (this.mood !== "rest" || capable())) {
      this.critter.move(t, this.mood);
      this.redraw();
    }
    this.follow();
  };
  /** Says `words` in a bubble over the turtle: a cry (으아악!) or a bump (아쿵!). */
  private say(words: string, cry: boolean) {
    if (capturing()) return;
    const style = this.bubble.style;
    (this.bubble.firstChild as HTMLElement).textContent = words;
    style.background = cry ? "#fff1a8" : "#ffffff";
    style.color = cry ? "#d23a2a" : "#2b2233";
    this.bubble.dataset.tilt = cry ? "-7" : "5";
    style.fontSize = `${Math.round(Math.max(18, Math.min(34, this.renderer.domElement.clientHeight * 0.045)))}px`;
    style.display = "block";
    this.saidAt = performance.now() / 1000;
    this.follow();
  }
  /** Keeps the bubble over the turtle's place on the screen, popping in and fading out. */
  private follow() {
    const age = Math.max(0, performance.now() / 1000 - this.saidAt);
    if (this.bubble.style.display === "none") return;
    if (age > SAID || capturing()) {
      this.bubble.style.display = "none";
      return;
    }
    const el = this.renderer.domElement,
      W = el.clientWidth,
      H = el.clientHeight;
    Object.assign(this.layer.style, { left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`, width: `${W}px`, height: `${H}px` });
    const at = this.cube.getWorldPosition(new T.Vector3());
    at.y += (TURTLE_TOP + 0.12) * this.cube.scale.y + (TILE_TOP - REST);
    const spot = this.screenOf(at),
      half = this.bubble.offsetWidth / 2 + 6,
      x = Math.max(half, Math.min(W - half, spot.x)),
      y = Math.max(this.bubble.offsetHeight + 64, Math.min(H - 14, spot.y - 10)),
      pop = this.reducedMotion ? 1 : age < 0.16 ? 0.55 + 0.6 * Math.sin((age / 0.16) * (Math.PI / 2)) : age < 0.26 ? 1.15 - ((age - 0.16) / 0.1) * 0.15 : 1;
    this.bubble.style.left = `${x}px`;
    this.bubble.style.top = `${y}px`;
    this.bubble.style.transform = `translate(-50%, -100%) rotate(${this.bubble.dataset.tilt}deg) scale(${pop})`;
    this.bubble.style.opacity = String(age > SAID - FADE ? Math.max(0, (SAID - age) / FADE) : 1);
  }
  private beamMap: T.Texture | null = null;
  /** The mist below, far floating islands with grass and a few trees, laid by a fixed sequence. */
  private scenery() {
    const plane = this.own(new T.PlaneGeometry(120, 120).rotateX(-Math.PI / 2)),
      deep = new T.Mesh(plane, this.paint.deep),
      mist = new T.Mesh(plane, this.paint.mist);
    deep.position.y = -11;
    mist.position.y = -5;
    (this.paint.mist as T.MeshBasicMaterial).map!.repeat.set(7, 7);
    const haze = new T.Mesh(plane, this.paint.haze);
    haze.position.set(0, -2.4, 0);
    (this.paint.haze as T.MeshBasicMaterial).map!.repeat.set(6, 6);
    haze.renderOrder = 1;
    this.scene.add(deep, mist, haze);
    const rand = sequence(2718),
      top = this.own(new T.CylinderGeometry(1, 0.96, 0.18, 10)),
      crown = this.own(new T.ConeGeometry(0.42, 1.1, 7)),
      trunk = this.own(new T.CylinderGeometry(0.06, 0.08, 0.45, 6));
    const places: [number, number, number, number][] = [
      [-10.5, -10, -7.5, 1.0],
      [11, -10.5, -9, 0.85],
      [-6.5, -12.5, -12, 1.3],
      [7, -13, -12.5, 1.4],
      [-13.5, -11.5, 2, 1.05],
      [13.5, -12, 3, 0.95],
    ];
    for (const [x, y, z, s] of places) {
      const island = new T.Group();
      const body = new T.Mesh(this.shapes[`rock${Math.floor(rand() * 4)}`], this.paint.rock);
      body.scale.set(2 * s, 2.3 * s, 2 * s);
      const grass = new T.Mesh(top, this.paint.grass);
      grass.scale.set(s * 1.02, 1, s * 1.02);
      grass.position.y = 0.09;
      island.add(body, grass);
      for (let t = 0; t < 1 + Math.floor(rand() * 3); t++) {
        const a = rand() * Math.PI * 2,
          r = rand() * s * 0.6,
          tree = new T.Group(),
          leaves = new T.Mesh(crown, this.paint.leaf),
          stem = new T.Mesh(trunk, this.paint.bark);
        stem.position.y = 0.4;
        leaves.position.y = 0.95;
        tree.add(stem, leaves);
        tree.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
        tree.scale.setScalar(0.8 + rand() * 0.6);
        island.add(tree);
      }
      island.position.set(x, y, z);
      island.rotation.y = rand() * Math.PI * 2;
      this.scene.add(island);
    }
  }
  /** The fog begins a little beyond the board, wherever the camera has had to stand to frame it. */
  protected resize() {
    super.resize();
    const fog = this.scene.fog as T.Fog,
      far = this.camera.position.length();
    fog.near = far + 3;
    fog.far = far + 34;
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    this.layer.remove();
    for (const thing of this.laid) thing.dispose();
    this.laid = [];
    super.dispose();
  }
  protected subject(aspect: number): TableSubject {
    const state = this.state;
    return glideSubject(state?.w ?? 7, state?.h ?? 7, aspect);
  }
  /** Builds the tiles and pieces of a puzzle (their state is set by `place`). */
  private lay(state: State) {
    if (this.built === state.kinds) return;
    const resized = !this.built || this.built.length !== state.kinds.length;
    this.built = state.kinds;
    for (const thing of this.laid) thing.dispose();
    this.laid = [];
    this.board.clear();
    this.ice.clear();
    this.gates = [];
    this.well = null;
    const { w, h, kinds, tags } = state,
      cells = kinds.map((k, i) => i).filter((i) => kinds[i] !== AIR),
      plain = cells.filter((i) => kinds[i] !== GOAL),
      tiles = new T.InstancedMesh(this.shapes.slab, this.paint.marble, plain.length),
      rocks = [0, 1, 2, 3].map((k) => new T.InstancedMesh(this.shapes[`rock${k}`], this.paint.rock, cells.length)),
      counts = [0, 0, 0, 0],
      m = new T.Matrix4(),
      q = new T.Quaternion(),
      tint = new T.Color();
    tiles.receiveShadow = true;
    tiles.castShadow = true;
    plain.forEach((cell, i) => {
      const at = cellAt(w, h, cell),
        rand = sequence(cell * 7919 + 17);
      m.compose(new T.Vector3(at.x, 0, at.z), q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.floor(rand() * 4) * (Math.PI / 2)), new T.Vector3(1, 1, 1));
      tiles.setMatrixAt(i, m);
      tiles.setColorAt(i, tint.setHSL(0.09 + rand() * 0.04, 0.12 + rand() * 0.1, 0.93 + rand() * 0.06));
    });
    cells.forEach((cell) => {
      const at = cellAt(w, h, cell),
        rand = sequence(cell * 104729 + 3),
        k = Math.floor(rand() * 4),
        s = 0.75 + rand() * 0.3;
      m.compose(new T.Vector3(at.x + (rand() - 0.5) * 0.06, TILE_TOP - SLAB_H + 0.01, at.z + (rand() - 0.5) * 0.06), q.setFromAxisAngle(new T.Vector3(0, 1, 0), rand() * Math.PI * 2), new T.Vector3(s, 0.5 + rand() * 0.6, s));
      rocks[k].setMatrixAt(counts[k]++, m);
    });
    rocks.forEach((r, k) => {
      r.count = counts[k];
      r.castShadow = false;
      r.receiveShadow = true;
    });
    this.board.add(tiles, ...rocks);
    this.laid.push(tiles, ...rocks);
    const put = (cell: number, geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D = this.board, shadow = true) => {
      const mesh = new T.Mesh(geometry, material),
        at = cellAt(w, h, cell);
      mesh.position.set(at.x, 0, at.z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    for (const cell of cells) {
      const kind = kinds[cell],
        tag = tags[cell];
      if (kind === BLOCK) put(cell, this.shapes.block, this.paint.basalt);
      else if (kind === SLASH || kind === BACKSLASH) {
        const ridge = put(cell, this.shapes.turner, this.paint.brass),
          marks = put(cell, this.shapes.decal, this.paint.turnMarks, this.board, false);
        // "\" is "/" turned a quarter.
        if (kind === BACKSLASH) ridge.rotation.y = marks.rotation.y = Math.PI / 2;
        marks.receiveShadow = false;
      } else if (kind === ICE) {
        const crystal = put(cell, this.shapes.ice, this.paint.ice);
        crystal.renderOrder = 3;
        this.ice.set(cell, crystal);
      } else if (kind === PORTAL) {
        put(cell, this.shapes.ring, this.paint[`portal${tag % 2}`]);
        put(cell, this.shapes.swirl, this.paint[`swirl${tag % 2}`], this.board, false).renderOrder = 2;
      } else if (kind === SWITCH) {
        put(cell, this.shapes.buttonRim, this.paint.brass);
        put(cell, this.shapes.button, this.paint[`button${tag % 2}`]);
      } else if (kind === GATE) {
        const gate = put(cell, this.shapes.gate, this.paint[`gate${tag % 2}`]);
        const stripe = new T.Mesh(this.shapes.gateStripe, this.paint.stripe);
        stripe.castShadow = false;
        gate.add(stripe);
        this.gates.push({ cell, tag, mesh: gate });
      } else if (kind === GOAL) {
        put(cell, this.shapes.holed, this.paint.marble);
        put(cell, this.shapes.lip, this.paint.brass);
        put(cell, this.shapes.wellWall, this.paint.wellWall, this.board, false);
        const floor = new T.MeshBasicMaterial({ color: "#c8fbff" }),
          beamPaint = new T.MeshBasicMaterial({ color: "#9ff2ff", map: (this.beamMap ??= this.own(beamTexture())), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }),
          light = new T.PointLight("#8fefff", 2.2, 3.2, 2),
          at = cellAt(w, h, cell);
        this.laid.push(floor, beamPaint);
        put(cell, this.shapes.wellFloor, floor, this.board, false);
        const beam = put(cell, this.shapes.beam, beamPaint, this.board, false);
        beam.renderOrder = 4;
        light.position.set(at.x, 0.35, at.z);
        this.board.add(light);
        this.well = { beam, floor, light };
      }
    }
    if (resized) this.resize();
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null) return [];
    return this.arrows.map((arrow, d) => ({ ...arrowAt(state.w, state.h, state.cube, d), y: TILE_TOP + 0.02, r: 0.42, point: arrow.visible ? d : -1 })).filter((s) => s.point >= 0);
  }
  protected hover(point: number) {
    this.hovered = point;
    this.paintArrows();
  }
  private paintArrows() {
    this.arrowPaint.forEach((material, d) => {
      material.color.set(d === this.hovered ? "#fff4c8" : "#ffffff");
      material.opacity = d === this.hovered ? 1 : 0.78;
    });
    this.redraw();
  }
  /** Where a place on the table is on the screen, in pixels. */
  private screenOf(at: { x: number; y?: number; z: number }) {
    const v = new T.Vector3(at.x, at.y ?? TILE_TOP, at.z).project(this.camera),
      el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here: a swipe from anywhere, or a tap on an arrow or in the cube's row or column.
    this.press = { point, at: { x: at.x, z: at.z }, screen: this.screenOf(at) };
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    if (!press || !at || !state || state.winner !== null) return;
    const end = this.screenOf(at),
      dx = end.x - press.screen.x,
      dy = end.y - press.screen.y;
    let dir = -1;
    if (Math.hypot(dx, dy) >= SWIPE) dir = swipeDir(dx, dy);
    else if (press.point >= 0 && press.point < 4) dir = press.point;
    else {
      // A tap in the cube's row or column, away from it, pushes it that way.
      const cube = cellAt(state.w, state.h, state.cube),
        ox = at.x - cube.x,
        oz = at.z - cube.z;
      if (Math.abs(oz) < 0.5 && Math.abs(ox) > 0.6) dir = ox > 0 ? 1 : 3;
      else if (Math.abs(ox) < 0.5 && Math.abs(oz) > 0.6) dir = oz > 0 ? 2 : 0;
      else if (cellUnder(state.w, state.h, at.x, at.z) === state.cube) return;
    }
    if (dir < 0) return;
    const blocked = attempt(state, dir) !== "ok";
    this.onMove({ from: -1, to: dir, extra: -1 });
    // A push that moves nothing: the cube gives a little shake that way.
    // While it still slides a push is only kept for later (the screen queues it), so nothing shakes then.
    if (blocked && this.state === state && !this.sliding) this.shake(dir, attempt(state, dir) === "none");
  }
  /** A push that moves nothing: the turtle gives a little shake that way, and says 아쿵! when it was something in its way. */
  private shake(dir: number, bumped: boolean) {
    const state = this.state!,
      at = cellAt(state.w, state.h, state.cube),
      [dx, dz] = WAY[dir];
    if (bumped) this.say("아쿵!", false);
    this.tween(0, 180, (p) => {
      const k = Math.sin(p * Math.PI * 2) * 0.05 * (1 - p);
      this.cube.position.set(at.x + dx * k, REST, at.z + dz * k);
    });
  }
  /** Under reduced motion nothing slides, but the turtle still says what befell it. */
  sync(state: State, animate = true) {
    const before = this.state;
    super.sync(state, animate);
    const slide = state.last;
    if (this.reducedMotion && animate && before && slide && before !== state && state.ply === before.ply + 1 && before.kinds === state.kinds && slide.path.length)
      if (slide.end === "fall") this.say("으아악!", true);
      else if (slide.end !== "goal") this.say("아쿵!", false);
  }
  protected place(state: State) {
    this.lay(state);
    const at = cellAt(state.w, state.h, state.cube);
    this.cube.position.set(at.x, REST, at.z);
    this.cube.rotation.set(0, 0, 0);
    this.cube.scale.setScalar(1);
    // Fallen into the mist, or sunk into the well.
    this.cube.visible = state.fell === null && state.winner !== 0;
    this.mood = "rest";
    for (const [cell, crystal] of this.ice) crystal.visible = !state.broken.includes(cell);
    for (const gate of this.gates) gate.mesh.scale.y = state.raised[gate.tag] ? 1 : 0.06;
    for (const shard of this.shards) shard.visible = false;
    if (this.well) {
      const won = state.winner === 0;
      this.well.beam.scale.set(won ? 1.25 : 1, won ? 1.6 : 1, won ? 1.25 : 1);
      (this.well.beam.material as T.MeshBasicMaterial).opacity = won ? 0.85 : 0.5;
      this.well.light.intensity = won ? 4.5 : 2.2;
    }
    this.sliding = false;
    this.mark(this.marks);
  }
  /** The cube's way through a push, as legs between the middles of the cells it passes. */
  private legs(before: State, state: State) {
    const slide = state.last!,
      legs: Leg[] = [];
    let from = cellAt(before.w, before.h, slide.from),
      at = 0;
    for (const step of slide.path) {
      const to = spotAt(state.w, state.h, step.r, step.c),
        length = step.warp ? 2.4 : 1;
      legs.push({ from, to, warp: !!step.warp, at, length, turn: !!step.turned, toggle: step.toggle, fall: false });
      at += length;
      from = to;
    }
    if (slide.end === "fall") legs[legs.length - 1].fall = true;
    return { legs, total: at };
  }
  protected animate(before: State, state: State) {
    const slide = state.last;
    if (!slide || state.ply !== before.ply + 1 || before.kinds !== state.kinds || !slide.path.length) return false;
    const { legs, total } = this.legs(before, state),
      fall = slide.end === "fall",
      duration = 120 + total * 82,
      // Gathering speed and slowing to a stop; a cube going over the edge does not slow.
      ease = (p: number) => (fall ? p ** 1.5 : p < 0.5 ? 2 * p * p : 1 - (2 - 2 * p) ** 2 / 2),
      timeAt = (units: number) => {
        let lo = 0,
          hi = 1;
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          if (ease(mid) * total < units) lo = mid;
          else hi = mid;
        }
        return hi * duration;
      };
    this.sliding = true;
    this.fallingOrHome = fall || slide.end === "goal";
    this.mark(this.marks);
    // Round and round on its shell as it goes: a turn or more for a longer way, ending where it began (looking at the
    // player), and the other way round when pushed east or south.
    const turns = Math.max(1, Math.min(5, Math.round(total * 0.55))),
      sign = slide.dir === 1 || slide.dir === 2 ? -1 : 1,
      spin = (u: number) => sign * (u / total) * turns * Math.PI * 2;
    let cried = false;
    // The table counts as at rest once the cube does: the bump against what stopped it and flying ice do not hold the
    // next push back (the user found the wait after each stop too long; a push given ahead is played at once).
    if (!fall && slide.end !== "goal")
      this.tween(duration, 1, () => {
        if (!this.sliding) return;
        this.sliding = false;
        this.mood = "rest";
        this.say("아쿵!", false);
        this.onSettled();
      });
    this.cube.visible = true;
    this.tween(0, duration, (p) => {
      const u = ease(p) * total;
      let leg = legs[legs.length - 1];
      for (const l of legs)
        if (u <= l.at + l.length) {
          leg = l;
          break;
        }
      const f = Math.max(0, Math.min(1, (u - leg.at) / leg.length));
      let x: number,
        z: number,
        y = REST,
        scale = 1,
        tip = 0;
      if (leg.warp) {
        // Shrinking into the near portal, then growing out of the far one.
        const near = f < 0.5;
        x = near ? leg.from.x : leg.to.x;
        z = near ? leg.from.z : leg.to.z;
        scale = near ? 1 - f * 2 : f * 2 - 1;
      } else {
        x = leg.from.x + (leg.to.x - leg.from.x) * f;
        z = leg.from.z + (leg.to.z - leg.from.z) * f;
        // Over the edge, past the middle of the void it falls toward: it begins to drop and tip, and cries out.
        if (leg.fall && f > 0.45) {
          const g = (f - 0.45) / 0.55;
          y -= 0.5 * g * g;
          tip = g * 0.7;
          this.mood = "fall";
          if (!cried) this.say("으아악!", true);
          cried = true;
        } else this.mood = "slide";
      }
      this.cube.rotation.y = spin(u);
      // A little lift as it rides over a turner's ridge.
      for (const l of legs) if (l.turn) y += 0.1 * Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(u - (l.at + l.length)) * Math.PI))) ** 2;
      this.cube.position.set(x, y, z);
      this.cube.scale.setScalar(Math.max(0.001, scale));
      const [dx, dz] = WAY[leg.fall ? slide.path[slide.path.length - 1].dir : 0];
      this.cube.rotation.x = leg.fall ? dz * tip : 0;
      this.cube.rotation.z = leg.fall ? -dx * tip : 0;
      if (p === 1 && !fall) this.onContact();
    });
    // Gates flip as the cube passes their switch.
    for (const leg of legs)
      if (leg.toggle !== undefined)
        for (const gate of this.gates.filter((g) => g.tag === leg.toggle)) {
          const from = gate.mesh.scale.y,
            to = from > 0.5 ? 0.06 : 1;
          this.tween(timeAt(leg.at + leg.length * 0.5), 260, (p) => (gate.mesh.scale.y = from + (to - from) * (1 - (1 - p) ** 3)));
        }
    const last = legs[legs.length - 1],
      [dx, dz] = WAY[slide.path[slide.path.length - 1].dir];
    if (fall) {
      // Over the edge and down, turning over and over, into the mist.
      const x0 = last.to.x,
        z0 = last.to.z;
      this.tween(duration, 1100, (p) => {
        const t = p * 1.1;
        this.cube.position.set(x0 + dx * t * 0.9, REST - 0.5 - 9.5 * t * t, z0 + dz * t * 0.9);
        this.cube.rotation.x = dz * (0.7 + t * 5);
        this.cube.rotation.z = -dx * (0.7 + t * 5);
        this.cube.rotation.y = spin(total) + sign * t * 5;
        this.mood = "fall";
        this.cube.scale.setScalar(1 - p * 0.3);
      });
      return true;
    }
    const rest = last.to;
    if (slide.end !== "goal") {
      // A small bump against what stopped it.
      this.tween(duration, 150, (p) => {
        const k = Math.sin(p * Math.PI) * 0.045;
        this.cube.position.set(rest.x + dx * k, REST, rest.z + dz * k);
      });
    }
    if (slide.end === "ice" && slide.struck >= 0) this.shatter(slide.struck, duration, dx, dz);
    if (slide.end === "goal") {
      // A happy wriggle and a little hop, then down the well, smaller and smaller, as the light rises.
      this.tween(duration, 1, () => (this.mood = "happy"));
      this.tween(duration + 120, 650, (p) => {
        const e = p * p;
        this.mood = "happy";
        this.cube.position.set(rest.x, REST - e * 1.05 + Math.sin(Math.min(1, p * 2.5) * Math.PI) * 0.09, rest.z);
        this.cube.scale.setScalar(1 - e * 0.55);
        this.cube.rotation.y = e * 1.6;
        this.cube.rotation.z = Math.sin(p * Math.PI * 6) * 0.2 * (1 - p);
        if (this.well) {
          this.well.light.intensity = 2.2 + 2.3 * p;
          (this.well.beam.material as T.MeshBasicMaterial).opacity = 0.5 + 0.35 * p;
          this.well.beam.scale.set(1 + 0.25 * p, 1 + 0.6 * p, 1 + 0.25 * p);
        }
        if (p === 1) this.cube.visible = false;
      });
    }
    return true;
  }
  /** The ice at `cell` bursts into shards flung away from the cube. */
  private shatter(cell: number, delay: number, dx: number, dz: number) {
    const state = this.state!,
      at = cellAt(state.w, state.h, cell),
      crystal = this.ice.get(cell),
      rand = sequence(cell * 31 + 7),
      flight = this.shards.map(() => ({
        vx: dx * (0.8 + rand() * 1.4) + (rand() - 0.5) * 2.2,
        vz: dz * (0.8 + rand() * 1.4) + (rand() - 0.5) * 2.2,
        vy: 1.2 + rand() * 2.2,
        y0: 0.1 + rand() * 0.55,
        spin: (rand() - 0.5) * 14,
        s: 0.6 + rand() * 0.8,
      }));
    this.tween(delay, 750, (p) => {
      if (crystal) crystal.visible = false;
      this.shardPaint.opacity = 0.85 * (1 - p * p);
      this.shards.forEach((shard, k) => {
        const f = flight[k],
          t = p * 0.75;
        shard.visible = p < 1;
        shard.position.set(at.x + f.vx * t, f.y0 + f.vy * t - 4.9 * t * t, at.z + f.vz * t);
        shard.rotation.set(f.spin * t, f.spin * t * 0.7, 0);
        shard.scale.setScalar(f.s);
      });
    });
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const live = state.winner === null && !this.sliding && !capturing(),
      hint = live && marks.hint && marks.hint.to >= 0 && marks.hint.to < 4 ? marks.hint.to : -1;
    this.arrows.forEach((arrow, d) => {
      arrow.visible = live && d !== hint && attempt(state, d) === "ok";
      if (!arrow.visible) return;
      const p = arrowAt(state.w, state.h, state.cube, d);
      arrow.position.set(p.x, TILE_TOP + 0.03, p.z);
    });
    this.hintArrow.visible = this.hintRing.visible = hint >= 0;
    // For browser tests: the cube's cell and the way a hint points (-1 for none).
    this.renderer.domElement.dataset.cube = String(state.cube);
    this.renderer.domElement.dataset.hint = String(hint);
    if (hint >= 0) {
      const p = arrowAt(state.w, state.h, state.cube, hint),
        c = cellAt(state.w, state.h, state.cube);
      this.hintArrow.position.set(p.x + WAY[hint][0] * 0.06, TILE_TOP + 0.05, p.z + WAY[hint][1] * 0.06);
      this.hintArrow.rotation.y = -hint * (Math.PI / 2);
      this.hintRing.position.set(c.x, TILE_TOP + 0.02, c.z);
    }
    this.paintArrows();
  }
}
