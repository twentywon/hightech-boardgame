import { capable } from "../../engine/scene-utils";
import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { SET_BASE, TILE_COUNT, TO_RACK, colourOf, isJoker, numberOf, valid, type State } from "./rules";
import { D, TH, W, tileKit } from "./tiles";
import { BAG, LEAN, MINE, STAND, THEIRS, livingRoom } from "./room";

// Tiles large enough to read at a glance; a rack row holds eighteen of them.
const PITCH = 0.85,
  PER_ROW = 18,
  ROW_WIDTH = 15.6,
  SUBJECT: TableSubject = { half: 8.4, halfZ: 6.6, height: 0.5, lookY: 0, tilt: 1.12 };
export const RACK_COLORS: [string, string] = ["#f4ead2", "#9aa3ad"];
/** Where a tile is: on the table, on my rack, on the computer's (with the row), or still in the bag. */
interface Pose {
  x: number;
  z: number;
  up: boolean;
  at: "table" | "mine" | "theirs" | "pool";
  row: number;
}
/** A tile's place and turn in the room. */
interface Place {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  shown: boolean;
}
const ROW_GAP = D + 0.12;
/** How a tile lies in a pose. */
function placeOf(pose: Pose): Place {
  if (pose.at === "table") return { x: pose.x, y: TH / 2, z: pose.z, rx: pose.up ? 0 : Math.PI, ry: 0, shown: true };
  if (pose.at === "pool") return { x: BAG.x, y: BAG.mouth - 0.2, z: BAG.z, rx: Math.PI / 2, ry: 0, shown: false };
  const rows = pose.at === "mine" ? MINE : THEIRS,
    h = rows[Math.min(pose.row, rows.length - 1)].h;
  // My tiles, and the computer's once the game is over, lean back toward me to be read; the computer's stand
  // nearly upright facing it, their backs to me.
  if (pose.at === "mine") return { x: pose.x, y: h + (D / 2) * Math.sin(LEAN) + (TH / 2) * Math.cos(LEAN), z: pose.z, rx: LEAN, ry: 0, shown: true };
  const tilt = Math.PI / 2 - STAND;
  return { x: pose.x, y: h + (D / 2) * Math.sin(tilt) + (TH / 2) * Math.cos(tilt), z: pose.z, rx: pose.up ? tilt : -tilt, ry: pose.up ? 0 : Math.PI, shown: true };
}
const smooth = (p: number) => p * p * (3 - 2 * p);
/** The order a set is shown in: by number, the colours of a group in a fixed order, jokers last. */
const shown = (set: number[]) => [...set].sort((a, b) => (isJoker(a) ? 99 : numberOf(a)) - (isJoker(b) ? 99 : numberOf(b)) || colourOf(a) - colourOf(b));
/** A frame round a tile: a rectangle with the tile's shape cut out of it. */
function frameGeometry(margin: number) {
  const outer = new T.Shape(),
    w = W / 2 + margin,
    d = D / 2 + margin;
  outer.moveTo(-w, -d);
  outer.lineTo(w, -d);
  outer.lineTo(w, d);
  outer.lineTo(-w, d);
  outer.closePath();
  const hole = new T.Path();
  hole.moveTo(-W / 2, -D / 2);
  hole.lineTo(-W / 2, D / 2);
  hole.lineTo(W / 2, D / 2);
  hole.lineTo(W / 2, -D / 2);
  hole.closePath();
  outer.holes.push(hole);
  return new T.ShapeGeometry(outer).rotateX(-Math.PI / 2);
}
/** Tiles on a coffee table in a living room: the sets in rows, my rack in front, the computer's across, the bag. */
export class TileRummyView extends TableView<State> {
  private tiles: T.Mesh[] = [];
  private poses = new Map<number, Pose>();
  /** Where a tile added to each set, to a new set or back to the rack would go. */
  private slots = new Map<number, { x: number; y: number; z: number; tilt: number }>();
  private plates: T.Mesh[] = [];
  private adders: T.Mesh[] = [];
  /** Gold frames round the tiles picked up, and the keyboard's frame. */
  private halos: T.Mesh[] = [];
  private cursor: T.Mesh;
  private slotCursor: T.Mesh;
  private bag: T.Group;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#6f5a48");
    const rich = capable();
    this.daylight("#fff8ee", "#7a6450", "#fff1dc", 12, 2.0);
    this.bag = livingRoom(this.scene, (r) => this.own(r), rich);
    const kit = tileKit((r) => this.own(r));
    for (let tile = 0; tile < TILE_COUNT; tile++) {
      const mesh = new T.Mesh(kit.geometry(tile), kit.material);
      mesh.castShadow = mesh.receiveShadow = true;
      this.tiles.push(mesh);
      this.scene.add(mesh);
    }
    const plate = this.own(new T.PlaneGeometry(1, 1)),
      red = this.own(new T.MeshBasicMaterial({ color: "#d2452f", transparent: true, opacity: 0.42, depthWrite: false })),
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
      adder.renderOrder = 4;
      this.adders.push(adder);
      this.scene.add(under, adder);
    }
    const ring = this.own(frameGeometry(0.09)),
      glow = this.own(new T.MeshBasicMaterial({ color: "#ffc93a", transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide }));
    for (let i = 0; i < 24; i++) {
      const halo = new T.Mesh(ring, glow);
      halo.visible = false;
      halo.renderOrder = 6;
      this.halos.push(halo);
      this.scene.add(halo);
    }
    this.cursor = new T.Mesh(this.own(frameGeometry(0.13)), this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide })));
    this.cursor.visible = false;
    this.cursor.renderOrder = 7;
    this.slotCursor = new T.Mesh(plate, this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false })));
    this.slotCursor.rotation.x = -Math.PI / 2;
    this.slotCursor.scale.set(W + 0.16, D + 0.16, 1);
    this.slotCursor.visible = false;
    this.scene.add(this.cursor, this.slotCursor);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  /** Where everything lies: the sets in rows on the table, my rack in front, the computer's across, the rest in the bag. */
  private arrange(state: State) {
    const poses = new Map<number, Pose>(),
      slots = new Map<number, { x: number; y: number; z: number; tilt: number }>(),
      bounds: { x: number; z: number; w: number }[] = [];
    let x = -ROW_WIDTH / 2,
      z = -4.3;
    state.table.forEach((set, i) => {
      const width = (set.length + 1) * PITCH;
      if (x + width > ROW_WIDTH / 2) {
        x = -ROW_WIDTH / 2;
        z += D + 0.14;
      }
      shown(set).forEach((tile, k) => poses.set(tile, { x: x + (k + 0.5) * PITCH, z, up: true, at: "table", row: 0 }));
      slots.set(SET_BASE + i, { x: x + (set.length + 0.5) * PITCH, y: 0.012, z, tilt: 0 });
      bounds.push({ x: x + (set.length * PITCH) / 2, z, w: set.length * PITCH });
      x += width + 0.35;
    });
    const rack = (tiles: number[], at: "mine" | "theirs", up: boolean) => {
      const rows = at === "mine" ? MINE : THEIRS,
        sorted = [...tiles].sort((a, b) => (isJoker(a) ? 99 : colourOf(a)) - (isJoker(b) ? 99 : colourOf(b)) || numberOf(a) - numberOf(b));
      sorted.forEach((tile, k) => {
        const row = Math.floor(k / PER_ROW),
          inRow = Math.min(PER_ROW, sorted.length - row * PER_ROW),
          rowZ = row < rows.length ? rows[row].z : rows[rows.length - 1].z + (row - rows.length + 1) * ROW_GAP * (at === "mine" ? 1 : -1);
        poses.set(tile, { x: ((k % PER_ROW) - (inRow - 1) / 2) * PITCH, z: rowZ, up, at, row });
      });
    };
    rack(state.racks[0], "mine", true);
    rack(state.racks[1], "theirs", state.winner !== null);
    const home = placeOf({ x: 0, z: MINE[0].z, up: true, at: "mine", row: 0 });
    slots.set(TO_RACK, { x: Math.min(7.9, (Math.min(PER_ROW, state.racks[0].length) / 2 + 0.8) * PITCH), y: home.y + 0.02, z: MINE[0].z, tilt: LEAN });
    for (const tile of state.pool) poses.set(tile, { x: BAG.x, z: BAG.z, up: false, at: "pool", row: 0 });
    return { poses, slots, bounds };
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const out: Spot[] = [...state.racks[0], ...state.table.flat()].map((tile) => {
      const at = placeOf(this.poses.get(tile)!);
      return { x: at.x, y: at.y, z: at.z, r: 0.38, point: tile };
    });
    for (const [point, at] of this.slots) if (this.marks.targets.includes(point)) out.push({ x: at.x, y: at.y + 0.04, z: at.z, r: 0.36, point });
    return out;
  }
  private put(tile: number, at: Place, lift = 0) {
    const mesh = this.tiles[tile];
    mesh.visible = at.shown;
    mesh.position.set(at.x, at.y + lift, at.z);
    mesh.rotation.set(at.rx, at.ry, 0);
  }
  /** The bag sags as it empties. */
  private fill(state: State) {
    const share = Math.min(1, state.pool.length / (TILE_COUNT - 28));
    this.bag.scale.set(0.78 + 0.22 * share, 0.5 + 0.5 * share, 0.78 + 0.22 * share);
  }
  protected place(state: State) {
    const { poses, slots, bounds } = this.arrange(state);
    this.poses = poses;
    this.slots = slots;
    this.fill(state);
    this.tiles.forEach((_, tile) => this.put(tile, placeOf(poses.get(tile)!)));
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
  protected animate(_before: State, state: State) {
    const from = this.poses,
      { poses: to } = this.arrange(state),
      moved = this.tiles
        .map((_, tile) => tile)
        .filter((tile) => {
          const a = from.get(tile),
            b = to.get(tile)!;
          return !a || a.at !== b.at || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) > 0.01 || a.up !== b.up;
        });
    // A new game (everything dealt again) is simply laid out.
    if (!moved.length || moved.length > 60) return false;
    this.fill(state);
    // Tiles go one after another, in the order they will lie; the regrouped glide, the rest are lifted and set down.
    moved.sort((a, b) => to.get(a)!.z - to.get(b)!.z || to.get(a)!.x - to.get(b)!.x);
    let sounded = 0;
    moved.forEach((tile, k) => {
      const a = placeOf(from.get(tile) ?? to.get(tile)!),
        pose = to.get(tile)!,
        b = placeOf(pose),
        mesh = this.tiles[tile],
        glide = from.get(tile)?.at === "table" && pose.at === "table",
        drawn = from.get(tile)?.at === "pool",
        duration = glide ? 320 : drawn ? 480 : 400,
        // Set down a little short of its place, then slid home: the click is heard as it comes to rest.
        dx = b.x - a.x,
        dz = b.z - a.z,
        length = Math.hypot(dx, dz) || 1,
        short = glide || pose.at !== "table" ? 0 : 0.16,
        sx = b.x - (dx / length) * short,
        sz = b.z - (dz / length) * short,
        height = glide ? 0.08 : drawn ? 1.3 : 0.75,
        heard = sounded++ < 6;
      if (drawn) {
        mesh.visible = true;
        mesh.position.set(a.x, a.y, a.z);
      }
      this.tween(k * (glide ? 22 : 34), duration, (p) => {
        mesh.visible = true;
        if (glide) {
          const e = smooth(p);
          mesh.position.set(a.x + dx * e, b.y + Math.sin(Math.PI * p) * height, a.z + dz * e);
          mesh.rotation.set(b.rx, b.ry, 0);
        } else if (p < 0.72) {
          const q = p / 0.72,
            e = smooth(q),
            turn = smooth(Math.min(1, q * 1.25));
          mesh.position.set(a.x + (sx - a.x) * e, a.y + (b.y - a.y) * q + 4 * q * (1 - q) * height, a.z + (sz - a.z) * e);
          mesh.rotation.set(a.rx + (b.rx - a.rx) * turn, a.ry + (b.ry - a.ry) * turn, 0);
        } else {
          const q = (p - 0.72) / 0.28,
            e = 1 - (1 - q) * (1 - q);
          mesh.position.set(sx + (b.x - sx) * e, b.y, sz + (b.z - sz) * e);
          mesh.rotation.set(b.rx, b.ry, 0);
        }
        if (p === 1) {
          mesh.visible = b.shown;
          if (heard) this.onContact();
        }
      });
    });
    return true;
  }
  /** Lays a frame round a tile, in its middle plane and turned with it (the tile hides the frame's inner edge). */
  private frame(halo: T.Mesh, tile: number) {
    const mesh = this.tiles[tile];
    halo.visible = true;
    halo.rotation.copy(mesh.rotation);
    halo.position.copy(mesh.position);
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    let used = 0;
    for (const tile of [...state.racks[0], ...state.table.flat()]) {
      const pose = this.poses.get(tile);
      if (!pose) continue;
      const picked = state.picked.includes(tile);
      this.put(tile, placeOf(pose), picked ? 0.3 : 0);
      if (picked && used < this.halos.length) this.frame(this.halos[used++], tile);
    }
    for (let i = used; i < this.halos.length; i++) this.halos[i].visible = false;
    // Where the tile picked up may go.
    const open = [...this.slots].filter(([point]) => marks.targets.includes(point));
    this.adders.forEach((adder, i) => {
      adder.visible = i < open.length;
      if (i < open.length) {
        const at = open[i][1];
        adder.position.set(at.x, at.y, at.z);
        adder.rotation.x = -Math.PI / 2 + at.tilt;
      }
    });
    const cursor = marks.cursor,
      tile = cursor !== null && cursor < TILE_COUNT && this.poses.has(cursor) ? cursor : null,
      slot = cursor !== null ? this.slots.get(cursor) : undefined;
    this.cursor.visible = tile !== null && this.tiles[tile].visible;
    if (tile !== null) this.frame(this.cursor, tile);
    this.slotCursor.visible = !this.cursor.visible && !!slot;
    if (slot) {
      this.slotCursor.position.set(slot.x, slot.y - 0.004, slot.z);
      this.slotCursor.rotation.x = -Math.PI / 2 + slot.tilt;
    }
  }
}
