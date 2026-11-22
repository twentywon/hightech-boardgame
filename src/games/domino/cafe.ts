import * as T from "three";
import { block, capable, glossy, wood } from "../../engine/scene-utils";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The radius of the café table's top; everything of the game lies within it. */
export const TABLE_R = 7.4,
  /** Where the espresso cup stands, and the height of the coffee in it. */
  CUP = { x: 5.6, y: 0.44, z: -2.6 };
/** A seeded random, so that the marble and the floor look the same every time. */
function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** Dark green marble with pale veins, painted once. */
function marble(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!,
    rand = seeded(4021),
    s = size / 1024;
  const base = ctx.createRadialGradient(size * 0.45, size * 0.4, size * 0.1, size / 2, size / 2, size * 0.75);
  base.addColorStop(0, "#28413a");
  base.addColorStop(1, "#15211d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Clouds of lighter and darker stone.
  for (let i = 0; i < 70; i++) {
    const x = rand() * size,
      y = rand() * size,
      r = (40 + rand() * 160) * s,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() < 0.5 ? "rgba(70,104,92,0.22)" : "rgba(6,12,10,0.25)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Veins: wandering lines, a soft wide one under a fine bright one.
  const vein = (width: number, color: string, blur: number, steps: number) => {
    let x = rand() * size,
      y = rand() * size,
      a = rand() * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * s;
    ctx.filter = blur ? `blur(${blur * s}px)` : "none";
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < steps; k++) {
      a += (rand() - 0.5) * 0.55;
      x += Math.cos(a) * 22 * s;
      y += Math.sin(a) * 22 * s;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  for (let i = 0; i < 8; i++) vein(10, "rgba(150,186,170,0.12)", 9, 30 + Math.floor(rand() * 30));
  for (let i = 0; i < 9; i++) vein(1.6, "rgba(214,232,222,0.32)", 0.8, 25 + Math.floor(rand() * 35));
  for (let i = 0; i < 14; i++) vein(0.8, "rgba(200,222,212,0.14)", 0.4, 8 + Math.floor(rand() * 14));
  ctx.filter = "none";
  return c;
}
/** Black and cream tiles of a café floor. */
function checks() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#1d1a18" : "#423b34";
      ctx.fillRect(i * 64, j * 64, 64, 64);
    }
  ctx.strokeStyle = "rgba(90,80,70,0.5)";
  ctx.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    ctx.beginPath();
    ctx.moveTo(k * 64, 0);
    ctx.lineTo(k * 64, 256);
    ctx.moveTo(0, k * 64);
    ctx.lineTo(256, k * 64);
    ctx.stroke();
  }
  return c;
}
const lathe = (points: [number, number][], segments = 32) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/**
 * A café of our own: a round table of dark green marble with a brass band, standing on a floor of dark and grey
 * tiles, an espresso cup on its saucer and the tiles' wooden box, emptied.
 */
export function cafe(scene: T.Scene, own: Own) {
  const rich = capable(),
    standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const stone = own(new T.CanvasTexture(marble(rich ? 1024 : 512)));
  stone.colorSpace = T.SRGBColorSpace;
  stone.anisotropy = 4;
  const top = new T.Mesh(own(new T.CircleGeometry(TABLE_R, 96).rotateX(-Math.PI / 2)), own(glossy({ map: stone, roughness: 0.32 }, 0.8)));
  top.receiveShadow = true;
  scene.add(top);
  // The edge of the slab, and a brass band round it.
  const edge = new T.Mesh(own(new T.CylinderGeometry(TABLE_R, TABLE_R - 0.05, 0.28, 96, 1, true)), standard({ color: "#1a2723", roughness: 0.4, side: T.DoubleSide }));
  edge.position.y = -0.14;
  scene.add(edge);
  const band = new T.Mesh(
    own(new T.TorusGeometry(TABLE_R + 0.02, 0.06, 8, 120).rotateX(Math.PI / 2)),
    standard(rich ? { color: "#c9a259", metalness: 1, roughness: 0.3 } : { color: "#c9a861", metalness: 0.3, roughness: 0.4 }),
  );
  band.position.y = -0.02;
  scene.add(band);
  // The floor far below.
  const tiles = own(new T.CanvasTexture(checks()));
  tiles.colorSpace = T.SRGBColorSpace;
  tiles.wrapS = tiles.wrapT = T.RepeatWrapping;
  tiles.repeat.set(30, 30);
  const floor = new T.Mesh(own(new T.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), standard({ map: tiles, roughness: 0.5 }));
  floor.position.y = -7;
  floor.receiveShadow = true;
  scene.add(floor);
  // An espresso cup on its saucer, at the far right.
  const china = own(glossy({ color: "#f4f1ea", roughness: 0.25 }, 0.8)),
    cup = new T.Group();
  const saucer = new T.Mesh(own(lathe([[0, 0], [0.5, 0], [0.62, 0.05], [0.72, 0.1], [0.7, 0.12], [0.58, 0.08], [0.25, 0.06], [0, 0.06]])), china);
  const bowl = new T.Mesh(own(lathe([[0, 0.06], [0.2, 0.06], [0.24, 0.1], [0.33, 0.3], [0.36, 0.52], [0.33, 0.52], [0.3, 0.32], [0.2, 0.14], [0, 0.14]])), china);
  const coffee = new T.Mesh(own(new T.CircleGeometry(0.32, 32).rotateX(-Math.PI / 2)), standard({ color: "#3b2414", roughness: 0.25 }));
  coffee.position.y = 0.44;
  const handle = new T.Mesh(own(new T.TorusGeometry(0.11, 0.03, 8, 16, Math.PI * 1.3)), china);
  handle.position.set(0.38, 0.32, 0);
  handle.rotation.z = -Math.PI * 0.65;
  const spoon = new T.Mesh(own(block(0.7, 0.02, 0.07, 0.01)), standard(rich ? { color: "#d9d9dc", metalness: 1, roughness: 0.25 } : { color: "#c9c9cc", metalness: 0.3, roughness: 0.35 }));
  spoon.position.set(0.1, 0.11, 0.42);
  spoon.rotation.y = 0.5;
  cup.add(saucer, bowl, coffee, handle, spoon);
  cup.traverse((m) => (m.castShadow = m.receiveShadow = true));
  cup.position.set(CUP.x, 0, CUP.z);
  cup.rotation.y = -0.6;
  scene.add(cup);
  // The tiles' box, an open tray of dark wood lined with felt, at the near left.
  const box = standard({ map: own(wood(true, 0.8)), color: "#8a6a50", roughness: 0.55 }),
    felt = standard({ color: "#4a1a1e", roughness: 1 }),
    tray = new T.Group();
  for (const [w, d, x, z] of [
    [2.5, 0.1, 0, -0.65],
    [2.5, 0.1, 0, 0.65],
    [0.1, 1.4, -1.2, 0],
    [0.1, 1.4, 1.2, 0],
  ] as const) {
    const wall = new T.Mesh(own(block(w, 0.32, d, 0.03)), box);
    wall.position.set(x, 0.16, z);
    tray.add(wall);
  }
  const bed = new T.Mesh(own(block(2.4, 0.06, 1.3, 0.02)), felt);
  bed.position.y = 0.03;
  tray.add(bed);
  // A brass spinner on the tray's end, as on the tiles.
  const knob = new T.Mesh(own(new T.CylinderGeometry(0.07, 0.08, 0.05, 20).rotateZ(Math.PI / 2)), standard(rich ? { color: "#c9a259", metalness: 1, roughness: 0.3 } : { color: "#c9a861", metalness: 0.3, roughness: 0.4 }));
  knob.position.set(1.27, 0.18, 0);
  tray.add(knob);
  tray.traverse((m) => (m.castShadow = m.receiveShadow = true));
  tray.position.set(-5.5, 0, 3.3);
  tray.rotation.y = -0.45;
  tray.scale.setScalar(0.8);
  scene.add(tray);
}
