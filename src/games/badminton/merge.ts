import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** What a geometry carries, so that only alike ones are merged (the same attributes, indexed or not). */
const signature = (g: T.BufferGeometry) => `${g.index ? "i" : "n"}:${Object.keys(g.attributes).sort().join(",")}`;
/**
 * Fewer draws for the same picture: the plain meshes among `meshes` that share a material (and cast and take
 * shadows alike) are baked into one, each at the place `matrixOf` gives it, and put into `into`. Where the processor
 * draws alone (and in the browser tests) each draw costs dear, and a player or the hall is made of many small parts.
 */
function bake(meshes: T.Mesh[], into: T.Object3D, matrixOf: (m: T.Mesh) => T.Matrix4, own: Own) {
  const sets = new Map<string, T.Mesh[]>();
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}|${m.visible}|${signature(m.geometry)}`;
    if (!sets.has(key)) sets.set(key, []);
    sets.get(key)!.push(m);
  }
  for (const set of sets.values()) {
    if (set.length < 2) continue;
    const parts = set.map((m) => m.geometry.clone().applyMatrix4(matrixOf(m)));
    const merged = mergeGeometries(parts);
    for (const p of parts) p.dispose();
    if (!merged) continue;
    const first = set[0],
      one = new T.Mesh(own(merged), first.material);
    one.castShadow = first.castShadow;
    one.receiveShadow = first.receiveShadow;
    one.renderOrder = first.renderOrder;
    one.visible = first.visible;
    into.add(one);
    for (const m of set) m.removeFromParent();
  }
}
/** Bakes together the meshes directly in `group` (each keeps its place in the group, which may still move). */
export function compactGroup(group: T.Object3D, own: Own) {
  const meshes = group.children.filter((c): c is T.Mesh => c instanceof T.Mesh && !(c instanceof T.InstancedMesh));
  for (const m of meshes) m.updateMatrix();
  bake(meshes, group, (m) => m.matrix, own);
}
/** Bakes together every plain mesh under `root` that never moves, into `root` itself (which stands at the origin). */
export function compactStill(root: T.Object3D, own: Own) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(),
    meshes: T.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh)) meshes.push(o);
  });
  bake(meshes, root, (m) => inverse.clone().multiply(m.matrixWorld), own);
  // Groups left empty go too.
  const empty: T.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.type === "Group" && o.children.length === 0) empty.push(o);
  });
  for (const g of empty) g.removeFromParent();
}
