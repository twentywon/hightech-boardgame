import { PixelView, stamp, type Sprite } from "../pixel/view";
import { DX, DY, H, W, type State } from "./rules";

export const CRATE_COLORS: [string, string] = ["#c9884a", "#b9b3a4"];
/** Dots to a square. */
const T = 16;
const KEEPER: Sprite = [
  "....bbbbbb....",
  "...bbbbbbbbb..",
  "...bbbbbbbbbb.",
  "....ssssss....",
  "...sskssksss..",
  "...ssssssss...",
  "....ssppss....",
  "...oooooooo...",
  "..oooooooooo..",
  ".ssooooooooss.",
  ".ss.oooooo.ss.",
  "....oooooo....",
  "....nn..nn....",
  "...kkk..kkk...",
];
/**
 * The warehouse drawn in dots, seen from straight above: plank floor, brick
 * walls, green marks where the crates belong, and the keeper in his blue
 * cap. A step slides from square to square.
 */
export class CrateView extends PixelView<State> {
  /** The step being shown: from when, and what moved. */
  private slide: { since: number; dir: number; pushed: boolean } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#241c17");
    this.begin();
  }
  get animating() {
    return !!this.slide && performance.now() - this.slide.since < 110;
  }
  protected size() {
    return { w: W * T, h: H * T };
  }
  protected changed(before: State | null, state: State) {
    this.slide = before && state.last && state.ply === before.ply + 1 ? { since: performance.now(), ...state.last } : null;
    if (this.slide?.pushed) this.onContact();
  }
  protected swiped(direction: number) {
    this.onMove({ from: -1, to: direction, extra: -1 });
  }
  protected paint(ctx: CanvasRenderingContext2D, state: State, now: number) {
    // How far the step still has to go, in dots.
    const left = this.slide ? Math.max(0, 1 - (now - this.slide.since) / 110) * T : 0,
      back = this.slide ? { x: -DX[this.slide.dir] * left, y: -DY[this.slide.dir] * left } : { x: 0, y: 0 };
    for (let i = 0; i < W * H; i++) {
      const x = (i % W) * T,
        y = Math.floor(i / W) * T;
      if (state.wall[i]) {
        // Only walls that border the floor are drawn as brick; the rest is the dark outside.
        const edge = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1].some((d) => state.wall[i + d] === false && Math.abs(((i + d) % W) - (i % W)) <= 1);
        if (!edge) continue;
        ctx.fillStyle = "#4f3424";
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = "#9c5f3a";
        for (const [bx, by, bw] of [[0, 0, 7], [8, 0, 8], [0, 4, 3], [4, 4, 7], [12, 4, 4], [0, 8, 7], [8, 8, 8], [0, 12, 3], [4, 12, 7], [12, 12, 4]]) ctx.fillRect(x + bx, y + by, bw, 3);
        ctx.fillStyle = "#b87a50";
        for (const [bx, by, bw] of [[0, 0, 7], [8, 0, 8], [4, 4, 7], [0, 8, 7], [8, 8, 8], [4, 12, 7]]) ctx.fillRect(x + bx, y + by, bw, 1);
        continue;
      }
      ctx.fillStyle = "#d8c39a";
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = "#c9b185";
      ctx.fillRect(x, y + 7, T, 1);
      ctx.fillRect(x, y + 15, T, 1);
      ctx.fillRect(x + ((i % W) % 2 ? 4 : 11), y, 1, 7);
      ctx.fillRect(x + ((i % W) % 2 ? 11 : 4), y + 8, 1, 7);
      if (state.goals.includes(i)) {
        ctx.fillStyle = "#2f9f5f";
        ctx.fillRect(x + 5, y + 5, 6, 6);
        ctx.fillStyle = "#d8c39a";
        ctx.fillRect(x + 7, y + 7, 2, 2);
      }
    }
    const pushedTo = this.slide?.pushed ? state.keeper + DX[this.slide.dir] + DY[this.slide.dir] * W : -1;
    for (const at of state.crates) {
      const x = (at % W) * T + (at === pushedTo ? back.x : 0),
        y = Math.floor(at / W) * T + (at === pushedTo ? back.y : 0),
        placed = state.goals.includes(at);
      ctx.fillStyle = placed ? "#3f6f3a" : "#6b4423";
      ctx.fillRect(x + 1, y + 1, 14, 14);
      ctx.fillStyle = placed ? "#7fbf6a" : "#c9884a";
      ctx.fillRect(x + 2, y + 2, 12, 12);
      ctx.fillStyle = placed ? "#3f6f3a" : "#8a5a2b";
      for (let k = 0; k < 10; k++) {
        ctx.fillRect(x + 3 + k, y + 3 + k, 1, 1);
        ctx.fillRect(x + 12 - k, y + 3 + k, 1, 1);
      }
      ctx.fillRect(x + 2, y + 2, 12, 1);
      ctx.fillRect(x + 2, y + 13, 12, 1);
      ctx.fillRect(x + 2, y + 2, 1, 12);
      ctx.fillRect(x + 13, y + 2, 1, 12);
    }
    stamp(
      ctx,
      KEEPER,
      { b: "#2f62c0", s: "#f2c9a0", k: "#1f2933", p: "#c8452f", o: "#e07a2a", n: "#3b4a5a" },
      (state.keeper % W) * T + 1 + back.x,
      Math.floor(state.keeper / W) * T + 1 + back.y,
      state.face === 3,
    );
  }
}
