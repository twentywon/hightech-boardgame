import { block, capable, glossy, weave, wood, woodPhoto } from "../../engine/scene-utils";
import * as T from "three";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DX, DY, H, W, direction, moves, play, type State } from "./rules";
import type { Move } from "../points/types";

export const MARBLE_COLORS: [string, string] = ["#2f9f8f", "#b9b3a4"];
/** A hollow's width and a marble's radius; the marbles lie on the board, over small hollows. */
const S = 1,
  R = 0.4,
  /** How far a marble at rest sinks into its hollow. */
  SEAT = 0.035,
  /** The gap between two marbles in neighbouring hollows: a marble that strikes another rolls on through it and back. */
  GAP = S - 2 * R,
  PAINT = ["#149aa3", "#7a3fb5", "#c9342c"],
  /** The face of the board, the outer edge of the frame, the top of the frame and the cloth the tray stands on. */
  BX = (W * S + 0.1) / 2,
  BZ = (H * S + 0.1) / 2,
  FX = (W * S + 0.8) / 2,
  FZ = (H * S + 0.8) / 2,
  FRAME_TOP = -0.03,
  CLOTH = -0.35,
  /** Pixels of the board's picture to a unit, and the radius of a hollow. */
  P = 128,
  CUP = 0.155,
  /** How much of the clear outer skin shows where the glass is painted. */
  SKIN = 0.2,
  /** Where a shadow falls for each unit of height: the sun stands high to the upper left. */
  LEAN_X = 0.18,
  LEAN_Z = 0.22;
/** Toward the sun. */
const SUN = new T.Vector3(-2.2, 12, -2.6).normalize();
const cx = (i: number) => ((i % W) - (W - 1) / 2) * S,
  cz = (i: number) => (Math.floor(i / W) - (H - 1) / 2) * S;
/** How high the surface under a place is: the board, the frame round it, or the cloth beyond. */
const groundAt = (x: number, z: number) => (Math.abs(x) <= BX && Math.abs(z) <= BZ ? 0 : Math.abs(x) <= FX && Math.abs(z) <= FZ ? FRAME_TOP : CLOTH);

/** One hollow as a turner leaves it: a faint groove round it, a cup shaded from the upper left, its lip catching the light. */
function hollow(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const rc = CUP * P,
    k = P / 128;
  ctx.lineWidth = 1.4 * k;
  ctx.strokeStyle = "rgba(255,242,220,0.28)";
  ctx.beginPath();
  ctx.arc(x + 0.8 * k, y + 0.8 * k, rc * 1.75 + 1.2 * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(96,58,26,0.15)";
  ctx.beginPath();
  ctx.arc(x, y, rc * 1.75, 0, Math.PI * 2);
  ctx.stroke();
  // A soft darkening round the cup, where the turned dip begins.
  const halo = ctx.createRadialGradient(x, y, rc * 0.9, x, y, rc * 1.45);
  halo.addColorStop(0, "rgba(110,66,30,0.22)");
  halo.addColorStop(1, "rgba(110,66,30,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(x - rc * 1.5, y - rc * 1.5, rc * 3, rc * 3);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rc, 0, Math.PI * 2);
  ctx.clip();
  const wall = ctx.createLinearGradient(x - rc * 0.75, y - rc * 0.75, x + rc * 0.75, y + rc * 0.75);
  wall.addColorStop(0, "#4f321a");
  wall.addColorStop(0.5, "#8c6340");
  wall.addColorStop(1, "#d2ab7b");
  ctx.fillStyle = wall;
  ctx.fillRect(x - rc, y - rc, rc * 2, rc * 2);
  // The floor of the cup, a little toward the light, and the shade its upper left lip throws down into it.
  const floor = ctx.createRadialGradient(x + rc * 0.12, y + rc * 0.12, 0, x + rc * 0.12, y + rc * 0.12, rc * 0.7);
  floor.addColorStop(0, "rgba(172,128,84,0.85)");
  floor.addColorStop(1, "rgba(172,128,84,0)");
  ctx.fillStyle = floor;
  ctx.fillRect(x - rc, y - rc, rc * 2, rc * 2);
  const shade = ctx.createRadialGradient(x + rc * 0.38, y + rc * 0.38, rc * 0.72, x + rc * 0.38, y + rc * 0.38, rc * 1.3);
  shade.addColorStop(0, "rgba(38,20,6,0)");
  shade.addColorStop(1, "rgba(38,20,6,0.6)");
  ctx.fillStyle = shade;
  ctx.fillRect(x - rc, y - rc, rc * 2, rc * 2);
  ctx.restore();
  // The lip: bright toward the lower right where it faces the light, dark across from it.
  ctx.lineWidth = 2.2 * k;
  ctx.strokeStyle = "rgba(255,246,226,0.85)";
  ctx.beginPath();
  ctx.arc(x, y, rc + 1.1 * k, -Math.PI * 0.2, Math.PI * 0.7);
  ctx.stroke();
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = "rgba(64,36,14,0.55)";
  ctx.beginPath();
  ctx.arc(x, y, rc + 0.6 * k, Math.PI * 0.8, Math.PI * 1.7);
  ctx.stroke();
}
/** The face of the board: pale polished maple, its grain down the long side, a cut border line and a turned hollow at every place. */
function paintFace(ctx: CanvasRenderingContext2D, grain: HTMLImageElement | null) {
  const w = ctx.canvas.width,
    h = ctx.canvas.height;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#e3bd88";
  ctx.fillRect(0, 0, w, h);
  if (grain) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(grain, -h / 2, -w / 2, h, w);
    ctx.restore();
  }
  // Oil darkens a board a little toward its edges.
  const edge = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  edge.addColorStop(0, "rgba(120,70,28,0)");
  edge.addColorStop(1, "rgba(120,70,28,0.22)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, w, h);
  // A border line cut round the field of hollows.
  const inset = 0.16 * P;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,240,214,0.55)";
  ctx.strokeRect(inset + 1.5, inset + 1.5, w - inset * 2, h - inset * 2);
  ctx.strokeStyle = "rgba(92,54,22,0.5)";
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  for (let i = 0; i < W * H; i++) hollow(ctx, (cx(i) + BX) * P, (cz(i) + BZ) * P);
}
function face() {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(BX * 2 * P);
  canvas.height = Math.round(BZ * 2 * P);
  const ctx = canvas.getContext("2d")!,
    texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  paintFace(ctx, null);
  woodPhoto("maple", (image) => {
    paintFace(ctx, image);
    texture.needsUpdate = true;
  });
  return texture;
}
/** A soft round spot, white at the middle and clear at the edge: shadows, caustics and glows are tinted from it. */
function softSpot(core = 0.0) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  if (core) g.addColorStop(core, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** The window of light a glass marble shows: a bright curved pane with a soft edge. */
function gleamPicture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "blur(3px)";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.ellipse(64, 64, 44, 26, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath();
  ctx.ellipse(56, 58, 14, 8, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** A linen cloth's weave, painted thread by thread. */
function linen() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#c9bfac";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 256; i += 2) {
    ctx.fillStyle = `rgba(${next() < 0.5 ? "255,250,240" : "90,76,58"},${0.025 + next() * 0.05})`;
    ctx.fillRect(0, i, 256, 1);
    ctx.fillStyle = `rgba(${next() < 0.5 ? "255,250,240" : "90,76,58"},${0.025 + next() * 0.05})`;
    ctx.fillRect(i, 0, 1, 256);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(26, 26);
  texture.anisotropy = 8;
  return texture;
}
/** The vanes of a cat's-eye marble: blades through its middle, each a lens from pole to pole, twisted along the way. */
function vaneGeometry(blades: number, radius: number, twist: number, breadth: number) {
  const along = 18,
    out = 5,
    positions: number[] = [],
    index: number[] = [];
  for (let b = 0; b < blades; b++) {
    const base = positions.length / 3;
    for (let i = 0; i <= along; i++) {
      const u = (i / along) * 2 - 1,
        width = radius * Math.sqrt(Math.max(0, 1 - u * u)) * breadth * (1 - 0.12 * Math.abs(u)),
        angle = (b / blades) * Math.PI * 2 + twist * u;
      for (let j = 0; j <= out; j++) {
        // The blade bellies a little as it goes out, like a drawn ribbon of glass.
        const r = (j / out) * width,
          a = angle + 0.35 * (j / out) ** 2;
        positions.push(Math.cos(a) * r, u * radius * 0.96, Math.sin(a) * r);
      }
    }
    for (let i = 0; i < along; i++)
      for (let j = 0; j < out; j++) {
        const a = base + i * (out + 1) + j,
          c = a + out + 1;
        index.push(a, c, a + 1, a + 1, c, c + 1);
      }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
/** A convex outline drawn in by `d` all round. */
function inset(points: T.Vector2[], d: number) {
  const n = points.length,
    area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % n].y - points[(i + 1) % n].x * p.y, 0),
    sign = area > 0 ? 1 : -1,
    lines = points.map((p, i) => {
      const q = points[(i + 1) % n],
        dir = q.clone().sub(p).normalize(),
        normal = new T.Vector2(-dir.y, dir.x).multiplyScalar(sign * d);
      return { p: p.clone().add(normal), dir };
    });
  return lines.map((line, i) => {
    const prev = lines[(i + n - 1) % n],
      cross = prev.dir.x * line.dir.y - prev.dir.y * line.dir.x,
      t = ((line.p.x - prev.p.x) * line.dir.y - (line.p.y - prev.p.y) * line.dir.x) / cross;
    return prev.p.clone().add(prev.dir.clone().multiplyScalar(t));
  });
}
interface Ball {
  holder: T.Group;
  spin: T.Group;
  shell: T.Mesh;
  vanes: T.Mesh;
  body: T.Mesh;
  gloss: T.Mesh;
  gleam: T.Mesh;
  glow: T.Mesh;
  shadow: T.Mesh;
  caustic: T.Mesh;
  tint: number;
}
/** A marble that has been knocked off the tray, played by the view's own frames so that the next shot need not wait for it. */
interface Leaving {
  ball: Ball;
  /** The hollow it left, its colour, how it lay turned, where it starts and which way it goes. */
  from: number;
  tint: number;
  q0: T.Quaternion;
  dir: number;
  start: number;
  started: boolean;
  landed: boolean;
}
interface Glass {
  shell: T.Material;
  vanes: T.Material;
  body: T.Material;
  gloss: T.Material;
}
/** A board of pale polished wood in a mitred walnut frame, seen from straight above, with glass cat's-eye marbles of three colours; a shot rolls them one into the next. */
export class MarbleView extends TableView<State> {
  private balls: Ball[] = [];
  private glass: Glass[];
  /** The same glass made to fade, for a marble that leaves the tray. */
  private fading: Glass[];
  /** How each hollow's marble lies turned, so that a marble keeps its turn when it has rolled. */
  private turns: T.Quaternion[] = [];
  private streak: T.Mesh;
  private chosen: T.Mesh;
  private aims: T.Mesh[] = [];
  private cursor: T.Mesh;
  /** The arrow of a hint: a shaft and a head, lying over the marbles from the one to shoot toward the one to strike. */
  private arrow = new T.Group();
  private shaft: T.Mesh;
  private shaftShade: T.Mesh;
  private from: { point: number; x: number; z: number } | null = null;
  private eye = new T.Vector3();
  /**
   * Shots are taken while the marbles still roll and kept by the screen (`queueMoves: "all"`): the table counts as
   * at rest once the last marble left on the tray has settled (`rolling`), and the marble going off the tray drops
   * and rolls away in the view's own frames (`leaving`, on spare marbles), so the next shot starts at once.
   */
  protected pressWhileMoving = true;
  private rolling = false;
  private leaving: Leaving[] = [];
  private spares: Ball[] = [];
  private flight = 0;
  /** Shots given while the marbles roll that the screen still keeps, and a marble picked meanwhile, handed to the screen once the table rests. */
  private sent: Move[] = [];
  private ahead: number | null = null;
  get animating() {
    return this.rolling && super.animating;
  }
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#c9bfac");
    const rich = capable();
    // Lit from the upper left, as a picture is: each marble shows one bright spot.
    this.scene.add(new T.HemisphereLight("#ffffff", "#c9b8a0", 1.5));
    const sun = new T.DirectionalLight("#fff8ee", 1.75);
    sun.position.copy(SUN).multiplyScalar(12.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
    sun.shadow.camera.right = sun.shadow.camera.top = 7;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    const own = <X extends { dispose(): void }>(r: X) => this.own(r);
    // The cloth the tray stands on.
    const cloth = this.add(new T.PlaneGeometry(60, 60), this.standard({ map: this.own(linen()), roughness: 0.95, ...weave(26, 26, own, 0.6) }), 0, CLOTH, 0);
    cloth.rotation.x = -Math.PI / 2;
    cloth.castShadow = false;
    // The board: a slab of maple whose top is the picture of the hollows, lacquered where a graphics card draws.
    const top = this.own(face()),
      sideGrain = this.own(wood(false, 0.7));
    sideGrain.repeat.set(0.3, 0.3);
    const side = this.standard({ map: sideGrain, color: "#f0d2a6", roughness: 0.6 }),
      lacquer = rich
        ? this.own(new T.MeshPhysicalMaterial({ map: top, bumpMap: top, bumpScale: 0.9, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.55 }))
        : this.standard({ map: top, roughness: 0.55 });
    const board = this.add(block(BX * 2, 0.3, BZ * 2, 0.045, 3), [side, side, lacquer, side, side, side], 0, -0.15, 0);
    board.castShadow = false;
    // The frame: four mitred lengths of walnut with rounded edges, grain along each, and a line of pale stringing inlaid.
    const along = this.own(wood(true)),
      across = this.own(wood(true));
    along.repeat.set(0.28, 0.28);
    across.repeat.set(0.28, 0.28);
    across.rotation = Math.PI / 2;
    const walnut = [along, across].map((map) => this.own(glossy({ map, color: "#a98068", roughness: 0.55 }, 0.3)));
    const bevel = 0.04,
      height = FRAME_TOP - CLOTH,
      corners = (sx: number, sz: number, alongX: boolean) =>
        alongX
          ? [new T.Vector2(-FX, -sz * FZ), new T.Vector2(FX, -sz * FZ), new T.Vector2(BX, -sz * BZ), new T.Vector2(-BX, -sz * BZ)]
          : [new T.Vector2(sx * FX, -FZ), new T.Vector2(sx * FX, FZ), new T.Vector2(sx * BX, BZ), new T.Vector2(sx * BX, -BZ)];
    for (const [sx, sz, alongX] of [[0, 1, true], [0, -1, true], [1, 0, false], [-1, 0, false]] as const) {
      // Shape y is -z, so that the length stands up the right way once turned.
      const outline = inset(corners(sx, sz, alongX), bevel),
        geometry = new T.ExtrudeGeometry(new T.Shape(outline), { depth: height - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
      geometry.rotateX(-Math.PI / 2);
      this.add(geometry, walnut[alongX ? 0 : 1], 0, CLOTH + bevel, 0).receiveShadow = true;
    }
    const string = this.standard({ color: "#ecd8ab", roughness: 0.5 }),
      gap = 0.12;
    for (const s of [1, -1]) {
      const h = this.add(new T.PlaneGeometry(2 * (BX + gap) + 0.028, 0.028), string, 0, FRAME_TOP + 0.002, s * (BZ + gap));
      const v = this.add(new T.PlaneGeometry(0.028, 2 * (BZ + gap) + 0.028), string, s * (BX + gap), FRAME_TOP + 0.002, 0);
      h.rotation.x = v.rotation.x = -Math.PI / 2;
      h.castShadow = v.castShadow = false;
    }
    // The marbles: a clear shell of tinted glass round twisted vanes of colour.
    const sphere = this.own(new T.SphereGeometry(R, rich ? 48 : 32, rich ? 32 : 24)),
      vane = this.own(vaneGeometry(3, R * 0.8, 1.7, 0.5)),
      flat = this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      card = this.own(new T.PlaneGeometry(1, 1)),
      spot = this.own(softSpot()),
      bright = this.own(softSpot(0.18)),
      pane = this.own(gleamPicture());
    // Coloured glass round a paler ribbon twisted through it: the colour is the inside of the glass seen through a thin
    // tinted skin, and over it a clear coat that only adds the light it reflects (the room, where a graphics card draws).
    const shellOf = (color: string) => new T.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.3, transparent: true, opacity: SKIN, depthWrite: false });
    const coat = (fade: boolean) =>
      this.own(
        rich
          ? new T.MeshPhysicalMaterial({ color: "#000000", roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.9, specularIntensity: 1, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: fade ? 0 : 1 })
          : new T.MeshStandardMaterial({ color: "#000000", roughness: 0.08, metalness: 0, transparent: true, depthWrite: false, blending: T.AdditiveBlending }),
      );
    const vanesOf = (color: string, fade: boolean) =>
      new T.MeshStandardMaterial({
        color: new T.Color(color).lerp(new T.Color("#fff6e8"), rich ? 0.42 : 0.62),
        emissive: new T.Color(color).lerp(new T.Color("#ffffff"), 0.4).multiplyScalar(0.1),
        roughness: 0.4,
        side: T.DoubleSide,
        transparent: fade,
      });
    // The far inside of the glass, with the light come through it: deep at the rim, where the way through is longest,
    // and clear in the middle. It does not turn with the marble, so it lies on the holder.
    const bodyOf = (color: string, fade: boolean) =>
      new T.MeshBasicMaterial({ color: new T.Color(color).offsetHSL(0, 0.05, 0.08), vertexColors: true, side: T.BackSide, transparent: fade });
    const inside = this.own(sphere.clone()),
      position = inside.getAttribute("position"),
      shades: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const depth = Math.max(0, -position.getY(i) / R);
      shades.push(...Array(3).fill(0.4 + 0.6 * depth ** 1.5));
    }
    inside.setAttribute("color", new T.Float32BufferAttribute(shades, 3));
    const make = (fade: boolean) =>
      PAINT.map((color) => ({ shell: this.own(shellOf(color)), gloss: coat(fade), vanes: this.own(vanesOf(color, fade)), body: this.own(bodyOf(color, fade)) }));
    this.glass = make(false);
    this.fading = make(true);
    const decal = (map: T.Texture, color: string, opacity: number, additive: boolean, order: number) => {
      const mesh = new T.Mesh(
        flat,
        this.own(new T.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending })),
      );
      mesh.renderOrder = order;
      return mesh;
    };
    // One marble a hollow, and two spares for marbles on their way off the tray.
    for (let i = 0; i < W * H + 2; i++) {
      const holder = new T.Group(),
        spin = new T.Group(),
        shell = new T.Mesh(sphere, this.glass[0].shell),
        vanes = new T.Mesh(vane, this.glass[0].vanes);
      shell.renderOrder = 3;
      const body = new T.Mesh(inside, this.glass[0].body);
      // A little smaller than the glass, so that the board, which the marble sinks into, does not cut it.
      body.scale.setScalar(0.93);
      body.position.y = 0.025;
      spin.add(vanes, shell);
      // The window of light on it, up and to the left, and the glow where the light comes out of the glass below and to the right.
      const gleam = decal(pane, "#ffffff", 0.9, false, 6),
        glow = decal(bright, "#ffffff", 0.5, true, 6);
      // Both face the eye and are placed on the glass where the eye sees them (`pose`).
      for (const mesh of [gleam, glow]) {
        mesh.geometry = card;
        (mesh.material as T.MeshBasicMaterial).depthTest = false;
      }
      gleam.scale.setScalar(0.27);
      glow.scale.setScalar(0.42);
      const gloss = new T.Mesh(sphere, this.glass[0].gloss);
      gloss.scale.setScalar(1.004);
      gloss.renderOrder = 4;
      holder.add(body, spin, gloss, gleam, glow);
      const shadow = decal(spot, "#2a1708", 0.55, false, 1),
        caustic = decal(bright, "#ffffff", 0.6, true, 2);
      this.turns.push(new T.Quaternion().setFromEuler(new T.Euler(i * 1.7, i * 2.3, i * 0.9)));
      const ball: Ball = { holder, spin, shell, vanes, body, gloss, gleam, glow, shadow, caustic, tint: 0 };
      this.show(ball, false);
      if (i < W * H) this.balls.push(ball);
      else this.spares.push(ball);
      this.scene.add(holder, shadow, caustic);
    }
    // The blur a fast marble draws behind it.
    this.streak = decal(spot, "#ffffff", 0.4, false, 2);
    this.streak.visible = false;
    this.scene.add(this.streak);
    this.chosen = ringMesh(own, R * 1.12, R * 1.36, "#ffd24a");
    this.cursor = ringMesh(own, R * 1.12, R * 1.36, "#3f8cff");
    for (let i = 0; i < 4; i++) this.aims.push(ringMesh(own, R * 1.12, R * 1.36, "#ffffff"));
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffc21a", depthTest: false, transparent: true, opacity: 0.95, side: T.DoubleSide })),
      dusk = this.own(new T.MeshBasicMaterial({ color: "#3a2410", depthTest: false, transparent: true, opacity: 0.3, side: T.DoubleSide })),
      head = this.own(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.42, 0.3), new T.Vector2(-0.42, -0.3)]))),
      bar = this.own(new T.PlaneGeometry(1, 0.2)),
      tip = new T.Mesh(head, gold),
      tipShade = new T.Mesh(head, dusk);
    this.shaft = new T.Mesh(bar, gold);
    this.shaftShade = new T.Mesh(bar, dusk);
    // Both lie flat, pointing along +x; the group is turned to the way of the shot. A soft shade under them keeps them clear on the wood.
    for (const mesh of [this.shaft, tip, this.shaftShade, tipShade]) mesh.rotation.x = -Math.PI / 2;
    tip.name = "tip";
    tipShade.name = "tipShade";
    this.shaft.renderOrder = tip.renderOrder = 9;
    this.shaftShade.renderOrder = tipShade.renderOrder = 8;
    this.arrow.add(this.shaftShade, tipShade, this.shaft, tip);
    this.arrow.visible = false;
    this.scene.add(this.chosen, this.cursor, ...this.aims, this.arrow);
    this.begin();
  }
  protected subject(_aspect: number): TableSubject {
    // Straight down, or as good as: the board fills the view like a picture of it.
    return { half: 3.95, halfZ: 5.0, height: 0.6, lookY: 0, tilt: 1.52 };
  }
  protected spots(): Spot[] {
    const state = this.basis();
    return state ? state.cells.flatMap((marble, i) => (marble ? [{ x: cx(i), y: R, z: cz(i), r: 0.48, point: i }] : [])) : [];
  }
  private show(ball: Ball, on: boolean) {
    ball.holder.visible = ball.shadow.visible = ball.caustic.visible = on;
  }
  /** Puts a marble's centre at a place, with its shadow and the light its glass gathers on the ground below. */
  private pose(ball: Ball, x: number, y: number, z: number, fade = 1) {
    ball.holder.position.set(x, y, z);
    const ground = groundAt(x, z),
      lift = y - ground,
      spread = 1 + Math.max(0, lift - R) * 0.9,
      shadow = ball.shadow.material as T.MeshBasicMaterial,
      caustic = ball.caustic.material as T.MeshBasicMaterial;
    ball.shadow.position.set(x + LEAN_X * lift * 0.85, ground + 0.004, z + LEAN_Z * lift * 0.85);
    ball.shadow.scale.set(R * 2.5 * spread, 1, R * 2.5 * spread);
    shadow.opacity = (0.7 / spread) * fade;
    ball.caustic.position.set(x + LEAN_X * lift * 1.25, ground + 0.006, z + LEAN_Z * lift * 1.25);
    ball.caustic.scale.set(R * 0.95 * spread, 1, R * 0.95 * spread);
    caustic.opacity = (0.85 / spread) * fade;
    // The sun's window shows where the glass turns halfway between the sun and the eye; the light it gathers comes out
    // on the far side, below and to the right as the eye sees it.
    const view = this.eye.copy(this.camera.position).sub(ball.holder.position).normalize();
    ball.gleam.position.copy(SUN).add(view).normalize().multiplyScalar(R * 0.97);
    ball.glow.position.set(view.x - SUN.x * 0.9, view.y, view.z - SUN.z * 0.9).normalize().multiplyScalar(R * 0.9);
    ball.gleam.quaternion.copy(this.camera.quaternion);
    ball.glow.quaternion.copy(this.camera.quaternion);
    (ball.gleam.material as T.MeshBasicMaterial).opacity = 0.9 * fade;
    (ball.glow.material as T.MeshBasicMaterial).opacity = 0.5 * fade;
  }
  private dress(ball: Ball, tint: number, glass: Glass[] = this.glass) {
    ball.tint = tint;
    ball.shell.material = glass[tint].shell;
    ball.vanes.material = glass[tint].vanes;
    ball.body.material = glass[tint].body;
    ball.gloss.material = glass[tint].gloss;
    const color = new T.Color(PAINT[tint]);
    (ball.caustic.material as T.MeshBasicMaterial).color.copy(color).lerp(new T.Color("#fff3c8"), 0.35);
    (ball.shadow.material as T.MeshBasicMaterial).color.copy(color).multiplyScalar(0.28);
    (ball.glow.material as T.MeshBasicMaterial).color.copy(color).lerp(new T.Color("#ffffff"), 0.45);
  }
  protected place(state: State) {
    this.streak.visible = false;
    state.cells.forEach((marble, i) => {
      const ball = this.balls[i];
      this.show(ball, marble);
      if (!marble) return;
      this.dress(ball, (state.tints[i] - 1 + PAINT.length) % PAINT.length);
      ball.spin.quaternion.copy(this.turns[i]);
      this.pose(ball, cx(i), R - SEAT, cz(i));
    });
  }
  /** Draws the blur behind a marble rolling at `speed` (units a second), or hides it. */
  private blur(ball: Ball, speed: number, dir: number) {
    const length = Math.min(1.1, speed * 0.04);
    this.streak.visible = length > 0.12 && !capturing();
    if (!this.streak.visible) return;
    const p = ball.holder.position;
    this.streak.position.set(p.x - DX[dir] * length * 0.5, Math.max(CLOTH + 0.01, p.y - R * 0.2), p.z - DY[dir] * length * 0.5);
    this.streak.scale.set(dir % 2 ? length + R * 1.4 : R * 1.5, 1, dir % 2 ? R * 1.5 : length + R * 1.4);
    const material = this.streak.material as T.MeshBasicMaterial;
    material.color.set(PAINT[ball.tint]).lerp(new T.Color("#ffffff"), 0.1);
    material.opacity = Math.min(0.5, length * 0.75);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    this.place(before);
    const dir = last.dir,
      dx = DX[dir],
      dz = DY[dir],
      step = dx + dz * W,
      axis = new T.Vector3(dz, 0, -dx),
      turned = (q: T.Quaternion, way: number) => new T.Quaternion().setFromAxisAngle(axis, way / R).multiply(q);
    let at = 0;
    last.rolls.forEach((roll, k) => {
      const ball = this.balls[roll.from],
        x0 = cx(roll.from),
        z0 = cz(roll.from),
        q0 = this.turns[roll.from].clone(),
        start = at;
      // Marbles touching in a row pass the knock on with a shiver and stay where they are.
      if (k > 0)
        for (let c = last.rolls[k - 1].to + step; c !== roll.from && c >= 0 && c < W * H; c += step) {
          const still = this.balls[c],
            sx = cx(c),
            sz = cz(c);
          this.tween(start, 220, (p) => {
            const o = 0.035 * Math.sin(Math.PI * Math.min(1, p * 2.2)) * (1 - p);
            this.pose(still, sx + dx * o, R - SEAT, sz + dz * o);
          });
        }
      if (roll.to >= 0) {
        // It rolls on until it touches the next marble, knocks it, and rattles back into its hollow.
        const cells = Math.abs(roll.to - roll.from) / Math.abs(step),
          way = cells * S + GAP,
          duration = 90 + way * 60;
        this.turns[roll.to].copy(turned(q0, cells * S));
        this.tween(start, duration, (p) => {
          const s = p * (1.25 - 0.25 * p),
            at = way * s;
          this.pose(ball, x0 + dx * at, R, z0 + dz * at);
          ball.spin.quaternion.copy(turned(q0, at));
          this.blur(ball, (way * (1.25 - 0.5 * p) * 1000) / duration, dir);
          if (p === 1) {
            this.streak.visible = false;
            this.onContact();
          }
        });
        this.tween(start + duration, 300, (p) => {
          const back = GAP * (1 - p) ** 1.6 * Math.cos(2.6 * Math.PI * p),
            at = cells * S + back;
          this.pose(ball, x0 + dx * at, R - SEAT * Math.min(1, p * 2), z0 + dz * at);
          ball.spin.quaternion.copy(turned(q0, at));
        });
        at += duration;
        return;
      }
      // The last one rolls over the edge, drops onto the cloth and rolls away: in the view's own frames, on a spare.
      this.leave(roll.from, ball.tint, q0, dir, start);
    });
    // At rest once the last marble on the tray has knocked and nearly settled back into its hollow: a shot given
    // meanwhile is played from here (its own animation lays the rattle to rest), while the one going off goes on.
    this.rolling = true;
    this.tween(Math.max(at + 140, 230), 1, (p) => {
      if (p < 1 || !this.rolling) return;
      this.rolling = false;
      this.onSettled();
      setTimeout(() => this.handOver(), 0);
    });
    return true;
  }
  /** Sends a marble off the tray on a spare: it waits until `delay` from now, when the knock reaches it. */
  private leave(from: number, tint: number, q0: T.Quaternion, dir: number, delay: number) {
    // The spare not in use, or the one that has been going longest.
    const busy = new Set(this.leaving.map((l) => l.ball)),
      ball = this.spares.find((b) => !busy.has(b)) ?? this.leaving.shift()!.ball;
    this.leaving = this.leaving.filter((l) => l.ball !== ball);
    this.show(ball, false);
    this.leaving.push({ ball, from, tint, q0: q0.clone(), dir, start: performance.now() + delay, started: false, landed: false });
    if (!this.flight) this.flight = requestAnimationFrame(this.fly);
  }
  private fly = (now: number) => {
    this.flight = 0;
    if (this.disposed) return;
    this.leaving = this.leaving.filter((l) => this.away(l, now));
    this.redraw();
    if (this.leaving.length) this.flight = requestAnimationFrame(this.fly);
  };
  /** The marble's way off the tray at `now`: over the edge, onto the cloth with a bounce, and away, fading; false once gone. */
  private away(l: Leaving, now: number) {
    const t = now - l.start;
    if (t < 0) return true;
    const { ball, from, dir } = l,
      x0 = cx(from),
      z0 = cz(from),
      dx = DX[dir],
      dz = DY[dir],
      axis = new T.Vector3(dz, 0, -dx),
      turned = (way: number) => new T.Quaternion().setFromAxisAngle(axis, way / R).multiply(l.q0),
      edge = (dir === 1 ? FX - x0 : dir === 3 ? x0 + FX : dir === 0 ? z0 + FZ : FZ - z0) + R * 0.4,
      roll1 = 90 + edge * 55,
      drop = 170,
      away = 460,
      flight = 0.75,
      on = 1.1;
    if (!l.started) {
      // The knock has reached it: the spare takes the marble's place and the hollow's own marble goes.
      l.started = true;
      if (!this.state?.cells[from]) this.show(this.balls[from], false);
      this.dress(ball, l.tint);
      this.show(ball, true);
    }
    if (t < roll1) {
      const p = t / roll1,
        at = edge * p * (1.2 - 0.2 * p),
        x = x0 + dx * at,
        z = z0 + dz * at;
      this.pose(ball, x, R + Math.max(groundAt(x, z), FRAME_TOP), z);
      ball.spin.quaternion.copy(turned(at));
      this.blur(ball, (edge * (1.2 - 0.4 * p) * 1000) / roll1, dir);
      return true;
    }
    if (t < roll1 + drop) {
      const p = (t - roll1) / drop,
        at = edge + flight * p;
      this.pose(ball, x0 + dx * at, R + FRAME_TOP - (FRAME_TOP - CLOTH) * p * p, z0 + dz * at);
      ball.spin.quaternion.copy(turned(at));
      this.blur(ball, (flight * 1000) / drop, dir);
      return true;
    }
    if (!l.landed) {
      l.landed = true;
      this.streak.visible = false;
      this.onContact();
    }
    const p = Math.min(1, (t - roll1 - drop) / away),
      at = edge + flight + on * (1 - (1 - p) ** 2),
      hop = p < 0.32 ? 0.09 * Math.sin((Math.PI * p) / 0.32) : 0,
      fade = p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.7);
    if (p > 0 && ball.shell.material !== this.fading[l.tint].shell) this.dress(ball, l.tint, this.fading);
    const glass = this.fading[l.tint];
    glass.vanes.opacity = glass.body.opacity = glass.gloss.opacity = fade;
    glass.shell.opacity = SKIN * fade;
    this.pose(ball, x0 + dx * at, CLOTH + R + hop, z0 + dz * at, fade);
    ball.spin.quaternion.copy(turned(at));
    if (p < 1) return true;
    this.show(ball, false);
    return false;
  }
  /** Every marble on its way off is put away (a shot taken back, another tray). */
  private recall() {
    for (const l of this.leaving) this.show(l.ball, false);
    this.leaving = [];
  }
  sync(state: State, animate = true) {
    const before = this.state;
    if (before && state !== before) {
      if (state.ply !== before.ply + 1) {
        // Not the next shot: what was given ahead and what is on its way off no longer belong to it.
        this.recall();
        this.sent = [];
        this.ahead = null;
      } else {
        // The next shot: the first of those given ahead, if it is that one.
        const next = this.sent[0],
          last = state.last;
        if (next && last && last.rolls[0]?.from === next.from && last.dir === direction(next.from, next.to)) this.sent.shift();
        else this.sent = [];
      }
    }
    super.sync(state, animate);
    if (this.ahead !== null && !moves(this.basis() ?? state).some((m) => m.from === this.ahead)) this.ahead = null;
  }
  /** The tray as it will be once the shots given ahead are played. */
  private basis(): State | null {
    let state = this.state;
    for (const move of this.sent) {
      const next = state && play(state, move);
      if (!next) {
        this.sent = [];
        return this.state;
      }
      state = next;
    }
    return state;
  }
  /** Gives a shot to the screen; while the marbles roll the screen keeps it, and the next is aimed from the tray it leaves. */
  private send(shot: Move) {
    const was = this.state,
      moving = this.animating;
    this.ahead = null;
    this.onMove(shot);
    if (moving && this.state === was) this.sent.push(shot);
    this.mark(this.marks);
  }
  /** The table has come to rest: a marble picked while it moved becomes the screen's choice, with its rings. */
  private handOver() {
    if (this.disposed || this.ahead === null || this.animating) return;
    const point = this.ahead;
    this.ahead = null;
    this.onPick(point);
  }
  /** A tap while the marbles roll: picks a marble of the tray to come, or shoots the one picked at it. */
  private pickAhead(point: number) {
    const state = this.basis();
    if (!state) return;
    const all = moves(state),
      shot = this.ahead !== null ? all.find((m) => m.from === this.ahead && m.to === point) : undefined;
    if (shot) return this.send(shot);
    this.ahead = point !== this.ahead && all.some((m) => m.from === point) ? point : null;
    this.mark(this.marks);
    this.redraw();
  }
  /** A press on a marble: let go at once it picks the marble; dragged, it shoots it that way. */
  protected dragStart(point: number, at: { x: number; z: number }) {
    if (point < 0) {
      // A press on the bare tray while the marbles roll lets go of a marble picked meanwhile.
      if (this.ahead !== null && this.animating) {
        this.ahead = null;
        this.mark(this.marks);
      }
      return false;
    }
    this.from = { point, ...at };
    return true;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const from = this.from,
      state = this.basis();
    this.from = null;
    if (!from || !at || !state) return;
    const dx = at.x - from.x,
      dz = at.z - from.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 0.45) return this.animating || this.ahead !== null ? this.pickAhead(from.point) : this.onPick(from.point);
    const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0,
      shot = moves(state).find((m) => m.from === from.point && direction(m.from, m.to) === dir);
    if (shot) this.send(shot);
  }
  dispose() {
    cancelAnimationFrame(this.flight);
    this.flight = 0;
    super.dispose();
  }
  protected mark(marks: Marks) {
    const hidden = capturing(),
      put = (ring: T.Mesh, point: number | null | undefined) => {
        ring.visible = !hidden && point !== null && point !== undefined && point >= 0;
        if (ring.visible) ring.position.set(cx(point!), 0.012, cz(point!));
      };
    // A marble picked while the marbles rolled shows its rings until the table rests and the screen takes it over.
    const ahead = this.ahead,
      targets = ahead !== null ? (moves(this.basis() ?? this.state!) ?? []).filter((m) => m.from === ahead).map((m) => m.to) : marks.targets;
    put(this.chosen, ahead ?? marks.selected);
    put(this.cursor, marks.cursor);
    this.aims.forEach((ring, i) => put(ring, targets[i]));
    // A hint: an arrow from just past the marble to shoot up to the marble it strikes.
    const hint = hidden ? null : marks.hint;
    this.arrow.visible = !!hint;
    if (hint) {
      const dir = direction(hint.from, hint.to),
        length = Math.hypot(cx(hint.to) - cx(hint.from), cz(hint.to) - cz(hint.from)) - R * 2,
        shaft = Math.max(0.05, length - 0.4);
      this.arrow.position.set(cx(hint.from) + DX[dir] * R, R * 2 + 0.05, cz(hint.from) + DY[dir] * R);
      this.arrow.rotation.y = -Math.atan2(DY[dir], DX[dir]);
      this.shaft.scale.x = this.shaftShade.scale.x = shaft;
      this.shaft.position.x = shaft / 2;
      this.arrow.getObjectByName("tip")!.position.x = length;
      // The shade lies on the board below, a little toward the lower right, as the marbles' shadows do.
      const below = -(R * 2 + 0.05) + 0.02,
        ox = 0.06,
        oz = 0.07,
        // Into the arrow's own turned frame: x along the shot, z across it.
        a = this.arrow.rotation.y,
        lx = ox * Math.cos(a) - oz * Math.sin(a),
        lz = ox * Math.sin(a) + oz * Math.cos(a);
      this.shaftShade.position.set(shaft / 2 + lx, below, lz);
      this.arrow.getObjectByName("tipShade")!.position.set(length + lx, below, lz);
    }
  }
}
