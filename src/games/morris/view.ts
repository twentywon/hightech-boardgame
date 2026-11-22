import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, planks, wood, woodPhoto } from "../../engine/scene-utils";
import { PieceTable, Stock, glowTexture, seeded, type Own } from "../points/table";
import { morrisBoard } from "./board";
import { MILLS, morris, type State } from "./rules";

/** How thick a man is. */
const MAN_H = 0.17;
/** The table top, under the board's frame. */
const TABLE_Y = -0.27;
/** The trays at either side of the board: their middle across, and the floor the men stand on. */
const TRAY_X = 4.72,
  TRAY_FLOOR = TABLE_Y + 0.05,
  SLOT = 0.64;

/** A canvas to paint on, and the texture made of it. */
function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function texture(c: HTMLCanvasElement, anisotropy = 4) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}
/** A turned man lying flat: a chamfered foot, a straight side, a rounded shoulder and a low dome, its foot at y 0. */
export function manGeometry(radius: number, height: number, segments = 40) {
  const R = radius,
    H = height,
    profile: [number, number][] = [
      [0, 0],
      [R * 0.9, 0],
      [R, H * 0.14],
      [R, H * 0.62],
    ];
  const steps = segments > 30 ? 6 : 3;
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    profile.push([R - R * 0.14 * (1 - Math.cos(a)), H * 0.62 + H * 0.26 * Math.sin(a)]);
  }
  profile.push([R * 0.6, H * 0.95], [R * 0.3, H * 0.99], [0, H]);
  const g = new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), segments),
    at = g.getAttribute("position"),
    uv = g.getAttribute("uv");
  // The top's picture is laid on from above.
  for (let i = 0; i < at.count; i++) uv.setXY(i, 0.5 + at.getX(i) / (2 * R), 0.5 + at.getZ(i) / (2 * R));
  return g;
}
/** The face of a man: the rings left by turning it, and a small inlay at its middle. */
function manFace(dark: boolean) {
  const { c, ctx } = canvas(256),
    rnd = seeded(dark ? 5 : 9);
  ctx.fillStyle = dark ? "#2a2420" : "#efe6d2";
  ctx.fillRect(0, 0, 256, 256);
  // The grain of ebony or of bone runs across the piece.
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 256;
    ctx.strokeStyle = dark ? `rgba(${70 + rnd() * 40},${50 + rnd() * 30},${30 + rnd() * 20},${0.25 + rnd() * 0.3})` : `rgba(${170 + rnd() * 40},${150 + rnd() * 30},${110 + rnd() * 20},${0.08 + rnd() * 0.12})`;
    ctx.lineWidth = 0.6 + rnd() * 2.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + rnd() * 10 - 5, 170, y + rnd() * 10 - 5, 256, y + rnd() * 8 - 4);
    ctx.stroke();
  }
  // Rings left by the turner's chisel.
  for (const [r, w, a] of [[118, 3, 0.35], [96, 2, 0.25], [70, 4, 0.3], [40, 2, 0.25]] as const) {
    ctx.strokeStyle = dark ? `rgba(0,0,0,${a})` : `rgba(120,96,60,${a * 0.7})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(128, 128, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = dark ? `rgba(255,240,220,${a * 0.25})` : `rgba(255,255,255,${a})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(128, 128, r + w, 0, Math.PI * 2);
    ctx.stroke();
  }
  // A brass ring round a small inlay: mother of pearl in the dark men, ebony in the pale ones.
  ctx.fillStyle = "#b8893a";
  ctx.beginPath();
  ctx.arc(128, 128, 21, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(124, 124, 2, 128, 128, 15);
  if (dark) {
    g.addColorStop(0, "#e9e4ea");
    g.addColorStop(0.6, "#b9c6cc");
    g.addColorStop(1, "#a59bb4");
  } else {
    g.addColorStop(0, "#3a312b");
    g.addColorStop(1, "#1c1714");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(128, 128, 15, 0, Math.PI * 2);
  ctx.fill();
  return texture(c);
}
/** Brass, for studs, the candlestick and fittings. */
export const brass = (own: Own) => own(glossy({ color: "#c9a04a", metalness: 0.85, roughness: 0.32 }, 0.4));

/**
 * The marquetry of the morris board: a field of pale maple, the three squares and the lines that join them laid in
 * as ebony strips edged with boxwood, a band of walnut stringing round the field, and an eight-pointed star of light
 * and dark woods in the empty middle. The photograph of the maple shows through once it has come.
 */
function paintField(ctx: CanvasRenderingContext2D, size: number, half: number, maple: HTMLImageElement | null) {
  const spec = morrisBoard(),
    unit = size / (half * 2),
    px = (x: number, z: number): [number, number] => [size / 2 + x * unit, size / 2 + z * unit];
  ctx.fillStyle = "#c79a66";
  ctx.fillRect(0, 0, size, size);
  if (maple) {
    // The maple's figure, over a honey ground: waxed and a little aged.
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(maple, 0, 0, size, size);
    ctx.globalCompositeOperation = "source-over";
  }
  // Stringing round the field: walnut between two thin lines of boxwood.
  const edge = (inset: number, width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width * unit;
    ctx.strokeRect(inset * unit, inset * unit, size - 2 * inset * unit, size - 2 * inset * unit);
  };
  edge(0.2, 0.16, "#4a2c18");
  edge(0.11, 0.025, "#f0dcae");
  edge(0.29, 0.025, "#f0dcae");
  // The star in the middle, its rays alternately walnut and pale boxwood, a fine dark line round each.
  ctx.save();
  ctx.translate(...px(0, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2,
      long = i % 2 === 0 ? 0.62 : 0.4;
    ctx.fillStyle = i % 4 === 0 ? "#4a2c18" : i % 2 === 0 ? "#7a4a26" : "#efdcaf";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - 0.2) * 0.17 * unit, Math.sin(a - 0.2) * 0.17 * unit);
    ctx.lineTo(Math.cos(a) * long * unit, Math.sin(a) * long * unit);
    ctx.lineTo(Math.cos(a + 0.2) * 0.17 * unit, Math.sin(a + 0.2) * 0.17 * unit);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(40,22,10,0.6)";
    ctx.lineWidth = unit * 0.012;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 0.7 * unit, 0, Math.PI * 2);
  ctx.strokeStyle = "#4a2c18";
  ctx.lineWidth = unit * 0.03;
  ctx.stroke();
  ctx.restore();
  // The lines: a wide strip of boxwood, the ebony laid down its middle, and the board's own paint for the points.
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.strokeStyle = ctx.fillStyle = "#f2dfb3";
  ctx.lineWidth = unit * 0.15;
  spec.paint(ctx, px, unit * 1.25);
  ctx.strokeStyle = ctx.fillStyle = "#24160e";
  ctx.lineWidth = unit * 0.085;
  spec.paint(ctx, px, unit);
  // Faint sheen across the waxed wood.
  const sheen = ctx.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, "rgba(255,240,210,0.08)");
  sheen.addColorStop(0.5, "rgba(255,240,210,0)");
  sheen.addColorStop(1, "rgba(60,30,10,0.08)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);
}

/**
 * Nine men's morris in a tavern (the user asked for the older tables to be upgraded): an inlaid board of our own on a
 * heavy oak table, its lines laid in as ebony and boxwood strips with a brass stud at every point and a star in the
 * middle; turned men of ebony and of bone with an inlaid face. Each side's men wait in a tray at its side of the board
 * (black at the right, white at the left) and are taken up from it as they are placed; a man taken is lifted off and
 * laid in the taker's tray. A mill glows along its three points as it takes. A candle burns and a pewter tankard
 * stands beyond the board.
 */
export class MorrisView extends PieceTable<State> {
  protected readonly tall = MAN_H;
  private geometry: T.BufferGeometry;
  private materials: T.Material[];
  private stock: Stock;
  private flame: T.Mesh | null = null;
  private halo: T.Mesh | null = null;
  private lamp: T.PointLight | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#23170f", morrisBoard(), morris);
    const own: Own = (r) => this.own(r);
    // Daylight from a window at the upper left, warm bounce from the wood.
    this.daylight("#ffe9cc", "#3b2616", "#ffe0b0", 8, 2.3);
    this.table(own);
    this.board(own);
    this.geometry = own(manGeometry(this.spec.radius * 1.03, MAN_H, this.rich ? 40 : 24));
    this.materials = [true, false].map((dark) =>
      own(glossy({ color: "#ffffff", map: own(manFace(dark)), roughness: dark ? 0.38 : 0.45 }, dark ? 0.7 : 0.45)),
    );
    this.stock = new Stock(this.scene, this.geometry, this.materials, 18);
    this.trays(own);
    this.props(own);
    this.start();
  }
  /** The heavy oak table of the tavern. */
  private table(own: Own) {
    const top = this.add(new T.PlaneGeometry(40, 30).rotateX(-Math.PI / 2), this.standard({ ...planks(4.5, own), color: "#b88a62" }), 0, TABLE_Y, -2);
    top.castShadow = false;
  }
  /** The board: a walnut frame round the inlaid field, brass studs on the points. */
  private board(own: Own) {
    const half = this.spec.half,
      walnut = this.standard({ map: own(wood(true)), roughness: 0.45, color: "#8a5a3a" }),
      frame = this.add(block(half * 2 + 0.5, 0.24, half * 2 + 0.5, 0.06), walnut, 0, TABLE_Y + 0.12, 0);
    frame.castShadow = true;
    // A raised moulding round the field.
    const rim = 0.25,
      side = half * 2 + rim * 2,
      bars = [
        block(side, 0.05, rim, 0.02, this.rich ? 2 : 1).translate(0, 0, -half - rim / 2),
        block(side, 0.05, rim, 0.02, this.rich ? 2 : 1).translate(0, 0, half + rim / 2),
        block(rim, 0.05, half * 2, 0.02, this.rich ? 2 : 1).translate(-half - rim / 2, 0, 0),
        block(rim, 0.05, half * 2, 0.02, this.rich ? 2 : 1).translate(half + rim / 2, 0, 0),
      ],
      moulding = mergeGeometries(bars);
    bars.forEach((b) => b.dispose());
    this.add(moulding, walnut, 0, 0.0, 0).castShadow = this.rich;
    // The inlaid field, painted again once the maple's photograph has come.
    const size = this.rich ? 2048 : 1024,
      { c, ctx } = canvas(size),
      map = own(texture(c, this.rich ? 8 : 4));
    paintField(ctx, size, half, null);
    woodPhoto("maple", (image) => {
      paintField(ctx, size, half, image);
      map.needsUpdate = true;
      this.redraw();
    });
    const field = this.add(new T.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2), own(glossy({ map, roughness: 0.42 }, 0.35)), 0, -0.001, 0);
    field.castShadow = false;
    // Brass studs on the points.
    const stud = own(new T.SphereGeometry(0.075, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1)),
      studs = new T.InstancedMesh(stud, brass(own), this.spec.points.length),
      m = new T.Matrix4();
    this.spec.points.forEach((_, i) => studs.setMatrixAt(i, m.makeTranslation(this.at(i, -0.001))));
    studs.receiveShadow = true;
    this.scene.add(studs);
  }
  /** Each side's tray: an open box of oak with a divider; the men to place wait in one half, the men taken in the other. */
  private trays(own: Own) {
    const oak = this.standard({ map: own(wood()), roughness: 0.55, color: "#a88660" }),
      width = 1.42,
      depth = 6.9,
      wall = 0.07,
      high = 0.16,
      parts = [
        block(width, 0.05, depth, 0.015, this.rich ? 2 : 1).translate(0, 0.025, 0),
        block(width, high, wall, 0.02, this.rich ? 2 : 1).translate(0, high / 2, -depth / 2 + wall / 2),
        block(width, high, wall, 0.02, this.rich ? 2 : 1).translate(0, high / 2, depth / 2 - wall / 2),
        block(wall, high, depth, 0.02, this.rich ? 2 : 1).translate(-width / 2 + wall / 2, high / 2, 0),
        block(wall, high, depth, 0.02, this.rich ? 2 : 1).translate(width / 2 - wall / 2, high / 2, 0),
        block(width - wall, high * 0.7, wall * 0.8, 0.015, this.rich ? 2 : 1).translate(0, (high * 0.7) / 2, 0),
      ],
      tray = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    // Low trays cast a shadow only where a graphics card draws.
    for (const x of [TRAY_X, -TRAY_X]) this.add(x === TRAY_X ? tray : tray.clone(), oak, x, TABLE_Y, 0).castShadow = this.rich;
  }
  /** A slot in a tray: side 0's is at the right, side 1's at the left; `waiting` men lie toward its own end, taken ones toward the other. */
  private slot(tray: 0 | 1, waiting: boolean, index: number) {
    const sign = tray === 0 ? 1 : -1,
      row = Math.floor(index / 2),
      col = index % 2,
      x = sign * TRAY_X + (col ? 0.32 : -0.32) * sign,
      z = waiting ? sign * (3.08 - row * 0.62) : -sign * (0.42 + row * 0.62);
    return new T.Vector3(x, TRAY_FLOOR, z);
  }
  private waiting(state: State, side: 0 | 1) {
    return state.men - state.placed[side];
  }
  private taken(state: State, side: 0 | 1) {
    return state.placed[side] - state.board.filter((c) => c === side).length;
  }
  protected extras(state: State) {
    for (const side of [0, 1] as const) {
      const other = side === 0 ? 1 : 0,
        // Men of this colour taken by the other side lie in the other's tray; the ones still to place come last, so
        // that the next taken up is the last of the list.
        places = [
          ...Array.from({ length: this.taken(state, side) }, (_, k) => this.slot(other, false, k)),
          ...Array.from({ length: this.waiting(state, side) }, (_, k) => this.slot(side, true, k)),
        ];
      this.stock.set(
        side,
        places.map((at, k) => ({ at, turn: k * 1.3 })),
      );
    }
  }
  protected source(before: State, side: 0 | 1) {
    const left = this.waiting(before, side);
    if (left <= 0) return null;
    this.stock.drop(side);
    return this.slot(side, true, left - 1);
  }
  protected away(before: State, side: 0 | 1, index: number) {
    return this.slot(side === 0 ? 1 : 0, false, this.taken(before, side) + index);
  }
  protected mills() {
    return MILLS;
  }
  protected man(side: 0 | 1, _crowned: boolean, id: number) {
    const mesh = new T.Mesh(this.geometry, this.materials[side]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.rotation.y = id * 2.3;
    return mesh;
  }
  /** Beyond the board: a candle in a brass dish, and a pewter tankard. */
  private props(own: Own) {
    const metal = brass(own),
      pewter = own(glossy({ color: "#9aa0a2", metalness: 0.8, roughness: 0.38 }, 0.2)),
      wax = this.standard({ color: "#f3e7c8", roughness: 0.6, emissive: "#3a2410", emissiveIntensity: 0.25 });
    // The candlestick: a dish, a stem, a socket.
    const stick = new T.LatheGeometry(
      [[0, 0], [0.62, 0], [0.66, 0.04], [0.6, 0.08], [0.2, 0.1], [0.12, 0.2], [0.1, 0.5], [0.16, 0.56], [0.17, 0.62], [0.13, 0.64], [0, 0.64]].map(([r, y]) => new T.Vector2(r, y)),
      32,
    );
    const cx = -4.95,
      cz = -4.45;
    this.add(stick, metal, cx, TABLE_Y, cz);
    this.add(new T.CylinderGeometry(0.12, 0.12, 0.55, 20), wax, cx, TABLE_Y + 0.64 + 0.275, cz);
    const tip = TABLE_Y + 0.64 + 0.55;
    const wick = this.add(new T.CylinderGeometry(0.01, 0.01, 0.06, 6), this.standard({ color: "#1a1410" }), cx, tip + 0.03, cz);
    wick.castShadow = false;
    // The flame: a bright teardrop and a soft glow round it.
    const drop = own(new T.SphereGeometry(0.05, 14, 10).scale(1, 2.4, 1));
    this.flame = new T.Mesh(drop, own(new T.MeshBasicMaterial({ color: "#ffd27a" })));
    this.flame.position.set(cx, tip + 0.14, cz);
    this.halo = new T.Mesh(own(new T.PlaneGeometry(0.8, 0.8)), own(new T.MeshBasicMaterial({ map: glowTexture(own), color: "#ffb347", transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending })));
    this.halo.position.copy(this.flame.position);
    this.scene.add(this.flame, this.halo);
    if (this.rich) {
      this.lamp = new T.PointLight("#ffb860", 3.2, 9, 1.6);
      this.lamp.position.set(cx, tip + 0.3, cz);
      this.scene.add(this.lamp);
    }
    // The tankard: a pewter body with a hinged lid and a handle.
    const tx = 5.0,
      tz = -4.7,
      body = new T.LatheGeometry(
        [[0, 0], [0.42, 0], [0.45, 0.04], [0.42, 0.08], [0.38, 0.12], [0.36, 0.8], [0.39, 0.84], [0.38, 0.88], [0.34, 0.88], [0.33, 0.12], [0, 0.12]].map(([r, y]) => new T.Vector2(r, y)),
        36,
      );
    this.add(body, pewter, tx, TABLE_Y, tz);
    const lid = this.add(new T.SphereGeometry(0.4, 28, 8, 0, Math.PI * 2, 0, 0.5).scale(1, 0.5, 1), pewter, tx, TABLE_Y + 0.86, tz);
    lid.castShadow = true;
    const handle = this.add(new T.TorusGeometry(0.24, 0.05, 10, 24, Math.PI * 1.15), pewter, tx + 0.36, TABLE_Y + 0.45, tz);
    handle.rotation.z = -Math.PI * 0.575;
    // Dark ale inside, seen over the rim.
    this.add(new T.CircleGeometry(0.34, 28).rotateX(-Math.PI / 2), this.standard({ color: "#3a2410", roughness: 0.15 }), tx, TABLE_Y + 0.72, tz).castShadow = false;
  }
  protected idle(t: number) {
    // The flame flickers, and the candle's light with it.
    const flicker = 0.85 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 29.7 + 1.3);
    if (this.flame) this.flame.scale.set(1, flicker, 1);
    if (this.halo) {
      this.halo.quaternion.copy(this.camera.quaternion);
      this.halo.scale.setScalar(0.9 + flicker * 0.15);
    }
    if (this.lamp) this.lamp.intensity = 3.2 * flicker;
    return true;
  }
  protected place(state: State) {
    super.place(state);
    this.halo?.quaternion.copy(this.camera.quaternion);
  }
}
