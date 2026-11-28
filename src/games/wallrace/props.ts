import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, glossy, wood, woodPhoto } from "../../engine/scene-utils";
import { CELLS, N } from "./rules";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A square's step, the height of the squares' faces, and where the storage grooves run. */
export const STEP = 1,
  FACE_Y = 0.1,
  /** A wall: its length, height and thickness. */
  SLAT = { long: 2 * STEP - 0.2, high: 0.5, thick: 0.14 },
  /** The two grooves beside each side's edge where its walls wait, end to end, five to a groove. */
  STORE_Z = [N * STEP * 0.5 + 0.55, N * STEP * 0.5 + 0.95];
const lathe = (points: [number, number][], segments = 32) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/** A seeded random, so that the grain falls the same way every time. */
function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** Wood that may be read anywhere: the photograph repeats. */
function grain(own: Own, dark: boolean, figure = 1) {
  const t = own(wood(dark, figure));
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/**
 * The board: a thick walnut body with storage grooves along both near and far edges, and the 81 squares as raised
 * pads of oiled oak with grooves between them where walls are set. The squares of each side's goal row are stained
 * in its colour. Squares are merged into three meshes, one for each finish.
 */
export function board(scene: T.Scene, own: Own, colors: [string, string]) {
  const rich = capable(),
    half = N * STEP * 0.5,
    body = new T.Mesh(own(block(N * STEP + 0.7, 0.5, N * STEP + 2.6, 0.12)), own(new T.MeshStandardMaterial({ map: grain(own, true), color: "#8a6248", roughness: 0.5 })));
  body.position.y = -0.25;
  body.receiveShadow = body.castShadow = true;
  scene.add(body);
  // The floor of the grooves between the squares, darker than the body.
  const bed = new T.Mesh(own(new T.PlaneGeometry(N * STEP + 0.1, N * STEP + 0.1).rotateX(-Math.PI / 2)), own(new T.MeshStandardMaterial({ color: "#2a1b12", roughness: 0.9 })));
  bed.position.y = 0.002;
  bed.receiveShadow = true;
  scene.add(bed);
  // The storage grooves: dark slots in the body's top.
  const slot = own(new T.MeshStandardMaterial({ color: "#1d130c", roughness: 1 }));
  for (const sign of [-1, 1])
    for (const z of STORE_Z) {
      const groove = new T.Mesh(own(new T.PlaneGeometry(N * STEP - 0.2, 0.2).rotateX(-Math.PI / 2)), slot);
      groove.position.set(0, 0.003, sign * z);
      groove.receiveShadow = true;
      scene.add(groove);
    }
  const rand = seeded(907),
    rows: T.BufferGeometry[][] = [[], [], []];
  for (let cell = 0; cell < CELLS; cell++) {
    const row = Math.floor(cell / N),
      pad = block(STEP - 0.2, FACE_Y, STEP - 0.2, 0.035),
      uv = pad.getAttribute("uv"),
      du = rand(),
      dv = rand(),
      // The grain runs across the board on alternate squares, as if each were cut from its own board.
      across = rand() < 0.5;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i) * 0.3,
        v = uv.getY(i) * 0.3;
      uv.setXY(i, (across ? v : u) + du, (across ? u : v) + dv);
    }
    pad.translate((cell % N) * STEP - half + STEP / 2, FACE_Y / 2, row * STEP - half + STEP / 2);
    rows[row === 0 ? 1 : row === N - 1 ? 2 : 0].push(pad);
  }
  const oak = grain(own, false),
    finishes = [
      { color: "#b48256", roughness: 0.55 },
      { color: colors[0], roughness: 0.5 },
      { color: colors[1], roughness: 0.5 },
    ];
  rows.forEach((pads, k) => {
    const merged = own(mergeGeometries(pads)!);
    pads.forEach((p) => p.dispose());
    const material = own(rich ? glossy({ map: oak, ...finishes[k] }, 0.25) : new T.MeshStandardMaterial({ map: oak, ...finishes[k] }));
    const mesh = new T.Mesh(merged, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    scene.add(mesh);
  });
}
/** Pale maple: the light photograph washed over a cream ground, so that only its figure shows. */
function maple(own: Own) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!,
    t = own(new T.CanvasTexture(c));
  ctx.fillStyle = "#efdcb4";
  ctx.fillRect(0, 0, 512, 512);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  woodPhoto("light", (image) => {
    ctx.globalAlpha = 0.4;
    ctx.drawImage(image, 0, 0, 512, 512);
    ctx.globalAlpha = 1;
    t.needsUpdate = true;
  });
  return t;
}
/** The solid of a wall, and the pale maple it is made of. */
export function slat(own: Own) {
  const geometry = own(block(SLAT.long, SLAT.high, SLAT.thick, 0.035)),
    map = maple(own),
    material = own(capable() ? glossy({ map, roughness: 0.45 }, 0.3) : new T.MeshStandardMaterial({ map, roughness: 0.5 }));
  return { geometry, material };
}
/** A turned pawn: a wide foot, a waist, a collar and a ball on top, lacquered in its colour. About 0.78 tall. */
export function pawnGeometry() {
  const points: [number, number][] = [
    [0, 0],
    [0.3, 0],
    [0.32, 0.03],
    [0.3, 0.08],
    [0.24, 0.11],
    [0.2, 0.15],
    [0.17, 0.25],
    [0.13, 0.42],
    [0.11, 0.48],
    [0.17, 0.5],
    [0.18, 0.53],
    [0.12, 0.56],
  ];
  for (let i = 0; i <= 12; i++) {
    const a = -1.2 + ((Math.PI / 2 + 1.2) * i) / 12;
    points.push([0.15 * Math.cos(a), 0.63 + 0.15 * Math.sin(a)]);
  }
  return lathe(points, 32);
}
/**
 * Round the board: the game's box lid at the left with its name, a mug of tea and a sand timer at the right.
 */
export function surroundings(scene: T.Scene, own: Own) {
  const rich = capable(),
    standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...o }));
  // The lid: a shallow box of card, its top printed.
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#24402f";
  ctx.fillRect(0, 0, 512, 1024);
  ctx.strokeStyle = "#e7cf94";
  ctx.lineWidth = 10;
  ctx.strokeRect(28, 28, 456, 968);
  // A little board on the lid: a grid with two pawns and a wall.
  ctx.lineWidth = 3;
  for (let k = 0; k <= 5; k++) {
    ctx.beginPath();
    ctx.moveTo(116 + k * 56, 300);
    ctx.lineTo(116 + k * 56, 580);
    ctx.moveTo(116, 300 + k * 56);
    ctx.lineTo(396, 300 + k * 56);
    ctx.stroke();
  }
  ctx.fillStyle = colorsOnLid[0];
  ctx.beginPath();
  ctx.arc(256, 524, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colorsOnLid[1];
  ctx.beginPath();
  ctx.arc(256, 356, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f3dfb6";
  ctx.fillRect(172, 408, 112, 10);
  ctx.fillStyle = "#e7cf94";
  ctx.textAlign = "center";
  ctx.font = '700 120px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  ctx.fillText("길막기", 256, 220);
  ctx.font = '600 44px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.fillText("WALL RACE", 256, 700);
  ctx.font = '400 30px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  ctx.fillText("달리거나, 막거나", 256, 760);
  const print = own(new T.CanvasTexture(c));
  print.colorSpace = T.SRGBColorSpace;
  print.anisotropy = 4;
  const card = standard({ color: "#24402f", roughness: 0.7 }),
    lid = new T.Mesh(own(block(3.2, 0.3, 6.2, 0.04)), [card, card, standard({ map: print, roughness: 0.6 }), card, card, card]);
  lid.position.set(-8.4, 0.15, 0.6);
  lid.rotation.y = 0.12;
  lid.castShadow = lid.receiveShadow = true;
  scene.add(lid);
  // A mug of tea.
  const glaze = own(glossy({ color: "#d8dde3", roughness: 0.3 }, 0.7)),
    mug = new T.Mesh(own(lathe([[0, 0], [0.42, 0], [0.46, 0.05], [0.47, 0.9], [0.43, 0.9], [0.42, 0.12], [0, 0.12]])), glaze),
    handle = new T.Mesh(own(new T.TorusGeometry(0.22, 0.05, 8, 20, Math.PI * 1.2)), glaze),
    tea = new T.Mesh(own(new T.CircleGeometry(0.43, 28).rotateX(-Math.PI / 2)), standard({ color: "#7a3f16", roughness: 0.15 }));
  handle.position.set(0.47, 0.47, 0);
  handle.rotation.z = -Math.PI * 0.6;
  tea.position.y = 0.72;
  const cup = new T.Group();
  cup.add(mug, handle, tea);
  cup.traverse((m) => (m.castShadow = m.receiveShadow = true));
  cup.position.set(7.6, 0, -3.4);
  cup.rotation.y = 2.4;
  scene.add(cup);
  // A sand timer: two turned ends, three posts and the glass between.
  const timber = standard({ map: grain(own, true), color: "#9a7050", roughness: 0.5 }),
    timer = new T.Group(),
    end = own(new T.CylinderGeometry(0.42, 0.42, 0.1, 24));
  for (const y of [0.05, 1.35]) {
    const disc = new T.Mesh(end, timber);
    disc.position.y = y;
    timer.add(disc);
  }
  const post = own(new T.CylinderGeometry(0.035, 0.035, 1.2, 8));
  for (let k = 0; k < 3; k++) {
    const p = new T.Mesh(post, timber);
    p.position.set(Math.cos((k * Math.PI * 2) / 3) * 0.34, 0.7, Math.sin((k * Math.PI * 2) / 3) * 0.34);
    timer.add(p);
  }
  const glass = new T.Mesh(
      own(lathe([[0.02, 0.1], [0.24, 0.14], [0.26, 0.4], [0.06, 0.66], [0.04, 0.7], [0.06, 0.74], [0.26, 1.0], [0.24, 1.26], [0.02, 1.3]], 24)),
      own(new T.MeshStandardMaterial({ color: "#dfeef2", roughness: 0.1, transparent: true, opacity: rich ? 0.35 : 0.45, depthWrite: false })),
    ),
    sand = new T.Mesh(own(lathe([[0, 0.14], [0.22, 0.16], [0.2, 0.28], [0, 0.4]], 20)), standard({ color: "#e2c48a", roughness: 1 }));
  timer.add(sand, glass);
  timer.traverse((m) => (m.castShadow = true));
  glass.castShadow = false;
  timer.position.set(7.4, 0, 2.6);
  timer.scale.setScalar(0.75);
  scene.add(timer);
}
const colorsOnLid = ["#c8452f", "#2f62c0"];
