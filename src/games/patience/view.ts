import * as T from "three";
import { afterGPUFrame, aim, disposeScene, realism, fitCanvas } from "../../engine/scene-utils";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { roundRect } from "../cards/table-view";
import { capturing } from "../../ui/banner";
import { faceOf, type Card } from "../spider/rules";
import { UP, cameraFor, type PatienceLayout, type Slot, type Spot } from "./layout";
import { zoomable } from "../../engine/zoom";

/** Keeps a resource to be freed with the view. */
export type Own = <R extends { dispose(): void }>(resource: R) => R;
/** What a game's setting adds round the cards: its table, its room and its lights. */
export interface Setting {
  /** Builds the surroundings into `scene` (the cards lie at height 0, on the table top). */
  build(scene: T.Scene, own: Own): void;
  /** The colour behind everything. */
  clear: string;
  /** The colour of the outlines of empty places. */
  ink: string;
}
interface Tween {
  mesh: T.Mesh;
  start: number;
  duration: number;
  from: T.Vector3;
  to: T.Vector3;
  flip: boolean;
}
/** A card thrown off the foundations when the game is won: decoration only. */
interface Flyer {
  mesh: T.Mesh;
  start: number;
  v: T.Vector3;
  spin: number;
  last: number;
  trail: number;
}
const TAP = 9,
  DOUBLE_MS = 420;
/**
 * The table of a patience game, after spider's: every card a thin box with the shared faces, dealt to the spots the
 * game's layout gives. Cards and runs move by drag and drop only; a tap on a pile that is not picked up (the stock)
 * and a double tap on a card are told to the screen, which decides what they do.
 */
export class PatienceView<S> {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(30, 1, 0.1, 120);
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
  /** Where each card is: its pile and its place in it. */
  private where = new Map<number, { pile: number; index: number }>();
  private slotMeshes: T.Mesh[] = [];
  private tweens: Tween[] = [];
  private flyers: Flyer[] = [];
  private ghosts = new T.Group();
  private state: S | null = null;
  private piles: Card[][] = [];
  private spots: Spot[][] = [];
  private ray = new T.Raycaster();
  private table = new T.Plane(new T.Vector3(0, 1, 0), -0.05);
  private marks = new T.Group();
  private drag: { pointer: number; pile: number; index: number; meshes: T.Mesh[]; grab: T.Vector3; x: number; y: number; moved: boolean } | null = null;
  private lastTap: { id: number; time: number } | null = null;
  private reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A card touched the table. */
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  /** A run dragged from `pile` at `index` was let go over `to` (its own pile when over nothing, or cancelled). */
  onDrop: (pile: number, index: number, to: number) => void = () => {};
  /** A pile was tapped where nothing is picked up there (the stock, empty or not). */
  onTap: (pile: number) => void = () => {};
  /** A card that may be picked up was tapped twice in quick succession. */
  onDouble: (pile: number, index: number) => void = () => {};
  /** May the run starting at this card be picked up? */
  canDrag: (pile: number, index: number) => boolean = () => false;
  get animating() {
    return this.tweens.length > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  private picture(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const c = document.createElement("canvas");
    [c.width, c.height] = CARD.pixels;
    draw(c.getContext("2d")!, c.width, c.height);
    const t = this.own(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  /** A card's side painted in code. */
  private paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    return this.own(new T.MeshStandardMaterial({ map: this.picture(draw), roughness: 0.55 }));
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    private layout: PatienceLayout<S>,
    setting: Setting,
  ) {
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor(setting.clear);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    const own: Own = (resource) => this.own(resource);
    setting.build(this.scene, own);
    realism(this.renderer, this.scene);
    this.scene.add(this.marks, this.ghosts);
    this.geometry = this.own(new T.BoxGeometry(CARD.width, 0.006, CARD.height));
    this.edge = this.own(new T.MeshStandardMaterial({ color: "#efe9db", roughness: 0.8 }));
    this.back = this.paint(drawBack);
    for (const slot of layout.slots) this.slot(slot, setting.ink);
    this.listen();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now(),
        moved = this.step(now),
        flying = this.fly(now);
      if (!this.dirty && !moved && !flying) return;
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
  /** The outline of an empty place, with its mark. */
  private slot(slot: Slot, ink: string) {
    const material = this.own(new T.MeshBasicMaterial({ transparent: true, depthWrite: false, map: this.picture((ctx, w, h) => {
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = 7;
      roundRect(ctx, 10, 10, w - 20, h - 20, 22);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (slot.mark.startsWith("suit")) {
        ctx.font = `150px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif`;
        ctx.fillText(["♠", "♥", "♣", "♦"][Number(slot.mark.slice(4))], w / 2, h / 2 + 6);
      } else if (slot.mark === "king") {
        ctx.font = `800 120px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText("K", w / 2, h / 2 + 6);
      } else if (slot.mark === "stock") {
        // A ring with an arrowhead: the waste goes back over from here.
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, 62, -Math.PI * 0.35, Math.PI * 1.45);
        ctx.stroke();
        const a = Math.PI * 1.45,
          x = w / 2 + Math.cos(a) * 62,
          y = h / 2 + Math.sin(a) * 62;
        ctx.beginPath();
        ctx.moveTo(x - 30, y - 6);
        ctx.lineTo(x + 8, y - 30);
        ctx.lineTo(x + 14, y + 16);
        ctx.closePath();
        ctx.fill();
      }
    }) }));
    const mesh = new T.Mesh(this.own(new T.PlaneGeometry(CARD.width, CARD.height)), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(slot.x, 0.004, slot.z);
    mesh.userData.pile = slot.pile;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.slotMeshes.push(mesh);
  }
  private listen() {
    const el = this.renderer.domElement;
    const spot = (e: PointerEvent) => {
      aim(this.ray, e, el, this.camera);
      const hit = new T.Vector3();
      return this.ray.ray.intersectPlane(this.table, hit) ? hit : null;
    };
    // A finger on the table drags cards; it must not scroll the page.
    el.style.touchAction = "none";
    let press: { pointer: number; x: number; y: number; pile: number | null } | null = null;
    el.addEventListener("pointerdown", (e) => {
      if (this.disposed || !this.state || this.drag || (e.pointerType === "mouse" && e.button !== 0)) return;
      press = null;
      if (this.animating) return;
      aim(this.ray, e, el, this.camera);
      // The card nearest the eye is the one on top.
      const hit = this.ray.intersectObjects([...this.cards.values()].map((c) => c.mesh), false)[0],
        at = hit ? this.where.get(hit.object.userData.id as number) : undefined;
      if (hit && at && this.canDrag(at.pile, at.index)) {
        const ground = spot(e);
        if (!ground) return;
        this.drag = {
          pointer: e.pointerId,
          pile: at.pile,
          index: at.index,
          meshes: this.piles[at.pile].slice(at.index).map((c) => this.cards.get(c.id)!.mesh),
          grab: ground.clone().sub(hit.object.position),
          x: e.clientX,
          y: e.clientY,
          moved: false,
        };
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      // Anything else is a tap on a pile, if it lets go where it pressed.
      const slot = this.ray.intersectObjects(this.slotMeshes, false)[0];
      press = { pointer: e.pointerId, x: e.clientX, y: e.clientY, pile: at?.pile ?? (slot ? (slot.object.userData.pile as number) : null) };
    });
    el.addEventListener("pointermove", (e) => {
      const drag = this.drag;
      if (!drag || drag.pointer !== e.pointerId) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < TAP) return;
      const at = spot(e);
      if (!at) return;
      if (!drag.moved) this.marks.clear();
      drag.moved = true;
      // The run follows the pointer, lifted clear of the other cards, fanned as in a column.
      drag.meshes.forEach((mesh, i) => {
        mesh.rotation.z = 0;
        mesh.position.set(at.x - drag.grab.x, 0.5 + i * 0.01, at.z - drag.grab.z + i * UP);
      });
      this.dirty = true;
    });
    const release = (e: PointerEvent) => {
      const drag = this.drag;
      if (drag && drag.pointer === e.pointerId) {
        this.drag = null;
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        if (!drag.moved) {
          if (e.type !== "pointerup") return;
          // A tap on a card that may be picked up: twice in quick succession sends it on.
          const id = this.piles[drag.pile][drag.index]?.id ?? -1,
            now = performance.now(),
            again = this.lastTap && this.lastTap.id === id && now - this.lastTap.time < DOUBLE_MS;
          this.lastTap = again ? null : { id, time: now };
          if (again) this.onDouble(drag.pile, drag.index);
          return;
        }
        this.lastTap = null;
        const lead = drag.meshes[0].position,
          to = e.type === "pointerup" ? this.pileAt(lead.x, lead.z, drag.pile) : drag.pile;
        // Let go over nothing, or cancelled: the screen puts it back.
        this.onDrop(drag.pile, drag.index, to);
        return;
      }
      const tap = press;
      press = null;
      if (!tap || tap.pointer !== e.pointerId || e.type !== "pointerup" || this.disposed || this.animating) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12 || tap.pile === null) return;
      this.onTap(tap.pile);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }
  /** The pile a card let go at (x, z) lands on: one whose cards or place it lies over, else the nearest close by. */
  private pileAt(x: number, z: number, from: number) {
    let best = from,
      score = Infinity;
    for (const slot of this.layout.slots) {
      const spots = this.spots[slot.pile] ?? [],
        last = spots[spots.length - 1] ?? slot,
        reach = this.layout.fanned(slot.pile) ? last.z : slot.z,
        inside = Math.abs(x - slot.x) < CARD.width * 0.75 && z > slot.z - CARD.height * 0.7 && z < reach + CARD.height * 0.7,
        distance = Math.hypot(x - last.x, z - last.z),
        value = inside ? distance : distance < 1.05 ? distance + 10 : Infinity;
      if (value < score) {
        score = value;
        best = slot.pile;
      }
    }
    return best;
  }
  private face(card: Card) {
    const key = faceOf(card);
    let material = this.faces.get(key);
    if (!material) {
      // The same faces as the other card games, untouched.
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
    fitCanvas(this.renderer, w, h);
    const camera = cameraFor(this.layout.subject, w / h);
    this.camera.copy(camera);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /**
   * Shows `state`: cards slide to their places and turn over as they must. Cards named in `later` (those that went
   * home by themselves) go one after another once the rest have moved.
   */
  sync(state: S, animate = true, later: number[] = []) {
    if (this.disposed) return;
    this.state = state;
    this.dirty = true;
    this.marks.clear();
    this.stopCelebration();
    for (const t of this.tweens) {
      t.mesh.position.copy(t.to);
      t.mesh.rotation.z = 0;
    }
    this.tweens = [];
    this.piles = this.layout.piles(state);
    this.spots = this.layout.spots(state);
    this.where.clear();
    const quick = !animate || this.reducedMotion,
      now = performance.now();
    let order = 0;
    this.piles.forEach((cards, pile) =>
      cards.forEach((card, index) => {
        this.where.set(card.id, { pile, index });
        const spot = this.spots[pile][index],
          to = new T.Vector3(spot.x, spot.y, spot.z);
        let entry = this.cards.get(card.id),
          flip = false;
        // The side up shows the face or the back, and the side down the other, so that a card turning over shows both.
        const sides = (materials: T.Material[]) => {
          materials[2] = card.up ? this.face(card) : this.back;
          materials[3] = card.up ? this.back : this.face(card);
        };
        if (!entry) {
          const mesh = new T.Mesh(this.geometry, [this.edge, this.edge, this.back, this.back, this.edge, this.edge]);
          sides(mesh.material as T.Material[]);
          mesh.castShadow = true;
          mesh.userData.id = card.id;
          mesh.position.copy(to);
          this.scene.add(mesh);
          entry = { mesh, up: card.up };
          this.cards.set(card.id, entry);
        } else if (entry.up !== card.up) {
          flip = true;
          entry.up = card.up;
          sides(entry.mesh.material as T.Material[]);
        }
        const wait = later.indexOf(card.id);
        if (quick) {
          entry.mesh.position.copy(to);
          entry.mesh.rotation.set(0, 0, 0);
        } else if (entry.mesh.position.distanceToSquared(to) > 1e-6 || flip)
          this.tweens.push({
            mesh: entry.mesh,
            start: now + (wait >= 0 ? 260 + wait * 150 : (order++ % 12) * 28),
            duration: 240,
            from: entry.mesh.position.clone(),
            to,
            flip,
          });
      }),
    );
    if (!this.tweens.length) this.onSettled();
  }
  /** Outlines the run a hint would move and the pile it would go to, or the stock alone. */
  showHint(pile: number, index: number, to: number | null) {
    this.marks.clear();
    if (!this.state) return;
    const material = this.own(new T.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.55, depthWrite: false })),
      frame = (x: number, z: number, depth: number) => {
        const mesh = new T.Mesh(this.own(new T.PlaneGeometry(CARD.width + 0.14, depth + 0.14)), material);
        mesh.rotation.x = -Math.PI / 2;
        // Just over the highest card of a pile, so that it lies where it points (high up it slid off at the sides).
        mesh.position.set(x, 0.16, z);
        mesh.renderOrder = 4;
        this.marks.add(mesh);
      },
      place = (p: number) => {
        const spots = this.spots[p],
          slot = this.layout.slots.find((s) => s.pile === p)!;
        return spots[spots.length - 1] ?? { x: slot.x, y: 0, z: slot.z };
      };
    const spots = this.spots[pile];
    if (spots?.length) {
      const first = spots[Math.min(index, spots.length - 1)],
        last = spots[spots.length - 1];
      frame(first.x, (first.z + last.z) / 2, last.z - first.z + CARD.height);
    } else frame(place(pile).x, place(pile).z, CARD.height);
    if (to !== null) {
      const end = place(to),
        // Onto a column the card goes below the last one; on a squared pile it covers it.
        below = this.layout.fanned(to) && this.spots[to].length ? 0.5 : 0;
      frame(end.x, end.z + below, CARD.height);
    }
    this.dirty = true;
  }
  clearHint() {
    this.marks.clear();
    this.dirty = true;
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      const e = p * p * (3 - 2 * p);
      t.mesh.position.lerpVectors(t.from, t.to, e);
      t.mesh.position.y += Math.sin(Math.PI * p) * 0.5;
      // A card in flight leans a little.
      t.mesh.rotation.x = Math.sin(Math.PI * p) * 0.08;
      if (t.flip) t.mesh.rotation.z = Math.PI * (1 - e);
      if (p < 1) return true;
      t.mesh.rotation.set(0, 0, 0);
      this.onContact();
      return false;
    });
    if (!this.tweens.length) this.onSettled();
    return true;
  }
  /**
   * The win: the cards leave the foundations one after another, the kings first, bounce on the table and leave a
   * trail of themselves as they go. Decoration only (the game is over), and not while a picture is being taken or
   * motion is to be kept low.
   */
  celebrate(foundations: number[]) {
    if (this.disposed || this.reducedMotion || capturing() || this.flyers.length) return;
    const now = performance.now(),
      stacks = foundations.map((pile) => this.piles[pile].slice().reverse());
    let n = 0;
    for (let round = 0; round < 13; round++)
      stacks.forEach((stack, i) => {
        const card = stack[round];
        if (!card) return;
        const mesh = this.cards.get(card.id)?.mesh;
        if (!mesh) return;
        // Every card flies outwards from its pile, towards the near side, at its own speed.
        const side = this.spots[foundations[i]][0]?.x ?? 0,
          away = side === 0 ? (i % 2 ? 1 : -1) : -Math.sign(side),
          seed = Math.sin((card.id + 1) * 12.9898) * 43758.5453,
          r = seed - Math.floor(seed);
        this.flyers.push({
          mesh,
          start: now + n++ * 110,
          v: new T.Vector3(away * (2.2 + r * 3), 4 + r * 2.5, 1.2 + (1 - r) * 2.4),
          spin: (r - 0.5) * 3,
          last: now,
          trail: 0,
        });
      });
    this.dirty = true;
  }
  private stopCelebration() {
    if (this.flyers.length || this.ghosts.children.length) for (const { mesh } of this.cards.values()) mesh.rotation.set(0, 0, 0);
    this.flyers = [];
    for (const ghost of [...this.ghosts.children]) this.ghosts.remove(ghost);
  }
  private fly(now: number) {
    if (!this.flyers.length) return false;
    const floor = 0.02;
    this.flyers = this.flyers.filter((f) => {
      if (now < f.start) return true;
      const dt = Math.min(0.05, (now - Math.max(f.last, f.start)) / 1000);
      f.last = now;
      const m = f.mesh;
      f.v.y -= 14 * dt;
      m.position.addScaledVector(f.v, dt);
      m.rotation.y += f.spin * dt;
      if (m.position.y < floor) {
        m.position.y = floor;
        f.v.y = Math.abs(f.v.y) * 0.62;
        f.v.x *= 0.9;
        f.v.z *= 0.9;
        if (f.v.y < 0.6) f.v.y = 0;
      }
      // A copy left where it was, every little while, while it is lively: the trail.
      f.trail += dt;
      if (f.trail > 0.045 && this.ghosts.children.length < 900 && now - f.start < 2600) {
        f.trail = 0;
        const ghost = new T.Mesh(this.geometry, m.material);
        ghost.position.copy(m.position);
        ghost.rotation.copy(m.rotation);
        ghost.position.y -= 0.002;
        this.ghosts.add(ghost);
      }
      const resting = f.v.y === 0 && Math.hypot(f.v.x, f.v.z) < 0.05;
      if (!resting && f.v.y === 0) {
        // Sliding on the table slows it.
        const drag = Math.exp(-2.6 * dt);
        f.v.x *= drag;
        f.v.z *= drag;
      }
      return !resting && now - f.start < 6000;
    });
    return true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    this.stopCelebration();
    for (const resource of this.owned) resource.dispose();
    disposeScene(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
