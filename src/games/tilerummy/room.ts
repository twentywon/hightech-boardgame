import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Grove } from "../../engine/foliage";
import { block, glossy, planks, stuff, weave, wood } from "../../engine/scene-utils";

/**
 * Where tile rummy is played: a living room of our own. The tiles lie on a broad oak coffee table; each side has
 * a wooden rack (mine a two-tier slope that holds its tiles up to be read, the computer's a pair of rails its tiles
 * stand against, backs to me); the tiles still to be drawn are in a drawstring bag. On the table a bowl of
 * tangerines, a score pad with a pencil and two cups of barley tea; below it a wooden floor and a rug (no light
 * patches lie on it: the user asked), and round the edges of the view a sofa, a floor cushion and a plant.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The height of the floor under the table. */
export const FLOOR = -10.6;
/** How far my tiles lean back from lying flat, and the computer's from standing upright. */
export const LEAN = 0.45,
  STAND = 0.24;
/** The rows of the racks along z, and the height each row's tiles stand on. */
export const MINE = [
    { z: 4.5, h: 0.3 },
    { z: 5.74, h: 0.08 },
  ],
  THEIRS = [
    { z: -6.0, h: 0.12 },
    { z: -7.24, h: 0.12 },
  ];
/** Where the bag stands, and the height of its mouth. */
export const BAG = { x: 9.7, z: -2.4, mouth: 1.6 };
const RACK_LENGTH = 16.4;

/** A slope a row of tiles lies on, with a lip along its foot: a profile across z, run along x. */
function ramp(z: number, h: number, angle: number, depth: number, toward: 1 | -1) {
  const half = (depth / 2) * Math.cos(angle),
    foot = z + toward * half,
    head = z - toward * half,
    rise = depth * Math.sin(angle),
    // Points across (z, y), drawn on a shape whose x is −z (see below).
    points: [number, number][] = [
      [foot + toward * 0.12, 0],
      [foot + toward * 0.12, h + 0.17],
      [foot + toward * 0.03, h + 0.17],
      [foot + toward * 0.03, h],
      [head, h + rise],
      [head - toward * 0.08, h + rise],
      [head - toward * 0.08, 0],
    ],
    shape = new T.Shape(points.map(([pz, py]) => new T.Vector2(-pz, py)));
  const geometry = new T.ExtrudeGeometry(shape, { depth: RACK_LENGTH, bevelEnabled: false });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-RACK_LENGTH / 2, 0, 0);
  return geometry;
}
/** My rack: a base board and two sloped rows, the far one a step higher. */
function myRack() {
  const parts = [block(RACK_LENGTH + 0.3, 0.1, 2.75, 0.04).translate(0, 0.05, 5.1).toNonIndexed(), ...MINE.map((row) => ramp(row.z, row.h, LEAN, 1.12, 1))];
  return parts;
}
/** The computer's rack: a base board and for each row a lip on its side and a rail on mine that its tiles lean on. */
function theirRack() {
  const parts: T.BufferGeometry[] = [block(RACK_LENGTH + 0.3, 0.1, 2.75, 0.04).translate(0, 0.05, -6.62)];
  for (const row of THEIRS) {
    parts.push(block(RACK_LENGTH, 0.2, 0.12, 0.03).translate(0, 0.2, row.z - 0.36));
    parts.push(block(RACK_LENGTH, 0.55, 0.14, 0.04).rotateX(0.24).translate(0, 0.36, row.z + 0.34));
  }
  return parts.map((g) => g.toNonIndexed());
}
function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function picture(c: HTMLCanvasElement) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A score pad: ruled paper with a column for each of us and a few sums pencilled in. */
function padPicture() {
  const { c, ctx } = canvas(256, 352);
  ctx.fillStyle = "#fbf8ee";
  ctx.fillRect(0, 0, 256, 352);
  ctx.strokeStyle = "rgba(70,110,170,0.5)";
  ctx.lineWidth = 2;
  for (let y = 70; y < 352; y += 26) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(242, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(200,60,60,0.55)";
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(128, 340);
  ctx.stroke();
  ctx.fillStyle = "#3a3d44";
  ctx.font = "700 26px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("나", 70, 56);
  ctx.fillText("컴퓨터", 190, 56);
  ctx.font = "italic 24px Georgia, serif";
  ctx.fillStyle = "#4b4f58";
  [
    ["-12", "+12"],
    ["+31", "-31"],
    ["-7", "+7"],
  ].forEach(([a, b], k) => {
    ctx.fillText(a, 70, 92 + k * 26);
    ctx.fillText(b, 190, 92 + k * 26);
  });
  ctx.fillStyle = "#2b2f6a";
  ctx.fillRect(0, 0, 256, 24);
  return picture(c);
}
/** A rug of our own under the table: a soft grey-blue field with a border. */
function rugPicture() {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#8c96a3";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#e6dccb";
  ctx.lineWidth = 14;
  ctx.strokeRect(30, 30, 452, 452);
  ctx.strokeStyle = "#5e6876";
  ctx.lineWidth = 5;
  ctx.strokeRect(54, 54, 404, 404);
  let seed = 3;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? "255,255,255" : "0,0,0"},${rand() * 0.06})`;
    ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }
  return picture(c);
}
const lathe = (points: number[][], segments = 28) =>
  new T.LatheGeometry(
    points.map(([x, y]) => new T.Vector2(x, y)),
    segments,
  );
/** Builds the room into `scene`; returns the bag, whose fullness follows the tiles left in it. */
export function livingRoom(scene: T.Object3D, own: Own, rich: boolean) {
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true, parent: T.Object3D = scene) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The coffee table: a thick oak top with rounded edges and four square legs.
  const oak = own(new T.MeshStandardMaterial({ ...planks(2.8, own, 2.2), color: "#d9c2a8" })),
    top = add(block(22.6, 0.7, 17.4, 0.22, rich ? 3 : 2), oak, 0, -0.35, -0.65);
  top.castShadow = false;
  const legs = [-1, 1].flatMap((x) => [-1, 1].map((z) => new T.BoxGeometry(1.1, 9.9, 1.1).translate(x * 10.2, FLOOR + 4.95, -0.65 + z * 7.6)));
  add(mergeGeometries(legs)!, oak, 0, 0, 0, false);
  legs.forEach((g) => g.dispose());
  // The floor and the rug under the table.
  const floor = add(new T.PlaneGeometry(90, 90), own(new T.MeshStandardMaterial({ ...stuff("boards", "#9c6c44", 9, own), roughness: 0.5 })), 0, FLOOR, 0, false);
  floor.rotation.x = -Math.PI / 2;
  const rug = add(new T.PlaneGeometry(46, 36), own(new T.MeshStandardMaterial({ map: own(rugPicture()), roughness: 1, ...weave(12, 10, own, 0.8) })), 0, FLOOR + 0.02, -0.6, false);
  rug.rotation.x = -Math.PI / 2;
  // The racks, of a darker wood.
  const beech = own(wood(false, 0.7));
  beech.repeat.set(0.12, 0.5);
  const rackWood = own(glossy({ map: beech, roughness: 0.45 }, 0.3)),
    mine = myRack(),
    theirs = theirRack();
  add(mergeGeometries(mine)!, rackWood, 0, 0, 0);
  add(mergeGeometries(theirs)!, rackWood, 0, 0, 0);
  [...mine, ...theirs].forEach((g) => g.dispose());
  // The bag: a green cotton pouch drawn shut at the neck with a gold cord.
  const bag = new T.Group();
  bag.position.set(BAG.x, 0, BAG.z);
  scene.add(bag);
  const cloth = own(new T.MeshStandardMaterial({ color: "#2f5d46", roughness: 0.92, ...weave(3, 3, own, 1.2) }));
  add(lathe([[0, 0], [0.9, 0.02], [1.18, 0.35], [1.22, 0.8], [1.0, 1.2], [0.5, 1.45], [0.42, 1.52], [0.6, 1.66], [0.66, 1.76], [0.4, 1.8], [0, 1.78]], 30), cloth, 0, 0, 0, true, bag);
  const cord = own(new T.MeshStandardMaterial({ color: "#d8b24a", roughness: 0.5, metalness: 0.3 }));
  add(new T.TorusGeometry(0.47, 0.05, 8, 28).rotateX(Math.PI / 2), cord, 0, 1.48, 0, true, bag);
  add(new T.CylinderGeometry(0.04, 0.04, 1.0, 6).rotateZ(1.1), cord, 0.72, 1.2, 0.3, true, bag);
  // A bowl of tangerines at the far left.
  const bowl = new T.Group();
  bowl.position.set(-9.8, 0, -7.4);
  scene.add(bowl);
  add(lathe([[0, 0], [0.9, 0], [1.6, 0.5], [2.0, 1.1], [1.92, 1.12], [1.5, 0.6], [0.8, 0.12], [0, 0.12]], 32), own(glossy({ color: "#f1ece2", roughness: 0.25 }, 0.8)), 0, 0, 0, true, bowl);
  const peel = own(new T.MeshStandardMaterial({ color: "#f08a1c", roughness: 0.55 })),
    leaf = own(new T.MeshStandardMaterial({ color: "#3f7a32", roughness: 0.6 })),
    fruit = own(new T.SphereGeometry(0.62, 18, 12).scale(1, 0.82, 1)),
    sprig = own(new T.ConeGeometry(0.12, 0.4, 5).rotateZ(Math.PI / 2.4));
  for (const [x, y, z] of [
    [-0.5, 0.65, 0.2],
    [0.55, 0.65, -0.2],
    [0.05, 0.65, -0.75],
    [0.1, 0.62, 0.75],
    [0, 1.25, 0],
  ]) {
    const m = new T.Mesh(fruit, peel);
    m.position.set(x, y, z);
    m.castShadow = true;
    bowl.add(m);
    const s = new T.Mesh(sprig, leaf);
    s.position.set(x + 0.1, y + 0.52, z);
    bowl.add(s);
  }
  // A score pad and a pencil at the near left.
  const pad = add(block(2.2, 0.12, 3.0, 0.04), [own(new T.MeshStandardMaterial({ color: "#f3efe4" })), own(new T.MeshStandardMaterial({ color: "#f3efe4" })), own(new T.MeshStandardMaterial({ map: own(padPicture()), roughness: 0.9 })), own(new T.MeshStandardMaterial({ color: "#2b2f6a" })), own(new T.MeshStandardMaterial({ color: "#f3efe4" })), own(new T.MeshStandardMaterial({ color: "#f3efe4" }))], -9.45, 0.06, 4.3);
  pad.rotation.y = 0.12;
  const pencil = add(new T.CylinderGeometry(0.07, 0.07, 2.6, 6).rotateZ(Math.PI / 2), own(new T.MeshStandardMaterial({ color: "#e9b83a", roughness: 0.6 })), -9.0, 0.1, 6.2);
  pencil.rotation.y = 0.5;
  // Two cups of barley tea on coasters at the near right.
  const cup = own(lathe([[0, 0], [0.5, 0], [0.56, 0.1], [0.66, 1.1], [0.6, 1.1], [0.52, 0.16], [0, 0.16]], 28)),
    china = own(glossy({ color: "#e9eef0", roughness: 0.2 }, 0.8)),
    tea = own(new T.MeshStandardMaterial({ color: "#8a5a2a", roughness: 0.15 })),
    surfaceOfTea = own(new T.CircleGeometry(0.6, 24).rotateX(-Math.PI / 2)),
    coaster = own(new T.CylinderGeometry(0.85, 0.85, 0.06, 28)),
    cork = own(new T.MeshStandardMaterial({ color: "#b98a5a", roughness: 0.95 }));
  for (const [x, z] of [
    [9.15, 5.95],
    [9.35, 3.75],
  ]) {
    const c = new T.Mesh(cup, china),
      t = new T.Mesh(surfaceOfTea, tea),
      k = new T.Mesh(coaster, cork);
    c.position.set(x, 0.06, z);
    t.position.set(x, 0.86, z);
    k.position.set(x, 0.03, z);
    c.castShadow = true;
    k.receiveShadow = c.receiveShadow = true;
    scene.add(k, c, t);
  }
  if (rich) {
    // A sofa beyond the computer's side, a floor cushion and a potted plant, seen round the table's edges.
    const fabric = own(new T.MeshStandardMaterial({ color: "#7f8f7a", roughness: 0.95, ...weave(4, 4, own, 1) })),
      sofa = new T.Group();
    sofa.position.set(0, FLOOR, -17);
    scene.add(sofa);
    add(block(26, 4, 7, 0.8), fabric, 0, 2.6, 0, true, sofa);
    add(block(26, 7, 2.2, 0.9), fabric, 0, 5.5, -3.2, true, sofa);
    for (const x of [-12.4, 12.4]) add(block(2.4, 6, 7.4, 0.9), fabric, x, 3.3, 0, true, sofa);
    for (const x of [-6, 0, 6]) add(block(5.6, 1.4, 5.8, 0.6), fabric, x, 5.2, 0.4, true, sofa);
    const cushion = add(block(6, 1.4, 6, 0.65), own(new T.MeshStandardMaterial({ color: "#c46a4a", roughness: 0.95, ...weave(2, 2, own, 1) })), 15.5, FLOOR + 0.7, 6.5);
    cushion.rotation.y = 0.3;
    add(lathe([[0, 0], [1.6, 0], [2.1, 3.2], [2.3, 3.4], [0, 3.4]], 28), own(new T.MeshStandardMaterial({ color: "#d8d2c4", roughness: 0.6 })), -16, FLOOR, -6);
    const grove = new Grove(scene, own, { bright: 1.4, lift: 1.2 });
    grove.crown("broad", [-16, FLOOR + 6.2, -6], [3.0, 3.2, 3.0], "#4c8a3e");
    grove.crown("broad", [-15.2, FLOOR + 8.6, -6.6], [2.0, 2.0, 2.0], "#57964a", 1.1);
    grove.build();
    const second = add(block(5.4, 1.3, 5.4, 0.6), own(new T.MeshStandardMaterial({ color: "#d9b44a", roughness: 0.95, ...weave(2, 2, own, 1) })), -15.5, FLOOR + 0.65, 5.5);
    second.rotation.y = -0.4;
  }
  return bag;
}
