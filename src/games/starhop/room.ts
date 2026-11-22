import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Grove } from "../../engine/foliage";
import { capable, glossy, stuff, wood } from "../../engine/scene-utils";
import { HOLES, HOME } from "./rules";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** Where the holes are drawn: one step of the slanted grid on the table. */
export const STEP = 0.62;
/** Centre of a hole on the table. */
export const holeAt = (i: number) => ({ x: (HOLES[i].q + HOLES[i].r / 2) * STEP, z: HOLES[i].r * STEP * 0.866 });
/** The board's radius, and the white table's. */
export const BOARD_R = 5.6,
  TABLE_R = 9.4;
/** The colours of the star's six points: the two homes in the sides' colours, the four others muted. */
const POINTS = ["#c8432c", "#5d8f5a", "#d9a63a", "#2d5fb8", "#8a5fa8", "#3f9a9a"];
/**
 * The face of the board: black lacquer with a gold border, a star inlaid in cream with its six points coloured, the
 * lines of the grid in gold and every hole turned into the wood. `height` paints the relief instead (dark is low).
 */
export function boardFace(size: number, height = false) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    k = size / 1024,
    px = (v: number) => size / 2 + (v / BOARD_R) * (size / 2);
  ctx.fillStyle = height ? "#808080" : "#1d0f0b";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  if (!height) {
    // A lacquer's depth: lighter toward the light.
    const sheen = ctx.createRadialGradient(size * 0.35, size * 0.3, size * 0.05, size / 2, size / 2, size / 2);
    sheen.addColorStop(0, "rgba(120,40,28,0.45)");
    sheen.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sheen;
    ctx.fill();
    // Gold rings near the edge, with a running fret between them.
    ctx.strokeStyle = "#c9a24a";
    for (const [r, w] of [
      [5.42, 3],
      [5.0, 2],
    ]) {
      ctx.lineWidth = w * k;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, ((r / BOARD_R) * size) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = 1.6 * k;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 48) {
      const r1 = ((5.08 / BOARD_R) * size) / 2,
        r2 = ((5.34 / BOARD_R) * size) / 2,
        b = a + Math.PI / 96;
      ctx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(a) * r1, size / 2 + Math.sin(a) * r1);
      ctx.lineTo(size / 2 + Math.cos(a) * r2, size / 2 + Math.sin(a) * r2);
      ctx.lineTo(size / 2 + Math.cos(b) * r2, size / 2 + Math.sin(b) * r2);
      ctx.lineTo(size / 2 + Math.cos(b) * ((r1 + r2) / 2), size / 2 + Math.sin(b) * ((r1 + r2) / 2));
      ctx.stroke();
    }
  }
  // The star: two great triangles laid over each other (a margin round the holes), the six points coloured, each
  // edged in gold; the two homes wear their sides' colours.
  const corner = (q: number, r: number) => [px((q + r / 2) * STEP), px(r * STEP * 0.866)] as [number, number];
  const f = 1.17,
    A = [
      [4, 4],
      [4, -8],
      [-8, 4],
    ].map(([q, r]) => [q * f, r * f]),
    B = [
      [-4, -4],
      [-4, 8],
      [8, -4],
    ].map(([q, r]) => [q * f, r * f]);
  for (const tri of [A, B]) {
    ctx.beginPath();
    for (const [q, r] of tri) ctx.lineTo(...corner(q, r));
    ctx.closePath();
    ctx.fillStyle = height ? "#808080" : "#efe2c2";
    ctx.fill();
  }
  // Each point: its tip, and where the great triangle's two edges from it cross the line it shares with the hexagon.
  const points: [number[][], number, (q: number, r: number) => number, string][] = [
    [B, 1, (q, r) => r, POINTS[0]],
    [A, 1, (q, r) => -r, POINTS[3]],
    [B, 2, (q) => q, POINTS[1]],
    [A, 2, (q) => -q, POINTS[4]],
    [B, 0, (q, r) => -(q + r), POINTS[2]],
    [A, 0, (q, r) => q + r, POINTS[5]],
  ];
  if (!height)
    points.forEach(([tri, tip, c, colour], i) => {
      const T0 = tri[tip],
        cross = tri
          .filter((_, k) => k !== tip)
          .map((V) => {
            const t = (c(T0[0], T0[1]) - 4.5) / (c(T0[0], T0[1]) - c(V[0], V[1]));
            return [T0[0] + t * (V[0] - T0[0]), T0[1] + t * (V[1] - T0[1])];
          });
      ctx.beginPath();
      for (const [q, r] of [T0, ...cross]) ctx.lineTo(...corner(q, r));
      ctx.closePath();
      const [tx, ty] = corner(T0[0], T0[1]),
        g = ctx.createLinearGradient(tx, ty, size / 2, size / 2);
      g.addColorStop(0, colour);
      g.addColorStop(0.85, new T.Color(colour).lerp(new T.Color("#efe2c2"), 0.45).getStyle());
      ctx.fillStyle = g;
      ctx.globalAlpha = i < 2 ? 0.85 : 0.6;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#c9a24a";
      ctx.lineWidth = 3 * k;
      ctx.stroke();
    });
  if (!height) {
    // The lines of the grid, faint gold, joining each hole to its neighbours.
    ctx.strokeStyle = "rgba(170,128,48,0.55)";
    ctx.lineWidth = 2 * k;
    const at = new Map(HOLES.map((h, i) => [`${h.q},${h.r}`, i]));
    HOLES.forEach((h, i) => {
      for (const [dq, dr] of [
        [1, 0],
        [0, 1],
        [-1, 1],
      ]) {
        const j = at.get(`${h.q + dq},${h.r + dr}`);
        if (j === undefined) continue;
        const a = holeAt(i),
          b = holeAt(j);
        ctx.beginPath();
        ctx.moveTo(px(a.x), px(a.z));
        ctx.lineTo(px(b.x), px(b.z));
        ctx.stroke();
      }
    });
  }
  // The turned holes: a bevelled ring cut round a dark cup.
  const home = new Set([...HOME[0], ...HOME[1]]);
  HOLES.forEach((_, i) => {
    const p = holeAt(i),
      x = px(p.x),
      y = px(p.z),
      R = 21 * k;
    if (height) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.25);
      g.addColorStop(0, "#000000");
      g.addColorStop(0.62, "#1a1a1a");
      g.addColorStop(0.8, "#a8a8a8");
      g.addColorStop(1, "#808080");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R * 1.25, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // The bevel catches the light on the far side and is in shade on the near one.
    const ring = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
    ring.addColorStop(0, home.has(i) ? "#f1d9a0" : "#e9cf92");
    ring.addColorStop(1, "#7a5626");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(x, y, R * 1.2, 0, Math.PI * 2);
    ctx.fill();
    const cup = ctx.createRadialGradient(x + R * 0.25, y + R * 0.3, R * 0.1, x, y, R);
    cup.addColorStop(0, "#8a6234");
    cup.addColorStop(0.7, "#4a2c14");
    cup.addColorStop(1, "#2a160a");
    ctx.fillStyle = cup;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.92, 0, Math.PI * 2);
    ctx.fill();
  });
  return c;
}
/** A glass marble's swirl, in `colour`: a cat's-eye vane twisted through clear glass. */
export function swirl(colour: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!,
    base = new T.Color(colour),
    light = base.clone().lerp(new T.Color("#ffffff"), 0.45).getStyle(),
    deep = base.clone().multiplyScalar(0.55).getStyle();
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, deep);
  g.addColorStop(0.5, base.getStyle());
  g.addColorStop(1, deep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  const ribbon = (phase: number, width: number, colourOf: string, wave: number) => {
    ctx.strokeStyle = colourOf;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = -10; x <= 266; x += 4) ctx.lineTo(x, 64 + Math.sin((x / 256) * Math.PI * 2 * 2 + phase) * wave);
    ctx.stroke();
  };
  ribbon(0, 14, light, 30);
  ribbon(Math.PI, 5, "rgba(255,255,255,0.7)", 26);
  ribbon(Math.PI / 2, 4, "rgba(255,240,200,0.8)", 36);
  ribbon(Math.PI * 1.5, 8, deep, 20);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.RepeatWrapping;
  t.anisotropy = capable() ? 4 : 1;
  return t;
}
/**
 * The room round the white table: the round table itself with a moulded edge, a pale wooden floor below it, and on the
 * table a lidded box for the marbles, a cup of tea on its saucer and a little vase of flowers. All in code.
 */
export function room(scene: T.Scene, own: Own, rich: boolean) {
  const standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, cast = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const top = -0.3;
  // The white table: a round top with a rounded, moulded edge, white lacquer.
  const white = own(glossy({ color: "#f6f5f1", roughness: 0.35 }, 0.6));
  // (It begins under the board's rim: what the board covers is never drawn twice.)
  const edge = [
    [BOARD_R - 0.4, top],
    [TABLE_R - 0.12, top],
    [TABLE_R, top - 0.06],
    [TABLE_R + 0.02, top - 0.16],
    [TABLE_R - 0.06, top - 0.28],
    [TABLE_R - 0.4, top - 0.34],
  ]
    .reverse()
    .map(([r, y]) => new T.Vector2(r, y));
  add(new T.LatheGeometry(edge, 96), white, 0, 0, 0, false).receiveShadow = true;
  // The floor far below, pale boards, and a round rug under the table.
  // (Only round the table: under software drawing a floor beneath it was painted all the same and cost a third of a frame.)
  add(new T.RingGeometry(TABLE_R - 0.5, 45, 96, 1), standard({ ...stuff("boards", "#c9b393", 9, own), roughness: 0.7 }), 0, -6.2, 0, false).rotation.x = -Math.PI / 2;
  if (rich) add(new T.RingGeometry(TABLE_R - 0.5, 13, 96, 1), standard({ color: "#c2b8a8", roughness: 1 }), 0, -6.18, 0, false).rotation.x = -Math.PI / 2;
  // A lidded box of wood for the marbles, its lid propped against it.
  const box = standard({ map: own(wood()), color: "#c48a58", roughness: 0.5 });
  const lining = standard({ color: "#2f3c6b", roughness: 1 });
  const bx = 7.1,
    bz = -3.6;
  const shell = new T.Group();
  shell.position.set(bx, top, bz);
  shell.rotation.y = -0.5;
  scene.add(shell);
  // The box's walls and floor, its lid and its lining, each one mesh.
  const walls = [new T.BoxGeometry(1.8, 0.06, 1.2).translate(0, 0.03, 0)];
  for (const s of [-1, 1]) {
    walls.push(new T.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.2, s * 0.57));
    walls.push(new T.BoxGeometry(0.06, 0.4, 1.08).translate(s * 0.87, 0.2, 0));
  }
  walls.push(new T.BoxGeometry(1.8, 0.08, 1.2).rotateX(-1.2).translate(0, 0.62, -0.95));
  const wallMesh = new T.Mesh(own(mergeGeometries(walls)!), box);
  walls.forEach((g) => g.dispose());
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  const liningMesh = new T.Mesh(own(new T.BoxGeometry(1.68, 0.02, 1.08).translate(0, 0.07, 0)), lining);
  liningMesh.receiveShadow = true;
  shell.add(wallMesh, liningMesh);
  // A few spare marbles in the box, one instanced mesh.
  const spare = new T.InstancedMesh(own(new T.SphereGeometry(0.17, 16, 12)), own(glossy({ color: "#ffffff", roughness: 0.1 })), 5);
  ["#c8432c", "#2d5fb8", "#d9a63a", "#5d8f5a", "#8a5fa8"].forEach((color, i) => {
    spare.setMatrixAt(i, new T.Matrix4().makeTranslation(-0.55 + i * 0.27, 0.25, (i % 2) * 0.22 - 0.1));
    spare.setColorAt(i, new T.Color(color));
  });
  spare.castShadow = true;
  shell.add(spare);
  // A cup of tea on its saucer.
  const china = own(glossy({ color: "#fbfaf6", roughness: 0.25, side: T.DoubleSide }));
  const cx = -7.0,
    cz = 2.9;
  const ware = [
    new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(0.55, 0.0), new T.Vector2(0.62, 0.06), new T.Vector2(0.6, 0.07), new T.Vector2(0.3, 0.035)], 36),
    new T.LatheGeometry(
      [
        [0.2, 0],
        [0.3, 0.05],
        [0.4, 0.25],
        [0.44, 0.48],
        [0.42, 0.48],
        [0.38, 0.27],
        [0.0, 0.2],
      ].map(([r, y]) => new T.Vector2(r, y)),
      32,
    ).translate(0, 0.04, 0),
    new T.TorusGeometry(0.13, 0.035, 8, 16, Math.PI * 1.2).rotateZ(-Math.PI * 0.6).translate(0.45, 0.3, 0),
  ].map((g) => g.toNonIndexed());
  const set = add(mergeGeometries(ware)!, china, cx, top, cz);
  ware.forEach((g) => g.dispose());
  set.castShadow = true;
  const tea = add(new T.CircleGeometry(0.39, 24), standard({ color: "#8a4a1c", roughness: 0.15 }), cx, top + 0.45, cz, false);
  tea.rotation.x = -Math.PI / 2;
  // The vase only where a graphics card draws (under software drawing each extra mesh costs a few milliseconds).
  if (rich) {
    // A little vase of flowers at the back left.
    const vx = -7.2,
      vz = -3.4;
    add(
      new T.LatheGeometry(
        [
          [0, 0],
          [0.3, 0],
          [0.42, 0.35],
          [0.3, 0.8],
          [0.16, 1.05],
          [0.2, 1.15],
        ].map(([r, y]) => new T.Vector2(r, y)),
        28,
      ),
      own(glossy({ color: "#3e6f8e", roughness: 0.2 })),
      vx,
      top,
      vz,
    );
    const grove = new Grove(scene, own, { shadow: false, bright: 1.4, lift: 1.15, leaves: rich ? 1 : 0.6 });
    grove.crown("blossom", [vx, top + 1.75, vz], [0.7, 0.55, 0.7], "#f4c2cf", 1);
    grove.crown("box", [vx + 0.15, top + 1.35, vz + 0.1], [0.5, 0.35, 0.5], "#5b8c4a", 2);
    grove.build();
  }
}
