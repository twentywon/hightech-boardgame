import * as T from "three";
import { glossy, wood } from "../../engine/scene-utils";
import { cellOf } from "./rules";
import { BOWL, CUP, FRAME_OUT, GUTTER, NOTCH, PLATEAU, STEP, TOP, cellAt, cupDepth, hexPoint } from "./layout";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A seeded random, so that the stone looks the same every time. */
export function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/**
 * Pale travertine-like marble, painted once: a warm cream ground in soft clouds, a drift of fine grey and honey veins
 * laid one way (as stone is cut along its bed), and tiny pores.
 */
export function stonePicture(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!,
    rand = seeded(9187),
    s = size / 1024;
  ctx.fillStyle = "#e4d6bd";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = rand() * size,
      y = rand() * size,
      r = (50 + rand() * 190) * s,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() < 0.5 ? "rgba(246,238,222,0.35)" : "rgba(196,170,130,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Bands along the bed, faint.
  for (let i = 0; i < 18; i++) {
    const y = rand() * size,
      h = (6 + rand() * 30) * s;
    ctx.fillStyle = rand() < 0.5 ? "rgba(200,176,136,0.07)" : "rgba(250,244,230,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 32 * s) ctx.lineTo(x, y + Math.sin(x / (90 * s) + i) * 10 * s);
    ctx.lineTo(size, y + h);
    for (let x = size; x >= 0; x -= 32 * s) ctx.lineTo(x, y + h + Math.sin(x / (70 * s) + i * 2) * 8 * s);
    ctx.fill();
  }
  const vein = (width: number, color: string, blur: number, steps: number) => {
    let x = rand() * size,
      y = rand() * size,
      a = (rand() - 0.5) * 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * s;
    ctx.filter = blur ? `blur(${blur * s}px)` : "none";
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.5;
      a *= 0.92;
      x += Math.cos(a) * 20 * s;
      y += Math.sin(a) * 20 * s;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  for (let i = 0; i < 9; i++) vein(9, "rgba(170,140,100,0.12)", 8, 40 + Math.floor(rand() * 30));
  for (let i = 0; i < 12; i++) vein(1.4, "rgba(120,104,88,0.28)", 0.6, 25 + Math.floor(rand() * 35));
  for (let i = 0; i < 16; i++) vein(0.8, "rgba(160,120,70,0.2)", 0.3, 10 + Math.floor(rand() * 18));
  ctx.filter = "none";
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = rand() < 0.7 ? "rgba(150,124,90,0.35)" : "rgba(255,250,240,0.4)";
    const r = (0.6 + rand() * 1.6) * s;
    ctx.fillRect(rand() * size, rand() * size, r * 1.6, r);
  }
  return c;
}
/** The cell nearest a point of the plateau, by rounding its axial co-ordinates; -1 off the board. */
function nearestCell(x: number, z: number) {
  const r = z / (STEP * 0.8660254),
    q = x / STEP - r / 2,
    s = -q - r;
  let rq = Math.round(q),
    rr = Math.round(r);
  const rs = Math.round(s),
    dq = Math.abs(rq - q),
    dr = Math.abs(rr - r),
    ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return cellOf(rq, rr);
}
/** How far round the outline a point lies from the nearer of the two let-down corners, as a share of 1 inside the notch. */
export function dipAt(u: number) {
  const k = ((u % 1) + 1) % 1,
    far = Math.min(k, 1 - k, Math.abs(k - 0.5)),
    t = Math.min(1, Math.max(0, (NOTCH - far) / (NOTCH * 0.55)));
  return t * t * (3 - 2 * t);
}
const AROUND = 6 * 72;
/**
 * The plateau: concentric rounded hexagons from the middle to the edge, lifted and dipped by the 61 cups, with normals
 * worked out from the cups' slopes (so the shallow hollows shade smoothly) and the inside of each cup a little darker.
 */
function plateau(rich: boolean) {
  const rings = rich ? 96 : 64,
    around = rich ? AROUND : AROUND / 2,
    { apothem, corner } = PLATEAU,
    positions: number[] = [],
    normals: number[] = [],
    colours: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const a = (apothem * k) / rings,
      rho = corner - (apothem - a);
    for (let j = 0; j <= around; j++) {
      const p = k === 0 ? { x: 0, z: 0 } : hexPoint(a, rho, j / around);
      const cell = nearestCell(p.x, p.z);
      let y = TOP,
        nx = 0,
        nz = 0,
        shade = 1;
      if (cell >= 0) {
        const c = cellAt(cell),
          dx = p.x - c.x,
          dz = p.z - c.z,
          r = Math.hypot(dx, dz);
        if (r >= CUP.radius && r < CUP.radius * 1.12) shade = 1.06;
        if (r < CUP.radius) {
          y += cupDepth(r);
          const rr = r / CUP.radius,
            slope = (4 * CUP.depth * rr * (1 - rr * rr)) / CUP.radius;
          if (r > 1e-6) {
            nx = -(slope * dx) / r;
            nz = -(slope * dz) / r;
          }
          // The hollow darker toward its floor, a fine dark line where it is cut and a light lip just outside.
          shade = 1 - 0.3 * (1 - rr * rr) - 0.16 * Math.exp(-(((rr - 0.93) / 0.05) ** 2));
        }
      }
      const l = Math.hypot(nx, 1, nz);
      positions.push(p.x, y, p.z);
      normals.push(nx / l, 1 / l, nz / l);
      colours.push(shade, shade * 0.99, shade * 0.97);
      uvs.push(p.x / 7 + 0.5, p.z / 7 + 0.5);
    }
  }
  for (let k = 0; k < rings; k++)
    for (let j = 0; j < around; j++) {
      const a = k * (around + 1) + j,
        b = a + around + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}
/**
 * The frame: one profile swept round the plateau (outward offsets of its rounded hexagon): the edge rolled over into
 * the gutter's round channel, the outer wall, a rounded rim a little higher than the plateau, the outer face with a
 * bead, the foot. At the left and right corners the parts beyond the channel's middle are let down to its floor, so
 * that a marble runs out there into the bowl.
 */
function frame(rich: boolean) {
  const { floor, radius, offset } = GUTTER,
    centreY = floor + radius,
    profile: [number, number, number][] = [
      [0, TOP, 0.98],
      [0.035, TOP - 0.008, 0.96],
      [0.062, TOP - 0.04, 0.92],
      [offset - radius, centreY, 0.86],
    ];
  // The channel, from its inner side down round its floor and up its outer side.
  for (let k = 1; k < 10; k++) {
    const a = Math.PI + (k / 10) * Math.PI;
    profile.push([offset + Math.cos(a) * radius, centreY + Math.sin(a) * radius, 0.62 - 0.2 * Math.sin(-a + Math.PI)]);
  }
  profile.push(
    [offset + radius, centreY, 0.86],
    [offset + radius + 0.01, TOP + 0.02, 0.95],
    [offset + radius + 0.04, TOP + 0.055, 1],
    [offset + radius + 0.1, TOP + 0.07, 1],
    [offset + radius + 0.16, TOP + 0.055, 1],
    [offset + radius + 0.2, TOP + 0.01, 0.98],
    [FRAME_OUT - 0.07, TOP - 0.06, 0.96],
    [FRAME_OUT - 0.05, 0.2, 0.92],
    [FRAME_OUT - 0.01, 0.16, 0.9],
    [FRAME_OUT, 0.11, 0.88],
    [FRAME_OUT - 0.02, 0.06, 0.84],
    [FRAME_OUT - 0.06, 0.02, 0.8],
    [FRAME_OUT - 0.08, 0, 0.78],
  );
  const around = rich ? AROUND : AROUND / 2,
    positions: number[] = [],
    colours: number[] = [],
    uvs: number[] = [],
    index: number[] = [],
    { apothem, corner } = PLATEAU,
    perimeter = 6 * 2 * (apothem + FRAME_OUT) * Math.tan(Math.PI / 6);
  let along = 0;
  const lengths = profile.map(([d, y], i) => {
    if (i) along += Math.hypot(d - profile[i - 1][0], y - profile[i - 1][1]);
    return along;
  });
  for (let j = 0; j <= around; j++) {
    const u = j / around,
      dip = dipAt(u);
    profile.forEach(([d, y, shade], i) => {
      // Let down at the notch: beyond the channel's middle nothing stands above its floor.
      const low = d > offset ? Math.min(y, floor + 0.004) : y,
        h = y + (low - y) * dip,
        p = hexPoint(apothem + d, corner + d, u);
      positions.push(p.x, h, p.z);
      const tone = shade + (1 - shade) * dip * (d > offset ? 0.5 : 0);
      colours.push(tone, tone * 0.99, tone * 0.97);
      uvs.push((u * perimeter) / 4, lengths[i] / 2.5);
    });
  }
  const n = profile.length;
  for (let j = 0; j < around; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i,
        b = a + n;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // The first and last columns are the same place: give both the same normal so that no seam shows.
  const normal = g.getAttribute("normal") as T.BufferAttribute;
  for (let i = 0; i < n; i++) {
    const a = i,
      b = around * n + i,
      v = new T.Vector3(normal.getX(a) + normal.getX(b), normal.getY(a) + normal.getY(b), normal.getZ(a) + normal.getZ(b)).normalize();
    normal.setXYZ(a, v.x, v.y, v.z);
    normal.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}
/** A turned bowl: a foot, a rounded rim, a shallow hollow with a flat floor. */
function bowlGeometry() {
  const { radius, floor, rim } = BOWL,
    // From the middle of the floor out, up over a rounded lip and down the outside to the foot; with each point, how
    // light it is (the hollow in its own shade).
    points = (
      [
        [0, floor, 0.62],
        [radius * 0.4, floor, 0.62],
        [radius * 0.66, floor + 0.012, 0.66],
        [radius * 0.82, floor + 0.04, 0.72],
        [radius * 0.93, floor + 0.085, 0.8],
        [radius, rim - 0.03, 0.9],
        [radius + 0.02, rim - 0.005, 1],
        [radius + 0.06, rim + 0.012, 1.05],
        [radius + 0.1, rim - 0.002, 1],
        [radius + 0.125, rim - 0.04, 0.95],
        [radius + 0.13, rim - 0.08, 0.9],
        [radius + 0.1, 0.05, 0.85],
        [radius + 0.05, 0.015, 0.8],
        [radius - 0.05, 0, 0.8],
      ] as [number, number, number][]
    ).reverse();
  // Turned from the foot in, so that the faces look outward and up.
  const segments = 64,
    g = new T.LatheGeometry(
      points.map(([r, y]) => new T.Vector2(r, y)),
      segments,
    ),
    // The lathe's vertices go round segment by segment, each with every point of the profile.
    colours: number[] = [];
  for (let k = 0; k <= segments; k++) for (const [, , tone] of points) colours.push(tone, tone * 0.98, tone * 0.95);
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  return g;
}
/** The whole board: the stone plateau set in its walnut frame, and the two walnut bowls. */
export function buildBoard(own: Own, rich: boolean) {
  const picture = own(new T.CanvasTexture(stonePicture(rich ? 1024 : 512)));
  picture.colorSpace = T.SRGBColorSpace;
  picture.wrapS = picture.wrapT = T.RepeatWrapping;
  picture.anisotropy = rich ? 8 : 2;
  const stone = own(rich ? glossy({ map: picture, vertexColors: true, roughness: 0.5 }, 0.18) : new T.MeshStandardMaterial({ map: picture, vertexColors: true, roughness: 0.58 }));
  // The frame, its gutter and the bowls are turned walnut, oiled, its grain running round the board; the stone
  // plateau is set into it.
  const grain = own(wood(true, 0.85));
  const honey = own(new T.MeshStandardMaterial({ map: grain, color: "#c99a78", vertexColors: true, roughness: 0.48 }));
  const group = new T.Group();
  const top = new T.Mesh(own(plateau(rich)), stone),
    rim = new T.Mesh(own(frame(rich)), honey);
  top.receiveShadow = true;
  // The frame takes shadows but casts none: on its own rounded faces it striped itself.
  rim.receiveShadow = true;
  group.add(top, rim);
  const bowlStone = honey;
  const bowl = own(bowlGeometry());
  for (const side of [0, 1]) {
    const mesh = new T.Mesh(bowl, bowlStone);
    mesh.position.set(side === 0 ? BOWL.x : -BOWL.x, 0, 0);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
