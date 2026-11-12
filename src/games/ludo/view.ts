import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { HOME, LAST_ROAD, ROAD, ROLL, SAFE, START, YARD, roadSquare, type State } from "./rules";

const S = 0.68,
  SUBJECT: TableSubject = { half: 5.7, halfZ: 5.7, height: 1.0, lookY: 0, tilt: 1.05 };
export const LUDO_COLORS: [string, string] = ["#d2452f", "#2f8a4f"];
const ARMS = ["#e2b93b", "#2f8a4f", "#3f6fc8", "#d2452f"];
const at = (c: number, r: number) => ({ x: (c - 7) * S, z: (r - 7) * S });
/** Where a token of a side stands for a place on its way; `k` spreads tokens that wait or have arrived. */
export function tokenAt(side: number, progress: number, k: number) {
  if (progress === YARD) {
    const [c, r] = side === 0 ? [2.5, 11.5] : [11.5, 2.5];
    return at(c + (k % 2 ? 0.9 : -0.9), r + (k < 2 ? -0.9 : 0.9));
  }
  if (progress <= LAST_ROAD) {
    const [c, r] = ROAD[roadSquare(side, progress)];
    return at(c, r);
  }
  // Up its own column, then into the middle.
  const step = progress - LAST_ROAD;
  if (progress === HOME) return at(7 + (k % 2 ? 0.28 : -0.28), side === 0 ? 7.75 + (k < 2 ? 0 : 0.42) : 6.25 - (k < 2 ? 0 : 0.42));
  return at(7, side === 0 ? 14 - step : step);
}
function boardTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 1050;
  const ctx = c.getContext("2d")!,
    u = 70,
    cell = (col: number, row: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(col * u, row * u, u, u);
      ctx.strokeStyle = "rgba(40,30,20,0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(col * u + 1, row * u + 1, u - 2, u - 2);
    };
  ctx.fillStyle = "#f6efdc";
  ctx.fillRect(0, 0, 1050, 1050);
  // The four yards in the corners: left top, right top, right bottom, left bottom.
  [[0, 0, ARMS[0]], [9, 0, ARMS[1]], [9, 9, ARMS[2]], [0, 9, ARMS[3]]].forEach(([col, row, color]) => {
    ctx.fillStyle = color as string;
    ctx.fillRect((col as number) * u, (row as number) * u, 6 * u, 6 * u);
    ctx.fillStyle = "#f6efdc";
    ctx.beginPath();
    ctx.arc(((col as number) + 3) * u, ((row as number) + 3) * u, 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
  });
  ROAD.forEach(([col, row], i) => cell(col, row, i === START[0] ? ARMS[3] : i === START[1] ? ARMS[1] : i === 0 ? ARMS[0] : i === 26 ? ARMS[2] : "#fbf7ea"));
  // The home columns, one of each arm's colour.
  for (let k = 1; k <= 5; k++) {
    cell(7, 14 - k, ARMS[3]);
    cell(7, k, ARMS[1]);
    cell(k, 7, ARMS[0]);
    cell(14 - k, 7, ARMS[2]);
  }
  // Stars on the safe squares.
  ctx.fillStyle = "rgba(40,30,20,0.55)";
  for (const i of SAFE) {
    const [col, row] = ROAD[i];
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p * Math.PI) / 5 - Math.PI / 2,
        r = p % 2 ? 10 : 24;
      ctx.lineTo(col * u + 35 + Math.cos(a) * r, row * u + 35 + Math.sin(a) * r);
    }
    ctx.fill();
  }
  // The middle: four triangles meeting.
  [[ARMS[3], 6, 9, 9, 9], [ARMS[1], 6, 6, 9, 6], [ARMS[0], 6, 6, 6, 9], [ARMS[2], 9, 6, 9, 9]].forEach(([color, c1, r1, c2, r2]) => {
    ctx.fillStyle = color as string;
    ctx.beginPath();
    ctx.moveTo((c1 as number) * u, (r1 as number) * u);
    ctx.lineTo((c2 as number) * u, (r2 as number) * u);
    ctx.lineTo(7.5 * u, 7.5 * u);
    ctx.fill();
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function dieFace(value: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    spots: Record<number, [number, number][]> = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [2, 0], [0, 2], [2, 2]],
      5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
      6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
    };
  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = value === 1 ? "#c8321f" : "#16181a";
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(32 + x * 32, 32 + y * 32, value === 1 ? 20 : 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
// Material slot → face value; opposite faces add up to seven.
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
// The die lies in a yard nobody plays from, clear of the road and the middle.
const DIE = at(2.5, 2.5);
/** The cross-shaped board, eight tokens and a die. */
export class LudoView extends TableView<State> {
  private tokens: T.Mesh[] = [];
  private die: T.Mesh;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9e7e1");
    this.daylight("#ffffff", "#c9c5bb", "#fff8ea", 9, 1.9);
    // A plain white table.
    const table = this.add(new T.PlaneGeometry(90, 90), this.standard({ color: "#f6f5f1", roughness: 0.45 }), 0, -0.3, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    const edge = this.standard({ color: "#3a2c1f", roughness: 0.6 });
    this.add(new T.BoxGeometry(15 * S + 0.3, 0.2, 15 * S + 0.3), [edge, edge, this.standard({ map: this.own(boardTexture()), roughness: 0.85 }), edge, edge, edge], 0, -0.1, 0);
    const pawn = this.own(new T.CylinderGeometry(0.1, 0.22, 0.46, 20)),
      head = this.own(new T.SphereGeometry(0.15, 16, 12));
    LUDO_COLORS.forEach((color) => {
      const paint = this.standard({ color, roughness: 0.35 });
      for (let k = 0; k < 4; k++) {
        const mesh = new T.Mesh(pawn, paint),
          top = new T.Mesh(head, paint);
        top.position.y = 0.3;
        mesh.add(top);
        mesh.castShadow = top.castShadow = true;
        this.tokens.push(mesh);
        this.scene.add(mesh);
      }
    });
    this.die = new T.Mesh(this.own(new T.BoxGeometry(0.62, 0.62, 0.62)), FACES.map((value) => this.standard({ map: this.own(dieFace(value)), roughness: 0.4 })));
    this.die.castShadow = true;
    this.die.position.set(DIE.x, 0.31, DIE.z);
    this.scene.add(this.die);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 4; i++) {
      const ring = ringMesh(own, 0.26, 0.34, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.36, 0.42, "#ffffff");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject() {
    return SUBJECT;
  }
  /** Where each of the eight tokens stands. Tokens sharing a square stand side by side, each made smaller, so that none hides another. */
  private stands(state: State) {
    const out: { x: number; z: number; scale: number }[] = [],
      groups = new Map<string, number[]>();
    state.tokens.forEach((tokens, side) =>
      tokens.forEach((progress, k) => {
        const p = tokenAt(side, progress, k);
        out.push({ ...p, scale: 1 });
        if (progress < 0 || progress >= HOME) return;
        const key = `${Math.round(p.x * 100)},${Math.round(p.z * 100)}`;
        groups.set(key, [...(groups.get(key) ?? []), side * 4 + k]);
      }),
    );
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const d = S * 0.25;
      group.forEach((token, i) => {
        // Two stand left and right; more fill the corners of the square.
        const [dx, dz] = group.length === 2 ? [i ? d : -d, 0] : [i % 2 ? d : -d, i < 2 ? -d : d];
        out[token] = { x: out[token].x + dx, z: out[token].z + dz, scale: group.length === 2 ? 0.74 : 0.62 };
      });
    }
    return out;
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const out: Spot[] = this.stands(state).map((p, point) => ({ x: p.x, z: p.z, y: 0.3, r: 0.42 * p.scale, point }));
    // The die is a place too: a tap on it rolls.
    out.push({ ...DIE, y: 0.3, r: 0.75, point: ROLL });
    return out;
  }
  protected place(state: State) {
    this.stands(state).forEach((p, i) => {
      this.tokens[i].position.set(p.x, 0.25 * p.scale, p.z);
      this.tokens[i].scale.setScalar(p.scale);
    });
    this.die.quaternion.copy(upright(state.die));
    this.die.position.y = 0.31;
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    if (last.token < 0) {
      // The die is thrown.
      const to = upright(last.rolled),
        axis = new T.Vector3(1, 0.4, 0.6).normalize(),
        spin = new T.Quaternion();
      this.tween(0, 520, (p) => {
        spin.setFromAxisAngle(axis, (1 - p) * Math.PI * 5);
        this.die.quaternion.copy(to).multiply(spin);
        this.die.position.y = 0.31 + Math.sin(Math.PI * p) * 0.9;
        if (p === 1) this.onContact();
      });
      // A roll nobody can use is left to be seen for a moment.
      if (state.turn !== before.turn) this.tween(520, 500, () => {});
      return true;
    }
    const side = last.side,
      k = last.token - side * 4,
      mesh = this.tokens[last.token],
      steps: { x: number; z: number }[] = [];
    if (last.from === YARD) steps.push(tokenAt(side, 0, k));
    else for (let p = last.from + 1; p <= last.to; p++) steps.push(tokenAt(side, p, k));
    let from = { x: mesh.position.x, z: mesh.position.z };
    steps.forEach((to, i) => {
      const a = from;
      this.tween(i * 150, 150, (p) => {
        mesh.position.set(a.x + (to.x - a.x) * p, 0.25 + Math.sin(Math.PI * p) * 0.35, a.z + (to.z - a.z) * p);
        if (p === 1) this.onContact();
      });
      from = to;
    });
    // Tokens sent back fly home to their yard.
    for (const point of last.sent) {
      const sent = this.tokens[point],
        a = { x: sent.position.x, z: sent.position.z },
        b = tokenAt(point < 4 ? 0 : 1, YARD, point % 4);
      this.tween(steps.length * 150, 420, (p) => sent.position.set(a.x + (b.x - a.x) * p, 0.25 + Math.sin(Math.PI * p) * 1.6, a.z + (b.z - a.z) * p));
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      stands = state ? this.stands(state) : [];
    this.rings.forEach((ring, i) => {
      const point = marks.movable[i];
      ring.visible = point !== undefined && point < 8 && !!stands[point];
      if (ring.visible) ring.position.set(stands[point].x, 0.012, stands[point].z);
    });
    const cursor = marks.cursor !== null ? (marks.cursor === ROLL ? DIE : stands[marks.cursor]) : undefined;
    this.cursor.visible = !!cursor;
    if (cursor) this.cursor.position.set(cursor.x, 0.014, cursor.z);
  }
}
