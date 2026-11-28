import * as T from "three";
import { canvas, glow, texture, type Own } from "../goldraid/paint";
import { compactGroup } from "../badminton/merge";
import { bakeColours } from "./bake";
import { Shade } from "./baked";
import { bark, grain, grained } from "../../engine/grain";
import { made, skin as poreRelief, smooth } from "../../engine/lifelike";
import type { Kind } from "./sim";
import { caparison, cannonBarrel, cheeks, cupola, hoof, horseBody, horseHead, horseLower, horseMane, horseNeck, horseTail, horseUpper, hull, mammothBody, mammothHead, mammothTail, mantlet, pillarLower, pillarUpper, roadWheel, spokedWheel, sprocket, tankGun, trackLoop, trunk, turretShape, tusk, tyre, tyreTank } from "./beasts";
import { boot, cuts, ellipsoid, garment, lathe, merge, rounded, slab, tube, fist, forearm, GROW, headGeometry, neck, noseGeometry, onFace, pelvis, shellGeometry, shin, thigh, torso, upperArm } from "./sculpt";

/**
 * The soldiers of 시대 전쟁, built from simple shapes (all made here, no pictures): for each era a fighter, a shooter
 * and a big one (a mammoth with its rider, a knight on a horse, a field gun with its crew, a tank). Every figure faces
 * +x (side 1's are turned round by `face`) and stands on y = 0; a person is about 1.15 m tall.
 *
 * A person is jointed: hips and knees, shoulders and elbows, a chest that leans, a head with a face (eyes, brows, nose,
 * mouth, ears). Over that each era layers its gear: fur and bone and war paint; mail, a tabard with a badge, a helm and
 * a kite shield; a coat with lapels, cross-belts, buttons and gaiters; a helmet with goggles, a vest of pouches and a
 * pack. The side's colour is on each one. A mount gallops on jointed legs (its body pitching, its head nodding, its
 * tail swinging); the field gun's wheels turn and its barrel kicks back; the tank's road wheels turn, its tracks run
 * and its gun recoils. A weapon's mouth (`muzzle`) is where the view puts its flash.
 *
 * Each kind of figure is built once (a template, its still parts baked together pivot by pivot, which keeps the draws
 * few where the processor draws) and every soldier after is a clone of it sharing its shapes and paints.
 */
export const SIDE_COLORS: [string, string] = ["#d2452b", "#2f6ed0"];
export interface Figure {
  root: T.Group;
  /** What rocks and bobs (a person's chest, a beast's or a machine's whole). */
  body: T.Group;
  /** The person's chest (leans into a blow, kicks back with a shot); for a beast, its body too. */
  chest: T.Object3D;
  /** Thighs (or a beast's upper legs) and the knees below them, by pairs. */
  legs: T.Object3D[];
  knees: T.Object3D[];
  /** Shoulders and elbows. */
  arms: T.Object3D[];
  elbows: T.Object3D[];
  /** The arm (or barrel, or neck) that strikes or recoils. */
  strike: T.Object3D | null;
  /** How it fights: a blow swung, a shot (recoil), a thrown stone, a gun's barrel kicked back, a charge. */
  style: "swing" | "shoot" | "throw" | "barrel" | "trample";
  wheels: T.Object3D[];
  /** A beast's head and tail (null for the rest), a mammoth's ears, a pennant that waves. */
  head: T.Object3D | null;
  tail: T.Object3D | null;
  flaps: T.Object3D[];
  /** Where its weapon's shot leaves (null: it strikes). */
  muzzle: T.Object3D | null;
  /** What a shooter holds (its gun or bow), kept level at the foe while it aims (null for the rest). */
  weapon: T.Object3D | null;
  /** The flash at the muzzle (hidden but for a moment after a shot). */
  flash: T.Sprite | null;
  /** The tank's track paint (its own, so that its tracks run as it goes). */
  track: T.MeshStandardMaterial | T.MeshLambertMaterial | null;
  /** The life bar over it, and the star of its rank. */
  bar: T.Mesh;
  barBack: T.Mesh;
  star: T.Object3D;
  /** The bar's height. */
  tall: number;
  /** Its stride (m a leg swing takes), for the walk. */
  stride: number;
  /** Its era and kind. */
  era: number;
  kind: Kind;
}
type Mats = Record<string, T.Material>;
/** Shared shapes and paints for the figures, and each kind's template. */
export class Kit {
  readonly g: Record<string, T.BufferGeometry> = {};
  readonly m: Mats = {};
  readonly flashMat: T.SpriteMaterial;
  /** One vertex-coloured paint for the plain parts baked together where the processor draws. */
  readonly tinted: T.Material;
  readonly blob: T.Material;
  private templates = new Map<string, Figure>();
  /**
   * How finely sculpted shapes are cut: with the lifelike look a quarter finer than the old full cut (a lane holds some
   * thirty soldiers, so not as fine as 러시안 룰렛's four), without it under half.
   */
  readonly fine: number;
  /** Blender's baked shade for the units (`baked.ts`); `blender` false builds them from the code alone. */
  readonly shade: Shade | null;
  constructor(
    readonly own: Own,
    readonly rich: boolean,
    blender = true,
  ) {
    this.shade = blender ? new Shade(own) : null;
    this.fine = rich ? 1.25 : 0.4;
    const mat = (color: string, o: T.MeshStandardMaterialParameters = {}) =>
      own(rich ? new T.MeshStandardMaterial({ color, roughness: 0.75, ...o }) : new T.MeshLambertMaterial({ color, map: o.map ?? null, emissive: (o.emissive as T.ColorRepresentation) ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1 }));
    const colors: Record<string, [string, T.MeshStandardMaterialParameters?]> = {
      skin: ["#e0ad84", { roughness: 0.6 }],
      skin2: ["#b98058", { roughness: 0.65 }],
      skin3: ["#8f5d3a", { roughness: 0.65 }],
      lip: ["#9c4a3c"],
      eye: ["#f4f1ea", { roughness: 0.3 }],
      pupil: ["#1b1612", { roughness: 0.2 }],
      hair: ["#3a2618", { roughness: 0.9 }],
      hairRed: ["#6e3418", { roughness: 0.9 }],
      beard: ["#2c1d12", { roughness: 1 }],
      fur: ["#7a5532", { roughness: 1 }],
      furDark: ["#4e3620", { roughness: 1 }],
      furLight: ["#a07a4c", { roughness: 1 }],
      hide: ["#9b7346", { roughness: 0.95 }],
      bone: ["#ece2c6", { roughness: 0.6 }],
      feather: ["#f2efe6", { roughness: 0.8 }],
      wood: ["#7b5532", { roughness: 0.85 }],
      woodDark: ["#4d331d", { roughness: 0.9 }],
      stone: ["#8d8a84", { roughness: 0.95 }],
      flint: ["#53565c", { roughness: 0.5, metalness: 0.2 }],
      iron: ["#8f969e", { metalness: 0.7, roughness: 0.38 }],
      mail: ["#7c838c", { metalness: 0.65, roughness: 0.55 }],
      steel: ["#c9d0d8", { metalness: 0.85, roughness: 0.25 }],
      dark: ["#2a2c30", { metalness: 0.5, roughness: 0.45 }],
      black: ["#16171a", { metalness: 0.6, roughness: 0.4 }],
      leather: ["#6a4426", { roughness: 0.8 }],
      leatherDark: ["#3f2a18", { roughness: 0.85 }],
      cloth: ["#d9cfb6"],
      green: ["#4f6b35"],
      hood: ["#3f5a2c"],
      white: ["#eeeae0"],
      gold: ["#d9a72c", { metalness: 0.8, roughness: 0.3 }],
      brass: ["#c19a3e", { metalness: 0.75, roughness: 0.35 }],
      bronze: ["#8a6634", { metalness: 0.8, roughness: 0.32 }],
      olive: ["#5d6a3c", { roughness: 0.8 }],
      oliveDark: ["#424c2a", { roughness: 0.85 }],
      khaki: ["#8c845c"],
      webbing: ["#6b6a46", { roughness: 0.9 }],
      glass: ["#2a3a40", { metalness: 0.4, roughness: 0.1 }],
      tusk: ["#efe6cf", { roughness: 0.5 }],
      horse: ["#6b4426", { roughness: 0.8 }],
      horseLight: ["#8a5b34", { roughness: 0.8 }],
      mane: ["#24170d"],
      rope: ["#b89b6a"],
      boot: ["#2e241c"],
      rubber: ["#1d1e20", { roughness: 0.95 }],
    };
    for (const [name, [color, o]] of Object.entries(colors)) this.m[name] = mat(color, o);
    this.m.shag = mat("#6e4b2c", { roughness: 1 });
    // With a graphics card cloth, fur, mail and hide show their stuff: pale pictures the paints' colours tint (where
    // the processor draws, the parts stay plain colours, baked together joint by joint).
    if (rich) {
      const dress = (names: string[], picture: HTMLCanvasElement, repeat: [number, number], bumpy = 0) => {
        const map = texture(own, picture, { repeat });
        for (const name of names) {
          const m = this.m[name] as T.MeshStandardMaterial;
          m.map = map;
          if (bumpy) {
            m.bumpMap = map;
            m.bumpScale = bumpy;
          }
          m.needsUpdate = true;
        }
      };
      dress(["fur", "furDark", "furLight"], pictures.fur(0), [3, 2], 1.2);
      dress(["shag"], pictures.fur(1), [9, 4], 2);
      dress(["hide", "leather", "leatherDark", "horse", "horseLight"], pictures.hide(), [2, 2], 0.4);
      dress(["mail"], pictures.mail(), [10, 6], 1.5);
      dress(["green", "hood", "cloth", "white", "khaki", "webbing"], pictures.weave(), [4, 3], 0.4);
      dress(["olive", "oliveDark"], pictures.camo(), [2, 2], 0.3);
      dress(["mane", "hair", "hairRed", "beard"], pictures.strands(), [4, 2], 0.6);
      // The lifelike look: the photographed stuffs' relief and roughness (Poly Haven, CC0) instead of the painted
      // bumps — linen for the tunics and webbing, wool for the coats, leather, steel — and pores in the skin.
      const stuff = (names: string[], kind: "wool" | "linen" | "leather" | "metal", across: number, relief = 1) => {
        const { normalMap, normalScale, roughnessMap } = made(own, kind, "#ffffff", across, across, { figure: false, relief });
        for (const name of names) {
          const m = this.m[name] as T.MeshStandardMaterial;
          m.bumpMap = null;
          m.normalMap = normalMap!;
          m.normalScale = normalScale!;
          if (kind !== "metal") m.roughnessMap = roughnessMap!;
          m.needsUpdate = true;
        }
      };
      stuff(["green", "hood", "cloth", "white", "khaki", "webbing", "olive", "oliveDark"], "linen", 3);
      stuff(["hide", "leather", "leatherDark", "boot"], "leather", 2);
      stuff(["iron", "steel", "dark", "black", "mail"], "metal", 2, 0.2);
      for (const name of ["skin", "skin2", "skin3"]) {
        const m = this.m[name] as T.MeshStandardMaterial,
          pores = poreRelief(own, m.color, 4);
        m.normalMap = pores.normalMap!;
        m.normalScale = pores.normalScale!;
        m.needsUpdate = true;
      }
    }
    // Wood is real wood (its photograph graded to the colour, with relief) where a graphics card draws; there each wooden
    // part gets its own shape with the picture laid along it (`mesh`). Where the processor draws, a figure's wood stays
    // a plain colour baked with its other plain parts (a picture would cost a draw of its own on every soldier); the
    // bases' still wood (`timber`) and the trees' bark have their pictures all the same, being few.
    const woodOf = (tone: string, kind: "light" | "dark", roughness: number) => {
      const w = grain(own, tone, { kind, rich, contrast: 2.1 });
      const m = own(rich ? new T.MeshStandardMaterial({ ...w, roughness }) : new T.MeshLambertMaterial({ color: w.color, map: w.map }));
      m.userData.grain = true;
      return m;
    };
    if (rich) {
      this.m.wood = woodOf("#8a6038", "light", 0.8);
      this.m.woodDark = woodOf("#5a3c22", "dark", 0.85);
    }
    this.m.timber = rich ? this.m.wood : woodOf("#8a6038", "light", 0.8);
    this.m.timberDark = rich ? this.m.woodDark : woodOf("#5a3c22", "dark", 0.85);
    const skin = bark(own, { around: 1, up: 2, tone: "#c7b6a2", rich });
    this.m.bark = own(rich ? new T.MeshStandardMaterial({ ...skin, roughness: 0.95 }) : new T.MeshLambertMaterial({ color: skin.color, map: skin.map }));
    // The tank's tracks: links painted along a strip (each tank gets its own copy, so its tracks run).
    const links = texture(
      own,
      canvas(64, 16, (ctx) => {
        ctx.fillStyle = "#1e1f21";
        ctx.fillRect(0, 0, 64, 16);
        for (let x = 0; x < 64; x += 8) {
          ctx.fillStyle = "#3a3c40";
          ctx.fillRect(x + 1, 1, 6, 14);
          ctx.fillStyle = "#55585e";
          ctx.fillRect(x + 2, 6, 4, 4);
        }
      }),
    );
    links.wrapS = links.wrapT = T.RepeatWrapping;
    links.repeat.set(6, 1);
    this.m.track = mat("#ffffff", { map: links, roughness: 0.9 });
    this.m.barBack = own(new T.MeshBasicMaterial({ color: "#151515", transparent: true, opacity: 0.75, depthTest: false }));
    this.m.star = own(new T.MeshBasicMaterial({ color: "#ffd84a", depthTest: false }));
    SIDE_COLORS.forEach((c, side) => {
      this.m[`team${side}`] = mat(c, { roughness: 0.6, ...(rich ? { map: texture(own, pictures.weave(), { repeat: [4, 3] }) } : {}) });
      this.m[`teamDark${side}`] = mat(new T.Color(c).multiplyScalar(0.62).getStyle(), { roughness: 0.7 });
      this.m[`teamGlow${side}`] = mat(c, { emissive: c, emissiveIntensity: 0.25 });
      this.m[`bar${side}`] = own(new T.MeshBasicMaterial({ color: side ? "#6fb0ff" : "#ff7a5a", depthTest: false }));
    });
    // The sides' coats and tabards: wool's relief where the lifelike look is drawn.
    if (rich) {
      const { normalMap, normalScale, roughnessMap } = made(own, "wool", "#ffffff", 3, 3, { figure: false });
      for (const side of [0, 1]) {
        const m = this.m[`team${side}`] as T.MeshStandardMaterial;
        Object.assign(m, { normalMap, normalScale, roughnessMap, needsUpdate: true });
      }
    }
    this.tinted = own(new T.MeshLambertMaterial({ vertexColors: true }));
    // A soft dark patch on the ground under a figure, for its shadow where the processor draws.
    this.blob = own(new T.MeshBasicMaterial({ map: glow(own, 64, 0.1), color: "#000000", transparent: true, opacity: 0.32, depthWrite: false }));
    this.flashMat = own(new T.SpriteMaterial({ map: glow(own, 64, 0.25), color: "#ffd27a", transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    const g = this.g;
    g.box = own(new T.BoxGeometry(1, 1, 1));
    // (Where the processor draws, every vertex costs: rounder shapes only with a graphics card.)
    g.ball = own(new T.SphereGeometry(1, rich ? 16 : 8, rich ? 12 : 6));
    g.ballLo = own(new T.SphereGeometry(1, 8, 6));
    /** A tiny round part (an eye, a button): a sphere with a graphics card, eight faces where the processor draws. */
    g.dot = rich ? g.ballLo : own(new T.OctahedronGeometry(1, 0));
    g.cyl = own(new T.CylinderGeometry(1, 1, 1, rich ? 12 : 7));
    g.cyl6 = own(new T.CylinderGeometry(1, 1, 1, 6));
    g.cone = own(new T.ConeGeometry(1, 1, rich ? 12 : 7));
    g.cone4 = own(new T.ConeGeometry(1, 1, 4));
    g.limb = own(new T.CylinderGeometry(1, 0.82, 1, rich ? 10 : 6, 1, !rich).translate(0, -0.5, 0));
    g.wheel = own(new T.TorusGeometry(1, 0.16, rich ? 6 : 4, rich ? 18 : 12));
    /** Half a ring: a bow's limbs, a tusk's curve. */
    g.arc = own(new T.TorusGeometry(1, 0.07, 6, 14, Math.PI));
    g.disc = own(new T.CylinderGeometry(1, 1, 1, 18));
    g.plane = own(new T.PlaneGeometry(1, 1));
    g.cap = own(new T.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    // A kite shield: a rounded top, a point below.
    const kite = new T.Shape();
    kite.moveTo(0, 0.5);
    kite.quadraticCurveTo(0.42, 0.5, 0.42, 0.18);
    kite.lineTo(0, -0.55);
    kite.lineTo(-0.42, 0.18);
    kite.quadraticCurveTo(-0.42, 0.5, 0, 0.5);
    g.kite = own(new T.ExtrudeGeometry(kite, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04));
    // A star (the rank).
    const star = new T.Shape();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + (k * Math.PI) / 5,
        r = k % 2 ? 0.42 : 1;
      if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.star = own(new T.ShapeGeometry(star));
  }
  /** A sculpted shape by name, made once (at this kit's fineness) and shared by every figure. */
  shape(name: string, make: (fine: number) => T.BufferGeometry) {
    // (With the lifelike look a shape is shaded as one smooth skin, its sharp creases kept.)
    if (!this.g[name]) this.g[name] = this.own(this.rich ? smooth(make(this.fine), 0.95) : make(this.fine));
    return name;
  }
  mesh(geometry: string, material: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: T.Object3D) {
    const paint = this.m[material],
      // Real wood: a shape of its own at its size, the grain laid along it (built once per template).
      wood = paint.userData.grain === true,
      m = new T.Mesh(wood ? this.own(grained(this.g[geometry], sx, sy, sz, 0.3)) : this.g[geometry], paint);
    m.position.set(x, y, z);
    if (!wood) m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  /** A figure for a soldier of an era, kind and side: a clone of its kind's template. */
  figure(era: number, kind: Kind, side: number): Figure {
    const key = `${era}${kind}${side}`;
    let t = this.templates.get(key);
    if (!t) this.templates.set(key, (t = build(this, era, kind, side)));
    return cloneFigure(this, t);
  }
}

let named = 0;
/** A pivot (a joint), named so that its clone can be found. */
const pivot = (parent: T.Object3D, x: number, y: number, z: number, role = "") => {
  const g = new T.Group();
  g.position.set(x, y, z);
  g.name = `${role || "p"}#${named++}`;
  parent.add(g);
  return g;
};

interface Person {
  body: T.Group;
  chest: T.Group;
  legs: T.Group[];
  knees: T.Group[];
  arms: T.Group[];
  elbows: T.Group[];
  head: T.Group;
  /** The near arm's hand (where a weapon is held), the far one's. */
  hand: T.Group;
  off: T.Group;
}
interface Dress {
  cloth: string;
  legs: string;
  sleeve?: string;
  skin?: string;
  boot?: string;
  hair?: string;
  beard?: boolean;
  scale?: number;
  sitting?: boolean;
  /** The hair's style, a moustache, gloves, the forearms' own paint (bare or a cuff), the boots' height, a stouter build. */
  style?: HairStyle;
  tache?: boolean;
  glove?: string;
  cuff?: string;
  high?: number;
  fat?: number;
  /** The shins' own paint (gaiters), if not the legs'. */
  shin?: string;
}
/** Hair, beard and the like on a head: the style's shell. */
type HairStyle = "crop" | "wild" | "none";
/**
 * A person, sculpted: legs with a thigh, a knee and a calf into boots, the hips, a torso narrowing to the waist and
 * broad at the shoulders, a neck, a head shaped with a jaw, cheekbones, sockets and a brow, eyes with their whites and
 * pupils, brows, a nose, lips, ears, hair (and a beard); arms with a shoulder, an elbow and a forearm into a closed
 * hand. `scale` for a rider. The joints are where the old blocky figure had them, so poses and gear still fit.
 */
function person(k: Kit, parent: T.Object3D, o: Dress): Person {
  const body = pivot(parent, 0, 0, 0);
  body.scale.setScalar(o.scale ?? 1);
  const skin = o.skin ?? "skin",
    one = (name: string, make: (fine: number) => T.BufferGeometry) => k.shape(name, make),
    fat = o.fat ?? 1,
    legs: T.Group[] = [],
    knees: T.Group[] = [];
  for (const z of [-0.085, 0.085]) {
    const leg = pivot(body, 0, 0.56, z, "leg");
    k.mesh(one(`thigh${fat}`, (f) => thigh(f, fat)), o.legs, 0, 0, 0, 1, 1, 1, leg);
    const knee = pivot(leg, 0, -0.28, 0, "knee");
    k.mesh(one(`shin${fat}`, (f) => shin(f, fat)), o.shin ?? o.legs, 0, 0, 0, 1, 1, 1, knee);
    k.mesh(one(`boot${o.high ?? 0.11}`, (f) => boot(f, o.high ?? 0.11)), o.boot ?? "boot", 0, 0, 0, 1, 1, 1, knee);
    if (o.sitting) {
      leg.rotation.z = Math.PI / 2.3;
      knee.rotation.z = -Math.PI / 2.2;
    }
    legs.push(leg);
    knees.push(knee);
  }
  k.mesh(one("pelvis", pelvis), o.legs, 0, 0, 0, 1, 1, 1, body);
  const chest = pivot(body, 0, 0.62, 0, "chest");
  k.mesh(one(`torso${fat}`, (f) => torso(f, fat)), o.cloth, 0, 0, 0, 1, 1, 1, chest);
  k.mesh(one("neck", neck), skin, 0, 0, 0, 1, 1, 1, chest);
  const head = pivot(chest, 0.01, 0.52, 0, "head");
  k.mesh(one("head", headGeometry), skin, 0, 0, 0, 1, 1, 1, head);
  const hair = o.hair ?? "hair";
  for (const s of [-1, 1]) {
    const e = onFace(s * 0.037, 0.014, -0.004),
      p = onFace(s * 0.037, 0.013, 0.004),
      b = onFace(s * 0.04, 0.043, 0.002);
    k.mesh(one("eye", (f) => ellipsoid(0.008, 0.011, 0.015, cuts(f, 8, 5), cuts(f, 6, 4))), "eye", e.x, e.y, e.z, 1, 1, 1, head);
    k.mesh(one("pupil", (f) => ellipsoid(0.004, 0.0085, 0.0075, cuts(f, 6, 4), cuts(f, 5, 3))), "pupil", p.x, p.y, p.z, 1, 1, 1, head);
    // (The finer features only where a graphics card draws: at the lane's size the processor's picture cannot show them.)
    if (!k.rich) continue;
    k.mesh(one("brow", (f) => ellipsoid(0.006, 0.0065, 0.024, cuts(f, 8, 4), cuts(f, 5, 3))), hair, b.x, b.y, b.z, 1, 1, 1, head).rotation.x = s * -0.18;
    k.mesh(one("ear", (f) => ellipsoid(0.024, 0.034, 0.011, cuts(f, 8, 5), cuts(f, 6, 4))), skin, -0.012, -0.004, s * 0.103, 1, 1, 1, head);
  }
  const n = onFace(0, -0.018, -0.005),
    m = onFace(0, -0.058, -0.002);
  k.mesh(one("nose", noseGeometry), skin, n.x, n.y, n.z, 1, 1, 1, head);
  if (k.rich) k.mesh(one("lips", (f) => ellipsoid(0.007, 0.0075, 0.026, cuts(f, 10, 5), cuts(f, 6, 4))), "lip", m.x, m.y, m.z, 1, 1, 1, head);
  const style = o.style ?? "crop";
  if (style !== "none") k.mesh(one(`hair-${style}`, (f) => (style === "wild" ? shellGeometry(f, GROW.wild, 0.016, (d) => 0.02 * smooth01(-d.y), 0.006) : shellGeometry(f, GROW.crop, 0.008))), hair, 0, 0, 0, 1, 1, 1, head);
  if (o.beard) k.mesh(one("beard", (f) => shellGeometry(f, GROW.beard, 0.012, (d) => 0.012 * smooth01(-d.y - 0.4), 0.004)), "beard", 0, 0, 0, 1, 1, 1, head);
  if (o.tache) k.mesh(one("tache", (f) => shellGeometry(f, GROW.tache, 0.006)), hair, 0, 0, 0, 1, 1, 1, head);
  const arms: T.Group[] = [],
    elbows: T.Group[] = [];
  let hand = pivot(chest, 0, 0, 0),
    off = hand;
  for (const z of [-0.19, 0.19]) {
    const arm = pivot(chest, 0, 0.34, z, "arm");
    k.mesh(one(`upperArm${fat}`, (f) => upperArm(f, fat)), o.sleeve ?? o.cloth, 0, 0, 0, 1, 1, 1, arm);
    const elbow = pivot(arm, 0, -0.21, 0, "elbow");
    k.mesh(one(`forearm${fat}`, (f) => forearm(f, fat)), o.cuff ?? o.sleeve ?? o.cloth, 0, 0, 0, 1, 1, 1, elbow);
    k.mesh(one("fist", fist), o.glove ?? skin, 0, 0, 0, 1, 1, 1, elbow);
    arms.push(arm);
    elbows.push(elbow);
    const grip = pivot(elbow, 0, -0.2, z > 0 ? 0.02 : -0.02, "hand");
    if (z > 0) hand = grip;
    else off = grip;
  }
  return { body, chest, legs, knees, arms, elbows, head, hand, off };
}
/** 0 below 0, rising smoothly to 1 at 1. */
const smooth01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));
/** A hat or helmet on a head (each era's, the side's colour on it). */
function headgear(k: Kit, p: Person, era: number, kind: Kind, side: number) {
  const h = p.head,
    team = `team${side}`,
    one = (name: string, make: (fine: number) => T.BufferGeometry) => k.shape(name, make);
  if (era === 0) {
    // A band in the side's colour round the wild hair, a feather or two in it, stripes of paint on the cheeks; the
    // slinger's cap of hide.
    k.mesh(one("headband", (f) => new T.TorusGeometry(0.118, 0.012, cuts(f, 6, 4), cuts(f, 22, 10)).rotateX(Math.PI / 2).scale(1.05, 1, 0.94)), team, -0.004, 0.05, 0, 1, 1, 1, h).rotation.z = 0.12;
    for (const s of [-1, 1]) {
      const c = onFace(s * 0.055, -0.02, 0.001);
      k.mesh(one("paint", (f) => ellipsoid(0.004, 0.006, 0.022, cuts(f, 6, 4), cuts(f, 4, 3))), team, c.x, c.y, c.z, 1, 1, 1, h).rotation.y = s * 0.5;
    }
    if (kind === 1) k.mesh(one("hidecap", (f) => shellGeometry(f, (d) => smooth01((d.y - 0.15) * 4), 0.02)), "hide", 0, 0, 0, 1, 1, 1, h);
    else {
      const feather = one("feather", (f) => slab([[0, 0], [0.02, 0.06], [0.022, 0.13], [0.008, 0.19], [-0.008, 0.13], [-0.012, 0.06]], 0.006, 0.002, cuts(f, 2, 1)));
      k.mesh(feather, "feather", -0.07, 0.07, 0.08, 1, 1, 1, h).rotation.set(0.3, 0, 0.5);
      k.mesh(feather, team, -0.09, 0.06, 0.09, 0.8, 0.8, 1, h).rotation.set(0.45, 0, 0.85);
    }
  } else if (era === 1) {
    if (kind === 1) {
      // The archer's hood with its long tail, the cape over the shoulders.
      k.mesh(one("hood", (f) => shellGeometry(f, GROW.hood, 0.016, (d) => 0.012 * smooth01(d.z + 0.2))), "hood", 0, 0, 0, 1, 1, 1, h);
      k.mesh(one("liripipe", (f) => tube([new T.Vector3(-0.1, 0.06, 0), new T.Vector3(-0.17, 0.0, 0), new T.Vector3(-0.21, -0.12, 0.01)], 0.03, 0.008, cuts(f, 8, 4), cuts(f, 6, 4))), "hood", 0, 0, 0, 1, 1, 1, h);
      k.mesh(one("cape", (f) => garment(f, 0.25, 0.4, 0.03, 0.025, 0)), "hood", 0, -0.52, 0, 1, 1, 1, h);
    } else {
      // A conical helm with a nasal and a rim, over a mail coif; a plume in the side's colour.
      k.mesh(one("coif", (f) => shellGeometry(f, GROW.hood, 0.012)), "mail", 0, 0, 0, 1, 1, 1, h);
      k.mesh(
        one("helm1", (f) =>
          lathe(
            [
              [0.0, 0.015],
              [0.124, 0.02],
              [0.126, 0.06],
              [0.118, 0.11],
              [0.09, 0.165],
              [0.05, 0.21],
              [0.012, 0.236],
              [0.0, 0.24],
            ],
            cuts(f, 20, 8),
            1.02,
            0.96,
          ),
        ),
        "iron",
        -0.005,
        0,
        0,
        1,
        1,
        1,
        h,
      );
      k.mesh(one("helmrim", (f) => new T.TorusGeometry(0.124, 0.008, cuts(f, 5, 3), cuts(f, 22, 10)).rotateX(Math.PI / 2).scale(1.02, 1, 0.96)), "brass", -0.005, 0.03, 0, 1, 1, 1, h);
      k.mesh(one("nasal", (f) => rounded(0.012, 0.085, 0.022, 0.005, f)), "steel", 0.124, 0.0, 0, 1, 1, 1, h);
      k.mesh(one("plume", (f) => tube([new T.Vector3(0, 0.23, 0), new T.Vector3(-0.05, 0.31, 0), new T.Vector3(-0.15, 0.33, 0), new T.Vector3(-0.22, 0.27, 0)], 0.024, 0.012, cuts(f, 10, 5), cuts(f, 7, 4))), team, 0, 0, 0, 1, 1, 1, h);
    }
  } else if (era === 2) {
    if (kind === 0) {
      // A cocked hat: its brim turned up in three corners, a cockade in the side's colour.
      k.mesh(one("tricorn", (f) => tricorn(f)), "black", -0.005, 0.07, 0, 1, 1, 1, h);
      k.mesh(one("cockade", (f) => new T.CylinderGeometry(0.026, 0.026, 0.008, cuts(f, 12, 6)).rotateX(Math.PI / 2)), team, 0.06, 0.13, 0.1, 1, 1, 1, h).rotation.y = -0.5;
    } else {
      // A shako, a little wider at the top, with a peak, a brass plate, a cord and a plume.
      k.mesh(
        one("shako", (f) =>
          lathe(
            [
              [0.0, 0.02],
              [0.112, 0.02],
              [0.112, 0.06],
              [0.118, 0.2],
              [0.124, 0.26],
              [0.0, 0.262],
            ],
            cuts(f, 18, 8),
          ),
        ),
        "black",
        -0.005,
        0.02,
        0,
        1,
        1,
        1,
        h,
      );
      k.mesh(one("peak", (f) => new T.CylinderGeometry(0.12, 0.12, 0.008, cuts(f, 16, 8), 1, false, 0, Math.PI).rotateY(Math.PI / 2).scale(0.75, 1, 1)), "black", 0.04, 0.05, 0, 1, 1, 1, h).rotation.z = -0.15;
      if (k.rich) k.mesh(one("plate", (f) => slab([[0, 0], [0.03, 0.02], [0.03, 0.06], [0, 0.08], [-0.03, 0.06], [-0.03, 0.02]], 0.006, 0.0015, cuts(f, 1, 1)).rotateY(Math.PI / 2)), "brass", 0.118, 0.12, 0, 1, 1, 1, h);
      if (k.rich) k.mesh(one("shakocord", (f) => new T.TorusGeometry(0.118, 0.005, cuts(f, 4, 3), cuts(f, 18, 8)).rotateX(Math.PI / 2 - 0.2)), "white", -0.005, 0.2, 0, 1, 1, 1, h);
      k.mesh(one("shakoplume", (f) => ellipsoid(0.03, 0.07, 0.03, cuts(f, 10, 5), cuts(f, 8, 4))), team, 0.03, 0.33, 0, 1, 1, 1, h);
    }
  } else {
    // A helmet in a cloth cover, a chin strap, goggles on its brow; the gunner's ear-cups.
    k.mesh(
      one("helmet3", (f) =>
        lathe(
          [
            [0.0, -0.005],
            [0.15, -0.012],
            [0.152, -0.004],
            [0.136, 0.012],
            [0.136, 0.06],
            [0.124, 0.11],
            [0.09, 0.155],
            [0.045, 0.176],
            [0.0, 0.18],
          ],
          cuts(f, 22, 9),
          1.04,
          0.98,
        ),
      ),
      "oliveDark",
      -0.01,
      0.035,
      0,
      1,
      1,
      1,
      h,
    );
    if (k.rich) k.mesh(one("strap", (f) => new T.TorusGeometry(0.1, 0.005, cuts(f, 4, 3), cuts(f, 14, 8), Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI)), "webbing", -0.01, 0.01, 0, 1, 1.25, 1, h);
    if (k.rich) k.mesh(one("goggleband", (f) => new T.TorusGeometry(0.14, 0.01, cuts(f, 4, 3), cuts(f, 20, 9)).rotateX(Math.PI / 2)), "rubber", -0.01, 0.075, 0, 1, 1, 1, h).rotation.z = 0.2;
    if (k.rich) for (const z of [-0.04, 0.04]) k.mesh(one("goggle", (f) => new T.CylinderGeometry(0.026, 0.028, 0.022, cuts(f, 12, 6)).rotateZ(Math.PI / 2 - 0.3)), "glass", 0.13, 0.098, z, 1, 1, 1, h);
    if (k.rich) k.mesh(one("helmpatch", (f) => rounded(0.05, 0.03, 0.008, 0.004, f)), `team${side}`, -0.02, 0.12, 0.145, 1, 1, 1, h).rotation.x = -0.25;
    if (kind === 1) for (const z of [-0.11, 0.11]) k.mesh(one("earcup", (f) => new T.CylinderGeometry(0.03, 0.032, 0.026, cuts(f, 12, 6)).rotateX(Math.PI / 2)), "oliveDark", -0.012, -0.01, z, 1, 1, 1, h);
  }
}
/** A cocked hat: a crown, and a brim turned up into three corners (one at the front). */
function tricorn(fine: number) {
  const n = cuts(fine, 36, 12),
    brim = new T.CylinderGeometry(1, 1, 1, n, 1, true),
    pos = brim.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      a = Math.atan2(z, x),
      corner = Math.pow(Math.abs(Math.cos((a * 3) / 2)), 3),
      r = 0.13 + 0.07 * corner,
      y = pos.getY(i);
    // The cylinder's lower ring is the brim's edge on the crown, its upper the turned-up edge.
    const up = y > 0 ? 0.06 + 0.05 * corner : 0;
    pos.setXYZ(i, Math.cos(a) * (y > 0 ? r : 0.115), up, Math.sin(a) * (y > 0 ? r : 0.115));
  }
  brim.computeVertexNormals();
  const crown = lathe(
    [
      [0.0, 0.0],
      [0.115, 0.0],
      [0.112, 0.06],
      [0.09, 0.11],
      [0.0, 0.125],
    ],
    cuts(fine, 18, 8),
  );
  const double = brim.clone();
  // The brim seen from inside too.
  const idx = double.index!;
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    idx.setX(t, idx.getX(t + 1));
    idx.setX(t + 1, a);
  }
  double.computeVertexNormals();
  return merge([brim, double, crown]);
}
/** A soldier's gear over the body, each era's own; the side's colour on each. */
function layers(k: Kit, p: Person, era: number, kind: Kind, side: number) {
  const team = `team${side}`,
    dark = `teamDark${side}`,
    c = p.chest,
    one = (name: string, make: (fine: number) => T.BufferGeometry) => k.shape(name, make),
    ring = (name: string, r: number, tubeR: number) => one(name, (f) => new T.TorusGeometry(r, tubeR, cuts(f, 5, 3), cuts(f, 18, 8)).rotateX(Math.PI / 2).scale(0.74, 1, 1));
  if (era === 0) {
    // A fur tunic over one shoulder with a ragged hem, a sash in the side's colour, a necklace of teeth, bands on the
    // arms and wraps on the shins.
    k.mesh(one("tunic0", (f) => garment(f, -0.17, 0.3, 0.012, 0.045, 0.25)), kind === 1 ? "hide" : "fur", 0, 0, 0, 1, 1, 1, c);
    k.mesh(one("furstrap", (f) => tube([new T.Vector3(0.09, 0.2, 0.08), new T.Vector3(0.05, 0.38, -0.08), new T.Vector3(-0.05, 0.38, -0.1), new T.Vector3(-0.09, 0.2, 0.08)], 0.03, 0.03, cuts(f, 10, 5), cuts(f, 6, 4))), kind === 1 ? "hide" : "furDark", 0, 0, 0, 1, 1, 1, c);
    k.mesh(ring("sash0", 0.142, 0.016), team, 0, 0.02, 0, 1, 1, 1, c);
    k.mesh(ring("necklace", 0.09, 0.004), "rope", 0.012, 0.36, 0, 1, 1, 1, c).rotation.z = -0.35;
    if (k.rich) for (let i = 0; i < 5; i++) k.mesh(one("tooth", (f) => new T.ConeGeometry(0.008, 0.03, cuts(f, 5, 3)).rotateZ(Math.PI)), "bone", 0.085 - Math.abs(i - 2) * 0.006, 0.33 - Math.abs(i - 2) * 0.012, -0.05 + i * 0.025, 1, 1, 1, c);
    for (const arm of p.arms) k.mesh(one("armband", (f) => new T.TorusGeometry(0.058, 0.009, cuts(f, 4, 3), cuts(f, 12, 6)).rotateX(Math.PI / 2)), team, 0, -0.1, 0, 1, 1, 1, arm);
    if (k.rich) for (const knee of p.knees) for (const y of [-0.08, -0.13]) k.mesh(one("wrap", (f) => new T.TorusGeometry(0.05, 0.008, cuts(f, 4, 3), cuts(f, 12, 6)).rotateX(Math.PI / 2)), "hide", 0, y, 0, 1, 1, 1, knee);
  } else if (era === 1) {
    if (kind === 1) {
      // The archer: a padded green jerkin to the thighs, a belt with a pouch, a quiver of fletched arrows on the back.
      k.mesh(one("jerkin", (f) => garment(f, -0.2, 0.35, 0.01, 0, 0.2)), "green", 0, 0, 0, 1, 1, 1, c);
      k.mesh(ring("belt1", 0.14, 0.013), team, 0, 0.0, 0, 1, 1, 1, c);
      if (k.rich) k.mesh(one("pouch", (f) => rounded(0.05, 0.06, 0.03, 0.012, f)), "leather", 0.08, -0.04, 0.1, 1, 1, 1, c);
      const quiver = pivot(c, -0.13, 0.2, -0.06);
      quiver.rotation.z = 0.35;
      k.mesh(one("quiver", (f) => lathe([[0.0, -0.17], [0.042, -0.165], [0.05, 0.0], [0.055, 0.15], [0.0, 0.152]], cuts(f, 12, 6))), "leather", 0, 0, 0, 1, 1, 1, quiver);
      for (let i = 0; i < 4; i++) {
        k.mesh("cyl", "wood", 0.015 * (i - 1.5), 0.2, 0.012 * (i % 2), 0.006, 0.14, 0.006, quiver);
        if (k.rich) k.mesh(one("fletch", (f) => slab([[0, 0], [0.012, 0.012], [0.012, 0.05], [0, 0.06], [-0.012, 0.05], [-0.012, 0.012]], 0.004, 0.001, cuts(f, 1, 1))), "feather", 0.015 * (i - 1.5), 0.24, 0.012 * (i % 2), 1, 1, 1, quiver);
      }
    } else {
      // A mail shirt to the knees, a tabard in the side's colour with a gold cross, a sword belt, round iron pauldrons.
      k.mesh(one("hauberk", (f) => garment(f, -0.24, 0.36, 0.006, 0.012, 0.22)), "mail", 0, 0, 0, 1, 1, 1, c);
      k.mesh(one("tabard", (f) => garment(f, -0.22, 0.32, 0.016, 0.0, 0.26, 0.92)), team, 0, 0, 0, 1, 1, 1, c);
      k.mesh(one("cross-v", (f) => rounded(0.008, 0.16, 0.035, 0.003, f)), "gold", 0.103, 0.14, 0, 1, 1, 1, c);
      k.mesh(one("cross-h", (f) => rounded(0.008, 0.035, 0.12, 0.003, f)), "gold", 0.105, 0.18, 0, 1, 1, 1, c);
      k.mesh(ring("belt1k", 0.15, 0.014), "leatherDark", 0, 0.01, 0, 1, 1, 1, c);
      if (k.rich) k.mesh(one("buckle", (f) => rounded(0.012, 0.035, 0.035, 0.004, f)), "brass", 0.112, 0.01, 0, 1, 1, 1, c);
      for (const arm of p.arms) k.mesh(one("pauldron", (f) => new T.SphereGeometry(0.085, cuts(f, 12, 6), cuts(f, 8, 4), 0, Math.PI * 2, 0, Math.PI / 2.2)), "iron", 0, -0.005, 0, 1, 1, 1, arm);
    }
  } else if (era === 2) {
    // A coat in the side's colour: its skirts to the thighs, tails behind, white facings and cuffs, brass buttons,
    // white cross-belts, a dark collar; white breeches, black gaiters; a pack and a rolled blanket.
    k.mesh(one("coat", (f) => garment(f, -0.16, 0.36, 0.008, 0, 0.12)), team, 0, 0, 0, 1, 1, 1, c);
    for (const z of [-0.05, 0.05]) {
      k.mesh(one("tail", (f) => slab([[0, 0], [0.06, 0], [0.05, -0.3], [0.0, -0.34]], 0.012, 0.004, cuts(f, 2, 1)).rotateY(Math.PI / 2)), dark, -0.095, 0.0, z, 1, 1, 1, c).rotation.x = z > 0 ? -0.12 : 0.12;
      k.mesh(one("facing", (f) => rounded(0.012, 0.24, 0.05, 0.004, f)), "white", 0.1, 0.22, z > 0 ? 0.03 : -0.03, 1, 1, 1, c).rotation.z = -0.12;
    }
    if (k.rich) for (let i = 0; i < 4; i++) k.mesh(one("button", (f) => ellipsoid(0.006, 0.01, 0.01, cuts(f, 6, 4), cuts(f, 4, 3))), "brass", 0.105, 0.12 + i * 0.06, 0.07, 1, 1, 1, c);
    for (const r of [0.62, -0.62]) k.mesh(one("crossbelt", (f) => new T.TorusGeometry(0.162, 0.011, cuts(f, 4, 3), cuts(f, 24, 10)).scale(0.74, 1, 1).rotateX(Math.PI / 2)), "white", 0, 0.2, 0, 1, 1, 1, c).rotation.x = r;
    k.mesh(ring("collar2", 0.075, 0.016), dark, 0, 0.385, 0, 1, 1, 1, c);
    k.mesh(one("pack", (f) => rounded(0.08, 0.2, 0.22, 0.025, f)), "leatherDark", -0.135, 0.19, 0, 1, 1, 1, c);
    k.mesh(one("blanket", (f) => new T.CylinderGeometry(0.038, 0.038, 0.24, cuts(f, 10, 5)).rotateX(Math.PI / 2)), "cloth", -0.13, 0.32, 0, 1, 1, 1, c);
    if (k.rich) for (const elbow of p.elbows) k.mesh(one("cuff", (f) => new T.TorusGeometry(0.04, 0.014, cuts(f, 4, 3), cuts(f, 12, 6)).rotateX(Math.PI / 2)), "white", 0, -0.15, 0, 1, 1, 1, elbow);
  } else {
    // A vest of pouches over camouflage fatigues, a belt and a canteen, the side's colour on the arm, a pack with a
    // rolled mat, gloves; the gunner's radio with its aerial.
    k.mesh(one("vest", (f) => garment(f, -0.02, 0.33, 0.02, 0, 0)), "oliveDark", 0, 0, 0, 1, 1, 1, c);
    for (let i = 0; i < 3; i++) k.mesh(one("pouch3", (f) => rounded(0.035, 0.07, 0.06, 0.01, f)), "webbing", 0.118, 0.06, -0.08 + i * 0.08, 1, 1, 1, c);
    if (k.rich) k.mesh(one("chestpouch", (f) => rounded(0.025, 0.05, 0.05, 0.008, f)), "webbing", 0.12, 0.22, 0.07, 1, 1, 1, c);
    k.mesh(ring("belt3", 0.145, 0.015), "webbing", 0, -0.04, 0, 1, 1, 1, c);
    if (k.rich) k.mesh(one("canteen", (f) => rounded(0.04, 0.08, 0.06, 0.02, f)), "olive", -0.04, -0.06, 0.15, 1, 1, 1, c);
    k.mesh(one("pack3", (f) => rounded(0.1, 0.24, 0.24, 0.03, f)), "khaki", -0.15, 0.17, 0, 1, 1, 1, c);
    k.mesh(one("mat", (f) => new T.CylinderGeometry(0.045, 0.045, 0.25, cuts(f, 10, 5)).rotateX(Math.PI / 2)), "oliveDark", -0.15, 0.31, 0, 1, 1, 1, c);
    for (const arm of p.arms) k.mesh(one("armband3", (f) => new T.TorusGeometry(0.057, 0.014, cuts(f, 4, 3), cuts(f, 12, 6)).rotateX(Math.PI / 2)), team, 0, -0.07, 0, 1, 1, 1, arm);
    if (kind === 1) {
      k.mesh(one("radio", (f) => rounded(0.07, 0.16, 0.12, 0.012, f)), "dark", -0.21, 0.2, -0.06, 1, 1, 1, c);
      k.mesh("cyl", "black", -0.21, 0.55, -0.1, 0.005, 0.5, 0.005, c);
    }
  }
}
/** A person of an era and kind, gear and weapon on. Returns the person and its weapon's mouth. */
function soldier(k: Kit, parent: T.Object3D, era: number, kind: Kind, side: number, scale = 1, sitting = false): { p: Person; muzzle: T.Object3D | null; weapon: T.Object3D | null } {
  const team = `team${side}`,
    one = (name: string, make: (fine: number) => T.BufferGeometry) => k.shape(name, make),
    dress: Dress =
      era === 0
        ? { cloth: "skin2", legs: "skin2", sleeve: "skin2", skin: "skin2", boot: "hide", beard: kind !== 1, hair: kind === 1 ? "hairRed" : "hair", style: "wild", high: 0.06, fat: 1.06 }
        : era === 1
          ? kind === 1
            ? { cloth: "green", legs: "leather", sleeve: "green", boot: "leatherDark", hair: "hairRed", style: "none" }
            : { cloth: "mail", legs: "mail", sleeve: "mail", cuff: "mail", boot: "leatherDark", hair: "hairRed", style: "none", tache: true, glove: "leatherDark" }
          : era === 2
            ? { cloth: team, legs: "white", shin: "black", sleeve: team, boot: "black", style: "crop", tache: kind === 1 }
            : { cloth: "olive", legs: "olive", sleeve: "olive", boot: "black", style: "none", glove: "rubber", high: 0.15 };
  const p = person(k, parent, { ...dress, scale, sitting });
  headgear(k, p, era, kind, side);
  layers(k, p, era, kind, side);
  const hand = p.hand;
  let muzzle: T.Object3D | null = null,
    weapon: T.Object3D | null = null;
  // The weapon (in the hand's frame a held thing's length runs along +y once turned).
  if (era === 0) {
    if (kind === 0) {
      // A club: a tapering shaft, a stone head bound on with thongs, flint chips set in it.
      const club = pivot(hand, 0, 0, 0);
      club.rotation.z = -Math.PI / 2.3;
      k.mesh(one("clubshaft", (f) => lathe([[0.0, -0.06], [0.022, -0.055], [0.026, 0.1], [0.034, 0.36], [0.0, 0.38]], cuts(f, 8, 5))), "wood", 0, 0, 0, 1, 1, 1, club);
      k.mesh(one("clubstone", (f) => rock(f, 0.085, 0.1, 0.075)), "stone", 0, 0.42, 0, 1, 1, 1, club);
      for (const y of [0.34, 0.37]) k.mesh(one("thong", (f) => new T.TorusGeometry(0.038, 0.008, cuts(f, 4, 3), cuts(f, 10, 6)).rotateX(Math.PI / 2)), "leather", 0, y, 0, 1, 1, 1, club);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        k.mesh(one("chip", (f) => new T.TetrahedronGeometry(0.03, 0)), "flint", Math.cos(a) * 0.07, 0.44 + (i % 2) * 0.03, Math.sin(a) * 0.06, 1, 1.6, 1, club).rotation.set(Math.sin(a), 0, -Math.cos(a));
      }
    } else if (kind === 1) {
      // A sling: two cords and a pouch with its stone; a bag of stones on the hip.
      k.mesh(one("slingcord", (f) => tube([new T.Vector3(0, 0, 0), new T.Vector3(0.01, -0.09, 0.006), new T.Vector3(0, -0.17, 0)], 0.005, 0.005, cuts(f, 6, 3), 4)), "rope", 0, 0, 0, 1, 1, 1, hand);
      k.mesh(one("slingpouch", (f) => ellipsoid(0.04, 0.026, 0.04, cuts(f, 8, 5), cuts(f, 6, 4))), "hide", 0, -0.18, 0, 1, 1, 1, hand);
      k.mesh(one("slingstone", (f) => rock(f, 0.028, 0.026, 0.028)), "stone", 0, -0.165, 0, 1, 1, 1, hand);
      k.mesh(one("stonebag", (f) => ellipsoid(0.05, 0.065, 0.045, cuts(f, 10, 5), cuts(f, 8, 4))), "hide", -0.06, -0.02, -0.17, 1, 1, 1, p.chest);
      muzzle = pivot(hand, 0, -0.18, 0, "muzzle");
    } else {
      // The mammoth rider's spear: a long shaft, a leaf of flint lashed on, a strip of the side's colour.
      const spear = pivot(hand, 0, 0, 0);
      spear.rotation.z = -Math.PI / 2.1;
      k.mesh(one("spearshaft", (f) => lathe([[0.0, -0.25], [0.016, -0.24], [0.019, 0.3], [0.016, 0.64], [0.0, 0.65]], cuts(f, 8, 5))), "wood", 0, 0, 0, 1, 1, 1, spear);
      k.mesh(one("spearhead", (f) => slab([[-0.035, 0], [0, 0.17], [0.035, 0], [0, -0.03]], 0.018, 0.006, cuts(f, 2, 1)).rotateY(Math.PI / 2)), "flint", 0, 0.64, 0, 1, 1, 1, spear);
      k.mesh(one("lash", (f) => lathe([[0.0, 0.0], [0.024, 0.0], [0.026, 0.05], [0.0, 0.052]], cuts(f, 8, 5))), "leather", 0, 0.6, 0, 1, 1, 1, spear);
      k.mesh(one("streamer", (f) => slab([[0, 0], [0.09, -0.01], [0.08, -0.05], [0, -0.04]], 0.004, 0.001, 1)), team, 0.02, 0.56, 0, 1, 1, 1, spear);
    }
  } else if (era === 1) {
    if (kind === 0) {
      // A sword: a wrapped grip, a round pommel, a cross-guard, a blade with its fuller and point.
      const sword = pivot(hand, 0, 0, 0);
      sword.rotation.z = -Math.PI / 2.2;
      k.mesh(one("grip", (f) => lathe([[0.0, -0.05], [0.017, -0.05], [0.019, 0.0], [0.017, 0.05], [0.0, 0.05]], cuts(f, 8, 5))), "leatherDark", 0, 0, 0, 1, 1, 1, sword);
      k.mesh(one("pommel", (f) => ellipsoid(0.026, 0.022, 0.026, cuts(f, 8, 5), cuts(f, 6, 4))), "brass", 0, -0.065, 0, 1, 1, 1, sword);
      k.mesh(one("guard", (f) => rounded(0.026, 0.022, 0.18, 0.009, f)), "brass", 0, 0.06, 0, 1, 1, 1, sword);
      k.mesh(one("blade", (f) => slab([[-0.024, 0], [0.024, 0], [0.019, 0.5], [0, 0.58], [-0.019, 0.5]], 0.008, 0.003, cuts(f, 2, 1)).rotateY(Math.PI / 2)), "steel", 0, 0.07, 0, 1, 1, 1, sword);
      k.mesh(one("fuller", (f) => rounded(0.0095, 0.36, 0.01, 0.003, f)), "iron", 0, 0.28, 0, 1, 1, 1, sword);
      // A kite shield on the far arm: the side's colour, a gold rim and cross, an iron boss.
      const shield = pivot(p.off, 0.08, 0.3, 0.36);
      shield.rotation.y = 0.35;
      k.mesh(one("kite3", (f) => kiteShield(f)), team, 0, 0, 0, 1, 1, 1, shield);
      k.mesh(one("kiterim", (f) => kiteRim(f)), "gold", 0, 0, 0, 1, 1, 1, shield);
      k.mesh(one("boss", (f) => new T.SphereGeometry(0.05, cuts(f, 10, 6), cuts(f, 6, 4), 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2)), "iron", 0, 0.1, 0.03, 1, 1, 1, shield);
      k.mesh(one("kitecross", (f) => merge([rounded(0.035, 0.38, 0.008, 0.004, f), rounded(0.22, 0.035, 0.008, 0.004, f).translate(0, 0.12, 0)])), "gold", 0, -0.02, 0.026, 1, 1, 1, shield);
    } else if (kind === 1) {
      // A longbow: a curved stave, its string, a leather grip.
      const bow = (weapon = pivot(p.off, 0.05, 0.0, 0.02, "weapon"));
      k.mesh(one("bowstave", (f) => tube([new T.Vector3(-0.03, -0.46, 0), new T.Vector3(0.06, -0.36, 0), new T.Vector3(0.14, -0.18, 0), new T.Vector3(0.165, 0, 0), new T.Vector3(0.14, 0.18, 0), new T.Vector3(0.06, 0.36, 0), new T.Vector3(-0.03, 0.46, 0)], 0.016, 0.016, cuts(f, 18, 8), cuts(f, 6, 4))), "wood", 0, 0, 0, 1, 1, 1, bow);
      k.mesh(one("bowstring", (f) => new T.CylinderGeometry(0.003, 0.003, 0.92, 3).translate(-0.03, 0, 0)), "rope", 0, 0, 0, 1, 1, 1, bow);
      k.mesh(one("bowgrip", (f) => new T.CylinderGeometry(0.022, 0.022, 0.09, cuts(f, 8, 5)).translate(0.165, 0, 0)), "leather", 0, 0, 0, 1, 1, 1, bow);
      muzzle = pivot(bow, 0.2, 0, 0, "muzzle");
    } else {
      // The knight's lance: a long tapering shaft, a vamplate in the side's colour, a steel point.
      const lance = pivot(hand, 0, 0, 0);
      lance.rotation.z = -Math.PI / 2;
      k.mesh(one("lanceshaft", (f) => lathe([[0.0, -0.3], [0.03, -0.28], [0.045, -0.05], [0.04, 0.2], [0.016, 1.33], [0.0, 1.34]], cuts(f, 10, 6))), "wood", 0, 0, 0, 1, 1, 1, lance);
      k.mesh(one("vamplate", (f) => lathe([[0.0, -0.02], [0.03, -0.02], [0.09, 0.1], [0.085, 0.11], [0.0, 0.11]], cuts(f, 12, 6))), team, 0, 0.05, 0, 1, 1, 1, lance);
      k.mesh(one("lancetip", (f) => new T.ConeGeometry(0.026, 0.13, cuts(f, 6, 4))), "steel", 0, 1.39, 0, 1, 1, 1, lance);
    }
  } else if (era === 2) {
    // A musket (its side outline cut and pushed out): a stock with its butt and wrist, a long barrel bound with brass,
    // a lock with its hammer, a ramrod beneath; the fusilier's bayonet.
    const gun = (weapon = pivot(hand, 0, 0, 0, "weapon"));
    gun.rotation.z = -Math.PI / 2;
    k.mesh(one("musketstock", (f) => slab([[-0.2, -0.075], [-0.2, 0.025], [-0.05, 0.012], [0.07, 0.014], [0.62, 0.008], [0.62, -0.012], [0.08, -0.02], [0.02, -0.035], [-0.06, -0.075]], 0.045, 0.01, cuts(f, 2, 1)).rotateZ(Math.PI / 2)), "wood", 0, 0, 0, 1, 1, 1, gun);
    k.mesh(one("musketbarrel", (f) => lathe([[0.0, 0.0], [0.016, 0.0], [0.015, 0.4], [0.012, 0.82], [0.0, 0.822]], cuts(f, 8, 5))), "dark", -0.022, 0.0, 0, 1, 1, 1, gun);
    if (k.rich) k.mesh(one("lock", (f) => rounded(0.03, 0.06, 0.01, 0.003, f)), "steel", -0.005, 0.07, 0.026, 1, 1, 1, gun);
    if (k.rich) k.mesh(one("hammer", (f) => rounded(0.03, 0.012, 0.008, 0.003, f)), "dark", -0.03, 0.05, 0.026, 1, 1, 1, gun).rotation.z = 0.5;
    if (k.rich) for (const y of [0.32, 0.5, 0.6]) k.mesh(one("band", (f) => new T.TorusGeometry(0.02, 0.004, 3, cuts(f, 10, 6)).rotateX(Math.PI / 2)), "brass", -0.014, y, 0, 1, 1, 1, gun);
    k.mesh("cyl", "dark", 0.01, 0.42, 0, 0.004, 0.38, 0.004, gun);
    if (kind === 0) k.mesh(one("bayonet", (f) => slab([[-0.006, 0], [0.006, 0], [0, 0.22]], 0.006, 0.002, 1).rotateY(Math.PI / 2)), "steel", -0.036, 0.8, 0, 1, 1, 1, gun);
    muzzle = pivot(gun, -0.022, 0.83, 0, "muzzle");
  } else {
    const gun = (weapon = pivot(hand, 0, 0, 0, "weapon"));
    gun.rotation.z = -Math.PI / 2;
    if (kind === 0) {
      // A rifle: stock, pistol grip, receiver with its sight rail, a curved magazine, a handguard and a muzzle device.
      k.mesh(one("rifle", (f) => slab([[-0.2, -0.06], [-0.2, 0.02], [-0.02, 0.03], [0.24, 0.03], [0.24, -0.01], [0.05, -0.02], [0.02, -0.06], [-0.02, -0.02], [-0.1, -0.03]], 0.04, 0.008, cuts(f, 2, 1)).rotateZ(Math.PI / 2)), "black", 0, 0, 0, 1, 1, 1, gun);
      k.mesh(one("handguard", (f) => rounded(0.045, 0.16, 0.045, 0.012, f)), "oliveDark", -0.008, 0.32, 0, 1, 1, 1, gun);
      k.mesh(one("mag", (f) => slab([[0, 0], [0.05, 0], [0.065, -0.1], [0.02, -0.11]], 0.025, 0.004, 1).rotateZ(Math.PI / 2)), "black", 0.03, 0.12, 0, 1, 1, 1, gun);
      k.mesh(one("riflebarrel", (f) => lathe([[0.0, 0.0], [0.009, 0.0], [0.009, 0.14], [0.013, 0.15], [0.013, 0.19], [0.0, 0.192]], cuts(f, 8, 5))), "dark", -0.01, 0.38, 0, 1, 1, 1, gun);
      k.mesh(one("sight", (f) => rounded(0.025, 0.06, 0.02, 0.005, f)), "dark", -0.045, 0.12, 0, 1, 1, 1, gun);
      muzzle = pivot(gun, -0.01, 0.58, 0, "muzzle");
    } else {
      // A machine gun: its receiver, a perforated barrel jacket, the barrel, a carrying handle, a bipod folded under,
      // a belt of rounds and an ammunition box on the hip.
      k.mesh(one("mgbody", (f) => slab([[-0.2, -0.05], [-0.2, 0.03], [0.3, 0.035], [0.3, -0.03], [0.05, -0.035], [0.02, -0.08], [-0.03, -0.035]], 0.06, 0.01, cuts(f, 2, 1)).rotateZ(Math.PI / 2)), "black", 0, 0, 0, 1, 1, 1, gun);
      k.mesh(one("jacket", (f) => lathe([[0.0, 0.0], [0.03, 0.0], [0.03, 0.24], [0.024, 0.26], [0.0, 0.262]], cuts(f, 10, 6))), "dark", -0.005, 0.3, 0, 1, 1, 1, gun);
      if (k.rich) for (let i = 0; i < 4; i++) k.mesh(one("vent", (f) => new T.TorusGeometry(0.03, 0.004, 3, cuts(f, 10, 6)).rotateX(Math.PI / 2)), "black", -0.005, 0.34 + i * 0.05, 0, 1, 1, 1, gun);
      k.mesh(one("mgbarrel", (f) => lathe([[0.0, 0.0], [0.011, 0.0], [0.011, 0.18], [0.0, 0.182]], cuts(f, 8, 5))), "black", -0.005, 0.56, 0, 1, 1, 1, gun);
      k.mesh(one("handle", (f) => new T.TorusGeometry(0.04, 0.006, 3, cuts(f, 10, 6), Math.PI)), "black", -0.045, 0.2, 0, 1, 1, 1, gun).rotation.z = Math.PI / 2;
      for (const z of [-0.03, 0.03]) k.mesh("cyl", "dark", 0.04, 0.56, z, 0.006, 0.2, 0.006, gun).rotation.z = z > 0 ? 0.2 : -0.2;
      if (k.rich) for (let i = 0; i < 6; i++) k.mesh(one("round", (f) => new T.CylinderGeometry(0.006, 0.007, 0.03, cuts(f, 6, 4)).rotateX(Math.PI / 2)), "brass", 0.04 + i * 0.012, 0.1 - i * 0.03, 0.04, 1, 1, 1, gun);
      k.mesh(one("ammobox", (f) => rounded(0.1, 0.1, 0.08, 0.012, f)), "olive", -0.07, 0.03, 0.17, 1, 1, 1, p.chest);
      muzzle = pivot(gun, -0.005, 0.75, 0, "muzzle");
    }
  }
  return { p, muzzle, weapon };
}
/** A lumpy stone: a sphere pushed in and out. */
function rock(fine: number, x: number, y: number, z: number) {
  const g = new T.IcosahedronGeometry(1, fine > 0.7 ? 2 : 1),
    pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i),
      vy = pos.getY(i),
      vz = pos.getZ(i),
      r = 1 + 0.12 * Math.sin(vx * 7 + vy * 3) * Math.cos(vz * 5 - vy * 4);
    pos.setXYZ(i, vx * x * r, vy * y * r, vz * z * r);
  }
  g.computeVertexNormals();
  return g;
}
/** A kite shield's face: a rounded top, a long point below, a little curved round the arm. */
function kiteOutline(): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    pts.push([Math.cos(a) * 0.15, 0.2 + Math.sin(a) * 0.1]);
  }
  pts.push([0.13, 0.02], [0.0, -0.34], [-0.13, 0.02]);
  return pts;
}
function kiteShield(fine: number) {
  const g = slab(kiteOutline(), 0.03, 0.008, cuts(fine, 2, 1)),
    pos = g.attributes.position;
  // Bent round the arm: its sides drawn back.
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) - 0.5 * pos.getX(i) * pos.getX(i));
  g.computeVertexNormals();
  return g;
}
function kiteRim(fine: number) {
  const pts = kiteOutline().map(([x, y]) => new T.Vector3(x * 1.01, y * 1.01, 0.016 - 0.5 * x * x));
  pts.push(pts[0].clone());
  const curve = new T.CatmullRomCurve3(pts, false, "catmullrom", 0.2);
  return new T.TubeGeometry(curve, cuts(fine, 40, 12), 0.012, cuts(fine, 5, 3), false);
}
/** The life bar over a figure (two flat strips that face the eye), and the star of a rank above it. */
function lifeBar(k: Kit, root: T.Group, side: number, tall: number) {
  const back = new T.Mesh(k.g.plane, k.m.barBack),
    bar = new T.Mesh(k.g.plane, k.m[`bar${side}`]),
    star = new T.Mesh(k.g.star, k.m.star);
  back.scale.set(0.62, 0.075, 1);
  bar.scale.set(0.58, 0.05, 1);
  back.position.set(0, tall, 0.4);
  bar.position.set(0, tall, 0.41);
  star.scale.setScalar(0.07);
  star.position.set(-0.36, tall, 0.42);
  back.renderOrder = 6;
  bar.renderOrder = 7;
  star.renderOrder = 7;
  back.name = `barBack#${named++}`;
  bar.name = `bar#${named++}`;
  star.name = `star#${named++}`;
  root.add(back, bar, star);
  return { back, bar, star };
}
/** A jointed beast's leg: an upper leg on a hip and a lower one on a knee, with a hoof or a pad. */
function beastLeg(k: Kit, parent: T.Object3D, x: number, y: number, z: number, upper: [number, number], lower: [number, number], paint: string, foot: string, f: { legs: T.Object3D[]; knees: T.Object3D[] }) {
  const hip = pivot(parent, x, y, z, "leg");
  k.mesh("limb", paint, 0, 0, 0, upper[0], upper[1], upper[0], hip);
  const knee = pivot(hip, 0, -upper[1] * 0.95, 0, "knee");
  k.mesh("limb", paint, 0, 0, 0, lower[0], lower[1], lower[0], knee);
  k.mesh("cyl", foot, 0, -lower[1] - 0.02, 0, lower[0] * 1.15, 0.06, lower[0] * 1.15, knee);
  f.legs.push(hip);
  f.knees.push(knee);
}
type Draft = Omit<Figure, "bar" | "barBack" | "star" | "tall" | "flash" | "track">;
/** A sculpted shape by name for a kit (made once). */
let one: (name: string, make: (fine: number) => T.BufferGeometry) => string = () => "";
/** Builds a template of a figure for a soldier of an era, kind and side. */
function build(k: Kit, era: number, kind: Kind, side: number): Figure {
  const root = new T.Group(),
    // Mirrored for side 1 (its soldiers go leftward, their weapons still on the near side); the life bar, on the root, is not.
    face = pivot(root, 0, 0, 0, "face"),
    body = pivot(face, 0, 0, 0, "body"),
    team = `team${side}`,
    f: Draft = { root, body, chest: body, legs: [], knees: [], arms: [], elbows: [], strike: null, style: "swing", wheels: [], head: null, tail: null, flaps: [], muzzle: null, weapon: null, stride: 0.55, era, kind };
  let tall = 1.48;
  const track: T.Mesh[] = [];
  one = (name, make) => k.shape(name, make);
  if (kind !== 2) {
    const { p, muzzle, weapon } = soldier(k, body, era, kind, side);
    Object.assign(f, { chest: p.chest, legs: p.legs, knees: p.knees, arms: p.arms, elbows: p.elbows, muzzle, weapon: kind === 1 && era > 0 ? weapon : null });
    f.strike = p.arms[1];
    f.style = kind === 0 ? "swing" : era === 0 ? "throw" : "shoot";
    if (era === 1 && kind === 1) f.strike = p.arms[0];
  } else if (era === 0) {
    // A woolly mammoth: a humped body hung with long shaggy hair, a domed head with flapping ears, curling tusks, a
    // trunk that swings; its rider on a blanket in the side's colour.
    const beast = pivot(body, 0, 0, 0, "beast");
    f.chest = beast;
    k.mesh(one("mammoth", mammothBody), "shag", 0, 0, 0, 1, 1, 1, beast);
    const head = pivot(beast, 0.74, 1.32, 0, "head");
    f.head = head;
    k.mesh(one("mammothHead", mammothHead), "shag", 0, 0, 0, 1, 1, 1, head);
    for (const z of [-1, 1]) {
      const ear = pivot(head, -0.1, 0.06, z * 0.3, "flap");
      k.mesh(one("mammothEar", (fine) => ellipsoid(0.09, 0.15, 0.04, cuts(fine, 10, 6), cuts(fine, 8, 5))), "furDark", 0, -0.04, z * 0.02, 1, 1, 1, ear);
      f.flaps.push(ear);
      k.mesh(one("beastEye", (fine) => ellipsoid(0.026, 0.024, 0.02, cuts(fine, 8, 5), cuts(fine, 6, 4))), "pupil", 0.27, 0.08, z * 0.19, 1, 1, 1, head);
      k.mesh(one(`tusk${z}`, (fine) => tusk(fine, z)), "tusk", 0, 0, 0, 1, 1, 1, head);
    }
    const trunkPivot = pivot(head, 0.3, -0.06, 0, "strike");
    k.mesh(one("trunk", trunk), "shag", 0, 0, 0, 1, 1, 1, trunkPivot);
    f.strike = trunkPivot;
    for (const [x, z] of [[0.45, -0.26], [0.45, 0.26], [-0.45, -0.26], [-0.45, 0.26]] as const) {
      const hip = pivot(beast, x, 0.95, z, "leg");
      k.mesh(one("pillarUpper", pillarUpper), "shag", 0, 0, 0, 1, 1, 1, hip);
      const knee = pivot(hip, 0, -0.48, 0, "knee");
      k.mesh(one("pillarLower", pillarLower), "furDark", 0, 0, 0, 1, 1, 1, knee);
      if (k.rich) for (let t = 0; t < 3; t++) k.mesh(one("toenail", (fine) => ellipsoid(0.03, 0.03, 0.04, cuts(fine, 6, 4), cuts(fine, 5, 3))), "bone", 0.14, -0.41, (t - 1) * 0.07, 1, 1, 1, knee);
      f.legs.push(hip);
      f.knees.push(knee);
    }
    k.mesh(one("blanket0", (fine) => rounded(0.66, 0.06, 0.74, 0.03, fine)), team, -0.05, 1.74, 0, 1, 1, 1, beast);
    for (const z of [-0.37, 0.37]) k.mesh(one("blanketHem", (fine) => rounded(0.66, 0.035, 0.02, 0.01, fine)), "gold", -0.05, 1.7, z, 1, 1, 1, beast);
    const tail = pivot(beast, -0.84, 1.2, 0, "tail");
    k.mesh(one("mammothTail", mammothTail), "furDark", 0, 0, 0, 1, 1, 1, tail);
    f.tail = tail;
    const rider = pivot(beast, -0.05, 1.12, 0);
    const { p } = soldier(k, rider, 0, 2, side, 0.82, true);
    f.arms = p.arms;
    f.elbows = p.elbows;
    f.style = "trample";
    f.stride = 1.1;
    tall = 2.6;
  } else if (era === 1) {
    // A knight on a barded horse: a caparison of the side's colour with a gold hem and badge, a saddle, an iron
    // chanfron on its face, the lance couched with a pennant on it.
    const horse = pivot(body, 0, 0, 0, "beast");
    f.chest = horse;
    k.mesh(one("horseBody", horseBody), "horse", 0, 1.02, 0, 1, 1, 1, horse);
    k.mesh(one("caparison", caparison), team, 0, 0, 0, 1, 1, 1, horse);
    for (const z of [-1, 1]) {
      k.mesh(one("caparisonHem", (fine) => rounded(1.12, 0.04, 0.012, 0.01, fine)), "gold", 0, 0.56, z * 0.33, 1, 1, 1, horse);
      k.mesh(one("caparisonBadge", (fine) => new T.CylinderGeometry(0.11, 0.11, 0.012, cuts(fine, 16, 8)).rotateX(Math.PI / 2)), "gold", -0.05, 0.86, z * 0.335, 1, 1, 1, horse);
    }
    k.mesh(one("saddle", (fine) => rounded(0.36, 0.08, 0.3, 0.035, fine)), "leatherDark", -0.05, 1.34, 0, 1, 1, 1, horse);
    k.mesh(one("cantle", (fine) => rounded(0.04, 0.08, 0.22, 0.02, fine)), "leatherDark", -0.22, 1.38, 0, 1, 1, 1, horse);
    const neckPivot = pivot(horse, 0.5, 1.14, 0, "head");
    f.head = neckPivot;
    k.mesh(one("horseNeck", horseNeck), "horse", 0, 0, 0, 1, 1, 1, neckPivot);
    k.mesh(one("horseHead", horseHead), "horse", 0, 0, 0, 1, 1, 1, neckPivot);
    k.mesh(one("horseMane", horseMane), "mane", -0.04, 0.0, 0, 1, 1, 1, neckPivot);
    k.mesh(one("chanfron", (fine) => rounded(0.3, 0.05, 0.12, 0.02, fine).rotateZ(-0.85)), "iron", 0.36, 0.42, 0, 1, 1, 1, neckPivot);
    k.mesh(one("bridle", (fine) => new T.TorusGeometry(0.075, 0.008, 3, cuts(fine, 12, 6)).rotateY(Math.PI / 2).rotateZ(-0.6)), "leatherDark", 0.42, 0.28, 0, 1, 1, 1, neckPivot);
    for (const z of [-0.07, 0.07]) k.mesh(one("beastEye", (fine) => ellipsoid(0.026, 0.024, 0.02, cuts(fine, 8, 5), cuts(fine, 6, 4))), "pupil", 0.25, 0.45, z, 0.7, 0.7, 0.7, neckPivot);
    f.strike = neckPivot;
    for (const [x, z] of [[0.38, -0.13], [0.38, 0.13], [-0.4, -0.13], [-0.4, 0.13]] as const) {
      const hip = pivot(horse, x, 0.86, z, "leg");
      k.mesh(one("horseUpper", horseUpper), "horse", 0, 0, 0, 1, 1, 1, hip);
      const knee = pivot(hip, 0, -0.4, 0, "knee");
      k.mesh(one("horseLower", horseLower), "horse", 0, 0, 0, 1, 1, 1, knee);
      k.mesh(one("hoof", hoof), "black", 0, 0, 0, 1, 1, 1, knee);
      f.legs.push(hip);
      f.knees.push(knee);
    }
    const tail = pivot(horse, -0.6, 1.1, 0, "tail");
    k.mesh(one("horseTail", horseTail), "mane", 0, 0, 0, 1, 1, 1, tail);
    f.tail = tail;
    const rider = pivot(horse, -0.05, 0.78, 0);
    const { p } = soldier(k, rider, 1, 2, side, 0.9, true);
    const pennant = pivot(p.hand, 0.0, 0.0, 0.0, "flap");
    k.mesh(one("pennant", (fine) => slab([[0, 0], [0.34, -0.04], [0.26, -0.08], [0.34, -0.13], [0, -0.13]], 0.006, 0.002, cuts(fine, 1, 1))), team, 1.0, -0.01, 0, 1, 1, 1, pennant);
    f.flaps.push(pennant);
    f.arms = p.arms;
    f.elbows = p.elbows;
    f.style = "trample";
    f.stride = 1.25;
    tall = 2.25;
  } else if (era === 2) {
    // A field gun: a bronze barrel on a wooden trail carriage with two spoked wheels shod in iron, its rammer and
    // bucket; a gunner behind it.
    const gun = pivot(body, 0, 0, 0, "beast");
    k.mesh(one("cheeks", cheeks), "wood", -0.05, 0, 0, 1, 1, 1, gun);
    k.mesh(one("trailEnd", (fine) => rounded(0.16, 0.14, 0.36, 0.03, fine)), "woodDark", -0.94, 0.09, 0, 1, 1, 1, gun);
    k.mesh(one("axle", (fine) => new T.CylinderGeometry(0.035, 0.035, 0.84, cuts(fine, 8, 5)).rotateX(Math.PI / 2)), "dark", 0.1, 0.42, 0, 1, 1, 1, gun);
    if (k.rich) for (const x of [-0.5, -0.2]) k.mesh(one("strap2", (fine) => rounded(0.05, 0.03, 0.38, 0.01, fine)), "iron", x, 0.18 + (x + 0.5) * 0.4, 0, 1, 1, 1, gun).rotation.z = 0.42;
    if (k.rich) k.mesh(one("quoin", (fine) => rounded(0.2, 0.06, 0.2, 0.015, fine)), "woodDark", -0.25, 0.6, 0, 1, 1, 1, gun);
    for (const z of [-0.37, 0.37]) {
      const wheel = pivot(gun, 0.1, 0.42, z, "wheel");
      k.mesh(one("spokedWheel", spokedWheel), "woodDark", 0, 0, 0, 1, 1, 1, wheel);
      k.mesh(one("tyre", tyre), "iron", 0, 0, 0, 1, 1, 1, wheel);
      f.wheels.push(wheel);
    }
    const barrel = pivot(gun, 0.1, 0.72, 0, "strike");
    barrel.rotation.z = 0.1;
    k.mesh(one("cannonBarrel", cannonBarrel), "bronze", 0, 0, 0, 1, 1, 1, barrel);
    k.mesh(one("trunnions", (fine) => new T.CylinderGeometry(0.04, 0.04, 0.42, cuts(fine, 8, 5)).rotateX(Math.PI / 2)), "bronze", 0.0, 0, 0, 1, 1, 1, barrel);
    if (k.rich) k.mesh(one("cannonBand", (fine) => new T.TorusGeometry(0.135, 0.012, 3, cuts(fine, 16, 8)).rotateY(Math.PI / 2)), team, 0.3, 0, 0, 1, 1, 1, barrel);
    f.muzzle = pivot(barrel, 0.96, 0, 0, "muzzle");
    f.strike = barrel;
    k.mesh(one("rammer", (fine) => merge([new T.CylinderGeometry(0.012, 0.012, 1.0, cuts(fine, 6, 4)), new T.CylinderGeometry(0.05, 0.05, 0.1, cuts(fine, 10, 5)).translate(0, 0.5, 0)])), "wood", -0.55, 0.45, 0.26, 1, 1, 1, gun).rotation.z = 1.2;
    k.mesh(one("bucket", (fine) => lathe([[0.0, 0.0], [0.07, 0.0], [0.08, 0.14], [0.0, 0.14]], cuts(fine, 10, 6))), "woodDark", -0.9, 0.05, 0.3, 1, 1, 1, gun);
    const gunner = pivot(body, -1.0, 0, 0.14);
    const { p } = soldier(k, gunner, 2, 1, side, 0.95);
    Object.assign(f, { legs: p.legs, knees: p.knees, arms: p.arms, elbows: p.elbows, chest: p.chest });
    f.style = "barrel";
    f.stride = 0.5;
    tall = 1.7;
  } else {
    // A tank: tracks running round road wheels and sprockets, fenders and side skirts, a hull with a sloped glacis,
    // hatches, lights, spare links and exhausts, a cast turret with the side's band and number, a mantlet, a long gun
    // with a fume extractor and a muzzle brake, a cupola with a machine gun, an aerial.
    const tank = pivot(body, 0, 0, 0, "beast");
    // (Nothing of a tank leans as a person's chest does.)
    f.chest = pivot(tank, 0, 0, 0, "still");
    for (const z of [-0.42, 0.42]) {
      const tr = k.mesh(one("trackLoop", trackLoop), "track", 0, 0.27, z, 1, 1, 1, tank);
      track.push(tr);
      for (let s = 0; s < 5; s++) {
        const wheel = pivot(tank, -0.72 + s * 0.36, 0.22, z + Math.sign(z) * 0.105, "wheel");
        k.mesh(one("tyreTank", tyreTank), "rubber", 0, 0, 0, 1, 1, 1, wheel);
        k.mesh(one(`roadWheel${Math.sign(z)}`, (fine) => (z > 0 ? roadWheel(fine) : roadWheel(fine).rotateY(Math.PI))), "olive", 0, 0, 0.012 * Math.sign(z), 1, 1, 1, wheel);
        f.wheels.push(wheel);
      }
      for (const x of [-0.98, 0.98]) {
        const sp = pivot(tank, x, 0.27, z + Math.sign(z) * 0.105, "wheel");
        k.mesh(one("sprocket", sprocket), "dark", 0, 0, 0, 1, 1, 1, sp);
        f.wheels.push(sp);
      }
      k.mesh(one("fender", (fine) => rounded(2.05, 0.03, 0.26, 0.012, fine)), "oliveDark", 0, 0.5, z * 1.1, 1, 1, 1, tank);
      for (let s = 0; s < 4; s++) k.mesh(one("skirt", (fine) => rounded(0.46, 0.17, 0.02, 0.01, fine)), "oliveDark", -0.72 + s * 0.48, 0.41, z * 1.38, 1, 1, 1, tank);
    }
    k.mesh(one("hull", hull), "olive", 0, 0, 0, 1, 1, 1, tank);
    if (k.rich) for (let s = 0; s < 3; s++) k.mesh(one("spareLink", (fine) => rounded(0.08, 0.03, 0.2, 0.01, fine)), "dark", 0.92 - s * 0.05, 0.6 + s * 0.06, -0.2 + s * 0.2, 1, 1, 1, tank).rotation.z = 0.95;
    for (const z of [-0.34, 0.34]) {
      if (k.rich) k.mesh(one("headlight", (fine) => lathe([[0.0, 0.0], [0.04, 0.0], [0.05, 0.05], [0.0, 0.052]], cuts(fine, 10, 6)).rotateZ(-Math.PI / 2)), "dark", 0.92, 0.66, z, 1, 1, 1, tank);
      k.mesh(one("exhaust", (fine) => new T.CylinderGeometry(0.05, 0.05, 0.16, cuts(fine, 10, 6)).rotateZ(Math.PI / 2)), "black", -1.06, 0.7, z * 0.7, 1, 1, 1, tank);
    }
    if (k.rich) k.mesh(one("hatchD", (fine) => lathe([[0.0, 0.0], [0.11, 0.0], [0.11, 0.025], [0.0, 0.03]], cuts(fine, 12, 6))), "oliveDark", 0.6, 0.8, 0.22, 1, 1, 1, tank);
    k.mesh(one("toolbox", (fine) => rounded(0.3, 0.08, 0.2, 0.02, fine)), "khaki", -0.6, 0.86, 0.32, 1, 1, 1, tank);
    if (k.rich) for (let r = 0; r < 8; r++) k.mesh(one("rivet", (fine) => ellipsoid(0.012, 0.012, 0.008, cuts(fine, 5, 3), cuts(fine, 4, 3))), "oliveDark", -0.8 + r * 0.22, 0.76, 0.5, 1, 1, 1, tank);
    const turret = pivot(tank, -0.1, 0.84, 0, "turret");
    k.mesh(one("turret", turretShape), "olive", 0, 0, 0, 1, 1, 1, turret);
    k.mesh(one("turretBand", (fine) => new T.TorusGeometry(1, 0.036, cuts(fine, 4, 3), cuts(fine, 24, 10)).rotateX(Math.PI / 2).scale(0.47, 1, 0.385)), team, -0.03, 0.12, 0, 1, 1, 1, turret);
    k.mesh(one("number", (fine) => rounded(0.16, 0.08, 0.01, 0.004, fine)), "white", -0.12, 0.2, 0.37, 1, 1, 1, turret).rotation.x = -0.35;
    k.mesh(one("mantlet", mantlet), "oliveDark", 0.46, 0.13, 0, 1, 1, 1, turret);
    k.mesh(one("cupola", cupola), "oliveDark", -0.2, 0.26, 0.12, 1, 1, 1, turret);
    k.mesh(one("cupolaHatch", (fine) => lathe([[0.0, 0.0], [0.1, 0.0], [0.1, 0.02], [0.0, 0.03]], cuts(fine, 12, 6))), "olive", -0.2, 0.36, 0.12, 1, 1, 1, turret);
    k.mesh(one("mg", (fine) => merge([rounded(0.18, 0.05, 0.04, 0.01, fine), new T.CylinderGeometry(0.01, 0.01, 0.24, cuts(fine, 6, 4)).rotateZ(Math.PI / 2).translate(0.2, 0.01, 0)])), "black", -0.12, 0.45, -0.15, 1, 1, 1, turret);
    k.mesh("cyl", "dark", -0.32, 0.6, -0.22, 0.007, 0.6, 0.007, turret);
    const barrel = pivot(turret, 0.46, 0.13, 0, "strike");
    k.mesh(one("tankGun", tankGun), "oliveDark", 0, 0, 0, 1, 1, 1, barrel);
    f.muzzle = pivot(barrel, 1.42, 0, 0, "muzzle");
    f.strike = barrel;
    f.style = "barrel";
    f.stride = 0.9;
    tall = 1.9;
  }
  face.scale.x = side ? -1 : 1;
  // Fewer draws: each joint's own parts baked together (they move as one); the tracks keep their own paint.
  const keep = new Set<T.Object3D>(track),
    joints: T.Group[] = [];
  root.traverse((o) => {
    if (o instanceof T.Group) joints.push(o);
  });
  for (const o of joints) {
    const held = o.children.filter((c) => keep.has(c));
    for (const c of held) o.remove(c);
    // Where the processor draws, a joint's plain parts become one vertex-coloured mesh (one draw); with a graphics
    // card each paint keeps its own sheen, parts sharing it baked together.
    if (!k.rich) bakeColours(o, k.tinted, k.own);
    compactGroup(o, k.own);
    for (const c of held) o.add(c);
  }
  for (const t of track) t.name = `track#${named++}`;
  // Blender's baked shade in the vertices of every part (`baked.ts`, tools/blender/erawar/ao.py).
  k.shade?.apply(root, era, kind);
  // Where the processor draws, the figure casts no shadow of its own (a shadow pass costs every part a second draw):
  // a soft patch on the ground under it stands for it.
  if (!k.rich) {
    root.traverse((o) => {
      if (o instanceof T.Mesh) o.castShadow = false;
    });
    const blob = new T.Mesh(k.g.plane, k.blob);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    blob.scale.set(kind === 2 ? 2.6 : 0.8, kind === 2 ? 1.2 : 0.5, 1);
    blob.renderOrder = 1;
    root.add(blob);
  }
  const bar = lifeBar(k, root, side, tall);
  return { ...f, bar: bar.bar, barBack: bar.back, star: bar.star, tall, flash: null, track: null };
}
/** A soldier's own figure: a clone of the template (shapes and paints shared), its joints found again by name. */
function cloneFigure(k: Kit, t: Figure): Figure {
  const root = t.root.clone(true),
    byName = new Map<string, T.Object3D>();
  root.traverse((o) => {
    if (o.name) byName.set(o.name, o);
  });
  const find = <O extends T.Object3D>(o: O | null) => (o ? (byName.get(o.name) as O) : null);
  const list = (os: T.Object3D[]) => os.map((o) => byName.get(o.name)!);
  const f: Figure = {
    ...t,
    root,
    body: find(t.body)!,
    chest: find(t.chest)!,
    legs: list(t.legs),
    knees: list(t.knees),
    arms: list(t.arms),
    elbows: list(t.elbows),
    strike: find(t.strike),
    wheels: list(t.wheels),
    head: find(t.head),
    tail: find(t.tail),
    flaps: list(t.flaps),
    muzzle: find(t.muzzle),
    weapon: find(t.weapon),
    bar: find(t.bar)!,
    barBack: find(t.barBack)!,
    star: find(t.star)!,
    flash: null,
    track: null,
  };
  // The muzzle's flash, a soft burst of light shown for a moment after each shot.
  if (f.muzzle) {
    const flash = new T.Sprite(k.flashMat);
    flash.visible = false;
    flash.scale.setScalar(t.kind === 2 ? 0.9 : 0.4);
    flash.renderOrder = 5;
    f.muzzle.add(flash);
    f.flash = flash;
  }
  // The tank's tracks get a paint of their own, so that they run with it.
  const tracks: T.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh && o.name.startsWith("track#")) tracks.push(o);
  });
  if (tracks.length) {
    const base = tracks[0].material as T.MeshStandardMaterial,
      paint = k.own(base.clone()),
      map = base.map ? k.own(base.map.clone()) : null;
    if (map) {
      map.needsUpdate = true;
      paint.map = map;
    }
    for (const m of tracks) m.material = paint;
    f.track = paint;
  }
  return f;
}
/** A figure for a soldier of an era, kind and side. */
export const makeFigure = (k: Kit, era: number, kind: Kind, side: number) => k.figure(era, kind, side);
/**
 * A figure as it stands: walking (legs and arms swing by the ground it has covered, `dist`, knees bending as a foot
 * comes through), striking (`since` the last blow), its life bar and its rank's star. `t` is the clock, for breathing
 * while it waits and for a beast's ears and tail.
 */
export function poseFigure(f: Figure, dist: number, walking: boolean, since: number, life: number, t: number, rank = 0) {
  const phase = (dist / f.stride) * Math.PI,
    swing = walking ? Math.sin(phase) : 0,
    blow = since < 0.45 ? since / 0.45 : 1;
  if (f.style === "trample") {
    // A gallop: the hind pair and the fore pair each a little apart, the body pitching, the head nodding.
    f.legs.forEach((leg, i) => {
      const lead = i < 2 ? 0 : Math.PI * 0.6,
        a = phase + lead + (i % 2 ? 0.5 : 0);
      leg.rotation.z = walking ? Math.sin(a) * 0.42 : 0;
      f.knees[i].rotation.z = walking ? (i < 2 ? -1 : 1) * Math.max(0, Math.sin(a + Math.PI / 2)) * 0.7 : 0;
    });
    f.body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.07 : Math.sin(t * 2) * 0.01;
    const hit = since < 0.5 ? Math.sin((since / 0.5) * Math.PI) : 0;
    f.body.rotation.z = (walking ? Math.sin(phase * 2) * 0.03 : 0) + hit * 0.12;
    if (f.head) f.head.rotation.z = (walking ? Math.sin(phase * 2 + 0.6) * 0.08 : Math.sin(t * 1.3) * 0.03) - hit * 0.25;
    if (f.strike && f.strike !== f.head) f.strike.rotation.z = (walking ? Math.sin(phase + 1) * 0.15 : Math.sin(t * 1.7) * 0.12) - hit * 0.6;
    if (f.tail) f.tail.rotation.z = Math.sin(t * 3.1 + phase) * 0.25;
    f.flaps.forEach((p, i) => (p.rotation.y = Math.sin(t * 5 + i) * (walking ? 0.35 : 0.15)));
    f.arms.forEach((arm, i) => (arm.rotation.z = (i ? 1.2 : 0.4) + swing * 0.1));
    f.elbows.forEach((e) => (e.rotation.z = 0.5));
  } else {
    // Legs: thighs swing, knees bend as a foot passes under the body.
    f.legs.forEach((leg, i) => {
      const a = phase + (i ? Math.PI : 0);
      leg.rotation.z = walking ? Math.sin(a) * 0.5 : 0;
      f.knees[i].rotation.z = walking ? -Math.max(0, Math.sin(a - Math.PI / 2)) * 0.8 : 0;
    });
    f.arms.forEach((arm, i) => (arm.rotation.z = swing * 0.42 * (i ? 1 : -1)));
    f.elbows.forEach((e) => (e.rotation.z = walking ? 0.35 : 0.2));
    f.body.position.y = walking ? Math.abs(Math.cos(phase)) * 0.035 : Math.sin(t * 2.2) * 0.004;
    const chest = f.chest;
    chest.rotation.z = walking ? -0.06 : -0.02 + Math.sin(t * 2.2) * 0.01;
    if (f.style === "swing" && f.strike) {
      // Raised high, then brought down with the body behind it.
      const raise = blow < 0.35 ? blow / 0.35 : 1 - (blow - 0.35) / 0.65;
      f.strike.rotation.z = blow < 1 ? (blow < 0.35 ? raise * 2.5 : 2.5 - ((blow - 0.35) / 0.65) * 3.2) : swing * 0.4 + (walking ? 0.2 : 0.5);
      if (blow < 1) {
        f.elbows[f.arms.indexOf(f.strike)].rotation.z = blow < 0.35 ? 0.9 : 0.1;
        chest.rotation.z = blow < 0.35 ? 0.12 * raise : -0.25 * (1 - (blow - 0.35) / 0.65);
      }
    } else if (f.style === "throw" && f.strike) {
      f.strike.rotation.z = blow < 1 ? 3.6 * Math.sin(blow * Math.PI) : walking ? swing * 0.4 : 0.3 + Math.sin(t * 9) * 0.6;
      if (blow < 1) chest.rotation.z = -0.2 * Math.sin(blow * Math.PI);
    } else if (f.style === "shoot" && f.strike) {
      // Held level at the foe (the other hand under it), kicked up a little by each shot, the body rocked back.
      const i = f.arms.indexOf(f.strike),
        other = 1 - i;
      f.strike.rotation.z = Math.PI / 2 - (blow < 1 ? (1 - blow) * 0.25 : 0);
      f.elbows[i].rotation.z = 0;
      if (f.arms[other]) {
        f.arms[other].rotation.z = Math.PI / 2.4;
        f.elbows[other].rotation.z = 0.55;
      }
      if (blow < 1) chest.rotation.z = 0.08 * (1 - blow);
      // The gun (or the bow) kept level at the foe whatever the arm does: a gun's length along +x, a bow upright.
      if (f.weapon) f.weapon.rotation.z = (f.era === 1 ? 0 : -Math.PI / 2) - f.strike.rotation.z - f.elbows[i].rotation.z - chest.rotation.z;
    } else if (f.style === "barrel" && f.strike) {
      f.strike.position.x = f.strike.userData.x ?? (f.strike.userData.x = f.strike.position.x);
      f.strike.position.x -= blow < 1 ? (1 - blow) * 0.24 : 0;
      if (f.kind === 2 && f.era === 3) {
        // The tank rocks back on its tracks with the shot, and sways as it rolls.
        f.body.rotation.z = (blow < 1 ? (1 - blow) * 0.04 : 0) + (walking ? Math.sin(phase * 1.3) * 0.008 : 0);
        f.body.position.y = walking ? Math.abs(Math.sin(phase * 2)) * 0.012 : 0;
      }
    }
  }
  for (const w of f.wheels) w.rotation.z = -dist / 0.36;
  if (f.track?.map) f.track.map.offset.x = (dist / 1.95) * 6;
  if (f.flash) f.flash.visible = since < 0.07;
  f.bar.scale.x = Math.max(0.001, 0.58 * life);
  f.bar.position.x = -0.29 * (1 - life);
  f.bar.visible = f.barBack.visible = life < 0.999;
  f.star.visible = rank > 0;
}

/** Pale pictures for cloth, fur, hide, mail, camouflage and hair, tinted by their paints' colours (a graphics card's look). */
const pictures = {
  /** Fur: tufts of strands, light and dark (`long` for the mammoth's shaggy coat). */
  fur: (long: number) =>
    canvas(128, 128, (ctx) => {
      ctx.fillStyle = "#cfcfcf";
      ctx.fillRect(0, 0, 128, 128);
      let s = 7 + long;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 900; i++) {
        const x = r() * 128,
          y = r() * 128,
          len = (long ? 14 : 6) + r() * (long ? 22 : 8),
          v = 120 + r() * 135;
        ctx.strokeStyle = `rgb(${v},${v},${v})`;
        ctx.lineWidth = 0.8 + r() * 1.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (r() - 0.5) * 6, y + len * 0.5, x + (r() - 0.5) * 8, y + len);
        ctx.stroke();
      }
    }),
  /** Hide and leather: a mottled skin with creases. */
  hide: () =>
    canvas(128, 128, (ctx) => {
      ctx.fillStyle = "#dcdcdc";
      ctx.fillRect(0, 0, 128, 128);
      let s = 11;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 260; i++) {
        const v = 170 + r() * 85;
        ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
        ctx.beginPath();
        ctx.ellipse(r() * 128, r() * 128, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(120,120,120,0.35)";
      for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        const x = r() * 128,
          y = r() * 128;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 10);
        ctx.stroke();
      }
    }),
  /** Mail: rows of interlinked rings. */
  mail: () =>
    canvas(64, 64, (ctx) => {
      ctx.fillStyle = "#585858";
      ctx.fillRect(0, 0, 64, 64);
      for (let row = 0; row < 9; row++)
        for (let col = 0; col < 9; col++) {
          const x = col * 8 + (row % 2) * 4,
            y = row * 7.2;
          ctx.strokeStyle = "#f0f0f0";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(x, y, 3.4, 3.0, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "#9a9a9a";
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.ellipse(x + 0.6, y + 0.6, 3.4, 3.0, 0, 0.2, 2);
          ctx.stroke();
        }
    }),
  /** Woven cloth: a fine weave and soft folds running down. */
  weave: () =>
    canvas(128, 128, (ctx) => {
      ctx.fillStyle = "#ececec";
      ctx.fillRect(0, 0, 128, 128);
      for (let x = 0; x < 128; x += 2) {
        ctx.fillStyle = `rgba(0,0,0,${x % 4 ? 0.05 : 0.09})`;
        ctx.fillRect(x, 0, 1, 128);
      }
      for (let y = 0; y < 128; y += 2) {
        ctx.fillStyle = `rgba(0,0,0,${y % 4 ? 0.04 : 0.08})`;
        ctx.fillRect(0, y, 128, 1);
      }
      for (let i = 0; i < 6; i++) {
        const x = 10 + i * 21,
          g = ctx.createLinearGradient(x - 8, 0, x + 8, 0);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.5, "rgba(0,0,0,0.12)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 8, 0, 16, 128);
      }
    }),
  /** Camouflage: blotches in three shades over the weave. */
  camo: () =>
    canvas(128, 128, (ctx) => {
      ctx.fillStyle = "#e6e6e6";
      ctx.fillRect(0, 0, 128, 128);
      let s = 5;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (const [shade, n] of [
        ["#b3b39a", 18],
        ["#8a8a78", 14],
        ["#5a5a50", 10],
      ] as const)
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = shade;
          ctx.beginPath();
          const x = r() * 128,
            y = r() * 128;
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2,
              d = 6 + r() * 10;
            if (k) ctx.lineTo(x + Math.cos(a) * d * 1.4, y + Math.sin(a) * d);
            else ctx.moveTo(x + Math.cos(a) * d * 1.4, y + Math.sin(a) * d);
          }
          ctx.fill();
        }
    }),
  /** Hair: fine strands. */
  strands: () =>
    canvas(64, 64, (ctx) => {
      ctx.fillStyle = "#d0d0d0";
      ctx.fillRect(0, 0, 64, 64);
      let s = 3;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 260; i++) {
        const v = 110 + r() * 145,
          x = r() * 64;
        ctx.strokeStyle = `rgb(${v},${v},${v})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x, r() * 64);
        ctx.lineTo(x + (r() - 0.5) * 3, r() * 64);
        ctx.stroke();
      }
    }),
};
