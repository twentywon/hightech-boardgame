import * as T from "three";
import { block, glossy, stuff, wood } from "../../engine/scene-utils";
import { pub } from "../../engine/scenery";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BOARD_X, BOARD_Y, CHALK, EYE, FACE_Z, FLOOR, MM, WALL_Z, boardPoint, dartsCamera, swipe, tremor } from "./layout";
import { BOARD_EDGE, BULL, DOUBLE_IN, DOUBLE_OUT, LIMIT, ORDER, OUTER_BULL, ROUNDS, TREBLE_IN, TREBLE_OUT, aimCode, suggestion, type Dart, type State } from "./rules";

/** The flights of each side's darts. */
export const DART_COLORS: [string, string] = ["#d8342a", "#2a6fd8"];
/** A tiny fixed sequence, so that painted pictures come out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const canvasTexture = (canvas: HTMLCanvasElement) => {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};
/** How long a dart flies, wobbles once stuck, and how long a finished visit stays on the board before it is pulled. */
const FLIGHT = 420,
  WOBBLE = 280,
  REST = 950,
  PULL = 460,
  /** How high the dart's arc rises above the straight line. */
  ARC = 0.5,
  /** How far a stuck dart's point is in the board. */
  SUNK = 0.03,
  /** The darts are drawn a little larger than life, so that they read at a glance across the room. */
  LARGER = 1.3,
  /** The aiming ring's radius, in millimetres of the board. */
  RING = 40,
  /** How far the dart in the hand moves for each millimetre the tremor moves the ring: the hand is about a third as far from the eye as the board, so the two move together on the screen. */
  HAND_SHAKE = 0.3;
/**
 * A repeating tile of specks, light ones of `tint` and (when `dark` is given) black ones, each a few pixels across,
 * covering about `cover` of the tile: the fibres of sisal seen end on.
 */
function speckles(ctx: CanvasRenderingContext2D, random: () => number, tint: [number, number, number], light: [number, number], dark: [number, number] | null, cover: number) {
  const size = 256,
    tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const t = tile.getContext("2d")!,
    image = t.createImageData(size, size),
    data = image.data;
  // Specks two or three pixels square, laid on a grid of cells so that they overlap little.
  for (let y = 0; y < size; y += 2)
    for (let x = 0; x < size; x += 2) {
      if (random() > cover) continue;
      const lit = !dark || random() < 0.5,
        [lo, hi] = lit ? light : dark!,
        alpha = Math.round((lo + random() * (hi - lo)) * 255),
        [r, g, b] = lit ? tint : [0, 0, 0],
        w = 2 + (random() < 0.4 ? 1 : 0);
      for (let dy = 0; dy < w; dy++)
        for (let dx = 0; dx < w; dx++) {
          const i = (((y + dy) % size) * size + ((x + dx) % size)) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = alpha;
        }
    }
  t.putImageData(image, 0, 0);
  return ctx.createPattern(tile, "repeat")!;
}
/** The face of the board: sisal beds in black and cream with red and green rings, the wire spider and the numbers. */
function boardFace() {
  const px = 2048,
    c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!,
    k = px / 2 / BOARD_EDGE,
    o = px / 2,
    random = sequence(20);
  ctx.fillStyle = "#121212";
  ctx.beginPath();
  ctx.arc(o, o, BOARD_EDGE * k, 0, Math.PI * 2);
  ctx.fill();
  // Angles are measured clockwise from the top; the canvas's own run clockwise from the right.
  const at = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const sector = (r0: number, r1: number, a0: number, a1: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(o, o, r1 * k, at(a0), at(a1));
    ctx.arc(o, o, r0 * k, at(a1), at(a0), true);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ORDER.forEach((_, i) => {
    const a0 = i * 18 - 9,
      a1 = a0 + 18,
      dark = i % 2 === 0;
    sector(OUTER_BULL, TREBLE_IN, a0, a1, dark ? "#1b1a19" : "#efe1c0");
    sector(TREBLE_IN, TREBLE_OUT, a0, a1, dark ? "#c62a2c" : "#1d7a48");
    sector(TREBLE_OUT, DOUBLE_IN, a0, a1, dark ? "#1b1a19" : "#efe1c0");
    sector(DOUBLE_IN, DOUBLE_OUT, a0, a1, dark ? "#c62a2c" : "#1d7a48");
  });
  ctx.fillStyle = "#1d7a48";
  ctx.beginPath();
  ctx.arc(o, o, OUTER_BULL * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c62a2c";
  ctx.beginPath();
  ctx.arc(o, o, BULL * k, 0, Math.PI * 2);
  ctx.fill();
  // Sisal: packed fibres seen end on, a little lighter and darker dot by dot, and the holes of darts thrown before.
  ctx.save();
  ctx.beginPath();
  ctx.arc(o, o, DOUBLE_OUT * k, 0, Math.PI * 2);
  ctx.clip();
  // Painted once into a small tile of specks and laid as a pattern: drawn speck by speck, the 150,000 of them held
  // the table's first picture back by about ten seconds under software rendering.
  ctx.fillStyle = speckles(ctx, random, [255, 248, 230], [0.05, 0.13], [0.08, 0.2], 0.55);
  ctx.fillRect(0, 0, px, px);
  for (const [deg, r, spread, count] of [[0, 103, 22, 70], [0, 0, 18, 40], [-36, 103, 20, 26], [198, 103, 20, 26], [0, 166, 14, 18], [-90 + 288, 166, 12, 10]] as const) {
    const a = at(deg);
    for (let n = 0; n < count; n++) {
      const rr = r + (random() - 0.5) * spread,
        aa = a + (random() - 0.5) * (spread / Math.max(40, r)),
        x = o + Math.cos(aa) * rr * k + (r ? 0 : (random() - 0.5) * spread * k),
        y = o + Math.sin(aa) * rr * k + (r ? 0 : (random() - 0.5) * spread * k);
      ctx.fillStyle = "rgba(10,8,6,0.55)";
      ctx.beginPath();
      ctx.arc(x, y, 2.2 + random() * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  // The surround's own fibres, darker.
  ctx.save();
  ctx.beginPath();
  ctx.arc(o, o, BOARD_EDGE * k, 0, Math.PI * 2);
  ctx.arc(o, o, DOUBLE_OUT * k, 0, Math.PI * 2, true);
  ctx.clip();
  ctx.fillStyle = speckles(ctx, random, [255, 255, 255], [0.02, 0.06], null, 0.12);
  ctx.fillRect(0, 0, px, px);
  ctx.restore();
  // The spider: wires round each ring and between the segments, raised (a shadow below, a glint above).
  const wire = (draw: () => void) => {
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.save();
    ctx.translate(2, 3);
    draw();
    ctx.restore();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = "#b9bcc2";
    draw();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.save();
    ctx.translate(-0.8, -1);
    draw();
    ctx.restore();
  };
  for (const r of [BULL, OUTER_BULL, TREBLE_IN, TREBLE_OUT, DOUBLE_IN, DOUBLE_OUT])
    wire(() => {
      ctx.beginPath();
      ctx.arc(o, o, r * k, 0, Math.PI * 2);
      ctx.stroke();
    });
  wire(() => {
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = at(i * 18 - 9);
      ctx.moveTo(o + Math.cos(a) * OUTER_BULL * k, o + Math.sin(a) * OUTER_BULL * k);
      ctx.lineTo(o + Math.cos(a) * DOUBLE_OUT * k, o + Math.sin(a) * DOUBLE_OUT * k);
    }
    ctx.stroke();
  });
  // The number ring: a wire hoop with the numbers on the surround, white and upright.
  wire(() => {
    ctx.beginPath();
    ctx.arc(o, o, 214 * k, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.font = `700 ${Math.round(27 * k)}px "Inter", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ORDER.forEach((n, i) => {
    const a = at(i * 18),
      x = o + Math.cos(a) * 192 * k,
      y = o + Math.sin(a) * 192 * k;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(String(n), x + 3, y + 4);
    ctx.fillStyle = "#f4f1ea";
    ctx.fillText(String(n), x, y);
  });
  return canvasTexture(c);
}
/** A flight's face: its colour, a paler edge and a white star. */
function flightFace(colour: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  for (let p = 0; p < 10; p++) {
    const a = (p / 10) * Math.PI * 2 - Math.PI / 2,
      r = p % 2 ? 12 : 28;
    ctx.lineTo(64 + Math.cos(a) * r, 70 + Math.sin(a) * r);
  }
  ctx.fill();
  return canvasTexture(c);
}
/** Chalk on slate: the dust of words rubbed out, then a grain that leaves some of each stroke out. */
function slate(ctx: CanvasRenderingContext2D, w: number, h: number, random: () => number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#26302b");
  g.addColorStop(1, "#1b2420");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 18; k++) {
    const x = random() * w,
      y = random() * h,
      r = 40 + random() * 120,
      cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, "rgba(220,230,225,0.07)");
    cloud.addColorStop(1, "rgba(220,230,225,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
/**
 * A pub's darts corner, seen from the oche: a board of our own making on a walnut cabinet under a brass lamp on the
 * pub's brick wall, and at its right a chalk scoreboard. A swipe up throws: its slant and length set the point
 * aimed at, and a ring shows it while the finger moves, trembling as a hand does (`tremor`); the dart lands on the
 * ring's dot where it was when the finger let go. It flies in an arc from the hand, sticks with a thud and a wobble,
 * and its score floats up. After the third dart the darts are pulled and the turn passes.
 */
export class DartsView extends TableView<State> {
  /** Three darts a side, used in turn for the darts of a visit, and the one waiting in the hand. */
  private sets: T.Group[][] = [[], []];
  private hands: T.Group[] = [];
  private reticle = new T.Group();
  private chalk: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private words: { sprite: T.Sprite; at: number; from: T.Vector3; rise: number; life: number }[] = [];
  private ticker = 0;
  /** The swipe under way (where it began, in page pixels) and the keyboard's aim (millimetres from the bull). */
  private press: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  private keyAim: { x: number; y: number } | null = null;
  /** The hand while it aims: when this aim began (-1 at rest), where in the tremor it began, and how far it has the ring moved now (millimetres). */
  private hand = { since: -1, seed: 0, x: 0, y: 0 };
  /** The tremor's own frame, asked for while the ring is shown. */
  private shaking = 0;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai",
  ) {
    super(host, quality, "#16110d");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The pub's warm light, a brass lamp over the board, and a little light from the bar behind the thrower.
    this.scene.add(new T.HemisphereLight("#f4dcc0", "#2a1c14", 1.1));
    // It shines from a little way out, so that the darts' shadows fall short below them.
    const lamp = new T.SpotLight("#fff0d6", 5.2, 0, 0.42, 0.6, 0);
    lamp.position.set(BOARD_X + 0.2, BOARD_Y + 2.1, FACE_Z + 3.4);
    lamp.target.position.set(BOARD_X, BOARD_Y - 0.15, FACE_Z);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.normalBias = 0.01;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    const bar = new T.DirectionalLight("#ffd8b0", 0.9);
    bar.position.set(2, 3, 6);
    this.scene.add(bar);
    pub(this.scene, keep, 1.6, FLOOR);
    // The wall round the darts corner, its bricks at the size they are seen from the oche.
    this.add(new T.PlaneGeometry(22, 12), this.standard({ ...stuff("brick", "#8a5240", 7.5, keep, 4.1), roughness: 1 }), BOARD_X, BOARD_Y, WALL_Z + 0.004).castShadow = false;
    this.cabinet(keep);
    this.chalk = this.scoreboard(keep);
    // The darts: a steel point, a tungsten barrel, a shaft and four flights of the side's colour.
    const point = keep(new T.CylinderGeometry(0.0035, 0.0009, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.05)),
      barrel = keep(new T.LatheGeometry([[0.0035, 0], [0.009, 0.01], [0.0125, 0.05], [0.0128, 0.1], [0.011, 0.15], [0.006, 0.168]].map(([r, y]) => new T.Vector2(r, y)), 18).rotateX(Math.PI / 2).translate(0, 0, 0.1)),
      grip = keep(new T.CylinderGeometry(0.0131, 0.0131, 0.05, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.18)),
      shaft = keep(new T.CylinderGeometry(0.0055, 0.006, 0.13, 10).rotateX(Math.PI / 2).translate(0, 0, 0.33)),
      outline = new T.Shape();
    outline.moveTo(0.004, 0);
    outline.lineTo(0.03, 0.025);
    outline.quadraticCurveTo(0.062, 0.07, 0.06, 0.12);
    outline.lineTo(0.004, 0.13);
    outline.closePath();
    const vane = keep(new T.ShapeGeometry(outline, 6));
    // The flight's face is laid by its own coordinates: one picture across it.
    const uv = vane.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.062, uv.getY(i) / 0.13);
    const steel = this.standard({ color: "#d9dce2", roughness: 0.22, metalness: 0.9 }),
      tungsten = keep(glossy({ color: "#8d9097", roughness: 0.3, metalness: 0.85 }, 0.5)),
      knurl = this.standard({ color: "#55585e", roughness: 0.55, metalness: 0.7 }),
      black = this.standard({ color: "#1c1c20", roughness: 0.4 });
    const dart = (colour: string) => {
      const g = new T.Group(),
        flight = keep(new T.MeshStandardMaterial({ map: keep(flightFace(colour)), roughness: 0.55, side: T.DoubleSide }));
      for (const [shape, paint] of [[point, steel], [barrel, tungsten], [grip, knurl], [shaft, black]] as const) {
        const mesh = new T.Mesh(shape, paint);
        mesh.castShadow = true;
        g.add(mesh);
      }
      for (let q = 0; q < 4; q++) {
        const mesh = new T.Mesh(vane, flight);
        // Each vane stands out from the shaft, its length along the dart.
        mesh.rotation.set(Math.PI / 2, 0, 0);
        const holder = new T.Group();
        holder.add(mesh);
        holder.rotation.z = (q * Math.PI) / 2 + Math.PI / 4;
        holder.position.z = 0.335;
        mesh.castShadow = true;
        g.add(holder);
      }
      g.visible = false;
      this.scene.add(g);
      return g;
    };
    for (const side of [0, 1]) {
      for (let k = 0; k < 3; k++) this.sets[side].push(dart(DART_COLORS[side]));
      this.hands.push(dart(DART_COLORS[side]));
    }
    // The aiming ring: a white ring with a dark edge, a cross and a dot in the middle, where the dart will land.
    const r = RING * MM,
      ringPaint = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })),
      edgePaint = keep(new T.MeshBasicMaterial({ color: "#101418", transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }));
    const ring = new T.Mesh(keep(new T.RingGeometry(r - 0.006, r, 48)), ringPaint),
      edge = new T.Mesh(keep(new T.RingGeometry(r - 0.011, r + 0.005, 48)), edgePaint),
      cross = new T.Mesh(keep(new T.PlaneGeometry(r * 0.9, 0.005)), ringPaint),
      down = new T.Mesh(keep(new T.PlaneGeometry(0.005, r * 0.9)), ringPaint);
    const dot = new T.Mesh(keep(new T.CircleGeometry(0.0105, 20)), ringPaint),
      dotEdge = new T.Mesh(keep(new T.CircleGeometry(0.0155, 20)), edgePaint);
    edge.renderOrder = 11;
    ring.renderOrder = cross.renderOrder = down.renderOrder = 12;
    dotEdge.renderOrder = 13;
    dot.renderOrder = 14;
    this.reticle.add(edge, ring, cross, down, dotEdge, dot);
    this.reticle.visible = false;
    this.scene.add(this.reticle);
    // The thrower's eye is the camera; presses are swipes, taken here and not as picks.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), -FACE_Z);
    this.listen();
    this.begin();
  }
  /** The board on its cabinet, the black catch ring round it, and the brass lamp above. */
  private cabinet(keep: <R extends { dispose(): void }>(r: R) => R) {
    const walnut = keep(wood(true));
    walnut.repeat.set(1, 1);
    const panel = this.standard({ map: walnut, color: "#8a5a3a", roughness: 0.55 }),
      frame = this.standard({ map: walnut, color: "#6a4228", roughness: 0.45 }),
      side = 2.3;
    this.add(block(side, side, 0.12, 0.03), panel, BOARD_X, BOARD_Y, WALL_Z + 0.06);
    for (const [x, y, w, h] of [[0, side / 2 + 0.06, side + 0.24, 0.14], [0, -side / 2 - 0.06, side + 0.24, 0.14], [side / 2 + 0.06, 0, 0.14, side], [-side / 2 - 0.06, 0, 0.14, side]])
      this.add(block(w, h, 0.22, 0.04), frame, BOARD_X + x, BOARD_Y + y, WALL_Z + 0.11);
    // The catch ring: black foam round the board.
    const foam = this.standard({ color: "#141414", roughness: 0.95 }),
      ring = new T.RingGeometry(BOARD_EDGE * MM - 0.02, 0.98, 64);
    this.add(ring, foam, BOARD_X, BOARD_Y, WALL_Z + 0.125).castShadow = false;
    this.add(new T.TorusGeometry(0.98, 0.025, 10, 64), foam, BOARD_X, BOARD_Y, WALL_Z + 0.125);
    // The board: a cylinder of sisal, its painted face, and its rim.
    const body = this.standard({ color: "#141414", roughness: 0.9 }),
      depth = FACE_Z - (WALL_Z + 0.12);
    this.add(new T.CylinderGeometry(BOARD_EDGE * MM, BOARD_EDGE * MM, depth, 64, 1, true).rotateX(Math.PI / 2), body, BOARD_X, BOARD_Y, FACE_Z - depth / 2);
    this.add(new T.CircleGeometry(BOARD_EDGE * MM, 96), this.standard({ map: keep(boardFace()), roughness: 0.92 }), BOARD_X, BOARD_Y, FACE_Z + 0.001).castShadow = false;
    // The brass lamp on an arm over the cabinet.
    const brass = this.standard({ color: "#c9a04a", roughness: 0.28, metalness: 0.85 });
    this.add(new T.CylinderGeometry(0.02, 0.02, 0.6, 10).rotateX(Math.PI / 2), brass, BOARD_X, BOARD_Y + side / 2 + 0.32, WALL_Z + 0.32).castShadow = false;
    this.add(block(0.3, 0.12, 0.06, 0.02), brass, BOARD_X, BOARD_Y + side / 2 + 0.32, WALL_Z + 0.04);
    const shade = this.add(new T.CylinderGeometry(0.11, 0.24, 0.32, 24, 1, true), keep(new T.MeshStandardMaterial({ color: "#c9a04a", roughness: 0.3, metalness: 0.85, side: T.DoubleSide })), BOARD_X, BOARD_Y + side / 2 + 0.26, WALL_Z + 0.66);
    shade.rotation.x = 0.55;
    // The lamp throws no shadow of itself onto the cabinet it lights.
    shade.castShadow = false;
    this.add(new T.SphereGeometry(0.07, 14, 10), this.standard({ color: "#fff6dc", emissive: "#fff0c8", emissiveIntensity: 1.5 }), BOARD_X, BOARD_Y + side / 2 + 0.18, WALL_Z + 0.7).castShadow = false;
  }
  /** The chalk scoreboard: a slate in a wooden frame, on the wall at the board's right, with a ledge of chalk. */
  private scoreboard(keep: <R extends { dispose(): void }>(r: R) => R) {
    const oak = keep(wood(false));
    const frame = this.standard({ map: oak, color: "#9b6a40", roughness: 0.6 });
    const { x, y, w, h } = CHALK;
    this.add(block(w + 0.14, h + 0.14, 0.06, 0.03), frame, x, y, WALL_Z + 0.03);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = Math.round((640 * h) / w);
    const texture = keep(canvasTexture(canvas));
    this.add(new T.PlaneGeometry(w, h), this.standard({ map: texture, roughness: 0.95 }), x, y, WALL_Z + 0.062).castShadow = false;
    this.add(block(w + 0.2, 0.05, 0.12, 0.015), frame, x, y - h / 2 - 0.07, WALL_Z + 0.09);
    this.add(new T.CylinderGeometry(0.012, 0.012, 0.11, 8).rotateZ(Math.PI / 2), this.standard({ color: "#f4f2ea", roughness: 1 }), x - 0.3, y - h / 2 - 0.035, WALL_Z + 0.1);
    return { canvas, texture, said: "" };
  }
  /** Writes the scores in chalk: who is to throw, each visit's score and what is left (501) or the running total. */
  private writeChalk(state: State) {
    const said = `${state.ply}|${state.turn}|${state.winner}|${this.mode}|${this.netNames}`;
    if (said === this.chalk.said) return;
    this.chalk.said = said;
    const { canvas } = this.chalk,
      W = canvas.width,
      H = canvas.height,
      ctx = canvas.getContext("2d")!,
      random = sequence(5 + state.ply);
    slate(ctx, W, H, sequence(3));
    const chalky = "rgba(240,242,236,0.92)";
    ctx.fillStyle = chalky;
    ctx.strokeStyle = chalky;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.lineCap = "round";
    const line = (x0: number, y0: number, x1: number, y1: number, width = 3) => {
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + (random() - 0.5) * 2);
      ctx.lineTo(x1, y1 + (random() - 0.5) * 2);
      ctx.stroke();
    };
    const font = (size: number, weight = 600) => (ctx.font = `${weight} ${size}px "Noto Sans KR", "Inter", sans-serif`);
    font(46, 800);
    ctx.fillText(state.mode === "501" ? "501" : "COUNT-UP", W / 2, 46);
    font(24, 500);
    const round = Math.min(state.visits[state.turn].length + 1, state.mode === "countup" ? ROUNDS : LIMIT);
    ctx.fillText(state.winner !== null ? "경기 끝" : state.mode === "countup" ? `${round} / ${ROUNDS} 라운드` : `${round}라운드`, W / 2, 86);
    line(30, 108, W - 30, 108, 3);
    const names = this.netNames ?? (this.mode === "ai" ? ["나", "컴퓨터"] : ["플레이어 1", "플레이어 2"]),
      cols = [W * 0.27, W * 0.73];
    line(W / 2, 120, W / 2, H - 120, 3);
    names.forEach((name, side) => {
      font(34, 700);
      ctx.fillText(name, cols[side], 146);
      if (state.winner === null && state.turn === side) {
        // An arrow beside the name of the side to throw.
        const x = cols[side] - ctx.measureText(name).width / 2 - 26;
        ctx.beginPath();
        ctx.moveTo(x - 12, 134);
        ctx.lineTo(x + 6, 146);
        ctx.lineTo(x - 12, 158);
        ctx.closePath();
        ctx.fill();
      }
      line(cols[side] - 90, 172, cols[side] + 90, 172, 2);
    });
    const rows = 9,
      top = 206,
      step = (H - 120 - top - 70) / rows;
    names.forEach((_, side) => {
      const visits = state.visits[side as 0 | 1],
        shown = visits.slice(-rows),
        skipped = visits.length - shown.length;
      if (state.mode === "501" && !skipped) {
        // The start, struck out once a visit has been written under it.
        font(30, 600);
        ctx.fillText("501", cols[side] + 44, top);
        if (visits.length) line(cols[side] + 14, top, cols[side] + 74, top - 2, 2.5);
      }
      shown.forEach((visit, k) => {
        const y = top + (state.mode === "501" && !skipped ? k + 1 : k) * step;
        if (y > H - 150) return;
        const latest = k === shown.length - 1;
        font(latest ? 32 : 28, 600);
        ctx.textAlign = "right";
        ctx.fillText(visit.bust ? "버스트" : String(visit.total), cols[side] - 16, y);
        ctx.textAlign = "center";
        font(latest ? 34 : 28, latest ? 800 : 600);
        ctx.fillText(String(visit.after), cols[side] + 44, y);
        if (!latest && state.mode === "501") line(cols[side] + 14, y, cols[side] + 74, y - 2, 2.5);
      });
    });
    // At the foot: the totals (count-up) or a way out for the side to throw (501).
    line(30, H - 112, W - 30, H - 112, 3);
    font(26, 600);
    const tip = state.mode === "501" ? suggestion(state) : null;
    if (tip) ctx.fillText(`체크아웃  ${tip}`, W / 2, H - 64);
    else {
      font(40, 800);
      names.forEach((_, side) => ctx.fillText(String(state.scores[side]), cols[side], H - 64));
    }
    // Chalk does not cover evenly: a grain rubs some of every stroke away.
    ctx.globalCompositeOperation = "destination-out";
    // A tile of grain laid as a pattern (repainted with every throw, speck by speck it was slow).
    ctx.fillStyle = speckles(ctx, sequence(77), [0, 0, 0], [0.25, 0.75], null, 0.02);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "destination-over";
    slate(ctx, W, H, sequence(3));
    ctx.globalCompositeOperation = "source-over";
    this.chalk.texture.needsUpdate = true;
  }
  /** Who may throw now by hand. */
  private canThrow() {
    const state = this.state;
    return !!state && state.winner === null && !this.animating && this.myTurn(state) && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** My turn by hand: either side's at one screen, mine against the computer; over Wi-Fi when the screen offers a throw (my seat's turn). */
  private myTurn(state: State) {
    return this.netSide === undefined ? this.mode === "local" || state.turn === 0 : this.marks.targets.length > 0;
  }
  protected seated() {
    if (this.state) this.writeChalk(this.state);
  }
  /** The hand: a swipe up throws; the arrows aim and Enter or Space throws. */
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || !this.canThrow() || this.press) return;
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
      this.aimShown();
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.press || this.press.id !== e.pointerId) return;
      this.press.dx = e.clientX - this.press.x;
      this.press.dy = e.clientY - this.press.y;
      this.aimShown();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.press || this.press.id !== e.pointerId) return;
      const { x, y } = this.press,
        made = cancelled || !this.canThrow() ? null : swipe(e.clientX - x, e.clientY - y, el.clientHeight || 1),
        // Where the hand had the ring as the finger let go.
        hand = this.trembled();
      this.press = null;
      this.aimShown();
      if (made) this.throwAt(made.x + hand.x, made.y + hand.y);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => {
      const steps: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (steps[e.key]) {
        e.preventDefault();
        if (!this.canThrow()) return;
        const by = e.shiftKey ? 1 : 5,
          from = this.keyAim ?? { x: 0, y: (TREBLE_IN + TREBLE_OUT) / 2 };
        this.keyAim = { x: Math.max(-260, Math.min(260, from.x + steps[e.key][0] * by)), y: Math.max(-260, Math.min(260, from.y + steps[e.key][1] * by)) };
        this.aimShown();
      } else if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        if (!this.canThrow()) return;
        const aim = this.keyAim ?? { x: 0, y: (TREBLE_IN + TREBLE_OUT) / 2 },
          hand = this.trembled();
        this.throwAt(aim.x + hand.x, aim.y + hand.y);
      }
    });
    el.addEventListener("blur", () => {
      this.keyAim = null;
      this.aimShown();
    });
  }
  /** A person's throw at the point (x, y) of the board, where the ring's dot is: it lands there, with no scatter of its own. */
  private throwAt(x: number, y: number) {
    this.reticle.visible = false;
    this.onMove({ from: -1, to: aimCode(x, y), extra: 0 });
  }
  /** How far the hand had moved the ring when it was last drawn; a throw made before it was ever shown is caught somewhere in the tremor. */
  private trembled() {
    return this.hand.since >= 0 ? { x: this.hand.x, y: this.hand.y } : tremor(0, Math.random() * 1000);
  }
  /** Lays the aiming ring where the swipe under way, or the keyboard, aims, moved as far as the hand has trembled. */
  private aimShown() {
    const el = this.renderer.domElement,
      aim = this.press ? swipe(this.press.dx, this.press.dy, el.clientHeight || 1) : this.keyAim,
      shown = !!aim && !capturing() && this.canThrow();
    // With nothing aimed the hand rests; the next aim begins somewhere else in the tremor.
    if (!aim) this.hand.since = -1;
    if (aim && shown) {
      const now = performance.now();
      if (this.hand.since < 0) this.hand = { since: now, seed: Math.random() * 1000, x: 0, y: 0 };
      const off = tremor((now - this.hand.since) / 1000, this.hand.seed);
      this.hand.x = off.x;
      this.hand.y = off.y;
      const p = boardPoint(aim.x + off.x, aim.y + off.y);
      this.reticle.position.set(p.x, p.y, p.z + 0.012);
      // The ring trembles on whether or not the finger moves.
      if (!this.shaking) this.shaking = requestAnimationFrame(this.tremble);
    }
    this.reticle.visible = shown;
    // Where the ring's dot is, for readers of the page and the tests (millimetres from the bull).
    const said = aim && shown ? `${(aim.x + this.hand.x).toFixed(1)},${(aim.y + this.hand.y).toFixed(1)}` : "";
    if (el.dataset.aim !== said) el.dataset.aim = said;
    // The dart in the hand draws back a little as the swipe goes up.
    this.handPose();
    this.redraw();
  }
  /** The tremor's frames: the ring is laid again each frame while it is shown. */
  private tremble = () => {
    this.shaking = 0;
    if (!this.disposed) this.aimShown();
  };
  /** Every press is the hand's (a swipe), never a pick. */
  protected dragStart() {
    return this.canThrow();
  }
  protected subject(): TableSubject {
    return { half: 2.2, halfZ: 2.2, height: 1, lookY: 0, tilt: 0.2 };
  }
  protected resize() {
    super.resize();
    dartsCamera(this.camera, this.camera.aspect);
    this.handPose();
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Where the hand holds the dart: low in the view, a little right of the board, pointing at it. */
  private handAt() {
    const pull = this.press ? Math.min(0.35, Math.max(0, -this.press.dy / (this.renderer.domElement.clientHeight || 1))) : 0;
    this.camera.updateMatrixWorld();
    const board = new T.Vector3(BOARD_X, BOARD_Y, FACE_Z).project(this.camera),
      through = new T.Vector3(Math.min(0.8, board.x + 0.2), -0.52 - pull * 0.25, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return this.camera.position.clone().addScaledVector(through, 2.3 - pull * 0.5);
  }
  /** Points a dart's tail along `tail` (its point leads the other way). */
  private point(model: T.Object3D, tail: T.Vector3) {
    model.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tail.clone().normalize());
  }
  private handPose() {
    const state = this.state,
      side = state?.turn ?? 0;
    this.hands.forEach((hand, k) => {
      hand.visible = k === side && this.canThrow() && !capturing();
      if (!hand.visible) return;
      const at = this.handAt(),
        board = new T.Vector3(BOARD_X, BOARD_Y + 0.25, FACE_Z);
      // The hand trembles with the ring it aims.
      if (this.reticle.visible) {
        at.x += this.hand.x * MM * HAND_SHAKE;
        at.y += this.hand.y * MM * HAND_SHAKE;
      }
      hand.position.copy(at);
      this.point(hand, at.clone().sub(board));
      hand.rotateZ(0.6);
    });
  }
  /** How a dart stands once stuck where it landed: its tail a little up and to one side, by where it is. */
  private stuck(dart: Dart) {
    const p = boardPoint(dart.x, dart.y),
      wobble = Math.sin(dart.x * 12.9898 + dart.y * 78.233) * 43758.5453,
      side = (wobble - Math.floor(wobble) - 0.5) * 0.16,
      tail = new T.Vector3(side + (p.x - EYE.x) * 0.05, 0.2 + (p.y - EYE.y) * 0.04, 1).normalize();
    return { tip: new T.Vector3(p.x, p.y, p.z).addScaledVector(tail, -SUNK), tail, spin: wobble };
  }
  private lay(model: T.Object3D, dart: Dart) {
    const { tip, tail, spin } = this.stuck(dart);
    model.visible = !dart.fell;
    model.position.copy(tip);
    this.point(model, tail);
    model.rotateZ(spin % (Math.PI * 2));
    model.scale.setScalar(LARGER);
  }
  protected place(state: State) {
    for (const set of this.sets) for (const model of set) model.visible = false;
    // The darts of the visit under way (a visit that won the game stays on the board).
    state.darts.forEach((dart, k) => this.lay(this.sets[state.turn][k], dart));
    this.writeChalk(state);
    this.handPose();
    this.aimShown();
  }
  protected animate(before: State, state: State) {
    const dart = state.last;
    if (!dart || state.ply !== before.ply + 1) return false;
    const side = state.thrower,
      set = this.sets[side],
      index = before.darts.length,
      model = set[index],
      start = this.handAt(),
      land = this.stuck(dart),
      at = boardPoint(dart.x, dart.y),
      end = new T.Vector3(at.x, at.y, at.z).addScaledVector(land.tail, -SUNK),
      span = end.clone().sub(start);
    for (const hand of this.hands) hand.visible = false;
    this.reticle.visible = false;
    model.visible = true;
    model.scale.setScalar(LARGER);
    // The flight: an arc from the hand, the point leading, the dart turning a little about itself.
    this.tween(0, FLIGHT, (p) => {
      const lift = ARC * 4 * p * (1 - p),
        position = start.clone().addScaledVector(span, p),
        velocity = span.clone().add(new T.Vector3(0, ARC * 4 * (1 - 2 * p), 0));
      position.y += lift;
      model.position.copy(position);
      this.point(model, velocity.multiplyScalar(-1));
      model.rotateZ(p * 3);
      if (p === 1) {
        if (dart.fell) return;
        this.lay(model, dart);
        this.onContact();
        this.say(dart.points ? String(dart.points) : "0", dart.ring === "treble" ? "#ffd45a" : dart.ring === "double" ? "#7dffa6" : dart.ring === "bull" || dart.ring === "outer" ? "#ff7a6a" : "#ffffff", dart.label === String(dart.points) ? "" : dart.label, new T.Vector3(at.x, at.y + 0.08, at.z + 0.1));
      }
    });
    if (dart.fell) {
      // Off the cabinet: it glances off the wall and drops out of sight.
      this.tween(FLIGHT, 520, (p) => {
        model.position.set(end.x + p * 0.2, end.y - p * p * 3, end.z + 0.15 + p * 0.3);
        model.rotateX(0.2);
        if (p === 1) model.visible = false;
      });
      this.tween(FLIGHT, 1, (p) => p === 1 && this.say("MISS", "#ffffff", "", new T.Vector3(at.x, at.y + 0.1, FACE_Z + 0.1)));
    } else
      this.tween(FLIGHT, WOBBLE, (p) => {
        // A wobble about the point, dying away.
        const swing = Math.sin(p * Math.PI * 5) * (1 - p) * 0.08;
        this.lay(model, dart);
        model.rotateX(swing);
      });
    if (!state.ended) return true;
    // The visit is over: its score is called, the darts stay a moment, then are pulled out of the board.
    const visit = state.visits[side][state.visits[side].length - 1],
      darts = [...before.darts.map((_, k) => set[k]), model];
    if (visit) {
      const total = visit.darts.reduce((s, d) => s + d.points, 0);
      this.tween(FLIGHT + 160, 1, (p) => {
        if (p < 1) return;
        if (visit.bust) this.say("BUST", "#ff5a4a", "", new T.Vector3(BOARD_X, BOARD_Y + 0.2, FACE_Z + 0.4), 1.6);
        else if (total === 180) this.say("180!", "#ffd45a", "", new T.Vector3(BOARD_X, BOARD_Y + 0.2, FACE_Z + 0.4), 1.8);
        else if (state.winner === null) this.say(String(total), "#ffe7a0", "", new T.Vector3(BOARD_X, BOARD_Y + 0.2, FACE_Z + 0.4), 1.3);
      });
    }
    if (state.winner !== null && state.scores[side] === 0) return true;
    // Where each stood is taken as the pull begins (the last one was still in the hand when this was queued).
    let from: { position: T.Vector3; quaternion: T.Quaternion }[] | null = null;
    this.tween(FLIGHT + WOBBLE + REST, PULL, (p) => {
      from ??= darts.map((d) => ({ position: d.position.clone(), quaternion: d.quaternion.clone() }));
      darts.forEach((d, k) => {
        if (!from) return;
        const tail = new T.Vector3(0, 0, 1).applyQuaternion(from[k].quaternion),
          out = Math.min(1, p / 0.45);
        d.position.copy(from[k].position).addScaledVector(tail, out * 0.22);
        d.position.y -= Math.max(0, p - 0.45) * 0.9;
        d.position.z += Math.max(0, p - 0.45) * 1.4;
        d.scale.setScalar(LARGER * (p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4));
        if (p === 1) d.visible = false;
      });
    });
    return true;
  }
  /** A score that rises from where the dart struck and fades (`big` for the visit's call). */
  private say(text: string, colour: string, small: string, from: T.Vector3, big = 1) {
    if (capturing()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 160;
    const pen = canvas.getContext("2d")!;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.font = `900 ${text.length > 3 ? 66 : 84}px "Inter", "Noto Sans KR", sans-serif`;
    pen.lineWidth = 14;
    pen.strokeStyle = "rgba(12, 10, 20, 0.85)";
    pen.strokeText(text, 128, 70);
    pen.fillStyle = colour;
    pen.fillText(text, 128, 70);
    if (small) {
      pen.font = '800 34px "Inter", sans-serif';
      pen.lineWidth = 8;
      pen.strokeText(small, 128, 132);
      pen.fillStyle = "#ffffff";
      pen.fillText(small, 128, 132);
    }
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthTest: false }));
    sprite.scale.set(0.52 * big, 0.325 * big, 1);
    sprite.renderOrder = 20;
    sprite.position.copy(from);
    this.scene.add(sprite);
    this.words.push({ sprite, at: performance.now(), from: from.clone(), rise: big > 1 ? 0.18 : 0.32, life: big > 1 ? 1300 : 950 });
    if (!this.ticker) this.ticker = requestAnimationFrame(this.float);
  }
  /** The words' own frames: they rise and fade whether or not anything else is moving. */
  private float = () => {
    this.ticker = 0;
    if (this.disposed) return;
    const now = performance.now();
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / word.life;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.copy(word.from);
      word.sprite.position.y += word.rise * (1 - (1 - p) ** 2);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
    this.redraw();
    if (this.words.length) this.ticker = requestAnimationFrame(this.float);
  };
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    cancelAnimationFrame(this.shaking);
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
