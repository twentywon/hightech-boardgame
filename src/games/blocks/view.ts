import type { PointView } from "../../ui/point-game";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { DOWN, DROP, H, LEFT, RIGHT, TICK, TURN, W, cells, interval, landing, level, type Piece, type State } from "./rules";

export const BLOCK_COLORS: [string, string] = ["#d9614c", "#b9b3a4"];
/** The paint of each of the seven pieces: toy-box colours, not neon. */
const PAINT = ["#d9614c", "#2f9f8f", "#e0a92a", "#4b5fb5", "#7a9a3a", "#8a4f9a", "#3f9ad0", "#8b9198"];
/** A colour made lighter (amount above 0) or darker (below). */
function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16),
    mix = (c: number) => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
/**
 * The well drawn flat, as a picture: upright, the pieces coming down the
 * screen. Nothing here is three-dimensional; it is painted on one canvas.
 * The view keeps the clock (a fall every so often, sooner at higher levels)
 * and turns swipes and taps into moves.
 */
export class BlocksView implements PointView<State> {
  readonly renderer: { domElement: HTMLCanvasElement };
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
  onMove: (move: Move) => void = () => {};
  private canvas = document.createElement("canvas");
  private state: State | null = null;
  private disposed = false;
  private ratio = 1;
  private ticker = 0;
  private since = performance.now();
  private dirty = true;
  private paused = false;
  private observer: ResizeObserver;
  /** Rows just taken out, shown as a fading band until `until`. */
  private flash: { rows: number[]; until: number } | null = null;
  /** Where the well is on the canvas, in its own pixels: left, top and the side of a square. */
  private box = { x: 0, y: 0, cell: 1 };
  /** A drag in progress: where it began, when, and how many squares of it have been made into moves. */
  private drag: { id: number; x: number; y: number; at: number; across: number; down: number; moved: boolean } | null = null;
  private listeners: [string, (e: PointerEvent) => void][] = [];
  constructor(
    private host: HTMLElement,
    private quality: "high" | "low",
  ) {
    const el = this.canvas;
    this.renderer = { domElement: el };
    el.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:pointer;outline-offset:-3px";
    host.append(el);
    const on = (name: string, fn: (e: PointerEvent) => void) => {
      el.addEventListener(name, fn as EventListener);
      this.listeners.push([name, fn]);
    };
    on("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.disposed) return;
      this.drag = { id: e.pointerId, x: e.offsetX, y: e.offsetY, at: performance.now(), across: 0, down: 0, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    on("pointermove", (e) => this.dragged(e));
    on("pointerup", (e) => this.released(e));
    on("pointercancel", () => (this.drag = null));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      const now = performance.now(),
        state = this.state;
      if (this.flash && now >= this.flash.until) {
        this.flash = null;
        this.dirty = true;
      }
      if (this.dirty || this.flash) this.draw(now);
      // The clock stands while a window is open, the page is hidden or the game is over.
      if (!state || state.winner !== null || this.paused || document.hidden || document.querySelector("dialog[open]")) {
        this.since = now;
        return;
      }
      if (now - this.since >= interval(level(state))) {
        this.since = now;
        this.onMove({ from: -1, to: TICK, extra: -1 });
      }
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The well never makes the screen wait. */
  get animating() {
    return false;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.ratio = Math.min(devicePixelRatio || 1, this.quality === "high" ? 2 : 1);
    this.canvas.width = Math.round(w * this.ratio);
    this.canvas.height = Math.round(h * this.ratio);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.quality = quality;
    this.resize();
  }
  setMarks(_marks: Marks) {}
  setPaused(paused: boolean) {
    this.paused = paused;
    this.since = performance.now();
  }
  sync(state: State) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    // A piece coming to rest is heard, and the clock starts again for the new one; rows taken out flash as they go.
    if (before && state.last?.locked && state.ply === before.ply + 1) {
      this.onContact();
      this.since = performance.now();
      if (state.last.cleared.length) this.flash = { rows: state.last.cleared, until: performance.now() + 240 };
    }
    this.onSettled();
  }
  /** A finger on the picture: across moves the piece column by column, downward brings it down, a flick downward drops it, a tap turns it. */
  private dragged(e: PointerEvent) {
    const drag = this.drag;
    if (!drag || drag.id !== e.pointerId) return;
    const cell = this.box.cell / this.ratio,
      across = Math.round((e.offsetX - drag.x) / cell),
      down = Math.max(0, Math.floor((e.offsetY - drag.y) / cell));
    while (drag.across !== across) {
      const way = across > drag.across ? 1 : -1;
      drag.across += way;
      drag.moved = true;
      this.onMove({ from: -1, to: way > 0 ? RIGHT : LEFT, extra: -1 });
    }
    // Brought down by hand only when the finger has clearly gone that way and is not in the middle of a flick.
    while (drag.down < down && performance.now() - drag.at > 220) {
      drag.down++;
      drag.moved = true;
      this.onMove({ from: -1, to: DOWN, extra: -1 });
    }
  }
  private released(e: PointerEvent) {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.id !== e.pointerId) return;
    const cell = this.box.cell / this.ratio,
      dx = e.offsetX - drag.x,
      dy = e.offsetY - drag.y;
    if (performance.now() - drag.at <= 220 && dy > cell * 2.5 && dy > Math.abs(dx) * 1.5) this.onMove({ from: -1, to: DROP, extra: -1 });
    else if (!drag.moved && Math.hypot(dx, dy) < cell * 0.6) this.onMove({ from: -1, to: TURN, extra: -1 });
  }
  /** One square of a piece: a flat tile with a pale upper edge and a dark lower one. */
  private tile(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
    const gap = Math.max(1, size * 0.04),
      s = size - gap * 2,
      r = s * 0.16,
      band = s * 0.14;
    ctx.fillStyle = shade(color, -0.28);
    ctx.beginPath();
    ctx.roundRect(x + gap, y + gap, s, s, r);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x + gap, y + gap, s, s - band, r);
    ctx.fill();
    ctx.fillStyle = shade(color, 0.32);
    ctx.beginPath();
    ctx.roundRect(x + gap + band, y + gap + band * 0.7, s - band * 2, band * 0.9, band * 0.45);
    ctx.fill();
  }
  private piece(ctx: CanvasRenderingContext2D, piece: Piece, x: number, y: number, size: number, color: string, hollow = false) {
    for (const [cx, cy] of cells(piece)) {
      if (!hollow) this.tile(ctx, x + cx * size, y + cy * size, size, color);
      else {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
        ctx.lineWidth = Math.max(1, size * 0.06);
        ctx.beginPath();
        ctx.roundRect(x + cx * size + size * 0.1, y + cy * size + size * 0.1, size * 0.8, size * 0.8, size * 0.14);
        ctx.stroke();
      }
    }
  }
  private draw(now: number) {
    const el = this.canvas,
      ctx = el.getContext("2d")!,
      w = el.width,
      h = el.height,
      k = this.ratio,
      state = this.state;
    this.dirty = false;
    // A sheet of pale paper with a faint weave.
    const paper = ctx.createLinearGradient(0, 0, 0, h);
    paper.addColorStop(0, "#efe9dc");
    paper.addColorStop(1, "#dfe6e4");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(60, 70, 80, 0.05)";
    for (let y = 0; y < h; y += 22 * k) for (let x = (y / (22 * k)) % 2 ? 11 * k : 0; x < w; x += 22 * k) ctx.fillRect(x, y, 2 * k, 2 * k);
    // The well stands in the middle, under the status line; the next piece waits in a box at its upper right.
    const top = 50 * k,
      bottom = 12 * k,
      cell = Math.max(4, Math.floor(Math.min((h - top - bottom) / H, (w - 24 * k) / (W + 12)))),
      x0 = Math.round((w - W * cell) / 2),
      y0 = Math.round(top + (h - top - bottom - H * cell) / 2);
    this.box = { x: x0, y: y0, cell };
    const rim = cell * 0.22;
    ctx.fillStyle = "#c9c1ae";
    ctx.beginPath();
    ctx.roundRect(x0 - rim, y0 - rim, W * cell + rim * 2, H * cell + rim * 2, cell * 0.3);
    ctx.fill();
    ctx.fillStyle = "#273540";
    ctx.beginPath();
    ctx.roundRect(x0, y0, W * cell, H * cell, cell * 0.12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
    ctx.lineWidth = Math.max(1, k);
    ctx.beginPath();
    for (let x = 1; x < W; x++) {
      ctx.moveTo(x0 + x * cell, y0);
      ctx.lineTo(x0 + x * cell, y0 + H * cell);
    }
    for (let y = 1; y < H; y++) {
      ctx.moveTo(x0, y0 + y * cell);
      ctx.lineTo(x0 + W * cell, y0 + y * cell);
    }
    ctx.stroke();
    const nx = x0 + W * cell + cell * 0.9,
      nw = cell * 5,
      nh = cell * 4.4;
    ctx.fillStyle = "#c9c1ae";
    ctx.beginPath();
    ctx.roundRect(nx - rim, y0 - rim, nw + rim * 2, nh + rim * 2, cell * 0.3);
    ctx.fill();
    ctx.fillStyle = "#273540";
    ctx.beginPath();
    ctx.roundRect(nx, y0, nw, nh, cell * 0.12);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = `700 ${Math.round(cell * 0.56)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("다음", nx + nw / 2, y0 + cell * 0.7);
    if (state) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, W * cell, H * cell);
      ctx.clip();
      state.grid.forEach((kind, i) => kind && this.tile(ctx, x0 + (i % W) * cell, y0 + Math.floor(i / W) * cell, cell, PAINT[kind - 1]));
      const rest = landing(state);
      if (state.piece && rest && rest.y !== state.piece.y) this.piece(ctx, rest, x0, y0, cell, "", true);
      if (state.piece) this.piece(ctx, state.piece, x0, y0, cell, PAINT[state.piece.kind]);
      if (this.flash) {
        // The rows that have just gone: a band of light that fades.
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, (this.flash.until - now) / 240) * 0.8})`;
        for (const row of this.flash.rows) ctx.fillRect(x0, y0 + row * cell, W * cell, cell);
      }
      if (state.winner !== null) {
        ctx.fillStyle = "rgba(20, 28, 34, 0.5)";
        ctx.fillRect(x0, y0, W * cell, H * cell);
      }
      ctx.restore();
      if (state.winner === null) {
        // The next piece, in the middle of its box.
        const size = state.next === 0 ? 4 : state.next === 1 ? 2 : 3,
          rows = state.next === 0 ? 1 : 2,
          first = state.next === 0 ? 1 : 0;
        this.piece(ctx, { kind: state.next, rot: 0, x: 0, y: 0 }, nx + (nw - size * cell) / 2, y0 + cell * 1.3 + (nh - cell * 1.3 - rows * cell) / 2 - first * cell, cell, PAINT[state.next]);
      }
    }
    if (!el.dataset.ready) el.dataset.ready = "true";
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.ticker);
    this.observer.disconnect();
    for (const [name, fn] of this.listeners) this.canvas.removeEventListener(name, fn as EventListener);
    this.canvas.remove();
  }
}
