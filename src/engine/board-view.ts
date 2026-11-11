import {
  toWorld as reversiWorld,
  fromWorld as reversiPoint,
} from "../games/reversi/coordinates";
import type { State as ReversiState } from "../games/reversi/rules";
import * as T from "three";
import { SPACING, fromWorld, toWorld } from "../games/gomoku/coordinates";
import type { Point, State } from "../games/gomoku/rules";
import { wood, disposeScene, afterGPUFrame, aim } from "./scene-utils";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  cameraDistance,
  orbit,
} from "./camera";

const GOMOKU_BOARD = 6.55;
/** Column letters and row numbers drawn in the Gomoku board margin. */
function gomokuLabels() {
  const size = 1024,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!,
    scale = size / GOMOKU_BOARD,
    half = GOMOKU_BOARD / 2,
    edge = half - (half - 7 * SPACING) / 2;
  ctx.fillStyle = "rgba(74,50,28,0.85)";
  ctx.font = `600 ${Math.round(0.15 * scale)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 15; i++) {
    const v = (i - 7) * SPACING;
    for (const side of [-edge, edge]) {
      ctx.fillText(
        String.fromCharCode(65 + i),
        (v + half) * scale,
        (side + half) * scale,
      );
      ctx.fillText(String(i + 1), (side + half) * scale, (v + half) * scale);
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
export class BoardView {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(FOV, 1, 0.1, 60);
  private stones = new T.Group();
  private hints = new T.Group();
  private labels: T.Mesh | null = null;
  private suggestion: T.Mesh | null = null;
  private discs = new Map<number, T.Mesh>();
  private discColors = new Int8Array(64);
  private flips: {
    mesh: T.Mesh;
    start: number;
    from: number;
    to: number;
    sounded: boolean;
  }[] = [];
  onSettled: () => void = () => {};
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), -0.15);
  private ghost: T.Mesh;
  private marker: T.Mesh;
  private win: T.Group = new T.Group();
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private firstRendered = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private disposed = false;
  private lastWidth = 0;
  private lastHeight = 0;
  get ready() {
    return this.readyFlag;
  }
  private cameraStart = new T.Vector3();
  private target = new T.Vector3();
  private transitionStart = 0;
  /** The table is seen from the far side, for the second local player. */
  private top = false;
  private zoom = false;
  private falling: { mesh: T.Mesh; start: number; sounded: boolean }[] = [];
  private lastCount = -1;
  private stoneMoves: State["moves"] = [];
  private activePointer: number | null = null;
  private selectionPointerType = "";
  private lastPointer = 0;
  onSelect: (p: Point | null, confirm: boolean) => void = () => {};
  onContact: () => void = () => {};
  get animating() {
    return this.moving || this.falling.length > 0 || this.flips.length > 0;
  }
  private world(p: Point) {
    return this.variant === "reversi" ? reversiWorld(p) : toWorld(p);
  }
  get moving() {
    return this.transitionStart !== 0;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    private variant: "gomoku" | "reversi" = "gomoku",
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#65452f");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      this.variant === "reversi" ? "3D 리버시판" : "3D 오목판",
    );
    this.scene.add(new T.HemisphereLight("#fff1d2", "#44352b", 2.5));
    const light = new T.DirectionalLight("#fff4dc", 3.5);
    light.position.set(-3, 9, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -6;
    light.shadow.camera.right = 6;
    light.shadow.camera.top = 6;
    light.shadow.camera.bottom = -6;
    light.shadow.normalBias = 0.025;
    this.scene.add(light);
    const table = new T.Mesh(
      new T.BoxGeometry(100, 0.2, 100),
      new T.MeshStandardMaterial({ map: wood(true), roughness: 0.8 }),
    );
    table.position.y = -0.34;
    table.receiveShadow = true;
    this.scene.add(table);
    const board = new T.Mesh(
      new T.BoxGeometry(
        this.variant === "reversi" ? 6.3 : 6.55,
        0.36,
        this.variant === "reversi" ? 6.3 : 6.55,
      ),
      new T.MeshStandardMaterial({ map: wood(), roughness: 0.52 }),
    );
    board.position.y = -0.03;
    board.castShadow = board.receiveShadow = true;
    this.scene.add(board);
    const positions: number[] = [];
    if (this.variant === "reversi") {
      const felt = new T.Mesh(
        new T.BoxGeometry(5.82, 0.025, 5.82),
        new T.MeshStandardMaterial({ color: "#204e43", roughness: 0.94 }),
      );
      felt.position.y = 0.17;
      felt.receiveShadow = true;
      this.scene.add(felt);
      for (let i = 0; i <= 8; i++) {
        const v = (i - 4) * 0.72;
        positions.push(
          -2.88,
          0.19,
          v,
          2.88,
          0.19,
          v,
          v,
          0.19,
          -2.88,
          v,
          0.19,
          2.88,
        );
      }
      for (let i = 0; i < 8; i++) {
        for (const [label, x, z] of [
          [String.fromCharCode(65 + i), (i - 3.5) * 0.72, -3.06],
          [String(i + 1), -3.06, (i - 3.5) * 0.72],
        ] as const) {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#4b3420";
          ctx.font = "40px Georgia";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, 32, 32);
          const texture = new T.CanvasTexture(c);
          texture.colorSpace = T.SRGBColorSpace;
          const labelMesh = new T.Mesh(
            new T.PlaneGeometry(0.22, 0.22),
            new T.MeshBasicMaterial({
              map: texture,
              transparent: true,
              depthWrite: false,
            }),
          );
          labelMesh.rotation.x = -Math.PI / 2;
          labelMesh.position.set(x, 0.157, z);
          this.scene.add(labelMesh);
        }
      }
    } else {
      const map = gomokuLabels();
      map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.labels = new T.Mesh(
        new T.PlaneGeometry(GOMOKU_BOARD, GOMOKU_BOARD),
        new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
      );
      this.labels.rotation.x = -Math.PI / 2;
      this.labels.position.y = 0.153;
      this.scene.add(this.labels);
      for (let i = 0; i < 15; i++) {
        const v = (i - 7) * 0.42;
        positions.push(
          -2.94,
          0.155,
          v,
          2.94,
          0.155,
          v,
          v,
          0.155,
          -2.94,
          v,
          0.155,
          2.94,
        );
      }
      for (const row of [3, 7, 11])
        for (const col of [3, 7, 11]) {
          if ((row !== 7 && col === 7) || (row === 7 && col !== 7)) continue;
          const p = toWorld({ row, col });
          const dot = new T.Mesh(
            new T.CircleGeometry(0.043, 20),
            new T.MeshBasicMaterial({ color: "#594027" }),
          );
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(p.x, 0.16, p.z);
          this.scene.add(dot);
        }
    }
    const lines = new T.BufferGeometry();
    lines.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    this.scene.add(
      new T.LineSegments(
        lines,
        new T.LineBasicMaterial({
          color: this.variant === "reversi" ? "#c4b588" : "#594027",
          transparent: true,
          opacity: this.variant === "reversi" ? 0.4 : 0.78,
        }),
      ),
    );
    this.scene.add(this.stones, this.win, this.hints);
    this.suggestion = new T.Mesh(
      this.variant === "reversi"
        ? new T.RingGeometry(0.2, 0.26, 40)
        : new T.RingGeometry(0.13, 0.175, 40),
      new T.MeshBasicMaterial({
        color: this.variant === "reversi" ? "#f2d27a" : "#2f8f6f",
        side: T.DoubleSide,
      }),
    );
    this.suggestion.rotation.x = -Math.PI / 2;
    this.suggestion.visible = false;
    this.scene.add(this.suggestion);
    this.ghost = this.makeStone(1);
    // The preview owns translucent copies; stones keep the shared materials.
    const translucent = (m: T.Material) => {
      const copy = m.clone();
      copy.transparent = true;
      copy.opacity = 0.42;
      return copy;
    };
    this.ghost.material = Array.isArray(this.ghost.material)
      ? this.ghost.material.map(translucent)
      : translucent(this.ghost.material);
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.marker = new T.Mesh(
      new T.RingGeometry(0.045, 0.065, 24),
      new T.MeshBasicMaterial({ color: "#d5af61", side: T.DoubleSide }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.camera.position.copy(this.target);
    this.camera.lookAt(0, 0, 0);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.button !== 0 || this.activePointer !== null) return;
      this.activePointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.pointer(e, false);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!e.isPrimary) return;
      if (
        this.activePointer === e.pointerId ||
        (this.activePointer === null &&
          e.pointerType === "mouse" &&
          e.buttons === 0)
      )
        this.pointer(e, false);
    });
    canvas.addEventListener("pointerup", (e) => {
      if (this.activePointer !== e.pointerId || e.button !== 0) return;
      this.activePointer = null;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      if (
        e.pointerType === "mouse" &&
        performance.now() - this.lastPointer > 320
      ) {
        this.lastPointer = performance.now();
        this.pointer(e, true);
      }
    });
    const cancelPointer = (e: PointerEvent) => {
      if (this.activePointer !== e.pointerId) return;
      this.activePointer = null;
      if (canvas.hasPointerCapture(e.pointerId))
        canvas.releasePointerCapture(e.pointerId);
      this.clearSelection();
    };
    canvas.addEventListener("pointercancel", cancelPointer);
    canvas.addEventListener("lostpointercapture", cancelPointer);
    canvas.addEventListener("pointerleave", (event) => {
      // A touch selection remains pending while the user reaches the confirm
      // button, including on devices that also emit mouse leave events.
      if (
        event.pointerType === "mouse" &&
        this.activePointer === null &&
        this.selectionPointerType === "mouse"
      )
        this.clearSelection();
    });
    const loop = (time: number) => {
      this.raf = requestAnimationFrame(loop);
      const settling = this.animating;
      const animate =
        this.transitionStart !== 0 ||
        this.falling.length > 0 ||
        this.win.children.length > 0 ||
        this.flips.length > 0;
      if (!this.dirty && !animate) return;
      this.dirty = false;
      if (this.transitionStart) {
        const t = Math.max(0, Math.min(1, (time - this.transitionStart) / 450)),
          s = t * t * (3 - 2 * t);
        orbit(this.camera.position, this.cameraStart, this.target, s);
        if (t === 1) this.transitionStart = 0;
      }
      this.camera.lookAt(0, 0, 0);
      this.flips = this.flips.filter((f) => {
        const t = Math.max(0, Math.min(1, (time - f.start) / 380)),
          eased = t * t * (3 - 2 * t);
        f.mesh.rotation.x = f.from + (f.to - f.from) * eased;
        f.mesh.position.y = 0.245 + Math.sin(Math.PI * t) * 0.27;
        if (t >= 0.95 && !f.sounded) {
          f.sounded = true;
          this.onContact();
        }
        return t < 1;
      });
      this.falling = this.falling.filter((f) => {
        const t = Math.min(1, (time - f.start) / 280);
        f.mesh.position.y = 0.245 + 0.65 * Math.pow(1 - t, 3);
        if (this.variant === "gomoku")
          f.mesh.scale.set(
            0.19,
            0.095 * (1 + Math.sin(t * Math.PI) * 0.15),
            0.19,
          );
        if (t > 0.82 && !f.sounded) {
          f.sounded = true;
          this.onContact();
        }
        return t < 1;
      });
      this.win.children.forEach((c) => {
        c.scale.setScalar(1 + Math.sin(time * 0.004) * 0.04);
      });
      this.renderer.render(this.scene, this.camera);
      if (!this.firstRendered) {
        this.firstRendered = true;
        this.waitForInitialGPUFrame();
      }
      if (settling && !this.animating) this.onSettled();
    };
    this.raf = requestAnimationFrame(loop);
  }
  // render() queues GPU work. Poll a fence instead of blocking the UI or starting
  // search while the first shader/texture uploads are still being processed.
  private waitForInitialGPUFrame() {
    this.cancelReady = afterGPUFrame(this.renderer, () => {
      this.readyFlag = true;
    });
  }

  private shared: {
    stone: T.BufferGeometry;
    stoneMaterial: T.Material | T.Material[] | null;
    white: T.Material | null;
    ring: Map<string, { geometry: T.BufferGeometry; material: T.Material }>;
  } | null = null;
  /**
   * Geometry and materials every stone, disc and marker of this view shares.
   * One GPU buffer and shader program per kind instead of one per mesh.
   */
  private get assets() {
    if (!this.shared) {
      const reversi = this.variant === "reversi";
      this.shared = {
        stone: reversi
          ? new T.CylinderGeometry(0.285, 0.285, 0.105, 40)
          : new T.SphereGeometry(1, 32, 20),
        stoneMaterial: reversi
          ? [
              new T.MeshStandardMaterial({ color: "#35383a", roughness: 0.35 }),
              new T.MeshStandardMaterial({ color: "#202226", roughness: 0.26 }),
              new T.MeshStandardMaterial({ color: "#f6f0e4", roughness: 0.25 }),
            ]
          : new T.MeshStandardMaterial({
              color: "#202226",
              roughness: 0.24,
              metalness: 0.04,
            }),
        white: reversi
          ? null
          : new T.MeshStandardMaterial({
              color: "#f6f0e4",
              roughness: 0.2,
              metalness: 0.04,
            }),
        ring: new Map(),
      };
    }
    return this.shared;
  }
  private ring(inner: number, outer: number, segments: number, color: string, opacity = 1) {
    const key = `${inner}|${outer}|${color}|${opacity}`;
    let entry = this.assets.ring.get(key);
    if (!entry) {
      entry = {
        geometry: new T.RingGeometry(inner, outer, segments),
        material: new T.MeshBasicMaterial({
          color,
          side: T.DoubleSide,
          transparent: opacity < 1,
          opacity,
        }),
      };
      this.assets.ring.set(key, entry);
    }
    const mesh = new T.Mesh(entry.geometry, entry.material);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }
  private makeStone(player: number) {
    const { stone, stoneMaterial, white } = this.assets;
    if (this.variant === "reversi") {
      const mesh = new T.Mesh(stone, stoneMaterial!);
      mesh.rotation.x = player === 1 ? 0 : Math.PI;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
    const mesh = new T.Mesh(stone, player === 1 ? stoneMaterial! : white!);
    mesh.scale.set(0.19, 0.095, 0.19);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  private resize(force = false) {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h || (!force && w === this.lastWidth && h === this.lastHeight))
      return;
    this.lastWidth = w;
    this.lastHeight = h;
    this.dirty = true;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.setTarget();
    if (!this.moving) this.camera.position.copy(this.target);
  }
  private setTarget() {
    const distance =
      cameraDistance(this.camera.aspect, this.top, SUBJECTS[this.variant]) *
      (this.zoom ? 0.97 : 1);
    const angle = this.top ? OVERHEAD : TILT;
    this.target.set(
      0,
      Math.sin(angle) * distance,
      Math.cos(angle) * distance,
    );
  }
  setCamera(top: boolean, zoom = false) {
    this.dirty = true;
    this.top = top;
    this.zoom = zoom;
    this.cameraStart.copy(this.camera.position);
    this.setTarget();
    this.transitionStart = performance.now();
    this.ghost.visible = false;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
    );
    this.resize(true);
  }
  private pointer(e: PointerEvent, confirm: boolean) {
    if (this.disposed || this.moving) return;
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const v = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, v)) {
      this.clearSelection();
      return;
    }
    const p =
      this.variant === "reversi" ? reversiPoint(v.x, v.z) : fromWorld(v.x, v.z);
    if (p) {
      this.selectionPointerType = e.pointerType;
      this.onSelect(p, confirm);
    }
    else this.clearSelection();
  }
  private clearSelection() {
    if (this.disposed) return;
    this.selectionPointerType = "";
    this.preview(null, 1);
    this.onSelect(null, false);
  }
  preview(p: Point | null, player: number) {
    if (this.disposed) return;
    // Clearing an already hidden preview must not queue another GPU frame,
    // especially while the initial board uploads or the AI is searching.
    if (!p) {
      if (this.ghost.visible) {
        this.ghost.visible = false;
        this.dirty = true;
      }
      return;
    }
    this.dirty = true;
    this.ghost.visible = !!p && !this.moving;
    if (p) {
      const v = this.world(p);
      this.ghost.position.set(v.x, 0.25, v.z);
      if (this.variant === "reversi")
        this.ghost.rotation.x = player === 1 ? 0 : Math.PI;
      else
        (this.ghost.material as T.MeshStandardMaterial).color.set(
          player === 1 ? "#202226" : "#fff9ec",
        );
    }
  }
  /** Shows or hides the Gomoku coordinate labels. */
  setLabels(visible: boolean) {
    if (!this.labels || this.disposed) return;
    this.labels.visible = visible;
    this.dirty = true;
  }
  /** Marks one recommended intersection or square, or clears the mark. */
  suggest(p: Point | null) {
    if (!this.suggestion || this.disposed) return;
    if (!p && !this.suggestion.visible) return;
    this.suggestion.visible = !!p;
    if (p) {
      const v = this.world(p);
      this.suggestion.position.set(
        v.x,
        this.variant === "reversi" ? 0.2 : 0.158,
        v.z,
      );
    }
    this.dirty = true;
  }
  renderState(state: State, animate = true) {
    this.dirty = true;
    if (this.suggestion) this.suggestion.visible = false;
    const old = this.lastCount;
    this.lastCount = state.moves.length;
    // Reuse the unchanged prefix. Also handle resets or replacement histories,
    // rather than assuming that every render appends to this exact game.
    let prefix = 0;
    while (prefix < Math.min(this.stoneMoves.length, state.moves.length)) {
      const before = this.stoneMoves[prefix], next = state.moves[prefix];
      if (before.row !== next.row || before.col !== next.col || before.player !== next.player) break;
      prefix++;
    }
    // Stones share their geometry and materials, so removal frees nothing.
    for (const stone of this.stones.children.slice(prefix))
      this.stones.remove(stone);
    // Finish any interrupted animation before rebuilding the animation queue.
    for (const stone of this.stones.children) {
      stone.position.y = 0.245;
      stone.scale.set(0.19, 0.095, 0.19);
    }
    this.clearGroup(this.win);
    this.falling = [];
    state.moves.slice(prefix).forEach((m, offset) => {
      const stone = this.makeStone(m.player), p = toWorld(m);
      stone.position.set(p.x, 0.245, p.z);
      this.stones.add(stone);
      if (animate && state.moves.length === old + 1 && prefix + offset === state.moves.length - 1)
        this.falling.push({ mesh: stone, start: performance.now(), sounded: false });
    });
    this.stoneMoves = state.moves.map((m) => ({ ...m }));
    this.marker.visible = state.moves.length > 0;
    const last = state.moves.at(-1);
    if (last) {
      const p = toWorld(last);
      this.marker.position.set(p.x, 0.346, p.z);
    }
    for (const p of state.line) {
      const v = toWorld(p),
        ring = this.ring(0.205, 0.23, 40, "#f5d38b");
      ring.position.set(v.x, 0.17, v.z);
      this.win.add(ring);
    }
    this.ghost.visible = false;
    if (state.winner) this.setCamera(this.top, true);
  }
  setHints(points: Point[]) {
    this.clearGroup(this.hints);
    this.dirty = true;
    for (const p of points) {
      const v = this.world(p),
        mark = this.ring(0.06, 0.085, 24, "#d5c38d", 0.65);
      mark.position.set(v.x, 0.195, v.z);
      this.hints.add(mark);
    }
  }
  renderReversi(state: ReversiState, animate = true) {
    this.dirty = true;
    this.flips = [];
    this.falling = [];
    this.ghost.visible = false;
    if (this.suggestion) this.suggestion.visible = false;
    // A take-back empties squares: drop discs the state no longer has.
    for (const [i, mesh] of this.discs)
      if (!state.board[i]) {
        this.stones.remove(mesh);
        this.discs.delete(i);
        this.discColors[i] = 0;
      }
    let order = 0;
    for (let i = 0; i < 64; i++) {
      const player = state.board[i];
      if (!player) continue;
      let mesh = this.discs.get(i);
      const p = this.world({ row: Math.floor(i / 8), col: i % 8 });
      if (!mesh) {
        mesh = this.makeStone(player);
        mesh.position.set(p.x, 0.245, p.z);
        this.discs.set(i, mesh);
        this.stones.add(mesh);
        if (animate)
          this.falling.push({ mesh, start: performance.now(), sounded: false });
      } else if (this.discColors[i] !== player) {
        if (animate) {
          const from = mesh.rotation.x;
          this.flips.push({
            mesh,
            start: performance.now() + Math.min(order++ * 25, 150),
            from,
            to: from + Math.PI,
            sounded: false,
          });
        } else mesh.rotation.x = player === 1 ? 0 : Math.PI;
      }
      this.discColors[i] = player;
    }
    const last = state.moves.at(-1);
    this.marker.visible = !!last;
    if (last) {
      const p = this.world(last);
      this.marker.position.set(p.x, 0.307, p.z);
    }
    if (state.winner) this.setCamera(this.top, true);
  }
  /** Empties a group of markers; their shared assets live until dispose. */
  private clearGroup(group: T.Group) {
    group.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    disposeScene(this.scene);
    if (this.shared) {
      // Shared assets may not be attached to any mesh at this moment.
      const { stone, stoneMaterial, white, ring } = this.shared;
      stone.dispose();
      for (const m of [stoneMaterial, white].flat()) m?.dispose();
      ring.forEach((r) => {
        r.geometry.dispose();
        r.material.dispose();
      });
      this.shared = null;
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
