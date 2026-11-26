import * as T from "three";
import { canvas, glow, normalFrom, painted, puff, stream, texture, type Own } from "../goldraid/paint";
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
  /** The banners' cloth, waved each frame toward the wind (m/s along the world's +x). */
  tick(time: number, wind: number): void;
  dispose(): void;
}
const HAZE = "#e9c9a4";
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
  // ── Far away: three ranges of mountains, bluer and paler the further they are, and the low sun and clouds. ──
  const ranges: [number, number, string, number][] = [
    [-420, 120, "#8d8fb0", 0.004],
    [-300, 70, "#9b8ea3", 0.008],
    [-190, 34, "#8a7f78", 0.016],
  ];
  ranges.forEach(([z, high, colour, wave], k) => {
    const shape = new T.Shape(),
      wide = 1400,
      seed = stream(30 + k);
    shape.moveTo(-wide, -40);
    for (let x = -wide; x <= wide; x += 12) {
      const y = high * (0.35 + 0.35 * Math.sin(x * wave + seed() * 0.3 + k) + 0.22 * Math.sin(x * wave * 2.7 + k * 2) + 0.08 * Math.sin(x * wave * 7.1)) + seed() * high * 0.05;
      shape.lineTo(x, y);
    }
    shape.lineTo(wide, -40);
    shape.closePath();
    const mountain = new T.Mesh(own(new T.ShapeGeometry(shape)), own(new T.MeshBasicMaterial({ color: colour, fog: true })));
    mountain.position.z = z;
    group.add(mountain);
  });
  const sun = new T.Sprite(own(new T.SpriteMaterial({ map: glow(own, 256, 0.18), color: "#ffd6a0", fog: false, depthWrite: false, transparent: true })));
  sun.scale.set(150, 150, 1);
  sun.position.set(170 * mirror, 70, -470);
  group.add(sun);
  const cloudMat = [1, 2, 3].map((seed) => own(new T.SpriteMaterial({ map: puff(own, 256, seed), color: "#ffe9d2", opacity: 0.85, transparent: true, depthWrite: false, fog: false })));
  const clouds: T.Sprite[] = [];
  for (let k = 0; k < 14; k++) {
    const c = new T.Sprite(cloudMat[k % 3]),
      w = 40 + random() * 70;
    c.scale.set(w, w * 0.42, 1);
    c.position.set((random() * 2 - 1) * 520, 70 + random() * 110, -380 - random() * 40);
    group.add(c);
    clouds.push(c);
  }
  // ── Trees behind the line: dark pines and a persimmon heavy with fruit; stones and a cairn. ──
  const bark = own(new T.MeshLambertMaterial({ color: "#4a3527" })),
    needles = own(new T.MeshLambertMaterial({ color: "#3e5a3a" })),
    leaves = own(new T.MeshLambertMaterial({ color: "#b5662e" })),
    fruit = own(new T.MeshLambertMaterial({ color: "#f07a1c", emissive: "#3a1400" })),
    rock = own(new T.MeshLambertMaterial({ color: "#8b8478" })),
    trunkG = own(new T.CylinderGeometry(0.12, 0.2, 1, 7).translate(0, 0.5, 0)),
    coneG = own(new T.ConeGeometry(1, 1.6, 8).translate(0, 0.8, 0)),
    blobG = own(new T.IcosahedronGeometry(1, rich ? 2 : 1)),
    fruitG = own(new T.SphereGeometry(0.09, 8, 6)),
    rockG = own(new T.DodecahedronGeometry(1, 0));
  const pine = (x: number, z: number, size: number) => {
    const t = new T.Group(),
      y = heightAt(x, z);
    t.position.set(x, y, z);
    const trunk = new T.Mesh(trunkG, bark);
    trunk.scale.set(size, size * 2.2, size);
    t.add(trunk);
    for (let k = 0; k < 4; k++) {
      const c = new T.Mesh(coneG, needles),
        s = size * (1.6 - k * 0.32);
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
      st = new T.Mesh(rockG, rock);
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
  return {
    group,
    tick(time, wind) {
      sway.time.value = time;
      sway.wind.value = wind;
      for (const c of clouds) c.position.x += 0.02 * Math.sign(wind || 1);
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
/** The sky behind everything: deep blue above, the warm haze at the horizon. */
export function skyTexture(own: Own) {
  return painted(own, 16, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#4f6fa8");
    g.addColorStop(0.45, "#a8b4cc");
    g.addColorStop(0.72, "#f1cfa6");
    g.addColorStop(1, HAZE);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 512);
  });
}
export const HAZE_COLOUR = HAZE;
