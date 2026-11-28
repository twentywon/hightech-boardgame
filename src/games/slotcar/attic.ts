import * as T from "three";
import { block, stuff, wood } from "../../engine/scene-utils";
import { speckled } from "../../engine/scenery";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A small picture drawn by the page, as a texture. */
function painted(own: Own, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d")!);
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/**
 * The hobby room under the roof where the track is laid (our own): a big table with a green mat on trestles, old
 * floorboards and a rug, a gable wall of painted boards with a round window, rafters going up under the slope of
 * the roof, a shelf of boxed cars and trophies, a chequered banner, a workbench with a vice and a lamp, and stools.
 * `half` and `depth` are the half extents of the table's top (its top at y = 0), `drop` how far below it the floor is.
 */
export function attic(scene: T.Object3D, own: Own, half: number, depth: number, drop: number) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const floor = -drop;
  // Floorboards, and a worn rug under the table.
  const boards = own(wood(false, 0.7));
  boards.repeat.set(9, 9);
  add(new T.PlaneGeometry(120, 120), standard({ map: boards, color: "#b8875a", roughness: 0.7 }), 0, floor, 0, false).rotation.x = -Math.PI / 2;
  add(new T.PlaneGeometry(half * 2 + 6, depth * 2 + 6), standard({ color: "#6e2f2a", roughness: 1 }), 0, floor + 0.01, 0, false).rotation.x = -Math.PI / 2;
  add(new T.PlaneGeometry(half * 2 + 5, depth * 2 + 5), standard({ map: own(speckled("#93413a", ["#7c332d", "#a8564c", "#5f2622"], 11, 6, 3000)), roughness: 1 }), 0, floor + 0.02, 0, false).rotation.x = -Math.PI / 2;
  // The table: a thick top with a green mat and a varnished edge, on four legs and two cross rails.
  const top = standard({ ...stuff("boards", "#a0703f", 3, own), roughness: 0.6 }),
    mat = standard({ map: own(speckled("#3f6b3a", ["#36603a", "#4a7741", "#3a6534", "#2f5630"], 5, 5, 5000)), roughness: 0.95 });
  add(block(half * 2, 0.22, depth * 2, 0.05), top, 0, -0.11, 0);
  add(new T.PlaneGeometry(half * 2 - 0.3, depth * 2 - 0.3), mat, 0, 0.002, 0, false).rotation.x = -Math.PI / 2;
  const leg = standard({ color: "#6b4a2c", roughness: 0.7 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) add(new T.BoxGeometry(0.4, drop - 0.22, 0.4), leg, sx * (half - 0.6), (floor - 0.22) / 2, sz * (depth - 0.6));
  for (const sz of [-1, 1]) add(new T.BoxGeometry(half * 2 - 1.2, 0.3, 0.16), leg, 0, -0.5, sz * (depth - 0.6));
  // The gable wall behind: painted boards, a skirting, and a round window full of daylight.
  const wallZ = -depth - 5,
    paint = standard({ ...stuff("boards", "#d9cdb4", 6, own, 3), roughness: 0.9 });
  add(new T.PlaneGeometry(80, 30), paint, 0, floor + 15, wallZ, false);
  add(new T.BoxGeometry(80, 0.5, 0.2), standard({ color: "#7a5636" }), 0, floor + 0.25, wallZ + 0.1, false);
  const windowY = floor + 8.2;
  add(new T.CircleGeometry(1.9, 40), own(new T.MeshBasicMaterial({ color: "#dff0ff" })), -half * 0.45, windowY, wallZ + 0.05, false);
  add(new T.TorusGeometry(1.95, 0.22, 10, 48), standard({ color: "#f2ece0", roughness: 0.5 }), -half * 0.45, windowY, wallZ + 0.15, false);
  for (const angle of [0, Math.PI / 2]) {
    const bar = add(new T.BoxGeometry(3.8, 0.12, 0.12), standard({ color: "#f2ece0" }), -half * 0.45, windowY, wallZ + 0.15, false);
    bar.rotation.z = angle;
  }
  // The roof's slope shows on the gable as two great rafters from the low side walls to the ridge, with a collar
  // beam and a king post between them; nothing of the roof hangs over the table, where the camera looks down from.
  const rafter = standard({ ...stuff("boards", "#8a5f38", 1, own), roughness: 0.75 }),
    eaves = half + 9,
    knee = floor + 5,
    ridge = floor + 22;
  for (const sx of [-1, 1]) {
    const run = Math.hypot(eaves, ridge - knee),
      tilt = Math.atan2(ridge - knee, eaves);
    add(new T.BoxGeometry(run, 0.7, 0.5), rafter, (sx * eaves) / 2, (knee + ridge) / 2, wallZ + 0.3, false).rotation.z = -sx * tilt;
    // The low side wall under the eaves, along the room.
    add(new T.PlaneGeometry(depth * 2 + 30, knee - floor), paint, sx * eaves, (floor + knee) / 2, wallZ + depth + 15, false).rotation.y = -sx * (Math.PI / 2);
  }
  add(new T.BoxGeometry(eaves * 1.2, 0.6, 0.45), rafter, 0, floor + 14, wallZ + 0.3, false);
  add(new T.BoxGeometry(0.6, ridge - floor - 14, 0.45), rafter, 0, (floor + 14 + ridge) / 2, wallZ + 0.3, false);
  // A shelf on the wall: boxed cars in bright card, and two trophies.
  const shelfY = floor + 6.6,
    shelfX = half * 0.42;
  add(new T.BoxGeometry(9, 0.18, 1.1), rafter, shelfX, shelfY, wallZ + 0.55);
  for (const sx of [-3.8, 3.8]) add(new T.BoxGeometry(0.16, 0.8, 0.9), rafter, shelfX + sx, shelfY - 0.45, wallZ + 0.5);
  const boxColors = ["#d23a2c", "#2a5fc4", "#f0c02a", "#2f8f4a", "#e8e2d4"];
  boxColors.forEach((color, i) => {
    const label = painted(own, 128, 64, (ctx) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 40, 128, 9);
      ctx.fillStyle = "#111111";
      for (let k = 0; k < 8; k++) ctx.fillRect(k * 16 + (k % 2) * 0, 52, 8, 6);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(40, 22, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(28, 18, 26, 8);
    });
    add(new T.BoxGeometry(1.4, 0.7, 0.8), [standard({ color }), standard({ color }), standard({ color }), standard({ color }), standard({ map: label }), standard({ color })] as unknown as T.Material, shelfX - 3 + i * 1.45, shelfY + 0.44, wallZ + 0.55);
  });
  const gold = standard({ color: "#d9a93a", roughness: 0.3, metalness: 0.85 });
  for (const [x, size] of [[shelfX + 3.9, 1], [shelfX + 3.2, 0.75]] as const) {
    add(new T.CylinderGeometry(0.3 * size, 0.3 * size, 0.2 * size, 16), standard({ color: "#2b2b2b" }), x, shelfY + 0.19, wallZ + 0.55);
    add(new T.CylinderGeometry(0.06, 0.08, 0.5 * size, 10), gold, x, shelfY + 0.5 * size, wallZ + 0.55);
    add(new T.SphereGeometry(0.34 * size, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), gold, x, shelfY + 1.05 * size, wallZ + 0.55);
  }
  // A chequered banner hung from two nails.
  const flag = painted(own, 256, 128, (ctx) => {
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 8; c++) {
        ctx.fillStyle = (r + c) % 2 ? "#151515" : "#f4f1ea";
        ctx.fillRect(c * 32, r * 32, 32, 32);
      }
  });
  const banner = add(new T.PlaneGeometry(4.4, 2.2, 8, 1), standard({ map: flag, side: T.DoubleSide }), half * 0.42, floor + 9.3, wallZ + 0.12, false);
  banner.rotation.z = 0.04;
  // A workbench at the left with a vice and a lamp on an arm, and a box of spare parts.
  const benchX = -half - 3.2,
    bench = standard({ ...stuff("boards", "#9c6b3c", 2, own), roughness: 0.65 }),
    steel = standard({ color: "#4a5058", roughness: 0.4, metalness: 0.7 });
  add(block(2.6, 0.25, depth * 1.2, 0.04), bench, benchX, floor + 2.9, -depth * 0.2);
  for (const sz of [-1, 1]) add(new T.BoxGeometry(0.22, 2.8, 0.22), leg, benchX, floor + 1.4, -depth * 0.2 + sz * depth * 0.5);
  add(new T.BoxGeometry(0.7, 0.45, 0.5), steel, benchX + 0.4, floor + 3.25, -depth * 0.55);
  add(new T.BoxGeometry(0.9, 0.12, 0.3), steel, benchX + 0.4, floor + 3.55, -depth * 0.55);
  add(new T.CylinderGeometry(0.3, 0.38, 0.12, 16), steel, benchX - 0.5, floor + 3.08, depth * 0.1);
  const arm = add(new T.CylinderGeometry(0.05, 0.05, 2.2, 8), steel, benchX - 0.3, floor + 4.1, depth * 0.1);
  arm.rotation.z = -0.5;
  const shade = add(new T.ConeGeometry(0.45, 0.6, 18, 1, true), standard({ color: "#2f6b4a", roughness: 0.5, side: T.DoubleSide }), benchX + 0.3, floor + 5.0, depth * 0.1);
  shade.rotation.z = 0.9;
  add(new T.BoxGeometry(1.2, 0.5, 0.8), standard({ color: "#c43c2a", roughness: 0.5 }), benchX + 0.2, floor + 3.28, depth * 0.35);
  // Two stools at the right of the table.
  const seat = standard({ color: "#2f3e57", roughness: 0.6 });
  for (const [x, z] of [[half + 1.6, -depth * 0.4], [half + 1.9, depth * 0.35]]) {
    add(new T.CylinderGeometry(0.75, 0.75, 0.22, 24), seat, x, floor + 2.4, z);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2,
        foot = add(new T.CylinderGeometry(0.06, 0.08, 2.4, 8), leg, x + Math.cos(a) * 0.45, floor + 1.2, z + Math.sin(a) * 0.45);
      foot.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    }
  }
  return { wallZ, windowAt: new T.Vector3(-half * 0.45, windowY, wallZ) };
}
