import * as T from "three";
import { block, capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BACK, ENTER, type Guess, type State } from "./rules";
import { ballpark } from "./ballpark";

const W = 1280,
  H = 800,
  /** Canvas pixels per unit of the scene, and the height of the board's middle. */
  PX = 100,
  MID = 4.7,
  KEY_Y = 716,
  /** Where the lit display ends and the console of keys begins, in canvas rows. */
  CONSOLE = 652,
  /** Rows of throws shown in each column. */
  ROWS = 8;
export const CHALK_COLORS: [string, string] = ["#f4f1e6", "#f2c94c"];
const keyX = (key: number) => 62 + key * 105;
/** Where a key of the board lies in the scene. */
export const keyAt = (key: number) => ({ x: (keyX(key) - W / 2) / PX, y: MID + (H / 2 - KEY_Y) / PX });
const AMBER = "#ffb53a",
  STRIKE = "#ffd23c",
  BALL = "#4ee07a",
  OUT = "#ff5a48",
  FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
  DIGITS = '"DIN Alternate", "Arial Narrow", "Roboto Condensed", "Apple SD Gothic Neo", sans-serif';
/** A throw being lit on the board: which side's, which row, how far along (0–1). */
interface Reveal {
  side: 0 | 1;
  row: number;
  p: number;
}
/** How long the lighting of a throw takes, and when each of its digits and lamps comes on (as parts of it). */
function timing(guess: Guess) {
  const digits = guess.digits.length,
    lit = Math.max(1, guess.strikes + guess.balls),
    total = digits * 120 + lit * 150 + 260,
    digitAt = (k: number) => (k * 120) / total,
    lampAt = (k: number) => (digits * 120 + 60 + k * 150) / total;
  return { total, digitAt, lampAt };
}
/** The board's dark face: a grid of unlit lamps, and the console of keys under it in brushed steel. */
function backdrop() {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#0a0e0d";
  ctx.fillRect(0, 0, W, CONSOLE);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let y = 4; y < CONSOLE; y += 8) for (let x = 4; x < W; x += 8) ctx.fillRect(x, y, 2, 2);
  // Panel seams.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (const x of [320, 640, 960]) ctx.fillRect(x, 0, 1, CONSOLE);
  ctx.fillRect(0, 326, W, 1);
  // The console.
  const steel = ctx.createLinearGradient(0, CONSOLE, 0, H);
  steel.addColorStop(0, "#3a4144");
  steel.addColorStop(0.08, "#272d30");
  steel.addColorStop(1, "#1a1e20");
  ctx.fillStyle = steel;
  ctx.fillRect(0, CONSOLE, W, H - CONSOLE);
  for (let y = CONSOLE + 6; y < H; y += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.015 + ((y * 7) % 5) * 0.004})`;
    ctx.fillRect(0, y, W, 1);
  }
  ctx.fillStyle = "#6b7479";
  ctx.fillRect(0, CONSOLE, W, 3);
  // The wells the keys stand in.
  for (let key = 0; key < 12; key++) {
    ctx.fillStyle = "#0d1011";
    ctx.beginPath();
    ctx.roundRect(keyX(key) - 49, KEY_Y - 46, 98, 92, 16);
    ctx.fill();
  }
  return c;
}
/** Each key's face, side by side on one picture: a rounded cap with its digit or word. */
function keyFaces() {
  const c = document.createElement("canvas");
  c.width = 128 * 12;
  c.height = 128;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  for (let key = 0; key < 12; key++) {
    const x = key * 128,
      g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, key === ENTER ? "#4a3a12" : "#3a4246");
    g.addColorStop(1, key === ENTER ? "#2a200a" : "#1e2427");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 128, 128);
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x + 8, 8, 112, 112, 18);
    ctx.stroke();
    ctx.fillStyle = key === ENTER ? "#ffc94d" : "#f6f3ea";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = key <= 9 ? `700 78px ${DIGITS}` : `700 40px ${FONT}`;
    ctx.fillText(key <= 9 ? String(key) : key === BACK ? "지움" : "확인", x + 64, 68);
  }
  return c;
}
/** A soft frame of light round the key the keyboard is on. */
function frame() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(14, 14, 100, 100, 18);
  ctx.stroke();
  return c;
}
/**
 * A ballpark at dusk: the game is lit up on the scoreboard in the outfield. Each throw comes on as a row of number
 * tiles with its strike and ball lamps; the keys are push buttons on the board's console.
 */
export class HitBlowView extends TableView<State> {
  private canvas = document.createElement("canvas");
  private texture: T.CanvasTexture;
  private back = backdrop();
  private keys: T.Group[] = [];
  private faces: T.Mesh[] = [];
  private faceMaterials: { off: T.Material; open: T.Material; hot: T.Material };
  private cursor: T.Mesh;
  private bulbs: T.InstancedMesh;
  private hovered = -1;
  private reveal: Reveal | null = null;
  /** The entry box that has just been filled, and how far its digit has popped in. */
  private pop: { index: number; p: number } | null = null;
  /** How far my own number has been lit, once it is fixed. */
  private fixing = 1;
  private rich = capable();
  private ticking = 0;
  /** When the last home run was hit: the bulbs flash for a while. */
  private homeRun = -1e9;
  /** `rival`: who throws against me (컴퓨터, or 상대 over Wi-Fi). */
  constructor(host: HTMLElement, quality: "high" | "low", private readonly rival = "컴퓨터") {
    super(host, quality, "#0b1330");
    this.daylight("#a9b9e8", "#26331f", "#fff3dc", 12, 1.9);
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = this.own(new T.CanvasTexture(this.canvas));
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    ballpark(this.scene, own, -1.2);
    // The scoreboard: a housing of painted steel on two legs, its lit face, and a row of bulbs round it.
    const paint = this.standard({ color: "#1d3a2c", roughness: 0.55, metalness: this.rich ? 0.3 : 0 });
    this.add(block(W / PX + 0.9, H / PX + 0.9, 0.6, 0.1), paint, 0, MID, -0.34);
    for (const x of [-4.5, 4.5]) this.add(new T.BoxGeometry(0.5, 1.2, 0.4), paint, x, 0.3, -0.5);
    const face = this.add(new T.PlaneGeometry(W / PX, H / PX), this.own(new T.MeshBasicMaterial({ map: this.texture })), 0, MID, -0.03);
    face.castShadow = false;
    face.receiveShadow = false;
    const ring: [number, number][] = [],
      halfW = W / PX / 2 + 0.23,
      halfH = H / PX / 2 + 0.23;
    for (let x = -halfW; x <= halfW + 1e-6; x += (2 * halfW) / 32) ring.push([x, halfH], [x, -halfH]);
    for (let y = -halfH + (2 * halfH) / 20; y < halfH - 1e-6; y += (2 * halfH) / 20) ring.push([-halfW, y], [halfW, y]);
    this.bulbs = new T.InstancedMesh(this.own(new T.SphereGeometry(0.075, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2)), this.own(new T.MeshBasicMaterial({ color: "#ffffff" })), ring.length);
    const m = new T.Matrix4();
    ring.forEach(([x, y], i) => this.bulbs.setMatrixAt(i, m.makeTranslation(x, MID + y, 0.02)));
    this.scene.add(this.bulbs);
    this.chase(0);
    // The keys: push buttons in their wells on the console.
    const atlas = this.own(new T.CanvasTexture(keyFaces()));
    atlas.colorSpace = T.SRGBColorSpace;
    atlas.anisotropy = 4;
    const lit = (intensity: number, color: string) =>
      this.own(new T.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: "#ffffff", emissiveIntensity: intensity, color, roughness: 0.45 }));
    this.faceMaterials = { off: lit(0.05, "#5a5a5a"), open: lit(0.75, "#ffffff"), hot: lit(1.25, "#ffffff") };
    const body = this.own(block(0.9, 0.84, 0.18, 0.06)),
      rubber = this.standard({ color: "#15191b", roughness: 0.7 });
    for (let key = 0; key < 12; key++) {
      const group = new T.Group(),
        at = keyAt(key),
        cap = new T.Mesh(body, rubber),
        shape = new T.PlaneGeometry(0.8, 0.74),
        uv = shape.getAttribute("uv");
      for (let i = 0; i < uv.count; i++) uv.setX(i, (key + 0.06 + uv.getX(i) * 0.88) / 12);
      const top = new T.Mesh(this.own(shape), this.faceMaterials.off);
      top.position.z = 0.091;
      cap.castShadow = true;
      group.add(cap, top);
      group.position.set(at.x, at.y, 0.09);
      this.keys.push(group);
      this.faces.push(top);
      this.scene.add(group);
    }
    const glowMap = this.own(new T.CanvasTexture(frame()));
    this.cursor = new T.Mesh(this.own(new T.PlaneGeometry(1.08, 1.08)), this.own(new T.MeshBasicMaterial({ map: glowMap, transparent: true, depthWrite: false })));
    this.cursor.visible = false;
    this.cursor.renderOrder = 5;
    this.scene.add(this.cursor);
    this.begin();
    if (this.rich && !this.reducedMotion) this.ticking = requestAnimationFrame(this.tick);
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 6.6 : 8.2, halfZ: 0.6, height: 9.4, lookY: 4.6, tilt: 0.16 };
  }
  protected spots(): Spot[] {
    return Array.from({ length: 12 }, (_, key) => ({ ...keyAt(key), z: 0, r: 0.5, point: key }));
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    // The chase moves on six times a second; nothing else needs drawing meanwhile.
    const step = Math.floor(now / (1000 / 8));
    if (step === this.lastStep) return;
    this.lastStep = step;
    this.chase(now / 1000);
    this.redraw();
  };
  private lastStep = -1;
  /** Writes the whole board again. */
  private draw() {
    const ctx = this.canvas.getContext("2d")!,
      state = this.state;
    ctx.drawImage(this.back, 0, 0);
    if (!state) {
      this.texture.needsUpdate = true;
      return;
    }
    ctx.textBaseline = "middle";
    const text = (words: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 700, font = FONT) => {
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(words, x, y);
    };
    /** A number tile: a dark cell with its digit lit, squeezed while it flips (`flip` 0 shut, 1 open). */
    const tile = (digit: number | null, x: number, y: number, w: number, h: number, color: string, flip = 1) => {
      ctx.fillStyle = "#151b19";
      ctx.strokeStyle = "#2c3532";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
      ctx.fill();
      ctx.stroke();
      if (digit === null || flip <= 0) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, Math.max(0.05, flip));
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      text(String(digit), 0, 2, h * 0.82, color, "center", 700, DIGITS);
      ctx.restore();
      // The split of a flap tile.
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x - w / 2 + 2, y - 1, w - 4, 2);
    };
    const lamp = (x: number, y: number, r: number, color: string, on: boolean) => {
      ctx.save();
      if (on) {
        ctx.shadowColor = color;
        ctx.shadowBlur = r * 1.8;
      }
      ctx.fillStyle = on ? color : "#26291f";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (on) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const size = state.size,
      reveal = this.reveal;
    /** How much of a throw is lit: all of it, or as far as its lighting has gone. */
    const shown = (side: 0 | 1, row: number, guess: Guess) => {
      if (!reveal || reveal.side !== side || reveal.row !== row) return { digit: () => 1, lamps: Infinity, verdict: true };
      const t = timing(guess);
      return {
        digit: (k: number) => Math.min(1, Math.max(0, (reveal.p - t.digitAt(k)) / (100 / t.total))),
        lamps: Array.from({ length: Math.max(1, guess.strikes + guess.balls) }, (_, k) => t.lampAt(k)).filter((at) => reveal.p >= at).length,
        verdict: reveal.p >= t.lampAt(0),
      };
    };
    const column = (side: 0 | 1, title: string, x: number, color: string) => {
      const guesses = state.guesses[side],
        sx = x + 270,
        bx = x + 370;
      text(title, x, 44, 34, color);
      text("회", x + 18, 84, 20, "rgba(244,241,230,0.5)", "center", 600);
      text("던진 숫자", x + 62 + ((size - 1) * 50) / 2, 84, 20, "rgba(244,241,230,0.5)", "center", 600);
      text("S", sx + ((size - 1) * 22) / 2, 84, 22, STRIKE, "center");
      text("B", bx + ((size - 1) * 22) / 2, 84, 22, BALL, "center");
      ctx.fillStyle = color;
      ctx.fillRect(x, 102, 520, 3);
      const from = Math.max(0, guesses.length - ROWS);
      guesses.slice(from).forEach((guess, i) => {
        const y = 134 + i * 52,
          row = from + i,
          won = guess.strikes === size,
          seen = shown(side, row, guess);
        text(String(row + 1), x + 18, y, 26, "rgba(244,241,230,0.65)", "center", 700, DIGITS);
        guess.digits.forEach((digit, k) => tile(digit, x + 62 + k * 50, y, 44, 44, won && seen.verdict ? STRIKE : AMBER, seen.digit(k)));
        // Strikes come on first, then balls.
        for (let j = 0; j < size; j++) lamp(sx + j * 22, y, 8, STRIKE, j < Math.min(guess.strikes, seen.lamps));
        for (let j = 0; j < size; j++) lamp(bx + j * 22, y, 8, BALL, j < Math.min(guess.balls, seen.lamps - guess.strikes));
        if (seen.verdict && seen.lamps >= 1) {
          if (won) text("정답!", x + 520, y, 28, STRIKE, "right");
          else if (!guess.strikes && !guess.balls) {
            ctx.save();
            ctx.shadowColor = OUT;
            ctx.shadowBlur = 10;
            text("아웃", x + 520, y, 28, OUT, "right");
            ctx.restore();
          }
        }
      });
      if (!guesses.length) text("아직 없음", x, 134, 26, "rgba(244,241,230,0.35)");
    };
    column(0, "내가 던진 숫자", 70, CHALK_COLORS[0]);
    column(1, `${this.rival}가 던진 숫자`, 690, CHALK_COLORS[1]);
    ctx.fillStyle = "rgba(244,241,230,0.35)";
    ctx.fillRect(40, 552, W - 80, 2);
    // What is being keyed in, the count of the last throw, and my own number: a caption above each.
    const caption = (words: string, x: number, align: CanvasTextAlign = "left") => text(words, x, 574, 22, "rgba(244,241,230,0.6)", align, 600);
    caption(state.phase === "secret" ? "내 숫자 정하기" : "던질 숫자", 70);
    if (state.repeat) text("중복 허용", 70, 612, 20, "rgba(244,241,230,0.45)", "left", 600);
    for (let i = 0; i < size; i++) {
      const x = (state.repeat ? 210 : 100) + i * 62,
        pop = this.pop && this.pop.index === i ? this.pop.p : 1,
        digit = state.entry[i] ?? null;
      ctx.save();
      if (digit !== null && pop < 1) {
        // The digit pops in: a little too big, then settling.
        const k = 1 + Math.sin(pop * Math.PI) * 0.25;
        ctx.translate(x, 612);
        ctx.scale(k, k);
        ctx.translate(-x, -612);
      }
      tile(digit, x, 612, 54, 56, "#ffd24a");
      ctx.restore();
      if (i === state.entry.length && state.winner === null) {
        ctx.fillStyle = "rgba(255,210,74,0.6)";
        ctx.fillRect(x - 18, 634, 36, 3);
      }
    }
    // The count of the last throw, large, as a scoreboard shows the count of the batter at the plate.
    const mine = state.guesses[0],
      theirs = state.guesses[1],
      // The last throw is the one of the side not to throw now (over Wi-Fi 후공 sees the other throw first).
      latest: [0 | 1, Guess] | null = state.turn === 1 ? (mine.length ? [0, mine[mine.length - 1]] : null) : theirs.length ? [1, theirs[theirs.length - 1]] : null;
    if (state.winner !== null) {
      text("경기 종료", 640, 574, 26, "#f4f1e6", "center");
      text(`상대 숫자 ${state.secrets[1].join(" ")}`, 640, 612, 26, AMBER, "center", 700);
    } else {
      const seen = latest ? shown(latest[0], state.guesses[latest[0]].length - 1, latest[1]) : null,
        count = latest && seen?.verdict ? latest[1] : null,
        lit = seen?.lamps ?? 0,
        left = 470;
      caption(latest ? (latest[0] ? `방금 던진 공 · ${this.rival}` : "방금 던진 공 · 나") : "방금 던진 공", left);
      text("S", left + 10, 612, 28, STRIKE, "center");
      for (let j = 0; j < size; j++) lamp(left + 40 + j * 28, 612, 11, STRIKE, !!count && j < Math.min(count.strikes, lit));
      const b = left + 40 + size * 28 + 18;
      text("B", b, 612, 28, BALL, "center");
      for (let j = 0; j < size; j++) lamp(b + 30 + j * 28, 612, 11, BALL, !!count && j < Math.min(count.balls, lit - count.strikes));
      const o = b + 30 + size * 28 + 18;
      text("O", o, 612, 28, OUT, "center");
      lamp(o + 30, 612, 11, OUT, !!count && !count.strikes && !count.balls && lit >= 1);
    }
    // My own number once it is fixed, lit from left to right as it is.
    if (state.secrets[0]) {
      caption("내 숫자", W - 70, "right");
      state.secrets[0].forEach((digit, i) => tile(digit, W - 70 - (size - 1 - i) * 52 - 24, 612, 46, 52, "#9fe7b4", Math.min(1, Math.max(0, this.fixing * (size + 1) - i))));
    }
    // What the board shows of the numbers, for the browser tests: the keys pressed, my number, the other's once told.
    const el = this.renderer.domElement;
    el.dataset.entry = state.entry.join("");
    el.dataset.mine = state.secrets[0]?.join("") ?? "";
    el.dataset.theirs = state.winner !== null ? state.secrets[1].join("") : "";
    this.texture.needsUpdate = true;
  }
  /** Lights the keys: those that can be pressed are lit, the one under the keyboard or the mouse brighter. */
  private lightKeys() {
    const marks = this.marks,
      cursor = capturing() ? null : marks.cursor;
    this.faces.forEach((face, key) => {
      const open = marks.targets.includes(key),
        hot = open && (key === cursor || key === this.hovered);
      face.material = hot ? this.faceMaterials.hot : open ? this.faceMaterials.open : this.faceMaterials.off;
    });
    this.cursor.visible = cursor !== null && cursor < 12;
    if (cursor !== null && cursor < 12) {
      const at = keyAt(cursor);
      this.cursor.position.set(at.x, at.y, 0.2 + this.keys[cursor].position.z - 0.09);
    }
  }
  protected place() {
    this.reveal = null;
    this.pop = null;
    this.fixing = 1;
    this.keys.forEach((key) => (key.position.z = 0.09));
    this.draw();
  }
  /** A key going down and coming back up. */
  private press(key: number) {
    const group = this.keys[key];
    this.tween(0, 140, (p) => {
      group.position.z = 0.09 - Math.sin(p * Math.PI) * 0.08;
    });
  }
  protected animate(before: State, state: State) {
    if (state.ply < before.ply) return false;
    let busy = false;
    if (before.turn === 0 && state.winner === before.winner) {
      // A key of mine: a digit, a rub-out, or the throw itself.
      if (state.entry.length > before.entry.length && state.phase === before.phase) {
        this.press(state.entry[state.entry.length - 1]);
        const index = state.entry.length - 1;
        this.tween(0, 160, (p) => {
          this.pop = { index, p };
          this.draw();
        });
        this.onContact();
        busy = true;
      } else if (state.entry.length < before.entry.length && state.phase === before.phase && state.ply === before.ply) {
        this.press(BACK);
        this.onContact();
        busy = true;
      }
    }
    if (state.phase === "play" && before.phase === "secret") {
      this.press(ENTER);
      this.onContact();
      this.fixing = 0;
      this.tween(0, 420, (p) => {
        this.fixing = p;
        this.draw();
      });
      busy = true;
    }
    for (const side of [0, 1] as const)
      if (state.guesses[side].length > before.guesses[side].length) {
        if (side === 0) {
          this.press(ENTER);
          this.onContact();
        }
        this.throwIn(side, state);
        busy = true;
      }
    if (!busy) return false;
    this.draw();
    return true;
  }
  /** A throw comes on: its digits flip in one after another, then its lamps light, with a sound for each. */
  private throwIn(side: 0 | 1, state: State) {
    const row = state.guesses[side].length - 1,
      guess = state.guesses[side][row],
      t = timing(guess),
      heard = { digits: 0, lamps: 0 },
      lit = guess.strikes + guess.balls,
      delay = side === 0 ? 120 : 0;
    this.reveal = { side, row, p: 0 };
    this.tween(delay, t.total, (p) => {
      if (!this.reveal) return;
      this.reveal.p = p;
      while (heard.digits < guess.digits.length && p >= t.digitAt(heard.digits)) {
        heard.digits++;
        this.onKnock?.("disc", 0.5);
      }
      while (heard.lamps < Math.max(1, lit) && p >= t.lampAt(heard.lamps)) {
        const k = heard.lamps++;
        if (!lit) this.onKnock?.("pocket", 0);
        else this.onKnock?.("cushion", k < guess.strikes ? 1 : 0.5);
      }
      if (p === 1) {
        if (guess.strikes === state.size) {
          this.onKnock?.("pocket", 1);
          this.homeRun = performance.now() / 1000;
        }
        this.reveal = null;
      }
      this.draw();
    });
  }
  /** The bulbs round the board: a chase that runs at `t` seconds, flashing all together after a home run. */
  private chase(t: number) {
    const on = new T.Color("#fff1c4"),
      off = new T.Color("#6a5a3a"),
      flash = t - this.homeRun < 2.6,
      c = new T.Color();
    for (let i = 0; i < this.bulbs.count; i++) {
      const lit = flash ? Math.floor(t * 8) % 2 === 0 : (i + Math.floor(t * 6)) % 4 !== 0;
      this.bulbs.setColorAt(i, c.copy(lit ? on : off));
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  protected hover(point: number) {
    this.hovered = point;
    this.lightKeys();
  }
  /** The marks are all on the keys: the lit board is written again only when the state changes. */
  protected mark() {
    this.lightKeys();
  }
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
