import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { DOWN, DROP, H, LEFT, RIGHT, TICK, TURN, W, cells, interval, landing, level, type Piece, type State } from "./rules";

export const BLOCK_COLORS: [string, string] = ["#d9614c", "#b9b3a4"];
/** The side of a square, and the paint of each of the seven pieces: toy blocks, not neon. */
const CELL = 0.6,
  PAINT = ["#d9614c", "#2f9f8f", "#e0a92a", "#4b5fb5", "#7a9a3a", "#8a4f9a", "#3f9ad0"];
const cx = (x: number) => (x - (W - 1) / 2) * CELL,
  cz = (y: number) => (y - (H - 1) / 2) * CELL;
/**
 * The well lies on a play mat, seen from above: its top is the far end and
 * the pieces come down toward me. The view keeps the clock (a fall every so
 * often, sooner at higher levels) and turns swipes into moves.
 */
export class BlocksView extends TableView<State> {
  private box: T.BufferGeometry;
  private paints: T.Material[];
  private ghostPaint: T.Material;
  private heap: T.Mesh[] = [];
  private falling: T.Mesh[] = [];
  private ghost: T.Mesh[] = [];
  private coming: T.Mesh[] = [];
  private ticker = 0;
  private since = performance.now();
  /** A drag in progress: where it began, when, and how many squares of it have been made into moves. */
  private drag: { x: number; z: number; at: number; across: number; down: number; moved: boolean } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#d8d2c4");
    this.daylight("#ffffff", "#9a9488", "#fff2d8", 9, 2.0);
    // A nursery floor and a felt mat; the well is a shallow wooden tray open at the far end.
    const boards = this.own(wood());
    boards.repeat.set(5, 5);
    this.add(new T.BoxGeometry(60, 0.4, 44), this.standard({ map: boards, color: "#e6d2ae", roughness: 0.7 }), 0, -0.52, 0).castShadow = false;
    this.add(new T.BoxGeometry(W * CELL + 7.4, 0.06, H * CELL + 1.6), this.standard({ color: "#5d7f8c", roughness: 1 }), 1.2, -0.29, 0).castShadow = false;
    const rail = this.standard({ map: this.own(wood(true)), roughness: 0.5 }),
      wide = W * CELL,
      deep = H * CELL;
    this.add(new T.BoxGeometry(wide, 0.1, deep), this.standard({ color: "#f4efe2", roughness: 0.9 }), 0, -0.21, 0).castShadow = false;
    for (const side of [-1, 1]) this.add(new T.BoxGeometry(0.22, 0.5, deep + 0.22), rail, side * (wide / 2 + 0.11), -0.01, 0.11);
    this.add(new T.BoxGeometry(wide + 0.44, 0.5, 0.22), rail, 0, -0.01, deep / 2 + 0.11);
    // Faint lines between the columns help to see where a piece will come down.
    const line = this.standard({ color: "#d9d2bf", roughness: 1 });
    for (let x = 1; x < W; x++) this.add(new T.BoxGeometry(0.02, 0.01, deep), line, (x - W / 2) * CELL, -0.155, 0).castShadow = false;
    // Where the next piece waits: a small tray beside the well.
    this.add(new T.BoxGeometry(3.2, 0.1, 2.6), this.standard({ color: "#f4efe2", roughness: 0.9 }), wide / 2 + 2.6, -0.21, -deep / 2 + 2.2).castShadow = false;
    this.box = this.own(new T.BoxGeometry(CELL * 0.94, CELL * 0.8, CELL * 0.94));
    this.paints = PAINT.map((color) => this.standard({ color, roughness: 0.45 }));
    this.ghostPaint = this.standard({ color: "#3a4a52", transparent: true, opacity: 0.18, depthWrite: false });
    const block = (paint: T.Material, shadow = true) => {
      const mesh = new T.Mesh(this.box, paint);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    for (let i = 0; i < W * H; i++) {
      const mesh = block(this.paints[0]);
      mesh.position.set(cx(i % W), CELL * 0.4 - 0.16, cz(Math.floor(i / W)));
      this.heap.push(mesh);
    }
    for (let i = 0; i < 4; i++) {
      this.ghost.push(block(this.ghostPaint, false));
      this.falling.push(block(this.paints[0]));
      this.coming.push(block(this.paints[0]));
    }
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      const now = performance.now(),
        state = this.state;
      // The clock stands while a window is open, the page is hidden or the game is over.
      if (!state || state.winner !== null || document.hidden || document.querySelector("dialog[open]")) {
        this.since = now;
        return;
      }
      if (now - this.since >= interval(level(state))) {
        this.since = now;
        this.onMove({ from: -1, to: TICK, extra: -1 });
      }
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The well never makes the screen wait. */
  get animating() {
    return false;
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 4.4 : 6.4, halfZ: H * CELL * 0.5 + 0.5, height: 0.6, lookY: 0, tilt: 1.3 };
  }
  protected spots(): Spot[] {
    return [];
  }
  private lay(meshes: T.Mesh[], piece: Piece | null, paint: T.Material | null, dx = 0, dz = 0) {
    const squares = piece ? cells(piece) : [];
    meshes.forEach((mesh, i) => {
      const square = squares[i];
      // A square still above the top of the well is not drawn.
      mesh.visible = !!square && (dx !== 0 || square[1] >= 0);
      if (!square) return;
      if (paint) mesh.material = paint;
      mesh.position.set(cx(square[0]) + dx, CELL * 0.4 - 0.16, cz(square[1]) + dz);
    });
  }
  protected place(state: State) {
    state.grid.forEach((kind, i) => {
      this.heap[i].visible = kind > 0;
      if (kind) this.heap[i].material = this.paints[kind - 1];
    });
    const rest = landing(state);
    this.lay(this.ghost, rest && state.piece && rest.y !== state.piece.y ? rest : null, null);
    this.lay(this.falling, state.piece, state.piece ? this.paints[state.piece.kind] : null);
    // The next piece, in the middle of its tray.
    const size = state.next === 0 ? 4 : state.next === 1 ? 2 : 3;
    this.lay(this.coming, state.winner === null ? { kind: state.next, rot: 0, x: 0, y: 0 } : null, this.paints[state.next], (W * CELL) / 2 + 2.6 - cx((size - 1) / 2), (-H * CELL) / 2 + 2.2 - cz(state.next === 0 ? 1 : 0.5));
  }
  protected animate(before: State, state: State) {
    // Nothing is drawn out in time; a piece coming to rest is heard, and the clock starts again for the new one.
    if (state.last?.locked && state.ply === before.ply + 1) {
      this.onContact();
      this.since = performance.now();
    }
    return false;
  }
  /** A finger on the mat: across moves the piece column by column, toward me brings it down, a flick toward me drops it, a tap turns it. */
  protected dragStart(_point: number, at: { x: number; z: number }) {
    this.drag = { ...at, at: performance.now(), across: 0, down: 0, moved: false };
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    const drag = this.drag;
    if (!drag) return;
    const across = Math.round((at.x - drag.x) / CELL),
      down = Math.max(0, Math.floor((at.z - drag.z) / CELL));
    while (drag.across !== across) {
      const way = across > drag.across ? 1 : -1;
      drag.across += way;
      drag.moved = true;
      this.onMove({ from: -1, to: way > 0 ? RIGHT : LEFT, extra: -1 });
    }
    // Brought down by hand only when the finger has clearly gone that way and is not in the middle of a flick.
    while (drag.down < down && performance.now() - drag.at > 220) {
      drag.down++;
      drag.moved = true;
      this.onMove({ from: -1, to: DOWN, extra: -1 });
    }
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const drag = this.drag;
    this.drag = null;
    if (!drag || !at) return;
    const dx = at.x - drag.x,
      dz = at.z - drag.z;
    if (performance.now() - drag.at <= 220 && dz > CELL * 2.5 && dz > Math.abs(dx) * 1.5) this.onMove({ from: -1, to: DROP, extra: -1 });
    else if (!drag.moved && Math.hypot(dx, dz) < CELL * 0.6) this.onMove({ from: -1, to: TURN, extra: -1 });
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
