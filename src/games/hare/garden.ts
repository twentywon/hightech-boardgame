import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Grove } from "../../engine/foliage";
import { block, capable, planks, stuff, wood } from "../../engine/scene-utils";
import { LINKS, PLACES } from "./rules";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** How far apart the points are, and the size of the field inside the frame. */
export const STEP = 2.1,
  FIELD_W = 11.9,
  FIELD_D = 7.5,
  /** The top of a stepping stone, where the animals stand. */
  STONE_TOP = 0.07,
  /** The lawn's colour, which the view clears to where the garden beyond the table is left out. */
  LAWN = "#7fa955";
const TABLE_TOP = -0.2,
  GROUND = -4.4;
/** Where a point of the board lies on the table. */
export const placeAt = (i: number) => ({ x: (PLACES[i].col - 2) * STEP, z: (PLACES[i].row - 1) * STEP });
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** The field of the board: a mown meadow with clover and daisies, the lines worn into it as paths of trodden earth. */
function field(size: number) {
  const W = size,
    H = Math.round((size * FIELD_D) / FIELD_W),
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    k = W / 1024,
    rnd = seeded(11),
    px = (i: number) => {
      const p = placeAt(i);
      return [W / 2 + (p.x / FIELD_W) * W, H / 2 + (p.z / FIELD_D) * H] as [number, number];
    };
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#6c9a49");
  g.addColorStop(1, "#5b8a3e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Mowing stripes, then blades of grass.
  for (let x = 0; x < W; x += 120 * k) {
    ctx.fillStyle = (x / (120 * k)) % 2 < 1 ? "rgba(255,255,210,0.05)" : "rgba(10,40,0,0.05)";
    ctx.fillRect(x, 0, 60 * k, H);
  }
  for (let i = 0; i < 9000 * k; i++) {
    const x = rnd() * W,
      y = rnd() * H;
    ctx.strokeStyle = rnd() < 0.55 ? "rgba(190,230,140,0.22)" : "rgba(20,60,10,0.25)";
    ctx.lineWidth = 1.4 * k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 5 * k, y - (5 + rnd() * 7) * k);
    ctx.stroke();
  }
  // Clover patches and daisies.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W,
      y = rnd() * H;
    ctx.fillStyle = "rgba(60,110,40,0.5)";
    for (let j = 0; j < 14; j++) {
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * 40 * k, y + (rnd() - 0.5) * 30 * k, 4 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W,
      y = rnd() * H;
    ctx.fillStyle = rnd() < 0.75 ? "#f6f3ea" : "#f2d04a";
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 2.6 * k, y + Math.sin(a) * 2.6 * k, 1.8 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#e8b72c";
    ctx.beginPath();
    ctx.arc(x, y, 1.4 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  // The paths: trodden earth with a soft worn edge and a scatter of pebbles.
  ctx.lineCap = "round";
  for (const [width, colour] of [
    [34, "rgba(96,72,40,0.35)"],
    [26, "#a88a5e"],
    [16, "#bea47a"],
  ] as [number, string][]) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * k;
    for (const [a, b] of LINKS) {
      ctx.beginPath();
      ctx.moveTo(...px(a));
      ctx.lineTo(...px(b));
      ctx.stroke();
    }
  }
  for (const [a, b] of LINKS) {
    const [ax, ay] = px(a),
      [bx, by] = px(b);
    for (let i = 0; i < 40; i++) {
      const t = rnd(),
        off = (rnd() - 0.5) * 22 * k;
      const len = Math.hypot(bx - ax, by - ay);
      ctx.fillStyle = rnd() < 0.5 ? "rgba(70,50,30,0.5)" : "rgba(235,222,196,0.7)";
      ctx.beginPath();
      ctx.arc(ax + (bx - ax) * t + (-(by - ay) / len) * off, ay + (by - ay) * t + ((bx - ax) / len) * off, (1 + rnd() * 1.8) * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Bare earth round each stepping stone.
  PLACES.forEach((_, i) => {
    const [x, y] = px(i),
      r = ctx.createRadialGradient(x, y, 40 * k, x, y, 70 * k);
    r.addColorStop(0, "#9c7f52");
    r.addColorStop(1, "rgba(156,127,82,0)");
    ctx.fillStyle = r;
    ctx.beginPath();
    ctx.arc(x, y, 70 * k, 0, Math.PI * 2);
    ctx.fill();
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = capable() ? 8 : 4;
  return t;
}
/** A paw print (four toes and a pad), white on clear, for the marks a move leaves. */
export function pawPrint() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(32, 40, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y] of [
    [16, 22],
    [26, 14],
    [38, 14],
    [48, 22],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 5.5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/**
 * The board and the garden round it: the meadow field in a frame of oak, a stepping stone at every point and tufts of
 * long grass in its corners, on a slatted garden table with a pot of flowers, carrots and a bone; where a graphics
 * card draws, a lawn, a hedge, trees and flower beds round the table (`Grove`).
 */
export function garden(scene: T.Scene, own: Own, rich: boolean) {
  const standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...o }));
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, cast = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const merged = (parts: T.BufferGeometry[], material: T.Material, cast = true) => {
    const mesh = new T.Mesh(own(mergeGeometries(parts)!), material);
    parts.forEach((p) => p.dispose());
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const rnd = seeded(5);
  // The garden table.
  // (Cut out under the board, so that what the board covers is never drawn twice.)
  const tableTop = new T.Shape([new T.Vector2(-9, -6.4), new T.Vector2(9, -6.4), new T.Vector2(9, 5.8), new T.Vector2(-9, 5.8)]);
  tableTop.holes.push(new T.Path([new T.Vector2(-6.2, -4.0), new T.Vector2(-6.2, 4.0), new T.Vector2(6.2, 4.0), new T.Vector2(6.2, -4.0)]));
  const slab = add(
    new T.ExtrudeGeometry(tableTop, { depth: 0.22, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }),
    standard(planks(1.9 / 18, own, 1.3 / 12.2)),
    0,
    TABLE_TOP - 0.28,
    0,
    false,
  );
  slab.rotation.x = -Math.PI / 2;
  const legWood = standard({ map: own(wood(true, 0.8)), color: "#8a6a50" });
  merged(
    [
      [-8.2, -5.2],
      [8.2, -5.2],
      [-8.2, 5.8],
      [8.2, 5.8],
    ].map(([x, z]) => block(0.5, TABLE_TOP - 0.3 - GROUND, 0.5, 0.05).translate(x, (TABLE_TOP - 0.3 + GROUND) / 2, z)),
    legWood,
    false,
  );
  // The field, and its oak frame.
  const edge = standard({ map: own(wood()), color: "#9b6e44", roughness: 0.55 });
  const top = standard({ map: own(field(rich ? 2048 : 1024)), roughness: 0.95 });
  add(new T.BoxGeometry(FIELD_W, 0.18, FIELD_D), [edge, edge, top, edge, edge, edge], 0, -0.09, 0, false);
  const frame: T.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    frame.push(block(FIELD_W + 0.7, 0.26, 0.35, 0.07).translate(0, -0.08, s * (FIELD_D / 2 + 0.175)));
    frame.push(block(0.35, 0.26, FIELD_D, 0.07).translate(s * (FIELD_W / 2 + 0.175), -0.08, 0));
  }
  merged(frame, edge);
  // A flat stepping stone at every point.
  const stone = new T.LatheGeometry(
      [
        [0, 0],
        [0.54, 0],
        [0.6, 0.03],
        [0.58, 0.06],
        [0.5, STONE_TOP],
        [0, STONE_TOP],
      ].map(([r, y]) => new T.Vector2(r, y)),
      28,
    ),
    stones: T.BufferGeometry[] = [];
  PLACES.forEach((_, i) => {
    const p = placeAt(i),
      g = stone.clone();
    g.scale(1 + (rnd() - 0.5) * 0.12, 1, 1 + (rnd() - 0.5) * 0.12).rotateY(rnd() * 3);
    stones.push(g.translate(p.x, -0.005, p.z));
  });
  stone.dispose();
  merged(stones, standard({ ...stuff("stone", "#8e877b", 0.6, own), roughness: 0.9 }), false);
  // Tufts of long grass in the corners of the field and along its sides, where no path runs.
  const blade = new T.ConeGeometry(0.035, 0.4, 3).translate(0, 0.2, 0),
    blades: T.BufferGeometry[] = [];
  const tufts: [number, number][] = [
    [-5.3, -3.2],
    [-5.4, 3.1],
    [5.3, -3.2],
    [5.4, 3.1],
    [-1.05, -3.3],
    [1.05, 3.3],
    [-3.15, 3.3],
    [3.15, -3.3],
  ];
  for (const [x, z] of tufts)
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2,
        r = rnd() * 0.28;
      blades.push(
        blade
          .clone()
          .scale(1, 0.6 + rnd() * 0.8, 1)
          .rotateX((rnd() - 0.5) * 0.7)
          .rotateZ((rnd() - 0.5) * 0.7)
          .translate(x + Math.cos(a) * r, 0, z + Math.sin(a) * r),
      );
    }
  blade.dispose();
  merged(blades, standard({ color: "#5f9440", roughness: 0.9 }), false);
  const grove = new Grove(scene, own, { near: 16, centre: [0, -3], shadow: false, bright: 1.45, lift: 1.2 });
  // The things on the table and the garden beyond only where a graphics card draws (under software drawing each
  // extra mesh costs a few milliseconds a frame, and the lawn as much again as the table): the view clears to the lawn's green.
  if (rich) {
    props(merged, add, standard, grove);
    lawn(scene, own, grove);
  }
  grove.build();
}
type Add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, cast?: boolean) => T.Mesh;
/** On the table: carrots at the hare's end, a bone at the hounds', and a pot of flowers at the back. */
function props(merged: (parts: T.BufferGeometry[], material: T.Material, cast?: boolean) => T.Mesh, add: Add, standard: (o: T.MeshStandardMaterialParameters) => T.Material, grove: Grove) {
  const carrot = standard({ color: "#e57a24", roughness: 0.7 }),
    tops = standard({ color: "#4d8a35", roughness: 0.9 });
  const roots: T.BufferGeometry[] = [],
    greens: T.BufferGeometry[] = [];
  for (const [x, z, turn] of [
    [7.2, -2.9, 0.4],
    [7.7, -2.2, -0.3],
  ]) {
    roots.push(new T.ConeGeometry(0.12, 0.8, 12).rotateZ(Math.PI / 2).rotateY(turn).translate(x, TABLE_TOP + 0.12, z));
    greens.push(new T.ConeGeometry(0.1, 0.4, 5).rotateZ(-Math.PI / 2).rotateY(turn).translate(x - Math.cos(turn) * 0.58, TABLE_TOP + 0.13, z + Math.sin(turn) * 0.58));
  }
  merged(roots, carrot);
  merged(greens, tops);
  // The bone: a shaft with two knobs at each end, one mesh.
  const bone = standard({ color: "#efe6d2", roughness: 0.6 }),
    knobs = [new T.CapsuleGeometry(0.07, 0.6, 4, 10).rotateZ(Math.PI / 2).toNonIndexed()];
  for (const s of [-1, 1]) for (const t of [-1, 1]) knobs.push(new T.SphereGeometry(0.09, 10, 8).translate(s * 0.37, 0.01, t * 0.06).toNonIndexed());
  merged(
    knobs.map((g) => g.rotateY(0.5).translate(-7.3, TABLE_TOP + 0.08, -1.6)),
    bone,
  );
  add(
    new T.LatheGeometry(
      [
        [0, 0],
        [0.38, 0],
        [0.5, 0.75],
        [0.56, 0.78],
        [0.58, 0.9],
        [0.46, 0.9],
      ].map(([r, y]) => new T.Vector2(r, y)),
      24,
    ),
    standard({ color: "#c0673f", roughness: 0.9, side: T.DoubleSide }),
    -7.6,
    TABLE_TOP,
    -4.2,
  );
  grove.crown("blossom", [-7.6, TABLE_TOP + 1.35, -4.2], [0.7, 0.55, 0.7], "#f6d36b", 4);
}
/** The lawn, the hedge, two trees and the flower beds round the table. */
function lawn(scene: T.Scene, own: Own, grove: Grove) {
  const standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...o }));
  const ground = new T.Mesh(own(new T.PlaneGeometry(160, 160).rotateX(-Math.PI / 2)), standard({ ...stuff("grass", LAWN, 24, own), roughness: 1 }));
  ground.position.y = GROUND;
  ground.receiveShadow = true;
  scene.add(ground);
  const bed = new T.Mesh(own(block(48, 0.3, 2.6, 0.1)), standard({ ...stuff("earth", "#6b4a33", 4, own, 1), roughness: 1 }));
  bed.position.set(0, GROUND + 0.1, -12.5);
  scene.add(bed);
  for (let x = -23; x <= 23; x += 2.1) grove.crown("box", [x, GROUND + 1.3, -12.5 + Math.sin(x) * 0.15], [1.35, 1.45, 1.1], x % 4 < 2 ? "#4f8a3c" : "#57924a", x);
  const bark = standard({ map: own(wood(true, 0.6)), color: "#7a5a44", roughness: 1 });
  for (const [x, z, s] of [
    [-12, -16, 1.2],
    [11.5, -17, 1.3],
  ]) {
    const trunk = new T.Mesh(own(new T.CylinderGeometry(0.28 * s, 0.42 * s, 6 * s, 10)), bark);
    trunk.position.set(x, GROUND + 3 * s, z);
    scene.add(trunk);
    grove.crown("oak", [x, GROUND + 6.4 * s, z], [3 * s, 2.6 * s, 3 * s], "#5f9445", x);
    grove.crown("oak", [x + 1.6 * s, GROUND + 7.4 * s, z + 0.6], 1.9 * s, "#6a9e4c", x + 1);
  }
  const blooms = ["#f2a7c3", "#fff3f6", "#f6c86a", "#d9a2f0"];
  for (const side of [-1, 1])
    for (let k = 0; k < 5; k++) {
      const x = side * (12.5 + (k % 2) * 1.3),
        z = -6 + k * 2.8;
      if (k % 2) grove.crown("box", [x, GROUND + 0.75, z], 0.85, "#4c8a3e", k);
      else grove.crown("blossom", [x, GROUND + 0.8, z], [1.1, 0.85, 1.1], blooms[(k + (side > 0 ? 1 : 0)) % blooms.length], k + side);
    }
}
