import * as T from "three";
import { wood, planks, glossy, block, stuff } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BACK, FORE, GHOST, NONE, VAMPIRE, ZOMBIE, counts, sightline, type State } from "./rules";

export const HAUNT_COLORS: [string, string] = ["#e9eef2", "#5a2a6e"];
/** A square's side, the height of the board's top, how far out the numbers lie. */
const CELL = 0.9,
  TOP = 0.12,
  OUT = 0.62,
  /** How large a monster stands on its square. */
  FIGURE = 1.3;
/** The centre of a square. */
export function squareAt(size: number, index: number) {
  const r = Math.floor(index / size),
    c = index % size;
  return { x: (c - (size - 1) / 2) * CELL, z: (r - (size - 1) / 2) * CELL };
}
/** Where the number of line `k` lies, outside the board's edge. */
function clueAt(size: number, k: number) {
  const side = Math.floor(k / size),
    i = k % size,
    half = (size * CELL) / 2 + OUT,
    along = (i - (size - 1) / 2) * CELL;
  return side === 0 ? { x: along, z: -half } : side === 1 ? { x: half, z: along } : side === 2 ? { x: along, z: half } : { x: -half, z: along };
}
type Parts = Record<string, T.BufferGeometry>;
/**
 * A haunted funhouse on a dark table: a board of slate squares in an old frame, mirrors standing corner to corner
 * in carved frames, and three kinds of monsters modelled in code: a ghost in a white sheet, a vampire in a black
 * cape with a tall red collar, and a green zombie with its arms held out. The numbers lie on brass plates round the
 * edge (green once their line is full and right, red when it sees too many), and the three kinds are counted on
 * plates in front of the board.
 */
export class HauntView extends TableView<State> {
  private size = 0;
  private built = "";
  private board = new T.Group();
  private figures = new T.Group();
  private plates: T.Mesh[] = [];
  private parts: Parts = {};
  private paint: Record<string, T.Material> = {};
  private numbers = new Map<string, T.Material>();
  private meshes = new Map<number, T.Group>();
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1b1622");
    this.daylight("#c9c2e6", "#2a2030", "#ffd9a8", 8, 1.9);
    // A warm lamp low at one side, for long shadows.
    const lamp = new T.PointLight("#ffb46a", 9, 14, 1.6);
    lamp.position.set(-4.5, 3.2, -2.5);
    this.scene.add(lamp);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...planks(8, (r) => this.own(r)), color: "#6d5a6e" }), 0, -0.2, 0).castShadow = false;
    this.models();
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.36, 0.41, "#fff2c6");
    this.hintRing = ringMesh(own, 0.35, 0.43, "#ffb21f");
    this.scene.add(this.board, this.figures, this.cursor, this.hintRing);
    this.begin();
  }
  /** The shapes and paints of the mirror and the three monsters, made once and shared. */
  private models() {
    const g = <G extends T.BufferGeometry>(geometry: G) => this.own(geometry),
      // Profiles are written from the top down; a lathe wants them from the bottom up for its faces to look outward.
      lathe = (points: number[][], segments = 32) => g(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)).reverse(), segments));
    // The ghost's sheet: a round head flowing down to a hem that flares out.
    this.parts.sheet = lathe([[0, 0.78], [0.12, 0.775], [0.2, 0.74], [0.25, 0.66], [0.26, 0.52], [0.26, 0.36], [0.28, 0.22], [0.32, 0.1], [0.34, 0.04], [0.3, 0.035]]);
    this.parts.eye = g(new T.SphereGeometry(0.045, 14, 10).scale(1, 1.5, 0.5));
    this.parts.mouth = g(new T.SphereGeometry(0.05, 14, 10).scale(1, 1.3, 0.4));
    // The vampire: a cape like a bell, a pale head, slick hair, a tall collar standing behind the head.
    this.parts.cape = lathe([[0, 0.5], [0.12, 0.5], [0.18, 0.42], [0.24, 0.24], [0.3, 0.03], [0.27, 0], [0, 0]]);
    this.parts.head = g(new T.SphereGeometry(0.15, 22, 16));
    this.parts.hair = g(new T.SphereGeometry(0.155, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.32));
    this.parts.collar = g(new T.CylinderGeometry(0.24, 0.17, 0.26, 24, 1, true, Math.PI * 0.62, Math.PI * 1.76));
    this.parts.fang = g(new T.ConeGeometry(0.014, 0.04, 6).rotateX(Math.PI));
    // The zombie: a ragged body, a green head, two arms held out in front, stitches.
    this.parts.body = g(block(0.3, 0.36, 0.2, 0.04));
    this.parts.leg = g(new T.CapsuleGeometry(0.05, 0.14, 4, 10));
    this.parts.arm = g(new T.CapsuleGeometry(0.045, 0.22, 4, 10).rotateX(Math.PI / 2));
    this.parts.zhead = g(new T.SphereGeometry(0.14, 22, 16).scale(1, 1.08, 1));
    this.parts.stitch = g(new T.BoxGeometry(0.11, 0.012, 0.012));
    this.parts.zeye = g(new T.SphereGeometry(0.03, 12, 8));
    // A mirror: a pane in a carved frame on a little foot.
    this.parts.pane = g(new T.BoxGeometry(CELL * 1.18, 0.52, 0.035));
    this.parts.rail = g(new T.BoxGeometry(CELL * 1.24, 0.06, 0.07));
    this.parts.post = g(new T.BoxGeometry(0.06, 0.6, 0.07));
    this.parts.plate = g(block(0.48, 0.05, 0.48, 0.05));
    this.parts.base = g(new T.CylinderGeometry(0.33, 0.36, 0.04, 32));
    const m = (key: string, material: T.Material) => (this.paint[key] = this.own(material));
    m("sheet", new T.MeshStandardMaterial({ color: "#f6f9fb", roughness: 0.5, emissive: "#a9c2d8", emissiveIntensity: 0.55 }));
    m("ink", new T.MeshStandardMaterial({ color: "#14161c", roughness: 0.4 }));
    m("cape", glossy({ color: "#1c1520", roughness: 0.45 }));
    m("skin", new T.MeshStandardMaterial({ color: "#e8dcd4", roughness: 0.6 }));
    m("hair", new T.MeshStandardMaterial({ color: "#121014", roughness: 0.3 }));
    m("collar", new T.MeshStandardMaterial({ color: "#a3182a", roughness: 0.45, side: T.DoubleSide }));
    m("fang", new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 }));
    m("red", new T.MeshStandardMaterial({ color: "#ff3b30", emissive: "#a00000", emissiveIntensity: 0.6 }));
    m("rag", new T.MeshStandardMaterial({ color: "#5d6b78", roughness: 0.9 }));
    m("trousers", new T.MeshStandardMaterial({ color: "#5a4632", roughness: 0.9 }));
    m("green", new T.MeshStandardMaterial({ color: "#8bb35a", roughness: 0.7 }));
    // A silvered pane that reads as glass under any light: pale, a little blue, a faint sheen of its own.
    m("glass", new T.MeshStandardMaterial({ color: "#c9dfe8", roughness: 0.12, metalness: 0.35, emissive: "#28485a", emissiveIntensity: 0.6 }));
    m("frame", this.standard({ map: this.own(wood(true)), color: "#7a4a2a", roughness: 0.45 }));
    m("brass", new T.MeshStandardMaterial({ color: "#c9a44a", roughness: 0.35, metalness: 0.75 }));
    m("slate", this.standard({ ...stuff("stone", "#4a4550", 3, (r) => this.own(r)), roughness: 0.8 }));
    m("slate2", this.standard({ ...stuff("stone", "#3c3843", 3, (r) => this.own(r)), roughness: 0.8 }));
    m("rim", this.standard({ map: this.own(wood(true)), color: "#5a3a2a", roughness: 0.5 }));
  }
  private mesh(part: string, paint: string, x = 0, y = 0, z = 0, parent?: T.Object3D) {
    const m = new T.Mesh(this.parts[part], this.paint[paint]);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent?.add(m);
    return m;
  }
  /** A monster of a kind, standing on its square, looking toward me. */
  private monster(kind: number) {
    const g = new T.Group();
    if (kind === GHOST) {
      this.mesh("sheet", "sheet", 0, 0.06, 0, g);
      for (const x of [-0.08, 0.08]) this.mesh("eye", "ink", x, 0.63, 0.235, g);
      this.mesh("mouth", "ink", 0, 0.5, 0.25, g);
    } else if (kind === VAMPIRE) {
      this.mesh("cape", "cape", 0, 0, 0, g);
      this.mesh("collar", "collar", 0, 0.58, -0.02, g);
      this.mesh("head", "skin", 0, 0.62, 0.02, g);
      this.mesh("hair", "hair", 0, 0.64, -0.01, g).rotation.x = -0.55;
      for (const x of [-0.05, 0.05]) this.mesh("eye", "red", x, 0.645, 0.15, g).scale.setScalar(0.55);
      for (const x of [-0.03, 0.03]) this.mesh("fang", "fang", x, 0.56, 0.14, g);
    } else if (kind === ZOMBIE) {
      for (const x of [-0.07, 0.07]) this.mesh("leg", "trousers", x, 0.12, 0, g);
      this.mesh("body", "rag", 0, 0.38, 0, g);
      for (const x of [-0.19, 0.19]) this.mesh("arm", "green", x, 0.47, 0.13, g).rotation.x = 0.12;
      const head = this.mesh("zhead", "green", 0.02, 0.69, 0.01, g);
      head.rotation.z = 0.18;
      this.mesh("zeye", "fang", -0.05, 0.72, 0.12, g);
      this.mesh("zeye", "ink", 0.06, 0.7, 0.125, g).scale.setScalar(0.8);
      this.mesh("stitch", "ink", 0, 0.78, 0.12, g).rotation.z = 0.3;
      this.mesh("mouth", "ink", 0.01, 0.62, 0.13, g).scale.set(1.2, 0.5, 1);
    }
    return g;
  }
  /** A mirror standing corner to corner on its square. */
  private mirror(kind: number) {
    const g = new T.Group();
    this.mesh("pane", "glass", 0, 0.34, 0, g);
    this.mesh("rail", "frame", 0, 0.63, 0, g);
    this.mesh("rail", "frame", 0, 0.06, 0, g);
    for (const x of [-CELL * 0.6, CELL * 0.6]) this.mesh("post", "frame", x, 0.33, 0, g);
    g.rotation.y = kind === BACK ? -Math.PI / 4 : Math.PI / 4;
    return g;
  }
  /** A plate with a number painted on it, in the colour for its state. */
  private label(text: string, tone: "plain" | "done" | "over" | "tag") {
    const key = `${text}|${tone}`;
    let material = this.numbers.get(key);
    if (!material) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = tone === "done" ? "#2f7d4a" : tone === "over" ? "#a3241c" : tone === "tag" ? "#2a2230" : "#efe3c2";
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = tone === "plain" ? "#2a1c12" : "#fff6e0";
      ctx.font = `800 ${text.length > 2 ? 58 : 84}px Inter, "Noto Sans KR", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 64, 70);
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      material = this.own(new T.MeshStandardMaterial({ map: texture, roughness: 0.5 }));
      this.numbers.set(key, material);
    }
    return [this.paint.brass, this.paint.brass, material, this.paint.brass, this.paint.brass, this.paint.brass];
  }
  /** Builds the board, its mirrors, the number plates and the count of the kinds, when the puzzle changes. */
  private lay(state: State) {
    const key = `${state.size}:${state.mirror.join("")}:${state.clues.join(",")}`;
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    this.board.clear();
    const n = state.size,
      span = n * CELL;
    const rim = new T.Mesh(this.own(block(span + 0.3, 0.22, span + 0.3)), this.paint.rim);
    rim.castShadow = rim.receiveShadow = true;
    this.board.add(rim);
    for (let i = 0; i < n * n; i++) {
      const p = squareAt(n, i),
        tile = new T.Mesh(this.own(new T.BoxGeometry(CELL * 0.96, 0.03, CELL * 0.96)), (Math.floor(i / n) + (i % n)) % 2 ? this.paint.slate : this.paint.slate2);
      tile.position.set(p.x, TOP - 0.005, p.z);
      tile.receiveShadow = true;
      this.board.add(tile);
      if (state.mirror[i] !== NONE) {
        const mirror = this.mirror(state.mirror[i]);
        mirror.position.set(p.x, TOP, p.z);
        this.board.add(mirror);
      }
    }
    // The number plates, lying flat outside the edge.
    this.plates = state.clues.map((clue, k) => {
      const at = clueAt(n, k),
        plate = new T.Mesh(this.parts.plate, this.label(String(clue), "plain"));
      plate.position.set(at.x, 0.03, at.z);
      plate.castShadow = true;
      this.board.add(plate);
      return plate;
    });
    // In front of the board: each kind of monster with a plate saying how many there are.
    const front = span / 2 + OUT + 0.95;
    [GHOST, VAMPIRE, ZOMBIE].forEach((kind, i) => {
      const x = (i - 1) * 1.45,
        figure = this.monster(kind);
      figure.scale.setScalar(0.95);
      figure.position.set(x - 0.28, 0, front);
      this.board.add(figure);
      const plate = new T.Mesh(this.parts.plate, this.label(`×${state.totals[kind - 1]}`, "tag"));
      plate.position.set(x + 0.22, 0.03, front + 0.05);
      plate.scale.set(0.85, 1, 0.85);
      this.board.add(plate);
    });
    if (resized) this.resize();
  }
  protected subject(aspect: number): TableSubject {
    const half = ((this.size || 4) * CELL) / 2 + OUT + 0.4;
    return { half: aspect < 1 ? half : half + 0.3, halfZ: half + 0.75, height: 0.9, lookY: 0.1, tilt: 1.02 };
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.mirror.flatMap((m, i) => (m === NONE ? [{ ...squareAt(state.size, i), y: TOP, r: CELL * 0.5, point: i }] : []));
  }
  protected place(state: State) {
    this.lay(state);
    this.figures.clear();
    this.meshes.clear();
    state.cells.forEach((kind, i) => {
      if (!kind) return;
      const p = squareAt(state.size, i),
        figure = this.monster(kind);
      figure.scale.setScalar(FIGURE);
      figure.position.set(p.x, TOP, p.z);
      // A monster shown from the start stands on a brass base.
      if (state.fixed[i]) {
        const base = this.mesh("base", "brass", 0, 0.02, 0, figure);
        base.castShadow = false;
        figure.position.y = TOP + 0.02;
      }
      this.figures.add(figure);
      this.meshes.set(i, figure);
    });
    // A number turns green when its line is full and right, red when it already sees too many.
    const seen = counts(state, state.cells);
    state.clues.forEach((clue, k) => {
      const full = sightline(state.size, state.mirror, k).every((s) => state.cells[s.cell]),
        tone = seen[k] > clue ? "over" : full && seen[k] === clue ? "done" : "plain";
      this.plates[k].material = this.label(String(clue), tone);
    });
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1) return false;
    this.place(state);
    const figure = this.meshes.get(state.last);
    if (!figure) return false;
    // The new monster rises out of its square.
    this.tween(0, 260, (p) => {
      const e = 1 - (1 - p) ** 3;
      figure.scale.set(FIGURE, FIGURE * Math.max(0.05, e), FIGURE);
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const ring = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = point !== null && point !== undefined && point >= 0 && point < state.cells.length;
      if (mesh.visible) {
        const p = squareAt(state.size, point!);
        mesh.position.set(p.x, TOP + 0.016, p.z);
      }
    };
    ring(this.cursor, marks.cursor);
    ring(this.hintRing, marks.hint?.to);
  }
}
