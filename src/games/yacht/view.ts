import * as T from "three";
import { afterGPUFrame, aim, wood } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";

/** What the tray shows. Faces are 1–6, or 0 for dice waiting to be rolled. */
export interface TrayModel {
  dice: number[];
  held: boolean[];
  /** Dice thrown by the latest roll. */
  rolled: boolean[];
  /** Changes with every roll, so a redraw is not mistaken for one. */
  rollId: number;
}

const SIZE = 0.84,
  GAP = 1.2,
  ROLL_Z = 0.85,
  KEEP_Z = -1.45,
  WAIT_Z = 2.05;
// Material slot → face value; opposite faces add up to seven.
const FACES = [3, 4, 1, 6, 2, 5];
const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0),
  Z = new T.Vector3(0, 0, 1);
/** Rotation that turns `face` upward. */
function upright(face: number) {
  const q = new T.Quaternion();
  if (face === 6) q.setFromAxisAngle(X, Math.PI);
  else if (face === 2) q.setFromAxisAngle(X, -Math.PI / 2);
  else if (face === 5) q.setFromAxisAngle(X, Math.PI / 2);
  else if (face === 3) q.setFromAxisAngle(Z, Math.PI / 2);
  else if (face === 4) q.setFromAxisAngle(Z, -Math.PI / 2);
  return q;
}
function texture(c: HTMLCanvasElement) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function faceTexture(value: number) {
  const { c, ctx } = canvas(160, 160);
  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(0, 0, 160, 160);
  ctx.strokeStyle = "#d8cfbb";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 152, 152);
  const at = [40, 80, 120];
  const spots: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  };
  // The single pip is large and red, as on many East Asian dice.
  ctx.fillStyle = value === 1 ? "#c8321f" : "#16181a";
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(at[x], at[y], value === 1 ? 26 : 14, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
function feltTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#1f5a49";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 11;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rand() * 256, rand() * 256, 1.5, 1.5);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(5, 4);
  return t;
}
/** The strip where dice set aside are lined up. */
function keepTexture() {
  const { c, ctx } = canvas(1024, 256);
  ctx.strokeStyle = "rgba(217, 185, 106, 0.6)";
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 14]);
  ctx.strokeRect(14, 44, 996, 198);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(233, 214, 160, 0.82)";
  ctx.font = '700 30px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText("보관", 22, 20);
  return texture(c);
}
interface Tween {
  die: number;
  start: number;
  duration: number;
  from: T.Vector3;
  to: T.Vector3;
  fromTurn: T.Quaternion;
  toTurn: T.Quaternion;
  axis: T.Vector3;
  spins: number;
  hop: number;
  bounced: boolean;
}

export class YachtView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 80);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  private dice: T.Mesh[] = [];
  private tweens: Tween[] = [];
  private model: TrayModel | null = null;
  private yaw = [0, 0, 0, 0, 0];
  private ray = new T.Raycaster();
  private reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A die touched the tray. */
  onContact: () => void = () => {};
  /** Every die has come to rest. */
  onSettled: () => void = () => {};
  /** A die was clicked or tapped. */
  onPick: (index: number) => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#65452f");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // The dice are also plain buttons beside the tray; the canvas is a shortcut.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.scene.add(new T.HemisphereLight("#fff4dc", "#33271d", 2.4));
    const light = new T.DirectionalLight("#fff6e2", 2.8);
    light.position.set(-3, 9, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -6;
    light.shadow.camera.right = 6;
    light.shadow.camera.top = 6;
    light.shadow.camera.bottom = -6;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const table = new T.Mesh(
      this.own(new T.PlaneGeometry(60, 60)),
      this.own(new T.MeshStandardMaterial({ map: this.own(wood(true)), roughness: 0.8 })),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.12;
    table.receiveShadow = true;
    this.scene.add(table);
    const half = SUBJECTS.yacht.half - 0.25,
      depth = SUBJECTS.yacht.halfZ - 0.25;
    const felt = new T.Mesh(
      this.own(new T.PlaneGeometry(half * 2, depth * 2)),
      this.own(new T.MeshStandardMaterial({ map: this.own(feltTexture()), roughness: 0.95 })),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const rim = this.own(new T.MeshStandardMaterial({ map: this.own(wood()), roughness: 0.55 }));
    for (const [w, d, x, z] of [
      [half * 2 + 0.5, 0.25, 0, -depth - 0.125],
      [half * 2 + 0.5, 0.25, 0, depth + 0.125],
      [0.25, depth * 2, -half - 0.125, 0],
      [0.25, depth * 2, half + 0.125, 0],
    ]) {
      const side = new T.Mesh(this.own(new T.BoxGeometry(w, 0.5, d)), rim);
      side.position.set(x, 0.13, z);
      side.castShadow = side.receiveShadow = true;
      this.scene.add(side);
    }
    const keep = new T.Mesh(
      this.own(new T.PlaneGeometry(GAP * 5 + 0.3, (GAP * 5 + 0.3) / 4)),
      this.own(
        new T.MeshBasicMaterial({ map: this.own(keepTexture()), transparent: true, depthWrite: false }),
      ),
    );
    keep.rotation.x = -Math.PI / 2;
    keep.position.set(0, 0.004, KEEP_Z - 0.12);
    this.scene.add(keep);
    const geometry = this.own(new T.BoxGeometry(SIZE, SIZE, SIZE));
    const materials = FACES.map((value) =>
      this.own(new T.MeshStandardMaterial({ map: this.own(faceTexture(value)), roughness: 0.4 })),
    );
    for (let i = 0; i < 5; i++) {
      const die = new T.Mesh(geometry, materials);
      die.castShadow = true;
      die.position.set((i - 2) * (SIZE + 0.06), SIZE / 2, WAIT_Z);
      this.dice.push(die);
      this.scene.add(die);
    }
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerup", (e) => {
      if (this.disposed || this.animating || (e.pointerType === "mouse" && e.button !== 0)) return;
      aim(this.ray, e, canvas, this.camera);
      const hit = this.ray.intersectObjects(this.dice)[0];
      if (hit) this.onPick(this.dice.indexOf(hit.object as T.Mesh));
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
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const subject = SUBJECTS.yacht,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  private place(model: TrayModel, i: number) {
    const waiting = model.dice[i] === 0;
    return new T.Vector3(
      (i - 2) * (waiting ? SIZE + 0.06 : GAP),
      SIZE / 2,
      waiting ? WAIT_Z : model.held[i] ? KEEP_Z : ROLL_Z,
    );
  }
  /**
   * Shows `model`. Dice thrown by a new roll tumble to their faces; the rest
   * slide between the rolling row, the kept row and the waiting row.
   */
  sync(model: TrayModel, animate = true) {
    if (this.disposed) return;
    const fresh = !!this.model && model.rollId !== this.model.rollId,
      quick = !animate || this.reducedMotion,
      now = performance.now();
    this.model = model;
    this.dirty = true;
    this.finish();
    let thrown = 0;
    this.dice.forEach((die, i) => {
      const to = this.place(model, i),
        tumbles = fresh && model.rolled[i] && model.dice[i] > 0;
      if (tumbles) this.yaw[i] = (Math.random() - 0.5) * 0.5;
      const toTurn = new T.Quaternion()
        .setFromAxisAngle(Y, model.dice[i] ? this.yaw[i] : 0)
        .multiply(upright(model.dice[i] || 1));
      if (quick) {
        die.position.copy(to);
        die.quaternion.copy(toTurn);
        return;
      }
      if (!tumbles && die.position.distanceToSquared(to) < 1e-6 && die.quaternion.angleTo(toTurn) < 1e-3)
        return;
      this.tweens.push({
        die: i,
        start: now + (tumbles ? thrown++ * 70 : 0),
        duration: tumbles ? 760 : 240,
        from: die.position.clone(),
        to,
        fromTurn: die.quaternion.clone(),
        toTurn,
        axis: new T.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize(),
        spins: tumbles ? 2 + Math.floor(Math.random() * 2) : 0,
        hop: tumbles ? 1.5 : 0.12,
        bounced: false,
      });
    });
    if (!this.tweens.length) this.onSettled();
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    const spin = new T.Quaternion();
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      const die = this.dice[t.die],
        e = 1 - (1 - p) * (1 - p);
      die.position.lerpVectors(t.from, t.to, e);
      // A throw lands twice: one long hop and a short one.
      die.position.y +=
        t.spins > 0
          ? Math.abs(Math.sin(Math.PI * Math.min(1, p * 1.6) * (p < 0.625 ? 1 : 0))) * t.hop +
            (p >= 0.625 ? Math.sin(Math.PI * ((p - 0.625) / 0.375)) * t.hop * 0.22 : 0)
          : Math.sin(Math.PI * p) * t.hop;
      if (t.spins > 0) {
        spin.setFromAxisAngle(t.axis, (1 - e) * t.spins * Math.PI * 2);
        die.quaternion.copy(t.toTurn).multiply(spin);
        if (!t.bounced && p >= 0.625) {
          t.bounced = true;
          this.onContact();
        }
      } else die.quaternion.slerpQuaternions(t.fromTurn, t.toTurn, e);
      if (p < 1) return true;
      die.position.copy(t.to);
      die.quaternion.copy(t.toTurn);
      if (t.spins > 0) this.onContact();
      return false;
    });
    if (!this.tweens.length) {
      this.dirty = true;
      this.onSettled();
    }
    return true;
  }
  /** Jumps every running animation to its end. */
  private finish() {
    for (const t of this.tweens) {
      this.dice[t.die].position.copy(t.to);
      this.dice[t.die].quaternion.copy(t.toTurn);
    }
    this.tweens = [];
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
