import * as T from "three";
import { afterGPUFrame, aim, wood } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";
import { hanokYard } from "../../engine/scenery";
import { FINISHED, PIECES, WAITING } from "./rules";

/** What the yard shows. The view draws stations; it knows no rules. */
export interface YardModel {
  pieces: [number[], number[]];
  /** True where a stick lies flat side up. */
  sticks: boolean[];
  /** Changes with every throw, so a redraw is not mistaken for one. */
  throwId: number;
  /** Changes with every move; `walk` is the road the moved pieces took. */
  moveId: number;
  walk: { player: 0 | 1; from: number; path: number[] } | null;
}
export interface Marks {
  /** Stations (or `WAITING`) holding pieces that may be picked up. */
  movable: number[];
  selected: number | null;
  /** Stations (or `FINISHED`) the selected pieces may go to. */
  targets: number[];
  turn: 0 | 1;
  /** The sticks may be tapped to throw them. */
  canThrow?: boolean;
}

// Everything is laid out round the origin; the board sits a little toward the house.
const BOARD_Z = 0.25,
  REACH = 2.5,
  STEP = (REACH * 2) / 5,
  THROW_Z = 4.35,
  WAIT_X = 3.0,
  HOME_Z = -3.0,
  PIECE_R = 0.27,
  PIECE_H = 0.13,
  STICK_R = 0.17,
  STICK_L = 1.55;
export const COLORS = ["#2f5fa8", "#c23b2b"];
/** Where a station lies on the ground. */
export function stationAt(station: number): { x: number; z: number } {
  const at = (x: number, z: number) => ({ x, z: z + BOARD_Z });
  if (station <= 5) return at(REACH, REACH - station * STEP);
  if (station <= 10) return at(REACH - (station - 5) * STEP, -REACH);
  if (station <= 15) return at(-REACH, -REACH + (station - 10) * STEP);
  if (station <= 19) return at(-REACH + (station - 15) * STEP, REACH);
  if (station === 22) return at(0, 0);
  // The short roads: 20–21 and 23–24 from corner 5 to corner 15, 25–26 and 27–28 from corner 10 to the start.
  const along = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2 / 3, 1 / 3, 0, -1 / 3, -2 / 3, 2 / 3, 1 / 3, -1 / 3, -2 / 3][station] * REACH;
  return station === 20 || station === 21 || station === 23 || station === 24 ? at(along, -along) : at(-along, -along);
}
/** The spot beyond the start where pieces leave the board. */
export const EXIT = { x: REACH + 0.95, z: REACH + BOARD_Z };
/** Where a player's waiting or finished pieces are set down. */
function restAt(player: number, index: number, finished: boolean) {
  const side = player === 0 ? -1 : 1;
  return finished
    ? { x: side * (REACH + 0.95), z: HOME_Z + index * 0.62 }
    : { x: side * (WAIT_X + (index % 2) * 0.62), z: THROW_Z - 0.35 + Math.floor(index / 2) * 0.62 };
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, repeat = 1) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}
function noise(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** Speckled ground: packed earth, or grey stone. */
function speckled(base: string, marks: string[], seed: number, repeat: number) {
  const { c, ctx } = canvas(256, 256),
    rand = noise(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = marks[Math.floor(rand() * marks.length)];
    const size = 1 + rand() * 2.4;
    ctx.fillRect(rand() * 256, rand() * 256, size, size);
  }
  return texture(c, repeat);
}
/** A straw mat: rows of twisted straw bound by darker cords. */
function strawTexture() {
  const { c, ctx } = canvas(512, 512),
    rand = noise(5);
  ctx.fillStyle = "#c2a565";
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 8) {
    ctx.fillStyle = `rgba(${150 + rand() * 60}, ${118 + rand() * 40}, 52, 0.55)`;
    ctx.fillRect(0, y, 512, 5);
    for (let x = (y / 8) % 2 ? 0 : 6; x < 512; x += 12) {
      ctx.fillStyle = `rgba(96, 66, 24, ${0.12 + rand() * 0.14})`;
      ctx.fillRect(x, y, 2, 8);
    }
  }
  for (let x = 32; x < 512; x += 64) {
    ctx.fillStyle = "rgba(92, 62, 24, 0.38)";
    ctx.fillRect(x, 0, 4, 512);
  }
  return texture(c, 3);
}
/** The board: hanji with the twenty-nine stations in ink. */
function boardTexture() {
  const size = 1024,
    { c, ctx } = canvas(size, size),
    rand = noise(23),
    scale = size / (REACH * 2 + 1.1),
    px = (station: number) => {
      const p = stationAt(station);
      return [size / 2 + p.x * scale, size / 2 + (p.z - BOARD_Z) * scale] as const;
    };
  ctx.fillStyle = "#efe2c2";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(120, 92, 48, ${rand() * 0.07})`;
    ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 26, 1.5);
  }
  ctx.strokeStyle = "#3a2c1f";
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(58, 44, 31, 0.55)";
  const line = (stations: number[]) => {
    ctx.beginPath();
    stations.forEach((s, i) => (i ? ctx.lineTo(...px(s)) : ctx.moveTo(...px(s))));
    ctx.stroke();
  };
  line([0, 5, 10, 15, 0]);
  line([5, 22, 15]);
  line([10, 22, 0]);
  for (let s = 0; s < 29; s++) {
    const [x, y] = px(s),
      big = s % 5 === 0 && s <= 15 ? true : s === 22;
    ctx.fillStyle = "#f8efd8";
    ctx.strokeStyle = "#3a2c1f";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x, y, big ? 52 : 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (big) {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, 38, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const [sx, sy] = px(0);
  ctx.fillStyle = "#b3321f";
  ctx.font = '700 34px "Noto Serif KR", "Noto Serif CJK KR", AppleMyungjo, Batang, serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("출발", sx, sy);
  return texture(c);
}
/** The flat face of a stick; the marked one carries the 빽도 sign. */
function stickFace(marked: boolean) {
  const { c, ctx } = canvas(64, 512),
    rand = noise(marked ? 3 : 9);
  ctx.fillStyle = "#ecd9ae";
  ctx.fillRect(0, 0, 64, 512);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(150, 108, 52, ${rand() * 0.2})`;
    ctx.fillRect(rand() * 64, 0, 1.5, 512);
  }
  if (marked) {
    ctx.fillStyle = "#b3321f";
    ctx.beginPath();
    ctx.arc(32, 256, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
/** The round back of a stick: dark bark with three carved crosses. */
function stickBack() {
  const { c, ctx } = canvas(128, 512);
  ctx.fillStyle = "#6a4326";
  ctx.fillRect(0, 0, 128, 512);
  ctx.strokeStyle = "#e9d5a6";
  ctx.lineWidth = 7;
  for (const y of [150, 256, 362]) {
    ctx.beginPath();
    ctx.moveTo(40, y - 30);
    ctx.lineTo(88, y + 30);
    ctx.moveTo(88, y - 30);
    ctx.lineTo(40, y + 30);
    ctx.stroke();
  }
  return texture(c);
}
interface Tween {
  object: T.Object3D;
  start: number;
  duration: number;
  /** Points visited in order; one hop between each pair. */
  points: T.Vector3[];
  hop: number;
  toTurn?: T.Quaternion;
  spins?: number;
  bounces?: number;
  contact: boolean;
}
const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0);

/** A yut board on a straw mat in the yard of a Korean house. */
export class YutView {
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
  private pieces: T.Mesh[][] = [[], []];
  private sticks: T.Group[] = [];
  private stickYaw = [0.2, -0.3, 0.1, -0.15];
  private rings = new T.Group();
  private ringGeometry: T.RingGeometry;
  private ringMaterials: T.MeshBasicMaterial[];
  private tweens: Tween[] = [];
  private model: YardModel | null = null;
  private marks: Marks = { movable: [], selected: null, targets: [], turn: 0 };
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A stick or a piece touched the ground. */
  onContact: (stick: boolean) => void = () => {};
  /** Every animation has finished. */
  onSettled: () => void = () => {};
  /** The sticks were tapped while they may be thrown. */
  onThrow: () => void = () => {};
  /** A station, a waiting place (`WAITING`) or the exit (`FINISHED`) was tapped. */
  onPick: (station: number) => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  private standard(options: T.MeshStandardMaterialParameters) {
    return this.own(new T.MeshStandardMaterial({ roughness: 0.85, ...options }));
  }
  private add(geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true) {
    const mesh = new T.Mesh(this.own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#b89a6c");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // Every action is also a button beside the yard; the canvas is a shortcut.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    // Afternoon sun over the roof.
    this.scene.add(new T.HemisphereLight("#fff3da", "#6b5335", 1.7));
    const sun = new T.DirectionalLight("#ffe9c4", 2.1);
    sun.position.set(-5, 10, -3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.buildYard();
    this.ringGeometry = this.own(new T.RingGeometry(0.33, 0.43, 40));
    this.ringMaterials = ["#f4d06a", "#ffffff", "#7fe0a2", "#e3261c"].map((color) =>
      this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })),
    );
    this.scene.add(this.rings);
    // Pieces: lacquered wooden discs, blue for one side and red for the other.
    const disc = this.own(new T.CylinderGeometry(PIECE_R, PIECE_R * 1.05, PIECE_H, 28));
    COLORS.forEach((color, player) => {
      const material = this.standard({ color, roughness: 0.6 });
      for (let i = 0; i < PIECES; i++) {
        const mesh = new T.Mesh(disc, material);
        mesh.castShadow = true;
        const rest = restAt(player, i, false);
        mesh.position.set(rest.x, PIECE_H / 2, rest.z);
        this.pieces[player].push(mesh);
        this.scene.add(mesh);
      }
    });
    // Sticks: half-round lengths of wood, flat on one face.
    const round = this.own(new T.CylinderGeometry(STICK_R, STICK_R, STICK_L, 14, 1, false, 0, Math.PI)),
      flat = this.own(new T.PlaneGeometry(STICK_R * 2, STICK_L)),
      back = this.standard({ map: this.own(stickBack()), roughness: 0.7 }),
      faces = [true, false].map((marked) => this.standard({ map: this.own(stickFace(marked)), roughness: 0.6 }));
    for (let i = 0; i < 4; i++) {
      const stick = new T.Group(),
        body = new T.Group(),
        bark = new T.Mesh(round, back),
        face = new T.Mesh(flat, faces[i === 0 ? 0 : 1]);
      face.rotation.y = -Math.PI / 2;
      bark.castShadow = face.castShadow = true;
      body.add(bark, face);
      // The round side points up and the stick lies along x.
      body.rotation.z = Math.PI / 2;
      stick.add(body);
      this.sticks.push(stick);
      this.scene.add(stick);
    }
    this.placeSticks([false, false, false, false], true);
    const canvas = this.renderer.domElement;
    let down: { pointer: number; x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down = e.pointerType === "mouse" && e.button !== 0 ? null : { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (this.disposed || this.animating || tap?.pointer !== e.pointerId) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
      const station = this.stationUnder(e);
      if (station !== null) this.onPick(station);
      else if (this.marks.canThrow && this.overSticks()) this.onThrow();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.animating) return;
      const station = this.stationUnder(e),
        live = station !== null && (this.marks.movable.includes(station) || this.marks.targets.includes(station));
      canvas.style.cursor = live || (station === null && this.marks.canThrow && this.overSticks()) ? "pointer" : "";
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
  /** The yard: earth, the straw mat with the board, and the house behind it. */
  private buildYard() {
    const flatOn = (mesh: T.Mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    };
    hanokYard(this.scene, (resource) => this.own(resource));
    const straw = this.standard({ map: this.own(strawTexture()), roughness: 1 });
    this.add(new T.BoxGeometry(8.6, 0.05, 10.2), straw, 0, -0.026, 0.55, false);
    const board = this.own(new T.MeshStandardMaterial({ map: this.own(boardTexture()), roughness: 0.9 }));
    flatOn(this.add(new T.PlaneGeometry(REACH * 2 + 1.1, REACH * 2 + 1.1), board, 0, 0.004, BOARD_Z, false));
  }
  /** True when the last aimed ray meets the strip where the sticks lie. */
  private overSticks() {
    const hit = new T.Vector3();
    return (
      !!this.ray.ray.intersectPlane(this.ground, hit) &&
      Math.abs(hit.x) < 2.1 &&
      Math.abs(hit.z - THROW_Z) < 1.0
    );
  }
  private stationUnder(e: PointerEvent): number | null {
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const hit = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    let best: number | null = null,
      nearest = 0.5;
    for (let s = 0; s < 29; s++) {
      const p = stationAt(s),
        d = Math.hypot(p.x - hit.x, p.z - hit.z);
      if (d < nearest) {
        nearest = d;
        best = s;
      }
    }
    if (best !== null) return best;
    if (Math.hypot(EXIT.x - hit.x, EXIT.z - hit.z) < 0.55) return FINISHED;
    // The waiting places lie beside the throwing strip, one on each side.
    return Math.abs(hit.z - THROW_Z) < 0.95 && Math.abs(Math.abs(hit.x) - WAIT_X - 0.31) < 0.75 ? WAITING : null;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const subject = SUBJECTS.yut,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Where each piece of `model` rests: stacked on its station, waiting, or home. */
  private places(model: YardModel) {
    return model.pieces.map((stations, player) => {
      let waiting = 0,
        home = 0;
      return stations.map((station, i) => {
        if (station === WAITING || station === FINISHED) {
          const rest = restAt(player, station === WAITING ? waiting++ : home++, station === FINISHED);
          return new T.Vector3(rest.x, PIECE_H / 2, rest.z);
        }
        const p = stationAt(station),
          below = stations.slice(0, i).filter((s) => s === station).length;
        return new T.Vector3(p.x, PIECE_H / 2 + below * (PIECE_H + 0.012), p.z);
      });
    });
  }
  private stickTurn(i: number, flat: boolean) {
    return new T.Quaternion()
      .setFromAxisAngle(Y, this.stickYaw[i])
      .multiply(new T.Quaternion().setFromAxisAngle(X, flat ? Math.PI : 0));
  }
  private stickSpot(i: number, flat: boolean) {
    return new T.Vector3((i - 1.5) * 0.62 + Math.sin(this.stickYaw[i] * 7) * 0.12, flat ? STICK_R + 0.01 : 0.01, THROW_Z + Math.cos(this.stickYaw[i] * 5) * 0.28);
  }
  private placeSticks(flats: boolean[], tidy = false) {
    this.sticks.forEach((stick, i) => {
      if (tidy) this.stickYaw[i] = Math.PI / 2 + (i - 1.5) * 0.05;
      stick.position.copy(tidy ? new T.Vector3((i - 1.5) * 0.42, 0.01, THROW_Z) : this.stickSpot(i, flats[i]));
      stick.quaternion.copy(this.stickTurn(i, flats[i]));
    });
  }
  /**
   * Shows `model`. A new throw tosses the sticks; a new move walks the moved
   * pieces along their road, and every other piece slides to its place.
   */
  sync(model: YardModel, animate = true) {
    if (this.disposed) return;
    const before = this.model,
      thrown = !!before && model.throwId !== before.throwId,
      walked = !!before && model.moveId !== before.moveId && !!model.walk,
      quick = !animate || this.reducedMotion,
      now = performance.now();
    this.model = model;
    this.dirty = true;
    this.finish();
    if (thrown || (!before && model.throwId > 0)) {
      this.sticks.forEach((stick, i) => {
        this.stickYaw[i] = (Math.random() - 0.5) * 1.5;
        const to = this.stickSpot(i, model.sticks[i]),
          toTurn = this.stickTurn(i, model.sticks[i]);
        if (quick || !thrown) {
          stick.position.copy(to);
          stick.quaternion.copy(toTurn);
        } else
          this.tweens.push({
            object: stick,
            start: now + i * 45,
            duration: 1150,
            // Thrown from the near side: it lands short, then skips twice to rest.
            points: [
              new T.Vector3((i - 1.5) * 0.3, 0.9, THROW_Z + 2.4),
              new T.Vector3(to.x + (Math.random() - 0.5) * 0.5, to.y, to.z + 0.45 + Math.random() * 0.25),
              new T.Vector3(to.x + (Math.random() - 0.5) * 0.2, to.y, to.z + 0.14),
              to,
            ],
            hop: 2.3,
            toTurn,
            spins: 2 + Math.floor(Math.random() * 3),
            contact: true,
          });
      });
    } else if (model.throwId === 0 && (!before || before.throwId !== 0)) this.placeSticks(model.sticks, true);
    const places = this.places(model);
    let delay = 0;
    places.forEach((spots, player) =>
      spots.forEach((to, i) => {
        const mesh = this.pieces[player][i];
        if (quick) {
          mesh.position.copy(to);
          return;
        }
        if (mesh.position.distanceToSquared(to) < 1e-6) return;
        const walk = walked && model.walk!.player === player && model.pieces[player][i] === model.walk!.path.at(-1) && before!.pieces[player][i] === model.walk!.from ? model.walk! : null;
        if (walk) {
          const points = [mesh.position.clone()];
          walk.path.forEach((station, k) => {
            if (k === walk.path.length - 1) points.push(to);
            else {
              const p = stationAt(station);
              points.push(new T.Vector3(p.x, to.y, p.z));
            }
          });
          this.tweens.push({ object: mesh, start: now, duration: 190 * walk.path.length, points, hop: 0.4, contact: true });
          delay = Math.max(delay, 190 * walk.path.length - 120);
        } else
          this.tweens.push({ object: mesh, start: -1, duration: 420, points: [mesh.position.clone(), to], hop: 0.9, contact: false });
      }),
    );
    // Pieces sent back or restacked leave as the walking piece arrives.
    for (const t of this.tweens) if (t.start === -1) t.start = now + delay;
    this.drawMarks();
    if (!this.tweens.length) this.onSettled();
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
    const ring = (x: number, z: number, y: number, kind: number, scale = 1) => {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[kind]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 2;
      this.rings.add(mesh);
    };
    const spot = (station: number) =>
      station === FINISHED
        ? EXIT
        : station === WAITING
          ? { x: (this.marks.turn === 0 ? -1 : 1) * (WAIT_X + 0.31), z: THROW_Z - 0.04 }
          : stationAt(station);
    for (const station of this.marks.movable) {
      const p = spot(station),
        chosen = station === this.marks.selected;
      ring(p.x, p.z, 0.012, chosen ? 1 : 2, station === WAITING ? 2.1 : 1);
    }
    if (this.marks.canThrow) {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[0]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.006, THROW_Z);
      mesh.scale.set(5.2, 2.5, 1);
      this.rings.add(mesh);
    }
    for (const station of this.marks.targets) {
      const p = spot(station);
      // Red: gold was lost against the board.
      ring(p.x, p.z, 0.014, 3, station === FINISHED ? 1.25 : 1);
    }
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    const spin = new T.Quaternion();
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      const legs = t.points.length - 1;
      let leg = Math.min(legs - 1, Math.floor(p * legs)),
        local = p * legs - leg,
        hop = t.hop;
      if (t.toTurn) {
        // A thrown stick: one long flight, then two quick, lower bounces.
        const ends = [0, 0.56, 0.82, 1];
        leg = p < ends[1] ? 0 : p < ends[2] ? 1 : 2;
        local = (p - ends[leg]) / (ends[leg + 1] - ends[leg]);
        hop = [t.hop, 0.5, 0.16][leg];
        if (leg > (t.bounces ?? 0)) {
          t.bounces = leg;
          this.onContact(true);
        }
        // It keeps turning as it skips, slower with every bounce.
        spin.setFromAxisAngle(X, (1 - p) ** 2 * (t.spins ?? 0) * Math.PI * 2);
        t.object.quaternion.copy(t.toTurn).multiply(spin);
        t.object.rotateOnWorldAxis(Y, (1 - p) * (leg ? 0.5 : 1.2) * ((t.spins ?? 0) % 2 ? 1 : -1));
      }
      t.object.position.lerpVectors(t.points[leg], t.points[leg + 1], local);
      t.object.position.y += Math.sin(Math.PI * local) * hop;
      if (p < 1) return true;
      t.object.position.copy(t.points[legs]);
      if (t.toTurn) t.object.quaternion.copy(t.toTurn);
      if (t.contact) this.onContact(!!t.toTurn);
      return false;
    });
    if (!this.tweens.length) {
      this.drawMarks();
      this.onSettled();
    }
    return true;
  }
  /** Jumps every running animation to its end. */
  private finish() {
    for (const t of this.tweens) {
      t.object.position.copy(t.points[t.points.length - 1]);
      if (t.toTurn) t.object.quaternion.copy(t.toTurn);
    }
    this.tweens = [];
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
