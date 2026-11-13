import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { aim, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { DROP, KINDS, MERGE, OVER, RADII, type State } from "./rules";
import { DT, HALF, HAND, HEIGHT, LINE, MAX, createWorld, drop, step, type World } from "./sim";

export const FRUIT_COLORS: [string, string] = ["#e2483d", "#b9b3a4"];
const DEEP = 2.3;
/** A small repeatable source of numbers for the speckles of a skin. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/**
 * The skin of each kind, painted to wrap a ball: left to right goes round
 * it, top to bottom from the stalk to the base.
 */
function skin(kind: number, pen: CanvasRenderingContext2D, w: number, h: number) {
  const random = sequence(kind * 97 + 13),
    wash = (stops: [number, string][]) => {
      const shade = pen.createLinearGradient(0, 0, 0, h);
      for (const [at, color] of stops) shade.addColorStop(at, color);
      pen.fillStyle = shade;
      pen.fillRect(0, 0, w, h);
    },
    dots = (count: number, color: string, size: number) => {
      pen.fillStyle = color;
      for (let i = 0; i < count; i++) {
        pen.beginPath();
        pen.arc(random() * w, h * 0.08 + random() * h * 0.84, size * (0.6 + random() * 0.8), 0, Math.PI * 2);
        pen.fill();
      }
    },
    cap = (color: string, depth: number) => {
      pen.fillStyle = color;
      pen.fillRect(0, 0, w, h * depth);
    };
  if (kind === 0) {
    wash([[0, "#2b3470"], [0.5, "#4558b0"], [1, "#2f3a82"]]);
    dots(60, "rgba(190,205,255,0.16)", 9);
    cap("#1c2250", 0.1);
  } else if (kind === 1) {
    wash([[0, "#8f0d22"], [0.4, "#d81c36"], [1, "#a01028"]]);
    dots(10, "rgba(255,255,255,0.1)", 12);
    cap("#5a3a1e", 0.05);
  } else if (kind === 2) {
    wash([[0, "#5ea02e"], [0.5, "#86cc48"], [1, "#6aae36"]]);
    dots(260, "rgba(60,120,30,0.35)", 1.6);
    cap("#4a7a22", 0.05);
  } else if (kind === 3) {
    wash([[0, "#4a1f5c"], [0.5, "#7a3590"], [1, "#55246a"]]);
    dots(50, "rgba(220,200,255,0.14)", 10);
    cap("#3a2414", 0.05);
  } else if (kind === 4) {
    wash([[0, "#e87a14"], [0.5, "#ff9a2a"], [1, "#ee8418"]]);
    dots(320, "rgba(200,96,0,0.4)", 1.5);
    cap("#4f8a2a", 0.06);
  } else if (kind === 5) {
    wash([[0, "#b81c1c"], [0.45, "#e63a2e"], [0.8, "#e8642e"], [1, "#d8a83a"]]);
    pen.strokeStyle = "rgba(255,214,120,0.3)";
    pen.lineWidth = 3;
    for (let i = 0; i < 46; i++) {
      const x = random() * w,
        y = h * (0.3 + random() * 0.6);
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + (random() - 0.5) * 6, y + 14 + random() * 22);
      pen.stroke();
    }
    cap("#5a3a1e", 0.07);
  } else if (kind === 6) {
    wash([[0, "#f2a24e"], [0.5, "#ffbf6a"], [1, "#f29a5a"]]);
    dots(340, "rgba(214,120,60,0.35)", 1.7);
    dots(14, "rgba(255,120,110,0.16)", 22);
    cap("#b98a3a", 0.05);
  } else if (kind === 7) {
    wash([[0, "#5a3a22"], [0.5, "#8a5e36"], [1, "#60402a"]]);
    pen.lineWidth = 1.4;
    for (let i = 0; i < 700; i++) {
      const x = random() * w,
        y = random() * h;
      pen.strokeStyle = i % 2 ? "rgba(40,24,12,0.4)" : "rgba(190,150,100,0.3)";
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + (random() - 0.5) * 5, y + 8 + random() * 14);
      pen.stroke();
    }
    pen.fillStyle = "#2a1a10";
    for (const x of [0.2, 0.5, 0.8]) {
      pen.beginPath();
      pen.ellipse(x * w, h * 0.16, 13, 8, 0, 0, Math.PI * 2);
      pen.fill();
    }
  } else if (kind === 8) {
    wash([[0, "#a9c877"], [0.5, "#cfe39a"], [1, "#b2cf80"]]);
    pen.strokeStyle = "rgba(246,250,224,0.75)";
    pen.lineWidth = 2;
    for (let i = 0; i < 150; i++) {
      const x = random() * w,
        y = random() * h;
      pen.beginPath();
      pen.moveTo(x, y);
      pen.lineTo(x + (random() - 0.5) * 60, y + (random() - 0.5) * 44);
      pen.stroke();
    }
    cap("#7a8a4a", 0.05);
  } else {
    wash([[0, "#2c7d36"], [0.5, "#3f9a46"], [1, "#2f8238"]]);
    pen.fillStyle = "#17502a";
    for (let stripe = 0; stripe < 10; stripe++) {
      const x = ((stripe + 0.5) / 10) * w;
      pen.beginPath();
      pen.moveTo(x - 3, 0);
      for (let y = 0; y <= h; y += 6) pen.lineTo(x + Math.sin(y * 0.09 + stripe) * 6 + 5 + Math.sin((y / h) * Math.PI) * 5, y);
      for (let y = h; y >= 0; y -= 6) pen.lineTo(x + Math.sin(y * 0.11 + stripe * 2) * 6 - 5 - Math.sin((y / h) * Math.PI) * 5, y);
      pen.closePath();
      pen.fill();
    }
    cap("#5a4a22", 0.03);
  }
}
/**
 * A glass box on a kitchen counter, seen from the front. The view plays
 * the box in real time: the fruit in hand follows the pointer and falls
 * when it is let go, and each drop, each merging and the overflow are
 * reported as moves.
 */
export class FruitView extends TableView<State> {
  private world: World = createWorld(cryptoRandom);
  private skins: T.MeshStandardMaterial[];
  private pool: T.Mesh[] = [];
  private inHand: T.Mesh;
  private coming: T.Mesh;
  private guide: T.Mesh;
  private line: T.Mesh;
  private born = new Map<number, number>();
  private target = 0;
  private held = 0;
  private last = performance.now();
  private left = 0;
  private heard = 0;
  private ticker = 0;
  private paused = false;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9e2d2");
    this.scene.add(new T.HemisphereLight("#ffffff", "#b8a88c", 1.7));
    const sun = new T.DirectionalLight("#fff3dc", 2.0);
    sun.position.set(-5, 14, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -9;
    sun.shadow.camera.right = sun.shadow.camera.top = 12;
    sun.shadow.normalBias = 0.03;
    this.own(sun.shadow);
    this.scene.add(sun);
    // A tiled wall behind and a wooden counter beneath.
    const tiles = document.createElement("canvas");
    tiles.width = tiles.height = 256;
    const pen = tiles.getContext("2d")!;
    pen.fillStyle = "#f3eee2";
    pen.fillRect(0, 0, 256, 256);
    pen.strokeStyle = "#d8cfbd";
    pen.lineWidth = 4;
    for (const at of [0, 128, 256]) {
      pen.strokeRect(at - 128, -2, 128, 130);
      pen.strokeRect(at - 128 + 64, 126, 128, 132);
    }
    const tile = this.own(new T.CanvasTexture(tiles));
    tile.colorSpace = T.SRGBColorSpace;
    tile.wrapS = tile.wrapT = T.RepeatWrapping;
    tile.repeat.set(14, 8);
    const wall = this.add(new T.PlaneGeometry(60, 34), this.standard({ map: tile, roughness: 0.6 }), 0, 10, -DEEP - 2.4);
    wall.castShadow = false;
    const counter = this.own(wood(false, 0.7));
    counter.repeat.set(4, 2);
    this.add(new T.BoxGeometry(60, 0.6, 16), this.standard({ map: counter, roughness: 0.7 }), 0, -0.5, 0).castShadow = false;
    // The box: a base, four panes of glass and a brass rim.
    const glass = this.own(new T.MeshStandardMaterial({ color: "#dff1f5", transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false })),
      brass = this.standard({ color: "#c9a44a", roughness: 0.3, metalness: 0.8 });
    this.add(new T.BoxGeometry(HALF * 2 + 0.5, 0.2, DEEP * 2 + 0.5), this.standard({ color: "#5a3a22", roughness: 0.5 }), 0, -0.1, 0);
    for (const side of [-1, 1]) {
      this.add(new T.BoxGeometry(0.06, HEIGHT, DEEP * 2), glass, side * (HALF + 0.03), HEIGHT / 2, 0).castShadow = false;
      this.add(new T.BoxGeometry(HALF * 2, HEIGHT, 0.06), glass, 0, HEIGHT / 2, side * DEEP).castShadow = false;
      for (const z of [-DEEP, DEEP]) this.add(new T.BoxGeometry(0.1, HEIGHT, 0.1), brass, side * (HALF + 0.03), HEIGHT / 2, z).castShadow = false;
      this.add(new T.BoxGeometry(HALF * 2 + 0.16, 0.1, 0.1), brass, 0, HEIGHT, side * DEEP).castShadow = false;
      this.add(new T.BoxGeometry(0.1, 0.1, DEEP * 2), brass, side * (HALF + 0.03), HEIGHT, 0).castShadow = false;
    }
    // The line fruit must stay under, on the back pane.
    this.line = this.add(new T.BoxGeometry(HALF * 2, 0.09, 0.02), this.own(new T.MeshBasicMaterial({ color: "#e2483d", transparent: true, opacity: 0.8 })), 0, LINE, -DEEP + 0.06);
    this.line.castShadow = false;
    this.guide = this.add(new T.BoxGeometry(0.03, 1, 0.03), this.own(new T.MeshBasicMaterial({ color: "#5a3a22", transparent: true, opacity: 0.4 })), 0, 0, 0);
    this.guide.castShadow = false;
    const ball = this.own(new T.SphereGeometry(1, 36, 24));
    this.skins = RADII.map((_, kind) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      skin(kind, canvas.getContext("2d")!, 512, 256);
      const map = this.own(new T.CanvasTexture(canvas));
      map.colorSpace = T.SRGBColorSpace;
      map.wrapS = T.RepeatWrapping;
      return this.standard({ map, roughness: kind === 7 ? 0.9 : kind === 8 ? 0.7 : 0.32 });
    });
    for (let i = 0; i < MAX + 4; i++) {
      const mesh = new T.Mesh(ball, this.skins[0]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      this.pool.push(mesh);
      this.scene.add(mesh);
    }
    this.inHand = new T.Mesh(ball, this.skins[0]);
    this.coming = new T.Mesh(ball, this.skins[0]);
    this.inHand.castShadow = true;
    // The fruit after this one waits on a saucer beside the box, under a sign.
    const saucer = this.add(new T.CylinderGeometry(0.95, 0.7, 0.14, 40), this.standard({ color: "#f6f2e8", roughness: 0.3 }), HALF + 1.9, 0.07, 0.4),
      sign = document.createElement("canvas");
    saucer.castShadow = true;
    sign.width = 256;
    sign.height = 112;
    const ink = sign.getContext("2d")!;
    ink.fillStyle = "#fffdf6";
    ink.fillRect(0, 0, 256, 112);
    ink.strokeStyle = "#5a3a22";
    ink.lineWidth = 8;
    ink.strokeRect(4, 4, 248, 104);
    ink.fillStyle = "#2a2f38";
    ink.font = `800 64px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.fillText("다음", 128, 60);
    const label = this.own(new T.CanvasTexture(sign));
    label.colorSpace = T.SRGBColorSpace;
    const card = this.add(new T.PlaneGeometry(1.5, 0.66), this.own(new T.MeshBasicMaterial({ map: label })), HALF + 1.9, 2.3, 0.4);
    card.castShadow = false;
    this.scene.add(this.inHand, this.coming);
    // The pointer is followed on the upright plane the fruit lie in.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), 0);
    const el = this.renderer.domElement,
      ray = new T.Raycaster(),
      hit = new T.Vector3();
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed) return;
      aim(ray, e, el, this.camera);
      if (ray.ray.intersectPlane(this.floor, hit)) this.target = hit.x;
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") this.held = -1;
      else if (e.key === "ArrowRight") this.held = 1;
      else if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        this.send();
      }
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key === "ArrowLeft" && this.held < 0) || (e.key === "ArrowRight" && this.held > 0)) this.held = 0;
    });
    el.addEventListener("blur", () => (this.held = 0));
    this.pose(performance.now());
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The box never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.held = 0;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  private report(events: ReturnType<typeof step>, now: number) {
    for (const event of events) {
      if (event.kind === "drop") this.onMove({ from: -1, to: DROP, extra: -1 });
      else if (event.kind === "merge") {
        this.onMove({ from: -1, to: MERGE + event.fruit, extra: -1 });
        if (now - this.heard > 70) {
          this.heard = now;
          this.onContact();
        }
      } else if (event.kind === "over") this.onMove({ from: -1, to: OVER, extra: -1 });
    }
  }
  /** Lets the fruit in hand fall. */
  private send() {
    if (this.running()) {
      this.world.aim = this.target;
      this.report(drop(this.world), performance.now());
    }
  }
  protected dragStart(_point: number, at: { x: number; z: number }) {
    this.target = at.x;
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    this.target = at.x;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    if (at) {
      this.target = at.x;
      this.send();
    }
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (!this.running()) return;
    if (this.held) this.target = Math.max(-HALF, Math.min(HALF, this.world.aim + this.held * 7 * real));
    this.left += Math.min(0.05, real);
    while (this.left >= DT && !this.world.ended) {
      this.left -= DT;
      this.report(step(this.world, this.target), now);
    }
    this.pose(now);
    this.redraw();
  }
  /** Puts every fruit, the one in hand and the one to come where the box has them. */
  private pose(now: number) {
    const { world } = this,
      alive = new Set<number>();
    this.pool.forEach((mesh, i) => {
      const f = world.fruits[i];
      mesh.visible = !!f;
      if (!f) return;
      alive.add(f.id);
      if (!this.born.has(f.id)) this.born.set(f.id, now);
      // A fruit just made swells into its size.
      const grown = Math.min(1, 0.55 + (now - this.born.get(f.id)!) / 260),
        r = RADII[f.kind] * (f.age < 0.01 ? 1 : grown);
      mesh.material = this.skins[f.kind];
      mesh.scale.setScalar(r);
      mesh.position.set(f.x, f.y, 0);
      mesh.rotation.z = f.turn;
    });
    for (const id of this.born.keys()) if (!alive.has(id)) this.born.delete(id);
    const ready = world.wait <= 0 && !world.ended && this.state?.winner === null;
    this.inHand.visible = this.guide.visible = ready;
    this.inHand.material = this.skins[world.held];
    this.inHand.scale.setScalar(RADII[world.held]);
    this.inHand.position.set(world.aim, HAND, 0);
    this.guide.scale.y = HAND - RADII[world.held];
    this.guide.position.set(world.aim, (HAND - RADII[world.held]) / 2, 0);
    this.coming.material = this.skins[world.next];
    this.coming.scale.setScalar(RADII[world.next]);
    this.coming.position.set(HALF + 1.9, 0.14 + RADII[world.next], 0.4);
    (this.line.material as T.MeshBasicMaterial).opacity = world.over > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(now / 120)) : 0.8;
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? HALF + 0.6 : HALF + 3, halfZ: 1, height: HAND + 1.2, lookY: (HAND + 0.6) / 2, tilt: 0.1 };
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new game empties the box.
    if (state.ply === 0 && (this.world.fruits.length || this.world.ended || this.world.wait > 0)) {
      this.world = createWorld(cryptoRandom);
      this.born.clear();
    }
    this.pose(performance.now());
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
// The kinds are counted once, here, so that a new kind without a skin is noticed.
if (RADII.length !== KINDS) throw new Error("every fruit needs a size");
