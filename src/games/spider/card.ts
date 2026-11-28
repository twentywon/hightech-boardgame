import * as T from "three";

/**
 * A playing card as a solid: a thin slab with rounded corners, lying flat. Its groups are the face (top, +y: the
 * picture upright to an eye at +z), the back (bottom) and the edge all round, whose `v` runs from 0 at the bottom to
 * 1 at the top, so that a pile made by stretching it shows the edges of its cards with a striped picture.
 */
export function cardGeometry(width: number, depth: number, thickness: number, radius: number, steps = 4) {
  // The outline, counter-clockwise seen from above.
  const outline: [number, number][] = [],
    corners: [number, number, number][] = [
      [width / 2 - radius, depth / 2 - radius, Math.PI / 2],
      [width / 2 - radius, -depth / 2 + radius, 0],
      [-width / 2 + radius, -depth / 2 + radius, -Math.PI / 2],
      [-width / 2 + radius, depth / 2 - radius, Math.PI],
    ];
  // Seen from above (+y) with +z toward the eye, going x+ → z− → x− → z+ turns counter-clockwise.
  for (const [cx, cz, start] of corners)
    for (let s = 0; s <= steps; s++) {
      const a = start - (s / steps) * (Math.PI / 2);
      outline.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius]);
    }
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [],
    geometry = new T.BufferGeometry(),
    half = thickness / 2,
    n = outline.length;
  const cap = (y: number, up: boolean) => {
    const base = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, up ? 1 : -1, 0);
    uvs.push(0.5, 0.5);
    for (const [x, z] of outline) {
      positions.push(x, y, z);
      normals.push(0, up ? 1 : -1, 0);
      // The face is upright to an eye at +z; the back is seen from below, so it is mirrored to read the right way.
      uvs.push(up ? x / width + 0.5 : 0.5 - x / width, 0.5 - z / depth);
    }
    const start = indices.length;
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i,
        b = base + 1 + ((i + 1) % n);
      if (up) indices.push(base, a, b);
      else indices.push(base, b, a);
    }
    return [start, indices.length - start] as const;
  };
  const top = cap(half, true),
    bottom = cap(-half, false);
  // The edge: a band round the outline.
  const base = positions.length / 3;
  let length = 0;
  const along = outline.map((p, i) => {
    if (i) length += Math.hypot(p[0] - outline[i - 1][0], p[1] - outline[i - 1][1]);
    return length;
  });
  length += Math.hypot(outline[0][0] - outline[n - 1][0], outline[0][1] - outline[n - 1][1]);
  for (let i = 0; i <= n; i++) {
    const [x, z] = outline[i % n],
      cx = Math.max(-width / 2 + radius, Math.min(width / 2 - radius, x)),
      cz = Math.max(-depth / 2 + radius, Math.min(depth / 2 - radius, z)),
      nx = x - cx,
      nz = z - cz,
      d = Math.hypot(nx, nz) || 1,
      u = i === n ? 1 : along[i] / length;
    for (const [y, v] of [[-half, 0], [half, 1]]) {
      positions.push(x, y, z);
      normals.push(nx / d, 0, nz / d);
      uvs.push(u, v);
    }
  }
  const start = indices.length;
  for (let i = 0; i < n; i++) {
    const a = base + i * 2,
      b = a + 2;
    indices.push(a, b + 1, a + 1, a, b, b + 1);
  }
  const sides = [start, indices.length - start] as const;
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(top[0], top[1], 0);
  geometry.addGroup(bottom[0], bottom[1], 1);
  geometry.addGroup(sides[0], sides[1], 2);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
