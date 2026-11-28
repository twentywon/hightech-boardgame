import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { glossy, wood, woodPhoto } from "../../engine/scene-utils";
import { ARENA, BASE, HALF, REACH } from "./rules";

/**
 * The carrom board, all in code: a polished plywood top printed with base lines, corner arrows and a centre rosette
 * of our own drawing and dusted with powder, cut through at the four pockets; under each pocket a cotton net; a
 * heavy square frame (left square on purpose: rounded, the boxes would open grooves) and a low stand.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** How far the plywood reaches: under the frame, so that the pockets are cut wholly within it. */
export const EXTENT = HALF + 0.6,
  /** The plywood's thickness under the playing face (y 0). */
  PLY = 0.1,
  /** How deep a pocket's net hangs below the face, and the floor of the veranda. */
  NET_DEPTH = 0.78,
  FLOOR = -2.1;
const INK = "#2a1810",
  RED = "#b2262a";

/** Paints the print: `px` turns board units into the canvas's pixels. */
function print(ctx: CanvasRenderingContext2D, size: number, grain: HTMLImageElement | null) {
  const px = (v: number) => size / 2 + (v / EXTENT) * (size / 2),
    unit = size / (EXTENT * 2);
  ctx.fillStyle = "#ead3a0";
  ctx.fillRect(0, 0, size, size);
  if (grain) {
    // The veneer's figure, laid in strips as plywood's face is, faint under its polish.
    ctx.globalAlpha = 0.5;
    const strip = size / 3;
    for (let k = 0; k < 3; k++) ctx.drawImage(grain, 0, (k * grain.height) / 3, grain.width, grain.height / 3, 0, k * strip, size, strip);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(240,214,160,0.35)";
    ctx.fillRect(0, 0, size, size);
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  const line = (w: number) => (ctx.lineWidth = w * unit);
  // The four base lines: two rails with a red circle at each end.
  for (let side = 0; side < 4; side++) {
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((side * Math.PI) / 2);
    ctx.translate(-size / 2, -size / 2);
    line(0.035);
    for (const offset of [-0.2, 0.2]) {
      ctx.beginPath();
      ctx.moveTo(px(-REACH), px(BASE + offset));
      ctx.lineTo(px(REACH), px(BASE + offset));
      ctx.stroke();
    }
    for (const end of [-REACH, REACH]) {
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(px(end), px(BASE), 0.2 * unit, 0, Math.PI * 2);
      ctx.fill();
      line(0.03);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px(end), px(BASE), 0.1 * unit, 0, Math.PI * 2);
      ctx.fillStyle = "#f1dcae";
      ctx.fill();
    }
    // The corner arrow: from beside the pocket toward the middle, with an arc across its tail.
    const corner = HALF - 0.32,
      from = corner - 0.95,
      to = corner - 3.0;
    line(0.03);
    ctx.beginPath();
    ctx.moveTo(px(from), px(from));
    ctx.lineTo(px(to), px(to));
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    const head = 0.26;
    ctx.moveTo(px(from), px(from));
    ctx.lineTo(px(from - head * 1.3) - 0.11 * unit, px(from - head * 1.3) + 0.11 * unit);
    ctx.lineTo(px(from - head * 1.3) + 0.11 * unit, px(from - head * 1.3) - 0.11 * unit);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px(corner), px(corner), (corner - to + 0.1) * Math.SQRT2 * unit, Math.PI + 0.62, Math.PI * 1.5 - 0.62);
    ctx.stroke();
    ctx.restore();
  }
  // The centre: an outer ring, a rosette of sixteen petals in thin red line, and the queen's red spot.
  const c = size / 2;
  line(0.04);
  ctx.beginPath();
  ctx.arc(c, c, 1.7 * unit, 0, Math.PI * 2);
  ctx.stroke();
  line(0.02);
  ctx.beginPath();
  ctx.arc(c, c, 1.58 * unit, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = RED;
  line(0.025);
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * 1.2 * unit, c + Math.sin(a) * 1.2 * unit, 0.34 * unit, 0.13 * unit, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(c, c, 0.86 * unit, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(c, c, 0.27 * unit, 0, Math.PI * 2);
  ctx.fill();
  line(0.02);
  ctx.stroke();
  // A ring round each pocket's edge, and the shade the frame throws along its inner side.
  for (const p of ARENA.pockets) {
    line(0.05);
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(px(p.x), px(p.z), (p.r + 0.04) * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  const edge = (HALF / EXTENT) * (size / 2),
    shade = ctx.createLinearGradient(0, c - edge, 0, c - edge + 0.25 * unit);
  shade.addColorStop(0, "rgba(40,20,8,0.35)");
  shade.addColorStop(1, "rgba(40,20,8,0)");
  for (let side = 0; side < 4; side++) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate((side * Math.PI) / 2);
    ctx.translate(-c, -c);
    ctx.fillStyle = shade;
    ctx.fillRect(c - edge, c - edge, edge * 2, 0.25 * unit);
    ctx.restore();
  }
  // Powder: fine white specks, thickest where the men slide most (the middle and the base lines).
  let seed = 11;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 9000; i++) {
    const r = Math.sqrt(rand()) * HALF * (i % 3 ? 0.55 : 1),
      a = rand() * Math.PI * 2;
    ctx.fillStyle = `rgba(255,255,250,${0.08 + rand() * 0.22})`;
    ctx.fillRect(c + Math.cos(a) * r * unit, c + Math.sin(a) * r * unit, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }
}
/** The printed face as a texture, painted at once and again with the veneer's figure once its photograph is in. */
export function boardTexture(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!,
    texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  print(ctx, size, null);
  woodPhoto("maple", (image) => {
    print(ctx, size, image);
    texture.needsUpdate = true;
  });
  return texture;
}
/** The plywood top: a square slab with the four pockets cut through it; its face (group 0) takes the print. */
export function plywoodGeometry() {
  const shape = new T.Shape();
  // The shape's y is the board's -z (it is laid flat below).
  shape.moveTo(-EXTENT, -EXTENT);
  shape.lineTo(EXTENT, -EXTENT);
  shape.lineTo(EXTENT, EXTENT);
  shape.lineTo(-EXTENT, EXTENT);
  shape.closePath();
  for (const p of ARENA.pockets) {
    const hole = new T.Path();
    hole.absarc(p.x, -p.z, p.r, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new T.ExtrudeGeometry(shape, { depth: PLY, bevelEnabled: false, curveSegments: 28 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -PLY, 0);
  const at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, (at.getX(i) + EXTENT) / (2 * EXTENT), 1 - (at.getZ(i) + EXTENT) / (2 * EXTENT));
  uv.needsUpdate = true;
  return geometry;
}
/** A cotton net knotted in diamonds, on nothing (cut out by its alpha). */
function netTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(64, 64);
  ctx.moveTo(64, 0);
  ctx.lineTo(0, 64);
  ctx.stroke();
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(9, 3);
  return t;
}
/** The bag a pocket's net hangs in, its rim at the underside of the plywood. */
export function netGeometry(r: number) {
  const profile: [number, number][] = [
    [0.004, -NET_DEPTH],
    [r * 0.35, -NET_DEPTH + 0.02],
    [r * 0.7, -NET_DEPTH + 0.1],
    [r * 0.95, -NET_DEPTH + 0.28],
    [r * 1.04, -0.42],
    [r * 1.02, -PLY - 0.08],
    [r, -PLY],
  ];
  return new T.LatheGeometry(
    profile.map(([x, y]) => new T.Vector2(x, y)),
    20,
  );
}
/** Where the bottom of a pocket's net is: a pocketed man lies there. */
export const NET_FLOOR = -NET_DEPTH + 0.1;
/** Builds the board into `scene`. */
export function buildBoard(scene: T.Object3D, own: Own, rich: boolean) {
  const top = own(boardTexture(rich ? 2048 : 1024)),
    face = own(glossy({ map: top, roughness: 0.32 }, 0.5)),
    cut = own(new T.MeshStandardMaterial({ color: "#6b4a2c", roughness: 0.8 })),
    ply = new T.Mesh(own(plywoodGeometry()), [face, cut]);
  ply.receiveShadow = true;
  scene.add(ply);
  // The frame: four heavy polished beams, the long ones across the ends.
  const grain = own(wood(true)),
    timber = own(glossy({ map: grain, roughness: 0.42 }, 0.7)),
    beams: T.BufferGeometry[] = [];
  for (const [x, z, w, d] of [
    [0, HALF + 0.3, HALF * 2 + 1.2, 0.6],
    [0, -HALF - 0.3, HALF * 2 + 1.2, 0.6],
    [HALF + 0.3, 0, 0.6, HALF * 2],
    [-HALF - 0.3, 0, 0.6, HALF * 2],
  ])
    beams.push(new T.BoxGeometry(w, 0.62, d).translate(x, -0.1, z));
  const frame = new T.Mesh(own(mergeGeometries(beams)!), timber);
  beams.forEach((b) => b.dispose());
  frame.castShadow = frame.receiveShadow = true;
  scene.add(frame);
  // The nets.
  const net = own(new T.MeshStandardMaterial({ color: "#efe6d2", map: own(netTexture()), alphaTest: 0.45, side: T.DoubleSide, roughness: 1 })),
    bag = own(netGeometry(ARENA.pockets[0].r)),
    bags: T.Mesh[] = [];
  for (const p of ARENA.pockets) {
    const m = new T.Mesh(bag, net);
    m.position.set(p.x, 0, p.z);
    m.castShadow = rich;
    scene.add(m);
    bags.push(m);
  }
  // The stand: four turned legs under the side beams, joined by rails a little above the floor.
  const legProfile = [
      [0, 0],
      [0.2, 0],
      [0.2, 0.12],
      [0.15, 0.2],
      [0.12, 0.5],
      [0.16, 0.75],
      [0.11, 0.95],
      [0.13, 1.2],
      [0.18, 1.3],
      [0.18, 1.45],
      [0, 1.45],
    ].map(([x, y]) => new T.Vector2(x, y)),
    legs: T.BufferGeometry[] = [],
    span = -0.41 - FLOOR;
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      legs.push(new T.LatheGeometry(legProfile, rich ? 14 : 10).scale(1, span / 1.45, 1).translate(x * (HALF + 0.3), FLOOR, z * 3.2));
    }
  for (const x of [-1, 1]) legs.push(new T.BoxGeometry(0.12, 0.14, 6.4).translate(x * (HALF + 0.3), FLOOR + 0.42, 0));
  legs.push(new T.BoxGeometry((HALF + 0.3) * 2, 0.14, 0.12).translate(0, FLOOR + 0.42, 0));
  const stand = new T.Mesh(own(mergeGeometries(legs.map((g) => g.toNonIndexed()))!), timber);
  legs.forEach((g) => g.dispose());
  stand.castShadow = stand.receiveShadow = true;
  scene.add(stand);
  return { ply, frame, bags };
}
