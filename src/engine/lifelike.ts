import * as T from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { capable, picture, surface } from "./scene-utils";
import skyUrl from "../assets/env/sky.hdr?inline";
import saloonUrl from "../assets/env/saloon.hdr?inline";

/**
 * The lifelike look (the user asked why the 3D looked polygonal, and then for it on every device): shapes cut much
 * finer and shaded smooth, cloth, leather and metal from photographs with their relief and sheen, light from a real
 * place (an HDRI) for the soft shaded sides and the reflections, soft shadows and film-like tone.
 *
 * One switch decides where it is drawn: `EVERYWHERE` (the user's choice for now: "없는 기기도 상관없이 일단은 나오게 해줘")
 * draws it on every device, the processor-drawn ones too; set it false to keep it to devices with a graphics card
 * again (the cheap look then comes back where the processor draws). The games that have it read `lifelike()`.
 *
 * Photographs and the two HDRIs are Poly Haven's, CC0 (see public/textures-license.txt).
 */
export const EVERYWHERE = true;
/** Whether the lifelike look is drawn on this device. */
export const lifelike = () => EVERYWHERE || capable();
/** How much finer than the old full cut code-built shapes are cut where the look is drawn. */
export const DETAIL = 1.6;

type Own = <R extends { dispose(): void }>(resource: R) => R;

// ─────────────── Smooth shading ───────────────
/**
 * Normals averaged over every vertex at one place, across seams of the picture or of the pieces a shape was merged
 * from, so a sculpted shape shades as one smooth skin instead of facets. Creases sharper than `crease` radians keep
 * their edge (a box's corners, a hat's brim).
 */
export function smooth<G extends T.BufferGeometry>(geometry: G, crease = 1.1): G {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const pos = geometry.getAttribute("position") as T.BufferAttribute,
    nor = geometry.getAttribute("normal") as T.BufferAttribute,
    n = pos.count,
    key = (i: number) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`,
    groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let list = groups.get(k);
    if (!list) groups.set(k, (list = []));
    list.push(i);
  }
  const limit = Math.cos(crease),
    out = new Float32Array(n * 3),
    a = new T.Vector3(),
    b = new T.Vector3(),
    sum = new T.Vector3();
  for (const list of groups.values())
    for (const i of list) {
      a.fromBufferAttribute(nor, i);
      sum.set(0, 0, 0);
      for (const j of list) {
        b.fromBufferAttribute(nor, j);
        if (a.dot(b) >= limit) sum.add(b);
      }
      if (sum.lengthSq() < 1e-12) sum.copy(a);
      sum.normalize();
      out[i * 3] = sum.x;
      out[i * 3 + 1] = sum.y;
      out[i * 3 + 2] = sum.z;
    }
  geometry.setAttribute("normal", new T.BufferAttribute(out, 3));
  return geometry;
}

// ─────────────── Photographed stuffs ───────────────
/** The stuffs photographed: each a grey picture of its figure (to be tinted), its relief and its roughness. */
export type Stuff = "wool" | "linen" | "leather" | "metal";
const SHEEN: Record<Stuff, { roughness: number; metalness: number; relief: number }> = {
  wool: { roughness: 1, metalness: 0, relief: 0.9 },
  linen: { roughness: 1, metalness: 0, relief: 0.8 },
  leather: { roughness: 0.95, metalness: 0, relief: 0.7 },
  metal: { roughness: 0.85, metalness: 0.85, relief: 0.5 },
};
/** The mean of the grey pictures (they were levelled to it), by which a tint is lifted so that it keeps its colour. */
const MEAN = 0.78;
/**
 * A material's settings for a part made of `stuff` in the colour `tone`: the photograph's figure tinted to the colour,
 * its relief and roughness, `tile` metres to a repeat on a part laid out at true size (the figures' parts have
 * picture coordinates round them, so `across`/`down` say how many repeats go round and along).
 */
export function made(own: Own, stuff: Stuff, tone: T.ColorRepresentation, across = 2, down = across, o: { relief?: number; roughness?: number; metalness?: number; figure?: boolean } = {}): T.MeshStandardMaterialParameters {
  const sheen = SHEEN[stuff],
    color = new T.Color(tone),
    relief = (o.relief ?? 1) * sheen.relief;
  // The grey figure darkens by its mean: the colour is lifted by as much (three's colours may go past 1).
  if (o.figure !== false) color.multiplyScalar(1 / MEAN);
  return {
    color,
    map: o.figure === false ? null : own(surface(picture(stuff), across, down)),
    normalMap: own(surface(picture(`${stuff}-normal`), across, down, true)),
    normalScale: new T.Vector2(relief, relief),
    roughnessMap: own(surface(picture(`${stuff}-rough`), across, down, true)),
    roughness: o.roughness ?? sheen.roughness,
    metalness: o.metalness ?? sheen.metalness,
  };
}
/** Skin: a faint pore relief and a soft sheen, made by the page (no photograph of skin is used). */
let poreCanvas: HTMLCanvasElement | null = null;
export function skin(own: Own, tone: T.ColorRepresentation, across = 6): T.MeshStandardMaterialParameters {
  if (!poreCanvas) {
    const n = 256,
      c = document.createElement("canvas");
    c.width = c.height = n;
    const ctx = c.getContext("2d")!,
      img = ctx.createImageData(n, n),
      h = new Float32Array(n * n);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n * n; i++) h[i] = rnd();
    // Pores: small soft dimples over a faint mottle.
    const at = (x: number, y: number) => h[((y + n) % n) * n + ((x + n) % n)];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.35,
          dy = (at(x, y + 1) - at(x, y - 1)) * 0.35,
          i = (y * n + x) * 4;
        img.data[i] = 128 + dx * 127;
        img.data[i + 1] = 128 + dy * 127;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    poreCanvas = c;
  }
  const normalMap = own(new T.CanvasTexture(poreCanvas));
  normalMap.wrapS = normalMap.wrapT = T.RepeatWrapping;
  normalMap.repeat.set(across, across);
  return { color: new T.Color(tone), normalMap, normalScale: new T.Vector2(0.12, 0.12), roughness: 0.55, metalness: 0 };
}

// ─────────────── Light from a real place ───────────────
type Place = "sky" | "saloon";
const URLS: Record<Place, string> = { sky: skyUrl, saloon: saloonUrl };
/** Each place's prefiltered light, made once per renderer (PMREM), and dropped with it. */
const made_ = new WeakMap<T.WebGLRenderer, Map<Place, T.Texture>>();
function bytes(url: string) {
  const text = atob(url.slice(url.indexOf(",") + 1)),
    out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out.buffer;
}
/**
 * Lights `scene` from a real place: `sky` (a partly cloudy sky over open country) or `saloon` (a warm wooden bar
 * room), at `intensity`, for the soft light of the shaded sides and the reflections in metal, glass and gloss. Also
 * sets a film-like tone (`exposure`) and soft shadows. The place's light is prefiltered once for the renderer.
 */
export function place(renderer: T.WebGLRenderer, scene: T.Scene, where: Place, intensity: number, o: { exposure?: number; background?: boolean; shadows?: boolean } = {}) {
  let mine = made_.get(renderer);
  if (!mine) {
    made_.set(renderer, (mine = new Map()));
    const free = renderer.dispose.bind(renderer),
      all = mine;
    renderer.dispose = () => {
      for (const t of all.values()) t.dispose();
      all.clear();
      free();
    };
  }
  let env = mine.get(where);
  if (!env) {
    const data = new HDRLoader().setDataType(T.HalfFloatType).parse(bytes(URLS[where])),
      equirect = new T.DataTexture(data.data as Uint16Array, data.width, data.height, T.RGBAFormat, data.type);
    equirect.mapping = T.EquirectangularReflectionMapping;
    equirect.colorSpace = T.LinearSRGBColorSpace;
    equirect.minFilter = equirect.magFilter = T.LinearFilter;
    equirect.generateMipmaps = false;
    equirect.flipY = true;
    equirect.needsUpdate = true;
    const pmrem = new T.PMREMGenerator(renderer);
    env = pmrem.fromEquirectangular(equirect).texture;
    pmrem.dispose();
    equirect.dispose();
    mine.set(where, env);
  }
  scene.environment = env;
  scene.environmentIntensity = intensity;
  if (o.background) scene.background = env;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  // Soft shadow edges: three's filtered shadows (PCF, its soft kind folded into it now) blurred by each light's radius.
  if (o.shadows !== false) {
    renderer.shadowMap.type = T.PCFShadowMap;
    scene.traverse((thing) => {
      if ((thing instanceof T.DirectionalLight || thing instanceof T.SpotLight || thing instanceof T.PointLight) && thing.castShadow) {
        thing.shadow.radius = 4;
        thing.shadow.blurSamples = 12;
      }
    });
  }
  return env;
}
