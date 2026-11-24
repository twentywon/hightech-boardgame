import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { afterGPUFrame, aim, wood, realism, glossy, capable, block, fall, hop, travel } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import type { PointView } from "../../ui/point-game";
import type { Marks } from "../points/view";
import { STORE, play, type State } from "./rules";
import { market, type Market } from "./market";
import { zoomable } from "../../engine/zoom";

export const MANCALA_SUBJECT: Subject & { tilt: number } = { half: 5.9, halfZ: 4.6, height: 0.8, lookY: 0, tilt: 1.0 };
/** How deep the pits are cut into the plank. */
const DEPTH = 0.46,
  GAP = 1.3,
  ROW = 0.85,
  STORE_X = 4.75,
  /** The top of the plank, where a tap is aimed. */
  TOP = 0.1 + DEPTH,
  PIT_R = 0.54,
  STORE_RX = 0.56,
  STORE_RZ = 1.4,
  /** How deep the turned cups go below the top. */
  CUP = 0.4,
  STORE_CUP = 0.42;
/** Centre of a pit or store on the board. */
export function pitAt(pit: number) {
  if (pit === STORE[0]) return { x: STORE_X, z: 0 };
  if (pit === STORE[1]) return { x: -STORE_X, z: 0 };
  // The near row runs left to right; the far row comes back right to left.
  return pit < 6 ? { x: (pit - 2.5) * GAP, z: ROW } : { x: (9.5 - pit) * GAP, z: -ROW };
}
/** The glass beads' colours. */
const BEADS = ["#2f86c4", "#d2462e", "#e8b23a", "#3a9a5c", "#8a4fc0", "#eef0f2", "#1fa3a0"];
/** Every bead on the board: they keep who they are as they are sown. */
const TOTAL = 48;
/** Time between one bead's landing and the next, and how long the first takes (as before the beads were carried). */
const SOW_STEP = 430,
  FIRST = 400,
  LIFT = 150,
  DROP = 130,
  /** How high the handful is carried over the board. */
  CARRY = TOP + 0.78,
  FLY = 480;
const isStore = (pit: number) => STORE.includes(pit);
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
}
const capturing = () => typeof document !== "undefined" && document.documentElement.dataset.capture === "1";
const ease = (p: number) => p * p * (3 - 2 * p);
/** A painted swirl for the glass beads: the bead's own colour is laid over it. */
function swirl() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#dedede";
  ctx.fillRect(0, 0, 128, 64);
  for (let k = 0; k < 5; k++) {
    ctx.strokeStyle = k % 2 ? "rgba(255,255,255,0.9)" : "rgba(190,190,190,0.6)";
    ctx.lineWidth = 3 + (k % 3) * 2;
    ctx.beginPath();
    for (let x = -8; x <= 136; x += 4) ctx.lineTo(x, 32 + Math.sin(x / 14 + k * 1.3) * (10 + k * 3));
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.RepeatWrapping;
  return t;
}
/** The inside of a cup: half an ellipsoid turned on a lathe, open at the top. */
function cupGeometry(radius: number, depth: number) {
  const points: T.Vector2[] = [];
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * (Math.PI / 2);
    points.push(new T.Vector2(Math.max(0.0001, radius * Math.cos(a)), TOP + 0.004 - depth * Math.sin(a)));
  }
  return new T.LatheGeometry(points, 32);
}
/** A mancala board carved from one plank, with deep cups and a store at each end, on a carpet in a desert market. */
export class MancalaView implements PointView<State> {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 90);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  /** The beads, one instanced mesh; where each lies, and which pit holds which. */
  private beads: T.InstancedMesh;
  private at: T.Vector3[] = [];
  private lean: number[] = [];
  private contents: number[][] = Array.from({ length: 14 }, () => []);
  private counts: HTMLCanvasElement;
  private countTexture: T.CanvasTexture;
  private inlay: HTMLCanvasElement;
  /** Counts as the beads now show them (they change as each bead lands), and the pits that took beads in the last move. */
  private shown: number[] = [];
  private fresh = new Set<number>();
  private rings: Record<"target" | "path" | "end" | "take" | "cursor" | "won", T.Mesh[]>;
  private tweens: Tween[] = [];
  private state: State | null = null;
  private marks: Marks = { movable: [], selected: null, targets: [], removable: [], cursor: null };
  private hovered = -1;
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), -TOP);
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  private market: Market;
  /** Whether the table keeps its own clock (the lamps flicker): only where a graphics card draws. */
  private live: boolean;
  private matrix = new T.Matrix4();
  private turn = new T.Quaternion();
  private one = new T.Vector3(1, 1, 1);
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  onPick: (point: number) => void = () => {};
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
  ) {
    const rich = capable();
    this.live = rich && !this.reducedMotion;
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#d9b97c");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // A late-afternoon desert sun, low from the right and behind, softened by the awning.
    this.scene.add(new T.HemisphereLight("#fff0d0", "#b98a4e", 2.0));
    const sun = new T.DirectionalLight("#ffe9c4", 2.7);
    sun.position.set(6, 10, -3.5);
    sun.castShadow = true;
    // Under software drawing a smaller shadow map keeps the frame near the old one's cost.
    sun.shadow.mapSize.set(rich ? 2048 : 1024, rich ? 2048 : 1024);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.market = market(this.scene, (r) => this.own(r), rich);
    this.buildBoard();
    realism(this.renderer, this.scene);
    // The beads: glass gems, flat underneath, each with its own colour and turn.
    const gem = this.own(new T.SphereGeometry(0.15, 16, 10).scale(1, 0.62, 1));
    this.beads = new T.InstancedMesh(gem, this.own(glossy({ color: "#ffffff", map: this.own(swirl()), roughness: 0.1, metalness: 0.05 })), TOTAL);
    this.beads.castShadow = true;
    this.beads.receiveShadow = true;
    this.beads.frustumCulled = false;
    const tint = new T.Color();
    for (let b = 0; b < TOTAL; b++) {
      this.beads.setColorAt(b, tint.set(BEADS[(b * 5 + (b >> 3)) % BEADS.length]));
      this.at.push(new T.Vector3());
      this.lean.push(((b * 137) % 360) * (Math.PI / 180));
      this.contents[Math.floor(b / 4) + (Math.floor(b / 4) >= 6 ? 1 : 0)].push(b);
    }
    this.scene.add(this.beads);
    // The number of beads in each pit, painted on a turned bone disc beside it, over the board's inlay.
    this.inlay = this.paintInlay();
    this.counts = document.createElement("canvas");
    this.counts.width = 1024;
    this.counts.height = 512;
    this.countTexture = this.own(new T.CanvasTexture(this.counts));
    this.countTexture.colorSpace = T.SRGBColorSpace;
    if (rich) this.countTexture.anisotropy = 4;
    const labels = new T.Mesh(
      this.own(new T.PlaneGeometry(11.6, 5.8)),
      this.own(new T.MeshBasicMaterial({ map: this.countTexture, transparent: true, depthWrite: false })),
    );
    labels.rotation.x = -Math.PI / 2;
    labels.position.y = TOP + 0.045;
    labels.renderOrder = 6;
    this.scene.add(labels);
    // Marks: pits I may sow (cream), where the beads of the pit under the pointer would go (pale), where the last
    // one would land (gold for another turn, orange otherwise), the pit it would take from (red), the keyboard's place.
    const ringGeometry = (inner: number, outer: number) => this.own(new T.RingGeometry(inner, outer, 48).rotateX(-Math.PI / 2));
    const paint = (color: string, opacity: number) =>
      this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    const set = (count: number, inner: number, outer: number, color: string, opacity: number, y: number) =>
      Array.from({ length: count }, () => {
        const mesh = new T.Mesh(ringGeometry(inner, outer), paint(color, opacity));
        mesh.position.y = y;
        mesh.renderOrder = 4;
        mesh.visible = false;
        this.scene.add(mesh);
        return mesh;
      });
    this.rings = {
      target: set(6, 0.56, 0.64, "#fff3c4", 0.95, TOP + 0.05),
      path: set(14, 0.5, 0.545, "#ffffff", 0.7, TOP + 0.052),
      end: set(1, 0.47, 0.6, "#ffcf3a", 1, TOP + 0.054),
      take: set(1, 0.47, 0.6, "#ff5a3c", 1, TOP + 0.054),
      cursor: set(1, 0.6, 0.7, "#4a7fd0", 0.95, TOP + 0.056),
      won: set(1, 0.6, 0.72, "#ffd75a", 1, TOP + 0.05),
    };
    this.arrange(this.contents.map((c) => c.length));
    this.paintCounts();
    const el = this.renderer.domElement;
    const pitUnder = (e: PointerEvent) => {
      aim(this.ray, e, el, this.camera);
      const hit = new T.Vector3();
      if (!this.ray.ray.intersectPlane(this.ground, hit)) return -1;
      let best = -1,
        nearest = 0.66;
      for (let pit = 0; pit < 14; pit++) {
        const p = pitAt(pit),
          d = Math.hypot(p.x - hit.x, p.z - hit.z);
        if (d < nearest && !isStore(pit)) {
          nearest = d;
          best = pit;
        }
      }
      return best;
    };
    let down: { pointer: number; x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      down = e.pointerType === "mouse" && e.button !== 0 ? null : { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (this.disposed || this.animating || tap?.pointer !== e.pointerId) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
      this.onPick(pitUnder(e));
    });
    // A mouse over a pit I may sow shows where its beads would go.
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.disposed) return;
      const pit = pitUnder(e);
      if (pit === this.hovered) return;
      this.hovered = pit;
      this.showMarks();
    });
    el.addEventListener("pointerleave", () => {
      this.hovered = -1;
      this.showMarks();
    });
    el.style.cursor = "pointer";
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const moved = this.step(performance.now());
      if (this.live) this.flicker(now / 1000);
      if (!this.dirty && !moved && !this.live) return;
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
  /** The board: a thick plank with rounded edges on a darker plinth, turned cups and stores, and brass hinges. */
  private buildBoard() {
    const standard = (options: T.MeshStandardMaterialParameters) => this.own(new T.MeshStandardMaterial({ roughness: 0.85, ...options }));
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
      const mesh = new T.Mesh(this.own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    const timber = standard({ map: this.own(wood()), color: "#b97a4a", roughness: 0.5 }),
      inside = standard({ map: this.own(wood()), color: "#8a5532", roughness: 0.6, side: T.DoubleSide }),
      plinth = standard({ map: this.own(wood(true)), color: "#a0704e", roughness: 0.55 }),
      brass = standard({ color: "#c9a14a", roughness: 0.3, metalness: 0.85 });
    // A plinth a little wider than the plank, so the board steps down to the carpet.
    add(block(11.75, 0.14, 3.85, 0.06), plinth, 0, 0.07, 0);
    // The plank: rounded corners, the pits cut right through, each pit lined by a turned cup.
    const plank = new T.Shape(),
      hw = 5.7,
      hd = 1.75,
      r = 0.7;
    plank.moveTo(-hw + r, -hd);
    plank.lineTo(hw - r, -hd);
    plank.quadraticCurveTo(hw, -hd, hw, -hd + r);
    plank.lineTo(hw, hd - r);
    plank.quadraticCurveTo(hw, hd, hw - r, hd);
    plank.lineTo(-hw + r, hd);
    plank.quadraticCurveTo(-hw, hd, -hw, hd - r);
    plank.lineTo(-hw, -hd + r);
    plank.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    for (let pit = 0; pit < 14; pit++) {
      const p = pitAt(pit),
        hole = new T.Path();
      // Shape coordinates: y is −z on the board.
      if (isStore(pit)) hole.absellipse(p.x, -p.z, STORE_RX, STORE_RZ, 0, Math.PI * 2, true);
      else hole.absarc(p.x, -p.z, PIT_R, 0, Math.PI * 2, true);
      plank.holes.push(hole);
    }
    const top = add(
      new T.ExtrudeGeometry(plank, { depth: DEPTH - 0.03, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3, curveSegments: 28 }),
      timber,
      0,
      0.1,
      0,
    );
    top.rotation.x = -Math.PI / 2;
    const cups: T.BufferGeometry[] = [];
    for (let pit = 0; pit < 14; pit++) {
      const p = pitAt(pit),
        cup = isStore(pit) ? cupGeometry(STORE_RX - 0.035, STORE_CUP).scale(1, 1, STORE_RZ / STORE_RX) : cupGeometry(PIT_R - 0.035, CUP);
      cups.push(cup.translate(p.x, 0, p.z));
    }
    const cupMesh = new T.Mesh(this.own(mergeGeometries(cups)!), inside);
    cups.forEach((c) => c.dispose());
    cupMesh.receiveShadow = true;
    this.scene.add(cupMesh);
    // Brass hinges where the two halves of the board fold, front and back.
    for (const z of [-1, 1]) add(block(0.62, 0.22, 0.03, 0.01), brass, 0, 0.33, z * (hd + 0.035));
  }
  /** The board's inlay of bone and brass, painted once under the counts. */
  private paintInlay() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d")!,
      px = (x: number) => 512 + (x * 1024) / 11.6,
      pz = (z: number) => 256 + (z * 512) / 5.8;
    const lozenge = (x: number, z: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.moveTo(px(x - w), pz(z));
      ctx.lineTo(px(x), pz(z - h));
      ctx.lineTo(px(x + w), pz(z));
      ctx.lineTo(px(x), pz(z + h));
      ctx.closePath();
    };
    for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) {
      lozenge(x, 0, 0.3, 0.26);
      ctx.fillStyle = "#b8893a";
      ctx.fill();
      lozenge(x, 0, 0.22, 0.18);
      ctx.fillStyle = "#efe2c6";
      ctx.fill();
      lozenge(x, 0, 0.08, 0.07);
      ctx.fillStyle = "#7a2a1e";
      ctx.fill();
    }
    // Small brass studs between the last pits and the stores, and rosettes in the corners.
    ctx.fillStyle = "#c9a14a";
    for (const x of [-3.98, 3.98])
      for (const z of [-0.25, 0, 0.25]) {
        ctx.beginPath();
        ctx.arc(px(x), pz(z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
    for (const x of [-5.25, 5.25])
      for (const z of [-1.4, 1.4]) {
        ctx.fillStyle = "#b8893a";
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          ctx.beginPath();
          ctx.ellipse(px(x) + Math.cos(a) * 7, pz(z) + Math.sin(a) * 7, 6, 3, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#efe2c6";
        ctx.beginPath();
        ctx.arc(px(x), pz(z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    return c;
  }
  /** Where the `index`th bead of a pit lies: in rings up the curve of the cup, then in layers. */
  private spot(pit: number, index: number) {
    const store = isStore(pit),
      per = store ? 14 : 8,
      layer = Math.floor(index / per),
      i = index % per,
      rho = (store ? 0.72 : 0.62) * Math.sqrt((i + 0.5) / per),
      angle = i * 2.4 + layer * 1.3 + pit,
      p = pitAt(pit),
      depth = store ? STORE_CUP : CUP,
      floor = TOP - depth * Math.sqrt(Math.max(0, 1 - Math.min(1, rho + 0.2) ** 2));
    return new T.Vector3(
      p.x + Math.cos(angle) * rho * (store ? STORE_RX : PIT_R),
      floor + 0.095 + layer * 0.15,
      p.z + Math.sin(angle) * rho * (store ? STORE_RZ : PIT_R),
    );
  }
  /** Lays the beads out as `board` counts them, keeping each bead where it was as far as it can. */
  private arrange(board: number[]) {
    const spare: number[] = [];
    this.contents.forEach((list, pit) => {
      while (list.length > board[pit]) spare.push(list.pop()!);
    });
    this.contents.forEach((list, pit) => {
      while (list.length < board[pit] && spare.length) list.push(spare.pop()!);
    });
    this.contents.forEach((list, pit) => list.forEach((b, k) => this.at[b].copy(this.spot(pit, k))));
    this.shown = board.slice();
    this.place();
  }
  /** Writes every bead's place into the instanced mesh; a bead near a cup's wall leans in with it. */
  private place() {
    const axis = new T.Vector3(),
      euler = new T.Euler();
    for (let b = 0; b < TOTAL; b++) {
      const p = this.at[b];
      euler.set(0, this.lean[b], 0);
      {
        // Lean into the cup: find the pit nearest and tip toward its middle by how far out the bead lies.
        let near = 0,
          best = Infinity;
        for (let pit = 0; pit < 14; pit++) {
          const q = pitAt(pit),
            d = (q.x - p.x) ** 2 + ((q.z - p.z) * (isStore(pit) ? STORE_RX / STORE_RZ : 1)) ** 2;
          if (d < best) {
            best = d;
            near = pit;
          }
        }
        const q = pitAt(near);
        axis.set(q.z - p.z, 0, p.x - q.x);
        const out = Math.sqrt(best) / PIT_R;
        if (out < 1.2 && axis.lengthSq() > 1e-6) {
          this.turn.setFromAxisAngle(axis.normalize(), -0.45 * out);
          this.turn.multiply(new T.Quaternion().setFromEuler(euler));
        } else this.turn.setFromEuler(euler);
      }
      this.beads.setMatrixAt(b, this.matrix.compose(p, this.turn, this.one));
    }
    this.beads.instanceMatrix.needsUpdate = true;
    this.dirty = true;
  }
  private paintCounts() {
    const ctx = this.counts.getContext("2d")!,
      s = this.state,
      won = s && s.winner !== null && s.winner !== "draw" ? STORE[s.winner] : -1;
    ctx.clearRect(0, 0, 1024, 512);
    ctx.drawImage(this.inlay, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.shown.forEach((count, pit) => {
      const p = pitAt(pit),
        store = isStore(pit),
        x = 512 + (p.x * 1024) / 11.6,
        // Numbers sit on the rim: below the near row, above the far row.
        y = 256 + ((p.z + (store ? 1.42 : pit < 6 ? 0.78 : -0.78)) * 512) / 5.8,
        radius = store ? 31 : 27,
        lit = this.fresh.has(pit),
        face = ctx.createRadialGradient(x - 8, y - 9, 3, x, y, radius);
      face.addColorStop(0, pit === won ? "#fff1b8" : lit ? "#ffe3a3" : "#f6ecd6");
      face.addColorStop(1, pit === won ? "#e3a92a" : lit ? "#e0a54a" : "#cdb48a");
      ctx.fillStyle = "rgba(30, 16, 8, 0.45)";
      ctx.beginPath();
      ctx.arc(x + 2, y + 4, radius + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8a6328";
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `800 ${store ? 40 : 36}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = "#3a2112";
      ctx.fillText(String(count), x, y + 2);
    });
    this.countTexture.needsUpdate = true;
    this.dirty = true;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, MANCALA_SUBJECT);
    this.camera.position.set(0, Math.sin(MANCALA_SUBJECT.tilt) * distance, Math.cos(MANCALA_SUBJECT.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /**
   * Shows `state`. After a move the beads of the emptied pit are lifted as a handful and carried over the board, one
   * dropped into each pit in turn with a clink (each lands when it did before); beads taken then fly to the store,
   * and at the end of a game what is left goes to its owner's store.
   */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    this.hovered = -1;
    if (!animate || this.reducedMotion || !before || !state.sown || state.ply !== before.ply + 1) {
      this.fresh.clear();
      this.arrange(state.board);
      this.paintCounts();
      this.showMarks();
      this.onSettled();
      return;
    }
    this.arrange(before.board);
    this.fresh.clear();
    const sown = state.sown,
      mover = before.turn,
      hand = this.contents[sown.pit].splice(0),
      n = Math.min(hand.length, sown.path.length),
      lands = Array.from({ length: n }, (_, i) => i * SOW_STEP + FIRST),
      from = hand.map((b) => this.at[b].clone()),
      // The handful, loosely gathered round the hand.
      off = hand.map((_, k) => new T.Vector3(Math.cos(k * 2.4) * 0.12 * Math.sqrt(k), (k % 3) * 0.07, Math.sin(k * 2.4) * 0.12 * Math.sqrt(k))),
      targets = hand.slice(0, n).map((b, i) => {
        const pit = sown.path[i];
        this.contents[pit].push(b);
        return { pit, to: this.spot(pit, this.contents[pit].length - 1) };
      });
    this.shown[sown.pit] = 0;
    this.paintCounts();
    this.showMarks();
    // Where the hand is over the board: over the emptied pit once lifted, then over each pit as its bead drops.
    const stops = [{ t: LIFT, pit: sown.pit }, ...targets.map((target, i) => ({ t: lands[i] - DROP, pit: target.pit }))];
    const hand3 = new T.Vector3();
    const handAt = (t: number) => {
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1].t <= t) k++;
      const a = pitAt(stops[k].pit),
        next = stops[Math.min(k + 1, stops.length - 1)],
        b = pitAt(next.pit),
        span = next.t - stops[k].t,
        q = span > 0 ? ease(Math.min(1, Math.max(0, (t - stops[k].t) / span))) : 0;
      return hand3.set(a.x + (b.x - a.x) * q, CARRY + Math.sin(Math.PI * q) * 0.12, a.z + (b.z - a.z) * q);
    };
    const landed = new Set<number>(),
      sowing = lands[n - 1] + 70;
    this.tween(0, sowing, (p) => {
      const t = p * sowing;
      hand.slice(0, n).forEach((b, k) => {
        const drop = lands[k] - DROP;
        if (t < LIFT) {
          const q = ease(t / LIFT),
            h = handAt(LIFT);
          this.at[b].lerpVectors(from[k], h.clone().add(off[k]), q);
        } else if (t < drop) this.at[b].copy(handAt(t)).add(off[k]);
        else {
          // Dropped: it falls into the pit, quicker and quicker, and bounces once (it lands at 0.8 of the fall).
          const q = Math.min(1, (t - drop) / (DROP / 0.8)),
            start = handAt(drop).clone().add(off[k]),
            { to, pit } = targets[k];
          this.at[b].set(start.x + (to.x - start.x) * ease(Math.min(1, q / 0.8)), to.y + fall(q) * (start.y - to.y), start.z + (to.z - start.z) * ease(Math.min(1, q / 0.8)));
          if (q >= 0.8 && !landed.has(k)) {
            landed.add(k);
            this.shown[pit]++;
            this.fresh.add(pit);
            this.paintCounts();
            this.onContact();
          }
        }
      });
      this.place();
    });
    let after = sowing;
    // Beads taken fly in an arc to the mover's store.
    const fly = (beads: { b: number; pit: number; store: number }[], start: number, stagger: number, height: number) => {
      const flights = beads.map(({ b, pit, store }) => {
        this.contents[pit].splice(this.contents[pit].indexOf(b), 1);
        this.contents[store].push(b);
        return { b, pit, store, to: this.spot(store, this.contents[store].length - 1), from: null as T.Vector3 | null };
      });
      const length = (flights.length - 1) * stagger + FLY,
        done = new Set<number>();
      this.tween(start, length, (p) => {
        const t = p * length;
        flights.forEach((f, k) => {
          const q = Math.min(1, Math.max(0, (t - k * stagger) / FLY));
          f.from ??= this.at[f.b].clone();
          if (q <= 0) return;
          const along = travel(q);
          this.at[f.b].set(f.from.x + (f.to.x - f.from.x) * along, f.from.y + (f.to.y - f.from.y) * along + hop(q) * height, f.from.z + (f.to.z - f.from.z) * along);
          if (q >= 0.84 && !done.has(k)) {
            done.add(k);
            this.shown[f.pit]--;
            this.shown[f.store]++;
            this.fresh.add(f.store);
            this.paintCounts();
            if (k === 0 || k === flights.length - 1) this.onContact();
          }
        });
        this.place();
      });
      return start + length;
    };
    if (sown.captured.length) {
      const taken = sown.captured.flatMap((pit) => this.contents[pit].map((b) => ({ b, pit, store: STORE[mover] })));
      after = fly(taken, after + 60, 70, 1.1);
    }
    if (state.winner !== null) {
      const left = this.contents.flatMap((list, pit) => (isStore(pit) ? [] : list.map((b) => ({ b, pit, store: STORE[pit < 6 ? 0 : 1] }))));
      if (left.length) after = fly(left, after + 120, Math.min(45, 520 / left.length), 0.9);
    }
  }
  private tween(delay: number, duration: number, update: (p: number) => void) {
    this.tweens.push({ start: performance.now() + delay, duration, update });
  }
  setMarks(marks: Marks) {
    this.marks = marks;
    this.showMarks();
  }
  /** Shows the marks: none while the beads move, nor any but the result while the collection's pictures are taken. */
  private showMarks() {
    for (const list of Object.values(this.rings)) for (const ring of list) ring.visible = false;
    this.dirty = true;
    const s = this.state;
    const put = (ring: T.Mesh, pit: number) => {
      const p = pitAt(pit);
      ring.position.set(p.x, ring.position.y, p.z);
      ring.scale.set(1, 1, isStore(pit) ? STORE_RZ / STORE_RX : 1);
      ring.visible = true;
    };
    if (s && s.winner !== null && s.winner !== "draw" && !this.animating) put(this.rings.won[0], STORE[s.winner]);
    if (this.animating || capturing()) return;
    this.marks.targets.forEach((pit, i) => i < this.rings.target.length && put(this.rings.target[i], pit));
    if (this.marks.cursor !== null) put(this.rings.cursor[0], this.marks.cursor);
    // Where the beads of the pit under the pointer (or the keyboard's) would go.
    const look = this.hovered >= 0 ? this.hovered : this.marks.cursor;
    if (!s || look === null || !this.marks.targets.includes(look)) return;
    const next = play(s, { from: -1, to: look, extra: -1 });
    if (!next?.sown) return;
    const path = next.sown.path,
      last = path[path.length - 1];
    [...new Set(path.slice(0, -1))].filter((pit) => pit !== last).forEach((pit, i) => i < this.rings.path.length && put(this.rings.path[i], pit));
    put(this.rings.end[0], last);
    (this.rings.end[0].material as T.MeshBasicMaterial).color.set(last === STORE[s.turn] ? "#ffcf3a" : next.sown.captured.length ? "#ff8a3c" : "#ffffff");
    if (next.sown.captured.length) put(this.rings.take[0], next.sown.captured[1]);
  }
  private flicker(t: number) {
    this.market.flames.forEach((f, i) => {
      const k = 1 + 0.12 * Math.sin(t * 13 + i * 2) + 0.08 * Math.sin(t * 29 + i);
      f.scale.set(1, k, 1);
      f.rotation.z = 0.08 * Math.sin(t * 7 + i);
    });
    if (this.market.glow) this.market.glow.intensity = 1.2 * (0.9 + 0.1 * Math.sin(t * 17));
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.update(p);
      return p < 1;
    });
    if (!this.tweens.length && this.state) {
      this.arrange(this.state.board);
      this.paintCounts();
      this.showMarks();
      this.onSettled();
    }
    return true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    for (const resource of this.owned) resource.dispose();
    this.beads.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
