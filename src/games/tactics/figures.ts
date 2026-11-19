/**
 * The soldiers of 전술 대전, modelled in code: small chunky figures with clear silhouettes and their weapons, each
 * trimmed in its side's colour and standing on a disc of that colour with a notch that shows which way it looks.
 * A figure looks along its own +z. Shapes are shared by every figure of a view (`Shapes`, disposed with the view);
 * paints are a figure's own, so that one can flash when struck and fade when it falls.
 */
import * as T from "three";
import { block } from "../../engine/scene-utils";
import type { Job, Side } from "./rules";

export const SIDE_COLORS: [string, string] = ["#2f6fe0", "#d8433a"];
/** How much larger than its stand a figure is drawn, so that it reads from where the field is seen. */
const FIGURE_SCALE = 1.38;
const SIDE_DARK = ["#1b3f86", "#7d1f19"];
type Own = <R extends { dispose(): void }>(r: R) => R;
/** A profile turned about the upright axis: points from the foot up. */
const lathe = (points: [number, number][], segments = 20) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/** A shell round a head, open at the front so that the face shows (a hood, a veil): `reach` of the way down from the top. */
const openShell = (radius: number, reach = 0.62) => new T.SphereGeometry(radius, 20, 12, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * reach);
/** A paint seen from inside as well (a shell open at the front). */
const shell = (m: T.MeshStandardMaterial) => {
  m.side = T.DoubleSide;
  return m;
};
/** The shapes every figure is made of, made once a view. */
export class Shapes {
  private made = new Map<string, T.BufferGeometry>();
  constructor(private own: Own) {}
  get(key: string, make: () => T.BufferGeometry) {
    let g = this.made.get(key);
    if (!g) {
      g = this.own(make());
      this.made.set(key, g);
    }
    return g;
  }
}
export interface Figure {
  group: T.Group;
  /** The figure itself, raised and turned within the group (the base stays on the ground). */
  body: T.Group;
  job: Job;
  /** Its own paints, to flash and fade. */
  paints: T.MeshStandardMaterial[];
  /** The health bar over its head: the fill is scaled along x. */
  bar: T.Group;
  fill: T.Mesh;
  /** Where its weapon or its hands are, in the body's own frame (where arrows and spells start). */
  hand: T.Vector3;
}
/** How a job is dressed: its robe or tunic, and the colour of the glow of its staff, if any. */
const DRESS: Record<Job, { cloth: string; glow?: string }> = {
  knight: { cloth: "#c2c8d0" },
  archer: { cloth: "#6b7d3c" },
  fire: { cloth: "#3b302c", glow: "#ff7a1a" },
  healer: { cloth: "#f3efe4", glow: "#4fe08a" },
  assassin: { cloth: "#2c2836" },
  light: { cloth: "#efe6c8", glow: "#ffe58a" },
  angel: { cloth: "#fbf8f1", glow: "#ffd76a" },
};
export function buildFigure(job: Job, side: Side, shapes: Shapes, own: Own): Figure {
  const paints: T.MeshStandardMaterial[] = [],
    paint = (color: string, extra: T.MeshStandardMaterialParameters = {}) => {
      const m = own(new T.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
      paints.push(m);
      return m;
    },
    trim = paint(SIDE_COLORS[side], { roughness: 0.55 }),
    trimDark = paint(SIDE_DARK[side], { roughness: 0.6 }),
    skin = paint("#f2c9a2", { roughness: 0.8 }),
    dark = paint("#2a2622", { roughness: 0.85 }),
    steel = paint("#c5ccd5", { metalness: 0.65, roughness: 0.32 }),
    timber = paint("#8a5a30", { roughness: 0.75 }),
    gold = paint("#e0b64a", { metalness: 0.75, roughness: 0.3 }),
    cloth = paint(DRESS[job].cloth),
    glow = DRESS[job].glow ? paint(DRESS[job].glow!, { emissive: DRESS[job].glow!, emissiveIntensity: 1.1, roughness: 0.4 }) : gold;
  const group = new T.Group(),
    body = new T.Group();
  group.add(body);
  const put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = body) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The stand: a disc of the side's colour with a notch at the front.
  put(shapes.get("base", () => new T.CylinderGeometry(0.34, 0.36, 0.05, 32)), trimDark, 0, 0.025, 0, group).castShadow = false;
  put(shapes.get("baseTop", () => new T.CylinderGeometry(0.3, 0.3, 0.012, 32)), trim, 0, 0.055, 0, group).castShadow = false;
  const notch = put(
    shapes.get("notch", () => {
      const s = new T.Shape();
      s.moveTo(0, 0.42);
      s.lineTo(-0.11, 0.27);
      s.lineTo(0.11, 0.27);
      s.closePath();
      return new T.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.062, 0);
    }),
    paint("#fff6dc", { roughness: 0.5 }),
    0,
    0,
    0,
    group,
  );
  notch.castShadow = false;
  const head = shapes.get("head", () => new T.SphereGeometry(0.12, 20, 14)),
    eye = shapes.get("eye", () => new T.SphereGeometry(0.018, 8, 6)),
    leg = shapes.get("leg", () => new T.CylinderGeometry(0.045, 0.05, 0.16, 10).translate(0, 0.08, 0)),
    arm = shapes.get("arm", () => new T.CapsuleGeometry(0.038, 0.16, 4, 8)),
    hand = new T.Vector3(-0.2, 0.42, 0.12);
  const face = (y: number, z = 0.105) => {
    put(head, skin, 0, y, 0);
    put(eye, dark, -0.042, y + 0.015, z);
    put(eye, dark, 0.042, y + 0.015, z);
  };
  const legs = (material: T.Material) => {
    put(leg, material, -0.06, 0.06, 0);
    put(leg, material, 0.06, 0.06, 0);
  };
  const arms = (material: T.Material, lean = 0.5) => {
    const left = put(arm, material, 0.16, 0.42, 0.03),
      right = put(arm, material, -0.16, 0.42, 0.05);
    left.rotation.z = lean;
    right.rotation.z = -lean;
    right.rotation.x = -0.6;
  };
  /** A staff in the right hand, crowned with `top`. */
  const staff = (top: T.BufferGeometry, topPaint: T.Material, height = 0.78) => {
    put(shapes.get(`staff${height}`, () => new T.CylinderGeometry(0.018, 0.022, height, 8).translate(0, height / 2, 0)), timber, -0.22, 0.06, 0.12);
    put(top, topPaint, -0.22, 0.06 + height + 0.04, 0.12);
    hand.set(-0.22, 0.06 + height + 0.04, 0.12);
  };
  switch (job) {
    case "knight": {
      legs(dark);
      put(shapes.get("plate", () => lathe([[0.001, 0.2], [0.15, 0.2], [0.17, 0.3], [0.2, 0.44], [0.19, 0.52], [0.12, 0.56], [0.001, 0.56]], 18)), steel, 0, 0, 0);
      put(shapes.get("tabard", () => block(0.22, 0.24, 0.03, 0.01)), trim, 0, 0.36, 0.175);
      put(shapes.get("belt", () => new T.TorusGeometry(0.165, 0.02, 6, 20).rotateX(Math.PI / 2)), dark, 0, 0.26, 0);
      arms(steel, 0.35);
      face(0.67);
      // A great helm with a slit and a plume of the side's colour.
      put(shapes.get("helm", () => lathe([[0.001, 0.56], [0.14, 0.57], [0.145, 0.7], [0.12, 0.79], [0.001, 0.8]], 18)), steel, 0, 0, 0);
      put(shapes.get("slit", () => block(0.16, 0.022, 0.03, 0.008)), dark, 0, 0.69, 0.125);
      put(shapes.get("plume", () => new T.SphereGeometry(0.07, 12, 8).scale(0.6, 1, 1.5)), trim, 0, 0.84, -0.03);
      // The shield on the left arm and the sword in the right hand.
      const shield = put(shapes.get("shield", () => block(0.04, 0.28, 0.22, 0.02)), trim, 0.23, 0.4, 0.06);
      shield.rotation.y = 0.25;
      put(shapes.get("boss", () => new T.SphereGeometry(0.04, 10, 8).scale(0.5, 1, 1)), gold, 0.255, 0.42, 0.065);
      const sword = new T.Group();
      sword.position.set(-0.22, 0.38, 0.14);
      sword.rotation.x = 0.5;
      body.add(sword);
      put(shapes.get("blade", () => block(0.032, 0.42, 0.012, 0.005).translate(0, 0.26, 0)), steel, 0, 0, 0, sword);
      put(shapes.get("guard", () => block(0.14, 0.025, 0.03, 0.008)), gold, 0, 0.05, 0, sword);
      put(shapes.get("grip", () => new T.CylinderGeometry(0.014, 0.014, 0.08, 6)), timber, 0, 0, 0, sword);
      hand.set(-0.22, 0.6, 0.3);
      break;
    }
    case "archer": {
      legs(dark);
      put(shapes.get("tunic", () => lathe([[0.001, 0.14], [0.17, 0.14], [0.15, 0.24], [0.15, 0.42], [0.11, 0.52], [0.001, 0.53]], 18)), cloth, 0, 0, 0);
      put(shapes.get("sash", () => new T.TorusGeometry(0.152, 0.022, 6, 20).rotateX(Math.PI / 2)), trim, 0, 0.27, 0);
      arms(cloth, 0.5);
      face(0.64);
      // A pointed hood of the side's colour.
      put(shapes.get("hood", () => openShell(0.152)), shell(trim), 0, 0.645, -0.012);
      put(shapes.get("hoodTip", () => new T.ConeGeometry(0.075, 0.2, 12).translate(0, 0.1, 0)), trim, 0, 0.74, -0.06).rotation.x = -0.45;
      // The bow held out at the left, its string drawn straight; a quiver on the back.
      const bow = new T.Group();
      bow.position.set(0.24, 0.42, 0.12);
      body.add(bow);
      put(shapes.get("bow", () => new T.TorusGeometry(0.24, 0.014, 6, 24, Math.PI * 0.9).rotateZ(Math.PI / 2 - Math.PI * 0.45).rotateY(Math.PI / 2)), timber, 0, 0, -0.1, bow);
      put(shapes.get("string", () => new T.CylinderGeometry(0.003, 0.003, 0.47, 4)), paint("#f4efe2"), 0, 0, -0.13, bow);
      put(shapes.get("quiver", () => new T.CylinderGeometry(0.05, 0.045, 0.3, 10)), timber, 0.06, 0.45, -0.17).rotation.z = -0.35;
      put(shapes.get("fletch", () => new T.ConeGeometry(0.06, 0.1, 6)), paint("#f1ead6"), 0.11, 0.62, -0.17).rotation.z = -0.35;
      hand.set(0.24, 0.42, 0.14);
      break;
    }
    case "fire": {
      put(shapes.get("robe", () => lathe([[0.001, 0.06], [0.2, 0.06], [0.17, 0.2], [0.13, 0.42], [0.11, 0.52], [0.001, 0.53]], 18)), cloth, 0, 0, 0);
      put(shapes.get("hem", () => new T.TorusGeometry(0.195, 0.022, 6, 24).rotateX(Math.PI / 2)), glow, 0, 0.08, 0);
      put(shapes.get("robeSash", () => new T.TorusGeometry(0.135, 0.022, 6, 20).rotateX(Math.PI / 2)), trim, 0, 0.36, 0);
      arms(cloth, 0.45);
      face(0.63);
      // A tall pointed hat with a band of the side's colour, bent a little at the tip.
      put(shapes.get("brim", () => new T.CylinderGeometry(0.21, 0.21, 0.025, 24)), cloth, 0, 0.72, 0);
      put(shapes.get("band", () => new T.CylinderGeometry(0.125, 0.13, 0.05, 20)), trim, 0, 0.755, 0);
      const cone = put(shapes.get("hat", () => new T.ConeGeometry(0.12, 0.36, 18).translate(0, 0.18, 0)), cloth, 0, 0.775, 0);
      cone.rotation.x = -0.18;
      staff(shapes.get("ember", () => new T.SphereGeometry(0.06, 14, 10)), glow, 0.62);
      put(shapes.get("flame", () => new T.ConeGeometry(0.04, 0.1, 8)), glow, -0.22, 0.86, 0.12);
      break;
    }
    case "healer": {
      put(shapes.get("gown", () => lathe([[0.001, 0.06], [0.19, 0.06], [0.16, 0.24], [0.13, 0.44], [0.11, 0.52], [0.001, 0.53]], 18)), cloth, 0, 0, 0);
      put(shapes.get("hem", () => new T.TorusGeometry(0.195, 0.022, 6, 24).rotateX(Math.PI / 2)), trim, 0, 0.08, 0);
      // A cross of the side's colour on the breast.
      put(shapes.get("crossA", () => block(0.05, 0.14, 0.02, 0.006)), trim, 0, 0.38, 0.13);
      put(shapes.get("crossB", () => block(0.13, 0.05, 0.02, 0.006)), trim, 0, 0.39, 0.13);
      arms(cloth, 0.45);
      face(0.63);
      // A soft veil over the head.
      put(shapes.get("veil", () => openShell(0.158, 0.72)), shell(paint("#e8f0ea")), 0, 0.635, -0.015);
      put(shapes.get("veilBack", () => lathe([[0.001, 0.5], [0.15, 0.52], [0.13, 0.62], [0.001, 0.64]], 16)), paint("#e8f0ea"), 0, 0, -0.04);
      staff(shapes.get("crystal", () => new T.OctahedronGeometry(0.065)), glow, 0.62);
      break;
    }
    case "assassin": {
      legs(dark);
      // Crouched, slim and dark, with a scarf of the side's colour streaming behind.
      put(shapes.get("garb", () => lathe([[0.001, 0.14], [0.14, 0.14], [0.13, 0.26], [0.14, 0.38], [0.09, 0.46], [0.001, 0.47]], 16)), cloth, 0, 0, 0.02);
      arms(cloth, 0.75);
      face(0.56, 0.1);
      put(shapes.get("cowl", () => lathe([[0.001, 0.44], [0.14, 0.47], [0.14, 0.6], [0.09, 0.69], [0.001, 0.71]], 16)), cloth, 0, 0, -0.025);
      put(shapes.get("mask", () => block(0.2, 0.05, 0.04, 0.012)), dark, 0, 0.53, 0.09);
      put(shapes.get("scarf", () => new T.TorusGeometry(0.1, 0.03, 6, 18).rotateX(Math.PI / 2)), trim, 0, 0.46, 0);
      const tail = put(shapes.get("tail", () => block(0.08, 0.025, 0.26, 0.01).translate(0, 0, -0.13)), trim, 0.03, 0.45, -0.06);
      tail.rotation.x = -0.35;
      tail.rotation.y = 0.3;
      // A dagger in each hand.
      for (const sx of [-1, 1]) {
        const dagger = new T.Group();
        dagger.position.set(sx * 0.25, 0.31, 0.07);
        dagger.rotation.set(1.05, 0, -sx * 0.25);
        body.add(dagger);
        put(shapes.get("knife", () => block(0.034, 0.24, 0.01, 0.004).translate(0, 0.15, 0)), steel, 0, 0, 0, dagger);
        put(shapes.get("knifeGuard", () => block(0.08, 0.018, 0.024, 0.006)), dark, 0, 0.025, 0, dagger);
        put(shapes.get("knifeGrip", () => new T.CylinderGeometry(0.013, 0.013, 0.06, 6)), trim, 0, -0.01, 0, dagger);
      }
      body.position.y = -0.02;
      hand.set(-0.22, 0.32, 0.24);
      break;
    }
    case "light": {
      put(shapes.get("robe2", () => lathe([[0.001, 0.06], [0.2, 0.06], [0.16, 0.22], [0.13, 0.44], [0.11, 0.53], [0.001, 0.54]], 18)), cloth, 0, 0, 0);
      put(shapes.get("hem", () => new T.TorusGeometry(0.195, 0.022, 6, 24).rotateX(Math.PI / 2)), gold, 0, 0.08, 0);
      // A cape of the side's colour down the back, a high collar and a gold circlet.
      put(shapes.get("cape", () => block(0.3, 0.44, 0.025, 0.01).translate(0, -0.22, 0)), trim, 0, 0.54, -0.14).rotation.x = 0.16;
      put(shapes.get("collar", () => new T.CylinderGeometry(0.13, 0.1, 0.08, 18, 1, true)), trim, 0, 0.53, 0);
      arms(cloth, 0.45);
      face(0.64);
      put(shapes.get("hair", () => new T.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), paint("#c9a25a"), 0, 0.655, -0.01);
      put(shapes.get("circlet", () => new T.TorusGeometry(0.122, 0.014, 6, 24).rotateX(Math.PI / 2)), gold, 0, 0.7, 0);
      staff(shapes.get("star", () => new T.IcosahedronGeometry(0.07)), glow, 0.66);
      break;
    }
    case "angel": {
      // White and gold, floating, with wings, a halo and a lance of light.
      body.position.y = 0.08;
      put(shapes.get("angelRobe", () => lathe([[0.001, 0.03], [0.18, 0.03], [0.15, 0.22], [0.12, 0.44], [0.1, 0.52], [0.001, 0.53]], 20)), cloth, 0, 0, 0);
      put(shapes.get("angelHem", () => new T.TorusGeometry(0.178, 0.02, 6, 24).rotateX(Math.PI / 2)), gold, 0, 0.05, 0);
      put(shapes.get("angelSash", () => new T.TorusGeometry(0.13, 0.02, 6, 20).rotateX(Math.PI / 2)), trim, 0, 0.34, 0);
      arms(cloth, 0.4);
      face(0.63);
      put(shapes.get("hair", () => new T.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), paint("#f2d27a"), 0, 0.655, -0.01);
      const halo = paint("#ffe9a0", { emissive: "#ffd45a", emissiveIntensity: 1.4, metalness: 0.4, roughness: 0.3 });
      put(shapes.get("halo", () => new T.TorusGeometry(0.11, 0.018, 8, 28).rotateX(Math.PI / 2)), halo, 0, 0.85, 0);
      const feather = paint("#ffffff", { emissive: "#fff3d0", emissiveIntensity: 0.25, roughness: 0.6, side: T.DoubleSide });
      const wing = shapes.get("wing", () => {
        const s = new T.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(0.12, 0.2, 0.34, 0.34, 0.5, 0.36);
        s.bezierCurveTo(0.44, 0.26, 0.46, 0.2, 0.4, 0.14);
        s.bezierCurveTo(0.36, 0.08, 0.34, 0.02, 0.26, -0.06);
        s.bezierCurveTo(0.2, -0.12, 0.1, -0.12, 0, 0);
        return new T.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
      });
      for (const sx of [-1, 1]) {
        const w = put(wing, feather, sx * 0.05, 0.44, -0.12);
        w.scale.set(sx, 1, 1);
        w.rotation.y = sx * 0.55;
      }
      const lance = new T.Group();
      lance.position.set(-0.22, 0.12, 0.14);
      body.add(lance);
      put(shapes.get("lance", () => new T.CylinderGeometry(0.014, 0.014, 0.8, 8).translate(0, 0.4, 0)), gold, 0, 0, 0, lance);
      put(shapes.get("tip", () => new T.OctahedronGeometry(0.05).scale(0.7, 1.8, 0.7)), glow, 0, 0.86, 0, lance);
      hand.set(-0.22, 1, 0.14);
      break;
    }
  }
  // The health bar, turned toward the eye by the view: a dark backing and a fill of the side's colour.
  body.scale.setScalar(FIGURE_SCALE);
  const bar = new T.Group();
  bar.position.y = (job === "angel" ? 1.16 : 1.02) * FIGURE_SCALE;
  const back = new T.Mesh(shapes.get("barBack", () => new T.PlaneGeometry(0.56, 0.085)), own(new T.MeshBasicMaterial({ color: "#14161a", transparent: true, opacity: 0.82, depthWrite: false })));
  const fill = new T.Mesh(shapes.get("barFill", () => new T.PlaneGeometry(0.52, 0.05).translate(0.26, 0, 0)), own(new T.MeshBasicMaterial({ color: side === 0 ? "#5aa0ff" : "#ff6a5a", depthWrite: false, transparent: true })));
  fill.position.set(-0.26, 0, 0.002);
  back.renderOrder = fill.renderOrder = 8;
  bar.add(back, fill);
  group.add(bar);
  for (const m of paints) m.userData.glow = { color: m.emissive.clone(), intensity: m.emissiveIntensity };
  return { group, body, job, paints, bar, fill, hand };
}
/** Facing 0..3 as a turn of a figure that looks along its own +z. */
export const FACE_YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
