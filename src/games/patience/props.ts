import * as T from "three";
import { block } from "../../engine/scene-utils";
import type { Own } from "./view";

/** Small modelling helpers the patience settings share. */
export const standard = (own: Own, options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.75, ...options }));
/** A solid with rounded edges, placed, casting and taking shadows. */
export function solid(parent: T.Object3D, own: Own, size: [number, number, number], at: [number, number, number], material: T.Material | T.Material[], radius?: number, shadow = true) {
  const mesh = new T.Mesh(own(block(size[0], size[1], size[2], radius)), material);
  mesh.position.set(...at);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
/** A turned solid from a profile of (radius, height) points, bottom up. */
export function turned(parent: T.Object3D, own: Own, profile: [number, number][], at: [number, number, number], material: T.Material, segments = 40, shadow = true) {
  const mesh = new T.Mesh(own(new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), segments)), material);
  mesh.position.set(...at);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
/** A rectangle with rounded corners, centred, as a shape (holes may be cut from it). */
export function roundedRect<P extends T.Path = T.Shape>(width: number, depth: number, radius: number, path?: P): P {
  const shape = path ?? (new T.Shape() as T.Path as P);
  const x = -width / 2,
    y = -depth / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + depth - radius);
  shape.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
  shape.lineTo(x + radius, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}
/** A picture painted in code, as a texture. */
export function painted(own: Own, width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!, width, height);
  const texture = own(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
/** A fixed sequence of numbers in [0, 1) for laying things out the same way every time. */
export function sequence(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** A flat plane lying on the floor or the table. */
export function lay(parent: T.Object3D, own: Own, width: number, depth: number, at: [number, number, number], material: T.Material) {
  const mesh = new T.Mesh(own(new T.PlaneGeometry(width, depth)), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(...at);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
