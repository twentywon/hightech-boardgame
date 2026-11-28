import * as T from "three";
import { stuff } from "../../engine/scene-utils";
import { hanokYard } from "../../engine/scenery";
import { PieceTable, Stock, seeded, type Own } from "../points/table";
import type { Effect } from "../points/types";
import * as M from "../morris/rules";
import { gonuBoard } from "./board";
import { CIRCUIT, gonu, type State } from "./rules";

/** How far the yard lies under the board's face: the slab stands this proud of the earth (less what is sunk). */
const DROP = 0.22;
const GROUND = -DROP - 0.03;
/** Pieces each side starts with on the boards that are not placed. */
const START: Record<string, number> = { well: 2, line: 4, pumpkin: 3, car: 4 };
/** Shapes of pebble, chosen by a piece's id. */
const SHAPES = 6;

/**
 * A pebble: a sphere made lumpy and flattened by a few smooth waves of its own, `radius` across, its foot at y 0, with
 * its colour mottled a little (vertex colours, multiplied with the stone's own).
 */
export function pebbleGeometry(radius: number, seed: number, fine = true) {
  const rnd = seeded(seed * 7919 + 13),
    g = fine ? new T.SphereGeometry(1, 22, 14) : new T.SphereGeometry(1, 14, 9),
    at = g.getAttribute("position"),
    waves = Array.from({ length: 3 }, () => ({ d: new T.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), f: 0.5 + rnd() * 0.6, p: rnd() * 6, a: 0.04 + rnd() * 0.05 })),
    sx = radius * (0.9 + rnd() * 0.2),
    sz = radius * (0.88 + rnd() * 0.16),
    sy = radius * (0.5 + rnd() * 0.16),
    v = new T.Vector3(),
    colours: number[] = [];
  let low = Infinity;
  for (let i = 0; i < at.count; i++) {
    v.fromBufferAttribute(at, i);
    let k = 1;
    for (const w of waves) k += Math.sin(v.dot(w.d) * w.f * 3 + w.p) * w.a;
    // A pebble lies on its flatter side.
    const flat = v.y < 0 ? 0.82 : 1;
    v.set(v.x * sx * k, v.y * sy * k * flat, v.z * sz * k);
    at.setXYZ(i, v.x, v.y, v.z);
    low = Math.min(low, v.y);
    const tone = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(v.x * 9 + v.z * 7 + seed)) - (rnd() < 0.08 ? 0.08 : 0);
    colours.push(tone, tone, tone * 0.98);
  }
  g.translate(0, -low, 0);
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.computeVertexNormals();
  return g;
}
/** A slab's outline: a rounded oblong with an uneven, broken edge, `w` by `d`. */
function slabShape(w: number, d: number) {
  const rnd = seeded(41),
    shape = new T.Shape(),
    count = 72;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a),
      // A superellipse: nearly square, with rounded corners.
      r = 1 / Math.pow(Math.pow(Math.abs(c), 6) + Math.pow(Math.abs(s), 6), 1 / 6),
      chip = 1 - rnd() * 0.025 - (rnd() < 0.08 ? 0.03 : 0),
      x = (c * r * w * chip) / 2,
      y = (s * r * d * chip) / 2;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}
/** A dried gourd cut in half (바가지): a thin shell, `r` across and `depth` deep, standing on y 0. */
function gourdGeometry(r: number, depth: number, segments: number) {
  const outer: T.Vector2[] = [],
    inner: T.Vector2[] = [],
    t = 0.035;
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    outer.push(new T.Vector2(Math.sin(a) * r, depth - Math.cos(a) * depth));
  }
  for (let i = 12; i >= 0; i--) {
    const a = (i / 12) * (Math.PI / 2);
    inner.push(new T.Vector2(Math.max(0, Math.sin(a) * (r - t)), depth - Math.cos(a) * (depth - t)));
  }
  return new T.LatheGeometry([...outer, new T.Vector2(r - t * 0.3, depth + 0.01), ...inner], segments);
}

/**
 * Gonu in the yard (the user asked for the older tables to be upgraded): the board is cut into a big flat stone lying
 * in the earth of the hanok yard, its lines carved as grooves with lichen at the stone's edges, and the pieces are
 * pebbles, each of its own natural shape, dark slate against pale quartz. A pebble taken is flicked off the stone onto
 * a little heap at the taker's side; in cham gonu each side's pebbles wait in half a gourd (바가지) and are taken up
 * from it, and a line of three glows as it takes. A run of car gonu slides round the loops of the road.
 */
export class GonuView extends PieceTable<State> {
  protected readonly tall: number;
  private shapes: T.BufferGeometry[];
  private materials: T.Material[];
  private stock: Stock;
  private variant: string;
  constructor(host: HTMLElement, quality: "high" | "low", variant: string) {
    super(host, quality, "#b89a6c", gonuBoard(variant), gonu);
    this.variant = this.spec.points.length === 24 ? "cham" : variant in START ? variant : "well";
    const own: Own = (r) => this.own(r),
      r = this.spec.radius;
    const sun = this.daylight("#fff4e0", "#7a6040", "#fff0d2", 9, 2.2);
    sun.position.set(-5, 10, -3);
    const yard = new T.Group();
    yard.position.y = -DROP;
    hanokYard(yard, own);
    this.scene.add(yard);
    this.slab(own);
    this.shapes = Array.from({ length: SHAPES }, (_, i) => own(pebbleGeometry(r, i + 1, this.rich)));
    this.tall = r * 0.62;
    this.materials = this.spec.colors.map((color, i) =>
      this.standard({ color: i ? "#e9e2d2" : "#3a3f44", vertexColors: true, roughness: i ? 0.5 : 0.42, metalness: 0 }),
    );
    // Pebbles beside the stone are a little smaller than the ones in play.
    this.stock = new Stock(this.scene, this.shapes[2], this.materials, this.variant === "cham" ? 24 : 8);
    if (this.variant === "cham") this.gourds(own);
    this.start();
  }
  /** The stone the board is carved into, and the carving. */
  private slab(own: Own) {
    const half = this.spec.half,
      w = half * 2 + 0.7,
      d = half * 2 + 0.9,
      shape = slabShape(w, d),
      thick = 0.27,
      geometry = new T.ExtrudeGeometry(shape, { depth: thick - 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.08, bevelSegments: 3, curveSegments: 4 });
    geometry.rotateX(-Math.PI / 2).translate(0, -thick + 0.04, 0);
    // The texture of the stone laid on from above.
    const at = geometry.getAttribute("position"),
      uv = geometry.getAttribute("uv");
    for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) / w + 0.5, at.getZ(i) / d + 0.5);
    const stone = this.standard({ ...stuff("stone", "#a49d90", 2.2, own), roughness: 0.92 });
    this.add(geometry, stone, 0, 0, this.spec.centreZ).castShadow = true;
    // The carving: grooves (a shadow, the groove, the lit lip), the board's own lines; lichen toward the edges.
    const size = this.rich ? 2048 : 1024,
      c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true })!,
      unit = size / (half * 2),
      at2 = (dx: number, dy: number) => (x: number, z: number): [number, number] => [size / 2 + x * unit + dx * unit, size / 2 + z * unit + dy * unit],
      rnd = seeded(77);
    ctx.lineCap = ctx.lineJoin = "round";
    // Lichen and weathering, mostly toward the edges of the stone.
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2,
        far = 0.7 + rnd() * 0.32,
        x = size / 2 + Math.cos(a) * far * size * 0.5,
        y = size / 2 + Math.sin(a) * far * size * 0.5,
        r = (4 + rnd() * 26) * (size / 1024);
      ctx.fillStyle = rnd() < 0.6 ? `rgba(${170 + rnd() * 30},${175 + rnd() * 30},${110 + rnd() * 30},${0.12 + rnd() * 0.16})` : `rgba(60,55,45,${0.05 + rnd() * 0.08})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Old scratches left by earlier games.
    for (let i = 0; i < 70; i++) {
      const x = rnd() * size,
        y = rnd() * size,
        a = rnd() * Math.PI,
        l = (10 + rnd() * 40) * (size / 1024);
      ctx.strokeStyle = `rgba(240,235,222,${0.08 + rnd() * 0.1})`;
      ctx.lineWidth = 1 + rnd();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    const groove = (color: string, width: number, dx: number, dy: number) => {
      ctx.strokeStyle = ctx.fillStyle = color;
      ctx.lineWidth = unit * width;
      this.spec.paint(ctx, at2(dx, dy), unit);
    };
    groove("rgba(36, 30, 24, 0.55)", 0.12, -0.012, -0.016);
    groove("rgba(78, 70, 60, 0.85)", 0.085, 0, 0);
    groove("rgba(44, 38, 32, 0.6)", 0.04, -0.008, -0.01);
    groove("rgba(238, 230, 214, 0.28)", 0.022, 0.035, 0.04);
    const map = own(new T.CanvasTexture(c));
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = this.rich ? 8 : 4;
    const face = this.add(new T.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2), own(new T.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.95 })), 0, 0.003, this.spec.centreZ);
    face.castShadow = false;
  }
  /** Where the gourds stand in cham gonu: side 0's at the near right, side 1's at the far left. */
  private bowl(side: 0 | 1) {
    return side === 0 ? new T.Vector3(5.55, GROUND, 3.0) : new T.Vector3(-5.55, GROUND, -1.9);
  }
  private gourds(own: Own) {
    const skin = this.standard({ color: "#d7b46e", roughness: 0.55 }),
      shell = own(gourdGeometry(1.05, 0.5, this.rich ? 40 : 24));
    for (const side of [0, 1] as const) {
      const at = this.bowl(side);
      this.add(shell, skin, at.x, at.y, at.z);
    }
  }
  /** The `index`-th pebble waiting in a gourd: a ring at the bottom, the rest heaped on it. */
  private inBowl(side: 0 | 1, index: number) {
    const at = this.bowl(side),
      r = this.spec.radius,
      ring = index < 7,
      k = ring ? index : index - 7,
      a = ring ? (k / 6) * Math.PI * 2 : (k / 5) * Math.PI * 2 + 0.4,
      d = index === 0 ? 0 : ring ? 0.5 : 0.3;
    const x = index === 0 ? 0 : Math.cos(a) * d,
      z = index === 0 ? 0 : Math.sin(a) * d;
    return new T.Vector3(at.x + x, at.y + 0.04 + d * d * 0.45 + (ring ? 0 : r * 0.55), at.z + z);
  }
  /** The `index`-th pebble taken by `taker`, on its heap on the earth beside the stone. */
  private onHeap(taker: 0 | 1, index: number) {
    const base = this.variant === "cham" ? (taker === 0 ? new T.Vector3(5.0, GROUND, 4.9) : new T.Vector3(-5.1, GROUND, -3.9)) : taker === 0 ? new T.Vector3(5.3, GROUND, 3.2) : new T.Vector3(-5.3, GROUND, -2.2),
      rnd = seeded(taker * 31 + index * 7 + 5),
      a = index * 2.4,
      d = index === 0 ? 0 : 0.36 + Math.sqrt(index) * 0.28;
    return new T.Vector3(base.x + Math.cos(a) * d + (rnd() - 0.5) * 0.1, base.y, base.z + Math.sin(a) * d * 0.8 + (rnd() - 0.5) * 0.1);
  }
  private waiting(state: State, side: 0 | 1) {
    return state.inner ? state.inner.men - state.inner.placed[side] : 0;
  }
  private taken(state: State, side: 0 | 1) {
    const on = state.board.filter((c) => c === side).length;
    return state.inner ? state.inner.placed[side] - on : (START[this.variant] ?? 0) - on;
  }
  protected extras(state: State) {
    for (const side of [0, 1] as const) {
      const taker = side === 0 ? 1 : 0,
        places = [
          ...Array.from({ length: this.taken(state, side) }, (_, k) => this.onHeap(taker, k)),
          ...Array.from({ length: this.waiting(state, side) }, (_, k) => this.inBowl(side, k)),
        ];
      this.stock.set(
        side,
        places.map((at, k) => ({ at, turn: k * 2.1 + side, scale: 0.9 })),
      );
    }
  }
  protected source(before: State, side: 0 | 1) {
    const left = this.waiting(before, side);
    if (left <= 0) return null;
    this.stock.drop(side);
    return this.inBowl(side, left - 1);
  }
  protected away(before: State, side: 0 | 1, index: number) {
    return this.onHeap(side === 0 ? 1 : 0, this.taken(before, side) + index);
  }
  /** A pebble taken in line or car gonu is flicked off the stone; one taken by a line of three is lifted off. */
  protected knocked(effect: Effect) {
    return this.variant !== "cham" && effect.removed.length > 0;
  }
  protected mills() {
    return this.variant === "cham" ? M.CROSSED_MILLS : null;
  }
  /** A run of car gonu goes along the road, round the loops at the corners. */
  protected road(effect: Effect, before: State) {
    if (this.variant !== "car" || effect.kind !== "jump") return null;
    const n = CIRCUIT.length,
      board = before.board;
    let best: { path: number[]; dir: number } | null = null;
    CIRCUIT.forEach((point, start) => {
      if (point !== effect.from) return;
      for (const dir of [1, -1]) {
        let at = start,
          loops = 0;
        const path = [start];
        for (let k = 0; k < n; k++) {
          if (dir === 1 ? at % 4 === 3 : at % 4 === 0) loops++;
          at = (at + dir + n) % n;
          path.push(at);
          const here = CIRCUIT[at];
          if (here === effect.from || board[here] === null) continue;
          if (here === effect.to && loops > 0 && (!best || path.length < best.path.length)) best = { path, dir };
          break;
        }
      }
    });
    const found = best as { path: number[]; dir: number } | null;
    if (!found) return null;
    const out: T.Vector3[] = [this.at(CIRCUIT[found.path[0]])];
    for (let i = 1; i < found.path.length; i++) {
      const a = this.at(CIRCUIT[found.path[i - 1]]),
        b = this.at(CIRCUIT[found.path[i]]),
        loop = found.dir === 1 ? found.path[i - 1] % 4 === 3 : found.path[i - 1] % 4 === 0;
      if (loop) {
        // Round the corner whose point lies a loop's radius from both ends, three quarters of the way.
        const corner = [0, 3, 12, 15].map((p) => this.at(p)).find((c) => Math.abs(c.distanceTo(a) - 1.5) < 0.05 && Math.abs(c.distanceTo(b) - 1.5) < 0.05);
        if (corner) {
          const from = Math.atan2(a.z - corner.z, a.x - corner.x),
            short = Math.atan2(Math.sin(Math.atan2(b.z - corner.z, b.x - corner.x) - from), Math.cos(Math.atan2(b.z - corner.z, b.x - corner.x) - from)),
            sweep = short - Math.sign(short) * Math.PI * 2;
          for (let s = 1; s < 18; s++) {
            const t = from + (sweep * s) / 18;
            out.push(new T.Vector3(corner.x + Math.cos(t) * 1.5, 0, corner.z + Math.sin(t) * 1.5));
          }
        }
      }
      out.push(b);
    }
    return out;
  }
  protected man(side: 0 | 1, _crowned: boolean, id: number) {
    const mesh = new T.Mesh(this.shapes[Math.abs(id) % SHAPES], this.materials[side]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.rotation.y = id * 2.1;
    return mesh;
  }
}
