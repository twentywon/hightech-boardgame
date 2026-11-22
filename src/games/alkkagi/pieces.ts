import * as T from "three";
import { capable } from "../../engine/scene-utils";

/**
 * What alkkagi's stones and pieces are made of, all modelled and painted in code: go stones of polished slate and
 * of clam shell (a lens turned on a lathe, the shell's faint bands laid across it), octagonal janggi pieces of
 * boxwood with their characters carved and painted, the soft shadow a stone casts where it touches, and the specks
 * thrown up by a knock or a landing.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
export const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/** A go stone of radius 1 and half thickness `half`: a lens with a softly rounded rim, its picture laid flat over its faces. */
export function stoneGeometry(half: number) {
  const profile: T.Vector2[] = [],
    n = 22;
  for (let i = 0; i <= n; i++) {
    // From the bottom pole round the rim to the top pole: a superellipse, fuller than a sphere's slice.
    const t = -Math.PI / 2 + (Math.PI * i) / n,
      c = Math.cos(t),
      s = Math.sin(t);
    profile.push(new T.Vector2(Math.max(0, Math.sign(c) * Math.abs(c) ** 0.72), half * Math.sign(s) * Math.abs(s) ** 1.1));
  }
  profile[0].x = profile[n].x = 0;
  const geometry = new T.LatheGeometry(profile, 40),
    at = geometry.attributes.position,
    uv = geometry.attributes.uv;
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) * 0.5 + 0.5, at.getZ(i) * 0.5 + 0.5);
  geometry.computeVertexNormals();
  return geometry;
}
/** The faint bands of a clam-shell stone, and the near-black of a slate one with a little grain. */
export function stoneTexture(white: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!,
    rnd = random(white ? 11 : 23);
  ctx.fillStyle = white ? "#f6f2e8" : "#1a1b1f";
  ctx.fillRect(0, 0, 256, 256);
  if (white) {
    // Bands across the shell, a little wavy, some paler and some a shade warmer.
    for (let y = 0; y < 256; y += 2 + rnd() * 5) {
      ctx.strokeStyle = rnd() < 0.5 ? `rgba(196,182,150,${0.08 + rnd() * 0.14})` : `rgba(255,255,255,${0.2 + rnd() * 0.3})`;
      ctx.lineWidth = 0.8 + rnd() * 2.2;
      ctx.beginPath();
      const phase = rnd() * 6,
        bend = 1 + rnd() * 3;
      for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x / 40 + phase) * bend);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? "70,74,82" : "8,8,10"},${0.08 + rnd() * 0.12})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  }
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** A stone's paint: polished, with a clear coat where a graphics card draws. */
export function stoneMaterial(own: Own, white: boolean) {
  const options: T.MeshStandardMaterialParameters = { map: own(stoneTexture(white)), roughness: white ? 0.2 : 0.26, metalness: 0 };
  return own(capable() ? new T.MeshPhysicalMaterial({ ...options, clearcoat: white ? 0.9 : 1, clearcoatRoughness: 0.08, specularIntensity: 0.9 }) : new T.MeshStandardMaterial(options));
}
/** An octagonal janggi piece of apothem `r` and thickness `thick`, its faces flat on the table, centred on its middle. */
export function pieceGeometry(r: number, thick: number) {
  const bevel = Math.min(0.035, thick * 0.22),
    // The corners of an octagon whose flat sides face along x and z.
    corner = (r - bevel) / Math.cos(Math.PI / 8),
    shape = new T.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 8 + (i * Math.PI) / 4,
      x = Math.cos(angle) * corner,
      y = Math.sin(angle) * corner;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, { depth: thick - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
  // Lying down: the shape's +y runs away from the near side, so its writing reads upright from there.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thick / 2 + bevel, 0);
  // The faces' pictures run over the piece's own width.
  const uv = geometry.attributes.uv,
    span = r * 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / span + 0.5, uv.getY(i) / span + 0.5);
  geometry.computeVertexNormals();
  return geometry;
}
/** Boxwood: pale, with fine close grain. */
function boxwood(ctx: CanvasRenderingContext2D, size: number, seed: number) {
  const rnd = random(seed);
  const fill = ctx.createLinearGradient(0, 0, size, size);
  fill.addColorStop(0, "#efd9a6");
  fill.addColorStop(1, "#e2c58c");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 0.6; i++) {
    ctx.strokeStyle = `rgba(150,105,50,${0.03 + rnd() * 0.07})`;
    ctx.lineWidth = 0.5 + rnd() * 1.4;
    const y0 = rnd() * size,
      bend = rnd() * 4;
    ctx.beginPath();
    for (let x = 0; x <= size; x += size / 16) ctx.lineTo(x, y0 + Math.sin(x / (size / 5) + i) * bend);
    ctx.stroke();
  }
}
/**
 * The face of a janggi piece: boxwood with an octagonal ring and the character cut into it and painted (the cut's
 * lit and shaded walls drawn round the paint). `relief` paints the same cuts as heights, for a bump map.
 */
export function faceTexture(label: string, color: string, relief = false) {
  const size = 256,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    mid = size / 2,
    font = `700 ${label === "楚" || label === "漢" ? 128 : 118}px "Noto Serif CJK KR", "Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif`;
  if (relief) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
  } else boxwood(ctx, size, label.charCodeAt(0));
  const ring = (inset: number) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = Math.PI / 8 + (i * Math.PI) / 4,
        corner = (mid - inset) / Math.cos(Math.PI / 8);
      ctx.lineTo(mid + Math.cos(angle) * corner, mid - Math.sin(angle) * corner);
    }
    ctx.closePath();
  };
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font;
  const cut = (dx: number, dy: number, style: string) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.strokeStyle = ctx.fillStyle = style;
    ctx.lineWidth = 7;
    ring(22);
    ctx.stroke();
    ctx.fillText(label, mid, mid + 6);
    ctx.restore();
  };
  if (relief) {
    ctx.filter = "blur(1.5px)";
    cut(0, 0, "#000000");
    ctx.filter = "none";
  } else {
    // The walls of the cut: shaded on the side the light comes from, lit on the other.
    cut(-2.5, -2.5, "rgba(70,40,12,0.55)");
    cut(2, 2, "rgba(255,244,214,0.7)");
    cut(0, 0, color);
  }
  const texture = new T.CanvasTexture(c);
  if (!relief) texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/** The side of a piece: the same pale wood. */
export function edgeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  boxwood(c.getContext("2d")!, 128, 5);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** A soft round shadow, darkest in the middle: laid under a stone where it touches. */
export function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    fill = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  fill.addColorStop(0, "rgba(0,0,0,0.75)");
  fill.addColorStop(0.42, "rgba(0,0,0,0.5)");
  fill.addColorStop(0.7, "rgba(0,0,0,0.14)");
  fill.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 128, 128);
  return new T.CanvasTexture(c);
}
/**
 * Specks thrown up by knocks: a pool of points, each with its own way, life and size, drawn as soft dots. Bright
 * specks are added light (a stone's sharp knock); dust is laid over what is behind it.
 */
export class Specks {
  readonly points: T.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private span: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private next = 0;
  constructor(
    own: Own,
    private count: number,
    color: string,
    additive: boolean,
    private drag: number,
    private gravity: number,
  ) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.span = new Float32Array(count).fill(1);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    const geometry = own(new T.BufferGeometry());
    geometry.setAttribute("position", new T.BufferAttribute(this.pos, 3));
    geometry.setAttribute("size", new T.BufferAttribute(this.size, 1));
    geometry.setAttribute("alpha", new T.BufferAttribute(this.alpha, 1));
    const material = own(
      new T.ShaderMaterial({
        uniforms: { color: { value: new T.Color(color) }, scale: { value: 600 } },
        vertexShader: `attribute float size; attribute float alpha; varying float vAlpha; uniform float scale;
          void main() { vAlpha = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 color; varying float vAlpha;
          void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(color, vAlpha * (1.0 - d * d)); }`,
        transparent: true,
        depthWrite: false,
        blending: additive ? T.AdditiveBlending : T.NormalBlending,
      }),
    );
    this.points = new T.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }
  /** Throws `n` specks from a place, outward and up at about `speed`, for about `seconds`, of about `size`. */
  burst(x: number, y: number, z: number, n: number, speed: number, seconds: number, size: number, seed: number) {
    const rnd = random(seed);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const angle = rnd() * Math.PI * 2,
        out = speed * (0.35 + rnd() * 0.65);
      this.pos.set([x, y, z], i * 3);
      this.vel.set([Math.cos(angle) * out, speed * (0.3 + rnd() * 0.9), Math.sin(angle) * out], i * 3);
      this.span[i] = this.life[i] = seconds * (0.6 + rnd() * 0.6);
      this.size[i] = size * (0.6 + rnd() * 0.8);
    }
  }
  /** Moves every speck on by `dt` seconds; false when none is left. */
  advance(dt: number) {
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive = true;
      this.life[i] -= dt;
      const keep = Math.max(0, 1 - this.drag * dt);
      this.vel[i * 3] *= keep;
      this.vel[i * 3 + 2] *= keep;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * keep - this.gravity * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      this.alpha[i] = Math.max(0, this.life[i] / this.span[i]);
    }
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = geometry.attributes.alpha.needsUpdate = geometry.attributes.size.needsUpdate = true;
    return alive;
  }
  /** The canvas's height in pixels sets how large a speck of a given size is drawn. */
  setScale(pixels: number) {
    (this.points.material as T.ShaderMaterial).uniforms.scale.value = pixels;
  }
  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.points.geometry.attributes.alpha.needsUpdate = true;
  }
}
