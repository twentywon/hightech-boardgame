import * as T from "three";
import type { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import { wood, disposeScene, afterGPUFrame, aim, realism, planks, veneer, glossy, block, hop, travel } from "../../engine/scene-utils";
import { toWorld, fromWorld, squares } from "./coordinates";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  TURN_MS,
  cameraDistance,
  orbit,
} from "../../engine/camera";
/** How large a taken piece stands beside the board, and where the `i`-th piece `taker` took stands. */
const TAKEN_SCALE = 0.72;
/**
 * At the taker's right hand, on the table beside the board: white sits at the near edge (+z) and its right is +x,
 * black sits across (−z) and its right is −x. Three to a row, from the player's own edge inward.
 */
export function takenAt(taker: Color, i: number) {
  const side = taker === "w" ? 1 : -1;
  return new T.Vector3(side * (3.98 + (i % 3) * 0.5), -0.25, side * (3.05 - Math.floor(i / 3) * 0.58));
}
interface Token {
  mesh: T.Group;
  type: PieceSymbol;
  color: Color;
}
export class ChessView {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  onSelect: (square: Square | null, confirm: boolean) => void = () => {};
  onCancel: () => void = () => {};
  onSettled: () => void = () => {};
  onContact: () => void = () => {};
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
  private marks = new T.Group();
  private markKey = "";
  private moves: {
    mesh: T.Group;
    from: T.Vector3;
    to: T.Vector3;
    start: number;
    capture: boolean;
  }[] = [];
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
    return !!this.cameraAt || this.moves.length > 0;
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
    this.renderer.setClearColor("#65452f");
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute("aria-label", "3D 체스판");
    host.append(canvas);
    this.scene.add(new T.HemisphereLight("#fff2d7", "#283c35", 2.6));
    const sun = new T.DirectionalLight("#fff5df", 3.2);
    sun.position.set(-4, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -5,
      right: 5,
      top: 5,
      bottom: -5,
    });
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    realism(this.renderer, this.scene, true);
    const table = new T.Mesh(
      new T.BoxGeometry(80, 0.2, 80),
      new T.MeshStandardMaterial(planks(10)),
    );
    table.position.y = -0.35;
    table.receiveShadow = true;
    this.scene.add(table);
    // The rim is a lighter, warmer, polished wood than the table under it, so that the board stands apart (the user asked).
    const rim = new T.Mesh(
      block(7.05, 0.35, 7.05),
      new T.MeshStandardMaterial({ map: wood(false), color: "#b27450", roughness: 0.34 }),
    );
    rim.castShadow = rim.receiveShadow = true;
    this.scene.add(rim);
    // Squares of maple and walnut veneer, each cut from another part of its sheet so that no two have the same grain.
    const light = new T.MeshStandardMaterial({ map: veneer(false), roughness: 0.38, color: "#fff4e0" }),
      dark = new T.MeshStandardMaterial({ map: veneer(true), roughness: 0.38, color: "#9a7458" });
    let cut = 7;
    const sheet = () => (cut = (cut * 1664525 + 1013904223) >>> 0) / 4294967296,
      square = () => {
        const tile = new T.BoxGeometry(0.78, 0.035, 0.78),
          uv = tile.getAttribute("uv"),
          u0 = sheet() * 0.5,
          v0 = sheet() * 0.5;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
        return tile;
      };
    for (const s of squares) {
      const p = toWorld(s),
        m = new T.Mesh(
          square(),
          (s.charCodeAt(0) - 97 + Number(s[1]) - 1) % 2 === 0 ? dark : light,
        );
      m.position.set(p.x, 0.192, p.z);
      m.receiveShadow = true;
      this.scene.add(m);
    }
    for (let i = 0; i < 8; i++)
      for (const reverse of [false, true]) {
        this.label(
          "abcdefgh"[i],
          (i - 3.5) * 0.78,
          reverse ? 3.35 : -3.35,
          !reverse,
        );
        this.label(
          String(8 - i),
          reverse ? 3.35 : -3.35,
          (i - 3.5) * 0.78,
          reverse,
        );
      }
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
      const wasAnimating = this.animating;
      if (!this.dirty && !wasAnimating) return;
      this.dirty = false;
      if (this.cameraAt) {
        // A delayed turn has not begun while the time is still negative.
        const u = Math.max(0, Math.min(1, (t - this.cameraAt) / this.cameraMs));
        orbit(this.camera.position, this.cameraStart, this.cameraTarget, u * u * (3 - 2 * u));
        if (u === 1) this.cameraAt = 0;
      }
      this.camera.lookAt(0, 0.1, 0);
      this.moves = this.moves.filter((m) => {
        const u = Math.min(1, (t - m.start) / 320),
          e = m.capture ? u * u * (3 - 2 * u) : travel(u);
        m.mesh.position.lerpVectors(m.from, m.to, e);
        // A taken piece hops off the board to its taker's row, growing a little smaller on the way.
        if (m.capture) {
          m.mesh.position.y += hop(u) * 0.9;
          m.mesh.scale.setScalar(1 - (1 - TAKEN_SCALE) * Math.min(1, u * 1.4));
        } else m.mesh.position.y += hop(u) * 0.35;
        if (u === 1) this.onContact();
        return u < 1;
      });
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
  private label(text: string, x: number, z: number, reverse: boolean) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#3b2414";
    ctx.font = "42px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 32);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(
      new T.PlaneGeometry(0.22, 0.22),
      new T.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    if (reverse) m.rotation.z = Math.PI;
    m.position.set(x, 0.18, z);
    this.scene.add(m);
  }
  private prototype(type: PieceSymbol, color: Color) {
    const key = color + type,
      cached = this.prototypes.get(key);
    if (cached) return cached;
    const g = new T.Group(),
      mat = glossy({
        // Lacquered boxwood and ebony.
        color: color === "w" ? "#ecdcb4" : "#1d1a18",
        roughness: 0.4,
        // The turned bodies are open shells: drawn one-sided, their far wall showed through the near one.
        side: T.DoubleSide,
      });
    const add = (geo: T.BufferGeometry, x = 0, y = 0, z = 0) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const lathe = (points: number[][]) =>
      new T.LatheGeometry(
        points.map(([r, y]) => new T.Vector2(r, y)),
        32,
      );
    // A turned set in the Staunton manner: every piece stands on the same foot and stem, closed at the top.
    add(
      lathe([
        [0, 0],
        [0.3, 0],
        [0.315, 0.025],
        [0.315, 0.07],
        [0.29, 0.1],
        [0.25, 0.115],
        [0.235, 0.145],
        [0.255, 0.175],
        [0.24, 0.205],
        [0.19, 0.235],
        [0.16, 0.3],
        [0.138, 0.4],
        [0.125, 0.5],
        [0.14, 0.545],
        [0.2, 0.565],
        [0.215, 0.59],
        [0.2, 0.612],
        [0.12, 0.628],
        [0, 0.63],
      ]),
    );
    if (type === "p") {
      add(lathe([[0.12, 0.62], [0.085, 0.66], [0.1, 0.7], [0, 0.7]]));
      add(new T.SphereGeometry(0.175, 28, 20), 0, 0.82);
    }
    if (type === "r") {
      // A tower with a hollow top and six merlons round it.
      add(
        lathe([
          [0.19, 0.61],
          [0.165, 0.66],
          [0.158, 0.86],
          [0.19, 0.9],
          [0.25, 0.93],
          [0.265, 0.96],
          [0.265, 1.03],
          [0.185, 1.03],
          [0.185, 0.97],
          [0, 0.97],
        ]),
      );
      for (let n = 0; n < 6; n++) {
        const a = (n * Math.PI) / 3,
          arc = 0.36,
          merlon = new T.Shape();
        merlon.absarc(0, 0, 0.265, a - arc, a + arc, false);
        merlon.absarc(0, 0, 0.185, a + arc, a - arc, true);
        add(new T.ExtrudeGeometry(merlon, { depth: 0.09, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 6 }).rotateX(-Math.PI / 2), 0, 1.03, 0);
      }
    }
    if (type === "b") {
      // A mitre on a collar, with its slit and a finial.
      add(
        lathe([
          [0.19, 0.61],
          [0.12, 0.65],
          [0.1, 0.72],
          [0.16, 0.755],
          [0.182, 0.78],
          [0.16, 0.805],
          [0.115, 0.825],
          [0.15, 0.9],
          [0.178, 0.99],
          [0.168, 1.08],
          [0.125, 1.17],
          [0.06, 1.24],
          [0, 1.265],
        ]),
      );
      const cut = new T.Mesh(
        new T.BoxGeometry(0.022, 0.15, 0.345),
        new T.MeshStandardMaterial({
          color: color === "w" ? "#837d70" : "#5c6766",
          roughness: 0.6,
        }),
      );
      // A thin dark plate set into the mitre: only its edge shows, as the slit.
      cut.position.set(0.07, 1.115, 0);
      cut.rotation.z = -0.5;
      g.add(cut);
      add(new T.SphereGeometry(0.052, 18, 12), 0, 1.3);
    }
    if (type === "n") {
      // A horse's head cut from a board and rounded off: ear, forehead, nose, jaw and the arch of the neck.
      const head = new T.Shape();
      head.moveTo(-0.185, 0.6);
      head.splineThru(
        [
          [-0.225, 0.78],
          [-0.21, 0.95],
          [-0.14, 1.1],
          [-0.06, 1.2],
          [-0.025, 1.3],
          [0.03, 1.21],
          [0.095, 1.16],
          [0.2, 1.06],
          [0.295, 0.935],
          [0.32, 0.865],
          [0.285, 0.8],
          [0.2, 0.805],
          [0.125, 0.86],
          [0.105, 0.78],
          [0.15, 0.68],
          [0.17, 0.6],
        ].map(([x, y]) => new T.Vector2(x, y)),
      );
      head.closePath();
      const geo = new T.ExtrudeGeometry(head, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.055,
        bevelSegments: 4,
        curveSegments: 28,
        steps: 1,
      });
      geo.translate(0, 0, -0.065);
      add(geo);
      // The mane: a ridge down the back of the neck.
      const mane = new T.Shape();
      mane.moveTo(-0.2, 0.64);
      mane.splineThru([[-0.265, 0.8], [-0.25, 0.97], [-0.17, 1.13], [-0.08, 1.24], [-0.1, 1.1], [-0.17, 0.95], [-0.185, 0.8]].map(([x, y]) => new T.Vector2(x, y)));
      mane.closePath();
      add(new T.ExtrudeGeometry(mane, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -0.025));
      for (const z of [-0.118, 0.118]) {
        const eye = new T.Mesh(
          new T.SphereGeometry(0.024, 12, 8),
          new T.MeshStandardMaterial({
            color: color === "w" ? "#353d39" : "#ddcda5",
          }),
        );
        eye.position.set(0.135, 1.03, z);
        g.add(eye);
      }
    }
    if (type === "q" || type === "k") {
      add(
        lathe([
          [0.19, 0.61],
          [0.125, 0.66],
          [0.1, 0.8],
          [0.095, 0.98],
          [0.13, 1.04],
          [0.21, 1.07],
          [0.215, 1.1],
          [0.15, 1.12],
          [0.13, 1.16],
          ...(type === "q"
            ? [
                [0.185, 1.25],
                [0.235, 1.305],
                [0.2, 1.305],
                [0.12, 1.25],
                [0, 1.26],
              ]
            : [
                [0.2, 1.27],
                [0.22, 1.31],
                [0.17, 1.335],
                [0.06, 1.36],
                [0, 1.365],
              ]),
        ]),
      );
      if (type === "q") {
        // A coronet of small balls round a dome, and one on top.
        for (let n = 0; n < 8; n++) {
          const a = (n * Math.PI) / 4;
          add(new T.SphereGeometry(0.042, 14, 10), Math.cos(a) * 0.218, 1.325, Math.sin(a) * 0.218);
        }
        add(new T.SphereGeometry(0.13, 22, 14).scale(1, 0.6, 1), 0, 1.27);
        add(new T.SphereGeometry(0.05, 16, 12), 0, 1.38);
      } else {
        add(block(0.085, 0.27, 0.085, 0.02), 0, 1.49);
        add(block(0.25, 0.085, 0.085, 0.02), 0, 1.505);
      }
    }
    if (color === "b") g.rotation.y = Math.PI;
    this.prototypes.set(key, g);
    this.templates.add(g);
    return g;
  }
  private token(type: PieceSymbol, color: Color, square: Square): Token {
    const mesh = this.prototype(type, color).clone(true),
      p = toWorld(square);
    mesh.position.set(p.x, 0.22, p.z);
    this.scene.add(mesh);
    return { mesh, type, color };
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
        this.moves.push({
          mesh: taken.mesh,
          from: taken.mesh.position.clone(),
          to: takenAt(last.color, row.length - 1),
          start: performance.now(),
          capture: true,
        });
      }
      const moving = this.tokens.get(last.from);
      if (moving) {
        this.tokens.delete(last.from);
        let token = moving;
        if (last.promotion) {
          this.scene.remove(moving.mesh);
          token = this.token(last.promotion, last.color, last.from);
        }
        this.tokens.set(last.to, token);
        this.move(token, last.to);
      }
      if (last.isKingsideCastle() || last.isQueensideCastle()) {
        const rank = last.from[1],
          from = `${last.isKingsideCastle() ? "h" : "a"}${rank}` as Square,
          to = `${last.isKingsideCastle() ? "f" : "d"}${rank}` as Square;
        const rook = this.tokens.get(from);
        if (rook) {
          this.tokens.delete(from);
          this.tokens.set(to, rook);
          this.move(rook, to);
        }
      }
    } else {
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
    }
  }
  private move(token: Token, to: Square) {
    const p = toWorld(to);
    this.moves.push({
      mesh: token.mesh,
      from: token.mesh.position.clone(),
      to: new T.Vector3(p.x, 0.22, p.z),
      start: performance.now(),
      capture: false,
    });
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
    disposeScene(this.marks);
    this.marks.clear();
    const mark = (s: Square, color: string, ring = false) => {
      const p = toWorld(s),
        m = new T.Mesh(
          ring
            ? new T.RingGeometry(0.31, 0.34, 32)
            : new T.PlaneGeometry(0.73, 0.73),
          new T.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: ring ? 0.9 : 0.34,
            side: T.DoubleSide,
            depthWrite: false,
          }),
        );
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.218, p.z);
      this.marks.add(m);
    };
    if (last) {
      mark(last.from, "#d6af57");
      mark(last.to, "#d6af57");
    }
    if (selected) mark(selected, "#f0d267");
    if (target) mark(target, "#a2cc7d");
    if (check) mark(check, "#e65a45", true);
    if (cursor) mark(cursor, "#fff2c6", true);
    for (const s of legal) {
      // A piece that may be taken is marked apart from an empty square (the user asked): its square glows red and a
      // red ring stands round its foot, where a plain dot would hide under it.
      if (this.tokens.has(s)) {
        mark(s, "#d8432f");
        const p = toWorld(s),
          ring = new T.Mesh(
            new T.RingGeometry(0.31, 0.37, 40),
            new T.MeshBasicMaterial({ color: "#e0402a", transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false }),
          );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, 0.222, p.z);
        this.marks.add(ring);
        continue;
      }
      const p = toWorld(s),
        m = new T.Mesh(
          new T.CircleGeometry(0.085, 24),
          new T.MeshBasicMaterial({
            color: "#c09032",
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
        );
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, 0.225, p.z);
      this.marks.add(m);
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
    disposeScene(this.scene);
    disposeScene(this.templates);
    this.tokens.clear();
    this.moves = [];
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
