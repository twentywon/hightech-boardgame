import * as T from "three";
import { afterGPUFrame, aim, wood } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import { speckled } from "../../engine/scenery";
import type { PointView } from "../../ui/point-game";
import type { Marks } from "../points/view";
import { STORE, type State } from "./rules";

export const MANCALA_SUBJECT: Subject & { tilt: number } = { half: 5.9, halfZ: 4.6, height: 0.8, lookY: 0, tilt: 1.0 };
const GAP = 1.3,
  ROW = 0.85,
  STORE_X = 4.75;
/** Centre of a pit or store on the board. */
export function pitAt(pit: number) {
  if (pit === STORE[0]) return { x: STORE_X, z: 0 };
  if (pit === STORE[1]) return { x: -STORE_X, z: 0 };
  // The near row runs left to right; the far row comes back right to left.
  return pit < 6 ? { x: (pit - 2.5) * GAP, z: ROW } : { x: (9.5 - pit) * GAP, z: -ROW };
}
const STONES = ["#2e6f8e", "#c4532f", "#d9a441", "#3f7d4f", "#7b4a9e", "#e3ddd0"];
interface Tween {
  mesh: T.Object3D;
  start: number;
  duration: number;
  from: T.Vector3;
  to: T.Vector3;
}
/** A mancala board on a rug in a desert market, with glass stones in its pits. */
export class MancalaView implements PointView<State> {
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
  private stones = new T.Group();
  private stoneGeometry: T.SphereGeometry;
  private stoneMaterials: T.Material[];
  private counts: HTMLCanvasElement;
  private countTexture: T.CanvasTexture;
  private rings = new T.Group();
  private ringGeometry: T.RingGeometry;
  private ringMaterials: T.MeshBasicMaterial[];
  private tweens: Tween[] = [];
  private state: State | null = null;
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), -0.3);
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#d9b97c");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // A high, hard desert sun softened by the awning.
    this.scene.add(new T.HemisphereLight("#fff0d0", "#b98a4e", 2.0));
    const sun = new T.DirectionalLight("#fff0cf", 2.6);
    sun.position.set(5, 11, -2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.buildMarket();
    this.stoneGeometry = this.own(new T.SphereGeometry(0.15, 14, 10));
    this.stoneMaterials = STONES.map((color) => this.own(new T.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1 })));
    // The number of stones in each pit, painted beside it.
    this.counts = document.createElement("canvas");
    this.counts.width = 1024;
    this.counts.height = 512;
    this.countTexture = this.own(new T.CanvasTexture(this.counts));
    this.countTexture.colorSpace = T.SRGBColorSpace;
    const labels = new T.Mesh(
      this.own(new T.PlaneGeometry(11.6, 5.8)),
      this.own(new T.MeshBasicMaterial({ map: this.countTexture, transparent: true, depthWrite: false })),
    );
    labels.rotation.x = -Math.PI / 2;
    labels.position.y = 0.34;
    labels.renderOrder = 3;
    this.ringGeometry = this.own(new T.RingGeometry(0.56, 0.64, 40));
    this.ringMaterials = ["#fff3c4", "#4a7fd0"].map((color) =>
      this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })),
    );
    this.scene.add(this.stones, labels, this.rings);
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
      aim(this.ray, e, el, this.camera);
      const hit = new T.Vector3();
      if (!this.ray.ray.intersectPlane(this.ground, hit)) return;
      let best = -1,
        nearest = 0.66;
      for (let pit = 0; pit < 14; pit++) {
        const p = pitAt(pit),
          d = Math.hypot(p.x - hit.x, p.z - hit.z);
        if (d < nearest && !STORE.includes(pit)) {
          nearest = d;
          best = pit;
        }
      }
      this.onPick(best);
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
  /** Sand, a striped rug, the board, and the stalls of a market round it. */
  private buildMarket() {
    const standard = (options: T.MeshStandardMaterialParameters) =>
      this.own(new T.MeshStandardMaterial({ roughness: 0.85, ...options }));
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
      const mesh = new T.Mesh(this.own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    const sand = standard({
      map: this.own(speckled("#dcbd82", ["rgba(140,100,50,0.2)", "rgba(255,245,215,0.25)", "rgba(180,140,84,0.25)"], 9, 16, 4200)),
      roughness: 1,
    });
    add(new T.PlaneGeometry(90, 90), sand, 0, -0.03, 0, false).rotation.x = -Math.PI / 2;
    // The rug: bands of dyed wool with a border.
    const cloth = document.createElement("canvas");
    cloth.width = 512;
    cloth.height = 512;
    const ctx = cloth.getContext("2d")!,
      bands = ["#8e2f2a", "#d9a441", "#1f4f6b", "#e9dcc0", "#8e2f2a", "#3f6b4a", "#d9a441", "#8e2f2a"];
    bands.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, (i * 512) / bands.length, 512, 512 / bands.length + 1);
    });
    ctx.fillStyle = "rgba(20, 12, 8, 0.5)";
    for (let x = 16; x < 512; x += 48)
      for (let y = 32; y < 512; y += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y - 10);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 10);
        ctx.lineTo(x - 10, y);
        ctx.fill();
      }
    ctx.strokeStyle = "#2a1a12";
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, 494, 494);
    const rug = this.own(new T.CanvasTexture(cloth));
    rug.colorSpace = T.SRGBColorSpace;
    add(new T.BoxGeometry(13.6, 0.04, 8.4), standard({ map: rug, roughness: 1 }), 0, -0.005, 0.3, false);
    // The board: a plank with twelve pits and a store at each end.
    const timber = standard({ map: this.own(wood()), color: "#c99a66", roughness: 0.55 }),
      hollow = standard({ color: "#6e4a2c", roughness: 0.7 });
    add(new T.BoxGeometry(11.4, 0.3, 3.5), timber, 0, 0.15, 0);
    for (let pit = 0; pit < 14; pit++) {
      const p = pitAt(pit),
        store = STORE.includes(pit),
        dish = add(new T.CylinderGeometry(0.52, 0.42, 0.06, 28), hollow, p.x, 0.3, p.z, false);
      if (store) dish.scale.set(1.05, 1, 2.55);
    }
    // The stalls: baskets of spices, clay jars, a brass tray and the awning's poles.
    const basket = standard({ color: "#a9793f", roughness: 0.9 }),
      spices = ["#b83a1e", "#e2a52b", "#6b7a2a", "#7a3b1d"].map((color) => standard({ color, roughness: 1 })),
      weave = this.own(new T.CylinderGeometry(0.85, 0.65, 0.7, 20)),
      heap = this.own(new T.ConeGeometry(0.8, 0.7, 20));
    [[-5.6, -5.4], [-3.7, -6.0], [-1.8, -5.5], [0.2, -6.1]].forEach(([x, z], i) => {
      add(weave, basket, x, 0.35, z);
      add(heap, spices[i], x, 0.95, z);
    });
    const clay = standard({ color: "#b8693c", roughness: 0.7 }),
      profile = [[0.2, 0], [0.42, 0.2], [0.5, 0.7], [0.36, 1.2], [0.2, 1.4], [0.26, 1.55]].map(([r, y]) => new T.Vector2(r, y)),
      jar = this.own(new T.LatheGeometry(profile, 22));
    for (const [x, z, s] of [[3.2, -5.6, 1.3], [4.5, -6.2, 1.0], [5.6, -5.3, 0.8], [7.2, -3.2, 1.1], [7.6, -1.6, 0.75]]) {
      const mesh = add(jar, clay, x, 0, z);
      mesh.scale.setScalar(s);
    }
    const brass = standard({ color: "#c9a14a", roughness: 0.3, metalness: 0.7 });
    add(new T.CylinderGeometry(1.0, 1.0, 0.05, 32), brass, -7.3, 0.03, -2.4);
    const date = this.own(new T.SphereGeometry(0.14, 10, 8)),
      fruit = standard({ color: "#5a2f1a", roughness: 0.5 });
    for (let i = 0; i < 9; i++) add(date, fruit, -7.3 + Math.cos(i * 2.3) * 0.5, 0.15, -2.4 + Math.sin(i * 2.3) * 0.5).scale.set(1, 0.7, 1.5);
    const pole = standard({ map: this.own(wood(true)), roughness: 0.8 });
    for (const x of [-8.6, 8.6]) add(new T.CylinderGeometry(0.14, 0.14, 9, 10), pole, x, 4.5, -7.0);
    // A strip of the striped awning hangs at the back of the stall.
    const stripes = document.createElement("canvas");
    stripes.width = 256;
    stripes.height = 32;
    const sc = stripes.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      sc.fillStyle = i % 2 ? "#f0e4c6" : "#b0402c";
      sc.fillRect(i * 32, 0, 32, 32);
    }
    const awning = this.own(new T.CanvasTexture(stripes));
    awning.colorSpace = T.SRGBColorSpace;
    awning.wrapS = T.RepeatWrapping;
    awning.repeat.set(3, 1);
    add(new T.BoxGeometry(18, 2.6, 0.08), standard({ map: awning, roughness: 1 }), 0, 1.9, -7.4);
  }
  /** Where the `index`th stone of a pit lies. */
  private spot(pit: number, index: number, total: number) {
    const p = pitAt(pit),
      store = STORE.includes(pit),
      // A sunflower spiral keeps any number of stones inside the hollow.
      radius = Math.min(1, Math.sqrt((index + 0.5) / Math.max(total, 6))) * 0.36,
      angle = index * 2.4 + pit;
    return new T.Vector3(
      p.x + Math.cos(angle) * radius,
      0.42 + Math.floor(index / 14) * 0.2,
      p.z + Math.sin(angle) * radius * (store ? 2.6 : 1),
    );
  }
  private rebuild(board: number[]) {
    this.stones.clear();
    board.forEach((count, pit) => {
      for (let i = 0; i < count; i++) {
        const mesh = new T.Mesh(this.stoneGeometry, this.stoneMaterials[(pit * 3 + i) % STONES.length]);
        mesh.castShadow = true;
        mesh.position.copy(this.spot(pit, i, count));
        mesh.scale.y = 0.7;
        this.stones.add(mesh);
      }
    });
    const ctx = this.counts.getContext("2d")!;
    ctx.clearRect(0, 0, 1024, 512);
    ctx.font = '700 40px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    board.forEach((count, pit) => {
      const p = pitAt(pit),
        store = STORE.includes(pit),
        x = 512 + (p.x * 1024) / 11.6,
        // Numbers sit on the rim: below the near row, above the far row.
        y = 256 + ((p.z + (store ? 1.42 : pit < 6 ? 0.78 : -0.78)) * 512) / 5.8;
      ctx.fillStyle = "rgba(40, 24, 12, 0.82)";
      ctx.beginPath();
      ctx.arc(x, y, 27, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff3d6";
      ctx.fillText(String(count), x, y + 2);
    });
    this.countTexture.needsUpdate = true;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, MANCALA_SUBJECT);
    this.camera.position.set(0, Math.sin(MANCALA_SUBJECT.tilt) * distance, Math.cos(MANCALA_SUBJECT.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Shows `state`; after a move the stones of the emptied pit are sown one by one. */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    if (!animate || this.reducedMotion || !before || !state.sown || state.ply !== before.ply + 1) {
      this.rebuild(state.board);
      this.onSettled();
      return;
    }
    this.rebuild(before.board);
    this.rings.clear();
    // The stones of the emptied pit are the first children added for it.
    let first = 0;
    for (let pit = 0; pit < state.sown.pit; pit++) first += before.board[pit];
    const now = performance.now(),
      landed = before.board.slice();
    landed[state.sown.pit] = 0;
    state.sown.path.forEach((pit, i) => {
      const mesh = this.stones.children[first + i];
      if (!mesh) return;
      this.tweens.push({
        mesh,
        start: now + i * 130,
        duration: 260,
        from: mesh.position.clone(),
        to: this.spot(pit, landed[pit]++, landed[pit] + 2),
      });
    });
  }
  setMarks(marks: Marks) {
    this.rings.clear();
    this.dirty = true;
    if (this.animating) return;
    const ring = (pit: number, kind: number) => {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[kind]),
        p = pitAt(pit);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.345, p.z);
      mesh.renderOrder = 2;
      this.rings.add(mesh);
    };
    for (const pit of marks.targets) ring(pit, 0);
    if (marks.cursor !== null) ring(marks.cursor, 1);
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.mesh.position.lerpVectors(t.from, t.to, p);
      t.mesh.position.y += Math.sin(Math.PI * p) * 0.7;
      if (p < 1) return true;
      this.onContact();
      return false;
    });
    if (!this.tweens.length && this.state) {
      this.rebuild(this.state.board);
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
