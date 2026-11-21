import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The coins of Indian poker: what they look like, where each lies at rest,
 * and how one moves when it is thrown, pushed or picked back up.
 *
 * Where a coin lies is a function of where it belongs and its number there
 * alone (`restOf`): a pile only ever grows or shrinks at its top, so a coin on
 * its way to the next place of a pile comes down on coins that are already
 * there, never through them.
 */
export const COIN_R = 0.26,
  COIN_H = 0.06,
  /** The height of the felt. */
  FELT = 2.304;
/** Where a coin lies: my stack, my bet being set, the pot, the computer's stack. */
export type Role = "mine" | "bet" | "pot" | "theirs";
export const ROLES: Role[] = ["mine", "bet", "pot", "theirs"];
/** Which paint a coin wears there: mine copper and red, the computer's silver and blue, the pot's gold. */
export const KIND: Record<Role, number> = { mine: 0, bet: 0, pot: 2, theirs: 1 };
export type Counts = Record<Role, number>;
export interface Pose {
  p: T.Vector3;
  q: T.Quaternion;
}
/** A small fixed scatter, so that no two coins lie quite alike. */
const hash = (a: number, b: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** The places of a loose pile: one in the middle, six round it, far enough apart that neighbours never touch. */
const RING = [
  [0, 0],
  [1, 0],
  [0.5, 0.866],
  [-0.5, 0.866],
  [-1, 0],
  [-0.5, -0.866],
  [0.5, -0.866],
];
const SPREAD = 0.56,
  JITTER = 0.012;
/** The middle of each pile on the table. */
export const PILES = {
  mine: { x: -3.5, z: 2.15, dx: 0.58, dz: 0.58 },
  // Its stacks are laid from the far side, so that the coins it takes first are the nearest its hand.
  theirs: { x: 2.66, z: -2.7, dx: -0.58, dz: -0.58 },
  pot: { x: -0.2, z: -0.55 },
  bet: { x: 1.9, z: 2.3 },
};
const Y = new T.Vector3(0, 1, 0);
/** Where the `index`-th coin of `role` lies at rest. */
export function restOf(role: Role, index: number, out: Pose = { p: new T.Vector3(), q: new T.Quaternion() }): Pose {
  const salt = ROLES.indexOf(role) + 1,
    yaw = hash(index, salt) * Math.PI * 2,
    jx = (hash(index, salt + 7) - 0.5) * 2 * JITTER,
    jz = (hash(index, salt + 13) - 0.5) * 2 * JITTER;
  if (role === "mine" || role === "theirs") {
    // Neat stacks of ten, three to a row.
    const pile = PILES[role],
      stack = Math.floor(index / 10),
      layer = index % 10;
    out.p.set(pile.x + (stack % 3) * pile.dx + jx, FELT + COIN_H / 2 + layer * COIN_H, pile.z + Math.floor(stack / 3) * pile.dz + jz);
  } else {
    // A loose heap: the first coins side by side, the later ones on top of them.
    const pile = PILES[role],
      spot = RING[index % RING.length],
      layer = Math.floor(index / RING.length);
    out.p.set(pile.x + spot[0] * SPREAD + jx, FELT + COIN_H / 2 + layer * COIN_H, pile.z + spot[1] * SPREAD + jz);
  }
  out.q.setFromAxisAngle(Y, yaw);
  return out;
}

/** A movement of one coin, drawn in the view's own frames. */
export interface Flight {
  /** "throw": tossed in an arc, spinning, then a bounce and a wobble; "slide": pushed or scooped low; "away": picked back up out of sight. */
  style: "throw" | "slide" | "away";
  from: Pose;
  to: Pose;
  /** Where it comes to rest, or null when it leaves the table. */
  target: { role: Role; index: number } | null;
  /** The paint it wears on the way, and once it has landed. */
  kind: number;
  landKind: number;
  /** When it sets off (ms, performance clock), and when it is first picked up (a coin taken from a stack by the figure's hand). */
  start: number;
  /** Before `start` it lies at `from`; with `hold` it is carried by a hand from `held` until `start`. */
  held?: { at: number; from: Pose };
  turns: number;
  /** Which way it tips as it wobbles. */
  phase: number;
  /** The sounds already made: landing, bounce, rattle. */
  heard: number;
}
/** How long each part of a throw lasts (ms): the flight, the bounce, the wobble. */
export const THROW = { fly: 560, bounce: 170, wobble: 950 },
  SLIDE = 430,
  AWAY = 420;
export const lasts = (f: Flight) => (f.style === "throw" ? THROW.fly + THROW.bounce + THROW.wobble : f.style === "slide" ? SLIDE : AWAY);
const tmpQ = new T.Quaternion(),
  axis = new T.Vector3();
const smooth = (s: number) => s * s * (3 - 2 * s);
/**
 * Where a flight is at `now`, into `out`; returns which paint it wears and what it should be heard doing:
 * 0 nothing, 1 landing, 2 the bounce, 3 the last rattle.
 */
export function flightAt(f: Flight, now: number, out: Pose): { kind: number; sound: number; done: boolean } {
  const u = now - f.start;
  if (u < 0) {
    if (f.held && now >= f.held.at) {
      // Carried by the hand from where it was taken up toward where it is let go.
      const s = smooth(Math.min(1, (now - f.held.at) / Math.max(1, f.start - f.held.at)));
      out.p.lerpVectors(f.held.from.p, f.from.p, s);
      out.p.y += Math.sin(Math.PI * s) * 0.25;
      out.q.slerpQuaternions(f.held.from.q, f.from.q, s);
    } else {
      const source = f.held ? f.held.from : f.from;
      out.p.copy(source.p);
      out.q.copy(source.q);
    }
    return { kind: f.kind, sound: 0, done: false };
  }
  const distance = Math.hypot(f.to.p.x - f.from.p.x, f.to.p.z - f.from.p.z);
  if (f.style === "slide") {
    const s = Math.min(1, u / SLIDE),
      e = smooth(s);
    out.p.lerpVectors(f.from.p, f.to.p, e);
    // Lifted just over whatever lies between.
    out.p.y += Math.sin(Math.PI * s) * Math.min(0.75, 0.12 + distance * 0.16);
    out.q.slerpQuaternions(f.from.q, f.to.q, e);
    const done = s >= 1;
    return { kind: done ? f.landKind : f.kind, sound: done ? 1 : 0, done };
  }
  if (f.style === "away") {
    const s = Math.min(1, u / AWAY),
      e = s * s;
    out.p.lerpVectors(f.from.p, f.to.p, e);
    out.p.y += Math.sin(Math.PI * s) * 0.35;
    axis.set(f.to.p.z - f.from.p.z, 0, f.from.p.x - f.to.p.x).normalize();
    out.q.copy(f.from.q).premultiply(tmpQ.setFromAxisAngle(axis, Math.PI * 2 * e));
    return { kind: f.kind, sound: 0, done: s >= 1 };
  }
  // A throw: up in an arc, turning over and over, landing flat.
  if (u < THROW.fly) {
    const s = u / THROW.fly,
      apex = 0.35 + Math.min(distance, 8) * 0.09 + Math.max(0, f.from.p.y - f.to.p.y) * 0.1;
    out.p.lerpVectors(f.from.p, f.to.p, s);
    // Lower at the end than a symmetric arc would be: it comes down steeply, as a thrown coin does.
    out.p.y += apex * 4 * s * (1 - s) * (1 - 0.25 * s);
    axis.set(f.to.p.z - f.from.p.z, 0, f.from.p.x - f.to.p.x);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    out.q.slerpQuaternions(f.from.q, f.to.q, s).premultiply(tmpQ.setFromAxisAngle(axis, Math.PI * 2 * f.turns * s));
    return { kind: f.kind, sound: 0, done: false };
  }
  out.p.copy(f.to.p);
  const v = u - THROW.fly;
  if (v < THROW.bounce) {
    // One small hop, tipped a little.
    const s = v / THROW.bounce;
    out.p.y += Math.sin(Math.PI * s) * 0.075;
    axis.set(Math.cos(f.phase), 0, Math.sin(f.phase));
    out.q.copy(f.to.q).premultiply(tmpQ.setFromAxisAngle(axis, Math.sin(Math.PI * s) * 0.35));
    return { kind: f.landKind, sound: 1, done: false };
  }
  // Then it rolls round on its rim, faster and lower, as a spun coin does, until it lies flat.
  const w = Math.min(1, (v - THROW.bounce) / THROW.wobble),
    tilt = 0.2 * (1 - w) ** 1.7,
    turn = f.phase + Math.PI * 2 * (1.2 * w + 2.6 * w * w);
  axis.set(Math.cos(turn), 0, Math.sin(turn));
  out.q.copy(f.to.q).premultiply(tmpQ.setFromAxisAngle(axis, tilt));
  // Its lower edge stays on what it lies on.
  out.p.y += COIN_R * Math.sin(tilt) + (COIN_H / 2) * (Math.cos(tilt) - 1);
  return { kind: f.landKind, sound: w > 0.8 ? 3 : 2, done: w >= 1 };
}

/** The table's movements between two layouts: each coin that leaves a place goes to a place that gains one. */
export function pairs(before: Counts, after: Counts) {
  const sources: { role: Role; index: number }[] = [],
    targets: { role: Role; index: number }[] = [];
  // What is put in goes out from the bet first, then from the stacks; what is won comes out of the pot.
  for (const role of ["bet", "mine", "theirs", "pot"] as Role[]) for (let i = before[role] - 1; i >= after[role]; i--) sources.push({ role, index: i });
  for (const role of ["pot", "bet", "mine", "theirs"] as Role[]) for (let i = before[role]; i < after[role]; i++) targets.push({ role, index: i });
  const n = Math.min(sources.length, targets.length);
  return Array.from({ length: n }, (_, i) => ({ from: sources[i], to: targets[i] }));
}

type Own = <R extends { dispose(): void }>(resource: R) => R;
/**
 * One coin, lying flat on y = 0 about its middle: a rim with a milled edge (ridges in the turned profile) and a
 * sunk field on either face that carries its picture (group 1). Fewer `segments` (the coin pusher's hundreds of
 * coins) leave the milling out.
 */
export function coinGeometry(segments = 120) {
  const R = COIN_R,
    h = COIN_H / 2,
    field = R * 0.8,
    profile = [
      [field, -h + 0.009],
      [R * 0.86, -h],
      [R * 0.965, -h],
      [R, -h + 0.008],
      [R, h - 0.008],
      [R * 0.965, h],
      [R * 0.86, h],
      [field, h - 0.009],
    ].map(([x, y]) => new T.Vector2(x, y)),
    rim = new T.LatheGeometry(profile, segments),
    at = rim.getAttribute("position");
  // The milling: every other column of the outer edge stands a little in.
  for (let i = 0; i < at.count; i++) {
    const column = Math.floor(i / profile.length),
      x = at.getX(i),
      z = at.getZ(i);
    if (Math.hypot(x, z) > R * 0.995 && column % 2 && segments >= 60) at.setXYZ(i, x * 0.972, at.getY(i), z * 0.972);
  }
  rim.computeVertexNormals();
  const top = new T.CircleGeometry(field + 0.002, Math.min(48, segments)),
    bottom = new T.CircleGeometry(field + 0.002, Math.min(48, segments));
  top.rotateX(-Math.PI / 2).translate(0, h - 0.009, 0);
  bottom.rotateX(Math.PI / 2).translate(0, -h + 0.009, 0);
  const faces = mergeGeometries([top, bottom])!,
    coin = mergeGeometries([rim, faces], true)!;
  rim.dispose();
  top.dispose();
  bottom.dispose();
  faces.dispose();
  return coin;
}
/** The three paints: metal of the rim, enamel ring and metal emblem on the face. */
const PAINTS = [
  { metal: "#b8472c", deep: "#6e1f12", enamel: "#c8321f", light: "#f0a27e" },
  { metal: "#3f68c2", deep: "#1c3570", enamel: "#2f62c0", light: "#b9cff5" },
  { metal: "#e0b44a", deep: "#94671c", enamel: "#d9a21c", light: "#fff0b8" },
];
/** Paints a coin's face: a beaded border, a band of enamel, a sun of sixteen rays round a raised boss. Or its relief (`height`). */
function paintFace(ctx: CanvasRenderingContext2D, s: number, kind: number, height: boolean) {
  const c = PAINTS[kind],
    m = s / 2,
    ink = (paint: string, relief: number) => (height ? `rgb(${relief},${relief},${relief})` : paint);
  ctx.fillStyle = height ? "rgb(110,110,110)" : c.metal;
  ctx.fillRect(0, 0, s, s);
  if (!height) {
    // Light worn into the middle and the edge, as on handled metal.
    const g = ctx.createRadialGradient(m * 0.8, m * 0.7, s * 0.05, m, m, m);
    g.addColorStop(0, c.light);
    g.addColorStop(0.55, c.metal);
    g.addColorStop(1, c.deep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  // The enamel band.
  ctx.beginPath();
  ctx.arc(m, m, s * 0.46, 0, Math.PI * 2);
  ctx.arc(m, m, s * 0.33, 0, Math.PI * 2, true);
  ctx.fillStyle = ink(c.enamel, 80);
  ctx.fill();
  // Beads round the border, on the enamel.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(m + Math.cos(a) * s * 0.4, m + Math.sin(a) * s * 0.4, s * 0.017, 0, Math.PI * 2);
    ctx.fillStyle = ink(c.light, 200);
    ctx.fill();
  }
  // Thin raised lines either side of the band.
  ctx.lineWidth = s * 0.012;
  ctx.strokeStyle = ink(c.light, 190);
  for (const r of [0.46, 0.33]) {
    ctx.beginPath();
    ctx.arc(m, m, s * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A sun: rays round a boss.
  ctx.save();
  ctx.translate(m, m);
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    ctx.beginPath();
    ctx.moveTo(-s * 0.022, s * 0.1);
    ctx.lineTo(0, s * (i % 2 ? 0.23 : 0.29));
    ctx.lineTo(s * 0.022, s * 0.1);
    ctx.closePath();
    ctx.fillStyle = ink(i % 2 ? c.deep : c.light, i % 2 ? 160 : 215);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = ink(c.light, 235);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = ink(c.metal, 205);
  ctx.fill();
  ctx.restore();
}
/** The two materials of a coin of `kind`: its rim and its faces, with relief only where a graphics card draws. */
export function coinMaterials(kind: number, own: Own, rich: boolean): [T.Material, T.Material] {
  const picture = (height: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    paintFace(canvas.getContext("2d")!, 256, kind, height);
    const texture = own(new T.CanvasTexture(canvas));
    if (!height) texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  const c = PAINTS[kind],
    // Without the reflected room a polished metal turns black, so where no graphics card draws it is mostly paint.
    metalness = rich ? 0.85 : 0.35,
    rim = own(new T.MeshStandardMaterial({ color: c.metal, metalness, roughness: rich ? 0.32 : 0.45 })),
    face = own(
      new T.MeshStandardMaterial({
        map: picture(false),
        metalness: rich ? 0.7 : 0.25,
        roughness: rich ? 0.38 : 0.5,
        ...(rich ? { bumpMap: picture(true), bumpScale: 1.6 } : {}),
      }),
    );
  return [rim, face];
}
