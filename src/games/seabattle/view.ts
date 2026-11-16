import * as T from "three";
import { wood, planks, block } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CELLS, FLEET, SHIP_KINDS, SIZE, span, sunk, type Ship, type ShipKind, type State } from "./rules";

const CELL = 0.5,
  SIDE = CELL * SIZE,
  /** How far each chart's centre lies from the middle of the table, and how far both are set back on a wide screen. */
  APART = 3.15,
  BAND = 0.55;
/** The band before the charts: wider on a short wide screen (a phone held sideways), where the board takes more of the height. */
const bandFor = (aspect: number) => (aspect >= 2 ? 1.0 : BAND);
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
/** A canvas texture painted by `paint`, repeating. */
function paintedTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/**
 * A ship's side, from the waterline (bottom of the picture) to the deck edge (top): red antifouling, a black
 * boot-top, then grey plating in strakes with welded seams and rivet rows, and rust weeping from the scuppers.
 */
function hullPlates() {
  return paintedTexture(512, 128, (ctx) => {
    const random = sequence(71);
    ctx.fillStyle = "#7f8890";
    ctx.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(random() * 512, random() * 128, 2, 2);
    }
    ctx.strokeStyle = "rgba(40,45,50,0.55)";
    ctx.lineWidth = 1.5;
    for (const y of [26, 58, 86]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(30,34,38,0.6)";
      for (let x = 4; x < 512; x += 9) ctx.fillRect(x, y - 3.5, 1.6, 1.6);
    }
    for (let x = 0; x < 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + (x % 128 ? 0 : 20), 0);
      ctx.lineTo(x + (x % 128 ? 0 : 20), 100);
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = 20 + random() * 470,
        streak = ctx.createLinearGradient(0, 14, 0, 70 + random() * 30);
      streak.addColorStop(0, "rgba(120,62,30,0.55)");
      streak.addColorStop(1, "rgba(120,62,30,0)");
      ctx.fillStyle = streak;
      ctx.fillRect(x, 14, 3 + random() * 4, 80);
      ctx.fillStyle = "#2c2f33";
      ctx.fillRect(x - 1, 10, 6, 4);
    }
    ctx.fillStyle = "#1d1f22";
    ctx.fillRect(0, 100, 512, 9);
    ctx.fillStyle = "#8c2c22";
    ctx.fillRect(0, 109, 512, 19);
  });
}
/** A steel deck: dark grey non-slip paint, its plates' seams, and a pale line along each edge. */
function deckPlates() {
  return paintedTexture(256, 256, (ctx) => {
    const random = sequence(73);
    ctx.fillStyle = "#5d656d";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.07)";
      ctx.fillRect(random() * 256, random() * 256, 1.5, 1.5);
    }
    ctx.strokeStyle = "rgba(25,28,32,0.5)";
    ctx.lineWidth = 1.2;
    for (let x = 0; x <= 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    for (let y = 0; y <= 256; y += 85) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  });
}
/** A carrier's flight deck, the whole of it: dark asphalt grey, a white centre line, yellow guide lines, the angled landing strip and its number. */
function flightDeck() {
  return paintedTexture(1024, 192, (ctx) => {
    const random = sequence(79);
    ctx.fillStyle = "#4c5257";
    ctx.fillRect(0, 0, 1024, 192);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.05)";
      ctx.fillRect(random() * 1024, random() * 192, 2, 2);
    }
    // The angled deck: a strip across toward the stern, with its dashed centre line.
    ctx.save();
    ctx.translate(330, 96);
    ctx.rotate(-0.16);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-330, -42, 700, 84);
    ctx.setLineDash([22, 16]);
    ctx.beginPath();
    ctx.moveTo(-330, 0);
    ctx.lineTo(370, 0);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#e8c23a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(560, 112);
    ctx.lineTo(1000, 112);
    ctx.moveTo(620, 70);
    ctx.lineTo(990, 70);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = '900 64px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.translate(900, 150);
    ctx.fillText("77", 0, 0);
    ctx.restore();
    for (const x of [60, 120]) {
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, 152);
      ctx.stroke();
    }
  });
}
/** A superstructure's side: grey panels with seams, a dark band of bridge windows near its top. */
function panels() {
  return paintedTexture(128, 128, (ctx) => {
    ctx.fillStyle = "#97a0a8";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(40,45,50,0.45)";
    ctx.lineWidth = 1.2;
    for (let x = 0; x <= 128; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 128);
      ctx.stroke();
    }
    ctx.fillStyle = "#1f2a33";
    for (let x = 6; x < 128; x += 15) ctx.fillRect(x, 14, 10, 13);
    ctx.fillStyle = "rgba(160,210,240,0.35)";
    for (let x = 6; x < 128; x += 15) ctx.fillRect(x, 14, 10, 4);
  });
}
/** A submarine's skin of rubber tiles: near black, the tiles' edges faintly paler. */
function subTiles() {
  return paintedTexture(256, 128, (ctx) => {
    ctx.fillStyle = "#23272b";
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = "rgba(120,130,140,0.25)";
    ctx.lineWidth = 1;
    for (let y = 0; y <= 128; y += 16)
      for (let x = (y / 16) % 2 ? 8 : 0; x < 256; x += 16) ctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
  });
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
  /** The ships' paints: hull sides, decks (steel, teak and a carrier's flight deck), superstructure, guns, a submarine's skin. */
  private kit!: { hull: T.Material; deck: T.Material; teak: T.Material; flight: T.Material; panels: T.Material; gun: T.Material; sub: T.Material; white: T.Material };
  private shell: T.Mesh;
  private cursor: T.Mesh;
  private latest: T.Mesh;
  private stacked = false;
  private ghost: T.Mesh;
  private hovered = -1;
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
    const top = this.add(block(26, 0.5, 13), this.standard(planks(3.2, (r) => this.own(r), 1.6)), 0, -0.45, 0);
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
      this.add(block(SIDE + 0.9, 0.12, SIDE + 0.9), [edge, edge, this.standard({ map: this.own(chart(label)), roughness: 0.9 }), edge, edge, edge], 0, -0.14, 0, sea);
      this.seas.push(sea);
      this.scene.add(sea);
    });
    this.peg = this.own(new T.CylinderGeometry(0.11, 0.11, 0.3, 14));
    this.hitPaint = this.standard({ color: "#e23b2a", roughness: 0.4, emissive: "#6a1408" });
    this.missPaint = this.standard({ color: "#f3f1ea", roughness: 0.5 });
    this.steel = this.standard({ color: "#8d959c", roughness: 0.5, metalness: 0.3 });
    this.wreck = this.standard({ color: "#3a2a26", roughness: 0.9 });
    // Painted like real warships (the user asked): plated sides with a red bottom, non-slip steel decks, a teak deck on
    // the battleship, a marked flight deck on the carrier, panelled superstructures with bridge windows.
    const flight = this.own(flightDeck());
    this.kit = {
      hull: this.standard({ map: this.own(hullPlates()), roughness: 0.55, metalness: 0.25 }),
      deck: this.standard({ map: this.own(deckPlates()), roughness: 0.8, metalness: 0.15 }),
      teak: this.standard({ map: this.own(wood(false)), color: "#d8b88a", roughness: 0.75 }),
      flight: this.standard({ map: flight, roughness: 0.85 }),
      panels: this.standard({ map: this.own(panels()), roughness: 0.5, metalness: 0.25 }),
      gun: this.standard({ color: "#4f565d", roughness: 0.45, metalness: 0.5 }),
      sub: this.standard({ map: this.own(subTiles()), roughness: 0.7 }),
      white: this.standard({ color: "#e9eef2", roughness: 0.5 }),
    };
    this.shell = this.add(new T.SphereGeometry(0.12, 12, 10), iron, 0, -9, 0);
    this.shell.visible = false;
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.2, 0.27, "#ffffff");
    this.latest = ringMesh(own, 0.24, 0.3, "#ffd24a");
    this.ghost = new T.Mesh(this.own(new T.BoxGeometry(1, 0.16, 0.3)), this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.6, depthWrite: false })));
    this.ghost.visible = false;
    this.scene.add(this.cursor, this.latest, this.ghost);
    this.begin();
  }
  protected layout(aspect: number) {
    // Side by side on a wide screen, set back a little so that the fleets' board has the band before them (the user
    // asked for it at the lower left); one above the other, the target farther, on a narrow one.
    this.stacked = aspect < 0.95;
    const band = bandFor(aspect);
    this.seas[0].position.set(this.stacked ? 0 : -APART, 0, this.stacked ? APART : -band);
    this.seas[1].position.set(this.stacked ? 0 : APART, 0, this.stacked ? -APART : -band);
  }
  protected subject(aspect: number): TableSubject {
    return aspect < 0.95
      ? { half: 3.1, halfZ: 6.1, height: 0.8, lookY: 0, tilt: 1.12 }
      : { half: 6.1, halfZ: 3.1 + bandFor(aspect), height: 0.8, lookY: 0, tilt: 0.9 };
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
  /**
   * A hull seen from above: a flat transom at the stern (-x), the sides running forward and drawing in to a pointed bow
   * (+x), extruded up to its deck. The sides carry the plating picture from the waterline to the deck edge, the deck
   * its own picture laid flat (`deckScale` units to a picture).
   */
  private hull(length: number, beam: number, high: number, deck: T.Material, deckScale = 1) {
    const s = new T.Shape(),
      half = beam / 2,
      bow = Math.min(length * 0.3, 0.45);
    s.moveTo(-length / 2, -half * 0.86);
    s.lineTo(length / 2 - bow, -half);
    s.quadraticCurveTo(length / 2 - bow * 0.2, -half * 0.75, length / 2, 0);
    s.quadraticCurveTo(length / 2 - bow * 0.2, half * 0.75, length / 2 - bow, half);
    s.lineTo(-length / 2, half * 0.86);
    s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth: high, bevelEnabled: false, curveSegments: 10 });
    g.rotateX(-Math.PI / 2);
    // The sides: across the picture along the ship, up it from the waterline to the deck. The deck: its own units.
    const uv = g.getAttribute("uv"),
      at = g.getAttribute("position"),
      [caps, sides] = g.groups;
    for (let i = sides.start; i < sides.start + sides.count; i++) uv.setXY(i, (at.getX(i) + length / 2) * 1.6, at.getY(i) / high);
    for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, at.getX(i) / deckScale + 0.5, -at.getZ(i) / deckScale + 0.5);
    const mesh = new T.Mesh(this.own(g), [deck, this.kit.hull]);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  /** A gun turret: a rounded housing with `barrels` guns, facing +x (or -x when `aft`). */
  private turret(g: T.Group, x: number, y: number, size: number, barrels: number, aft = false) {
    const t = new T.Group();
    this.add(block(size, size * 0.42, size * 0.8, size * 0.12), this.kit.panels, 0, size * 0.21, 0, t);
    for (let k = 0; k < barrels; k++) {
      const gun = this.add(new T.CylinderGeometry(size * 0.06, size * 0.07, size * 1.1, 8).rotateZ(-Math.PI / 2), this.kit.gun, size * 0.9, size * 0.24, (k - (barrels - 1) / 2) * size * 0.24, t);
      gun.castShadow = true;
    }
    t.position.set(x, y, 0);
    if (aft) t.rotation.y = Math.PI;
    g.add(t);
  }
  /** A mast with a cross-yard and a little radar. */
  private mast(g: T.Group, x: number, y: number, tall: number) {
    this.add(new T.CylinderGeometry(0.008, 0.012, tall, 6), this.kit.gun, x, y + tall / 2, 0, g);
    this.add(new T.BoxGeometry(0.012, 0.008, tall * 0.5), this.kit.gun, x, y + tall * 0.75, 0, g);
    this.add(block(0.05, 0.012, 0.012, 0.004), this.kit.white, x, y + tall + 0.006, 0, g);
  }
  /**
   * A ship lying over its squares, modelled after its kind (the user asked for these five): a carrier with its flight
   * deck, island and aircraft; a battleship with three triple turrets, a tower bridge and two funnels on a teak deck;
   * a destroyer with one gun, a bridge, a funnel and a launcher; a submarine low in the water with its sail, planes and
   * rudder; a patrol boat with a cabin and a gun at the bow. It points along +x before it is turned to lie down a column.
   */
  private build(ship: Ship) {
    const g = new T.Group(),
      across = ship.cells.length > 1 && ship.cells[1] - ship.cells[0] === 1,
      length = ship.cells.length * CELL - 0.12,
      kind: ShipKind = SHIP_KINDS[Math.max(0, FLEET.findIndex(([name]) => name === ship.name))] ?? "destroyer",
      k = this.kit;
    if (kind === "carrier") {
      g.add(this.hull(length - 0.1, 0.34, 0.1, k.deck));
      // The flight deck overhangs the hull; its whole marking lies across it.
      const deck = this.add(block(length, 0.03, 0.46, 0.012), [k.hull, k.hull, k.flight, k.hull, k.hull, k.hull], 0.04, 0.115, -0.02, g);
      deck.receiveShadow = true;
      this.add(block(0.34, 0.15, 0.07, 0.015), k.panels, length * 0.08, 0.205, 0.17, g);
      this.add(block(0.14, 0.05, 0.06, 0.01), k.panels, length * 0.06, 0.305, 0.17, g);
      this.mast(g, length * 0.06, 0.33, 0.14);
      // Aircraft parked toward the stern: a fuselage, swept wings and a tail.
      for (const [x, z] of [[-0.75, -0.12], [-0.6, -0.04], [-0.9, 0.06], [0.55, -0.12]]) {
        const plane = new T.Group();
        this.add(new T.CapsuleGeometry(0.018, 0.12, 3, 6).rotateZ(Math.PI / 2), k.panels, 0, 0, 0, plane);
        this.add(new T.BoxGeometry(0.06, 0.006, 0.14), k.panels, -0.01, 0, 0, plane);
        this.add(new T.BoxGeometry(0.025, 0.004, 0.06), k.panels, -0.07, 0.004, 0, plane);
        this.add(new T.BoxGeometry(0.03, 0.04, 0.005), k.panels, -0.075, 0.022, 0, plane);
        plane.position.set(x, 0.148, z);
        plane.rotation.y = 0.5;
        g.add(plane);
      }
    } else if (kind === "battleship") {
      g.add(this.hull(length, 0.32, 0.1, k.teak, 0.5));
      this.turret(g, length * 0.3, 0.1, 0.17, 3);
      this.turret(g, length * 0.17, 0.15, 0.16, 3);
      this.add(block(0.08, 0.05, 0.12, 0.02), k.panels, length * 0.17, 0.125, 0, g);
      this.turret(g, -length * 0.3, 0.1, 0.17, 3, true);
      // The tower bridge in steps, its mast, and two funnels with black caps.
      this.add(block(0.4, 0.08, 0.2, 0.02), k.panels, 0, 0.14, 0, g);
      this.add(block(0.2, 0.1, 0.13, 0.02), k.panels, 0.05, 0.23, 0, g);
      this.add(block(0.1, 0.07, 0.09, 0.015), k.panels, 0.06, 0.31, 0, g);
      this.mast(g, 0.06, 0.345, 0.16);
      for (const x of [-0.12, -0.25]) {
        this.add(new T.CylinderGeometry(0.038, 0.045, 0.15, 12), k.panels, x, 0.25, 0, g);
        this.add(new T.CylinderGeometry(0.04, 0.04, 0.025, 12), k.gun, x, 0.33, 0, g);
      }
    } else if (kind === "destroyer") {
      g.add(this.hull(length, 0.24, 0.09, k.deck));
      this.turret(g, length * 0.3, 0.09, 0.12, 1);
      this.add(block(0.22, 0.1, 0.16, 0.02), k.panels, length * 0.12, 0.14, 0, g);
      this.add(block(0.12, 0.05, 0.12, 0.015), k.panels, length * 0.12, 0.215, 0, g);
      this.mast(g, length * 0.02, 0.19, 0.2);
      this.add(new T.CylinderGeometry(0.035, 0.04, 0.12, 10), k.panels, -0.12, 0.17, 0, g);
      this.add(new T.CylinderGeometry(0.037, 0.037, 0.02, 10), k.gun, -0.12, 0.235, 0, g);
      // A missile launcher abaft the funnel, and a deckhouse at the stern.
      this.add(block(0.12, 0.06, 0.12, 0.015), k.gun, -length * 0.22, 0.12, 0, g);
      this.add(block(0.14, 0.06, 0.15, 0.015), k.panels, -length * 0.38, 0.12, 0, g);
    } else if (kind === "submarine") {
      // Low in the water: a rounded body, its sail with planes, and a cross of fins at the stern.
      const body = this.add(new T.CapsuleGeometry(0.1, length - 0.22, 6, 18).rotateZ(Math.PI / 2), k.sub, 0, 0.06, 0, g);
      body.scale.set(1, 0.75, 1);
      this.add(block(0.22, 0.14, 0.07, 0.03), k.sub, length * 0.15, 0.17, 0, g);
      this.add(new T.BoxGeometry(0.06, 0.008, 0.2), k.sub, length * 0.17, 0.2, 0, g);
      for (const r of [0, Math.PI / 2]) this.add(new T.BoxGeometry(0.1, 0.008, 0.2), k.sub, -length / 2 + 0.06, 0.07, 0, g).rotation.x = r;
      this.add(new T.CylinderGeometry(0.006, 0.006, 0.08, 6), k.gun, length * 0.13, 0.27, 0, g);
    } else {
      g.add(this.hull(length, 0.2, 0.08, k.deck));
      this.add(block(0.26, 0.08, 0.14, 0.02), k.panels, 0.02, 0.12, 0, g);
      this.add(new T.CylinderGeometry(0.02, 0.026, 0.03, 8), k.gun, length * 0.32, 0.095, 0, g);
      this.add(new T.CylinderGeometry(0.008, 0.008, 0.1, 6).rotateZ(-Math.PI / 2), k.gun, length * 0.32 + 0.05, 0.11, 0, g);
      this.mast(g, -0.06, 0.16, 0.12);
    }
    g.traverse((part) => {
      if (part instanceof T.Mesh) {
        part.castShadow = true;
        part.userData.paint = part.material;
      }
    });
    if (!across) g.rotation.y = -Math.PI / 2;
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
          if (part instanceof T.Mesh) part.material = down ? this.wreck : part.userData.paint;
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
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  protected mark(marks: Marks) {
    this.cursor.visible = marks.cursor !== null;
    if (marks.cursor !== null) this.cursor.position.set(this.at(marks.cursor).x, 0.01, this.at(marks.cursor).z);
    // While the fleet is laid, the next ship is shown where the pointer or the keyboard would put it.
    const state = this.state,
      bow = this.hovered >= 0 ? this.hovered : (marks.cursor ?? -1),
      cells = state?.phase === "place" && bow >= 0 && bow < CELLS && marks.targets.includes(bow) ? span(bow, FLEET[state.fleets[0].length][1], state.across) : null;
    this.ghost.visible = !!cells;
    if (cells && state) {
      const a = this.at(cells[0]),
        b = this.at(cells[cells.length - 1]);
      this.ghost.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
      this.ghost.scale.set(cells.length * CELL - 0.12, 1, 1);
      this.ghost.rotation.y = state.across ? 0 : Math.PI / 2;
    }
  }
}
/** Where the keyboard walks: the two charts side by side. */
export const seaPoints = () =>
  Array.from({ length: CELLS * 2 }, (_, point) => ({
    x: (point < CELLS ? -APART : APART) + (((point % CELLS) % SIZE) - 4.5) * CELL,
    z: (Math.floor((point % CELLS) / SIZE) - 4.5) * CELL - BAND,
  }));
