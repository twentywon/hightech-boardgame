import * as T from "three";
import { block, stuff } from "../../engine/scene-utils";
import { CLAYS, HOUSE } from "./clay";
import { canvas, sequence, skyDome, texture } from "./paint";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** How much larger than life the clays are drawn, so that they read at forty metres. */
export const CLAY_LARGER = 1.7;
/**
 * The clay range on a bright day, all modelled and painted in code: mown grass in stripes, the shooter's concrete pad
 * and a low rail, the trap house sunk before it with its green roof, a white post-and-rail fence along both sides, a
 * line of poplars and round trees with hills behind, and a scoreboard at the left with a box for every clay.
 */
export interface Range {
  /** Paints the board: each clay's result so far (0 lost, 1 or 2 the barrel that broke it) and how many are thrown. */
  board: (card: number[], thrown: number) => void;
  /** The shape and paint of a clay (shared by the one in the air and the pieces it breaks into). */
  clay: { dome: T.BufferGeometry; piece: T.BufferGeometry; paint: T.Material };
}
export function buildRange(scene: T.Scene, keep: Keep): Range {
  const std = (o: T.MeshStandardMaterialParameters) => keep(new T.MeshStandardMaterial({ roughness: 0.8, ...o })),
    put = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(keep(g), m);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    },
    random = sequence(311);
  scene.add(skyDome(keep, "#e9eef0", "#b8d3ec", "#5b8fd6", "#fff4d8", 0.6));
  scene.fog = new T.Fog("#d5e3ee", 70, 320);
  // Mown grass in broad stripes toward the trap house.
  const { c: grassC, ctx: grass } = canvas(512, 512);
  for (let k = 0; k < 8; k++) {
    grass.fillStyle = k % 2 ? "#6f9a43" : "#77a34a";
    grass.fillRect(k * 64, 0, 64, 512);
  }
  for (let k = 0; k < 5000; k++) {
    grass.fillStyle = random() < 0.5 ? "rgba(40,70,20,0.18)" : "rgba(200,230,140,0.14)";
    grass.fillRect(random() * 512, random() * 512, 1.5, 4);
  }
  const ground = put(new T.PlaneGeometry(400, 400), std({ ...stuff("grass", "#6f9a43", 60, keep), map: texture(grassC, keep, [16, 16]) }), 0, 0, -120);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  // The shooter's pad and the rail before it.
  const concrete = std({ ...stuff("stone", "#b9b6ad", 2, keep), roughness: 0.9 });
  put(block(2.4, 0.08, 2.2, 0.02), concrete, 0, 0.04, -0.3);
  const rail = std({ color: "#e9e4d6", roughness: 0.5 });
  for (const x of [-0.9, 0.9]) put(new T.CylinderGeometry(0.03, 0.03, 1.0, 10), rail, x, 0.5, -1.25);
  put(new T.CylinderGeometry(0.025, 0.025, 1.8, 10), rail, 0, 0.98, -1.25).rotation.z = Math.PI / 2;
  // The trap house: a low concrete bunker sunk before the shooter, a green roof and a dark slot the clays leave from.
  const house = new T.Group();
  house.position.set(HOUSE.x, 0, HOUSE.z);
  scene.add(house);
  put(block(3.4, 0.62, 2.4, 0.05), concrete, 0, 0.31, -0.2, house);
  put(block(3.6, 0.1, 2.6, 0.03), std({ color: "#3c6b3a", roughness: 0.7 }), 0, 0.67, -0.2, house);
  put(new T.PlaneGeometry(1.4, 0.16), std({ color: "#161616" }), 0, 0.47, 1.0, house).castShadow = false;
  const { c: signC, ctx: sign } = canvas(256, 64);
  sign.fillStyle = "#f3f0e4";
  sign.fillRect(0, 0, 256, 64);
  sign.font = '900 42px "Inter", sans-serif';
  sign.textAlign = "center";
  sign.fillStyle = "#2b5a2a";
  sign.fillText("TRAP 1", 128, 47);
  put(new T.PlaneGeometry(0.9, 0.22), std({ map: texture(signC, keep) }), 0, 0.24, 1.002, house).castShadow = false;
  // White post-and-rail fences along both sides and across the far end of the field.
  const post = keep(new T.BoxGeometry(0.12, 1.2, 0.12)),
    bar = keep(new T.BoxGeometry(0.06, 0.1, 6)),
    white = std({ color: "#f2f0ea", roughness: 0.6 }),
    posts: T.Matrix4[] = [],
    bars: T.Matrix4[] = [];
  for (const side of [-1, 1])
    for (let z = -3; z > -120; z -= 6) {
      posts.push(new T.Matrix4().makeTranslation(side * 24, 0.6, z));
      for (const y of [0.45, 0.95]) bars.push(new T.Matrix4().makeTranslation(side * 24, y, z - 3));
    }
  const fenceA = new T.InstancedMesh(post, white, posts.length),
    fenceB = new T.InstancedMesh(bar, white, bars.length);
  posts.forEach((m, i) => fenceA.setMatrixAt(i, m));
  bars.forEach((m, i) => fenceB.setMatrixAt(i, m));
  fenceA.castShadow = fenceB.castShadow = true;
  scene.add(fenceA, fenceB);
  // Trees beyond the field: tall poplars and round trees, laid by a fixed sequence; low hills behind them.
  const trunk = keep(new T.CylinderGeometry(0.22, 0.32, 1, 7)),
    poplar = keep(new T.SphereGeometry(1, 10, 8)),
    round = keep(new T.IcosahedronGeometry(1, 1)),
    bark = std({ color: "#5b4632" }),
    leaves = [std({ color: "#3f6a2e", flatShading: true }), std({ color: "#4f7d35", flatShading: true }), std({ color: "#5d8a3a", flatShading: true })],
    trunks: T.Matrix4[] = [],
    crowns: T.Matrix4[][] = [[], [], []],
    crownsRound: T.Matrix4[][] = [[], [], []];
  const tree = (x: number, z: number) => {
    const tall = random() < 0.45,
      h = tall ? 9 + random() * 6 : 6 + random() * 4,
      w = tall ? 1.4 + random() * 0.6 : 2.6 + random() * 1.6,
      which = Math.floor(random() * 3);
    trunks.push(new T.Matrix4().compose(new T.Vector3(x, h * 0.25, z), new T.Quaternion(), new T.Vector3(1, h * 0.5, 1)));
    (tall ? crowns : crownsRound)[which].push(new T.Matrix4().compose(new T.Vector3(x, h * (tall ? 0.58 : 0.62), z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), random() * 6), new T.Vector3(w, tall ? h * 0.48 : w * 0.85, w)));
  };
  for (let x = -110; x < 110; x += 5 + random() * 4) tree(x, -128 - random() * 30);
  for (const side of [-1, 1]) for (let z = -10; z > -125; z -= 6 + random() * 6) tree(side * (32 + random() * 30), z);
  const instanced = (geometry: T.BufferGeometry, material: T.Material, list: T.Matrix4[]) => {
    if (!list.length) return;
    const mesh = new T.InstancedMesh(geometry, material, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    scene.add(mesh);
  };
  instanced(trunk, bark, trunks);
  crowns.forEach((list, i) => instanced(poplar, leaves[i], list));
  crownsRound.forEach((list, i) => instanced(round, leaves[i], list));
  const hill = std({ color: "#7f9f6a", flatShading: true });
  for (let k = 0; k < 6; k++) {
    const h = put(new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hill, -180 + k * 72 + random() * 20, 0, -230 - random() * 40);
    h.scale.set(60 + random() * 40, 18 + random() * 16, 30);
    h.castShadow = false;
  }
  // The scoreboard at the left of the field: a box for each clay.
  const { c: boardC, ctx } = canvas(1024, 512),
    boardMap = texture(boardC, keep),
    board = new T.Group();
  board.position.set(-10.5, 0, -18);
  board.rotation.y = 0.55;
  scene.add(board);
  for (const x of [-1.6, 1.6]) put(new T.CylinderGeometry(0.07, 0.07, 3.2, 10), std({ color: "#3a3d42", metalness: 0.6, roughness: 0.4 }), x, 1.6, -0.06, board);
  put(block(3.6, 1.8, 0.1, 0.03), std({ color: "#1d2a22" }), 0, 2.4, -0.06, board);
  put(new T.PlaneGeometry(3.4, 1.7), keep(new T.MeshBasicMaterial({ map: boardMap, toneMapped: false })), 0, 2.4, 0.0, board).castShadow = false;
  const paintBoard = (card: number[], thrown: number) => {
    ctx.fillStyle = "#14231a";
    ctx.fillRect(0, 0, 1024, 512);
    ctx.font = '900 64px "Inter", "Noto Sans KR", sans-serif';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("CLAY 25", 44, 70);
    const broken = card.filter((r) => r > 0).length;
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffd84a";
    ctx.fillText(`${broken} / ${Math.min(CLAYS, thrown)}`, 980, 70);
    for (let k = 0; k < CLAYS; k++) {
      const col = k % 13,
        row = Math.floor(k / 13),
        x = 44 + col * 72,
        y = 160 + row * 150;
      ctx.fillStyle = "#24392b";
      ctx.fillRect(x, y, 62, 110);
      const r = card[k];
      ctx.textAlign = "center";
      ctx.font = '900 54px "Inter", sans-serif';
      if (r !== undefined) {
        ctx.fillStyle = r > 0 ? "#ff8a2a" : "#6f7f74";
        ctx.fillText(r > 0 ? "X" : "O", x + 31, y + 46);
        ctx.font = '700 28px "Inter", sans-serif';
        ctx.fillStyle = "#cfe0d2";
        if (r > 0) ctx.fillText(r === 1 ? "1" : "2", x + 31, y + 92);
      } else if (k === thrown - 1) {
        ctx.strokeStyle = "#ffd84a";
        ctx.lineWidth = 5;
        ctx.strokeRect(x + 3, y + 3, 56, 104);
      }
    }
    boardMap.needsUpdate = true;
  };
  paintBoard([], 0);
  // A clay: an orange dome with a black rim underneath; its pieces are wedges of the same.
  const dome = keep(
      new T.LatheGeometry(
        [new T.Vector2(0, 0.018), new T.Vector2(0.03, 0.017), new T.Vector2(0.045, 0.012), new T.Vector2(0.055, 0.004), new T.Vector2(0.056, -0.006), new T.Vector2(0.05, -0.008), new T.Vector2(0.0, -0.004)].map((p) => p.multiplyScalar(CLAY_LARGER)),
        20,
      ),
    ),
    piece = keep(new T.CylinderGeometry(0.05 * CLAY_LARGER, 0.055 * CLAY_LARGER, 0.02 * CLAY_LARGER, 3, 1, false, 0, Math.PI / 3)),
    paint = std({ color: "#ff6a1c", roughness: 0.55, emissive: "#401200" });
  // The sun high and to the left behind the shooter, a blue sky light.
  scene.add(new T.HemisphereLight("#dbe9ff", "#5c7a3a", 1.5));
  const sun = new T.DirectionalLight("#fff4e0", 2.4);
  sun.position.set(-30, 60, 40);
  sun.target.position.set(0, 0, -25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 160 });
  sun.shadow.normalBias = 0.05;
  keep(sun.shadow);
  scene.add(sun, sun.target);
  return { board: paintBoard, clay: { dome, piece, paint } };
}
