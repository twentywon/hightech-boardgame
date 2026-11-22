import * as T from "three";
import { block, stuff, wood } from "../../engine/scene-utils";
import { Grove } from "../../engine/foliage";
import { FACE_Y, FACE_Z } from "./layout";
import { FACE, ZONE, X_RING, type Wind } from "./rules";

/**
 * The archery range round the target, all modelled and painted in code: mown grass in stripes, the target on its
 * stand before a tall hedge, a wind sock on a mast at either side of the field, a stand of spectators along the left,
 * an electric scoreboard at the right and a line of trees far behind. What stands far off is on layer 1, so that the
 * close camera of the inset (which sees layer 0 only) does not draw it.
 */
type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** A tiny fixed sequence, so that the range is laid out and painted the same every time. */
export function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
export function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** The far layer: what the inset's close camera leaves out. */
export const FAR = 1;
/** The paper face, 1.3 m square, its rings printed on it: gold, red, blue, black and white, the X ring and a small cross. */
function facePaper() {
  const px = 1024,
    c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!,
    k = px / 1300,
    o = px / 2,
    random = sequence(41);
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(0, 0, px, px);
  // The paper's fibres.
  for (let n = 0; n < 2600; n++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(120,110,90,0.05)" : "rgba(255,255,255,0.08)";
    ctx.fillRect(random() * px, random() * px, 1 + random() * 3, 1);
  }
  const colours = ["#ffffff", "#ffffff", "#232323", "#232323", "#22a5dc", "#22a5dc", "#ec3a3f", "#ec3a3f", "#ffd93a", "#ffd93a"];
  for (let zone = 10; zone >= 1; zone--) {
    ctx.beginPath();
    ctx.arc(o, o, zone * ZONE * k, 0, Math.PI * 2);
    ctx.fillStyle = colours[10 - zone];
    ctx.fill();
  }
  // The lines between the zones: dark on the colours, pale on the black.
  for (let zone = 1; zone <= 10; zone++) {
    ctx.beginPath();
    ctx.arc(o, o, zone * ZONE * k, 0, Math.PI * 2);
    ctx.lineWidth = zone === 10 ? 2.6 : 1.6;
    ctx.strokeStyle = zone === 3 || zone === 4 ? "rgba(255,255,255,0.75)" : "rgba(20,20,20,0.7)";
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(o, o, X_RING * k, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(20,20,20,0.6)";
  ctx.stroke();
  ctx.strokeStyle = "rgba(20,20,20,0.75)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(o - 6, o);
  ctx.lineTo(o + 6, o);
  ctx.moveTo(o, o - 6);
  ctx.lineTo(o, o + 6);
  ctx.stroke();
  // Holes of the arrows shot at it before, mostly round the gold.
  for (let n = 0; n < 70; n++) {
    const r = Math.abs(random() + random() + random() - 1.5) * 260 * k,
      a = random() * Math.PI * 2;
    ctx.fillStyle = "rgba(25,18,12,0.55)";
    ctx.beginPath();
    ctx.arc(o + Math.cos(a) * r, o + Math.sin(a) * r, 2.2 + random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // A thin edge round the face.
  ctx.beginPath();
  ctx.arc(o, o, FACE * k, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(40,40,40,0.5)";
  ctx.stroke();
  return canvasTexture(c);
}
/** Packed straw seen end on: the boss behind the face. */
function straw() {
  const px = 512,
    c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!,
    random = sequence(7);
  ctx.fillStyle = "#c8ad6c";
  ctx.fillRect(0, 0, px, px);
  for (let n = 0; n < 5200; n++) {
    const x = random() * px,
      y = random() * px,
      a = random() * Math.PI,
      l = 6 + random() * 18,
      tone = random();
    ctx.strokeStyle = tone < 0.4 ? "rgba(120,88,40,0.45)" : tone < 0.8 ? "rgba(236,214,150,0.5)" : "rgba(90,70,35,0.5)";
    ctx.lineWidth = 1 + random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const texture = canvasTexture(c);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
/** A hedge's leaves: dark green with lighter and darker flecks. */
function leaves(base: string, seed: number) {
  const px = 256,
    c = document.createElement("canvas");
  c.width = c.height = px;
  const ctx = c.getContext("2d")!,
    random = sequence(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, px, px);
  for (let n = 0; n < 1600; n++) {
    const tone = random();
    ctx.fillStyle = tone < 0.45 ? "rgba(10,30,10,0.35)" : tone < 0.85 ? "rgba(120,170,80,0.28)" : "rgba(200,230,140,0.25)";
    ctx.beginPath();
    ctx.ellipse(random() * px, random() * px, 2 + random() * 4, 1.5 + random() * 2.5, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = canvasTexture(c);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
/** The sky: deep blue overhead, hazy toward the trees. */
function sky() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 512;
  const ctx = c.getContext("2d")!,
    g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#5f98d4");
  g.addColorStop(0.45, "#9cc3e6");
  g.addColorStop(0.62, "#d6e6f0");
  g.addColorStop(1, "#dfe9e4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 512);
  return canvasTexture(c);
}
/** The number plate on top of the boss. */
function plate(text: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = "#1d2533";
  ctx.font = '800 150px "Inter", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 104);
  return canvasTexture(c);
}
/** A wind sock or a flag that turns with the wind: `yaw` swings it round its mast, `droop` lets it hang. */
export interface Vane {
  yaw: T.Object3D;
  droop: T.Object3D;
  /** How far it hangs in still air (radians below level) and how much of that a strong wind lifts. */
  limp: number;
}
/** Turns a sock or flag to a wind given as a vector over the ground (m/s: x to the right, z toward the archer), `t` seconds into its flutter. */
export function blow(vane: Vane, x: number, z: number, t: number) {
  const speed = Math.hypot(x, z),
    lift = Math.min(1, speed / 4.5);
  if (speed > 0.05) vane.yaw.rotation.y = Math.atan2(-z, x) + Math.sin(t * (3 + speed)) * 0.04 * lift;
  vane.droop.rotation.z = -vane.limp * (1 - lift) ** 1.2 + Math.sin(t * (5 + speed * 1.5)) * 0.03 * lift;
}
/** The wind of an arrow as a vector over the ground (m/s: x to the right, z toward the archer). */
export const windVector = (wind: Wind) => {
  const a = (wind.dir * Math.PI) / 180;
  return { x: wind.speed * Math.sin(a), z: -wind.speed * Math.cos(a) };
};
export interface Range {
  socks: Vane[];
  flag: Vane;
  /** The scoreboard's screen, painted by the view. */
  board: { canvas: HTMLCanvasElement; texture: T.CanvasTexture };
}
/** Builds the range into `scene` with the view's own `add` and `standard` (which keep what they make). */
export function buildRange(
  scene: T.Scene,
  keep: Keep,
  add: (geometry: T.BufferGeometry, material: T.Material | T.Material[], x?: number, y?: number, z?: number, parent?: T.Object3D) => T.Mesh,
  standard: (options: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial,
): Range {
  scene.background = keep(sky());
  scene.fog = new T.Fog("#d7e5ec", 85, 330);
  const far = (object: T.Object3D) => {
    object.traverse((o) => o.layers.set(FAR));
    return object;
  };
  // The field: stripes of mown grass running down the range, and plain grass beyond them to the horizon.
  const greens = ["#5c963c", "#6aa647"].map((base) => standard({ ...stuff("grass", base, 1, keep, 52), roughness: 1 }));
  for (let k = 0; k < 30; k++) {
    const strip = add(new T.PlaneGeometry(4, 210).rotateX(-Math.PI / 2), greens[k % 2], -60 + k * 4 + 2, 0, -99);
    strip.castShadow = false;
  }
  const beyond = add(new T.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), standard({ color: "#5a8c3c", roughness: 1 }), 0, -0.02, -200);
  beyond.castShadow = false;
  // The lines on the grass: the target line under the faces, and a waiting line far back.
  const chalk = standard({ color: "#f4f6f0", roughness: 0.9 });
  add(new T.PlaneGeometry(46, 0.1).rotateX(-Math.PI / 2), chalk, 0, 0.004, FACE_Z).castShadow = false;
  for (const d of [30, 50]) {
    const mark = add(new T.PlaneGeometry(0.6, 0.08).rotateX(-Math.PI / 2), chalk, 0, 0.004, -d);
    mark.castShadow = false;
  }
  // The target: a boss of straw on a wooden A-frame stand, the paper face pinned to it, a number plate and a flag on top.
  const boss = keep(straw()),
    bossPaint = standard({ map: boss, roughness: 1 }),
    side = 1.46,
    depth = 0.42,
    front = FACE_Z - 0.006;
  add(block(side, side, depth, 0.06), bossPaint, 0, FACE_Y, front - depth / 2);
  const face = add(new T.PlaneGeometry(1.3, 1.3), standard({ map: keep(facePaper()), roughness: 0.92 }), 0, FACE_Y, FACE_Z + 0.002);
  face.castShadow = false;
  // Four pins hold the paper at its corners.
  const pin = keep(new T.SphereGeometry(0.012, 8, 6)),
    pinPaint = standard({ color: "#d23a2a", roughness: 0.4 });
  for (const [x, y] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]]) {
    const m = new T.Mesh(pin, pinPaint);
    m.position.set(x, FACE_Y + y, FACE_Z + 0.008);
    scene.add(m);
  }
  const timber = keep(wood(false)),
    frame = standard({ map: timber, color: "#a77a4c", roughness: 0.75 }),
    leg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, thick = 0.075) => {
      const length = Math.hypot(x1 - x0, y1 - y0, z1 - z0),
        mesh = add(block(thick, length, thick, 0.015), frame, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
      return mesh;
    };
  const back = front - depth,
    bottom = FACE_Y - side / 2;
  for (const s of [-1, 1]) {
    // Front legs from the grass up the boss's sides, back legs leaning out behind.
    leg(s * 0.62, 0, front - 0.12, s * 0.62, FACE_Y + side / 2 - 0.05, back + 0.1);
    leg(s * 0.62, 0, back - 1.25, s * 0.62, FACE_Y + side / 2 - 0.1, back + 0.02);
  }
  // The ledge the boss rests on, and a crossbar between the back legs.
  add(block(side + 0.16, 0.08, depth + 0.12, 0.02), frame, 0, bottom - 0.04, front - depth / 2);
  add(block(1.36, 0.07, 0.07, 0.015), frame, 0, 0.5, back - 0.8);
  const number = add(block(0.36, 0.27, 0.04, 0.012), [standard({ color: "#e9e6dd" }), standard({ color: "#e9e6dd" }), standard({ color: "#e9e6dd" }), standard({ color: "#e9e6dd" }), standard({ map: keep(plate("1")), roughness: 0.6 }), standard({ color: "#e9e6dd" })], 0, FACE_Y + side / 2 + 0.16, front - 0.06);
  number.rotation.x = -0.08;
  // The small flag on its pole at the boss's corner, which shows the wind at the target.
  const steel = standard({ color: "#c9ced4", roughness: 0.35, metalness: 0.7 }),
    poleTop = FACE_Y + side / 2 + 1.1;
  add(new T.CylinderGeometry(0.012, 0.014, poleTop - (FACE_Y + side / 2) + 0.1, 8), steel, 0.66, (poleTop + FACE_Y + side / 2 - 0.1) / 2, front - 0.1);
  const flagYaw = new T.Group(),
    flagDroop = new T.Group();
  flagYaw.position.set(0.66, poleTop - 0.02, front - 0.1);
  flagYaw.add(flagDroop);
  scene.add(flagYaw);
  const cloth = add(new T.PlaneGeometry(0.46, 0.3, 6, 2).translate(0.23, -0.15, 0), standard({ color: "#ffcf1f", roughness: 0.85, side: T.DoubleSide }), 0, 0, 0, flagDroop);
  cloth.castShadow = false;
  // A tall hedge behind the target, so that the face stands out against dark leaves.
  const hedgePaint = standard({ map: keep(leaves("#2f5a26", 3)), roughness: 1 });
  (hedgePaint.map as T.Texture).repeat.set(24, 1.2);
  add(block(70, 2.8, 1.4, 0.4), hedgePaint, 0, 1.4, FACE_Z - 9.5).castShadow = false;
  // A wind sock on a mast at either side of the field, half way down.
  const socks: Vane[] = [],
    orange = standard({ color: "#ff6a1c", roughness: 0.75, side: T.DoubleSide }),
    white = standard({ color: "#f6f6f2", roughness: 0.75, side: T.DoubleSide }),
    mast = standard({ color: "#e8e9e6", roughness: 0.5, metalness: 0.2 });
  for (const s of [-1, 1]) {
    const x = s * 6.6,
      z = -36,
      height = 5.6;
    add(new T.CylinderGeometry(0.05, 0.07, height, 10), mast, x, height / 2, z);
    add(new T.CylinderGeometry(0.16, 0.2, 0.1, 12), standard({ color: "#8e938f", roughness: 0.6 }), x, 0.05, z);
    const yaw = new T.Group(),
      droop = new T.Group();
    yaw.position.set(x, height - 0.1, z);
    yaw.add(droop);
    scene.add(yaw);
    // The hoop at its mouth, then five bands narrowing to the tail.
    const hoop = add(new T.TorusGeometry(0.2, 0.012, 6, 20).rotateY(Math.PI / 2), steel, 0.02, 0, 0, droop);
    hoop.castShadow = false;
    const bands = 5,
      length = 1.6;
    for (let b = 0; b < bands; b++) {
      const r0 = 0.2 - (0.12 * b) / bands,
        r1 = 0.2 - (0.12 * (b + 1)) / bands,
        band = add(new T.CylinderGeometry(r1, r0, length / bands, 16, 1, true).rotateZ(-Math.PI / 2), b % 2 ? white : orange, (length / bands) * (b + 0.5), 0, 0, droop);
      band.castShadow = false;
    }
    socks.push({ yaw, droop, limp: 1.25 });
  }
  // The scoreboard at the right, half way down the field, turned toward the shooting line.
  const board = new T.Group(),
    boardX = 8.9,
    boardZ = -55;
  board.position.set(boardX, 0, boardZ);
  board.rotation.y = Math.atan2(-boardX, -boardZ);
  scene.add(board);
  const dark = standard({ color: "#22262c", roughness: 0.5, metalness: 0.4 });
  add(block(6.4, 3.4, 0.3, 0.06), dark, 0, 4.0, 0, board);
  for (const s of [-1, 1]) add(new T.CylinderGeometry(0.09, 0.11, 2.4, 10), dark, s * 2.2, 1.2, -0.05, board);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const texture = keep(canvasTexture(canvas)),
    screen = add(new T.PlaneGeometry(6.0, 3.0), keep(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, 4.0, 0.16, board);
  screen.castShadow = false;
  far(board);
  // The spectators' stand along the left side: stepped concrete, blue benches, a roof on posts, people on the benches.
  const stand = new T.Group();
  stand.position.set(-13.2, 0, -62);
  stand.rotation.y = -0.22;
  scene.add(stand);
  const concrete = standard({ color: "#c7c4bd", roughness: 0.95 }),
    bench = standard({ color: "#2d6bb5", roughness: 0.6 }),
    tiers = 7,
    rise = 0.45,
    tread = 0.85,
    long = 44;
  for (let k = 0; k < tiers; k++) {
    const top = rise * (k + 1);
    add(new T.BoxGeometry(tread, top, long), concrete, -k * tread, top / 2, 0, stand).castShadow = false;
    add(new T.BoxGeometry(0.36, 0.08, long), bench, -k * tread - 0.12, top + 0.04, 0, stand).castShadow = false;
  }
  add(new T.BoxGeometry(0.25, rise * tiers + 3.6, long), concrete, -tiers * tread + 0.1, (rise * tiers + 3.6) / 2, 0, stand).castShadow = false;
  const roofY = rise * tiers + 3.4;
  add(block(tiers * tread + 1.6, 0.18, long + 1, 0.05), standard({ color: "#f3f4f2", roughness: 0.5 }), -tiers * tread / 2 + 0.35, roofY, 0, stand).castShadow = false;
  for (let z = -long / 2 + 1; z <= long / 2 - 1; z += 7) add(new T.CylinderGeometry(0.07, 0.07, roofY - 0.4, 8), steel, 0.5, (roofY + 0.4) / 2, z, stand).castShadow = false;
  add(new T.BoxGeometry(0.05, 0.05, long), steel, 0.4, 0.95, 0, stand).castShadow = false;
  // People: a body and a head each, coloured one by one, a few seats left empty.
  const random = sequence(11),
    seats: { x: number; y: number; z: number }[] = [];
  for (let k = 0; k < tiers; k++)
    for (let z = -long / 2 + 0.5; z <= long / 2 - 0.5; z += 0.58) if (random() < 0.72) seats.push({ x: -k * tread - 0.12 + (random() - 0.5) * 0.08, y: rise * (k + 1) + 0.08, z: z + (random() - 0.5) * 0.12 });
  const bodies = new T.InstancedMesh(keep(new T.CylinderGeometry(0.16, 0.2, 0.6, 8)), standard({ roughness: 0.85 }), seats.length),
    heads = new T.InstancedMesh(keep(new T.SphereGeometry(0.11, 10, 8)), standard({ roughness: 0.7 }), seats.length),
    shirts = ["#e24b3c", "#f2f2ee", "#2f5fae", "#f0b83a", "#3c8c5a", "#26292e", "#d96aa6", "#7cc2e8", "#8a5b3c", "#ffffff"],
    skins = ["#f0c9a6", "#e3b48c", "#c9935f", "#a96f45", "#7a4c2c"],
    matrix = new T.Matrix4(),
    colour = new T.Color();
  seats.forEach((seat, i) => {
    const lean = (random() - 0.5) * 0.1;
    matrix.makeRotationZ(lean).setPosition(seat.x, seat.y + 0.3, seat.z);
    bodies.setMatrixAt(i, matrix);
    bodies.setColorAt(i, colour.set(shirts[Math.floor(random() * shirts.length)]));
    matrix.makeTranslation(seat.x + lean * 0.4, seat.y + 0.72, seat.z);
    heads.setMatrixAt(i, matrix);
    heads.setColorAt(i, colour.set(skins[Math.floor(random() * skins.length)]));
  });
  stand.add(bodies, heads);
  far(stand);
  // The tree line: behind the hedge across the whole field, and down both sides; a crown or two on a trunk each.
  const trees: { x: number; z: number; h: number }[] = [],
    trees2 = sequence(23);
  for (let x = -150; x <= 150; x += 4.5 + trees2() * 3) trees.push({ x, z: -108 - trees2() * 40, h: 9 + trees2() * 9 });
  for (const s of [-1, 1])
    for (let z = -18; z >= -105; z -= 5 + trees2() * 4) trees.push({ x: s * (26 + trees2() * 30), z, h: 8 + trees2() * 8 });
  const trunks = new T.InstancedMesh(keep(new T.CylinderGeometry(0.22, 0.32, 1, 7)), standard({ color: "#5b4632", roughness: 1 }), trees.length),
    // Crowns of painted leaves on cards round dark cores (`Grove`); the sight's long lens shows them large, so every
    // crown keeps its whole set of cards.
    crowns = new Grove(scene, keep, { shadow: false, leaves: 0.75 }),
    foliage = ["#2f5a2a", "#3d6b30", "#466f2e", "#2a4f2c", "#557a34"],
    scale = new T.Vector3(),
    place = new T.Vector3(),
    turn = new T.Quaternion();
  trees.forEach((tree, i) => {
    const trunk = tree.h * 0.35;
    trunks.setMatrixAt(i, matrix.compose(place.set(tree.x, trunk / 2, tree.z), turn.identity(), scale.set(1, trunk, 1)));
    for (let k = 0; k < 2; k++) {
      const r = tree.h * (k ? 0.24 : 0.32);
      const spin = trees2() * 6.28;
      place.set(tree.x + (k ? (trees2() - 0.5) * r : 0), trunk + r * (k ? 1.9 : 0.85), tree.z + (k ? (trees2() - 0.5) * r : 0));
      scale.set(r * 1.05, r * (1.05 + trees2() * 0.3), r);
      crowns.crown(i % 3 ? "oak" : "broad", place, [scale.x * 1.1, scale.y * 1.1, scale.z * 1.1], foliage[Math.floor(trees2() * foliage.length)], spin);
    }
  });
  trunks.castShadow = false;
  scene.add(far(trunks));
  crowns.build().forEach(far);
  // Low hills beyond, lost in the haze.
  const hillPaint = standard({ color: "#6f8f6a", roughness: 1 });
  for (const [x, z, w, h] of [[-150, -205, 120, 30], [-10, -225, 150, 38], [140, -210, 130, 28]]) {
    const hill = add(new T.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillPaint, x, -1, z);
    hill.scale.set(w, h, 50);
    hill.castShadow = false;
    far(hill);
  }
  return { socks, flag: { yaw: flagYaw, droop: flagDroop, limp: 1.35 }, board: { canvas, texture } };
}
