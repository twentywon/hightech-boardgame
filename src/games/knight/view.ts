import * as T from "three";
import { wood, planks, veneer, glossy, block, hop, travel } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { nextSquares, type State } from "./rules";

export const KNIGHT_COLORS: [string, string] = ["#ecdcb4", "#2f6b4a"];
/** A square's side and the height of its top. */
const CELL = 0.78,
  TOP = 0.21;
/** The centre of a square of a board `cols` wide and `rows` deep. */
export function squareAt(cols: number, rows: number, index: number) {
  const r = Math.floor(index / cols),
    c = index % cols;
  return { x: (c - (cols - 1) / 2) * CELL, z: (r - (rows - 1) / 2) * CELL };
}
/**
 * A small chessboard of maple and walnut veneer in a dark rim, with the squares that are not part of the puzzle cut
 * out down to the rim. A boxwood knight in the Staunton manner hops from square to square; each square it has left
 * keeps a disc with the number of its step, and the squares it may jump to next carry a small green dot.
 */
export class KnightView extends TableView<State> {
  private shape = "";
  private cols = 0;
  private rows = 0;
  private board = new T.Group();
  private steps = new T.Group();
  private dots = new T.Group();
  private knight = new T.Group();
  private numbers = new Map<number, T.Material>();
  private disc: T.BufferGeometry;
  private dot: T.BufferGeometry;
  private dotPaint: T.Material;
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#65452f");
    this.daylight("#fff2d7", "#283c35", "#fff5df", 7, 2.4);
    this.add(new T.BoxGeometry(60, 0.2, 60), this.standard(planks(10, (r) => this.own(r))), 0, -0.35, 0).castShadow = false;
    this.disc = this.own(new T.CylinderGeometry(0.3, 0.3, 0.012, 36));
    this.dot = this.own(new T.CircleGeometry(0.09, 24).rotateX(-Math.PI / 2));
    this.dotPaint = this.own(new T.MeshBasicMaterial({ color: "#3fae5c", transparent: true, opacity: 0.85, depthWrite: false }));
    this.buildKnight();
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.31, 0.35, "#fff2c6");
    this.hintRing = ringMesh(own, 0.3, 0.37, "#ffb21f");
    this.scene.add(this.board, this.steps, this.dots, this.knight, this.cursor, this.hintRing);
    this.begin();
  }
  /** A boxwood knight: the turned foot and stem of a Staunton piece and a horse's head with a mane. */
  private buildKnight() {
    const paint = this.own(glossy({ color: KNIGHT_COLORS[0], roughness: 0.4, side: T.DoubleSide })),
      put = (geometry: T.BufferGeometry) => {
        const m = new T.Mesh(this.own(geometry), paint);
        m.castShadow = m.receiveShadow = true;
        this.knight.add(m);
      };
    put(
      new T.LatheGeometry(
        [[0, 0], [0.3, 0], [0.315, 0.025], [0.315, 0.07], [0.29, 0.1], [0.25, 0.115], [0.235, 0.145], [0.255, 0.175], [0.24, 0.205], [0.19, 0.235], [0.16, 0.3], [0.138, 0.4], [0.125, 0.5], [0.14, 0.545], [0.2, 0.565], [0.215, 0.59], [0.2, 0.612], [0.12, 0.628], [0, 0.63]].map(([r, y]) => new T.Vector2(r, y)),
        32,
      ),
    );
    const head = new T.Shape();
    head.moveTo(-0.185, 0.6);
    head.splineThru(
      [[-0.225, 0.78], [-0.21, 0.95], [-0.14, 1.1], [-0.06, 1.2], [-0.025, 1.3], [0.03, 1.21], [0.095, 1.16], [0.2, 1.06], [0.295, 0.935], [0.32, 0.865], [0.285, 0.8], [0.2, 0.805], [0.125, 0.86], [0.105, 0.78], [0.15, 0.68], [0.17, 0.6]].map(([x, y]) => new T.Vector2(x, y)),
    );
    head.closePath();
    put(new T.ExtrudeGeometry(head, { depth: 0.13, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.055, bevelSegments: 4, curveSegments: 28, steps: 1 }).translate(0, 0, -0.065));
    const mane = new T.Shape();
    mane.moveTo(-0.2, 0.64);
    mane.splineThru([[-0.265, 0.8], [-0.25, 0.97], [-0.17, 1.13], [-0.08, 1.24], [-0.1, 1.1], [-0.17, 0.95], [-0.185, 0.8]].map(([x, y]) => new T.Vector2(x, y)));
    mane.closePath();
    put(new T.ExtrudeGeometry(mane, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -0.025));
    const eyePaint = this.standard({ color: "#353d39" });
    for (const z of [-0.118, 0.118]) {
      const eye = new T.Mesh(this.own(new T.SphereGeometry(0.024, 12, 8)), eyePaint);
      eye.position.set(0.135, 1.03, z);
      this.knight.add(eye);
    }
    // Turned three-quarters toward me, so that its head is seen in profile.
    this.knight.rotation.y = -0.55;
  }
  /** The disc left on a square: a number for the step, painted once for each number. */
  private number(n: number) {
    let paint = this.numbers.get(n);
    if (!paint) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = n === 1 ? "#c9a44a" : "#2f6b4a";
      ctx.beginPath();
      ctx.arc(64, 64, 62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fffaf0";
      ctx.font = `800 ${n < 10 ? 70 : 58}px Inter, "Noto Sans KR", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), 64, 68);
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      paint = this.own(new T.MeshStandardMaterial({ map: texture, roughness: 0.6 }));
      this.numbers.set(n, paint);
    }
    return paint;
  }
  /** Lays the board out again for a puzzle of another shape: its squares, and the rim where squares are cut out. */
  private lay(state: State) {
    const shape = `${state.cols}x${state.rows}:${state.open.map(Number).join("")}`;
    if (shape === this.shape) return;
    const resized = state.cols !== this.cols || state.rows !== this.rows;
    this.shape = shape;
    this.cols = state.cols;
    this.rows = state.rows;
    this.board.clear();
    // The rim is a lighter, warmer, polished wood than the table under it, so that the board stands apart (the user asked).
    const rimPaint = this.standard({ map: this.own(wood(false)), color: "#b27450", roughness: 0.34 }),
      light = this.standard({ map: veneer(false), roughness: 0.38, color: "#fff4e0" }),
      dark = this.standard({ map: veneer(true), roughness: 0.38, color: "#9a7458" }),
      hole = this.standard({ color: "#0d0805", roughness: 0.95 });
    this.add(block(state.cols * CELL + 0.5, 0.35, state.rows * CELL + 0.5), rimPaint, 0, 0, 0, this.board);
    let cut = 13;
    const sheet = () => (cut = (cut * 1664525 + 1013904223) >>> 0) / 4294967296;
    state.open.forEach((open, i) => {
      const p = squareAt(state.cols, state.rows, i);
      if (!open) {
        // A square cut out: a dark hollow in the rim.
        this.add(new T.BoxGeometry(CELL * 0.8, 0.02, CELL * 0.8), hole, p.x, 0.168, p.z, this.board).castShadow = false;
        return;
      }
      const tile = new T.BoxGeometry(CELL, 0.035, CELL),
        uv = tile.getAttribute("uv"),
        u0 = sheet() * 0.5,
        v0 = sheet() * 0.5;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.5);
      this.add(tile, (Math.floor(i / state.cols) + (i % state.cols)) % 2 ? dark : light, p.x, 0.19, p.z, this.board).castShadow = false;
    });
    if (resized) this.resize();
  }
  protected subject(aspect: number): TableSubject {
    const half = (this.cols || 4) * CELL * 0.5 + 0.35,
      halfZ = (this.rows || 4) * CELL * 0.5 + 0.35;
    return { half: aspect < 1 ? half : half + 0.4, halfZ, height: 1.3, lookY: 0.1, tilt: 1.0 };
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.open.flatMap((open, i) => (open ? [{ ...squareAt(state.cols, state.rows, i), y: TOP, r: CELL * 0.5, point: i }] : []));
  }
  /** The steps behind the knight as numbered discs, and green dots where it may go next. */
  private trail(state: State, upTo = state.path.length) {
    this.steps.clear();
    this.dots.clear();
    state.path.slice(0, upTo - 1).forEach((cell, i) => {
      const p = squareAt(state.cols, state.rows, cell),
        disc = new T.Mesh(this.disc, this.number(i + 1));
      disc.position.set(p.x, TOP + 0.006, p.z);
      disc.receiveShadow = true;
      this.steps.add(disc);
    });
    if (state.winner === null && upTo === state.path.length)
      for (const cell of nextSquares(state)) {
        const p = squareAt(state.cols, state.rows, cell),
          dot = new T.Mesh(this.dot, this.dotPaint);
        dot.position.set(p.x, TOP + 0.008, p.z);
        this.dots.add(dot);
      }
  }
  protected place(state: State) {
    this.lay(state);
    this.trail(state);
    const p = squareAt(state.cols, state.rows, state.path[state.path.length - 1]);
    this.knight.position.set(p.x, TOP, p.z);
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1 || state.path.length !== before.path.length + 1) return false;
    this.lay(state);
    this.trail(state, state.path.length - 1);
    const from = squareAt(state.cols, state.rows, before.path[before.path.length - 1]),
      to = squareAt(state.cols, state.rows, state.last);
    // A leap in an arc over whatever lies between, then the step behind it is numbered.
    this.tween(0, 420, (p) => {
      const t = travel(p);
      this.knight.position.set(from.x + (to.x - from.x) * t, TOP + hop(p) * 0.8, from.z + (to.z - from.z) * t);
      if (p === 1) {
        this.onContact();
        this.trail(state);
      }
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const ring = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = point !== null && point !== undefined && point >= 0 && point < state.open.length;
      if (mesh.visible) {
        const p = squareAt(state.cols, state.rows, point!);
        mesh.position.set(p.x, TOP + 0.014, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    ring(this.hintRing, marks.hint?.to);
  }
}
