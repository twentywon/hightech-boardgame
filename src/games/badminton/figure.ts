import * as T from "three";
import { block, glossy } from "../../engine/scene-utils";
import { compactGroup } from "./merge";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The racket's length from the end of its grip to the top of its head, and its head's half sizes. */
export const RACKET = 0.67,
  HEAD_W = 0.115,
  HEAD_H = 0.14;
/** A canvas texture in sRGB, its canvas and pen. */
function paper(own: Own, width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!,
    t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return { c, ctx, t };
}
/** A colour made lighter (`by` > 0) or darker (< 0). */
function shade(hex: string, by: number) {
  const n = parseInt(hex.slice(1), 16),
    f = (v: number) => Math.round(Math.max(0, Math.min(255, by >= 0 ? v + (255 - v) * by : v * (1 + by))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/**
 * The strings: a fine white grid, each string a little shaded where it crosses, and the maker's mark stencilled
 * across them in the frame's colour, on nothing.
 */
function stringsPicture(own: Own, mark: string) {
  const { ctx, t } = paper(own, 256, 256);
  ctx.strokeStyle = "rgba(252,252,244,0.92)";
  ctx.lineWidth = 1.3;
  for (let k = 2; k <= 256; k += 8) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k, 256);
    ctx.moveTo(0, k);
    ctx.lineTo(256, k);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(120,120,110,0.5)";
  for (let x = 2; x <= 256; x += 8) for (let y = 2; y <= 256; y += 8) ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
  // The stencil: a bold letter across the middle strings.
  ctx.font = '900 150px "Inter", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = mark;
  ctx.fillText("W", 128, 136);
  ctx.globalCompositeOperation = "source-over";
  return t;
}
/** The grip's towelling wrap wound round in a spiral, with the darker edge of each turn. */
function gripPicture(own: Own, colour: string) {
  const { ctx, t } = paper(own, 64, 256);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 64, 256);
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 3;
  for (let y = -64; y < 320; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y + 16);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let k = 0; k < 400; k++) ctx.fillRect(Math.random() * 64, Math.random() * 256, 1, 1);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A racket along +y from its grip's end at the origin, its face toward +z: butt cap, wrapped grip, thin shaft, the throat's T, an oval frame painted in two colours, and strings. */
function racket(own: Own, frameColour: string) {
  const g = new T.Group(),
    frame = own(glossy({ color: frameColour, roughness: 0.28, metalness: 0.35 }, 0.8)),
    frameDark = own(glossy({ color: "#16181c", roughness: 0.3, metalness: 0.5 }, 0.8)),
    grip = own(new T.MeshStandardMaterial({ map: gripPicture(own, "#f2f2ee"), roughness: 0.9 })),
    butt = own(new T.MeshStandardMaterial({ color: frameColour, roughness: 0.4 })),
    shaft = own(new T.MeshStandardMaterial({ color: "#2a2c30", roughness: 0.25, metalness: 0.8 })),
    net = own(new T.MeshBasicMaterial({ map: stringsPicture(own, frameColour), transparent: true, side: T.DoubleSide, depthWrite: false })),
    part = (geometry: T.BufferGeometry, material: T.Material, y: number) => {
      const m = new T.Mesh(own(geometry), material);
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
      return m;
    };
  part(new T.CylinderGeometry(0.017, 0.016, 0.012, 12), butt, 0.006);
  part(new T.CylinderGeometry(0.015, 0.0135, 0.2, 12), grip, 0.11);
  part(new T.CylinderGeometry(0.0085, 0.015, 0.03, 10), butt, 0.225);
  part(new T.CylinderGeometry(0.0045, 0.0045, 0.24, 8), shaft, 0.36);
  part(new T.CylinderGeometry(0.009, 0.0055, 0.045, 8), frameDark, 0.49);
  // The frame: the head's oval, its upper part in the racket's colour and the lower in black, as rackets are painted.
  const ring = part(new T.TorusGeometry(1, 0.06, 8, 48).scale(HEAD_W, HEAD_H, 0.07), frame, RACKET - HEAD_H);
  ring.scale.set(1, 1, 1);
  part(new T.TorusGeometry(1, 0.063, 8, 20, Math.PI * 0.55).rotateZ(Math.PI * 1.225).scale(HEAD_W, HEAD_H, 0.074), frameDark, RACKET - HEAD_H);
  part(new T.CircleGeometry(1, 40).scale(HEAD_W * 0.95, HEAD_H * 0.95, 1), net, RACKET - HEAD_H).castShadow = false;
  return g;
}
export interface Figure {
  root: T.Group;
  /** The racket arm (shoulder down, with the racket): all that is drawn of my own player in the first person. */
  arm: T.Group;
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
 * The shirt's print, wrapped round the body (its middle, u = 0.5, is the back): the side's colour shaded, a pattern
 * of lighter slants printed into it, white panels down the sides, a small mark on the chest and the number big on the
 * back.
 */
function shirtPicture(own: Own, colour: string, number: string) {
  const W = 512,
    H = 256,
    { ctx, t } = paper(own, W, H),
    g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(colour, -0.25));
  g.addColorStop(0.45, colour);
  g.addColorStop(1, shade(colour, 0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  for (let x = -H; x < W; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 10, H);
    ctx.lineTo(x + 10 + H * 0.6, 0);
    ctx.lineTo(x + H * 0.6, 0);
    ctx.fill();
  }
  // The white side panels (a quarter of the way round each side).
  ctx.fillStyle = "#f4f4f0";
  for (const u of [0.25, 0.75]) ctx.fillRect(u * W - 12, 40, 24, H - 40);
  ctx.fillStyle = shade(colour, -0.35);
  for (const u of [0.25, 0.75]) ctx.fillRect(u * W - 3, 40, 6, H - 40);
  // The number on the back, outlined.
  ctx.font = '900 120px "Inter", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = shade(colour, -0.45);
  ctx.strokeText(number, W / 2, H * 0.56);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(number, W / 2, H * 0.56);
  // A small mark on the chest (front left: just past the seam at u = 0).
  ctx.font = '900 26px "Inter", Arial, sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText("W", W * 0.94, H * 0.33);
  return t;
}
/** The shorts: dark, a stripe of the side's colour down each side. */
function shortsPicture(own: Own, colour: string) {
  const { ctx, t } = paper(own, 256, 64);
  ctx.fillStyle = "#1b1f28";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = colour;
  for (const u of [0.25, 0.75]) ctx.fillRect(u * 256 - 8, 0, 16, 64);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let k = 0; k < 300; k++) ctx.fillRect(Math.random() * 256, Math.random() * 64, 2, 1);
  return t;
}
/**
 * A player made in code: shoes with coloured soles and laces, socks, legs, printed shorts and shirt (its number on the
 * back), arms with a wristband, a head with a face (eyes, brows, nose, mouth), hair and a headband, the racket in its
 * right hand. Its root stands on the floor; `body` faces +z (turned to the net by the view).
 */
export function figure(own: Own, shirt: string, hair: string, frameColour: string, number = "7"): Figure {
  const root = new T.Group(),
    body = new T.Group(),
    skin = own(new T.MeshStandardMaterial({ color: "#e6b48e", roughness: 0.6 })),
    shirtPaint = own(new T.MeshStandardMaterial({ map: shirtPicture(own, shirt, number), roughness: 0.65 })),
    sleeve = own(new T.MeshStandardMaterial({ color: shirt, roughness: 0.65 })),
    trim = own(new T.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.7 })),
    band = own(new T.MeshStandardMaterial({ color: shirt, roughness: 0.8 })),
    shortsMap = shortsPicture(own, shirt),
    shorts = own(new T.MeshStandardMaterial({ map: shortsMap, roughness: 0.72 })),
    shoe = own(new T.MeshStandardMaterial({ color: "#f4f4f4", roughness: 0.45 })),
    sole = own(new T.MeshStandardMaterial({ color: shirt, roughness: 0.55 })),
    gum = own(new T.MeshStandardMaterial({ color: "#c9a074", roughness: 0.7 })),
    hairPaint = own(new T.MeshStandardMaterial({ color: hair, roughness: 0.8 })),
    eyeWhite = own(new T.MeshStandardMaterial({ color: "#f8f6f0", roughness: 0.3 })),
    pupil = own(new T.MeshStandardMaterial({ color: "#1a1410", roughness: 0.2 })),
    lips = own(new T.MeshStandardMaterial({ color: "#b86a5a", roughness: 0.5 })),
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
  // Legs from the hips: thigh in the shorts, the leg, a knee, a sock and a shoe with its sole, laces and stripe.
  const legs = [-1, 1].map((sx) => {
    const leg = new T.Group();
    leg.position.set(sx * 0.1, 0, 0);
    hips.add(leg);
    put(leg, new T.CapsuleGeometry(0.07, 0.34, 4, 14), shorts, 0, -0.16, 0).scale.set(1.12, 1, 1.12);
    put(leg, new T.CapsuleGeometry(0.052, 0.5, 4, 12), skin, 0, -0.5, 0);
    put(leg, new T.SphereGeometry(0.05, 10, 8), skin, 0, -0.4, 0.02).scale.set(1, 0.8, 0.9);
    put(leg, new T.CylinderGeometry(0.051, 0.049, 0.12, 12), trim, 0, -0.77, 0);
    put(leg, new T.CylinderGeometry(0.052, 0.052, 0.018, 12), band, 0, -0.715, 0);
    put(leg, block(0.1, 0.075, 0.26, 0.032), shoe, 0, -0.872, 0.05);
    put(leg, block(0.108, 0.024, 0.272, 0.01), sole, 0, -0.904, 0.05);
    put(leg, block(0.11, 0.008, 0.26, 0.004), gum, 0, -0.917, 0.05);
    put(leg, block(0.104, 0.022, 0.12, 0.008), sole, 0, -0.865, 0.02).scale.set(1.01, 1, 1);
    for (let k = 0; k < 3; k++) put(leg, new T.BoxGeometry(0.05, 0.006, 0.008), trim, 0, -0.833 + k * 0.004, 0.09 + k * 0.025);
    return leg;
  }) as [T.Group, T.Group];
  put(hips, new T.CylinderGeometry(0.175, 0.165, 0.2, 20), shorts, 0, 0, 0);
  put(hips, new T.CylinderGeometry(0.172, 0.172, 0.035, 20), sleeve, 0, 0.1, 0);
  // The torso in its printed shirt with a collar, the neck and head.
  const torso = new T.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  put(torso, new T.CapsuleGeometry(0.16, 0.34, 8, 24), shirtPaint, 0, 0.3, 0).scale.set(1.08, 1, 0.72);
  put(torso, new T.TorusGeometry(0.062, 0.017, 8, 20).rotateX(Math.PI / 2), trim, 0, 0.6, 0.01);
  put(torso, new T.CylinderGeometry(0.045, 0.05, 0.09, 12), skin, 0, 0.65, 0);
  const head = new T.Group();
  head.position.y = 0.8;
  torso.add(head);
  put(head, new T.SphereGeometry(0.105, 24, 18), skin, 0, 0, 0).scale.set(0.92, 1.05, 0.98);
  // The face: eyes with their pupils, brows, a nose, the mouth, the ears.
  for (const sx of [-1, 1]) {
    put(head, new T.SphereGeometry(0.016, 10, 8), eyeWhite, sx * 0.036, 0.012, 0.088).scale.set(1.1, 0.8, 0.6);
    put(head, new T.SphereGeometry(0.0085, 8, 6), pupil, sx * 0.036, 0.012, 0.097);
    put(head, new T.BoxGeometry(0.034, 0.007, 0.01), hairPaint, sx * 0.037, 0.038, 0.093).rotation.z = sx * -0.12;
    put(head, new T.SphereGeometry(0.02, 8, 6), skin, sx * 0.1, -0.005, 0).scale.set(0.6, 1, 0.9);
  }
  put(head, new T.SphereGeometry(0.014, 8, 6), skin, 0, -0.012, 0.102).scale.set(0.9, 1.2, 1);
  put(head, new T.CapsuleGeometry(0.006, 0.024, 2, 6).rotateZ(Math.PI / 2), lips, 0, -0.048, 0.092);
  // Hair: a cap over the crown with a few tufts for its fullness, and the headband in the side's colour.
  put(head, new T.SphereGeometry(0.112, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairPaint, 0, 0.012, -0.012).scale.set(0.97, 1.04, 1.05);
  for (const [x, y, z, r] of [[0.03, 0.09, 0.04, 0.04], [-0.04, 0.085, 0.03, 0.038], [0, 0.095, -0.03, 0.045], [0.06, 0.06, -0.04, 0.036], [-0.06, 0.06, -0.05, 0.036], [0, 0.04, -0.09, 0.05]] as const)
    put(head, new T.SphereGeometry(r, 10, 8), hairPaint, x, y, z);
  // The headband high on the forehead, clear of the eyes.
  put(head, new T.TorusGeometry(0.098, 0.013, 8, 26).rotateX(Math.PI / 2), band, 0, 0.07, -0.006);
  // The arms hang from the shoulders (along -y): upper arm with its sleeve, forearm, hand; the racket in the right hand.
  // arms[1] is the right arm (at -x while the body faces +z), the racket's.
  const arms = [1, -1].map((sx) => {
    const arm = new T.Group();
    arm.position.set(sx * 0.215, 0.52, 0);
    torso.add(arm);
    put(arm, new T.CapsuleGeometry(0.06, 0.1, 4, 12), sleeve, 0, -0.06, 0);
    put(arm, new T.TorusGeometry(0.058, 0.01, 6, 14).rotateX(Math.PI / 2), trim, 0, -0.12, 0);
    put(arm, new T.CapsuleGeometry(0.045, 0.24, 4, 12), skin, 0, -0.17, 0);
    return arm;
  }) as [T.Group, T.Group];
  const elbows = arms.map((arm, k) => {
    const elbow = new T.Group();
    elbow.position.y = -0.3;
    arm.add(elbow);
    put(elbow, new T.CapsuleGeometry(0.04, 0.22, 4, 12), skin, 0, -0.13, 0);
    put(elbow, new T.SphereGeometry(0.045, 12, 10), skin, 0, -0.28, 0.01).scale.set(0.9, 1, 1.15);
    // A wristband on the racket hand's wrist.
    if (k === 1) put(elbow, new T.CylinderGeometry(0.047, 0.047, 0.05, 14), band, 0, -0.23, 0);
    return elbow;
  });
  const held = racket(own, frameColour);
  // Gripped in the right hand, pointing on along the forearm.
  held.position.set(0, -0.26, 0.02);
  held.rotation.x = Math.PI;
  held.rotation.y = Math.PI;
  elbows[1].add(held);
  // Each moving part's pieces that share a paint are drawn as one (fewer draws; the parts still move as before).
  for (const part of [...legs, hips, torso, head, ...arms, ...elbows, held]) compactGroup(part, own);
  return { root, arm: arms[1], body, hips, legs, torso, arms, elbow: elbows[1], racket: held, stride: 0 };
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
  f.arms[0].rotation.z = 0.15;
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
    a = -0.9;
    bend = -1.9;
    turn = 0.4;
  }
  arm.rotation.set(a, 0, turn);
  f.elbow.rotation.x = bend;
}

const DOWN = new T.Vector3(0, -1, 0),
  FORWARD = new T.Vector3(0, 0, 1),
  SIDE = new T.Vector3(1, 0, 0);
/** Where the racket arm's shoulder is in the body's own frame (it faces +z; the right arm is at -x). */
export const SHOULDER = new T.Vector3(-0.215, 1.5, 0);
/** The racket held ready: up in front and a little out to the right. */
const READY = new T.Vector3(-0.3, 0.78, 0.55).normalize();
const aimed = new T.Quaternion(),
  turn = new T.Quaternion(),
  swingTurn = new T.Quaternion(),
  n0 = new T.Vector3(),
  n1 = new T.Vector3(),
  axis = new T.Vector3(),
  way = new T.Vector3();
/**
 * Points the racket arm (and the racket along it) the way `toward` (a direction in the body's frame from the shoulder),
 * its face turned to the front, and swings it through that way (the user asked that the racket turn with where the
 * shuttle is, and strike up from below a low one): `swing` from 0 (wound up) through about 0.45 (the racket on the
 * shuttle) to 1 (followed through), over the top and down for a high shuttle, from below and up for a low one.
 */
export function aimArm(f: Figure, toward: T.Vector3 | null, swing: number | null, high: boolean) {
  way.copy(toward ?? READY).normalize();
  aimed.setFromUnitVectors(DOWN, way);
  // The racket's face toward the front, turning it about its own length.
  n0.copy(FORWARD).applyQuaternion(aimed);
  n1.copy(FORWARD).addScaledVector(way, -FORWARD.dot(way));
  if (n1.lengthSq() > 1e-4) {
    n1.normalize();
    const twist = Math.atan2(axis.crossVectors(n0, n1).dot(way), n0.dot(n1));
    turn.setFromAxisAngle(way, twist);
    aimed.premultiply(turn);
  }
  if (swing !== null) {
    // About the shoulders' line: over the top it comes from behind and goes down in front; from below, the other way.
    const p = Math.max(0, Math.min(1, swing)),
      delta = high ? -0.9 + p * 2.1 : 0.9 - p * 2.1;
    swingTurn.setFromAxisAngle(SIDE, delta);
    aimed.premultiply(swingTurn);
  }
  f.arm.quaternion.copy(aimed);
  f.elbow.rotation.set(-0.12, 0, 0);
}
