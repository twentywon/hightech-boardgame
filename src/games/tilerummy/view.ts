import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { NEW_SET, SET_BASE, TILE_COUNT, TO_RACK, colourOf, isJoker, numberOf, valid, type State } from "./rules";

const W = 0.6,
  D = 0.84,
  PITCH = 0.64,
  ROW_WIDTH = 15.6,
  SUBJECT: TableSubject = { half: 8.4, halfZ: 6.6, height: 0.5, lookY: 0, tilt: 1.12 };
export const RACK_COLORS: [string, string] = ["#f4ead2", "#9aa3ad"];
const INK = ["#c8321f", "#1f5fc0", "#d98a12", "#1c1d21"];
function face(colour: number, text: string) {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 134;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f8f3e4";
  ctx.fillRect(0, 0, 96, 134);
  ctx.fillStyle = INK[colour];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${text.length > 1 ? 54 : 64}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(text, 48, 54);
  ctx.beginPath();
  ctx.arc(48, 106, 11, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = INK[colour];
  ctx.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
interface Pose {
  x: number;
  z: number;
  up: boolean;
}
/** The order a set is shown in: by number, the colours of a group in a fixed order, jokers last. */
const shown = (set: number[]) => [...set].sort((a, b) => (isJoker(a) ? 99 : numberOf(a)) - (isJoker(b) ? 99 : numberOf(b)) || colourOf(a) - colourOf(b));
/** Tiles laid out in sets on a classroom floor, my rack along the near edge. */
export class TileRummyView extends TableView<State> {
  private tiles: T.Mesh[] = [];
  private poses = new Map<number, Pose>();
  /** Where a tile added to each set, to a new set or back to the rack would go. */
  private slots = new Map<number, { x: number; z: number }>();
  private plates: T.Mesh[] = [];
  private adders: T.Mesh[] = [];
  private cursor: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#b98d5a");
    this.daylight("#ffffff", "#8a6d4a", "#fff3da", 12, 2.0);
    // The classroom floor: boards, and the feet of desks and chairs at its edges.
    const boards = this.own(wood());
    boards.repeat.set(7, 12);
    const floor = this.add(new T.PlaneGeometry(90, 90), this.standard({ map: boards, color: "#d2ae7c", roughness: 0.6 }), 0, 0, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const seam = this.standard({ color: "#7a5a36", roughness: 1 });
    for (let k = -12; k <= 12; k++) this.add(new T.BoxGeometry(0.03, 0.004, 90), seam, k * 1.5, 0.002, 0).castShadow = false;
    const steel = this.standard({ color: "#7c858e", roughness: 0.45, metalness: 0.5 }),
      rubber = this.standard({ color: "#2a2d31", roughness: 0.9 });
    for (const [x, z] of [[-9.6, -6.6], [-7.2, -6.6], [7.4, -6.9], [9.8, -6.9], [-10.2, 2.2], [10.3, 1.4], [10.3, 3.6]]) {
      this.add(new T.CylinderGeometry(0.09, 0.09, 3, 10), steel, x, 1.5, z);
      this.add(new T.CylinderGeometry(0.13, 0.13, 0.12, 12), rubber, x, 0.06, z);
    }
    // Things dropped on the floor: an eraser, a pencil, an indoor shoe.
    this.add(new T.BoxGeometry(0.5, 0.16, 0.26), this.standard({ color: "#f3f0ea" }), -9.2, 0.08, -3.2).rotation.y = 0.5;
    this.add(new T.CylinderGeometry(0.045, 0.045, 1.5, 6), this.standard({ color: "#e0a020" }), 9.4, 0.05, -3.6).rotation.set(Math.PI / 2, 0, 0.8);
    const shoe = this.standard({ color: "#f6f6f2", roughness: 0.7 });
    this.add(new T.BoxGeometry(0.7, 0.3, 1.5), shoe, -9.7, 0.15, 5.2).rotation.y = -0.3;
    this.add(new T.BoxGeometry(0.72, 0.1, 0.5), this.standard({ color: "#3b6fb8" }), -9.55, 0.32, 5.65).rotation.y = -0.3;
    const block = this.own(new T.BoxGeometry(W, 0.14, D)),
      ivory = this.standard({ color: "#f8f3e4", roughness: 0.4 }),
      back = this.standard({ color: "#e2d8bd", roughness: 0.5 }),
      faces = new Map<string, T.Material>();
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      const key = isJoker(tile) ? "J" : `${colourOf(tile)}-${numberOf(tile)}`;
      if (!faces.has(key)) faces.set(key, this.standard({ map: this.own(isJoker(tile) ? face(0, "☺") : face(colourOf(tile), String(numberOf(tile)))), roughness: 0.4 }));
      const mesh = new T.Mesh(block, [ivory, ivory, faces.get(key)!, back, ivory, ivory]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.tiles.push(mesh);
      this.scene.add(mesh);
    }
    const plate = this.own(new T.PlaneGeometry(1, 1)),
      red = this.own(new T.MeshBasicMaterial({ color: "#d2452f", transparent: true, opacity: 0.4, depthWrite: false })),
      gold = this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.85, depthWrite: false }));
    for (let i = 0; i < 40; i++) {
      const under = new T.Mesh(plate, red);
      under.rotation.x = -Math.PI / 2;
      under.visible = false;
      this.plates.push(under);
      const adder = new T.Mesh(plate, gold);
      adder.rotation.x = -Math.PI / 2;
      adder.scale.set(W * 0.7, D * 0.8, 1);
      adder.visible = false;
      this.adders.push(adder);
      this.scene.add(under, adder);
    }
    this.cursor = new T.Mesh(plate, this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false })));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.scale.set(W + 0.16, D + 0.16, 1);
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  /** Where everything lies: the sets in rows on the floor, my rack in front, the other rack and the pool face down. */
  private arrange(state: State) {
    const poses = new Map<number, Pose>(),
      slots = new Map<number, { x: number; z: number }>(),
      bounds: { x: number; z: number; w: number }[] = [];
    let x = -ROW_WIDTH / 2,
      z = -4.0;
    state.table.forEach((set, i) => {
      const width = (set.length + 1) * PITCH;
      if (x + width > ROW_WIDTH / 2) {
        x = -ROW_WIDTH / 2;
        z += D + 0.2;
      }
      shown(set).forEach((tile, k) => poses.set(tile, { x: x + (k + 0.5) * PITCH, z, up: true }));
      slots.set(SET_BASE + i, { x: x + (set.length + 0.5) * PITCH, z });
      bounds.push({ x: x + (set.length * PITCH) / 2, z, w: set.length * PITCH });
      x += width + 0.35;
    });
    if (x + 2 * PITCH > ROW_WIDTH / 2) {
      x = -ROW_WIDTH / 2;
      z += D + 0.2;
    }
    slots.set(NEW_SET, { x: x + 0.5 * PITCH, z });
    const rack = (tiles: number[], z0: number, up: boolean) => {
      const sorted = [...tiles].sort((a, b) => (isJoker(a) ? 99 : colourOf(a)) - (isJoker(b) ? 99 : colourOf(b)) || numberOf(a) - numberOf(b)),
        perRow = 22;
      sorted.forEach((tile, k) => {
        const row = Math.floor(k / perRow),
          inRow = Math.min(perRow, sorted.length - row * perRow);
        poses.set(tile, { x: ((k % perRow) - (inRow - 1) / 2) * PITCH, z: z0 + row * (D + 0.12) * (up ? 1 : -1), up });
      });
    };
    rack(state.racks[0], 4.7, true);
    rack(state.racks[1], -6.0, state.winner !== null);
    slots.set(TO_RACK, { x: Math.min(7.6, (Math.min(22, state.racks[0].length) / 2 + 0.8) * PITCH), z: 4.7 });
    state.pool.forEach((tile, k) => poses.set(tile, { x: 7.9 - (k % 3) * 0.05, z: -2 + (k % 3) * 0.04, up: false }));
    return { poses, slots, bounds };
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const out: Spot[] = [...state.racks[0], ...state.table.flat()].map((tile) => ({ x: this.poses.get(tile)!.x, y: 0.1, z: this.poses.get(tile)!.z, r: 0.34, point: tile }));
    for (const [point, at] of this.slots) if (this.marks.targets.includes(point)) out.push({ ...at, y: 0.05, r: 0.36, point });
    return out;
  }
  private put(tile: number, pose: Pose, lift = 0) {
    const mesh = this.tiles[tile];
    mesh.position.set(pose.x, 0.07 + lift, pose.z);
    mesh.rotation.set(pose.up ? 0 : Math.PI, 0, 0);
  }
  protected place(state: State) {
    const { poses, slots, bounds } = this.arrange(state);
    this.poses = poses;
    this.slots = slots;
    this.tiles.forEach((_, tile) => this.put(tile, poses.get(tile)!));
    // A set that is not yet good lies on red.
    this.plates.forEach((plate, i) => {
      const set = state.table[i];
      plate.visible = !!set && !valid(set);
      if (plate.visible) {
        plate.position.set(bounds[i].x, 0.006, bounds[i].z);
        plate.scale.set(bounds[i].w + 0.12, D + 0.16, 1);
      }
    });
  }
  protected animate(before: State, state: State) {
    void before;
    const from = this.poses,
      { poses: to } = this.arrange(state),
      moved = this.tiles.map((_, tile) => tile).filter((tile) => {
        const a = from.get(tile),
          b = to.get(tile)!;
        return !a || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 0.01 || a.up !== b.up;
      });
    if (!moved.length || moved.length > 40) return false;
    this.tween(0, 240, (p) => {
      const e = p * p * (3 - 2 * p);
      for (const tile of moved) {
        const a = from.get(tile) ?? to.get(tile)!,
          b = to.get(tile)!,
          mesh = this.tiles[tile];
        mesh.position.set(a.x + (b.x - a.x) * e, 0.07 + Math.sin(Math.PI * p) * 0.4, a.z + (b.z - a.z) * e);
        mesh.rotation.x = (a.up ? 0 : Math.PI) + ((b.up ? 0 : Math.PI) - (a.up ? 0 : Math.PI)) * e;
      }
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    for (const tile of [...state.racks[0], ...state.table.flat()]) {
      const pose = this.poses.get(tile);
      if (pose) this.put(tile, pose, marks.selected === tile ? 0.28 : 0);
    }
    // Where the tile picked up may go.
    const open = [...this.slots].filter(([point]) => marks.targets.includes(point));
    this.adders.forEach((adder, i) => {
      adder.visible = i < open.length;
      if (i < open.length) adder.position.set(open[i][1].x, 0.008, open[i][1].z);
    });
    const at = marks.cursor !== null ? (this.poses.get(marks.cursor) ?? this.slots.get(marks.cursor)) : undefined;
    this.cursor.visible = !!at;
    if (at) this.cursor.position.set(at.x, 0.005, at.z);
  }
}
