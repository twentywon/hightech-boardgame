import * as T from "three";

/** The picture of a winning line's light: bright along its middle, fading at its sides and its ends. */
export function beamTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext("2d")!,
    across = ctx.createLinearGradient(0, 0, 0, 32);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, 256, 32);
  ctx.globalCompositeOperation = "destination-in";
  const along = ctx.createLinearGradient(0, 0, 256, 0);
  along.addColorStop(0, "rgba(0,0,0,0)");
  along.addColorStop(0.1, "rgba(0,0,0,1)");
  along.addColorStop(0.9, "rgba(0,0,0,1)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, 256, 32);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  return map;
}
/** The paint of that light: gold, added to what lies under it, drawn over it. */
export function beamMaterial(map: T.Texture, color = "#ffd36a") {
  return new T.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending });
}
