import * as T from "three";
import { afterGPUFrame, aim } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import type { PointView } from "../../ui/point-game";
import type { Marks } from "../points/view";

export type TableSubject = Subject & { tilt: number };
/** A place on the table that a tap can choose: it stands for the point `point`. */
export interface Spot {
  x: number;
  y: number;
  z: number;
  /** How far from its centre a tap still counts. */
  r: number;
  point: number;
}
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
}
/**
 * What the views of the later table games share: the renderer and its loop,
 * the camera, timed animations, picking a spot under the pointer, and
 * disposal. A game builds its scene, says where its spots are and how a
 * state is laid out and animated.
 */
export abstract class TableView<S> implements PointView<S> {
  readonly renderer: T.WebGLRenderer;
  protected scene = new T.Scene();
  protected camera = new T.PerspectiveCamera(FOV, 1, 0.1, 120);
  protected state: S | null = null;
  protected marks: Marks = { movable: [], selected: null, targets: [], removable: [], cursor: null };
  protected dirty = true;
  protected disposed = false;
  protected reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private observer: ResizeObserver;
  private raf = 0;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  private tweens: Tween[] = [];
  private ray = new T.Raycaster();
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  protected own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  protected standard(options: T.MeshStandardMaterialParameters) {
    return this.own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  }
  /** Adds a mesh that owns its geometry. */
  protected add(geometry: T.BufferGeometry, material: T.Material | T.Material[], x = 0, y = 0, z = 0, parent: T.Object3D = this.scene) {
    const mesh = new T.Mesh(this.own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    clear: string,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor(clear);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    const el = this.renderer.domElement;
    let down: number | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.pointerType === "mouse" && e.button !== 0 ? null : e.pointerId));
    el.addEventListener("pointercancel", () => (down = null));
    el.addEventListener("pointerup", (e) => {
      const mine = down === e.pointerId;
      down = null;
      if (!mine || this.disposed || this.animating) return;
      aim(this.ray, e, el, this.camera);
      this.onPick(this.under(this.ray.ray));
    });
    // A mouse that hovers shows where a tap would land.
    let hovered = -1;
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed) return;
      aim(this.ray, e, el, this.camera);
      const point = this.under(this.ray.ray);
      if (point === hovered) return;
      hovered = point;
      this.hover(point);
      this.dirty = true;
    });
    el.addEventListener("pointerleave", () => {
      hovered = -1;
      this.hover(-1);
      this.dirty = true;
    });
    el.style.cursor = "pointer";
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
  }
  /** Starts drawing; called by the game's view once its scene is built. */
  protected begin() {
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const moved = this.step(performance.now());
      if (!this.dirty && !moved) return;
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
  /** The usual lighting: sky and bounce, and a sun that casts shadows over `reach`. */
  protected daylight(sky: string, ground: string, sun: string, reach = 9, strength = 2.3) {
    this.scene.add(new T.HemisphereLight(sky, ground, 2));
    const light = new T.DirectionalLight(sun, strength);
    light.position.set(-4, 11, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = light.shadow.camera.bottom = -reach;
    light.shadow.camera.right = light.shadow.camera.top = reach;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    return light;
  }
  /** What the camera must keep in view, for the canvas's present shape. */
  protected abstract subject(aspect: number): TableSubject;
  /** The places a tap can choose in the state shown. */
  protected abstract spots(): Spot[];
  /** Puts everything where `state` has it, at rest. */
  protected abstract place(state: S): void;
  /** Queues the animation from `before` to `state`; false when there is nothing to animate. */
  protected abstract animate(before: S, state: S): boolean;
  /** Draws the marks of the screen: what can be chosen, and the keyboard's place. */
  protected abstract mark(marks: Marks): void;
  /** The point under a hovering mouse, or -1. */
  protected hover(_point: number) {}
  /** Called when the canvas changes shape, before the camera is set. */
  protected layout(_aspect: number) {}
  /** The point of the spot nearest the ray, or -1. */
  private under(ray: T.Ray) {
    let best = -1,
      nearest = Infinity;
    const at = new T.Vector3();
    for (const spot of this.spots()) {
      const distance = ray.distanceToPoint(at.set(spot.x, spot.y, spot.z));
      if (distance <= spot.r && distance < nearest) {
        nearest = distance;
        best = spot.point;
      }
    }
    return best;
  }
  protected tween(delay: number, duration: number, update: (p: number) => void) {
    this.tweens.push({ start: performance.now() + delay, duration, update });
  }
  protected resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.layout(this.camera.aspect);
    const subject = this.subject(this.camera.aspect),
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, subject.lookY, 0);
    if (this.state) this.place(this.state);
    this.mark(this.marks);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  sync(state: S, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    if (animate && !this.reducedMotion && before && before !== state) {
      this.place(before);
      if (this.animate(before, state)) return;
    }
    this.place(state);
    this.onSettled();
  }
  setMarks(marks: Marks) {
    this.marks = marks;
    this.mark(marks);
    this.dirty = true;
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.update(p);
      return p < 1;
    });
    if (!this.tweens.length && this.state) {
      this.place(this.state);
      this.onSettled();
    }
    return true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
/** A flat ring lying on the table, for marking a place. */
export function ringMesh(own: <R extends { dispose(): void }>(r: R) => R, inner: number, outer: number, color: string) {
  const mesh = new T.Mesh(
    own(new T.RingGeometry(inner, outer, 40)),
    own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide })),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.renderOrder = 5;
  return mesh;
}
