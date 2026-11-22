import * as T from "three";
import { capable, glossy } from "../../engine/scene-utils";

/** The character cut into each piece: Cho's in capitals, Han's in small letters. */
export const GLYPH: Record<string, string> = {
  K: "楚", A: "士", R: "車", C: "包", N: "馬", E: "象", P: "卒",
  k: "漢", a: "士", r: "車", c: "包", n: "馬", e: "象", p: "兵",
};
/** Three sizes: the general, the five middle pieces, the guards and soldiers. */
export const RADIUS: Record<string, number> = { K: 0.32, R: 0.27, C: 0.27, N: 0.27, E: 0.27, A: 0.21, P: 0.21 };
/** How tall a piece stands (its centre is half of it above the board). */
export const THICK = 0.2;
/** The ink filled into Cho's characters (blue-green) and Han's (red). */
export const INK = { cho: "#0d6157", han: "#b2261a" } as const;
const FONT =
  '"Noto Serif CJK KR", "Noto Serif KR", "AppleMyungjo", "Batang", "Songti SC", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", serif';

type Own = <R extends { dispose(): void }>(resource: R) => R;
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** The corners of the octagon a piece is cut to, `r` from its middle, with flat edges toward the players. */
function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}
/** Pale boxwood cut across the branch: faint growth rings round a heart off the middle, and pores. */
function endGrain(ctx: CanvasRenderingContext2D, size: number, seed: number) {
  const rnd = random(seed);
  ctx.fillStyle = "#ead3a2";
  ctx.fillRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(size * 0.42, size * 0.38, size * 0.05, size / 2, size / 2, size * 0.7);
  glow.addColorStop(0, "rgba(255,244,214,0.55)");
  glow.addColorStop(1, "rgba(176,128,62,0.22)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const hx = size * (0.5 + (rnd() - 0.5) * 1.6),
    hy = size * (0.5 + (rnd() - 0.5) * 1.6);
  for (let r = size * 0.03; r < size * 1.6; r += size * (0.016 + rnd() * 0.02)) {
    ctx.strokeStyle = `rgba(150,98,40,${0.05 + rnd() * 0.08})`;
    ctx.lineWidth = size * (0.002 + rnd() * 0.004);
    ctx.beginPath();
    ctx.ellipse(hx, hy, r, r * (0.92 + rnd() * 0.1), rnd() * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < size * 1.5; i++) {
    ctx.fillStyle = `rgba(120,80,30,${0.05 + rnd() * 0.08})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
}
/** Side grain of the same wood, running round the piece. */
function sideGrain(own: Own) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!,
    rnd = random(5);
  ctx.fillStyle = "#e2c48c";
  ctx.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 64;
    ctx.strokeStyle = `rgba(140,90,36,${0.05 + rnd() * 0.12})`;
    ctx.lineWidth = 0.6 + rnd() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 1.6);
    ctx.stroke();
  }
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/**
 * The face of a piece: boxwood with the character and a thin octagonal line cut in and filled with lacquer. The cut
 * is drawn with its upper wall in shadow and its lower lip catching the light; where a graphics card draws, a relief
 * map sinks it as well.
 */
function face(piece: string, own: Own, relief: boolean) {
  const size = relief ? 512 : 256,
    k = size / 160,
    colour = piece === piece.toUpperCase() ? INK.cho : INK.han,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  endGrain(ctx, size, piece.charCodeAt(0) * 7 + 3);
  const mid = size / 2,
    glyphAt = (g: CanvasRenderingContext2D, dx = 0, dy = 0) => {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.font = `700 ${Math.round(84 * k)}px ${FONT}`;
      g.fillText(GLYPH[piece], mid + dx, mid + 5 * k + dy);
      g.lineWidth = 2.2 * k;
      octagon(g, mid + dx, mid + dy, 66 * k);
      g.stroke();
    };
  // The lacquer in the cut.
  ctx.fillStyle = ctx.strokeStyle = colour;
  glyphAt(ctx);
  // Its shading: the shadow under the upper wall, the light on the lower lip.
  const sliver = (dx: number, dy: number, tint: string, alpha: number) => {
    const s = document.createElement("canvas");
    s.width = s.height = size;
    const g = s.getContext("2d")!;
    g.fillStyle = g.strokeStyle = tint;
    glyphAt(g);
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = g.strokeStyle = "#000";
    glyphAt(g, dx, dy);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s, 0, 0);
    ctx.globalAlpha = 1;
  };
  sliver(2.6 * k, 2.6 * k, "#1a0d06", 0.55);
  sliver(-1.6 * k, -1.6 * k, "#fff3d6", 0.28);
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  if (!relief) return { map };
  const b = document.createElement("canvas");
  b.width = b.height = size;
  const g = b.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.filter = `blur(${1.2 * k}px)`;
  g.fillStyle = g.strokeStyle = "#202020";
  glyphAt(g);
  const bumpMap = own(new T.CanvasTexture(b));
  return { map, bumpMap, bumpScale: 1.6 };
}
/**
 * An octagonal piece of radius `r`: slightly narrower at the top, its upper edge chamfered. Group 0 is the face
 * (top and underside), group 1 the sides; the face is mapped so that at no turn the character reads from −z.
 */
function shape(r: number) {
  const outline = new T.Shape(),
    bevel = 0.026;
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4,
      p = [Math.cos(a) * (r - bevel), Math.sin(a) * (r - bevel)] as const;
    if (i) outline.lineTo(...p);
    else outline.moveTo(...p);
  }
  outline.closePath();
  const geometry = new T.ExtrudeGeometry(outline, {
    depth: THICK - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -THICK / 2 + bevel, 0);
  const position = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  geometry.computeBoundingBox();
  const groups = geometry.groups;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i),
      // The sides lean in a little toward the top.
      lean = 1 - 0.05 * ((y + THICK / 2) / THICK);
    position.setXYZ(i, x * lean, y, z * lean);
    const cap = groups.some((g) => g.materialIndex === 0 && i >= g.start && i < g.start + g.count);
    if (cap) uv.setXY(i, 0.5 - (x * lean) / (2 * r), 0.5 + (z * lean) / (2 * r));
    else uv.setXY(i, (Math.atan2(x, z) / (Math.PI * 2)) * 2 + 0.5, (y + THICK / 2) * 2);
  }
  geometry.computeVertexNormals();
  return geometry;
}
/** Every piece's shapes and lacquered materials, made once a table and freed with it. */
export class PieceKit {
  private geometries = new Map<string, T.BufferGeometry>();
  private faces = new Map<string, T.Material>();
  private side: T.Material;
  private owned: { dispose(): void }[] = [];
  private relief = capable();
  constructor() {
    const own: Own = (r) => (this.owned.push(r), r);
    this.side = own(glossy({ map: sideGrain(own), roughness: 0.46 }, 0.4));
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  geometry(kind: string) {
    let g = this.geometries.get(kind);
    if (!g) this.geometries.set(kind, (g = this.own(shape(RADIUS[kind] * 1.05))));
    return g;
  }
  materials(piece: string): T.Material[] {
    let top = this.faces.get(piece);
    if (!top) {
      top = this.own(glossy({ ...face(piece, (r) => this.own(r), this.relief), roughness: 0.46 }, 0.4));
      this.faces.set(piece, top);
    }
    return [top, this.side];
  }
  dispose() {
    for (const r of this.owned) r.dispose();
    this.owned = [];
  }
}
