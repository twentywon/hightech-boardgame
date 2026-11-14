import * as T from "three";
import { afterGPUFrame, wood } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import type { PointView } from "../../ui/point-game";
import type { Marks } from "../points/view";
import { LADDERS, SNAKES, type State } from "./rules";

export const SNAKES_SUBJECT: Subject & { tilt: number } = { half: 4.6, halfZ: 4.5, height: 0.9, lookY: 0, tilt: 1.02 };
const CELL = 0.8,
  BOARD_X = -0.55;
export const TOKENS = ["#d2452f", "#2f62c0"];
/** Centre of a square (1–100) on the board; 0 is the waiting place beside square 1. */
export function squareAt(square: number) {
  if (square <= 0) return { x: -5.5 * CELL, z: 4.5 * CELL };
  const row = Math.floor((square - 1) / 10),
    step = (square - 1) % 10,
    col = row % 2 ? 9 - step : step;
  return { x: (col - 4.5) * CELL, z: (4.5 - row) * CELL };
}
function boardTexture() {
  const size = 1024,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    unit = size / (CELL * 10),
    px = (square: number) => {
      const p = squareAt(square);
      return [size / 2 + p.x * unit, size / 2 + p.z * unit] as [number, number];
    },
    tints = ["#f6e7b8", "#cfe6c4", "#f3cfc0", "#c9dff0"];
  for (let square = 1; square <= 100; square++) {
    const [x, y] = px(square),
      cell = CELL * unit;
    ctx.fillStyle = tints[(square + Math.floor((square - 1) / 10)) % tints.length];
    ctx.fillRect(x - cell / 2, y - cell / 2, cell + 1, cell + 1);
    ctx.fillStyle = "rgba(40, 34, 28, 0.6)";
    ctx.font = `700 ${cell * 0.26}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(square), x - cell * 0.42, y - cell * 0.42);
  }
  // Ladders: two rails and their rungs.
  for (const [from, to] of Object.entries(LADDERS)) {
    const a = px(Number(from)),
      b = px(to),
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      nx = (-(b[1] - a[1]) / length) * 15,
      ny = ((b[0] - a[0]) / length) * 15;
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineCap = "round";
    ctx.lineWidth = 8;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(a[0] + nx * side, a[1] + ny * side);
      ctx.lineTo(b[0] + nx * side, b[1] + ny * side);
      ctx.stroke();
    }
    ctx.lineWidth = 6;
    for (let d = 26; d < length - 10; d += 34) {
      const x = a[0] + ((b[0] - a[0]) * d) / length,
        y = a[1] + ((b[1] - a[1]) * d) / length;
      ctx.beginPath();
      ctx.moveTo(x - nx, y - ny);
      ctx.lineTo(x + nx, y + ny);
      ctx.stroke();
    }
  }
  // Snakes: a winding body from the head down to the tail.
  Object.entries(SNAKES).forEach(([from, to], i) => {
    const a = px(Number(from)),
      b = px(to),
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      nx = -(b[1] - a[1]) / length,
      ny = (b[0] - a[0]) / length,
      colour = ["#3d8b4f", "#7a4fb0", "#c2562f", "#2f8a8a"][i % 4];
    ctx.strokeStyle = colour;
    ctx.lineWidth = 20;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const t = k / 40,
        sway = Math.sin(t * Math.PI * 4) * 24 * (1 - t * 0.5),
        x = a[0] + (b[0] - a[0]) * t + nx * sway,
        y = a[1] + (b[1] - a[1]) * t + ny * sway;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(a[0], a[1], 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(a[0] + nx * 8 * side, a[1] + ny * 8 * side, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.strokeStyle = "#3a2c1f";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function dieFace(value: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    at = [32, 64, 96],
    spots: Record<number, [number, number][]> = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [2, 0], [0, 2], [2, 2]],
      5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
      6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    };
  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = value === 1 ? "#c8321f" : "#16181a";
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(at[x], at[y], value === 1 ? 20 : 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
// Material slot → face value; opposite faces add up to seven.
const FACES = [3, 4, 1, 6, 2, 5];
/** Rotation that turns `face` upward. */
function upright(face: number) {
  const q = new T.Quaternion(),
    x = new T.Vector3(1, 0, 0),
    z = new T.Vector3(0, 0, 1);
  if (face === 6) q.setFromAxisAngle(x, Math.PI);
  else if (face === 2) q.setFromAxisAngle(x, -Math.PI / 2);
  else if (face === 5) q.setFromAxisAngle(x, Math.PI / 2);
  else if (face === 3) q.setFromAxisAngle(z, Math.PI / 2);
  else if (face === 4) q.setFromAxisAngle(z, -Math.PI / 2);
  return q;
}
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
}
/** A snakes-and-ladders board on a table, two tokens and a die. */
export class SnakesView implements PointView<State> {
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
  private tokens: T.Mesh[] = [];
  private die: T.Mesh;
  private tweens: Tween[] = [];
  private state: State | null = null;
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
    this.renderer.setClearColor("#543a28");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight("#fff4dc", "#4a3a2c", 2.2));
    const light = new T.DirectionalLight("#fff3dc", 2.4);
    light.position.set(-4, 10, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -8;
    light.shadow.camera.right = 8;
    light.shadow.camera.top = 8;
    light.shadow.camera.bottom = -8;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const standard = (options: T.MeshStandardMaterialParameters) =>
      this.own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
    const table = new T.Mesh(this.own(new T.PlaneGeometry(90, 90)), standard({ map: this.own(wood(true)) }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.1;
    table.receiveShadow = true;
    const side = CELL * 10,
      board = new T.Mesh(this.own(new T.BoxGeometry(side + 0.3, 0.1, side + 0.3)), [
        ...Array(2).fill(standard({ color: "#3a2c1f" })),
        standard({ map: this.own(boardTexture()), roughness: 0.9 }),
        ...Array(3).fill(standard({ color: "#3a2c1f" })),
      ]);
    board.position.set(BOARD_X, -0.05, 0);
    board.receiveShadow = true;
    this.scene.add(table, board);
    const pawn = this.own(new T.CylinderGeometry(0.1, 0.24, 0.6, 20));
    TOKENS.forEach((color) => {
      const token = new T.Mesh(pawn, standard({ color, roughness: 0.35 }));
      token.castShadow = true;
      const head = new T.Mesh(this.own(new T.SphereGeometry(0.16, 16, 12)), token.material);
      head.position.y = 0.36;
      head.castShadow = true;
      token.add(head);
      this.tokens.push(token);
      this.scene.add(token);
    });
    this.die = new T.Mesh(
      this.own(new T.BoxGeometry(0.7, 0.7, 0.7)),
      FACES.map((value) => standard({ map: this.own(dieFace(value)), roughness: 0.4 })),
    );
    this.die.castShadow = true;
    this.die.position.set(4.45, 0.35, 2.6);
    this.scene.add(this.die);
    // A tap anywhere rolls: there is nothing else to choose.
    const el = this.renderer.domElement;
    let down: number | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.pointerType === "mouse" && e.button !== 0 ? null : e.pointerId));
    el.addEventListener("pointerup", (e) => {
      if (down === e.pointerId && !this.disposed && !this.animating) this.onPick(0);
      down = null;
    });
    el.style.cursor = "pointer";
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
  /** Where a token stands: two tokens on one square stand side by side. */
  private stand(player: number, square: number, shared: boolean) {
    const p = squareAt(square),
      shift = square <= 0 ? (player ? 0.5 : -0.1) : shared ? (player ? 0.18 : -0.18) : 0;
    return new T.Vector3(p.x + BOARD_X + (square <= 0 ? 0 : shift), 0.3, p.z + (square <= 0 ? -shift : 0));
  }
  private place(state: State) {
    const shared = state.positions[0] === state.positions[1];
    this.tokens.forEach((token, player) => token.position.copy(this.stand(player, state.positions[player], shared)));
    if (state.roll) this.die.quaternion.copy(upright(state.roll.die));
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, SNAKES_SUBJECT);
    this.camera.position.set(0, Math.sin(SNAKES_SUBJECT.tilt) * distance, Math.cos(SNAKES_SUBJECT.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Shows `state`; a roll tumbles the die, walks the token square by square, then slides it. */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    const roll = state.roll;
    if (!animate || this.reducedMotion || !before || !roll || state.ply !== before.ply + 1) {
      this.place(state);
      this.onSettled();
      return;
    }
    this.place(before);
    const now = performance.now(),
      token = this.tokens[roll.player],
      to = upright(roll.die),
      axis = new T.Vector3(1, 0.4, 0.6).normalize(),
      spin = new T.Quaternion();
    this.tweens.push({
      start: now,
      duration: 520,
      update: (p) => {
        spin.setFromAxisAngle(axis, (1 - p) * Math.PI * 5);
        this.die.quaternion.copy(to).multiply(spin);
        this.die.position.y = 0.35 + Math.sin(Math.PI * p) * 0.9;
      },
    });
    let at = now + 560,
      from = token.position.clone();
    for (const square of roll.path) {
      const start = from.clone(),
        end = this.stand(roll.player, square, false);
      this.tweens.push({
        start: at,
        duration: 170,
        update: (p) => {
          token.position.lerpVectors(start, end, p);
          token.position.y += Math.sin(Math.PI * p) * 0.35;
          if (p === 1) this.onContact();
        },
      });
      at += 170;
      from = end;
    }
    if (roll.slide !== null) {
      const start = from.clone(),
        end = this.stand(roll.player, roll.slide, false);
      this.tweens.push({
        start: at + 120,
        duration: 520,
        update: (p) => {
          const e = p * p * (3 - 2 * p);
          token.position.lerpVectors(start, end, e);
          token.position.y += Math.sin(Math.PI * p) * 0.25;
        },
      });
    }
  }
  setMarks(_marks: Marks) {}
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.update(p);
      return p < 1;
    });
    if (!this.tweens.length && this.state) {
      this.place(this.state);
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
