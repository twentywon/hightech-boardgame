import * as T from "three";
import { canvas, glow, normalFrom, painted, puff, stream, texture, type Own } from "../goldraid/paint";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { compactStill } from "../badminton/merge";
import { ground, standX, type Land } from "./rules";

/**
 * The field of 활잡이 결투: a highland of silver grass (억새) at the end of an autumn afternoon. The ground follows the
 * rules' ground along the line the archers stand on (z = 0) and rises behind into rolling hills; beyond lie three
 * ranges of mountains fading into the haze, clouds and a low sun. Each archer's banner stands on its mound beside it
 * and streams with the wind. The silver grass sways in a shader (no work for the processor each frame). Everything is
 * drawn in the world's x (`mirror` −1 shows the field from its other side) and built again when the field changes.
 */
export interface Field {
  group: T.Group;
  /** The banners' cloth, waved each frame toward the wind (m/s along the world's +x); the falling leaves kept about `lookX`. */
  tick(time: number, wind: number, lookX?: number, dt?: number): void;
  dispose(): void;
}
const HAZE = "#e9c9a4";
/** The light of a match's hour: a clear morning, the golden afternoon or the red of sunset (by the field, so alike on both devices). */
export interface Daylight {
  name: "morning" | "afternoon" | "sunset";
  sky: [number, string][];
  haze: string;
  sun: { colour: string; intensity: number; at: [number, number, number] };
  sky_light: { sky: string; ground: string; intensity: number };
  disc: { colour: string; high: number };
  clouds: string;
  /** The mountains' colours, near to far. */
  ranges: [string, string, string];
}
const DAYLIGHTS: Daylight[] = [
  {
    name: "morning",
    sky: [
      [0, "#3f78c8"],
      [0.45, "#8fb6e2"],
      [0.75, "#d6e4ef"],
      [1, "#e6eaea"],
    ],
    haze: "#e6eaea",
    sun: { colour: "#fff4e0", intensity: 2.7, at: [-30, 40, 26] },
    sky_light: { sky: "#d8e6ff", ground: "#7d7046", intensity: 1.7 },
    disc: { colour: "#fff6dc", high: 120 },
    clouds: "#ffffff",
    ranges: ["#7a8a7a", "#8a9ab4", "#a7b7cf"],
  },
  {
    name: "afternoon",
    sky: [
      [0, "#4f6fa8"],
      [0.45, "#a8b4cc"],
      [0.72, "#f1cfa6"],
      [1, HAZE],
    ],
    haze: HAZE,
    sun: { colour: "#ffe0b2", intensity: 2.6, at: [-26, 34, 30] },
    sky_light: { sky: "#cfdcff", ground: "#8a6a44", intensity: 1.6 },
    disc: { colour: "#ffd6a0", high: 70 },
    clouds: "#ffe9d2",
    ranges: ["#8a7f78", "#9b8ea3", "#8d8fb0"],
  },
  {
    name: "sunset",
    sky: [
      [0, "#2b2f62"],
      [0.38, "#8c4f7a"],
      [0.62, "#e9785a"],
      [0.85, "#f7b26a"],
      [1, "#f3c48a"],
    ],
    haze: "#eab08a",
    sun: { colour: "#ffb27a", intensity: 2.3, at: [-34, 16, 22] },
    sky_light: { sky: "#b59ad8", ground: "#7a4a30", intensity: 1.35 },
    disc: { colour: "#ff9a5a", high: 26 },
    clouds: "#ffb59a",
    ranges: ["#6e5560", "#7d5f78", "#8b6f92"],
  },
];
/** The hour a field is played at. */
export const daylight = (land: Land): Daylight => DAYLIGHTS[Math.abs(Math.round(land.span * 7 + land.mounds[0] * 31 + land.mounds[1] * 17)) % DAYLIGHTS.length];
/** The world height of the ground at world x, the field mirrored by `mirror`. */
export const worldGround = (land: Land, mirror: number, x: number) => ground(land, x * mirror);
/** A smooth step from 0 at `a` to 1 at `b`. */
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function buildField(scene: T.Scene, land: Land, mirror: number, colours: [string, string], rich: boolean): Field {
  const group = new T.Group(),
    owned: { dispose(): void }[] = [],
    own: Own = (r) => (owned.push(r), r),
    random = stream(Math.round(land.span * 1000 + land.mounds[0] * 77 + land.mounds[1] * 131)),
    reach = land.span / 2 + 80,
    behind = (x: number) => 3.5 + 2.6 * Math.sin(x * 0.045 + land.roll[0][2]) + 1.8 * Math.sin(x * 0.11 + 1.3) + 1.2 * Math.sin(x * 0.23 + land.roll[1][2]),
    heightAt = (x: number, z: number) => {
      const line = worldGround(land, mirror, x);
      if (z >= -1.5) return line - Math.max(0, z - 2) * 0.09 - Math.max(0, z - 12) * 0.12;
      const k = smooth(-1.5, -26, z);
      return line * (1 - k * 0.6) + behind(x) * k + Math.max(0, -z - 26) * 0.18;
    };
  scene.add(group);
  // ── The ground: grass painted in code, a little relief on a graphics card, the earth bare on the mounds. ──
  const grassCanvas = canvas(512, 512, (ctx) => {
    ctx.fillStyle = "#9a8a52";
    ctx.fillRect(0, 0, 512, 512);
    const r = stream(11);
    for (let k = 0; k < 9000; k++) {
      const x = r() * 512,
        y = r() * 512,
        l = 4 + r() * 10,
        hue = 38 + r() * 26,
        light = 30 + r() * 30;
      ctx.strokeStyle = `hsla(${hue}, ${35 + r() * 25}%, ${light}%, ${0.35 + r() * 0.4})`;
      ctx.lineWidth = 1 + r() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 4, y - l);
      ctx.stroke();
    }
  });
  const heightCanvas = canvas(256, 256, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 256, 256);
    const r = stream(12);
    for (let k = 0; k < 2600; k++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.08 + r() * 0.12})`;
      ctx.fillRect(r() * 256, r() * 256, 1 + r() * 3, 2 + r() * 6);
    }
  });
  const grassMap = texture(own, grassCanvas, { repeat: [1, 1] }),
    groundMat = own(
      rich
        ? new T.MeshStandardMaterial({ map: grassMap, vertexColors: true, roughness: 0.95, normalMap: normalFrom(own, heightCanvas, 3, [1, 1]), normalScale: new T.Vector2(0.6, 0.6) })
        : new T.MeshLambertMaterial({ map: grassMap, vertexColors: true }),
    );
  // Columns along x (finer near the line), rows across z from in front of the eye to the hills behind.
  const step = rich ? 0.35 : 0.6,
    xs: number[] = [];
  for (let x = -reach; x <= reach + 1e-6; x += step) xs.push(x);
  const zs = [46, 30, 20, 12, 7, 4, 2.2, 1, 0.3, -0.4, -1.2, -2.4, -4, -6.5, -10, -15, -21, -28, -36, -46, -60, -80];
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    index: number[] = [],
    earth = new T.Color("#8b6a45"),
    straw = new T.Color("#c7b27a"),
    green = new T.Color("#8f9a5c"),
    tint = new T.Color();
  zs.forEach((z, j) =>
    xs.forEach((x, i) => {
      const y = heightAt(x, z);
      positions.push(x, y, z);
      uvs.push(x / 7, z / 7);
      // Bare earth worn by the archers' feet on the mounds, straw and green patches elsewhere.
      const worn = Math.max(0, ...[0, 1].map((s) => 1 - Math.hypot((x - standX(land, s as 0 | 1) * mirror) / 2.2, z / 1.6))),
        patch = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.07 - z * 0.23 + 1.1);
      tint.copy(straw).lerp(green, patch * 0.7).lerp(earth, Math.min(1, worn * 1.4));
      const shade = 0.92 + 0.16 * random();
      colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
      if (i && j) {
        const a = (j - 1) * xs.length + i - 1,
          b = a + 1,
          c = j * xs.length + i - 1,
          d = c + 1;
        index.push(a, b, c, b, d, c);
      }
    }),
  );
  const land3 = own(new T.BufferGeometry());
  land3.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  land3.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  land3.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  land3.setIndex(index);
  land3.computeVertexNormals();
  const field = new T.Mesh(land3, groundMat);
  field.receiveShadow = true;
  group.add(field);
  // ── Far away: three ranges of mountains, paler and hazier the further they are (snow on the highest peaks), a band of
  // haze lying in the valleys between, the sun low in the sky and clouds. ──
  const light = daylight(land),
    hazeColour = new T.Color(light.haze),
    snow = new T.Color(light.name === "sunset" ? "#ffd2c0" : "#f4f6fa");
  const ranges: [number, number, string, number, number][] = [
    [-420, 120, light.ranges[2], 0.004, 0.5],
    [-300, 70, light.ranges[1], 0.008, 0.4],
    [-190, 34, light.ranges[0], 0.016, 0.18],
  ];
  ranges.forEach(([z, high, colour, wave, misty], k) => {
    const wide = 1400,
      seed = stream(30 + k),
      ridge: [number, number][] = [];
    for (let x = -wide; x <= wide; x += 10) {
      const y = high * (0.35 + 0.35 * Math.sin(x * wave + seed() * 0.3 + k) + 0.22 * Math.sin(x * wave * 2.7 + k * 2) + 0.08 * Math.sin(x * wave * 7.1)) + seed() * high * 0.05;
      ridge.push([x, y]);
    }
    const rows = [0, 0.5, 0.8, 0.93, 1],
      positions: number[] = [],
      colors: number[] = [],
      index: number[] = [],
      base = new T.Color(colour),
      c = new T.Color(),
      sunSide = -Math.sign(light.sun.at[0]) * mirror;
    ridge.forEach(([x, y], i) => {
      const slope = i ? (y - ridge[i - 1][1]) / 10 : 0,
        lit = Math.max(-1, Math.min(1, slope * sunSide * 1.6));
      rows.forEach((t, j) => {
        const yy = -40 + (y + 40) * t;
        positions.push(x, yy, 0);
        // Hazier toward the foot; the sunny slopes lighter, the shaded darker; snow above the line on the far range.
        c.copy(base).lerp(hazeColour, misty + (1 - t) * 0.45 * (1 - misty));
        c.multiplyScalar(1 + lit * 0.12 * t);
        if (k === 0 && t > 0.9 && y > high * 0.78) c.lerp(snow, Math.min(1, (y - high * 0.78) / (high * 0.15)) * 0.75);
        colors.push(c.r, c.g, c.b);
        if (i && j) {
          const n = rows.length,
            a = (i - 1) * n + j - 1,
            b2 = a + 1,
            d = i * n + j - 1,
            e = d + 1;
          index.push(a, d, b2, b2, d, e);
        }
      });
    });
    const g = own(new T.BufferGeometry());
    g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    g.setIndex(index);
    const mountain = new T.Mesh(g, own(new T.MeshBasicMaterial({ vertexColors: true, fog: true })));
    mountain.position.z = z;
    group.add(mountain);
  });
  // The haze in the valleys: a long band, thick at its foot and gone at its top, before the nearer two ranges (a
  // graphics card only: drawn by the processor, two wide see-through bands cost a fifth of the frames).
  const hazeBand = canvas(8, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.6, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0.9)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
  });
  for (const [z, y, h] of rich
    ? [
        [-410, -6, 70],
        [-290, -10, 46],
      ]
    : []) {
    const band = new T.Mesh(
      own(new T.PlaneGeometry(2800, h)),
      own(new T.MeshBasicMaterial({ map: texture(own, hazeBand), color: light.haze, transparent: true, depthWrite: false, fog: false })),
    );
    band.position.set(0, y + h / 2, z + 6);
    group.add(band);
  }
  const sun = new T.Sprite(own(new T.SpriteMaterial({ map: glow(own, 256, 0.18), color: light.disc.colour, fog: false, depthWrite: false, transparent: true })));
  sun.scale.set(150, 150, 1);
  sun.position.set(170 * mirror, light.disc.high, -470);
  group.add(sun);
  const cloudMat = [1, 2, 3].map((seed) => own(new T.SpriteMaterial({ map: puff(own, 256, seed), color: light.clouds, opacity: 0.85, transparent: true, depthWrite: false, fog: false })));
  const clouds: T.Sprite[] = [];
  for (let k = 0; k < 16; k++) {
    const c = new T.Sprite(cloudMat[k % 3]),
      w = 40 + random() * 70;
    c.scale.set(w, w * 0.42, 1);
    c.position.set((random() * 2 - 1) * 520, 70 + random() * 110, -380 - random() * 40);
    group.add(c);
    clouds.push(c);
  }
  // ── Trees behind the line: dark pines and a persimmon heavy with fruit; stones and a cairn. ──
  const bark = own(new T.MeshLambertMaterial({ color: "#4a3527" })),
    needles = own(new T.MeshLambertMaterial({ color: "#35503a", side: T.DoubleSide })),
    leaves = own(new T.MeshLambertMaterial({ color: "#b5662e" })),
    fruit = own(new T.MeshLambertMaterial({ color: "#f07a1c", emissive: "#3a1400" })),
    rock = own(rich ? new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }) : new T.MeshLambertMaterial({ vertexColors: true })),
    trunkG = own(new T.CylinderGeometry(0.12, 0.2, 1, 7).translate(0, 0.5, 0)),
    // A pine's tier: a cone whose rim goes in and out like branch tips, its tips drooping a little.
    coneG = own(
      (() => {
        const g = new T.ConeGeometry(1, 1.6, 14, 2, true).translate(0, 0.8, 0),
          pos = g.attributes.position as T.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i),
            z = pos.getZ(i),
            y = pos.getY(i),
            a = Math.atan2(z, x),
            rim = 1 - y / 1.6,
            out = 1 + Math.cos(a * 7) * 0.22 * rim;
          pos.setXYZ(i, x * out, y - (out - 1) * 0.5 * rim, z * out);
        }
        g.computeVertexNormals();
        return g;
      })(),
    ),
    needlesLight = own(new T.MeshLambertMaterial({ color: "#4d6b43", side: T.DoubleSide })),
    blobG = own(new T.IcosahedronGeometry(1, rich ? 2 : 1)),
    fruitG = own(new T.SphereGeometry(0.09, 8, 6)),
    rockShapes = [0, 1, 2].map((seed) => {
      // A lumpy stone: an icosahedron pushed in and out, grey with lichen and moss on its top.
      const g = own(new T.IcosahedronGeometry(1, 1)),
        pos = g.attributes.position as T.BufferAttribute,
        r = stream(70 + seed),
        bumps = [0, 1, 2, 3].map(() => new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()),
        v = new T.Vector3(),
        colours: number[] = [],
        grey = new T.Color("#8d877c"),
        moss = new T.Color("#6f7a3e"),
        lichen = new T.Color("#c2b78a"),
        c = new T.Color();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).normalize();
        const push = 1 + bumps.reduce((sum, b, k) => sum + Math.max(0, v.dot(b)) ** 3 * (k ? -0.18 : 0.22), 0) + (r() - 0.5) * 0.08;
        v.multiplyScalar(push);
        pos.setXYZ(i, v.x, v.y, v.z);
        c.copy(grey).multiplyScalar(0.85 + r() * 0.25);
        if (v.y > 0.35) c.lerp(moss, Math.min(1, (v.y - 0.35) * 1.6) * 0.7);
        else if (r() < 0.12) c.lerp(lichen, 0.5);
        colours.push(c.r, c.g, c.b);
      }
      g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
      g.computeVertexNormals();
      return g;
    }),
    rockG = rockShapes[0];
  const pine = (x: number, z: number, size: number) => {
    const t = new T.Group(),
      y = heightAt(x, z);
    t.position.set(x, y, z);
    const trunk = new T.Mesh(trunkG, bark);
    trunk.scale.set(size, size * 2.2, size);
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const c = new T.Mesh(coneG, k % 2 ? needlesLight : needles),
        s = size * (1.6 - k * 0.32);
      c.rotation.y = k * 0.9 + x;
      c.scale.set(s, size * 1.2, s);
      c.position.y = size * (1.6 + k * 1.05);
      c.castShadow = true;
      t.add(c);
    }
    group.add(t);
  };
  const persimmon = (x: number, z: number, size: number) => {
    const t = new T.Group();
    t.position.set(x, heightAt(x, z), z);
    const trunk = new T.Mesh(trunkG, bark);
    trunk.scale.set(size * 1.4, size * 2.8, size * 1.4);
    trunk.castShadow = true;
    t.add(trunk);
    const r = stream(Math.round(x * 13));
    for (let k = 0; k < 5; k++) {
      const b = new T.Mesh(blobG, leaves);
      b.scale.setScalar(size * (1 + r() * 0.5));
      b.position.set((r() - 0.5) * size * 2.6, size * (3.2 + r() * 1.3), (r() - 0.5) * size * 1.4);
      b.castShadow = true;
      t.add(b);
    }
    for (let k = 0; k < 26; k++) {
      const f = new T.Mesh(fruitG, fruit),
        a = r() * Math.PI * 2;
      f.position.set(Math.cos(a) * size * (0.8 + r() * 1.4), size * (2.6 + r() * 2.2), Math.sin(a) * size * 1.2 + size * 0.5);
      t.add(f);
    }
    group.add(t);
  };
  const forest = rich ? 46 : 24;
  for (let k = 0; k < forest; k++) {
    const z = -15 - random() * 48,
      x = (random() * 2 - 1) * (reach - z * 0.5);
    pine(x, z, 0.8 + random() * 1.2);
  }
  persimmon(-land.span * 0.18 * mirror, -11, 0.8);
  persimmon(land.span * 0.32 * mirror, -18, 1.1);
  for (let k = 0; k < (rich ? 40 : 18); k++) {
    const x = (random() * 2 - 1) * reach,
      z = -1.6 - random() * 20,
      s = 0.15 + random() * 0.5,
      st = new T.Mesh(rockShapes[k % 3], rock);
    st.scale.set(s * 1.3, s * 0.7, s);
    st.rotation.set(random(), random() * 3, random());
    st.position.set(x, heightAt(x, z) + s * 0.2, z);
    st.castShadow = st.receiveShadow = true;
    group.add(st);
  }
  // A cairn halfway, as old fields have.
  const cairn = new T.Group();
  cairn.position.set(0, heightAt(0, -3), -3);
  for (let k = 0; k < 6; k++) {
    const st = new T.Mesh(rockG, rock),
      s = 0.32 - k * 0.04;
    st.scale.set(s * 1.4, s * 0.8, s * 1.2);
    st.position.y = 0.15 + k * 0.2;
    st.rotation.y = k;
    st.castShadow = true;
    cairn.add(st);
  }
  group.add(cairn);
  // ── Wild asters and yellow patrinia among the grass, and low autumn shrubs (each kind one draw). ──
  const flowerG = own(new T.IcosahedronGeometry(0.06, 0)),
    flowerMat = own(new T.MeshLambertMaterial({ color: "#ffffff" })),
    flowerCount = rich ? 700 : 160,
    flowers = new T.InstancedMesh(flowerG, flowerMat, flowerCount),
    petals = ["#efe8ff", "#b9a4e8", "#9c86d6", "#f4d24a", "#fbf6ea"].map((c) => new T.Color(c)),
    fm = new T.Matrix4(),
    fq = new T.Quaternion(),
    fv = new T.Vector3(),
    fs = new T.Vector3();
  let placed = 0;
  for (let k = 0; placed < flowerCount && k < flowerCount * 3; k++) {
    const x = (random() * 2 - 1) * reach,
      z = random() < 0.25 ? 1 + random() * 5 : -1.2 - random() * random() * 18;
    if (z > 0 && [0, 1].some((s2) => Math.abs(x - standX(land, s2 as 0 | 1) * mirror) < 2.4)) continue;
    const size = 0.6 + random() * 0.8;
    fv.set(x, heightAt(x, z) + 0.12 + random() * 0.2, z);
    fs.set(size, size * 0.6, size);
    fm.compose(fv, fq, fs);
    flowers.setMatrixAt(placed, fm);
    flowers.setColorAt(placed, petals[Math.floor(random() * petals.length)]);
    placed++;
  }
  flowers.count = placed;
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  group.add(flowers);
  // A shrub: a few lumps of leaves together, lighter on top.
  const shrubG = own(
      (() => {
        const r2 = stream(91),
          parts = [0, 1, 2, 3, 4].map((k) => {
            const g = new T.IcosahedronGeometry(0.42 + r2() * 0.25, 1),
              pos = g.attributes.position as T.BufferAttribute;
            for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (0.9 + r2() * 0.2), pos.getY(i) * (0.85 + r2() * 0.2), pos.getZ(i) * (0.9 + r2() * 0.2));
            const a = (k / 5) * Math.PI * 2;
            return g.translate(Math.cos(a) * 0.45 * (k ? 1 : 0), 0.1 + r2() * 0.25 + (k ? 0 : 0.25), Math.sin(a) * 0.35 * (k ? 1 : 0));
          }),
          merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
        for (const g of parts) g.dispose();
        merged.computeVertexNormals();
        return merged;
      })(),
    ),
    shrubMat = own(new T.MeshLambertMaterial({ color: "#ffffff" })),
    shrubCount = rich ? 50 : 16,
    shrubs = new T.InstancedMesh(shrubG, shrubMat, shrubCount),
    autumn = ["#5d6a2e", "#7a4426", "#4f5a2a", "#8a6230", "#6b5a2a"].map((c) => new T.Color(c));
  for (let k = 0; k < shrubCount; k++) {
    const x = (random() * 2 - 1) * reach,
      z = -4 - random() * 16,
      size = 0.25 + random() * 0.35;
    fv.set(x, heightAt(x, z) + size * 0.35, z);
    fq.setFromEuler(new T.Euler(0, random() * 3, 0));
    fs.set(size * 1.3, size, size);
    fm.compose(fv, fq, fs);
    shrubs.setMatrixAt(k, fm);
    shrubs.setColorAt(k, autumn[k % autumn.length].clone().multiplyScalar(0.85 + random() * 0.3));
  }
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  shrubs.instanceMatrix.needsUpdate = true;
  if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
  group.add(shrubs);
  // Leaves blowing across the field with the wind (a graphics card only: they are moved every frame).
  const leafCount = rich ? 90 : 0,
    leafG = own(new T.PlaneGeometry(0.09, 0.06)),
    leafMat = own(new T.MeshLambertMaterial({ color: "#ffffff", side: T.DoubleSide })),
    leavesFalling = leafCount ? new T.InstancedMesh(leafG, leafMat, leafCount) : null,
    leafState = Array.from({ length: leafCount }, () => ({
      x: (random() * 2 - 1) * 16,
      y: random() * 6,
      z: 3 - random() * 9,
      spin: random() * 6,
      rate: 2 + random() * 4,
      fall: 0.25 + random() * 0.35,
      drift: 0.6 + random() * 0.8,
    }));
  if (leavesFalling) {
    const tints = ["#d9822b", "#b8461f", "#e6b13a", "#9a5a2a", "#c9662a"].map((c) => new T.Color(c));
    for (let k = 0; k < leafCount; k++) leavesFalling.setColorAt(k, tints[k % tints.length]);
    leavesFalling.frustumCulled = false;
    if (leavesFalling.instanceColor) leavesFalling.instanceColor.needsUpdate = true;
    group.add(leavesFalling);
  }
  // ── Silver grass: blades with a pale plume, swaying in the shader by time and the wind. ──
  const sway = { time: { value: 0 }, wind: { value: 0 } },
    plumeCanvas = canvas(64, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "rgba(250,244,230,0.95)");
      g.addColorStop(0.35, "rgba(232,220,196,0.85)");
      g.addColorStop(0.5, "rgba(190,170,120,0.9)");
      g.addColorStop(1, "rgba(120,110,70,1)");
      ctx.fillStyle = g;
      const r = stream(5);
      for (let k = 0; k < 60; k++) {
        const x = 32 + (r() - 0.5) * 30 * (1 - k / 80);
        ctx.fillRect(x, (k / 60) * 120, 2, 140);
      }
      ctx.fillRect(30, 120, 4, 136);
    }),
    reedMat = own(new T.MeshLambertMaterial({ map: texture(own, plumeCanvas), transparent: true, alphaTest: 0.25, side: T.DoubleSide }));
  reedMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sway.time;
    shader.uniforms.uWind = sway.wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float bend = position.y * position.y;
        transformed.x += (sin(uTime * 1.6 + base.x * 0.55 + base.z * 0.3) * 0.08 + uWind * 0.018) * bend;`,
      );
  };
  const reedG = own(new T.PlaneGeometry(0.12, 1, 1, 4).translate(0, 0.5, 0)),
    count = rich ? 1600 : 600,
    reeds = new T.InstancedMesh(reedG, reedMat, count),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    e = new T.Euler(),
    v = new T.Vector3(),
    sc = new T.Vector3();
  let n = 0;
  for (let k = 0; n < count && k < count * 3; k++) {
    const front = random() < 0.12,
      x = (random() * 2 - 1) * reach,
      z = front ? 2.2 + random() * 5 : -1.4 - random() * random() * 22,
      tall = front ? 0.25 + random() * 0.3 : 0.6 + random() * 0.9;
    // None standing just in front of the archers, where they would hide a foot or an arrow in the ground.
    if (front && [0, 1].some((s) => Math.abs(x - standX(land, s as 0 | 1) * mirror) < 3)) continue;
    e.set(0, random() * Math.PI, (random() - 0.5) * 0.2);
    q.setFromEuler(e);
    v.set(x, heightAt(x, z) - 0.03, z);
    sc.set(1 + random() * 0.6, tall, 1);
    m.compose(v, q, sc);
    reeds.setMatrixAt(n++, m);
  }
  reeds.count = n;
  reeds.instanceMatrix.needsUpdate = true;
  reeds.frustumCulled = false;
  group.add(reeds);
  // Short tufts of grass under the silver grass, nearer and thicker (the same sway).
  const tuftCanvas = canvas(128, 128, (ctx) => {
      const r = stream(8);
      for (let k = 0; k < 46; k++) {
        const x = 20 + r() * 88,
          lean = (r() - 0.5) * 40,
          high = 50 + r() * 76;
        ctx.strokeStyle = `hsl(${40 + r() * 40}, ${30 + r() * 30}%, ${28 + r() * 30}%)`;
        ctx.lineWidth = 2 + r() * 2.5;
        ctx.beginPath();
        ctx.moveTo(x, 128);
        ctx.quadraticCurveTo(x + lean * 0.3, 128 - high * 0.6, x + lean, 128 - high);
        ctx.stroke();
      }
    }),
    tuftMat = own(new T.MeshLambertMaterial({ map: texture(own, tuftCanvas), transparent: true, alphaTest: 0.4, side: T.DoubleSide }));
  tuftMat.onBeforeCompile = reedMat.onBeforeCompile;
  // (Without a graphics card fewer, and only behind the line where they are small on the screen.)
  const tuftCount = rich ? 2200 : 260,
    tufts = new T.InstancedMesh(own(new T.PlaneGeometry(0.5, 0.4, 1, 3).translate(0, 0.2, 0)), tuftMat, tuftCount);
  let tn = 0;
  for (let k = 0; tn < tuftCount && k < tuftCount * 3; k++) {
    const x = (random() * 2 - 1) * reach,
      z = rich && random() < 0.4 ? 0.8 + random() * 7 : -1 - random() * random() * 16;
    if (z > 0 && [0, 1].some((s2) => Math.abs(x - standX(land, s2 as 0 | 1) * mirror) < 1.8)) continue;
    e.set(0, random() * Math.PI, 0);
    q.setFromEuler(e);
    v.set(x, heightAt(x, z) - 0.02, z);
    const size = 0.6 + random() * 0.8;
    sc.set(size, size * (0.7 + random() * 0.6), 1);
    m.compose(v, q, sc);
    tufts.setMatrixAt(tn++, m);
  }
  tufts.count = tn;
  tufts.instanceMatrix.needsUpdate = true;
  tufts.frustumCulled = false;
  tufts.receiveShadow = true;
  group.add(tufts);
  // ── The banners on the mounds, each in its archer's colour, streaming with the wind. ──
  const poleG = own(new T.CylinderGeometry(0.025, 0.03, 2.6, 8).translate(0, 1.3, 0)),
    poleMat = own(new T.MeshLambertMaterial({ color: "#3a2a1c" })),
    cloths: { geometry: T.BufferGeometry; rest: Float32Array; top: T.Vector3 }[] = [];
  [0, 1].forEach((s) => {
    const x = standX(land, s as 0 | 1) * mirror,
      side = Math.sign(x) || 1,
      px = x + side * 1.4,
      pz = -0.9,
      py = heightAt(px, pz),
      pole = new T.Mesh(poleG, poleMat);
    pole.position.set(px, py, pz);
    pole.castShadow = true;
    group.add(pole);
    const g = own(new T.PlaneGeometry(1.1, 0.6, 12, 6).translate(0.55, -0.3, 0)),
      flag = new T.Mesh(g, own(new T.MeshLambertMaterial({ color: colours[s], side: T.DoubleSide }))),
      top = new T.Vector3(px, py + 2.55, pz);
    flag.position.copy(top);
    flag.castShadow = true;
    group.add(flag);
    cloths.push({ geometry: g, rest: Float32Array.from(g.attributes.position.array as Float32Array), top });
    const knob = new T.Mesh(own(new T.SphereGeometry(0.05, 8, 6)), own(new T.MeshLambertMaterial({ color: "#c9a046" })));
    knob.position.set(px, py + 2.62, pz);
    group.add(knob);
  });
  // Everything that stands still and shares a material is drawn at once.
  compactStill(group, own);
  const lm = new T.Matrix4(),
    lq = new T.Quaternion(),
    le = new T.Euler(),
    lv = new T.Vector3(),
    ls = new T.Vector3(1, 1, 1);
  let lastTime = 0;
  return {
    group,
    tick(time, wind, lookX = 0, step) {
      const dt = step ?? Math.min(0.1, Math.max(0, time - lastTime));
      lastTime = time;
      sway.time.value = time;
      sway.wind.value = wind;
      for (const c of clouds) c.position.x += 0.02 * Math.sign(wind || 1);
      // The leaves ride the wind (a little breeze even when calm), flutter down, and come round again about the eye.
      if (leavesFalling) {
        const blow = wind + (Math.abs(wind) < 0.3 ? 0.6 : 0);
        leafState.forEach((l, k) => {
          l.x += (blow * 0.55 * l.drift + Math.sin(time * 1.3 + k) * 0.25) * dt;
          l.y -= l.fall * dt * (0.7 + 0.3 * Math.sin(time * l.rate + k));
          l.spin += l.rate * dt;
          const ground0 = heightAt(lookX + l.x, l.z);
          if (l.y < ground0 + 0.02 && l.y < -0.5 + ground0) l.y = 4 + Math.random() * 3;
          if (l.y < ground0 + 0.02) l.y = ground0 + 0.02;
          if (l.x > 16) l.x -= 32;
          if (l.x < -16) l.x += 32;
          // Lying leaves stop spinning; they are lifted again once out of sight.
          const lying = l.y <= ground0 + 0.03;
          if (lying && Math.random() < dt * 0.4) l.y = 4 + Math.random() * 3;
          le.set(lying ? -Math.PI / 2 : Math.sin(l.spin) * 1.2, l.spin * 0.7, lying ? 0 : Math.cos(l.spin * 0.8));
          lq.setFromEuler(le);
          lv.set(lookX + l.x, l.y, l.z);
          lm.compose(lv, lq, ls);
          leavesFalling.setMatrixAt(k, lm);
        });
        leavesFalling.instanceMatrix.needsUpdate = true;
      }
      // The cloth streams downwind, lifted the more the stronger the wind; becalmed it hangs.
      const strength = Math.min(1, Math.abs(wind) / 4),
        way = wind < 0 ? -1 : 1;
      for (const c of cloths) {
        const pos = c.geometry.attributes.position as T.BufferAttribute,
          arr = pos.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const rx = c.rest[i],
            ry = c.rest[i + 1],
            along = rx / 1.1,
            droop = (1 - strength) * along,
            wave = Math.sin(time * (3 + strength * 5) - along * 6) * along * (0.05 + strength * 0.08);
          arr[i] = way * rx * (0.35 + 0.65 * strength) * (1 - droop * 0.2);
          arr[i + 1] = ry - droop * 0.95 * rx + wave * 0.5;
          arr[i + 2] = wave + (1 - strength) * along * 0.12;
        }
        pos.needsUpdate = true;
        c.geometry.computeVertexNormals();
      }
    },
    dispose() {
      scene.remove(group);
      for (const r of owned) r.dispose();
    },
  };
}
/** The sky behind everything: its colours from the top down to the haze at the horizon, by the hour. */
export function skyTexture(own: Own, light: Daylight = DAYLIGHTS[1]) {
  return painted(own, 16, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [at, colour] of light.sky) g.addColorStop(at, colour);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 512);
  });
}
export const HAZE_COLOUR = HAZE;
