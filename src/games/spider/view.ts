import * as T from "three";
import { afterGPUFrame, aim, capable, hop, realism, travel, fitCanvas } from "../../engine/scene-utils";
import { FOV, cameraDistance } from "../../engine/camera";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { faceOf, targets, type Card, type State } from "./rules";
import { FELT, PILES_Z, PITCH, SPIDER_SUBJECT, STOCK_STEP, columnSpots, homeSpot, stockSpot } from "./layout";
import { cardGeometry } from "./card";
import { completed } from "./runs";
import { ROOM_CLEAR, cardRoom } from "./room";
import { zoomable } from "../../engine/zoom";

/** A card's way from where it is to where it goes. */
interface Tween {
  mesh: T.Mesh;
  start: number;
  duration: number;
  /** Where it set off; taken when the tween begins, so that a tween may follow another. */
  from: T.Vector3 | null;
  turn: T.Euler | null;
  to: T.Vector3;
  /** How high it rises on the way. */
  lift: number;
  flip: boolean;
  /** A turn about the upright it comes out of (a flick from the stock). */
  spin: number;
  /** Tell `onContact` when it lands. */
  sounds: boolean;
}
/** A card thrown off the completed runs when the game is won: decoration only. */
interface Flyer {
  mesh: T.Mesh;
  start: number;
  v: T.Vector3;
  spin: number;
  rest: number;
  /** Its first landing is heard. */
  sounds: boolean;
  done: boolean;
}
interface Entry {
  mesh: T.Mesh;
  up: boolean;
  /** The pile of completed runs it lies in, or -1 while it is in a column. */
  home: number;
}
/** How far apart the cards of a column lie when face up: as `layout.ts` has it. */
const UP = 0.52,
  /** The lifted run's height over the table. */
  LIFTED = 0.5,
  /** How long one card of a completed run takes to fly home, and how soon the next follows. */
  HOME_MS = 380,
  HOME_GAP = 55,
  /** How far a glowing frame's glow reaches past it. */
  GLOW = 0.16;
const ease = (p: number) => p * p * (3 - 2 * p);
/**
 * Ten columns of cards on the felt of a card room, the stock at the lower right and the completed runs between the
 * panel and the stock. Cards are solids with rounded corners; a picked-up run follows the pointer with a little
 * lag and tilt, the columns it may go to glow, and it settles where it lands. A completed run flies home card by
 * card; a row is flicked out of the stock; a won game throws the eight runs across the table.
 */
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
  private fine = capable();
  private geometry: T.BufferGeometry;
  private edge: T.MeshStandardMaterial;
  private stack: T.MeshStandardMaterial;
  private back: T.MeshStandardMaterial;
  private faces = new Map<string, T.MeshStandardMaterial>();
  private cards = new Map<number, Entry>();
  private piles = new T.Group();
  private tweens: Tween[] = [];
  private flyers: Flyer[] = [];
  private celebrateAt = 0;
  private state: State | null = null;
  private ray = new T.Raycaster();
  private reducedMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A card touched the felt where it is worth a sound (the cards of a completed run reaching home). */
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  /**
   * The run starting at a card was dragged and let go over a column. The
   * screen moves it or, by syncing again, lets it slide back.
   */
  onDrop: (column: number, index: number, to: number) => void = () => {};
  /** May the run starting at this card be picked up? */
  canDrag: (column: number, index: number) => boolean = () => false;
  private drag: {
    pointer: number;
    column: number;
    index: number;
    meshes: T.Mesh[];
    grab: T.Vector3;
    /** Where the pointer would put the run's first card. */
    target: T.Vector3 | null;
    moved: boolean;
    open: number[];
    velocity: T.Vector3;
    time: number;
  } | null = null;
  private marks = new T.Group();
  private glows = new T.Group();
  private pulseUntil = 0;
  private shade: T.Mesh;
  private table = new T.Plane(new T.Vector3(0, 1, 0), -0.05);
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
    return this.own(new T.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor(ROOM_CLEAR);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    cardRoom(this.scene, (r) => this.own(r));
    realism(this.renderer, this.scene);
    this.scene.add(this.piles, this.marks, this.glows);
    this.geometry = this.own(cardGeometry(CARD.width, CARD.height, 0.006, 0.07));
    this.edge = this.own(new T.MeshStandardMaterial({ color: "#e6dfcd", roughness: 0.8 }));
    // The side of a pile of cards: the edges of many cards, finely striped.
    const stripes = document.createElement("canvas");
    [stripes.width, stripes.height] = [4, 64];
    const ctx = stripes.getContext("2d")!;
    for (let y = 0; y < 64; y += 2) {
      ctx.fillStyle = y % 4 ? "#d9d1bf" : "#f1ebdd";
      ctx.fillRect(0, y, 4, 2);
    }
    const lines = this.own(new T.CanvasTexture(stripes));
    lines.colorSpace = T.SRGBColorSpace;
    lines.wrapS = lines.wrapT = T.RepeatWrapping;
    this.stack = this.own(new T.MeshStandardMaterial({ map: lines, roughness: 0.85 }));
    this.back = this.paint(drawBack);
    // The soft shadow under a lifted run where no shadow map draws it on the cards.
    this.shade = new T.Mesh(
      this.own(new T.PlaneGeometry(1, 1)),
      this.own(new T.MeshBasicMaterial({ map: this.own(this.shadePicture()), transparent: true, opacity: 0.5, depthWrite: false, color: "#000000" })),
    );
    this.shade.rotation.x = -Math.PI / 2;
    this.shade.renderOrder = 2;
    this.shade.visible = false;
    this.scene.add(this.shade);
    this.listen();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    let last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now(),
        dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const moved = this.step(now),
        dragged = this.follow(dt),
        pulsing = this.pulse(now),
        flying = this.fly(now, dt);
      if (!this.dirty && !moved && !dragged && !pulsing && !flying) return;
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
  /**
   * A rounded frame `width` by `depth` with a soft glow round it, white (its material tints it), on a picture
   * `GLOW` larger on every side: for hints and drop targets.
   */
  private glowPicture(width: number, depth: number) {
    const c = document.createElement("canvas"),
      scale = 120,
      margin = GLOW * scale;
    [c.width, c.height] = [Math.round(width * scale + margin * 2), Math.round(depth * scale + margin * 2)];
    const ctx = c.getContext("2d")!;
    ctx.shadowColor = "rgba(255,255,255,1)";
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "rgba(255,255,255,1)";
    ctx.lineWidth = 8;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.roundRect(margin, margin, c.width - margin * 2, c.height - margin * 2, 12);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    ctx.beginPath();
    ctx.roundRect(margin, margin, c.width - margin * 2, c.height - margin * 2, 12);
    ctx.fill();
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  private shadePicture() {
    const c = document.createElement("canvas");
    [c.width, c.height] = [64, 64];
    const ctx = c.getContext("2d")!;
    ctx.filter = "blur(7px)";
    ctx.fillStyle = "#fff";
    ctx.fillRect(14, 14, 36, 36);
    const t = new T.CanvasTexture(c);
    return t;
  }
  private listen() {
    const el = this.renderer.domElement;
    let down: { pointer: number; x: number; y: number } | null = null;
    const spot = (e: PointerEvent) => {
      aim(this.ray, e, el, this.camera);
      const hit = new T.Vector3();
      return this.ray.ray.intersectPlane(this.table, hit) ? hit : null;
    };
    // A finger on the table drags cards; it must not scroll the page.
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => {
      down = e.pointerType === "mouse" && e.button !== 0 ? null : { pointer: e.pointerId, x: e.clientX, y: e.clientY };
      if (this.disposed || this.animating || !this.state || this.drag || !down) return;
      aim(this.ray, e, el, this.camera);
      // The card nearest the eye is the one on top; cards gone home are not picked up.
      const loose = [...this.cards.values()].filter((c) => c.home < 0).map((c) => c.mesh),
        hit = this.ray.intersectObjects(loose, false)[0];
      if (!hit) return;
      const id = hit.object.userData.id as number,
        state = this.state;
      state.columns.forEach((cards, column) => {
        const index = cards.findIndex((c) => c.id === id);
        if (index < 0 || !this.canDrag(column, index)) return;
        const at = spot(e);
        if (!at) return;
        this.drag = {
          pointer: e.pointerId,
          column,
          index,
          meshes: cards.slice(index).map((c) => this.cards.get(c.id)!.mesh),
          grab: at.clone().sub(hit.object.position).setY(0),
          target: null,
          moved: false,
          open: targets(state, column, index),
          velocity: new T.Vector3(),
          time: performance.now(),
        };
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
    });
    el.addEventListener("pointermove", (e) => {
      const drag = this.drag;
      if (!drag || drag.pointer !== e.pointerId) return;
      const at = spot(e);
      if (!at) return;
      if (!drag.moved) {
        this.clearMarks();
        this.showTargets(drag.open);
      }
      drag.moved = true;
      drag.target = new T.Vector3(at.x - drag.grab.x, LIFTED, at.z - drag.grab.z);
      this.dirty = true;
    });
    const release = (e: PointerEvent) => {
      const drag = this.drag;
      if (drag && drag.pointer === e.pointerId) {
        this.drag = null;
        this.clearGlows();
        this.shade.visible = false;
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        const x = drag.target?.x ?? drag.meshes[0].position.x,
          to = this.columnAt(x);
        // Let go over its own column, or cancelled: the screen puts it back.
        this.onDrop(drag.column, drag.index, e.type === "pointerup" && drag.moved ? to : drag.column);
        down = null;
        return;
      }
      const tap = down;
      down = null;
      if (this.disposed || this.animating || !this.state || tap?.pointer !== e.pointerId || e.type !== "pointerup") return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
      aim(this.ray, e, el, this.camera);
      if (this.ray.intersectObjects(this.piles.children, false).some((h) => h.object.userData.stock)) this.onStock();
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }
  private columnAt(x: number) {
    return Math.max(0, Math.min(9, Math.round(x / PITCH + 4.5)));
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
  /** Where the top of the stock is: the pile the next row is dealt from. */
  private stockTop(cards: number) {
    const piles = Math.ceil(cards / 10);
    return new T.Vector3(stockSpot.x - Math.max(0, piles - 1) * STOCK_STEP, 0.08 + piles * 0.004, stockSpot.z);
  }
  private entry(card: Card, from: T.Vector3) {
    let entry = this.cards.get(card.id);
    if (!entry) {
      const mesh = new T.Mesh(this.geometry, [this.back, this.back, this.edge]);
      mesh.castShadow = true;
      // Where a graphics card draws, a lifted run's shadow falls on the cards under it too.
      mesh.receiveShadow = this.fine;
      mesh.userData.id = card.id;
      mesh.position.copy(from);
      this.scene.add(mesh);
      entry = { mesh, up: false, home: -1 };
      this.cards.set(card.id, entry);
    }
    return entry;
  }
  /** Turns a card's face up or down; true when it is turned up now. */
  private turn(entry: Entry, card: Card) {
    const flip = card.up && !entry.up;
    if (card.up !== entry.up) {
      entry.up = card.up;
      (entry.mesh.material as T.Material[])[0] = card.up ? this.face(card) : this.back;
    }
    // Until its tween turns it, a card turning up shows its back.
    if (flip) entry.mesh.rotation.z = Math.PI;
    return flip;
  }
  /** Shows `state`: cards slide to their places, new ones are flicked from the stock, completed runs fly home. */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.clearMarks();
    for (const t of this.tweens) {
      t.mesh.position.copy(t.to);
      t.mesh.rotation.set(0, 0, 0);
    }
    this.tweens = [];
    const quick = !animate || this.reducedMotion,
      now = performance.now(),
      seen = new Set<number>(),
      dealt = !!before && before.stock.length - state.stock.length === 10,
      source = before ? this.stockTop(before.stock.length) : this.stockTop(state.stock.length),
      runs = before ? completed(before, state) : [],
      // Cards turned up under a run that went home wait for it to go.
      waiting: Tween[] = [];
    let order = 0,
      latest = now;
    const add = (tween: Tween) => {
      this.tweens.push(tween);
      latest = Math.max(latest, tween.start + tween.duration);
      return tween;
    };
    /** Sends a card to `to`, by the way that suits where it is. */
    const send = (entry: Entry, card: Card, to: T.Vector3, column: number, fresh: boolean, index: number) => {
      const flip = this.turn(entry, card),
        mesh = entry.mesh;
      if (quick) {
        mesh.position.copy(to);
        mesh.rotation.set(0, 0, 0);
        return null;
      }
      if (mesh.position.distanceToSquared(to) < 1e-6 && !flip && Math.abs(mesh.rotation.x) + Math.abs(mesh.rotation.z) < 1e-4) return null;
      // A row dealt: flicked out of the stock one column after another.
      if (fresh && dealt)
        return add({ mesh, start: now + column * 40, duration: 280, from: null, turn: null, to, lift: 0.75, flip, spin: (column % 2 ? 1 : -1) * 0.35, sounds: false });
      const high = mesh.position.y > 0.3;
      return add({ mesh, start: now + (high ? index * 22 : (order++ % 12) * 28), duration: high ? 230 : 260, from: null, turn: null, to, lift: high ? 0.1 : 0.45, flip, spin: 0, sounds: false });
    };
    const finished = new Set(runs.map((r) => r.column));
    state.columns.forEach((cards, column) => {
      const spots = columnSpots(cards, column),
        lifted = this.liftedIndex(cards);
      cards.forEach((card, i) => {
        seen.add(card.id);
        const fresh = !this.cards.has(card.id),
          entry = this.entry(card, source);
        entry.home = -1;
        const tween = send(entry, card, new T.Vector3(spots[i].x, spots[i].y, spots[i].z), column, fresh, i - lifted);
        if (tween && finished.has(column) && i === cards.length - 1 && tween.flip) waiting.push(tween);
      });
    });
    // Completed runs: each card first to its place at the end of its column, then home, the ace first.
    let home = before ? before.done.length : state.done.length;
    for (const run of runs) {
      const full = [...state.columns[run.column].map((c) => ({ ...c, up: run.wasUp.get(c.id) ?? c.up })), ...run.cards],
        spots = columnSpots(full, run.column).slice(full.length - 13),
        lifted = this.liftedIndex(run.cards);
      let reach = now;
      run.cards.forEach((card, k) => {
        seen.add(card.id);
        const fresh = !this.cards.has(card.id),
          entry = this.entry(card, source),
          tween = send(entry, card, new T.Vector3(spots[k].x, spots[k].y, spots[k].z), run.column, fresh, k - Math.max(0, lifted));
        if (tween) reach = Math.max(reach, tween.start + tween.duration);
      });
      const spot = homeSpot(home);
      run.cards.forEach((card, k) => {
        const entry = this.cards.get(card.id)!,
          to = new T.Vector3(spot.x, 0.03 + (12 - k) * 0.004, spot.z);
        entry.home = home;
        if (quick) {
          entry.mesh.position.copy(to);
          entry.mesh.rotation.set(0, 0, 0);
          return;
        }
        add({ mesh: entry.mesh, start: reach + 140 + (12 - k) * HOME_GAP, duration: HOME_MS, from: null, turn: null, to, lift: 1.1, flip: false, spin: 0, sounds: (12 - k) % 3 === 0 });
      });
      home++;
    }
    for (const tween of waiting) tween.start = Math.max(tween.start, latest - 120);
    // Cards of runs already home stay there; any other card not on the table goes.
    for (const [id, entry] of this.cards)
      if (!seen.has(id)) {
        if (entry.home >= 0 && entry.home < state.done.length) continue;
        this.cards.delete(id);
        this.scene.remove(entry.mesh);
      }
    this.piles.clear();
    // One pile for every deal left in the stock, fanned to the left; the last on top.
    const piles = Math.ceil(state.stock.length / 10);
    for (let i = 0; i < piles; i++) {
      const mesh = new T.Mesh(this.geometry, [this.back, this.back, this.stack]),
        height = 10;
      mesh.scale.y = height;
      mesh.position.set(stockSpot.x - i * STOCK_STEP, 0.02 + height * 0.003 + i * 0.004, PILES_Z);
      mesh.castShadow = true;
      mesh.receiveShadow = this.fine;
      mesh.userData.stock = true;
      this.piles.add(mesh);
    }
    if (state.won && !(before?.won ?? true) && !quick) this.celebrateAt = latest + 500;
    if (!this.tweens.length) this.onSettled();
  }
  /** The index in `cards` of the first card of a run that is being carried (lifted over the table), or 0. */
  private liftedIndex(cards: Card[]) {
    const i = cards.findIndex((c) => (this.cards.get(c.id)?.mesh.position.y ?? 0) > 0.3);
    return i < 0 ? 0 : i;
  }
  /** Outlines the run a hint would move and the column it would go to; they glow for a moment. */
  showHint(column: number, index: number, to: number) {
    this.clearMarks();
    if (!this.state) return;
    const from = columnSpots(this.state.columns[column], column),
      last = from[from.length - 1];
    // From the top of the first card of the run to the bottom of its last.
    // Low over the cards (drawn over them all the same), so that the frames lie where the cards are seen.
    this.frame(this.marks, from[index].x, (from[index].z + last.z) / 2, last.z - from[index].z + CARD.height, last.y + 0.02, "#ffd84a", 1);
    const landing = this.landing(to);
    this.frame(this.marks, landing.x, landing.z, CARD.height, landing.y, "#ffd84a", 1);
    this.pulseUntil = performance.now() + 2600;
    this.dirty = true;
  }
  /** Where a run let go over column `to` lands. */
  private landing(to: number) {
    const cards = this.state!.columns[to],
      spots = columnSpots(cards, to),
      end = spots[spots.length - 1];
    return end ? { x: end.x, y: end.y + 0.02, z: end.z + UP } : { ...columnSpots([{ id: -1, rank: 1, suit: 0, up: true }], to)[0], y: 0.03 };
  }
  /** A glowing frame `depth` long round (x, z). */
  private frame(group: T.Group, x: number, z: number, depth: number, y: number, color: string, opacity: number) {
    const width = CARD.width + 0.08,
      mesh = new T.Mesh(
        new T.PlaneGeometry(width + GLOW * 2, depth + 0.08 + GLOW * 2),
        new T.MeshBasicMaterial({ map: this.glowPicture(width, depth + 0.08), color, transparent: true, opacity, depthWrite: false, depthTest: false }),
      );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 4;
    group.add(mesh);
    return mesh;
  }
  private clear(group: T.Group) {
    for (const child of group.children)
      if (child instanceof T.Mesh) {
        child.geometry.dispose();
        (child.material as T.MeshBasicMaterial).map?.dispose();
        (child.material as T.Material).dispose();
      }
    group.clear();
    this.dirty = true;
  }
  private clearMarks() {
    this.pulseUntil = 0;
    this.clear(this.marks);
  }
  private clearGlows() {
    this.clear(this.glows);
  }
  /** The columns a picked-up run may go to glow where it would land. */
  private showTargets(open: number[]) {
    this.clearGlows();
    if (!this.state) return;
    for (const to of open) {
      const at = this.landing(to),
        mesh = this.frame(this.glows, at.x, at.z, CARD.height, at.y, "#9ef0c0", 0.5);
      mesh.userData.column = to;
      // Under the carried cards, over the column.
      (mesh.material as T.MeshBasicMaterial).depthTest = true;
    }
  }
  private pulse(now: number) {
    if (!this.pulseUntil) return false;
    const left = this.pulseUntil - now,
      opacity = left <= 0 ? 0.85 : 0.6 + 0.4 * Math.abs(Math.cos((left / 1000) * Math.PI * 1.6));
    for (const child of this.marks.children) ((child as T.Mesh).material as T.MeshBasicMaterial).opacity = opacity;
    if (left <= 0) this.pulseUntil = 0;
    return true;
  }
  /** The carried run eases after the pointer, each card a little behind the one above, leaning as it is swung. */
  private follow(dt: number) {
    const drag = this.drag;
    if (!drag?.target) return false;
    const target = drag.target,
      lead = drag.meshes[0],
      was = lead.position.clone();
    drag.meshes.forEach((mesh, i) => {
      const k = 1 - Math.exp((-dt * 26) / (1 + i * 0.22));
      mesh.position.lerp(new T.Vector3(target.x, LIFTED + i * 0.012, target.z + i * UP), k);
    });
    if (dt > 0) drag.velocity.lerp(lead.position.clone().sub(was).divideScalar(dt), 0.35);
    const roll = Math.max(-0.2, Math.min(0.2, -drag.velocity.x * 0.018)),
      pitch = Math.max(-0.14, Math.min(0.14, drag.velocity.z * 0.014));
    for (const mesh of drag.meshes) {
      mesh.rotation.z += (roll - mesh.rotation.z) * 0.5;
      mesh.rotation.x += (pitch - mesh.rotation.x) * 0.5;
    }
    // The column under the run glows brighter when it may take it.
    const over = this.columnAt(target.x);
    for (const child of this.glows.children) {
      const yes = child.userData.column === over;
      ((child as T.Mesh).material as T.MeshBasicMaterial).opacity = yes ? 1 : 0.45;
      ((child as T.Mesh).material as T.MeshBasicMaterial).color.set(yes ? "#ffe27a" : "#9ef0c0");
    }
    if (!this.fine) {
      // A soft shadow under the run, cast away from the lamp.
      const end = drag.meshes[drag.meshes.length - 1].position;
      this.shade.visible = true;
      this.shade.position.set((lead.position.x + end.x) / 2 + 0.08, 0.3, (lead.position.z + end.z) / 2 - 0.12);
      this.shade.scale.set(CARD.width * 1.35, end.z - lead.position.z + CARD.height * 1.25, 1);
    }
    return true;
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      if (!t.from) {
        t.from = t.mesh.position.clone();
        t.turn = t.mesh.rotation.clone();
      }
      const along = travel(p),
        mesh = t.mesh;
      mesh.position.lerpVectors(t.from, t.to, along);
      mesh.position.y += hop(p) * t.lift;
      // A flip turns the card over its long side; a lean taken from the hand straightens out.
      const e = ease(Math.min(1, p / 0.84));
      mesh.rotation.x = t.turn!.x * (1 - e);
      mesh.rotation.z = t.flip ? Math.PI * (1 - e) : t.turn!.z * (1 - e);
      mesh.rotation.y = t.spin * (1 - e);
      if (p < 1) return true;
      mesh.position.copy(t.to);
      mesh.rotation.set(0, 0, 0);
      if (t.sounds) this.onContact();
      return false;
    });
    if (!this.tweens.length) this.onSettled();
    return true;
  }
  /** The won game: the cards of the eight runs are thrown across the felt one after another and come to rest there. */
  private fly(now: number, dt: number) {
    if (this.celebrateAt && now >= this.celebrateAt && !this.tweens.length) {
      this.celebrateAt = 0;
      const homes = [...this.cards.values()].filter((c) => c.home >= 0).sort((a, b) => a.home - b.home || b.mesh.position.y - a.mesh.position.y);
      let seed = 7;
      const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      homes.forEach((entry, i) => {
        const side = entry.mesh.position.x < 0 ? -1 : 1;
        this.flyers.push({
          mesh: entry.mesh,
          start: now + i * 45,
          v: new T.Vector3(side * (1.5 + random() * 4.5) * (random() < 0.25 ? -1 : 1), 4 + random() * 3.5, 2.5 - random() * 8.5),
          spin: (random() - 0.5) * 9,
          rest: 0.03 + i * 0.0045,
          sounds: i % 6 === 0,
          done: false,
        });
      });
    }
    if (!this.flyers.length) return false;
    const x = FELT.x - 0.6,
      z = FELT.z - 0.8;
    for (const f of this.flyers) {
      if (f.done || now < f.start) continue;
      const m = f.mesh,
        v = f.v;
      v.y -= 15 * dt;
      m.position.addScaledVector(v, dt);
      m.rotation.y += f.spin * dt;
      if (Math.abs(m.position.x) > x) {
        m.position.x = Math.sign(m.position.x) * x;
        v.x = -v.x * 0.6;
      }
      if (Math.abs(m.position.z) > z) {
        m.position.z = Math.sign(m.position.z) * z;
        v.z = -v.z * 0.6;
      }
      if (m.position.y < f.rest) {
        m.position.y = f.rest;
        if (Math.abs(v.y) > 1.2) {
          v.y = -v.y * 0.42;
          v.x *= 0.7;
          v.z *= 0.7;
          f.spin *= 0.6;
          if (f.sounds) this.onContact();
          f.sounds = false;
        } else f.done = true;
      }
    }
    if (this.flyers.every((f) => f.done)) this.flyers = [];
    return true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    this.flyers = [];
    this.clear(this.marks);
    this.clear(this.glows);
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
