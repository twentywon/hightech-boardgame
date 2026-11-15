import * as T from "three";
import { planks, weave, block } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { kindOf, monthOf, pictureOf, piValue, score, type State } from "./rules";
import { GOSTOP_LAYOUT as L } from "./layout";

// The forty-eight pictures, inlined so that the game makes no network request (CC BY-SA 4.0, see public/hwatu-license.txt).
const sources = import.meta.glob<string>("./cards/*.webp", { query: "?inline", import: "default", eager: true });
export const GOSTOP_COLORS: [string, string] = ["#c8321f", "#2b2b2b"];
interface Pose {
  x: number;
  y: number;
  z: number;
  up: boolean;
  s: number;
}
/** Which group of the taken cards a card goes to: brights, animals, ribbons, chaff. */
const GROUP = { gwang: 0, yeol: 1, tti: 2, pi: 3, ssang: 3 } as const;
/**
 * A table with a wool blanket on it, seen from my seat: my hand along the near
 * edge, the computer's face down across the table, the pile in the middle with
 * the floor's cards by month on either side of it, and what each has taken
 * laid out by kind between the floor and its hand, chaff in rows worth ten each.
 */
export class GostopView extends TableView<State> {
  private cards: T.Mesh[] = [];
  private poses = new Map<number, Pose>();
  private cursor: T.Mesh;
  private rings: T.Mesh[] = [];
  /** A tablet lying by the pile for each side, with its score painted on it (there is no panel beside the table). */
  private plates: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }[] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1b1611");
    this.daylight("#fff4e4", "#3a2c22", "#fff1da", 7, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The table, and on it an olive wool blanket with a darker band round its edge.
    this.add(block(13.6, 0.5, 11.2, 0.12), this.standard(planks(1.7, keep, 1.4)), 0, -0.27, 0).castShadow = false;
    const blanket = this.standard({ color: "#56603f", roughness: 1, ...weave(5, 4.2, keep, 1.2) }),
      band = this.standard({ color: "#3d452c", roughness: 1, ...weave(5, 4.2, keep, 1.2) });
    this.add(new T.BoxGeometry(12.2, 0.04, 9.9), band, 0, 0, 0).castShadow = false;
    this.add(new T.BoxGeometry(11.6, 0.045, 9.3), blanket, 0, 0.003, 0).castShadow = false;
    // The cards: one box each, the picture on top, the red back below.
    const geometry = this.own(new T.BoxGeometry(L.CW, 0.018, L.CH)),
      edge = this.standard({ color: "#2a120c", roughness: 0.7 }),
      back = this.standard({ map: this.paint((ctx, w, h) => this.back(ctx, w, h)), roughness: 0.55 });
    for (let id = 0; id < 48; id++) {
      const face = this.standard({ map: this.face(id), roughness: 0.5 }),
        mesh = new T.Mesh(geometry, [edge, edge, face, back, edge, edge]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.cards.push(mesh);
      this.scene.add(mesh);
    }
    // A frame round a card: white where the keyboard is, gold round the floor cards to choose between.
    const frame = this.own(new T.PlaneGeometry(L.CW + 0.14, L.CH + 0.14)),
      paint = (color: string) => this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })),
      lay = (material: T.Material) => {
        const mesh = new T.Mesh(frame, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.visible = false;
        this.scene.add(mesh);
        return mesh;
      };
    this.cursor = lay(paint("#ffffff"));
    const gold = paint("#f2c14e");
    for (let i = 0; i < 4; i++) this.rings.push(lay(gold));
    // The scores: mine on a tablet below the pile, the computer's above it, both written to be read from my seat.
    const lacquer = this.standard({ color: "#20140e", roughness: 0.45 });
    for (const side of [0, 1]) {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 200;
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 8;
      const top = this.standard({ map: texture, roughness: 0.5 });
      this.add(block(L.PLATE_W, 0.06, L.PLATE_D, 0.03), [lacquer, lacquer, top, lacquer, lacquer, lacquer], 0, 0.05, side === 0 ? L.PLATE_Z : -L.PLATE_Z);
      this.plates.push({ canvas, texture, said: "" });
    }
    this.begin();
  }
  /** Paints a side's score and goes on its tablet. */
  private say(side: number, label: string, points: number, gos: number) {
    const plate = this.plates[side],
      key = `${label}|${points}|${gos}`;
    if (plate.said === key) return;
    plate.said = key;
    const ctx = plate.canvas.getContext("2d")!,
      w = plate.canvas.width,
      h = plate.canvas.height;
    ctx.fillStyle = "#c9a24a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#24170f";
    ctx.beginPath();
    ctx.roundRect(10, 10, w - 20, h - 20, 22);
    ctx.fill();
    ctx.textBaseline = "middle";
    // The name at the left, the score at the right and the goes after it, each made smaller if it would not fit.
    const fit = (text: string, size: number, room: number, weight: number) => {
      let px = size;
      do ctx.font = `${weight} ${px}px "Noto Sans KR", "Apple SD Gothic Neo", "Helvetica Neue", Arial, sans-serif`;
      while (ctx.measureText(text).width > room && (px -= 4) > 20);
      return ctx.measureText(text).width;
    };
    const value = `${points}점`,
      go = gos ? ` ${gos}고` : "";
    ctx.textAlign = "right";
    let right = w - 40;
    if (go) {
      ctx.fillStyle = "#ff8a6a";
      right -= fit(go, 64, 150, 800) - 0;
      ctx.fillText(go, w - 40, h / 2 + 4);
      right -= 6;
    }
    ctx.fillStyle = "#ffd45a";
    const used = fit(value, 104, 300, 800);
    ctx.fillText(value, right, h / 2 + 4);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9dcc0";
    fit(label, 60, right - used - 70, 700);
    ctx.fillText(label, 40, h / 2 + 2);
    plate.texture.needsUpdate = true;
  }
  private paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = 210;
    canvas.height = 343;
    draw(canvas.getContext("2d")!, canvas.width, canvas.height);
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  /** The red back of a hwatu card: a dark frame and fine diagonal lines. */
  private back(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = "#a3271a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255, 214, 180, 0.2)";
    ctx.lineWidth = 3;
    for (let i = -h; i < w; i += 18) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "#5a120a";
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }
  /** A card's face: its picture once decoded (a plain card of its month until then), and the month in a corner. */
  private face(id: number) {
    const month = monthOf(id),
      texture = this.paint((ctx, w, h) => {
        ctx.fillStyle = "#f4eddc";
        ctx.fillRect(0, 0, w, h);
      }),
      image = new Image(),
      canvas = texture.image as HTMLCanvasElement;
    image.onload = () => {
      if (this.disposed) return;
      const ctx = canvas.getContext("2d")!,
        w = canvas.width,
        h = canvas.height;
      ctx.drawImage(image, 0, 0, w, h);
      ctx.beginPath();
      ctx.arc(w - 30, h - 30, 21, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(22, 24, 26, 0.85)";
      ctx.fill();
      ctx.fillStyle = "#fbf7ec";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${month >= 10 ? 22 : 27}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(String(month), w - 30, h - 28);
      texture.needsUpdate = true;
      this.redraw();
    };
    image.src = sources[`./cards/${pictureOf(id)}.webp`];
    return texture;
  }
  protected subject(aspect: number): TableSubject {
    return aspect < 1.2 ? { ...L.SUBJECT, half: L.SUBJECT.half * 0.96 } : L.SUBJECT;
  }
  /** Where every card lies in a state. */
  private arrange(state: State) {
    const poses = new Map<number, Pose>(),
      over = state.winner !== null;
    // My hand, by month; the card waiting for its floor card to be chosen is lifted toward the floor.
    const mine = [...state.hands[0]].sort((a, b) => a - b);
    mine.forEach((id, i) => {
      const lifted = state.phase === "choose" && state.pending === id && state.turn === 0;
      poses.set(id, { x: (i - (mine.length - 1) / 2) * L.HAND_STEP, y: lifted ? 0.35 : 0.04, z: L.HAND_Z - (lifted ? 0.45 : 0), up: true, s: L.HAND_SCALE });
    });
    // The computer's hand in the order it was dealt, face down until the game is over.
    state.hands[1].forEach((id, i) => {
      const lifted = state.phase === "choose" && state.pending === id && state.turn === 1;
      poses.set(id, { x: (i - (state.hands[1].length - 1) / 2) * L.RIVAL_STEP, y: lifted ? 0.35 : 0.04, z: L.RIVAL_Z + (lifted ? 0.45 : 0), up: over || lifted, s: L.RIVAL_SCALE });
    });
    // The pile, face down, one on another.
    state.pile.forEach((id, i) => poses.set(id, { x: L.PILE_X, y: 0.04 + i * 0.019, z: 0, up: false, s: 1 }));
    // The floor: a place for each month, cards of a month fanned a little.
    const counts = new Array(13).fill(0);
    for (const id of state.floor) {
      const month = monthOf(id),
        n = counts[month]++;
      poses.set(id, { ...this.slot(month, n), up: true, s: 1 });
    }
    // Taken cards by kind, in a row between the floor and the hand; chaff in rows worth ten each.
    for (const side of [0, 1] as const) {
      const groups: number[][] = [[], [], [], []];
      for (const id of state.taken[side]) groups[GROUP[kindOf(id)]].push(id);
      let x = L.TAKEN_X;
      // Doubles first among the chaff, so that a row of chaff is worth ten exactly where it can be (the user asked for a row a ten).
      groups[3].sort((a, b) => (kindOf(b) === "ssang" ? 1 : 0) - (kindOf(a) === "ssang" ? 1 : 0));
      groups.forEach((ids, g) => {
        let across = 0,
          down = 0,
          worth = 0;
        ids.forEach((id, i) => {
          // Chaff starts a new row each time the row holds ten by its count (a double counts two).
          if (g === 3 && worth >= 10) {
            down++;
            across = 0;
            worth = 0;
          }
          worth += piValue(id);
          poses.set(id, { x: x + across * L.TAKEN_STEP, y: 0.04 + i * 0.004, z: (side === 0 ? L.TAKEN_Z : -L.TAKEN_Z) + down * (side === 0 ? L.PI_DOWN : -L.PI_DOWN), up: true, s: L.TAKEN_SCALE });
          across++;
        });
        x += L.GROUP_WIDTH[g];
      });
    }
    return poses;
  }
  /**
   * Where the `n`-th card of a month lies on the floor: the pile stands in the middle of the table (the user asked),
   * January to June in two rows of three on its left, July to December on its right.
   */
  private slot(month: number, n: number) {
    const i = month - 1,
      right = i >= 6,
      col = i % 3,
      row = Math.floor(i / 3) % 2;
    return { x: (right ? L.FLOOR_RIGHT : L.FLOOR_LEFT) + col * L.FLOOR_STEP + n * 0.13, y: 0.04 + n * 0.02, z: (row ? L.FLOOR_Z : -L.FLOOR_Z) + n * 0.1 };
  }
  private put(mesh: T.Mesh, pose: Pose, lift = 0, flip = pose.up ? 0 : Math.PI) {
    mesh.position.set(pose.x, pose.y + lift, pose.z);
    mesh.rotation.set(0, 0, flip);
    mesh.scale.setScalar(pose.s);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null || state.turn !== 0) return [];
    const ids = state.phase === "play" ? state.hands[0] : state.phase === "choose" ? state.floor.filter((id) => monthOf(id) === monthOf(state.pending!)) : [];
    return ids.flatMap((id) => {
      const pose = this.poses.get(id);
      return pose ? [{ x: pose.x, y: pose.y, z: pose.z, r: 0.5 * pose.s, point: id }] : [];
    });
  }
  protected place(state: State) {
    this.poses = this.arrange(state);
    this.cards.forEach((mesh, id) => this.put(mesh, this.poses.get(id)!));
    this.say(0, "나", score(state.taken[0]).total, state.gos[0]);
    this.say(1, "컴퓨터", score(state.taken[1]).total, state.gos[1]);
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const from = this.arrange(before),
      to = this.arrange(state),
      last = state.last,
      turned = !!last && last !== before.last && state.ply === before.ply + 1 && before.last?.played !== last.played;
    this.poses = to;
    // Every card that moves, and when: the card played lands on the floor, the pile's card is turned over onto it,
    // then what was taken goes to the taker's side and any chaff stolen crosses over.
    const plan = new Map<number, { via: Pose | null; delay: number; up: boolean }>();
    if (turned && last) {
      const floorCount = (month: number) => before.floor.filter((id) => monthOf(id) === month).length,
        played = monthOf(last.played);
      plan.set(last.played, { via: { ...this.slot(played, floorCount(played)), up: true, s: 1 }, delay: 0, up: true });
      if (last.flipped !== null) {
        const month = monthOf(last.flipped),
          n = floorCount(month) + (month === played ? 1 : 0);
        plan.set(last.flipped, { via: { ...this.slot(month, n), up: true, s: 1 }, delay: L.FLIP_AT, up: true });
      }
    }
    const moved = this.cards.map((_, id) => id).filter((id) => {
      const a = from.get(id)!,
        b = to.get(id)!;
      return plan.has(id) || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.y - b.y) > 0.005 || a.up !== b.up || a.s !== b.s;
    });
    if (!moved.length) return false;
    const gather = turned ? L.GATHER_AT : 0,
      steal = gather + 380;
    for (const id of moved) {
      const a = from.get(id)!,
        b = to.get(id)!,
        mesh = this.cards[id],
        step = plan.get(id),
        stolen = !!last?.stolen.includes(id) && turned;
      const flight = (p0: Pose, p1: Pose, delay: number, duration: number, heard: boolean) =>
        this.tween(delay, duration, (p) => {
          const e = p * p * (3 - 2 * p),
            fa = p0.up ? 0 : Math.PI,
            fb = p1.up ? 0 : Math.PI;
          this.put(mesh, { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e, z: p0.z + (p1.z - p0.z) * e, up: p1.up, s: p0.s + (p1.s - p0.s) * e }, Math.sin(Math.PI * p) * 0.55, fa + (fb - fa) * e);
          // A card in flight leans a little, as one thrown down does.
          mesh.rotation.x = Math.sin(Math.PI * p) * 0.18;
          if (p === 1 && heard) this.onContact();
        });
      if (step?.via) {
        flight(a, step.via, step.delay, 380, true);
        // It stays on the floor until the gathering, or there for good.
        if (Math.abs(step.via.x - b.x) + Math.abs(step.via.z - b.z) > 0.005 || step.via.s !== b.s) flight(step.via, b, gather + 60, 420, false);
      } else flight(a, b, stolen ? steal : turned ? gather : 0, turned ? 420 : 320, !turned);
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      choosing = state?.phase === "choose" && state.turn === 0 ? state.floor.filter((id) => monthOf(id) === monthOf(state.pending!)) : [];
    this.rings.forEach((ring, i) => {
      const pose = choosing[i] !== undefined ? this.poses.get(choosing[i]) : undefined;
      ring.visible = !!pose;
      if (pose) {
        ring.position.set(pose.x, pose.y - 0.012, pose.z);
        ring.scale.setScalar(pose.s);
      }
    });
    const pose = marks.cursor !== null ? this.poses.get(marks.cursor) : undefined;
    this.cursor.visible = !!pose;
    if (pose) {
      this.cursor.position.set(pose.x, pose.y - 0.01, pose.z);
      this.cursor.scale.setScalar(pose.s);
    }
  }
}
