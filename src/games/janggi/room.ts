import * as T from "three";
import { block, glossy, stuff, weave, woodPhoto, wood } from "../../engine/scene-utils";
import { Grove } from "../../engine/foliage";

/**
 * The janggi board and the sarangbang it is played in, all made in code. The board's face stays where the pieces
 * and the pointer expect it (`FACE`); the board stands on four turned feet on a reed mat over an oiled-paper floor.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** Height of the board's face, where its lines are inked. */
export const FACE = 0.142;
/** The board's body: its thickness and its size beyond the outer lines. */
const BODY = 0.5,
  WIDTH = 6.6,
  DEPTH = 7.3;
/** The oiled-paper floor and the top of the reed mat the board and the taken pieces lie on. */
export const FLOOR = -0.72;
export const MAT = FLOOR + 0.035;
const MAT_SIZE = { width: 12, depth: 10.6 };

function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function canvas(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, own: Own, repeat?: [number, number]) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
const SERIF =
  '"Noto Serif CJK KR", "Noto Serif KR", "AppleMyungjo", "Batang", "Songti SC", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", serif';
/** Grain of pale ginkgo wood, streaked along x, painted until (or instead of) a photograph. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, base = "#e3bf83") {
  const rnd = random(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < h / 2.5; i++) {
    const y = rnd() * h,
      dark = rnd() < 0.5;
    ctx.strokeStyle = dark ? `rgba(130,82,34,${0.04 + rnd() * 0.08})` : `rgba(255,236,196,${0.05 + rnd() * 0.08})`;
    ctx.lineWidth = 0.6 + rnd() * (h / 200);
    ctx.beginPath();
    ctx.moveTo(0, y);
    const bend = rnd() * 6,
      f = 0.002 + rnd() * 0.004;
    for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, y + Math.sin(x * f + i) * bend);
    ctx.stroke();
  }
}

/**
 * The face of the board: pale wood with the nine files and ten ranks inked in, the outer lines heavier, the palaces'
 * diagonals, a frame line round the field and small marks at the points where soldiers and cannons start. The ink
 * is laid twice with a little offset, as a brush leaves it. Lines meet exactly where `toWorld` puts the points.
 */
function boardFace(own: Own, size: number, spacing: number) {
  const W = size,
    H = Math.round((size * DEPTH) / WIDTH),
    { c, ctx } = canvas(W, H),
    k = W / 1024,
    px = (x: number) => ((x + WIDTH / 2) / WIDTH) * W,
    pz = (z: number) => ((z + DEPTH / 2) / DEPTH) * H,
    point = (file: number, rank: number) => [px((file - 4) * spacing), pz((rank - 4.5) * spacing)] as const,
    rnd = random(17);
  const paint = (photo?: HTMLImageElement) => {
    if (photo) {
      // The photograph runs along the board's width, lightened toward ginkgo.
      ctx.drawImage(photo, 0, 0, W, H);
      ctx.fillStyle = "rgba(246,214,158,0.42)";
      ctx.fillRect(0, 0, W, H);
    } else grain(ctx, W, H, 11);
    // A soft wear in the middle of the field, darker toward the edge.
    const wear = ctx.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.75);
    wear.addColorStop(0, "rgba(255,240,205,0.12)");
    wear.addColorStop(1, "rgba(120,72,26,0.16)");
    ctx.fillStyle = wear;
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = "round";
    const stroke = (a: readonly [number, number], b: readonly [number, number], width: number) => {
      for (const [alpha, wobble, w] of [[0.22, 1.2, width * 1.9], [0.86, 0.35, width]] as const) {
        ctx.strokeStyle = `rgba(28,18,10,${alpha})`;
        ctx.lineWidth = w * k;
        ctx.beginPath();
        ctx.moveTo(a[0] + (rnd() - 0.5) * wobble * k, a[1] + (rnd() - 0.5) * wobble * k);
        ctx.lineTo(b[0] + (rnd() - 0.5) * wobble * k, b[1] + (rnd() - 0.5) * wobble * k);
        ctx.stroke();
      }
    };
    for (let rank = 0; rank < 10; rank++) stroke(point(0, rank), point(8, rank), rank === 0 || rank === 9 ? 4.2 : 2.6);
    for (let file = 0; file < 9; file++) stroke(point(file, 0), point(file, 9), file === 0 || file === 8 ? 4.2 : 2.6);
    for (const rank of [0, 7]) {
      stroke(point(3, rank), point(5, rank + 2), 2.4);
      stroke(point(5, rank), point(3, rank + 2), 2.4);
    }
    // The frame line round the field.
    const m = spacing * 0.36,
      [x0, z0] = [px(-4 * spacing - m), pz(-4.5 * spacing - m)],
      [x1, z1] = [px(4 * spacing + m), pz(4.5 * spacing + m)];
    stroke([x0, z0], [x1, z0], 5.5);
    stroke([x1, z0], [x1, z1], 5.5);
    stroke([x1, z1], [x0, z1], 5.5);
    stroke([x0, z1], [x0, z0], 5.5);
    // Starting marks: small corner ticks round the soldiers' and cannons' points.
    const tick = (file: number, rank: number) => {
      const [x, z] = point(file, rank),
        d = 7 * k,
        l = 13 * k;
      ctx.strokeStyle = "rgba(28,18,10,0.75)";
      ctx.lineWidth = 2 * k;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          if ((file === 0 && sx < 0) || (file === 8 && sx > 0)) continue;
          ctx.beginPath();
          ctx.moveTo(x + sx * (d + l), z + sz * d);
          ctx.lineTo(x + sx * d, z + sz * d);
          ctx.lineTo(x + sx * d, z + sz * (d + l));
          ctx.stroke();
        }
    };
    for (const rank of [3, 6]) for (const file of [0, 2, 4, 6, 8]) tick(file, rank);
    for (const rank of [2, 7]) for (const file of [1, 7]) tick(file, rank);
    map.needsUpdate = true;
  };
  const map = texture(c, own);
  paint();
  woodPhoto("light", (image) => paint(image));
  return map;
}
/** One edge of the board: the same wood along its length, with a character inked in the middle of a long side. */
function edgeFace(own: Own, length: number, glyph?: string, ink?: string) {
  const W = 1024,
    H = Math.max(32, Math.round((W * BODY) / length)),
    { c, ctx } = canvas(W, H);
  grain(ctx, W, H, glyph ? glyph.charCodeAt(0) : 5, "#d6ac6c");
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(255,236,200,0.18)");
  shade.addColorStop(1, "rgba(90,52,20,0.25)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  if (glyph && ink) {
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.round(H * 0.62)}px ${SERIF}`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(glyph, W / 2, H * 0.47);
    ctx.globalAlpha = 1;
  }
  return texture(c, own);
}
/**
 * A thick 장기판 of pale wood on four turned feet: its face inked, 楚 on Cho's edge and 漢 on Han's, its body a
 * little darker. The face is at `FACE`.
 */
export function janggiBoard(scene: T.Object3D, own: Own, spacing: number, rich: boolean) {
  const side = (map: T.Texture) => own(new T.MeshStandardMaterial({ map, roughness: 0.55 })),
    plain = side(edgeFace(own, DEPTH)),
    face = boardFace(own, rich ? 2048 : 1024, spacing),
    top = own(glossy({ map: face, roughness: 0.48 }, 0.25)),
    body = new T.Mesh(own(block(WIDTH, BODY, DEPTH, 0.05)), [
      plain,
      plain,
      top,
      plain,
      side(edgeFace(own, WIDTH, "楚", "#0d6157")),
      side(edgeFace(own, WIDTH, "漢", "#a8241a")),
    ]);
  body.position.y = FACE - BODY / 2;
  body.castShadow = body.receiveShadow = true;
  // Where the processor draws alone, sharp filtering at a slant costs much on these large surfaces, and the board is
  // drawn first so that what lies under it is not shaded for nothing.
  if (!rich) face.anisotropy = 1;
  body.renderOrder = -2;
  scene.add(body);
  // The feet: turned and bulging, a little in from the corners.
  const tall = FACE - BODY - MAT,
    profile = [
      [0, 0], [0.22, 0], [0.3, 0.04], [0.34, 0.12], [0.31, 0.2], [0.22, 0.27], [0.19, 0.3], [0.26, 0.32], [0, 0.32],
    ].map(([r, y]) => new T.Vector2(r, (y / 0.32) * tall)),
    foot = own(new T.LatheGeometry(profile, rich ? 20 : 12)),
    feet = own(new T.MeshStandardMaterial({ map: own(wood(true)), roughness: 0.5 }));
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      const mesh = new T.Mesh(foot, feet);
      mesh.position.set(x * (WIDTH / 2 - 0.42), MAT, z * (DEPTH / 2 - 0.42));
      mesh.castShadow = rich;
      scene.add(mesh);
    }
}

/** Woven reed with its hemp warp, a dyed band at either end, for the mat the board stands on. */
function reedMat(own: Own) {
  const { c, ctx } = canvas(1024),
    rnd = random(23);
  ctx.fillStyle = "#cdb47a";
  ctx.fillRect(0, 0, 1024, 1024);
  // Reeds run across; each is a strip with a light middle.
  for (let y = 0; y < 1024; y += 9) {
    const g = ctx.createLinearGradient(0, y, 0, y + 9),
      tone = 196 + rnd() * 26;
    g.addColorStop(0, `rgba(120,96,48,0.55)`);
    g.addColorStop(0.45, `rgb(${tone},${tone - 22},${tone - 92})`);
    g.addColorStop(1, `rgba(110,88,44,0.6)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 1024, 9);
  }
  // The warp: pairs of hemp threads every few fingers.
  for (let x = 20; x < 1024; x += 48) {
    ctx.fillStyle = "rgba(92,70,36,0.5)";
    ctx.fillRect(x, 0, 3, 1024);
    ctx.fillRect(x + 6, 0, 3, 1024);
  }
  // Dyed bands near both ends: a key fret in red and indigo.
  for (const y of [110, 914 - 60]) {
    ctx.fillStyle = "rgba(150,40,34,0.75)";
    ctx.fillRect(0, y, 1024, 8);
    ctx.fillRect(0, y + 52, 1024, 8);
    ctx.strokeStyle = "rgba(34,48,102,0.8)";
    ctx.lineWidth = 6;
    for (let x = 0; x < 1024; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, y + 44);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x + 28, y + 16);
      ctx.lineTo(x + 28, y + 36);
      ctx.lineTo(x + 12, y + 36);
      ctx.lineTo(x + 12, y + 26);
      ctx.stroke();
    }
  }
  // The dusk under the board's edges, so that it stands on its feet rather than floating on the mat.
  const bx = (WIDTH / MAT_SIZE.width) * 1024,
    bz = (DEPTH / MAT_SIZE.depth) * 1024;
  for (let k = 0; k < 14; k++) {
    const grow = (14 - k) * 5;
    ctx.fillStyle = `rgba(24,12,4,${0.05})`;
    ctx.beginPath();
    ctx.roundRect(512 - bx / 2 - grow, 512 - bz / 2 - grow, bx + grow * 2, bz + grow * 2, 30 + grow);
    ctx.fill();
  }
  return texture(c, own);
}
/** Oiled paper laid in overlapping sheets, amber and mottled, for the floor. */
function oiledPaper(own: Own) {
  const { c, ctx } = canvas(512),
    rnd = random(31);
  ctx.fillStyle = "#c99d5e";
  ctx.fillRect(0, 0, 512, 512);
  // Four sheets a tile, each a shade apart, with the faint streaks the oil leaves.
  for (const [x, y] of [[0, 0], [256, 0], [0, 256], [256, 256]]) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? "226,184,118" : "170,118,58"},${0.06 + rnd() * 0.06})`;
    ctx.fillRect(x, y, 256, 256);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(${rnd() < 0.5 ? "236,198,134" : "150,100,46"},${0.03 + rnd() * 0.04})`;
      ctx.lineWidth = 1 + rnd() * 3;
      const yy = y + rnd() * 256;
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + 256, yy + (rnd() - 0.5) * 12);
      ctx.stroke();
    }
  }
  // The laps of the sheets: a fine dark edge with a light bead beside it.
  for (const at of [0, 256]) {
    ctx.fillStyle = "rgba(110,66,24,0.38)";
    ctx.fillRect(0, at, 512, 2);
    ctx.fillRect(at, 0, 2, 512);
    ctx.fillStyle = "rgba(255,226,170,0.22)";
    ctx.fillRect(0, at + 2, 512, 2);
    ctx.fillRect(at + 2, 0, 2, 512);
  }
  return texture(c, own, [20, 20]);
}
/** A silk cushion's top: indigo with a crimson band and a round flower medallion. */
function cushionTop(own: Own) {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = "#283a6e";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#a8322c";
  ctx.lineWidth = 22;
  ctx.strokeRect(22, 22, 212, 212);
  ctx.strokeStyle = "rgba(230,196,110,0.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, 184, 184);
  ctx.translate(128, 128);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = i % 2 ? "#e9c870" : "#d8874a";
    ctx.beginPath();
    ctx.ellipse(0, -30, 11, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f2e2b4";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  return texture(c, own);
}
/**
 * Eight panels of a folding screen, one picture across them: ink mountains in layers, pines on a ridge, plum
 * branches and a pair of cranes, between bands of blue brocade. Our own painting.
 */
function screenPainting(own: Own) {
  const W = 2048,
    H = 512,
    { c, ctx } = canvas(W, H),
    rnd = random(57);
  ctx.fillStyle = "#efe3c4";
  ctx.fillRect(0, 0, W, H);
  // Far to near ridges, paler far away.
  for (const [base, tone, rough] of [[300, 0.16, 70], [340, 0.26, 60], [390, 0.4, 50]] as const) {
    ctx.fillStyle = `rgba(48,52,50,${tone})`;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base - Math.abs(Math.sin(x * 0.004 + base)) * rough * 2 - rnd() * 10);
    ctx.lineTo(W, H);
    ctx.fill();
  }
  // Pines on the nearest ridge.
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 220 + rnd() * 60,
      y = 330 - rnd() * 40;
    ctx.strokeStyle = "rgba(40,30,22,0.85)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y + 60);
    ctx.quadraticCurveTo(x + 10, y + 20, x - 4, y - 40);
    ctx.stroke();
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = `rgba(36,62,44,${0.6 + rnd() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(x + (rnd() - 0.5) * 40, y - 40 + j * 18, 34 - j * 4, 9, (rnd() - 0.5) * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Plum branches with blossom across the lower left.
  ctx.strokeStyle = "rgba(42,30,24,0.9)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(0, 470);
  ctx.bezierCurveTo(200, 430, 260, 360, 470, 340);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(240, 400);
  ctx.quadraticCurveTo(330, 300, 420, 250);
  ctx.stroke();
  for (let i = 0; i < 40; i++) {
    const t = rnd(),
      x = 40 + t * 420 + (rnd() - 0.5) * 40,
      y = 460 - t * 170 + (rnd() - 0.5) * 50;
    ctx.fillStyle = rnd() < 0.7 ? "rgba(214,72,82,0.9)" : "rgba(250,236,236,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 6 + rnd() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // A pair of cranes in flight over the far right.
  for (const [x, y, s] of [[1520, 150, 1], [1640, 190, 0.8]] as const) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "#fbfaf4";
    ctx.beginPath();
    ctx.ellipse(0, 0, 40, 10, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.quadraticCurveTo(-30, -60, 30, -70);
    ctx.quadraticCurveTo(0, -30, 14, 0);
    ctx.fill();
    ctx.fillStyle = "#202020";
    ctx.fillRect(22, -66, 10, 6);
    ctx.fillStyle = "#c22a22";
    ctx.beginPath();
    ctx.arc(48, -6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, -4);
    ctx.lineTo(62, -10);
    ctx.moveTo(-40, 2);
    ctx.lineTo(-80, 10);
    ctx.stroke();
    ctx.restore();
  }
  // A red sun low over the ridges.
  ctx.fillStyle = "rgba(196,58,40,0.8)";
  ctx.beginPath();
  ctx.arc(1180, 170, 46, 0, Math.PI * 2);
  ctx.fill();
  // Brocade bands above and below.
  for (const y of [0, H - 40]) {
    ctx.fillStyle = "#24406e";
    ctx.fillRect(0, y, W, 40);
    ctx.fillStyle = "rgba(226,190,104,0.7)";
    for (let x = 10; x < W; x += 34) {
      ctx.beginPath();
      ctx.arc(x, y + 20, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return texture(c, own);
}
/** Lattice doors of a hanok room: thin bars over glowing paper. */
function lattice(own: Own) {
  const { c, ctx } = canvas(512);
  ctx.fillStyle = "#f4ead2";
  ctx.fillRect(0, 0, 512, 512);
  const glow = ctx.createLinearGradient(0, 0, 0, 512);
  glow.addColorStop(0, "rgba(255,250,232,0.6)");
  glow.addColorStop(1, "rgba(200,170,120,0.25)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#6e4a2c";
  for (let x = 0; x <= 512; x += 32) ctx.fillRect(x - 2, 0, 4, 512);
  for (const y of [0, 96, 104, 400, 408, 508]) ctx.fillRect(0, y, 512, 6);
  for (let y = 120; y < 400; y += 70) ctx.fillRect(0, y, 512, 3);
  // The heavy frame round each door.
  ctx.fillRect(0, 0, 14, 512);
  ctx.fillRect(498, 0, 14, 512);
  return texture(c, own, [1, 1]);
}
/** A shape turned on a lathe from (radius, height) pairs. */
const lathe = (points: [number, number][], segments: number) =>
  new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);

/**
 * A flat rectangle `width` by `depth` (in x and y, to be laid down) with a rectangular hole in its middle, mapped
 * `u` and `v` a unit (plus `shift`), so that a picture lies on it as on a whole plane.
 */
function holed(width: number, depth: number, holeWidth: number, holeDepth: number, u: number, v: number, shift = 0) {
  const outline = new T.Shape()
      .moveTo(-width / 2, -depth / 2)
      .lineTo(width / 2, -depth / 2)
      .lineTo(width / 2, depth / 2)
      .lineTo(-width / 2, depth / 2)
      .closePath(),
    hole = new T.Path()
      .moveTo(-holeWidth / 2, -holeDepth / 2)
      .lineTo(-holeWidth / 2, holeDepth / 2)
      .lineTo(holeWidth / 2, holeDepth / 2)
      .lineTo(holeWidth / 2, -holeDepth / 2)
      .closePath();
  outline.holes.push(hole);
  const geometry = new T.ShapeGeometry(outline),
    at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) * u + shift, at.getY(i) * v + shift);
  return geometry;
}
/**
 * The sarangbang round the board: an oiled-paper floor and the reed mat under the board, a silk cushion at each
 * player's seat, a small dog-legged table with tea and dried persimmons at Cho's left, a folding screen along that
 * wall, a low chest with books and a potted pine at the right, lattice doors behind it. Tall things stand only at the
 * sides, where the camera never looks through them; where a graphics card does not draw, the far things are left out.
 */
export function sarangbang(scene: T.Object3D, own: Own, rich: boolean) {
  const std = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.7, ...o }));
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = false) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const paper = oiledPaper(own),
    reeds = reedMat(own);
  if (!rich) paper.anisotropy = reeds.anisotropy = 1;
  // Every layer is cut away where another lies over it (the floor under the mat, the mat under the board), so that
  // no pixel is shaded twice: where the processor draws alone, these wide surfaces are most of a frame's cost.
  const plain = (o: T.MeshStandardMaterialParameters) => (rich ? glossy(o, 0.2) : new T.MeshLambertMaterial({ map: o.map }));
  const floor = add(
    holed(60, 60, MAT_SIZE.width - 0.1, MAT_SIZE.depth - 0.1, 1 / 3, 1 / 3),
    own(plain({ map: paper, roughness: 0.5 })),
    0,
    FLOOR,
    0,
  );
  paper.repeat.set(1, 1);
  floor.rotation.x = -Math.PI / 2;
  // The reed mat with its indigo binding.
  const mat = add(
    holed(MAT_SIZE.width, MAT_SIZE.depth, WIDTH - 1.2, DEPTH - 1.2, 1 / MAT_SIZE.width, 1 / MAT_SIZE.depth, 0.5),
    rich ? std({ map: reeds, roughness: 0.85, ...weave(6, 5, own, 0.5) }) : own(new T.MeshLambertMaterial({ map: reeds })),
    0,
    MAT,
    0,
  );
  mat.rotation.x = -Math.PI / 2;
  // The mat before the floor it covers.
  mat.renderOrder = -1;
  const binding = std({ color: "#1f2c52", roughness: 0.8 });
  for (const [w, d, x, z] of [[12.3, 0.16, 0, 5.3], [12.3, 0.16, 0, -5.3], [0.16, 10.6, 6, 0], [0.16, 10.6, -6, 0]] as const)
    add(block(w, 0.05, d, 0.02), binding, x, MAT - 0.01, z);
  // A cushion at each seat.
  const silk = std({ map: cushionTop(own), roughness: 0.55 }),
    seam = std({ color: "#a8322c", roughness: 0.6 }),
    cushion = own(block(2.2, 0.24, 2.2, 0.1));
  for (const z of [5.75, -5.75]) add(cushion, [seam, seam, silk, seam, seam, seam], 0, MAT + 0.12, z, true);
  // The small table at Cho's left: a twelve-sided lacquered top on curved legs.
  const lacquer = own(glossy({ color: "#5a1f14", roughness: 0.35 }, 0.8)),
    tableTop = 0.82,
    table = new T.Group();
  table.position.set(-6.4, MAT, 2.0);
  scene.add(table);
  const put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    table.add(mesh);
    return mesh;
  };
  put(new T.CylinderGeometry(1.05, 1.0, 0.08, 12), lacquer, 0, tableTop, 0);
  put(new T.CylinderGeometry(1.08, 1.08, 0.05, 12, 1, true), lacquer, 0, tableTop + 0.05, 0, false);
  put(new T.CylinderGeometry(0.86, 0.86, 0.14, 12, 1, true), lacquer, 0, tableTop - 0.1, 0, false);
  const leg = own(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.78, 0), new T.Vector3(0.1, 0.45, 0), new T.Vector3(-0.02, 0.18, 0), new T.Vector3(0.12, 0, 0)]), 10, 0.05, 6));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2,
      mesh = new T.Mesh(leg, lacquer);
    mesh.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
    mesh.rotation.y = -a;
    mesh.castShadow = true;
    table.add(mesh);
  }
  // White porcelain: a teapot, two cups, a plate of dried persimmons.
  const china = own(glossy({ color: "#f4f1e8", roughness: 0.25 }, 1)),
    y0 = tableTop + 0.04;
  put(lathe([[0, 0], [0.16, 0], [0.26, 0.08], [0.3, 0.2], [0.26, 0.32], [0.14, 0.38], [0.12, 0.4], [0, 0.4]], 20), china, -0.3, y0, -0.25);
  put(new T.SphereGeometry(0.05, 10, 8), china, -0.3, y0 + 0.43, -0.25);
  const spout = put(new T.CylinderGeometry(0.03, 0.05, 0.28, 8), china, -0.04, y0 + 0.24, -0.25);
  spout.rotation.z = -0.9;
  const handle = put(new T.TorusGeometry(0.1, 0.025, 6, 12, Math.PI), china, -0.58, y0 + 0.2, -0.25);
  handle.rotation.z = Math.PI / 2;
  const cup = own(lathe([[0, 0], [0.07, 0], [0.08, 0.02], [0.12, 0.12], [0.11, 0.13], [0.06, 0.03], [0, 0.03]], 16));
  for (const [x, z] of [[0.35, -0.35], [0.38, 0.05]]) put(cup, china, x, y0, z);
  const tea = std({ color: "#a8702a", roughness: 0.2 });
  for (const [x, z] of [[0.35, -0.35], [0.38, 0.05]]) {
    const top = put(new T.CircleGeometry(0.1, 14), tea, x, y0 + 0.1, z, false);
    top.rotation.x = -Math.PI / 2;
  }
  put(new T.CylinderGeometry(0.34, 0.22, 0.05, 20), china, -0.05, y0 + 0.025, 0.45);
  const persimmon = std({ color: "#c0581e", roughness: 0.55 }),
    fruit = own(new T.SphereGeometry(0.1, 12, 8));
  for (const [x, z] of [[-0.15, 0.4], [0.05, 0.48], [-0.05, 0.32], [-0.1, 0.55]]) {
    const f = new T.Mesh(fruit, persimmon);
    f.scale.set(1, 0.45, 1);
    f.position.set(x, y0 + 0.08, z);
    f.castShadow = true;
    table.add(f);
  }
  if (!rich) return;
  // The folding screen along the left wall, its panels set zigzag.
  const painting = screenPainting(own),
    frame = std({ map: own(wood(true)), roughness: 0.6 }),
    panels = 8,
    width = 1.42,
    tall = 3.3;
  for (let i = 0; i < panels; i++) {
    const g = new T.PlaneGeometry(width, tall),
      uv = g.getAttribute("uv");
    for (let v = 0; v < uv.count; v++) uv.setX(v, (i + uv.getX(v)) / panels);
    const panel = add(g, std({ map: painting, roughness: 0.85 }), -9.3 + (i % 2) * 0.28, MAT + tall / 2 + 0.06, -5.6 + (i + 0.5) * width * 0.97);
    panel.rotation.y = Math.PI / 2 + (i % 2 ? -0.28 : 0.28);
    add(new T.BoxGeometry(0.06, tall + 0.1, 0.06), frame, -9.3 + 0.14, MAT + tall / 2 + 0.06, -5.6 + i * width * 0.97);
  }
  // Plain plastered walls with timber posts on both sides, lattice doors on the right.
  const plaster = std({ ...stuff("stone", "#e8dcc2", 3, own), roughness: 0.95 }),
    timber = std({ map: own(wood(true)), roughness: 0.6 });
  const left = add(new T.PlaneGeometry(30, 7), plaster, -10.2, FLOOR + 3.5, 0);
  left.rotation.y = Math.PI / 2;
  const right = add(new T.PlaneGeometry(30, 7), plaster, 10.4, FLOOR + 3.5, 0);
  right.rotation.y = -Math.PI / 2;
  const doors = add(new T.PlaneGeometry(9, 3.6), std({ map: lattice(own), emissive: "#fff2d0", emissiveIntensity: 0.25, roughness: 0.9 }), 10.36, FLOOR + 2.1, 1);
  doors.rotation.y = -Math.PI / 2;
  doors.material instanceof T.MeshStandardMaterial && doors.material.map?.repeat.set(4, 1);
  for (const z of [-3.6, 5.6, -10, 10]) add(new T.BoxGeometry(0.3, 7, 0.3), timber, 10.25, FLOOR + 3.5, z);
  add(new T.BoxGeometry(0.2, 0.3, 30), timber, 10.3, FLOOR + 0.15, 0);
  add(new T.BoxGeometry(0.2, 0.3, 30), timber, -10.1, FLOOR + 0.15, 0);
  // A low chest of drawers against the right wall with bound books and a potted pine on it.
  const chest = std({ map: own(wood(true)), roughness: 0.45 }),
    brass = own(new T.MeshStandardMaterial({ color: "#c49a48", roughness: 0.35, metalness: 0.8 }));
  add(block(1.3, 1.1, 4.2, 0.04), chest, 9.4, FLOOR + 0.55, -2.2, true);
  for (const z of [-3.4, -2.2, -1.0])
    for (const y of [0.32, 0.78]) add(new T.CylinderGeometry(0.08, 0.08, 0.04, 12), brass, 8.73, FLOOR + y, z).rotation.z = Math.PI / 2;
  const cover = [std({ color: "#c8b48c", roughness: 0.8 }), std({ color: "#3d4e70", roughness: 0.7 })];
  for (let i = 0; i < 4; i++) {
    const book = add(new T.BoxGeometry(0.85, 0.07, 1.2), cover[i % 2 ? 0 : 1], 9.35, FLOOR + 1.135 + i * 0.075, -3.3 + (i % 2) * 0.05, true);
    book.rotation.y = (i - 1.5) * 0.06;
  }
  const pot = own(glossy({ color: "#7d9e8e", roughness: 0.3 }, 1));
  add(lathe([[0, 0], [0.32, 0], [0.4, 0.08], [0.44, 0.3], [0.4, 0.34], [0, 0.34]], 20), pot, 9.4, FLOOR + 1.1, -1.4, true);
  const trunk = add(new T.CylinderGeometry(0.05, 0.08, 0.7, 7), std({ color: "#4a3426", roughness: 0.9 }), 9.4, FLOOR + 1.75, -1.4, true);
  trunk.rotation.z = 0.35;
  const grove = new Grove(scene, own, { shadow: false, bright: 1.2, lift: 1.1, leaves: 0.6 });
  grove.crown("pine", [9.25, FLOOR + 2.15, -1.4], [0.55, 0.28, 0.45], "#4f7a46", 1);
  grove.crown("pine", [9.6, FLOOR + 1.92, -1.2], [0.38, 0.2, 0.34], "#57814c", 2);
  grove.crown("pine", [9.05, FLOOR + 1.85, -1.65], [0.34, 0.18, 0.3], "#4b7444", 3);
  grove.build();
}
