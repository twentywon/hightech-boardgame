import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { pot, type State } from "./rules";

export const CHIP_COLORS: [string, string] = ["#c8321f", "#2f62c0"];
const UP = new T.Vector3(0, 1, 0),
  /** The figure's own measures, from where it sits: shoulder, the two bones of the arm, and which way the elbow points. */
  SHOULDER = new T.Vector3(-1.15, 4.55, 0),
  UPPER = 1.0,
  FORE = 2.0,
  POLE = new T.Vector3(-0.5, -0.6, 0.6),
  /** How large its card is drawn, where it lies before it is raised and where it is held, and where the hand takes it. */
  THEIRS = 1.6,
  DOWN = new T.Vector3(-0.9, 2.34, 1.95),
  HELD = new T.Vector3(0, 7.2, 0.7),
  GRIP_DOWN = new T.Vector3(0, 0.16, -0.1),
  GRIP_HELD = new T.Vector3(-0.8, -1.05, 0.02),
  TABLE = 2.3,
  /** The size of a card in the scene. */
  CW = 1.05,
  CH = CW * 1.5;
/**
 * Seen from my own seat: a white lay figure sits across the table and holds
 * its card to its forehead, face toward me. My own card is at my forehead,
 * so all I see of it is its back at the top of my view.
 */
export class IndianView extends TableView<State> {
  private faces = new Map<number, T.Material>();
  private theirs = new T.Group();
  private theirFace: T.Mesh;
  private upper: T.Mesh;
  private fore: T.Mesh;
  private elbow: T.Mesh;
  private hand: T.Mesh;
  private mine: T.Mesh;
  private shown: T.Mesh;
  private waiting: T.Mesh;
  private back: T.Material;
  private chip: T.BufferGeometry;
  private paints: T.Material[];
  private chips: T.Mesh[] = [];
  /** A small board standing by the pot that says how much lies in it. */
  private sign: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; mesh: T.Mesh; said: number };
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1a1d22");
    this.scene.add(new T.HemisphereLight("#dfe6f0", "#2a2622", 1.5));
    const lamp = new T.SpotLight("#fff3da", 3.2, 0, 0.8, 0.6, 0);
    lamp.position.set(0, 12, 2);
    lamp.target.position.set(0, TABLE, -2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    // A bare room: a dark wall behind the figure, and the table between us.
    const wall = this.add(new T.PlaneGeometry(60, 30), this.standard({ color: "#2b3038", roughness: 1 }), 0, 8, -11);
    wall.castShadow = false;
    const top = this.add(new T.BoxGeometry(11, 0.3, 9), this.standard({ map: this.own(wood(true)), roughness: 0.55 }), 0, TABLE - 0.15, 0.2);
    top.castShadow = false;
    this.add(new T.CylinderGeometry(2.6, 2.6, 0.02, 48), this.standard({ color: "#1f6a4a", roughness: 0.95 }), 0, TABLE + 0.012, -0.9).castShadow = false;
    // The figure: smooth and white, jointed like an artist's model.
    const white = this.standard({ color: "#f1f0ec", roughness: 0.55 }),
      joint = this.standard({ color: "#dcdad3", roughness: 0.6 }),
      figure = new T.Group(),
      part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => this.add(geometry, material, x, y, z, figure),
      limb = (from: [number, number, number], to: [number, number, number], radius: number) => {
        const a = new T.Vector3(...from),
          b = new T.Vector3(...to),
          mesh = part(new T.CapsuleGeometry(radius, a.distanceTo(b), 6, 14), white, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        part(new T.SphereGeometry(radius * 1.12, 14, 10), joint, ...from);
        return mesh;
      };
    part(new T.CapsuleGeometry(0.95, 1.5, 8, 20), white, 0, 3.4, 0).scale.set(1, 1, 0.62);
    part(new T.SphereGeometry(0.62, 18, 12), joint, 0, 2.3, 0).scale.set(1.35, 0.7, 0.9);
    part(new T.CylinderGeometry(0.22, 0.26, 0.5, 14), white, 0, 4.95, 0);
    part(new T.SphereGeometry(0.62, 28, 20), white, 0, 5.72, 0.02).scale.set(0.9, 1.08, 0.98);
    // Its right arm (on my left) picks the card up and holds it to the forehead: two bones that follow the hand. The other rests on the table.
    part(new T.SphereGeometry(0.225, 14, 10), joint, SHOULDER.x, SHOULDER.y, SHOULDER.z);
    this.upper = part(new T.CapsuleGeometry(0.2, UPPER, 6, 14), white, 0, 0, 0);
    this.fore = part(new T.CapsuleGeometry(0.17, FORE, 6, 14), white, 0, 0, 0);
    this.elbow = part(new T.SphereGeometry(0.2, 14, 10), joint, 0, 0, 0);
    this.hand = part(new T.SphereGeometry(0.21, 14, 10), white, 0, 0, 0);
    limb([1.15, 4.55, 0], [1.45, 3.2, 0.9], 0.2);
    limb([1.45, 3.2, 0.9], [0.8, TABLE + 0.2, 2.0], 0.17);
    part(new T.SphereGeometry(0.21, 14, 10), white, 0.7, TABLE + 0.2, 2.15).scale.set(1.2, 0.6, 1.3);
    figure.position.set(0, 0, -4.6);
    this.scene.add(figure);
    // The cards: its own on its forehead, mine at the top of my view, and mine again laid down once the round is over.
    const card = this.own(new T.PlaneGeometry(CW, CH));
    this.back = this.standard({ map: this.texture((ctx, w, h) => drawBack(ctx, w, h)), roughness: 0.6 });
    // Its card has two sides: it lies face down on the table before it is raised.
    this.theirFace = new T.Mesh(card, this.back);
    const reverse = new T.Mesh(card, this.back);
    reverse.rotation.y = Math.PI;
    reverse.position.z = -0.004;
    this.theirFace.castShadow = reverse.castShadow = true;
    this.theirs.add(this.theirFace, reverse);
    this.theirs.scale.setScalar(THEIRS);
    figure.add(this.theirs);
    this.pose(1);
    this.mine = new T.Mesh(card, this.back);
    this.shown = new T.Mesh(card, this.back);
    this.shown.rotation.x = -Math.PI / 2;
    this.shown.position.set(0, TABLE + 0.03, 1.6);
    this.shown.scale.setScalar(1.5);
    // My card as it is dealt: face down on the table before me.
    this.waiting = new T.Mesh(card, this.back);
    this.waiting.rotation.x = -Math.PI / 2;
    this.waiting.position.set(0, TABLE + 0.03, 1.6);
    this.waiting.scale.setScalar(1.5);
    this.waiting.visible = false;
    this.scene.add(this.shown, this.waiting, this.camera);
    // Fixed before my eyes, so that it stays at the top of the view whatever the shape of the screen.
    this.mine.position.set(0, 0.66, -1.9);
    this.mine.rotation.x = 0.45;
    this.mine.scale.setScalar(0.44);
    this.camera.add(this.mine);
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 160;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const board = new T.Mesh(this.own(new T.PlaneGeometry(1.8, 0.75)), this.own(new T.MeshBasicMaterial({ map: texture })));
    // On a post behind the pot, above the piles of chips, so that nothing on the table stands before it.
    board.position.set(-1.5, TABLE + 1.36, -0.9);
    board.rotation.y = 0.12;
    const dark = this.standard({ color: "#15181c", roughness: 0.6 }),
      post = new T.Mesh(this.own(new T.CylinderGeometry(0.035, 0.035, 1.0, 10)), dark),
      foot = new T.Mesh(this.own(new T.CylinderGeometry(0.26, 0.3, 0.06, 20)), dark),
      backing = new T.Mesh(this.own(new T.BoxGeometry(1.86, 0.81, 0.05)), dark);
    post.position.set(0, -0.86, -0.04);
    foot.position.set(0, -1.33, -0.04);
    backing.position.z = -0.03;
    board.add(post, foot, backing);
    this.scene.add(board);
    this.sign = { canvas, texture, mesh: board, said: -1 };
    this.chip = this.own(new T.CylinderGeometry(0.24, 0.24, 0.07, 22));
    this.paints = [...CHIP_COLORS, "#e0b020"].map((color) => this.standard({ color, roughness: 0.4 }));
    this.begin();
  }
  /** Lays a bone of the arm between two points. */
  private bone(mesh: T.Mesh, a: T.Vector3, b: T.Vector3) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  }
  /** The card and the arm that holds it, from lying on the table (0) to standing on the forehead (1). */
  private pose(p: number, faceUp = false) {
    const e = p * p * (3 - 2 * p),
      card = this.theirs.position.lerpVectors(DOWN, HELD, e);
    // It comes up in an arc, turning its face to me as it goes.
    card.y += Math.sin(Math.PI * e) * 0.35;
    card.z += Math.sin(Math.PI * e) * 0.5;
    // On the table it lies face down, or face up when it has been laid down to give the round up.
    const flat = faceUp ? -Math.PI / 2 : Math.PI / 2;
    this.theirs.rotation.x = flat + (-0.1 - flat) * e;
    const hand = card.clone().add(new T.Vector3().lerpVectors(GRIP_DOWN, GRIP_HELD, e)),
      reach = hand.clone().sub(SHOULDER),
      d = Math.min(reach.length(), UPPER + FORE - 0.02),
      along = reach.normalize(),
      a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d),
      out = POLE.clone().addScaledVector(along, -POLE.dot(along)).normalize(),
      elbow = SHOULDER.clone().addScaledVector(along, a).addScaledVector(out, Math.sqrt(Math.max(0, UPPER * UPPER - a * a))),
      wrist = SHOULDER.clone().addScaledVector(along, d);
    this.bone(this.upper, SHOULDER, elbow);
    this.bone(this.fore, elbow, wrist);
    this.elbow.position.copy(elbow);
    this.hand.position.copy(wrist);
  }
  /** The figure picks its new card up from the table and raises it to its forehead. */
  /** The figure picks its card up from the table and raises it to its forehead. */
  private lift() {
    this.pose(0);
    this.tween(180, 1100, (p) => this.pose(p));
  }
  /** It gives the round up: the card comes down from the forehead and is laid on the table, face up. */
  private layDown() {
    this.pose(1);
    this.tween(120, 900, (p) => this.pose(1 - p, true));
  }
  private texture(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = CARD.pixels;
    paint(canvas.getContext("2d")!, canvas.width, canvas.height);
    const t = this.own(new T.CanvasTexture(canvas));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  private face(value: number) {
    let material = this.faces.get(value);
    if (!material) {
      material = this.standard({ map: this.texture((ctx, w, h) => drawFace(ctx, w, h, `${value === 1 ? "A" : value}S`)), roughness: 0.6 });
      this.faces.set(value, material);
    }
    return material;
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 2.7 : 3.7, halfZ: 0.6, height: 8.9, lookY: 5.3, tilt: 0.2 };
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Piles of chips: mine near me, its own before it, the pot in the middle. */
  private pile(count: number, paint: T.Material, x: number, z: number, from: number) {
    let used = from;
    for (let i = 0; i < Math.min(count, 60); i++) {
      let mesh = this.chips[used];
      if (!mesh) {
        mesh = new T.Mesh(this.chip, paint);
        mesh.castShadow = true;
        this.chips.push(mesh);
        this.scene.add(mesh);
      }
      mesh.material = paint;
      mesh.visible = true;
      mesh.position.set(x + Math.floor(i / 10) * 0.56, TABLE + 0.05 + (i % 10) * 0.072, z);
      used++;
    }
    return used;
  }
  /** Writes the pot on the board beside it. */
  private say(amount: number) {
    if (this.sign.said === amount) return;
    this.sign.said = amount;
    const { canvas, texture } = this.sign,
      ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e0b020";
    ctx.fillRect(0, 0, 384, 160);
    ctx.fillStyle = "#15181c";
    ctx.beginPath();
    ctx.roundRect(8, 8, 368, 144, 18);
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#cfc6ae";
    ctx.font = '700 70px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    ctx.fillText("판돈", 30, 84);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd24a";
    ctx.font = '800 104px "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(String(amount), 352, 88);
    texture.needsUpdate = true;
  }
  protected place(state: State) {
    const showing = state.phase === "show" || state.winner !== null,
      ready = state.phase === "ready" && state.winner === null;
    this.theirFace.material = this.face(state.cards[1]);
    // Before the round the cards lie face down; a card given up lies face up; otherwise it is on the forehead.
    if (ready) this.pose(0);
    else if (showing && state.folded === 1) this.pose(0, true);
    else this.pose(1);
    // My own card: face down before me, then on my forehead (its back at the top of my view), then laid open.
    this.waiting.visible = ready;
    this.mine.visible = !showing && !ready;
    this.shown.visible = showing;
    if (showing) this.shown.material = this.face(state.cards[0]);
    let used = this.pile(state.chips[0], this.paints[0], -2.9, 2.6, 0);
    used = this.pile(state.chips[1], this.paints[1], 1.7, -2.6, used);
    used = this.pile(pot(state), this.paints[2], -0.8, -0.2, used);
    this.say(pot(state));
    for (let i = used; i < this.chips.length; i++) this.chips[i].visible = false;
  }
  protected animate(before: State, state: State) {
    if (state.ply !== before.ply + 1) return false;
    this.place(state);
    // The cards are raised when I say so; the figure lays its own down when it gives the round up.
    if (before.phase === "ready" && state.phase === "bet") this.lift();
    else if (before.phase === "bet" && state.phase === "show" && state.folded === 1) this.layDown();
    // Chips clack as they are put in; a card laid down is heard too.
    this.tween(0, 260, (p) => {
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(_marks: Marks) {}
}
