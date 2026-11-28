import * as T from "three";
import { afterGPUFrame, aim, capable, realism, weave, wood, fitCanvas } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";
import type { Card } from "./rules";
import { CUP, SIZE, diceCup, diceKit } from "./dice";
import { FAR, TOP, suite } from "./cabin";
import { ScorePad } from "./pad";
import { zoomable } from "../../engine/zoom";

/** What the tray shows. Faces are 1–6, or 0 for dice waiting to be rolled. */
export interface TrayModel {
  dice: number[];
  held: boolean[];
  /** Dice thrown by the latest roll. */
  rolled: boolean[];
  /** Changes with every roll, so a redraw is not mistaken for one. */
  rollId: number;
  /** The players' sheets, written on the pad when given. */
  cards?: readonly Card[];
}

const GAP = 1.2,
  ROLL_Z = 0.85,
  KEEP_Z = -1.45;
/**
 * The throw, in milliseconds from the press: the cup comes up over the tray (dice set aside before it leap in), is
 * shaken, tipped, and the dice come down on the felt at `LAND` (the sound's landing, 0.47 s), bounce once and roll to
 * their faces; the cup goes back to its place.
 */
const GATHER = 170,
  SHAKE = 300,
  LAUNCH = 320,
  LAND = 470,
  BOUNCE = 650,
  REST = 980,
  STAGGER = 18,
  CUP_MS = 960,
  /** Dice going back into the cup after a score. */
  HOME_MS = 420;
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
/**
 * Where each die lies in the cup (in the cup's own space): three on its floor, two on top of them, askew. In the cup
 * the dice are drawn a fifth smaller, so that five fit below its rim; they grow back as they fly out.
 */
const IN_CUP = 0.8,
  small = (SIZE * IN_CUP) / 2;
const SLOTS = [
  { at: new T.Vector3(-0.36, CUP.floor + small, 0.2), turn: new T.Euler(0, 0.3, 0) },
  { at: new T.Vector3(0.36, CUP.floor + small, 0.2), turn: new T.Euler(0, -0.3, 0) },
  { at: new T.Vector3(0, CUP.floor + small, -0.42), turn: new T.Euler(0, 0.05, 0) },
  { at: new T.Vector3(-0.16, CUP.floor + small * 3.1, 0.06), turn: new T.Euler(0.45, 0.2, 0.3) },
  { at: new T.Vector3(0.22, CUP.floor + small * 2.9, -0.2), turn: new T.Euler(-0.35, 1.1, -0.25) },
].map(({ at, turn }) => ({ at, turn: new T.Quaternion().setFromEuler(turn) }));
const CUP_REST = new T.Vector3(FAR.cupX, TOP, FAR.z),
  /** Where the cup is held over the tray to be shaken, and how far it is tipped to pour. */
  CUP_UP = new T.Vector3(2.55, 1.55, -0.35),
  TIP = 1.95;
/** The felt strip where dice set aside lie: a burgundy band with a stitched edge and 보관 worked in thread. */
function keepStrip(own: <R extends { dispose(): void }>(r: R) => R) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 200;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#5e1f27";
  ctx.fillRect(0, 0, 1024, 200);
  let seed = 3;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(rnd() * 1024, rnd() * 200, 1.5, 1.5);
  }
  ctx.strokeStyle = "rgba(226,190,112,0.85)";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 10]);
  ctx.strokeRect(14, 14, 996, 172);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(232,200,128,0.9)";
  ctx.font = '700 30px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText("보관", 34, 44);
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function feltTexture(own: <R extends { dispose(): void }>(r: R) => R) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
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
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(5, 4);
  return t;
}
const ease = (p: number) => 1 - (1 - p) * (1 - p),
  smooth = (p: number) => p * p * (3 - 2 * p),
  clamp = (p: number) => Math.max(0, Math.min(1, p));
/** A die on its way: thrown from the cup, or sliding between rows, or hopping back into the cup. */
interface Tween {
  die: number;
  start: number;
  kind: "throw" | "slide" | "home";
  /** Order among the dice thrown together. */
  order: number;
  from: T.Vector3;
  to: T.Vector3;
  fromTurn: T.Quaternion;
  toTurn: T.Quaternion;
  // A throw: where it first strikes the felt, where it bounces to, its free spin.
  first: T.Vector3;
  second: T.Vector3;
  axis: T.Vector3;
  spins: number;
  rollAxis: T.Vector3;
  rollAngle: number;
  /** How large it was drawn when it set off (smaller in the cup). */
  fromScale: number;
  /** Where it left the cup (filled in at the launch). */
  launch: T.Vector3 | null;
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
  private cup: T.Group;
  /** When the cup's throw began (0 while it rests). */
  private cupAt = 0;
  private pad: ScorePad;
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
  /** The cup was clicked or tapped. */
  onCup: () => void = () => {};
  /** A score has begun to be written on the pad. */
  set onWrite(write: () => void) {
    this.pad.onWrite = write;
  }
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
    const own = <R extends { dispose(): void }>(r: R) => this.own(r),
      rich = capable();
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#3c4654");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // The dice are also plain buttons beside the tray; the canvas is a shortcut.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    // The cabin's soft light and the reading lamp above the seat, a little to the left.
    this.scene.add(new T.HemisphereLight("#fff4e2", "#2f2a26", 2.3));
    const light = new T.DirectionalLight("#fff3dc", 2.8);
    light.position.set(-3, 9, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -7;
    light.shadow.camera.right = 7;
    light.shadow.camera.top = 7;
    light.shadow.camera.bottom = -7;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    // Half sizes of the felt inside the tray's rim (fixed here; the camera's subject is wider, for the cabin).
    const half = 3.5,
      depth = 2.75;
    suite(this.scene, own, rich);
    const felt = new T.Mesh(
      own(new T.PlaneGeometry(half * 2, depth * 2)),
      own(new T.MeshStandardMaterial({ map: feltTexture(own), roughness: 0.95, ...weave(half * 1.5, depth * 1.5, own) })),
    );
    felt.rotation.x = -Math.PI / 2;
    felt.receiveShadow = true;
    // The felt first: the tray's floor and the table under it are then not shaded for nothing.
    felt.renderOrder = -2;
    this.scene.add(felt);
    const rim = own(new T.MeshStandardMaterial({ map: own(wood()), roughness: 0.5 }));
    for (const [w, d, x, z] of [
      [half * 2 + 0.5, 0.25, 0, -depth - 0.125],
      [half * 2 + 0.5, 0.25, 0, depth + 0.125],
      [0.25, depth * 2, -half - 0.125, 0],
      [0.25, depth * 2, half + 0.125, 0],
    ]) {
      const side = new T.Mesh(own(new T.BoxGeometry(w, 0.5, d)), rim);
      side.position.set(x, 0.13, z);
      side.castShadow = side.receiveShadow = true;
      this.scene.add(side);
    }
    const keep = new T.Mesh(
      own(new T.PlaneGeometry(GAP * 5 + 0.5, 1.22)),
      own(new T.MeshStandardMaterial({ map: keepStrip(own), roughness: 1, ...weave(5, 1, own, 0.6) })),
    );
    keep.rotation.x = -Math.PI / 2;
    keep.position.set(-0.12, 0.004, KEEP_Z);
    keep.receiveShadow = true;
    this.scene.add(keep);
    this.cup = diceCup(own);
    this.cup.position.copy(CUP_REST);
    this.scene.add(this.cup);
    this.pad = new ScorePad(own);
    this.pad.group.position.set(FAR.padX, TOP, FAR.z);
    this.pad.group.rotation.y = 0.035;
    this.scene.add(this.pad.group);
    realism(this.renderer, this.scene);
    const kit = diceKit(own);
    for (let i = 0; i < 5; i++) {
      const die = new T.Mesh(kit.geometry, kit.materials);
      die.castShadow = true;
      this.dice.push(die);
      this.scene.add(die);
      this.inCup(i, die.position, die.quaternion);
      die.scale.setScalar(IN_CUP);
    }
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerup", (e) => {
      if (this.disposed || this.animating || (e.pointerType === "mouse" && e.button !== 0)) return;
      aim(this.ray, e, canvas, this.camera);
      const hit = this.ray.intersectObjects([...this.dice, this.cup], true)[0];
      if (!hit) return;
      const die = this.dice.indexOf(hit.object as T.Mesh);
      if (die >= 0) this.onPick(die);
      else this.onCup();
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now(),
        cup = this.stepCup(now),
        moved = this.step(now),
        wrote = this.pad.step(now);
      if (!this.dirty && !moved && !cup && !wrote) return;
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
    fitCanvas(this.renderer, w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Wide screens fit the tray by its depth and would cut off the far strip with the cup and the pad: there the
    // view takes in a little more beyond the tray and looks a little further away.
    const wide = this.camera.aspect > 1.45,
      shift = wide ? -0.55 : 0,
      subject = wide ? { ...SUBJECTS.yacht, halfZ: SUBJECTS.yacht.halfZ + 0.55 } : SUBJECTS.yacht,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance + shift);
    this.camera.lookAt(0, 0, shift);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Names the pad's rows (one a player) and starts a clean sheet. */
  setNames(names: string[]) {
    this.pad.setNames(names);
    this.dirty = true;
  }
  /** Where die `i` lies in the cup as the cup stands now. */
  private inCup(i: number, at: T.Vector3, turn: T.Quaternion) {
    this.cup.updateMatrixWorld();
    at.copy(SLOTS[i].at).applyMatrix4(this.cup.matrixWorld);
    turn.copy(this.cup.quaternion).multiply(SLOTS[i].turn);
  }
  private place(model: TrayModel, i: number) {
    return new T.Vector3((i - 2) * GAP, SIZE / 2, model.held[i] ? KEEP_Z : ROLL_Z);
  }
  /**
   * Shows `model`. Dice thrown by a new roll are shaken in the cup and thrown, tumble and roll to their faces; the
   * rest slide between the rolling row and the kept strip, or go back into the cup when the turn is over.
   */
  sync(model: TrayModel, animate = true) {
    if (this.disposed) return;
    const fresh = !!this.model && model.rollId !== this.model.rollId,
      quick = !animate || this.reducedMotion,
      now = performance.now();
    this.model = model;
    this.dirty = true;
    this.finish();
    if (model.cards) this.pad.show(model.cards, !quick);
    const thrown = this.dice.map((_, i) => fresh && model.rolled[i] && model.dice[i] > 0);
    if (!quick && thrown.some(Boolean)) this.cupAt = now;
    let order = 0,
      home = 0;
    this.dice.forEach((die, i) => {
      if (thrown[i]) this.yaw[i] = (Math.random() - 0.5) * 0.5;
      const waiting = model.dice[i] === 0,
        to = new T.Vector3(),
        toTurn = new T.Quaternion();
      if (waiting) this.inCup(i, to, toTurn);
      else {
        to.copy(this.place(model, i));
        toTurn.setFromAxisAngle(Y, this.yaw[i]).multiply(upright(model.dice[i]));
      }
      if (quick) {
        die.position.copy(to);
        die.quaternion.copy(toTurn);
        die.scale.setScalar(waiting ? IN_CUP : 1);
        return;
      }
      if (!thrown[i] && die.position.distanceToSquared(to) < 1e-6 && die.quaternion.angleTo(toTurn) < 1e-3) return;
      const k = thrown[i] ? order++ : waiting ? home++ : 0,
        // It strikes the felt between the cup and its place, bounces nearer and rolls the rest of the way.
        mouth = new T.Vector3(CUP_UP.x - 1.2, SIZE / 2, CUP_UP.z + 0.5),
        first = new T.Vector3().lerpVectors(to, mouth, 0.42 + Math.random() * 0.1),
        second = new T.Vector3().lerpVectors(to, first, 0.38),
        way = new T.Vector3().subVectors(to, second).setY(0),
        rolling = way.length();
      first.y = second.y = SIZE / 2;
      this.tweens.push({
        die: i,
        start: now + (waiting ? k * 60 : 0),
        kind: thrown[i] ? "throw" : waiting ? "home" : "slide",
        order: k,
        from: die.position.clone(),
        fromScale: die.scale.x,
        to,
        fromTurn: die.quaternion.clone(),
        toTurn,
        first,
        second,
        axis: new T.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize(),
        spins: 1.5 + Math.random() * 1.5,
        rollAxis: rolling > 1e-4 ? new T.Vector3().crossVectors(Y, way.normalize()) : X.clone(),
        rollAngle: (rolling / SIZE) * (Math.PI / 2),
        launch: null,
        bounced: false,
      });
    });
    if (!this.tweens.length) this.onSettled();
  }
  /** The cup's pose `t` ms into a throw. */
  private cupPose(t: number) {
    const cup = this.cup;
    if (t < GATHER) {
      const e = smooth(t / GATHER);
      cup.position.lerpVectors(CUP_REST, CUP_UP, e);
      cup.position.y += Math.sin(Math.PI * e) * 0.4;
      cup.quaternion.identity();
    } else if (t < SHAKE) {
      // Shaken: quick sideways jerks with a rocking tilt.
      const s = Math.sin(((t - GATHER) / 55) * Math.PI * 2);
      cup.position.copy(CUP_UP).add(new T.Vector3(s * 0.14, Math.abs(s) * 0.06, -s * 0.06));
      cup.quaternion.setFromAxisAngle(Z, -s * 0.16);
    } else if (t < 520) {
      // Tipped over toward the felt, mouth to the left, the dice pouring out.
      const e = ease(clamp((t - SHAKE) / 90));
      cup.position.copy(CUP_UP).add(new T.Vector3(-0.35 * e, 0.1 * e, 0.12 * e));
      cup.quaternion.setFromAxisAngle(Z, TIP * e).premultiply(new T.Quaternion().setFromAxisAngle(Y, -0.35 * e));
    } else {
      const e = smooth(clamp((t - 520) / (CUP_MS - 520))),
        tipped = new T.Quaternion().setFromAxisAngle(Z, TIP).premultiply(new T.Quaternion().setFromAxisAngle(Y, -0.35)),
        held = CUP_UP.clone().add(new T.Vector3(-0.35, 0.1, 0.12));
      cup.position.lerpVectors(held, CUP_REST, e);
      cup.position.y += Math.sin(Math.PI * e) * 0.3;
      cup.quaternion.copy(tipped).slerp(new T.Quaternion(), e);
    }
  }
  private stepCup(now: number) {
    if (!this.cupAt) return false;
    const t = now - this.cupAt;
    if (t >= CUP_MS) {
      this.cupAt = 0;
      this.cup.position.copy(CUP_REST);
      this.cup.quaternion.identity();
    } else this.cupPose(t);
    return true;
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    const at = new T.Vector3(),
      turn = new T.Quaternion(),
      q = new T.Quaternion();
    this.tweens = this.tweens.filter((t) => {
      const die = this.dice[t.die],
        ms = now - t.start;
      if (ms < 0) return true;
      if (t.kind === "slide") {
        const p = Math.min(1, ms / 240),
          e = ease(p);
        die.position.lerpVectors(t.from, t.to, e);
        die.position.y += Math.sin(Math.PI * p) * 0.12;
        die.quaternion.slerpQuaternions(t.fromTurn, t.toTurn, e);
        if (p < 1) return true;
      } else if (t.kind === "home") {
        // A hop up over the rim and down into the cup.
        const p = Math.min(1, ms / HOME_MS),
          e = smooth(p);
        die.position.lerpVectors(t.from, t.to, e);
        die.position.y += Math.sin(Math.PI * p) * 1.6;
        die.quaternion.slerpQuaternions(t.fromTurn, t.toTurn, e);
        die.scale.setScalar(1 - (1 - IN_CUP) * e);
        if (p < 1) return true;
      } else {
        const end = REST + t.order * STAGGER,
          launch = LAUNCH + t.order * STAGGER;
        // The free spin it was given in the cup, gone by the time it bounces.
        const spin = t.spins * Math.PI * 2 * (1 - ease(clamp(ms / BOUNCE))),
          roll = ms < BOUNCE ? t.rollAngle : t.rollAngle * (1 - ease(clamp((ms - BOUNCE) / (end - BOUNCE))));
        die.quaternion
          .setFromAxisAngle(t.rollAxis, -roll)
          .multiply(q.setFromAxisAngle(t.axis, spin))
          .multiply(t.toTurn);
        die.scale.setScalar(
          ms < launch
            ? t.fromScale + (IN_CUP - t.fromScale) * smooth(clamp(ms / GATHER))
            : IN_CUP + (1 - IN_CUP) * clamp((ms - launch) / (LAND - launch)),
        );
        if (ms < launch) {
          // Leaping into the cup as it comes, then shaken in it.
          this.inCup(t.die, at, turn);
          const p = clamp(ms / GATHER);
          if (p < 1 && t.from.distanceToSquared(at) > 0.01) {
            die.position.lerpVectors(t.from, at, smooth(p));
            die.position.y += Math.sin(Math.PI * p) * 0.9;
          } else die.position.copy(at);
        } else if (ms < LAND) {
          if (!t.launch) {
            this.inCup(t.die, at, turn);
            t.launch = at.clone();
          }
          const p = (ms - launch) / (LAND - launch);
          die.position.lerpVectors(t.launch, t.first, p);
          die.position.y += Math.sin(Math.PI * p) * 0.35;
        } else if (ms < BOUNCE) {
          if (!t.bounced) {
            t.bounced = true;
            this.onContact();
          }
          const p = (ms - LAND) / (BOUNCE - LAND);
          die.position.lerpVectors(t.first, t.second, p);
          die.position.y += Math.sin(Math.PI * p) * 0.34;
        } else {
          const p = clamp((ms - BOUNCE) / (end - BOUNCE));
          die.position.lerpVectors(t.second, t.to, ease(p));
          // A cube rolling over its edges rises and falls.
          const phase = roll % (Math.PI / 2);
          die.position.y = SIZE / 2 + SIZE * 0.17 * Math.sin(phase * 2);
        }
        if (ms < end) return true;
      }
      die.position.copy(t.to);
      die.quaternion.copy(t.toTurn);
      die.scale.setScalar(t.kind === "home" ? IN_CUP : 1);
      if (t.kind === "throw") this.onContact();
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
      this.dice[t.die].scale.setScalar(t.kind === "home" ? IN_CUP : 1);
    }
    this.tweens = [];
    this.cupAt = 0;
    this.cup.position.copy(CUP_REST);
    this.cup.quaternion.identity();
    this.pad.finish();
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
