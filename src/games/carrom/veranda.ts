import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Grove } from "../../engine/foliage";
import { block, glossy, weave, wood } from "../../engine/scene-utils";
import { FLOOR } from "./board";

/**
 * Where carrom is played here: a shaded veranda of our own with a floor of patterned cement tiles, a striped cotton
 * rug under the board's stand, and round it a brass tumbler and saucer of coffee, a tin of board powder with some
 * spilled, a round floor cushion, a pair of sandals, a brass lamp, a potted basil plant and two turned pillars at
 * the back (the plant and the pillars only where a graphics card draws). All in code.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function texture(c: HTMLCanvasElement, repeat = 1) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}
/** One cement tile of our own pattern: a cream flower on terracotta, teal quarter rounds meeting at the corners. */
function tilePicture() {
  const { c, ctx } = canvas(256),
    m = 128;
  ctx.fillStyle = "#8a3d2e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#46625a";
  for (const [x, y] of [
    [0, 0],
    [256, 0],
    [0, 256],
    [256, 256],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 54, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#c4ad88";
  for (const [x, y] of [
    [0, 0],
    [256, 0],
    [0, 256],
    [256, 256],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#d2b98f";
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.ellipse(m + Math.cos(a) * 34, m + Math.sin(a) * 34, 32, 13, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#b77e2c";
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    ctx.beginPath();
    ctx.ellipse(m + Math.cos(a) * 26, m + Math.sin(a) * 26, 18, 7, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(m, m, 15, 0, Math.PI * 2);
  ctx.fillStyle = "#3a5e58";
  ctx.fill();
  // Thin joints, and a little wear.
  ctx.strokeStyle = "rgba(60,30,20,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  let seed = 5;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? "255,240,220" : "40,20,10"},${rand() * 0.08})`;
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 4);
  }
  return c;
}
/** Red oxide: a deep, slightly mottled red, polished. */
function oxidePicture() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = "#7a2e22";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 21;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 260; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1),
      x = rand() * 256,
      y = rand() * 256,
      r = 8 + rand() * 30;
    g.addColorStop(0, `rgba(${rand() < 0.5 ? "150,60,40" : "70,22,16"},${0.12 + rand() * 0.12})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r, r);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  return c;
}
/** A flat-woven cotton rug: indigo with bands of cream and saffron, small zigzags and a fringe at each end. */
function rugPicture() {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#273a66";
  ctx.fillRect(0, 0, 512, 512);
  const band = (y: number, h: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(0, y, 512, h);
  };
  for (const y of [34, 446]) {
    band(y, 32, "#e8dcc0");
    band(y + 10, 12, "#d9822b");
  }
  for (const y of [120, 360]) {
    band(y, 30, "#e8dcc0");
    ctx.strokeStyle = "#b8452c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, y + (x % 32 ? 6 : 24));
    ctx.stroke();
  }
  band(230, 52, "#d9822b");
  ctx.fillStyle = "#e8dcc0";
  for (let x = 8; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 256);
    ctx.lineTo(x + 12, 240);
    ctx.lineTo(x + 24, 256);
    ctx.lineTo(x + 12, 272);
    ctx.fill();
  }
  // The threads of the weave across the bands.
  for (let y = 0; y < 512; y += 3) {
    ctx.fillStyle = `rgba(0,0,0,${y % 6 ? 0.06 : 0.02})`;
    ctx.fillRect(0, y, 512, 1);
  }
  for (const y of [0, 500]) {
    ctx.fillStyle = "#efe6d0";
    for (let x = 2; x < 512; x += 6) ctx.fillRect(x, y, 3, 12);
  }
  return c;
}
/** The label of the powder tin: our own, a plain word and a star. */
function tinLabel() {
  const { c, ctx } = canvas(256, 128);
  ctx.fillStyle = "#1f6d8c";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#f2d14b";
  ctx.fillRect(0, 14, 256, 8);
  ctx.fillRect(0, 106, 256, 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 34px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("POWDER", 128, 66);
  return c;
}
/** A soft round heap of spilled powder, darkest nowhere: white fading out. */
function powderPicture() {
  const { c, ctx } = canvas(128);
  let seed = 9;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.5, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    const a = rand() * Math.PI * 2,
      r = 40 + rand() * 22;
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.5})`;
    ctx.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 1.5, 1.5);
  }
  return new T.CanvasTexture(c);
}
/** A block-printed cotton cover for the floor cushion. */
function cushionPicture() {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = "#a8362a";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#e9c46a";
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, 220, 220);
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 30, 196, 196);
  ctx.fillStyle = "#e9c46a";
  for (let y = 52; y < 220; y += 38)
    for (let x = 52; x < 220; x += 38) {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) ctx.ellipse(x, y, 9, 3.4, (k * Math.PI) / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.fillStyle = "#2c3f6b";
  for (let y = 52; y < 220; y += 38)
    for (let x = 52; x < 220; x += 38) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  return texture(c);
}
const lathe = (points: number[][], segments = 28) =>
  new T.LatheGeometry(
    points.map(([x, y]) => new T.Vector2(x, y)),
    segments,
  );
/** Builds the veranda round a board whose stand stands on `FLOOR`. */
export function veranda(scene: T.Object3D, own: Own, rich: boolean) {
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  // Polished red oxide round a square laid with patterned tiles inside a plain border.
  const oxide = own(new T.MeshStandardMaterial({ map: own(texture(oxidePicture(), 10)), roughness: rich ? 0.3 : 0.6 })),
    floor = add(new T.PlaneGeometry(90, 90), oxide, 0, FLOOR, 0, false);
  floor.rotation.x = -Math.PI / 2;
  const tiles = own(new T.MeshStandardMaterial({ map: own(texture(tilePicture(), 11)), roughness: rich ? 0.36 : 0.6 })),
    laid = add(new T.PlaneGeometry(24.4, 24.4), tiles, 0, FLOOR + 0.004, -1.5, false);
  laid.rotation.x = -Math.PI / 2;
  const border = add(new T.PlaneGeometry(25.6, 25.6), own(new T.MeshStandardMaterial({ color: "#d8c49a", roughness: 0.5 })), 0, FLOOR + 0.002, -1.5, false);
  border.rotation.x = -Math.PI / 2;
  const rug = add(new T.PlaneGeometry(15.2, 15.8), own(new T.MeshStandardMaterial({ map: own(texture(rugPicture())), roughness: 0.95, ...weave(6, 6, own, 0.7) })), 0, FLOOR + 0.012, 0.3, false);
  rug.rotation.x = -Math.PI / 2;
  const brass = own(glossy({ color: "#c9963b", metalness: 0.85, roughness: 0.28 }, 0.4));
  // A brass tumbler standing in its saucer, at the left near side.
  const cup = new T.Group();
  cup.position.set(-8.6, FLOOR, 4.6);
  scene.add(cup);
  const saucer = new T.Mesh(own(lathe([[0, 0], [0.5, 0], [0.62, 0.08], [0.66, 0.36], [0.6, 0.36], [0.56, 0.12], [0, 0.1]])), brass),
    tumbler = new T.Mesh(own(lathe([[0, 0.1], [0.32, 0.1], [0.36, 0.2], [0.42, 0.95], [0.44, 1.0], [0.4, 1.0], [0.36, 0.3], [0, 0.3]])), brass);
  saucer.castShadow = tumbler.castShadow = true;
  cup.add(saucer, tumbler);
  // Coffee in the tumbler.
  const coffee = new T.Mesh(own(new T.CircleGeometry(0.39, 24).rotateX(-Math.PI / 2)), own(new T.MeshStandardMaterial({ color: "#6b4122", roughness: 0.2 })));
  coffee.position.y = 0.86;
  cup.add(coffee);
  // The powder tin, its lid off beside it, and powder spilled round it.
  const tin = add(new T.CylinderGeometry(0.42, 0.42, 1.1, 24, 1), own(new T.MeshStandardMaterial({ map: own(texture(tinLabel())), metalness: 0.4, roughness: 0.45 })), -7.4, FLOOR + 0.55, 1.9);
  tin.rotation.y = 0.6;
  add(new T.CylinderGeometry(0.44, 0.44, 0.12, 24), own(new T.MeshStandardMaterial({ color: "#d6d9dc", metalness: 0.7, roughness: 0.35 })), -6.6, FLOOR + 0.06, 2.9);
  const dust = add(new T.PlaneGeometry(1.5, 1.1), own(new T.MeshBasicMaterial({ map: own(powderPicture()), transparent: true, depthWrite: false, opacity: 0.5 })), -7.0, FLOOR + 0.02, 2.6, false);
  dust.rotation.x = -Math.PI / 2;
  // A square floor cushion at the right, its cover block-printed, piped round its edge.
  const cover = own(cushionPicture()),
    cloth = own(new T.MeshStandardMaterial({ color: "#a8362a", roughness: 0.95 })),
    print = own(new T.MeshStandardMaterial({ map: cover, roughness: 0.95 })),
    cushion = new T.Mesh(own(block(2.4, 0.5, 2.4, 0.22)), [cloth, cloth, print, cloth, cloth, cloth]);
  cushion.position.set(9.2, FLOOR + 0.25, 3.4);
  cushion.rotation.y = -0.22;
  cushion.castShadow = cushion.receiveShadow = true;
  scene.add(cushion);
  // A pair of leather sandals left by the rug.
  const sole = own(block(0.62, 0.1, 1.45, 0.05)),
    leather = own(new T.MeshStandardMaterial({ color: "#7a4a26", roughness: 0.7 })),
    strap = own(new T.TorusGeometry(0.24, 0.05, 8, 16, Math.PI));
  for (const [x, z, turn] of [
    [7.6, 7.0, 0.25],
    [8.5, 7.3, 0.05],
  ]) {
    const g = new T.Group();
    g.position.set(x, FLOOR + 0.05, z);
    g.rotation.y = turn;
    const s = new T.Mesh(sole, leather),
      band = new T.Mesh(strap, leather);
    band.position.set(0, 0.04, -0.15);
    s.castShadow = band.castShadow = true;
    g.add(s, band);
    scene.add(g);
  }
  // A standing brass lamp at the far left: a round foot, a turned stem and a dish with five spouts.
  const lamp: T.BufferGeometry[] = [
    lathe([[0, 0], [0.7, 0], [0.72, 0.1], [0.3, 0.3], [0.12, 0.5], [0.1, 1.9], [0.16, 2.0], [0.1, 2.1], [0.62, 2.28], [0.66, 2.4], [0.12, 2.42], [0.12, 2.7], [0.2, 2.8], [0.08, 3.0], [0, 3.05]], 24),
  ];
  for (let k = 0; k < 5; k++) {
    const a = (k * Math.PI * 2) / 5;
    lamp.push(new T.ConeGeometry(0.09, 0.3, 8).rotateZ(Math.PI / 2).translate(-0.72, 2.36, 0).rotateY(a));
  }
  add(mergeGeometries(lamp.map((g) => g.toNonIndexed()))!, brass, -10.0, FLOOR, -5.6);
  lamp.forEach((g) => g.dispose());
  if (!rich) return;
  // Basil in a terracotta pot at the far right.
  add(lathe([[0, 0], [0.7, 0], [0.95, 1.2], [1.08, 1.25], [1.1, 1.5], [0.9, 1.5], [0.85, 1.3], [0, 1.3]], 28), own(new T.MeshStandardMaterial({ color: "#a65a36", roughness: 0.85 })), 10.4, FLOOR, -5.2);
  const grove = new Grove(scene, own, { bright: 1.4, lift: 1.2 });
  grove.crown("broad", [10.4, FLOOR + 2.4, -5.2], [1.3, 1.1, 1.3], "#4f8a3a");
  grove.crown("broad", [10.0, FLOOR + 3.1, -5.4], [0.8, 0.8, 0.8], "#5a9640", 1.3);
  grove.build();
  // Two turned pillars on stone feet at the back.
  const pillar = mergeGeometries(
      [
        new T.BoxGeometry(1.4, 0.5, 1.4).translate(0, 0.25, 0),
        lathe([[0, 0.5], [0.52, 0.5], [0.52, 0.8], [0.4, 1.0], [0.34, 1.6], [0.44, 2.0], [0.34, 2.4], [0.3, 6.5], [0.42, 6.8], [0.3, 7.0], [0, 7.0]], 20).toNonIndexed(),
      ].map((g) => (g.index ? g.toNonIndexed() : g)),
    )!,
    teak = own(new T.MeshStandardMaterial({ map: own(wood(true)), roughness: 0.55 }));
  for (const x of [-8.2, 8.2]) add(pillar.clone(), teak, x, FLOOR, -11.2);
  pillar.dispose();
}
