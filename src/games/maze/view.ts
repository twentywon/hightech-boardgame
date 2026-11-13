import { PixelView, stamp, type Sprite } from "../pixel/view";
import { CAT, CAUGHT, CLEAR, CRUMB, H, PEPPER, W, type State } from "./rules";
import { DT, createWorld, place, step, type World } from "./sim";

export const MAZE_COLORS: [string, string] = ["#b9bcc4", "#b9b3a4"];
/** Dots to a square. */
const T = 8;
const MOUSE: Sprite = ["gg....gg", "gpg..gpg", "gggggggg", "gkggggkg", "gggggggg", ".ggppgg.", "..gggg..", "........"],
  CAT_FACE: Sprite = ["c......c", "cc....cc", "cccccccc", "ckcccckc", "cccccccc", "cccppccc", ".cccccc.", "..c..c.."],
  CHILLI: Sprite = ["....l...", "...ll...", "..rr....", ".rrrr...", ".rrrrr..", "..rrrrr.", "...rrrr.", "....rr.."],
  COATS = ["#e58a2e", "#3b3f46", "#f1ead9", "#9a6b4a"];
/**
 * The kitchen maze drawn in dots: a tiled floor, walls of brick, crumbs of
 * cheese, a grey mouse and cats of four coats. The view plays the maze in
 * real time and reports what happens in it as moves.
 */
export class MazeView extends PixelView<State> {
  private world: World = createWorld(1);
  private left = 0;
  private heard = 0;
  private floor: HTMLCanvasElement | null = null;
  private drawn = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a211b");
    this.begin();
  }
  protected size() {
    return { w: W * T, h: H * T };
  }
  protected changed(_before: State | null, state: State) {
    // A new maze is laid when the level changes.
    if (state.level !== this.world.level && state.winner === null) this.world = createWorld(state.level);
  }
  protected swiped(direction: number) {
    this.onMove({ from: -1, to: direction, extra: -1 });
  }
  protected frame(passed: number, now: number) {
    const state = this.state;
    if (!state || state.winner !== null || !passed) return;
    this.left += Math.min(0.05, passed);
    loop: while (this.left >= DT) {
      this.left -= DT;
      for (const event of step(this.world, this.state?.want ?? -1)) {
        const to = { crumb: CRUMB, pepper: PEPPER, cat: CAT, caught: CAUGHT, clear: CLEAR }[event];
        // Crumbs are too many to be heard one by one; the rest make a sound, a little apart.
        if (event !== "crumb" && now - this.heard > 80) {
          this.heard = now;
          this.onContact();
        }
        this.onMove({ from: -1, to, extra: -1 });
        if (event === "caught" || event === "clear") {
          this.left = 0;
          break loop;
        }
      }
    }
  }
  /** The floor and the walls, painted once for each maze. */
  private ground() {
    if (this.floor && this.drawn === this.world.level) return this.floor;
    const canvas = (this.floor ??= document.createElement("canvas")),
      { wall } = this.world;
    canvas.width = W * T;
    canvas.height = H * T;
    const ctx = canvas.getContext("2d")!;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!wall[y * W + x]) {
          ctx.fillStyle = (x + y) % 2 ? "#efe4cb" : "#e7d9bb";
          ctx.fillRect(x * T, y * T, T, T);
          continue;
        }
        // Brick: a dark joint, two courses, a pale upper edge.
        ctx.fillStyle = "#5a3a26";
        ctx.fillRect(x * T, y * T, T, T);
        ctx.fillStyle = "#a8643c";
        ctx.fillRect(x * T, y * T, T - 1, 3);
        ctx.fillRect(x * T, y * T + 4, 3, 3);
        ctx.fillRect(x * T + 4, y * T + 4, T - 4, 3);
        ctx.fillStyle = "#c98558";
        ctx.fillRect(x * T, y * T, T - 1, 1);
      }
    this.drawn = this.world.level;
    return canvas;
  }
  protected paint(ctx: CanvasRenderingContext2D, state: State, now: number) {
    const { world } = this;
    ctx.drawImage(this.ground(), 0, 0);
    world.crumbs.forEach((crumb, i) => {
      if (!crumb) return;
      ctx.fillStyle = "#e0a92a";
      ctx.fillRect((i % W) * T + 3, Math.floor(i / W) * T + 3, 2, 2);
    });
    // The chillies blink so that they are found.
    world.peppers.forEach((pepper, i) => pepper && Math.floor(now / 260) % 4 !== 0 && stamp(ctx, CHILLI, { r: "#d8362b", l: "#3f8a3a" }, (i % W) * T, Math.floor(i / W) * T));
    const afraid = world.scared > 0,
      ending = afraid && world.scared < 2 && Math.floor(now / 160) % 2 === 0;
    for (const cat of world.cats) {
      const at = place(cat);
      stamp(ctx, CAT_FACE, { c: afraid && !ending ? "#7f93c9" : COATS[cat.kind], k: afraid ? "#ffffff" : cat.kind === 1 ? "#ffd24a" : "#1f2933", p: "#f29bb0" }, at.x * T, at.y * T);
    }
    if (state.winner !== 1) {
      const at = place(world.mouse);
      stamp(ctx, MOUSE, { g: "#b9bcc4", p: "#f29bb0", k: "#1f2933" }, at.x * T, at.y * T, world.mouse.dir === 3);
    }
  }
}
