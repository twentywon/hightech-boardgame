import * as T from "three";
import { capturing as picturing } from "../../ui/banner";
import { furry, block } from "../../engine/scene-utils";
import { ondol } from "../../engine/scenery";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BONUS2, CARDS, FLIP, bundles, capturing, choicesOf, danger, isBonus, kindOf, monthOf, pictureOf, piValue, points, sure, type State } from "./rules";
import { GOSTOP_LAYOUT as L } from "./layout";
import { BLIND, unveil } from "../deck/blind";

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
const GROUP = { gwang: 0, yeol: 1, tti: 2, pi: 3, ssang: 3, bonus: 3 } as const;
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
  /** Frames under the cards of my hand: blue where a card takes something now, grey where a pair is sure to come back. */
  private edges: T.Mesh[] = [];
  private blue: T.Material;
  private grey: T.Material;
  /** A bomb painted on the first card of each three that may be played together as a bomb. */
  private badges: T.Mesh[] = [];
  /**
   * Lettering over the table, in the page: each seat's 피박, 광박 and 멍박 as it stands (the user asked), the sets
   * called out at the seat that made them, and the bubble that shows the two floor cards to choose between.
   */
  private layer: HTMLDivElement;
  private seats: HTMLDivElement[] = [];
  private bubble: HTMLDivElement;
  /** The final reckoning, printed like a shop's receipt at the end of a game (the user asked). */
  private receipt: HTMLDivElement;
  private printed: State | null = null;
  /** The deal last shown, so that a new game is dealt from the pile once. */
  private dealt: State["opening"] | null = null;
  /** When the last card of the move being shown lands, in ms from its start: set call-outs wait for it. */
  private landed = 0;
  /** A tablet lying by the pile for each side, with its score painted on it (there is no panel beside the table). */
  private plates: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }[] = [];
  /** Over Wi-Fi: the other is 상대, and the cards out of my sight are blind ones (`deck/blind.ts`). */
  private net: boolean;
  constructor(host: HTMLElement, quality: "high" | "low", net = false) {
    super(host, quality, "#3a2a1c");
    this.net = net;
    this.daylight("#fff1dc", "#8a6236", "#ffe8c6", 7, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // An ondol room (the user asked), and on its floor an olive wool blanket with a darker band round its edge.
    ondol(this.scene, keep, 6.1, 4.95);
    // The blanket's wool has a light pile (the user asked): fine strands, and their relief and sheen where a graphics card draws.
    const blanket = keep(furry({ color: "#56603f", roughness: 1 }, 0.6, 9, 7.5, keep)),
      band = keep(furry({ color: "#3d452c", roughness: 1 }, 0.6, 9, 7.5, keep));
    this.add(new T.BoxGeometry(12.2, 0.04, 9.9), band, 0, 0, 0).castShadow = false;
    this.add(new T.BoxGeometry(11.6, 0.045, 9.3), blanket, 0, 0.003, 0).castShadow = false;
    // The cards: one box each, the picture on top, the red back below.
    const geometry = this.own(new T.BoxGeometry(L.CW, 0.018, L.CH)),
      edge = this.standard({ color: "#2a120c", roughness: 0.7 }),
      back = this.standard({ map: this.paint((ctx, w, h) => this.back(ctx, w, h)), roughness: 0.55 });
    for (let id = 0; id < CARDS; id++) {
      const face = this.standard({ map: this.face(id), roughness: 0.5 }),
        mesh = new T.Mesh(geometry, [edge, edge, face, back, edge, edge]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.cards.push(mesh);
      this.scene.add(mesh);
    }
    // Over Wi-Fi a blind card for each card, backed on both faces, numbered from `BLIND`.
    if (net)
      for (let k = 0; k < CARDS; k++) {
        const mesh = new T.Mesh(geometry, [edge, edge, back, back, edge, edge]);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.visible = false;
        this.cards[BLIND + k] = mesh;
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
    this.blue = paint("#2f80f0");
    this.grey = paint("#a2a7ad");
    const wide = this.own(new T.PlaneGeometry(L.CW + 0.1, L.CH + 0.1));
    for (let i = 0; i < 12; i++) {
      const mesh = new T.Mesh(wide, this.blue);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.edges.push(mesh);
    }
    const bomb = this.own(new T.MeshBasicMaterial({ map: this.icon(), transparent: true, depthWrite: false })),
      round = this.own(new T.PlaneGeometry(0.42, 0.42));
    for (let i = 0; i < 3; i++) {
      const mesh = new T.Mesh(round, bomb);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      this.badges.push(mesh);
    }
    // The scores: mine on a tablet below the pile, the computer's above it, both written to be read from my seat.
    const lacquer = this.standard({ color: "#20140e", roughness: 0.45 });
    for (const side of [0, 1]) {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = Math.round((640 * L.PLATE_D) / L.PLATE_W);
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 8;
      const top = this.standard({ map: texture, roughness: 0.5 });
      this.add(block(L.PLATE_W, 0.06, L.PLATE_D, 0.03), [lacquer, lacquer, top, lacquer, lacquer, lacquer], 0, 0.05, side === 0 ? L.PLATE_Z : -L.PLATE_Z);
      this.plates.push({ canvas, texture, said: "" });
    }
    this.layer = document.createElement("div");
    this.layer.className = "gs-layer";
    this.layer.setAttribute("aria-hidden", "true");
    for (const side of ["me", "them"]) {
      const seat = document.createElement("div");
      seat.className = `gs-seat ${side}`;
      this.layer.append(seat);
      this.seats.push(seat);
    }
    this.bubble = document.createElement("div");
    this.bubble.className = "gs-bubble";
    this.bubble.hidden = true;
    this.layer.append(this.bubble);
    this.receipt = document.createElement("div");
    this.receipt.className = "gs-receipt";
    this.receipt.hidden = true;
    this.layer.append(this.receipt);
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.append(this.layer);
    this.begin();
  }
  /** Where a point of the table falls in the canvas, in pixels. */
  private screen(x: number, y: number, z: number) {
    const v = new T.Vector3(x, y, z).project(this.camera),
      el = this.renderer.domElement;
    return { left: ((v.x + 1) / 2) * el.clientWidth + el.offsetLeft, top: ((1 - v.y) / 2) * el.clientHeight + el.offsetTop };
  }
  /** Prints the reckoning of a finished game: who won, the points of each kind, the goes, every doubling, the total. */
  private print(state: State) {
    const over = state.winner !== null && !!state.result && !this.animating && !picturing();
    this.receipt.hidden = !over;
    if (!over) {
      this.printed = null;
      return;
    }
    if (this.printed === state) return;
    this.printed = state;
    const result = state.result!,
      row = (label: string, value: string, kind = "") => {
        const line = document.createElement("div");
        line.className = `gs-row ${kind}`;
        const a = document.createElement("span"),
          b = document.createElement("span");
        a.textContent = label;
        b.textContent = value;
        line.append(a, b);
        return line;
      },
      rule = (kind = "") => {
        const line = document.createElement("hr");
        if (kind) line.className = kind;
        return line;
      },
      text = (words: string, kind: string) => {
        const line = document.createElement("div");
        line.className = kind;
        line.textContent = words;
        return line;
      },
      now = new Date(),
      pad = (n: number) => String(n).padStart(2, "0"),
      when = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const parts: HTMLElement[] = [text("WORLD TABLE GAMES", "gs-shop"), text("고스톱 계산서", "gs-title"), text(when, "gs-when"), rule()];
    if (state.winner === "draw") {
      parts.push(row("결과", "나가리"), rule("double"), row("합계", "0점", "total"));
    } else {
      const kinds = result.lines.filter((l) => l.value.endsWith("점")),
        rest = result.lines.filter((l) => !l.value.endsWith("점")),
        base = kinds.reduce((n, l) => n + parseInt(l.value, 10), 0);
      parts.push(row("이긴 사람", state.winner === 0 ? "나" : "컴퓨터"), rule());
      for (const l of kinds) parts.push(row(l.label, l.value));
      parts.push(row("점수", `${base}점`, "sub"));
      if (rest.length) {
        parts.push(rule());
        for (const l of rest) parts.push(row(l.label, l.value, l.value.startsWith("×") ? "times" : ""));
      }
      parts.push(rule("double"), row("합계", `${result.points}점`, "total"));
    }
    parts.push(rule(), text("이용해 주셔서 감사합니다", "gs-thanks"), text("||| || ||| | || |||| | ||| || |", "gs-code"));
    this.receipt.replaceChildren(...parts);
  }
  /** The lettering of the seats and the bubble, for a state at rest. */
  private overlay(state: State) {
    this.print(state);
    const hidden = picturing() || state.winner !== null;
    // Each seat's doubles, beside its hand: mine at the left of my row, the computer's at the right of its row.
    const anchors = [this.screen(-L.HAND_STEP * 5 - 0.1, 0.05, L.HAND_Z), this.screen(L.RIVAL_STEP * 5 + 0.15, 0.05, L.RIVAL_Z)];
    this.seats.forEach((seat, side) => {
      const risk = hidden ? [] : danger(state, side as 0 | 1);
      seat.replaceChildren(
        ...risk.map((word) => {
          const tag = document.createElement("span");
          tag.textContent = word;
          return tag;
        }),
      );
      seat.style.left = `${Math.max(8, anchors[side].left)}px`;
      seat.style.top = `${anchors[side].top}px`;
    });
    // Two floor cards of a month that differ: a bubble shows them apart to be chosen (the user asked).
    const choosing = !hidden && state.phase === "choose" && state.turn === 0 && !this.animating,
      choices = choosing ? choicesOf(state) : [];
    this.bubble.hidden = !choices.length;
    if (!choices.length) return this.bubble.replaceChildren();
    const at = this.slot(monthOf(state.pending!), 0),
      point = this.screen(at.x, 0.1, at.z - L.CH / 2);
    this.bubble.replaceChildren(
      ...choices.map((id) => {
        const button = document.createElement("button"),
          picture = document.createElement("img");
        picture.src = sources[`./cards/${pictureOf(id)}.webp`];
        picture.alt = "";
        button.append(picture);
        button.onclick = (e) => {
          e.stopPropagation();
          this.onPick(id);
        };
        return button;
      }),
    );
    this.bubble.style.left = `${point.left}px`;
    this.bubble.style.top = `${point.top}px`;
  }
  /** Calls out the sets a side has made (홍단, 고도리, 삼광…) over its row of taken cards. */
  private call(side: 0 | 1, names: string[]) {
    if (!names.length || picturing()) return;
    const at = this.screen(0, 0.3, side === 0 ? L.TAKEN_Z : -L.TAKEN_Z),
      el = document.createElement("div");
    el.className = `gs-call ${side ? "them" : "me"}`;
    el.textContent = names.join(" · ");
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
    this.layer.append(el);
    setTimeout(() => el.remove(), 2400);
  }
  dispose() {
    this.layer.remove();
    super.dispose();
  }
  /**
   * Paints a side's tablet: its name, score and goes on the upper line, and under the score a picture for every time it
   * has shaken (three cards fanned) or bombed (a bomb) (the user asked).
   */
  private say(side: number, label: string, total: number, gos: number, shakes: number, bombs: number) {
    const plate = this.plates[side],
      key = `${label}|${total}|${gos}|${shakes}|${bombs}`;
    if (plate.said === key) return;
    plate.said = key;
    const ctx = plate.canvas.getContext("2d")!,
      w = plate.canvas.width,
      h = plate.canvas.height,
      line = 100;
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
    const value = `${total}점`,
      go = gos ? ` ${gos}고` : "";
    ctx.textAlign = "right";
    let right = w - 40;
    if (go) {
      ctx.fillStyle = "#ff8a6a";
      right -= fit(go, 64, 150, 800);
      ctx.fillText(go, w - 40, line);
      right -= 6;
    }
    ctx.fillStyle = "#ffd45a";
    const used = fit(value, 100, 300, 800);
    ctx.fillText(value, right, line + 2);
    ctx.textAlign = "left";
    ctx.fillStyle = "#e9dcc0";
    fit(label, 60, right - used - 70, 700);
    ctx.fillText(label, 40, line);
    // Under it: shakes, then bombs, small pictures from the right.
    let x = w - 64;
    const y = h - 62;
    for (let i = 0; i < bombs; i++, x -= 70) this.bombAt(ctx, x, y, 26);
    for (let i = 0; i < shakes - bombs; i++, x -= 70) this.fanAt(ctx, x, y);
    if (shakes) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#cdbf9f";
      fit(bombs && shakes > bombs ? "흔들기·폭탄" : bombs ? "폭탄" : "흔들기", 40, 220, 700);
      ctx.fillText(bombs && shakes > bombs ? "흔들기·폭탄" : bombs ? "폭탄" : "흔들기", x + 22, y + 2);
    }
    plate.texture.needsUpdate = true;
  }
  /** Three cards fanned, for a shake. */
  private fanAt(ctx: CanvasRenderingContext2D, x: number, y: number) {
    for (const [turn, tone] of [[-0.35, "#a3271a"], [0, "#c8321f"], [0.35, "#e05a3a"]] as [number, string][]) {
      ctx.save();
      ctx.translate(x, y + 18);
      ctx.rotate(turn);
      ctx.fillStyle = tone;
      ctx.strokeStyle = "#fff4dc";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-11, -42, 22, 36, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  /** A round bomb with a lit fuse. */
  private bombAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    ctx.arc(x, y + 4, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0d0e10";
    ctx.fill();
    ctx.strokeStyle = "#e9dcc0";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = "#b08a5a";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.6, y - r * 0.6);
    ctx.quadraticCurveTo(x + r, y - r * 1.3, x + r * 1.3, y - r * 1.05);
    ctx.stroke();
    ctx.fillStyle = "#ffb21a";
    ctx.beginPath();
    ctx.arc(x + r * 1.35, y - r * 1.1, 6, 0, Math.PI * 2);
    ctx.fill();
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
  /** A round black bomb with a lit fuse, on a white disc. */
  private icon() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fillStyle = "#fff4dc";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#c8321f";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(58, 72, 32, 0, Math.PI * 2);
    ctx.fillStyle = "#1d1f23";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(48, 62, 9, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
    ctx.fillStyle = "#1d1f23";
    ctx.fillRect(70, 34, 16, 14);
    ctx.strokeStyle = "#7a5a3a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(80, 36);
    ctx.quadraticCurveTo(90, 18, 102, 24);
    ctx.stroke();
    ctx.fillStyle = "#ffb21a";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(104, 22);
      ctx.lineTo(104 + Math.cos(a) * 13, 22 + Math.sin(a) * 13);
      ctx.lineTo(104 + Math.cos(a + 0.3) * 5, 22 + Math.sin(a + 0.3) * 5);
      ctx.fill();
    }
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    return texture;
  }
  /** A bonus card: no month, a large figure of how much chaff it is worth. */
  private bonusFace(ctx: CanvasRenderingContext2D, w: number, h: number, worth: number) {
    ctx.fillStyle = "#fbf3e0";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#c8321f";
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.strokeStyle = "#d9a441";
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.47, 66, 0, Math.PI * 2);
    ctx.fillStyle = worth === 3 ? "#1f4e9c" : "#c8321f";
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#3a2a1a";
    ctx.font = '800 34px "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif';
    ctx.fillText("보너스", w / 2, 58);
    ctx.fillStyle = "#fff6e0";
    ctx.font = '900 92px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(String(worth), w / 2, h * 0.47 + 6);
    ctx.fillStyle = "#3a2a1a";
    ctx.font = '800 44px "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif';
    ctx.fillText(`${worth}피`, w / 2, h - 62);
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
    if (isBonus(id)) return this.paint((ctx, w, h) => this.bonusFace(ctx, w, h, id === BONUS2 ? 2 : 3));
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
    // My hand, by month; three of a month are held together (the user asked); the card waiting for a choice is lifted.
    const mine = [...state.hands[0]].sort((a, b) => a - b),
      held = new Set(bundles(state, 0).flatMap((b) => b.cards)),
      units: number[][] = [];
    for (const id of mine) {
      const prior = units[units.length - 1];
      if (held.has(id) && prior && held.has(prior[0]) && monthOf(prior[0]) === monthOf(id)) prior.push(id);
      else units.push([id]);
    }
    const span = (unit: number[]) => L.HAND_STEP + (unit.length - 1) * L.BUNDLE_STEP,
      total = units.reduce((n, unit) => n + span(unit), 0) - (L.HAND_STEP - L.CW * L.HAND_SCALE);
    let x = -total / 2 + (L.CW * L.HAND_SCALE) / 2;
    for (const unit of units) {
      unit.forEach((id, k) => {
        const lifted = (state.phase === "choose" || state.phase === "declare") && state.pending === id && state.turn === 0;
        poses.set(id, { x: x + k * L.BUNDLE_STEP, y: (lifted ? 0.35 : 0.04) + k * 0.02, z: L.HAND_Z - (lifted ? 0.45 : 0), up: true, s: L.HAND_SCALE });
      });
      x += span(unit);
    }
    // The computer's hand in the order it was dealt, face down until the game is over.
    state.hands[1].forEach((id, i) => {
      const lifted = (state.phase === "choose" || state.phase === "declare") && state.pending === id && state.turn === 1;
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
      groups[3].sort((a, b) => piValue(b) - piValue(a));
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
    mesh.visible = true;
    mesh.position.set(pose.x, pose.y + lift, pose.z);
    mesh.rotation.set(0, 0, flip);
    mesh.scale.setScalar(pose.s);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null || state.turn !== 0) return [];
    const ids = state.phase === "play" ? state.hands[0] : choicesOf(state);
    const out: Spot[] = ids.flatMap((id) => {
      const pose = this.poses.get(id);
      // Cards held together overlap: each is found by its own uncovered strip.
      return pose ? [{ x: pose.x, y: pose.y, z: pose.z, r: 0.5 * pose.s, point: id }] : [];
    });
    // After a bomb, a tap on the pile turns it over without playing a card.
    if (state.phase === "play" && state.dummies[0] > 0) out.push({ x: L.PILE_X, y: 0.3, z: 0, r: 0.55, point: FLIP });
    return out;
  }
  protected place(state: State) {
    this.poses = this.arrange(state);
    // Over Wi-Fi a card out of my sight is not itself on the table: its blind card is.
    this.cards.forEach((mesh, id) => {
      const pose = this.poses.get(id);
      if (pose) this.put(mesh, pose);
      else mesh.visible = false;
    });
    this.say(0, "나", points(state, 0).total, state.gos[0], state.shakes[0], state.bombs[0]);
    this.say(1, this.net ? "상대" : "컴퓨터", points(state, 1).total, state.gos[1], state.shakes[1], state.bombs[1]);
    this.overlay(state);
    this.mark(this.marks);
  }
  /** Carries a card from one pose to another in an arc, turning it over on the way when it must. */
  /** With `hold`, the card is kept where it starts until its moment (a redrawn table would otherwise lay it out early). */
  private fly(id: number, p0: Pose, p1: Pose, delay: number, duration: number, heard: boolean, hold = false) {
    const mesh = this.cards[id];
    this.landed = Math.max(this.landed, delay + duration);
    if (hold)
      return this.tween(0, delay + duration, (q) => {
        const p = Math.max(0, (q * (delay + duration) - delay) / duration);
        if (p <= 0) return this.put(mesh, p0);
        const e = p * p * (3 - 2 * p),
          fa = p0.up ? 0 : Math.PI,
          fb = p1.up ? 0 : Math.PI;
        this.put(mesh, { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e, z: p0.z + (p1.z - p0.z) * e, up: p1.up, s: p0.s + (p1.s - p0.s) * e }, Math.sin(Math.PI * p) * 0.55, fa + (fb - fa) * e);
        mesh.rotation.x = Math.sin(Math.PI * p) * 0.18;
        if (q === 1 && heard) this.onContact();
      });
    this.tween(delay, duration, (p) => {
      const e = p * p * (3 - 2 * p),
        fa = p0.up ? 0 : Math.PI,
        fb = p1.up ? 0 : Math.PI;
      this.put(mesh, { x: p0.x + (p1.x - p0.x) * e, y: p0.y + (p1.y - p0.y) * e, z: p0.z + (p1.z - p0.z) * e, up: p1.up, s: p0.s + (p1.s - p0.s) * e }, Math.sin(Math.PI * p) * 0.55, fa + (fb - fa) * e);
      // A card in flight leans a little, as one thrown down does.
      mesh.rotation.x = Math.sin(Math.PI * p) * 0.18;
      if (p === 1 && heard) this.onContact();
    });
  }
  /**
   * A new game is dealt from the pile in the middle (the user asked): four to the floor, five to the computer and five
   * to me, twice over; then a bonus card on the floor goes to the first player and the pile fills its place.
   */
  sync(state: State, animate = true) {
    const fresh = state.ply === 0 && state.opening !== this.dealt;
    if (fresh) this.dealt = state.opening;
    // The same state shown again while it is being dealt: the deal goes on.
    if (!fresh && state === this.state && this.animating) return;
    if (!fresh || this.disposed || this.reducedMotion) return super.sync(state, animate);
    this.state = state;
    this.settleNow();
    this.poses = this.arrange(state);
    this.hide();
    const { laid, swaps } = state.opening,
      // The place of each of the eight: where the card that stays there at last lies (a bonus card is replaced in place).
      spot = state.floor.map((id) => this.poses.get(id)!);
    // Everything starts in the pile, face down.
    const order = [...state.hands[0], ...state.hands[1], ...laid, ...swaps.map(([, r]) => r), ...state.pile.filter((id) => !swaps.some(([, r]) => r === id))];
    const stack = (i: number): Pose => ({ x: L.PILE_X, y: 0.04 + (order.length - 1 - i) * 0.019, z: 0, up: false, s: 1 });
    for (const mesh of this.cards) if (mesh) mesh.visible = false;
    order.forEach((id, i) => this.put(this.cards[id], stack(i)));
    const step = 75,
      flight = 300;
    // A moment first, so that the table is seen before the cards go out.
    let at = 450;
    const send = (id: number, to: Pose, heard: boolean) => {
      this.fly(id, stack(order.indexOf(id)), to, at, flight, heard, true);
      at += step;
    };
    for (const round of [0, 1]) {
      laid.slice(round * 4, round * 4 + 4).forEach((id, k) => send(id, spot[round * 4 + k], true));
      state.hands[1].slice(round * 5, round * 5 + 5).forEach((id, k) => send(id, this.poses.get(id)!, k === 4));
      state.hands[0].slice(round * 5, round * 5 + 5).forEach((id, k) => send(id, this.poses.get(id)!, k === 4));
    }
    // A bonus card on the floor goes to the first player, and the pile's top fills its place.
    at += 250;
    const lying = [...laid];
    for (const [bonus, replacement] of swaps) {
      const i = lying.indexOf(bonus);
      this.fly(bonus, spot[i], this.poses.get(bonus)!, at, 420, true, true);
      this.fly(replacement, stack(order.indexOf(replacement)), spot[i], at + 300, flight, true, true);
      lying[i] = replacement;
      at += 750;
    }
    this.redraw();
  }
  protected animate(before: State, state: State) {
    const from = this.arrange(before),
      to = this.arrange(state),
      last = state.last,
      turned = !!last && last !== before.last && state.ply === before.ply + 1 && (before.last?.played !== last.played || last.played === -1) && !last.events.includes("보너스");
    // Over Wi-Fi a card that comes into my sight (or goes out of it) starts where its blind card was.
    unveil(from, to, before.blinds, state.blinds);
    this.poses = to;
    this.hide();
    this.landed = 0;
    // Every card that moves, and when: the card played (with a bomb's others) lands on the floor, the pile's card is
    // turned over onto it, then what was taken goes to the taker's side and any chaff stolen crosses over.
    const plan = new Map<number, { via: Pose | null; delay: number }>();
    let lead = 0;
    // After a choice for the card turned over, the played and turned cards already lie on the floor: they are only gathered.
    const resumed = !!before.resume;
    if (turned && last && !resumed) {
      // A shake: the computer shows its three cards for a moment (mine are in view already).
      if (last.shown.length && last.side === 1) {
        lead = 1100;
        for (const id of last.shown) {
          const a = from.get(id)!,
            shown: Pose = { ...a, y: a.y + 0.3, z: a.z + 0.7, up: true };
          this.fly(id, a, shown, 0, 320, false);
          if (id !== last.played) this.fly(id, shown, to.get(id)!, lead - 300, 300, false);
          else from.set(id, shown);
        }
      }
      const floorCount = (month: number) => before.floor.filter((id) => !isBonus(id) && monthOf(id) === month).length;
      const played = last.played >= 0 ? monthOf(last.played) : -1;
      if (last.played >= 0) {
        [last.played, ...last.bomb].forEach((id, k) => plan.set(id, { via: { ...this.slot(played, floorCount(played) + k), up: true, s: 1 }, delay: lead + k * 110 }));
      }
      let flipAt = lead + (last.played >= 0 ? L.FLIP_AT + last.bomb.length * 110 : 100);
      // Bonus cards turned over go straight to the taker; then the next card is turned.
      for (const id of last.bonuses) {
        plan.set(id, { via: null, delay: flipAt });
        flipAt += 450;
      }
      if (last.flipped !== null) {
        const month = monthOf(last.flipped),
          n = floorCount(month) + (month === played ? 1 + last.bomb.length : 0);
        plan.set(last.flipped, { via: { ...this.slot(month, n), up: true, s: 1 }, delay: flipAt });
      }
      lead = Math.max(lead, flipAt - L.FLIP_AT);
    }
    const moved = this.cards.map((_, id) => id).filter((id) => {
      const a = from.get(id),
        b = to.get(id);
      if (!a || !b) return a !== b;
      return plan.has(id) || Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.y - b.y) > 0.005 || a.up !== b.up || a.s !== b.s;
    });
    if (!moved.length) return false;
    const gather = turned ? (resumed ? 120 : lead + L.GATHER_AT) : 0,
      steal = gather + 380;
    this.bubble.hidden = true;
    for (const id of moved) {
      const a = from.get(id),
        b = to.get(id),
        step = plan.get(id),
        stolen = !!last?.stolen.includes(id);
      // Over Wi-Fi: a card gone out of my sight (its blind card took its place) is put away; one come into it is laid.
      if (!b) {
        this.cards[id].visible = false;
        continue;
      }
      if (!a) {
        this.put(this.cards[id], b);
        continue;
      }
      if (step?.via) {
        this.fly(id, a, step.via, step.delay, 380, true);
        // It stays on the floor until the gathering, or there for good.
        if (Math.abs(step.via.x - b.x) + Math.abs(step.via.z - b.z) > 0.005 || step.via.s !== b.s) this.fly(id, step.via, b, gather + 60, 420, false);
      } else if (step) this.fly(id, a, b, step.delay, 420, true);
      else if (last?.shown.includes(id) && last.side === 1 && turned && !resumed) continue;
      // A bonus card played: it goes to my side, a chaff comes across, and a card is drawn from the pile in its place.
      else this.fly(id, a, b, stolen ? (turned ? steal : 380) : turned ? gather : id === last?.drawn ? 420 : 0, turned ? 420 : 340, !turned);
    }
    // Sets made are called out once the last card of the turn has landed (the user asked), like 쪽 and 뻑 (`cheerOnRest`).
    if (last && last !== before.last)
      this.tween(this.landed, 1, (p) => {
        if (p === 1) [0, 1].forEach((side) => this.call(side as 0 | 1, last.achieved?.[side] ?? []));
      });
    return true;
  }
  /** Takes the marks of my hand away while cards are moving; `mark` lays them again once they rest. */
  private hide() {
    for (const mesh of [...this.edges, ...this.badges]) mesh.visible = false;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      choosing = state?.turn === 0 ? choicesOf(state) : [];
    this.rings.forEach((ring, i) => {
      const pose = choosing[i] !== undefined ? this.poses.get(choosing[i]) : undefined;
      ring.visible = !!pose;
      if (pose) {
        ring.position.set(pose.x, pose.y - 0.012, pose.z);
        ring.scale.setScalar(pose.s);
      }
    });
    // My turn: a blue edge round the cards that take something, a grey one round a pair sure to come back (the user
    // asked), and a bomb on each three that may be played together.
    this.hide();
    if (state && state.turn === 0 && state.phase === "play" && state.winner === null && !this.animating && !picturing()) {
      const lay = (ids: number[], material: T.Material, from: number) =>
        ids.forEach((id, i) => {
          const edge = this.edges[from + i],
            pose = this.poses.get(id);
          if (!edge || !pose) return;
          edge.material = material;
          edge.visible = true;
          edge.position.set(pose.x, pose.y - 0.012, pose.z);
          edge.scale.setScalar(pose.s);
        });
      const blue = capturing(state, 0);
      lay(blue, this.blue, 0);
      lay(sure(state, 0), this.grey, blue.length);
      bundles(state, 0)
        .filter((b) => b.bomb)
        .forEach((b, i) => {
          // On the upper corner of the uppermost of the three.
          const badge = this.badges[i],
            pose = this.poses.get(Math.max(...b.cards));
          if (!badge || !pose) return;
          badge.visible = true;
          badge.position.set(pose.x + (L.CW * pose.s) / 2 - 0.17, pose.y + 0.03, pose.z - (L.CH * pose.s) / 2 + 0.19);
        });
    }
    const pose = marks.cursor !== null ? this.poses.get(marks.cursor) : undefined;
    this.cursor.visible = !!pose;
    if (pose) {
      this.cursor.position.set(pose.x, pose.y - 0.01, pose.z);
      this.cursor.scale.setScalar(pose.s);
    }
  }
}
