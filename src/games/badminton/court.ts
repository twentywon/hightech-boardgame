import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block } from "../../engine/scene-utils";
import { compactStill } from "./merge";
import { DOUBLES_LONG, DOUBLES_W, HALF_L, HALF_W, NET_H, POST, SHORT } from "./sim";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A tiny fixed sequence, so that the painted pictures and the hall come out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(own: Own, c: HTMLCanvasElement, repeat?: [number, number], colour = true) {
  const t = own(new T.CanvasTexture(c));
  if (colour) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
/**
 * A normal map from a painted height picture (bright is high): the slopes of each texel's neighbours, so that boards,
 * seams and slats catch the light on a graphics card.
 */
function normalFrom(own: Own, height: HTMLCanvasElement, strength: number, repeat?: [number, number]) {
  const w = height.width,
    h = height.height,
    src = height.getContext("2d")!.getImageData(0, 0, w, h).data,
    { c, ctx } = canvas(w, h),
    out = ctx.createImageData(w, h),
    at = (x: number, y: number) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength,
        l = Math.hypot(dx, dy, 1),
        i = (y * w + x) * 4;
      out.data[i] = 128 + (-dx / l) * 127;
      out.data[i + 1] = 128 + (dy / l) * 127;
      out.data[i + 2] = 128 + (1 / l) * 127;
      out.data[i + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
  return texture(own, c, repeat, false);
}
const mesh = (own: Own, geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, parent: T.Object3D, shadow = true, receive = true) => {
  const m = new T.Mesh(own(geometry), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  // What no shadow reaches (the walls, the roof, things high up) is drawn without looking for one: cheaper.
  m.receiveShadow = receive;
  parent.add(m);
  return m;
};
/** How far the green mat reaches round the doubles court's lines. */
export const MAT_X = DOUBLES_W + 1.1,
  MAT_Z = HALF_L + 1.6;
/**
 * The sports floor: long narrow maple boards laid along the hall, each a little different in tone, with fine grain,
 * the joints between them, and a deep gloss. Its height picture (for the boards' joints on a graphics card) and a
 * roughness picture (the varnish worn duller in places) come with it.
 */
function floorPictures(own: Own, rich: boolean) {
  const S = 1024,
    { c, ctx } = canvas(S, S),
    hgt = rich ? canvas(S, S) : null,
    random = sequence(29),
    boards = 16,
    bw = S / boards;
  ctx.fillStyle = "#d6ab78";
  ctx.fillRect(0, 0, S, S);
  if (hgt) {
    hgt.ctx.fillStyle = "#fff";
    hgt.ctx.fillRect(0, 0, S, S);
  }
  for (let b = 0; b < boards; b++) {
    // Each lane of boards is broken into lengths at staggered joints.
    let y = -random() * S;
    while (y < S) {
      const len = S * (0.35 + random() * 0.5),
        tone = random(),
        r = 214 + (tone - 0.5) * 34,
        g = 170 + (tone - 0.5) * 30,
        bl = 118 + (tone - 0.5) * 26;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
      ctx.fillRect(b * bw, y, bw, len);
      // Grain: long faint streaks and a few darker flecks along the board.
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = random() < 0.5 ? "rgba(120,70,30,0.07)" : "rgba(255,240,210,0.06)";
        const gx = b * bw + random() * bw;
        ctx.fillRect(gx, y, 0.8 + random() * 1.6, len);
      }
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = "rgba(110,62,26,0.18)";
        ctx.beginPath();
        ctx.ellipse(b * bw + random() * bw, y + random() * len, 0.8 + random() * 1.6, 3 + random() * 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // The joint at the board's end.
      ctx.fillStyle = "rgba(70,40,18,0.55)";
      ctx.fillRect(b * bw, y + len - 1, bw, 1.4);
      if (hgt) {
        hgt.ctx.fillStyle = "#777";
        hgt.ctx.fillRect(b * bw, y + len - 1, bw, 1.6);
      }
      // Wrapped round: a board crossing the picture's edge goes on at the top.
      if (y + len > S) {
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${bl | 0})`;
        ctx.fillRect(b * bw, y - S, bw, len);
      }
      y += len;
    }
    // The joint between lanes.
    ctx.fillStyle = "rgba(80,46,20,0.45)";
    ctx.fillRect(b * bw, 0, 1.2, S);
    if (hgt) {
      hgt.ctx.fillStyle = "#666";
      hgt.ctx.fillRect(b * bw, 0, 1.6, S);
    }
  }
  const map = texture(own, c, [3.2, 5]);
  // The varnish: duller in broad soft patches (where feet go), shinier elsewhere.
  const { c: rc, ctx: rx } = canvas(256, 256);
  rx.fillStyle = "#5a5a5a";
  rx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 40; k++) {
    const x = random() * 256,
      y = random() * 256,
      g = rx.createRadialGradient(x, y, 0, x, y, 20 + random() * 50);
    g.addColorStop(0, `rgba(${random() < 0.5 ? "150,150,150" : "40,40,40"},0.35)`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    rx.fillStyle = g;
    rx.fillRect(0, 0, 256, 256);
  }
  const rough = texture(own, rc, [3.2, 5], false);
  return { map, rough, normal: hgt ? normalFrom(own, hgt.c, 2.2, [3.2, 5]) : null };
}
/**
 * The court's mat: green synthetic laid in rolls along the court (their seams faint), with a fine texture, and every
 * line of a real court in white 4 cm wide (inside its area): the doubles and singles side lines, the back lines, the
 * doubles long service lines, the short service lines and the centre lines. Only the singles court counts here (the
 * rules say so).
 */
function matPicture(own: Own) {
  const W = 1640,
    H = Math.round((W * MAT_Z) / MAT_X),
    { c, ctx } = canvas(W, H),
    random = sequence(11),
    px = W / (MAT_X * 2),
    X = (x: number) => W / 2 + x * px,
    Z = (z: number) => H / 2 + z * px,
    line = 0.04 * px;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1c6a4d");
  g.addColorStop(0.5, "#21775a");
  g.addColorStop(1, "#1b664b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // The fine pebbled surface of a sports mat.
  for (let k = 0; k < 42000; k++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,22,12,0.06)";
    ctx.fillRect(random() * W, random() * H, 1 + random() * 1.8, 1 + random() * 1.4);
  }
  // The rolls' seams, along the court.
  ctx.fillStyle = "rgba(0,30,18,0.28)";
  for (let x = -MAT_X + 1.5; x < MAT_X; x += 1.5) ctx.fillRect(X(x) - 0.8, 0, 1.6, H);
  // A darker band round the edge where the mat is taped down.
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 0.08 * px;
  ctx.strokeRect(0, 0, W, H);
  ctx.fillStyle = "#f6f8f2";
  ctx.shadowColor = "rgba(255,255,255,0.35)";
  ctx.shadowBlur = 1.5;
  const across = (z: number, inward: number, from = -DOUBLES_W, to = DOUBLES_W) => ctx.fillRect(X(from), Z(z) - (inward > 0 ? 0 : line), X(to) - X(from), line),
    along = (x: number, inward: number, from: number, to: number) => ctx.fillRect(X(x) - (inward > 0 ? 0 : line), Z(from), line, Z(to) - Z(from));
  for (const s of [-1, 1]) {
    across(s * HALF_L, -s);
    across(s * DOUBLES_LONG, -s);
    across(s * SHORT, s);
    along(s * DOUBLES_W, -s, -HALF_L, HALF_L);
    along(s * HALF_W, -s, -HALF_L, HALF_L);
    // The centre line from the short service line to the back line, half on each service court.
    ctx.fillRect(X(0) - line / 2, Z(s > 0 ? SHORT : -HALF_L), line, Z(s > 0 ? HALF_L : -SHORT) - Z(s > 0 ? SHORT : -HALF_L));
  }
  ctx.shadowBlur = 0;
  return texture(own, c);
}
/** The net's mesh: dark cord knotted in squares, a little heavier along its foot, on nothing. */
function netPicture(own: Own) {
  const { c, ctx } = canvas(2048, 256);
  const cell = 14;
  ctx.strokeStyle = "rgba(12,14,20,0.95)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= 2048; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let y = 0; y <= 256; y += cell) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(2048, y);
    ctx.stroke();
  }
  // The knots where the cords cross.
  ctx.fillStyle = "rgba(8,10,14,1)";
  for (let x = 0; x <= 2048; x += cell) for (let y = 0; y <= 256; y += cell) ctx.fillRect(x - 2, y - 2, 4, 4);
  // The cord along the net's foot.
  ctx.fillStyle = "rgba(10,12,16,0.95)";
  ctx.fillRect(0, 248, 2048, 8);
  return texture(own, c);
}
/** A banner on the hall's wall: bold letters on a colour, with a thin light rule above and below. */
function bannerPicture(own: Own, text: string, ground: string, ink: string) {
  const { c, ctx } = canvas(1024, 160);
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, ground);
  g.addColorStop(1, shade(ground, -0.25));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, 12, 1024, 4);
  ctx.fillRect(0, 144, 1024, 4);
  ctx.fillStyle = ink;
  ctx.font = '900 78px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 82, 980);
  return texture(own, c);
}
/** A colour made lighter (`by` > 0) or darker (< 0). */
function shade(hex: string, by: number) {
  const n = parseInt(hex.slice(1), 16),
    f = (v: number) => Math.round(Math.max(0, Math.min(255, by >= 0 ? v + (255 - v) * by : v * (1 + by))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
/**
 * The advertising boards round the court (lit screens): a strip of made-up makers' names, each on its own colour,
 * drawn twice across so that it can slide along without a seam.
 */
function boardsPicture(own: Own) {
  const ads: [string, string, string][] = [
    ["SKYLARK", "#0d2a63", "#ffffff"],
    ["FEATHERLITE", "#f2f2f2", "#d8322a"],
    ["WORLD TABLE GAMES", "#c8302a", "#ffffff"],
    ["NIMBUS WATER", "#0f7bc4", "#ffffff"],
    ["배드민턴 오픈", "#16408a", "#ffe27a"],
    ["SWIFT GRIP", "#141414", "#9be03a"],
    ["달빛버거", "#0f5f63", "#ffb347"],
    ["AERO SHUTTLE", "#f6c21c", "#16233f"],
  ];
  const cellW = 512,
    { c, ctx } = canvas(cellW * ads.length, 96);
  ads.forEach(([text, ground, ink], k) => {
    const x = k * cellW,
      g = ctx.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, shade(ground, 0.12));
    g.addColorStop(1, shade(ground, -0.18));
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, cellW, 96);
    ctx.fillStyle = ink;
    ctx.font = '900 54px "Inter", "Noto Sans KR", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + cellW / 2, 50, cellW - 50);
  });
  // The LED pitch: fine dark lines across, faintly.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < 96; y += 3) ctx.fillRect(0, y, c.width, 1);
  const t = texture(own, c);
  t.wrapS = T.RepeatWrapping;
  return t;
}
/** The upper walls: tall slats of pale wood with dark gaps between, an acoustic panel. */
function slatsPicture(own: Own, rich: boolean) {
  const { c, ctx } = canvas(512, 512),
    hgt = rich ? canvas(512, 512) : null,
    random = sequence(41);
  ctx.fillStyle = "#3a3430";
  ctx.fillRect(0, 0, 512, 512);
  if (hgt) {
    hgt.ctx.fillStyle = "#000";
    hgt.ctx.fillRect(0, 0, 512, 512);
  }
  for (let x = 0; x < 512; x += 32) {
    const tone = random(),
      g = ctx.createLinearGradient(x, 0, x + 26, 0);
    g.addColorStop(0, `rgb(${196 + tone * 20},${160 + tone * 18},${118 + tone * 14})`);
    g.addColorStop(1, `rgb(${170 + tone * 20},${134 + tone * 18},${96 + tone * 14})`);
    ctx.fillStyle = g;
    ctx.fillRect(x + 3, 0, 26, 512);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = "rgba(110,70,36,0.09)";
      ctx.fillRect(x + 4 + random() * 24, 0, 1, 512);
    }
    if (hgt) {
      hgt.ctx.fillStyle = "#fff";
      hgt.ctx.fillRect(x + 4, 0, 24, 512);
    }
  }
  return { map: texture(own, c, [6, 1]), normal: hgt ? normalFrom(own, hgt.c, 3, [6, 1]) : null };
}
/** The roof's underside: ribbed steel deck, pale grey, the ribs shadowed. */
function deckPicture(own: Own) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#9aa1aa";
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const g = ctx.createLinearGradient(x, 0, x + 32, 0);
    g.addColorStop(0, "#7d848d");
    g.addColorStop(0.3, "#b6bcc4");
    g.addColorStop(0.55, "#8d949d");
    g.addColorStop(1, "#7a818a");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 32, 256);
  }
  return texture(own, c, [30, 1]);
}
/** The high windows: frosted glass glowing with daylight, in a grid of frames. */
function windowPicture(own: Own) {
  const { c, ctx } = canvas(512, 128);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "#eaf4ff");
  g.addColorStop(1, "#bcd6ef");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#4a525c";
  for (let x = 0; x <= 512; x += 64) ctx.fillRect(x - 3, 0, 6, 128);
  ctx.fillRect(0, 0, 512, 6);
  ctx.fillRect(0, 122, 512, 6);
  ctx.fillRect(0, 62, 512, 4);
  return texture(own, c, [8, 1]);
}
/** A shuttlecock's feathers: white vanes with their quills and a faint shadow between them, the edge cut in scallops. */
export function featherPicture(own: Own) {
  const { c, ctx } = canvas(1024, 256);
  ctx.clearRect(0, 0, 1024, 256);
  const vanes = 16,
    w = 1024 / vanes;
  for (let k = 0; k < vanes; k++) {
    const x = k * w,
      g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "#fdfdf8");
    g.addColorStop(0.7, "#f2f1ea");
    g.addColorStop(1, "#d9d7cc");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 1, 256);
    ctx.lineTo(x + 1, 44);
    ctx.quadraticCurveTo(x + w / 2, 2, x + w - 1, 44);
    ctx.lineTo(x + w - 1, 256);
    ctx.closePath();
    ctx.fill();
    // The barbs: fine slanting lines off the quill.
    ctx.strokeStyle = "rgba(170,165,150,0.25)";
    ctx.lineWidth = 0.7;
    for (let y = 40; y < 256; y += 6) {
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + 3, y - 8);
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w - 3, y - 8);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(120,120,110,0.25)";
    ctx.fillRect(x + w - 4, 40, 3, 216);
    ctx.fillStyle = "rgba(196,186,160,0.95)";
    ctx.fillRect(x + w / 2 - 1.4, 28, 2.8, 228);
  }
  // The thread bands that hold the feathers together, and the glued collar at the cork.
  ctx.fillStyle = "rgba(34,36,44,0.8)";
  ctx.fillRect(0, 148, 1024, 5);
  ctx.fillRect(0, 196, 1024, 5);
  ctx.fillStyle = "rgba(240,236,224,1)";
  ctx.fillRect(0, 236, 1024, 20);
  return texture(own, c);
}
/** The scoreboard's face: the two names and their points, as a lit screen shows them. */
function scorePicture(c: HTMLCanvasElement, names: [string, string], points: [number, number], games: [number, number]) {
  const ctx = c.getContext("2d")!,
    W = c.width,
    H = c.height;
  ctx.fillStyle = "#06080d";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0e1a33";
  ctx.fillRect(0, 0, W, 58);
  ctx.fillStyle = "#ffd34a";
  ctx.font = '900 34px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("WORLD TABLE BADMINTON", W / 2, 31);
  const colours = ["#ff5a48", "#4c9bff"];
  for (const side of [0, 1] as const) {
    const y = 104 + side * 84;
    ctx.fillStyle = colours[side];
    ctx.fillRect(24, y - 30, 14, 60);
    ctx.textAlign = "left";
    ctx.fillStyle = "#f2f4f8";
    ctx.font = '800 44px "Inter", "Noto Sans KR", Arial, sans-serif';
    ctx.fillText(names[side], 56, y, W - 330);
    ctx.textAlign = "center";
    ctx.fillStyle = "#9fb0c8";
    ctx.font = '800 40px "Inter", Arial, sans-serif';
    ctx.fillText(String(games[side]), W - 220, y);
    ctx.fillStyle = "#ffe066";
    ctx.font = '900 64px "Inter", Arial, sans-serif';
    ctx.fillText(String(points[side]), W - 92, y + 2);
  }
  // The LED pitch.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}
/** A soft round glow, bright in the middle (under a lamp). */
function glowPicture(own: Own, colour: string) {
  const { c, ctx } = canvas(128, 128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, colour);
  g.addColorStop(0.25, `${colour}aa`);
  g.addColorStop(1, `${colour}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(own, c);
}
/** Places a geometry (cloned) at a spot, turned, for merging. */
const placed = (geometry: T.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  geometry
    .clone()
    .applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx, ry, rz)))
    .translate(x, y, z);

export interface Hall {
  group: T.Group;
  /** The hall's moving parts each frame: the advertising boards slide along. */
  tick(t: number): void;
  /** The scoreboard on the far wall shows the score (redrawn only when it changes). */
  score(names: [string, string], points: [number, number], games: [number, number]): void;
}
/**
 * The hall: a maple sports floor with the court's green mat, the net between its posts on weighted bases, lit
 * advertising boards round the court, the umpire's high chair and the line judges on theirs, benches with bags and shuttle
 * tubes, stands of seats with spectators along one side and at both ends, padded walls with slatted wood above and a
 * band of high windows, a big scoreboard over the far end, banners, and steel trusses under a ribbed roof with rows
 * of high-bay lamps. `rich` (a graphics card) adds relief to the floor and the walls and the lamps' glows.
 */
export function hall(scene: T.Scene, own: Own, rich: boolean): Hall {
  const group = new T.Group(),
    random = sequence(3);
  scene.add(group);
  // On a graphics card the hall is painted with the full physical light; where the processor draws alone, the simpler
  // light of a matte paint (a fraction of the cost per pixel, and the hall fills most of the screen).
  const coat = (p: T.MeshStandardMaterialParameters): T.MeshStandardMaterial => {
    if (rich) return new T.MeshStandardMaterial(p);
    const { roughness: _r, metalness: _m, roughnessMap: _rm, envMapIntensity: _e, normalMap: _n, normalScale: _ns, ...rest } = p;
    return new T.MeshLambertMaterial(rest) as unknown as T.MeshStandardMaterial;
  };
  // The floor: varnished maple boards; the mat over it, a little raised.
  const fp = floorPictures(own, rich),
    floor = own(
      coat({
        map: fp.map,
        roughnessMap: rich ? fp.rough : null,
        normalMap: fp.normal,
        normalScale: new T.Vector2(0.6, 0.6),
        roughness: rich ? 0.55 : 0.5,
        metalness: 0,
        envMapIntensity: 1.4,
      }),
    );
  mesh(own, new T.PlaneGeometry(30, 36).rotateX(-Math.PI / 2), floor, 1.5, -0.002, 0, group, false);
  const mat = own(coat({ map: matPicture(own), roughness: 0.8, envMapIntensity: 0.6 })),
    matEdge = own(coat({ color: "#174f3b", roughness: 0.85 }));
  mesh(own, new T.BoxGeometry(MAT_X * 2, 0.006, MAT_Z * 2), [matEdge, matEdge, mat, matEdge, matEdge, matEdge], 0, 0.001 - 0.003, 0, group, false).receiveShadow = true;
  // The net: its mesh 76 cm deep under a white tape, the cords to the posts, and the posts on their weighted bases.
  const netPaint = own(coat({ map: netPicture(own), transparent: true, alphaTest: 0.25, side: T.DoubleSide, roughness: 0.9 })),
    tape = own(coat({ color: "#f8f8f2", roughness: 0.55 })),
    steel = own(coat({ color: "#26364a", roughness: 0.35, metalness: 0.6 })),
    cap = own(coat({ color: "#d7dde4", roughness: 0.25, metalness: 0.85 })),
    baseRed = own(coat({ color: "#c8302a", roughness: 0.45 })),
    rubber = own(coat({ color: "#16181c", roughness: 0.9 })),
    deep = 0.76;
  const netMesh = mesh(own, new T.PlaneGeometry(POST * 2, deep), netPaint, 0, NET_H - deep / 2 - 0.035, 0, group, false);
  netMesh.renderOrder = 1;
  mesh(own, block(POST * 2, 0.075, 0.014, 0.006), tape, 0, NET_H - 0.037, 0, group, false);
  for (const sx of [-1, 1]) {
    mesh(own, new T.CylinderGeometry(0.024, 0.028, 1.55, 16), steel, sx * POST, 0.775, 0, group);
    mesh(own, new T.SphereGeometry(0.032, 14, 10), cap, sx * POST, 1.56, 0, group);
    // The weighted base: a red rounded block on a rubber foot, its wheels, reaching out from the court.
    mesh(own, block(0.62, 0.12, 0.4, 0.05), baseRed, sx * (POST + 0.16), 0.08, 0, group);
    mesh(own, block(0.66, 0.025, 0.44, 0.01), rubber, sx * (POST + 0.16), 0.012, 0, group, false);
    for (const dz of [-0.16, 0.16]) mesh(own, new T.CylinderGeometry(0.035, 0.035, 0.03, 14).rotateX(Math.PI / 2), rubber, sx * (POST + 0.42), 0.035, dz, group, false);
    mesh(own, new T.CylinderGeometry(0.004, 0.004, 0.8, 6), tape, sx * POST, 1.12, 0.012, group, false);
  }
  // The umpire's high chair beside the net with its steps and the umpire on it; a line judge on a chair at each end.
  const chairPaint = own(coat({ color: "#1d4c8c", roughness: 0.45, metalness: 0.25 })),
    seatPaint = own(coat({ color: "#20232a", roughness: 0.7 })),
    blazer = own(coat({ color: "#1b2333", roughness: 0.75 })),
    trousers = own(coat({ color: "#3a3f4a", roughness: 0.8 })),
    skin = own(coat({ color: "#d9a882", roughness: 0.65 })),
    hairDark = own(coat({ color: "#2a211b", roughness: 0.85 })),
    chair = new T.Group();
  chair.position.set(POST + 1.0, 0, 0);
  group.add(chair);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) mesh(own, new T.BoxGeometry(0.05, 1.6, 0.05), chairPaint, x, 0.8, z, chair);
  mesh(own, block(0.7, 0.06, 0.7, 0.02), seatPaint, 0, 1.62, 0, chair);
  mesh(own, block(0.66, 0.5, 0.06, 0.02), chairPaint, 0.32, 1.9, 0, chair).rotation.y = Math.PI / 2;
  for (let k = 0; k < 5; k++) mesh(own, new T.BoxGeometry(0.4, 0.04, 0.18), seatPaint, 0.55, 0.28 + k * 0.3, 0, chair);
  /** A seated official facing `turn` (radians about y; 0 faces +z). */
  const official = (parent: T.Object3D, x: number, y: number, z: number, turn: number) => {
    const p = new T.Group();
    p.position.set(x, y, z);
    p.rotation.y = turn;
    parent.add(p);
    mesh(own, new T.CapsuleGeometry(0.15, 0.32, 4, 12), blazer, 0, 0.32, 0, p).scale.set(1.1, 1, 0.8);
    for (const sx of [-1, 1]) {
      mesh(own, new T.CapsuleGeometry(0.06, 0.3, 4, 8).rotateX(Math.PI / 2), trousers, sx * 0.08, 0.04, 0.17, p);
      mesh(own, new T.CapsuleGeometry(0.055, 0.32, 4, 8), trousers, sx * 0.08, -0.2, 0.34, p);
    }
    mesh(own, new T.SphereGeometry(0.1, 16, 12), skin, 0, 0.72, 0, p);
    mesh(own, new T.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hairDark, 0, 0.735, -0.01, p);
    return p;
  };
  // (The umpire's chair stands empty: sat on it, the umpire's back rose right into the eye's way beside the net.)
  for (const sz of [-1, 1]) {
    const judge = new T.Group();
    judge.position.set(DOUBLES_W + 1.3, 0, sz * (HALF_L + 0.9));
    group.add(judge);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) mesh(own, new T.CylinderGeometry(0.015, 0.015, 0.45, 8), steel, x, 0.225, z, judge);
    mesh(own, block(0.45, 0.05, 0.45, 0.015), chairPaint, 0, 0.46, 0, judge);
    mesh(own, block(0.45, 0.42, 0.04, 0.015), chairPaint, 0, 0.68, sz * 0.21, judge);
    official(judge, 0, 0.5, 0, sz > 0 ? Math.PI : 0);
  }
  // Benches at the side with the players' bags, towels and tubes of shuttles.
  const benchWood = own(coat({ color: "#b07a44", roughness: 0.5 })),
    tubePaint = [own(coat({ color: "#1b5fb0", roughness: 0.35 })), own(coat({ color: "#d8382a", roughness: 0.35 }))],
    bagPaint = [own(coat({ color: "#2a2f3a", roughness: 0.8 })), own(coat({ color: "#b8312a", roughness: 0.8 }))],
    towel = own(coat({ color: "#f4f1e8", roughness: 0.95 })),
    bottle = own(coat({ color: "#7fc4f0", roughness: 0.15, transparent: true, opacity: 0.8 }));
  for (const sz of [-1, 1]) {
    const x = -(DOUBLES_W + 1.6),
      z = sz * 3.4;
    mesh(own, block(0.42, 0.05, 2.2, 0.02), benchWood, x, 0.45, z, group);
    for (const dz of [-0.9, 0.9]) mesh(own, new T.BoxGeometry(0.36, 0.45, 0.05), steel, x, 0.225, z + dz, group);
    const side = sz > 0 ? 0 : 1;
    mesh(own, new T.CapsuleGeometry(0.16, 0.6, 4, 12).rotateX(Math.PI / 2), bagPaint[side], x, 0.66, z - 0.4, group);
    mesh(own, block(0.3, 0.04, 0.36, 0.015), towel, x, 0.49, z + 0.1, group, false);
    mesh(own, new T.CylinderGeometry(0.035, 0.035, 0.22, 12), bottle, x + 0.1, 0.58, z + 0.95, group);
    for (let k = 0; k < 3; k++) mesh(own, new T.CylinderGeometry(0.045, 0.045, 0.82, 14).rotateX(Math.PI / 2).rotateY(0.2 * k), tubePaint[side], x + 0.06 - k * 0.05, 0.52 + k * 0.09, z + 0.55, group);
  }
  // The advertising boards round the court: lit screens on low frames, behind each back line and along the far side.
  const boardMap = boardsPicture(own),
    boardFace = own(new T.MeshBasicMaterial({ map: boardMap, toneMapped: false })),
    boardBack = own(coat({ color: "#14171d", roughness: 0.6, metalness: 0.3 })),
    boardMaps: T.Texture[] = [];
  const adBoard = (w: number, x: number, z: number, turn: number, offset: number) => {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    group.add(g);
    mesh(own, block(w, 0.92, 0.22, 0.03), boardBack, 0, 0.46, -0.11, g);
    // Each board its own copy of the strip's map, so that each slides from its own place.
    const map = own(boardMap.clone());
    map.repeat.set(w / 3.4 / 8, 1);
    map.offset.x = offset;
    boardMaps.push(map);
    const face = own(boardFace.clone());
    face.map = map;
    mesh(own, new T.PlaneGeometry(w, 0.78), face, 0, 0.47, 0.005, g, false);
  };
  for (const sz of [-1, 1]) adBoard(13, 0.8, sz * (HALF_L + 3.1), sz > 0 ? Math.PI : 0, sz > 0 ? 0.37 : 0);
  adBoard(11, -(DOUBLES_W + 4.6), -2.6, Math.PI / 2, 0.61);
  // Stands of seats: along the right side, and at both ends behind the boards. Rows rising, in blocks of colour, about
  // two in three seats taken by spectators in many colours (all drawn together, instanced: few draw calls).
  const seatColours = ["#c8352a", "#1f5fb8", "#f2b62a"].map((c) => own(coat({ color: c, roughness: 0.5 }))),
    stepPaint = own(coat({ color: "#59606d", roughness: 0.85 })),
    rail = own(coat({ color: "#c9cfd6", roughness: 0.3, metalness: 0.8 })),
    // Plain boxes for the seats: hundreds of them, so few triangles each.
    seat = own(new T.BoxGeometry(0.42, 0.08, 0.38)),
    back = own(new T.BoxGeometry(0.42, 0.32, 0.05)),
    torsoShape = own(new T.CapsuleGeometry(0.15, 0.3, 2, 8).scale(1.05, 1, 0.75)),
    headShape = own(new T.SphereGeometry(0.1, 9, 7)),
    hairShape = own(new T.SphereGeometry(0.106, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.5)),
    crowdBody = own(coat({ roughness: 0.8 })),
    crowdHead = own(coat({ roughness: 0.7 })),
    shirts = ["#d8322a", "#2363d0", "#f2f2f2", "#1a1d24", "#f2b62a", "#3aa357", "#8a4fc4", "#e86a2a", "#2bb3c8", "#c43d78"].map((c) => new T.Color(c)),
    skins = ["#f0c9a6", "#d9a882", "#b88660", "#8a5a3a", "#e8b896"].map((c) => new T.Color(c)),
    hair = ["#1d1611", "#3b2a1c", "#6b4a2a", "#c8a060", "#2a2a2a", "#8c8c8c"].map((c) => new T.Color(c)),
    people: { body: T.Matrix4; head: T.Matrix4; shirt: T.Color; skin: T.Color; hair: T.Color }[] = [];
  const stand = (x0: number, z0: number, turn: number, rows: number, half: number) => {
    const s = new T.Group();
    s.position.set(x0, 0, z0);
    s.rotation.y = turn;
    group.add(s);
    s.updateMatrixWorld(true);
    const places: [number, T.Matrix4, T.Matrix4][] = [],
      rot = new T.Matrix4().makeRotationY(Math.PI / 2);
    for (let row = 0; row < rows; row++) {
      const x = row * 0.8,
        y = 0.5 + row * 0.45;
      mesh(own, new T.BoxGeometry(0.8, y, half * 2 + 1), stepPaint, x, y / 2, 0, s, false);
      for (let k = -Math.floor(half / 0.78); k <= Math.floor(half / 0.78); k++) {
        places.push([Math.abs(k + row * 2) % 3 === 0 ? 2 : k < 0 ? 0 : 1, new T.Matrix4().makeTranslation(x - 0.05, y + 0.25, k * 0.78), new T.Matrix4().makeTranslation(x + 0.2, y + 0.44, k * 0.78).multiply(rot)]);
        if (random() < 0.66) {
          const lean = (random() - 0.5) * 0.25,
            world = s.matrixWorld;
          people.push({
            body: world.clone().multiply(new T.Matrix4().makeTranslation(x + 0.02, y + 0.58, k * 0.78 + (random() - 0.5) * 0.1).multiply(new T.Matrix4().makeRotationZ(lean))),
            head: world.clone().multiply(new T.Matrix4().makeTranslation(x - 0.02 + lean * 0.3, y + 0.98, k * 0.78 + (random() - 0.5) * 0.1)),
            shirt: shirts[Math.floor(random() * shirts.length)],
            skin: skins[Math.floor(random() * skins.length)],
            hair: hair[Math.floor(random() * hair.length)],
          });
        }
      }
    }
    // The rail along the front.
    {
      // The rail along the front and its posts, as one shape.
      const bar = new T.CylinderGeometry(0.025, 0.025, half * 2 + 1, 10).rotateX(Math.PI / 2),
        post = new T.CylinderGeometry(0.02, 0.02, 1.05, 8),
        parts = [placed(bar, -0.5, 1.05, 0)];
      for (let k = -half; k <= half; k += 2) parts.push(placed(post, -0.5, 0.525, k));
      const merged = mergeGeometries(parts);
      for (const p of [bar, post, ...parts]) p.dispose();
      mesh(own, merged, rail, 0, 0, 0, s, false, false);
    }
    seatColours.forEach((paint, colour) => {
      const mine = places.filter(([c]) => c === colour),
        seats = new T.InstancedMesh(seat, paint, mine.length),
        backs = new T.InstancedMesh(back, paint, mine.length);
      mine.forEach(([, a, b], i) => {
        seats.setMatrixAt(i, a);
        backs.setMatrixAt(i, b);
      });
      seats.receiveShadow = backs.receiveShadow = true;
      s.add(seats, backs);
    });
  };
  stand(9.6, 0, 0, 7, 14.5);
  for (const sz of [-1, 1]) stand(0.6, sz * (HALF_L + 4.6), sz > 0 ? -Math.PI / 2 : Math.PI / 2, 5, 7.5);
  {
    const bodies = new T.InstancedMesh(torsoShape, crowdBody, people.length),
      heads = new T.InstancedMesh(headShape, crowdHead, people.length),
      hairs = new T.InstancedMesh(hairShape, own(crowdHead.clone()), people.length),
      cap = new T.Matrix4().makeTranslation(0.012, 0.012, 0);
    people.forEach((p, i) => {
      bodies.setMatrixAt(i, p.body);
      bodies.setColorAt(i, p.shirt);
      heads.setMatrixAt(i, p.head);
      heads.setColorAt(i, p.skin);
      hairs.setMatrixAt(i, p.head.clone().multiply(cap));
      hairs.setColorAt(i, p.hair);
    });
    group.add(bodies, heads, hairs);
  }
  // The walls: padded panels low (dark blue, seamed), slatted wood above, a band of high windows, then the roof.
  const pad = own(coat({ color: "#1d3561", roughness: 0.75 })),
    slat = slatsPicture(own, rich),
    slats = own(coat({ map: slat.map, normalMap: slat.normal, roughness: 0.7 })),
    concrete = own(coat({ color: "#c9ced5", roughness: 0.95 })),
    glass = own(new T.MeshBasicMaterial({ map: windowPicture(own), toneMapped: false })),
    padShape = own(block(1.96, 2.2, 0.16, 0.05));
  const wall = (w: number, x: number, z: number, turn: number) => {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    group.add(g);
    g.updateMatrixWorld(true);
    const n = Math.floor(w / 2),
      pads = new T.InstancedMesh(padShape, pad, n);
    for (let k = 0; k < n; k++) pads.setMatrixAt(k, new T.Matrix4().makeTranslation(-w / 2 + 1 + k * 2 + (w - n * 2) / 2, 1.1, 0.08));
    pads.receiveShadow = true;
    g.add(pads);
    mesh(own, new T.PlaneGeometry(w, 2.4), concrete, 0, 1.2, 0, g, false, false);
    const tile = slats.map ? own(slats.map.clone()) : null;
    if (tile) tile.repeat.set(w / 4, 1);
    const wood = tile ? own(slats.clone()) : slats;
    if (tile) (wood as T.MeshStandardMaterial).map = tile;
    if (slat.normal && tile) {
      const n2 = own(slat.normal.clone());
      n2.repeat.set(w / 4, 1);
      (wood as T.MeshStandardMaterial).normalMap = n2;
    }
    mesh(own, new T.PlaneGeometry(w, 5.2), wood, 0, 4.8, 0, g, false, false);
    mesh(own, new T.PlaneGeometry(w, 1.0), concrete, 0, 7.9, 0, g, false, false);
    const pane = own(glass.clone());
    const view = own(glass.map!.clone());
    view.repeat.set(w / 4, 1);
    pane.map = view;
    mesh(own, new T.PlaneGeometry(w, 2.4), pane, 0, 9.6, 0, g, false, false);
    mesh(own, new T.PlaneGeometry(w, 1.4), concrete, 0, 11.5, 0, g, false, false);
    return g;
  };
  const far = wall(30, 1.5, -18, 0),
    near = wall(30, 1.5, 18, Math.PI);
  wall(36, -13.5, 0, Math.PI / 2);
  wall(36, 16.5, 0, -Math.PI / 2);
  const banners: [string, string, string][] = [
    ["WORLD TABLE GAMES · BADMINTON", "#c8302a", "#ffffff"],
    ["배드민턴 오픈", "#16408a", "#ffe27a"],
  ];
  banners.forEach(([text, ground, ink], k) => {
    const paint = own(coat({ map: bannerPicture(own, text, ground, ink), roughness: 0.7, emissive: "#ffffff", emissiveIntensity: 0.05 }));
    mesh(own, new T.PlaneGeometry(8.4, 1.3), paint, (k ? -1 : 1) * 7.6, 5.2, 0.03, far, false, false);
    mesh(own, new T.PlaneGeometry(8.4, 1.3), paint, (k ? 1 : -1) * 7.6, 5.2, 0.03, near, false, false);
  });
  // The scoreboard: a lit screen in a dark frame high over each end (the far one faces me, the near one the far player).
  const board = canvas(1024, 256),
    boardTex = own(new T.CanvasTexture(board.c));
  boardTex.colorSpace = T.SRGBColorSpace;
  boardTex.anisotropy = 8;
  const screen = own(new T.MeshBasicMaterial({ map: boardTex, toneMapped: false })),
    frame = own(coat({ color: "#101318", roughness: 0.5, metalness: 0.4 }));
  for (const end of [far, near]) {
    mesh(own, block(6.4, 1.75, 0.3, 0.05), frame, 0, 5.3, 0.2, end, false, false);
    mesh(own, new T.PlaneGeometry(6.1, 1.52), screen, 0, 5.3, 0.36, end, false, false);
  }
  let shown = "";
  const score: Hall["score"] = (names, points, games) => {
    const key = `${names.join("|")}:${points.join(",")}:${games.join(",")}`;
    if (key === shown) return;
    shown = key;
    scorePicture(board.c, names, points, games);
    boardTex.needsUpdate = true;
  };
  score(["나", "컴퓨터"], [0, 0], [0, 0]);
  // The roof: a ribbed steel deck; under it steel trusses across the hall, and rows of high-bay lamps between them.
  const deck = own(coat({ map: deckPicture(own), roughness: 0.7, metalness: 0.3 })),
    truss = own(coat({ color: "#6b7480", roughness: 0.45, metalness: 0.6 })),
    housing = own(coat({ color: "#3a3f47", roughness: 0.35, metalness: 0.7 })),
    lamp = own(new T.MeshBasicMaterial({ color: "#fff8e8", toneMapped: false }));
  mesh(own, new T.PlaneGeometry(32, 40).rotateX(Math.PI / 2), deck, 1.5, 12.2, 0, group, false, false);
  {
    // Each truss: top and bottom chords and the diagonals between, all merged into one shape (one draw for all).
    const parts: T.BufferGeometry[] = [],
      chord = new T.BoxGeometry(30, 0.16, 0.16),
      post = new T.BoxGeometry(0.07, 1.1, 0.07),
      span = 1.5,
      diag = new T.BoxGeometry(0.06, Math.hypot(span, 1.1), 0.06),
      tilt = Math.atan2(span, 1.1);
    for (let r = -2; r <= 2; r++) {
      const z = r * 7;
      parts.push(placed(chord, 1.5, 11.95, z), placed(chord, 1.5, 10.85, z));
      for (let x = -13.5; x <= 16.5; x += span) {
        parts.push(placed(post, x, 11.4, z));
        if (x + span <= 16.5) parts.push(placed(diag, x + span / 2, 11.4, z, 0, 0, (Math.round((x + 13.5) / span) % 2 ? 1 : -1) * tilt));
      }
    }
    // The purlins along the hall between the trusses.
    const purlin = new T.BoxGeometry(0.1, 0.12, 28);
    for (let x = -12; x <= 15; x += 3) parts.push(placed(purlin, x, 12.05, 0));
    const merged = mergeGeometries(parts);
    for (const p of [chord, post, diag, purlin, ...parts]) p.dispose();
    mesh(own, merged, truss, 0, 0, 0, group, false, false);
  }
  {
    const shell = new T.CylinderGeometry(0.34, 0.24, 0.32, 20, 1, true),
      top = new T.CylinderGeometry(0.12, 0.2, 0.18, 14),
      parts: T.BufferGeometry[] = [],
      lenses: T.BufferGeometry[] = [],
      lens = new T.CircleGeometry(0.32, 20).rotateX(Math.PI / 2),
      spots: [number, number][] = [];
    for (let r = -2; r < 2; r++)
      for (let k = -3; k <= 3; k++) {
        const x = k * 3.8 + 1.5 + (random() - 0.5) * 0.1,
          z = r * 7 + 3.5;
        parts.push(placed(shell, x, 10.4, z), placed(top, x, 10.65, z));
        lenses.push(placed(lens, x, 10.25, z));
        spots.push([x, z]);
      }
    const hood = mergeGeometries(parts),
      glow = mergeGeometries(lenses);
    for (const p of [shell, top, lens, ...parts, ...lenses]) p.dispose();
    const hoods = mesh(own, hood, own(housing.clone()), 0, 0, 0, group, false, false);
    (hoods.material as T.MeshStandardMaterial).side = T.DoubleSide;
    mesh(own, glow, lamp, 0, 0, 0, group, false, false);
    if (rich) {
      // A soft halo round each lamp, as the eye sees a bright light under a roof.
      const haloMat = own(new T.SpriteMaterial({ map: glowPicture(own, "#fff4dc"), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.55, toneMapped: false }));
      for (const [x, z] of spots) {
        const s = new T.Sprite(haloMat);
        s.position.set(x, 10.15, z);
        s.scale.setScalar(1.6);
        group.add(s);
      }
    }
  }
  // Nothing of the hall moves: its parts that share a paint are drawn as one.
  compactStill(group, own);
  return {
    group,
    tick(t: number) {
      boardMaps.forEach((map, k) => (map.offset.x = (k * 0.29 + t * 0.012) % 1));
    },
    score,
  };
}
