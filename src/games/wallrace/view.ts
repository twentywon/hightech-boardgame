import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELLS, G, H_BASE, N, V_BASE, type State } from "./rules";

const STEP = 1,
  SUBJECT: TableSubject = { half: 5.3, halfZ: 6.1, height: 1.2, lookY: 0, tilt: 1.0 };
export const PAWN_COLORS: [string, string] = ["#c8452f", "#2f62c0"];
/** Centre of a square, or of the gap a wall is set from. */
export function pointAt(point: number) {
  if (point < CELLS) return { x: ((point % N) - 4) * STEP, z: (Math.floor(point / N) - 4) * STEP };
  const across = point < V_BASE,
    crossing = point - (across ? H_BASE : V_BASE),
    r = Math.floor(crossing / G),
    c = crossing % G;
  // A wall across is taken by the gap under its left square; an upright one by the gap right of its upper square.
  return across ? { x: (c - 4) * STEP, z: (r - 3.5) * STEP } : { x: (c - 3.5) * STEP, z: (r - 4) * STEP };
}
export const racePoints = () => Array.from({ length: V_BASE + G * G }, (_, i) => pointAt(i));
/** A grooved board, two pawns and the walls set between the squares. */
export class WallRaceView extends TableView<State> {
  private pawns: T.Mesh[] = [];
  private walls = new Map<number, T.Mesh>();
  private slab: T.BufferGeometry;
  private timber: T.Material;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private ghost: T.Mesh;
  private hovered = -1;
  private stores: T.Mesh[][] = [[], []];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3b2a1e");
    this.daylight("#fff4dc", "#3a2c22", "#fff0d2", 9);
    const table = this.add(new T.PlaneGeometry(90, 90), this.standard({ map: this.own(wood(true)) }), 0, -0.3, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    this.add(new T.BoxGeometry(N * STEP + 0.5, 0.2, N * STEP + 0.5), this.standard({ color: "#2b1d14", roughness: 0.6 }), 0, -0.2, 0);
    const square = this.own(new T.BoxGeometry(STEP - 0.2, 0.12, STEP - 0.2)),
      plain = this.standard({ color: "#b98a56", roughness: 0.6 }),
      goals = PAWN_COLORS.map((color) => this.standard({ color, roughness: 0.7 }));
    for (let cell = 0; cell < CELLS; cell++) {
      const p = pointAt(cell),
        row = Math.floor(cell / N),
        // Each side's goal row carries its colour.
        mesh = new T.Mesh(square, row === 0 ? goals[0] : row === N - 1 ? goals[1] : plain);
      mesh.position.set(p.x, -0.06, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const pawn = this.own(new T.CylinderGeometry(0.16, 0.3, 0.62, 24)),
      head = this.own(new T.SphereGeometry(0.2, 18, 14));
    PAWN_COLORS.forEach((color) => {
      const paint = this.standard({ color, roughness: 0.35 }),
        mesh = new T.Mesh(pawn, paint),
        top = new T.Mesh(head, paint);
      top.position.y = 0.42;
      mesh.add(top);
      mesh.castShadow = top.castShadow = true;
      this.pawns.push(mesh);
      this.scene.add(mesh);
    });
    this.slab = this.own(new T.BoxGeometry(2 * STEP - 0.2, 0.5, 0.14));
    this.timber = this.standard({ color: "#e8cf9a", roughness: 0.5 });
    // Walls not yet set wait beside the board, each side's on its own edge.
    for (const side of [0, 1])
      for (let k = 0; k < 10; k++) {
        const mesh = new T.Mesh(this.slab, this.timber);
        mesh.position.set((k - 4.5) * 0.9, 0, (side === 0 ? 1 : -1) * (N * STEP * 0.5 + 0.75));
        mesh.rotation.y = Math.PI / 2;
        mesh.scale.set(0.42, 1, 1);
        mesh.castShadow = true;
        this.stores[side].push(mesh);
        this.scene.add(mesh);
      }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 6; i++) {
      const ring = ringMesh(own, 0.28, 0.36, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.3, 0.38, "#ffffff");
    this.ghost = new T.Mesh(this.slab, this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.6, depthWrite: false })));
    this.ghost.visible = false;
    this.scene.add(this.cursor, this.ghost);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  protected spots(): Spot[] {
    return racePoints().map((p, point) => ({ ...p, y: 0, r: point < CELLS ? 0.36 : 0.27, point }));
  }
  /** Where the wall of a point lies: centred on its crossing. */
  private wallPose(point: number) {
    const across = point < V_BASE,
      crossing = point - (across ? H_BASE : V_BASE);
    return { x: ((crossing % G) - 3.5) * STEP, z: (Math.floor(crossing / G) - 3.5) * STEP, turn: across ? 0 : Math.PI / 2 };
  }
  protected place(state: State) {
    state.pawns.forEach((cell, side) => this.pawns[side].position.set(pointAt(cell).x, 0.31, pointAt(cell).z));
    const standing = new Set<number>();
    state.h.forEach((set, i) => set && standing.add(H_BASE + i));
    state.v.forEach((set, i) => set && standing.add(V_BASE + i));
    for (const [point, mesh] of this.walls)
      if (!standing.has(point)) {
        this.scene.remove(mesh);
        this.walls.delete(point);
      }
    for (const point of standing) {
      let mesh = this.walls.get(point);
      if (!mesh) {
        mesh = new T.Mesh(this.slab, this.timber);
        mesh.castShadow = true;
        this.walls.set(point, mesh);
        this.scene.add(mesh);
      }
      const pose = this.wallPose(point);
      mesh.position.set(pose.x, 0.25, pose.z);
      mesh.rotation.y = pose.turn;
    }
    this.stores.forEach((store, side) => store.forEach((mesh, k) => (mesh.visible = k < state.left[side])));
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    if (state.last < CELLS) {
      const pawn = this.pawns[before.turn],
        a = pointAt(before.pawns[before.turn]),
        b = pointAt(state.last);
      this.tween(0, 260, (p) => {
        pawn.position.set(a.x + (b.x - a.x) * p, 0.31 + Math.sin(Math.PI * p) * 0.4, a.z + (b.z - a.z) * p);
        if (p === 1) this.onContact();
      });
      return true;
    }
    this.place(state);
    const mesh = this.walls.get(state.last)!;
    this.tween(0, 240, (p) => {
      mesh.position.y = 0.25 + 1.4 * (1 - p * p);
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  protected mark(marks: Marks) {
    const cells = marks.targets.filter((point) => point < CELLS);
    this.rings.forEach((ring, i) => {
      ring.visible = i < cells.length;
      if (i < cells.length) ring.position.set(pointAt(cells[i]).x, 0.02, pointAt(cells[i]).z);
    });
    const cursor = marks.cursor;
    this.cursor.visible = cursor !== null && cursor < CELLS;
    if (cursor !== null && cursor < CELLS) this.cursor.position.set(pointAt(cursor).x, 0.03, pointAt(cursor).z);
    // The wall that a tap, or Enter, would set.
    const wall = this.hovered >= CELLS ? this.hovered : cursor !== null && cursor >= CELLS ? cursor : -1;
    this.ghost.visible = wall >= 0 && marks.targets.includes(wall);
    if (this.ghost.visible) {
      const pose = this.wallPose(wall);
      this.ghost.position.set(pose.x, 0.25, pose.z);
      this.ghost.rotation.y = pose.turn;
    }
  }
}
