import * as T from "three";
import { block } from "../../engine/scene-utils";
import { bedroom } from "../../engine/scenery";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { DeckView, type CardPose } from "../deck/view";
import { CARD_H, SUIT_GLYPH, isJoker, rankOf, suitOf } from "../deck/cards";
import { DRAW, type State } from "./rules";
import { ONECARD as L, handX } from "./layout";

export const ONECARD_COLORS: [string, string] = ["#c8321f", "#22355c"];
/** My hand in order: by suit, then rank; the jokers at the end. */
export const sorted = (hand: number[]) => [...hand].sort((a, b) => (isJoker(a) ? 99 : suitOf(a) * 13 + rankOf(a)) - (isJoker(b) ? 99 : suitOf(b) * 13 + rankOf(b)));
/** A bed in a bedroom, the duvet for a table: my hand along the near edge, the computer's face down across, the pile and the discards between, and a sign telling the suit called and the cards owed. */
export class OneCardView extends DeckView<State> {
  private sign: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; mesh: T.Mesh; said: string };
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, 54, false);
    // On a bed in a bedroom (the user asked): warm light from a window at the left, and the bedside lamp.
    this.renderer.setClearColor("#efe4d2");
    this.scene.add(new T.HemisphereLight("#fff6ea", "#6a5a4a", 1.6));
    const sun = new T.DirectionalLight("#fff0d8", 2.0);
    sun.position.set(-10, 16, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -11;
    sun.shadow.camera.right = sun.shadow.camera.top = 11;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    const lamp = new T.PointLight("#ffd29a", 6, 14, 1.6);
    lamp.position.set(-10.5, 2.2, -5.5);
    this.scene.add(lamp);
    bedroom(this.scene, (r) => this.own(r));
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const dark = this.standard({ color: "#2a1d14", roughness: 0.5 }),
      mesh = this.add(block(1.1, 0.06, 0.55, 0.03), [dark, dark, this.standard({ map: texture, roughness: 0.5 }), dark, dark, dark], L.DISCARD.x + 1.35, 0.05, L.DISCARD.z);
    mesh.visible = false;
    this.sign = { canvas, texture, mesh, said: "" };
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 30; i++) {
      const ring = new T.Mesh(this.own(new T.PlaneGeometry(0.84, 1.2)), this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.9, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.62, 0.7, "#ffffff");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject(): TableSubject {
    return L.SUBJECT;
  }
  protected arrange(s: State) {
    const poses = new Map<number, CardPose>(),
      mine = sorted(s.hands[0]),
      theirs = s.hands[1],
      over = s.winner !== null;
    mine.forEach((id, i) => poses.set(id, { x: handX(i, mine.length), y: 0.04 + i * 0.002, z: L.HAND_Z, up: true }));
    const step = Math.min(0.5, 6.4 / Math.max(1, theirs.length));
    theirs.forEach((id, i) => poses.set(id, { x: (i - (theirs.length - 1) / 2) * step, y: 0.04 + i * 0.002, z: L.RIVAL_Z, up: over, s: 0.85 }));
    s.pile.forEach((id, i) => poses.set(id, { ...L.PILE, y: 0.04 + i * 0.012, up: false }));
    // The discards in a loose heap, each a little turned.
    s.discard.forEach((id, i) => poses.set(id, { x: L.DISCARD.x + Math.sin(i * 2.3) * 0.06, y: 0.04 + i * 0.012, z: L.DISCARD.z + Math.cos(i * 1.7) * 0.05, up: true, turn: Math.sin(i * 1.3) * 0.25 }));
    return poses;
  }
  /** Writes the suit called after a 7 and the cards an attack has piled up. */
  private say(s: State) {
    const text = `${s.suit !== null ? SUIT_GLYPH[s.suit] : ""}${s.attack ? `${s.suit !== null ? " " : ""}+${s.attack}` : ""}`;
    this.sign.mesh.visible = !!text;
    if (text === this.sign.said) return;
    this.sign.said = text;
    const ctx = this.sign.canvas.getContext("2d")!;
    ctx.fillStyle = "#f6efdc";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = s.attack ? "#c8321f" : s.suit === 1 || s.suit === 2 ? "#c8321f" : "#16181a";
    ctx.font = '900 84px "Segoe UI Symbol", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 70);
    this.sign.texture.needsUpdate = true;
  }
  protected place(s: State) {
    super.place(s);
    this.say(s);
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s) return [];
    const out: Spot[] = sorted(s.hands[0]).map((id, i) => ({ x: handX(i, s.hands[0].length), y: 0.05, z: L.HAND_Z, r: 0.42, point: id }));
    out.push({ ...L.PILE, y: 0.2, r: 0.7, point: DRAW });
    return out;
  }
  protected animate(before: State, s: State) {
    if (s.ply !== before.ply + 1 && s.phase === before.phase) return false;
    const played = s.last?.played ?? null,
      drew = s.last?.drew ?? [];
    const moved = this.shift(before, s, (id) => (id === played ? -1 : drew.includes(id) ? drew.indexOf(id) : 50), 110);
    this.say(s);
    return moved;
  }
  protected mark(marks: Marks) {
    const s = this.state,
      lit = s && s.turn === 0 && s.phase === "play" && !this.animating ? marks.targets.filter((p) => p !== DRAW) : [];
    this.rings.forEach((ring, i) => {
      const pose = lit[i] !== undefined ? this.poses.get(lit[i]) : undefined;
      ring.visible = !!pose;
      if (pose) ring.position.set(pose.x, pose.y - 0.012, pose.z);
    });
    const cursor = marks.cursor === DRAW ? { ...L.PILE, y: 0.03 } : marks.cursor !== null ? this.poses.get(marks.cursor) : undefined;
    this.cursor.visible = !!cursor;
    if (cursor) this.cursor.position.set(cursor.x, 0.03, cursor.z + (marks.cursor === DRAW ? 0 : -CARD_H * 0.62));
  }
}
