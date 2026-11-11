import * as T from "three";
import { afterGPUFrame, aim, wood } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import { hanokYard, speckled } from "../../engine/scenery";
import type { Effect } from "./types";

type Paint = (
  ctx: CanvasRenderingContext2D,
  /** Board coordinates to canvas pixels. */
  px: (x: number, z: number) => [number, number],
  /** Canvas pixels per board unit. */
  unit: number,
) => void;
/** How a board looks. The view draws points; it knows no rules. */
export interface BoardSpec {
  points: { x: number; z: number }[];
  /** Half the side of the square the board is painted on. */
  half: number;
  /** Where the board's centre lies along z in the scene. */
  centreZ: number;
  paint: Paint;
  /** yard: scratched into the earth of a Korean yard; wood: a board on a table; lab: tiles on a dark bench. */
  theme: "yard" | "wood" | "lab";
  /** Radius of a piece. */
  radius: number;
  colors: [string, string];
  subject: Subject & { tilt: number };
}
export interface BoardModel {
  owners: (0 | 1 | null)[];
  /** Changes with every move; `effect` is what that move did. */
  moveId: number;
  effect: Effect | null;
}
export interface Marks {
  movable: number[];
  selected: number | null;
  targets: number[];
  removable: number[];
  cursor: number | null;
}
/** Strokes the straight lines of a board. */
export function strokeLines(
  ctx: CanvasRenderingContext2D,
  px: (x: number, z: number) => [number, number],
  points: { x: number; z: number }[],
  lines: [number, number][],
) {
  ctx.beginPath();
  for (const [a, b] of lines) {
    ctx.moveTo(...px(points[a].x, points[a].z));
    ctx.lineTo(...px(points[b].x, points[b].z));
  }
  ctx.stroke();
}
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
  done?: () => void;
}
const INK = { yard: "rgba(74, 50, 26, 0.85)", wood: "#2c2118", lab: "#8fd6c4" };

/** A board of points with two sides' pieces, in one of three settings. */
export class PointBoardView {
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
  private pieces = new T.Group();
  private meshes = new Map<number, T.Mesh>();
  private geometry: T.BufferGeometry;
  private materials: T.MeshStandardMaterial[];
  private height: number;
  private rings = new T.Group();
  private ringGeometry: T.RingGeometry;
  private ringMaterials: T.MeshBasicMaterial[];
  private tweens: Tween[] = [];
  private model: BoardModel | null = null;
  private marks: Marks = { movable: [], selected: null, targets: [], removable: [], cursor: null };
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A piece touched the board. */
  onContact: () => void = () => {};
  /** Every animation has finished. */
  onSettled: () => void = () => {};
  /** A point was tapped, or -1 for a tap on nothing. */
  onPick: (point: number) => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  private at(point: number, y = this.height / 2) {
    const p = this.spec.points[point];
    return new T.Vector3(p.x, y, p.z + this.spec.centreZ);
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    private spec: BoardSpec,
  ) {
    const { theme, radius, half, centreZ } = spec;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor(theme === "yard" ? "#b89a6c" : theme === "wood" ? "#543a28" : "#1c2227");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight("#fff3da", theme === "lab" ? "#20303a" : "#6b5335", theme === "lab" ? 2.0 : 1.7));
    const light = new T.DirectionalLight("#ffe9c4", theme === "yard" ? 2.1 : 2.6);
    light.position.set(-5, 10, theme === "yard" ? -3 : 4);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -9;
    light.shadow.camera.right = 9;
    light.shadow.camera.top = 9;
    light.shadow.camera.bottom = -9;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const own = <R extends { dispose(): void }>(resource: R) => this.own(resource),
      standard = (options: T.MeshStandardMaterialParameters) =>
        this.own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
    // The setting, and what the board is painted on.
    const side = half * 2,
      flat = (width: number, depth: number, material: T.Material, y: number) => {
        const mesh = new T.Mesh(this.own(new T.PlaneGeometry(width, depth)), material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, y, centreZ);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      };
    if (theme === "yard") hanokYard(this.scene, own);
    else if (theme === "wood") {
      flat(90, 90, standard({ map: this.own(wood(true)) }), -0.3);
      const slab = new T.Mesh(this.own(new T.BoxGeometry(side, 0.3, side)), standard({ map: this.own(wood()), roughness: 0.55 }));
      slab.position.set(0, -0.152, centreZ);
      slab.castShadow = slab.receiveShadow = true;
      this.scene.add(slab);
    } else {
      flat(90, 90, standard({ map: this.own(speckled("#262d33", ["rgba(0,0,0,0.3)", "rgba(150,170,180,0.12)"], 5, 16)), roughness: 0.6 }), -0.02);
    }
    const size = 1024,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!,
      unit = size / side;
    ctx.strokeStyle = ctx.fillStyle = INK[theme];
    ctx.lineWidth = unit * (theme === "yard" ? 0.09 : 0.05);
    ctx.lineCap = ctx.lineJoin = "round";
    spec.paint(ctx, (x, z) => [size / 2 + x * unit, size / 2 + z * unit], unit);
    const drawing = new T.CanvasTexture(canvas);
    drawing.colorSpace = T.SRGBColorSpace;
    drawing.anisotropy = 4;
    flat(side, side, this.own(new T.MeshBasicMaterial({ map: this.own(drawing), transparent: true, depthWrite: false })), 0.004);
    // Pieces: pebbles in the yard, discs on wood, glossy germs on the bench.
    this.height = theme === "wood" ? 0.16 : radius * (theme === "lab" ? 1.1 : 0.8);
    this.geometry = this.own(
      theme === "wood"
        ? new T.CylinderGeometry(radius, radius * 1.04, this.height, 32)
        : new T.SphereGeometry(radius, 28, 16).scale(1, this.height / (radius * 2), 1),
    );
    this.materials = spec.colors.map((color) =>
      standard({
        color,
        roughness: theme === "lab" ? 0.2 : theme === "yard" ? 0.75 : 0.4,
        emissive: theme === "lab" ? color : "#000000",
        emissiveIntensity: theme === "lab" ? 0.22 : 0,
      }),
    );
    this.ringGeometry = this.own(new T.RingGeometry(radius * 1.12, radius * 1.42, 40));
    this.ringMaterials = ["#f4d06a", "#ffffff", "#7fe0a2", "#f0604a", "#9fc6ff"].map((color) =>
      this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })),
    );
    this.scene.add(this.pieces, this.rings);
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
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.animating) return;
      const p = this.pointUnder(e),
        m = this.marks;
      el.style.cursor = m.movable.includes(p) || m.targets.includes(p) || m.removable.includes(p) ? "pointer" : "";
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
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
  private pointUnder(e: PointerEvent) {
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const hit = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return -1;
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
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const subject = this.spec.subject,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  private spawn(point: number, owner: 0 | 1) {
    const mesh = new T.Mesh(this.geometry, this.materials[owner]);
    mesh.castShadow = true;
    mesh.position.copy(this.at(point));
    this.pieces.add(mesh);
    return mesh;
  }
  /** Puts every piece exactly where `owners` says, without animation. */
  private rebuild(owners: (0 | 1 | null)[]) {
    this.pieces.clear();
    this.meshes.clear();
    owners.forEach((owner, point) => {
      if (owner !== null) this.meshes.set(point, this.spawn(point, owner));
    });
  }
  /**
   * Shows `model`. A new move is acted out: a piece steps, jumps in a high
   * arc or splits off a copy; pieces it turned flip over and pieces it took
   * shrink away.
   */
  sync(model: BoardModel, animate = true) {
    if (this.disposed) return;
    const before = this.model,
      effect = model.effect;
    this.model = model;
    this.dirty = true;
    this.tweens = [];
    if (!animate || this.reducedMotion || !before || !effect || model.moveId === before.moveId) {
      this.rebuild(model.owners);
      this.drawMarks();
      this.onSettled();
      return;
    }
    this.rebuild(before.owners);
    this.rings.clear();
    const now = performance.now(),
      side = model.owners[effect.to] ?? 0,
      to = this.at(effect.to),
      hop = (mesh: T.Mesh, from: T.Vector3, height: number, grow: boolean) => (p: number) => {
        const e = p * p * (3 - 2 * p);
        mesh.position.lerpVectors(from, to, e);
        mesh.position.y += Math.sin(Math.PI * p) * height;
        if (grow) mesh.scale.setScalar(0.2 + 0.8 * e);
      };
    let arrive = 320;
    if (effect.kind === "place") {
      const mesh = this.spawn(effect.to, side),
        from = to.clone().setY(to.y + 2.4);
      this.tweens.push({ start: now, duration: arrive, update: (p) => mesh.position.lerpVectors(from, to, p * p) });
    } else if (effect.kind === "clone") {
      arrive = 520;
      const source = this.meshes.get(effect.from),
        copy = this.spawn(effect.from, side);
      copy.scale.setScalar(0.2);
      this.tweens.push({ start: now, duration: arrive, update: hop(copy, this.at(effect.from), 0.55, true) });
      // The germ swells as it divides, then settles.
      if (source)
        this.tweens.push({
          start: now,
          duration: arrive,
          update: (p) => source.scale.set(1 + Math.sin(Math.PI * p) * 0.28, 1 - Math.sin(Math.PI * p) * 0.2, 1 + Math.sin(Math.PI * p) * 0.28),
        });
    } else {
      const mesh = this.meshes.get(effect.from) ?? this.spawn(effect.from, side),
        jump = effect.kind === "jump";
      arrive = jump ? 620 : 300;
      this.tweens.push({
        start: now,
        duration: arrive,
        update: (p) => {
          hop(mesh, this.at(effect.from), jump ? 1.5 : 0.25, false)(p);
          // A jump is wound up with a squat and stretches in the air.
          if (jump) mesh.scale.set(1 - Math.sin(Math.PI * p) * 0.12, 1 + Math.sin(Math.PI * p) * 0.35, 1 - Math.sin(Math.PI * p) * 0.12);
        },
      });
    }
    this.tweens[0].done = () => this.onContact();
    for (const point of effect.converted) {
      const mesh = this.meshes.get(point);
      if (!mesh) continue;
      let swapped = false;
      this.tweens.push({
        start: now + arrive + 40,
        duration: 340,
        update: (p) => {
          mesh.rotation.x = Math.PI * p;
          mesh.position.y = this.height / 2 + Math.sin(Math.PI * p) * 0.35;
          if (p >= 0.5 && !swapped) {
            swapped = true;
            mesh.material = this.materials[side];
          }
        },
      });
    }
    for (const point of effect.removed) {
      const mesh = this.meshes.get(point);
      if (mesh)
        this.tweens.push({
          start: now + arrive + 40,
          duration: 300,
          update: (p) => {
            mesh.scale.setScalar(1 - p);
            mesh.position.y = this.height / 2 + p * 0.5;
          },
        });
    }
  }
  setMarks(marks: Marks) {
    this.marks = marks;
    this.drawMarks();
  }
  private drawMarks() {
    if (this.disposed) return;
    this.dirty = true;
    this.rings.clear();
    if (!this.model || this.animating) return;
    const ring = (point: number, kind: number, scale = 1, y = 0.012) => {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[kind]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(this.at(point, y));
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 2;
      this.rings.add(mesh);
    };
    const m = this.marks;
    for (const p of m.movable) ring(p, p === m.selected ? 1 : 2);
    for (const p of m.targets) ring(p, 0, 0.8, 0.014);
    for (const p of m.removable) ring(p, 3, 1.05, 0.016);
    if (m.cursor !== null) ring(m.cursor, 4, 1.3, 0.018);
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.update(p);
      if (p < 1) return true;
      t.done?.();
      return false;
    });
    if (!this.tweens.length && this.model) {
      // Whatever was acted out, the board now shows the model itself.
      this.rebuild(this.model.owners);
      this.drawMarks();
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
