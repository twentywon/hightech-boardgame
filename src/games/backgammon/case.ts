import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, glossy, weave, wood } from "../../engine/scene-utils";

/**
 * The backgammon case and what is played with it, all made in code: a folding case of two maple halves hinged at
 * the bar, with raised walls, brass corners, hinges and clasps, a felt field with points of stitched leather, bear-off
 * trays, turned checkers with a ridge and an inlaid ring, and a doubling cube. The numbers it is built to are the
 * playing numbers of the view (a point `W` wide, the bar `BAR_W`, the field `HALF` deep on each side of the middle).
 */
export type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A point's width, the bar's width, the field's half depth, a checker's radius and thickness, the field's height. */
export const W = 0.66,
  BAR_W = 0.8,
  HALF = 3.3,
  R = 0.29,
  THICK = 0.14,
  TOP = 0.1;
/** Where the field ends at each side (the bar's edge and the tray wall's), and the case's outer measures. */
export const FIELD_X = 6 * W + BAR_W / 2,
  /** The walls' top, which is also the top of the bar. */
  WALL = 0.3,
  /** The bear-off trays at the ends: from the wall beside the field to the end wall. */
  TRAY = { inner: FIELD_X + 0.16, outer: FIELD_X + 1.36 },
  CASE = { x: FIELD_X + 1.56, z: HALF + 0.2 },
  /** The middle of a tray across, where the checkers borne off stand and the cups wait. */
  TRAY_X = (FIELD_X + 0.16 + FIELD_X + 1.36) / 2;
/**
 * Lays a picture over `geometry` as if projected along each face's own axis, `size` units to a repeat (`shift` moves
 * it along). Rounded blocks keep their picture whole on every face however long and thin the block, so a wall or a
 * slat squeezed the grain many times over one way: besides looking wrong, that made the filtering sample the
 * picture over and over (a slatted table so mapped cost as much as the rest of the scene under software drawing).
 */
export function planar(geometry: T.BufferGeometry, size: number, shift = 0) {
  const at = geometry.getAttribute("position"),
    normal = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) {
    const nx = Math.abs(normal.getX(i)),
      ny = Math.abs(normal.getY(i)),
      nz = Math.abs(normal.getZ(i)),
      [u, v] = ny >= nx && ny >= nz ? [at.getX(i), at.getZ(i)] : nx >= nz ? [at.getZ(i), at.getY(i)] : [at.getX(i), at.getY(i)];
    uv.setXY(i, u / size + shift, v / size + shift * 0.61);
  }
  return geometry;
}
/** A seeded run of numbers, so that the leather and the felt are the same every time. */
function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
const FELT = "#1d4a37",
  /** The two leathers of the points: tan and cream, each with a thread that shows on it. */
  LEATHER = [
    { fill: "#a85a2b", dark: "#6e3416", thread: "#f1ddb2" },
    { fill: "#e7d6ad", dark: "#b49a6c", thread: "#7a5131" },
  ];
/**
 * The picture of one half of the field (both halves are alike): green felt, six long points at each side in tan and
 * cream leather, each stitched round inside its edge. With `relief` the same drawn as heights, for a bump map: the
 * leather stands a little above the felt and the stitches sink into it.
 */
function halfField(width: number, height: number, relief: boolean) {
  const { c, ctx } = canvas(width, height),
    rand = seeded(relief ? 91 : 17),
    u = width / 6,
    s = width / 792;
  ctx.fillStyle = relief ? "#808080" : FELT;
  ctx.fillRect(0, 0, width, height);
  // The nap of the felt: fine specks lighter and darker.
  for (let i = 0; i < width * height * 0.02; i++) {
    ctx.fillStyle = relief ? (rand() < 0.5 ? "#7a7a7a" : "#868686") : rand() < 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(rand() * width, rand() * height, 1.6 * s, 1.6 * s);
  }
  if (!relief) {
    const shade = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.7);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);
  }
  const triangle = (x: number, near: boolean, inset: number) => {
    const base = near ? height - inset * 0.7 : inset * 0.7,
      tip = near ? height * 0.58 + inset * 1.6 : height * 0.42 - inset * 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 5 * s + inset, base);
    ctx.lineTo(x + u - 5 * s - inset, base);
    ctx.lineTo(x + u / 2, tip);
    ctx.closePath();
  };
  for (let col = 0; col < 6; col++)
    for (const near of [true, false]) {
      const x = col * u,
        kind = LEATHER[(col + (near ? 0 : 1)) % 2 ? 1 : 0];
      if (relief) {
        // Raised leather with a soft bevel, a groove where the stitches run.
        ctx.filter = `blur(${2.5 * s}px)`;
        ctx.fillStyle = "#a8a8a8";
        triangle(x, near, 0);
        ctx.fill();
        ctx.filter = "none";
        ctx.strokeStyle = "#5a5a5a";
        ctx.lineWidth = 2.4 * s;
        ctx.setLineDash([7 * s, 5 * s]);
        triangle(x, near, 9 * s);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      ctx.save();
      triangle(x, near, 0);
      ctx.fillStyle = kind.fill;
      ctx.fill();
      ctx.clip();
      // The grain of the leather: little pores and creases, a little darker toward the tip.
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
        ctx.beginPath();
        ctx.arc(x + rand() * u, near ? height * 0.55 + rand() * height * 0.45 : rand() * height * 0.45, (0.8 + rand() * 1.4) * s, 0, Math.PI * 2);
        ctx.fill();
      }
      const fade = ctx.createLinearGradient(0, near ? height : 0, 0, near ? height * 0.58 : height * 0.42);
      fade.addColorStop(0, "rgba(0,0,0,0)");
      fade.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = fade;
      ctx.fillRect(x, 0, u, height);
      ctx.restore();
      // The cut edge, dark, and the stitches just inside it.
      ctx.strokeStyle = kind.dark;
      ctx.lineWidth = 2.6 * s;
      triangle(x, near, 0);
      ctx.stroke();
      ctx.strokeStyle = kind.thread;
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([7 * s, 5 * s]);
      triangle(x, near, 9 * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  return c;
}
/** The field's material: the painted half, with the leather's relief and the felt's weave where a graphics card draws. */
export function fieldMaterial(own: Own) {
  const rich = capable(),
    width = rich ? 1188 : 792,
    height = Math.round(width / 0.6),
    map = own(new T.CanvasTexture(halfField(width, height, false)));
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  if (!rich) return own(new T.MeshLambertMaterial({ map }));
  const bumpMap = own(new T.CanvasTexture(halfField(width, height, true)));
  return own(new T.MeshStandardMaterial({ map, bumpMap, bumpScale: 1.4, roughness: 0.82 }));
}
/** Plain felt for the trays' floors. */
export function feltMaterial(own: Own) {
  const { c, ctx } = canvas(128, 128),
    rand = seeded(5);
  ctx.fillStyle = FELT;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
    ctx.fillRect(rand() * 128, rand() * 128, 1.5, 1.5);
  }
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  map.wrapS = map.wrapT = T.RepeatWrapping;
  map.repeat.set(2, 10);
  return capable() ? own(new T.MeshStandardMaterial({ map, roughness: 1, ...weave(2, 10, own, 0.6) })) : own(new T.MeshLambertMaterial({ map }));
}
/** Dark cognac leather along the top of the bar, stitched along both edges, with the seam of the two halves down the middle. */
function barLeather(own: Own) {
  const { c, ctx } = canvas(128, 1024),
    rand = seeded(23);
  ctx.fillStyle = "#5b2e17";
  ctx.fillRect(0, 0, 128, 1024);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.1)" : "rgba(255,210,160,0.05)";
    ctx.fillRect(rand() * 128, rand() * 1024, 1.5, 1.5);
  }
  ctx.strokeStyle = "#e5c48c";
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 6]);
  for (const x of [10, 52, 76, 118]) {
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, 1018);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // The seam: the two halves' leather meeting over the hinge line.
  ctx.fillStyle = "#1c0d05";
  ctx.fillRect(62, 0, 4, 1024);
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  return capable() ? own(new T.MeshStandardMaterial({ map, roughness: 0.6 })) : own(new T.MeshLambertMaterial({ map }));
}
/** Brass: polished where a graphics card reflects the room, a plain warm metal colour otherwise. */
export function brass(own: Own) {
  return capable()
    ? own(new T.MeshStandardMaterial({ color: "#c79a45", metalness: 0.9, roughness: 0.3 }))
    : own(new T.MeshLambertMaterial({ color: "#c9a456" }));
}
/**
 * The case, open on the table: two halves of pale polished maple meeting at the bar, each with its walls and its
 * tray, a felt field with the points, leather on the bar, brass corners, two hinges over the bar and a clasp at each
 * end. Returned as one group; its wood is one merged mesh, its brass another.
 */
export function backgammonCase(own: Own) {
  const group = new T.Group(),
    rich = capable(),
    // The case is pale polished maple, so that it stands apart from the dark table under it (the user found the two alike).
    maple = rich
      ? own(new T.MeshStandardMaterial({ map: own(wood(false)), color: "#f3dcb0", roughness: 0.32 }))
      : own(new T.MeshStandardMaterial({ map: own(wood(false)), color: "#f3dcb0", roughness: 0.45 })),
    parts: T.BufferGeometry[] = [],
    at = (g: T.BufferGeometry, x: number, y: number, z: number) => parts.push(g.translate(x, y, z)),
    wallH = WALL - TOP,
    gap = 0.006;
  for (const side of [-1, 1]) {
    const half = CASE.x - gap,
      mid = side * (gap + half / 2);
    // The bottom, and the walls round the half: long sides, the end, the bar wall and the wall between field and tray.
    at(block(half, TOP, CASE.z * 2, 0.03), mid, TOP / 2, 0);
    for (const z of [-1, 1]) at(block(half, wallH + 0.02, 0.2, 0.05), mid, TOP + wallH / 2 - 0.01, z * (HALF + 0.1));
    at(block(0.2, wallH + 0.02, HALF * 2 + 0.02, 0.05), side * (CASE.x - 0.1), TOP + wallH / 2 - 0.01, 0);
    at(block(BAR_W / 2 - gap, wallH + 0.02, HALF * 2 + 0.02, 0.04), side * (gap + (BAR_W / 2 - gap) / 2), TOP + wallH / 2 - 0.01, 0);
    at(block(0.16, wallH + 0.02, HALF * 2 + 0.02, 0.04), side * (FIELD_X + 0.08), TOP + wallH / 2 - 0.01, 0);
    // The tray's divider: the two sides' checkers lie apart.
    at(block(TRAY.outer - TRAY.inner, wallH * 0.55, 0.08, 0.03), side * TRAY_X, TOP + wallH * 0.27, 0);
  }
  const shell = new T.Mesh(own(planar(mergeGeometries(parts), 4)), maple);
  shell.castShadow = shell.receiveShadow = true;
  parts.forEach((g) => g.dispose());
  // Drawn nearest first, so that what lies under the field, the felt and the bar is not painted only to be hidden
  // (the field and felt before the walls, the case before the table): under software drawing every layer costs.
  shell.renderOrder = -2;
  group.add(shell);
  // The field, one picture for both halves (a half's points alternate as the other's do).
  const field = fieldMaterial(own),
    plane = own(new T.PlaneGeometry(6 * W, HALF * 2));
  for (const side of [-1, 1]) {
    const face = new T.Mesh(plane, field);
    face.rotation.x = -Math.PI / 2;
    face.position.set(side * (BAR_W / 2 + 3 * W), TOP + 0.001, 0);
    face.receiveShadow = true;
    face.renderOrder = -3;
    group.add(face);
  }
  const felt = feltMaterial(own),
    trayFloor = own(new T.PlaneGeometry(TRAY.outer - TRAY.inner, HALF * 2));
  for (const side of [-1, 1]) {
    const floor = new T.Mesh(trayFloor, felt);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(side * TRAY_X, TOP + 0.001, 0);
    floor.receiveShadow = true;
    floor.renderOrder = -3;
    group.add(floor);
  }
  const strip = new T.Mesh(own(new T.PlaneGeometry(BAR_W - 0.06, HALF * 2 + 0.3)), barLeather(own));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, WALL + 0.002, 0);
  strip.receiveShadow = true;
  strip.renderOrder = -3;
  group.add(strip);
  // Brass: a cap over each outer corner, two hinges across the bar, a clasp on each end.
  const metal: T.BufferGeometry[] = [],
    put = (g: T.BufferGeometry, x: number, y: number, z: number, turn?: T.Euler) => {
      if (turn) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(turn));
      metal.push(g.translate(x, y, z));
    };
  for (const x of [-CASE.x + 0.11, -0.13, 0.13, CASE.x - 0.11])
    for (const z of [-1, 1]) {
      const end = Math.abs(x) > 1;
      put(block(end ? 0.26 : 0.27, wallH + 0.04, 0.26, 0.05), x + (end ? Math.sign(x) * 0.01 : 0), TOP + wallH / 2, z * (HALF + 0.11));
    }
  for (const z of [-1, 1]) {
    const middle = z * (HALF - 0.34);
    put(block(0.5, 0.014, 0.4, 0.006), 0, WALL + 0.01, middle);
    put(new T.CylinderGeometry(0.04, 0.04, 0.44, 12), 0, WALL + 0.036, middle, new T.Euler(Math.PI / 2, 0, 0));
    for (const dx of [-0.16, 0.16]) for (const dz of [-0.11, 0.11]) put(new T.CylinderGeometry(0.026, 0.026, 0.01, 10), dx, WALL + 0.02, middle + dz);
  }
  for (const side of [-1, 1]) {
    // On the outside of each end: a plate with a hasp on one side and a catch on the other, as a case shuts.
    put(block(0.04, 0.16, 0.5, 0.012), side * (CASE.x + 0.02), TOP + 0.1, 0);
    put(block(0.06, side > 0 ? 0.12 : 0.06, 0.18, 0.02), side * (CASE.x + 0.05), TOP + (side > 0 ? 0.14 : 0.1), 0);
  }
  const hardware = new T.Mesh(own(mergeGeometries(metal)), brass(own));
  metal.forEach((g) => g.dispose());
  hardware.castShadow = true;
  group.add(hardware);
  return group;
}
/**
 * A turned checker `R` wide and `THICK` thick, centred on y = 0: a rounded edge, a flat rim, a raised ridge, and a
 * sunk face with a ring inlaid in the second colour; the colours are the vertices' own.
 */
export function checkerGeometry(body: string, inlay: string, segments: number) {
  const h = THICK / 2,
    profile: [number, number, boolean][] = [
      [0, -h, false],
      [0.25, -h, false],
      [0.279, -h + 0.008, false],
      [0.29, -h + 0.026, false],
      [0.29, h - 0.026, false],
      [0.281, h - 0.008, false],
      [0.266, h, false],
      [0.25, h, false],
      [0.242, h - 0.008, false],
      [0.233, h - 0.002, false],
      [0.226, h + 0.006, false],
      [0.218, h - 0.001, false],
      [0.212, h - 0.012, false],
      [0.19, h - 0.014, false],
      [0.189, h - 0.014, true],
      [0.168, h - 0.014, true],
      [0.167, h - 0.014, false],
      [0.11, h - 0.012, false],
      [0.085, h - 0.006, false],
      [0.04, h - 0.004, false],
      [0, h - 0.004, false],
    ],
    geometry = new T.LatheGeometry(
      profile.map(([r, y]) => new T.Vector2(r, y)),
      segments,
    ),
    a = new T.Color(body),
    b = new T.Color(inlay),
    count = geometry.getAttribute("position").count,
    colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const c = profile[i % profile.length][2] ? b : a;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
  return geometry;
}
/** The checkers' paint: the colours are in the vertices, the finish is a hard lacquer. */
export function checkerMaterial(own: Own) {
  return own(glossy({ color: "#ffffff", vertexColors: true, roughness: 0.32 }, 0.8));
}
/** The faces of the doubling cube, by the material slot of a box: +x, −x, +y, −y, +z, −z. */
export const CUBE_FACES = [2, 32, 64, 4, 8, 16];
/** Which way is up in the picture of each face of a box, in the box's own space. */
const PICTURE_UP = [new T.Vector3(0, 1, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, -1), new T.Vector3(0, 0, 1), new T.Vector3(0, 1, 0), new T.Vector3(0, 1, 0)];
/** The size of the doubling cube. */
export const CUBE_SIZE = 0.46;
/**
 * The doubling cube: ivory with its numbers cut in and filled black, all six faces in one picture (two rows of
 * three), so that it is a single draw.
 */
export function doublingCube(own: Own) {
  const cell = capable() ? 192 : 128,
    { c, ctx } = canvas(cell * 3, cell * 2);
  CUBE_FACES.forEach((value, slot) => {
    const x = (slot % 3) * cell,
      y = Math.floor(slot / 3) * cell;
    ctx.fillStyle = "#f1e9d6";
    ctx.fillRect(x, y, cell, cell);
    const edge = ctx.createRadialGradient(x + cell / 2, y + cell / 2, cell * 0.25, x + cell / 2, y + cell / 2, cell * 0.72);
    edge.addColorStop(0, "rgba(255,255,255,0)");
    edge.addColorStop(1, "rgba(150,120,80,0.35)");
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, cell, cell);
    ctx.font = `700 ${Math.round(cell * (value > 9 ? 0.46 : 0.56))}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(String(value), x + cell / 2 + 1.5, y + cell / 2 + 3.5);
    ctx.fillStyle = "#1a1714";
    ctx.fillText(String(value), x + cell / 2, y + cell / 2 + 2);
  });
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const geometry = own(block(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 0.06, 2)),
    uv = geometry.getAttribute("uv"),
    index = geometry.getIndex()!;
  // Each face's picture moved into its cell of the atlas.
  geometry.groups.forEach((group, slot) => {
    const done = new Set<number>();
    for (let k = group.start; k < group.start + group.count; k++) {
      const i = index.getX(k);
      if (done.has(i)) continue;
      done.add(i);
      uv.setXY(i, ((slot % 3) + uv.getX(i)) / 3, (1 - Math.floor(slot / 3)) * 0.5 + uv.getY(i) / 2);
    }
  });
  geometry.clearGroups();
  const mesh = new T.Mesh(geometry, own(glossy({ map, roughness: 0.35 }, 0.6)));
  mesh.castShadow = true;
  return mesh;
}
/** How the cube is turned to show `value` on top, its number upright for one looking from the side `side` sits at. */
export function cubeTurn(value: number, side: number) {
  const slot = Math.max(0, CUBE_FACES.indexOf(value)),
    q = new T.Quaternion(),
    X = new T.Vector3(1, 0, 0),
    Z = new T.Vector3(0, 0, 1);
  if (slot === 0) q.setFromAxisAngle(Z, Math.PI / 2);
  else if (slot === 1) q.setFromAxisAngle(Z, -Math.PI / 2);
  else if (slot === 3) q.setFromAxisAngle(X, Math.PI);
  else if (slot === 4) q.setFromAxisAngle(X, -Math.PI / 2);
  else if (slot === 5) q.setFromAxisAngle(X, Math.PI / 2);
  const up = PICTURE_UP[slot].clone().applyQuaternion(q),
    yaw = Math.PI - Math.atan2(up.x, up.z) + (side ? Math.PI : 0);
  return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
}
