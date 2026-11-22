import * as T from "three";
import { capable } from "../../engine/scene-utils";

/** Radius of a germ's body, and its height over the floor of its well. */
export const GERM_R = 0.33,
  GERM_H = GERM_R * 1.55;
/** What a germ's skin needs from the view: the clock its membrane wobbles by. */
export interface GermUniforms {
  uTime: { value: number };
  /** How much the skin wobbles (0 still). */
  uWobble: { value: number };
  /** The colour spreading through the germ (a conversion), and how far it has come (-0.1 not begun, 1.1 through). */
  uOther: { value: T.Color };
  uOtherRim: { value: T.Color };
  uSpread: { value: number };
  /** The direction, in the germ's own space, the new colour comes from. */
  uDir: { value: T.Vector3 };
  uRim: { value: T.Color };
}
/**
 * A germ's body: a soft dome with a few gentle lumps and a flat underside, standing on y = 0. The normals are those
 * of the squashed sphere, so that no seam shows.
 */
export function blobGeometry() {
  const g = new T.SphereGeometry(GERM_R, 40, 26),
    position = g.attributes.position,
    normal = g.attributes.normal,
    squash = 0.93,
    floor = -GERM_R * 0.62;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i),
      lump = 1 + 0.07 * Math.sin(x * 14 + z * 6) * Math.cos(z * 12 - y * 8) + 0.035 * Math.sin(y * 21 + x * 10);
    position.setXYZ(i, x * lump, Math.max(floor, y * squash * lump), z * lump);
    const n = new T.Vector3(normal.getX(i), normal.getY(i) / squash, normal.getZ(i)).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  g.translate(0, -floor, 0);
  return g;
}
/** The inside seen through the skin: a nucleus and three small granules round it. */
export function innerGeometry(merge: (parts: T.BufferGeometry[]) => T.BufferGeometry) {
  const nucleus = new T.SphereGeometry(GERM_R * 0.44, 20, 14).scale(1, 0.85, 1).translate(GERM_R * 0.12, GERM_R * 0.62, -GERM_R * 0.1),
    parts = [nucleus];
  for (const [x, y, z, r] of [
    [-0.42, 0.42, 0.22, 0.13],
    [0.05, 0.36, 0.48, 0.1],
    [-0.2, 0.55, -0.46, 0.09],
  ])
    parts.push(new T.SphereGeometry(GERM_R * r, 10, 8).translate(GERM_R * x, GERM_R * y, GERM_R * z));
  const merged = merge(parts);
  for (const part of parts) part.dispose();
  return merged;
}
/**
 * The skin of a germ: soft, wet and see-through, brighter at its edge, its surface wobbling with the clock; a colour
 * can spread through it from one side (a germ won over). Glossy under a clear coat where a graphics card draws.
 */
export function germMaterial(color: string, rim: string, clock: { value: number }, dim = false) {
  const options: T.MeshStandardMaterialParameters = {
    color,
    roughness: 0.32,
    metalness: 0,
    transparent: true,
    opacity: dim ? 0.7 : 0.84,
    emissive: color,
    emissiveIntensity: dim ? 0.04 : 0.1,
  };
  // Drawn by the processor alone, the skin is lit the cheap way (it looks much the same with nothing to reflect).
  const { roughness: _r, metalness: _m, ...plain } = options,
    material = !capable()
      ? new T.MeshLambertMaterial(plain as T.MeshLambertMaterialParameters)
      : dim
        ? new T.MeshStandardMaterial(options)
        : new T.MeshPhysicalMaterial({ ...options, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const uniforms: GermUniforms = {
    uTime: clock,
    uWobble: { value: 1 },
    uOther: { value: new T.Color(color) },
    uOtherRim: { value: new T.Color(rim) },
    uSpread: { value: -0.1 },
    uDir: { value: new T.Vector3(1, 0, 0) },
    uRim: { value: new T.Color(rim) },
  };
  material.userData.germ = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWobble;\nvarying vec3 vLocal;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vLocal = position;
        vec3 placed = modelMatrix[3].xyz;
        float phase = placed.x * 1.7 + placed.z * 2.3;
        float wave = sin(position.y * 15.0 + uTime * 2.3 + phase) * 0.5
          + sin(position.x * 12.0 - uTime * 1.8 + phase * 1.3) * 0.35
          + sin(position.z * 13.0 + uTime * 1.4 - phase) * 0.35;
        transformed += normal * wave * 0.022 * uWobble * smoothstep(0.0, 0.1, position.y);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec3 uOther;\nuniform vec3 uOtherRim;\nuniform float uSpread;\nuniform vec3 uDir;\nuniform vec3 uRim;\nvarying vec3 vLocal;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float facing = dot(normalize(vLocal - vec3(0.0, ${(GERM_H * 0.45).toFixed(3)}, 0.0)), uDir) * 0.5 + 0.5;
        float spread = 1.0 - smoothstep(uSpread - 0.09, uSpread + 0.09, 1.0 - facing);
        diffuseColor.rgb = mix(diffuseColor.rgb, uOther, spread);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix(totalEmissiveRadiance, uOther * ${dim ? "0.04" : "0.1"}, spread);
        float edge = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.4);
        totalEmissiveRadiance += mix(uRim, uOtherRim, spread) * edge * ${dim ? "0.25" : "0.75"};`,
      );
  };
  material.customProgramCacheKey = () => `germ-${material.type}-${dim}`;
  return material;
}
