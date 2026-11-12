import * as T from "three";
import { afterGPUFrame, aim, wood } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import type { PointView } from "../../ui/point-game";
import type { Marks } from "../points/view";

/** Pencil colours of the two players, and of the lines printed in the notebook. */
export const PENCILS = ["#d2452f", "#2f62c0"],
  GRAPHITE = "#4a4f57";
type Px = (x: number, z: number) => [number, number];
/** A game drawn in a notebook with coloured pencils. */
export interface PaperGame<S> {
  /** Half the side of the page, in board units. */
  half: number;
  /** Places that can be tapped, by move index. */
  points: (state: S) => { x: number; z: number }[];
  /** How far from a point a tap still counts. */
  reach: (state: S) => number;
  /**
   * Draws the game on the page. `fresh` is 0–1 while the newest mark is
   * being drawn, so it can be shown growing.
   */
  paint: (ctx: CanvasRenderingContext2D, px: Px, unit: number, state: S, fresh: number) => void;
  /** Changes whenever a mark is added. */
  ply: (state: S) => number;
  /**
   * True when the drawing leaves the page's lower left corner free: the
   * pencils lie there and the page fills the view.
   */
  corner?: boolean;
}
/** What the camera frames: the page with the pencils beside it, or the page alone. */
export const paperSubject = (corner = false): Subject & { tilt: number } =>
  corner
    ? // A board wider than it is deep: the view closes in on it and the page runs past the frame.
      { half: 4.35, halfZ: 3.5, height: 0.4, lookY: 0, tilt: 1.08 }
    : { half: 4.6, halfZ: 4.5, height: 0.4, lookY: 0, tilt: 1.08 };
/** Board units from the origin to the page's centre: with the pencils beside it the page sits to the left. */
const pageX = (corner = false) => (corner ? 0 : -0.5);
/** Where a point of the game lies in the scene. */
export const paperPlace = (point: { x: number; z: number }, corner = false) => ({ x: point.x + pageX(corner), z: point.z });
/** A wobbly pencil line: a few thin strokes side by side. */
export function pencilLine(ctx: CanvasRenderingContext2D, from: [number, number], to: [number, number], color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  for (const [offset, alpha] of [[0, 0.85], [0.35, 0.45], [-0.35, 0.45]]) {
    const dx = to[0] - from[0],
      dy = to[1] - from[1],
      length = Math.hypot(dx, dy) || 1,
      nx = (-dy / length) * offset * width,
      ny = (dx / length) * offset * width;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * 0.6;
    ctx.beginPath();
    ctx.moveTo(from[0] + nx, from[1] + ny);
    ctx.lineTo(to[0] + nx, to[1] + ny);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/** Fills the current path with pencil hatching. */
export function hatch(ctx: CanvasRenderingContext2D, box: [number, number, number, number], color: string, gap: number, share = 1) {
  const [x, y, w, h] = box;
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = gap * 0.56;
  ctx.lineCap = "round";
  const lines = Math.ceil((w + h) / gap);
  for (let i = 0; i < lines * share; i++) {
    const d = i * gap;
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d - h, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

/** A spiral notebook on a desk with coloured pencils; the game is drawn on its page. */
export class PaperView<S> implements PointView<S> {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 90);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  private page: HTMLCanvasElement;
  private texture: T.CanvasTexture;
  private state: S | null = null;
  private drawing = 0;
  private cursor: T.Mesh;
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), -0.05);
  private pageX: number;
  private subject: Subject & { tilt: number };
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
  get animating() {
    return this.drawing > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    private game: PaperGame<S>,
  ) {
    const PAGE_X = (this.pageX = pageX(game.corner));
    this.subject = paperSubject(game.corner);
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#6b4a32");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight("#fff8ea", "#5a4636", 2.2));
    const light = new T.DirectionalLight("#fff3dc", 2.2);
    light.position.set(-4, 9, 3);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -9;
    light.shadow.camera.right = 9;
    light.shadow.camera.top = 9;
    light.shadow.camera.bottom = -9;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const standard = (options: T.MeshStandardMaterialParameters) =>
      this.own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
      const mesh = new T.Mesh(this.own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    // The desk, the notebook and its spiral.
    add(new T.PlaneGeometry(90, 90), standard({ map: this.own(wood(true)) }), 0, -0.02, 0).rotation.x = -Math.PI / 2;
    const side = game.half * 2;
    add(new T.BoxGeometry(side + 0.7, 0.08, side + 0.5), standard({ color: "#2f5d8a", roughness: 0.6 }), PAGE_X - 0.1, 0.02, 0);
    this.page = document.createElement("canvas");
    this.page.width = this.page.height = 1024;
    this.texture = this.own(new T.CanvasTexture(this.page));
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const sheet = add(new T.PlaneGeometry(side, side), standard({ map: this.texture, roughness: 0.95 }), PAGE_X, 0.066, 0);
    sheet.rotation.x = -Math.PI / 2;
    sheet.castShadow = false;
    const wire = standard({ color: "#c9ced4", roughness: 0.3, metalness: 0.7 }),
      coil = this.own(new T.TorusGeometry(0.13, 0.025, 8, 20));
    for (let i = 0; i < 18; i++) {
      const ring = new T.Mesh(coil, wire);
      ring.position.set(PAGE_X - game.half - 0.02, 0.1, -game.half + 0.3 + (i * (side - 0.6)) / 17);
      ring.rotation.y = Math.PI / 2;
      ring.castShadow = true;
      this.scene.add(ring);
    }
    // Coloured pencils, an eraser and a sharpener beside the notebook.
    const body = this.own(new T.CylinderGeometry(0.085, 0.085, 3.4, 6)),
      tip = this.own(new T.ConeGeometry(0.085, 0.3, 6)),
      lead = this.own(new T.ConeGeometry(0.035, 0.12, 6)),
      bare = standard({ color: "#e8c99a" });
    [PENCILS[0], PENCILS[1], "#3f9a5a", "#e6b12e", "#7a4fb0"].forEach((color, i) => {
      const pencil = new T.Group(),
        stick = new T.Group(),
        paint = standard({ color, roughness: 0.45 }),
        shaft = new T.Mesh(body, paint),
        cone = new T.Mesh(tip, bare),
        point = new T.Mesh(lead, paint);
      cone.position.y = 1.85;
      point.position.y = 1.95;
      shaft.castShadow = cone.castShadow = true;
      stick.add(shaft, cone, point);
      // Laid flat with the point away from the player, each at its own slight angle.
      stick.rotation.x = -Math.PI / 2;
      pencil.add(stick);
      if (game.corner) {
        // Along the free strip at the foot of the page, points to the left.
        pencil.rotation.y = Math.PI / 2 + 0.05 - i * 0.025;
        pencil.position.set(-1.2 + i * 0.22, 0.16, 2.95 + i * 0.2);
      } else {
        pencil.rotation.y = 0.16 - i * 0.08;
        pencil.position.set(game.half + PAGE_X + 0.8 + i * 0.3, 0.09, 1.2 + (i % 2) * 0.35);
      }
      this.scene.add(pencil);
    });
    const [ex, ez] = game.corner ? [game.half - 0.9, -2.85] : [game.half + PAGE_X + 1.2, -2.6];
    add(new T.BoxGeometry(0.9, 0.3, 0.5), standard({ color: "#f3efe6", roughness: 0.9 }), ex, 0.22, ez).rotation.y = 0.4;
    if (!game.corner) add(new T.BoxGeometry(0.5, 0.36, 0.34), standard({ color: "#c23b2b", roughness: 0.4 }), game.half + PAGE_X + 1.6, 0.18, -3.5).rotation.y = -0.3;
    // The keyboard's place on the page.
    this.cursor = new T.Mesh(
      this.own(new T.RingGeometry(0.16, 0.22, 32)),
      this.own(new T.MeshBasicMaterial({ color: "#f0a020", transparent: true, opacity: 0.95, depthWrite: false })),
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    const el = this.renderer.domElement;
    let down: { pointer: number; x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      down = e.pointerType === "mouse" && e.button !== 0 ? null : { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (this.disposed || this.animating || tap?.pointer !== e.pointerId) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
      this.onPick(this.pointUnder(e));
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.drawing) {
        const p = Math.min(1, (performance.now() - this.drawing) / 260);
        this.repaint(p);
        if (p === 1) {
          this.drawing = 0;
          this.onContact();
          this.onSettled();
        }
      }
      if (!this.dirty) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          this.renderer.domElement.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  private pointUnder(e: PointerEvent) {
    if (!this.state) return -1;
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const hit = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return -1;
    let best = -1,
      nearest = this.game.reach(this.state);
    this.game.points(this.state).forEach((p, i) => {
      const d = Math.hypot(p.x + this.pageX - hit.x, p.z - hit.z);
      if (d < nearest) {
        nearest = d;
        best = i;
      }
    });
    return best;
  }
  private repaint(fresh: number) {
    if (!this.state) return;
    const ctx = this.page.getContext("2d")!,
      size = this.page.width,
      unit = size / (this.game.half * 2);
    // Squared paper with a red margin.
    ctx.fillStyle = "#fbfaf4";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(96, 150, 200, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 1; i < 24; i++) {
      const at = (i * size) / 24;
      ctx.moveTo(0, at);
      ctx.lineTo(size, at);
      ctx.moveTo(at, 0);
      ctx.lineTo(at, size);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(210, 80, 70, 0.45)";
    ctx.beginPath();
    ctx.moveTo(size * 0.045, 0);
    ctx.lineTo(size * 0.045, size);
    ctx.stroke();
    this.game.paint(ctx, (x, z) => [size / 2 + x * unit, size / 2 + z * unit], unit, this.state, fresh);
    this.texture.needsUpdate = true;
    this.dirty = true;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, this.subject);
    this.camera.position.set(0, Math.sin(this.subject.tilt) * distance, Math.cos(this.subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Shows `state`; a new mark is drawn in over a moment. */
  sync(state: S, animate = true) {
    if (this.disposed) return;
    const fresh = !!this.state && this.game.ply(state) === this.game.ply(this.state) + 1;
    this.state = state;
    if (animate && fresh && !this.reducedMotion) {
      this.drawing = performance.now();
      this.repaint(0);
      return;
    }
    this.drawing = 0;
    this.repaint(1);
    this.onSettled();
  }
  setMarks(marks: Marks) {
    const point = marks.cursor !== null && this.state ? this.game.points(this.state)[marks.cursor] : null;
    this.cursor.visible = !!point;
    if (point) this.cursor.position.set(point.x + this.pageX, 0.075, point.z);
    this.dirty = true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
