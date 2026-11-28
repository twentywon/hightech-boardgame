import * as T from "three";
import { block, fall, glossy, planks, veneer, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BIG, CELL3, CELL_C, CELL_U, LAYER_H, boardPos, cellPos, markScale, tttSubject } from "./layout";
import { KEEP, open, type Mode, type State } from "./rules";

export const TTT_COLORS: [string, string] = ["#d8402f", "#2f6fd0"];
/** The grid painted on an acrylic layer of the cube: four by four, white lines on clear. */
function layerGrid() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 64, 6);
    ctx.lineTo(i * 64, 250);
    ctx.moveTo(6, i * 64);
    ctx.lineTo(250, i * 64);
    ctx.stroke();
  }
  ctx.strokeRect(3, 3, 250, 250);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/**
 * Tic-tac-toe on a café table: a maple board with raised walnut bars for three by three, a larger one of nine
 * small boards for the ultimate game, and four clear layers on brass posts, each set back from the one below, for
 * the cube. X is two crossed red bars, O a blue ring, both glazed. Small boards won carry a large mark; the
 * winning line is drawn as a gold bar; in the vanishing game the mark that will go next is faded.
 */
export class TicTacToeView extends TableView<State> {
  private mode: Mode | null = null;
  private board = new T.Group();
  private drawn = new T.Group();
  private extras = new T.Group();
  private kit: { cross: T.BufferGeometry; ring: T.BufferGeometry; paint: T.Material[]; faded: T.Material[]; ghost: T.Material[]; bar: T.Material; gold: T.Material; frame: T.Material; draw: T.Material };
  private pieces = new Map<number, T.Group>();
  private cursor: T.Mesh;
  private ghostMark: T.Group | null = null;
  private hovered = -1;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#dfd2bf");
    this.daylight("#fff8ea", "#a99a86", "#fff2d8", 8, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The café table, a cup of coffee and a pencil.
    const table = this.add(new T.BoxGeometry(40, 0.4, 30), this.standard(planks(8, keep)), 0, -0.55, 0);
    table.castShadow = false;
    const china = this.standard({ color: "#f6f2ea", roughness: 0.35 });
    this.add(new T.CylinderGeometry(0.42, 0.34, 0.8, 28), china, 5.4, 0.05, -2.6);
    this.add(new T.CylinderGeometry(0.36, 0.36, 0.02, 28), this.standard({ color: "#4a2a18", roughness: 0.2 }), 5.4, 0.42, -2.6);
    this.add(new T.TorusGeometry(0.2, 0.05, 10, 20, Math.PI), china, 5.82, 0.05, -2.6).rotation.z = -Math.PI / 2;
    this.add(new T.CylinderGeometry(0.75, 0.7, 0.05, 32), china, 5.4, -0.33, -2.6);
    const pencil = this.add(new T.CylinderGeometry(0.06, 0.06, 2.2, 6), this.standard({ color: "#f2c230", roughness: 0.5 }), -5.2, -0.29, 2.4);
    pencil.rotation.set(0, 0.5, Math.PI / 2);
    this.kit = {
      cross: keep(block(0.92, 0.14, 0.22, 0.06)),
      ring: keep(new T.TorusGeometry(0.31, 0.09, 14, 40).rotateX(Math.PI / 2)),
      paint: TTT_COLORS.map((color) => keep(glossy({ color, roughness: 0.35 }, 0.6))),
      faded: TTT_COLORS.map((color) => keep(new T.MeshStandardMaterial({ color, roughness: 0.4, transparent: true, opacity: 0.38 }))),
      ghost: TTT_COLORS.map((color) => keep(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }))),
      bar: this.standard({ map: keep(wood(true)), roughness: 0.4 }),
      gold: keep(new T.MeshStandardMaterial({ color: "#ffd24a", emissive: "#ffb000", emissiveIntensity: 0.9, roughness: 0.3 })),
      frame: keep(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.85 })),
      draw: keep(new T.MeshStandardMaterial({ color: "#8a8a8a", transparent: true, opacity: 0.45, roughness: 0.8 })),
    };
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.3, 0.36, "#ffffff");
    this.scene.add(this.board, this.drawn, this.extras, this.cursor);
    this.begin();
  }
  /** Lays out the board of a mode when the mode changes. */
  private lay(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.board.clear();
    this.drawn.clear();
    this.pieces.clear();
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      maple = this.standard({ map: keep(veneer(false)), color: "#fff4e0", roughness: 0.4 }),
      rim = this.standard({ map: keep(wood(false)), color: "#b27450", roughness: 0.38 }),
      bar = this.kit.bar,
      put = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number) => this.add(geometry, material, x, y, z, this.board);
    if (mode === "cube") {
      // A wooden base, four clear layers, and brass posts from corner to corner between them.
      const acrylic = keep(new T.MeshStandardMaterial({ color: "#d9ecff", roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.32, depthWrite: false })),
        grid = keep(new T.MeshBasicMaterial({ map: keep(layerGrid()), transparent: true, depthWrite: false })),
        brass = this.standard({ color: "#c9a44a", roughness: 0.3, metalness: 0.8 }),
        side = CELL_C * 4 + 0.2;
      const centres = [0, 1, 2, 3].map((l) => {
        const a = cellPos("cube", l * 16),
          b = cellPos("cube", l * 16 + 15);
        return new T.Vector3((a.x + b.x) / 2, l * LAYER_H, (a.z + b.z) / 2);
      });
      for (const c of centres) {
        const plate = put(block(side, 0.05, side, 0.02), acrylic, c.x, c.y - 0.03, c.z);
        plate.castShadow = false;
        plate.renderOrder = 1;
        const lines = put(new T.PlaneGeometry(side - 0.2, side - 0.2).rotateX(-Math.PI / 2), grid, c.x, c.y + 0.002, c.z);
        lines.castShadow = false;
        lines.renderOrder = 2;
      }
      // A wooden base under the lowest layer.
      put(block(side + 0.4, 0.3, side + 0.4, 0.1), rim, centres[0].x, -0.22, centres[0].z);
      const post = keep(new T.CylinderGeometry(0.035, 0.035, 1, 8).translate(0, 0.5, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        for (let l = 0; l < 4; l++) {
          const from = centres[l - 1] ?? new T.Vector3(centres[0].x, -0.05, centres[0].z),
            to = centres[l],
            a = new T.Vector3(from.x + (sx * side) / 2 - sx * 0.08, from.y, from.z + (sz * side) / 2 - sz * 0.08),
            b = new T.Vector3(to.x + (sx * side) / 2 - sx * 0.08, to.y - 0.05, to.z + (sz * side) / 2 - sz * 0.08),
            way = b.clone().sub(a),
            mesh = new T.Mesh(post, brass);
          mesh.position.copy(a);
          mesh.scale.set(1, way.length(), 1);
          mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), way.normalize());
          mesh.castShadow = true;
          this.board.add(mesh);
        }
      return;
    }
    const big = mode === "ultimate",
      side = big ? BIG * 3 + 0.4 : CELL3 * 3 + 0.4;
    put(block(side + 0.3, 0.3, side + 0.3, 0.1), rim, 0, -0.17, 0);
    put(block(side, 0.04, side, 0.02), maple, 0, -0.0, 0).castShadow = false;
    // Raised bars of walnut: between the cells, and thicker between the small boards of the ultimate game.
    const bars = (centre: { x: number; z: number }, gap: number, length: number, thick: number, high: number) => {
      for (const s of [-0.5, 0.5]) {
        put(block(length, high, thick, thick * 0.4), bar, centre.x, high / 2, centre.z + s * gap);
        put(block(thick, high, length, thick * 0.4), bar, centre.x + s * gap, high / 2, centre.z);
      }
    };
    if (big) {
      bars({ x: 0, z: 0 }, BIG, side - 0.3, 0.14, 0.12);
      for (let b = 0; b < 9; b++) bars(boardPos(b), CELL_U, BIG - 0.45, 0.05, 0.05);
    } else bars({ x: 0, z: 0 }, CELL3, side - 0.4, 0.1, 0.09);
  }
  /** A mark: two crossed bars for X, a ring for O, `scale` times its size. */
  private mark3d(side: 0 | 1, scale: number, paint = this.kit.paint[side]) {
    const g = new T.Group();
    if (side === 0)
      for (const turn of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new T.Mesh(this.kit.cross, paint);
        bar.rotation.y = turn;
        bar.position.y = 0.07;
        bar.castShadow = true;
        g.add(bar);
      }
    else {
      const ring = new T.Mesh(this.kit.ring, paint);
      ring.position.y = 0.09;
      ring.castShadow = true;
      g.add(ring);
    }
    g.scale.setScalar(scale);
    return g;
  }
  private put(state: State, cell: number, side: 0 | 1) {
    const g = this.mark3d(side, markScale(state.mode)),
      p = cellPos(state.mode, cell);
    g.position.set(p.x, p.y, p.z);
    this.drawn.add(g);
    this.pieces.set(cell, g);
    return g;
  }
  protected subject(aspect: number): TableSubject {
    return tttSubject(this.mode ?? "classic", aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const r = (state.mode === "ultimate" ? CELL_U : state.mode === "cube" ? CELL_C : CELL3) * 0.5;
    return state.cells.map((_, cell) => ({ ...cellPos(state.mode, cell), y: cellPos(state.mode, cell).y + 0.05, r, point: cell }));
  }
  protected place(state: State) {
    const resized = state.mode !== this.mode;
    this.lay(state.mode);
    if (resized) this.resize();
    this.drawn.clear();
    this.pieces.clear();
    this.extras.clear();
    state.cells.forEach((owner, cell) => {
      if (owner !== null) this.put(state, cell, owner);
    });
    // The vanishing game: the oldest mark of the side to move, which goes when it sets its next one, is faded.
    if (state.mode === "vanish" && state.winner === null && state.order[state.turn].length >= KEEP) {
      const next = this.pieces.get(state.order[state.turn][0]);
      next?.traverse((o) => {
        if (o instanceof T.Mesh) o.material = this.kit.faded[state.turn];
      });
    }
    if (state.mode === "ultimate") {
      state.boards.forEach((owner, b) => {
        const at = boardPos(b);
        if (owner === 0 || owner === 1) {
          // A small board taken: its own large mark stands over it.
          const big = this.mark3d(owner, 2.6);
          big.position.set(at.x, 0.12, at.z);
          this.extras.add(big);
        } else if (owner === "draw") this.add(block(BIG - 0.2, 0.03, BIG - 0.2, 0.02), this.kit.draw, at.x, 0.1, at.z, this.extras).castShadow = false;
      });
      // The small boards the next mark may go in are framed in gold.
      if (state.winner === null) {
        const where = new Set(open(state).map((cell) => Math.floor(cell / 9)));
        for (const b of where) {
          const at = boardPos(b),
            frame = new T.Mesh(this.own(new T.RingGeometry(BIG * 0.62, BIG * 0.68, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2)), this.kit.frame);
          frame.position.set(at.x, 0.14, at.z);
          frame.scale.set(1.0, 1, 1.0);
          this.extras.add(frame);
        }
      }
    }
    // The line that decided the game, as a gold bar from its first cell to its last.
    if (state.line && state.winner !== null && state.winner !== "draw") {
      const ends = state.mode === "ultimate" ? [boardPos(state.line[0]), boardPos(state.line[state.line.length - 1])] : [cellPos(state.mode, state.line[0]), cellPos(state.mode, state.line[state.line.length - 1])],
        lift = state.mode === "ultimate" ? 0.5 : 0.24 * markScale(state.mode),
        a = new T.Vector3(ends[0].x, ends[0].y + lift, ends[0].z),
        b = new T.Vector3(ends[1].x, ends[1].y + lift, ends[1].z),
        way = b.clone().sub(a),
        reach = way.length() + (state.mode === "ultimate" ? BIG * 0.7 : 0.6),
        bar = new T.Mesh(this.own(new T.CylinderGeometry(0.06, 0.06, reach, 12)), this.kit.gold);
      bar.position.copy(a).add(b).multiplyScalar(0.5);
      bar.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), way.normalize());
      this.extras.add(bar);
    }
    this.showGhost();
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    this.place(state);
    const piece = this.pieces.get(state.last.cell),
      line = this.extras.children.filter((o) => o instanceof T.Mesh && o.material === this.kit.gold);
    if (!piece) return false;
    const rest = piece.position.y;
    for (const o of line) o.visible = false;
    // The mark drops into its cell; one that vanishes shrinks away first.
    if (before.last !== state.last && state.last.gone !== null) {
      const goneSide = before.cells[state.last.gone] as 0 | 1,
        gone = this.mark3d(goneSide, markScale(state.mode), this.kit.faded[goneSide]),
        p = cellPos(state.mode, state.last.gone);
      gone.position.set(p.x, p.y, p.z);
      this.drawn.add(gone);
      this.tween(0, 260, (t) => {
        gone.scale.setScalar(markScale(state.mode) * (1 - t));
        if (t === 1) gone.removeFromParent();
      });
    }
    this.tween(0, 320, (t) => {
      piece.position.y = rest + fall(t) * 1.2;
      if (t === 1) {
        piece.position.y = rest;
        this.onContact();
        for (const o of line) o.visible = true;
      }
    });
    return true;
  }
  /** A faint mark of the side to move over the empty cell the mouse is on, where it would go. */
  private showGhost() {
    this.ghostMark?.removeFromParent();
    this.ghostMark = null;
    const state = this.state;
    if (!state || state.winner !== null || this.hovered < 0 || !this.marks.targets.includes(this.hovered)) return;
    this.ghostMark = this.mark3d(state.turn, markScale(state.mode), this.kit.ghost[state.turn]);
    const p = cellPos(state.mode, this.hovered);
    this.ghostMark.position.set(p.x, p.y, p.z);
    this.ghostMark.traverse((o) => (o.castShadow = false));
    this.scene.add(this.ghostMark);
  }
  protected hover(point: number) {
    this.hovered = point;
    this.showGhost();
  }
  protected mark(marks: Marks) {
    const state = this.state;
    this.cursor.visible = !!state && marks.cursor !== null && marks.cursor >= 0;
    if (state && this.cursor.visible) {
      const p = cellPos(state.mode, marks.cursor!),
        s = markScale(state.mode);
      this.cursor.position.set(p.x, p.y + 0.02, p.z);
      this.cursor.scale.setScalar(s * 1.2);
    }
    this.showGhost();
  }
}
