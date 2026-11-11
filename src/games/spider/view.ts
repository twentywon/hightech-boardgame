import * as T from "three";
import { afterGPUFrame, aim } from "../../engine/scene-utils";
import { FOV, cameraDistance } from "../../engine/camera";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { faceOf, type Card, type State } from "./rules";
import { PILES_Z, PITCH, SPIDER_SUBJECT, columnSpots, stockSpot } from "./layout";

interface Tween {
  mesh: T.Mesh;
  start: number;
  duration: number;
  from: T.Vector3;
  to: T.Vector3;
  flip: boolean;
}
/** Ten columns of cards on felt, the stock at the lower right and finished runs at the lower left. */
export class SpiderView {
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
  private geometry: T.BoxGeometry;
  private edge: T.MeshStandardMaterial;
  private back: T.MeshStandardMaterial;
  private faces = new Map<string, T.MeshStandardMaterial>();
  private cards = new Map<number, { mesh: T.Mesh; up: boolean }>();
  private piles = new T.Group();
  private tweens: Tween[] = [];
  private state: State | null = null;
  private ray = new T.Raycaster();
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A card touched the felt. */
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  /** A card of a column was tapped. */
  onCard: (column: number, index: number) => void = () => {};
  /** An empty column or the stock was tapped. */
  onStock: () => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  private paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = document.createElement("canvas");
    [c.width, c.height] = CARD.pixels;
    draw(c.getContext("2d")!, c.width, c.height);
    const t = this.own(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return this.own(new T.MeshStandardMaterial({ map: t, roughness: 0.55 }));
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#1d4a3c");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.scene.add(new T.HemisphereLight("#fff4dc", "#1c3a31", 2.5));
    const light = new T.DirectionalLight("#fff6e2", 2.2);
    light.position.set(-3, 10, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -9;
    light.shadow.camera.right = 9;
    light.shadow.camera.top = 9;
    light.shadow.camera.bottom = -9;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const felt = new T.Mesh(
      this.own(new T.PlaneGeometry(90, 90)),
      this.own(new T.MeshStandardMaterial({ color: "#24604d", roughness: 0.95 })),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt, this.piles);
    this.geometry = this.own(new T.BoxGeometry(CARD.width, 0.006, CARD.height));
    this.edge = this.own(new T.MeshStandardMaterial({ color: "#efe9db", roughness: 0.8 }));
    this.back = this.paint(drawBack);
    const el = this.renderer.domElement;
    let down: { pointer: number; x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      down = e.pointerType === "mouse" && e.button !== 0 ? null : { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (this.disposed || this.animating || !this.state || tap?.pointer !== e.pointerId) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
      aim(this.ray, e, el, this.camera);
      // The card nearest the eye is the one on top.
      const hit = this.ray.intersectObjects([...this.cards.values()].map((c) => c.mesh), false)[0];
      if (hit) {
        const id = hit.object.userData.id as number;
        this.state.columns.forEach((cards, column) => {
          const index = cards.findIndex((c) => c.id === id);
          if (index >= 0) this.onCard(column, index);
        });
      } else if (this.ray.intersectObjects(this.piles.children, false).some((h) => h.object.userData.stock)) this.onStock();
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
  private face(card: Card) {
    const key = faceOf(card);
    let material = this.faces.get(key);
    if (!material) {
      material = this.paint((ctx, w, h) => drawFace(ctx, w, h, key));
      this.faces.set(key, material);
    }
    return material;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, SPIDER_SUBJECT);
    this.camera.position.set(0, Math.sin(SPIDER_SUBJECT.tilt) * distance, Math.cos(SPIDER_SUBJECT.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Shows `state`: cards slide to their places, new ones come from the stock, finished runs go to their pile. */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    this.state = state;
    this.dirty = true;
    for (const t of this.tweens) t.mesh.position.copy(t.to);
    this.tweens = [];
    const quick = !animate || this.reducedMotion,
      now = performance.now(),
      seen = new Set<number>();
    let order = 0;
    state.columns.forEach((cards, column) => {
      const spots = columnSpots(cards, column);
      cards.forEach((card, i) => {
        seen.add(card.id);
        const to = new T.Vector3(spots[i].x, spots[i].y, spots[i].z);
        let entry = this.cards.get(card.id);
        if (!entry) {
          const mesh = new T.Mesh(this.geometry, [this.edge, this.edge, this.back, this.edge, this.edge, this.edge]);
          mesh.castShadow = true;
          mesh.userData.id = card.id;
          mesh.position.set(stockSpot.x, 0.1, stockSpot.z);
          this.scene.add(mesh);
          entry = { mesh, up: false };
          this.cards.set(card.id, entry);
        }
        const flip = card.up && !entry.up;
        if (card.up !== entry.up) {
          entry.up = card.up;
          (entry.mesh.material as T.Material[])[2] = card.up ? this.face(card) : this.back;
        }
        if (quick) entry.mesh.position.copy(to);
        else if (entry.mesh.position.distanceToSquared(to) > 1e-6 || flip)
          this.tweens.push({ mesh: entry.mesh, start: now + (order++ % 12) * 28, duration: 230, from: entry.mesh.position.clone(), to, flip });
      });
    });
    // Cards of a finished run leave for the pile of completed runs.
    for (const [id, entry] of this.cards)
      if (!seen.has(id)) {
        this.cards.delete(id);
        this.scene.remove(entry.mesh);
      }
    this.piles.clear();
    const pile = (x: number, material: T.Material, height: number, stock = false) => {
      const mesh = new T.Mesh(this.geometry, [this.edge, this.edge, material, this.edge, this.edge, this.edge]);
      mesh.scale.y = height;
      mesh.position.set(x, 0.02 + height * 0.003, PILES_Z);
      mesh.castShadow = true;
      mesh.userData.stock = stock;
      this.piles.add(mesh);
    };
    // One pile for every deal left in the stock, fanned to the left.
    for (let i = 0; i < state.stock.length / 10; i++) pile(stockSpot.x - i * 0.22, this.back, 10 + i, true);
    state.done.forEach((suit, i) => pile((-4.5 + i * 0.5) * PITCH, this.face({ id: -1, rank: 13, suit, up: true }), 13 + i));
    if (!this.tweens.length) this.onSettled();
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      const e = p * p * (3 - 2 * p);
      t.mesh.position.lerpVectors(t.from, t.to, e);
      t.mesh.position.y += Math.sin(Math.PI * p) * 0.5;
      if (t.flip) t.mesh.rotation.z = Math.PI * (1 - e);
      if (p < 1) return true;
      t.mesh.rotation.z = 0;
      this.onContact();
      return false;
    });
    if (!this.tweens.length) this.onSettled();
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
