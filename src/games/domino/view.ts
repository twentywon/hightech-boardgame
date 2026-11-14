import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DRAW, LEFT, RIGHT, TILES, type Laid, type State } from "./rules";

/** Half a tile: a tile is one unit by two. */
const U = 0.56,
  ROW = 15,
  SUBJECT: TableSubject = { half: 5.6, halfZ: 4.9, height: 0.6, lookY: 0, tilt: 1.08 };
export const DOMINO_COLORS: [string, string] = ["#f3ede0", "#8a8f98"];
const SPOTS: Record<number, [number, number][]> = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};
function face(a: number, b: number) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6f1e4";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#1a1c1f";
  ctx.fillRect(126, 14, 4, 100);
  [a, b].forEach((value, half) => {
    for (const [x, y] of SPOTS[value]) {
      ctx.beginPath();
      ctx.arc(half * 128 + 30 + x * 34, 30 + y * 34, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
interface Pose {
  x: number;
  z: number;
  /** Turn about the vertical axis; the tile's first half points along +x at 0. */
  turn: number;
  up: boolean;
  /** The way the line runs where the tile lies: 1 to the right, -1 back to the left. */
  dir?: number;
}
/** Where the tiles of the line lie: a row that turns back on itself, doubles set crosswise. */
export function linePoses(line: Laid[]): Pose[] {
  const lengths = line.map((laid) => (laid.left === laid.right ? 1 : 2)),
    total = lengths.reduce((n, l) => n + l, 0),
    rows = Math.max(1, Math.ceil(total / ROW)),
    out: Pose[] = [];
  let row = 0,
    used = 0;
  line.forEach((laid, i) => {
    const length = lengths[i];
    if (used + length > ROW) {
      row++;
      used = 0;
    }
    const back = row % 2 === 1,
      start = -(Math.min(total, ROW) * U) / 2,
      along = start + (used + length / 2) * U,
      x = back ? -along : along,
      double = laid.left === laid.right;
    out.push({ x, z: (row - (rows - 1) / 2) * U * 2.5 - 0.6, turn: double ? Math.PI / 2 : back ? Math.PI : 0, up: true, dir: back ? -1 : 1 });
    used += length;
  });
  return out;
}
/** A line of dominoes on a dark wooden floor. */
export class DominoView extends TableView<State> {
  private tiles: T.Mesh[] = [];
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private poses = new Map<number, Pose>();
  private endSpots: { x: number; z: number }[] = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#17110c");
    this.daylight("#ffe9c8", "#1c140e", "#ffe2b4", 9, 1.9);
    // Dark floorboards.
    const boards = this.own(wood(true));
    boards.repeat.set(5, 9);
    const floor = this.add(new T.PlaneGeometry(90, 90), this.standard({ map: boards, color: "#7a6048", roughness: 0.55 }), 0, 0, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const seams = this.standard({ color: "#0e0a07", roughness: 1 });
    for (let k = -9; k <= 9; k++) this.add(new T.BoxGeometry(0.03, 0.004, 90), seams, k * 1.7, 0.002, 0).castShadow = false;
    const block = this.own(new T.BoxGeometry(U * 2 - 0.05, 0.16, U - 0.05)),
      ivory = this.standard({ color: "#f6f1e4", roughness: 0.4 }),
      back = this.standard({ color: "#22262b", roughness: 0.45 });
    TILES.forEach(([a, b]) => {
      const mesh = new T.Mesh(block, [ivory, ivory, this.standard({ map: this.own(face(a, b)), roughness: 0.4 }), back, ivory, ivory]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.tiles.push(mesh);
      this.scene.add(mesh);
    });
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 2; i++) {
      const ring = ringMesh(own, 0.34, 0.44, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.5, 0.58, "#ffffff");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  /** Where every tile lies in a state: the line, my hand face up, the other hand and the pile face down. */
  private arrange(state: State) {
    const poses = new Map<number, Pose>(),
      line = linePoses(state.line);
    state.line.forEach((laid, i) => {
      // The texture's first half is the tile's lower number: turn it round when it lies the other way.
      const flipped = laid.left !== TILES[laid.tile][0];
      poses.set(laid.tile, { ...line[i], turn: line[i].turn + (flipped ? Math.PI : 0) });
    });
    const row = (tiles: number[], z: number, up: boolean) =>
      tiles.forEach((tile, i) => poses.set(tile, { x: (i - (tiles.length - 1) / 2) * (U + 0.12), z, turn: Math.PI / 2, up }));
    row(state.hands[0], 3.7, true);
    row(state.hands[1], -4.4, state.winner !== null);
    state.stock.forEach((tile, i) => poses.set(tile, { x: -5.3 + (i % 3) * (U + 0.08), z: -2.6 + Math.floor(i / 3) * (U * 2 + 0.08), turn: Math.PI / 2, up: false }));
    if (line.length) {
      const first = line[0],
        last = line[line.length - 1],
        out = (pose: Pose, sign: number) => ({ x: pose.x + (pose.dir ?? 1) * sign * U * 1.7, z: pose.z });
      this.endSpots = [out(first, -1), out(last, 1)];
    } else this.endSpots = [{ x: -1.2, z: -0.6 }, { x: 0, z: -0.6 }];
    return poses;
  }
  private put(mesh: T.Mesh, pose: Pose) {
    mesh.position.set(pose.x, 0.08, pose.z);
    mesh.rotation.set(pose.up ? 0 : Math.PI, pose.turn, 0);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const out: Spot[] = state.hands[0].map((tile) => ({ x: this.poses.get(tile)!.x, y: 0.1, z: this.poses.get(tile)!.z, r: 0.42, point: tile }));
    out.push({ ...this.endSpots[0], y: 0.1, r: 0.7, point: LEFT }, { ...this.endSpots[1], y: 0.1, r: 0.7, point: RIGHT });
    if (state.stock.length) out.push({ x: -4.7, y: 0.1, z: -0.4, r: 1.6, point: DRAW });
    return out;
  }
  protected place(state: State) {
    this.poses = this.arrange(state);
    this.tiles.forEach((mesh, tile) => this.put(mesh, this.poses.get(tile)!));
  }
  protected animate(before: State, state: State) {
    if (state.ply !== before.ply + 1) return false;
    const from = this.poses,
      to = this.arrange(state),
      moved = this.tiles.map((_, tile) => tile).filter((tile) => {
        const a = from.get(tile),
          b = to.get(tile)!;
        return !a || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 0.01 || a.up !== b.up || a.turn !== b.turn;
      });
    if (!moved.length) return false;
    this.tween(0, 360, (p) => {
      const e = p * p * (3 - 2 * p);
      for (const tile of moved) {
        const a = from.get(tile) ?? to.get(tile)!,
          b = to.get(tile)!,
          mesh = this.tiles[tile];
        mesh.position.set(a.x + (b.x - a.x) * e, 0.08 + Math.sin(Math.PI * p) * 0.5, a.z + (b.z - a.z) * e);
        mesh.rotation.y = a.turn + (b.turn - a.turn) * e;
        mesh.rotation.x = (a.up ? 0 : Math.PI) + ((b.up ? 0 : Math.PI) - (a.up ? 0 : Math.PI)) * e;
      }
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    // The tile picked up rises a little; the ends it may go to are ringed.
    this.tiles.forEach((mesh, tile) => {
      if (state?.hands[0].includes(tile)) mesh.position.y = marks.selected === tile ? 0.3 : 0.08;
    });
    [LEFT, RIGHT].forEach((end, i) => {
      this.rings[i].visible = marks.targets.includes(end);
      this.rings[i].position.set(this.endSpots[i].x, 0.01, this.endSpots[i].z);
    });
    const pose = marks.cursor !== null ? this.poses.get(marks.cursor) : undefined;
    this.cursor.visible = !!pose;
    if (pose) this.cursor.position.set(pose.x, 0.01, pose.z);
  }
}
