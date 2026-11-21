import * as T from "three";
import { weave } from "../../engine/scene-utils";
import { Batch } from "./batch";
import { HOLES, boxOf, heightAt, wallsOf, type Hole, type P, type Poly } from "./course";
import { CUP_R, WALL } from "./sim";

/**
 * The greens of the course, modelled and painted in code: a carpet that follows the lie of the ground (cut away
 * where the cups, the ponds and the blocks are), a painted rail round it and round every block, white posts at its
 * corners, rubber bumpers, the cup with its flag, the tee mat, and each hole's own pieces: the windmill, the stone
 * tunnel, the pond with its bridge, the flower bed.
 */
type Keep = <R extends { dispose(): void }>(r: R) => R;
/** How high a rail stands over the carpet, and how far down its outer face reaches (the lawn). */
export const RAIL_H = 0.065,
  LAWN = -0.1;
/** A small fixed sequence, so that the painted specks and the flowers come out the same every time. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
export interface Green {
  group: T.Group;
  /** The flag in the cup, lifted out as a ball comes near. */
  flag: T.Group;
  flagPaint: T.Material[];
  /** The windmill's sails, turned by the view. */
  sails: T.Group | null;
  /** The water of the pond, its ripples scrolled by the view. */
  water: T.Texture | null;
}
/** A solid of eight corners (four below, four above, both in the same order round), with flat faces. */
function prism(out: number[], normals: number[], lo: T.Vector3[], hi: T.Vector3[]) {
  const quad = (a: T.Vector3, b: T.Vector3, c: T.Vector3, d: T.Vector3) => {
    const n = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(d, a)).normalize();
    for (const p of [a, b, c, a, c, d]) {
      out.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
  };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(lo[i], lo[j], hi[j], hi[i]);
  }
  quad(hi[0], hi[1], hi[2], hi[3]);
}
/** The rails along a hole's walls, one solid each short piece so that the top follows the ground. */
function railGeometry(hole: Hole, walls: [P, P][]) {
  const out: number[] = [],
    normals: number[] = [];
  for (const [a, b] of walls) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len,
      uz = (b.z - a.z) / len,
      // Outward of the travel the right-hand side; the rail stands across its line, so the side does not matter.
      nx = -uz * WALL,
      nz = ux * WALL,
      // Pieces short enough to follow the ground where it rises or falls; on the level one piece will do.
      rises = Array.from({ length: 9 }, (_, i) => heightAt(hole, a.x + ((b.x - a.x) * i) / 8, a.z + ((b.z - a.z) * i) / 8)),
      n = Math.max(...rises) - Math.min(...rises) > 0.004 ? Math.max(1, Math.ceil(len / 0.12)) : 1;
    for (let i = 0; i < n; i++) {
      const s0 = (len * i) / n,
        s1 = (len * (i + 1)) / n,
        p0 = { x: a.x + ux * s0, z: a.z + uz * s0 },
        p1 = { x: a.x + ux * s1, z: a.z + uz * s1 },
        t0 = heightAt(hole, p0.x, p0.z) + RAIL_H,
        t1 = heightAt(hole, p1.x, p1.z) + RAIL_H,
        corners = [
          [p0.x - nx, p0.z - nz, t0],
          [p1.x - nx, p1.z - nz, t1],
          [p1.x + nx, p1.z + nz, t1],
          [p0.x + nx, p0.z + nz, t0],
        ];
      // Wound so that every face looks outward whichever way the wall runs.
      const lo = corners.map(([x, z]) => new T.Vector3(x, LAWN, z)),
        hi = corners.map(([x, z, y]) => new T.Vector3(x, y, z)),
        cross = (lo[1].x - lo[0].x) * (lo[3].z - lo[0].z) - (lo[1].z - lo[0].z) * (lo[3].x - lo[0].x);
      if (cross > 0) {
        lo.reverse();
        hi.reverse();
      }
      prism(out, normals, lo, hi);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(out, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  return geometry;
}
const trace = (ctx: CanvasRenderingContext2D, poly: Poly, px: (p: P) => [number, number]) => {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(...px(p)) : ctx.moveTo(...px(p))));
  ctx.closePath();
};
/** The carpet's picture: green with mown bands and specks, sand, the tee mat, the cup's rim; cut away where nothing is laid. */
function carpetPicture(hole: Hole, k: number) {
  const box = boxOf(hole.outline),
    w = box.x1 - box.x0,
    d = box.z1 - box.z0,
    scale = Math.min(150, 1024 / Math.max(w, d)),
    canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(d * scale);
  const ctx = canvas.getContext("2d")!,
    px = (p: P): [number, number] => [(p.x - box.x0) * scale, (p.z - box.z0) * scale],
    random = seeded(31 + k * 17);
  trace(ctx, hole.outline, px);
  ctx.fillStyle = "#3ea94a";
  ctx.fill();
  ctx.save();
  trace(ctx, hole.outline, px);
  ctx.clip();
  // Bands as a mower leaves them, across the hole.
  for (let z = box.z0, n = 0; z < box.z1; z += 0.35, n++) {
    ctx.fillStyle = n % 2 ? "rgba(255,255,255,0.055)" : "rgba(0,40,0,0.05)";
    ctx.fillRect(0, (z - box.z0) * scale, canvas.width, 0.35 * scale);
  }
  for (let i = 0; i < w * d * 900; i++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,50,0,0.09)";
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 1.5, 1.5);
  }
  // Sand: warm, grainy, a darker lip.
  for (const sand of hole.sand) {
    trace(ctx, sand, px);
    ctx.fillStyle = "#ecd496";
    ctx.fill();
    ctx.lineWidth = 0.025 * scale;
    ctx.strokeStyle = "#c9ab67";
    ctx.stroke();
    ctx.save();
    trace(ctx, sand, px);
    ctx.clip();
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = random() < 0.5 ? "rgba(140,105,50,0.28)" : "rgba(255,250,230,0.5)";
      ctx.fillRect(random() * canvas.width, random() * canvas.height, 2, 2);
    }
    ctx.restore();
  }
  // A sandy bank round each pond.
  for (const water of hole.water) {
    trace(ctx, water, px);
    ctx.lineWidth = 0.07 * scale;
    ctx.strokeStyle = "#cdb47c";
    ctx.stroke();
  }
  // The tee mat, darker, with its white spot.
  const [tx, tz] = px(hole.tee);
  ctx.fillStyle = "#256f32";
  ctx.beginPath();
  ctx.roundRect(tx - 0.2 * scale, tz - 0.15 * scale, 0.4 * scale, 0.3 * scale, 0.04 * scale);
  ctx.fill();
  ctx.fillStyle = "#f4f4ec";
  ctx.beginPath();
  ctx.arc(tx, tz, 0.022 * scale, 0, Math.PI * 2);
  ctx.fill();
  // A pale ring round the cup.
  const [cx, cz] = px(hole.cup);
  ctx.fillStyle = "#cfe9c3";
  ctx.beginPath();
  ctx.arc(cx, cz, (CUP_R + 0.012) * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Cut away: the cup, the ponds (the bridges have boards of their own) and the blocks.
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cz, CUP_R * scale, 0, Math.PI * 2);
  ctx.fill();
  for (const poly of [...hole.water, ...hole.blocks]) {
    trace(ctx, poly, px);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** The carpet: a grid over the hole that follows the lie of the ground. */
function carpetGeometry(hole: Hole) {
  const box = boxOf(hole.outline),
    step = 0.09,
    nx = Math.ceil((box.x1 - box.x0) / step),
    nz = Math.ceil((box.z1 - box.z0) / step),
    position: number[] = [],
    uv: number[] = [],
    index: number[] = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = box.x0 + ((box.x1 - box.x0) * i) / nx,
        z = box.z0 + ((box.z1 - box.z0) * j) / nz;
      position.push(x, heightAt(hole, x, z), z);
      uv.push(i / nx, 1 - j / nz);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
/** A flat shape of a polygon lying on the ground at height `y`. */
function lying(poly: Poly, y: number) {
  const shape = new T.Shape(poly.map((p) => new T.Vector2(p.x, -p.z)));
  return new T.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, y, 0);
}
/** A polygon raised as a solid from the lawn to `top`. */
function raised(poly: Poly, top: number) {
  const shape = new T.Shape(poly.map((p) => new T.Vector2(p.x, -p.z)));
  return new T.ExtrudeGeometry(shape, { depth: top - LAWN, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, LAWN, 0);
}
/** The number on a flag, and the hole's sign at its tee. */
function painted(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const FONT = (weight: number, size: number) => `${weight} ${size}px "Inter", "Noto Sans KR", sans-serif`;
/** Pieces several greens share: made once, disposed with the view. */
export interface Parts {
  white: T.Material;
  rubber: T.Material;
  post: T.BufferGeometry;
  ring: T.BufferGeometry;
  cap: T.BufferGeometry;
  stone: T.Material;
  moss: T.Material;
  soil: T.Material;
  wood: T.Material;
  darkWood: T.Material;
}
export function parts(keep: Keep): Parts {
  return {
    white: keep(new T.MeshStandardMaterial({ color: "#f7f5ee", roughness: 0.45 })),
    rubber: keep(new T.MeshStandardMaterial({ color: "#e23b3b", roughness: 0.6 })),
    post: keep(new T.CylinderGeometry(1, 1, 1, 24)),
    ring: keep(new T.TorusGeometry(1, 0.28, 10, 28).rotateX(Math.PI / 2)),
    cap: keep(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    stone: keep(new T.MeshStandardMaterial({ color: "#a9a59c", roughness: 0.9 })),
    moss: keep(new T.MeshStandardMaterial({ color: "#5d9a3c", roughness: 0.95 })),
    soil: keep(new T.MeshStandardMaterial({ color: "#6b4a2e", roughness: 1 })),
    wood: keep(new T.MeshStandardMaterial({ color: "#c08a52", roughness: 0.7 })),
    darkWood: keep(new T.MeshStandardMaterial({ color: "#7a5231", roughness: 0.75 })),
  };
}
const mesh = (geometry: T.BufferGeometry, material: T.Material | T.Material[], parent: T.Object3D, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
/**
 * Joins every mesh under `source` that has a single paint into one mesh a paint under `parent` (those with a paint a
 * face stay as they are), so that a hole of a hundred pieces costs the picture a dozen.
 */
export function flatten(source: T.Group, parent: T.Object3D, keep: Keep) {
  const batch = new Batch(keep),
    joined: T.Mesh[] = [];
  source.updateMatrixWorld(true);
  source.traverse((thing) => {
    if (!(thing instanceof T.Mesh) || thing instanceof T.InstancedMesh || Array.isArray(thing.material)) return;
    batch.place(thing.geometry, thing.material, thing.matrixWorld, thing.castShadow);
    joined.push(thing);
  });
  for (const m of joined) m.removeFromParent();
  batch.build(parent);
  parent.add(source);
}
/** Builds hole `k` at its origin. */
export function buildGreen(k: number, origin: P, keep: Keep, shared: Parts, flowers: (spots: { x: number; z: number; y: number }[]) => void): Green {
  const hole = HOLES[k],
    group = new T.Group(),
    // What never moves is gathered here and joined into one mesh a paint at the end.
    fixed = new T.Group();
  group.position.set(origin.x, 0, origin.z);
  // The carpet.
  const carpet = mesh(
    keep(carpetGeometry(hole)),
    keep(new T.MeshStandardMaterial({ map: keep(carpetPicture(hole, k)), alphaTest: 0.5, roughness: 0.95, ...weave(6, 10, keep, 0.35) })),
    group,
    0,
    0,
    0,
    false,
  );
  carpet.receiveShadow = true;
  // The rails, in the hole's colour; round the windmill's house its walls stand instead.
  const walls = hole.windmill ? hole.outline.map((p, i) => [p, hole.outline[(i + 1) % hole.outline.length]] as [P, P]) : wallsOf(hole),
    paint = keep(new T.MeshStandardMaterial({ color: hole.paint, roughness: 0.42 }));
  mesh(keep(railGeometry(hole, walls)), paint, group);
  // A white post with a round cap at every corner of the rail.
  for (const poly of hole.windmill ? [hole.outline] : [hole.outline, ...hole.blocks])
    for (const p of poly) {
      const top = heightAt(hole, p.x, p.z) + RAIL_H + 0.012,
        r = WALL * 1.15,
        post = mesh(shared.post, shared.white, fixed, p.x, (top + LAWN) / 2, p.z);
      post.scale.set(r, top - LAWN, r);
      mesh(shared.cap, shared.white, fixed, p.x, top, p.z).scale.setScalar(r);
    }
  // Rubber bumpers: white posts with a red ring.
  for (const b of hole.posts) {
    const h = heightAt(hole, b.x, b.z),
      post = mesh(shared.post, shared.white, fixed, b.x, h + 0.06, b.z);
    post.scale.set(b.r * 0.86, 0.12, b.r * 0.86);
    mesh(shared.cap, shared.white, fixed, b.x, h + 0.12, b.z).scale.set(b.r * 0.86, 0.35 * b.r, b.r * 0.86);
    mesh(shared.ring, shared.rubber, fixed, b.x, h + 0.05, b.z).scale.set(b.r * 0.82, b.r * 0.82, b.r * 0.82);
  }
  // The cup: a white liner going down, dark at the bottom.
  const cupY = heightAt(hole, hole.cup.x, hole.cup.z);
  mesh(keep(new T.CylinderGeometry(CUP_R, CUP_R, 0.1, 32, 1, true)), keep(new T.MeshStandardMaterial({ color: "#e9ebe6", roughness: 0.6, side: T.DoubleSide })), fixed, hole.cup.x, cupY - 0.05, hole.cup.z, false);
  mesh(keep(new T.CircleGeometry(CUP_R, 32).rotateX(-Math.PI / 2)), keep(new T.MeshStandardMaterial({ color: "#2a2d2a", roughness: 0.9 })), fixed, hole.cup.x, cupY - 0.099, hole.cup.z, false);
  // The flag: a white pole with red bands and a yellow pennant with the hole's number.
  const flag = new T.Group(),
    poleWhite = keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, transparent: true })),
    poleRed = keep(new T.MeshStandardMaterial({ color: "#e0352f", roughness: 0.4, transparent: true })),
    cloth = keep(
      new T.MeshStandardMaterial({
        map: keep(
          painted(128, 96, (ctx) => {
            ctx.fillStyle = "#ffd23a";
            ctx.fillRect(0, 0, 128, 96);
            ctx.fillStyle = "#1f2a44";
            ctx.font = FONT(900, 58);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(k + 1), 44, 50);
          }),
        ),
        roughness: 0.8,
        transparent: true,
      }),
    );
  for (let i = 0; i < 6; i++) mesh(keep(new T.CylinderGeometry(0.0065, 0.0065, 0.09, 10)), i % 2 ? poleRed : poleWhite, flag, 0, 0.045 + i * 0.09, 0);
  const pennant = new T.Shape([new T.Vector2(0, 0), new T.Vector2(0.17, -0.055), new T.Vector2(0, -0.11)]),
    pennantGeometry = keep(new T.ShapeGeometry(pennant)),
    uvs = pennantGeometry.attributes.position;
  // The number reads on the pennant's near half.
  const uv: number[] = [];
  for (let i = 0; i < uvs.count; i++) uv.push(uvs.getX(i) / 0.17, 1 + uvs.getY(i) / 0.11);
  pennantGeometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  // Front and back as two faces of one paint (a double-sided paint would need a shader of its own).
  const banner = mesh(pennantGeometry, cloth, flag, 0.006, 0.54, 0, false),
    behind = mesh(pennantGeometry, cloth, flag, 0.006, 0.54, 0, false);
  banner.rotation.y = -0.5;
  behind.rotation.y = -0.5 + Math.PI;
  behind.scale.x = -1;
  flag.position.set(hole.cup.x, cupY - 0.06, hole.cup.z);
  group.add(flag);
  // The tee's sign: a little board on a post at the left of the mat.
  const box = boxOf(hole.outline),
    sign = new T.Group();
  mesh(keep(new T.BoxGeometry(0.035, 0.42, 0.035)), shared.darkWood, sign, 0, 0.11, 0);
  const face = keep(
    painted(256, 160, (ctx) => {
      ctx.fillStyle = "#fffaf0";
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = hole.paint;
      ctx.fillRect(0, 0, 256, 18);
      ctx.fillRect(0, 142, 256, 18);
      ctx.fillStyle = "#1f2a44";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = FONT(900, 56);
      ctx.fillText(`${k + 1}번 홀`, 128, 62);
      ctx.font = FONT(800, 34);
      ctx.fillText(`파 ${hole.par}`, 128, 114);
    }),
  );
  mesh(keep(new T.BoxGeometry(0.3, 0.19, 0.018)), [shared.wood, shared.wood, shared.wood, shared.wood, keep(new T.MeshStandardMaterial({ map: face, roughness: 0.7 })), shared.wood], sign, 0, 0.38, 0.02);
  // Beside the green a little ahead of the tee, turned toward the golfer behind the ball.
  sign.position.set(box.x0 - 0.3, 0, hole.tee.z - 1.1);
  sign.rotation.y = 0.55;
  fixed.add(sign);
  // What stands on the green: flower beds and rocks, the windmill's house, the tunnel, the pond and its bridge.
  if (!hole.windmill)
    hole.blocks.forEach((poly, i) => {
      const b = boxOf(poly),
        small = Math.min(b.x1 - b.x0, b.z1 - b.z0) < 0.25;
      mesh(keep(raised(poly, small ? 0.16 : 0.09)), small ? shared.stone : shared.soil, group);
      if (small) return;
      // A bed of flowers and a round bush in its middle.
      const random = seeded(70 + k * 9 + i),
        spots: { x: number; z: number; y: number }[] = [];
      for (let n = 0; n < (b.x1 - b.x0) * (b.z1 - b.z0) * 40; n++) {
        const x = b.x0 + 0.07 + random() * (b.x1 - b.x0 - 0.14),
          z = b.z0 + 0.07 + random() * (b.z1 - b.z0 - 0.14);
        spots.push({ x: origin.x + x, z: origin.z + z, y: 0.09 });
      }
      flowers(spots);
      const cx = (b.x0 + b.x1) / 2,
        cz = (b.z0 + b.z1) / 2,
        leaves = keep(new T.MeshStandardMaterial({ color: "#3f8f3a", roughness: 0.9 }));
      mesh(keep(new T.CylinderGeometry(0.035, 0.05, 0.45, 10)), shared.darkWood, fixed, cx, 0.3, cz);
      for (const [dx, dy, dz, r] of [
        [0, 0.66, 0, 0.26],
        [0.12, 0.56, 0.08, 0.18],
        [-0.12, 0.58, -0.06, 0.19],
      ])
        mesh(keep(new T.IcosahedronGeometry(r, 2)), leaves, fixed, cx + dx, dy, cz + dz);
    });
  let sails: T.Group | null = null;
  if (hole.windmill) sails = windmill(hole, fixed, group, keep, shared);
  for (const tunnel of hole.tunnels) {
    // A stone arch over the corridor, its legs on the walls either side, moss along its top.
    const outer = tunnel.width / 2 + 0.07,
      inner = tunnel.width / 2 - 0.02,
      shape = new T.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI, false);
    shape.lineTo(-inner, 0);
    shape.absarc(0, 0, inner, Math.PI, 0, true);
    shape.closePath();
    const length = tunnel.z1 - tunnel.z0,
      arch = keep(new T.ExtrudeGeometry(shape, { depth: length, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 18 })),
      blocks = keep(
        painted(256, 256, (ctx) => {
          ctx.fillStyle = "#b3aea3";
          ctx.fillRect(0, 0, 256, 256);
          const random = seeded(5);
          for (let row = 0; row < 8; row++)
            for (let col = 0; col < 4; col++) {
              const shade = 150 + Math.floor(random() * 50);
              ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 12})`;
              ctx.fillRect(col * 64 + (row % 2) * 32 + 3, row * 32 + 3, 58, 26);
            }
        }),
      );
    blocks.wrapS = blocks.wrapT = T.RepeatWrapping;
    blocks.repeat.set(6, 4);
    const stoneFace = keep(new T.MeshStandardMaterial({ map: blocks, roughness: 0.9 }));
    mesh(arch, stoneFace, fixed, tunnel.x, RAIL_H, tunnel.z0);
    const moss = mesh(keep(new T.CylinderGeometry(outer + 0.01, outer + 0.01, length * 0.94, 18, 1, true, Math.PI - 0.5, 1)), shared.moss, fixed, tunnel.x, RAIL_H, (tunnel.z0 + tunnel.z1) / 2);
    moss.rotation.x = Math.PI / 2;
  }
  let water: T.Texture | null = null;
  hole.water.forEach((pond) => {
    // The bottom, the banks and the surface, with lily pads.
    const ripple = keep(
      painted(256, 256, (ctx) => {
        ctx.fillStyle = "#43b9d8";
        ctx.fillRect(0, 0, 256, 256);
        const random = seeded(9);
        ctx.strokeStyle = "rgba(255,255,255,0.32)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 26; i++) {
          const x = random() * 256,
            y = random() * 256,
            r = 10 + random() * 26;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.35, 0, Math.PI * 0.1, Math.PI * 0.9);
          ctx.stroke();
        }
      }),
    );
    ripple.wrapS = ripple.wrapT = T.RepeatWrapping;
    ripple.repeat.set(3, 3);
    water = ripple;
    mesh(keep(lying(pond, -0.14)), keep(new T.MeshStandardMaterial({ color: "#1f6f73", roughness: 1 })), fixed, 0, 0, 0, false);
    const surface = mesh(keep(lying(pond, -0.045)), keep(new T.MeshStandardMaterial({ map: ripple, color: "#bfefff", roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.88 })), fixed, 0, 0, 0, false);
    surface.receiveShadow = true;
    // The banks: a face from the bottom up to the carpet along each edge.
    const bank: number[] = [];
    pond.forEach((a, i) => {
      const b = pond[(i + 1) % pond.length],
        ta = heightAt(hole, a.x, a.z),
        tb = heightAt(hole, b.x, b.z);
      bank.push(a.x, -0.14, a.z, b.x, -0.14, b.z, b.x, tb, b.z, a.x, -0.14, a.z, b.x, tb, b.z, a.x, ta, a.z);
    });
    const banks = new T.BufferGeometry();
    banks.setAttribute("position", new T.Float32BufferAttribute(bank, 3));
    banks.computeVertexNormals();
    mesh(keep(banks), keep(new T.MeshStandardMaterial({ color: "#8a7350", roughness: 1, side: T.DoubleSide })), fixed, 0, 0, 0, false);
    // Lily pads, clear of the bridge.
    const pad = keep(new T.CircleGeometry(0.07, 18, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2)),
      padPaint = keep(new T.MeshStandardMaterial({ color: "#4f9c3a", roughness: 0.7 })),
      bloom = keep(new T.MeshStandardMaterial({ color: "#ffb3d1", roughness: 0.6 })),
      b = boxOf(pond);
    for (const [fx, fz, s] of [
      [0.22, 0.3, 1],
      [0.8, 0.62, 0.8],
      [0.15, 0.78, 0.9],
      [0.75, 0.2, 1.1],
    ]) {
      const x = b.x0 + 0.08 + fx * (b.x1 - b.x0 - 0.16),
        z = b.z0 + 0.12 + fz * (b.z1 - b.z0 - 0.24);
      if (hole.bridges.some((br) => { const bb = boxOf(br); return x > bb.x0 - 0.1 && x < bb.x1 + 0.1; })) continue;
      const leaf = mesh(pad, padPaint, fixed, x, -0.043, z, false);
      leaf.scale.setScalar(s);
      leaf.rotation.y = fx * 9;
      if (s > 1) mesh(keep(new T.IcosahedronGeometry(0.022, 1)), bloom, fixed, x, -0.03, z, false);
    }
  });
  for (const bridge of hole.bridges) {
    // Boards across, following the arch, on two dark beams; posts down into the water at the ends.
    const b = boxOf(bridge),
      width = b.x1 - b.x0 + 0.02,
      board = keep(new T.BoxGeometry(width, 0.018, 0.062)),
      shades = [shared.wood, keep(new T.MeshStandardMaterial({ color: "#b57d47", roughness: 0.72 })), keep(new T.MeshStandardMaterial({ color: "#c99660", roughness: 0.7 }))];
    let n = 0;
    for (let z = b.z0 + 0.035; z < b.z1; z += 0.07, n++) {
      const x = (b.x0 + b.x1) / 2,
        h = heightAt(hole, x, z),
        slope = (heightAt(hole, x, z + 0.01) - heightAt(hole, x, z - 0.01)) / 0.02,
        plank = mesh(board, shades[n % 3], fixed, x, h - 0.009, z);
      plank.rotation.x = -Math.atan(slope);
    }
    for (const side of [b.x0 + 0.02, b.x1 - 0.02])
      for (const z of [b.z0 + 0.12, b.z1 - 0.12, (b.z0 + b.z1) / 2]) {
        const h = heightAt(hole, side, z),
          leg = mesh(shared.post, shared.darkWood, fixed, side, (h - 0.03 - 0.14) / 2, z);
        leg.scale.set(0.016, h + 0.11, 0.016);
      }
  }
  flatten(fixed, group, keep);
  return { group, flag, flagPaint: [poleWhite, poleRed, cloth], sails, water };
}
/** The windmill: a blue house across the green with its door, a red roof, and four sails turning in front. */
function windmill(hole: Hole, fixed: T.Group, group: T.Group, keep: Keep, shared: Parts) {
  const m = hole.windmill!,
    halfDoor = m.door / 2 - WALL,
    halfWidth = m.width / 2 + 0.06,
    height = 0.78,
    doorTop = 0.17,
    back = m.z - m.depth - 0.02,
    front = m.z + 0.02,
    depth = front - back,
    wall = keep(new T.MeshStandardMaterial({ color: "#8fd0f0", roughness: 0.6 })),
    trim = shared.white,
    roof = keep(new T.MeshStandardMaterial({ color: "#d9443a", roughness: 0.55 })),
    cz = (front + back) / 2;
  const side = halfWidth - halfDoor;
  for (const sign of [-1, 1]) mesh(keep(new T.BoxGeometry(side, height - LAWN, depth)), wall, fixed, m.x + sign * (halfDoor + side / 2), (height + LAWN) / 2, cz);
  mesh(keep(new T.BoxGeometry(halfDoor * 2, height - doorTop, depth)), wall, fixed, m.x, (height + doorTop) / 2, cz);
  // A white frame round the door and a band under the eaves.
  const frame = keep(new T.TorusGeometry(halfDoor + 0.012, 0.012, 8, 20, Math.PI));
  mesh(frame, trim, fixed, m.x, doorTop - halfDoor * 0.2, front + 0.002).scale.set(1, 0.6, 1);
  mesh(keep(new T.BoxGeometry(halfWidth * 2 + 0.04, 0.04, depth + 0.04)), trim, fixed, m.x, height, cz);
  // Two little windows.
  const glass = keep(new T.MeshStandardMaterial({ color: "#2a4a6a", roughness: 0.2, metalness: 0.3 }));
  for (const sign of [-1, 1]) {
    mesh(keep(new T.BoxGeometry(0.11, 0.13, 0.01)), trim, fixed, m.x + sign * 0.36, 0.45, front + 0.003);
    mesh(keep(new T.BoxGeometry(0.085, 0.105, 0.012)), glass, fixed, m.x + sign * 0.36, 0.45, front + 0.005);
  }
  // A gabled roof running front to back.
  const gable = new T.Shape([new T.Vector2(-halfWidth - 0.06, 0), new T.Vector2(halfWidth + 0.06, 0), new T.Vector2(0, 0.42)]);
  mesh(keep(new T.ExtrudeGeometry(gable, { depth: depth + 0.1, bevelEnabled: false })), roof, fixed, m.x, height + 0.02, back - 0.05);
  // The sails: four lattice blades round a hub, on a short axle out of the gable.
  const sails = new T.Group(),
    hubY = 0.6,
    reach = hubY - 0.02,
    spar = keep(new T.BoxGeometry(0.022, reach, 0.016)),
    cloth = keep(new T.MeshStandardMaterial({ color: "#fff6e6", roughness: 0.8 })),
    red = keep(new T.MeshStandardMaterial({ color: "#c8352d", roughness: 0.6 })),
    panel = keep(new T.BoxGeometry(0.2, reach * 0.72, 0.008)),
    slat = keep(new T.BoxGeometry(0.2, 0.012, 0.014));
  for (let i = 0; i < m.blades; i++) {
    const blade = new T.Group();
    mesh(spar, red, blade, 0, -reach / 2, 0.012);
    mesh(panel, cloth, blade, 0, -reach * 0.64, 0, false);
    for (let s = 0; s < 5; s++) mesh(slat, red, blade, 0, -reach * (0.3 + s * 0.16), 0.006);
    blade.rotation.z = (2 * Math.PI * i) / m.blades;
    sails.add(blade);
  }
  mesh(keep(new T.CylinderGeometry(0.045, 0.045, 0.05, 16).rotateX(Math.PI / 2)), red, sails, 0, 0, 0.02);
  sails.position.set(m.x, hubY, front + 0.05);
  mesh(keep(new T.CylinderGeometry(0.018, 0.018, 0.07, 10).rotateX(Math.PI / 2)), shared.darkWood, fixed, m.x, hubY, front + 0.02);
  group.add(sails);
  return sails;
}
