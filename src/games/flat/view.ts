import type { PointView } from "../../ui/point-game";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";

/**
 * What the flat views share: one canvas painted as a picture, with nothing
 * three-dimensional in it. A game says how its state is painted and what a
 * press on the picture means; the canvas, its size, the frame loop and the
 * pointer are kept here.
 */
export abstract class FlatView<S> implements PointView<S> {
  readonly renderer: { domElement: HTMLCanvasElement };
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
  onMove: (move: Move) => void = () => {};
  protected canvas = document.createElement("canvas");
  protected state: S | null = null;
  protected marks: Marks = { movable: [], selected: null, targets: [], removable: [], cursor: null };
  protected disposed = false;
  /** Canvas pixels to a CSS pixel. */
  protected ratio = 1;
  protected dirty = true;
  private ticker = 0;
  private observer: ResizeObserver;
  private listeners: [string, (e: PointerEvent) => void][] = [];
  constructor(
    protected host: HTMLElement,
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
    let down: number | null = null;
    on("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.disposed) return;
      down = e.pointerId;
      el.setPointerCapture(e.pointerId);
      this.pressed(e.offsetX * this.ratio, e.offsetY * this.ratio);
    });
    on("pointermove", (e) => {
      if (!this.disposed) this.moved(e.offsetX * this.ratio, e.offsetY * this.ratio, down === e.pointerId, e.pointerType === "mouse");
    });
    on("pointerup", (e) => {
      if (down !== e.pointerId || this.disposed) return;
      down = null;
      this.released(e.offsetX * this.ratio, e.offsetY * this.ratio);
    });
    on("pointercancel", () => (down = null));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  /** Starts the frames; called by the game's view once it is ready to paint. */
  protected begin() {
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      const now = performance.now();
      if (this.frame(now) || this.dirty) {
        this.dirty = false;
        const pen = this.canvas.getContext("2d")!;
        pen.setTransform(1, 0, 0, 1, 0, 0);
        this.paint(pen, this.canvas.width, this.canvas.height, now);
        if (!this.canvas.dataset.ready) this.canvas.dataset.ready = "true";
      }
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The picture is never waited for unless a view says so. */
  get animating() {
    return false;
  }
  /** Something that goes on between moves; true when the picture must be painted again. */
  protected frame(_now: number) {
    return false;
  }
  protected abstract paint(pen: CanvasRenderingContext2D, width: number, height: number, now: number): void;
  /** The pointer goes down, moves (held or, for a mouse, hovering) and comes up, in canvas pixels. */
  protected pressed(_x: number, _y: number) {}
  protected moved(_x: number, _y: number, _held: boolean, _mouse: boolean) {}
  protected released(_x: number, _y: number) {}
  /** What a new state means beyond being painted (a sound, a flash). */
  protected changed(_before: S | null, _state: S) {}
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
  setMarks(marks: Marks) {
    this.marks = marks;
    this.dirty = true;
  }
  sync(state: S) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
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
/** A square with rounded corners, as a path. */
export function rounded(pen: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  pen.beginPath();
  pen.moveTo(x + r, y);
  pen.arcTo(x + w, y, x + w, y + h, r);
  pen.arcTo(x + w, y + h, x, y + h, r);
  pen.arcTo(x, y + h, x, y, r);
  pen.arcTo(x, y, x + w, y, r);
  pen.closePath();
}
