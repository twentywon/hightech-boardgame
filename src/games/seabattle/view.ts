import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELLS, SIZE, sunk, type Ship, type State } from "./rules";

const CELL = 0.5,
  SIDE = CELL * SIZE,
  /** How far each chart's centre lies from the middle of the table. */
  APART = 3.15;
export const SEA_COLORS: [string, string] = ["#3f7fd0", "#d2452f"];
function chart(label: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 768;
  const ctx = c.getContext("2d")!,
    m = 64,
    cell = (768 - m * 2) / SIZE;
  // A sea chart: paper round the edge, blue water, a fine grid.
  ctx.fillStyle = "#e9dfc4";
  ctx.fillRect(0, 0, 768, 768);
  const sea = ctx.createLinearGradient(0, m, 0, 768 - m);
  sea.addColorStop(0, "#2f6f9a");
  sea.addColorStop(1, "#23577c");
  ctx.fillStyle = sea;
  ctx.fillRect(m, m, 768 - m * 2, 768 - m * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(m + i * cell, m);
    ctx.lineTo(m + i * cell, 768 - m);
    ctx.moveTo(m, m + i * cell);
    ctx.lineTo(768 - m, m + i * cell);
    ctx.stroke();
  }
  ctx.fillStyle = "#4a3b28";
  ctx.font = '700 30px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < SIZE; i++) {
    ctx.fillText("ABCDEFGHIJ"[i], m + (i + 0.5) * cell, m / 2 + 8);
    ctx.fillText(String(i + 1), m / 2, m + (i + 0.5) * cell);
  }
  ctx.font = '700 26px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(label, 384, 768 - m / 2 + 2);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function blocks() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#4d4f50";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.05)";
    ctx.fillRect((i * 97) % 256, (i * 211) % 256, 3, 3);
  }
  ctx.strokeStyle = "rgba(20,20,20,0.7)";
  ctx.lineWidth = 4;
  for (let row = 0; row < 4; row++) {
    ctx.strokeRect(-4, row * 64, 264, 64);
    for (let x = row % 2 ? 64 : 0; x < 256; x += 128) {
      ctx.beginPath();
      ctx.moveTo(x, row * 64);
      ctx.lineTo(x, row * 64 + 64);
      ctx.stroke();
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(7, 3);
  return t;
}
/** Two sea charts on the table of a cellar war room. */
export class SeaBattleView extends TableView<State> {
  private seas: T.Group[] = [];
  private ships: T.Group[][] = [[], []];
  private pegs = new Map<number, T.Mesh>();
  private peg: T.BufferGeometry;
  private hitPaint: T.Material;
  private missPaint: T.Material;
  private steel: T.Material;
  private wreck: T.Material;
  private shell: T.Mesh;
  private cursor: T.Mesh;
  private latest: T.Mesh;
  private stacked = false;
  private laid: State["fleets"] | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    /** Whose ships are shown while the battle lasts: side 0's against the computer, nobody's with two players. */
    private open: boolean[],
  ) {
    super(host, quality, "#15171a");
    // A dim cellar, lit by one lamp hung over the table.
    this.scene.add(new T.HemisphereLight("#aab4c0", "#20242a", 1.15));
    const lamp = new T.SpotLight("#ffe2ae", 3.2, 0, 0.95, 0.55, 0);
    lamp.position.set(0, 10, -3);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    const concrete = this.standard({ map: this.own(blocks()), roughness: 1 }),
      wall = this.add(new T.PlaneGeometry(60, 24), concrete, 0, 8, -9);
    wall.castShadow = false;
    const floor = this.add(new T.PlaneGeometry(90, 90), this.standard({ color: "#2a2c2e", roughness: 1 }), 0, -4.2, 0);
    floor.rotation.x = -Math.PI / 2;
    // The shade of the lamp, pipes along the wall, a wall map with pins.
    const iron = this.standard({ color: "#2f3338", roughness: 0.5, metalness: 0.5 });
    const shade = this.add(new T.ConeGeometry(1.5, 1.0, 28, 1, true), this.standard({ color: "#2f3338", roughness: 0.5, side: T.DoubleSide }), 0, 9.4, -3);
    shade.castShadow = false;
    this.add(new T.SphereGeometry(0.28, 14, 10), this.own(new T.MeshBasicMaterial({ color: "#fff0c0" })), 0, 9.1, -3).castShadow = false;
    for (const y of [11.2, 10.6]) this.add(new T.CylinderGeometry(0.16, 0.16, 60, 12), iron, 0, y, -8.6).rotation.z = Math.PI / 2;
    this.add(new T.BoxGeometry(7.4, 4.6, 0.1), this.standard({ color: "#d9cfb2", roughness: 1 }), -5.5, 5.6, -8.9);
    this.add(new T.BoxGeometry(6.6, 3.8, 0.12), this.standard({ color: "#7fa3b8", roughness: 1 }), -5.5, 5.6, -8.88);
    for (const [x, y, sx, sy] of [[-7, 6.2, 1.6, 0.9], [-4.6, 5.1, 2.0, 1.2], [-3.4, 6.6, 0.9, 0.6]])
      this.add(new T.CircleGeometry(1, 14), this.standard({ color: "#9aa873", roughness: 1 }), x, y, -8.8).scale.set(sx, sy, 1);
    for (const [x, y] of [[-6.6, 6.3], [-4.9, 5.4], [-3.6, 6.5]])
      this.add(new T.SphereGeometry(0.1, 10, 8), this.standard({ color: "#c8321f" }), x, y, -8.72);
    // The table and what lies on it: a radio, a telephone, a mug, a ruler and pencil.
    const top = this.add(new T.BoxGeometry(26, 0.5, 13), this.standard({ map: this.own(wood(true)), roughness: 0.7 }), 0, -0.45, 0);
    top.castShadow = false;
    for (const x of [-12, 12]) for (const z of [-5.6, 5.6]) this.add(new T.BoxGeometry(0.7, 3.8, 0.7), iron, x, -2.5, z);
    const olive = this.standard({ color: "#4a5a3c", roughness: 0.7 });
    this.add(new T.BoxGeometry(2.6, 1.5, 1.2), olive, -9, 0.55, -4.4);
    for (const x of [-9.7, -9.0]) this.add(new T.CylinderGeometry(0.22, 0.22, 0.1, 20), iron, x, 0.75, -3.78).rotation.x = Math.PI / 2;
    this.add(new T.CylinderGeometry(0.02, 0.02, 2.2, 6), iron, -7.9, 2.3, -4.6);
    const red = this.standard({ color: "#a32a22", roughness: 0.4 });
    this.add(new T.BoxGeometry(1.5, 0.5, 1.1), red, 9.2, 0.05, -4.3);
    this.add(new T.BoxGeometry(1.9, 0.3, 0.42), red, 9.2, 0.5, -4.3);
    this.add(new T.CylinderGeometry(0.4, 0.36, 0.7, 22), this.standard({ color: "#c9c4b6", roughness: 0.35, metalness: 0.4 }), 9.6, 0.15, 4.3);
    this.add(new T.BoxGeometry(3.6, 0.04, 0.34), this.standard({ color: "#d9c58a" }), -9.2, -0.18, 4.4).rotation.y = 0.3;
    this.add(new T.CylinderGeometry(0.05, 0.05, 1.8, 8), this.standard({ color: "#c8a23a" }), -8.4, -0.15, 3.6).rotation.set(Math.PI / 2, 0, -0.6);
    // The two charts.
    const edge = this.standard({ color: "#3a2c1f", roughness: 0.6 });
    ["청군 해역", "홍군 해역"].forEach((label) => {
      const sea = new T.Group();
      this.add(new T.BoxGeometry(SIDE + 0.9, 0.12, SIDE + 0.9), [edge, edge, this.standard({ map: this.own(chart(label)), roughness: 0.9 }), edge, edge, edge], 0, -0.14, 0, sea);
      this.seas.push(sea);
      this.scene.add(sea);
    });
    this.peg = this.own(new T.CylinderGeometry(0.11, 0.11, 0.3, 14));
    this.hitPaint = this.standard({ color: "#e23b2a", roughness: 0.4, emissive: "#6a1408" });
    this.missPaint = this.standard({ color: "#f3f1ea", roughness: 0.5 });
    this.steel = this.standard({ color: "#8d959c", roughness: 0.5, metalness: 0.3 });
    this.wreck = this.standard({ color: "#3a2a26", roughness: 0.9 });
    this.shell = this.add(new T.SphereGeometry(0.12, 12, 10), iron, 0, -9, 0);
    this.shell.visible = false;
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.2, 0.27, "#ffffff");
    this.latest = ringMesh(own, 0.24, 0.3, "#ffd24a");
    this.scene.add(this.cursor, this.latest);
    this.begin();
  }
  protected layout(aspect: number) {
    // Side by side on a wide screen; one above the other, the target farther, on a narrow one.
    this.stacked = aspect < 0.95;
    this.seas[0].position.set(this.stacked ? 0 : -APART, 0, this.stacked ? APART : 0);
    this.seas[1].position.set(this.stacked ? 0 : APART, 0, this.stacked ? -APART : 0);
  }
  protected subject(aspect: number): TableSubject {
    return aspect < 0.95
      ? { half: 3.1, halfZ: 6.1, height: 0.8, lookY: 0, tilt: 1.12 }
      : { half: 6.1, halfZ: 3.1, height: 0.8, lookY: 0, tilt: 0.9 };
  }
  /** Centre of a square in the scene. */
  private at(point: number) {
    const sea = this.seas[Math.floor(point / CELLS)].position,
      cell = point % CELLS;
    return { x: sea.x + ((cell % SIZE) - 4.5) * CELL, z: sea.z + (Math.floor(cell / SIZE) - 4.5) * CELL };
  }
  protected spots(): Spot[] {
    return Array.from({ length: CELLS * 2 }, (_, point) => ({ ...this.at(point), y: 0, r: CELL * 0.62, point }));
  }
  /** A ship of grey blocks lying over its squares. */
  private build(ship: Ship) {
    const g = new T.Group(),
      across = ship.cells.length > 1 && ship.cells[1] - ship.cells[0] === 1,
      length = ship.cells.length * CELL - 0.12;
    this.add(new T.BoxGeometry(length, 0.16, 0.3), this.steel, 0, 0.0, 0, g);
    this.add(new T.BoxGeometry(Math.min(length * 0.4, 0.7), 0.14, 0.2), this.steel, 0, 0.14, 0, g);
    this.add(new T.CylinderGeometry(0.05, 0.05, 0.2, 8), this.steel, length * 0.12, 0.3, 0, g);
    if (!across) g.rotation.y = Math.PI / 2;
    g.userData.middle = (ship.cells[0] + ship.cells[ship.cells.length - 1]) / 2;
    g.userData.cells = ship.cells;
    return g;
  }
  protected place(state: State) {
    if (this.laid !== state.fleets) {
      // A new battle: the old fleets go and the new ones are built.
      this.ships.flat().forEach((ship) => ship.removeFromParent());
      this.ships = state.fleets.map((fleet, side) =>
        fleet.map((ship) => {
          const g = this.build(ship);
          this.seas[side].add(g);
          return g;
        }),
      );
      this.laid = state.fleets;
      this.pegs.forEach((peg) => peg.removeFromParent());
      this.pegs.clear();
    }
    state.fleets.forEach((fleet, side) =>
      fleet.forEach((ship, k) => {
        const g = this.ships[side][k],
          first = ship.cells[0],
          last = ship.cells[ship.cells.length - 1],
          down = sunk(state, side, ship);
        g.position.set((((first % SIZE) + (last % SIZE)) / 2 - 4.5) * CELL, down ? -0.03 : 0.02, ((Math.floor(first / SIZE) + Math.floor(last / SIZE)) / 2 - 4.5) * CELL);
        // Hidden until it goes down, unless its side plays with open charts or the battle is over.
        g.visible = this.open[side] || down || state.winner !== null;
        g.traverse((part) => {
          if (part instanceof T.Mesh) part.material = down ? this.wreck : this.steel;
        });
      }),
    );
    for (const [point, peg] of this.pegs) if (!state.shots[Math.floor(point / CELLS)][point % CELLS]) {
      peg.removeFromParent();
      this.pegs.delete(point);
    }
    state.shots.forEach((shots, side) =>
      shots.forEach((shot, cell) => {
        if (!shot) return;
        const point = side * CELLS + cell,
          hit = state.fleets[side].some((ship) => ship.cells.includes(cell));
        let peg = this.pegs.get(point);
        if (!peg) {
          peg = new T.Mesh(this.peg, hit ? this.hitPaint : this.missPaint);
          peg.castShadow = true;
          this.pegs.set(point, peg);
          this.scene.add(peg);
        }
        const p = this.at(point);
        peg.position.set(p.x, hit ? 0.2 : 0.08, p.z);
        peg.scale.set(1, hit ? 1 : 0.5, 1);
        peg.visible = true;
      }),
    );
    this.shell.visible = false;
    this.latest.visible = !!state.last;
    if (state.last) this.latest.position.set(this.at(state.last.point).x, 0.0, this.at(state.last.point).z);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const p = this.at(state.last.point),
      hit = state.last.hit;
    this.shell.visible = true;
    this.tween(0, 380, (t) => {
      // The shell arcs in from above the firing side's chart.
      this.shell.position.set(p.x, 5 * (1 - t * t), p.z + 2.2 * (1 - t));
      if (t === 1) {
        this.shell.visible = false;
        this.place(state);
        this.onContact();
      }
    });
    this.tween(380, hit ? 420 : 260, (t) => {
      const peg = this.pegs.get(state.last!.point);
      if (peg) peg.scale.set(1 + Math.sin(Math.PI * t) * (hit ? 1.2 : 0.5), (hit ? 1 : 0.5) * (0.3 + 0.7 * t), 1 + Math.sin(Math.PI * t) * (hit ? 1.2 : 0.5));
    });
    return true;
  }
  protected mark(marks: Marks) {
    this.cursor.visible = marks.cursor !== null;
    if (marks.cursor !== null) this.cursor.position.set(this.at(marks.cursor).x, 0.01, this.at(marks.cursor).z);
  }
}
/** Where the keyboard walks: the two charts side by side. */
export const seaPoints = () =>
  Array.from({ length: CELLS * 2 }, (_, point) => ({
    x: (point < CELLS ? -APART : APART) + (((point % CELLS) % SIZE) - 4.5) * CELL,
    z: (Math.floor((point % CELLS) / SIZE) - 4.5) * CELL,
  }));
