import * as T from "three";
import { block, capable, glossy, planks, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BOARD_TOP, CABLE_R, CABLE_Y, CELL, MARGIN, WAY, cableLine, cableSubject, cellAt, cellUnder, outside, type CablePoint } from "./layout";
import { DIRS, OFF, WHITE, behind, bitCount, isLit, outward, steps, tintOf, visit, type State } from "./rules";

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
/** How long a post takes to flare as it lights, and how long the light takes to run the whole cable at the end. */
const FLARE_MS = 620,
  RUN_PER_UNIT = 38;

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
/** A sequence for scenery and the small differences, the same every time. */
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
  t.colorSpace = T.SRGBColorSpace;
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
/**
 * The workshop board's face for a board of `n`: dark stained wood with fine fibres, the cells marked out by faint
 * scored lines with small brass pins where they cross, and an inlaid brass line round the cells.
 */
function boardFace(n: number, span: number) {
  const size = 1024,
    { c, ctx } = canvasOf(size),
    rand = sequence(7700 + n),
    px = size / span,
    at = (u: number) => size / 2 + u * px;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#332a24");
  g.addColorStop(1, "#28211c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 5200; k++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? "14, 10, 8" : "120, 96, 74"}, ${0.05 + rand() * 0.08})`;
    ctx.fillRect(rand() * size, rand() * size, 4 + rand() * 40, 1 + rand());
  }
  const half = (n * CELL) / 2;
  // The scored lines between the cells.
  for (let k = 1; k < n; k++) {
    const u = at(-half + k * CELL);
    ctx.fillStyle = "rgba(8, 6, 5, 0.55)";
    ctx.fillRect(u - 1.5, at(-half), 3, half * 2 * px);
    ctx.fillRect(at(-half), u - 1.5, half * 2 * px, 3);
    ctx.fillStyle = "rgba(150, 120, 90, 0.18)";
    ctx.fillRect(u + 1.5, at(-half), 1, half * 2 * px);
    ctx.fillRect(at(-half), u + 1.5, half * 2 * px, 1);
  }
  // Brass pins where they cross.
  for (let i = 1; i < n; i++)
    for (let j = 1; j < n; j++) {
      const x = at(-half + i * CELL),
        y = at(-half + j * CELL),
        pin = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, px * 0.045);
      pin.addColorStop(0, "#f6dc9c");
      pin.addColorStop(0.6, "#b08236");
      pin.addColorStop(1, "#5a3e18");
      ctx.fillStyle = pin;
      ctx.beginPath();
      ctx.arc(x, y, px * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  // The brass inlay round the cells.
  ctx.strokeStyle = "#a77b35";
  ctx.lineWidth = px * 0.035;
  ctx.strokeRect(at(-half - 0.06), at(-half - 0.06), (half * 2 + 0.12) * px, (half * 2 + 0.12) * px);
  ctx.strokeStyle = "rgba(255, 228, 160, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(at(-half - 0.06) - px * 0.012, at(-half - 0.06) - px * 0.012, (half * 2 + 0.12) * px, (half * 2 + 0.12) * px);
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.74);
  edge.addColorStop(0, "rgba(0, 0, 0, 0)");
  edge.addColorStop(1, "rgba(0, 0, 0, 0.3)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  return textureOf(c);
}

/** One brass post, piece by piece: what lights and what stays. */
interface PostModel {
  index: number;
  cell: number;
  colour: number;
  root: T.Group;
  cap: T.MeshStandardMaterial;
  core: T.Mesh;
  halo: T.Sprite;
  pool: T.Mesh;
  beads: T.Mesh[];
  /** How bright it is now (0 dark, 1 lit; above 1 while it flares). */
  glow: number;
}
/** A run of cable of one colour. */
interface Run {
  mesh: T.Mesh;
  tint: number;
}
/**
 * The cable workshop: a dark board of stained wood with a brass inlay lies on a plank table, its cells marked out
 * by scored lines with brass pins. Brass pillars (a turned column on a foot, a band of enamel for a coloured post, a
 * glass cap) stand on some cells; four small glass beads round each foot light as the cable passes that side, and
 * the cap glows, white or in the post's colour, once the post is lit, with a halo and a pool of light on the board,
 * breathing softly. The cable comes off a brass reel on the margin: a thick braided cloth cable lying on the board,
 * straight through the cells it crosses and round the corners of those it turns in (so that it hugs the posts), its
 * colour taken from the post it last passed and glowing faintly in it; its end is a bakelite plug that follows the
 * finger while it is dragged. The exit is a socket on the margin with a ring that lights as the plug goes in, and on a
 * win the light runs along the whole cable from the reel to the exit. Marks: the steps the end can take (pale dots),
 * the hint's gold glow, the keyboard's ring, a red flash where a step was refused (all left out of a picture taken
 * for the collection).
 */
export class LightCableView extends TableView<State> {
  private size = 0;
  private postAt: number[] | null = null;
  private posts: PostModel[] = [];
  private layer = new T.Group();
  private cableLayer = new T.Group();
  private runs: Run[] = [];
  private cableKey = "";
  private line: CablePoint[] = [];
  /** The cable's length from the reel, as laid now. */
  private length = 0;
  /** What belongs to the board laid now (made again for another board). */
  private boardOwned: { dispose(): void }[] = [];
  private paint: Record<string, T.Material> = {};
  private cloth: T.MeshStandardMaterial[] = [];
  private shapes: Record<string, T.BufferGeometry> = {};
  private beadOff: T.Material;
  private beadOn: T.Material[];
  private glow: T.Texture;
  private front: T.Texture;
  private plug = new T.Group();
  private lead: T.Mesh | null = null;
  private reel = new T.Group();
  private socket = new T.Group();
  private socketRing: T.MeshStandardMaterial;
  private socketGlow: T.Sprite;
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private cursorRing: T.Mesh;
  private hoverRing: T.Mesh;
  private flash: T.Mesh;
  private flashUntil = 0;
  private dots: T.Mesh[] = [];
  private hovered = -1;
  private hinted = -1;
  private live: boolean;
  private soft: boolean;
  private clock = 0;
  /** Posts flaring as they light (index → start, performance time). */
  private flaring = new Map<number, number>();
  /** A drag from the cable's end: where the finger is, and the cell a refused step was last tried into. */
  private drag: { x: number; z: number; refused: number; off: boolean; stepped: boolean } | null = null;
  /** A press that is not on the cable's end: a tap if it is let go where it began. */
  private press: { cell: number; x: number; z: number; moved: boolean } | null = null;
  private caster = new T.Raycaster();
  /** The table counts as moving only during the light's run at the end; every step is laid out at once. */
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
    p("copper", glossy({ color: "#c2773f", roughness: 0.3, metalness: 0.85 }, 0.3));
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
    this.beadOff = keep(new T.MeshStandardMaterial({ color: "#3a332d", roughness: 0.25, metalness: 0.1 }));
    this.beadOn = LIGHT.map((light) => keep(new T.MeshStandardMaterial({ color: light, emissive: light, emissiveIntensity: 1.6, roughness: 0.3 })));
    this.socketRing = keep(new T.MeshStandardMaterial({ color: "#3a2f25", emissive: LIGHT[WHITE], emissiveIntensity: 0, roughness: 0.3 }));

    // A post: a turned brass column on a foot, the glass cap above, a glowing core inside it.
    // The foot stays within 0.15 of the middle, where a cable turning round the post's corner passes it closely.
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
    p("band0", glossy({ color: ENAMEL[0], roughness: 0.25 }, 0.6));
    for (let k = 1; k < ENAMEL.length; k++) p(`band${k}`, glossy({ color: ENAMEL[k], roughness: 0.25 }, 0.6));
    p("top3", new T.MeshStandardMaterial({ map: keep(numberTop(3)), roughness: 0.35 }));
    p("top4", new T.MeshStandardMaterial({ map: keep(numberTop(4)), roughness: 0.35 }));

    // The table under everything.
    const table = new T.Mesh(keep(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2)), this.paint.table);
    table.position.y = -0.2;
    table.receiveShadow = true;
    this.scene.add(table, this.layer, this.cableLayer);

    // The reel the cable comes off: two brass cheeks on a hub, the cable wound round the drum.
    const add = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, y = 0) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.y = y;
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
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

    // Marks.
    this.hintRing = ringMesh(keep, 0.36, 0.45, "#ffc21f");
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(0.46, 32)), keep(new T.MeshBasicMaterial({ color: "#ffcf55", transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    this.cursorRing = ringMesh(keep, 0.4, 0.46, "#ffffff");
    this.hoverRing = ringMesh(keep, 0.38, 0.43, "#f3e7c7");
    (this.hoverRing.material as T.MeshBasicMaterial).opacity = 0.55;
    this.flash = ringMesh(keep, 0.3, 0.45, "#ff4a3a");
    for (let k = 0; k < 4; k++) {
      const dot = new T.Mesh(keep(new T.CircleGeometry(0.075, 20)), keep(new T.MeshBasicMaterial({ color: "#f6e9c8", transparent: true, opacity: 0.5, depthWrite: false })));
      dot.rotation.x = -Math.PI / 2;
      dot.renderOrder = 4;
      dot.visible = false;
      this.dots.push(dot);
      this.scene.add(dot);
    }
    this.scene.add(this.hintRing, this.hintGlow, this.cursorRing, this.hoverRing, this.flash);
    this.begin();
    this.kick();
  }
  /** The board's frame and face, the posts and the sockets for `state`, made anew. */
  private build(state: State) {
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    this.layer.clear();
    this.posts = [];
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r);
    const n = (this.size = state.size);
    this.postAt = state.postAt;
    const span = n * CELL + MARGIN * 2;
    const frame = new T.Mesh(keep(block(span + 0.36, 0.16, span + 0.36, 0.07).translate(0, BOARD_TOP - 0.12, 0)), this.paint.frame);
    frame.castShadow = frame.receiveShadow = true;
    const face = keep(new T.MeshStandardMaterial({ map: keep(boardFace(n, span)), roughness: 0.62, metalness: 0.05 })),
      edge = keep(new T.MeshStandardMaterial({ color: "#1d1714", roughness: 0.8 })),
      board = new T.Mesh(keep(block(span, 0.07, span, 0.025).translate(0, BOARD_TOP - 0.035, 0)), [edge, edge, face, edge, edge, edge]);
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
      const at = cellAt(n, post.cell),
        root = new T.Group(),
        cap = keep(
          new T.MeshStandardMaterial({
            color: GLASS[post.colour],
            transparent: true,
            opacity: post.colour === WHITE ? 0.5 : 0.62,
            roughness: 0.06,
            metalness: 0.1,
            depthWrite: false,
            emissive: LIGHT[post.colour],
            emissiveIntensity: 0,
          }),
        );
      mesh(shapes.post, paint.brass, root);
      if (post.colour !== WHITE) mesh(shapes.band, paint[`band${post.colour}`], root);
      const core = new T.Mesh(shapes.core, keep(new T.MeshBasicMaterial({ color: LIGHT[post.colour], transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
      core.position.y = CORE_Y;
      root.add(core);
      const glass = mesh(shapes.cap, cap, root, false);
      glass.renderOrder = 2;
      if (post.need > 2) {
        mesh(shapes.top, paint.brass, root);
        mesh(shapes.topFace, paint[`top${post.need}`], root, false);
      }
      const beads = DIRS.map((bit) => {
        const bead = mesh(shapes.bead, this.beadOff, root, false),
          [dx, dz] = WAY[bit];
        bead.position.set(dx * 0.142, 0.046, dz * 0.142);
        return bead;
      });
      root.position.set(at.x, BOARD_TOP, at.z);
      root.userData.cell = post.cell;
      const halo = new T.Sprite(keep(new T.SpriteMaterial({ map: this.glow, color: LIGHT[post.colour], transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
      halo.position.set(at.x, BOARD_TOP + CORE_Y, at.z);
      halo.renderOrder = 6;
      const pool = new T.Mesh(shapes.pool, keep(new T.MeshBasicMaterial({ map: this.glow, color: LIGHT[post.colour], transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
      pool.position.set(at.x, BOARD_TOP + 0.004, at.z);
      pool.scale.setScalar(1.8);
      pool.renderOrder = 3;
      this.layer.add(root, halo, pool);
      this.posts.push({ index, cell: post.cell, colour: post.colour, root, cap, core, halo, pool, beads, glow: 0 });
    });
    // The reel at the start, the socket at the exit (if there is one), each turned to face its cell.
    const set = (object: T.Object3D, port: { cell: number; bit: number }) => {
      const at = outside(n, port),
        [dx, dz] = WAY[port.bit];
      object.position.set(at.x, BOARD_TOP, at.z);
      object.rotation.y = Math.atan2(-dx, -dz);
    };
    set(this.reel, state.start);
    this.socket.visible = !!state.exit;
    if (state.exit) set(this.socket, state.exit);
    this.cableKey = "";
  }
  /** The cable of `state` (plugged into the exit once won), its runs of one colour made anew when it has changed. */
  private layCable(state: State) {
    const plugged = state.winner === 0 && state.exit ? state.exit : null,
      key = `${state.path.join(",")}|${state.tints.join("")}|${plugged ? 1 : 0}`;
    if (key === this.cableKey) return;
    this.cableKey = key;
    for (const run of this.runs) {
      run.mesh.geometry.dispose();
      this.cableLayer.remove(run.mesh);
    }
    this.runs = [];
    const line = (this.line = cableLine(this.size, state.start, state.path, state.tints, plugged));
    // Lengths along the line, for the light's front and the braid.
    const along = [0];
    for (let i = 1; i < line.length; i++) along.push(along[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z));
    this.length = along[along.length - 1];
    // Each point carries the colour of the stretch that comes to it: a run is a stretch of one colour, sharing its
    // first point with the run before.
    for (let a = 0; a < line.length - 1; ) {
      const tint = line[a + 1].tint;
      let b = a + 1;
      while (b + 1 < line.length && line[b + 1].tint === tint) b++;
      this.runs.push({ mesh: this.tube(line.slice(a, b + 1), along.slice(a, b + 1), tint), tint });
      a = b;
    }
  }
  /** A tube of cloth along `points` (their lengths from the reel in `along`). */
  private tube(points: CablePoint[], along: number[], tint: number) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(p.x, CABLE_Y, p.z)), false, "centripetal"),
      segments = Math.max(2, points.length),
      geometry = new T.TubeGeometry(curve, segments, CABLE_R, this.soft ? 7 : 10, false),
      uv = geometry.getAttribute("uv"),
      start = along[0],
      span = along[along.length - 1] - start,
      second = new Float32Array(uv.count * 2);
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      // The braid repeats about seven times a unit; the light's coordinate is the length from the reel.
      uv.setX(i, (start + u * span) * 7);
      second[i * 2] = start + u * span;
      second[i * 2 + 1] = uv.getY(i);
    }
    geometry.setAttribute("uv1", new T.BufferAttribute(second, 2));
    const mesh = new T.Mesh(geometry, this.cloth[tint]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.cableLayer.add(mesh);
    return mesh;
  }
  /** Slides the light's front to `at` (a length from the reel). */
  private setFront(at: number) {
    // u' = s · k + (0.5 − at · k): the crest (u' 0.5) stands at `at`.
    const k = 1 / FRONT_SPAN;
    this.front.repeat.set(k, 1);
    this.front.offset.set(0.5 - at * k, 0);
  }
  /** Sets a post's brightness: 0 dark, 1 lit; above 1 while it flares. `warm` is the share of its sides passed. */
  private shine(post: PostModel, glow: number, warm = 0) {
    post.glow = glow;
    const g = Math.min(1, glow),
      extra = Math.max(0, glow - 1),
      soft = this.soft;
    post.cap.emissiveIntensity = Math.max(warm * 0.25, g * (soft ? 1.0 : 1.35) + extra * 1.1);
    post.cap.opacity = (post.colour === WHITE ? 0.5 : 0.62) + 0.3 * g;
    (post.core.material as T.MeshBasicMaterial).opacity = Math.max(warm * 0.2, g * 0.95);
    post.core.scale.setScalar(1 + extra * 0.6);
    (post.halo.material as T.SpriteMaterial).opacity = g * (soft ? 0.5 : 0.75) + extra * 0.45;
    post.halo.scale.setScalar((soft ? 0.9 : 1.2) * (0.6 + 0.4 * g) + extra * 1.3);
    (post.pool.material as T.MeshBasicMaterial).opacity = g * (soft ? 0.3 : 0.42) + extra * 0.25;
  }
  /** The plug at the cable's end, lying along its last stretch (or the lead to the finger while dragged). */
  private setPlug(state: State) {
    if (this.lead) {
      this.lead.geometry.dispose();
      this.scene.remove(this.lead);
      this.lead = null;
    }
    const line = this.line;
    this.plug.visible = !(state.winner === 0 && state.exit) && line.length >= 2;
    if (!this.plug.visible) return;
    const end = line[line.length - 1],
      before = line[line.length - 2];
    let tip = { x: end.x, z: end.z },
      dx = end.x - before.x,
      dz = end.z - before.z;
    const drag = this.drag;
    if (drag) {
      // The end follows the finger, as far as half a cell out of its own cell.
      const fx = drag.x - end.x,
        fz = drag.z - end.z,
        far = Math.hypot(fx, fz),
        reach = Math.min(far, CELL * 0.5);
      if (far > 0.04) {
        tip = { x: end.x + (fx / far) * reach, z: end.z + (fz / far) * reach };
        const curve = new T.QuadraticBezierCurve3(
          new T.Vector3(end.x, CABLE_Y, end.z),
          new T.Vector3(end.x + (dx / (Math.hypot(dx, dz) || 1)) * reach * 0.4, CABLE_Y + 0.02, end.z + (dz / (Math.hypot(dx, dz) || 1)) * reach * 0.4),
          new T.Vector3(tip.x, CABLE_Y + 0.04, tip.z),
        );
        const geometry = new T.TubeGeometry(curve, 10, CABLE_R, 8, false),
          count = geometry.getAttribute("uv").count;
        // The lead glows as the end of the cable does.
        geometry.setAttribute("uv1", new T.BufferAttribute(new Float32Array(count * 2).fill(this.length), 2));
        this.lead = new T.Mesh(geometry, this.cloth[tintOf(state)]);
        this.lead.castShadow = true;
        this.scene.add(this.lead);
        dx = fx;
        dz = fz;
      }
    }
    const length = Math.hypot(dx, dz) || 1;
    this.plug.position.set(tip.x, CABLE_Y + (drag ? 0.04 : 0), tip.z);
    this.plug.rotation.set(0, Math.atan2(-dz / length, dx / length), 0);
  }
  protected subject(aspect: number): TableSubject {
    return cableSubject(this.size || 5, aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  /** What a ray points at: the cell under it on the board's face. */
  protected pick(ray: T.Ray): number | null {
    const state = this.state;
    if (!state) return -1;
    const at = new T.Vector3();
    return ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP), at) ? cellUnder(state.size, at.x, at.z) : -1;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    this.hovered = point;
    this.mark(this.marks);
  }
  /**
   * The next cell from the head `from` toward `to`: along the longer way first, or along the other where only that
   * step can be made (back over the cable included); the longer way when neither can, so that its refusal is told.
   */
  private toward(from: number, to: number) {
    const n = this.size,
      state = this.state!,
      dr = Math.floor(to / n) - Math.floor(from / n),
      dc = (to % n) - (from % n),
      across = from + Math.sign(dc),
      down = from + Math.sign(dr) * n,
      first = Math.abs(dc) >= Math.abs(dr) ? across : down,
      second = first === across ? down : across,
      open = (cell: number) => cell !== from && (steps(state).includes(cell) || cell === behind(state));
    if (dr && dc && !open(first) && open(second)) return second;
    return first;
  }
  protected dragStart(_point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    const head = state.path[state.path.length - 1],
      middle = cellAt(state.size, head);
    this.press = this.drag = null;
    // Every press is taken here: one on (or close by) the cable's end drags it, any other is a tap when let go.
    if (Math.hypot(at.x - middle.x, at.z - middle.z) <= CELL * 0.62) {
      this.drag = { x: at.x, z: at.z, refused: -1, off: false, stepped: false };
      this.setPlug(state);
      this.redraw();
    } else this.press = { cell: cellUnder(state.size, at.x, at.z), x: at.x, z: at.z, moved: false };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const state = this.state,
      press = this.press;
    if (press && Math.hypot(at.x - press.x, at.z - press.z) > CELL * 0.45) press.moved = true;
    const drag = this.drag;
    if (!drag || !state) return;
    drag.x = at.x;
    drag.z = at.z;
    const n = state.size,
      target = cellUnder(n, at.x, at.z, 0.42);
    if (target < 0) {
      // Out past the edge beside the end: a step off the board, refused once with words.
      const head = state.path[state.path.length - 1],
        middle = cellAt(n, head),
        half = (n * CELL) / 2 + CELL * 0.25;
      if (!drag.off && (Math.abs(at.x) > half || Math.abs(at.z) > half) && Math.hypot(at.x - middle.x, at.z - middle.z) < CELL * 1.2 && outward(n, head).length) {
        drag.off = true;
        this.onMove({ from: -1, to: OFF, extra: -1 });
      }
    } else drag.off = false;
    if (target >= 0 && target !== drag.refused)
      for (let guard = 0; guard < n * 2; guard++) {
        const s = this.state!,
          head = s.path[s.path.length - 1];
        if (target === head || s.winner !== null) break;
        const next = this.toward(head, target);
        this.onMove({ from: -1, to: next, extra: -1 });
        // Not taken (refused): the drag waits there until the finger goes to another cell.
        if (this.state === s) {
          drag.refused = target;
          break;
        }
        drag.stepped = true;
      }
    if (target !== drag.refused) drag.refused = -1;
    if (this.state && this.drag) this.setPlug(this.state);
    this.redraw();
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      drag = this.drag;
    this.press = this.drag = null;
    if (drag) {
      // Pressed by the end and let go in the cell beside without a step drawn: a tap there.
      const state = this.state;
      if (at && state && !drag.stepped && state.winner === null) {
        const cell = cellUnder(state.size, at.x, at.z);
        if (cell >= 0 && cell !== state.path[state.path.length - 1]) this.onMove({ from: -1, to: cell, extra: -1 });
      }
      if (this.state) this.setPlug(this.state);
      this.redraw();
      return;
    }
    const state = this.state;
    if (!press || !at || !state || state.winner !== null || press.moved || press.cell < 0) return;
    // A tap: the screen plays it, or refuses it with words (then `refused` flashes the cell).
    this.onMove({ from: -1, to: press.cell, extra: -1 });
  }
  /** The screen refused a step of mine: a red ring flashes on the cell (or on the end, for a step off the board). */
  refused(move: Move) {
    const state = this.state;
    if (!state) return;
    const cell = move.to === OFF ? state.path[state.path.length - 1] : move.to;
    if (cell < 0 || cell >= state.size * state.size) return;
    const at = cellAt(state.size, cell);
    this.flash.position.set(at.x, BOARD_TOP + 0.012, at.z);
    this.flash.visible = true;
    this.flashUntil = performance.now() + 650;
    this.wake();
  }
  sync(state: State, animate = true) {
    const before = this.state,
      stepped = !!before && animate && state.ply === before.ply + 1 && state.postAt === before.postAt;
    // Posts the step lit flare on their own frames.
    if (stepped && state.last && !this.reducedMotion) for (const i of state.last.lit) this.flaring.set(i, performance.now());
    const finale = stepped && state.winner === 0 && before!.winner === null;
    // Every step is laid out at once (the table never counts as moving for it); only the win's light runs as a tween.
    super.sync(state, finale);
    if (stepped) this.onContact();
    if (this.flaring.size) this.wake();
  }
  protected place(state: State) {
    if (state.postAt !== this.postAt || state.size !== this.size) {
      this.build(state);
      this.resize();
    }
    this.layCable(state);
    this.setFront(state.winner === 0 ? this.length + FRONT_SPAN * 2 : -FRONT_SPAN * 2);
    const won = state.winner === 0;
    for (const post of this.posts) {
      const lit = isLit(state, post.index);
      if (!lit || !this.flaring.has(post.index)) this.shine(post, lit ? (won ? 1.08 : 1) : 0, bitCount(state.sides[post.index]) / state.posts[post.index].need);
      const sides = state.sides[post.index];
      post.beads.forEach((bead, k) => (bead.material = sides & DIRS[k] ? this.beadOn[post.colour] : this.beadOff));
    }
    // The exit's ring glows faintly while it waits, so that it is found; brightly once the plug is in.
    this.socketRing.emissiveIntensity = won ? 2.2 : 0.55;
    (this.socketGlow.material as T.SpriteMaterial).opacity = won ? 0.7 : 0;
    this.setPlug(state);
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    if (state.winner !== 0 || before.winner !== null) return false;
    // Won: the plug goes in, and the light runs along the whole cable from the reel, each post flaring as it passes.
    this.layCable(state);
    this.setPlug(state);
    const total = this.length,
      ms = Math.min(2600, Math.max(900, total * RUN_PER_UNIT)),
      startMs = 160;
    this.setFront(-FRONT_SPAN);
    this.socketRing.emissiveIntensity = 0;
    (this.socketGlow.material as T.SpriteMaterial).opacity = 0;
    // Where along the cable each post was lit: its last side passed.
    const reach = this.posts.map((post) => this.litAt(state, post.index));
    const flared = new Set<number>();
    this.tween(startMs, ms, (p) => {
      const at = -FRONT_SPAN * 0.5 + (total + FRONT_SPAN) * p;
      this.setFront(at);
      this.posts.forEach((post, k) => {
        if (!flared.has(k) && reach[k] <= at) {
          flared.add(k);
          this.flaring.set(k, performance.now());
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
  /** How far along the cable (from the reel) a post of a won state was lit: the middle of the cell that lit it. */
  private litAt(state: State, index: number) {
    const sides = state.posts.map(() => 0);
    let tint = WHITE;
    for (const cell of state.path) {
      tint = visit(state, cell, tint, sides);
      if (bitCount(sides[index]) < state.posts[index].need) continue;
      const middle = cellAt(state.size, cell);
      let best = 0,
        nearest = Infinity,
        s = 0;
      for (let k = 1; k < this.line.length; k++) {
        s += Math.hypot(this.line[k].x - this.line[k - 1].x, this.line[k].z - this.line[k - 1].z);
        const d = Math.hypot(this.line[k].x - middle.x, this.line[k].z - middle.z);
        if (d < nearest) {
          nearest = d;
          best = s;
        }
      }
      return best;
    }
    return this.length;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state || !this.postAt) return;
    const n = this.size,
      live = state.winner === null && !capturing(),
      hint = live && marks.hint ? marks.hint.to : -1,
      head = state.path[state.path.length - 1],
      next = live ? steps(state) : [],
      cursor = live ? marks.cursor : null,
      ringAt = (mesh: T.Object3D, cell: number, lift = 0) => {
        const at = cellAt(n, cell);
        mesh.position.set(at.x, BOARD_TOP + 0.006 + lift, at.z);
      };
    this.hinted = hint >= 0 && hint < n * n ? hint : -1;
    this.hintRing.visible = this.hintGlow.visible = this.hinted >= 0;
    if (this.hinted >= 0) {
      ringAt(this.hintRing, this.hinted, 0.003);
      ringAt(this.hintGlow, this.hinted, 0.001);
    }
    this.cursorRing.visible = cursor !== null && cursor !== undefined && cursor >= 0 && cursor < n * n;
    if (this.cursorRing.visible) ringAt(this.cursorRing, cursor!, 0.004);
    // A hovering mouse over a cell the end can step into (or back into).
    const hoverable = live && this.hovered >= 0 && (next.includes(this.hovered) || this.hovered === behind(state)) && this.hovered !== this.hinted;
    this.hoverRing.visible = hoverable;
    if (hoverable) ringAt(this.hoverRing, this.hovered, 0.002);
    this.dots.forEach((dot, k) => {
      dot.visible = k < next.length && next[k] !== this.hinted;
      if (dot.visible) ringAt(dot, next[k], 0.002);
    });
    // For browser tests: the board, the cable, the lit posts, the hint, and where every cell lies on the canvas.
    const el = this.renderer.domElement;
    el.dataset.size = String(n);
    el.dataset.posts = state.posts.map((p) => `${p.cell}:${p.colour}:${p.need}`).join(" ");
    el.dataset.start = String(state.start.cell);
    el.dataset.exit = String(state.exit ? state.exit.cell : -1);
    el.dataset.path = state.path.join(" ");
    el.dataset.head = String(head);
    el.dataset.lit = state.posts.flatMap((p, i) => (isLit(state, i) ? [p.cell] : [])).join(" ");
    el.dataset.tint = String(tintOf(state));
    el.dataset.hint = String(this.hinted);
    el.dataset.places = this.places(n);
    this.redraw();
  }
  /** Where every cell's middle is on the canvas, in CSS pixels, "x,y" joined by spaces. */
  private places(n: number) {
    const v = new T.Vector3(),
      el = this.renderer.domElement,
      out: string[] = [];
    this.camera.updateMatrixWorld();
    for (let i = 0; i < n * n; i++) {
      const at = cellAt(n, i);
      v.set(at.x, BOARD_TOP, at.z).project(this.camera);
      out.push(`${Math.round(((v.x + 1) / 2) * el.clientWidth)},${Math.round(((1 - v.y) / 2) * el.clientHeight)}`);
    }
    return out.join(" ");
  }
  /** The workshop's own frames: lit posts breathe, the hint glows, a flare or a refusal's flash runs. */
  private kick() {
    if (!this.clock && !this.disposed && this.live) this.clock = requestAnimationFrame(this.frame);
  }
  /** Asks for frames for a flare or a flash, also where the posts do not breathe. */
  private wake() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    let more = this.live;
    const state = this.state,
      t = now / 1000;
    if (state) {
      for (const post of this.posts) {
        const start = this.flaring.get(post.index);
        if (start !== undefined) {
          const p = Math.min(1, (now - start) / FLARE_MS);
          if (p >= 1 || !isLit(state, post.index)) this.flaring.delete(post.index);
          else {
            this.shine(post, 1 + Math.sin(p * Math.PI) * 0.8 - (1 - p) * (p < 0.2 ? 1 - p / 0.2 : 0));
            more = true;
            continue;
          }
        }
        if (this.live && isLit(state, post.index)) this.shine(post, (state.winner === 0 ? 1.08 : 1) + 0.06 * Math.sin(t * 2.3 + post.cell * 1.7));
        else if (isLit(state, post.index)) this.shine(post, state.winner === 0 ? 1.08 : 1);
      }
    }
    if (this.hinted >= 0) (this.hintGlow.material as T.MeshBasicMaterial).opacity = this.live ? 0.28 + 0.16 * Math.sin(t * 4) : 0.36;
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
    for (const run of this.runs) run.mesh.geometry.dispose();
    this.runs = [];
    this.lead?.geometry.dispose();
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    super.dispose();
  }
}
