/**
 * 지하 감옥, 전술 대전's dungeon: a field of dark cut stone at night. Every tile is a stack of masonry courses (one
 * for level 0 and one more a level) under a flagstone, all instanced; fire pits are sunk below the floor and braziers
 * stand on their tiles, each with a flickering warm light (few lights in all, casting no shadow) and flames painted
 * in code; broken pillars stand on others. Stone-brick walls stand round all four sides and only the two away from
 * the eye are shown (`facing`), so that whichever way the field is turned they frame it and never hide a tile. Beyond
 * the walls the floor fades into darkness. Everything is painted and modelled here; nothing is fetched.
 */
import * as T from "three";
import { block } from "../../engine/scene-utils";
import { CELLS, W, type Field } from "./rules";
import { BASE, LEVEL, PIT, RIM, TILE, tileLocal } from "./layout";

type Own = <R extends { dispose(): void }>(r: R) => R;
/** A fixed sequence of numbers (never `crypto`: tests and captures see the same dungeon). */
function sequence(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}
/** Specks and pits of a stone's face over a rectangle. */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number, count: number) {
  for (let k = 0; k < count; k++) {
    const light = rand() < 0.45;
    ctx.fillStyle = light ? `rgba(200,196,186,${0.05 + rand() * 0.08})` : `rgba(10,10,14,${0.1 + rand() * 0.14})`;
    const s = 0.8 + rand() * 2.2;
    ctx.fillRect(x + rand() * w, y + rand() * h, s, s);
  }
}
/** A cut slab with a chiselled edge: lit along its top and left, shaded along its bottom and right. */
function slab(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rand: () => number) {
  const g = 66 + Math.floor(rand() * 18),
    warm = Math.floor(rand() * 5);
  ctx.fillStyle = `rgb(${g + warm},${g},${g - 2 + Math.floor(rand() * 5)})`;
  ctx.fillRect(x, y, w, h);
  grain(ctx, x, y, w, h, rand, Math.floor((w * h) / 26));
  ctx.fillStyle = "rgba(210,205,195,0.13)";
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fillRect(x, y + h - 2, w, 2);
  ctx.fillRect(x + w - 2, y, 2, h);
  // Now and then a crack.
  if (rand() < 0.4) {
    ctx.strokeStyle = "rgba(12,12,14,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let px = x + w * (0.2 + rand() * 0.6),
      py = y + 3;
    ctx.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px += (rand() - 0.5) * w * 0.3;
      py += h * (0.15 + rand() * 0.15);
      ctx.lineTo(px, Math.min(y + h - 3, py));
    }
    ctx.stroke();
  }
}
/** The flagstone on a tile: one slab, two, or four, with dark joints between. */
function flagstone(kind: number, rand: () => number) {
  const n = 128,
    [c, ctx] = canvas(n, n),
    j = 3;
  ctx.fillStyle = "#17171a";
  ctx.fillRect(0, 0, n, n);
  const h = n / 2;
  if (kind === 0) slab(ctx, j, j, n - 2 * j, n - 2 * j, rand);
  else if (kind === 1) {
    const cut = Math.floor(n * (0.42 + rand() * 0.16));
    slab(ctx, j, j, n - 2 * j, cut - j - 1, rand);
    slab(ctx, j, cut + 1, n - 2 * j, n - cut - j - 1, rand);
  } else
    for (const [x, y] of [
      [0, 0],
      [h, 0],
      [0, h],
      [h, h],
    ])
      slab(ctx, x + j - (x ? 1 : 0), y + j - (y ? 1 : 0), h - 2 * j + 1, h - 2 * j + 1, rand);
  return c;
}
/** A course's side: two dressed stones (or one and two halves), with mortar along its top and bottom. */
function courseSide(offset: boolean, rand: () => number) {
  const w = 256,
    h = 72,
    [c, ctx] = canvas(w, h);
  ctx.fillStyle = "#141417";
  ctx.fillRect(0, 0, w, h);
  const joints = offset ? [0, w * 0.25, w * 0.75, w] : [0, w * 0.5, w];
  for (let k = 0; k + 1 < joints.length; k++) {
    const x = joints[k] + (k ? 2 : 0),
      span = joints[k + 1] - joints[k] - (k ? 2 : 0) - (k + 2 < joints.length ? 2 : 0);
    const g = 52 + Math.floor(rand() * 16);
    ctx.fillStyle = `rgb(${g + 3},${g},${g - 1})`;
    ctx.fillRect(x, 4, span, h - 8);
    grain(ctx, x, 4, span, h - 8, rand, 120);
    ctx.fillStyle = "rgba(200,195,185,0.1)";
    ctx.fillRect(x, 4, span, 3);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(x, h - 8, span, 4);
  }
  return c;
}
/** A brick's face, speckled. */
function brickFace(rand: () => number) {
  const [c, ctx] = canvas(64, 32);
  ctx.fillStyle = "#6a6864";
  ctx.fillRect(0, 0, 64, 32);
  grain(ctx, 0, 0, 64, 32, rand, 140);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 0, 64, 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 29, 64, 3);
  return c;
}
/** A flame: a tongue of light, white-yellow at its root, orange, then red and gone at its tip. */
function flameImage() {
  const [c, ctx] = canvas(64, 128);
  const g = ctx.createRadialGradient(32, 104, 2, 32, 92, 70);
  g.addColorStop(0, "rgba(255,250,215,1)");
  g.addColorStop(0.22, "rgba(255,206,92,0.95)");
  g.addColorStop(0.5, "rgba(255,120,30,0.7)");
  g.addColorStop(0.8, "rgba(190,40,10,0.25)");
  g.addColorStop(1, "rgba(120,20,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 2);
  ctx.bezierCurveTo(40, 34, 60, 60, 58, 92);
  ctx.bezierCurveTo(56, 116, 42, 126, 32, 126);
  ctx.bezierCurveTo(22, 126, 8, 116, 6, 92);
  ctx.bezierCurveTo(4, 60, 24, 34, 32, 2);
  ctx.fill();
  return c;
}
/** A soft round glow. */
function glowImage(inner: string, outer: string) {
  const [c, ctx] = canvas(128, 128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}
interface Fire {
  flames: { sprite: T.Sprite; w: number; h: number; dx: number; dz: number; phase: number }[];
  embers: { sprite: T.Sprite; phase: number; dx: number; dz: number }[];
  glow: T.Sprite;
  base: T.Vector3;
  light: T.PointLight | null;
  strength: number;
  seed: number;
}
export interface Dungeon {
  /** Every tile as a plain box for the pointer (not drawn): `userData.cells` names each instance's tile. */
  pick: T.InstancedMesh;
  /** Shows the walls (and their torches) that stand on the sides away from the eye, for the field turned by `yaw`. */
  facing(yaw: number): void;
  /** One frame of the fires at `now` (milliseconds); `still` lays them at rest. */
  flicker(now: number, still: boolean): void;
}
/** How tall the walls stand above the floor, and how thick they are. */
const WALL_H = 1.55,
  WALL_T = 0.34;
export function buildDungeon(root: T.Group, field: Field, own: Own, standard: (o: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial): Dungeon {
  const rand = sequence(9157),
    texture = (c: HTMLCanvasElement, repeat = 1) => {
      const t = own(new T.CanvasTexture(c));
      t.colorSpace = T.SRGBColorSpace;
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 4;
      return t;
    };
  const tops = [0, 1, 2].map((k) => standard({ map: texture(flagstone(k, sequence(31 + k * 101))), roughness: 0.9 })),
    sides = [false, true].map((offset, k) => standard({ map: texture(courseSide(offset, sequence(77 + k * 53))), roughness: 0.95 })),
    colour = new T.Color(),
    shade = () => {
      const v = 0.8 + rand() * 0.24;
      return colour.setRGB(v * (0.99 + rand() * 0.03), v, v * (0.96 + rand() * 0.05));
    },
    matrix = new T.Matrix4();
  // The courses of every column, sorted by their kind (the first course is taller) and by where their joints fall.
  const courses = new Map<string, { y: number; x: number; z: number }[]>(),
    caps = new Map<number, { y: number; x: number; z: number }[]>(),
    push = <K>(map: Map<K, { y: number; x: number; z: number }[]>, key: K, at: { y: number; x: number; z: number }) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(at);
    },
    pickHeight: number[] = [];
  const SINK = 0.03,
    CAP = 0.036;
  for (let c = 0; c < CELLS; c++) {
    const g = field.ground[c],
      at = tileLocal(c);
    if (g === "pit") {
      pickHeight.push(PIT);
      continue;
    }
    const h = field.height[c],
      top = BASE + LEVEL * h,
      col = c % W,
      row = Math.floor(c / W);
    push(courses, `base:${(row + col) % 2}`, { x: at.x, y: BASE / 2 - SINK, z: at.z });
    for (let k = 1; k <= h; k++) push(courses, `level:${(row + col + k) % 2}`, { x: at.x, y: BASE + LEVEL * (k - 0.5) - SINK, z: at.z });
    push(caps, Math.floor(rand() * 3), { x: at.x, y: top - CAP / 2, z: at.z });
    pickHeight.push(g === "brazier" ? top + 0.5 : g === "pillar" ? top + 1 : top);
  }
  const instanced = (geometry: T.BufferGeometry, material: T.Material | T.Material[], places: { x: number; y: number; z: number }[], turn = false) => {
    const mesh = new T.InstancedMesh(geometry, material, places.length);
    places.forEach((p, i) => {
      matrix.makeRotationY(turn ? Math.floor(rand() * 4) * (Math.PI / 2) : 0).setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, shade());
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const baseCourse = own(block(0.985 * TILE, BASE, 0.985 * TILE, 0.03, 1)),
    levelCourse = own(block(0.985 * TILE, LEVEL, 0.985 * TILE, 0.03, 1)),
    capSlab = own(block(0.965 * TILE, CAP, 0.965 * TILE, 0.012, 1));
  for (const [key, places] of courses) {
    const [kind, joint] = key.split(":"),
      side = sides[Number(joint)];
    // +x, −x, top, bottom, +z, −z: the top of a course is under its flagstone and never seen.
    instanced(kind === "base" ? baseCourse : levelCourse, [side, side, side, side, side, side], places).castShadow = false;
  }
  for (const [kind, places] of caps) instanced(capSlab, tops[kind], places, true);
  // Fire pits: a sunk floor of soot with a bed of glowing coals.
  const soot = standard({ color: "#1a1412", roughness: 1 }),
    coal = own(new T.DodecahedronGeometry(0.07, 0)),
    ember = own(new T.MeshStandardMaterial({ color: "#2a120a", emissive: "#ff5a1a", emissiveIntensity: 0.9, roughness: 0.8 })),
    ash = standard({ color: "#2b2826", roughness: 1, flatShading: true }),
    pitFloor = own(block(0.985 * TILE, PIT + SINK, 0.985 * TILE, 0.02, 1)),
    coals: { x: number; y: number; z: number }[] = [],
    ashes: { x: number; y: number; z: number }[] = [];
  const fires: { at: T.Vector3; light: number; size: number }[] = [];
  for (let c = 0; c < CELLS; c++) {
    if (field.ground[c] !== "pit") continue;
    const at = tileLocal(c),
      floor = new T.Mesh(pitFloor, soot);
    floor.position.set(at.x, (PIT - SINK) / 2, at.z);
    floor.receiveShadow = true;
    root.add(floor);
    for (let k = 0; k < 16; k++) {
      const r = Math.sqrt(rand()) * 0.36,
        a = rand() * Math.PI * 2,
        p = { x: at.x + Math.cos(a) * r, y: PIT + 0.02, z: at.z + Math.sin(a) * r };
      (k % 3 ? coals : ashes).push(p);
    }
    fires.push({ at: new T.Vector3(at.x, PIT + 0.04, at.z), light: 0, size: 1.15 });
  }
  const scatter = (material: T.Material, places: { x: number; y: number; z: number }[]) => {
    const mesh = new T.InstancedMesh(coal, material, places.length);
    places.forEach((p, i) => {
      matrix.makeRotationFromEuler(new T.Euler(rand() * 3, rand() * 3, rand() * 3));
      matrix.scale(new T.Vector3(1, 0.6, 1).multiplyScalar(0.7 + rand() * 0.6));
      matrix.setPosition(p.x, p.y, p.z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  };
  if (coals.length) {
    scatter(ember, coals);
    scatter(ash, ashes);
  }
  // Braziers: an iron bowl on a stem and foot, full of coals.
  const iron = standard({ color: "#2c2a28", roughness: 0.55, metalness: 0.7 }),
    bowl = own(
      new T.LatheGeometry(
        [
          [0.12, 0],
          [0.13, 0.03],
          [0.05, 0.06],
          [0.045, 0.24],
          [0.09, 0.27],
          [0.2, 0.31],
          [0.27, 0.4],
          [0.29, 0.43],
          [0.26, 0.43],
          [0.23, 0.38],
        ].map(([r, y]) => new T.Vector2(r, y)),
        16,
      ),
    ),
    bed = own(new T.CircleGeometry(0.235, 16).rotateX(-Math.PI / 2)),
    glowingBed = own(new T.MeshStandardMaterial({ color: "#3a160a", emissive: "#ff6a1e", emissiveIntensity: 1.1, roughness: 0.9 }));
  iron.side = T.DoubleSide;
  // Broken pillars: drums of stone, the top one snapped off on a slant.
  const drum = own(new T.CylinderGeometry(0.27, 0.29, 0.3, 8)),
    snapped = own(
      (() => {
        const g = new T.CylinderGeometry(0.26, 0.27, 0.3, 8, 1);
        const p = g.getAttribute("position");
        for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) + p.getX(i) * 0.35 - 0.04);
        g.computeVertexNormals();
        return g;
      })(),
    ),
    plinth = own(block(0.7, 0.1, 0.7, 0.03, 1)),
    pillarStone = sides[0];
  for (let c = 0; c < CELLS; c++) {
    const g = field.ground[c],
      at = tileLocal(c),
      top = BASE + LEVEL * field.height[c];
    if (g === "brazier") {
      const m = new T.Mesh(bowl, iron);
      m.position.set(at.x, top, at.z);
      m.castShadow = true;
      const coals = new T.Mesh(bed, glowingBed);
      coals.position.set(at.x, top + 0.39, at.z);
      root.add(m, coals);
      fires.push({ at: new T.Vector3(at.x, top + 0.4, at.z), light: 1, size: 0.85 });
    }
    if (g === "pillar") {
      const base = new T.Mesh(plinth, pillarStone);
      base.position.set(at.x, top + 0.05, at.z);
      const a = new T.Mesh(drum, pillarStone),
        b = new T.Mesh(drum, pillarStone),
        top3 = new T.Mesh(snapped, pillarStone);
      a.position.set(at.x, top + 0.25, at.z);
      b.position.set(at.x, top + 0.555, at.z);
      top3.position.set(at.x, top + 0.86, at.z);
      top3.rotation.y = rand() * Math.PI * 2;
      a.rotation.y = rand() * 0.6;
      b.rotation.y = rand() * 0.6;
      for (const m of [base, a, b, top3]) {
        m.castShadow = m.receiveShadow = true;
        root.add(m);
      }
    }
  }
  // The floor beyond the field: flagstones that fade into the dark.
  const outer = own(new T.RingGeometry(0, 22, 48, 10).rotateX(-Math.PI / 2)),
    pos = outer.getAttribute("position"),
    shades: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i)),
      v = r < 6.5 ? 1 : Math.max(0, 1 - (r - 6.5) / 6);
    shades.push(v * v, v * v, v * v);
  }
  outer.setAttribute("color", new T.Float32BufferAttribute(shades, 3));
  // Lambert's light is cheaper over the whole screen than the standard paint, and the dark hides the difference.
  const ground = new T.Mesh(outer, own(new T.MeshLambertMaterial({ map: texture(flagstone(2, sequence(5)), 22), color: "#8a8a8a", vertexColors: true })));
  ground.receiveShadow = true;
  root.add(ground);
  // The walls, one a side, with a post at each corner: rows of bricks in a running bond over a dark core.
  const reach = (W * TILE) / 2 + RIM + WALL_T / 2,
    brickW = 0.54,
    brickH = 0.24,
    brick = own(block(brickW - 0.025, brickH - 0.025, WALL_T, 0.025, 1)),
    brickPaint = standard({ map: texture(brickFace(sequence(404))), roughness: 0.95 }),
    core = standard({ color: "#0d0d10", roughness: 1 }),
    coreBox = own(new T.BoxGeometry(2 * reach, WALL_H - 0.02, WALL_T * 0.7)),
    walls: { group: T.Group; out: T.Vector3 }[] = [],
    rows = Math.round(WALL_H / brickH);
  const torches: { wall: number; along: number }[] = [
    { wall: 0, along: -2.6 },
    { wall: 0, along: 2.6 },
    { wall: 1, along: -2.6 },
    { wall: 1, along: 2.6 },
    { wall: 2, along: -2.6 },
    { wall: 2, along: 2.6 },
    { wall: 3, along: -2.6 },
    { wall: 3, along: 2.6 },
  ];
  const bracket = own(block(0.08, 0.26, 0.16, 0.02, 1)),
    cup = own(new T.CylinderGeometry(0.09, 0.05, 0.1, 10));
  for (let k = 0; k < 4; k++) {
    // Wall 0 stands beyond the far row (−z), then round the field: +x, +z, −x.
    const out = new T.Vector3([0, 1, 0, -1][k], 0, [-1, 0, 1, 0][k]),
      group = new T.Group();
    group.position.copy(out.clone().multiplyScalar(reach));
    group.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][k];
    const places: { x: number; y: number; w: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const shift = r % 2 ? brickW / 2 : 0;
      for (let x = -reach + WALL_T / 2 - shift; x < reach - WALL_T / 2; x += brickW) {
        const a = Math.max(x, -reach + WALL_T / 2),
          b = Math.min(x + brickW, reach - WALL_T / 2);
        if (b - a < 0.12) continue;
        places.push({ x: (a + b) / 2, y: brickH * (r + 0.5), w: (b - a) / brickW });
      }
    }
    const bricks = new T.InstancedMesh(brick, brickPaint, places.length);
    places.forEach((p, i) => {
      matrix.makeScale(p.w, 1, 1).setPosition(p.x, p.y, (rand() - 0.5) * 0.02);
      bricks.setMatrixAt(i, matrix);
      const v = 0.55 + rand() * 0.35;
      bricks.setColorAt(i, colour.setRGB(v * 0.94, v * 0.96, v));
    });
    bricks.instanceMatrix.needsUpdate = true;
    if (bricks.instanceColor) bricks.instanceColor.needsUpdate = true;
    bricks.receiveShadow = true;
    const back = new T.Mesh(coreBox, core);
    back.position.y = WALL_H / 2;
    group.add(bricks, back);
    // A coping of long stones along the top.
    const coping = new T.Mesh(own(block(2 * reach, 0.1, WALL_T + 0.08, 0.03, 1)), sides[1]);
    coping.position.y = WALL_H + 0.04;
    group.add(coping);
    root.add(group);
    walls.push({ group, out });
  }
  // Corner posts, shown with either wall they join.
  const post = own(block(WALL_T + 0.12, WALL_H + 0.24, WALL_T + 0.12, 0.04, 1)),
    posts: { mesh: T.Mesh; walls: [number, number] }[] = [];
  for (const [sx, sz, a, b] of [
    [1, -1, 0, 1],
    [1, 1, 1, 2],
    [-1, 1, 2, 3],
    [-1, -1, 3, 0],
  ] as const) {
    const mesh = new T.Mesh(post, sides[0]);
    mesh.position.set(sx * reach, (WALL_H + 0.24) / 2, sz * reach);
    mesh.receiveShadow = true;
    root.add(mesh);
    posts.push({ mesh, walls: [a, b] });
  }
  // Flames, glows and embers: sprites whose look is painted once.
  const flameMap = texture(flameImage()),
    glowMap = texture(glowImage("rgba(255,170,80,0.9)", "rgba(255,110,30,0.35)")),
    emberMap = texture(glowImage("rgba(255,240,190,1)", "rgba(255,140,40,0.6)")),
    flameMaterial = own(new T.SpriteMaterial({ map: flameMap, blending: T.AdditiveBlending, depthWrite: false, transparent: true })),
    glowMaterial = own(new T.SpriteMaterial({ map: glowMap, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })),
    emberMaterial = own(new T.SpriteMaterial({ map: emberMap, blending: T.AdditiveBlending, depthWrite: false, transparent: true })),
    // The warm patch of floor round a fire.
    pool = own(new T.CircleGeometry(1, 24).rotateX(-Math.PI / 2)),
    poolMaterial = own(new T.MeshBasicMaterial({ map: texture(glowImage("rgba(255,140,60,0.55)", "rgba(255,90,20,0.18)")), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
  const lit: Fire[] = [];
  const kindle = (at: T.Vector3, size: number, light: number, parent: T.Object3D, embers = 4) => {
    const fire: Fire = { flames: [], embers: [], glow: new T.Sprite(glowMaterial), base: at.clone(), light: null, strength: light, seed: rand() * 100 };
    const tongues = size > 1 ? 5 : 3;
    for (let k = 0; k < tongues; k++) {
      const sprite = new T.Sprite(flameMaterial),
        w = (0.26 + rand() * 0.14) * size,
        h = (0.5 + rand() * 0.3) * size * (k === 0 ? 1.15 : 1),
        a = (k / tongues) * Math.PI * 2,
        r = k === 0 ? 0 : 0.1 * size;
      sprite.center.set(0.5, 0.02);
      sprite.renderOrder = 7;
      parent.add(sprite);
      fire.flames.push({ sprite, w, h, dx: Math.cos(a) * r, dz: Math.sin(a) * r, phase: rand() * 10 });
    }
    for (let k = 0; k < embers; k++) {
      const sprite = new T.Sprite(emberMaterial);
      sprite.scale.setScalar(0.05);
      sprite.renderOrder = 8;
      parent.add(sprite);
      fire.embers.push({ sprite, phase: rand(), dx: (rand() - 0.5) * 0.3 * size, dz: (rand() - 0.5) * 0.3 * size });
    }
    fire.glow.scale.setScalar(1.5 * size);
    fire.glow.position.copy(at).setY(at.y + 0.3 * size);
    fire.glow.renderOrder = 6;
    parent.add(fire.glow);
    if (light > 0) {
      fire.light = new T.PointLight("#ff8c3c", light, 0, 1.7);
      fire.light.position.copy(at).setY(at.y + 0.55);
      parent.add(fire.light);
    }
    lit.push(fire);
    return fire;
  };
  // The pits share one light between them; each brazier has its own.
  const pits = fires.filter((f) => f.light === 0);
  if (pits.length) {
    const middle = pits.reduce((m, f) => m.add(f.at), new T.Vector3()).multiplyScalar(1 / pits.length),
      light = new T.PointLight("#ff8a38", 11, 0, 1.7);
    light.position.copy(middle).setY(1.25);
    root.add(light);
    lit.push({ flames: [], embers: [], glow: new T.Sprite(glowMaterial), base: middle, light, strength: 11, seed: 3.1 });
  }
  for (const f of fires) {
    kindle(f.at, f.size, f.light ? 7 : 0, root);
    // A warm glow over the coals of a pit, kept inside it.
    if (f.light) continue;
    const patch = new T.Mesh(pool, poolMaterial);
    patch.scale.setScalar(0.48);
    patch.position.copy(f.at).setY(PIT + 0.012);
    patch.renderOrder = 3;
    root.add(patch);
  }
  // Torches on the walls: a bracket, a cup and a small flame each, without a light of their own.
  for (const t of torches) {
    const wall = walls[t.wall].group,
      holder = new T.Mesh(bracket, iron),
      bowlCup = new T.Mesh(cup, iron);
    holder.position.set(t.along, 1.0, WALL_T / 2 + 0.06);
    bowlCup.position.set(t.along, 1.16, WALL_T / 2 + 0.13);
    wall.add(holder, bowlCup);
    kindle(new T.Vector3(t.along, 1.2, WALL_T / 2 + 0.13), 0.55, 0, wall, 2);
  }
  // Pick boxes: plain columns, one a tile, never drawn.
  const box = own(new T.BoxGeometry(TILE, 1, TILE)),
    pick = new T.InstancedMesh(box, own(new T.MeshBasicMaterial({ visible: false })), CELLS);
  for (let c = 0; c < CELLS; c++) {
    const at = tileLocal(c),
      h = pickHeight[c];
    matrix.makeScale(1, h, 1).setPosition(at.x, h / 2, at.z);
    pick.setMatrixAt(c, matrix);
  }
  pick.instanceMatrix.needsUpdate = true;
  pick.userData.cells = Array.from({ length: CELLS }, (_, c) => c);
  pick.computeBoundingSphere();
  root.add(pick);
  const wave = (t: number, seed: number) => 0.5 * Math.sin(t * 7.3 + seed) + 0.3 * Math.sin(t * 13.1 + seed * 2.3) + 0.2 * Math.sin(t * 23.7 + seed * 0.7);
  return {
    pick,
    facing(yaw) {
      const shown = walls.map(({ out }) => {
        // The wall's outward side in the scene: away from the eye (which looks along −z) means toward −z.
        const z = -out.x * Math.sin(yaw) + out.z * Math.cos(yaw);
        return z < -0.05;
      });
      walls.forEach((w, k) => (w.group.visible = shown[k]));
      for (const p of posts) p.mesh.visible = shown[p.walls[0]] || shown[p.walls[1]];
    },
    flicker(now, still) {
      const t = now / 1000;
      for (const fire of lit) {
        const n = still ? 0 : wave(t, fire.seed);
        if (fire.light) fire.light.intensity = fire.strength * (0.86 + 0.12 * n);
        for (const f of fire.flames) {
          const m = still ? 0 : wave(t * 1.3, f.phase),
            sway = still ? 0 : Math.sin(t * 3.1 + f.phase) * 0.03;
          f.sprite.scale.set(f.w * (1 + 0.08 * m), f.h * (0.92 + 0.18 * m), 1);
          f.sprite.position.set(fire.base.x + f.dx + sway, fire.base.y, fire.base.z + f.dz + sway * 0.5);
        }
        for (const e of fire.embers) {
          e.sprite.visible = !still;
          if (still) continue;
          const p = (t * 0.45 + e.phase) % 1;
          e.sprite.position.set(fire.base.x + e.dx + Math.sin(t * 2 + e.phase * 9) * 0.06, fire.base.y + 0.1 + p * 1.1, fire.base.z + e.dz);
          e.sprite.scale.setScalar(0.05 * (1 - p) + 0.015);
        }
      }
    },
  };
}
