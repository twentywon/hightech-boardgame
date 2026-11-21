import * as T from "three";
import { block, glossy, planks, wood } from "../../engine/scene-utils";
import { BOARD_TOP, BULB_Y, CELL, cellAt } from "./layout";

/*
 * The electrician's bench shared by bulb link and lights on: the plank bench and the workshop's light, the framed
 * pegboard, and the glass bulbs (clear glass, a coiled filament on two supports, a brass screw base) in black sockets,
 * dark when off and glowing warm when lit, with a halo and a pool of light on the board. Everything is modelled and
 * painted in code. It touches the page only when a view builds it (canvases for the pictures), so importing it is safe
 * where there is no page.
 */

type Keep = <R extends { dispose(): void }>(r: R) => R;
/** A sequence for scenery and the small differences between bulbs, the same every time. */
export const sequence = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
export const canvasOf = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
export const textureOf = (c: HTMLCanvasElement) => {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** How much larger than its model a bulb (with its socket) stands. */
export const BULB_SCALE = 1.45;
/** How long a bulb takes to come on (ms), flickering first. */
export const FLICKER_MS = 280;
/** The brightness of a bulb `p` of the way through coming on: a flicker before it holds steady. */
export const flickerOn = (p: number) => Math.min(1, p * 1.6) * (p < 0.55 ? (Math.sin(p * 46) > 0 ? 0.85 : 0.25) : 1);
/** The brightness of a bulb `p` of the way through going out: a stutter, then dark. */
export const flickerOff = (p: number) => (p < 0.4 ? (Math.sin(p * 50) > 0 ? 0.75 : 0.2) : Math.max(0, 1 - (p - 0.4) / 0.6) * 0.3);

/**
 * The pegboard's face for a board of `n`: tan hardboard with rows of small round holes between the sockets, a pencilled
 * cross under every socket's place and a little wear.
 */
export function pegboard(n: number, span: number) {
  const size = 1024,
    { c, ctx } = canvasOf(size),
    rand = sequence(4100 + n),
    px = size / span;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#b9926a");
  g.addColorStop(1, "#a9825b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Fibres of the hardboard.
  for (let k = 0; k < 2600; k++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? "90, 60, 35" : "235, 210, 170"}, ${0.04 + rand() * 0.06})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 6, 1);
  }
  const at = (u: number) => size / 2 + u * px;
  // Holes on a grid of quarter cells, left out where a socket stands.
  const quarter = CELL / 4,
    reach = span / 2 - 0.12;
  for (let x = -reach; x <= reach; x += quarter)
    for (let z = -reach; z <= reach; z += quarter) {
      const fx = x / CELL + (n - 1) / 2,
        fz = z / CELL + (n - 1) / 2,
        nearSocket = Math.abs(fx - Math.round(fx)) < 0.3 && Math.abs(fz - Math.round(fz)) < 0.3 && Math.round(fx) >= 0 && Math.round(fz) >= 0 && Math.round(fx) < n && Math.round(fz) < n;
      if (nearSocket) continue;
      const cx = at(x),
        cy = at(z);
      ctx.fillStyle = "rgba(255, 236, 206, 0.35)";
      ctx.beginPath();
      ctx.arc(cx + 0.8, cy + 0.9, px * 0.034, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2716";
      ctx.beginPath();
      ctx.arc(cx, cy, px * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  // A pencilled cross at each socket's place, as a maker marks a board out before drilling.
  ctx.strokeStyle = "rgba(60, 44, 32, 0.28)";
  ctx.lineWidth = 1.4;
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++) {
      const cx = at((col - (n - 1) / 2) * CELL),
        cy = at((r - (n - 1) / 2) * CELL),
        a = px * 0.34;
      ctx.beginPath();
      ctx.moveTo(cx - a, cy);
      ctx.lineTo(cx + a, cy);
      ctx.moveTo(cx, cy - a);
      ctx.lineTo(cx, cy + a);
      ctx.stroke();
    }
  // A darker band of wear round the rim.
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.72);
  edge.addColorStop(0, "rgba(60, 36, 18, 0)");
  edge.addColorStop(1, "rgba(60, 36, 18, 0.22)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  return textureOf(c);
}
/** A soft round glow for halos, sparks and the light a bulb throws on the board. */
export function glowTexture() {
  const { c, ctx } = canvasOf(128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 246, 214, 1)");
  g.addColorStop(0.22, "rgba(255, 214, 140, 0.6)");
  g.addColorStop(0.55, "rgba(255, 170, 70, 0.16)");
  g.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return textureOf(c);
}

/** One bulb, piece by piece: what lights and what stays. */
export interface Bulb {
  cell: number;
  root: T.Group;
  glass: T.Mesh;
  glassPaint: T.MeshStandardMaterial;
  coilPaint: T.MeshStandardMaterial;
  halo: T.Sprite;
  pool: T.Mesh;
  /** How bright it is now (0 off, 1 lit), and its share of the celebration. */
  glow: number;
}
/** The paints, shapes and pictures of the bench, made once a view and kept by it. */
export interface Kit {
  paint: Record<"bench" | "frame" | "porcelain" | "hole" | "bakelite" | "brass" | "tip" | "support" | "screw" | "copper" | "handle", T.Material>;
  shapes: Record<"socket" | "hole" | "emptySocket" | "emptyHole" | "screw" | "tip" | "glass" | "coil" | "support0" | "support1" | "stem" | "pool", T.BufferGeometry>;
  glow: T.Texture;
  /** No graphics card draws the picture: the glow is kept a little softer. */
  soft: boolean;
}
export function bulbKit(keep: Keep, soft: boolean): Kit {
  const paint = {
    bench: keep(new T.MeshStandardMaterial({ ...planks(3, keep), color: "#c8a888" })),
    frame: keep(new T.MeshStandardMaterial({ map: keep(wood(false, 0.7)), color: "#d9b48a", roughness: 0.6 })),
    porcelain: keep(glossy({ color: "#f3f0ea", roughness: 0.3 }, 0.8)),
    hole: keep(new T.MeshStandardMaterial({ color: "#1b1a19", roughness: 0.9 })),
    bakelite: keep(glossy({ color: "#2a2623", roughness: 0.35 }, 0.6)),
    brass: keep(glossy({ color: "#c99a4a", roughness: 0.32, metalness: 0.85 }, 0.4)),
    tip: keep(new T.MeshStandardMaterial({ color: "#151515", roughness: 0.4 })),
    support: keep(new T.MeshStandardMaterial({ color: "#9a9a96", roughness: 0.4, metalness: 0.8 })),
    screw: keep(new T.MeshStandardMaterial({ color: "#d6d8d8", roughness: 0.3, metalness: 0.9 })),
    copper: keep(glossy({ color: "#c57a43", roughness: 0.3, metalness: 0.85 }, 0.3)),
    handle: keep(glossy({ color: "#e0b12c", roughness: 0.35 })),
  };
  // A socket: a cup with a dark hole; a bulb's screw base, glass, filament and tip.
  const socket = keep(new T.CylinderGeometry(0.2, 0.215, 0.06, 32).translate(0, BOARD_TOP + 0.03, 0)),
    hole = keep(new T.CircleGeometry(0.085, 24).rotateX(-Math.PI / 2).translate(0, BOARD_TOP + 0.0605, 0));
  const screw: T.Vector2[] = [new T.Vector2(0.0, 0.055), new T.Vector2(0.072, 0.055)];
  for (let k = 0; k < 4; k++) {
    const y = 0.065 + k * 0.018;
    screw.push(new T.Vector2(0.074, y), new T.Vector2(0.083, y + 0.007), new T.Vector2(0.074, y + 0.014));
  }
  screw.push(new T.Vector2(0.08, 0.14), new T.Vector2(0.0, 0.14));
  const glass = [
    [0.0, 0.135],
    [0.074, 0.135],
    [0.08, 0.17],
    [0.105, 0.215],
    [0.148, 0.268],
    [0.172, 0.33],
    [0.168, 0.39],
    [0.146, 0.445],
    [0.108, 0.49],
    [0.058, 0.513],
    [0.0, 0.52],
  ].map(([x, y]) => new T.Vector2(x, y));
  const coil: T.Vector3[] = [];
  for (let k = 0; k <= 60; k++) {
    const t = k / 60,
      a = t * Math.PI * 2 * 7;
    coil.push(new T.Vector3(-0.055 + 0.11 * t, 0.335 + Math.cos(a) * 0.011, Math.sin(a) * 0.011));
  }
  const shapes = {
    socket,
    hole,
    // An empty socket is smaller than a bulb's, so that the bulbs stand out.
    emptySocket: keep(socket.clone().scale(0.72, 0.8, 0.72)),
    emptyHole: keep(hole.clone().scale(0.72, 0.8, 0.72)),
    screw: keep(new T.LatheGeometry(screw, 28)),
    tip: keep(new T.CylinderGeometry(0.045, 0.05, 0.02, 20).translate(0, 0.055, 0)),
    glass: keep(new T.LatheGeometry(glass, 36)),
    coil: keep(new T.TubeGeometry(new T.CatmullRomCurve3(coil), 120, 0.0035, 4, false)),
    support0: keep(new T.CylinderGeometry(0.004, 0.004, 0.19, 5).translate(-0.055, 0.24, 0)),
    support1: keep(new T.CylinderGeometry(0.004, 0.004, 0.19, 5).translate(0.055, 0.24, 0)),
    stem: keep(new T.CylinderGeometry(0.016, 0.03, 0.08, 10).translate(0, 0.175, 0)),
    pool: keep(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
  };
  return { paint, shapes, glow: keep(glowTexture()), soft };
}
/** The workshop's light: a lamp above and to the left, a cool sky from the window and warm bounce from the bench. */
export function workshop(scene: T.Scene, keep: Keep) {
  scene.background = new T.Color("#2a221c");
  scene.add(new T.HemisphereLight("#dfe6f2", "#6a4a30", 1.5));
  const lamp = new T.DirectionalLight("#fff1dc", 2.3);
  lamp.position.set(-5, 10, 4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.left = lamp.shadow.camera.bottom = -9;
  lamp.shadow.camera.right = lamp.shadow.camera.top = 9;
  lamp.shadow.camera.far = 40;
  lamp.shadow.normalBias = 0.02;
  keep(lamp.shadow);
  const fill = new T.DirectionalLight("#ffe9cc", 0.45);
  fill.position.set(4, 7, 8);
  scene.add(lamp, fill);
}
/** The bench under everything. */
export function bench(scene: T.Scene, kit: Kit, keep: Keep) {
  const mesh = new T.Mesh(keep(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2)), kit.paint.bench);
  mesh.position.y = -0.16;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
const addTo = (geometry: T.BufferGeometry, material: T.Material | T.Material[], parent: T.Object3D, shadow = true) => {
  const mesh = new T.Mesh(geometry, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};
/** How wide the pegboard of a board of `n` is. */
export const spanOf = (n: number) => n * CELL + 0.7;
/** The frame of pale wood and the pegboard set into it, for a board of `n`; `keep` holds what belongs to this board. */
export function framedBoard(layer: T.Object3D, n: number, kit: Kit, keep: Keep) {
  const span = spanOf(n);
  addTo(keep(block(span + 0.5, 0.1, span + 0.5, 0.06).translate(0, -0.11, 0)), kit.paint.frame, layer);
  const face = keep(new T.MeshStandardMaterial({ map: keep(pegboard(n, span)), roughness: 0.85 })),
    edge = keep(new T.MeshStandardMaterial({ color: "#8f6a46", roughness: 0.9 }));
  addTo(keep(block(span, 0.08, span, 0.02).translate(0, BOARD_TOP - 0.04, 0)), [edge, edge, face, edge, edge, edge], layer).castShadow = false;
  return span;
}
/** A bulb in its black socket at `cell` of a board of `n`, added to `layer`; `keep` holds its own paints. */
export function makeBulb(layer: T.Object3D, kit: Kit, n: number, cell: number, keep: Keep): Bulb {
  const at = cellAt(n, cell),
    root = new T.Group(),
    glassPaint = keep(new T.MeshStandardMaterial({ color: "#d4e2e8", transparent: true, opacity: 0.45, roughness: 0.04, metalness: 0.1, depthWrite: false, emissive: "#ffcf86", emissiveIntensity: 0 })),
    coilPaint = keep(new T.MeshStandardMaterial({ color: "#5d4c3b", roughness: 0.5, emissive: "#ffae40", emissiveIntensity: 0 })),
    { shapes, paint } = kit;
  addTo(shapes.socket, paint.bakelite, root);
  addTo(shapes.screw, paint.brass, root);
  addTo(shapes.tip, paint.tip, root);
  addTo(shapes.support0, paint.support, root, false);
  addTo(shapes.support1, paint.support, root, false);
  addTo(shapes.stem, glassPaint, root, false);
  addTo(shapes.coil, coilPaint, root, false);
  const glass = addTo(shapes.glass, glassPaint, root, false);
  glass.renderOrder = 2;
  glass.userData.cell = cell;
  // A slight turn each, so that the filaments do not all lie one way.
  root.rotation.y = sequence(cell * 7919 + 3)() * Math.PI;
  root.position.set(at.x, 0, at.z);
  root.scale.setScalar(BULB_SCALE);
  root.userData.cell = cell;
  const halo = new T.Sprite(keep(new T.SpriteMaterial({ map: kit.glow, color: "#ffd690", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
  halo.position.set(at.x, BULB_Y + 0.02, at.z);
  halo.renderOrder = 6;
  const pool = new T.Mesh(shapes.pool, keep(new T.MeshBasicMaterial({ map: kit.glow, color: "#ffb860", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
  pool.position.set(at.x, BOARD_TOP + 0.064, at.z);
  pool.scale.setScalar(2);
  pool.renderOrder = 3;
  layer.add(root, halo, pool);
  return { cell, root, glass, glassPaint, coilPaint, halo, pool, glow: 0 };
}
/** Empty porcelain sockets at `cells` of a board of `n`, as one instanced mesh each for the cups and their holes. */
export function emptySockets(layer: T.Object3D, kit: Kit, n: number, cells: number[]) {
  const sockets = new T.InstancedMesh(kit.shapes.emptySocket, kit.paint.porcelain, Math.max(1, cells.length)),
    holes = new T.InstancedMesh(kit.shapes.emptyHole, kit.paint.hole, Math.max(1, cells.length)),
    m = new T.Matrix4();
  cells.forEach((cell, i) => {
    const at = cellAt(n, cell);
    m.makeTranslation(at.x, 0, at.z);
    sockets.setMatrixAt(i, m);
    holes.setMatrixAt(i, m);
  });
  sockets.count = holes.count = cells.length;
  sockets.castShadow = true;
  sockets.receiveShadow = holes.receiveShadow = true;
  layer.add(sockets, holes);
}
/** Sets a bulb's brightness: 0 dark, 1 lit; above 1 while it flares. */
export function shine(kit: Kit, bulb: Bulb, glow: number) {
  bulb.glow = glow;
  const g = Math.min(1, glow),
    extra = Math.max(0, glow - 1),
    paint = bulb.glassPaint,
    soft = kit.soft;
  paint.opacity = 0.45 + 0.43 * g;
  paint.emissiveIntensity = g * (soft ? 0.95 : 1.25) + extra * 1.2;
  paint.color.setRGB(0.83 + 0.17 * g, 0.885 + 0.08 * g, 0.91 - 0.2 * g);
  bulb.coilPaint.emissiveIntensity = g * 3 + extra * 2;
  const halo = bulb.halo.material as T.SpriteMaterial;
  halo.opacity = g * (soft ? 0.55 : 0.8) + extra * 0.4;
  bulb.halo.scale.setScalar((soft ? 1.0 : 1.4) * (0.6 + 0.4 * g) + extra * 1.2);
  (bulb.pool.material as T.MeshBasicMaterial).opacity = g * (soft ? 0.35 : 0.5) + extra * 0.3;
}
/** A spool of wire and a screwdriver on the bench beside a board `span` wide; `keep` holds what belongs to this board. */
export function benchProps(layer: T.Object3D, kit: Kit, span: number, keep: Keep) {
  const half = span / 2 + 0.25,
    group = new T.Group();
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
    const mesh = new T.Mesh(keep(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  // The spool, standing on its end, beyond the far left corner (the far side shows more of the bench).
  const sx = -half - 0.55,
    sz = -half - 0.1;
  add(new T.CylinderGeometry(0.42, 0.42, 0.06, 32), kit.paint.frame, sx, -0.13, sz);
  add(new T.CylinderGeometry(0.3, 0.3, 0.34, 32), kit.paint.copper, sx, 0.07, sz);
  add(new T.CylinderGeometry(0.42, 0.42, 0.06, 32), kit.paint.frame, sx, 0.27, sz);
  add(new T.CylinderGeometry(0.08, 0.08, 0.07, 16), kit.paint.hole, sx, 0.3, sz);
  // A screwdriver lying at the near left.
  const driver = new T.Group();
  const handle = new T.Mesh(keep(new T.CylinderGeometry(0.07, 0.06, 0.42, 16).rotateZ(Math.PI / 2)), kit.paint.handle),
    shaft = new T.Mesh(keep(new T.CylinderGeometry(0.018, 0.018, 0.5, 10).rotateZ(Math.PI / 2).translate(0.46, 0, 0)), kit.paint.screw);
  handle.castShadow = shaft.castShadow = true;
  driver.add(handle, shaft);
  driver.position.set(-half - 0.6, -0.09, half - 0.3);
  driver.rotation.y = 0.9;
  group.add(driver);
  layer.add(group);
}
/** Where every cell of a board of `n` is on the canvas (a bulb at its glass if `bulbAt` says so, else the board), in CSS pixels, "x,y" joined by spaces. */
export function placesOf(camera: T.Camera, el: HTMLCanvasElement, n: number, bulbAt: (cell: number) => boolean) {
  const v = new T.Vector3(),
    out: string[] = [];
  camera.updateMatrixWorld();
  for (let i = 0; i < n * n; i++) {
    const at = cellAt(n, i);
    v.set(at.x, bulbAt(i) ? BULB_Y : BOARD_TOP, at.z).project(camera);
    out.push(`${Math.round(((v.x + 1) / 2) * el.clientWidth)},${Math.round(((1 - v.y) / 2) * el.clientHeight)}`);
  }
  return out.join(" ");
}
