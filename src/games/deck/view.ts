import * as T from "three";
import { planks, weave, block } from "../../engine/scene-utils";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { TableView } from "../table/view";
import { BLACK_JOKER, CARD_H, CARD_W, COLOUR_JOKER, faceKey, isJoker } from "./cards";

export interface CardPose {
  x: number;
  y: number;
  z: number;
  up: boolean;
  /** Turn about the vertical axis. */
  turn?: number;
  s?: number;
  /** A card held up in a hand: its whole turn in space (face toward local +y), in place of `turn` and `up`. */
  q?: T.Quaternion;
}
const SPIN = new T.Euler();
/** A pose's turn in space, whether it is held (`q`) or lies on the table. */
export const turnOf = (pose: CardPose, out = new T.Quaternion()) => (pose.q ? out.copy(pose.q) : out.setFromEuler(SPIN.set(0, pose.turn ?? 0, pose.up ? 0 : Math.PI)));
/** A joker's face: a jester's star and the word, black or in colour. */
function jokerFace(ctx: CanvasRenderingContext2D, w: number, h: number, colour: boolean) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = colour ? "#c8321f" : "#16181a";
  ctx.lineWidth = 8;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  const tones = colour ? ["#c8321f", "#e0b020", "#2f62c0", "#2f8a4f"] : ["#16181a", "#6b6b6b", "#16181a", "#6b6b6b"];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.fillStyle = tones[i % 4];
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(a - 0.25) * 70, h / 2 + Math.sin(a - 0.25) * 70);
    ctx.lineTo(w / 2 + Math.cos(a) * 110, h / 2 + Math.sin(a) * 110);
    ctx.lineTo(w / 2 + Math.cos(a + 0.25) * 70, h / 2 + Math.sin(a + 0.25) * 70);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colour ? "#c8321f" : "#16181a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 40px "Helvetica Neue", Arial, sans-serif';
  ctx.save();
  ctx.translate(40, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("JOKER", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(w - 40, h / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("JOKER", 0, 0);
  ctx.restore();
}
/**
 * A card table on green felt with the shared pack: a mesh for every card that lies where a game's `poses` say,
 * face up or down, and flies there when a state changes. A game supplies the poses, the spots a tap can choose,
 * and what it marks.
 */
export abstract class DeckView<S> extends TableView<S> {
  protected cards: T.Mesh[] = [];
  protected poses = new Map<number, CardPose>();
  /** `felt` false leaves out the green table and its light, for a game that sets its own room. */
  constructor(host: HTMLElement, quality: "high" | "low", count: number, felt = true) {
    super(host, quality, "#14231b");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    if (felt) {
      this.daylight("#fff6e6", "#2a3a30", "#fff1da", 8, 2.1);
      this.add(new T.BoxGeometry(40, 0.4, 30), this.standard(planks(8, keep)), 0, -0.25, 0).castShadow = false;
      this.add(block(12.4, 0.12, 9.4, 0.3), this.standard({ color: "#5a3a22", roughness: 0.5 }), 0, -0.04, 0).castShadow = false;
      this.add(new T.BoxGeometry(11.8, 0.03, 8.8), this.standard({ color: "#1f6a45", roughness: 1, ...weave(4, 3, keep, 1) }), 0, 0.01, 0).castShadow = false;
    }
    const geometry = keep(new T.BoxGeometry(CARD_W, 0.014, CARD_H)),
      edge = this.standard({ color: "#e8e2d4", roughness: 0.6 }),
      back = this.standard({ map: this.paint((ctx, w, h) => drawBack(ctx, w, h)), roughness: 0.5 });
    for (let id = 0; id < count; id++) {
      const face = this.standard({ map: this.face(id), roughness: 0.45 }),
        mesh = new T.Mesh(geometry, [edge, edge, face, back, edge, edge]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      this.cards.push(mesh);
      this.scene.add(mesh);
    }
  }
  private paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = CARD.pixels;
    draw(canvas.getContext("2d")!, canvas.width, canvas.height);
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  /** A card's face; a picture that has not decoded yet is painted again once it has. */
  private face(id: number) {
    if (isJoker(id)) return this.paint((ctx, w, h) => jokerFace(ctx, w, h, id === COLOUR_JOKER));
    const texture = this.paint((ctx, w, h) => drawFace(ctx, w, h, faceKey(id))),
      canvas = texture.image as HTMLCanvasElement;
    for (const delay of [400, 1500])
      setTimeout(() => {
        if (this.disposed) return;
        drawFace(canvas.getContext("2d")!, canvas.width, canvas.height, faceKey(id));
        texture.needsUpdate = true;
        this.redraw();
      }, delay);
    return texture;
  }
  /** Where every card lies in a state (cards left out are hidden). */
  protected abstract arrange(state: S): Map<number, CardPose>;
  protected put(mesh: T.Mesh, pose: CardPose, lift = 0, flip = pose.up ? 0 : Math.PI) {
    mesh.visible = true;
    mesh.position.set(pose.x, pose.y + lift, pose.z);
    if (pose.q) mesh.quaternion.copy(pose.q);
    else mesh.rotation.set(0, pose.turn ?? 0, flip);
    mesh.scale.setScalar(pose.s ?? 1);
  }
  protected place(state: S) {
    this.poses = this.arrange(state);
    this.cards.forEach((mesh, id) => {
      const pose = this.poses.get(id);
      if (pose) this.put(mesh, pose);
      else mesh.visible = false;
    });
  }
  /** Flies one card from a pose to another, turning it over on the way when it must. */
  protected fly(id: number, a: CardPose, b: CardPose, delay: number, duration: number, heard: boolean) {
    const mesh = this.cards[id];
    // A card held in a hand, or going to one, turns the shortest way between the two.
    if (a.q || b.q) {
      const qa = turnOf(a),
        qb = turnOf(b);
      this.tween(delay, duration, (p) => {
        const e = p * p * (3 - 2 * p);
        mesh.visible = true;
        mesh.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + Math.sin(Math.PI * p) * 0.5, a.z + (b.z - a.z) * e);
        mesh.quaternion.slerpQuaternions(qa, qb, e);
        mesh.scale.setScalar((a.s ?? 1) + ((b.s ?? 1) - (a.s ?? 1)) * e);
        if (p === 1 && heard) this.onContact();
      });
      return;
    }
    this.tween(delay, duration, (p) => {
      const e = p * p * (3 - 2 * p),
        fa = a.up ? 0 : Math.PI,
        fb = b.up ? 0 : Math.PI,
        ta = a.turn ?? 0,
        tb = b.turn ?? 0;
      this.put(mesh, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e, up: b.up, turn: ta + (tb - ta) * e, s: (a.s ?? 1) + ((b.s ?? 1) - (a.s ?? 1)) * e }, Math.sin(Math.PI * p) * 0.5, fa + (fb - fa) * e);
      mesh.rotation.x = Math.sin(Math.PI * p) * 0.15;
      if (p === 1 && heard) this.onContact();
    });
  }
  /** Moves every card whose place changed, in the order `order` gives (earlier first), one after another. */
  protected shift(before: S, state: S, order: (id: number) => number = () => 0, gap = 90) {
    const from = this.arrange(before),
      to = this.arrange(state);
    this.poses = to;
    const moved = this.cards
      .map((_, id) => id)
      .filter((id) => {
        const a = from.get(id),
          b = to.get(id);
        if (!a || !b) return a !== b;
        return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.y - b.y) > 0.005 || a.up !== b.up || (a.turn ?? 0) !== (b.turn ?? 0);
      })
      .sort((x, y) => order(x) - order(y));
    if (!moved.length) return false;
    moved.forEach((id, i) => {
      const a = from.get(id),
        b = to.get(id);
      if (a && b) this.fly(id, a, b, order(id) >= 0 ? i * gap : 0, 380, i === moved.length - 1);
      else if (b) this.put(this.cards[id], b);
      else this.cards[id].visible = false;
    });
    return true;
  }
}
export const JOKERS = [BLACK_JOKER, COLOUR_JOKER];
