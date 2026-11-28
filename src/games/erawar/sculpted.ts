import * as T from "three";
import type { Own } from "../goldraid/paint";

/**
 * 시대 전쟁's people as Blender sculpted them (tools/blender/erawar/units, README.md there): for each era and kind one
 * GLB with a primitive per paint, every vertex carrying the two joints that move it (the body, a leg and its knee, the
 * chest, the head, an arm and its elbow) and Cycles' baked light. The game skins them on its own jointed pivots, so
 * that a limb bends at the knee or the elbow without a gap, and paints each with its own paint (the side's colour on
 * the coat, the photographed stuffs on cloth, leather and steel).
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
}
export interface Sculpted {
  bones: string[];
  parts: SculptedPart[];
}

interface Doc {
  asset: { extras?: { bones?: string[] } };
  nodes: { name: string; mesh: number; extras: { lo: number[]; hi: number[] } }[];
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
      index = n > 65535 ? new Uint32Array(ix.out) : new Uint16Array(ix.out);
    return { paint: node.name, position, normal, uv, joints, weights, light, index };
  });
  return { bones: doc.asset.extras?.bones ?? [], parts };
}

const cache = new Map<string, Sculpted | null>();
/** The person Blender sculpted for an era and kind (null when there is none). */
export const sculptedPerson = (era: number, kind: number) => sculptedModel(`p${era}${kind}`);
/** A unit Blender sculpted, by its file's name: p<era><kind> a person, b0 the mammoth, b1 the horse. */
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
