import type { PointView } from "../../ui/point-game";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";

/** A picture in dots: rows of characters, each standing for a colour of the palette ("." is nothing). */
export type Sprite = string[];
export function stamp(ctx: CanvasRenderingContext2D, sprite: Sprite, palette: Record<string, string>, x: number, y: number, flip = false) {
  sprite.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) {
      const color = palette[row[flip ? row.length - 1 - dx : dx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1, 1);
    }
  });
}
/**
 * A game drawn in dots: a small picture, a few pixels to a square, painted
 * on a hidden canvas and shown enlarged without smoothing, so every dot is
 * a clean square. The view owns the canvas, the frame loop and the pointer
 * (a swipe is a direction, a tap a place); a game says how large its picture
 * is and paints it.
 */
export abstract class PixelView<S> implements PointView<S> {
  readonly renderer: { domElement: HTMLCanvasElement };
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
  onMove: (move: Move) => void = () => {};
  protected state: S | null = null;
  protected disposed = false;
  protected paused = false;
  private canvas = document.createElement("canvas");
  private small = document.createElement("canvas");
  private observer: ResizeObserver;
  private ticker = 0;
  private last = performance.now();
  private press: { id: number; x: number; y: number } | null = null;
  private listeners: [string, (e: PointerEvent) => void][] = [];
  /** Where the picture is shown on the canvas, in canvas pixels, and how many of them make one dot. */
  private shown = { x: 0, y: 0, scale: 1 };
  constructor(
    private host: HTMLElement,
    private quality: "high" | "low",
    /** The colour round the picture. */
    private backdrop: string,
  ) {
    const el = this.canvas;
    this.renderer = { domElement: el };
    el.style.cssText = "display:block;width:100%;height:100%;touch-action:none;cursor:pointer;outline-offset:-3px;image-rendering:pixelated";
    host.append(el);
    const on = (name: string, fn: (e: PointerEvent) => void) => {
      el.addEventListener(name, fn as EventListener);
      this.listeners.push([name, fn]);
    };
    on("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.disposed) return;
      this.press = { id: e.pointerId, x: e.offsetX, y: e.offsetY };
      el.setPointerCapture(e.pointerId);
    });
    on("pointerup", (e) => {
      const press = this.press;
      this.press = null;
      if (!press || press.id !== e.pointerId || this.disposed) return;
      const dx = e.offsetX - press.x,
        dy = e.offsetY - press.y;
      // A swipe of some length is a direction (0 up, 1 right, 2 down, 3 left); anything shorter is a tap on a dot of the picture.
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 18) this.swiped(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
      else {
        const ratio = el.width / Math.max(1, el.clientWidth);
        this.tapped((e.offsetX * ratio - this.shown.x) / this.shown.scale, (e.offsetY * ratio - this.shown.y) / this.shown.scale);
      }
    });
    on("pointercancel", () => (this.press = null));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  /** Starts the frame loop; called by the game's view once it is ready to paint. */
  protected begin() {
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      const now = performance.now(),
        passed = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      // Time stands still while a window is open, the page is hidden or the game is paused.
      const running = !this.paused && !document.hidden && !document.querySelector("dialog[open]");
      this.frame(running ? passed : 0, now);
      this.draw(now);
    };
    this.ticker = requestAnimationFrame(tick);
  }
  get animating() {
    return false;
  }
  /** The size of the picture in dots. */
  protected abstract size(state: S): { w: number; h: number };
  /** Paints the picture; `ctx` is the small canvas, one unit a dot. */
  protected abstract paint(ctx: CanvasRenderingContext2D, state: S, now: number): void;
  /** Called every frame with the seconds that have passed (0 while time stands still). */
  protected frame(_passed: number, _now: number) {}
  protected swiped(_direction: number) {}
  protected tapped(_x: number, _y: number) {}
  /** Called with the state before and after, when a new state is shown. */
  protected changed(_before: S | null, _state: S) {}
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(devicePixelRatio || 1, this.quality === "high" ? 2 : 1);
    this.canvas.width = Math.round(w * ratio);
    this.canvas.height = Math.round(h * ratio);
  }
  private draw(now: number) {
    const state = this.state,
      el = this.canvas,
      ctx = el.getContext("2d")!;
    ctx.fillStyle = this.backdrop;
    ctx.fillRect(0, 0, el.width, el.height);
    if (!state) return;
    const { w, h } = this.size(state);
    if (this.small.width !== w || this.small.height !== h) {
      this.small.width = w;
      this.small.height = h;
    }
    const dots = this.small.getContext("2d")!;
    dots.clearRect(0, 0, w, h);
    this.paint(dots, state, now);
    // The status line lies over the top of the table: the picture keeps clear of it. Whole dots when there is room for them.
    const ratio = el.width / Math.max(1, el.clientWidth),
      top = 48 * ratio,
      bottom = 10 * ratio,
      fit = Math.min((el.width - 16 * ratio) / w, (el.height - top - bottom) / h),
      scale = fit >= 2 ? Math.floor(fit) : fit,
      x = Math.round((el.width - w * scale) / 2),
      y = Math.round(top + (el.height - top - bottom - h * scale) / 2);
    this.shown = { x, y, scale };
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.small, x, y, w * scale, h * scale);
    if (!el.dataset.ready) el.dataset.ready = "true";
  }
  setQuality(quality: "high" | "low") {
    this.quality = quality;
    this.resize();
  }
  setMarks(_marks: Marks) {}
  setPaused(paused: boolean) {
    this.paused = paused;
  }
  sync(state: S) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.changed(before, state);
    this.onSettled();
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
