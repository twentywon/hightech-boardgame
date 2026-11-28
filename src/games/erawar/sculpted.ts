import * as T from "three";
import type { Own } from "../goldraid/paint";

/**
 * 시대 전쟁's units as Blender made them. The mounts, machines and weapons Blender sculpted (tools/blender/erawar/units,
 * README.md there): one GLB per unit with a primitive per game paint, every vertex carrying the two joints that move
 * it and Cycles' baked light; the game skins them on its own jointed pivots and paints each with its own paint. The
 * people are artist-made (tools/blender/erawar/assets: Quaternius' CC0 base characters and outfits, see
 * public/models-license.txt): the same kind of GLB, but each part wears the pack's own picture (or a game paint for
 * what Blender added), and its vertices carry that picture's colour for each side as well, for the processor's draw.
 */
const files = import.meta.glob<string>("../../assets/models/erawar/units/*.glb", { query: "?inline", import: "default", eager: true });

export interface SculptedPart {
  /** The game's paint ("team" and "teamDark" take the side's). */
  paint: string;
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  /** Two joints per vertex, the first's weight, the baked light (0..255). */
  joints: Uint16Array;
  weights: Float32Array;
  light: Uint8Array;
  index: Uint16Array | Uint32Array;
  /** An artist-made person's: its picture's colour at each vertex, for side 0 and side 1 (RGBA, sRGB). */
  colors?: [Uint8Array, Uint8Array];
  /** Its picture takes the side's colour (a variant per side), and a tint over the picture (the hair's). */
  team?: boolean;
  tint?: number[];
}
export interface Sculpted {
  bones: string[];
  parts: SculptedPart[];
  /** An artist-made person's joints (where its bones' heads are, in the figure's frame). */
  joints?: Record<string, [number, number, number]> & { shieldBasis?: number[] };
}

interface Doc {
  asset: { extras?: { bones?: string[]; joints?: Record<string, [number, number, number]> } };
  nodes: { name: string; mesh: number; extras: { lo: number[]; hi: number[]; team?: boolean; tint?: number[] } }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
  accessors: { bufferView: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function bytes(url: string) {
  const text = atob(url.slice(url.indexOf(",") + 1)),
    out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}
/** Reads one of the units' GLBs (tools/blender/erawar/units/lib.py `write_glb`), synchronously. */
export function readSculpted(data: Uint8Array): Sculpted {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
    jsonLength = view.getUint32(12, true),
    doc = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + jsonLength))) as Doc,
    bin = new DataView(data.buffer, data.byteOffset + 20 + jsonLength + 8);
  /** An accessor's components as numbers (strided as its view says). */
  const read = (index: number) => {
    const a = doc.accessors[index],
      bv = doc.bufferViews[a.bufferView],
      width = WIDTH[a.type],
      size = SIZE[a.componentType],
      stride = bv.byteStride ?? width * size,
      base = bv.byteOffset ?? 0,
      out = new Float64Array(a.count * width);
    for (let i = 0; i < a.count; i++)
      for (let c = 0; c < width; c++) {
        const at = base + i * stride + c * size;
        out[i * width + c] =
          a.componentType === 5120
            ? bin.getInt8(at)
            : a.componentType === 5121
              ? bin.getUint8(at)
              : a.componentType === 5122
                ? bin.getInt16(at, true)
                : a.componentType === 5123
                  ? bin.getUint16(at, true)
                  : a.componentType === 5125
                    ? bin.getUint32(at, true)
                    : bin.getFloat32(at, true);
      }
    return { out, count: a.count };
  };
  const parts: SculptedPart[] = doc.nodes.map((node) => {
    const p = doc.meshes[node.mesh].primitives[0],
      { lo, hi } = node.extras,
      q = read(p.attributes.POSITION),
      n = q.count,
      position = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) {
      const c = i % 3;
      position[i] = ((q.out[i] + 32768) / 65535) * (hi[c] - lo[c]) + lo[c];
    }
    const nq = read(p.attributes.NORMAL).out,
      normal = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = nq[i * 3] / 127,
        y = nq[i * 3 + 1] / 127,
        z = nq[i * 3 + 2] / 127,
        l = Math.hypot(x, y, z) || 1;
      normal[i * 3] = x / l;
      normal[i * 3 + 1] = y / l;
      normal[i * 3 + 2] = z / l;
    }
    const uq = read(p.attributes.TEXCOORD_0).out,
      uv = new Float32Array(n * 2);
    for (let i = 0; i < n * 2; i++) uv[i] = uq[i] / 4096;
    const s = read(p.attributes._SKIN).out,
      joints = new Uint16Array(n * 4),
      weights = new Float32Array(n * 4),
      light = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      joints[i * 4] = s[i * 4];
      joints[i * 4 + 1] = s[i * 4 + 1];
      const w = s[i * 4 + 2] / 255;
      weights[i * 4] = w;
      weights[i * 4 + 1] = 1 - w;
      light[i * 3] = light[i * 3 + 1] = light[i * 3 + 2] = s[i * 4 + 3];
    }
    const ix = read(p.indices),
      index = n > 65535 ? new Uint32Array(ix.out) : new Uint16Array(ix.out),
      c0 = p.attributes.COLOR_0,
      c1 = p.attributes.COLOR_1 ?? c0,
      colors = c0 === undefined ? undefined : ([new Uint8Array(read(c0).out), new Uint8Array(read(c1).out)] as [Uint8Array, Uint8Array]);
    return { paint: node.name, position, normal, uv, joints, weights, light, index, colors, team: node.extras.team, tint: node.extras.tint };
  });
  return { bones: doc.asset.extras?.bones ?? [], parts, joints: doc.asset.extras?.joints };
}

const people = import.meta.glob<string>("../../assets/models/erawar/people/*.glb", { query: "?inline", import: "default", eager: true }),
  pictures = import.meta.glob<string>(["../../assets/models/erawar/people/tex/*.webp", "../../assets/models/erawar/units/tex/*.webp"], { query: "?inline", import: "default", eager: true });
const cache = new Map<string, Sculpted | null>();
/**
 * A person made from artist-made models (tools/blender/erawar/assets/people.py: Quaternius' CC0 base characters and
 * outfits), lit (`lo` false) or thinned for the processor's drawing. Null when there is none.
 */
export function artistPerson(era: number, kind: number, lo: boolean): Sculpted | null {
  const key = `a${era}${kind}${lo ? "l" : ""}`;
  if (!cache.has(key)) {
    const url = Object.entries(people).find(([path]) => path.endsWith(`/${key}.glb`))?.[1];
    cache.set(key, url ? readSculpted(bytes(url)) : null);
  }
  return cache.get(key)!;
}
const images = new Map<string, HTMLImageElement>();
/** Whether there is a picture of that name (the mammoth's relief, `mammoth_n`). */
export function hasPicture(name: string) {
  return Object.keys(pictures).some((path) => path.endsWith(`/${name}.webp`));
}
/**
 * One of the people's pictures (sRGB; with `data`, a normal map's raw numbers), loaded once (the texture updates
 * itself when its picture has come).
 */
export function personPicture(own: Own, name: string, data = false): T.Texture {
  const url = Object.entries(pictures).find(([path]) => path.endsWith(`/${name}.webp`))?.[1];
  const map = own(new T.Texture());
  map.colorSpace = data ? T.NoColorSpace : T.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = 4;
  if (!url || typeof Image === "undefined") return map;
  let image = images.get(name);
  if (!image) {
    image = new Image();
    image.src = url;
    images.set(name, image);
  }
  map.image = image;
  if (image.complete && image.naturalWidth) map.needsUpdate = true;
  else image.addEventListener("load", () => (map.needsUpdate = true), { once: true });
  return map;
}
/**
 * An artist-made part's shape: with `side` its picture's colour (that side's) times the baked light in its vertices,
 * for one merged vertex-coloured draw; without, the light alone (its picture does the rest).
 */
export function personGeometry(own: Own, p: SculptedPart, side?: number, paint?: T.Color) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(p.position, 3));
  g.setAttribute("normal", new T.BufferAttribute(p.normal, 3));
  g.setAttribute("uv", new T.BufferAttribute(p.uv, 2));
  g.setAttribute("skinIndex", new T.BufferAttribute(p.joints, 4));
  g.setAttribute("skinWeight", new T.BufferAttribute(p.weights, 4));
  const n = p.light.length / 3;
  if (side === undefined) g.setAttribute("color", new T.BufferAttribute(p.light, 3, true));
  else {
    const rgb = new Float32Array(n * 3),
      c = p.colors?.[side],
      lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    for (let i = 0; i < n; i++) {
      const l = p.light[i * 3] / 255;
      for (let k = 0; k < 3; k++) rgb[i * 3 + k] = (c && !paint ? lin(c[i * 4 + k] / 255) * (p.tint?.[k] ?? 1) : (paint ? [paint.r, paint.g, paint.b][k] : 1)) * l;
    }
    g.setAttribute("color", new T.BufferAttribute(rgb, 3));
  }
  g.setIndex(new T.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  return own(g);
}
/** A unit Blender sculpted, by its file's name (b0 the mammoth: its skin wears a picture, as the people's do, see mammoth.py), b1 the horse, m2 the gun, m3 the tank, w<era><kind> a weapon. */
export function sculptedModel(key: string): Sculpted | null {
  if (!cache.has(key)) {
    const url = Object.entries(files).find(([path]) => path.endsWith(`/${key}.glb`))?.[1];
    cache.set(key, url ? readSculpted(bytes(url)) : null);
  }
  return cache.get(key)!;
}

/** A part's shape for three: positions, normals, uvs, the joints, and the baked light as its colour. */
export function partGeometry(own: Own, p: SculptedPart, tint?: T.Color) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(p.position, 3));
  g.setAttribute("normal", new T.BufferAttribute(p.normal, 3));
  g.setAttribute("uv", new T.BufferAttribute(p.uv, 2));
  g.setAttribute("skinIndex", new T.BufferAttribute(p.joints, 4));
  g.setAttribute("skinWeight", new T.BufferAttribute(p.weights, 4));
  if (tint) {
    // (Where the processor draws, every paint's colour goes into the vertices, times the light.)
    const rgb = new Float32Array(p.light.length);
    for (let i = 0; i < rgb.length; i += 3) {
      const l = p.light[i] / 255;
      rgb[i] = tint.r * l;
      rgb[i + 1] = tint.g * l;
      rgb[i + 2] = tint.b * l;
    }
    g.setAttribute("color", new T.BufferAttribute(rgb, 3));
  } else g.setAttribute("color", new T.BufferAttribute(p.light, 3, true));
  g.setIndex(new T.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  return own(g);
}

/**
 * The triangles of a part that sit on one joint (a weapon's, a shield's), as a plain shape in that joint's own frame,
 * its baked light as its colour (or, with `tint`, that colour times the light). Null when none do.
 */
export function rigidGeometry(own: Own, p: SculptedPart, bone: number, tint?: T.Color) {
  const n = p.position.length / 3,
    remap = new Int32Array(n).fill(-1),
    tri: number[] = [];
  let count = 0;
  for (let t = 0; t < p.index.length; t += 3) {
    const a = p.index[t],
      b = p.index[t + 1],
      c = p.index[t + 2];
    if (p.joints[a * 4] !== bone) continue;
    for (const v of [a, b, c]) {
      if (remap[v] < 0) remap[v] = count++;
      tri.push(remap[v]);
    }
  }
  if (!tri.length) return null;
  const position = new Float32Array(count * 3),
    normal = new Float32Array(count * 3),
    uv = new Float32Array(count * 2),
    color = new Float32Array(count * 3);
  for (let v = 0; v < n; v++) {
    const i = remap[v];
    if (i < 0) continue;
    for (let c = 0; c < 3; c++) {
      position[i * 3 + c] = p.position[v * 3 + c];
      normal[i * 3 + c] = p.normal[v * 3 + c];
    }
    uv[i * 2] = p.uv[v * 2];
    uv[i * 2 + 1] = p.uv[v * 2 + 1];
    const l = p.light[v * 3] / 255;
    color[i * 3] = (tint?.r ?? 1) * l;
    color[i * 3 + 1] = (tint?.g ?? 1) * l;
    color[i * 3 + 2] = (tint?.b ?? 1) * l;
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(position, 3));
  g.setAttribute("normal", new T.BufferAttribute(normal, 3));
  g.setAttribute("uv", new T.BufferAttribute(uv, 2));
  g.setAttribute("color", new T.BufferAttribute(color, 3));
  g.setIndex(tri);
  g.computeBoundingSphere();
  return own(g);
}
