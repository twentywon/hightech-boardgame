import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block } from "../../engine/scene-utils";

/**
 * The white lay figure across the table, modelled in code: a turned torso and
 * head with a face, ball joints, tapered limbs and jointed hands. Its arms are
 * two bones each that follow a hand (`Arm.reach`).
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
const UP = new T.Vector3(0, 1, 0);
/** The two bones of an arm. */
export const UPPER = 1.45,
  FORE = 1.55;
/** A turned shape from a profile written bottom up, so that its faces look outward. */
const turned = (points: [number, number][], segments = 40, start = 0) =>
  new T.LatheGeometry(
    points.map(([r, y]) => new T.Vector2(Math.max(0.001, r), y)),
    segments,
    start,
  );
/** A limb `length` long between two ball joints, wider at the top, with a little belly; its middle at the origin, along y. */
const limb = (length: number, top: number, bottom: number) =>
  turned(
    Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [bottom + (top - bottom) * t + Math.sin(Math.PI * t) * 0.03, -length / 2 + length * t] as [number, number];
    }),
    24,
  );
/** A piece of a finger: a capsule laid from `a` to `b`. */
function bone(a: T.Vector3, b: T.Vector3, radius: number) {
  const g = new T.CapsuleGeometry(radius, Math.max(0.001, a.distanceTo(b)), 4, 10);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
/**
 * A hand in one piece, the wrist at the origin, the fingers along +y and the palm facing +z; the thumb on the side
 * `side` of x. `curl` bends each finger joint toward the palm, `thumb` swings the thumb across it.
 */
export function handGeometry(side: 1 | -1, curl: number, thumb: number) {
  const parts: T.BufferGeometry[] = [],
    palm = block(0.29, 0.3, 0.12, 0.05);
  palm.translate(0, 0.19, 0);
  parts.push(palm);
  // The fleshy root of the thumb.
  const pad = new T.SphereGeometry(0.075, 12, 8);
  pad.scale(1, 1.4, 0.8);
  pad.translate(side * 0.085, 0.12, 0.035);
  parts.push(pad);
  const lengths = [0.25, 0.29, 0.27, 0.2];
  lengths.forEach((length, i) => {
    const x = side * (0.105 - i * 0.07),
      radius = i === 3 ? 0.029 : 0.033;
    let at = new T.Vector3(x, 0.34, 0),
      angle = 0;
    // Two joints, each bent by the curl (the outer one a little more).
    for (const [share, bend] of [
      [0.55, curl * 0.9],
      [0.45, curl * 1.15],
    ]) {
      angle += bend;
      const next = at.clone().add(new T.Vector3(0, Math.cos(angle), Math.sin(angle)).multiplyScalar(length * share));
      parts.push(bone(at, next, radius));
      at = next;
    }
  });
  // The thumb: out from the palm's side, then across it.
  const base = new T.Vector3(side * 0.13, 0.1, 0.03),
    mid = base.clone().add(new T.Vector3(side * 0.07, 0.09, 0.05 + thumb * 0.03)),
    tip = mid.clone().add(new T.Vector3(side * (0.03 - thumb * 0.09), 0.08, 0.04 + thumb * 0.06));
  parts.push(bone(base, mid, 0.038), bone(mid, tip, 0.034));
  const wrist = new T.SphereGeometry(0.11, 14, 10);
  parts.push(wrist);
  const hand = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return hand;
}
/**
 * The figure's face, painted on the picture of its turned head: calm almond eyes with grey irises under a lid line,
 * soft brows, a shadow round each eye, lips and a faint warmth in the cheeks. `radius` tells for a height of the head
 * its radius and the picture's row (v); `wide` is how much narrower than deep the head is.
 */
function paintFace(radius: (y: number) => { r: number; v: number }, wide: number) {
  const W = 1024,
    H = 512,
    canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!,
    at = (x: number, y: number): [number, number] => {
      const { r, v } = radius(y),
        phi = Math.asin(Math.max(-1, Math.min(1, x / (wide * r))));
      return [(0.5 + phi / (Math.PI * 2)) * W, (1 - v) * H];
    },
    path = (points: [number, number][]) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(...at(x, y)) : ctx.moveTo(...at(x, y))));
    },
    arc = (cx: number, cy: number, half: number, rise: number, from = -1, to = 1, steps = 16) =>
      Array.from({ length: steps + 1 }, (_, i) => {
        const t = from + ((to - from) * i) / steps;
        return [cx + t * half, cy + rise * Math.cos((t * Math.PI) / 2)] as [number, number];
      }),
    blot = (x: number, y: number, size: number, color: string, alpha: number) => {
      const [cx, cy] = at(x, y),
        [ex] = at(x + size, y),
        reach = Math.abs(ex - cx),
        g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
      g.addColorStop(0, color.replace("A", String(alpha)));
      g.addColorStop(1, color.replace("A", "0"));
      ctx.fillStyle = g;
      ctx.fillRect(cx - reach, cy - reach, reach * 2, reach * 2);
    };
  ctx.fillStyle = "#f3f1ec";
  ctx.fillRect(0, 0, W, H);
  for (const s of [-1, 1]) {
    const x = s * 0.155,
      y = 0.025;
    // The hollow round the eye and the cheek's warmth.
    blot(x, y + 0.01, 0.13, "rgba(120,100,90,A)", 0.16);
    blot(s * 0.23, -0.15, 0.12, "rgba(225,160,150,A)", 0.14);
    // The almond of the eye, its iris and pupil, a glint.
    const upper = arc(x, y, 0.076, 0.04),
      lower = arc(x, y, 0.076, -0.024).reverse();
    path([...upper, ...lower]);
    ctx.fillStyle = "#fbfbf8";
    ctx.fill();
    ctx.save();
    ctx.clip();
    const [ix, iy] = at(x, y + 0.004),
      [ex] = at(x + 0.031, y);
    ctx.fillStyle = "#71808d";
    ctx.beginPath();
    ctx.ellipse(ix, iy, Math.abs(ex - ix), Math.abs(ex - ix) * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1c2126";
    ctx.beginPath();
    ctx.ellipse(ix, iy, Math.abs(ex - ix) * 0.45, Math.abs(ex - ix) * 0.47, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(ix - s * 3, iy - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // The lid's shadow on the top of the eye.
    path([...arc(x, y + 0.005, 0.076, 0.035), ...arc(x, y, 0.076, 0.04).reverse()]);
    ctx.fillStyle = "rgba(90,75,70,0.35)";
    ctx.fill();
    ctx.restore();
    // The lid line, heavier toward the outer corner, and the crease above it.
    ctx.lineCap = "round";
    path(upper);
    ctx.strokeStyle = "#5a4e48";
    ctx.lineWidth = 4;
    ctx.stroke();
    path(arc(x, y, 0.076, -0.024));
    ctx.strokeStyle = "rgba(120,100,95,0.45)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    path(arc(x + s * 0.004, y + 0.036, 0.066, 0.028));
    ctx.strokeStyle = "rgba(130,110,100,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // The brow: a soft arc, thicker toward the middle of the face.
    path(arc(s * 0.165, 0.135, 0.085, 0.02, -1, 1));
    ctx.strokeStyle = "rgba(150,130,118,0.85)";
    ctx.lineWidth = 7;
    ctx.stroke();
  }
  // Under the nose a little shade, then the lips: an upper lip with its bow, a fuller lower one, the line between.
  blot(0, -0.19, 0.06, "rgba(120,100,90,A)", 0.18);
  path([...arc(0, -0.272, 0.075, 0.012, -1, -0.25, 8), [0, -0.268], ...arc(0, -0.272, 0.075, 0.012, 0.25, 1, 8), ...arc(0, -0.284, 0.075, -0.004).reverse()]);
  ctx.fillStyle = "#cf9f95";
  ctx.fill();
  path([...arc(0, -0.286, 0.07, 0.0), ...arc(0, -0.288, 0.065, -0.03).reverse()]);
  ctx.fillStyle = "#dcafa4";
  ctx.fill();
  path(arc(0, -0.285, 0.076, 0.004));
  ctx.strokeStyle = "#8e6058";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  blot(0, -0.36, 0.05, "rgba(120,100,90,A)", 0.12);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** An arm of two bones that follows its hand, with the elbow turned toward `pole`. */
export class Arm {
  private upper: T.Mesh;
  private fore: T.Mesh;
  private elbow: T.Mesh;
  readonly hand: T.Mesh;
  readonly wrist = new T.Vector3();
  constructor(
    parent: T.Object3D,
    readonly shoulder: T.Vector3,
    private pole: T.Vector3,
    hand: T.BufferGeometry,
    own: Own,
    white: T.Material,
    joint: T.Material,
  ) {
    const mesh = (g: T.BufferGeometry, m: T.Material) => {
      const it = new T.Mesh(own(g), m);
      parent.add(it);
      return it;
    };
    mesh(new T.SphereGeometry(0.25, 18, 12), joint).position.copy(shoulder);
    this.upper = mesh(limb(UPPER, 0.21, 0.165), white);
    this.elbow = mesh(new T.SphereGeometry(0.17, 16, 10), joint);
    this.fore = mesh(limb(FORE, 0.155, 0.11), white);
    this.hand = mesh(hand, white);
  }
  /**
   * Puts the wrist at `target` (or as near as the arm reaches), the hand pointing along `point` (null: on along the
   * forearm; `follow` mixes the two) with its palm toward `palm`.
   */
  reach(target: T.Vector3, palm: T.Vector3, point: T.Vector3 | null = null, follow = 0) {
    const s = this.shoulder,
      reach = target.clone().sub(s),
      d = Math.min(Math.max(reach.length(), 0.2), UPPER + FORE - 0.02),
      along = reach.normalize(),
      a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d),
      out = this.pole.clone().addScaledVector(along, -this.pole.dot(along)).normalize(),
      elbow = s.clone().addScaledVector(along, a).addScaledVector(out, Math.sqrt(Math.max(0, UPPER * UPPER - a * a)));
    this.wrist.copy(s).addScaledVector(along, d);
    const lay = (mesh: T.Mesh, from: T.Vector3, to: T.Vector3) => {
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(UP, from.clone().sub(to).normalize());
    };
    // The limbs are wider at the top (+y): they are laid from the far joint toward the near one.
    lay(this.upper, s, elbow);
    lay(this.fore, elbow, this.wrist);
    this.elbow.position.copy(elbow);
    const forearm = this.wrist.clone().sub(elbow).normalize(),
      y = point ? point.clone().normalize().lerp(forearm, follow).normalize() : forearm,
      z = palm.clone().addScaledVector(y, -palm.dot(y)).normalize(),
      x = new T.Vector3().crossVectors(y, z);
    this.hand.position.copy(this.wrist);
    this.hand.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
  }
}
/** The figure: its body, its head with a face, and two arms. Its origin is on the floor under its middle. */
export class Figure {
  readonly group = new T.Group();
  readonly cardArm: Arm;
  readonly freeArm: Arm;
  readonly head = new T.Group();
  private chest: T.Mesh;
  constructor(own: Own, standard: (o: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial) {
    const white = standard({ color: "#f3f1ec", roughness: 0.42 }),
      joint = standard({ color: "#dedbd2", roughness: 0.5 }),
      g = this.group,
      add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = g) => {
        const mesh = new T.Mesh(own(geometry), material);
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      };
    // The hips, below the table's edge, a ball for the waist, and the chest: broad at the shoulders, narrow at the waist.
    add(turned([[0, 1.8], [0.55, 1.86], [0.66, 2.15], [0.62, 2.42], [0.42, 2.6], [0, 2.64]]), white, 0, 0, 0).scale.set(1, 1, 0.66);
    add(new T.SphereGeometry(0.5, 24, 16), joint, 0, 2.78, 0).scale.set(1.08, 0.72, 0.66);
    this.chest = add(
      turned([[0, 2.86], [0.5, 2.88], [0.56, 3.1], [0.62, 3.45], [0.78, 3.85], [0.9, 4.2], [0.93, 4.42], [0.86, 4.6], [0.6, 4.74], [0.3, 4.84], [0, 4.86]], 48),
      white,
      0,
      0,
      0,
    );
    this.chest.scale.set(1, 1, 0.6);
    add(new T.CylinderGeometry(0.19, 0.24, 0.5, 18), white, 0, 5.0, 0.01);
    add(new T.SphereGeometry(0.16, 14, 10), joint, 0, 5.22, 0.02);
    // The head: an egg turned on its profile, the chin below, the crown above.
    this.head.position.set(0, 5.74, 0.03);
    g.add(this.head);
    const profile: [number, number][] = [[0, -0.54], [0.16, -0.53], [0.3, -0.44], [0.4, -0.27], [0.47, -0.05], [0.5, 0.15], [0.47, 0.35], [0.37, 0.52], [0.2, 0.63], [0, 0.66]],
      WIDE = 0.86,
      DEEP = 0.98,
      radius = (y: number) => {
        let k = 0;
        while (k < profile.length - 2 && profile[k + 1][1] < y) k++;
        const [r0, y0] = profile[k],
          [r1, y1] = profile[k + 1],
          share = (y - y0) / (y1 - y0);
        return { r: r0 + (r1 - r0) * share, v: (k + share) / (profile.length - 1) };
      },
      /** How far forward the face is at a place on it, so that what is modelled sits on its surface. */
      surface = (x: number, y: number) => {
        const { r } = radius(y);
        return DEEP * r * Math.sqrt(Math.max(0, 1 - (x / (WIDE * r)) ** 2));
      };
    // The head is turned from the back, so that its picture's middle (u = 0.5) is the middle of the face; the face is painted on it.
    add(turned(profile, 48, Math.PI), standard({ map: own(paintFace(radius, WIDE)), roughness: 0.42 }), 0, 0, 0, this.head).scale.set(WIDE, 1, DEEP);
    const feature = (geometry: T.BufferGeometry, x: number, y: number, out: number) => add(geometry, white, x, y, surface(x, y) + out, this.head);
    // A nose, a chin and ears are modelled; eyes, brows and lips are painted.
    feature(new T.SphereGeometry(0.07, 16, 12), 0, -0.07, -0.022).scale.set(0.46, 1.55, 0.58);
    feature(new T.SphereGeometry(0.042, 14, 10), 0, -0.146, 0.0);
    for (const s of [-1, 1]) {
      feature(new T.SphereGeometry(0.024, 10, 8), s * 0.038, -0.158, -0.016);
      feature(new T.SphereGeometry(0.11, 12, 8), s * 0.41, -0.02, 0).scale.set(0.3, 1, 0.6);
    }
    // Its right arm (on my left) takes the card; its left rests on the table and handles the coins.
    this.cardArm = new Arm(g, new T.Vector3(-1.15, 4.55, 0), new T.Vector3(-0.8, -0.55, -0.25), own(handGeometry(1, 0.42, 0.8)), own, white, joint);
    this.freeArm = new Arm(g, new T.Vector3(1.15, 4.55, 0), new T.Vector3(0.75, -0.3, -0.45), own(handGeometry(-1, 0.3, 0.2)), own, white, joint);
    // Neither the figure nor its card casts a shadow (the user asked).
    g.traverse((o) => (o.castShadow = false));
  }
  /** Breathing and a slow turn of the head, for a figure that is alive (`t` in seconds). */
  idle(t: number) {
    this.chest.scale.y = 1 + Math.sin(t * 1.6) * 0.003;
    this.head.rotation.set(Math.sin(t * 0.37) * 0.035, Math.sin(t * 0.23) * 0.07, Math.sin(t * 0.29 + 1) * 0.03);
  }
}
