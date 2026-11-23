import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Grove } from "../../engine/foliage";
import { block, glossy, planks, stuff } from "../../engine/scene-utils";
import { MAT_H } from "./layout";

/**
 * Where mahjong solitaire is played: a tea house of our own. The tiles lie on a woven rattan mat on a lacquered
 * table of oxblood red with a gilt line round its edge; at the far left a clay teapot and two celadon cups on a
 * small tray, at the far right a brass lamp with a silk shade, and at the right of the mat a black lacquered tray
 * that the pairs taken go into. Below, a floor of dark boards; where a graphics card draws, a painted folding screen
 * stands behind the table and a potted plant beside it. Everything is modelled and painted in code.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The height of the floor under the table. */
export const FLOOR = -9.5;
/** The table's top: its size, and how thick the mat under the tiles is. */
export const TABLE = { w: 34, d: 24 };

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function picture(c: HTMLCanvasElement, repeat = false) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A rattan mat: fine slats of straw across, a woven border of darker cane, for a mat `w` by `d`. */
export function matPicture(w: number, d: number) {
  const px = 64,
    { c, ctx } = canvas(Math.round(w * px), Math.round(d * px));
  ctx.fillStyle = "#c8a46a";
  ctx.fillRect(0, 0, c.width, c.height);
  let seed = 11;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  // Slats from left to right, each a little lighter or darker, with a fine shade at its edges.
  const slat = 9;
  for (let y = 0; y < c.height; y += slat) {
    const tone = 0.9 + rand() * 0.2;
    ctx.fillStyle = `rgb(${Math.round(206 * tone)},${Math.round(170 * tone)},${Math.round(112 * tone)})`;
    ctx.fillRect(0, y, c.width, slat - 1);
    ctx.fillStyle = "rgba(90,60,25,0.35)";
    ctx.fillRect(0, y + slat - 1, c.width, 1);
    ctx.fillStyle = "rgba(255,240,200,0.25)";
    ctx.fillRect(0, y + 1, c.width, 1);
  }
  // The threads that bind the slats, every so often across.
  ctx.fillStyle = "rgba(110,70,30,0.55)";
  for (let x = 40; x < c.width - 20; x += 120) for (let y = 0; y < c.height; y += slat * 2) ctx.fillRect(x, y + 3, 5, 4);
  // The border.
  const b = 26;
  ctx.strokeStyle = "#6b4321";
  ctx.lineWidth = b;
  ctx.strokeRect(b / 2, b / 2, c.width - b, c.height - b);
  ctx.strokeStyle = "rgba(255,225,170,0.35)";
  ctx.lineWidth = 2;
  for (let k = 4; k < b; k += 6) ctx.strokeRect(k, k, c.width - 2 * k, c.height - 2 * k);
  return picture(c);
}
/** The folding screen's painting: misty mountains, a pine and a moon on pale silk, panel by panel. */
function screenPicture() {
  const { c, ctx } = canvas(1536, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#efe4cc");
  g.addColorStop(1, "#dccbaa");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1536, 512);
  ctx.fillStyle = "rgba(200,70,50,0.55)";
  ctx.beginPath();
  ctx.arc(1180, 120, 46, 0, Math.PI * 2);
  ctx.fill();
  for (const [base, tint, amp] of [
    [300, "rgba(110,120,120,0.35)", 140],
    [360, "rgba(70,85,85,0.45)", 110],
    [430, "rgba(40,55,50,0.6)", 80],
  ] as const) {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.moveTo(0, 512);
    for (let x = 0; x <= 1536; x += 16) ctx.lineTo(x, base - amp * Math.abs(Math.sin(x / 210 + base)) * (0.6 + 0.4 * Math.sin(x / 67)));
    ctx.lineTo(1536, 512);
    ctx.fill();
  }
  // A pine leaning in from the left.
  ctx.strokeStyle = "#3b2a1c";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(120, 512);
  ctx.quadraticCurveTo(170, 300, 330, 210);
  ctx.stroke();
  ctx.fillStyle = "rgba(40,70,45,0.85)";
  for (const [x, y, r] of [
    [330, 200, 60],
    [250, 250, 48],
    [400, 230, 40],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.6, r * 0.6, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Panel seams.
  ctx.fillStyle = "rgba(60,40,20,0.5)";
  for (let k = 1; k < 6; k++) ctx.fillRect(k * 256 - 2, 0, 4, 512);
  return picture(c);
}
/**
 * A surface's material: as given where a graphics card draws, plain Lambert (the colour and the picture alone) where
 * the processor draws, to keep the frame cheap there.
 */
let richRoom = false;
function shade(params: T.MeshStandardMaterialParameters, coat = 0): T.Material {
  if (richRoom) return coat ? glossy(params, coat) : new T.MeshStandardMaterial(params);
  const { color, map, emissive, emissiveIntensity, side } = params;
  return new T.MeshLambertMaterial({ color, map, emissive, emissiveIntensity, side });
}
const lathe = (points: number[][], segments = 32) =>
  new T.LatheGeometry(
    points.map(([x, y]) => new T.Vector2(x, y)),
    segments,
  );
/** A clay teapot: a round body, a lid with a knob, a spout and a loop of a handle. */
function teapot(own: Own, clay: T.Material) {
  const pot = new T.Group(),
    add = (g: T.BufferGeometry, x = 0, y = 0, z = 0) => {
      const m = new T.Mesh(own(g), clay);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      pot.add(m);
      return m;
    };
  add(lathe([[0, 0], [0.7, 0], [0.82, 0.08], [1.18, 0.5], [1.26, 0.9], [1.12, 1.32], [0.78, 1.56], [0.62, 1.6], [0, 1.6]], 36));
  add(lathe([[0, 1.58], [0.66, 1.58], [0.6, 1.74], [0.28, 1.8], [0.16, 1.86], [0.22, 1.98], [0.14, 2.08], [0, 2.1]], 28));
  const spout = new T.CatmullRomCurve3([new T.Vector3(1.0, 0.55, 0), new T.Vector3(1.55, 0.95, 0), new T.Vector3(1.8, 1.5, 0), new T.Vector3(2.0, 1.72, 0)]);
  add(new T.TubeGeometry(spout, 16, 0.14, 10, false));
  const handle = new T.Mesh(own(new T.TorusGeometry(0.55, 0.09, 10, 24, Math.PI * 1.25)), clay);
  handle.position.set(-1.15, 0.95, 0);
  handle.rotation.z = Math.PI * 0.38;
  handle.castShadow = true;
  pot.add(handle);
  return pot;
}
/** A celadon cup with tea in it. */
function cup(own: Own, china: T.Material, tea: T.Material) {
  const g = new T.Group(),
    body = new T.Mesh(own(lathe([[0, 0], [0.32, 0], [0.36, 0.06], [0.5, 0.6], [0.46, 0.6], [0.32, 0.1], [0, 0.1]], 28)), china),
    top = new T.Mesh(own(new T.CircleGeometry(0.44, 24).rotateX(-Math.PI / 2)), tea);
  top.position.y = 0.48;
  body.castShadow = true;
  g.add(body, top);
  return g;
}
/** A brass table lamp with a silk shade; the bulb's light where a graphics card draws. */
function lamp(own: Own, rich: boolean) {
  const g = new T.Group(),
    brass = own(shade({ color: "#b8893a", metalness: 0.8, roughness: 0.32 }, 0.6)),
    silk = own(shade({ color: "#f2d6a2", emissive: "#ffb85a", emissiveIntensity: rich ? 0.55 : 0.25, roughness: 0.9, side: T.DoubleSide }));
  const base = new T.Mesh(own(lathe([[0, 0], [0.9, 0], [0.95, 0.1], [0.6, 0.3], [0.2, 0.42], [0.14, 0.6], [0, 0.6]], 32)), brass);
  base.castShadow = true;
  const pole = new T.Mesh(own(new T.CylinderGeometry(0.07, 0.07, 3.2, 10)), brass);
  pole.position.y = 2.2;
  pole.castShadow = true;
  const hood = new T.Mesh(own(new T.CylinderGeometry(0.75, 1.35, 1.4, 24, 1, true)), silk);
  hood.position.y = 3.9;
  g.add(base, pole, hood);
  return g;
}
/**
 * Builds the room into `scene` round a mat of `matW` by `matD`; returns the tray of tiles taken (its middle at the
 * table's face) and the lamp's light (null where none is given).
 */
export function teaHouse(scene: T.Object3D, own: Own, rich: boolean, matW: number, matD: number, tray: { x: number; z: number }) {
  richRoom = rich;
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true, parent: T.Object3D = scene) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The table: a thick top of oxblood lacquer over the wood, a gilt line round its edge, and its legs only where a graphics card draws.
  const lacquer = own(shade({ ...planks(3.2, own, 2.4), color: "#8a3a2a", roughness: 0.42 }, 0.9)),
    top = add(block(TABLE.w, 0.9, TABLE.d, 0.28, rich ? 3 : 2), lacquer, 0, -0.45, 0);
  top.castShadow = false;
  const gilt = own(shade({ color: "#d4a648", metalness: 0.7, roughness: 0.35 })),
    inset = 1.1,
    lines = [
      new T.BoxGeometry(TABLE.w - 2 * inset, 0.01, 0.07).translate(0, 0.004, -TABLE.d / 2 + inset),
      new T.BoxGeometry(TABLE.w - 2 * inset, 0.01, 0.07).translate(0, 0.004, TABLE.d / 2 - inset),
      new T.BoxGeometry(0.07, 0.01, TABLE.d - 2 * inset).translate(-TABLE.w / 2 + inset, 0.004, 0),
      new T.BoxGeometry(0.07, 0.01, TABLE.d - 2 * inset).translate(TABLE.w / 2 - inset, 0.004, 0),
    ];
  add(mergeGeometries(lines)!, gilt, 0, 0, 0, false);
  lines.forEach((l) => l.dispose());
  const floor = add(new T.PlaneGeometry(120, 120), own(shade({ ...stuff("boards", "#5a3a26", 10, own), roughness: 0.6 })), 0, FLOOR, 0, false);
  floor.rotation.x = -Math.PI / 2;
  if (rich) {
    const legs = [-1, 1].flatMap((x) => [-1, 1].map((z) => block(1.3, -FLOOR - 0.9, 1.3, 0.2).translate(x * (TABLE.w / 2 - 1.6), (FLOOR - 0.9) / 2, z * (TABLE.d / 2 - 1.6))));
    add(mergeGeometries(legs)!, lacquer, 0, 0, 0, false);
    legs.forEach((l) => l.dispose());
  }
  // The rattan mat under the tiles.
  const mat = add(block(matW, MAT_H, matD, 0.01), own(shade({ map: own(matPicture(matW, matD)), roughness: 0.85 })), 0, MAT_H / 2, 0, false);
  mat.castShadow = false;
  // The tray the pairs go into: black lacquer with a red inside and a gilt rim.
  const trayGroup = new T.Group();
  trayGroup.position.set(tray.x, 0, tray.z);
  scene.add(trayGroup);
  const black = own(shade({ color: "#1a1412", roughness: 0.3 }, 1)),
    red = own(shade({ color: "#7a1e16", roughness: 0.55 }));
  const tw = 3.1,
    td = 4.9,
    wall = 0.16,
    wallH = 0.5;
  add(block(tw, 0.12, td, 0.05), red, 0, 0.06, 0, false, trayGroup);
  for (const [w, d, x, z] of [
    [tw, wall, 0, -td / 2 + wall / 2],
    [tw, wall, 0, td / 2 - wall / 2],
    [wall, td, -tw / 2 + wall / 2, 0],
    [wall, td, tw / 2 - wall / 2, 0],
  ])
    add(block(w, wallH, d, 0.05), black, x, wallH / 2, z, true, trayGroup);
  // The tea things at the far left, on a small round tray of bamboo.
  const tea = new T.Group();
  tea.position.set(-matW / 2 - 3.4, 0, -matD / 2 + 1.6);
  scene.add(tea);
  add(new T.CylinderGeometry(2.3, 2.3, 0.12, 40), own(shade({ map: own(matPicture(4.6, 4.6)), roughness: 0.8 })), 0, 0.06, 0, false, tea);
  const pot = teapot(own, own(shade({ color: "#7a3f28", roughness: 0.4 }, 0.5)));
  pot.position.set(-0.4, 0.12, -0.4);
  pot.rotation.y = 0.6;
  tea.add(pot);
  const china = own(shade({ color: "#a9c9b4", roughness: 0.25 }, 0.8)),
    liquor = own(shade({ color: "#a8762c", roughness: 0.12 }));
  for (const [x, z] of [
    [1.25, 0.9],
    [0.1, 1.45],
  ]) {
    const c = cup(own, china, liquor);
    c.position.set(x, 0.12, z);
    tea.add(c);
  }
  // The lamp at the far right.
  const light = lamp(own, rich);
  light.position.set(matW / 2 + 3.2, 0, -matD / 2 - 0.4);
  scene.add(light);
  let glow: T.PointLight | null = null;
  if (rich) {
    glow = new T.PointLight("#ffbf70", 26, 26, 1.6);
    glow.position.set(light.position.x, 3.6, light.position.z);
    scene.add(glow);
    // A folding screen behind the table and a potted plant beside it.
    const panel = own(shade({ map: own(screenPicture()), roughness: 0.9 })),
      frameWood = own(shade({ color: "#2a1a12", roughness: 0.6 })),
      screen = new T.Group();
    screen.position.set(0, FLOOR, -TABLE.d / 2 - 6);
    scene.add(screen);
    for (let k = 0; k < 6; k++) {
      const x = (k - 2.5) * 6.2,
        z = k % 2 ? 0.8 : 0,
        p = add(new T.PlaneGeometry(6, 14), panel, x, 7.4, z, false, screen);
      const uv = p.geometry.getAttribute("uv") as T.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 6);
      add(new T.BoxGeometry(6.2, 0.3, 0.3), frameWood, x, 14.45, z, false, screen);
      add(new T.BoxGeometry(0.3, 14.8, 0.3), frameWood, x - 3.1, 7.4, z, false, screen);
    }
    add(lathe([[0, 0], [1.8, 0], [2.3, 3.4], [2.5, 3.6], [0, 3.6]], 28), own(shade({ color: "#2f5a72", roughness: 0.3 }, 0.8)), -TABLE.w / 2 - 4, FLOOR, -TABLE.d / 2 + 2);
    const grove = new Grove(scene, own, { bright: 1.3, lift: 1.1 });
    grove.crown("broad", [-TABLE.w / 2 - 4, FLOOR + 6.4, -TABLE.d / 2 + 2], [3.2, 3.4, 3.2], "#4c7a3a");
    grove.crown("broad", [-TABLE.w / 2 - 3.2, FLOOR + 9, -TABLE.d / 2 + 1.4], [2.2, 2.2, 2.2], "#5a8a44", 1.1);
    grove.build();
  }
  return { tray: trayGroup, glow };
}
