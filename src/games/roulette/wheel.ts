import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { grain } from "../../engine/grain";
import { BALL_R, CONE_OUT, DIAMONDS, DIAMOND_R, ORDER, POCKET_IN, RIM, SLOT, TRACK_R, colourOf } from "./sim";

/**
 * The roulette wheel, made in its own metres (`sim.ts`), as a casino's wheel is: a turned bowl of real wood with a
 * brass inlay round its top, the ball track polished into its inner wall, a sunburst-veneered cone (the stator) with
 * eight chrome deflectors (the diamonds) standing alternately along and across the ball's way, and the rotor: 37
 * lacquered pockets each dished a little, their numbers on a band round their outer ends, chrome frets between them,
 * a veneered cone rising to a brass turret with its cross handle. Everything is merged by its material, so the whole
 * wheel is a handful of meshes (where the processor draws it, as many as the old wheel's few big parts, and its
 * frets no longer one each). Where no graphics card draws, the curves are cut coarser and the metals are lit as
 * paint, since nothing round the table is reflected in them there.
 */
type Keep = <R extends { dispose(): void }>(r: R) => R;
const RED = "#b3261f",
  BLACK = "#16161a",
  GREEN = "#0f7a45";
export const pocketPaint = (n: number) => (colourOf(n) === "red" ? RED : colourOf(n) === "black" ? BLACK : GREEN);
/** The pockets' floor: low at the turret, up at the rim, as the ball's height says (`heightAt`). */
export const floorY = (r: number) => -0.012 - (0.006 * (RIM - r)) / (RIM - POCKET_IN);
/** The cone's surface height at radius `r` (from the rotor's rim up to the track). */
export const coneY = (r: number) => 0.004 + (0.036 * (r - RIM)) / (CONE_OUT - RIM);
/** Where the numbers' band begins (the pockets' outer ends). */
const BAND = RIM - 0.027;

/** Paint: a polished metal (chrome or brass); where nothing is reflected it is a bright paint with a sheen. */
export function metal(keep: Keep, rich: boolean, tone: string, rough = 0.2) {
  if (rich) return keep(new T.MeshStandardMaterial({ color: tone, metalness: 1, roughness: rough }));
  const c = new T.Color(tone).lerp(new T.Color("#ffffff"), 0.15);
  return keep(new T.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.3 }));
}
/** A clear-lacquered surface over `params` where a graphics card draws. */
export function lacquer(keep: Keep, rich: boolean, params: T.MeshStandardMaterialParameters, coat = 1) {
  return keep(rich ? new T.MeshPhysicalMaterial({ ...params, clearcoat: coat, clearcoatRoughness: 0.08 }) : new T.MeshStandardMaterial(params));
}
const turned = (points: [number, number][], segments: number) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/** A lathe's picture turned a quarter, so that the wood's grain (along the photograph's u) runs out from the middle: a sunburst veneer. */
function radial(g: T.BufferGeometry, across = 1, along = 1) {
  const uv = g.attributes.uv as T.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i),
      v = uv.getY(i);
    uv.setXY(i, v * along, u * across);
  }
  uv.needsUpdate = true;
  return g;
}
/** The pictures' u round a lathe repeated `times` (the wood's grain going round, in staves). */
function around(g: T.BufferGeometry, times: number, along = 1) {
  const uv = g.attributes.uv as T.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * times, uv.getY(i) * along);
  uv.needsUpdate = true;
  return g;
}
const flat = (list: T.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;

/** The rotor's pockets seen from above: each in its colour, darker toward its walls, the numbers on the band at their outer ends. */
function pocketPicture(keep: Keep, size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const pen = canvas.getContext("2d")!,
    c = size / 2,
    s = c / RIM;
  pen.fillStyle = "#101012";
  pen.fillRect(0, 0, size, size);
  ORDER.forEach((n, k) => {
    const a0 = k * SLOT,
      a1 = (k + 1) * SLOT,
      mid = (a0 + a1) / 2;
    // The pocket: its colour, a little lighter in the middle where the light falls into its dish.
    const shade = pen.createRadialGradient(c + Math.cos(mid) * 0.235 * s, c - Math.sin(mid) * 0.235 * s, 0, c + Math.cos(mid) * 0.235 * s, c - Math.sin(mid) * 0.235 * s, 0.04 * s),
      base = new T.Color(pocketPaint(n));
    shade.addColorStop(0, `#${base.clone().lerp(new T.Color("#ffffff"), 0.12).getHexString()}`);
    shade.addColorStop(1, `#${base.clone().multiplyScalar(0.72).getHexString()}`);
    pen.fillStyle = shade;
    pen.beginPath();
    pen.arc(c, c, BAND * s, -a1, -a0);
    pen.arc(c, c, POCKET_IN * s * 0.97, -a0, -a1, true);
    pen.closePath();
    pen.fill();
    // The band of numbers: the pocket's colour, deeper, its number upright to one looking in from outside.
    pen.fillStyle = `#${base.clone().multiplyScalar(0.9).getHexString()}`;
    pen.beginPath();
    pen.arc(c, c, RIM * s, -a1, -a0);
    pen.arc(c, c, BAND * s, -a0, -a1, true);
    pen.closePath();
    pen.fill();
    const r = ((BAND + RIM) / 2) * s;
    pen.save();
    pen.translate(c + Math.cos(mid) * r, c - Math.sin(mid) * r);
    pen.rotate(Math.PI / 2 - mid);
    pen.fillStyle = "#fff8e6";
    pen.shadowColor = "rgba(0,0,0,0.55)";
    pen.shadowBlur = size / 600;
    pen.font = `700 ${Math.round(0.0175 * s)}px "Georgia", "Times New Roman", serif`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText(String(n), 0, size / 1400);
    pen.restore();
  });
  // Gold lines either side of the band.
  pen.strokeStyle = "#e0bb62";
  pen.lineWidth = size / 500;
  for (const r of [BAND, RIM - 0.0015]) {
    pen.beginPath();
    pen.arc(c, c, r * s, 0, Math.PI * 2);
    pen.stroke();
  }
  const texture = keep(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** The pockets' floor: each pocket dished a little, its picture laid from above. */
function pocketFloor(steps: number, rich: boolean) {
  const pos: number[] = [],
    uv: number[] = [],
    index: number[] = [],
    rings = rich ? [POCKET_IN * 0.985, POCKET_IN + 0.012, 0.228, 0.24, BAND, BAND + 0.008, RIM - 0.01, RIM] : [POCKET_IN * 0.985, 0.226, BAND, RIM];
  const cols = ORDER.length * steps + 1;
  for (const r of rings)
    for (let j = 0; j < cols; j++) {
      const a = (j / (cols - 1)) * Math.PI * 2,
        f = (j % steps) / steps,
        // A dish across each pocket and down its length (not under the band of numbers).
        dish = r < BAND ? 0.0018 * Math.sin(Math.PI * f) * Math.sin((Math.PI * (r - POCKET_IN)) / (BAND - POCKET_IN)) : 0,
        x = Math.cos(a) * r,
        z = -Math.sin(a) * r;
      pos.push(x, floorY(r) - dish, z);
      uv.push(0.5 + x / (2 * RIM), 0.5 - z / (2 * RIM));
    }
  for (let i = 0; i + 1 < rings.length; i++)
    for (let j = 0; j + 1 < cols; j++) {
      const a = i * cols + j,
        b = a + 1,
        c = a + cols,
        d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
/** One fret: a thin fin standing on the pockets' floor from the turret's wall to the rim, its top rounded off at the rim. */
function fret(rich: boolean) {
  const shape = new T.Shape(),
    lo = (r: number) => floorY(r) - 0.002;
  shape.moveTo(POCKET_IN - 0.002, lo(POCKET_IN));
  shape.lineTo(RIM, lo(RIM));
  shape.lineTo(RIM, floorY(RIM) + 0.004);
  shape.quadraticCurveTo(RIM - 0.002, floorY(RIM) + 0.0085, RIM - 0.008, floorY(RIM - 0.008) + 0.0088);
  shape.lineTo(POCKET_IN + 0.004, floorY(POCKET_IN) + 0.0105);
  shape.quadraticCurveTo(POCKET_IN - 0.002, floorY(POCKET_IN) + 0.011, POCKET_IN - 0.002, floorY(POCKET_IN) + 0.008);
  shape.closePath();
  const depth = 0.0022,
    g = new T.ExtrudeGeometry(shape, rich ? { depth, bevelEnabled: true, bevelSize: 0.0005, bevelThickness: 0.0005, bevelSegments: 2, curveSegments: 4 } : { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
/** A deflector: a long four-sided pyramid lying on the cone, its long way along `along` (radial when true). */
function diamond(radialWay: boolean) {
  const L = 0.017,
    Wd = 0.0065,
    Hd = 0.0058,
    tip = [0, Hd, 0],
    corners = radialWay
      ? [
          [L, 0, 0],
          [0, 0, -Wd],
          [-L, 0, 0],
          [0, 0, Wd],
        ]
      : [
          [Wd, 0, 0],
          [0, 0, -L],
          [-Wd, 0, 0],
          [0, 0, L],
        ];
  const pos: number[] = [];
  for (let k = 0; k < 4; k++) pos.push(...corners[k], ...corners[(k + 1) % 4], ...tip);
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

export interface Wheel {
  /** The still parts (bowl, track, cone, diamonds), in the wheel's metres. */
  stator: T.Group;
  /** The turning parts: the pockets, frets, rotor cone and turret. */
  rotor: T.Group;
}
export function buildWheel(keep: Keep, rich: boolean, base: number): Wheel {
  const stator = new T.Group(),
    rotor = new T.Group(),
    seg = rich ? 128 : 40,
    // Where the processor draws, a profile keeps every other point (its ends kept).
    cut = (points: [number, number][]) => (rich ? points : points.filter((_, i) => i === 0 || i === points.length - 1 || i % 2 === 0)),
    mesh = (geometry: T.BufferGeometry, material: T.Material, into: T.Group, shadow = false) => {
      const m = new T.Mesh(keep(geometry), material);
      m.receiveShadow = true;
      m.castShadow = shadow;
      into.add(m);
      return m;
    };
  const bowlWood = keep(new T.MeshStandardMaterial({ ...grain(keep, "#5e2f16", { kind: "dark", contrast: 1.5, rich, repeat: 1 }), roughness: 0.42 })),
    trackWood = lacquer(keep, rich, { ...grain(keep, "#4a2412", { kind: "dark", contrast: 1.3, rich }), roughness: 0.22 }, 1),
    coneWood = lacquer(keep, rich, { ...grain(keep, "#b07642", { kind: "light", contrast: 1.6, rich }), roughness: 0.3 }, 0.9),
    rotorWood = lacquer(keep, rich, { ...grain(keep, "#c8874a", { kind: "light", contrast: 1.8, rich }), roughness: 0.25 }, 1),
    brass = metal(keep, rich, "#d6a94e", 0.24),
    chrome = metal(keep, rich, "#e6e8ee", 0.14),
    pockets = lacquer(keep, rich, { map: pocketPicture(keep, rich ? 2048 : 1024), roughness: 0.32 }, 0.8);

  // ── The bowl: a moulded plinth on the table, a cove and a bead up its outside, a rounded top with brass let in,
  // and down its inner wall into the ball track (polished), whose cove the ball runs in.
  const bowl = turned(
    cut([
      [0.4, base],
      [0.494, base],
      [0.497, base + 0.006],
      [0.494, base + 0.014],
      [0.484, base + 0.02],
      [0.476, base + 0.032],
      [0.474, 0.0],
      [0.48, 0.012],
      [0.482, 0.022],
      [0.478, 0.032],
      [0.472, 0.048],
      [0.47, 0.068],
      [0.467, 0.08],
      [0.461, 0.088],
      [0.452, 0.0915],
      [0.44, 0.0915],
      [0.43, 0.0905],
      [0.412, 0.0895],
      [0.401, 0.087],
    ]),
    seg,
  );
  mesh(around(bowl, 6, 1.2), bowlWood, stator, true);
  // The brass band let into the bowl's top.
  mesh(turned([[0.4505, 0.0914], [0.4505, 0.0921], [0.4435, 0.0921], [0.4435, 0.0914]], seg), brass, stator);
  const track = turned(
    cut([
      [0.401, 0.087],
      [0.396, 0.084],
      [0.392, 0.078],
      [0.39, 0.068],
      [0.386, 0.058],
      [0.38, 0.0508],
      [TRACK_R, 0.0465],
      [0.364, 0.0444],
      [CONE_OUT + 0.004, 0.0425],
    ]),
    seg,
  );
  mesh(around(track, 8, 0.5), trackWood, stator);
  const cone = turned(
    [
      [CONE_OUT + 0.004, 0.0425],
      [CONE_OUT, coneY(CONE_OUT)],
      [(CONE_OUT + RIM) / 2, coneY((CONE_OUT + RIM) / 2)],
      [RIM + 0.004, coneY(RIM + 0.004)],
      [RIM + 0.0035, -0.002],
    ],
    seg,
  );
  mesh(radial(cone, 10, 0.6), coneWood, stator);
  // The diamonds, alternately along the ball's way and across it, lying on the cone's slope.
  const slope = Math.atan2(0.036, CONE_OUT - RIM),
    stones = DIAMONDS.map((a, k) => {
      const g = diamond(k % 2 === 1);
      g.applyMatrix4(new T.Matrix4().makeRotationZ(slope));
      g.translate(DIAMOND_R, coneY(DIAMOND_R) + 0.0004, 0);
      g.rotateY(a);
      return g;
    });
  mesh(flat(stones), chrome, stator, true);

  // ── The rotor.
  mesh(pocketFloor(rich ? 8 : 2, rich), pockets, rotor);
  const frets = Array.from({ length: ORDER.length }, (_, k) => fret(rich).rotateY(k * SLOT));
  // The chrome round the rotor's rim and the low wall round the turret's foot, with the frets.
  const rimWall = turned([[RIM - 0.0005, floorY(RIM) - 0.001], [RIM + 0.0015, 0.0005], [RIM + 0.0035, 0.003], [RIM + 0.0042, -0.002]], seg),
    footWall = turned([[POCKET_IN - 0.003, floorY(POCKET_IN) + 0.012], [POCKET_IN - 0.0005, floorY(POCKET_IN) + 0.0115], [POCKET_IN - 0.0005, floorY(POCKET_IN) - 0.001]], seg);
  mesh(flat([...frets, rimWall, footWall]), chrome, rotor, rich);
  // The rotor's cone up to the turret: veneered in a sunburst, a brass ring round it.
  const rotorCone = turned(
    [
      [POCKET_IN - 0.003, floorY(POCKET_IN) + 0.012],
      [0.185, 0.0065],
      [0.15, 0.019],
      [0.11, 0.029],
      [0.075, 0.036],
      [0.052, 0.0405],
    ],
    seg,
  );
  mesh(radial(rotorCone, 12, 0.7), rotorWood, rotor, rich);
  // The turret: a flanged foot, a waisted column, the hub of the cross and a finial; four arms ending in turned knobs.
  const turret = turned(
    cut([
      [0.056, 0.0395],
      [0.057, 0.0425],
      [0.05, 0.0445],
      [0.036, 0.047],
      [0.026, 0.0505],
      [0.019, 0.056],
      [0.0145, 0.064],
      [0.016, 0.072],
      [0.024, 0.0765],
      [0.026, 0.0815],
      [0.024, 0.0865],
      [0.015, 0.09],
      [0.009, 0.096],
      [0.0075, 0.108],
      [0.0105, 0.114],
      [0.0125, 0.12],
      [0.0095, 0.1265],
      [0.004, 0.1295],
      [0, 0.13],
    ]),
    rich ? 48 : 14,
  );
  const arms = [0, 1, 2, 3].map((k) => {
    const arm = turned(
      [
        [0.0048, 0.0],
        [0.0042, 0.06],
        [0.0038, 0.092],
        [0.0055, 0.1],
        [0.009, 0.108],
        [0.0118, 0.118],
        [0.011, 0.126],
        [0.0075, 0.132],
        [0.0035, 0.1345],
        [0, 0.135],
      ],
      rich ? 20 : 6,
    );
    arm.rotateZ(-Math.PI / 2);
    arm.translate(0.012, 0.0838, 0);
    arm.rotateY((k * Math.PI) / 2 + Math.PI / 4);
    return arm;
  });
  const ring = turned([[0.1325, 0.0262], [0.1305, 0.0275], [0.1255, 0.0285], [0.1235, 0.0278]], seg);
  mesh(flat(rich ? [turret, ...arms, ring] : [turret, ...arms]), brass, rotor, true);
  return { stator, rotor };
}
/** The ball's material: ivory resin, glazed. */
export function ballMaterial(keep: Keep, rich: boolean) {
  return lacquer(keep, rich, { color: "#f7f3ea", roughness: 0.16 }, 1);
}
export { BALL_R };
