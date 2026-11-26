import * as T from "three";
import { canvas, glow, texture, type Own } from "../goldraid/paint";
import { compactGroup } from "../badminton/merge";
import { bakeColours } from "./bake";
import { bark, grain, grained } from "../../engine/grain";
import type { Kind } from "./sim";

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
  constructor(
    readonly own: Own,
    readonly rich: boolean,
  ) {
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
      this.m[`team${side}`] = mat(c, { roughness: 0.6 });
      this.m[`teamDark${side}`] = mat(new T.Color(c).multiplyScalar(0.62).getStyle(), { roughness: 0.7 });
      this.m[`teamGlow${side}`] = mat(c, { emissive: c, emissiveIntensity: 0.25 });
      this.m[`bar${side}`] = own(new T.MeshBasicMaterial({ color: side ? "#6fb0ff" : "#ff7a5a", depthTest: false }));
    });
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
}
/** A person: jointed legs and boots, hips and a chest, a head with a face, two jointed arms; `scale` for a rider. */
function person(k: Kit, parent: T.Object3D, o: Dress): Person {
  const body = pivot(parent, 0, 0, 0);
  body.scale.setScalar(o.scale ?? 1);
  const skin = o.skin ?? "skin",
    legs: T.Group[] = [],
    knees: T.Group[] = [];
  for (const z of [-0.085, 0.085]) {
    const leg = pivot(body, 0, 0.56, z, "leg");
    k.mesh("limb", o.legs, 0, 0, 0, 0.078, 0.29, 0.078, leg);
    const knee = pivot(leg, 0, -0.28, 0, "knee");
    k.mesh("limb", o.legs, 0, 0, 0, 0.064, 0.22, 0.064, knee);
    k.mesh("limb", o.boot ?? "boot", 0, -0.17, 0, 0.068, 0.09, 0.068, knee);
    k.mesh("box", o.boot ?? "boot", 0.045, -0.265, 0, 0.19, 0.06, 0.1, knee);
    if (o.sitting) {
      leg.rotation.z = Math.PI / 2.3;
      knee.rotation.z = -Math.PI / 2.2;
    }
    legs.push(leg);
    knees.push(knee);
  }
  // Hips, then the chest on its own pivot (it leans).
  k.mesh("box", o.legs, 0, 0.6, 0, 0.21, 0.13, 0.3, body);
  const chest = pivot(body, 0, 0.62, 0, "chest");
  k.mesh("box", o.cloth, 0, 0.17, 0, 0.21, 0.36, 0.3, chest);
  k.mesh("ball", o.cloth, 0, 0.32, 0, 0.12, 0.08, 0.17, chest);
  // Neck and head: skull, face (eyes and pupils, brows, nose, mouth), ears, hair.
  k.mesh("cyl", skin, 0.005, 0.41, 0, 0.045, 0.08, 0.045, chest);
  const head = pivot(chest, 0.01, 0.52, 0, "head");
  k.mesh("ball", skin, 0, 0, 0, 0.112, 0.128, 0.108, head);
  k.mesh("ball", skin, 0.045, -0.06, 0, 0.07, 0.055, 0.075, head);
  for (const z of [-0.04, 0.04]) {
    k.mesh("dot", "eye", 0.092, 0.018, z, 0.022, 0.02, 0.02, head);
    k.mesh("dot", "pupil", 0.108, 0.018, z, 0.011, 0.012, 0.011, head);
    k.mesh("box", o.hair ?? "hair", 0.1, 0.05, z, 0.012, 0.013, 0.036, head).rotation.x = z > 0 ? -0.15 : 0.15;
    k.mesh("dot", skin, -0.005, 0.0, z * 2.7, 0.022, 0.034, 0.016, head);
  }
  k.mesh("cone4", skin, 0.118, -0.01, 0, 0.018, 0.045, 0.02, head).rotation.z = -Math.PI / 2;
  k.mesh("box", "lip", 0.106, -0.058, 0, 0.008, 0.009, 0.038, head);
  k.mesh("ball", o.hair ?? "hair", -0.02, 0.045, 0, 0.115, 0.095, 0.11, head);
  if (o.beard) {
    k.mesh("ball", "beard", 0.07, -0.08, 0, 0.055, 0.06, 0.08, head);
    k.mesh("box", "beard", 0.1, -0.03, 0, 0.012, 0.014, 0.06, head);
  }
  const arms: T.Group[] = [],
    elbows: T.Group[] = [];
  let hand = pivot(chest, 0, 0, 0),
    off = hand;
  for (const z of [-0.19, 0.19]) {
    const arm = pivot(chest, 0, 0.34, z, "arm");
    k.mesh("ball", o.sleeve ?? o.cloth, 0, 0, 0, 0.065, 0.065, 0.065, arm);
    k.mesh("limb", o.sleeve ?? o.cloth, 0, 0, 0, 0.058, 0.22, 0.058, arm);
    const elbow = pivot(arm, 0, -0.21, 0, "elbow");
    k.mesh("limb", o.sleeve ?? o.cloth, 0, 0, 0, 0.05, 0.18, 0.05, elbow);
    k.mesh("ball", skin, 0, -0.2, 0, 0.045, 0.05, 0.04, elbow);
    arms.push(arm);
    elbows.push(elbow);
    const grip = pivot(elbow, 0, -0.2, z > 0 ? 0.02 : -0.02, "hand");
    if (z > 0) hand = grip;
    else off = grip;
  }
  return { body, chest, legs, knees, arms, elbows, head, hand, off };
}
/** A hat or helmet on a head. */
function headgear(k: Kit, p: Person, era: number, kind: Kind, side: number) {
  const h = p.head,
    team = `team${side}`;
  if (era === 0) {
    // Wild hair under a band in the side's colour; feathers; the slinger's hide cap; paint across the cheeks.
    k.mesh("ball", "hair", -0.035, 0.03, 0, 0.125, 0.12, 0.12, h);
    k.mesh("cyl", team, 0, 0.045, 0, 0.122, 0.035, 0.122, h);
    k.mesh("box", team, 0.098, -0.02, 0.05, 0.006, 0.012, 0.03, h);
    k.mesh("box", team, 0.098, -0.02, -0.05, 0.006, 0.012, 0.03, h);
    if (kind === 1) k.mesh("cap", "hide", -0.01, 0.04, 0, 0.128, 0.1, 0.124, h);
    else {
      const f = k.mesh("cone4", "feather", -0.06, 0.16, 0.06, 0.018, 0.16, 0.008, h);
      f.rotation.z = 0.5;
      k.mesh("cone4", team, -0.08, 0.14, 0.075, 0.014, 0.12, 0.006, h).rotation.z = 0.8;
    }
  } else if (era === 1) {
    if (kind === 1) {
      k.mesh("cap", "hood", -0.01, 0.0, 0, 0.142, 0.172, 0.137, h);
      k.mesh("cone", "hood", -0.12, 0.05, 0, 0.05, 0.14, 0.05, h).rotation.z = Math.PI / 2.6;
      k.mesh("box", "hood", -0.04, -0.12, 0, 0.14, 0.06, 0.24, h);
    } else {
      // A spangen helm with a nasal and a mail coif, a plume in the side's colour.
      k.mesh("cyl", "iron", 0, 0.06, 0, 0.128, 0.12, 0.128, h);
      k.mesh("cone", "iron", 0, 0.165, 0, 0.13, 0.12, 0.13, h);
      k.mesh("box", "steel", 0.122, 0.0, 0, 0.018, 0.13, 0.026, h);
      k.mesh("cyl", "mail", -0.01, -0.08, 0, 0.125, 0.12, 0.125, h);
      k.mesh("cone", team, -0.02, 0.29, 0, 0.03, 0.12, 0.03, h);
      k.mesh("ball", team, -0.05, 0.3, 0, 0.03, 0.05, 0.03, h);
    }
  } else if (era === 2) {
    if (kind === 0) {
      // A cocked hat with a cockade.
      k.mesh("cyl6", "black", 0, 0.09, 0, 0.18, 0.035, 0.17, h).rotation.y = Math.PI / 6;
      k.mesh("cap", "black", 0, 0.09, 0, 0.11, 0.1, 0.11, h);
      k.mesh("disc", team, 0.02, 0.15, 0.13, 0.035, 0.01, 0.035, h).rotation.x = Math.PI / 2;
    } else {
      // A tall shako with a peak, a plate and a plume in the side's colour.
      k.mesh("cyl", "black", 0, 0.15, 0, 0.11, 0.2, 0.105, h);
      k.mesh("box", "black", 0.1, 0.06, 0, 0.09, 0.012, 0.15, h);
      k.mesh("box", "brass", 0.106, 0.15, 0, 0.006, 0.06, 0.05, h);
      k.mesh("ball", team, 0.02, 0.3, 0, 0.035, 0.075, 0.035, h);
    }
  } else {
    // A helmet with a cover, a strap and goggles; the machine gunner's ear-cups.
    k.mesh("cap", "oliveDark", 0, 0.02, 0, 0.148, 0.135, 0.148, h);
    k.mesh("cyl", "oliveDark", 0, 0.02, 0, 0.158, 0.018, 0.158, h);
    k.mesh("box", "webbing", 0.06, -0.06, 0, 0.012, 0.11, 0.18, h).rotation.z = -0.3;
    k.mesh("cyl", "rubber", 0.06, 0.08, 0, 0.14, 0.028, 0.14, h).rotation.z = 0.25;
    for (const z of [-0.045, 0.045]) k.mesh("disc", "glass", 0.12, 0.085, z, 0.028, 0.012, 0.028, h).rotation.z = Math.PI / 2 - 0.25;
    k.mesh("box", `team${side}`, -0.02, 0.13, 0.14, 0.04, 0.03, 0.01, h);
    if (kind === 1) for (const z of [-0.12, 0.12]) k.mesh("disc", "rubber", 0, -0.01, z, 0.04, 0.02, 0.04, h).rotation.x = Math.PI / 2;
  }
}
/** A person of an era and kind, gear and weapon on. Returns the person and its weapon's mouth. */
function soldier(k: Kit, parent: T.Object3D, era: number, kind: Kind, side: number, scale = 1, sitting = false): { p: Person; muzzle: T.Object3D | null } {
  const team = `team${side}`,
    dark = `teamDark${side}`,
    dress: Dress =
      era === 0
        ? { cloth: kind === 1 ? "hide" : "fur", legs: "skin2", sleeve: "skin2", skin: "skin2", boot: "leather", beard: kind !== 1, hair: kind === 1 ? "hairRed" : "hair" }
        : era === 1
          ? { cloth: "mail", legs: kind === 1 ? "leather" : "mail", sleeve: kind === 1 ? "green" : "mail", boot: "leatherDark", hair: "hairRed" }
          : era === 2
            ? { cloth: team, legs: "white", sleeve: team, boot: "black" }
            : { cloth: "olive", legs: "olive", sleeve: "olive", boot: "black" };
  const p = person(k, parent, { ...dress, scale, sitting });
  headgear(k, p, era, kind, side);
  const c = p.chest,
    hand = p.hand;
  let muzzle: T.Object3D | null = null;
  // The layers over the body, each era's own; the side's colour on each.
  if (era === 0) {
    // A fur tunic with a ragged hem, a hide belt, a necklace of teeth, paint on the arms.
    for (let i = 0; i < 6; i++) k.mesh("cone4", kind === 1 ? "hide" : "furDark", 0.01, -0.06, -0.12 + i * 0.048, 0.03, 0.1, 0.03, c).rotation.z = Math.PI;
    k.mesh("box", team, 0, 0.02, 0, 0.215, 0.05, 0.305, c);
    for (let i = 0; i < 5; i++) k.mesh("cone4", "bone", 0.108, 0.27 - Math.abs(i - 2) * 0.02, -0.06 + i * 0.03, 0.01, 0.035, 0.01, c).rotation.z = Math.PI;
    k.mesh("box", "furLight", -0.02, 0.33, -0.12, 0.18, 0.06, 0.1, c).rotation.x = 0.4;
    for (const arm of p.arms) k.mesh("cyl", team, 0, -0.1, 0, 0.06, 0.02, 0.06, arm);
  } else if (era === 1) {
    if (kind === 1) {
      // The archer: a green jerkin over mail, a belt with a pouch, a quiver of arrows on the back.
      k.mesh("box", "green", 0.004, 0.14, 0, 0.215, 0.32, 0.305, c);
      k.mesh("box", team, 0.006, 0.02, 0, 0.217, 0.06, 0.307, c);
      const quiver = pivot(c, -0.13, 0.2, -0.06);
      quiver.rotation.z = 0.35;
      k.mesh("cyl", "leather", 0, 0, 0, 0.05, 0.32, 0.05, quiver);
      for (let i = 0; i < 4; i++) {
        k.mesh("cyl", "wood", 0.015 * (i - 1.5), 0.2, 0.012 * (i % 2), 0.006, 0.14, 0.006, quiver);
        k.mesh("box", "feather", 0.015 * (i - 1.5), 0.27, 0.012 * (i % 2), 0.02, 0.05, 0.004, quiver);
      }
    } else {
      // A tabard in the side's colour with a gold badge, a belt, pauldrons.
      k.mesh("box", team, 0.005, 0.1, 0, 0.217, 0.42, 0.25, c);
      k.mesh("box", "gold", 0.115, 0.17, 0, 0.004, 0.11, 0.025, c);
      k.mesh("box", "gold", 0.115, 0.19, 0, 0.004, 0.025, 0.08, c);
      k.mesh("box", "leatherDark", 0.005, 0.02, 0, 0.22, 0.04, 0.31, c);
      k.mesh("box", "brass", 0.115, 0.02, 0, 0.006, 0.035, 0.04, c);
      for (const arm of p.arms) k.mesh("cap", "iron", 0, 0.02, 0, 0.09, 0.07, 0.09, arm);
    }
  } else if (era === 2) {
    // A coat in the side's colour with white lapels and cuffs, coat tails, cross-belts, brass buttons, gaiters, a pack.
    k.mesh("box", "white", 0.106, 0.2, 0.06, 0.006, 0.26, 0.05, c);
    k.mesh("box", "white", 0.106, 0.2, -0.06, 0.006, 0.26, 0.05, c);
    for (let i = 0; i < 4; i++) k.mesh("dot", "brass", 0.112, 0.08 + i * 0.07, 0, 0.012, 0.012, 0.012, c);
    for (const r of [0.6, -0.6]) k.mesh("box", "white", 0.004, 0.17, 0, 0.214, 0.045, 0.31, c).rotation.x = r;
    k.mesh("box", dark, -0.04, -0.12, 0, 0.14, 0.2, 0.28, c).rotation.z = -0.15;
    k.mesh("box", "leatherDark", -0.14, 0.18, 0, 0.08, 0.2, 0.22, c);
    k.mesh("cyl", "white", -0.14, 0.3, 0, 0.04, 0.22, 0.04, c).rotation.x = Math.PI / 2;
    for (const elbow of p.elbows) k.mesh("cyl", "white", 0, -0.15, 0, 0.055, 0.05, 0.055, elbow);
    for (const knee of p.knees) k.mesh("limb", "black", 0, -0.04, 0, 0.068, 0.14, 0.068, knee);
  } else {
    // A vest of pouches over the fatigues, an armband in the side's colour, a pack with a roll, gloves.
    k.mesh("box", "oliveDark", 0.01, 0.17, 0, 0.235, 0.3, 0.32, c);
    for (let i = 0; i < 3; i++) k.mesh("box", "webbing", 0.128, 0.06 + (i % 2) * 0.02, -0.08 + i * 0.08, 0.03, 0.07, 0.06, c);
    k.mesh("box", "webbing", 0.124, 0.22, 0.07, 0.02, 0.05, 0.05, c);
    k.mesh("box", "khaki", -0.15, 0.17, 0, 0.1, 0.24, 0.24, c);
    k.mesh("cyl", "oliveDark", -0.15, 0.31, 0, 0.045, 0.24, 0.045, c).rotation.x = Math.PI / 2;
    k.mesh("cyl", team, 0, -0.06, 0, 0.062, 0.05, 0.062, p.arms[0]);
    k.mesh("cyl", team, 0, -0.06, 0, 0.062, 0.05, 0.062, p.arms[1]);
    for (const elbow of p.elbows) k.mesh("ball", "rubber", 0, -0.2, 0, 0.048, 0.052, 0.042, elbow);
    if (kind === 1) {
      // The radio's aerial on the gunner's pack.
      k.mesh("cyl", "black", -0.2, 0.55, -0.08, 0.005, 0.5, 0.005, c);
      k.mesh("box", "dark", -0.2, 0.2, -0.08, 0.06, 0.16, 0.12, c);
    }
  }
  // The weapon.
  if (era === 0) {
    if (kind === 0) {
      // A knotted club studded with flint.
      const club = pivot(hand, 0, 0, 0);
      club.rotation.z = -Math.PI / 2.3;
      k.mesh("cyl", "wood", 0, 0.18, 0, 0.026, 0.42, 0.026, club);
      k.mesh("ball", "woodDark", 0, 0.42, 0, 0.075, 0.11, 0.075, club);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.mesh("cone4", "flint", Math.cos(a) * 0.06, 0.43 + (i % 2) * 0.04, Math.sin(a) * 0.06, 0.02, 0.06, 0.02, club).rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
      }
      k.mesh("cyl", "leather", 0, 0.03, 0, 0.032, 0.08, 0.032, club);
    } else if (kind === 1) {
      k.mesh("cyl", "rope", 0, -0.08, 0, 0.008, 0.18, 0.008, hand);
      k.mesh("ball", "hide", 0, -0.17, 0, 0.04, 0.03, 0.04, hand);
      k.mesh("ball", "stone", 0, -0.18, 0, 0.032, 0.03, 0.032, hand);
      k.mesh("box", "hide", -0.06, 0.02, -0.17, 0.09, 0.11, 0.06, c);
      for (let i = 0; i < 3; i++) k.mesh("ballLo", "stone", -0.06 + (i - 1) * 0.025, 0.09, -0.17, 0.02, 0.018, 0.02, c);
      muzzle = pivot(hand, 0, -0.18, 0, "muzzle");
    } else {
      const spear = pivot(hand, 0, 0, 0);
      spear.rotation.z = -Math.PI / 2.1;
      k.mesh("cyl", "wood", 0, 0.2, 0, 0.018, 0.9, 0.018, spear);
      k.mesh("cone4", "flint", 0, 0.7, 0, 0.04, 0.14, 0.02, spear);
      k.mesh("cyl", "leather", 0, 0.62, 0, 0.024, 0.04, 0.024, spear);
      k.mesh("box", team, 0.03, 0.56, 0, 0.06, 0.05, 0.004, spear);
    }
  } else if (era === 1) {
    if (kind === 0) {
      const sword = pivot(hand, 0, 0, 0);
      sword.rotation.z = -Math.PI / 2.2;
      k.mesh("cyl", "leatherDark", 0, 0.0, 0, 0.018, 0.1, 0.018, sword);
      k.mesh("dot", "brass", 0, -0.06, 0, 0.025, 0.025, 0.025, sword);
      k.mesh("box", "brass", 0, 0.06, 0, 0.03, 0.025, 0.16, sword);
      k.mesh("box", "steel", 0, 0.34, 0, 0.022, 0.52, 0.05, sword);
      k.mesh("box", "iron", 0, 0.3, 0, 0.024, 0.4, 0.012, sword);
      k.mesh("cone4", "steel", 0, 0.64, 0, 0.026, 0.08, 0.035, sword);
      // A kite shield on the far arm, in the side's colour with a gold rim and a badge.
      // (Held out before the body, toward the eye, so that it is seen.)
      const shield = pivot(p.off, 0.08, 0.3, 0.36);
      shield.rotation.y = 0.35;
      const face = k.mesh("kite", team, 0, 0, 0, 0.36, 0.42, 0.6, shield);
      face.castShadow = true;
      k.mesh("box", "gold", 0, 0.03, -0.03, 0.04, 0.3, 0.012, shield);
      k.mesh("box", "gold", 0, 0.1, -0.03, 0.2, 0.04, 0.012, shield);
    } else if (kind === 1) {
      const bow = pivot(p.off, 0.05, 0.0, 0.02);
      const arc = new T.Mesh(k.g.arc, k.m.wood);
      arc.scale.set(0.22, 0.45, 0.5);
      arc.rotation.z = -Math.PI / 2;
      arc.castShadow = true;
      bow.add(arc);
      k.mesh("cyl", "rope", 0, 0, 0, 0.004, 0.88, 0.004, bow);
      k.mesh("cyl", "leather", 0, 0, 0, 0.018, 0.08, 0.018, bow);
      muzzle = pivot(bow, 0.2, 0, 0, "muzzle");
    } else {
      const lance = pivot(hand, 0, 0, 0);
      lance.rotation.z = -Math.PI / 2;
      k.mesh("cone", "wood", 0, 0.55, 0, 0.04, 1.6, 0.04, lance);
      k.mesh("cone", team, 0, 0.05, 0, 0.08, 0.2, 0.08, lance).rotation.x = Math.PI;
      k.mesh("cone4", "steel", 0, 1.38, 0, 0.03, 0.12, 0.03, lance);
    }
  } else if (era === 2) {
    const gun = pivot(hand, 0, 0, 0);
    gun.rotation.z = -Math.PI / 2;
    k.mesh("box", "wood", -0.005, 0.08, 0, 0.045, 0.32, 0.05, gun);
    k.mesh("box", "wood", -0.03, -0.08, 0, 0.07, 0.1, 0.045, gun).rotation.z = 0.25;
    k.mesh("cyl", "dark", 0.012, 0.45, 0, 0.014, 0.52, 0.014, gun);
    k.mesh("box", "brass", 0.01, 0.12, 0, 0.05, 0.05, 0.052, gun);
    for (const y of [0.3, 0.55]) k.mesh("cyl", "brass", 0.012, y, 0, 0.02, 0.015, 0.02, gun);
    if (kind === 0) k.mesh("cone4", "steel", 0.012, 0.8, 0, 0.012, 0.2, 0.012, gun);
    muzzle = pivot(gun, 0.012, 0.72, 0, "muzzle");
  } else {
    const gun = pivot(hand, 0, 0, 0);
    gun.rotation.z = -Math.PI / 2;
    if (kind === 0) {
      // A carbine: stock, grip, magazine, a short barrel with its guard, a sight.
      k.mesh("box", "black", 0, 0.14, 0, 0.055, 0.34, 0.05, gun);
      k.mesh("box", "black", -0.05, -0.06, 0, 0.06, 0.14, 0.04, gun).rotation.z = 0.2;
      k.mesh("box", "black", -0.06, 0.15, 0, 0.09, 0.04, 0.035, gun).rotation.z = -0.25;
      k.mesh("box", "oliveDark", 0, 0.3, 0, 0.06, 0.12, 0.055, gun);
      k.mesh("cyl", "black", 0, 0.44, 0, 0.012, 0.14, 0.012, gun);
      k.mesh("box", "dark", 0.04, 0.16, 0, 0.02, 0.06, 0.02, gun);
      muzzle = pivot(gun, 0, 0.52, 0, "muzzle");
    } else {
      // A machine gun with its bipod, a belt of rounds and the ammunition box on the hip.
      k.mesh("box", "black", 0, 0.2, 0, 0.07, 0.5, 0.08, gun);
      k.mesh("cyl", "black", 0.01, 0.56, 0, 0.022, 0.32, 0.022, gun);
      k.mesh("cyl", "dark", 0.01, 0.5, 0, 0.032, 0.16, 0.032, gun);
      k.mesh("box", "dark", -0.06, 0.18, 0, 0.08, 0.12, 0.06, gun);
      for (const z of [-0.04, 0.04]) k.mesh("cyl", "dark", -0.06, 0.62, z, 0.006, 0.16, 0.006, gun).rotation.z = z > 0 ? 0.3 : -0.3;
      for (let i = 0; i < 6; i++) k.mesh("box", "brass", -0.04 - i * 0.015, 0.22 - i * 0.03, 0.05, 0.012, 0.012, 0.02, gun);
      k.mesh("box", "olive", -0.07, 0.03, 0.17, 0.1, 0.1, 0.08, c);
      muzzle = pivot(gun, 0.01, 0.73, 0, "muzzle");
    }
  }
  return { p, muzzle };
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
/** Builds a template of a figure for a soldier of an era, kind and side. */
function build(k: Kit, era: number, kind: Kind, side: number): Figure {
  const root = new T.Group(),
    // Mirrored for side 1 (its soldiers go leftward, their weapons still on the near side); the life bar, on the root, is not.
    face = pivot(root, 0, 0, 0, "face"),
    body = pivot(face, 0, 0, 0, "body"),
    team = `team${side}`,
    f: Draft = { root, body, chest: body, legs: [], knees: [], arms: [], elbows: [], strike: null, style: "swing", wheels: [], head: null, tail: null, flaps: [], muzzle: null, stride: 0.55, era, kind };
  let tall = 1.48,
    track: T.Mesh[] = [];
  if (kind !== 2) {
    const { p, muzzle } = soldier(k, body, era, kind, side);
    Object.assign(f, { chest: p.chest, legs: p.legs, knees: p.knees, arms: p.arms, elbows: p.elbows, muzzle });
    f.strike = p.arms[1];
    f.style = kind === 0 ? "swing" : era === 0 ? "throw" : "shoot";
    if (era === 1 && kind === 1) f.strike = p.arms[0];
  } else if (era === 0) {
    // A woolly mammoth: a shaggy humped body, a domed head with flapping ears, curling tusks, a swinging trunk; its
    // rider on a blanket in the side's colour.
    const beast = pivot(body, 0, 0, 0, "beast");
    f.chest = beast;
    k.mesh("ball", "fur", 0, 1.15, 0, 0.84, 0.64, 0.52, beast);
    k.mesh("ball", "furDark", -0.1, 1.42, 0, 0.62, 0.4, 0.46, beast);
    for (let i = 0; i < 7; i++) k.mesh("cone4", "furDark", -0.6 + i * 0.2, 0.6, (i % 2 ? 1 : -1) * 0.42, 0.08, 0.3, 0.06, beast).rotation.x = Math.PI;
    const head = pivot(beast, 0.74, 1.32, 0, "head");
    f.head = head;
    k.mesh("ball", "fur", 0, 0, 0, 0.37, 0.38, 0.35, head);
    k.mesh("ball", "furDark", -0.05, 0.25, 0, 0.27, 0.22, 0.27, head);
    for (const z of [-1, 1]) {
      const ear = pivot(head, -0.08, 0.04, z * 0.3, "flap");
      k.mesh("ball", "furDark", 0, 0, z * 0.05, 0.1, 0.18, 0.06, ear);
      f.flaps.push(ear);
      k.mesh("dot", "eye", 0.26, 0.09, z * 0.17, 0.035, 0.03, 0.03, head);
      k.mesh("dot", "pupil", 0.29, 0.09, z * 0.17, 0.02, 0.02, 0.02, head);
      const tusk = new T.Mesh(k.g.arc, k.m.tusk);
      tusk.scale.set(0.32, 0.32, 1);
      tusk.rotation.z = Math.PI;
      tusk.position.set(0.32, -0.2, z * 0.15);
      tusk.castShadow = true;
      head.add(tusk);
    }
    const trunk = pivot(head, 0.3, -0.06, 0, "strike");
    for (let s = 0; s < 5; s++) k.mesh("cyl", "fur", 0.04 * s, -0.13 * s - 0.07, 0, 0.09 - s * 0.012, 0.16, 0.09 - s * 0.012, trunk).rotation.z = 0.14 * s;
    f.strike = trunk;
    for (const [x, z] of [[0.45, -0.26], [0.45, 0.26], [-0.45, -0.26], [-0.45, 0.26]] as const) beastLeg(k, beast, x, 0.95, z, [0.17, 0.5], [0.14, 0.4], "fur", "furDark", f);
    k.mesh("box", team, -0.05, 1.76, 0, 0.62, 0.07, 0.64, beast);
    for (const z of [-0.33, 0.33]) k.mesh("box", "gold", -0.05, 1.7, z, 0.62, 0.05, 0.02, beast);
    const tail = pivot(beast, -0.82, 1.15, 0, "tail");
    k.mesh("cyl", "furDark", -0.05, -0.18, 0, 0.04, 0.4, 0.04, tail).rotation.z = 0.3;
    k.mesh("ball", "fur", -0.12, -0.38, 0, 0.06, 0.08, 0.06, tail);
    f.tail = tail;
    const rider = pivot(beast, -0.05, 1.12, 0);
    const { p } = soldier(k, rider, 0, 2, side, 0.82, true);
    f.arms = p.arms;
    f.elbows = p.elbows;
    f.style = "trample";
    f.stride = 1.1;
    tall = 2.6;
  } else if (era === 1) {
    // A knight on a barded horse (a caparison of the side's colour with a gold trim), lance couched, a pennant on it.
    const horse = pivot(body, 0, 0, 0, "beast");
    f.chest = horse;
    k.mesh("ball", "horse", 0, 1.02, 0, 0.64, 0.3, 0.25, horse);
    k.mesh("ball", "horseLight", 0.35, 1.05, 0, 0.3, 0.27, 0.24, horse);
    k.mesh("box", team, -0.02, 0.95, 0, 1.04, 0.42, 0.53, horse);
    for (const z of [-0.27, 0.27]) {
      k.mesh("box", "gold", -0.02, 0.75, z, 1.05, 0.04, 0.01, horse);
      k.mesh("disc", "gold", -0.02, 0.98, z * 1.01, 0.12, 0.012, 0.12, horse).rotation.x = Math.PI / 2;
    }
    const neck = pivot(horse, 0.5, 1.14, 0, "head");
    f.head = neck;
    k.mesh("cyl", "horse", 0.1, 0.22, 0, 0.12, 0.52, 0.11, neck).rotation.z = -0.55;
    k.mesh("box", "horse", 0.37, 0.42, 0, 0.38, 0.15, 0.15, neck).rotation.z = -0.35;
    k.mesh("box", "iron", 0.37, 0.45, 0, 0.3, 0.16, 0.16, neck).rotation.z = -0.35;
    k.mesh("box", "mane", 0.02, 0.33, 0, 0.34, 0.08, 0.05, neck).rotation.z = -0.55;
    for (const z of [-0.06, 0.06]) k.mesh("cone", "horse", 0.2, 0.6, z, 0.035, 0.1, 0.035, neck);
    k.mesh("dot", "pupil", 0.42, 0.5, 0.075, 0.018, 0.018, 0.018, neck);
    f.strike = neck;
    for (const [x, z] of [[0.38, -0.13], [0.38, 0.13], [-0.4, -0.13], [-0.4, 0.13]] as const) beastLeg(k, horse, x, 0.86, z, [0.065, 0.42], [0.05, 0.38], "horse", "black", f);
    const tail = pivot(horse, -0.62, 1.02, 0, "tail");
    k.mesh("cone", "mane", -0.08, -0.22, 0, 0.07, 0.5, 0.07, tail).rotation.z = 2.7;
    f.tail = tail;
    const rider = pivot(horse, -0.05, 0.78, 0);
    const { p } = soldier(k, rider, 1, 2, side, 0.9, true);
    k.mesh("cone", team, -0.02, 0.29, 0, 0.04, 0.14, 0.04, p.head);
    const pennant = pivot(p.hand, 0.0, 0.0, 0.0, "flap");
    pennant.position.set(0.0, 0, 0);
    k.mesh("box", team, 0.55, 0.12, 0, 0.3, 0.12, 0.006, pennant);
    f.flaps.push(pennant);
    f.arms = p.arms;
    f.elbows = p.elbows;
    f.style = "trample";
    f.stride = 1.25;
    tall = 2.25;
  } else if (era === 2) {
    // A field gun on a wooden trail carriage with two spoked wheels, its rammer and bucket; a gunner behind it.
    const gun = pivot(body, 0, 0, 0, "beast");
    k.mesh("box", "wood", -0.25, 0.42, 0, 1.15, 0.14, 0.3, gun).rotation.z = 0.2;
    k.mesh("box", "woodDark", -0.82, 0.16, 0, 0.12, 0.2, 0.32, gun);
    k.mesh("box", "iron", -0.1, 0.54, 0, 0.4, 0.04, 0.32, gun);
    for (const z of [-0.36, 0.36]) {
      const wheel = pivot(gun, 0.1, 0.42, z, "wheel");
      const rim = new T.Mesh(k.g.wheel, k.m.woodDark);
      rim.scale.set(0.4, 0.4, 0.5);
      rim.castShadow = true;
      wheel.add(rim);
      for (let s = 0; s < 6; s++) k.mesh("box", "wood", 0, 0, 0, 0.035, 0.78, 0.035, wheel).rotation.z = (s * Math.PI) / 6;
      k.mesh("cyl", "dark", 0, 0, 0, 0.07, 0.12, 0.07, wheel).rotation.x = Math.PI / 2;
      k.mesh("disc", "iron", 0, 0, 0, 0.42, 0.03, 0.42, wheel).rotation.x = Math.PI / 2;
      f.wheels.push(wheel);
    }
    const barrel = pivot(gun, 0.1, 0.7, 0, "strike");
    barrel.rotation.z = 0.1;
    k.mesh("cyl", "black", 0.3, 0, 0, 0.11, 1.15, 0.11, barrel).rotation.z = -Math.PI / 2;
    k.mesh("cyl", "black", -0.05, 0, 0, 0.14, 0.4, 0.14, barrel).rotation.z = -Math.PI / 2;
    k.mesh("ball", "black", -0.28, 0, 0, 0.14, 0.14, 0.14, barrel);
    k.mesh("cyl", "black", 0.88, 0, 0, 0.13, 0.08, 0.13, barrel).rotation.z = -Math.PI / 2;
    for (const x of [0.15, 0.55]) k.mesh("cyl", "brass", x, 0, 0, 0.12, 0.03, 0.12, barrel).rotation.z = -Math.PI / 2;
    k.mesh("box", team, 0.1, 0.08, 0, 0.3, 0.04, 0.24, barrel);
    f.muzzle = pivot(barrel, 0.95, 0, 0, "muzzle");
    f.strike = barrel;
    k.mesh("cyl", "wood", -0.6, 0.45, 0.25, 0.015, 0.9, 0.015, gun).rotation.z = 1.2;
    k.mesh("cyl", "woodDark", -0.9, 0.12, 0.3, 0.07, 0.14, 0.07, gun);
    const gunner = pivot(body, -1.0, 0, 0.14);
    const { p } = soldier(k, gunner, 2, 1, side, 0.95);
    Object.assign(f, { legs: p.legs, knees: p.knees, arms: p.arms, elbows: p.elbows, chest: p.chest });
    f.style = "barrel";
    f.stride = 0.5;
    tall = 1.7;
  } else {
    // A tank: tracks running round road wheels and sprockets, side skirts, a sloped hull with hatches, a turret with
    // the side's stripe and number, a long gun with a muzzle brake, a machine gun and an aerial.
    const tank = pivot(body, 0, 0, 0, "beast");
    // (Nothing of a tank leans as a person's chest does.)
    f.chest = pivot(tank, 0, 0, 0, "still");
    for (const z of [-0.42, 0.42]) {
      const tr = k.mesh("box", "track", 0, 0.27, z, 1.95, 0.4, 0.2, tank);
      track.push(tr);
      for (let s = 0; s < 5; s++) {
        const wheel = pivot(tank, -0.72 + s * 0.36, 0.22, z + Math.sign(z) * 0.105, "wheel");
        k.mesh("cyl", "dark", 0, 0, 0, 0.15, 0.04, 0.15, wheel).rotation.x = Math.PI / 2;
        k.mesh("box", "olive", 0, 0, 0.025 * Math.sign(z), 0.05, 0.22, 0.01, wheel);
        k.mesh("box", "olive", 0, 0, 0.025 * Math.sign(z), 0.22, 0.05, 0.01, wheel);
        f.wheels.push(wheel);
      }
      for (const x of [-0.98, 0.98]) {
        const sprocket = pivot(tank, x, 0.33, z + Math.sign(z) * 0.105, "wheel");
        k.mesh("cyl6", "dark", 0, 0, 0, 0.12, 0.05, 0.12, sprocket).rotation.x = Math.PI / 2;
        f.wheels.push(sprocket);
      }
      k.mesh("box", "oliveDark", 0, 0.5, z * 1.08, 1.85, 0.08, 0.04, tank);
    }
    k.mesh("box", "olive", -0.05, 0.62, 0, 1.75, 0.32, 0.98, tank);
    k.mesh("box", "olive", 0.86, 0.56, 0, 0.36, 0.2, 0.96, tank).rotation.z = -0.5;
    k.mesh("box", "oliveDark", -0.82, 0.7, 0, 0.18, 0.2, 0.7, tank);
    for (const z of [-0.25, 0.25]) k.mesh("cyl", "black", -0.92, 0.72, z, 0.05, 0.12, 0.05, tank).rotation.z = Math.PI / 2;
    k.mesh("box", "khaki", -0.55, 0.82, 0.3, 0.3, 0.08, 0.2, tank);
    const turret = pivot(tank, -0.1, 0.92, 0, "turret");
    k.mesh("box", "olive", 0, 0.14, 0, 0.82, 0.3, 0.7, turret);
    k.mesh("box", "olive", 0.48, 0.1, 0, 0.22, 0.22, 0.56, turret).rotation.z = -0.4;
    k.mesh("box", team, -0.05, 0.14, 0, 0.84, 0.08, 0.72, turret);
    k.mesh("box", "white", -0.05, 0.14, 0.365, 0.16, 0.06, 0.005, turret);
    k.mesh("cyl", "oliveDark", -0.18, 0.33, 0.12, 0.13, 0.08, 0.13, turret);
    k.mesh("cap", "oliveDark", -0.18, 0.37, 0.12, 0.11, 0.05, 0.11, turret);
    k.mesh("cyl", "black", -0.1, 0.42, -0.15, 0.012, 0.14, 0.012, turret);
    k.mesh("box", "black", -0.05, 0.47, -0.15, 0.22, 0.03, 0.03, turret);
    k.mesh("cyl", "dark", -0.3, 0.6, -0.22, 0.007, 0.6, 0.007, turret);
    const barrel = pivot(turret, 0.4, 0.15, 0, "strike");
    k.mesh("cyl", "olive", 0.05, 0, 0, 0.1, 0.22, 0.1, barrel).rotation.z = -Math.PI / 2;
    k.mesh("cyl", "oliveDark", 0.65, 0, 0, 0.055, 1.3, 0.055, barrel).rotation.z = -Math.PI / 2;
    k.mesh("cyl", "oliveDark", 0.6, 0, 0, 0.07, 0.25, 0.07, barrel).rotation.z = -Math.PI / 2;
    k.mesh("box", "dark", 1.3, 0, 0, 0.14, 0.1, 0.14, barrel);
    f.muzzle = pivot(barrel, 1.4, 0, 0, "muzzle");
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
