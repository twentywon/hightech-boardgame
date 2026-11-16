import * as T from "three";
import { block, glossy } from "../../engine/scene-utils";
import { souk } from "../../engine/scenery";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { ACCUSE, DOWN, GOODS, SET, SPICES, UP, WEIGH, WEIGHT, hung, isLeaf, lean, onPans, panWeight, reach, rods, shownLeaves, type Kind, type State } from "./rules";
import { BIG, MOBILE, SMALL, TABLE, coinRest, goodsDial, hang, mobileDial, panPlace, smallAt, subjectOf, weightRest } from "./layout";

export const BALANCE_COLORS: [string, string] = ["#c9a24a", "#22355c"];
const UPWARD = new T.Vector3(0, 1, 0);
/** How far a beam or a rod leans for a difference in weight (or turning force): a little for any, more for more, up to a limit. */
const tilt = (diff: number, scale = 1) => (diff === 0 ? 0 : Math.sign(diff) * Math.min(0.26, 0.06 + Math.abs(diff) * 0.012 * scale));
/** A balance scale: a turned brass foot and pillar, a beam with a pointer, and two pans hanging from it on three chains each. */
interface Balance {
  root: T.Group;
  beam: T.Group;
  pans: [T.Group, T.Group];
  /** Its height to the pivot, half its beam, its chains and its pans' radius. */
  H: number;
  L: number;
  C: number;
  R: number;
}
/** A painted label: a number or a word on a small card. */
function label(text: string, w: number, h: number, colour = "#2a1d14", ground = "#f3e9d2", font = 900) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${font} ${Math.round(h * 0.62)}px "Inter", "Noto Sans KR", sans-serif`;
  ctx.fillText(text, w / 2, h / 2 + h * 0.04);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/**
 * The balance quiz on a market table in a bazaar: a big brass scale for the coins and the weights, a row of small
 * scales for the goods, and a mobile hanging from the stall's beam; every beam and rod leans as the weights on it say.
 */
export class BalanceView extends TableView<State> {
  private world = new T.Group();
  private built = -1;
  private kind: Kind = "coins";
  private scales: Balance[] = [];
  /** Coins, weights or goods that move between table and pan, by index. */
  private items: T.Object3D[] = [];
  /** The dials: their number tile (repainted when the value changes), and the canvas each is painted on. */
  private tiles: { mesh: T.Mesh; canvas: HTMLCanvasElement; texture: T.CanvasTexture; value: number }[] = [];
  private mobileParts: { rods: T.Group[]; rodThreads: T.Mesh[]; leaves: T.Group[]; leafThreads: T.Mesh[] } = { rods: [], rodThreads: [], leaves: [], leafThreads: [] };
  /** The angles shown now, for the next animation to start from. */
  private angles: number[] = [];
  private log: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string } | null = null;
  private arrow: T.Group;
  private cursor: T.Mesh;
  private ring: T.Mesh;
  private target: T.Sprite;
  private marks2: Marks = { movable: [], selected: null, targets: [], removable: [], cursor: null };
  private brass: T.MeshStandardMaterial;
  private dark: T.MeshStandardMaterial;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e6d6b8");
    this.scene.add(new T.HemisphereLight("#fff3df", "#7a5a3a", 1.7));
    const sun = new T.DirectionalLight("#ffe8c4", 2.2);
    sun.position.set(-8, 16, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -12;
    sun.shadow.camera.right = sun.shadow.camera.top = 12;
    sun.shadow.camera.far = 60;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    souk(this.scene, own, TABLE.half, TABLE.depth);
    this.brass = this.own(glossy({ color: "#c9a24a", roughness: 0.32, metalness: 0.85 }, 0.3));
    this.dark = this.standard({ color: "#2a1d14", roughness: 0.6 });
    this.scene.add(this.world);
    // The hint: a gold arrow pointing down at what to press, a ring, and a gold number for a dial.
    this.arrow = new T.Group();
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffbf1f" }));
    this.arrow.add(new T.Mesh(this.own(new T.ConeGeometry(0.22, 0.5, 16).rotateX(Math.PI)), gold));
    const stem = new T.Mesh(this.own(new T.CylinderGeometry(0.07, 0.07, 0.5, 10)), gold);
    stem.position.y = 0.45;
    this.arrow.add(stem);
    this.arrow.visible = false;
    this.ring = ringMesh(own, 0.46, 0.56, "#ffbf1f");
    this.cursor = ringMesh(own, 0.42, 0.5, "#ffffff");
    this.target = new T.Sprite(this.own(new T.SpriteMaterial({ transparent: true, depthTest: false })));
    this.target.scale.set(1.0, 0.6, 1);
    this.target.renderOrder = 12;
    this.target.visible = false;
    this.scene.add(this.arrow, this.ring, this.cursor, this.target);
    this.begin();
  }
  /** How far the mobile reaches either way, for the view to fit it. */
  private wide = 6;
  protected subject(): TableSubject {
    const subject = subjectOf(this.kind);
    return this.kind === "mobile" ? { ...subject, half: this.wide + 0.9 } : subject;
  }
  private part(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material | T.Material[], x = 0, y = 0, z = 0) {
    const mesh = new T.Mesh(this.own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** A brass balance of `size` (1 the big one) standing at `x`, `z`; `narrow` shortens its beam. */
  private balance(x: number, z: number, size: number, narrow = 1): Balance {
    const root = new T.Group(),
      H = BIG.height * size,
      L = BIG.beam * size * narrow,
      C = BIG.chain * size,
      R = BIG.pan * size,
      brass = this.brass;
    this.part(root, new T.LatheGeometry([[0, 0], [0.95, 0], [0.95, 0.12], [0.62, 0.22], [0.3, 0.38], [0.16, 0.6]].map(([r, h]) => new T.Vector2(r * size, h * size)), 32), brass);
    this.part(root, new T.CylinderGeometry(0.11 * size, 0.15 * size, H - 0.5 * size, 16), brass, 0, 0.5 * size + (H - 0.5 * size) / 2);
    this.part(root, new T.SphereGeometry(0.16 * size, 14, 10), brass, 0, H + 0.22 * size);
    const beam = new T.Group();
    beam.position.y = H;
    this.part(beam, new T.CylinderGeometry(0.07 * size, 0.07 * size, 2 * L, 12).rotateZ(Math.PI / 2), brass);
    for (const side of [-1, 1]) this.part(beam, new T.SphereGeometry(0.12 * size, 12, 8), brass, side * L);
    this.part(beam, new T.CylinderGeometry(0.025 * size, 0.04 * size, 0.9 * size, 8), this.dark, 0, -0.5 * size);
    root.add(beam);
    const pans: T.Group[] = [];
    const chain = this.own(new T.CylinderGeometry(0.012 * size, 0.012 * size, 1, 5));
    for (let side = 0; side < 2; side++) {
      const pan = new T.Group();
      this.part(pan, new T.LatheGeometry([[0, 0], [R * 0.55, 0.02 * size], [R * 0.92, 0.14 * size], [R, 0.22 * size]].map(([r, h]) => new T.Vector2(r, h)), 36), this.own(glossy({ color: "#c9a24a", roughness: 0.3, metalness: 0.85, side: T.DoubleSide }, 0.3)));
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI * 2) / 3 + 0.5,
          foot = new T.Vector3(Math.cos(a) * R * 0.96, 0.22 * size, Math.sin(a) * R * 0.96),
          top = new T.Vector3(0, C, 0),
          link = new T.Mesh(chain, this.dark);
        link.position.copy(foot).add(top).multiplyScalar(0.5);
        link.scale.y = foot.distanceTo(top);
        link.quaternion.setFromUnitVectors(UPWARD, top.clone().sub(foot).normalize());
        pan.add(link);
      }
      root.add(pan);
      pans.push(pan);
    }
    root.position.set(x, 0, z);
    this.world.add(root);
    const made: Balance = { root, beam, pans: pans as [T.Group, T.Group], H, L, C, R };
    this.lean(made, 0);
    return made;
  }
  /** Turns a scale's beam (positive: the left pan down) and hangs the pans from its ends. */
  private lean(b: Balance, angle: number) {
    const { L, C, H } = b;
    b.beam.rotation.z = angle;
    b.pans.forEach((pan, side) => {
      const s = side === 0 ? -1 : 1;
      pan.position.set(s * L * Math.cos(angle), H + s * L * Math.sin(angle) - C, 0);
    });
  }
  /** A coin: gold with its number struck on both faces. */
  private coin(n: number) {
    const face = this.standard({ map: this.own(label(String(n + 1), 128, 128, "#6a4a12", "#e2b84a")), roughness: 0.35, metalness: 0.6 }),
      rim = this.standard({ color: "#c79a32", roughness: 0.35, metalness: 0.7 });
    return this.part(this.world, new T.CylinderGeometry(0.33, 0.33, 0.1, 28), [rim, face, face]);
  }
  /** A brass weight in the shape of a bell, its value on its top and, with `card`, on a small card standing on it; larger for heavier. */
  private weight(value: number, scale = 1, card = true) {
    const g = new T.Group(),
      r = (0.24 + Math.min(value, 20) * 0.012) * scale,
      h = (0.34 + Math.min(value, 20) * 0.02) * scale;
    this.part(g, new T.CylinderGeometry(r * 0.9, r, h, 24), [this.brass, this.standard({ map: this.own(label(String(value), 128, 128, "#3a2410", "#d8b25a")), roughness: 0.35, metalness: 0.6 }), this.brass], 0, h / 2);
    this.part(g, new T.SphereGeometry(r * 0.35, 12, 8), this.brass, 0, h + r * 0.25);
    if (card) {
      // The value large on a card standing on the knob, turned up toward the eye, so that it can be read from afar.
      const tag = this.part(g, new T.PlaneGeometry(0.66 * scale, 0.44 * scale), this.standard({ map: this.own(label(String(value), 160, 106, "#3a2410", "#f6edd6")), roughness: 0.7, side: T.DoubleSide }), 0, h + r * 0.4 + 0.26 * scale, 0);
      tag.rotation.x = -0.55;
      tag.castShadow = false;
    }
    this.world.add(g);
    return g;
  }
  /** One of the goods, modelled: pomegranate, lemon, fig or cucumber. */
  private goods(kind: number, scale = 1) {
    const g = new T.Group(),
      s = scale;
    if (kind === 0) {
      this.part(g, new T.SphereGeometry(0.3 * s, 20, 14), this.standard({ color: "#a8202c", roughness: 0.45 }), 0, 0.28 * s).scale.set(1, 0.92, 1);
      this.part(g, new T.CylinderGeometry(0.06 * s, 0.1 * s, 0.14 * s, 6), this.standard({ color: "#7a1a20", roughness: 0.6 }), 0, 0.58 * s);
    } else if (kind === 1) {
      this.part(g, new T.SphereGeometry(0.24 * s, 20, 14), this.standard({ color: "#f0cc2a", roughness: 0.5 }), 0, 0.22 * s).scale.set(1.35, 0.95, 0.95);
      for (const side of [-1, 1]) this.part(g, new T.ConeGeometry(0.07 * s, 0.12 * s, 10).rotateZ((-side * Math.PI) / 2), this.standard({ color: "#e8c020", roughness: 0.5 }), side * 0.36 * s, 0.22 * s);
    } else if (kind === 2) {
      this.part(g, new T.LatheGeometry([[0, 0], [0.2, 0.04], [0.26, 0.2], [0.2, 0.38], [0.08, 0.5], [0.03, 0.58]].map(([r, h]) => new T.Vector2(r * s, h * s)), 20), this.standard({ color: "#5a2a5a", roughness: 0.5 }));
    } else {
      this.part(g, new T.CapsuleGeometry(0.13 * s, 0.6 * s, 8, 14).rotateZ(Math.PI / 2), this.standard({ color: "#3f7a3a", roughness: 0.55 }), 0, 0.14 * s);
    }
    this.world.add(g);
    return g;
  }
  /** A number tile for a dial, painted afresh when its value changes. */
  private tile(parent: T.Object3D, x: number, y: number, z: number, upright: boolean) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 96;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const face = this.standard({ map: texture, roughness: 0.5 }),
      edge = this.standard({ color: "#6a4a2a", roughness: 0.6 }),
      mesh = this.part(parent, block(0.9, 0.16, 0.68, 0.05), [edge, edge, face, edge, edge, edge], x, y, z);
    if (upright) mesh.rotation.x = Math.PI / 2;
    const made = { mesh, canvas, texture, value: -1 };
    this.tiles.push(made);
    return made;
  }
  private paintTile(t: (typeof this.tiles)[number], value: number) {
    if (t.value === value) return;
    t.value = value;
    const ctx = t.canvas.getContext("2d")!;
    ctx.fillStyle = "#f6edd6";
    ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = "#3a2410";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '900 64px "Inter", "Noto Sans KR", sans-serif';
    ctx.fillText(String(value), 64, 52);
    t.texture.needsUpdate = true;
  }
  /** A small triangle pointing up or down the dial. */
  private arrowhead(parent: T.Object3D, x: number, y: number, z: number, up: boolean, upright: boolean) {
    const shape = new T.Shape();
    shape.moveTo(-0.22, 0);
    shape.lineTo(0.22, 0);
    shape.lineTo(0, 0.26);
    shape.closePath();
    const mesh = this.part(parent, new T.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), this.standard({ color: "#8a5a2a", roughness: 0.5 }), x, y, z);
    if (upright) mesh.rotation.z = up ? 0 : Math.PI;
    else mesh.rotation.set(-Math.PI / 2, 0, up ? 0 : Math.PI);
    return mesh;
  }
  /** Lays the table out afresh for a new puzzle. */
  private build(s: State) {
    for (const child of [...this.world.children]) this.world.remove(child);
    this.scales = [];
    this.items = [];
    this.tiles = [];
    this.mobileParts = { rods: [], rodThreads: [], leaves: [], leafThreads: [] };
    this.log = null;
    this.angles = [];
    this.kind = s.kind;
    this.built = s.key;
    if (s.kind === "coins" || s.kind === "weights") {
      this.scales.push(this.balance(BIG.x, BIG.z, 1));
      if (s.kind === "coins") {
        for (let i = 0; i < s.coins; i++) this.items.push(this.coin(i));
        // A sheet of paper at the right where the weighings are written down.
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 640;
        const texture = this.own(new T.CanvasTexture(c));
        texture.colorSpace = T.SRGBColorSpace;
        // It stands on a little easel, leaning back toward the eye.
        const lean = 0.8,
          sheet = this.part(this.world, new T.PlaneGeometry(3.2, 4.0), this.standard({ map: texture, roughness: 0.9 }), 6.15, 2.0 * Math.cos(lean), -0.25);
        sheet.rotation.set(-lean, -0.12, 0);
        const board = this.part(sheet, new T.BoxGeometry(3.4, 4.2, 0.08), this.standard({ color: "#7a4a2a", roughness: 0.6 }), 0, 0, -0.05);
        board.castShadow = true;
        this.log = { canvas: c, texture, said: "" };
      } else {
        // The parcel on the left pan: a sack of spice tied at the neck, its weight on a tag.
        const [name, colour] = SPICES[s.spice],
          sack = new T.Group(),
          cloth = this.standard({ color: "#d9c49a", roughness: 1 });
        this.part(sack, new T.SphereGeometry(0.55, 18, 14), cloth, 0, 0.5).scale.set(1, 0.95, 1);
        this.part(sack, new T.CylinderGeometry(0.2, 0.32, 0.35, 14), cloth, 0, 1.05);
        this.part(sack, new T.ConeGeometry(0.34, 0.3, 16), this.standard({ color: colour, roughness: 1 }), 0, 1.3);
        const tag = this.part(sack, new T.PlaneGeometry(1.5, 0.62), this.standard({ map: this.own(label(`${name} ${s.load}g`, 300, 124, "#3a2410", "#f6edd6", 800)), roughness: 0.8, side: T.DoubleSide }), 0, 1.75, 0.15);
        tag.rotation.x = -0.55;
        this.scales[0].pans[0].add(sack);
        sack.position.y = 0.22;
        // The weights in a tray in front.
        const tray = this.part(this.world, block(s.weights.length * 1.35 + 0.6, 0.16, 1.4, 0.06), this.standard({ color: "#7a4a2a", roughness: 0.6 }), 0, 0.08, weightRest(0, 1).z);
        tray.castShadow = false;
        s.weights.forEach((w) => this.items.push(this.weight(w)));
      }
    } else if (s.kind === "goods") {
      s.scales.forEach((sc, i) => {
        const at = smallAt(i, s.scales.length),
          b = this.balance(at.x, at.z, SMALL, 0.78);
        this.scales.push(b);
        sc.left.concat(sc.right).forEach((item, k) => {
          const side = k < sc.left.length ? 0 : 1,
            j = side === 0 ? k : k - sc.left.length,
            n = side === 0 ? sc.left.length : sc.right.length,
            thing = item >= WEIGHT ? this.weight(item - WEIGHT, 0.8) : this.goods(item, 1.0),
            ring = n === 1 ? 0 : 0.36,
            a = (j / n) * Math.PI * 2 + 0.4;
          b.pans[side].add(thing);
          thing.position.set(Math.cos(a) * ring, 0.16, Math.sin(a) * ring);
        });
      });
      // The dials in front: the goods on a plate, the number, and ▲ ▼.
      const plate = this.standard({ color: "#f2ede2", roughness: 0.4 });
      s.guess.forEach((_, i) => {
        const at = goodsDial(i, s.guess.length);
        this.part(this.world, new T.CylinderGeometry(0.62, 0.55, 0.08, 28), plate, at.good.x, 0.04, at.good.z);
        const thing = this.goods(i, 1.15);
        thing.position.set(at.good.x, 0.08, at.good.z);
        this.tile(this.world, at.tile.x, 0.08, at.tile.z, false);
        this.arrowhead(this.world, at.up.x, 0.05, at.up.z + 0.13, true, false);
        this.arrowhead(this.world, at.down.x, 0.05, at.down.z - 0.13, false, false);
      });
    } else if (s.mobile) {
      // The stall's beam the mobile hangs from, on two posts.
      const timber = this.standard({ color: "#6a4a2c", roughness: 0.7 });
      this.part(this.world, new T.BoxGeometry(15.4, 0.35, 0.35), timber, 0, MOBILE.beam, -0.6);
      for (const x of [-7.6, 7.6]) this.part(this.world, new T.BoxGeometry(0.35, MOBILE.beam + 0.2, 0.35), timber, x, MOBILE.beam / 2, -0.6);
      const thread = this.own(new T.CylinderGeometry(0.015, 0.015, 1, 5)),
        cord = this.standard({ color: "#3a2a1a", roughness: 0.9 });
      const all = rods(s.mobile),
        [left, right] = reach(s.mobile);
      this.wide = Math.max(left, right) * MOBILE.unit;
      all.forEach((rod) => {
        const g = new T.Group();
        this.part(g, new T.CylinderGeometry(0.05, 0.05, (rod.a + rod.b) * MOBILE.unit, 10).rotateZ(Math.PI / 2), this.brass, ((rod.b - rod.a) * MOBILE.unit) / 2);
        for (const x of [-rod.a * MOBILE.unit, rod.b * MOBILE.unit, 0]) this.part(g, new T.SphereGeometry(0.09, 10, 8), this.brass, x);
        // Marks along the rod at every step, so that the arms can be counted.
        for (let k = -rod.a; k <= rod.b; k++) if (k) this.part(g, new T.CylinderGeometry(0.065, 0.065, 0.03, 10).rotateZ(Math.PI / 2), this.dark, k * MOBILE.unit);
        this.world.add(g);
        this.mobileParts.rods.push(g);
        const t = new T.Mesh(thread, cord);
        this.world.add(t);
        this.mobileParts.rodThreads.push(t);
      });
      s.leaves.forEach((w, i) => {
        const g = new T.Group(),
          hiddenAt = s.hidden.indexOf(i);
        if (hiddenAt < 0) {
          const body = this.weight(w, 1.45, false);
          this.world.remove(body);
          g.add(body);
          body.position.y = -0.45;
          const card = this.part(g, new T.PlaneGeometry(0.8, 0.5), this.standard({ map: this.own(label(String(w), 128, 80, "#3a2410", "#f6edd6")), roughness: 0.6 }), 0, -0.05, (0.26 + Math.min(w, 20) * 0.012) * 1.45 + 0.08);
          card.castShadow = false;
        } else {
          // A sack of unknown weight with a dial before it.
          this.part(g, new T.SphereGeometry(0.5, 18, 14), this.standard({ color: "#d9c49a", roughness: 1 }), 0, -0.05).scale.set(1, 1.1, 0.9);
          this.part(g, new T.ConeGeometry(0.22, 0.32, 12).rotateX(Math.PI), this.standard({ color: "#c8b48a", roughness: 1 }), 0, 0.52);
          this.tile(g, 0, 0, 0.62, true);
          this.arrowhead(g, 0, 0.42, 0.6, true, true);
          this.arrowhead(g, 0, -0.42, 0.6, false, true);
        }
        this.world.add(g);
        this.mobileParts.leaves.push(g);
        const t = new T.Mesh(thread, cord);
        this.world.add(t);
        this.mobileParts.leafThreads.push(t);
      });
    }
    this.resize();
  }
  /** How every beam or rod leans in a state. */
  private anglesOf(s: State): number[] {
    if (s.kind === "coins") {
      // The beam is held level until the pans are weighed; it shows the last weighing while the coins on it are as they were.
      const last = s.log[s.log.length - 1],
        now = onPans(s),
        same = last && last.left.join() === now.left.join() && last.right.join() === now.right.join();
      return [same ? last.tip * 0.2 : 0];
    }
    if (s.kind === "weights") {
      const left = s.load + s.weights.reduce((sum, w, i) => sum + (s.pans[i] === 1 ? w : 0), 0),
        right = s.weights.reduce((sum, w, i) => sum + (s.pans[i] === 2 ? w : 0), 0);
      return [tilt(left - right)];
    }
    if (s.kind === "goods") return s.scales.map((sc) => tilt(panWeight(sc.left, s.guess) - panWeight(sc.right, s.guess)));
    if (!s.mobile) return [];
    const w = shownLeaves(s);
    return rods(s.mobile).map((rod) => tilt(lean(rod, w), 0.25));
  }
  /** Where a coin or weight lies, on the table or on a pan, with the beam turned as given. */
  private itemAt(s: State, i: number, angle: number) {
    const b = this.scales[0];
    if (s.pans[i] === 0) {
      const rest = s.kind === "coins" ? coinRest(i, s.coins) : weightRest(i, s.weights.length);
      return new T.Vector3(rest.x, s.kind === "coins" ? 0.05 : 0.16, rest.z);
    }
    this.lean(b, angle);
    const side = s.pans[i] - 1,
      order = s.pans.slice(0, i).filter((p) => p === s.pans[i]).length,
      spot = panPlace(order, s.kind === "coins" ? 0.62 : 0.6),
      pan = b.pans[side].position;
    return new T.Vector3(BIG.x + pan.x + spot.x, pan.y + 0.24 + spot.y * (s.kind === "coins" ? 0.11 : 0.5), BIG.z + pan.z + spot.z);
  }
  /** Lays everything out with the beams and rods at `angles`, the items where `moving` puts them (or where the state has them). */
  private lay(s: State, angles: number[], moving: Map<number, T.Vector3> = new Map()) {
    this.angles = angles;
    if (s.kind === "coins" || s.kind === "weights") {
      this.items.forEach((item, i) => item.position.copy(moving.get(i) ?? this.itemAt(s, i, angles[0])));
      this.lean(this.scales[0], angles[0]);
    } else if (s.kind === "goods") this.scales.forEach((b, i) => this.lean(b, angles[i] ?? 0));
    else if (s.mobile) {
      const laid = hang(s.mobile, angles, s.leaves.length),
        threadTo = (mesh: T.Mesh, a: { x: number; y: number }, b: { x: number; y: number }) => {
          mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
          mesh.scale.y = Math.max(0.01, Math.hypot(a.x - b.x, a.y - b.y));
        };
      laid.rods.forEach((r, i) => {
        this.mobileParts.rods[i].position.set(r.x, r.y, 0);
        this.mobileParts.rods[i].rotation.z = r.angle;
        threadTo(this.mobileParts.rodThreads[i], r.from, r);
      });
      laid.leaves.forEach((l, i) => {
        this.mobileParts.leaves[i].position.set(l.x, l.y, 0);
        threadTo(this.mobileParts.leafThreads[i], l.from, { x: l.x, y: l.y + 0.45 });
      });
    }
    // The dials show the values as they stand.
    this.tiles.forEach((t, i) => this.paintTile(t, s.guess[i] ?? 1));
    // The weighings written down.
    if (this.log) this.writeLog(s);
    // The coin found false shines; while naming one, the coins on the table are ringed.
    if (s.kind === "coins")
      this.items.forEach((coin, i) => {
        const shine = s.fake === i;
        ((coin as T.Mesh).material as T.MeshStandardMaterial[]).forEach((m) => {
          m.emissive?.set(shine ? (s.winner === 0 ? "#6a4a00" : "#6a0a00") : "#000000");
        });
        if (shine) coin.position.y += 0.35;
      });
    this.redraw();
  }
  private writeLog(s: State) {
    const lines = s.log.map((w, k) => `${k + 1}. ${w.left.map((c) => c + 1).join("·")}  대  ${w.right.map((c) => c + 1).join("·")}  →  ${w.tip === 0 ? "수평" : w.tip === 1 ? "왼쪽이 무겁다" : "오른쪽이 무겁다"}`),
      said = `${s.allowed}|${s.heavy}|${lines.join("\n")}`;
    if (!this.log || said === this.log.said) return;
    this.log.said = said;
    const ctx = this.log.canvas.getContext("2d")!;
    ctx.fillStyle = "#f4ead2";
    ctx.fillRect(0, 0, 512, 640);
    ctx.strokeStyle = "rgba(120, 90, 50, 0.25)";
    ctx.lineWidth = 2;
    for (let y = 290; y < 640; y += 150) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(488, y);
      ctx.stroke();
    }
    ctx.fillStyle = "#3a2410";
    ctx.font = '800 50px "Inter", "Noto Sans KR", sans-serif';
    ctx.fillText(`저울 기록 ${s.log.length}/${s.allowed}`, 32, 66);
    ctx.font = '700 34px "Inter", "Noto Sans KR", sans-serif';
    ctx.fillStyle = "#9a3a1a";
    ctx.fillText(s.heavy === 1 ? "가짜는 더 무겁다" : s.heavy === -1 ? "가짜는 더 가볍다" : "가짜의 무게는 모른다", 32, 120);
    ctx.fillStyle = "#2a1d14";
    s.log.forEach((w, k) => {
      const y = 150 + k * 150;
      ctx.font = '800 32px "Inter", "Noto Sans KR", sans-serif';
      const pans = `${w.left.map((c) => c + 1).join(" ")}  |  ${w.right.map((c) => c + 1).join(" ")}`;
      ctx.font = `700 ${pans.length > 26 ? 24 : 32}px "Inter", "Noto Sans KR", sans-serif`;
      ctx.fillText(`${k + 1}) ${pans}`, 24, y + 48);
      ctx.font = '800 34px "Inter", "Noto Sans KR", sans-serif';
      ctx.fillStyle = w.tip === 0 ? "#2a6a3a" : "#9a2a1a";
      ctx.fillText(`→ ${w.tip === 0 ? "수평" : w.tip === 1 ? "왼쪽이 무겁다" : "오른쪽이 무겁다"}`, 60, y + 100);
      ctx.fillStyle = "#2a1d14";
    });
    this.log.texture.needsUpdate = true;
  }
  protected place(s: State) {
    if (s.key !== this.built) this.build(s);
    this.lay(s, this.anglesOf(s));
    this.mark(this.marks2);
  }
  protected animate(before: State, s: State) {
    if (s.key !== this.built || before.key !== s.key) return false;
    const a0 = this.anglesOf(before),
      a1 = this.anglesOf(s),
      moved: { i: number; from: T.Vector3; to: T.Vector3 }[] = [];
    if (s.kind === "coins" || s.kind === "weights")
      s.pans.forEach((p, i) => {
        if (p !== before.pans[i]) moved.push({ i, from: this.itemAt(before, i, a0[0]), to: this.itemAt(s, i, a1[0]) });
      });
    const weighed = s.kind === "coins" && s.log.length > before.log.length,
      duration = weighed ? 1100 : moved.length ? 420 : 380;
    this.lay(before, a0);
    this.tween(0, duration, (p) => {
      const e = p * p * (3 - 2 * p),
        // A weighing swings past where it comes to rest and back.
        swing = weighed ? 1 - Math.cos(p * Math.PI * 2.5) * Math.exp(-p * 3.2) : e,
        angles = a1.map((x, i) => (a0[i] ?? 0) + (x - (a0[i] ?? 0)) * swing),
        lift = new Map(moved.map((m) => [m.i, m.from.clone().lerp(m.to, e).add(new T.Vector3(0, Math.sin(Math.PI * p) * 0.9, 0))]));
      this.lay(p === 1 ? s : before, angles, p === 1 ? new Map() : lift);
      if (p === 1) {
        if (moved.length || weighed) this.onContact();
      }
    });
    return true;
  }
  /** The place a press on each point counts, and where marks go. */
  private points(s: State): { point: number; at: T.Vector3; r: number }[] {
    const out: { point: number; at: T.Vector3; r: number }[] = [];
    if (s.kind === "coins" || s.kind === "weights") this.items.forEach((item, i) => out.push({ point: i, at: item.position.clone().add(new T.Vector3(0, 0.15, 0)), r: s.kind === "coins" ? 0.4 : 0.5 }));
    else if (s.kind === "goods")
      s.guess.forEach((_, i) => {
        const at = goodsDial(i, s.guess.length);
        out.push({ point: UP + i, at: new T.Vector3(at.up.x, 0.1, at.up.z), r: 0.32 }, { point: DOWN + i, at: new T.Vector3(at.down.x, 0.1, at.down.z), r: 0.32 }, { point: UP + i, at: new T.Vector3(at.tile.x, 0.16, at.tile.z), r: 0.3 });
      });
    else if (s.mobile) {
      const laid = hang(s.mobile, this.angles, s.leaves.length);
      s.hidden.forEach((leaf, i) => {
        const d = mobileDial(laid.leaves[leaf]);
        out.push({ point: UP + i, at: new T.Vector3(d.up.x, d.up.y, d.up.z), r: 0.3 }, { point: DOWN + i, at: new T.Vector3(d.down.x, d.down.y, d.down.z), r: 0.3 }, { point: UP + i, at: new T.Vector3(d.tile.x, d.tile.y, d.tile.z), r: 0.32 });
      });
    }
    return out;
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s || s.winner !== null) return [];
    return this.points(s).map(({ point, at, r }) => ({ x: at.x, y: at.y, z: at.z, r, point }));
  }
  protected mark(marks: Marks) {
    this.marks2 = marks;
    const s = this.state;
    this.arrow.visible = this.ring.visible = this.cursor.visible = this.target.visible = false;
    if (!s || capturing()) return;
    const points = this.points(s),
      find = (point: number) => points.find((p) => p.point === point);
    // The keyboard's place.
    const at = marks.cursor !== null ? find(marks.cursor) : undefined;
    if (at) {
      this.cursor.visible = true;
      this.cursor.position.copy(at.at);
      if (s.kind === "mobile") this.cursor.rotation.set(0, 0, 0);
      else this.cursor.rotation.set(-Math.PI / 2, 0, 0);
    }
    const hinted = marks.hint?.to;
    if (hinted === undefined || hinted === null || s.winner !== null) return;
    if (hinted >= SET) {
      // A dial to set: a ring round it and the number it wants above.
      const i = Math.floor((hinted - SET) / 64),
        value = (hinted - SET) % 64,
        tile = find(UP + i) && points.filter((p) => p.point === UP + i)[1];
      if (!tile) return;
      this.ring.visible = true;
      this.ring.position.copy(tile.at);
      if (s.kind === "mobile") this.ring.rotation.set(0, 0, 0);
      else this.ring.rotation.set(-Math.PI / 2, 0, 0);
      const material = this.target.material as T.SpriteMaterial;
      material.map?.dispose();
      material.map = label(`→ ${value}`, 160, 96, "#ffffff", "#c88a10");
      material.needsUpdate = true;
      this.target.visible = true;
      this.target.position.copy(tile.at).add(s.kind === "mobile" ? new T.Vector3(0.95, 0, 0.2) : new T.Vector3(0, 0.7, -0.1));
      return;
    }
    const spot = hinted === WEIGH || hinted === ACCUSE ? null : find(hinted);
    this.arrow.visible = true;
    if (spot) this.arrow.position.copy(spot.at).add(new T.Vector3(0, 0.75, 0));
    // Weigh, or name a coin: the arrow stands over the scale.
    else this.arrow.position.set(BIG.x, BIG.height + 0.9, BIG.z);
  }
  dispose() {
    (this.target.material as T.SpriteMaterial).map?.dispose();
    super.dispose();
  }
}
/** Which goods each dial stands for, for the guide and tests. */
export const DIAL_GOODS = GOODS;
export { hung, isLeaf };
