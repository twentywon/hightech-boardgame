import * as T from "three";
import { afterGPUFrame } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";
import type { TableView, Tone } from "./game";

/** How a game's cards look. Painters draw on a canvas of `pixels` size. */
export interface CardSkin {
  width: number;
  height: number;
  pixels: [number, number];
  face(ctx: CanvasRenderingContext2D, width: number, height: number, key: string): void;
  back(ctx: CanvasRenderingContext2D, width: number, height: number): void;
  /** Two lines printed on the felt. */
  lines: [string, string];
  /** Seats hold only a few cards, so the table can be drawn closer. */
  compact?: boolean;
}
const FONT =
  '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
const TONE_COLOR: Record<Tone, string> = {
  neutral: "#f1ecdf",
  win: "#f3d27a",
  lose: "#f0b4a6",
  push: "#dfe6dc",
};
const CHIPS = [
  { value: 500, color: "#3b2a66", stripe: "#f1ecdf" },
  { value: 100, color: "#1c1e20", stripe: "#f1ecdf" },
  { value: 50, color: "#c8452c", stripe: "#f6efe0" },
  { value: 10, color: "#efe6d0", stripe: "#2a5a4c" },
] as const;
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function plaqueTexture(text: string, tone: Tone) {
  const { c, ctx } = canvas(640, 128);
  ctx.fillStyle = "rgba(9, 28, 23, 0.78)";
  roundRect(ctx, 4, 4, 632, 120, 60);
  ctx.fill();
  ctx.strokeStyle = TONE_COLOR[tone];
  ctx.globalAlpha = tone === "neutral" ? 0.35 : 0.9;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = TONE_COLOR[tone];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 60;
  do {
    ctx.font = `700 ${size}px ${FONT}`;
    size -= 4;
  } while (ctx.measureText(text).width > 580 && size > 24);
  ctx.fillText(text, 320, 68);
  return texture(c);
}
function feltTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#1f5a49";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 5;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(24, 24);
  return t;
}
function markingTexture(lines: [string, string]) {
  const { c, ctx } = canvas(1024, 160);
  ctx.fillStyle = "rgba(233, 214, 160, 0.7)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 46px ${FONT}`;
  ctx.fillText(lines[0], 512, 48);
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(lines[1], 512, 116);
  return texture(c);
}
function glowTexture() {
  const { c, ctx } = canvas(512, 256);
  ctx.strokeStyle = "rgba(243, 210, 122, 0.95)";
  ctx.lineWidth = 8;
  ctx.shadowColor = "rgba(243, 210, 122, 0.9)";
  ctx.shadowBlur = 26;
  roundRect(ctx, 36, 36, 440, 184, 34);
  ctx.stroke();
  return texture(c);
}
function chipTop(color: string, stripe: string, value: number) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = stripe;
  ctx.lineWidth = 9;
  ctx.setLineDash([17, 14]);
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = stripe;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '700 40px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(String(value), 64, 67);
  return texture(c);
}
function chipSide(color: string, stripe: string) {
  const { c, ctx } = canvas(256, 16);
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? stripe : color;
    ctx.fillRect(i * 16, 0, 16, 16);
  }
  return texture(c);
}
interface Tween {
  mesh: T.Mesh;
  start: number;
  duration: number;
  from: T.Vector3;
  to: T.Vector3;
  fromFlip: number;
  toFlip: number;
  lift: number;
  contact: boolean;
  done?: () => void;
}
interface Layout {
  subject: (typeof SUBJECTS)[
    | "cardsWide"
    | "cardsSquare"
    | "cardsCompact"
    | "cardsCompactSquare"];
  /** Centre x of the opposing seats, by how many there are. */
  rivals: number[][];
  /** Width of an opposing row and card scale, by how many there are. */
  rivalWidth: number[];
  rivalScale: number[];
  mineWidth: number;
  deck: T.Vector3;
  discard: T.Vector3;
}
const LAYOUTS: Record<"wide" | "square" | "compact" | "compactSquare", Layout> = {
  compact: {
    subject: SUBJECTS.cardsCompact,
    rivals: [[0], [-1.8, 1.8], [-2.8, 0, 2.8]],
    rivalWidth: [3, 2.6, 2.4],
    rivalScale: [0.9, 0.9, 0.88],
    mineWidth: 3.4,
    deck: new T.Vector3(3.4, 0.12, 0.1),
    discard: new T.Vector3(-3.4, 0.02, 0.1),
  },
  compactSquare: {
    subject: SUBJECTS.cardsCompactSquare,
    rivals: [[0], [-1.5, 1.5], [-2.2, 0, 2.2]],
    rivalWidth: [3, 2.4, 1.9],
    rivalScale: [0.9, 0.88, 0.82],
    mineWidth: 3.4,
    deck: new T.Vector3(2.5, 0.12, 0.1),
    discard: new T.Vector3(-2.5, 0.02, 0.1),
  },
  wide: {
    subject: SUBJECTS.cardsWide,
    rivals: [[0], [-2.7, 2.7], [-3.9, 0, 3.9]],
    rivalWidth: [5, 4.4, 3.4],
    rivalScale: [0.85, 0.85, 0.82],
    mineWidth: 6.4,
    deck: new T.Vector3(4.9, 0.12, 0.1),
    discard: new T.Vector3(-4.9, 0.02, 0.1),
  },
  square: {
    subject: SUBJECTS.cardsSquare,
    rivals: [[0], [-1.8, 1.8], [-2.45, 0, 2.45]],
    rivalWidth: [5, 3.2, 2.15],
    rivalScale: [0.8, 0.76, 0.66],
    mineWidth: 6.2,
    deck: new T.Vector3(2.9, 0.12, 0.1),
    discard: new T.Vector3(-2.9, 0.02, 0.1),
  },
};
const MINE_Z = 1.85,
  RIVAL_Z = -1.9;

/** A felt table for seat 0 and up to three seats across from it. */
export class CardTableView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private layout = LAYOUTS.wide;
  private model: TableView = { seats: [], pot: 0 };
  private cards = new Map<number, { mesh: T.Mesh; faceUp: boolean }>();
  private tweens: Tween[] = [];
  private owned: { dispose(): void }[] = [];
  private cardGeometry: T.BoxGeometry;
  private edge = this.own(new T.MeshStandardMaterial({ color: "#efe9db", roughness: 0.8 }));
  private back: T.MeshStandardMaterial;
  private blank: T.MeshStandardMaterial;
  private faces = new Map<string, T.MeshStandardMaterial>();
  private plaqueGeometry = this.own(new T.PlaneGeometry(2.3, 0.46));
  private plaqueMaterials = new Map<string, T.MeshBasicMaterial>();
  private plaques = new T.Group();
  private chips = new T.Group();
  private chipGeometry = this.own(new T.CylinderGeometry(0.24, 0.24, 0.06, 32));
  private chipMaterials: T.Material[][] = [];
  private glow: T.Mesh;
  private deck: T.Mesh;
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A card touched the felt. */
  onContact: () => void = () => {};
  /** Every animation finished and the plaques show the current table. */
  onSettled: () => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<X extends { dispose(): void }>(resource: X) {
    this.owned.push(resource);
    return resource;
  }
  private paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const [w, h] = this.skin.pixels,
      { c, ctx } = canvas(w, h);
    draw(ctx, w, h);
    return this.own(new T.MeshStandardMaterial({ map: this.own(texture(c)), roughness: 0.55 }));
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    private skin: CardSkin,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#184539");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // The table is described in text beside it; the canvas itself is decorative.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.scene.add(new T.HemisphereLight("#fff4dc", "#1c3a31", 2.4));
    const light = new T.DirectionalLight("#fff6e2", 2.6);
    light.position.set(-3, 9, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -8;
    light.shadow.camera.right = 8;
    light.shadow.camera.top = 8;
    light.shadow.camera.bottom = -8;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const felt = new T.Mesh(
      this.own(new T.PlaneGeometry(60, 60)),
      this.own(new T.MeshStandardMaterial({ map: this.own(feltTexture()), roughness: 0.95 })),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const marking = new T.Mesh(
      this.own(new T.PlaneGeometry(4.2, 4.2 * (160 / 1024))),
      this.own(
        new T.MeshBasicMaterial({
          map: this.own(markingTexture(skin.lines)),
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    marking.rotation.x = -Math.PI / 2;
    marking.position.set(0, 0.004, -0.55);
    this.scene.add(marking);
    this.glow = new T.Mesh(
      this.own(new T.PlaneGeometry(1, 1)),
      this.own(
        new T.MeshBasicMaterial({ map: this.own(glowTexture()), transparent: true, depthWrite: false }),
      ),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.scene.add(this.glow);
    this.cardGeometry = this.own(new T.BoxGeometry(skin.width, 0.012, skin.height));
    this.back = this.paint((ctx, w, h) => skin.back(ctx, w, h));
    this.blank = this.paint((ctx, w, h) => {
      ctx.fillStyle = "#fbf8f0";
      ctx.fillRect(0, 0, w, h);
    });
    for (const chip of CHIPS) {
      const flat = this.own(
        new T.MeshStandardMaterial({
          map: this.own(chipTop(chip.color, chip.stripe, chip.value)),
          roughness: 0.5,
        }),
      );
      const side = this.own(
        new T.MeshStandardMaterial({ map: this.own(chipSide(chip.color, chip.stripe)), roughness: 0.5 }),
      );
      this.chipMaterials.push([side, flat, flat]);
    }
    this.deck = new T.Mesh(
      this.own(new T.BoxGeometry(skin.width + 0.06, 0.22, skin.height + 0.06)),
      [this.edge, this.edge, this.back, this.edge, this.edge, this.edge],
    );
    this.deck.castShadow = true;
    this.scene.add(this.deck, this.plaques, this.chips);
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
  private setFace(mesh: T.Mesh, key: string | null) {
    let material = this.blank;
    if (key) {
      material =
        this.faces.get(key) ??
        this.paint((ctx, w, h) => this.skin.face(ctx, w, h, key));
      this.faces.set(key, material);
    }
    (mesh.material as T.Material[])[2] = material;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const square = w / h < 1.25;
    this.layout = this.skin.compact
      ? square
        ? LAYOUTS.compactSquare
        : LAYOUTS.compact
      : square
        ? LAYOUTS.square
        : LAYOUTS.wide;
    const subject = this.layout.subject,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.deck.position.copy(this.layout.deck);
    // A new shape moves every target: place the current table without animation.
    this.sync(this.model, false);
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Row centre, width and card scale of a seat. */
  private row(seat: number) {
    const rivals = this.model.seats.length - 1;
    if (seat === 0) return { x: 0, z: MINE_Z, width: this.layout.mineWidth, scale: 1 };
    return {
      x: this.layout.rivals[rivals - 1][seat - 1],
      z: RIVAL_Z,
      width: this.layout.rivalWidth[rivals - 1],
      scale: this.layout.rivalScale[rivals - 1],
    };
  }
  private gap(n: number, width: number, scale: number) {
    const w = this.skin.width * scale;
    // Hands of a few cards lie side by side; longer ones overlap.
    return n > 1 ? Math.min(w * (this.skin.compact ? 1.05 : 0.62), (width - w) / (n - 1)) : 0;
  }
  /**
   * Shows `model`. New cards are dealt from the deck in order, a card that
   * gained a face is turned over, and cards that left the table are discarded.
   */
  sync(model: TableView, animate = true) {
    if (this.disposed) return;
    this.model = model;
    this.dirty = true;
    const quick = !animate || this.reducedMotion,
      now = performance.now(),
      { deck, discard } = this.layout;
    this.finish();
    const targets = new Map<number, { face: string | null; at: T.Vector3; scale: number }>();
    model.seats.forEach((seat, s) => {
      const { x, z, width, scale } = this.row(s),
        gap = this.gap(seat.cards.length, width, scale);
      seat.cards.forEach((card, i) =>
        targets.set(card.id, {
          face: card.face,
          scale,
          at: new T.Vector3(x + (i - (seat.cards.length - 1) / 2) * gap, 0.02 + i * 0.006, z),
        }),
      );
    });
    let removed = false;
    for (const [id, entry] of this.cards)
      if (!targets.has(id)) {
        this.cards.delete(id);
        removed = true;
        const leave = () => this.scene.remove(entry.mesh);
        if (quick) leave();
        else this.tween(entry.mesh, now, 260, discard, entry.mesh.rotation.z, Math.PI, 0.15, false, leave);
      }
    let order = 0;
    for (const [id, { face, at, scale }] of [...targets.entries()].sort(([a], [b]) => a - b)) {
      const existing = this.cards.get(id);
      if (!existing) {
        const mesh = new T.Mesh(this.cardGeometry, [
          this.edge,
          this.edge,
          this.blank,
          this.back,
          this.edge,
          this.edge,
        ]);
        mesh.castShadow = true;
        mesh.position.copy(deck);
        mesh.rotation.z = Math.PI;
        mesh.scale.set(scale, 1, scale);
        this.setFace(mesh, face);
        this.scene.add(mesh);
        this.cards.set(id, { mesh, faceUp: !!face });
        this.tween(mesh, now + order++ * 130, 300, at, Math.PI, face ? 0 : Math.PI, 0.55, true);
      } else {
        existing.mesh.scale.set(scale, 1, scale);
        if (face && !existing.faceUp) {
          existing.faceUp = true;
          this.setFace(existing.mesh, face);
          this.tween(existing.mesh, now + order++ * 130, 340, at, Math.PI, 0, 0.5, true);
        } else if (existing.mesh.position.distanceToSquared(at) > 1e-6) {
          const flip = existing.mesh.rotation.z;
          this.tween(existing.mesh, now, 220, at, flip, flip, 0.08, false);
        }
      }
    }
    this.dressTable();
    if (quick) this.finish();
    if (!this.tweens.length) this.settle();
    else if (removed) this.showPlaques(false);
  }
  private tween(
    mesh: T.Mesh,
    start: number,
    duration: number,
    to: T.Vector3,
    fromFlip: number,
    toFlip: number,
    lift: number,
    contact: boolean,
    done?: () => void,
  ) {
    this.tweens.push({ mesh, start, duration, from: mesh.position.clone(), to: to.clone(), fromFlip, toFlip, lift, contact, done });
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      const e = p * p * (3 - 2 * p);
      t.mesh.position.lerpVectors(t.from, t.to, e);
      t.mesh.position.y += Math.sin(Math.PI * p) * t.lift;
      t.mesh.rotation.z = t.fromFlip + (t.toFlip - t.fromFlip) * e;
      if (p < 1) return true;
      if (t.contact) this.onContact();
      t.done?.();
      return false;
    });
    if (!this.tweens.length) this.settle();
    return true;
  }
  private finish() {
    for (const t of this.tweens) {
      t.mesh.position.copy(t.to);
      t.mesh.rotation.z = t.toFlip;
      t.done?.();
    }
    this.tweens = [];
  }
  private settle() {
    this.showPlaques(true);
    this.dirty = true;
    this.onSettled();
  }
  /** The pot and the outline of the seat to act follow the table at once. */
  private dressTable() {
    this.chips.clear();
    let rest = this.model.pot,
      placed = 0;
    const total = CHIPS.reduce((n, chip) => {
      const count = Math.floor(rest / chip.value);
      rest %= chip.value;
      return n + count;
    }, 0),
      columns = Math.ceil(total / 7);
    rest = this.model.pot;
    for (const [kind, chip] of CHIPS.entries())
      while (rest >= chip.value) {
        rest -= chip.value;
        const mesh = new T.Mesh(this.chipGeometry, this.chipMaterials[kind]);
        mesh.position.set(
          (Math.floor(placed / 7) - (columns - 1) / 2) * 0.52,
          0.035 + (placed % 7) * 0.062,
          0.35,
        );
        mesh.rotation.y = Math.PI / 2;
        mesh.castShadow = true;
        this.chips.add(mesh);
        placed++;
      }
    const active = this.model.seats.findIndex((seat) => seat.active);
    this.glow.visible = active >= 0;
    if (active >= 0) {
      const { x, z, width, scale } = this.row(active),
        n = Math.max(1, this.model.seats[active].cards.length),
        w = this.skin.width * scale;
      this.glow.scale.set((w + this.gap(n, width, scale) * (n - 1)) * 1.32 + 0.5, this.skin.height * scale * 1.75, 1);
      this.glow.position.set(x, 0.006, z);
    }
  }
  private showPlaques(current: boolean) {
    this.plaques.clear();
    if (!current) return;
    const add = (text: string, tone: Tone, x: number, z: number, scale: number) => {
      if (!text) return;
      const key = `${tone}|${text}`;
      let material = this.plaqueMaterials.get(key);
      if (!material) {
        material = this.own(
          new T.MeshBasicMaterial({
            map: this.own(plaqueTexture(text, tone)),
            transparent: true,
            depthWrite: false,
          }),
        );
        this.plaqueMaterials.set(key, material);
      }
      const mesh = new T.Mesh(this.plaqueGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(scale);
      mesh.position.set(x, 0.008, z);
      this.plaques.add(mesh);
    };
    this.model.seats.forEach((seat, s) => {
      const { x, z, scale } = this.row(s),
        reach = (this.skin.height * scale) / 2 + 0.34 * Math.max(0.8, scale);
      add(
        seat.out ? `${seat.name} · 탈락` : seat.note ? `${seat.name} · ${seat.note}` : seat.name,
        seat.tone,
        x,
        s === 0 ? z + reach : z - reach,
        s === 0 ? 1 : Math.max(0.72, scale),
      );
    });
    if (this.model.pot > 0)
      add(`판돈 ${this.model.pot.toLocaleString("ko-KR")}`, "neutral", 0, 0.95, 0.8);
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
