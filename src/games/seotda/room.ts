import * as T from "three";
import { block, capable, furry, glossy, woodPhoto } from "../../engine/scene-utils";
import type { TableView } from "../cards/game";
import { LAYOUTS, type SeatRow, type TableSetting } from "../cards/table-view";

type Own = <X extends { dispose(): void }>(resource: X) => X;
/** The blanket's size (half its width and depth) and its thickness; the cards lie on its top at y 0. */
export const BLANKET = { half: 5.45, depth: 3.75, thick: 0.05 };
const FLOOR = -BLANKET.thick;

/**
 * Under software drawing (the browser tests) the room is lit the cheap way: Lambert instead of the physical
 * material, with the same picture and colour. Where a graphics card draws, `material` is kept.
 */
function matte<M extends T.Material>(material: M, fine: boolean): T.Material {
  if (fine || !(material instanceof T.MeshStandardMaterial)) return material;
  const plain = new T.MeshLambertMaterial({
    map: material.map,
    color: material.color,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
  });
  material.dispose();
  return plain;
}
/** A floor under software drawing: its picture as it is, unlit and dimmed, and no shadows to look up. */
function unlit(map: T.Texture, dim: string) {
  map.anisotropy = 1;
  return new T.MeshBasicMaterial({ map, color: dim });
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function texture(c: HTMLCanvasElement, own: Own) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A fixed sequence of numbers, so that the room is drawn alike every time. */
function sequence(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/**
 * The army blanket hwatu is played on: olive drab wool with a fine fuzz, a darker band along its hem and a
 * blanket stitch round the edge, one picture over the whole blanket.
 */
function blanketTexture(own: Own) {
  const scale = 96,
    w = Math.round(BLANKET.half * 2 * scale),
    h = Math.round(BLANKET.depth * 2 * scale),
    { c, ctx } = canvas(w, h),
    rand = sequence(29);
  ctx.fillStyle = "#56603d";
  ctx.fillRect(0, 0, w, h);
  // Cloudy wool: large soft blotches, then the fuzz.
  for (let i = 0; i < 90; i++) {
    const x = rand() * w,
      y = rand() * h,
      r = 40 + rand() * 140,
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rand() < 0.5 ? "rgba(120, 128, 84, 0.16)" : "rgba(34, 40, 22, 0.16)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(190, 196, 150, 0.06)" : "rgba(18, 22, 10, 0.08)";
    const x = rand() * w,
      y = rand() * h,
      a = rand() * Math.PI;
    ctx.fillRect(x, y, 1 + Math.abs(Math.cos(a)) * 3, 1 + Math.abs(Math.sin(a)) * 3);
  }
  // The hem: a darker woven band a little in from the edge, with two thin lines.
  const band = 0.34 * scale,
    inset = 0.2 * scale;
  ctx.strokeStyle = "rgba(30, 34, 18, 0.42)";
  ctx.lineWidth = band;
  ctx.strokeRect(inset + band / 2, inset + band / 2, w - 2 * inset - band, h - 2 * inset - band);
  ctx.strokeStyle = "rgba(196, 180, 120, 0.22)";
  ctx.lineWidth = 3;
  ctx.strokeRect(inset - 4, inset - 4, w - 2 * inset + 8, h - 2 * inset + 8);
  ctx.strokeRect(inset + band + 4, inset + band + 4, w - 2 * (inset + band + 4), h - 2 * (inset + band + 4));
  // Blanket stitch along the edge in a pale thread.
  ctx.strokeStyle = "rgba(214, 196, 140, 0.75)";
  ctx.lineWidth = 3.5;
  const step = 0.16 * scale,
    deep = 0.1 * scale;
  ctx.beginPath();
  for (let x = step / 2; x < w; x += step) {
    ctx.moveTo(x, 3);
    ctx.lineTo(x, deep);
    ctx.moveTo(x, h - 3);
    ctx.lineTo(x, h - deep);
  }
  for (let y = step / 2; y < h; y += step) {
    ctx.moveTo(3, y);
    ctx.lineTo(deep, y);
    ctx.moveTo(w - 3, y);
    ctx.lineTo(w - deep, y);
  }
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  return texture(c, own);
}
/**
 * A woomul maru: thick beams running down the room with short boards laid across between them, each bay's boards
 * staggered from the next, cut from the wood photograph and darkened as old oiled pine is. One tile holds two bays.
 */
function maruTexture(own: Own) {
  const size = 512,
    { c, ctx } = canvas(size, size),
    bay = size / 2,
    beam = 44,
    board = 64,
    rand = sequence(7);
  ctx.fillStyle = "#6e4a2c";
  ctx.fillRect(0, 0, size, size);
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  const piece = (image: HTMLImageElement | null, x: number, y: number, w: number, h: number, across: boolean) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    if (image) {
      ctx.translate(x + w / 2, y + h / 2);
      // The grain runs along each piece: across the room for a board, down it for a beam.
      if (across) ctx.rotate(Math.PI / 2);
      ctx.drawImage(image, -size / 2 - rand() * 120, -size / 2 - rand() * 120, size * 1.4, size * 1.4);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.fillStyle = `rgba(${across ? 84 + rand() * 24 : 74}, ${across ? 50 + rand() * 14 : 44}, ${across ? 24 : 20}, ${across ? 0.5 + rand() * 0.1 : 0.56})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(28, 16, 6, 0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  };
  const lay = (image: HTMLImageElement | null) => {
    for (let k = 0; k < 2; k++) {
      const x = k * bay;
      piece(image, x, 0, beam, size, false);
      // Boards between this beam and the next, half a board lower in every other bay.
      for (let y = -board + (k ? board / 2 : 0); y < size; y += board) piece(image, x + beam, y, bay - beam, board, true);
    }
    // Pegs where the boards meet the beams.
    ctx.fillStyle = "rgba(30, 18, 8, 0.6)";
    for (let k = 0; k < 2; k++)
      for (let y = board / 2 + (k ? board / 2 : 0); y < size + board; y += board * 2) {
        ctx.beginPath();
        ctx.arc(k * bay + beam / 2, y % size, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
  };
  lay(null);
  woodPhoto("light", (image) => {
    lay(image);
    t.needsUpdate = true;
  });
  return t;
}
/** A silk cushion's cover: its colour, a border of another, and a round flower of our own in the middle. */
function cushionTexture(own: Own, base: string, border: string, flower: string) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(26, 26, 204, 204);
  ctx.strokeStyle = flower;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 38, 180, 180);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = flower;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(128 + Math.cos(a) * 26, 128 + Math.sin(a) * 26, 22, 10, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(128, 128, 12, 0, Math.PI * 2);
  ctx.fillStyle = border;
  ctx.fill();
  ctx.globalAlpha = 1;
  return texture(c, own);
}
/** A square cushion, plump in the middle and thin at its seam, its picture laid on from above. */
function cushionShape(width: number, height: number) {
  const geometry = new T.SphereGeometry(1, 28, 12),
    at = geometry.getAttribute("position"),
    square = (v: number, k: number) => Math.sign(v) * Math.abs(v) ** k;
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      y = at.getY(i),
      z = at.getZ(i);
    at.setXYZ(i, (square(x, 0.25) * width) / 2, ((square(y, 0.8) * height) / 2) * (1 - 0.4 * Math.max(Math.abs(x), Math.abs(z)) ** 3), (square(z, 0.25) * width) / 2);
  }
  geometry.computeVertexNormals();
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, 0.5 + at.getX(i) / width, 0.5 - at.getZ(i) / width);
  return geometry;
}
const lathe = (own: Own, profile: [number, number][], segments = 28) =>
  own(new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments));
/** Whether the room's things cast shadows: only where a graphics card draws (set by `build`). */
let casting = true;
function place(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true) {
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow && casting;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
/**
 * A small round soban of our own: a lacquered top with a lip on four curved legs, holding a brass kettle and two
 * white bowls of makgeolli.
 */
function soban(own: Own, wood: T.Material, brass: T.Material, fine: boolean) {
  const group = new T.Group(),
    top = 0.62;
  place(group, lathe(own, [[0, top], [0.86, top], [0.9, top + 0.04], [0.92, top + 0.07], [0.88, top + 0.08], [0.84, top + 0.05], [0, top + 0.05]], 40), wood, 0, 0, 0);
  place(group, lathe(own, [[0.74, top - 0.12], [0.8, top - 0.12], [0.82, top], [0.72, top]], 40), wood, 0, 0, 0, false);
  const leg = own(new T.CylinderGeometry(0.05, 0.07, top - 0.06, 10));
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2,
      m = place(group, leg, wood, Math.cos(a) * 0.66, (top - 0.06) / 2, Math.sin(a) * 0.66);
    // Splayed a little outward, as such legs are.
    m.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  // A brass kettle: a squat body, a lid with a knob, a spout and a bail handle.
  const y = top + 0.05,
    kettle = new T.Group();
  place(kettle, lathe(own, [[0, 0], [0.2, 0], [0.27, 0.06], [0.29, 0.15], [0.25, 0.25], [0.16, 0.3], [0.15, 0.31], [0, 0.31]]), brass, 0, 0, 0);
  place(kettle, lathe(own, [[0, 0.31], [0.15, 0.31], [0.12, 0.35], [0.03, 0.36], [0.04, 0.4], [0, 0.42]]), brass, 0, 0, 0, false);
  const spout = place(kettle, own(new T.CylinderGeometry(0.025, 0.045, 0.26, 10)), brass, 0.31, 0.2, 0);
  spout.rotation.z = -0.9;
  const bail = place(kettle, own(new T.TorusGeometry(0.17, 0.014, 6, 24, Math.PI)), brass, 0, 0.32, 0, false);
  bail.rotation.y = Math.PI / 2;
  kettle.position.set(-0.3, y, -0.12);
  kettle.rotation.y = 0.6;
  group.add(kettle);
  // Two bowls, one with drink in it.
  const china = own(matte(glossy({ color: "#f1ede2", roughness: 0.3 }, 0.6), fine)),
    drink = own(matte(new T.MeshStandardMaterial({ color: "#e8dfc6", roughness: 0.35 }), fine)),
    bowl = lathe(own, [[0, 0], [0.08, 0], [0.09, 0.02], [0.16, 0.05], [0.2, 0.12], [0.19, 0.125], [0.15, 0.06], [0.06, 0.03], [0, 0.03]]);
  for (const [x, z, full] of [[0.32, 0.22, true], [0.2, -0.42, false]] as const) {
    place(group, bowl, china, x, y, z);
    if (full) {
      const top = place(group, own(new T.CircleGeometry(0.16, 24)), drink, x, y + 0.1, z, false);
      top.rotation.x = -Math.PI / 2;
    }
  }
  return group;
}
/** An oil lamp (deungjan) on a turned wooden stand: a dish with a wick and its flame. */
function lamp(own: Own, wood: T.Material, brass: T.Material) {
  const group = new T.Group();
  place(group, lathe(own, [[0, 0], [0.34, 0], [0.36, 0.04], [0.3, 0.08], [0.06, 0.12], [0.05, 0.9], [0.09, 0.94], [0.2, 0.98], [0.2, 1.02], [0, 1.02]]), wood, 0, 0, 0);
  place(group, lathe(own, [[0, 1.02], [0.12, 1.02], [0.17, 1.08], [0.15, 1.09], [0.1, 1.05], [0, 1.05]]), brass, 0, 0, 0, false);
  const flame = new T.Mesh(own(new T.SphereGeometry(0.045, 12, 8)), own(new T.MeshBasicMaterial({ color: "#ffd27a" })));
  flame.scale.set(1, 2.1, 1);
  flame.position.set(0.06, 1.15, 0);
  group.add(flame);
  return { group, flame };
}

/**
 * Seotda's room of its own: an army blanket spread on the maru of a hanok room, silk cushions where the other
 * players sit, a soban with makgeolli at one side and an oil lamp at the other. The cards keep the compact
 * table's layout, so everything lies where it lay on the felt.
 */
export function seotdaRoom(): TableSetting {
  let cushions = new T.Group(),
    seats = -1,
    cushionOf: (s: number) => T.Object3D = () => new T.Group(),
    flame: T.Mesh | null = null,
    glow: T.PointLight | null = null,
    flicker = false,
    lastFlicker = 0;
  return {
    wide: LAYOUTS.compact,
    square: LAYOUTS.compactSquare,
    clear: "#1d140c",
    build(scene, own) {
      cushions = new T.Group();
      seats = -1;
      const fine = capable();
      casting = fine;
      flicker = fine && !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
      // The maru, as far as the eye goes.
      const boards = maruTexture(own);
      boards.repeat.set(9, 9);
      const floor = new T.Mesh(own(new T.PlaneGeometry(40, 40)), own(fine ? glossy({ map: boards, color: "#a8978a", roughness: 0.55 }, 0.25) : unlit(boards, "#c9c2b8")));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = FLOOR;
      floor.receiveShadow = fine;
      // Drawn after what lies on it, so that none of it is painted only to be covered.
      floor.renderOrder = 1;
      scene.add(floor);
      // The blanket: a soft slab of wool, its top where the cards lie.
      const cloth = blanketTexture(own);
      if (!fine) cloth.anisotropy = 1;
      const wool = own(matte(furry({ map: cloth, roughness: 0.97 }, 0.35, 8, 6, own), fine)),
        blanket = new T.Mesh(own(block(BLANKET.half * 2, BLANKET.thick, BLANKET.depth * 2, 0.024)), wool);
      blanket.position.y = -BLANKET.thick / 2;
      blanket.receiveShadow = true;
      scene.add(blanket);
      // One corner folded back over itself, showing the paler underside.
      const under = own(matte(new T.MeshStandardMaterial({ color: "#6a7150", roughness: 0.98 }), fine)),
        fold = new T.Shape([new T.Vector2(0, 0), new T.Vector2(1.05, 0), new T.Vector2(0, 1.05)]),
        flap = new T.Mesh(own(new T.ExtrudeGeometry(fold, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 })), under);
      flap.rotation.x = Math.PI / 2;
      flap.position.set(-BLANKET.half, 0.035, -BLANKET.depth);
      flap.castShadow = fine;
      flap.receiveShadow = true;
      scene.add(flap);
      // Things about the room.
      const pine = own(matte(new T.MeshStandardMaterial({ color: "#5a321c", roughness: 0.55 }), fine)),
        lacquer = own(matte(glossy({ color: "#4a2414", roughness: 0.35 }, 0.6), fine)),
        brass = own(matte(new T.MeshStandardMaterial({ color: "#c49a4c", roughness: 0.3, metalness: 0.75 }), fine)),
        table = soban(own, lacquer, brass, fine);
      table.position.set(-6.75, FLOOR, -3.15);
      scene.add(table);
      const light = lamp(own, pine, brass);
      light.group.position.set(6.9, FLOOR, -3.6);
      scene.add(light.group);
      flame = light.flame;
      // The lamp's warm light only where a graphics card draws; under software drawing a lamp is one light too many.
      glow = null;
      if (fine) {
        glow = new T.PointLight("#ffb862", 2.2, 9, 1.6);
        glow.position.set(6.95, FLOOR + 1.3, -3.6);
        scene.add(glow);
      }
      // Cushions: one for each other player, in silk of its own colour.
      const shape = own(cushionShape(1.55, 0.26)),
        silks = [
          ["#2d4f8a", "#a8343a", "#e8c76a"],
          ["#7c2440", "#2f6a58", "#ecd48a"],
          ["#2f6a4f", "#c4703a", "#f0dca0"],
        ].map(([base, border, flower]) => own(matte(new T.MeshStandardMaterial({ map: cushionTexture(own, base, border, flower), roughness: 0.45, metalness: 0.05 }), fine))),
        knot = own(new T.SphereGeometry(0.06, 10, 8));
      cushionOf = (s) => {
        const group = new T.Group(),
          silk = silks[(s - 1) % silks.length];
        place(group, shape, silk, 0, 0.12, 0);
        place(group, knot, silk, 0, 0.25, 0, false);
        return group;
      };
      scene.add(cushions);
    },
    place(model: TableView, row: (seat: number) => SeatRow) {
      if (seats === model.seats.length) return;
      seats = model.seats.length;
      cushions.clear();
      // Behind each other player's cards, beyond the blanket's far edge.
      for (let s = 1; s < seats; s++) {
        const { x } = row(s),
          cushion = cushionOf(s);
        cushion.position.set(x * 1.12, FLOOR, -BLANKET.depth - 0.95);
        cushion.rotation.y = (x / 9) * 0.5 + (s % 2 ? 0.06 : -0.05);
        cushions.add(cushion);
      }
    },
    frame(now) {
      // The flame wavers, a few times a second.
      if (!flicker || !flame || now - lastFlicker < 70) return false;
      lastFlicker = now;
      const k = Math.sin(now / 90) * 0.5 + Math.sin(now / 37) * 0.3 + Math.sin(now / 211) * 0.2;
      flame.scale.set(1 + k * 0.08, 2.1 + k * 0.25, 1 + k * 0.08);
      if (glow) glow.intensity = 2.2 * 0.9 * (1 + k * 0.08);
      return true;
    },
  };
}
