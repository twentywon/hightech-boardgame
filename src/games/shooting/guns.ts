import * as T from "three";
import { block, glossy, wood } from "../../engine/scene-utils";
import { RIGS, type Mode } from "./layout";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/**
 * The three guns, modelled in code in the gun's own frame: the eye at the origin when aimed, the sight line along −z
 * (y up), the rear sight `RIGS[mode].rear` and the front sight `RIGS[mode].front` before the eye.
 *
 * - 비비탄 소총: a plastic air rifle on the booth's swivel, a U-notch rear sight with two dots and a hooded front post
 *   with one dot (three dots in a row when lined up).
 * - 상하 쌍대 산탄총: an over-and-under shotgun, a ventilated rib with a small ivory middle bead and a bright front bead;
 *   the rib's end is the rear sight (lined up, the two beads stand one on the other).
 * - 볼트 액션 소총: a walnut-stocked hunting rifle with an open leaf sight (U notch, two dots) and a ramp with a gold bead.
 *
 * `holder` takes the whole gun; it is turned about the front sight by the view (`tilt`) so that the rear sight stands
 * off the line as the hand wanders, while the front sight stays where I aim.
 */
export interface Gun {
  /** The gun's frame (set at the eye, along the aim) and inside it the part turned about the front sight. */
  root: T.Group;
  tilt: T.Group;
  /** The model itself, in the gun's frame as it stands untilted (muzzles are given in it). */
  body: T.Group;
  /** Where its muzzle (or muzzles) are, in the gun's frame. */
  muzzles: T.Vector3[];
  /** The sights' glowing dots: the rear's and the front's. */
  rearDots: T.MeshBasicMaterial;
  frontDot: T.MeshBasicMaterial;
  /** The shotgun's action opening for a reload, the rifle's bolt being worked. */
  action: T.Object3D | null;
  /** The parts that lay on the swivel at the booth (the BB rifle only). */
  clamp: T.Object3D | null;
}
export function buildGun(mode: Mode, keep: Keep): Gun {
  const rig = RIGS[mode],
    root = new T.Group(),
    tilt = new T.Group(),
    body = new T.Group();
  root.add(tilt);
  // The gun turns about its front sight: the holder sits there and the body is laid back from it.
  tilt.position.set(0, 0, -rig.front);
  body.position.set(0, 0, rig.front);
  tilt.add(body);
  const paint = (options: T.MeshStandardMaterialParameters) => keep(new T.MeshStandardMaterial({ roughness: 0.6, ...options })),
    add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = body) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    },
    /** A box from z0 to z1 (z0 nearer the eye), w wide, h high, its top at `top`. */
    bar = (w: number, h: number, z0: number, z1: number, top: number, material: T.Material, r = Math.min(w, h) * 0.3, parent: T.Object3D = body) =>
      add(block(w, h, Math.abs(z1 - z0), r), material, 0, top - h / 2, (z0 + z1) / 2, parent),
    /** A barrel along −z from z0 to z1 at height y. */
    tube = (radius: number, z0: number, z1: number, y: number, material: T.Material, x = 0, end = radius) => {
      const mesh = add(new T.CylinderGeometry(end, radius, Math.abs(z1 - z0), 24, 1), material, x, y, (z0 + z1) / 2);
      mesh.rotation.x = Math.PI / 2;
      return mesh;
    },
    glow = (color: string) => keep(new T.MeshBasicMaterial({ color })),
    rearDots = glow("#d8ffd0"),
    frontDot = glow("#ff6a3a");
  // Metal is kept half matte: the gun is drawn without a reflected room, where full metal would read as black.
  const blackSteel = keep(glossy({ color: "#2c3035", roughness: 0.38, metalness: 0.45 }, 0.5)),
    gunmetal = paint({ color: "#4a4e55", roughness: 0.4, metalness: 0.5 }),
    /** A U-notch blade facing the eye at z: shoulders `w` wide either side of a notch `gap` wide and `deep` deep, top at y 0. */
    notch = (z: number, w: number, gap: number, deep: number, tall: number, material: T.Material) => {
      const g = new T.Group();
      for (const side of [-1, 1]) {
        const shoulder = new T.Mesh(keep(new T.BoxGeometry(w, tall, 0.004)), material);
        shoulder.position.set(side * (gap / 2 + w / 2), -tall / 2, 0);
        g.add(shoulder);
      }
      const base = new T.Mesh(keep(new T.BoxGeometry(gap + 2 * w, tall - deep, 0.004)), material);
      base.position.set(0, -deep - (tall - deep) / 2, 0);
      g.add(base);
      // The notch's two dots, on the blade's face toward the eye.
      for (const side of [-1, 1]) {
        const dot = new T.Mesh(keep(new T.CircleGeometry(0.0017, 16)), rearDots);
        dot.position.set(side * (gap / 2 + w * 0.42), -deep * 0.55, 0.0021);
        g.add(dot);
      }
      g.position.z = z;
      body.add(g);
      return g;
    };
  let muzzles: T.Vector3[] = [],
    action: T.Object3D | null = null,
    clamp: T.Object3D | null = null;
  if (mode === "bb") {
    // A plastic air rifle: grey stock and grip, a black receiver and shroud, a bright orange tip at the muzzle.
    const plastic = paint({ color: "#2b2f36", roughness: 0.55 }),
      grip = paint({ color: "#15171a", roughness: 0.8 }),
      orange = paint({ color: "#ff7a1a", roughness: 0.45, emissive: "#3a1400" });
    bar(0.042, 0.07, 0.28, -0.34, -0.05, plastic, 0.012);
    bar(0.05, 0.12, 0.3, 0.22, -0.045, grip, 0.01);
    bar(0.032, 0.042, -0.32, -0.64, -0.028, blackSteel, 0.008);
    bar(0.026, 0.09, -0.33, -0.39, -0.07, grip, 0.008).rotation.x = -0.25;
    tube(0.012, -0.62, -0.97, -0.042, blackSteel);
    tube(0.009, -0.96, -1.05, -0.042, orange);
    // A small magazine under the receiver.
    bar(0.024, 0.07, -0.44, -0.5, -0.07, plastic, 0.006);
    // The rear sight: a post on the receiver and the notched blade.
    bar(0.012, 0.021, -0.49, -0.51, -0.007, gunmetal, 0.002);
    notch(-rig.rear, 0.013, 0.0085, 0.006, 0.016, blackSteel);
    // The front sight: a ramp on the barrel, the post with its dot, and its hood.
    bar(0.01, 0.016, -0.985, -1.015, -0.016, gunmetal, 0.003);
    add(new T.BoxGeometry(0.0028, 0.016, 0.003), blackSteel, 0, -0.008, -rig.front);
    const dot = add(new T.CircleGeometry(0.0016, 16), frontDot, 0, -0.0018, -rig.front + 0.0016);
    dot.renderOrder = 2;
    const hood = add(new T.TorusGeometry(0.0115, 0.0011, 6, 32, Math.PI * 1.25), blackSteel, 0, -0.008, -rig.front - 0.002);
    hood.rotation.z = -Math.PI * 0.125;
    muzzles = [new T.Vector3(0, -0.042, -1.05)];
    // The clamp that holds it on the swivel.
    clamp = bar(0.026, 0.06, -0.37, -0.45, -0.045, gunmetal, 0.006);
  } else if (mode === "clay") {
    // An over-and-under: walnut stock and fore-end, a silver action, two blued barrels and a ventilated rib.
    const walnut = keep(new T.MeshStandardMaterial({ map: keep(wood(true, 0.8)), color: "#a86b42", roughness: 0.45 })),
      silver = paint({ color: "#8d9097", roughness: 0.35, metalness: 0.85 }),
      ivory = keep(new T.MeshBasicMaterial({ color: "#efe6cf" }));
    bar(0.034, 0.07, 0.3, -0.38, -0.062, walnut, 0.014);
    bar(0.03, 0.042, -0.37, -0.48, -0.024, silver, 0.008);
    tube(0.0098, -0.46, -1.05, -0.016, blackSteel);
    tube(0.0098, -0.46, -1.05, -0.0385, blackSteel);
    bar(0.034, 0.032, -0.5, -0.82, -0.05, walnut, 0.01);
    // The rib: a flat strip on posts over the upper barrel, its end at the rear sight.
    bar(0.0075, 0.0022, -rig.rear, -1.04, -0.0028, gunmetal, 0.0006);
    for (let z = -0.6; z > -1.02; z -= 0.05) bar(0.004, 0.0035, z, z - 0.012, -0.005, blackSteel, 0.0006);
    const end = bar(0.011, 0.006, -rig.rear + 0.004, -rig.rear - 0.004, -0.0012, gunmetal, 0.001);
    end.name = "rib-end";
    // A small ivory bead halfway and the bright front bead at the muzzle.
    add(new T.SphereGeometry(0.002, 12, 8), ivory, 0, -0.0018, -0.74);
    const rear = add(new T.CircleGeometry(0.0017, 12), rearDots, 0, -0.0018, -0.74 + 0.0021);
    rear.renderOrder = 2;
    add(new T.SphereGeometry(0.0032, 14, 10), frontDot, 0, -0.0016, -rig.front);
    muzzles = [new T.Vector3(0, -0.016, -1.05), new T.Vector3(0, -0.0385, -1.05)];
    action = body;
  } else {
    // A bolt-action rifle: a walnut stock to the fore-end tip, a blued receiver with the bolt at its right, a long barrel.
    const walnut = keep(new T.MeshStandardMaterial({ map: keep(wood(true, 0.9)), color: "#9a5e36", roughness: 0.5 })),
      gold = keep(new T.MeshBasicMaterial({ color: "#ffd25a" }));
    bar(0.04, 0.075, 0.3, -0.7, -0.058, walnut, 0.016);
    bar(0.03, 0.03, -0.3, -0.48, -0.03, blackSteel, 0.008);
    tube(0.0105, -0.46, -0.72, -0.04, blackSteel);
    tube(0.0085, -0.72, -1.09, -0.04, blackSteel, 0, 0.0078);
    const bolt = new T.Group();
    const handle = new T.Mesh(keep(new T.CylinderGeometry(0.0035, 0.0035, 0.06, 10)), blackSteel);
    handle.position.set(0.026, -0.045, 0);
    handle.rotation.z = Math.PI / 2 + 0.6;
    const knob = new T.Mesh(keep(new T.SphereGeometry(0.008, 12, 10)), blackSteel);
    knob.position.set(0.046, -0.068, 0);
    bolt.add(handle, knob);
    bolt.position.set(0, 0, -0.36);
    body.add(bolt);
    action = bolt;
    // The open rear sight on the barrel: a base and the notched leaf.
    bar(0.012, 0.02, -rig.rear + 0.01, -rig.rear - 0.01, -0.012, blackSteel, 0.003);
    notch(-rig.rear, 0.015, 0.009, 0.0065, 0.018, blackSteel);
    // The front sight: a ramp, a post and its gold bead.
    bar(0.011, 0.022, -1.03, -1.07, -0.016, blackSteel, 0.003);
    add(new T.BoxGeometry(0.0026, 0.016, 0.003), blackSteel, 0, -0.0085, -rig.front);
    add(new T.SphereGeometry(0.0019, 12, 10), gold, 0, -0.0017, -rig.front);
    const dot = add(new T.CircleGeometry(0.0015, 16), frontDot, 0, -0.0017, -rig.front + 0.0021);
    dot.renderOrder = 2;
    muzzles = [new T.Vector3(0, -0.04, -1.09)];
  }
  body.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return { root, tilt, body, muzzles, rearDots, frontDot, action, clamp };
}
