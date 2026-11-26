import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Own } from "../goldraid/paint";

/**
 * Where the processor draws (no graphics card), every draw costs dear and a soldier is many small parts: the plain
 * parts (a colour, no picture on them) among the meshes directly in `group` are baked into one mesh whose vertices
 * carry their colours, drawn with one paint (`paint`, vertex-coloured). Parts with a picture, or ones in `keep`, are
 * left as they are. A joint of a figure moves as one, so its parts may be baked together.
 */
export function bakeColours(group: T.Object3D, paint: T.Material, own: Own, keep: Set<T.Object3D> = new Set()) {
  const parts = group.children.filter(
    (c): c is T.Mesh =>
      c instanceof T.Mesh &&
      !(c instanceof T.InstancedMesh) &&
      !keep.has(c) &&
      !Array.isArray(c.material) &&
      !(c.material as T.MeshLambertMaterial).map &&
      !(c.material as T.MeshLambertMaterial).transparent &&
      "color" in c.material &&
      c.visible,
  );
  if (parts.length < 2) return;
  const geometries: T.BufferGeometry[] = [];
  let shadow = false;
  for (const m of parts) {
    m.updateMatrix();
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    const colour = (m.material as T.MeshLambertMaterial).color,
      n = g.attributes.position.count,
      rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      rgb[i * 3] = colour.r;
      rgb[i * 3 + 1] = colour.g;
      rgb[i * 3 + 2] = colour.b;
    }
    g.setAttribute("color", new T.BufferAttribute(rgb, 3));
    geometries.push(g);
    shadow ||= m.castShadow;
  }
  const merged = mergeGeometries(geometries);
  for (const g of geometries) g.dispose();
  if (!merged) return;
  const one = new T.Mesh(own(merged), paint);
  one.castShadow = shadow;
  one.receiveShadow = true;
  for (const m of parts) m.removeFromParent();
  group.add(one);
}
/** Bakes the plain parts of every group under `root` (each in its own group). */
export function bakeAll(root: T.Object3D, paint: T.Material, own: Own, keep: Set<T.Object3D> = new Set()) {
  const groups: T.Object3D[] = [];
  root.traverse((o) => {
    if (o.children.length) groups.push(o);
  });
  for (const g of groups) bakeColours(g, paint, own, keep);
}
