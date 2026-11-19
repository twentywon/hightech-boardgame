import * as T from "three";
import { TURN_MS, cameraDistance } from "../../engine/camera";
import { block, capable, glossy, hop, planks, travel } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BEAM_Y, BOARD_THICK, BUTTON, RIM, cellAt, eyeOf, laserSubject, orbitOf, turnButton } from "./layout";
import { CELLS, COLS, DC, DEFLECTOR, DR, KING, LASER, RESERVED, ROWS, SHIELD, SWITCH, TURN_LEFT, TURN_RIGHT, colOf, dirOf, kindOf, rowOf, sideOf, type Shot, type State } from "./rules";

/** The two sides' metals (brushed silver, warm gold) and the colours of their beams (blue, red). */
export const METAL_COLORS: [string, string] = ["#cfd4dc", "#d9a441"];
export const BEAM_COLORS: [string, string] = ["#38a6ff", "#ff3a36"];
type Own = <R extends { dispose(): void }>(resource: R) => R;
const smooth = (u: number) => u * u * (3 - 2 * u);
/** A short sequence of numbers that is the same every time (the shards of a piece, the specks of the stone). */
const sequence = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};
/** Pixels a square on the board's painted top. */
const PX = 96;
/** The painted top of the board: polished dark stone with its squares, and a map of what glows (the grid, the reserved squares). */
function boardFace(own: Own) {
  const w = Math.round((COLS + 2 * RIM) * PX),
    h = Math.round((ROWS + 2 * RIM) * PX),
    [stone, s] = canvasOf(w, h),
    [glow, g] = canvasOf(w, h),
    rnd = sequence(31);
  s.fillStyle = "#15171c";
  s.fillRect(0, 0, w, h);
  // Clouds in the stone, then fine specks, then a few pale veins.
  for (let i = 0; i < 160; i++) {
    const x = rnd() * w,
      y = rnd() * h,
      r = 30 + rnd() * 140,
      grad = s.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rnd() < 0.5 ? "rgba(48,52,62,0.22)" : "rgba(6,7,9,0.28)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    s.fillStyle = grad;
    s.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 14000; i++) {
    const v = rnd();
    s.fillStyle = v < 0.45 ? "rgba(90,96,110,0.35)" : v < 0.8 ? "rgba(0,0,0,0.4)" : "rgba(170,178,192,0.25)";
    const size = rnd() < 0.85 ? 1 : 2;
    s.fillRect(rnd() * w, rnd() * h, size, size);
  }
  s.lineCap = "round";
  for (let i = 0; i < 11; i++) {
    s.strokeStyle = `rgba(175,185,200,${0.05 + rnd() * 0.08})`;
    s.lineWidth = 0.6 + rnd() * 1.6;
    s.beginPath();
    let x = rnd() * w,
      y = rnd() * h;
    s.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const nx = x + (rnd() - 0.5) * w * 0.5,
        ny = y + (rnd() - 0.5) * h * 0.5;
      s.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200, nx, ny);
      x = nx;
      y = ny;
    }
    s.stroke();
  }
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  const o = RIM * PX;
  for (let cell = 0; cell < CELLS; cell++) {
    const x = o + colOf(cell) * PX,
      y = o + rowOf(cell) * PX,
      owner = RESERVED[cell];
    // Every other square a shade lighter, so that the squares can be counted.
    if ((rowOf(cell) + colOf(cell)) % 2 === 0) {
      s.fillStyle = "rgba(255,255,255,0.025)";
      s.fillRect(x, y, PX, PX);
    }
    if (owner === null) continue;
    // A reserved square: tinted for its side, with our own mark in the middle (a lens in a diamond).
    const tint = owner === 0 ? "70,150,255" : "255,96,60";
    s.fillStyle = `rgba(${tint},0.13)`;
    s.fillRect(x, y, PX, PX);
    g.fillStyle = `rgba(${tint},0.12)`;
    g.fillRect(x, y, PX, PX);
    const cx = x + PX / 2,
      cy = y + PX / 2,
      d = PX * 0.2;
    for (const ctx of [s, g]) {
      ctx.strokeStyle = `rgba(${tint},${ctx === s ? 0.5 : 0.85})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(cx, cy, PX * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The grid: faint lines that glow, and a brighter frame round the squares.
  for (const ctx of [s, g]) {
    ctx.strokeStyle = ctx === s ? "rgba(140,190,235,0.22)" : "rgba(70,150,235,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(o + c * PX, o);
      ctx.lineTo(o + c * PX, o + ROWS * PX);
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.moveTo(o, o + r * PX);
      ctx.lineTo(o + COLS * PX, o + r * PX);
    }
    ctx.stroke();
    ctx.strokeStyle = ctx === s ? "rgba(200,212,228,0.5)" : "rgba(110,180,255,0.75)";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(o - 2, o - 2, COLS * PX + 4, ROWS * PX + 4);
  }
  const textures = [stone, glow].map((c) => {
    const t = own(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
  return { map: textures[0], glow: textures[1] };
}
/** Fine streaks of brushed metal, laid over a side's colour. */
function brushed(own: Own) {
  const [c, ctx] = canvasOf(256, 256),
    rnd = sequence(5);
  ctx.fillStyle = "#e4e4e4";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 200 + Math.floor(rnd() * 55);
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`;
    ctx.lineWidth = rnd() < 0.8 ? 0.6 : 1.2;
    const y = rnd() * 256,
      x = rnd() * 256,
      length = 30 + rnd() * 200;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (rnd() - 0.5) * 1.5);
    ctx.stroke();
  }
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** The face of a mirror: pale cyan glass darkening downward, with two bright streaks across it. */
function mirrorSheen(own: Own) {
  const [c, ctx] = canvasOf(256, 128),
    grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#e9fbff");
  grad.addColorStop(0.45, "#9fdcff");
  grad.addColorStop(1, "#3f8fd0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  for (const [x, w] of [
    [60, 26],
    [104, 9],
    [190, 14],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + w, 0);
    ctx.lineTo(x + w - 46, 128);
    ctx.lineTo(x - 46, 128);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 5;
  ctx.strokeRect(2, 2, 252, 124);
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A soft round glow, for the beam's head and a burst. */
function glowTexture(own: Own) {
  const [c, ctx] = canvasOf(128, 128),
    grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return own(new T.CanvasTexture(c));
}
/** A round button with a curved arrow: against the clock (`left`) or with it. */
function buttonTexture(own: Own, left: boolean) {
  const [c, ctx] = canvasOf(128, 128);
  ctx.fillStyle = "rgba(14,20,30,0.88)";
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffe3a0";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.save();
  ctx.translate(64, 64);
  if (left) ctx.scale(-1, 1);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  const r = 30,
    from = -Math.PI * 0.85,
    to = Math.PI * 0.45;
  ctx.beginPath();
  ctx.arc(0, 0, r, from, to);
  ctx.stroke();
  // The arrowhead at the end the arrow turns toward (with the clock, seen from above).
  const ex = Math.cos(to) * r,
    ey = Math.sin(to) * r;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(ex - 20, ey + 2);
  ctx.lineTo(ex + 14, ey - 14);
  ctx.lineTo(ex + 8, ey + 22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A flat square outline lying on the board (the keyboard's place, the last move). */
function squareRing(own: Own, half: number, width: number, color: string, opacity: number) {
  const shape = new T.Shape().moveTo(-half, -half).lineTo(half, -half).lineTo(half, half).lineTo(-half, half).lineTo(-half, -half),
    hole = new T.Path().moveTo(-half + width, -half + width).lineTo(-half + width, half - width).lineTo(half - width, half - width).lineTo(half - width, -half + width).lineTo(-half + width, -half + width);
  shape.holes.push(hole);
  const mesh = new T.Mesh(own(new T.ShapeGeometry(shape).rotateX(-Math.PI / 2)), own(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })));
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}

/** Shapes and paints of the pieces, made once a view and shared by every piece. */
interface Kit {
  metal: [T.MeshStandardMaterial, T.MeshStandardMaterial];
  glass: T.Material;
  obsidian: T.Material;
  light: [T.Material, T.Material];
  plinth: T.BufferGeometry;
  prism: T.BufferGeometry;
  mirror: T.BufferGeometry;
  pane: T.BufferGeometry;
  rail: T.BufferGeometry;
  post: T.BufferGeometry;
  slab: T.BufferGeometry;
  strip: T.BufferGeometry;
  kingFoot: T.BufferGeometry;
  shaft: T.BufferGeometry;
  collar: T.BufferGeometry;
  spike: T.BufferGeometry;
  pyramidion: T.BufferGeometry;
  gem: T.BufferGeometry;
  turretFoot: T.BufferGeometry;
  band: T.BufferGeometry;
  housing: T.BufferGeometry;
  barrel: T.BufferGeometry;
  lens: T.BufferGeometry;
  lensRing: T.BufferGeometry;
  fin: T.BufferGeometry;
  shard: T.BufferGeometry;
}
const PLINTH = 0.07;
function kit(own: Own): Kit {
  const strong = capable(),
    streaks = brushed(own),
    metal = METAL_COLORS.map((color) => own(new T.MeshStandardMaterial({ color, map: streaks, metalness: strong ? 0.82 : 0.45, roughness: strong ? 0.3 : 0.38 }))) as [T.MeshStandardMaterial, T.MeshStandardMaterial];
  // The mirrors: silvered glass with a cold sheen across it, reflecting the room where a graphics card draws it, and
  // faintly lit so that a mirror face reads at a glance against the metal.
  const sheen = mirrorSheen(own),
    glass = own(
      strong
        ? new T.MeshPhysicalMaterial({ map: sheen, color: "#ffffff", metalness: 0.55, roughness: 0.04, envMapIntensity: 1.8, emissive: "#1c78b8", emissiveMap: sheen, emissiveIntensity: 0.55, clearcoat: 1, clearcoatRoughness: 0.04 })
        : new T.MeshStandardMaterial({ map: sheen, color: "#ffffff", metalness: 0.2, roughness: 0.1, emissive: "#2a8ad0", emissiveMap: sheen, emissiveIntensity: 0.6 }),
    );
  const obsidian = own(glossy({ color: "#0a0b0e", roughness: 0.2, metalness: 0.25 })),
    light = BEAM_COLORS.map((color) => own(new T.MeshBasicMaterial({ color, toneMapped: false })) as T.Material) as [T.Material, T.Material];
  // A deflector's body: the half of the square behind its mirror, which runs from the north-west corner to the
  // south-east one (its faces look north and east).
  const h = 0.36,
    tri = new T.Shape().moveTo(-h, h).lineTo(h, -h).lineTo(-h, -h).lineTo(-h, h),
    prism = new T.ExtrudeGeometry(tri, { depth: 0.46, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }).rotateX(-Math.PI / 2).translate(0, PLINTH + 0.02, 0);
  return {
    metal,
    glass,
    obsidian,
    light,
    plinth: own(block(0.8, PLINTH, 0.8, 0.025)),
    prism: own(prism),
    mirror: own(new T.BoxGeometry(1.04, 0.47, 0.024)),
    pane: own(new T.BoxGeometry(1.02, 0.46, 0.045)),
    rail: own(block(1.06, 0.04, 0.07, 0.015)),
    post: own(new T.CylinderGeometry(0.035, 0.035, 0.5, 12)),
    slab: own(block(0.78, 0.56, 0.2, 0.04)),
    strip: own(new T.PlaneGeometry(0.58, 0.028)),
    kingFoot: own(block(0.76, 0.12, 0.76, 0.035)),
    shaft: own(new T.CylinderGeometry(0.19, 0.3, 0.72, 4, 1).rotateY(Math.PI / 4)),
    collar: own(new T.CylinderGeometry(0.235, 0.235, 0.06, 4, 1).rotateY(Math.PI / 4)),
    spike: own(new T.ConeGeometry(0.045, 0.17, 10)),
    pyramidion: own(new T.ConeGeometry(0.19, 0.2, 4).rotateY(Math.PI / 4)),
    gem: own(new T.SphereGeometry(0.075, 20, 14)),
    turretFoot: own(new T.CylinderGeometry(0.38, 0.42, 0.1, 40)),
    band: own(new T.TorusGeometry(0.4, 0.013, 8, 48).rotateX(Math.PI / 2)),
    housing: own(block(0.5, 0.3, 0.44, 0.06)),
    barrel: own(new T.CylinderGeometry(0.085, 0.105, 0.34, 24).rotateX(Math.PI / 2)),
    lens: own(new T.CircleGeometry(0.07, 24).rotateY(Math.PI)),
    lensRing: own(new T.TorusGeometry(0.086, 0.015, 8, 28)),
    fin: own(block(0.42, 0.24, 0.035, 0.01)),
    shard: own(new T.TetrahedronGeometry(0.075)),
  };
}
const mesh = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x = 0, y = 0, z = 0) => {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
};
/** One piece as a group standing on its square's middle, built facing north (`dir` 0) and turned to its facing. */
function figure(k: Kit, p: number) {
  const group = new T.Group(),
    side = sideOf(p),
    kind = kindOf(p),
    metal = k.metal[side];
  if (kind !== LASER && kind !== KING) group.add(mesh(k.plinth, metal, 0, PLINTH / 2, 0));
  if (kind === DEFLECTOR) {
    group.add(mesh(k.prism, metal));
    // The mirror over the long face, looking north-east (its outer face is the box's −z face once turned).
    const mirror = mesh(k.mirror, [metal, metal, metal, metal, k.glass, k.glass], 0.016, PLINTH + 0.25, -0.016);
    mirror.rotation.y = -Math.PI / 4;
    group.add(mirror);
  } else if (kind === SWITCH) {
    const pane = new T.Group();
    pane.rotation.y = -Math.PI / 4;
    pane.add(mesh(k.pane, [metal, metal, metal, metal, k.glass, k.glass], 0, PLINTH + 0.25, 0));
    pane.add(mesh(k.rail, metal, 0, PLINTH + 0.5, 0));
    for (const x of [-0.53, 0.53]) pane.add(mesh(k.post, metal, x, PLINTH + 0.25, 0));
    group.add(pane);
  } else if (kind === SHIELD) {
    // A slab whose dark front faces north; a thin line of its side's light runs across the front.
    group.add(mesh(k.slab, [metal, metal, metal, metal, metal, k.obsidian], 0, PLINTH + 0.28, 0.08));
    const strip = new T.Mesh(k.strip, k.light[side]);
    strip.position.set(0, PLINTH + 0.47, 0.08 - 0.101);
    strip.rotation.y = Math.PI;
    group.add(strip);
  } else if (kind === KING) {
    group.add(mesh(k.kingFoot, metal, 0, 0.06, 0));
    group.add(mesh(k.shaft, metal, 0, 0.48, 0));
    group.add(mesh(k.collar, metal, 0, 0.87, 0));
    // A crown of eight points round the pyramidion: four at the corners, four between them.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        r = i % 2 ? 0.15 : 0.19,
        spike = mesh(k.spike, metal, Math.cos(a) * r, i % 2 ? 0.96 : 0.98, Math.sin(a) * r);
      if (i % 2) spike.scale.setScalar(0.75);
      group.add(spike);
    }
    group.add(mesh(k.pyramidion, metal, 0, 1.0, 0));
    group.add(mesh(k.gem, k.light[side], 0, 1.13, 0));
  } else if (kind === LASER) {
    group.add(mesh(k.turretFoot, metal, 0, 0.05, 0));
    const band = new T.Mesh(k.band, k.light[side]);
    band.position.y = 0.075;
    group.add(band);
    group.add(mesh(k.housing, metal, 0, 0.27, 0.02));
    group.add(mesh(k.barrel, metal, 0, BEAM_Y, -0.3));
    const lens = new T.Mesh(k.lens, k.light[side]);
    lens.position.set(0, BEAM_Y, -0.472);
    group.add(lens);
    group.add(mesh(k.lensRing, metal, 0, BEAM_Y, -0.47));
    for (const z of [0.16, 0.22, 0.28]) group.add(mesh(k.fin, metal, 0, 0.34, z));
  }
  group.rotation.y = -dirOf(p) * (Math.PI / 2);
  return group;
}
/** How far short of a square's middle a beam stops at the piece it meets there. */
const stopShort = (p: number, end: Shot["end"]) => {
  const kind = kindOf(p);
  if (kind === LASER) return 0.4;
  if (kind === SHIELD) return end === "block" ? 0.03 : 0.12;
  if (kind === KING) return 0.24;
  return 0.34;
};
const way = (a: number, b: number) => {
  const dr = rowOf(b) - rowOf(a),
    dc = colOf(b) - colOf(a);
  return dr < 0 ? 0 : dc > 0 ? 1 : dr > 0 ? 2 : 3;
};
const at = (cell: number, y = BEAM_Y) => {
  const p = cellAt(cell);
  return new T.Vector3(p.x, y, p.z);
};
const stepOf = (d: number) => new T.Vector3(DC[d], 0, DR[d]);
/** The beam as a line through the points where it turns, from the laser's lens to where it ends; `board` is the board it was fired on. */
export function beamPoints(shot: Shot, board: number[]) {
  const path = shot.path,
    first = path.length > 1 ? way(path[0], path[1]) : shot.dir,
    points = [at(path[0]).add(stepOf(first).multiplyScalar(0.47))];
  for (let i = 1; i < path.length - 1; i++) if (way(path[i - 1], path[i]) !== way(path[i], path[i + 1])) points.push(at(path[i]));
  const last = path[path.length - 1],
    into = path.length > 1 ? way(path[path.length - 2], last) : first;
  if (shot.end === "off") {
    if (path.length > 1 && into !== shot.dir) points.push(at(last));
    points.push(at(last).add(stepOf(shot.dir).multiplyScalar(0.5 + RIM * 0.8)));
  } else points.push(at(last).sub(stepOf(into).multiplyScalar(stopShort(board[last], shot.end))));
  return points;
}

/**
 * The table of 레이저 체스: a board of dark polished stone with a faint glowing grid, its reserved squares tinted
 * for their sides, on a dark table; pieces of brushed silver and warm gold with real mirror faces. After every turn
 * the mover's beam is drawn as a glowing line that bends at the mirrors; a piece it takes bursts apart, and the
 * beam fades. A tap picks a piece (its moves are shown as dots, a switch's swaps as rings, and two turn buttons
 * stand over it) and a tap on a dot or a button plays the move. With two at one screen the table turns to the one
 * to move, as in chess (`data-facing` on the board).
 */
export class LaserView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private k: Kit;
  private root = new T.Group();
  private pieces = new Map<number, T.Group>();
  private beam = new T.Group();
  private beamMats: { core: T.MeshBasicMaterial; glow: T.MeshBasicMaterial; flare: T.SpriteMaterial }[];
  private segments: { core: T.Mesh; glow: T.Mesh }[] = [];
  private tube: T.BufferGeometry;
  private flare: T.Sprite;
  private flash: T.Sprite;
  private shards = new T.Group();
  private buttons: [T.Sprite, T.Sprite];
  private selectedRing: T.Mesh;
  private cursorMark: T.Mesh;
  private lastMarks: [T.Mesh, T.Mesh];
  private dots: T.Mesh[] = [];
  private swaps: T.Mesh[] = [];
  private caster = new T.Raycaster();
  private facing: 0 | 1 = 0;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    readonly mode: "local" | "ai",
  ) {
    super(host, quality, "#090c12");
    const keep: Own = (r) => this.own(r);
    this.k = kit(keep);
    // A cool light from nearly overhead and the room's bounce. The polished stone mirrors whatever lamp stands at the
    // height of the eye, so the sun stands high: the table is turned to either side, and from neither does it glare.
    this.daylight("#dbe6ff", "#1b1d24", "#fff6ea", 7.5, 2.4).position.set(-2.2, 15, 1.2);
    // The table: dark wood, larger than the view.
    const table = this.add(block(32, 0.6, 18, 0.12), this.standard({ ...planks(4, keep, 2.25), color: "#7d828c" }), 0, -BOARD_THICK - 0.3, 0);
    table.castShadow = false;
    // The board: a slab of dark polished stone, its top painted with the squares, with a thin cold light under its edge.
    const face = boardFace(keep),
      top = this.own(glossy({ map: face.map, emissiveMap: face.glow, emissive: "#ffffff", emissiveIntensity: 0.9, roughness: 0.34, metalness: 0.05 }, 0.5)),
      sides = this.standard({ color: "#17191e", roughness: 0.28, metalness: 0.1 }),
      W = COLS + 2 * RIM,
      D = ROWS + 2 * RIM;
    this.add(block(W, BOARD_THICK, D, 0.07), [sides, sides, top, sides, sides, sides], 0, -BOARD_THICK / 2, 0);
    const strip = this.own(new T.MeshBasicMaterial({ color: "#2f7fd8", transparent: true, opacity: 0.55, toneMapped: false }));
    for (const [w, d, x, z] of [
      [W + 0.08, 0.04, 0, D / 2 + 0.02],
      [W + 0.08, 0.04, 0, -D / 2 - 0.02],
      [0.04, D + 0.08, W / 2 + 0.02, 0],
      [0.04, D + 0.08, -W / 2 - 0.02, 0],
    ]) {
      const glow = new T.Mesh(this.own(new T.BoxGeometry(w, 0.025, d)), strip);
      glow.position.set(x, -BOARD_THICK + 0.012, z);
      this.scene.add(glow);
    }
    this.scene.add(this.root, this.beam, this.shards);
    // The beam: a bright core in a soft glow, one pair a straight stretch, and a flare at its head.
    this.tube = this.own(new T.CylinderGeometry(1, 1, 1, 10, 1, true));
    const soft = glowTexture(keep);
    this.beamMats = BEAM_COLORS.map((color) => ({
      core: this.own(new T.MeshBasicMaterial({ color: new T.Color(color).lerp(new T.Color("#ffffff"), 0.6), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })),
      glow: this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })),
      flare: this.own(new T.SpriteMaterial({ map: soft, color, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })),
    }));
    this.flare = new T.Sprite(this.beamMats[0].flare);
    this.flare.visible = false;
    this.flash = new T.Sprite(this.own(new T.SpriteMaterial({ map: soft, color: "#fff1d6", transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })));
    this.flash.visible = false;
    this.scene.add(this.flare, this.flash);
    // The marks: the piece picked up, where it may go, the switches' swaps, the keyboard's place and the last move.
    this.selectedRing = ringMesh(keep, 0.42, 0.5, "#ffe39a");
    this.cursorMark = squareRing(keep, 0.48, 0.05, "#ffffff", 0.85);
    this.lastMarks = [squareRing(keep, 0.47, 0.035, "#8fc6ff", 0.6), squareRing(keep, 0.47, 0.035, "#8fc6ff", 0.6)];
    this.scene.add(this.selectedRing, this.cursorMark, ...this.lastMarks);
    this.buttons = [true, false].map((left) => {
      const sprite = new T.Sprite(this.own(new T.SpriteMaterial({ map: buttonTexture(keep, left), depthTest: false, depthWrite: false, toneMapped: false })));
      sprite.scale.set(BUTTON.radius * 2, BUTTON.radius * 2, 1);
      sprite.renderOrder = 10;
      sprite.visible = false;
      sprite.userData.point = left ? TURN_LEFT : TURN_RIGHT;
      this.scene.add(sprite);
      return sprite;
    }) as [T.Sprite, T.Sprite];
    this.host.dataset.facing = "0";
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    return laserSubject(aspect);
  }
  /** Sets the camera at an angle round the table, as `resize` does for `orbit`, the view moved as `viewShift` asks. */
  private aimAt(angle: number) {
    const aspect = this.camera.aspect,
      { eye, target } = eyeOf(aspect, angle, cameraDistance(aspect, false, this.subject(aspect)));
    this.camera.position.set(eye.x, eye.y, eye.z);
    this.camera.lookAt(target.x, target.y, target.z);
    this.redraw();
  }
  protected resize() {
    super.resize();
    if (!this.disposed && this.host.clientWidth && this.host.clientHeight) this.aimAt(this.orbit);
  }
  /** Which side the table should face in `state`: the one to move with two at the screen, the silver side against the computer. */
  private facingFor(state: State) {
    if (this.mode !== "local") return 0;
    return state.winner === null ? state.turn : this.facing;
  }
  private face(side: 0 | 1) {
    this.facing = side;
    this.orbit = orbitOf(side);
    this.host.dataset.facing = String(side);
    this.aimAt(this.orbit);
  }
  protected spots(): Spot[] {
    const out: Spot[] = [];
    for (let cell = 0; cell < CELLS; cell++) {
      const p = cellAt(cell);
      out.push({ x: p.x, y: 0, z: p.z, r: 0.5, point: cell });
    }
    for (const button of this.buttons) if (button.visible) out.push({ x: button.position.x, y: button.position.y, z: button.position.z, r: BUTTON.radius, point: button.userData.point });
    return out;
  }
  /** A turn button under the pointer, else the piece it strikes; otherwise the square, from the spots. */
  protected pick(ray: T.Ray) {
    for (const button of this.buttons) if (button.visible && ray.distanceToPoint(button.position) <= BUTTON.radius) return button.userData.point as number;
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObject(this.root, true)[0];
    if (!hit) return null;
    let thing: T.Object3D | null = hit.object;
    while (thing && thing.parent !== this.root) thing = thing.parent;
    return typeof thing?.userData.cell === "number" ? (thing.userData.cell as number) : null;
  }
  /** Lays the pieces of `board` on their squares. */
  private lay(board: number[]) {
    this.root.clear();
    this.pieces.clear();
    board.forEach((p, cell) => {
      if (!p) return;
      const group = figure(this.k, p),
        where = cellAt(cell);
      group.position.set(where.x, 0, where.z);
      group.userData.cell = cell;
      this.root.add(group);
      this.pieces.set(cell, group);
    });
  }
  /** Shows the beam of `shot` up to `length` along it, at `strength` (1 full, 0 gone); its head flares while it runs. */
  private showBeam(points: T.Vector3[], side: 0 | 1, length: number, strength: number, head: boolean) {
    const mats = this.beamMats[side];
    mats.core.opacity = strength;
    mats.glow.opacity = 0.55 * strength;
    let gone = 0,
      used = 0;
    const up = new T.Vector3(0, 1, 0);
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i],
        b = points[i + 1],
        span = a.distanceTo(b),
        shown = Math.min(span, length - gone);
      gone += span;
      if (shown <= 0.001) break;
      if (this.segments.length <= used) {
        const core = new T.Mesh(this.tube, mats.core),
          glow = new T.Mesh(this.tube, mats.glow);
        core.renderOrder = glow.renderOrder = 6;
        this.beam.add(core, glow);
        this.segments.push({ core, glow });
      }
      const seg = this.segments[used++],
        dir = b.clone().sub(a).normalize(),
        mid = a.clone().addScaledVector(dir, shown / 2);
      for (const [m, r, mat] of [
        [seg.core, 0.022, mats.core],
        [seg.glow, 0.085, mats.glow],
      ] as const) {
        m.material = mat;
        m.position.copy(mid);
        m.quaternion.setFromUnitVectors(up, dir);
        m.scale.set(r, shown, r);
        m.visible = true;
      }
      if (head) {
        this.flare.material = mats.flare;
        this.flare.position.copy(a).addScaledVector(dir, shown);
      }
    }
    for (let i = used; i < this.segments.length; i++) this.segments[i].core.visible = this.segments[i].glow.visible = false;
    this.flare.visible = head && strength > 0;
    this.flare.scale.setScalar(0.55);
    this.redraw();
  }
  private hideBeam() {
    for (const seg of this.segments) seg.core.visible = seg.glow.visible = false;
    this.flare.visible = this.flash.visible = false;
  }
  /** The board as it stood after the move, before its shot took anything. */
  private static afterMove(state: State) {
    const board = state.board.slice(),
      shot = state.last?.shot;
    if (shot?.end === "take") board[shot.path[shot.path.length - 1]] = shot.taken;
    return board;
  }
  protected place(state: State) {
    this.calm();
    this.lay(state.board);
    this.hideBeam();
    const want = this.facingFor(state);
    if (want !== this.facing) this.face(want);
    else this.host.dataset.facing = String(this.facing);
    const canvas = this.renderer.domElement,
      shot = state.last?.shot;
    canvas.dataset.shot = shot?.end ?? "";
    canvas.dataset.beam = String(shot?.path.length ?? 0);
    canvas.dataset.lost = `${state.lost[0].length},${state.lost[1].length}`;
    canvas.dataset.ply = String(state.ply);
    this.showLast(state);
    this.mark(this.marks);
  }
  /** Faint outlines on the squares the last move came from and went to, in the mover's colour. */
  private showLast(state: State) {
    const last = state.last;
    const cells = !last ? [] : last.move.to >= CELLS ? [last.move.from] : [last.move.from, last.move.to];
    this.lastMarks.forEach((mark, i) => {
      const cell = cells[i];
      mark.userData.on = cell !== undefined;
      mark.visible = cell !== undefined && !capturing();
      if (cell === undefined) return;
      const p = cellAt(cell);
      mark.position.set(p.x, 0.004, p.z);
      (mark.material as T.MeshBasicMaterial).color.set(BEAM_COLORS[last!.side]).lerp(new T.Color("#ffffff"), 0.35);
    });
  }
  private shardsLive: { mesh: T.Mesh; v: T.Vector3; spin: T.Vector3; from: T.Vector3 }[] = [];
  /** Takes away a burst still flying. */
  private calm() {
    this.shards.clear();
    this.shardsLive = [];
  }
  /** A piece bursting apart at `where`: shards of its metal and glass fly out from where the beam struck, and a flash. */
  private burst(group: T.Group, p: number, from: T.Vector3, seed: number) {
    group.visible = false;
    const rnd = sequence(seed),
      centre = group.position.clone().setY(0.3),
      away = centre.clone().sub(from).setY(0).normalize();
    for (let i = 0; i < 18; i++) {
      const glassy = i % 4 === 0 && kindOf(p) !== KING && kindOf(p) !== SHIELD,
        m = new T.Mesh(this.k.shard, glassy ? this.k.glass : kindOf(p) === SHIELD && i % 3 === 0 ? this.k.obsidian : this.k.metal[sideOf(p)]);
      m.castShadow = true;
      const start = centre.clone().add(new T.Vector3((rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4));
      m.position.copy(start);
      m.scale.setScalar(0.6 + rnd() * 0.9);
      this.shards.add(m);
      const v = away
        .clone()
        .multiplyScalar(0.8 + rnd() * 1.6)
        .add(new T.Vector3((rnd() - 0.5) * 2.6, 1.2 + rnd() * 2.4, (rnd() - 0.5) * 2.6));
      this.shardsLive.push({ mesh: m, v, spin: new T.Vector3(rnd() * 14 - 7, rnd() * 14 - 7, rnd() * 14 - 7), from: start });
    }
    this.flash.position.copy(centre);
    this.flash.visible = true;
  }
  private flyShards(p: number) {
    const t = p * 0.8;
    for (const s of this.shardsLive) {
      const y = s.from.y + s.v.y * t - 4.5 * t * t;
      s.mesh.position.set(s.from.x + s.v.x * t, Math.max(0.03, y), s.from.z + s.v.z * t);
      s.mesh.rotation.set(s.spin.x * t, s.spin.y * t, s.spin.z * t);
      s.mesh.visible = p < 0.98;
      if (p > 0.7) s.mesh.scale.multiplyScalar(0.94);
    }
    const f = Math.min(1, p * 4);
    this.flash.scale.setScalar(0.4 + 1.8 * f);
    (this.flash.material as T.SpriteMaterial).opacity = Math.max(0, 1 - p * 2.2);
    this.flash.visible = p < 0.46;
    this.redraw();
  }
  /** Runs `fn` once, `delay` milliseconds from now, in the animation's own time. */
  private when(delay: number, fn: () => void) {
    let done = false;
    this.tween(delay, 1, () => {
      if (done) return;
      done = true;
      fn();
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    const { move } = last,
      piece = this.pieces.get(move.from);
    if (!piece) return false;
    // The pieces where they will stand once the move is made.
    const after = new Map(this.pieces);
    let moveTime = 340;
    if (move.to >= CELLS) {
      // A quarter turn (a switch shows its turn the way it was asked for), lifted a little as it turns.
      const from = piece.rotation.y,
        to = from + (move.to === TURN_RIGHT ? -1 : 1) * (Math.PI / 2);
      moveTime = 320;
      this.tween(0, moveTime, (p) => {
        const u = smooth(p);
        piece.rotation.y = from + (to - from) * u;
        piece.position.y = 0.06 * Math.sin(Math.PI * p);
        this.redraw();
      });
    } else {
      const other = this.pieces.get(move.to),
        a = piece.position.clone(),
        b = other ? other.position.clone() : (() => {
          const p = cellAt(move.to);
          return new T.Vector3(p.x, 0, p.z);
        })();
      after.delete(move.from);
      after.set(move.to, piece);
      if (other) after.set(move.from, other);
      this.tween(0, moveTime, (p) => {
        const u = travel(p);
        piece.position.set(a.x + (b.x - a.x) * u, (other ? 0.55 : 0.28) * hop(p), a.z + (b.z - a.z) * u);
        // A swap: the other piece slides under the switch as it hops over.
        if (other) other.position.set(b.x + (a.x - b.x) * smooth(p), 0, b.z + (a.z - b.z) * smooth(p));
        this.redraw();
      });
    }
    this.when(moveTime * 0.84, () => this.onContact());
    // The shot: the beam runs out from the lens, holds a moment, then fades; a piece it takes bursts where it is struck.
    const shot = last.shot,
      board = LaserView.afterMove(state),
      points = beamPoints(shot, board),
      length = points.reduce((sum, p, i) => (i ? sum + p.distanceTo(points[i - 1]) : 0), 0),
      fire = moveTime + 90,
      run = Math.min(700, 160 + length * 34),
      hold = 380,
      fade = 460;
    this.when(fire, () => this.onKnock?.("disc", 1));
    this.tween(fire, run, (p) => this.showBeam(points, shot.side, length * p, 1, p < 1));
    if (shot.end === "take") {
      const hitCell = shot.path[shot.path.length - 1],
        target = after.get(hitCell),
        from = points[points.length - 2];
      if (target)
        this.tween(fire + run, 820, (p) => {
          if (!this.shardsLive.length && p < 1) {
            this.burst(target, shot.taken, from, state.ply * 7 + 3);
            this.onKnock?.("pocket", 1);
          }
          this.flyShards(p);
        });
    } else if (shot.end === "block") this.when(fire + run, () => this.onKnock?.("cushion", 0.6));
    this.tween(fire + run + hold, fade, (p) => this.showBeam(points, shot.side, Infinity, 1 - p, false));
    let end = fire + run + Math.max(hold + fade, shot.end === "take" ? 820 : 0);
    // Two at one screen: once the shot is over the table turns to the one to move now.
    const want = this.facingFor(state);
    if (want !== this.facing) {
      const from = orbitOf(this.facing),
        to = from + Math.PI;
      this.tween(end + 120, TURN_MS, (p) => {
        this.aimAt(from + (to - from) * smooth(p));
        if (p >= 1) this.face(want);
        this.redraw();
      });
      end += 120 + TURN_MS;
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      board = state?.board ?? [],
      selected = marks.selected,
      targets = marks.targets.filter((t) => t < CELLS),
      onSquare = (m: T.Object3D, cell: number, y = 0.006) => {
        const p = cellAt(cell);
        m.position.set(p.x, y, p.z);
        m.visible = true;
      };
    this.selectedRing.visible = false;
    if (selected !== null && selected < CELLS) onSquare(this.selectedRing, selected);
    const empty = targets.filter((t) => !board[t]),
      full = targets.filter((t) => board[t]);
    while (this.dots.length < empty.length) {
      const dot = ringMesh((r) => this.own(r), 0, 0.12, "#c4f0ff");
      this.dots.push(dot);
      this.scene.add(dot);
    }
    while (this.swaps.length < full.length) {
      const ring = ringMesh((r) => this.own(r), 0.4, 0.47, "#ffc75a");
      this.swaps.push(ring);
      this.scene.add(ring);
    }
    this.dots.forEach((dot, i) => (i < empty.length ? onSquare(dot, empty[i]) : (dot.visible = false)));
    this.swaps.forEach((ring, i) => (i < full.length ? onSquare(ring, full[i], 0.09) : (ring.visible = false)));
    // The turn buttons over the piece picked up, at the hands of the one who faces it.
    for (const button of this.buttons) {
      const shown = selected !== null && selected < CELLS && marks.targets.includes(button.userData.point);
      button.visible = shown;
      if (!shown) continue;
      const where = turnButton(selected!, button.userData.point === TURN_LEFT, this.facing);
      button.position.set(where.x, where.y, where.z);
    }
    this.cursorMark.visible = false;
    if (marks.cursor !== null && marks.cursor < CELLS) onSquare(this.cursorMark, marks.cursor, 0.008);
    // A picture of the table (the capture sets its flag once the moves are made) keeps the last beam lit and leaves
    // out the outlines of the last move.
    const shot = state?.last?.shot;
    for (const mark of this.lastMarks) mark.visible = !!mark.userData.on && !capturing();
    if (state && shot && capturing() && !this.animating) this.showBeam(beamPoints(shot, LaserView.afterMove(state)), shot.side, Infinity, 1, false);
    this.redraw();
  }
  dispose() {
    this.calm();
    super.dispose();
  }
}
