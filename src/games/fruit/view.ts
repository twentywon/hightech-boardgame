import { cryptoRandom } from "../../core/random";
import { FlatView, rounded } from "../flat/view";
import { DROP, FRUITS, MERGE, OVER, RADII, type State } from "./rules";
import { DT, HALF, HAND, HEIGHT, LINE, createWorld, drop, step, type World } from "./sim";

export const FRUIT_COLORS: [string, string] = ["#e2483d", "#b9b3a4"];
/** The side of a fruit's picture in pixels, and the radius of the fruit in it (the rest is room for a stalk and a leaf). */
const SPRITE = 256,
  BALL = 100;
/** A small repeatable source of numbers for the speckles of a skin. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** The three colours of each kind: lit, its own, and in shade. */
const PAINT: [string, string, string][] = [
  ["#7f93e6", "#4558b0", "#27306e"],
  ["#ff6a78", "#d81c36", "#86081c"],
  ["#c4f08a", "#86cc48", "#4f8e24"],
  ["#b06ad0", "#7a3590", "#431a54"],
  ["#ffc46a", "#ff9a2a", "#cc6a08"],
  ["#ff8a72", "#e63a2e", "#9c1616"],
  ["#ffe0a0", "#ffbf6a", "#e08a3a"],
  ["#b98a5a", "#8a5e36", "#4a2e18"],
  ["#eef6c4", "#cfe39a", "#8fae5a"],
  ["#6fc86a", "#3f9a46", "#1f5e2a"],
];
/** A leaf, from its stalk end. */
function leaf(pen: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number) {
  pen.save();
  pen.translate(x, y);
  pen.rotate(angle);
  pen.fillStyle = "#4f9a34";
  pen.beginPath();
  pen.moveTo(0, 0);
  pen.quadraticCurveTo(length * 0.5, -length * 0.42, length, 0);
  pen.quadraticCurveTo(length * 0.5, length * 0.42, 0, 0);
  pen.fill();
  pen.strokeStyle = "#2f6a20";
  pen.lineWidth = 2.5;
  pen.beginPath();
  pen.moveTo(0, 0);
  pen.lineTo(length * 0.9, 0);
  pen.stroke();
  pen.restore();
}
/** The picture of a kind: a shaded ball with what makes it that fruit, the stalk upward. */
function picture(kind: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SPRITE;
  const pen = canvas.getContext("2d")!,
    c = SPRITE / 2,
    random = sequence(kind * 97 + 13),
    [lit, own, shade] = PAINT[kind],
    body = pen.createRadialGradient(c - BALL * 0.35, c - BALL * 0.4, BALL * 0.1, c, c, BALL);
  body.addColorStop(0, lit);
  body.addColorStop(0.55, own);
  body.addColorStop(1, shade);
  // What stands behind the ball: a stalk.
  if (kind === 1 || kind === 5) {
    pen.strokeStyle = "#5a3a1e";
    pen.lineWidth = kind === 1 ? 6 : 8;
    pen.lineCap = "round";
    pen.beginPath();
    pen.moveTo(c, c - BALL * 0.82);
    pen.quadraticCurveTo(c + 6, c - BALL * 1.08, c + 22, c - BALL * 1.22);
    pen.stroke();
  }
  pen.save();
  pen.beginPath();
  pen.arc(c, c, BALL, 0, Math.PI * 2);
  pen.fillStyle = body;
  pen.fill();
  pen.clip();
  const dots = (count: number, color: string, size: number) => {
    pen.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2,
        d = Math.sqrt(random()) * BALL * 0.94;
      pen.beginPath();
      pen.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, size * (0.6 + random() * 0.8), 0, Math.PI * 2);
      pen.fill();
    }
  };
  if (kind === 0) {
    dots(16, "rgba(200,212,255,0.14)", 16);
    // The little crown at the top.
    pen.fillStyle = "#1c2250";
    pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2,
        r = i % 2 ? 9 : 22;
      pen.lineTo(c + Math.cos(a) * r, c - BALL * 0.56 + Math.sin(a) * r * 0.7);
    }
    pen.fill();
  } else if (kind === 2) dots(150, "rgba(50,110,24,0.3)", 2.2);
  else if (kind === 3) {
    dots(12, "rgba(230,210,255,0.12)", 22);
    pen.strokeStyle = "rgba(40,10,56,0.45)";
    pen.lineWidth = 5;
    pen.beginPath();
    pen.moveTo(c + 4, c - BALL);
    pen.quadraticCurveTo(c - 26, c, c + 6, c + BALL);
    pen.stroke();
  } else if (kind === 4) dots(170, "rgba(190,90,0,0.32)", 2);
  else if (kind === 5) {
    pen.fillStyle = "rgba(255,214,110,0.4)";
    pen.beginPath();
    pen.ellipse(c + BALL * 0.3, c + BALL * 0.55, BALL * 0.55, BALL * 0.38, -0.5, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "rgba(90,20,10,0.5)";
    pen.beginPath();
    pen.ellipse(c, c - BALL * 0.84, 18, 8, 0, 0, Math.PI * 2);
    pen.fill();
  } else if (kind === 6) {
    dots(190, "rgba(214,120,60,0.3)", 2.2);
    pen.fillStyle = "rgba(255,110,120,0.22)";
    pen.beginPath();
    pen.ellipse(c + BALL * 0.3, c + BALL * 0.3, BALL * 0.6, BALL * 0.5, 0, 0, Math.PI * 2);
    pen.fill();
  } else if (kind === 7) {
    pen.lineWidth = 2;
    for (let i = 0; i < 420; i++) {
      const a = random() * Math.PI * 2,
        d = Math.sqrt(random()) * BALL,
        x = c + Math.cos(a) * d,
        y = c + Math.sin(a) * d;
      pen.strokeStyle = i % 2 ? "rgba(40,22,10,0.4)" : "rgba(214,170,120,0.3)";
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + (random() - 0.5) * 8, y + 10 + random() * 16);
      pen.stroke();
    }
    pen.fillStyle = "#2a1a10";
    for (const [dx, dy] of [[-20, -54], [20, -54], [0, -28]]) {
      pen.beginPath();
      pen.ellipse(c + dx, c + dy, 10, 8, 0, 0, Math.PI * 2);
      pen.fill();
    }
  } else if (kind === 8) {
    pen.strokeStyle = "rgba(250,252,232,0.8)";
    pen.lineWidth = 2.5;
    for (let i = 0; i < 90; i++) {
      const a = random() * Math.PI * 2,
        d = Math.sqrt(random()) * BALL,
        x = c + Math.cos(a) * d,
        y = c + Math.sin(a) * d;
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + (random() - 0.5) * 70, y + (random() - 0.5) * 70);
      pen.stroke();
    }
  } else if (kind === 9) {
    // Dark bands that bow outward from the stalk to the base.
    pen.fillStyle = "#17502a";
    for (let band = -3; band <= 3; band++) {
      const bow = band * BALL * 0.36,
        half = BALL * 0.07;
      pen.beginPath();
      pen.moveTo(c, c - BALL);
      for (let t = 0; t <= 1.001; t += 0.05) pen.lineTo(c + Math.sin(t * Math.PI) * (bow - half) + Math.sin(t * 40 + band) * 3, c - BALL + t * BALL * 2);
      for (let t = 1; t >= -0.001; t -= 0.05) pen.lineTo(c + Math.sin(t * Math.PI) * (bow + half) + Math.sin(t * 34 + band * 2) * 3, c - BALL + t * BALL * 2);
      pen.fill();
    }
  }
  // Shade toward the lower right, and a gloss where the light falls.
  const dusk = pen.createRadialGradient(c - BALL * 0.3, c - BALL * 0.35, BALL * 0.5, c, c, BALL * 1.02);
  dusk.addColorStop(0, "rgba(0,0,0,0)");
  dusk.addColorStop(1, "rgba(0,0,0,0.28)");
  pen.fillStyle = dusk;
  pen.fillRect(0, 0, SPRITE, SPRITE);
  if (kind !== 7) {
    pen.fillStyle = `rgba(255,255,255,${kind === 8 ? 0.2 : 0.5})`;
    pen.beginPath();
    pen.ellipse(c - BALL * 0.42, c - BALL * 0.46, BALL * 0.2, BALL * 0.12, -0.7, 0, Math.PI * 2);
    pen.fill();
  }
  pen.restore();
  pen.strokeStyle = "rgba(0,0,0,0.28)";
  pen.lineWidth = 3;
  pen.beginPath();
  pen.arc(c, c, BALL - 1.5, 0, Math.PI * 2);
  pen.stroke();
  // What stands before the ball: a leaf, a stalk end.
  if (kind === 4 || kind === 5) leaf(pen, c + (kind === 5 ? 14 : 0), c - BALL * (kind === 5 ? 1.02 : 0.9), 44, kind === 5 ? -0.5 : -0.2);
  if (kind === 2 || kind === 6 || kind === 8 || kind === 9 || kind === 3) {
    pen.fillStyle = kind === 9 ? "#6a5a2a" : "#5a6a2a";
    pen.beginPath();
    pen.ellipse(c, c - BALL * 0.93, 9, 6, 0, 0, Math.PI * 2);
    pen.fill();
  }
  return canvas;
}
/**
 * The glass box drawn flat, from the front. The view plays the box in real
 * time: the fruit in hand follows the pointer and falls when it is let go,
 * and each drop, each merging and the overflow are reported as moves.
 */
export class FruitView extends FlatView<State> {
  private world: World = createWorld(cryptoRandom);
  private pictures = FRUITS.map((_, kind) => picture(kind));
  private born = new Map<number, number>();
  /** Bursts where two have just merged: where, how large, and when. */
  private pops: { x: number; y: number; r: number; at: number }[] = [];
  private target = 0;
  private held = 0;
  private last = performance.now();
  private left = 0;
  private heard = 0;
  private paused = false;
  /** Where the box's floor centre is on the canvas, and pixels to a unit. */
  private fit = { x: 0, y: 0, unit: 1 };
  private keys: [string, (e: Event) => void][] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    const el = this.canvas,
      on = (name: string, fn: (e: Event) => void) => {
        el.addEventListener(name, fn);
        this.keys.push([name, fn]);
      };
    on("keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "ArrowLeft") this.held = -1;
      else if (e.key === "ArrowRight") this.held = 1;
      else if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        this.send();
      }
    });
    on("keyup", (event) => {
      const e = event as KeyboardEvent;
      if ((e.key === "ArrowLeft" && this.held < 0) || (e.key === "ArrowRight" && this.held > 0)) this.held = 0;
    });
    on("blur", () => (this.held = 0));
    this.begin();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.held = 0;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private report(events: ReturnType<typeof step>, now: number) {
    for (const event of events) {
      if (event.kind === "drop") this.onMove({ from: -1, to: DROP, extra: -1 });
      else if (event.kind === "merge") {
        this.pops.push({ x: event.x, y: event.y, r: RADII[Math.min(RADII.length - 1, event.fruit + 1)], at: now });
        this.onMove({ from: -1, to: MERGE + event.fruit, extra: -1 });
        if (now - this.heard > 70) {
          this.heard = now;
          this.onContact();
        }
      } else if (event.kind === "over") this.onMove({ from: -1, to: OVER, extra: -1 });
    }
  }
  /** Lets the fruit in hand fall. */
  private send() {
    if (!this.running()) return;
    this.world.aim = this.target;
    this.report(drop(this.world), performance.now());
  }
  private across(x: number) {
    return (x - this.fit.x) / this.fit.unit;
  }
  protected pressed(x: number) {
    this.target = this.across(x);
  }
  protected moved(x: number, _y: number, held: boolean, mouse: boolean) {
    if (held || mouse) this.target = this.across(x);
  }
  protected released(x: number) {
    this.target = this.across(x);
    this.send();
  }
  protected changed(before: State | null, state: State) {
    // A new game, known by the count of moves going back to nothing, empties the box.
    // (Not by what lies in the box: the screen shows the state once more before each move it is told of.)
    if (state.ply === 0 && before && before.ply > 0) {
      this.world = createWorld(cryptoRandom);
      this.born.clear();
      this.pops = [];
    }
  }
  protected frame(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (!this.running()) return false;
    if (this.held) this.target = Math.max(-HALF, Math.min(HALF, this.world.aim + this.held * 7 * real));
    this.left += Math.min(0.05, real);
    while (this.left >= DT && !this.world.ended) {
      this.left -= DT;
      this.report(step(this.world, this.target), now);
    }
    return true;
  }
  private fruit(pen: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number, turn = 0) {
    const { unit } = this.fit,
      size = ((r * unit) / BALL) * SPRITE;
    pen.save();
    pen.translate(this.fit.x + x * unit, this.fit.y - y * unit);
    pen.rotate(-turn);
    pen.drawImage(this.pictures[kind], -size / 2, -size / 2, size, size);
    pen.restore();
  }
  protected paint(pen: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const { world } = this,
      top = 54 * this.ratio,
      // The box, the hand over it and a plate beside it must all fit under the status line.
      unit = Math.min((h - top - 20 * this.ratio) / (HAND + 1.1), (w * 0.96) / (HALF * 2 + 3.6)),
      fx = w / 2 - unit * 0.9,
      fy = h - 14 * this.ratio - unit * 0.25;
    this.fit = { x: fx, y: fy, unit };
    const X = (x: number) => fx + x * unit,
      Y = (y: number) => fy - y * unit;
    // A kitchen wall of pale tiles and a wooden counter.
    pen.fillStyle = "#f3eee2";
    pen.fillRect(0, 0, w, h);
    pen.strokeStyle = "#e0d7c5";
    pen.lineWidth = Math.max(1, unit * 0.03);
    const tile = unit * 1.5;
    for (let row = 0, y = fy - tile; y > -tile; y -= tile, row++) {
      pen.beginPath();
      pen.moveTo(0, y);
      pen.lineTo(w, y);
      pen.stroke();
      for (let x = ((row % 2) * tile) / 2 + (fx % tile) - tile; x < w; x += tile) {
        pen.beginPath();
        pen.moveTo(x, y);
        pen.lineTo(x, y + tile);
        pen.stroke();
      }
    }
    const counter = pen.createLinearGradient(0, fy, 0, h);
    counter.addColorStop(0, "#c99a62");
    counter.addColorStop(1, "#a87a48");
    pen.fillStyle = counter;
    pen.fillRect(0, fy + unit * 0.22, w, h);
    // The box: glass, a wooden foot, and the line fruit must stay under.
    pen.fillStyle = "rgba(190,226,236,0.28)";
    pen.fillRect(X(-HALF), Y(HEIGHT), HALF * 2 * unit, HEIGHT * unit);
    const spilling = world.over > 0;
    pen.strokeStyle = spilling ? `rgba(226,54,44,${0.55 + 0.45 * Math.abs(Math.sin(now / 120))})` : "rgba(226,72,61,0.75)";
    pen.lineWidth = Math.max(2, unit * 0.06);
    pen.setLineDash([unit * 0.3, unit * 0.2]);
    pen.beginPath();
    pen.moveTo(X(-HALF), Y(LINE));
    pen.lineTo(X(HALF), Y(LINE));
    pen.stroke();
    pen.setLineDash([]);
    const ready = world.wait <= 0 && !world.ended && this.state?.winner === null;
    if (ready) {
      // Where the fruit in hand would fall.
      pen.strokeStyle = "rgba(90,58,34,0.35)";
      pen.lineWidth = Math.max(1.5, unit * 0.03);
      pen.setLineDash([unit * 0.14, unit * 0.14]);
      pen.beginPath();
      pen.moveTo(X(world.aim), Y(HAND - RADII[world.held]));
      pen.lineTo(X(world.aim), Y(0));
      pen.stroke();
      pen.setLineDash([]);
    }
    const alive = new Set<number>();
    for (const f of world.fruits) {
      alive.add(f.id);
      if (!this.born.has(f.id)) this.born.set(f.id, now);
      // A fruit just made swells into its size.
      const grown = f.age < 0.01 ? 1 : Math.min(1, 0.6 + (now - this.born.get(f.id)!) / 240);
      this.fruit(pen, f.kind, f.x, f.y, RADII[f.kind] * grown, f.turn);
    }
    for (const id of this.born.keys()) if (!alive.has(id)) this.born.delete(id);
    this.pops = this.pops.filter((pop) => now - pop.at < 320);
    for (const pop of this.pops) {
      const p = (now - pop.at) / 320;
      pen.strokeStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
      pen.lineWidth = unit * 0.1 * (1 - p) + 1;
      pen.beginPath();
      pen.arc(X(pop.x), Y(pop.y), unit * pop.r * (0.9 + p * 0.5), 0, Math.PI * 2);
      pen.stroke();
    }
    // The panes' edges and the foot go over the fruit.
    pen.strokeStyle = "#8fb4c0";
    pen.lineWidth = Math.max(2, unit * 0.07);
    pen.beginPath();
    pen.moveTo(X(-HALF), Y(HEIGHT));
    pen.lineTo(X(-HALF), Y(0));
    pen.lineTo(X(HALF), Y(0));
    pen.lineTo(X(HALF), Y(HEIGHT));
    pen.stroke();
    pen.fillStyle = "rgba(255,255,255,0.22)";
    pen.fillRect(X(-HALF) + unit * 0.16, Y(HEIGHT) + unit * 0.2, unit * 0.12, HEIGHT * unit - unit * 0.4);
    rounded(pen, X(-HALF) - unit * 0.3, Y(0), HALF * 2 * unit + unit * 0.6, unit * 0.36, unit * 0.1);
    pen.fillStyle = "#5a3a22";
    pen.fill();
    if (ready) this.fruit(pen, world.held, world.aim, HAND, RADII[world.held]);
    // The fruit after this one waits on a plate beside the box, under its label.
    const px = HALF + 1.75,
      r = RADII[world.next];
    pen.fillStyle = "rgba(0,0,0,0.14)";
    pen.beginPath();
    pen.ellipse(X(px), Y(-0.16), unit * 1.05, unit * 0.16, 0, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#fbf8f0";
    pen.strokeStyle = "#cfc6b4";
    pen.lineWidth = Math.max(1, unit * 0.03);
    pen.beginPath();
    pen.ellipse(X(px), Y(0.02), unit * 1.0, unit * 0.2, 0, 0, Math.PI * 2);
    pen.fill();
    pen.stroke();
    this.fruit(pen, world.next, px, r + 0.08, r);
    pen.fillStyle = "#3a2c22";
    pen.font = `800 ${unit * 0.5}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText("다음", X(px), Y(2.5));
  }
  dispose() {
    for (const [name, fn] of this.keys) this.canvas.removeEventListener(name, fn);
    super.dispose();
  }
}
