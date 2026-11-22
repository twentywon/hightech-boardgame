import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { wood, planks, glossy, block as rounded, capable, fall, weave } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { beamMaterial, beamTexture } from "../fourrow/shine";
import { CELLS, LINES, SIZE, TURN_BASE, quarterCells, twistOf, type State } from "./rules";

const STEP = 1.0,
  GAP = 0.14,
  EDGE = 3 * STEP + GAP,
  SUBJECT: TableSubject = { half: 5.1, halfZ: 4.1, height: 1.0, lookY: 0, tilt: 1.0 },
  /** The top of a quarter's panel, and the height of a marble's centre as it lies in its hollow. */
  TOP = 0.14,
  REST = 0.36,
  /** A panel: its width, its thickness, the radius of its edges, and the radius of a hollow at the face. */
  PANEL = 3 * STEP - 0.06,
  THICK = 0.28,
  EDGE_R = 0.07,
  HOLLOW = 0.37;
export const MARBLE_COLORS: [string, string] = ["#1c1d21", "#f3efe6"];
/** Centre of a cell, or of one of the eight turn buttons beside the board. */
export function pointAt(point: number) {
  if (point < CELLS) {
    const r = Math.floor(point / SIZE),
      c = point % SIZE;
    return { x: (c - 2.5) * STEP + (c < 3 ? -GAP : GAP), z: (r - 2.5) * STEP + (r < 3 ? -GAP : GAP) };
  }
  const { quarter, clockwise } = twistOf(point),
    left = quarter % 2 === 0,
    top = quarter < 2,
    // The two buttons of a quarter lie beside it, clockwise nearer the corner.
    z = (top ? -1 : 1) * (1.5 * STEP + GAP) + (clockwise === top ? -0.62 : 0.62);
  return { x: (left ? -1 : 1) * (EDGE + 0.85), z };
}
export const twistPoints = () => Array.from({ length: CELLS + 8 }, (_, i) => pointAt(i));
const quarterCentre = (quarter: number) => pointAt(quarterCells(quarter)[4]);
function painted(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A panel's lacquered face: deep vermilion, a little cloudy as lacquer is, with a gilt line round its edge and round each hollow. */
function lacquer() {
  return painted(512, 512, (ctx) => {
    ctx.fillStyle = "#b03c26";
    ctx.fillRect(0, 0, 512, 512);
    let seed = 41;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 70; i++) {
      const x = random() * 512,
        y = random() * 512,
        g = ctx.createRadialGradient(x, y, 0, x, y, 30 + random() * 70);
      g.addColorStop(0, random() < 0.5 ? "rgba(120,28,14,0.16)" : "rgba(214,98,64,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 512);
    }
    ctx.strokeStyle = "#d9ae55";
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 16, 480, 480);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(24, 24, 464, 464);
    // A gilt ring round each hollow (the hollow itself is cut away from this face).
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(256 + (c - 1) * (512 / PANEL), 256 + (r - 1) * (512 / PANEL), (HOLLOW + 0.045) * (512 / PANEL), 0, Math.PI * 2);
        ctx.stroke();
      }
  });
}
/** A marble's skin: its colour, with faint swirls of a lighter or darker shade through it. */
function swirl(base: string, vein: string) {
  return painted(256, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = vein;
    ctx.lineCap = "round";
    for (let k = 0; k < 7; k++) {
      ctx.lineWidth = 2 + (k % 3) * 2;
      ctx.beginPath();
      for (let x = -10; x <= 266; x += 8) {
        const y = 20 + k * 15 + Math.sin(x / 26 + k * 1.7) * 12 + Math.sin(x / 9 + k) * 3;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}
/**
 * A quarter's panel as one solid: a thick rounded slab whose face has nine hollows cut in it, each a smooth bowl a
 * marble sits in. The face (group 0) and the bowls (group 1) take their own paints.
 */
function panelGeometry(rich: boolean) {
  const flat = PANEL - EDGE_R * 2,
    face = new T.Shape(),
    segments = rich ? 32 : 20;
  face.moveTo(-flat / 2, -flat / 2);
  face.lineTo(flat / 2, -flat / 2);
  face.lineTo(flat / 2, flat / 2);
  face.lineTo(-flat / 2, flat / 2);
  face.closePath();
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const hole = new T.Path();
      hole.absarc((c - 1) * STEP, (r - 1) * STEP, HOLLOW, 0, Math.PI * 2, true);
      face.holes.push(hole);
    }
  const top = new T.ShapeGeometry(face, segments / 4);
  // The face's picture covers the whole panel.
  const uv = top.getAttribute("uv"),
    at = top.getAttribute("position");
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) / PANEL + 0.5, at.getY(i) / PANEL + 0.5);
  top.rotateX(-Math.PI / 2);
  top.translate(0, TOP + 0.0005, 0);
  // A bowl: from the face straight down at first, curving in to a flat floor; turned round, its inside faces up.
  const profile: T.Vector2[] = [];
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    profile.push(new T.Vector2(Math.max(0.0001, HOLLOW * Math.cos(a)), -0.17 * Math.sin(a)));
  }
  const bowls: T.BufferGeometry[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      const bowl = new T.LatheGeometry(profile, segments);
      // Turned from the rim inward, its faces look up into the hollow: its shading must too.
      bowl.computeVertexNormals();
      bowl.translate((c - 1) * STEP, TOP, (r - 1) * STEP);
      bowls.push(bowl.toNonIndexed());
    }
  const bowl = mergeGeometries(bowls)!;
  bowls.forEach((b) => b.dispose());
  // The slab under the face: its top lies just under the face, its edges rounded.
  const body = rounded(PANEL, THICK, PANEL, EDGE_R);
  body.translate(0, TOP - THICK / 2 - 0.0005, 0);
  // The flat of the body's top is where the face lies, and it would close the bowls: only its rounded edges are kept.
  const parts = [top.toNonIndexed(), bowl, withoutFlatTop(body.toNonIndexed())];
  const merged = mergeGeometries(parts, true)!;
  parts.forEach((p) => p.dispose());
  top.dispose();
  body.dispose();
  return merged;
}
/** A solid without the triangles that lie flat at its very top. */
function withoutFlatTop(g: T.BufferGeometry) {
  const at = g.getAttribute("position"),
    names = Object.keys(g.attributes),
    keep: number[] = [];
  let top = -Infinity;
  for (let i = 0; i < at.count; i++) top = Math.max(top, at.getY(i));
  for (let i = 0; i < at.count; i += 3) if (!(at.getY(i) > top - 1e-4 && at.getY(i + 1) > top - 1e-4 && at.getY(i + 2) > top - 1e-4)) keep.push(i, i + 1, i + 2);
  const out = new T.BufferGeometry();
  for (const name of names) {
    const a = g.getAttribute(name),
      size = a.itemSize,
      data = new Float32Array(keep.length * size);
    keep.forEach((i, k) => {
      for (let j = 0; j < size; j++) data[k * size + j] = a.array[i * size + j];
    });
    out.setAttribute(name, new T.BufferAttribute(data, size));
  }
  g.dispose();
  return out;
}
/** A curved arrow lying flat, a three-quarter turn with its head: anticlockwise seen from above (mirrored for clockwise). */
function arrowGeometry() {
  const arc = new T.TorusGeometry(0.3, 0.065, 8, 28, Math.PI * 1.35);
  arc.rotateZ(Math.PI * 0.32);
  const end = Math.PI * 0.32 + Math.PI * 1.35,
    head = new T.ConeGeometry(0.15, 0.26, 16);
  head.rotateZ(end);
  head.translate(Math.cos(end) * 0.3 - Math.sin(end) * 0.1, Math.sin(end) * 0.3 + Math.cos(end) * 0.1, 0);
  const g = mergeGeometries([arc.toNonIndexed(), head.toNonIndexed()])!;
  arc.dispose();
  head.dispose();
  // From the plane of the picture onto the table: x stays, the picture's up goes away from the eye.
  g.rotateX(-Math.PI / 2);
  return g;
}
/** A board of four turning quarters on a desk. */
export class TwistView extends TableView<State> {
  private quarters: T.Group[] = [];
  private marbles: (T.Mesh | null)[] = Array(CELLS).fill(null);
  private ball: T.BufferGeometry;
  private paints: T.MeshStandardMaterial[];
  /** The paints of the marbles of a winning five: the same, glowing gold. */
  private lit: T.MeshStandardMaterial[];
  private buttons: T.Group[] = [];
  private cursor: T.Mesh;
  private ghost: T.Mesh;
  private beams: T.Mesh[] = [];
  private live: boolean;
  private ticking = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3d2c20");
    const rich = capable();
    this.live = rich && !this.reducedMotion;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.daylight("#fff3dc", "#3a2c22", "#ffe9c4", 9, 2.1);
    const desk = this.add(new T.PlaneGeometry(90, 90), this.standard(planks(11, keep)), 0, -0.3, 0);
    desk.rotation.x = -Math.PI / 2;
    desk.castShadow = false;
    this.study(rich);
    // A blotter of green baize with leather corners, under the board.
    const baize = this.add(new T.BoxGeometry(9.2, 0.03, 8.6), this.standard({ color: "#2f5a46", roughness: 1, ...weave(8, 8, keep, 0.5) }), 0, -0.285, 0);
    baize.castShadow = false;
    const leather = this.standard({ color: "#4a2a1c", roughness: 0.55 });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const corner = new T.Shape();
        corner.moveTo(0, 0);
        corner.lineTo(1.3, 0);
        corner.lineTo(0, 1.3);
        corner.closePath();
        const g = new T.ExtrudeGeometry(corner, { depth: 0.04, bevelEnabled: false });
        g.rotateX(Math.PI / 2);
        const m = this.add(g, leather, sx * 4.6, -0.25, sz * 4.3);
        m.scale.set(-sx, 1, -sz);
      }
    // The board: a walnut tray with a raised rim, a brass boss where the quarters meet, four quarters that turn.
    const walnut = this.standard({ map: this.own(wood(true)), color: "#a07658", roughness: 0.45 }),
      half = EDGE + 0.35;
    this.add(rounded(half * 2, 0.16, half * 2, 0.06), walnut, 0, -0.2, 0);
    for (const [w, d, x, z] of [[half * 2, 0.22, 0, half - 0.11], [half * 2, 0.22, 0, -half + 0.11], [0.22, half * 2 - 0.44, half - 0.11, 0], [0.22, half * 2 - 0.44, -half + 0.11, 0]] as const)
      this.add(rounded(w, 0.2, d, 0.05), walnut, x, -0.06, z);
    const brass = this.standard({ color: "#c49a48", roughness: 0.3, metalness: 0.75 });
    this.add(new T.CylinderGeometry(0.16, 0.18, 0.08, 24), brass, 0, -0.1, 0);
    const panel = this.own(panelGeometry(rich)),
      face = this.own(glossy({ map: this.own(lacquer()), roughness: 0.3 }, 0.8)),
      hollow = this.standard({ color: "#7c2716", roughness: 0.45 }),
      side = this.own(glossy({ color: "#a2381f", roughness: 0.35 }, 0.8));
    for (let q = 0; q < 4; q++) {
      const group = new T.Group(),
        mesh = new T.Mesh(panel, [face, hollow, side]),
        centre = quarterCentre(q);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      group.position.set(centre.x, 0, centre.z);
      this.quarters.push(group);
      this.scene.add(group);
    }
    this.ball = this.own(new T.SphereGeometry(0.36, 28, 20));
    this.paints = [this.own(glossy({ map: this.own(swirl("#1c1d21", "rgba(90,96,110,0.35)")), roughness: 0.16, metalness: 0.1 })), this.own(glossy({ map: this.own(swirl("#f3efe6", "rgba(200,186,160,0.22)")), roughness: 0.2, metalness: 0.05 }))];
    this.lit = this.paints.map((p) => {
      const m = p.clone();
      m.emissive.set("#ffb83a");
      m.emissiveIntensity = 0.35;
      return this.own(m);
    });
    this.bowls(rich);
    // The turn buttons: a gilt curved arrow on a dark round token, beside each quarter.
    const token = this.own(new T.CylinderGeometry(0.5, 0.52, 0.06, 36)),
      tokenPaint = this.standard({ color: "#2a1d15", roughness: 0.5 }),
      arrow = this.own(arrowGeometry()),
      gilt = this.own(new T.MeshStandardMaterial({ color: "#ffd24a", emissive: "#a8741a", emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.3 }));
    for (let t = 0; t < 8; t++) {
      const button = new T.Group(),
        base = new T.Mesh(token, tokenPaint),
        head = new T.Mesh(arrow, gilt);
      base.receiveShadow = true;
      head.castShadow = true;
      head.position.y = 0.08;
      // Even buttons turn clockwise: the arrow is mirrored.
      if (t % 2 === 0) head.scale.x = -1;
      button.add(base, head);
      const p = pointAt(TURN_BASE + t);
      button.position.set(p.x, -0.25, p.z);
      button.visible = false;
      this.buttons.push(button);
      this.scene.add(button);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.42, 0.5, "#ffffff");
    this.ghost = new T.Mesh(this.ball, this.own(new T.MeshStandardMaterial({ color: "#ffd24a", transparent: true, opacity: 0.75, roughness: 0.3 })));
    this.ghost.visible = false;
    this.scene.add(this.cursor, this.ghost);
    // Lines of light along the fives that won (as many as four at once).
    const plane = this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      light = this.own(beamMaterial(this.own(beamTexture())));
    for (let k = 0; k < 4; k++) {
      const beam = new T.Mesh(plane, light);
      beam.renderOrder = 6;
      beam.visible = false;
      this.beams.push(beam);
      this.scene.add(beam);
    }
    this.begin();
    this.ticking = requestAnimationFrame(this.tick);
  }
  /** On the desk: a lamp, books, a cup of pencils, a notebook and a mug. */
  private study(rich: boolean) {
    const brass = this.standard({ color: "#b08a3e", roughness: 0.35, metalness: 0.6 }),
      shade = this.standard({ color: "#2f5d4a", roughness: 0.5, side: T.DoubleSide });
    this.add(new T.CylinderGeometry(0.7, 0.8, 0.12, 32), brass, -6.3, -0.24, -4.6);
    this.add(new T.CylinderGeometry(0.05, 0.05, 3.0, 10), brass, -6.3, 1.2, -4.6);
    const arm = this.add(new T.CylinderGeometry(0.05, 0.05, 2.0, 10), brass, -5.5, 2.9, -4.2);
    arm.rotation.set(0.35, 0, -1.0);
    this.add(new T.ConeGeometry(0.85, 0.9, 28, 1, true), shade, -4.6, 3.0, -3.8);
    this.add(new T.SphereGeometry(0.22, 14, 10), this.own(new T.MeshBasicMaterial({ color: "#fff2c4" })), -4.6, 2.8, -3.8);
    const glow = new T.PointLight("#ffdca0", 14, 14, 1.6);
    glow.position.set(-4.6, 2.6, -3.8);
    this.scene.add(glow);
    [["#7a2f2f", 2.6], ["#2f4f7a", 2.3], ["#3f6b47", 2.5]].forEach(([color, width], i) => {
      const book = this.add(rounded(width as number, 0.34, 1.7, 0.03), this.standard({ color: color as string, roughness: 0.6 }), 6.3, -0.13 + i * 0.35, -4.4);
      book.rotation.y = 0.12 - i * 0.1;
      this.add(new T.BoxGeometry((width as number) - 0.12, 0.26, 1.6), this.standard({ color: "#efe7d3" }), 6.36, -0.13 + i * 0.35, -4.36).rotation.y = book.rotation.y;
    });
    this.add(new T.CylinderGeometry(0.42, 0.36, 0.95, 24), this.standard({ color: "#3a3f4a", roughness: 0.5 }), 6.6, 0.18, 3.6);
    ["#d8452f", "#2f62c0", "#e0a020", "#3f9a5a"].forEach((color, i) => {
      const pencil = this.add(new T.CylinderGeometry(0.045, 0.045, 1.5, 8), this.standard({ color }), 6.48 + i * 0.08, 0.75, 3.55 + (i % 2) * 0.12);
      pencil.rotation.set(0.12 * (i - 1.5), 0, 0.1 * (i - 1.5));
    });
    const pad = this.add(rounded(2.6, 0.1, 3.4, 0.03), this.standard({ color: "#f3ecd9" }), -6.6, -0.25, 3.0);
    pad.rotation.y = 0.15;
    this.add(new T.CylinderGeometry(0.055, 0.055, 1.9, 8), this.standard({ color: "#22262e", roughness: 0.3 }), -6.2, -0.14, 3.1).rotation.set(Math.PI / 2, 0, 0.5);
    this.add(new T.CylinderGeometry(0.46, 0.4, 0.8, 26), this.standard({ color: "#e8e2d4", roughness: rich ? 0.2 : 0.35 }), -6.9, 0.1, -0.6);
    this.add(new T.CylinderGeometry(0.39, 0.39, 0.02, 26), this.standard({ color: "#3a2416", roughness: 0.15 }), -6.9, 0.49, -0.6);
  }
  /** Two turned wooden bowls of marbles beside the board, black at the left and white at the right. */
  private bowls(rich: boolean) {
    const profile = [
      [0.0, 0.0],
      [0.62, 0.0],
      [0.78, 0.12],
      [0.86, 0.36],
      [0.88, 0.42],
      [0.8, 0.42],
      [0.76, 0.3],
      [0.62, 0.16],
      [0.0, 0.15],
    ].map(([x, y]) => new T.Vector2(x, y));
    const small = this.own(new T.SphereGeometry(0.36, rich ? 22 : 14, rich ? 16 : 10)),
      bowl = this.own(new T.LatheGeometry(profile, rich ? 40 : 28)),
      walnut = this.standard({ map: this.own(wood(true)), color: "#b0865f", roughness: 0.4 });
    const spots: [number, number, number][] = [
      [0, 0.38, 0],
      [0.3, 0.36, 0.12],
      [-0.26, 0.37, 0.18],
      [0.1, 0.38, -0.3],
      [-0.2, 0.37, -0.22],
      [0.36, 0.38, -0.18],
      [0.05, 0.58, 0.02],
    ];
    [[-5.6, 1.2, 0], [5.6, -1.2, 1]].forEach(([x, z, side]) => {
      const m = new T.Mesh(bowl, walnut);
      m.position.set(x, -0.27, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      const many = new T.InstancedMesh(small, this.paints[side], spots.length),
        matrix = new T.Matrix4();
      spots.forEach(([dx, dy, dz], k) => many.setMatrixAt(k, matrix.makeTranslation(x + dx * 1.2, -0.27 + dy * 0.62 + 0.02, z + dz * 1.2).multiply(new T.Matrix4().makeScale(0.62, 0.62, 0.62))));
      this.scene.add(many);
    });
  }
  protected subject() {
    return SUBJECT;
  }
  protected spots(): Spot[] {
    return twistPoints().map((p, i) => ({ ...p, y: i < CELLS ? 0.3 : -0.2, r: i < CELLS ? 0.5 : 0.56, point: i }));
  }
  private marble(cell: number, player: 0 | 1) {
    let mesh = this.marbles[cell];
    if (!mesh) {
      mesh = new T.Mesh(this.ball, this.paints[player]);
      mesh.castShadow = true;
      // Each marble's swirl lies its own way.
      mesh.rotation.set(cell * 0.7, cell * 1.3, cell * 0.4);
      this.marbles[cell] = mesh;
      this.scene.add(mesh);
    }
    mesh.material = this.paints[player];
    const p = pointAt(cell);
    mesh.position.set(p.x, REST, p.z);
    mesh.scale.setScalar(1);
    return mesh;
  }
  protected place(state: State) {
    this.quarters.forEach((quarter, q) => {
      const centre = quarterCentre(q);
      quarter.rotation.set(0, 0, 0);
      quarter.position.set(centre.x, 0, centre.z);
    });
    state.cells.forEach((owner, cell) => {
      if (owner === null) {
        const mesh = this.marbles[cell];
        if (mesh) {
          this.scene.remove(mesh);
          this.marbles[cell] = null;
        }
      } else this.marble(cell, owner);
    });
    for (const cell of state.line) {
      const mesh = this.marbles[cell];
      if (!mesh) continue;
      mesh.scale.setScalar(1.12);
      mesh.material = this.lit[state.cells[cell]!];
    }
    this.lineUp(state);
  }
  /** Lays a line of light along each five of the winning line, or hides them. */
  private lineUp(state: State) {
    const set = new Set(state.line),
      fives = state.line.length && !capturing() ? LINES.filter((line) => line.every((c) => set.has(c))) : [];
    this.beams.forEach((beam, k) => {
      const line = fives[k];
      beam.visible = !!line;
      if (!line) return;
      const a = pointAt(line[0]),
        b = pointAt(line[line.length - 1]),
        length = Math.hypot(b.x - a.x, b.z - a.z);
      beam.position.set((a.x + b.x) / 2, REST + 0.42, (a.z + b.z) / 2);
      beam.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), 0);
      beam.scale.set(length + 1.0, 1, 0.34);
    });
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const { cell, twist } = state.last,
      placed = this.marble(cell, before.turn),
      home = pointAt(cell),
      drop = 1.6;
    for (const beam of this.beams) beam.visible = false;
    placed.position.y = REST + drop;
    let struck = false;
    // The marble drops into its hollow, bounces once and rolls round it a moment before it lies still.
    this.tween(0, 300, (p) => {
      placed.position.y = REST + drop * fall(p);
      if (p >= 0.8 && !struck) {
        struck = true;
        this.onContact();
      }
    });
    this.tween(300, 240, (p) => {
      const k = 1 - p;
      placed.position.x = home.x + 0.04 * k * Math.sin(p * Math.PI * 3);
      placed.position.z = home.z + 0.03 * k * Math.cos(p * Math.PI * 3);
      placed.rotation.z = 0.3 * k * Math.sin(p * Math.PI * 3);
    });
    const lightUp = (at: number) =>
      state.line.forEach((c, k) =>
        this.tween(at + k * 70, 260, (p) => {
          const m = this.marbles[c];
          if (!m) return;
          if (p > 0) m.material = this.lit[state.cells[c] ?? 0];
          m.scale.setScalar(1 + 0.22 * Math.sin(Math.PI * p) + 0.12 * p);
        }),
      );
    if (!twist) {
      lightUp(320);
      return true;
    }
    // The quarter is lifted from the tray, given a real quarter turn with its marbles riding in their hollows (each
    // turning with it), a little past and back, and set down with a knock.
    const centre = quarterCentre(twist.quarter),
      group = this.quarters[twist.quarter],
      riders = quarterCells(twist.quarter)
        .map((c) => this.marbles[c])
        .filter((m): m is T.Mesh => !!m)
        .map((mesh) => ({ mesh, dx: mesh.position.x - centre.x, dz: mesh.position.z - centre.z, spin: mesh.rotation.y })),
      sign = twist.clockwise ? -1 : 1,
      turn = 700;
    this.tween(560, turn, (p) => {
      const lift = p < 0.18 ? Math.sin((p / 0.18) * (Math.PI / 2)) * 0.3 : p > 0.82 ? Math.cos(((p - 0.82) / 0.18) * (Math.PI / 2)) * 0.3 : 0.3,
        q = Math.min(1, Math.max(0, (p - 0.12) / 0.72)),
        // Eased round, carried a few degrees past the quarter and brought back.
        e = q * q * (3 - 2 * q) + Math.sin(Math.PI * q) * Math.sin(Math.PI * q * 2) * -0.025,
        angle = sign * (Math.PI / 2) * (q >= 1 ? 1 : e),
        cos = Math.cos(angle),
        sin = Math.sin(angle);
      group.rotation.set(Math.sin(Math.PI * p) * 0.025, angle, 0);
      group.position.y = lift;
      for (const r of riders) {
        r.mesh.position.set(centre.x + r.dx * cos + r.dz * sin, REST + lift, centre.z - r.dx * sin + r.dz * cos);
        r.mesh.rotation.y = r.spin + angle;
      }
      if (p === 1) {
        if (this.onKnock) this.onKnock("cushion", 0.7);
        else this.onContact();
      }
    });
    // Set down: a small bump of the panel and its marbles.
    this.tween(560 + turn, 160, (p) => {
      const bump = Math.sin(Math.PI * p) * 0.035;
      group.position.y = bump;
      for (const r of riders) r.mesh.position.y = REST + bump * 1.4;
    });
    lightUp(560 + turn + 80);
    return true;
  }
  protected mark(marks: Marks) {
    this.buttons.forEach((button, t) => {
      button.visible = marks.removable.includes(TURN_BASE + t);
      button.scale.setScalar(marks.cursor === TURN_BASE + t ? 1.25 : 1);
    });
    const cursor = marks.cursor;
    this.cursor.visible = cursor !== null && cursor < CELLS;
    if (cursor !== null && cursor < CELLS) this.cursor.position.set(pointAt(cursor).x, TOP + 0.02, pointAt(cursor).z);
    const pending = marks.pending ?? null;
    this.ghost.visible = pending !== null;
    if (pending !== null) this.ghost.position.set(pointAt(pending).x, REST, pointAt(pending).z);
    this.redraw();
  }
  /** Where a graphics card draws: the turn buttons offered breathe, a winning line's light pulses. */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    if (!this.live || capturing() || this.animating) return;
    const t = now / 1000;
    let changed = false;
    this.buttons.forEach((button, i) => {
      if (!button.visible) return;
      const head = button.children[1];
      head.position.y = 0.08 + 0.03 * (0.5 + 0.5 * Math.sin(t * 3 + i * 0.6));
      head.rotation.y = (i % 2 === 0 ? -1 : 1) * Math.sin(t * 2 + i) * 0.12;
      changed = true;
    });
    if (this.state?.line.length) {
      const k = 0.5 + 0.5 * Math.sin(t * 3.2);
      for (const m of this.lit) m.emissiveIntensity = 0.22 + 0.25 * k;
      (this.beams[0].material as T.MeshBasicMaterial).opacity = 0.65 + 0.35 * k;
      changed = true;
    }
    if (changed) this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
