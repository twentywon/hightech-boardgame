import * as T from "three";
import { block, capable, glossy, stuff, wood } from "../../engine/scene-utils";
import { BOWLS, FLOOR, GO, GO_DEPTH, GO_STEP, HINGES, JANGGI_DEPTH, TABLE, type Mode } from "./rules";
import { random } from "./pieces";

/**
 * Where alkkagi is played: a Korean study of our own, all modelled and painted in code. A go board of kaya on its
 * four carved feet stands on the boards of the floor with a bowl of stones at either side; the folding janggi board
 * lies on a low lacquered table with a tea set at its corner. Behind, a floor cushion, a folding screen painted with
 * ink mountains, a reading desk with books and brushes, and a white moon jar.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
const canvas = (size: number) => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!] as const;
};
const texture = (c: HTMLCanvasElement, own: Own) => {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** Straight, close grain over a gradient, as on quarter-sawn kaya or pine; `across` turns the grain a quarter. */
function grain(ctx: CanvasRenderingContext2D, size: number, light: string, dark: string, ink: string, seed: number, across = false) {
  const rnd = random(seed),
    fill = ctx.createLinearGradient(0, 0, size, size * 0.3);
  fill.addColorStop(0, light);
  fill.addColorStop(0.55, dark);
  fill.addColorStop(1, light);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  if (across) {
    ctx.translate(size, 0);
    ctx.rotate(Math.PI / 2);
  }
  // Broad soft bands of the growth rings, then the fine lines between them.
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(${ink},${0.025 + rnd() * 0.05})` : `rgba(255,240,200,${0.03 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * size, 0, size * (0.01 + rnd() * 0.04), size);
  }
  const lines = Math.round(size * 0.55);
  for (let i = 0; i < lines; i++) {
    const x0 = rnd() * size,
      bend = 0.5 + rnd() * 2.5,
      phase = rnd() * 9,
      lean = (rnd() - 0.5) * 0.02;
    ctx.strokeStyle = `rgba(${ink},${0.025 + rnd() * 0.09})`;
    ctx.lineWidth = (0.4 + rnd() * 1.6) * (size / 1024);
    ctx.beginPath();
    for (let y = 0; y <= size; y += size / 24) ctx.lineTo(x0 + Math.sin(y / (size / 3.3) + phase) * bend * (size / 1024) + y * lean, y);
    ctx.stroke();
  }
  ctx.restore();
}
/** The go board's face: kaya with nineteen lines a way in ink, nine star points, and the red middle line no stone is set on or beyond. */
function goFace(own: Own) {
  const size = capable() ? 2048 : 1024,
    [c, ctx] = canvas(size),
    k = size / 1024,
    px = (v: number) => size / 2 + (v / 4.8) * (size / 2);
  grain(ctx, size, "#e8bd76", "#ddae63", "120,72,24", 3);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  // Ink sinks a little into the wood: a faint wide stroke under the sharp one.
  for (const [width, style] of [[4.2, "rgba(40,28,14,0.16)"], [2.1, "rgba(22,16,10,0.9)"]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width * k;
    for (let i = 0; i < GO; i++) {
      const v = px((i - 9) * GO_STEP);
      line(v, px(-4.5), v, px(4.5));
      line(px(-4.5), v, px(4.5), v);
    }
  }
  ctx.fillStyle = "rgba(22,16,10,0.92)";
  for (const r of [3, 9, 15])
    for (const col of [3, 9, 15]) {
      ctx.beginPath();
      ctx.arc(px((col - 9) * GO_STEP), px((r - 9) * GO_STEP), 7.5 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.strokeStyle = "rgba(168,34,26,0.55)";
  ctx.lineWidth = 6 * k;
  line(px(-4.5), px(0), px(4.5), px(0));
  return texture(c, own);
}
/** The janggi board's face: pale pine with its nine files and ten ranks and the two palaces. */
function janggiFace(own: Own) {
  const size = capable() ? 2048 : 1024,
    [c, ctx] = canvas(size),
    k = size / 1024,
    x = (v: number) => size / 2 + (v / 4.55) * (size / 2),
    y = (v: number) => size / 2 + (v / 5.05) * (size / 2);
  grain(ctx, size, "#f0d29c", "#e6c184", "130,86,36", 9, true);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  for (const [width, style] of [[4.4, "rgba(40,28,14,0.15)"], [2.4, "rgba(26,18,10,0.88)"]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = width * k;
    for (let f = -4; f <= 4; f++) line(x(f), y(-4.5), x(f), y(4.5));
    for (let r = 0; r < 10; r++) line(x(-4), y(r - 4.5), x(4), y(r - 4.5));
    for (const [a, b] of [[-4.5, -2.5], [2.5, 4.5]]) {
      line(x(-1), y(a), x(1), y(b));
      line(x(1), y(a), x(-1), y(b));
    }
  }
  // A frame line round the field.
  ctx.lineWidth = 5 * k;
  ctx.strokeRect(x(-4.3), y(-4.8), x(4.3) - x(-4.3), y(4.8) - y(-4.8));
  return texture(c, own);
}
function sideTexture(own: Own, light: string, dark: string, seed: number) {
  const [c, ctx] = canvas(512);
  grain(ctx, 512, light, dark, "110,64,22", seed, true);
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A shape turned on a lathe from (radius, height) pairs. */
const lathe = (points: [number, number][], segments = 32) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/** The paper of the folding screen: ink mountains in layers fading into mist, a few pines and a flight of birds, in a brocade border. */
function screenPainting(own: Own) {
  const w = 2048,
    h = 512,
    c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!,
    rnd = random(41);
  ctx.fillStyle = "#efe5cc";
  ctx.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 4; layer++) {
    const base = 300 + layer * 52,
      shade = 0.16 + layer * 0.16;
    ctx.fillStyle = `rgba(38,40,44,${shade})`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const phase = rnd() * 9;
    for (let x = 0; x <= w; x += 8) {
      const peak = Math.sin(x / (140 + layer * 40) + phase) * (70 - layer * 10) + Math.sin(x / 37 + phase * 2) * 12 + Math.max(0, Math.sin(x / 420 + layer)) * (110 - layer * 22);
      ctx.lineTo(x, base - peak);
    }
    ctx.lineTo(w, h);
    ctx.fill();
    // Mist across the foot of each range.
    const mist = ctx.createLinearGradient(0, base - 30, 0, base + 40);
    mist.addColorStop(0, "rgba(239,229,204,0)");
    mist.addColorStop(1, "rgba(239,229,204,0.85)");
    ctx.fillStyle = mist;
    ctx.fillRect(0, base - 30, w, 70);
  }
  // Pines on the nearest ridge: a trunk and layered dark crowns.
  for (let i = 0; i < 9; i++) {
    const x = 80 + rnd() * (w - 160),
      foot = 470 - rnd() * 30,
      tall = 80 + rnd() * 70;
    ctx.strokeStyle = "rgba(30,26,22,0.85)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, foot);
    ctx.quadraticCurveTo(x + (rnd() - 0.5) * 30, foot - tall / 2, x + (rnd() - 0.5) * 20, foot - tall);
    ctx.stroke();
    ctx.fillStyle = "rgba(24,34,28,0.8)";
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (rnd() - 0.5) * 30, foot - tall * (0.45 + k * 0.17), 26 - k * 4, 7, (rnd() - 0.5) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = "rgba(30,30,30,0.7)";
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 7; i++) {
    const x = 1300 + rnd() * 400,
      y = 70 + rnd() * 80;
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4);
    ctx.quadraticCurveTo(x - 4, y - 7, x, y);
    ctx.quadraticCurveTo(x + 4, y - 7, x + 9, y - 4);
    ctx.stroke();
  }
  // A red seal at the end.
  ctx.fillStyle = "rgba(170,30,26,0.85)";
  ctx.fillRect(w - 150, 60, 34, 34);
  return texture(c, own);
}
/**
 * Builds the room and the board for a mode. The board's face is at height 0 and its edge where the rules' arena
 * ends; what lies below is where the rules' `below` says.
 */
export function study(scene: T.Object3D, own: Own, mode: Mode) {
  const std = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true, parent: T.Object3D = scene) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The floor: polished boards of a maru.
  const floor = add(new T.PlaneGeometry(70, 70), std({ ...stuff("boards", "#7a5236", 7, own), roughness: 0.5 }), 0, FLOOR, 0, false);
  floor.rotation.x = -Math.PI / 2;
  if (mode === "go") {
    const side = std({ map: sideTexture(own, "#cf9a52", "#b98440", 4), roughness: 0.55 }),
      top = std({ map: goFace(own), roughness: 0.48 });
    add(block(9.6, GO_DEPTH, 9.6, 0.09, 3), [side, side, top, side, side, side], 0, -GO_DEPTH / 2, 0);
    // Four feet carved in the shape of a gardenia's fruit, under the board's corners.
    const foot = lathe([[0, 0], [0.24, 0.02], [0.46, 0.16], [0.56, 0.42], [0.5, 0.68], [0.32, 0.86], [0.36, 0.94], [0.42, 1.05], [0, 1.05]], 28),
      legLength = -GO_DEPTH - FLOOR;
    foot.scale(1, legLength / 1.05, 1);
    const footWood = std({ map: sideTexture(own, "#d9a65e", "#c48f4b", 6), roughness: 0.55 });
    for (const x of [-1, 1]) for (const z of [-1, 1]) add(foot.clone(), footWood, x * 3.4, FLOOR, z * 3.4);
    foot.dispose();
    // A bowl of stones at either side, of jujube wood, lids on.
    const [bc, bctx] = canvas(512);
    grain(bctx, 512, "#a9653c", "#8c4e2b", "58,26,10", 12);
    const bowlWood = glossy({ map: texture(bc, own), roughness: 0.36 }, 0.6);
    own(bowlWood);
    const body = lathe([[0, 0], [0.7, 0.01], [0.92, 0.2], [1.04, 0.62], [1.03, 1.05], [0.94, 1.4], [0.86, 1.52], [0.86, 1.56], [0, 1.56]], 40),
      lid = lathe([[0, 1.92], [0.42, 1.9], [0.74, 1.8], [0.9, 1.64], [0.92, 1.54], [0.84, 1.53], [0, 1.53]], 40);
    for (const bowl of BOWLS) {
      add(body.clone(), bowlWood, bowl.x, FLOOR, bowl.z, false);
      add(lid.clone(), bowlWood, bowl.x, FLOOR, bowl.z, false);
    }
    body.dispose();
    lid.dispose();
  } else {
    const side = std({ map: sideTexture(own, "#e9c58a", "#d9ae6e", 8), roughness: 0.6 }),
      top = std({ map: janggiFace(own), roughness: 0.55 });
    // Lying flat on the table it casts no shadow worth drawing.
    add(block(9.1, JANGGI_DEPTH, 10.1, 0.05, 2), [side, side, top, side, side, side], 0, -JANGGI_DEPTH / 2, 0, false);
    // The fold of the board and its two brass hinges, which stones bounce off.
    add(new T.BoxGeometry(9.1, 0.012, 0.035), std({ color: "#5a3a1c" }), 0, 0.004, 0, false);
    const brass = std({ color: "#c9a23a", roughness: 0.28, metalness: 0.75 }),
      pin = std({ color: "#6a5320", metalness: 0.6, roughness: 0.4 });
    for (const x of HINGES) {
      add(block(0.8, 0.05, 0.3, 0.015), brass, x, 0.025, 0);
      add(new T.CylinderGeometry(0.09, 0.09, 0.78, 14), brass, x, 0.1, 0).rotation.z = Math.PI / 2;
      for (const dx of [-0.26, 0.26]) for (const dz of [-0.09, 0.09]) add(new T.CylinderGeometry(0.03, 0.03, 0.07, 8), pin, x + dx, 0.05, dz, false);
    }
    // A low table of lacquered wood under it, on four legs with an apron.
    const lacquer = glossy({ map: own(wood(true)), color: "#7b3a22", roughness: 0.32 }, 0.8);
    own(lacquer);
    const thick = TABLE.y - TABLE.bottom;
    add(block(TABLE.halfX * 2, thick, TABLE.halfZ * 2, 0.08, 3), lacquer, 0, TABLE.y - thick / 2, 0);
    const legHeight = TABLE.bottom - FLOOR;
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const leg = add(block(0.5, legHeight, 0.5, 0.06), lacquer, x * (TABLE.halfX - 0.55), FLOOR + legHeight / 2, z * (TABLE.halfZ - 0.55), false);
        leg.rotation.y = Math.PI / 4;
      }
    for (const z of [-1, 1]) add(block(TABLE.halfX * 2 - 1.2, 0.36, 0.14, 0.04), lacquer, 0, TABLE.bottom - 0.18, z * (TABLE.halfZ - 0.55), false);
    for (const x of [-1, 1]) add(block(0.14, 0.36, TABLE.halfZ * 2 - 1.2, 0.04), lacquer, x * (TABLE.halfX - 0.55), TABLE.bottom - 0.18, 0, false);
    // A celadon tea set at the far right corner of the table.
    const celadon = glossy({ color: "#9fbfa8", roughness: 0.18 }, 1);
    own(celadon);
    const pot = add(lathe([[0, 0], [0.34, 0], [0.5, 0.14], [0.55, 0.36], [0.46, 0.6], [0.24, 0.7], [0.26, 0.78], [0, 0.82]], 30), celadon, 5.6, TABLE.y, -5.9);
    add(new T.CylinderGeometry(0.05, 0.08, 0.5, 10), celadon, 0.55, 0.42, 0, true, pot).rotation.z = -0.9;
    const cup = lathe([[0, 0], [0.16, 0], [0.18, 0.04], [0.27, 0.3], [0.25, 0.3], [0.15, 0.06], [0, 0.06]], 24);
    for (const [x, z] of [[4.95, -6.45], [5.55, -6.55]]) add(cup.clone(), celadon, x, TABLE.y, z);
    cup.dispose();
  }
  // Far side: the cushion where the other player kneels.
  const silk = std({ color: "#2f4f7a", roughness: 0.55 }),
    border = std({ color: "#b8343a", roughness: 0.6 });
  add(block(3.3, 0.3, 3.3, 0.12), border, 0, FLOOR + 0.15, -9.4, false);
  add(block(2.6, 0.08, 2.6, 0.03), silk, 0, FLOOR + 0.31, -9.4, false);
  // The folding screen behind: six leaves in a zigzag.
  const painting = screenPainting(own),
    frame = std({ color: "#3b2a1c", roughness: 0.5 }),
    brocade = std({ color: "#28406a", roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const leaf = new T.Group(),
      width = 2.6,
      x = (i - 2.5) * width * 0.97,
      angle = i % 2 ? -0.24 : 0.24,
      paper = own(new T.MeshStandardMaterial({ map: painting, roughness: 0.95 }));
    const face = new T.PlaneGeometry(width - 0.36, 4.3),
      uv = face.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 6);
    add(new T.BoxGeometry(width, 5.2, 0.12), brocade, 0, 2.6, 0, false, leaf);
    add(face, paper, 0, 2.72, 0.065, false, leaf);
    add(new T.BoxGeometry(width + 0.04, 0.12, 0.16), frame, 0, 5.2, 0, false, leaf);
    add(new T.BoxGeometry(width + 0.04, 0.12, 0.16), frame, 0, 0.06, 0, false, leaf);
    leaf.position.set(x, FLOOR, -12.6);
    leaf.rotation.y = angle;
    scene.add(leaf);
  }
  // A reading desk at the far left with stitched books, a brush holder and an inkstone.
  const desk = std({ map: own(wood(true)), color: "#8a5a3a", roughness: 0.45 }),
    deskX = -9.6,
    deskZ = -7.4,
    deskTop = FLOOR + 1.35;
  add(block(3.6, 0.16, 1.5, 0.04), desk, deskX, deskTop, deskZ);
  for (const x of [-1.6, 1.6]) {
    add(block(0.16, 1.3, 1.4, 0.03), desk, deskX + x, FLOOR + 0.65, deskZ, false);
    add(block(0.5, 0.1, 1.6, 0.03), desk, deskX + x, FLOOR + 0.05, deskZ, false);
  }
  const covers = ["#c9a64e", "#2f4a6e", "#8a2f2a", "#c9a64e"];
  covers.forEach((color, i) => {
    const book = add(block(1.2, 0.13, 0.85, 0.02), std({ color, roughness: 0.85 }), deskX - 0.9, deskTop + 0.15 + i * 0.13, deskZ - 0.05);
    book.rotation.y = (i % 2 ? 0.08 : -0.06) + i * 0.02;
  });
  const porcelain = glossy({ color: "#e6e0d2", roughness: 0.32 }, 0.6);
  own(porcelain);
  add(lathe([[0, 0], [0.3, 0], [0.32, 0.6], [0.3, 0.62], [0, 0.62]], 24), porcelain, deskX + 0.6, deskTop + 0.08, deskZ - 0.2);
  for (const [dx, lean] of [[-0.08, 0.12], [0.07, -0.1], [0.0, 0.03]]) {
    const brush = add(new T.CylinderGeometry(0.028, 0.028, 1.1, 8), std({ color: "#6b4a2a" }), deskX + 0.6 + dx, deskTop + 0.75, deskZ - 0.2);
    brush.rotation.z = lean;
  }
  add(block(0.7, 0.1, 0.95, 0.03), std({ color: "#242426", roughness: 0.4 }), deskX + 1.3, deskTop + 0.13, deskZ + 0.15);
  // A white moon jar on the floor at the far right.
  const jar = glossy({ color: "#d9d2c2", roughness: 0.42 }, 0.5);
  own(jar);
  add(lathe([[0, 0], [0.42, 0], [0.5, 0.06], [0.88, 0.5], [1.02, 1.0], [0.92, 1.5], [0.56, 1.86], [0.44, 1.95], [0.47, 2.06], [0, 2.06]], 40), jar, 9.6, FLOOR, -7.4);
}
