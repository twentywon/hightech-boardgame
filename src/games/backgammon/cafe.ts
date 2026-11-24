import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, glossy, planks } from "../../engine/scene-utils";
import { planar, type Own } from "./case";

/**
 * Where the backgammon case is played: a café terrace by the sea of our own, the case on a slatted table of dark
 * oiled wood over a floor of terracotta tiles. Where a graphics card draws, a glass of tea on its saucer, a cup of
 * coffee and a dish of pistachios stand round the case, beyond its walls so that they hide nothing of the play.
 * Under software drawing the room is lit the cheap way (Lambert) and is the table alone: no props, floor or frame.
 */
function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** What the view clears to: the terrace's warm stone where a graphics card draws, the dark under the table otherwise. */
export const clearColor = () => (capable() ? "#c9b18e" : "#1a120c");
/** The height of the floor under the table (the case lies on the table top at y 0). */
const FLOOR_Y = -16;
/** Terracotta tiles, a little uneven in colour, with pale grout. */
function tiles(own: Own) {
  const c = document.createElement("canvas"),
    size = 512,
    n = 4,
    cell = size / n,
    rand = seeded(311);
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#d8c7aa";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const tone = rand();
      ctx.fillStyle = `rgb(${168 + tone * 30},${84 + tone * 20},${52 + tone * 14})`;
      ctx.fillRect(i * cell + 5, j * cell + 5, cell - 10, cell - 10);
      for (let k = 0; k < 160; k++) {
        ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,220,180,0.06)";
        ctx.fillRect(i * cell + 5 + rand() * (cell - 10), j * cell + 5 + rand() * (cell - 10), 3, 3);
      }
    }
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(14, 14);
  map.anisotropy = 4;
  return map;
}
/** The terrace: the slatted table and the tiled floor, and the props where they are worth their cost. */
export function cafe(own: Own) {
  const group = new T.Group(),
    rich = capable(),
    top = planks(1, own),
    slatMaterial = rich ? own(new T.MeshStandardMaterial({ ...top, color: "#b9a08a" })) : own(new T.MeshLambertMaterial({ map: top.map, color: "#b9a08a" })),
    slats: T.BufferGeometry[] = [],
    count = 8,
    pitch = 1.9;
  // Slats running across, a narrow gap between them; the table's frame shows dark through the gaps.
  for (let i = 0; i < count; i++) slats.push(planar(block(rich ? 22 : 30, 0.3, pitch - 0.08, 0.05).translate(0, -0.15, (i - (count - 1) / 2) * pitch), 8, i * 0.37));
  const table = new T.Mesh(own(mergeGeometries(slats)), slatMaterial);
  slats.forEach((g) => g.dispose());
  table.receiveShadow = true;
  group.add(table);
  // Under software drawing the gaps and whatever lies past the table show the dark the view clears to (`CLEAR`):
  // the frame under the slats and the floor were each another layer over the whole screen.
  if (!rich) return group;
  const under = new T.Mesh(own(new T.PlaneGeometry(22, count * pitch)), own(new T.MeshBasicMaterial({ color: "#1a120c" })));
  under.rotation.x = -Math.PI / 2;
  under.position.y = -0.32;
  group.add(under);
  const floor = new T.Mesh(own(new T.PlaneGeometry(140, 140)), own(new T.MeshLambertMaterial({ map: tiles(own) })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  group.add(floor);
  // The table's legs and frame, seen past its edge on a wide screen.
  const frame = own(new T.MeshStandardMaterial({ color: "#2a1c12", roughness: 0.7 }));
  for (const x of [-9.6, 9.6])
    for (const z of [-6.4, 6.4]) {
      const leg = new T.Mesh(own(new T.CylinderGeometry(0.32, 0.26, -FLOOR_Y - 0.3, 14)), frame);
      leg.position.set(x, FLOOR_Y / 2 - 0.15, z);
      group.add(leg);
    }
  const props = [teaGlass(own, 7, -4.45), coffeeCup(own, -4.1, -4.95), pistachios(own, 3.7, -4.95)];
  for (const prop of props) prop.scale.setScalar(0.82);
  group.add(...props, terracottaPot(own, 13.5, -9));
  return group;
}
const lathe = (points: [number, number][], segments = 40) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
const porcelain = (own: Own, color = "#f7f4ee") => own(glossy({ color, roughness: 0.25 }, 0.9));
function saucer(own: Own, radius: number, color?: string) {
  const plate = new T.Mesh(
    own(
      lathe([
        [0, 0.01],
        [radius * 0.45, 0],
        [radius * 0.5, 0.02],
        [radius * 0.55, 0.04],
        [radius * 0.95, 0.1],
        [radius, 0.13],
        [radius * 0.97, 0.14],
        [radius * 0.55, 0.075],
        [radius * 0.38, 0.06],
        [0, 0.06],
      ]),
    ),
    porcelain(own, color),
  );
  plate.castShadow = plate.receiveShadow = true;
  return plate;
}
/** A tulip-shaped glass of dark tea on a red-rimmed saucer, a spoon in the saucer and two lumps of sugar. */
function teaGlass(own: Own, x: number, z: number) {
  const group = new T.Group(),
    glassProfile: [number, number][] = [
      [0, 0.06],
      [0.34, 0.06],
      [0.38, 0.1],
      [0.36, 0.4],
      [0.27, 0.78],
      [0.3, 1.05],
      [0.42, 1.48],
      [0.44, 1.52],
      [0.41, 1.5],
      [0.39, 1.46],
      [0.27, 1.05],
      [0.24, 0.78],
      [0.33, 0.4],
      [0.33, 0.13],
      [0, 0.13],
    ],
    glass = new T.Mesh(
      own(lathe(glassProfile)),
      own(new T.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transparent: true, opacity: 0.22, clearcoat: 1, side: T.DoubleSide, depthWrite: false })),
    ),
    tea = new T.Mesh(
      own(
        lathe([
          [0, 0.13],
          [0.33, 0.13],
          [0.33, 0.4],
          [0.24, 0.78],
          [0.27, 1.05],
          [0.355, 1.32],
          [0, 1.32],
        ]),
      ),
      own(new T.MeshStandardMaterial({ color: "#7a1e08", roughness: 0.15, transparent: true, opacity: 0.9 })),
    );
  const plate = saucer(own, 0.95, "#f6f1e8"),
    rim = new T.Mesh(own(new T.TorusGeometry(0.955, 0.018, 6, 48)), own(new T.MeshStandardMaterial({ color: "#a3261d", roughness: 0.4 })));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.135;
  glass.position.y = tea.position.y = 0.06;
  glass.renderOrder = 2;
  const spoon = new T.Group(),
    steel = own(new T.MeshStandardMaterial({ color: "#d8d8dc", metalness: 0.9, roughness: 0.22 })),
    handle = new T.Mesh(own(block(0.9, 0.02, 0.05, 0.01)), steel),
    bowl = new T.Mesh(own(new T.SphereGeometry(0.1, 14, 8)), steel);
  bowl.scale.set(1.4, 0.25, 0.9);
  bowl.position.x = -0.5;
  spoon.add(handle, bowl);
  spoon.position.set(0.48, 0.16, 0.42);
  spoon.rotation.set(0, -0.7, 0.08);
  const sugar = own(new T.MeshStandardMaterial({ color: "#fbfaf6", roughness: 0.95 })),
    lumps = [new T.Mesh(own(block(0.2, 0.16, 0.2, 0.03)), sugar), new T.Mesh(own(block(0.2, 0.16, 0.2, 0.03)), sugar)];
  lumps[0].position.set(-0.62, 0.17, 0.3);
  lumps[1].position.set(-0.45, 0.17, 0.52);
  lumps[1].rotation.y = 0.6;
  group.add(plate, rim, tea, glass, spoon, ...lumps);
  for (const m of [tea, ...lumps]) m.castShadow = true;
  group.position.set(x, 0, z);
  return group;
}
/** A small cup of coffee with a cobalt band, on its saucer. */
function coffeeCup(own: Own, x: number, z: number) {
  const group = new T.Group(),
    profile: [number, number, boolean][] = [
      [0, 0.06, false],
      [0.24, 0.06, false],
      [0.27, 0.09, false],
      [0.34, 0.3, true],
      [0.4, 0.5, true],
      [0.43, 0.68, false],
      [0.44, 0.74, false],
      [0.41, 0.74, false],
      [0.39, 0.66, false],
      [0.3, 0.3, false],
      [0, 0.24, false],
    ],
    geometry = own(lathe(profile.map(([r, y]) => [r, y]))),
    count = geometry.getAttribute("position").count,
    colors = new Float32Array(count * 3),
    white = new T.Color("#f7f4ee"),
    blue = new T.Color("#1f3f8f");
  for (let i = 0; i < count; i++) {
    const c = profile[i % profile.length][2] ? blue : white;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  const cup = new T.Mesh(geometry, own(glossy({ color: "#ffffff", vertexColors: true, roughness: 0.25 }, 0.9))),
    coffee = new T.Mesh(own(new T.CircleGeometry(0.4, 32)), own(new T.MeshStandardMaterial({ color: "#2b160a", roughness: 0.2 }))),
    handle = new T.Mesh(own(new T.TorusGeometry(0.13, 0.035, 8, 20, Math.PI * 1.2)), porcelain(own));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.66;
  handle.position.set(0.47, 0.46, 0);
  handle.rotation.z = -Math.PI * 0.6;
  cup.castShadow = true;
  group.add(saucer(own, 0.75), cup, coffee, handle);
  group.position.set(x, 0, z);
  group.rotation.y = 0.5;
  return group;
}
/** A glazed bowl of pistachios, one instanced mesh of nuts heaped in it. */
function pistachios(own: Own, x: number, z: number) {
  const group = new T.Group(),
    bowl = new T.Mesh(
      own(
        lathe([
          [0, 0],
          [0.32, 0],
          [0.36, 0.04],
          [0.6, 0.28],
          [0.7, 0.42],
          [0.67, 0.43],
          [0.56, 0.3],
          [0.3, 0.08],
          [0, 0.08],
        ]),
      ),
      own(glossy({ color: "#2f6f8f", roughness: 0.3 }, 0.8)),
    ),
    rand = seeded(41),
    nuts = new T.InstancedMesh(own(new T.SphereGeometry(0.09, 10, 7)), own(new T.MeshStandardMaterial({ color: "#d9c29a", roughness: 0.7 })), 34),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    e = new T.Euler();
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2,
      r = Math.sqrt(rand()) * 0.46,
      y = 0.14 + (0.46 - r) * 0.45 + rand() * 0.08;
    q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
    m.compose(new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new T.Vector3(1.35, 0.85, 0.9));
    nuts.setMatrixAt(i, m);
  }
  bowl.castShadow = nuts.castShadow = true;
  group.add(bowl, nuts);
  group.position.set(x, 0, z);
  return group;
}
/** A terracotta pot of bougainvillea on the floor beside the table, seen on wide screens. */
function terracottaPot(own: Own, x: number, z: number) {
  const group = new T.Group(),
    pot = new T.Mesh(
      own(
        lathe(
          [
            [0, 0],
            [1.6, 0],
            [2.3, 5],
            [2.6, 5.2],
            [2.6, 5.8],
            [2.2, 5.8],
            [0, 5.6],
          ],
          24,
        ),
      ),
      own(new T.MeshStandardMaterial({ color: "#b5603a", roughness: 0.9 })),
    ),
    rand = seeded(9),
    leaves = new T.InstancedMesh(own(new T.IcosahedronGeometry(0.9, 0)), own(new T.MeshStandardMaterial({ color: "#3d6b2c", roughness: 0.8, flatShading: true })), 40),
    flowers = new T.InstancedMesh(own(new T.IcosahedronGeometry(0.55, 0)), own(new T.MeshStandardMaterial({ color: "#c2186f", roughness: 0.7, flatShading: true })), 46),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    e = new T.Euler();
  const scatter = (mesh: T.InstancedMesh, n: number, spread: number, lift: number) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2,
        r = Math.sqrt(rand()) * spread,
        s = 0.7 + rand() * 0.6;
      q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3));
      m.compose(new T.Vector3(Math.cos(a) * r, 6 + lift + rand() * 4.5 - r * 0.4, Math.sin(a) * r), q, new T.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    }
  };
  scatter(leaves, 40, 3, 0);
  scatter(flowers, 46, 3.4, 0.6);
  group.add(pot, leaves, flowers);
  group.position.set(x, FLOOR_Y, z);
  return group;
}
