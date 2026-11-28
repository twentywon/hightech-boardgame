import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, fall, glossy, stuff, wood } from "../../engine/scene-utils";
import { PieceTable, Stock, pieceCue, seeded, type Own } from "../points/table";
import { checkersBoard, STEP } from "./board";
import { checkers, type State } from "./rules";

/** How thick a checker is. */
const MAN_H = 0.16;
/** The porch table's top, under the board. */
const TABLE_Y = -0.3;
/** Where each side's stack of the pieces it has taken stands: red's at the near right, white's at the far left. */
const STACKS: [T.Vector3, T.Vector3] = [new T.Vector3(4.55, TABLE_Y, 2.1), new T.Vector3(-4.55, TABLE_Y, -2.1)];
/** Pieces in one stack before another is begun beside it. */
const HIGH = 6;

/**
 * A checker: a thick disc with a rounded, reeded edge (fine grooves round its side, as turned and milled checkers
 * have; a plain one unless `reeded`) and two raised rings on its face round a low boss; its foot at y 0.
 */
export function checkerGeometry(radius: number, height: number, reeded = true) {
  const R = radius,
    H = height,
    profile: [number, number][] = [
      [0, 0],
      [R * 0.93, 0],
      [R, H * 0.12],
      [R, H * 0.86],
      [R * 0.96, H],
      [R * 0.86, H],
      [R * 0.82, H * 0.93],
      [R * 0.72, H * 0.93],
      [R * 0.68, H],
      [R * 0.58, H],
      [R * 0.54, H * 0.93],
      [R * 0.3, H * 0.93],
      [R * 0.24, H * 0.97],
      [0, H * 0.97],
    ],
    g = new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), reeded ? 72 : 36),
    at = g.getAttribute("position"),
    uv = g.getAttribute("uv");
  for (let i = 0; i < at.count; i++) {
    const x = at.getX(i),
      y = at.getY(i),
      z = at.getZ(i),
      r = Math.hypot(x, z);
    // The reeds: 36 shallow grooves round the side.
    if (reeded && r > R * 0.99 && y > H * 0.2 && y < H * 0.8) {
      const a = Math.atan2(z, x),
        k = 1 - 0.022 * (0.5 + 0.5 * Math.cos(a * 36));
      at.setXYZ(i, x * k, y, z * k);
    }
    uv.setXY(i, 0.5 + x / (2 * R), 0.5 + z / (2 * R));
  }
  g.computeVertexNormals();
  return g;
}
/** A small gold crown in one piece: a band, five points each tipped with a ball, standing on y 0. */
function crownGeometry(r: number) {
  const parts: T.BufferGeometry[] = [new T.CylinderGeometry(r * 0.5, r * 0.55, r * 0.2, 32, 1, true).translate(0, r * 0.1, 0)];
  parts.push(new T.TorusGeometry(r * 0.53, r * 0.035, 6, 32).rotateX(Math.PI / 2).translate(0, r * 0.02, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2,
      x = Math.cos(a) * r * 0.49,
      z = Math.sin(a) * r * 0.49;
    parts.push(new T.ConeGeometry(r * 0.12, r * 0.3, 10).translate(x, r * 0.34, z));
    parts.push(new T.SphereGeometry(r * 0.065, 10, 8).translate(x, r * 0.51, z));
  }
  const crown = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  return crown;
}
/** The face of a checker: its lacquer, a little deeper toward the rim, with the faint marks of the turning. */
function face(color: string, light: boolean) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  const base = new T.Color(color);
  g.addColorStop(0, `#${base.clone().offsetHSL(0, 0, light ? 0.02 : 0.05).getHexString()}`);
  g.addColorStop(1, `#${base.clone().offsetHSL(0, 0, light ? -0.06 : -0.08).getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  for (let r = 6; r < 64; r += 3) {
    ctx.strokeStyle = `rgba(${light ? "120,100,70" : "40,0,0"},${0.04 + (r % 9 === 0 ? 0.05 : 0)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(64, 64, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/**
 * Checkers on a front porch (the user asked for the older tables to be upgraded): a lacquered board of green and buff
 * squares in a mahogany frame with a gilt line, on a table of weathered boards; red and white checkers with reeded
 * edges. A jump hops over the piece it takes, which is then knocked off the board spinning and lands on the taker's
 * stack beside the board (red's at the near right, white's at the far left). A piece reaching the far row is crowned:
 * a second checker drops onto it and a gold crown rises on top. A glass of lemonade and the box of the set stand
 * beyond the board.
 */
export class CheckersView extends PieceTable<State> {
  protected readonly tall = MAN_H;
  private geometry: T.BufferGeometry;
  private crownShape: T.BufferGeometry;
  private gold: T.Material;
  private materials: T.Material[];
  private stock: Stock;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#5d6f6a", checkersBoard(), checkers);
    const own: Own = (r) => this.own(r);
    // Afternoon sun across the porch, sky light from above.
    this.daylight("#eaf2ff", "#6b5a44", "#fff0d6", 8, 2.4);
    this.porch(own);
    this.board(own);
    // Reeded where a graphics card draws; a plain rim, of fewer facets, where the processor draws alone.
    this.geometry = own(checkerGeometry(this.spec.radius * 1.0, MAN_H, this.rich));
    this.crownShape = own(crownGeometry(this.spec.radius));
    this.gold = own(glossy({ color: "#e8b93a", metalness: 0.8, roughness: 0.25, emissive: "#3a2600" }, 0.5));
    this.materials = this.spec.colors.map((color, i) => own(glossy({ color: "#ffffff", map: own(face(color, i === 1)), roughness: i ? 0.42 : 0.36 }, 0.7)));
    this.stock = new Stock(this.scene, this.geometry, this.materials, 12);
    this.props(own);
    this.start();
  }
  /** A table of weathered boards on the porch, and the porch floor below it. */
  private porch(own: Own) {
    const top = this.add(new T.PlaneGeometry(36, 26).rotateX(-Math.PI / 2), this.standard({ ...stuff("boards", "#a89a86", 3.2, own), roughness: 0.85 }), 0, TABLE_Y, -1);
    top.castShadow = false;
  }
  /** The board: a mahogany frame with a gilt line, and the lacquered squares. */
  private board(own: Own) {
    const half = this.spec.half,
      mahogany = this.standard({ map: own(wood(true)), color: "#a2553a", roughness: 0.35 }),
      frame = this.add(block(half * 2 + 0.44, 0.27, half * 2 + 0.44, 0.08), mahogany, 0, TABLE_Y + 0.135, 0);
    frame.receiveShadow = true;
    // The face: the squares as the board's own paint lays them, a dark green margin with a gilt line round them.
    const size = this.rich ? 2048 : 1024,
      c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d", { willReadFrequently: true })!,
      unit = size / (half * 2),
      px = (x: number, z: number): [number, number] => [size / 2 + x * unit, size / 2 + z * unit];
    ctx.fillStyle = "#1f3a2b";
    ctx.fillRect(0, 0, size, size);
    this.spec.paint(ctx, px, unit);
    const edge = 4 * STEP * unit;
    ctx.strokeStyle = "#d9b25a";
    ctx.lineWidth = unit * 0.035;
    ctx.strokeRect(size / 2 - edge - unit * 0.1, size / 2 - edge - unit * 0.1, (edge + unit * 0.1) * 2, (edge + unit * 0.1) * 2);
    ctx.lineWidth = unit * 0.012;
    ctx.strokeRect(size / 2 - edge - unit * 0.17, size / 2 - edge - unit * 0.17, (edge + unit * 0.17) * 2, (edge + unit * 0.17) * 2);
    // The lacquer is a little worn and mottled.
    const rnd = seeded(31);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? "255,250,235" : "30,20,10"},${0.003 + rnd() * 0.005})`;
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, 4 + rnd() * 30, 0, Math.PI * 2);
      ctx.fill();
    }
    const map = own(new T.CanvasTexture(c));
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = this.rich ? 8 : 4;
    const field = this.add(new T.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2), own(glossy({ map, roughness: 0.3 }, 0.8)), 0, 0.0, 0);
    field.castShadow = false;
    // A thin gilt bead between the face and the frame.
    const lip = 0.05,
      side = half * 2 + lip * 2,
      bars = [
        block(side, 0.03, lip, 0.012, this.rich ? 2 : 1).translate(0, 0, -half - lip / 2),
        block(side, 0.03, lip, 0.012, this.rich ? 2 : 1).translate(0, 0, half + lip / 2),
        block(lip, 0.03, half * 2, 0.012, this.rich ? 2 : 1).translate(-half - lip / 2, 0, 0),
        block(lip, 0.03, half * 2, 0.012, this.rich ? 2 : 1).translate(half + lip / 2, 0, 0),
      ];
    this.add(mergeGeometries(bars), own(glossy({ color: "#d2a640", metalness: 0.8, roughness: 0.3 }, 0.3)), 0, 0.004, 0);
    bars.forEach((b) => b.dispose());
  }
  /** Beyond the board: a glass of lemonade with a slice of lemon, and the set's open box with its lid. */
  private props(own: Own) {
    const gx = 4.9,
      gz = -4.3,
      glass = this.rich
        ? own(new T.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transmission: 0.92, thickness: 0.15, ior: 1.45, transparent: true }))
        : own(new T.MeshStandardMaterial({ color: "#dfeef0", roughness: 0.1, transparent: true, opacity: 0.32, depthWrite: false })),
      tumbler = this.add(
        new T.LatheGeometry([[0, 0], [0.34, 0], [0.36, 0.02], [0.42, 1.05], [0.4, 1.06], [0.38, 0.06], [0, 0.06]].map(([r, y]) => new T.Vector2(r, y)), 36),
        glass,
        gx,
        TABLE_Y,
        gz,
      );
    tumbler.renderOrder = 2;
    const drink = this.add(new T.CylinderGeometry(0.385, 0.35, 0.72, 32), this.standard({ color: "#f3d96a", roughness: 0.2, transparent: true, opacity: 0.82 }), gx, TABLE_Y + 0.43, gz);
    drink.renderOrder = 1;
    // A slice of lemon on the rim, and ice in the drink.
    const slice = this.add(new T.CylinderGeometry(0.22, 0.22, 0.04, 24, 1, false, 0, Math.PI), this.standard({ color: "#f6e36a", roughness: 0.5, emissive: "#3a3000", emissiveIntensity: 0.3 }), gx - 0.33, TABLE_Y + 1.02, gz + 0.1);
    slice.rotation.set(Math.PI / 2, 0, 0.5);
    for (const [dx, dz, s] of [[0.1, 0.05, 1], [-0.12, -0.08, 0.85]] as const) {
      const ice = this.add(block(0.2 * s, 0.18 * s, 0.2 * s, 0.04), own(new T.MeshStandardMaterial({ color: "#f4fbff", roughness: 0.1, transparent: true, opacity: 0.6 })), gx + dx, TABLE_Y + 0.74, gz + dz);
      ice.rotation.y = dx * 6;
    }
    // The box the set came in: open, its lid leaning on it, both of the frame's mahogany with a green lining.
    const bx = -4.8,
      bz = -4.4,
      mahogany = this.standard({ map: own(wood(true)), color: "#a2553a", roughness: 0.45 }),
      lining = this.standard({ color: "#2c5a3c", roughness: 0.9 }),
      w = 1.5,
      d = 1.1,
      h = 0.36,
      walls = [
        block(w, 0.05, d, 0.02, this.rich ? 2 : 1).translate(0, 0.025, 0),
        block(w, h, 0.06, 0.02, this.rich ? 2 : 1).translate(0, h / 2, -d / 2 + 0.03),
        block(w, h, 0.06, 0.02, this.rich ? 2 : 1).translate(0, h / 2, d / 2 - 0.03),
        block(0.06, h, d, 0.02, this.rich ? 2 : 1).translate(-w / 2 + 0.03, h / 2, 0),
        block(0.06, h, d, 0.02, this.rich ? 2 : 1).translate(w / 2 - 0.03, h / 2, 0),
      ];
    this.add(mergeGeometries(walls), mahogany, bx, TABLE_Y, bz);
    walls.forEach((p) => p.dispose());
    this.add(new T.PlaneGeometry(w - 0.12, d - 0.12).rotateX(-Math.PI / 2), lining, bx, TABLE_Y + 0.052, bz).castShadow = false;
    const lid = this.add(block(w, 0.06, d, 0.03), mahogany, bx - 0.15, TABLE_Y + 0.5, bz - 0.75);
    lid.rotation.x = -1.15;
  }
  /** The `index`-th piece on the stack of pieces taken by `taker`. */
  private stacked(taker: 0 | 1, index: number) {
    const base = STACKS[taker],
      column = Math.floor(index / HIGH),
      level = index % HIGH,
      sign = taker === 0 ? 1 : -1;
    return new T.Vector3(base.x + sign * column * 0.1, base.y + level * MAN_H, base.z - sign * column * this.spec.radius * 2.1);
  }
  private taken(state: State, side: 0 | 1) {
    return 12 - state.board.filter((c) => c === side).length;
  }
  protected extras(state: State) {
    for (const side of [0, 1] as const) {
      const taker = side === 0 ? 1 : 0,
        rnd = seeded(side + 3);
      this.stock.set(
        side,
        Array.from({ length: this.taken(state, side) }, (_, k) => {
          const at = this.stacked(taker, k);
          // Stacked by hand: each a little off the one under it.
          at.x += (rnd() - 0.5) * 0.04;
          at.z += (rnd() - 0.5) * 0.04;
          return { at, turn: rnd() * 6 };
        }),
      );
    }
  }
  protected away(before: State, side: 0 | 1, index: number) {
    return this.stacked(side === 0 ? 1 : 0, this.taken(before, side) + index);
  }
  protected knocked() {
    return true;
  }
  protected man(side: 0 | 1, crowned: boolean, id: number) {
    const disc = () => {
      const mesh = new T.Mesh(this.geometry, this.materials[side]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.rotation.y = id * 1.9;
      return mesh;
    };
    if (!crowned) return disc();
    // A king: two checkers one on the other, a gold crown on top.
    const group = new T.Group(),
      upper = disc(),
      crown = new T.Mesh(this.crownShape, this.gold);
    upper.position.y = MAN_H;
    upper.rotation.y += 0.7;
    crown.position.y = MAN_H * 2 - 0.012;
    crown.castShadow = true;
    group.add(disc(), upper, crown);
    return group;
  }
  /** A checker that reaches the far row is crowned: a second checker drops onto it, then the crown rises out of it. */
  protected flourish(before: State, state: State, landed: number, mover: T.Object3D | null) {
    const effect = state.effect;
    if (!effect || !mover || !state.kings[effect.to] || before.kings[effect.from]) return landed;
    const side = state.board[effect.to]!,
      upper = new T.Mesh(this.geometry, this.materials[side]),
      crown = new T.Mesh(this.crownShape, this.gold);
    upper.castShadow = crown.castShadow = true;
    upper.visible = crown.visible = false;
    mover.add(upper, crown);
    const drop = landed + 120,
      rise = drop + 330;
    let heard = false;
    this.tween(drop, 330, (p) => {
      upper.visible = true;
      upper.position.y = MAN_H + fall(p) * 1.6;
      upper.rotation.y = (1 - p) * 2;
      if (p >= 1 && !heard) {
        heard = true;
        pieceCue.kind = "crown";
        this.onContact();
      }
    });
    this.tween(rise, 300, (p) => {
      crown.visible = true;
      const s = p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15;
      crown.scale.setScalar(Math.max(0.01, s));
      crown.position.y = MAN_H * 2 - 0.012 + Math.sin(Math.PI * p) * 0.08;
      crown.rotation.y = (1 - p) * 1.5;
    });
    return rise + 300;
  }
}
