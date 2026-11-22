import * as T from "three";
import type { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import { disposeScene, afterGPUFrame, aim, realism, capable, hop, travel } from "../../engine/scene-utils";
import { toWorld, fromWorld } from "./coordinates";
import { pieceGeometry, pieceMaterials } from "./pieces";
import { chessBoard, clubRoom, TABLE_TOP, type Clock } from "./room";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  TURN_MS,
  cameraDistance,
  orbit,
} from "../../engine/camera";
import { capturing } from "../../ui/banner";
/** How large a taken piece stands beside the board, and where the `i`-th piece `taker` took stands. */
const TAKEN_SCALE = 0.72;
/**
 * At the taker's right hand, on the table beside the board: white sits at the near edge (+z) and its right is +x,
 * black sits across (−z) and its right is −x. Three to a row, from the player's own edge inward.
 */
export function takenAt(taker: Color, i: number) {
  const side = taker === "w" ? 1 : -1;
  return new T.Vector3(side * (3.98 + (i % 3) * 0.5), TABLE_TOP, side * (3.05 - Math.floor(i / 3) * 0.58));
}
/** How long a move takes; a captured piece is knocked over and carried off within `CAPTURE_MS`, a castling rook jumps the king in `CASTLE_MS`, a promoted pawn turns into its new piece by `PROMOTE_MS`. */
const MOVE_MS = 320,
  CAPTURE_MS = 560,
  CASTLE_MS = 400,
  PROMOTE_MS = 640;
/** Where a piece stands on its square. */
const STAND = 0.22;
const UP = new T.Vector3(0, 1, 0);
interface Token {
  mesh: T.Group;
  type: PieceSymbol;
  color: Color;
}
/** Something moving on the table: `step` is told how far along it is (0 to 1), `drop` takes away what it made. */
interface Act {
  start: number;
  ms: number;
  step(u: number): void;
  drop?(): void;
}
const smooth = (u: number) => {
  const v = Math.max(0, Math.min(1, u));
  return v * v * (3 - 2 * v);
};
export class ChessView {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  onSelect: (square: Square | null, confirm: boolean) => void = () => {};
  onCancel: () => void = () => {};
  onSettled: () => void = () => {};
  onContact: () => void = () => {};
  /** A taken piece falls over on the board. */
  onKnock: () => void = () => {};
  /** A pawn on the last rank turns into its new piece. */
  onPromote: () => void = () => {};
  ready = false;
  facing: Color = "w";
  private top = false;
  private disposed = false;
  private dirty = true;
  private raf = 0;
  private first = true;
  private cancelGPU = () => {};
  private observer: ResizeObserver;
  private width = 0;
  private height = 0;
  private tokens = new Map<Square, Token>();
  private templates = new T.Group();
  private prototypes = new Map<string, T.Group>();
  private materials: Record<Color, T.MeshStandardMaterial>;
  private resources: { dispose(): void }[] = [];
  private own = <R extends { dispose(): void }>(resource: R) => {
    this.resources.push(resource);
    return resource;
  };
  private clock: Clock;
  private marks = new T.Group();
  private markKey = "";
  private mark!: {
    square: T.PlaneGeometry;
    glow: T.PlaneGeometry;
    ring: T.RingGeometry;
    target: T.RingGeometry;
    dot: T.CircleGeometry;
    last: T.MeshBasicMaterial;
    lastFrom: T.MeshBasicMaterial;
    selected: T.MeshBasicMaterial;
    targetSquare: T.MeshBasicMaterial;
    cursor: T.MeshBasicMaterial;
    take: T.MeshBasicMaterial;
    takeRing: T.MeshBasicMaterial;
    legal: T.MeshBasicMaterial;
    check: T.MeshBasicMaterial;
  };
  /** The red glow under a king in check; it breathes where a graphics card draws and motion is welcome. */
  private checkGlow: T.Mesh | null = null;
  private readonly lively = capable() && !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  private acts: Act[] = [];
  /** Pieces each side has taken, standing on the table at its player's right (the user asked). */
  private taken: Record<Color, T.Group[]> = { w: [], b: [] };
  private cameraStart = new T.Vector3();
  private cameraTarget = new T.Vector3();
  private cameraAt = 0;
  private cameraMs = 450;
  private pointerId: number | null = null;
  /** The square a press began on: a release elsewhere moves nothing (a finger that slid off the pawn moved it). */
  private pressed: Square | null = null;
  get animating() {
    return !!this.cameraAt || this.acts.length > 0;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    facing: Color = "w",
  ) {
    this.facing = facing;
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
    );
    // A club's library, dim beyond the table.
    this.renderer.setClearColor("#21160f");
    this.scene.fog = new T.Fog("#21160f", 19, 38);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "3D 체스판");
    host.append(canvas);
    this.scene.add(new T.HemisphereLight("#fff2d7", "#3a2a20", 2.6));
    const sun = new T.DirectionalLight("#fff5df", 3.2);
    sun.position.set(-4, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // The board, the taken pieces and the things on the table beside it.
    Object.assign(sun.shadow.camera, {
      left: -6.6,
      right: 6.6,
      top: 6.2,
      bottom: -6.2,
    });
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    const own = this.own;
    this.clock = clubRoom(this.scene, own, capable());
    chessBoard(this.scene, own);
    this.materials = pieceMaterials(own);
    realism(this.renderer, this.scene, true);
    this.makeMarks();
    this.scene.add(this.marks);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.camera.position.copy(this.cameraTarget);
    this.camera.lookAt(0, 0.1, 0);
    canvas.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.button !== 0 || this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.pressed = this.squareAt(e);
      this.pick(e, false);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (this.pointerId !== e.pointerId || e.button !== 0) return;
      this.pointerId = null;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      // A click or a tap commits at once, but only where it began: a press that drifted to the next square
      // before it was let go keeps the piece picked up and moves nothing.
      const at = this.squareAt(e),
        began = this.pressed;
      this.pressed = null;
      if (at === began) this.pick(e, true);
      else if (began && !this.disposed && !this.animating) this.onSelect(began, false);
    });
    const cancel = (e: PointerEvent) => {
      if (this.pointerId !== e.pointerId) return;
      this.pointerId = null;
      this.pressed = null;
      this.onCancel();
    };
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    const loop = (t: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const wasAnimating = this.animating,
        breathing = !!this.checkGlow && this.lively && !capturing();
      if (!this.dirty && !wasAnimating && !breathing) return;
      this.dirty = false;
      if (this.cameraAt) {
        // A delayed turn has not begun while the time is still negative.
        const u = Math.max(0, Math.min(1, (t - this.cameraAt) / this.cameraMs));
        orbit(this.camera.position, this.cameraStart, this.cameraTarget, u * u * (3 - 2 * u));
        if (u === 1) this.cameraAt = 0;
      }
      this.camera.lookAt(0, 0.1, 0);
      const now = performance.now();
      this.acts = this.acts.filter((a) => {
        const u = Math.max(0, Math.min(1, (now - a.start) / a.ms));
        a.step(u);
        return u < 1;
      });
      if (this.checkGlow) {
        const pulse = breathing ? 0.5 + 0.5 * Math.sin(now / 260) : 0.6;
        (this.checkGlow.material as T.MeshBasicMaterial).opacity = 0.55 + 0.35 * pulse;
        this.checkGlow.scale.setScalar(0.95 + 0.12 * pulse);
      }
      this.renderer.render(this.scene, this.camera);
      if (this.first) {
        this.first = false;
        this.cancelGPU = afterGPUFrame(this.renderer, () => {
          this.ready = true;
          canvas.dataset.ready = "true";
          this.onSettled();
        });
      }
      if (wasAnimating && !this.animating) this.onSettled();
    };
    this.raf = requestAnimationFrame(loop);
  }
  /** The marks' shapes and paints, made once: a soft-edged square, a round glow, rings and a dot. */
  private makeMarks() {
    const own = this.own,
      soft = (round: boolean) => {
        const c = document.createElement("canvas");
        c.width = c.height = 128;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        if (round) {
          const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
          g.addColorStop(0, "rgba(255,255,255,1)");
          g.addColorStop(0.35, "rgba(255,255,255,0.85)");
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 128, 128);
        } else {
          // A square with feathered edges: lighter in the middle, as if lit from under the veneer.
          ctx.filter = "blur(7px)";
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.fillRect(14, 14, 100, 100);
          ctx.filter = "none";
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 5;
          ctx.strokeRect(10, 10, 108, 108);
        }
        const t = own(new T.CanvasTexture(c));
        return t;
      };
    const square = soft(false),
      glow = soft(true),
      basic = (color: string, opacity: number, map: T.Texture | null = null) =>
        own(new T.MeshBasicMaterial({ color, transparent: true, opacity, map, side: T.DoubleSide, depthWrite: false }));
    this.mark = {
      square: own(new T.PlaneGeometry(0.78, 0.78)),
      glow: own(new T.PlaneGeometry(1.5, 1.5)),
      ring: own(new T.RingGeometry(0.31, 0.34, 32)),
      target: own(new T.RingGeometry(0.31, 0.37, 40)),
      dot: own(new T.CircleGeometry(0.085, 24)),
      // The last move: where it came from faintly, where it went a little more.
      last: basic("#f2c35c", 0.5, square),
      lastFrom: basic("#f2c35c", 0.3, square),
      selected: basic("#ffe07a", 0.62, square),
      targetSquare: basic("#b4e08a", 0.62, square),
      cursor: basic("#fff2c6", 0.9),
      take: basic("#d8432f", 0.34),
      takeRing: basic("#e0402a", 0.95),
      legal: basic("#c09032", 0.85),
      check: own(new T.MeshBasicMaterial({ color: "#ff3a22", map: glow, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending })),
    };
  }
  private prototype(type: PieceSymbol, color: Color) {
    const key = color + type,
      cached = this.prototypes.get(key);
    if (cached) return cached;
    const g = new T.Group(),
      m = new T.Mesh(pieceGeometry(type, color), this.materials[color]);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (color === "b") g.rotation.y = Math.PI;
    this.prototypes.set(key, g);
    this.templates.add(g);
    return g;
  }
  private token(type: PieceSymbol, color: Color, square: Square): Token {
    const mesh = this.prototype(type, color).clone(true),
      p = toWorld(square);
    mesh.position.set(p.x, STAND, p.z);
    this.scene.add(mesh);
    return { mesh, type, color };
  }
  private act(ms: number, step: (u: number) => void, drop?: () => void) {
    this.acts.push({ start: performance.now(), ms, step, drop });
  }
  render(game: Chess, last?: Move) {
    this.dirty = true;
    if (last && this.tokens.size) {
      const capture = last.isEnPassant()
        ? (`${last.to[0]}${last.from[1]}` as Square)
        : last.to;
      const taken = this.tokens.get(capture);
      if (taken) {
        this.tokens.delete(capture);
        const row = this.taken[last.color];
        row.push(taken.mesh);
        const a = toWorld(last.from),
          b = toWorld(last.to);
        this.knockOff(taken.mesh, new T.Vector3(b.x - a.x, 0, b.z - a.z), takenAt(last.color, row.length - 1));
      }
      const moving = this.tokens.get(last.from);
      if (moving) {
        this.tokens.delete(last.from);
        if (last.promotion) {
          // The pawn goes to the last rank and turns there into the piece chosen.
          const queen = this.token(last.promotion, last.color, last.to);
          this.tokens.set(last.to, queen);
          this.promote(moving.mesh, queen.mesh, last.to);
        } else {
          this.tokens.set(last.to, moving);
          this.move(moving, last.to, last.isKingsideCastle() || last.isQueensideCastle() ? "king" : "plain");
        }
      }
      if (last.isKingsideCastle() || last.isQueensideCastle()) {
        const rank = last.from[1],
          from = `${last.isKingsideCastle() ? "h" : "a"}${rank}` as Square,
          to = `${last.isKingsideCastle() ? "f" : "d"}${rank}` as Square;
        const rook = this.tokens.get(from);
        if (rook) {
          this.tokens.delete(from);
          this.tokens.set(to, rook);
          this.move(rook, to, "rook");
        }
      }
      // The player who moved presses the clock: the other's starts.
      const turn = game.turn();
      this.act(160, (u) => this.clock.set(turn, smooth(u)));
    } else {
      // Anything still under way ends where it is going.
      for (const a of this.acts) a.drop?.();
      this.acts = [];
      for (const t of this.tokens.values()) this.scene.remove(t.mesh);
      this.tokens.clear();
      for (const row of game.board())
        for (const p of row)
          if (p)
            this.tokens.set(p.square, this.token(p.type, p.color, p.square));
      // The taken pieces are laid out again from the game's own record, in the order they were taken.
      for (const color of ["w", "b"] as const) {
        for (const mesh of this.taken[color]) this.scene.remove(mesh);
        this.taken[color] = [];
      }
      for (const move of game.history({ verbose: true }))
        if (move.captured) {
          const row = this.taken[move.color],
            mesh = this.token(move.captured, move.color === "w" ? "b" : "w", "a1").mesh;
          mesh.position.copy(takenAt(move.color, row.length));
          mesh.scale.setScalar(TAKEN_SCALE);
          row.push(mesh);
        }
      this.clock.set(game.turn());
    }
  }
  /**
   * A piece goes to `to`: a hop for most moves; in castling the king slides two squares low over the board while
   * its rook rises, jumps over it and comes down on its other side, the two in one movement.
   */
  private move(token: Token, to: Square, kind: "plain" | "king" | "rook") {
    const p = toWorld(to),
      mesh = token.mesh,
      from = mesh.position.clone(),
      end = new T.Vector3(p.x, STAND, p.z);
    if (kind === "rook") {
      this.act(CASTLE_MS, (u) => {
        // Up (to clear the king's cross), across, and down with a small bounce.
        const across = smooth((u - 0.22) / 0.52),
          up = u < 0.3 ? smooth(u / 0.3) : u < 0.74 ? 1 : u < 0.92 ? 1 - ((u - 0.74) / 0.18) ** 2 : 0.05 * Math.sin((Math.PI * (u - 0.92)) / 0.08);
        mesh.position.lerpVectors(from, end, across);
        mesh.position.y += up * 1.78;
        if (u === 1) this.onContact();
      });
      return;
    }
    const ms = kind === "king" ? CASTLE_MS : MOVE_MS,
      lift = kind === "king" ? 0.1 : 0.35;
    this.act(ms, (u) => {
      mesh.position.lerpVectors(from, end, travel(u));
      mesh.position.y += hop(u) * lift;
      if (u === 1) this.onContact();
    });
  }
  /**
   * A taken piece is knocked over by the piece arriving (falling away from it, `away`), lies a moment, and is
   * carried off to its taker's row at the side of the board, standing up again and a little smaller.
   */
  private knockOff(mesh: T.Group, away: T.Vector3, place: T.Vector3) {
    const dir = away.lengthSq() ? away.normalize() : new T.Vector3(0, 0, 1),
      axis = new T.Vector3().crossVectors(UP, dir).normalize(),
      start = mesh.position.clone(),
      upright = mesh.quaternion.clone(),
      // It falls over the edge of its foot, sliding a little the way it was struck.
      pivot = start.clone().addScaledVector(dir, 0.3),
      tilt = new T.Quaternion(),
      lying = new T.Vector3(),
      lyingTurn = new T.Quaternion(),
      offset = new T.Vector3(),
      // When the arriving piece comes down on it, how long it takes to fall, and when it is lifted away.
      strike = 0.2,
      down = 0.48,
      lift = 0.56;
    let knocked = false;
    const pose = (angle: number, slide: number) => {
      tilt.setFromAxisAngle(axis, angle);
      offset.subVectors(start, pivot).applyQuaternion(tilt);
      mesh.position.copy(pivot).add(offset).addScaledVector(dir, slide);
      mesh.quaternion.copy(tilt).multiply(upright);
    };
    this.act(CAPTURE_MS, (u) => {
      if (u < strike) return;
      if (u < lift) {
        const s = Math.min(1, (u - strike) / (down - strike)),
          angle = s < 1 ? (Math.PI / 2) * s * s : Math.PI / 2 - 0.1 * Math.sin((Math.PI * (u - down)) / (lift - down));
        pose(angle, 0.22 * smooth(s));
        if (s === 1 && !knocked) {
          knocked = true;
          this.onKnock();
        }
        lying.copy(mesh.position);
        lyingTurn.copy(mesh.quaternion);
        return;
      }
      if (!knocked) {
        // A frame came late: the piece lies down before it is carried.
        knocked = true;
        pose(Math.PI / 2, 0.22);
        lying.copy(mesh.position);
        lyingTurn.copy(mesh.quaternion);
      }
      const v = (u - lift) / (1 - lift);
      mesh.position.lerpVectors(lying, place, travel(v));
      mesh.position.y += hop(v) * 0.9;
      mesh.quaternion.slerpQuaternions(lyingTurn, upright, smooth(v * 1.3));
      mesh.scale.setScalar(1 - (1 - TAKEN_SCALE) * Math.min(1, v * 1.4));
      if (u === 1) this.onContact();
    }, () => {
      mesh.position.copy(place);
      mesh.quaternion.copy(upright);
      mesh.scale.setScalar(TAKEN_SCALE);
    });
  }
  /**
   * Promotion: the pawn goes to the last rank, then sinks into the board turning while its new piece rises out of
   * it, turning the other way, a ring of light spreading on the square.
   */
  private promote(pawn: T.Group, piece: T.Group, to: Square) {
    const p = toWorld(to),
      from = pawn.position.clone(),
      end = new T.Vector3(p.x, STAND, p.z),
      base = piece.rotation.y,
      pawnTurn = pawn.rotation.y,
      flash = new T.Mesh(this.mark.target, new T.MeshBasicMaterial({ color: "#f3c25a", transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })),
      arrive = MOVE_MS / PROMOTE_MS;
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(p.x, 0.226, p.z);
    piece.visible = false;
    let turned = false;
    const finish = () => {
      this.scene.remove(pawn, flash);
      (flash.material as T.Material).dispose();
      piece.visible = true;
      piece.rotation.y = base;
      piece.scale.setScalar(1);
      piece.position.copy(end);
    };
    this.scene.add(flash);
    this.act(PROMOTE_MS, (u) => {
      if (u < arrive) {
        const v = u / arrive;
        pawn.position.lerpVectors(from, end, travel(v));
        pawn.position.y += hop(v) * 0.35;
        return;
      }
      pawn.position.copy(end);
      const v = (u - arrive) / (1 - arrive);
      if (!turned) {
        turned = true;
        this.onContact();
        this.onPromote();
      }
      // The pawn sinks and narrows, turning; the new piece grows out of the square and settles a touch past full.
      const out = Math.min(1, v / 0.45);
      pawn.scale.set(1 - out * 0.6, Math.max(0.001, 1 - out), 1 - out * 0.6);
      pawn.rotation.y = pawnTurn + out * 2.4;
      pawn.visible = out < 1;
      const grow = Math.max(0, (v - 0.2) / 0.8);
      piece.visible = grow > 0;
      const size = grow < 0.75 ? smooth(grow / 0.75) * 1.08 : 1.08 - 0.08 * smooth((grow - 0.75) / 0.25);
      piece.scale.set(Math.max(0.001, size), Math.max(0.001, size), Math.max(0.001, size));
      piece.rotation.y = base - (1 - smooth(grow)) * Math.PI * 2;
      piece.position.copy(end);
      const ring = Math.min(1, v / 0.85);
      flash.scale.setScalar(0.6 + ring * 1.6);
      (flash.material as T.MeshBasicMaterial).opacity = capturing() ? 0 : Math.sin(Math.PI * ring) * 0.9;
      if (u === 1) finish();
    }, finish);
  }
  highlights(
    selected: Square | null,
    target: Square | null,
    legal: Square[],
    last: Move | undefined,
    check: Square | undefined,
    cursor: Square | null,
  ) {
    const key = JSON.stringify([
      selected,
      target,
      legal,
      last?.from,
      last?.to,
      check,
      cursor,
    ]);
    if (key === this.markKey) return;
    this.markKey = key;
    this.dirty = true;
    this.marks.clear();
    this.checkGlow = null;
    const m = this.mark,
      put = (s: Square, geometry: T.BufferGeometry, material: T.Material, y: number) => {
        const p = toWorld(s),
          mesh = new T.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x, y, p.z);
        this.marks.add(mesh);
        return mesh;
      };
    // The last move's two squares, softly.
    if (last) {
      put(last.from, m.square, m.lastFrom, 0.2105);
      put(last.to, m.square, m.last, 0.2105);
    }
    if (selected) put(selected, m.square, m.selected, 0.2115);
    if (target) put(target, m.square, m.targetSquare, 0.2115);
    // A king in check stands in a red glow.
    if (check) this.checkGlow = put(check, m.glow, m.check, 0.213);
    if (cursor) put(cursor, m.ring, m.cursor, 0.218);
    for (const s of legal) {
      // A piece that may be taken is marked apart from an empty square (the user asked): its square glows red and a
      // red ring stands round its foot, where a plain dot would hide under it.
      if (this.tokens.has(s)) {
        put(s, m.square, m.take, 0.2115);
        put(s, m.target, m.takeRing, 0.222);
        continue;
      }
      put(s, m.dot, m.legal, 0.225);
    }
  }
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), -0.21);
  /** The square under the pointer, or null off the board. */
  private squareAt(e: PointerEvent): Square | null {
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const point = new T.Vector3();
    return this.ray.ray.intersectPlane(this.plane, point) ? fromWorld(point.x, point.z) : null;
  }
  private pick(e: PointerEvent, confirm: boolean) {
    if (this.disposed || this.animating) return;
    this.onSelect(this.squareAt(e), confirm);
  }
  private target() {
    const distance = cameraDistance(this.camera.aspect, this.top, SUBJECTS.chess),
      a = this.top ? OVERHEAD : TILT;
    this.cameraTarget.set(
      0,
      Math.sin(a) * distance,
      Math.cos(a) * distance * (this.facing === "w" ? 1 : -1),
    );
  }
  /** `delay` holds the turn back until the last move has been seen. */
  setCamera(facing: Color, top = this.top, delay = 0) {
    this.cameraMs = facing === this.facing ? 450 : TURN_MS;
    this.facing = facing;
    this.top = top;
    this.cameraStart.copy(this.camera.position);
    this.target();
    this.cameraAt = performance.now() + delay;
    this.dirty = true;
  }
  private resize(force = false) {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h || (!force && w === this.width && h === this.height)) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.target();
    if (!this.cameraAt) this.camera.position.copy(this.cameraTarget);
    this.dirty = true;
  }
  setQuality(q: "high" | "low") {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, q === "high" ? 2 : 1),
    );
    this.resize(true);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.cancelGPU();
    for (const a of this.acts) a.drop?.();
    this.acts = [];
    this.marks.clear();
    disposeScene(this.scene);
    disposeScene(this.templates);
    for (const r of this.resources) r.dispose();
    this.resources = [];
    this.tokens.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
