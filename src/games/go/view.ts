import * as T from "three";
import { block, fall, glossy, hop, planks, travel, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BOARD_THICK, BOARD_TOP, BOWL_HEIGHT, BOWL_RADIUS, LID_RADIUS, TABLE_TOP, boardHalf, bowlAt, goSubject, pointAt, spacing, stoneHalf, stoneLift, stoneRadius } from "./layout";
import { PASS, koPoints, type Size, type State } from "./rules";
import { bowlGeometry, giwon, heapSpot, lidGeometry } from "./room";

export const GO_COLORS: [string, string] = ["#202226", "#f6f0e4"];
/** The floor of the parlour, below the table top. */
const FLOOR = TABLE_TOP - 6.2;
/** The star points of each board (rows and columns). */
export function starPoints(size: number): number[] {
  const lines = size === 9 ? [2, 4, 6] : size === 13 ? [3, 6, 9] : [3, 9, 15];
  const list: number[] = [];
  for (const r of lines)
    for (const c of lines) {
      // Nine by nine has its four corners' points and the middle only.
      if (size === 9 && (r === 4) !== (c === 4)) continue;
      list.push(r * size + c);
    }
  return list;
}
/**
 * Go in a Korean go parlour: gomoku's wooden board and glazed stones on nine, thirteen or nineteen lines, a bowl
 * of stones beside the board for each side with its lid lying upturned by it holding the stones that side has
 * taken. A stone is dropped onto its point; stones it takes are lifted off and carried into the taker's lid.
 * The last stone carries a small ring, a point barred by ko a red square, and at the end the dead stones are
 * dimmed and each side's territory is marked with small squares of its colour.
 */
export class GoView extends TableView<State> {
  private size: Size;
  private stone: T.BufferGeometry;
  private paint: [T.Material, T.Material];
  private faded: [T.Material, T.Material];
  private ghostPaint: [T.Material, T.Material];
  /** The stones on the board, the dead ones at the end, the territory marks, and each lid's prisoners. */
  private onBoard: [T.InstancedMesh, T.InstancedMesh];
  private deadStones: [T.InstancedMesh, T.InstancedMesh];
  private territory: [T.InstancedMesh, T.InstancedMesh];
  private prisoners: [T.InstancedMesh, T.InstancedMesh];
  private bowls: [T.Group, T.Group];
  private lids: [T.Group, T.Group];
  private lastMark: [T.Mesh, T.Mesh];
  private koMarks = new T.Group();
  private koMark: { geometry: T.BufferGeometry; material: T.Material };
  private cursor: T.Mesh;
  private ghost: T.Mesh;
  private hovered = -1;
  private flying = new T.Group();
  private readonly matrix = new T.Matrix4();
  constructor(host: HTMLElement, quality: "high" | "low", size: Size) {
    super(host, quality, "#5d5346");
    this.size = size;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      half = boardHalf(size),
      r = stoneRadius(size),
      n = size * size;
    // Light from the fluorescent tubes overhead, a little toward the player, and the room's bounce.
    this.daylight("#fbf8f0", "#6b5a48", "#fff9ef", 9, 2.2).position.set(-3, 12, 6);
    const tableHalf = half + 2.65,
      tableDepth = half + 0.95;
    giwon(this.scene, keep, { floor: FLOOR, tableTop: TABLE_TOP, tableHalf, tableDepth });
    // The table played on: a wooden top on four wooden legs, like the others in the room.
    const table = this.add(block(tableHalf * 2, 0.4, tableDepth * 2, 0.08), this.standard({ ...planks(1.4, keep), color: "#cfc3b2" }), 0, TABLE_TOP - 0.2, 0);
    table.castShadow = false;
    const oak = this.standard({ map: keep(wood(false)), color: "#a8784a", roughness: 0.55 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(block(0.45, TABLE_TOP - 0.4 - FLOOR, 0.45, 0.06), oak, sx * (tableHalf - 0.6), (TABLE_TOP - 0.4 + FLOOR) / 2, sz * (tableDepth - 0.6)).castShadow = false;
    // Gomoku's board: pale wood with a quiet grain, so that the lines are the only lines that count.
    this.add(block(half * 2, BOARD_THICK, half * 2, 0.06), this.standard({ map: keep(wood(false, 0.3)), roughness: 0.52 }), 0, BOARD_TOP - BOARD_THICK / 2, 0);
    const lines: number[] = [],
      edge = ((size - 1) / 2) * spacing(size),
      y = BOARD_TOP + 0.004;
    for (let i = 0; i < size; i++) {
      const v = (i - (size - 1) / 2) * spacing(size);
      lines.push(-edge, y, v, edge, y, v, v, y, -edge, v, y, edge);
    }
    const ink = keep(new T.LineBasicMaterial({ color: "#594027", transparent: true, opacity: 0.8 }));
    this.scene.add(new T.LineSegments(keep(new T.BufferGeometry().setAttribute("position", new T.Float32BufferAttribute(lines, 3))), ink));
    // The border is drawn heavier, as on real boards: three lines side by side.
    const border: number[] = [];
    for (const d of [-0.006, 0.006]) {
      const e = edge + d;
      border.push(-e, y, -e, e, y, -e, e, y, -e, e, y, e, e, y, e, -e, y, e, -e, y, e, -e, y, -e);
    }
    this.scene.add(new T.LineSegments(keep(new T.BufferGeometry().setAttribute("position", new T.Float32BufferAttribute(border, 3))), ink));
    const dot = keep(new T.CircleGeometry(spacing(size) * 0.11, 20)),
      dotInk = this.standard({ color: "#594027", roughness: 0.9 });
    for (const p of starPoints(size)) {
      const at = pointAt(size, p),
        mark = new T.Mesh(dot, dotInk);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(at.x, BOARD_TOP + 0.005, at.z);
      this.scene.add(mark);
    }
    // Gomoku's stones: a sphere pressed flat, glazed.
    this.stone = keep(new T.SphereGeometry(1, 32, 20));
    this.paint = [keep(glossy({ color: GO_COLORS[0], roughness: 0.3, metalness: 0.04 })), keep(glossy({ color: GO_COLORS[1], roughness: 0.28, metalness: 0.04 }))];
    this.faded = [
      keep(new T.MeshStandardMaterial({ color: GO_COLORS[0], roughness: 0.4, transparent: true, opacity: 0.42, depthWrite: false })),
      keep(new T.MeshStandardMaterial({ color: GO_COLORS[1], roughness: 0.4, transparent: true, opacity: 0.5, depthWrite: false })),
    ];
    this.ghostPaint = [
      keep(new T.MeshStandardMaterial({ color: GO_COLORS[0], roughness: 0.4, transparent: true, opacity: 0.4, depthWrite: false })),
      keep(new T.MeshStandardMaterial({ color: "#fff9ec", roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false })),
    ];
    const instanced = (material: T.Material, count: number, shadow = true) => {
      const mesh = new T.InstancedMesh(this.stone, material, count);
      mesh.count = 0;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.onBoard = [instanced(this.paint[0], n), instanced(this.paint[1], n)];
    this.deadStones = [instanced(this.faded[0], n, false), instanced(this.faded[1], n, false)];
    const square = keep(new T.BoxGeometry(spacing(size) * 0.36, 0.02, spacing(size) * 0.36));
    const marker = (side: 0 | 1) => {
      const mesh: T.InstancedMesh = new T.InstancedMesh(square, this.paint[side], n);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.territory = [marker(0), marker(1)];
    // Each side's bowl, full of stones of its colour, and its lid upturned beside it.
    const bowlWood = keep(glossy({ map: keep(wood(true)), color: "#c58b58", roughness: 0.38 }, 0.5)),
      bowlShape = keep(bowlGeometry(BOWL_RADIUS, BOWL_HEIGHT)),
      lidShape = keep(lidGeometry(LID_RADIUS)),
      heapStone = Math.min(r, 0.2);
    this.bowls = [0, 1].map((side) => {
      const group = new T.Group(),
        body = new T.Mesh(bowlShape, bowlWood);
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      const room = BOWL_RADIUS * 0.68,
        count = Math.floor(((room / heapStone) * (room / heapStone)) * 0.85),
        heap = new T.InstancedMesh(this.stone, this.paint[side], count),
        q = new T.Quaternion(),
        euler = new T.Euler();
      for (let i = 0; i < count; i++) {
        const spot = heapSpot(i, room, heapStone, BOWL_HEIGHT * 0.2);
        heap.setMatrixAt(i, this.matrix.compose(new T.Vector3(spot.x, BOWL_HEIGHT * 0.66 + spot.y, spot.z), q.setFromEuler(euler.set(spot.tiltX, spot.turn, spot.tiltZ)), new T.Vector3(heapStone, heapStone * 0.5, heapStone)));
      }
      heap.castShadow = false;
      heap.receiveShadow = true;
      group.add(heap);
      this.scene.add(group);
      return group;
    }) as [T.Group, T.Group];
    this.lids = [0, 1].map(() => {
      const group = new T.Group(),
        body = new T.Mesh(lidShape, bowlWood);
      body.castShadow = body.receiveShadow = true;
      group.add(body);
      this.scene.add(group);
      return group;
    }) as [T.Group, T.Group];
    // A lid holds stones of the other colour: those its side has taken.
    this.prisoners = [0, 1].map((side) => {
      const mesh = new T.InstancedMesh(this.stone, this.paint[1 - side], n);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.lids[side].add(mesh);
      return mesh;
    }) as [T.InstancedMesh, T.InstancedMesh];
    // The last stone's ring: gold on black, a warm brown on white.
    const ringShape = keep(new T.RingGeometry(r * 0.28, r * 0.44, 32));
    this.lastMark = [
      new T.Mesh(ringShape, keep(new T.MeshBasicMaterial({ color: "#e0b860", side: T.DoubleSide }))),
      new T.Mesh(ringShape, keep(new T.MeshBasicMaterial({ color: "#b5532f", side: T.DoubleSide }))),
    ];
    for (const mark of this.lastMark) {
      mark.rotation.x = -Math.PI / 2;
      mark.visible = false;
      this.scene.add(mark);
    }
    this.koMark = {
      geometry: keep(new T.RingGeometry(spacing(size) * 0.2, spacing(size) * 0.27, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2)),
      material: keep(new T.MeshBasicMaterial({ color: "#d0402f", side: T.DoubleSide })),
    };
    this.cursor = ringMesh(keep, r * 1.05, r * 1.22, "#ffffff");
    this.ghost = new T.Mesh(this.stone, this.ghostPaint[0]);
    this.ghost.scale.set(r, r * 0.5, r);
    this.ghost.visible = false;
    this.scene.add(this.koMarks, this.cursor, this.ghost, this.flying);
    this.begin();
  }
  /** On a screen taller than wide the bowls stand before and behind the board. */
  protected layout(aspect: number) {
    for (const side of [0, 1] as const) {
      const at = bowlAt(this.size, side, aspect);
      this.bowls[side].position.set(at.bowl.x, TABLE_TOP, at.bowl.z);
      this.lids[side].position.set(at.lid.x, TABLE_TOP, at.lid.z);
    }
  }
  protected subject(aspect: number): TableSubject {
    return goSubject(this.size, aspect);
  }
  protected spots(): Spot[] {
    const r = spacing(this.size) * 0.5,
      list: Spot[] = [];
    for (let p = 0; p < this.size * this.size; p++) list.push({ ...pointAt(this.size, p), r, point: p });
    return list;
  }
  /** Where the `i`-th prisoner lies in its lid, relative to the lid. */
  private prisonerSpot(i: number) {
    const r = Math.min(stoneRadius(this.size), 0.2),
      spot = heapSpot(i, LID_RADIUS * 0.84, r, 0.02);
    return { x: spot.x, y: LID_RADIUS * 0.06 + r * 0.5 + spot.y, z: spot.z, spot, r };
  }
  /** The `i`-th prisoner of `side`'s lid, in the room. */
  private prisonerWorld(side: 0 | 1, i: number) {
    const at = this.prisonerSpot(i),
      lid = this.lids[side].position;
    return new T.Vector3(lid.x + at.x, lid.y + at.y, lid.z + at.z);
  }
  private setStone(mesh: T.InstancedMesh, i: number, x: number, y: number, z: number, r: number, tiltX = 0, turn = 0, tiltZ = 0) {
    this.matrix.compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(tiltX, turn, tiltZ)), new T.Vector3(r, r * 0.5, r));
    mesh.setMatrixAt(i, this.matrix);
  }
  /** Lays the state out, leaving out the stone on `hidden` and filling the lids to `lids`. */
  private lay(state: State, hidden = -1, lids: [number, number] = state.captured, lastShown = true) {
    const size = this.size,
      r = stoneRadius(size),
      lift = stoneLift(size),
      dead = new Set(state.dead),
      counts = [0, 0],
      deadCounts = [0, 0],
      marks = [0, 0];
    state.cells.forEach((owner, p) => {
      if (owner === null || p === hidden) return;
      const at = pointAt(size, p);
      if (dead.has(p)) this.setStone(this.deadStones[owner], deadCounts[owner]++, at.x, lift, at.z, r);
      else this.setStone(this.onBoard[owner], counts[owner]++, at.x, lift, at.z, r);
    });
    for (const side of [0, 1] as const) {
      this.onBoard[side].count = counts[side];
      this.deadStones[side].count = deadCounts[side];
      this.onBoard[side].instanceMatrix.needsUpdate = this.deadStones[side].instanceMatrix.needsUpdate = true;
    }
    // At the end of a counted game: each side's territory, a small square of its colour on each point (over a dead stone, on top of it).
    if (state.area)
      state.area.forEach((owner, p) => {
        if (owner === null) return;
        const at = pointAt(size, p),
          y = dead.has(p) ? lift + stoneHalf(size) + 0.012 : BOARD_TOP + 0.012;
        this.matrix.makeTranslation(at.x, y, at.z);
        this.territory[owner].setMatrixAt(marks[owner]++, this.matrix);
      });
    for (const side of [0, 1] as const) {
      this.territory[side].count = marks[side];
      this.territory[side].instanceMatrix.needsUpdate = true;
      const many = Math.min(lids[side], this.size * this.size);
      for (let i = 0; i < many; i++) {
        const at = this.prisonerSpot(i);
        this.setStone(this.prisoners[side], i, at.x, at.y, at.z, at.r, at.spot.tiltX, at.spot.turn, at.spot.tiltZ);
      }
      this.prisoners[side].count = many;
      this.prisoners[side].instanceMatrix.needsUpdate = true;
    }
    const last = state.last;
    for (const mark of this.lastMark) mark.visible = false;
    if (lastShown && last && last.point < PASS && state.cells[last.point] === last.side && state.winner === null) {
      const mark = this.lastMark[last.side],
        at = pointAt(size, last.point);
      mark.position.set(at.x, lift + stoneHalf(size) + 0.003, at.z);
      mark.visible = true;
    }
    this.koMarks.clear();
    if (state.winner === null)
      for (const p of koPoints(state)) {
        const at = pointAt(size, p),
          mark = new T.Mesh(this.koMark.geometry, this.koMark.material);
        mark.position.set(at.x, BOARD_TOP + 0.008, at.z);
        this.koMarks.add(mark);
      }
    this.showGhost();
  }
  protected place(state: State) {
    this.flying.clear();
    this.lay(state);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || last.point >= PASS || state.ply !== before.ply + 1) return false;
    const size = this.size,
      r = stoneRadius(size),
      lift = stoneLift(size),
      at = pointAt(size, last.point);
    // The board as it will be, without the stone being set down; the lids as they were.
    this.flying.clear();
    this.lay(state, last.point, before.captured, false);
    const falling = new T.Mesh(this.stone, this.paint[last.side]);
    falling.castShadow = true;
    falling.position.set(at.x, lift + 0.65, at.z);
    falling.scale.set(r, r * 0.5, r);
    this.flying.add(falling);
    let landed = false;
    this.tween(0, 280, (t) => {
      falling.position.y = lift + 0.65 * fall(t);
      falling.scale.set(r, r * 0.5 * (1 + Math.sin(t * Math.PI) * 0.15), r);
      if (t > 0.82 && !landed) {
        landed = true;
        this.onContact();
      }
    });
    // The stones it took are lifted off, one after another, and carried into the taker's lid.
    const taker = last.side,
      owner = (1 - taker) as 0 | 1;
    let heard = false;
    last.removed.forEach((p, k) => {
      const from = pointAt(size, p),
        start = new T.Vector3(from.x, lift, from.z),
        end = this.prisonerWorld(taker, before.captured[taker] + k),
        mesh = new T.Mesh(this.stone, this.paint[owner]);
      mesh.position.copy(start);
      mesh.scale.set(r, r * 0.5, r);
      mesh.castShadow = true;
      this.flying.add(mesh);
      const spot = this.prisonerSpot(before.captured[taker] + k),
        peak = 0.9 + start.distanceTo(end) * 0.12;
      this.tween(300 + Math.min(k * 45, 700), 560, (t) => {
        const along = travel(t);
        mesh.position.lerpVectors(start, end, along);
        mesh.position.y = start.y + (end.y - start.y) * along + hop(t) * peak;
        const s = r + (spot.r - r) * along;
        mesh.scale.set(s, s * 0.5, s);
        mesh.rotation.set(spot.spot.tiltX * along, spot.spot.turn * along, spot.spot.tiltZ * along);
        if (t >= 0.84 && !heard) {
          heard = true;
          this.onContact();
        }
      });
    });
    return true;
  }
  /** A faint stone of the side to move over the empty point the mouse is on, where a click would set it. */
  private showGhost() {
    const state = this.state;
    this.ghost.visible = false;
    if (!state || state.winner !== null || this.hovered < 0 || !this.marks.targets.includes(this.hovered)) return;
    const at = pointAt(this.size, this.hovered);
    this.ghost.material = this.ghostPaint[state.turn];
    this.ghost.position.set(at.x, stoneLift(this.size), at.z);
    this.ghost.visible = true;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.showGhost();
  }
  protected mark(marks: Marks) {
    this.cursor.visible = marks.cursor !== null && marks.cursor >= 0 && marks.cursor < this.size * this.size;
    if (this.cursor.visible) {
      const at = pointAt(this.size, marks.cursor!);
      this.cursor.position.set(at.x, BOARD_TOP + 0.01, at.z);
    }
    this.showGhost();
  }
}
