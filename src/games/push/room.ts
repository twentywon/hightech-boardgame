import * as T from "three";
import { Grove } from "../../engine/foliage";
import { block, glossy, stuff, wood } from "../../engine/scene-utils";
import { seeded } from "./board";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The table's top: half its width and depth (its top is y = 0), and how far below the floor lies. */
export const TABLE = { half: 12, halfZ: 6.4, floor: -5.4 };
/** Terracotta floor tiles in a garden room, each a little different, with pale grout. */
function terracotta() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d", { willReadFrequently: true })!,
    rand = seeded(77);
  ctx.fillStyle = "#d9cbb4";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const tone = 0.85 + rand() * 0.2;
      ctx.fillStyle = `rgb(${Math.round(150 * tone)},${Math.round(98 * tone)},${Math.round(72 * tone)})`;
      ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      for (let k = 0; k < 30; k++) {
        ctx.fillStyle = rand() < 0.5 ? "rgba(120,52,30,0.18)" : "rgba(230,160,110,0.15)";
        ctx.fillRect(i * 64 + 2 + rand() * 56, j * 64 + 2 + rand() * 56, 2 + rand() * 6, 2 + rand() * 4);
      }
    }
  return c;
}
const lathe = (points: [number, number][], segments = 32) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/**
 * A garden room of our own round the board: a long teak table (its top at y = 0) on a terracotta floor, potted lemon
 * trees, ferns and a palm standing beyond its far edge before a white glazed wall, and on the table a glass jar of spare
 * marbles, a glass of tea on a saucer and a little pot of succulents, all clear of the board, its bowls and the view
 * of them. Where no graphics card draws the room keeps to the table, the floor beyond it and the jar.
 */
export function gardenRoom(scene: T.Scene, own: Own, rich: boolean) {
  const paint = (o: T.MeshStandardMaterialParameters) => own(rich ? new T.MeshStandardMaterial({ roughness: 0.8, ...o }) : new T.MeshLambertMaterial(o as T.MeshLambertMaterialParameters));
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, cast = true, parent: T.Object3D = scene) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The table: a thick top of pale oak with rounded edges, its boards running across.
  const oak = own(wood(false, 0.9));
  oak.repeat.set(3.4, 2.4);
  const top = add(block(TABLE.half * 2, 0.5, TABLE.halfZ * 2, 0.12), paint({ map: oak, color: "#cdb89c", ...(rich ? { roughness: 0.55 } : {}) }), 0, -0.25, 0, false);
  top.receiveShadow = true;
  // The floor, only where it can be seen: beyond the far edge and at the sides (under the table it would be drawn for nothing).
  const tiles = own(new T.CanvasTexture(terracotta()));
  tiles.colorSpace = T.SRGBColorSpace;
  tiles.wrapS = tiles.wrapT = T.RepeatWrapping;
  const strip = (w: number, d: number, x: number, z: number) => {
    const t = tiles.clone();
    t.repeat.set(w / 3.2, d / 3.2);
    t.needsUpdate = true;
    own(t);
    add(new T.PlaneGeometry(w, d).rotateX(-Math.PI / 2), paint({ map: t, ...(rich ? { roughness: 0.75 } : {}) }), x, TABLE.floor, z, false);
  };
  strip(46, 18, 0, -TABLE.halfZ - 9 + 0.6);
  strip(14, 12, -TABLE.half - 7 + 0.6, 1);
  strip(14, 12, TABLE.half + 7 - 0.6, 1);
  // A glass jar of spare marbles at the far left, lidded with cork.
  const jar = new T.Group();
  jar.position.set(-5.7, 0, -3.3);
  scene.add(jar);
  const glass = own(new T.MeshStandardMaterial({ color: "#dfeee9", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, side: T.DoubleSide }));
  add(lathe([[0, 0.01], [0.58, 0.01], [0.66, 0.06], [0.68, 0.9], [0.6, 1.05], [0.5, 1.12], [0.5, 1.2]], 40), glass, 0, 0, 0, false, jar).renderOrder = 6;
  add(lathe([[0, 1.36], [0.46, 1.36], [0.53, 1.3], [0.53, 1.14], [0, 1.14]].reverse() as [number, number][], 28), paint({ color: "#b78a5e", roughness: 0.95 }), 0, 0, 0, true, jar);
  const spare = new T.InstancedMesh(own(new T.SphereGeometry(0.17, rich ? 16 : 10, rich ? 12 : 8)), own(glossy({ color: "#ffffff", roughness: 0.12 }, 0.8)), 22);
  const rand = seeded(12),
    tints = ["#e08a1e", "#2a4fa8", "#c8b27a", "#9fc6c0", "#e08a1e", "#2a4fa8"];
  for (let i = 0; i < 22; i++) {
    const layer = Math.floor(i / 8),
      a = (i % 8) * (Math.PI / 4) + layer * 0.4,
      r = i % 8 === 7 ? 0 : 0.36;
    spare.setMatrixAt(i, new T.Matrix4().makeTranslation(Math.cos(a) * r + (rand() - 0.5) * 0.06, 0.19 + layer * 0.3, Math.sin(a) * r));
    spare.setColorAt(i, new T.Color(tints[i % tints.length]));
  }
  spare.castShadow = true;
  jar.add(spare);
  if (!rich) return;
  // A glass of tea on a saucer at the far right.
  const china = own(glossy({ color: "#f5f2ea", roughness: 0.25 }, 0.7));
  const tea = new T.Group();
  tea.position.set(5.8, 0, -3.4);
  scene.add(tea);
  add(lathe([[0.62, 0.0], [0.7, 0.05], [0.72, 0.08], [0.6, 0.07], [0.3, 0.05], [0, 0.05]].reverse() as [number, number][], 36), china, 0, 0, 0, true, tea);
  add(lathe([[0.27, 0.06], [0.31, 0.1], [0.36, 0.7], [0.39, 0.82]], 28), own(new T.MeshStandardMaterial({ color: "#f4e6cf", roughness: 0.05, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false })), 0, 0, 0, false, tea).renderOrder = 6;
  add(new T.CylinderGeometry(0.335, 0.29, 0.5, 24), own(new T.MeshStandardMaterial({ color: "#a2521c", roughness: 0.15, transparent: true, opacity: 0.85 })), 0, 0.33, 0, false, tea);
  // A little terracotta pot of succulents behind the board, a little to the left.
  const potX = -2.6,
    potZ = -4.85;
  add(lathe([[0.3, 0], [0.4, 0.04], [0.44, 0.42], [0.5, 0.46], [0.5, 0.56], [0.42, 0.56], [0.4, 0.48], [0, 0.48]].reverse() as [number, number][], 32), paint({ color: "#b5643c", roughness: 0.9 }), potX, 0, potZ);
  const rosette = own(new T.MeshStandardMaterial({ color: "#7fa98a", roughness: 0.6 }));
  const leaf = own(new T.SphereGeometry(0.1, 10, 8).scale(0.6, 0.35, 1.6));
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4,
      r = 0.08 + (k % 7) * 0.035,
      m = new T.Mesh(leaf, rosette);
    m.position.set(potX + Math.cos(a) * r, 0.56 + 0.05 * (1 - (k % 7) / 7), potZ + Math.sin(a) * r);
    m.rotation.set(-0.5 - (k % 7) * 0.08, -a + Math.PI / 2, 0);
    m.castShadow = true;
    scene.add(m);
  }
  // Beyond the table: a white glazed wall on a low brick footing, and potted lemon trees, ferns and a palm.
  const wallZ = -TABLE.halfZ - 9.5;
  add(new T.BoxGeometry(46, 1.6, 0.5), paint({ ...stuff("brick", "#b4664a", 12, own, 1) }), 0, TABLE.floor + 0.8, wallZ, false);
  const frameWhite = paint({ color: "#f2efe8", roughness: 0.5 });
  add(new T.BoxGeometry(46, 0.16, 0.24), frameWhite, 0, TABLE.floor + 1.68, wallZ + 0.05, false);
  const panes = own(new T.MeshStandardMaterial({ color: "#cfe3e6", roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45 }));
  add(new T.PlaneGeometry(46, 9), panes, 0, TABLE.floor + 6.2, wallZ, false);
  for (let x = -22; x <= 22; x += 2.3) add(new T.BoxGeometry(0.12, 9, 0.16), frameWhite, x, TABLE.floor + 6.2, wallZ + 0.06, false);
  add(new T.BoxGeometry(46, 0.12, 0.16), frameWhite, 0, TABLE.floor + 5.2, wallZ + 0.06, false);
  const clay = paint({ color: "#b0623e", roughness: 0.9 });
  const grove = new Grove(scene, own, { shadow: false, bright: 1.35, lift: 1.2, leaves: 0.8 });
  const pots: [number, number, number, "lemon" | "fern" | "palm"][] = [
    [-9.5, -8.2, 1.0, "lemon"],
    [-4.8, -9.6, 0.8, "fern"],
    [0.6, -10.4, 1.15, "palm"],
    [5.2, -9.2, 0.85, "fern"],
    [9.8, -8.4, 1.05, "lemon"],
    [-12.5, -4, 0.9, "fern"],
    [12.6, -3.6, 0.95, "palm"],
  ];
  for (const [x, z, s, kind] of pots) {
    add(lathe([[0.5 * s, 0], [0.58 * s, 0.05], [0.7 * s, 1.0 * s], [0.78 * s, 1.08 * s], [0.78 * s, 1.22 * s], [0, 1.22 * s]].reverse() as [number, number][], 28), clay, x, TABLE.floor, z, false);
    const soil = TABLE.floor + 1.18 * s;
    if (kind === "lemon") {
      add(new T.CylinderGeometry(0.06 * s, 0.09 * s, 2.2 * s, 8), paint({ color: "#6b5440" }), x, soil + 1.1 * s, z, false);
      grove.crown("broad", [x, soil + 2.9 * s, z], [1.7 * s, 1.5 * s, 1.7 * s], "#4f7d3a", Math.round(x * 10));
      const fruit = own(new T.MeshStandardMaterial({ color: "#f2cf3a", roughness: 0.5 }));
      const lemon = own(new T.SphereGeometry(0.13 * s, 10, 8).scale(1, 0.85, 1.25));
      for (let k = 0; k < 9; k++) {
        const a = k * 2.1 + x,
          m = new T.Mesh(lemon, fruit);
        m.position.set(x + Math.cos(a) * 1.25 * s, soil + 2.6 * s + Math.sin(k * 1.7) * 0.6 * s, z + Math.sin(a) * 1.25 * s);
        scene.add(m);
      }
    } else if (kind === "fern") grove.crown("box", [x, soil + 0.6 * s, z], [1.5 * s, 0.7 * s, 1.5 * s], "#5f8f45", Math.round(z * 10));
    else {
      add(new T.CylinderGeometry(0.1 * s, 0.16 * s, 3.4 * s, 10), paint({ color: "#7d6a52" }), x, soil + 1.7 * s, z, false);
      grove.crown("box", [x, soil + 3.6 * s, z], [1.8 * s, 0.9 * s, 1.8 * s], "#4c7f45", Math.round(x * 7));
    }
  }
  grove.build();
}
