import * as T from "three";
import { capable, glossy, hop, planks, travel } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELLS, G, H_BASE, N, V_BASE, open, type State } from "./rules";
import { FACE_Y, SLAT, STEP, STORE_Z, board, pawnGeometry, slat, surroundings } from "./props";

const SUBJECT: TableSubject = { half: 5.3, halfZ: 6.1, height: 1.2, lookY: 0, tilt: 1.0 },
  STEP_TIME = 320,
  WALL_TIME = 640;
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
/** Where the `k`-th waiting wall of a side stands in its storage grooves: five to a groove, end to end. */
function storeAt(side: number, k: number) {
  const groove = Math.floor(k / 5),
    along = k % 5;
  return { x: (along - 2) * (SLAT.long + 0.04) * (side ? -1 : 1), z: (side ? -1 : 1) * STORE_Z[groove] };
}
/** The squares of a shortest way from a pawn to its goal row, not counting the square it stands on. */
function shortestWay(state: State, side: number) {
  const goal = side === 0 ? 0 : N - 1,
    from = new Int16Array(CELLS).fill(-1),
    start = state.pawns[side];
  from[start] = start;
  let frontier = [start];
  while (frontier.length) {
    const next: number[] = [];
    for (const cell of frontier) {
      if (Math.floor(cell / N) === goal) {
        const way: number[] = [];
        for (let at = cell; at !== start; at = from[at]) way.push(at);
        return way.reverse();
      }
      // Toward the goal first, so that the way shown runs straight where it can.
      for (const [dr, dc] of side === 0 ? [[-1, 0], [0, -1], [0, 1], [1, 0]] : [[1, 0], [0, -1], [0, 1], [-1, 0]])
        if (open(state, cell, dr, dc)) {
          const to = cell + dr * N + dc;
          if (from[to] < 0) {
            from[to] = cell;
            next.push(to);
          }
        }
    }
    frontier = next;
  }
  return [];
}
/** A soft round glow on a square, for where a pawn may step. */
function pool(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(0.75, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
/** A wooden board with grooves, two turned pawns and pale slats that slide into the grooves. */
export class WallRaceView extends TableView<State> {
  private pawns: T.Mesh[] = [];
  private walls = new Map<number, T.Mesh>();
  private slab: T.BufferGeometry;
  private timber: T.Material;
  private steps: T.Mesh[] = [];
  private way: T.InstancedMesh;
  private cursor: T.Mesh;
  private ghost: T.Mesh;
  private hovered = -1;
  private stores: T.Mesh[][] = [[], []];
  private glowMaterial: T.MeshBasicMaterial;
  private rich = capable();
  private ticking = 0;
  /** When the winner began to cheer, or 0. */
  private cheering = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3b2a1e");
    this.daylight("#fff4dc", "#3a2c22", "#fff0d2", 9);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    const table = this.add(new T.PlaneGeometry(90, 90), this.standard(planks(11, own)), 0, -0.5, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    // The board stands on the table on its own thickness.
    board(this.scene, own, PAWN_COLORS);
    surroundings(this.scene, own);
    const shape = this.own(pawnGeometry());
    PAWN_COLORS.forEach((color) => {
      const paint = this.rich ? this.own(glossy({ color, roughness: 0.32 }, 0.9)) : this.standard({ color, roughness: 0.35 }),
        mesh = new T.Mesh(shape, paint);
      mesh.castShadow = mesh.receiveShadow = true;
      this.pawns.push(mesh);
      this.scene.add(mesh);
    });
    ({ geometry: this.slab, material: this.timber } = slat(own));
    for (const side of [0, 1])
      for (let k = 0; k < 10; k++) {
        const mesh = new T.Mesh(this.slab, this.timber),
          at = storeAt(side, k);
        mesh.position.set(at.x, SLAT.high / 2 - 0.06, at.z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.stores[side].push(mesh);
        this.scene.add(mesh);
      }
    // Where the pawn may step: soft pools of light; the way it would take: small dots.
    const glow = this.own(new T.CanvasTexture(pool(128)));
    this.glowMaterial = this.own(new T.MeshBasicMaterial({ map: glow, color: "#ffd24a", transparent: true, opacity: 0.9, depthWrite: false }));
    const pad = this.own(new T.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2));
    for (let i = 0; i < 6; i++) {
      const mesh = new T.Mesh(pad, this.glowMaterial);
      mesh.visible = false;
      mesh.renderOrder = 5;
      this.steps.push(mesh);
      this.scene.add(mesh);
    }
    this.way = new T.InstancedMesh(
      this.own(new T.CircleGeometry(0.07, 16).rotateX(-Math.PI / 2)),
      this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false })),
      CELLS,
    );
    this.way.count = 0;
    this.way.renderOrder = 4;
    this.scene.add(this.way);
    this.cursor = ringMesh(own, 0.3, 0.38, "#ffffff");
    this.ghost = new T.Mesh(this.slab, this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.55, depthWrite: false })));
    this.ghost.visible = false;
    this.scene.add(this.cursor, this.ghost);
    this.begin();
    if (this.rich && !this.reducedMotion) this.ticking = requestAnimationFrame(this.tick);
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
  private standing(state: State) {
    const out = new Set<number>();
    state.h.forEach((set, i) => set && out.add(H_BASE + i));
    state.v.forEach((set, i) => set && out.add(V_BASE + i));
    return out;
  }
  protected place(state: State) {
    state.pawns.forEach((cell, side) => {
      this.pawns[side].position.set(pointAt(cell).x, FACE_Y, pointAt(cell).z);
      this.pawns[side].rotation.set(0, 0, 0);
    });
    const standing = this.standing(state);
    for (const [point, mesh] of this.walls)
      if (!standing.has(point)) {
        this.scene.remove(mesh);
        this.walls.delete(point);
      }
    for (const point of standing) {
      let mesh = this.walls.get(point);
      if (!mesh) {
        mesh = new T.Mesh(this.slab, this.timber);
        mesh.castShadow = mesh.receiveShadow = true;
        this.walls.set(point, mesh);
        this.scene.add(mesh);
      }
      const pose = this.wallPose(point);
      // Sunk a little into its groove.
      mesh.position.set(pose.x, SLAT.high / 2 - 0.04, pose.z);
      mesh.rotation.set(0, pose.turn, 0);
    }
    this.stores.forEach((store, side) => store.forEach((mesh, k) => (mesh.visible = k < state.left[side])));
    if (state.winner === null) this.cheering = 0;
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    const side = before.turn;
    if (state.last < CELLS) {
      const pawn = this.pawns[side],
        a = pointAt(before.pawns[side]),
        b = pointAt(state.last),
        far = Math.hypot(b.x - a.x, b.z - a.z) > 1.5,
        lean = new T.Vector3(b.z - a.z, 0, -(b.x - a.x)).normalize();
      this.tween(0, far ? STEP_TIME + 120 : STEP_TIME, (p) => {
        const t = travel(p);
        pawn.position.set(a.x + (b.x - a.x) * t, FACE_Y + hop(p) * (far ? 0.9 : 0.55), a.z + (b.z - a.z) * t);
        // It leans into the hop and rights itself as it lands.
        const tip = p < 0.84 ? Math.sin((p / 0.84) * Math.PI) * 0.22 : 0;
        pawn.quaternion.setFromAxisAngle(lean, -tip);
        if (p === 1) {
          pawn.rotation.set(0, 0, 0);
          this.onContact();
          if (state.winner !== null) this.cheer();
        }
      });
      return true;
    }
    // A wall rises from its groove at the side's edge, is carried over and slides down into its groove with a knock.
    this.place(state);
    const mesh = this.walls.get(state.last)!,
      from = storeAt(side, state.left[side]),
      pose = this.wallPose(state.last),
      rest = SLAT.high / 2 - 0.04,
      high = 1.1;
    this.tween(0, WALL_TIME, (p) => {
      if (p < 0.72) {
        const q = p / 0.72,
          t = q * q * (3 - 2 * q);
        mesh.position.set(from.x + (pose.x - from.x) * t, rest + 0.04 + Math.sin(Math.min(1, q * 1.6) * Math.PI * 0.5) * high, from.z + (pose.z - from.z) * t);
        mesh.rotation.set(0, pose.turn * t, Math.sin(q * Math.PI) * 0.12);
      } else {
        const q = (p - 0.72) / 0.28;
        mesh.position.set(pose.x, rest + high * (1 - q * q) + 0.04 * (1 - q), pose.z);
        mesh.rotation.set(0, pose.turn, 0);
      }
      if (p === 1) {
        mesh.position.y = rest;
        this.onContact();
      }
    });
    return true;
  }
  /** The winner hops for joy on its goal row: decoration after the game, not an animation that holds the table. */
  private cheer() {
    if (this.reducedMotion) return;
    this.cheering = performance.now();
    if (!this.ticking) this.ticking = requestAnimationFrame(this.tick);
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = 0;
    let again = false;
    if (this.rich && !this.reducedMotion) {
      // The pools breathe softly.
      this.glowMaterial.opacity = 0.72 + 0.2 * Math.sin(now / 300);
      again = true;
      this.redraw();
    }
    const state = this.state;
    if (this.cheering && state && state.winner !== null && !this.animating) {
      const t = (now - this.cheering) / 1000,
        pawn = this.pawns[state.winner as number];
      if (t < 2.4) {
        pawn.position.y = FACE_Y + Math.abs(Math.sin(t * Math.PI * 2.5)) * 0.35 * (1 - t / 2.4);
        pawn.rotation.y = t * 4;
        again = true;
      } else {
        pawn.position.y = FACE_Y;
        this.cheering = 0;
      }
      this.redraw();
    }
    if (again) this.ticking = requestAnimationFrame(this.tick);
  };
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  protected mark(marks: Marks) {
    const cells = marks.targets.filter((point) => point < CELLS),
      state = this.state;
    this.steps.forEach((mesh, i) => {
      mesh.visible = i < cells.length;
      if (i < cells.length) mesh.position.set(pointAt(cells[i]).x, FACE_Y + 0.004, pointAt(cells[i]).z);
    });
    // The shortest way to the goal of the side choosing, in small dots: only while it chooses, and not in pictures.
    const way = state && cells.length && !capturing() ? shortestWay(state, state.turn) : [],
      m = new T.Matrix4();
    way.forEach((cell, i) => this.way.setMatrixAt(i, m.makeTranslation(pointAt(cell).x, FACE_Y + 0.006, pointAt(cell).z)));
    this.way.count = way.length;
    this.way.instanceMatrix.needsUpdate = true;
    if (state) (this.way.material as T.MeshBasicMaterial).color.set(PAWN_COLORS[state.turn]).lerp(new T.Color("#ffffff"), 0.35);
    const cursor = marks.cursor;
    this.cursor.visible = cursor !== null && cursor < CELLS;
    if (cursor !== null && cursor < CELLS) this.cursor.position.set(pointAt(cursor).x, FACE_Y + 0.008, pointAt(cursor).z);
    // The wall that a tap, or Enter, would set.
    const wall = this.hovered >= CELLS ? this.hovered : cursor !== null && cursor >= CELLS ? cursor : -1;
    this.ghost.visible = wall >= 0 && marks.targets.includes(wall);
    if (this.ghost.visible) {
      const pose = this.wallPose(wall);
      this.ghost.position.set(pose.x, SLAT.high / 2, pose.z);
      this.ghost.rotation.set(0, pose.turn, 0);
    }
  }
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
