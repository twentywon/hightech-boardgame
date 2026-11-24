import * as T from "three";
import { block } from "../../engine/scene-utils";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The racket's length from the end of its grip to the top of its head, and its head's half sizes. */
export const RACKET = 0.67,
  HEAD_W = 0.115,
  HEAD_H = 0.14;
/** The strings: a fine white grid on nothing. */
function stringsPicture(own: Own) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(250,250,240,0.9)";
  ctx.lineWidth = 1.2;
  for (let k = 0; k <= 128; k += 7) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 128);
    ctx.moveTo(0, k);
    ctx.lineTo(128, k);
    ctx.stroke();
  }
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A racket along +y from its grip's end at the origin, its face toward +z: grip, thin shaft, oval frame and strings. */
function racket(own: Own, frameColour: string) {
  const g = new T.Group(),
    frame = own(new T.MeshStandardMaterial({ color: frameColour, roughness: 0.35, metalness: 0.4 })),
    grip = own(new T.MeshStandardMaterial({ color: "#f2f2ee", roughness: 0.85 })),
    shaft = own(new T.MeshStandardMaterial({ color: "#2a2c30", roughness: 0.3, metalness: 0.7 })),
    net = own(new T.MeshBasicMaterial({ map: stringsPicture(own), transparent: true, side: T.DoubleSide, depthWrite: false })),
    part = (geometry: T.BufferGeometry, material: T.Material, y: number) => {
      const m = new T.Mesh(own(geometry), material);
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
      return m;
    };
  part(new T.CylinderGeometry(0.014, 0.013, 0.2, 10), grip, 0.1);
  part(new T.CylinderGeometry(0.0045, 0.0045, 0.26, 8), shaft, 0.33);
  part(new T.CylinderGeometry(0.008, 0.005, 0.04, 8), frame, 0.47);
  const ring = part(new T.TorusGeometry(1, 0.06, 6, 36).scale(HEAD_W, HEAD_H, 0.07), frame, RACKET - HEAD_H);
  ring.scale.set(1, 1, 1);
  part(new T.CircleGeometry(1, 32).scale(HEAD_W * 0.95, HEAD_H * 0.95, 1), net, RACKET - HEAD_H).castShadow = false;
  return g;
}
export interface Figure {
  root: T.Group;
  /** Turned to face the net. */
  body: T.Group;
  hips: T.Group;
  legs: [T.Group, T.Group];
  torso: T.Group;
  arms: [T.Group, T.Group];
  elbow: T.Group;
  racket: T.Group;
  /** The running stride's phase. */
  stride: number;
}
/**
 * A player made in code: shoes, legs, shorts, a shirt of its side's colour, arms, a head with hair and a headband,
 * the racket in its right hand. Its root stands on the floor; `body` faces +z (turned to the net by the view).
 */
export function figure(own: Own, shirt: string, hair: string, frameColour: string): Figure {
  const root = new T.Group(),
    body = new T.Group(),
    skin = own(new T.MeshStandardMaterial({ color: "#e6b48e", roughness: 0.65 })),
    shirtPaint = own(new T.MeshStandardMaterial({ color: shirt, roughness: 0.7 })),
    trim = own(new T.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.7 })),
    shorts = own(new T.MeshStandardMaterial({ color: "#1d212a", roughness: 0.75 })),
    shoe = own(new T.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.5 })),
    sole = own(new T.MeshStandardMaterial({ color: "#c8452a", roughness: 0.6 })),
    hairPaint = own(new T.MeshStandardMaterial({ color: hair, roughness: 0.85 })),
    put = (parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
      const m = new T.Mesh(own(geometry), material);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
  root.add(body);
  const hips = new T.Group();
  hips.position.y = 0.92;
  body.add(hips);
  // Legs from the hips: thigh and shin in one, a knee, a sock and a shoe.
  const legs = [-1, 1].map((sx) => {
    const leg = new T.Group();
    leg.position.set(sx * 0.1, 0, 0);
    hips.add(leg);
    put(leg, new T.CapsuleGeometry(0.068, 0.36, 4, 10), shorts, 0, -0.16, 0).scale.set(1.1, 1, 1.1);
    put(leg, new T.CapsuleGeometry(0.052, 0.5, 4, 10), skin, 0, -0.5, 0);
    put(leg, new T.CylinderGeometry(0.05, 0.05, 0.1, 10), trim, 0, -0.78, 0);
    put(leg, block(0.1, 0.07, 0.25, 0.03), shoe, 0, -0.875, 0.05);
    put(leg, block(0.105, 0.02, 0.26, 0.008), sole, 0, -0.905, 0.05);
    return leg;
  }) as [T.Group, T.Group];
  put(hips, new T.CylinderGeometry(0.17, 0.16, 0.2, 16), shorts, 0, 0, 0);
  // The torso, the shirt with its collar and side stripes, the neck and head.
  const torso = new T.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  put(torso, new T.CapsuleGeometry(0.16, 0.34, 6, 16), shirtPaint, 0, 0.3, 0).scale.set(1.08, 1, 0.72);
  put(torso, new T.TorusGeometry(0.06, 0.016, 6, 16).rotateX(Math.PI / 2), trim, 0, 0.6, 0.01);
  for (const sx of [-1, 1]) put(torso, new T.BoxGeometry(0.012, 0.36, 0.2), trim, sx * 0.172, 0.3, 0);
  put(torso, new T.CylinderGeometry(0.045, 0.05, 0.09, 10), skin, 0, 0.65, 0);
  const head = new T.Group();
  head.position.y = 0.8;
  torso.add(head);
  put(head, new T.SphereGeometry(0.105, 20, 16), skin, 0, 0, 0).scale.set(0.92, 1.05, 0.98);
  put(head, new T.SphereGeometry(0.11, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairPaint, 0, 0.012, -0.012).scale.set(0.96, 1.02, 1.04);
  put(head, new T.TorusGeometry(0.1, 0.014, 6, 22).rotateX(Math.PI / 2), trim, 0, 0.035, -0.004);
  for (const sx of [-1, 1]) put(head, new T.SphereGeometry(0.02, 8, 6), skin, sx * 0.1, -0.005, 0);
  // The arms hang from the shoulders (along -y): upper arm with its sleeve, forearm, hand; the racket in the right hand.
  const arms = [-1, 1].map((sx) => {
    const arm = new T.Group();
    arm.position.set(sx * 0.215, 0.52, 0);
    torso.add(arm);
    put(arm, new T.CapsuleGeometry(0.058, 0.1, 4, 10), shirtPaint, 0, -0.06, 0);
    put(arm, new T.CapsuleGeometry(0.045, 0.24, 4, 10), skin, 0, -0.17, 0);
    return arm;
  }) as [T.Group, T.Group];
  const elbows = arms.map((arm) => {
    const elbow = new T.Group();
    elbow.position.y = -0.3;
    arm.add(elbow);
    put(elbow, new T.CapsuleGeometry(0.04, 0.22, 4, 10), skin, 0, -0.13, 0);
    put(elbow, new T.SphereGeometry(0.045, 10, 8), skin, 0, -0.28, 0.01);
    return elbow;
  });
  const held = racket(own, frameColour);
  // Gripped in the right hand, pointing on along the forearm.
  held.position.set(0, -0.26, 0.02);
  held.rotation.x = Math.PI;
  held.rotation.z = Math.PI;
  elbows[1].add(held);
  return { root, body, hips, legs, torso, arms, elbow: elbows[1], racket: held, stride: 0 };
}

/**
 * Poses a figure: its stride from its running speed, a crouch while waiting, a jump's tuck, and the racket arm by the
 * stroke under way: `swing` from 0 (ready) through 1 (followed through), overhead (`high`) or underarm.
 */
export function pose(f: Figure, o: { speed: number; air: number; swing: number; high: boolean; dt: number; serve: boolean; lean: number }) {
  f.stride += o.speed * o.dt * 4.2;
  const s = Math.sin(f.stride),
    stride = Math.min(1, o.speed / 3.5),
    ready = o.air > 0 ? 0 : 1 - stride;
  f.legs[0].rotation.x = s * 0.75 * stride + (o.air > 0 ? -0.5 : 0) - 0.12 * ready;
  f.legs[1].rotation.x = -s * 0.75 * stride + (o.air > 0 ? 0.25 : 0) - 0.12 * ready;
  f.hips.position.y = 0.92 - 0.06 * ready + Math.abs(Math.cos(f.stride)) * 0.03 * stride;
  f.torso.rotation.x = 0.12 * stride + 0.08 * ready;
  f.torso.rotation.z = o.lean * 0.12;
  // The free arm swings with the stride, or is raised to point at a high shuttle.
  f.arms[0].rotation.x = o.high && o.swing < 0.5 ? -2.2 : -s * 0.6 * stride - 0.25;
  f.arms[0].rotation.z = -0.15;
  // The racket arm: back and up, through the shuttle, and down across (overhead); or low behind, then up in front (underarm).
  const p = Math.max(0, Math.min(1, o.swing)),
    arm = f.arms[1];
  let a: number, bend: number, turn: number;
  if (o.serve) {
    a = -0.6 - p * 1.6;
    bend = -0.3;
    turn = 0.25;
  } else if (o.high) {
    const ease = p < 0.35 ? p / 0.35 : 1 + (p - 0.35) / 0.65;
    a = -3.4 + ease * 1.45;
    bend = p < 0.3 ? -1.4 + p * 3 : -0.4 + (p - 0.3) * 0.5;
    turn = 0.3 - p * 0.6;
  } else {
    a = 0.6 - p * 2.6;
    bend = -0.4 - p * 0.5;
    turn = 0.4 - p * 0.5;
  }
  if (p === 0 && !o.serve) {
    // Ready: the racket held up in front, its head high.
    a = -1.25;
    bend = -1.1;
    turn = 0.35;
  }
  arm.rotation.set(a, 0, -turn);
  f.elbow.rotation.x = bend;
}
