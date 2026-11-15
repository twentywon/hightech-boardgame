import * as T from "three";
import { planks, block, stuff } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { REMOVE, SET, clashes, clueState, put, type State } from "./rules";

export const SKYLINE_COLORS: [string, string] = ["#e8edf2", "#3d5a80"];
/** A plot's side, a storey's height, a building's width, the height of the block's top, how far out the numbers lie. */
const CELL = 0.92,
  STOREY = 0.19,
  WIDE = 0.62,
  TOP = 0.14,
  OUT = 0.66;
/** Each height has its own colour, from a low brick house to a tall blue glass tower. */
const TONES = ["", "#a8896a", "#d9a441", "#6aa36f", "#4f8fc9", "#8b6cc6", "#3a9f98"];
/** The centre of a plot. */
export function plotAt(size: number, index: number) {
  const r = Math.floor(index / size),
    c = index % size;
  return { x: (c - (size - 1) / 2) * CELL, z: (r - (size - 1) / 2) * CELL };
}
/** Where the number of line `k` lies, outside the block's edge. */
function clueAt(size: number, k: number) {
  const side = Math.floor(k / size),
    i = k % size,
    half = (size * CELL) / 2 + OUT,
    along = (i - (size - 1) / 2) * CELL;
  // The far numbers lie a little further out, clear of the tall buildings of the far row.
  return side === 0 ? { x: along, z: -half - 0.22 } : side === 1 ? { x: half, z: along } : side === 2 ? { x: along, z: half } : { x: -half, z: along };
}
/** What the camera frames for a block of `size` (browser tests aim with it too). */
export function skylineSubject(size: number, aspect: number): TableSubject {
  const half = (size * CELL) / 2 + OUT + 0.4;
  // Deep enough for the row of buildings in front, and high enough for the tallest.
  return { half: aspect < 1 ? half : half + 0.3, halfZ: half + 1.15, height: size * STOREY, lookY: 0.1, tilt: 1.08 };
}
/** Where a building of each height stands in the row in front of the block, to be dragged from. */
export function stockAt(size: number, height: number) {
  return { x: (height - (size + 1) / 2) * Math.min(1.0, (size * CELL + 1.2) / size), z: (size * CELL) / 2 + OUT + 0.95 };
}
/**
 * A model city block on a table: plots of pale paving between dark streets, and on each plot a building of one to
 * n storeys, every storey a band of lit windows, the height painted on its roof. Numbers lie on plates round the
 * edge (green once their line is built and right, red when it cannot be), buildings of a height met twice in a row
 * or a column glow red, and a row of buildings of every height stands in front to be dragged onto the plots.
 */
export class SkylineView extends TableView<State> {
  private size = 0;
  private built = "";
  private board = new T.Group();
  private towns = new T.Group();
  private plates: T.Mesh[] = [];
  private meshes = new Map<number, T.Group>();
  private numbers = new Map<string, T.Material>();
  private paints = new Map<string, T.Material[]>();
  private plate: T.BufferGeometry;
  /** Shapes shared by every building: a body for each height, the parapet, the roof. */
  private bodies = new Map<number, T.BufferGeometry>();
  private capShape: T.BufferGeometry;
  private roofShape: T.BufferGeometry;
  private trim: T.Material;
  private stock: { x: number; z: number }[] = [];
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  private stockRing: T.Mesh;
  private target: T.Mesh;
  private carry: { height: number; from: number; tower: T.Group; moved: boolean; start: { x: number; z: number } } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1d2229");
    this.daylight("#dfe8f4", "#2c2a28", "#fff0d8", 8, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...planks(8, keep), color: "#a99a88" }), 0, -0.2, 0).castShadow = false;
    this.plate = this.own(block(0.5, 0.06, 0.5, 0.025));
    this.capShape = this.own(new T.BoxGeometry(WIDE + 0.04, 0.035, WIDE + 0.04));
    this.roofShape = this.own(new T.PlaneGeometry(WIDE - 0.04, WIDE - 0.04));
    this.trim = this.standard({ color: "#3a3f46", roughness: 0.5, metalness: 0.3 });
    this.cursor = ringMesh(keep, 0.38, 0.44, "#ffffff");
    this.hintRing = ringMesh(keep, 0.37, 0.45, "#ffb21f");
    this.stockRing = ringMesh(keep, 0.34, 0.42, "#ffb21f");
    this.target = ringMesh(keep, 0.38, 0.45, "#7fe0a0");
    this.scene.add(this.board, this.towns, this.cursor, this.hintRing, this.stockRing, this.target);
    // The hand is followed on the block's top.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -TOP);
    this.begin();
  }
  /** One storey of a building: a band of windows on its colour, repeated up the walls. */
  private paintsOf(height: number, clash: boolean) {
    const key = `${height}|${clash}`;
    let paint = this.paints.get(key);
    if (!paint) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = clash ? "#e0392b" : TONES[height];
      ctx.fillRect(0, 0, 128, 64);
      // A ledge at each floor, and windows lit warm or dark at random but always the same for a height.
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(0, 58, 128, 6);
      const windows = height >= 4 ? 4 : 3;
      for (let i = 0; i < windows; i++) {
        const w = 128 / windows,
          lit = (height * 7 + i * 3) % 5 < 2;
        ctx.fillStyle = lit ? "#ffe4a0" : height >= 4 ? "#a9d3f2" : "#3b4752";
        ctx.fillRect(i * w + w * 0.2, 14, w * 0.6, 32);
      }
      const side = this.own(new T.CanvasTexture(canvas));
      side.colorSpace = T.SRGBColorSpace;
      side.wrapT = T.RepeatWrapping;
      side.repeat.set(1, height);
      side.anisotropy = 4;
      // The roof: flat and dark, with the height written large on it.
      const roofCanvas = document.createElement("canvas");
      roofCanvas.width = roofCanvas.height = 128;
      const r = roofCanvas.getContext("2d")!;
      r.fillStyle = "#4a4f57";
      r.fillRect(0, 0, 128, 128);
      r.strokeStyle = clash ? "#ff7a6a" : TONES[height];
      r.lineWidth = 12;
      r.strokeRect(6, 6, 116, 116);
      r.fillStyle = "#ffffff";
      r.font = '800 82px Inter, "Noto Sans KR", Arial, sans-serif';
      r.textAlign = "center";
      r.textBaseline = "middle";
      r.fillText(String(height), 64, 70);
      const roof = this.own(new T.CanvasTexture(roofCanvas));
      roof.colorSpace = T.SRGBColorSpace;
      roof.anisotropy = 4;
      const wall = this.standard({ map: side, roughness: 0.6, emissive: clash ? "#8a1208" : "#000000" }),
        top = this.standard({ map: roof, roughness: 0.7 });
      paint = [wall, wall, top, wall, wall, wall];
      this.paints.set(key, paint);
    }
    return paint;
  }
  /** A building of `height` storeys, its foot at 0. */
  private tower(height: number, clash = false) {
    const group = new T.Group(),
      tall = height * STOREY,
      paint = this.paintsOf(height, clash);
    let shape = this.bodies.get(height);
    if (!shape) {
      shape = this.own(new T.BoxGeometry(WIDE, tall, WIDE));
      this.bodies.set(height, shape);
    }
    const body = new T.Mesh(shape, paint);
    body.position.y = tall / 2;
    body.castShadow = body.receiveShadow = true;
    // A dark parapet round the roof's edge.
    const cap = new T.Mesh(this.capShape, this.trim);
    cap.position.y = tall + 0.005;
    const roof = new T.Mesh(this.roofShape, paint[2]);
    roof.rotation.x = -Math.PI / 2;
    roof.position.y = tall + 0.024;
    group.add(body, cap, roof);
    return group;
  }
  private label(text: string, tone: "open" | "done" | "over" | "none") {
    const key = `${text}|${tone}`;
    let material = this.numbers.get(key);
    if (!material) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = tone === "done" ? "#2f7d4a" : tone === "over" ? "#a3241c" : tone === "none" ? "#5b6068" : "#f2ead6";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = tone === "open" ? "#22262c" : "#fff6e0";
      ctx.font = '800 84px Inter, "Noto Sans KR", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 70);
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      material = this.standard({ map: texture, roughness: 0.5 });
      this.numbers.set(key, material);
    }
    return [this.trim, this.trim, material, this.trim, this.trim, this.trim];
  }
  /** Builds the block, its plots and number plates, and the row of buildings in front, when the puzzle changes. */
  private lay(state: State) {
    const key = `${state.size}:${state.clues.join(",")}:${state.fixed.map(Number).join("")}`;
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    this.board.clear();
    const n = state.size,
      span = n * CELL,
      keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The block: a plinth of streets (dark asphalt) and a pale paved plot for each building.
    const street = new T.Mesh(this.own(block(span + 0.36, 0.24, span + 0.36, 0.06)), this.standard({ ...stuff("gravel", "#3c4046", 1.2, keep), roughness: 0.95 }));
    street.position.y = TOP - 0.12;
    street.receiveShadow = street.castShadow = true;
    this.board.add(street);
    const paving = this.standard({ ...stuff("stone", "#cfcac0", 0.6, keep), roughness: 0.9 }),
      square = this.own(block(CELL * 0.86, 0.03, CELL * 0.86, 0.02));
    for (let i = 0; i < n * n; i++) {
      const p = plotAt(n, i),
        tile = new T.Mesh(square, paving);
      tile.position.set(p.x, TOP + 0.005, p.z);
      tile.receiveShadow = true;
      this.board.add(tile);
      // A building standing from the start sits on a dark stone base.
      if (state.fixed[i]) {
        const base = new T.Mesh(this.own(block(WIDE + 0.14, 0.04, WIDE + 0.14, 0.02)), this.trim);
        base.position.set(p.x, TOP + 0.03, p.z);
        base.receiveShadow = true;
        this.board.add(base);
      }
    }
    // The numbers, on plates lying outside the edge; a side without a number shows a blank grey plate.
    this.plates = state.clues.map((clue, k) => {
      const at = clueAt(n, k),
        plate = new T.Mesh(this.plate, this.label(clue ? String(clue) : "", clue ? "open" : "none"));
      plate.position.set(at.x, 0.03, at.z);
      plate.castShadow = true;
      if (!clue) plate.scale.set(0.6, 1, 0.6);
      this.board.add(plate);
      return plate;
    });
    // In front: a building of every height, to be dragged onto a plot.
    this.stock = [];
    for (let h = 1; h <= n; h++) {
      const at = stockAt(n, h),
        tower = this.tower(h);
      tower.scale.setScalar(0.85);
      tower.position.set(at.x, 0, at.z);
      this.board.add(tower);
      this.stock[h] = at;
    }
    if (resized) this.resize();
  }
  protected subject(aspect: number): TableSubject {
    return skylineSubject(this.size || 4, aspect);
  }
  /** The buildings in front (points 101 and on) and every plot. */
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const stock = this.stock.flatMap((at, h) => (at ? [{ ...at, y: h * STOREY * 0.45, r: 0.45, point: 100 + h }] : []));
    return [...stock, ...state.cells.map((h, i) => ({ ...plotAt(state.size, i), y: TOP + Math.max(0.1, h * STOREY * 0.5), r: CELL * 0.55, point: i }))];
  }
  /** The plot under a point of the block's top, or −1 off the block. */
  private cellAt(at: { x: number; z: number }) {
    const n = this.size,
      c = Math.round(at.x / CELL + (n - 1) / 2),
      r = Math.round(at.z / CELL + (n - 1) / 2);
    return r >= 0 && r < n && c >= 0 && c < n && Math.abs(at.x - plotAt(n, r * n + c).x) <= CELL * 0.6 && Math.abs(at.z - plotAt(n, r * n + c).z) <= CELL * 0.6 ? r * n + c : -1;
  }
  /**
   * A building is taken from the row in front, or off a plot of mine, and carried; a press on a building that is let
   * go where it began is a tap (a storey more). A press on an empty plot is left to the tap.
   */
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null || point < 0) return false;
    let height = 0,
      from = -1;
    if (point > 100) height = point - 100;
    else if (!state.fixed[point] && state.cells[point]) {
      height = state.cells[point];
      from = point;
    }
    if (!height) return false;
    const tower = this.tower(height);
    tower.visible = false;
    this.scene.add(tower);
    this.carry = { height, from, tower, moved: false, start: { x: at.x, z: at.z } };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const carry = this.carry,
      state = this.state;
    if (!carry || !state) return;
    if (!carry.moved && Math.hypot(at.x - carry.start.x, at.z - carry.start.z) < 0.18) return;
    if (!carry.moved) {
      carry.moved = true;
      carry.tower.visible = true;
      if (carry.from >= 0) this.meshes.get(carry.from)?.removeFromParent();
    }
    carry.tower.position.set(at.x, TOP + 0.35, at.z);
    const cell = this.cellAt(at),
      ok = cell >= 0 && !state.fixed[cell];
    this.target.visible = ok;
    if (ok) {
      const p = plotAt(state.size, cell);
      this.target.position.set(p.x, TOP + 0.03, p.z);
    }
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const carry = this.carry,
      state = this.state;
    this.carry = null;
    this.target.visible = false;
    if (!carry || !state) return;
    carry.tower.removeFromParent();
    // Not carried anywhere: a tap on a building of mine raises it a storey.
    if (!carry.moved) {
      if (at && carry.from >= 0) this.onMove({ from: -1, to: carry.from, extra: -1 });
      return;
    }
    const cell = at ? this.cellAt(at) : -1,
      fits = cell >= 0 && !state.fixed[cell];
    if (fits && cell !== carry.from) this.onMove({ from: carry.from, to: put(cell, carry.height), extra: -1 });
    else if (cell < 0 && carry.from >= 0 && at) this.onMove({ from: carry.from, to: REMOVE, extra: -1 });
    else this.place(state);
  }
  protected place(state: State) {
    this.lay(state);
    this.towns.clear();
    this.meshes.clear();
    const clash = clashes(state);
    state.cells.forEach((h, i) => {
      if (!h) return;
      const p = plotAt(state.size, i),
        tower = this.tower(h, clash[i]);
      tower.position.set(p.x, TOP + (state.fixed[i] ? 0.05 : 0.02), p.z);
      this.towns.add(tower);
      this.meshes.set(i, tower);
    });
    state.clues.forEach((clue, k) => {
      if (clue) this.plates[k].material = this.label(String(clue), clueState(state, k));
    });
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    this.place(state);
    const tower = this.meshes.get(state.last);
    if (!tower) return false;
    // The new building rises out of its plot.
    this.tween(0, 240, (p) => {
      const e = 1 - (1 - p) ** 3;
      tower.scale.set(1, Math.max(0.05, e), 1);
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const ring = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = point !== null && point !== undefined && point >= 0 && point < state.cells.length;
      if (mesh.visible) {
        const p = plotAt(state.size, point!);
        mesh.position.set(p.x, TOP + 0.03, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    // A hint names a plot and the building for it: a ring on the plot and one under that building in front.
    const hinted = marks.hint && marks.hint.to >= SET ? marks.hint.to - SET : null;
    ring(this.hintRing, hinted === null ? null : Math.floor(hinted / 8));
    const height = hinted === null ? 0 : hinted % 8;
    this.stockRing.visible = !!height && !!this.stock[height];
    if (this.stockRing.visible) this.stockRing.position.set(this.stock[height].x, 0.02, this.stock[height].z);
  }
}
