import * as T from "three";
import type { Own } from "../goldraid/paint";

/**
 * What Blender baked for 시대 전쟁 (tools/blender/erawar, README.md there).
 *
 * The units keep the game's own shapes and paints; Blender adds the soft shade each moving part throws on itself (the
 * inside of a helmet, under a collar, between straps and folds, where a sleeve meets a glove), baked by Cycles into
 * one byte of light per vertex of every mesh (`shade`). The land behind the lane is Blender's own (`bakedLand`).
 */
const shades = import.meta.glob<Record<string, { n: number; ao: string }>>("../../assets/models/erawar/ao/u*.json", { import: "default", eager: true });

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

/**
 * A unit's meshes in the order the bake names them (m0, m1, …): every visible mesh that is a jointed group's own part,
 * found depth first, but the tank's running tracks (and the life bar, star and shadow patch, which come after).
 */
export function aoMeshes(root: T.Object3D) {
  const out: T.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh && o.parent instanceof T.Group && o.visible && !o.name.startsWith("track#") && !/^(bar|barBack|star)#/.test(o.name)) out.push(o);
  });
  return out;
}
/** The baked light of a unit's meshes, in `aoMeshes` order (null where there is none). */
function lightOf(era: number, kind: number) {
  const data = Object.entries(shades).find(([path]) => path.endsWith(`/u${era}${kind}.json`))?.[1];
  if (!data) return null;
  const list: { n: number; ao: string }[] = [];
  for (const [name, v] of Object.entries(data)) list[Number(/^m(\d+)_/.exec(name)?.[1] ?? -1)] = v;
  return list;
}
/** Per kit: the paints that take a vertex's baked light, one for each paint that needs it. */
export class Shade {
  private lit = new Map<T.Material, T.Material>();
  constructor(private readonly own: Own) {}
  /**
   * Multiplies Blender's baked light into the vertices of a unit template's meshes (each gets its own copy of its
   * shape, with the light as its vertex colour, and a copy of its paint that reads it). A mesh whose vertices do not
   * match the bake (built otherwise, as where the processor draws) is left as it was. Returns how many were shaded.
   */
  apply(root: T.Object3D, era: number, kind: number) {
    const light = lightOf(era, kind);
    if (!light) return 0;
    let done = 0;
    aoMeshes(root).forEach((mesh, i) => {
      const entry = light[i],
        g = mesh.geometry,
        paint = mesh.material;
      if (!entry || Array.isArray(paint) || g.getAttribute("position").count !== entry.n || g.getAttribute("color") || (paint as T.MeshStandardMaterial).vertexColors) return;
      const values = bytes(`,${entry.ao}`),
        rgb = new Uint8Array(entry.n * 3);
      for (let k = 0; k < entry.n; k++) rgb[k * 3] = rgb[k * 3 + 1] = rgb[k * 3 + 2] = values[k];
      const own = this.own(g.clone());
      own.setAttribute("color", new T.BufferAttribute(rgb, 3, true));
      mesh.geometry = own;
      let lit = this.lit.get(paint);
      if (!lit) {
        lit = this.own(paint.clone());
        (lit as T.MeshStandardMaterial).vertexColors = true;
        this.lit.set(paint, lit);
      }
      mesh.material = lit;
      done++;
    });
    return done;
  }
}

const land = import.meta.glob<string>("../../assets/models/erawar/terrain.{glb,webp}", { query: "?inline", import: "default", eager: true });
let landImage: HTMLImageElement | null = null;
/**
 * The land behind the lane as Blender made it (tools/blender/erawar/terrain.py): rolling hills rising into a snowy
 * range, its paint and self-shade baked into one picture; drawn with one plain paint. Null when it is not there.
 */
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
  const mesh = new T.Mesh(own(shape), own(new T.MeshStandardMaterial({ map, roughness: 1, metalness: 0 })));
  mesh.receiveShadow = false;
  return mesh;
}
