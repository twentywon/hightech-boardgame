import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import woodDarkUrl from "../assets/tex/wood-dark.webp?inline";
import woodLightUrl from "../assets/tex/wood-light.webp?inline";
import woodNormalUrl from "../assets/tex/wood-normal.webp?inline";
import woodRoughUrl from "../assets/tex/wood-rough.webp?inline";
import clothNormalUrl from "../assets/tex/cloth-normal.webp?inline";
import mapleUrl from "../assets/tex/maple.webp?inline";
import walnutUrl from "../assets/tex/walnut.webp?inline";
const ndc = new T.Vector2();
/** Points `ray` from the camera through the pointer's place on the canvas. */
export function aim(ray: T.Raycaster, e: PointerEvent, canvas: HTMLCanvasElement, camera: T.Camera) {
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    (-(e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  ray.setFromCamera(ndc, camera);
}
export function disposeScene(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  scene.traverse((obj) => {
    if (obj instanceof T.DirectionalLight) obj.shadow.dispose();
    if (obj instanceof T.Mesh || obj instanceof T.LineSegments) {
      geometries.add(obj.geometry);
      for (const m of Array.isArray(obj.material)
        ? obj.material
        : [obj.material]) {
        materials.add(m);
        if ("map" in m && m.map) textures.add(m.map as T.Texture);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
export function afterGPUFrame(
  renderer: T.WebGLRenderer,
  ready: () => void,
): () => void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const sync =
    typeof gl.fenceSync === "function"
      ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
      : null;
  if (!sync) {
    ready();
    return () => {};
  }
  gl.flush();
  let timer: ReturnType<typeof setTimeout>,
    active = true;
  const poll = () => {
    if (!active) return;
    if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) {
      timer = setTimeout(poll, 8);
      return;
    }
    gl.deleteSync(sync);
    active = false;
    ready();
  };
  timer = setTimeout(poll, 0);
  return () => {
    if (!active) return;
    active = false;
    clearTimeout(timer);
    gl.deleteSync(sync);
  };
}
/** Photographs that surfaces are made of, decoded once for the whole page. */
const photos = new Map<string, HTMLImageElement>();
/** Calls `ready` with a photograph: at once when it has been decoded already, otherwise when it has. */
function photo(url: string, ready?: (image: HTMLImageElement) => void) {
  let image = photos.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    photos.set(url, image);
  }
  if (!ready) return;
  if (image.complete && image.naturalWidth) ready(image);
  else image.addEventListener("load", () => ready(image), { once: true });
}
// They are asked for as the page opens, so that a table finds them ready.
if (typeof Image !== "undefined") for (const url of [woodDarkUrl, woodLightUrl, woodNormalUrl, woodRoughUrl, clothNormalUrl, mapleUrl, walnutUrl]) photo(url);
const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;
let drawnBySoftware: boolean | undefined;
/**
 * Whether a graphics card draws the page. Where the processor does it alone (which is also how the browser tests
 * run) tables keep to what is cheap: no reflected room, no relief, no lacquer. A capture and `?reflect=1` ask for
 * everything all the same.
 */
export function capable() {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.capture || location.search.includes("reflect=1")) return true;
  if (drawnBySoftware === undefined) {
    const canvas = document.createElement("canvas"),
      gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl"),
      info = gl?.getExtension("WEBGL_debug_renderer_info");
    drawnBySoftware = !gl || SOFTWARE.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return !drawnBySoftware;
}
/**
 * Wood, from a photograph graded to the colour the tables were painted in (dark: Poly Haven's "Dark Wood"; pale:
 * "Oak Veneer 01", both CC0); `grain` below 1 fades the figure of the wood for a calmer surface. Until the
 * photograph has come the texture is the plain colour.
 */
export function wood(dark = false, grain = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!,
    plain = dark ? "#58321f" : "#c89a60";
  ctx.fillStyle = plain;
  ctx.fillRect(0, 0, 512, 512);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  photo(dark ? woodDarkUrl : woodLightUrl, (image) => {
    ctx.drawImage(image, 0, 0, 512, 512);
    if (grain < 1) {
      ctx.globalAlpha = Math.min(0.85, (1 - grain) * 0.9);
      ctx.fillRect(0, 0, 512, 512);
      ctx.globalAlpha = 1;
    }
    texture.needsUpdate = true;
  });
  return texture;
}
/** A photographed surface tiled `across` by `down`: a picture of colour, or of numbers (`data`: a normal or roughness map). */
export function surface(url: string, across = 1, down = across, data = false) {
  const texture = new T.Texture();
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(across, down);
  texture.anisotropy = 8;
  if (!data) texture.colorSpace = T.SRGBColorSpace;
  photo(url, (image) => {
    texture.image = image;
    texture.needsUpdate = true;
  });
  return texture;
}
type Keep = <R extends { dispose(): void }>(resource: R) => R;
/**
 * The top of a wooden table, tiled `across` by `down` (a tile is about eight units of a table): photographed dark
 * wood, with its relief and its sheen where a graphics card draws.
 */
export function planks(across: number, keep: Keep = (r) => r, down = across): T.MeshStandardMaterialParameters {
  const map = keep(surface(woodDarkUrl, across, down));
  if (!capable()) return { map, roughness: 0.8 };
  return { map, normalMap: keep(surface(woodNormalUrl, across, down, true)), roughnessMap: keep(surface(woodRoughUrl, across, down, true)), roughness: 0.9 };
}
/** The weave of a cloth, for a felt: nothing where no graphics card draws. */
export function weave(across: number, down = across, keep: Keep = (r) => r, depth = 0.9): T.MeshStandardMaterialParameters {
  return capable() ? { normalMap: keep(surface(clothNormalUrl, across, down, true)), normalScale: new T.Vector2(depth, depth) } : {};
}
/** Veneer for inlaid squares: pale maple and brown walnut (Poly Haven, CC0). */
export const veneer = (dark: boolean) => surface(dark ? walnutUrl : mapleUrl);
/** A lacquered or glazed thing (a stone, a marble, a ball, a die): a clear coat over it where a graphics card draws. */
export function glossy(options: T.MeshStandardMaterialParameters, coat = 1): T.MeshStandardMaterial {
  return capable() ? new T.MeshPhysicalMaterial({ ...options, clearcoat: coat, clearcoatRoughness: 0.06 }) : new T.MeshStandardMaterial(options);
}

/**
 * A more photographic light for a table. A room is reflected in whatever shines (china, metal, glass, glazed
 * pieces), shadows have soft edges, highlights roll off as on film instead of clipping where `filmic` asks, and a weak light from the
 * far side and one from behind give the pieces a second lit edge.
 */
export function realism(renderer: T.WebGLRenderer, scene: T.Scene, filmic = false) {
  // All of this is for a graphics card. Where the picture is drawn by the processor alone (which is also how the
  // browser tests run) the reflected room's shaders took seconds to build and the softer shadows cost a third of the
  // frames: there the table keeps its plain light.
  if (!capable()) return;
  // Film-like highlights take the white out of white things (cards, paper, a white table turn cream), so only the
  // tables that were looked at with them ask for them.
  if (filmic) renderer.toneMapping = T.NeutralToneMapping;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    reflected = pmrem.fromScene(room, 0.04).texture;
  scene.environment = reflected;
  scene.environmentIntensity = 0.32;
  room.dispose();
  pmrem.dispose();
  scene.traverse((thing) => {
    // The room lights the shaded sides, so the flat sky light gives way to it.
    if (thing instanceof T.HemisphereLight) thing.intensity *= 0.62;
    else if (thing instanceof T.DirectionalLight && thing.castShadow) {
      thing.shadow.mapSize.set(2048, 2048);
      thing.shadow.radius = 5;
      thing.shadow.blurSamples = 16;
    }
  });
  const fill = new T.DirectionalLight("#cfe0ff", 0.22),
    rim = new T.DirectionalLight("#fff0d8", 0.4);
  fill.position.set(7, 5, 3);
  rim.position.set(2, 6, -9);
  scene.add(fill, rim);
  // The reflected room goes when the renderer does, whichever view owns it.
  const free = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    reflected.dispose();
    free();
  };
}
