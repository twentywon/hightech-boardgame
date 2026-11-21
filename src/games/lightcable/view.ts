import * as T from "three";
import { block, capable, glossy, planks, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BOARD_TOP, CABLE_R, CABLE_Y, EDGE, EXIT_GRAB, GRAB, bendAt, cableLines, cableSubject, freeRun, restEnd, type CablePoint } from "./layout";
import {
  CW,
  DEPTH,
  WHITE,
  WIDTH,
  angleAt,
  cableOf,
  decode,
  isLit,
  pivotOf,
  play,
  plugMove,
  segmentDistance,
  tangent,
  turnOf,
  unwrapMove,
  wrapMove,
  wrapPi,
  arcDistance,
  type Pt,
  type Side,
  type State,
} from "./rules";

export const CABLE_COLORS: [string, string] = ["#ffe7b0", "#4a3d33"];
/** The light of each cable colour (white, red, blue, green), the enamel of a coloured post's band, and its glass. */
const LIGHT = ["#ffe2a8", "#ff5a46", "#55a8ff", "#5fe08d"],
  ENAMEL = ["#e6dfcf", "#c4362c", "#2d6fd2", "#2f9a55"],
  GLASS = ["#e4ecef", "#f2b2aa", "#b4d2f6", "#b6ecc8"],
  /** The cloth of the cable in each colour (the braid's picture is multiplied by it). */
  CLOTH = ["#f4ecdc", "#e0524a", "#4f8fe8", "#4fc77c"];
/** Heights of a post's parts. */
const CAP_BASE = 0.56,
  CORE_Y = 0.69,
  TOP_Y = 0.85;
/** How long a post takes to flare as it lights, and how long the light takes to run along each unit of cable. */
const FLARE_MS = 620,
  RUN_PER_UNIT = 70;
/** How far the free end moves in one step of the sweep, and how far an arrow key moves it. */
const SUB = 0.025,
  NUDGE = 0.14;
/** How close the free run may come to a coil before its sparks reach out for it. */
const NEAR = 0.45;

/** The keyboard's way to the free end (arrows draw it a little that way): set by the view on the table now. */
export const keyboard: { nudge: ((dx: number, dz: number) => void) | null } = { nudge: null };

const canvasOf = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
const textureOf = (c: HTMLCanvasElement) => {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** A sequence for scenery and the sparks, the same every time. */
const sequence = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
/** A cloth cable's braid: pale strands woven on the slant both ways, to be coloured by the paint. */
function braid() {
  const { c, ctx } = canvasOf(128, 32);
  ctx.fillStyle = "#d9d2c4";
  ctx.fillRect(0, 0, 128, 32);
  for (let pass = 0; pass < 2; pass++)
    for (let k = -4; k < 20; k++) {
      const x = k * 8;
      ctx.fillStyle = pass ? "rgba(255, 255, 255, 0.55)" : "rgba(120, 110, 96, 0.55)";
      ctx.beginPath();
      if (pass) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x + 5 + 16, 32);
        ctx.lineTo(x + 16, 32);
      } else {
        ctx.moveTo(x + 16, 0);
        ctx.lineTo(x + 21, 0);
        ctx.lineTo(x + 5, 32);
        ctx.lineTo(x, 32);
      }
      ctx.fill();
    }
  ctx.fillStyle = "rgba(60, 50, 40, 0.18)";
  for (let y = 0; y < 32; y += 4) ctx.fillRect(0, y, 128, 1);
  const t = textureOf(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/**
 * The light along the cable: a front with a bright crest, lit behind it and faint before it. It is laid along the
 * cable's length (its second set of coordinates) and slid so that the front stands where the light has come to.
 */
function lightFront() {
  const { c, ctx } = canvasOf(256, 4),
    g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "rgb(190, 190, 190)");
  g.addColorStop(0.44, "rgb(200, 200, 200)");
  g.addColorStop(0.5, "rgb(255, 255, 255)");
  g.addColorStop(0.56, "rgb(36, 36, 36)");
  g.addColorStop(1, "rgb(36, 36, 36)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 4);
  const t = new T.CanvasTexture(c);
  // Numbers of light, not colours.
  t.colorSpace = T.NoColorSpace;
  t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
  t.channel = 1;
  return t;
}
/** How long (along the cable) the front's gradient is drawn over, in table units for the texture's width. */
const FRONT_SPAN = 4;
/** A soft round glow for halos and the light a post throws on the board. */
function glowTexture() {
  const { c, ctx } = canvasOf(128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.25, "rgba(255, 255, 255, 0.55)");
  g.addColorStop(0.6, "rgba(255, 255, 255, 0.12)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return textureOf(c);
}
/** The white enamel top of a counted post with its number. */
function numberTop(need: number) {
  const { c, ctx } = canvasOf(128);
  ctx.fillStyle = "#b8893c";
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f1e4";
  ctx.beginPath();
  ctx.arc(64, 64, 57, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a211b";
  ctx.font = "bold 96px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(need), 64, 70);
  return textureOf(c);
}
/** The warning bands of a coil's plinth: red and yellow on the slant, with a black rim. */
function warningBands() {
  const { c, ctx } = canvasOf(256, 32);
  ctx.fillStyle = "#f2c230";
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = "#c8281e";
  for (let x = -32; x < 288; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 16, 32);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 16, 0);
    ctx.fill();
  }
  ctx.fillStyle = "#15110f";
  ctx.fillRect(0, 0, 256, 3);
  ctx.fillRect(0, 29, 256, 3);
  const t = textureOf(c);
  t.wrapS = T.RepeatWrapping;
  return t;
}
/**
 * The workshop board's face: dark stained wood with fine fibres and an inlaid brass line round its edge, a brass
 * rosette where each post stands, a hatched warning circle under each coil, and brass plates under the sockets.
 */
function boardFace(state: State, spanX: number, spanZ: number) {
  const w = 1536,
    h = Math.round((w * spanZ) / spanX),
    { c, ctx } = canvasOf(w, h),
    rand = sequence(7700 + state.posts.length * 31 + Math.round(state.start.z * 100)),
    px = w / spanX,
    at = (x: number, z: number) => [w / 2 + x * px, h / 2 + z * px] as const;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#332a24");
  g.addColorStop(1, "#28211c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 7000; k++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? "14, 10, 8" : "120, 96, 74"}, ${0.05 + rand() * 0.08})`;
    ctx.fillRect(rand() * w, rand() * h, 4 + rand() * 44, 1 + rand());
  }
  // The brass inlay round the playing field.
  const [x0, z0] = at(-WIDTH, -DEPTH),
    [x1, z1] = at(WIDTH, DEPTH);
  ctx.strokeStyle = "#a77b35";
  ctx.lineWidth = px * 0.035;
  ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
  ctx.strokeStyle = "rgba(255, 228, 160, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 - px * 0.012, z0 - px * 0.012, x1 - x0, z1 - z0);
  // A rosette under each post: a brass disc with a ring of tiny pins.
  for (const post of state.posts) {
    const [x, y] = at(post.x, post.z),
      r = (post.kind === "ring" ? 0.15 : 0.2) * px,
      disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    disc.addColorStop(0, "#7a5c2c");
    disc.addColorStop(1, "#3a2b16");
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(220, 180, 110, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // A hatched warning circle under each coil.
  for (const hz of state.hazards) {
    const [x, y] = at(hz.x, hz.z),
      r = (hz.r + 0.04) * px;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x, y, r * 0.78, 0, Math.PI * 2, true);
    ctx.clip();
    ctx.fillStyle = "#e0b22c";
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = "#17120f";
    for (let k = -8; k < 8; k++) {
      ctx.beginPath();
      const u = x + (k * r) / 4;
      ctx.moveTo(u, y - r);
      ctx.lineTo(u + r / 8, y - r);
      ctx.lineTo(u + r / 8 + r * 0.6, y + r);
      ctx.lineTo(u + r * 0.6, y + r);
      ctx.fill();
    }
    ctx.restore();
  }
  // Brass plates under the reel and the exit.
  for (const p of [state.start, state.exit]) {
    const [x, y] = at(p.x + (p === state.start ? -0.2 : 0.2), p.z);
    ctx.fillStyle = "#5c4422";
    ctx.beginPath();
    ctx.arc(x, y, px * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a77b35";
    ctx.lineWidth = px * 0.02;
    ctx.stroke();
  }
  const edge = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.6);
  edge.addColorStop(0, "rgba(0, 0, 0, 0)");
  edge.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  return textureOf(c);
}

/** One post, piece by piece: what lights and what stays. */
interface PostModel {
  index: number;
  root: T.Group;
  cap: T.MeshStandardMaterial | null;
  core: T.Mesh | null;
  halo: T.Sprite;
  pool: T.Mesh;
  /** A counted post's beads, one a wrap it needs. */
  beads: T.Mesh[];
  /** A ring's glass hoop. */
  hoop: T.MeshStandardMaterial | null;
  glow: number;
}
/** One coil: its sparks and the glow at its terminal. */
interface HazardModel {
  root: T.Group;
  sparks: T.LineSegments;
  glow: T.Sprite;
}
/** A string of the wraps (and the end of the game) a state has, to tell states apart. */
const keyOf = (s: State) => `${s.ply}|${s.wraps.map((w) => `${w.post}${w.side > 0 ? "+" : "-"}`).join("")}|${s.winner}`;

/**
 * The cable workshop: a dark board of stained wood with a brass inlay lies on a plank table. Brass pillars (a turned
 * column on a foot, a band of enamel for a coloured post, a glass cap) stand on brass rosettes; the cap glows, white
 * or in the post's colour, once the post is lit, with a halo and a pool of light on the board, breathing softly. A
 * counted post wears its number on a lid and a bead for each wrap it needs. A ring is a short brass peg crowned with
 * a coloured glass hoop. A coil is a black iron core wound with iron wire on a plinth of red and yellow warning
 * bands, a brass terminal on top that sparks, more as the free cable comes near and fiercely when it touches. The
 * cable comes off a brass reel at the left: a thick braided cloth cable, taut from post to post along the tangents
 * and round each post it wraps, glowing faintly in its colour; its free end is a bakelite plug that follows the
 * finger. The exit is a socket at the right with a ring that lights as the plug goes in, and on a win the light runs
 * along the whole cable from the reel to the exit. Marks: the hint's gold ring and an arrow round the post showing
 * the side, a ring round the free end under the mouse (left out of a picture taken for the collection).
 */
export class LightCableView extends TableView<State> {
  private posts: PostModel[] = [];
  private hazards: HazardModel[] = [];
  private builtFor: State["posts"] | null = null;
  private layer = new T.Group();
  private cableLayer = new T.Group();
  private fixedMeshes: T.Mesh[] = [];
  private freeMesh: T.Mesh | null = null;
  private fixedKey = "";
  private boardOwned: { dispose(): void }[] = [];
  private paint: Record<string, T.Material> = {};
  private cloth: T.MeshStandardMaterial[] = [];
  private danger: T.MeshStandardMaterial;
  private shapes: Record<string, T.BufferGeometry> = {};
  private glow: T.Texture;
  private front: T.Texture;
  private plug = new T.Group();
  private reel = new T.Group();
  private socket = new T.Group();
  private socketRing: T.MeshStandardMaterial;
  private socketGlow: T.Sprite;
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private arrow = new T.Group();
  private hoverRing: T.Mesh;
  private flash: T.Mesh;
  private flashUntil = 0;
  private live: boolean;
  private soft: boolean;
  private clock = 0;
  private flaring = new Map<number, number>();
  private sparkle = sequence(91);

  /** The state as the view knows it: the screen's, and the moves it has itself reported since. */
  private local: State | null = null;
  /** Keys of states reported and not yet shown back by the screen. */
  private pending: string[] = [];
  /** Where the free end lies, and how far round each wrapped post the cable bends, followed continuously. */
  private end: Pt = { x: 0, z: 0 };
  private bends: number[] = [];
  /** The light's front along the cable, as far as it has come (a won cable's run). */
  private frontAt = -FRONT_SPAN * 2;
  private length = 0;
  /** A drag of the free end: how far from the finger the end was taken up. */
  private drag: { dx: number; dz: number } | null = null;
  /** The wrap last refused during this drag (told once, until the end moves on). */
  private refusedKey = "";
  private hovered = false;
  /** The coil the free run touches (-1 none), and how near it comes to each. */
  private touching = -1;
  private nearness: number[] = [];
  /** The coil the fixed cable touched (a short circuit), or -1. */
  private shorted = -1;
  private hintMove: Move | null = null;
  private beadOff: T.Material;
  private beadOn: T.Material;
  private nudger = (dx: number, dz: number) => this.nudge(dx, dz);
  protected pressWhileMoving = true;

  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1c1815");
    this.soft = !capable();
    this.live = !this.soft && !this.reducedMotion;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    const p = <M extends T.Material>(name: string, material: M) => (this.paint[name] = keep(material));
    const g = (name: string, geometry: T.BufferGeometry) => (this.shapes[name] = keep(geometry));
    this.scene.background = new T.Color("#1c1815");
    // The workshop's light: a lamp above and to the left, a cool sky and a warm bounce from the table.
    this.scene.add(new T.HemisphereLight("#d6dceb", "#4a3626", 1.15));
    const lamp = new T.DirectionalLight("#fff0d8", 2.1);
    lamp.position.set(-5, 11, 5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.left = lamp.shadow.camera.bottom = -9;
    lamp.shadow.camera.right = lamp.shadow.camera.top = 9;
    lamp.shadow.camera.far = 40;
    lamp.shadow.normalBias = 0.02;
    keep(lamp.shadow);
    const fill = new T.DirectionalLight("#ffe6c4", 0.4);
    fill.position.set(5, 6, 8);
    this.scene.add(lamp, fill);

    this.glow = keep(glowTexture());
    this.front = keep(lightFront());
    const weave = keep(braid());
    p("table", new T.MeshStandardMaterial({ ...planks(3, keep), color: "#b89676" }));
    p("frame", new T.MeshStandardMaterial({ map: keep(wood(true, 0.8)), color: "#7a5640", roughness: 0.55 }));
    p("brass", glossy({ color: "#c9973f", roughness: 0.3, metalness: 0.88 }, 0.5));
    p("darkBrass", glossy({ color: "#8e6a2e", roughness: 0.4, metalness: 0.85 }, 0.3));
    p("bakelite", glossy({ color: "#231c18", roughness: 0.32 }, 0.6));
    p("hole", new T.MeshStandardMaterial({ color: "#0b0908", roughness: 0.9 }));
    p("iron", glossy({ color: "#2a2a2c", roughness: 0.45, metalness: 0.7 }, 0.2));
    p("wire", new T.MeshStandardMaterial({ color: "#5a524c", roughness: 0.3, metalness: 0.85 }));
    p("bands", new T.MeshStandardMaterial({ map: keep(warningBands()), roughness: 0.5 }));
    const top = keep(warningBands());
    top.wrapT = T.RepeatWrapping;
    top.repeat.set(3, 3);
    p("warnTop", new T.MeshStandardMaterial({ map: top, roughness: 0.5 }));
    this.cloth = CLOTH.map((cloth, tint) =>
      keep(
        new T.MeshStandardMaterial({
          map: weave,
          color: cloth,
          roughness: 0.82,
          emissive: LIGHT[tint],
          emissiveMap: this.front,
          emissiveIntensity: this.soft ? 0.9 : 1.15,
        }),
      ),
    );
    this.danger = keep(new T.MeshStandardMaterial({ map: weave, color: "#ff6040", roughness: 0.6, emissive: "#ff3020", emissiveIntensity: 1.4 }));
    this.socketRing = keep(new T.MeshStandardMaterial({ color: "#3a2f25", emissive: LIGHT[WHITE], emissiveIntensity: 0, roughness: 0.3 }));

    // A post: a turned brass column on a foot, the glass cap above, a glowing core inside it.
    const post = [
      [0, 0],
      [0.15, 0],
      [0.152, 0.014],
      [0.146, 0.038],
      [0.128, 0.05],
      [0.1, 0.06],
      [0.09, 0.085],
      [0.086, 0.23],
      [0.106, 0.244],
      [0.106, 0.268],
      [0.086, 0.282],
      [0.084, 0.47],
      [0.112, 0.49],
      [0.15, 0.525],
      [0.152, CAP_BASE],
      [0, CAP_BASE],
    ].map(([x, y]) => new T.Vector2(x, y));
    g("post", new T.LatheGeometry(post, 32));
    const cap = [
      [0.138, CAP_BASE],
      [0.148, 0.59],
      [0.158, 0.66],
      [0.148, 0.735],
      [0.118, 0.795],
      [0.068, 0.835],
      [0.0, TOP_Y],
    ].map(([x, y]) => new T.Vector2(x, y));
    g("cap", new T.LatheGeometry(cap, 32));
    g("core", new T.SphereGeometry(0.07, 16, 12));
    g("band", new T.CylinderGeometry(0.092, 0.092, 0.09, 28, 1, true).translate(0, 0.37, 0));
    g("bead", new T.SphereGeometry(0.03, 12, 8));
    // A counted post wears a brass lid with its number, wide enough to be read from the eye's place.
    g("top", new T.CylinderGeometry(0.15, 0.13, 0.04, 28).translate(0, TOP_Y - 0.002, 0));
    g("topFace", new T.CircleGeometry(0.145, 28).rotateX(-Math.PI / 2).translate(0, TOP_Y + 0.0185, 0));
    g("pool", new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    // A ring: a short brass peg with a glass hoop of its colour on top.
    const peg = [
      [0, 0],
      [0.1, 0],
      [0.102, 0.012],
      [0.09, 0.04],
      [0.062, 0.055],
      [0.056, 0.2],
      [0.075, 0.215],
      [0.075, 0.235],
      [0, 0.235],
    ].map(([x, y]) => new T.Vector2(x, y));
    g("peg", new T.LatheGeometry(peg, 24));
    g("hoop", new T.TorusGeometry(0.085, 0.03, 12, 32).rotateX(Math.PI / 2).translate(0, 0.27, 0));
    g("pegBall", new T.SphereGeometry(0.045, 14, 10).translate(0, 0.27, 0));
    // A coil: plinth, iron core, wound wire, a ceramic collar and a brass terminal.
    g("plinth", new T.CylinderGeometry(0.25, 0.27, 0.07, 32).translate(0, 0.035, 0));
    g("plinthBand", new T.CylinderGeometry(0.255, 0.255, 0.045, 32, 1, true).translate(0, 0.04, 0));
    g("coreBar", new T.CylinderGeometry(0.1, 0.1, 0.44, 20).translate(0, 0.29, 0));
    const turns = 7,
      helix = new T.CurvePath<T.Vector3>(),
      points: T.Vector3[] = [];
    for (let i = 0; i <= turns * 24; i++) {
      const t = i / (turns * 24),
        a = t * turns * Math.PI * 2;
      points.push(new T.Vector3(Math.cos(a) * 0.16, 0.1 + t * 0.34, Math.sin(a) * 0.16));
    }
    helix.add(new T.CatmullRomCurve3(points));
    g("coil", new T.TubeGeometry(helix.curves[0], turns * 24, 0.024, 6, false));
    g("collar", new T.CylinderGeometry(0.15, 0.17, 0.06, 24).translate(0, 0.49, 0));
    // The collar's top, seen from the player's place: a ring of warning bands round the terminal.
    g("warnTop", new T.RingGeometry(0.06, 0.15, 32, 1).rotateX(-Math.PI / 2).translate(0, 0.521, 0));
    g("collarBand", new T.CylinderGeometry(0.172, 0.172, 0.035, 24, 1, true).translate(0, 0.49, 0));
    g("terminal", new T.SphereGeometry(0.055, 16, 12).translate(0, 0.56, 0));
    p("band0", glossy({ color: ENAMEL[0], roughness: 0.25 }, 0.6));
    for (let k = 1; k < ENAMEL.length; k++) p(`band${k}`, glossy({ color: ENAMEL[k], roughness: 0.25 }, 0.6));
    p("top2", new T.MeshStandardMaterial({ map: keep(numberTop(2)), roughness: 0.35 }));
    p("top3", new T.MeshStandardMaterial({ map: keep(numberTop(3)), roughness: 0.35 }));
    this.beadOff = keep(new T.MeshStandardMaterial({ color: "#3a332d", roughness: 0.25, metalness: 0.1 }));
    this.beadOn = keep(new T.MeshStandardMaterial({ color: LIGHT[WHITE], emissive: LIGHT[WHITE], emissiveIntensity: 1.6, roughness: 0.3 }));

    // The table under everything.
    const table = new T.Mesh(keep(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2)), this.paint.table);
    table.position.y = -0.2;
    table.receiveShadow = true;
    this.scene.add(table, this.layer, this.cableLayer);

    const add = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, y = 0) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.y = y;
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // The reel the cable comes off: two brass cheeks on a hub, the cable wound round the drum.
    add(new T.CylinderGeometry(0.33, 0.33, 0.035, 36), this.paint.brass, this.reel, 0.018);
    add(new T.CylinderGeometry(0.2, 0.2, 0.24, 28), this.paint.darkBrass, this.reel, 0.155);
    add(new T.CylinderGeometry(0.3, 0.3, 0.035, 36), this.paint.brass, this.reel, 0.29);
    add(new T.CylinderGeometry(0.07, 0.07, 0.05, 20), this.paint.bakelite, this.reel, 0.33);
    const wound = keep(new T.MeshStandardMaterial({ map: weave, color: CLOTH[WHITE], roughness: 0.82 }));
    for (let k = 0; k < 4; k++) add(new T.TorusGeometry(0.235, 0.055, 10, 36).rotateX(Math.PI / 2), wound, this.reel, 0.075 + k * 0.058);
    this.scene.add(this.reel);
    // The exit socket: a bakelite block with a brass face, a round socket in it and a ring that lights.
    add(block(0.62, 0.3, 0.34, 0.05).translate(0, 0.15, 0), this.paint.bakelite, this.socket);
    add(block(0.5, 0.22, 0.03, 0.01).translate(0, 0.16, 0.17), this.paint.brass, this.socket);
    add(new T.CylinderGeometry(0.085, 0.085, 0.02, 24).rotateX(Math.PI / 2).translate(0, 0.14, 0.185), this.paint.hole, this.socket);
    add(new T.TorusGeometry(0.1, 0.018, 10, 32).translate(0, 0.14, 0.188), this.socketRing, this.socket);
    for (const x of [-0.18, 0.18]) add(new T.CylinderGeometry(0.022, 0.022, 0.02, 12).rotateX(Math.PI / 2).translate(x, 0.21, 0.19), this.paint.darkBrass, this.socket);
    this.socketGlow = new T.Sprite(keep(new T.SpriteMaterial({ map: this.glow, color: LIGHT[WHITE], transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
    this.socketGlow.position.set(0, 0.16, 0.25);
    this.socketGlow.scale.setScalar(0.9);
    this.socket.add(this.socketGlow);
    this.scene.add(this.socket);
    // The plug at the cable's end: a bakelite body, a brass ferrule and two pins, lying along the cable.
    add(new T.CylinderGeometry(0.078, 0.07, 0.16, 20).rotateZ(-Math.PI / 2).translate(0.03, 0, 0), this.paint.bakelite, this.plug);
    add(new T.CylinderGeometry(0.066, 0.066, 0.045, 20).rotateZ(-Math.PI / 2).translate(0.13, 0, 0), this.paint.brass, this.plug);
    for (const z of [-0.025, 0.025]) add(new T.CylinderGeometry(0.011, 0.011, 0.07, 8).rotateZ(-Math.PI / 2).translate(0.185, 0, z), this.paint.brass, this.plug);
    this.plug.position.y = CABLE_Y;
    this.scene.add(this.plug);

    // Marks: the hint's ring, glow and arrow round the post, the free end's ring under the mouse, a refusal's flash.
    this.hintRing = ringMesh(keep, 0.4, 0.48, "#ffc21f");
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(0.5, 32)), keep(new T.MeshBasicMaterial({ color: "#ffcf55", transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    const gold = keep(new T.MeshBasicMaterial({ color: "#ffc93a", side: T.DoubleSide, depthWrite: false, transparent: true, opacity: 0.95 }));
    const sweep = Math.PI * 1.15,
      bow = new T.Mesh(keep(new T.TorusGeometry(0.6, 0.03, 8, 48, sweep).rotateX(-Math.PI / 2)), gold),
      head = new T.Mesh(keep(new T.ConeGeometry(0.075, 0.2, 16).rotateZ(-Math.PI / 2)), gold),
      // After rotateX(−π/2) the torus runs from angle 0 to −sweep round the y axis: anticlockwise seen from above.
      ea = -sweep;
    head.position.set(Math.cos(ea) * 0.6, 0, Math.sin(ea) * 0.6);
    // Pointing the way along: the derivative of (cos a, sin a) as a decreases.
    head.rotation.y = -Math.atan2(-Math.cos(ea), Math.sin(ea));
    bow.renderOrder = head.renderOrder = 6;
    this.arrow.add(bow, head);
    this.arrow.visible = false;
    this.hoverRing = ringMesh(keep, 0.2, 0.26, "#f3e7c7");
    (this.hoverRing.material as T.MeshBasicMaterial).opacity = 0.6;
    this.flash = ringMesh(keep, 0.32, 0.46, "#ff4a3a");
    this.scene.add(this.hintRing, this.hintGlow, this.arrow, this.hoverRing, this.flash);
    keyboard.nudge = this.nudger;
    this.begin();
    this.kick();
  }

  // --- The board ---------------------------------------------------------------------------------------------------

  /** The board's frame and face, the posts, the coils and the sockets for `state`, made anew. */
  private build(state: State) {
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    this.layer.clear();
    this.posts = [];
    this.hazards = [];
    this.builtFor = state.posts;
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r);
    const spanX = WIDTH * 2 + 0.5,
      spanZ = DEPTH * 2 + 0.5;
    const frame = new T.Mesh(keep(block(spanX + 0.36, 0.16, spanZ + 0.36, 0.07).translate(0, BOARD_TOP - 0.12, 0)), this.paint.frame);
    frame.castShadow = frame.receiveShadow = true;
    const face = keep(new T.MeshStandardMaterial({ map: keep(boardFace(state, spanX, spanZ)), roughness: 0.62, metalness: 0.05 })),
      edge = keep(new T.MeshStandardMaterial({ color: "#1d1714", roughness: 0.8 })),
      board = new T.Mesh(keep(block(spanX, 0.07, spanZ, 0.025).translate(0, BOARD_TOP - 0.035, 0)), [edge, edge, face, edge, edge, edge]);
    board.receiveShadow = true;
    this.layer.add(frame, board);
    const { shapes, paint } = this;
    const mesh = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, shadow = true) => {
      const m = new T.Mesh(geometry, material);
      m.castShadow = shadow;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    state.posts.forEach((post, index) => {
      const root = new T.Group(),
        light = LIGHT[post.colour];
      let cap: T.MeshStandardMaterial | null = null,
        core: T.Mesh | null = null,
        hoop: T.MeshStandardMaterial | null = null;
      const beads: T.Mesh[] = [];
      if (post.kind === "ring") {
        mesh(shapes.peg, paint.brass, root);
        hoop = keep(new T.MeshStandardMaterial({ color: GLASS[post.colour], emissive: light, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.85 }));
        mesh(shapes.hoop, hoop, root);
        mesh(shapes.pegBall, paint[`band${post.colour}`], root);
      } else {
        cap = keep(
          new T.MeshStandardMaterial({
            color: GLASS[post.colour],
            transparent: true,
            opacity: post.colour === WHITE ? 0.5 : 0.62,
            roughness: 0.06,
            metalness: 0.1,
            depthWrite: false,
            emissive: light,
            emissiveIntensity: 0,
          }),
        );
        mesh(shapes.post, paint.brass, root);
        if (post.colour !== WHITE) mesh(shapes.band, paint[`band${post.colour}`], root);
        core = new T.Mesh(shapes.core, keep(new T.MeshBasicMaterial({ color: light, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
        core.position.y = CORE_Y;
        root.add(core);
        const glass = mesh(shapes.cap, cap, root, false);
        glass.renderOrder = 2;
        if (post.kind === "counted") {
          mesh(shapes.top, paint.brass, root);
          mesh(shapes.topFace, paint[`top${Math.min(3, post.need)}`], root, false);
          for (let k = 0; k < post.need; k++) {
            // Beads on the side toward the player, one a wrap it needs, lit as the wraps are made.
            const bead = mesh(shapes.bead, this.beadOff, root, false),
              a = ((k - (post.need - 1) / 2) * Math.PI) / 4;
            bead.position.set(Math.sin(a) * 0.1, 0.38, Math.cos(a) * 0.1);
            beads.push(bead);
          }
        }
      }
      root.position.set(post.x, BOARD_TOP, post.z);
      const halo = new T.Sprite(keep(new T.SpriteMaterial({ map: this.glow, color: light, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
      halo.position.set(post.x, BOARD_TOP + (post.kind === "ring" ? 0.27 : CORE_Y), post.z);
      halo.renderOrder = 6;
      const pool = new T.Mesh(shapes.pool, keep(new T.MeshBasicMaterial({ map: this.glow, color: light, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
      pool.position.set(post.x, BOARD_TOP + 0.004, post.z);
      pool.scale.setScalar(post.kind === "ring" ? 1.1 : 1.8);
      pool.renderOrder = 3;
      this.layer.add(root, halo, pool);
      this.posts.push({ index, root, cap, core, halo, pool, beads, hoop, glow: 0 });
    });
    state.hazards.forEach((hz, i) => {
      const root = new T.Group();
      mesh(shapes.plinth, paint.iron, root);
      mesh(shapes.plinthBand, paint.bands, root, false);
      mesh(shapes.coreBar, paint.iron, root);
      mesh(shapes.coil, paint.wire, root);
      mesh(shapes.collar, paint.iron, root);
      mesh(shapes.collarBand, paint.bands, root, false);
      mesh(shapes.warnTop, paint.warnTop, root, false);
      mesh(shapes.terminal, paint.brass, root);
      root.rotation.y = i * 1.3;
      root.position.set(hz.x, BOARD_TOP, hz.z);
      // The sparks: a few jagged bolts from the terminal, drawn anew on each frame they show.
      const sparks = new T.LineSegments(
        keep(new T.BufferGeometry().setAttribute("position", new T.BufferAttribute(new Float32Array(4 * 7 * 2 * 3), 3))),
        keep(new T.LineBasicMaterial({ color: "#bfe4ff", transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false })),
      );
      sparks.position.set(hz.x, BOARD_TOP, hz.z);
      sparks.renderOrder = 7;
      sparks.visible = false;
      sparks.frustumCulled = false;
      const glow = new T.Sprite(keep(new T.SpriteMaterial({ map: this.glow, color: "#8fd0ff", transparent: true, opacity: 0.25, depthWrite: false, blending: T.AdditiveBlending })));
      glow.position.set(hz.x, BOARD_TOP + 0.56, hz.z);
      glow.scale.setScalar(0.4);
      glow.renderOrder = 7;
      this.layer.add(root, sparks, glow);
      this.hazards.push({ root, sparks, glow });
    });
    // The reel at the start (the cable leaves its drum toward the board), the socket at the exit, facing in.
    this.reel.position.set(state.start.x - 0.2, BOARD_TOP, state.start.z);
    this.socket.position.set(state.exit.x + 0.19, BOARD_TOP, state.exit.z);
    this.socket.rotation.y = -Math.PI / 2;
    this.fixedKey = "";
  }

  // --- The cable ---------------------------------------------------------------------------------------------------

  /** A tube of cloth along `points`, in `material`. */
  private tube(points: CablePoint[], material: T.Material) {
    const curve = new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(p.x, CABLE_Y, p.z)),
        false,
        "centripetal",
      ),
      segments = Math.max(2, points.length),
      geometry = new T.TubeGeometry(curve, segments, CABLE_R, this.soft ? 7 : 10, false),
      uv = geometry.getAttribute("uv"),
      start = points[0].along,
      span = points[points.length - 1].along - start,
      second = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      // The braid repeats about seven times a unit; the light's coordinate is the length from the reel.
      uv.setX(i, (start + u * span) * 7);
      second[i * 2] = start + u * span;
      second[i * 2 + 1] = uv.getY(i);
    }
    geometry.setAttribute("uv1", new T.BufferAttribute(second, 2));
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.cableLayer.add(mesh);
    return mesh;
  }
  /** Runs of one colour along `points`, each a tube. */
  private tubes(points: CablePoint[], burnt: boolean) {
    const out: T.Mesh[] = [];
    for (let a = 0; a < points.length - 1; ) {
      const tint = points[a + 1].tint;
      let b = a + 1;
      while (b + 1 < points.length && points[b + 1].tint === tint) b++;
      out.push(this.tube(points.slice(a, b + 1), burnt ? this.danger : this.cloth[tint]));
      a = b;
    }
    return out;
  }
  /** Lays the cable of `local` with the free end where it is: the fixed part when it has changed, the free part always. */
  private layCable() {
    const state = this.local;
    if (!state) return;
    const won = state.winner === 0,
      end = won ? state.exit : this.end,
      { fixed, free } = cableLines(state, end),
      key = `${keyOf(state)}|${state.posts.length}`;
    if (key !== this.fixedKey) {
      this.fixedKey = key;
      for (const m of this.fixedMeshes) {
        m.geometry.dispose();
        this.cableLayer.remove(m);
      }
      // A shorted cable glows red hot along its fixed length.
      this.fixedMeshes = fixed.length > 1 ? this.tubes(fixed, state.winner === 1) : [];
    }
    if (this.freeMesh) {
      this.freeMesh.geometry.dispose();
      this.cableLayer.remove(this.freeMesh);
      this.freeMesh = null;
    }
    // The coil the free run touches, and how near it comes to each.
    const run = won ? null : freeRun(state, end);
    this.nearness = state.hazards.map((h) => (run ? segmentDistance(h, run.a, run.b) - h.r : Infinity));
    this.touching = this.nearness.findIndex((d) => d < 0);
    if (free.length > 1) this.freeMesh = this.tube(free, this.touching >= 0 && state.winner === null ? this.danger : this.cloth[state.tint]);
    this.length = free[free.length - 1].along;
    // The plug lies along the free run's last stretch.
    const tip = free[free.length - 1],
      before = free.length > 1 ? free[free.length - 2] : { x: tip.x - 1, z: tip.z };
    this.plug.visible = !won;
    this.plug.position.set(tip.x, CABLE_Y + (this.drag ? 0.03 : 0), tip.z);
    this.plug.rotation.set(0, Math.atan2(-(tip.z - before.z), tip.x - before.x), 0);
    this.stamp();
    this.redraw();
    if (this.touching >= 0 || this.nearness.some((d) => d < NEAR)) this.wake();
  }
  /** Slides the light's front to `at` (a length from the reel). */
  private setFront(at: number) {
    this.frontAt = at;
    // u' = s · k + (0.5 − at · k): the crest (u' 0.5) stands at `at`.
    const k = 1 / FRONT_SPAN;
    this.front.repeat.set(k, 1);
    this.front.offset.set(0.5 - at * k, 0);
  }

  // --- The free end and its sweep ----------------------------------------------------------------------------------

  /** Takes the screen's state as the view's own: the free end rests by its last post, the bends as laid. */
  private adopt(state: State) {
    this.local = state;
    this.pending = [];
    this.end = restEnd(state);
    this.refusedKey = "";
    this.drag = null;
    const { arcs } = cableOf(state, this.end);
    this.bends = state.wraps.map((_, i) => (i < state.wraps.length - 1 ? (arcs[i]?.sweep ?? 0.5) : bendAt(state, this.end)));
  }
  /** Reports a move the view has made of the hand's motion (the screen plays it). */
  private report(move: Move, next: State) {
    this.local = next;
    this.pending.push(keyOf(next));
    this.onMove(move);
  }
  /** Keeps a place for the free end on the board and outside every post. */
  private settle(p: Pt): Pt {
    let x = Math.max(-WIDTH + EDGE, Math.min(WIDTH - EDGE, p.x)),
      z = Math.max(-DEPTH + EDGE, Math.min(DEPTH - EDGE, p.z));
    for (const post of this.local!.posts) {
      const dx = x - post.x,
        dz = z - post.z,
        d = Math.hypot(dx, dz),
        keep = post.r + 0.03;
      if (d < keep) {
        const ux = d > 1e-6 ? dx / d : 1,
          uz = d > 1e-6 ? dz / d : 0;
        x = post.x + ux * keep;
        z = post.z + uz * keep;
      }
    }
    return { x, z };
  }
  /** Draws the free end toward `target` a little at a time, catching and freeing posts as it goes. */
  private moveEnd(target: Pt) {
    const start = { ...this.end },
      dx = target.x - start.x,
      dz = target.z - start.z,
      steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUB));
    for (let i = 1; i <= steps; i++) {
      if (!this.local || this.local.winner !== null) break;
      if (!this.advance(this.settle({ x: start.x + (dx * i) / steps, z: start.z + (dz * i) / steps }))) break;
    }
    this.layCable();
  }
  /**
   * One step of the free end to `p`: the last wrap comes free while the bend round it has turned back past straight;
   * then any post the free run now touches is caught, on the side the run came from (the first the sweep meets, by
   * angle from the pivot, when several are touched at once). False when a catch is refused (the end stays where it
   * was) or the cable has shorted.
   */
  private advance(p: Pt): boolean {
    let s = this.local!;
    // Unwraps: the bend round the last post, followed continuously, through zero.
    while (s.wraps.length) {
      const last = this.bends.length - 1,
        before = this.bends[last] ?? 0,
        bend = before + wrapPi(bendAt(s, p) - turnOf(before));
      if (bend >= 0) {
        this.bends[last] = bend;
        break;
      }
      const next = play(s, unwrapMove());
      if (!next) break;
      this.bends.pop();
      this.report(unwrapMove(), next);
      s = next;
    }
    // Catches.
    for (let guard = 0; guard < 6; guard++) {
      const run = freeRun(s, p);
      if (!run) return false;
      const last = s.wraps.length ? s.wraps[s.wraps.length - 1].post : -1,
        old = freeRun(s, this.end) ?? run,
        ox = old.b.x - old.a.x,
        oz = old.b.z - old.a.z,
        oa = Math.atan2(oz, ox);
      let best = -1,
        bestTurn = Infinity;
      s.posts.forEach((post, i) => {
        if (i === last || segmentDistance(post, run.a, run.b) >= post.r) return;
        // The angle the free run turns through, from where it was, before it meets the post's edge.
        const far = Math.hypot(post.x - run.a.x, post.z - run.a.z),
          turn = Math.abs(wrapPi(Math.atan2(post.z - run.a.z, post.x - run.a.x) - oa)) - Math.asin(Math.min(1, post.r / Math.max(far, post.r)));
        if (turn < bestTurn) {
          bestTurn = turn;
          best = i;
        }
      });
      if (best < 0) break;
      const post = s.posts[best],
        side: Side = ox * (post.z - old.a.z) - oz * (post.x - old.a.x) >= 0 ? CW : -1,
        move = wrapMove(best, side),
        next = play(s, move);
      if (!next) {
        // Refused (it would cross the cable, or a post stands in its way): the end goes no further, and why is told once.
        const key = `${keyOf(s)}|${move.to}`;
        if (key !== this.refusedKey) {
          this.refusedKey = key;
          this.onMove(move);
        }
        return false;
      }
      this.report(move, next);
      s = next;
      const bend = bendAt(s, p);
      this.bends.push(bend > Math.PI ? 1e-3 : bend);
      if (s.winner !== null) {
        this.end = p;
        return false;
      }
    }
    this.end = p;
    this.refusedKey = "";
    return true;
  }
  /** An arrow key: the free end a little that way (screen up is away from the player). */
  private nudge(dx: number, dz: number) {
    if (!this.local || this.local.winner !== null || this.animating) return;
    this.moveEnd({ x: this.end.x + dx * NUDGE, z: this.end.z + dz * NUDGE });
  }
  private boardPoint(ray: T.Ray) {
    const at = new T.Vector3();
    return ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -CABLE_Y), at) ? { x: at.x, z: at.z } : null;
  }
  protected pick(ray: T.Ray): number | null {
    const at = this.boardPoint(ray);
    return at && Math.hypot(at.x - this.end.x, at.z - this.end.z) <= GRAB ? 0 : -1;
  }
  protected hover(point: number) {
    const on = point === 0 && !!this.local && this.local.winner === null;
    if (on === this.hovered) return;
    this.hovered = on;
    this.mark(this.marks);
  }
  protected dragStart(_point: number, at: { x: number; y: number; z: number }) {
    const state = this.local;
    if (!state) return false;
    // Every press is taken here, so that a tap plays nothing; one on (or near) the free end takes it up.
    this.drag = null;
    if (state.winner === null && Math.hypot(at.x - this.end.x, at.z - this.end.z) <= GRAB) {
      this.drag = { dx: this.end.x - at.x, dz: this.end.z - at.z };
      this.refusedKey = "";
      this.layCable();
    }
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    if (!this.drag || !this.local || this.local.winner !== null) return;
    this.moveEnd({ x: at.x + this.drag.dx, z: at.z + this.drag.dz });
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !this.local) return;
    if (at && this.local.winner === null) this.moveEnd({ x: at.x + drag.dx, z: at.z + drag.dz });
    // Let go on the exit socket: the plug goes in (or why it cannot is told).
    const s = this.local;
    if (s.winner === null && Math.hypot(this.end.x - s.exit.x, this.end.z - s.exit.z) <= EXIT_GRAB) {
      const move = plugMove(),
        next = play(s, move);
      if (next) this.report(move, next);
      else this.onMove(move);
    }
    this.layCable();
  }
  /** The screen refused a move of mine: a red ring flashes where it was (and the view takes the screen's state back). */
  refused(move: Move) {
    const state = this.state;
    if (!state) return;
    if (this.pending.length) {
      this.adopt(state);
      this.layCable();
    }
    const m = decode(move, state.posts.length),
      at = m?.kind === "wrap" ? state.posts[m.post] : m?.kind === "plug" ? state.exit : null;
    if (!at) return;
    this.flash.position.set(at.x, BOARD_TOP + 0.012, at.z);
    this.flash.visible = true;
    this.flashUntil = performance.now() + 650;
    this.wake();
  }

  // --- Laying out --------------------------------------------------------------------------------------------------

  sync(state: State, animate = true) {
    const before = this.state,
      key = keyOf(state),
      same = !!this.local && this.local.posts === state.posts,
      at = same ? this.pending.indexOf(key) : -1;
    // A state the view reported itself (or the one it shows, shown again) keeps the free end where the hand left it.
    if (at >= 0) {
      this.pending.splice(0, at + 1);
      if (!this.pending.length) this.local = state;
    } else if (same && !this.pending.length && key === keyOf(this.local!)) this.local = state;
    else this.adopt(state);
    const stepped = !!before && animate && state.ply === before.ply + 1 && state.posts === before.posts;
    if (stepped && state.last && !this.reducedMotion) for (const i of state.last.lit) this.flaring.set(i, performance.now());
    const finale = stepped && state.winner === 0 && before!.winner === null;
    // Every move is laid out at once (the table never counts as moving for it); only the win's light runs as a tween.
    super.sync(state, finale);
    if (stepped) this.onContact();
    if (this.flaring.size) this.wake();
  }
  protected subject(aspect: number): TableSubject {
    return cableSubject(aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    if (state.posts !== this.builtFor) {
      this.build(state);
      if (!this.local || this.local.posts !== state.posts) this.adopt(state);
      this.resize();
    }
    if (!this.local || this.local.posts !== state.posts) this.adopt(state);
    const won = state.winner === 0;
    this.layCable();
    if (!this.animating) this.setFront(won ? this.length + FRONT_SPAN * 2 : -FRONT_SPAN * 2);
    this.shorted = state.winner === 1 ? this.shortAt(state) : -1;
    const lit = this.local!;
    for (const post of this.posts) {
      const on = isLit(lit, post.index);
      if (!on || !this.flaring.has(post.index)) this.shine(post, on ? (won ? 1.08 : 1) : 0);
      const counts = lit.counts[post.index];
      post.beads.forEach((bead, k) => (bead.material = k < counts ? this.beadOn : this.beadOff));
      if (post.hoop) post.hoop.emissiveIntensity = lit.wraps.some((w) => w.post === post.index) ? 1.6 : 0.35;
    }
    // The exit's ring glows faintly while it waits, so that it is found; brightly once the plug is in.
    if (!this.animating) {
      this.socketRing.emissiveIntensity = won ? 2.2 : 0.55;
      (this.socketGlow.material as T.SpriteMaterial).opacity = won ? 0.7 : 0;
    }
    this.mark(this.marks);
  }
  /** The coil a shorted cable touches. */
  private shortAt(state: State) {
    const { runs, arcs } = cableOf(state);
    return state.hazards.findIndex((h) => runs.some((r) => segmentDistance(h, r.a, r.b) < h.r) || arcs.some((a) => arcDistance(h, a) < h.r));
  }
  /** Sets a post's brightness: 0 dark, 1 lit; above 1 while it flares. */
  private shine(post: PostModel, glow: number) {
    post.glow = glow;
    const g = Math.min(1, glow),
      extra = Math.max(0, glow - 1),
      soft = this.soft,
      colour = this.local?.posts[post.index]?.colour ?? WHITE;
    if (post.cap) {
      post.cap.emissiveIntensity = g * (soft ? 1.0 : 1.35) + extra * 1.1;
      post.cap.opacity = (colour === WHITE ? 0.5 : 0.62) + 0.3 * g;
    }
    if (post.core) {
      (post.core.material as T.MeshBasicMaterial).opacity = g * 0.95;
      post.core.scale.setScalar(1 + extra * 0.6);
    }
    (post.halo.material as T.SpriteMaterial).opacity = g * (soft ? 0.5 : 0.75) + extra * 0.45;
    post.halo.scale.setScalar((soft ? 0.9 : 1.2) * (0.6 + 0.4 * g) + extra * 1.3);
    (post.pool.material as T.MeshBasicMaterial).opacity = g * (soft ? 0.3 : 0.42) + extra * 0.25;
  }
  protected animate(before: State, state: State) {
    if (state.winner !== 0 || before.winner !== null) return false;
    // Won: the plug goes in, and the light runs along the whole cable from the reel, each post flaring as it passes.
    this.local = state;
    this.layCable();
    const total = this.length,
      ms = Math.min(2600, Math.max(900, total * RUN_PER_UNIT)),
      reach = this.wrapAlong(state);
    this.setFront(-FRONT_SPAN);
    this.socketRing.emissiveIntensity = 0;
    (this.socketGlow.material as T.SpriteMaterial).opacity = 0;
    const flared = new Set<number>();
    this.tween(160, ms, (p) => {
      const at = -FRONT_SPAN * 0.5 + (total + FRONT_SPAN) * p;
      this.setFront(at);
      state.wraps.forEach((w, i) => {
        if (!flared.has(w.post) && reach[i] <= at) {
          flared.add(w.post);
          this.flaring.set(w.post, performance.now());
          this.wake();
        }
      });
      if (p === 1) {
        this.socketRing.emissiveIntensity = 2.2;
        (this.socketGlow.material as T.SpriteMaterial).opacity = 0.7;
      }
    });
    return true;
  }
  /** How far along the cable (from the reel) each wrap is reached. */
  private wrapAlong(state: State) {
    const { runs, arcs } = cableOf(state, state.exit),
      out: number[] = [];
    let along = 0;
    runs.forEach((r, i) => {
      along += Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z);
      if (i < state.wraps.length) out.push(along);
      if (arcs[i]) along += arcs[i].sweep * arcs[i].r;
    });
    return out;
  }
  protected mark(marks: Marks) {
    const state = this.local;
    if (!state) return;
    const live = state.winner === null && !capturing(),
      hint = live && marks.hint ? { from: marks.hint.from, to: marks.hint.to, extra: -1 } : null,
      m = hint ? decode(hint, state.posts.length) : null;
    this.hintMove = m ? hint : null;
    this.hintRing.visible = this.hintGlow.visible = this.arrow.visible = false;
    if (m) {
      const at = m.kind === "plug" ? state.exit : m.kind === "wrap" ? state.posts[m.post] : state.wraps.length ? state.posts[state.wraps[state.wraps.length - 1].post] : null;
      if (at) {
        const small = m.kind === "wrap" && state.posts[m.post].kind === "ring" ? 0.8 : 1;
        this.hintRing.position.set(at.x, BOARD_TOP + 0.01, at.z);
        this.hintGlow.position.set(at.x, BOARD_TOP + 0.008, at.z);
        this.hintRing.scale.setScalar(small);
        this.hintGlow.scale.setScalar(small);
        this.hintRing.visible = this.hintGlow.visible = true;
      }
      // An arrow round the post, the way the cable is to go round it (round the last post backward, to free it).
      if (m.kind === "wrap" || (m.kind === "unwrap" && state.wraps.length)) {
        const post = m.kind === "wrap" ? state.posts[m.post] : state.posts[state.wraps[state.wraps.length - 1].post],
          side = m.kind === "wrap" ? m.side : -state.wraps[state.wraps.length - 1].side,
          pivot = m.kind === "wrap" ? pivotOf(state) : null,
          run = pivot ? tangent(pivot, { x: post.x, z: post.z, r: post.r, s: side }) : null,
          from = run ? angleAt(post, run.b) - side * 0.25 : angleAt(post, this.end);
        // Unmirrored the arrow runs anticlockwise from angle 0; mirrored in z it runs clockwise.
        this.arrow.position.set(post.x, BOARD_TOP + 0.14, post.z);
        this.arrow.scale.set(post.kind === "ring" ? 0.8 : 1, 1, side === CW ? -1 : 1);
        this.arrow.rotation.y = -from;
        this.arrow.visible = true;
      }
    }
    this.hoverRing.visible = live && this.hovered && !this.drag;
    if (this.hoverRing.visible) this.hoverRing.position.set(this.end.x, BOARD_TOP + 0.01, this.end.z);
    this.stamp();
    this.redraw();
  }
  /**
   * For browser tests: the posts (kind, colour, need, place on the canvas in CSS pixels, radius there, lit), the
   * coils (place, radius), the free end (on the board and on the canvas), the exit's place, the wraps, the lit posts,
   * the cable's colour, whether the free run touches a coil, and the hint.
   */
  private stamp() {
    const state = this.local;
    if (!state) return;
    const el = this.renderer.domElement,
      v = new T.Vector3(),
      w = el.clientWidth,
      h = el.clientHeight;
    this.camera.updateMatrixWorld();
    const screen = (x: number, z: number, y = BOARD_TOP) => {
      v.set(x, y, z).project(this.camera);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    };
    const place = (x: number, z: number, r: number) => {
      const a = screen(x, z),
        b = screen(x + r, z);
      return `${a.x.toFixed(1)},${a.y.toFixed(1)}:${Math.abs(b.x - a.x).toFixed(1)}`;
    };
    el.dataset.posts = state.posts.map((p, i) => `${p.kind}:${p.colour}:${p.need}:${place(p.x, p.z, p.r)}:${isLit(state, i) ? 1 : 0}`).join(" ");
    el.dataset.hazards = state.hazards.map((hz) => place(hz.x, hz.z, hz.r)).join(" ");
    const e = screen(this.end.x, this.end.z, CABLE_Y),
      x = screen(state.exit.x, state.exit.z, CABLE_Y);
    el.dataset.end = `${this.end.x.toFixed(4)},${this.end.z.toFixed(4)}`;
    el.dataset.endScreen = `${e.x.toFixed(1)},${e.y.toFixed(1)}`;
    el.dataset.exit = `${x.x.toFixed(1)},${x.y.toFixed(1)}`;
    el.dataset.wraps = state.wraps.map((wr) => `${wr.post}:${wr.side}`).join(" ");
    el.dataset.lit = state.posts.flatMap((_, i) => (isLit(state, i) ? [i] : [])).join(" ");
    el.dataset.tint = String(state.tint);
    el.dataset.danger = String(this.touching >= 0 ? 1 : 0);
    const hm = this.hintMove ? decode(this.hintMove, state.posts.length) : null;
    el.dataset.hint = !hm ? "" : hm.kind === "wrap" ? `${hm.post}:${hm.side}` : hm.kind;
  }

  // --- The workshop's own frames -----------------------------------------------------------------------------------

  private kick() {
    if (!this.clock && !this.disposed && this.live) this.clock = requestAnimationFrame(this.frame);
  }
  private wake() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  /** Draws a coil's sparks: `strength` 0 none, about 0.3 a crackle now and then, 1 a fierce arc. */
  private spark(model: HazardModel, strength: number, toward: Pt | null) {
    const pos = model.sparks.geometry.getAttribute("position") as T.BufferAttribute,
      rand = this.sparkle,
      bolts = strength >= 1 ? 4 : strength > 0.5 ? 3 : 2;
    model.sparks.visible = strength > 0 && (strength >= 0.6 || rand() < 0.35 + strength);
    (model.glow.material as T.SpriteMaterial).opacity = 0.2 + strength * 0.7;
    model.glow.scale.setScalar(0.35 + strength * 0.5);
    if (!model.sparks.visible) return;
    const centre = model.sparks.position;
    let k = 0;
    for (let b = 0; b < 4; b++) {
      const used = b < bolts;
      // From the terminal out to a point round it (or toward the cable that touches it).
      let tx: number, tz: number, ty: number;
      if (toward && b === 0 && strength >= 0.6) {
        tx = toward.x - centre.x;
        tz = toward.z - centre.z;
        ty = CABLE_Y;
      } else {
        const a = rand() * Math.PI * 2,
          r = 0.12 + rand() * (0.12 + strength * 0.2);
        tx = Math.cos(a) * r;
        tz = Math.sin(a) * r;
        ty = 0.4 + rand() * 0.25;
      }
      let px = 0,
        py = 0.58,
        pz = 0;
      for (let j = 1; j <= 7; j++) {
        const t = j / 7,
          jitter = j === 7 ? 0 : 0.05 + strength * 0.03,
          nx = tx * t + (rand() - 0.5) * jitter,
          ny = 0.58 + (ty - 0.58) * t + (rand() - 0.5) * jitter,
          nz = tz * t + (rand() - 0.5) * jitter;
        pos.setXYZ(k++, used ? px : 0, used ? py : 0, used ? pz : 0);
        pos.setXYZ(k++, used ? nx : 0, used ? ny : 0, used ? nz : 0);
        px = nx;
        py = ny;
        pz = nz;
      }
    }
    pos.needsUpdate = true;
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    let more = this.live;
    const state = this.local,
      t = now / 1000,
      quiet = capturing();
    if (state) {
      for (const post of this.posts) {
        const start = this.flaring.get(post.index),
          on = isLit(state, post.index);
        if (start !== undefined) {
          const p = Math.min(1, (now - start) / FLARE_MS);
          if (p >= 1 || !on) this.flaring.delete(post.index);
          else {
            this.shine(post, 1 + Math.sin(p * Math.PI) * 0.8 - (1 - p) * (p < 0.2 ? 1 - p / 0.2 : 0));
            more = true;
            continue;
          }
        }
        if (this.live && on) this.shine(post, (state.winner === 0 ? 1.08 : 1) + 0.06 * Math.sin(t * 2.3 + post.index * 1.7));
        else if (on) this.shine(post, state.winner === 0 ? 1.08 : 1);
      }
      // Coils crackle now and then, more as the free run comes near; one the cable touches arcs over to it.
      const run = state.winner === null ? freeRun(state, this.end) : null;
      this.hazards.forEach((model, i) => {
        const near = this.nearness[i] ?? Infinity,
          touched = i === this.touching || i === this.shorted,
          strength = touched ? 1 : near < NEAR ? 0.65 * (1 - near / NEAR) + 0.1 : this.live && !quiet ? 0.12 : 0;
        let toward: Pt | null = null;
        if (touched) {
          const h = state.hazards[i];
          if (i === this.shorted) toward = { x: h.x + 0.3, z: h.z };
          else if (run) {
            // The nearest point of the free run.
            const dx = run.b.x - run.a.x,
              dz = run.b.z - run.a.z,
              u = Math.max(0, Math.min(1, ((h.x - run.a.x) * dx + (h.z - run.a.z) * dz) / (dx * dx + dz * dz || 1)));
            toward = { x: run.a.x + dx * u, z: run.a.z + dz * u };
          }
        }
        this.spark(model, quiet && !touched ? 0 : strength, toward);
        // Where the picture is drawn by software the sparks are drawn once, as they stand, not flickered.
        if (strength > 0.12 && this.live) more = true;
      });
    }
    if (this.hintGlow.visible) (this.hintGlow.material as T.MeshBasicMaterial).opacity = this.live ? 0.28 + 0.16 * Math.sin(t * 4) : 0.36;
    const flash = this.flashUntil - now;
    if (this.flash.visible) {
      if (flash <= 0) this.flash.visible = false;
      else {
        (this.flash.material as T.MeshBasicMaterial).opacity = Math.min(1, flash / 300);
        more = true;
      }
    }
    this.redraw();
    if (more) this.clock = requestAnimationFrame(this.frame);
  };
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    if (keyboard.nudge === this.nudger) keyboard.nudge = null;
    for (const m of this.fixedMeshes) m.geometry.dispose();
    this.fixedMeshes = [];
    this.freeMesh?.geometry.dispose();
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    super.dispose();
  }
}
