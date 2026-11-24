import * as T from "three";
import { afterGPUFrame, aim, wood, realism, planks, block, glossy, capable, hop, travel, fall } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import { SPACES, type State } from "./rules";
import { ATLAS_COLS, ATLAS_ROWS, banknote, boardPrint, cardBack, cardEdges, cardFace, dieFace, spaceAtlas } from "./paint";
import { IDLE, bankTray, chest, island, rocket, spacecraft, travellerModel, type Paints, type Scenery } from "./models";
import { zoomable } from "../../engine/zoom";

export const TOUR_SUBJECT: Subject & { tilt: number } = { half: 7.55, halfZ: 7.55, height: 1.6, lookY: 0, tilt: 0.98 };
export const PLAYER_COLORS = ["#d2452f", "#2f62c0", "#3f9a5a", "#e0a020"];
// Ten spaces along each side, corners included.
const SIDE = 10,
  STEP = 1.3,
  REACH = (SIDE * STEP) / 2,
  /** Inside the ring of spaces: the half width of the board's printed middle. */
  INNER = REACH - STEP / 2,
  /** Height of the top of a space, where the travellers stand. */
  TOP = 0.06,
  /** Where the bank's tray and the golden keys lie. */
  BANK = new T.Vector3(2.6, 0, 2.2),
  DECK = new T.Vector3(-2.6, 0, 2.2);
/** Centre of a space: 0 is the near right corner and the road runs clockwise seen from above. */
export function spaceAt(index: number) {
  const side = Math.floor(index / SIDE),
    k = index % SIDE,
    d = REACH - k * STEP;
  return [
    { x: d, z: REACH },
    { x: -REACH, z: d },
    { x: -d, z: -REACH },
    { x: REACH, z: -d },
  ][side];
}
/** The picture of a lit space (우주여행's choices): a light tint and a thick rounded frame, in white to be coloured. */
function frameCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!,
    round = (inset: number, r: number) => {
      g.beginPath();
      g.roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, r);
    };
  round(6, 16);
  g.fillStyle = "rgba(255,255,255,0.32)";
  g.fill();
  g.lineWidth = 11;
  g.strokeStyle = "#fff";
  g.stroke();
  return c;
}
/** Which way is toward the middle of the board from a side's spaces, and which way the road runs along it. */
const INWARD = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const ROAD = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
];
/** How the spaces of a side are turned, so that names read from the middle of the board outward. */
const TURN = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
/** The way a traveller faces at rest on a space: along the road. */
const restYaw = (index: number) => {
  const [x, z] = ROAD[Math.floor(index / SIDE)];
  return Math.atan2(x, z);
};
/** An angle part of the way to another, the short way round. */
const turnToward = (from: number, to: number, p: number) => {
  const d = ((((to - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return from + d * p;
};
function texture(c: HTMLCanvasElement, anisotropy = 4) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = anisotropy;
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
const UP = new T.Vector3(0, 1, 0);
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
}
/**
 * The ring of forty spaces as one mesh: each space a raised tile with rounded edges, its top cut from the atlas
 * of painted spaces (group 0), its sides plain (group 1). Two draws for the whole road.
 */
function roadGeometry() {
  const tops: number[][] = [[], [], []],
    sides: number[][] = [[], [], []];
  SPACES.forEach((_, i) => {
    const tile = block(STEP - 0.06, TOP, STEP - 0.06, 0.025, 2).toNonIndexed(),
      uv = tile.getAttribute("uv"),
      col = i % ATLAS_COLS,
      row = Math.floor(i / ATLAS_COLS);
    const p = spaceAt(i);
    tile.rotateY(TURN[Math.floor(i / SIDE)]);
    tile.translate(p.x, TOP / 2, p.z);
    const position = tile.getAttribute("position"),
      normal = tile.getAttribute("normal");
    for (const group of tile.groups) {
      const top = group.materialIndex === 2,
        into = top ? tops : sides;
      for (let v = group.start; v < group.start + group.count; v++) {
        into[0].push(position.getX(v), position.getY(v), position.getZ(v));
        into[1].push(normal.getX(v), normal.getY(v), normal.getZ(v));
        // The top shows its space from the atlas; the canvas's first row is at the top of the picture.
        if (top) into[2].push((col + Math.min(1, Math.max(0, uv.getX(v)))) / ATLAS_COLS, 1 - (row + 1 - Math.min(1, Math.max(0, uv.getY(v)))) / ATLAS_ROWS);
        else into[2].push(uv.getX(v), uv.getY(v));
      }
    }
    tile.dispose();
  });
  const g = new T.BufferGeometry(),
    count = tops[0].length / 3;
  g.setAttribute("position", new T.Float32BufferAttribute([...tops[0], ...sides[0]], 3));
  g.setAttribute("normal", new T.Float32BufferAttribute([...tops[1], ...sides[1]], 3));
  g.setAttribute("uv", new T.Float32BufferAttribute([...tops[2], ...sides[2]], 2));
  g.addGroup(0, count, 0);
  g.addGroup(count, sides[0].length / 3, 1);
  g.computeBoundingSphere();
  return g;
}
interface Effect {
  start: number;
  duration: number;
  update: (p: number) => void;
}
/** The board of the world tour: a road of spaces round a sea chart, with buildings that rise on the cities. */
export class TourView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 120);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  /** Each traveller's piece: the root that moves along the road, the model that bobs in it, the ring of its turn. */
  private tokens: T.Group[] = [];
  private models: T.Object3D[] = [];
  private rings: T.Mesh[] = [];
  private dice: T.Mesh[] = [];
  /** Where each die lies at rest, and how it is turned there. */
  private diceAt = [new T.Vector3(-0.52, 0.3, 2.4), new T.Vector3(0.52, 0.3, 2.4)];
  private diceYaw = [0.08, -0.12];
  private buildings = new T.Group();
  private built: string[] = SPACES.map(() => "");
  private parts: Record<string, T.BufferGeometry> = {};
  private paints: T.MeshStandardMaterial[];
  private trims: Record<string, T.MeshStandardMaterial> = {};
  private tweens: Tween[] = [];
  /** What only decorates (notes in flight, rings spreading): never waited for. */
  private effects: Effect[] = [];
  private notes: T.Mesh[] = [];
  private pulses: T.Mesh[] = [];
  private state: State | null = null;
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /**
   * Small idle life (bobbing pieces, a breathing ring at the cards) and the decorations (notes in flight, spreading
   * rings), where a graphics card draws and motion is welcome.
   */
  private lively: boolean;
  private idled = 0;
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  /** A building piece has been set down on a city. */
  onBuilt: () => void = () => {};
  /** The board was tapped. */
  onTap: () => void = () => {};
  /** A space offered by `offer` was tapped (우주여행: where to go). */
  onSpace: (index: number) => void = () => {};
  /** The spaces that may be tapped now, each with its glowing cover, and the one chosen. */
  private offered = new Map<number, T.Mesh>();
  private chosen = -1;
  private hovered = -1;
  private readonly floor = new T.Plane(new T.Vector3(0, 1, 0), -TOP);
  /**
   * Lights the spaces that may be tapped (우주여행's destinations), the `chosen` one brighter; none when `spaces` is
   * null. Covers are laid just over the tiles and breathe while they wait.
   */
  offer(spaces: number[] | null, chosen = -1) {
    if (this.disposed || (!spaces && !this.offered.size)) return;
    const keep = new Set(spaces ?? []);
    for (const [i, cover] of this.offered)
      if (!keep.has(i)) {
        this.scene.remove(cover);
        this.offered.delete(i);
      }
    for (const i of keep)
      if (!this.offered.has(i)) {
        const p = spaceAt(i),
          cover = new T.Mesh(this.coverShape, this.coverPaint.clone());
        this.own(cover.material as T.Material);
        cover.rotation.x = -Math.PI / 2;
        cover.position.set(p.x, TOP + 0.006, p.z);
        cover.renderOrder = 2;
        this.offered.set(i, cover);
        this.scene.add(cover);
      }
    this.chosen = keep.has(chosen) ? chosen : -1;
    const canvas = this.renderer.domElement;
    canvas.dataset.offered = [...keep].join(",");
    // Where each offered space is on the canvas (CSS pixels), for the tests and readers' tools.
    this.camera.updateMatrixWorld();
    canvas.dataset.spots = JSON.stringify(
      Object.fromEntries(
        [...keep].map((i) => {
          const p = spaceAt(i),
            v = new T.Vector3(p.x, TOP, p.z).project(this.camera);
          return [i, [Math.round(((v.x + 1) / 2) * canvas.clientWidth), Math.round(((1 - v.y) / 2) * canvas.clientHeight)]];
        }),
      ),
    );
    this.renderer.domElement.style.cursor = "";
    this.paintOffer(performance.now());
    this.dirty = true;
  }
  private readonly coverShape = this.own(new T.PlaneGeometry(STEP - 0.14, STEP - 0.14));
  /** A lit space: a tint over the tile inside a bright rounded frame (white, coloured by the material). */
  private readonly coverPaint = this.own(
    new T.MeshBasicMaterial({ map: this.own(texture(frameCanvas())), color: "#39c6ff", transparent: true, depthWrite: false, toneMapped: false }),
  );
  private paintOffer(now: number) {
    const breath = 0.5 + 0.5 * Math.sin(now / 260);
    for (const [i, cover] of this.offered) {
      const paint = cover.material as T.MeshBasicMaterial;
      if (i === this.chosen) {
        paint.color.set("#ffc21a");
        paint.opacity = 1;
      } else {
        paint.color.set(i === this.hovered ? "#9be6ff" : "#39c6ff");
        paint.opacity = i === this.hovered ? 1 : 0.6 + 0.4 * breath;
      }
    }
  }
  /** The space under a pointer, or -1. */
  private spaceUnder(e: PointerEvent) {
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const hit = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.floor, hit)) return -1;
    return SPACES.findIndex((_, i) => {
      const p = spaceAt(i);
      return Math.abs(hit.x - p.x) < STEP / 2 && Math.abs(hit.z - p.z) < STEP / 2;
    });
  }
  /**
   * Turns the top golden key card over: it lifts off the pile, flips and
   * comes forward. `done` is called when it has opened.
   */
  revealCard(done: () => void) {
    if (this.disposed) return;
    this.card.visible = true;
    this.halo.visible = false;
    const from = this.deck.position.clone().setY(0.4),
      to = new T.Vector3(0, 2.6, 3.4),
      now = performance.now();
    if (this.reducedMotion) {
      this.card.position.copy(to);
      this.card.rotation.set(-0.6, 0, 0);
      this.card.scale.setScalar(2.1);
      this.dirty = true;
      done();
      return;
    }
    this.tweens.push({
      start: now,
      duration: 700,
      update: (p) => {
        const e = p * p * (3 - 2 * p);
        this.card.position.lerpVectors(from, to, e);
        this.card.position.y += Math.sin(Math.PI * p) * 1.2;
        // Face down on the pile, it turns over as it rises and tilts toward the player.
        this.card.rotation.set(-0.6 * e, 0.25 * (1 - e), Math.PI * (1 - e));
        this.card.scale.setScalar(1 + 1.1 * e);
        if (p === 1) done();
      },
    });
  }
  /** Puts the opened card away. */
  hideCard() {
    this.card.visible = false;
    this.dirty = true;
  }
  private card!: T.Mesh;
  /** The pile of golden key cards was tapped. */
  onDeck: () => void = () => {};
  private deck!: T.Mesh;
  private halo!: T.Mesh;
  private ray = new T.Raycaster();
  get animating() {
    return this.tweens.length > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    players: number,
  ) {
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#543a28");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    const rich = capable();
    this.lively = rich && !this.reducedMotion;
    this.scene.add(new T.HemisphereLight("#fff4dc", "#4a3a2c", 2.2));
    const light = new T.DirectionalLight("#fff3dc", 2.5);
    light.position.set(-6, 12, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -11;
    light.shadow.camera.right = 11;
    light.shadow.camera.top = 11;
    light.shadow.camera.bottom = -11;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    realism(this.renderer, this.scene);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      standard = (options: T.MeshStandardMaterialParameters) => this.own(new T.MeshStandardMaterial({ roughness: 0.75, ...options })),
      shiny = (options: T.MeshStandardMaterialParameters, coat = 1) => this.own(glossy({ roughness: 0.4, ...options }, coat));
    const table = new T.Mesh(this.own(new T.PlaneGeometry(120, 120)), standard(planks(15, keep)));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.36;
    table.receiveShadow = true;
    this.scene.add(table);
    // The board: a thick slab with a frame of pale polished wood, its top printed with the sea chart.
    const width = REACH * 2 + STEP,
      grain = this.own(wood(false));
    grain.repeat.set(3, 3);
    const frame = new T.Mesh(this.own(block(width + 0.7, 0.36, width + 0.7, 0.1, 3)), shiny({ map: grain, color: "#d39a68", roughness: 0.5 }, 0.6));
    frame.position.y = -0.18;
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.scene.add(frame);
    const print = new T.Mesh(
      this.own(new T.PlaneGeometry(width + 0.2, width + 0.2)),
      // Software drawing uploads the picture slowly: there a smaller print is enough for its single pixel ratio.
      standard({ map: this.own(texture(boardPrint(rich ? 2048 : 1024, width + 0.2, INNER), rich ? 8 : 4)), roughness: 0.62 }),
    );
    print.rotation.x = -Math.PI / 2;
    print.position.y = 0.002;
    print.receiveShadow = true;
    this.scene.add(print);
    // The forty spaces, as raised tiles.
    const road = new T.Mesh(this.own(roadGeometry()), [
      standard({ map: this.own(texture(spaceAtlas(rich ? 320 : 256), rich ? 8 : 4)), roughness: 0.8 }),
      standard({ color: "#efe4cb", roughness: 0.7 }),
    ]);
    road.receiveShadow = true;
    this.scene.add(road, this.buildings);
    // Building parts, shared by every city, and one paint per traveller.
    this.parts = {
      box: this.own(new T.BoxGeometry(1, 1, 1)),
      roof: this.own(new T.ConeGeometry(0.74, 0.5, 4)),
      drum: this.own(new T.CylinderGeometry(0.5, 0.5, 1, 24)),
      dome: this.own(new T.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
      spire: this.own(new T.ConeGeometry(0.12, 0.7, 12)),
      flag: this.own(new T.BoxGeometry(0.34, 0.2, 0.03)),
      pole: this.own(new T.CylinderGeometry(0.025, 0.025, 0.6, 8)),
      ball: this.own(new T.SphereGeometry(0.05, 10, 8)),
    };
    this.paints = PLAYER_COLORS.map((color) => shiny({ color, roughness: 0.38 }));
    this.trims = {
      wall: standard({ color: "#f3ead6" }),
      glass: shiny({ color: "#8fb9dc", roughness: 0.15, metalness: 0.35 }),
      gold: standard({ color: "#d9b24a", roughness: 0.3, metalness: 0.75 }),
      dark: standard({ color: "#3a3f45" }),
      window: standard({ color: "#2e3f52", roughness: 0.3 }),
    };
    // The pile of golden key cards with gilt edges, and the ring that lights up when one is to be drawn.
    const back = cardBack(),
      gilt = standard({ map: this.own(texture(cardEdges())), roughness: 0.28, metalness: 0.75 }),
      plainGilt = standard({ color: "#d8ad3c", roughness: 0.3, metalness: 0.75 }),
      backFace = standard({ map: this.own(texture(back)), roughness: 0.42, metalness: 0.15 }),
      // Seen from below, the back turns end over end: its picture is turned to match.
      under = this.own(texture(back));
    under.center.set(0.5, 0.5);
    under.rotation = Math.PI;
    this.deck = new T.Mesh(this.own(block(1.15, 0.3, 1.6, 0.04)), [gilt, gilt, backFace, plainGilt, gilt, gilt]);
    this.deck.position.set(DECK.x, 0.152, DECK.z);
    this.deck.rotation.y = 0.25;
    this.deck.castShadow = true;
    this.halo = new T.Mesh(
      this.own(new T.RingGeometry(1.15, 1.32, 48)),
      this.own(new T.MeshBasicMaterial({ color: "#ffe27a", transparent: true, opacity: 0.95, depthWrite: false })),
    );
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.set(DECK.x, 0.008, DECK.z);
    this.halo.visible = false;
    // The card that is turned over: gold back, pale face with the key, a gold edge.
    this.card = new T.Mesh(this.own(block(1.15, 0.018, 1.6, 0.006)), [
      plainGilt,
      plainGilt,
      standard({ map: this.own(texture(cardFace())), roughness: 0.5 }),
      standard({ map: under, roughness: 0.42, metalness: 0.15 }),
      plainGilt,
      plainGilt,
    ]);
    this.card.visible = false;
    this.card.castShadow = true;
    this.scene.add(this.deck, this.halo, this.card);
    // The bank: a tray of notes in three colours. Notes fly from it, to it and between travellers.
    const note = this.own(texture(banknote())),
      paper = standard({ color: "#f3f0e6", roughness: 0.9 }),
      tints = ["#b9dcae", "#f0c3bf", "#bdd2f0"],
      piles = tints.map((color) => {
        const face = standard({ map: note, color, roughness: 0.8 });
        return [paper, paper, face, paper, paper, paper];
      }),
      bank = bankTray(standard({ map: grain, color: "#b07a4c", roughness: 0.55 }), piles, keep);
    bank.position.copy(BANK);
    bank.rotation.y = -0.25;
    bank.scale.setScalar(1.25);
    this.scene.add(bank);
    const flying = standard({ map: note, color: tints[0], roughness: 0.8 }),
      // A note is a thin sheet with its picture on both faces, so that it needs no two-sided shader.
      sheet = this.own(new T.BoxGeometry(0.62, 0.004, 0.31));
    for (let i = 0; i < 18; i++) {
      const mesh = new T.Mesh(sheet, flying);
      mesh.visible = false;
      mesh.castShadow = true;
      this.notes.push(mesh);
      this.scene.add(mesh);
    }
    // Rings that spread where something lands.
    const spread = this.own(new T.RingGeometry(0.3, 0.36, 48));
    for (let i = 0; i < 4; i++) {
      const ring = new T.Mesh(spread, this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.pulses.push(ring);
      this.scene.add(ring);
    }
    this.scenery(standard, shiny, keep);
    // The travellers: an airplane, a ship, a car and a balloon, each in its traveller's colour.
    const common = {
      cream: shiny({ color: "#f4efe2", roughness: 0.45 }, 0.6),
      dark: standard({ color: "#25282c", roughness: 0.6 }),
      glass: shiny({ color: "#26394d", roughness: 0.12, metalness: 0.3 }),
      metal: standard({ color: "#b9bec4", roughness: 0.32, metalness: 0.8 }),
      gold: this.trims.gold,
      wicker: standard({ color: "#9a6a38", roughness: 0.85 }),
      red: standard({ color: "#c7321f", roughness: 0.5 }),
    };
    const turnRing = this.own(new T.RingGeometry(0.26, 0.31, 40));
    for (let i = 0; i < players; i++) {
      const paints: Paints = { paint: this.paints[i], ...common },
        root = new T.Group(),
        model = travellerModel(i % 4, paints, keep),
        holder = new T.Group(),
        ring = new T.Mesh(turnRing, this.own(new T.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.9, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      ring.visible = false;
      // The piece is held a size larger than it was made; the model bobs inside its holder.
      holder.scale.setScalar(1.4);
      holder.add(model);
      root.add(holder, ring);
      this.tokens.push(root);
      this.models.push(model);
      this.rings.push(ring);
      this.scene.add(root);
    }
    const cube = this.own(block(0.6, 0.6, 0.6, 0.085, 3)),
      faces = FACES.map((value) => shiny({ map: this.own(texture(dieFace(value))), roughness: 0.32 }, 0.8));
    for (const at of this.diceAt) {
      const die = new T.Mesh(cube, faces);
      die.position.copy(at);
      die.castShadow = true;
      this.dice.push(die);
      this.scene.add(die);
    }
    const el = this.renderer.domElement;
    let down: number | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.pointerType === "mouse" && e.button !== 0 ? null : e.pointerId));
    el.addEventListener("pointerup", (e) => {
      if (down === e.pointerId && !this.disposed && !this.animating) {
        const space = this.offered.size ? this.spaceUnder(e) : -1;
        aim(this.ray, e, el, this.camera);
        if (this.offered.has(space)) this.onSpace(space);
        else if (this.ray.intersectObject(this.deck, false).length) this.onDeck();
        else this.onTap();
      }
      down = null;
    });
    // A mouse over an offered space lights it and shows a hand.
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !this.offered.size || this.disposed) return;
      const space = this.spaceUnder(e),
        over = this.offered.has(space) ? space : -1;
      if (over === this.hovered) return;
      this.hovered = over;
      el.style.cursor = over >= 0 ? "pointer" : "";
      this.dirty = true;
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const moved = this.step(performance.now());
      if (!this.dirty && !moved) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          this.renderer.domElement.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  /** The modelled special spaces: the island, the rocket, the peace fund's chest and the spacecraft by its space. */
  private scenery(
    standard: (o: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial,
    shiny: (o: T.MeshStandardMaterialParameters, coat?: number) => T.MeshStandardMaterial,
    keep: <R extends { dispose(): void }>(r: R) => R,
  ) {
    const s: Scenery = {
      sand: standard({ color: "#ecd49a", roughness: 0.95 }),
      sea: shiny({ color: "#46a9c6", roughness: 0.15 }),
      bark: standard({ color: "#7a5532", roughness: 0.9 }),
      frond: standard({ color: "#4f9a40", roughness: 0.75 }),
      white: shiny({ color: "#f1f3f5", roughness: 0.35 }, 0.7),
      red: shiny({ color: "#d2452f", roughness: 0.4 }),
      dark: standard({ color: "#2a2d33", roughness: 0.55 }),
      glass: shiny({ color: "#24384c", roughness: 0.1, metalness: 0.3 }),
      metal: standard({ color: "#9aa1a8", roughness: 0.35, metalness: 0.8 }),
      gold: this.trims.gold,
      chest: standard({ color: "#8a4f2a", roughness: 0.6 }),
      rock: standard({ color: "#8d8a84", roughness: 0.85 }),
    };
    const corner = (index: number, model: T.Object3D, yaw: number, scale = 1) => {
      const p = spaceAt(index),
        [ax, az] = INWARD[Math.floor(index / SIDE)],
        [bx, bz] = INWARD[(Math.floor(index / SIDE) + 3) % 4];
      // In the inner quarter of the corner: the travellers stand in the other three.
      model.position.set(p.x + (ax + bx) * 0.3, TOP, p.z + (az + bz) * 0.3);
      model.rotation.y = yaw;
      model.scale.setScalar(scale);
      this.scene.add(model);
    };
    const find = (kind: string) => SPACES.findIndex((space) => space.kind === kind);
    corner(find("storm"), island(s, keep), 0.3, 1.1);
    corner(find("space"), rocket(s, keep), 0.2, 1.4);
    corner(find("fund"), chest(s, keep), 0.15, 1.2);
    // The spacecraft rests on the sea inside its space, ahead of where its owner's flag goes.
    const ship = find("ship"),
      p = spaceAt(ship),
      side = Math.floor(ship / SIDE),
      [ix, iz] = INWARD[side],
      [rx, rz] = ROAD[side],
      craft = spacecraft(s, keep);
    craft.position.set(p.x + ix * 0.9 + rx * 0.25, 0.002, p.z + iz * 0.9 + rz * 0.25);
    craft.rotation.y = Math.atan2(ix, iz);
    craft.scale.setScalar(1.4);
    this.scene.add(craft);
  }
  /**
   * The building pieces on a city, set down one beside the other as they are
   * bought: a house with a pitched roof, a glass tower, a domed landmark
   * with a spire. Bare land carries the owner's flag. Returns the group and
   * the newest piece.
   */
  private raise(index: number, owner: number, level: number) {
    const group = new T.Group(),
      paint = this.paints[owner];
    const piece = (slot: number, build: (add: (part: string, material: T.Material, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number) => T.Mesh) => void) => {
      const model = new T.Group();
      build((part, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
        const mesh = new T.Mesh(this.parts[part], material);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        model.add(mesh);
        return mesh;
      });
      // Every piece stands on a base in its owner's colour, like a playing piece.
      const base = new T.Mesh(this.parts.drum, paint);
      base.scale.set(0.42, 0.05, 0.42);
      base.position.y = 0.025;
      base.castShadow = true;
      model.add(base);
      model.position.x = slot * 0.4;
      group.add(model);
      return model;
    };
    let newest: T.Object3D = group;
    // The spacecraft stands where a flag would: its owner's flag goes beside it.
    if (level === 0)
      newest = piece(SPACES[index].kind === "ship" ? 1 : 0, (add) => {
        add("pole", this.trims.dark, 0, 0.35, 0);
        add("ball", this.trims.gold, 0, 0.66, 0);
        add("flag", paint, 0.18, 0.55, 0);
      });
    if (level >= 1)
      newest = piece(-1, (add) => {
        add("box", this.trims.wall, 0, 0.21, 0, 0.34, 0.32, 0.3);
        add("roof", paint, 0, 0.5, 0, 0.36, 0.56, 0.32).rotation.y = Math.PI / 4;
        add("box", this.trims.dark, 0, 0.13, 0.155, 0.09, 0.16, 0.02);
        add("box", this.trims.window, -0.1, 0.26, 0.152, 0.07, 0.07, 0.02);
        add("box", this.trims.window, 0.1, 0.26, 0.152, 0.07, 0.07, 0.02);
        add("box", this.trims.wall, 0.09, 0.58, -0.05, 0.06, 0.16, 0.06);
      });
    if (level >= 2)
      newest = piece(0, (add) => {
        add("box", this.trims.glass, 0, 0.5, 0, 0.3, 0.9, 0.3);
        for (const y of [0.28, 0.5, 0.72]) add("box", paint, 0, y, 0, 0.33, 0.04, 0.33);
        add("box", paint, 0, 0.97, 0, 0.34, 0.06, 0.34);
        add("pole", this.trims.dark, 0.07, 1.25, 0.07, 1, 0.8, 1);
      });
    if (level >= 3)
      newest = piece(1, (add) => {
        add("box", this.trims.wall, 0, 0.13, 0, 0.4, 0.16, 0.4);
        add("drum", paint, 0, 0.42, 0, 0.34, 0.42, 0.34);
        add("drum", this.trims.wall, 0, 0.42, 0, 0.36, 0.06, 0.36);
        add("dome", this.trims.gold, 0, 0.63, 0, 0.38, 0.38, 0.38);
        add("spire", this.trims.gold, 0, 1.0, 0, 0.7, 0.7, 0.7);
      });
    const p = spaceAt(index),
      // The pieces stand in a row on the sea along the inner edge of the space.
      inward = 0.86,
      side = Math.floor(index / SIDE);
    group.position.set(p.x + INWARD[side][0] * inward, 0.004, p.z + INWARD[side][1] * inward);
    group.rotation.y = TURN[side];
    group.scale.setScalar(1.25);
    group.userData.index = index;
    return { group, newest };
  }
  /**
   * Where a traveller stands on a space: two by two on its outer part. On a corner that carries a model (the island,
   * the fund, the rocket) they keep to the three quarters it leaves free, the fourth near the middle.
   */
  private stand(player: number, index: number) {
    const p = spaceAt(index),
      side = Math.floor(index / SIDE),
      [ix, iz] = INWARD[side],
      [rx, rz] = ROAD[side];
    if (index % SIDE === 0 && SPACES[index].kind !== "start") {
      const [jx, jz] = INWARD[(side + 3) % 4],
        [a, b] = [
          [0.28, 0.28],
          [0.28, -0.3],
          [-0.3, 0.28],
          [0.02, 0.02],
        ][player];
      return new T.Vector3(p.x - ix * a - jx * b, TOP, p.z - iz * a - jz * b);
    }
    const along = player % 2 ? 0.27 : -0.27,
      out = player > 1 ? 0.37 : 0.07;
    return new T.Vector3(p.x - ix * out + rx * along, TOP, p.z - iz * out + rz * along);
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, TOUR_SUBJECT);
    this.camera.position.set(0, Math.sin(TOUR_SUBJECT.tilt) * distance, Math.cos(TOUR_SUBJECT.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** A ring that spreads and fades where something has landed. */
  private pulse(at: T.Vector3, color: string, start: number, size = 1) {
    // Like the other things that only decorate, drawn where a graphics card draws (each costs frames elsewhere).
    if (!this.lively) return;
    const ring = this.pulses.find((r) => !r.userData.busy);
    if (!ring) return;
    ring.userData.busy = true;
    const material = ring.material as T.MeshBasicMaterial;
    material.color.set(color);
    this.effects.push({
      start,
      duration: 650,
      update: (p) => {
        ring.visible = p < 1;
        ring.position.set(at.x, at.y + 0.01, at.z);
        ring.scale.setScalar(size * (0.8 + p * 1.3));
        material.opacity = 0.85 * (1 - p) * (1 - p);
        if (p === 1) ring.userData.busy = false;
      },
    });
  }
  /** Rebuilds what changed on the cities; a new building is set down from above and lands with a ring. */
  private dress(state: State, grow: boolean, now: number) {
    state.owners.forEach((owner, index) => {
      const key = owner === -1 ? "" : `${owner}:${state.levels[index]}`;
      if (key === this.built[index]) return;
      this.built[index] = key;
      for (const old of this.buildings.children.filter((c) => c.userData.index === index)) this.buildings.remove(old);
      if (owner === -1) return;
      const { group, newest: building } = this.raise(index, owner, state.levels[index]);
      this.buildings.add(group);
      if (grow) {
        // Only the piece just bought is set down; the others already stand.
        building.visible = false;
        let landed = false;
        const ground = building.position.y;
        this.tweens.push({
          start: now,
          duration: 420,
          update: (p) => {
            building.visible = true;
            building.position.y = ground + 0.8 * fall(p);
            // It squashes a little where it lands.
            const squash = p < 0.8 ? 1 : 1 - 0.1 * Math.sin((Math.PI * (p - 0.8)) / 0.2);
            building.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
            if (!landed && p >= 0.8) {
              landed = true;
              this.onBuilt();
              this.pulse(building.getWorldPosition(new T.Vector3()), PLAYER_COLORS[owner], performance.now(), 0.9);
            }
          },
        });
      }
    });
  }
  private place(state: State) {
    this.halo.visible = state.phase === "key";
    state.players.forEach((player, i) => {
      this.tokens[i].position.copy(this.stand(i, player.at));
      this.tokens[i].rotation.y = restYaw(player.at);
      this.tokens[i].visible = !player.out;
      this.rings[i].visible = i === state.turn && state.phase !== "over" && !player.out;
    });
    this.dice.forEach((die, i) => {
      die.position.copy(this.diceAt[i]);
      die.quaternion.setFromAxisAngle(UP, this.diceYaw[i]).multiply(upright(state.dice[i]));
    });
  }
  /**
   * Money that changed hands, shown as notes flying: from a traveller to whoever was paid (another traveller, the
   * bank's tray, or the peace fund's chest), or to a traveller from the bank or the fund.
   */
  private pay(before: State, state: State, start: number) {
    if (!this.lively) return;
    const change = state.players.map((p, i) => p.money - before.players[i].money),
      payers = change.flatMap((d, i) => (d < 0 ? [i] : [])),
      takers = change.flatMap((d, i) => (d > 0 ? [i] : []));
    if (!payers.length && !takers.length) return;
    const of = (i: number) => this.stand(i, state.players[i].at).setY(0.35),
      mover = state.players[state.actor],
      kind = mover ? SPACES[mover.at]?.kind : undefined,
      fund = SPACES.findIndex((space) => space.kind === "fund"),
      chest = (() => {
        const p = spaceAt(fund),
          [ix, iz] = INWARD[Math.floor(fund / SIDE)];
        return new T.Vector3(p.x + ix * 0.34, 0.3, p.z + iz * 0.34);
      })(),
      // Paid into the fund, or taken from it, the notes go to the chest; otherwise to the bank's tray.
      bank = kind === "fund" || kind === "collect" ? chest : BANK.clone().setY(0.25);
    const flights: [T.Vector3, T.Vector3, number][] = [];
    if (payers.length === 1 && takers.length) {
      for (const t of takers) flights.push([of(payers[0]), of(t), change[t]]);
      const rest = -change[payers[0]] - takers.reduce((sum, t) => sum + change[t], 0);
      if (rest > 0) flights.push([of(payers[0]), bank, rest]);
    } else if (takers.length === 1 && payers.length) for (const p of payers) flights.push([of(p), of(takers[0]), -change[p]]);
    else {
      for (const p of payers) flights.push([of(p), bank, -change[p]]);
      for (const t of takers) flights.push([bank, of(t), change[t]]);
    }
    let n = 0;
    for (const [from, to, amount] of flights) {
      const count = Math.max(2, Math.min(6, Math.round(amount / 80) + 1));
      for (let k = 0; k < count; k++) this.fly(from, to, start + n++ * 70, k);
    }
  }
  /** One note on its way from `from` to `to`, fluttering over an arc. */
  private fly(from: T.Vector3, to: T.Vector3, start: number, k: number) {
    const note = this.notes.find((m) => !m.userData.busy);
    if (!note) return;
    note.userData.busy = true;
    const yaw = Math.atan2(to.x - from.x, to.z - from.z),
      high = 0.9 + from.distanceTo(to) * 0.08,
      wobble = (k % 2 ? 1 : -1) * 0.25;
    this.effects.push({
      start,
      duration: 620,
      update: (p) => {
        note.visible = p < 1;
        const e = p * p * (3 - 2 * p);
        note.position.lerpVectors(from, to, e);
        note.position.y += Math.sin(Math.PI * p) * high;
        note.position.x += Math.sin(Math.PI * p) * wobble;
        note.rotation.set(Math.sin(p * 9 + k) * 0.5, yaw + p * 2.2, Math.cos(p * 7 + k) * 0.35);
        if (p === 1) note.userData.busy = false;
      },
    });
  }
  /** Shows `state`; a roll throws the dice onto the board and hops the traveller along the road. */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    const now = performance.now(),
      quick = !animate || this.reducedMotion || !before;
    if (quick || state.rollId === before.rollId || !state.path.length) {
      this.place(state);
      this.dress(state, !quick, now);
      if (before && animate) this.pay(before, state, now);
      if (!this.tweens.length) this.onSettled();
      return;
    }
    this.place(before);
    for (const ring of this.rings) ring.visible = false;
    const mover = before.turn,
      token = this.tokens[mover];
    // The dice come from the roller's side of the board, land at half a second (when the rattle stops) and roll on
    // a little to where they rest.
    this.dice.forEach((die, i) => {
      const rest = new T.Vector3((i ? 0.52 : -0.52) + (Math.random() - 0.5) * 0.18, 0.3, 2.4 + (Math.random() - 0.5) * 0.36),
        yaw = (Math.random() - 0.5) * 0.9,
        away = new T.Vector3(token.position.x - rest.x, 0, token.position.z - rest.z);
      if (away.lengthSq() < 0.01) away.set(0, 0, 1);
      away.normalize();
      this.diceAt[i].copy(rest);
      this.diceYaw[i] = yaw;
      const from = rest.clone().addScaledVector(away, 2.4).setY(2),
        touch = rest.clone().addScaledVector(away, 0.5),
        axis = new T.Vector3(-away.z, 0, away.x),
        to = new T.Quaternion().setFromAxisAngle(UP, yaw).multiply(upright(state.dice[i])),
        turn = new T.Quaternion(),
        total = (5 + i) * (Math.PI / 2) + 0.7,
        duration = 760,
        land = 500 / duration;
      this.tweens.push({
        start: now + i * 60,
        duration,
        update: (p) => {
          let s: number;
          if (p < land) {
            const q = p / land;
            die.position.lerpVectors(from, touch, q);
            die.position.y = 2 + (0.3 - 2) * q + Math.sin(Math.PI * q) * 0.4;
            s = 0.8 * q;
          } else {
            const r = (p - land) / (1 - land),
              e = 1 - (1 - r) * (1 - r);
            die.position.lerpVectors(touch, rest, e);
            die.position.y = 0.3 + (r < 0.55 ? 0.2 * Math.sin((Math.PI * r) / 0.55) : 0.05 * Math.sin((Math.PI * (r - 0.55)) / 0.45));
            s = 0.8 + 0.2 * e;
          }
          die.quaternion.copy(turn.setFromAxisAngle(axis, -(1 - s) * total)).multiply(to);
        },
      });
    });
    let at = now + 600,
      from = token.position.clone(),
      yaw = token.rotation.y;
    state.path.forEach((index, k) => {
      const start = from.clone(),
        end = this.stand(mover, index),
        facing = yaw,
        ahead = restYaw(index),
        // A flight or a card's order is one long hop, not a walk.
        far = k > 0 && Math.abs(index - state.path[k - 1]) > 1 && !(index === 0 && state.path[k - 1] === SPACES.length - 1);
      let landed = false;
      this.tweens.push({
        start: at,
        duration: far ? 600 : 150,
        update: (p) => {
          token.position.lerpVectors(start, end, travel(p));
          token.position.y = TOP + hop(p) * (far ? 2.2 : 0.34);
          token.rotation.y = turnToward(facing, ahead, Math.min(1, p / 0.5));
          if (!landed && p >= 0.84) {
            landed = true;
            this.onContact();
          }
        },
      });
      at += far ? 600 : 150;
      from = end;
      yaw = ahead;
    });
    this.pulse(from, PLAYER_COLORS[mover], at - 25);
    this.dress(state, true, at);
    this.pay(before, state, at - 60);
  }
  /** Idle life where a graphics card draws: the pieces bob and rock a little, the ring at the cards breathes. */
  private idle(now: number) {
    const t = now / 1000;
    this.models.forEach((model, i) => {
      const m = IDLE[i % 4],
        w = t * m.speed * Math.PI * 2 + i * 1.7;
      model.position.y = m.lift * (1 + Math.sin(w));
      model.rotation.z = m.roll * Math.sin(w * 0.5) * 0.4;
      model.rotation.x = m.pitch * Math.sin(w * 0.5 + 1) * 0.4;
    });
    if (this.halo.visible) {
      this.halo.scale.setScalar(1 + 0.05 * Math.sin(t * 4));
      (this.halo.material as T.MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(t * 4);
    }
  }
  private step(now: number) {
    let moved = false;
    if (this.offered.size) {
      this.paintOffer(now);
      moved = true;
    }
    if (this.tweens.length) {
      this.tweens = this.tweens.filter((t) => {
        const p = Math.min(1, (now - t.start) / t.duration);
        if (p < 0) return true;
        t.update(p);
        return p < 1;
      });
      if (!this.tweens.length && this.state) {
        this.place(this.state);
        this.onSettled();
      }
      moved = true;
    }
    if (this.effects.length) {
      this.effects = this.effects.filter((t) => {
        const p = Math.min(1, (now - t.start) / t.duration);
        if (p < 0) return true;
        t.update(p);
        return p < 1;
      });
      moved = true;
    }
    // Idle life is drawn at most thirty times a second, and not for a captured picture.
    if (this.lively && !moved && now - this.idled > 32 && !document.documentElement.dataset.capture) {
      this.idled = now;
      this.idle(now);
      moved = true;
    } else if (this.lively && moved) this.idle(now);
    return moved;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    this.effects = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
