import * as T from "three";
import { smooth } from "../../engine/lifelike";
import { canvas, painted, puff, stream, normalFrom, texture, type Own } from "../goldraid/paint";
import { compactStill } from "../badminton/merge";
import { bakeAll } from "./bake";
import { grained } from "../../engine/grain";
import { Grove } from "../../engine/foliage";
import { BASE_X, SLOTS, turretAt } from "./sim";
import type { Kit } from "./models";
import { bakedLand } from "./baked";

/**
 * Where 시대 전쟁 is fought, all painted in code. A wide plain under a big sky, a worn dirt lane between the two bases
 * (ruts, wheel marks, stones, puddles; tufts of grass along its edges; craters left where shells and bombs fell, which
 * fade only slowly), hills, woods and mountains behind.
 *
 * The world grows older with the war (`Field.age`, the further era of the two sides): each era has its own light and
 * sky (a golden morning in the stone age, a clear noon, a hazy afternoon of powder smoke, an overcast evening with a
 * red glow in the modern one) and its own things in the distance (a smoking volcano, standing stones and hide tents;
 * a castle on a hill, a windmill and cottages; a church steeple, a village and columns of smoke; a city's towers with
 * lit windows, pylons and a radio mast blinking red).
 *
 * Each base is built as its era builds it (a cave camp behind a stockade with its fire, totems and a hide tent; a
 * stone castle with a gate, towers and banners; a brick star fort with cannon in embrasures and a powder store; a
 * concrete bunker with sandbags, wire, floodlights and a radar), and is worn down as it is hurt (`Base.wear`): scorched
 * and smoking, then broken (parts fallen, a tower's top gone) and burning, then ablaze. Its turrets stand on a mast in
 * front of it. Bases are built for side 0 (facing +x) and mirrored for side 1; their still parts are baked together.
 */
export interface Base {
  group: T.Group;
  /** Shows how hurt it is (0 whole … 1 fallen): returns where fires burn (in the lane's own space). */
  wear(hurt: number): T.Vector3[];
}
export interface Atmosphere {
  sky: T.Texture;
  fog: T.Color;
  hemiSky: T.Color;
  hemiGround: T.Color;
  hemi: number;
  sun: T.Color;
  sunPower: number;
  /** Where the sun stands (from the eye's point). */
  sunAt: T.Vector3;
}
export interface Field {
  base(side: number, era: number): Base;
  /** A turret of an era, facing +x. */
  turret(era: number): T.Group;
  clouds: T.Sprite[];
  /** The world's age: the era whose light and distance are shown. */
  age(era: number): Atmosphere;
  /** A crater (or a stone lying) left on the lane at x. */
  crater(x: number, size: number, rock: boolean): void;
  /** Moves what moves by itself (sails, smoke, blinking lights, craters fading). */
  tick(t: number, dt: number): void;
}
const rnd = stream(77);
/** How far in front of a base (toward the eye) its turrets stand. */
export const MAST_Z = 1.15;
function grassTexture(own: Own, rich: boolean) {
  // (Half the size where the processor draws: a smaller picture is read faster.)
  const n = rich ? 512 : 256;
  return painted(
    own,
    n,
    n,
    (ctx) => {
      ctx.fillStyle = "#6c9a3c";
      ctx.fillRect(0, 0, n, n);
      // Patches of lighter and darker grass, then blades, then a few flowers.
      for (let k = 0; k < (rich ? 60 : 16); k++) {
        const x = rnd() * n,
          y = rnd() * n,
          r = 20 + rnd() * 60,
          g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `hsla(${75 + rnd() * 30}, 45%, ${30 + rnd() * 18}%, 0.35)`);
        g.addColorStop(1, "hsla(80, 40%, 35%, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let k = 0; k < (rich ? 9000 : 2600); k++) {
        const x = rnd() * n,
          y = rnd() * n,
          l = 26 + rnd() * 34;
        ctx.strokeStyle = `hsla(${78 + rnd() * 32}, ${40 + rnd() * 25}%, ${l}%, 0.6)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 5);
        ctx.stroke();
      }
      for (let k = 0; k < (rich ? 160 : 40); k++) {
        ctx.fillStyle = ["#f4e27a", "#ffffff", "#e7a6d8", "#f2b04a"][Math.floor(rnd() * 4)];
        ctx.fillRect(rnd() * n, rnd() * n, 2, 2);
      }
    },
    rich ? [16, 8] : [18, 9],
  );
}
/** The lane: worn earth, two ruts, wheel marks, stones, a few puddles, grass at its edges (and its height, for relief). */
function laneCanvases(rich: boolean) {
  const w = rich ? 1024 : 512,
    h = 128,
    r = stream(9),
    marks: { x: number; y: number; w: number; h: number; kind: number }[] = [];
  for (let k = 0; k < 900; k++) marks.push({ x: r() * w, y: 8 + r() * (h - 16), w: 1 + r() * 4, h: 1 + r() * 3, kind: r() < 0.12 ? 1 : 0 });
  const puddles = Array.from({ length: 6 }, () => ({ x: r() * w, y: 30 + r() * 68, rx: 12 + r() * 22, ry: 4 + r() * 6 }));
  const paint = (ctx: CanvasRenderingContext2D, height: boolean) => {
    ctx.fillStyle = height ? "#808080" : "#9a7650";
    ctx.fillRect(0, 0, w, h);
    if (!height)
      for (let k = 0; k < 7000; k++) {
        ctx.fillStyle = `hsla(${26 + r() * 10}, ${22 + r() * 18}%, ${30 + r() * 26}%, 0.45)`;
        ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
      }
    // Ruts worn along the lane, and tyre or wheel marks in them.
    for (const y of [40, 88]) {
      const g = ctx.createLinearGradient(0, y - 9, 0, y + 9);
      g.addColorStop(0, height ? "rgba(128,128,128,0)" : "rgba(60,42,26,0)");
      g.addColorStop(0.5, height ? "rgba(40,40,40,0.9)" : "rgba(68,48,30,0.55)");
      g.addColorStop(1, height ? "rgba(128,128,128,0)" : "rgba(60,42,26,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 9, w, 18);
      if (!height)
        for (let x = 0; x < w; x += 6) {
          ctx.fillStyle = "rgba(50,34,20,0.25)";
          ctx.fillRect(x, y - 4, 3, 8);
        }
    }
    for (const m of marks) {
      ctx.fillStyle = height ? (m.kind ? "#e8e8e8" : "#9a9a9a") : m.kind ? `hsl(30, 6%, ${50 + r() * 20}%)` : "rgba(70,50,32,0.35)";
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.w, m.h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of puddles) {
      ctx.fillStyle = height ? "#5a5a5a" : "rgba(92,112,128,0.75)";
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!height) {
        ctx.fillStyle = "rgba(220,235,250,0.35)";
        ctx.beginPath();
        ctx.ellipse(p.x - p.rx * 0.3, p.y - p.ry * 0.3, p.rx * 0.4, p.ry * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Grass creeping in at the edges.
    for (let k = 0; k < 2200; k++) {
      const x = r() * w,
        edge = r() < 0.5 ? r() * 14 : h - r() * 14;
      ctx.fillStyle = height ? "#b0b0b0" : `hsla(${82 + r() * 24}, 42%, ${30 + r() * 16}%, 0.85)`;
      ctx.fillRect(x, edge, 1.5, 3);
    }
  };
  return { map: canvas(w, h, (ctx) => paint(ctx, false)), height: canvas(w, h, (ctx) => paint(ctx, true)) };
}
/** A tuft of grass blades on a clear ground, for crossed cards. */
function tuftTexture(own: Own) {
  return texture(
    own,
    canvas(64, 64, (ctx) => {
      const r = stream(12);
      for (let k = 0; k < 26; k++) {
        const x = 8 + r() * 48,
          lean = (r() - 0.5) * 14,
          top = 6 + r() * 26;
        ctx.strokeStyle = `hsl(${78 + r() * 28}, ${42 + r() * 20}%, ${26 + r() * 26}%)`;
        ctx.lineWidth = 1.5 + r() * 1.5;
        ctx.beginPath();
        ctx.moveTo(x, 64);
        ctx.quadraticCurveTo(x + lean * 0.3, 40, x + lean, top);
        ctx.stroke();
      }
    }),
  );
}
/** A crater: a dark scorched hollow with a broken rim, fading out at its edge. */
function craterTexture(own: Own) {
  return texture(
    own,
    canvas(128, 128, (ctx) => {
      const r = stream(31),
        g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(18,14,10,0.95)");
      g.addColorStop(0.45, "rgba(40,30,22,0.85)");
      g.addColorStop(0.62, "rgba(110,88,62,0.8)");
      g.addColorStop(0.8, "rgba(60,46,32,0.45)");
      g.addColorStop(1, "rgba(60,46,32,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      for (let k = 0; k < 40; k++) {
        const a = r() * Math.PI * 2,
          d = 30 + r() * 26;
        ctx.fillStyle = `rgba(${70 + r() * 40},${55 + r() * 30},${40 + r() * 20},0.7)`;
        ctx.beginPath();
        ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 2 + r() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}
/** Each era's sky: a gradient top to horizon. */
const SKIES: [string, string, string, string][] = [
  ["#5e8fd0", "#a9c8e8", "#f4d6a2", "#f7c27e"],
  ["#2f74cf", "#7fb8ee", "#d4e8f6", "#eef0e6"],
  ["#6f8fb0", "#b4bfc4", "#e0cfa8", "#d8b88a"],
  ["#3c4352", "#6c6f7a", "#b0796a", "#e08a52"],
];
function skyTexture(own: Own, era: number) {
  const [a, b, c, d] = SKIES[era];
  return texture(
    own,
    canvas(8, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, a);
      g.addColorStop(0.5, b);
      g.addColorStop(0.82, c);
      g.addColorStop(1, d);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 256);
    }),
  );
}
const ATMOSPHERES = [
  // A golden morning: warm low sun.
  { fog: "#e8d6b6", hemiSky: "#ffe6c0", hemiGround: "#5a6a3a", hemi: 1.6, sun: "#ffd29a", sunPower: 2.6, sunAt: [-8, 9, 10] },
  // A clear noon.
  { fog: "#cfe2f0", hemiSky: "#dcecff", hemiGround: "#5a6a3a", hemi: 1.7, sun: "#fff1d6", sunPower: 2.8, sunAt: [5, 15, 10] },
  // A hazy afternoon of powder smoke.
  { fog: "#d6cdb8", hemiSky: "#e9e0c8", hemiGround: "#5d5a3a", hemi: 1.55, sun: "#ffe0b0", sunPower: 2.3, sunAt: [9, 11, 9] },
  // An overcast evening with a red glow low down.
  { fog: "#8e8a8a", hemiSky: "#b8bccc", hemiGround: "#4a4638", hemi: 1.35, sun: "#ffb27a", sunPower: 1.9, sunAt: [12, 6, 8] },
];
function cloudTexture(own: Own) {
  return texture(
    own,
    canvas(256, 128, (ctx) => {
      const r = stream(5);
      for (let k = 0; k < 16; k++) {
        const x = 36 + r() * 184,
          y = 48 + r() * 42,
          rad = 20 + r() * 32,
          g = ctx.createRadialGradient(x, y - 10, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.65, "rgba(242,246,250,0.6)");
        g.addColorStop(1, "rgba(230,236,244,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}
/** A stone or brick wall picture (and its height, for the relief). */
function masonry(own: Own, brick: boolean, rich: boolean) {
  const w = 256,
    h = 256,
    rows = brick ? 16 : 7,
    cols = brick ? 8 : 4,
    r = stream(brick ? 3 : 4);
  const paint = (ctx: CanvasRenderingContext2D, height: boolean) => {
    ctx.fillStyle = height ? "#333" : brick ? "#5b3324" : "#6b6862";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++)
      for (let x = -1; x < cols; x++) {
        const bw = w / cols,
          bh = h / rows,
          ox = (y % 2) * bw * 0.5,
          l = brick ? 32 + r() * 14 : 48 + r() * 16;
        ctx.fillStyle = height ? `rgb(${200 + r() * 40},${200},${200})` : brick ? `hsl(${10 + r() * 10}, ${45 + r() * 15}%, ${l}%)` : `hsl(${30 + r() * 20}, ${6 + r() * 8}%, ${l}%)`;
        ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
        if (!height && r() < 0.25) {
          ctx.fillStyle = "rgba(40,60,30,0.25)";
          ctx.fillRect(x * bw + ox + 2, y * bh + bh - 6, bw - 4, 4);
        }
      }
  };
  const map = texture(own, canvas(w, h, (ctx) => paint(ctx, false)));
  map.wrapS = map.wrapT = T.RepeatWrapping;
  const normal = rich ? normalFrom(own, canvas(w, h, (ctx) => paint(ctx, true)), 3) : null;
  return { map, normal };
}
/** Concrete, stained and patched. */
function concreteTexture(own: Own) {
  const t = texture(
    own,
    canvas(256, 256, (ctx) => {
      const r = stream(21);
      ctx.fillStyle = "#a3a39b";
      ctx.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 3000; k++) {
        ctx.fillStyle = `rgba(${90 + r() * 80},${90 + r() * 80},${85 + r() * 70},0.25)`;
        ctx.fillRect(r() * 256, r() * 256, 2, 2);
      }
      for (let k = 0; k < 10; k++) {
        const x = r() * 256;
        const g = ctx.createLinearGradient(x, 0, x, 256);
        g.addColorStop(0, "rgba(60,58,52,0.35)");
        g.addColorStop(1, "rgba(60,58,52,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 3 + r() * 6, 256);
      }
      ctx.strokeStyle = "rgba(70,70,66,0.6)";
      for (let y = 64; y < 256; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
    }),
  );
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A city's windows, some lit. */
function windowsTexture(own: Own) {
  const t = texture(
    own,
    canvas(64, 128, (ctx) => {
      const r = stream(44);
      ctx.fillStyle = "#3a3d46";
      ctx.fillRect(0, 0, 64, 128);
      for (let y = 4; y < 128; y += 8)
        for (let x = 4; x < 64; x += 8) {
          ctx.fillStyle = r() < 0.35 ? `hsl(${40 + r() * 15}, 80%, ${60 + r() * 20}%)` : "#22252c";
          ctx.fillRect(x, y, 4, 5);
        }
    }),
  );
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/**
 * A mountain for the far range, its foot a unit across and a unit high like the cone it replaces: a cone cut finely
 * and pushed in and out by ridges and gullies running down it and a few rough bumps, painted grey-blue rock with snow
 * lying above a ragged line, its normals smooth. `seed` varies the ridges.
 */
function rugged(seed: number) {
  const around = 72,
    up = 36,
    g = new T.ConeGeometry(0.5, 1, around, up, true),
    pos = g.getAttribute("position") as T.BufferAttribute,
    colours = new Float32Array(pos.count * 3),
    rock = new T.Color("#7d8ba0"),
    dark = new T.Color("#5d6a7c"),
    white = new T.Color("#f3f6fa"),
    c = new T.Color();
  const wave = (a: number, k: number, ph: number) => Math.sin(a * k + ph + seed);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i),
      h = y + 0.5,
      a = Math.atan2(z, x),
      // Ridges running down the slopes, finer ones on them, and a lumpy foot.
      ridge = 0.5 * Math.abs(wave(a, 5, 0.3)) + 0.3 * Math.abs(wave(a, 11, 1.7 + h * 2)) + 0.2 * Math.abs(wave(a, 23, h * 5)),
      lump = 0.06 * wave(a, 3, h * 3) * (1 - h),
      r = Math.hypot(x, z) * (0.82 + 0.3 * ridge + lump),
      top = h > 0.985 ? 0 : 1;
    pos.setXYZ(i, Math.cos(a) * r * top, y + 0.04 * wave(a, 7, 0) * (1 - h) * h, Math.sin(a) * r * top);
    // Snow above a ragged line, deeper in the gullies; dark rock on the ridges below it.
    const line = 0.62 + 0.08 * wave(a, 9, 0.5) - 0.12 * (ridge - 0.5),
      snowy = Math.min(1, Math.max(0, (h - line) / 0.06));
    c.copy(rock).lerp(dark, Math.min(1, ridge * 0.9)).lerp(white, snowy);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new T.BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return smooth(g, 1.2);
}

export function buildField(scene: T.Scene, own: Own, kit: Kit, rich: boolean): Field {
  const skies = [0, 1, 2, 3].map((e) => skyTexture(own, e));
  scene.background = skies[1];
  scene.fog = new T.Fog("#cfe2f0", 40, 110);
  const std = (o: T.MeshStandardMaterialParameters) =>
    own(rich ? new T.MeshStandardMaterial({ roughness: 0.9, ...o }) : new T.MeshLambertMaterial({ color: o.color, map: o.map ?? null, emissive: (o.emissive as T.ColorRepresentation) ?? 0x000000, emissiveMap: o.emissiveMap ?? null, transparent: o.transparent, alphaTest: o.alphaTest ?? 0, side: o.side ?? T.FrontSide }));
  const g = kit.g,
    m4 = new T.Matrix4(),
    q = new T.Quaternion(),
    up = new T.Euler(),
    one = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) => m4.compose(new T.Vector3(x, y, z), q.setFromEuler(up.set(0, ry, 0)), new T.Vector3(sx, sy, sz));
  // The plain and the lane.
  const ground = new T.Mesh(own(new T.PlaneGeometry(160, 80)), std({ color: "#ffffff", map: grassTexture(own, rich) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -22;
  ground.receiveShadow = true;
  scene.add(ground);
  const laneArt = laneCanvases(rich),
    laneMap = texture(own, laneArt.map),
    lane = new T.Mesh(own(new T.PlaneGeometry(BASE_X * 2 + 6, 2.6)), std({ color: "#ffffff", map: laneMap, normalMap: rich ? normalFrom(own, laneArt.height, 2) : undefined, roughness: 0.95 }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.01, 0);
  lane.receiveShadow = true;
  scene.add(lane);
  // Tufts of grass along the lane's edges and on the plain before it: crossed cards, instanced.
  const tuftMat = std({ color: "#ffffff", map: tuftTexture(own), transparent: false, alphaTest: 0.4, side: T.DoubleSide }),
    tuftGeo = own(new T.PlaneGeometry(0.34, 0.22).translate(0, 0.1, 0)),
    // (Only with a graphics card: cut-out cards cost dear where the processor draws.)
    tuftCount = rich ? 700 : 0,
    tufts = new T.InstancedMesh(tuftGeo, tuftMat, tuftCount * 2);
  for (let k = 0; k < tuftCount; k++) {
    const x = -BASE_X - 6 + rnd() * (BASE_X * 2 + 12),
      // (Mostly behind the lane and along its near edge: none big right before the eye.)
      z = rnd() < 0.65 ? -(1.3 + rnd() * 4) : 1.3 + rnd() * 1.1,
      s = 0.6 + rnd() * 0.7,
      a = rnd() * Math.PI;
    tufts.setMatrixAt(k * 2, one(x, 0, z, s, s * (0.8 + rnd() * 0.5), s, a));
    tufts.setMatrixAt(k * 2 + 1, one(x, 0, z, s, s, s, a + Math.PI / 2));
  }
  scene.add(tufts);
  // Hills, woods and mountains behind; stones in front.
  const hill = std({ color: "#5f8a37" }),
    hillFar = std({ color: "#7d9c62" }),
    mountain = std({ color: "#7e8fa6", flatShading: true }),
    mountainFar = std({ color: "#9aa8bc", flatShading: true }),
    snow = std({ color: "#f1f4f8", flatShading: true });
  const hills = new T.InstancedMesh(g.ballLo, hill, 6),
    hillsFar = new T.InstancedMesh(g.ballLo, hillFar, rich ? 6 : 0);
  for (let k = 0; k < 6; k++) {
    hills.setMatrixAt(k, one(-48 + k * 19 + rnd() * 5, -0.8, -14 - rnd() * 4, 10 + rnd() * 9, 2.8 + rnd() * 3, 5 + rnd() * 2));
    if (rich) hillsFar.setMatrixAt(k, one(-54 + k * 21 + rnd() * 6, -1, -24 - rnd() * 4, 14 + rnd() * 10, 4.5 + rnd() * 4, 6));
  }
  // The land behind as Blender made it (hills rising into a snowy range, its shade baked in), in place of the
  // instanced hills and peaks when it is there.
  const blenderLand = bakedLand(own);
  if (blenderLand) scene.add(blenderLand);
  else scene.add(hills, hillsFar);
  // (The far range only with a graphics card: where the processor draws, every layer of sky-filling shapes costs.)
  // With the lifelike look a mountain is a rugged peak (ridges, gullies, snow lying on its upper slopes, shaded smooth)
  // instead of a faceted cone with a snow cone on it.
  const range = rich ? own(rugged(7)) : g.cone,
    rocky = rich ? std({ vertexColors: true, roughness: 0.95 }) : mountain,
    rockyFar = rich ? std({ vertexColors: true, roughness: 1, color: "#d4dcea" }) : mountainFar;
  const peaks = new T.InstancedMesh(range, rocky, 8),
    peaksFar = new T.InstancedMesh(range, rockyFar, rich ? 9 : 0),
    caps = new T.InstancedMesh(g.cone, snow, rich ? 0 : 8);
  for (let k = 0; k < 8; k++) {
    const tall = 14 + rnd() * 12,
      x = -60 + k * 17 + rnd() * 6,
      z = -55 - rnd() * 8;
    peaks.setMatrixAt(k, one(x, tall / 2 - 1, z, tall * 1.1, tall, tall * 0.6, rnd()));
    if (caps.count) caps.setMatrixAt(k, one(x, tall - 1 - tall * 0.15, z + 0.2, tall * 0.33, tall * 0.3, tall * 0.18));
  }
  for (let k = 0; k < peaksFar.count; k++) {
    const tall = 18 + rnd() * 14;
    peaksFar.setMatrixAt(k, one(-70 + k * 18 + rnd() * 8, tall / 2 - 1, -78 - rnd() * 8, tall * 1.2, tall, tall * 0.6, rnd()));
  }
  if (!blenderLand) scene.add(peaks, peaksFar, caps);
  // Woods: instanced trunks and crowns (conifers in tiers and round trees) behind the lane and past the bases.
  const spots: { x: number; z: number; s: number; pine: boolean }[] = [];
  for (let k = 0; k < (rich ? 90 : 66); k++) spots.push({ x: -50 + rnd() * 100, z: -4.5 - rnd() * 14, s: 0.8 + rnd() * 0.9, pine: rnd() < 0.55 });
  for (let k = 0; k < 12; k++) spots.push({ x: (rnd() < 0.5 ? -1 : 1) * (BASE_X + 4 + rnd() * 10), z: -2 + rnd() * 5, s: 0.8 + rnd() * 0.5, pine: rnd() < 0.5 });
  // Crowns of painted leaves and needle sprays (`Grove`: leaf cards round a dark core, alpha-tested, a few instanced
  // meshes in all): spruces in skirts of drooping sprays, round trees in lobed leaves. Where the processor draws, cut-out
  // cards over one another cost it dear: there a spruce has two skirts, and only the crowns that make a tree's outline
  // (a spruce's top skirt, a round tree's main crown) have cards; the rest are the painted cores alone (solid).
  const trunk = new T.InstancedMesh(g.cyl, kit.m.bark, spots.length),
    tiers = rich ? 3 : 2,
    grove = new Grove(scene, own, { near: rich ? undefined : 0, receive: rich, bright: 1.3, lift: 1.1 }),
    bare = rich ? grove : new Grove(scene, own, { receive: false, bright: 1.3, lift: 1.1, cards: false }),
    // A centred cone's middle, radius and height, given as a spruce skirt's foot and size.
    skirt = (x: number, y: number, z: number, r: number, h: number, turn: number, tint: string, top = false) =>
      (top ? grove : bare).tier([x, y - h / 2, z], [r * 1.15, h, r * 1.15], tint, turn);
  spots.forEach((p, i) => trunk.setMatrixAt(i, one(p.x, 0.6 * p.s, p.z, 0.12 * p.s, 1.2 * p.s, 0.12 * p.s)));
  spots.forEach((p, i) => {
    if (p.pine) {
      if (tiers === 3) {
        skirt(p.x, 1.5 * p.s, p.z, 0.95 * p.s, 1.8 * p.s, rnd() * 6, "#2f5a2c");
        skirt(p.x, 2.25 * p.s, p.z, 0.75 * p.s, 1.5 * p.s, rnd() * 6, "#3a6a34");
        skirt(p.x, 2.9 * p.s, p.z, 0.5 * p.s, 1.2 * p.s, rnd() * 6, "#2f5a2c", true);
      } else {
        skirt(p.x, 1.7 * p.s, p.z, 0.9 * p.s, 2.2 * p.s, i, "#2f5a2c");
        skirt(p.x, 2.6 * p.s, p.z, 0.65 * p.s, 1.6 * p.s, i + 2, "#3a6a34", true);
      }
    } else {
      const kind = i % 3 ? "broad" : "oak";
      grove.crown(kind, [p.x, 1.9 * p.s, p.z], [1.1 * p.s, 0.95 * p.s, 1.1 * p.s], i % 2 ? "#4a7a2f" : "#557f33", i);
      bare.crown(kind, [p.x + 0.45 * p.s, 1.7 * p.s, p.z + 0.2], [0.75 * p.s, 0.7 * p.s, 0.75 * p.s], "#456f2c", i + 1);
      if (tiers === 3) grove.crown(kind, [p.x - 0.4 * p.s, 2.2 * p.s, p.z - 0.2], [0.7 * p.s, 0.65 * p.s, 0.7 * p.s], "#52813a", i + 2);
    }
  });
  trunk.castShadow = true;
  scene.add(trunk);
  grove.build();
  if (bare !== grove) bare.build();
  const rockMat = std({ color: "#8d8a84", flatShading: true }),
    dodeca = own(new T.DodecahedronGeometry(1, 0)),
    pebbles = new T.InstancedMesh(dodeca, rockMat, 36);
  for (let k = 0; k < 36; k++) {
    const s = 0.05 + rnd() * 0.13;
    pebbles.setMatrixAt(k, one(-24 + rnd() * 48, s * 0.3, (rnd() < 0.6 ? -1 : 1) * (1.35 + rnd() * 2.2), s * 1.4, s, s * 1.1, rnd() * 3));
  }
  pebbles.castShadow = rich;
  pebbles.receiveShadow = rich;
  scene.add(pebbles);
  const cloudMap = cloudTexture(own),
    clouds: T.Sprite[] = [];
  for (let k = 0; k < (rich ? 10 : 7); k++) {
    const s = new T.Sprite(own(new T.SpriteMaterial({ map: cloudMap, transparent: true, depthWrite: false, opacity: 0.85, fog: false })));
    s.scale.set(14 + rnd() * 10, 6 + rnd() * 3, 1);
    s.position.set(-60 + k * 13 + rnd() * 6, 13 + rnd() * 7, -35 - rnd() * 12);
    scene.add(s);
    clouds.push(s);
  }
  // Materials of the bases and the distance.
  const stone = masonry(own, false, rich),
    brick = masonry(own, true, rich),
    wall = std({ color: "#ffffff", map: stone.map, normalMap: stone.normal ?? undefined }),
    bricks = std({ color: "#ffffff", map: brick.map, normalMap: brick.normal ?? undefined }),
    rock = std({ color: "#857a6c", flatShading: true }),
    concrete = std({ color: "#ffffff", map: concreteTexture(own) }),
    concreteDark = std({ color: "#7c7d77" }),
    sand = std({ color: "#b9a679" }),
    thatch = std({ color: "#b8954a" }),
    roof = std({ color: "#8a3b2a" }),
    plaster = std({ color: "#e8dfc8" }),
    scorch = own(new T.MeshBasicMaterial({ color: "#1a1410", transparent: true, opacity: 0.55, depthWrite: false })),
    fire = own(new T.MeshBasicMaterial({ color: "#ffb347" })),
    flame = own(new T.MeshBasicMaterial({ color: "#ff6a1f" })),
    hole = own(new T.MeshBasicMaterial({ color: "#14110e" })),
    lamp = own(new T.MeshBasicMaterial({ color: "#fff4c8" })),
    red = own(new T.MeshBasicMaterial({ color: "#ff3a2a" })),
    city = own(new T.MeshLambertMaterial({ color: "#ffffff", map: windowsTexture(own), emissive: "#ffffff", emissiveMap: null, emissiveIntensity: 0 }));
  /** The groups whose wood takes its picture even where the processor draws: the bases' still parts (few draws, seen near). */
  const timbered = new Set<T.Object3D>();
  const add = (parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    // Wood in a base's still parts is real wood everywhere; elsewhere where a graphics card draws.
    if (timbered.has(parent) && (material === kit.m.wood || material === kit.m.woodDark)) material = material === kit.m.wood ? kit.m.timber : kit.m.timberDark;
    const wood = material.userData.grain === true,
      m = new T.Mesh(wood ? own(grained(geometry, sx, sy, sz, 0.4)) : geometry, material);
    m.position.set(x, y, z);
    if (!wood) m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // ── The distance, era by era ──
  const smokeMap = puff(own, 128, 7),
    plumes: { s: T.Sprite; x: number; y: number; z: number; rise: number; age: number; size: number; group: T.Object3D }[] = [];
  /** A column of smoke rising from a place in the distance (its puffs loop up and fade). */
  const plume = (group: T.Object3D, x: number, y: number, z: number, size: number, colour: string) => {
    // (Only with a graphics card: where the processor draws, wide soft puffs over the sky cost dear.)
    const n = rich ? 6 : 0;
    for (let k = 0; k < n; k++) {
      const s = new T.Sprite(own(new T.SpriteMaterial({ map: smokeMap, color: colour, transparent: true, depthWrite: false, opacity: 0.6 })));
      group.add(s);
      plumes.push({ s, x, y, z, rise: 1 + rnd() * 0.5, age: k / n, size: rich ? size : size * 0.6, group });
    }
  };
  const tintedFar = own(new T.MeshLambertMaterial({ vertexColors: true })),
    turning: T.Object3D[] = [],
    blinking: T.Object3D[] = [];
  const distance = [0, 1, 2, 3].map((era) => {
    const d = new T.Group(),
      still = new T.Group();
    d.add(still);
    d.visible = false;
    if (era === 0) {
      // A volcano smoking far off; standing stones on a hill; hide tents by a fire.
      add(still, g.cone, rock, 26, 7, -48, 18, 16, 10);
      add(still, g.cyl, flame, 26, 14.6, -47.5, 1.6, 0.3, 1).castShadow = false;
      plume(d, 26, 16, -47, 7, "#5a5450");
      for (let k = 0; k < 5; k++) add(still, g.box, rock, -22 + k * 1.3, 1.6, -18 - (k % 2), 0.6, 2.4 + (k % 2) * 0.6, 0.5).rotation.z = (k - 2) * 0.05;
      add(still, g.box, rock, -19.4, 3.1, -18.4, 3.2, 0.4, 0.8);
      for (let k = 0; k < 3; k++) {
        add(still, g.cone, kit.m.hide, 10 + k * 3, 1.1, -12 - k * 1.5, 1.2, 2.2, 1.2);
        add(still, g.cyl, kit.m.wood, 10 + k * 3, 2.3, -12 - k * 1.5, 0.04, 0.6, 0.04);
      }
      plume(d, 13.5, 0.8, -13, 1.5, "#8a8680");
    } else if (era === 1) {
      // A castle on a hill; a windmill turning; cottages with thatch.
      add(still, g.ballLo, hill, -26, -2, -30, 14, 6, 8);
      for (const [x, h] of [[-30, 6], [-22, 6], [-26, 8.5]] as const) {
        add(still, g.cyl, wall, x, 3.2 + h / 2, -30, 1.4, h, 1.4);
        add(still, g.cone, roof, x, 3.2 + h + 0.9, -30, 1.7, 1.8, 1.7);
      }
      add(still, g.box, wall, -26, 5.6, -30, 8, 4, 1);
      const mill = new T.Group();
      mill.position.set(18, 0, -16);
      d.add(mill);
      add(mill, g.cyl, plaster, 0, 2, 0, 1, 4, 1);
      add(mill, g.cone, thatch, 0, 4.6, 0, 1.3, 1.4, 1.3);
      const sails = new T.Group();
      sails.position.set(0, 4, 1.1);
      mill.add(sails);
      for (let k = 0; k < 4; k++) add(sails, g.box, kit.m.wood, 0, 1.4, 0, 0.35, 2.8, 0.04).parent!.children.at(-1)!.position.set(Math.sin((k * Math.PI) / 2) * 1.4, Math.cos((k * Math.PI) / 2) * 1.4, 0);
      sails.children.forEach((c, k) => (c.rotation.z = (-k * Math.PI) / 2));
      turning.push(sails);
      for (let k = 0; k < 4; k++) {
        const x = 2 + k * 3.4,
          z = -11 - (k % 2) * 2;
        add(still, g.box, plaster, x, 0.7, z, 2, 1.4, 1.5);
        const r = add(still, g.cone4, thatch, x, 1.9, z, 1.6, 1, 1.2);
        r.rotation.y = Math.PI / 4;
      }
      plume(d, 5.4, 2.2, -11, 1.2, "#c8c4be");
    } else if (era === 2) {
      // A village with a church steeple; a redoubt; columns of powder smoke over the hills.
      for (let k = 0; k < 6; k++) {
        const x = -30 + k * 3.2,
          z = -20 - (k % 3);
        add(still, g.box, plaster, x, 1.1, z, 2.6, 2.2, 2);
        add(still, g.cone4, roof, x, 2.8, z, 2, 1.2, 1.6).rotation.y = Math.PI / 4;
      }
      add(still, g.box, plaster, -14, 3, -22, 2, 6, 2);
      add(still, g.cone4, roof, -14, 7.4, -22, 1.5, 3, 1.5).rotation.y = Math.PI / 4;
      add(still, g.ballLo, sand, 18, -0.4, -14, 6, 1.4, 3);
      for (const x of [16, 18.5, 21]) add(still, g.cyl, kit.m.black, x, 0.9, -12.6, 0.12, 0.9, 0.12).rotation.z = Math.PI / 2.4;
      plume(d, 30, 3, -40, 6, "#bdb3a2");
      plume(d, -40, 3, -44, 7, "#a9a092");
      plume(d, 8, 1.5, -26, 3, "#c9c0ae");
    } else {
      // A city's towers with lit windows; pylons and their wires; a radio mast blinking red; smoke over it all.
      for (let k = 0; k < 14; k++) {
        const tall = 6 + rnd() * 14,
          wide = 2 + rnd() * 3,
          x = -60 + k * 7.5 + rnd() * 3,
          b = add(still, g.box, city, x, tall / 2, -48 - rnd() * 8, wide, tall, wide);
        b.castShadow = false;
      }
      // Pylons marching over the far hills.
      for (let k = 0; k < 6; k++) {
        const x = -50 + k * 20,
          z = -42,
          tall = 6;
        for (const s of [-1, 1]) add(still, g.box, kit.m.dark, x + s * 0.45, tall / 2, z, 0.14, tall, 0.14).rotation.z = s * 0.08;
        for (const y of [tall * 0.8, tall * 0.95]) add(still, g.box, kit.m.dark, x, y, z, 2.2, 0.12, 0.12);
      }
      add(still, g.cyl, kit.m.dark, 30, 9, -30, 0.25, 18, 0.25);
      const light = add(d, g.ballLo, red, 30, 18.2, -30, 0.4, 0.4, 0.4);
      light.castShadow = false;
      blinking.push(light);
      plume(d, -20, 10, -50, 8, "#4c4a4a");
      plume(d, 14, 8, -46, 6, "#5a5656");
    }
    // Far off: it neither casts nor takes the sun's shadow (each costs where the processor draws).
    d.traverse((o) => {
      if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = false;
    });
    if (!rich) bakeAll(still, tintedFar, own);
    compactStill(still, own);
    d.traverse((o) => {
      if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = false;
    });
    scene.add(d);
    return d;
  });
  // ── Craters left on the lane (and stones lying), fading slowly ──
  const craterMap = craterTexture(own),
    craters = Array.from({ length: rich ? 28 : 18 }, (_, k) => {
      const mesh = new T.Mesh(g.plane, own(new T.MeshLambertMaterial({ map: craterMap, transparent: true, depthWrite: false, opacity: 0 })));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.014 + k * 0.0004;
      mesh.visible = false;
      mesh.receiveShadow = true;
      mesh.renderOrder = 1;
      scene.add(mesh);
      return { mesh, age: 0 };
    }),
    stones = Array.from({ length: 10 }, () => {
      const mesh = new T.Mesh(dodeca, rockMat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      return { mesh, age: 0 };
    });
  let nextCrater = 0,
    nextStone = 0;
  const CRATER_LIFE = 90;
  /**
   * The mast at a base's front corner where its turrets stand (in front of the building, nearer the eye, so that they
   * are seen): posts and a ledge for each slot, of the era's stuff.
   */
  const mast = (parent: T.Object3D, era: number) => {
    const top = turretAt(0, SLOTS - 1).y + 0.3,
      mat = era === 0 ? kit.m.wood : era === 1 ? wall : era === 2 ? bricks : kit.m.dark,
      thick = era === 0 ? 0.09 : era === 3 ? 0.07 : 0.18;
    for (const x of [-0.15, 1.15]) for (const z of [MAST_Z - 0.32, MAST_Z + 0.32]) add(parent, era === 0 || era === 3 ? g.cyl : g.box, mat, x, top / 2, z, thick, top, thick);
    for (let s = 0; s < SLOTS; s++) {
      const at = turretAt(0, s);
      add(parent, g.box, era === 0 ? kit.m.woodDark : era === 3 ? concreteDark : mat, at.x + BASE_X, at.y - 0.12, MAST_Z, 0.78, 0.12, 0.88);
      if (era === 3) for (const z of [-0.42, 0.42]) add(parent, g.box, kit.m.dark, at.x + BASE_X, at.y + 0.05, MAST_Z + z, 0.78, 0.04, 0.03);
    }
    for (let y = 0.7; y < top - 0.3; y += 1.15) for (const z of [MAST_Z - 0.32, MAST_Z + 0.32]) add(parent, g.box, era === 3 ? kit.m.dark : kit.m.woodDark, 0.5, y, z, 1.45, 0.04, 0.04).rotation.z = 0.65;
    if (era === 0) for (let s = 0; s < 6; s++) add(parent, g.cyl, kit.m.rope, 0.5, 0.4 + s * 0.6, MAST_Z + 0.33, 0.01, 1.3, 0.01).rotation.z = 0.5 + (s % 2) * -1;
  };
  /** A flag in the side's colour on a pole (the cloth waves). */
  const flag = (still: T.Object3D, live: T.Object3D, side: number, x: number, y: number, z: number, pole = 1.6) => {
    add(still, g.cyl, kit.m.dark, x, y + pole / 2, z, 0.03, pole, 0.03);
    add(still, g.ballLo, kit.m.gold, x, y + pole + 0.03, z, 0.05, 0.05, 0.05);
    const cloth = add(live, g.box, kit.m[`team${side}`], x - 0.32, y + pole - 0.22, z, 0.62, 0.38, 0.02);
    cloth.userData.flag = true;
    return cloth;
  };
  const built = new Map<string, Base>();
  function buildBase(side: number, era: number): Base {
    const group = new T.Group(),
      b = new T.Group(),
      still = new T.Group(),
      live = new T.Group();
    group.add(b);
    b.add(still, live);
    timbered.add(still);
    /**
     * What falls as it is hurt: the parts that stand while it is whole are dealt out to fall when it breaks (one in
     * three, and a tower's roof) or when it is ablaze (one in three more), the rest stay; what lies about once it is
     * broken; scorch marks; where fires burn. Each lot is baked together (one draw each).
     */
    const fallsAt2 = new T.Group(),
      fallsAt3 = new T.Group(),
      lying = new T.Group(),
      fires: T.Vector3[] = [],
      scorches: T.Object3D[] = [],
      flames: T.Object3D[] = [];
    live.add(fallsAt2, fallsAt3, lying);
    lying.visible = false;
    let dealt = 0;
    const part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, falls: 0 | 2 | 3 | -1 = -1) => {
      const lot = falls === -1 ? [fallsAt2, fallsAt3, still][dealt++ % 3] : falls === 2 ? fallsAt2 : falls === 3 ? fallsAt3 : still;
      return add(lot, geometry, material, x, y, z, sx, sy, sz);
    };
    const rubble = (x: number, y: number, z: number, n: number, material: T.Material) => {
      for (let k = 0; k < n; k++) {
        const m = add(lying, dodeca, material, x + (rnd() - 0.5) * 1.2, y + rnd() * 0.15, z + (rnd() - 0.5) * 1.2, 0.18 + rnd() * 0.25, 0.14 + rnd() * 0.18, 0.18 + rnd() * 0.22);
        m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      }
    };
    const scorch = (x: number, y: number, z: number, w: number, h: number) => {
      const m = new T.Mesh(g.plane, scorchMat);
      m.position.set(x, y, z);
      m.scale.set(w, h, 1);
      m.visible = false;
      live.add(m);
      scorches.push(m);
    };
    const burn = (x: number, y: number, z: number) => {
      fires.push(new T.Vector3(x, y, z));
      const f = new T.Group();
      f.position.set(x, y, z);
      f.visible = false;
      live.add(f);
      const outer = add(f, g.cone, flame, 0, 0.3, 0, 0.22, 0.65, 0.22),
        inner = add(f, g.cone, fire, 0, 0.22, 0, 0.13, 0.42, 0.13);
      outer.castShadow = inner.castShadow = false;
      outer.userData.flicker = inner.userData.flicker = true;
      flames.push(f);
    };
    // Built at x = 0 facing +x (the lane), then put at its place and mirrored for side 1.
    if (era === 0) {
      // A cave in a rock outcrop with hides over its mouth, a stockade of sharpened stakes, a fire ringed with
      // stones, a totem pole with a skull, a hide tent, bones about.
      add(still, dodeca, rock, -0.7, 1.2, -0.5, 2.2, 2.4, 1.8);
      add(still, dodeca, rock, 0.9, 0.7, -0.9, 1.3, 1.2, 1.1);
      add(still, dodeca, rock, -1.6, 0.6, 0.6, 0.9, 0.8, 0.8);
      add(still, g.ball, hole, 0.85, 0.6, 0.42, 0.6, 0.66, 0.28);
      add(still, g.box, kit.m.hide, 0.95, 1.02, 0.55, 0.5, 0.28, 0.05).rotation.z = 0.15;
      for (let k = 0; k < 10; k++) {
        const z = -1.5 + k * 0.33,
          tall = 1.1 + rnd() * 0.5,
          stake = part(g.cyl, kit.m.wood, 1.78, tall / 2, z, 0.08, tall, 0.08);
        stake.rotation.z = (rnd() - 0.5) * 0.12;
        part(g.cone, kit.m.wood, 1.78, tall + 0.1, z, 0.08, 0.22, 0.08);
      }
      add(still, g.box, kit.m.rope, 1.78, 0.7, -0.05, 0.05, 0.05, 3.2);
      add(still, g.box, kit.m.rope, 1.78, 0.35, -0.05, 0.05, 0.05, 3.2);
      rubble(1.9, 0.08, 0, 6, kit.m.wood);
      for (let k = 0; k < 7; k++) add(still, g.ballLo, kit.m.stone, 1.2 + Math.cos((k / 7) * Math.PI * 2) * 0.28, 0.06, 1.15 + Math.sin((k / 7) * Math.PI * 2) * 0.28, 0.1, 0.08, 0.1);
      for (const a of [0.4, -0.5]) add(still, g.cyl, kit.m.woodDark, 1.2, 0.08, 1.15, 0.04, 0.5, 0.04).rotation.set(Math.PI / 2, a, 0);
      const camp = new T.Group();
      camp.position.set(1.2, 0, 1.15);
      live.add(camp);
      const f1 = add(camp, g.cone, flame, 0, 0.3, 0, 0.16, 0.5, 0.16),
        f2 = add(camp, g.cone, fire, 0, 0.22, 0, 0.1, 0.32, 0.1);
      f1.castShadow = f2.castShadow = false;
      f1.userData.flicker = f2.userData.flicker = true;
      // The totem: stacked carved blocks in the side's colour, a skull on top.
      for (let k = 0; k < 3; k++) part(g.cyl6, k === 1 ? kit.m[`team${side}`] : kit.m.wood, -1.4, 0.4 + k * 0.5, 1.2, 0.2, 0.48, 0.2);
      part(g.ball, kit.m.bone, -1.4, 1.75, 1.2, 0.14, 0.13, 0.13);
      for (const z of [-0.05, 0.05]) part(g.ball, hole, -1.29, 1.77, 1.2 + z, 0.03, 0.03, 0.03);
      add(still, g.cone, kit.m.hide, -0.4, 0.9, 1.4, 0.75, 1.8, 0.75);
      for (let k = 0; k < 3; k++) add(still, g.cyl, kit.m.wood, -0.4 + (k - 1) * 0.12, 1.9, 1.4, 0.025, 0.5, 0.025).rotation.z = (k - 1) * 0.3;
      add(still, g.ball, kit.m.hide, -0.3, 3.05, 0.2, 0.55, 0.36, 0.48);
      for (let k = 0; k < 4; k++) add(still, g.cyl, kit.m.bone, 0.2 + k * 0.25, 0.04, 1.7, 0.025, 0.3, 0.025).rotation.set(Math.PI / 2, k, 0);
      flag(still, live, side, -0.6, 3.2, 0, 1.4);
      scorch(1.1, 1.2, 0.95, 1.4, 1);
      burn(1.6, 0.3, 0.6);
      burn(-0.6, 2.4, 0.3);
      burn(1.75, 0.6, -0.8);
    } else if (era === 1) {
      // A stone keep with crenellations and arrow slits, a gatehouse with a portcullis, round towers with conical
      // roofs in the side's colour, banners down the walls, a wall walk with merlons.
      add(still, g.box, wall, -0.4, 2.1, -0.4, 2.4, 4.2, 2.1);
      for (let k = 0; k < 5; k++) part(g.box, wall, -1.4 + k * 0.5, 4.36, 0.62, 0.3, 0.34, 0.3);
      for (const y of [1.6, 2.8]) for (const x of [-1.2, -0.4, 0.4]) add(still, g.box, hole, x, y, 0.66, 0.06, 0.32, 0.02);
      add(still, g.box, wall, 1.2, 1.2, 0, 1.05, 2.4, 2.9);
      for (let k = 0; k < 6; k++) part(g.box, wall, 1.65, 2.55, -1.25 + k * 0.5, 0.25, 0.3, 0.25);
      add(still, g.box, hole, 1.73, 0.78, 0, 0.02, 1.45, 0.98);
      add(still, g.cyl, hole, 1.73, 1.48, 0, 0.5, 0.02, 0.5).rotation.z = Math.PI / 2;
      for (let k = 0; k < 5; k++) add(still, g.box, kit.m.dark, 1.75, 0.85, -0.38 + k * 0.19, 0.03, 1.3, 0.03);
      for (let k = 0; k < 4; k++) add(still, g.box, kit.m.dark, 1.75, 0.3 + k * 0.32, 0, 0.03, 0.03, 0.95);
      for (const z of [-1.3, 1.3]) {
        add(still, g.cyl, wall, 1.3, 1.65, z, 0.55, 3.3, 0.55);
        part(g.cone, kit.m[`team${side}`], 1.3, 3.75, z, 0.68, 0.95, 0.68, 2);
        add(still, g.box, hole, 1.84, 2.2, z, 0.02, 0.3, 0.07);
      }
      for (const x of [-1.1, 0.3]) {
        const banner = add(still, g.box, kit.m[`team${side}`], x, 3.1, 0.68, 0.42, 1.1, 0.02);
        banner.castShadow = false;
        add(still, g.box, kit.m.gold, x, 3.15, 0.695, 0.12, 0.3, 0.01);
      }
      flag(still, live, side, -0.4, 4.5, -0.4, 1.4);
      rubble(1.4, 0.1, 1.3, 7, wall);
      rubble(-0.6, 0.1, 0.9, 5, wall);
      scorch(0.3, 2.2, 0.67, 1.6, 1.2);
      scorch(1.73, 1.5, 0.6, 0.02, 0.8);
      burn(1.3, 3.3, 1.3);
      burn(-0.9, 4.2, 0.4);
      burn(1.6, 0.4, -0.6);
    } else if (era === 2) {
      // A brick star fort: a sloped glacis, a parapet with cannon in embrasures, a powder store, a barrack with a
      // roof in the side's colour, gabions, a flagstaff.
      add(still, g.box, bricks, -0.3, 1.5, -0.3, 3, 3, 2.4);
      const slope = add(still, g.box, bricks, 1.25, 0.9, 0, 1.1, 1.8, 3);
      slope.rotation.z = 0.22;
      add(still, g.box, wall, -0.3, 3.08, -0.3, 3.1, 0.18, 2.5);
      for (let k = 0; k < 4; k++) part(g.box, bricks, -1.5 + k * 0.85, 3.4, 0.82, 0.55, 0.45, 0.25);
      for (const z of [-0.8, 0, 0.8]) {
        add(still, g.cyl, hole, 1.6, 1.25, z, 0.15, 0.05, 0.15).rotation.z = Math.PI / 2;
        add(still, g.cyl, kit.m.black, 1.62, 1.25, z, 0.08, 0.3, 0.08).rotation.z = Math.PI / 2;
      }
      const barrack = add(still, g.box, kit.m.woodDark, -0.9, 3.65, 0.4, 1.3, 0.9, 1);
      barrack.castShadow = true;
      part(g.cone4, kit.m[`team${side}`], -0.9, 4.35, 0.4, 1.05, 0.55, 0.8).rotation.y = Math.PI / 4;
      add(still, g.box, hole, -0.6, 3.6, 0.91, 0.18, 0.3, 0.02);
      // Powder barrels and gabions before the fort.
      for (let k = 0; k < 3; k++) add(still, g.cyl, kit.m.wood, 1.95, 0.2, -1.2 + k * 0.35, 0.15, 0.38, 0.15);
      for (let k = 0; k < 4; k++) add(still, g.cyl, kit.m.rope, 2.0, 0.3, 0.5 + k * 0.32, 0.16, 0.6, 0.16);
      flag(still, live, side, 0.3, 3.2, -0.6, 1.9);
      rubble(1.5, 0.1, 0.8, 7, bricks);
      rubble(-1.2, 3.2, 0.6, 4, bricks);
      scorch(-0.2, 1.8, 0.92, 1.8, 1.4);
      burn(-0.9, 4.2, 0.4);
      burn(1.2, 1.1, -0.9);
      burn(0.6, 3.3, 0.7);
    } else {
      // A concrete bunker: a stepped roof, firing slits, a steel door, sandbags in rows, barbed wire on stakes,
      // floodlights, a radar dish turning, aerials, a camouflage net.
      add(still, g.box, concrete, -0.4, 1.2, -0.3, 3.4, 2.4, 2.4);
      add(still, g.box, concreteDark, -0.4, 2.5, -0.3, 3.5, 0.2, 2.5);
      add(still, g.box, concrete, -0.7, 2.95, -0.5, 1.8, 0.7, 1.6);
      for (const z of [-0.7, 0.3]) add(still, g.box, hole, 1.31, 1.45, z, 0.02, 0.18, 0.7);
      add(still, g.box, kit.m.dark, 1.31, 0.72, 0.88, 0.04, 1.2, 0.62);
      add(still, g.box, kit.m.iron, 1.34, 0.75, 1.0, 0.02, 0.05, 0.1);
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 6; k++) part(g.ballLo, sand, 1.78 + (row % 2) * 0.05, 0.12 + row * 0.2, -1.3 + k * 0.48 + (row % 2) * 0.24, 0.26, 0.11, 0.2);
      for (let k = 0; k < 4; k++) add(still, g.cyl, kit.m.dark, 2.35, 0.3, -1.3 + k * 0.85, 0.02, 0.6, 0.02).rotation.z = 0.2;
      for (let k = 0; k < 3; k++) for (const y of [0.25, 0.45]) add(still, g.wheel, kit.m.iron, 2.35, y, -0.88 + k * 0.85, 0.12, 0.12, 2).rotation.y = Math.PI / 2;
      for (const z of [-1.2, 0.9]) {
        add(still, g.cyl, kit.m.dark, 0.9, 3.1, z, 0.03, 1.2, 0.03);
        const lampHead = add(still, g.box, kit.m.dark, 1.0, 3.7, z, 0.2, 0.18, 0.25);
        lampHead.rotation.z = -0.4;
        add(still, g.box, lamp, 1.1, 3.66, z, 0.02, 0.12, 0.18).rotation.z = -0.4;
      }
      const net = add(still, g.box, kit.m.oliveDark, -0.6, 2.7, 0.92, 3, 0.04, 0.6);
      net.rotation.x = 0.5;
      const dish = new T.Group();
      dish.position.set(-1.3, 3.3, -0.7);
      dish.userData.spin = true;
      live.add(dish);
      add(dish, g.cyl, kit.m.dark, 0, -0.2, 0, 0.06, 0.6, 0.06);
      const plate = add(dish, g.cap, kit.m.steel, 0, 0.25, 0, 0.6, 0.18, 0.6);
      plate.rotation.z = Math.PI / 2.4;
      add(still, g.cyl, kit.m.dark, 0.6, 3.8, -1.1, 0.015, 2.2, 0.015);
      const beacon = add(live, g.ballLo, red, 0.6, 4.92, -1.1, 0.05, 0.05, 0.05);
      beacon.castShadow = false;
      beacon.userData.blink = true;
      flag(still, live, side, 0.9, 2.6, 0.4, 1.6);
      rubble(1.4, 0.1, 0.5, 8, concrete);
      rubble(-0.8, 2.6, 0.4, 4, concreteDark);
      scorch(0.3, 1.6, 0.92, 2, 1.4);
      burn(-1.2, 2.7, 0.6);
      burn(0.8, 1.9, 0.7);
      burn(1.9, 0.4, -0.6);
    }
    mast(still, era);
    for (const lot of [still, fallsAt2, fallsAt3, lying]) {
      if (!rich) bakeAll(lot, kit.tinted, own);
      compactStill(lot, own);
    }
    group.position.x = side ? BASE_X : -BASE_X;
    if (side) group.scale.x = -1;
    group.visible = false;
    scene.add(group);
    let shown = -1;
    return {
      group,
      wear(hurt) {
        // 0 whole, 1 scorched and smoking, 2 broken and burning, 3 ablaze.
        const stage = hurt > 0.85 ? 3 : hurt > 0.6 ? 2 : hurt > 0.3 ? 1 : 0;
        if (stage !== shown) {
          shown = stage;
          for (const m of scorches) m.visible = stage >= 1;
          lying.visible = stage >= 2;
          fallsAt2.visible = stage < 2;
          fallsAt3.visible = stage < 3;
          flames.forEach((f, k) => (f.visible = stage >= 3 || (stage >= 2 && k === 0)));
        }
        const out: T.Vector3[] = [];
        if (stage >= 1) for (const p of fires.slice(0, stage)) out.push(new T.Vector3(group.position.x + p.x * group.scale.x, p.y, p.z));
        return out;
      },
    };
  }
  const scorchMat = scorch;
  function buildTurret(era: number) {
    const t = new T.Group(),
      barrel = new T.Group();
    t.add(barrel);
    t.userData.barrel = barrel;
    if (era === 0) {
      // A sling-thrower: a wooden frame, a bent arm with a hide cup and a stone in it, rope lashings.
      add(t, g.box, kit.m.wood, 0, 0.1, 0, 0.55, 0.14, 0.42);
      for (const z of [-0.16, 0.16]) add(t, g.box, kit.m.wood, -0.05, 0.3, z, 0.06, 0.4, 0.06);
      add(t, g.cyl, kit.m.rope, -0.05, 0.45, 0, 0.03, 0.36, 0.03).rotation.x = Math.PI / 2;
      barrel.position.set(-0.1, 0.22, 0);
      add(barrel, g.cyl, kit.m.wood, 0.2, 0.25, 0, 0.035, 0.6, 0.035).rotation.z = -0.9;
      add(barrel, g.cap, kit.m.hide, 0.43, 0.42, 0, 0.1, 0.07, 0.1).rotation.x = Math.PI;
      add(barrel, g.ballLo, kit.m.stone, 0.43, 0.46, 0, 0.07, 0.07, 0.07);
      t.userData.muzzle = new T.Vector3(0.45, 0.7, 0);
    } else if (era === 1) {
      // A great crossbow on a post: its stock, steel arms, the string drawn, a bolt laid.
      add(t, g.cyl, kit.m.woodDark, 0, 0.2, 0, 0.07, 0.4, 0.07);
      add(t, g.cyl, kit.m.iron, 0, 0.4, 0, 0.1, 0.05, 0.1);
      barrel.position.set(0, 0.44, 0);
      add(barrel, g.box, kit.m.wood, 0.05, 0, 0, 0.85, 0.08, 0.1);
      for (const z of [-0.3, 0.3]) add(barrel, g.cone, kit.m.iron, 0.28, 0, z, 0.025, 0.62, 0.025).rotation.x = z > 0 ? Math.PI / 2 : -Math.PI / 2;
      add(barrel, g.cyl, kit.m.rope, 0.2, 0, 0, 0.006, 1.2, 0.006).rotation.x = Math.PI / 2;
      add(barrel, g.cyl, kit.m.wood, 0.3, 0.06, 0, 0.012, 0.6, 0.012).rotation.z = Math.PI / 2;
      add(barrel, g.cone4, kit.m.iron, 0.62, 0.06, 0, 0.025, 0.12, 0.025).rotation.z = -Math.PI / 2;
      add(barrel, g.cyl, kit.m.woodDark, -0.32, 0, 0, 0.05, 0.12, 0.05).rotation.x = Math.PI / 2;
      t.userData.muzzle = new T.Vector3(0.68, 0.5, 0);
    } else if (era === 2) {
      // A fortress gun on a garrison carriage with small iron wheels, bands round its barrel.
      add(t, g.box, kit.m.woodDark, 0, 0.12, 0, 0.6, 0.2, 0.5);
      for (const x of [-0.2, 0.2]) for (const z of [-0.27, 0.27]) add(t, g.cyl, kit.m.iron, x, 0.07, z, 0.08, 0.05, 0.08).rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.32, 0);
      add(barrel, g.cyl, kit.m.black, 0.25, 0, 0, 0.1, 0.8, 0.1).rotation.z = -Math.PI / 2;
      add(barrel, g.ball, kit.m.black, -0.15, 0, 0, 0.13, 0.13, 0.13);
      for (const x of [0.05, 0.4]) add(barrel, g.cyl, kit.m.brass, x, 0, 0, 0.11, 0.03, 0.11).rotation.z = -Math.PI / 2;
      add(barrel, g.cyl, kit.m.black, 0.64, 0, 0, 0.12, 0.06, 0.12).rotation.z = -Math.PI / 2;
      t.userData.muzzle = new T.Vector3(0.68, 0.32, 0);
    } else {
      // Twin cannon in a turret on a ring, an ammunition box, a shield plate.
      add(t, g.cyl, kit.m.dark, 0, 0.15, 0, 0.22, 0.3, 0.22);
      barrel.position.set(0, 0.38, 0);
      add(barrel, g.box, kit.m.olive, 0, 0, 0, 0.45, 0.24, 0.38);
      for (const z of [-0.08, 0.08]) {
        add(barrel, g.cyl, kit.m.black, 0.45, 0.02, z, 0.03, 0.6, 0.03).rotation.z = -Math.PI / 2;
        add(barrel, g.cyl, kit.m.dark, 0.72, 0.02, z, 0.04, 0.08, 0.04).rotation.z = -Math.PI / 2;
      }
      add(barrel, g.box, kit.m.oliveDark, 0.2, 0.05, 0, 0.04, 0.34, 0.44);
      add(barrel, g.box, kit.m.khaki, -0.15, -0.02, 0.24, 0.16, 0.12, 0.08);
      t.userData.muzzle = new T.Vector3(0.78, 0.4, 0);
    }
    t.traverse((o) => {
      if (o instanceof T.Mesh) o.castShadow = true;
    });
    return t;
  }
  const atmospheres: Atmosphere[] = ATMOSPHERES.map((a, era) => ({
    sky: skies[era],
    fog: new T.Color(a.fog),
    hemiSky: new T.Color(a.hemiSky),
    hemiGround: new T.Color(a.hemiGround),
    hemi: a.hemi,
    sun: new T.Color(a.sun),
    sunPower: a.sunPower,
    sunAt: new T.Vector3(...a.sunAt),
  }));
  let age = -1;
  return {
    base(side, era) {
      const key = `${side}:${era}`;
      let b = built.get(key);
      if (!b) built.set(key, (b = buildBase(side, era)));
      return b;
    },
    turret: buildTurret,
    clouds,
    age(era) {
      if (era !== age) {
        age = era;
        distance.forEach((d, k) => (d.visible = k === era));
        // The city's windows light up toward evening.
        city.emissiveMap = era === 3 ? city.map : null;
        city.emissiveIntensity = era === 3 ? 0.9 : 0;
        city.needsUpdate = true;
      }
      return atmospheres[era];
    },
    crater(x, size, isRock) {
      // (One falling rock in three is left lying, half sunk.)
      if (isRock && rnd() < 0.34) {
        const s = stones[nextStone];
        nextStone = (nextStone + 1) % stones.length;
        s.mesh.position.set(x + (rnd() - 0.5) * 0.3, 0.05 * size, (rnd() - 0.5) * 0.8);
        s.mesh.scale.set(0.2 * size, 0.15 * size, 0.18 * size);
        s.mesh.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        s.mesh.visible = true;
        s.age = 0;
      }
      const c = craters[nextCrater];
      nextCrater = (nextCrater + 1) % craters.length;
      c.mesh.position.x = x;
      c.mesh.position.z = (rnd() - 0.5) * 0.6;
      c.mesh.rotation.z = rnd() * Math.PI * 2;
      c.mesh.scale.set(size * (isRock ? 0.9 : 1.6), size * (isRock ? 0.6 : 1.1), 1);
      c.mesh.visible = true;
      c.age = 0;
    },
    tick(t, dt) {
      for (const c of craters)
        if (c.mesh.visible) {
          c.age += dt;
          (c.mesh.material as T.MeshLambertMaterial).opacity = Math.max(0, 0.9 * Math.min(1, c.age * 6) * (1 - c.age / CRATER_LIFE));
          if (c.age > CRATER_LIFE) c.mesh.visible = false;
        }
      for (const s of stones)
        if (s.mesh.visible) {
          s.age += dt;
          if (s.age > CRATER_LIFE / 2) s.mesh.visible = false;
        }
      for (const s of turning) s.rotation.z = -t * 0.8;
      for (const b of blinking) b.visible = Math.sin(t * 4) > 0.2;
      for (const p of plumes) {
        if (!p.group.visible) continue;
        p.age = (p.age + dt * 0.08 * p.rise) % 1;
        const k = p.age;
        p.s.position.set(p.x + k * p.size * 0.6, p.y + k * p.size * 2.2, p.z);
        p.s.scale.setScalar(p.size * (0.5 + k * 1.3));
        p.s.material.opacity = 0.55 * Math.sin(k * Math.PI);
      }
    },
  };
}
