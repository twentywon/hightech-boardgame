import * as T from "three";
import { capable, hop } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DRAW, LEFT, RIGHT, TILES, type Laid, type State } from "./rules";
import { CUP, cafe } from "./cafe";
import { LENGTH, THICK, U, WIDTH, brass, tileGeometry, tileMaterial } from "./tiles";

const SUBJECT: TableSubject = { half: 5.6, halfZ: 4.9, height: 0.6, lookY: 0, tilt: 1.08 };
export const DOMINO_COLORS: [string, string] = ["#f3ede0", "#8a8f98"];
/** Where the line begins, and how far each arm runs before it turns at the edge of the table. */
const START = { x: 0.3, z: -0.35 },
  REACH_RIGHT = 4.5,
  REACH_LEFT = 3.1,
  /** The right arm, coming back toward the pile a row nearer me. */
  REACH_BACK = 3.7,
  /** A small gap between tiles that touch. */
  GAP = 0.025,
  HAND_Z = 4.1,
  THEIR_Z = -4.4,
  /** The pile: three across, three down, two layers. */
  PILE = { x: -5.6, z: -2.55, step: U + 0.08, row: U * 2 + 0.08 },
  LAY = 540,
  MOVE = 380;
const AXIS_Y = new T.Vector3(0, 1, 0),
  AXIS_X = new T.Vector3(1, 0, 0);
interface Pose {
  x: number;
  y: number;
  z: number;
  q: T.Quaternion;
}
/** A tile lying flat with its first half toward `-along` (a direction on the table), face up or down. */
function lying(x: number, z: number, along: { x: number; z: number }, up: boolean, y = THICK / 2): Pose {
  // A turn about y takes the tile's +x to (cos θ, −sin θ).
  const yaw = new T.Quaternion().setFromAxisAngle(AXIS_Y, Math.atan2(-along.z, along.x)),
    q = up ? yaw : yaw.multiply(new T.Quaternion().setFromAxisAngle(AXIS_X, Math.PI));
  return { x, y, z, q };
}
/** A tile of the computer's hand: standing on its end, its face turned away from me. */
const STANDING = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, -1), new T.Vector3(-1, 0, 0)));
/**
 * Where the tiles of the line lie. The first tile laid stays where it was put; the line grows from it both ways,
 * and each arm turns a corner at the edge of the table and comes back a row further out (the right arm toward me,
 * the left away), so that nothing already laid moves when a tile is added. Doubles lie across. `first` is the
 * index in `line` of the tile laid first.
 */
export function linePoses(line: Laid[], first: number) {
  const poses = new Map<number, Pose>(),
    ends: { x: number; z: number; dx: number; dz: number }[] = [];
  if (!line.length) return { poses, ends: [{ x: START.x, z: START.z, dx: -1, dz: 0 }, { x: START.x, z: START.z, dx: 1, dz: 0 }] };
  const anchor = line[first],
    double = (laid: Laid) => laid.left === laid.right,
    // The texture's first half shows the tile's lower number: it points toward the half `low` is in.
    put = (laid: Laid, x: number, z: number, outward: { x: number; z: number }, inner: number) => {
      const [a] = TILES[laid.tile],
        // Local +x points from the first half to the second; the outer half lies `outward`.
        lowOuter = a !== inner,
        along = lowOuter ? { x: -outward.x, z: -outward.z } : outward;
      poses.set(laid.tile, lying(x, z, double(laid) ? { x: -outward.z, z: outward.x } : along, true));
    };
  {
    const length = double(anchor) ? WIDTH : LENGTH;
    put(anchor, START.x, START.z, { x: 1, z: 0 }, anchor.left);
    ends.push({ x: START.x - length / 2 - GAP, z: START.z, dx: -1, dz: 0 }, { x: START.x + length / 2 + GAP, z: START.z, dx: 1, dz: 0 });
  }
  for (const side of [0, 1]) {
    const arm = side ? line.slice(first + 1) : line.slice(0, first).reverse(),
      turn = side ? 1 : -1;
    let { x, z, dx, dz } = ends[side];
    arm.forEach((laid, i) => {
      const inner = side ? laid.left : laid.right,
        long = double(laid) ? WIDTH : LENGTH,
        // A double cannot turn: the tile before it turns early when the double would run past the edge.
        after = arm[i + 1] && double(arm[i + 1]) ? WIDTH + GAP : 0;
      // Going back toward the pile, the far arm stops short of it.
      const reach = dx < 0 ? (side ? REACH_BACK : REACH_LEFT) : REACH_RIGHT,
        // A double never turns a corner: it lies across where it is, and the tile after it turns.
        corner = !double(laid) && (dz !== 0 || Math.abs(x + dx * (long + after)) > reach);
      if (corner) {
        // Round the corner: the tile's first half just past the end, across the line, the rest along the new way.
        const [nx, nz] = dz !== 0 ? [x > START.x ? -1 : 1, 0] : [0, turn],
          cx = x + dx * (WIDTH / 2) + nx * (LENGTH / 2 - WIDTH / 2),
          cz = z + dz * (WIDTH / 2) + nz * (LENGTH / 2 - WIDTH / 2);
        put(laid, cx, cz, { x: nx, z: nz }, inner);
        x = cx + nx * (LENGTH / 2 + GAP);
        z = cz + nz * (LENGTH / 2 + GAP);
        dx = nx;
        dz = nz;
        return;
      }
      put(laid, x + dx * (long / 2), z + dz * (long / 2), { x: dx, z: dz }, inner);
      x += dx * (long + GAP);
      z += dz * (long + GAP);
    });
    ends[side] = { x, z, dx, dz };
  }
  return { poses, ends };
}
/** Dominoes on a café table: ivory-and-ebony tiles with inset pips and brass spinners on a marble top. */
export class DominoView extends TableView<State> {
  private tiles: T.Mesh[] = [];
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private glow: T.Mesh;
  private poses = new Map<number, Pose>();
  private endSpots: { x: number; z: number }[] = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  /** The tile laid first in the game shown, which stays where it is. */
  private anchor = -1;
  /** Wisps of steam over the coffee, where a graphics card draws and motion is allowed. */
  private steam: T.Mesh[] = [];
  private ticking = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a2420");
    this.daylight("#fff1dc", "#2a211b", "#ffe6c0", 9, 2.1);
    cafe(this.scene, (r) => this.own(r));
    const shape = this.own(tileGeometry()),
      spinner = brass((r) => this.own(r));
    TILES.forEach(([a, b]) => {
      const mesh = new T.Mesh(shape, [tileMaterial(a, b, (r) => this.own(r)), spinner]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.tiles.push(mesh);
      this.scene.add(mesh);
    });
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 2; i++) {
      const ring = ringMesh(own, 0.3, 0.4, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.5, 0.58, "#ffffff");
    this.scene.add(this.cursor);
    // A soft light under the tile laid last.
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!,
      g = ctx.createRadialGradient(64, 32, 4, 64, 32, 62);
    g.addColorStop(0, "rgba(255,214,120,0.9)");
    g.addColorStop(0.55, "rgba(255,200,90,0.35)");
    g.addColorStop(1, "rgba(255,190,80,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 64);
    const glowMap = this.own(new T.CanvasTexture(c));
    glowMap.colorSpace = T.SRGBColorSpace;
    this.glow = new T.Mesh(this.own(new T.PlaneGeometry(LENGTH + 0.9, WIDTH + 0.7).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ map: glowMap, transparent: true, depthWrite: false })));
    this.glow.position.y = 0.006;
    this.glow.renderOrder = 4;
    this.glow.visible = false;
    this.scene.add(this.glow);
    if (capable() && !this.reducedMotion) {
      const puff = document.createElement("canvas");
      puff.width = puff.height = 64;
      const pen = puff.getContext("2d")!,
        soft = pen.createRadialGradient(32, 32, 0, 32, 32, 32);
      soft.addColorStop(0, "rgba(255,255,255,0.5)");
      soft.addColorStop(1, "rgba(255,255,255,0)");
      pen.fillStyle = soft;
      pen.fillRect(0, 0, 64, 64);
      const map = this.own(new T.CanvasTexture(puff)),
        shape = this.own(new T.PlaneGeometry(0.5, 0.7));
      for (let i = 0; i < 4; i++) {
        const wisp = new T.Mesh(shape, this.own(new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0 })));
        wisp.renderOrder = 6;
        this.steam.push(wisp);
        this.scene.add(wisp);
      }
      this.ticking = requestAnimationFrame(this.tick);
    }
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  /** The steam rises, sways and thins out, a wisp after another. */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    const t = now / 1000;
    this.steam.forEach((wisp, i) => {
      const age = (t * 0.28 + i / this.steam.length) % 1;
      wisp.position.set(CUP.x + Math.sin(t * 0.9 + i * 2) * 0.12 * age, CUP.y + 0.2 + age * 1.4, CUP.z + Math.cos(t * 0.7 + i) * 0.08 * age);
      wisp.scale.setScalar(0.6 + age * 1.1);
      wisp.quaternion.copy(this.camera.quaternion);
      (wisp.material as T.MeshBasicMaterial).opacity = Math.sin(age * Math.PI) * 0.35;
    });
    this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
  /** Which tile of the line was laid first: remembered as the game is followed, found again after a new deal. */
  private first(state: State) {
    if (state.line.length <= 1) this.anchor = state.line[0]?.tile ?? -1;
    const at = state.line.findIndex((laid) => laid.tile === this.anchor);
    if (at >= 0) return at;
    this.anchor = state.line[Math.floor(state.line.length / 2)].tile;
    return Math.floor(state.line.length / 2);
  }
  /** Where every tile lies in a state: the line, my hand face up, the other hand on end and the pile face down. */
  private arrange(state: State) {
    const { poses, ends } = linePoses(state.line, state.line.length ? this.first(state) : 0);
    const mine = state.hands[0],
      theirs = state.hands[1],
      spread = (tiles: number[], i: number) => (i - (tiles.length - 1) / 2) * (U + 0.12);
    mine.forEach((tile, i) => poses.set(tile, lying(spread(mine, i), HAND_Z, { x: 0, z: -1 }, true)));
    theirs.forEach((tile, i) =>
      poses.set(tile, state.winner !== null ? lying(spread(theirs, i), THEIR_Z, { x: 0, z: 1 }, true) : { x: spread(theirs, i), y: LENGTH / 2, z: THEIR_Z - 0.2, q: STANDING }),
    );
    state.stock.forEach((tile, i) => {
      const layer = Math.floor(i / 9),
        k = i % 9;
      poses.set(tile, lying(PILE.x + (k % 3) * PILE.step + layer * 0.06, PILE.z + Math.floor(k / 3) * PILE.row + layer * 0.08, { x: 0, z: 1 }, false, THICK / 2 + layer * (THICK + 0.004)));
    });
    // The rings for a tile that fits both ends stand just beyond each end.
    this.endSpots = ends.map((end) => (state.line.length ? { x: end.x + end.dx * 0.42, z: end.z + end.dz * 0.42 } : { x: START.x, z: START.z }));
    return poses;
  }
  private put(mesh: T.Mesh, pose: Pose) {
    mesh.position.set(pose.x, pose.y, pose.z);
    mesh.quaternion.copy(pose.q);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const out: Spot[] = state.hands[0].map((tile) => ({ x: this.poses.get(tile)!.x, y: 0.1, z: this.poses.get(tile)!.z, r: 0.42, point: tile }));
    out.push({ ...this.endSpots[0], y: 0.1, r: 0.7, point: LEFT }, { ...this.endSpots[1], y: 0.1, r: 0.7, point: RIGHT });
    if (state.stock.length) out.push({ x: PILE.x + PILE.step, y: 0.2, z: PILE.z + PILE.row, r: 1.6, point: DRAW });
    return out;
  }
  /** The glow under the tile laid last, left out of pictures. */
  private lastLaid(state: State) {
    const last = state.last && "tile" in state.last ? this.poses.get(state.last.tile) : undefined;
    this.glow.visible = !!last && !capturing();
    if (last) {
      this.glow.position.set(last.x, 0.006, last.z);
      this.glow.quaternion.copy(last.q);
      this.glow.rotation.x = this.glow.rotation.z = 0;
    }
  }
  protected place(state: State) {
    this.poses = this.arrange(state);
    this.tiles.forEach((mesh, tile) => this.put(mesh, this.poses.get(tile)!));
    this.lastLaid(state);
  }
  protected animate(before: State, state: State) {
    if (state.ply !== before.ply + 1) return false;
    const from = this.poses,
      to = this.arrange(state),
      laid = state.last && "tile" in state.last ? state.last.tile : -1,
      moved = this.tiles
        .map((_, tile) => tile)
        .filter((tile) => {
          const a = from.get(tile),
            b = to.get(tile)!;
          return !a || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.y - b.y) > 0.01 || a.q.angleTo(b.q) > 0.01;
        });
    if (!moved.length) return false;
    this.glow.visible = false;
    const q = new T.Quaternion();
    // The tile laid flies over, comes down a little short of its place and slides into touch with a click.
    if (laid >= 0) {
      const a = from.get(laid)!,
        b = to.get(laid)!,
        mesh = this.tiles[laid],
        // Short of its place, back along the way it is pushed: from the end it joins.
        back = this.slideFrom(state, laid, b);
      this.tween(0, LAY, (p) => {
        const flight = Math.min(1, p / 0.66),
          e = flight * flight * (3 - 2 * flight),
          slide = p <= 0.66 ? 0 : (p - 0.66) / 0.34,
          s = 1 - (1 - slide) * (1 - slide),
          ax = a.x + (back.x - a.x) * e,
          az = a.z + (back.z - a.z) * e;
        mesh.position.set(ax + (b.x - back.x) * s, b.y + (a.y - b.y) * (1 - e) + hop(Math.min(0.84, flight * 0.84)) * 0.9, az + (b.z - back.z) * s);
        mesh.quaternion.copy(q.copy(a.q).slerp(b.q, Math.min(1, flight * 1.15)));
        if (p === 1) {
          this.onContact();
          this.lastLaid(state);
        }
      });
    }
    // Everything else that moves (a drawn tile, a hand closing up, the other hand laid open) glides or flips over.
    const rest = moved.filter((tile) => tile !== laid);
    if (rest.length)
      this.tween(0, MOVE, (p) => {
        const e = p * p * (3 - 2 * p);
        rest.forEach((tile, i) => {
          const a = from.get(tile) ?? to.get(tile)!,
            b = to.get(tile)!,
            mesh = this.tiles[tile],
            far = Math.hypot(b.x - a.x, b.z - a.z) > 1.5 || a.q.angleTo(b.q) > 0.3,
            // The other hand turns over one tile after another.
            k = state.winner !== null && before.winner === null ? Math.max(0, Math.min(1, (p - i * 0.06) / 0.6)) : e;
          mesh.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k + (far ? Math.sin(Math.PI * k) * 0.6 : 0), a.z + (b.z - a.z) * k);
          mesh.quaternion.copy(q.copy(a.q).slerp(b.q, k));
        });
        if (p === 1 && laid < 0 && "drew" in (state.last ?? {})) this.onKnock?.("disc", 0.5);
      });
    return true;
  }
  /** Where a tile laid comes down before it slides into place: a little short of it, on the side of the end it joins. */
  private slideFrom(state: State, tile: number, at: Pose) {
    const i = state.line.findIndex((laid) => laid.tile === tile),
      neighbour = state.line[i === 0 ? 1 : i - 1]?.tile,
      next = neighbour !== undefined ? this.poses.get(neighbour) ?? undefined : undefined;
    if (!next) return { x: at.x, z: at.z + 0.35 };
    const dx = at.x - next.x,
      dz = at.z - next.z,
      d = Math.hypot(dx, dz) || 1;
    return { x: at.x + (dx / d) * 0.35, z: at.z + (dz / d) * 0.35 };
  }
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  protected mark(marks: Marks) {
    const state = this.state;
    // The tile picked up rises a little; the ends it may go to are ringed.
    this.tiles.forEach((mesh, tile) => {
      const pose = this.poses.get(tile);
      if (pose && state?.hands[0].includes(tile)) mesh.position.y = marks.selected === tile ? pose.y + 0.22 : pose.y;
    });
    [LEFT, RIGHT].forEach((end, i) => {
      this.rings[i].visible = marks.targets.includes(end);
      this.rings[i].position.set(this.endSpots[i].x, 0.012, this.endSpots[i].z);
    });
    // The keyboard's place: a tile of my hand or an end of the line.
    const c = marks.cursor,
      pose = c === LEFT || c === RIGHT ? this.endSpots[c - LEFT] : c !== null && state?.hands[0].includes(c) ? this.poses.get(c) : undefined;
    this.cursor.visible = !!pose;
    if (pose) this.cursor.position.set(pose.x, 0.012, pose.z);
  }
}
