import * as T from "three";
import { block, planks, stuff, weave } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { DeckView, type CardPose } from "../deck/view";
import { CARD_H } from "../deck/cards";
import { DISCARD, MELD_BASE, REGISTER, STOCK, THANK, myHand, nameOf, type State } from "./rules";
import { HULA as L, handX, meldSpots, placeOf, rivalCard } from "./layout";

export const HULA_COLORS: [string, string] = ["#d2462f", "#26406a"];
/** Where my next meld will lie: just past the end of my melds' row (a tap there registers the cards picked). */
export function registerSpot(s: State) {
  const mine = s.melds.filter((m) => m.owner === 0).map((m) => m.cards.length),
    row = meldSpots(0, [...mine, 3]);
  return row[row.length - 1][1];
}
/**
 * A wooden camping table on a deck under the night sky: string lights over the back, two lanterns at the corners and
 * pines beyond; a woven cloth on the table. My hand along the near edge (the cards I pick rise toward the middle),
 * the computers' face down at my left, across and right, everyone's melds in front of them and readable from my
 * side, the stock and the discards between, and a board telling the round's result once it is over.
 */
export class HulaView extends DeckView<State> {
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private glow: T.Mesh;
  private board: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; mesh: T.Mesh; said: string };
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, 52, false);
    this.renderer.setClearColor("#141c2c");
    this.camp();
    for (let i = 0; i < 40; i++) {
      const ring = new T.Mesh(this.own(new T.PlaneGeometry(0.84, 1.2)), this.own(new T.MeshBasicMaterial({ color: "#9df27a", transparent: true, opacity: 0.75, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh((r) => this.own(r), 0.62, 0.7, "#ffffff");
    this.scene.add(this.cursor);
    const soft = document.createElement("canvas");
    soft.width = soft.height = 128;
    const pen = soft.getContext("2d")!,
      fade = pen.createRadialGradient(64, 64, 8, 64, 64, 64);
    fade.addColorStop(0, "rgba(255, 226, 150, 0.85)");
    fade.addColorStop(1, "rgba(255, 226, 150, 0)");
    pen.fillStyle = fade;
    pen.fillRect(0, 0, 128, 128);
    this.glow = new T.Mesh(this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ map: this.own(new T.CanvasTexture(soft)), transparent: true, depthWrite: false, opacity: 0.6 })));
    this.glow.renderOrder = 1;
    this.scene.add(this.glow);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(this.own(new T.PlaneGeometry(4.2, 2.1).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
    mesh.position.set(0, 0.6, 0.2);
    mesh.renderOrder = 3;
    mesh.visible = false;
    this.scene.add(mesh);
    this.board = { canvas, texture, mesh, said: "" };
    this.begin();
  }
  /** The camp round the table: the deck, the table and its cloth, lanterns, string lights and pines. */
  private camp() {
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.add(new T.HemisphereLight("#9fb4dc", "#3a2c22", 1.15));
    const moon = new T.DirectionalLight("#cdd8ff", 1.1);
    moon.position.set(6, 16, 8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = moon.shadow.camera.bottom = -11;
    moon.shadow.camera.right = moon.shadow.camera.top = 11;
    moon.shadow.normalBias = 0.02;
    this.own(moon.shadow);
    this.scene.add(moon);
    // The deck far below the table top, and the table: thick boards, the cloth over them.
    this.add(new T.BoxGeometry(46, 0.3, 36), this.standard(stuff("boards", "#8a6a4c", 10, keep, 8)), 0, -1.9, 0).castShadow = false;
    this.add(block(14.2, 0.22, 10.6, 0.12), this.standard({ ...planks(4, keep, 3), color: "#c79a6c" }), 0, -0.13, 0).castShadow = false;
    this.add(new T.BoxGeometry(13.4, 0.03, 9.8), this.standard({ color: "#2d5a56", roughness: 1, ...weave(5, 4, keep, 1) }), 0, 0.005, 0).castShadow = false;
    const leg = this.standard({ color: "#6b4a30", roughness: 0.7 });
    for (const x of [-6.5, 6.5]) for (const z of [-4.6, 4.6]) this.add(new T.CylinderGeometry(0.16, 0.16, 1.7, 10), leg, x, -1.05, z);
    // Lanterns on posts at the far corners, glowing warm.
    const post = this.standard({ color: "#3b2a1e", roughness: 0.8 }),
      glass = this.standard({ color: "#ffd890", emissive: "#ffb347", emissiveIntensity: 2.2, roughness: 0.3 }),
      cap = this.standard({ color: "#20252c", metalness: 0.6, roughness: 0.4 });
    for (const x of [-8.6, 8.6]) {
      this.add(new T.CylinderGeometry(0.1, 0.12, 4.2, 8), post, x, 0.2, -5.9);
      this.add(new T.CylinderGeometry(0.32, 0.32, 0.7, 12), glass, x, 2.55, -5.9).castShadow = false;
      this.add(new T.ConeGeometry(0.42, 0.34, 12), cap, x, 3.08, -5.9);
      const light = new T.PointLight("#ffbe6a", 9, 16, 1.5);
      light.position.set(x, 2.5, -5.4);
      this.scene.add(light);
    }
    // A string of little bulbs sagging across the back between the posts.
    const bulb = new T.SphereGeometry(0.11, 10, 8),
      tones = ["#ffd36a", "#ff8f6a", "#9fe0ff", "#b6ff8a"].map((c) => this.standard({ color: c, emissive: c, emissiveIntensity: 2.4 }));
    for (let k = 0; k <= 24; k++) {
      const t = k / 24,
        x = -8.6 + 17.2 * t;
      this.add(bulb, tones[k % 4], x, 3.2 - Math.sin(Math.PI * t) * 1.1, -6.2).castShadow = false;
    }
    // Pines against the sky.
    const pine = this.standard({ color: "#16261f", roughness: 1 });
    for (let k = 0; k < 9; k++) {
      const x = -15 + k * 3.8 + Math.sin(k * 2.1) * 0.8,
        h = 5 + (k % 3) * 1.4;
      this.add(new T.ConeGeometry(1.4 + (k % 2) * 0.4, h, 8), pine, x, -1.75 + h / 2, -11 - (k % 2) * 2).castShadow = false;
    }
  }
  protected subject(): TableSubject {
    return L.SUBJECT;
  }
  protected arrange(s: State) {
    const poses = new Map<number, CardPose>(),
      mine = myHand(s),
      shown = s.phase === "scored" || s.winner !== null;
    mine.forEach((id, i) => {
      const up = s.picked.includes(id);
      poses.set(id, { x: handX(i, mine.length), y: 0.05 + i * 0.002 + (up ? 0.06 : 0), z: L.HAND_Z - (up ? L.LIFT : 0), up: true });
    });
    for (let seat = 1; seat < s.players; seat++) {
      const theirs = s.hands[seat],
        place = placeOf(s.players, seat);
      theirs.forEach((id, i) => poses.set(id, { ...rivalCard(place, i, theirs.length), y: 0.04 + i * 0.002, up: shown, s: 0.8 }));
    }
    // Everyone's melds, in front of whoever laid them.
    for (let seat = 0; seat < s.players; seat++) {
      const place = placeOf(s.players, seat),
        own = s.melds.filter((m) => m.owner === seat),
        spots = meldSpots(place, own.map((m) => m.cards.length)),
        size = place === 0 || place === 2 ? 0.9 : 0.78;
      own.forEach((m, k) => m.cards.forEach((id, j) => poses.set(id, { ...spots[k][j], y: 0.04 + j * 0.004, up: true, s: size })));
    }
    s.stock.forEach((id, i) => poses.set(id, { ...L.STOCK, y: 0.04 + i * 0.01, up: false }));
    s.discard.forEach((id, i) => poses.set(id, { x: L.DISCARD.x + Math.sin(i * 2.3) * 0.06, y: 0.04 + i * 0.01, z: L.DISCARD.z + Math.cos(i * 1.7) * 0.05, up: true, turn: Math.sin(i * 1.3) * 0.22 }));
    return poses;
  }
  /** The glow under the hand of whoever is to move (not while a discard is offered: that would tell who can claim it). */
  private light(s: State) {
    this.glow.visible = s.winner === null && s.phase !== "scored" && (s.phase !== "claim" || s.seat === 0);
    const place = placeOf(s.players, s.seat),
      n = Math.max(1, s.hands[s.seat].length);
    if (place === 0) {
      this.glow.position.set(0, 0.02, L.HAND_Z);
      this.glow.scale.set(Math.min(10.5, n * 0.85 + 2), 1, 2.4);
    } else if (place === 2) {
      this.glow.position.set(0, 0.02, L.RIVAL_Z);
      this.glow.scale.set(Math.min(7.6, n * 0.55 + 2), 1, 2.2);
    } else {
      this.glow.position.set(place === 1 ? -L.SIDE_X : L.SIDE_X, 0.02, 0);
      this.glow.scale.set(2.2, 1, Math.min(6, n * 0.45 + 2));
    }
  }
  /** The board over the table once a round is over: each player's hand total and what it won or paid. */
  private tellResult(s: State) {
    const r = s.phase === "scored" ? s.result : null,
      text = r ? JSON.stringify([s.round, r.gains, r.hula, r.dry]) : "";
    this.board.mesh.visible = !!r;
    if (!r || text === this.board.said) return;
    this.board.said = text;
    const ctx = this.board.canvas.getContext("2d")!,
      w = 512,
      h = 256;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(18, 24, 36, 0.88)";
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 26);
    ctx.fill();
    ctx.strokeStyle = r.hula ? "#ffcf4a" : "#c9d6ee";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = r.hula ? "#ffcf4a" : "#ffffff";
    ctx.font = '800 38px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    ctx.fillText(r.hula ? `${s.round}판 · 훌라!` : r.dry ? `${s.round}판 · 더미 끝` : `${s.round}판 결과`, w / 2, 50);
    ctx.font = '700 27px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    const rows = s.players,
      gap = Math.min(44, 150 / rows);
    for (let p = 0; p < rows; p++) {
      const y = 104 + p * gap,
        g = r.gains[p];
      ctx.fillStyle = p === r.winner ? "#ffe27a" : "#dfe6f2";
      ctx.textAlign = "left";
      ctx.fillText(`${nameOf(s, p)}${p === r.winner ? " ★" : ""}`, 48, y);
      ctx.textAlign = "right";
      ctx.fillText(`${r.totals[p]}점 남음   ${g > 0 ? "+" : ""}${g}`, w - 48, y);
    }
    this.board.texture.needsUpdate = true;
  }
  protected place(s: State) {
    super.place(s);
    this.light(s);
    this.tellResult(s);
    this.tell(s);
  }
  /** What the canvas tells a browser test without telling a hidden card: cards in each hand, melds, picks, the phase. */
  private tell(s: State) {
    const el = this.renderer.domElement;
    el.dataset.phase = s.phase;
    el.dataset.seat = String(s.seat);
    el.dataset.hands = s.hands.map((h) => h.length).join(",");
    el.dataset.melds = String(s.melds.length);
    el.dataset.picked = String(s.picked.length);
    // My own hand, in the order it lies (mine to see), and the top of the discard pile (everyone's to see).
    el.dataset.mine = myHand(s).join(",");
    el.dataset.top = String(s.discard.at(-1) ?? -1);
    el.dataset.round = String(s.round);
    el.dataset.scores = s.scores.join(",");
    // The computers' cards are never face up before a round is over.
    el.dataset.open = String(s.phase === "scored" || s.winner !== null ? -1 : 0);
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s) return [];
    const mine = myHand(s),
      out: Spot[] = mine.map((id, i) => ({ x: handX(i, mine.length), y: 0.06, z: L.HAND_Z - (s.picked.includes(id) ? L.LIFT : 0), r: 0.4, point: id }));
    out.push({ ...L.STOCK, y: 0.2, r: 0.7, point: STOCK });
    out.push({ ...L.DISCARD, y: 0.2, r: 0.7, point: s.phase === "meld" ? DISCARD : THANK });
    s.melds.forEach((m, i) => m.cards.forEach((id) => {
      const pose = this.poses.get(id);
      if (pose) out.push({ x: pose.x, y: 0.06, z: pose.z, r: 0.42, point: MELD_BASE + i });
    }));
    out.push({ ...registerSpot(s), y: 0.06, r: 0.55, point: REGISTER });
    return out;
  }
  protected animate(before: State, s: State) {
    // A card picked up or put back, or the hand sorted, is laid at once: quick taps are never held back by a tween.
    if (s.ply === before.ply) return false;
    const moved = s.last?.cards ?? [];
    const flew = this.shift(before, s, (id) => (moved.includes(id) ? -1 : 50), 70);
    this.light(s);
    this.tellResult(s);
    this.tell(s);
    return flew;
  }
  protected mark(marks: Marks) {
    const s = this.state,
      mine = s && s.seat === 0 && s.phase !== "scored" && !this.animating;
    // Green under what the picked cards can go to: a meld they fit, the pile to discard or 땡큐 on, my meld row.
    const lit: { x: number; z: number; y: number }[] = [];
    if (mine && s.picked.length) {
      for (const p of marks.targets) {
        if (p >= MELD_BASE) s.melds[p - MELD_BASE]?.cards.forEach((id) => this.poses.has(id) && lit.push(this.poses.get(id)!));
        else if (p === DISCARD || p === THANK) lit.push({ ...L.DISCARD, y: 0.05 + s.discard.length * 0.01 });
        else if (p === REGISTER) lit.push({ ...registerSpot(s), y: 0.04 });
      }
    }
    this.rings.forEach((ring, i) => {
      const at = lit[i];
      ring.visible = !!at;
      if (at) ring.position.set(at.x, at.y - 0.012, at.z);
    });
    const point = marks.cursor,
      cursor =
        point === null
          ? undefined
          : point === STOCK
            ? { ...L.STOCK }
            : point === DISCARD || point === THANK
              ? { ...L.DISCARD }
              : point === REGISTER && s
                ? registerSpot(s)
                : point >= MELD_BASE && s
                  ? this.poses.get(s.melds[point - MELD_BASE]?.cards[0] ?? -1)
                  : this.poses.get(point);
    this.cursor.visible = !!cursor;
    if (cursor) this.cursor.position.set(cursor.x, 0.03, cursor.z + (point !== null && point < 52 ? -CARD_H * 0.62 : 0));
  }
}
