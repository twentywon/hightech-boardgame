import * as T from "three";
import { weave, glossy, block, capable, planks } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { COLS, ROWS, freeRow, type State } from "./rules";
import { beamMaterial, beamTexture } from "./shine";

const CELL = 1,
  /** The windows' radius where they are cut; their rounded lips take a little off it. */
  HOLE = 0.425,
  /** From the face of the front sheet to the back of the back one. */
  DEPTH = 0.4,
  SHEET = 0.06,
  /** Height of the middle of the bottom row above the table. */
  FLOOR = 0.75,
  /** The rack's sheets: their width and height, and the height of their lower edge. */
  RACK_W = COLS * CELL + 0.3,
  RACK_H = ROWS * CELL + 0.3,
  RACK_Y = FLOOR - CELL / 2 - 0.15,
  /** Where a disc is let go, above the rack. */
  DROP_FROM = FLOOR + ROWS * CELL + 0.4,
  /** The height of the arrows (and of the disc held) over the columns. */
  OVER = FLOOR + ROWS * CELL + 0.1;
export const DISC_COLORS: [string, string] = ["#d7352b", "#f2c230"];
/** Centre of a cell on the upright rack. */
export const cellAt = (cell: number) => ({ x: ((cell % COLS) - (COLS - 1) / 2) * CELL, y: FLOOR + Math.floor(cell / COLS) * CELL });
function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
/** A gingham cloth in a soft green. */
const cloth = () =>
  canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = "#f4ead8";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "rgba(122,160,128,0.42)";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(i * 64, 0, 32, 256);
        ctx.fillRect(0, i * 64, 256, 32);
      }
    },
    [9, 9],
  );
/** Cream paper with soft stripes and little sprigs of roses between them. */
const wallpaper = () =>
  canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = "#f1e4cb";
      ctx.fillRect(0, 0, 256, 256);
      for (let x = 0; x < 256; x += 64) {
        ctx.fillStyle = "rgba(196,150,120,0.22)";
        ctx.fillRect(x, 0, 18, 256);
        ctx.fillStyle = "rgba(196,150,120,0.35)";
        ctx.fillRect(x + 20, 0, 2, 256);
        for (let y = 20; y < 256; y += 64) {
          const cx = x + 43,
            cy = y + (x % 128 ? 32 : 0);
          ctx.fillStyle = "rgba(110,140,90,0.55)";
          for (const a of [-0.9, 0.9, 2.6]) {
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6 + 3, 4.5, 2, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "rgba(196,110,104,0.75)";
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(160,70,70,0.6)";
          ctx.beginPath();
          ctx.arc(cx + 1, cy - 1, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
    [10, 4],
  );
/** Painted tongue-and-groove boards below the chair rail. */
const beadboard = () =>
  canvasTexture(
    256,
    128,
    (ctx) => {
      ctx.fillStyle = "#e8dcc6";
      ctx.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 32) {
        ctx.fillStyle = "rgba(120,96,70,0.28)";
        ctx.fillRect(x, 0, 2, 128);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(x + 2, 0, 2, 128);
        ctx.fillStyle = "rgba(120,96,70,0.12)";
        ctx.fillRect(x + 16, 0, 1, 128);
      }
    },
    [24, 1],
  );
/** What the window looks out on: a pale sky, a hedge, a tree in leaf and a lawn. */
const outside = () =>
  canvasTexture(512, 400, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 260);
    sky.addColorStop(0, "#8fc1e6");
    sky.addColorStop(1, "#dcecf4");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 400);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (const [x, y, s] of [[110, 70, 1], [330, 50, 1.3], [450, 110, 0.8]]) {
      ctx.beginPath();
      for (const [dx, dy, r] of [[0, 0, 26], [28, -8, 22], [52, 2, 20], [-24, 6, 18]]) ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#9bbf88";
    ctx.beginPath();
    ctx.moveTo(0, 250);
    for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, 236 - Math.sin(x / 70) * 14);
    ctx.lineTo(512, 400);
    ctx.lineTo(0, 400);
    ctx.fill();
    ctx.fillStyle = "#5f8c4c";
    ctx.fillRect(0, 262, 512, 40);
    for (let x = 0; x < 512; x += 18) {
      ctx.beginPath();
      ctx.arc(x, 264, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#86b46a";
    ctx.fillRect(0, 300, 512, 100);
    ctx.fillStyle = "#6b4a32";
    ctx.fillRect(352, 150, 16, 140);
    for (const [x, y, r, c] of [[360, 120, 62, "#4f7d3e"], [320, 150, 44, "#5d8c48"], [404, 148, 46, "#5d8c48"], [360, 92, 40, "#679a52"]] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
/** A clock's face: numerals round a ring of minute marks. */
const clockFace = () =>
  canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#fbf6ea";
    ctx.fillRect(0, 0, 256, 256);
    ctx.translate(128, 128);
    ctx.fillStyle = "#3a2e26";
    for (let k = 0; k < 60; k++) {
      ctx.save();
      ctx.rotate((k / 60) * Math.PI * 2);
      ctx.fillRect(-1, -118, 2, k % 5 ? 6 : 14);
      ctx.restore();
    }
    ctx.font = '600 30px Georgia, "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let h = 1; h <= 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      ctx.fillText(String(h), Math.sin(a) * 86, -Math.cos(a) * 86);
    }
  });
/** A small framed picture on the wall: a jug of flowers, painted loosely. */
const flowers = () =>
  canvasTexture(256, 320, (ctx) => {
    ctx.fillStyle = "#e9e2cf";
    ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = "#8aa7b8";
    ctx.beginPath();
    ctx.moveTo(96, 300);
    ctx.quadraticCurveTo(70, 220, 104, 190);
    ctx.lineTo(152, 190);
    ctx.quadraticCurveTo(186, 220, 160, 300);
    ctx.fill();
    ctx.strokeStyle = "#5d7f45";
    ctx.lineWidth = 4;
    for (const [x, y] of [[60, 80], [128, 50], [196, 86], [94, 120], [170, 130]]) {
      ctx.beginPath();
      ctx.moveTo(128, 196);
      ctx.quadraticCurveTo(128, 140, x, y);
      ctx.stroke();
    }
    for (const [x, y, c] of [[60, 80, "#d8695f"], [128, 50, "#f0c24a"], [196, 86, "#d8695f"], [94, 120, "#e9a3b6"], [170, 130, "#f4f0e6"]] as const) {
      ctx.fillStyle = c;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(k) * 10, y + Math.sin(k) * 10, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#7a5a2a";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
/** The numbers of the columns, moulded white into the front of the rack's foot: one a column. */
const numbers = () =>
  canvasTexture(1600, 64, (ctx) => {
    ctx.fillStyle = "#2a5cc0";
    ctx.fillRect(0, 0, 1600, 64);
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    ctx.font = '800 38px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // The face is as wide as the foot, RACK_W + 0.2.
    for (let col = 0; col < COLS; col++) ctx.fillText(String(col + 1), 800 + (((col - (COLS - 1) / 2) * CELL) / (RACK_W + 0.2)) * 1600, 34);
  });
/**
 * A disc as such discs are moulded: a rounded rim, a raised ring on each face and a shallow dish inside it. Turned
 * about the y axis, then laid so that its faces look along z.
 */
function discGeometry() {
  const top: [number, number][] = [
    [0, 0.074],
    [0.27, 0.074],
    [0.3, 0.088],
    [0.335, 0.098],
    [0.37, 0.088],
    [0.405, 0.088],
    [0.435, 0.078],
    [0.452, 0.05],
    [0.457, 0],
  ];
  const points = [...top.map(([r, y]) => new T.Vector2(r, -y)), ...top.slice(0, -1).reverse().map(([r, y]) => new T.Vector2(r, y))];
  const g = new T.LatheGeometry(points, 36);
  g.rotateX(Math.PI / 2);
  return g;
}
/** An upright rack on a care-home table: discs drop into its columns. */
export class FourRowView extends TableView<State> {
  private discs: (T.Mesh | null)[] = Array(COLS * ROWS).fill(null);
  private disc: T.BufferGeometry;
  private paints: T.MeshStandardMaterial[];
  /** The paints of a winning line's discs: the same, glowing. */
  private lit: T.MeshStandardMaterial[];
  private arrows: T.Mesh[] = [];
  /** The disc of the side to move, held over the column the pointer or the keyboard is at, and where it would land. */
  private held: T.Mesh;
  private landing: T.Mesh;
  private heldPaints: T.Material[];
  private landingPaints: T.Material[];
  private beam: T.Mesh;
  private hovered = -1;
  private hands: { hour: T.Object3D; minute: T.Object3D; second: T.Object3D };
  /** Where a graphics card draws and motion is not reduced: the held disc sways, a winning line pulses, the clock ticks. */
  private live: boolean;
  private ticking = 0;
  private second = -1;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#d9c9ab");
    const rich = capable();
    this.live = rich && !this.reducedMotion;
    const sun = this.daylight("#fff8ea", "#b79f84", "#fff2d8", 9, 2.0);
    // Light through the window at the left.
    sun.position.set(-7, 10, 6);
    if (rich) {
      const daylit = new T.PointLight("#e8f3ff", 6, 16, 1.4);
      daylit.position.set(-6.2, 6.6, -6.5);
      this.scene.add(daylit);
    }
    this.room(rich);
    this.rack(rich);
    this.disc = this.own(discGeometry());
    this.paints = DISC_COLORS.map((color) => this.own(glossy({ color, roughness: 0.36 }, 0.55)));
    this.lit = DISC_COLORS.map((color) => this.own(glossy({ color, roughness: 0.3, emissive: color, emissiveIntensity: 0.45 }, 0.55)));
    this.heldPaints = DISC_COLORS.map((color) => this.own(glossy({ color, roughness: 0.36 }, 0.55)));
    this.landingPaints = DISC_COLORS.map((color) => this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false })));
    this.held = new T.Mesh(this.disc, this.heldPaints[0]);
    this.held.castShadow = true;
    this.held.visible = false;
    this.landing = new T.Mesh(this.disc, this.landingPaints[0]);
    this.landing.visible = false;
    this.landing.renderOrder = 2;
    this.scene.add(this.held, this.landing);
    // Marks: an arrow over each column that can take a disc.
    const cone = this.own(new T.ConeGeometry(0.2, 0.36, 20)),
      gold = this.own(new T.MeshBasicMaterial({ color: "#ffd24a" })),
      white = this.own(new T.MeshBasicMaterial({ color: "#ffffff" }));
    for (let col = 0; col < COLS; col++) {
      const arrow = new T.Mesh(cone, gold);
      arrow.rotation.x = Math.PI;
      arrow.position.set(cellAt(col).x, OVER, 0);
      arrow.userData.white = white;
      arrow.userData.gold = gold;
      this.arrows.push(arrow);
      this.scene.add(arrow);
    }
    // A line of light across the four that won.
    this.beam = new T.Mesh(this.own(new T.PlaneGeometry(1, 1)), this.own(beamMaterial(this.own(beamTexture()))));
    this.beam.renderOrder = 6;
    this.beam.visible = false;
    this.scene.add(this.beam);
    this.hands = this.clock(rich);
    this.begin();
    this.ticking = requestAnimationFrame(this.tick);
  }
  /** The room behind the rack: a papered wall over painted boards, a window on a garden, a clock, a picture, the table. */
  private room(rich: boolean) {
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    const wall = this.add(new T.PlaneGeometry(60, 21), this.standard({ map: this.own(wallpaper()), roughness: 1 }), 0, 10.5, -9);
    wall.castShadow = false;
    const boards = this.add(new T.PlaneGeometry(60, 2.6), this.standard({ map: this.own(beadboard()), roughness: 0.8 }), 0, 1.3, -8.98);
    boards.castShadow = false;
    const trim = this.standard({ color: "#f6efe2", roughness: 0.55 });
    this.add(block(60, 0.16, 0.16, 0.04), trim, 0, 2.62, -8.92);
    this.add(block(60, 0.3, 0.12, 0.03), trim, 0, 0.15, -8.94);
    // The window: a sash frame with glazing bars, a sill, a garden beyond, curtains in folds on a rod.
    const frame = this.standard({ color: "#fbf6ec", roughness: 0.5 });
    this.add(new T.PlaneGeometry(5.8, 4.8), this.own(new T.MeshBasicMaterial({ map: this.own(outside()) })), -6.2, 6.6, -8.97);
    for (const [w, h, x, y] of [[6.4, 0.3, 0, 2.55], [6.4, 0.3, 0, -2.55], [0.3, 5.4, -3.05, 0], [0.3, 5.4, 3.05, 0], [5.8, 0.12, 0, 0], [0.1, 4.8, 0, 0], [0.08, 4.8, -1.45, 0], [0.08, 4.8, 1.45, 0]] as const)
      this.add(block(w, h, 0.16, 0.03), frame, -6.2 + x, 6.6 + y, -8.9);
    this.add(block(7.0, 0.16, 0.6, 0.05), frame, -6.2, 3.95, -8.72);
    // A potted geranium on the sill.
    this.add(new T.CylinderGeometry(0.32, 0.24, 0.5, 20), this.standard({ color: "#b5643c", roughness: 0.8 }), -8.0, 4.28, -8.68);
    const leaf = this.standard({ color: "#4f7f3d", roughness: 0.8 }),
      bloom = this.standard({ color: "#d9443c", roughness: 0.7 });
    for (const [dx, dy, s] of [[0, 0.62, 0.34], [-0.22, 0.52, 0.26], [0.24, 0.5, 0.27]]) this.add(new T.SphereGeometry(s, 12, 8), leaf, -8.0 + dx, 4.28 + dy, -8.66);
    for (const [dx, dy] of [[-0.1, 0.92], [0.18, 0.82], [-0.28, 0.76]]) this.add(new T.SphereGeometry(0.13, 10, 8), bloom, -8.0 + dx, 4.28 + dy, -8.55);
    const curtain = this.own(new T.PlaneGeometry(1.7, 6.2, 24, 1)),
      at = curtain.getAttribute("position");
    for (let i = 0; i < at.count; i++) at.setZ(i, Math.sin(at.getX(i) * 9) * 0.09);
    curtain.computeVertexNormals();
    const drape = this.standard({ color: "#e3bfa6", roughness: 1, side: T.DoubleSide, ...weave(3, 6, keep, 0.4) });
    for (const x of [-9.9, -2.5]) {
      const c = new T.Mesh(curtain, drape);
      c.position.set(x, 6.35, -8.62);
      c.castShadow = c.receiveShadow = true;
      this.scene.add(c);
    }
    this.add(new T.CylinderGeometry(0.05, 0.05, 8.6, 10), this.standard({ color: "#8a6a3a", roughness: 0.35, metalness: 0.6 }), -6.2, 9.55, -8.6).rotation.z = Math.PI / 2;
    // A picture of flowers in a gilt frame, at the right.
    this.add(block(2.1, 2.6, 0.12, 0.04), this.standard({ color: "#b48a3c", roughness: 0.35, metalness: 0.55 }), 8.6, 6.4, -8.92);
    this.add(new T.PlaneGeometry(1.7, 2.2), this.standard({ map: this.own(flowers()), roughness: 0.9 }), 8.6, 6.4, -8.85);
    // The table under a gingham cloth.
    const top = this.add(new T.PlaneGeometry(60, 30), this.standard({ map: this.own(cloth()), roughness: 1, ...weave(46, 23, keep, 0.6) }), 0, 0, 4);
    top.rotation.x = -Math.PI / 2;
    top.castShadow = false;
    // On the table: a cup of tea, reading glasses, a week's pill box, a ball of yarn and needles, a biscuit tin.
    const china = this.standard({ color: "#fbf8f1", roughness: 0.3 });
    this.add(new T.CylinderGeometry(0.62, 0.5, 0.07, 32), china, -5.1, 0.04, 1.7);
    this.add(new T.CylinderGeometry(0.36, 0.26, 0.46, 28), china, -5.1, 0.3, 1.7);
    this.add(new T.TorusGeometry(0.36, 0.02, 6, 28), this.standard({ color: "#c9a13e", roughness: 0.3, metalness: 0.7 }), -5.1, 0.52, 1.7).rotation.x = Math.PI / 2;
    this.add(new T.CylinderGeometry(0.33, 0.33, 0.02, 28), this.standard({ color: "#a8672f", roughness: 0.15 }), -5.1, 0.47, 1.7);
    this.add(new T.TorusGeometry(0.16, 0.04, 8, 18), china, -4.7, 0.3, 1.7);
    const rim = this.standard({ color: "#4a3a2e", roughness: 0.4 });
    for (const x of [4.3, 5.2]) {
      this.add(new T.TorusGeometry(0.34, 0.035, 8, 28), rim, x, 0.05, 2.3).rotation.x = Math.PI / 2;
      if (rich) this.add(new T.CircleGeometry(0.33, 24), this.own(new T.MeshStandardMaterial({ color: "#dfeef4", transparent: true, opacity: 0.25, roughness: 0.05 })), x, 0.052, 2.3).rotation.x = -Math.PI / 2;
    }
    this.add(new T.BoxGeometry(0.24, 0.035, 0.035), rim, 4.75, 0.05, 2.3);
    for (const [x, turn] of [[3.6, 0.5], [5.9, -0.5]] as const) this.add(new T.BoxGeometry(1.0, 0.035, 0.035), rim, x, 0.05, 1.86).rotation.y = Math.PI / 2 + turn;
    const box = this.standard({ color: "#f7f3ea", roughness: 0.5 });
    this.add(block(3.0, 0.2, 0.6, 0.05), box, 4.9, 0.1, 3.9);
    ["#e98b7d", "#efb768", "#f0dc7a", "#9ccb8f", "#8cc3d8", "#9aa3dc", "#c79ad6"].forEach((color, i) =>
      this.add(block(0.36, 0.06, 0.5, 0.02), this.standard({ color, roughness: 0.5 }), 3.65 + i * 0.415, 0.22, 3.9),
    );
    this.add(new T.SphereGeometry(0.55, 24, 16), this.standard({ color: "#b7677a", roughness: 1, ...weave(2, 2, keep, 0.8) }), -4.6, 0.55, 3.8);
    for (const turn of [0.5, -0.4]) {
      const needle = this.add(new T.CylinderGeometry(0.03, 0.03, 2.2, 8), this.standard({ color: "#d9d2c2", roughness: 0.3 }), -4.4, 0.75, 3.7);
      needle.rotation.set(0.4, turn, 1.25);
    }
    const tin = this.standard({ color: "#2f5d8a", roughness: 0.35, metalness: 0.5 });
    this.add(new T.CylinderGeometry(0.8, 0.8, 0.5, 32), tin, 6.8, 0.25, -1.6);
    this.add(new T.CylinderGeometry(0.83, 0.83, 0.12, 32), this.standard({ color: "#c9a13e", roughness: 0.3, metalness: 0.7 }), 6.8, 0.53, -1.6);
    this.add(new T.CylinderGeometry(0.62, 0.62, 0.02, 32), this.standard(planks(1, keep)), -6.9, 0.01, -1.2);
  }
  /** A clock on the wall at the right, with hands that keep the time. */
  private clock(rich: boolean) {
    const at = new T.Vector3(5.6, 7.4, -8.85),
      wood = this.standard({ color: "#7a5236", roughness: 0.45 });
    this.add(new T.CylinderGeometry(1.15, 1.15, 0.16, 40), wood, at.x, at.y, at.z).rotation.x = Math.PI / 2;
    this.add(new T.TorusGeometry(1.05, 0.07, 10, 40), this.standard({ color: "#b48a3c", roughness: 0.3, metalness: 0.6 }), at.x, at.y, at.z + 0.1);
    this.add(new T.CircleGeometry(1.0, 40), this.standard({ map: this.own(clockFace()), roughness: rich ? 0.25 : 0.6 }), at.x, at.y, at.z + 0.085);
    const hand = this.standard({ color: "#2b2622" }),
      make = (length: number, width: number, z: number, material: T.Material) => {
        const pivot = new T.Group();
        pivot.position.set(at.x, at.y, at.z + z);
        const bar = new T.Mesh(this.own(new T.BoxGeometry(width, length, 0.02)), material);
        bar.position.y = length / 2 - 0.08;
        pivot.add(bar);
        this.scene.add(pivot);
        return pivot;
      };
    const hands = { hour: make(0.55, 0.07, 0.11, hand), minute: make(0.8, 0.05, 0.12, hand), second: make(0.85, 0.018, 0.13, this.standard({ color: "#b3332a" })) };
    this.add(new T.SphereGeometry(0.05, 10, 8), hand, at.x, at.y, at.z + 0.14);
    this.setClock(hands, new Date());
    return hands;
  }
  private setClock(hands: { hour: T.Object3D; minute: T.Object3D; second: T.Object3D }, now: Date) {
    const s = now.getSeconds(),
      m = now.getMinutes() + s / 60,
      h = (now.getHours() % 12) + m / 60;
    hands.second.rotation.z = -(s / 60) * Math.PI * 2;
    hands.minute.rotation.z = -(m / 60) * Math.PI * 2;
    hands.hour.rotation.z = -(h / 12) * Math.PI * 2;
  }
  /**
   * The rack, of our own design: two sheets of blue moulded plastic with forty-two round windows whose lips are rounded,
   * a scalloped top edge with a mouth over each column, rounded posts at the ends with knobs, a foot along the bottom
   * with the columns' numbers, and two arched feet that keep it standing.
   */
  private rack(rich: boolean) {
    const blue = this.own(glossy({ color: "#2458b8", roughness: 0.34 }, 0.5)),
      dark = this.standard({ color: "#1d469a", roughness: 0.5 }),
      w = RACK_W,
      h = RACK_H,
      y0 = RACK_Y,
      shape = new T.Shape();
    shape.moveTo(-w / 2, y0);
    shape.lineTo(w / 2, y0);
    shape.lineTo(w / 2, y0 + h);
    // The top edge dips over each column, a mouth for the discs.
    for (let col = COLS - 1; col >= 0; col--) {
      const x = cellAt(col).x;
      shape.lineTo(x + 0.46, y0 + h);
      shape.quadraticCurveTo(x, y0 + h - 0.34, x - 0.46, y0 + h);
    }
    shape.lineTo(-w / 2, y0 + h);
    shape.closePath();
    for (let cell = 0; cell < COLS * ROWS; cell++) {
      const { x, y } = cellAt(cell),
        hole = new T.Path();
      hole.absarc(x, y, HOLE, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const bevel = rich ? { bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: 2 } : { bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.022, bevelSegments: 1 },
      sheet = this.own(new T.ExtrudeGeometry(shape, { depth: SHEET - 0.04, curveSegments: rich ? 22 : 16, ...bevel }));
    for (const z of [DEPTH / 2 - SHEET + 0.02, -DEPTH / 2 + 0.02]) {
      const m = new T.Mesh(sheet, blue);
      m.position.z = z;
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
    // The posts at the ends, with a knob on each, and the bar the discs stand on.
    const tall = h + 0.55;
    for (const side of [-1, 1]) {
      const x = side * (w / 2 + 0.1);
      this.add(block(0.34, tall, DEPTH + 0.2, 0.1), blue, x, y0 - 0.15 + tall / 2, 0);
      const knob = this.add(new T.SphereGeometry(0.21, 20, 12), blue, x, y0 - 0.15 + tall + 0.04, 0);
      knob.scale.set(1, 0.7, 1);
      // An arched foot under each post.
      const foot = new T.Shape();
      foot.moveTo(-1.35, 0);
      foot.lineTo(-1.1, 0);
      foot.quadraticCurveTo(0, 0.36, 1.1, 0);
      foot.lineTo(1.35, 0);
      foot.quadraticCurveTo(1.35, 0.2, 1.0, 0.26);
      foot.quadraticCurveTo(0, 0.62, -1.0, 0.26);
      foot.quadraticCurveTo(-1.35, 0.2, -1.35, 0);
      const g = this.own(new T.ExtrudeGeometry(foot, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 12 }));
      g.rotateY(Math.PI / 2);
      g.translate(-0.21, 0, 0);
      const m = new T.Mesh(g, blue);
      m.position.set(x, 0.0, 0);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
    this.add(block(w + 0.2, 0.3, DEPTH + 0.16, 0.06), [blue, blue, blue, dark, this.standard({ map: this.own(numbers()), roughness: 0.4 }), blue], 0, y0 + 0.02, 0);
    this.add(new T.BoxGeometry(w, 0.06, DEPTH - 0.08), dark, 0, FLOOR - 0.457 - 0.03, 0);
  }
  protected subject(aspect: number): TableSubject {
    // Looked at from the front, a little from above; a narrow screen needs only the rack.
    // Close enough for the rack to fill the screen.
    return { half: aspect < 1 ? 3.9 : 4.6, halfZ: 0.4, height: aspect < 1 ? 8.6 : 6.3, lookY: aspect < 1 ? 3.7 : 3.05, tilt: 0.24 };
  }
  protected spots(): Spot[] {
    const out: Spot[] = [];
    for (let cell = 0; cell < COLS * ROWS; cell++) out.push({ ...cellAt(cell), z: 0, r: 0.52, point: cell % COLS });
    for (let col = 0; col < COLS; col++) out.push({ x: cellAt(col).x, y: OVER, z: 0, r: 0.52, point: col });
    return out;
  }
  private discAt(cell: number, player: 0 | 1) {
    let mesh = this.discs[cell];
    if (!mesh) {
      mesh = new T.Mesh(this.disc, this.paints[player]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.discs[cell] = mesh;
      this.scene.add(mesh);
    }
    mesh.material = this.paints[player];
    const { x, y } = cellAt(cell);
    mesh.position.set(x, y, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
    return mesh;
  }
  protected place(state: State) {
    state.cells.forEach((owner, cell) => {
      if (owner === null) {
        const mesh = this.discs[cell];
        if (mesh) {
          this.scene.remove(mesh);
          this.discs[cell] = null;
        }
      } else this.discAt(cell, owner);
    });
    // The winning discs stand out: they glow, and a line of light runs through them.
    for (const cell of state.line) {
      const mesh = this.discs[cell];
      if (!mesh) continue;
      mesh.scale.setScalar(1.08);
      mesh.material = this.lit[state.cells[cell]!];
    }
    this.lineUp(state);
  }
  /** Lays the line of light over the four that won (the farthest two of the line), or hides it. */
  private lineUp(state: State) {
    const line = state.line;
    this.beam.visible = line.length >= 4 && !capturing();
    if (!this.beam.visible) return;
    const ends = line.map(cellAt);
    let a = ends[0],
      b = ends[0],
      far = -1;
    for (const p of ends) for (const q of ends) if (Math.hypot(p.x - q.x, p.y - q.y) > far) [a, b, far] = [p, q, Math.hypot(p.x - q.x, p.y - q.y)];
    this.beam.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, DEPTH / 2 + 0.06);
    this.beam.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x));
    this.beam.scale.set(far + 1.1, 0.3, 1);
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    const cell = state.last,
      mesh = this.discAt(cell, state.cells[cell]!),
      end = cellAt(cell).y,
      start = DROP_FROM,
      fall = 260 + (start - end) * 55,
      settle = 380;
    mesh.position.y = start;
    this.beam.visible = false;
    for (const c of state.line) if (c !== cell) this.discs[c]!.material = this.paints[state.cells[c]!];
    this.tween(0, fall, (p) => {
      // Falls faster and faster down its column.
      mesh.position.y = start + (end - start) * p * p;
      if (p === 1) this.onContact();
    });
    // It strikes the disc or the bar under it, bounces twice, less each time, and rattles in its slot as it settles.
    this.tween(fall, settle, (q) => {
      const up = q < 0.58 ? 0.15 * Math.sin((Math.PI * q) / 0.58) : 0.045 * Math.sin((Math.PI * (q - 0.58)) / 0.42);
      mesh.position.y = end + up;
      mesh.rotation.y = 0.16 * (1 - q) * Math.sin(q * Math.PI * 7);
      mesh.position.x = cellAt(cell).x + 0.018 * (1 - q) * Math.sin(q * Math.PI * 9);
    });
    if (state.line.length) {
      // Four in a row: the discs of the line light up one after another, and the light runs through them.
      const order = state.line.slice().sort((a, b) => Math.hypot(cellAt(a).x - cellAt(cell).x, cellAt(a).y - end) - Math.hypot(cellAt(b).x - cellAt(cell).x, cellAt(b).y - end));
      order.forEach((c, k) =>
        this.tween(fall + settle * 0.6 + k * 110, 260, (p) => {
          const m = this.discs[c];
          if (!m) return;
          if (p > 0) m.material = this.lit[state.cells[c]!];
          m.scale.setScalar(1 + 0.16 * Math.sin(Math.PI * p) + 0.08 * p);
        }),
      );
    }
    return true;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  protected mark(marks: Marks) {
    const s = this.state,
      aim = this.hovered >= 0 && marks.targets.includes(this.hovered) ? this.hovered : marks.cursor !== null && marks.targets.includes(marks.cursor) ? marks.cursor : -1;
    this.arrows.forEach((arrow, col) => {
      const cursor = marks.cursor === col;
      arrow.visible = (marks.targets.includes(col) || cursor) && col !== aim;
      arrow.material = cursor ? arrow.userData.white : arrow.userData.gold;
      arrow.scale.setScalar(cursor ? 1.35 : 1);
      // The arrow of a full column is never shown: it is not among the targets.
      if (s && freeRow(s, col) < 0) arrow.visible = false;
    });
    // The disc to be dropped hangs over the column aimed at, and a pale one shows where it would come to rest.
    const row = s && aim >= 0 ? freeRow(s, aim) : -1;
    this.held.visible = this.landing.visible = !!s && row >= 0 && s.winner === null;
    if (s && this.held.visible) {
      this.held.material = this.heldPaints[s.turn];
      this.landing.material = this.landingPaints[s.turn];
      this.held.position.set(cellAt(aim).x, OVER + 0.12, 0);
      this.held.rotation.set(0, 0, 0);
      const { x, y } = cellAt(row * COLS + aim);
      this.landing.position.set(x, y, 0);
    }
    this.redraw();
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    if (!this.live || capturing()) return;
    const t = now / 1000;
    let changed = false;
    const second = Math.floor(Date.now() / 1000);
    if (second !== this.second) {
      this.second = second;
      this.setClock(this.hands, new Date());
      changed = true;
    }
    if (this.held.visible && !this.animating) {
      this.held.position.y = OVER + 0.12 + Math.sin(t * 2.4) * 0.04;
      this.held.rotation.y = Math.sin(t * 1.7) * 0.12;
      changed = true;
    }
    if (this.state?.line.length && !this.animating) {
      const k = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3.2));
      for (const m of this.lit) m.emissiveIntensity = k;
      (this.beam.material as T.MeshBasicMaterial).opacity = 0.7 + 0.3 * Math.sin(t * 3.2);
      changed = true;
    }
    if (changed) this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
