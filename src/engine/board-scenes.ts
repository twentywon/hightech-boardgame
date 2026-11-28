import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, planks, weave, wood } from "./scene-utils";

/**
 * What gomoku and Reversi are made of and where they are played (both drawn by `BoardView`): gomoku's biconvex
 * slate and shell stones, its thick board on four legs in a quiet ondol room with a bowl of stones at each side;
 * Reversi's two-coloured discs on a felt board in a raised walnut frame, on a study desk. All in code.
 */

/** Registers a resource with the view that must dispose it. */
type Own = <R extends { dispose(): void }>(resource: R) => R;

function paint(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function picture(c: HTMLCanvasElement, colour = true, repeat = 1) {
  const t = new T.CanvasTexture(c);
  if (colour) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}
function noise(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** Texture coordinates seen from above, so that a picture lies across the face of a turned thing. */
function planar(geometry: T.BufferGeometry, radius: number) {
  const at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, 0.5 + at.getX(i) / (2 * radius), 0.5 + at.getZ(i) / (2 * radius));
  uv.needsUpdate = true;
  return geometry;
}

/** Gomoku's stone: two shallow domes meeting at a softly rounded edge, `radius` across and `half` thick each way. */
export function lensGeometry(radius: number, half: number, segments = 28, steps = 14) {
  const points: T.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    // Points crowd toward the rim, where the curve turns fastest.
    const s = (i / steps) * 2 - 1,
      theta = Math.sign(s) * (Math.PI / 2) * Math.abs(s) ** 1.6,
      x = radius * Math.cos(theta),
      y = half * Math.sign(theta) * Math.abs(Math.sin(theta)) ** 1.25;
    points.push(new T.Vector2(Math.max(0, i === 0 || i === steps ? 0 : x), y));
  }
  return planar(new T.LatheGeometry(points, segments), radius);
}
/**
 * A Reversi disc `radius` across and `half` thick each way, with a rounded rim: the upper half (group 0) and the
 * lower half (group 1) take their own colours, so that the rim shows both.
 */
export function discGeometry(radius: number, half: number, rim = 0.04, segments = 40) {
  const arc = (from: number, to: number, y: number) => {
    const list: T.Vector2[] = [];
    for (let i = 0; i <= 3; i++) {
      const a = from + ((to - from) * i) / 3;
      list.push(new T.Vector2(radius - rim + rim * Math.cos(a), y + rim * Math.sin(a)));
    }
    return list;
  };
  const top = [new T.Vector2(radius, 0), ...arc(0, Math.PI / 2, half - rim).slice(1), new T.Vector2(0, half)];
  const bottom = [new T.Vector2(0, -half), ...arc(-Math.PI / 2, 0, -half + rim).slice(0, -1), new T.Vector2(radius, 0)];
  const upper = new T.LatheGeometry(top, segments),
    lower = new T.LatheGeometry(bottom, segments),
    disc = mergeGeometries([upper, lower], true);
  upper.dispose();
  lower.dispose();
  return disc;
}
/** The shell of a white stone: faint bands of growth lying across its face (none without a page to paint in). */
export function shellMap(own: Own) {
  if (typeof document === "undefined") return null;
  const { c, ctx } = paint(256),
    rnd = noise(17);
  ctx.fillStyle = "#f6f2e8";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    const y = -40 + i * 7.4 + rnd() * 3,
      dark = rnd() < 0.5;
    ctx.strokeStyle = dark ? `rgba(150,132,104,${0.05 + rnd() * 0.07})` : `rgba(255,255,255,${0.2 + rnd() * 0.25})`;
    ctx.lineWidth = 1 + rnd() * 2.6;
    ctx.beginPath();
    // Wide arcs, as the lines of growth of a clam run.
    ctx.ellipse(128, y + 620, 720, 620, 0, Math.PI * 1.32, Math.PI * 1.68);
    ctx.stroke();
  }
  return own(picture(c));
}
/** A soft round spot of light, white in the middle and fading to nothing: legal-move dots and the winning line. */
export function softSpot(own: Own) {
  if (typeof document === "undefined") return own(new T.Texture());
  const { c, ctx } = paint(128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return own(picture(c));
}

const mesh = (parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = false) => {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = shadow;
  parent.add(m);
  return m;
};
/** A cushion: a rounded, squarish pillow `width` by `depth`, `height` high, its picture laid on from above. */
function pillow(own: Own, width: number, height: number, depth: number) {
  const geometry = own(new T.SphereGeometry(1, 48, 20)),
    at = geometry.getAttribute("position"),
    square = (v: number, k: number) => Math.sign(v) * Math.abs(v) ** k;
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      y = at.getY(i),
      z = at.getZ(i);
    // Square in plan, plump in the middle and thin toward the seam at its edge.
    at.setXYZ(i, (square(x, 0.22) * width) / 2, (square(y, 0.8) * height) / 2 * (1 - 0.35 * Math.max(Math.abs(x), Math.abs(z)) ** 3), (square(z, 0.22) * depth) / 2);
  }
  geometry.computeVertexNormals();
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, 0.5 + at.getX(i) / width, 0.5 - at.getZ(i) / depth);
  return geometry;
}
/** A turned wooden thing from its profile (radius, height). */
const lathe = (own: Own, profile: [number, number][], segments = 32) =>
  own(new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments));

/** The height of gomoku's board, from the floor to its face (the face is at y 0.15). */
export const GOMOKU_FLOOR = 0.15 - 1.45 - 1.05;

/**
 * Gomoku's board and room: a thick block of pale, finely grained wood on four turned legs, standing on the oiled
 * paper floor of an ondol room; a cushion behind it, a wooden bowl of stones and its upturned lid at each side
 * (black at the left, white at the right), a tea tray and an orchid farther off.
 */
export function gomokuRoom(scene: T.Object3D, own: Own, colours: [T.Material, T.Material]) {
  const floor = GOMOKU_FLOOR,
    // The stones in the bowls are seen small: a coarser shape of the same stone.
    stone = own(lensGeometry(0.19, 0.09, 14, 8));
  // The board: kaya-like pale wood with a polished edge.
  const kaya = own(glossy({ map: own(wood(false, 0.42)), color: "#ffe1a6", roughness: 0.46 }, 0.28));
  mesh(scene, own(block(6.55, 1.45, 6.55, 0.1, 3)), kaya, 0, 0.15 - 0.725, 0, true);
  // Its legs, turned like a gardenia's fruit, a shade darker.
  const leg = lathe(own, [[0, 0], [0.34, 0.02], [0.52, 0.22], [0.56, 0.42], [0.46, 0.66], [0.3, 0.84], [0.36, 0.96], [0.36, 1.05], [0, 1.05]], 24),
    legWood = own(new T.MeshStandardMaterial({ map: own(wood(false, 0.5)), color: "#e5bd7c", roughness: 0.5 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(scene, leg, legWood, sx * 2.35, floor, sz * 2.35, true);
  // The floor: sheets of oiled paper, amber and mottled, their edges overlapping.
  {
    const { c, ctx } = paint(1024),
      rnd = noise(5);
    ctx.fillStyle = "#b47c3c";
    ctx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * 1024,
        y = rnd() * 1024,
        r = 10 + rnd() * 60;
      ctx.fillStyle = rnd() < 0.5 ? `rgba(120,70,20,${0.03 + rnd() * 0.05})` : `rgba(255,226,160,${0.03 + rnd() * 0.06})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * (0.4 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Long faint fibres of the paper.
    for (let i = 0; i < 500; i++) {
      const x = rnd() * 1024,
        y = rnd() * 1024,
        a = rnd() * Math.PI;
      ctx.strokeStyle = `rgba(110,64,22,${0.04 + rnd() * 0.05})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * (8 + rnd() * 26), y + Math.sin(a) * (8 + rnd() * 26));
      ctx.stroke();
    }
    // The sheets overlap: a darker band, and a thin bright line where the upper sheet's edge catches the oil.
    for (const p of [0, 512]) {
      ctx.fillStyle = "rgba(112,62,18,0.2)";
      ctx.fillRect(p, 0, 10, 1024);
      ctx.fillRect(0, p, 1024, 10);
      ctx.fillStyle = "rgba(255,230,170,0.25)";
      ctx.fillRect(p + 10, 0, 2, 1024);
      ctx.fillRect(0, p + 10, 1024, 2);
    }
    const map = own(picture(c, true, 3.2));
    const ground = mesh(scene, own(new T.PlaneGeometry(64, 52)), own(new T.MeshStandardMaterial({ map, color: "#d9c3a6", roughness: 0.5 })), 0, floor, -6);
    ground.rotation.x = -Math.PI / 2;
  }
  // A cushion of jade silk behind the board, where the other player sits.
  {
    const { c, ctx } = paint(512);
    ctx.fillStyle = "#2f6f68";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "#c9a85a";
    ctx.lineWidth = 10;
    ctx.strokeRect(40, 40, 432, 432);
    ctx.lineWidth = 3;
    ctx.strokeRect(62, 62, 388, 388);
    // A round medallion in the middle: a ring of petals.
    ctx.translate(256, 256);
    ctx.strokeStyle = "#d9bd72";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.ellipse(0, -40, 12, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const silk = own(new T.MeshStandardMaterial({ map: own(picture(c)), roughness: 0.62 })),
      cushion = pillow(own, 6.8, 0.9, 6.8);
    mesh(scene, cushion, silk, 0, floor + 0.42, -9.6).rotation.y = 0.04;
    // My own, nearer, mostly out of sight below.
    mesh(scene, cushion, silk, 0, floor + 0.42, 8.6);
  }
  // A bowl at each side: turned jujube wood, lacquered, heaped with its stones; its lid upturned beside it.
  {
    const bowl = lathe(own, [[0, 0], [0.62, 0], [0.86, 0.1], [1.04, 0.38], [1.08, 0.7], [1.0, 1.02], [0.86, 1.22], [0.8, 1.24], [0.78, 1.18], [0.86, 1.02], [0.88, 0.9], [0.6, 0.86], [0, 0.84]], 40),
      lid = lathe(own, [[0, 0.02], [0.6, 0], [0.86, 0.06], [0.96, 0.2], [0.9, 0.22], [0.8, 0.12], [0.6, 0.08], [0, 0.1]], 40),
      jujube = own(glossy({ map: own(wood(true, 0.7)), color: "#c07a4c", roughness: 0.38 }, 0.6)),
      matrix = new T.Matrix4(),
      q = new T.Quaternion(),
      rnd = noise(41);
    for (const side of [0, 1] as const) {
      const x = side ? 4.75 : -4.75,
        z = 0.4;
      mesh(scene, bowl, jujube, x, floor, z, true);
      mesh(scene, lid, jujube, x + (side ? 0.6 : -0.6), floor, z - 2.3, true);
      // The stones heaped in it, a mound below the rim.
      const heap = new T.InstancedMesh(stone, colours[side], 30);
      for (let i = 0; i < 30; i++) {
        const ring = i < 1 ? 0 : i < 8 ? 0.32 : 0.62,
          a = i * 2.39996 + rnd(),
          y = 1.05 - ring * 0.2 + rnd() * 0.04;
        q.setFromEuler(new T.Euler((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7));
        matrix.compose(new T.Vector3(x + Math.cos(a) * ring, floor + y, z + Math.sin(a) * ring), q, new T.Vector3(1, 1, 1));
        heap.setMatrixAt(i, matrix);
      }
      heap.receiveShadow = true;
      scene.add(heap);
    }
  }
  // Farther off at the left, a tea tray: two celadon cups and a pot.
  {
    const tray = own(new T.MeshStandardMaterial({ map: own(wood(true, 0.6)), color: "#8a5a3c", roughness: 0.5 }));
    const tx = -10.1,
      tz = -2.4;
    mesh(scene, own(block(4.2, 0.22, 3.0, 0.08)), tray, tx, floor + 0.11, tz);
    const celadon = own(glossy({ color: "#9fbfa8", roughness: 0.25 }, 0.8)),
      cup = lathe(own, [[0, 0], [0.32, 0], [0.34, 0.06], [0.5, 0.38], [0.56, 0.62], [0.52, 0.62], [0.46, 0.4], [0, 0.12]], 28),
      pot = lathe(own, [[0, 0], [0.42, 0], [0.62, 0.16], [0.7, 0.42], [0.62, 0.7], [0.4, 0.82], [0.36, 0.86], [0.3, 0.9], [0.1, 0.94], [0.1, 1.06], [0.16, 1.1], [0, 1.14]], 28);
    mesh(scene, cup, celadon, tx - 1.1, floor + 0.22, tz + 0.7, true);
    mesh(scene, cup, celadon, tx + 0.1, floor + 0.22, tz + 0.85, true);
    const teapot = mesh(scene, pot, celadon, tx + 0.6, floor + 0.22, tz - 0.6, true);
    // Its spout and its handle.
    const spout = mesh(teapot, own(new T.CylinderGeometry(0.06, 0.12, 0.7, 12)), celadon, 0.78, 0.6, 0, true);
    spout.rotation.z = -0.8;
    const grip = mesh(teapot, own(new T.TorusGeometry(0.26, 0.05, 8, 20, Math.PI * 1.2)), celadon, -0.66, 0.48, 0, true);
    grip.rotation.z = Math.PI * 0.4;
  }
  // At the right, an orchid in a white porcelain pot.
  {
    const porcelain = own(glossy({ color: "#eef0ee", roughness: 0.2 }, 0.8)),
      pot = lathe(own, [[0, 0], [0.7, 0], [0.86, 0.3], [0.9, 1.2], [0.96, 1.3], [0.9, 1.32], [0, 1.2]], 32),
      x = 9.5,
      z = -0.4;
    mesh(scene, pot, porcelain, x, floor, z, true);
    const leafShape = own(new T.PlaneGeometry(0.16, 3.2, 1, 8)),
      at = leafShape.getAttribute("position");
    // A long blade, narrowing to its tip and arching over.
    for (let i = 0; i < at.count; i++) {
      const v = (at.getY(i) + 1.6) / 3.2;
      at.setX(i, at.getX(i) * (1 - v * 0.85));
      at.setY(i, Math.sin(v * 1.9) * 2.0);
      at.setZ(i, (1 - Math.cos(v * 1.9)) * 1.4);
    }
    leafShape.computeVertexNormals();
    const green = own(new T.MeshStandardMaterial({ color: "#3f6b2e", roughness: 0.6, side: T.DoubleSide }));
    for (let i = 0; i < 14; i++) {
      const leaf = mesh(scene, leafShape, green, x, floor + 1.22, z);
      leaf.rotation.y = i * 2.4 + 0.3;
      leaf.scale.set(1.3, 0.8 + ((i * 37) % 10) / 16, 0.8 + ((i * 53) % 10) / 14);
    }
    // A spray of pale flowers on a thin stalk.
    const stalk = mesh(scene, own(new T.CylinderGeometry(0.025, 0.03, 2.6, 6)), green, x - 0.3, floor + 2.4, z + 0.2);
    stalk.rotation.z = 0.25;
    const petal = own(new T.SphereGeometry(0.16, 10, 8)),
      bloom = own(new T.MeshStandardMaterial({ color: "#f3ead2", roughness: 0.6 }));
    for (let i = 0; i < 4; i++) mesh(scene, petal, bloom, x - 0.62 - i * 0.2, floor + 3.5 - i * 0.12, z + 0.2 + (i % 2) * 0.12).scale.set(1.3, 0.55, 1);
  }
}

/** The face of Reversi's board, in the frame: green felt ruled in black, with the four small dots. */
function feltMap(own: Own) {
  const size = 1024,
    { c, ctx } = paint(size),
    rnd = noise(9),
    cell = size / 8.0833; // 5.82 units of felt, 0.72 a square
  ctx.fillStyle = "#1d6a4c";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,30,20,${0.04 + rnd() * 0.05})` : `rgba(120,200,150,${0.025 + rnd() * 0.035})`;
    ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 10, 2 + rnd() * 10);
  }
  // A shade toward the frame.
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,20,12,0.25)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const at = (i: number) => size / 2 + (i - 4) * cell;
  ctx.strokeStyle = "rgba(8,26,18,0.92)";
  ctx.lineWidth = 3.2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(at(i), at(0));
    ctx.lineTo(at(i), at(8));
    ctx.moveTo(at(0), at(i));
    ctx.lineTo(at(8), at(i));
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(8,26,18,0.95)";
  for (const r of [2, 6])
    for (const k of [2, 6]) {
      ctx.beginPath();
      ctx.arc(at(k), at(r), 7, 0, Math.PI * 2);
      ctx.fill();
    }
  return own(picture(c));
}
/** Letters and numbers in gilt on the walnut frame, one picture laid over the whole board. */
function frameLabels(own: Own) {
  const size = 1024,
    { c, ctx } = paint(size),
    scale = size / 6.3;
  ctx.fillStyle = "rgba(226,190,112,0.95)";
  ctx.font = `600 ${Math.round(0.15 * scale)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 8; i++) {
    const v = ((i - 3.5) * 0.72 + 3.15) * scale,
      edge = (3.15 - 3.03) * scale;
    ctx.fillText(String.fromCharCode(65 + i), v, edge);
    ctx.fillText(String(i + 1), edge, v);
  }
  return own(picture(c));
}
/**
 * Reversi's board: a walnut base with a raised, lacquered frame round a green felt, the frame lettered in gilt.
 * The face of the felt is at y 0.18, its frame's top at 0.23; the board is 6.3 across.
 */
export function reversiBoard(scene: T.Object3D, own: Own, anisotropy: number) {
  const walnut = own(glossy({ map: own(wood(true, 0.75)), color: "#a8775a", roughness: 0.46 }, 0.6));
  mesh(scene, own(block(6.3, 0.42, 6.3, 0.07)), walnut, 0, 0.15 - 0.21, 0, true);
  const long = own(block(6.3, 0.08, 0.24, 0.035)),
    short = own(block(5.82, 0.08, 0.24, 0.035));
  for (const s of [-1, 1]) {
    mesh(scene, long, walnut, 0, 0.19, s * 3.03, true);
    mesh(scene, short, walnut, s * 3.03, 0.19, 0, true).rotation.y = Math.PI / 2;
  }
  const map = feltMap(own);
  map.anisotropy = anisotropy;
  mesh(scene, own(new T.BoxGeometry(5.82, 0.03, 5.82)), own(new T.MeshStandardMaterial({ map, roughness: 0.92, ...weave(5, 5, own, 0.6) })), 0, 0.165, 0);
  const labels = own(frameLabels(own));
  labels.anisotropy = anisotropy;
  const face = mesh(scene, own(new T.PlaneGeometry(6.3, 6.3)), own(new T.MeshBasicMaterial({ map: labels, transparent: true, depthWrite: false })), 0, 0.2315, 0);
  face.rotation.x = -Math.PI / 2;
}

/**
 * Reversi's study: a walnut desk with a leather writing pad under the board, a stack of books and a cup of tea at
 * the left, the box the discs are kept in, an inkwell and a pen at the right.
 */
export function reversiStudy(scene: T.Object3D, own: Own, colours: T.Material[]) {
  // The discs in their box are seen small: a coarser shape of the same disc.
  const disc = own(discGeometry(0.285, 0.0525, 0.04, 18));
  const top = -0.24;
  mesh(scene, own(new T.BoxGeometry(100, 0.2, 100)), own(new T.MeshStandardMaterial(planks(12, own))), 0, top - 0.1, 0);
  // The writing pad: oxblood leather with a tooled gilt line, on which the board lies.
  {
    const { c, ctx } = paint(1024, 820),
      rnd = noise(3);
    ctx.fillStyle = "#5e2620";
    ctx.fillRect(0, 0, 1024, 820);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rnd() < 0.5 ? `rgba(20,4,2,${0.05 + rnd() * 0.06})` : `rgba(160,80,60,${0.03 + rnd() * 0.04})`;
      ctx.beginPath();
      ctx.arc(rnd() * 1024, rnd() * 820, 1 + rnd() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(214,176,98,0.85)";
    ctx.lineWidth = 4;
    ctx.strokeRect(34, 34, 956, 752);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(46, 46, 932, 728);
    const pad = mesh(scene, own(block(10.4, 0.04, 8.3, 0.02)), own(new T.MeshStandardMaterial({ map: own(picture(c)), roughness: 0.62 })), 0, top + 0.02, 0.1);
    pad.castShadow = false;
  }
  // An inkwell and a pen lying by it.
  {
    const brass = own(new T.MeshStandardMaterial({ color: "#c79a4a", roughness: 0.3, metalness: 0.85 })),
      ink = own(glossy({ color: "#1d2a44", roughness: 0.12, transparent: true, opacity: 0.88 }, 1)),
      x = 7.0,
      z = 2.4;
    mesh(scene, own(block(0.95, 0.62, 0.95, 0.08)), ink, x, top + 0.31, z, true).rotation.y = 0.4;
    mesh(scene, lathe(own, [[0, 0], [0.26, 0], [0.26, 0.1], [0.3, 0.12], [0.3, 0.26], [0, 0.28]], 20), brass, x, top + 0.62, z, true);
    const black = own(glossy({ color: "#141414", roughness: 0.25 }, 1)),
      pen = new T.Group();
    pen.position.set(x - 1.3, top + 0.09, z + 0.3);
    pen.rotation.y = 1.05;
    scene.add(pen);
    mesh(pen, own(new T.CylinderGeometry(0.085, 0.085, 1.6, 16)), black, 0, 0, 0, true).rotation.z = Math.PI / 2;
    mesh(pen, own(new T.CylinderGeometry(0.09, 0.09, 0.08, 16)), brass, 0.25, 0, 0).rotation.z = Math.PI / 2;
    mesh(pen, own(new T.ConeGeometry(0.085, 0.32, 16)), brass, -0.96, 0, 0).rotation.z = Math.PI / 2;
  }
  // Books at the left, one lying across another.
  {
    const books: [string, number, number, number, number][] = [
      ["#2c3e5c", 3.0, 0.42, 2.1, 0.12],
      ["#6b2a22", 2.7, 0.36, 1.9, -0.2],
      ["#3d5a3a", 2.5, 0.3, 1.8, 0.35],
    ];
    let y = top;
    const paper = own(new T.MeshStandardMaterial({ color: "#efe6cf", roughness: 0.9 }));
    for (const [colour, w, h, d, turn] of books) {
      // Boards above and below and a spine, the block of pages a little inside them.
      const cloth = own(new T.MeshStandardMaterial({ color: colour, roughness: 0.7 })),
        book = new T.Group(),
        board = own(block(w, 0.05, d, 0.02));
      book.position.set(-8.2, y, 1.2);
      book.rotation.y = turn;
      scene.add(book);
      mesh(book, board, cloth, 0, 0.025, 0, true);
      mesh(book, board, cloth, 0, h - 0.025, 0, true);
      mesh(book, own(block(0.07, h, d, 0.03)), cloth, -w / 2 + 0.035, h / 2, 0, true);
      mesh(book, own(new T.BoxGeometry(w - 0.12, h - 0.09, d - 0.1)), paper, 0.02, h / 2, 0);
      y += h;
    }
  }
  // The box the discs are kept in: an open walnut tray of stacked discs.
  {
    const box = own(new T.MeshStandardMaterial({ map: own(wood(true, 0.6)), color: "#b88a66", roughness: 0.45 })),
      x = 8.7,
      z = -0.9,
      group = new T.Group();
    group.position.set(x, top, z);
    group.rotation.y = -0.25;
    scene.add(group);
    mesh(group, own(block(3.4, 0.08, 2.2, 0.03)), box, 0, 0.04, 0, true);
    const side = own(block(3.4, 0.4, 0.1, 0.03)),
      end = own(block(0.1, 0.4, 2.2, 0.03));
    for (const s of [-1, 1]) {
      mesh(group, side, box, 0, 0.24, s * 1.05, true);
      mesh(group, end, box, s * 1.65, 0.24, 0, true);
    }
    const stacks = new T.InstancedMesh(disc, colours, 24),
      m = new T.Matrix4(),
      q = new T.Quaternion();
    let n = 0;
    for (let col = 0; col < 4; col++)
      for (let row = 0; row < 2; row++)
        for (let k = 0; k < 3; k++) {
          q.setFromEuler(new T.Euler((col + row + k) % 2 ? Math.PI : 0, k * 0.4, 0));
          m.compose(new T.Vector3(-1.08 + col * 0.72, 0.135 + k * 0.106, -0.42 + row * 0.84), q, new T.Vector3(1, 1, 1));
          stacks.setMatrixAt(n++, m);
        }
    stacks.receiveShadow = true;
    group.add(stacks);
  }
  // A cup of tea on its saucer.
  {
    const china = own(glossy({ color: "#f4f1ea", roughness: 0.22 }, 0.8)),
      x = -8.8,
      z = -2.2;
    mesh(scene, lathe(own, [[0, 0], [0.55, 0], [0.8, 0.07], [0.84, 0.1], [0, 0.06]], 32), china, x, top, z, true);
    mesh(scene, lathe(own, [[0, 0.06], [0.3, 0.06], [0.42, 0.2], [0.52, 0.6], [0.55, 0.72], [0.5, 0.72], [0.47, 0.6], [0.38, 0.26], [0, 0.22]], 32), china, x, top, z, true);
    const tea = mesh(scene, own(new T.CircleGeometry(0.48, 28)), own(new T.MeshStandardMaterial({ color: "#7a3d12", roughness: 0.15 })), x, top + 0.6, z);
    tea.rotation.x = -Math.PI / 2;
    const handle = mesh(scene, own(new T.TorusGeometry(0.17, 0.045, 8, 20, Math.PI * 1.3)), china, x + 0.6, top + 0.44, z, true);
    handle.rotation.z = -Math.PI * 0.65;
  }
}
