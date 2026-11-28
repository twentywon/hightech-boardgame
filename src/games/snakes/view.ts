import * as T from "three";
import { afterGPUFrame, realism, block, hop, travel, pawn, glossy, wood, woodPhoto, capable, weave, fitCanvas } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import { capturing } from "../../ui/banner";
import type { PointView } from "../../ui/point-game";
import type { Marks } from "../points/view";
import type { State } from "./rules";
import { BOARD_THICK, BOARD_X, CELL, LADDER_LINES, LADDER_TOP, SNAKE_LINES, TABLE_Y, restHeight, rungsOf, squareAt, worldAt } from "./layout";
import { Heads, SnakeModel, ladderModel } from "./pieces";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LAWN, garden } from "./garden";
import { zoomable } from "../../engine/zoom";

export { squareAt } from "./layout";
export const SNAKES_SUBJECT: Subject & { tilt: number } = { half: 4.6, halfZ: 4.5, height: 0.9, lookY: 0, tilt: 1.02 };
/** The tokens' paint (`TOKEN_NAMES`: red, blue, green, yellow); the first two are the game for two. */
export const TOKENS = ["#d2452f", "#2f62c0", "#2f9a52", "#e6b52c"];
/** Our own cheerful paints for the squares; across a row and up a column no two neighbours share one. */
const PAINTS = ["#f7d65a", "#f4a28c", "#8fd3b0", "#8ec5ef", "#c9b0ea"];
const RIM = 0.15,
  FACE = CELL * 10 + RIM * 2;
/** The die's tray beside the board: where the die comes to rest, and where it is thrown in from. */
const TRAY = { x: 4.42, z: 2.45, w: 1.12, d: 1.95 },
  DIE = 0.62,
  DIE_REST = new T.Vector3(TRAY.x, TABLE_Y + 0.05 + DIE / 2, TRAY.z + 0.25),
  DIE_FROM = new T.Vector3(TRAY.x + 0.05, TABLE_Y + 0.05 + DIE / 2, TRAY.z - 0.55);
/** `colour` lightened (amount > 0) or darkened. */
function shade(colour: string, amount: number) {
  const c = new T.Color(colour);
  return "#" + (amount > 0 ? c.lerp(new T.Color("#ffffff"), amount) : c.lerp(new T.Color("#000000"), -amount)).getHexString();
}
/** The painted face of the board: rounded squares in our own colours on a teal ground, numbers, arrows up the rows. */
function boardFace(): T.CanvasTexture {
  const size = 1024,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    unit = size / FACE,
    cell = CELL * unit,
    px = (square: number) => {
      const p = squareAt(square);
      return [size / 2 + p.x * unit, size / 2 + p.z * unit] as [number, number];
    },
    rounded = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    };
  ctx.fillStyle = "#23766f";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#fff4dc";
  ctx.lineWidth = 4;
  ctx.strokeRect(RIM * unit * 0.45, RIM * unit * 0.45, size - RIM * unit * 0.9, size - RIM * unit * 0.9);
  // The field of squares on a cream ground, like grout between painted tiles.
  ctx.fillStyle = "#fff4dc";
  ctx.fillRect(RIM * unit - 2, RIM * unit - 2, size - 2 * RIM * unit + 4, size - 2 * RIM * unit + 4);
  for (let square = 1; square <= 100; square++) {
    const [x, y] = px(square),
      row = Math.floor((square - 1) / 10),
      col = Math.round(squareAt(square).x / CELL + 4.5),
      paint = square === 100 ? "#f5bf3a" : PAINTS[(col + row * 2) % PAINTS.length];
    // Painted in a soft gloss: a little lighter at the top of each square, a little darker at its foot.
    const g = ctx.createLinearGradient(0, y - cell / 2, 0, y + cell / 2);
    g.addColorStop(0, shade(paint, 0.16));
    g.addColorStop(0.45, paint);
    g.addColorStop(1, shade(paint, -0.08));
    ctx.fillStyle = g;
    rounded(x - cell / 2 + 3, y - cell / 2 + 3, cell - 6, cell - 6, cell * 0.14);
    ctx.fill();
    ctx.fillStyle = "rgba(52, 36, 26, 0.78)";
    ctx.font = `800 ${cell * (square === 100 ? 0.3 : 0.27)}px "Trebuchet MS", "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(String(square), x - cell * 0.41, y - cell * 0.42);
  }
  // A star on the last square, an arrow into the first.
  const [sx, sy] = px(100);
  ctx.fillStyle = "#fff8e0";
  ctx.strokeStyle = "rgba(120, 70, 10, 0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2,
      r = i % 2 ? cell * 0.11 : cell * 0.26;
    ctx.lineTo(sx + cell * 0.08 + Math.cos(a) * r, sy + cell * 0.1 + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const chevron = (x: number, y: number, angle: number, scale: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(52, 36, 26, 0.5)";
    ctx.beginPath();
    ctx.moveTo(scale, 0);
    ctx.lineTo(-scale * 0.6, -scale * 0.8);
    ctx.lineTo(-scale * 0.2, 0);
    ctx.lineTo(-scale * 0.6, scale * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  const [ox, oy] = px(1);
  chevron(ox + cell * 0.18, oy + cell * 0.14, 0, cell * 0.12);
  // Where a row ends the way turns up into the next: a small arrow in the corner of the square.
  for (let row = 0; row < 9; row++) {
    const [x, y] = px(row * 10 + 10);
    chevron(x + (row % 2 ? -1 : 1) * cell * 0.3, y - cell * 0.3, -Math.PI / 2, cell * 0.08);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  // Sharper aslant where a graphics card draws; filtering costs the processor dearly.
  t.anisotropy = capable() ? 8 : 4;
  // The board is painted wood: the grain shows faintly through the paint once its photograph has come.
  woodPhoto("light", (image) => {
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.22;
    ctx.drawImage(image, 0, 0, size, size);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    t.needsUpdate = true;
  });
  return t;
}
function dieFace(value: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    at = [34, 64, 94],
    spots: Record<number, [number, number][]> = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [2, 0], [0, 2], [2, 2]],
      5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
      6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    };
  ctx.fillStyle = "#fbf6ea";
  ctx.fillRect(0, 0, 128, 128);
  for (const [x, y] of spots[value]) {
    const r = value === 1 ? 17 : 10.5,
      cx = at[x],
      cy = at[y],
      g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    // A sunk pip: dark in the hollow, its far rim catching the light.
    g.addColorStop(0, value === 1 ? "#8e1a12" : "#000000");
    g.addColorStop(0.75, value === 1 ? "#c8321f" : "#1c1d20");
    g.addColorStop(1, value === 1 ? "#e87a62" : "#6d6a66");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
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
/** The die's rest for a roll: its face up, turned a little about the upright for each throw. */
function restOf(face: number, ply: number) {
  return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ((ply * 47) % 60) / 100 - 0.3).multiply(upright(face));
}
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
}
const UP = new T.Vector3(0, 1, 0);
/**
 * A snakes-and-ladders board in a garden: a thick painted wooden board on a garden table, modelled ladders standing
 * on posts over it, modelled snakes lying across it (their heads and tails swaying, tongues flicking, where a
 * graphics card draws), two to four glossy tokens and a die thrown into a tray. A token climbs a ladder rung by rung and
 * rides a snake's back down from its open mouth to its tail.
 */
export class SnakesView implements PointView<State> {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 120);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  private tokens: T.Mesh[] = [];
  private die: T.Mesh;
  private snakes: SnakeModel[] = [];
  private heads: Heads;
  private tweens: Tween[] = [];
  /** Motion that goes on after the table has come to rest (the winner's dance); nothing waits for it. */
  private flourish: Tween | null = null;
  private state: State | null = null;
  private trail: T.InstancedMesh;
  private ring: T.Mesh;
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Whether the snakes live (sway, flick their tongues): only where a graphics card draws. */
  private life: boolean;
  onContact: () => void = () => {};
  onRoll: (count: number, land: number) => void = () => {};
  /** A rung trodden ("disc"), the top of a ladder reached ("pocket"), a snake's hiss and the ride down it ("cushion", `strength` its seconds). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
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
    const rich = capable();
    this.life = rich && !this.reducedMotion;
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    // The sky; where the lawn is left out (software drawing) the lawn's green instead.
    this.renderer.setClearColor(rich ? "#bcd8ec" : LAWN);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    if (rich) this.scene.fog = new T.Fog("#bcd8ec", 30, 70);
    // A bright garden afternoon: sky above, the lawn's green from below, the sun from the left behind.
    this.scene.add(new T.HemisphereLight("#eef6ff", "#5d7a3e", 2.1));
    const light = new T.DirectionalLight("#fff1d6", 2.5);
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
    garden(this.scene, (r) => this.own(r), rich);
    // The board: a thick slab of painted wood, its edges the teal of its rim over the grain.
    const edge = standard({ map: this.own(wood(false, 0.55)), color: "#3f9a92", roughness: 0.6 }),
      board = new T.Mesh(this.own(block(FACE, BOARD_THICK, FACE, 0.05)), [
        edge,
        edge,
        standard({ map: this.own(boardFace()), roughness: 0.62 }),
        edge,
        edge,
        edge,
      ]);
    board.position.set(BOARD_X, -BOARD_THICK / 2, 0);
    board.receiveShadow = true;
    // Its shadow on the table is a thin line at its edges; it costs a large patch of the shadow map, so only where a card draws.
    board.castShadow = rich;
    this.scene.add(board);
    this.scene.add(ladderModel(LADDER_LINES, (r) => this.own(r), rich));
    SNAKE_LINES.forEach((line, i) => {
      const snake = new SnakeModel(line.points, i, (r) => this.own(r), rich);
      this.snakes.push(snake);
      this.scene.add(snake.group);
      snake.pose(0, false);
    });
    this.heads = new Heads(this.snakes, (r) => this.own(r), rich);
    this.scene.add(this.heads.group);
    // What just happened: a ring round the square the last move ended on, small dots on the squares it walked.
    this.ring = new T.Mesh(
      this.own(new T.RingGeometry(0.29, 0.36, 40).rotateX(-Math.PI / 2)),
      this.own(new T.MeshBasicMaterial({ color: TOKENS[0], transparent: true, opacity: 0.85, depthWrite: false })),
    );
    this.ring.visible = false;
    this.trail = new T.InstancedMesh(
      this.own(new T.CircleGeometry(0.075, 18).rotateX(-Math.PI / 2)),
      this.own(new T.MeshBasicMaterial({ color: TOKENS[0], transparent: true, opacity: 0.55, depthWrite: false })),
      8,
    );
    this.trail.count = 0;
    this.scene.add(this.ring, this.trail);
    // The tokens: turned pawns with a clear glaze.
    const man = this.own(pawn(0.84));
    TOKENS.forEach((color) => {
      const token = new T.Mesh(man, this.own(glossy({ color, roughness: 0.28 })));
      token.castShadow = true;
      this.tokens.push(token);
      this.scene.add(token);
    });
    // The die's tray: a wooden frame round a felt floor.
    const frame = standard({ map: this.own(wood(true, 0.7)), color: "#b98a62", roughness: 0.55 }),
      felt = standard({ color: "#2f6b4f", roughness: 1, ...weave(1.5, 2.6, (r) => this.own(r)) }),
      floor = new T.Mesh(this.own(block(TRAY.w, 0.05, TRAY.d, 0.02)), felt);
    floor.position.set(TRAY.x, TABLE_Y + 0.025, TRAY.z);
    floor.receiveShadow = true;
    this.scene.add(floor);
    const bars = [
      [TRAY.w + 0.16, 0.08, 0, -TRAY.d / 2],
      [TRAY.w + 0.16, 0.08, 0, TRAY.d / 2],
      [0.08, TRAY.d, -TRAY.w / 2, 0],
      [0.08, TRAY.d, TRAY.w / 2, 0],
    ].map(([w, d, x, z]) => block(w, 0.2, d, 0.03).translate(TRAY.x + x, TABLE_Y + 0.1, TRAY.z + z)),
      rim = new T.Mesh(this.own(mergeGeometries(bars)), frame);
    bars.forEach((g) => g.dispose());
    rim.castShadow = rim.receiveShadow = true;
    this.scene.add(rim);
    this.die = new T.Mesh(
      this.own(block(DIE, DIE, DIE, 0.11, 3)),
      FACES.map((value) => this.own(glossy({ map: this.own(dieFace(value)), roughness: 0.32 }, 0.8))),
    );
    this.die.castShadow = true;
    this.die.position.copy(DIE_REST);
    this.scene.add(this.die);
    realism(this.renderer, this.scene);
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
      const now = performance.now(),
        moved = this.step(now);
      if (!this.dirty && !moved && !this.life) return;
      this.dirty = false;
      this.pose(now);
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          this.renderer.domElement.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  private pose(now: number) {
    for (const snake of this.snakes) snake.pose(now / 1000, this.life);
    this.heads.update();
  }
  /**
   * Where a token of `color` stands: waiting in a row beside square 1; on a square alone in its middle, two side by
   * side, three or four in its corners (`slot` of `count`), on the board or on what lies over it.
   */
  private stand(color: number, square: number, slot = 0, count = 1) {
    const p = worldAt(square);
    if (square <= 0) return new T.Vector3(p.x, restHeight(square), p.z + 0.1 - color * 0.6);
    const [dx, dz] = count === 2 ? [slot ? 0.18 : -0.18, 0] : count > 2 ? [slot % 2 ? 0.17 : -0.17, slot < 2 ? -0.17 : 0.17] : [0, 0];
    return new T.Vector3(p.x + dx, restHeight(square), p.z + dz);
  }
  private place(state: State) {
    // The die and the squares as they lie, for tests (every device over Wi-Fi must show the same).
    this.renderer.domElement.dataset.die = String(state.roll?.die ?? 0);
    this.renderer.domElement.dataset.squares = state.positions.join(",");
    for (const token of this.tokens) token.visible = false;
    state.positions.forEach((square, player) => {
      const token = this.tokens[state.colors[player]],
        sharing = state.positions.map((q, i) => (q === square ? i : -1)).filter((i) => i >= 0);
      token.visible = true;
      token.position.copy(this.stand(state.colors[player], square, sharing.indexOf(player), sharing.length));
      token.quaternion.identity();
    });
    for (const snake of this.snakes) snake.open = snake.flick = 0;
    if (state.roll) {
      this.die.quaternion.copy(restOf(state.roll.die, state.ply));
      this.die.position.copy(DIE_REST);
    }
    this.mark(state);
  }
  /** The ring and the dots of the last move, in its mover's colour; left out of pictures for the collection. */
  private mark(state: State | null) {
    const roll = state?.roll;
    if (!state || !roll || capturing()) {
      this.ring.visible = false;
      this.trail.count = 0;
      return;
    }
    const color = TOKENS[state.colors[roll.player]],
      end = state.positions[roll.player];
    (this.ring.material as T.MeshBasicMaterial).color.set(color);
    (this.trail.material as T.MeshBasicMaterial).color.set(color);
    const p = worldAt(end);
    this.ring.position.set(p.x, 0.006, p.z);
    this.ring.visible = end > 0;
    const dots = roll.path.filter((square) => square !== end).slice(-8),
      m = new T.Matrix4();
    dots.forEach((square, i) => {
      const q = worldAt(square);
      this.trail.setMatrixAt(i, m.makeTranslation(q.x, 0.005, q.z));
    });
    this.trail.count = dots.length;
    this.trail.instanceMatrix.needsUpdate = true;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    fitCanvas(this.renderer, w, h);
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
  /**
   * Shows `state`; a roll throws the die into its tray, walks the token square by square, then climbs a ladder rung
   * by rung or rides a snake down from its mouth to its tail.
   */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    this.flourish = null;
    const roll = state.roll;
    if (!animate || this.reducedMotion || !before || !roll || state.ply !== before.ply + 1) {
      this.place(state);
      this.onSettled();
      return;
    }
    this.place(before);
    this.mark(null);
    const now = performance.now(),
      color = state.colors[roll.player],
      token = this.tokens[color],
      to = restOf(roll.die, state.ply),
      axis = new T.Vector3(1, 0.4, 0.6).normalize(),
      spin = new T.Quaternion();
    // The die is heard rattling, landing where the hop comes down and rolling to a stop.
    this.onRoll(1, 0.44);
    this.tweens.push({
      start: now,
      duration: 520,
      update: (p) => {
        spin.setFromAxisAngle(axis, (1 - travel(p)) * Math.PI * 5);
        this.die.quaternion.copy(to).multiply(spin);
        this.die.position.lerpVectors(DIE_FROM, DIE_REST, travel(p));
        this.die.position.y = DIE_REST.y + hop(p) * 0.9;
      },
    });
    let at = now + 560,
      from = token.position.clone();
    const hopTo = (end: T.Vector3, duration: number, height: number, after?: () => void) => {
      const start = from.clone();
      this.tweens.push({
        start: at,
        duration,
        update: (p) => {
          token.position.lerpVectors(start, end, p);
          token.position.y += Math.sin(Math.PI * p) * height;
          if (p === 1) after?.();
        },
      });
      at += duration;
      from = end.clone();
    };
    for (const square of roll.path) hopTo(this.stand(color, square), 170, 0.35, () => this.onContact());
    if (roll.slide === null) return;
    const landing = roll.path[roll.path.length - 1],
      end = this.stand(color, roll.slide);
    if (roll.slide > landing) {
      // A ladder: up it rung by rung, a knock at every other rung, a little jump for joy at the top.
      const line = LADDER_LINES.find((l) => l.from === landing)!;
      at += 90;
      // A long ladder is climbed a little faster, so that no climb takes much over a second and a half.
      const rungs = rungsOf(line),
        pace = Math.min(85, 1500 / rungs.length);
      rungs.forEach((r, i) =>
        hopTo(new T.Vector3(r.x, LADDER_TOP, r.z), pace, 0.13, () => {
          if (i % 2 === 0) this.onKnock?.("disc", 0.5);
        }),
      );
      const top = end.clone();
      hopTo(top, 150, 0.15);
      const startAt = at;
      this.tweens.push({
        start: startAt,
        duration: 360,
        update: (p) => {
          token.position.y = top.y + hop(p) * 0.45;
          token.rotation.y = travel(p) * Math.PI * 2;
          if (p === 1) {
            token.rotation.y = 0;
            this.onContact();
          }
        },
      });
      this.onKnockLater(startAt, "pocket", 1);
      at += 360;
      return;
    }
    // A snake: its mouth opens and its tongue flicks as the token arrives, then down its back to the tail.
    const snake = this.snakes[SNAKE_LINES.findIndex((s) => s.head === landing)],
      ride = Math.max(0.75, Math.min(1.5, 0.35 + snake.length * 0.14)) * 1000,
      startAt = at,
      lean = new T.Quaternion(),
      side = new T.Vector3();
    this.tweens.push({
      start: startAt,
      duration: 300,
      update: (p) => {
        snake.open = Math.sin((Math.PI / 2) * p);
        snake.flick = Math.sin(Math.PI * p);
        if (p === 1) snake.flick = 0;
      },
    });
    this.onKnockLater(startAt, "cushion", (300 + ride) / 1000);
    at += 300;
    const onHead = from.clone();
    this.tweens.push({
      start: at,
      duration: ride,
      update: (p) => {
        // Slow away from the head, quick down the body, easing off at the tail.
        const s = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p),
          { point, way } = snake.back(0.03 + s * 0.97);
        if (p < 0.12) point.lerp(onHead, 1 - p / 0.12);
        token.position.copy(point);
        side.crossVectors(UP, way).normalize();
        lean.setFromAxisAngle(side, -0.32 * Math.sin(Math.PI * Math.min(1, p * 1.3)));
        token.quaternion.copy(lean);
        snake.open = Math.max(0, 1 - p * 3);
        if (p === 1) token.quaternion.identity();
      },
    });
    at += ride;
    from = token.position.clone();
    const tail = snake.back(1).point;
    from.copy(tail);
    hopTo(end, 200, 0.22, () => this.onContact());
  }
  /** A knock told when the tween clock reaches `at`. */
  private onKnockLater(at: number, kind: "disc" | "cushion" | "pocket", strength: number) {
    this.tweens.push({
      start: at,
      duration: 1,
      update: (p) => {
        if (p === 1) this.onKnock?.(kind, strength);
      },
    });
  }
  setMarks(_marks: Marks) {}
  private step(now: number) {
    let moved = false;
    if (this.tweens.length) {
      moved = true;
      this.tweens = this.tweens.filter((t) => {
        const p = Math.min(1, (now - t.start) / t.duration);
        if (p < 0) return true;
        t.update(p);
        return p < 1;
      });
      if (!this.tweens.length && this.state) {
        this.place(this.state);
        if (this.state.winner !== null && !this.reducedMotion) this.dance(this.state.colors[this.state.winner], now);
        this.onSettled();
      }
    } else if (this.flourish) {
      moved = true;
      const p = Math.min(1, (now - this.flourish.start) / this.flourish.duration);
      this.flourish.update(p);
      if (p >= 1) this.flourish = null;
    }
    return moved;
  }
  /** The winner (the token of `color`) hops and turns on the last square a few times. */
  private dance(color: number, now: number) {
    const token = this.tokens[color],
      base = token.position.clone();
    this.flourish = {
      start: now + 150,
      duration: 1800,
      update: (p) => {
        const k = Math.min(2, Math.floor(p * 3)),
          q = p * 3 - k;
        token.position.y = base.y + hop(q) * 0.7;
        token.rotation.y = travel(q) * Math.PI * 2 * (k % 2 ? -1 : 1);
        if (p >= 1) {
          token.position.copy(base);
          token.rotation.y = 0;
        }
      },
    };
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
