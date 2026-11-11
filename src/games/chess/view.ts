import * as T from "three";
import type { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import { wood, disposeScene, afterGPUFrame, aim } from "../../engine/scene-utils";
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
  private cameraStart = new T.Vector3();
  private cameraTarget = new T.Vector3();
  private cameraAt = 0;
  private cameraMs = 450;
  private pointerId: number | null = null;
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
    const table = new T.Mesh(
      new T.BoxGeometry(80, 0.2, 80),
      new T.MeshStandardMaterial({ map: wood(true), roughness: 0.8 }),
    );
    table.position.y = -0.35;
    table.receiveShadow = true;
    this.scene.add(table);
    const rim = new T.Mesh(
      new T.BoxGeometry(7.05, 0.35, 7.05),
      new T.MeshStandardMaterial({ map: wood(true), roughness: 0.5 }),
    );
    rim.castShadow = rim.receiveShadow = true;
    this.scene.add(rim);
    const light = new T.MeshStandardMaterial({
        color: "#e8dfc6",
        roughness: 0.77,
      }),
      dark = new T.MeshStandardMaterial({ color: "#28594c", roughness: 0.76 });
    const tile = new T.BoxGeometry(0.78, 0.035, 0.78);
    for (const s of squares) {
      const p = toWorld(s),
        m = new T.Mesh(
          tile,
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
      this.pick(e, false);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (this.pointerId !== e.pointerId || e.button !== 0) return;
      this.pointerId = null;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      if (e.pointerType === "mouse") this.pick(e, true);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (
        e.isPrimary &&
        this.pointerId === e.pointerId &&
        e.pointerType !== "mouse"
      )
        this.pick(e, false);
    });
    const cancel = (e: PointerEvent) => {
      if (this.pointerId !== e.pointerId) return;
      this.pointerId = null;
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
          e = u * u * (3 - 2 * u);
        m.mesh.position.lerpVectors(m.from, m.to, e);
        if (m.capture) m.mesh.scale.setScalar(Math.max(0.01, 1 - u));
        else m.mesh.position.y += Math.sin(Math.PI * u) * 0.35;
        if (u === 1) {
          if (m.capture) this.scene.remove(m.mesh);
          else this.onContact();
        }
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
    ctx.fillStyle = "#e2d3ac";
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
      mat = new T.MeshStandardMaterial({
        color: color === "w" ? "#f2ecdb" : "#22292b",
        roughness: 0.28,
        metalness: 0.09,
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
    add(
      lathe([
        [0, 0],
        [0.29, 0],
        [0.31, 0.05],
        [0.3, 0.11],
        [0.23, 0.16],
        [0.25, 0.2],
        [0.18, 0.25],
        [0.15, 0.32],
        [0.11, 0.48],
        [0.15, 0.56],
        [0.19, 0.59],
      ]),
    );
    if (type === "p") {
      add(new T.SphereGeometry(0.19, 24, 16), 0, 0.72);
    }
    if (type === "r") {
      add(new T.CylinderGeometry(0.23, 0.16, 0.34, 32), 0, 0.72);
      add(new T.CylinderGeometry(0.27, 0.24, 0.11, 32), 0, 0.92);
      for (let n = 0; n < 6; n++) {
        const a = (n * Math.PI) / 3;
        const m = add(
          new T.BoxGeometry(0.12, 0.14, 0.12),
          Math.sin(a) * 0.21,
          1.03,
          Math.cos(a) * 0.21,
        );
        m.rotation.y = a;
      }
    }
    if (type === "b") {
      add(new T.CylinderGeometry(0.1, 0.17, 0.24, 28), 0, 0.68);
      const head = add(new T.SphereGeometry(0.22, 28, 20), 0, 0.96);
      head.scale.set(0.85, 1.3, 0.85);
      const cut = new T.Mesh(
        new T.BoxGeometry(0.045, 0.31, 0.32),
        new T.MeshStandardMaterial({
          color: color === "w" ? "#837d70" : "#5c6766",
          roughness: 0.6,
        }),
      );
      cut.position.set(0.06, 1.07, 0);
      cut.rotation.z = -0.45;
      g.add(cut);
      add(new T.SphereGeometry(0.065, 16, 12), 0, 1.23);
    }
    if (type === "n") {
      const shape = new T.Shape();
      shape.moveTo(-0.2, 0.54);
      shape.lineTo(-0.22, 0.82);
      shape.lineTo(-0.08, 1.12);
      shape.lineTo(0.03, 1.24);
      shape.lineTo(0.02, 1.06);
      shape.lineTo(0.19, 1.02);
      shape.lineTo(0.3, 0.83);
      shape.lineTo(0.21, 0.75);
      shape.lineTo(0.08, 0.8);
      shape.lineTo(0.14, 0.54);
      shape.closePath();
      const geo = new T.ExtrudeGeometry(shape, {
        depth: 0.23,
        bevelEnabled: true,
        bevelSize: 0.025,
        bevelThickness: 0.025,
        bevelSegments: 2,
        steps: 1,
      });
      geo.translate(0, 0, -0.115);
      add(geo);
      for (const z of [-0.145, 0.145]) {
        const eye = new T.Mesh(
          new T.SphereGeometry(0.027, 12, 8),
          new T.MeshStandardMaterial({
            color: color === "w" ? "#353d39" : "#ddcda5",
          }),
        );
        eye.position.set(0.13, 0.96, z);
        g.add(eye);
      }
    }
    if (type === "q" || type === "k") {
      add(
        lathe([
          [0.16, 0.55],
          [0.12, 0.64],
          [0.1, 0.85],
          [0.14, 0.94],
          [0.22, 0.98],
          [0.22, 1.04],
          [0.15, 1.08],
        ]),
      );
      if (type === "q") {
        add(new T.CylinderGeometry(0.22, 0.13, 0.18, 32), 0, 1.17);
        for (let n = 0; n < 6; n++) {
          const a = (n * Math.PI) / 3;
          add(
            new T.SphereGeometry(0.065, 16, 12),
            Math.cos(a) * 0.18,
            1.3,
            Math.sin(a) * 0.18,
          );
        }
        add(new T.SphereGeometry(0.075, 16, 12), 0, 1.34);
      } else {
        add(new T.BoxGeometry(0.105, 0.35, 0.105), 0, 1.29);
        add(new T.BoxGeometry(0.31, 0.1, 0.105), 0, 1.32);
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
        this.moves.push({
          mesh: taken.mesh,
          from: taken.mesh.position.clone(),
          to: taken.mesh.position.clone().add(new T.Vector3(0, -0.4, 0)),
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
  private pick(e: PointerEvent, confirm: boolean) {
    if (this.disposed || this.animating) return;
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const point = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, point)) {
      this.onSelect(null, confirm);
      return;
    }
    this.onSelect(fromWorld(point.x, point.z), confirm);
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
