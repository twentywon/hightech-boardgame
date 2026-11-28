import * as T from "three";
import { block, capable, planks } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import {
  AIM_ACT,
  AIM_MOVE,
  CANCEL,
  CELLS,
  DX,
  DZ,
  JOBS,
  SIDES,
  UNDO,
  WAIT,
  areaOf,
  canonical,
  colOf,
  fieldOf,
  hitsOf,
  neighbour,
  queue,
  rowOf,
  targetsFrom,
  toward,
  type Field,
  type Hit,
  type Job,
  type Last,
  type State,
  type Unit,
} from "./rules";
import { BASE, LEVEL, RIM, TILE, WATER, YAW0, tacticsSubject, tileLocal, tileTop, turned, yawOf } from "./layout";
import { buildDungeon, type Dungeon } from "./dungeon";
import { FACE_YAW, SIDE_COLORS, Shapes, buildFigure, type Figure } from "./figures";

/** A small picture of each kind, for the queue and the status card: drawn as strokes, no letters. */
export const JOB_ICON: Record<Job, string> = {
  knight: `<path d="M6 18 17 7l1.5 1.5L7.5 19.5zM15 5.5l3.5 3.5M5 15.5l3.5 3.5M4 20l2.4-2.4"/>`,
  archer: `<path d="M7 4c7 3 7 13 0 16M7 4v16M5 12h13M15 9.5 18 12l-3 2.5"/>`,
  fire: `<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1.5 1 2 2 2 3 1-2 1-4 1-7z"/>`,
  healer: `<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>`,
  assassin: `<path d="M5 19 15 9M13 5l6 6-2 2-6-6zM4 20l2-1M19 19 9 9"/>`,
  light: `<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/><circle cx="12" cy="12" r="2.6"/>`,
  angel: `<ellipse cx="12" cy="5" rx="4" ry="1.6"/><path d="M12 9v11M12 11c-3-3-6-3-8-1 1 3 4 4 8 3M12 11c3-3 6-3 8-1-1 3-4 4-8 3"/>`,
};
const icon = (job: Job) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${JOB_ICON[job]}</svg>`;
/** A fixed sequence of numbers for scenery and painting (never `crypto`: tests and captures see the same field). */
function sequence(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
type Paint = (ctx: CanvasRenderingContext2D, size: number, rand: () => number) => void;
/** What each tile of the field is drawn with: its top and its sides. */
const TOPS: Record<string, Paint> = {
  grass: (ctx, n, rand) => {
    ctx.fillStyle = "#6aa346";
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 900; k++) {
      ctx.strokeStyle = ["#5a9238", "#7db757", "#4f8530", "#8cc463"][Math.floor(rand() * 4)];
      ctx.lineWidth = 1.2;
      const x = rand() * n,
        y = rand() * n;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4);
      ctx.stroke();
    }
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = rand() < 0.5 ? "#fff6c8" : "#f4d24a";
      ctx.beginPath();
      ctx.arc(rand() * n, rand() * n, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  dirt: (ctx, n, rand) => {
    ctx.fillStyle = "#a57a4e";
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? "120,86,52" : "190,150,104"},0.35)`;
      ctx.beginPath();
      ctx.ellipse(rand() * n, rand() * n, 6 + rand() * 12, 4 + rand() * 8, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < 120; k++) {
      ctx.fillStyle = ["#7c5a38", "#c09a6a", "#6a4c30", "#d1b48a"][Math.floor(rand() * 4)];
      ctx.beginPath();
      ctx.ellipse(rand() * n, rand() * n, 0.8 + rand() * 2.2, 0.6 + rand() * 1.6, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  stone: (ctx, n, rand) => {
    ctx.fillStyle = "#7a766d";
    ctx.fillRect(0, 0, n, n);
    const h = n / 2;
    for (const [x, y] of [
      [0, 0],
      [h, 0],
      [0, h],
      [h, h],
    ]) {
      const g = 160 + Math.floor(rand() * 26);
      ctx.fillStyle = `rgb(${g},${g - 4},${g - 12})`;
      ctx.fillRect(x + 3, y + 3, h - 6, h - 6);
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = `rgba(${rand() < 0.5 ? "90,88,80" : "220,216,204"},0.25)`;
        ctx.fillRect(x + 4 + rand() * (h - 10), y + 4 + rand() * (h - 10), 2, 2);
      }
    }
    ctx.strokeStyle = "rgba(70,66,60,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(h * 0.3, h * 0.2);
    ctx.lineTo(h * 0.5, h * 0.45);
    ctx.lineTo(h * 0.45, h * 0.7);
    ctx.stroke();
  },
  sand: (ctx, n, rand) => {
    ctx.fillStyle = "#c2b182";
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 200; k++) {
      ctx.fillStyle = rand() < 0.5 ? "#ad9c6e" : "#d6c79c";
      ctx.fillRect(rand() * n, rand() * n, 1.5, 1.5);
    }
  },
  deck: (ctx, n, rand) => {
    const boards = 5;
    for (let b = 0; b < boards; b++) {
      const g = rand() * 18;
      ctx.fillStyle = `rgb(${150 + g},${104 + g},${62 + g * 0.6})`;
      ctx.fillRect(0, (b * n) / boards, n, n / boards);
      ctx.fillStyle = "rgba(60,36,18,0.7)";
      ctx.fillRect(0, (b * n) / boards, n, 2);
      ctx.fillStyle = "#3b2a1a";
      for (const x of [8, n - 10]) ctx.fillRect(x, (b * n) / boards + n / boards / 2 - 1, 3, 3);
    }
  },
  earth: (ctx, n, rand) => {
    ctx.fillStyle = "#7a5332";
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = `rgba(${rand() < 0.5 ? "96,64,38" : "140,100,64"},0.5)`;
      ctx.fillRect(0, rand() * n, n, 2 + rand() * 4);
    }
    for (let k = 0; k < 60; k++) {
      ctx.fillStyle = rand() < 0.5 ? "#5e3f25" : "#9a7650";
      ctx.beginPath();
      ctx.arc(rand() * n, rand() * n, 1 + rand() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  bricks: (ctx, n, rand) => {
    ctx.fillStyle = "#6a665e";
    ctx.fillRect(0, 0, n, n);
    const rows = 4,
      h = n / rows;
    for (let r = 0; r < rows; r++)
      for (let c = -1; c < 3; c++) {
        const g = 140 + Math.floor(rand() * 30),
          x = c * (n / 2) + (r % 2 ? n / 4 : 0);
        ctx.fillStyle = `rgb(${g},${g - 5},${g - 14})`;
        ctx.fillRect(x + 2, r * h + 2, n / 2 - 4, h - 4);
      }
  },
};
/** The height of a level-0 column's sides at which a side picture is laid once (taller columns repeat it). */
const SIDE_SPAN = 0.6;
/** What the commands of the ring are called, by their point. */
const RING: { point: number; key: string; word: (healer: boolean) => string }[] = [
  { point: AIM_MOVE, key: "move", word: () => "이동" },
  { point: AIM_ACT, key: "act", word: (healer) => (healer ? "회복" : "공격") },
  { point: UNDO, key: "undo", word: () => "되돌리기" },
  { point: WAIT, key: "wait", word: () => "대기" },
];
type Glow = "move" | "range" | "hit" | "friend" | "heal" | "area";
const GLOW: Record<Glow, [string, number]> = {
  move: ["#5fb4ff", 0.7],
  range: ["#ff4a3d", 0.34],
  area: ["#ffffff", 0.5],
  hit: ["#ff2a1f", 0.78],
  friend: ["#ff9d1f", 0.82],
  heal: ["#4fe08a", 0.7],
};
const additive = (color: string, opacity = 0.9) => new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false });
const ease = (p: number) => p * p * (3 - 2 * p);
/** An ease that runs a little past its end and comes back. */
const backOut = (p: number) => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2;
/** How long the angel's coming takes (`ascend`). */
const ASCENT = 2900;
/** How long the card of a tapped unit stays, unless 상태 pins it. */
export const PICKED_FOR = 3000;
/**
 * 전술 대전's field: a diorama of tiles of grass, dirt and stone at four heights, with water, rocks and trees that
 * cannot be entered, on a wooden plinth on a table; or, in 지하 감옥, a dungeon of dark masonry lit by fire
 * (`buildDungeon`). It is seen from a corner and turned a quarter at a time (↺ ↻, a drag across it, or 시점 전환
 * back). Over the canvas lie the queue of who acts next, a ring of commands by the unit whose turn it is, the cards
 * at the lower right (현재 차례 always; 선택한 유닛 for a unit tapped, for a moment, or aimed at, with what the strike
 * would do), and numbers that rise from what is struck. A tap on a highlighted tile goes to the screen as a pick; a
 * tap elsewhere while choosing cancels; a tap on a unit shows its card.
 */
export class TacticsView extends TableView<State> {
  private field: Field;
  private root = new T.Group();
  private shapes: Shapes;
  private figures: Figure[] = [];
  private tiles: T.Object3D[] = [];
  private overlays: T.Mesh[] = [];
  private glows = {} as Record<Glow, T.MeshBasicMaterial>;
  private activeRing: T.Mesh;
  private cursorRing: T.Mesh;
  private caster = new T.Raycaster();
  private quarter = 0;
  /** The effects of strikes, reused: an arrow, a ball of fire with its flames, a beam, sparkles, a lance of light, a burst. */
  private arrow = new T.Group();
  private orb!: T.Mesh;
  private flames: T.Group[] = [];
  private fireOuter!: T.MeshBasicMaterial;
  private fireInner!: T.MeshBasicMaterial;
  private beam = new T.Group();
  private sparkles: T.Mesh[] = [];
  private pillar!: T.Mesh;
  private burst!: T.Mesh;
  /** The angel's coming: a ring of runes under the healer, motes drawn into her, a shaft from above, rings of light
   * running over the floor, and feathers drifting down. */
  private sigil!: T.Mesh;
  private motes: T.Mesh[] = [];
  private shaft!: T.Mesh;
  private waves: T.Mesh[] = [];
  private plumes: T.Mesh[] = [];
  private layer: HTMLDivElement;
  private queueBar: HTMLDivElement;
  private ring: HTMLDivElement;
  /** The cards at the lower right: the unit whose turn it is, and one tapped or aimed at. */
  private cards: HTMLDivElement;
  private nowCard: HTMLDivElement;
  private pickedCard: HTMLDivElement;
  private confirm: HTMLButtonElement;
  /** 취소, while a tile is being chosen: it stands apart, above the turn buttons, so that it covers no tile. */
  private cancel!: HTMLButtonElement;
  private turners: HTMLButtonElement[] = [];
  /** The unit tapped last, shown for `PICKED_FOR` (or for as long as 상태 pins it), and the tile a mouse rests on. */
  private selected: number | null = null;
  private pinned = false;
  private forget: ReturnType<typeof setTimeout> | null = null;
  /** The turn the cards were last drawn for: when it moves on, the tapped unit is let go. */
  private seenTurn = -1;
  private hovered = -1;
  /** The dungeon's walls and fires, and the clock that makes the fires flicker. */
  private dungeon: Dungeon | null = null;
  private clock = 0;
  private flickered = 0;
  private flickering = false;
  /** The fires' crackle, as a level the screen's sound keeps going (`PointConfig.knock`). */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  /** The keyboard's place on the field, shown once an arrow has been pressed. */
  private keyCell: number | null = null;
  private keyShown = false;
  private pointer = { x: 0, y: 0 };
  private press: { point: number; x: number; turning: boolean; long: boolean; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    variant: string,
    private mode: "local" | "ai",
  ) {
    super(host, quality, fieldOf(variant).id === "dungeon" ? "#050507" : "#2e281f");
    this.field = fieldOf(variant);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.shapes = new Shapes(keep);
    this.scene.add(this.root);
    this.root.rotation.y = YAW0;
    if (this.field.id === "dungeon") {
      this.night();
      this.dungeon = buildDungeon(this.root, this.field, keep, (o) => this.standard(o));
      this.tiles.push(this.dungeon.pick);
    } else {
      // The open fields at evening: a lower, warmer sun under a duskier sky.
      const sun = this.daylight("#d9e2f6", "#4e3f2c", "#ffdcae", 9.5, 2.05);
      sun.position.set(-5, 10, 7);
      this.build(keep);
    }
    // The marks on the field: a glow on each tile, a gold ring under the unit whose turn it is, a white one for the cursor.
    for (const kind of Object.keys(GLOW) as Glow[]) this.glows[kind] = keep(new T.MeshBasicMaterial({ color: GLOW[kind][0], transparent: true, opacity: GLOW[kind][1], depthWrite: false }));
    const pad = keep(block(0.9, 0.01, 0.9, 0.08));
    for (let c = 0; c < CELLS; c++) {
      const mesh = new T.Mesh(pad, this.glows.move);
      const at = tileLocal(c);
      mesh.position.set(at.x, tileTop(this.field.id, c) + 0.012, at.z);
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.root.add(mesh);
      this.overlays.push(mesh);
    }
    this.activeRing = ringMesh(keep, 0.36, 0.44, "#ffd34a");
    this.cursorRing = ringMesh(keep, 0.4, 0.47, "#ffffff");
    this.root.add(this.activeRing, this.cursorRing);
    this.effects(keep);
    // What lies over the canvas.
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    this.layer = document.createElement("div");
    this.layer.className = "tx-layer";
    this.queueBar = document.createElement("div");
    this.queueBar.className = "tx-queue";
    this.queueBar.setAttribute("aria-hidden", "true");
    this.ring = document.createElement("div");
    this.ring.className = "tx-ring";
    this.ring.setAttribute("aria-hidden", "true");
    this.ring.hidden = true;
    for (const command of RING) {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.dataset.cmd = command.key;
      button.className = `tx-cmd tx-${command.key}`;
      button.onclick = (e) => {
        e.stopPropagation();
        this.onPick(command.point);
      };
      this.ring.append(button);
    }
    const info = document.createElement("button");
    info.type = "button";
    info.tabIndex = -1;
    info.dataset.cmd = "info";
    info.className = "tx-cmd tx-info";
    info.textContent = "상태";
    // 상태 pins the tapped unit's card (and shows what each card's unit reaches and does) until it is pressed again.
    info.onclick = () => this.pin(!this.pinned);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.tabIndex = -1;
    cancel.dataset.cmd = "cancel";
    cancel.className = "tx-cmd tx-cancel";
    cancel.textContent = "취소";
    cancel.onclick = () => this.onPick(CANCEL);
    cancel.hidden = true;
    cancel.setAttribute("aria-hidden", "true");
    this.cancel = cancel;
    this.ring.append(info);
    this.confirm = document.createElement("button");
    this.confirm.type = "button";
    this.confirm.tabIndex = -1;
    this.confirm.className = "tx-confirm";
    this.confirm.setAttribute("aria-hidden", "true");
    this.confirm.hidden = true;
    this.confirm.onclick = () => {
      const s = this.state;
      if (s && s.preview >= 0) this.onPick(s.preview);
    };
    this.cards = document.createElement("div");
    this.cards.className = "tx-cards";
    this.cards.setAttribute("aria-hidden", "true");
    this.nowCard = document.createElement("div");
    this.pickedCard = document.createElement("div");
    this.nowCard.className = "tx-card now";
    this.pickedCard.className = "tx-card picked";
    this.pickedCard.hidden = true;
    this.cards.append(this.nowCard, this.pickedCard);
    const turns = document.createElement("div");
    turns.className = "tx-turns";
    for (const [step, label, sign] of [
      [-1, "시점을 왼쪽으로 돌리기", "M8 5H4v4M4.5 8.5A8 8 0 1 1 6 18"],
      [1, "시점을 오른쪽으로 돌리기", "M16 5h4v4M19.5 8.5A8 8 0 1 0 18 18"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tx-turn";
      button.setAttribute("aria-label", label);
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${sign}"/></svg>`;
      button.onclick = () => {
        if (!this.animating) this.turnTo(this.quarter + step);
      };
      turns.append(button);
      this.turners.push(button);
    }
    this.layer.append(this.queueBar, this.ring, this.confirm, this.cancel, this.cards, turns);
    if (this.dungeon) {
      // The dark closes in round the edges of the view.
      const shade = document.createElement("div");
      shade.className = "tx-shade";
      shade.setAttribute("aria-hidden", "true");
      this.layer.prepend(shade);
      this.layer.classList.add("dark");
    }
    host.append(this.layer);
    // The pointer's place on the screen, for a drag that turns the field and a long press that shows a card.
    const el = this.renderer.domElement;
    const track = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    el.addEventListener("pointerdown", (e) => {
      track(e);
      this.keyShown = false;
    }, { capture: true });
    el.addEventListener("pointermove", track, { capture: true });
    el.addEventListener("keydown", (e) => this.key(e));
    el.addEventListener("focus", () => {
      if (this.keyCell === null && this.state) this.keyCell = this.state.units[this.state.active].cell;
    });
    this.begin();
    if (this.dungeon) {
      // Without a graphics card (or under reduced motion) the fires stand still, glowing, and the picture is drawn
      // only when something changes: every frame of flicker would cost the processor a whole picture.
      this.flickering = capable() && !this.reducedMotion;
      this.dungeon.flicker(performance.now(), !this.flickering);
      this.dungeon.facing(this.root.rotation.y);
      this.clock = requestAnimationFrame(this.idle);
    }
  }
  /** Night in the dungeon: a low, cool light from above and a faint one from the eye, so that the units still read. */
  private night() {
    this.scene.add(new T.HemisphereLight("#6f7fa6", "#1a1410", 1.1));
    const moon = new T.DirectionalLight("#a8bae6", 0.9);
    moon.position.set(-4, 11, 5);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = moon.shadow.camera.bottom = -8;
    moon.shadow.camera.right = moon.shadow.camera.top = 8;
    moon.shadow.normalBias = 0.02;
    this.own(moon.shadow);
    this.scene.add(moon);
    const eye = new T.DirectionalLight("#c9c2b4", 0.6);
    eye.position.set(0, 6, 12);
    this.scene.add(eye);
  }
  /** The view's own loop: the fires crackle, and flicker (at most thirty times a second) where they may. */
  private idle = (now: number) => {
    if (this.disposed) return;
    this.clock = requestAnimationFrame(this.idle);
    if (now - this.flickered < 33) return;
    this.flickered = now;
    this.onKnock?.("fire", 1);
    if (!this.flickering) return;
    this.dungeon?.flicker(now, false);
    this.redraw();
  };
  /** The dungeon brings its own light; the reflected room of `realism` would light its dark up. */
  protected photographic() {
    return this.field.id !== "dungeon";
  }
  /** The table, the plinth and every tile with what stands on it. */
  private build(keep: <R extends { dispose(): void }>(r: R) => R) {
    const rand = sequence(this.field.id.length * 7919 + 17),
      textures = new Map<string, T.CanvasTexture>(),
      texture = (kind: string) => {
        let t = textures.get(kind);
        if (!t) {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 128;
          TOPS[kind](canvas.getContext("2d")!, 128, sequence(kind.length * 131 + 5));
          t = keep(new T.CanvasTexture(canvas));
          t.colorSpace = T.SRGBColorSpace;
          t.wrapS = t.wrapT = T.RepeatWrapping;
          t.anisotropy = 4;
          textures.set(kind, t);
        }
        return t;
      },
      paints = new Map<string, T.Material>(),
      paint = (kind: string, roughness = 0.9) => {
        let m = paints.get(kind);
        if (!m) {
          m = this.standard({ map: texture(kind), roughness });
          paints.set(kind, m);
        }
        return m;
      };
    // A wide table under the plinth, and the plinth of dark wood with a lighter lip.
    const table = this.add(new T.PlaneGeometry(60, 60), this.standard({ ...planks(4, keep), color: "#b89a78" }), 0, -0.34, 0);
    table.rotation.x = -Math.PI / 2;
    table.castShadow = false;
    const span = 10 * TILE + RIM * 2,
      plinth = this.add(block(span, 0.34, span, 0.06), this.standard({ ...planks(1.2, keep), color: "#5b3d27" }), 0, -0.17, 0, this.root);
    plinth.castShadow = false;
    this.add(block(span - 0.16, 0.04, span - 0.16, 0.02), this.standard({ color: "#3b2a1e", roughness: 0.9 }), 0, 0.005, 0, this.root).castShadow = false;
    const columns = new Map<string, T.BufferGeometry>(),
      column = (height: number, width = 0.985) => {
        const key = `${height.toFixed(3)}:${width}`;
        let g = columns.get(key);
        if (!g) {
          g = keep(block(width, height, width, 0.035));
          // The sides repeat their picture up a tall column instead of stretching it.
          const uv = g.getAttribute("uv"),
            per = uv.count / 6;
          for (const face of [0, 1, 4, 5]) for (let i = face * per; i < (face + 1) * per; i++) uv.setY(i, (uv.getY(i) * height) / SIDE_SPAN);
          uv.needsUpdate = true;
          columns.set(key, g);
        }
        return g;
      };
    const sideOf = (kind: string) => (kind === "stone" || kind === "rock" ? paint("bricks") : paint("earth")),
      topOf = (kind: string) => paint(kind === "rock" ? "stone" : kind === "tree" ? "grass" : kind),
      turf = keep(block(0.995, 0.07, 0.995, 0.03)),
      grass = paint("grass");
    // A tile's column, with its top; a grass tile has a turf on top whose edge shows green.
    for (let c = 0; c < CELLS; c++) {
      const g = this.field.ground[c],
        at = tileLocal(c);
      let mesh: T.Mesh;
      if (g === "water" || g === "bridge") {
        mesh = this.add(column(0.1), [paint("earth"), paint("earth"), paint("sand"), paint("earth"), paint("earth"), paint("earth")], at.x, 0.05, at.z, this.root);
        mesh.castShadow = false;
      } else {
        const top = BASE + LEVEL * this.field.height[c],
          green = g === "grass" || g === "tree";
        mesh = this.add(column(green ? top - 0.05 : top), [sideOf(g), sideOf(g), topOf(g), sideOf(g), sideOf(g), sideOf(g)], at.x, (green ? top - 0.05 : top) / 2, at.z, this.root);
        if (green) {
          const lid = this.add(turf, grass, at.x, top - 0.035, at.z, this.root);
          lid.userData.cell = c;
          this.tiles.push(lid);
        }
      }
      mesh.userData.cell = c;
      this.tiles.push(mesh);
    }
    // Water: a clear, blue surface over the sand, each tile its own pane.
    const water = this.standard({ color: "#3b82c4", roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.8 }),
      pane = keep(new T.PlaneGeometry(TILE, TILE));
    for (let c = 0; c < CELLS; c++) {
      if (this.field.ground[c] !== "water" && this.field.ground[c] !== "bridge") continue;
      const at = tileLocal(c),
        mesh = this.add(pane, water, at.x, WATER, at.z, this.root);
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = false;
      mesh.userData.cell = c;
      this.tiles.push(mesh);
    }
    // Bridges: a deck of boards across the water, with posts and rails along its sides.
    const deck = paint("deck", 0.8),
      rail = this.standard({ color: "#6b4426", roughness: 0.8 }),
      post = keep(block(0.08, 0.26, 0.08, 0.02)),
      bar = keep(block(0.05, 0.05, 1, 0.015));
    for (let c = 0; c < CELLS; c++) {
      if (this.field.ground[c] !== "bridge") continue;
      const at = tileLocal(c),
        along = [0, 2].some((d) => neighbour(c, d) >= 0 && this.field.ground[neighbour(c, d)] !== "water"),
        y = tileTop(this.field.id, c),
        board = this.add(keep(block(along ? 0.92 : 1.0, 0.07, along ? 1.0 : 0.92, 0.015)), deck, at.x, y - 0.035, at.z, this.root);
      board.userData.cell = c;
      this.tiles.push(board);
      for (const s of [-1, 1]) {
        const ox = along ? s * 0.44 : 0,
          oz = along ? 0 : s * 0.44;
        for (const e of [-0.4, 0.4]) this.add(post, rail, at.x + ox + (along ? 0 : e), y + 0.13, at.z + oz + (along ? e : 0), this.root);
        const r = this.add(bar, rail, at.x + ox, y + 0.24, at.z + oz, this.root);
        if (!along) r.rotation.y = Math.PI / 2;
      }
    }
    // Rocks: grey boulders, two or three to a tile; trees: chunky pines.
    const boulder = keep(new T.IcosahedronGeometry(0.3, 0)),
      stone = this.standard({ color: "#8d8b84", roughness: 0.95, flatShading: true }),
      darkStone = this.standard({ color: "#6f6d68", roughness: 0.95, flatShading: true }),
      trunk = keep(new T.CylinderGeometry(0.06, 0.08, 0.36, 8)),
      bark = this.standard({ color: "#6a4527", roughness: 0.9 }),
      needles = [this.standard({ color: "#2f6b34", roughness: 0.85, flatShading: true }), this.standard({ color: "#3a7d3c", roughness: 0.85, flatShading: true })],
      cones = [0.4, 0.32, 0.22].map((r, k) => keep(new T.ConeGeometry(r, 0.42 - k * 0.04, 7)));
    for (let c = 0; c < CELLS; c++) {
      const g = this.field.ground[c],
        at = tileLocal(c),
        top = BASE + LEVEL * this.field.height[c];
      if (g === "rock")
        for (let k = 0; k < 3; k++) {
          const size = k === 0 ? 1.15 : 0.55 + rand() * 0.3,
            rock = this.add(boulder, k === 1 ? darkStone : stone, at.x + (k ? (rand() - 0.5) * 0.5 : 0), top + 0.18 * size, at.z + (k ? (rand() - 0.5) * 0.5 : 0), this.root);
          rock.scale.set(size, size * (0.75 + rand() * 0.3), size);
          rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
        }
      if (g === "tree") {
        this.add(trunk, bark, at.x, top + 0.18, at.z, this.root);
        const lean = (rand() - 0.5) * 0.08;
        cones.forEach((cone, k) => {
          const leaf = this.add(cone, needles[k % 2], at.x, top + 0.48 + k * 0.26, at.z, this.root);
          leaf.rotation.set(lean, rand() * 3, lean);
        });
      }
    }
  }
  /** The meshes strikes are shown with, hidden until used. */
  private effects(keep: <R extends { dispose(): void }>(r: R) => R) {
    const shaft = new T.Mesh(keep(new T.CylinderGeometry(0.012, 0.012, 0.42, 6).rotateX(Math.PI / 2)), this.standard({ color: "#8a5a30" })),
      head = new T.Mesh(keep(new T.ConeGeometry(0.03, 0.08, 6).rotateX(Math.PI / 2)), this.standard({ color: "#c5ccd5", metalness: 0.6, roughness: 0.3 })),
      feather = new T.Mesh(keep(new T.BoxGeometry(0.05, 0.004, 0.09)), this.standard({ color: "#f2ecd8" }));
    head.position.z = 0.24;
    feather.position.z = -0.18;
    this.arrow.add(shaft, head, feather);
    this.orb = new T.Mesh(keep(new T.SphereGeometry(0.1, 16, 12)), keep(additive("#ff8a2a", 1)));
    const core = new T.Mesh(keep(new T.SphereGeometry(0.06, 12, 8)), keep(additive("#fff2b0", 1)));
    this.orb.add(core);
    // A flame on each tile of the cross: an orange tongue round a yellow core, over a glowing patch.
    const outer = keep(new T.ConeGeometry(0.42, 1, 14, 1, true).translate(0, 0.5, 0)),
      tongue = keep(new T.ConeGeometry(0.24, 0.8, 12, 1, true).translate(0, 0.4, 0)),
      patch = keep(new T.CircleGeometry(0.46, 24).rotateX(-Math.PI / 2));
    this.fireOuter = keep(additive("#ff5a12", 0.95));
    this.fireInner = keep(additive("#ffd44a", 1));
    this.fireOuter.side = this.fireInner.side = T.DoubleSide;
    for (let k = 0; k < 5; k++) {
      const flame = new T.Group();
      flame.add(new T.Mesh(outer, this.fireOuter), new T.Mesh(tongue, this.fireInner), new T.Mesh(patch, this.fireOuter));
      this.flames.push(flame);
    }
    const ray = new T.Mesh(keep(new T.CylinderGeometry(0.1, 0.1, 1, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5)), keep(additive("#ffe27a", 0.8))),
      inner = new T.Mesh(keep(new T.CylinderGeometry(0.04, 0.04, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5)), keep(additive("#ffffff", 1)));
    this.beam.add(ray, inner);
    const sparkle = keep(new T.OctahedronGeometry(0.045)),
      green = keep(additive("#7dffb0", 1));
    for (let k = 0; k < 10; k++) this.sparkles.push(new T.Mesh(sparkle, green));
    // The light column fades as it rises, so that its top is never seen.
    const fade = document.createElement("canvas");
    fade.width = 4;
    fade.height = 64;
    const g = fade.getContext("2d")!,
      ramp = g.createLinearGradient(0, 0, 0, 64);
    ramp.addColorStop(0, "#000");
    ramp.addColorStop(0.75, "#fff");
    ramp.addColorStop(1, "#fff");
    g.fillStyle = ramp;
    g.fillRect(0, 0, 4, 64);
    const column = keep(additive("#ffe9a0", 0.8));
    column.alphaMap = keep(new T.CanvasTexture(fade));
    column.side = T.DoubleSide;
    this.pillar = new T.Mesh(keep(new T.CylinderGeometry(0.32, 0.32, 5, 20, 1, true).translate(0, 2.5, 0)), column);
    this.burst = new T.Mesh(keep(new T.SphereGeometry(0.5, 24, 16)), keep(additive("#ffffff", 0.9)));
    this.heavenly(keep, column.alphaMap!);
    for (const m of this.effectMeshes) {
      m.visible = false;
      m.renderOrder = 6;
      this.root.add(m);
    }
  }
  private get effectMeshes(): T.Object3D[] {
    return [this.arrow, this.orb, ...this.flames, this.beam, ...this.sparkles, this.pillar, this.burst, this.sigil, ...this.motes, this.shaft, ...this.waves, ...this.plumes];
  }
  private hideEffects() {
    for (const m of this.effectMeshes) m.visible = false;
  }
  /** The meshes of the angel's coming (see `sigil`). The ring of runes is painted once, in code: no letters of any script. */
  private heavenly(keep: <R extends { dispose(): void }>(r: R) => R, fade: T.Texture) {
    const size = 512,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const g = canvas.getContext("2d")!,
      c = size / 2;
    g.translate(c, c);
    g.strokeStyle = g.fillStyle = "#fff";
    g.lineCap = "round";
    const circle = (r: number, w: number) => {
      g.lineWidth = w;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    };
    circle(246, 6);
    circle(230, 2.5);
    circle(170, 4);
    circle(156, 2);
    circle(62, 3);
    // A band of marks between the two outer circles: short strokes, dots and little arcs in a fixed order.
    for (let k = 0; k < 48; k++) {
      g.save();
      g.rotate((k / 48) * Math.PI * 2);
      g.lineWidth = 3;
      g.beginPath();
      const kind = k % 4;
      if (kind === 0) {
        // A small diamond, filled.
        g.moveTo(0, -218);
        g.lineTo(7, -200);
        g.lineTo(0, -182);
        g.lineTo(-7, -200);
        g.closePath();
        g.fill();
      } else if (kind === 2) {
        // A triangle pointing outward, open.
        g.moveTo(0, -216);
        g.lineTo(8, -188);
        g.lineTo(-8, -188);
        g.closePath();
      } else {
        // A short tick between two dots.
        g.moveTo(0, -210);
        g.lineTo(0, -190);
        g.moveTo(-9, -200);
        g.arc(-9, -200, 1.5, 0, Math.PI * 2);
        g.moveTo(10.5, -200);
        g.arc(9, -200, 1.5, 0, Math.PI * 2);
      }
      g.stroke();
      g.beginPath();
      g.arc(0, -238, 3, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // Two squares turned against each other make an eight-pointed star, with a small circle at every point.
    g.lineWidth = 4;
    for (const turn of [0, Math.PI / 4]) {
      g.beginPath();
      for (let k = 0; k <= 4; k++) {
        const a = turn + (k / 4) * Math.PI * 2;
        g[k ? "lineTo" : "moveTo"](Math.cos(a) * 156, Math.sin(a) * 156);
      }
      g.stroke();
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(Math.cos(a) * 112, Math.sin(a) * 112, 14, 0, Math.PI * 2);
      g.stroke();
    }
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, 120);
    glow.addColorStop(0, "#ffffffaa");
    glow.addColorStop(1, "#ffffff00");
    g.fillStyle = glow;
    g.fillRect(-c, -c, size, size);
    const rune = keep(additive("#ffd86a", 0));
    rune.map = keep(new T.CanvasTexture(canvas));
    this.sigil = new T.Mesh(keep(new T.PlaneGeometry(2.7, 2.7).rotateX(-Math.PI / 2)), rune);
    const mote = keep(new T.OctahedronGeometry(0.05)),
      warm = keep(additive("#fff1b8", 1)),
      gold = keep(additive("#ffc94a", 1));
    for (let k = 0; k < 30; k++) this.motes.push(new T.Mesh(mote, k % 3 ? warm : gold));
    const core = keep(additive("#ffffff", 0));
    core.alphaMap = fade;
    core.side = T.DoubleSide;
    this.shaft = new T.Mesh(keep(new T.CylinderGeometry(0.16, 0.16, 7, 18, 1, true).translate(0, 3.5, 0)), core);
    const band = keep(new T.RingGeometry(0.82, 1, 56).rotateX(-Math.PI / 2));
    for (let k = 0; k < 3; k++) this.waves.push(new T.Mesh(band, keep(additive(k === 1 ? "#ffffff" : "#ffe08a", 0))));
    const quill = new T.Shape();
    quill.moveTo(0, -0.09);
    quill.bezierCurveTo(0.05, -0.04, 0.045, 0.05, 0, 0.1);
    quill.bezierCurveTo(-0.03, 0.05, -0.035, -0.04, 0, -0.09);
    const down = keep(new T.MeshBasicMaterial({ color: "#fffdf4", transparent: true, opacity: 1, side: T.DoubleSide, depthWrite: false })),
      feather = keep(new T.ShapeGeometry(quill, 6));
    for (let k = 0; k < 16; k++) this.plumes.push(new T.Mesh(feather, down));
  }
  protected subject(aspect: number): TableSubject {
    return tacticsSubject(aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  /** What a ray strikes first: a unit (its tile), or a tile. */
  protected pick(ray: T.Ray) {
    this.scene.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const standing = this.figures.filter((f) => f.group.visible).map((f) => f.body),
      hit = this.caster.intersectObjects([...standing, ...this.tiles], true)[0];
    if (!hit || !this.state) return -1;
    // The dungeon's tiles are one instanced set of boxes, each instance a tile.
    if (hit.instanceId !== undefined && hit.object.userData.cells) return hit.object.userData.cells[hit.instanceId] as number;
    for (let o: T.Object3D | null = hit.object; o; o = o.parent) {
      if (o.userData.cell !== undefined) return o.userData.cell as number;
      if (o.userData.unit !== undefined) return this.state.units[o.userData.unit as number].cell;
    }
    return -1;
  }
  /** Every press is followed: a drag across the field turns it, a long press shows a card, a tap is judged on letting go. */
  protected dragStart(point: number) {
    if (!this.state) return false;
    const press = { point, x: this.pointer.x, turning: false, long: false, timer: setTimeout(() => {}, 0) };
    press.timer = setTimeout(() => {
      if (this.press !== press || press.turning) return;
      press.long = true;
      const unit = this.unitAt(point);
      if (unit) this.select(unit.id);
    }, 480);
    this.press = press;
    return true;
  }
  protected dragMove() {
    const press = this.press;
    if (!press || press.long) return;
    const dx = this.pointer.x - press.x;
    if (!press.turning && Math.abs(dx) > 18) {
      press.turning = true;
      clearTimeout(press.timer);
      this.ring.hidden = true;
      this.confirm.hidden = true;
      this.cancel.hidden = true;
    }
    if (press.turning) {
      this.root.rotation.y = yawOf(this.quarter) + (dx / Math.max(200, this.renderer.domElement.clientWidth)) * Math.PI * 1.3;
      this.face();
      this.redraw();
    }
  }
  protected dragEnd() {
    const press = this.press;
    this.press = null;
    if (!press) return;
    clearTimeout(press.timer);
    if (press.turning) {
      const turned = Math.round((this.root.rotation.y - YAW0) / (Math.PI / 2));
      this.turnTo(turned, this.root.rotation.y);
      return;
    }
    if (!press.long) this.tap(press.point);
  }
  /** A tap: while a tile is being chosen, that tile (or else 취소); otherwise a unit's card. */
  private tap(point: number) {
    const s = this.state;
    if (!s) return;
    const offered = this.marks.targets;
    if (s.aim !== null && offered.length) {
      this.onPick(point >= 0 && point < CELLS && offered.includes(point) ? point : CANCEL);
      return;
    }
    const unit = this.unitAt(point);
    // Another unit shows its card for a moment (tapped again, it goes); the active unit's card is always shown.
    this.select(unit && unit.id !== s.active && !(this.selected === unit.id && !this.pinned) ? unit.id : null);
  }
  private unitAt(cell: number) {
    return cell >= 0 ? this.state?.units.find((u) => u.hp > 0 && u.cell === cell) : undefined;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
    if (this.state?.aim === "attack") this.showCards();
  }
  /** Turns the field to a quarter (counted from the first view), the short way round. */
  private turnTo(quarter: number, from = this.root.rotation.y) {
    const q = ((quarter % 4) + 4) % 4;
    let to = yawOf(q);
    while (to - from > Math.PI) to -= Math.PI * 2;
    while (from - to > Math.PI) to += Math.PI * 2;
    this.quarter = q;
    this.ring.hidden = true;
    this.confirm.hidden = true;
    this.cancel.hidden = true;
    if (this.reducedMotion || Math.abs(to - from) < 1e-4) {
      this.root.rotation.y = yawOf(q);
      if (this.state) this.place(this.state);
      this.mark(this.marks);
      this.redraw();
      return;
    }
    this.tween(0, 380, (p) => {
      this.root.rotation.y = from + (to - from) * ease(p);
      this.face();
    });
  }
  /** Back to the first view (the 시점 전환 over the table). */
  resetView() {
    if (!this.animating) this.turnTo(0);
  }
  /** The health bars face the eye whichever way the field is turned. */
  private face() {
    const q = new T.Quaternion(),
      parent = new T.Quaternion();
    this.scene.updateMatrixWorld(true);
    for (const f of this.figures) {
      f.group.getWorldQuaternion(parent);
      q.copy(parent).invert().multiply(this.camera.quaternion);
      f.bar.quaternion.copy(q);
    }
    this.dungeon?.facing(this.root.rotation.y);
  }
  /** Where a point of the scene falls on the canvas, in its pixels. */
  private screen(v: T.Vector3) {
    const p = v.clone().project(this.camera),
      el = this.renderer.domElement;
    return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
  }
  private figureFor(unit: Unit) {
    let f = this.figures[unit.id];
    if (f && f.job === unit.job) return f;
    if (f) {
      f.group.removeFromParent();
      for (const m of f.paints) m.dispose();
    }
    f = buildFigure(unit.job, unit.side, this.shapes, (r) => this.own(r));
    f.body.userData.unit = unit.id;
    this.root.add(f.group);
    this.figures[unit.id] = f;
    return f;
  }
  /** Lays a unit at rest where `state` has it. */
  private stand(unit: Unit) {
    const f = this.figureFor(unit),
      alive = unit.hp > 0;
    f.group.visible = alive;
    if (!alive) return;
    const at = tileLocal(unit.cell);
    f.group.position.set(at.x, tileTop(this.field.id, unit.cell), at.z);
    f.group.rotation.set(0, FACE_YAW[unit.facing], 0);
    f.group.scale.setScalar(1);
    f.bar.visible = true;
    f.body.position.x = f.body.position.z = 0;
    for (const w of f.wings ?? []) {
      const rest = w.userData.rest as { yaw: number; sx: number };
      w.rotation.y = rest.yaw;
      w.scale.set(rest.sx, 1, 1);
    }
    if (f.halo) {
      f.halo.position.y = 0.85;
      f.halo.scale.setScalar(1);
      f.halo.rotation.y = 0;
    }
    f.fill.scale.x = Math.max(0.001, unit.hp / unit.max);
    for (const m of f.paints) {
      const glow = m.userData.glow as { color: T.Color; intensity: number };
      m.emissive.copy(glow.color);
      m.emissiveIntensity = glow.intensity;
      if (m.opacity !== 1) {
        m.opacity = 1;
        m.transparent = false;
        m.needsUpdate = true;
      }
    }
  }
  protected place(state: State) {
    this.root.rotation.y = yawOf(this.quarter);
    this.hideEffects();
    for (const unit of state.units) this.stand(unit);
    const active = state.units[state.active];
    this.activeRing.visible = state.winner === null && active.hp > 0 && !capturing();
    if (this.activeRing.visible) {
      const at = tileLocal(active.cell);
      this.activeRing.position.set(at.x, tileTop(this.field.id, active.cell) + 0.07, at.z);
    }
    this.face();
    this.drawQueue();
    this.showCards(state);
    this.tell();
  }
  /** What the canvas tells the tests: whose turn it is, where everyone stands, what is offered. */
  private tell() {
    const s = this.state;
    if (!s) return;
    const el = this.renderer.domElement.dataset,
      active = s.units[s.active];
    el.active = String(active.id);
    el.cell = String(active.cell);
    el.side = String(active.side);
    el.job = active.job;
    el.aim = s.aim ?? "";
    el.preview = String(s.preview);
    el.turns = String(s.turns);
    el.quarter = String(this.quarter);
    el.queue = queue(s, 8).join(",");
    el.units = s.units.map((u) => `${u.id}:${u.cell}:${u.hp}`).join(",");
    el.field = this.field.id;
  }
  /** The next eight to act, across the top. */
  private drawQueue() {
    const s = this.state;
    if (!s || capturing() || s.winner !== null) {
      this.queueBar.hidden = true;
      return;
    }
    this.queueBar.hidden = false;
    const order = queue(s, 8);
    this.queueBar.innerHTML =
      `<span class="tx-queue-label">다음 차례</span>` +
      order
        .map((id, k) => {
          const u = s.units[id];
          return `<span class="tx-chip side-${u.side}${k === 0 ? " now" : ""}" style="--hp:${Math.round((100 * u.hp) / u.max)}%">${icon(u.job)}<i></i></span>`;
        })
        .join("");
  }
  /** Shows the card of a tapped unit (null lets it go): for `PICKED_FOR`, or for as long as 상태 pins it. */
  private select(id: number | null) {
    this.selected = id;
    this.arm();
    this.showCards();
    this.relayRing();
  }
  /** 상태: the tapped unit's card stays, and each card tells what its unit reaches and does; again, and it goes on. */
  private pin(on: boolean) {
    this.pinned = on;
    this.arm();
    this.showCards();
    this.relayRing();
  }
  private arm() {
    if (this.forget) clearTimeout(this.forget);
    this.forget = null;
    if (this.selected === null || this.pinned) return;
    this.forget = setTimeout(() => {
      this.forget = null;
      this.selected = null;
      this.showCards();
      this.relayRing();
    }, PICKED_FOR);
  }
  /** The ring laid again round the active unit, clear of the cards (which change size). */
  private relayRing() {
    if (!this.animating) this.layoutRing(this.marks.targets);
  }
  /**
   * What the strike being aimed would do, and to whom: the unit on the tile shown (or, for a blast or a beam, the
   * first it catches), or the one a mouse rests on among the targets.
   */
  private aimed(s: State): { unit: Unit; hit: Hit } | null {
    if (s.aim !== "attack" || s.winner !== null) return null;
    const me = s.units[s.active],
      offered = targetsFrom(s, me, me.cell),
      hoverUnit = this.unitAt(this.hovered),
      tile = hoverUnit && offered.includes(hoverUnit.cell) ? canonical(s, me.cell, me, hoverUnit.cell) : s.preview;
    if (tile < 0) return null;
    const hits = hitsOf(s, me, me.cell, tile),
      at = this.unitAt(hoverUnit && offered.includes(hoverUnit.cell) ? hoverUnit.cell : tile),
      hit = hits.find((h) => h.id === at?.id) ?? hits.find((h) => h.id !== me.id) ?? hits[0];
    return hit ? { unit: s.units[hit.id], hit } : null;
  }
  /** The cards at the lower right: 현재 차례 always, and 선택한 유닛 for a unit aimed at or tapped. */
  private showCards(s = this.state) {
    if (!s || capturing()) {
      this.cards.hidden = true;
      return;
    }
    if (s.turns !== this.seenTurn) {
      // The turn has moved on: the tapped unit goes, and so does the pin.
      if (this.seenTurn >= 0 && (this.selected !== null || this.pinned)) {
        this.selected = null;
        this.pinned = false;
        this.arm();
      }
      this.seenTurn = s.turns;
    }
    this.cards.hidden = false;
    this.ring.querySelector<HTMLElement>('[data-cmd="info"]')?.classList.toggle("on", this.pinned);
    const active = s.units[s.active];
    this.nowCard.hidden = s.winner !== null || active.hp <= 0;
    if (!this.nowCard.hidden) this.fill(this.nowCard, s, active, "현재 차례", null);
    const aim = this.aimed(s),
      chosen = this.selected !== null ? s.units[this.selected] : null;
    if (chosen && chosen.hp <= 0) this.selected = null;
    const other = aim ? aim.unit : chosen && chosen.hp > 0 && chosen.id !== s.active ? chosen : null;
    this.pickedCard.hidden = !other || s.winner !== null;
    if (other && !this.pickedCard.hidden) this.fill(this.pickedCard, s, other, aim ? (aim.hit.heal ? "회복할 대상" : "공격 대상") : "선택한 유닛", aim?.hit ?? null);
  }
  /** One card: an emblem of the unit's job in its side's colour, its name, health, numbers and the way it looks. */
  private fill(card: HTMLDivElement, s: State, unit: Unit, tag: string, hit: Hit | null) {
    const stats = JOBS[unit.job],
      who = this.mode === "ai" ? (unit.side === 0 ? "나" : "컴퓨터") : `플레이어 ${unit.side + 1}`,
      looks = ["홍군 쪽", "동쪽", "청군 쪽", "서쪽"][unit.facing],
      // The way it looks, as the field is seen now: up the screen is away from the eye.
      way = turned(DX[unit.facing], DZ[unit.facing], this.quarter),
      angle = (Math.atan2(way.x, -way.z) * 180) / Math.PI,
      power = unit.job === "healer" ? ["회복", "14"] : unit.job === "angel" ? ["공격", "즉사"] : ["공격", String(stats.power)],
      hurt = hit && !hit.heal ? unit.side === s.units[s.active].side ? "friend" : "foe" : "heal",
      expect = hit
        ? `<div class="tx-expect ${hurt}">${hit.heal ? `회복 +${hit.amount}` : `${hurt === "friend" ? "아군 피해" : "예상 피해"} −${hit.amount}`}${hit.fell ? " · 쓰러짐" : ""}${!hit.heal && hit.from !== "front" ? ` · ${hit.from === "back" ? "뒤에서" : "옆에서"}` : ""}</div>`
        : "";
    card.className = `tx-card ${card === this.nowCard ? "now" : "picked"} side-${unit.side}`;
    card.dataset.unit = String(unit.id);
    card.dataset.job = unit.job;
    card.style.setProperty("--hp", `${(100 * unit.hp) / unit.max}%`);
    card.innerHTML =
      `<div class="tx-tag">${tag}</div>` +
      `<div class="tx-head"><span class="tx-badge">${icon(unit.job)}</span><b>${stats.name}</b><small>${SIDES[unit.side]} · ${who}</small></div>` +
      `<div class="tx-hp"><i></i><span>${unit.hp}/${unit.max}</span></div>` +
      `<dl class="tx-stats"><div><dt>${power[0]}</dt><dd>${power[1]}</dd></div><div><dt>방어</dt><dd>${stats.def}</dd></div><div><dt>속도</dt><dd>${stats.speed}</dd></div><div><dt>이동</dt><dd>${stats.move}</dd></div></dl>` +
      `<div class="tx-look"><svg viewBox="-12 -12 24 24"><g transform="scale(1 .62) rotate(${angle.toFixed(0)})"><circle r="9.5"/><path d="M0-8 5 1H2v6h-4V1h-3z"/></g></svg>바라봄 · ${looks}</div>` +
      expect +
      (this.pinned ? `<p class="tx-reach"><b>사거리</b> ${stats.reach}</p><p class="tx-note">${stats.note}</p>` : "");
  }
  protected mark(marks: Marks) {
    const s = this.state;
    if (!s) return;
    const offered = marks.targets,
      cells = offered.filter((c) => c >= 0 && c < CELLS),
      unit = s.units[s.active],
      kinds = new Map<number, Glow>();
    if (s.aim === "move") for (const c of cells) kinds.set(c, "move");
    if (s.aim === "attack") {
      for (const c of cells) kinds.set(c, "range");
      if (s.preview >= 0) {
        const hits = hitsOf(s, unit, unit.cell, s.preview),
          area = areaOf(s, unit, unit.cell, s.preview);
        for (const c of area) kinds.set(c, "area");
        for (const h of hits) {
          const v = s.units[h.id],
            at = v.id === unit.id ? unit.cell : v.cell;
          kinds.set(at, h.heal ? "heal" : v.side === unit.side ? "friend" : "hit");
        }
      }
    }
    this.overlays.forEach((mesh, c) => {
      const kind = kinds.get(c);
      mesh.visible = !!kind && !capturing();
      if (kind) mesh.material = this.glows[kind];
    });
    // The cursor: the keyboard's place once an arrow has been pressed, else the tile a mouse rests on while choosing.
    const cursor = this.keyShown && this.keyCell !== null ? this.keyCell : s.aim !== null && cells.includes(this.hovered) ? this.hovered : null;
    this.cursorRing.visible = cursor !== null && !capturing();
    if (cursor !== null) {
      const at = tileLocal(cursor);
      this.cursorRing.position.set(at.x, tileTop(this.field.id, cursor) + 0.03, at.z);
    }
    this.renderer.domElement.dataset.targets = cells.join(",");
    this.layoutRing(offered);
    this.redraw();
  }
  /** The ring of commands round the unit whose turn it is, kept inside the canvas. */
  private layoutRing(offered: number[]) {
    const s = this.state,
      choosing = !!s && s.aim !== null,
      commands = offered.some((p) => p === AIM_MOVE || p === AIM_ACT || p === WAIT || p === UNDO || p === CANCEL);
    if (!s || !commands || this.animating || capturing() || s.winner !== null) {
      this.ring.hidden = true;
      this.confirm.hidden = true;
      this.cancel.hidden = true;
      return;
    }
    const unit = s.units[s.active],
      f = this.figures[unit.id];
    if (!f) return;
    const at = new T.Vector3();
    f.group.getWorldPosition(at);
    at.y += 0.6;
    const el = this.renderer.domElement,
      w = el.clientWidth,
      h = el.clientHeight,
      small = h < 520,
      rx = small ? 62 : 74,
      ry = small ? 34 : 40,
      p = this.screen(at),
      y = Math.min(h - ry - (small ? 40 : 50), Math.max(ry + (small ? 70 : 96), p.y));
    let x = Math.min(w - rx - 52, Math.max(rx + 52, p.x));
    // The ring keeps clear of the cards at the lower right: it slides left of them when it would cover them.
    const clear = this.clearOfCards(x, y, rx + 52, ry + (small ? 36 : 44));
    x = clear;
    this.ring.hidden = false;
    this.ring.classList.toggle("choosing", choosing);
    this.ring.style.left = `${x}px`;
    this.ring.style.top = `${y}px`;
    this.ring.style.setProperty("--rx", `${rx}px`);
    this.ring.style.setProperty("--ry", `${ry}px`);
    for (const command of RING) {
      const button = this.ring.querySelector<HTMLButtonElement>(`[data-cmd="${command.key}"]`)!;
      button.textContent = command.word(unit.job === "healer");
      button.disabled = !offered.includes(command.point);
      button.hidden = choosing;
    }
    this.ring.querySelector<HTMLElement>('[data-cmd="info"]')!.hidden = choosing;
    this.ring.hidden = choosing;
    this.cancel.hidden = !choosing;
    // While a strike is shown, a button over its target makes it.
    this.confirm.hidden = !(s.aim === "attack" && s.preview >= 0);
    if (!this.confirm.hidden) {
      const target = tileLocal(s.preview),
        v = new T.Vector3(target.x, tileTop(this.field.id, s.preview) + 1.65, target.z);
      this.root.localToWorld(v);
      const q = this.screen(v);
      this.confirm.textContent = unit.job === "healer" ? "회복!" : "공격!";
      const cy = Math.min(h - 30, Math.max(small ? 64 : 90, q.y));
      this.confirm.style.left = `${this.clearOfCards(Math.min(w - 50, Math.max(50, q.x)), cy - 18, 54, 20)}px`;
      this.confirm.style.top = `${cy}px`;
    }
  }
  /** `x`, or further left if a box `halfW` by `halfH` round (x, y) on the canvas would cover the cards. */
  private clearOfCards(x: number, y: number, halfW: number, halfH: number) {
    if (this.cards.hidden) return x;
    const canvas = this.renderer.domElement.getBoundingClientRect();
    let left = Infinity,
      top = Infinity,
      bottom = -Infinity;
    for (const card of [this.nowCard, this.pickedCard]) {
      if (card.hidden) continue;
      const r = card.getBoundingClientRect();
      if (!r.width) continue;
      left = Math.min(left, r.left - canvas.left);
      top = Math.min(top, r.top - canvas.top);
      bottom = Math.max(bottom, r.bottom - canvas.top);
    }
    if (left === Infinity || y + halfH < top - 6 || y - halfH > bottom + 6 || x + halfW < left - 6) return x;
    return Math.max(halfW, left - 8 - halfW);
  }
  /** The keyboard: arrows walk the tiles as seen, Enter taps, and a key for each command. */
  private key(e: KeyboardEvent) {
    const s = this.state;
    if (!s) return;
    const arrows: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 },
      commands: Record<string, number> = { m: AIM_MOVE, a: AIM_ACT, w: WAIT, u: UNDO, Backspace: UNDO };
    if (e.key in arrows) {
      e.preventDefault();
      this.keyShown = true;
      const from = this.keyCell ?? s.units[s.active].cell,
        d = (arrows[e.key] + this.quarter) % 4,
        r = rowOf(from) + DZ[d],
        c = colOf(from) + DX[d];
      if (r >= 0 && r < 10 && c >= 0 && c < 10) this.keyCell = r * 10 + c;
      this.mark(this.marks);
      const unit = this.unitAt(this.keyCell!);
      if (unit && unit.id !== s.active) this.select(unit.id);
      if (s.aim === "attack") this.showCards();
    } else if (e.key === "Enter" || e.key === " ") {
      if (this.keyCell !== null) this.tap(this.keyCell);
    } else if (e.key === "Escape") {
      if (s.aim !== null) this.onPick(CANCEL);
      else {
        this.pinned = false;
        this.select(null);
      }
    } else if (commands[e.key.length === 1 ? e.key.toLowerCase() : e.key] !== undefined) {
      e.preventDefault();
      this.onPick(commands[e.key.length === 1 ? e.key.toLowerCase() : e.key]);
    } else if (e.key === "i" || e.key === "I") {
      const unit = this.unitAt(this.keyCell ?? -1);
      if (unit && unit.id !== s.active) this.selected = unit.id;
      this.pin(!this.pinned);
    } else if (e.key === "q" || e.key === "Q" || e.key === "e" || e.key === "E") {
      if (!this.animating) this.turnTo(this.quarter + (e.key.toLowerCase() === "e" ? 1 : -1));
    }
  }
  /** Runs `fn` once, `delay` milliseconds from now, as part of the animation. */
  private at(delay: number, fn: () => void) {
    let done = false;
    this.tween(delay, 1, (p) => {
      if (p >= 1 && !done) {
        done = true;
        fn();
      }
    });
  }
  /** A point of a unit on the field (before turning): its tile's top, raised by `y`. */
  private local(cell: number, y = 0) {
    const at = tileLocal(cell);
    return new T.Vector3(at.x, tileTop(this.field.id, cell) + y, at.z);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || last === before.last) return false;
    if (last.kind === "wait") return false;
    this.ring.hidden = true;
    this.confirm.hidden = true;
    this.cancel.hidden = true;
    const f = this.figures[last.unit];
    if (!f) return false;
    if (last.kind === "move" || last.kind === "undo") {
      this.walk(f, last);
      return true;
    }
    this.strike(before, state, last, f);
    return true;
  }
  /** A walk along its path, a hop at each step (higher for a climb), or a quick hop back for a move taken back. */
  private walk(f: Figure, last: Last) {
    const path = last.path!,
      flying = last.job === "angel",
      step = last.kind === "undo" ? 320 : flying ? 120 : 150;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = this.local(path[i]),
        b = this.local(path[i + 1]),
        rise = Math.abs(b.y - a.y),
        lift = last.kind === "undo" ? 0.4 : flying ? 0.35 : 0.1 + rise * 1.1,
        facing = last.kind === "undo" ? null : FACE_YAW[toward(path[i], path[i + 1], 0)];
      this.tween(i * step, step, (p) => {
        const e = last.kind === "undo" ? ease(p) : p;
        f.group.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + Math.sin(Math.PI * p) * lift, a.z + (b.z - a.z) * e);
        if (facing !== null) f.group.rotation.y = facing;
      });
    }
    this.at((path.length - 1) * step, () => this.onContact());
  }
  /** A strike: the striker turns and lunges, or looses an arrow, a ball of fire, a beam or a lance of light; then the hits. */
  private strike(before: State, state: State, last: Last, f: Figure) {
    const striker = before.units[last.unit],
      target = last.target!,
      from = this.local(striker.cell),
      to = this.local(target, 0.4);
    f.group.rotation.y = FACE_YAW[toward(striker.cell, target, striker.facing)];
    this.scene.updateMatrixWorld(true);
    const hand = f.body.localToWorld(f.hand.clone());
    this.root.worldToLocal(hand);
    let impact = 140;
    switch (last.job) {
      case "knight":
      case "assassin": {
        const dir = to.clone().sub(from).setY(0).normalize();
        this.tween(0, 320, (p) => {
          const k = Math.sin(Math.PI * p) * 0.32;
          f.group.position.set(from.x + dir.x * k, from.y, from.z + dir.z * k);
          f.body.rotation.x = Math.sin(Math.PI * p) * 0.25;
        });
        this.at(330, () => (f.body.rotation.x = 0));
        impact = 150;
        break;
      }
      case "archer": {
        const length = from.distanceTo(to),
          flight = 260 + 55 * length,
          height = 0.35 + length * 0.18,
          a = hand.clone();
        impact = 160 + flight;
        this.tween(160, flight, (p) => {
          const pos = a.clone().lerp(to, p);
          pos.y += Math.sin(Math.PI * p) * height;
          const ahead = a.clone().lerp(to, Math.min(1, p + 0.02));
          ahead.y += Math.sin(Math.PI * Math.min(1, p + 0.02)) * height;
          this.arrow.visible = p < 1;
          this.arrow.position.copy(pos);
          this.arrow.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), ahead.sub(pos).normalize());
        });
        break;
      }
      case "fire": {
        const length = from.distanceTo(to),
          rise = 200,
          flight = 300 + 40 * length,
          a = hand.clone(),
          top = a.clone().setY(a.y + 0.35);
        impact = rise + flight;
        this.tween(0, rise, (p) => {
          this.orb.visible = true;
          this.orb.position.copy(a).lerp(top, ease(p));
          this.orb.scale.setScalar(0.5 + p * 0.6);
        });
        this.tween(rise, flight, (p) => {
          const pos = top.clone().lerp(to, p);
          pos.y += Math.sin(Math.PI * p) * (0.4 + length * 0.12);
          this.orb.position.copy(pos);
          this.orb.visible = p < 1;
        });
        const area = last.area ?? [target];
        area.forEach((cell, k) => {
          const flame = this.flames[k],
            base = this.local(cell, 0.02);
          this.tween(impact, 640, (p) => {
            flame.visible = p < 1;
            flame.position.copy(base);
            flame.scale.set(0.7 + p * 0.5, 0.25 + Math.sin(Math.PI * Math.min(1, p * 1.3)) * 1.25, 0.7 + p * 0.5);
            this.fireOuter.opacity = 0.95 * (1 - p * p);
            this.fireInner.opacity = 1 - p;
          });
        });
        break;
      }
      case "light": {
        const area = last.area ?? [target],
          end = this.local(area[area.length - 1], 0.4),
          a = hand.clone(),
          length = a.distanceTo(end) + 0.4;
        impact = 170;
        this.beam.position.copy(a);
        this.beam.lookAt(this.root.localToWorld(end.clone()));
        this.tween(0, 640, (p) => {
          this.beam.visible = p < 1;
          const grow = Math.min(1, p / 0.27),
            fade = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
          this.beam.scale.set(fade, fade, Math.max(0.001, length * grow));
        });
        break;
      }
      case "healer": {
        const centre = this.local(target, 0.05);
        impact = 280;
        this.sparkles.forEach((spark, k) => {
          const turn = (k / this.sparkles.length) * Math.PI * 2;
          this.tween(k * 30, 720, (p) => {
            spark.visible = p < 1;
            const r = 0.32 * (1 - p * 0.4);
            spark.position.set(centre.x + Math.cos(turn + p * 4) * r, centre.y + p * 0.95, centre.z + Math.sin(turn + p * 4) * r);
            spark.scale.setScalar(1 - p * 0.6);
          });
        });
        break;
      }
      case "angel": {
        const base = this.local(target, 0);
        impact = 300;
        this.tween(0, 640, (p) => {
          this.pillar.visible = p < 1;
          this.pillar.position.copy(base);
          const fall = Math.min(1, p / 0.45);
          this.pillar.position.y = base.y + (1 - fall) * 3;
          this.pillar.scale.set(p < 0.45 ? 0.5 : 0.5 + (p - 0.45) * 1.2, 1, p < 0.45 ? 0.5 : 0.5 + (p - 0.45) * 1.2);
          (this.pillar.material as T.MeshBasicMaterial).opacity = 0.85 * (p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55);
        });
        break;
      }
    }
    this.at(impact, () => {
      this.onContact();
      // The cards take the blow as it lands.
      this.showCards(state);
    });
    let end = impact;
    for (const hit of last.hits ?? []) {
      const was = before.units[hit.id],
        now = state.units[hit.id],
        g = this.figures[hit.id];
      if (!g) continue;
      const start = was.hp / was.max,
        finish = now.hp / now.max;
      this.tween(impact, 320, (p) => (g.fill.scale.x = Math.max(0.001, start + (finish - start) * p)));
      this.at(impact, () => this.number(hit.id, hit.heal ? `+${hit.amount}` : `-${hit.amount}`, hit.heal ? "heal" : "hurt", hit.heal ? "" : hit.from === "back" ? "뒤에서" : hit.from === "side" ? "옆에서" : ""));
      if (!hit.heal) {
        // A flash of white and a shudder.
        this.tween(impact, 300, (p) => {
          const k = 1 - p;
          for (const m of g.paints) {
            const glow = m.userData.glow as { color: T.Color; intensity: number };
            m.emissive.copy(glow.color).lerp(WHITE, k);
            m.emissiveIntensity = glow.intensity + (1.4 - glow.intensity) * k;
          }
          g.body.position.x = Math.sin(p * Math.PI * 6) * 0.05 * k;
        });
      }
      if (hit.fell) {
        const y = this.local(was.cell).y;
        this.at(impact + 280, () => {
          for (const m of g.paints) {
            m.transparent = true;
            m.needsUpdate = true;
          }
        });
        this.tween(impact + 290, 620, (p) => {
          for (const m of g.paints) m.opacity = 1 - p;
          g.group.position.y = y - p * 0.22;
          g.bar.visible = p < 0.3;
        });
        end = Math.max(end, impact + 910);
      } else end = Math.max(end, impact + 320);
    }
    // A healer left alone turns into the angel (`ascend`).
    for (const id of last.angels ?? []) {
      this.ascend(state.units[id], end + 150);
      end += 150 + ASCENT;
    }
  }
  /**
   * The angel's coming, from `begin` for `ASCENT` milliseconds. A ring of runes opens under the healer and turns, motes
   * of light are drawn into her as she rises, glowing and turning faster; a shaft of light comes down on her; at the
   * flash she is the angel, high in the shaft, coming down onto her tile as her wings unfold and her halo settles,
   * while rings of light run out over the floor and feathers drift down.
   */
  private ascend(unit: Unit, begin: number) {
    const healer = this.figures[unit.id],
      ground = this.local(unit.cell, 0.03),
      centre = this.local(unit.cell, 0.45),
      flash = begin + 1150,
      white = new T.Color("#fff6d8");
    this.at(begin, () => this.onKnock?.("angel", 1));
    // The ring of runes: it opens, turns all along and fades at the end.
    this.tween(begin, ASCENT, (p) => {
      const m = this.sigil.material as T.MeshBasicMaterial,
        t = p * ASCENT;
      this.sigil.visible = p < 1;
      this.sigil.position.copy(ground);
      this.sigil.scale.setScalar(0.2 + 0.8 * ease(Math.min(1, t / 520)) + 0.15 * Math.max(0, (t - 1150) / (ASCENT - 1150)));
      this.sigil.rotation.y = p * Math.PI * 1.4;
      const pulse = t > 1150 && t < 1500 ? 0.35 * (1 - (t - 1150) / 350) : 0;
      m.opacity = Math.min(1, t / 380) * (t > ASCENT - 800 ? (ASCENT - t) / 800 : 1) + pulse;
    });
    // Motes of light spiral in from round the tile and up into her.
    this.tween(begin + 120, 1030, (p) => {
      const t = p * 1030;
      this.motes.forEach((mote, k) => {
        const own = Math.min(1, Math.max(0, (t - (k % 8) * 55) / 620)),
          q = own * own,
          a = k * 2.399 + own * 4.5,
          r = (1.05 + (k % 4) * 0.13) * (1 - q);
        mote.visible = own > 0 && own < 1 && p < 1;
        mote.position.set(centre.x + Math.cos(a) * r, ground.y + (0.08 + (k % 5) * 0.2) * (1 - q) + 0.55 * q, centre.z + Math.sin(a) * r);
        mote.scale.setScalar(0.6 + 0.8 * Math.sin(own * Math.PI));
        mote.rotation.set(own * 6, own * 9, 0);
      });
    });
    // The healer rises a little, turns ever faster and glows white before the flash.
    if (healer) {
      const y = healer.group.position.y,
        yaw = healer.group.rotation.y;
      this.tween(begin, flash - begin, (p) => {
        const e = ease(p);
        healer.group.position.y = y + 0.32 * e;
        healer.group.rotation.y = yaw + p * p * Math.PI * 5;
        healer.bar.visible = p < 0.2;
        for (const m of healer.paints) {
          const glow = m.userData.glow as { color: T.Color; intensity: number };
          m.emissive.copy(glow.color).lerp(white, e);
          m.emissiveIntensity = glow.intensity + e * 2.4;
        }
      });
    }
    // The shaft of light comes down from above, and widens and fades after the flash.
    this.tween(begin + 450, ASCENT - 450, (p) => {
      const t = p * (ASCENT - 450),
        fall = ease(Math.min(1, t / 650)),
        after = Math.min(1, Math.max(0, (t - 760) / 620)),
        outer = this.pillar.material as T.MeshBasicMaterial,
        core = this.shaft.material as T.MeshBasicMaterial;
      this.pillar.visible = this.shaft.visible = p < 1;
      this.pillar.position.set(centre.x, ground.y + (1 - fall) * 5, centre.z);
      this.shaft.position.copy(this.pillar.position);
      this.pillar.scale.set(0.7 + after * 1.6, 1, 0.7 + after * 1.6);
      this.shaft.scale.set(0.6 + after * 2.2, 1, 0.6 + after * 2.2);
      outer.opacity = 0.85 * fall * (1 - after);
      core.opacity = fall * (1 - after) * (t < 700 ? 0.7 : 1);
    });
    // The flash: a ball of light, the screen white for a moment, the picture shaken.
    this.tween(flash, 650, (p) => {
      this.burst.visible = p < 1;
      this.burst.position.copy(centre);
      this.burst.scale.setScalar(0.5 + ease(p) * 3.4);
      (this.burst.material as T.MeshBasicMaterial).opacity = (1 - p) ** 2;
    });
    this.at(flash, () => {
      this.glare(centre);
      // She is the angel now, high in the shaft, small, with wings folded and her halo above her.
      const angel = this.figureFor(unit);
      this.stand(unit);
      this.face();
      angel.bar.visible = false;
    });
    this.tween(flash, ASCENT - (flash - begin), (p) => {
      const angel = this.figures[unit.id];
      if (!angel || angel.job !== "angel") return;
      const t = p * (ASCENT - (flash - begin)),
        down = ease(Math.min(1, t / 1150)),
        grow = Math.min(1, t / 700);
      angel.group.position.y = this.local(unit.cell).y + 1.05 * (1 - down) + 0.05 * Math.sin(t / 140) * (1 - down);
      angel.group.scale.setScalar(p < 1 ? backOut(grow) * 0.65 + 0.35 : 1);
      angel.bar.visible = t > 1250 || p >= 1;
      const glow = Math.max(0, 1 - t / 1300);
      for (const m of angel.paints) {
        const rest = m.userData.glow as { color: T.Color; intensity: number };
        m.emissive.copy(rest.color).lerp(white, glow);
        m.emissiveIntensity = rest.intensity + glow * 2.6;
      }
      // The wings unfold from folded behind her, past their rest and back, and beat once.
      const open = Math.min(1, Math.max(0, (t - 180) / 820));
      for (const w of angel.wings ?? []) {
        const rest = w.userData.rest as { yaw: number; sx: number },
          beat = open >= 1 ? 0.18 * Math.sin(Math.min(1, (t - 1000) / 500) * Math.PI) : 0;
        w.rotation.y = rest.yaw + rest.sx * (1.35 * (1 - backOut(open)) - beat);
        const k = 0.15 + 0.85 * ease(open);
        w.scale.set(rest.sx * k, k, 1);
      }
      // The halo comes down from high over her, large and spinning, onto her head.
      if (angel.halo) {
        const settle = ease(Math.min(1, Math.max(0, (t - 250) / 900)));
        angel.halo.position.y = 0.85 + 0.55 * (1 - settle);
        angel.halo.scale.setScalar(1 + 1.6 * (1 - settle));
        angel.halo.rotation.y = (1 - settle) * Math.PI * 6;
      }
    });
    // Rings of light run out over the floor, one after another.
    this.waves.forEach((wave, k) => {
      this.tween(flash + k * 210, 950, (p) => {
        wave.visible = p < 1;
        wave.position.copy(ground).setY(ground.y + 0.02 + k * 0.01);
        wave.scale.setScalar(0.3 + ease(p) * (3.4 + k * 0.6));
        (wave.material as T.MeshBasicMaterial).opacity = (k === 1 ? 0.75 : 0.95) * (1 - p) * (1 - p);
      });
    });
    // Sparks thrown out by the flash: the motes again, flying up and outward and falling away.
    this.tween(flash, 900, (p) => {
      this.motes.forEach((mote, k) => {
        const a = k * 2.399,
          speed = 1.2 + (k % 5) * 0.35,
          q = 1 - (1 - p) * (1 - p);
        mote.visible = p < 1;
        mote.position.set(centre.x + Math.cos(a) * speed * q, centre.y + 0.1 + (0.6 + (k % 3) * 0.4) * q - 1.1 * p * p, centre.z + Math.sin(a) * speed * q);
        mote.scale.setScalar(1.5 * (1 - p));
      });
    });
    // Feathers drift down round her, swaying and turning, and fade as they reach the floor.
    const fall = ASCENT - (flash - begin) - 150,
      down = this.plumes[0].material as T.MeshBasicMaterial;
    this.tween(flash + 150, fall, (p) => {
      const t = p * fall;
      down.opacity = p > 0.7 ? (1 - p) / 0.3 : 1;
      this.plumes.forEach((plume, k) => {
        const own = Math.min(1, Math.max(0, (t - (k % 6) * 70) / (fall - 420))),
          a = k * 2.399,
          r = 0.35 + (k % 4) * 0.28 + own * 0.25,
          sway = Math.sin(own * Math.PI * 3 + k) * 0.18;
        plume.visible = own > 0 && p < 1;
        plume.position.set(centre.x + Math.cos(a) * r + sway, ground.y + 0.06 + (1.7 + (k % 3) * 0.35) * (1 - own), centre.z + Math.sin(a) * r);
        plume.rotation.set(Math.sin(own * 7 + k) * 0.8, own * 5 + k, Math.cos(own * 5 + k) * 0.9);
        plume.scale.setScalar(1.7 + (k % 3) * 0.35);
      });
    });
  }
  /** A white flash over the whole picture, a glow round the angel and a short shake (decoration only). */
  private glare(at: T.Vector3) {
    if (capturing()) return;
    const world = at.clone().applyMatrix4(this.root.matrixWorld),
      p = this.screen(world),
      flash = document.createElement("div"),
      halo = document.createElement("div");
    flash.className = "tx-flash";
    halo.className = "tx-holy";
    halo.style.left = `${p.x}px`;
    halo.style.top = `${p.y}px`;
    for (const el of [flash, halo]) el.setAttribute("aria-hidden", "true");
    this.layer.append(flash, halo);
    const canvas = this.renderer.domElement;
    canvas.classList.remove("tx-quake");
    void canvas.offsetWidth;
    canvas.classList.add("tx-quake");
    setTimeout(() => {
      flash.remove();
      halo.remove();
      canvas.classList.remove("tx-quake");
    }, 1700);
  }
  /** A number rising from a unit that was struck or healed. */
  private number(id: number, text: string, kind: "hurt" | "heal", note: string) {
    const g = this.figures[id];
    if (!g || capturing()) return;
    const at = new T.Vector3();
    g.group.getWorldPosition(at);
    at.y += 1.3;
    const p = this.screen(at),
      label = document.createElement("span");
    label.className = `tx-num ${kind}`;
    label.setAttribute("aria-hidden", "true");
    label.style.left = `${p.x}px`;
    label.style.top = `${p.y}px`;
    label.textContent = text;
    if (note) {
      const small = document.createElement("small");
      small.textContent = note;
      label.append(small);
    }
    this.layer.append(label);
    setTimeout(() => label.remove(), 1500);
  }
  dispose() {
    if (this.press) clearTimeout(this.press.timer);
    if (this.forget) clearTimeout(this.forget);
    cancelAnimationFrame(this.clock);
    this.layer.remove();
    super.dispose();
  }
}
const WHITE = new T.Color("#ffffff");
export const TACTICS_COLORS: [string, string] = SIDE_COLORS;
