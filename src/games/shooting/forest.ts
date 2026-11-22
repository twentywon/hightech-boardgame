import * as T from "three";
import { furry, stuff } from "../../engine/scene-utils";
import { EDGE, LAKE, inLake, type Kind } from "./hunt";
import { canvas, sequence, skyDome, texture } from "./paint";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/**
 * A wood by a lake at dusk, all modelled and painted in code. The shooter stands on a raised stand at the wood's
 * edge; a meadow runs down to a lake that lies across the middle of the view, with muddy banks, reeds and cattails,
 * lily pads and a fallen log; the wood closes in at both sides and stands along the far shore: spruces, pines,
 * birches and oaks of several sizes and shades, with bushes, ferns and mossy boulders under them, and shafts of the
 * low sun coming through between the trunks. The water mirrors the far shore cheaply: the trees there are drawn again
 * upside down under a half-clear surface painted with the sky's colours and a sun path (no second camera, so that a
 * software-drawn page keeps its pace). The animals are modelled here too (`animalModel`).
 */
export interface Forest {
  /** The water, whose ripples the view moves. */
  water: T.Mesh;
  /** Moves what moves by itself (the water's ripples, the light's shafts), at the page's time in ms. */
  update: (now: number) => void;
}
/** One kind of instanced part of the wood: its shape and paint, and where each of it stands (and its tint). */
interface Crowd {
  geometry: T.BufferGeometry;
  material: T.MeshStandardMaterial;
  shadow: boolean;
  at: { m: T.Matrix4; c: T.Color }[];
}
export function buildForest(scene: T.Scene, keep: Keep): Forest {
  const std = (o: T.MeshStandardMaterialParameters) => keep(new T.MeshStandardMaterial({ roughness: 0.85, ...o })),
    put = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(keep(g), m);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    random = sequence(523),
    between = (a: number, b: number) => a + (b - a) * random(),
    q = new T.Quaternion(),
    turn = (a: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a);
  scene.add(skyDome(keep, "#ffb070", "#d4889a", "#2a3a72", "#ffd08a", 0.25, 460));
  scene.fog = new T.Fog("#9a7f92", 55, 230);
  // The low sun behind the far wood: a soft glow that the trunks stand against.
  const { c: sunC, ctx: sunX } = canvas(256, 256),
    halo = sunX.createRadialGradient(128, 128, 0, 128, 128, 128);
  halo.addColorStop(0, "rgba(255,246,210,1)");
  halo.addColorStop(0.12, "rgba(255,214,150,0.9)");
  halo.addColorStop(0.4, "rgba(255,160,90,0.28)");
  halo.addColorStop(1, "rgba(255,140,80,0)");
  sunX.fillStyle = halo;
  sunX.fillRect(0, 0, 256, 256);
  const sunDir = new T.Vector3(30, 14, -120).normalize(),
    sunSprite = new T.Sprite(
      keep(
        new T.SpriteMaterial({
          map: texture(sunC, keep),
          fog: false,
          depthWrite: false,
          transparent: true,
          blending: T.AdditiveBlending,
        }),
      ),
    );
  sunSprite.position.copy(sunDir.clone().multiplyScalar(420));
  sunSprite.scale.setScalar(120);
  sunSprite.renderOrder = -9;
  scene.add(sunSprite);
  // The meadow: grass with a hole where the lake lies.
  const { c: grassC, ctx: g } = canvas(512, 512);
  g.fillStyle = "#62823f";
  g.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 6000; k++) {
    g.fillStyle = random() < 0.5 ? "rgba(30,45,15,0.22)" : "rgba(190,200,120,0.12)";
    g.fillRect(random() * 512, random() * 512, 1.5, 3 + random() * 4);
  }
  const meadowShape = new T.Shape();
  meadowShape.moveTo(-300, 300);
  meadowShape.lineTo(300, 300);
  meadowShape.lineTo(300, -300);
  meadowShape.lineTo(-300, -300);
  meadowShape.closePath();
  const hole = new T.Path();
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    hole.lineTo(LAKE.x + Math.cos(a) * LAKE.rx, -(LAKE.z + Math.sin(a) * LAKE.rz));
  }
  meadowShape.holes.push(hole);
  const meadowGeometry = new T.ShapeGeometry(meadowShape, 2);
  const uv = meadowGeometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 12, uv.getY(i) / 12);
  const grassMap = texture(grassC, keep);
  grassMap.wrapS = grassMap.wrapT = T.RepeatWrapping;
  const meadow = put(meadowGeometry, std({ ...stuff("grass", "#62823f", 1, keep), map: grassMap }), 0, 0, 0);
  meadow.rotation.x = -Math.PI / 2;
  // The lake's bed, and its banks: a ring of mud and sand sloping from the grass down under the water.
  const bed = put(new T.CircleGeometry(1, 64), std({ color: "#2b3022" }), LAKE.x, LAKE.y - 0.7, LAKE.z);
  bed.rotation.x = -Math.PI / 2;
  bed.scale.set(LAKE.rx, LAKE.rz, 1);
  {
    const n = 96,
      rings = [
        [0.9, LAKE.y - 0.5],
        [0.97, LAKE.y - 0.08],
        [1.0, LAKE.y + 0.03],
        [1.045, 0.035],
        [1.075, 0.01],
      ],
      positions: number[] = [],
      colours: number[] = [],
      index: number[] = [],
      mud = new T.Color("#4a3d2a"),
      sand = new T.Color("#8a7650"),
      grassy = new T.Color("#566e36");
    rings.forEach(([r, y], j) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2,
          wobble = 1 + 0.012 * Math.sin(a * 7 + 1) + 0.008 * Math.sin(a * 13);
        positions.push(LAKE.x + Math.cos(a) * LAKE.rx * r * wobble, y, LAKE.z + Math.sin(a) * LAKE.rz * r * wobble);
        const c = j < 2 ? mud : j === 2 ? sand : j === 3 ? sand.clone().lerp(grassy, 0.5) : grassy;
        colours.push(c.r, c.g, c.b);
      }
    });
    for (let j = 0; j < rings.length - 1; j++)
      for (let k = 0; k < n; k++) {
        const a = j * n + k,
          b = j * n + ((k + 1) % n),
          c = a + n,
          d = b + n;
        index.push(a, c, b, b, c, d);
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    put(geometry, std({ vertexColors: true, roughness: 0.95, side: T.DoubleSide }), 0, 0, 0);
  }
  // The wood: crowds of trunks, crowns, bushes, ferns and stones, each one instanced mesh tinted tree by tree.
  const crowds: Record<string, Crowd> = {},
    mirrored: Record<string, Crowd> = {},
    crowd = (key: string, geometry: T.BufferGeometry, material: T.MeshStandardMaterial, shadow = true) =>
      (crowds[key] ??= { geometry: keep(geometry), material, shadow, at: [] }),
    // The far shore's trees, seen across the water, are mirrored in it.
    mirrors = (x: number, z: number) => z < LAKE.z - LAKE.rz * 0.3 && Math.abs(x - LAKE.x) < LAKE.rx + 8 && z > LAKE.z - LAKE.rz - 22,
    place = (key: string, at: T.Vector3, turnBy: number, size: T.Vector3, tint: T.Color, mirror: boolean) => {
      crowds[key].at.push({
        m: new T.Matrix4().compose(at, turn(turnBy), size),
        c: tint,
      });
      if (mirror) {
        const own = crowds[key];
        (mirrored[key] ??= {
          geometry: own.geometry,
          material: own.material,
          shadow: false,
          at: [],
        }).at.push({
          m: new T.Matrix4().compose(new T.Vector3(at.x, 2 * LAKE.y - at.y, at.z), turn(turnBy), new T.Vector3(size.x, -size.y, size.z)),
          c: tint.clone().multiplyScalar(0.62),
        });
      }
    },
    hsl = (h: number, s: number, l: number) => new T.Color().setHSL(h, s, l);
  // Bark of a birch: white with dark dashes and knots.
  const { c: birchC, ctx: b } = canvas(64, 256);
  b.fillStyle = "#e8e4da";
  b.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 60; k++) {
    b.fillStyle = random() < 0.8 ? "#2a2622" : "#8a8478";
    b.fillRect(random() * 64, random() * 256, 6 + random() * 22, 1.5 + random() * 3);
  }
  const birchMap = texture(birchC, keep, [2, 3]);
  const trunkShape = new T.CylinderGeometry(0.62, 1, 1, 7).translate(0, 0.5, 0),
    coneShape = new T.ConeGeometry(1, 1, 9).translate(0, 0.5, 0),
    ballShape = new T.IcosahedronGeometry(1, 1),
    leafy = (o: T.MeshStandardMaterialParameters = {}) => std({ color: "#ffffff", flatShading: true, roughness: 0.9, ...o });
  crowd("trunk", trunkShape, std({ color: "#ffffff", roughness: 0.95 }));
  crowd("birch", trunkShape.clone(), std({ color: "#ffffff", map: birchMap, roughness: 0.8 }));
  crowd("cone", coneShape, leafy());
  crowd("ball", ballShape, leafy());
  crowd("bush", new T.IcosahedronGeometry(1, 1), leafy(), false);
  const plant = (x: number, z: number, kind = random(), scale = 1) => {
    const mirror = mirrors(x, z),
      v = (a: number, b: number, c: number) => new T.Vector3(a, b, c);
    if (kind < 0.4) {
      // A spruce: a straight dark trunk under four tiers of drooping cones.
      const h = (8 + random() * 10) * scale,
        w = (1.7 + random() * 1.3) * scale,
        tint = hsl(0.31 + random() * 0.05, 0.38, 0.13 + random() * 0.06);
      place("trunk", v(x, 0, z), 0, v(0.28 * scale, h * 0.5, 0.28 * scale), hsl(0.07, 0.3, 0.22), mirror);
      for (let k = 0; k < 4; k++)
        place(
          "cone",
          v(x, h * (0.18 + k * 0.19), z),
          random() * 6,
          v(w * (1 - k * 0.22), h * 0.32, w * (1 - k * 0.22)),
          tint.clone().offsetHSL(0, 0, k * 0.012),
          mirror,
        );
    } else if (kind < 0.6) {
      // A pine: a tall bare reddish trunk with clumps of needles gathered at its top.
      const h = (11 + random() * 8) * scale,
        tint = hsl(0.27 + random() * 0.05, 0.35, 0.18 + random() * 0.05);
      place("trunk", v(x, 0, z), 0, v(0.24 * scale, h * 0.86, 0.24 * scale), hsl(0.05, 0.45, 0.3), mirror);
      for (let k = 0; k < 5; k++) {
        const w = (1.1 + random() * 0.9) * scale,
          a = random() * 6.28,
          r = k ? (0.8 + random() * 0.8) * scale : 0;
        place("ball", v(x + Math.cos(a) * r, h * (0.76 + random() * 0.18), z + Math.sin(a) * r), random() * 6, v(w, w * 0.82, w), tint.clone().offsetHSL(0, 0, (random() - 0.5) * 0.05), mirror);
      }
    } else if (kind < 0.78) {
      // A birch: a slim white trunk, leaning a little, with light yellow-green crowns.
      const h = (7 + random() * 5) * scale,
        tint = hsl(0.19 + random() * 0.05, 0.5, 0.32 + random() * 0.08);
      place("birch", v(x, 0, z), random() * 6, v(0.16 * scale, h * 0.85, 0.16 * scale), new T.Color("#ffffff"), mirror);
      for (let k = 0; k < 3; k++) {
        const w = (1.2 + random() * 1.0) * scale;
        place(
          "ball",
          v(x + (random() - 0.5) * 1.8 * scale, h * (0.62 + k * 0.13), z + (random() - 0.5) * 1.8 * scale),
          random() * 6,
          v(w, w * 1.1, w),
          tint.clone().offsetHSL(0, 0, (random() - 0.5) * 0.06),
          mirror,
        );
      }
    } else {
      // An oak: a thick dark trunk under a heaped crown of several rounds.
      const h = (6 + random() * 5) * scale,
        tint = hsl(0.22 + random() * 0.06, 0.4, 0.2 + random() * 0.07);
      place("trunk", v(x, 0, z), 0, v(0.42 * scale, h * 0.6, 0.42 * scale), hsl(0.07, 0.25, 0.2), mirror);
      for (let k = 0; k < 4; k++) {
        const w = (1.9 + random() * 1.4) * scale,
          a = (k / 4) * Math.PI * 2 + random();
        place(
          "ball",
          v(x + Math.cos(a) * 1.4 * scale * (k ? 1 : 0), h * (0.72 + (k ? 0 : 0.15)) + random() * 0.6, z + Math.sin(a) * 1.4 * scale * (k ? 1 : 0)),
          random() * 6,
          v(w, w * 0.85, w),
          tint.clone().offsetHSL(0, 0, (random() - 0.5) * 0.06),
          mirror,
        );
      }
    }
  };
  const bush = (x: number, z: number, size: number) => {
    const tint = hsl(0.24 + random() * 0.08, 0.38, 0.16 + random() * 0.08);
    for (let k = 0; k < 3; k++) {
      const w = size * (0.6 + random() * 0.5);
      place(
        "bush",
        new T.Vector3(x + (random() - 0.5) * size, w * 0.45, z + (random() - 0.5) * size),
        random() * 6,
        new T.Vector3(w, w * 0.7, w),
        tint.clone().offsetHSL(0, 0, (random() - 0.5) * 0.05),
        mirrors(x, z),
      );
    }
  };
  // The far shore: a band of mixed wood rising behind the water, thicker further back; bushes at its foot.
  for (let x = -150; x < 170; x += 2.6 + random() * 2.6) {
    const shore = LAKE.z - LAKE.rz * Math.sqrt(Math.max(0, 1 - ((x - LAKE.x) / (LAKE.rx * 1.08)) ** 2)) - 3;
    plant(x, Math.min(shore, LAKE.z - 2) - random() * 7);
    plant(x + random() * 2, Math.min(shore, LAKE.z - 2) - 10 - random() * 30, random(), 1.15);
    if (random() < 0.7) bush(x, Math.min(shore, LAKE.z - 2) + 1 + random() * 2, 1.2 + random() * 1.4);
  }
  // The wood at both sides of the meadow, closing in, with an edge of bushes toward the grass.
  for (const side of [-1, 1]) {
    for (let z = 6; z > -70; z -= 2.6 + random() * 2.4) {
      const edge = 24 + Math.sin(z * 0.13 + side) * 4;
      plant(side * (edge + random() * 6), z);
      plant(side * (edge + 8 + random() * 26), z - random() * 2, random(), 1.1);
      if (random() < 0.8) bush(side * (edge - 2 - random() * 3), z, 1 + random() * 1.6);
    }
  }
  // A few trees near the stand frame the view, and a lone oak and birches stand on the meadow.
  for (const [x, z] of [
    [-13, -4],
    [-17, -9],
    [15, -5],
    [20, -10],
  ])
    plant(x, z, 0.2 + random() * 0.6, 0.9);
  plant(-17, -27, 0.7, 0.8);
  plant(-19.5, -24, 0.72, 0.75);
  // Ferns under the wood's edge and by the stand: fans of fronds.
  const frond = new T.PlaneGeometry(0.22, 1, 1, 4).translate(0, 0.5, 0),
    bend = frond.getAttribute("position");
  for (let i = 0; i < bend.count; i++) {
    const y = bend.getY(i);
    bend.setZ(i, y * y * 0.5);
    bend.setX(i, bend.getX(i) * (1 - y * 0.85));
  }
  frond.computeVertexNormals();
  crowd("frond", frond, std({ color: "#ffffff", side: T.DoubleSide, roughness: 0.9 }), false);
  const fern = (x: number, z: number, size: number) => {
    const tint = hsl(0.26 + random() * 0.05, 0.45, 0.22 + random() * 0.07);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + random() * 0.5,
        m = new T.Matrix4().compose(
          new T.Vector3(x, 0, z),
          new T.Quaternion().setFromEuler(new T.Euler(0.55, a, 0, "YXZ")),
          new T.Vector3(size, size * (0.8 + random() * 0.4), size),
        );
      crowds.frond.at.push({ m, c: tint });
    }
  };
  for (const side of [-1, 1]) for (let z = 0; z > -40; z -= 1.6 + random() * 2) fern(side * (19 + random() * 6), z, 0.7 + random() * 0.5);
  for (let k = 0; k < 14; k++) fern((random() - 0.5) * 10, -2.5 - random() * 4, 0.5 + random() * 0.4);
  // Mossy boulders on the meadow, at the shore and under the trees.
  const rockShape = new T.DodecahedronGeometry(1, 1),
    rough = rockShape.getAttribute("position");
  for (let i = 0; i < rough.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(rough, i),
      k = 1 + 0.16 * Math.sin(p.x * 5.1 + p.y * 3.3) * Math.cos(p.z * 4.7);
    rough.setXYZ(i, p.x * k, p.y * k, p.z * k);
  }
  rockShape.computeVertexNormals();
  crowd(
    "rock",
    rockShape,
    std({
      ...stuff("stone", "#ffffff", 1, keep),
      color: "#ffffff",
      flatShading: true,
    }),
  );
  const boulder = (x: number, z: number, s: number) => {
    const grey = hsl(0.1, 0.06, 0.32 + random() * 0.1);
    place("rock", new T.Vector3(x, s * 0.25, z), random() * 6, new T.Vector3(s * (0.9 + random() * 0.4), s * 0.6, s * (0.9 + random() * 0.5)), grey, false);
    // Moss on its top.
    place("bush", new T.Vector3(x, s * 0.52, z), random() * 6, new T.Vector3(s * 0.7, s * 0.16, s * 0.7), hsl(0.25, 0.45, 0.24), false);
  };
  for (const [x, z, s] of [
    [-8, -13, 0.9],
    [-21, -18, 1.4],
    [25, -14, 1.1],
    [13, -9, 0.7],
    [-17, -30, 1.2],
    [33, -27, 1.5],
    [-6, -20.5, 0.8],
    [-3, -21.5, 0.5],
    [30, -40, 1.3],
    [-20, -44, 1.6],
  ])
    boulder(x, z, s);
  // Grass tufts on the meadow, reeds and cattails round the water (thinner on the near shore, where ducks are watched).
  const blade = new T.ConeGeometry(0.03, 1, 3).translate(0, 0.5, 0);
  crowd("blade", blade, std({ color: "#ffffff", flatShading: true }), false);
  crowd("cattail", new T.CapsuleGeometry(0.035, 0.16, 3, 6), std({ color: "#5a3a22", roughness: 0.9 }), false);
  for (let k = 0; k < 760; k++) {
    const a = random() * Math.PI * 2,
      out = 0.97 + random() * 0.1,
      x = LAKE.x + Math.cos(a) * LAKE.rx * out,
      z = LAKE.z + Math.sin(a) * LAKE.rz * out;
    // Reeds stand in clumps.
    if (Math.sin(a * 5 + 1.3) < -0.1 && random() < 0.8) continue;
    if (Math.sin(a) > 0.6 && Math.abs(Math.cos(a)) < 0.5 && random() < 0.8) continue;
    const tall = 1.3 + random() * 1.6;
    place(
      "blade",
      new T.Vector3(x, LAKE.y, z),
      random() * 6,
      new T.Vector3(1, tall, 1),
      hsl(0.15 + random() * 0.06, 0.45, 0.28 + random() * 0.1),
      mirrors(x, z) || out < 1.02,
    );
    if (random() < 0.12) place("cattail", new T.Vector3(x, LAKE.y + tall * 0.92, z), 0, new T.Vector3(1, 1, 1), new T.Color("#ffffff"), false);
  }
  for (let k = 0; k < 520; k++) {
    const x = (random() - 0.5) * 2 * EDGE,
      z = -3 - random() * 34;
    if (inLake(x, z) || ((x - LAKE.x) / (LAKE.rx * 1.08)) ** 2 + ((z - LAKE.z) / (LAKE.rz * 1.08)) ** 2 < 1) continue;
    crowds.blade.at.push({
      m: new T.Matrix4().compose(
        new T.Vector3(x, 0, z),
        new T.Quaternion().setFromEuler(new T.Euler((random() - 0.5) * 0.6, random() * 6, (random() - 0.5) * 0.6)),
        new T.Vector3(1.4, 0.35 + random() * 0.4, 1.4),
      ),
      c: hsl(0.16 + random() * 0.06, 0.4, 0.3 + random() * 0.1),
    });
  }
  // Wild flowers in the grass: small pale heads.
  crowd("flower", new T.IcosahedronGeometry(0.06, 0), std({ color: "#ffffff", roughness: 0.6 }), false);
  for (let k = 0; k < 160; k++) {
    const x = (random() - 0.5) * 40,
      z = -3 - random() * 18;
    if (inLake(x, z)) continue;
    crowds.flower.at.push({
      m: new T.Matrix4().compose(new T.Vector3(x, 0.22 + random() * 0.15, z), q, new T.Vector3(1, 1, 1)),
      c: [new T.Color("#f4f0e6"), new T.Color("#e8d25a"), new T.Color("#b9a6e8")][k % 3],
    });
  }
  // Lily pads on the water near the shores, a few with white flowers.
  crowd(
    "pad",
    new T.CircleGeometry(0.42, 10, 0.4, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2),
    std({ color: "#ffffff", roughness: 0.55, side: T.DoubleSide }),
    false,
  );
  for (let k = 0; k < 70; k++) {
    const a = random() * Math.PI * 2,
      r = 0.72 + random() * 0.22;
    if (Math.sin(a * 3 + 2) < 0.2) continue;
    const x = LAKE.x + Math.cos(a) * LAKE.rx * r,
      z = LAKE.z + Math.sin(a) * LAKE.rz * r;
    place(
      "pad",
      new T.Vector3(x, LAKE.y + 0.012, z),
      random() * 6,
      new T.Vector3(0.7 + random() * 0.8, 1, 0.7 + random() * 0.8),
      hsl(0.27, 0.45, 0.22 + random() * 0.08),
      false,
    );
    if (random() < 0.2) place("flower", new T.Vector3(x, LAKE.y + 0.06, z), 0, new T.Vector3(1.4, 0.7, 1.4), new T.Color("#fff6f2"), false);
  }
  // A fallen log at the near shore, half in the water.
  const log = std({ color: "#4a3626", roughness: 0.95 }),
    fallen = put(new T.CylinderGeometry(0.28, 0.34, 7, 10), log, LAKE.x - 15, 0.05, LAKE.z + LAKE.rz * 0.82);
  fallen.rotation.set(0.08, 0.5, Math.PI / 2);
  fallen.castShadow = true;
  // Every crowd as one instanced mesh.
  const instanced = (c: Crowd, mirror: boolean) => {
    if (!c.at.length) return;
    const material = mirror
        ? keep(
            new T.MeshStandardMaterial({
              color: "#ffffff",
              map: c.material.map,
              side: T.DoubleSide,
              flatShading: c.material.flatShading,
              roughness: 1,
            }),
          )
        : c.material,
      mesh = new T.InstancedMesh(c.geometry, material, c.at.length);
    c.at.forEach(({ m, c: tint }, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint);
    });
    mesh.castShadow = c.shadow && !mirror;
    mesh.receiveShadow = !mirror;
    scene.add(mesh);
  };
  for (const c of Object.values(crowds)) instanced(c, false);
  for (const c of Object.values(mirrored)) instanced(c, true);
  // The water: the sky's colours painted on it (the bright low sky in the far water, the deep sky near), a path of the
  // sun's light toward me, half clear over the mirrored shore, with ripples.
  const { c: waterC, ctx: w } = canvas(512, 512),
    gradient = w.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#f6b27e");
  gradient.addColorStop(0.3, "#c48a96");
  gradient.addColorStop(0.65, "#6a6a92");
  gradient.addColorStop(1, "#2a3456");
  w.fillStyle = gradient;
  w.fillRect(0, 0, 512, 512);
  // The sun's path: broken streaks widening toward me, under the sun's side of the lake.
  const sunU = 0.5 + (((sunDir.x / -sunDir.z) * 140 - LAKE.x) / (2 * LAKE.rx)) * 0.4;
  for (let k = 0; k < 260; k++) {
    const y = random() ** 1.4 * 512,
      spread = 10 + (y / 512) * 70,
      x = sunU * 512 + (random() - 0.5) * spread * 2;
    w.strokeStyle = `rgba(255,${210 + random() * 40},${150 + random() * 60},${0.25 + random() * 0.35 * (1 - y / 600)})`;
    w.lineWidth = 1 + random() * 1.5;
    w.beginPath();
    w.moveTo(x, y);
    w.lineTo(x + 6 + random() * 18, y);
    w.stroke();
  }
  for (let k = 0; k < 420; k++) {
    w.strokeStyle = `rgba(255,${200 + random() * 55},${180 + random() * 60},${0.04 + random() * 0.1})`;
    w.lineWidth = 1;
    const y = random() * 512,
      x = random() * 512;
    w.beginPath();
    w.moveTo(x, y);
    w.lineTo(x + 10 + random() * 36, y);
    w.stroke();
  }
  const waterMap = texture(waterC, keep),
    water = put(
      new T.CircleGeometry(1, 72),
      keep(
        new T.MeshStandardMaterial({
          map: waterMap,
          transparent: true,
          opacity: 0.8,
          roughness: 0.55,
          metalness: 0.05,
          depthWrite: false,
        }),
      ),
      LAKE.x,
      LAKE.y,
      LAKE.z,
    );
  water.rotation.x = -Math.PI / 2;
  water.scale.set(LAKE.rx * 1.005, LAKE.rz * 1.005, 1);
  water.renderOrder = 2;
  water.receiveShadow = false;
  // Shafts of the low sun coming through between the far trunks: long soft beams, added faintly to the picture.
  const { c: beamC, ctx: beam } = canvas(64, 256),
    along = beam.createLinearGradient(0, 0, 0, 256);
  along.addColorStop(0, "rgba(255,210,150,0)");
  along.addColorStop(0.25, "rgba(255,210,150,0.9)");
  along.addColorStop(1, "rgba(255,190,130,0)");
  beam.fillStyle = along;
  beam.fillRect(0, 0, 64, 256);
  beam.globalCompositeOperation = "destination-in";
  const across = beam.createLinearGradient(0, 0, 64, 0);
  across.addColorStop(0, "rgba(0,0,0,0)");
  across.addColorStop(0.5, "rgba(0,0,0,1)");
  across.addColorStop(1, "rgba(0,0,0,0)");
  beam.fillStyle = across;
  beam.fillRect(0, 0, 64, 256);
  const beamMap = texture(beamC, keep),
    beams: T.MeshBasicMaterial[] = [];
  for (let k = 0; k < 7; k++) {
    const m = keep(
      new T.MeshBasicMaterial({
        map: beamMap,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
        fog: false,
      }),
    );
    beams.push(m);
    const shaft = put(new T.PlaneGeometry(2.4 + random() * 2.5, 34), m, LAKE.x - 26 + k * 9 + random() * 4, 9, LAKE.z - LAKE.rz - 8 - random() * 10);
    // Leaning down from the sun toward me and the meadow.
    shaft.rotation.set(0.95, -0.12 + random() * 0.08, -0.22);
    shaft.receiveShadow = false;
    shaft.renderOrder = 3;
  }
  // The stand: a platform of planks on four posts at the wood's edge, a rail of rough logs before the shooter.
  const deck = 4.4;
  put(new T.CylinderGeometry(0.07, 0.08, 2.6, 8), log, 0, deck + 0.95, -0.85).rotation.z = Math.PI / 2;
  for (const x of [-1.15, 1.15]) put(new T.CylinderGeometry(0.07, 0.08, 1.1, 8), log, x, deck + 0.5, -0.85);
  put(new T.BoxGeometry(2.6, 0.08, 1.6), std({ color: "#6a5038", roughness: 0.95 }), 0, deck, -0.2);
  for (const [x, z] of [
    [-1.15, -0.9],
    [1.15, -0.9],
    [-1.15, 0.5],
    [1.15, 0.5],
  ])
    put(new T.CylinderGeometry(0.09, 0.11, deck, 8), log, x, deck / 2, z);
  for (const y of [1.4, 3.2]) put(new T.CylinderGeometry(0.05, 0.05, 2.4, 6), log, 0, y, -0.9).rotation.z = Math.PI / 2;
  // Dusk light: a low warm sun beyond the lake, a purple sky light, a cool fill from behind.
  scene.add(new T.HemisphereLight("#cdbdec", "#5a6a3a", 1.7));
  const sun = new T.DirectionalLight("#ffb27a", 2.1);
  sun.position.set(30, 22, -120);
  sun.target.position.set(0, 0, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -60,
    right: 60,
    top: 40,
    bottom: -40,
    near: 60,
    far: 220,
  });
  sun.shadow.normalBias = 0.08;
  keep(sun.shadow);
  scene.add(sun, sun.target);
  const fill = new T.DirectionalLight("#8fa6ff", 0.5);
  fill.position.set(-10, 15, 20);
  scene.add(fill);
  const update = (now: number) => {
    waterMap.offset.x = (now / 60000) % 1;
    waterMap.offset.y = Math.sin(now / 7000) * 0.004;
    beams.forEach((m, k) => (m.opacity = 0.13 + 0.05 * Math.sin(now / 2300 + k * 1.7)));
  };
  return { water, update };
}
/** The birds' painted plumage, made once a page and shared by every bird of a kind (they come and go all hunt long). */
const plumage = new Map<string, T.Texture>();
const birdPicture = (key: string, make: () => T.Texture) => {
  let t = plumage.get(key);
  if (!t) plumage.set(key, (t = make()));
  return t;
};
/** An animal as built: its parts that the view moves (legs and wings swing about their joints, the head nods). */
export interface AnimalModel {
  root: T.Group;
  /** The body, rolled over as it falls. */
  body: T.Group;
  legs: T.Object3D[];
  wings: T.Object3D[];
  head: T.Object3D;
  /** Its own paints, faded when it has fallen and thrown away with it. */
  paints: T.Material[];
  geometries: T.BufferGeometry[];
}
/**
 * An animal of `id`, modelled in its own frame (z ahead, y up, its feet at 0; a bird about its body): bodies of
 * overlapping rounded masses, necks and limbs of tapered capsules jointed where an animal's joints are, heads with
 * eyes (a glint in each), ears, muzzles and noses, and each kind's marks: the stag's antlers and pale rump, the
 * boar's bristled ridge and tusks, the bear's shoulder hump, the rabbit's long ears and white tail, the mallard's
 * green head and white collar, the cock pheasant's red face, white ring and long barred tail.
 */
export function animalModel(id: Kind["id"]): AnimalModel {
  const root = new T.Group(),
    body = new T.Group(),
    paints: T.Material[] = [],
    geometries: T.BufferGeometry[] = [],
    legs: T.Object3D[] = [],
    wings: T.Object3D[] = [];
  root.add(body);
  const mat = (o: T.MeshStandardMaterialParameters, fur = 0) => {
      const m = fur
        ? furry({ roughness: 0.9, transparent: true, ...o }, fur, 2, 2)
        : new T.MeshStandardMaterial({
            roughness: 0.7,
            transparent: true,
            ...o,
          });
      paints.push(m);
      return m;
    },
    shape = <G extends T.BufferGeometry>(g: G) => {
      geometries.push(g);
      return g;
    },
    ball = shape(new T.SphereGeometry(1, 18, 14)),
    part = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, parent: T.Object3D = body) => {
      const mesh = new T.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    },
    blob = (m: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: T.Object3D = body) =>
      part(ball, m, x, y, z, sx, sy, sz, parent),
    /** A tapered rod from `a` (radius `ra`) to `b` (radius `rb`), rounded at both ends. */
    rod = (a: T.Vector3, b: T.Vector3, ra: number, rb: number, m: T.Material, parent: T.Object3D = body) => {
      const d = b.clone().sub(a),
        length = d.length(),
        mesh = new T.Mesh(shape(new T.CylinderGeometry(rb, ra, length, 10, 1)), m);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
      mesh.castShadow = true;
      parent.add(mesh);
      part(ball, m, a.x, a.y, a.z, ra, ra, ra, parent);
      part(ball, m, b.x, b.y, b.z, rb, rb, rb, parent);
      return mesh;
    },
    v = (x: number, y: number, z: number) => new T.Vector3(x, y, z),
    /** Two eyes on a head, each dark with a small glint. */
    eyes = (h: T.Object3D, x: number, y: number, z: number, r: number) => {
      const dark = mat({ color: "#0e0a08", roughness: 0.2 }),
        glint = mat({
          color: "#ffffff",
          emissive: "#ffffff",
          emissiveIntensity: 0.4,
        });
      for (const s of [-1, 1]) {
        blob(dark, s * x, y, z, r, r, r, h);
        blob(glint, s * (x + r * 0.45), y + r * 0.35, z + r * 0.5, r * 0.28, r * 0.28, r * 0.28, h);
      }
    },
    /**
     * A leg hung from a joint at (x, y, z), `length` long to the ground: an upper and a lower part bent at a knee
     * (forward for a foreleg, back for a hind leg's hock), and a hoof or paw; it swings about the joint.
     */
    leg = (x: number, y: number, z: number, length: number, thick: number, coat: T.Material, foot: T.Material, hind: boolean, paw = false) => {
      const joint = new T.Group();
      joint.position.set(x, y, z);
      body.add(joint);
      const knee = v(0, -length * 0.48, hind ? -length * 0.1 : length * 0.04),
        ankle = v(0, -length * 0.9, hind ? length * 0.02 : 0);
      rod(v(0, 0, 0), knee, thick * 1.35, thick * 0.8, coat, joint);
      rod(knee, ankle, thick * 0.78, thick * 0.6, coat, joint);
      if (paw) blob(foot, 0, -length + thick * 0.5, thick * 0.4, thick * 1.05, thick * 0.6, thick * 1.4, joint);
      else part(shape(new T.CylinderGeometry(thick * 0.55, thick * 0.75, length * 0.1, 8)), foot, 0, -length * 0.95, 0.01, 1, 1, 1, joint);
      legs.push(joint);
    };
  let head = new T.Group() as T.Object3D;
  if (id === "deer") {
    // A red deer stag.
    const coat = mat({ color: "#8a5532" }, 0.7),
      darker = mat({ color: "#5e3a22" }, 0.8),
      pale = mat({ color: "#e6d6bc" }, 0.5),
      dark = mat({ color: "#231912" }),
      antler = mat({ color: "#cdbb98", roughness: 0.6 });
    blob(coat, 0, 1.08, 0, 0.3, 0.32, 0.6);
    blob(coat, 0, 1.06, 0.4, 0.28, 0.33, 0.32);
    blob(coat, 0, 1.12, -0.42, 0.28, 0.3, 0.3);
    blob(pale, 0, 0.9, 0.02, 0.21, 0.13, 0.48);
    blob(pale, 0, 1.12, -0.69, 0.17, 0.2, 0.07);
    blob(dark, 0, 1.22, -0.73, 0.04, 0.08, 0.04);
    // The neck rising to the head, with a darker mane under it.
    rod(v(0, 1.18, 0.5), v(0, 1.6, 0.82), 0.16, 0.09, coat);
    rod(v(0, 1.08, 0.55), v(0, 1.5, 0.82), 0.12, 0.07, darker);
    const h = new T.Group();
    h.position.set(0, 1.66, 0.86);
    body.add(h);
    blob(coat, 0, 0, 0, 0.1, 0.11, 0.14, h);
    rod(v(0, -0.01, 0.06), v(0, -0.05, 0.26), 0.075, 0.045, coat, h);
    blob(dark, 0, -0.045, 0.29, 0.04, 0.032, 0.03, h);
    eyes(h, 0.075, 0.03, 0.06, 0.018);
    for (const s of [-1, 1]) {
      const ear = blob(coat, s * 0.11, 0.09, -0.05, 0.035, 0.1, 0.05, h);
      ear.rotation.set(0, 0, -s * 0.8);
      // An antler: a beam curving up and back, with three tines forward.
      const beam = [v(s * 0.05, 0.08, -0.02), v(s * 0.16, 0.3, -0.08), v(s * 0.2, 0.52, -0.14), v(s * 0.16, 0.7, -0.08)];
      for (let k = 0; k < 3; k++) rod(beam[k], beam[k + 1], 0.02 - k * 0.004, 0.016 - k * 0.004, antler, h);
      for (const [k, len] of [
        [0, 0.16],
        [1, 0.18],
        [2, 0.14],
      ] as [number, number][]) {
        const at = beam[k].clone().lerp(beam[k + 1], 0.55);
        rod(at, at.clone().add(v(s * 0.02, len * 0.55, len * 0.8)), 0.012, 0.006, antler, h);
      }
    }
    head = h;
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ])
      leg(sx * 0.15, 0.95, sz * 0.44, 0.95, 0.045, coat, dark, sz < 0);
  } else if (id === "boar") {
    const coat = mat({ color: "#4a3a2e" }, 1),
      bristle = mat({ color: "#2a201a" }, 1),
      snout = mat({ color: "#6e4e40" }),
      tusk = mat({ color: "#efe6d0", roughness: 0.4 }),
      dark = mat({ color: "#1b1512" });
    // A heavy fore-body with high shoulders, falling away to the haunches.
    blob(coat, 0, 0.66, 0.15, 0.34, 0.4, 0.42);
    blob(coat, 0, 0.6, -0.3, 0.3, 0.33, 0.38);
    blob(coat, 0, 0.5, -0.05, 0.27, 0.22, 0.55);
    // The bristled ridge along its back.
    for (let k = 0; k < 9; k++) {
      const z = 0.42 - k * 0.09,
        y = 0.98 - Math.abs(z - 0.25) * 0.42;
      part(shape(new T.ConeGeometry(0.03, 0.1, 5)), bristle, 0, y, z, 1, 1, 1).rotation.x = -0.4;
    }
    const h = new T.Group();
    h.position.set(0, 0.62, 0.55);
    body.add(h);
    blob(coat, 0, 0.02, 0, 0.17, 0.2, 0.18, h);
    rod(v(0, 0, 0.08), v(0, -0.06, 0.36), 0.13, 0.07, coat, h);
    part(shape(new T.CylinderGeometry(0.072, 0.072, 0.04, 14)), snout, 0, -0.06, 0.4, 1, 1, 1, h).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
      blob(dark, s * 0.025, -0.06, 0.421, 0.012, 0.016, 0.006, h);
      const t = part(shape(new T.ConeGeometry(0.016, 0.1, 6)), tusk, s * 0.07, -0.05, 0.3, 1, 1, 1, h);
      t.rotation.set(-0.5, 0, s * 0.6);
      const ear = part(shape(new T.ConeGeometry(0.05, 0.13, 6)), coat, s * 0.1, 0.17, -0.06, 1, 1, 1, h);
      ear.rotation.set(-0.3, 0, -s * 0.5);
    }
    eyes(h, 0.1, 0.07, 0.1, 0.016);
    head = h;
    rod(v(0, 0.66, -0.62), v(0, 0.48, -0.72), 0.02, 0.012, coat);
    blob(bristle, 0, 0.46, -0.73, 0.03, 0.05, 0.03);
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ])
      leg(sx * 0.16, 0.45, sz * 0.32, 0.45, 0.05, coat, dark, sz < 0);
  } else if (id === "bear") {
    const coat = mat({ color: "#3d2a1c" }, 1),
      muzzle = mat({ color: "#8a6a4c" }, 0.6),
      dark = mat({ color: "#120d0a" });
    blob(coat, 0, 0.98, -0.2, 0.52, 0.52, 0.72);
    blob(coat, 0, 1.06, 0.36, 0.46, 0.5, 0.45);
    // The hump over the shoulders.
    blob(coat, 0, 1.38, 0.32, 0.3, 0.2, 0.3);
    const h = new T.Group();
    h.position.set(0, 1.12, 0.92);
    body.add(h);
    blob(coat, 0, 0, 0, 0.26, 0.24, 0.26, h);
    blob(muzzle, 0, -0.07, 0.22, 0.12, 0.1, 0.15, h);
    blob(dark, 0, -0.03, 0.36, 0.045, 0.035, 0.03, h);
    for (const s of [-1, 1]) {
      blob(coat, s * 0.18, 0.2, -0.04, 0.08, 0.08, 0.05, h);
      blob(muzzle, s * 0.18, 0.2, -0.01, 0.045, 0.045, 0.03, h);
    }
    eyes(h, 0.1, 0.06, 0.2, 0.022);
    head = h;
    blob(coat, 0, 1.0, -0.9, 0.08, 0.08, 0.07);
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ])
      leg(sx * 0.28, 0.78, sz * 0.48, 0.78, 0.1, coat, dark, sz < 0, true);
  } else if (id === "rabbit") {
    const coat = mat({ color: "#9b8670" }, 0.8),
      white = mat({ color: "#f3efe6" }, 0.6),
      pink = mat({ color: "#e0a8a0" }),
      dark = mat({ color: "#16110e" });
    blob(coat, 0, 0.22, -0.02, 0.14, 0.15, 0.2);
    // Big haunches for its hind legs, and its white tail.
    for (const s of [-1, 1]) blob(coat, s * 0.08, 0.18, -0.1, 0.08, 0.11, 0.13);
    blob(white, 0, 0.26, -0.24, 0.055, 0.055, 0.05);
    blob(white, 0, 0.17, 0.05, 0.09, 0.08, 0.13);
    const h = new T.Group();
    h.position.set(0, 0.34, 0.17);
    body.add(h);
    blob(coat, 0, 0, 0, 0.08, 0.08, 0.1, h);
    blob(coat, 0, -0.02, 0.07, 0.055, 0.05, 0.05, h);
    blob(pink, 0, -0.01, 0.115, 0.012, 0.01, 0.008, h);
    for (const s of [-1, 1]) {
      const ear = new T.Group();
      ear.position.set(s * 0.035, 0.06, -0.03);
      ear.rotation.set(-0.35, 0, -s * 0.18);
      h.add(ear);
      blob(coat, 0, 0.1, 0, 0.026, 0.11, 0.016, ear);
      blob(pink, 0, 0.1, 0.008, 0.016, 0.085, 0.01, ear);
    }
    eyes(h, 0.055, 0.02, 0.04, 0.014);
    head = h;
    for (const sx of [-1, 1]) leg(sx * 0.06, 0.15, 0.12, 0.15, 0.022, coat, white, false);
    for (const sx of [-1, 1]) leg(sx * 0.09, 0.14, -0.12, 0.14, 0.035, coat, white, true, true);
  } else {
    // A bird: a mallard drake (green head, white collar, chestnut breast, grey flanks, a blue patch on the wings) or a
    // cock pheasant (copper, a green-and-red head, a white ring and a long barred tail).
    const duck = id === "duck",
      speck = birdPicture(duck ? "duck" : "pheasant", () => {
        const { c: speckC, ctx: sp } = canvas(128, 128),
          seq = sequence(duck ? 3 : 7);
        sp.fillStyle = duck ? "#9a948c" : "#b0602c";
        sp.fillRect(0, 0, 128, 128);
        for (let k = 0; k < 260; k++) {
          sp.fillStyle = duck ? (seq() < 0.5 ? "rgba(60,58,54,0.35)" : "rgba(220,216,210,0.35)") : seq() < 0.6 ? "rgba(40,22,10,0.6)" : "rgba(240,200,120,0.4)";
          if (duck) sp.fillRect(seq() * 128, seq() * 128, 6, 1);
          else {
            sp.beginPath();
            sp.arc(seq() * 128, seq() * 128, 2 + seq() * 2, 0, Math.PI, false);
            sp.fill();
          }
        }
        const t = new T.CanvasTexture(speckC);
        t.colorSpace = T.SRGBColorSpace;
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.repeat.set(3, 3);
        return t;
      });
    const coat = mat({ map: speck, color: "#ffffff" }, 0.3),
      chest = mat({ color: duck ? "#6b3a26" : "#c4642a" }, 0.3),
      headPaint = mat({
        color: duck ? "#1d6b3c" : "#1e4a3a",
        roughness: 0.3,
        metalness: 0.25,
      }),
      bill = mat({ color: duck ? "#f2c23a" : "#d9c89a" }),
      wingPaint = mat({ color: duck ? "#8f8a82" : "#8a6038", side: T.DoubleSide }, 0.2),
      white = mat({ color: "#f4f2ea" }),
      red = mat({ color: "#d22a2a" }),
      dark = mat({ color: "#1d1a18" });
    blob(coat, 0, 0, -0.02, 0.12, 0.11, duck ? 0.25 : 0.22);
    blob(chest, 0, -0.015, 0.13, 0.105, 0.1, 0.12);
    rod(v(0, 0.02, 0.18), v(0, 0.07, duck ? 0.28 : 0.25), 0.05, 0.04, duck ? headPaint : chest);
    const h = new T.Group();
    h.position.set(0, 0.08, duck ? 0.31 : 0.28);
    body.add(h);
    blob(headPaint, 0, 0, 0, 0.055, 0.06, 0.07, h);
    const beak = part(shape(new T.ConeGeometry(0.024, duck ? 0.09 : 0.045, 8)), bill, 0, -0.012, duck ? 0.1 : 0.085, duck ? 1.3 : 1, duck ? 0.55 : 1, 1, h);
    beak.rotation.x = Math.PI / 2;
    eyes(h, 0.04, 0.015, 0.035, 0.009);
    if (duck) part(shape(new T.TorusGeometry(0.043, 0.008, 6, 18)), white, 0, -0.045, -0.03, 1, 1, 1, h).rotation.x = Math.PI / 2 - 0.3;
    else {
      part(shape(new T.TorusGeometry(0.04, 0.009, 6, 18)), white, 0, -0.05, -0.03, 1, 1, 1, h).rotation.x = Math.PI / 2 - 0.3;
      for (const s of [-1, 1]) blob(red, s * 0.035, 0.008, 0.02, 0.018, 0.03, 0.032, h);
      for (const s of [-1, 1]) blob(headPaint, s * 0.02, 0.055, -0.03, 0.012, 0.03, 0.012, h);
    }
    head = h;
    if (duck) {
      // The drake's black tail with its curl and a white fringe.
      blob(dark, 0, 0.03, -0.24, 0.06, 0.05, 0.07);
      blob(white, 0, 0.02, -0.3, 0.07, 0.015, 0.05);
      part(shape(new T.TorusGeometry(0.025, 0.007, 5, 10, Math.PI * 1.3)), dark, 0, 0.08, -0.25, 1, 1, 1).rotation.y = Math.PI / 2;
    } else {
      // A long tail of barred feathers.
      const barMap = birdPicture("tail", () => {
          const { c: barC, ctx: bar } = canvas(32, 128);
          bar.fillStyle = "#b08a52";
          bar.fillRect(0, 0, 32, 128);
          bar.fillStyle = "#3a2410";
          for (let y = 4; y < 128; y += 11) bar.fillRect(0, y, 32, 3);
          const t = new T.CanvasTexture(barC);
          t.colorSpace = T.SRGBColorSpace;
          return t;
        }),
        tailPaint = mat({ map: barMap, color: "#ffffff", side: T.DoubleSide });
      for (const s of [-1, 0, 1]) {
        const feather = part(shape(new T.PlaneGeometry(0.05, 0.6)), tailPaint, s * 0.02, 0.02 + Math.abs(s) * -0.01, -0.52, 1, 1, 1);
        feather.rotation.set(-Math.PI / 2 + 0.12, 0, s * 0.12);
      }
    }
    // Wings: a broad flat outline with its primaries, about a shoulder joint.
    const outline = new T.Shape();
    outline.moveTo(0, 0.07);
    outline.quadraticCurveTo(0.18, 0.11, 0.38, 0.03);
    outline.lineTo(0.42, -0.02);
    outline.quadraticCurveTo(0.3, -0.06, 0.24, -0.1);
    outline.lineTo(0.16, -0.09);
    outline.lineTo(0.1, -0.12);
    outline.quadraticCurveTo(0.03, -0.08, 0, -0.06);
    outline.closePath();
    const wingShape = shape(new T.ShapeGeometry(outline, 6).rotateX(-Math.PI / 2));
    for (const s of [-1, 1]) {
      const joint = new T.Group();
      joint.position.set(s * 0.08, 0.05, 0.03);
      body.add(joint);
      const wing = part(wingShape, wingPaint, 0, 0, 0, s, 1, 1, joint);
      wing.rotation.y = 0;
      if (duck) {
        part(
          shape(new T.PlaneGeometry(0.07, 0.035).rotateX(-Math.PI / 2)),
          mat({ color: "#2d4ad6", roughness: 0.3, side: T.DoubleSide }),
          s * 0.17,
          0.004,
          -0.06,
          1,
          1,
          1,
          joint,
        );
        part(
          shape(new T.PlaneGeometry(0.07, 0.008).rotateX(-Math.PI / 2)),
          mat({ color: "#ffffff", side: T.DoubleSide }),
          s * 0.17,
          0.005,
          -0.08,
          1,
          1,
          1,
          joint,
        );
      }
      wings.push(joint);
    }
    root.scale.setScalar(1.15);
  }
  return { root, body, legs, wings, head, paints, geometries };
}
