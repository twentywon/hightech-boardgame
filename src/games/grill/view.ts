import { cryptoRandom } from "../../core/random";
import { FlatView, rounded } from "../flat/view";
import { BEST, BURN, FLIP, LIVES, SERVE, type State } from "./rules";
import { BURNT, CHARRED, DT, GOOD, OVER, RAW, SLOTS, createWorld, down, press, step, type Piece, type World } from "./sim";

export const GRILL_COLORS: [string, string] = ["#c8553a", "#b9b3a4"];
type Rgb = [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * Math.max(0, Math.min(1, t)))) as Rgb,
  css = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r},${g},${b},${alpha})`;
/** A colour as a side cooks: raw, done, then charred. */
const cooked = (raw: Rgb, ready: Rgb, done: number) => (done <= 1 ? mix(raw, ready, done) : mix(ready, [38, 26, 20], (done - 1) / (BURNT - 1)));
/** Where the seven places are, in units of the grill's radius: the middle, then six round it. */
const PLACES = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3 - Math.PI / 2) * 0.62, Math.sin((i * Math.PI) / 3 - Math.PI / 2) * 0.62])];
/**
 * A round charcoal grill seen from above, drawn flat. The view plays the
 * grill in real time: a press on a piece turns it or takes it off, and each
 * turning, each piece taken off and each piece burnt is reported as a move.
 */
export class GrillView extends FlatView<State> {
  private world: World = createWorld(cryptoRandom);
  /** Words that rise from a place and fade: what a piece taken off was. */
  private words: { slot: number; text: string; color: string; at: number }[] = [];
  private cursor = -1;
  private last = performance.now();
  private left = 0;
  private paused = false;
  /** The grill's centre and radius on the canvas. */
  private fit = { x: 0, y: 0, r: 1 };
  private keys: [string, (e: Event) => void][] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality);
    const on = (name: string, fn: (e: Event) => void) => {
      this.canvas.addEventListener(name, fn);
      this.keys.push([name, fn]);
    };
    // The keyboard walks round the places and presses the one it stands on.
    on("keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") this.cursor = (this.cursor + 1) % SLOTS;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") this.cursor = (this.cursor + SLOTS - 1 + (this.cursor < 0 ? 1 : 0)) % SLOTS;
      else if ((e.key === " " || e.key === "Enter") && this.cursor >= 0) this.tap(this.cursor);
      else return;
      e.preventDefault();
      this.dirty = true;
    });
    on("blur", () => {
      this.cursor = -1;
      this.dirty = true;
    });
    this.begin();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private report(events: ReturnType<typeof step>, now: number) {
    for (const event of events) {
      if (event.kind === "flip") this.onMove({ from: -1, to: FLIP, extra: -1 });
      else if (event.kind === "burn") {
        this.words.push({ slot: event.slot, text: "탔다!", color: "#e2362c", at: now });
        this.onMove({ from: -1, to: BURN, extra: -1 });
      } else if (event.kind === "serve") {
        const [text, color] = event.raw ? ["덜 익었어요", "#6f7a86"] : event.points === BEST ? ["완벽!", "#e09a12"] : event.points >= 4 ? ["맛있어요", "#2f9a4a"] : event.points >= 2 ? ["괜찮아요", "#3f7fc0"] : ["아쉬워요", "#8a6a4a"];
        this.words.push({ slot: event.slot, text: event.raw ? text : `${text} +${event.points}`, color, at: now });
        this.onMove({ from: -1, to: SERVE + event.points, extra: -1 });
      } else continue;
      this.onContact();
    }
  }
  private tap(slot: number) {
    if (this.running()) this.report(press(this.world, slot), performance.now());
  }
  protected released(x: number, y: number) {
    const { r } = this.fit;
    let best = -1,
      near = r * 0.3;
    PLACES.forEach(([px, py], slot) => {
      const far = Math.hypot(x - (this.fit.x + px * r), y - (this.fit.y + py * r));
      if (far < near) {
        near = far;
        best = slot;
      }
    });
    if (best >= 0) this.tap(best);
  }
  protected changed(_before: State | null, state: State) {
    // A new game clears the grill.
    if (state.ply === 0 && this.world.time > 0) {
      this.world = createWorld(cryptoRandom);
      this.words = [];
    }
  }
  protected frame(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (!this.running()) return this.words.length > 0;
    this.left += Math.min(0.05, real);
    while (this.left >= DT && this.state?.winner === null) {
      this.left -= DT;
      this.report(step(this.world), now);
    }
    return true;
  }
  /** A piece as it lies: its upper side is the one seen. */
  private meat(pen: CanvasRenderingContext2D, piece: Piece, s: number) {
    const top = piece.done[1 - down(piece)],
      lean = css(cooked([226, 96, 104], [150, 86, 48], top)),
      fat = css(cooked([250, 232, 226], [226, 180, 110], top)),
      edge = css(cooked([170, 60, 70], [96, 52, 28], top));
    pen.lineWidth = s * 0.035;
    pen.strokeStyle = edge;
    if (piece.cut === 0) {
      // Pork belly: a strip in bands of fat and lean.
      rounded(pen, -s * 0.5, -s * 0.24, s, s * 0.48, s * 0.1);
      pen.fillStyle = lean;
      pen.fill();
      pen.save();
      pen.clip();
      pen.fillStyle = fat;
      for (const y of [-0.2, -0.02, 0.15]) pen.fillRect(-s * 0.5, y * s, s, s * 0.075);
      pen.restore();
      pen.stroke();
    } else if (piece.cut === 1) {
      // Brisket: a thin curled slice, marbled.
      pen.beginPath();
      pen.ellipse(0, 0, s * 0.44, s * 0.3, 0.3, 0, Math.PI * 2);
      pen.fillStyle = lean;
      pen.fill();
      pen.stroke();
      pen.strokeStyle = fat;
      pen.lineWidth = s * 0.06;
      pen.beginPath();
      pen.ellipse(0, 0, s * 0.3, s * 0.17, 0.3, 0.4, Math.PI * 1.7);
      pen.stroke();
      pen.beginPath();
      pen.arc(s * 0.02, s * 0.01, s * 0.07, 0, Math.PI * 2);
      pen.stroke();
    } else if (piece.cut === 2) {
      // A rib: a thick piece of meat on its bone.
      rounded(pen, -s * 0.5, -s * 0.11, s * 0.36, s * 0.22, s * 0.1);
      pen.fillStyle = css(cooked([246, 240, 226], [222, 204, 170], top));
      pen.fill();
      pen.stroke();
      rounded(pen, -s * 0.24, -s * 0.3, s * 0.74, s * 0.6, s * 0.16);
      pen.fillStyle = css(cooked([196, 70, 62], [122, 66, 36], top));
      pen.fill();
      pen.stroke();
      // Scored across, as ribs are.
      pen.strokeStyle = css(cooked([150, 44, 44], [84, 44, 24], top));
      pen.lineWidth = s * 0.03;
      for (const x of [-0.08, 0.1, 0.28]) {
        pen.beginPath();
        pen.moveTo(x * s - s * 0.06, -s * 0.2);
        pen.lineTo(x * s + s * 0.06, s * 0.2);
        pen.stroke();
      }
    } else {
      // A mushroom cap, scored with a cross.
      pen.beginPath();
      pen.arc(0, 0, s * 0.34, 0, Math.PI * 2);
      pen.fillStyle = css(cooked([236, 222, 196], [176, 126, 76], top));
      pen.fill();
      pen.strokeStyle = css(cooked([170, 146, 110], [110, 72, 40], top));
      pen.stroke();
      pen.lineWidth = s * 0.05;
      for (const a of [0.5, 2.07]) {
        pen.beginPath();
        pen.moveTo(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2);
        pen.lineTo(-Math.cos(a) * s * 0.2, -Math.sin(a) * s * 0.2);
        pen.stroke();
      }
    }
    // The marks of the grate on a side that has been down.
    if (top > 0.3) {
      pen.strokeStyle = `rgba(52,30,18,${Math.min(0.55, top * 0.4)})`;
      pen.lineWidth = s * 0.035;
      for (const x of [-0.2, 0, 0.2]) {
        pen.beginPath();
        pen.moveTo(x * s - s * 0.08, -s * 0.16);
        pen.lineTo(x * s + s * 0.08, s * 0.16);
        pen.stroke();
      }
    }
  }
  protected paint(pen: CanvasRenderingContext2D, w: number, h: number, now: number) {
    const top = 56 * this.ratio,
      foot = 30 * this.ratio,
      r = Math.min((h - top - foot) / 2, w * 0.36) * 0.98,
      cx = w / 2,
      cy = top + (h - top - foot) / 2;
    this.fit = { x: cx, y: cy, r };
    // A wooden table.
    pen.fillStyle = "#c79a66";
    pen.fillRect(0, 0, w, h);
    pen.strokeStyle = "rgba(120,80,40,0.18)";
    pen.lineWidth = 2 * this.ratio;
    for (let y = (cy % (r * 0.5)) - r * 0.5; y < h; y += r * 0.5) {
      pen.beginPath();
      pen.moveTo(0, y);
      pen.lineTo(w, y);
      pen.stroke();
    }
    // The grill: a rim, the coals glowing most in the middle, and the grate over them.
    pen.fillStyle = "rgba(0,0,0,0.22)";
    pen.beginPath();
    pen.arc(cx + r * 0.03, cy + r * 0.05, r * 1.04, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#3a3d42";
    pen.beginPath();
    pen.arc(cx, cy, r, 0, Math.PI * 2);
    pen.fill();
    const coals = pen.createRadialGradient(cx, cy, r * 0.05, cx, cy, r * 0.9),
      flicker = 0.06 * Math.sin(now / 260) + 0.04 * Math.sin(now / 97);
    coals.addColorStop(0, css([255, 170, 60], 0.95 + flicker));
    coals.addColorStop(0.45, css([226, 84, 30], 0.85 + flicker));
    coals.addColorStop(1, "#2a1c18");
    pen.fillStyle = coals;
    pen.beginPath();
    pen.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
    pen.fill();
    pen.save();
    pen.clip();
    pen.strokeStyle = "#1c1e22";
    pen.lineWidth = r * 0.022;
    for (let x = -0.9; x <= 0.9; x += 0.12) {
      pen.beginPath();
      pen.moveTo(cx + x * r, cy - r);
      pen.lineTo(cx + x * r, cy + r);
      pen.stroke();
    }
    pen.restore();
    pen.strokeStyle = "#6a6f78";
    pen.lineWidth = r * 0.05;
    pen.beginPath();
    pen.arc(cx, cy, r * 0.93, 0, Math.PI * 2);
    pen.stroke();
    const size = r * 0.5;
    this.world.slots.forEach((piece, slot) => {
      const x = cx + PLACES[slot][0] * r,
        y = cy + PLACES[slot][1] * r;
      if (slot === this.cursor) {
        pen.strokeStyle = "#6fb0ff";
        pen.lineWidth = 3.5 * this.ratio;
        pen.beginPath();
        pen.arc(x, y, r * 0.29, 0, Math.PI * 2);
        pen.stroke();
      }
      if (!piece) return;
      const under = piece.done[down(piece)];
      // How done the side lying down is: a ring that fills, green when done, gold when just right, red when it is about to burn.
      pen.lineCap = "round";
      pen.lineWidth = r * 0.045;
      pen.strokeStyle = "rgba(0,0,0,0.35)";
      pen.beginPath();
      pen.arc(x, y, r * 0.27, 0, Math.PI * 2);
      pen.stroke();
      pen.strokeStyle = under < RAW ? "#e8e2d6" : under < GOOD ? "#5fc46a" : under <= OVER ? "#ffc93a" : under < CHARRED ? "#ff8a2a" : "#ff3b2e";
      pen.beginPath();
      pen.arc(x, y, r * 0.27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, under / BURNT));
      pen.stroke();
      // Smoke, thicker the nearer it is to burning.
      if (under > GOOD) {
        const thick = Math.min(1, (under - GOOD) / (BURNT - GOOD));
        for (let k = 0; k < 3; k++) {
          const p = (now / 900 + k / 3 + slot * 0.37) % 1;
          pen.fillStyle = `rgba(${under > OVER ? "70,70,74" : "236,236,236"},${(1 - p) * (0.2 + thick * 0.4)})`;
          pen.beginPath();
          pen.arc(x + Math.sin(p * 5 + k * 2) * r * 0.06, y - r * 0.1 - p * r * 0.42, r * (0.05 + p * 0.09), 0, Math.PI * 2);
          pen.fill();
        }
      }
      pen.save();
      pen.translate(x, y);
      pen.rotate((slot * 1.9) % 0.9 - 0.45);
      // A piece just laid or just turned settles into place.
      const settle = Math.min(1, piece.age / 0.18);
      pen.scale(0.7 + settle * 0.3, 0.7 + settle * 0.3);
      this.meat(pen, piece, size);
      pen.restore();
      if (!piece.turned) {
        // Not yet turned: a small mark says so.
        pen.fillStyle = "rgba(255,255,255,0.92)";
        pen.font = `800 ${r * 0.11}px system-ui, sans-serif`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText("↻", x + r * 0.2, y - r * 0.2);
      }
    });
    // What the pieces just taken off were, rising and fading.
    this.words = this.words.filter((word) => now - word.at < 900);
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.font = `900 ${r * 0.11}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
    for (const word of this.words) {
      const p = (now - word.at) / 900,
        x = cx + PLACES[word.slot][0] * r,
        y = cy + PLACES[word.slot][1] * r - r * 0.1 - p * r * 0.3;
      pen.globalAlpha = 1 - p * p;
      pen.lineWidth = r * 0.022;
      pen.strokeStyle = "#ffffff";
      pen.strokeText(word.text, x, y);
      pen.fillStyle = word.color;
      pen.fillText(word.text, x, y);
      pen.globalAlpha = 1;
    }
    // The burnt pieces so far, as crosses in the corner beside the grill.
    const burnt = this.state?.burnt ?? 0;
    for (let i = 0; i < LIVES; i++) {
      const x = cx + [-0.93, -0.82, -0.67][i] * r,
        y = cy + [0.6, 0.78, 0.92][i] * r;
      pen.fillStyle = i < burnt ? "#2a1c18" : "rgba(255,255,255,0.4)";
      pen.beginPath();
      pen.arc(x, y, r * 0.085, 0, Math.PI * 2);
      pen.fill();
      if (i < burnt) {
        pen.strokeStyle = "#ff5a3c";
        pen.lineWidth = r * 0.035;
        pen.beginPath();
        pen.moveTo(x - r * 0.035, y - r * 0.035);
        pen.lineTo(x + r * 0.035, y + r * 0.035);
        pen.moveTo(x + r * 0.035, y - r * 0.035);
        pen.lineTo(x - r * 0.035, y + r * 0.035);
        pen.stroke();
      }
    }
  }
  dispose() {
    for (const [name, fn] of this.keys) this.canvas.removeEventListener(name, fn);
    super.dispose();
  }
}
