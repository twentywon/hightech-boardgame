import * as T from "three";
import { wood, planks, block, glossy, capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import { fireballTexture, flameTexture, pegGeometry, smokeTexture, puffTexture, radarTexture, shellGeometry, sweepTexture, waveNormals } from "./effects";
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
/** The paper of a chart, as wide as its board: the margin holds the letters, numbers and the waters' name. */
const PAPER = SIDE + 0.9;
function chart(label: string) {
  const c = document.createElement("canvas"),
    size = 1024;
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    // The margin is laid so that the squares of the picture are the squares of the table.
    m = (size * (PAPER - SIDE)) / 2 / PAPER,
    cell = (size - m * 2) / SIZE;
  // Old chart paper round the edge, a little stained.
  ctx.fillStyle = "#e6dbbd";
  ctx.fillRect(0, 0, size, size);
  let seed = 97;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 40; i++) {
    const x = random() * size,
      y = random() * size,
      g = ctx.createRadialGradient(x, y, 0, x, y, 20 + random() * 60);
    g.addColorStop(0, "rgba(150,120,70,0.12)");
    g.addColorStop(1, "rgba(150,120,70,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // Deep water, shoaling a little toward one corner, with faint depth lines.
  const sea = ctx.createLinearGradient(m, m, size - m, size - m);
  sea.addColorStop(0, "#1d5277");
  sea.addColorStop(1, "#14405f");
  ctx.fillStyle = sea;
  ctx.fillRect(m, m, size - m * 2, size - m * 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(m, m, size - m * 2, size - m * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(160,210,235,0.16)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 7; k++) {
    ctx.beginPath();
    for (let x = m - 20; x <= size - m + 20; x += 16) {
      const y = m + 60 + k * 130 + Math.sin(x / 90 + k) * 26 + Math.sin(x / 33 + k * 2) * 6;
      if (x === m - 20) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(235,245,255,0.62)";
  ctx.lineWidth = 2.5;
  for (let i = 0; i <= SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(m + i * cell, m);
    ctx.lineTo(m + i * cell, size - m);
    ctx.moveTo(m, m + i * cell);
    ctx.lineTo(size - m, m + i * cell);
    ctx.stroke();
  }
  ctx.strokeStyle = "#4a3b28";
  ctx.lineWidth = 3;
  ctx.strokeRect(m - 6, m - 6, size - m * 2 + 12, size - m * 2 + 12);
  ctx.fillStyle = "#3e3121";
  ctx.font = '700 38px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < SIZE; i++) {
    ctx.fillText("ABCDEFGHIJ"[i], m + (i + 0.5) * cell, m / 2 + 4);
    ctx.fillText(String(i + 1), m / 2 + 2, m + (i + 0.5) * cell);
  }
  ctx.font = '700 34px "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(label, size / 2, size - m / 2 + 2);
  // A small compass rose in the corner of the margin.
  ctx.save();
  ctx.translate(size - m / 2, size - m / 2);
  ctx.fillStyle = "#7a2f22";
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -m * 0.38);
    ctx.lineTo(m * 0.08, 0);
    ctx.lineTo(-m * 0.08, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
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
/** A crosshair for the square under the pointer in the waters fired at. */
function crosshair() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#ff5a3c";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  for (const [x0, y0, x1, y1] of [[64, 4, 64, 40], [64, 88, 64, 124], [4, 64, 40, 64], [88, 64, 124, 64]]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** How many drops a splash throws, how many bits a hit throws, how many puffs a shell's trail and the fires' smoke have. */
const SPRAY = 18,
  DEBRIS = 12,
  TRAIL = 22,
  SMOKE = 120,
  /** How long a shell flies, and how long its splash or blast lasts once it lands. */
  FLIGHT = 560,
  BURST = 700,
  /** How long a ship takes to list and settle as it goes down. */
  SINKING = 1100,
  /** The height of the water over the charts. */
  WATER = 0.035;
interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  dark: number;
}
/** Two sea charts on plotting tables in a cellar war room. */
export class SeaBattleView extends TableView<State> {
  private seas: T.Group[] = [];
  private ships: T.Group[][] = [[], []];
  private pegs = new Map<number, T.Mesh>();
  private peg: T.BufferGeometry;
  private hitPaint: T.Material;
  private missPaint: T.Material;
  private wreck: T.Material;
  /** The ships' paints: hull sides, decks (steel, teak and a carrier's flight deck), superstructure, guns, a submarine's skin. */
  private kit!: { hull: T.Material; deck: T.Material; teak: T.Material; flight: T.Material; panels: T.Material; gun: T.Material; sub: T.Material; white: T.Material };
  private shell: T.Mesh;
  private cursor: T.Mesh;
  private latest: T.Mesh;
  private reticle: T.Mesh;
  private stacked = false;
  private ghost: T.Mesh;
  private hovered = -1;
  private laid: State["fleets"] | null = null;
  /** The water over each chart, and its moving relief where a graphics card draws. */
  private waves: T.Texture | null = null;
  /** Where a graphics card draws; and there, unless motion is reduced, the sea moves, fires flicker and smoke rises. */
  private rich: boolean;
  private live: boolean;
  private ticking = 0;
  private fires = new Map<number, T.Sprite>();
  private flame: T.SpriteMaterial;
  /** A splash: drops thrown up and falling back, a column of spray, a ring running out over the water. */
  private spray: T.InstancedMesh;
  private sprayWay: T.Vector3[] = [];
  private column: T.Mesh;
  private crown: T.Mesh;
  /** A hit: a flash, a ball of fire, bits of the ship thrown out. */
  private flash: T.Sprite;
  private fireball: T.Sprite;
  /** The black smoke a hit throws up. */
  private cloud: T.Sprite;
  private debris: T.InstancedMesh;
  private debrisWay: T.Vector3[] = [];
  /** The shell's trail of smoke, and the smoke of the fires (where a graphics card draws). */
  private trail: T.Points;
  private smoke: T.Points | null = null;
  private puffs: Puff[] = [];
  private sweep: T.Mesh | null = null;
  private last = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    /** Whose ships are shown while the battle lasts: side 0's against the computer, nobody's with two players. */
    private open: boolean[],
  ) {
    super(host, quality, "#15171a");
    this.rich = capable();
    this.live = this.rich && !this.reducedMotion;
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
    const iron = this.standard({ color: "#2f3338", roughness: 0.5, metalness: 0.5 });
    this.room(iron);
    // The two charts, each on a plotting table: a gunmetal frame with brass corners round the paper, and water over the squares.
    const edge = this.standard({ color: "#3a2c1f", roughness: 0.6 }),
      gunmetal = this.standard({ color: "#3b4248", roughness: 0.38, metalness: 0.6 }),
      brass = this.standard({ color: "#b8913f", roughness: 0.3, metalness: 0.75 });
    if (this.rich) {
      this.waves = this.own(waveNormals());
      this.waves.repeat.set(1.2, 1.2);
    }
    const water = this.own(
      new T.MeshStandardMaterial({
        color: "#2a7aa8",
        transparent: true,
        opacity: this.rich ? 0.3 : 0.22,
        roughness: this.rich ? 0.1 : 0.35,
        metalness: 0.1,
        depthWrite: false,
        ...(this.waves ? { normalMap: this.waves, normalScale: new T.Vector2(0.28, 0.28) } : {}),
      }),
    );
    const surface = this.own(new T.PlaneGeometry(SIDE, SIDE).rotateX(-Math.PI / 2));
    ["청군 해역", "홍군 해역"].forEach((label) => {
      const sea = new T.Group();
      this.add(block(PAPER, 0.12, PAPER), [edge, edge, this.standard({ map: this.own(chart(label)), roughness: 0.9 }), edge, edge, edge], 0, -0.14, 0, sea);
      // The two tables stand side by side (or one behind the other) and meet along their inner rails.
      const bar = 0.2,
        out = PAPER / 2 + bar / 2;
      for (const z of [-out, out]) this.add(block(PAPER + bar * 2, 0.27, bar, 0.05), gunmetal, 0, -0.065, z, sea);
      for (const x of [-out, out]) this.add(block(bar, 0.27, PAPER, 0.05), gunmetal, x, -0.065, 0, sea);
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const corner = this.add(block(0.3, 0.04, 0.3, 0.015), brass, x * out, 0.085, z * out, sea);
          corner.userData.corner = { x, z };
        }
      const w = new T.Mesh(surface, water);
      w.position.y = WATER;
      w.renderOrder = 1;
      sea.add(w);
      this.seas.push(sea);
      this.scene.add(sea);
    });
    this.peg = this.own(pegGeometry());
    this.hitPaint = this.own(glossy({ color: "#d8321f", roughness: 0.35, emissive: "#5a1006" }, 0.6));
    this.missPaint = this.own(glossy({ color: "#f3f1ea", roughness: 0.4 }, 0.6));
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
    // The shell, and what its landing throws up.
    this.shell = this.add(shellGeometry(), this.standard({ color: "#7d848a", roughness: 0.35, metalness: 0.7 }), 0, -9, 0);
    this.shell.visible = false;
    const puff = this.own(puffTexture()),
      glow = (color: string, blending: T.Blending = T.AdditiveBlending) => {
        const s = new T.Sprite(this.own(new T.SpriteMaterial({ map: puff, color, transparent: true, depthWrite: false, blending })));
        s.visible = false;
        s.renderOrder = 7;
        this.scene.add(s);
        return s;
      };
    this.flash = glow("#ffe2a0");
    const sprite = (map: T.Texture) => {
      const s = new T.Sprite(this.own(new T.SpriteMaterial({ map, transparent: true, depthWrite: false })));
      s.visible = false;
      s.renderOrder = 7;
      this.scene.add(s);
      return s;
    };
    this.cloud = sprite(this.own(smokeTexture()));
    this.fireball = sprite(this.own(fireballTexture()));
    this.flame = this.own(new T.SpriteMaterial({ map: this.own(flameTexture()), transparent: true, depthWrite: false }));
    const many = (geometry: T.BufferGeometry, material: T.Material, count: number) => {
      const mesh = new T.InstancedMesh(this.own(geometry), material, count);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    const random = sequence(5);
    this.spray = many(new T.SphereGeometry(0.05, 8, 6), this.standard({ color: "#e8f4fb", roughness: 0.2, emissive: "#3a5a6a" }), SPRAY);
    for (let i = 0; i < SPRAY; i++) {
      const a = (i / SPRAY) * Math.PI * 2,
        out = 0.35 + random() * 0.7;
      this.sprayWay.push(new T.Vector3(Math.cos(a) * out, 2.8 + random() * 1.4, Math.sin(a) * out));
    }
    this.debris = many(new T.BoxGeometry(0.05, 0.03, 0.04), this.standard({ color: "#2a2522", roughness: 0.8, emissive: "#401204" }), DEBRIS);
    for (let i = 0; i < DEBRIS; i++) {
      const a = random() * Math.PI * 2,
        out = 0.6 + random() * 1.0;
      this.debrisWay.push(new T.Vector3(Math.cos(a) * out, 1.8 + random() * 1.6, Math.sin(a) * out));
    }
    this.column = new T.Mesh(this.own(new T.CylinderGeometry(0.07, 0.19, 1, 14, 1, true)), this.own(new T.MeshStandardMaterial({ color: "#eef7fb", transparent: true, opacity: 0.7, roughness: 0.3, depthWrite: false })));
    this.column.visible = false;
    this.crown = new T.Mesh(this.own(new T.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8, depthWrite: false })));
    this.crown.visible = false;
    this.crown.renderOrder = 4;
    this.scene.add(this.column, this.crown);
    const points = (count: number, size: number, color: string) => {
      const g = this.own(new T.BufferGeometry());
      g.setAttribute("position", new T.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute("color", new T.BufferAttribute(new Float32Array(count * 4), 4));
      g.setDrawRange(0, 0);
      const p = new T.Points(g, this.own(new T.PointsMaterial({ map: puff, size, vertexColors: true, transparent: true, depthWrite: false, color })));
      p.frustumCulled = false;
      p.renderOrder = 6;
      this.scene.add(p);
      return p;
    };
    this.trail = points(TRAIL, 0.42, "#ffffff");
    if (this.rich) this.smoke = points(SMOKE, 0.6, "#ffffff");
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.2, 0.27, "#ffffff");
    this.latest = ringMesh(own, 0.24, 0.3, "#ffd24a");
    this.reticle = new T.Mesh(this.own(new T.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ map: this.own(crosshair()), transparent: true, depthWrite: false })));
    this.reticle.visible = false;
    this.reticle.renderOrder = 5;
    this.ghost = new T.Mesh(this.own(new T.BoxGeometry(1, 0.16, 0.3)), this.own(new T.MeshBasicMaterial({ color: "#ffd24a", transparent: true, opacity: 0.6, depthWrite: false })));
    this.ghost.visible = false;
    this.scene.add(this.cursor, this.latest, this.ghost, this.reticle);
    this.begin();
    this.ticking = requestAnimationFrame(this.tick);
  }
  /**
   * The cellar war room: block walls with pipes and a wall map, the lamp's shade, an oak table on iron legs, and on it
   * a radar set with its sweeping screen, a field telephone, a mug, a ruler and pencil and a pair of dividers.
   */
  private room(iron: T.Material) {
    const concrete = this.standard({ map: this.own(blocks()), roughness: 1 }),
      wall = this.add(new T.PlaneGeometry(60, 24), concrete, 0, 8, -9);
    wall.castShadow = false;
    const floor = this.add(new T.PlaneGeometry(90, 90), this.standard({ color: "#2a2c2e", roughness: 1 }), 0, -4.2, 0);
    floor.rotation.x = -Math.PI / 2;
    const shade = this.add(new T.ConeGeometry(1.5, 1.0, 28, 1, true), this.standard({ color: "#2f4a3a", roughness: 0.45, metalness: 0.3, side: T.DoubleSide }), 0, 9.4, -3);
    shade.castShadow = false;
    this.add(new T.SphereGeometry(0.28, 14, 10), this.own(new T.MeshBasicMaterial({ color: "#fff0c0" })), 0, 9.1, -3).castShadow = false;
    for (const y of [11.2, 10.6]) this.add(new T.CylinderGeometry(0.16, 0.16, 60, 12), iron, 0, y, -8.6).rotation.z = Math.PI / 2;
    // A wall map with pins, and a board of signal flags beside it.
    this.add(block(7.4, 4.6, 0.1, 0.03), this.standard({ color: "#d9cfb2", roughness: 1 }), -5.5, 5.6, -8.9);
    this.add(new T.PlaneGeometry(6.6, 3.8), this.standard({ color: "#7fa3b8", roughness: 1 }), -5.5, 5.6, -8.83);
    for (const [x, y, sx, sy] of [[-7, 6.2, 1.6, 0.9], [-4.6, 5.1, 2.0, 1.2], [-3.4, 6.6, 0.9, 0.6]])
      this.add(new T.CircleGeometry(1, 14), this.standard({ color: "#9aa873", roughness: 1 }), x, y, -8.8).scale.set(sx, sy, 1);
    for (const [x, y] of [[-6.6, 6.3], [-4.9, 5.4], [-3.6, 6.5]]) this.add(new T.SphereGeometry(0.1, 10, 8), this.standard({ color: "#c8321f" }), x, y, -8.72);
    const flags = ["#c8321f", "#f0c23a", "#2f5fa8", "#f4f1e6", "#1f7a4a", "#c8321f"];
    flags.forEach((color, i) => this.add(new T.PlaneGeometry(0.9, 0.7), this.standard({ color, roughness: 0.9, side: T.DoubleSide }), 3.2 + (i % 3) * 1.1, 6.6 - Math.floor(i / 3) * 1.0, -8.85));
    // The table and its legs.
    const top = this.add(block(26, 0.5, 13), this.standard(planks(3.2, (r) => this.own(r), 1.6)), 0, -0.45, 0);
    top.castShadow = false;
    for (const x of [-12, 12]) for (const z of [-5.6, 5.6]) this.add(new T.BoxGeometry(0.7, 3.8, 0.7), iron, x, -2.5, z);
    // A radar set: an olive cabinet with a round green screen whose sweep turns, and its knobs.
    const olive = this.standard({ color: "#4a5a3c", roughness: 0.6 });
    this.add(block(2.6, 1.5, 1.2, 0.08), olive, -9, 0.55, -4.4);
    this.add(new T.CircleGeometry(0.52, 32), this.own(new T.MeshBasicMaterial({ map: this.own(radarTexture()) })), -9.35, 0.62, -3.79);
    this.add(new T.TorusGeometry(0.54, 0.05, 8, 32), iron, -9.35, 0.62, -3.79);
    this.sweep = new T.Mesh(this.own(new T.CircleGeometry(0.5, 32)), this.own(new T.MeshBasicMaterial({ map: this.own(sweepTexture()), transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    this.sweep.position.set(-9.35, 0.62, -3.775);
    this.scene.add(this.sweep);
    for (const [x, y] of [[-8.3, 0.85], [-8.3, 0.4], [-7.95, 0.62]]) this.add(new T.CylinderGeometry(0.1, 0.1, 0.1, 16), iron, x, y, -3.78).rotation.x = Math.PI / 2;
    this.add(new T.CylinderGeometry(0.02, 0.02, 2.2, 6), iron, -7.9, 2.3, -4.6);
    // A field telephone: a red case, its cradle and handset, a crank.
    const red = this.standard({ color: "#a32a22", roughness: 0.4 }),
      black = this.standard({ color: "#1c1d1f", roughness: 0.35 });
    this.add(block(1.5, 0.5, 1.1, 0.08), red, 9.2, 0.05, -4.3);
    this.add(block(1.2, 0.08, 0.36, 0.03), black, 9.2, 0.34, -4.3);
    const handset = new T.Group();
    this.add(new T.CylinderGeometry(0.06, 0.06, 1.2, 10).rotateZ(Math.PI / 2), black, 0, 0.08, 0, handset);
    for (const x of [-0.55, 0.55]) this.add(new T.CylinderGeometry(0.16, 0.12, 0.16, 16), black, x, 0, 0, handset);
    handset.position.set(9.2, 0.42, -4.3);
    this.scene.add(handset);
    this.add(new T.CylinderGeometry(0.03, 0.03, 0.3, 8), iron, 10.0, 0.1, -4.0).rotation.z = Math.PI / 2;
    this.add(new T.CylinderGeometry(0.4, 0.36, 0.7, 22), this.standard({ color: "#c9c4b6", roughness: 0.35, metalness: 0.4 }), 9.6, 0.15, 4.3);
    this.add(new T.CylinderGeometry(0.35, 0.35, 0.02, 22), this.standard({ color: "#2a1a10", roughness: 0.15 }), 9.6, 0.48, 4.3);
    this.add(new T.BoxGeometry(3.6, 0.04, 0.34), this.standard({ color: "#d9c58a" }), -9.2, -0.18, 4.4).rotation.y = 0.3;
    this.add(new T.CylinderGeometry(0.05, 0.05, 1.8, 8), this.standard({ color: "#c8a23a" }), -8.4, -0.15, 3.6).rotation.set(Math.PI / 2, 0, -0.6);
    // Brass dividers, open, lying behind the charts.
    const brass = this.standard({ color: "#c49a48", roughness: 0.3, metalness: 0.75 });
    for (const turn of [0.16, -0.16]) {
      const leg = this.add(new T.CylinderGeometry(0.025, 0.01, 1.4, 8).rotateZ(Math.PI / 2), brass, 0.65, -0.17, -4.75);
      leg.rotation.y = turn;
      leg.position.set(1.0 - Math.cos(turn) * 0.7, -0.17, -4.75 + Math.sin(turn) * 0.7);
    }
  }
  protected layout(aspect: number) {
    // Side by side on a wide screen, set back a little so that the fleets' board has the band before them (the user
    // asked for it at the lower left); one above the other, the target farther, on a narrow one.
    this.stacked = aspect < 0.95;
    const band = bandFor(aspect);
    this.seas[0].position.set(this.stacked ? 0 : -APART, 0, this.stacked ? APART : -band);
    this.seas[1].position.set(this.stacked ? 0 : APART, 0, this.stacked ? -APART : -band);
    // Brass caps only on the outer corners: where the two tables meet, the rails run on.
    this.seas.forEach((sea, side) =>
      sea.children.forEach((part) => {
        const corner = part.userData.corner as { x: number; z: number } | undefined;
        if (corner) part.visible = this.stacked ? corner.z !== (side ? 1 : -1) : corner.x !== (side ? -1 : 1);
      }),
    );
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
    const outer = new T.Group(),
      g = new T.Group(),
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
    // The parts ride in a body of their own, which lists and sinks about the ship's length.
    outer.add(g);
    outer.userData.body = g;
    if (!across) outer.rotation.y = -Math.PI / 2;
    outer.userData.middle = (ship.cells[0] + ship.cells[ship.cells.length - 1]) / 2;
    outer.userData.cells = ship.cells;
    return outer;
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
      this.puffs = [];
    }
    state.fleets.forEach((fleet, side) =>
      fleet.forEach((ship, k) => {
        const g = this.ships[side][k],
          body = g.userData.body as T.Group,
          first = ship.cells[0],
          last = ship.cells[ship.cells.length - 1],
          down = sunk(state, side, ship);
        g.position.set((((first % SIZE) + (last % SIZE)) / 2 - 4.5) * CELL, 0.02, ((Math.floor(first / SIZE) + Math.floor(last / SIZE)) / 2 - 4.5) * CELL);
        // A sunk ship lies over on its side, low in the water, burnt black.
        body.position.y = down ? -0.075 : 0;
        body.rotation.set(down ? (k % 2 ? 0.32 : -0.32) : 0, 0, down ? 0.035 : 0);
        // Hidden until it goes down, unless its side plays with open charts or the battle is over.
        g.visible = this.open[side] || down || state.winner !== null;
        g.traverse((part) => {
          if (part instanceof T.Mesh) part.material = down ? this.wreck : part.userData.paint;
        });
      }),
    );
    for (const [point, peg] of this.pegs)
      if (!state.shots[Math.floor(point / CELLS)][point % CELLS]) {
        peg.removeFromParent();
        this.pegs.delete(point);
      }
    const burning = new Set<number>();
    state.shots.forEach((shots, side) =>
      shots.forEach((shot, cell) => {
        if (!shot) return;
        const point = side * CELLS + cell,
          ship = state.fleets[side].find((s) => s.cells.includes(cell)),
          hit = !!ship;
        let peg = this.pegs.get(point);
        if (!peg) {
          peg = new T.Mesh(this.peg, hit ? this.hitPaint : this.missPaint);
          peg.castShadow = true;
          this.pegs.set(point, peg);
          this.scene.add(peg);
        }
        const p = this.at(point);
        // A white peg stands in the water where a shot fell; a red one stands tall through the ship it struck.
        peg.position.set(p.x, hit ? 0 : -0.02, p.z);
        peg.scale.set(1, hit ? 1.3 : 0.8, 1);
        peg.visible = true;
        // A ship struck and still afloat burns where it was struck.
        if (ship && !sunk(state, side, ship)) burning.add(point);
      }),
    );
    for (const [point, fire] of this.fires)
      if (!burning.has(point)) {
        fire.removeFromParent();
        this.fires.delete(point);
      }
    for (const point of burning) {
      let fire = this.fires.get(point);
      if (!fire) {
        fire = new T.Sprite(this.flame);
        fire.center.set(0.5, 0.12);
        fire.renderOrder = 7;
        this.fires.set(point, fire);
        this.scene.add(fire);
      }
      const p = this.at(point);
      fire.position.set(p.x, 0.16, p.z);
      fire.scale.set(0.34, 0.6, 1);
    }
    this.shell.visible = false;
    this.latest.visible = !!state.last;
    if (state.last) this.latest.position.set(this.at(state.last.point).x, WATER + 0.008, this.at(state.last.point).z);
  }
  /** Hides what a shot's landing threw up. */
  private calm() {
    this.spray.visible = this.debris.visible = this.column.visible = this.crown.visible = this.flash.visible = this.fireball.visible = this.cloud.visible = false;
    this.trail.geometry.setDrawRange(0, 0);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    const point = state.last.point,
      target = Math.floor(point / CELLS),
      p = this.at(point),
      hit = state.last.hit,
      // The shell is fired from over the shooter's own chart, toward the near side, and comes down in an arc.
      home = this.seas[target ? 0 : 1].position,
      start = new T.Vector3(home.x, 0.5, home.z + 1.2),
      end = new T.Vector3(p.x, WATER, p.z),
      high = 1.1 + start.distanceTo(end) * 0.08,
      along = (t: number, out: T.Vector3) => out.lerpVectors(start, end, t).setY(start.y + (end.y - start.y) * t + high * 4 * t * (1 - t)),
      at = new T.Vector3(),
      ahead = new T.Vector3(),
      trail = this.trail.geometry,
      spots = trail.getAttribute("position") as T.BufferAttribute,
      tints = trail.getAttribute("color") as T.BufferAttribute;
    this.calm();
    this.shell.visible = true;
    this.tween(0, FLIGHT, (t) => {
      along(t, at);
      along(Math.min(1, t + 0.02), ahead);
      this.shell.position.copy(at);
      if (t < 1) this.shell.lookAt(ahead);
      // A thin trail of smoke behind it, oldest palest.
      let n = 0;
      for (let k = 0; k < TRAIL; k++) {
        const back = t - k * 0.025;
        if (back < 0) break;
        along(back, ahead);
        spots.setXYZ(n, ahead.x, ahead.y, ahead.z);
        tints.setXYZW(n, 0.85, 0.85, 0.85, 0.5 * (1 - k / TRAIL));
        n++;
      }
      spots.needsUpdate = tints.needsUpdate = true;
      trail.setDrawRange(0, n);
      if (t === 1) {
        this.shell.visible = false;
        this.place(state);
        this.onContact();
      }
    });
    const peg = () => this.pegs.get(point),
      m = new T.Matrix4(),
      q = new T.Quaternion(),
      v = new T.Vector3(),
      s = new T.Vector3();
    let smoked = false;
    this.tween(FLIGHT, BURST, (u) => {
      const time = (u * BURST) / 1000;
      // The trail thins away.
      const n = trail.drawRange.count;
      for (let k = 0; k < n; k++) tints.setW(k, Math.max(0, tints.getW(k) - 0.06));
      tints.needsUpdate = true;
      if (u === 1) trail.setDrawRange(0, 0);
      if (!hit) {
        // A miss: drops thrown up in a ring fall back, a column of white water rises and falls, a ring runs out.
        this.spray.visible = this.column.visible = this.crown.visible = u < 1;
        this.sprayWay.forEach((way, i) => {
          const y = Math.max(WATER, WATER + way.y * time - 4.9 * time * time),
            size = 1 - u * 0.6;
          m.compose(v.set(p.x + way.x * time * 0.5, y, p.z + way.z * time * 0.5), q, s.set(size, size, size));
          this.spray.setMatrixAt(i, m);
        });
        this.spray.instanceMatrix.needsUpdate = true;
        const tall = 1.05 * Math.sin(Math.PI * Math.min(1, u * 1.2));
        this.column.scale.set(1 + u * 0.8, Math.max(0.001, tall), 1 + u * 0.8);
        this.column.position.set(p.x, WATER + tall / 2, p.z);
        (this.column.material as T.MeshStandardMaterial).opacity = 0.75 * (1 - u * u);
        this.crown.scale.setScalar(0.15 + 0.5 * u);
        this.crown.position.set(p.x, WATER + 0.004, p.z);
        (this.crown.material as T.MeshBasicMaterial).opacity = 0.85 * (1 - u);
        const white = peg();
        if (white) white.scale.set(1, 0.8 * Math.min(1, 0.2 + u * 1.4), 1);
      } else {
        // A hit: a white flash, a ball of fire swelling and rising, bits of the ship thrown out, the red peg driven in.
        this.flash.visible = u < 0.3;
        const f = Math.sin(Math.PI * Math.min(1, u / 0.3));
        this.flash.scale.setScalar(0.3 + 1.0 * f);
        this.flash.position.set(p.x, 0.25, p.z);
        this.fireball.visible = u < 1;
        this.fireball.scale.setScalar(0.35 + 0.75 * Math.sqrt(u));
        this.fireball.position.set(p.x, 0.25 + 0.35 * u, p.z);
        this.fireball.material.opacity = Math.min(1, (1 - u) * 2);
        // Black smoke billows up behind the fire and thins.
        this.cloud.visible = u > 0.08 && u < 1;
        this.cloud.scale.setScalar(0.45 + 0.85 * u);
        this.cloud.position.set(p.x, 0.45 + 0.6 * u, p.z - 0.08);
        this.cloud.material.opacity = Math.min(1, 1.6 * Math.sin(Math.PI * u));
        this.cloud.material.rotation = u * 0.8;
        this.fireball.material.rotation = -u * 0.6;
        this.debris.visible = u < 1;
        this.debrisWay.forEach((way, i) => {
          const y = Math.max(WATER, 0.15 + way.y * time - 4.9 * time * time);
          q.setFromAxisAngle(v.set(1, 0.4, 0.2).normalize(), time * 14 + i);
          m.compose(v.set(p.x + way.x * time * 0.5, y, p.z + way.z * time * 0.5), q, s.setScalar(1));
          this.debris.setMatrixAt(i, m);
        });
        this.debris.instanceMatrix.needsUpdate = true;
        const red = peg();
        if (red) red.scale.set(1 + Math.sin(Math.PI * u) * 0.6, 1.3 * (0.3 + 0.7 * Math.min(1, u * 1.6)), 1 + Math.sin(Math.PI * u) * 0.6);
        if (u > 0 && !smoked) {
          smoked = true;
          for (let k = 0; k < 8; k++) this.puff(p.x, 0.25, p.z, 0.55, 1.6);
        }
      }
    });
    // A ship that has gone down lists over and settles low in the water as it burns out.
    if (state.last.sunk) {
      const ship = state.fleets[target].findIndex((s) => s.cells.includes(point % CELLS)),
        g = this.ships[target][ship],
        lean = ship % 2 ? 0.32 : -0.32;
      let gurgled = false;
      this.tween(FLIGHT + 260, SINKING, (u) => {
        const body = g?.userData.body as T.Group | undefined;
        if (!body) return;
        const e = 1 - (1 - u) ** 3;
        body.rotation.set(lean * e + Math.sin(u * Math.PI * 3) * 0.04 * (1 - u), 0, 0.035 * e);
        body.position.y = -0.075 * e;
        if (u > 0 && !gurgled) {
          gurgled = true;
          this.onKnock?.("pocket", 0.6);
        }
      });
    }
    return true;
  }
  /** Lets a puff of smoke go at a place (where a graphics card draws). */
  private puff(x: number, y: number, z: number, dark: number, life = 2.4) {
    if (!this.smoke) return;
    if (this.puffs.length >= SMOKE) this.puffs.shift();
    this.puffs.push({ x: x + (Math.random() - 0.5) * 0.08, y, z: z + (Math.random() - 0.5) * 0.08, vx: (Math.random() - 0.5) * 0.12, vy: 0.35 + Math.random() * 0.25, vz: -0.05 - Math.random() * 0.08, age: 0, life, dark });
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  protected mark(marks: Marks) {
    this.cursor.visible = marks.cursor !== null;
    if (marks.cursor !== null) this.cursor.position.set(this.at(marks.cursor).x, WATER + 0.012, this.at(marks.cursor).z);
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
    // In battle, the square under the pointer that can be fired at carries a crosshair.
    const aim = state?.phase === "battle" && this.hovered >= 0 && marks.targets.includes(this.hovered) ? this.hovered : -1;
    this.reticle.visible = aim >= 0;
    if (aim >= 0) this.reticle.position.set(this.at(aim).x, WATER + 0.016, this.at(aim).z);
    this.redraw();
  }
  /** The room's own clock, where a graphics card draws: the sea moves, fires flicker and smoke, ships ride the swell, the radar sweeps. */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (!this.live || capturing()) return;
    const t = now / 1000;
    if (this.waves) this.waves.offset.set(t * 0.011, t * 0.007);
    if (this.sweep) this.sweep.rotation.z = -t * 1.4;
    let i = 0;
    for (const [point, fire] of this.fires) {
      i++;
      fire.scale.set(0.34 * (0.9 + 0.12 * Math.sin(t * 17 + i * 2)), 0.6 * (0.82 + 0.16 * Math.sin(t * 11 + i) + 0.08 * Math.sin(t * 29 + i * 3)), 1);
      if (Math.random() < dt * 6) {
        const p = this.at(point);
        this.puff(p.x, 0.32, p.z, 0.32);
      }
    }
    if (this.smoke) {
      const g = this.smoke.geometry,
        spots = g.getAttribute("position") as T.BufferAttribute,
        tints = g.getAttribute("color") as T.BufferAttribute;
      this.puffs = this.puffs.filter((puff) => (puff.age += dt) < puff.life);
      this.puffs.forEach((puff, k) => {
        puff.x += puff.vx * dt;
        puff.y += puff.vy * dt;
        puff.z += puff.vz * dt;
        puff.vy *= 1 - dt * 0.4;
        const life = puff.age / puff.life,
          shade = 0.15 + puff.dark * 0.25 + life * 0.25;
        spots.setXYZ(k, puff.x, puff.y, puff.z);
        tints.setXYZW(k, shade, shade, shade * 1.02, 0.55 * Math.sin(Math.PI * Math.min(1, life * 1.4 + 0.05)) * (1 - life));
      });
      spots.needsUpdate = tints.needsUpdate = true;
      g.setDrawRange(0, this.puffs.length);
    }
    // Ships afloat and in sight ride a gentle swell.
    if (this.state)
      this.ships.forEach((fleet, side) =>
        fleet.forEach((g, k) => {
          const ship = this.state!.fleets[side][k];
          if (!g.visible || !ship || sunk(this.state!, side, ship)) return;
          const body = g.userData.body as T.Group;
          body.position.y = 0.005 * Math.sin(t * 1.3 + k * 1.7 + side);
          body.rotation.x = 0.018 * Math.sin(t * 0.9 + k * 2.3 + side);
        }),
      );
    this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    super.dispose();
  }
}
/** Where the keyboard walks: the two charts side by side. */
export const seaPoints = () =>
  Array.from({ length: CELLS * 2 }, (_, point) => ({
    x: (point < CELLS ? -APART : APART) + (((point % CELLS) % SIZE) - 4.5) * CELL,
    z: (Math.floor((point % CELLS) / SIZE) - 4.5) * CELL - BAND,
  }));
