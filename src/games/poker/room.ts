import * as T from "three";
import { block, capable, glossy, weave, wood, woodPhoto } from "../../engine/scene-utils";
import type { TableView } from "../cards/game";
import { LAYOUTS, type Layout, type SeatRow, type TableSetting } from "../cards/table-view";

type Own = <X extends { dispose(): void }>(resource: X) => X;
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
/**
 * An eight-sided table: half its length and depth, how far its corners are cut, and where its middle lies from
 * front to back. Its felt holds every card, label and pile of the layout it is drawn for.
 */
export interface Octagon {
  half: number;
  depth: number;
  cut: number;
  z: number;
}
export const TABLE_WIDE: Octagon = { half: 6.45, depth: 3.85, cut: 1.35, z: -0.12 };
export const TABLE_SQUARE: Octagon = { half: 4.25, depth: 3.95, cut: 1.0, z: -0.28 };
const RAIL = 0.62;
/** Whether the chairs cast shadows: only where a graphics card draws (set by `build`). */
let casting = true;

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
function sequence(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** The corners of an octagon `grow` units out from the felt's edge, in the plane of a shape (its y is -z). */
function corners(o: Octagon, grow: number) {
  const a = o.half + grow,
    b = o.depth + grow,
    c = o.cut + grow * (2 - Math.SQRT2),
    cz = -o.z;
  return [
    [-a + c, cz - b],
    [a - c, cz - b],
    [a, cz - b + c],
    [a, cz + b - c],
    [a - c, cz + b],
    [-a + c, cz + b],
    [-a, cz + b - c],
    [-a, cz - b + c],
  ].map(([x, y]) => new T.Vector2(x, y));
}
function outline<P extends T.Path>(path: P, o: Octagon, grow: number) {
  const points = corners(o, grow);
  path.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) path.lineTo(p.x, p.y);
  path.lineTo(points[0].x, points[0].y);
  return path;
}
/**
 * What is printed on the felt (one pixel a hundredth of a unit... at `scale` to a unit): a gold line round the
 * playing area, the game's two lines between the rows and the four suits under them, a soft light in the middle.
 */
function printTexture(own: Own, o: Octagon, lines: [string, string]) {
  const scale = 80,
    w = Math.round(o.half * 2 * scale),
    h = Math.round(o.depth * 2 * scale),
    { c, ctx } = canvas(w, h),
    px = (x: number) => w / 2 + x * scale,
    pz = (z: number) => h / 2 + (z - o.z) * scale,
    rand = sequence(3);
  // Deep green baize with a fine nap.
  ctx.fillStyle = "#1d5a46";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 11; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,20,10,0.06)";
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
  // The lamp's light falls on the middle of the felt; the edges stay darker.
  const shade = ctx.createRadialGradient(w / 2, h / 2, h * 0.15, w / 2, h / 2, w * 0.62);
  shade.addColorStop(0, "rgba(255, 240, 200, 0.07)");
  shade.addColorStop(0.6, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 10, 5, 0.32)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  // The gold line, an octagon drawn in from the rail.
  const inner = corners({ ...o, z: 0 }, -0.32);
  ctx.strokeStyle = "rgba(226, 196, 118, 0.6)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  inner.forEach((p, i) => (i ? ctx.lineTo(w / 2 + p.x * scale, h / 2 - p.y * scale) : ctx.moveTo(w / 2 + p.x * scale, h / 2 - p.y * scale)));
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = "rgba(226, 196, 118, 0.25)";
  ctx.lineWidth = 2;
  const second = corners({ ...o, z: 0 }, -0.42);
  ctx.beginPath();
  second.forEach((p, i) => (i ? ctx.lineTo(w / 2 + p.x * scale, h / 2 - p.y * scale) : ctx.moveTo(w / 2 + p.x * scale, h / 2 - p.y * scale)));
  ctx.closePath();
  ctx.stroke();
  // The game's lines where the felt said them before, between the rows.
  ctx.fillStyle = "rgba(233, 214, 160, 0.62)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(scale * 0.28)}px ${FONT}`;
  ctx.fillText(lines[0], px(0), pz(-0.96));
  ctx.font = `600 ${Math.round(scale * 0.16)}px ${FONT}`;
  ctx.fillStyle = "rgba(233, 214, 160, 0.46)";
  ctx.fillText(lines[1], px(0), pz(-0.69));
  return texture(c, own);
}
/**
 * Herringbone parquet of dark wood: short boards cut from the wood photograph, laid in zigzag rows with thin seams.
 */
function parquetTexture(own: Own) {
  const size = 512,
    { c, ctx } = canvas(size, size),
    rand = sequence(17);
  ctx.fillStyle = "#4a2c1a";
  ctx.fillRect(0, 0, size, size);
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  woodPhoto("dark", (image) => {
    const long = 128,
      short = 32;
    // Boards at a right angle to each other, stepped along the diagonal so that the picture repeats.
    for (let row = -4; row < 8; row++)
      for (let k = -2; k < 10; k++)
        for (const flip of [0, 1]) {
          const x = k * short * 2 + (flip ? short : 0),
            y = row * long + k * short * 2 - (flip ? 0 : short) - 2 * long;
          ctx.save();
          ctx.translate(x, y);
          if (flip) {
            ctx.translate(0, short);
            ctx.rotate(-Math.PI / 2);
          }
          ctx.beginPath();
          ctx.rect(0, 0, flip ? short : long, flip ? long : short);
          ctx.clip();
          ctx.drawImage(image, -rand() * 300, -rand() * 300, 512, 512);
          ctx.fillStyle = `rgba(${40 + rand() * 30}, ${20 + rand() * 16}, 8, ${0.18 + rand() * 0.2})`;
          ctx.fill();
          ctx.strokeStyle = "rgba(12, 6, 2, 0.75)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
    t.needsUpdate = true;
  });
  return t;
}
/** A brass cup holder sunk in the rail, a dark well inside it. */
function cupHolder(own: Own, brass: T.Material, dark: T.Material) {
  const group = new T.Group(),
    ring = new T.Mesh(own(new T.TorusGeometry(0.22, 0.03, 8, 28)), brass),
    well = new T.Mesh(own(new T.CircleGeometry(0.21, 24)), dark);
  ring.rotation.x = -Math.PI / 2;
  well.rotation.x = -Math.PI / 2;
  well.position.y = -0.005;
  group.add(ring, well);
  return group;
}
/** A captain's chair seen from the table: a curved wooden back rail on spindles, a padded leather seat. */
function chairParts(own: Own) {
  return {
    rail: own(new T.TorusGeometry(0.95, 0.07, 8, 24, Math.PI * 0.8)),
    spindle: own(new T.CylinderGeometry(0.035, 0.04, 0.85, 8)),
    seat: own(block(1.8, 0.22, 1.5, 0.12)),
    frame: own(block(1.9, 0.16, 1.6, 0.06)),
  };
}
function chair(parts: ReturnType<typeof chairParts>, wood: T.Material, leather: T.Material) {
  const group = new T.Group(),
    add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
      const m = new T.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = casting;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
  add(parts.frame, wood, 0, -1.25, 0.1);
  add(parts.seat, leather, 0, -1.08, 0.1);
  const rail = add(parts.rail, wood, 0, -0.2, 0.1);
  rail.rotation.x = Math.PI / 2;
  rail.rotation.z = Math.PI * 0.1;
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (0.15 + (k / 6) * 0.7);
    add(parts.spindle, wood, Math.cos(a) * 0.95, -0.62, 0.1 + Math.sin(a) * 0.95);
  }
  return group;
}

/**
 * Seven-card stud's room of its own: an eight-sided card table with green baize printed in gold, a walnut
 * racetrack and a padded cognac leather rail with brass cup holders, captain's chairs for the other players, a
 * herringbone floor and a side table with a decanter. The cards keep the felt's layouts.
 */
export function studRoom(lines: [string, string]): TableSetting {
  let tables = new Map<Octagon, T.Group>(),
    chairs = new T.Group(),
    seats = -1,
    shown: Layout | null = null,
    chairOf: () => T.Group = () => new T.Group();
  const shapeOf = (layout: Layout) => (layout === LAYOUTS.square ? TABLE_SQUARE : TABLE_WIDE);
  return {
    wide: LAYOUTS.wide,
    square: LAYOUTS.square,
    clear: "#140d09",
    build(scene, own) {
      tables = new Map();
      chairs = new T.Group();
      seats = -1;
      shown = null;
      const fine = capable(),
        floorY = -3.1,
        walnut = own(matte(glossy({ map: own(wood(true)), color: "#a86a40", roughness: 0.3 }, 0.7), fine)),
        leather = own(matte(glossy({ color: "#7a3f1c", roughness: 0.48 }, 0.25), fine)),
        apron = own(matte(new T.MeshStandardMaterial({ map: own(wood(true)), roughness: 0.6 }), fine)),
        brass = own(matte(new T.MeshStandardMaterial({ color: "#c9a85c", roughness: 0.3, metalness: 0.75 }), fine)),
        dark = own(matte(new T.MeshStandardMaterial({ color: "#120c08", roughness: 0.8 }), fine));
      casting = fine;
      const tableOf = (o: Octagon) => {
        const table = new T.Group(),
          // The cloth is one picture with its print: the shape's own coordinates (table units, y running to the
          // far side) are its uv, brought onto the picture.
          print = printTexture(own, o, lines);
        print.repeat.set(1 / (o.half * 2), 1 / (o.depth * 2));
        print.offset.set(0.5, 0.5 + o.z / (o.depth * 2));
        const felt = new T.Mesh(own(new T.ShapeGeometry(outline(new T.Shape(), o, 0.02))), own(matte(new T.MeshStandardMaterial({ map: print, roughness: 0.95, ...weave(0.8, 0.8, own) }), fine)));
        if (!fine) print.anisotropy = 1;
        felt.rotation.x = -Math.PI / 2;
        felt.receiveShadow = true;
        table.add(felt);
        const band = (inner: number, outer: number, depth: number, y: number, material: T.Material, bevel: number) => {
          const shape = outline(new T.Shape(), o, outer);
          shape.holes.push(outline(new T.Path(), o, inner));
          const mesh = new T.Mesh(
            own(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4 })),
            material,
          );
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = y;
          // The rail and the racetrack shade the cloth where a graphics card draws.
          mesh.castShadow = fine && y > -0.5;
          mesh.receiveShadow = true;
          table.add(mesh);
          return mesh;
        };
        // A brass line where the felt meets the wood, the walnut racetrack, the padded rail, the apron.
        band(-0.03, 0.02, 0.01, -0.005, brass, 0);
        band(0.02, 0.36, 0.02, -0.02, walnut, 0.015);
        band(0.36, 0.36 + RAIL, 0.1, 0.03, leather, 0.11);
        // The apron and the pedestal under the rail, only where a graphics card draws: seen at most at the very
        // edge of the picture, they are not worth their cost under software drawing.
        if (fine) band(0.42, 0.36 + RAIL - 0.04, 0.9, -1.0, apron, 0.03);
        // Cup holders in the rail at the four cut corners.
        const ring = corners(o, 0.36 + RAIL / 2);
        for (const i of [1, 3, 5, 7]) {
          const a = ring[i],
            b = ring[(i + 1) % 8],
            holder = cupHolder(own, brass, dark);
          holder.position.set((a.x + b.x) / 2, 0.255, -(a.y + b.y) / 2);
          table.add(holder);
        }
        const foot = new T.Mesh(own(new T.CylinderGeometry(1.2, 1.9, -floorY - 0.9, 8)), apron);
        foot.position.set(0, (floorY - 0.9) / 2, o.z);
        foot.rotation.y = Math.PI / 8;
        if (fine) table.add(foot);
        table.visible = false;
        scene.add(table);
        return table;
      };
      tables.set(TABLE_WIDE, tableOf(TABLE_WIDE));
      tables.set(TABLE_SQUARE, tableOf(TABLE_SQUARE));
      const boards = parquetTexture(own);
      boards.repeat.set(14, 14);
      const floor = new T.Mesh(own(new T.PlaneGeometry(60, 60)), own(fine ? new T.MeshStandardMaterial({ map: boards, roughness: 0.55 }) : unlit(boards, "#a49a90")));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = floorY;
      floor.receiveShadow = fine;
      // Drawn after the table, so that none of it is painted only to be covered.
      floor.renderOrder = 1;
      scene.add(floor);
      // A round side table by the wall with a decanter, two glasses and a closed box of cards.
      const side = new T.Group(),
        crystal = own(
          fine
            ? new T.MeshPhysicalMaterial({ color: "#f4efe6", roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.4 })
            : new T.MeshLambertMaterial({ color: "#e8e2d6", transparent: true, opacity: 0.45 }),
        ),
        spirit = own(matte(new T.MeshStandardMaterial({ color: "#9a4f12", roughness: 0.2, transparent: true, opacity: 0.85 }), fine)),
        lathe = (profile: [number, number][], segments = 24) => own(new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments)),
        put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
          const m = new T.Mesh(geometry, material);
          m.position.set(x, y, z);
          m.castShadow = shadow && fine;
          m.receiveShadow = true;
          side.add(m);
          return m;
        };
      put(own(new T.CylinderGeometry(1.0, 1.0, 0.08, 36)), walnut, 0, 0, 0);
      put(own(new T.CylinderGeometry(0.1, 0.16, 2.9, 12)), apron, 0, -1.48, 0);
      put(lathe([[0, 0], [0.32, 0], [0.36, 0.1], [0.36, 0.45], [0.3, 0.55], [0.1, 0.62], [0.08, 0.8], [0.12, 0.82], [0, 0.82]]), crystal, -0.25, 0.04, -0.1);
      put(lathe([[0, 0], [0.3, 0], [0.33, 0.1], [0.33, 0.33], [0, 0.33]]), spirit, -0.25, 0.05, -0.1, false);
      put(own(new T.SphereGeometry(0.11, 12, 10)), crystal, -0.25, 0.92, -0.1, false);
      const glass = lathe([[0, 0], [0.16, 0], [0.17, 0.3], [0.15, 0.3], [0.14, 0.03], [0, 0.03]]);
      put(glass, crystal, 0.38, 0.04, 0.2);
      put(glass, crystal, 0.15, 0.04, 0.48);
      put(own(new T.CylinderGeometry(0.135, 0.13, 0.09, 20)), spirit, 0.38, 0.09, 0.2, false);
      const box = put(own(block(0.42, 0.14, 0.62, 0.02)), own(matte(new T.MeshStandardMaterial({ color: "#7d1d26", roughness: 0.5 }), fine)), 0.45, 0.11, -0.45);
      box.rotation.y = 0.4;
      side.position.set(-8.6, floorY + 2.95, -4.4);
      scene.add(side);
      // Where a graphics card draws, a lamp out of sight above lays a warm pool of light on the table.
      if (fine) {
        const lamp = new T.SpotLight("#ffe2b0", 26, 22, 0.62, 0.7, 1.4);
        lamp.position.set(0, 11, 0.4);
        lamp.target.position.set(0, 0, 0);
        scene.add(lamp, lamp.target);
      }
      // Captain's chairs: one is made for each seat that is in play.
      const parts = chairParts(own),
        seat = own(matte(new T.MeshStandardMaterial({ color: "#1f4a3a", roughness: 0.5 }), fine));
      chairOf = () => chair(parts, walnut, seat);
      scene.add(chairs);
    },
    place(model: TableView, row: (seat: number) => SeatRow, layout: Layout) {
      const o = shapeOf(layout);
      if (shown !== layout) {
        shown = layout;
        seats = -1;
        for (const [shape, table] of tables) table.visible = shape === o;
      }
      if (seats === model.seats.length) return;
      seats = model.seats.length;
      chairs.clear();
      // Behind the other players' rows, beyond the rail: the far one behind the far side, those at the ends beyond them.
      for (let s = 1; s < seats; s++) {
        const { x, z } = row(s),
          end = Math.abs(x) > o.half * 0.5 && z > -o.depth * 0.5 + o.z,
          seatChair = chairOf();
        if (end) {
          seatChair.position.set(Math.sign(x) * (o.half + RAIL + 1.6), 0, z);
          seatChair.rotation.y = Math.sign(x) * (Math.PI / 2);
        } else {
          seatChair.position.set(x, 0, o.z - o.depth - RAIL - 1.5);
          seatChair.rotation.y = Math.PI;
        }
        chairs.add(seatChair);
      }
    },
  };
}
