import { capturing } from "../../ui/banner";
import { FlatView, rounded } from "../flat/view";
import { APPLE, GOAL, GOLD, GOLD_LIFE, H, LEVELS, STEPS, TICK, TURN, W, interval, xy, type State } from "./rules";

export const SNAKE_COLORS: [string, string] = ["#3f9a3a", "#b9b3a4"];
/** Room kept clear at the lower left for the arrow keys, in CSS pixels (their grid and its margin). */
const PAD = { width: 200, height: 112 };
const TAU = Math.PI * 2;
/** The snake's half width in squares, how far along its tail narrows, and the spacing of its scales and markings. */
const GIRTH = 0.36,
  TAPER = 2.6,
  SCALE = 0.2,
  MARK = 0.85;
/** How long a crash is shown (a jolt, flashes, then the colour draining away) and how long the stars go round. */
const CRASH = 900,
  DIZZY = 2600;
/** A small repeatable source of numbers. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
type Point = { x: number; y: number; tx: number; ty: number };
/** A point of the drawn snake: how far back from the head it is (`s`, in squares) and its half width there (`g`). */
type Part = Point & { s: number; g: number };
/**
 * The point of the snake's line `u` squares back from the first of `line`, and the way it runs there (toward the
 * head). Corners are rounded off with a quarter of a curve, so that the snake glides round them.
 */
function along(line: [number, number][], u: number): Point {
  const n = line.length - 1;
  if (n <= 0) return { x: line[0][0], y: line[0][1], tx: 1, ty: 0 };
  u = Math.max(0, Math.min(n, u));
  const k = Math.min(n - 1, Math.floor(u)),
    f = u - k;
  const corner = (a: [number, number], b: [number, number], c: [number, number], t: number): Point => {
    const p0x = (a[0] + b[0]) / 2,
      p0y = (a[1] + b[1]) / 2,
      p2x = (b[0] + c[0]) / 2,
      p2y = (b[1] + c[1]) / 2,
      s = 1 - t,
      x = s * s * p0x + 2 * s * t * b[0] + t * t * p2x,
      y = s * s * p0y + 2 * s * t * b[1] + t * t * p2y,
      // The way toward the head is back along the curve (the line runs from head to tail).
      tx = -(2 * s * (b[0] - p0x) + 2 * t * (p2x - b[0])),
      ty = -(2 * s * (b[1] - p0y) + 2 * t * (p2y - b[1])),
      len = Math.hypot(tx, ty) || 1;
    return { x, y, tx: tx / len, ty: ty / len };
  };
  if (f < 0.5 && k > 0) return corner(line[k - 1], line[k], line[k + 1], 0.5 + f);
  if (f >= 0.5 && k + 1 < n) return corner(line[k], line[k + 1], line[k + 2], f - 0.5);
  const [ax, ay] = line[k],
    [bx, by] = line[k + 1],
    len = Math.hypot(bx - ax, by - ay) || 1;
  return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, tx: (ax - bx) / len, ty: (ay - by) / len };
}
/** Crumbs of an apple, dust of a crash, a glint of gold: in squares and milliseconds. */
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  born: number;
  life: number;
  star?: boolean;
}
const FONT = `"Inter", "Noto Sans KR", sans-serif`;
/**
 * The garden drawn flat, as a picture (like falling blocks): a mown lawn inside a wooden fence, apples with a
 * shine, stones and a scaled snake that glides round its corners between the clock's steps, blinking and flicking
 * its tongue. The view keeps the clock (a step every so often, quicker as the snake eats) and turns swipes and
 * taps into turns; eating throws crumbs and points, a crash jolts the snake and leaves it dizzy.
 */
export class SnakeView extends FlatView<State> {
  /** The body before the last step, and when that step was made, so that the snake glides between them. */
  private before: number[] = [];
  private since = performance.now();
  /** How far into its glide the snake was when the clock stopped. */
  private frozen: number | null = null;
  private paused = false;
  /** Where the garden is on the canvas: left, top and the side of a square, in canvas pixels. */
  private box = { x: 0, y: 0, cell: 1 };
  private swipe: { x: number; y: number; done: boolean } | null = null;
  /** When the snake last ate (its head swells), apples on their way down its body, and when it crashed. */
  private ate = 0;
  private meals: { at: number; steps: number }[] = [];
  private crashed = 0;
  private bits: Bit[] = [];
  private popups: { x: number; y: number; text: string; gold: boolean; born: number }[] = [];
  /** The lawn, fence and stones, painted once a size and a level. */
  private garden: HTMLCanvasElement | null = null;
  private painted = "";
  private last = performance.now();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    this.begin();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.dirty = true;
  }
  /** The clock: a step when its time has come; it stands while a window is open, the page is hidden, it is paused or over. */
  protected frame(now: number) {
    const state = this.state,
      dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const stopped = !state || state.winner !== null || this.paused || document.hidden || !!document.querySelector("dialog[open]");
    // Crumbs and points go on flying, and a crash plays out, whatever the clock does.
    const lively = this.bits.length > 0 || this.popups.length > 0 || (this.crashed > 0 && now - this.crashed < DIZZY);
    if (this.bits.length) {
      for (const bit of this.bits) {
        bit.vx *= 1 - 3 * dt;
        bit.vy *= 1 - 3 * dt;
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
      }
      this.bits = this.bits.filter((bit) => now - bit.born < bit.life);
    }
    this.popups = this.popups.filter((p) => now - p.born < 1000);
    if (stopped) {
      // Stopped: the snake stays where it was in its glide, and goes on from there.
      if (this.frozen === null) this.frozen = now - this.since;
      this.since = now - this.frozen;
      return lively && !this.paused;
    }
    this.frozen = null;
    if (now - this.since >= interval(state!)) this.onMove({ from: -1, to: TICK, extra: -1 });
    // The snake glides between steps, blinks and flicks its tongue, and the apples bob: the picture keeps moving.
    return true;
  }
  protected changed(before: State | null, state: State) {
    // A new game: the snake starts where it lies.
    if (!before || state.ply === 0 || state.ply < before.ply) {
      this.before = state.body;
      this.since = performance.now();
      this.meals = [];
      this.crashed = 0;
      this.bits = [];
      this.popups = [];
      return;
    }
    if (state.ply !== before.ply + 1) return;
    if (state.last) {
      // A step: the snake glides on from where it was.
      const now = performance.now();
      this.before = before.body;
      this.since = now;
      for (const meal of this.meals) meal.steps++;
      this.meals = this.meals.filter((meal) => meal.steps < state.body.length + 1);
      if (state.last.ate) this.eat(before, state, now);
      if (state.last.crashed) this.crash(state, now);
      if (state.last.ate || state.last.crashed) this.onContact();
    }
  }
  /** Crumbs where the apple was, its points rising, and a lump that goes down the snake. */
  private eat(before: State, state: State, now: number) {
    const gold = state.last!.ate === "gold",
      [x, y] = xy(state.body[0]),
      random = Math.random;
    this.ate = now;
    this.meals.push({ at: now, steps: 0 });
    for (let i = 0; i < (gold ? 26 : 16); i++) {
      const a = random() * TAU,
        speed = 1.5 + random() * 3.5;
      this.bits.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: 0.05 + random() * 0.07,
        color: gold ? (i % 3 ? "#ffd84a" : "#fff8d0") : i % 3 ? "#e0302a" : "#fff4dc",
        born: now,
        life: 380 + random() * 320,
        star: gold && i % 2 === 0,
      });
    }
    this.popups.push({ x: x + 0.5, y: y + 0.2, text: `+${gold ? GOLD : APPLE}`, gold, born: now });
    void before;
  }
  /** Dust where the head struck, and the crash's own clock. */
  private crash(state: State, now: number) {
    this.crashed = now;
    const [hx, hy] = xy(state.body[0]),
      [dx, dy] = STEPS[state.dir],
      random = Math.random;
    for (let i = 0; i < 18; i++) {
      const a = Math.atan2(-dy, -dx) + (random() - 0.5) * 2.6,
        speed = 1 + random() * 2.5;
      this.bits.push({
        x: hx + 0.5 + dx * 0.5,
        y: hy + 0.5 + dy * 0.5,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: 0.08 + random() * 0.1,
        color: i % 2 ? "rgba(200,180,140,0.9)" : "rgba(240,230,200,0.9)",
        born: now,
        life: 500 + random() * 400,
      });
    }
  }
  /** The way the snake will be going once the turns asked for are made. */
  private heading() {
    const state = this.state!;
    return state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  }
  /** A swipe anywhere on the picture turns the snake the way it went, as soon as it has gone far enough. */
  protected pressed(x: number, y: number) {
    this.swipe = { x, y, done: false };
  }
  protected moved(x: number, y: number, held: boolean) {
    const swipe = this.swipe;
    if (!held || !swipe) return;
    const dx = x - swipe.x,
      dy = y - swipe.y,
      far = Math.max(this.box.cell * 0.55, 14 * this.ratio);
    if (Math.hypot(dx, dy) < far) return;
    const way = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    this.onMove({ from: -1, to: TURN + way, extra: -1 });
    // A finger kept down may swipe again from here.
    this.swipe = { x, y, done: true };
  }
  /** A tap that was no swipe turns the snake toward the side of it where the tap fell. */
  protected released(x: number, y: number) {
    const swipe = this.swipe;
    this.swipe = null;
    if (!swipe || swipe.done || !this.state || this.state.winner !== null) return;
    const { x: X, y: Y, cell } = this.box,
      [hx, hy] = xy(this.state.body[0]),
      dx = x - (X + (hx + 0.5) * cell),
      dy = y - (Y + (hy + 0.5) * cell),
      now = this.heading();
    if (Math.hypot(dx, dy) < cell * 0.5) return;
    const way = now % 2 ? (dy < 0 ? 0 : 2) : dx > 0 ? 1 : 3;
    this.onMove({ from: -1, to: TURN + way, extra: -1 });
  }
  /** Lays the garden out: as large as fits, clear of the arrow keys at the lower left when there is room to the right. */
  private layout(width: number, height: number) {
    // A short screen (a phone held sideways) keeps less room over and under the garden.
    const short = height / this.ratio < 500,
      margin = 14 * this.ratio,
      top = (short ? 46 : 58) * this.ratio,
      bottom = (short ? 16 : 26) * this.ratio,
      frame = 0.7,
      cell = Math.floor(Math.min((width - 2 * margin) / (W + frame * 2), (height - top - bottom) / (H + frame * 2))),
      span = cell * W,
      tall = cell * H,
      pad = PAD.width * this.ratio;
    let x = Math.round((width - span) / 2);
    const y = Math.round(top + (height - top - bottom - tall) / 2);
    // The arrow keys stand at the lower left: move the garden right of them when the canvas is wide enough.
    if (x - cell * frame < pad && width - margin - span - cell * frame >= pad + cell * frame) x = Math.round(Math.max(x, pad + cell * frame));
    this.box = { x, y, cell };
  }
  /** The hedge, the fence, the mown lawn with its blades and daisies, and the stones of the level. */
  private paintGarden(width: number, height: number, stones: number[]) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const pen = canvas.getContext("2d")!,
      { x: X, y: Y, cell } = this.box,
      random = sequence(7);
    // A hedge all round: leaves heaped on leaves, darker toward the edges.
    const hedge = pen.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    hedge.addColorStop(0, "#3f7a35");
    hedge.addColorStop(1, "#1a4020");
    pen.fillStyle = hedge;
    pen.fillRect(0, 0, width, height);
    const leaves = Math.round((width * height) / (cell * cell * 0.5));
    for (let k = 0; k < Math.min(5000, leaves); k++) {
      const x = random() * width,
        y = random() * height,
        tone = random();
      pen.fillStyle = tone < 0.4 ? "rgba(20,60,22,0.5)" : tone < 0.8 ? "rgba(90,150,70,0.35)" : "rgba(170,210,120,0.3)";
      pen.beginPath();
      pen.ellipse(x, y, cell * (0.18 + random() * 0.14), cell * (0.09 + random() * 0.06), random() * Math.PI, 0, TAU);
      pen.fill();
    }
    // The fence: rails of planks with grain, nails, and posts with caps along it.
    const f = cell * 0.62;
    pen.fillStyle = "rgba(0,0,0,0.28)";
    rounded(pen, X - f + cell * 0.08, Y - f + cell * 0.14, W * cell + 2 * f, H * cell + 2 * f, f * 0.6);
    pen.fill();
    const plank = pen.createLinearGradient(0, Y - f, 0, Y + H * cell + f);
    plank.addColorStop(0, "#b07e4a");
    plank.addColorStop(1, "#8a5a32");
    pen.fillStyle = plank;
    rounded(pen, X - f, Y - f, W * cell + 2 * f, H * cell + 2 * f, f * 0.55);
    pen.fill();
    // Grain along the rails, kept on the planks.
    pen.save();
    pen.clip();
    pen.lineCap = "round";
    for (let k = 0; k < 260; k++) {
      const side = k % 4,
        t = random(),
        across = random() * f * 0.8,
        l = cell * (0.6 + random() * 1.4);
      pen.strokeStyle = k % 3 ? "rgba(90,50,20,0.28)" : "rgba(240,200,150,0.2)";
      pen.lineWidth = Math.max(1, cell * 0.03);
      pen.beginPath();
      if (side < 2) {
        const y = side ? Y + H * cell + f * 0.1 + across : Y - f * 0.9 + across,
          x = X - f + t * (W * cell + 2 * f);
        pen.moveTo(x, y);
        pen.lineTo(x + l, y + (random() - 0.5) * cell * 0.05);
      } else {
        const x = side === 3 ? X + W * cell + f * 0.1 + across : X - f * 0.9 + across,
          y = Y - f + t * (H * cell + 2 * f);
        pen.moveTo(x, y);
        pen.lineTo(x + (random() - 0.5) * cell * 0.05, y + l);
      }
      pen.stroke();
    }
    pen.restore();
    pen.strokeStyle = "rgba(60,30,10,0.55)";
    pen.lineWidth = Math.max(1, cell * 0.05);
    rounded(pen, X - f * 0.15, Y - f * 0.15, W * cell + f * 0.3, H * cell + f * 0.3, f * 0.2);
    pen.stroke();
    const post = (px: number, py: number) => {
      pen.fillStyle = "rgba(0,0,0,0.25)";
      pen.beginPath();
      pen.arc(px + cell * 0.06, py + cell * 0.1, f * 0.48, 0, TAU);
      pen.fill();
      const top = pen.createRadialGradient(px - f * 0.15, py - f * 0.15, 0, px, py, f * 0.48);
      top.addColorStop(0, "#c99a62");
      top.addColorStop(1, "#6e4424");
      pen.fillStyle = top;
      pen.beginPath();
      pen.arc(px, py, f * 0.45, 0, TAU);
      pen.fill();
      pen.strokeStyle = "rgba(80,40,10,0.45)";
      pen.lineWidth = Math.max(1, cell * 0.025);
      for (const ring of [0.3, 0.17]) {
        pen.beginPath();
        pen.arc(px, py, f * ring, 0, TAU);
        pen.stroke();
      }
    };
    for (let k = 0; k <= W; k += 3) for (const py of [Y - f * 0.5, Y + H * cell + f * 0.5]) post(X + k * cell, py);
    for (let k = 3; k < H; k += 3) for (const px of [X - f * 0.5, X + W * cell + f * 0.5]) post(px, Y + k * cell);
    // The lawn: mown in stripes of two greens, each square a little uneven.
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const light = (r + c) % 2 === 0,
          g = pen.createLinearGradient(X + c * cell, Y + r * cell, X + (c + 1) * cell, Y + (r + 1) * cell);
        g.addColorStop(0, light ? "#9ad866" : "#8acb57");
        g.addColorStop(1, light ? "#8fd05c" : "#80c050");
        pen.fillStyle = g;
        pen.fillRect(X + c * cell, Y + r * cell, cell, cell);
      }
    // Blades of grass, a few clover leaves and daisies.
    pen.save();
    pen.beginPath();
    pen.rect(X, Y, W * cell, H * cell);
    pen.clip();
    const blades = Math.min(9000, W * H * 26);
    for (let k = 0; k < blades; k++) {
      const x = X + random() * W * cell,
        y = Y + random() * H * cell,
        l = cell * (0.08 + random() * 0.12),
        lean = (random() - 0.5) * 0.8,
        tone = random();
      pen.strokeStyle = tone < 0.45 ? "rgba(60,120,40,0.45)" : tone < 0.85 ? "rgba(170,225,120,0.45)" : "rgba(220,245,170,0.5)";
      pen.lineWidth = Math.max(1, cell * 0.025);
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + Math.sin(lean) * l, y - Math.cos(lean) * l);
      pen.stroke();
    }
    for (let k = 0; k < 26; k++) {
      const x = X + random() * W * cell,
        y = Y + random() * H * cell,
        s = cell * 0.09;
      if (random() < 0.5) {
        pen.fillStyle = "rgba(255,255,255,0.92)";
        for (let p = 0; p < 7; p++) {
          const a = (p / 7) * TAU;
          pen.beginPath();
          pen.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.7, s * 0.32, a, 0, TAU);
          pen.fill();
        }
        pen.fillStyle = "#f2c230";
        pen.beginPath();
        pen.arc(x, y, s * 0.45, 0, TAU);
        pen.fill();
      } else {
        pen.fillStyle = "rgba(70,140,50,0.75)";
        for (let p = 0; p < 3; p++) {
          const a = (p / 3) * TAU - Math.PI / 2;
          pen.beginPath();
          pen.arc(x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7, s * 0.65, 0, TAU);
          pen.fill();
        }
      }
    }
    // A soft shade along the fence, where it stands over the lawn.
    for (const [x0, y0, x1, y1] of [[X, Y, X, Y + cell * 0.6], [X, Y, X + cell * 0.6, Y]]) {
      const s = pen.createLinearGradient(x0, y0, x1, y1);
      s.addColorStop(0, "rgba(20,50,10,0.3)");
      s.addColorStop(1, "rgba(20,50,10,0)");
      pen.fillStyle = s;
      pen.fillRect(X, Y, W * cell, H * cell);
    }
    pen.restore();
    // Stones: rounded boulders lit from the upper left, with a crack and a patch of moss.
    for (const sq of stones) {
      const [c, r] = xy(sq),
        cx = X + (c + 0.5) * cell,
        cy = Y + (r + 0.5) * cell,
        turn = random() * Math.PI,
        rock = pen.createRadialGradient(cx - cell * 0.16, cy - cell * 0.2, cell * 0.04, cx, cy, cell * 0.52);
      rock.addColorStop(0, "#d6d8db");
      rock.addColorStop(0.6, "#9a9ea4");
      rock.addColorStop(1, "#5e6268");
      pen.fillStyle = "rgba(0,0,0,0.26)";
      pen.beginPath();
      pen.ellipse(cx + cell * 0.08, cy + cell * 0.12, cell * 0.46, cell * 0.38, turn, 0, TAU);
      pen.fill();
      pen.fillStyle = rock;
      pen.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * TAU,
          rr = cell * (0.42 + 0.05 * Math.sin(a * 3 + turn));
        pen.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9);
      }
      pen.fill();
      pen.strokeStyle = "rgba(50,50,56,0.5)";
      pen.lineWidth = Math.max(1, cell * 0.03);
      pen.beginPath();
      pen.moveTo(cx - cell * 0.1, cy - cell * 0.25);
      pen.lineTo(cx, cy - cell * 0.05);
      pen.lineTo(cx - cell * 0.04, cy + cell * 0.12);
      pen.stroke();
      pen.fillStyle = "rgba(100,150,60,0.55)";
      pen.beginPath();
      pen.ellipse(cx + cell * 0.18, cy + cell * 0.2, cell * 0.14, cell * 0.08, 0.4, 0, TAU);
      pen.fill();
    }
    return canvas;
  }
  /** An apple, bobbing a little; the golden one glows and glitters, a ring round it running out with its time. */
  private apple(pen: CanvasRenderingContext2D, sq: number, gold: boolean, now: number, left = 1) {
    const { x: X, y: Y, cell } = this.box,
      [c, r0] = xy(sq),
      cx = X + (c + 0.5) * cell,
      cy0 = Y + (r0 + 0.5) * cell,
      bob = Math.sin(now / 260 + sq) * cell * 0.04,
      cy = cy0 + bob,
      r = cell * 0.36;
    if (gold) {
      const glow = pen.createRadialGradient(cx, cy, r * 0.5, cx, cy, cell * 0.9);
      glow.addColorStop(0, `rgba(255,230,120,${0.45 + 0.2 * Math.sin(now / 200)})`);
      glow.addColorStop(1, "rgba(255,230,120,0)");
      pen.fillStyle = glow;
      pen.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);
    }
    pen.fillStyle = "rgba(0,0,0,0.22)";
    pen.beginPath();
    pen.ellipse(cx + r * 0.12, cy0 + r * 0.82, r * 0.82 - bob * 0.3, r * 0.28, 0, 0, TAU);
    pen.fill();
    // Two lobes and a dimple at the top: an apple's outline.
    const body = pen.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.08, cx, cy, r * 1.1);
    body.addColorStop(0, gold ? "#fff6b0" : "#ff8a78");
    body.addColorStop(0.5, gold ? "#f4c430" : "#e0302a");
    body.addColorStop(1, gold ? "#a06a08" : "#7e1010");
    pen.fillStyle = body;
    pen.beginPath();
    pen.moveTo(cx, cy - r * 0.72);
    pen.bezierCurveTo(cx + r * 0.55, cy - r * 1.12, cx + r * 1.12, cy - r * 0.6, cx + r * 0.98, cy + r * 0.1);
    pen.bezierCurveTo(cx + r * 0.88, cy + r * 0.78, cx + r * 0.42, cy + r * 1.02, cx, cy + r * 0.9);
    pen.bezierCurveTo(cx - r * 0.42, cy + r * 1.02, cx - r * 0.88, cy + r * 0.78, cx - r * 0.98, cy + r * 0.1);
    pen.bezierCurveTo(cx - r * 1.12, cy - r * 0.6, cx - r * 0.55, cy - r * 1.12, cx, cy - r * 0.72);
    pen.fill();
    pen.strokeStyle = gold ? "rgba(120,70,0,0.5)" : "rgba(90,0,0,0.45)";
    pen.lineWidth = Math.max(1, cell * 0.025);
    pen.stroke();
    // Its shine: a soft window and a sharp glint.
    pen.fillStyle = "rgba(255,255,255,0.45)";
    pen.beginPath();
    pen.ellipse(cx - r * 0.42, cy - r * 0.3, r * 0.2, r * 0.32, 0.5, 0, TAU);
    pen.fill();
    pen.fillStyle = "rgba(255,255,255,0.95)";
    pen.beginPath();
    pen.arc(cx - r * 0.48, cy - r * 0.42, r * 0.08, 0, TAU);
    pen.fill();
    pen.strokeStyle = "#5a3a1e";
    pen.lineWidth = Math.max(1.5, cell * 0.06);
    pen.lineCap = "round";
    pen.beginPath();
    pen.moveTo(cx, cy - r * 0.68);
    pen.quadraticCurveTo(cx + r * 0.02, cy - r * 1.05, cx + r * 0.18, cy - r * 1.22);
    pen.stroke();
    pen.save();
    pen.translate(cx + r * 0.12, cy - r * 1.0);
    pen.rotate(-0.45);
    const leafy = pen.createLinearGradient(0, -r * 0.2, 0, r * 0.2);
    leafy.addColorStop(0, "#7cc44a");
    leafy.addColorStop(1, "#2f7a24");
    pen.fillStyle = leafy;
    pen.beginPath();
    pen.moveTo(0, 0);
    pen.quadraticCurveTo(r * 0.35, -r * 0.3, r * 0.75, 0);
    pen.quadraticCurveTo(r * 0.35, r * 0.28, 0, 0);
    pen.fill();
    pen.strokeStyle = "rgba(30,70,20,0.6)";
    pen.lineWidth = Math.max(1, cell * 0.018);
    pen.beginPath();
    pen.moveTo(r * 0.05, 0);
    pen.lineTo(r * 0.68, 0);
    pen.stroke();
    pen.restore();
    if (gold) {
      // Four-pointed glints going round it.
      for (let k = 0; k < 4; k++) {
        const a = now / 700 + (k / 4) * TAU,
          d = cell * 0.52,
          tw = (Math.sin(now / 150 + k * 1.7) + 1) / 2,
          s = cell * (0.05 + tw * 0.07),
          sx = cx + Math.cos(a) * d,
          sy = cy + Math.sin(a) * d * 0.8;
        pen.fillStyle = `rgba(255,255,240,${0.5 + tw * 0.5})`;
        pen.beginPath();
        pen.moveTo(sx, sy - s * 2);
        pen.lineTo(sx + s * 0.45, sy);
        pen.lineTo(sx, sy + s * 2);
        pen.lineTo(sx - s * 0.45, sy);
        pen.closePath();
        pen.moveTo(sx - s * 2, sy);
        pen.lineTo(sx, sy + s * 0.45);
        pen.lineTo(sx + s * 2, sy);
        pen.lineTo(sx, sy - s * 0.45);
        pen.closePath();
        pen.fill();
      }
      pen.strokeStyle = "rgba(0,0,0,0.18)";
      pen.lineWidth = Math.max(3, cell * 0.1);
      pen.beginPath();
      pen.arc(cx, cy0, cell * 0.5, 0, TAU);
      pen.stroke();
      pen.strokeStyle = "rgba(255, 220, 90, 0.95)";
      pen.lineWidth = Math.max(2, cell * 0.07);
      pen.beginPath();
      pen.arc(cx, cy0, cell * 0.5, -Math.PI / 2, -Math.PI / 2 + TAU * left);
      pen.stroke();
    }
  }
  /** The snake's line for the state shown, glided `p` of the way from the step before, as points from head to tail with their girth. */
  private spine(state: State, p: number) {
    const body = state.body.map((sq) => {
        const [c, r] = xy(sq);
        return [c + 0.5, r + 0.5] as [number, number];
      }),
      before = this.before,
      stepped = before.length > 0 && before[0] !== state.body[0];
    let line = body,
      head = 0,
      tail = body.length - 1;
    if (stepped) {
      head = 1 - p;
      if (state.body.length <= before.length) {
        // The tail leaves the square it was on as the head goes on.
        const [c, r] = xy(before[before.length - 1]);
        if (before[before.length - 1] !== state.body[state.body.length - 1]) {
          line = [...body, [c + 0.5, r + 0.5]];
          tail = body.length - p;
        }
      }
    }
    const points: Part[] = [],
      length = tail - head,
      now = performance.now();
    for (let u = head; ; u = Math.min(tail, u + 0.1)) {
      const at = along(line, u),
        s = u - head,
        left = length - s,
        thin = left < TAPER ? 0.28 + 0.72 * Math.pow(left / TAPER, 0.75) : 1;
      // An apple going down makes a lump, a square further back each step.
      let lump = 0;
      for (const meal of this.meals) {
        const where = meal.steps + p * (stepped ? 1 : 0) + 0.2,
          grow = Math.min(1, (now - meal.at) / 150);
        lump = Math.max(lump, grow * 0.32 * Math.exp(-(((s - where) / 0.45) ** 2)));
      }
      points.push({ ...at, s, g: GIRTH * thin * (1 + lump) });
      if (u >= tail) break;
    }
    return points;
  }
  private drawSnake(pen: CanvasRenderingContext2D, state: State, now: number, p: number) {
    const { x: X, y: Y, cell } = this.box,
      points = this.spine(state, p),
      crashT = this.crashed ? now - this.crashed : Infinity,
      // A crash jolts the head forward and back, flashes the snake and drains its colour.
      jolt = crashT < 260 ? Math.sin((crashT / 260) * Math.PI) * 0.22 : 0,
      flash = crashT < CRASH && Math.floor(crashT / 110) % 2 === 0,
      drained = state.winner !== null && state.last?.crashed ? Math.min(1, crashT / CRASH) : 0,
      [jx, jy] = STEPS[state.dir],
      // The jolt runs back along the first squares of the body.
      sx = (pt: Part) => X + (pt.x + jolt * jx * Math.max(0, 1 - pt.s / 3)) * cell,
      sy = (pt: Part) => Y + (pt.y + jolt * jy * Math.max(0, 1 - pt.s / 3)) * cell;
    const mix = (a: string, b: string) => (drained > 0 ? (drained > 0.5 ? b : a) : a),
      edge = flash ? "#ffffff" : mix("#1d4f22", "#4a4f48"),
      base = flash ? "#ffe0d0" : mix("#3f9a3a", "#7d877a"),
      light = flash ? "#ffffff" : mix("#9ad86a", "#b9c2b4"),
      marks = mix("#1f5226", "#585e56"),
      rim = mix("#e6e070", "#c8c8b8");
    // The outline of the body at a share of its girth, from the head down one side and back up the other.
    const outline = (share: number, ox = 0, oy = 0) => {
      pen.beginPath();
      points.forEach((pt, i) => {
        const g = pt.g * share,
          x = sx(pt) + (-pt.ty * g + ox) * cell,
          y = sy(pt) + (pt.tx * g + oy) * cell;
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      });
      const end = points[points.length - 1];
      pen.arc(sx(end) + ox * cell, sy(end) + oy * cell, end.g * share * cell, Math.atan2(end.tx, -end.ty), Math.atan2(end.tx, -end.ty) + Math.PI);
      for (let i = points.length - 1; i >= 0; i--) {
        const pt = points[i],
          g = pt.g * share;
        pen.lineTo(sx(pt) + (pt.ty * g + ox) * cell, sy(pt) + (-pt.tx * g + oy) * cell);
      }
      pen.closePath();
    };
    pen.fillStyle = "rgba(0,0,0,0.24)";
    outline(1, 0.07, 0.11);
    pen.fill();
    pen.fillStyle = edge;
    outline(1.08);
    pen.fill();
    pen.fillStyle = base;
    outline(0.92);
    pen.fill();
    // Pale bands down both flanks.
    pen.fillStyle = rim;
    pen.globalAlpha = 0.55;
    outline(0.78);
    pen.fill();
    pen.globalAlpha = 1;
    pen.fillStyle = base;
    outline(0.62);
    pen.fill();
    // The back's markings: dark diamonds edged in yellow, fixed to the body so that they travel with it.
    for (let s = MARK * 0.9; s < points.length * 0.1 - 0.4; s += MARK) {
      const pt = points[Math.round(s / 0.1)];
      if (!pt) break;
      const x = sx(pt),
        y = sy(pt),
        g = pt.g * cell,
        along = { x: pt.tx, y: pt.ty },
        side = { x: -pt.ty, y: pt.tx },
        diamond = (k: number) => {
          pen.beginPath();
          pen.moveTo(x + along.x * g * 0.75 * k, y + along.y * g * 0.75 * k);
          pen.lineTo(x + side.x * g * 0.5 * k, y + side.y * g * 0.5 * k);
          pen.lineTo(x - along.x * g * 0.75 * k, y - along.y * g * 0.75 * k);
          pen.lineTo(x - side.x * g * 0.5 * k, y - side.y * g * 0.5 * k);
          pen.closePath();
        };
      pen.fillStyle = rim;
      diamond(1.18);
      pen.fill();
      pen.fillStyle = marks;
      diamond(1);
      pen.fill();
    }
    // Scales: small arcs in rows across the back, each row between the last.
    if (cell >= 14) {
      pen.strokeStyle = drained > 0.5 ? "rgba(40,40,40,0.22)" : "rgba(10,40,12,0.28)";
      pen.lineWidth = Math.max(0.8, cell * 0.018);
      pen.beginPath();
      for (let s = SCALE, row = 0; s < points.length * 0.1 - 0.2; s += SCALE, row++) {
        const pt = points[Math.round(s / 0.1)];
        if (!pt) break;
        const back = Math.atan2(-pt.ty, -pt.tx);
        for (const across of row % 2 ? [-0.5, 0, 0.5] : [-0.25, 0.25, -0.75, 0.75]) {
          const x = sx(pt) - pt.ty * pt.g * across * cell,
            y = sy(pt) + pt.tx * pt.g * across * cell,
            r = pt.g * cell * 0.3;
          pen.moveTo(x + Math.cos(back - 1.3) * r, y + Math.sin(back - 1.3) * r);
          pen.arc(x, y, r, back - 1.3, back + 1.3);
        }
      }
      pen.stroke();
    }
    // Light along the back, toward the upper left.
    pen.strokeStyle = light;
    pen.globalAlpha = 0.35;
    pen.lineCap = "round";
    pen.lineJoin = "round";
    pen.lineWidth = GIRTH * cell * 0.35;
    pen.beginPath();
    points.slice(0, Math.max(2, points.length - 8)).forEach((pt, i) => {
      const x = sx(pt) - cell * 0.06,
        y = sy(pt) - cell * 0.07;
      if (i) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
    pen.stroke();
    pen.globalAlpha = 1;
    this.drawHead(pen, state, points[0], now, { edge, base, light, marks }, sx(points[0]), sy(points[0]));
  }
  /** The head: a little wider than the body, a dark chevron, nostrils, eyes that blink, and a tongue flicked out now and then. */
  private drawHead(pen: CanvasRenderingContext2D, state: State, pt: Point, now: number, paint: { edge: string; base: string; light: string; marks: string }, x: number, y: number) {
    const { cell } = this.box,
      crashed = !!state.last?.crashed && state.winner !== null,
      swell = 1 + Math.max(0, 1 - (now - this.ate) / 240) * 0.16,
      k = cell * swell;
    pen.save();
    pen.translate(x, y);
    pen.rotate(Math.atan2(pt.ty, pt.tx));
    // Its tongue, under the head: out and back twice in quick flicks, every second or so.
    const cycle = (now % 1700) / 1700,
      out = cycle < 0.22 ? Math.sin((cycle / 0.22) * Math.PI * 2) : 0;
    if (!crashed && state.winner === null && out > 0) {
      const reach = k * (0.46 + 0.34 * out);
      pen.strokeStyle = "#d8283a";
      pen.lineWidth = Math.max(1.5, k * 0.05);
      pen.lineCap = "round";
      pen.beginPath();
      pen.moveTo(k * 0.4, 0);
      pen.lineTo(reach, 0);
      pen.lineTo(reach + k * 0.12, -k * 0.08);
      pen.moveTo(reach, 0);
      pen.lineTo(reach + k * 0.12, k * 0.08);
      pen.stroke();
    }
    pen.fillStyle = "rgba(0,0,0,0.24)";
    pen.beginPath();
    pen.ellipse(k * 0.12, k * 0.11, k * 0.46, k * 0.4, 0, 0, TAU);
    pen.fill();
    const shape = () => {
      pen.beginPath();
      pen.moveTo(-k * 0.4, 0);
      pen.bezierCurveTo(-k * 0.4, -k * 0.3, -k * 0.12, -k * 0.42, k * 0.12, -k * 0.38);
      pen.bezierCurveTo(k * 0.4, -k * 0.32, k * 0.54, -k * 0.16, k * 0.54, 0);
      pen.bezierCurveTo(k * 0.54, k * 0.16, k * 0.4, k * 0.32, k * 0.12, k * 0.38);
      pen.bezierCurveTo(-k * 0.12, k * 0.42, -k * 0.4, k * 0.3, -k * 0.4, 0);
      pen.closePath();
    };
    const skin = pen.createRadialGradient(k * 0.02, -k * 0.12, k * 0.05, k * 0.1, 0, k * 0.55);
    skin.addColorStop(0, paint.light);
    skin.addColorStop(0.55, paint.base);
    skin.addColorStop(1, paint.edge);
    pen.fillStyle = skin;
    shape();
    pen.fill();
    pen.strokeStyle = paint.edge;
    pen.lineWidth = Math.max(1, k * 0.045);
    pen.stroke();
    // The nostrils.
    pen.fillStyle = "rgba(10,30,10,0.75)";
    for (const side of [-1, 1]) {
      pen.beginPath();
      pen.ellipse(k * 0.42, side * k * 0.08, k * 0.03, k * 0.018, 0, 0, TAU);
      pen.fill();
    }
    // Eyes: blinking now and then (twice in a row sometimes), crossed out after a crash.
    const blinkCycle = now % 3700,
      shut = !crashed && (blinkCycle < 110 || (Math.floor(now / 3700) % 3 === 1 && blinkCycle > 220 && blinkCycle < 320));
    for (const side of [-1, 1]) {
      const ex = k * 0.14,
        ey = side * k * 0.21,
        er = k * 0.12;
      pen.fillStyle = paint.edge;
      pen.beginPath();
      pen.arc(ex, ey, er * 1.2, 0, TAU);
      pen.fill();
      if (crashed) {
        pen.strokeStyle = "#2a1a10";
        pen.lineWidth = Math.max(1.5, k * 0.045);
        const d = er * 0.7;
        pen.beginPath();
        pen.moveTo(ex - d, ey - d);
        pen.lineTo(ex + d, ey + d);
        pen.moveTo(ex + d, ey - d);
        pen.lineTo(ex - d, ey + d);
        pen.stroke();
        continue;
      }
      if (shut) {
        pen.strokeStyle = "#0e2a10";
        pen.lineWidth = Math.max(1.2, k * 0.035);
        pen.beginPath();
        pen.arc(ex, ey, er * 0.8, side > 0 ? 0.3 : Math.PI + 0.3, side > 0 ? Math.PI - 0.3 : TAU - 0.3);
        pen.stroke();
        continue;
      }
      pen.fillStyle = "#fbfbf0";
      pen.beginPath();
      pen.arc(ex, ey, er, 0, TAU);
      pen.fill();
      pen.fillStyle = "#121212";
      pen.beginPath();
      pen.arc(ex + er * 0.32, ey, er * 0.55, 0, TAU);
      pen.fill();
      pen.fillStyle = "rgba(255,255,255,0.9)";
      pen.beginPath();
      pen.arc(ex - er * 0.2, ey - er * 0.35 * side, er * 0.24, 0, TAU);
      pen.fill();
    }
    pen.restore();
    if (crashed) {
      // Stars going round over the dizzy head.
      const t = now - this.crashed;
      if (t < DIZZY)
        for (let s = 0; s < 3; s++) {
          const a = now / 260 + (s / 3) * TAU,
            px = x + Math.cos(a) * cell * 0.55,
            py = y - cell * 0.6 + Math.sin(a) * cell * 0.2,
            r = cell * 0.2;
          pen.globalAlpha = Math.min(1, (DIZZY - t) / 400);
          pen.fillStyle = "#ffd84a";
          pen.strokeStyle = "#a06a08";
          pen.lineWidth = Math.max(1, cell * 0.02);
          pen.beginPath();
          for (let i = 0; i < 10; i++) {
            const b = (i / 10) * TAU - Math.PI / 2,
              rr = i % 2 ? r * 0.45 : r;
            pen.lineTo(px + Math.cos(b) * rr, py + Math.sin(b) * rr);
          }
          pen.closePath();
          pen.fill();
          pen.stroke();
          pen.globalAlpha = 1;
        }
    }
  }
  protected paint(pen: CanvasRenderingContext2D, width: number, height: number, now: number) {
    this.layout(width, height);
    const { x: X, y: Y, cell } = this.box,
      state = this.state,
      key = `${width}x${height}:${state?.stones.join(",") ?? ""}`;
    if (key !== this.painted || !this.garden) {
      this.painted = key;
      this.garden = this.paintGarden(width, height, state?.stones ?? []);
    }
    pen.drawImage(this.garden, 0, 0);
    if (!state) return;
    if (state.apple >= 0) this.apple(pen, state.apple, false, now);
    if (state.gold !== null) this.apple(pen, state.gold, true, now, state.goldLeft / GOLD_LIFE);
    // The snake, glided between the last step and this one.
    const p = state.winner !== null ? 1 : Math.min(1, (now - this.since) / interval(state));
    this.drawSnake(pen, state, now, p);
    const quiet = capturing();
    if (!quiet) {
      for (const bit of this.bits) {
        const t = (now - bit.born) / bit.life,
          s = bit.size * cell * (1 - t * 0.4),
          bx = X + bit.x * cell,
          by = Y + bit.y * cell;
        pen.globalAlpha = Math.max(0, 1 - t * t);
        pen.fillStyle = bit.color;
        pen.beginPath();
        if (bit.star) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + now / 200,
              r = i % 2 ? s * 0.4 : s * 1.5;
            pen.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r);
          }
        } else pen.arc(bx, by, s, 0, TAU);
        pen.fill();
      }
      pen.globalAlpha = 1;
      for (const pop of this.popups) {
        const t = (now - pop.born) / 1000,
          size = Math.max(12 * this.ratio, cell * (pop.gold ? 0.7 : 0.55)) * (1 + Math.max(0, 0.25 - t) * 1.6);
        pen.globalAlpha = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);
        pen.font = `900 ${size}px ${FONT}`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.lineJoin = "round";
        pen.lineWidth = size * 0.22;
        pen.strokeStyle = "rgba(40,30,10,0.75)";
        const tx = X + pop.x * cell,
          ty = Y + (pop.y - (1 - (1 - t) ** 2) * 1.1) * cell;
        pen.strokeText(pop.text, tx, ty);
        pen.fillStyle = pop.gold ? "#ffd84a" : "#ffffff";
        pen.fillText(pop.text, tx, ty);
        pen.globalAlpha = 1;
      }
    }
    // The score on a wooden sign over the garden: apples, points and the level.
    if (!quiet) {
      const f = cell * 0.62,
        words = `사과 ${state.eaten}/${GOAL}   ${state.score}점   ${LEVELS[state.level - 1].name}`,
        size = Math.round(Math.max(13 * this.ratio, Math.min(cell * 0.62, 22 * this.ratio)));
      pen.font = `800 ${size}px ${FONT}`;
      const wide = pen.measureText(words).width + size * 1.6,
        sx = X + (W * cell - wide) / 2,
        sy = Y - f - size * 2.1;
      pen.fillStyle = "rgba(0,0,0,0.25)";
      rounded(pen, sx + size * 0.08, sy + size * 0.12, wide, size * 1.7, size * 0.4);
      pen.fill();
      const plank = pen.createLinearGradient(0, sy, 0, sy + size * 1.7);
      plank.addColorStop(0, "#8a5a32");
      plank.addColorStop(1, "#5e3a1c");
      pen.fillStyle = plank;
      rounded(pen, sx, sy, wide, size * 1.7, size * 0.4);
      pen.fill();
      pen.strokeStyle = "rgba(255,220,160,0.35)";
      pen.lineWidth = Math.max(1, size * 0.06);
      pen.stroke();
      pen.fillStyle = "#f6e6c4";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillText(words, sx + wide / 2, sy + size * 0.88);
    }
  }
}
