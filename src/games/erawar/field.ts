import * as T from "three";
import { canvas, painted, stream, normalFrom, texture, type Own } from "../goldraid/paint";
import { BASE_X, SLOTS, turretAt } from "./sim";
import type { Kit } from "./models";

/**
 * Where 시대 전쟁 is fought, all painted in code: a wide green plain under a big sky, a worn dirt lane between the two
 * bases, hills, woods and blue mountains behind, a few clouds; and each base as its era builds it (a cave camp behind a
 * stockade with a fire, a stone castle with towers, a brick fort, a concrete bunker with a radar), with a mast at its
 * back where its three turrets stand, and the turrets themselves (a sling, a bolt-thrower, a fort gun, twin cannon).
 * Bases are built for side 0 (facing +x) and mirrored for side 1.
 */
export interface Field {
  /** Each side's bases, one for each era (built when first needed). */
  base(side: number, era: number): T.Group;
  /** A turret of an era, facing +x. */
  turret(era: number): T.Group;
  clouds: T.Sprite[];
}
const rnd = stream(77);
/** How far in front of a base (toward the eye) its turrets stand. */
export const MAST_Z = 1.15;
function grassTexture(own: Own) {
  return painted(
    own,
    256,
    256,
    (ctx) => {
      ctx.fillStyle = "#6c9a3c";
      ctx.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 2600; k++) {
        const x = rnd() * 256,
          y = rnd() * 256,
          l = 30 + rnd() * 30;
        ctx.strokeStyle = `hsla(${80 + rnd() * 30}, ${40 + rnd() * 25}%, ${l}%, 0.55)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 3, y - 3 - rnd() * 4);
        ctx.stroke();
      }
    },
    [18, 9],
  );
}
function dirtCanvas() {
  return canvas(512, 64, (ctx) => {
    ctx.fillStyle = "#a07c52";
    ctx.fillRect(0, 0, 512, 64);
    for (let k = 0; k < 2400; k++) {
      const x = rnd() * 512,
        y = rnd() * 64,
        l = 35 + rnd() * 25;
      ctx.fillStyle = `hsla(30, ${25 + rnd() * 20}%, ${l}%, 0.5)`;
      ctx.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    // Ruts worn along the lane, and grass creeping in at its edges.
    for (const y of [22, 42]) {
      ctx.fillStyle = "rgba(80,58,36,0.35)";
      ctx.fillRect(0, y - 2, 512, 4);
    }
    for (let k = 0; k < 600; k++) {
      const x = rnd() * 512,
        edge = rnd() < 0.5 ? rnd() * 8 : 64 - rnd() * 8;
      ctx.fillStyle = `hsla(${85 + rnd() * 20}, 40%, ${32 + rnd() * 15}%, 0.8)`;
      ctx.fillRect(x, edge, 1.5, 2.5);
    }
  });
}
function skyTexture(own: Own) {
  return texture(
    own,
    canvas(8, 256, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#3d7fd1");
      g.addColorStop(0.55, "#8cc0ef");
      g.addColorStop(0.8, "#d7e9f6");
      g.addColorStop(1, "#f1ead8");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, 256);
    }),
  );
}
function cloudTexture(own: Own) {
  return texture(
    own,
    canvas(256, 128, (ctx) => {
      const r = stream(5);
      for (let k = 0; k < 14; k++) {
        const x = 40 + r() * 176,
          y = 50 + r() * 40,
          rad = 22 + r() * 30,
          g = ctx.createRadialGradient(x, y - 8, 0, x, y, rad);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.7, "rgba(245,248,252,0.6)");
        g.addColorStop(1, "rgba(240,244,250,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}
/** A stone or brick wall picture (and its height, for the relief). */
function masonry(own: Own, brick: boolean, rich: boolean) {
  const w = 256,
    h = 256,
    rows = brick ? 16 : 7,
    cols = brick ? 8 : 4,
    r = stream(brick ? 3 : 4);
  const paint = (ctx: CanvasRenderingContext2D, height: boolean) => {
    ctx.fillStyle = height ? "#333" : brick ? "#5b3324" : "#6b6862";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++)
      for (let x = -1; x < cols; x++) {
        const bw = w / cols,
          bh = h / rows,
          ox = (y % 2) * bw * 0.5,
          l = brick ? 32 + r() * 14 : 48 + r() * 16;
        ctx.fillStyle = height ? `rgb(${200 + r() * 40},${200},${200})` : brick ? `hsl(${10 + r() * 10}, ${45 + r() * 15}%, ${l}%)` : `hsl(${30 + r() * 20}, ${6 + r() * 8}%, ${l}%)`;
        ctx.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
      }
  };
  const map = texture(own, canvas(w, h, (ctx) => paint(ctx, false)));
  map.wrapS = map.wrapT = T.RepeatWrapping;
  const normal = rich ? normalFrom(own, canvas(w, h, (ctx) => paint(ctx, true)), 3) : null;
  return { map, normal };
}
export function buildField(scene: T.Scene, own: Own, kit: Kit, rich: boolean): Field {
  scene.background = skyTexture(own);
  scene.fog = new T.Fog("#cfe2f0", 40, 110);
  const std = (o: T.MeshStandardMaterialParameters) => own(rich ? new T.MeshStandardMaterial({ roughness: 0.9, ...o }) : new T.MeshLambertMaterial({ color: o.color, map: o.map ?? null }));
  // The plain and the lane.
  const ground = new T.Mesh(own(new T.PlaneGeometry(140, 70)), std({ color: "#ffffff", map: grassTexture(own) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -20;
  ground.receiveShadow = true;
  scene.add(ground);
  const dirt = dirtCanvas(),
    lane = new T.Mesh(own(new T.PlaneGeometry(BASE_X * 2 + 5, 2.4)), std({ color: "#ffffff", map: texture(own, dirt), normalMap: rich ? normalFrom(own, dirt, 1.5) : undefined }));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.01, 0);
  lane.receiveShadow = true;
  scene.add(lane);
  // Hills, woods and mountains behind; a few stones and tufts in front.
  const hill = std({ color: "#5f8a37" }),
    hillFar = std({ color: "#7d9c62" }),
    mountain = std({ color: "#7e8fa6" }),
    snow = std({ color: "#f1f4f8" });
  const ball = kit.g.ballLo;
  for (let k = 0; k < 9; k++) {
    const m = new T.Mesh(ball, k % 2 ? hill : hillFar);
    m.scale.set(9 + rnd() * 10, 2.5 + rnd() * 3.5, 4 + rnd() * 3);
    m.position.set(-42 + k * 10.5 + rnd() * 4, -0.6, -14 - (k % 3) * 5 - rnd() * 3);
    scene.add(m);
  }
  for (let k = 0; k < 7; k++) {
    const tall = 14 + rnd() * 12,
      m = new T.Mesh(kit.g.cone, mountain);
    m.scale.set(tall * 1.1, tall, tall * 0.6);
    m.position.set(-54 + k * 18 + rnd() * 6, tall / 2 - 1, -55 - rnd() * 10);
    scene.add(m);
    const cap = new T.Mesh(kit.g.cone, snow);
    cap.scale.set(tall * 0.33, tall * 0.3, tall * 0.18);
    cap.position.set(m.position.x, tall - 1 - tall * 0.15, m.position.z + 0.2);
    scene.add(cap);
  }
  // Woods: instanced trunks and crowns (conifers and round trees) behind the lane, and at the far ends past the bases.
  const spots: { x: number; z: number; s: number; pine: boolean }[] = [];
  for (let k = 0; k < 70; k++) spots.push({ x: -46 + rnd() * 92, z: -4.5 - rnd() * 13, s: 0.8 + rnd() * 0.9, pine: rnd() < 0.55 });
  for (let k = 0; k < 10; k++) spots.push({ x: (rnd() < 0.5 ? -1 : 1) * (BASE_X + 4 + rnd() * 10), z: -2 + rnd() * 5, s: 0.8 + rnd() * 0.5, pine: rnd() < 0.5 });
  const trunk = new T.InstancedMesh(kit.g.cyl, kit.m.woodDark, spots.length),
    pines = spots.filter((p) => p.pine),
    rounds = spots.filter((p) => !p.pine),
    pine = new T.InstancedMesh(kit.g.cone, std({ color: "#2f5a2c" }), pines.length * 2),
    crown = new T.InstancedMesh(kit.g.ballLo, std({ color: "#4a7a2f" }), rounds.length),
    m4 = new T.Matrix4(),
    q = new T.Quaternion(),
    one = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => m4.compose(new T.Vector3(x, y, z), q, new T.Vector3(sx, sy, sz));
  spots.forEach((p, i) => trunk.setMatrixAt(i, one(p.x, 0.6 * p.s, p.z, 0.12 * p.s, 1.2 * p.s, 0.12 * p.s)));
  pines.forEach((p, i) => {
    pine.setMatrixAt(i * 2, one(p.x, 1.7 * p.s, p.z, 0.9 * p.s, 2.2 * p.s, 0.9 * p.s));
    pine.setMatrixAt(i * 2 + 1, one(p.x, 2.6 * p.s, p.z, 0.65 * p.s, 1.6 * p.s, 0.65 * p.s));
  });
  rounds.forEach((p, i) => crown.setMatrixAt(i, one(p.x, 1.9 * p.s, p.z, 1.1 * p.s, 1 * p.s, 1.1 * p.s)));
  for (const m of [trunk, pine, crown]) {
    m.castShadow = true;
    scene.add(m);
  }
  const pebbles = new T.InstancedMesh(kit.g.ballLo, kit.m.stone, 40);
  for (let k = 0; k < 40; k++) {
    const s = 0.06 + rnd() * 0.16;
    pebbles.setMatrixAt(k, one(-20 + rnd() * 40, s * 0.3, (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 1.8), s * 1.4, s, s));
  }
  scene.add(pebbles);
  const cloudMap = cloudTexture(own),
    clouds: T.Sprite[] = [];
  for (let k = 0; k < 8; k++) {
    const s = new T.Sprite(own(new T.SpriteMaterial({ map: cloudMap, transparent: true, depthWrite: false, opacity: 0.85, fog: false })));
    s.scale.set(14 + rnd() * 10, 6 + rnd() * 3, 1);
    s.position.set(-50 + k * 14 + rnd() * 6, 13 + rnd() * 6, -35 - rnd() * 10);
    scene.add(s);
    clouds.push(s);
  }
  // Materials of the bases.
  const stone = masonry(own, false, rich),
    brick = masonry(own, true, rich),
    wall = std({ color: "#ffffff", map: stone.map, normalMap: stone.normal ?? undefined }),
    bricks = std({ color: "#ffffff", map: brick.map, normalMap: brick.normal ?? undefined }),
    rock = std({ color: "#857a6c", flatShading: true }),
    concrete = std({ color: "#a2a29a" }),
    concreteDark = std({ color: "#7c7d77" }),
    sand = std({ color: "#b9a679" }),
    fire = own(new T.MeshBasicMaterial({ color: "#ffb347" })),
    flame = own(new T.MeshBasicMaterial({ color: "#ff6a1f" })),
    hole = own(new T.MeshBasicMaterial({ color: "#14110e" }));
  const g = kit.g,
    add = (parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new T.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    },
    dodeca = own(new T.DodecahedronGeometry(1, 1));
  /** A flag in the side's colour on a pole. */
  const flag = (parent: T.Object3D, side: number, x: number, y: number, z: number, pole = 1.6) => {
    add(parent, g.cyl, kit.m.dark, x, y + pole / 2, z, 0.03, pole, 0.03);
    const cloth = add(parent, g.box, kit.m[`team${side}`], x - 0.32, y + pole - 0.22, z, 0.62, 0.38, 0.02);
    cloth.userData.flag = true;
    return cloth;
  };
  /**
   * The mast at a base's front corner where its turrets stand (in front of the building, nearer the eye, so that they
   * are seen): two posts and a ledge for each slot, of the era's stuff.
   */
  const mast = (parent: T.Object3D, era: number) => {
    const top = turretAt(0, SLOTS - 1).y + 0.3,
      mat = era === 0 ? kit.m.wood : era === 1 ? wall : era === 2 ? bricks : kit.m.dark,
      thick = era === 0 ? 0.08 : era === 3 ? 0.06 : 0.16;
    for (const x of [-0.15, 1.15]) for (const z of [MAST_Z - 0.32, MAST_Z + 0.32]) add(parent, era === 0 || era === 3 ? g.cyl : g.box, mat, x, top / 2, z, thick, top, thick);
    for (let s = 0; s < SLOTS; s++) {
      const at = turretAt(0, s);
      add(parent, g.box, era === 0 ? kit.m.woodDark : era === 3 ? concreteDark : mat, at.x + BASE_X, at.y - 0.12, MAST_Z, 0.75, 0.12, 0.85);
    }
    // Cross braces.
    for (let y = 0.7; y < top - 0.3; y += 1.15) for (const z of [MAST_Z - 0.32, MAST_Z + 0.32]) add(parent, g.box, era === 3 ? kit.m.dark : kit.m.woodDark, 0.5, y, z, 1.45, 0.04, 0.04).rotation.z = 0.65;
  };
  const built = new Map<string, T.Group>();
  function buildBase(side: number, era: number) {
    const group = new T.Group(),
      b = new T.Group();
    group.add(b);
    // Built at x = 0 facing +x (the lane), then put at its place and mirrored for side 1.
    if (era === 0) {
      add(b, dodeca, rock, -0.6, 1.1, -0.4, 2.1, 2.2, 1.7);
      add(b, dodeca, rock, 0.9, 0.6, -0.8, 1.2, 1.1, 1);
      add(b, g.ball, hole, 0.9, 0.55, 0.45, 0.55, 0.6, 0.25);
      for (let k = 0; k < 9; k++) {
        const z = -1.4 + k * 0.33,
          tall = 1.1 + rnd() * 0.5;
        add(b, g.cyl, kit.m.wood, 1.75, tall / 2, z, 0.08, tall, 0.08);
        add(b, g.cone, kit.m.wood, 1.75, tall + 0.1, z, 0.08, 0.22, 0.08);
      }
      add(b, g.box, kit.m.woodDark, 1.75, 0.7, -0.05, 0.05, 0.08, 2.9);
      // The camp fire: stones round it, logs, flames.
      for (let k = 0; k < 7; k++) add(b, g.ballLo, kit.m.stone, 1.2 + Math.cos((k / 7) * Math.PI * 2) * 0.28, 0.06, 1.1 + Math.sin((k / 7) * Math.PI * 2) * 0.28, 0.1, 0.08, 0.1);
      const flames = add(b, g.cone, flame, 1.2, 0.3, 1.1, 0.16, 0.5, 0.16);
      flames.castShadow = false;
      flames.userData.flicker = true;
      add(b, g.cone, fire, 1.2, 0.22, 1.1, 0.1, 0.32, 0.1).castShadow = false;
      add(b, g.ball, kit.m.hide, -0.3, 2.95, 0.2, 0.5, 0.35, 0.45);
      flag(b, side, -0.6, 3.1, 0, 1.4);
    } else if (era === 1) {
      add(b, g.box, wall, -0.4, 2.1, -0.3, 2.4, 4.2, 2.1);
      for (let k = 0; k < 5; k++) add(b, g.box, wall, -1.4 + k * 0.5, 4.35, 0.75, 0.3, 0.32, 0.3);
      add(b, g.box, wall, 1.2, 1.15, 0, 1, 2.3, 2.8);
      add(b, g.box, hole, 1.71, 0.75, 0, 0.02, 1.4, 0.95);
      add(b, g.cyl, hole, 1.71, 1.45, 0, 0.48, 0.02, 0.48).rotation.z = Math.PI / 2;
      for (const z of [-1.25, 1.25]) {
        add(b, g.cyl, wall, 1.3, 1.6, z, 0.5, 3.2, 0.5);
        add(b, g.cone, kit.m[`team${side}`], 1.3, 3.55, z, 0.62, 0.9, 0.62);
      }
      flag(b, side, -0.4, 4.2, -0.3, 1.4);
    } else if (era === 2) {
      add(b, g.box, bricks, -0.3, 1.5, -0.3, 3, 3, 2.4);
      const slope = add(b, g.box, bricks, 1.25, 0.9, 0, 1.1, 1.8, 3);
      slope.rotation.z = 0.22;
      add(b, g.box, wall, -0.3, 3.08, -0.3, 3.1, 0.18, 2.5);
      for (const z of [-0.8, 0, 0.8]) add(b, g.cyl, hole, 1.6, 1.2, z, 0.14, 0.05, 0.14).rotation.z = Math.PI / 2;
      add(b, g.box, kit.m.woodDark, -0.9, 3.6, 0.6, 1.2, 0.8, 0.9);
      add(b, g.cone4, kit.m[`team${side}`], -0.9, 4.25, 0.6, 0.95, 0.5, 0.75).rotation.y = Math.PI / 4;
      flag(b, side, 0.3, 3.15, -0.6, 1.8);
    } else {
      add(b, g.box, concrete, -0.4, 1.2, -0.3, 3.4, 2.4, 2.4);
      add(b, g.box, concreteDark, -0.4, 2.5, -0.3, 3.5, 0.2, 2.5);
      for (const z of [-0.7, 0.3]) add(b, g.box, hole, 1.31, 1.4, z, 0.02, 0.18, 0.7);
      add(b, g.box, hole, 1.31, 0.7, 0.85, 0.02, 1.2, 0.6);
      // Sandbags in rows before the door.
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 6; k++) add(b, g.ballLo, sand, 1.75 + (row % 2) * 0.05, 0.12 + row * 0.2, -1.3 + k * 0.48 + (row % 2) * 0.24, 0.26, 0.11, 0.2);
      // A radar dish turning on the roof, an aerial.
      const dish = new T.Group();
      dish.position.set(-1.3, 3.1, -0.6);
      dish.userData.spin = true;
      b.add(dish);
      add(dish, g.cyl, kit.m.dark, 0, -0.2, 0, 0.06, 0.6, 0.06);
      const plate = add(dish, g.cap, kit.m.steel, 0, 0.25, 0, 0.6, 0.18, 0.6);
      plate.rotation.z = Math.PI / 2.4;
      add(b, g.cyl, kit.m.dark, 0.6, 3.6, -1.1, 0.015, 2.2, 0.015);
      flag(b, side, 0.9, 2.6, 0.4, 1.6);
    }
    mast(b, era);
    group.position.x = side ? BASE_X : -BASE_X;
    if (side) group.scale.x = -1;
    group.visible = false;
    scene.add(group);
    return group;
  }
  function buildTurret(era: number) {
    const t = new T.Group(),
      barrel = new T.Group();
    t.add(barrel);
    t.userData.barrel = barrel;
    if (era === 0) {
      add(t, g.box, kit.m.wood, 0, 0.12, 0, 0.5, 0.16, 0.4);
      barrel.position.set(-0.1, 0.2, 0);
      add(barrel, g.cyl, kit.m.wood, 0.2, 0.25, 0, 0.035, 0.6, 0.035).rotation.z = -0.9;
      add(barrel, g.cap, kit.m.hide, 0.43, 0.42, 0, 0.1, 0.07, 0.1).rotation.x = Math.PI;
      add(barrel, g.ballLo, kit.m.stone, 0.43, 0.46, 0, 0.07, 0.07, 0.07);
    } else if (era === 1) {
      add(t, g.cyl, kit.m.woodDark, 0, 0.2, 0, 0.07, 0.4, 0.07);
      barrel.position.set(0, 0.42, 0);
      add(barrel, g.box, kit.m.wood, 0.05, 0, 0, 0.8, 0.08, 0.1);
      for (const z of [-0.3, 0.3]) add(barrel, g.cone, kit.m.wood, 0.25, 0, z, 0.03, 0.62, 0.03).rotation.x = z > 0 ? Math.PI / 2 : -Math.PI / 2;
      add(barrel, g.cyl, kit.m.rope, 0.25, 0, 0, 0.006, 1.2, 0.006).rotation.x = Math.PI / 2;
      add(barrel, g.cone, kit.m.iron, 0.5, 0.06, 0, 0.025, 0.16, 0.025).rotation.z = -Math.PI / 2;
    } else if (era === 2) {
      add(t, g.box, kit.m.woodDark, 0, 0.12, 0, 0.55, 0.2, 0.5);
      barrel.position.set(0, 0.32, 0);
      add(barrel, g.cyl, kit.m.black, 0.25, 0, 0, 0.1, 0.8, 0.1).rotation.z = -Math.PI / 2;
      add(barrel, g.ball, kit.m.black, -0.15, 0, 0, 0.13, 0.13, 0.13);
    } else {
      add(t, g.cyl, kit.m.dark, 0, 0.15, 0, 0.2, 0.3, 0.2);
      barrel.position.set(0, 0.38, 0);
      add(barrel, g.box, kit.m.olive, 0, 0, 0, 0.45, 0.24, 0.36);
      for (const z of [-0.08, 0.08]) add(barrel, g.cyl, kit.m.black, 0.45, 0.02, z, 0.03, 0.6, 0.03).rotation.z = -Math.PI / 2;
      add(barrel, g.box, kit.m.oliveDark, 0.2, 0.05, 0, 0.04, 0.34, 0.44);
    }
    return t;
  }
  return {
    base(side, era) {
      const key = `${side}:${era}`;
      let b = built.get(key);
      if (!b) built.set(key, (b = buildBase(side, era)));
      return b;
    },
    turret: buildTurret,
    clouds,
  };
}
