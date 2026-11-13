import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { GO, type State } from "./rules";

export const RIVER_COLORS: [string, string] = ["#3f8fd0", "#b9b3a4"];
/** Where the boat lies at either bank, the line the company's noses keep to, the water, the boat's floor, and the colours of the couples. */
const BOAT_X = 1.35,
  EDGE = 3.4,
  WATER = -0.2,
  FLOOR = -0.08,
  FAMILY = ["#d04a34", "#2f6ad0", "#3c9c56", "#e3a81f"];
/** How far each kind reaches before and behind where it stands, and how tall it is (at scale 1). */
const REACH: Record<string, [number, number, number]> = {
  farmer: [0.5, 0.5, 2.2],
  husband: [0.45, 0.45, 2.05],
  wife: [0.52, 0.52, 2.15],
  wolf: [1.45, 1.2, 1.6],
  fox: [1.22, 1.02, 1.36],
  cat: [0.86, 0.8, 1.1],
  goat: [1.22, 0.68, 1.62],
  sheep: [1.15, 0.7, 1.42],
  mouse: [0.7, 0.66, 0.85],
  hen: [0.66, 0.7, 1.32],
  cabbage: [0.5, 0.5, 0.85],
  grain: [0.48, 0.48, 1.18],
  cheese: [0.52, 0.52, 0.6],
};
const reach = (role: string) => REACH[role] ?? [0.5, 0.5, 1];
/** A small repeatable source of numbers for laying out scenery (the platform's is left to the games). */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** The outline of the boat seen from above, a pointed oval: for an angle, a place on it. */
const hullAt = (angle: number) => ({ x: Math.sin(angle) * (1 - 0.45 * Math.cos(angle) ** 2) * 1.1, z: Math.cos(angle) * 2.3 });
interface Plan {
  scale: number;
  /** Where each of the company stands on the far bank; the near bank mirrors it. */
  at: { x: number; z: number }[];
}
/**
 * How a company is drawn up on a bank so that none stands in another: the
 * farmer's four in one line along the water; a flock in two lines, sheep
 * before wolves; couples side by side, a row to each. The larger the
 * company, the smaller its figures and the closer its rows.
 */
function draw(state: State): Plan {
  const n = state.actors.length,
    front = (i: number) => reach(state.actors[i].role)[0],
    depth = (i: number) => front(i) + reach(state.actors[i].role)[1];
  if (state.kind === "farmer") return { scale: 1.15, at: state.actors.map((_, i) => ({ x: EDGE + front(i) * 1.15, z: (i - (n - 1) / 2) * 1.6 })) };
  const rows = n / 2,
    flock = state.kind === "flock",
    scale = flock ? (rows <= 3 ? 0.95 : rows === 4 ? 0.9 : 0.85) : rows <= 3 ? 1.15 : 1,
    gap = flock ? (rows <= 3 ? 1.9 : rows === 4 ? 1.55 : 1.3) : rows <= 3 ? 1.9 : 1.6,
    // Sheep are listed before wolves; a couple is a husband and then his wife, who stands nearer the water.
    column = (i: number) => (flock ? (i < rows ? 0 : 1) : i % 2 ? 0 : 1),
    row = (i: number) => (flock ? i % rows : Math.floor(i / 2)),
    first = Math.max(...state.actors.map((_, i) => (column(i) ? 0 : depth(i)))) * scale;
  return { scale, at: state.actors.map((_, i) => ({ x: EDGE + (column(i) ? first + 0.2 : 0) + front(i) * scale, z: (row(i) - (rows - 1) / 2) * gap })) };
}
type Shape = "ball" | "box" | "cone" | "rod" | "wedge" | "dome";
type Triple = [number, number, number];
/**
 * A river between two wooded banks, a rowing boat at a jetty, and the
 * company that has to cross: people and animals modelled from plain solids.
 * A tap on someone puts them in the boat or takes them out; a tap on the
 * boat sends it across. The water runs and the company breathes while the
 * table waits.
 */
export class RiverView extends TableView<State> {
  private figures: T.Group[] = [];
  private tails: (T.Object3D | null)[] = [];
  private built = "";
  private plan: Plan = { scale: 1, at: [] };
  private boat = new T.Group();
  private oars: T.Group[] = [];
  private ripples: T.Mesh[] = [];
  private flows: { texture: T.Texture; speed: number }[] = [];
  private cursor: T.Mesh;
  private arrow = new T.Group();
  private alarms: T.Sprite[] = [];
  private shapes = new Map<Shape, T.BufferGeometry>();
  private paints = new Map<string, T.MeshStandardMaterial>();
  private clock = 0;
  private own_ = <R extends { dispose(): void }>(r: R) => this.own(r);
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#7db85a");
    this.daylight("#ffffff", "#8fbf6a", "#fff1cf", 12, 2.4);
    this.land();
    this.water();
    this.greenery();
    this.jetties();
    this.launch();
    this.cursor = ringMesh(this.own_, 0.5, 0.62, "#3f8cff");
    // The arrow of a hint, leaning back so that it is seen from above.
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffb21f", depthTest: false, transparent: true, opacity: 0.97, side: T.DoubleSide })),
      rim = this.own(new T.MeshBasicMaterial({ color: "#7a4a00", depthTest: false, transparent: true, opacity: 0.9, side: T.DoubleSide })),
      head = () => new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.46, 0.6), new T.Vector2(0.46, 0.6)]),
      tip = new T.Mesh(this.own(new T.ShapeGeometry(head())), gold),
      shaft = new T.Mesh(this.own(new T.PlaneGeometry(0.28, 0.8)), gold),
      back = new T.Group();
    shaft.position.y = 0.98;
    for (const piece of [tip, shaft]) {
      const edge = new T.Mesh(piece.geometry, rim);
      edge.position.copy(piece.position);
      edge.scale.setScalar(1.14);
      edge.position.y -= piece === tip ? 0.06 : 0;
      edge.renderOrder = 8;
      back.add(edge);
    }
    shaft.renderOrder = tip.renderOrder = 9;
    this.arrow.add(back, shaft, tip);
    this.arrow.rotation.x = -0.45;
    this.arrow.visible = false;
    // A red mark over each of those a failure is about.
    const sign = document.createElement("canvas");
    sign.width = sign.height = 128;
    const pen = sign.getContext("2d")!;
    pen.fillStyle = "#e23b2e";
    pen.beginPath();
    pen.arc(64, 64, 56, 0, Math.PI * 2);
    pen.fill();
    pen.lineWidth = 8;
    pen.strokeStyle = "#ffffff";
    pen.stroke();
    pen.fillStyle = "#ffffff";
    pen.font = "900 92px system-ui, sans-serif";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText("!", 64, 70);
    const warning = this.own(new T.CanvasTexture(sign));
    warning.colorSpace = T.SRGBColorSpace;
    const red = this.own(new T.SpriteMaterial({ map: warning, depthTest: false, transparent: true }));
    for (let i = 0; i < 10; i++) {
      const alarm = new T.Sprite(red);
      alarm.scale.setScalar(0.8);
      alarm.renderOrder = 10;
      alarm.visible = false;
      this.alarms.push(alarm);
    }
    this.scene.add(this.cursor, this.arrow, ...this.alarms);
    this.begin();
    if (!this.reducedMotion) this.clock = requestAnimationFrame(this.idle);
  }
  /** A canvas to paint a texture on, and the texture made of it. */
  private painted(width: number, height: number, paint: (pen: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext("2d")!);
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  }
  /** Many copies of one solid, each with its place, size, turn and colour. */
  private scatter(geometry: T.BufferGeometry, material: T.Material, items: { at: Triple; size: Triple; turn?: number; lean?: number; color?: string }[], shadow = true) {
    const mesh = new T.InstancedMesh(this.own(geometry), material, items.length),
      matrix = new T.Matrix4(),
      turn = new T.Quaternion(),
      color = new T.Color();
    items.forEach((item, i) => {
      matrix.compose(new T.Vector3(...item.at), turn.setFromEuler(new T.Euler(item.lean ?? 0, item.turn ?? 0, 0, "YXZ")), new T.Vector3(...item.size));
      mesh.setMatrixAt(i, matrix);
      if (item.color) mesh.setColorAt(i, color.set(item.color));
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.own(mesh);
    this.scene.add(mesh);
    return mesh;
  }
  /** The two banks: mottled grass, and a strip of sand along the water. */
  private land() {
    const random = sequence(11),
      grass = this.painted(512, 512, (pen) => {
        pen.fillStyle = "#7dba58";
        pen.fillRect(0, 0, 512, 512);
        // Soft patches of lighter and darker green, then short blades; everything is drawn again past the edges so that the tile joins.
        const wrapped = (x: number, y: number, each: (x: number, y: number) => void) => {
          for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) each(x + dx, y + dy);
        };
        for (let i = 0; i < 260; i++) {
          const x = random() * 512,
            y = random() * 512,
            r = 14 + random() * 46;
          pen.fillStyle = ["rgba(98,160,66,0.10)", "rgba(150,205,96,0.10)", "rgba(84,146,62,0.08)", "rgba(176,214,110,0.07)"][i % 4];
          wrapped(x, y, (px, py) => {
            pen.beginPath();
            pen.arc(px, py, r, 0, Math.PI * 2);
            pen.fill();
          });
        }
        pen.lineWidth = 1.2;
        for (let i = 0; i < 2600; i++) {
          const x = random() * 512,
            y = random() * 512,
            lean = (random() - 0.5) * 5;
          pen.strokeStyle = i % 3 ? "rgba(70,132,52,0.32)" : "rgba(170,214,112,0.34)";
          pen.beginPath();
          pen.moveTo(x, y);
          pen.lineTo(x + lean, y - 4 - random() * 5);
          pen.stroke();
        }
      });
    grass.repeat.set(10, 17);
    const turf = this.standard({ map: grass, roughness: 1 }),
      sand = this.standard({ color: "#e6d6a4", roughness: 1 });
    for (const side of [-1, 1]) {
      const bank = this.add(new T.PlaneGeometry(40, 68), turf, side * 23.1, 0, -12);
      bank.rotation.x = -Math.PI / 2;
      bank.castShadow = false;
      this.add(new T.BoxGeometry(0.75, 0.6, 68), sand, side * 2.9, -0.33, -12).castShadow = false;
    }
  }
  /** The river: shallow and pale at its edges, deep in the middle, with marks of the current that run, sparkles over them and foam at the banks. */
  private water() {
    const random = sequence(23),
      current = this.painted(256, 512, (pen) => {
        const across = pen.createLinearGradient(0, 0, 256, 0);
        for (const [stop, color] of [[0, "#a9dfe2"], [0.07, "#74c6da"], [0.28, "#3f95d4"], [0.5, "#2f7fc6"], [0.72, "#3f95d4"], [0.93, "#74c6da"], [1, "#a9dfe2"]] as const) across.addColorStop(stop, color);
        pen.fillStyle = across;
        pen.fillRect(0, 0, 256, 512);
        pen.lineCap = "round";
        for (let i = 0; i < 110; i++) {
          const x = 14 + random() * 228,
            y = random() * 512,
            length = 18 + random() * 52,
            bend = (random() - 0.5) * 10;
          pen.strokeStyle = i % 4 ? `rgba(255,255,255,${0.1 + random() * 0.16})` : `rgba(20,70,130,${0.1 + random() * 0.1})`;
          pen.lineWidth = 1 + random() * 1.6;
          for (const dy of [-512, 0, 512]) {
            pen.beginPath();
            pen.moveTo(x, y + dy);
            pen.quadraticCurveTo(x + bend, y + dy + length / 2, x, y + dy + length);
            pen.stroke();
          }
        }
        // Foam where the water meets the sand: a wavering line that joins end to end.
        for (const side of [0, 1]) {
          pen.strokeStyle = "rgba(255,255,255,0.8)";
          pen.lineWidth = 3;
          pen.beginPath();
          for (let y = 0; y <= 512; y += 4) {
            const turn = (y / 512) * Math.PI * 2,
              x = 6 + 3 * Math.sin(turn * 3 + side) + 2 * Math.sin(turn * 7);
            pen.lineTo(side ? 256 - x : x, y);
          }
          pen.stroke();
        }
      }),
      sparkle = this.painted(256, 256, (pen) => {
        pen.fillStyle = "#ffffff";
        for (let i = 0; i < 34; i++) {
          const x = 22 + random() * 212,
            y = random() * 256,
            w = 1 + random() * 1.4,
            h = 5 + random() * 12;
          for (const dy of [-256, 0, 256]) {
            pen.beginPath();
            pen.ellipse(x, y + dy, w, h, 0, 0, Math.PI * 2);
            pen.fill();
          }
        }
      });
    current.wrapS = sparkle.wrapS = T.ClampToEdgeWrapping;
    current.repeat.set(1, 4.5);
    sparkle.repeat.set(1, 7);
    const river = this.add(new T.PlaneGeometry(5.2, 68), this.standard({ map: current, roughness: 0.3 }), 0, WATER, -12),
      glints = this.add(new T.PlaneGeometry(5.2, 68), this.own(new T.MeshBasicMaterial({ map: sparkle, transparent: true, opacity: 0.5, depthWrite: false })), 0, WATER + 0.012, -12);
    river.rotation.x = glints.rotation.x = -Math.PI / 2;
    river.castShadow = glints.castShadow = glints.receiveShadow = false;
    this.flows.push({ texture: current, speed: 0.035 }, { texture: sparkle, speed: 0.075 });
    // Rings that spread from the boat.
    for (let i = 0; i < 2; i++) {
      const ring = new T.Mesh(this.own(new T.RingGeometry(1, 1.05, 56)), this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.3, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = WATER + 0.02;
      this.ripples.push(ring);
      this.scene.add(ring);
    }
  }
  /** Trees, bushes, stones, flowers, reeds and lily pads, all clear of where the company stands and of the boat's way. */
  private greenery() {
    const random = sequence(5),
      ball = new T.IcosahedronGeometry(0.5, 2),
      white = this.standard({ color: "#ffffff", roughness: 0.9 }),
      trunks: Parameters<RiverView["scatter"]>[2] = [],
      cones: typeof trunks = [],
      leaves: typeof trunks = [],
      stones: typeof trunks = [],
      blooms: typeof trunks = [],
      tufts: typeof trunks = [],
      stalks: typeof trunks = [],
      heads: typeof trunks = [],
      pads: typeof trunks = [],
      // The ground the company needs, with room to spare; trees keep further off so that their shade does not reach it.
      busy = (x: number, z: number, margin: number) => x < 8.4 + margin && z > -3.7 - margin && z < 3.7 + margin,
      planted: [number, number][] = [];
    for (const side of [-1, 1]) {
      for (let tries = 0, count = 0; count < 44 && tries < 900; tries++) {
        const x = 3.9 + random() * 17,
          z = -22 + random() * 33,
          size = 0.75 + random() * 0.75;
        if (busy(x, z, z > 0 ? 2.2 : 1.1) || planted.some(([px, pz]) => Math.hypot(px - side * x, pz - z) < 1.9)) continue;
        planted.push([side * x, z]);
        count++;
        trunks.push({ at: [side * x, 0.6 * size, z], size: [0.3 * size, 1.2 * size, 0.3 * size], color: random() < 0.5 ? "#7a5330" : "#8a6038" });
        if (random() < 0.45)
          // A pine: three skirts, the darkest lowest.
          for (let layer = 0; layer < 3; layer++) cones.push({ at: [side * x, (1.5 + layer * 0.85) * size, z], size: [(2 - layer * 0.5) * size, 1.5 * size, (2 - layer * 0.5) * size], turn: random() * 6, color: ["#2f7a45", "#398a4e", "#459a58"][layer] });
        else {
          const shade = ["#4f9f48", "#5fae4c", "#6fb957", "#86c25a"];
          leaves.push({ at: [side * x, 2.1 * size, z], size: [2.3 * size, 2 * size, 2.3 * size], color: shade[Math.floor(random() * 2)] });
          for (let puff = 0; puff < 3; puff++) {
            const angle = random() * 6.28;
            leaves.push({ at: [side * x + Math.cos(angle) * 0.75 * size, (2.2 + random() * 0.8) * size, z + Math.sin(angle) * 0.75 * size], size: [1.5 * size, 1.35 * size, 1.5 * size], color: shade[1 + Math.floor(random() * 3)] });
          }
        }
      }
      for (let i = 0; i < 26; i++) {
        const x = 3.6 + random() * 15,
          z = -20 + random() * 30,
          size = 0.5 + random() * 0.5;
        if (busy(x, z, 0.3)) continue;
        leaves.push({ at: [side * x, 0.28 * size, z], size: [1.5 * size, 0.9 * size, 1.3 * size], color: ["#4c9a46", "#5aa64c", "#6db354"][i % 3] });
      }
      for (let i = 0; i < 34; i++) {
        // Stones on the sand and in the shallows, and a few in the grass.
        const shore = i < 22,
          x = shore ? 2.35 + random() * 0.85 : 3.6 + random() * 12,
          z = -20 + random() * 30,
          size = shore ? 0.16 + random() * 0.22 : 0.3 + random() * 0.4;
        if ((shore && Math.abs(z) < 1.5) || (!shore && busy(x, z, 0.2))) continue;
        stones.push({ at: [side * x, shore ? -0.05 : size * 0.2, z], size: [size * 1.3, size * 0.7, size], turn: random() * 6, color: ["#a9a69c", "#bdb9ad", "#8f8c84"][i % 3] });
      }
      for (let i = 0; i < 150; i++) {
        const x = 3.5 + random() * 15,
          z = -20 + random() * 30;
        if (busy(x, z, 0)) continue;
        if (i % 3) tufts.push({ at: [side * x, 0.11, z], size: [0.16, 0.3, 0.16], turn: random() * 6, color: i % 2 ? "#5c9e44" : "#8ccf63" });
        else blooms.push({ at: [side * x, 0.09, z], size: [0.15, 0.1, 0.15], color: ["#ffffff", "#ffd84a", "#ff9fb8", "#c9a6ff"][Math.floor(random() * 4)] });
      }
      for (let i = 0; i < 46; i++) {
        // Reeds stand in clumps at the water's edge, away from the jetty.
        const z = -19 + Math.floor(random() * 14) * 2 + random() * 0.7,
          x = 2.3 + random() * 0.4,
          tall = 0.8 + random() * 0.7;
        if (Math.abs(z) < 2.4) continue;
        stalks.push({ at: [side * x, WATER + tall / 2, z], size: [0.035, tall, 0.035], lean: (random() - 0.5) * 0.2, color: "#6c9c48" });
        if (i % 2) heads.push({ at: [side * x, WATER + tall, z], size: [0.08, 0.28, 0.08], color: "#7a4d2a" });
      }
      for (let i = 0; i < 9; i++) {
        const z = -14 + random() * 22,
          x = 1.75 + random() * 0.5,
          size = 0.42 + random() * 0.3;
        if (Math.abs(z) < 3) continue;
        pads.push({ at: [side * x, WATER + 0.015, z], size: [size, 1, size], turn: random() * 6, color: i % 2 ? "#4f9e4c" : "#62b257" });
        if (i % 3 === 0) blooms.push({ at: [side * x, WATER + 0.08, z], size: [0.2, 0.13, 0.2], color: i % 2 ? "#ff9fc0" : "#ffffff" });
      }
    }
    this.scatter(new T.CylinderGeometry(0.4, 0.5, 1, 9), white, trunks);
    this.scatter(new T.ConeGeometry(0.5, 1, 12), white, cones);
    this.scatter(ball, white, leaves);
    this.scatter(new T.DodecahedronGeometry(0.5, 0), this.standard({ color: "#ffffff", roughness: 1, flatShading: true }), stones);
    this.scatter(new T.SphereGeometry(0.5, 8, 6), white, blooms, false);
    this.scatter(new T.ConeGeometry(0.5, 1, 5), white, tufts, false);
    this.scatter(new T.CylinderGeometry(0.5, 0.5, 1, 5), white, stalks, false);
    this.scatter(new T.CapsuleGeometry(0.5, 0.6, 3, 8), white, heads, false);
    const pad = new T.CircleGeometry(0.5, 20, 0.35, Math.PI * 2 - 0.7);
    pad.rotateX(-Math.PI / 2);
    this.scatter(pad, white, pads, false);
  }
  /** A short landing of planks on posts at either bank. */
  private jetties() {
    const plank = this.standard({ color: "#b98a55", roughness: 0.85 }),
      post = this.standard({ color: "#7a5632", roughness: 0.9 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) this.add(new T.BoxGeometry(0.92, 0.07, 0.36), plank, side * 2.93, 0.03, (i - 2) * 0.4).rotation.y = ((i * 7) % 3) * 0.012 - 0.012;
      for (const z of [-1.02, 1.02])
        for (const x of [2.52, 3.3]) {
          const tall = x < 3 ? 0.95 : 0.6;
          this.add(new T.CylinderGeometry(0.075, 0.085, tall, 10), post, side * x, -0.5 + tall / 2 + (x < 3 ? 0 : 0.2), z);
        }
    }
  }
  /** The boat: a pointed hull with an inside, a rail round it, two thwarts and a pair of oars that row. */
  private launch() {
    const outside = this.standard({ color: "#8a5a34", roughness: 0.7 }),
      inside = this.standard({ color: "#c99b63", roughness: 0.85, side: T.BackSide }),
      boards = this.standard({ color: "#d6ab72", roughness: 0.85 }),
      rail = this.standard({ color: "#6d4526", roughness: 0.6 }),
      shell = new T.SphereGeometry(1, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      points = shell.getAttribute("position");
    // The half ball is drawn out to a point fore and aft.
    for (let i = 0; i < points.count; i++) points.setXYZ(i, points.getX(i) * (1 - 0.45 * points.getZ(i) ** 2) * 1.1, points.getY(i) * 0.5, points.getZ(i) * 2.3);
    shell.computeVertexNormals();
    const hull = new T.Mesh(this.own(shell), outside),
      lining = new T.Mesh(shell, inside);
    lining.scale.set(0.94, 0.96, 0.97);
    hull.castShadow = true;
    const outline = (shrink: number) => Array.from({ length: 48 }, (_, i) => hullAt((i / 48) * Math.PI * 2)).map((p) => new T.Vector2(p.x * shrink, p.z * shrink)),
      floor = new T.Mesh(this.own(new T.ShapeGeometry(new T.Shape(outline(0.86)))), boards),
      gunwale = new T.Mesh(this.own(new T.TubeGeometry(new T.CatmullRomCurve3(outline(1).map((p) => new T.Vector3(p.x, 0, p.y)), true), 96, 0.055, 8, true)), rail);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    gunwale.castShadow = true;
    this.boat.add(hull, lining, floor, gunwale);
    for (const z of [-1.5, 1.5]) {
      const thwart = new T.Mesh(this.own(new T.BoxGeometry(1.5, 0.07, 0.3)), rail);
      thwart.position.set(0, -0.06, z);
      this.boat.add(thwart);
    }
    for (const side of [-1, 1]) {
      const pivot = new T.Group(),
        arm = new T.Group(),
        shaft = new T.Mesh(this.own(new T.CylinderGeometry(0.035, 0.035, 2.2, 8)), this.standard({ color: "#ead9b0" })),
        blade = new T.Mesh(this.own(new T.BoxGeometry(0.22, 0.56, 0.05)), this.standard({ color: "#c9573d" })),
        lock = new T.Mesh(this.own(new T.TorusGeometry(0.07, 0.022, 6, 14)), this.standard({ color: "#3d3d3d", metalness: 0.6, roughness: 0.4 }));
      shaft.position.y = 0.6;
      blade.position.y = 1.78;
      shaft.castShadow = true;
      arm.add(shaft, blade);
      arm.rotation.z = -side * (Math.PI / 2 + 0.15);
      pivot.userData.side = side;
      lock.rotation.y = Math.PI / 2;
      pivot.add(arm, lock);
      pivot.position.set(side * 1.1, 0.07, 0);
      this.oars.push(pivot);
      this.boat.add(pivot);
    }
    this.boat.position.set(-BOAT_X, 0.12, 0);
    this.ship();
    this.scene.add(this.boat);
  }
  /** Lays the oars along the boat, blades clear of the water and the landing, as they lie while it waits. */
  private ship() {
    for (const oar of this.oars) {
      oar.rotation.y = -oar.userData.side * 1.32;
      oar.children[0].rotation.z = -oar.userData.side * (Math.PI / 2 - 0.06);
    }
  }
  /** The running water, the rings round the boat, breathing, wagging tails and the bobbing marks: what goes on while the table waits. */
  private idle = (now: number) => {
    if (this.disposed) return;
    this.clock = requestAnimationFrame(this.idle);
    const t = now / 1000;
    for (const flow of this.flows) flow.texture.offset.y = (t * flow.speed) % 1;
    this.ripples.forEach((ring, i) => {
      const p = (t * 0.35 + i / 2) % 1;
      ring.position.x = this.boat.position.x;
      ring.scale.set(1.15 + p * 0.55, 2.4 + p * 0.7, 1);
      (ring.material as T.MeshBasicMaterial).opacity = 0.34 * (1 - p);
    });
    this.figures.forEach((figure, i) => {
      figure.children[0].scale.y = this.plan.scale * (1 + Math.sin(t * 2.1 + i * 1.7) * 0.014);
      const tail = this.tails[i];
      if (tail) tail.rotation.y = Math.sin(t * 3.2 + i * 2.3) * 0.28;
    });
    const bob = Math.sin(t * 4) * 0.08;
    this.arrow.position.y = (this.arrow.userData.y ?? 0) + bob;
    for (const alarm of this.alarms) alarm.position.y = (alarm.userData.y ?? 0) + bob;
    this.redraw();
  };
  private geometry(shape: Shape) {
    let geometry = this.shapes.get(shape);
    if (!geometry) {
      geometry = this.own(
        shape === "ball"
          ? new T.SphereGeometry(0.5, 22, 16)
          : shape === "box"
            ? new T.BoxGeometry(1, 1, 1)
            : shape === "cone"
              ? new T.ConeGeometry(0.5, 1, 20)
              : shape === "wedge"
                ? new T.CylinderGeometry(0.5, 0.5, 1, 3)
                : shape === "dome"
                  ? new T.SphereGeometry(0.5, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2)
                  : new T.CylinderGeometry(0.5, 0.5, 1, 20),
      );
      this.shapes.set(shape, geometry);
    }
    return geometry;
  }
  private paint(color: string) {
    let material = this.paints.get(color);
    if (!material) {
      material = this.standard({ color, roughness: 0.72 });
      this.paints.set(color, material);
    }
    return material;
  }
  /** A solid of a colour added to a figure: its size, its place and its turn. The solids and colours are shared by every figure. */
  private part(to: T.Object3D, shape: Shape, color: string, size: Triple, at: Triple, turn: Triple = [0, 0, 0], shadow = true) {
    const mesh = new T.Mesh(this.geometry(shape), this.paint(color));
    mesh.scale.set(...size);
    mesh.position.set(...at);
    mesh.rotation.set(...turn);
    mesh.castShadow = shadow;
    to.add(mesh);
    return mesh;
  }
  /** A face on a head at `y`: eyes with whites, a nose, cheeks and a mouth. */
  private face(g: T.Object3D, y: number) {
    for (const x of [-0.1, 0.1]) {
      this.part(g, "ball", "#ffffff", [0.1, 0.12, 0.06], [x, y + 0.03, 0.225], [0, 0, 0], false);
      this.part(g, "ball", "#2a2f38", [0.058, 0.075, 0.04], [x, y + 0.03, 0.25], [0, 0, 0], false);
      this.part(g, "ball", "#f3a79b", [0.1, 0.06, 0.03], [x * 1.75, y - 0.08, 0.212], [0, 0, 0], false);
    }
    this.part(g, "ball", "#e9b48b", [0.08, 0.08, 0.08], [0, y - 0.04, 0.262], [0, 0, 0], false);
    this.part(g, "ball", "#a8463c", [0.12, 0.035, 0.03], [0, y - 0.13, 0.238], [0, 0, 0], false);
  }
  /** A person, about two tall: the farmer in a straw hat and dungarees, a husband in a coat of his family's colour, a wife in a dress of it. */
  private person(g: T.Object3D, kind: "farmer" | "husband" | "wife", coat: string) {
    const skin = "#f4cfa6",
      top = kind === "farmer" ? "#d8573c" : coat,
      pale = "#" + new T.Color(coat).lerp(new T.Color("#ffffff"), 0.55).getHexString();
    for (const x of [-0.15, 0.15]) this.part(g, "ball", kind === "wife" ? "#7a4a2e" : "#3f2e22", [0.2, 0.13, 0.34], [x, 0.065, 0.05]);
    if (kind === "wife") {
      this.part(g, "cone", coat, [1, 1.12, 1], [0, 0.6, 0]);
      this.part(g, "rod", pale, [1.0, 0.07, 1.0], [0, 0.075, 0]);
      this.part(g, "ball", coat, [0.54, 0.6, 0.42], [0, 1.08, 0]);
      this.part(g, "ball", "#ffffff", [0.32, 0.1, 0.3], [0, 1.31, 0.02]);
      this.part(g, "rod", pale, [0.56, 0.07, 0.44], [0, 0.92, 0]);
    } else {
      const trousers = kind === "farmer" ? "#3f6aa8" : "#3d4652";
      for (const x of [-0.14, 0.14]) this.part(g, "rod", trousers, [0.19, 0.52, 0.19], [x, 0.38, 0]);
      this.part(g, "ball", trousers, [0.62, 0.42, 0.47], [0, 0.7, 0]);
      this.part(g, "ball", top, [0.64, 0.74, 0.48], [0, 0.99, 0]);
      if (kind === "farmer") {
        this.part(g, "box", trousers, [0.4, 0.36, 0.1], [0, 0.93, 0.19]);
        for (const x of [-0.13, 0.13]) this.part(g, "rod", trousers, [0.06, 0.42, 0.06], [x, 1.14, 0.2], [-0.25, 0, 0]);
        this.part(g, "ball", "#f2d24a", [0.34, 0.12, 0.32], [0, 1.31, 0.03]);
      } else {
        this.part(g, "box", "#ffffff", [0.17, 0.32, 0.06], [0, 1.1, 0.21]);
        for (const y of [0.92, 1.06]) this.part(g, "ball", "#2a2f38", [0.05, 0.05, 0.04], [0, y, 0.245], [0, 0, 0], false);
      }
    }
    for (const x of [-1, 1]) {
      this.part(g, "rod", top, [0.15, 0.5, 0.15], [x * 0.38, 1.0, 0], [0, 0, x * 0.22]);
      this.part(g, "ball", skin, [0.15, 0.15, 0.15], [x * 0.45, 0.73, 0]);
    }
    this.part(g, "ball", skin, [0.52, 0.54, 0.52], [0, 1.6, 0]);
    this.face(g, 1.6);
    if (kind === "farmer") {
      this.part(g, "rod", "#e6c66e", [1.08, 0.05, 1.08], [0, 1.84, 0]);
      this.part(g, "dome", "#e6c66e", [0.6, 0.64, 0.6], [0, 1.85, 0]);
      this.part(g, "rod", "#b5482f", [0.61, 0.07, 0.61], [0, 1.9, 0]);
    } else if (kind === "husband") {
      this.part(g, "dome", "#3a2a20", [0.57, 0.5, 0.57], [0, 1.68, -0.01]);
      this.part(g, "ball", "#3a2a20", [0.5, 0.3, 0.3], [0, 1.6, -0.15]);
    } else {
      this.part(g, "dome", "#6b4526", [0.6, 0.56, 0.6], [0, 1.67, -0.02]);
      this.part(g, "ball", "#6b4526", [0.54, 0.5, 0.3], [0, 1.55, -0.15]);
      this.part(g, "ball", "#6b4526", [0.26, 0.26, 0.26], [0, 1.99, -0.08]);
      this.part(g, "rod", coat, [0.2, 0.06, 0.2], [0, 1.9, -0.08]);
    }
  }
  /** A four-legged animal, standing about one and a half tall at size 1: body and belly, legs and paws, a head with a muzzle, eyes and ears, and a tail that wags. */
  private beast(
    g: T.Object3D,
    coat: string,
    o: { light?: string; head?: string; legs?: string; paws?: string; eyes?: string; nose?: string; ears?: "point" | "round" | "droop"; inner?: string; snout?: number; tail?: "bush" | "thin" | "stub"; tip?: string; wool?: boolean; horns?: boolean; beard?: boolean; stripes?: string },
  ) {
    const light = o.light ?? coat,
      head = o.head ?? coat,
      legs = o.legs ?? coat,
      snout = o.snout ?? 0.4;
    this.part(g, "ball", coat, [0.74, 0.64, 1.25], [0, 0.74, 0]);
    this.part(g, "ball", light, [0.6, 0.4, 1.0], [0, 0.6, 0.02]);
    this.part(g, "ball", light, [0.5, 0.52, 0.45], [0, 0.78, 0.44]);
    this.part(g, "ball", coat, [0.42, 0.5, 0.42], [0, 0.96, 0.58]);
    for (const x of [-0.22, 0.22])
      for (const z of [-0.4, 0.4]) {
        this.part(g, "rod", legs, [0.15, 0.5, 0.15], [x, 0.29, z]);
        this.part(g, "ball", o.paws ?? legs, [0.2, 0.13, 0.25], [x, 0.065, z + 0.03]);
      }
    if (o.wool)
      for (const [x, y, z] of [[-0.26, 0.98, -0.34], [0.26, 0.98, -0.3], [0, 1.08, -0.05], [-0.28, 0.96, 0.12], [0.28, 0.96, 0.16], [0, 1.04, 0.36], [-0.3, 0.7, -0.2], [0.3, 0.7, -0.2], [-0.3, 0.72, 0.25], [0.3, 0.72, 0.25], [0, 0.86, -0.56], [0, 1.36, 0.72]] as Triple[])
        this.part(g, "ball", coat, [0.5, 0.46, 0.5], [x, y, z]).scale.multiplyScalar(y > 1.3 ? 0.62 : 1);
    if (o.stripes) for (const z of [-0.36, -0.12, 0.12, 0.36]) this.part(g, "ball", o.stripes, [0.62, 0.3, 0.09], [0, 0.93, z], [0, 0, 0], false);
    this.part(g, "ball", head, [0.52, 0.5, 0.56], [0, 1.1, 0.78]);
    this.part(g, "ball", o.wool ? head : light, [0.28, 0.24, snout], [0, 1.0, 0.98 + snout * 0.3]);
    this.part(g, "ball", o.nose ?? "#1f2933", [0.11, 0.09, 0.1], [0, 1.03, 0.98 + snout * 0.78], [0, 0, 0], false);
    for (const x of [-1, 1]) {
      this.part(g, "ball", "#ffffff", [0.11, 0.12, 0.06], [x * 0.15, 1.18, 0.985], [0, 0, 0], false);
      this.part(g, "ball", o.eyes ?? "#1f2933", [0.062, 0.08, 0.04], [x * 0.155, 1.18, 1.012], [0, 0, 0], false);
      if (o.ears === "round") {
        this.part(g, "ball", head, [0.27, 0.27, 0.08], [x * 0.21, 1.37, 0.7]);
        this.part(g, "ball", o.inner ?? "#f3b3b8", [0.17, 0.17, 0.05], [x * 0.21, 1.37, 0.735], [0, 0, 0], false);
      } else if (o.ears === "droop") this.part(g, "ball", head, [0.12, 0.3, 0.17], [x * 0.3, 1.08, 0.72], [0, 0, x * 0.4]);
      else {
        this.part(g, "cone", o.tip && o.tail === "bush" && o.inner ? o.inner : head, [0.2, 0.3, 0.12], [x * 0.17, 1.43, 0.7]);
        this.part(g, "cone", "#f3b3b8", [0.11, 0.19, 0.06], [x * 0.17, 1.41, 0.745], [0, 0, 0], false);
      }
      if (o.horns) this.part(g, "cone", "#d9cdb5", [0.09, 0.4, 0.09], [x * 0.11, 1.5, 0.6], [-0.55, 0, x * -0.2]);
    }
    if (o.beard) this.part(g, "cone", light, [0.12, 0.26, 0.1], [0, 0.82, 1.06], [Math.PI, 0, 0]);
    // The tail hangs from its root so that it can wag.
    const tail = new T.Group();
    tail.position.set(0, 0.9, -0.56);
    if (o.tail === "bush") {
      this.part(tail, "ball", coat, [0.28, 0.28, 0.72], [0, 0.19, -0.28], [0.6, 0, 0]);
      this.part(tail, "ball", o.tip ?? coat, [0.21, 0.21, 0.32], [0, 0.35, -0.51], [0.6, 0, 0]);
    } else if (o.tail === "thin") {
      this.part(tail, "rod", o.tip ?? coat, [0.065, 0.72, 0.065], [0, 0.19, -0.3], [-1.0, 0, 0]);
    } else this.part(tail, "ball", coat, [0.17, 0.17, 0.2], [0, 0.04, -0.08]);
    g.add(tail);
    return tail;
  }
  /** The model of one of the company, with its tail if it has one to wag. */
  private model(role: string, pair: number): [T.Group, T.Object3D | null] {
    const g = new T.Group();
    let tail: T.Object3D | null = null;
    if (role === "farmer") this.person(g, "farmer", "#3f6aa8");
    else if (role === "husband" || role === "wife") this.person(g, role, FAMILY[pair % FAMILY.length]);
    else if (role === "wolf") tail = this.beast(g, "#7f8890", { light: "#d3d7da", legs: "#6d767e", eyes: "#d99a1c", snout: 0.5, tail: "bush", tip: "#4d555c" });
    else if (role === "fox") {
      tail = this.beast(g, "#e07a2c", { light: "#fff4e6", legs: "#3a2a22", snout: 0.5, tail: "bush", tip: "#fff4e6" });
      g.scale.setScalar(0.85);
    } else if (role === "cat") {
      tail = this.beast(g, "#eda043", { light: "#fff1dc", stripes: "#c97a22", eyes: "#3f8f4a", nose: "#e58a8a", snout: 0.22, tail: "thin", tip: "#c97a22" });
      g.scale.setScalar(0.7);
    } else if (role === "goat") {
      tail = this.beast(g, "#f4efe4", { light: "#ffffff", paws: "#5a4a3a", nose: "#d99a9a", ears: "droop", horns: true, beard: true, tail: "stub" });
      g.scale.setScalar(0.9);
    } else if (role === "sheep") {
      tail = this.beast(g, "#faf7ef", { head: "#3d352e", legs: "#3d352e", ears: "droop", wool: true, snout: 0.3, tail: "stub" });
      g.scale.setScalar(0.9);
    } else if (role === "mouse") {
      tail = this.beast(g, "#aaa49c", { light: "#e2ddd6", paws: "#f0b6b6", nose: "#ee9aa2", ears: "round", snout: 0.3, tail: "thin", tip: "#f0b6b6" });
      g.scale.setScalar(0.55);
    } else if (role === "hen") {
      this.part(g, "ball", "#fdfaf2", [0.62, 0.6, 0.82], [0, 0.52, 0]);
      for (const x of [-1, 1]) {
        this.part(g, "ball", "#eee6d4", [0.14, 0.36, 0.52], [x * 0.29, 0.56, -0.03]);
        this.part(g, "rod", "#e9a820", [0.045, 0.26, 0.045], [x * 0.12, 0.13, 0.02]);
        this.part(g, "ball", "#e9a820", [0.17, 0.045, 0.22], [x * 0.12, 0.025, 0.08]);
        this.part(g, "ball", "#1f2933", [0.05, 0.055, 0.04], [x * 0.12, 1.11, 0.45], [0, 0, 0], false);
      }
      for (const [x, lean] of [[0, -0.7], [-0.12, -0.9], [0.12, -0.9]]) this.part(g, "cone", "#fdfaf2", [0.26, 0.52, 0.12], [x, 0.84, -0.43], [lean, 0, x * -2]);
      this.part(g, "ball", "#fdfaf2", [0.32, 0.44, 0.32], [0, 0.86, 0.29]);
      this.part(g, "ball", "#fdfaf2", [0.31, 0.31, 0.31], [0, 1.08, 0.36]);
      this.part(g, "cone", "#e9a820", [0.11, 0.2, 0.11], [0, 1.05, 0.57], [Math.PI / 2, 0, 0]);
      for (const z of [0.28, 0.36, 0.44]) this.part(g, "ball", "#d6392e", [0.08, 0.15, 0.1], [0, 1.25, z]);
      this.part(g, "ball", "#d6392e", [0.07, 0.11, 0.06], [0, 0.95, 0.5]);
    } else if (role === "cabbage") {
      this.part(g, "ball", "#b4de82", [0.68, 0.66, 0.68], [0, 0.42, 0]);
      for (let i = 0; i < 7; i++) this.part(g, "ball", i % 2 ? "#6fb04a" : "#7dbb52", [0.62, 0.62, 0.2], [Math.sin(i * 0.9) * 0.3, 0.36, Math.cos(i * 0.9) * 0.3], [0, i * 0.9, 0]);
      for (let i = 0; i < 3; i++) this.part(g, "ball", "#9fd472", [0.46, 0.3, 0.18], [Math.sin(i * 2.1 + 0.5) * 0.14, 0.66, Math.cos(i * 2.1 + 0.5) * 0.14], [0, i * 2.1 + 0.5, 0]);
    } else if (role === "grain") {
      this.part(g, "ball", "#d4b780", [0.86, 0.96, 0.72], [0, 0.47, 0]);
      this.part(g, "rod", "#bf9f66", [0.27, 0.18, 0.27], [0, 0.97, 0]);
      this.part(g, "ball", "#d4b780", [0.44, 0.17, 0.42], [0, 1.08, 0]);
      this.part(g, "rod", "#7a5a2e", [0.31, 0.05, 0.31], [0, 0.95, 0]);
      // A stalk of wheat stitched on the sack.
      this.part(g, "rod", "#9a7a3a", [0.03, 0.4, 0.03], [0, 0.46, 0.355], [0, 0, 0], false);
      for (const [x, y] of [[-0.07, 0.6], [0.07, 0.6], [-0.07, 0.48], [0.07, 0.48], [0, 0.7]]) this.part(g, "ball", "#f0c64a", [0.08, 0.13, 0.05], [x, y, 0.36 - Math.abs(y - 0.5) * 0.12], [0, 0, x * -6], false);
    } else {
      // Cheese: a thick wedge with a rind and holes.
      this.part(g, "wedge", "#f6c844", [1.04, 0.5, 1.04], [0, 0.26, 0]);
      this.part(g, "wedge", "#e2a52a", [1.08, 0.08, 1.08], [0, 0.04, 0]);
      for (const [x, z, r] of [[0.1, 0.2, 0.17], [-0.16, -0.04, 0.13], [0.18, -0.16, 0.11], [-0.02, -0.26, 0.08]]) this.part(g, "ball", "#d99a1e", [r, 0.03, r], [x, 0.512, z], [0, 0, 0], false);
    }
    return [g, tail];
  }
  /** Builds the company anew when it is not the one shown, and draws it up. */
  private cast(state: State) {
    const key = state.actors.map((a) => a.role + a.pair).join();
    if (key === this.built) return;
    this.built = key;
    this.plan = draw(state);
    for (const figure of this.figures) this.scene.remove(figure);
    this.tails = [];
    this.figures = state.actors.map((actor) => {
      const [model, tail] = this.model(actor.role, actor.pair),
        body = new T.Group(),
        figure = new T.Group();
      body.add(model);
      body.scale.setScalar(this.plan.scale);
      figure.add(body);
      this.tails.push(tail);
      this.scene.add(figure);
      return figure;
    });
  }
  /** An actor's place on a bank, facing the water. */
  private ashore(i: number, side: number) {
    const at = this.plan.at[i];
    return { x: (side ? 1 : -1) * at.x, y: 0, z: at.z, face: side ? -1 : 1 };
  }
  /** A rider's place in the boat lying at a bank, facing the way it will go: the `seat`-th of `crew`. */
  private afloat(state: State, i: number, seat: number, crew: number, boat: number) {
    const [front, back] = reach(state.actors[i].role),
      face = boat ? -1 : 1,
      gap = state.seats <= 2 ? 1.3 : 1.15;
    // Long animals are set so that their middle is over the boat's.
    return { x: (boat ? 1 : -1) * BOAT_X - (face * (front - back) * this.plan.scale) / 2, y: FLOOR, z: (seat - (crew - 1) / 2) * gap, face };
  }
  private spot(state: State, i: number) {
    const seat = state.aboard.indexOf(i);
    return seat >= 0 ? this.afloat(state, i, seat, state.aboard.length, state.boat) : this.ashore(i, state.actors[i].side);
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.6 : 8, halfZ: 3.9, height: 2.4, lookY: 0.4, tilt: 1 };
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    const bx = (state.boat ? 1 : -1) * BOAT_X,
      tall = (i: number) => reach(state.actors[i].role)[2] * this.plan.scale;
    // Each of the company, and the boat fore and aft of its riders (and amidships when it is empty).
    return [
      ...state.actors.map((_, i) => ({ ...this.spot(state, i), y: (state.aboard.includes(i) ? FLOOR : 0) + tall(i) * 0.5, r: Math.max(0.6, Math.min(0.95, tall(i) * 0.55)), point: i })),
      ...[-1.75, 1.75, ...(state.aboard.length ? [] : [0, -0.9, 0.9])].map((z) => ({ x: bx, y: 0, z, r: 0.8, point: GO })),
    ];
  }
  private put(i: number, at: { x: number; y: number; z: number; face: number }) {
    this.figures[i].position.set(at.x, at.y, at.z);
    this.figures[i].rotation.y = (at.face * Math.PI) / 2;
  }
  /** Raises the marks over those a failure is about, or takes them down. */
  private warn(state: State | null) {
    this.alarms.forEach((alarm, k) => {
      const i = state?.culprits[k];
      alarm.visible = !!state && i !== undefined && state.winner === 1;
      if (state && i !== undefined) {
        const at = this.spot(state, i);
        alarm.userData.y = at.y + reach(state.actors[i].role)[2] * this.plan.scale + 0.55;
        alarm.position.set(at.x, alarm.userData.y, at.z);
      }
    });
  }
  protected place(state: State) {
    this.cast(state);
    this.boat.position.x = (state.boat ? 1 : -1) * BOAT_X;
    this.boat.rotation.z = 0;
    this.ship();
    state.actors.forEach((_, i) => this.put(i, this.spot(state, i)));
    this.warn(state);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    this.cast(state);
    if (before.actors.length !== state.actors.length || before.actors.some((a, i) => a.role !== state.actors[i].role)) return false;
    this.warn(null);
    if (!last || state.ply !== before.ply + 1) {
      // Getting in or out, and the others in the boat making room: a short hop to the new place.
      const moved = state.actors.map((_, i) => i).filter((i) => before.aboard.indexOf(i) !== state.aboard.indexOf(i) || (state.aboard.includes(i) && before.aboard.length !== state.aboard.length));
      if (!moved.length || before.boat !== state.boat) return false;
      this.place(before);
      this.warn(null);
      this.tween(0, 280, (p) => {
        for (const i of moved) {
          const a = this.spot(before, i),
            b = this.spot(state, i),
            hop = before.aboard.includes(i) !== state.aboard.includes(i) ? 0.75 : 0.15;
          this.put(i, { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p + Math.sin(p * Math.PI) * hop, z: a.z + (b.z - a.z) * p, face: p < 0.5 ? a.face : b.face });
        }
        if (p === 1) this.onContact();
      });
      return true;
    }
    // The boat is rowed across with its riders, who then step out onto the bank.
    const from = (last.from ? 1 : -1) * BOAT_X,
      crew = last.riders.length,
      seats = last.riders.map((i, seat) => this.afloat(before, i, seat, crew, last.from));
    this.place(before);
    this.warn(null);
    this.tween(0, 1200, (p) => {
      const ease = p * p * (3 - 2 * p),
        shift = -2 * from * ease,
        stroke = Math.sin(p * Math.PI * 6);
      this.boat.position.x = from + shift;
      this.boat.rotation.z = stroke * 0.025;
      // The oars swing out, pull, and are laid back along the boat as it comes in.
      const out = Math.min(1, p * 6, (1 - p) * 6);
      for (const oar of this.oars) {
        const side = oar.userData.side;
        oar.rotation.y = -side * 1.32 * (1 - out) + side * stroke * 0.5 * (last.from ? 1 : -1) * out;
        oar.children[0].rotation.z = -side * (Math.PI / 2 - 0.06 + 0.21 * out);
      }
      last.riders.forEach((i, k) => this.put(i, { ...seats[k], x: seats[k].x + shift, y: FLOOR + Math.abs(stroke) * 0.025 }));
    });
    this.tween(1200, 340, (p) => {
      this.boat.rotation.z = 0;
      this.ship();
      last.riders.forEach((i, k) => {
        const a = { ...seats[k], x: seats[k].x - 2 * from },
          b = this.spot(state, i);
        this.put(i, { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p + Math.sin(p * Math.PI) * 0.8, z: a.z + (b.z - a.z) * p, face: p < 0.6 ? a.face : b.face });
      });
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      // The keyboard's place, and the arrow of a hint over whoever (or the boat) is to be pressed.
      at = (point: number) => {
        if (!state) return null;
        if (point === GO) return { x: (state.boat ? 1 : -1) * BOAT_X, z: 0, y: 2.6, ground: 0.14 };
        if (point < 0 || point >= state.actors.length) return null;
        const spot = this.spot(state, point);
        return { x: spot.x, z: spot.z, y: spot.y + reach(state.actors[point].role)[2] * this.plan.scale + 0.25, ground: spot.y + 0.1 };
      },
      cursor = marks.cursor === null ? null : at(marks.cursor === state?.actors.length ? GO : marks.cursor),
      hint = marks.hint ? at(marks.hint.to) : null;
    this.cursor.visible = !!cursor;
    if (cursor) {
      this.cursor.position.set(cursor.x, Math.max(0.12, cursor.ground), cursor.z);
      this.cursor.scale.setScalar(marks.cursor === state?.actors.length ? 1.6 : 1.2);
    }
    this.arrow.visible = !!hint;
    if (hint) {
      this.arrow.userData.y = hint.y;
      this.arrow.position.set(hint.x, hint.y, hint.z);
    }
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    super.dispose();
  }
}
