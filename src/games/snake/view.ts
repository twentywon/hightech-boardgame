import { capturing } from "../../ui/banner";
import { FlatView, rounded } from "../flat/view";
import { GOAL, GOLD_LIFE, H, LEVELS, STEPS, TICK, TURN, W, interval, xy, type State } from "./rules";

export const SNAKE_COLORS: [string, string] = ["#3f9a3a", "#b9b3a4"];
/** Room kept clear at the lower left for the arrow keys, in CSS pixels (their grid and its margin). */
const PAD = { width: 200, height: 112 };
/**
 * The garden drawn flat, as a picture (like falling blocks): grass in squares inside a wooden fence, apples,
 * stones and a snake that glides from square to square between the clock's steps. The view keeps the clock
 * (a step every so often, quicker as the snake eats) and turns swipes into turns.
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
  /** When the snake last ate (a flash of the head) or crashed. */
  private ate = 0;
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
    const state = this.state;
    if (!state || state.winner !== null || this.paused || document.hidden || document.querySelector("dialog[open]")) {
      // Stopped: the snake stays where it was in its glide, and goes on from there.
      if (this.frozen === null) this.frozen = now - this.since;
      this.since = now - this.frozen;
      return false;
    }
    this.frozen = null;
    if (now - this.since >= interval(state)) this.onMove({ from: -1, to: TICK, extra: -1 });
    // The snake glides between steps, the apples bob and the golden one glitters: the picture keeps moving.
    return true;
  }
  protected changed(before: State | null, state: State) {
    // A new game: the snake starts where it lies.
    if (!before || state.ply === 0 || state.ply < before.ply) {
      this.before = state.body;
      this.since = performance.now();
      return;
    }
    if (state.ply !== before.ply + 1) return;
    if (state.last) {
      // A step: the snake glides on from where it was.
      this.before = before.body;
      this.since = performance.now();
      if (state.last.ate) this.ate = performance.now();
      if (state.last.ate || state.last.crashed) this.onContact();
    }
  }
  /** A swipe on the picture turns the snake the way it went, as soon as it has gone far enough. */
  protected pressed(x: number, y: number) {
    this.swipe = { x, y, done: false };
  }
  protected moved(x: number, y: number, held: boolean) {
    const swipe = this.swipe;
    if (!held || !swipe || swipe.done) return;
    const dx = x - swipe.x,
      dy = y - swipe.y,
      far = Math.max(this.box.cell * 0.9, 18 * this.ratio);
    if (Math.hypot(dx, dy) < far) return;
    const way = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    this.onMove({ from: -1, to: TURN + way, extra: -1 });
    // A finger kept down may swipe again from here.
    this.swipe = { x, y, done: false };
  }
  protected released() {
    this.swipe = null;
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
  protected paint(pen: CanvasRenderingContext2D, width: number, height: number, now: number) {
    this.layout(width, height);
    const { x: X, y: Y, cell } = this.box,
      state = this.state;
    // A hedge all round, darker toward the edges.
    const hedge = pen.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    hedge.addColorStop(0, "#3f7a35");
    hedge.addColorStop(1, "#1f4a22");
    pen.fillStyle = hedge;
    pen.fillRect(0, 0, width, height);
    // Leaves of the hedge, scattered the same way each time.
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    pen.fillStyle = "rgba(120, 180, 90, 0.18)";
    for (let k = 0; k < 160; k++) {
      pen.beginPath();
      pen.ellipse(next() * width, next() * height, cell * 0.3, cell * 0.16, next() * Math.PI, 0, Math.PI * 2);
      pen.fill();
    }
    // The fence: a wooden frame with posts at the corners and along the sides.
    const f = cell * 0.55;
    pen.fillStyle = "#8a5a32";
    rounded(pen, X - f, Y - f, W * cell + 2 * f, H * cell + 2 * f, f * 0.6);
    pen.fill();
    pen.fillStyle = "#a8743f";
    rounded(pen, X - f * 0.7, Y - f * 0.7, W * cell + 1.4 * f, H * cell + 1.4 * f, f * 0.4);
    pen.fill();
    pen.fillStyle = "#6e4424";
    for (let k = 0; k <= W; k += 3) for (const py of [Y - f * 0.9, Y + H * cell + f * 0.1]) pen.fillRect(X + k * cell - f * 0.35, py, f * 0.7, f * 0.8);
    for (let k = 0; k <= H; k += 3) for (const px of [X - f * 0.9, X + W * cell + f * 0.1]) pen.fillRect(px, Y + k * cell - f * 0.35, f * 0.8, f * 0.7);
    // The lawn in squares of two greens.
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        pen.fillStyle = (r + c) % 2 ? "#86c653" : "#93d05e";
        pen.fillRect(X + c * cell, Y + r * cell, cell, cell);
      }
    if (!state) return;
    const centre = (sq: number): [number, number] => {
      const [cx, cy] = xy(sq);
      return [X + (cx + 0.5) * cell, Y + (cy + 0.5) * cell];
    };
    // Stones: grey and rounded, lit from the upper left.
    for (const sq of state.stones) {
      const [cx, cy] = centre(sq),
        rock = pen.createRadialGradient(cx - cell * 0.15, cy - cell * 0.18, cell * 0.05, cx, cy, cell * 0.5);
      rock.addColorStop(0, "#c9ccd0");
      rock.addColorStop(1, "#6d7176");
      pen.fillStyle = "rgba(0,0,0,0.18)";
      pen.beginPath();
      pen.ellipse(cx + cell * 0.06, cy + cell * 0.1, cell * 0.44, cell * 0.36, 0, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = rock;
      pen.beginPath();
      pen.ellipse(cx, cy, cell * 0.44, cell * 0.38, 0.3, 0, Math.PI * 2);
      pen.fill();
    }
    // The apple, bobbing a little; the golden apple glitters and a ring round it runs out with its time.
    const apple = (sq: number, gold: boolean) => {
      const [cx, cy0] = centre(sq),
        cy = cy0 + Math.sin(now / 260 + sq) * cell * 0.04,
        r = cell * 0.36,
        body = pen.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
      body.addColorStop(0, gold ? "#fff3a8" : "#ff8a7a");
      body.addColorStop(0.55, gold ? "#f2c230" : "#e0302a");
      body.addColorStop(1, gold ? "#b07a10" : "#8e1414");
      pen.fillStyle = "rgba(0,0,0,0.2)";
      pen.beginPath();
      pen.ellipse(cx + r * 0.1, cy0 + r * 0.85, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = body;
      pen.beginPath();
      pen.arc(cx, cy, r, 0, Math.PI * 2);
      pen.fill();
      pen.strokeStyle = "#5a3a1e";
      pen.lineWidth = Math.max(1.5, cell * 0.06);
      pen.lineCap = "round";
      pen.beginPath();
      pen.moveTo(cx, cy - r * 0.8);
      pen.lineTo(cx + r * 0.15, cy - r * 1.25);
      pen.stroke();
      pen.fillStyle = "#4f9a34";
      pen.beginPath();
      pen.ellipse(cx + r * 0.45, cy - r * 1.05, r * 0.38, r * 0.17, -0.5, 0, Math.PI * 2);
      pen.fill();
      if (gold) {
        const glint = (Math.sin(now / 140) + 1) / 2;
        pen.fillStyle = `rgba(255,255,255,${0.5 + glint * 0.5})`;
        for (const [ox, oy, s] of [[-0.5, -0.4, 0.22], [0.45, 0.35, 0.15]]) {
          const sx = cx + ox * r,
            sy = cy + oy * r,
            size = s * r * (0.6 + glint * 0.6);
          pen.beginPath();
          pen.moveTo(sx, sy - size * 2);
          pen.lineTo(sx + size * 0.5, sy);
          pen.lineTo(sx, sy + size * 2);
          pen.lineTo(sx - size * 0.5, sy);
          pen.closePath();
          pen.fill();
        }
        pen.strokeStyle = "rgba(255, 220, 90, 0.9)";
        pen.lineWidth = Math.max(2, cell * 0.07);
        pen.beginPath();
        pen.arc(cx, cy0, cell * 0.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * state.goldLeft) / GOLD_LIFE);
        pen.stroke();
      }
    };
    if (state.apple >= 0) apple(state.apple, false);
    if (state.gold !== null) apple(state.gold, true);
    // The snake, glided between the last step and this one.
    const p = state.winner !== null ? 1 : Math.min(1, (now - this.since) / interval(state)),
      points = state.body.map((sq, i) => {
        const to = centre(sq),
          from = i < this.before.length ? centre(this.before[i]) : to;
        // A step from one side of the garden straight to the other never happens (walls), so a plain blend is right.
        return [from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p] as [number, number];
      });
    const crashed = state.last?.crashed ?? false;
    pen.lineJoin = "round";
    pen.lineCap = "round";
    const trace = () => {
      pen.beginPath();
      points.forEach(([px, py], i) => (i ? pen.lineTo(px, py) : pen.moveTo(px, py)));
    };
    // Shadow, outline, body, and a pale stripe along the back.
    pen.save();
    pen.translate(cell * 0.06, cell * 0.1);
    pen.strokeStyle = "rgba(0,0,0,0.22)";
    pen.lineWidth = cell * 0.74;
    trace();
    pen.stroke();
    pen.restore();
    pen.strokeStyle = crashed ? "#7a2a1e" : "#1f5a24";
    pen.lineWidth = cell * 0.78;
    trace();
    pen.stroke();
    pen.strokeStyle = crashed ? "#c8503a" : "#46a83f";
    pen.lineWidth = cell * 0.64;
    trace();
    pen.stroke();
    pen.strokeStyle = crashed ? "#e8907a" : "#9ad86a";
    pen.lineWidth = cell * 0.2;
    pen.setLineDash([cell * 0.22, cell * 0.3]);
    trace();
    pen.stroke();
    pen.setLineDash([]);
    // The head: a little wider, eyes looking the way it goes, a tongue flicking now and then.
    const [hx, hy] = points[0],
      [dx, dy] = STEPS[state.dir],
      side: [number, number] = [-dy, dx],
      fresh = now - this.ate < 220;
    pen.fillStyle = crashed ? "#c8503a" : fresh ? "#7ad860" : "#46a83f";
    pen.strokeStyle = crashed ? "#7a2a1e" : "#1f5a24";
    pen.lineWidth = cell * 0.07;
    pen.beginPath();
    pen.ellipse(hx + dx * cell * 0.06, hy + dy * cell * 0.06, cell * 0.46, cell * 0.46, 0, 0, Math.PI * 2);
    pen.fill();
    pen.stroke();
    if (!crashed && state.winner === null && Math.floor(now / 900) % 3 === 0) {
      const tip: [number, number] = [hx + dx * cell * 0.85, hy + dy * cell * 0.85];
      pen.strokeStyle = "#d8283a";
      pen.lineWidth = Math.max(1.5, cell * 0.06);
      pen.beginPath();
      pen.moveTo(hx + dx * cell * 0.45, hy + dy * cell * 0.45);
      pen.lineTo(tip[0], tip[1]);
      pen.lineTo(tip[0] + (dx + side[0]) * cell * 0.12, tip[1] + (dy + side[1]) * cell * 0.12);
      pen.moveTo(tip[0], tip[1]);
      pen.lineTo(tip[0] + (dx - side[0]) * cell * 0.12, tip[1] + (dy - side[1]) * cell * 0.12);
      pen.stroke();
    }
    for (const s of [1, -1]) {
      const ex = hx + dx * cell * 0.16 + side[0] * s * cell * 0.2,
        ey = hy + dy * cell * 0.16 + side[1] * s * cell * 0.2;
      pen.fillStyle = "#ffffff";
      pen.beginPath();
      pen.arc(ex, ey, cell * 0.13, 0, Math.PI * 2);
      pen.fill();
      if (crashed) {
        pen.strokeStyle = "#2a1a10";
        pen.lineWidth = Math.max(1.5, cell * 0.04);
        const k = cell * 0.07;
        pen.beginPath();
        pen.moveTo(ex - k, ey - k);
        pen.lineTo(ex + k, ey + k);
        pen.moveTo(ex + k, ey - k);
        pen.lineTo(ex - k, ey + k);
        pen.stroke();
      } else {
        pen.fillStyle = "#1a1a1a";
        pen.beginPath();
        pen.arc(ex + dx * cell * 0.04, ey + dy * cell * 0.04, cell * 0.07, 0, Math.PI * 2);
        pen.fill();
      }
    }
    // The score on a wooden sign over the garden: apples, points and the level.
    if (!capturing()) {
      const words = `사과 ${state.eaten}/${GOAL}   ${state.score}점   ${LEVELS[state.level - 1].name}`,
        size = Math.round(Math.max(13 * this.ratio, Math.min(cell * 0.62, 22 * this.ratio)));
      pen.font = `800 ${size}px "Inter", "Noto Sans KR", sans-serif`;
      const wide = pen.measureText(words).width + size * 1.6,
        sx = X + (W * cell - wide) / 2,
        sy = Y - f - size * 2.1;
      pen.fillStyle = "#6e4424";
      rounded(pen, sx, sy, wide, size * 1.7, size * 0.4);
      pen.fill();
      pen.fillStyle = "#f6e6c4";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillText(words, sx + wide / 2, sy + size * 0.88);
    }
  }
}
