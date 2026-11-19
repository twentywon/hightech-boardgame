import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type Keep = <R extends { dispose(): void }>(r: R) => R;
/** Where a piece is put: its place, its turn (radians, in X Y Z order) and its size along each axis. */
export interface Put {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** Scales all three axes alike. */
  s?: number;
  shadow?: boolean;
}
/**
 * Pieces that never move, gathered into one mesh a paint: the course has hundreds of posts, boards and stones, and
 * drawn one by one they cost the picture a great deal (most of all where the processor draws it alone).
 */
export class Batch {
  private parts = new Map<string, { material: T.Material; shadow: boolean; list: T.BufferGeometry[] }>();
  private ids = new Map<T.Material, number>();
  private matrix = new T.Matrix4();
  private q = new T.Quaternion();
  constructor(private keep: Keep) {}
  /** Adds a copy of `geometry` put as `at` says; the geometry itself is left as it was. */
  add(geometry: T.BufferGeometry, material: T.Material, at: Put = {}) {
    const s = at.s ?? 1;
    this.q.setFromEuler(new T.Euler(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0));
    this.matrix.compose(new T.Vector3(at.x ?? 0, at.y ?? 0, at.z ?? 0), this.q, new T.Vector3((at.sx ?? 1) * s, (at.sy ?? 1) * s, (at.sz ?? 1) * s));
    this.place(geometry, material, this.matrix, at.shadow ?? true);
  }
  /** Adds a copy of `geometry` moved by `matrix`. */
  place(geometry: T.BufferGeometry, material: T.Material, matrix: T.Matrix4, shadow = true) {
    if (!this.ids.has(material)) this.ids.set(material, this.ids.size);
    const key = `${this.ids.get(material)}|${shadow}`;
    let part = this.parts.get(key);
    if (!part) this.parts.set(key, (part = { material, shadow, list: [] }));
    // Plain triangles with a place, a facing and a picture position each, so that any pieces can be joined.
    const copy = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(matrix);
    for (const name of Object.keys(copy.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") copy.deleteAttribute(name);
    if (!copy.attributes.normal) copy.computeVertexNormals();
    if (!copy.attributes.uv) copy.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(copy.attributes.position.count * 2), 2));
    copy.clearGroups();
    part.list.push(copy);
  }
  /** Joins what was added into one mesh a paint, under `parent`. */
  build(parent: T.Object3D) {
    for (const { material, shadow, list } of this.parts.values()) {
      const joined = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!joined) continue;
      const mesh = new T.Mesh(this.keep(joined), material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.parts.clear();
  }
}
