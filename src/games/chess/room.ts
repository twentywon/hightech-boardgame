import * as T from "three";
import type { Color } from "chess.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, stuff, veneer, weave, wood } from "../../engine/scene-utils";
import { squares, toWorld } from "./coordinates";

/**
 * Where chess is played: a heavy inlaid board on its moulded plinth, on a walnut table in a club's library. A rug
 * on a parquet floor, a leather club chair at each side of the table, low bookcases behind them; on the table a
 * chess clock, a green-shaded lamp, a cup of tea and the score sheet. All painted and modelled in code.
 */

/** Registers a resource with the view that must dispose it. */
export type Own = <R extends { dispose(): void }>(resource: R) => R;

/** The table's top, where the taken pieces stand; the floor of the room. */
export const TABLE_TOP = -0.25;
const FLOOR = -3.2;

function paint(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  // Painted by the processor: canvases left to the graphics process held the first frame back under software drawing.
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function picture(own: Own, c: HTMLCanvasElement, colour = true) {
  const t = own(new T.CanvasTexture(c));
  if (colour) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const put = (parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = false) => {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = shadow;
  parent.add(m);
  return m;
};
const lathe = (own: Own, profile: [number, number][], segments = 28) =>
  own(new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments));

/** The rim's lettering and its inlaid lines, painted on one frame laid round the squares. */
function framePrint(own: Own, size: number) {
  const px = 1024,
    { c, ctx } = paint(px),
    k = px / size,
    at = (v: number) => px / 2 + v * k;
  // Stringing: a pale boxwood line and a dark one round the squares, and a pale line near the outer edge.
  const line = (half: number, width: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * k;
    ctx.strokeRect(at(-half), at(-half), 2 * half * k, 2 * half * k);
  };
  line(3.155, 0.03, "rgba(250,232,196,0.95)");
  line(3.19, 0.016, "rgba(60,34,18,0.85)");
  line(3.47, 0.012, "rgba(250,232,196,0.7)");
  ctx.fillStyle = "#3b2414";
  ctx.font = `${Math.round(0.19 * k)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const letter = (text: string, x: number, z: number, turned: boolean) => {
    ctx.save();
    ctx.translate(at(x), at(z));
    if (turned) ctx.rotate(Math.PI);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  // Files along the near edge read from white's seat, along the far edge from black's; ranks likewise.
  for (let i = 0; i < 8; i++) {
    const v = (i - 3.5) * 0.78;
    letter("abcdefgh"[i], v, 3.33, false);
    letter("abcdefgh"[i], v, -3.33, true);
    letter(String(8 - i), -3.33, v, false);
    letter(String(8 - i), 3.33, v, true);
  }
  return picture(own, c);
}

/**
 * The board: maple and walnut squares (merged into one mesh a colour) in a rim of warm polished wood, lettered and
 * strung with inlaid lines, the whole standing on a darker moulded plinth on the table. The rim's top is at 0.175.
 */
export function chessBoard(scene: T.Object3D, own: Own) {
  const half = 3.525,
    rimWood = own(glossy({ map: own(wood(false)), color: "#b27450", roughness: 0.34 }, 0.35));
  // A heavy board: the rim's body reaches down to the table, on a plinth a little wider than it.
  put(scene, own(block(2 * half, 0.425, 2 * half, 0.05)), rimWood, 0, 0.175 - 0.2125, 0, true);
  const plinth = own(new T.MeshStandardMaterial({ map: own(wood(true, 0.7)), color: "#6b4430", roughness: 0.42 }));
  put(scene, own(block(2 * half + 0.3, 0.1, 2 * half + 0.3, 0.035)), plinth, 0, TABLE_TOP + 0.05, 0, true);
  put(scene, own(block(2 * half + 0.14, 0.06, 2 * half + 0.14, 0.025)), plinth, 0, TABLE_TOP + 0.12, 0);
  // Squares of maple and walnut veneer, each cut from another part of its sheet so that no two have the same grain.
  const light = own(new T.MeshStandardMaterial({ map: own(veneer(false)), roughness: 0.36, color: "#fff4e0" })),
    dark = own(new T.MeshStandardMaterial({ map: own(veneer(true)), roughness: 0.36, color: "#9a7458" }));
  let cut = 7;
  const sheet = () => (cut = (cut * 1664525 + 1013904223) >>> 0) / 4294967296;
  const sets: [T.BufferGeometry[], T.BufferGeometry[]] = [[], []];
  for (const s of squares) {
    const tile = new T.BoxGeometry(0.78, 0.035, 0.78),
      uv = tile.getAttribute("uv"),
      u0 = sheet() * 0.5,
      v0 = sheet() * 0.5,
      p = toWorld(s);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    tile.translate(p.x, 0.192, p.z);
    sets[(s.charCodeAt(0) - 97 + Number(s[1]) - 1) % 2 === 0 ? 0 : 1].push(tile);
  }
  sets.forEach((list, i) => {
    const merged = own(mergeGeometries(list)!);
    list.forEach((g) => g.dispose());
    put(scene, merged, i === 0 ? dark : light, 0, 0, 0);
  });
  // The lettering and the stringing on the rim: a frame of print laid just over it, round the squares.
  const size = 2 * half,
    outer = new T.Shape(),
    hole = new T.Path();
  outer.moveTo(-half, -half);
  outer.lineTo(half, -half);
  outer.lineTo(half, half);
  outer.lineTo(-half, half);
  hole.moveTo(-3.125, -3.125);
  hole.lineTo(-3.125, 3.125);
  hole.lineTo(3.125, 3.125);
  hole.lineTo(3.125, -3.125);
  outer.holes.push(hole);
  const frame = own(new T.ShapeGeometry(outer)),
    at = frame.getAttribute("position"),
    uv = frame.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, 0.5 + at.getX(i) / size, 0.5 + at.getY(i) / size);
  const print = put(
    scene,
    frame,
    own(new T.MeshStandardMaterial({ map: framePrint(own, size), transparent: true, depthWrite: false, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 })),
    0,
    0.1762,
    0,
  );
  print.rotation.x = -Math.PI / 2;
}

/** The dial of a chess clock: white enamel, numerals, a red flag at twelve, the hands at `h`:`m`. */
function dial(own: Own, h: number, m: number) {
  const { c, ctx } = paint(256);
  ctx.fillStyle = "#f6f1e4";
  ctx.beginPath();
  ctx.arc(128, 128, 126, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(128, 128);
  ctx.strokeStyle = "#2a2520";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2,
      long = i % 5 === 0;
    ctx.lineWidth = long ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * (long ? 92 : 102), -Math.cos(a) * (long ? 92 : 102));
    ctx.lineTo(Math.sin(a) * 112, -Math.cos(a) * 112);
    ctx.stroke();
  }
  ctx.fillStyle = "#2a2520";
  ctx.font = "bold 30px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [n, a] of [[12, 0], [3, 0.5], [6, 1], [9, 1.5]] as const) ctx.fillText(String(n), Math.sin(a * Math.PI) * 72, -Math.cos(a * Math.PI) * 72);
  // The flag that falls when the time is up.
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(4, -112);
  ctx.lineTo(18, -100);
  ctx.lineTo(4, -92);
  ctx.fill();
  const hand = (turn: number, length: number, width: number) => {
    ctx.save();
    ctx.rotate(turn * Math.PI * 2);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -length);
    ctx.stroke();
    ctx.restore();
  };
  hand((h + m / 60) / 12, 58, 8);
  hand(m / 60, 92, 5);
  ctx.fillStyle = "#2a2520";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  return picture(own, c);
}

/** The red field of the rug, its medallion and borders: our own pattern. */
function rugMap(own: Own) {
  const w = 1024,
    h = 768,
    { c, ctx } = paint(w, h),
    rnd = noise(31);
  ctx.fillStyle = "#5c1b18";
  ctx.fillRect(0, 0, w, h);
  // A lattice of small diamonds over the field.
  ctx.strokeStyle = "rgba(214,170,96,0.28)";
  ctx.lineWidth = 3;
  for (let i = -20; i < 40; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 48, 0);
    ctx.lineTo(i * 48 + h, h);
    ctx.moveTo(i * 48, h);
    ctx.lineTo(i * 48 + h, 0);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(30,40,70,0.55)";
  for (let x = 24; x < w; x += 48)
    for (let y = 24; y < h; y += 48) {
      ctx.beginPath();
      ctx.arc(x + ((y / 48) % 2 ? 24 : 0), y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  // The medallion: an octagon of navy with a gold star.
  const star = (cx: number, cy: number, r: number, inner: number, points: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2,
        rr = i % 2 ? inner : r;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  star(w / 2, h / 2, 230, 200, 8, "#a8844f");
  star(w / 2, h / 2, 212, 186, 8, "#1d2232");
  star(w / 2, h / 2, 150, 70, 8, "#a8844f");
  star(w / 2, h / 2, 110, 50, 8, "#7a2420");
  star(w / 2, h / 2, 40, 18, 8, "#c9b083");
  // Borders: a dark navy band with small muted rosettes between thin tan and red guard lines.
  const band = (inset: number, width: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.strokeRect(inset + width / 2, inset + width / 2, w - 2 * inset - width, h - 2 * inset - width);
  };
  band(0, 16, "#8c6f4c");
  band(16, 10, "#5a1a17");
  band(26, 52, "#1d2232");
  band(78, 6, "#9c7c4e");
  band(84, 10, "#4e1714");
  for (let x = 60; x < w - 40; x += 44) for (const y of [52, h - 52]) star(x, y, 11, 5, 6, "rgba(176,140,86,0.8)");
  for (let y = 96; y < h - 80; y += 44) for (const x of [52, w - 52]) star(x, y, 11, 5, 6, "rgba(176,140,86,0.8)");
  // Wear and the pile's mottle.
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.03 + rnd() * 0.05})` : `rgba(255,230,190,${0.02 + rnd() * 0.04})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 4);
  }
  return picture(own, c);
}

/** Buttoned leather, for the club chairs: diamond tufts with their creases. */
function leatherMap(own: Own) {
  const { c, ctx } = paint(256),
    rnd = noise(11);
  ctx.fillStyle = "#8a3a2c";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(40,10,6,${0.05 + rnd() * 0.08})` : `rgba(255,200,170,${0.03 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 8, 2 + rnd() * 8);
  }
  ctx.strokeStyle = "rgba(40,10,6,0.45)";
  ctx.lineWidth = 3;
  for (let x = 0; x <= 256; x += 64)
    for (let y = 0; y <= 256; y += 64)
      for (const [dx, dy] of [[32, 32], [-32, 32]]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();
      }
  for (let x = 0; x <= 256; x += 32)
    for (let y = (x / 32) % 2 ? 32 : 0; y <= 256; y += 64) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
      g.addColorStop(0, "rgba(25,6,4,0.8)");
      g.addColorStop(1, "rgba(25,6,4,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 12, y - 12, 24, 24);
    }
  const t = picture(own, c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}

/** A lined score sheet with its heading. */
function sheetMap(own: Own) {
  const { c, ctx } = paint(256, 320);
  ctx.fillStyle = "#f4efe2";
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = "#3a3a46";
  ctx.font = "bold 26px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText("기 보", 128, 38);
  ctx.strokeStyle = "rgba(60,70,110,0.5)";
  ctx.lineWidth = 2;
  for (let y = 60; y < 310; y += 20) {
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(240, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(48, 50);
  ctx.lineTo(48, 310);
  ctx.moveTo(146, 50);
  ctx.lineTo(146, 310);
  ctx.stroke();
  // A few moves written in pencil.
  ctx.fillStyle = "rgba(50,50,60,0.75)";
  ctx.font = "italic 15px Georgia, serif";
  ctx.textAlign = "left";
  ["e4  e5", "Nf3  Nc6", "Bb5  a6", "Ba4  Nf6"].forEach((row, i) => {
    const [a, b] = row.split("  ");
    ctx.fillText(String(i + 1), 24, 76 + i * 20);
    ctx.fillText(a, 58, 76 + i * 20);
    ctx.fillText(b, 156, 76 + i * 20);
  });
  return picture(own, c);
}

export interface Clock {
  /** Raises the button of the side whose clock runs (`turn`), presses the other's; `t` of the way there. */
  set(turn: Color, t?: number): void;
}

/**
 * The room round the board. `rich` (a graphics card draws) adds what costs most and shows least: the table's legs
 * and apron, the lamp's own light, the rug's weave.
 */
export function clubRoom(scene: T.Object3D, own: Own, rich: boolean): Clock {
  // The table: a slab of polished walnut with a rounded edge.
  const walnut = own(glossy({ map: own(wood(true, 0.85)), color: "#9a6444", roughness: 0.36 }, 0.5));
  put(scene, own(block(12.6, 0.3, 9.8, 0.1, 3)), walnut, 0, TABLE_TOP - 0.15, 0);
  if (rich) {
    // Its apron and four turned legs, seen only past its edges.
    const legWood = own(new T.MeshStandardMaterial({ map: own(wood(true, 0.7)), color: "#7d4c33", roughness: 0.45 }));
    put(scene, own(block(11.6, 0.5, 8.8, 0.05)), legWood, 0, TABLE_TOP - 0.55, 0);
    const leg = lathe(own, [[0, 0], [0.26, 0], [0.3, 0.12], [0.2, 0.3], [0.16, 0.9], [0.24, 1.4], [0.26, 1.75], [0.2, 2.0], [0.3, 2.15], [0.32, 2.6], [0, 2.6]], 20);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(scene, leg, legWood, sx * 5.55, FLOOR, sz * 4.15);
  }
  // The floor: oiled parquet, and a rug under the table.
  const floor = put(scene, own(new T.PlaneGeometry(70, 70)), own(new T.MeshStandardMaterial({ ...stuff("boards", "#6a4630", 9, own), roughness: 0.55 })), 0, FLOOR, 0);
  floor.rotation.x = -Math.PI / 2;
  const rug = put(scene, own(new T.PlaneGeometry(21, 15.75)), own(new T.MeshStandardMaterial({ map: rugMap(own), roughness: 0.95, ...(rich ? weave(12, 9, own, 0.6) : {}) })), 0, FLOOR + 0.02, 0);
  rug.rotation.x = -Math.PI / 2;
  // A leather club chair at each side, facing the table.
  {
    const leather = own(new T.MeshStandardMaterial({ map: leatherMap(own), color: "#8e5a48", roughness: 0.5 })),
      seat = own(block(2.7, 1.0, 2.3, 0.22)),
      cushion = own(block(1.9, 0.3, 1.9, 0.14)),
      back = own(block(2.7, 1.7, 0.55, 0.24)),
      arm = own(block(0.5, 1.2, 2.3, 0.2)),
      roll = own(new T.CylinderGeometry(0.33, 0.33, 2.3, 18).rotateX(Math.PI / 2));
    for (const side of [-1, 1]) {
      const chair = new T.Group();
      chair.position.set(0, FLOOR, side * 7.6);
      if (side > 0) chair.rotation.y = Math.PI;
      put(chair, seat, leather, 0, 0.62, 0);
      put(chair, cushion, leather, 0, 1.27, 0.1);
      put(chair, back, leather, 0, 1.95, -1.05).rotation.x = -0.1;
      for (const sx of [-1, 1]) {
        put(chair, arm, leather, sx * 1.25, 1.2, 0);
        put(chair, roll, leather, sx * 1.3, 1.8, 0);
      }
      scene.add(chair);
    }
  }
  // Low bookcases behind the chairs, full of books.
  {
    const caseWood = own(new T.MeshStandardMaterial({ map: own(wood(true, 0.8)), color: "#6f4430", roughness: 0.5 })),
      length = 30,
      height = 3.6,
      shelves = [0.18, 1.55, 2.92],
      book = own(new T.BoxGeometry(1, 1, 1)),
      spine = paint(64, 128),
      rnd = noise(77);
    // Tooled bands across the spines, lighter than the leather.
    spine.ctx.fillStyle = "#ffffff";
    spine.ctx.fillRect(0, 0, 64, 128);
    spine.ctx.fillStyle = "#c9b48a";
    for (const y of [14, 22, 100, 108]) spine.ctx.fillRect(0, y, 64, 4);
    spine.ctx.fillStyle = "rgba(0,0,0,0.25)";
    spine.ctx.fillRect(10, 40, 44, 40);
    const books = own(new T.MeshStandardMaterial({ map: picture(own, spine.c), roughness: 0.7 })),
      colours = ["#5b1f1c", "#1f3a2c", "#24304f", "#6a4a24", "#3d2318", "#7a5a2a", "#2d2420", "#4a1830"].map((c) => new T.Color(c));
    for (const side of [-1, 1]) {
      const z = side * 9.0;
      put(scene, own(new T.BoxGeometry(length, height, 0.12)), caseWood, 0, FLOOR + height / 2, z + side * 0.4);
      for (const y of shelves) put(scene, own(new T.BoxGeometry(length, 0.1, 0.85)), caseWood, 0, FLOOR + y - 0.05, z);
      put(scene, own(new T.BoxGeometry(length, 0.2, 0.9)), caseWood, 0, FLOOR + height + 0.1, z);
      for (let x = -length / 2; x <= length / 2 + 0.01; x += 3) put(scene, own(new T.BoxGeometry(0.12, height, 0.85)), caseWood, x, FLOOR + height / 2, z);
      // The books: one instanced mesh a bookcase, each with its own colour, height and lean.
      const count = 3 * 110,
        rows = new T.InstancedMesh(book, books, count),
        m = new T.Matrix4(),
        q = new T.Quaternion(),
        e = new T.Euler();
      let n = 0;
      for (const y of shelves)
        for (let x = -length / 2 + 0.1; x < length / 2 - 0.2 && n < count; ) {
          const w = 0.12 + rnd() * 0.12,
            h = 0.85 + rnd() * 0.35,
            d = 0.55 + rnd() * 0.15;
          // Skip the uprights.
          const post = Math.round((x + length / 2) / 3) * 3 - length / 2;
          if (Math.abs(x + w / 2 - post) < 0.12 + w / 2) {
            x += 0.16;
            continue;
          }
          e.set(0, 0, rnd() < 0.06 ? 0.12 : 0);
          q.setFromEuler(e);
          m.compose(new T.Vector3(x + w / 2, FLOOR + y + h / 2, z - side * (0.4 - d / 2) + side * 0.02), q, new T.Vector3(w, h, d));
          rows.setMatrixAt(n, m);
          rows.setColorAt(n, colours[Math.floor(rnd() * colours.length)]);
          n++;
          x += w + 0.01;
        }
      rows.count = n;
      rows.receiveShadow = true;
      scene.add(rows);
    }
  }
  // On the table, beside the board and clear of where the taken pieces stand: at white's right a lamp by the middle
  // and a chess clock beyond it, at its left a cup of tea and, far off, the score sheet. Nothing tall stands near
  // either player's corner, where the lettering of the panel lies over the table (the table turns for black).
  const brass = own(glossy({ color: "#c9a14a", metalness: 0.85, roughness: 0.32 }, 0.4));
  const clockButtons: T.Mesh[] = [];
  {
    const clock = new T.Group();
    clock.position.set(5.2, TABLE_TOP, -1.95);
    // Its dials look across the board.
    clock.rotation.y = Math.PI;
    clock.updateMatrixWorld();
    const profile = new T.Shape();
    profile.moveTo(-0.32, 0);
    profile.lineTo(0.32, 0);
    profile.lineTo(0.16, 0.78);
    profile.lineTo(-0.32, 0.78);
    profile.closePath();
    const body = own(new T.ExtrudeGeometry(profile, { depth: 1.6, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).translate(0, 0, -0.8)),
      caseWood = own(glossy({ map: own(wood(true, 0.6)), color: "#8a5236", roughness: 0.3 }, 0.6));
    put(clock, body, caseWood, 0, 0.03, 0, true);
    const normal = new T.Vector3(0.78, 0.16, 0).normalize(),
      face = own(new T.CircleGeometry(0.27, 40)),
      bezel = own(new T.TorusGeometry(0.28, 0.03, 8, 40));
    [[4, 52], [4, 47]].forEach(([h, m], i) => {
      const z = i ? -0.43 : 0.43,
        p = new T.Vector3(0.295, 0.42, z),
        disc = put(clock, face, own(new T.MeshStandardMaterial({ map: dial(own, h, m), roughness: 0.25 })), p.x, p.y, p.z),
        ring = put(clock, bezel, brass, p.x, p.y, p.z, true);
      disc.lookAt(clock.localToWorld(p.clone().add(normal)));
      ring.lookAt(clock.localToWorld(p.clone().add(normal)));
    });
    const button = own(new T.CylinderGeometry(0.075, 0.085, 0.16, 16));
    for (const z of [0.43, -0.43]) clockButtons.push(put(clock, button, brass, -0.08, 0.81, z, true));
    scene.add(clock);
  }
  {
    // A banker's lamp: a brass foot and stem, a shade of green glass lit from inside.
    const lamp = new T.Group();
    lamp.position.set(5.65, TABLE_TOP, -0.2);
    lamp.rotation.y = 0.35;
    put(lamp, lathe(own, [[0, 0], [0.5, 0], [0.52, 0.05], [0.42, 0.12], [0.12, 0.18], [0, 0.2]], 28), brass, 0, 0, 0, true);
    put(lamp, own(new T.CylinderGeometry(0.035, 0.035, 1.1, 10)), brass, 0, 0.72, 0, true);
    const shade = own(new T.CylinderGeometry(0.34, 0.34, 1.25, 24, 1, true, Math.PI / 2, Math.PI).rotateZ(Math.PI / 2)),
      glass = own(new T.MeshStandardMaterial({ color: "#1d6a3c", roughness: 0.15, metalness: 0.1, emissive: "#0e3a20", emissiveIntensity: 0.6, side: T.DoubleSide }));
    put(lamp, shade, glass, 0, 1.3, 0.12, true);
    const glow = put(lamp, own(new T.PlaneGeometry(1.15, 0.5)), own(new T.MeshBasicMaterial({ color: "#ffe6a8" })), 0, 1.06, 0.12);
    glow.rotation.x = Math.PI / 2;
    if (rich) {
      const bulb = new T.PointLight("#ffd79a", 2.2, 7, 2);
      bulb.position.set(0, 0.95, 0.12);
      lamp.add(bulb);
    }
    scene.add(lamp);
  }
  {
    // A cup of tea on its saucer.
    const china = own(glossy({ color: "#f3f1ea", roughness: 0.22 }, 0.8)),
      x = -5.05,
      z = 1.3,
      y = TABLE_TOP;
    put(scene, lathe(own, [[0, 0], [0.3, 0], [0.42, 0.04], [0.46, 0.07], [0.43, 0.075], [0.3, 0.05], [0, 0.05]]), china, x, y, z, true);
    put(scene, lathe(own, [[0, 0.05], [0.13, 0.05], [0.15, 0.09], [0.24, 0.2], [0.27, 0.36], [0.25, 0.36], [0.22, 0.22], [0.12, 0.12], [0, 0.12]]), china, x, y, z, true);
    const tea = put(scene, own(new T.CircleGeometry(0.235, 24)), own(new T.MeshStandardMaterial({ color: "#5a2a10", roughness: 0.1 })), x, y + 0.31, z);
    tea.rotation.x = -Math.PI / 2;
    const handle = put(scene, own(new T.TorusGeometry(0.08, 0.022, 8, 16, Math.PI * 1.3)), china, x + 0.28, y + 0.25, z, true);
    handle.rotation.z = -Math.PI * 0.65;
  }
  {
    // The score sheet and a pencil, at white's left beyond where black's taken pieces stand.
    const sheet = put(scene, own(new T.BoxGeometry(1.0, 0.02, 1.25)), own(new T.MeshStandardMaterial({ map: sheetMap(own), roughness: 0.85 })), -5.0, TABLE_TOP + 0.01, -4.15);
    sheet.rotation.y = 0.12;
    // The box's top face carries the sheet: the others take its edge colour from the same picture's margin.
    const pencil = put(scene, own(new T.CylinderGeometry(0.025, 0.025, 1.05, 6).rotateZ(Math.PI / 2)), own(new T.MeshStandardMaterial({ color: "#d9a330", roughness: 0.5 })), -4.7, TABLE_TOP + 0.045, -4.0, true);
    pencil.rotation.y = -0.5;
  }
  return {
    set(turn, t = 1) {
      // White sits at +z: while white's clock runs, white's button stands up and black's is pressed down. The clock
      // is turned round, so its first button is on black's half.
      clockButtons.forEach((b, i) => {
        const up = (i === 0) === (turn === "b"),
          from = b.userData.up === undefined ? up : b.userData.up;
        const lift = (v: boolean) => (v ? 0.81 : 0.75);
        b.position.y = lift(from) + (lift(up) - lift(from)) * t;
        if (t >= 1) b.userData.up = up;
      });
    },
  };
}
