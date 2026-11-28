import * as T from "three";
import type { Own } from "../goldraid/paint";

/**
 * What Blender baked for 시대 전쟁 (tools/blender/erawar, README.md there).
 *
 * The land behind the lane is Blender's own (`bakedLand`); the units Blender sculpted are read by `sculpted.ts`.
 */

function bytes(url: string) {
  const text = atob(url.slice(url.indexOf(",") + 1)),
    out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}
interface Gltf {
  nodes: { name?: string; mesh?: number }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
/** The shapes of one GLB by node name, read synchronously from its JSON and binary chunks. */
function readGlb(data: Uint8Array): Map<string, T.BufferGeometry> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
    jsonLength = view.getUint32(12, true),
    json = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + jsonLength))) as Gltf,
    binStart = 20 + jsonLength + 8,
    bin = data.buffer.slice(data.byteOffset + binStart, data.byteOffset + data.byteLength);
  const read = (index: number) => {
    const a = json.accessors[index],
      bv = json.bufferViews[a.bufferView],
      offset = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0),
      n = a.count * WIDTH[a.type];
    if (a.componentType === 5126) return new Float32Array(bin, offset, n);
    if (a.componentType === 5123) return new Uint16Array(bin, offset, n);
    if (a.componentType === 5125) return new Uint32Array(bin, offset, n);
    throw new Error(`componentType ${a.componentType}`);
  };
  const out = new Map<string, T.BufferGeometry>();
  for (const node of json.nodes) {
    if (node.mesh === undefined || !node.name) continue;
    const p = json.meshes[node.mesh].primitives[0],
      g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(read(p.attributes.POSITION), 3));
    if (p.attributes.NORMAL !== undefined) g.setAttribute("normal", new T.BufferAttribute(read(p.attributes.NORMAL), 3));
    if (p.attributes.TEXCOORD_0 !== undefined) g.setAttribute("uv", new T.BufferAttribute(read(p.attributes.TEXCOORD_0), 2));
    if (p.indices !== undefined) g.setIndex(new T.BufferAttribute(read(p.indices), 1));
    out.set(node.name, g);
  }
  return out;
}

const land = import.meta.glob<string>("../../assets/models/erawar/terrain.{glb,webp}", { query: "?inline", import: "default", eager: true });
let landImage: HTMLImageElement | null = null;
/**
 * The land behind the lane as Blender made it (tools/blender/erawar/terrain.py): rolling hills rising into a snowy
 * range, its paint and self-shade baked into one picture; drawn with one plain paint. Null when it is not there.
 */
/** How much of the era's fog lies over the far range (1: all of it). */
export const LAND_HAZE = 0.35;
/** How tall the range stands against Blender's own (lower, so the sky and its snowy tops show over the lane). */
export const LAND_TALL = 0.72;
export function bakedLand(own: Own): T.Mesh | null {
  const glb = Object.entries(land).find(([p]) => p.endsWith(".glb"))?.[1],
    pic = Object.entries(land).find(([p]) => p.endsWith(".webp"))?.[1];
  if (!glb || !pic || typeof Image === "undefined") return null;
  const shape = readGlb(bytes(glb)).get("Terrain");
  if (!shape) return null;
  if (!landImage) {
    landImage = new Image();
    landImage.src = pic;
  }
  const image = landImage,
    map = own(new T.Texture(image));
  map.colorSpace = T.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = 4;
  if (image.complete && image.naturalWidth) map.needsUpdate = true;
  else image.addEventListener("load", () => (map.needsUpdate = true), { once: true });
  // (A sheen-less standard paint, so that the sky's own light fills its shaded sides as it does the rest.)
  const paint = own(new T.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }));
  // The haze takes only part of the far range: its peaks stand where the era's fog is already thick, and with the whole
  // of it they faded into a grey wall in the brighter eras' light (중세, 화약), hiding their snow and rock.
  paint.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      T.ShaderChunk.fog_fragment.replace("fogColor, fogFactor", `fogColor, fogFactor * ${LAND_HAZE.toFixed(2)}`),
    );
  };
  paint.customProgramCacheKey = () => "erawar-land-haze";
  const mesh = new T.Mesh(own(shape), paint);
  mesh.scale.y = LAND_TALL;
  mesh.receiveShadow = false;
  return mesh;
}
