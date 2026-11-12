import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { SET_BASE, TILE_COUNT, TO_RACK, colourOf, isJoker, numberOf, valid, type State } from "./rules";

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
/** Strips of varnished wood, each a little different, their ends staggered from row to row. */
function floorboards() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!;
  let seed = 11;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const strip = 64;
  for (let row = 0; row < 1024 / strip; row++) {
    // Each row starts somewhere else, and a strip that runs off the right edge comes back in at the left, so the pattern repeats without a seam.
    const start = rand() * 300;
    let x = start;
    while (x < 1024 + start) {
      const length = 260 + rand() * 240,
        tone = 150 + rand() * 34,
        grain = Array.from({ length: 9 }, () => [rand() * strip, 1 + rand() * 2, 0.03 + rand() * 0.05]);
      for (const at of [x, x - 1024]) {
        ctx.fillStyle = `rgb(${tone + 44}, ${tone - 2}, ${tone - 62})`;
        ctx.fillRect(at, row * strip, Math.min(length, 1024 + start - x), strip);
        for (const [y, h, alpha] of grain) {
          ctx.fillStyle = `rgba(90,52,20,${alpha})`;
          ctx.fillRect(at, row * strip + y, Math.min(length, 1024 + start - x), h);
        }
        ctx.fillStyle = "rgba(60,34,14,0.55)";
        ctx.fillRect(at - 1, row * strip, 2, strip);
      }
      x += length;
    }
    ctx.fillStyle = "rgba(60,34,14,0.5)";
    ctx.fillRect(0, row * strip, 1024, 2);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(4, 4);
  t.anisotropy = 4;
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
    // A classroom floor: varnished strips of wood laid end to end, sunlight from the windows lying across it,
    // and round its edges the legs of desks and chairs, a satchel, indoor shoes and things dropped.
    const floor = this.add(new T.PlaneGeometry(60, 60), this.standard({ map: this.own(floorboards()), roughness: 0.42 }), 0, 0, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const sun = this.own(new T.MeshBasicMaterial({ color: "#fff3c4", transparent: true, opacity: 0.2, depthWrite: false }));
    for (const x of [-8.6, -3.4, 1.8]) {
      const patch = this.add(new T.PlaneGeometry(3.6, 7.5), sun, x + 3.4, 0.004, -3.4);
      patch.rotation.set(-Math.PI / 2, 0, 0.5);
      patch.castShadow = false;
    }
    const steel = this.standard({ color: "#8a939c", roughness: 0.4, metalness: 0.55 }),
      cap = this.standard({ color: "#c9d24a", roughness: 0.9 }),
      top = this.standard({ color: "#d8b47a", roughness: 0.5 }),
      seat = this.standard({ color: "#b98a52", roughness: 0.6 });
    /** A desk seen from the floor: four legs on felt caps, a rail between them and the board above. */
    const desk = (x: number, z: number, turn: number) => {
      const g = new T.Group();
      for (const dx of [-1.15, 1.15])
        for (const dz of [-0.75, 0.75]) {
          this.add(new T.CylinderGeometry(0.07, 0.07, 3.2, 10), steel, dx, 1.6, dz, g);
          this.add(new T.SphereGeometry(0.13, 12, 8), cap, dx, 0.1, dz, g);
        }
      for (const dx of [-1.15, 1.15]) this.add(new T.BoxGeometry(0.06, 0.06, 1.5), steel, dx, 0.6, 0, g);
      this.add(new T.BoxGeometry(2.7, 0.12, 1.9), top, 0, 3.2, 0, g);
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      this.scene.add(g);
    };
    const chair = (x: number, z: number, turn: number) => {
      const g = new T.Group();
      for (const dx of [-0.6, 0.6])
        for (const dz of [-0.55, 0.55]) {
          this.add(new T.CylinderGeometry(0.055, 0.055, 1.9, 10), steel, dx, 0.95, dz, g);
          this.add(new T.SphereGeometry(0.11, 12, 8), cap, dx, 0.09, dz, g);
        }
      this.add(new T.BoxGeometry(1.4, 0.1, 1.3), seat, 0, 1.9, 0, g);
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      this.scene.add(g);
    };
    desk(-10.6, -7.4, 0.06);
    desk(-6.2, -8.2, -0.04);
    desk(6.4, -8.2, 0.05);
    desk(10.8, -7.3, -0.08);
    chair(-11.4, -1.4, 0.3);
    chair(11.5, 0.6, -0.4);
    chair(11.2, 5.4, 0.2);
    // A satchel leaning by a desk, a pair of indoor shoes, an eraser, a pencil, a crumpled note.
    this.add(new T.BoxGeometry(1.5, 1.7, 0.6), this.standard({ color: "#2f4f8a", roughness: 0.8 }), -11.2, 0.85, 3.4).rotation.y = 0.5;
    this.add(new T.BoxGeometry(1.3, 0.5, 0.64), this.standard({ color: "#f2c230", roughness: 0.8 }), -11.2, 1.2, 3.4).rotation.y = 0.5;
    const shoe = this.standard({ color: "#f6f6f2", roughness: 0.7 }),
      band = this.standard({ color: "#3b6fb8" });
    for (const [x, turn] of [[-10.4, -0.3], [-9.5, -0.15]]) {
      this.add(new T.BoxGeometry(0.62, 0.28, 1.4), shoe, x, 0.14, 6.0).rotation.y = turn;
      this.add(new T.BoxGeometry(0.64, 0.1, 0.42), band, x + 0.1, 0.3, 6.35).rotation.y = turn;
    }
    this.add(new T.BoxGeometry(0.5, 0.16, 0.26), this.standard({ color: "#f3f0ea" }), 9.6, 0.08, -4.2).rotation.y = 0.5;
    this.add(new T.CylinderGeometry(0.045, 0.045, 1.5, 6), this.standard({ color: "#e0a020" }), 10.2, 0.05, -2.9).rotation.set(Math.PI / 2, 0, 0.8);
    this.add(new T.IcosahedronGeometry(0.22, 0), this.standard({ color: "#fbfaf2", roughness: 1 }), -9.4, 0.18, -4.6);
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
      if (pose) this.put(tile, pose, state.picked.includes(tile) ? 0.3 : 0);
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
