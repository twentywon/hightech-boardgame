import * as T from "three";
import { block, glossy, weave, wood } from "../../engine/scene-utils";
import type { TableView } from "../cards/game";
import type { Layout, SeatRow, TableSetting } from "../cards/table-view";
import type { Shape } from "./layout";

type Own = <X extends { dispose(): void }>(resource: X) => X;
const FONT = '"Inter", "Noto Sans KR", "Pretendard Variable", "Apple SD Gothic Neo", sans-serif';

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
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
/** Deep blue baize with a fine nap. */
function feltTexture(own: Own) {
  const { c, ctx } = canvas(256, 256),
    rand = sequence(11);
  ctx.fillStyle = "#1c4f7c";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,10,30,0.06)";
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(0.45, 0.45);
  return t;
}
/**
 * What is printed on the felt, in the felt's own picture (one pixel a hundredth of a unit, the table's middle at the
 * picture's middle): a gold line round the betting area, the name in the middle, and five faint frames where the
 * community cards are laid.
 */
function printTexture(own: Own, dims: Shape, board: { x: number; z: number; gap: number; scale: number }) {
  const scale = 80,
    w = Math.round(dims.length * 2 * scale),
    h = Math.round(dims.depth * 2 * scale),
    { c, ctx } = canvas(w, h),
    // Table units to pixels, the table's middle at (dims.z) in the middle of the picture.
    px = (x: number) => w / 2 + x * scale,
    pz = (z: number) => h / 2 + (z - dims.z) * scale;
  ctx.clearRect(0, 0, w, h);
  // The betting line: a stadium drawn in from the rail.
  const inset = 0.95,
    r = (dims.depth - inset) * scale,
    half = (dims.length - dims.depth) * scale;
  ctx.strokeStyle = "rgba(226, 196, 118, 0.62)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(w / 2 - half, h / 2 - r);
  ctx.lineTo(w / 2 + half, h / 2 - r);
  ctx.arc(w / 2 + half, h / 2, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(w / 2 - half, h / 2 + r);
  ctx.arc(w / 2 - half, h / 2, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
  ctx.stroke();
  // Places for the five community cards.
  ctx.strokeStyle = "rgba(226, 196, 118, 0.3)";
  ctx.lineWidth = 3;
  const cw = 1 * board.scale * scale,
    ch = 1.5 * board.scale * scale;
  for (let i = 0; i < 5; i++) {
    const x = px(board.x + i * board.gap) - cw / 2 - 6,
      y = pz(board.z) - ch / 2 - 6,
      rr = 10;
    ctx.beginPath();
    ctx.roundRect(x, y, cw + 12, ch + 12, rr);
    ctx.stroke();
  }
  // The name, under the cards in the middle, and the suits beside it.
  ctx.fillStyle = "rgba(233, 214, 160, 0.5)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(scale * 0.36)}px ${FONT}`;
  ctx.fillText("TEXAS HOLD'EM", px(board.x + board.gap * 2), pz(board.z) - scale * 0.2);
  ctx.font = `600 ${Math.round(scale * 0.2)}px ${FONT}`;
  ctx.fillText("NO LIMIT · WORLD TABLE GAMES", px(board.x + board.gap * 2), pz(board.z) + scale * 0.28);
  ctx.font = `${Math.round(scale * 0.3)}px "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif`;
  ["♠", "♥", "♦", "♣"].forEach((suit, i) => {
    ctx.fillStyle = i === 1 || i === 2 ? "rgba(214, 120, 104, 0.5)" : "rgba(233, 214, 160, 0.42)";
    ctx.fillText(suit, px(board.x + board.gap * 2) + (i - 1.5) * scale * 0.42, pz(board.z) + scale * 0.66);
  });
  return texture(c, own);
}
/** A casino carpet of our own: midnight blue with a fine gold lattice and small wine-red flowers. */
function carpetTexture(own: Own) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#10152b";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(190, 150, 80, 0.26)";
  ctx.lineWidth = 2;
  for (let i = -256; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  for (let x = 0; x <= 256; x += 64)
    for (let y = 32; y <= 288; y += 64)
      for (const [fx, fy] of [[x, y], [x + 32, y - 32]]) {
        ctx.fillStyle = "rgba(112, 26, 40, 0.8)";
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos((k * Math.PI) / 2) * 5, fy + Math.sin((k * Math.PI) / 2) * 5, 4.5, 3, (k * Math.PI) / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(214, 172, 92, 0.55)";
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(26, 26);
  return t;
}
/** Wall panels: dark wood boards with a brass line. */
function wallTexture(own: Own) {
  const { c, ctx } = canvas(256, 256);
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, "#3a2016");
  grad.addColorStop(0.5, "#4a2a1c");
  grad.addColorStop(1, "#3a2016");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 228, 228);
  ctx.strokeStyle = "rgba(205, 160, 80, 0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 208, 208);
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** The dealer button's face: DEALER in black on white, with a ring. */
function puckTexture(own: Own) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#f7f5ee";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#1b1d22";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#1b1d22";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 52px ${FONT}`;
  ctx.fillText("DEALER", 128, 132);
  return texture(c, own);
}
/**
 * The racetrack shape of a table, `grow` units out from the felt's edge, drawn in the shape's own plane (y there
 * is -z on the table).
 */
function outline<P extends T.Path>(path: P, dims: Shape, grow: number) {
  const r = dims.depth + grow,
    half = dims.length - dims.depth,
    cz = -dims.z;
  path.moveTo(-half, cz - r);
  path.lineTo(half, cz - r);
  path.absarc(half, cz, r, -Math.PI / 2, Math.PI / 2, false);
  path.lineTo(-half, cz + r);
  path.absarc(-half, cz, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return path;
}
/** Whether a point lies on a table's felt at least `margin` inside its edge. */
function onFelt(dims: Shape, x: number, z: number, margin: number) {
  const half = dims.length - dims.depth,
    r = dims.depth - margin,
    dz = z - dims.z,
    dx = Math.max(0, Math.abs(x) - half);
  return dx * dx + dz * dz <= r * r;
}
interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
/** What lies on the table already: each seat's cards and its labels, the community cards, the deck and the pot. */
function boxes(model: TableView, row: (seat: number) => SeatRow, layout: Layout): Box[] {
  const list: Box[] = [],
    box = (x: number, z: number, hx: number, hz: number) => list.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz });
  model.seats.forEach((_, s) => {
    const { x, z, width, scale } = row(s),
      extent = (Math.min(scale * 1.05, width - scale) + scale) / 2,
      reach = 0.75 * scale + 0.34 * Math.max(0.8, scale),
      size = s === 0 ? 1 : Math.max(0.72, scale);
    box(x, z, extent, 0.75 * scale);
    // The base view's two labels: across the table the name beyond the row and what it did before it; mine below.
    if (s === 0) {
      box(x, z + reach, 1.15, 0.23);
      box(x, z + reach + 0.5, 1.15, 0.23);
    } else {
      box(x, z - reach, 1.15 * size, 0.23 * size);
      box(x, z + reach, 1.15 * size, 0.23 * size);
    }
  });
  const board = layout.board;
  if (board) box(board.x + board.gap * 2, board.z, board.gap * 2 + board.scale / 2, board.scale * 0.75);
  box(layout.deck.x, layout.deck.z, 0.56, 0.8);
  const pot = layout.pot;
  if (pot) {
    box(pot.x ?? 0, pot.z, 1.0, 0.28);
    box(pot.x ?? 0, pot.label, 0.92, 0.2);
  }
  return list;
}
/** How far a table's felt reaches from its middle in the direction `way` (a unit vector in x and z). */
function edge(dims: Shape, way: T.Vector2) {
  let d = 0;
  while (d < 14 && onFelt(dims, way.x * d, dims.z + way.y * d, 0)) d += 0.05;
  return d;
}
/** A chair seen from the table: a padded, rounded back on a wooden frame with a seat in front of it. */
function chairShapes(own: Own) {
  return { back: own(block(1.75, 1.45, 0.42, 0.2)), seat: own(block(1.8, 0.36, 1.6, 0.16)), rail: own(block(1.9, 0.14, 0.2, 0.06)) };
}
function chair(shapes: ReturnType<typeof chairShapes>, leather: T.Material, frame: T.Material) {
  const group = new T.Group(),
    back = new T.Mesh(shapes.back, leather),
    seat = new T.Mesh(shapes.seat, leather),
    rail = new T.Mesh(shapes.rail, frame);
  back.position.set(0, -0.15, 0.78);
  back.rotation.x = 0.1;
  seat.position.set(0, -1.05, 0.05);
  rail.position.set(0, 0.62, 0.86);
  rail.rotation.x = 0.1;
  for (const thing of [back, seat, rail]) thing.castShadow = true;
  group.add(back, seat, rail);
  return group;
}
/**
 * A casino poker room for hold'em: an oval table with blue baize inside a polished wooden racetrack and a padded
 * leather rail, chairs for the seats in play, a patterned carpet, panelled walls with lamps, a dealer button that
 * passes round, and each seat's chips counted on a plate. `shapeOf` says which table a layout is drawn on.
 */
export function pokerRoom(layouts: { wide: Layout; square: Layout; long?: Layout }, shapeOf: (layout: Layout) => Shape): TableSetting {
  // Made again by `build` for every view that shows the room.
  let tables = new Map<Shape, T.Group>(),
    prints = new Map<Layout, T.Object3D>(),
    chairs = new T.Group(),
    stacks = new T.Group(),
    puck = new T.Group(),
    own: Own = (r) => r,
    seats = -1,
    chairOf: () => T.Group = () => new T.Group(),
    puckFrom = new T.Vector3(),
    puckTo = new T.Vector3(),
    puckStart = 0,
    shownLayout: Layout | null = null;
  let labels: { mesh: T.Mesh; ctx: CanvasRenderingContext2D; map: T.CanvasTexture; text: string }[] = [];
  /** The count of a seat's chips, painted on a small dark plate. */
  function label(i: number) {
    if (!labels[i]) {
      const { c, ctx } = canvas(256, 72),
        map = texture(c, own),
        mesh = new T.Mesh(
          own(new T.PlaneGeometry(1.2, 0.34)),
          own(new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false })),
        );
      mesh.rotation.x = -Math.PI / 2;
      labels[i] = { mesh, ctx, map, text: "" };
    }
    return labels[i];
  }
  function paint(entry: (typeof labels)[number], text: string) {
    if (entry.text === text) return;
    entry.text = text;
    const { ctx } = entry;
    ctx.clearRect(0, 0, 256, 72);
    ctx.fillStyle = "rgba(8, 16, 30, 0.78)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 64, 32);
    ctx.fill();
    // A chip beside the figure.
    ctx.fillStyle = "#c8452c";
    ctx.beginPath();
    ctx.arc(40, 36, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f6efe0";
    ctx.lineWidth = 5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(40, 36, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f3e3b5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = 40;
    do {
      ctx.font = `800 ${size}px ${FONT}`;
      size -= 2;
    } while (ctx.measureText(text).width > 176 && size > 20);
    ctx.fillText(text, 152, 38);
    entry.map.needsUpdate = true;
  }
  return {
    ...layouts,
    clear: "#120e14",
    build(scene, keep) {
      own = keep;
      tables = new Map();
      prints = new Map();
      chairs = new T.Group();
      stacks = new T.Group();
      puck = new T.Group();
      labels = [];
      seats = -1;
      shownLayout = null;
      const cloth = feltTexture(own),
        baize = own(new T.MeshStandardMaterial({ map: cloth, roughness: 0.95, ...weave(0.8, 0.8, own) })),
        racetrack = own(glossy({ map: own(wood(false)), color: "#d9a777", roughness: 0.32 }, 0.7)),
        leather = own(new T.MeshStandardMaterial({ color: "#17120f", roughness: 0.5, metalness: 0.05 })),
        apron = own(new T.MeshStandardMaterial({ map: own(wood(true)), roughness: 0.55 })),
        brass = own(new T.MeshStandardMaterial({ color: "#c9a85c", roughness: 0.32, metalness: 0.7 })),
        floorY = -4.4;
      /** One table: the felt, a brass line where it meets the wood, the polished racetrack, the padded rail, the apron and the pedestal. */
      const tableOf = (dims: Shape) => {
        const table = new T.Group(),
          felt = new T.Mesh(own(new T.ShapeGeometry(outline(new T.Shape(), dims, 0.02), 48)), baize);
        felt.rotation.x = -Math.PI / 2;
        felt.receiveShadow = true;
        const band = (inner: number, outer: number, depth: number, y: number, material: T.Material, bevel = 0.05) => {
          const shape = outline(new T.Shape(), dims, outer);
          shape.holes.push(outline(new T.Path(), dims, inner));
          const mesh = new T.Mesh(
            own(
              new T.ExtrudeGeometry(shape, {
                depth,
                bevelEnabled: bevel > 0,
                bevelSize: bevel,
                bevelThickness: bevel,
                bevelSegments: 5,
                curveSegments: 48,
              }),
            ),
            material,
          );
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = y;
          mesh.castShadow = mesh.receiveShadow = true;
          table.add(mesh);
        };
        band(-0.03, 0.02, 0.01, -0.005, brass, 0);
        band(0.02, 0.42, 0.02, -0.02, racetrack, 0.02);
        band(0.42, 1.08, 0.12, 0.02, leather, 0.12);
        band(0.5, 1.05, 1.2, -1.32, apron, 0.04);
        const foot = new T.Mesh(own(new T.CylinderGeometry(1.4, 2.2, 3.2, 40)), apron);
        foot.position.set(0, floorY + 1.6, dims.z);
        table.add(felt, foot);
        table.visible = false;
        scene.add(table);
        return table;
      };
      for (const layout of [layouts.wide, layouts.square, layouts.long]) {
        if (!layout) continue;
        const dims = shapeOf(layout);
        if (!tables.has(dims)) tables.set(dims, tableOf(dims));
        // What is printed on the felt follows where the layout lays the community cards.
        const print = new T.Mesh(
          own(new T.PlaneGeometry(dims.length * 2, dims.depth * 2)),
          own(new T.MeshBasicMaterial({ map: printTexture(own, dims, layout.board!), transparent: true, depthWrite: false, opacity: 0.95 })),
        );
        print.rotation.x = -Math.PI / 2;
        print.position.set(0, 0.003, dims.z);
        print.visible = false;
        tables.get(dims)!.add(print);
        prints.set(layout, print);
      }
      // The carpet far below.
      const floor = new T.Mesh(
        own(new T.PlaneGeometry(90, 90)),
        own(new T.MeshStandardMaterial({ map: carpetTexture(own), roughness: 1, ...weave(30, 30, own, 0.6) })),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = floorY;
      floor.receiveShadow = true;
      scene.add(floor);
      // Panelled walls with brass lamps, well behind the table.
      const panels = wallTexture(own);
      panels.repeat.set(10, 3);
      const walls = own(new T.MeshStandardMaterial({ map: panels, roughness: 0.7 })),
        back = new T.Mesh(own(new T.PlaneGeometry(56, 14)), walls);
      back.position.set(0, floorY + 7, -15);
      const left = new T.Mesh(own(new T.PlaneGeometry(40, 14)), walls),
        right = new T.Mesh(left.geometry, walls);
      left.rotation.y = Math.PI / 2;
      left.position.set(-22, floorY + 7, 2);
      right.rotation.y = -Math.PI / 2;
      right.position.set(22, floorY + 7, 2);
      scene.add(back, left, right);
      const glow = own(new T.MeshBasicMaterial({ color: "#ffd99a" })),
        shade = own(new T.CylinderGeometry(0.42, 0.62, 0.9, 24, 1, true)),
        bulb = own(new T.SphereGeometry(0.3, 16, 12)),
        arm = own(new T.CylinderGeometry(0.06, 0.06, 0.8, 8)),
        shadeMat = own(new T.MeshStandardMaterial({ color: "#7a1f24", roughness: 0.6, side: T.DoubleSide, emissive: "#3a0c0c" }));
      for (const x of [-15, -7.5, 0, 7.5, 15]) {
        const lamp = new T.Group(),
          cover = new T.Mesh(shade, shadeMat),
          light = new T.Mesh(bulb, glow),
          bracket = new T.Mesh(arm, brass);
        bracket.rotation.x = Math.PI / 2;
        bracket.position.z = -0.4;
        light.position.y = -0.1;
        lamp.add(cover, light, bracket);
        lamp.position.set(x, floorY + 9.5, -14.2);
        scene.add(lamp);
      }
      // A warm lamp hangs over the table, out of sight above the camera.
      const over = new T.PointLight("#ffd9a8", 1.6, 30, 1.6);
      over.position.set(0, 9, 0.2);
      scene.add(over);
      scene.add(chairs, stacks, puck);
      // Chairs: a red leather back on a dark frame; one is made for each seat that is in play.
      const red = own(new T.MeshStandardMaterial({ color: "#7d1d26", roughness: 0.48 })),
        shapes = chairShapes(own);
      chairOf = () => chair(shapes, red, apron);
      // The dealer button: a thick white disc with its word on top.
      const top = own(glossy({ map: puckTexture(own), roughness: 0.3 }, 0.6)),
        side = own(new T.MeshStandardMaterial({ color: "#eeeae0", roughness: 0.4 })),
        disc = new T.Mesh(own(new T.CylinderGeometry(0.34, 0.34, 0.1, 40)), [side, top, side]);
      disc.castShadow = true;
      disc.position.y = 0.05;
      // The cap's picture lies a quarter turn round: turned back so that the word reads across from my seat.
      disc.rotation.y = Math.PI / 2;
      puck.add(disc);
      puck.visible = false;
    },
    place(model: TableView, row: (seat: number) => SeatRow, layout: Layout, quick: boolean) {
      const dims = shapeOf(layout);
      if (shownLayout !== layout) {
        shownLayout = layout;
        seats = -1;
        for (const [shape, table] of tables) table.visible = shape === dims;
        for (const [owner, print] of prints) print.visible = owner === layout;
      }
      // Chairs stand behind the seats in play, mine left out (it is where I sit).
      if (seats !== model.seats.length) {
        seats = model.seats.length;
        chairs.clear();
        for (let s = 1; s < seats; s++) {
          const { x, z } = row(s),
            way = new T.Vector2(x, z - dims.z).normalize(),
            reach = edge(dims, way) + 2.05,
            seatChair = chairOf();
          seatChair.position.set(way.x * reach, -1.05, dims.z + way.y * reach);
          seatChair.rotation.y = Math.atan2(way.x, way.y);
          chairs.add(seatChair);
        }
      }
      // Each seat's chips are counted on a plate near its cards, and the dealer button lies by the dealer's: each
      // in the first of a few places that is on the felt and clear of every card, label and pile already there.
      stacks.clear();
      const PLATE = { x: 0.6, z: 0.17 },
        PUCK = 0.34,
        taken = boxes(model, row, layout),
        free = (x: number, z: number, hx: number, hz: number) =>
          onFelt(dims, x - hx, z - hz, 0.12) &&
          onFelt(dims, x + hx, z - hz, 0.12) &&
          onFelt(dims, x - hx, z + hz, 0.12) &&
          onFelt(dims, x + hx, z + hz, 0.12) &&
          !taken.some((b) => x + hx > b.x0 && x - hx < b.x1 && z + hz > b.z0 && z - hz < b.z1),
        pick = (spots: [number, number][], hx: number, hz: number) => {
          const spot = spots.find(([x, z]) => free(x, z, hx, hz)) ?? spots[0];
          taken.push({ x0: spot[0] - hx, x1: spot[0] + hx, z0: spot[1] - hz, z1: spot[1] + hz });
          return spot;
        },
        around = (s: number) => {
          const { x, z, width, scale } = row(s),
            extent = (Math.min(scale * 1.05, width - scale) + scale) / 2,
            outer = x === 0 ? 1 : Math.sign(x),
            reach = 0.75 * scale + 0.34 * Math.max(0.8, scale),
            size = s === 0 ? 1 : Math.max(0.72, scale);
          return { x, z, extent, outer, reach, size, scale };
        };
      model.seats.forEach((seat, s) => {
        if (seat.out && !seat.cards.length) return;
        const { x, z, extent, outer, reach, size } = around(s),
          side = extent + 0.12 + PLATE.x,
          entry = label(s);
        // Mine at the left of my cards; the others' beside their cards, else beyond the name or before the cards.
        const [px, pz] = pick(
          s === 0
            ? [[x - side, z], [x - side, z + 0.5]]
            : [
                [x + outer * side, z],
                [x - outer * side, z],
                [x, z - reach - 0.23 * size - 0.25],
                [x, z + reach + 0.23 * size + 0.25],
              ],
          PLATE.x,
          PLATE.z,
        );
        paint(entry, seat.chips.toLocaleString("ko-KR"));
        entry.mesh.position.set(px, 0.012, pz);
        stacks.add(entry.mesh);
      });
      if (model.dealer === undefined || !model.seats[model.dealer]) {
        puck.visible = false;
        return;
      }
      const { x, z, extent, outer, reach, size, scale } = around(model.dealer),
        side = extent + 0.12 + PUCK,
        toward = model.dealer === 0 ? -1 : 1,
        [px, pz] = pick(
          [
            [x + (model.dealer === 0 ? 1 : -outer) * side, z],
            [x + (model.dealer === 0 ? -1 : outer) * side, z],
            [x + (model.dealer === 0 ? 1 : -outer) * (side + 2 * PLATE.x + 0.2), z],
            [x + (model.dealer === 0 ? -1 : outer) * (side + 2 * PLATE.x + 0.2), z],
            [x + 1.15 * size + PUCK + 0.1, z + toward * (reach)],
            [x, z + toward * (0.75 * scale + PUCK + 0.08)],
          ],
          PUCK,
          PUCK,
        );
      const at = new T.Vector3(px, 0, pz);
      if (!puck.visible || quick) {
        puck.position.copy(at);
        puckFrom.copy(at);
        puckTo.copy(at);
        puck.visible = true;
      } else if (puckTo.distanceToSquared(at) > 1e-6) {
        puckFrom.copy(puck.position);
        puckTo.copy(at);
        puckStart = performance.now();
      }
    },
    frame(now) {
      if (!puck.visible || puck.position.distanceToSquared(puckTo) < 1e-8) return false;
      const p = Math.min(1, (now - puckStart) / 650),
        e = p * p * (3 - 2 * p);
      puck.position.lerpVectors(puckFrom, puckTo, e);
      puck.position.y = Math.sin(Math.PI * p) * 0.25;
      return true;
    },
  };
}
