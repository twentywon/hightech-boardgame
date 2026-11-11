import { CARD, drawBack, drawFace } from "../cards/faces";
import * as T from "three";
import { afterGPUFrame, aim } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";
import type { Card } from "./shoe";

/** A card on the table; `face` is null while it lies face down. */
export interface TableCard {
  id: number;
  face: Card | null;
}
export type Tone = "neutral" | "win" | "lose" | "push";
export interface TableHand {
  cards: TableCard[];
  bet: number;
  active: boolean;
  /** Total or result, already worded by the UI. Empty hides the plaque. */
  label: string;
  tone: Tone;
}
/** Everything the table shows. The view knows no rules; it draws this. */
export interface TableModel {
  dealer: TableCard[];
  dealerLabel: string;
  hands: TableHand[];
  /** Stake shown in the betting circle before any hand exists. */
  stake: number;
}

const CARD_W = CARD.width,
  CARD_H = CARD.height,
  CARD_T = 0.012;
const SUIT_GLYPH = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const TONE_COLOR: Record<Tone, string> = {
  neutral: "#f1ecdf",
  win: "#f3d27a",
  lose: "#f0b4a6",
  push: "#dfe6dc",
};
const CHIPS = [
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
function roundRect(
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
function faceTexture(card: Card | null) {
  const { c, ctx } = canvas(...CARD.pixels);
  if (card) drawFace(ctx, c.width, c.height, card.rank + card.suit);
  else {
    ctx.fillStyle = "#fbf8f0";
    ctx.fillRect(0, 0, c.width, c.height);
  }
  return texture(c);
}
function backTexture() {
  const { c, ctx } = canvas(...CARD.pixels);
  drawBack(ctx, c.width, c.height);
  return texture(c);
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
  let size = 62;
  do {
    ctx.font = `700 ${size}px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 570 && size > 26);
  ctx.fillText(text, 320, 68);
  return texture(c);
}
function feltTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#1f5a49";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
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
function markingTexture() {
  const { c, ctx } = canvas(1024, 256);
  ctx.strokeStyle = "rgba(217, 185, 106, 0.55)";
  ctx.fillStyle = "rgba(233, 214, 160, 0.78)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(40, 128);
  ctx.lineTo(984, 128);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.font = `700 54px ${font}`;
  ctx.fillText("블랙잭은 3 : 2 로 지급합니다", 512, 70);
  ctx.font = `500 40px ${font}`;
  ctx.fillText("딜러는 17 이상에서 멈춥니다", 512, 188);
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
  ctx.font = '700 44px "Helvetica Neue", Arial, sans-serif';
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
  subject: (typeof SUBJECTS)["blackjackWide" | "blackjackTall"];
  dealerZ: number;
  playerZ: number;
  /** Centre x of each hand, by number of hands. */
  hands: Record<1 | 2, number[]>;
  /** Widest a row of cards may spread, by number of hands. */
  width: Record<1 | 2, number>;
  shoe: T.Vector3;
  discard: T.Vector3;
  marking: number;
}
const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    subject: SUBJECTS.blackjackWide,
    dealerZ: -1.55,
    playerZ: 0.9,
    hands: { 1: [0], 2: [-2.15, 2.15] },
    width: { 1: 4.8, 2: 3.7 },
    shoe: new T.Vector3(3.85, 0.12, -1.6),
    discard: new T.Vector3(-3.85, 0.02, -1.6),
    marking: 4.4,
  },
  tall: {
    subject: SUBJECTS.blackjackTall,
    dealerZ: -1.5,
    playerZ: 0.9,
    hands: { 1: [0], 2: [-1.4, 1.4] },
    width: { 1: 4.8, 2: 2.6 },
    shoe: new T.Vector3(2.15, 0.12, -2.75),
    discard: new T.Vector3(-2.15, 0.02, -2.75),
    marking: 3.9,
  },
};

export class BlackjackView {
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
  private model: TableModel = { dealer: [], dealerLabel: "", hands: [], stake: 0 };
  private cards = new Map<number, { mesh: T.Mesh; faceUp: boolean }>();
  private tweens: Tween[] = [];
  private owned: { dispose(): void }[] = [];
  private cardGeometry = this.own(new T.BoxGeometry(CARD_W, CARD_T, CARD_H));
  private edge = this.own(new T.MeshStandardMaterial({ color: "#efe9db", roughness: 0.8 }));
  private back: T.MeshStandardMaterial;
  private blank: T.MeshStandardMaterial;
  private faces = new Map<string, T.MeshStandardMaterial>();
  private plaqueGeometry = this.own(new T.PlaneGeometry(2.1, 0.42));
  private plaqueMaterials = new Map<string, T.MeshBasicMaterial>();
  private plaques = new T.Group();
  private chips = new T.Group();
  private chipGeometry = this.own(new T.CylinderGeometry(0.24, 0.24, 0.06, 32));
  private chipMaterials: T.Material[][] = [];
  private glow: T.Mesh;
  private marking: T.Mesh;
  private shoe: T.Mesh;
  private rings = new T.Group();
  private ringGeometry = this.own(new T.RingGeometry(0.4, 0.425, 48));
  private ringMaterial = this.own(
    new T.MeshBasicMaterial({ color: "#d9b96a", transparent: true, opacity: 0.55, side: T.DoubleSide }),
  );
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A card touched the felt. */
  onContact: () => void = () => {};
  /** The person tapped the shoe. */
  onShoe: () => void = () => {};
  /** Every animation finished and the plaques show the current model. */
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
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
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
    light.shadow.camera.left = -7;
    light.shadow.camera.right = 7;
    light.shadow.camera.top = 7;
    light.shadow.camera.bottom = -7;
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
    this.marking = new T.Mesh(
      this.own(new T.PlaneGeometry(1, 0.25)),
      this.own(
        new T.MeshBasicMaterial({ map: this.own(markingTexture()), transparent: true, depthWrite: false }),
      ),
    );
    this.marking.rotation.x = -Math.PI / 2;
    this.marking.position.set(0, 0.004, -0.32);
    this.scene.add(this.marking);
    this.glow = new T.Mesh(
      this.own(new T.PlaneGeometry(1, 1)),
      this.own(
        new T.MeshBasicMaterial({ map: this.own(glowTexture()), transparent: true, depthWrite: false }),
      ),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.scene.add(this.glow);
    this.back = this.own(new T.MeshStandardMaterial({ map: this.own(backTexture()), roughness: 0.55 }));
    this.blank = this.own(new T.MeshStandardMaterial({ map: this.own(faceTexture(null)), roughness: 0.55 }));
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
    // The shoe: a short stack the cards are dealt from.
    this.shoe = new T.Mesh(this.own(new T.BoxGeometry(CARD_W + 0.06, 0.22, CARD_H + 0.06)), [
      this.edge,
      this.edge,
      this.back,
      this.edge,
      this.edge,
      this.edge,
    ]);
    this.shoe.castShadow = true;
    this.scene.add(this.shoe, this.plaques, this.chips, this.rings);
    // A tap on the shoe asks for the next card.
    const canvas = this.renderer.domElement,
      ray = new T.Raycaster();
    const onShoe = (e: PointerEvent) => {
      aim(ray, e, canvas, this.camera);
      return ray.intersectObject(this.shoe, false).length > 0;
    };
    let down: { pointer: number; x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down =
        !this.disposed && (e.pointerType !== "mouse" || e.button === 0) && onShoe(e)
          ? { pointer: e.pointerId, x: e.clientX, y: e.clientY }
          : null;
    });
    canvas.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (tap?.pointer === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 12 && onShoe(e))
        this.onShoe();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") canvas.style.cursor = onShoe(e) ? "pointer" : "";
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
  private faceMaterial(card: Card) {
    const key = card.rank + card.suit;
    let material = this.faces.get(key);
    if (!material) {
      material = this.own(new T.MeshStandardMaterial({ map: this.own(faceTexture(card)), roughness: 0.55 }));
      this.faces.set(key, material);
    }
    return material;
  }
  private setFace(mesh: T.Mesh, card: Card | null) {
    (mesh.material as T.Material[])[2] = card ? this.faceMaterial(card) : this.blank;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.layout = w / h < 1.15 ? LAYOUTS.tall : LAYOUTS.wide;
    const subject = this.layout.subject,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.marking.scale.set(this.layout.marking, this.layout.marking, 1);
    this.shoe.position.copy(this.layout.shoe);
    // A new shape moves every target: place the current table without animation.
    this.sync(this.model, false);
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Where the i-th of n cards of a row centred on x belongs. */
  private slot(x: number, z: number, i: number, n: number, width: number) {
    const gap = n > 1 ? Math.min(CARD_W * 0.62, (width - CARD_W) / (n - 1)) : 0;
    return new T.Vector3(x + (i - (n - 1) / 2) * gap, 0.02 + i * 0.006, z);
  }
  /**
   * Shows `model`. New cards are dealt from the shoe one after another, a
   * card that gained a face is turned over, moved cards slide and cards that
   * left the table go to the discard pile.
   */
  sync(model: TableModel, animate = true) {
    if (this.disposed) return;
    this.model = model;
    this.dirty = true;
    const quick = !animate || this.reducedMotion,
      now = performance.now(),
      { dealerZ, playerZ, hands, width, shoe, discard } = this.layout,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2;
    // Finish whatever was still moving so every card starts from its place.
    this.finish();
    const targets = new Map<number, { card: TableCard; at: T.Vector3; dealer: boolean }>();
    model.dealer.forEach((card, i) =>
      targets.set(card.id, {
        card,
        at: this.slot(0, dealerZ, i, model.dealer.length, width[1]),
        dealer: true,
      }),
    );
    model.hands.forEach((hand, h) =>
      hand.cards.forEach((card, i) =>
        targets.set(card.id, {
          card,
          at: this.slot(hands[count][h], playerZ, i, hand.cards.length, width[count]),
          dealer: false,
        }),
      ),
    );
    let removed = false;
    for (const [id, entry] of this.cards)
      if (!targets.has(id)) {
        this.cards.delete(id);
        removed = true;
        const leave = () => this.scene.remove(entry.mesh);
        if (quick) leave();
        else
          this.tween(entry.mesh, now, 260, discard, entry.mesh.rotation.z, Math.PI, 0.15, false, leave);
      }
    // Deal order: by id, with the hole card turning over after the player's
    // new cards and before the dealer draws.
    const ordered = [...targets.entries()].sort(([a], [b]) => a - b);
    let order = 0,
      lastPlayerDeal = -1;
    const steps: { key: number; run: (start: number) => void }[] = [];
    for (const [id, { card, at, dealer }] of ordered) {
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
        mesh.position.copy(shoe);
        mesh.rotation.z = Math.PI;
        this.setFace(mesh, card.face);
        this.scene.add(mesh);
        this.cards.set(id, { mesh, faceUp: !!card.face });
        if (!dealer) lastPlayerDeal = Math.max(lastPlayerDeal, id);
        steps.push({
          key: id,
          run: (start) =>
            this.tween(mesh, start, 320, at, Math.PI, card.face ? 0 : Math.PI, 0.55, true),
        });
      } else if (card.face && !existing.faceUp) {
        // The hole card turns over; its place in the order is set below.
        existing.faceUp = true;
        this.setFace(existing.mesh, card.face);
        steps.push({
          key: -1,
          run: (start) => this.tween(existing.mesh, start, 360, at, Math.PI, 0, 0.5, true),
        });
      } else {
        if (!card.face && existing.faceUp) {
          existing.faceUp = false;
          existing.mesh.rotation.z = Math.PI;
          this.setFace(existing.mesh, null);
        }
        if (existing.mesh.position.distanceToSquared(at) > 1e-6) {
          const flip = existing.mesh.rotation.z;
          this.tween(existing.mesh, now, 240, at, flip, flip, 0.08, false);
        }
      }
    }
    // Place the turn-over right after the last card dealt to the player.
    for (const step of steps) if (step.key === -1) step.key = lastPlayerDeal + 0.5;
    steps.sort((a, b) => a.key - b.key);
    for (const step of steps) step.run(now + order++ * 250);
    this.dressTable();
    if (quick) this.finish();
    if (!this.tweens.length) this.settle();
    // Old totals stay readable during a deal, but not across a cleared table.
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
    this.tweens.push({
      mesh,
      start,
      duration,
      from: mesh.position.clone(),
      to: to.clone(),
      fromFlip,
      toFlip,
      lift,
      contact,
      done,
    });
  }
  /** Advances the animations; true while anything moved. */
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
  /** Jumps every running animation to its end. */
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
  /** Chips, betting circles and the active-hand outline follow the model at once. */
  private dressTable() {
    const { playerZ, hands, width } = this.layout,
      model = this.model,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2;
    this.chips.clear();
    this.rings.clear();
    const spots = model.hands.length
      ? model.hands.map((hand, h) => ({ x: hands[count][h], bet: hand.bet }))
      : [{ x: 0, bet: model.stake }];
    for (const { x, bet } of spots) {
      const z = playerZ + 1.95;
      const ring = new T.Mesh(this.ringGeometry, this.ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(model.hands.length === 2 ? 1.25 : 1.5);
      ring.position.set(x, 0.005, z);
      this.rings.add(ring);
      // Largest chips first, at most six to a column.
      let rest = bet,
        placed = 0;
      for (const [kind, chip] of CHIPS.entries())
        while (rest >= chip.value) {
          rest -= chip.value;
          const mesh = new T.Mesh(this.chipGeometry, this.chipMaterials[kind]);
          const column = Math.floor(placed / 6),
            columns = Math.ceil(this.chipCount(bet) / 6);
          mesh.position.set(
            x + (column - (columns - 1) / 2) * 0.52,
            0.035 + (placed % 6) * 0.062,
            z,
          );
          mesh.rotation.y = Math.PI / 2;
          mesh.castShadow = true;
          this.chips.add(mesh);
          placed++;
        }
    }
    const active = model.hands.findIndex((h) => h.active);
    this.glow.visible = active >= 0;
    if (active >= 0) {
      const n = model.hands[active].cards.length,
        gap = n > 1 ? Math.min(CARD_W * 0.62, (width[count] - CARD_W) / (n - 1)) : 0;
      this.glow.scale.set((CARD_W + gap * (n - 1)) * 1.32 + 0.5, CARD_H * 1.75, 1);
      this.glow.position.set(hands[count][active], 0.006, playerZ);
    }
  }
  private chipCount(bet: number) {
    let rest = bet,
      n = 0;
    for (const chip of CHIPS) {
      n += Math.floor(rest / chip.value);
      rest %= chip.value;
    }
    return n;
  }
  /** Totals and results appear only once the cards they describe have landed. */
  private showPlaques(current: boolean) {
    this.plaques.clear();
    if (!current) return;
    const { dealerZ, playerZ, hands } = this.layout,
      model = this.model,
      count = (model.hands.length === 2 ? 2 : 1) as 1 | 2;
    const add = (text: string, tone: Tone, x: number, z: number) => {
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
      mesh.scale.setScalar(model.hands.length === 2 && this.layout === LAYOUTS.tall ? 0.72 : 1);
      mesh.position.set(x, 0.008, z);
      this.plaques.add(mesh);
    };
    add(model.dealerLabel, "neutral", 0, dealerZ - CARD_H / 2 - 0.3);
    model.hands.forEach((hand, h) =>
      add(hand.label, hand.tone, hands[count][h], playerZ + CARD_H / 2 + 0.3),
    );
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
