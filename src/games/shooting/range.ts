import * as T from "three";
import { block, stuff } from "../../engine/scene-utils";
import { Grove } from "../../engine/foliage";
import { CLAYS, CLAY_SIZE, HOUSES } from "./clay";
import { canvas, sequence, skyDome, texture } from "./paint";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** How much larger than life the clays are drawn (a real one is 110 mm across), so that they read as discs in the sky. */
export const CLAY_LARGER = CLAY_SIZE / 0.056;
/**
 * The clay range on a bright day, all modelled and painted in code, seen from the shooter's place with a low horizon
 * and a wide sky: a blue sky with heaped white clouds over most of the view, mown grass in stripes, the shooter's
 * concrete pad and a low rail, the trap house sunk before it with its green roof and one at either side beyond the
 * view behind a grassy bank, a white post-and-rail fence along both sides and across the far end, a line of poplars
 * and round trees with hills behind, and a scoreboard at the left with a box for every clay.
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
  scene.add(skyDome(keep, "#dfeaf3", "#8fbbe8", "#2f6fd0", "#fff4d8", 0.6, 520));
  scene.fog = new T.Fog("#d5e3ee", 90, 420);
  // Heaped white clouds over the sky, each a picture of its own painted from soft puffs (grey under, lit on top),
  // standing far off so that they keep still while the eye turns.
  const cloudPictures = [0, 1, 2, 3].map((k) => {
    const { c, ctx } = canvas(512, 256),
      r = sequence(900 + k * 13),
      puffs = 26 + Math.floor(r() * 14);
    for (let n = 0; n < puffs; n++) {
      const along = r(),
        x = 70 + along * 372,
        bump = Math.sin(along * Math.PI),
        y = 168 - bump * (40 + r() * 60) + (r() - 0.5) * 24,
        rad = 30 + bump * 40 + r() * 26,
        g = ctx.createRadialGradient(x, y - rad * 0.35, rad * 0.1, x, y, rad);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.55, "rgba(246,249,253,0.85)");
      g.addColorStop(0.85, "rgba(214,226,240,0.45)");
      g.addColorStop(1, "rgba(214,226,240,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // A flattish underside, fading out softly, faintly grey.
    ctx.globalCompositeOperation = "destination-in";
    const base = ctx.createLinearGradient(0, 0, 0, 256);
    base.addColorStop(0, "rgba(0,0,0,1)");
    base.addColorStop(0.7, "rgba(0,0,0,1)");
    base.addColorStop(0.86, "rgba(0,0,0,0)");
    base.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 512, 256);
    ctx.globalCompositeOperation = "source-atop";
    const under = ctx.createLinearGradient(0, 120, 0, 196);
    under.addColorStop(0, "rgba(170,186,208,0)");
    under.addColorStop(1, "rgba(170,186,208,0.55)");
    ctx.fillStyle = under;
    ctx.fillRect(0, 120, 512, 76);
    ctx.globalCompositeOperation = "source-over";
    return keep(new T.CanvasTexture(c));
  });
  for (const picture of cloudPictures) {
    picture.colorSpace = T.SRGBColorSpace;
    // Light on the clear sky with no dark fringe at the soft edges.
    picture.premultiplyAlpha = true;
  }
  const clouds = [
    [-0.95, 0.3, 1.25],
    [-0.55, 0.16, 1.0],
    [-0.12, 0.38, 1.35],
    [0.3, 0.2, 0.95],
    [0.72, 0.34, 1.2],
    [1.08, 0.14, 0.9],
    [-0.35, 0.56, 1.1],
    [0.5, 0.62, 1.3],
    [-1.25, 0.12, 0.8],
    [1.35, 0.42, 1.0],
    [0.05, 0.1, 0.7],
    [-0.75, 0.75, 1.15],
  ];
  clouds.forEach(([yaw, rise, size], k) => {
    const far = 300,
      sprite = new T.Sprite(keep(new T.SpriteMaterial({ map: cloudPictures[k % 4], fog: false, depthWrite: false, transparent: true, premultipliedAlpha: true })));
    sprite.position.set(Math.sin(yaw) * far * Math.cos(rise), 1.6 + Math.sin(rise) * far, -Math.cos(yaw) * far * Math.cos(rise));
    sprite.scale.set(150 * size, 75 * size, 1);
    sprite.renderOrder = -9;
    scene.add(sprite);
  });
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
  house.position.set(HOUSES[0].x, 0, HOUSES[0].z);
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
  // The side houses, beyond the view at either side: the same bunker turned toward the field, its slot facing across,
  // behind a low bank of grass.
  const bank = std({ ...stuff("grass", "#6c9842", 2, keep), flatShading: true });
  for (const side of [-1, 1]) {
    const at = HOUSES[side < 0 ? 1 : 2],
      g = new T.Group();
    g.position.set(at.x + side * 1.4, 0, at.z);
    g.rotation.y = -side * Math.PI * 0.5;
    scene.add(g);
    put(block(3.0, 1.2, 2.4, 0.05), concrete, 0, 0.6, 0, g);
    put(block(3.2, 0.1, 2.6, 0.03), std({ color: "#3c6b3a", roughness: 0.7 }), 0, 1.25, 0, g);
    put(new T.PlaneGeometry(1.4, 0.16), std({ color: "#161616" }), 0, 1.0, 1.21, g).castShadow = false;
    const mound = put(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bank, side * -2.6, 0, at.z);
    mound.position.x = at.x - side * 2.4;
    mound.scale.set(1.4, 1.3, 4.2);
  }
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
  for (let x = -21; x <= 21; x += 6) {
    posts.push(new T.Matrix4().makeTranslation(x, 0.6, -92));
    if (x < 21) for (const y of [0.45, 0.95]) bars.push(new T.Matrix4().compose(new T.Vector3(x + 3, y, -92), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2), new T.Vector3(1, 1, 1)));
  }
  const fenceA = new T.InstancedMesh(post, white, posts.length),
    fenceB = new T.InstancedMesh(bar, white, bars.length);
  posts.forEach((m, i) => fenceA.setMatrixAt(i, m));
  bars.forEach((m, i) => fenceB.setMatrixAt(i, m));
  fenceA.castShadow = fenceB.castShadow = true;
  scene.add(fenceA, fenceB);
  // Trees beyond the field: tall poplars and round trees, laid by a fixed sequence; low hills behind them.
  // Their crowns are painted leaves on cards (`Grove`, as in the hunt's wood): fewer cards beyond 48 m.
  const trunk = keep(new T.CylinderGeometry(0.22, 0.32, 1, 7)),
    bark = std({ color: "#5b4632" }),
    leaves = ["#3f6a2e", "#4f7d35", "#5d8a3a"],
    grove = new Grove(scene, keep, { near: 48, bright: 1.5, lift: 1.2 }),
    trunks: T.Matrix4[] = [];
  const tree = (x: number, z: number) => {
    const tall = random() < 0.45,
      h = tall ? 9 + random() * 6 : 6 + random() * 4,
      w = tall ? 1.4 + random() * 0.6 : 2.6 + random() * 1.6,
      which = Math.floor(random() * 3);
    trunks.push(new T.Matrix4().compose(new T.Vector3(x, h * 0.25, z), new T.Quaternion(), new T.Vector3(1, h * 0.5, 1)));
    // A poplar: a tall narrow crown; a round tree: a broad heaped one.
    grove.crown(tall ? "broad" : "oak", [x, h * (tall ? 0.58 : 0.62), z], [w * (tall ? 1.15 : 1), tall ? h * 0.48 : w * 0.85, w * (tall ? 1.15 : 1)], leaves[which], random() * 6);
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
  grove.build();
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
    paint = std({ color: "#ff8a1a", roughness: 0.5, emissive: "#5a2400" });
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
