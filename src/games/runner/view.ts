import { capturing } from "../../ui/banner";
import { FlatView, rounded } from "../flat/view";
import { BOSS, HURT, JUMP, PORTAL, SMASH, STRIKE, TICK, TURN, type State } from "./rules";
import { PORTAL_COLORS, SQUARE_COLORS, paletteOf, type Palette } from "./palette";
import {
  BOSS_HALF,
  DT,
  HEARTS,
  N,
  REACH,
  SQUARE,
  TALL,
  TUMBLE,
  aheadOf,
  cellOf,
  createWorld,
  flipWarning,
  jump,
  runnerCentre,
  step,
  strike,
  toWorld,
  type Event,
  type Square,
  type World,
} from "./sim";

export const RUNNER_COLORS: [string, string] = ["#ef3b4a", "#b9b3a4"];
/** The runner's colours, by the letters of his pictures. */
const INK: Record<string, string> = {
  K: "#1d1b2e",
  C: "#ffcf3a",
  c: "#d99a1c",
  S: "#ffd2ad",
  E: "#1d1b2e",
  R: "#ef3b4a",
  r: "#a81f33",
  B: "#3b7be8",
  b: "#2756b0",
  P: "#3a3157",
  W: "#f6f6f6",
  G: "#ffffff",
  X: "#ff4d5e",
};
/** His head, a cap with its brim forward and a scarf whose tail flutters behind (two ways). */
const HEAD = ["....KKKKK...", "...KCCCCCK..", "..KCCCCCCCK.", "..KccccccccK", "..KSSSSSESK.", "..KSSSSSSK..", "RRRRRRRRK..."];
const HEAD_FLAP = ["....KKKKK...", "...KCCCCCK..", "..KCCCCCCCK.", "..KccccccccK", "..KSSSSSESK.", "R.KSSSSSSK..", "rRRRRRRRK..."];
const HEAD_HURT = ["....KKKKK...", "...KCCCCCK..", "..KCCCCCCCK.", "..KccccccccK", "..KSSSXSXSK.", "..KSSSSSSK..", "RRRRRRRRK..."];
/** His body in each pose, under the head (12 wide, 5 high), facing the way he runs. */
const BODY: Record<string, string[]> = {
  run0: ["...KBBBBK...", "..GKBBBBBGK.", "...KbbbbK...", "..KPKKKPK...", ".KWK...KWK.."],
  run1: ["...KBBBBK...", "...KBGBBK...", "...KbbbbK...", "....KPPK....", "....KWWK...."],
  run2: ["...KBBBBK...", "...KBBBBGK..", "...KbbbbK...", "...KPKPK....", "..KWKKWK...."],
  jump: ["..GKBBBBKG..", "...KBBBBK...", "...KbbbbK...", "...KPKKPK...", "..KWK..KWK.."],
  punch: ["...KBBBBKKKK", "...KBBBBBBGG", "...KbbbbKKKK", "...KPKKPK...", "..KWK..KWK.."],
  kick: ["...KBBBBK...", "..GKBBBBK...", "...KbbbbKKKK", "...KPPPPPPWW", "..KWK....KKK"],
  tuck: ["...KBBBBGK..", "...KPPPPPK..", "...KWWWWK...", "............", "............"],
  hurt: [".GKBBBBBBKG.", "...KBBBBK...", "...KbbbbK...", "..KPK..KPK..", ".KWK....KWK."],
  cheer: [".G.KBBBBK.G.", ".GKBBBBBBKG.", "...KbbbbK...", "...KPKKPK...", "..KWK..KWK.."],
};
const RUN = ["run0", "run1", "run2", "run1"];
/** The boss: a crowned face of squares (9 × 9), its eyes drawn apart so that they can look at him. */
const BOSS_FACE = ["..Y.Y.Y..", "..YYYYY..", ".KKKKKKK.", "KKKKKKKKK", "KKKKKKKKK", "KKKKKKKKK", "KWKWKWKWK", ".KKKKKKK.", "..K...K.."];
interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}
/**
 * The room drawn flat, as a pixel picture on one canvas (like falling blocks and the snake): the frame of tiles, the
 * stacks, slopes, pistons and holes, the squares flying about, the boss, and the runner going round. The view keeps
 * the room's clock: it steps `sim.ts` in fixed slices and reports what happened as moves; the player's taps and
 * swipes are moves too, handed to the room when the state counts them.
 */
export class RunnerView extends FlatView<State> {
  private world: World = createWorld(1);
  /** The strikes and jumps of the state already handed to the room. */
  private strikes = 0;
  private jumps = 0;
  private paused = false;
  private last = performance.now();
  private left = 0;
  /** Room time gone since the last whole second the clock told. */
  private second = 0;
  /** What the picture shows beyond the room: flying bits, a shake, a red flash. */
  private bits: Bit[] = [];
  private shake = 0;
  private flash = 0;
  private bossGone = false;
  /** The room's place on the canvas: the inner corner and the side of a cell, in canvas pixels. */
  private box = { x: 0, y: 0, cell: 1, panel: "left" as "left" | "top", width: 0, height: 0 };
  private backdrop: HTMLCanvasElement | null = null;
  private backdropKey = "";
  private touch: { x: number; y: number; jumped: boolean } | null = null;
  private dataset = "";
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    this.begin();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.dirty = true;
  }
  private running() {
    const state = this.state;
    return !!state && state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  protected changed(before: State | null, state: State) {
    // A new game: the count of moves gone back to nothing, or another stage.
    if (!before || (state.ply === 0 && before.ply > 0) || state.stage !== this.world.stage) {
      this.world = createWorld(state.stage, Math.floor(Math.random() * 2 ** 31));
      this.strikes = state.strikes;
      this.jumps = state.jumps;
      this.second = 0;
      this.bits = [];
      this.bossGone = false;
      this.last = performance.now();
      return;
    }
    if (state === before) return;
    // The player's taps and swipes, handed to the room as the state counts them.
    let heard = false;
    while (this.strikes < state.strikes) {
      this.strikes++;
      if (strike(this.world)) heard = true;
    }
    while (this.jumps < state.jumps) {
      this.jumps++;
      const events: Event[] = [];
      if (jump(this.world, events)) heard = true;
      this.react(events);
    }
    if (heard && (state.last === STRIKE || state.last === JUMP)) this.onContact();
    if (state.ply === before.ply + 1 && state.last !== null && [HURT, BOSS, SMASH, TURN, PORTAL].includes(state.last)) this.onContact();
  }
  /** The room's clock: real time stepped in fixed slices while the game runs. */
  protected frame(now: number) {
    const real = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const moving = this.bits.length > 0 || this.shake > 0 || this.flash > 0;
    this.bits = this.bits.filter((b) => (b.life -= real) > 0);
    for (const b of this.bits) {
      b.x += b.vx * real;
      b.y += b.vy * real;
      b.vy += 9 * real;
    }
    this.shake = Math.max(0, this.shake - real);
    this.flash = Math.max(0, this.flash - real);
    if (!this.running()) return moving || (this.state?.winner === 0 && !capturing());
    this.left += real;
    let smashed = false;
    while (this.left >= DT && this.running()) {
      this.left -= DT;
      const events = step(this.world);
      if (events.length) smashed = this.react(events, smashed);
      if (this.state?.bossMax === 0) {
        this.second += DT;
        if (this.second >= 1) {
          this.second -= 1;
          this.onMove({ from: -1, to: TICK, extra: -1 });
        }
      }
    }
    if (!this.running()) this.left = 0;
    this.publish();
    return true;
  }
  /** What the room did, told as moves (a square knocked away at most once a frame, for its sound) and shown. */
  private react(events: Event[], smashed = false) {
    for (const e of events) {
      if (e.kind === "hurt") {
        this.shake = 0.3;
        this.flash = 0.35;
        const [x, y] = runnerCentre(this.world.runner);
        this.burst(x, y, ["#ff4d5e", "#ffffff", "#ffd23f"], 12);
        this.onMove({ from: -1, to: HURT, extra: -1 });
      } else if (e.kind === "boss") {
        this.shake = 0.18;
        this.burst(e.x, e.y, ["#ffffff", "#ffd23f", "#1d1b2e"], 16);
        if (e.hp <= 0) {
          this.bossGone = true;
          const boss = this.world.boss!;
          this.burst(boss.x, boss.y, ["#1d1b2e", "#ffd23f", "#ffffff", "#ff4d5e"], 60, 3);
        }
        this.onMove({ from: -1, to: BOSS, extra: -1 });
      } else if (e.kind === "smash") {
        this.burst(e.x, e.y, ["#ffffff", "#ffd23f"], 6);
        if (!smashed) {
          smashed = true;
          this.onMove({ from: -1, to: SMASH, extra: -1 });
        }
      } else if (e.kind === "shatter") this.burst(e.x, e.y, e.knocked ? ["#ffffff", "#ffd23f"] : ["#ffffff", "#1d1b2e"], 8);
      else if (e.kind === "turn") this.onMove({ from: -1, to: TURN, extra: -1 });
      else if (e.kind === "portal") {
        for (const hole of [e.from, e.to]) {
          const [x, y] = toWorld(hole.side, hole.col + 0.5, -0.5);
          this.burst(x, y, [PORTAL_COLORS[Math.floor(this.world.holes.findIndex((h) => h.side === hole.side && h.col === hole.col) / 2) % PORTAL_COLORS.length], "#ffffff"], 14);
        }
        this.onMove({ from: -1, to: PORTAL, extra: -1 });
      }
    }
    return smashed;
  }
  private burst(x: number, y: number, colors: string[], count: number, force = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2,
        v = (2 + Math.random() * 5) * force;
      this.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0.35 + Math.random() * 0.45, size: 0.12 + Math.random() * 0.16 * force, color: colors[k % colors.length] });
    }
  }
  /** The runner's place on the canvas element, for the page (and the browser tests). */
  private publish() {
    const r = this.world.runner,
      { x, y, cell } = this.box,
      text = JSON.stringify({ side: r.side, u: +r.u.toFixed(2), h: +r.h.toFixed(2), dir: r.dir, air: r.air, safe: r.safe > 0 }),
      all = `${text}|${r.strikes}|${r.jumps}|${this.world.squares.length}|${this.world.boss?.hp ?? 0}|${x}|${y}|${cell}`;
    if (all === this.dataset) return;
    this.dataset = all;
    const el = this.canvas;
    el.dataset.runner = text;
    el.dataset.strikes = String(r.strikes);
    el.dataset.jumps = String(r.jumps);
    el.dataset.squares = String(this.world.squares.length);
    el.dataset.stage = String(this.world.stage);
    el.dataset.boss = String(this.world.boss?.hp ?? 0);
    // The room's inner corner and a cell's side in CSS pixels, for aiming at it.
    el.dataset.room = `${(x / this.ratio).toFixed(1)} ${(y / this.ratio).toFixed(1)} ${(cell / this.ratio).toFixed(2)}`;
  }
  /** A tap strikes (when it is let go without having swiped); a swipe up jumps as soon as it has gone far enough. */
  protected pressed(x: number, y: number) {
    this.touch = { x, y, jumped: false };
  }
  protected moved(x: number, y: number, held: boolean) {
    const t = this.touch;
    if (!held || !t || t.jumped) return;
    const up = t.y - y;
    if (up >= Math.max(22 * this.ratio, this.box.cell * 0.7) && up > Math.abs(x - t.x) * 0.8) {
      t.jumped = true;
      this.onMove({ from: -1, to: JUMP, extra: -1 });
    }
  }
  protected released(x: number, y: number) {
    const t = this.touch;
    this.touch = null;
    if (!t || t.jumped) return;
    // A drag that went some other way is not a tap.
    if (Math.hypot(x - t.x, y - t.y) > 26 * this.ratio) return;
    this.onMove({ from: -1, to: STRIKE, extra: -1 });
  }
  /** The room as large as fits, the hearts and the bar beside it (or above it on a narrow screen). */
  private layout(width: number, height: number) {
    const r = this.ratio,
      short = height / r < 500,
      margin = 12 * r,
      T = N + 2;
    // Beside a room centred between them, the corner buttons (back and settings at the left, pause at the right)
    // leave its top free, so it may reach nearly to the edges.
    let top = (short ? 12 : 26) * r,
      bottom = (short ? 10 : 26) * r;
    let cell = Math.min((width - 2 * margin) / T, (height - top - bottom) / T),
      panel: "left" | "top" = "left";
    if ((width - T * cell) / 2 < 150 * r) {
      panel = "top";
      top = (short ? 44 : 58) * r;
      bottom = (short ? 18 : 30) * r;
      cell = Math.min((width - 2 * margin) / T, (height - top - bottom - 44 * r) / T);
    }
    const span = T * cell,
      x0 = Math.round((width - span) / 2),
      y0 = Math.round(top + (panel === "top" ? 44 * r : 0) + (height - top - bottom - (panel === "top" ? 44 * r : 0) - span) / 2);
    this.box = { x: x0 + cell, y: y0 + cell, cell, panel, width, height };
  }
  /** Room point (cells) to the canvas. */
  private at(x: number, y: number): [number, number] {
    return [this.box.x + x * this.box.cell, this.box.y + y * this.box.cell];
  }
  protected paint(pen: CanvasRenderingContext2D, width: number, height: number, now: number) {
    this.layout(width, height);
    const state = this.state,
      world = this.world,
      palette = paletteOf(world.stage),
      { cell } = this.box;
    pen.imageSmoothingEnabled = false;
    pen.drawImage(this.background(width, height, palette), 0, 0);
    pen.save();
    if (this.shake > 0) pen.translate(Math.round((Math.random() - 0.5) * cell * 0.3 * this.shake * 3), Math.round((Math.random() - 0.5) * cell * 0.3 * this.shake * 3));
    this.drawPistons(pen, palette);
    this.drawBands(pen, now);
    this.drawHoles(pen, now);
    if (world.boss && !this.bossGone) this.drawBoss(pen, now);
    for (const s of world.squares) this.drawSquare(pen, s, now);
    this.drawRunner(pen, now);
    for (const b of this.bits) {
      const [x, y] = this.at(b.x, b.y),
        s = Math.max(2, b.size * cell);
      pen.globalAlpha = Math.min(1, b.life * 3);
      pen.fillStyle = b.color;
      pen.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
    }
    pen.globalAlpha = 1;
    if (world.spec.dark) this.drawDark(pen, now);
    pen.restore();
    if (this.flash > 0) {
      pen.fillStyle = `rgba(255, 40, 60, ${this.flash * 0.5})`;
      pen.fillRect(0, 0, width, height);
    }
    if (!state || capturing()) return;
    this.drawPanel(pen, state);
    this.drawHints(pen, now);
  }
  /** What does not move, drawn once a size and stage: the ground, its pale squares, the frame and the stacks. */
  private background(width: number, height: number, palette: Palette) {
    const key = `${width}x${height}:${this.world.stage}:${this.box.x}:${this.box.y}:${this.box.cell}`;
    if (this.backdrop && this.backdropKey === key) return this.backdrop;
    const canvas = this.backdrop ?? document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    this.backdrop = canvas;
    this.backdropKey = key;
    const pen = canvas.getContext("2d")!,
      { cell } = this.box,
      px = Math.max(1, Math.round(cell / 8));
    pen.imageSmoothingEnabled = false;
    // Outside the room: the stage's colour, darker, with a coarse dither.
    pen.fillStyle = palette.lo;
    pen.fillRect(0, 0, width, height);
    pen.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = 0; y < height; y += px * 6) for (let x = (y / (px * 6)) % 2 ? px * 3 : 0; x < width; x += px * 6) pen.fillRect(x, y, px * 2, px * 2);
    // Inside: one hue, a fine dither of pixels and large pale squares, the same each time.
    const [ix, iy] = this.at(0, 0),
      inner = Math.round(N * cell);
    pen.save();
    pen.beginPath();
    pen.rect(Math.round(ix), Math.round(iy), inner, inner);
    pen.clip();
    pen.fillStyle = palette.ground;
    pen.fillRect(Math.round(ix), Math.round(iy), inner, inner);
    let seed = 11 + this.world.stage * 7;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    pen.fillStyle = palette.dither;
    for (let y = Math.round(iy); y < iy + inner; y += px * 4) for (let x = Math.round(ix) + (((y - Math.round(iy)) / (px * 4)) % 2 ? px * 2 : 0); x < ix + inner; x += px * 4) pen.fillRect(x, y, px, px);
    for (let k = 0; k < 9; k++) {
      const size = cell * (2 + next() * 4),
        x = ix + next() * inner - size / 2,
        y = iy + next() * inner - size / 2;
      pen.globalAlpha = 0.3 + next() * 0.3;
      if (next() < 0.55) {
        pen.fillStyle = palette.pale;
        pen.fillRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      } else {
        pen.strokeStyle = palette.pale;
        pen.lineWidth = px * 2;
        pen.strokeRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      }
    }
    pen.restore();
    pen.globalAlpha = 1;
    // The frame: half-cell tiles of two colours by turns, each with a bevel; the holes are left open.
    const open = new Set(
      this.world.holes.map((h) => {
        const [x, y] = cellOf(h.side, h.col, -1);
        return `${x},${y}`;
      }),
    );
    for (let i = -1; i <= N; i++)
      for (let j = -1; j <= N; j++) {
        if (i >= 0 && i < N && j >= 0 && j < N) continue;
        if (open.has(`${i},${j}`)) continue;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) this.tile(pen, i + a / 2, j + b / 2, (2 * i + a + 2 * j + b) % 2 ? palette.tileA : palette.tileB, px);
      }
    // A dark line where the frame meets the room.
    pen.strokeStyle = "rgba(0,0,0,0.25)";
    pen.lineWidth = px;
    pen.strokeRect(Math.round(ix) - px / 2, Math.round(iy) - px / 2, inner + px, inner + px);
    // The stacks, stairs and ring: blocks of the stage's colour.
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (this.world.solid[y * N + x]) this.block(pen, x, y, palette, px);
    // Slopes: drawn as steps of pixels along the line of the ground.
    for (const ramp of this.world.spec.ramps ?? []) this.drawRamp(pen, ramp, palette, px);
    return canvas;
  }
  private tile(pen: CanvasRenderingContext2D, i: number, j: number, color: string, px: number) {
    const [x, y] = this.at(i, j),
      c = this.box.cell / 2,
      X = Math.round(x),
      Y = Math.round(y),
      S = Math.round(x + c) - X;
    pen.fillStyle = color;
    pen.fillRect(X, Y, S, S);
    pen.fillStyle = "rgba(255,255,255,0.18)";
    pen.fillRect(X, Y, S, px);
    pen.fillRect(X, Y, px, S);
    pen.fillStyle = "rgba(0,0,0,0.22)";
    pen.fillRect(X, Y + S - px, S, px);
    pen.fillRect(X + S - px, Y, px, S);
  }
  private block(pen: CanvasRenderingContext2D, i: number, j: number, palette: Palette, px: number) {
    const [x, y] = this.at(i, j),
      c = this.box.cell,
      X = Math.round(x),
      Y = Math.round(y),
      S = Math.round(x + c) - X;
    pen.fillStyle = palette.lo;
    pen.fillRect(X, Y, S, S);
    pen.fillStyle = palette.block;
    pen.fillRect(X + px, Y + px, S - 2 * px, S - 2 * px);
    pen.fillStyle = palette.hi;
    pen.fillRect(X + px, Y + px, S - 2 * px, px);
    pen.fillRect(X + px, Y + px, px, S - 2 * px);
    pen.fillRect(X + 3 * px, Y + 3 * px, Math.max(px, S - 6 * px), Math.max(px, S - 6 * px));
    pen.fillStyle = palette.block;
    pen.fillRect(X + 4 * px, Y + 4 * px, Math.max(0, S - 8 * px), Math.max(0, S - 8 * px));
  }
  private drawRamp(pen: CanvasRenderingContext2D, ramp: { side: number; col: number; from: number; to: number }, palette: Palette, px: number) {
    const steps = 8,
      low = Math.min(ramp.from, ramp.to);
    for (let k = 0; k < steps; k++) {
      const u0 = ramp.col + k / steps,
        u1 = ramp.col + (k + 1) / steps,
        h = ramp.from + ((ramp.to - ramp.from) * (k + 0.5)) / steps;
      if (h <= low) continue;
      const [ax, ay] = toWorld(ramp.side, u0, low),
        [bx, by] = toWorld(ramp.side, u1, h),
        [x0, y0] = this.at(Math.min(ax, bx), Math.min(ay, by)),
        [x1, y1] = this.at(Math.max(ax, bx), Math.max(ay, by));
      pen.fillStyle = palette.block;
      pen.fillRect(Math.round(x0), Math.round(y0), Math.round(x1) - Math.round(x0), Math.round(y1) - Math.round(y0));
      // The top edge of each step, lit.
      const [tx, ty] = toWorld(ramp.side, u0, h),
        [sx, sy] = toWorld(ramp.side, u1, h - 1 / steps / 1.5),
        [p0, q0] = this.at(Math.min(tx, sx), Math.min(ty, sy)),
        [p1, q1] = this.at(Math.max(tx, sx), Math.max(ty, sy));
      pen.fillStyle = palette.hi;
      pen.fillRect(Math.round(p0), Math.round(q0), Math.max(px, Math.round(p1) - Math.round(p0)), Math.max(px, Math.round(q1) - Math.round(q0)));
    }
  }
  private drawPistons(pen: CanvasRenderingContext2D, palette: Palette) {
    const { cell } = this.box;
    for (const p of this.world.pistons) {
      if (p.height <= 0.02) continue;
      const [ax, ay] = toWorld(p.side, p.col + 0.08, 0),
        [bx, by] = toWorld(p.side, p.col + 0.92, p.height),
        [x0, y0] = this.at(Math.min(ax, bx), Math.min(ay, by)),
        [x1, y1] = this.at(Math.max(ax, bx), Math.max(ay, by));
      pen.fillStyle = palette.lo;
      pen.fillRect(Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0));
      // Steel bands across it, and a bright cap where it ends.
      const across = p.side % 2 === 0,
        stripe = Math.max(2, Math.round(cell / 8));
      pen.fillStyle = "#c9d2db";
      for (let k = 0.5; k < p.height; k += 1) {
        const [mx, my] = this.at(...toWorld(p.side, p.col + 0.5, k));
        if (across) pen.fillRect(Math.round(x0), Math.round(my - stripe / 2), Math.round(x1 - x0), stripe);
        else pen.fillRect(Math.round(mx - stripe / 2), Math.round(y0), stripe, Math.round(y1 - y0));
      }
      const [cx, cy] = this.at(...toWorld(p.side, p.col + 0.5, p.height));
      pen.fillStyle = "#ffd23f";
      if (across) pen.fillRect(Math.round(x0), Math.round(cy - (p.side === 0 ? 0 : stripe * 1.5)), Math.round(x1 - x0), Math.round(stripe * 1.5));
      else pen.fillRect(Math.round(cx - (p.side === 1 ? 0 : stripe * 1.5)), Math.round(y0), Math.round(stripe * 1.5), Math.round(y1 - y0));
    }
  }
  /** Speed bands: chevrons running the way he runs, along the side's surface. */
  private drawBands(pen: CanvasRenderingContext2D, now: number) {
    const { cell } = this.box,
      dir = this.world.runner.dir;
    for (const band of this.world.spec.bands ?? [])
      for (let col = band.from; col <= band.to; col++) {
        const phase = ((now / 400) * dir) % 1,
          [x, y] = this.at(...toWorld(band.side, col + 0.5 + phase * 0.5 - 0.25, 0.18)),
          rot = -band.side * (Math.PI / 2);
        pen.save();
        pen.translate(x, y);
        pen.rotate(rot);
        pen.scale(dir, 1);
        pen.fillStyle = "#ffd23f";
        pen.globalAlpha = 0.9;
        pen.beginPath();
        pen.moveTo(-cell * 0.25, -cell * 0.12);
        pen.lineTo(cell * 0.05, -cell * 0.12);
        pen.lineTo(cell * 0.25, 0);
        pen.lineTo(cell * 0.05, cell * 0.12);
        pen.lineTo(-cell * 0.25, cell * 0.12);
        pen.lineTo(-cell * 0.05, 0);
        pen.closePath();
        pen.fill();
        pen.restore();
      }
    pen.globalAlpha = 1;
  }
  /** Holes: a dark opening in the frame with a ring of its pair's colour turning in it. */
  private drawHoles(pen: CanvasRenderingContext2D, now: number) {
    const { cell } = this.box;
    this.world.holes.forEach((hole, i) => {
      const [hx, hy] = cellOf(hole.side, hole.col, -1),
        [x, y] = this.at(hx, hy),
        color = PORTAL_COLORS[Math.floor(i / 2) % PORTAL_COLORS.length];
      pen.fillStyle = "#0b0a14";
      pen.fillRect(Math.round(x), Math.round(y), Math.ceil(cell), Math.ceil(cell));
      const cx = x + cell / 2,
        cy = y + cell / 2;
      for (let k = 0; k < 3; k++) {
        const r = cell * (0.42 - k * 0.12) * (1 + 0.08 * Math.sin(now / 200 + k));
        pen.strokeStyle = color;
        pen.globalAlpha = 0.9 - k * 0.25;
        pen.lineWidth = Math.max(2, cell / 10);
        pen.beginPath();
        pen.arc(cx, cy, r, now / 300 + k, now / 300 + k + Math.PI * 1.4);
        pen.stroke();
      }
      pen.globalAlpha = 1;
      // A little mark of the pair on the frame beside it.
      pen.fillStyle = color;
      const [mx, my] = this.at(...toWorld(hole.side, hole.col + 0.5, -0.5));
      pen.fillRect(Math.round(mx - cell * 0.08), Math.round(my - cell * 0.08), Math.round(cell * 0.16), Math.round(cell * 0.16));
    });
  }
  private drawSquare(pen: CanvasRenderingContext2D, s: Square, now: number) {
    const { cell } = this.box,
      [x, y] = this.at(s.x, s.y),
      size = SQUARE * cell,
      color =
        s.kind === "drift" ? SQUARE_COLORS.plain[s.id % 2] : s.kind === "homing" ? SQUARE_COLORS.homing : s.kind === "spin" ? SQUARE_COLORS.spin : s.kind === "rain" ? SQUARE_COLORS.rain : SQUARE_COLORS.shot,
      edge = color === "#1d1b2e" ? "#ffffff" : "#1d1b2e";
    const one = (ox: number, oy: number, alpha: number) => {
      pen.save();
      pen.translate(x + ox, y + oy);
      pen.rotate(s.kind === "spin" ? 0 : Math.round(s.angle * 4) / 4);
      pen.globalAlpha = alpha;
      pen.fillStyle = edge;
      pen.fillRect(-size / 2, -size / 2, size, size);
      pen.fillStyle = color;
      const b = Math.max(2, size / 8);
      pen.fillRect(-size / 2 + b, -size / 2 + b, size - 2 * b, size - 2 * b);
      if (s.kind === "homing") {
        // An eye that looks at him.
        const [rx, ry] = runnerCentre(this.world.runner),
          a = Math.atan2(ry - s.y, rx - s.x) - Math.round(s.angle * 4) / 4;
        pen.fillStyle = "#ffffff";
        pen.fillRect(-size * 0.22, -size * 0.22, size * 0.44, size * 0.44);
        pen.fillStyle = "#1d1b2e";
        pen.fillRect(Math.cos(a) * size * 0.1 - size * 0.1, Math.sin(a) * size * 0.1 - size * 0.1, size * 0.2, size * 0.2);
      } else if (s.kind === "shot") {
        pen.fillStyle = "#ffffff";
        pen.fillRect(-size * 0.15, -size * 0.15, size * 0.3, size * 0.3);
      } else {
        pen.fillStyle = edge === "#ffffff" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)";
        pen.fillRect(-size / 2 + b * 2, -size / 2 + b * 2, size - 4 * b, b);
      }
      pen.restore();
    };
    if (s.appear > 0) {
      // Coming in: an outline blinking, growing to its size.
      if (Math.floor(now / 90) % 2) return;
      const grow = 1 - s.appear / 0.7;
      pen.save();
      pen.translate(x, y);
      pen.strokeStyle = color === "#ffffff" ? "#ffffff" : color;
      pen.lineWidth = Math.max(2, cell / 10);
      pen.setLineDash([cell / 6, cell / 8]);
      const k = size * (0.4 + 0.6 * grow);
      pen.strokeRect(-k / 2, -k / 2, k, k);
      pen.restore();
      return;
    }
    if (s.knocked) {
      // A struck square leaves a short trail behind it.
      const len = Math.hypot(s.vx, s.vy) || 1;
      for (let k = 3; k >= 1; k--) one((-s.vx / len) * k * size * 0.45, (-s.vy / len) * k * size * 0.45, 0.18 * (4 - k));
    }
    one(0, 0, 1);
  }
  private drawBoss(pen: CanvasRenderingContext2D, now: number) {
    const boss = this.world.boss!,
      { cell } = this.box,
      [cx, cy] = this.at(boss.x, boss.y),
      half = BOSS_HALF * cell,
      unit = (half * 2) / 9,
      flash = boss.flash > 0 && Math.floor(now / 60) % 2 === 0,
      bob = Math.sin(now / 260) * unit * 0.4,
      wind = boss.next < 0.45;
    pen.save();
    pen.translate(Math.round(cx - half), Math.round(cy - half + bob));
    // Its shadow of squares, then the face.
    BOSS_FACE.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch === ".") return;
        pen.fillStyle = flash ? "#ffffff" : ch === "Y" ? "#ffd23f" : ch === "W" ? "#f4f4f4" : "#1d1b2e";
        pen.fillRect(Math.round(i * unit), Math.round(j * unit), Math.ceil(unit) - 1, Math.ceil(unit) - 1);
      }),
    );
    // Eyes looking at him: white squares with a dark pupil; red while it winds up a throw.
    const [rx, ry] = runnerCentre(this.world.runner),
      a = Math.atan2(ry - boss.y, rx - boss.x);
    for (const ex of [2, 5]) {
      pen.fillStyle = flash ? "#ff4d5e" : wind ? "#ff4d5e" : "#ffffff";
      pen.fillRect(Math.round(ex * unit), Math.round(3 * unit), Math.round(unit * 2) - 1, Math.round(unit * 2) - 1);
      pen.fillStyle = "#1d1b2e";
      pen.fillRect(Math.round((ex + 0.5 + Math.cos(a) * 0.45) * unit), Math.round((3.5 + Math.sin(a) * 0.45) * unit), Math.round(unit) - 1, Math.round(unit) - 1);
    }
    // Angry brows.
    pen.fillStyle = "#ffd23f";
    pen.fillRect(Math.round(1.6 * unit), Math.round(2.55 * unit), Math.round(2.2 * unit), Math.round(unit * 0.35));
    pen.fillRect(Math.round(5.2 * unit), Math.round(2.55 * unit), Math.round(2.2 * unit), Math.round(unit * 0.35));
    pen.restore();
  }
  private drawRunner(pen: CanvasRenderingContext2D, now: number) {
    const state = this.state,
      r = this.world.runner,
      { cell } = this.box;
    if (r.safe > 0 && state?.winner === null && Math.floor(now / 70) % 2 === 0) return;
    const lost = state?.winner === 1,
      won = state?.winner === 0,
      // Drawn at his middle, eased up a step he has just climbed.
      [mx, my] = toWorld(r.side, r.u, r.h + r.lift + TALL / 2),
      [x, y] = this.at(mx, my),
      turnTo = -r.side * (Math.PI / 2),
      p = r.tumble / TUMBLE;
    let angle = turnTo,
      pose: string;
    if (p > 0) {
      // A tumble onto the wall: from his old side's lean to the new, with a somersault on the way.
      const from = -r.from * (Math.PI / 2);
      let delta = turnTo - from;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      angle = turnTo - (delta + Math.sign(delta) * Math.PI * 2) * p;
      pose = "tuck";
    } else if (lost) pose = "hurt";
    else if (won) pose = Math.floor(now / 300) % 2 ? "cheer" : "jump";
    else if (r.strike > 0) pose = r.pose;
    else if (r.safe > SAFE_SHOW) pose = "hurt";
    else if (r.air) pose = "jump";
    else pose = RUN[Math.floor(r.run * 2.4) % RUN.length];
    const head = pose === "hurt" ? HEAD_HURT : Math.floor(now / 140) % 2 ? HEAD_FLAP : HEAD,
      rows = [...head, ...BODY[pose]],
      unit = (cell * 1.35) / 12,
      // His feet on the side he runs on: half his height below his middle.
      foot = (TALL / 2) * cell;
    pen.save();
    pen.translate(x, y);
    pen.rotate(angle);
    pen.scale(r.dir, 1);
    // A soft shadow on the side he runs on (only when on it).
    if (!r.air && p === 0) {
      pen.fillStyle = "rgba(0,0,0,0.18)";
      pen.fillRect(-unit * 4, foot - unit * 0.6, unit * 8, unit * 1.2);
    }
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        if (ch === ".") return;
        pen.fillStyle = INK[ch] ?? "#ff00ff";
        pen.fillRect((i - 6) * unit, (j - rows.length) * unit + foot, unit + 0.6, unit + 0.6);
      }),
    );
    // The strike's swish: a white arc before him.
    if (r.strike > 0) {
      pen.strokeStyle = "rgba(255,255,255,0.85)";
      pen.lineWidth = Math.max(2, unit * 1.2);
      pen.beginPath();
      pen.arc(unit * 5, foot - unit * (r.pose === "kick" ? 3 : 6.5), unit * 5, -0.9, 0.9);
      pen.stroke();
    }
    pen.restore();
  }
  /** A dark room: only a pool of light round him; squares glow a little in the dark. */
  private drawDark(pen: CanvasRenderingContext2D, now: number) {
    const { cell } = this.box,
      [x, y] = this.at(...runnerCentre(this.world.runner)),
      [ix, iy] = this.at(-1, -1),
      span = (N + 2) * cell,
      flicker = 1 + Math.sin(now / 90) * 0.02,
      light = pen.createRadialGradient(x, y, cell * 2.2 * flicker, x, y, cell * 5.2 * flicker);
    light.addColorStop(0, "rgba(6, 6, 16, 0)");
    light.addColorStop(1, "rgba(6, 6, 16, 0.94)");
    pen.fillStyle = light;
    pen.fillRect(ix, iy, span, span);
    for (const s of this.world.squares) {
      if (s.appear > 0) continue;
      const [sx, sy] = this.at(s.x, s.y);
      pen.strokeStyle = "rgba(255, 240, 180, 0.55)";
      pen.lineWidth = Math.max(2, cell / 12);
      pen.strokeRect(sx - (SQUARE * cell) / 2, sy - (SQUARE * cell) / 2, SQUARE * cell, SQUARE * cell);
    }
    if (this.world.boss && !this.bossGone) {
      const [bx, by] = this.at(this.world.boss.x, this.world.boss.y);
      pen.strokeStyle = "rgba(255, 80, 90, 0.6)";
      pen.strokeRect(bx - BOSS_HALF * cell, by - BOSS_HALF * cell, BOSS_HALF * 2 * cell, BOSS_HALF * 2 * cell);
    }
  }
  /** Hearts, the stage and its bar (time left, or the boss's strength), beside the room or over it. */
  private drawPanel(pen: CanvasRenderingContext2D, state: State) {
    const r = this.ratio,
      { x, y, cell, panel } = this.box,
      size = Math.round(Math.max(12 * r, Math.min(cell * 0.55, 18 * r))),
      heart = Math.round(Math.max(16 * r, Math.min(cell * 0.9, 30 * r))),
      wide = panel === "left" ? Math.min(x - cell - 28 * r, 230 * r) : Math.min((N + 2) * cell, 520 * r),
      left = panel === "left" ? x - cell - 14 * r - wide : x - cell,
      top = panel === "left" ? y + cell * 1.2 : y - cell - 40 * r,
      spec = this.world.spec;
    pen.textBaseline = "top";
    pen.textAlign = "left";
    pen.font = `800 ${size}px "Inter", "Noto Sans KR", sans-serif`;
    const ink = (text: string, tx: number, ty: number) => {
      pen.fillStyle = "rgba(0,0,0,0.35)";
      pen.fillText(text, tx + r, ty + r);
      pen.fillStyle = "#ffffff";
      pen.fillText(text, tx, ty);
    };
    const title = `${state.stage}단계 · ${spec.name}`;
    let rowY = top;
    if (panel === "left") {
      ink(title, left, rowY);
      rowY += size * 1.6;
    }
    // Hearts in pixels: full red, lost ones as dark outlines.
    for (let k = 0; k < HEARTS; k++) drawHeart(pen, left + k * heart * 1.15, rowY, heart, k < state.hearts);
    if (panel === "top") {
      pen.textAlign = "right";
      ink(title, left + wide, rowY + (heart - size) / 2);
      pen.textAlign = "left";
    }
    rowY += heart * 1.25;
    const boss = !!state.bossMax,
      share = boss ? state.boss / state.bossMax : Math.max(0, (state.left - this.second) / spec.time),
      barH = Math.round(Math.max(10 * r, cell * 0.38)),
      label = boss ? `${spec.boss!.name} ${state.boss}/${state.bossMax}` : `남은 시간 ${state.left}초`;
    pen.fillStyle = "#1d1b2e";
    pen.fillRect(Math.round(left), Math.round(rowY), Math.round(wide), barH);
    pen.fillStyle = boss ? "#ff4d5e" : share < 0.2 ? "#ffd23f" : "#7cf29a";
    pen.fillRect(Math.round(left + 2 * r), Math.round(rowY + 2 * r), Math.max(0, Math.round((wide - 4 * r) * share)), barH - 4 * r);
    // Pixel notches every tenth of the bar.
    pen.fillStyle = "rgba(29,27,46,0.5)";
    for (let k = 1; k < 10; k++) pen.fillRect(Math.round(left + (wide * k) / 10), Math.round(rowY + 2 * r), Math.max(1, r), barH - 4 * r);
    rowY += barH + size * 0.5;
    pen.font = `700 ${Math.round(size * 0.85)}px "Inter", "Noto Sans KR", sans-serif`;
    if (panel === "left") ink(label, left, rowY);
    else {
      pen.textAlign = "right";
      ink(label, left + wide, rowY - barH - size * 0.5 - heart * 1.25 + heart + 2 * r);
      pen.textAlign = "left";
    }
    // The controls, beside the room on the other side, in the practice room.
    if (state.stage === 1 && panel === "left") {
      const rx = x + N * cell + cell + 18 * r,
        rw = Math.min(width0(this.box) - rx - 12 * r, 240 * r);
      if (rw > 110 * r) {
        pen.font = `800 ${Math.round(size * 0.9)}px "Inter", "Noto Sans KR", sans-serif`;
        ink("탭 → 주먹·발차기", rx, y + cell * 1.2);
        ink("위로 쓸기 → 점프", rx, y + cell * 1.2 + size * 1.7);
        pen.font = `600 ${Math.round(size * 0.75)}px "Inter", "Noto Sans KR", sans-serif`;
        ink("벽 앞에서 점프하면", rx, y + cell * 1.2 + size * 3.6);
        ink("벽을 타고 달립니다", rx, y + cell * 1.2 + size * 4.8);
      }
    }
  }
  /** The practice room points at what to press, as a tutorial would; every stage warns of a turn of the way round. */
  private drawHints(pen: CanvasRenderingContext2D, now: number) {
    const state = this.state!,
      world = this.world,
      r = world.runner,
      { cell } = this.box;
    if (state.winner !== null) return;
    const [mx, my] = this.at(...toWorld(r.side, r.u, r.h + TALL + 1.1)),
      bubble = (text: string, color: string) => {
        const size = Math.round(Math.max(12 * this.ratio, cell * 0.5));
        pen.font = `900 ${size}px "Inter", "Noto Sans KR", sans-serif`;
        const w = pen.measureText(text).width + size,
          h = size * 1.6,
          bx = Math.max(this.box.x, Math.min(this.box.x + N * cell - w, mx - w / 2)),
          by = Math.max(this.box.y, Math.min(this.box.y + N * cell - h, my - h / 2)),
          bob = Math.sin(now / 120) * size * 0.12;
        pen.fillStyle = color;
        rounded(pen, bx, by + bob, w, h, size * 0.3);
        pen.fill();
        pen.fillStyle = "#1d1b2e";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(text, bx + w / 2, by + bob + h / 2);
        pen.textAlign = "left";
        pen.textBaseline = "top";
      };
    const warning = flipWarning(world);
    if (warning !== null) {
      if (Math.floor(now / 160) % 2 === 0) bubble("방향이 바뀝니다!", "#ffd23f");
      return;
    }
    if (world.stage !== 1) return;
    const near = world.squares.some((s) => {
      if (s.knocked || s.appear > 0) return false;
      const [cx, cy] = runnerCentre(r);
      return Math.hypot(s.x - cx, s.y - cy) < 3.2;
    });
    if (near) bubble("탭! 주먹", "#ffffff");
    else if (aheadOf(r) <= REACH + 0.5 && aheadOf(r) > 0.2 && r.tumble === 0) bubble("↑ 쓸어 올려 점프!", "#7cf29a");
  }
}
/** Seconds of the blinking during which he still looks hurt. */
const SAFE_SHOW = 1.35;
const width0 = (box: { width: number }) => box.width;
/** A heart of pixels (7 × 6), full or as an outline. */
function drawHeart(pen: CanvasRenderingContext2D, x: number, y: number, size: number, full: boolean) {
  const shape = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
    unit = size / 7;
  shape.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch !== "X") return;
      pen.fillStyle = full ? (j === 1 && i === 1 ? "#ffd0d6" : "#ff3b55") : "rgba(29,27,46,0.55)";
      pen.fillRect(Math.round(x + i * unit), Math.round(y + j * unit), Math.ceil(unit), Math.ceil(unit));
    }),
  );
}
