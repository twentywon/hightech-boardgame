import * as T from "three";
import { block, capable, glossy, hop, planks, travel, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BOARD_TOP, BULB_Y, CELL, GLOW_MS, REACH, RUN_MS, bulbSubject, cellAt, cellUnder } from "./layout";
import { BOX, BULB, DC, DR, directionOf, refusal, type State } from "./rules";

export const BULB_COLORS: [string, string] = ["#ffc35a", "#6c7178"];
/** A sequence for scenery and the small differences between wires, the same every time. */
const sequence = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const canvasOf = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
const textureOf = (c: HTMLCanvasElement) => {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** How much larger than its model a bulb (with its socket) stands. */
const BULB_SCALE = 1.45;
/** Where a wire leaves a socket, how high its ends sit and how thick it is. */
const WIRE_OUT = 0.3,
  WIRE_Y = 0.055,
  WIRE_R = 0.022,
  WIRE_SEGMENTS = 48,
  WIRE_SIDES = 7;
/**
 * The pegboard's face for a board of `n`: tan hardboard with rows of small round holes between the sockets, a pencilled
 * cross under every socket's place and a little wear.
 */
function pegboard(n: number, span: number) {
  const size = 1024,
    { c, ctx } = canvasOf(size),
    rand = sequence(4100 + n),
    px = size / span;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, "#b9926a");
  g.addColorStop(1, "#a9825b");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Fibres of the hardboard.
  for (let k = 0; k < 2600; k++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? "90, 60, 35" : "235, 210, 170"}, ${0.04 + rand() * 0.06})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 6, 1);
  }
  const at = (u: number) => size / 2 + u * px;
  // Holes on a grid of quarter cells, left out where a socket stands.
  const quarter = CELL / 4,
    reach = span / 2 - 0.12;
  for (let x = -reach; x <= reach; x += quarter)
    for (let z = -reach; z <= reach; z += quarter) {
      const fx = x / CELL + (n - 1) / 2,
        fz = z / CELL + (n - 1) / 2,
        nearSocket = Math.abs(fx - Math.round(fx)) < 0.3 && Math.abs(fz - Math.round(fz)) < 0.3 && Math.round(fx) >= 0 && Math.round(fz) >= 0 && Math.round(fx) < n && Math.round(fz) < n;
      if (nearSocket) continue;
      const cx = at(x),
        cy = at(z);
      ctx.fillStyle = "rgba(255, 236, 206, 0.35)";
      ctx.beginPath();
      ctx.arc(cx + 0.8, cy + 0.9, px * 0.034, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a2716";
      ctx.beginPath();
      ctx.arc(cx, cy, px * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  // A pencilled cross at each socket's place, as a maker marks a board out before drilling.
  ctx.strokeStyle = "rgba(60, 44, 32, 0.28)";
  ctx.lineWidth = 1.4;
  for (let r = 0; r < n; r++)
    for (let col = 0; col < n; col++) {
      const cx = at((col - (n - 1) / 2) * CELL),
        cy = at((r - (n - 1) / 2) * CELL),
        a = px * 0.34;
      ctx.beginPath();
      ctx.moveTo(cx - a, cy);
      ctx.lineTo(cx + a, cy);
      ctx.moveTo(cx, cy - a);
      ctx.lineTo(cx, cy + a);
      ctx.stroke();
    }
  // A darker band of wear round the rim.
  const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.72);
  edge.addColorStop(0, "rgba(60, 36, 18, 0)");
  edge.addColorStop(1, "rgba(60, 36, 18, 0.22)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, size, size);
  return textureOf(c);
}
/** A cloth-covered cable's braid: two tones of red woven on the slant, repeated along the wire. */
function braid() {
  const { c, ctx } = canvasOf(64, 32);
  ctx.fillStyle = "#8f2f22";
  ctx.fillRect(0, 0, 64, 32);
  for (let k = -4; k < 12; k++) {
    ctx.fillStyle = k % 2 ? "#b8442f" : "#6e2219";
    ctx.beginPath();
    ctx.moveTo(k * 8, 0);
    ctx.lineTo(k * 8 + 6, 0);
    ctx.lineTo(k * 8 + 6 + 16, 32);
    ctx.lineTo(k * 8 + 16, 32);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 220, 190, 0.18)";
  for (let y = 0; y < 32; y += 4) ctx.fillRect(0, y, 64, 1);
  const t = textureOf(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A soft round glow for halos, pulses and the light a bulb throws on the board. */
function glowTexture() {
  const { c, ctx } = canvasOf(128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 246, 214, 1)");
  g.addColorStop(0.22, "rgba(255, 214, 140, 0.6)");
  g.addColorStop(0.55, "rgba(255, 170, 70, 0.16)");
  g.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return textureOf(c);
}
/** The label round the battery: black, with a copper band and a plus sign. */
function batteryLabel() {
  const { c, ctx } = canvasOf(256, 64);
  ctx.fillStyle = "#1c1d20";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#c8793a";
  ctx.fillRect(176, 0, 80, 64);
  ctx.fillStyle = "#f2e6d0";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("+", 216, 33);
  ctx.fillStyle = "#e9e3d6";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("1.5V", 92, 33);
  return textureOf(c);
}
/** One bulb, piece by piece: what lights and what stays. */
interface Bulb {
  cell: number;
  root: T.Group;
  glass: T.Mesh;
  glassPaint: T.MeshStandardMaterial;
  coilPaint: T.MeshStandardMaterial;
  halo: T.Sprite;
  pool: T.Mesh;
  /** How bright it is now (0 off, 1 lit), and its share of the celebration. */
  glow: number;
}
/** A wire laid from one bulb to the next. */
interface Wire {
  from: number;
  to: number;
  mesh: T.Mesh;
  curve: T.CubicBezierCurve3;
}
/**
 * An electrician's workbench: a pegboard panel on a framed board lies on a wooden bench, a socket of white porcelain
 * at every place of the grid. Some sockets hold a glass bulb (clear glass, a coiled filament on two supports, a brass
 * screw base); grey junction boxes with four screws stand on others. A bulb is dark until the wire reaches it, then it
 * flickers on and glows warm, with a halo and a pool of light on the board. Each wire is a red cloth-covered cable
 * drawn from socket to socket in an arch, high enough to clear the bulbs it passes over; it runs out from the head with
 * a spark at its tip. The first bulb lit is joined to a battery that hops over to it. When everything is lit the bulbs
 * flare one after another along the wire. Marks: the head's blue ring, faint rings round the bulbs the wire can reach,
 * the hint's gold ring and the keyboard's white one (all left out of a picture taken for the collection).
 */
export class BulbLinkView extends TableView<State> {
  private size = 0;
  private cells: number[] | null = null;
  private bulbs = new Map<number, Bulb>();
  private boxes = new Map<number, T.Group>();
  private wires: Wire[] = [];
  private layer = new T.Group();
  private wireLayer = new T.Group();
  private paint: Record<string, T.Material> = {};
  private shapes: Record<string, T.BufferGeometry> = {};
  private textures: Record<string, T.Texture> = {};
  /** What belongs to the board laid now (made again for another board). */
  private boardOwned: { dispose(): void }[] = [];
  private battery: T.Group;
  private lead: T.Mesh | null = null;
  private spark: T.Sprite;
  private pulse: T.Sprite;
  private headRing: T.Mesh;
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private cursorRing: T.Mesh;
  private reachRings: T.Mesh[] = [];
  private hovered = -1;
  private hinted = -1;
  private headCell = -1;
  private press: { cell: number; x: number; z: number } | null = null;
  private caster = new T.Raycaster();
  private live: boolean;
  private soft: boolean;
  private clock = 0;
  /** The celebration's start (performance time), or 0. */
  private flareAt = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a221c");
    this.soft = !capable();
    this.live = !this.soft && !this.reducedMotion;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.background = new T.Color("#2a221c");
    // A workshop lamp above and to the left, a cool sky from the window and warm bounce from the bench.
    this.scene.add(new T.HemisphereLight("#dfe6f2", "#6a4a30", 1.5));
    const lamp = new T.DirectionalLight("#fff1dc", 2.3);
    lamp.position.set(-5, 10, 4);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.left = lamp.shadow.camera.bottom = -9;
    lamp.shadow.camera.right = lamp.shadow.camera.top = 9;
    lamp.shadow.camera.far = 40;
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    const fill = new T.DirectionalLight("#ffe9cc", 0.45);
    fill.position.set(4, 7, 8);
    this.scene.add(lamp, fill);

    const p = <M extends T.Material>(name: string, material: M) => (this.paint[name] = keep(material));
    const g = (name: string, geometry: T.BufferGeometry) => (this.shapes[name] = keep(geometry));
    this.textures.glow = keep(glowTexture());
    this.textures.braid = keep(braid());
    p("bench", new T.MeshStandardMaterial({ ...planks(3, keep), color: "#c8a888" }));
    p("frame", new T.MeshStandardMaterial({ map: keep(wood(false, 0.7)), color: "#d9b48a", roughness: 0.6 }));
    p("porcelain", glossy({ color: "#f3f0ea", roughness: 0.3 }, 0.8));
    p("hole", new T.MeshStandardMaterial({ color: "#1b1a19", roughness: 0.9 }));
    p("bakelite", glossy({ color: "#2a2623", roughness: 0.35 }, 0.6));
    p("brass", glossy({ color: "#c99a4a", roughness: 0.32, metalness: 0.85 }, 0.4));
    p("tip", new T.MeshStandardMaterial({ color: "#151515", roughness: 0.4 }));
    p("support", new T.MeshStandardMaterial({ color: "#9a9a96", roughness: 0.4, metalness: 0.8 }));
    p("steel", glossy({ color: "#8d949b", roughness: 0.42, metalness: 0.75 }, 0.3));
    p("lid", glossy({ color: "#a4abb2", roughness: 0.38, metalness: 0.7 }, 0.3));
    p("screw", new T.MeshStandardMaterial({ color: "#d6d8d8", roughness: 0.3, metalness: 0.9 }));
    p("slot", new T.MeshStandardMaterial({ color: "#3b3e42", roughness: 0.6 }));
    p("cable", new T.MeshStandardMaterial({ map: this.textures.braid, roughness: 0.85 }));
    p("lead", new T.MeshStandardMaterial({ color: "#c7322a", roughness: 0.5 }));
    p("label", new T.MeshStandardMaterial({ map: keep(batteryLabel()), roughness: 0.45, metalness: 0.2 }));
    p("cap", glossy({ color: "#c9cbcd", roughness: 0.25, metalness: 0.9 }));
    p("copper", glossy({ color: "#c57a43", roughness: 0.3, metalness: 0.85 }, 0.3));
    p("handle", glossy({ color: "#e0b12c", roughness: 0.35 }));
    p("rubber", new T.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.8 }));

    // The bench under everything.
    const bench = new T.Mesh(keep(new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2)), this.paint.bench);
    bench.position.y = -0.16;
    bench.receiveShadow = true;
    this.scene.add(bench);

    // A socket: a porcelain cup with a dark hole; a bulb's screw base, glass, filament and tip.
    g("socket", new T.CylinderGeometry(0.2, 0.215, 0.06, 32).translate(0, BOARD_TOP + 0.03, 0));
    g("hole", new T.CircleGeometry(0.085, 24).rotateX(-Math.PI / 2).translate(0, BOARD_TOP + 0.0605, 0));
    // An empty socket is smaller than a bulb's, so that the bulbs stand out.
    this.shapes.emptySocket = keep(this.shapes.socket.clone().scale(0.72, 0.8, 0.72));
    this.shapes.emptyHole = keep(this.shapes.hole.clone().scale(0.72, 0.8, 0.72));
    const screw: T.Vector2[] = [new T.Vector2(0.0, 0.055), new T.Vector2(0.072, 0.055)];
    for (let k = 0; k < 4; k++) {
      const y = 0.065 + k * 0.018;
      screw.push(new T.Vector2(0.074, y), new T.Vector2(0.083, y + 0.007), new T.Vector2(0.074, y + 0.014));
    }
    screw.push(new T.Vector2(0.08, 0.14), new T.Vector2(0.0, 0.14));
    g("screw", new T.LatheGeometry(screw.map((v) => new T.Vector2(v.x, v.y)), 28));
    g("tip", new T.CylinderGeometry(0.045, 0.05, 0.02, 20).translate(0, 0.055, 0));
    const glass = [
      [0.0, 0.135],
      [0.074, 0.135],
      [0.08, 0.17],
      [0.105, 0.215],
      [0.148, 0.268],
      [0.172, 0.33],
      [0.168, 0.39],
      [0.146, 0.445],
      [0.108, 0.49],
      [0.058, 0.513],
      [0.0, 0.52],
    ].map(([x, y]) => new T.Vector2(x, y));
    g("glass", new T.LatheGeometry(glass, 36));
    const coil: T.Vector3[] = [];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60,
        a = t * Math.PI * 2 * 7;
      coil.push(new T.Vector3(-0.055 + 0.11 * t, 0.335 + Math.cos(a) * 0.011, Math.sin(a) * 0.011));
    }
    g("coil", new T.TubeGeometry(new T.CatmullRomCurve3(coil), 120, 0.0035, 4, false));
    const supports = [
      new T.CylinderGeometry(0.004, 0.004, 0.19, 5).translate(-0.055, 0.24, 0),
      new T.CylinderGeometry(0.004, 0.004, 0.19, 5).translate(0.055, 0.24, 0),
      new T.CylinderGeometry(0.016, 0.03, 0.08, 10).translate(0, 0.175, 0),
    ];
    g("support0", supports[0]);
    g("support1", supports[1]);
    g("stem", supports[2]);
    g("pool", new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    // A junction box: a grey steel box with a lid, four screws and a cable gland.
    g("box", block(0.74, 0.32, 0.74, 0.05));
    g("lid", block(0.66, 0.03, 0.66, 0.012));
    g("screwHead", new T.CylinderGeometry(0.035, 0.035, 0.018, 14));
    g("slot", new T.BoxGeometry(0.056, 0.006, 0.01));
    g("gland", new T.CylinderGeometry(0.07, 0.08, 0.07, 16).rotateX(Math.PI / 2));
    this.scene.add(this.layer, this.wireLayer);

    // The battery, lying on its side, a red lead from its plus end; and the spark that runs along a new wire.
    this.battery = new T.Group();
    const cellBody = new T.Mesh(keep(new T.CylinderGeometry(0.075, 0.075, 0.36, 24, 1, true).rotateZ(Math.PI / 2)), this.paint.label);
    const ends = new T.Mesh(keep(new T.CylinderGeometry(0.073, 0.073, 0.364, 24).rotateZ(Math.PI / 2)), this.paint.cap);
    const nub = new T.Mesh(keep(new T.CylinderGeometry(0.028, 0.028, 0.03, 14).rotateZ(Math.PI / 2).translate(0.195, 0, 0)), this.paint.cap);
    for (const m of [cellBody, ends, nub]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.battery.add(m);
    }
    this.battery.children.forEach((m) => (m.position.y = 0.075));
    this.scene.add(this.battery);
    const sparkPaint = keep(new T.SpriteMaterial({ map: this.textures.glow, color: "#fff2c4", transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    this.spark = new T.Sprite(sparkPaint);
    this.spark.scale.setScalar(0.36);
    this.spark.visible = false;
    this.pulse = new T.Sprite(keep(sparkPaint.clone()));
    this.pulse.scale.setScalar(0.22);
    this.pulse.visible = false;
    this.scene.add(this.spark, this.pulse);

    // Marks.
    this.headRing = ringMesh(keep, 0.31, 0.4, "#46d2ff");
    this.hintRing = ringMesh(keep, 0.33, 0.44, "#ffc21f");
    this.cursorRing = ringMesh(keep, 0.4, 0.45, "#ffffff");
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(0.44, 32)), keep(new T.MeshBasicMaterial({ color: "#ffd56a", transparent: true, opacity: 0.35, depthWrite: false })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    for (let k = 0; k < 8; k++) {
      const ring = ringMesh(keep, 0.32, 0.36, "#d8f4ff");
      (ring.material as T.MeshBasicMaterial).opacity = 0.75;
      this.reachRings.push(ring);
      this.scene.add(ring);
    }
    this.scene.add(this.headRing, this.hintRing, this.cursorRing, this.hintGlow);
    this.begin();
    this.kick();
  }
  /** The board's frame, pegboard, sockets, bulbs and boxes for the cells of `state`, made anew. */
  private build(state: State) {
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    this.layer.clear();
    this.bulbs.clear();
    this.boxes.clear();
    this.clearWires();
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r);
    const n = (this.size = state.size),
      span = n * CELL + 0.7;
    this.cells = state.cells;
    const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], parent: T.Object3D, shadow = true) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    // The frame of pale wood, and the pegboard set into it.
    add(keep(block(span + 0.5, 0.1, span + 0.5, 0.06).translate(0, -0.11, 0)), this.paint.frame, this.layer);
    const face = keep(new T.MeshStandardMaterial({ map: keep(pegboard(n, span)), roughness: 0.85 })),
      edge = keep(new T.MeshStandardMaterial({ color: "#8f6a46", roughness: 0.9 }));
    add(keep(block(span, 0.08, span, 0.02).translate(0, BOARD_TOP - 0.04, 0)), [edge, edge, face, edge, edge, edge], this.layer).castShadow = false;
    // A socket at every place; the hole shows where it is empty.
    const sockets = new T.InstancedMesh(this.shapes.emptySocket, this.paint.porcelain, n * n),
      holes = new T.InstancedMesh(this.shapes.emptyHole, this.paint.hole, n * n),
      m = new T.Matrix4();
    let open = 0;
    for (let cell = 0; cell < n * n; cell++) {
      const at = cellAt(n, cell);
      m.makeTranslation(at.x, 0, at.z);
      if (state.cells[cell] !== BULB) {
        sockets.setMatrixAt(open, m);
        holes.setMatrixAt(open++, m);
      }
    }
    sockets.count = holes.count = open;
    sockets.castShadow = true;
    sockets.receiveShadow = holes.receiveShadow = true;
    this.layer.add(sockets, holes);
    for (let cell = 0; cell < n * n; cell++) {
      const at = cellAt(n, cell);
      if (state.cells[cell] === BULB) {
        const root = new T.Group(),
          glassPaint = keep(new T.MeshStandardMaterial({ color: "#d4e2e8", transparent: true, opacity: 0.45, roughness: 0.04, metalness: 0.1, depthWrite: false, emissive: "#ffcf86", emissiveIntensity: 0 })),
          coilPaint = keep(new T.MeshStandardMaterial({ color: "#5d4c3b", roughness: 0.5, emissive: "#ffae40", emissiveIntensity: 0 }));
        add(this.shapes.socket, this.paint.bakelite, root);
        add(this.shapes.screw, this.paint.brass, root);
        add(this.shapes.tip, this.paint.tip, root);
        add(this.shapes.support0, this.paint.support, root, false);
        add(this.shapes.support1, this.paint.support, root, false);
        add(this.shapes.stem, glassPaint, root, false);
        add(this.shapes.coil, coilPaint, root, false);
        const glass = add(this.shapes.glass, glassPaint, root, false);
        glass.renderOrder = 2;
        glass.userData.cell = cell;
        // A slight turn each, so that the filaments do not all lie one way.
        root.rotation.y = sequence(cell * 7919 + 3)() * Math.PI;
        root.position.set(at.x, 0, at.z);
        root.scale.setScalar(BULB_SCALE);
        root.userData.cell = cell;
        const halo = new T.Sprite(keep(new T.SpriteMaterial({ map: this.textures.glow, color: "#ffd690", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
        halo.position.set(at.x, BULB_Y + 0.02, at.z);
        halo.renderOrder = 6;
        const pool = new T.Mesh(this.shapes.pool, keep(new T.MeshBasicMaterial({ map: this.textures.glow, color: "#ffb860", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
        pool.position.set(at.x, BOARD_TOP + 0.064, at.z);
        pool.scale.setScalar(2);
        pool.renderOrder = 3;
        this.layer.add(root, halo, pool);
        this.bulbs.set(cell, { cell, root, glass, glassPaint, coilPaint, halo, pool, glow: 0 });
      } else if (state.cells[cell] === BOX) {
        const box = new T.Group(),
          rand = sequence(cell * 104729 + 5);
        add(this.shapes.box, this.paint.steel, box).position.y = 0.16 + 0.002;
        add(this.shapes.lid, this.paint.lid, box).position.y = 0.335;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const head = add(this.shapes.screwHead, this.paint.screw, box, false);
          head.position.set(sx * 0.27, 0.354, sz * 0.27);
          const slot = add(this.shapes.slot, this.paint.slot, box, false);
          slot.position.set(sx * 0.27, 0.364, sz * 0.27);
          slot.rotation.y = rand() * Math.PI;
        }
        add(this.shapes.gland, this.paint.rubber, box).position.set(0, 0.16, 0.39);
        box.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2);
        box.position.set(at.x, 0, at.z);
        box.userData.cell = cell;
        this.layer.add(box);
        this.boxes.set(cell, box);
      }
    }
    this.props(n, span);
  }
  /** A spool of wire, a screwdriver and a few loose screws on the bench beside the board. */
  private props(n: number, span: number) {
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r),
      half = span / 2 + 0.25,
      group = new T.Group();
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    // The spool, standing on its end, beyond the far left corner (the far side shows more of the bench).
    const sx = -half - 0.55,
      sz = -half - 0.1;
    add(new T.CylinderGeometry(0.42, 0.42, 0.06, 32), this.paint.frame, sx, -0.13, sz);
    add(new T.CylinderGeometry(0.3, 0.3, 0.34, 32), this.paint.copper, sx, 0.07, sz);
    add(new T.CylinderGeometry(0.42, 0.42, 0.06, 32), this.paint.frame, sx, 0.27, sz);
    add(new T.CylinderGeometry(0.08, 0.08, 0.07, 16), this.paint.hole, sx, 0.3, sz);
    // A screwdriver lying at the near left.
    const driver = new T.Group();
    const handle = new T.Mesh(keep(new T.CylinderGeometry(0.07, 0.06, 0.42, 16).rotateZ(Math.PI / 2)), this.paint.handle),
      shaft = new T.Mesh(keep(new T.CylinderGeometry(0.018, 0.018, 0.5, 10).rotateZ(Math.PI / 2).translate(0.46, 0, 0)), this.paint.screw);
    handle.castShadow = shaft.castShadow = true;
    driver.add(handle, shaft);
    driver.position.set(-half - 0.6, -0.09, half - 0.3);
    driver.rotation.y = 0.9;
    group.add(driver);
    this.layer.add(group);
  }
  /** Where a wire from `a` to `b` runs: an arch that clears any bulb it passes over. */
  private curveOf(a: number, b: number, index: number) {
    const n = this.size,
      A = cellAt(n, a),
      B = cellAt(n, b),
      dx = B.x - A.x,
      dz = B.z - A.z,
      length = Math.hypot(dx, dz),
      ux = dx / length,
      uz = dz / length,
      d = directionOf(n, a, b);
    let over = false;
    if (d >= 0 && this.cells) {
      const step = DR[d] * n + DC[d];
      for (let cell = a + step; cell !== b; cell += step) if (this.cells[cell] === BULB) over = true;
    }
    const lift = over ? 0.98 : Math.min(0.42, 0.12 + 0.05 * length),
      side = (sequence(index * 31 + a * 7 + b)() - 0.5) * 0.1,
      px = -uz * side,
      pz = ux * side;
    const p0 = new T.Vector3(A.x + ux * WIRE_OUT, WIRE_Y, A.z + uz * WIRE_OUT),
      p3 = new T.Vector3(B.x - ux * WIRE_OUT, WIRE_Y, B.z - uz * WIRE_OUT),
      reach = Math.min(0.35, length * 0.16);
    return new T.CubicBezierCurve3(
      p0,
      new T.Vector3(p0.x + ux * reach + px, WIRE_Y + lift * 1.3, p0.z + uz * reach + pz),
      new T.Vector3(p3.x - ux * reach + px, WIRE_Y + lift * 1.3, p3.z - uz * reach + pz),
      p3,
    );
  }
  private wireFor(a: number, b: number, index: number): Wire {
    const curve = this.curveOf(a, b, index),
      geometry = new T.TubeGeometry(curve, WIRE_SEGMENTS, WIRE_R, WIRE_SIDES, false),
      uv = geometry.getAttribute("uv"),
      along = curve.getLength() * 7;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * along);
    const mesh = new T.Mesh(geometry, this.paint.cable);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.wireLayer.add(mesh);
    return { from: a, to: b, mesh, curve };
  }
  private clearWires() {
    for (const w of this.wires) {
      w.mesh.geometry.dispose();
      this.wireLayer.remove(w.mesh);
    }
    this.wires = [];
  }
  /** The wires of `path`: those already laid kept, others made or taken away. */
  private layWires(path: number[]) {
    let keepCount = 0;
    while (keepCount < this.wires.length && keepCount + 1 < path.length && this.wires[keepCount].from === path[keepCount] && this.wires[keepCount].to === path[keepCount + 1]) keepCount++;
    for (const w of this.wires.splice(keepCount)) {
      w.mesh.geometry.dispose();
      this.wireLayer.remove(w.mesh);
    }
    for (let i = this.wires.length + 1; i < path.length; i++) this.wires.push(this.wireFor(path[i - 1], path[i], i));
    for (const w of this.wires) w.mesh.geometry.setDrawRange(0, Infinity);
  }
  /** Sets a bulb's brightness: 0 dark, 1 lit; above 1 while it flares. */
  private shine(bulb: Bulb, glow: number) {
    bulb.glow = glow;
    const g = Math.min(1, glow),
      extra = Math.max(0, glow - 1),
      paint = bulb.glassPaint;
    paint.opacity = 0.45 + 0.43 * g;
    paint.emissiveIntensity = g * (this.soft ? 0.95 : 1.25) + extra * 1.2;
    paint.color.setRGB(0.83 + 0.17 * g, 0.885 + 0.08 * g, 0.91 - 0.2 * g);
    bulb.coilPaint.emissiveIntensity = g * 3 + extra * 2;
    const halo = bulb.halo.material as T.SpriteMaterial;
    halo.opacity = g * (this.soft ? 0.55 : 0.8) + extra * 0.4;
    bulb.halo.scale.setScalar((this.soft ? 1.0 : 1.4) * (0.6 + 0.4 * g) + extra * 1.2);
    (bulb.pool.material as T.MeshBasicMaterial).opacity = g * (this.soft ? 0.35 : 0.5) + extra * 0.3;
  }
  /** The battery: beside the first bulb lit, or at rest on the near edge of the frame. */
  private batteryAt(state: State) {
    const n = this.size;
    if (!state.path.length) {
      const edge = ((n * CELL + 0.7) / 2) + 0.12;
      return { x: -edge + 0.6, z: edge, turn: 0, y: -0.06 };
    }
    const start = state.path[0],
      at = cellAt(n, start),
      r = Math.floor(start / n),
      c = start % n;
    // The corner of its cell with the most room: away from other bulbs on that diagonal and inside the board.
    let best = { sx: 1, sz: 1 },
      score = -Infinity;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const rr = r + sz,
        cc = c + sx,
        inside = rr >= 0 && cc >= 0 && rr < n && cc < n,
        kind = inside ? state.cells[rr * n + cc] : 0,
        value = (kind === 0 ? 2 : 0) + (sz > 0 ? 0.5 : 0) + (sx > 0 ? 0.25 : 0) + (inside ? 0 : 1);
      if (value > score) {
        score = value;
        best = { sx, sz };
      }
    }
    return { x: at.x + best.sx * 0.42, z: at.z + best.sz * 0.42, turn: Math.atan2(best.sz, -best.sx), y: 0 };
  }
  /** The red lead from the battery's plus end to its bulb's socket. */
  private layLead(state: State) {
    if (this.lead) {
      this.lead.geometry.dispose();
      this.scene.remove(this.lead);
      this.lead = null;
    }
    if (!state.path.length) return;
    const b = this.batteryAt(state),
      at = cellAt(this.size, state.path[0]),
      plus = new T.Vector3(b.x + Math.cos(b.turn) * 0.2, b.y + 0.075, b.z - Math.sin(b.turn) * 0.2),
      to = new T.Vector3(at.x + (b.x - at.x) * 0.45, WIRE_Y, at.z + (b.z - at.z) * 0.45),
      curve = new T.QuadraticBezierCurve3(plus, new T.Vector3((plus.x + to.x) / 2, 0.16, (plus.z + to.z) / 2), to);
    this.lead = new T.Mesh(new T.TubeGeometry(curve, 16, 0.014, 6, false), this.paint.lead);
    this.lead.castShadow = true;
    this.scene.add(this.lead);
  }
  protected subject(aspect: number): TableSubject {
    return bulbSubject(this.size || 5, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null) return [];
    return state.cells.map((kind, i) => ({ ...cellAt(state.size, i), y: kind === BULB ? BULB_Y : BOARD_TOP, r: REACH, point: i }));
  }
  /** What a ray points at: the bulb or box it strikes first, else the socket under it on the board. */
  protected pick(ray: T.Ray): number | null {
    const state = this.state;
    if (!state || state.winner !== null) return -1;
    this.caster.ray.copy(ray);
    for (const hit of this.caster.intersectObjects(this.layer.children.filter((o) => o.userData.cell !== undefined), true)) {
      for (let o: T.Object3D | null = hit.object; o; o = o.parent) if (o.userData.cell !== undefined) return o.userData.cell as number;
    }
    const at = new T.Vector3();
    return ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP), at) ? cellUnder(state.size, at.x, at.z) : -1;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    this.hovered = point;
    this.mark(this.marks);
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here, so that a press on a box or an empty socket is a move too (and refused with words).
    this.press = { cell: point, x: at.x, z: at.z };
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    if (!press || !at || !state || state.winner !== null || press.cell < 0) return;
    // A tap: let go near where it was pressed (a finger that slides far away has changed its mind).
    if (Math.hypot(at.x - press.x, at.z - press.z) > CELL * 0.9) return;
    const move = { from: -1, to: press.cell, extra: -1 };
    this.onMove(move);
    if (this.state === state && refusal(state, move)) this.shake(press.cell);
  }
  /**
   * A bulb or box that may not be chosen shakes a little in its socket. It runs on its own frames, not as a tween, so
   * that it neither holds the next tap back nor counts as the table moving.
   */
  private shake(cell: number) {
    const object = this.bulbs.get(cell)?.root ?? this.boxes.get(cell);
    if (!object || this.reducedMotion) return;
    const start = performance.now(),
      step = (now: number) => {
        if (this.disposed) return;
        const p = Math.min(1, (now - start) / 360);
        object.rotation.z = p < 1 ? Math.sin(p * Math.PI * 5) * 0.12 * (1 - p) : 0;
        this.redraw();
        if (p < 1) requestAnimationFrame(step);
      };
    requestAnimationFrame(step);
  }
  protected place(state: State) {
    // A board not built yet (or another one): built, and the camera set for its size, which lays it out again.
    if (state.cells !== this.cells || state.size !== this.size) {
      this.build(state);
      this.resize();
    }
    this.layWires(state.path);
    const won = state.winner === 0;
    for (const bulb of this.bulbs.values()) {
      this.shine(bulb, state.lit[bulb.cell] ? (won ? 1.08 : 1) : 0);
      bulb.root.position.y = 0;
    }
    const b = this.batteryAt(state);
    this.battery.position.set(b.x, b.y, b.z);
    this.battery.rotation.set(0, b.turn, 0);
    this.layLead(state);
    this.spark.visible = false;
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.cells !== state.cells) return false;
    const bulb = this.bulbs.get(last.to);
    if (!bulb) return false;
    let lightAt = 0;
    if (last.from < 0) {
      // The battery hops over to the first bulb, its lead comes, and the bulb lights.
      const from = this.batteryAt(before),
        to = this.batteryAt(state);
      this.layLead(before);
      this.tween(0, 420, (p) => {
        const t = travel(p);
        this.battery.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + hop(p) * 0.5, from.z + (to.z - from.z) * t);
        this.battery.rotation.y = from.turn + (to.turn - from.turn) * t;
        if (p === 1) this.layLead(state);
      });
      lightAt = 380;
    } else {
      // The wire runs out from the head, a spark at its tip, and the bulb comes on as it arrives.
      this.layWires(state.path);
      const wire = this.wires[this.wires.length - 1],
        geometry = wire.mesh.geometry;
      geometry.setDrawRange(0, 0);
      const ms = RUN_MS * Math.min(1.6, 0.7 + wire.curve.getLength() * 0.18);
      this.spark.visible = true;
      this.tween(0, ms, (p) => {
        const e = 1 - (1 - p) ** 2,
          rows = Math.ceil(e * WIRE_SEGMENTS);
        geometry.setDrawRange(0, rows * WIRE_SIDES * 6);
        this.spark.position.copy(wire.curve.getPoint(e));
        this.spark.scale.setScalar(0.3 + 0.08 * Math.sin(p * 40));
        if (p === 1) this.spark.visible = false;
      });
      lightAt = ms - 20;
    }
    // On: a click and a flicker before it holds steady.
    this.tween(lightAt, 10, (p) => {
      if (p === 1) this.onContact();
    });
    this.tween(lightAt, GLOW_MS, (p) => {
      const flicker = p < 0.55 ? (Math.sin(p * 46) > 0 ? 0.85 : 0.25) : 1;
      this.shine(bulb, Math.min(1, p * 1.6) * flicker);
    });
    if (state.winner === 0) {
      // Everything lit: a wave of light along the wire, from the battery to the last bulb.
      const start = lightAt + GLOW_MS + 120;
      state.path.forEach((cell, k) => {
        const b = this.bulbs.get(cell)!;
        this.tween(start + k * 70, 520, (p) => this.shine(b, 1 + Math.sin(p * Math.PI) * 0.9 + p * 0.08));
      });
      this.flareAt = performance.now() + start;
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state || !this.cells) return;
    const n = this.size,
      live = state.winner === null && !capturing(),
      hint = live && marks.hint ? marks.hint.to : -1,
      cursor = live ? (marks.cursor ?? (this.hovered >= 0 && state.cells[this.hovered] === BULB && !state.lit[this.hovered] ? this.hovered : -1)) : -1,
      headCell = state.path.length ? state.path[state.path.length - 1] : -1,
      ringAt = (ring: T.Mesh, cell: number, lift = 0) => {
        const at = cellAt(n, cell);
        ring.position.set(at.x, BOARD_TOP + 0.067 + lift, at.z);
      };
    this.hinted = hint;
    this.headCell = live ? headCell : -1;
    this.hintRing.visible = this.hintGlow.visible = hint >= 0;
    if (hint >= 0) {
      ringAt(this.hintRing, hint, 0.002);
      ringAt(this.hintGlow, hint, -0.001);
    }
    this.headRing.visible = this.headCell >= 0;
    if (this.headCell >= 0) ringAt(this.headRing, this.headCell, 0.001);
    this.cursorRing.visible = cursor >= 0;
    if (cursor >= 0) ringAt(this.cursorRing, cursor, 0.003);
    // The bulbs the wire can reach, once it has begun.
    const targets = live && state.path.length ? marks.targets.filter((cell) => cell !== hint) : [];
    this.reachRings.forEach((ring, k) => {
      ring.visible = k < targets.length;
      if (ring.visible) ringAt(ring, targets[k]);
    });
    // For browser tests: the bulbs, the boxes, the path lit, the head, the hint, the bulbs the wire reaches, and where every cell lies on the canvas.
    const el = this.renderer.domElement;
    el.dataset.size = String(n);
    el.dataset.bulbs = [...this.bulbs.keys()].join(" ");
    el.dataset.boxes = [...this.boxes.keys()].join(" ");
    el.dataset.lit = state.path.join(" ");
    el.dataset.head = String(headCell);
    el.dataset.hint = String(hint);
    el.dataset.reach = (state.path.length && state.winner === null ? marks.targets : []).join(" ");
    el.dataset.places = this.places(state);
    this.redraw();
  }
  /** Where every cell is on the canvas (a bulb at its glass, anything else at the board), in CSS pixels, "x,y" joined by spaces. */
  private places(state: State) {
    const el = this.renderer.domElement,
      v = new T.Vector3(),
      out: string[] = [];
    this.camera.updateMatrixWorld();
    for (let i = 0; i < state.cells.length; i++) {
      const at = cellAt(state.size, i);
      v.set(at.x, state.cells[i] === BULB ? BULB_Y : BOARD_TOP, at.z).project(this.camera);
      out.push(`${Math.round(((v.x + 1) / 2) * el.clientWidth)},${Math.round(((1 - v.y) / 2) * el.clientHeight)}`);
    }
    return out.join(" ");
  }
  /** The bench's own frame loop: the head's ring breathes, the hint glows, and a pulse of current runs along the wire. */
  private kick() {
    if (!this.clock && !this.disposed && this.live) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    this.idle(now / 1000);
    this.redraw();
    this.kick();
  };
  private idle(t: number) {
    if (this.headCell >= 0) {
      (this.headRing.material as T.MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(t * 3.2);
      this.headRing.scale.setScalar(1 + 0.05 * Math.sin(t * 3.2));
    }
    if (this.hinted >= 0) (this.hintGlow.material as T.MeshBasicMaterial).opacity = 0.25 + 0.18 * Math.sin(t * 4);
    // A pulse runs from the battery along the wires every few seconds, a quarter second a wire.
    const state = this.state;
    const wires = this.wires;
    if (!state || !wires.length || this.animating || capturing()) {
      this.pulse.visible = false;
      return;
    }
    const each = 0.28,
      period = wires.length * each + 2.4,
      into = (t % period) / each,
      k = Math.floor(into);
    this.pulse.visible = k < wires.length;
    if (this.pulse.visible) {
      this.pulse.position.copy(wires[k].curve.getPoint(into - k));
      this.pulse.position.y += WIRE_R;
    }
    // The lit bulbs hum: a faint, slow breathing of their glow (stronger for a moment after the celebration).
    const after = this.flareAt ? Math.max(0, 1 - (performance.now() - this.flareAt) / 6000) : 0;
    for (const bulb of this.bulbs.values())
      if (state.lit[bulb.cell]) this.shine(bulb, (state.winner === 0 ? 1.08 : 1) + 0.03 * Math.sin(t * 2.1 + bulb.cell) + after * 0.05 * Math.sin(t * 5 + bulb.cell));
  }
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    this.clearWires();
    this.lead?.geometry.dispose();
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    super.dispose();
  }
}
