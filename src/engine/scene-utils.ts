import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
// The photographs of surfaces, inlined so nothing is fetched at run time. Browser tests import views (and so this
// file) under plain Node, which knows neither the pictures nor `import.meta.glob`: there, with no page, none are asked for.
const pictures: Record<string, string> =
  typeof document === "undefined" ? {} : import.meta.glob<string>("../assets/tex/*.webp", { query: "?inline", import: "default", eager: true });
const picture = (name: string) => pictures[`../assets/tex/${name}.webp`] ?? "",
  woodDarkUrl = picture("wood-dark"),
  woodLightUrl = picture("wood-light"),
  woodNormalUrl = picture("wood-normal"),
  woodRoughUrl = picture("wood-rough"),
  clothNormalUrl = picture("cloth-normal"),
  mapleUrl = picture("maple"),
  walnutUrl = picture("walnut");
/** What a ground or a wall is made of; each is a photograph (Poly Haven, CC0) and some have a relief as well. */
export type Stuff = "earth" | "grass" | "brick" | "stone" | "gravel" | "boards";
const RELIEFS: Partial<Record<Stuff, string>> = { earth: picture("earth-normal"), grass: picture("grass-normal"), brick: picture("brick-normal"), gravel: picture("gravel-normal") };
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
if (typeof Image !== "undefined") for (const url of Object.values(pictures)) photo(url);
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
/**
 * A ground or a wall of some stuff, tiled `across` by `down`: the figure of its photograph laid over the colour
 * `base` (the photographs are kept at a middling grey, so the colour a table was painted in stays its colour), with
 * its relief where it has one and a graphics card draws.
 */
export function stuff(kind: Stuff, base: string, across = 1, keep: Keep = (r) => r, down = across): T.MeshStandardMaterialParameters {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  const map = keep(new T.CanvasTexture(canvas));
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(across, down);
  map.anisotropy = 4;
  photo(picture(kind), (image) => {
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(image, 0, 0, 512, 512);
    ctx.globalCompositeOperation = "source-over";
    map.needsUpdate = true;
  });
  const relief = RELIEFS[kind];
  return relief && capable() ? { map, normalMap: keep(surface(relief, across, down, true)) } : { map };
}
/** The weave of a cloth, for a felt: nothing where no graphics card draws. */
export function weave(across: number, down = across, keep: Keep = (r) => r, depth = 0.9): T.MeshStandardMaterialParameters {
  return capable() ? { normalMap: keep(surface(clothNormalUrl, across, down, true)), normalScale: new T.Vector2(depth, depth) } : {};
}
/** Veneer for inlaid squares: pale maple and brown walnut (Poly Haven, CC0). */
export const veneer = (dark: boolean) => surface(dark ? walnutUrl : mapleUrl);
/** The part of its way at which a hopping thing comes down; what is left of the time is its small bounce. */
const LANDING = 0.84;
/**
 * How high a thing that hops stands at `p` of its time (0 to 1; 1 is the top of the hop): up and over as a thrown
 * thing goes, then one small bounce where it lands. Pieces used to follow half a sine and stop dead.
 */
export const hop = (p: number) => (p < LANDING ? 4 * (p / LANDING) * (1 - p / LANDING) : 0.09 * Math.sin((Math.PI * (p - LANDING)) / (1 - LANDING)));
/** How far along its way a hopping thing is at `p`: it has arrived when it lands, and bounces where it stands. */
export const travel = (p: number) => {
  const q = Math.min(1, p / LANDING);
  return q * q * (3 - 2 * q);
};
/** How much of its fall a dropped thing still has before it at `p`: faster and faster, as things fall, then one small bounce. */
export const fall = (p: number) => (p < 0.8 ? 1 - (p / 0.8) ** 2 : 0.07 * Math.sin((Math.PI * (p - 0.8)) / 0.2));
/**
 * A box whose edges and corners are rounded off by `radius`, as real boards, tiles and dice are: the light then
 * catches on its edges. Its faces stay flat (no pillow), its six sides keep the order and the picture layout of
 * `BoxGeometry`, so a list of six materials and a board's printed face go on as before.
 */
export function block(width: number, height: number, depth: number, radius = Math.min(0.06, Math.min(width, height, depth) * 0.3), steps = 2) {
  const r = Math.max(0.0001, Math.min(radius, width / 2, height / 2, depth / 2)),
    lines = 2 * steps + 1,
    geometry = new T.BoxGeometry(width, height, depth, lines, lines, lines),
    at = geometry.getAttribute("position"),
    normal = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv"),
    half = [width / 2, height / 2, depth / 2],
    size = [width, height, depth],
    // Along an axis the lines of the grid crowd into the rounded bands at either end; one span crosses the flat.
    line = (value: number, axis: number) => {
      const i = Math.round((value / size[axis] + 0.5) * lines),
        j = i <= steps ? i : lines - i,
        inset = r - r * Math.tan((Math.PI / 4) * ((steps - j) / steps));
      return (i <= steps ? -1 : 1) * (half[axis] - inset);
    },
    perFace = (lines + 1) * (lines + 1),
    p = [0, 0, 0],
    n = [0, 0, 0];
  for (let i = 0; i < at.count; i++) {
    const raw = [at.getX(i), at.getY(i), at.getZ(i)];
    let length = 0;
    for (let axis = 0; axis < 3; axis++) {
      const value = line(raw[axis], axis),
        inner = Math.max(-(half[axis] - r), Math.min(half[axis] - r, value));
      p[axis] = inner;
      n[axis] = value - inner;
      length += n[axis] * n[axis];
    }
    length = Math.sqrt(length) || 1;
    for (let axis = 0; axis < 3; axis++) {
      n[axis] /= length;
      p[axis] += n[axis] * r;
    }
    at.setXYZ(i, p[0], p[1], p[2]);
    normal.setXYZ(i, n[0], n[1], n[2]);
    const [x, y, z] = p,
      face = Math.floor(i / perFace);
    if (face === 0) uv.setXY(i, 0.5 - z / depth, 0.5 + y / height);
    else if (face === 1) uv.setXY(i, 0.5 + z / depth, 0.5 + y / height);
    else if (face === 2) uv.setXY(i, 0.5 + x / width, 0.5 - z / depth);
    else if (face === 3) uv.setXY(i, 0.5 + x / width, 0.5 + z / depth);
    else if (face === 4) uv.setXY(i, 0.5 + x / width, 0.5 + y / height);
    else uv.setXY(i, 0.5 - x / width, 0.5 + y / height);
  }
  return geometry;
}
/**
 * A turned pawn `height` tall, standing on y = 0: a foot, a waist, a collar and a ball for a head, in one piece.
 * The men of Ludo and of snakes and ladders are of this kind.
 */
export function pawn(height: number) {
  const profile: [number, number][] = [
    [0, 0],
    [0.31, 0],
    [0.325, 0.03],
    [0.31, 0.07],
    [0.24, 0.1],
    [0.2, 0.13],
    [0.215, 0.16],
    [0.19, 0.19],
    [0.13, 0.3],
    [0.1, 0.45],
    [0.095, 0.55],
    [0.12, 0.6],
    [0.19, 0.63],
    [0.2, 0.655],
    [0.17, 0.675],
    [0.115, 0.69],
  ];
  for (let i = 0; i <= 10; i++) {
    const a = -1.05 + ((Math.PI / 2 + 1.05) * i) / 10;
    profile.push([0.2 * Math.cos(a), 0.8 + 0.2 * Math.sin(a)]);
  }
  return new T.LatheGeometry(
    profile.map(([r, y]) => new T.Vector2(Math.max(0, r) * height, y * height)),
    28,
  );
}
/**
 * A draughtsman `radius` wide and `height` thick, lying about y = 0: a rounded rim, a raised ring and a hollow
 * with a boss in the middle, as checkers are turned.
 */
export function draughtsman(radius: number, height: number) {
  const top = height / 2,
    lip = height * 0.2,
    R = radius;
  return new T.LatheGeometry(
    [
      [0, -top],
      [R * 0.95, -top],
      [R, -top + lip],
      [R, top - lip],
      [R * 0.95, top],
      [R * 0.84, top],
      [R * 0.78, top - lip],
      [R * 0.56, top - lip],
      [R * 0.5, top - lip * 0.3],
      [R * 0.4, top - lip * 0.3],
      [R * 0.34, top - lip],
      [0, top - lip],
    ].map(([r, y]) => new T.Vector2(r, y)),
    40,
  );
}
/** The strands of a pile (light and dark, lying mostly one way), painted once a page and tiling at its edges. */
let strands: HTMLCanvasElement | null = null;
function strandPattern() {
  if (strands) return strands;
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const pen = canvas.getContext("2d")!;
  let seed = 9173;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  pen.fillStyle = "#c8c8c8";
  pen.fillRect(0, 0, size, size);
  pen.lineCap = "round";
  for (let k = 0; k < 14000; k++) {
    const x = rand() * size,
      y = rand() * size,
      a = Math.PI / 2 + (rand() - 0.5) * 1.3,
      long = 4 + rand() * 8,
      tone = Math.round(150 + rand() * 105);
    pen.strokeStyle = `rgba(${tone},${tone},${tone},0.55)`;
    pen.lineWidth = 0.8 + rand() * 1.2;
    // Drawn again across the edges, so that the pile has no seam where the picture repeats.
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        if (Math.abs(x + dx - size / 2) > size / 2 + 12 || Math.abs(y + dy - size / 2) > size / 2 + 12) continue;
        pen.beginPath();
        pen.moveTo(x + dx, y + dy);
        pen.lineTo(x + dx + Math.cos(a) * long, y + dy + Math.sin(a) * long);
        pen.stroke();
      }
  }
  return (strands = canvas);
}
const pile = (across: number, down: number, data: boolean) => {
  const texture = new T.CanvasTexture(strandPattern());
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(across, down);
  texture.colorSpace = data ? T.NoColorSpace : T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};
/**
 * A soft thing with a pile (a plush toy, a blanket, a duvet): its colour broken into fine strands (`strands`, unless
 * the thing has a picture of its own), and where a graphics card draws the strands' relief and the soft sheen that
 * fabric with a pile catches at its edges. `amount` 1 is a plush toy's fur; less is a lighter nap.
 */
export function furry(options: T.MeshStandardMaterialParameters, amount = 1, across = 3, down = across, keep: Keep = (r) => r, strands = !options.map): T.MeshStandardMaterial {
  if (typeof document === "undefined") return new T.MeshStandardMaterial(options);
  const params: T.MeshStandardMaterialParameters = { ...options, ...(strands ? { map: keep(pile(across, down, false)) } : {}) };
  if (!capable()) return new T.MeshStandardMaterial(params);
  const tint = new T.Color(options.color ?? "#ffffff").lerp(new T.Color("#ffffff"), 0.55);
  return new T.MeshPhysicalMaterial({ ...params, bumpMap: keep(pile(across, down, true)), bumpScale: 2.2 * amount, sheen: amount, sheenRoughness: 0.55, sheenColor: tint });
}
/** A lacquered or glazed thing (a stone, a marble, a ball, a die): a clear coat over it where a graphics card draws. */
export function glossy(options: T.MeshStandardMaterialParameters, coat = 1): T.MeshStandardMaterial {
  return capable() ? new T.MeshPhysicalMaterial({ ...options, clearcoat: coat, clearcoatRoughness: 0.14 }) : new T.MeshStandardMaterial(options);
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
  scene.environmentIntensity = 0.27;
  room.dispose();
  pmrem.dispose();
  scene.traverse((thing) => {
    // The room lights the shaded sides, so the flat sky light gives way to it.
    if (thing instanceof T.HemisphereLight) thing.intensity *= 0.56;
    // The user found the tables a little glaring: every lamp is turned down a touch.
    else if (thing instanceof T.SpotLight || thing instanceof T.PointLight) thing.intensity *= 0.9;
    else if (thing instanceof T.DirectionalLight && thing.castShadow) {
      thing.intensity *= 0.9;
      thing.shadow.mapSize.set(2048, 2048);
      thing.shadow.radius = 5;
      thing.shadow.blurSamples = 16;
    }
  });
  const fill = new T.DirectionalLight("#cfe0ff", 0.16),
    rim = new T.DirectionalLight("#fff0d8", 0.28);
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
