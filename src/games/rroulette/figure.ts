import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DETAIL, made, skin as skinRelief } from "../../engine/lifelike";

/*
 * 러시안 룰렛's players (the user asked for them as good as can be, not blocky): sculpted heads (a skull narrowing to
 * the jaw, cheekbones, brow, sockets, chin), a nose and ears, eyes with whites, irises and pupils under lids that
 * blink, brows and lips that make faces, hair in four styles with painted strands, a neck, a jacket over a shirt
 * (painted weave, lapels, buttons, a tie or bow), arms in two parts with elbows that bend to reach, hands with fingers
 * (open on the table, closed on the toy's grip), legs under the table and a felt hat. Everything is made in code.
 */

type Own = <R extends { dispose(): void }>(resource: R) => R;

/** A player's look. `style`: 0 a short crop, 1 a bob to the jaw, 2 close curls, 3 a bun. `neck`: 0 tie, 1 open, 2 bow. */
export interface Look {
  skin: string;
  hair: string;
  style: 0 | 1 | 2 | 3;
  eyes: string;
  jacket: string;
  shirt: string;
  hat: string;
  neck: 0 | 1 | 2;
  trousers: string;
}

export interface Arm {
  side: number;
  shoulder: T.Vector3;
  upper: T.Mesh;
  lower: T.Group;
  open: T.Group;
  fist: T.Group;
}
export interface Person {
  head: T.Group;
  /** The skin: the face, ears, neck and hands (its colour goes sooty after a 펑). */
  face: T.MeshStandardMaterial;
  mouth: T.Group;
  gasp: T.Group;
  spikes: T.Group;
  hat: T.Group;
  stars: T.Group;
  arms: Arm[];
  lids: T.Group[];
  brows: T.Mesh[];
  /** How open the lids stand when not blinking (set by `feel`). */
  open: number;
}

/**
 * How finely shapes are cut: in full where a graphics card draws, about half where the processor draws (so that the
 * room draws about as fast as with the old figures there). Set by `buildPerson`.
 */
let FINE = 1;
const q = (n: number, least = 3) => Math.max(least, Math.round(n * FINE));
/** The head's own size (half-widths across, up and front to back) before it is shaped. */
const HEAD = { x: 0.3, y: 0.37, z: 0.335 };
/** The arm's two lengths, shoulder to elbow and elbow to wrist. */
export const UPPER = 0.7,
  LOWER = 0.66;

const smoothstep = (a: number, b: number, v: number) => {
  const u = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
/** A soft bump on the head's surface, around a direction. */
const bump = (d: T.Vector3, x: number, y: number, z: number, size: number, width: number) => {
  const dx = d.x - x,
    dy = d.y - y,
    dz = d.z - z;
  return size * Math.exp(-(dx * dx + dy * dy + dz * dz) / (width * width));
};
/** The head's surface in a direction (the face toward −z): a skull that narrows to the jaw, with its features' rises and hollows. */
function shapeHead(d: T.Vector3, out = new T.Vector3()) {
  const low = smoothstep(0.1, -0.9, d.y),
    back = smoothstep(-0.1, 0.8, d.z);
  const fx = 1 - 0.3 * Math.pow(low, 1.4),
    fz = 1 - 0.38 * low * back - 0.08 * low * (1 - back);
  // The top a little flatter, the crown fuller behind.
  const fy = 1 - 0.06 * smoothstep(0.6, 1, d.y);
  let r = 1;
  for (const s of [-1, 1]) {
    r += bump(d, s * 0.62, -0.14, -0.74, 0.05, 0.3); // cheekbones
    r -= bump(d, s * 0.36, 0.1, -0.92, 0.05, 0.2); // the eyes' sockets
    r += bump(d, s * 0.33, 0.3, -0.9, 0.03, 0.24); // the brow
    r -= bump(d, s * 0.86, 0.32, -0.32, 0.04, 0.35); // temples
    r -= bump(d, s * 0.45, -0.42, -0.78, 0.025, 0.25); // under the cheekbones
  }
  r += bump(d, 0, 0.42, 0.85, 0.07, 0.6); // the back of the skull
  r += bump(d, 0, -0.78, -0.62, 0.06, 0.28); // the chin
  return out.set(d.x * HEAD.x * fx * r, d.y * HEAD.y * fy * r, d.z * HEAD.z * fz * r);
}
/** The point on the face's surface seen straight from the front at (x, y) of the head, `rise` out from it. */
function onFace(x: number, y: number, rise = 0) {
  let dx = x / HEAD.x,
    dy = y / HEAD.y;
  const d = new T.Vector3(),
    p = new T.Vector3();
  for (let k = 0; k < 12; k++) {
    d.set(dx, dy, -Math.sqrt(Math.max(0.02, 1 - dx * dx - dy * dy))).normalize();
    shapeHead(d, p);
    dx = d.x + (x - p.x) / HEAD.x;
    dy = d.y + (y - p.y) / HEAD.y;
  }
  return p.clone().add(d.clone().multiplyScalar(rise));
}

/** Averages the normals where a shape's seam doubles its vertices, so that no crease shows there. */
function smoothSeams(g: T.BufferGeometry) {
  g.computeVertexNormals();
  const pos = g.attributes.position,
    nor = g.attributes.normal,
    sums = new Map<string, T.Vector3>(),
    key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i),
      n = new T.Vector3().fromBufferAttribute(nor, i);
    const s = sums.get(k);
    if (s) s.add(n);
    else sums.set(k, n);
  }
  for (let i = 0; i < pos.count; i++) {
    const n = sums.get(key(i))!.clone().normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
  return g;
}
/** A sphere turned so that its seam is behind and its texture's middle (u ½) is in front, toward −z. */
const frontSphere = (r: number, w: number, h: number) => new T.SphereGeometry(r, w, h).rotateY(Math.PI / 2);
/** A shape's uvs all at one spot of its picture (a plain part of it). */
function plainUV(g: T.BufferGeometry, u: number, v: number) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}

function headGeometry() {
  const g = frontSphere(1, q(72), q(54)),
    pos = g.attributes.position,
    d = new T.Vector3(),
    p = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    shapeHead(d, p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  return smoothSeams(g);
}
function noseGeometry() {
  const g = new T.SphereGeometry(1, q(32), q(24)),
    pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      below = smoothstep(0.1, -1, y),
      front = Math.max(0, -z);
    // A narrow bridge widening to the wings of the nostrils, coming forward to a round tip low down.
    const X = x * (0.024 + 0.022 * below * below),
      Y = y * 0.062,
      Z = z * 0.028 - front * 0.034 * smoothstep(0.9, -0.4, y) * (1 - 0.7 * smoothstep(-0.5, -1, y));
    pos.setXYZ(i, X, Y, Z);
  }
  // The wings at either side of the tip.
  const parts = [g.toNonIndexed()];
  for (const s of [-1, 1]) parts.push(placed(new T.SphereGeometry(1, q(14), q(10)), s * 0.03, -0.042, -0.012, 0, 0, 0, [0.017, 0.014, 0.02]).toNonIndexed());
  g.dispose();
  return smoothSeams(mergeGeometries(parts)!);
}
function earGeometry(side: number) {
  const g = new T.SphereGeometry(1, q(20), q(16)),
    pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    // A shell: thin, the outer face cupped in a little, the lobe below.
    const cup = x * side > 0 ? 1 - 0.55 * Math.exp(-(y * y + z * z) * 2.5) : 1;
    pos.setXYZ(i, x * 0.028 * cup, y * 0.082 * (y < 0 ? 0.85 : 1), z * 0.052 * (1 - 0.25 * Math.max(0, y)));
  }
  g.rotateY(-side * 0.28);
  return smoothSeams(g);
}

/** Paints a picture with a 2D canvas, as a texture. */
function painted(own: Own, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, colour = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!, w, h);
  const t = own(new T.CanvasTexture(c));
  if (colour) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A seeded random, so that each player's paints are its own and the same each time. */
function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
/** Skin: pale tones (the material's colour gives the hue) mottled finely, the cheeks and nose warmer, the sockets a shade deeper. */
function skinPicture(own: Own, seed: number) {
  return painted(own, 512, 256, (ctx, w, h) => {
    const rnd = seeded(seed);
    ctx.fillStyle = "#f4efec";
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 2600; k++) {
      const v = 225 + rnd() * 30;
      ctx.fillStyle = `rgba(${v},${v - 12},${v - 14},${0.08 + rnd() * 0.1})`;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const glow = (u: number, v: number, rx: number, ry: number, colour: string) => {
      const g = ctx.createRadialGradient(u * w, v * h, 0, u * w, v * h, rx * w);
      g.addColorStop(0, colour);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.save();
      ctx.translate(u * w, v * h);
      ctx.scale(1, ry / rx);
      ctx.translate(-u * w, -v * h);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    };
    for (const s of [-1, 1]) {
      glow(0.5 + s * 0.1, 0.56, 0.06, 0.11, "rgba(236,120,120,0.42)"); // cheeks
      glow(0.5 + s * 0.06, 0.46, 0.035, 0.05, "rgba(150,95,90,0.28)"); // the sockets' shade
    }
    glow(0.5, 0.52, 0.025, 0.06, "rgba(230,130,120,0.3)"); // the nose's warmth
    glow(0.5, 0.82, 0.12, 0.14, "rgba(170,120,110,0.18)"); // under the jaw
  });
}
/** An eye: the white (a little pink toward its edge), the iris in rings and flecks, the pupil, all looking forward (u ½). */
function eyePicture(own: Own, iris: string, seed: number) {
  return painted(own, 256, 128, (ctx, w, h) => {
    const rnd = seeded(seed);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.4);
    g.addColorStop(0, "#fbf7f2");
    g.addColorStop(0.6, "#f1e6e0");
    g.addColorStop(1, "#d9b4ad");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const rx = w * 0.072,
      ry = h * 0.145;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(1, ry / rx);
    const ig = ctx.createRadialGradient(0, 0, rx * 0.3, 0, 0, rx);
    const base = new T.Color(iris);
    ig.addColorStop(0, `#${base.clone().offsetHSL(0, 0, 0.12).getHexString()}`);
    ig.addColorStop(0.75, `#${base.getHexString()}`);
    ig.addColorStop(1, `#${base.clone().offsetHSL(0, 0, -0.22).getHexString()}`);
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    // Fibres out from the pupil.
    for (let k = 0; k < 70; k++) {
      const a = rnd() * Math.PI * 2;
      ctx.strokeStyle = rnd() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rx * 0.4, Math.sin(a) * rx * 0.4);
      ctx.lineTo(Math.cos(a) * rx * 0.95, Math.sin(a) * rx * 0.95);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(20,14,10,0.7)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#0b0807";
    ctx.beginPath();
    ctx.arc(0, 0, rx * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
/** Hair: strands along its fall (v), light and dark, or close curls. */
function hairPicture(own: Own, colour: string, curly: boolean, seed: number) {
  return painted(own, 512, 512, (ctx, w, h) => {
    const rnd = seeded(seed),
      base = new T.Color(colour);
    ctx.fillStyle = `#${base.getHexString()}`;
    ctx.fillRect(0, 0, w, h);
    const shade = (l: number, a: number) => `rgba(${Math.round(Math.min(1, base.r + l) * 255)},${Math.round(Math.min(1, base.g + l) * 255)},${Math.round(Math.min(1, base.b + l) * 255)},${a})`;
    if (curly)
      for (let k = 0; k < 2200; k++) {
        const x = rnd() * w,
          y = rnd() * h,
          r = 3 + rnd() * 6;
        ctx.strokeStyle = rnd() < 0.5 ? shade(0.18, 0.5) : "rgba(0,0,0,0.45)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, r, rnd() * 6, rnd() * 6 + 4);
        ctx.stroke();
      }
    else
      for (let k = 0; k < 1600; k++) {
        const x = rnd() * w,
          y = rnd() * h,
          len = 60 + rnd() * 180,
          bend = (rnd() - 0.5) * 18;
        ctx.strokeStyle = rnd() < 0.55 ? shade(0.12 + rnd() * 0.18, 0.35) : `rgba(0,0,0,${0.2 + rnd() * 0.25})`;
        ctx.lineWidth = 0.8 + rnd() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + bend, y + len / 2, x + bend * 0.3, y + len);
        ctx.stroke();
      }
  });
}
/**
 * A jacket over a shirt, laid on the torso's lathe (u ½ in front, v up): a fine weave, soft folds, the shirt in a V
 * at the neck with its collar points, the lapels' edges and stitching, buttons and a pocket; a tie, an open collar or
 * a bow.
 */
function jacketPicture(own: Own, look: Look, seed: number) {
  return painted(own, 1024, 512, (ctx, w, h) => {
    const rnd = seeded(seed),
      cloth = new T.Color(look.jacket),
      hex = (c: T.Color) => `#${c.getHexString()}`;
    ctx.fillStyle = hex(cloth);
    ctx.fillRect(0, 0, w, h);
    // The weave.
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = x % 4 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
      ctx.fillRect(x, 0, 1, h);
    }
    for (let k = 0; k < 3000; k++) {
      ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    // Soft folds: long shades down the body, deeper by the sides and at the waist.
    for (let k = 0; k < 26; k++) {
      const x = rnd() * w,
        g = ctx.createLinearGradient(x - 30, 0, x + 30, 0);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, rnd() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 30, h * 0.15 + rnd() * h * 0.2, 60, h * 0.6);
    }
    const mid = w / 2,
      neckY = 0,
      vY = h * 0.48;
    // The shirt's V and its collar.
    ctx.fillStyle = look.shirt;
    ctx.beginPath();
    ctx.moveTo(mid - w * 0.085, neckY);
    ctx.lineTo(mid + w * 0.085, neckY);
    ctx.lineTo(mid, vY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(mid + s * w * 0.06, neckY);
      ctx.lineTo(mid + s * w * 0.012, h * 0.11);
      ctx.lineTo(mid + s * w * 0.05, h * 0.06);
      ctx.stroke();
    }
    if (look.neck === 0) {
      // A tie, knotted under the collar.
      ctx.fillStyle = "#5b1e22";
      ctx.beginPath();
      ctx.moveTo(mid - 9, h * 0.06);
      ctx.lineTo(mid + 9, h * 0.06);
      ctx.lineTo(mid + 6, h * 0.1);
      ctx.lineTo(mid + 14, h * 0.4);
      ctx.lineTo(mid, h * 0.47);
      ctx.lineTo(mid - 14, h * 0.4);
      ctx.lineTo(mid - 6, h * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,220,180,0.25)";
      ctx.lineWidth = 2;
      for (let y = h * 0.14; y < h * 0.42; y += 16) {
        ctx.beginPath();
        ctx.moveTo(mid - 12, y);
        ctx.lineTo(mid + 12, y + 10);
        ctx.stroke();
      }
    } else if (look.neck === 2) {
      ctx.fillStyle = "#1d1a22";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(mid, h * 0.085);
        ctx.lineTo(mid + s * 26, h * 0.05);
        ctx.lineTo(mid + s * 26, h * 0.125);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillRect(mid - 6, h * 0.07, 12, h * 0.035);
    } else {
      // An open collar: the throat's shade in the V.
      ctx.fillStyle = "rgba(120,80,70,0.25)";
      ctx.beginPath();
      ctx.moveTo(mid - w * 0.03, neckY);
      ctx.lineTo(mid + w * 0.03, neckY);
      ctx.lineTo(mid, h * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    // The lapels: a darker edge and a line of stitching beside it.
    for (const s of [-1, 1]) {
      ctx.strokeStyle = `#${cloth.clone().offsetHSL(0, 0, -0.16).getHexString()}`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(mid + s * w * 0.085, neckY);
      ctx.lineTo(mid, vY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(mid + s * (w * 0.085 + 14), neckY);
      ctx.lineTo(mid + s * 12, vY + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      // The notch of the lapel.
      ctx.strokeStyle = `#${cloth.clone().offsetHSL(0, 0, -0.14).getHexString()}`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(mid + s * w * 0.075, h * 0.16);
      ctx.lineTo(mid + s * w * 0.105, h * 0.13);
      ctx.stroke();
    }
    // The opening below the V, two buttons, a breast pocket.
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid, vY);
    ctx.lineTo(mid, h);
    ctx.stroke();
    for (const y of [h * 0.58, h * 0.74]) {
      const g = ctx.createRadialGradient(mid + 10, y - 2, 1, mid + 10, y, 9);
      g.addColorStop(0, "#5a4636");
      g.addColorStop(1, "#1e140e");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mid + 10, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid + w * 0.07, h * 0.3);
    ctx.lineTo(mid + w * 0.12, h * 0.3);
    ctx.stroke();
    // The waist darker where it creases, the shoulders a little lighter.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255,0.06)");
    g.addColorStop(0.7, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
/** Felt: fine fibres, and the dark band round the crown (where the hat's lathe has it: v 0.5 to 0.54). */
function feltPicture(own: Own, colour: string, seed: number) {
  return painted(own, 256, 256, (ctx, w, h) => {
    const rnd = seeded(seed);
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#16110f";
    ctx.fillRect(0, h * 0.455, w, h * 0.05);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, h * 0.462, w, h * 0.006);
    for (let k = 0; k < 3000; k++) {
      ctx.strokeStyle = rnd() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
      ctx.lineWidth = 0.7;
      const x = rnd() * w,
        y = rnd() * h,
        a = rnd() * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
      ctx.stroke();
    }
  });
}

/** Moves and turns a shape by a position and Euler angles, for merging. */
const placed = (g: T.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]) =>
  g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(...s)));
/** A shape along a curve through points, its tube `radius` thick. */
const along = (points: T.Vector3[], radius: number, segments = 16, round = 8) => new T.TubeGeometry(new T.CatmullRomCurve3(points), segments, radius, round, false);

/**
 * A hand from the wrist forward (−z), the back of it up (+y): a palm, four fingers in two joints and a thumb on the
 * inner side (−x for the right hand, `side` 1). `curl` 0 lies open on the table, 1 closes round a grip.
 */
function handGeometry(side: number, curl: number) {
  const parts: T.BufferGeometry[] = [];
  parts.push(placed(new T.SphereGeometry(1, q(20), q(14)), 0, 0, -0.07, 0, 0, 0, [0.058, 0.026, 0.07]));
  const knuckle = -0.125;
  [-0.036, -0.012, 0.012, 0.036].forEach((x, k) => {
    const len = [0.05, 0.058, 0.056, 0.045][side > 0 ? 3 - k : k],
      bend = 0.25 + curl * 1.35,
      r = 0.0135;
    // The first joint from the knuckle, then the second bent further.
    const a = new T.Matrix4().compose(new T.Vector3(x, 0, knuckle), new T.Quaternion().setFromEuler(new T.Euler(-bend, 0, 0)), new T.Vector3(1, 1, 1));
    const first = new T.CapsuleGeometry(r, len * 0.55, q(4, 2), q(8, 5)).rotateX(Math.PI / 2).translate(0, 0, -len * 0.3);
    parts.push(first.applyMatrix4(a));
    const b = new T.Matrix4().multiplyMatrices(a, new T.Matrix4().compose(new T.Vector3(0, 0, -len * 0.6), new T.Quaternion().setFromEuler(new T.Euler(-bend * 0.9, 0, 0)), new T.Vector3(1, 1, 1)));
    parts.push(new T.CapsuleGeometry(r * 0.92, len * 0.45, q(4, 2), q(8, 5)).rotateX(Math.PI / 2).translate(0, 0, -len * 0.25).applyMatrix4(b));
  });
  // The thumb, on the inner side, along the palm and in toward the fingers when closed.
  const t = new T.Matrix4().compose(
    new T.Vector3(-side * 0.05, -0.008, -0.05),
    new T.Quaternion().setFromEuler(new T.Euler(-0.35 - curl * 0.5, side * (0.18 - curl * 0.15), side * 0.55)),
    new T.Vector3(1, 1, 1),
  );
  parts.push(new T.CapsuleGeometry(0.016, 0.055, q(4, 2), q(8, 5)).rotateX(Math.PI / 2).translate(0, 0, -0.04).applyMatrix4(t));
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  parts.forEach((p) => p.dispose());
  // A grown hand's size beside the arm.
  merged.scale(1.3, 1.3, 1.3);
  return plainUV(merged, 0.25, 0.5);
}

/**
 * How much hair grows in a direction (1 full, 0 none), soft at its line: off the face, down to the style's line (a crop
 * rises in front of the ears and falls behind them to the nape; a bob falls to the jaw all round the face).
 */
function growth(style: number, x: number, y: number, z: number) {
  const side = Math.abs(x),
    face = smoothstep(-0.05, -0.35, z) * (style === 1 ? smoothstep(0.86, 0.7, side) : 1),
    hairline = style === 1 ? 0.3 + 0.18 * side : 0.44 - 0.16 * side,
    onFace = 1 - face * smoothstep(hairline + 0.06, hairline - 0.02, y);
  const behind = smoothstep(-0.1, 0.35, z),
    low = style === 1 ? -0.62 : style === 2 ? -0.05 - 0.4 * behind : 0.05 - 0.42 * behind;
  return onFace * smoothstep(low - 0.06, low + 0.04, y);
}
function hairGeometry(style: number, seed: number) {
  const g = frontSphere(1, q(72), q(54)),
    pos = g.attributes.position,
    uv = g.attributes.uv,
    d = new T.Vector3(),
    p = new T.Vector3(),
    rnd = seeded(seed);
  const lift = style === 2 ? 0.06 : style === 1 ? 0.045 : 0.03;
  const phase = rnd() * 6;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    shapeHead(d, p);
    const grow = growth(style, d.x, d.y, d.z);
    let rise = lift + 0.012;
    // A bob swells out toward its ends; curls stand in bumps.
    if (style === 1) rise += 0.05 * smoothstep(0.2, -0.6, d.y);
    if (style === 2) rise += 0.018 * Math.sin(d.x * 23 + phase) * Math.sin(d.y * 21) * Math.sin(d.z * 19 + phase);
    // Where it does not grow it lies under the skin, so that its edge is the soft line where it comes out.
    rise = rise * grow - 0.02 * (1 - grow);
    pos.setXYZ(i, p.x + d.x * rise, p.y + d.y * rise, p.z + d.z * rise);
    uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 1.5);
  }
  smoothSeams(g);
  const parts: T.BufferGeometry[] = [g];
  if (style === 3) parts.push(placed(new T.SphereGeometry(0.115, 24, 16), 0, 0.15, 0.39));
  if (style === 0) {
    // A side-swept fringe over the brow.
    parts.push(placed(new T.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), -0.06, 0.27, -0.24, -0.9, 0.3, 0.25, [0.17, 0.05, 0.1]));
  }
  return parts.length === 1 ? g : mergeGeometries(parts)!;
}

/** The torso's outline from the seat up (radius, height), turned round and flattened front to back. */
const TORSO: [number, number][] = [
  [0.0, -0.72],
  [0.33, -0.71],
  [0.38, -0.6],
  [0.37, -0.36],
  [0.36, -0.14],
  [0.41, 0.08],
  [0.45, 0.24],
  [0.47, 0.34],
  [0.42, 0.44],
  [0.3, 0.5],
  [0.17, 0.54],
  [0.13, 0.56],
];
function torsoGeometry() {
  const g = new T.LatheGeometry(
    TORSO.map(([r, y]) => new T.Vector2(r, y)),
    q(48),
  );
  g.scale(1, 1, 0.62);
  return smoothSeams(g);
}

/** One player: a body group (its torso, legs, neck and head) and the parts the view moves. */
export function buildPerson(body: T.Group, look: Look, seed: number, own: Own, rich: boolean, headY: number, shoulderY: number): Person {
  // The lifelike look cuts every shape much finer (`DETAIL`); the cheap one coarser than the old full cut.
  FINE = rich ? DETAIL : 0.48;
  const cloth = (map: T.Texture, colour = "#ffffff", roughness = 0.85): T.MeshStandardMaterial =>
    own(
      rich
        ? new T.MeshPhysicalMaterial({ map, color: colour, roughness, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new T.Color(colour).lerp(new T.Color("#ffffff"), 0.5), ...wool })
        : new T.MeshStandardMaterial({ map, color: colour, roughness }),
    );
  // The cloth's weave: a photographed wool's relief and roughness (Poly Haven, CC0) over the painted jacket.
  const wool = rich ? (({ normalMap, normalScale, roughnessMap }) => ({ normalMap, normalScale, roughnessMap }))(made(own, "wool", "#ffffff", 3, 3, { figure: false, relief: 0.9 })) : {};
  // The skin: a warm glow under it on the graphics card's look (as light under skin), a little sheen at its edges.
  const skinMap = skinPicture(own, seed),
    pores = skinRelief(own, look.skin, 5);
  const face = own(
    rich
      ? new T.MeshPhysicalMaterial({ map: skinMap, color: look.skin, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new T.Color("#ff9d86"), emissive: new T.Color(look.skin).multiplyScalar(0.06), normalMap: pores.normalMap, normalScale: pores.normalScale })
      : new T.MeshStandardMaterial({ map: skinMap, color: look.skin, roughness: 0.6 }),
  ) as T.MeshStandardMaterial;
  // Where the processor draws, only the large parts cast shadows (the torso, the head, the hat).
  const mesh = (g: T.BufferGeometry, m: T.Material, parent: T.Object3D, shadow = rich) => {
    const it = new T.Mesh(own(g), m);
    it.castShadow = shadow;
    it.receiveShadow = true;
    parent.add(it);
    return it;
  };

  // ── Torso, legs, neck ──
  const jacket = cloth(jacketPicture(own, look, seed + 1), "#ffffff", 0.82);
  mesh(torsoGeometry(), jacket, body, true);
  // What does not move and has no picture, in one mesh painted by its vertices: the shirt's collar (two points
  // turned down at the throat and its band round the neck), the trousers and the shoes (and where the processor
  // draws, the neck too).
  const still: T.BufferGeometry[] = [];
  const paint = (g: T.BufferGeometry, colour: string) => {
    const c = new T.Color(colour),
      n = g.attributes.position.count,
      a = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) a.set([c.r, c.g, c.b], k * 3);
    g.setAttribute("color", new T.BufferAttribute(a, 3));
    still.push(g);
  };
  for (const sd of [-1, 1]) paint(placed(new T.BoxGeometry(0.1, 0.012, 0.075), sd * 0.055, 0.56, -0.1, 0.5, sd * -0.5, sd * 0.35).toNonIndexed(), look.shirt);
  paint(new T.CylinderGeometry(0.118, 0.124, 0.045, q(24), 1, true).translate(0, 0.545, 0.01).toNonIndexed(), look.shirt);
  const neck = plainUV(new T.CylinderGeometry(0.092, 0.108, 0.34, q(20)).translate(0, 0.68, 0.01), 0.25, 0.5);
  if (rich) mesh(neck, face, body);
  else paint(neck.toNonIndexed(), look.skin);
  const knee = -1.9 + 1.15 + 0.03;
  for (const s of [-1, 1]) {
    paint(along([new T.Vector3(s * 0.18, -0.6, 0.12), new T.Vector3(s * 0.2, knee + 0.02, -0.25), new T.Vector3(s * 0.21, knee, -0.55)], 0.115, q(12), q(12)).toNonIndexed(), look.trousers);
    paint(along([new T.Vector3(s * 0.21, knee, -0.55), new T.Vector3(s * 0.22, -1.3, -0.62), new T.Vector3(s * 0.22, -1.78, -0.62)], 0.09, q(10), q(12)).toNonIndexed(), look.trousers);
    paint(placed(new T.SphereGeometry(1, q(16), q(10)), s * 0.22, -1.83, -0.72, 0, 0, 0, [0.085, 0.06, 0.17]).toNonIndexed(), "#1c1512");
  }
  mesh(mergeGeometries(still)!, own(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: T.DoubleSide, ...wool })), body);
  still.forEach((g) => g.dispose());
  if (!rich) neck.dispose();

  // ── Head ──
  const outer = new T.Group();
  outer.position.set(0, headY, 0.06);
  body.add(outer);
  // Inside the head the view turns: a little larger than life (seen from across a room) and lifted a touch toward
  // the room, so that the faces are seen under the hats.
  const head = new T.Group();
  head.scale.setScalar(1.18);
  head.rotation.x = 0.14;
  head.position.y = 0.02;
  outer.add(head);
  const skinParts = [headGeometry().toNonIndexed()];
  const nose = onFace(0, -0.02, -0.012);
  skinParts.push(noseGeometry().rotateX(-0.12).translate(nose.x, nose.y - 0.01, nose.z + 0.005).toNonIndexed());
  for (const s of [-1, 1]) skinParts.push(placed(earGeometry(s), s * 0.288, -0.015, 0.03).toNonIndexed());
  // The lower lids, fixed: shells under each eye.
  const eyeR = 0.046,
    eyeAt = (s: number) => onFace(s * 0.112, 0.045, -0.04);
  for (const s of [-1, 1]) {
    const e = eyeAt(s);
    skinParts.push(new T.SphereGeometry(eyeR * 1.1, q(24), q(8), 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5).rotateX(-0.72).translate(e.x, e.y, e.z).toNonIndexed());
  }
  skinParts.forEach((g, k) => k > 0 && plainUV(g, 0.25, 0.5));
  const skull = mergeGeometries(skinParts)!;
  skinParts.forEach((g) => g.dispose());
  mesh(skull, face, head, true);

  // Eyes and their upper lids (which blink).
  const eyeMat = own(
    rich
      ? new T.MeshPhysicalMaterial({ map: eyePicture(own, look.eyes, seed + 2), roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 })
      : new T.MeshStandardMaterial({ map: eyePicture(own, look.eyes, seed + 2), roughness: 0.25 }),
  );
  const lash = own(new T.MeshStandardMaterial({ color: "#1a120e", roughness: 0.6 }));
  const lids: T.Group[] = [];
  const eyeGeo = own(frontSphere(eyeR, q(32), q(20))),
    lidGeo = own(new T.SphereGeometry(eyeR * 1.1, q(28), q(10), 0, Math.PI * 2, 0, Math.PI * 0.5)),
    lashGeo = own(new T.TorusGeometry(eyeR * 1.1, 0.0035, 5, 24, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI));
  plainUV(lidGeo, 0.25, 0.5);
  // Both eyes in one mesh, each looking in a little toward the middle of the table.
  const pair = [-1, 1].map((s) => eyeGeo.clone().rotateY(-s * 0.05).translate(eyeAt(s).x, eyeAt(s).y, eyeAt(s).z));
  mesh(mergeGeometries(pair)!, eyeMat, head, false);
  pair.forEach((g) => g.dispose());
  for (const s of [-1, 1]) {
    const e = eyeAt(s);
    const lid = new T.Group();
    lid.position.copy(e);
    lid.add(new T.Mesh(lidGeo, face));
    if (rich) lid.add(new T.Mesh(lashGeo, lash));
    head.add(lid);
    lids.push(lid);
  }
  // Brows.
  const browMat = own(new T.MeshStandardMaterial({ color: new T.Color(look.hair).multiplyScalar(0.85), roughness: 0.9 }));
  const brows = [-1, 1].map((s) => {
    const a = onFace(s * 0.05, 0.13, 0.004),
      b = onFace(s * 0.11, 0.148, 0.006),
      c = onFace(s * 0.175, 0.125, 0.0);
    const pivot = b.clone();
    const g = along([a.sub(pivot), b.clone().sub(pivot), c.sub(pivot)], 0.011, q(12), q(6)).scale(1, 0.7, 0.8);
    const brow = mesh(g, browMat, head, false);
    brow.position.copy(pivot);
    return brow;
  });
  // Lips: the upper and the fuller lower, a dark line between; and a round open mouth for a gasp.
  const lipMat = own(new T.MeshStandardMaterial({ color: new T.Color(look.skin).lerp(new T.Color("#b0504a"), 0.55), roughness: 0.45 }));
  const mouth = new T.Group(),
    m0 = onFace(0, -0.155, 0);
  mouth.position.copy(m0);
  head.add(mouth);
  const lipLine = (y: number, out: number, curve: number) =>
    [-0.056, -0.03, 0, 0.03, 0.056].map((x) => {
      const p = onFace(x, -0.155 + y + curve * (x * x) * 3, out);
      return p.sub(m0);
    });
  mesh(
    mergeGeometries([
      along(lipLine(0.01, 0.005, 1.2), 0.0085, q(16), q(8)).scale(1, 0.75, 1),
      along(lipLine(-0.014, 0.008, 0.45).map((p, k) => (k === 0 || k === 4 ? p : p.add(new T.Vector3(0, -0.004, -0.004)))), 0.011, q(16), q(8)).scale(1, 0.8, 1),
    ])!,
    lipMat,
    mouth,
    false,
  );
  if (rich) mesh(along(lipLine(-0.001, 0.0, 1.0), 0.0032, 16, 5), lash, mouth, false);
  const gasp = new T.Group();
  gasp.position.copy(m0).add(new T.Vector3(0, -0.012, -0.004));
  head.add(gasp);
  mesh(new T.CircleGeometry(0.045, 24).scale(0.8, 1, 1).rotateY(Math.PI), own(new T.MeshStandardMaterial({ color: "#3a1416", roughness: 0.8 })), gasp, false);
  mesh(new T.TorusGeometry(0.045, 0.013, 8, 24).scale(0.8, 1, 0.6), lipMat, gasp, false);
  gasp.visible = false;

  // Hair, and its tufts standing on end after a 펑.
  const curly = look.style === 2;
  const hairMap = hairPicture(own, look.hair, curly, seed + 3);
  hairMap.wrapS = hairMap.wrapT = T.RepeatWrapping;
  const hairMat = own(new T.MeshStandardMaterial({ map: hairMap, color: "#ffffff", roughness: 0.62, bumpMap: rich ? hairMap : null, bumpScale: 0.8 }));
  mesh(hairGeometry(look.style, seed), hairMat, head);
  const spikes = new T.Group();
  head.add(spikes);
  const spike = own(new T.ConeGeometry(0.05, 0.34, 10, 1).translate(0, 0.17, 0));
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2,
      m = new T.Mesh(spike, hairMat);
    m.position.set(Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2);
    m.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    spikes.add(m);
  }
  spikes.visible = false;

  // The felt hat: a brim with its edge turned, a pinched crown, a dark band.
  const hat = new T.Group();
  hat.position.set(0.03, 0.27, 0.02);
  hat.rotation.z = -0.14;
  // Worn pushed back, so that the brim does not shade the eyes from above.
  hat.rotation.x = 0.3;
  hat.scale.setScalar(0.9);
  head.add(hat);
  const feltMap = feltPicture(own, look.hat, seed + 4);
  const felt = own(
    rich ? new T.MeshPhysicalMaterial({ map: feltMap, roughness: 0.9, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new T.Color(look.hat).lerp(new T.Color("#ffffff"), 0.4) }) : new T.MeshStandardMaterial({ map: feltMap, roughness: 0.9 }),
  );
  const hatShape = new T.LatheGeometry(
    (
      [
        [0.25, 0.0],
        [0.42, -0.012],
        [0.47, 0.004],
        [0.455, 0.024],
        [0.31, 0.03],
        [0.262, 0.05],
        [0.252, 0.18],
        [0.236, 0.27],
        [0.19, 0.305],
        [0.08, 0.275],
        [0.0, 0.265],
      ] as [number, number][]
    ).map(([r, y]) => new T.Vector2(r, y)),
    q(48),
  );
  hatShape.scale(1, 1, 1.12);
  mesh(smoothSeams(hatShape), felt, hat, true);

  // Dizzy stars round the head after a 펑.
  const stars = new T.Group();
  stars.position.y = 0.56;
  head.add(stars);
  const star = own(new T.OctahedronGeometry(0.06, 0)),
    starMat = own(new T.MeshBasicMaterial({ color: "#ffe066" }));
  for (let k = 0; k < 4; k++) {
    const m = new T.Mesh(star, starMat),
      a = (k / 4) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    stars.add(m);
  }
  stars.visible = false;

  // ── Arms ──
  const upperGeo = own(new T.CapsuleGeometry(0.092, UPPER - 0.1, q(6, 3), q(16, 8)).translate(0, UPPER / 2 - 0.02, 0)),
    lowerGeo = own(new T.CapsuleGeometry(0.078, LOWER - 0.1, q(6, 3), q(16, 8)).translate(0, LOWER / 2 - 0.02, 0)),
    cuffGeo = own(new T.CylinderGeometry(0.073, 0.073, 0.05, 18, 1, true).translate(0, LOWER - 0.04, 0));
  const cuffMat = own(new T.MeshStandardMaterial({ color: look.shirt, roughness: 0.7, side: T.DoubleSide }));
  const sleeve = cloth(painted(own, 64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    // A fine weave both ways, so that no rings show round the sleeve.
    for (let k = 0; k < w; k += 2) {
      ctx.fillStyle = k % 4 ? "rgba(0,0,0,0.03)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(k, 0, 1, h);
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(0, k, w, 1);
    }
  }), look.jacket, 0.82);
  const arms = [-1, 1].map((s): Arm => {
    const upper = new T.Mesh(upperGeo, sleeve);
    upper.castShadow = rich;
    const lower = new T.Group();
    const fore = new T.Mesh(lowerGeo, sleeve);
    fore.castShadow = rich;
    lower.add(fore);
    if (rich) lower.add(new T.Mesh(cuffGeo, cuffMat));
    const open = new T.Group(),
      fist = new T.Group();
    const openMesh = new T.Mesh(own(handGeometry(s, 0.1)), face),
      fistMesh = new T.Mesh(own(handGeometry(s, 1)), face);
    openMesh.castShadow = fistMesh.castShadow = true;
    open.add(openMesh);
    fist.add(fistMesh);
    fist.visible = false;
    body.add(upper, lower, open, fist);
    return { side: s, shoulder: new T.Vector3(s * 0.43, shoulderY, 0.1), upper, lower, open, fist };
  });
  const person: Person = { head: outer, face, mouth, gasp, spikes, hat, stars, arms, lids, brows, open: 0.42 };
  feel(person, {});
  return person;
}

const Y = new T.Vector3(0, 1, 0);
/**
 * Puts an arm's hand at `to` (in the body's frame): the elbow bends out and down to reach it (or the arm stretches if
 * it is far), the forearm points the hand along it, palm down; `grip` shows the hand closed.
 */
export function reachArm(arm: Arm, to: T.Vector3, grip: boolean) {
  const s = arm.shoulder,
    d = to.clone().sub(s),
    dist = d.length(),
    reach = UPPER + LOWER,
    stretch = Math.max(1, dist / (reach * 0.995)),
    a = UPPER * stretch,
    b = LOWER * stretch;
  const dir = d.clone().normalize();
  const along = (a * a - b * b + dist * dist) / (2 * dist),
    h = Math.sqrt(Math.max(0, a * a - along * along));
  // The elbow out to the side, down and a little back.
  const pole = new T.Vector3(arm.side * 1, -1.2, 0.5);
  pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = s.clone().add(dir.clone().multiplyScalar(along)).add(pole.multiplyScalar(h));
  arm.upper.position.copy(s);
  arm.upper.quaternion.setFromUnitVectors(Y, elbow.clone().sub(s).normalize());
  arm.upper.scale.set(1, stretch, 1);
  arm.lower.position.copy(elbow);
  const fore = to.clone().sub(elbow).normalize();
  arm.lower.quaternion.setFromUnitVectors(Y, fore);
  arm.lower.scale.set(1, stretch, 1);
  // The hand: forward along the forearm, its back up.
  const z = fore.clone().negate(),
    x = new T.Vector3().crossVectors(Y, z),
    side = x.lengthSq() < 1e-6 ? new T.Vector3(1, 0, 0) : x.normalize(),
    y = new T.Vector3().crossVectors(z, side);
  const turn = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(side, y, z));
  for (const hand of [arm.open, arm.fist]) {
    hand.position.copy(to);
    hand.quaternion.copy(turn);
  }
  arm.open.visible = !grip;
  arm.fist.visible = grip;
}

/**
 * A face: `tension` (the trigger coming back: brows drawn up in the middle, eyes narrowed, lips pressed), `shock` (a
 * 펑: eyes wide, brows high) and `smile` (relief).
 */
export function feel(p: Person, f: { tension?: number; shock?: number; smile?: number }) {
  const t = f.tension ?? 0,
    k = f.shock ?? 0,
    sm = f.smile ?? 0;
  p.open = 0.42 - 0.32 * t + 0.4 * k;
  for (const lid of p.lids) lid.rotation.x = p.open;
  p.brows.forEach((b, i) => {
    const s = i === 0 ? -1 : 1;
    b.rotation.z = s * (-0.28 * t + 0.08 * k);
    b.userData.y ??= b.position.y;
    b.position.y = b.userData.y + 0.012 * t + 0.03 * k;
  });
  p.mouth.scale.set(1 - 0.12 * t + 0.08 * sm, 1 - 0.55 * t + 0.25 * sm, 1);
}
/** Shuts or opens a player's eyes (a blink), back to how `feel` last set them. */
export function blink(p: Person, shut: boolean) {
  for (const lid of p.lids) lid.rotation.x = shut ? -1.45 : p.open;
}
