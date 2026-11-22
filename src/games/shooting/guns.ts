import * as T from "three";
import { glossy } from "../../engine/scene-utils";
import { RIGS, type Mode } from "./layout";
import { canvas, sequence } from "./paint";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/**
 * The three guns, modelled in code in the gun's own frame: the eye at the origin when aimed, the sight line along −z
 * (y up), the rear sight `RIGS[mode].rear` and the front sight `RIGS[mode].front` before the eye. Each is built as a
 * gun is: a stock drawn as a side profile and extruded with rounded edges (walnut with its grain and chequered grip,
 * or stippled polymer), a turned receiver, a tapered barrel with its crown, iron sights, a trigger in its guard, and
 * the two gloved hands that hold it (the left under the fore-end, the right on the grip).
 *
 * - 비비탄 소총: a polymer air rifle on the booth's swivel: a shrouded barrel with an orange tip, a rail on the
 *   receiver, a U-notch rear sight with two dots and a hooded front post with one (three dots in a row when lined up).
 * - 상하 쌍대 산탄총: an over-and-under shotgun, a silver engraved action, two blued barrels under a ventilated rib with
 *   a small ivory middle bead and a bright front bead (lined up, the two beads stand one on the other).
 * - 볼트 액션 소총: a walnut-stocked hunting rifle with an open leaf sight (U notch, two dots) and a ramp with a gold bead.
 *
 * Everything is kept below the sight line, so that aimed the gun runs up from the bottom of the picture to the front
 * sight in its middle and hides nothing above it. `tilt` takes the whole gun and is turned about the front sight by
 * the view, so that the rear sight stands off the line as the hand wanders while the front sight stays where I aim.
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
type V = [number, number];
/** Painted surfaces of the guns, made once a gun. */
function grain(keep: Keep, base: string, dark: string, light: string, seed: number) {
  const { c, ctx } = canvas(512, 256),
    random = sequence(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);
  // Long wavering lines of figure along the stock, darker and lighter, and a few dark flecks of pores.
  for (let k = 0; k < 90; k++) {
    const y0 = random() * 256,
      amp = 2 + random() * 9,
      freq = 0.004 + random() * 0.012,
      phase = random() * 6.28;
    ctx.strokeStyle = random() < 0.62 ? dark : light;
    ctx.globalAlpha = 0.18 + random() * 0.35;
    ctx.lineWidth = 0.6 + random() * 2.6;
    ctx.beginPath();
    for (let x = -4; x <= 516; x += 8) ctx.lineTo(x, y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase * 2) * amp * 0.25);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = dark;
  for (let k = 0; k < 900; k++) ctx.fillRect(random() * 512, random() * 256, 1 + random() * 3, 0.8);
  ctx.globalAlpha = 1;
  const t = keep(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(2.6, 6);
  t.anisotropy = 4;
  return t;
}
/** Fine diamond chequering, laid over a grip's wood. */
function chequer(keep: Keep, base: string, line: string) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.4;
  for (let k = -128; k < 256; k += 8) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + 128, 128);
    ctx.moveTo(k, 128);
    ctx.lineTo(k + 128, 0);
    ctx.stroke();
  }
  const t = keep(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(30, 30);
  return t;
}
/** A stippled polymer, dark with paler specks. */
function stipple(keep: Keep, base: string) {
  const { c, ctx } = canvas(256, 256),
    random = sequence(41);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 5000; k++) {
    const v = random();
    ctx.fillStyle = v < 0.5 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.09)";
    ctx.fillRect(random() * 256, random() * 256, 1.3, 1.3);
  }
  const t = keep(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(9, 9);
  return t;
}
/** Scroll engraving on bright steel, for the shotgun's action. */
function engraving(keep: Keep) {
  const { c, ctx } = canvas(256, 128),
    random = sequence(17);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#d9dce2");
  g.addColorStop(0.5, "#a6abb4");
  g.addColorStop(1, "#c7cbd2");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "rgba(40,44,52,0.55)";
  ctx.lineWidth = 1.1;
  for (let k = 0; k < 26; k++) {
    const x = random() * 256,
      y = random() * 128,
      r = 6 + random() * 14;
    ctx.beginPath();
    for (let a = 0; a < 9; a += 0.25) ctx.lineTo(x + Math.cos(a) * r * (1 - a / 11), y + Math.sin(a) * r * (1 - a / 11));
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(40,44,52,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, 244, 116);
  const t = keep(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** How far each gun's body is laid off the line of sight (radians, its rear down). */
const SLANT: Record<Mode, number> = { bb: 0.06, clay: 0.065, hunt: 0.06 };
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
    /** A turned part along −z: `profile` is [z, radius] from the rear forward, at height y. */
    turned = (profile: V[], y: number, material: T.Material, x = 0, segments = 28, parent: T.Object3D = body) => {
      const points = profile.map(([z, r]) => new T.Vector2(Math.max(0.0001, r), -z)),
        mesh = add(new T.LatheGeometry(points, segments), material, x, y, 0, parent);
      mesh.rotation.x = -Math.PI / 2;
      return mesh;
    },
    /** A barrel along −z from z0 to z1 at height y, tapering from `r0` to `r1`, its end crowned and bored. */
    barrel = (z0: number, z1: number, r0: number, r1: number, y: number, material: T.Material, x = 0, bore = r1 * 0.45) => {
      turned(
        [
          [z0, 0.0001],
          [z0, r0],
          [z0 + (z1 - z0) * 0.12, r0 * 0.97],
          [z1 + 0.004, r1],
          [z1, r1 * 0.9],
          [z1, bore],
          [z1 + 0.03, bore],
        ],
        y,
        material,
        x,
      );
    },
    /** A solid drawn as a side profile ([z, y] round the outline) and extruded `w` wide about x 0, its edges rounded. */
    profile = (outline: V[], w: number, material: T.Material, bevel = Math.min(0.008, w * 0.22), x = 0) => {
      const shape = new T.Shape();
      outline.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
      shape.closePath();
      const depth = Math.max(0.001, w - 2 * bevel),
        geometry = new T.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelThickness: bevel,
          bevelSize: bevel * 0.9,
          bevelSegments: 3,
          curveSegments: 8,
        });
      geometry.rotateY(-Math.PI / 2);
      geometry.translate(depth / 2, 0, 0);
      geometry.computeVertexNormals();
      return add(geometry, material, x, 0, 0);
    },
    /** A smooth outline through points, as a curve sampled `n` times between each pair (a closed Catmull–Rom). */
    smooth = (points: V[], n = 4): V[] => {
      const curve = new T.CatmullRomCurve3(
        points.map(([z, y]) => new T.Vector3(z, y, 0)),
        true,
        "centripetal",
      );
      return curve.getPoints(points.length * n).map((p) => [p.x, p.y] as V);
    },
    /** A rod from `a` to `b` (a finger's bone, a sling's loop) of radius `r`, rounded at both ends. */
    limb = (a: T.Vector3, b: T.Vector3, r: number, material: T.Material, parent: T.Object3D = body) => {
      const d = b.clone().sub(a),
        mesh = add(new T.CapsuleGeometry(r, Math.max(0.0005, d.length()), 4, 10), material, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, parent);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      return mesh;
    },
    v = (x: number, y: number, z: number) => new T.Vector3(x, y, z),
    glow = (color: string) => keep(new T.MeshBasicMaterial({ color })),
    rearDots = glow("#d8ffd0"),
    frontDot = glow("#ff6a3a");
  /**
   * The left hand under the fore-end at `z` (the fore-end's middle at height `y`, `half` its half-width, `under` its
   * underside): the palm under it, four fingers up its right side, the thumb along its left, the wrist and forearm
   * going back and down out of the picture.
   */
  const leftHand = (z: number, y: number, half: number, under: number, skin: T.Material, cuff: T.Material) => {
    const palmY = under - 0.012,
      palm = add(new T.SphereGeometry(1, 16, 12), skin, 0.004, palmY, z + 0.006);
    palm.scale.set(half + 0.016, 0.016, 0.046);
    for (let k = 0; k < 4; k++) {
      const fz = z - 0.03 + k * 0.019,
        len = [0.028, 0.032, 0.03, 0.024][k],
        base = v(half + 0.006, palmY + 0.004, fz),
        knuckle = v(half + 0.011, y - 0.002, fz - 0.002),
        tip = v(half - 0.004, y + len * 0.55, fz - 0.004);
      limb(base, knuckle, 0.0085, skin);
      limb(knuckle, tip, 0.0075, skin);
    }
    limb(v(-half - 0.004, palmY + 0.002, z + 0.03), v(-half - 0.008, y - 0.004, z - 0.005), 0.0095, skin);
    limb(v(-half - 0.008, y - 0.004, z - 0.005), v(-half - 0.004, y + 0.012, z - 0.035), 0.0082, skin);
    limb(v(-0.004, palmY - 0.004, z + 0.045), v(-0.05, palmY - 0.09, z + 0.2), 0.024, skin);
    limb(v(-0.05, palmY - 0.09, z + 0.2), v(-0.13, palmY - 0.3, z + 0.48), 0.034, cuff);
  };
  /**
   * The right hand on the grip, its middle at (`z`, `y`): the palm round the grip's right side, fingers wrapped round
   * its front, the forefinger in the guard on the trigger at `trigger`, the thumb over the wrist, the forearm going
   * back and down to the right.
   */
  const rightHand = (z: number, y: number, half: number, trigger: V, skin: T.Material, cuff: T.Material) => {
    const palm = add(new T.SphereGeometry(1, 16, 12), skin, half + 0.012, y - 0.006, z + 0.012);
    palm.scale.set(0.018, 0.045, 0.034);
    palm.rotation.x = -0.35;
    for (let k = 0; k < 3; k++) {
      const fy = y - 0.018 - k * 0.019;
      limb(v(half + 0.01, fy, z - 0.012), v(0.004, fy - 0.002, z - 0.032), 0.0085, skin);
      limb(v(0.004, fy - 0.002, z - 0.032), v(-half - 0.004, fy - 0.004, z - 0.014), 0.0078, skin);
    }
    // The forefinger, out to the trigger.
    limb(v(half + 0.01, y + 0.008, z - 0.012), v(0.006, trigger[1] - 0.006, trigger[0] + 0.012), 0.0078, skin);
    limb(v(0.006, trigger[1] - 0.006, trigger[0] + 0.012), v(-0.002, trigger[1] - 0.012, trigger[0] - 0.004), 0.0072, skin);
    limb(v(half + 0.006, y + 0.022, z + 0.012), v(-half - 0.006, y + 0.034, z - 0.012), 0.009, skin);
    limb(v(half + 0.02, y - 0.03, z + 0.035), v(0.09, y - 0.16, z + 0.2), 0.026, skin);
    limb(v(0.09, y - 0.16, z + 0.2), v(0.17, y - 0.34, z + 0.42), 0.036, cuff);
  };
  /** A trigger guard (an oval loop) under the stock from z0 forward to z1, hanging down to `low`, and its trigger. */
  const guard = (z0: number, z1: number, top: number, low: number, metal: T.Material) => {
    const cz = (z0 + z1) / 2,
      cy = (top + low) / 2,
      rz = Math.abs(z1 - z0) / 2,
      ry = (top - low) / 2,
      loop = new T.CatmullRomCurve3(
        Array.from({ length: 16 }, (_, k) => {
          const a = (k / 16) * Math.PI * 2,
            // Flat along the top, where it is let into the stock.
            y = cy + ry * Math.min(0.85, Math.sin(a));
          return new T.Vector3(0, y, cz + rz * Math.cos(a));
        }),
        true,
      );
    add(new T.TubeGeometry(loop, 40, 0.0032, 6, true), metal, 0, 0, 0);
    const blade = add(new T.BoxGeometry(0.004, top - low - 0.01, 0.005), metal, 0, cy + 0.004, cz + rz * 0.15);
    blade.rotation.x = -0.3;
  };
  /** A U-notch blade facing the eye at z: shoulders `w` wide either side of a notch `gap` wide and `deep` deep, top at y 0. */
  const notch = (z: number, w: number, gap: number, deep: number, tall: number, material: T.Material) => {
    const g = new T.Group(),
      outline = new T.Shape(),
      half = gap / 2 + w;
    outline.moveTo(-half, -tall);
    outline.lineTo(half, -tall);
    outline.lineTo(half, -0.0008);
    outline.quadraticCurveTo(half, 0, half - 0.0008, 0);
    outline.lineTo(gap / 2, 0);
    outline.lineTo(gap / 2, -deep + gap / 2);
    outline.absarc(0, -deep + gap / 2, gap / 2, 0, Math.PI, true);
    outline.lineTo(-gap / 2, 0);
    outline.lineTo(-half + 0.0008, 0);
    outline.quadraticCurveTo(-half, 0, -half, -0.0008);
    outline.closePath();
    const blade = new T.Mesh(
      keep(
        new T.ExtrudeGeometry(outline, {
          depth: 0.003,
          bevelEnabled: false,
          curveSegments: 10,
        }),
      ),
      material,
    );
    blade.position.z = -0.0015;
    g.add(blade);
    // The notch's two dots, on the blade's face toward the eye.
    for (const side of [-1, 1]) {
      const dot = new T.Mesh(keep(new T.CircleGeometry(0.0017, 16)), rearDots);
      dot.position.set(side * (gap / 2 + w * 0.42), -deep * 0.55, 0.0018);
      g.add(dot);
    }
    g.position.z = z;
    g.userData.sight = true;
    body.add(g);
    return g;
  };
  /** Marks a part as one of the sights, which stay on the sight line while the rest of the gun is laid at its slant. */
  const fixed = <O extends T.Object3D>(o: O) => {
    o.userData.sight = true;
    return o;
  };
  // Metal is kept half matte and not too dark: the gun is drawn without a reflected room, where full metal reads black.
  const blued = keep(glossy({ color: "#3a424d", roughness: 0.3, metalness: 0.45 }, 0.6)),
    gunmetal = paint({ color: "#575d66", roughness: 0.36, metalness: 0.5 });
  let muzzles: T.Vector3[] = [],
    action: T.Object3D | null = null,
    clamp: T.Object3D | null = null;
  if (mode === "bb") {
    // A polymer air rifle: a stippled stock with a pistol grip, a black receiver with a rail, a shrouded barrel with
    // an orange tip, held in bare hands.
    const polymer = paint({ color: "#353a42", map: stipple(keep, "#353a42"), roughness: 0.75 }),
      rubber = paint({ color: "#1b1d21", roughness: 0.9 }),
      orange = paint({ color: "#ff7a1a", roughness: 0.45, emissive: "#3a1400" }),
      skin = paint({ color: "#e0ac88", roughness: 0.62 }),
      sleeve = paint({ color: "#3a4f8a", roughness: 0.85 }),
      axis = -0.042;
    // The stock: butt, comb, a pistol grip, and the fore-end the receiver lies in.
    profile(
      smooth([[0.34, -0.064], [0.2, -0.056], [0.07, -0.062], [0.0, -0.076], [-0.12, -0.06], [-0.2, -0.056], [-0.5, -0.056], [-0.53, -0.068], [-0.5, -0.088],
        [-0.24, -0.092], [-0.08, -0.094], [-0.05, -0.116], [-0.04, -0.184], [0.015, -0.19], [0.025, -0.124], [0.09, -0.114], [0.22, -0.152], [0.34, -0.2]]),
      0.04,
      polymer,
    );
    profile([[0.34, -0.06], [0.352, -0.062], [0.352, -0.205], [0.34, -0.2]], 0.042, rubber, 0.004);
    // The receiver, its rail of crossing ribs, the shroud over the barrel and its orange tip.
    turned([[-0.2, 0.0001], [-0.2, 0.011], [-0.21, 0.0155], [-0.45, 0.0155], [-0.46, 0.012], [-0.46, 0.0001]], axis, blued);
    add(new T.BoxGeometry(0.013, 0.004, 0.2), gunmetal, 0, axis + 0.016, -0.33);
    for (let z = -0.24; z > -0.42; z -= 0.012) add(new T.BoxGeometry(0.015, 0.003, 0.005), gunmetal, 0, axis + 0.0185, z);
    barrel(-0.46, -0.96, 0.012, 0.0115, axis, blued);
    turned([[-0.955, 0.0001], [-0.955, 0.0122], [-1.04, 0.012], [-1.045, 0.009], [-1.045, 0.004], [-1.06, 0.004]], axis, orange);
    // A loading port and a cocking knob at the right of the receiver.
    add(new T.BoxGeometry(0.003, 0.009, 0.05), rubber, 0.0155, axis + 0.004, -0.3);
    limb(v(0.015, axis, -0.24), v(0.03, axis - 0.004, -0.24), 0.004, gunmetal);
    add(new T.SphereGeometry(0.0065, 12, 10), rubber, 0.032, axis - 0.004, -0.24);
    // A small magazine under the fore-end, the guard and trigger.
    profile([[-0.3, -0.09], [-0.36, -0.09], [-0.365, -0.13], [-0.305, -0.13]], 0.022, rubber, 0.004);
    guard(-0.06, -0.13, -0.094, -0.126, rubber);
    // The rear sight: a base on the barrel and the notched blade.
    fixed(add(new T.BoxGeometry(0.006, 0.05, 0.016), gunmetal, 0, -0.035, -rig.rear + 0.009));
    notch(-rig.rear, 0.0055, 0.008, 0.005, 0.012, gunmetal);
    // The front sight: a ramp on the shroud, the post with its dot, and its hood.
    add(new T.BoxGeometry(0.009, 0.022, 0.03), gunmetal, 0, -0.019, -rig.front);
    fixed(add(new T.BoxGeometry(0.0026, 0.012, 0.003), blued, 0, -0.006, -rig.front));
    const dot = fixed(add(new T.CircleGeometry(0.0016, 16), frontDot, 0, -0.0018, -rig.front + 0.0016));
    dot.renderOrder = 2;
    const hood = fixed(add(
      new T.CylinderGeometry(0.011, 0.011, 0.022, 28, 1, true, Math.PI * 0.75, Math.PI * 1.5),
      keep(glossy({ color: "#3a424d", roughness: 0.3, metalness: 0.45, side: T.DoubleSide }, 0.6)),
      0,
      -0.008,
      -rig.front - 0.004,
    ));
    hood.rotation.x = Math.PI / 2;
    muzzles = [new T.Vector3(0, axis, -1.05)];
    // The clamp that holds it on the swivel.
    clamp = profile([[-0.4, -0.09], [-0.48, -0.09], [-0.48, -0.125], [-0.4, -0.125]], 0.026, gunmetal, 0.004);
    leftHand(-0.43, -0.074, 0.02, -0.092, skin, sleeve);
    rightHand(-0.02, -0.135, 0.02, [-0.095, -0.108], skin, sleeve);
  } else if (mode === "clay") {
    // An over-and-under: a walnut stock with a chequered grip, an engraved silver action, two blued barrels under a
    // ventilated rib, a walnut fore-end; held in tan shooting gloves.
    const walnut = paint({ map: grain(keep, "#7a4423", "#3a1c0c", "#b0703c", 5), roughness: 0.42 }),
      grip = paint({ map: chequer(keep, "#6a3a1e", "#2e160a"), roughness: 0.7 }),
      silver = paint({ map: engraving(keep), roughness: 0.32, metalness: 0.7 }),
      ivory = keep(new T.MeshBasicMaterial({ color: "#efe6cf" })),
      glove = paint({ color: "#b08a5c", roughness: 0.8 }),
      sleeve = paint({ color: "#2f4a3a", roughness: 0.85 }),
      upper = -0.017,
      lower = -0.04;
    profile(
      smooth([[0.36, -0.052], [0.2, -0.046], [0.06, -0.054], [-0.08, -0.066], [-0.28, -0.05], [-0.33, -0.05], [-0.33, -0.092], [-0.26, -0.1], [-0.23, -0.14],
        [-0.17, -0.15], [-0.16, -0.112], [0.0, -0.122], [0.36, -0.205]]),
      0.042,
      walnut,
    );
    profile([[0.355, -0.048], [0.37, -0.05], [0.37, -0.21], [0.355, -0.205]], 0.044, paint({ color: "#1d1a18", roughness: 0.9 }), 0.004);
    // The grip's chequering, laid on both its sides.
    for (const side of [-1, 1]) {
      const patch = add(new T.PlaneGeometry(0.065, 0.04), grip, side * 0.0211, -0.112, -0.22);
      patch.rotation.set(0, (side * Math.PI) / 2, -1.0 * side);
    }
    // The action: an engraved silver block with rounded corners, and the top lever.
    profile([[-0.33, -0.01], [-0.43, -0.01], [-0.435, -0.016], [-0.435, -0.058], [-0.33, -0.058], [-0.325, -0.03]], 0.032, silver, 0.006);
    const lever = add(new T.BoxGeometry(0.022, 0.004, 0.01), silver, 0.006, -0.009, -0.328);
    lever.rotation.y = -0.4;
    // The barrels, joined at their sides, under the rib and its posts.
    barrel(-0.43, -1.05, 0.0118, 0.0098, upper, blued);
    barrel(-0.43, -1.05, 0.0118, 0.0098, lower, blued);
    for (const side of [-1, 1]) add(new T.BoxGeometry(0.004, 0.012, 0.6), blued, side * 0.0105, (upper + lower) / 2, -0.74);
    add(new T.BoxGeometry(0.0075, 0.0018, 0.6), gunmetal, 0, -0.0029, -0.74);
    for (let z = -0.46; z > -1.03; z -= 0.045) add(new T.BoxGeometry(0.0036, 0.0028, 0.012), blued, 0, -0.0052, z);
    // The fore-end of walnut under the barrels, its tip rounded.
    profile(smooth([[-0.45, -0.04], [-0.68, -0.038], [-0.72, -0.048], [-0.7, -0.07], [-0.47, -0.074], [-0.44, -0.062]], 3), 0.036, walnut);
    // A small ivory bead halfway and the bright front bead at the muzzle.
    fixed(add(new T.SphereGeometry(0.002, 12, 8), ivory, 0, -0.0018, -0.74));
    fixed(add(new T.CylinderGeometry(0.0009, 0.0012, 0.02, 6), ivory, 0, -0.0118, -0.74));
    const rear = fixed(add(new T.CircleGeometry(0.0017, 12), rearDots, 0, -0.0018, -0.74 + 0.0021));
    rear.renderOrder = 2;
    fixed(add(new T.SphereGeometry(0.0032, 14, 10), frontDot, 0, -0.0016, -rig.front));
    guard(-0.25, -0.31, -0.1, -0.126, silver);
    muzzles = [new T.Vector3(0, upper, -1.05), new T.Vector3(0, lower, -1.05)];
    action = body;
    leftHand(-0.6, -0.056, 0.018, -0.074, glove, sleeve);
    rightHand(-0.21, -0.13, 0.021, [-0.28, -0.112], glove, sleeve);
  } else {
    // A bolt-action rifle: a walnut stock to the fore-end's tip with a chequered grip, a blued receiver with the bolt
    // at its right, a long tapered barrel, an open sight and a ramped bead; held in brown leather gloves.
    const walnut = paint({ map: grain(keep, "#6e3c1f", "#2e1509", "#a8673a", 11), roughness: 0.5 }),
      grip = paint({ map: chequer(keep, "#5e3219", "#24100a"), roughness: 0.75 }),
      gold = keep(new T.MeshBasicMaterial({ color: "#ffd25a" })),
      glove = paint({ color: "#5a3a24", roughness: 0.75 }),
      sleeve = paint({ color: "#4a5a34", roughness: 0.9 }),
      axis = -0.04;
    profile(
      smooth([[0.36, -0.062], [0.2, -0.054], [0.07, -0.062], [-0.02, -0.078], [-0.14, -0.06], [-0.22, -0.054], [-0.74, -0.052], [-0.765, -0.064], [-0.74, -0.084],
        [-0.32, -0.09], [-0.16, -0.094], [-0.08, -0.104], [-0.05, -0.154], [0.005, -0.162], [0.015, -0.114], [0.12, -0.122], [0.36, -0.205]]),
      0.044,
      walnut,
    );
    profile([[0.355, -0.058], [0.372, -0.06], [0.372, -0.21], [0.355, -0.205]], 0.046, paint({ color: "#231c17", roughness: 0.9 }), 0.004);
    for (const side of [-1, 1]) {
      const patch = add(new T.PlaneGeometry(0.07, 0.04), grip, side * 0.0221, -0.11, -0.02);
      patch.rotation.set(0, (side * Math.PI) / 2, -1.05 * side);
    }
    // The receiver and the barrel, tapered to a crowned muzzle.
    turned([[-0.2, 0.0001], [-0.2, 0.011], [-0.212, 0.0155], [-0.45, 0.0155], [-0.46, 0.0132]], axis, blued);
    barrel(-0.46, -1.09, 0.0125, 0.0085, axis, blued);
    // The bolt: a sleeve at the back of the receiver, its handle bent down to a knob at the right.
    const bolt = new T.Group();
    bolt.position.set(0, axis, -0.23);
    body.add(bolt);
    turned([[0.04, 0.0001], [0.04, 0.008], [0.02, 0.0105], [-0.01, 0.0105], [-0.01, 0.0001]], 0, gunmetal, 0, 20, bolt);
    limb(v(0.008, 0, 0), v(0.04, -0.018, 0.012), 0.0035, blued, bolt);
    const knob = add(new T.SphereGeometry(0.0085, 14, 12), blued, 0.044, -0.022, 0.014, bolt);
    knob.scale.set(1, 1, 1.15);
    action = bolt;
    // A floor plate under the action, the guard and trigger; sling swivels at the fore-end and the butt.
    add(new T.BoxGeometry(0.03, 0.004, 0.12), blued, 0, -0.095, -0.3);
    guard(-0.12, -0.19, -0.096, -0.124, blued);
    for (const [z, y] of [[-0.7, -0.087], [0.27, -0.18]] as V[]) {
      const loop = add(new T.TorusGeometry(0.009, 0.0016, 6, 16), blued, 0, y - 0.008, z);
      loop.rotation.y = Math.PI / 2;
    }
    // The open rear sight on the barrel: a base and the notched leaf.
    fixed(add(new T.BoxGeometry(0.006, 0.05, 0.016), gunmetal, 0, -0.037, -rig.rear + 0.004));
    notch(-rig.rear, 0.006, 0.008, 0.0055, 0.013, gunmetal);
    // The front sight: a ramp on a band round the barrel, a post and its gold bead.
    turned([[-1.03, 0.0001], [-1.03, 0.0098], [-1.075, 0.0098], [-1.075, 0.0001]], axis, blued);
    profile([[-1.03, axis + 0.006], [-1.072, axis + 0.006], [-1.07, -0.012], [-1.05, -0.012]], 0.009, blued, 0.002);
    fixed(add(new T.BoxGeometry(0.0026, 0.012, 0.003), blued, 0, -0.0072, -rig.front));
    fixed(add(new T.SphereGeometry(0.0019, 12, 10), gold, 0, -0.0017, -rig.front));
    const dot = fixed(add(new T.CircleGeometry(0.0015, 16), frontDot, 0, -0.0017, -rig.front + 0.0021));
    dot.renderOrder = 2;
    muzzles = [new T.Vector3(0, axis, -1.09)];
    leftHand(-0.6, -0.071, 0.022, -0.09, glove, sleeve);
    rightHand(-0.02, -0.13, 0.022, [-0.155, -0.11], glove, sleeve);
  }
  // The gun laid at a slant under the sights, turned about the front sight: its rear drops away below the line of
  // sight (as a gun held to the cheek is seen), so that the receiver and the stock fall out of the bottom of the
  // picture and the barrel runs up from there to the front sight.
  const frame = new T.Group(),
    inner = new T.Group(),
    slant = SLANT[mode],
    hinge = muzzles[0].y;
  frame.position.set(0, hinge, -rig.front);
  frame.rotation.x = slant;
  inner.position.set(0, -hinge, rig.front);
  frame.add(inner);
  for (const child of [...body.children]) if (!child.userData.sight) inner.add(child);
  body.add(frame);
  frame.updateMatrix();
  inner.updateMatrix();
  const laid = frame.matrix.clone().multiply(inner.matrix);
  muzzles = muzzles.map((m) => m.clone().applyMatrix4(laid));
  if (action === body) action = frame;
  body.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return { root, tilt, body, muzzles, rearDots, frontDot, action, clamp };
}
