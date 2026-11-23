import * as T from "three";
import { wood, veneer, glossy, block, fall, hop, travel, capable } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { queenFigure, queenShapes, type QueenShapes } from "./queen";
import { clashPairs, clashing, sizeOf, type State } from "./rules";
import { salon, type Salon } from "./salon";

export const QUEEN_COLORS: [string, string] = ["#ecdcb4", "#1d1a18"];
/** A square's side, the height of its top, and how much smaller a queen stands than a chess queen. */
const CELL = 0.78,
  TOP = 0.21,
  SCALE = 0.92;
/** The eight ways a queen looks along: rows, columns and diagonals. */
const WAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** The centre of a square of a board of `size`. */
export function cellAt(size: number, index: number) {
  const r = Math.floor(index / size),
    c = index % size;
  return { x: (c - (size - 1) / 2) * CELL, z: (r - (size - 1) / 2) * CELL };
}
/** What the camera keeps in view for a board of `size` (shared with the browser test that drags a queen). */
export function queensSubject(size: number, aspect: number): TableSubject {
  const half = size * CELL * 0.5 + 0.3;
  return { half: aspect < 1 ? half : half + 0.4, halfZ: half, height: 1.3, lookY: 0.1, tilt: 0.98 };
}
/** The height of a square's top, where a press is aimed. */
export const QUEEN_TOP = TOP;
/**
 * A chessboard of maple and walnut veneer in a polished rim with a gilt inlay, sized to the puzzle, on a table
 * draped in crimson velvet in a palace drawing room (`salon.ts`), and turned queens in the Staunton manner: the
 * given ones in ebony with a brass ring at the foot, mine in boxwood. Queens that stand in each other's way glow
 * red and a red line runs between them along the line they share; a queen the mouse rests on shows its lines
 * faintly. A queen of mine can be carried to another square by hand. A solved board's queens hop in turn.
 */
export class QueensView extends TableView<State> {
  private size = 0;
  private board = new T.Group();
  private queens = new T.Group();
  private lines = new T.Group();
  private rays = new T.Group();
  private shapes: QueenShapes;
  private paints: { mine: T.Material; given: T.Material; clash: T.Material; brass: T.Material; line: T.MeshBasicMaterial; ray: T.MeshBasicMaterial };
  private meshes = new Map<number, T.Group>();
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  private strip: T.BufferGeometry;
  private hovered = -1;
  /** A queen carried by the pointer: the square it was lifted from and where it is now; then where it was let go. */
  private held: { from: number; x: number; z: number } | null = null;
  private dropped: { x: number; z: number } | null = null;
  private room: Salon;
  private clock = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low", variant = "1") {
    super(host, quality, "#3a1418");
    this.daylight("#fff2d7", "#3a2020", "#fff5df", 8, 2.4);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r),
      size = sizeOf(Number(variant) || 1);
    this.room = salon(this.scene, own, (options) => this.standard(options), size * CELL * 0.5 + 0.25, -0.175);
    this.paints = {
      mine: this.own(glossy({ color: QUEEN_COLORS[0], roughness: 0.4, side: T.DoubleSide })),
      given: this.own(glossy({ color: QUEEN_COLORS[1], roughness: 0.4, side: T.DoubleSide })),
      clash: this.own(glossy({ color: "#e0533e", emissive: "#5a1208", roughness: 0.35, side: T.DoubleSide })),
      brass: this.standard({ color: "#c9a44a", roughness: 0.3, metalness: 0.85 }),
      line: this.own(new T.MeshBasicMaterial({ color: "#ff3b2a", transparent: true, opacity: 0.85, depthWrite: false })),
      ray: this.own(new T.MeshBasicMaterial({ color: "#ffd36a", transparent: true, opacity: 0.45, depthWrite: false })),
    };
    // A strip one unit long along x, laid flat: a line of attack is one, stretched and turned.
    this.strip = this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0));
    // The queen's turned body, its coronet of balls and the ball on top, shared by every queen (and the Amazons).
    this.shapes = queenShapes((r) => this.own(r));
    this.cursor = ringMesh(own, 0.31, 0.35, "#fff2c6");
    this.hintRing = ringMesh(own, 0.3, 0.37, "#ffb21f");
    this.lines.renderOrder = this.rays.renderOrder = 6;
    this.scene.add(this.board, this.lines, this.rays, this.queens, this.cursor, this.hintRing);
    // A carried queen follows the pointer over the squares' tops.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -TOP);
    this.begin();
    // The candles flicker only where a graphics card draws and motion is welcome.
    if (capable() && !this.reducedMotion) this.clock = requestAnimationFrame(this.idle);
  }
  private idle = (now: number) => {
    if (this.disposed) return;
    const t = now / 1000;
    this.room.flames.forEach((flame, i) => flame.scale.set(1, 1 + 0.14 * Math.sin(t * 10 + i * 2) * Math.sin(t * 6.1 + i), 1));
    this.redraw();
    this.clock = requestAnimationFrame(this.idle);
  };
  dispose() {
    cancelAnimationFrame(this.clock);
    super.dispose();
  }
  /** Lays the board out again when the puzzle's size changes. */
  private lay(size: number) {
    if (size === this.size) return;
    this.size = size;
    this.board.clear();
    const span = size * CELL,
      rim = this.add(block(span + 0.5, 0.35, span + 0.5), this.standard({ map: this.own(wood(false)), color: "#b27450", roughness: 0.34 }), 0, 0, 0, this.board),
      light = this.standard({ map: veneer(false), roughness: 0.38, color: "#fff4e0" }),
      dark = this.standard({ map: veneer(true), roughness: 0.38, color: "#9a7458" }),
      gilt = this.standard({ color: "#d4ac4c", roughness: 0.3, metalness: 0.9 });
    // The rim is a lighter, warmer, polished wood than the table under it, so that the board stands apart (the user asked).
    rim.castShadow = rim.receiveShadow = true;
    // A gilt line inlaid in the rim round the squares.
    const edge = span / 2 + 0.08;
    for (const [x, z, w, d] of [[0, -edge, span + 0.2, 0.035], [0, edge, span + 0.2, 0.035], [-edge, 0, 0.035, span + 0.2], [edge, 0, 0.035, span + 0.2]])
      this.add(new T.BoxGeometry(w, 0.01, d), gilt, x, 0.178, z, this.board).castShadow = false;
    // Squares of veneer, each cut from another part of its sheet so that no two have the same grain.
    let cut = 11;
    const sheet = () => (cut = (cut * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < size * size; i++) {
      const tile = new T.BoxGeometry(CELL, 0.035, CELL),
        uv = tile.getAttribute("uv"),
        u0 = sheet() * 0.5,
        v0 = sheet() * 0.5;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.5, v0 + uv.getY(k) * 0.5);
      const p = cellAt(size, i),
        square = this.add(tile, (Math.floor(i / size) + (i % size)) % 2 ? dark : light, p.x, 0.19, p.z, this.board);
      square.castShadow = false;
    }
  }
  /** A queen: the given ones in ebony with a brass ring at the foot, mine in boxwood, red while it stands in another's way. */
  private queen(given: boolean, clash: boolean) {
    // A given queen keeps its ebony; one of mine that stands in another's way glows red.
    const paint = given ? this.paints.given : clash ? this.paints.clash : this.paints.mine,
      g = queenFigure(this.shapes, paint, given ? (clash ? this.paints.clash : this.paints.brass) : undefined);
    g.scale.setScalar(SCALE);
    return g;
  }
  /** A flat line on the board from one place to another, `width` wide. */
  private line(from: { x: number; z: number }, to: { x: number; z: number }, width: number, paint: T.Material, parent: T.Group) {
    const mesh = new T.Mesh(this.strip, paint),
      length = Math.hypot(to.x - from.x, to.z - from.z);
    mesh.position.set(from.x, TOP + 0.016, from.z);
    mesh.rotation.y = -Math.atan2(to.z - from.z, to.x - from.x);
    mesh.scale.set(length, 1, width);
    mesh.renderOrder = 6;
    parent.add(mesh);
    return mesh;
  }
  /** Red lines between every two queens that stand in each other's way, along the line they share. */
  private clashLines(state: State) {
    this.lines.clear();
    // A line touching the queen set last runs from it, so that it can be seen to grow out of it.
    for (const [a, b] of clashPairs(state)) {
      const [from, to] = b === state.last ? [b, a] : [a, b];
      this.line(cellAt(state.size, from), cellAt(state.size, to), 0.07, this.paints.line, this.lines);
    }
  }
  /** The lines of the queen the mouse rests on, faintly, to the board's edge. */
  private showRays(state: State) {
    this.rays.clear();
    const q = this.hovered;
    if (q < 0 || q >= state.queens.length || !state.queens[q] || state.winner !== null || this.held) return;
    const size = state.size,
      r0 = Math.floor(q / size),
      c0 = q % size,
      from = cellAt(size, q);
    for (const [dc, dr] of WAYS) {
      let steps = 0;
      while (r0 + dr * (steps + 1) >= 0 && r0 + dr * (steps + 1) < size && c0 + dc * (steps + 1) >= 0 && c0 + dc * (steps + 1) < size) steps++;
      if (!steps) continue;
      const to = cellAt(size, (r0 + dr * steps) * size + c0 + dc * steps);
      this.line(from, { x: to.x + dc * CELL * 0.35, z: to.z + dr * CELL * 0.35 }, 0.05, this.paints.ray, this.rays);
    }
  }
  protected hover(point: number) {
    this.hovered = point;
    if (this.state) this.showRays(this.state);
  }
  protected subject(aspect: number): TableSubject {
    return queensSubject(this.size || 5, aspect);
  }
  protected spots(): Spot[] {
    const size = this.size;
    return Array.from({ length: size * size }, (_, i) => ({ ...cellAt(size, i), y: TOP, r: CELL * 0.5, point: i }));
  }
  /** The square nearest a place on the board, or -1 off it. */
  private squareNear(at: { x: number; z: number }) {
    const size = this.size,
      c = Math.round(at.x / CELL + (size - 1) / 2),
      r = Math.round(at.z / CELL + (size - 1) / 2);
    return c >= 0 && c < size && r >= 0 && r < size ? r * size + c : -1;
  }
  /** A queen of mine is picked up by the hand and carried to an empty square; let go where it was (a tap) it is taken off. */
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null || point < 0 || !state.queens[point] || state.fixed[point]) return false;
    this.held = { from: point, x: at.x, z: at.z };
    this.rays.clear();
    this.place(state);
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    if (!this.held || !this.state) return;
    const half = this.size * CELL * 0.5 + 0.2;
    this.held.x = Math.max(-half, Math.min(half, at.x));
    this.held.z = Math.max(-half, Math.min(half, at.z));
    const q = this.meshes.get(this.held.from);
    q?.position.set(this.held.x, TOP + 0.5, this.held.z);
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const held = this.held,
      state = this.state;
    this.held = null;
    if (!held || !state) return;
    const to = at ? this.squareNear(at) : -1;
    if (at && to === held.from) {
      // A tap on my queen: it is taken off, as always.
      this.onMove({ from: -1, to: held.from, extra: -1 });
      return;
    }
    if (to < 0 || state.queens[to] || state.fixed[to]) return this.place(state);
    this.dropped = { x: held.x, z: held.z };
    this.onMove({ from: held.from, to, extra: -1 });
  }
  protected place(state: State) {
    const resized = state.size !== this.size;
    this.lay(state.size);
    if (resized) this.resize();
    this.queens.clear();
    this.meshes.clear();
    const clash = new Set(clashing(state));
    state.queens.forEach((on, i) => {
      if (!on) return;
      const q = this.queen(state.fixed[i], clash.has(i)),
        p = this.held?.from === i ? { x: this.held.x, z: this.held.z } : cellAt(state.size, i);
      q.position.set(p.x, TOP + (this.held?.from === i ? 0.5 : 0), p.z);
      this.queens.add(q);
      this.meshes.set(i, q);
    });
    this.clashLines(state);
    this.showRays(state);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (last === null || state.ply !== before.ply + 1 || state.size !== before.size) return false;
    const dropped = this.dropped;
    this.dropped = null;
    this.place(state);
    const q = this.meshes.get(last),
      moved = before.queens.findIndex((on, i) => on && !state.queens[i]),
      lines = [...this.lines.children];
    // A line of a new clash runs out from the queen that made it.
    const grow = (delay: number) => {
      const at = cellAt(state.size, last);
      for (const line of lines) {
        const full = line.scale.x,
          starts = Math.hypot(line.position.x - at.x, line.position.z - at.z) < 0.01;
        line.visible = false;
        this.tween(delay, 260, (p) => {
          line.visible = true;
          line.scale.x = full * (starts ? p : 1);
          ((line as T.Mesh).material as T.MeshBasicMaterial).opacity = 0.85;
        });
      }
    };
    let end = 0;
    if (q && moved >= 0 && state.queens[last] && !before.queens[last]) {
      // Carried: from where it was let go (or, from the keyboard, its old square) it hops onto its new one.
      const from = dropped ?? cellAt(state.size, moved),
        to = cellAt(state.size, last),
        lift = dropped ? 0.5 : 0;
      this.tween(0, 360, (p) => {
        const t = travel(p);
        q.position.set(from.x + (to.x - from.x) * t, TOP + lift * (1 - t) + hop(p) * 0.6, from.z + (to.z - from.z) * t);
        if (p === 1) this.onContact();
      });
      end = 360;
    } else if (q) {
      // Set down: it drops onto its square and settles.
      this.tween(0, 320, (p) => {
        q.position.y = TOP + fall(p) * 1.1;
        if (p === 1) this.onContact();
      });
      end = 320;
    } else {
      // Taken off: it lifts away from its square and is gone.
      const gone = this.queen(false, false),
        p0 = cellAt(state.size, last);
      gone.position.set(p0.x, TOP, p0.z);
      this.queens.add(gone);
      this.tween(0, 220, (p) => {
        gone.position.y = TOP + p * 0.9;
        gone.scale.setScalar(SCALE * (1 - p * 0.9));
        if (p === 1) this.queens.remove(gone);
      });
    }
    if (lines.length) grow(end);
    if (state.winner === 0 && before.winner === null) this.cheer(state, end + 120);
    return true;
  }
  /** Solved: row by row each queen hops and turns, a gold ring blooming at its foot, and a chime rings. */
  private cheer(state: State, delay: number) {
    const order = [...this.meshes.entries()].sort((a, b) => a[0] - b[0]);
    this.tween(delay, 10, () => this.onKnock?.("pocket", 1));
    const shape = this.own(new T.RingGeometry(0.2, 0.34, 32).rotateX(-Math.PI / 2));
    order.forEach(([cell, q], k) => {
      const p0 = cellAt(state.size, cell);
      this.tween(delay + k * 70, 480, (p) => {
        q.position.y = TOP + Math.sin(Math.PI * p) * 0.35;
        q.rotation.y = p * Math.PI * 2;
      });
      // A ring of light blooms under it and fades.
      const ring = new T.Mesh(shape, this.own(new T.MeshBasicMaterial({ color: "#ffd36a", transparent: true, opacity: 0, depthWrite: false })));
      ring.position.set(p0.x, TOP + 0.014, p0.z);
      ring.renderOrder = 6;
      this.lines.add(ring);
      this.tween(delay + k * 70, 700, (p) => {
        ring.scale.setScalar(1 + p * 0.5);
        (ring.material as T.MeshBasicMaterial).opacity = 0.9 * Math.sin(Math.PI * p);
        if (p === 1) this.lines.remove(ring);
      });
    });
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const ring = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = point !== null && point !== undefined && point >= 0 && point < state.size * state.size;
      if (mesh.visible) {
        const p = cellAt(state.size, point!);
        mesh.position.set(p.x, TOP + 0.012, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    ring(this.hintRing, marks.hint?.to);
  }
}
