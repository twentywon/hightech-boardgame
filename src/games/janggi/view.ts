import * as T from "three";
import { afterGPUFrame, aim, disposeScene, wood } from "../../engine/scene-utils";
import {
  FOV,
  OVERHEAD,
  SUBJECTS,
  TILT,
  TURN_MS,
  cameraDistance,
  orbit,
} from "../../engine/camera";
import { FILES, RANKS, at, kindOf, sideOf, xOf, yOf, type Move, type Side } from "./rules";

export const SPACING = 0.7;
/** Centre of a board point in the scene. */
export const toWorld = (index: number) => ({
  x: (xOf(index) - 4) * SPACING,
  z: (yOf(index) - 4.5) * SPACING,
});
/** Board point nearest to a spot on the table, or null when none is close. */
export function fromWorld(x: number, z: number): number | null {
  const file = Math.round(x / SPACING + 4),
    rank = Math.round(z / SPACING + 4.5);
  if (file < 0 || file >= FILES || rank < 0 || rank >= RANKS) return null;
  const centre = toWorld(at(file, rank));
  return Math.hypot(x - centre.x, z - centre.z) <= SPACING * 0.48 ? at(file, rank) : null;
}
const GLYPH: Record<string, string> = {
  K: "楚", A: "士", R: "車", C: "包", N: "馬", E: "象", P: "卒",
  k: "漢", a: "士", r: "車", c: "包", n: "馬", e: "象", p: "兵",
};
const RADIUS: Record<string, number> = { K: 0.32, R: 0.27, C: 0.27, N: 0.27, E: 0.27, A: 0.21, P: 0.21 };
const PIECE_Y = 0.26;
function pieceTexture(piece: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const ctx = c.getContext("2d")!,
    color = sideOf(piece) === "cho" ? "#1f6a4b" : "#b3271b";
  ctx.fillStyle = "#f3e7c9";
  ctx.fillRect(0, 0, 160, 160);
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  // An octagonal rim that follows the edge of the piece.
  ctx.lineJoin = "miter";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    ctx.lineTo(80 + Math.cos(a) * 66, 80 + Math.sin(a) * 66);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font =
    '700 84px "Noto Serif CJK KR", "Noto Serif KR", "AppleMyungjo", "Batang", "Songti SC", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", serif';
  ctx.fillText(GLYPH[piece], 80, 86);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  // The cap's texture starts a quarter turn off; this puts the glyph upright.
  t.center.set(0.5, 0.5);
  t.rotation = -Math.PI / 2;
  return t;
}
interface Tween {
  mesh: T.Mesh;
  start: number;
  from: T.Vector3;
  to: T.Vector3;
}
export interface Marks {
  selected: number | null;
  target: number | null;
  legal: number[];
  last: Move | null;
  check: number | null;
  cursor: number | null;
}

/** A wooden janggi board with octagonal pieces. It draws a board string; it knows no rules. */
export class JanggiView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private pieces = new T.Group();
  private marks = new T.Group();
  private meshes: (T.Mesh | null)[] = Array(FILES * RANKS).fill(null);
  private shown = "";
  private tweens: Tween[] = [];
  private geometries = new Map<string, T.BufferGeometry>();
  private tops = new Map<string, T.MeshStandardMaterial>();
  private side = new T.MeshStandardMaterial({ color: "#e2d2a8", roughness: 0.6 });
  private markKey = "";
  private facing: Side;
  private top = false;
  private cameraFrom = new T.Vector3();
  private cameraTo = new T.Vector3();
  private cameraAt = 0;
  private cameraMs = 450;
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), -PIECE_Y);
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A board point was chosen; `confirm` when the gesture also commits (a mouse click). */
  onSelect: (index: number | null, confirm: boolean) => void = () => {};
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  get animating() {
    return this.tweens.length > 0 || this.cameraAt !== 0;
  }
  get ready() {
    return this.readyFlag;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    facing: Side,
  ) {
    this.facing = facing;
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#65452f");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "3D 장기판");
    canvas.tabIndex = 0;
    this.scene.add(new T.HemisphereLight("#fff1d2", "#44352b", 2.5));
    const light = new T.DirectionalLight("#fff4dc", 3.2);
    light.position.set(-3, 9, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -6;
    light.shadow.camera.right = 6;
    light.shadow.camera.top = 6;
    light.shadow.camera.bottom = -6;
    light.shadow.normalBias = 0.025;
    this.scene.add(light);
    const table = new T.Mesh(
      new T.BoxGeometry(80, 0.2, 80),
      new T.MeshStandardMaterial({ map: wood(true), roughness: 0.8 }),
    );
    table.position.y = -0.3;
    table.receiveShadow = true;
    this.scene.add(table);
    const width = (FILES - 1) * SPACING,
      depth = (RANKS - 1) * SPACING;
    const board = new T.Mesh(
      new T.BoxGeometry(width + 1, 0.34, depth + 1),
      new T.MeshStandardMaterial({ map: wood(), roughness: 0.52 }),
    );
    board.position.y = -0.03;
    board.castShadow = board.receiveShadow = true;
    this.scene.add(board);
    const lines: number[] = [],
      y = 0.142,
      line = (a: number, b: number) => {
        const p = toWorld(a),
          q = toWorld(b);
        lines.push(p.x, y, p.z, q.x, y, q.z);
      };
    for (let rank = 0; rank < RANKS; rank++) line(at(0, rank), at(8, rank));
    for (let file = 0; file < FILES; file++) line(at(file, 0), at(file, 9));
    // The palace diagonals.
    for (const rank of [0, 7]) {
      line(at(3, rank), at(5, rank + 2));
      line(at(5, rank), at(3, rank + 2));
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.Float32BufferAttribute(lines, 3));
    this.scene.add(
      new T.LineSegments(
        geometry,
        new T.LineBasicMaterial({ color: "#4a3320", transparent: true, opacity: 0.85 }),
      ),
    );
    this.scene.add(this.pieces, this.marks);
    const pick = (e: PointerEvent, confirm: boolean) => {
      if (this.disposed || this.cameraAt) return;
      aim(this.ray, e, canvas, this.camera);
      const hit = new T.Vector3();
      this.onSelect(
        this.ray.ray.intersectPlane(this.plane, hit) ? fromWorld(hit.x, hit.z) : null,
        confirm,
      );
    };
    let down: number | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = e.pointerId;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (down !== e.pointerId) return;
      down = null;
      // A mouse click commits; a touch only chooses and is confirmed by a button.
      pick(e, e.pointerType === "mouse");
    });
    canvas.addEventListener("pointercancel", () => (down = null));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = (time: number) => {
      this.raf = requestAnimationFrame(loop);
      let moved = false;
      if (this.cameraAt) {
        // A delayed turn has not begun while the time is still negative.
        const p = Math.max(0, Math.min(1, (time - this.cameraAt) / this.cameraMs)),
          e = p * p * (3 - 2 * p);
        orbit(this.camera.position, this.cameraFrom, this.cameraTo, e);
        this.camera.lookAt(0, 0, 0);
        moved = true;
        if (p === 1) {
          this.cameraAt = 0;
          this.onSettled();
        }
      }
      if (this.tweens.length) {
        moved = true;
        this.tweens = this.tweens.filter((t) => {
          const p = Math.min(1, (time - t.start) / 260);
          if (p < 0) return true;
          const e = p * p * (3 - 2 * p);
          t.mesh.position.lerpVectors(t.from, t.to, e);
          t.mesh.position.y += Math.sin(Math.PI * p) * 0.5;
          if (p < 1) return true;
          this.onContact();
          return false;
        });
        if (!this.tweens.length) this.onSettled();
      }
      if (!this.dirty && !moved) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          canvas.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  private target() {
    const distance = cameraDistance(this.camera.aspect, this.top, SUBJECTS.janggi),
      angle = this.top ? OVERHEAD : TILT;
    this.cameraTo.set(
      0,
      Math.sin(angle) * distance,
      Math.cos(angle) * distance * (this.facing === "cho" ? 1 : -1),
    );
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.target();
    if (!this.cameraAt) {
      this.camera.position.copy(this.cameraTo);
      this.camera.lookAt(0, 0, 0);
    }
    this.dirty = true;
  }
  /** Turns the board to `facing`'s side, or switches to the overhead view. */
  setCamera(facing: Side, top = this.top, delay = 0) {
    this.cameraMs = facing === this.facing ? 450 : TURN_MS;
    this.facing = facing;
    this.top = top;
    this.cameraFrom.copy(this.camera.position);
    this.target();
    if (this.reducedMotion) {
      this.camera.position.copy(this.cameraTo);
      this.camera.lookAt(0, 0, 0);
      this.dirty = true;
    } else this.cameraAt = performance.now() + delay;
    // The glyphs turn with the table once it has swung half way.
    const turn = () => {
      for (const mesh of this.meshes) if (mesh) this.orient(mesh);
      this.dirty = true;
    };
    if (this.cameraAt) setTimeout(() => !this.disposed && turn(), delay + this.cameraMs / 2);
    else turn();
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Every glyph reads upright from the viewer's side of the board. */
  private orient(mesh: T.Mesh) {
    mesh.rotation.y = this.facing === "cho" ? Math.PI : 0;
  }
  private make(piece: string, index: number) {
    const kind = kindOf(piece);
    let geometry = this.geometries.get(kind);
    if (!geometry) {
      // A crisp octagonal prism: a flat edge faces the player and every face
      // is shaded on its own, so the eight corners read clearly.
      const r = RADIUS[kind] * 1.05;
      geometry = new T.CylinderGeometry(r * 0.95, r, 0.2, 8, 1, false, Math.PI / 8).toNonIndexed();
      geometry.computeVertexNormals();
      this.geometries.set(kind, geometry);
    }
    let top = this.tops.get(piece);
    if (!top) {
      top = new T.MeshStandardMaterial({ map: pieceTexture(piece), roughness: 0.5 });
      this.tops.set(piece, top);
    }
    const mesh = new T.Mesh(geometry, [this.side, top, this.side]);
    mesh.castShadow = true;
    mesh.userData.piece = piece;
    const p = toWorld(index);
    mesh.position.set(p.x, PIECE_Y, p.z);
    this.orient(mesh);
    this.pieces.add(mesh);
    return mesh;
  }
  /**
   * Shows `board`. With `last` and matching pieces already on the board the
   * move is animated; otherwise every piece is placed afresh.
   */
  render(board: string, last: Move | null = null, animate = true) {
    if (this.disposed) return;
    this.dirty = true;
    for (const t of this.tweens) t.mesh.position.copy(t.to);
    this.tweens = [];
    const moving = last ? this.meshes[last.from] : null;
    if (
      last &&
      moving &&
      this.shown[last.from] === board[last.to] &&
      board[last.from] === "." &&
      [...board].every((piece, i) => i === last.from || i === last.to || piece === this.shown[i])
    ) {
      const taken = this.meshes[last.to];
      if (taken) this.pieces.remove(taken);
      this.meshes[last.to] = moving;
      this.meshes[last.from] = null;
      const p = toWorld(last.to),
        to = new T.Vector3(p.x, PIECE_Y, p.z);
      if (animate && !this.reducedMotion)
        this.tweens.push({ mesh: moving, start: performance.now(), from: moving.position.clone(), to });
      else moving.position.copy(to);
    } else {
      this.pieces.clear();
      this.meshes = [...board].map((piece, i) => (piece === "." ? null : this.make(piece, i)));
    }
    this.shown = board;
    if (!this.tweens.length) this.onSettled();
  }
  highlights(m: Marks) {
    const key = JSON.stringify(m);
    if (key === this.markKey || this.disposed) return;
    this.markKey = key;
    this.dirty = true;
    disposeScene(this.marks);
    this.marks.clear();
    const ring = (index: number, color: string, inner: number, outer: number, y = 0.15) => {
      const p = toWorld(index),
        mesh = new T.Mesh(
          new T.RingGeometry(inner, outer, 40),
          new T.MeshBasicMaterial({ color, side: T.DoubleSide, transparent: true, opacity: 0.92 }),
        );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, y, p.z);
      this.marks.add(mesh);
    };
    if (m.last) {
      ring(m.last.from, "#d6af57", 0.08, 0.13);
      ring(m.last.to, "#d6af57", 0.33, 0.37);
    }
    if (m.check !== null) ring(m.check, "#e2452c", 0.35, 0.41);
    if (m.selected !== null) ring(m.selected, "#f3d27a", 0.33, 0.4, 0.152);
    for (const index of m.legal) ring(index, "#2f8f6f", this.shown[index] === "." ? 0 : 0.3, this.shown[index] === "." ? 0.1 : 0.35, 0.153);
    if (m.target !== null) ring(m.target, "#f6f0e2", 0.3, 0.38, 0.154);
    if (m.cursor !== null) ring(m.cursor, "#fff2c6", 0.4, 0.44, 0.155);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    disposeScene(this.scene);
    this.geometries.forEach((g) => g.dispose());
    this.tops.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.side.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
