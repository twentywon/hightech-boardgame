import * as T from "three";
import { BONUS, CATEGORIES, UPPER, totals, type Card } from "./rules";

/**
 * A score pad lying on the table beside the tray: a printed sheet with a column a category and a row a player, filled
 * in by hand as the game goes. A score is written stroke by stroke with a pencil that follows its point; the bonus is
 * written when the upper half earns it (or is full without it) and the total when a player's sheet is complete. It is
 * a picture of the score only: the sheet beside the table stays what is read and pressed.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The sheet's size on the table. */
export const PAD = { width: 4.5, depth: 2.0 };
const W = 1024,
  H = Math.round((W * PAD.depth) / PAD.width),
  LABEL = 112,
  COLUMNS = CATEGORIES.length + 2,
  CELL = (W - LABEL - 14) / COLUMNS,
  TOP = 30,
  HEAD = TOP + 92,
  INK = "#1a2552",
  PRINT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif',
  SHORT: Record<string, string> = {
    choice: "초이스",
    fourKind: "포카드",
    fullHouse: "풀하우스",
    smallStraight: "스몰",
    largeStraight: "라지",
    yacht: "요트",
  };
type Point = [number, number];
/** Digits as a hand writes them, in a box one unit high (x right, y down); some have two strokes. */
const HAND: Record<string, Point[][]> = {
  "0": [Array.from({ length: 15 }, (_, i) => {
    const a = -Math.PI / 2 - (i / 14) * Math.PI * 2.08;
    return [0.5 + Math.cos(a) * 0.34, 0.5 + Math.sin(a) * 0.48] as Point;
  })],
  "1": [[[0.3, 0.22], [0.55, 0.03], [0.55, 1]]],
  "2": [[[0.14, 0.26], [0.32, 0.04], [0.66, 0.03], [0.8, 0.26], [0.66, 0.52], [0.14, 1], [0.9, 0.97]]],
  "3": [[[0.14, 0.12], [0.5, 0.01], [0.8, 0.2], [0.48, 0.47], [0.86, 0.7], [0.6, 0.98], [0.12, 0.88]]],
  "4": [[[0.66, 1], [0.66, 0.02], [0.08, 0.7], [0.92, 0.7]]],
  "5": [[[0.84, 0.04], [0.26, 0.04], [0.2, 0.46], [0.56, 0.38], [0.84, 0.62], [0.7, 0.94], [0.16, 0.92]]],
  "6": [[[0.76, 0.04], [0.36, 0.3], [0.18, 0.7], [0.36, 0.98], [0.72, 0.92], [0.82, 0.68], [0.52, 0.52], [0.2, 0.7]]],
  "7": [[[0.1, 0.05], [0.9, 0.05], [0.4, 1]]],
  "8": [[[0.5, 0.48], [0.2, 0.28], [0.32, 0.03], [0.7, 0.04], [0.8, 0.28], [0.5, 0.48], [0.16, 0.72], [0.3, 0.98], [0.72, 0.97], [0.86, 0.72], [0.5, 0.48]]],
  "9": [[[0.82, 0.34], [0.5, 0.5], [0.2, 0.3], [0.38, 0.04], [0.74, 0.08], [0.82, 0.34], [0.72, 1]]],
  "+": [[[0.1, 0.52], [0.9, 0.5]], [[0.5, 0.14], [0.52, 0.88]]],
};
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
interface Entry {
  player: number;
  column: number;
  /** The strokes in canvas pixels, ready to draw. */
  strokes: Point[][];
  length: number;
  /** How much of it is written (0 to 1). */
  done: number;
  start: number;
  /** Whether the pencil has begun it. */
  begun?: boolean;
}
/** How long writing one number takes, and the pause before the next one is begun. */
const WRITE_MS = 520,
  NEXT_MS = 120;

export class ScorePad {
  readonly group = new T.Group();
  private print = document.createElement("canvas");
  private sheet = document.createElement("canvas");
  private ctx = this.sheet.getContext("2d")!;
  private map: T.CanvasTexture;
  private names: string[] = [];
  private entries: Entry[] = [];
  /** What each cell shows, so that only a change is written. */
  private written = new Map<string, string>();
  private queue: Entry[] = [];
  private pencil = new T.Group();
  private rest = new T.Vector3(PAD.width / 2 + 0.32, 0.05, 0.1);
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A number has begun to be written. */
  onWrite: () => void = () => {};
  constructor(own: Own) {
    this.print.width = this.sheet.width = W;
    this.print.height = this.sheet.height = H;
    this.map = own(new T.CanvasTexture(this.sheet));
    this.map.colorSpace = T.SRGBColorSpace;
    this.map.anisotropy = 8;
    // A pad: a stack of sheets on a card back, the top sheet printed.
    const stack = new T.Mesh(
      own(new T.BoxGeometry(PAD.width, 0.06, PAD.depth)),
      [own(new T.MeshStandardMaterial({ color: "#efe8d6", roughness: 0.9 }))].flatMap((m) => [m, m, m, m, m, m]),
    );
    stack.position.y = 0.03;
    stack.castShadow = stack.receiveShadow = true;
    const top = new T.Mesh(own(new T.PlaneGeometry(PAD.width, PAD.depth)), own(new T.MeshStandardMaterial({ map: this.map, roughness: 0.96 })));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.0605;
    top.receiveShadow = true;
    // The glued edge along the far side.
    const glue = new T.Mesh(own(new T.BoxGeometry(PAD.width + 0.02, 0.072, 0.07)), own(new T.MeshStandardMaterial({ color: "#7a2a22", roughness: 0.7 })));
    glue.position.set(0, 0.035, -PAD.depth / 2 + 0.03);
    this.group.add(stack, top, glue);
    // A pencil: a yellow hexagonal body, a bared wooden cone and its lead, a brass band and an eraser.
    const body = new T.Mesh(own(new T.CylinderGeometry(0.045, 0.045, 0.9, 6)), own(new T.MeshStandardMaterial({ color: "#e8b627", roughness: 0.45 }))),
      cone = new T.Mesh(own(new T.CylinderGeometry(0.045, 0.008, 0.16, 6)), own(new T.MeshStandardMaterial({ color: "#e2c08e", roughness: 0.8 }))),
      lead = new T.Mesh(own(new T.ConeGeometry(0.01, 0.03, 6)), own(new T.MeshStandardMaterial({ color: "#2a2a2c", roughness: 0.5 }))),
      band = new T.Mesh(own(new T.CylinderGeometry(0.048, 0.048, 0.07, 10)), own(new T.MeshStandardMaterial({ color: "#c9a456", metalness: 0.7, roughness: 0.35 }))),
      eraser = new T.Mesh(own(new T.CylinderGeometry(0.046, 0.046, 0.08, 10)), own(new T.MeshStandardMaterial({ color: "#e28a8a", roughness: 0.8 })));
    // Its tip is the group's origin; it lies along +y before it is turned.
    lead.rotation.x = Math.PI;
    lead.position.y = 0.015;
    cone.position.y = 0.11;
    body.position.y = 0.64;
    band.position.y = 1.12;
    eraser.position.y = 1.19;
    for (const part of [body, cone, lead, band, eraser]) {
      part.castShadow = true;
      this.pencil.add(part);
    }
    this.group.add(this.pencil);
    this.lay();
  }
  /** Lays the pencil down beside the pad, pointing away. */
  private lay() {
    this.pencil.position.copy(this.rest);
    this.pencil.quaternion.setFromEuler(new T.Euler(-Math.PI / 2, 0, 0.12)).premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.25));
    this.pencil.position.y = 0.045;
  }
  /** Holds the pencil as a hand does, its tip at pad pixel (x, y), leaning back toward the player's right. */
  private hold(x: number, y: number, lifted: number) {
    this.pencil.position.set((x / W - 0.5) * PAD.width, 0.062 + lifted, (y / H - 0.5) * PAD.depth);
    this.pencil.quaternion.setFromEuler(new T.Euler(0.62, 0, -0.42));
  }
  private column(i: number) {
    return LABEL + i * CELL;
  }
  private rows() {
    const count = Math.max(1, this.names.length);
    return { top: HEAD, height: (H - HEAD - 12) / count };
  }
  /** The printed sheet: ruled cells, the categories (the upper ones as die faces), the players' names. */
  private printSheet() {
    const g = this.print.getContext("2d")!,
      rnd = random(9);
    g.fillStyle = "#ece2c8";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(160,140,110,${rnd() * 0.07})`;
      g.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
    }
    const { top, height } = this.rows(),
      right = this.column(COLUMNS);
    g.fillStyle = "rgba(38,92,88,0.14)";
    g.fillRect(10, TOP, right - 10, top - TOP);
    g.fillStyle = "rgba(190,60,40,0.08)";
    g.fillRect(this.column(6), 0, CELL, H);
    g.fillRect(this.column(13), 0, CELL, H);
    g.strokeStyle = "#2b5e58";
    g.lineWidth = 2.5;
    for (let i = 0; i <= COLUMNS; i++) {
      g.beginPath();
      g.moveTo(this.column(i), TOP);
      g.lineTo(this.column(i), H - 6);
      g.stroke();
    }
    g.lineWidth = 4;
    for (const i of [6, 12]) {
      g.beginPath();
      g.moveTo(this.column(i), TOP);
      g.lineTo(this.column(i), H - 6);
      g.stroke();
    }
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(10, TOP);
    g.lineTo(right, TOP);
    g.stroke();
    for (let r = 0; r <= this.names.length; r++) {
      g.beginPath();
      g.moveTo(10, top + r * height);
      g.lineTo(right, top + r * height);
      g.stroke();
    }
    g.fillStyle = "#265c58";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 26px ${PRINT}`;
    g.fillText("YACHT", LABEL / 2, (top + TOP) / 2 - 12);
    g.font = `700 18px ${PRINT}`;
    g.fillText("점수표", LABEL / 2, (top + TOP) / 2 + 16);
    // Category heads: die faces for the upper half, short names for the lower.
    CATEGORIES.forEach((category, i) => {
      const cx = this.column(i) + CELL / 2,
        cy = (top + TOP) / 2;
      if (i < UPPER.length) {
        const s = CELL * 0.66;
        g.strokeStyle = "#265c58";
        g.lineWidth = 2.5;
        g.beginPath();
        g.roundRect(cx - s / 2, cy - s / 2, s, s, 7);
        g.stroke();
        const face = i + 1,
          spots: Record<number, Point[]> = {
            1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
            5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
          };
        g.fillStyle = face === 1 ? "#c0291b" : "#265c58";
        for (const [x, y] of spots[face]) {
          g.beginPath();
          g.arc(cx + x * s * 0.27, cy + y * s * 0.27, face === 1 ? s * 0.15 : s * 0.09, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = "#265c58";
        const label = SHORT[category];
        g.font = `800 ${label.length > 3 ? 16 : 20}px ${PRINT}`;
        g.fillText(label, cx, cy);
      }
    });
    g.fillStyle = "#265c58";
    g.font = `800 16px ${PRINT}`;
    g.fillText("보너스", this.column(12) + CELL / 2, (top + TOP) / 2 - 12);
    g.font = `700 16px ${PRINT}`;
    g.fillText(`+${BONUS}`, this.column(12) + CELL / 2, (top + TOP) / 2 + 14);
    g.font = `800 22px ${PRINT}`;
    g.fillText("합계", this.column(13) + CELL / 2, (top + TOP) / 2);
    g.font = `800 ${this.names.length > 1 ? 22 : 28}px ${PRINT}`;
    this.names.forEach((name, r) => g.fillText(name, LABEL / 2, top + (r + 0.5) * height, LABEL - 20));
  }
  /** Sets the players and starts a clean sheet. */
  setNames(names: string[]) {
    this.names = [...names];
    this.entries = [];
    this.queue = [];
    this.written.clear();
    this.printSheet();
    this.repaint();
    this.lay();
  }
  /** The strokes of `text` written into a cell, a little uneven, as a hand writes. */
  private shape(text: string, player: number, column: number): Pick<Entry, "strokes" | "length"> {
    const { top, height } = this.rows(),
      size = Math.min(height * 0.56, 60, (CELL * 0.86) / Math.max(1, text.length * 0.62 - 0.08)),
      wide = size * 0.52,
      gap = size * 0.1,
      span = text.length * wide + (text.length - 1) * gap,
      rnd = random(player * 97 + column * 13 + text.length * 7 + text.charCodeAt(0)),
      slant = 0.18,
      x0 = this.column(column) + (CELL - span) / 2,
      y0 = top + (player + 0.5) * height - size / 2 + (rnd() - 0.5) * 4,
      strokes: Point[][] = [];
    let length = 0;
    [...text].forEach((ch, k) => {
      const scale = 1 + (rnd() - 0.5) * 0.1;
      for (const line of HAND[ch] ?? []) {
        const stroke = line.map(([x, y]) => {
          const px = x0 + k * (wide + gap) + (x + (rnd() - 0.5) * 0.06) * wide * scale + (1 - y) * slant * size,
            py = y0 + (y + (rnd() - 0.5) * 0.05) * size * scale;
          return [px, py] as Point;
        });
        for (let i = 1; i < stroke.length; i++) length += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
        strokes.push(stroke);
      }
    });
    return { strokes, length };
  }
  /** Draws an entry's strokes as far as it is written; returns where the pencil is. */
  private ink(entry: Entry): Point | null {
    const ctx = this.ctx;
    ctx.strokeStyle = INK;
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    let left = entry.length * entry.done,
      tip: Point | null = null;
    for (const stroke of entry.strokes) {
      if (left <= 0) break;
      ctx.beginPath();
      ctx.moveTo(...stroke[0]);
      tip = stroke[0];
      for (let i = 1; i < stroke.length && left > 0; i++) {
        const [ax, ay] = stroke[i - 1],
          [bx, by] = stroke[i],
          d = Math.hypot(bx - ax, by - ay),
          f = Math.min(1, left / d);
        // Through the midpoints, so the line runs round as a pen's does.
        const mx = ax + (bx - ax) * f,
          my = ay + (by - ay) * f;
        if (f < 1 || i === stroke.length - 1) ctx.lineTo(mx, my);
        else ctx.quadraticCurveTo(bx, by, (bx + stroke[i + 1][0]) / 2, (by + stroke[i + 1][1]) / 2);
        tip = [mx, my];
        left -= d;
      }
      ctx.stroke();
    }
    return tip;
  }
  private repaint() {
    this.ctx.drawImage(this.print, 0, 0);
    for (const entry of this.entries) this.ink(entry);
    this.map.needsUpdate = true;
  }
  /** What every cell of `cards` should show, by player and column. */
  private cells(cards: readonly Card[]) {
    const out: [number, number, string][] = [];
    cards.forEach((card, p) => {
      CATEGORIES.forEach((c, i) => {
        if (card[c] !== null) out.push([p, i, String(card[c])]);
      });
      const t = totals(card);
      if (t.bonus || UPPER.every((c) => card[c] !== null)) out.push([p, 12, t.bonus ? `+${t.bonus}` : "0"]);
      if (CATEGORIES.every((c) => card[c] !== null)) out.push([p, 13, String(t.total)]);
    });
    return out;
  }
  /** Brings the sheet up to `cards`: a new value is written by hand (at once without `animate`). */
  show(cards: readonly Card[], animate: boolean) {
    const now = performance.now(),
      wanted = this.cells(cards),
      keys = new Set(wanted.map(([p, c]) => `${p}:${c}`));
    // A new game: everything written goes.
    if ([...this.written.keys()].some((key) => !keys.has(key))) {
      this.entries = [];
      this.queue = [];
      this.written.clear();
    }
    let changed = false;
    for (const [player, column, text] of wanted) {
      const key = `${player}:${column}`;
      if (this.written.get(key) === text) continue;
      this.written.set(key, text);
      this.entries = this.entries.filter((e) => e.player !== player || e.column !== column);
      const entry: Entry = { player, column, ...this.shape(text, player, column), done: 1, start: now };
      changed = true;
      if (animate && !this.reducedMotion) {
        entry.done = 0;
        this.queue.push(entry);
      }
      this.entries.push(entry);
    }
    if (!animate || this.reducedMotion) {
      for (const e of this.queue) e.done = 1;
      this.queue = [];
    }
    if (changed) this.repaint();
  }
  get writing() {
    return this.queue.length > 0;
  }
  /** Moves the writing on; true while there is something to draw. */
  step(now: number) {
    const entry = this.queue[0];
    if (!entry) return false;
    if (now < entry.start) return true;
    if (!entry.begun) {
      entry.begun = true;
      entry.start = now;
      this.onWrite();
    }
    const p = Math.max(0, Math.min(1, (now - entry.start) / WRITE_MS));
    entry.done = p;
    this.ctx.drawImage(this.print, 0, 0);
    let tip: Point | null = null;
    for (const e of this.entries) {
      const at = this.ink(e);
      if (e === entry) tip = at;
    }
    this.map.needsUpdate = true;
    if (tip) this.hold(tip[0], tip[1], p < 1 ? 0 : 0.08);
    if (p >= 1) {
      this.queue.shift();
      if (this.queue[0]) this.queue[0].start = now + NEXT_MS;
      else this.lay();
    }
    return true;
  }
  /** Finishes any writing at once. */
  finish() {
    for (const e of this.queue) e.done = 1;
    if (this.queue.length) {
      this.queue = [];
      this.repaint();
      this.lay();
    }
  }
}
