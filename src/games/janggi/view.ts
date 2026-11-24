import * as T from "three";
import { afterGPUFrame, aim, capable, disposeScene, realism, hop, travel } from "../../engine/scene-utils";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  TURN_MS,
  cameraDistance,
  orbit,
} from "../../engine/camera";
import { FILES, RANKS, at, kindOf, sideOf, xOf, yOf, type Move, type Side } from "./rules";
import { PieceKit, RADIUS, THICK } from "./pieces";
import { FACE, MAT, janggiBoard, sarangbang } from "./room";
import { zoomable } from "../../engine/zoom";

export const SPACING = 0.7;
/** Centre of a board point in the scene. */
export const toWorld = (index: number) => ({
  x: (xOf(index) - 4) * SPACING,
  z: (yOf(index) - 4.5) * SPACING,
});
/** Board point nearest to a spot on the table, or null when none is close. */
export function fromWorld(x: number, z: number): number | null {
  const file = Math.round(x / SPACING + 4),
    rank = Math.round(z / SPACING + 4.5);
  if (file < 0 || file >= FILES || rank < 0 || rank >= RANKS) return null;
  const centre = toWorld(at(file, rank));
  return Math.hypot(x - centre.x, z - centre.z) <= SPACING * 0.48 ? at(file, rank) : null;
}
const PIECE_Y = FACE + THICK / 2;
/** The height a pointer is read at (the browser test projects the same height). */
const AIM_Y = 0.26;
/** How high a chosen piece is lifted off its point. */
const LIFT = 0.07;
/** A move takes as long as it always did; a piece knocked off flies after the mover has come down on it. */
const MOVE_MS = 260,
  KNOCK_AFTER = 200,
  KNOCK_MS = 420,
  TOPPLE_MS = 640;
interface Tween {
  mesh: T.Mesh;
  start: number;
  from: T.Vector3;
  to: T.Vector3;
}
/** Something that moves for show only: it never holds up play, and is put at its end when the board is drawn again. */
interface Flight {
  start: number;
  duration: number;
  /** Puts the thing `p` (0 to 1) of the way along. */
  at: (p: number) => void;
  /** Called once when it has come to rest. */
  done?: () => void;
}
/** How large a taken piece lies beside the board, and every side's full set of pieces. */
const TAKEN_SCALE = 0.75,
  FULL: Record<string, number> = { K: 1, A: 2, R: 2, C: 2, N: 2, E: 2, P: 5 },
  ORDER = "RCNEAPK";
/**
 * Where the `i`-th piece `taker` took lies: on the mat at its player's right hand, beside the board. Cho sits at the
 * near edge (+z) with its right at +x; han sits across (−z) with its right at −x. Three to a row, from the player's
 * own edge inward.
 */
export function takenAt(taker: Side, i: number) {
  const side = taker === "cho" ? 1 : -1;
  return new T.Vector3(side * (3.82 + (i % 3) * 0.56), MAT + (THICK / 2) * TAKEN_SCALE, side * (3.2 - Math.floor(i / 3) * 0.6));
}
export interface Marks {
  selected: number | null;
  target: number | null;
  legal: number[];
  last: Move | null;
  check: number | null;
  cursor: number | null;
}
const UP = new T.Vector3(0, 1, 0);

/**
 * A thick janggi board on its feet in a sarangbang, with carved, lacquered octagonal pieces. It draws a board
 * string; it knows no rules.
 */
export class JanggiView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private pieces = new T.Group();
  private marks = new T.Group();
  private meshes: (T.Mesh | null)[] = Array(FILES * RANKS).fill(null);
  private shown = "";
  private tweens: Tween[] = [];
  private flights: Flight[] = [];
  /** How many pieces each side has taken (they stand at its right). */
  private taken: Record<Side, number> = { cho: 0, han: 0 };
  private kit = new PieceKit();
  private owned: { dispose(): void }[] = [];
  private markKey = "";
  /** The chosen piece, lifted off its point; pieces still easing up or down. */
  private raised: T.Mesh | null = null;
  private easing = new Set<T.Mesh>();
  /** The ring round a general in check, which breathes where a graphics card draws. */
  private pulse: T.Mesh | null = null;
  private rich = capable();
  private facing: Side;
  private top = false;
  private cameraFrom = new T.Vector3();
  private cameraTo = new T.Vector3();
  private cameraAt = 0;
  private cameraMs = 450;
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), -AIM_Y);
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A board point was chosen; `confirm` when the gesture also commits (a mouse click). */
  onSelect: (index: number | null, confirm: boolean) => void = () => {};
  onContact: () => void = () => {};
  /** A piece knocked off the board has landed on the mat. */
  onKnock: () => void = () => {};
  onSettled: () => void = () => {};
  get animating() {
    return this.tweens.length > 0 || this.cameraAt !== 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    facing: Side,
  ) {
    this.facing = facing;
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#3a2716");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "3D 장기판");
    canvas.tabIndex = 0;
    // Daylight through the paper doors: a warm sky light and one low sun from the left.
    this.scene.add(new T.HemisphereLight("#fff1d6", "#5a3e26", 2.4));
    const light = new T.DirectionalLight("#fff0d4", 3.2);
    // From the side (the paper doors at the right), so that neither player looks into its reflection.
    light.position.set(7.5, 9, -1.5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -8.6;
    light.shadow.camera.right = 8.6;
    light.shadow.camera.top = 6.6;
    light.shadow.camera.bottom = -6.6;
    light.shadow.normalBias = 0.025;
    this.own(light.shadow);
    this.scene.add(light);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    janggiBoard(this.scene, own, SPACING, this.rich);
    sarangbang(this.scene, own, this.rich);
    realism(this.renderer, this.scene);
    this.scene.add(this.pieces, this.marks);
    const pick = (e: PointerEvent, confirm: boolean) => {
      if (this.disposed || this.cameraAt) return;
      aim(this.ray, e, canvas, this.camera);
      const hit = new T.Vector3();
      this.onSelect(
        this.ray.ray.intersectPlane(this.plane, hit) ? fromWorld(hit.x, hit.z) : null,
        confirm,
      );
    };
    let down: number | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = e.pointerId;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (down !== e.pointerId) return;
      down = null;
      // A click or a tap commits at once.
      pick(e, true);
    });
    canvas.addEventListener("pointercancel", () => (down = null));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = (time: number) => {
      this.raf = requestAnimationFrame(loop);
      let moved = false;
      if (this.cameraAt) {
        // A delayed turn has not begun while the time is still negative.
        const p = Math.max(0, Math.min(1, (time - this.cameraAt) / this.cameraMs)),
          e = p * p * (3 - 2 * p);
        orbit(this.camera.position, this.cameraFrom, this.cameraTo, e);
        this.camera.lookAt(0, 0, 0);
        moved = true;
        if (p === 1) {
          this.cameraAt = 0;
          this.onSettled();
        }
      }
      if (this.tweens.length) {
        moved = true;
        this.tweens = this.tweens.filter((t) => this.slide(t, time));
        if (!this.tweens.length) this.onSettled();
      }
      if (this.flights.length) {
        moved = true;
        this.flights = this.flights.filter((f) => {
          const p = Math.min(1, (time - f.start) / f.duration);
          if (p < 0) return true;
          f.at(p);
          if (p < 1) return true;
          f.done?.();
          return false;
        });
      }
      if (this.easing.size) {
        moved = true;
        for (const mesh of this.easing) {
          if (this.tweens.some((t) => t.mesh === mesh)) continue;
          const goal = PIECE_Y + (mesh === this.raised ? LIFT : 0);
          mesh.position.y += (goal - mesh.position.y) * 0.35;
          if (Math.abs(goal - mesh.position.y) < 0.002) {
            mesh.position.y = goal;
            this.easing.delete(mesh);
          }
        }
      }
      if (this.pulse) {
        const breath = 0.5 + 0.5 * Math.sin(time / 170);
        this.pulse.scale.setScalar(1 + breath * 0.12);
        (this.pulse.material as T.MeshBasicMaterial).opacity = 0.55 + breath * 0.4;
        moved = true;
      }
      if (!this.dirty && !moved) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          canvas.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  /**
   * One step of a move: the piece is picked up, carried low leaning into its way, and set down with a tap and a small
   * bounce (`hop`). Returns false once it has landed.
   */
  private slide(t: Tween, time: number) {
    const p = Math.min(1, (time - t.start) / MOVE_MS);
    if (p < 0) return true;
    const mesh = t.mesh;
    mesh.position.lerpVectors(t.from, t.to, travel(p));
    mesh.position.y += hop(p) * 0.34;
    const way = new T.Vector3().subVectors(t.to, t.from).setY(0);
    if (way.lengthSq() > 1e-6) {
      const axis = new T.Vector3().crossVectors(UP, way.normalize()),
        lean = 0.32 * Math.sin(Math.PI * Math.min(1, p / 0.84));
      mesh.quaternion.setFromAxisAngle(axis, lean).multiply(this.yaw());
    }
    if (p < 1) return true;
    mesh.position.copy(t.to);
    mesh.quaternion.copy(this.yaw());
    this.onContact();
    return false;
  }
  private target() {
    const distance = cameraDistance(this.camera.aspect, this.top, SUBJECTS.janggi),
      angle = this.top ? OVERHEAD : TILT;
    this.cameraTo.set(
      0,
      Math.sin(angle) * distance,
      Math.cos(angle) * distance * (this.facing === "cho" ? 1 : -1),
    );
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.target();
    if (!this.cameraAt) {
      this.camera.position.copy(this.cameraTo);
      this.camera.lookAt(0, 0, 0);
    }
    this.dirty = true;
  }
  /** Turns the board to `facing`'s side, or switches to the overhead view. */
  setCamera(facing: Side, top = this.top, delay = 0) {
    this.cameraMs = facing === this.facing ? 450 : TURN_MS;
    this.facing = facing;
    this.top = top;
    this.cameraFrom.copy(this.camera.position);
    this.target();
    if (this.reducedMotion) {
      this.camera.position.copy(this.cameraTo);
      this.camera.lookAt(0, 0, 0);
      this.dirty = true;
    } else this.cameraAt = performance.now() + delay;
    // The glyphs turn with the table once it has swung half way.
    const turn = () => {
      for (const mesh of this.meshes) if (mesh && !this.tweens.some((t) => t.mesh === mesh)) this.orient(mesh);
      this.dirty = true;
    };
    if (this.cameraAt) setTimeout(() => !this.disposed && turn(), delay + this.cameraMs / 2);
    else turn();
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** The turn that has every glyph read upright from the viewer's side of the board. */
  private yaw() {
    return new T.Quaternion().setFromAxisAngle(UP, this.facing === "cho" ? Math.PI : 0);
  }
  private orient(mesh: T.Mesh) {
    mesh.quaternion.copy(this.yaw());
  }
  private make(piece: string, index: number) {
    const mesh = new T.Mesh(this.kit.geometry(kindOf(piece)), this.kit.materials(piece));
    mesh.castShadow = true;
    mesh.userData.piece = piece;
    const p = toWorld(index);
    mesh.position.set(p.x, PIECE_Y, p.z);
    this.orient(mesh);
    this.pieces.add(mesh);
    return mesh;
  }
  /**
   * A taken piece is knocked off the board as the mover comes down on it: it flies off to the taker's right turning
   * over once, lands on the mat with a bounce, smaller, and lies there. It is decoration: play never waits for it.
   */
  private knock(mesh: T.Mesh, to: T.Vector3, now: number) {
    const from = mesh.position.clone(),
      way = new T.Vector3().subVectors(to, from).setY(0),
      axis = new T.Vector3().crossVectors(UP, way.lengthSq() > 1e-6 ? way.normalize() : new T.Vector3(1, 0, 0)),
      spin = (Math.random() - 0.5) * 1.6;
    this.flights.push({
      start: now + KNOCK_AFTER,
      duration: KNOCK_MS,
      at: (p) => {
        mesh.position.lerpVectors(from, to, travel(p));
        mesh.position.y += hop(p) * 0.95;
        mesh.scale.setScalar(1 - (1 - TAKEN_SCALE) * Math.min(1, p * 1.4));
        const roll = Math.PI * 2 * travel(p);
        mesh.quaternion
          .setFromAxisAngle(axis, roll)
          .multiply(new T.Quaternion().setFromAxisAngle(UP, spin * travel(p)))
          .multiply(this.yaw());
      },
      done: () => {
        mesh.position.copy(to);
        mesh.scale.setScalar(TAKEN_SCALE);
        this.onKnock();
      },
    });
  }
  /** Puts every flight at its end at once. */
  private land() {
    for (const f of this.flights) {
      f.at(1);
      f.done?.();
    }
    this.flights = [];
  }
  /**
   * Shows `board`. With `last` and matching pieces already on the board the
   * move is animated; otherwise every piece is placed afresh.
   */
  render(board: string, last: Move | null = null, animate = true) {
    if (this.disposed) return;
    this.dirty = true;
    for (const t of this.tweens) {
      t.mesh.position.copy(t.to);
      this.orient(t.mesh);
    }
    this.tweens = [];
    this.land();
    const moving = last ? this.meshes[last.from] : null,
      now = performance.now();
    if (
      last &&
      moving &&
      this.shown[last.from] === board[last.to] &&
      board[last.from] === "." &&
      [...board].every((piece, i) => i === last.from || i === last.to || piece === this.shown[i])
    ) {
      // A piece taken goes to the taker's right, beside the board (the user asked).
      const taken = this.meshes[last.to],
        taker = sideOf(this.shown[last.from])!;
      if (taken) {
        const to = takenAt(taker, this.taken[taker]++);
        this.easing.delete(taken);
        if (animate && !this.reducedMotion) this.knock(taken, to, now);
        else {
          taken.position.copy(to);
          taken.scale.setScalar(TAKEN_SCALE);
        }
      }
      this.meshes[last.to] = moving;
      this.meshes[last.from] = null;
      const p = toWorld(last.to),
        to = new T.Vector3(p.x, PIECE_Y, p.z);
      if (animate && !this.reducedMotion)
        this.tweens.push({ mesh: moving, start: now, from: moving.position.clone(), to });
      else {
        moving.position.copy(to);
        this.orient(moving);
      }
    } else {
      this.pieces.clear();
      this.easing.clear();
      this.raised = null;
      this.meshes = [...board].map((piece, i) => (piece === "." ? null : this.make(piece, i)));
      // What is missing from each side's full set has been taken by the other; it is laid out by kind.
      this.taken = { cho: 0, han: 0 };
      for (const kind of ORDER)
        for (const [taker, piece] of [["cho", kind.toLowerCase()], ["han", kind]] as const) {
          const left = [...board].filter((p) => p === piece).length;
          for (let n = left; n < FULL[kind]; n++) {
            const mesh = this.make(piece, 0);
            mesh.position.copy(takenAt(taker, this.taken[taker]++));
            mesh.scale.setScalar(TAKEN_SCALE);
          }
        }
    }
    this.shown = board;
    if (!this.tweens.length) this.onSettled();
  }
  /**
   * The general at `index` falls over on its side, away from the player who beat it: the end of the game, told on the
   * board. Decoration only.
   */
  topple(index: number) {
    const mesh = this.meshes[index];
    if (!mesh || this.disposed) return;
    this.land();
    const side = sideOf(this.shown[index]),
      // It falls toward its own player's edge.
      away = new T.Vector3(0, 0, side === "cho" ? 1 : -1),
      axis = new T.Vector3().crossVectors(UP, away),
      r = RADIUS[kindOf(this.shown[index])] * 1.05,
      apothem = r * Math.cos(Math.PI / 8) * 0.975,
      start = mesh.position.clone(),
      pivot = start.clone().addScaledVector(away, apothem).setY(FACE),
      arm = start.clone().sub(pivot),
      yaw = mesh.quaternion.clone(),
      q = new T.Quaternion();
    const at = (p: number) => {
      // It tips slowly, then quickly, and rocks once where it lies.
      const angle = p < 0.8 ? (Math.PI / 2) * (p / 0.8) ** 2 : Math.PI / 2 - 0.12 * Math.sin((Math.PI * (p - 0.8)) / 0.2);
      q.setFromAxisAngle(axis, angle);
      mesh.position.copy(pivot).add(arm.clone().applyQuaternion(q));
      mesh.quaternion.copy(q).multiply(yaw);
    };
    if (this.reducedMotion) at(1);
    else this.flights.push({ start: performance.now() + 150, duration: TOPPLE_MS, at, done: () => this.onKnock() });
    this.dirty = true;
  }
  highlights(m: Marks) {
    const key = JSON.stringify(m);
    if (key === this.markKey || this.disposed) return;
    this.markKey = key;
    this.dirty = true;
    disposeScene(this.marks);
    this.marks.clear();
    this.pulse = null;
    const y = FACE + 0.006;
    const ring = (index: number, color: string, inner: number, outer: number, lift = 0, opacity = 0.92) => {
      const p = toWorld(index),
        mesh = new T.Mesh(
          new T.RingGeometry(inner, outer, 40),
          new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity, depthWrite: false }),
        );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, y + lift, p.z);
      this.marks.add(mesh);
      return mesh;
    };
    if (m.last) {
      ring(m.last.from, "#d6af57", 0.06, 0.11);
      ring(m.last.to, "#d6af57", 0.33, 0.37);
    }
    if (m.check !== null) {
      const alarm = ring(m.check, "#e2452c", 0.36, 0.44, 0.001);
      if (this.rich && !this.reducedMotion) this.pulse = alarm;
    }
    if (m.selected !== null) ring(m.selected, "#f3d27a", 0.33, 0.41, 0.002);
    for (const index of m.legal)
      if (this.shown[index] === ".") {
        // An empty point it may go to: a jade dot with a pale rim.
        ring(index, "#f3ecd6", 0.085, 0.115, 0.003);
        ring(index, "#1f8a6c", 0, 0.088, 0.003);
      } else ring(index, "#e0452c", 0.3, 0.36, 0.003);
    if (m.target !== null) ring(m.target, "#f6f0e2", 0.3, 0.38, 0.004);
    if (m.cursor !== null) ring(m.cursor, "#fff2c6", 0.41, 0.45, 0.005);
    // The chosen piece is lifted a little off the board; the one chosen before goes down again.
    const raised = m.selected !== null ? this.meshes[m.selected] : null;
    if (raised !== this.raised) {
      if (this.raised) this.easing.add(this.raised);
      if (raised) this.easing.add(raised);
      this.raised = raised;
      if (this.reducedMotion)
        for (const mesh of this.easing) {
          mesh.position.y = PIECE_Y + (mesh === raised ? LIFT : 0);
          this.easing.delete(mesh);
        }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    disposeScene(this.marks);
    this.kit.dispose();
    for (const r of this.owned) r.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
