import {
  toWorld as reversiWorld,
  fromWorld as reversiPoint,
} from "../games/reversi/coordinates";
import type { State as ReversiState } from "../games/reversi/rules";
import * as T from "three";
import { SPACING, fromWorld, toWorld } from "../games/gomoku/coordinates";
import type { Point, State } from "../games/gomoku/rules";
import { disposeScene, afterGPUFrame, aim, realism, glossy, fall, hop } from "./scene-utils";
import { discGeometry, gomokuRoom, lensGeometry, reversiBoard, reversiStudy, shellMap, softSpot } from "./board-scenes";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  cameraDistance,
  orbit,
} from "./camera";

const GOMOKU_BOARD = 6.55;
/** Where a stone's or a disc's middle rests: gomoku's stones on the board's face (0.15), discs on the felt (0.18). */
const STONE_Y = 0.24,
  DISC_Y = 0.2325;
/** How long a stone or disc takes to drop, a disc to turn over, and how long after one another captured discs turn. */
const DROP = 280,
  SETTLE = 90,
  FLIP = 360,
  FLIP_AFTER = 190,
  STAGGER = 75;
/** Whether the page is being photographed for the collection's pictures (then no marks of the moment). */
const capturing = () => typeof document !== "undefined" && document.documentElement.dataset.capture === "1";
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
/** The picture of the winning line's light: bright along its middle, fading at its sides and its ends. */
function beamPicture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext("2d")!,
    across = ctx.createLinearGradient(0, 0, 0, 32);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, 256, 32);
  ctx.globalCompositeOperation = "destination-in";
  const along = ctx.createLinearGradient(0, 0, 256, 0);
  along.addColorStop(0, "rgba(0,0,0,0)");
  along.addColorStop(0.1, "rgba(0,0,0,1)");
  along.addColorStop(0.9, "rgba(0,0,0,1)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, 256, 32);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  return map;
}
const X_AXIS = new T.Vector3(1, 0, 0);
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
    /** The horizontal axis the disc turns about (across its line from the disc just placed). */
    axis: T.Vector3;
    /** Its resting turn before and after: 0 black up, π white up. */
    from: number;
    to: number;
    sounded: boolean;
  }[] = [];
  /** Resources of the board and the room, freed in `dispose`. */
  private owned: { dispose(): void }[] = [];
  private own = <R extends { dispose(): void }>(resource: R): R => {
    this.owned.push(resource);
    return resource;
  };
  private winLight: T.Mesh | null = null;
  private markLater = false;
  private readonly turn = new T.Quaternion();
  private readonly base = new T.Quaternion();
  onSettled: () => void = () => {};
  private pressed = { x: 0, y: 0 };
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
    light.shadow.camera.left = -7;
    light.shadow.camera.right = 7;
    light.shadow.camera.top = 7;
    light.shadow.camera.bottom = -7;
    light.shadow.normalBias = 0.025;
    this.scene.add(light);
    const own = this.own;
    if (this.variant === "reversi") {
      // A study: the board in its raised walnut frame on a leather pad, a lamp, books, the box of discs and tea.
      this.renderer.setClearColor("#3b2618");
      reversiBoard(this.scene, own, this.renderer.capabilities.getMaxAnisotropy());
      reversiStudy(this.scene, own, this.assets.stoneMaterial as T.Material[]);
    } else {
      // A quiet ondol room: the board stands on its legs on the paper floor, a bowl of stones at each side.
      this.renderer.setClearColor("#6b4a2c");
      this.scene.fog = new T.Fog("#6b4a2c", 16, 34);
      gomokuRoom(this.scene, own, [this.assets.stoneMaterial as T.Material, this.assets.white!]);
      const map = gomokuLabels();
      map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.labels = new T.Mesh(
        new T.PlaneGeometry(GOMOKU_BOARD, GOMOKU_BOARD),
        new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
      );
      this.labels.rotation.x = -Math.PI / 2;
      this.labels.position.y = 0.153;
      this.scene.add(this.labels);
      const positions: number[] = [];
      for (let i = 0; i < 15; i++) {
        const v = (i - 7) * SPACING;
        positions.push(-2.94, 0.153, v, 2.94, 0.153, v, v, 0.153, -2.94, v, 0.153, 2.94);
      }
      // The border is ruled heavier, as on real boards: lines beside it.
      for (const d of [-0.007, 0.007]) {
        const e = 2.94 + d;
        positions.push(-e, 0.153, -e, e, 0.153, -e, e, 0.153, -e, e, 0.153, e, e, 0.153, e, -e, 0.153, e, -e, 0.153, e, -e, 0.153, -e);
      }
      const dot = own(new T.CircleGeometry(0.052, 20)),
        ink = own(new T.MeshBasicMaterial({ color: "#2e2012" }));
      for (const row of [3, 7, 11])
        for (const col of [3, 7, 11]) {
          if ((row !== 7 && col === 7) || (row === 7 && col !== 7)) continue;
          const p = toWorld({ row, col });
          const mark = new T.Mesh(dot, ink);
          mark.rotation.x = -Math.PI / 2;
          mark.position.set(p.x, 0.156, p.z);
          this.scene.add(mark);
        }
      const lines = new T.BufferGeometry();
      lines.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      this.scene.add(new T.LineSegments(lines, new T.LineBasicMaterial({ color: "#2e2012", transparent: true, opacity: 0.82 })));
    }
    realism(this.renderer, this.scene);
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
      // The last stone's mark: a small red ring, plain on black and on white alike.
      new T.RingGeometry(0.048, 0.072, 28),
      new T.MeshBasicMaterial({ color: "#d9472e", side: T.DoubleSide }),
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
      this.pressed = { x: e.clientX, y: e.clientY };
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
      // A click or a tap places at once. A finger that slid across the board
      // only chose a point, which the button then confirms.
      const tapped =
        e.pointerType === "mouse" ||
        Math.hypot(e.clientX - this.pressed.x, e.clientY - this.pressed.y) < 14;
      if (tapped && performance.now() - this.lastPointer > 320) {
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
        // The disc lifts, turns over on its edge across its line, lands and bounces once.
        const t = Math.max(0, Math.min(1, (time - f.start) / FLIP)),
          q = Math.min(1, t / 0.84),
          eased = q * q * (3 - 2 * q);
        this.base.setFromAxisAngle(X_AXIS, f.from);
        this.turn.setFromAxisAngle(f.axis, Math.PI * eased);
        f.mesh.quaternion.multiplyQuaternions(this.turn, this.base);
        f.mesh.position.y = DISC_Y + hop(t) * 0.3;
        if (t >= 0.84 && !f.sounded) {
          f.sounded = true;
          this.onContact();
        }
        if (t >= 1) f.mesh.rotation.set(f.to, 0, 0);
        return t < 1;
      });
      this.falling = this.falling.filter((f) => {
        const elapsed = time - f.start,
          t = Math.min(1, elapsed / DROP),
          rest = this.variant === "gomoku" ? STONE_Y : DISC_Y;
        f.mesh.position.y = rest + 0.65 * fall(t);
        if (this.variant === "gomoku") {
          // Squashed a touch as it strikes, then a tiny rock on its round back as it settles.
          f.mesh.scale.set(1, 1 + Math.sin(t * Math.PI) * 0.15, 1);
          const s = Math.max(0, Math.min(1, (elapsed - DROP * 0.8) / (DROP * 0.2 + SETTLE)));
          f.mesh.rotation.x = s > 0 && s < 1 ? Math.sin(s * Math.PI * 2) * 0.07 * (1 - s) : 0;
          f.mesh.rotation.z = s > 0 && s < 1 ? Math.sin(s * Math.PI * 2 + 1) * 0.05 * (1 - s) : 0;
        }
        if (t > 0.8 && !f.sounded) {
          f.sounded = true;
          this.onContact();
        }
        return elapsed < DROP + (this.variant === "gomoku" ? SETTLE : 0);
      });
      if (this.markLater && !this.falling.length) {
        this.markLater = false;
        this.marker.visible = true;
      }
      this.win.children.forEach((c) => {
        if (c === this.winLight) {
          const glow = (c as T.Mesh).material as T.MeshBasicMaterial;
          glow.opacity = 0.8 + Math.sin(time * 0.004) * 0.2;
          c.visible = !capturing();
        } else c.scale.setScalar(1 + Math.sin(time * 0.004) * 0.04);
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
    /** A soft spot of light (legal-move dots, the winning line) and its picture. */
    spot: T.Texture;
    dot: { geometry: T.BufferGeometry; material: T.Material } | null;
    beam: { geometry: T.BufferGeometry; material: T.Material } | null;
  } | null = null;
  /**
   * Geometry and materials every stone, disc and marker of this view shares.
   * One GPU buffer and shader program per kind instead of one per mesh.
   */
  private get assets() {
    if (!this.shared) {
      const reversi = this.variant === "reversi",
        keep = <R,>(r: R) => r;
      this.shared = {
        // Discs: two-coloured with a rounded rim; stones: slate and shell, biconvex.
        stone: reversi ? discGeometry(0.285, 0.0525) : lensGeometry(0.19, 0.09),
        stoneMaterial: reversi
          ? [
              glossy({ color: "#1b1c1f", roughness: 0.34 }, 0.5),
              glossy({ color: "#f4f0e6", roughness: 0.32 }, 0.5),
            ]
          : glossy({ color: "#1d1e22", roughness: 0.4, metalness: 0.02 }, 0.35),
        white: reversi
          ? null
          : glossy({ color: "#eeeae1", map: shellMap(keep), roughness: 0.32, metalness: 0.02 }, 0.55),
        ring: new Map(),
        spot: softSpot(keep),
        dot: null,
        beam: null,
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
  /** A soft round dot of light lying on the board, for a square that can be played. */
  private dot() {
    const assets = this.assets;
    assets.dot ??= {
      geometry: new T.PlaneGeometry(0.3, 0.3),
      material: new T.MeshBasicMaterial({ map: assets.spot, color: "#fff4cf", transparent: true, opacity: 0.55, depthWrite: false }),
    };
    const mesh = new T.Mesh(assets.dot.geometry, assets.dot.material);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }
  /** A line of light through the winning five, from the first stone to the last. */
  private beam(from: Point, to: Point) {
    const assets = this.assets;
    if (!assets.beam) {
      const map = beamPicture();
      assets.beam = {
        geometry: new T.PlaneGeometry(1, 1),
        material: new T.MeshBasicMaterial({ map, color: "#ffd36a", transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending }),
      };
    }
    const a = toWorld(from),
      b = toWorld(to),
      length = Math.hypot(b.x - a.x, b.z - a.z) + 0.75,
      mesh = new T.Mesh(assets.beam.geometry, assets.beam.material);
    mesh.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x));
    mesh.scale.set(length, 0.3, 1);
    mesh.position.set((a.x + b.x) / 2, STONE_Y + 0.1, (a.z + b.z) / 2);
    mesh.renderOrder = 2;
    return mesh;
  }
  private makeStone(player: number, at = -1) {
    const { stone, stoneMaterial, white } = this.assets;
    if (this.variant === "reversi") {
      const mesh = new T.Mesh(stone, stoneMaterial!);
      mesh.rotation.x = player === 1 ? 0 : Math.PI;
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    }
    const mesh = new T.Mesh(stone, player === 1 ? stoneMaterial! : white!);
    // Each shell's bands lie its own way.
    if (at >= 0) mesh.rotation.y = ((at * 2654435761) % 1000) / 1000 * Math.PI * 2;
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
      this.ghost.position.set(v.x, this.variant === "reversi" ? DISC_Y : STONE_Y, v.z);
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
      stone.position.y = STONE_Y;
      stone.scale.set(1, 1, 1);
      stone.rotation.x = stone.rotation.z = 0;
    }
    this.clearGroup(this.win);
    this.falling = [];
    state.moves.slice(prefix).forEach((m, offset) => {
      const stone = this.makeStone(m.player, m.row * 15 + m.col), p = toWorld(m);
      stone.position.set(p.x, STONE_Y, p.z);
      this.stones.add(stone);
      if (animate && state.moves.length === old + 1 && prefix + offset === state.moves.length - 1)
        this.falling.push({ mesh: stone, start: performance.now(), sounded: false });
    });
    this.stoneMoves = state.moves.map((m) => ({ ...m }));
    // The last stone's mark comes once the stone has landed.
    this.markLater = state.moves.length > 0 && this.falling.length > 0;
    this.marker.visible = state.moves.length > 0 && !this.markLater;
    const last = state.moves.at(-1);
    if (last) {
      const p = toWorld(last);
      this.marker.position.set(p.x, STONE_Y + 0.093, p.z);
    }
    for (const p of state.line) {
      const v = toWorld(p),
        ring = this.ring(0.205, 0.23, 40, "#f5d38b");
      ring.position.set(v.x, 0.17, v.z);
      this.win.add(ring);
    }
    // A line of light through the five (not in the collection's pictures).
    this.winLight = null;
    if (state.line.length >= 2) {
      this.winLight = this.beam(state.line[0], state.line[state.line.length - 1]);
      this.winLight.visible = !capturing();
      this.win.add(this.winLight);
    }
    this.ghost.visible = false;
    if (state.winner) this.setCamera(this.top, true);
  }
  setHints(points: Point[]) {
    this.clearGroup(this.hints);
    this.dirty = true;
    for (const p of points) {
      const v = this.world(p),
        mark = this.dot();
      mark.position.set(v.x, 0.186, v.z);
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
      } else {
        // Anything still in the air from an interrupted move comes to rest first.
        mesh.rotation.set(this.discColors[i] === 1 ? 0 : Math.PI, 0, 0);
        mesh.position.y = DISC_Y;
      }
    const placed = state.moves.at(-1),
      now = performance.now();
    for (let i = 0; i < 64; i++) {
      const player = state.board[i];
      if (!player) continue;
      let mesh = this.discs.get(i);
      const p = this.world({ row: Math.floor(i / 8), col: i % 8 });
      if (!mesh) {
        mesh = this.makeStone(player);
        mesh.position.set(p.x, DISC_Y, p.z);
        this.discs.set(i, mesh);
        this.stones.add(mesh);
        if (animate)
          this.falling.push({ mesh, start: now, sounded: false });
      } else if (this.discColors[i] !== player) {
        const to = player === 1 ? 0 : Math.PI;
        if (animate) {
          // Captured discs turn once the new disc has landed, one after another outward along each line,
          // each over its own edge across the line.
          const dr = placed ? Math.floor(i / 8) - placed.row : 1,
            dc = placed ? (i % 8) - placed.col : 0,
            reach = Math.max(1, Math.abs(dr), Math.abs(dc));
          this.flips.push({
            mesh,
            start: now + (placed ? FLIP_AFTER : 0) + (reach - 1) * STAGGER,
            axis: new T.Vector3(-dr, 0, dc).normalize(),
            from: to === 0 ? Math.PI : 0,
            to,
            sounded: false,
          });
        } else mesh.rotation.set(to, 0, 0);
      }
      this.discColors[i] = player;
    }
    const last = state.moves.at(-1);
    this.markLater = !!last && this.falling.length > 0;
    this.marker.visible = !!last && !this.markLater;
    if (last) {
      const p = this.world(last);
      this.marker.position.set(p.x, DISC_Y + 0.058, p.z);
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
      const { stone, stoneMaterial, white, ring, spot, dot, beam } = this.shared;
      stone.dispose();
      for (const m of [stoneMaterial, white].flat()) {
        (m as T.MeshStandardMaterial | null)?.map?.dispose();
        m?.dispose();
      }
      for (const r of [...ring.values(), dot, beam]) {
        if (!r) continue;
        r.geometry.dispose();
        (r.material as T.MeshBasicMaterial).map?.dispose();
        r.material.dispose();
      }
      spot.dispose();
      this.shared = null;
    }
    // The board's and the room's own textures (relief maps among them), whatever holds them now.
    for (const resource of this.owned) resource.dispose();
    this.owned = [];
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
