import * as T from "three";
import { block, capable, glossy } from "../../engine/scene-utils";

/**
 * The yacht table's things that are handled: ivory dice with rounded edges and pips sunk into their faces, and the
 * leather cup they are shaken in and thrown from. All painted and turned in code.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
export const SIZE = 0.84;
// Material slot → face value; opposite faces add up to seven.
export const FACES = [3, 4, 1, 6, 2, 5];
const SPOTS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};
function canvas(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** Where a face's pips are (centre and radius in pixels of a face `size` across). */
function pips(value: number, size: number) {
  const at = [0.25, 0.5, 0.75].map((f) => f * size),
    r = (value === 1 ? 0.15 : 0.085) * size;
  return SPOTS[value].map(([x, y]) => ({ x: at[x], y: at[y], r }));
}
/**
 * A face of a die: ivory with a faint warmth toward the edge, each pip a dimple filled with paint, its upper wall in
 * shade and its lower lip catching the light. The single pip is large and red, as on many East Asian dice.
 */
function faceMap(value: number, own: Own, size: number) {
  const { c, ctx } = canvas(size),
    rnd = random(value * 13);
  ctx.fillStyle = "#f7f1e3";
  ctx.fillRect(0, 0, size, size);
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.72);
  edge.addColorStop(0, "rgba(255,255,255,0)");
  edge.addColorStop(1, "rgba(196,176,140,0.35)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 2; i++) {
    ctx.fillStyle = `rgba(150,130,100,${rnd() * 0.06})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  for (const { x, y, r } of pips(value, size)) {
    const paint = value === 1 ? "#c0291b" : "#17181b";
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // The shade under the upper wall of the dimple.
    const shade = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    shade.addColorStop(0, "rgba(0,0,0,0.55)");
    shade.addColorStop(0.5, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(255,255,255,0.22)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // A bright lip on the far side of the rim, where the light comes over it.
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.02, Math.PI * 0.1, Math.PI * 0.6);
    ctx.stroke();
    ctx.strokeStyle = "rgba(90,70,40,0.35)";
    ctx.beginPath();
    ctx.arc(x, y, r * 1.04, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
  }
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The dimples as a relief: a normal map worked out from a height field of spherical hollows. */
function faceRelief(value: number, own: Own, size: number) {
  const height = new Float32Array(size * size),
    spots = pips(value, size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let h = 0;
      for (const p of spots) {
        const d = Math.hypot(x - p.x, y - p.y) / p.r;
        if (d < 1) h = Math.min(h, -Math.sqrt(1 - d * d) * p.r * 0.55);
      }
      height[y * size + x] = h;
    }
  const { c, ctx } = canvas(size),
    image = ctx.createImageData(size, size),
    at = (x: number, y: number) => height[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 2,
        dy = (at(x, y + 1) - at(x, y - 1)) / 2,
        n = new T.Vector3(-dx, dy, 1).normalize(),
        i = (y * size + x) * 4;
      image.data[i] = (n.x * 0.5 + 0.5) * 255;
      image.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      image.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  return own(new T.CanvasTexture(c));
}
/** The dice's shape (rounded a little more than a board) and one material a face. */
export function diceKit(own: Own) {
  const rich = capable(),
    size = rich ? 256 : 128;
  return {
    geometry: own(block(SIZE, SIZE, SIZE, 0.09, 3)),
    materials: FACES.map((value) =>
      own(
        glossy(
          {
            map: faceMap(value, own, size),
            ...(rich ? { normalMap: faceRelief(value, own, 128), normalScale: new T.Vector2(1.2, 1.2) } : {}),
            roughness: 0.34,
          },
          0.55,
        ),
      ),
    ),
  };
}

/** Pebbled brown leather with a stitched band under the rim and one stitched seam up the side. */
function leather(own: Own, relief: boolean) {
  const W = 512,
    H = 256,
    { c, ctx } = canvas(W, H),
    rnd = random(77);
  ctx.fillStyle = "#4e2a18";
  ctx.fillRect(0, 0, W, H);
  // Worn lighter where hands hold it, darker toward the foot.
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(150,86,46,0.35)");
  shade.addColorStop(0.5, "rgba(120,66,34,0.15)");
  shade.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * W,
      y = 70 + rnd() * (H - 90),
      r = 20 + rnd() * 50,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rnd() < 0.5 ? "rgba(140,80,44,0.18)" : "rgba(30,14,6,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(24,10,4,0.12)" : "rgba(150,96,60,0.08)";
    ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5);
  }
  // v runs up the cup: a tooled band under the rim with a row of stitches above and below it.
  const band = (g: CanvasRenderingContext2D, fill: string, thread: string) => {
    g.fillStyle = fill;
    g.fillRect(0, 14, W, 40);
    g.strokeStyle = thread;
    g.lineWidth = 2.5;
    g.setLineDash([8, 6]);
    for (const y of [10, 58]) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    g.setLineDash([]);
  };
  band(ctx, "rgba(28,12,4,0.4)", "#d9b77a");
  // A tooled zigzag in the band.
  ctx.strokeStyle = "rgba(200,150,90,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, x % 32 ? 22 : 46);
  ctx.stroke();
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = T.RepeatWrapping;
  map.repeat.x = 2;
  if (!relief) return { map };
  const b = canvas(W, H);
  b.ctx.fillStyle = "#808080";
  b.ctx.fillRect(0, 0, W, H);
  const r2 = random(78);
  for (let i = 0; i < 5000; i++) {
    b.ctx.fillStyle = r2() < 0.5 ? "#747474" : "#8c8c8c";
    b.ctx.beginPath();
    b.ctx.arc(r2() * W, r2() * H, 0.8 + r2() * 1.4, 0, Math.PI * 2);
    b.ctx.fill();
  }
  band(b.ctx, "#6a6a6a", "#b0b0b0");
  const bumpMap = own(new T.CanvasTexture(b.c));
  bumpMap.wrapS = T.RepeatWrapping;
  bumpMap.repeat.x = 2;
  return { map, bumpMap, bumpScale: 0.8 };
}
/** The cup's measures: its height and the radius of its mouth. */
export const CUP = { height: 1.68, mouth: 1.13, floor: 0.12 };
/**
 * A leather dice cup turned from one profile (outside up to a rolled rim, inside down to its floor), lined with green
 * felt at the bottom. Its origin is the middle of its foot.
 */
export function diceCup(own: Own) {
  const rich = capable(),
    profile = [
      [0, 0], [0.98, 0], [1.04, 0.03], [1.07, 0.12], [1.12, 1.52], [1.19, 1.56], [1.22, 1.62], [1.19, 1.68], [1.13, 1.68],
      [1.08, 1.62], [1.02, 0.2], [0.96, CUP.floor], [0, CUP.floor],
    ].map(([r, y]) => new T.Vector2(r, y)),
    shell = own(new T.LatheGeometry(profile, rich ? 40 : 24)),
    cup = new T.Group(),
    skin = new T.Mesh(shell, own(new T.MeshStandardMaterial({ ...leather(own, rich), roughness: 0.5 }))),
    lining = new T.Mesh(own(new T.CircleGeometry(0.97, 24)), own(new T.MeshStandardMaterial({ color: "#1d4d3c", roughness: 1 })));
  // The leather's picture runs up the cup by height, inside as outside, its stitched band just under the rim.
  const at = shell.getAttribute("position"),
    uv = shell.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setY(i, at.getY(i) / CUP.height);
  skin.castShadow = true;
  skin.receiveShadow = true;
  lining.rotation.x = -Math.PI / 2;
  lining.position.y = CUP.floor + 0.004;
  cup.add(skin, lining);
  return cup;
}
