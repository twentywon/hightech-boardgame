import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { block } from "../../engine/scene-utils";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { VALET_SUBJECT } from "./layout";
import { ANGRY, BUMP, END, parkedMove, returnedMove, type State } from "./rules";
import { ANGRY_FINE, BUMP_FINE, CAR_L, CAR_W, DT, MAX_STEER, SHIFT, TIDY, V_MOST, alight, board, canAlight, createWorld, freeBays, jobs, reachable, standing, step, type Car, type Happening, type Input, type Lot, type World } from "./sim";

export const VALET_COLORS: [string, string] = ["#e8452e", "#2f62c0"];
/**
 * The lot is drawn a little to the right of the table's middle, so that the street outside its entrance is in view;
 * less so on a wide, low screen (a phone on its side), where the lever and the pedals at the lower corners would lie
 * over its bays.
 */
const offset = (aspect: number) => (aspect > 1.9 ? 0.7 : 2.6);
const PAINTS = ["#d43a2f", "#2f62c0", "#f2f2ee", "#22262c", "#e0a52a", "#2f8a5a", "#8a8f98"];
const mod = (a: number, b: number) => ((a % b) + b) % b;
/** How long the customer's word (the bay's number) stays over the car once the valet is in, in seconds. */
const SAYING = 3.2;
/** Seconds as m:ss. */
export const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const won = (units: number) => `${(units * 100).toLocaleString("ko-KR")}원`;
interface CarModel {
  root: T.Group;
  front: T.Group[];
  wheels: T.Mesh[];
  brake: T.MeshStandardMaterial;
  back: T.MeshStandardMaterial;
  dents: T.Mesh[];
  spin: number;
}
/** A bubble drawn on a little canvas, over something in the lot. */
interface Bubble {
  sprite: T.Sprite;
  canvas: HTMLCanvasElement;
  texture: T.CanvasTexture;
  said: string;
}
interface Customer {
  root: T.Group;
  sprite: T.Sprite;
  canvas: HTMLCanvasElement;
  texture: T.CanvasTexture;
  said: string;
  shirt: T.MeshStandardMaterial;
}

/**
 * Valet parking (주차 요원): a car park seen from above at an angle (asphalt with painted, numbered bays, kerbs, a booth
 * by the entrance on the left with its barrier, the way out on the right), customers' cars that queue in the street
 * outside, the valet I walk about, and the one car I drive. The view runs the lot in real time (see `sim.ts`) and
 * reports the pay, the fines and the shift's end as moves; the money, the clock, the customers' patience, the gear and
 * the controls (a lever at the lower left; 탑승·하차 and the pedals at the lower right) stand over the canvas.
 */
export class ValetView extends TableView<State> {
  private world: World;
  private root = new T.Group();
  private lot = new T.Group();
  private built = 0;
  private cars = new Map<number, CarModel>();
  private customers: Customer[] = [];
  private valet!: T.Group;
  private feet!: T.Mesh;
  private halo!: T.Mesh;
  private haloGlow!: T.MeshBasicMaterial;
  /** The customer's word over the car just taken (its bay's number), and the badge with the number over that bay. */
  private bubble!: Bubble;
  private badge!: Bubble;
  private saying = { car: -1, until: 0, text: "" };
  private glows: T.MeshBasicMaterial[] = [];
  private exitGlow!: T.MeshBasicMaterial;
  private arrow!: T.Mesh;
  private pointer!: T.Group;
  private arms: { pivot: T.Group; open: number }[] = [];
  private hud: HTMLElement;
  private moneyText: HTMLElement;
  private clockText: HTMLElement;
  private jobList: HTMLElement;
  private gearText: HTMLElement;
  private word: HTMLElement;
  private pad: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private act: HTMLButtonElement;
  private keys = { up: false, down: false, left: false, right: false, hand: false };
  private held = { up: false, down: false };
  /** The lever's lean: x to the right, y down the screen, each -1 to 1. */
  private lever = { x: 0, y: 0 };
  private clock = 0;
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private kit: { [name: string]: T.BufferGeometry | T.Material } = {};
  private said = { jobs: "", money: "" };
  /** The sounds of the lot (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#8fb4d8");
    this.world = createWorld(1, Math.floor(cryptoRandom() * 2e9));
    this.camera.far = 260;
    this.camera.updateProjectionMatrix();
    this.scene.add(new T.HemisphereLight("#eaf3ff", "#5a6a4a", 1.7));
    const sun = new T.DirectionalLight("#fff1d6", 2.2);
    sun.position.set(-10, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, near: 1, far: 70 });
    sun.shadow.normalBias = 0.03;
    sun.shadow.bias = -0.0005;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.root.position.x = offset(this.camera.aspect);
    this.scene.add(this.root);
    this.root.add(this.lot);
    this.makeKit();
    this.grounds();
    this.markers();
    this.valet = this.person("#e8452e", true);
    // (A little larger than life, to be followed at a glance on a phone.)
    this.valet.scale.setScalar(1.2);
    // A ring at the valet's feet, so that it is found at a glance.
    this.feet = new T.Mesh(this.own(new T.RingGeometry(0.42, 0.6, 28)), this.own(new T.MeshBasicMaterial({ color: "#ffe14a", transparent: true, opacity: 0.85, depthWrite: false })));
    this.feet.rotation.x = -Math.PI / 2;
    this.feet.position.y = 0.03;
    this.valet.add(this.feet);
    this.root.add(this.valet);
    // The money at the top left, the clock at the top right, the customers who wait in a row at the top, the words of
    // what has just happened in the middle (decoration over the canvas: the status line tells the money too).
    this.hud = document.createElement("div");
    this.hud.className = "vp-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.hud.innerHTML = `<span class="vp-money"></span><span class="vp-clock"></span><div class="vp-jobs"></div><span class="vp-word"></span>`;
    this.moneyText = this.hud.querySelector(".vp-money")!;
    this.clockText = this.hud.querySelector(".vp-clock")!;
    this.jobList = this.hud.querySelector(".vp-jobs")!;
    this.word = this.hud.querySelector(".vp-word")!;
    host.append(this.hud);
    // The controls on the screen, for a thumb at each lower corner (held with several fingers at once): the lever at the
    // lower left (on foot it leads the valet, at the wheel it steers), and at the lower right the 탑승·하차 button with
    // the pedals under it while driving (the same as ↑ and ↓).
    this.pad = document.createElement("div");
    this.pad.className = "vp-pad";
    this.pad.innerHTML =
      `<div class="vp-stick" role="slider" aria-label="레버" aria-valuetext="가운데"><i class="vp-ways"><b>◀</b><b>▶</b></i><span class="vp-knob"></span></div>` +
      `<div class="vp-side"><span class="vp-gear"></span><button type="button" class="vp-act" aria-label="탑승"><em>탑승</em><small>E</small></button>` +
      `<button type="button" class="vp-pedal vp-back" data-act="down" aria-label="후진·브레이크"><em>후진</em></button><button type="button" class="vp-pedal vp-go" data-act="up" aria-label="가속"><em>가속</em></button></div>`;
    host.append(this.pad);
    this.gearText = this.pad.querySelector(".vp-gear")!;
    this.stick = this.pad.querySelector(".vp-stick")!;
    this.knob = this.pad.querySelector(".vp-knob")!;
    this.act = this.pad.querySelector(".vp-act")!;
    this.controls();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  protected photographic() {
    return false;
  }
  /** Shapes and stuff shared by every car and figure. */
  private makeKit() {
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.kit = {
      wheel: keep(new T.CylinderGeometry(0.33, 0.33, 0.24, 16)),
      hub: keep(new T.CylinderGeometry(0.17, 0.17, 0.25, 10)),
      lamp: keep(new T.BoxGeometry(0.08, 0.14, 0.34)),
      dent: keep(new T.BoxGeometry(0.5, 0.05, 0.36)),
      tyre: keep(new T.MeshStandardMaterial({ color: "#17181b", roughness: 0.9 })),
      rim: keep(new T.MeshStandardMaterial({ color: "#c9ccd2", roughness: 0.35, metalness: 0.7 })),
      glass: keep(new T.MeshStandardMaterial({ color: "#1d2a36", roughness: 0.15, metalness: 0.4 })),
      head: keep(new T.MeshStandardMaterial({ color: "#fff6c8", emissive: "#ffe9a0", emissiveIntensity: 0.6 })),
      scratch: keep(new T.MeshStandardMaterial({ color: "#2a2623", roughness: 1 })),
      skin: keep(new T.MeshStandardMaterial({ color: "#f0c8a4", roughness: 0.8 })),
      trousers: keep(new T.MeshStandardMaterial({ color: "#2b3140", roughness: 0.8 })),
      torso: keep(new T.CylinderGeometry(0.26, 0.3, 0.8, 12)),
      legs: keep(new T.BoxGeometry(0.4, 0.62, 0.3)),
      face: keep(new T.SphereGeometry(0.24, 14, 10)),
      cap: keep(new T.CylinderGeometry(0.25, 0.26, 0.12, 12)),
    };
  }
  /** What lies round every lot: the grass, the street outside the entrance and the road the exit leads to. */
  private grounds() {
    const grass = this.standard({ color: "#6a9550", roughness: 1 }),
      road = this.standard({ color: "#44474d", roughness: 0.95 }),
      walk = this.standard({ color: "#b9b5ab", roughness: 0.9 });
    const flat = (w: number, d: number, x: number, z: number, y: number, m: T.Material) => {
      const mesh = new T.Mesh(this.own(new T.PlaneGeometry(w, d)), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      return mesh;
    };
    flat(160, 120, 0, 0, -0.04, grass);
    // The street runs past the entrance; cars turn in from it.
    flat(9, 120, -16 - 5.2, 0, -0.02, road);
    flat(1.4, 120, -16 - 0.3, 0, -0.012, walk);
    flat(30, 7.4, 16 + 15, 0, -0.02, road);
    const dash = this.standard({ color: "#e8e4d2", roughness: 0.8 });
    for (let k = -8; k <= 8; k++) flat(0.16, 2.2, -16 - 5.2, k * 5, -0.012, dash);
  }
  /** What shows where to go: a glow on each free bay and on the exit, an arrow bobbing over the place, a pointer on the ground before the car. */
  private markers() {
    this.arrow = new T.Mesh(this.own(new T.ConeGeometry(0.55, 1.3, 4)), this.own(new T.MeshBasicMaterial({ color: "#ffe14a" })));
    this.arrow.rotation.x = Math.PI;
    this.root.add(this.arrow);
    this.pointer = new T.Group();
    const tip = new T.Mesh(this.own(new T.ConeGeometry(0.34, 0.9, 3)), this.own(new T.MeshBasicMaterial({ color: "#ffe14a", transparent: true, opacity: 0.9 })));
    // Flat on the asphalt ahead of the car (so that it is never mistaken for a mark on the car parked beside).
    tip.rotation.z = -Math.PI / 2;
    tip.scale.set(0.1, 1.3, 1.7);
    tip.position.x = 3.3;
    this.pointer.add(tip);
    this.root.add(this.pointer);
    // A glowing frame on the ground round the car the valet may get into now.
    const frame = this.own(
      this.painted(256, 128, (pen) => {
        pen.strokeStyle = "#ffe14a";
        pen.shadowColor = "#ffe14a";
        pen.shadowBlur = 14;
        pen.lineWidth = 10;
        pen.beginPath();
        pen.roundRect(14, 14, 228, 100, 22);
        pen.stroke();
      }),
    );
    this.haloGlow = this.own(new T.MeshBasicMaterial({ map: frame, transparent: true, opacity: 0, depthWrite: false }));
    this.halo = new T.Mesh(this.own(new T.PlaneGeometry(CAR_L + 1.4, CAR_W + 1.2)), this.haloGlow);
    this.halo.rotation.x = -Math.PI / 2;
    this.root.add(this.halo);
    this.bubble = this.sign(512, 200, 5.6, 2.2);
    this.badge = this.sign(128, 128, 1.7, 1.7);
  }
  /** A bubble (or a badge) on a canvas of its own, drawn when it has something new to say. */
  private sign(w: number, h: number, sw: number, sh: number): Bubble {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(this.own(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true })));
    sprite.scale.set(sw, sh, 1);
    sprite.renderOrder = 6;
    sprite.visible = false;
    this.root.add(sprite);
    return { sprite, canvas, texture, said: "" };
  }
  /** The customer's word over the car: the bay's number big, and what to do with it under. */
  private drawBubble(big: string, small: string) {
    const b = this.bubble,
      said = `${big}|${small}`;
    if (b.said === said) return;
    b.said = said;
    const pen = b.canvas.getContext("2d")!,
      [w, h] = [b.canvas.width, b.canvas.height];
    pen.clearRect(0, 0, w, h);
    pen.fillStyle = "#ffffff";
    pen.strokeStyle = "#1c2430";
    pen.lineWidth = 7;
    pen.beginPath();
    pen.roundRect(8, 8, w - 16, h - 46, 34);
    pen.moveTo(w / 2 - 26, h - 40);
    pen.lineTo(w / 2, h - 6);
    pen.lineTo(w / 2 + 26, h - 40);
    pen.fill();
    pen.beginPath();
    pen.roundRect(8, 8, w - 16, h - 46, 34);
    pen.stroke();
    pen.fillStyle = "#ffffff";
    pen.fillRect(w / 2 - 22, h - 44, 44, 8);
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillStyle = "#d4302a";
    pen.font = "900 78px 'Noto Sans KR', Inter, sans-serif";
    pen.fillText(big, w / 2, 62);
    pen.fillStyle = "#1c2430";
    pen.font = "800 34px 'Noto Sans KR', Inter, sans-serif";
    pen.fillText(small, w / 2, 124);
    b.texture.needsUpdate = true;
  }
  /** The badge with the named bay's number over that bay. */
  private drawBadge(n: number) {
    const b = this.badge,
      said = String(n);
    if (b.said === said) return;
    b.said = said;
    const pen = b.canvas.getContext("2d")!;
    pen.clearRect(0, 0, 128, 128);
    pen.fillStyle = "#ffe14a";
    pen.strokeStyle = "#1c2430";
    pen.lineWidth = 7;
    pen.beginPath();
    pen.arc(64, 64, 56, 0, Math.PI * 2);
    pen.fill();
    pen.stroke();
    pen.fillStyle = "#1c2430";
    pen.font = `900 ${n >= 10 ? 58 : 70}px Inter, Arial, sans-serif`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText(said, 64, 68);
    b.texture.needsUpdate = true;
  }
  /** A picture drawn on a little canvas, as a texture. */
  private painted(w: number, h: number, draw: (pen: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d")!);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  /** The lot laid before goes, with everything of its own. */
  private clearLot() {
    this.lot.traverse((o) => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        (m as T.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.lot.clear();
    this.glows = [];
    this.arms = [];
  }
  /** Lays the lot of the stage: asphalt, bays with their lines and numbers, kerbs, the booth, planters, pillars, lamps, barriers. */
  private build(lot: Lot, stage: number) {
    this.clearLot();
    this.built = stage;
    const add = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, shadow = true) => {
      const mesh = new T.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.lot.add(mesh);
      return mesh;
    };
    const std = (o: T.MeshStandardMaterialParameters) => new T.MeshStandardMaterial({ roughness: 0.85, ...o }),
      flat = (w: number, d: number, m: T.Material, x: number, z: number, y = 0.012, turn = 0) => {
        const mesh = add(new T.PlaneGeometry(w, d), m, x, y, z, false);
        mesh.rotation.set(-Math.PI / 2, 0, turn);
        return mesh;
      };
    const w = lot.maxX - lot.minX,
      d = lot.maxZ - lot.minZ,
      cz = (lot.maxZ + lot.minZ) / 2;
    // Asphalt, speckled like the real thing; darker on the underground lot.
    const speckle = this.painted(256, 256, (pen) => {
      pen.fillStyle = stage === 3 ? "#4b4e55" : "#54585f";
      pen.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 2600; k++) {
        pen.fillStyle = `rgba(${k % 2 ? "255,255,255" : "0,0,0"},${0.04 + Math.random() * 0.07})`;
        pen.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    });
    speckle.wrapS = speckle.wrapT = T.RepeatWrapping;
    speckle.repeat.set(w / 8, d / 8);
    flat(w, d, std({ map: speckle, roughness: 0.95 }), 0, cz, 0);
    // The bays: white lines, a number at the aisle's end, and a glow shown while the bay is where to go.
    const white = std({ color: "#f1efe6", roughness: 0.7 });
    lot.bays.forEach((bay) => {
      const group = new T.Group();
      group.position.set(bay.x, 0, bay.z);
      group.rotation.y = -bay.angle;
      this.lot.add(group);
      const line = (len: number, x: number, z: number, turn: number) => {
        const mesh = new T.Mesh(new T.PlaneGeometry(len, 0.12), white);
        mesh.rotation.set(-Math.PI / 2, 0, turn);
        mesh.position.set(x, 0.014, z);
        mesh.receiveShadow = true;
        group.add(mesh);
      };
      // Into the bay: away from the aisle (a bay along the wall is boxed on every side).
      const along = bay.angle === 0,
        into = Math.sin(bay.angle) * bay.z >= 0 ? 1 : -1;
      for (const s of [-1, 1]) line(bay.l, 0, (s * bay.w) / 2, 0);
      for (const s of along ? [-1, 1] : [into]) line(bay.w, (s * bay.l) / 2, 0, Math.PI / 2);
      const glow = new T.MeshBasicMaterial({ color: "#4be08a", transparent: true, opacity: 0, depthWrite: false });
      const pad = new T.Mesh(new T.PlaneGeometry(bay.l - 0.3, bay.w - 0.3), glow);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.02;
      group.add(pad);
      this.glows.push(glow);
      const number = this.painted(64, 64, (pen) => {
        pen.fillStyle = "#f6f3e6";
        pen.font = "800 44px Inter, Arial, sans-serif";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(String(bay.n), 32, 35);
      });
      const out = along ? 0 : -into * (bay.l / 2 - 0.75);
      flat(1.1, 1.1, new T.MeshBasicMaterial({ map: number, transparent: true, depthWrite: false, opacity: 0.85 }), bay.x + Math.cos(bay.angle) * out, bay.z + Math.sin(bay.angle) * out, 0.016);
    });
    // The entrance and the exit, written on the asphalt; the exit hatched in yellow.
    const sign = (text: string, colour: string, hatch: boolean) =>
      this.painted(256, 256, (pen) => {
        if (hatch) {
          pen.strokeStyle = "rgba(255,196,46,0.75)";
          pen.lineWidth = 10;
          for (let k = -256; k < 512; k += 44) {
            pen.beginPath();
            pen.moveTo(k, 0);
            pen.lineTo(k + 256, 256);
            pen.stroke();
          }
          pen.strokeRect(5, 5, 246, 246);
        }
        pen.fillStyle = colour;
        pen.font = "900 84px 'Noto Sans KR', Inter, sans-serif";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(text, 128, 132);
      });
    flat(lot.exit.hx * 2, lot.exit.hz * 2, new T.MeshBasicMaterial({ map: sign("출구", "#ffe9a8", true), transparent: true, depthWrite: false }), lot.exit.x, lot.exit.z, 0.015);
    this.exitGlow = new T.MeshBasicMaterial({ color: "#ffb02e", transparent: true, opacity: 0, depthWrite: false });
    flat(lot.exit.hx * 2, lot.exit.hz * 2, this.exitGlow, lot.exit.x, lot.exit.z, 0.02);
    flat(4.4, 4.4, new T.MeshBasicMaterial({ map: sign("입구", "#f1efe6", false), transparent: true, depthWrite: false, opacity: 0.8 }), lot.entrance.x, lot.entrance.z, 0.015);
    // Kerbs round the lot, open at the entrance and the exit.
    const kerb = std({ color: "#c9c5ba", roughness: 0.8 }),
      wall = (x0: number, z0: number, x1: number, z1: number) => add(block(Math.abs(x1 - x0) + 0.36, 0.28, Math.abs(z1 - z0) + 0.36, 0.05), kerb, (x0 + x1) / 2, 0.14, (z0 + z1) / 2);
    wall(lot.minX, lot.minZ - 0.18, lot.maxX, lot.minZ - 0.18);
    wall(lot.minX, lot.maxZ + 0.18, lot.maxX, lot.maxZ + 0.18);
    for (const s of [-1, 1]) {
      wall(lot.minX - 0.18, s * 2.7, lot.minX - 0.18, s === 1 ? lot.maxZ : lot.minZ);
      wall(lot.maxX + 0.18, s * (lot.exit.hz + 0.2), lot.maxX + 0.18, s === 1 ? lot.maxZ : lot.minZ);
    }
    // The booth by the entrance (the first block), planters (the others), and the pillars.
    const [booth, ...planters] = lot.blocks;
    add(block(booth.hx * 2, 2.5, booth.hz * 2, 0.08), std({ color: "#f3efe4" }), booth.x, 1.25, booth.z);
    add(block(booth.hx * 2 + 0.5, 0.22, booth.hz * 2 + 0.5, 0.06), std({ color: "#e8452e" }), booth.x, 2.6, booth.z);
    add(new T.BoxGeometry(booth.hx * 1.5, 0.9, 0.06), std({ color: "#22313f", roughness: 0.2, metalness: 0.3 }), booth.x, 1.55, booth.z + booth.hz + 0.02, false);
    const board = this.painted(256, 64, (pen) => {
      pen.fillStyle = "#e8452e";
      pen.fillRect(0, 0, 256, 64);
      pen.fillStyle = "#fff";
      pen.font = "900 40px 'Noto Sans KR', Inter, sans-serif";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillText("발레파킹", 128, 34);
    });
    const name = add(new T.PlaneGeometry(3, 0.75), new T.MeshBasicMaterial({ map: board }), booth.x, 3.15, booth.z + booth.hz, false);
    name.rotation.x = -0.5;
    for (const p of planters) {
      add(block(p.hx * 2, 0.5, p.hz * 2, 0.06), std({ color: "#8d6a4a" }), p.x, 0.25, p.z);
      for (let k = 0; k < 4; k++) add(new T.SphereGeometry(0.62, 10, 8), std({ color: k % 2 ? "#3f8a4a" : "#4f9a52", roughness: 1 }), p.x - p.hx + 0.6 + k * ((p.hx * 2 - 1.2) / 3), 0.85, p.z + (k % 2 ? 0.12 : -0.12));
    }
    const concrete = std({ color: "#c2c4c8", roughness: 0.7 }),
      stripe = std({ color: "#f2c230", roughness: 0.6 });
    for (const p of lot.pillars) {
      add(new T.CylinderGeometry(p.r, p.r, 2.6, 16), concrete, p.x, 1.3, p.z);
      add(new T.CylinderGeometry(p.r + 0.02, p.r + 0.02, 0.5, 16), stripe, p.x, 0.5, p.z, false);
    }
    // Lamp posts along the back, and a barrier at each gate that lifts as a car goes through.
    const steel = std({ color: "#5a5f66", roughness: 0.4, metalness: 0.6 }),
      bulb = new T.MeshStandardMaterial({ color: "#fff6d8", emissive: "#ffe9a8", emissiveIntensity: 0.9 });
    for (const x of [-9, 0, 9]) {
      add(new T.CylinderGeometry(0.07, 0.09, 4.2, 8), steel, x, 2.1, lot.minZ - 0.7);
      add(new T.BoxGeometry(0.9, 0.12, 0.3), steel, x, 4.2, lot.minZ - 0.35, false);
      add(new T.SphereGeometry(0.16, 10, 8), bulb, x, 4.1, lot.minZ - 0.05, false);
    }
    const bar = std({ color: "#f4f1e8" }),
      red = std({ color: "#d4302a" });
    for (const [x, half] of [
      [lot.minX - 0.2, 2.5],
      [lot.maxX + 0.2, lot.exit.hz],
    ]) {
      add(block(0.5, 1.1, 0.5, 0.05), std({ color: "#e8452e" }), x, 0.55, -half - 0.1);
      const pivot = new T.Group();
      pivot.position.set(x, 1, -half - 0.1);
      this.lot.add(pivot);
      for (let k = 0; k < 6; k++) {
        const piece = new T.Mesh(new T.BoxGeometry(0.1, 0.14, (half * 2) / 6), k % 2 ? red : bar);
        piece.position.z = (half * 2 * (k + 0.5)) / 6;
        piece.castShadow = true;
        pivot.add(piece);
      }
      this.arms.push({ pivot, open: 0 });
    }
  }
  /** A little person: legs, a body in `colour`, a head; the valet wears a cap. */
  private person(colour: string, cap = false) {
    const k = this.kit,
      g = new T.Group(),
      shirt = this.standard({ color: colour, roughness: 0.7 });
    const legs = new T.Mesh(k.legs as T.BufferGeometry, k.trousers as T.Material);
    legs.position.y = 0.31;
    const torso = new T.Mesh(k.torso as T.BufferGeometry, shirt);
    torso.position.y = 1;
    const head = new T.Mesh(k.face as T.BufferGeometry, k.skin as T.Material);
    head.position.y = 1.62;
    g.add(legs, torso, head);
    if (cap) {
      const hat = new T.Mesh(k.cap as T.BufferGeometry, shirt);
      hat.position.y = 1.86;
      g.add(hat);
    }
    g.traverse((o) => (o.castShadow = true));
    g.userData.shirt = shirt;
    return g;
  }
  /** A customer at the booth: a figure and a bubble over it that says what it wants and how patient it still is. */
  private customer(): Customer {
    const root = this.person("#888"),
      canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 96;
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.set(2.4, 1.44, 1);
    sprite.position.y = 2.85;
    sprite.renderOrder = 5;
    root.add(sprite);
    this.root.add(root);
    return { root, sprite, canvas, texture, said: "", shirt: root.userData.shirt };
  }
  /** A car of a body style and colour: body, cabin, wheels (the front ones steer), lamps, and dents that show once it is bumped. */
  private car(car: Car): CarModel {
    const k = this.kit,
      root = new T.Group(),
      paint = this.standard({ color: PAINTS[car.colour % PAINTS.length], roughness: 0.35, metalness: 0.25 }),
      put = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, shadow = true) => {
        const mesh = new T.Mesh(g, m);
        mesh.position.set(x, y, z);
        mesh.castShadow = shadow;
        root.add(mesh);
        return mesh;
      };
    // The styles: a saloon, a hatchback with a taller cabin to the tail, and a van.
    const [cabL, cabX, cabH] = [
      [2.0, -0.25, 0.5],
      [2.5, -0.5, 0.56],
      [3.3, -0.3, 0.78],
    ][car.style % 3];
    put(this.own(block(CAR_L, 0.52, CAR_W, 0.12)), paint, 0, 0.56, 0);
    put(this.own(block(cabL, cabH, CAR_W - 0.22, 0.14)), k.glass as T.Material, cabX, 0.8 + cabH / 2, 0);
    put(this.own(block(cabL - 0.3, 0.08, CAR_W - 0.3, 0.03)), paint, cabX, 0.82 + cabH, 0, false);
    const front: T.Group[] = [],
      wheels: T.Mesh[] = [];
    for (const x of [1.3, -1.3])
      for (const z of [-0.84, 0.84]) {
        const pivot = new T.Group();
        pivot.position.set(x, 0.33, z);
        const wheel = new T.Mesh(k.wheel as T.BufferGeometry, k.tyre as T.Material);
        wheel.rotation.x = Math.PI / 2;
        const hub = new T.Mesh(k.hub as T.BufferGeometry, k.rim as T.Material);
        hub.rotation.x = Math.PI / 2;
        pivot.add(wheel, hub);
        root.add(pivot);
        wheels.push(wheel);
        if (x > 0) front.push(pivot);
      }
    const brake = this.standard({ color: "#7a1612", emissive: "#ff2a1a", emissiveIntensity: 0.15 }),
      back = this.standard({ color: "#8a8a86", emissive: "#ffffff", emissiveIntensity: 0 });
    for (const z of [-0.6, 0.6]) {
      put(k.lamp as T.BufferGeometry, k.head as T.Material, CAR_L / 2 - 0.02, 0.62, z, false);
      put(k.lamp as T.BufferGeometry, brake, -CAR_L / 2 + 0.02, 0.66, z, false);
      put(k.lamp as T.BufferGeometry, back, -CAR_L / 2 + 0.02, 0.66, z * 0.45, false).scale.z = 0.5;
    }
    // Dents: dark scrapes on the bonnet and the corners, hidden until it is bumped.
    const dents = [
      [1.75, 0.83, 0.5],
      [1.6, 0.83, -0.55],
      [-1.75, 0.83, 0.3],
    ].map(([x, y, z]) => {
      const mesh = put(k.dent as T.BufferGeometry, k.scratch as T.Material, x, y, z, false);
      mesh.rotation.y = x * 0.4;
      mesh.visible = false;
      return mesh;
    });
    this.root.add(root);
    return { root, front, wheels, brake, back, dents, spin: 0 };
  }
  private controls() {
    const el = this.renderer.domElement;
    noZoom(el);
    const capture = (target: HTMLElement, e: PointerEvent) => {
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // A pointer the page cannot capture (it is held without).
      }
    };
    // The pedals: held while a finger is on them.
    const fingers = new Map<number, keyof ValetView["held"]>();
    const mark = () => {
      const on = [...fingers.values()];
      this.held = { up: on.includes("up"), down: on.includes("down") };
      for (const b of this.pad.querySelectorAll<HTMLElement>("[data-act]")) b.classList.toggle("on", on.includes(b.dataset.act as keyof ValetView["held"]));
    };
    // The lever: a finger put down on it and moved leans it that way, as far as its rim; let go, it stands up again.
    let leaning = -1;
    const lean = (e: PointerEvent) => {
      const box = this.stick.getBoundingClientRect(),
        reach = box.width * 0.36,
        dx = (e.clientX - (box.x + box.width / 2)) / reach,
        dy = (e.clientY - (box.y + box.height / 2)) / reach,
        far = Math.hypot(dx, dy),
        k = far > 1 ? 1 / far : 1;
      this.lever = { x: dx * k, y: dy * k };
      this.leverShown();
    };
    this.pad.addEventListener("pointerdown", (e) => {
      if (this.disposed || (e.pointerType === "mouse" && e.button !== 0)) return;
      const target = e.target as HTMLElement;
      if (target.closest(".vp-stick")) {
        e.preventDefault();
        capture(this.stick, e);
        leaning = e.pointerId;
        this.stick.classList.add("on");
        lean(e);
        return;
      }
      if (target.closest(".vp-act")) {
        e.preventDefault();
        this.use();
        return;
      }
      const button = target.closest<HTMLElement>("[data-act]");
      if (!button) return;
      e.preventDefault();
      capture(button, e);
      fingers.set(e.pointerId, button.dataset.act as keyof ValetView["held"]);
      mark();
    });
    this.pad.addEventListener("pointermove", (e) => {
      if (e.pointerId === leaning) lean(e);
    });
    const lift = (e: PointerEvent) => {
      if (e.pointerId === leaning) {
        leaning = -1;
        this.lever = { x: 0, y: 0 };
        this.stick.classList.remove("on");
        this.leverShown();
      }
      if (fingers.delete(e.pointerId)) mark();
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) this.pad.addEventListener(type, lift);
    this.pad.addEventListener("contextmenu", (e) => e.preventDefault());
    this.pad.addEventListener("touchstart", (e) => e.cancelable && e.preventDefault(), { passive: false });
    // A click without a pointer before it (the keyboard's Enter or Space on the focused button).
    this.act.addEventListener("click", (e) => {
      if (e.detail === 0) this.use();
    });
    const KEYS: Record<string, keyof ValetView["keys"]> = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", " ": "hand" };
    const key = (down: boolean) => (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // E (or Enter): 탑승 on foot, 하차 at the wheel.
      if (e.key === "e" || e.key === "E" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (down && !e.repeat) this.use();
        return;
      }
      const which = KEYS[e.key];
      if (!which) return;
      e.preventDefault();
      e.stopPropagation();
      this.keys[which] = down;
    };
    el.addEventListener("keydown", key(true));
    el.addEventListener("keyup", key(false));
    el.addEventListener("blur", () => (this.keys = { up: false, down: false, left: false, right: false, hand: false }));
  }
  /** The lever's knob where it leans (only sideways at the wheel, where it steers). */
  private leverShown() {
    const driving = this.world.hand >= 0,
      { x, y } = this.lever,
      box = this.stick.getBoundingClientRect(),
      reach = (box.width || 120) * 0.36;
    this.knob.style.transform = `translate(${(x * reach).toFixed(1)}px, ${(driving ? 0 : y * reach).toFixed(1)}px)`;
  }
  /** 탑승 or 하차 (the button, E or Enter): into the car next to the valet, or out of the car in hand. */
  private use() {
    if (!this.running()) return;
    const w = this.world;
    if (w.hand < 0) {
      const events = board(w);
      if (!events.length) this.say(jobs(w).length ? "타려는 차 옆으로 가세요" : "손님을 기다려요", "#ffffff");
      this.report(events);
    } else {
      const events = alight(w);
      if (!events.length) this.say("차를 먼저 세우세요", "#ffffff");
      this.report(events);
    }
    // Getting in or out lets go of what was held: the car does not lurch, nor the valet run off.
    this.keys = { up: false, down: false, left: false, right: false, hand: false };
    this.leverShown();
  }
  /** What the keys and the controls on the screen hold: the valet's way on foot, or the car's controls at the wheel. */
  private input(): Input {
    const up = this.keys.up || this.held.up,
      down = this.keys.down || this.held.down,
      left = this.keys.left,
      right = this.keys.right,
      sideways = left === right ? 0 : right ? 1 : -1;
    if (this.world.hand < 0) {
      // On foot: the arrows (or WASD) or the lever, the way they lead on the screen (up the screen is into the lot).
      const kx = sideways,
        kz = this.keys.up === this.keys.down ? 0 : this.keys.down ? 1 : -1,
        far = Math.hypot(kx, kz);
      if (far > 0) return { gas: 0, steer: 0, handbrake: false, walkX: kx / far, walkZ: kz / far };
      const lean = Math.hypot(this.lever.x, this.lever.y);
      return lean > 0.15 ? { gas: 0, steer: 0, handbrake: false, walkX: this.lever.x, walkZ: this.lever.y } : { gas: 0, steer: 0, handbrake: false };
    }
    const steer = sideways !== 0 ? sideways : Math.abs(this.lever.x) > 0.12 ? Math.max(-1, Math.min(1, (this.lever.x - Math.sign(this.lever.x) * 0.12) / 0.7)) : 0;
    return { gas: up === down ? 0 : up ? 1 : -1, steer, handbrake: this.keys.hand };
  }
  protected subject() {
    return VALET_SUBJECT;
  }
  protected layout(aspect: number) {
    // (Called from the table's own making too, before the lot is there.)
    this.root?.position.setX(offset(aspect));
  }
  /** Nothing on the lot is tapped: the valet is walked by the lever or the keys. */
  protected spots(): Spot[] {
    return [];
  }
  protected dragStart() {
    // The press is taken whole: nothing on the lot is a move of the screen's.
    return true;
  }
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.hush();
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private hush() {
    this.onKnock?.("off", 0);
    this.onKnock?.("chirp", 0);
  }
  /** Tells the screen what happened on the lot, with a word over it and its sound. */
  private report(events: Happening[]) {
    const knock = (kind: string, strength = 1) => this.onKnock?.(kind, strength),
      bayOf = (k: number) => this.world.lot.bays[k]?.n ?? 0;
    for (const e of events) {
      if (e.kind === "parked") {
        knock("pay");
        this.say(`${bayOf(e.bay)}번 칸 주차${e.tidy >= TIDY * 0.8 ? " · 깔끔!" : ""} +${won(e.pay)}`, "#9ff0b4");
        this.onMove(parkedMove(e.pay));
      } else if (e.kind === "returned") {
        knock("pay");
        this.say(`출차 완료 +${won(e.pay)}`, "#9ff0b4");
        this.onMove(returnedMove(e.pay));
      } else if (e.kind === "bump") {
        knock("bump", e.strength);
        if (e.fined) {
          this.say(`쿵! 접촉 사고 −${won(BUMP_FINE)}`, "#ff8a7a");
          this.onMove({ from: -1, to: BUMP, extra: -1 });
        }
      } else if (e.kind === "angry") {
        knock("horn");
        this.say(`${e.left ? "손님이 기다리다 떠났어요" : "손님이 화났어요"} −${won(ANGRY_FINE)}`, "#ff8a7a");
        this.onMove({ from: -1, to: ANGRY, extra: -1 });
      } else if (e.kind === "ask") {
        knock("ask");
        this.say(`${bayOf(e.bay)}번 칸 손님이 차를 찾으러 왔어요`, "#ffe14a");
      } else if (e.kind === "take") {
        knock("door");
        const car = this.world.cars.find((c) => c.id === e.car);
        // The customer's word, over the car for a moment: the bay it is to go in, or the way out.
        this.talk(e.car, car?.state === "requested" ? "출구로!" : e.bay >= 0 ? `${bayOf(e.bay)}번 칸` : "빈칸 아무 데나", car?.state === "requested" ? "차를 출구로 가져다 주세요" : "여기에 주차해 주세요");
      } else if (e.kind === "wrong") {
        knock("ask");
        if (e.at !== e.bay) {
          this.say(`여기는 ${bayOf(e.at)}번 칸! 손님은 ${e.bay >= 0 ? `${bayOf(e.bay)}번 칸` : "빈칸"}이에요`, "#ffe14a");
          if (e.bay >= 0) this.talk(e.car, `${bayOf(e.bay)}번 칸`, `${bayOf(e.at)}번 칸이 아니에요!`);
        } else this.say(`${bayOf(e.bay)}번 칸 안에 반듯하게 세우세요`, "#ffe14a");
      } else if (e.kind === "out") {
        knock("door");
        const car = this.world.cars.find((c) => c.id === e.car);
        this.say(car?.state === "requested" ? "차를 세워 두었어요 · 다시 타서 출구로" : car && car.want >= 0 ? `차를 세워 두었어요 · ${bayOf(car.want)}번 칸에 대야 해요` : "차를 세워 두었어요", "#ffffff");
      } else if (e.kind === "arrive") knock("arrive");
      else if (e.kind === "end") {
        this.hush();
        this.onMove({ from: -1, to: END, extra: -1 });
      }
      if (this.state?.winner !== null) break;
    }
  }
  /** The customer's word over car `id` for `SAYING` seconds. */
  private talk(id: number, big: string, small: string) {
    this.saying = { car: id, until: this.clock + SAYING, text: big };
    this.drawBubble(big, small);
  }
  /** A word over the lot for a moment. */
  private say(text: string, colour: string) {
    if (capturing()) return;
    this.word.textContent = text;
    this.word.style.color = colour;
    this.word.classList.remove("vp-show");
    void this.word.offsetWidth;
    this.word.classList.add("vp-show");
  }
  private advance(now: number) {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      this.left += real;
      const input = this.input();
      this.clock += real;
      while (this.left >= DT && this.state?.winner === null && !this.world.over) {
        this.left -= DT;
        this.report(step(this.world, input));
      }
    } else this.left = 0;
    this.pose(now, this.running() ? real : 0);
    this.redraw();
  }
  /** The place a queued car waits at, by its turn: just outside the barrier, then up the street. */
  private queued(lot: Lot, turn: number) {
    return turn === 0 ? { x: lot.minX - 4, z: lot.entrance.z, heading: 0 } : { x: lot.minX - 5.4, z: lot.entrance.z - 1.6 - turn * 5.4, heading: Math.PI / 2 };
  }
  /** The bay the arrow shows for the car in hand: the one its customer named, else (none named) the one it stands rightly in or the nearest free one. */
  private goal(car: Car) {
    const w = this.world,
      free = freeBays(w);
    if (car.want >= 0) return car.want;
    let best = -1,
      near = Infinity;
    for (const k of free) {
      const bay = w.lot.bays[k],
        far = standing(bay, car.x, car.z, car.heading).inside ? -1 : Math.hypot(bay.x - car.x, bay.z - car.z);
      if (far < near) [best, near] = [k, far];
    }
    return best;
  }
  /** Everything where the lot has it: cars, customers, the valet, the marks, the barriers, the words, the sounds. */
  private pose(now: number, dt: number) {
    const w = this.world,
      lot = w.lot,
      t = now / 1000,
      hand = w.hand >= 0 ? (w.cars.find((c) => c.id === w.hand) ?? null) : null,
      input = this.running() ? this.input() : { gas: 0, steer: 0, handbrake: false };
    // Cars.
    let turn = 0;
    const seen = new Set<number>();
    for (const car of w.cars) {
      if (car.state === "gone") continue;
      seen.add(car.id);
      let model = this.cars.get(car.id);
      if (!model) this.cars.set(car.id, (model = this.car(car)));
      const at = car.state === "queue" ? this.queued(lot, turn++) : car;
      model.root.position.set(at.x, 0, at.z);
      model.root.rotation.y = -at.heading;
      for (const pivot of model.front) pivot.rotation.y = -car.steer;
      model.spin += (car.v * dt) / 0.33;
      for (const wheel of model.wheels) wheel.rotation.y = -model.spin;
      const mine = car === hand,
        braking = mine && ((input.gas < 0 && car.v > 0.05) || (input.gas > 0 && car.v < -0.05) || input.handbrake);
      model.brake.emissiveIntensity = braking ? 1.6 : 0.15;
      model.back.emissiveIntensity = mine && (car.v < -0.05 || (input.gas < 0 && car.v <= 0.05)) ? 1.2 : 0;
      model.dents.forEach((d, k) => (d.visible = k < car.dents));
    }
    for (const [id, model] of this.cars)
      if (!seen.has(id)) {
        model.root.removeFromParent();
        this.cars.delete(id);
      }
    // Customers who wait, in a row before the booth, each with what it wants and its patience.
    const waiting = jobs(w),
      booth = lot.blocks[0];
    while (this.customers.length < waiting.length) this.customers.push(this.customer());
    this.customers.forEach((c, k) => {
      const car = waiting[k];
      c.root.visible = !!car;
      if (!car) return;
      // (Apart by a bubble's width, so that no bubble covers the next.)
      c.root.position.set(booth.x - booth.hx + 0.5 + k * 2.45, 0, booth.z + booth.hz + 0.9 + (k % 2) * 0.5);
      c.shirt.color.set(PAINTS[car.colour % PAINTS.length]);
      const share = Math.max(0, car.patience / car.patience0),
        text = car.state === "requested" ? `출차 ${lot.bays[car.bay]?.n ?? ""}`.trim() : car.want >= 0 ? `주차 ${lot.bays[car.want].n}` : "주차",
        said = `${text}|${Math.ceil(share * 14)}|${car.late}`;
      c.root.position.y = car.late ? Math.abs(Math.sin(t * 9)) * 0.12 : 0;
      if (said === c.said) return;
      c.said = said;
      const pen = c.canvas.getContext("2d")!;
      pen.clearRect(0, 0, 160, 96);
      pen.fillStyle = car.late ? "#ffd9d2" : "#ffffff";
      pen.beginPath();
      pen.roundRect(4, 4, 152, 70, 16);
      pen.fill();
      pen.beginPath();
      pen.moveTo(64, 72);
      pen.lineTo(80, 94);
      pen.lineTo(96, 72);
      pen.fill();
      pen.fillStyle = "#1c2430";
      pen.font = "900 32px 'Noto Sans KR', Inter, sans-serif";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillText(car.late ? `${text} 😠` : text, 80, 30, 140);
      pen.fillStyle = "#d9dde2";
      pen.fillRect(16, 52, 128, 12);
      pen.fillStyle = share > 0.5 ? "#3fb96a" : share > 0.22 ? "#f0a92e" : "#e2432f";
      pen.fillRect(16, 52, 128 * share, 12);
      c.texture.needsUpdate = true;
    });
    // The valet on foot, facing the way it goes and bobbing as it runs (in a car, it is not seen).
    const near = !hand && this.running() ? reachable(w) : null;
    this.valet.visible = !hand;
    this.valet.position.set(w.valet.x, w.valet.speed > 0.1 ? Math.abs(Math.sin(t * 14)) * 0.16 : 0, w.valet.z);
    this.valet.rotation.y = -w.valet.heading + Math.PI / 2;
    this.feet.visible = !capturing();
    // The car it may get into now glows round its feet.
    this.halo.visible = !!near;
    if (near) {
      this.halo.position.set(near.x, 0.03, near.z);
      this.halo.rotation.z = -near.heading;
      this.haloGlow.opacity = 0.75 + 0.25 * Math.sin(t * 6);
    }
    // Where to go: the bay its customer named glows (brightly once the car stands rightly in it), with its number on a
    // badge over it; the exit glows while a car asked for is in hand; an arrow bobs over the place and a pointer before
    // the car turns toward it. On foot, the arrow is over the car of the customer with the least patience left.
    const parking = !!hand && hand.state === "waiting",
      leaving = !!hand && hand.state === "requested",
      goal = parking ? this.goal(hand!) : -1,
      pulse = 0.5 + 0.5 * Math.sin(t * 5),
      free = parking ? (hand!.want >= 0 ? [hand!.want] : freeBays(w)) : [];
    this.glows.forEach((glow, k) => {
      const inside = k === goal && standing(lot.bays[k], hand!.x, hand!.z, hand!.heading).inside;
      glow.opacity = !free.includes(k) ? 0 : inside ? 0.6 + 0.3 * pulse : k === goal ? 0.3 + 0.25 * pulse : 0.12;
      glow.color.set(inside ? "#ffe14a" : "#4be08a");
    });
    this.exitGlow.opacity = leaving ? 0.18 + 0.22 * pulse : 0;
    const urgent = !hand ? (jobs(w).sort((a, b) => a.patience / a.patience0 - b.patience / b.patience0)[0] ?? null) : null,
      target = leaving ? lot.exit : goal >= 0 ? lot.bays[goal] : urgent;
    this.arrow.visible = !!target && !capturing();
    this.pointer.visible = false;
    if (target) {
      this.arrow.position.set(target.x, (urgent ? 3.4 : 3) + 0.35 * Math.sin(t * 4), target.z);
      this.arrow.rotation.y = t * 2;
    }
    if (target && hand) {
      const far = Math.hypot(target.x - hand.x, target.z - hand.z);
      this.pointer.visible = far > 6 && !capturing();
      this.pointer.position.set(hand.x, 0.07, hand.z);
      this.pointer.rotation.y = -Math.atan2(target.z - hand.z, target.x - hand.x);
    }
    const named = parking && hand!.want >= 0 ? lot.bays[hand!.want] : null;
    this.badge.sprite.visible = !!named && !capturing();
    if (named) {
      this.drawBadge(named.n);
      this.badge.sprite.position.set(named.x, 0.7, named.z);
    }
    // The customer's word over the car just taken, for a few seconds.
    const talking = !!hand && this.saying.car === hand.id && this.clock < this.saying.until;
    this.bubble.sprite.visible = talking && !capturing();
    if (talking) {
      const left = this.saying.until - this.clock,
        grow = Math.min(1, (SAYING - left) / 0.18),
        fade = Math.min(1, left / 0.35);
      this.bubble.sprite.position.set(hand!.x, 3.9, hand!.z);
      this.bubble.sprite.scale.set(5.6 * (0.7 + 0.3 * grow), 2.2 * (0.7 + 0.3 * grow), 1);
      this.bubble.sprite.material.opacity = fade;
    }
    // The barriers lift for a car going through its gate.
    const through = [w.cars.some((c) => c.state === "arriving" || (c.state === "leaving" && c.v < 0)), w.cars.some((c) => c.state === "leaving" && c.v > 0) || (leaving && hand!.x > lot.exit.x - lot.exit.hx - 3)];
    this.arms.forEach((arm, k) => {
      arm.open += ((through[k] ? 1 : 0) - arm.open) * Math.min(1, (dt || 0.016) * 6);
      arm.pivot.rotation.x = -arm.open * 1.35;
    });
    // The engine by the car's speed, the tyres' chirp when it is thrown about.
    if (this.running()) {
      const speed = hand ? Math.abs(hand.v) / V_MOST : 0;
      this.onKnock?.(!hand ? "off" : input.gas !== 0 ? "rev" : "coast", speed);
      this.onKnock?.("chirp", hand && Math.abs(hand.v) > 3.2 ? (Math.abs(hand.steer) / MAX_STEER) * speed * (input.handbrake ? 1.6 : 1) : 0);
    }
    // The money, the clock, the gear, and the customers' row over the canvas.
    const money = `수입 ${won(this.state?.money ?? 0)}|${this.state?.parked ?? 0}|${this.state?.returned ?? 0}`;
    if (money !== this.said.money) {
      this.said.money = money;
      this.moneyText.innerHTML = `수입 ${won(this.state?.money ?? 0)}<small>주차 ${this.state?.parked ?? 0} · 출차 ${this.state?.returned ?? 0}</small>`;
    }
    const leftTime = SHIFT - w.time;
    this.clockText.textContent = clock(leftTime);
    this.clockText.classList.toggle("vp-late", leftTime <= 20);
    const gear = !hand ? "" : input.handbrake ? "P" : hand.v < -0.05 || (input.gas < 0 && hand.v <= 0.05) ? "R" : hand.v > 0.05 || input.gas > 0 ? "D" : "N";
    if (this.gearText.textContent !== gear) this.gearText.textContent = gear;
    this.gearText.dataset.gear = gear;
    const list = waiting.map((c) => `${c.id}|${c.state}|${c.bay}|${c.want}|${Math.ceil((c.patience / c.patience0) * 20)}|${c.id === w.hand}|${c.late}`).join(",");
    if (list !== this.said.jobs) {
      this.said.jobs = list;
      this.jobList.innerHTML = waiting
        .map((c) => {
          const share = Math.max(0, c.patience / c.patience0);
          const what = c.state === "requested" ? (lot.bays[c.bay] ? `${lot.bays[c.bay].n}번 출차` : "출차") : c.want >= 0 ? `${lot.bays[c.want].n}번 칸 주차` : "주차";
          return `<span class="vp-job${c.id === w.hand ? " mine" : ""}${c.late ? " late" : ""}"><i style="background:${PAINTS[c.colour % PAINTS.length]}"></i><b>${what}</b><u><s style="width:${Math.round(share * 100)}%;background:${share > 0.5 ? "#3fb96a" : share > 0.22 ? "#f0a92e" : "#e2432f"}"></s></u></span>`;
        })
        .join("");
    }
    // The controls: the pedals only at the wheel; 탑승 lit next to a car the valet may take, 하차 once the car stands.
    const driving = !!hand,
      ready = driving ? canAlight(w) : !!near,
      label = driving ? "하차" : "탑승";
    if (this.pad.classList.contains("vp-driving") !== driving) {
      this.pad.classList.toggle("vp-driving", driving);
      this.leverShown();
    }
    this.act.classList.toggle("ready", ready);
    if (this.act.getAttribute("aria-label") !== label) {
      this.act.setAttribute("aria-label", label);
      this.act.querySelector("em")!.textContent = label;
    }
    const aim = this.lever.x === 0 && this.lever.y === 0 ? "가운데" : `${Math.round(this.lever.x * 100)},${Math.round(this.lever.y * 100)}`;
    if (this.stick.getAttribute("aria-valuetext") !== aim) this.stick.setAttribute("aria-valuetext", aim);
    // For browser tests: where things stand.
    const d = this.renderer.domElement.dataset;
    d.phase = this.state?.winner !== null || w.over ? "over" : hand ? "drive" : "walk";
    d.valet = `${w.valet.x.toFixed(3)},${w.valet.z.toFixed(3)}`;
    d.near = near ? String(near.id) : "";
    // The cars the valet may get into: id, place, heading, state, the share of patience left, and the bay it stands in.
    d.takes = JSON.stringify(
      waiting
        .filter((c) => c !== hand)
        .map((c) => {
          const bay = c.state === "requested" ? lot.bays[c.bay] : null;
          return [c.id, +c.x.toFixed(3), +c.z.toFixed(3), +c.heading.toFixed(4), c.state, +(c.patience / c.patience0).toFixed(3), bay ? [bay.x, bay.z, +bay.angle.toFixed(4)] : null];
        }),
    );
    // The bay the car in hand is to go in (its number, and for the driver its place), and whether the customer's word is over it.
    const want = parking ? (hand!.want >= 0 ? hand!.want : (freeBays(w)[0] ?? -1)) : -1;
    d.bay = parking && hand!.want >= 0 ? String(lot.bays[hand!.want].n) : "";
    d.want = want >= 0 ? JSON.stringify([want, lot.bays[want].x, lot.bays[want].z, +lot.bays[want].angle.toFixed(4)]) : "";
    d.said = talking ? this.saying.text : "";
    d.car = hand ? [hand.x, hand.z, hand.heading, hand.v, hand.steer].map((n) => n.toFixed(3)).join(",") : "";
    d.job = hand ? hand.state : "";
    d.from = hand?.state === "requested" && lot.bays[hand.bay] ? [lot.bays[hand.bay].x, lot.bays[hand.bay].z, lot.bays[hand.bay].angle].map((n) => n.toFixed(4)).join(",") : "";
    d.gear = gear;
    d.time = w.time.toFixed(2);
    d.money = String(this.state?.money ?? 0);
    d.counts = `${this.state?.parked ?? 0},${this.state?.returned ?? 0},${this.state?.bumps ?? 0},${this.state?.angry ?? 0}`;
    d.free = JSON.stringify(freeBays(w).map((k) => [k, +lot.bays[k].x.toFixed(2), +lot.bays[k].z.toFixed(2), +lot.bays[k].angle.toFixed(4)]));
    d.exit = `${lot.exit.x},${lot.exit.z}`;
    d.cars = String(mod(seen.size, 1000));
  }
  protected place(state: State) {
    // A new shift, known by the count of moves going back to nothing (or another lot): everything from the start.
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (anew || this.built !== state.stage) {
      this.world = createWorld(state.stage, Math.floor(cryptoRandom() * 2e9));
      if (this.built !== state.stage) this.build(this.world.lot, state.stage);
      this.keys = { up: false, down: false, left: false, right: false, hand: false };
      this.lever = { x: 0, y: 0 };
      this.saying = { car: -1, until: 0, text: "" };
      this.said = { jobs: "", money: "" };
      this.word.classList.remove("vp-show");
    }
    if (state.winner !== null) this.hush();
    this.pose(performance.now(), 0);
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    this.hush();
    this.clearLot();
    for (const c of this.customers) {
      c.texture.dispose();
      c.sprite.material.dispose();
    }
    this.hud.remove();
    this.pad.remove();
    super.dispose();
  }
}
