import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { aim as aimRay } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { COMBO, MAG as BB_MAG, ROWS, comboNow, type BBWorld, type Pellet } from "./bb";
import { buildBooth, lightTarget, type Booth } from "./booth";
import { CLAYS, type ClayWorld } from "./clay";
import { animalModel, buildForest, type AnimalModel, type Forest } from "./forest";
import { buildGun, type Gun } from "./guns";
import { FADE, KINDS, LAKE, MAG as HUNT_MAG, kindOf, partAt, type Animal, type HuntWorld } from "./hunt";
import { FOLLOW, LINED_UP, RAISE, RIGS, SHOOT_SUBJECT, aimAt, clampAim, direction, dragTurn, misalignment, sightEye, wander, type Aim, type Mode, type Offset, type Vec } from "./layout";
import { flashPicture, puffPicture, wordPicture } from "./paint";
import { CLAY_LARGER, buildRange, type Range } from "./range";
import { BREAK, DONE, ESCAPE, HIT, LAUNCH, LOST, SHOT, TAKE, TICK, WOUND, ZONES, broken, type State } from "./rules";
import { DT, createWorld, fire, ready, reloading, step, type Happening, type World } from "./sim";

export const SHOOTING_COLORS: [string, string] = ["#ff6a1c", "#2f7bff"];
const UP = new T.Vector3(0, 1, 0);
const vec = (v: Vec) => new T.Vector3(v.x, v.y, v.z);
/** How hard each gun kicks: back along itself (m) and its muzzle up (radians); and the eye's own jolt. */
const KICK: Record<Mode, { back: number; up: number; eye: number }> = {
  bb: { back: 0.008, up: 0.012, eye: 0.004 },
  clay: { back: 0.06, up: 0.11, eye: 0.045 },
  hunt: { back: 0.04, up: 0.07, eye: 0.03 },
};
/** A passing thing the frame loop moves until it is done (a fragment, a puff, a word, a flash). */
interface Effect {
  update: (now: number) => boolean;
  dispose?: () => void;
}
/**
 * Shooting in the first person, in one of three places: the BB booth of an arcade, a clay range, a wood by a lake.
 * The gun is in view. A press brings it up to the eye (the press aims it at the point under the finger), a drag turns
 * it, and while it is held the rear sight wanders slowly off the line of the front sight (`wander`), which stays
 * exactly where I aim; letting go fires, and the shot goes off by the misalignment at that moment (`shotError`). The
 * place runs in real time in the world of `sim.ts`, stepped here in fixed slices; what happens in it is shown and
 * reported to the rules as moves.
 */
export class ShootingView extends TableView<State> {
  private mode: Mode;
  private world: World;
  private gun: Gun;
  /** The gun is drawn over the place by a camera of its own (at the eye, with a field that does not narrow as much). */
  private gunScene = new T.Scene();
  private gunCamera = new T.PerspectiveCamera(40, 1, 0.01, 8);
  private drawingGun = false;
  private booth: Booth | null = null;
  private range: Range | null = null;
  private forest: Forest | null = null;
  /** Where the gun points, and the press that holds it up (where it began, the aim it began from, its wander's seed). */
  private aim: Aim;
  private hold: { pointer: number | null; x: number; y: number; dx: number; dy: number; since: number; seed: number; base: Aim } | null = null;
  private offset: Offset = { x: 0, y: 0 };
  /** How far the eye has come to the sights (0 to 1); when the last shot went off; how far the gun is lowered to reload. */
  private zoom = 0;
  private shotAt = -1e9;
  private lowered = 0;
  private restQuat = new T.Quaternion();
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private effects: Effect[] = [];
  private hud: HTMLElement;
  private hudText = "";
  private pointer = new T.Raycaster();
  /** Shared pictures for sprites. */
  private puff: T.Texture;
  private flash: T.Texture;
  /** BB pellets in flight and spent ones lying in the bays. */
  private pellets = new Map<Pellet, T.Mesh>();
  private pelletShape: T.BufferGeometry;
  private pelletPaint: T.MeshStandardMaterial;
  private spent: T.InstancedMesh | null = null;
  private spentCount = 0;
  /** The clay in the air. */
  private clayMesh: T.Mesh | null = null;
  /** Animals shown, by the world's id. */
  private animals = new Map<number, { model: AnimalModel; seen: Vec; step: number }>();
  /** A happening's sounds: told to the screen by kind. */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low", variant: string) {
    super(host, quality, "#0b0a1a");
    this.mode = variant === "clay" || variant === "hunt" ? variant : "bb";
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      rig = RIGS[this.mode];
    this.camera.near = 0.03;
    this.camera.far = 700;
    this.world = createWorld(this.mode, 0, (cryptoRandom() * 2147483647) | 0);
    if (this.mode === "bb") this.booth = buildBooth(this.scene, keep);
    else if (this.mode === "clay") this.range = buildRange(this.scene, keep);
    else this.forest = buildForest(this.scene, keep);
    this.gun = buildGun(this.mode, keep);
    this.gunScene.add(this.gun.root);
    // The gun's own light, after the place's: the blue of the booth, the day, the dusk.
    const tint = { bb: ["#9fb0ff", "#2a2040", "#dfe6ff"], clay: ["#e8f0ff", "#5c7a3a", "#fff4e0"], hunt: ["#d6c4ee", "#4a4a30", "#ffc490"] }[this.mode];
    this.gunScene.add(new T.HemisphereLight(tint[0], tint[1], 1.6));
    const key = new T.DirectionalLight(tint[2], 1.6);
    key.position.set(-1, 3, 2);
    this.gunScene.add(key);
    this.scene.onAfterRender = (renderer) => this.drawGun(renderer);
    this.restQuat.setFromRotationMatrix(new T.Matrix4().lookAt(vec(rig.head), vec(rig.look), UP));
    this.aim = aimAt(this.mode, rig.look);
    if (this.mode === "bb") this.aim = aimAt("bb", { x: 0, y: 1.3, z: -4 });
    this.puff = keep(puffPicture(keep));
    this.flash = keep(flashPicture(keep));
    this.pelletShape = keep(new T.SphereGeometry(0.011, 10, 8));
    this.pelletPaint = keep(new T.MeshStandardMaterial({ color: "#fff2a8", emissive: "#ffcf3a", emissiveIntensity: 0.9, roughness: 0.3 }));
    if (this.mode === "bb") {
      this.spent = new T.InstancedMesh(this.pelletShape, this.pelletPaint, 160);
      this.spent.count = 0;
      this.spent.frustumCulled = false;
      this.scene.add(this.spent);
    }
    if (this.range) {
      this.clayMesh = new T.Mesh(this.range.clay.dome, this.range.clay.paint);
      this.clayMesh.visible = false;
      this.clayMesh.castShadow = true;
      this.scene.add(this.clayMesh);
    }
    // Every press is the hand's, taken by the canvas's own listeners; the floor catches every ray so that it is.
    this.floor = new T.Plane(new T.Vector3(0, 0, 1), 1000);
    host.style.position = "relative";
    this.hud = document.createElement("div");
    this.hud.className = "sh-hud";
    this.hud.dataset.mode = this.mode;
    this.hud.setAttribute("aria-hidden", "true");
    host.append(this.hud);
    this.listen();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The tables's real-time clock never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.letDown();
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** The hand: a press brings the gun up, a drag turns it, letting go fires; Space or Enter held does the same with the arrows. */
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.hold || !this.running()) return;
      this.raise(e.pointerId, e.clientX, e.clientY);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.hold || this.hold.pointer !== e.pointerId) return;
      this.hold.dx = e.clientX - this.hold.x;
      this.hold.dy = e.clientY - this.hold.y;
      this.turnTo();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.hold || this.hold.pointer !== e.pointerId) return;
      if (cancelled) this.letDown();
      else this.release();
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => {
      const steps: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (steps[e.key]) {
        e.preventDefault();
        const by = ((RIGS[this.mode].aimFov * Math.PI) / 180) * (e.shiftKey ? 0.01 : 0.04);
        if (this.hold) this.hold.base = clampAim(this.mode, { yaw: this.hold.base.yaw + steps[e.key][0] * by, pitch: this.hold.base.pitch + steps[e.key][1] * by });
        else this.aim = clampAim(this.mode, { yaw: this.aim.yaw + steps[e.key][0] * by, pitch: this.aim.pitch + steps[e.key][1] * by });
        this.turnTo();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (e.repeat || this.hold || !this.running()) return;
        this.raise(null, 0, 0);
      } else if (e.key === "Escape" && this.hold) this.letDown();
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key === " " || e.key === "Enter") && this.hold && this.hold.pointer === null) {
        e.preventDefault();
        this.release();
      }
    });
    el.addEventListener("blur", () => {
      if (this.hold?.pointer === null) this.letDown();
    });
  }
  /**
   * The gun comes up. Pressed while the eye is still at the sights (a second shot soon after the first) it carries on
   * from where it points; else it points at what is under the finger.
   */
  private raise(pointer: number | null, x: number, y: number) {
    let base = this.aim;
    if (pointer !== null && this.zoom < 0.5) {
      aimRay(this.pointer, { clientX: x, clientY: y } as PointerEvent, this.renderer.domElement, this.camera);
      base = aimAt(this.mode, this.reach(this.pointer.ray));
    }
    this.hold = { pointer, x, y, dx: 0, dy: 0, since: performance.now(), seed: cryptoRandom() * 1000, base };
    this.turnTo();
  }
  /** Where along a ray from the eye the hand means: the depth of a target, a clay or an animal it passes near, else the ground or the gun's reach. */
  private reach(ray: T.Ray): Vec {
    const at = (s: number) => {
        const p = ray.at(s, new T.Vector3());
        return { x: p.x, y: p.y, z: p.z };
      },
      near = (points: Vec[], within: number) => {
        let best: number | null = null,
          gap = Infinity;
        for (const p of points) {
          const v = vec(p),
            s = v.clone().sub(ray.origin).dot(ray.direction),
            d = ray.distanceToPoint(v) / Math.max(1, s);
          if (s > 0 && d < within && d < gap) {
            gap = d;
            best = s;
          }
        }
        return best;
      },
      w = this.world;
    if (w.kind === "bb") {
      const s = near(w.targets, 0.05);
      if (s !== null) return at(s);
      const back = ray.direction.z < 0 ? (ROWS[0].z - ray.origin.z) / ray.direction.z : 4;
      return at(back);
    }
    if (w.kind === "clay") {
      const s = w.clay ? near([w.clay.p], 0.12) : null;
      return at(s ?? RIGS.clay.reach);
    }
    const s = near(
      w.animals.filter((a) => a.doing !== "fall" && a.doing !== "down").map((a) => this.middle(a)),
      0.05,
    );
    if (s !== null) return at(s);
    const ground = ray.direction.y < -0.01 ? (0 - ray.origin.y) / ray.direction.y : Infinity;
    return at(ground < 120 ? ground : RIGS.hunt.reach);
  }
  /** An animal's middle (its largest part). */
  private middle(a: Animal): Vec {
    const parts = kindOf(a.kind).parts,
      big = parts.reduce((m, p) => (p.r > m.r ? p : m), parts[0]);
    return partAt(a, big);
  }
  /** The gun follows the drag (or the keys) from where the press began. */
  private turnTo() {
    const h = this.hold;
    if (!h) return;
    const height = this.renderer.domElement.clientHeight || 1,
      turn = dragTurn(this.mode, h.dx, h.dy, height);
    this.aim = clampAim(this.mode, { yaw: h.base.yaw + turn.yaw, pitch: h.base.pitch + turn.pitch });
  }
  /** Lowered without a shot (let go too soon, cancelled, or no longer allowed). */
  private letDown() {
    this.hold = null;
    this.offset = { x: 0, y: 0 };
  }
  /** Let go: at the sights the gun fires along where it points, off by the sights' misalignment now; sooner, it is lowered. */
  private release() {
    const h = this.hold;
    if (!h) return;
    const now = performance.now();
    if (now - h.since < RAISE || !this.running()) return this.letDown();
    const offset = wander(this.mode, (now - h.since) / 1000, h.seed);
    this.hold = null;
    this.offset = offset;
    this.report(fire(this.world, this.aim, offset));
  }
  /** Tells the screen what has happened in the place, and shows it. */
  private report(happenings: Happening[]) {
    const now = performance.now(),
      move = (to: number, extra = -1) => {
        if (this.state?.winner === null) this.onMove({ from: -1, to, extra });
      };
    for (const h of happenings) {
      switch (h.kind) {
        case "second":
          move(TICK);
          break;
        case "shot":
          this.shotAt = now;
          this.shot(h, now);
          move(SHOT);
          break;
        case "click":
          this.onKnock?.("click", 1);
          this.say(this.world.kind === "bb" && this.world.ammo <= 0 ? "탄 없음" : "장전 중", "#cfd6e6", this.ahead(3), now, 0.6);
          break;
        case "reload":
          this.onKnock?.(`reload-${this.mode}`, 1);
          break;
        case "loaded":
          this.onKnock?.("loaded", 1);
          break;
        case "hit": {
          const target = (this.world as BBWorld).targets[h.target];
          this.onKnock?.("ding", h.lit === 2 ? 1 : 0.6);
          this.onKnock?.("tick", 1);
          this.say(`+${h.points}`, h.lit === 2 ? "#ffe23a" : "#8fd0ff", { x: target.x, y: target.y + 0.16, z: target.z + 0.12 }, now, 1.1);
          if (h.combo >= 2) this.say(`콤보 ×${Math.min(5, h.combo)}`, "#ff8ad8", { x: target.x, y: target.y + 0.3, z: target.z + 0.12 }, now, 1.1);
          this.spark(target, now);
          move(HIT + h.points, h.combo);
          break;
        }
        case "tick":
          this.onKnock?.("tick", 0.6);
          this.drop(h.at, now);
          break;
        case "done":
          move(DONE);
          break;
        case "launch":
          this.onKnock?.("trap", 1);
          this.say("풀!", "#ffffff", { x: 0, y: 3.2, z: -15 }, now, 3.2);
          move(LAUNCH);
          break;
        case "break":
          this.onKnock?.("clay", 1);
          this.burst(h.at, h.v, now);
          this.say(h.barrel === 1 ? "명중!" : "명중", "#ffd84a", { x: h.at.x, y: h.at.y + 1.6, z: h.at.z }, now, 3);
          move(BREAK, h.barrel);
          break;
        case "lost":
          this.dust(h.at, now, "200,180,140", 1.2);
          move(LOST);
          break;
        case "spawn":
          break;
        case "takeoff":
          this.onKnock?.("flutter", 1);
          break;
        case "wound": {
          this.onKnock?.("thump", 0.6);
          this.dust(h.at, now, "210,200,180", 0.5);
          this.say(`${{ head: "머리", body: "몸통", legs: "다리", wing: "날개" }[h.zone]}!`, "#ffffff", { x: h.at.x, y: h.at.y + 0.8, z: h.at.z }, now, h.animal.p.z < -30 ? 3 : 1.6);
          move(WOUND, ZONES.indexOf(h.zone));
          break;
        }
        case "take": {
          const kind = KINDS.findIndex((k) => k.id === h.animal.kind);
          this.onKnock?.("thump", 1);
          this.dust(h.at, now, kindOf(h.animal.kind).bird ? "245,240,230" : "210,200,180", 0.8);
          this.say(`${KINDS[kind].name} +${h.points}`, "#ffd84a", { x: h.at.x, y: h.at.y + 1.2, z: h.at.z }, now, h.animal.p.z < -30 ? 3.4 : 1.8);
          move(TAKE + kind, ZONES.indexOf(h.zone));
          break;
        }
        case "miss":
          if (h.at) {
            this.dust(h.at, now, h.water ? "235,240,255" : "150,130,100", h.water ? 1.1 : 0.7);
            if (h.water) this.onKnock?.("splash", 0.4);
          }
          break;
        case "escape":
          move(ESCAPE);
          break;
      }
    }
  }
  /** A point a few metres straight ahead of the gun, for words about the gun itself. */
  private ahead(d: number): Vec {
    const eye = sightEye(this.mode, this.aim),
      dir = direction(this.aim);
    return { x: eye.x + dir.x * d, y: eye.y + dir.y * d + 0.15 * d, z: eye.z + dir.z * d };
  }
  /** The muzzle where the gun itself is (in the gun's own picture). */
  private muzzle(k = 0) {
    this.gun.root.updateMatrixWorld(true);
    return this.gun.body.localToWorld(this.gun.muzzles[k].clone());
  }
  /**
   * A point of the place that lies, on the screen, where the muzzle is seen (the gun is drawn with a field of its own,
   * so its muzzle is not where the place's camera would put it): `ahead` metres from the eye along that line of sight.
   */
  private screenMuzzle(k = 0, ahead = 1.2) {
    const ndc = this.muzzle(k).project(this.gunCamera),
      through = new T.Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return this.camera.position.clone().addScaledVector(through, ahead);
  }
  /** Draws the gun over the place, after the place's own picture, with depth cleared (nothing of the place hides it). */
  private drawGun(renderer: T.WebGLRenderer) {
    if (this.drawingGun || this.disposed) return;
    this.drawingGun = true;
    const autoClear = renderer.autoClear,
      shadows = renderer.shadowMap.autoUpdate;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth();
    renderer.render(this.gunScene, this.gunCamera);
    renderer.autoClear = autoClear;
    renderer.shadowMap.autoUpdate = shadows;
    this.drawingGun = false;
  }
  /** The shot leaves the gun: a sound, a flash, smoke, and what it sends (a pellet, a pattern, a bullet). */
  private shot(h: Extract<Happening, { kind: "shot" }>, now: number) {
    this.onKnock?.(`shot-${this.mode}`, 1);
    const barrel = this.mode === "clay" && "barrel" in h && h.barrel === 2 ? 1 : 0,
      muzzle = this.screenMuzzle(barrel, this.mode === "bb" ? 1.1 : 1.6);
    if (this.mode === "bb") {
      const pellet = (h as { pellet: Pellet }).pellet,
        mesh = new T.Mesh(this.pelletShape, this.pelletPaint);
      mesh.position.copy(muzzle);
      this.scene.add(mesh);
      this.pellets.set(pellet, mesh);
      // A little puff of air from the muzzle.
      this.sprite(this.puff, muzzle, 0.05, 0.16, 0.35, now, "#ffffff", 0.5);
      return;
    }
    this.sprite(this.flash, this.muzzle(barrel), this.mode === "clay" ? 0.16 : 0.12, 0.22, 0.07, now, "#ffffff", 1, 0, this.gunScene);
    this.sprite(this.puff, muzzle.clone().addScaledVector(vec(direction(this.aim)), 0.4), 0.2, this.mode === "clay" ? 1.4 : 0.9, 1.1, now, "#d8d4cc", 0.55);
    // The way it went, drawn faintly for a moment: the pattern's pellets, or the bullet's line.
    const ways: { from: T.Vector3; to: T.Vector3 }[] = [];
    if (h.kind === "shot" && "pellets" in h) {
      const from = vec(RIGS.clay.pivot);
      h.pellets.forEach((d, i) => {
        if (i % 3) return;
        ways.push({ from: muzzle.clone(), to: from.clone().addScaledVector(vec(d), 38) });
      });
    } else if (h.kind === "shot" && "to" in h) ways.push({ from: muzzle.clone(), to: vec(h.to) });
    const positions = new Float32Array(ways.length * 6),
      geometry = new T.BufferGeometry(),
      material = new T.LineBasicMaterial({ color: "#fff3c8", transparent: true, opacity: 0.5, depthWrite: false });
    ways.forEach((w, i) => positions.set([w.from.x, w.from.y, w.from.z, w.to.x, w.to.y, w.to.z], i * 6));
    geometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    const lines = new T.LineSegments(geometry, material);
    lines.frustumCulled = false;
    this.scene.add(lines);
    this.effects.push({
      update: (t) => {
        const p = (t - now) / 140;
        material.opacity = 0.5 * Math.max(0, 1 - p);
        return p < 1;
      },
      dispose: () => {
        lines.removeFromParent();
        geometry.dispose();
        material.dispose();
      },
    });
  }
  /** A sprite at `at`, growing from `from` to `to` metres across over `life` seconds and fading. */
  private sprite(map: T.Texture, at: T.Vector3, from: number, to: number, life: number, now: number, color: string, opacity: number, rise = 0.3, parent: T.Object3D = this.scene) {
    if (capturing()) return;
    const material = new T.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false }),
      s = new T.Sprite(material),
      start = at.clone();
    s.position.copy(at);
    s.scale.setScalar(from);
    s.renderOrder = 5;
    parent.add(s);
    this.effects.push({
      update: (t) => {
        const p = Math.min(1, (t - now) / (life * 1000));
        s.scale.setScalar(from + (to - from) * (1 - (1 - p) ** 2));
        s.position.copy(start).add(new T.Vector3(0, rise * p, 0));
        material.opacity = opacity * (1 - p);
        return p < 1;
      },
      dispose: () => {
        s.removeFromParent();
        material.dispose();
      },
    });
  }
  /** A puff of dust (or feathers, or spray) where something struck. */
  private dust(at: Vec, now: number, tint: string, size: number) {
    this.sprite(this.puff, vec(at), size * 0.3, size * 1.6, 0.9, now, `rgb(${tint})`, 0.9, size * 0.4);
  }
  /** A word that rises from a place and fades; `scale` sizes it to how far off the place is. */
  private say(text: string, color: string, at: Vec, now: number, scale: number) {
    if (capturing()) return;
    const map = wordPicture(text, color),
      material = new T.SpriteMaterial({ map, transparent: true, depthTest: false }),
      s = new T.Sprite(material);
    s.scale.set(scale * 0.36, scale * 0.1125, 1);
    s.renderOrder = 30;
    s.position.set(at.x, at.y, at.z);
    this.scene.add(s);
    this.effects.push({
      update: (t) => {
        const p = (t - now) / 950;
        s.position.y = at.y + p * scale * 0.08;
        material.opacity = p < 0.65 ? 1 : Math.max(0, 1 - (p - 0.65) / 0.35);
        return p < 1;
      },
      dispose: () => {
        s.removeFromParent();
        map.dispose();
        material.dispose();
      },
    });
  }
  /** A spark where a pellet strikes a lit target. */
  private spark(target: Vec, now: number) {
    this.sprite(this.flash, vec(target).add(new T.Vector3(0, 0, 0.05)), 0.05, 0.22, 0.12, now, "#ffffff", 0.9, 0);
  }
  /** A pellet that struck something dark falls to the floor of its bay and stays there. */
  private drop(at: Vec, now: number) {
    const mesh = new T.Mesh(this.pelletShape, this.pelletPaint),
      from = vec(at),
      // Onto the ledge of the row it struck, if it is over one; else down to the bays' floor.
      shelf = ROWS.find((row) => Math.abs(from.z - (row.z + 0.05)) < 0.17 && from.y > row.y - 0.12),
      floor = shelf ? shelf.y - 0.1 : 0.63,
      side = (Math.random() - 0.5) * 0.4;
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.effects.push({
      update: (t) => {
        const s = (t - now) / 1000,
          y = from.y + 0.5 * s - 4.9 * s * s;
        mesh.position.set(from.x + side * s, Math.max(floor, y), from.z + 0.6 * s);
        if (y > floor) return true;
        this.lay(mesh.position);
        return false;
      },
      dispose: () => mesh.removeFromParent(),
    });
  }
  /** A spent pellet laid where it came to rest (the oldest goes when there are too many). */
  private lay(at: T.Vector3) {
    if (!this.spent) return;
    const i = this.spentCount++ % 160;
    this.spent.setMatrixAt(i, new T.Matrix4().makeTranslation(at.x, at.y + 0.008, at.z));
    this.spent.count = Math.min(160, this.spentCount);
    this.spent.instanceMatrix.needsUpdate = true;
  }
  /** A clay breaking: pieces flying with the clay's own way and a puff of its orange dust. */
  private burst(at: Vec, v: Vec, now: number) {
    if (!this.range) return;
    this.dust(at, now, "255,150,80", 2.2);
    for (let k = 0; k < 7; k++) {
      const piece = new T.Mesh(this.range.clay.piece, this.range.clay.paint),
        a = (k / 7) * Math.PI * 2 + Math.random(),
        out = 3 + Math.random() * 4,
        vel = new T.Vector3(v.x * 0.55 + Math.cos(a) * out, v.y * 0.4 + 2 + Math.random() * 3, v.z * 0.55 + Math.sin(a) * out),
        spin = new T.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20),
        p = vec(at);
      piece.position.copy(p);
      this.scene.add(piece);
      let last = now;
      this.effects.push({
        update: (t) => {
          const dt = (t - last) / 1000;
          last = t;
          vel.y -= 9.81 * dt;
          p.addScaledVector(vel, dt);
          piece.position.copy(p);
          piece.rotation.x += spin.x * dt;
          piece.rotation.y += spin.y * dt;
          piece.rotation.z += spin.z * dt;
          return p.y > 0 && t - now < 2500;
        },
        dispose: () => piece.removeFromParent(),
      });
    }
  }
  /** One frame: the world stepped to the wall clock, the eye and the gun, the place, the words, the data for tests. */
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.hold && !this.running()) this.letDown();
    if (this.running()) {
      this.left += real;
      while (this.left >= DT && this.state?.winner === null) {
        this.left -= DT;
        this.report(step(this.world));
      }
    }
    // The eye comes to the sights while the gun is held, stays a moment after a shot, then draws back.
    const want = this.hold || now - this.shotAt < FOLLOW ? 1 : 0,
      speed = want ? 1000 / (RAISE * 0.9) : 1000 / 420;
    this.zoom = want ? Math.min(1, this.zoom + real * speed) : Math.max(0, this.zoom - real * speed);
    if (this.hold) this.offset = wander(this.mode, (now - this.hold.since) / 1000, this.hold.seed);
    else if (now - this.shotAt > FOLLOW) this.offset = { x: this.offset.x * 0.9, y: this.offset.y * 0.9 };
    const busy = reloading(this.world) || (this.world.kind === "clay" && this.world.phase === "rest" && this.world.shells < 2);
    this.lowered += ((busy ? 1 : 0) - this.lowered) * Math.min(1, real * 7);
    this.poseEye(now);
    this.showPlace(now, real);
    this.effects = this.effects.filter((e) => {
      const going = e.update(now);
      if (!going) e.dispose?.();
      return going;
    });
    this.writeHud(now);
    this.writeData(now);
    this.redraw();
  }
  /** The eye and the gun: at rest the eye takes in the place; held up it is on the sight line, the gun turned about its front sight. */
  private poseEye(now: number) {
    const rig = RIGS[this.mode],
      z = this.zoom,
      e = z * z * (3 - 2 * z),
      d = direction(this.aim),
      eye = vec(sightEye(this.mode, this.aim)),
      aimQuat = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(eye, eye.clone().add(vec(d)), UP)),
      since = (now - this.shotAt) / 1000,
      kick = since < 0 ? 0 : since < 0.05 ? since / 0.05 : Math.exp(-(since - 0.05) * 8),
      k = KICK[this.mode];
    // The camera.
    this.camera.position.copy(vec(rig.head)).lerp(eye, e);
    this.camera.quaternion.copy(this.restQuat).slerp(aimQuat, e);
    this.camera.rotateX(k.eye * kick * e);
    const far = Math.tan((rig.restFov * Math.PI) / 360),
      near = Math.tan((rig.aimFov * Math.PI) / 360),
      // A narrow screen widens the field at rest, so that the place is still taken in across.
      wide = Math.max(far, 0.42 / Math.max(0.3, this.camera.aspect)),
      half = Math.exp(Math.log(wide) + (Math.log(near) - Math.log(wide)) * e);
    this.camera.fov = (Math.atan(half) * 360) / Math.PI;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // The gun's camera: at rest the same as the place's, so that the gun stands in the place; aimed, a wider field.
    const gunHalf = Math.exp(Math.log(wide) + (Math.log(Math.tan((rig.gunFov * Math.PI) / 360)) - Math.log(wide)) * e);
    this.gunCamera.position.copy(this.camera.position);
    this.gunCamera.quaternion.copy(this.camera.quaternion);
    this.gunCamera.fov = (Math.atan(gunHalf) * 360) / Math.PI;
    this.gunCamera.aspect = this.camera.aspect;
    this.gunCamera.updateProjectionMatrix();
    this.gunCamera.updateMatrixWorld();
    // The gun: on the swivel at the booth it always points where it aims; held, it is lowered at rest.
    const g = this.gun.root;
    if (this.mode === "bb") {
      g.position.copy(eye);
      g.quaternion.copy(aimQuat);
      this.booth!.yoke.rotation.y = -this.aim.yaw;
    } else {
      const head = vec(rig.head),
        // At the ready: low at the right, pointing a little down into the place.
        restAt = head.clone().add(new T.Vector3(0.14, -0.17, 0.0).applyQuaternion(this.restQuat)),
        restQuat = this.restQuat.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(-0.13, 0.12, 0.12))),
        up = Math.min(1, e * 1.25);
      g.position.copy(restAt).lerp(eye, up);
      g.quaternion.copy(restQuat).slerp(aimQuat, up);
    }
    // Lowered a little while it is reloaded; kicked back and up by a shot.
    g.rotateX(-0.32 * this.lowered);
    g.translateZ(k.back * kick + 0.05 * this.lowered);
    g.rotateX(k.up * kick);
    if (this.gun.action && this.mode === "hunt") this.gun.action.rotation.z = Math.min(1, this.lowered * 1.6) * 1.1 + (since > 0.12 && since < 0.5 ? Math.sin(((since - 0.12) / 0.38) * Math.PI) * 1.1 : 0);
    // The rear sight off the line: the gun turned about its front sight so that its rear stands off by the wander.
    const L = rig.front - rig.rear,
      dx = (this.offset.x * rig.rear) / 1000,
      dy = (this.offset.y * rig.rear) / 1000;
    this.gun.tilt.rotation.set(-dy / L, dx / L, 0, "YXZ");
    this.gun.root.visible = !capturing() || this.mode === "bb";
    // The sights glow green as they come into line.
    const off = misalignment(this.offset),
      lined = this.hold ? Math.max(0, Math.min(1, 1 - (off - LINED_UP) / (LINED_UP * 3))) : 0;
    this.gun.frontDot.color.set("#ff5a2a").lerp(new T.Color("#4dff6e"), lined);
    this.gun.rearDots.color.set(this.mode === "clay" ? "#efe6cf" : "#e8f0ff").lerp(new T.Color("#4dff6e"), lined);
  }
  /** The place as the world has it now. */
  private showPlace(now: number, real: number) {
    const w = this.world;
    if (w.kind === "bb" && this.booth) {
      w.targets.forEach((target, i) => {
        const model = this.booth!.targets[i];
        lightTarget(model, target, w.t);
        // A target struck spins round once and settles.
        const s = w.t - target.struck;
        model.group.rotation.y = s >= 0 && s < 0.6 ? (1 - (1 - s / 0.6) ** 3) * Math.PI * 2 : 0;
      });
      for (const [pellet, mesh] of this.pellets) {
        const f = Math.min(1, (w.t - pellet.born) / Math.max(0.01, pellet.arrive - pellet.born));
        if (f >= 1) {
          mesh.removeFromParent();
          this.pellets.delete(pellet);
          continue;
        }
        // From the muzzle to where it strikes, a little above the straight line: the sights are set for the bays.
        const from = mesh.userData.from ?? (mesh.userData.from = mesh.position.clone()),
          tFlight = pellet.arrive - pellet.born,
          tau = f * tFlight;
        mesh.position.copy(from).lerp(vec(pellet.to), f);
        mesh.position.y += 0.5 * 9.81 * tau * (tFlight - tau);
      }
      this.booth.show(this.state?.score ?? 0, comboNow(w), Math.max(0, COMBO - (w.t - w.lastHit)), w.ammo);
      const flicker = 0.92 + 0.08 * Math.sin(now / 90) * Math.sin(now / 1300);
      for (const m of this.booth.neon) m.color.setRGB(0.24 * flicker, 0.42 * flicker, 1 * flicker);
      return;
    }
    if (w.kind === "clay" && this.clayMesh) {
      const clay = w.clay;
      this.clayMesh.visible = !!clay && w.phase === "flight";
      if (clay) {
        this.clayMesh.position.set(clay.p.x, clay.p.y, clay.p.z);
        this.clayMesh.rotation.set(0.12, (w.t - clay.at) * clay.spin, 0.05);
      }
      this.range?.board(w.card, w.thrown);
      return;
    }
    if (w.kind === "hunt") this.showAnimals(w, now, real);
  }
  /** The animals: each built when it comes out, moved and posed, faded when it has fallen, thrown away when gone. */
  private showAnimals(w: HuntWorld, now: number, real: number) {
    const alive = new Set<number>();
    for (const a of w.animals) {
      alive.add(a.id);
      let shown = this.animals.get(a.id);
      if (!shown) {
        const model = animalModel(a.kind);
        model.root.traverse((o) => (o.castShadow = true));
        this.scene.add(model.root);
        shown = { model, seen: { ...a.p }, step: 0 };
        this.animals.set(a.id, shown);
      }
      const { model } = shown,
        moved = Math.hypot(a.p.x - shown.seen.x, a.p.z - shown.seen.z),
        kind = kindOf(a.kind),
        rate = real > 0 ? moved / real : 0;
      shown.seen = { ...a.p };
      shown.step += moved * (kind.bird ? 0 : a.kind === "rabbit" ? 3.2 : 2.2);
      model.root.position.set(a.p.x, a.p.y, a.p.z);
      model.root.rotation.set(0, a.heading, 0);
      const falling = a.doing === "fall" || a.doing === "down",
        since = w.t - a.since;
      if (kind.bird) {
        const flap = a.doing === "swim" ? 0 : a.doing === "fall" || a.doing === "down" ? 0.2 : Math.sin(w.t * (a.hurt ? 11 : 16) + a.phase) * (a.hurt ? 0.5 + 0.4 * Math.sin(w.t * 3) : 0.9);
        model.wings.forEach((wing, i) => (wing.rotation.z = (i ? -1 : 1) * (flap - 0.1)));
        model.body.rotation.set(a.doing === "fly" || a.doing === "flee" ? -Math.atan2(a.v.y, Math.hypot(a.v.x, a.v.z)) * 0.6 : 0, 0, a.hurt && !falling ? Math.sin(w.t * 7) * 0.35 : 0);
        if (a.doing === "swim") model.root.position.y = LAKE.y + 0.1 + Math.sin(w.t * 2 + a.phase) * 0.02;
        if (falling) model.body.rotation.set(a.doing === "fall" ? since * 9 : Math.PI, 0, a.doing === "fall" ? since * 5 : 0.4);
      } else {
        // Walking, the legs swing in pairs (a limping leg stiff); grazing, the head goes down; fallen, it lies on its side.
        const swing = Math.min(1, rate / 2.5) * 0.55;
        model.legs.forEach((leg, i) => {
          const pair = i === 0 || i === 3 ? 0 : Math.PI,
            limp = a.hurt === "legs" && i === 1 ? 0.2 : 1;
          leg.rotation.x = falling ? 0.25 : Math.sin(shown!.step + pair) * swing * limp;
        });
        model.head.rotation.x = a.doing === "graze" ? 0.9 : Math.sin(shown.step * 2) * 0.04 * swing;
        const roll = falling ? Math.min(1, since / 0.7) : 0,
          lean = a.hurt === "legs" && !falling ? Math.sin(shown.step) * 0.08 : 0;
        model.body.rotation.set(0, 0, roll * roll * (Math.PI / 2) * 0.95 + lean);
        model.body.position.y = falling ? -roll * 0.1 : a.kind === "rabbit" ? Math.abs(Math.sin(shown.step)) * 0.12 * swing : 0;
      }
      // A fallen animal fades away, with a puff once it is down.
      if (a.doing === "down") {
        const fade = Math.max(0, 1 - since / FADE);
        for (const p of model.paints) (p as T.MeshStandardMaterial).opacity = fade;
        if (!model.root.userData.puffed) {
          model.root.userData.puffed = true;
          this.dust({ x: a.p.x, y: a.p.y + 0.2, z: a.p.z }, now, kind.bird ? "245,240,230" : "190,175,150", kind.bird ? 1 : 1.6);
        }
      }
    }
    for (const [id, shown] of this.animals)
      if (!alive.has(id)) {
        shown.model.root.removeFromParent();
        for (const p of shown.model.paints) p.dispose();
        for (const g of shown.model.geometries) g.dispose();
        this.animals.delete(id);
      }
    if (this.forest) {
      const map = (this.forest.water.material as T.MeshStandardMaterial).map;
      if (map) map.offset.x = (now / 60000) % 1;
    }
  }
  /** The figures over the place: score, what is left in the gun, the combo or the clock. */
  private writeHud(now: number) {
    const s = this.state,
      w = this.world;
    if (!s) return;
    const box = (label: string, value: string | number, cls = "") => `<div class="sh-box${cls ? ` ${cls}` : ""}"><small>${label}</small><b>${value}</b></div>`,
      dots = (full: number, of: number, cls: string) => `<span class="sh-rounds ${cls}">${Array.from({ length: of }, (_, k) => `<i${k < full ? " class=on" : ""}></i>`).join("")}</span>`;
    let html = "";
    if (w.kind === "bb") {
      const combo = comboNow(w);
      html =
        box("점수", s.score, "big") +
        `<div class="sh-box"><small>BB탄</small><b>${w.ammo}</b>${dots(w.mag, BB_MAG, "bb")}</div>` +
        (combo > 1 ? box("콤보", `×${Math.min(5, combo)}`, "combo") : "") +
        (w.reloadUntil > w.t ? `<div class="sh-note">장전 중…</div>` : w.ammo <= 0 && !w.done ? `<div class="sh-note">마지막 탄이 날아가는 중</div>` : "");
    } else if (w.kind === "clay") {
      const card = (w as ClayWorld).card;
      html =
        box("명중", `${broken(s)}<em>/${CLAYS}</em>`, "big") +
        `<div class="sh-box"><small>${Math.min(CLAYS, w.thrown)}번째 접시</small>${dots(w.shells, 2, "shell")}</div>` +
        `<div class="sh-card">${Array.from({ length: CLAYS }, (_, k) => `<i${card[k] !== undefined ? ` class="${card[k] ? "x" : "o"}"` : ""}></i>`).join("")}</div>`;
    } else {
      const m = Math.floor(s.left / 60),
        sec = String(s.left % 60).padStart(2, "0");
      html =
        box("점수", s.score, "big") +
        box("남은 시간", `${m}:${sec}`) +
        `<div class="sh-box"><small>탄</small><b>${w.ammo}</b>${dots(w.mag, HUNT_MAG, "rifle")}</div>` +
        (w.reloadUntil > w.t ? `<div class="sh-note">장전 중…</div>` : "") +
        (s.bag.some((n) => n) ? `<div class="sh-bag">${KINDS.map((k, i) => (s.bag[i] ? `<span>${k.name} ${s.bag[i]}</span>` : "")).join("")}</div>` : "");
    }
    if (html !== this.hudText) {
      this.hudText = html;
      this.hud.innerHTML = html;
    }
    this.hud.hidden = capturing();
    void now;
  }
  /** What a browser test needs to aim with: the aim, the sights' offset, and each thing to shoot at (on the canvas and as an aim). */
  private writeData(now: number) {
    const el = this.renderer.domElement,
      w = this.world,
      width = el.clientWidth,
      height = el.clientHeight,
      mrad = (a: Aim) => `${(a.yaw * 1000).toFixed(1)},${(a.pitch * 1000).toFixed(1)}`,
      place = (p: Vec) => {
        const v = vec(p).project(this.camera),
          aim = aimAt(this.mode, p);
        return { x: Math.round(((v.x + 1) / 2) * width), y: Math.round(((1 - v.y) / 2) * height), yaw: Math.round(aim.yaw * 10000) / 10, pitch: Math.round(aim.pitch * 10000) / 10, ahead: v.z < 1 };
      };
    const targets: Record<string, unknown>[] = [];
    if (w.kind === "bb") w.targets.forEach((t, i) => t.lit && targets.push({ i, lit: t.lit, ...place(t) }));
    else if (w.kind === "clay") {
      if (w.clay && w.phase === "flight") targets.push({ i: w.thrown, ...place(w.clay.p), v: [w.clay.v.x, w.clay.v.y, w.clay.v.z].map((n) => Math.round(n * 100) / 100) });
    } else
      for (const a of w.animals)
        if (a.doing !== "fall" && a.doing !== "down") {
          const body = this.middle(a),
            head = partAt(a, kindOf(a.kind).parts.find((p) => p.zone === "head")!);
          targets.push({ i: a.id, kind: a.kind, health: a.health, doing: a.doing, ...place(body), head: place(head) });
        }
    const set = (key: string, value: string) => {
      if (el.dataset[key] !== value) el.dataset[key] = value;
    };
    set("mode", this.mode);
    set("holding", String(!!this.hold));
    set("zoom", this.zoom.toFixed(2));
    set("aim", mrad(this.aim));
    set("offset", this.hold ? `${this.offset.x.toFixed(2)},${this.offset.y.toFixed(2)}` : "");
    set("lined", String(!!this.hold && now - this.hold.since >= RAISE && misalignment(this.offset) <= LINED_UP));
    set("loaded", String(ready(w)));
    set("targets", JSON.stringify(targets));
    set("score", String(this.state?.score ?? 0));
    set("phase", w.kind === "clay" ? w.phase : w.kind === "hunt" ? (w.done ? "over" : "hunt") : w.done ? "over" : "round");
  }
  protected subject(): TableSubject {
    return SHOOT_SUBJECT;
  }
  protected resize() {
    super.resize();
    this.poseEye(performance.now());
  }
  /** Every press is the hand's, never a pick. */
  protected dragStart() {
    return true;
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new round, known by the count of moves going back to nothing (or a tier other than the world's).
    const anew = state.ply === 0 && this.shown > 0,
      tier = this.world.kind === "bb" ? this.world.tier : 0;
    this.shown = state.ply;
    if (anew || (state.ply === 0 && state.tier !== tier)) this.restart(state);
  }
  /** Starts the place afresh: a new world, nothing in the air, the bays swept. */
  private restart(state: State) {
    this.world = createWorld(this.mode, state.tier, (cryptoRandom() * 2147483647) | 0);
    for (const e of this.effects) e.dispose?.();
    this.effects = [];
    for (const mesh of this.pellets.values()) mesh.removeFromParent();
    this.pellets.clear();
    if (this.spent) this.spent.count = this.spentCount = 0;
    for (const [, shown] of this.animals) {
      shown.model.root.removeFromParent();
      for (const p of shown.model.paints) p.dispose();
      for (const g of shown.model.geometries) g.dispose();
    }
    this.animals.clear();
    this.left = 0;
    this.letDown();
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    for (const e of this.effects) e.dispose?.();
    this.effects = [];
    for (const [, shown] of this.animals) {
      for (const p of shown.model.paints) p.dispose();
      for (const g of shown.model.geometries) g.dispose();
    }
    this.hud.remove();
    super.dispose();
  }
}
