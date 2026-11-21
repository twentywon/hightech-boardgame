import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, glossy } from "../../engine/scene-utils";
import { BALL_R, DECK_END, GUTTER, HEAD, KICK, LANE_HALF, PIN_H, PIT_END, SPOTS } from "./sim";
import { zOf } from "./layout";

/**
 * A bowling alley of our own, all modelled and painted here: five lanes of glossy maple boards with their arrows and
 * dots, gutters and cappings between them, a pin deck and a dark pit behind each, the masking unit over the pins
 * printed with a mural of our own, ceiling strips in several colours, lounges along both side walls, the ball
 * return beside the approach. The lane played is the middle one; the others have their own racks.
 */
type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** From one lane's middle to the next: the lane, two gutters and the capping between them. */
export const CAPPING = 0.25,
  PITCH = 2 * KICK + CAPPING;
/** The masking unit over the pins: where its face hangs, how low it comes and how high it reaches. */
export const MASK = { z: zOf(HEAD - 0.95), bottom: 0.78, top: 1.95 };
/** The ceiling. */
export const ROOF = 3.6;
/** The ball return's hood, at the right of the approach, on the capping. */
export const RETURN = { x: KICK + CAPPING / 2, z: 0.5 };
/** A tiny fixed sequence, so that painted pictures and scattered things come out the same every time. */
export function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const font = (weight: number, size: number) => `${weight} ${size}px "Inter", "Noto Sans KR", Arial, sans-serif`;
function texture(canvas: HTMLCanvasElement, repeat?: [number, number]) {
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 2;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
/** A texture tiled `across` times side by side. */
function repeated(t: T.Texture, across: number) {
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(across, 1);
  return t;
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}
/**
 * Maple boards across a lane, `boards` of them, four metres of it in the picture (it is tiled down the lane): each
 * board its own shade, with fine grain along it and the joints between them.
 */
function boardTexture(boards: number, tone: [number, number, number], seed: number) {
  const { c, ctx } = canvas(1024, 2048),
    random = sequence(seed),
    w = 1024 / boards;
  for (let k = 0; k < boards; k++) {
    const shade = 0.9 + random() * 0.16;
    ctx.fillStyle = `rgb(${tone[0] * shade}, ${tone[1] * shade}, ${tone[2] * shade})`;
    ctx.fillRect(k * w, 0, w + 1, 2048);
    // The grain: long fine streaks, a little darker or lighter.
    for (let g = 0; g < 26; g++) {
      ctx.fillStyle = random() < 0.5 ? `rgba(120, 70, 30, ${0.04 + random() * 0.07})` : `rgba(255, 240, 210, ${0.04 + random() * 0.06})`;
      const x = k * w + random() * w,
        y = random() * 2048;
      ctx.fillRect(x, y, 0.8 + random() * 1.6, 200 + random() * 900);
    }
    // Board ends, staggered.
    const end = random() * 2048;
    ctx.fillStyle = "rgba(90, 55, 25, 0.35)";
    ctx.fillRect(k * w, end, w, 2);
  }
  ctx.fillStyle = "rgba(80, 45, 20, 0.45)";
  for (let k = 1; k < boards; k++) ctx.fillRect(k * w - 0.6, 0, 1.2, 2048);
  return c;
}
/** The pin deck: a paler, smoother surface with the ten spots marked. */
function deckTexture() {
  const W = 512,
    H = 640,
    { c, ctx } = canvas(W, H),
    across = (x: number) => ((x + LANE_HALF) / (2 * LANE_HALF)) * W,
    // From 0.3 before the head pin to the end of the deck.
    down = (d: number) => H - ((d - (HEAD - 0.3)) / (DECK_END - (HEAD - 0.3))) * H;
  ctx.drawImage(boardTexture(39, [236, 214, 172], 77), 0, 0, 1024, 2048, 0, 0, W, H * 2);
  ctx.fillStyle = "rgba(255, 250, 240, 0.35)";
  ctx.fillRect(0, 0, W, H);
  for (const spot of SPOTS) {
    ctx.fillStyle = "rgba(60, 40, 30, 0.55)";
    ctx.beginPath();
    ctx.arc(across(spot.x), down(spot.d), 9, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
/** A swirl of reactive resin for a ball, painted over a sphere's map: two colours wound together, with a pearl in it. */
export function ballSkin(base: string, swirl: string, seed: number) {
  const W = 512,
    H = 256,
    { c, ctx } = canvas(W, H),
    image = ctx.createImageData(W, H),
    a = new T.Color(base),
    b = new T.Color(swirl),
    random = sequence(seed),
    k1 = 2 + random() * 2,
    k2 = 3 + random() * 3,
    p1 = random() * 6,
    p2 = random() * 6;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x / W) * Math.PI * 2,
        v = (y / H) * Math.PI,
        warp = Math.sin(u * k1 + Math.sin(v * k2 + p1) * 2.4 + p2) + 0.6 * Math.sin(v * 5 + Math.cos(u * 3 + p1) * 1.7),
        t = 0.5 + 0.5 * Math.tanh(warp * 2.2),
        pearl = 0.06 * Math.sin(u * 23 + v * 17) * Math.sin(u * 11 - v * 29),
        i = (y * W + x) * 4;
      image.data[i] = Math.min(255, (a.r + (b.r - a.r) * t + pearl) * 255);
      image.data[i + 1] = Math.min(255, (a.g + (b.g - a.g) * t + pearl) * 255);
      image.data[i + 2] = Math.min(255, (a.b + (b.b - a.b) * t + pearl) * 255);
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  const map = texture(c);
  map.colorSpace = T.LinearSRGBColorSpace;
  return map;
}
/** A finger hole: a dark hollow shading to black, with a lighter lip. */
function holeTexture() {
  const { c, ctx } = canvas(64, 64),
    g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "#020202");
  g.addColorStop(0.62, "#0c0c0e");
  g.addColorStop(0.8, "#2a2a30");
  g.addColorStop(0.92, "rgba(200, 200, 210, 0.55)");
  g.addColorStop(1, "rgba(200, 200, 210, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return texture(c);
}
/** A bowling ball: a glossy swirled sphere with a thumb hole and two finger holes, as children so that they roll with it. */
export function bowlingBall(keep: Keep, skin: T.Texture, holes: { geometry: T.BufferGeometry; material: T.Material }, sphere: T.BufferGeometry) {
  const ball = new T.Mesh(sphere, keep(glossy({ map: skin, roughness: 0.18, metalness: 0.05 }, 1)));
  ball.castShadow = ball.receiveShadow = true;
  // Two fingers side by side, the thumb a span below them.
  for (const [lat, lon, size] of [
    [0.62, -0.17, 1],
    [0.62, 0.17, 1],
    [0.05, 0, 1.18],
  ]) {
    const hole = new T.Mesh(holes.geometry, holes.material),
      normal = new T.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
    hole.position.copy(normal.clone().multiplyScalar(BALL_R + 0.0008));
    hole.lookAt(normal.clone().multiplyScalar(2));
    hole.scale.setScalar(size);
    hole.renderOrder = 1;
    ball.add(hole);
  }
  return ball;
}
export function holeParts(keep: Keep) {
  return {
    geometry: keep(new T.CircleGeometry(0.0125, 24)),
    material: keep(new T.MeshStandardMaterial({ map: keep(holeTexture()), transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })),
  };
}
/** The profile of a pin from its foot to its crown: the belly, the slim neck, the round head (real proportions). */
const PROFILE: [number, number][] = [
  [0, 0],
  [0.0258, 0],
  [0.031, 0.008],
  [0.04, 0.025],
  [0.05, 0.05],
  [0.057, 0.08],
  [0.0605, 0.114],
  [0.059, 0.145],
  [0.053, 0.175],
  [0.042, 0.2],
  [0.03, 0.222],
  [0.0232, 0.24],
  [0.0228, 0.252],
  [0.025, 0.27],
  [0.0295, 0.295],
  [0.0322, 0.322],
  [0.0318, 0.345],
  [0.0275, 0.362],
  [0.018, 0.375],
  [0, PIN_H],
];
/** The neck stripes, from and to which height. */
const STRIPES: [number, number][] = [
  [0.244, 0.254],
  [0.262, 0.272],
];
/**
 * A pin: a turned white body with two red stripes round its neck. The stripes are painted on a strip of canvas laid
 * along the profile, so they sit exactly at their heights.
 */
export function pinParts(keep: Keep) {
  const curve = new T.SplineCurve(PROFILE.map(([r, y]) => new T.Vector2(r, y))),
    points = curve.getSpacedPoints(64);
  points[0].set(0, 0);
  points[points.length - 1].set(0, PIN_H);
  const geometry = keep(new T.LatheGeometry(points, 36));
  // Where each point of the profile lies, from 0 at the foot to 1 at the crown, as the lathe lays its picture.
  const { c, ctx } = canvas(8, 1024),
    heights = points.map((p) => p.y),
    at = (y: number) => {
      for (let i = 1; i < heights.length; i++)
        if (heights[i] >= y) {
          const f = (y - heights[i - 1]) / Math.max(1e-9, heights[i] - heights[i - 1]);
          return (i - 1 + f) / (heights.length - 1);
        }
      return 1;
    };
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, 8, 1024);
  ctx.fillStyle = "#d0202a";
  for (const [from, to] of STRIPES) {
    const a = (1 - at(to)) * 1024,
      b = (1 - at(from)) * 1024;
    ctx.fillRect(0, a, 8, b - a);
  }
  const map = keep(texture(c));
  const material = keep(glossy({ map, roughness: 0.22, metalness: 0 }, 0.8));
  return { geometry, material };
}
/** Something glowing: lit from within, so that the room's lights do not shade it. */
const glow = (keep: Keep, color: string, intensity = 1.6) => keep(new T.MeshStandardMaterial({ color: "#111111", emissive: color, emissiveIntensity: intensity, roughness: 0.6 }));
/** The masking unit's mural: a night of our own over all five lanes, with planets, rings, stars and the lane numbers. */
function muralTexture(lanes: number[]) {
  const W = 4096,
    H = 520,
    { c, ctx } = canvas(W, H),
    random = sequence(41),
    sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#1b0b46");
  sky.addColorStop(0.55, "#3a0f6e");
  sky.addColorStop(1, "#0e2b6e");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Stars.
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + random() * 0.7})`;
    const r = random() < 0.95 ? 1 + random() * 1.6 : 2.5 + random() * 2;
    ctx.beginPath();
    ctx.arc(random() * W, random() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Neon sweeps across it, magenta and cyan.
  ctx.lineCap = "round";
  for (const [colour, phase, y0] of [
    ["#ff3fb4", 0, 0.7],
    ["#33e6ff", 1.7, 0.82],
    ["#ffd23f", 3.1, 0.6],
  ] as [string, number, number][]) {
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const y = H * y0 + Math.sin(x / 260 + phase) * H * 0.08 + Math.sin(x / 97 + phase * 2) * H * 0.02;
      if (x) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // Planets with rings, one over every lane.
  const lane = W / lanes.length;
  lanes.forEach((number, k) => {
    const cx = lane * (k + 0.5),
      hue = ["#ff8a3d", "#3dd6ff", "#c86bff", "#5dff9b", "#ff5d7a"][k % 5],
      px = cx + (k % 2 ? 0.28 : -0.3) * lane,
      py = H * (0.3 + (k % 3) * 0.08),
      r = 46 + (k % 3) * 12,
      body = ctx.createRadialGradient(px - r * 0.4, py - r * 0.4, r * 0.1, px, py, r);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.25, hue);
    body.addColorStop(1, "#140726");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 1.7, r * 0.42, -0.35, 0, Math.PI * 2);
    ctx.stroke();
    // The lane's number in a lit disc at the top.
    ctx.fillStyle = "rgba(10, 4, 30, 0.75)";
    ctx.beginPath();
    ctx.arc(cx, 70, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = font(900, 64);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), cx, 74);
  });
  // The house's name in the middle, over the lane played.
  ctx.font = `italic ${font(900, 92)}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#12052e";
  ctx.strokeText("STAR LANES", W / 2, H * 0.55);
  const letters = ctx.createLinearGradient(0, H * 0.4, 0, H * 0.7);
  letters.addColorStop(0, "#fff4a8");
  letters.addColorStop(1, "#ff7ad9");
  ctx.fillStyle = letters;
  ctx.shadowColor = "#ff3fb4";
  ctx.shadowBlur = 24;
  ctx.fillText("STAR LANES", W / 2, H * 0.55);
  ctx.shadowBlur = 0;
  return texture(c);
}
/** The walls: deep blue with tall neon pins and balls, stars, and a dado of coloured panels. */
function wallTexture(seed: number) {
  const W = 2048,
    H = 512,
    { c, ctx } = canvas(W, H),
    random = sequence(seed),
    sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#130a33");
  sky.addColorStop(1, "#24105a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 400; k++) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.15 + random() * 0.5})`;
    ctx.fillRect(random() * W, random() * H * 0.7, 2, 2);
  }
  ctx.lineWidth = 8;
  ctx.lineJoin = ctx.lineCap = "round";
  for (let k = 0; k < 6; k++) {
    const x = 160 + k * 340,
      colour = ["#ff3fb4", "#33e6ff", "#ffd23f", "#7dff6a", "#ff8a3d", "#b46bff"][k];
    ctx.strokeStyle = colour;
    ctx.shadowColor = colour;
    ctx.shadowBlur = 20;
    if (k % 2) {
      // A pin's outline.
      ctx.beginPath();
      ctx.moveTo(x - 18, 400);
      ctx.bezierCurveTo(x - 60, 300, x - 30, 230, x - 12, 200);
      ctx.bezierCurveTo(x - 30, 160, x - 26, 110, x, 108);
      ctx.bezierCurveTo(x + 26, 110, x + 30, 160, x + 12, 200);
      ctx.bezierCurveTo(x + 30, 230, x + 60, 300, x + 18, 400);
      ctx.closePath();
      ctx.stroke();
    } else {
      // A ball with its holes.
      ctx.beginPath();
      ctx.arc(x, 300, 92, 0, Math.PI * 2);
      ctx.stroke();
      for (const [dx, dy] of [[-22, -36], [22, -36], [0, 10]]) {
        ctx.beginPath();
        ctx.arc(x + dx, 300 + dy, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.shadowBlur = 0;
  const panels = ["#ff3fb4", "#2bd0ff", "#ffd23f", "#9b5bff"];
  for (let k = 0; k < 16; k++) {
    ctx.fillStyle = panels[k % 4];
    ctx.globalAlpha = 0.55;
    ctx.fillRect(k * 128, H - 50, 120, 50);
  }
  ctx.globalAlpha = 1;
  return texture(c);
}
export interface Alley {
  /** The coloured strips of the ceiling and the lights round the masking unit, which the view makes pulse. */
  neon: T.MeshStandardMaterial[];
  /** The strip light under the masking unit's edge, over the pins of the lane played. */
  deckLight: T.MeshStandardMaterial;
}
/**
 * Builds the alley round the lane played (x = 0); materials and geometry are kept by `keep`. Everything that stands
 * still is gathered into one mesh for each material (a few dozen draws instead of hundreds, which matters where the
 * processor draws the picture). The view adds its own ball, pins, pinsetter, monitor and lights.
 */
export function buildAlley(scene: T.Scene, keep: Keep): Alley {
  const batches = new Map<T.Material, { cast: T.BufferGeometry[]; still: T.BufferGeometry[] }>();
  /** Lays a piece of the room: its geometry moved into place and gathered with the others of its material. */
  const add = (geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, shadow = true) => {
    geometry.translate(x, y, z);
    if (!batches.has(material)) batches.set(material, { cast: [], still: [] });
    batches.get(material)![shadow ? "cast" : "still"].push(geometry);
  };
  /** A piece with a material on each side, laid on its own. */
  const alone = (geometry: T.BufferGeometry, materials: T.Material[], x: number, y: number, z: number) => {
    const mesh = new T.Mesh(keep(geometry), materials);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  const coat = capable(),
    laneLength = HEAD - 0.3,
    lanes = [-2, -1, 0, 1, 2],
    numbers = lanes.map((k) => 7 + k),
    laneMap = keep(texture(boardTexture(39, [222, 178, 118], 5), [1, laneLength / 4])),
    lane = keep(glossy({ map: laneMap, roughness: coat ? 0.32 : 0.4, metalness: 0 }, 1)),
    approachMap = keep(texture(boardTexture(39, [232, 198, 146], 9), [1, 4.8 / 4])),
    approach = keep(glossy({ map: approachMap, roughness: 0.45 }, 0.6)),
    deck = keep(glossy({ map: keep(deckTexture()), roughness: 0.28 }, 1)),
    gutter = keep(new T.MeshStandardMaterial({ color: "#2b2d35", roughness: 0.35, metalness: 0.55, side: T.DoubleSide })),
    capping = keep(new T.MeshStandardMaterial({ color: "#1d1f2a", roughness: 0.4, metalness: 0.3 })),
    trim = keep(new T.MeshStandardMaterial({ color: "#b8bcc6", roughness: 0.25, metalness: 0.85 })),
    black = keep(new T.MeshStandardMaterial({ color: "#050507", roughness: 0.95 })),
    foul = keep(new T.MeshBasicMaterial({ color: "#16161a" })),
    ink = keep(new T.MeshBasicMaterial({ color: "#3a2416", transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })),
    bands = ["#ff3fb4", "#33e6ff"].map((colour) => glow(keep, colour, 1.1)),
    neon: T.MeshStandardMaterial[] = [];
  // The lanes are seen at a slant from far off: their boards stay sharp with more filtering.
  laneMap.anisotropy = approachMap.anisotropy = 4;
  const flat = (w: number, d: number) => new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    arrow = new T.Shape();
  arrow.moveTo(0, 0.08);
  arrow.lineTo(0.013, -0.07);
  arrow.lineTo(-0.013, -0.07);
  arrow.closePath();
  for (const k of lanes) {
    const x0 = k * PITCH;
    // The lane, its pin deck, and the approach behind the foul line.
    add(flat(LANE_HALF * 2, laneLength), lane, x0, 0, zOf(laneLength / 2), false);
    add(flat(LANE_HALF * 2, DECK_END - (HEAD - 0.3)), deck, x0, 0, zOf((DECK_END + HEAD - 0.3) / 2), false);
    add(flat(PITCH, 4.8), approach, x0, 0, 2.4, false);
    // The foul line, and the marks a bowler aims by: dots at seven feet, arrows from thirteen to sixteen, range finders further on.
    add(flat(LANE_HALF * 2 + GUTTER * 2, 0.012), foul, x0, 0.001, 0, false);
    const board = (n: number) => x0 + LANE_HALF - (n - 0.5) * ((LANE_HALF * 2) / 39);
    for (const n of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) add(new T.CircleGeometry(0.009, 12).rotateX(-Math.PI / 2), ink, board(n), 0.0015, zOf(2.134), false);
    for (const [n, feet] of [
      [5, 13],
      [10, 14],
      [15, 15],
      [20, 16],
      [25, 15],
      [30, 14],
      [35, 13],
    ])
      add(new T.ShapeGeometry(arrow).rotateX(-Math.PI / 2), ink, board(n), 0.0015, zOf(feet * 0.3048), false);
    for (const n of [10, 30]) add(flat(0.012, 0.9), ink, board(n), 0.0015, zOf(12.6), false);
    // Approach dots, at twelve and fifteen feet behind the foul line.
    for (const back of [3.66, 4.57]) for (const n of [5, 10, 15, 20, 25, 30, 35]) add(new T.CircleGeometry(0.01, 12).rotateX(-Math.PI / 2), ink, board(n), 0.0015, back, false);
    // The gutters: shallow round channels either side, running into the pit.
    for (const side of [-1, 1])
      add(new T.CylinderGeometry(GUTTER / 2, GUTTER / 2, DECK_END, 20, 1, true, -Math.PI / 2, Math.PI).scale(1, 1, 0.42).rotateX(Math.PI / 2), gutter, x0 + side * (LANE_HALF + GUTTER / 2), 0, zOf(DECK_END / 2), false);
    // The capping between this lane and the next, with a bright metal edge.
    if (k < 2) {
      const cx = x0 + KICK + CAPPING / 2;
      add(block(CAPPING, 0.06, DECK_END + 0.1, 0.02), capping, cx, 0.02, zOf(DECK_END / 2 - 0.05), false);
      for (const side of [-1, 1]) add(new T.BoxGeometry(0.012, 0.012, DECK_END), trim, cx + side * (CAPPING / 2 - 0.006), 0.055, zOf(DECK_END / 2), false);
    }
    // The pit: a dark hollow behind the deck, its floor and the hanging curtain at its back.
    add(flat(PITCH, PIT_END - DECK_END), black, x0, -0.32, zOf((DECK_END + PIT_END) / 2), false);
    add(new T.PlaneGeometry(PITCH, MASK.bottom + 0.4), black, x0, (MASK.bottom - 0.4) / 2, zOf(PIT_END), false);
    // The kickbacks, the walls either side of the deck, dark with a coloured band.
    for (const side of [-1, 1]) {
      const kx = x0 + side * (KICK + 0.04);
      add(block(0.08, MASK.bottom + 0.1, PIT_END - (HEAD - 0.75), 0.02), capping, kx, (MASK.bottom + 0.1) / 2 - 0.05, zOf((PIT_END + HEAD - 0.75) / 2));
      add(new T.BoxGeometry(0.085, 0.05, PIT_END - (HEAD - 0.75)), bands[(k + 2 + (side > 0 ? 1 : 0)) % 2], kx, MASK.bottom - 0.12, zOf((PIT_END + HEAD - 0.75) / 2), false);
    }
  }
  // The masking unit over all the decks: its printed face, its underside, and the strip of light along its edge.
  const span = PITCH * lanes.length + 0.4,
    face = keep(new T.MeshStandardMaterial({ map: keep(muralTexture(numbers)), emissive: "#ffffff", roughness: 0.6 }));
  face.emissiveMap = face.map;
  face.emissiveIntensity = 0.55;
  add(new T.PlaneGeometry(span, MASK.top - MASK.bottom), face, 0, (MASK.top + MASK.bottom) / 2, MASK.z + 0.001, false);
  alone(new T.BoxGeometry(span, MASK.top - MASK.bottom, PIT_END - (HEAD - 0.95)), [capping, capping, capping, black, capping, capping], 0, (MASK.top + MASK.bottom) / 2, zOf((PIT_END + HEAD - 0.95) / 2) - 0.001);
  const deckLight = glow(keep, "#ffe6c0", 1.1);
  add(new T.BoxGeometry(span, 0.02, 0.05), deckLight, 0, MASK.bottom + 0.005, MASK.z + 0.03, false);
  const wall = keep(new T.MeshStandardMaterial({ map: keep(repeated(wallTexture(3), 4)), roughness: 0.8 }));
  // The side walls with their murals, and a lounge along each: a raised floor, booths and little tables.
  const outer = PITCH * 2 + KICK + 1.9,
    sideMural = keep(new T.MeshStandardMaterial({ map: keep(repeated(wallTexture(17), 6)), roughness: 0.8 })),
    carpet = keep(new T.MeshStandardMaterial({ map: keep(carpetTexture()), roughness: 0.95 })),
    seat = ["#d8263d", "#1f8fe0"].map((color) => keep(glossy({ color, roughness: 0.42 }, 0.4))),
    tabletop = keep(new T.MeshStandardMaterial({ color: "#e9e2d2", roughness: 0.35 })),
    steel = keep(new T.MeshStandardMaterial({ color: "#8d939c", roughness: 0.3, metalness: 0.8 }));
  for (const side of [-1, 1]) {
    add(new T.PlaneGeometry(PIT_END + 8, ROOF).rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2), sideMural, side * (outer + 1.7), ROOF / 2, zOf(PIT_END / 2 - 4), false);
    // The lounge's floor, a step up from the lanes, carpeted.
    add(block(1.9, 0.2, PIT_END + 6, 0.03), carpet, side * (outer + 0.75), 0.1, zOf(PIT_END / 2 - 3), false);
    // Booths facing the lanes, and a table before each.
    for (let k = 0; k < 6; k++) {
      const z = zOf(1 + k * 3),
        bx = side * (outer + 1.25),
        paint = seat[k % 2];
      add(block(0.55, 0.42, 1.3, 0.08), paint, bx, 0.41, z);
      add(block(0.18, 0.75, 1.3, 0.07), paint, bx + side * 0.27, 0.6, z);
      add(new T.CylinderGeometry(0.3, 0.3, 0.04, 28), tabletop, side * (outer + 0.5), 0.72, z);
      add(new T.CylinderGeometry(0.03, 0.03, 0.52, 10), steel, side * (outer + 0.5), 0.46, z);
    }
  }
  // The floor beyond the lanes on either side, and behind the approaches.
  const edge = PITCH * 2 + KICK,
    far = outer + 2;
  for (const side of [-1, 1]) add(flat(far - edge, 40), carpet, (side * (edge + far)) / 2, -0.005, zOf(10), false);
  add(flat(far * 2, 6), carpet, 0, -0.005, 7.8, false);
  // The end wall behind the pits, from the floor to the ceiling, beyond the masking unit's ends too.
  add(new T.PlaneGeometry(far * 2, ROOF), wall, 0, ROOF / 2, zOf(PIT_END) - 0.05, false);
  // The ceiling, and strips of coloured light across it.
  add(new T.PlaneGeometry(outer * 2 + 4, 40).rotateX(Math.PI / 2), keep(new T.MeshStandardMaterial({ color: "#0d0b1e", roughness: 0.9 })), 0, ROOF, zOf(10), false);
  const colours = ["#ff3fb4", "#33e6ff", "#ffd23f", "#b46bff"];
  for (const colour of colours) neon.push(glow(keep, colour, 1.8));
  for (let k = 0; k < 8; k++) add(new T.BoxGeometry(outer * 2, 0.05, 0.08), neon[k % neon.length], 0, ROOF - 0.03, zOf(-1 + k * 2.6), false);
  // Lamps along each lane's capping, under the ceiling.
  const lamp = glow(keep, "#fff6e0", 1.4);
  for (const k of [-2, -1, 0, 1]) for (let z = 0; z < 4; z++) add(new T.BoxGeometry(0.12, 0.04, 1.2), lamp, (k + 0.5) * PITCH, ROOF - 0.04, zOf(2 + z * 4), false);
  // The racks of the other lanes, as their pinsetters left them: an instanced set of pins.
  const pin = pinParts(keep),
    others = new T.InstancedMesh(pin.geometry, pin.material, 40),
    m = new T.Matrix4(),
    random = sequence(13);
  let n = 0;
  for (const k of lanes)
    if (k)
      for (const spot of SPOTS) {
        const standing = random() < (k === -1 ? 0.35 : 1);
        if (standing) m.makeTranslation(k * PITCH + spot.x, 0, zOf(spot.d));
        else m.makeRotationZ(Math.PI / 2 - 0.08).setPosition(k * PITCH + spot.x + 0.2, 0.05, zOf(spot.d + random() * 0.3));
        others.setMatrixAt(n++, m);
      }
  others.count = n;
  others.castShadow = others.receiveShadow = true;
  scene.add(others);
  // The ball return beside the approach: a rounded hood on the capping, its mouth, its rails.
  const hoodPaint = keep(glossy({ color: "#2a2f8f", roughness: 0.3, metalness: 0.2 }, 0.8));
  add(new T.SphereGeometry(0.24, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.85, 1.1), hoodPaint, RETURN.x, 0.05, RETURN.z);
  add(new T.CircleGeometry(0.115, 24), black, RETURN.x, 0.13, RETURN.z + 0.25, false);
  add(new T.TorusGeometry(0.12, 0.014, 8, 32), trim, RETURN.x, 0.13, RETURN.z + 0.255);
  for (const side of [-1, 1]) add(new T.CylinderGeometry(0.014, 0.014, 1.6, 10).rotateX(Math.PI / 2), trim, RETURN.x + side * 0.07, 0.08, RETURN.z + 1.15, false);
  add(block(0.3, 0.06, 1.6, 0.02), capping, RETURN.x, 0.03, RETURN.z + 1.15);
  // Everything gathered, one mesh for each material (and for whether it casts a shadow).
  for (const [material, sets] of batches)
    for (const [list, cast] of [
      [sets.cast, true],
      [sets.still, false],
    ] as const) {
      if (!list.length) continue;
      const merged = keep(mergeGeometries(list, false)!);
      for (const g of list) g.dispose();
      const mesh = new T.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  return { neon, deckLight };
}
/** The carpet of the lounges and round the lanes: deep blue with little coloured shapes, as such places have. */
function carpetTexture() {
  const { c, ctx } = canvas(512, 512),
    random = sequence(29);
  ctx.fillStyle = "#151338";
  ctx.fillRect(0, 0, 512, 512);
  const colours = ["#ff3fb4", "#33e6ff", "#ffd23f", "#7dff6a"];
  for (let k = 0; k < 160; k++) {
    ctx.strokeStyle = colours[k % 4];
    ctx.lineWidth = 3;
    const x = random() * 512,
      y = random() * 512,
      r = 6 + random() * 10;
    ctx.beginPath();
    if (k % 3 === 0) ctx.arc(x, y, r, 0, Math.PI * 2);
    else if (k % 3 === 1) {
      ctx.moveTo(x - r, y + r);
      ctx.lineTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.closePath();
    } else {
      ctx.moveTo(x - r, y);
      ctx.quadraticCurveTo(x, y - r, x + r, y);
    }
    ctx.stroke();
  }
  return texture(c, [6, 6]);
}
