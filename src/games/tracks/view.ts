import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, planks, stuff, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELL, TILE_TOP, TUNNEL_DEPTH, WAY, boardBox, cellAt, cellUnder, clueAt, gridBox, outside, sideAt, trainLine, tracksSubject } from "./layout";
import { E, MAX_STROKE, N, S, W, clueState, counts, drawn, ends, link, sideTo, stroke, type Port, type State } from "./rules";

export const TRACKS_COLORS: [string, string] = ["#c9a44a", "#5b636d"];
/** Half the gauge, a rail's width and height, the ballast's width and depth, a sleeper's length, width and depth. */
const GAUGE = 0.094,
  RAIL_W = 0.02,
  RAIL_H = 0.024,
  BALLAST_W = 0.34,
  BALLAST_H = 0.022,
  SLEEPER_L = 0.31,
  SLEEPER_W = 0.052,
  SLEEPER_H = 0.014,
  /** Heights of the ballast's bed, the sleepers' and the rails' bottoms, from a cell's top. */
  SLEEPER_Y = BALLAST_H,
  RAIL_Y = BALLAST_H + SLEEPER_H,
  /** The top of the rails, where the train's wheels run, above the table. */
  RAIL_TOP = TILE_TOP + RAIL_Y + RAIL_H,
  /** The margins' grass lies a little below the cells' tops. */
  GROUND = TILE_TOP - 0.012;
const HALF = CELL / 2;
/** How far beyond the grid's edge the tunnel's portal stands. */
const PORTAL = 0.5;
/** A quarter turn clockwise seen from above (north to east), and how many take a mask to another. */
const turned = (mask: number) => ((mask << 1) | (mask >> 3)) & 15;
function turnsFrom(base: number, mask: number) {
  for (let k = 0, m = base; k < 4; k++, m = turned(m)) if (m === mask) return k;
  return -1;
}
/** The piece a mask draws as: the shape it is made of and the quarter turns clockwise that set it. */
function shapeOf(mask: number): { kind: "straight" | "curve" | "stub"; turns: number } | null {
  const k = ends(mask);
  if (k === 1) return { kind: "stub", turns: turnsFrom(N, mask) };
  if (k !== 2) return null;
  if (mask === (N | S) || mask === (E | W)) return { kind: "straight", turns: mask === (N | S) ? 0 : 1 };
  return { kind: "curve", turns: turnsFrom(N | E, mask) };
}
const flat = (g: T.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const merged = (pieces: T.BufferGeometry[]) => {
  const out = mergeGeometries(pieces.map(flat))!;
  for (const piece of pieces) piece.dispose();
  return out;
};
/** A flat ring sector (an arc `from` to `to` of radii `inner` to `outer` about x, z), `height` thick, its foot at y. */
function sector(cx: number, cz: number, inner: number, outer: number, from: number, to: number, y: number, height: number) {
  // The shape is drawn in x and −z (a turn about x lays it flat), so angles are taken there.
  const shape = new T.Shape();
  shape.absarc(cx, -cz, outer, -from, -to, true);
  shape.absarc(cx, -cz, inner, -to, -from, false);
  shape.closePath();
  return new T.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2).translate(0, y, 0);
}
/** A box lying along the angle `angle` (from +x toward +z) about a point. */
function along(w: number, h: number, d: number, x: number, y: number, z: number, angle: number) {
  return new T.BoxGeometry(w, h, d).rotateY(-angle).translate(x, y + h / 2, z);
}
/** A sequence for scenery, the same every time. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
interface Piece {
  ballast: T.BufferGeometry;
  sleepers: T.BufferGeometry;
  rails: T.BufferGeometry;
  joiners: T.BufferGeometry;
}
/**
 * A model railway's baseboard on a wooden table: a grid of grassy cells inside a dark wooden lath, a margin of lawn
 * round it with the numbers on enamel plates over the columns and beside the rows, a tunnel in a grassy hill at
 * the entrance and a small station at the exit. Each cell's rails are drawn from its links (a straight, a curve
 * as a true quarter circle, or a dead end with a buffer stop): grey ballast, timber sleepers and two steel rails;
 * given pieces have dark sleepers, warmer ballast and brass rail joiners. A marked cell carries a white X. Once
 * the railway is whole, a little train comes out of the tunnel and runs to the station.
 */
export class TracksView extends TableView<State> {
  private size = 0;
  private puzzle: number[] | null = null;
  private board = new T.Group();
  private scenery = new T.Group();
  private pieces = new T.Group();
  private crosses = new T.Group();
  private cells: { key: string; group: T.Group | null }[] = [];
  private plates: { mesh: T.Mesh; kind: "row" | "col"; i: number; key: string }[] = [];
  /** What belongs to one size of board, or one puzzle, freed when another is laid. */
  private laid: { dispose(): void }[] = [];
  private staged: { dispose(): void }[] = [];
  private shapes: Record<string, Piece> = {};
  private paint: Record<string, T.MeshStandardMaterial> = {};
  private numbers = new Map<string, T.Material[]>();
  private plate: T.BufferGeometry;
  private crossShape: T.BufferGeometry;
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  private hintArrow: T.Mesh;
  private flash: T.Mesh;
  private flashUntil = 0;
  private train: T.Group;
  private cars: T.Group[] = [];
  /** The run of the train: its line, how far it has come, and for which puzzle. */
  private run: { line: { x: number; z: number }[]; length: number[]; at: number; speed: number; last: number } | null = null;
  private ranFor: number[] | null = null;
  private clock = 0;
  /** A drag laying or lifting rails: where it began and stands, the cells it has gone through, the state it began on. */
  private drag: { start: number; at: number; cells: number[]; base: State; tried: Move | null; moved: boolean } | null = null;
  /** A move the hand has just drawn: it was heard as it was drawn, so it is not heard again when the screen plays it. */
  private quiet = false;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2b2118");
    this.daylight("#eef3ff", "#4a3a2a", "#fff1da", 9, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...planks(8, keep), color: "#b5a08a" }), 0, -0.2, 0).castShadow = false;
    const p = (name: string, options: T.MeshStandardMaterialParameters) => (this.paint[name] = this.standard(options));
    p("frame", { map: keep(wood(false)), color: "#d8b88e", roughness: 0.55 });
    p("lath", { map: keep(wood(true)), color: "#a07858", roughness: 0.6 });
    p("lawn", { ...stuff("grass", "#6f9848", 3, keep), roughness: 1 });
    p("tile", { ...stuff("grass", "#86b25c", 1, keep), roughness: 1 });
    p("earth", { ...stuff("earth", "#4b3826", 2, keep), roughness: 1 });
    p("ballast", { ...stuff("gravel", "#9a958c", 1, keep), roughness: 1 });
    p("ballastGiven", { ...stuff("gravel", "#a88a66", 1, keep), roughness: 1 });
    p("sleeper", { color: "#7a5638", roughness: 0.85 });
    p("sleeperGiven", { color: "#33241a", roughness: 0.8 });
    p("rail", { color: "#a4aab2", metalness: 0.85, roughness: 0.32 });
    p("brass", { color: "#d1a94a", metalness: 0.75, roughness: 0.28 });
    p("buffer", { color: "#b8322a", roughness: 0.55 });
    p("cross", { color: "#f4f1ea", roughness: 0.6, emissive: "#3a3a3a", emissiveIntensity: 0.25 });
    p("stone", { ...stuff("stone", "#a59d90", 1, keep), roughness: 0.95 });
    p("dark", { color: "#0c0b0a", roughness: 1 });
    p("cream", { color: "#efe3c8", roughness: 0.8 });
    p("roof", { color: "#8a3b2c", roughness: 0.7 });
    p("trim", { color: "#2f4f3e", roughness: 0.6 });
    p("glass", { color: "#33475a", roughness: 0.15, metalness: 0.2 });
    p("platform", { ...stuff("stone", "#c8c0b2", 1, keep), roughness: 0.9 });
    p("leaf", { color: "#3c6e34", roughness: 0.9 });
    p("bark", { color: "#5b4130", roughness: 0.9 });
    // The train's paint.
    p("red", { color: "#b5302a", roughness: 0.45, metalness: 0.15 });
    p("black", { color: "#1d1d1f", roughness: 0.5, metalness: 0.3 });
    p("green", { color: "#2f6b4a", roughness: 0.5, metalness: 0.1 });
    p("roofGreen", { color: "#1f4a34", roughness: 0.55, metalness: 0.1 });
    p("gold", { color: "#d7b14e", roughness: 0.3, metalness: 0.7 });
    p("window", { color: "#f6e2a6", roughness: 0.3, emissive: "#6b5420", emissiveIntensity: 0.35 });
    this.shapes.straight = this.straight();
    this.shapes.curve = this.curve();
    this.shapes.stub = this.stub();
    this.plate = this.own(block(0.46, 0.05, 0.46, 0.03));
    this.crossShape = this.own(
      merged([new T.BoxGeometry(0.4, 0.018, 0.075).rotateY(Math.PI / 4), new T.BoxGeometry(0.4, 0.018, 0.075).rotateY(-Math.PI / 4)].map((g) => g.translate(0, 0.009, 0))),
    );
    this.cursor = ringMesh(keep, 0.36, 0.42, "#ffffff");
    this.hintRing = ringMesh(keep, 0.35, 0.43, "#ffb21f");
    this.flash = ringMesh(keep, 0.33, 0.42, "#e8402f");
    const head = new T.Shape([new T.Vector2(-0.11, -0.05), new T.Vector2(0.11, -0.05), new T.Vector2(0, 0.16)]),
      stem = new T.Shape([new T.Vector2(-0.04, -0.05), new T.Vector2(0.04, -0.05), new T.Vector2(0.04, -0.24), new T.Vector2(-0.04, -0.24)]);
    // An arrow lying flat that points toward +z after the turn.
    this.hintArrow = new T.Mesh(
      this.own(new T.ShapeGeometry([head, stem]).rotateX(Math.PI / 2)),
      this.own(new T.MeshBasicMaterial({ color: "#ffb21f", side: T.DoubleSide, depthTest: false, transparent: true })),
    );
    this.hintArrow.renderOrder = 6;
    this.hintArrow.visible = false;
    this.train = this.buildTrain();
    this.train.visible = false;
    this.scene.add(this.board, this.scenery, this.pieces, this.crosses, this.cursor, this.hintRing, this.hintArrow, this.flash, this.train);
    // The hand is followed on the cells' tops.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -TILE_TOP);
    this.begin();
  }
  /** A straight piece from the north side to the south. */
  private straight(): Piece {
    const sleepers: T.BufferGeometry[] = [],
      count = 5;
    for (let k = 0; k < count; k++) sleepers.push(along(SLEEPER_L, SLEEPER_H, SLEEPER_W, 0, SLEEPER_Y, -HALF + ((k + 0.5) * CELL) / count, 0));
    const rails = [-1, 1].map((side) => new T.BoxGeometry(RAIL_W, RAIL_H, CELL).translate(side * GAUGE, RAIL_Y + RAIL_H / 2, 0)),
      joiners = [-1, 1].flatMap((side) => [-1, 1].map((end) => new T.BoxGeometry(RAIL_W * 2.1, RAIL_H * 0.9, 0.05).translate(side * GAUGE, RAIL_Y + RAIL_H * 0.45, end * (HALF - 0.03))));
    return {
      ballast: this.own(block(BALLAST_W, BALLAST_H, CELL, 0.008).translate(0, BALLAST_H / 2, 0)),
      sleepers: this.own(merged(sleepers)),
      rails: this.own(merged(rails)),
      joiners: this.own(merged(joiners)),
    };
  }
  /** A curve from the north side to the east: a quarter circle about the north-east corner. */
  private curve(): Piece {
    const cx = HALF,
      cz = -HALF,
      from = Math.PI / 2,
      to = Math.PI,
      sleepers: T.BufferGeometry[] = [],
      count = 4;
    // Angles are taken from +x toward +z about the corner: the east side's middle lies at π/2 from it, the north side's at π.
    for (let k = 0; k < count; k++) {
      const t = from + ((k + 0.5) / count) * (to - from);
      sleepers.push(along(SLEEPER_L, SLEEPER_H, SLEEPER_W, cx + Math.cos(t) * HALF, SLEEPER_Y, cz + Math.sin(t) * HALF, t));
    }
    const rails = [-1, 1].map((side) => sector(cx, cz, HALF + side * GAUGE - RAIL_W / 2, HALF + side * GAUGE + RAIL_W / 2, from, to, RAIL_Y, RAIL_H)),
      joiners: T.BufferGeometry[] = [];
    for (const side of [-1, 1])
      for (const t of [from + 0.07, to - 0.07]) joiners.push(along(RAIL_W * 2.1, RAIL_H * 0.9, 0.05, cx + Math.cos(t) * (HALF + side * GAUGE), RAIL_Y, cz + Math.sin(t) * (HALF + side * GAUGE), t));
    return {
      ballast: this.own(sector(cx, cz, HALF - BALLAST_W / 2, HALF + BALLAST_W / 2, from, to, 0, BALLAST_H)),
      sleepers: this.own(merged(sleepers)),
      rails: this.own(merged(rails)),
      joiners: this.own(merged(joiners)),
    };
  }
  /** A dead end: half a straight from the middle to the north side, a buffer stop at the middle. */
  private stub(): Piece {
    const sleepers: T.BufferGeometry[] = [];
    for (let k = 0; k < 3; k++) sleepers.push(along(SLEEPER_L, SLEEPER_H, SLEEPER_W, 0, SLEEPER_Y, -HALF + ((k + 0.5) * HALF) / 3 + 0.02, 0));
    const rails = [-1, 1].map((side) => new T.BoxGeometry(RAIL_W, RAIL_H, HALF).translate(side * GAUGE, RAIL_Y + RAIL_H / 2, -HALF / 2)),
      stop = [new T.BoxGeometry(0.26, 0.06, 0.045).translate(0, RAIL_Y + RAIL_H + 0.03, -0.02), new T.BoxGeometry(0.05, 0.05, 0.08).translate(-0.07, RAIL_Y + RAIL_H + 0.025, -0.08), new T.BoxGeometry(0.05, 0.05, 0.08).translate(0.07, RAIL_Y + RAIL_H + 0.025, -0.08)];
    return {
      ballast: this.own(block(BALLAST_W, BALLAST_H, HALF + 0.06, 0.008).translate(0, BALLAST_H / 2, -HALF / 2 + 0.03)),
      sleepers: this.own(merged(sleepers)),
      rails: this.own(merged(rails)),
      joiners: this.own(merged(stop)),
    };
  }
  private mesh(geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, shadow = true) {
    const m = new T.Mesh(geometry, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** One cell's rails, from its mask. */
  private piece(mask: number, given: boolean) {
    const shape = shapeOf(mask);
    if (!shape) return null;
    const group = new T.Group(),
      parts = this.shapes[shape.kind];
    this.mesh(parts.ballast, given ? this.paint.ballastGiven : this.paint.ballast, group, false);
    this.mesh(parts.sleepers, given ? this.paint.sleeperGiven : this.paint.sleeper, group);
    this.mesh(parts.rails, this.paint.rail, group);
    if (shape.kind === "stub") this.mesh(parts.joiners, this.paint.buffer, group);
    else if (given) this.mesh(parts.joiners, this.paint.brass, group);
    group.rotation.y = (-shape.turns * Math.PI) / 2;
    return group;
  }
  /** Lays the baseboard for a size: its body and frame, the lawn, the cells and the lath round them. */
  private lay(size: number) {
    if (size === this.size) return;
    for (const resource of this.laid) resource.dispose();
    this.laid = [];
    this.board.clear();
    this.pieces.clear();
    this.cells = [];
    this.size = size;
    const fit = <R extends { dispose(): void }>(r: R) => (this.laid.push(r), r),
      b = boardBox(size),
      g = gridBox(size),
      w = b.right - b.left,
      d = b.bottom - b.top,
      cx = (b.left + b.right) / 2,
      cz = (b.top + b.bottom) / 2,
      span = size * CELL,
      put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
        const m = this.mesh(fit(geometry), material, this.board, shadow);
        m.position.set(x, y, z);
        return m;
      };
    // The baseboard: a wooden body, the lawn on it, and the cells' bed of earth.
    put(block(w + 0.16, GROUND - 0.03, d + 0.16, 0.04), this.paint.frame, cx, (GROUND - 0.03) / 2, cz);
    put(block(w, 0.03, d, 0.01), this.paint.lawn, cx, GROUND - 0.015, cz, false);
    put(block(span + 0.02, 0.02, span + 0.02, 0.004), this.paint.earth, g.left + span / 2, GROUND - 0.006, g.top + span / 2, false);
    // The cells: grassy tiles a little apart, so that the grid shows.
    const tiles = new T.InstancedMesh(fit(block(CELL - 0.045, 0.03, CELL - 0.045, 0.01)), this.paint.tile, size * size),
      place = new T.Object3D();
    for (let i = 0; i < size * size; i++) {
      const p = cellAt(size, i);
      place.position.set(p.x, TILE_TOP - 0.015, p.z);
      place.rotation.y = ((i * 7 + (i >> 2)) % 4) * (Math.PI / 2);
      place.updateMatrix();
      tiles.setMatrixAt(i, place.matrix);
    }
    tiles.receiveShadow = true;
    this.board.add(tiles);
    // A dark lath round the grid, a little proud of the cells.
    const lath = 0.07;
    for (const side of [-1, 1]) {
      put(block(span + lath * 2, 0.03, lath, 0.008), this.paint.lath, g.left + span / 2, TILE_TOP - 0.01, (side < 0 ? g.top : g.bottom) + (side * lath) / 2);
      put(block(lath, 0.03, span, 0.008), this.paint.lath, (side < 0 ? g.left : g.right) + (side * lath) / 2, TILE_TOP - 0.01, g.top + span / 2);
    }
    this.resize();
  }
  /** The numbers and the scenery at the ports, when the puzzle changes. */
  private stage(state: State) {
    if (this.puzzle === state.given) return;
    this.puzzle = state.given;
    for (const resource of this.staged) resource.dispose();
    this.staged = [];
    this.scenery.clear();
    this.plates = [];
    const n = state.size;
    for (const kind of ["row", "col"] as const)
      for (let i = 0; i < n; i++) {
        const at = clueAt(n, kind, i),
          mesh = new T.Mesh(this.plate, this.numberPaint("", "open"));
        mesh.position.set(at.x, GROUND + 0.025, at.z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scenery.add(mesh);
        this.plates.push({ mesh, kind, i, key: "" });
      }
    this.tunnel(state.ports[0]);
    this.station(state.ports[1]);
    this.trees(state);
  }
  /** A number on a plate: cream while short, green once met, red when passed. */
  private numberPaint(text: string, tone: "open" | "done" | "over") {
    const key = `${text}|${tone}`;
    let paint = this.numbers.get(key);
    if (!paint) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = tone === "done" ? "#2f7d4a" : tone === "over" ? "#a3241c" : "#f2ead6";
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = tone === "open" ? "#2f4f3e" : "#fff6e0";
      ctx.lineWidth = 6;
      ctx.strokeRect(9, 9, 110, 110);
      ctx.fillStyle = tone === "open" ? "#22262c" : "#fff6e0";
      ctx.font = '800 80px Inter, "Noto Sans KR", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 70);
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
      const top = this.standard({ map: texture, roughness: 0.4, metalness: 0.05 }),
        side = this.paint.trim;
      paint = [side, side, top, side, side, side];
      this.numbers.set(key, paint);
    }
    return paint;
  }
  private fit<R extends { dispose(): void }>(r: R) {
    this.staged.push(r);
    return r;
  }
  /** A group set at a port's outside, turned so that its +x runs out along the rails. */
  private atPort(port: Port) {
    const group = new T.Group(),
      start = sideAt(this.size, port.cell, port.bit),
      [dx, dz] = WAY[port.bit];
    group.position.set(start.x, 0, start.z);
    group.rotation.y = -Math.atan2(dz, dx);
    this.scenery.add(group);
    return group;
  }
  /** Rails beyond the grid, from its edge out to `length`, on a bed of ballast over the lawn. */
  private outerRails(group: T.Group, length: number, given = true) {
    const bed = this.mesh(this.fit(block(length, BALLAST_H + 0.012, BALLAST_W, 0.008)), this.paint.ballastGiven, group, false);
    bed.position.set(length / 2, GROUND + (BALLAST_H + 0.012) / 2, 0);
    const sleepers: T.BufferGeometry[] = [];
    for (let x = 0.08; x < length - 0.02; x += CELL / 5) sleepers.push(along(SLEEPER_L, SLEEPER_H, SLEEPER_W, x, TILE_TOP + SLEEPER_Y, 0, Math.PI / 2));
    this.mesh(this.fit(merged(sleepers)), given ? this.paint.sleeperGiven : this.paint.sleeper, group);
    const rails = this.mesh(this.fit(merged([-1, 1].map((side) => new T.BoxGeometry(length, RAIL_H, RAIL_W).translate(length / 2, TILE_TOP + RAIL_Y + RAIL_H / 2, side * GAUGE)))), this.paint.rail, group);
    rails.castShadow = true;
  }
  /** The entrance: rails into a grassy hill through a stone portal, the tunnel dark inside. */
  private tunnel(port: Port) {
    const group = this.atPort(port),
      face = PORTAL,
      along = 0.5,
      high = 0.62,
      holeW = 0.34,
      holeH = 0.42;
    this.outerRails(group, TUNNEL_DEPTH + 0.2);
    // The hill: a dome rising behind the portal, high enough to hide the train inside it.
    const hill = this.mesh(this.fit(new T.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2)), this.paint.lawn, group);
    hill.scale.set(along, high, 0.7);
    hill.position.set(face + along, GROUND - 0.01, 0);
    const arch = (w: number, h: number) => {
      const path = new T.Path();
      path.moveTo(-w / 2, 0);
      path.lineTo(-w / 2, h - w / 2);
      path.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
      path.lineTo(w / 2, 0);
      path.closePath();
      return path;
    };
    // The dark inside, just behind the portal (further in, the hill hides everything).
    const mouth = new T.Shape();
    mouth.moveTo(-holeW / 2, 0);
    mouth.lineTo(-holeW / 2, holeH - holeW / 2);
    mouth.absarc(0, holeH - holeW / 2, holeW / 2, Math.PI, 0, true);
    mouth.lineTo(holeW / 2, 0);
    mouth.closePath();
    const inside = this.mesh(this.fit(new T.ExtrudeGeometry(mouth, { depth: 0.2, bevelEnabled: false, curveSegments: 16 })), this.paint.dark, group, false);
    inside.rotation.y = Math.PI / 2;
    inside.position.set(face + 0.07, GROUND - 0.005, 0);
    // The portal: a stone face with an arch, a keystone and a parapet.
    const portal = new T.Shape([new T.Vector2(-0.32, 0), new T.Vector2(0.32, 0), new T.Vector2(0.32, 0.54), new T.Vector2(-0.32, 0.54)]);
    portal.holes.push(arch(holeW, holeH));
    const stone = this.mesh(this.fit(new T.ExtrudeGeometry(portal, { depth: 0.08, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 18 })), this.paint.stone, group);
    stone.rotation.y = Math.PI / 2;
    stone.position.set(face, GROUND, 0);
    const parapet = this.mesh(this.fit(block(0.11, 0.05, 0.72, 0.015)), this.paint.platform, group);
    parapet.position.set(face + 0.04, GROUND + 0.565, 0);
    const key = this.mesh(this.fit(block(0.1, 0.08, 0.075, 0.01)), this.paint.platform, group);
    key.position.set(face + 0.03, GROUND + holeH + 0.03, 0);
    // Bushes either side of the portal and a few on the hill.
    const bushes: [number, number, number, number][] = [
      [face - 0.04, 0.07, -0.42, 0.11],
      [face - 0.04, 0.07, 0.42, 0.1],
      [face + 0.45, 0.62, -0.26, 0.12],
      [face + 0.7, 0.55, 0.22, 0.1],
    ];
    for (const [x, y, z, r] of bushes) {
      const bush = this.mesh(this.fit(new T.IcosahedronGeometry(r, 1).scale(1, 0.8, 1)), this.paint.leaf, group);
      bush.position.set(x, GROUND + y, z);
    }
  }
  /** The exit: rails along a platform to a buffer stop, a station house behind the platform, a lamp and a sign. */
  private station(port: Port) {
    const group = this.atPort(port),
      // The house stands on the side away from the board's lower left corner, where the other port may be.
      [dx, dz] = WAY[port.bit],
      awayX = dx === 0 ? 1 : 0,
      awayZ = dz === 0 ? -1 : 0,
      // In the group's frame +z is a quarter turn clockwise of +x (out along the rails): which way is "away"?
      right = { x: -dz, z: dx },
      side = right.x * awayX + right.z * awayZ >= 0 ? 1 : -1;
    const end = TUNNEL_DEPTH + 0.15;
    this.outerRails(group, end);
    const stop = this.mesh(this.fit(block(0.08, 0.1, 0.3, 0.015)), this.paint.buffer, group);
    stop.position.set(end - 0.06, TILE_TOP + RAIL_Y + RAIL_H + 0.04, 0);
    const beam = this.mesh(this.fit(block(0.03, 0.04, 0.34, 0.01)), this.paint.black, group);
    beam.position.set(end - 0.11, TILE_TOP + RAIL_Y + RAIL_H + 0.045, 0);
    // The platform beside the rails.
    const platform = this.mesh(this.fit(block(0.95, 0.12, 0.26, 0.02)), this.paint.platform, group);
    platform.position.set(0.72, GROUND + 0.06, side * 0.31);
    const edge = this.mesh(this.fit(new T.BoxGeometry(0.95, 0.004, 0.025)), this.paint.cream, group, false);
    edge.position.set(0.72, GROUND + 0.122, side * 0.19);
    // The house: cream walls, a red roof in two panels, a green door and windows.
    const house = new T.Group();
    house.position.set(0.74, GROUND, side * 0.62);
    group.add(house);
    this.mesh(this.fit(block(0.6, 0.26, 0.3, 0.015).translate(0, 0.13, 0)), this.paint.cream, house);
    const slope = 0.62;
    for (const s of [-1, 1]) {
      const panel = this.mesh(this.fit(block(0.7, 0.025, 0.21, 0.008)), this.paint.roof, house);
      panel.rotation.x = s * slope;
      panel.position.set(0, 0.26 + 0.06, s * 0.082);
    }
    const gable = new T.Shape([new T.Vector2(-0.15, 0), new T.Vector2(0.15, 0), new T.Vector2(0, 0.11)]);
    for (const s of [-1, 1]) {
      const end = this.mesh(this.fit(new T.ShapeGeometry(gable)), this.paint.cream, house, false);
      end.rotation.y = s * (Math.PI / 2);
      end.position.set(s * 0.3, 0.26, 0);
    }
    const door = this.mesh(this.fit(new T.PlaneGeometry(0.08, 0.15)), this.paint.trim, house, false);
    door.position.set(0, 0.075, -side * 0.152);
    door.rotation.y = side > 0 ? Math.PI : 0;
    for (const x of [-0.18, 0.18]) {
      const win = this.mesh(this.fit(new T.PlaneGeometry(0.09, 0.08)), this.paint.window, house, false);
      win.position.set(x, 0.15, -side * 0.152);
      win.rotation.y = side > 0 ? Math.PI : 0;
    }
    const chimney = this.mesh(this.fit(block(0.05, 0.1, 0.05, 0.008)), this.paint.roof, house);
    chimney.position.set(0.18, 0.38, 0);
    // A sign with the station's name painted on it.
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f4f0e4";
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = "#2f4f3e";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 86);
    ctx.fillStyle = "#1f2b24";
    ctx.font = '800 56px Inter, "Noto Sans KR", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("종착역", 128, 52);
    const texture = this.fit(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const sign = this.mesh(this.fit(new T.PlaneGeometry(0.3, 0.11)), this.fit(new T.MeshStandardMaterial({ map: texture, roughness: 0.6, side: T.DoubleSide })), group, false);
    sign.position.set(1.12, GROUND + 0.12 + 0.2, side * 0.31);
    sign.rotation.set(-0.5, Math.PI / 2, 0, "YXZ");
    for (const z of [-0.12, 0.12]) {
      const leg = this.mesh(this.fit(new T.CylinderGeometry(0.008, 0.008, 0.16, 6)), this.paint.trim, group);
      leg.position.set(1.12, GROUND + 0.12 + 0.08, side * 0.31 + z);
    }
    // A lamp post.
    const lamp = this.mesh(this.fit(new T.CylinderGeometry(0.01, 0.014, 0.34, 8)), this.paint.black, group);
    lamp.position.set(0.3, GROUND + 0.12 + 0.17, side * 0.38);
    const bulb = this.mesh(this.fit(new T.SphereGeometry(0.03, 12, 8)), this.paint.window, group, false);
    bulb.position.set(0.3, GROUND + 0.12 + 0.36, side * 0.38);
  }
  /** A few round trees on the lawn, clear of the grid, the plates, the rails and the buildings. */
  private trees(state: State) {
    const n = state.size,
      b = boardBox(n),
      g = gridBox(n),
      rand = sequence(n * 131 + state.ports[0].cell * 7 + state.ports[1].cell),
      busy = state.ports.flatMap((port) => [0.3, 0.7, 1.1].map((k) => outside(n, port, k))),
      spots: { x: number; z: number }[] = [];
    for (let tries = 0; spots.length < 7 && tries < 200; tries++) {
      const x = b.left + 0.2 + rand() * (b.right - b.left - 0.4),
        z = b.top + 0.2 + rand() * (b.bottom - b.top - 0.4);
      // Only in the margins of the ports (left and bottom), well clear of everything there.
      if (!(x < g.left - 0.25 || z > g.bottom + 0.25)) continue;
      if (busy.some((p) => Math.hypot(p.x - x, p.z - z) < 0.85)) continue;
      if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 0.42)) continue;
      spots.push({ x, z });
    }
    for (const spot of spots) {
      const scale = 0.75 + rand() * 0.4,
        trunk = this.mesh(this.fit(new T.CylinderGeometry(0.025 * scale, 0.035 * scale, 0.16 * scale, 8)), this.paint.bark, this.scenery);
      trunk.position.set(spot.x, GROUND + 0.08 * scale, spot.z);
      const crown = this.mesh(this.fit(new T.IcosahedronGeometry(0.16 * scale, 1).scale(1, 1.15, 1)), this.paint.leaf, this.scenery);
      crown.position.set(spot.x, GROUND + 0.26 * scale, spot.z);
    }
  }
  /** The train: a small locomotive and two carriages, each a group whose +z runs forward. */
  private buildTrain() {
    const train = new T.Group(),
      wheelY = RAIL_TOP + 0.034,
      own = <G extends T.BufferGeometry>(g: G) => this.own(g),
      wheel = own(new T.CylinderGeometry(0.034, 0.034, 0.022, 16).rotateZ(Math.PI / 2)),
      wheels = (car: T.Group, zs: number[]) => {
        for (const z of zs)
          for (const x of [-GAUGE - 0.004, GAUGE + 0.004]) {
            const w = this.mesh(wheel, this.paint.black, car);
            w.position.set(x, wheelY, z);
          }
      };
    // The locomotive: a red tank engine with a black chimney, a brass dome and band, and a cab at the back.
    const loco = new T.Group();
    const part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, car: T.Group) => {
      const m = this.mesh(own(geometry), material, car);
      m.position.set(x, y, z);
      return m;
    };
    part(block(0.24, 0.04, 0.5, 0.01), this.paint.black, 0, wheelY + 0.025, 0, loco);
    part(new T.CylinderGeometry(0.066, 0.066, 0.3, 20).rotateX(Math.PI / 2), this.paint.red, 0, wheelY + 0.105, 0.07, loco);
    part(new T.CylinderGeometry(0.069, 0.069, 0.018, 20).rotateX(Math.PI / 2), this.paint.gold, 0, wheelY + 0.105, 0.16, loco);
    part(new T.CylinderGeometry(0.056, 0.056, 0.02, 20).rotateX(Math.PI / 2), this.paint.black, 0, wheelY + 0.105, 0.225, loco);
    part(new T.CylinderGeometry(0.024, 0.019, 0.08, 12), this.paint.black, 0, wheelY + 0.205, 0.16, loco);
    part(new T.CylinderGeometry(0.034, 0.025, 0.025, 12), this.paint.black, 0, wheelY + 0.25, 0.16, loco);
    part(new T.SphereGeometry(0.032, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.paint.gold, 0, wheelY + 0.165, 0.03, loco);
    part(block(0.24, 0.16, 0.16, 0.018), this.paint.red, 0, wheelY + 0.115, -0.16, loco);
    part(block(0.27, 0.022, 0.2, 0.008), this.paint.black, 0, wheelY + 0.205, -0.16, loco);
    for (const x of [-0.121, 0.121]) part(new T.PlaneGeometry(0.09, 0.06).rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2), this.paint.window, x, wheelY + 0.145, -0.16, loco);
    part(block(0.26, 0.035, 0.03, 0.008), this.paint.red, 0, wheelY + 0.03, 0.26, loco);
    part(new T.SphereGeometry(0.02, 10, 8), this.paint.window, 0, wheelY + 0.165, 0.235, loco);
    wheels(loco, [0.16, 0.02, -0.14]);
    // Two green carriages with lit windows and grey roofs.
    const carriage = () => {
      const car = new T.Group();
      part(block(0.23, 0.035, 0.46, 0.01), this.paint.black, 0, wheelY + 0.025, 0, car);
      part(block(0.23, 0.12, 0.44, 0.018), this.paint.green, 0, wheelY + 0.095, 0, car);
      part(block(0.242, 0.045, 0.36, 0.008), this.paint.window, 0, wheelY + 0.11, 0, car);
      part(block(0.25, 0.028, 0.47, 0.012), this.paint.roofGreen, 0, wheelY + 0.168, 0, car);
      part(block(0.246, 0.01, 0.445, 0.004), this.paint.gold, 0, wheelY + 0.06, 0, car);
      wheels(car, [0.15, -0.15]);
      return car;
    };
    this.cars = [loco, carriage(), carriage()];
    train.add(...this.cars);
    return train;
  }
  protected subject(aspect: number): TableSubject {
    return tracksSubject(this.size || 6, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.links.map((_, i) => ({ ...cellAt(state.size, i), y: TILE_TOP, r: CELL * 0.6, point: i }));
  }
  /** The state drawn: the one the screen holds, or the one a drag is laying out. */
  protected place(state: State) {
    this.lay(state.size);
    this.stage(state);
    const n = state.size;
    state.links.forEach((mask, i) => {
      const given = !!state.given[i],
        key = `${mask}|${given}`;
      let entry = this.cells[i];
      if (entry && entry.key === key) return;
      if (entry?.group) this.pieces.remove(entry.group);
      const group = this.piece(mask, given);
      if (group) {
        const p = cellAt(n, i);
        group.position.set(p.x, TILE_TOP, p.z);
        this.pieces.add(group);
      }
      entry = this.cells[i] = { key, group };
    });
    this.crosses.clear();
    state.marks.forEach((marked, i) => {
      if (!marked) return;
      const p = cellAt(n, i),
        cross = this.mesh(this.crossShape, this.paint.cross, this.crosses);
      cross.position.set(p.x, TILE_TOP, p.z);
    });
    const { rows, cols } = counts(state);
    for (const plate of this.plates) {
      const want = plate.kind === "row" ? state.rows[plate.i] : state.cols[plate.i],
        have = plate.kind === "row" ? rows[plate.i] : cols[plate.i],
        tone = clueState(have, want),
        key = `${want}|${tone}`;
      if (plate.key === key) continue;
      plate.key = key;
      plate.mesh.material = this.numberPaint(String(want), tone);
    }
    this.trainFor(state);
  }
  /** Sends the train once the railway is whole, or puts it away when it is not. */
  private trainFor(state: State) {
    if (state.winner !== 0 || capturing()) {
      this.train.visible = false;
      this.run = null;
      this.ranFor = null;
      return;
    }
    if (this.ranFor === state.given) return;
    this.ranFor = state.given;
    const line = trainLine(state.size, state.links, state.ports);
    if (!line) return;
    const length = [0];
    for (let k = 1; k < line.length; k++) length.push(length[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].z - line[k - 1].z));
    const total = length[length.length - 1];
    this.run = { line, length, at: 0, speed: Math.max(2.2, total / 10), last: 0 };
    this.train.visible = true;
    if (this.reducedMotion) this.run.at = total;
    this.setTrain();
    if (!this.reducedMotion) this.wake();
  }
  /** Sets each car on the line where the run has brought it. */
  private setTrain() {
    const run = this.run;
    if (!run) return;
    const total = run.length[run.length.length - 1],
      point = (s: number) => {
        const d = Math.max(0, Math.min(total, s));
        let lo = 0,
          hi = run.length.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (run.length[mid] <= d) lo = mid;
          else hi = mid;
        }
        const span = run.length[hi] - run.length[lo] || 1,
          t = (d - run.length[lo]) / span;
        return { x: run.line[lo].x + (run.line[hi].x - run.line[lo].x) * t, z: run.line[lo].z + (run.line[hi].z - run.line[lo].z) * t };
      };
    this.cars.forEach((car, k) => {
      const s = Math.min(run.at, total) - k * 0.56,
        // A car is seen once its front is out of the tunnel's mouth.
        out = s + 0.26 >= TUNNEL_DEPTH - PORTAL,
        here = point(s),
        ahead = point(s + 0.12),
        behind = point(s - 0.12);
      car.visible = out;
      car.position.set(here.x, 0, here.z);
      car.rotation.y = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    });
  }
  /** Asks for frames while the train runs or a refused cell flashes. */
  private wake() {
    if (!this.clock) this.clock = requestAnimationFrame(this.idle);
  }
  private idle = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    let more = false;
    const run = this.run;
    if (run && this.train.visible) {
      const total = run.length[run.length.length - 1],
        dt = run.last ? Math.min(0.25, (now - run.last) / 1000) : 0;
      run.last = now;
      if (run.at < total) {
        run.at = Math.min(total, run.at + dt * run.speed);
        this.setTrain();
        more = run.at < total;
      }
    }
    const flash = this.flashUntil - now;
    if (this.flash.visible) {
      if (flash <= 0) this.flash.visible = false;
      else {
        (this.flash.material as T.MeshBasicMaterial).opacity = Math.min(1, flash / 300);
        more = true;
      }
    }
    this.redraw();
    if (more) this.wake();
  };
  /** A red ring on a cell that refused a rail, fading. */
  private refuse(cell: number) {
    const p = cellAt(this.size, cell);
    this.flash.position.set(p.x, TILE_TOP + 0.03, p.z);
    this.flash.visible = true;
    this.flashUntil = performance.now() + 650;
    this.wake();
  }
  protected animate(before: State, state: State) {
    // A drawn move was heard while it was drawn; one from the keyboard or the hint is heard now.
    if (!this.quiet && state.ply === before.ply + 1 && state.links !== before.links) this.onContact();
    return false;
  }
  /** The next cell from `from` toward `to`, along the longer way first. */
  private toward(from: number, to: number) {
    const n = this.size,
      dr = Math.floor(to / n) - Math.floor(from / n),
      dc = (to % n) - (from % n);
    if (Math.abs(dc) >= Math.abs(dr)) return from + Math.sign(dc);
    return from + Math.sign(dr) * n;
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    const cell = cellUnder(state.size, at.x, at.z);
    if (cell < 0 && point < 0) return false;
    this.drag = { start: cell >= 0 ? cell : point, at: cell >= 0 ? cell : point, cells: [], base: state, tried: null, moved: false };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const drag = this.drag;
    if (!drag) return;
    const target = cellUnder(this.size, at.x, at.z, 0.4);
    if (target < 0 || target === drag.at) return;
    for (let guard = 0; drag.at !== target && guard < this.size * 2; guard++) {
      const next = this.toward(drag.at, target);
      if (!this.stepTo(next)) break;
    }
  }
  /** One step of a drag into the cell beside: back along the way it came, or on (refused steps stop it). */
  private stepTo(next: number) {
    const drag = this.drag!;
    drag.moved = true;
    const back = drag.cells.length >= 2 ? drag.cells[drag.cells.length - 2] : drag.cells.length === 1 ? drag.start : -1;
    if (next === back) {
      drag.cells.pop();
      drag.at = next;
      this.show(drawn(drag.base, drag.start, drag.cells));
      return true;
    }
    // A stroke too long for one move is played as far as it has come and begun again from here.
    if (drag.cells.length >= MAX_STROKE) {
      this.commit();
      if (!this.drag) return false;
    }
    const cells = [...drag.cells, next],
      shown = drawn(drag.base, drag.start, drag.cells),
      made = drawn(drag.base, drag.start, cells);
    if (!made) {
      // Refused before anything was laid: let go, the screen is handed that link so that it says why.
      if (shown === drag.base) drag.tried = link(drag.at, next);
      this.refuse(next);
      return false;
    }
    drag.cells = cells;
    drag.at = next;
    if (shown && made.links !== shown.links && made.links.some((mask, i) => mask !== shown.links[i])) this.onContact();
    this.show(made);
    return true;
  }
  private strokeOf(drag: NonNullable<TracksView["drag"]>): Move {
    return drag.cells.length === 1 ? link(drag.start, drag.cells[0]) : stroke(this.size, drag.start, drag.cells);
  }
  /** Lays out a state the drag is drawing, without making it the state held. */
  private show(state: State | null) {
    if (!state) return;
    this.place(state);
    this.redraw();
  }
  /** Hands the screen the stroke drawn so far; if it is not taken, the board goes back to what it was. */
  private commit() {
    const drag = this.drag;
    if (!drag || !drag.cells.length) return;
    const move = this.strokeOf(drag),
      base = drag.base;
    // A drag that only ran along given rails has nothing to hand over.
    if (drawn(base, drag.start, drag.cells) === base) {
      drag.start = drag.at;
      drag.cells = [];
      return;
    }
    this.quiet = true;
    this.onMove(move);
    this.quiet = false;
    if (this.state === base) {
      // Not taken (the screen was busy): nothing more of this drag is drawn.
      this.place(base);
      this.drag = null;
      return;
    }
    drag.base = this.state!;
    drag.start = drag.at;
    drag.cells = [];
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const drag = this.drag;
    if (!drag) return;
    if (!at) {
      this.drag = null;
      if (this.state) this.place(this.state);
      return;
    }
    if (drag.cells.length && drawn(drag.base, drag.start, drag.cells) !== drag.base) this.commit();
    else if (drag.tried) this.onMove(drag.tried);
    else if (!drag.moved) {
      this.drag = null;
      this.onPick(drag.start);
    } else if (this.state) this.place(this.state);
    this.drag = null;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const n = state.links.length,
      ring = (mesh: T.Mesh, point: number | null | undefined) => {
        mesh.visible = point !== null && point !== undefined && point >= 0 && point < n;
        if (mesh.visible) {
          const p = cellAt(state.size, point!);
          mesh.position.set(p.x, TILE_TOP + 0.04, p.z);
        }
      };
    ring(this.cursor, marks.cursor);
    const hint = marks.hint;
    if (hint && hint.from === -1) {
      ring(this.hintRing, hint.to);
      this.hintArrow.visible = false;
    } else if (hint && hint.from >= 0 && hint.to >= 0 && hint.to < n) {
      ring(this.hintRing, hint.from);
      // The arrow lies over the seam the rail crosses, pointing from the first cell into the second.
      const bit = sideTo(state.size, hint.from, hint.to),
        seam = sideAt(state.size, hint.from, bit),
        [dx, dz] = WAY[bit];
      this.hintArrow.visible = !!bit;
      this.hintArrow.position.set(seam.x - dx * 0.02, TILE_TOP + 0.22, seam.z - dz * 0.02);
      this.hintArrow.rotation.y = Math.atan2(dx, dz);
    } else {
      this.hintRing.visible = false;
      this.hintArrow.visible = false;
    }
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    for (const resource of this.laid) resource.dispose();
    for (const resource of this.staged) resource.dispose();
    this.laid = [];
    this.staged = [];
    super.dispose();
  }
}
