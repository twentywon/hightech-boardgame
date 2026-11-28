import * as T from "three";
import { block, glossy, hop } from "../../engine/scene-utils";
import { sumer } from "../../engine/scenery";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { OFF, PIECES, ROSETTES, THROW, type State } from "./rules";

export const UR_COLORS: [string, string] = ["#f1ebdc", "#22201e"];
/** A square's side; the board's three rows and eight columns. */
export const S = 0.95;
export const UR_SUBJECT: TableSubject = { half: 6.0, halfZ: 2.9, height: 0.6, lookY: 0, tilt: 1.02 };
/** Where the dice are thrown: beside the board's right end. */
export const DICE = { x: 5.25, z: 0 };
const TOP = 0.32;
/** The square of a side's way: column 0–7 and row (−1 far, 0 middle, 1 near). */
export function squareOf(side: number, progress: number) {
  const row = side === 0 ? 1 : -1;
  if (progress <= 4) return { col: 4 - progress, row };
  if (progress <= 12) return { col: progress - 5, row: 0 };
  return { col: 20 - progress, row };
}
/** Where a piece of a side stands for a place on its way; `k` lines up those waiting and those finished beside the board. */
export function pieceAt(side: number, progress: number, k: number) {
  const out = side === 0 ? 1 : -1;
  if (progress === 0) return { x: (-3.7 + k * 0.62) * S, z: out * 1.98 * S, y: 0.09 };
  if (progress === OFF) return { x: (3.9 - k * 0.62) * S, z: out * 1.98 * S, y: 0.09 };
  const { col, row } = squareOf(side, progress);
  return { x: (col - 3.5) * S, z: row * S, y: TOP + 0.09 };
}
const ROSETTE_SQUARES = new Set(["0,1", "0,-1", "3,0", "6,1", "6,-1"]);
/** The patterns of the squares, after the board in the British Museum: rosettes, eyes, five dots and small chequers. */
function paintSquare(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, col: number, row: number) {
  ctx.fillStyle = "#f3ead6";
  ctx.fillRect(x + 3, y + 3, u - 6, u - 6);
  ctx.strokeStyle = "#2b2420";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 3, u - 6, u - 6);
  const cx = x + u / 2,
    cy = y + u / 2;
  if (ROSETTE_SQUARES.has(`${col},${row}`)) {
    ctx.fillStyle = "#1f4f9a";
    ctx.fillRect(x + 8, y + 8, u - 16, u - 16);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.fillStyle = i % 2 ? "#f6f0e2" : "#c8321f";
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * u * 0.2, cy + Math.sin(a) * u * 0.2, u * 0.17, u * 0.08, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e0b040";
    ctx.beginPath();
    ctx.arc(cx, cy, u * 0.09, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const kind = (col * 3 + row + 3) % 3;
  if (kind === 0) {
    // Eyes: four rings with a dot in each.
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.fillStyle = "#1f4f9a";
      ctx.beginPath();
      ctx.arc(cx + dx * u * 0.2, cy + dy * u * 0.2, u * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f6f0e2";
      ctx.beginPath();
      ctx.arc(cx + dx * u * 0.2, cy + dy * u * 0.2, u * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 1) {
    // Five dots.
    ctx.fillStyle = "#c8321f";
    for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * u * 0.24, cy + dy * u * 0.24, u * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Small chequers.
    const n = 4,
      c = (u - 24) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if ((i + j) % 2) {
          ctx.fillStyle = "#1f4f9a";
          ctx.fillRect(x + 12 + i * c, y + 12 + j * c, c, c);
        }
  }
}
/** The top of a part of the board: `cols` columns from `col0`, the rows listed. */
function partTexture(col0: number, cols: number, rows: number[]) {
  const u = 160,
    c = document.createElement("canvas");
  c.width = cols * u;
  c.height = rows.length * u;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#2b2420";
  ctx.fillRect(0, 0, c.width, c.height);
  rows.forEach((row, j) => {
    for (let i = 0; i < cols; i++) paintSquare(ctx, i * u, j * u, u, col0 + i, row);
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A piece's top: five dots on its colour. */
function pieceTexture(light: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = light ? "#f1ebdc" : "#22201e";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = light ? "#22201e" : "#f1ebdc";
  for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(64 + dx * 26, 64 + dy * 26, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** How a tetrahedron lies with one tip straight up. */
const TIP_UP = new T.Quaternion().setFromUnitVectors(new T.Vector3(1, 1, 1).normalize(), new T.Vector3(0, 1, 0));
const DIE_R = 0.36;
/**
 * The board of Ur on a reed mat in a room of a Sumerian palace: three blocks of inlaid squares (four columns, a bridge of two in the middle row, two
 * columns), seven pieces a side with five dots on them waiting along the board's long sides, and four
 * tetrahedral dice whose upturned tip is white when it counts.
 */
export class UrView extends TableView<State> {
  private pieces: T.Mesh[] = [];
  private dice: T.Group[] = [];
  private tips: T.Mesh[] = [];
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#6a5038");
    // Warm light, as from a courtyard in the sun of southern Mesopotamia.
    this.daylight("#fff0d8", "#7a5a3a", "#ffdcaa", 10, 2.2);
    // A room of a palace at Ur, where the game was found (the user asked for a setting true to its origin).
    sumer(this.scene, (r) => this.own(r), 6.2, 2.7);
    const edge = this.standard({ color: "#3a2618", roughness: 0.5 }),
      part = (col0: number, cols: number, rows: number[]) => {
        const top = this.standard({ map: this.own(partTexture(col0, cols, rows)), roughness: 0.45 }),
          z = (rows[0] + rows[rows.length - 1]) / 2;
        this.add(block(cols * S + 0.08, TOP, rows.length * S + 0.08, 0.04), [edge, edge, top, edge, edge, edge], (col0 + cols / 2 - 4) * S, TOP / 2, z * S);
      };
    part(0, 4, [-1, 0, 1]);
    part(4, 2, [0]);
    part(6, 2, [-1, 0, 1]);
    const disc = this.own(new T.CylinderGeometry(0.34, 0.36, 0.18, 32));
    UR_COLORS.forEach((color, side) => {
      const body = glossy({ color, roughness: 0.4 }),
        face = this.standard({ map: this.own(pieceTexture(side === 0)), roughness: 0.4 });
      this.own(body);
      for (let k = 0; k < PIECES; k++) {
        const mesh = new T.Mesh(disc, [body, face, body]);
        mesh.castShadow = mesh.receiveShadow = true;
        this.pieces.push(mesh);
        this.scene.add(mesh);
      }
    });
    // Four dice: dark tetrahedra; the tip that points up is white when it is one of the marked two.
    const tetra = this.own(new T.TetrahedronGeometry(DIE_R)),
      bone = this.standard({ color: "#3b2a1e", roughness: 0.5 }),
      white = this.standard({ color: "#f6f0e2", roughness: 0.4 }),
      tip = this.own(new T.SphereGeometry(0.07, 12, 8));
    for (let i = 0; i < 4; i++) {
      const group = new T.Group(),
        body = new T.Mesh(tetra, bone),
        cap = new T.Mesh(tip, white);
      body.quaternion.copy(TIP_UP);
      body.castShadow = true;
      cap.position.y = DIE_R * 0.86;
      group.add(body, cap);
      this.scene.add(group);
      this.dice.push(group);
      this.tips.push(cap);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < PIECES; i++) {
      const ring = ringMesh(own, 0.38, 0.46, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.46, 0.53, "#ffffff");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject() {
    return UR_SUBJECT;
  }
  /** Where die `i` rests. */
  private dieAt(i: number) {
    return { x: DICE.x + (i % 2 ? 0.45 : -0.45), z: DICE.z + (i < 2 ? -0.45 : 0.45) };
  }
  private stands(state: State) {
    return state.pieces.flatMap((pieces, side) => pieces.map((progress, k) => pieceAt(side, progress, k)));
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const out: Spot[] = this.stands(state).map((p, point) => ({ x: p.x, y: p.y, z: p.z, r: 0.4, point }));
    // The dice are a place too: a tap on them throws.
    out.push({ ...DICE, y: 0.2, r: 0.95, point: THROW });
    return out;
  }
  private showDice(dice: boolean[]) {
    dice.forEach((up, i) => {
      const p = this.dieAt(i),
        group = this.dice[i];
      group.position.set(p.x, DIE_R / 3, p.z);
      group.rotation.set(0, i * 1.3 + (up ? 0 : 0.5), 0);
      this.tips[i].visible = up;
    });
  }
  protected place(state: State) {
    // The dice and the pieces as they lie, for tests (two devices over Wi-Fi must show the same throw).
    this.renderer.domElement.dataset.dice = state.dice.map(Number).join("");
    this.renderer.domElement.dataset.pieces = JSON.stringify(state.pieces);
    this.stands(state).forEach((p, i) => this.pieces[i].position.set(p.x, p.y, p.z));
    this.showDice(state.dice);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    if (last.piece < 0) {
      // The dice are thrown: they leap and spin and come down showing their tips.
      this.onRoll(4, 0.42);
      this.showDice(state.dice);
      this.dice.forEach((group, i) => {
        const p = this.dieAt(i),
          turn = group.rotation.y;
        this.tween(i * 40, 480, (q) => {
          group.position.set(p.x - (1 - q) * 0.6, DIE_R / 3 + hop(q) * 0.8, p.z + Math.sin(q * 9 + i) * (1 - q) * 0.2);
          group.rotation.set((1 - q) * (5 + i), turn + (1 - q) * 6, (1 - q) * (3 - i));
        });
      });
      // A throw nobody can use is left to be seen for a moment.
      if (state.turn !== before.turn) this.tween(520, 600, () => {});
      return true;
    }
    const side = last.side,
      k = last.piece - side * PIECES,
      mesh = this.pieces[last.piece],
      steps: { x: number; y: number; z: number }[] = [];
    for (let p = last.from + 1; p <= last.to; p++) steps.push(pieceAt(side, p, k));
    let from = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    steps.forEach((to, i) => {
      const a = from;
      this.tween(i * 170, 170, (p) => {
        mesh.position.set(a.x + (to.x - a.x) * p, a.y + (to.y - a.y) * p + Math.sin(Math.PI * p) * 0.35, a.z + (to.z - a.z) * p);
        if (p === 1) this.onContact();
      });
      from = to;
    });
    // Pieces sent back fly to the start.
    for (const point of last.sent) {
      const sent = this.pieces[point],
        a = { x: sent.position.x, y: sent.position.y, z: sent.position.z },
        b = pieceAt(point < PIECES ? 0 : 1, 0, point % PIECES);
      this.tween(steps.length * 170, 460, (p) => sent.position.set(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p + Math.sin(Math.PI * p) * 1.4, a.z + (b.z - a.z) * p));
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      stands = state ? this.stands(state) : [];
    this.rings.forEach((ring, i) => {
      const point = marks.movable[i];
      ring.visible = point !== undefined && point < PIECES * 2 && !!stands[point];
      if (ring.visible) ring.position.set(stands[point].x, stands[point].y - 0.085, stands[point].z);
    });
    const cursor = marks.cursor !== null ? (marks.cursor === THROW ? { ...DICE, y: 0.01 } : stands[marks.cursor]) : undefined;
    this.cursor.visible = !!cursor;
    if (cursor) this.cursor.position.set(cursor.x, cursor.y - 0.08, cursor.z);
  }
}
/** Squares of a side's way that are rosettes, for the guide and tests. */
export const ROSETTE_PROGRESS = ROSETTES;
