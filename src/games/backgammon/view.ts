import * as T from "three";
import { planks, block, glossy, wood, hop } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BAR, OFF, ROLL, type State } from "./rules";

export const BG_COLORS: [string, string] = ["#f2ead8", "#7a1f1f"];
/** A point's width, the bar's width, the board's half depth, a checker's radius. */
const W = 0.66,
  BAR_W = 0.8,
  HALF = 3.3,
  R = 0.29,
  TOP = 0.1;
export const BG_SUBJECT: TableSubject = { half: 5.9, halfZ: 3.7, height: 0.8, lookY: 0, tilt: 1.12 };
/** Where the dice lie: on the right half of the board, across its middle. */
export const DICE_AT = { x: 2.3, z: 0 };
/** The column of a point as seen from my seat: 0 at the far left to 11 at the far right; and whether it is in the near row. */
function column(p: number) {
  return p < 12 ? { col: 11 - p, near: true } : { col: p - 12, near: false };
}
const colX = (col: number) => (col - 5.5) * W + (col >= 6 ? BAR_W / 2 : -BAR_W / 2);
/** Where the `k`-th checker on a point stands (five to a row along the triangle, then a second layer). */
export function pointSpot(p: number, k = 0) {
  const { col, near } = column(p),
    row = k % 5,
    layer = Math.floor(k / 5),
    z = (HALF - R - 0.04 - row * 2 * R - layer * R) * (near ? 1 : -1);
  return { x: colX(col), y: TOP + 0.08 + layer * 0.17, z };
}
/** Where a side's checkers wait on the bar, and where they lie once borne off. */
const barSpot = (side: number, k: number) => ({ x: 0, y: TOP + 0.08 + k * 0.17, z: (side === 0 ? 1 : -1) * (0.7 + (k % 4) * 0.1) });
const offSpot = (side: number, k: number) => ({ x: 6 * W + BAR_W / 2 + 0.75, y: TOP + 0.03 + k * 0.004, z: (side === 0 ? 1 : -1) * (HALF - 0.25 - k * 0.135) });
/** Points of the board as the screen counts them, for taps. */
export function spotOf(point: number, side: number) {
  if (point === BAR) return { x: 0, z: (side === 0 ? 1 : -1) * 1.2 };
  if (point === OFF) return { x: 6 * W + BAR_W / 2 + 0.75, z: (side === 0 ? 1 : -1) * 2 };
  const { col, near } = column(point);
  return { x: colX(col), z: (near ? 1 : -1) * (HALF - 1.3) };
}
function feltTexture() {
  const c = document.createElement("canvas"),
    u = 128;
  c.width = 12 * u + 2 * u;
  c.height = 10 * u;
  const ctx = c.getContext("2d")!,
    xs = (col: number) => (col < 6 ? col * u : col * u + 2 * u);
  ctx.fillStyle = "#1f5a3c";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let col = 0; col < 12; col++)
    for (const near of [true, false]) {
      const x = xs(col),
        base = near ? c.height : 0,
        tip = near ? c.height * 0.58 : c.height * 0.42;
      ctx.fillStyle = (col + (near ? 0 : 1)) % 2 ? "#e8d9b0" : "#a6332a";
      ctx.beginPath();
      ctx.moveTo(x + 4, base);
      ctx.lineTo(x + u - 4, base);
      ctx.lineTo(x + u / 2, tip);
      ctx.closePath();
      ctx.fill();
    }
  // The bar down the middle.
  ctx.fillStyle = "#3a2618";
  ctx.fillRect(6 * u, 0, 2 * u, c.height);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function dieFace(value: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    spots: Record<number, [number, number][]> = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#16181a";
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(32 + x * 32, 32 + y * 32, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
const FACES = [3, 4, 1, 6, 2, 5];
function upright(face: number) {
  const q = new T.Quaternion(),
    x = new T.Vector3(1, 0, 0),
    z = new T.Vector3(0, 0, 1);
  if (face === 6) q.setFromAxisAngle(x, Math.PI);
  else if (face === 2) q.setFromAxisAngle(x, -Math.PI / 2);
  else if (face === 5) q.setFromAxisAngle(x, Math.PI / 2);
  else if (face === 3) q.setFromAxisAngle(z, Math.PI / 2);
  else if (face === 4) q.setFromAxisAngle(z, -Math.PI / 2);
  return q;
}
/** A backgammon case opened on a table: green felt with long triangles, the bar between the halves, a tray for borne-off checkers, two dice. */
export class BackgammonView extends TableView<State> {
  private checkers: T.Mesh[][] = [[], []];
  private dice: T.Mesh[] = [];
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a1d14");
    this.daylight("#fff4e2", "#4a3828", "#ffeed6", 8, 2.2);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard(planks(8, keep)), 0, -0.2, 0).castShadow = false;
    const frame = this.standard({ map: keep(wood(true)), roughness: 0.45 }),
      width = 12 * W + BAR_W;
    this.add(block(width + 2.1, 0.12, HALF * 2 + 0.5, 0.06), frame, 0.6, 0.0, 0);
    const felt = this.standard({ map: keep(feltTexture()), roughness: 0.95 }),
      surface = this.add(new T.PlaneGeometry(width, HALF * 2), felt, 0, TOP - 0.035, 0);
    surface.rotation.x = -Math.PI / 2;
    surface.castShadow = false;
    // The rails round the playing field and the tray for borne-off checkers.
    for (const z of [-HALF - 0.12, HALF + 0.12]) this.add(block(width + 0.3, 0.16, 0.22, 0.04), frame, 0, TOP + 0.02, z);
    for (const x of [-width / 2 - 0.12, width / 2 + 0.12, width / 2 + 1.38]) this.add(block(0.22, 0.16, HALF * 2 + 0.46, 0.04), frame, x, TOP + 0.02, 0);
    const disc = keep(new T.CylinderGeometry(R, R, 0.15, 28));
    BG_COLORS.forEach((color, side) => {
      const paint = keep(glossy({ color, roughness: 0.35 }));
      for (let k = 0; k < 15; k++) {
        const mesh = new T.Mesh(disc, paint);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.checkers[side].push(mesh);
      }
    });
    const cube = keep(block(0.42, 0.42, 0.42, 0.06)),
      faces = FACES.map((v) => this.standard({ map: keep(dieFace(v)), roughness: 0.4 }));
    for (let i = 0; i < 2; i++) {
      const die = new T.Mesh(cube, faces);
      die.castShadow = true;
      this.scene.add(die);
      this.dice.push(die);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 28; i++) {
      const ring = ringMesh(own, 0.2, 0.27, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.3, 0.36, "#ffffff");
    this.chosen = ringMesh(own, 0.26, 0.33, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    this.begin();
  }
  protected subject() {
    return BG_SUBJECT;
  }
  /** Where every checker stands, by side. */
  private stands(s: State) {
    return [0, 1].map((side) => {
      const out: { x: number; y: number; z: number; flat?: boolean }[] = [];
      for (let p = 0; p < 24; p++) for (let k = 0; k < s.points[side][p]; k++) out.push(pointSpot(p, k));
      for (let k = 0; k < s.bar[side]; k++) out.push(barSpot(side, k));
      for (let k = 0; k < s.off[side]; k++) out.push({ ...offSpot(side, k), flat: true });
      return out;
    });
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s) return [];
    const out: Spot[] = [];
    for (let p = 0; p < 24; p++) out.push({ ...spotOf(p, 0), y: TOP, r: 1.3, point: p });
    out.push({ ...spotOf(BAR, s.turn), y: TOP, r: 0.7, point: BAR }, { ...spotOf(OFF, s.turn), y: TOP, r: 1.2, point: OFF }, { ...DICE_AT, y: 0.3, r: 0.8, point: ROLL });
    return out;
  }
  private showDice(s: State) {
    const values = s.dice.length ? s.dice : [5, 2];
    this.dice.forEach((die, i) => {
      die.quaternion.copy(upright(values[i]));
      die.position.set(DICE_AT.x + (i ? 0.32 : -0.32), TOP + 0.21, DICE_AT.z + (i ? 0.12 : -0.12));
      // A die whose value is spent sinks a little and dims.
      const spent = s.phase === "move" && !s.left.includes(values[i]);
      die.scale.setScalar(spent ? 0.8 : 1);
    });
  }
  protected place(s: State) {
    this.stands(s).forEach((spots, side) =>
      this.checkers[side].forEach((mesh, k) => {
        const p = spots[k];
        mesh.visible = !!p;
        if (!p) return;
        mesh.position.set(p.x, p.y, p.z);
        // A checker borne off lies on its edge in the tray, as in a real case.
        mesh.rotation.set(p.flat ? Math.PI / 2 : 0, 0, 0);
      }),
    );
    this.showDice(s);
  }
  protected animate(before: State, s: State) {
    const last = s.last;
    if (!last || s.ply !== before.ply + 1) return false;
    if (last.rolled) {
      this.onRoll(2, 0.45);
      this.showDice(s);
      this.dice.forEach((die, i) => {
        const end = die.quaternion.clone(),
          axis = new T.Vector3(1, 0.3 + i, 0.5).normalize(),
          spin = new T.Quaternion(),
          y = die.position.y;
        this.tween(i * 50, 520, (p) => {
          spin.setFromAxisAngle(axis, (1 - p) * Math.PI * 5);
          die.quaternion.copy(end).multiply(spin);
          die.position.y = y + hop(p) * 0.9;
        });
      });
      if (s.turn !== before.turn) this.tween(560, 700, () => {});
      return true;
    }
    // The checker that moved: the top one of where it left, carried in an arc to where it lands.
    const from = this.stands(before)[last.side],
      to = this.stands(s)[last.side],
      count = (st: State, p: number) => (p === BAR ? st.bar[last.side] : p === OFF ? st.off[last.side] : st.points[last.side][p]),
      a = last.from === BAR ? barSpot(last.side, count(before, BAR) - 1) : pointSpot(last.from, count(before, last.from) - 1),
      b = last.to === OFF ? offSpot(last.side, count(s, OFF) - 1) : pointSpot(last.to, count(s, last.to) - 1);
    this.place(before);
    const mover = this.checkers[last.side].find((m) => Math.hypot(m.position.x - a.x, m.position.z - a.z) < 0.01 && Math.abs(m.position.y - a.y) < 0.01);
    if (!mover || !from.length || !to.length) return false;
    this.tween(0, 420, (p) => {
      const e = p * p * (3 - 2 * p);
      mover.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + Math.sin(Math.PI * p) * 0.6, a.z + (b.z - a.z) * e);
      if (p === 1) this.onContact();
    });
    // A blot hit goes to the bar.
    if (last.hit) {
      const other = 1 - last.side,
        hitAt = pointSpot(last.to, 0),
        victim = this.checkers[other].find((m) => Math.hypot(m.position.x - hitAt.x, m.position.z - hitAt.z) < 0.01),
        dest = barSpot(other, s.bar[other] - 1);
      if (victim) this.tween(300, 420, (p) => victim.position.set(hitAt.x + (dest.x - hitAt.x) * p, hitAt.y + Math.sin(Math.PI * p) * 1.2, hitAt.z + (dest.z - hitAt.z) * p));
    }
    return true;
  }
  protected mark(marks: Marks) {
    const s = this.state,
      lit = [...marks.movable, ...marks.targets];
    this.rings.forEach((ring, i) => {
      const point = lit[i];
      ring.visible = point !== undefined && point >= 0 && point <= OFF && !!s;
      if (ring.visible) {
        const at = spotOf(point, s!.turn);
        ring.position.set(at.x, TOP + 0.01, at.z);
      }
    });
    for (const [ring, point] of [
      [this.cursor, marks.cursor],
      [this.chosen, marks.selected],
    ] as [T.Mesh, number | null][]) {
      ring.visible = point !== null && !!s;
      if (ring.visible) {
        const at = point === ROLL ? DICE_AT : spotOf(point!, s!.turn);
        ring.position.set(at.x, TOP + 0.015, at.z);
      }
    }
  }
}
