import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable } from "../../engine/scene-utils";
import { noZoom } from "../../engine/zoom";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { VALET_SUBJECT } from "./layout";
import { dress, type Look } from "./scenery";
import { carKit, makeBike, makeBus, makeCar, makeFigure, modelOf, paintOf, peopleKit, walk, type CarKit, type Figure, type PeopleKit } from "./models";
import { WHEEL_LOCK, centred, fingerAngle, steerOf, turnWheel } from "./wheel";
import { ANGRY, BUMP, END, parkedMove, returnedMove, type State } from "./rules";
import { ANGRY_FINE, BIKE, BUMP_FINE, BUS, CAR_L, CAR_W, DT, SHIFT, TIDY, alight, dims, board, canAlight, createWorld, freeBays, gateX, jobs, reachable, standing, step, type Car, type Happening, type Input, type Lot, type World } from "./sim";

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
  head: T.MeshStandardMaterial;
  /** The headlights' light on the ground ahead, and the glare of the two lamps (seen in the dark). */
  beam: T.Mesh;
  flares: T.Sprite[];
  front: T.Group[];
  /** Each wheel's spinning part (turned about its axle), and the wheels' radius. */
  wheels: T.Group[];
  radius: number;
  brake: T.MeshStandardMaterial;
  back: T.MeshStandardMaterial;
  dents: T.Mesh[];
  spin: number;
  /** When it last sounded its horn (its lamps flash with it). */
  honked: number;
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
  figure: Figure;
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
  private walker!: Figure;
  /** The shared shapes of the cars and of the people (see `models.ts`). */
  private carParts!: CarKit;
  private peopleParts!: PeopleKit;
  /** The steering wheel on the screen (at the wheel): how far it is turned (radians, clockwise +), and the finger turning it. */
  private wheel = { angle: 0, finger: -1, last: null as number | null, shown: NaN };
  private wheelArt!: HTMLElement;
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
  private sky!: T.HemisphereLight;
  private sun!: T.DirectionalLight;
  /** How the lot of the stage is lit and painted (see `scenery.ts`). */
  private look: Look | null = null;
  /** The reflection of the lot's surroundings in shiny things (night and underground, with a graphics card). */
  private room: T.Texture | null = null;
  private said = { jobs: "", money: "" };
  /**
   * The street backed up (the user asked): while a customer waits outside the gate, the cars there sound their horns —
   * 빵빵, one after another — every second or two for as long as it lasts. `since` is when the wait began (-1 none),
   * `next` the next blast, `car` the one that sounded last and `at` when (a 빵빵! over it for a moment), `count` how many.
   */
  private honk = { since: -1, next: 0, car: -1, at: -9, count: 0 };
  private beep!: T.Sprite;
  /** The sounds of the lot (set by the screen from the game's `knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#8fb4d8");
    this.world = createWorld(1, Math.floor(cryptoRandom() * 2e9));
    this.camera.far = 260;
    this.camera.updateProjectionMatrix();
    this.sky = new T.HemisphereLight("#eaf3ff", "#5a6a4a", 1.7);
    this.scene.add(this.sky);
    const sun = (this.sun = new T.DirectionalLight("#fff1d6", 2.2));
    sun.position.set(-10, 26, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: 1, far: 80 });
    // Soft-edged shadows where a graphics card draws them (software drawing keeps the cheaper hard ones).
    if (capable()) {
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      sun.shadow.mapSize.set(4096, 4096);
    }
    sun.shadow.normalBias = 0.03;
    sun.shadow.bias = -0.0005;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.root.position.x = offset(this.camera.aspect);
    this.scene.add(this.root);
    this.root.add(this.lot);
    this.makeKit();
    this.markers();
    this.carParts = carKit((r) => this.own(r), capable());
    this.peopleParts = peopleKit((r) => this.own(r));
    this.walker = this.person("#d8352a", "#2b1d14", true);
    this.valet = this.walker.root;
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
      `<div class="vp-stick" role="slider" aria-label="레버" aria-valuetext="가운데"><i class="vp-ways"><b>◀</b><b>▶</b></i><span class="vp-knob"></span><span class="vp-wheel"><svg viewBox="-50 -50 100 100" aria-hidden="true"><defs><radialGradient id="vpHub" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#5a5f69"/><stop offset="1" stop-color="#1b1d22"/></radialGradient><linearGradient id="vpRim" x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#4a4f58"/><stop offset=".5" stop-color="#22252b"/><stop offset="1" stop-color="#121417"/></linearGradient></defs><circle r="42" fill="none" stroke="url(#vpRim)" stroke-width="12"/><circle r="42" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="12" stroke-dasharray="1.2 3.2"/><circle r="47.5" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="1"/><path d="M-7-6.5L-36-3.5-36 6.5-8 9M7-6.5L36-3.5 36 6.5 8 9M-7 10L-6 37 6 37 7 10Z" fill="#2a2d33" stroke="#4b5059" stroke-width="1.5" stroke-linejoin="round"/><circle r="15" fill="url(#vpHub)" stroke="#5b606a" stroke-width="1.5"/><circle r="7" fill="#e8452e" stroke="#ffd34a" stroke-width="1.5"/><rect x="-3.2" y="-48" width="6.4" height="12" rx="1.6" fill="#ffd34a"/></svg></span></div>` +
      `<div class="vp-side"><span class="vp-gear"></span><button type="button" class="vp-act" aria-label="탑승"><em>탑승</em><small>E</small></button>` +
      `<button type="button" class="vp-pedal vp-back" data-act="down" aria-label="후진·브레이크"><em>후진</em></button><button type="button" class="vp-pedal vp-go" data-act="up" aria-label="가속"><em>가속</em></button></div>`;
    host.append(this.pad);
    this.gearText = this.pad.querySelector(".vp-gear")!;
    this.stick = this.pad.querySelector(".vp-stick")!;
    this.knob = this.pad.querySelector(".vp-knob")!;
    this.wheelArt = this.pad.querySelector(".vp-wheel")!;
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
      beam: keep(new T.PlaneGeometry(7.5, 4.2)),
      beamLight: keep(
        new T.MeshBasicMaterial({
          map: keep(
            this.painted(256, 128, (pen) => {
              // Two cones of light from the lamps, bright near the car and fading ahead and to the sides.
              for (const y of [44, 84]) {
                const g = pen.createRadialGradient(0, y, 0, 0, y, 250);
                g.addColorStop(0, "rgba(255,255,255,0.9)");
                g.addColorStop(0.35, "rgba(255,255,255,0.35)");
                g.addColorStop(1, "rgba(255,255,255,0)");
                pen.fillStyle = g;
                pen.beginPath();
                pen.moveTo(0, y - 6);
                pen.lineTo(256, y - 62);
                pen.lineTo(256, y + 62);
                pen.lineTo(0, y + 6);
                pen.fill();
              }
            }),
          ),
          color: "#fff1d0",
          transparent: true,
          opacity: 0,
          blending: T.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
      flare: keep(
        new T.SpriteMaterial({
          map: keep(
            this.painted(64, 64, (pen) => {
              const g = pen.createRadialGradient(32, 32, 0, 32, 32, 32);
              g.addColorStop(0, "rgba(255,255,255,1)");
              g.addColorStop(0.3, "rgba(255,255,255,0.4)");
              g.addColorStop(1, "rgba(255,255,255,0)");
              pen.fillStyle = g;
              pen.fillRect(0, 0, 64, 64);
            }),
          ),
          color: "#fff4d8",
          transparent: true,
          opacity: 0.85,
          blending: T.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    };
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
    // 빵빵! over a car sounding its horn in the street.
    const beep = this.own(
      this.painted(256, 112, (pen) => {
        pen.font = "900 70px 'Noto Sans KR', Inter, sans-serif";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.lineJoin = "round";
        pen.lineWidth = 12;
        pen.strokeStyle = "#1c2430";
        pen.strokeText("빵빵!", 128, 58);
        pen.fillStyle = "#ffe14a";
        pen.fillText("빵빵!", 128, 58);
      }),
    );
    this.beep = new T.Sprite(this.own(new T.SpriteMaterial({ map: beep, depthTest: false, transparent: true })));
    this.beep.scale.set(2.6, 1.14, 1);
    this.beep.renderOrder = 6;
    this.beep.visible = false;
    this.root.add(this.beep);
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
      if (!mesh.isMesh && !(o as T.Sprite).isSprite) return;
      if (mesh.isMesh) mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        // Every picture the stuff is painted with (colour, glow, bumps, shine).
        for (const value of Object.values(m)) if ((value as T.Texture | null)?.isTexture) (value as T.Texture).dispose();
        m.dispose();
      }
    });
    this.lot.clear();
    this.look = null;
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
    // What is round the lot, and how it is lit (the mart by day, the burger restaurant by night, under the ground).
    const look = (this.look = dress(stage, lot, this.lot, capable()));
    this.renderer.setClearColor(look.clear);
    this.sky.color.set(look.sky[0]);
    this.sky.groundColor.set(look.sky[1]);
    this.sky.intensity = look.sky[2];
    this.sun.color.set(look.sun.color);
    this.sun.intensity = look.sun.intensity;
    this.sun.position.set(...look.sun.at);
    this.reflect(look);
    flat(w, d, look.floor, 0, cz, 0).receiveShadow = true;
    // The bays: lines, a number at the aisle's end, and a glow shown while the bay is where to go.
    const white = look.line,
      // A bus's bay is lined in yellow and lettered BUS.
      yellow = std({ color: "#f2c230", roughness: 0.7 });
    lot.bays.forEach((bay) => {
      const group = new T.Group();
      group.position.set(bay.x, 0, bay.z);
      group.rotation.y = -bay.angle;
      this.lot.add(group);
      const line = (len: number, x: number, z: number, turn: number) => {
        const mesh = new T.Mesh(new T.PlaneGeometry(len, bay.bus ? 0.16 : 0.12), bay.bus ? yellow : white);
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
      if (bay.bus) {
        const word = this.painted(256, 96, (pen) => {
          pen.fillStyle = "#f2c230";
          pen.font = "900 78px Inter, Arial, sans-serif";
          pen.textAlign = "center";
          pen.textBaseline = "middle";
          pen.fillText("BUS", 128, 52);
        });
        for (const s of [-1, 1]) flat(2.6, 0.98, new T.MeshBasicMaterial({ map: word, transparent: true, depthWrite: false, opacity: 0.9 }), bay.x + s * 3, bay.z, 0.016);
      }
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
    const wall = (x0: number, z0: number, x1: number, z1: number) =>
      add(block(Math.abs(x1 - x0) + 0.36, 0.28, Math.abs(z1 - z0) + 0.36, 0.05), look.kerb(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0))), (x0 + x1) / 2, 0.14, (z0 + z1) / 2);
    wall(lot.minX, lot.minZ - 0.18, lot.maxX, lot.minZ - 0.18);
    wall(lot.minX, lot.maxZ + 0.18, lot.maxX, lot.maxZ + 0.18);
    for (const s of [-1, 1]) {
      wall(lot.minX - 0.18, s * 2.7, lot.minX - 0.18, s === 1 ? lot.maxZ : lot.minZ);
      wall(lot.maxX + 0.18, s * (lot.exit.hz + 0.2), lot.maxX + 0.18, s === 1 ? lot.maxZ : lot.minZ);
    }
    // The booth by the entrance (the first block): a little kiosk with a glass band all round under a red roof with a
    // white edge, corner posts, its name leaning toward the eye; planters (the other blocks); and the pillars.
    const [booth, ...planters] = lot.blocks,
      bw = booth.hx * 2,
      bd = booth.hz * 2,
      cream = std({ color: "#f1ede2", roughness: 0.7 }),
      post = std({ color: "#3b3f46", roughness: 0.5, metalness: 0.4 }),
      pane = look.dark
        ? std({ color: "#ffe2b0", emissive: "#ffcf8a", emissiveIntensity: 0.85, roughness: 0.25 })
        : std({ color: "#2a3a4a", roughness: 0.08, metalness: 0.55 });
    add(block(bw, 0.95, bd, 0.06), cream, booth.x, 0.475, booth.z);
    add(new T.BoxGeometry(bw - 0.1, 1.25, bd - 0.1), pane, booth.x, 1.55, booth.z);
    add(block(bw, 0.32, bd, 0.05), cream, booth.x, 2.33, booth.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new T.BoxGeometry(0.12, 1.3, 0.12), post, booth.x + sx * (booth.hx - 0.04), 1.55, booth.z + sz * (booth.hz - 0.04), false);
    add(block(bw + 0.5, 0.22, bd + 0.5, 0.06), std({ color: "#e8452e", roughness: 0.55 }), booth.x, 2.62, booth.z);
    add(block(bw + 0.54, 0.07, bd + 0.54, 0.02), std({ color: "#ffffff", roughness: 0.5 }), booth.x, 2.49, booth.z, false);
    // A counter at the window, and the attendant's lamp.
    add(block(bw * 0.7, 0.06, 0.4, 0.02), post, booth.x, 0.98, booth.z + booth.hz + 0.12, false);
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
    // Planters: dressed stone with soil, shrubs of a few greens, flowers among them.
    const stoneP = std({ color: "#cfc8bb", roughness: 0.85 }),
      soilP = std({ color: "#4a3324", roughness: 1 }),
      shrub = new T.IcosahedronGeometry(1, 1),
      greens = ["#3f8a4a", "#4f9a52", "#367a3e"].map((c) => std({ color: c, roughness: 1 })),
      blooms = ["#f2c230", "#e8452e", "#f4f1e8", "#d86aa8"].map((c) => std({ color: c, roughness: 0.8 }));
    for (const p of planters) {
      add(block(p.hx * 2, 0.5, p.hz * 2, 0.08), stoneP, p.x, 0.25, p.z);
      add(new T.BoxGeometry(p.hx * 2 - 0.3, 0.04, p.hz * 2 - 0.3), soilP, p.x, 0.51, p.z, false);
      const n = Math.max(3, Math.round(p.hx * 2));
      for (let k = 0; k < n; k++) {
        const bush = add(shrub, greens[k % 3], p.x - p.hx + 0.55 + k * ((p.hx * 2 - 1.1) / (n - 1)), 0.85, p.z + (k % 2 ? 0.15 : -0.15));
        bush.scale.set(0.55, 0.45 + (k % 3) * 0.08, 0.55);
        for (let f = 0; f < 3; f++) add(new T.SphereGeometry(0.07, 6, 5), blooms[(k + f) % 4], bush.position.x + Math.cos(f * 2.1 + k) * 0.42, 1.12 + (f % 2) * 0.08, bush.position.z + Math.sin(f * 2.1 + k) * 0.32, false);
      }
    }
    const concrete = std({ color: "#c2c4c8", roughness: 0.7 }),
      stripe = std({ color: "#f2c230", roughness: 0.6 });
    for (const p of lot.pillars) {
      if (look.pillar) {
        look.pillar(p);
        continue;
      }
      add(new T.CylinderGeometry(p.r, p.r, 2.6, 16), concrete, p.x, 1.3, p.z);
      add(new T.CylinderGeometry(p.r + 0.02, p.r + 0.02, 0.5, 16), stripe, p.x, 0.5, p.z, false);
    }
    // Lamp posts along the back, and a barrier at each gate that lifts as a car goes through.
    const steel = std({ color: "#5a5f66", roughness: 0.4, metalness: 0.6 }),
      bulb = new T.MeshStandardMaterial({ color: "#fff6d8", emissive: "#ffe9a8", emissiveIntensity: 0.9 });
    if (look.lamps)
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
      pivot.userData.moving = true;
      this.arms.push({ pivot, open: 0 });
    }
    this.mergeStill();
  }
  /**
   * The lot's still things merged: every mesh that never moves is put together with the others of its material into
   * one, so that the lot is drawn in few strokes (a drawing done by the processor alone, as the browser tests are,
   * pays for every separate thing; a graphics card hardly notices either way).
   */
  private mergeStill() {
    const KEEP = ["position", "normal", "uv"],
      groups = new Map<string, T.Mesh[]>();
    this.lot.updateMatrixWorld(true);
    const back = new T.Matrix4().copy(this.lot.matrixWorld).invert();
    this.lot.traverse((o) => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.visible) return;
      for (let p: T.Object3D | null = mesh; p && p !== this.lot; p = p.parent) if (p.userData.moving) return;
      const names = Object.keys(mesh.geometry.attributes).filter((n) => KEEP.includes(n));
      if (names.length !== 3) return;
      const key = [(mesh.material as T.Material).uuid, mesh.castShadow, mesh.receiveShadow, mesh.renderOrder].join("|");
      groups.set(key, [...(groups.get(key) ?? []), mesh]);
    });
    const dropped = new Set<T.BufferGeometry>();
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!KEEP.includes(name)) g.deleteAttribute(name);
        g.morphAttributes = {};
        return g.applyMatrix4(new T.Matrix4().multiplyMatrices(back, mesh.matrixWorld));
      });
      const merged = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      if (!merged) continue;
      const first = meshes[0],
        one = new T.Mesh(merged, first.material);
      Object.assign(one, { castShadow: first.castShadow, receiveShadow: first.receiveShadow, renderOrder: first.renderOrder });
      this.lot.add(one);
      for (const mesh of meshes) {
        mesh.removeFromParent();
        dropped.add(mesh.geometry);
      }
    }
    // The shapes no mesh uses any more.
    const used = new Set<T.BufferGeometry>();
    this.lot.traverse((o) => (o as T.Mesh).isMesh && used.add((o as T.Mesh).geometry));
    for (const g of dropped) if (!used.has(g)) g.dispose();
  }
  /** Shiny things (paint, glass, a polished floor) reflect the lot's surroundings, where a graphics card draws them. */
  private reflect(look: Look) {
    this.room?.dispose();
    this.room = null;
    this.scene.environment = null;
    if (!look.room || !capable()) return;
    const { scene, intensity } = look.room(),
      pmrem = new T.PMREMGenerator(this.renderer);
    this.room = pmrem.fromScene(scene, 0.04).texture;
    pmrem.dispose();
    scene.traverse((o) => {
      const mesh = o as T.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
    });
    this.scene.environment = this.room;
    this.scene.environmentIntensity = intensity;
  }
  /** A person (see `models.ts`): a shirt in `colour`, hair in `hair`; the valet in uniform with its cap. */
  private person(colour: string, hair: string, uniform = false) {
    return makeFigure(this.peopleParts, this.standard({ color: colour, roughness: 0.75 }), this.standard({ color: hair, roughness: 0.9 }), uniform);
  }
  /** A customer at the booth: a figure and a bubble over it that says what it wants and how patient it still is. */
  private customer(): Customer {
    const hairs = ["#2b1d14", "#4a2f1c", "#111111", "#7a5a32", "#9a9a98"],
      figure = this.person("#888", hairs[this.customers.length % hairs.length]),
      root = figure.root,
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
    return { root, sprite, canvas, texture, said: "", shirt: figure.shirt, figure };
  }
  /** A car of its kind and colour (see `models.ts`), its lamps lit one by one, the glare of its headlamps and their beam on the ground. */
  private car(car: Car): CarModel {
    const k = this.kit,
      brake = this.standard({ color: "#7a1612", emissive: "#ff2a1a", emissiveIntensity: 0.15, roughness: 0.3 }),
      back = this.standard({ color: "#c9c9c4", emissive: "#ffffff", emissiveIntensity: 0, roughness: 0.3 }),
      head = this.standard({ color: "#fff6c8", emissive: "#ffe9a0", emissiveIntensity: 0.6, roughness: 0.2 }),
      paint = paintOf(this.carParts, (r) => this.own(r), PAINTS[car.colour % PAINTS.length]),
      parts = car.kind === BIKE ? makeBike(this.carParts, paint, { head, brake, back }) : car.kind === BUS ? makeBus(this.carParts, paint, { head, brake, back }) : makeCar(this.carParts, modelOf(car.style, car.colour), paint, { head, brake, back }),
      root = parts.root,
      flares: T.Sprite[] = [];
    for (const z of parts.lampZ) {
      const flare = new T.Sprite(k.flare as T.SpriteMaterial);
      flare.position.set(parts.nose + 0.12, parts.lampY, z);
      flare.scale.setScalar(0.95);
      flare.renderOrder = 3;
      flare.visible = false;
      root.add(flare);
      flares.push(flare);
    }
    const beam = new T.Mesh(k.beam as T.BufferGeometry, k.beamLight as T.Material);
    beam.rotation.x = -Math.PI / 2;
    beam.position.set(parts.nose + 3.7, 0.05, 0);
    // (A motorbike's one lamp throws a narrower beam.)
    if (car.kind === BIKE) beam.scale.set(1, 0.6, 1);
    beam.renderOrder = 1;
    beam.visible = false;
    root.add(beam);
    this.root.add(root);
    return { root, head, beam, flares, front: parts.front, wheels: parts.wheels, radius: parts.radius, brake, back, dents: parts.dents, spin: 0, honked: -9 };
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
        this.stick.classList.add("on");
        // At the wheel the thumb takes hold of the steering wheel and turns it; on foot it leans the lever.
        if (this.world.hand >= 0) {
          this.wheel.finger = e.pointerId;
          this.wheel.last = this.wheelAt(e);
        } else {
          leaning = e.pointerId;
          lean(e);
        }
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
      if (e.pointerId === this.wheel.finger) {
        // Turned on by however far the finger has gone round the wheel's middle since the last move (held at the lock).
        const at = this.wheelAt(e);
        if (at !== null && this.wheel.last !== null) this.wheel.angle = turnWheel(this.wheel.angle, this.wheel.last, at);
        if (at !== null) this.wheel.last = at;
        this.leverShown();
      }
    });
    const lift = (e: PointerEvent) => {
      if (e.pointerId === leaning) {
        leaning = -1;
        this.lever = { x: 0, y: 0 };
        this.stick.classList.remove("on");
        this.leverShown();
      }
      if (e.pointerId === this.wheel.finger) {
        // Let go, the wheel comes back to the middle by itself (in `pose`).
        this.wheel.finger = -1;
        this.wheel.last = null;
        this.stick.classList.remove("on");
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
  /** The lever's knob where it leans (on foot), and the steering wheel turned as far as it is (at the wheel). */
  private leverShown() {
    const driving = this.world.hand >= 0,
      { x, y } = this.lever,
      box = this.stick.getBoundingClientRect(),
      reach = (box.width || 120) * 0.36;
    this.knob.style.transform = driving ? "" : `translate(${(x * reach).toFixed(1)}px, ${(y * reach).toFixed(1)}px)`;
    // The wheel shows the finger's turn while it is held or coming back; else, steered by the keys, the car's own.
    const hand = driving ? this.world.cars.find((c) => c.id === this.world.hand) : null,
      angle = this.wheel.finger >= 0 || this.wheel.angle !== 0 || !hand ? this.wheel.angle : (hand.steer / dims(hand).maxSteer) * WHEEL_LOCK;
    if (Math.abs(angle - this.wheel.shown) > 0.002 || Number.isNaN(this.wheel.shown)) {
      this.wheel.shown = angle;
      this.wheelArt.style.transform = `rotate(${angle.toFixed(4)}rad)`;
    }
  }
  /** A finger's angle round the steering wheel's middle (null too near the middle to tell). */
  private wheelAt(e: PointerEvent) {
    const box = this.stick.getBoundingClientRect();
    return fingerAngle(e.clientX - (box.x + box.width / 2), e.clientY - (box.y + box.height / 2), box.width / 2);
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
    this.wheel.angle = 0;
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
    // The keys, else the steering wheel on the screen (turned by a thumb, or coming back to the middle once let go).
    const steer = sideways !== 0 ? sideways : steerOf(this.wheel.angle);
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
      this.honking();
    } else this.left = 0;
    this.pose(now, this.running() ? real : 0);
    this.redraw();
  }
  /** The cars backed up in the street sound their horns, one after another, while they wait (see `honk`). */
  private honking() {
    const queued = this.world.cars.filter((c) => c.state === "queue"),
      h = this.honk;
    if (!queued.length || this.world.over) {
      h.since = -1;
      return;
    }
    if (h.since < 0) {
      h.since = this.clock;
      h.next = this.clock + 1.1;
    }
    if (this.clock < h.next) return;
    const car = queued[h.count % queued.length];
    // A bus's horn is deeper, a motorbike's thinner.
    this.onKnock?.("honk", car.kind === BUS ? 0.7 : car.kind === BIKE ? 1.5 : 1);
    h.car = car.id;
    h.at = this.clock;
    h.count++;
    const model = this.cars.get(car.id);
    if (model) model.honked = this.clock;
    // The longer the wait, the more often.
    h.next = this.clock + Math.max(0.9, 2.2 - (this.clock - h.since) * 0.04) + Math.random() * 0.6;
  }
  /** The place a queued car waits at, by its turn: just outside the barrier, then up the street. */
  private queued(lot: Lot, turn: number, car: Car) {
    // (A bus up the street stands a little further up, its tail clear of the first in the queue.)
    return turn === 0 ? { x: gateX(lot, car), z: lot.entrance.z, heading: 0 } : { x: lot.minX - 5.4, z: lot.entrance.z - 1.6 - turn * 5.4 - (car.kind === BUS ? 1.8 : 0), heading: Math.PI / 2 };
  }
  /** The bay the arrow shows for the car in hand: the one its customer named, else (none named) the one it stands rightly in or the nearest free one. */
  private goal(car: Car) {
    const w = this.world,
      free = freeBays(w, car.kind);
    if (car.want >= 0) return car.want;
    let best = -1,
      near = Infinity;
    for (const k of free) {
      const bay = w.lot.bays[k],
        far = standing(bay, car.x, car.z, car.heading, dims(car)).inside ? -1 : Math.hypot(bay.x - car.x, bay.z - car.z);
      if (far < near) [best, near] = [k, far];
    }
    return best;
  }
  /** Everything where the lot has it: cars, customers, the valet, the marks, the barriers, the words, the sounds. */
  private pose(now: number, dt: number) {
    // The steering wheel let go comes back to the middle, smoothly; held, it stays where the thumb has turned it.
    if (this.wheel.finger < 0 && this.wheel.angle !== 0) this.wheel.angle = centred(this.wheel.angle, dt);
    if (this.world.hand >= 0) this.leverShown();
    (this.kit.beamLight as T.MeshBasicMaterial).opacity = this.look?.beams ?? 0;
    this.look?.tick?.(now / 1000);
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
      const at = car.state === "queue" ? this.queued(lot, turn++, car) : car;
      model.root.position.set(at.x, 0, at.z);
      model.root.rotation.y = -at.heading;
      for (const pivot of model.front) pivot.rotation.y = -car.steer;
      model.spin += (car.v * dt) / model.radius;
      for (const wheel of model.wheels) wheel.rotation.z = -model.spin;
      const mine = car === hand,
        braking = mine && ((input.gas < 0 && car.v > 0.05) || (input.gas > 0 && car.v < -0.05) || input.handbrake);
      // In the dark a car that runs (rolling in, in hand, driving off) has its lights on; one left standing has them off.
      const lit = !!this.look?.dark && (mine || car.state === "queue" || car.state === "arriving" || car.state === "leaving"),
        // A car sounding its horn flashes its lamps.
        flash = this.clock - model.honked < 0.45 && Math.floor((this.clock - model.honked) / 0.11) % 2 === 0;
      model.head.emissiveIntensity = flash ? 3.2 : lit ? 2.4 : this.look?.dark ? 0.04 : 0.6;
      if (car.id === this.honk.car) {
        const ago = this.clock - this.honk.at,
          length = dims(car).l;
        this.beep.visible = car.state === "queue" && ago < 0.8 && !capturing();
        this.beep.position.set(at.x, 2.4 + (car.kind === BUS ? 1.2 : 0) + ago * 0.8, at.z);
        this.beep.material.opacity = Math.min(1, (0.8 - ago) / 0.25);
        this.beep.scale.set(2.6 * (0.85 + 0.15 * Math.min(1, ago / 0.12)) * (length > 6 ? 1.2 : 1), 1.14 * (length > 6 ? 1.2 : 1), 1);
      }
      model.beam.visible = lit;
      for (const flare of model.flares) flare.visible = lit;
      model.brake.emissiveIntensity = braking ? 1.6 : lit ? 0.7 : 0.15;
      model.back.emissiveIntensity = mine && (car.v < -0.05 || (input.gas < 0 && car.v <= 0.05)) ? 1.2 : 0;
      model.dents.forEach((d, k) => (d.visible = k < car.dents));
    }
    if (!w.cars.some((c) => c.id === this.honk.car && c.state === "queue")) this.beep.visible = false;
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
      // Standing, it shifts its weight now and then; an angry one stamps.
      c.figure.stride = t * (car.late ? 9 : 1.3) + k;
      walk(c.figure, car.late ? 0.5 : 0.08);
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
    // On a motorbike the valet is seen astride it (life size), legs to the pegs and hands on the bars; in a car or a bus, not at all.
    const riding = hand?.kind === BIKE ? hand : null;
    this.valet.visible = !hand || !!riding;
    // Its legs and arms swing with its stride, faster and wider the faster it goes.
    const pace = Math.min(1, w.valet.speed / 4);
    this.walker.stride += dt * w.valet.speed * 2.4;
    walk(this.walker, pace);
    if (riding) {
      this.valet.scale.setScalar(1);
      for (const leg of this.walker.legs) leg.rotation.x = -1.25;
      for (const arm of this.walker.arms) arm.rotation.x = -1.05;
      this.valet.position.set(w.valet.x, 0.06, w.valet.z);
      this.valet.rotation.set(0, -riding.heading + Math.PI / 2, 0);
      // Leaning into a turn.
      this.valet.rotateZ(Math.max(-0.25, Math.min(0.25, -riding.steer * riding.v * 0.06)));
    } else {
      this.valet.scale.setScalar(1.2);
      this.valet.position.set(w.valet.x, pace > 0.02 ? Math.abs(Math.cos(this.walker.stride)) * 0.06 * pace : 0, w.valet.z);
      this.valet.rotation.set(0, -w.valet.heading + Math.PI / 2, 0);
    }
    this.feet.visible = !capturing() && !riding;
    // The car it may get into now glows round its feet.
    this.halo.visible = !!near;
    if (near) {
      const size = dims(near);
      this.halo.scale.set((size.l + 1.4) / (CAR_L + 1.4), (size.w + 1.2) / (CAR_W + 1.2), 1);
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
      free = parking ? (hand!.want >= 0 ? [hand!.want] : freeBays(w, hand!.kind)) : [];
    this.glows.forEach((glow, k) => {
      const inside = k === goal && standing(lot.bays[k], hand!.x, hand!.z, hand!.heading, dims(hand)).inside;
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
      const speed = hand ? Math.abs(hand.v) / dims(hand).vMost : 0;
      this.onKnock?.(!hand ? "off" : input.gas !== 0 ? "rev" : "coast", speed);
      this.onKnock?.("chirp", hand && Math.abs(hand.v) > 3.2 ? (Math.abs(hand.steer) / dims(hand).maxSteer) * speed * (input.handbrake ? 1.6 : 1) : 0);
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
      this.stick.setAttribute("aria-label", driving ? "핸들" : "레버");
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
    // How far the steering wheel on the screen is turned, in degrees (clockwise +).
    d.wheel = ((this.wheel.angle * 180) / Math.PI).toFixed(1);
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
    const want = parking ? (hand!.want >= 0 ? hand!.want : (freeBays(w, hand!.kind)[0] ?? -1)) : -1;
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
    d.scene = this.look?.name ?? "";
    d.cars = String(mod(seen.size, 1000));
    // What stands in the lot (0 car, 1 motorbike, 2 bus) and how many horns the street has sounded.
    d.kinds = w.cars.filter((c) => c.state !== "gone").map((c) => c.kind).join(",");
    d.honks = String(this.honk.count);
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
      this.wheel.angle = 0;
      this.saying = { car: -1, until: 0, text: "" };
      this.said = { jobs: "", money: "" };
      this.honk = { since: -1, next: 0, car: -1, at: -9, count: 0 };
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
    this.room?.dispose();
    for (const c of this.customers) {
      c.texture.dispose();
      c.sprite.material.dispose();
    }
    this.hud.remove();
    this.pad.remove();
    super.dispose();
  }
}
