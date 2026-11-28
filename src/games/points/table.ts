import * as T from "three";
import { capable, fall, hop, travel } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import { TableView, type Spot } from "../table/view";
import type { BoardSpec, Marks } from "./view";
import type { Effect, PointGame } from "./types";

/** Registers a resource with the view that must dispose it. */
export type Own = <R extends { dispose(): void }>(resource: R) => R;
/**
 * What was last heard on a piece table, for the config's `contact` to sound it (the view sets it just before each
 * `onContact`): a piece set down on the board, a taken piece set down where taken pieces go, a crowned checker's
 * second piece.
 */
export const pieceCue: { kind: "land" | "off" | "crown" } = { kind: "land" };

/** A seeded run of numbers from 0 to 1, the same every time for the same seed. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** A soft round spot of light, white in the middle and fading to nothing (marks, glows). */
export function glowTexture(own: Own) {
  if (typeof document === "undefined") return own(new T.Texture());
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return own(t);
}
/** A band of light across its width, bright along the middle and fading at both edges (a mill's line). */
function bandTexture(own: Own) {
  if (typeof document === "undefined") return own(new T.Texture());
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 64;
  const ctx = c.getContext("2d")!,
    g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return own(t);
}

/**
 * Taken pieces, pieces still to be placed: many pieces that stand still beside the board, drawn as one instanced
 * mesh for each side so that they cost two draws however many there are.
 */
export class Stock {
  readonly meshes: T.InstancedMesh[];
  private matrix = new T.Matrix4();
  private turn = new T.Quaternion();
  private size = new T.Vector3(1, 1, 1);
  constructor(parent: T.Object3D, geometry: T.BufferGeometry, materials: T.Material[], max: number) {
    this.meshes = materials.map((material) => {
      const mesh = new T.InstancedMesh(geometry, material, max);
      mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      parent.add(mesh);
      return mesh;
    });
  }
  /** Lays the pieces of `side` at `places` (each with a turn about the upright axis and a tilt, if any). */
  set(side: 0 | 1, places: { at: T.Vector3; turn?: number; tilt?: number; scale?: number }[]) {
    const mesh = this.meshes[side],
      count = Math.min(places.length, mesh.instanceMatrix.count);
    places.slice(0, count).forEach((p, i) => {
      this.turn.setFromEuler(new T.Euler(p.tilt ?? 0, p.turn ?? 0, (p.tilt ?? 0) * 0.6));
      this.matrix.compose(p.at, this.turn, this.size.setScalar(p.scale ?? 1));
      mesh.setMatrixAt(i, this.matrix);
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  }
  /** Hides the last `n` pieces of `side` (they have been taken up). */
  drop(side: 0 | 1, n = 1) {
    this.meshes[side].count = Math.max(0, this.meshes[side].count - n);
  }
}

type RingKind = "selected" | "movable" | "target" | "removable" | "cursor";
/** Where a tween of a piece goes: a list of points it passes through, and how high it rises between them. */
interface Way {
  points: T.Vector3[];
  height: number;
}
/**
 * The table of a game of pieces on the points of a drawn board (nine men's morris, gonu, checkers): the board's
 * points, subject and pick are the `BoardSpec`'s, so that a tap lands where the browser tests aim (the board's face
 * is at y 0). A game supplies its setting, its pieces and what lies beside the board; this class lays the pieces,
 * marks what can be chosen, and acts a move out: a piece placed comes from where the game keeps its pieces, a piece
 * moved hops, slides along a road or leaps over what it takes, and a taken piece is lifted off and set where taken
 * pieces go. A mill closed (for a game that has mills) glows along its three points while it takes.
 */
export abstract class PieceTable<S> extends TableView<S> {
  protected spec: BoardSpec;
  /** A graphics card draws: the costly things (lamps, sheen, idle life) are made only then. */
  protected rich: boolean;
  /** Things move by themselves between moves (a piece held up bobs, a flame flickers): where rich and motion is allowed. */
  protected live: boolean;
  protected men = new Map<number, T.Object3D>();
  /** Which piece stands on each point, so that a piece keeps its own shape and grain as it moves. */
  private ids = new Map<number, number>();
  private nextId = 0;
  private markGroup = new T.Group();
  private ringGeometry: T.RingGeometry;
  private spotGeometry: T.PlaneGeometry;
  private ringMaterials: Record<RingKind, T.MeshBasicMaterial>;
  private spotMaterial: T.MeshBasicMaterial;
  private lastRing: T.Mesh;
  private lastFrom: T.Mesh;
  private ghost: T.Object3D | null = null;
  /** The faint piece shown on a point while a piece to take is chosen: one for each side, made on first use. */
  private ghosts: (T.Object3D | null)[] = [null, null];
  private beams: T.Mesh[] = [];
  private beamMaterial: T.MeshBasicMaterial;
  private beamGeometry: T.PlaneGeometry;
  private glowMaterial: T.MeshBasicMaterial;
  private glows: T.Mesh[] = [];
  /** How high a piece stands (for lifting a chosen one and stacking). */
  protected abstract readonly tall: number;
  private ticking = 0;
  private idled = 0;
  /** The winner's pieces hop one after another once a game is won, where the table lives: when it began. */
  private cheer: { side: 0 | 1; start: number } | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    clear: string,
    spec: BoardSpec,
    protected game: PointGame<S>,
  ) {
    super(host, quality, clear);
    this.spec = spec;
    this.rich = capable();
    this.live = this.rich && !this.reducedMotion;
    const own: Own = (r) => this.own(r),
      r = spec.radius,
      basic = (color: string, opacity = 0.92) => own(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    this.ringGeometry = own(new T.RingGeometry(r * 1.1, r * 1.32, 48));
    this.spotGeometry = own(new T.PlaneGeometry(1, 1));
    this.ringMaterials = {
      selected: basic("#ffffff", 0.95),
      movable: basic("#7fe0a2", 0.9),
      target: basic("#f4d06a", 0.95),
      removable: basic("#f0604a", 0.95),
      cursor: basic("#9fc6ff", 0.95),
    };
    const glow = glowTexture(own);
    this.spotMaterial = own(new T.MeshBasicMaterial({ map: glow, color: "#ffd86a", transparent: true, opacity: 0.95, depthWrite: false }));
    this.glowMaterial = own(new T.MeshBasicMaterial({ map: glow, color: "#ffc94a", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    this.beamMaterial = own(new T.MeshBasicMaterial({ map: bandTexture(own), color: "#ffcf55", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    this.beamGeometry = own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    // Where the last move came down (a thin ring in the mover's colour) and a small dot where it left from.
    this.lastRing = new T.Mesh(own(new T.RingGeometry(r * 1.02, r * 1.12, 48).rotateX(-Math.PI / 2)), basic("#ffffff", 0.55));
    this.lastFrom = new T.Mesh(own(new T.CircleGeometry(r * 0.16, 20).rotateX(-Math.PI / 2)), basic("#ffffff", 0.45));
    this.lastRing.visible = this.lastFrom.visible = false;
    this.lastRing.renderOrder = this.lastFrom.renderOrder = 2;
    this.markGroup.renderOrder = 3;
    this.scene.add(this.markGroup, this.lastRing, this.lastFrom);
  }
  /** Starts the table (after the subclass has built its scene). */
  protected start() {
    this.begin();
    this.ticking = requestAnimationFrame(this.tick);
  }
  /** A piece of `side`, its foot at y 0 and centred on x and z; `id` tells pieces apart (a pebble's shape, a grain). */
  protected abstract man(side: 0 | 1, crowned: boolean, id: number): T.Object3D;
  /** Lays out what lies beside the board for `state`: pieces to place, pieces taken. */
  protected abstract extras(state: S): void;
  /** Where a piece about to be placed is taken from (and takes it from the stock there); null drops it from above. */
  protected source(_state: S, _side: 0 | 1): T.Vector3 | null {
    return null;
  }
  /** Where a taken piece of `side` goes (and the stock there makes room for it); null lets it vanish. */
  protected away(_before: S, _side: 0 | 1, _index: number): T.Vector3 | null {
    return null;
  }
  /** The road a moving piece takes, when not the straight way (a run round the loops of car gonu). */
  protected road(_effect: Effect, _before: S): T.Vector3[] | null {
    return null;
  }
  /** The mills of a game with mills (lines of three that take a piece when closed), or null. */
  protected mills(_state: S): number[][] | null {
    return null;
  }
  /** Whether a piece taken by `effect` is knocked off the board (spinning away) rather than lifted off with care. */
  protected knocked(_effect: Effect) {
    return false;
  }
  /** Something more to act out once the moving piece has landed (a checker crowned): returns when it ends, in ms. */
  protected flourish(_before: S, _state: S, landed: number, _mover: T.Object3D | null): number {
    return landed;
  }
  /** The table's own idle life, where it lives (a flame flickers): `t` in seconds; true while it needs drawing. */
  protected idle(_t: number) {
    return false;
  }
  protected subject() {
    return this.spec.subject;
  }
  protected spots(): Spot[] {
    return [];
  }
  /** The point under the pointer: the one nearest where it meets the board's face, as the old board picked. */
  protected pick(ray: T.Ray) {
    const hit = new T.Vector3();
    if (!ray.intersectPlane(this.floor, hit)) return -1;
    let best = -1,
      nearest = Math.max(this.spec.radius * 1.5, 0.42);
    this.spec.points.forEach((p, i) => {
      const d = Math.hypot(p.x - hit.x, p.z + this.spec.centreZ - hit.z);
      if (d < nearest) {
        nearest = d;
        best = i;
      }
    });
    return best;
  }
  protected hover(point: number) {
    const m = this.marks;
    this.renderer.domElement.style.cursor = m.movable.includes(point) || m.targets.includes(point) || m.removable.includes(point) ? "pointer" : "";
  }
  /** A point of the board in the scene, at height `y`. */
  protected at(point: number, y = 0) {
    const p = this.spec.points[point];
    return new T.Vector3(p.x, y, p.z + this.spec.centreZ);
  }
  private spawn(point: number, side: 0 | 1, crowned: boolean) {
    let id = this.ids.get(point);
    if (id === undefined) this.ids.set(point, (id = this.nextId++ + point * 7));
    const man = this.man(side, crowned, id);
    man.position.copy(this.at(point));
    man.userData.point = point;
    this.scene.add(man);
    this.men.set(point, man);
    return man;
  }
  private clearMen() {
    for (const man of this.men.values()) man.removeFromParent();
    this.men.clear();
  }
  protected place(state: S) {
    this.clearMen();
    const owners = this.game.owners(state),
      crowned = this.game.crowned?.(state);
    for (const point of [...this.ids.keys()]) if (owners[point] === null || owners[point] === undefined) this.ids.delete(point);
    owners.forEach((owner, point) => {
      if (owner !== null) this.spawn(point, owner, !!crowned?.[point]);
    });
    this.extras(state);
    this.hideBeams();
    // The last move's marks, in the mover's colour; not in a picture of the collection.
    const effect = this.game.effect(state),
      mover = effect ? owners[effect.to] : null;
    this.lastRing.visible = !!effect && mover !== null && !capturing();
    this.lastFrom.visible = this.lastRing.visible && !!effect && effect.from >= 0;
    if (effect && this.lastRing.visible) {
      const tint = mover === 0 ? "#ffcf6a" : "#9fd0ff";
      (this.lastRing.material as T.MeshBasicMaterial).color.set(tint);
      (this.lastFrom.material as T.MeshBasicMaterial).color.set(tint);
      this.lastRing.position.copy(this.at(effect.to, 0.006));
      if (effect.from >= 0) this.lastFrom.position.copy(this.at(effect.from, 0.006));
    }
    const won = this.game.winner(state);
    if (won !== 0 && won !== 1) this.cheer = null;
  }
  /** Moves `thing` along `way` over `duration` from `delay`: it hops between the points (bouncing once where it lands). */
  private carry(thing: T.Object3D, way: Way, delay: number, duration: number, done?: () => void) {
    const legs = way.points.length - 1,
      lengths = way.points.slice(1).map((p, i) => p.distanceTo(way.points[i])),
      total = lengths.reduce((a, b) => a + b, 0) || 1;
    let ended = false;
    this.tween(delay, duration, (p) => {
      const along = legs > 1 ? Math.min(1, p / 0.92) : travel(p);
      // Along a road of several legs the piece glides at an even pace; a single leg is a hop.
      let left = along * total,
        leg = 0;
      while (leg < legs - 1 && left > lengths[leg]) left -= lengths[leg++];
      const a = way.points[leg],
        b = way.points[leg + 1],
        f = lengths[leg] ? Math.min(1, left / lengths[leg]) : 1;
      thing.position.lerpVectors(a, b, f);
      thing.position.y += (legs > 1 ? Math.sin(Math.PI * Math.min(1, along)) : hop(p)) * way.height;
      if (p >= 1 && !ended) {
        ended = true;
        done?.();
      }
    });
  }
  protected animate(before: S, state: S) {
    const effect = this.game.effect(state);
    if (!effect || this.game.ply(state) === this.game.ply(before) || effect.to < 0) return false;
    const owners = this.game.owners(state),
      side = owners[effect.to] ?? this.game.turn(before),
      target = this.at(effect.to),
      sound = (kind: typeof pieceCue.kind) => () => {
        pieceCue.kind = kind;
        this.onContact();
      };
    this.lastRing.visible = this.lastFrom.visible = false;
    let landed: number,
      mover: T.Object3D | null = null;
    if (effect.kind === "place") {
      const from = this.source(before, side),
        man = this.spawn(effect.to, side, false);
      if (from) {
        // Taken up from where the pieces wait and set down on its point.
        landed = 470;
        man.position.copy(from);
        this.carry(man, { points: [from, target], height: 1.1 }, 0, landed, sound("land"));
      } else {
        landed = 320;
        const high = target.clone().setY(2.4);
        man.position.copy(high);
        this.tween(0, landed, (p) => {
          man.position.lerpVectors(target, high, fall(p));
          if (p >= 1) sound("land")();
        });
      }
    } else {
      const man = this.men.get(effect.from);
      const id = this.ids.get(effect.from);
      this.ids.delete(effect.from);
      if (id !== undefined) this.ids.set(effect.to, id);
      if (!man) return false;
      mover = man;
      // The piece the mover lands on (car gonu takes where it stops) moves aside before the mover arrives.
      const road = this.road(effect, before),
        jump = effect.kind === "jump",
        start = this.at(effect.from);
      if (road) {
        landed = Math.min(1100, 260 + road.length * 55);
        this.carry(man, { points: road, height: 0.12 }, 0, landed, sound("land"));
      } else {
        const far = start.distanceTo(target);
        landed = jump ? Math.min(680, 460 + far * 30) : 300;
        this.carry(man, { points: [start, target], height: jump ? Math.min(1.4, 0.55 + far * 0.12) : 0.25 }, 0, landed, sound("land"));
      }
    }
    // A mill closed glows along its three points as it takes.
    let end = landed;
    const mills = this.mills(state);
    if (mills && effect.removed.length) {
      const closed = mills.filter((mill) => mill.includes(effect.to) && mill.every((q) => owners[q] === side));
      this.showBeams(closed, 0);
      this.tween(landed - 90, 980, (p) => {
        const o = p < 0.18 ? p / 0.18 : p > 0.72 ? (1 - p) / 0.28 : 1;
        this.beamMaterial.opacity = 0.9 * o;
        this.glowMaterial.opacity = 0.75 * o;
        for (const g of this.glows) g.scale.setScalar(this.spec.radius * (3.4 + Math.sin(p * Math.PI) * 0.8));
        if (p >= 1) this.hideBeams();
      });
      end = Math.max(end, landed + 980);
    }
    // Taken pieces are lifted off and set where taken pieces go (or knocked off, after a jump over them), one after
    // another; one taken where the mover lands is knocked aside as it arrives.
    const takenOwners = this.game.owners(before),
      knocked = this.knocked(effect);
    effect.removed.forEach((point, k) => {
      const man = this.men.get(point),
        taken = (takenOwners[point] ?? (side === 0 ? 1 : 0)) as 0 | 1;
      if (!man) return;
      this.men.delete(point);
      const delay = point === effect.to ? Math.max(0, landed - 150) : landed + 120 + k * 140,
        to = this.away(before, taken, k);
      if (to && knocked) {
        const from = man.position.clone(),
          axis = new T.Vector3(to.z - from.z, 0, from.x - to.x).normalize();
        this.carry(man, { points: [from, to], height: 1.3 }, delay, 600, sound("off"));
        this.tween(delay, 600, (p) => man.quaternion.setFromAxisAngle(axis, travel(p) * Math.PI * 2));
        end = Math.max(end, delay + 600);
      } else if (to) {
        this.setAside(man, to, delay, 620, sound("off"));
        end = Math.max(end, delay + 620);
      } else {
        this.tween(delay, 300, (p) => {
          man.scale.setScalar(Math.max(0.001, 1 - p));
          man.position.y = p * 0.5;
        });
        end = Math.max(end, delay + 300);
      }
    });
    end = Math.max(end, this.flourish(before, state, landed, mover));
    // Once a game is won the winner's pieces hop in a wave, where the table lives (it never holds the screen up).
    const won = this.game.winner(state);
    if ((won === 0 || won === 1) && this.live) this.cheer = { side: won, start: performance.now() + end + 200 };
    return true;
  }
  /** Lifts `thing` straight up, carries it over and sets it down at `to`. */
  private setAside(thing: T.Object3D, to: T.Vector3, delay: number, duration: number, done: () => void) {
    const from = thing.position.clone(),
      high = 0.55;
    let ended = false;
    this.tween(delay, duration, (p) => {
      const up = Math.min(1, p / 0.22),
        across = Math.min(1, Math.max(0, (p - 0.18) / 0.62)),
        down = Math.max(0, (p - 0.78) / 0.22),
        e = across * across * (3 - 2 * across);
      thing.position.lerpVectors(from, to, e);
      const top = Math.max(from.y, to.y) + high;
      thing.position.y =
        p < 0.22 ? from.y + (top - from.y) * Math.sin((Math.PI / 2) * up) : p < 0.78 ? top + Math.sin(Math.PI * e) * 0.3 : to.y + (top - to.y) * (1 - down * down);
      if (p >= 1 && !ended) {
        ended = true;
        thing.position.copy(to);
        done();
      }
    });
  }
  private hideBeams() {
    for (const b of this.beams) b.visible = false;
    for (const g of this.glows) g.visible = false;
  }
  /** Lays a band of light along each mill in `mills` and a glow under each of its points. */
  private showBeams(mills: number[][], opacity: number) {
    this.hideBeams();
    const points = new Set<number>();
    mills.forEach((mill, i) => {
      const a = this.at(mill[0], 0.02),
        b = this.at(mill[2], 0.02),
        beam = (this.beams[i] ??= this.addBeam());
      beam.visible = true;
      beam.position.copy(a).lerp(b, 0.5);
      beam.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      beam.scale.set(a.distanceTo(b) + this.spec.radius * 1.6, 1, this.spec.radius * 1.3);
      mill.forEach((p) => points.add(p));
    });
    [...points].forEach((point, i) => {
      const glow = (this.glows[i] ??= this.addGlow());
      glow.visible = true;
      glow.position.copy(this.at(point, 0.025));
      glow.scale.setScalar(this.spec.radius * 3.4);
    });
    this.beamMaterial.opacity = opacity;
    this.glowMaterial.opacity = opacity * 0.8;
  }
  private addBeam() {
    const beam = new T.Mesh(this.beamGeometry, this.beamMaterial);
    beam.renderOrder = 4;
    this.scene.add(beam);
    return beam;
  }
  private addGlow() {
    const glow = new T.Mesh(this.spotGeometry, this.glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.renderOrder = 4;
    this.scene.add(glow);
    return glow;
  }
  protected mark(marks: Marks) {
    this.markGroup.clear();
    this.ghost?.removeFromParent();
    this.ghost = null;
    for (const man of this.men.values()) man.position.y = 0;
    if (this.animating || !this.state) return;
    const ring = (point: number, kind: RingKind, scale = 1, y = 0.012) => {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[kind]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(this.at(point, y));
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 3;
      this.markGroup.add(mesh);
    };
    for (const p of marks.movable) ring(p, p === marks.selected ? "selected" : "movable");
    if (marks.selected !== null && !marks.movable.includes(marks.selected)) ring(marks.selected, "selected");
    // The piece picked up stands raised off the board.
    if (marks.selected !== null) {
      const held = this.men.get(marks.selected);
      if (held) held.position.y = this.tall * 0.9;
    }
    // Where it may go: a soft spot of light on each point.
    for (const p of marks.targets) {
      const spot = new T.Mesh(this.spotGeometry, this.spotMaterial);
      spot.rotation.x = -Math.PI / 2;
      spot.position.copy(this.at(p, 0.014));
      spot.scale.setScalar(this.spec.radius * 1.5);
      spot.renderOrder = 3;
      this.markGroup.add(spot);
    }
    for (const p of marks.removable) ring(p, "removable", 1.05, 0.016);
    if (marks.cursor !== null) ring(marks.cursor, "cursor", 1.3, 0.018);
    // A piece placed or moved that closes a mill waits, faint, on its point while a piece to take is chosen; the
    // mill it closes glows.
    const pending = marks.pending ?? null;
    if (pending !== null && pending >= 0) {
      const owners = this.game.owners(this.state),
        side = this.game.turn(this.state),
        ghost = (this.ghosts[side] ??= this.faint(this.man(side, false, 0)));
      ghost.position.copy(this.at(pending));
      this.scene.add(ghost);
      this.ghost = ghost;
      if (marks.selected !== null) {
        const from = this.men.get(marks.selected);
        if (from) from.visible = false;
      }
      const board = owners.slice();
      if (marks.selected !== null && marks.selected >= 0) board[marks.selected] = null;
      board[pending] = side;
      const closed = (this.mills(this.state) ?? []).filter((mill) => mill.includes(pending) && mill.every((q) => board[q] === side));
      this.showBeams(closed, 0.75);
    } else {
      for (const man of this.men.values()) man.visible = true;
      this.hideBeams();
    }
  }
  /** A see-through copy of a piece, with materials of its own. */
  private faint(man: T.Object3D) {
    man.traverse((o) => {
      if (o instanceof T.Mesh) {
        const m = this.own((o.material as T.Material).clone());
        m.transparent = true;
        m.opacity = 0.6;
        m.depthWrite = false;
        o.material = m;
        o.castShadow = false;
      }
    });
    return man;
  }
  /** The table's own clock: idle life where it lives; nothing at all (no extra frames) elsewhere. */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    if (!this.live) return;
    const t = now / 1000,
      m = this.marks;
    // Drawn again only while something lives: a flame, a piece held up, a mill waiting, pieces cheering. Idle life
    // alone (a flame) is drawn about fifteen times a second, which is enough for it and spares the machine.
    let busy = false;
    if (now - this.idled > 66 && !capturing()) {
      this.idled = now;
      busy = this.idle(t);
    }
    // The piece held up bobs a little; a mill waiting to take breathes; pieces that may be taken pulse.
    if (!this.animating && m.selected !== null) {
      const held = this.men.get(m.selected);
      if (held && held.visible) {
        held.position.y = this.tall * (0.9 + 0.25 * Math.sin(t * 3.2));
        busy = true;
      }
    }
    if (!this.animating && (m.pending ?? null) !== null) {
      this.beamMaterial.opacity = 0.55 + 0.3 * Math.sin(t * 4);
      this.glowMaterial.opacity = 0.45 + 0.25 * Math.sin(t * 4);
      busy = true;
    }
    if (m.removable.length) {
      this.ringMaterials.removable.opacity = 0.7 + 0.25 * Math.sin(t * 5);
      busy = true;
    }
    // The winner's pieces hop one after another, three times round.
    if (this.cheer && !this.animating) {
      const since = (now - this.cheer.start) / 1000;
      busy = true;
      if (since > 0) {
        let k = 0,
          moving = false;
        for (const [point, man] of this.men) {
          if ((this.state && this.game.owners(this.state)[point]) !== this.cheer.side) continue;
          const p = (since - k++ * 0.09) / 0.42;
          const round = Math.floor(p);
          if (p > 0 && round < 3) {
            man.position.y = hop(p - round) * 0.35;
            moving = true;
          } else man.position.y = 0;
        }
        if (!moving && since > 1) this.cheer = null;
      }
    }
    if (busy) this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
