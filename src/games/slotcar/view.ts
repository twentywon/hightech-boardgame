import * as T from "three";
import { glossy } from "../../engine/scene-utils";
import type { LiveGuest, LiveHost, LiveSession } from "../../net/live";
import { shout } from "../../ui/banner";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { attic } from "./attic";
import { DROP, MARGIN, SURFACE, scenePoint, slotSubject } from "./layout";
import { follow, hostThrottles, inputOf, readSnap, snapOf } from "./net";
import { COLORS, COLOR_NAMES, END, LAP, OFF, carName, packRanking, seatOfCar, type State } from "./rules";
import { CAR_LENGTH, COUNTDOWN, DT, FLY, VMAX, autopilot, createWorld, poseOf, progress, ranking, step, strain, ticks, type RaceEvent, type World } from "./sim";
import { buildTrack, laneAt, type Segment, type Track } from "./track";

export const SLOT_COLORS: [string, string] = [COLORS[0], COLORS[1]];
/** How thick the track's pieces are, and how high the rails stand on an elevated stretch. */
const THICK = 0.09,
  RAIL_UP = 0.13;
/** The longest step of the middle line between two samples of the track's meshes. */
const SAMPLE = 0.14;
/**
 * What is painted or laid on the track's top (lines, slots, rails, kerbs, the start line) is drawn a little toward the
 * eye as well as raised a hair, so that from the camera's height it never flickers against the surface under it.
 */
const LIFTED = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: T.DoubleSide };
/** The cars are made at 1 and drawn this much larger: a car takes nearly three quarters of its lane's width. */
const CAR_SCALE = 1.25;
/** Where each person's pedal stands at one screen, by the number of people: toward their own side of the screen. */
const PEDAL_PLACES: Record<number, string[]> = { 1: ["br"], 2: ["bl", "br"], 3: ["bl", "br", "tr"], 4: ["bl", "br", "tr", "tl"] };
/** The keys that hold each person's pedal: Space (and ↑) for the first, Enter for the second, and the number keys. */
const KEYS: Record<string, number> = { Space: 0, ArrowUp: 0, Digit1: 0, Numpad1: 0, Enter: 1, NumpadEnter: 1, Digit2: 1, Numpad2: 1, Digit3: 2, Numpad3: 2, Digit4: 3, Numpad4: 3 };
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** One car of the race: its body and the wheels that turn as it goes. */
interface CarMesh {
  group: T.Group;
  wheels: T.Mesh[];
  /** How far it has rolled, for the wheels' turn. */
  rolled: number;
}
/** A flat strip of quads, coloured each by `color`, as one mesh's geometry (non-indexed: each quad its own corners). */
function quads(own: Own, corners: number[][][], colors?: number[][]) {
  const position: number[] = [],
    color: number[] = [];
  corners.forEach((q, i) => {
    for (const v of [q[0], q[1], q[2], q[0], q[2], q[3]]) {
      position.push(v[0], v[1], v[2]);
      if (colors) color.push(...colors[i]);
    }
  });
  const g = own(new T.BufferGeometry());
  g.setAttribute("position", new T.Float32BufferAttribute(position, 3));
  if (colors) g.setAttribute("color", new T.Float32BufferAttribute(color, 3));
  g.computeVertexNormals();
  return g;
}
/** The number on a car's roof: a white roundel with its number in black. */
function roundel(own: Own, n: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111111";
  ctx.font = '900 40px "Inter", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 32, 35);
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/**
 * A slot car race in an attic hobby room (`attic.ts`): a figure-of-eight track of dark plastic pieces on a big green
 * table, a slot and two steel rails for each lane, white edge lines, red and white kerbs round the curves, a bridge on
 * pillars with railings where the track crosses itself, a chequered start line under a gantry of start lights, and the
 * cars (each its colour, its number on the roof, wheels and a guide blade under the nose). The view runs the race
 * (`sim.ts`) in fixed slices and reports laps, flights off and the race's end as moves.
 *
 * Every person has a big pedal of their own on the screen (DOM buttons over the table, toward their side: against the
 * computer at the lower right, at one screen at the corners), each followed by its own pointer so that several can be
 * held at once; against the computer a press anywhere on the table holds my pedal as well. Keys: Space (and ↑) for
 * the first car, Enter for the second, 1–4 for each. The board of laps and places stands at the top of the table.
 */
export class SlotCarView extends TableView<State> {
  private track: Track;
  private world: World | null = null;
  private built = false;
  private cars: CarMesh[] = [];
  private lamps: T.MeshStandardMaterial[] = [];
  private hud: HTMLElement;
  private board: HTMLElement;
  private pedalBox: HTMLElement;
  private pedals: HTMLButtonElement[] = [];
  /** The pointers holding each pedal, the keys held for each, and pointers held down on the table (my pedal). */
  private pointers: Set<number>[] = [new Set(), new Set(), new Set(), new Set()];
  private keysHeld: Set<string>[] = [new Set(), new Set(), new Set(), new Set()];
  private tableHolds = new Set<number>();
  private people = 1;
  private last = performance.now();
  private left = 0;
  private paused = false;
  private ticker = 0;
  private boardText = "";
  /**
   * Over Wi-Fi: the car of the seat this device plays (null: watching), its "나" tag over the track, and what of the
   * host's race a guest has drawn so far (to sound and light what changed since).
   */
  private mine: number | null = null;
  private tag: T.Sprite | null = null;
  private heard: { tick: number; laps: number[]; offs: number[]; phases: string[] } | null = null;
  private letGoTimer = 0;
  /** A sound heard: the motors (`whine` or `coast` for the people's cars, `pack` for the computer's), a car flying off, the lights, a lap. */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  private readonly keyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly keyUp = (e: KeyboardEvent) => this.key(e, false);
  private readonly blurred = () => this.letGo();
  private readonly hidden = () => document.hidden && this.letGo();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private course: string,
    private level: Level,
    private local: boolean,
    private live: LiveSession | null = null,
  ) {
    super(host, quality, "#2a2018");
    // Until the race is known (how many lanes), the camera frames the course as laid for four.
    this.track = buildTrack(course, 4);
    this.hud = document.createElement("div");
    this.hud.className = "sc-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.board = document.createElement("div");
    this.board.className = "sc-board";
    this.hud.append(this.board);
    this.pedalBox = document.createElement("div");
    this.pedalBox.className = "sc-pedals";
    host.append(this.hud, this.pedalBox);
    const el = this.renderer.domElement;
    // Against the computer a press anywhere on the table is my pedal too.
    el.addEventListener("pointerdown", (e) => {
      if (this.local || (e.pointerType === "mouse" && e.button !== 0)) return;
      this.tableHolds.add(e.pointerId);
    });
    const lift = (e: PointerEvent) => this.tableHolds.delete(e.pointerId);
    el.addEventListener("pointerup", lift);
    el.addEventListener("pointercancel", lift);
    el.addEventListener("pointerleave", lift);
    const still = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", still, { passive: false });
    el.addEventListener("touchmove", still, { passive: false });
    el.addEventListener("contextmenu", still);
    el.style.touchAction = "none";
    document.addEventListener("keydown", this.keyDown);
    document.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blurred);
    document.addEventListener("visibilitychange", this.hidden);
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The race never makes the screen wait: a lap may be reported at any moment. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.hush();
  }
  /** Every pedal let go (the page lost the keyboard, a window opened). */
  private letGo() {
    this.keysHeld.forEach((keys) => keys.clear());
    this.tableHolds.clear();
    // A guest tells the host at once (its page may stop drawing now: hidden, or a window over it).
    const live = this.live;
    if (live && !live.host && this.mine !== null) {
      clearTimeout(this.letGoTimer);
      this.letGoTimer = window.setTimeout(() => (live as LiveGuest).tick(() => inputOf(false)), 40);
    }
  }
  private running() {
    // Over Wi-Fi a window open on one device does not stop the race for the others (a pause does, for all).
    return (
      !!this.world && !!this.state && this.state.ranking === null && this.world.closed === null && !this.paused && !document.hidden && (!!this.live || !document.querySelector("dialog[open]"))
    );
  }
  /** The car a press on the table and Space hold: mine against the computer (car 0), and over Wi-Fi my seat's. */
  private get first() {
    return this.live ? this.mine : 0;
  }
  /** Whether a car is driven at this screen (its motor is heard as the people's, its laps beep). */
  private isMine(k: number) {
    return this.live ? k === this.mine : k < this.people;
  }
  private held(k: number) {
    return this.pointers[k].size > 0 || this.keysHeld[k].size > 0 || (k === this.first && this.tableHolds.size > 0);
  }
  /** A key for a pedal, from anywhere on the page but a field or another button. */
  private key(e: KeyboardEvent, down: boolean) {
    const k = KEYS[e.code];
    if (k === undefined || e.ctrlKey || e.metaKey || e.altKey) return;
    const seat = this.local ? k : this.first;
    if (seat === null || seat >= this.people) return;
    const target = e.target as HTMLElement | null;
    if (target && target !== this.renderer.domElement && target.closest("input, select, textarea, dialog, button:not(.sc-pedal)")) return;
    if (down && document.querySelector("dialog[open]")) return;
    e.preventDefault();
    if (down) this.keysHeld[seat].add(e.code);
    else this.keysHeld[seat].delete(e.code);
    this.markPedals();
  }
  /** The pedals for the people of this race, each at its place, held by its own pointers. */
  private makePedals() {
    this.pedalBox.replaceChildren();
    this.pedals = [];
    const places = PEDAL_PLACES[this.people] ?? PEDAL_PLACES[1],
      // Over Wi-Fi each device has one pedal, its own car's, at the lower right (none while watching).
      own = this.live ? (this.mine === null ? [] : [this.mine]) : Array.from({ length: this.people }, (_, k) => k),
      alone = own.length === 1 && !this.local;
    for (const k of own) {
      const color = COLORS[this.state ? seatOfCar(this.state, k) : k],
        button = document.createElement("button");
      button.type = "button";
      button.className = "sc-pedal";
      button.tabIndex = -1;
      button.dataset.at = alone ? "br" : places[k];
      button.dataset.seat = String(k);
      button.style.setProperty("--car", color);
      button.setAttribute("aria-label", alone ? "가속 페달" : `${k + 1}번 ${COLOR_NAMES[k]} 가속 페달`);
      button.innerHTML = `<span class="sc-pedal-plate" aria-hidden="true">${alone ? "" : `<b>${k + 1}</b>`}<em>가속</em></span>`;
      const lift = (e: PointerEvent) => {
        this.pointers[k].delete(e.pointerId);
        this.markPedals();
      };
      button.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          // A pointer already gone: nothing to follow.
        }
        this.pointers[k].add(e.pointerId);
        this.markPedals();
      });
      button.addEventListener("pointerup", lift);
      button.addEventListener("pointercancel", lift);
      button.addEventListener("lostpointercapture", lift);
      button.addEventListener("contextmenu", (e) => e.preventDefault());
      button.addEventListener("touchstart", (e) => e.cancelable && e.preventDefault(), { passive: false });
      this.pedalBox.append(button);
      this.pedals.push(button);
    }
  }
  private markPedals() {
    this.pedals.forEach((button) => {
      const on = this.held(Number(button.dataset.seat));
      if (button.classList.contains("on") !== on) button.classList.toggle("on", on);
      button.dataset.held = String(on);
    });
  }
  /** Builds the room, the track and the cars for the race the state describes (once: a new race is a new view). */
  private build(state: State) {
    this.built = true;
    this.people = state.people;
    if (this.live) {
      const car = this.live.seat === null ? -1 : (state.seats ?? []).indexOf(this.live.seat);
      this.mine = car >= 0 ? car : null;
    }
    this.track = buildTrack(state.course, state.cars);
    this.world = createWorld(state.course, state.cars, state.laps, this.level, Math.floor(Math.random() * 2 ** 31));
    const own: Own = (r) => this.own(r),
      b = this.track.bounds,
      half = (b.maxX - b.minX) / 2 + MARGIN,
      depth = (b.maxY - b.minY) / 2 + MARGIN;
    this.scene.add(new T.HemisphereLight("#f3e6cf", "#4a3424", 1.5));
    const sun = new T.DirectionalLight("#fff2dc", 2.1);
    sun.position.set(-half * 0.4, 16, -depth - 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -half - 1, right: half + 1, top: depth + 6, bottom: -depth - 6, near: 1, far: 50 });
    sun.shadow.normalBias = 0.02;
    sun.shadow.bias = -0.0004;
    this.own(sun.shadow);
    this.scene.add(sun);
    const lamp = new T.PointLight("#ffd9a0", 26, 30, 1.6);
    lamp.position.set(half * 0.3, 7, depth * 0.3);
    this.scene.add(lamp);
    attic(this.scene, own, half, depth, DROP);
    this.layTrack(own);
    this.gantry(own);
    for (let k = 0; k < state.cars; k++) this.cars.push(this.makeCar(own, k, seatOfCar(state, k)));
    if (this.mine !== null) this.tag = this.makeTag(own, COLORS[seatOfCar(state, this.mine)]);
    this.makePedals();
    this.markPedals();
    // The camera frames the track as it now is.
    this.resize();
  }
  /** A point of the track's surface `d` across, `along` its middle through `seg`, raised `lift` above the surface. */
  private at(seg: Segment, along: number, d: number, lift = 0) {
    const p = laneAt(seg, Math.min(1, Math.max(0, along / seg.length)), d),
      s = scenePoint(this.track, p.x, p.y, p.h);
    return [s.x, s.y + lift, s.z];
  }
  /** The places a run of the track is sampled at, along each segment's middle. */
  private *samples(seg: Segment) {
    const n = Math.max(2, Math.ceil(seg.length / SAMPLE));
    for (let i = 0; i < n; i++) yield [(i / n) * seg.length, ((i + 1) / n) * seg.length];
  }
  /** Lays the track: its pieces, edge lines, slots, rails, kerbs, the start line, the bridge's railings and pillars. */
  private layTrack(own: Own) {
    const { segments, half, offsets } = this.track,
      base: number[][][] = [],
      lines: number[][][] = [],
      slots: number[][][] = [],
      rails: number[][][] = [],
      kerbs: number[][][] = [],
      kerbColors: number[][] = [],
      walls: number[][][] = [];
    const red = new T.Color("#d4302a"),
      white = new T.Color("#f1eee6");
    for (const seg of segments)
      for (const [a, b] of this.samples(seg)) {
        const top = (along: number, d: number, lift = 0) => this.at(seg, along, d, lift),
          quad = (list: number[][][], d0: number, d1: number, lift: number) => list.push([top(a, d0, lift), top(b, d0, lift), top(b, d1, lift), top(a, d1, lift)]);
        // The piece's top, its two sides and its underside.
        quad(base, half, -half, 0);
        for (const d of [half, -half]) base.push([top(a, d), top(b, d), top(b, d, -THICK), top(a, d, -THICK)]);
        quad(base, -half, half, -THICK);
        for (const d of [half - 0.07, -half + 0.07]) quad(lines, d + 0.018, d - 0.018, 0.008);
        for (const d of offsets) {
          quad(slots, d + 0.032, d - 0.032, 0.006);
          for (const r of [d + 0.075, d - 0.075]) quad(rails, r + 0.016, r - 0.016, 0.01);
        }
        if (seg.kind === "curve") {
          const out = -Math.sign(seg.turn) * half,
            inward = -Math.sign(out);
          quad(kerbs, out, out + inward * 0.13, 0.008);
          kerbColors.push((Math.floor((seg.start + a) / 0.32) % 2 ? red : white).toArray());
        }
        // Railings on the high stretches, so that the bridge has sides.
        const h = laneAt(seg, a / seg.length, 0).h;
        if (h > 0.3) for (const d of [half, -half]) walls.push([top(a, d), top(b, d), top(b, d, RAIL_UP), top(a, d, RAIL_UP)]);
      }
    const mesh = (g: T.BufferGeometry, material: T.Material, shadow = false) => {
      const m = new T.Mesh(g, material);
      m.receiveShadow = true;
      m.castShadow = shadow;
      this.scene.add(m);
      return m;
    };
    mesh(quads(own, base), this.standard({ color: "#3b3e45", roughness: 0.85, side: T.DoubleSide }), true);
    mesh(quads(own, lines), this.standard({ color: "#ecebe4", roughness: 0.7, ...LIFTED }));
    mesh(quads(own, slots), this.standard({ color: "#08080a", roughness: 1, ...LIFTED }));
    mesh(quads(own, rails), this.standard({ color: "#c8ccd2", roughness: 0.3, metalness: 0.85, ...LIFTED }));
    if (kerbs.length) mesh(quads(own, kerbs, kerbColors), this.standard({ vertexColors: true, roughness: 0.7, ...LIFTED }));
    if (walls.length) mesh(quads(own, walls), this.standard({ color: "#d9dde2", roughness: 0.5, side: T.DoubleSide }), true);
    // The start line: two rows of black and white squares across the track.
    const seg0 = segments[0],
      across = Math.ceil((half * 2) / 0.13),
      squares: number[][][] = [],
      colors: number[][] = [];
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < across; c++) {
        const d0 = half - (c * half * 2) / across,
          d1 = half - ((c + 1) * half * 2) / across,
          a = row * 0.11,
          b = a + 0.11;
        squares.push([this.at(seg0, a, d0, 0.012), this.at(seg0, b, d0, 0.012), this.at(seg0, b, d1, 0.012), this.at(seg0, a, d1, 0.012)]);
        colors.push(((row + c) % 2 ? new T.Color("#111111") : white).toArray());
      }
    mesh(quads(own, squares, colors), this.standard({ vertexColors: true, roughness: 0.6, ...LIFTED }));
    this.pillars(own);
  }
  /** Pillars under every high stretch, a pair at a time with a beam across, where they stand clear of the track below. */
  private pillars(own: Own) {
    const { segments, half } = this.track,
      low: { x: number; y: number }[] = [];
    for (const seg of segments)
      for (let a = 0; a <= seg.length; a += 0.4) {
        const p = laneAt(seg, a / seg.length, 0);
        if (p.h < 0.2) low.push({ x: p.x, y: p.y });
      }
    const post = own(new T.BoxGeometry(0.14, 1, 0.14)),
      beam = own(new T.BoxGeometry(1, 0.1, 0.12)),
      grey = this.standard({ color: "#b9bcc2", roughness: 0.6 });
    for (const seg of segments)
      for (let a = 0.3; a < seg.length; a += 1.5) {
        const mid = laneAt(seg, a / seg.length, 0);
        if (mid.h < 0.3) continue;
        const feet = [half - 0.18, -half + 0.18].map((d) => laneAt(seg, a / seg.length, d));
        if (feet.some((f) => low.some((p) => Math.hypot(p.x - f.x, p.y - f.y) < this.track.half + 0.2))) continue;
        for (const f of feet) {
          const s = scenePoint(this.track, f.x, f.y, f.h),
            tall = s.y - THICK;
          const m = new T.Mesh(post, grey);
          m.scale.y = tall;
          m.position.set(s.x, tall / 2, s.z);
          m.castShadow = m.receiveShadow = true;
          this.scene.add(m);
        }
        // The beam lies across under the track from foot to foot, tilted as the track is (on a banked curve its ends
        // stuck up through the surface when it was kept level).
        const [l, r] = feet.map((f) => scenePoint(this.track, f.x, f.y, f.h)),
          from = new T.Vector3(l.x, l.y - THICK - 0.05, l.z),
          to = new T.Vector3(r.x, r.y - THICK - 0.05, r.z),
          m = new T.Mesh(beam, grey);
        m.scale.x = from.distanceTo(to);
        m.position.copy(from).add(to).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), to.clone().sub(from).normalize());
        this.scene.add(m);
      }
  }
  /** The start lights over the line: two posts, a bar and three lamps that light red one by one and then green. */
  private gantry(own: Own) {
    const seg = this.track.segments[0],
      { half } = this.track,
      metal = this.standard({ color: "#3a3f47", roughness: 0.4, metalness: 0.6 }),
      tall = 1.05,
      g = new T.Group();
    for (const d of [half + 0.16, -half - 0.16]) {
      const [x, y, z] = this.at(seg, 0.12, d);
      this.add(new T.BoxGeometry(0.1, tall, 0.1), metal, x, y + tall / 2 - SURFACE + 0.02, z);
    }
    const [x0, y0, z0] = this.at(seg, 0.12, 0);
    g.position.set(x0, y0 + tall, z0);
    g.rotation.y = seg.heading + Math.PI / 2;
    this.scene.add(g);
    this.add(new T.BoxGeometry(half * 2 + 0.42, 0.16, 0.14), metal, 0, 0, 0, g);
    this.add(new T.BoxGeometry(0.9, 0.3, 0.16), this.standard({ color: "#16181c", roughness: 0.5 }), 0, 0.2, 0, g);
    const bulb = own(new T.SphereGeometry(0.075, 14, 10));
    for (let k = 0; k < 3; k++) {
      const material = this.standard({ color: "#3a1010", emissive: "#000000", roughness: 0.3 });
      this.lamps.push(material);
      const m = new T.Mesh(bulb, material);
      m.position.set((k - 1) * 0.26, 0.22, 0.09);
      g.add(m);
    }
  }
  /** Lights the start lamps: `red` of them red, or all green. */
  private light(red: number, green = false) {
    this.lamps.forEach((m, k) => {
      const on = green || k < red,
        color = green ? "#22e060" : "#ff2a1e";
      m.color.set(on ? color : "#3a1010");
      m.emissive.set(on ? color : "#000000");
      m.emissiveIntensity = on ? 1.6 : 0;
    });
    this.redraw();
  }
  /**
   * A car of our own make, facing +x on the track: a low wedge body in its colour with a dark canopy, a rear wing on
   * two struts, its number on the roof, four wheels with silver hubs, headlamps, and under the nose the guide blade
   * with its two copper braids, down in the slot.
   */
  private makeCar(own: Own, k: number, seat = k): CarMesh {
    const group = new T.Group(),
      color = COLORS[seat],
      paint = own(glossy({ color, roughness: 0.32 }, 0.8)),
      dark = this.standard({ color: "#121316", roughness: 0.6 }),
      side = new T.Shape();
    side.moveTo(-0.3, 0.03);
    side.lineTo(0.29, 0.03);
    side.lineTo(0.31, 0.05);
    side.lineTo(0.22, 0.072);
    side.quadraticCurveTo(0.05, 0.088, -0.08, 0.1);
    side.lineTo(-0.27, 0.104);
    side.lineTo(-0.31, 0.065);
    side.closePath();
    const body = own(new T.ExtrudeGeometry(side, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 }));
    body.translate(0, 0, -0.125);
    this.add(body, paint, 0, 0, 0, group);
    const canopy = own(new T.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2));
    const glass = new T.Mesh(canopy, this.standard({ color: "#1a2430", roughness: 0.15, metalness: 0.4 }));
    glass.scale.set(0.11, 0.055, 0.075);
    glass.position.set(-0.04, 0.095, 0);
    glass.castShadow = true;
    group.add(glass);
    // The wing, on its struts.
    this.add(new T.BoxGeometry(0.07, 0.012, 0.3), paint, -0.285, 0.15, 0, group);
    for (const z of [-0.08, 0.08]) this.add(new T.BoxGeometry(0.03, 0.05, 0.012), dark, -0.28, 0.125, z, group);
    // Its number on the roof.
    const number = new T.Mesh(own(new T.CircleGeometry(0.052, 24)), this.standard({ map: roundel(own, seat + 1), roughness: 0.5 }));
    number.rotation.x = -Math.PI / 2;
    number.position.set(0.12, 0.0935, 0);
    group.add(number);
    // Headlamps.
    const lampMat = this.standard({ color: "#fff4c2", emissive: "#fff0a0", emissiveIntensity: 0.6 });
    for (const z of [-0.085, 0.085]) this.add(new T.BoxGeometry(0.02, 0.014, 0.04), lampMat, 0.305, 0.052, z, group);
    // Wheels: black tyres with silver hubs; the rear ones a little larger.
    const tyre = this.standard({ color: "#141414", roughness: 0.9 }),
      hub = this.standard({ color: "#d6d9de", roughness: 0.25, metalness: 0.85 }),
      wheels: T.Mesh[] = [];
    for (const [x, r] of [[0.19, 0.048], [-0.19, 0.054]] as const)
      for (const z of [-0.138, 0.138]) {
        const w = this.add(new T.CylinderGeometry(r, r, 0.05, 18).rotateX(Math.PI / 2), tyre, x, r, z, group);
        this.add(new T.CylinderGeometry(r * 0.55, r * 0.55, 0.052, 12).rotateX(Math.PI / 2), hub, 0, 0, 0, w);
        wheels.push(w);
      }
    // The guide blade and its braids, down in the slot under the nose.
    this.add(new T.BoxGeometry(0.1, 0.045, 0.012), this.standard({ color: "#e05a1a", roughness: 0.5 }), 0.255, 0.0, 0, group);
    const copper = this.standard({ color: "#c57a3a", roughness: 0.35, metalness: 0.8 });
    for (const z of [-0.022, 0.022]) this.add(new T.BoxGeometry(0.07, 0.004, 0.018), copper, 0.25, 0.002, z, group);
    group.rotation.order = "YXZ";
    group.scale.setScalar(CAR_SCALE);
    this.scene.add(group);
    return { group, wheels, rolled: 0 };
  }
  /**
   * My car's "나" over the track over Wi-Fi (every device sees the whole course, so it says which car is its own): a
   * tag in my car's colour that floats over it wherever it goes, seen through the bridge.
   */
  private makeTag(own: Own, color: string) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(8, 6, 112, 64, 18);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(48, 68);
    ctx.lineTo(64, 90);
    ctx.lineTo(80, 68);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 44px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("나", 64, 40);
    const map = own(new T.CanvasTexture(c));
    map.colorSpace = T.SRGBColorSpace;
    const tag = new T.Sprite(own(new T.SpriteMaterial({ map, depthTest: false, transparent: true })));
    tag.scale.set(0.88, 0.66, 1);
    tag.renderOrder = 10;
    this.scene.add(tag);
    return tag;
  }
  /** Runs the race for the time that has passed since the last frame. */
  private advance(now: number) {
    const real = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    const world = this.world,
      live = this.live;
    if (live && !live.host) this.follow(now);
    else if (world && this.running()) {
      this.left += real;
      while (this.left >= DT && this.running()) {
        this.left -= DT;
        // Over Wi-Fi the host's race takes each car's pedal from whoever drives it: my hand, a guest's, the computer.
        const throttles = live
          ? hostThrottles(world, this.state!.seats ?? [], (seat) => live.control(seat), (seat) => (live as LiveHost).latest(seat), this.mine !== null && this.held(this.mine), this.level)
          : world.cars.map((_, k) => (k < this.people ? this.held(k) : autopilot(world, k, this.level)));
        for (const event of step(world, throttles, this.level)) this.tell(event);
      }
      this.sound();
    } else {
      this.left = 0;
      this.hush();
    }
    // The host tells its race to the guests (paused or not, so that one coming back sees it).
    if (live?.host && world && this.state) live.tick(() => snapOf(world), now);
    if (world) {
      world.cars.forEach((car, k) => (this.cars[k].rolled += car.v * real));
      this.pose();
    }
    this.redraw();
  }
  /**
   * A guest's frame: my pedal is sent to the host, and the host's race is drawn a moment behind (`LiveGuest.frame`);
   * the lights, the laps of my car, flights off and cars set back are heard and seen here as their counts change.
   * The moves (laps, flights off, the end) come from the room, made by the host.
   */
  private follow(now: number) {
    const live = this.live as LiveGuest,
      world = this.world;
    if (!world) return;
    const playing = this.mine !== null && this.running() && !live.paused;
    live.tick(() => (this.mine === null ? null : inputOf(playing && this.held(this.mine))), now);
    const frame = live.frame(now),
      a = frame && readSnap(frame.a.data),
      b = frame && readSnap(frame.b.data);
    if (!frame || !a || !b) return;
    follow(world, a, b, frame.t);
    const heard = this.heard,
      start = ticks(COUNTDOWN);
    // Come in late (or back from a drop): the lights as they stand.
    if (!heard) this.light(world.tick >= start ? 0 : Math.min(3, Math.floor(world.tick / ticks(1)) + 1), world.tick >= start);
    else {
      for (const n of [1, 2, 3]) if (heard.tick <= ticks(n - 1) && world.tick > ticks(n - 1) && world.tick < start) this.tell({ kind: "light", n });
      if (heard.tick < start && world.tick >= start) this.tell({ kind: "go" });
      world.cars.forEach((car, k) => {
        if (car.laps > heard.laps[k] && this.isMine(k)) this.onKnock?.("lap", 1);
        if (car.offs > heard.offs[k]) this.onKnock?.("crash", Math.min(1, b.cars[k].v / VMAX + 0.4) * (this.isMine(k) ? 1 : 0.6));
        if (heard.phases[k] === "off" && car.phase === "slot") this.tell({ kind: "back", car: k });
      });
    }
    this.heard = { tick: world.tick, laps: world.cars.map((c) => c.laps), offs: world.cars.map((c) => c.offs), phases: world.cars.map((c) => c.phase) };
    if (world.closed === null && !live.paused && !document.hidden) this.sound();
    else this.hush();
  }
  /** What a slice of the race did, told to the screen (moves) and the ear. */
  private tell(event: RaceEvent) {
    const mine = (car: number) => this.isMine(car);
    if (event.kind === "light") {
      this.light(event.n);
      shout(String(4 - event.n));
      this.onKnock?.("light", 0.5);
    } else if (event.kind === "go") {
      this.light(0, true);
      shout("출발!");
      this.onKnock?.("go", 1);
    } else if (event.kind === "lap") {
      if (mine(event.car)) this.onKnock?.("lap", 1);
      this.onMove({ from: -1, to: LAP + event.car, extra: -1 });
    } else if (event.kind === "off") {
      this.onKnock?.("crash", Math.min(1, event.speed / VMAX) * (mine(event.car) ? 1 : 0.6));
      this.onMove({ from: -1, to: OFF + event.car, extra: -1 });
    } else if (event.kind === "back") this.onKnock?.("back", mine(event.car) ? 0.8 : 0.4);
    else if (event.kind === "end") {
      this.hush();
      this.onMove({ from: -1, to: END, extra: packRanking(event.ranking) });
    }
  }
  /** The motors: the people's cars by their pedal and speed, the computer's as one quieter pack. */
  private sound() {
    const world = this.world!;
    let mine = 0,
      pedal = false,
      pack = 0,
      screech = 0;
    world.cars.forEach((car, k) => {
      const level = car.phase === "off" ? 0 : car.v / VMAX;
      if (this.isMine(k)) {
        screech = Math.max(screech, strain(world, k));
        if (level >= mine) {
          mine = level;
          pedal = car.throttle;
        }
      } else pack = Math.max(pack, level);
    });
    if (world.tick < ticks(COUNTDOWN)) mine = screech = 0;
    this.onKnock?.(pedal ? "whine" : "coast", mine);
    this.onKnock?.("pack", pack);
    this.onKnock?.("screech", screech);
  }
  private hush() {
    this.onKnock?.("whine", 0);
    this.onKnock?.("pack", 0);
    this.onKnock?.("screech", 0);
  }
  /** Puts every car where the race has it: in its slot (the tail stepping out as it slides), in the air, or set back. */
  private pose() {
    const world = this.world!,
      blink = Math.floor(performance.now() / 110) % 2 === 0;
    world.cars.forEach((car, k) => {
      const mesh = this.cars[k],
        g = mesh.group;
      mesh.wheels.forEach((w) => (w.rotation.z = -mesh.rolled / 0.05));
      if (car.phase === "off" && car.off && car.off.t < FLY) {
        const off = car.off,
          s = scenePoint(this.track, off.x, off.y, off.h);
        g.position.set(s.x, s.y + 0.02, s.z);
        g.rotation.set(off.roll, off.yaw, off.pitch, "YXZ");
        g.visible = true;
        return;
      }
      const pose = poseOf(world, k, CAR_LENGTH / 2),
        seg = world.track.segments[car.seg],
        drift = car.phase === "slot" ? Math.sign(seg.turn) * car.slide * 0.42 : 0,
        s = scenePoint(this.track, pose.x, pose.y, pose.h);
      g.position.set(s.x, s.y, s.z);
      g.rotation.set(-pose.bank, pose.heading + drift, Math.atan(pose.slope), "YXZ");
      // Set back by the marshal: it blinks in its slot until the penalty is over.
      g.visible = car.phase !== "off" || blink;
    });
    if (this.tag && this.mine !== null) {
      const g = this.cars[this.mine].group;
      this.tag.position.set(g.position.x, Math.max(g.position.y, 0) + 0.8, g.position.z);
    }
    this.describe();
  }
  /** The board of laps and places over the table, and what browser tests read off the canvas. */
  private describe() {
    const world = this.world!,
      state = this.state!,
      order = ranking(world),
      leader = world.cars[order[0]],
      closed = world.closed !== null || state.ranking !== null,
      lap = Math.min(world.laps, leader.laps + 1),
      rows = order
        .map((k, i) => {
          const car = world.cars[k],
            status = car.place !== null ? "완주" : car.phase === "off" ? "이탈" : `${Math.min(world.laps, car.laps + 1)}/${world.laps}`;
          const me = this.live ? k === this.mine : k < this.people && this.people === 1;
          return `<li class="${me ? "me" : ""}${car.phase === "off" ? " out" : ""}"><b>${i + 1}</b><i style="background:${COLORS[seatOfCar(state, k)]}"></i><span>${this.live && me ? "나" : carName(state, k)}</span><em>${status}</em></li>`;
        })
        .join(""),
      text = `<div class="sc-head">${closed ? "<b>결승 순위</b>" : world.tick < ticks(COUNTDOWN) ? "<b>출발 준비</b>" : `<b>LAP ${lap}/${world.laps}</b>`}</div><ol>${rows}</ol>`;
    if (text !== this.boardText) {
      this.boardText = text;
      this.board.innerHTML = text;
    }
    const data = this.renderer.domElement.dataset;
    data.phase = closed ? "over" : world.tick < ticks(COUNTDOWN) ? "countdown" : "race";
    data.progress = world.cars.map((_, k) => progress(world, k).toFixed(2)).join(",");
    data.speeds = world.cars.map((car) => car.v.toFixed(2)).join(",");
    data.laps = world.cars.map((car) => car.laps).join(",");
    data.offs = world.cars.map((car) => car.offs).join(",");
    data.lanes = String(world.track.lanes);
    data.mine = this.mine === null ? "" : String(this.mine);
  }
  protected subject(aspect: number): TableSubject {
    return slotSubject(this.track, aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    if (!this.built) this.build(state);
    if (this.world) this.pose();
  }
  protected animate() {
    return false;
  }
  protected mark() {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    clearTimeout(this.letGoTimer);
    document.removeEventListener("keydown", this.keyDown);
    document.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.blurred);
    document.removeEventListener("visibilitychange", this.hidden);
    this.hud.remove();
    this.pedalBox.remove();
    super.dispose();
  }
}
