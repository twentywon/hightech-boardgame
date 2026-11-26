import * as T from "three";
import type { Own } from "../goldraid/paint";
import type { Kind } from "./sim";

/**
 * The soldiers of 시대 전쟁, built from simple shapes (all made here, no pictures): for each era a fighter, a shooter
 * and a big one (a mammoth with its rider, a knight on a horse, a field gun with its gunner, a tank). Every figure
 * faces +x (side 1's are turned round by the view) and stands on y = 0; it is about 1.15 m tall on foot. What of it
 * moves is kept (`Figure`): the legs and arms swing as it walks, the arm with the weapon strikes or the gun recoils
 * when it fights, a big one's body rocks and its wheels turn. The side's colour is on each one (a band, a tabard, a
 * coat, a caparison, a stripe). Geometries and materials are shared through a `Kit` (one per view, disposed with it).
 */
export const SIDE_COLORS: [string, string] = ["#d2452b", "#2f6ed0"];
export interface Figure {
  root: T.Group;
  /** What rocks and bobs (a person's body; a beast's or a machine's whole). */
  body: T.Group;
  legs: T.Object3D[];
  arms: T.Object3D[];
  /** The arm (or barrel, or neck) that strikes or recoils. */
  strike: T.Object3D | null;
  /** How it fights: a blow swung, a shot (recoil), a gun's barrel kicked back. */
  style: "swing" | "shoot" | "throw" | "barrel" | "trample";
  wheels: T.Object3D[];
  /** The life bar over it. */
  bar: T.Mesh;
  barBack: T.Mesh;
  /** The bar's height. */
  tall: number;
  /** Its stride (m a leg swing takes), for the walk. */
  stride: number;
}
type Mats = Record<string, T.Material>;
/** Shared shapes and paints for the figures. */
export class Kit {
  readonly g: Record<string, T.BufferGeometry> = {};
  readonly m: Mats = {};
  constructor(
    private own: Own,
    rich: boolean,
  ) {
    const mat = (color: string, o: T.MeshStandardMaterialParameters = {}) =>
      own(rich ? new T.MeshStandardMaterial({ color, roughness: 0.75, ...o }) : new T.MeshLambertMaterial({ color, emissive: (o.emissive as T.ColorRepresentation) ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1 }));
    const colors: Record<string, [string, T.MeshStandardMaterialParameters?]> = {
      skin: ["#e0ad84"],
      skin2: ["#b98058"],
      hair: ["#3a2618"],
      fur: ["#7a5532", { roughness: 1 }],
      furDark: ["#4e3620", { roughness: 1 }],
      hide: ["#9b7346", { roughness: 0.95 }],
      wood: ["#7b5532", { roughness: 0.85 }],
      woodDark: ["#4d331d", { roughness: 0.9 }],
      stone: ["#8d8a84", { roughness: 0.95 }],
      iron: ["#8f969e", { metalness: 0.7, roughness: 0.38 }],
      steel: ["#c9d0d8", { metalness: 0.85, roughness: 0.25 }],
      dark: ["#2a2c30", { metalness: 0.5, roughness: 0.45 }],
      black: ["#16171a", { metalness: 0.6, roughness: 0.4 }],
      leather: ["#6a4426", { roughness: 0.8 }],
      cloth: ["#d9cfb6"],
      green: ["#4f6b35"],
      hood: ["#3f5a2c"],
      white: ["#eeeae0"],
      gold: ["#d9a72c", { metalness: 0.8, roughness: 0.3 }],
      olive: ["#5d6a3c", { roughness: 0.8 }],
      oliveDark: ["#424c2a", { roughness: 0.85 }],
      khaki: ["#8c845c"],
      track: ["#26282a", { roughness: 0.9 }],
      tusk: ["#efe6cf", { roughness: 0.5 }],
      horse: ["#6b4426", { roughness: 0.8 }],
      mane: ["#24170d"],
      rope: ["#b89b6a"],
      boot: ["#2e241c"],
      barBack: ["#1b1b1b"],
    };
    for (const [name, [color, o]] of Object.entries(colors)) this.m[name] = mat(color, o);
    this.m.barBack = own(new T.MeshBasicMaterial({ color: "#151515", transparent: true, opacity: 0.75, depthTest: false }));
    SIDE_COLORS.forEach((c, side) => {
      this.m[`team${side}`] = mat(c, { roughness: 0.6 });
      this.m[`teamGlow${side}`] = mat(c, { emissive: c, emissiveIntensity: 0.25 });
      this.m[`bar${side}`] = own(new T.MeshBasicMaterial({ color: side ? "#6fb0ff" : "#ff7a5a", depthTest: false }));
    });
    const g = this.g;
    g.box = own(new T.BoxGeometry(1, 1, 1));
    g.ball = own(new T.SphereGeometry(1, 14, 10));
    g.ballLo = own(new T.SphereGeometry(1, 9, 7));
    g.cyl = own(new T.CylinderGeometry(1, 1, 1, 10));
    g.cyl6 = own(new T.CylinderGeometry(1, 1, 1, 6));
    g.cone = own(new T.ConeGeometry(1, 1, 10));
    g.cone4 = own(new T.ConeGeometry(1, 1, 4));
    g.limb = own(new T.CylinderGeometry(1, 0.85, 1, 8).translate(0, -0.5, 0));
    g.wheel = own(new T.TorusGeometry(1, 0.16, 6, 16));
    g.disc = own(new T.CylinderGeometry(1, 1, 1, 16));
    g.plane = own(new T.PlaneGeometry(1, 1));
    g.cap = own(new T.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  }
  mesh(geometry: string, material: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: T.Object3D) {
    const m = new T.Mesh(this.g[geometry], this.m[material]);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
}

const pivot = (parent: T.Object3D, x: number, y: number, z: number) => {
  const g = new T.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

interface Person {
  body: T.Group;
  legs: T.Group[];
  arms: T.Group[];
  head: T.Group;
  /** The near arm's hand (where a weapon is held). */
  hand: T.Group;
  far: T.Group;
}
/** A person: legs and boots, a body, a head, two arms; `scale` for a rider. */
function person(k: Kit, parent: T.Object3D, o: { cloth: string; legs: string; skin?: string; boot?: string; scale?: number; sitting?: boolean }): Person {
  const body = pivot(parent, 0, 0, 0);
  body.scale.setScalar(o.scale ?? 1);
  const legs: T.Group[] = [];
  for (const z of [-0.09, 0.09]) {
    const leg = pivot(body, 0, 0.56, z);
    k.mesh("limb", o.legs, 0, 0, 0, 0.075, 0.5, 0.075, leg);
    k.mesh("box", o.boot ?? "boot", 0.04, -0.5, 0, 0.2, 0.09, 0.11, leg);
    if (o.sitting) leg.rotation.z = Math.PI / 2.4;
    legs.push(leg);
  }
  k.mesh("box", o.cloth, 0, 0.77, 0, 0.21, 0.46, 0.3, body);
  k.mesh("box", o.legs, 0, 0.58, 0, 0.22, 0.1, 0.31, body);
  const head = pivot(body, 0.01, 1.08, 0);
  k.mesh("ball", o.skin ?? "skin", 0, 0, 0, 0.115, 0.13, 0.11, head);
  k.mesh("ball", "black", 0.1, 0.02, 0.045, 0.014, 0.014, 0.014, head);
  k.mesh("box", o.skin ?? "skin", 0, -0.1, 0, 0.07, 0.06, 0.07, head);
  const arms: T.Group[] = [];
  let hand = pivot(body, 0, 0, 0);
  for (const z of [-0.19, 0.19]) {
    const arm = pivot(body, 0, 0.96, z);
    k.mesh("limb", o.cloth, 0, 0, 0, 0.06, 0.42, 0.06, arm);
    k.mesh("ball", o.skin ?? "skin", 0, -0.44, 0, 0.05, 0.05, 0.05, arm);
    arms.push(arm);
    if (z > 0) hand = pivot(arm, 0, -0.43, 0.02);
  }
  return { body, legs, arms, head, hand, far: arms[0] };
}
/** A hat or helmet on a head. */
function headgear(k: Kit, p: Person, era: number, kind: Kind, team: string) {
  const h = p.head;
  if (era === 0) {
    // A band in the side's colour round wild hair.
    k.mesh("ball", "hair", -0.02, 0.05, 0, 0.12, 0.1, 0.115, h);
    k.mesh("cyl", team, 0, 0.04, 0, 0.122, 0.035, 0.122, h);
    if (kind === 1) k.mesh("cone4", "hide", -0.02, 0.15, 0, 0.06, 0.12, 0.06, h);
  } else if (era === 1) {
    if (kind === 1) {
      k.mesh("cap", "hood", -0.01, 0.0, 0, 0.14, 0.17, 0.135, h);
      k.mesh("cone", "hood", -0.12, 0.05, 0, 0.05, 0.14, 0.05, h).rotation.z = Math.PI / 2.6;
    } else {
      k.mesh("cyl", "iron", 0, 0.06, 0, 0.13, 0.12, 0.13, h);
      k.mesh("cone", "iron", 0, 0.17, 0, 0.13, 0.12, 0.13, h);
      k.mesh("box", "iron", 0.11, 0.0, 0, 0.02, 0.12, 0.03, h);
    }
  } else if (era === 2) {
    if (kind === 0) {
      // A tricorn.
      k.mesh("cyl6", "black", 0, 0.09, 0, 0.17, 0.035, 0.17, h).rotation.y = Math.PI / 6;
      k.mesh("cap", "black", 0, 0.09, 0, 0.11, 0.1, 0.11, h);
    } else {
      // A tall shako with a plume in the side's colour.
      k.mesh("cyl", "black", 0, 0.14, 0, 0.11, 0.18, 0.11, h);
      k.mesh("box", "black", 0.1, 0.06, 0, 0.08, 0.015, 0.14, h);
      k.mesh("ball", team, 0.02, 0.28, 0, 0.035, 0.07, 0.035, h);
    }
  } else {
    k.mesh("cap", "oliveDark", 0, 0.02, 0, 0.145, 0.13, 0.145, h);
    k.mesh("cyl", "oliveDark", 0, 0.02, 0, 0.155, 0.02, 0.155, h);
  }
}
/** A person of an era and kind, weapon in hand. */
function soldier(k: Kit, parent: T.Object3D, era: number, kind: Kind, side: number, scale = 1, sitting = false): Person {
  const team = `team${side}`,
    dress =
      era === 0
        ? { cloth: kind === 1 ? "hide" : "fur", legs: "skin2", skin: "skin2", boot: "leather" }
        : era === 1
          ? { cloth: kind === 1 ? "green" : "iron", legs: kind === 1 ? "leather" : "iron" }
          : era === 2
            ? { cloth: team, legs: "white", boot: "black" }
            : { cloth: "olive", legs: "olive", boot: "black" };
  const p = person(k, parent, { ...dress, scale, sitting });
  headgear(k, p, era, kind, team);
  const b = p.body,
    hand = p.hand;
  // What shows the side: a band, a tabard, belts on a coat, an armband.
  if (era === 0) k.mesh("box", team, 0, 0.66, 0, 0.215, 0.05, 0.305, b);
  else if (era === 1) {
    if (kind === 1) k.mesh("box", team, 0.005, 0.66, 0, 0.215, 0.06, 0.305, b);
    else k.mesh("box", team, 0.005, 0.74, 0, 0.215, 0.36, 0.25, b);
  } else if (era === 2) {
    k.mesh("box", "white", 0.004, 0.8, 0, 0.214, 0.05, 0.31, b).rotation.x = 0.6;
    k.mesh("box", "white", 0.004, 0.8, 0, 0.214, 0.05, 0.31, b).rotation.x = -0.6;
  } else {
    k.mesh("cyl", team, 0, 0.82, 0.19, 0.065, 0.06, 0.065, b);
    k.mesh("box", "oliveDark", 0.02, 0.86, 0, 0.23, 0.2, 0.32, b);
  }
  // The weapon.
  if (era === 0) {
    if (kind === 0) {
      const club = pivot(hand, 0, 0, 0);
      club.rotation.z = -Math.PI / 2.3;
      k.mesh("cyl", "wood", 0, 0.18, 0, 0.03, 0.42, 0.03, club);
      k.mesh("ball", "woodDark", 0, 0.42, 0, 0.075, 0.1, 0.075, club);
    } else if (kind === 1) {
      k.mesh("cyl", "rope", 0, -0.08, 0, 0.008, 0.18, 0.008, hand);
      k.mesh("ball", "stone", 0, -0.18, 0, 0.04, 0.035, 0.04, hand);
      k.mesh("box", "hide", -0.02, 0.6, -0.17, 0.08, 0.1, 0.05, b);
    } else {
      const spear = pivot(hand, 0, 0, 0);
      spear.rotation.z = -Math.PI / 2.1;
      k.mesh("cyl", "wood", 0, 0.2, 0, 0.018, 0.9, 0.018, spear);
      k.mesh("cone", "stone", 0, 0.7, 0, 0.035, 0.12, 0.035, spear);
    }
  } else if (era === 1) {
    if (kind === 0) {
      const sword = pivot(hand, 0, 0, 0);
      sword.rotation.z = -Math.PI / 2.2;
      k.mesh("box", "gold", 0, 0.02, 0, 0.03, 0.03, 0.14, sword);
      k.mesh("box", "steel", 0, 0.3, 0, 0.022, 0.52, 0.05, sword);
      k.mesh("cone4", "steel", 0, 0.6, 0, 0.026, 0.08, 0.035, sword);
      // A round shield on the far arm, in the side's colour with an iron boss.
      const shield = pivot(p.far, 0.08, -0.25, -0.06);
      shield.rotation.z = Math.PI / 2;
      k.mesh("disc", team, 0, 0, 0, 0.19, 0.03, 0.19, shield);
      k.mesh("ball", "iron", 0, -0.02, 0, 0.05, 0.03, 0.05, shield);
    } else if (kind === 1) {
      const bow = pivot(p.far, 0.05, -0.38, 0.02);
      const arc = new T.Mesh(k.g.wheel, k.m.wood);
      arc.scale.set(0.42, 0.42, 0.12);
      arc.rotation.set(0, 0, 0);
      // Only the front half of the ring shows as the bow (the back half hidden behind a thin string).
      bow.add(arc);
      arc.position.x = -0.32;
      k.mesh("cyl", "rope", 0.05, 0, 0, 0.005, 0.8, 0.005, bow);
      k.mesh("cyl", "leather", -0.08, 0.83, -0.17, 0.05, 0.3, 0.05, b).rotation.z = 0.4;
    } else {
      const lance = pivot(hand, 0, 0, 0);
      lance.rotation.z = -Math.PI / 2;
      k.mesh("cone", "wood", 0, 0.55, 0, 0.04, 1.6, 0.04, lance);
      k.mesh("cone", team, 0, 0.05, 0, 0.08, 0.2, 0.08, lance).rotation.x = Math.PI;
    }
  } else if (era === 2) {
    const gun = pivot(hand, 0, 0, 0);
    gun.rotation.z = -Math.PI / 2;
    k.mesh("box", "wood", 0, 0.12, 0, 0.04, 0.3, 0.05, gun);
    k.mesh("cyl", "dark", 0.012, 0.45, 0, 0.014, 0.5, 0.014, gun);
    if (kind === 0) k.mesh("cone4", "steel", 0.012, 0.78, 0, 0.012, 0.18, 0.012, gun);
  } else if (era === 3) {
    const gun = pivot(hand, 0, 0, 0);
    gun.rotation.z = -Math.PI / 2;
    if (kind === 0) {
      k.mesh("box", "black", 0, 0.14, 0, 0.05, 0.36, 0.05, gun);
      k.mesh("box", "black", -0.04, 0.08, 0, 0.06, 0.06, 0.04, gun);
      k.mesh("cone4", "steel", 0, 0.38, 0, 0.012, 0.12, 0.012, gun);
    } else {
      k.mesh("box", "black", 0, 0.2, 0, 0.07, 0.5, 0.08, gun);
      k.mesh("cyl", "black", 0.01, 0.52, 0, 0.018, 0.3, 0.018, gun);
      k.mesh("box", "dark", -0.06, 0.18, 0, 0.08, 0.12, 0.06, gun);
      k.mesh("box", "khaki", -0.07, 0.75, -0.17, 0.07, 0.18, 0.12, b);
    }
  }
  return p;
}
/** The life bar over a figure (two flat strips that face the eye). */
function lifeBar(k: Kit, root: T.Group, side: number, tall: number) {
  const back = new T.Mesh(k.g.plane, k.m.barBack),
    bar = new T.Mesh(k.g.plane, k.m[`bar${side}`]);
  back.scale.set(0.62, 0.075, 1);
  bar.scale.set(0.58, 0.05, 1);
  back.position.set(0, tall, 0.4);
  bar.position.set(0, tall, 0.41);
  back.renderOrder = 6;
  bar.renderOrder = 7;
  root.add(back, bar);
  return { back, bar };
}
/** A figure for a soldier of an era, kind and side. */
export function makeFigure(k: Kit, era: number, kind: Kind, side: number): Figure {
  const root = new T.Group(),
    // Mirrored for side 1 (its soldiers go leftward, their weapons still on the near side); the life bar, on the root, is not.
    face = pivot(root, 0, 0, 0),
    body = pivot(face, 0, 0, 0),
    team = `team${side}`,
    f: Omit<Figure, "bar" | "barBack" | "tall"> = { root, body, legs: [], arms: [], strike: null, style: "swing", wheels: [], stride: 0.55 };
  let tall = 1.45;
  if (kind !== 2) {
    const p = soldier(k, body, era, kind, side);
    f.legs = p.legs;
    f.arms = p.arms;
    f.strike = p.arms[1];
    f.style = kind === 0 ? "swing" : era === 0 ? "throw" : "shoot";
    if (era === 1 && kind === 1) f.strike = p.arms[0];
  } else if (era === 0) {
    // A woolly mammoth, its rider on a blanket in the side's colour.
    const beast = pivot(body, 0, 0, 0);
    k.mesh("ball", "fur", 0, 1.15, 0, 0.82, 0.62, 0.5, beast);
    k.mesh("ball", "furDark", -0.1, 1.38, 0, 0.6, 0.38, 0.44, beast);
    const head = pivot(beast, 0.72, 1.3, 0);
    k.mesh("ball", "fur", 0, 0, 0, 0.36, 0.36, 0.34, head);
    k.mesh("ball", "furDark", -0.05, 0.22, 0, 0.26, 0.2, 0.26, head);
    for (const z of [-0.2, 0.2]) {
      k.mesh("ball", "furDark", -0.05, 0.02, z * 1.35, 0.06, 0.2, 0.16, head);
      k.mesh("ball", "black", 0.25, 0.08, z * 0.8, 0.035, 0.035, 0.035, head);
      const tusk = new T.Mesh(k.g.wheel, k.m.tusk);
      tusk.scale.set(0.28, 0.28, 0.25);
      tusk.position.set(0.3, -0.22, z * 0.75);
      head.add(tusk);
    }
    const trunk = pivot(head, 0.3, -0.05, 0);
    for (let s = 0; s < 4; s++) k.mesh("cyl", "fur", 0.04 * s, -0.14 * s - 0.08, 0, 0.09 - s * 0.012, 0.18, 0.09 - s * 0.012, trunk).rotation.z = 0.12 * s;
    f.strike = head;
    for (const [x, z] of [[0.45, -0.25], [0.45, 0.25], [-0.45, -0.25], [-0.45, 0.25]]) {
      const leg = pivot(beast, x, 0.85, z);
      k.mesh("limb", "fur", 0, 0, 0, 0.15, 0.85, 0.15, leg);
      f.legs.push(leg);
    }
    k.mesh("box", team, -0.05, 1.72, 0, 0.6, 0.08, 0.62, beast);
    k.mesh("cone", "furDark", -0.85, 1.1, 0, 0.05, 0.4, 0.05, beast).rotation.z = 2.6;
    const rider = pivot(beast, -0.05, 1.12, 0);
    const p = soldier(k, rider, 0, 2, side, 0.82, true);
    f.arms = p.arms;
    f.style = "trample";
    f.stride = 1.1;
    tall = 2.55;
  } else if (era === 1) {
    // A knight on a horse in a caparison of the side's colour, lance couched.
    const horse = pivot(body, 0, 0, 0);
    k.mesh("ball", "horse", 0, 1.0, 0, 0.62, 0.28, 0.24, horse);
    k.mesh("box", team, -0.02, 0.95, 0, 1.02, 0.4, 0.52, horse);
    const neck = pivot(horse, 0.48, 1.12, 0);
    k.mesh("cyl", "horse", 0.1, 0.22, 0, 0.12, 0.5, 0.11, neck).rotation.z = -0.55;
    k.mesh("box", "horse", 0.36, 0.42, 0, 0.36, 0.15, 0.15, neck).rotation.z = -0.35;
    k.mesh("box", "mane", 0.02, 0.32, 0, 0.32, 0.07, 0.05, neck).rotation.z = -0.55;
    k.mesh("cone", "horse", 0.2, 0.6, 0.05, 0.04, 0.1, 0.04, neck);
    f.strike = neck;
    for (const [x, z] of [[0.38, -0.13], [0.38, 0.13], [-0.4, -0.13], [-0.4, 0.13]]) {
      const leg = pivot(horse, x, 0.82, z);
      k.mesh("limb", "horse", 0, 0, 0, 0.06, 0.8, 0.06, leg);
      k.mesh("box", "black", 0.02, -0.8, 0, 0.1, 0.06, 0.09, leg);
      f.legs.push(leg);
    }
    k.mesh("cone", "mane", -0.65, 0.9, 0, 0.07, 0.5, 0.07, horse).rotation.z = 2.5;
    const rider = pivot(horse, -0.05, 0.75, 0);
    const p = soldier(k, rider, 1, 2, side, 0.9, true);
    k.mesh("cone", team, -0.02, 0.29, 0, 0.04, 0.14, 0.04, p.head);
    f.arms = p.arms;
    f.style = "trample";
    f.stride = 1.25;
    tall = 2.2;
  } else if (era === 2) {
    // A field gun on a wooden carriage, two spoked wheels; its gunner behind with a rammer.
    const gun = pivot(body, 0, 0, 0);
    k.mesh("box", "wood", -0.2, 0.42, 0, 1.1, 0.14, 0.34, gun).rotation.z = 0.18;
    for (const z of [-0.34, 0.34]) {
      const wheel = pivot(gun, 0.1, 0.42, z);
      const rim = new T.Mesh(k.g.wheel, k.m.woodDark);
      rim.scale.set(0.4, 0.4, 0.5);
      wheel.add(rim);
      for (let s = 0; s < 6; s++) k.mesh("box", "wood", 0, 0, 0, 0.04, 0.78, 0.04, wheel).rotation.z = (s * Math.PI) / 6;
      k.mesh("cyl", "dark", 0, 0, 0, 0.07, 0.12, 0.07, wheel).rotation.x = Math.PI / 2;
      f.wheels.push(wheel);
    }
    const barrel = pivot(gun, 0.1, 0.68, 0);
    barrel.rotation.z = 0.1;
    k.mesh("cyl", "black", 0.3, 0, 0, 0.11, 1.15, 0.11, barrel).rotation.z = -Math.PI / 2;
    k.mesh("ball", "black", -0.28, 0, 0, 0.14, 0.14, 0.14, barrel);
    k.mesh("cyl", "black", 0.88, 0, 0, 0.13, 0.08, 0.13, barrel).rotation.z = -Math.PI / 2;
    k.mesh("box", team, 0.1, 0.08, 0, 0.3, 0.04, 0.24, barrel);
    f.strike = barrel;
    const gunner = pivot(body, -0.9, 0, 0.12);
    const p = soldier(k, gunner, 2, 1, side, 0.95);
    f.legs = p.legs;
    f.arms = p.arms;
    f.style = "barrel";
    f.stride = 0.5;
    tall = 1.65;
  } else {
    // A tank: tracks with road wheels, a sloped hull, a turret with the side's stripe, a long gun.
    const tank = pivot(body, 0, 0, 0);
    for (const z of [-0.42, 0.42]) {
      k.mesh("box", "track", 0, 0.28, z, 1.9, 0.42, 0.22, tank);
      for (let s = 0; s < 5; s++) {
        const wheel = pivot(tank, -0.72 + s * 0.36, 0.24, z + Math.sign(z) * 0.115);
        k.mesh("cyl", "dark", 0, 0, 0, 0.15, 0.05, 0.15, wheel).rotation.x = Math.PI / 2;
        k.mesh("box", "olive", 0, 0, 0.03 * Math.sign(z), 0.05, 0.22, 0.01, wheel);
        f.wheels.push(wheel);
      }
    }
    k.mesh("box", "olive", -0.05, 0.62, 0, 1.75, 0.32, 0.98, tank);
    k.mesh("box", "olive", 0.86, 0.56, 0, 0.36, 0.2, 0.96, tank).rotation.z = -0.5;
    const turret = pivot(tank, -0.1, 0.92, 0);
    k.mesh("box", "olive", 0, 0.14, 0, 0.82, 0.3, 0.7, turret);
    k.mesh("box", "olive", 0.48, 0.1, 0, 0.22, 0.22, 0.56, turret).rotation.z = -0.4;
    k.mesh("box", team, -0.05, 0.14, 0, 0.84, 0.08, 0.72, turret);
    k.mesh("cyl", "oliveDark", -0.18, 0.33, 0.12, 0.13, 0.08, 0.13, turret);
    k.mesh("cyl", "dark", -0.3, 0.55, -0.22, 0.008, 0.55, 0.008, turret);
    const barrel = pivot(turret, 0.4, 0.15, 0);
    k.mesh("cyl", "oliveDark", 0.65, 0, 0, 0.055, 1.3, 0.055, barrel).rotation.z = -Math.PI / 2;
    k.mesh("cyl", "dark", 1.3, 0, 0, 0.08, 0.14, 0.08, barrel).rotation.z = -Math.PI / 2;
    f.strike = barrel;
    f.style = "barrel";
    f.stride = 0.9;
    tall = 1.85;
  }
  face.scale.x = side ? -1 : 1;
  const bar = lifeBar(k, root, side, tall);
  return { ...f, bar: bar.bar, barBack: bar.back, tall };
}
/**
 * A figure as it stands: walking (legs and arms swing by the ground it has covered, `dist`), striking (`since` the
 * last blow), and its life bar. `t` is the clock, for a little breathing while it waits.
 */
export function poseFigure(f: Figure, dist: number, walking: boolean, since: number, life: number, t: number) {
  const phase = (dist / f.stride) * Math.PI,
    swing = walking ? Math.sin(phase) : 0;
  if (f.style === "trample") {
    f.legs.forEach((leg, i) => (leg.rotation.z = walking ? Math.sin(phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.35 : 0));
    f.body.position.y = walking ? Math.abs(Math.sin(phase)) * 0.06 : Math.sin(t * 2) * 0.01;
    const hit = since < 0.5 ? Math.sin((since / 0.5) * Math.PI) : 0;
    f.body.rotation.z = hit * 0.12;
    if (f.strike) f.strike.rotation.z = -hit * 0.4;
  } else {
    f.legs.forEach((leg, i) => (leg.rotation.z = swing * 0.55 * (i ? -1 : 1)));
    f.arms.forEach((arm, i) => (arm.rotation.z = swing * 0.4 * (i ? 1 : -1)));
    f.body.position.y = walking ? Math.abs(Math.cos(phase)) * 0.035 : Math.sin(t * 2.2) * 0.004;
    f.body.rotation.z = walking ? -0.05 : 0;
    const blow = since < 0.45 ? since / 0.45 : 1;
    if (f.style === "swing" && f.strike) {
      // Raised high, then brought down.
      f.strike.rotation.z = blow < 1 ? (blow < 0.35 ? (blow / 0.35) * 2.4 : 2.4 - ((blow - 0.35) / 0.65) * 3.1) : swing * 0.4 + (walking ? 0 : 0.5);
    } else if (f.style === "throw" && f.strike) {
      f.strike.rotation.z = blow < 1 ? 3.6 * Math.sin(blow * Math.PI) : walking ? swing * 0.4 : 0.3 + Math.sin(t * 9) * 0.6;
    } else if (f.style === "shoot" && f.strike) {
      // Held level at the foe, kicked up a little by each shot.
      f.strike.rotation.z = Math.PI / 2 - (blow < 1 ? (1 - blow) * 0.25 : 0);
      f.arms[1 - f.arms.indexOf(f.strike)] && (f.arms[1 - f.arms.indexOf(f.strike)].rotation.z = Math.PI / 2.4);
    } else if (f.style === "barrel" && f.strike) {
      f.strike.position.x = f.strike.userData.x ?? (f.strike.userData.x = f.strike.position.x);
      f.strike.position.x -= blow < 1 ? (1 - blow) * 0.22 : 0;
    }
  }
  for (const w of f.wheels) w.rotation.z = -dist / 0.4;
  f.bar.scale.x = Math.max(0.001, 0.58 * life);
  f.bar.position.x = -0.29 * (1 - life);
  f.bar.visible = f.barBack.visible = life < 0.999;
}
