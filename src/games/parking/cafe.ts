import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, stuff } from "../../engine/scene-utils";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** What the café is built with: where it goes, and the view's own keeping and paints (so that the view disposes of it all). */
export interface Kit {
  root: T.Object3D;
  keep: Keep;
  paint: (options: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial;
}
/**
 * The café left of the lot, in table units: its walls (the right one faces the lot), the terrace before it and the
 * paved walk between it and the kerb. It keeps clear of the lot (whose kerb ends at x = -3.3) and is low enough that its
 * shadow, cast toward +x by a sun at the left, ends on the walk.
 */
export const CAFE = { left: -6.95, right: -4.1, back: -3.72, front: -0.2, wall: 1.15, terrace: 2.55 };
const WALK = { left: -4.12, right: -3.31, back: -3.6, front: 3.47 };
/** The café's own colours: warm and plain (no brand's). */
const INK = {
  render: "#ede4d3",
  plinth: "#4a4642",
  frame: "#2f2e2c",
  terracotta: "#c4553b",
  cream: "#f4ead8",
  mustard: "#dfa23a",
  timber: "#c98d5a",
};
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}
/** A texture of a canvas painted by `paint`. */
function painted(keep: Keep, width: number, height: number, paint: (pen: CanvasRenderingContext2D) => void) {
  const c = canvas(width, height);
  paint(c.getContext("2d")!);
  const texture = keep(new T.CanvasTexture(c));
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** Writes `text` at most `width` wide, made smaller until it fits. */
function fit(pen: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight = 800) {
  let px = size;
  do {
    pen.font = `${weight} ${px}px Inter, "Noto Sans KR", Arial, sans-serif`;
    px -= 2;
  } while (pen.measureText(text).width > width && px > 8);
  pen.fillText(text, x, y);
}
/** Pavers of light concrete in a running bond, a tile a unit square: four rows of two. */
function pavers(keep: Keep) {
  const random = sequence(311);
  return painted(keep, 256, 256, (pen) => {
    pen.fillStyle = "#a9a398";
    pen.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++)
      for (let k = -1; k < 2; k++) {
        const x = k * 128 + (row % 2) * 64,
          y = row * 64,
          tone = 196 + Math.round(random() * 22);
        pen.fillStyle = `rgb(${tone},${tone - 4},${tone - 12})`;
        pen.fillRect(x + 2, y + 2, 124, 60);
        for (let i = 0; i < 60; i++) {
          const g = tone - 30 + Math.round(random() * 50);
          pen.fillStyle = `rgba(${g},${g},${g - 6},0.35)`;
          pen.fillRect(x + 2 + random() * 122, y + 2 + random() * 58, 1.5, 1.5);
        }
      }
  });
}
/** Stripes of two colours, `count` pairs across the picture, running up it (or across it, `across`). */
function stripes(keep: Keep, a: string, b: string, count: number, across = false) {
  return painted(keep, 256, 256, (pen) => {
    const w = 256 / (count * 2);
    for (let i = 0; i < count * 2; i++) {
      pen.fillStyle = i % 2 ? b : a;
      if (across) pen.fillRect(0, i * w, 256, w + 0.5);
      else pen.fillRect(i * w, 0, w + 0.5, 256);
    }
  });
}
/** The flap along an awning's edge: its stripes, scalloped below (the scallops are cut out, for `alphaTest`). */
function valance(keep: Keep, count: number) {
  return painted(keep, 512, 64, (pen) => {
    const w = 512 / (count * 2);
    for (let i = 0; i < count * 2; i++) {
      pen.fillStyle = i % 2 ? INK.cream : INK.terracotta;
      pen.fillRect(i * w, 0, w + 0.5, 64);
    }
    pen.globalCompositeOperation = "destination-out";
    for (let i = 0; i < count * 2; i++) {
      pen.beginPath();
      pen.arc((i + 0.5) * w, 64 + w * 0.12, w * 0.5, Math.PI, 0);
      pen.lineTo((i + 1) * w, 64);
      pen.lineTo(i * w, 64);
      pen.fill();
    }
  });
}
/**
 * The inside of the café through its windows, lit warm: a counter, shelves of cups, a menu board, pendant lamps
 * glowing, plants and a few people at tables, behind dark mullions.
 */
function interior(keep: Keep, seed: number, door = -1) {
  const random = sequence(seed);
  return painted(keep, 512, 128, (pen) => {
    const wall = pen.createLinearGradient(0, 0, 0, 128);
    wall.addColorStop(0, "#f3c98e");
    wall.addColorStop(0.55, "#e6a865");
    wall.addColorStop(1, "#b97a45");
    pen.fillStyle = wall;
    pen.fillRect(0, 0, 512, 128);
    // Wood panels low on the far wall, shelves of cups and a menu board above.
    pen.fillStyle = "rgba(120,70,40,0.45)";
    pen.fillRect(0, 70, 512, 58);
    for (const y of [30, 48]) {
      pen.fillStyle = "#6e4a30";
      pen.fillRect(26, y, 150, 3);
      for (let x = 32; x < 170; x += 12 + random() * 6) {
        pen.fillStyle = random() < 0.7 ? "#fbf6ec" : "#c4553b";
        pen.fillRect(x, y - 8, 7, 8);
      }
    }
    pen.fillStyle = "#2f2b28";
    pen.fillRect(220, 14, 96, 40);
    pen.fillStyle = "rgba(250,245,230,0.75)";
    for (let i = 0; i < 4; i++) pen.fillRect(228, 22 + i * 8, 40 + random() * 40, 2);
    // The counter, with its machine.
    pen.fillStyle = "#5e3f2a";
    pen.fillRect(0, 84, 300, 44);
    pen.fillStyle = "#d9b48a";
    pen.fillRect(0, 82, 300, 4);
    pen.fillStyle = "#9aa0a6";
    pen.fillRect(120, 64, 44, 18);
    pen.fillStyle = "#3a3d42";
    pen.fillRect(126, 70, 32, 6);
    // People at the tables by the window.
    for (const x of [352, 420, 470]) {
      pen.fillStyle = "rgba(70,45,32,0.62)";
      pen.beginPath();
      pen.arc(x, 74, 8, 0, Math.PI * 2);
      pen.fill();
      pen.beginPath();
      pen.roundRect(x - 13, 84, 26, 44, 9);
      pen.fill();
    }
    pen.fillStyle = "#f6f1e6";
    pen.fillRect(380, 96, 34, 5);
    // A plant in a corner.
    pen.fillStyle = "#4d7f3a";
    for (let i = 0; i < 7; i++) {
      pen.beginPath();
      pen.ellipse(500 - random() * 14, 70 + random() * 30, 9, 5, random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
    // Pendant lamps, glowing.
    for (const x of [70, 190, 290, 390, 460]) {
      pen.strokeStyle = "rgba(40,30,20,0.6)";
      pen.lineWidth = 1.5;
      pen.beginPath();
      pen.moveTo(x, 0);
      pen.lineTo(x, 24);
      pen.stroke();
      const glow = pen.createRadialGradient(x, 28, 0, x, 28, 26);
      glow.addColorStop(0, "rgba(255,250,215,0.95)");
      glow.addColorStop(0.35, "rgba(255,226,160,0.5)");
      glow.addColorStop(1, "rgba(255,210,140,0)");
      pen.fillStyle = glow;
      pen.fillRect(x - 26, 2, 52, 52);
      pen.fillStyle = "#2f2b28";
      pen.beginPath();
      pen.moveTo(x - 9, 30);
      pen.lineTo(x - 4, 22);
      pen.lineTo(x + 4, 22);
      pen.lineTo(x + 9, 30);
      pen.fill();
    }
    // A glazed door: its frame drawn heavier.
    if (door >= 0) {
      pen.fillStyle = "rgba(255,240,210,0.35)";
      pen.fillRect(door, 0, 70, 128);
      pen.fillStyle = INK.frame;
      pen.fillRect(door, 0, 6, 128);
      pen.fillRect(door + 64, 0, 6, 128);
      pen.fillRect(door + 50, 60, 4, 22);
    }
    // Mullions and the frame round them.
    pen.fillStyle = INK.frame;
    for (let x = 0; x <= 512; x += 128) pen.fillRect(x - 3, 0, 6, 128);
    pen.fillRect(0, 0, 512, 5);
    pen.fillRect(0, 123, 512, 5);
  });
}
/** A cup of coffee on its saucer with steam rising, inside a ring: the café's own emblem. */
function emblem(pen: CanvasRenderingContext2D, x: number, y: number, r: number) {
  pen.fillStyle = INK.cream;
  pen.beginPath();
  pen.arc(x, y, r, 0, Math.PI * 2);
  pen.fill();
  pen.strokeStyle = INK.terracotta;
  pen.lineWidth = r * 0.09;
  pen.beginPath();
  pen.arc(x, y, r * 0.86, 0, Math.PI * 2);
  pen.stroke();
  const s = r / 100;
  // The saucer, the cup and its handle.
  pen.fillStyle = "#2e2b28";
  pen.beginPath();
  pen.ellipse(x, y + 46 * s, 50 * s, 9 * s, 0, 0, Math.PI * 2);
  pen.fill();
  pen.fillStyle = INK.terracotta;
  pen.beginPath();
  pen.moveTo(x - 38 * s, y - 6 * s);
  pen.lineTo(x + 34 * s, y - 6 * s);
  pen.quadraticCurveTo(x + 32 * s, y + 38 * s, x - 2 * s, y + 40 * s);
  pen.quadraticCurveTo(x - 36 * s, y + 38 * s, x - 38 * s, y - 6 * s);
  pen.fill();
  pen.strokeStyle = INK.terracotta;
  pen.lineWidth = 8 * s;
  pen.beginPath();
  pen.ellipse(x + 38 * s, y + 10 * s, 12 * s, 14 * s, 0, -Math.PI / 2, Math.PI / 2);
  pen.stroke();
  pen.fillStyle = "#f9efe0";
  pen.fillRect(x - 38 * s, y - 6 * s, 72 * s, 5 * s);
  // Steam: three curls.
  pen.strokeStyle = "#2e2b28";
  pen.lineCap = "round";
  pen.lineWidth = 6 * s;
  for (const dx of [-18, 0, 18]) {
    pen.beginPath();
    pen.moveTo(x + dx * s, y - 14 * s);
    pen.bezierCurveTo(x + (dx - 10) * s, y - 26 * s, x + (dx + 10) * s, y - 38 * s, x + dx * s, y - 52 * s);
    pen.stroke();
  }
}
/** The sign on the roof: the emblem, PARK COFFEE and 파크 커피, light letters on a dark board with a thin light border. */
function signFace(keep: Keep) {
  const texture = painted(keep, 512, 256, (pen) => {
    pen.fillStyle = "#2b2826";
    pen.fillRect(0, 0, 512, 256);
    pen.strokeStyle = "rgba(244,234,216,0.85)";
    pen.lineWidth = 5;
    pen.beginPath();
    pen.roundRect(12, 12, 488, 232, 18);
    pen.stroke();
    emblem(pen, 124, 128, 92);
    pen.fillStyle = INK.cream;
    pen.textAlign = "left";
    pen.textBaseline = "alphabetic";
    fit(pen, "PARK", 236, 112, 248, 92);
    fit(pen, "COFFEE", 238, 176, 246, 62);
    pen.fillStyle = INK.mustard;
    fit(pen, "파크 커피", 240, 222, 240, 32, 700);
  });
  texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
  return texture;
}
/** The menu chalked on the boards of the stand by the walk. */
function chalkboard(keep: Keep) {
  return painted(keep, 128, 160, (pen) => {
    pen.fillStyle = "#26302b";
    pen.fillRect(0, 0, 128, 160);
    pen.strokeStyle = "#c79a62";
    pen.lineWidth = 10;
    pen.strokeRect(5, 5, 118, 150);
    pen.fillStyle = "rgba(245,240,225,0.85)";
    pen.textAlign = "center";
    fit(pen, "MENU", 64, 44, 96, 30);
    for (let i = 0; i < 5; i++) pen.fillRect(26, 62 + i * 16, 50 + ((i * 37) % 30), 3);
    emblem(pen, 64, 134, 16);
  });
}
/** Merges pieces of one stuff into one geometry. */
const merged = (pieces: T.BufferGeometry[]) => {
  const out = mergeGeometries(pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece)))!;
  for (const piece of pieces) piece.dispose();
  return out;
};
/**
 * A café of our own, left of the lot: a low modern building rendered cream above a dark plinth, a band of timber
 * under its flat roof, long windows lit warm on the side toward the lot and in front, a striped awning over the door
 * (the camera looks down so steeply that a long one hid all the glass) and three along the side toward the lot; on the
 * flat roof a raked sign (PARK COFFEE, with a cup drawn in code), the plant, a skylight, solar panels and a planted
 * patch; before it a
 * timber terrace in planters with tables under parasols, pots by the door, and a paved walk to the kerb with a
 * menu board on it. Everything is modelled and painted in code.
 */
export function cafe(kit: Kit) {
  const { root, keep, paint } = kit,
    put = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true, parent: T.Object3D = root) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    { left, right, back, front, wall } = CAFE,
    width = right - left,
    depth = front - back,
    cx = (left + right) / 2,
    cz = (back + front) / 2;
  // The paved walk from the kerb to the café and its terrace.
  const paving = pavers(keep);
  paving.repeat.set((WALK.right - WALK.left) * 1.6, (WALK.front - WALK.back) * 1.6);
  const stone = paint({ color: "#bdb7ab", roughness: 0.9 });
  put(block(WALK.right - WALK.left, 0.03, WALK.front - WALK.back, 0.006), [stone, stone, paint({ map: paving, roughness: 0.92 }), stone, stone, stone], (WALK.left + WALK.right) / 2, 0.015, (WALK.back + WALK.front) / 2, false);
  // The building: a dark plinth, cream walls, a band of timber under the roof.
  const render = paint({ ...stuff("stone", INK.render, 3, keep), roughness: 0.88 }),
    frame = paint({ color: INK.frame, roughness: 0.45, metalness: 0.35 }),
    timber = paint({ ...stuff("boards", INK.timber, 2, keep), roughness: 0.62 });
  put(block(width + 0.05, 0.07, depth + 0.05, 0.012), paint({ color: INK.plinth, roughness: 0.8 }), cx, 0.035, cz);
  put(block(width, wall, depth, 0.025), render, cx, wall / 2, cz);
  put(block(width + 0.035, 0.24, 0.035, 0.01), timber, cx, wall - 0.13, front + 0.012);
  put(block(0.035, 0.24, depth + 0.035, 0.01), timber, right + 0.012, wall - 0.13, cz);
  // Long windows lit from inside: toward the lot, and in front with the door.
  const glass = (seed: number, door = -1) => {
    const map = interior(keep, seed, door);
    return keep(glossy({ map, color: "#e2d2bb", emissive: "#ffffff", emissiveMap: map, emissiveIntensity: 0.5, roughness: 0.16, metalness: 0.05 }));
  };
  const side = put(new T.PlaneGeometry(depth - 0.55, 0.72), glass(41), right + 0.004, 0.5, cz + 0.05, false);
  side.rotation.y = Math.PI / 2;
  put(new T.PlaneGeometry(width - 0.45, 0.72), glass(67, 300), cx + 0.05, 0.5, front + 0.004, false);
  // Sills and heads, standing out a little from the wall.
  put(block(depth - 0.5, 0.035, 0.05, 0.01), frame, right + 0.02, 0.135, cz + 0.05).rotation.y = Math.PI / 2;
  put(block(depth - 0.5, 0.03, 0.04, 0.01), frame, right + 0.016, 0.87, cz + 0.05).rotation.y = Math.PI / 2;
  put(block(width - 0.4, 0.035, 0.05, 0.01), frame, cx + 0.05, 0.135, front + 0.02);
  put(block(width - 0.4, 0.03, 0.04, 0.01), frame, cx + 0.05, 0.87, front + 0.016);
  // The flat roof: gravel inside a dark parapet; the plant, a skylight glowing from below.
  const coping = paint({ color: "#3a3836", roughness: 0.7 }),
    gravel = paint({ ...stuff("gravel", "#b4afa5", 2, keep), roughness: 0.95 });
  put(block(width + 0.08, 0.07, depth + 0.08, 0.012), [coping, coping, gravel, coping, coping, coping], cx, wall + 0.035, cz);
  const top = wall + 0.07;
  for (const [w, d, x, z] of [
    [width + 0.08, 0.07, cx, back - 0.005],
    [width + 0.08, 0.07, cx, front + 0.005],
    [0.07, depth + 0.08, left - 0.005, cz],
    [0.07, depth + 0.08, right + 0.005, cz],
  ])
    put(block(w, 0.09, d, 0.015), coping, x, top + 0.045, z);
  const metal = paint({ color: "#c9ccce", roughness: 0.4, metalness: 0.55 }),
    fan = paint({ color: "#45494d", roughness: 0.6 });
  for (const [x, z, w] of [
    [left + 0.55, back + 0.5, 0.46],
    [left + 0.55, back + 1.12, 0.36],
  ]) {
    put(block(w, 0.22, w * 0.78, 0.02), metal, x, top + 0.11, z);
    put(new T.CylinderGeometry(w * 0.3, w * 0.3, 0.015, 20), fan, x, top + 0.225, z);
  }
  put(new T.CylinderGeometry(0.03, 0.03, 0.2, 10), metal, left + 1.1, top + 0.1, back + 0.4);
  // A skylight in the middle, lit from the room below; solar panels at the front left, a patch of planted roof at the front right.
  put(block(0.62, 0.05, 0.86, 0.012), coping, cx - 0.05, top + 0.025, back + 1.75);
  put(block(0.54, 0.03, 0.78, 0.01), keep(glossy({ color: "#6f8ea3", emissive: "#ffcf8a", emissiveIntensity: 0.22, roughness: 0.1, metalness: 0.3 })), cx - 0.05, top + 0.055, back + 1.75);
  const cells = painted(keep, 128, 160, (pen) => {
      pen.fillStyle = "#1c2b44";
      pen.fillRect(0, 0, 128, 160);
      pen.strokeStyle = "rgba(190,205,220,0.55)";
      pen.lineWidth = 2;
      for (let x = 0; x <= 128; x += 128 / 6) pen.strokeRect(x, 0, 0, 160);
      for (let y = 0; y <= 160; y += 16) pen.strokeRect(0, y, 128, 0);
      pen.strokeStyle = "#c9ccce";
      pen.lineWidth = 6;
      pen.strokeRect(0, 0, 128, 160);
    }),
    panel = keep(glossy({ map: cells, roughness: 0.25, metalness: 0.4 }));
  for (const x of [left + 0.42, left + 0.95])
    for (const z of [front - 1.45, front - 0.75]) {
      put(block(0.04, 0.08, 0.04, 0.01), metal, x, top + 0.04, z - 0.18);
      put(block(0.48, 0.02, 0.6, 0.008), [metal, metal, panel, metal, metal, metal], x, top + 0.09, z, true).rotation.x = 0.3;
    }
  put(block(1.05, 0.06, 1.05, 0.02), paint({ ...stuff("grass", "#7d9a4c", 1.5, keep), roughness: 0.95 }), right - 0.62, top + 0.03, front - 0.7, false);
  for (const [dx, dz, r] of [
    [-0.3, -0.25, 0.1],
    [0.25, 0.2, 0.12],
    [-0.15, 0.3, 0.08],
  ])
    put(new T.IcosahedronGeometry(r, 1), paint({ color: "#5a8f3e", roughness: 0.9 }), right - 0.62 + dx, top + 0.06 + r * 0.6, front - 0.7 + dz);
  // Striped awnings: one over the door (the windows either side show the room), three in a row along the side toward the lot.
  const slope = Math.atan2(0.17, 0.4),
    run = Math.hypot(0.17, 0.4),
    cloth = (count: number, across: boolean) => paint({ map: stripes(keep, INK.terracotta, INK.cream, count, across), roughness: 0.85, side: T.DoubleSide }),
    flap = (count: number) => paint({ map: valance(keep, count), roughness: 0.85, alphaTest: 0.5, side: T.DoubleSide }),
    frontLong = 0.82,
    door = right - 1.0,
    // The awnings hang from just under the timber band and come down over the tops of the windows.
    hang = 0.9,
    rim = hang - 0.17 - 0.0375;
  put(block(frontLong, 0.012, run, 0.004), cloth(Math.round(frontLong / 0.28), false), door, hang - 0.085, front + 0.2, true).rotation.x = slope;
  put(new T.PlaneGeometry(frontLong, 0.075), flap(Math.round(frontLong / 0.28)), door, rim, front + 0.402, false);
  for (const [z0, z1] of [
    [back + 0.3, back + 1.22],
    [back + 1.32, back + 2.24],
    [back + 2.34, front - 0.3],
  ]) {
    const long = z1 - z0,
      awning = put(block(run, 0.012, long, 0.004), cloth(Math.round(long / 0.28), true), right + 0.2, hang - 0.085, (z0 + z1) / 2, true);
    awning.rotation.z = -slope;
    const edge = put(new T.PlaneGeometry(long, 0.075), flap(Math.round(long / 0.28)), right + 0.402, rim, (z0 + z1) / 2, false);
    edge.rotation.y = Math.PI / 2;
  }
  // The sign on the roof, raked back toward the street and lit.
  const face = signFace(keep),
    sign = new T.Group(),
    board = new T.Group();
  // Far enough back to stand clear of the status line on a phone, far enough right to be whole on a desk's screen.
  sign.position.set(right - 0.62, top, back + 1.42);
  sign.rotation.y = 0.12;
  board.rotation.x = -0.55;
  // Two posts behind, meeting the board's back, each on a foot.
  for (const x of [-0.4, 0.4]) {
    put(block(0.05, 0.32, 0.05, 0.01), coping, x, 0.16, -0.26, true, sign);
    put(block(0.06, 0.04, 0.42, 0.01), coping, x, 0.02, -0.1, true, sign);
  }
  put(block(1.1, 0.56, 0.06, 0.02), coping, 0, 0.3, -0.03, true, board);
  put(new T.PlaneGeometry(1.02, 0.49), paint({ map: face, emissive: "#ffffff", emissiveMap: face, emissiveIntensity: 0.32, roughness: 0.45 }), 0, 0.3, 0.002, false, board);
  sign.add(board);
  root.add(sign);
  // The terrace: a timber deck, planters along its far and near sides with shrubs and flowers.
  const deckDepth = CAFE.terrace - front;
  put(block(width, 0.05, deckDepth, 0.01), paint({ ...stuff("boards", "#b48a5e", 2.4, keep), roughness: 0.7 }), cx, 0.025, front + deckDepth / 2, false);
  const corten = paint({ color: "#8a4f30", roughness: 0.75 }),
    shrub = paint({ ...stuff("grass", "#4d8a3c", 2, keep), roughness: 0.95 }),
    planters: [number, number, number, number][] = [
      [0.18, deckDepth - 0.1, left + 0.09, front + deckDepth / 2 + 0.05],
      [width - 0.75, 0.18, left + (width - 0.75) / 2, CAFE.terrace - 0.09],
    ],
    random = sequence(77),
    blooms: Record<string, T.BufferGeometry[]> = { "#f2a7b8": [], "#fbf7ee": [], "#f2c94c": [] };
  for (const [w, d, x, z] of planters) {
    put(block(w, 0.2, d, 0.02), corten, x, 0.15, z);
    put(block(w - 0.02, 0.1, d - 0.02, 0.045), shrub, x, 0.27, z);
    for (let i = 0; i < Math.round((w + d) * 9); i++) {
      const flower = new T.IcosahedronGeometry(0.018, 0);
      flower.translate(x + (random() - 0.5) * (w - 0.04), 0.32 + random() * 0.01, z + (random() - 0.5) * (d - 0.04));
      blooms[Object.keys(blooms)[i % 3]].push(flower);
    }
  }
  for (const [color, pieces] of Object.entries(blooms)) put(merged(pieces), paint({ color, roughness: 0.7 }), 0, 0, 0, false);
  // Tables under parasols, three chairs to a table.
  const marble = paint({ color: "#f3f0ea", roughness: 0.35 }),
    iron = paint({ color: "#34363a", roughness: 0.5, metalness: 0.4 }),
    rattan = paint({ color: "#b5814a", roughness: 0.85 }),
    canopies = [
      paint({ map: stripes(keep, INK.terracotta, INK.cream, 4), roughness: 0.85, side: T.DoubleSide }),
      paint({ map: stripes(keep, INK.mustard, INK.cream, 4), roughness: 0.85, side: T.DoubleSide }),
    ];
  [
    [right - 0.55, front + 0.95],
    [left + 1.0, front + 1.05],
    [right - 0.8, front + 2.0],
    [left + 0.75, front + 2.05],
  ].forEach(([x, z], k) => {
    const table = new T.Group();
    table.position.set(x, 0.05, z);
    put(new T.CylinderGeometry(0.075, 0.09, 0.02, 18), iron, 0, 0.01, 0, true, table);
    put(new T.CylinderGeometry(0.016, 0.016, 0.36, 8), iron, 0, 0.19, 0, true, table);
    put(new T.CylinderGeometry(0.16, 0.16, 0.024, 24), marble, 0, 0.38, 0, true, table);
    for (let c = 0; c < 3; c++) {
      const turn = (c / 3) * Math.PI * 2 + k * 0.7,
        chair = new T.Group();
      chair.position.set(Math.sin(turn) * 0.27, 0, Math.cos(turn) * 0.27);
      chair.rotation.y = turn;
      put(new T.CylinderGeometry(0.01, 0.01, 0.2, 6), iron, 0, 0.1, 0, false, chair);
      put(block(0.13, 0.022, 0.13, 0.008), rattan, 0, 0.21, 0.01, true, chair);
      put(block(0.13, 0.15, 0.02, 0.008), rattan, 0, 0.3, 0.07, true, chair);
      table.add(chair);
    }
    put(new T.CylinderGeometry(0.009, 0.009, 0.56, 6), iron, 0, 0.66, 0, true, table);
    const canopy = canopies[k % 2];
    put(new T.ConeGeometry(0.44, 0.13, 8, 1, true), canopy, 0, 0.88, 0, true, table).rotation.y = k * 0.4;
    put(new T.CylinderGeometry(0.44, 0.44, 0.035, 8, 1, true), canopy, 0, 0.8, 0, false, table).rotation.y = k * 0.4;
    put(new T.SphereGeometry(0.018, 10, 8), iron, 0, 0.955, 0, false, table);
    root.add(table);
  });
  // Pots of shrubs by the door and along the wall toward the lot.
  const clay = paint({ color: "#b8633f", roughness: 0.8 }),
    leaves = paint({ color: "#4f8a3a", roughness: 0.85 });
  for (const [x, z, big] of [
    [right - 1.42, front + 0.12, 1],
    [right - 0.58, front + 0.12, 1],
    [right + 0.16, front - 0.35, 1.2],
    [right + 0.16, back + 1.27, 1.2],
  ]) {
    put(new T.CylinderGeometry(0.085 * big, 0.065 * big, 0.14 * big, 16), clay, x, 0.05 + 0.07 * big, z);
    put(new T.IcosahedronGeometry(0.115 * big, 1), leaves, x, 0.05 + 0.22 * big, z);
  }
  // A menu board on the walk, folded open.
  const chalk = paint({ map: chalkboard(keep), roughness: 0.85 }),
    stand = new T.Group();
  stand.position.set(WALK.left + 0.3, 0.03, front + 0.75);
  stand.rotation.y = -0.4;
  for (const lean of [-1, 1]) {
    const leaf = put(block(0.2, 0.26, 0.012, 0.004), [rattan, rattan, rattan, rattan, chalk, chalk], 0, 0.125, lean * 0.04, true, stand);
    leaf.rotation.x = lean * 0.24;
  }
  root.add(stand);
  // Trees on the grass beyond the café.
  const bark = paint({ color: "#6b4a2e", roughness: 0.9 }),
    crown = keep(new T.IcosahedronGeometry(0.55, 1)),
    trunk = keep(new T.CylinderGeometry(0.07, 0.1, 0.7, 10)),
    greens = [paint({ color: "#4f8a3a", roughness: 0.85 }), paint({ color: "#3e7432", roughness: 0.85 })];
  [
    [left - 0.85, back + 0.6],
    [left - 1.05, back + 2.7],
    [left - 0.8, front + 1.6],
    [left - 1.15, front + 3.4],
  ].forEach(([x, z], k) => {
    const t = new T.Mesh(trunk, bark),
      c = new T.Mesh(crown, greens[k % 2]);
    t.position.set(x, 0.35, z);
    c.position.set(x, 0.95, z);
    c.scale.setScalar(0.85 + (k % 3) * 0.1);
    t.castShadow = c.castShadow = true;
    root.add(t, c);
  });
}
