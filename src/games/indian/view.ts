import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { pot, type State } from "./rules";

export const CHIP_COLORS: [string, string] = ["#c8321f", "#2f62c0"];
const TABLE = 2.3,
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
  private theirs: T.Mesh;
  private mine: T.Mesh;
  private shown: T.Mesh;
  private back: T.Material;
  private chip: T.BufferGeometry;
  private paints: T.Material[];
  private chips: T.Mesh[] = [];
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
    // Its right arm (on my left) is raised to hold the card; the other rests on the table.
    limb([-1.15, 4.55, 0], [-1.5, 4.0, 0.75], 0.2);
    limb([-1.5, 4.0, 0.75], [-0.5, 5.72, 0.7], 0.17);
    part(new T.SphereGeometry(0.21, 14, 10), white, -0.42, 5.9, 0.7);
    limb([1.15, 4.55, 0], [1.45, 3.2, 0.9], 0.2);
    limb([1.45, 3.2, 0.9], [0.8, TABLE + 0.2, 2.0], 0.17);
    part(new T.SphereGeometry(0.21, 14, 10), white, 0.7, TABLE + 0.2, 2.15).scale.set(1.2, 0.6, 1.3);
    figure.position.set(0, 0, -4.6);
    this.scene.add(figure);
    // The cards: its own on its forehead, mine at the top of my view, and mine again laid down once the round is over.
    const card = this.own(new T.PlaneGeometry(CW, CH));
    this.back = this.standard({ map: this.texture((ctx, w, h) => drawBack(ctx, w, h)), roughness: 0.6 });
    this.theirs = new T.Mesh(card, this.back);
    // Against its forehead: the lower edge at the brow, the card standing up over the head.
    this.theirs.position.set(0, 6.3, -3.92);
    this.theirs.rotation.x = -0.1;
    this.theirs.scale.setScalar(0.66);
    this.theirs.castShadow = true;
    this.mine = new T.Mesh(card, this.back);
    this.shown = new T.Mesh(card, this.back);
    this.shown.rotation.x = -Math.PI / 2;
    this.shown.position.set(0, TABLE + 0.03, 2.2);
    this.scene.add(this.theirs, this.shown, this.camera);
    // Fixed before my eyes, so that it stays at the top of the view whatever the shape of the screen.
    this.mine.position.set(0, 0.7, -1.9);
    this.mine.rotation.x = 0.45;
    this.mine.scale.setScalar(0.36);
    this.camera.add(this.mine);
    this.chip = this.own(new T.CylinderGeometry(0.24, 0.24, 0.07, 22));
    this.paints = [...CHIP_COLORS, "#e0b020"].map((color) => this.standard({ color, roughness: 0.4 }));
    this.begin();
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
    return { half: aspect < 1 ? 3.0 : 4.4, halfZ: 0.6, height: 7.4, lookY: 4.7, tilt: 0.2 };
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
  protected place(state: State) {
    const showing = state.phase === "show" || state.winner !== null;
    this.theirs.material = this.face(state.cards[1]);
    // My own card stays face down until the round is decided.
    this.mine.visible = !showing;
    this.shown.visible = showing;
    if (showing) this.shown.material = this.face(state.cards[0]);
    let used = this.pile(state.chips[0], this.paints[0], -3.6, 2.6, 0);
    used = this.pile(state.chips[1], this.paints[1], 1.9, -2.6, used);
    used = this.pile(pot(state), this.paints[2], -0.8, -0.2, used);
    for (let i = used; i < this.chips.length; i++) this.chips[i].visible = false;
  }
  protected animate(before: State, state: State) {
    if (state.ply !== before.ply + 1) return false;
    this.place(state);
    // Chips clack as they are put in; a card laid down is heard too.
    this.tween(0, 260, (p) => {
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(_marks: Marks) {}
}
