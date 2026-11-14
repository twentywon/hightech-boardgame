import * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
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
/** A wood texture; `grain` below 1 thins the streaks out for a calmer surface. */
export function wood(dark = false, grain = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = dark ? "#543a28" : "#c89a60";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1000 * grain; i++) {
    const y = rand() * 512;
    ctx.strokeStyle = dark
      ? `rgba(18,9,4,${rand() * 0.13 * grain})`
      : `rgba(77,41,14,${rand() * 0.15 * grain})`;
    ctx.lineWidth = rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16)
      ctx.lineTo(
        x,
        y + Math.sin(x * 0.012 + y) * 2 + Math.sin(x * 0.032) * 0.8,
      );
    ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}

/**
 * A more photographic light for a table. A room is reflected in whatever shines (china, metal, glass, glazed
 * pieces), highlights roll off as on film instead of clipping, shadows have soft edges, and a weak light from the
 * far side and one from behind give the pieces a second lit edge.
 */
export function realism(renderer: T.WebGLRenderer, scene: T.Scene, exposure = 1) {
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const pmrem = new T.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    reflected = pmrem.fromScene(room, 0.04).texture;
  scene.environment = reflected;
  scene.environmentIntensity = 0.32;
  room.dispose();
  pmrem.dispose();
  scene.traverse((thing) => {
    // The room now lights the shaded sides: the flat sky light gives way to it.
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
  return reflected;
}
