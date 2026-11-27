import * as T from "three";
import { cameraDistance } from "../../engine/camera";
import { capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot as TapSpot, type TableSubject } from "../table/view";
import { FELT, H, ROW, SPOTS, W, cellOf, payoutOf, spotAt } from "./bets";
import { CHIP_H, CHIP_R, ChipKit, ChipPile } from "./chips";
import { FELT_AT, FELT_Y, WHEEL_AT, WHEEL_BASE, WHEEL_SCALE, WHEEL_SUBJECT, betCamera, betSubject, spotPlace } from "./layout";
import { buildRoom } from "./room";
import { CASH, CHIP, CHIPS, CLEAR, REBET, SPIN, UNDO, canBet, canRebet, staked, type State } from "./rules";
import { BALL_R, ORDER, POCKET_IN, SLOT, colourOf, runSpin, type Frame } from "./sim";
import { ballMaterial, buildWheel, floorY, metal } from "./wheel";

export const ROULETTE_COLORS: [string, string] = ["#c9a13b", "#1d6b3f"];
/** The most chips a stack shows (a bigger bet is told by its top chips and its height); more go into a second stack beside it. */
const STACK_MOST = 10;
/** How long the camera takes to come down to the wheel and to go back, how long the result is looked at, and how long the croupier takes to settle the bets. */
const TO_WHEEL = 700,
  LOOK = 1700,
  BACK = 800,
  SETTLE = 1500;
const RED = "#b52a24",
  BLACK = "#1b1b1f",
  GREEN = "#13804a";
const paintOf = (n: number) => (colourOf(n) === "red" ? RED : colourOf(n) === "black" ? BLACK : GREEN);
const ease = (p: number) => p * p * (3 - 2 * p);
const clamp01 = (p: number) => Math.max(0, Math.min(1, p));
type Keep = <R extends { dispose(): void }>(r: R) => R;

function canvasTexture(keep: Keep, w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = keep(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** The printed felt: the numbers in their red and black cells, 0, the columns' 2 to 1, the dozens and the even chances, in cream and gold on green baize. */
function feltTexture(keep: Keep) {
  const PX = 560,
    width = (FELT.right - FELT.left) * PX,
    depth = (FELT.near - FELT.far) * PX,
    px = (x: number) => (x - FELT.left) * PX,
    pz = (z: number) => (z - FELT.far) * PX;
  return canvasTexture(keep, Math.round(width), Math.round(depth), (pen) => {
    pen.fillStyle = "#0f5a36";
    pen.fillRect(0, 0, width, depth);
    // The baize's nap: faint flecks, lighter and darker.
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 26000; k++) {
      pen.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
      pen.fillRect(rnd() * width, rnd() * depth, 2, 2);
    }
    const line = "#f1e3b6",
      gold = "#d5ae55",
      box = (x0: number, z0: number, x1: number, z1: number, fill?: string) => {
        if (fill) {
          const g = pen.createLinearGradient(0, pz(z0), 0, pz(z1)),
            c = new T.Color(fill);
          g.addColorStop(0, `#${c.clone().lerp(new T.Color("#ffffff"), 0.08).getHexString()}`);
          g.addColorStop(1, `#${c.clone().multiplyScalar(0.86).getHexString()}`);
          pen.fillStyle = g;
          pen.fillRect(px(x0) + 9, pz(z0) + 9, (x1 - x0) * PX - 18, (z1 - z0) * PX - 18);
        }
        pen.strokeStyle = line;
        pen.lineWidth = 6;
        pen.strokeRect(px(x0), pz(z0), (x1 - x0) * PX, (z1 - z0) * PX);
      },
      write = (text: string, x: number, z: number, size: number, colour = line, turn = 0, serif = true) => {
        pen.save();
        pen.translate(px(x), pz(z));
        pen.rotate(turn);
        pen.fillStyle = colour;
        pen.shadowColor = "rgba(0,0,0,0.45)";
        pen.shadowBlur = 4;
        pen.shadowOffsetY = 2;
        pen.font = serif ? `700 ${size}px "Georgia", "Times New Roman", serif` : `800 ${size}px "Inter", "Noto Sans KR", sans-serif`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(text, 0, 0);
        pen.restore();
      };
    const left = -6 * W,
      far = -1.5 * H,
      near = 1.5 * H;
    for (let n = 1; n <= 36; n++) {
      const c = cellOf(n);
      box(c.x - W / 2, c.z - H / 2, c.x + W / 2, c.z + H / 2, paintOf(n));
      write(String(n), c.x, c.z, 104, "#fbf3dc");
    }
    // 0: a tall cell with a pointed end.
    pen.fillStyle = GREEN;
    pen.beginPath();
    pen.moveTo(px(left), pz(far));
    pen.lineTo(px(left - W * 0.55), pz(far));
    pen.lineTo(px(left - W), pz(0));
    pen.lineTo(px(left - W * 0.55), pz(near));
    pen.lineTo(px(left), pz(near));
    pen.closePath();
    pen.fill();
    pen.strokeStyle = line;
    pen.lineWidth = 6;
    pen.stroke();
    write("0", left - W * 0.45, 0, 120, "#fbf3dc");
    for (let r = 0; r < 3; r++) {
      box(-left, far + r * H, -left + W, far + (r + 1) * H);
      write("2 to 1", -left + W / 2, far + (r + 0.5) * H, 50, gold, -Math.PI / 2);
    }
    ["1st 12", "2nd 12", "3rd 12"].forEach((text, d) => {
      box(left + 4 * d * W, near, left + 4 * (d + 1) * W, near + ROW);
      write(text, left + (4 * d + 2) * W, near + ROW / 2, 84, gold);
    });
    ["1~18", "짝수", "", "", "홀수", "19~36"].forEach((text, k) => {
      const x0 = left + 2 * k * W;
      box(x0, near + ROW, x0 + 2 * W, near + 2 * ROW);
      if (text) write(text, x0 + W, near + ROW * 1.5, 76, line, 0, false);
      else {
        // The red and black diamonds.
        const cx = px(x0 + W),
          cz = pz(near + ROW * 1.5);
        pen.fillStyle = k === 2 ? RED : BLACK;
        pen.beginPath();
        pen.moveTo(cx - 108, cz);
        pen.lineTo(cx, cz - 60);
        pen.lineTo(cx + 108, cz);
        pen.lineTo(cx, cz + 60);
        pen.closePath();
        pen.fill();
        pen.strokeStyle = gold;
        pen.lineWidth = 5;
        pen.stroke();
      }
    });
    // A fine gold line round the whole layout.
    pen.strokeStyle = gold;
    pen.lineWidth = 4;
    pen.strokeRect(3, 3, width - 6, depth - 6);
  });
}
/** The chips that make up `amount`, largest first. */
export function chipsOf(amount: number) {
  const out: number[] = [];
  let rest = amount;
  for (const value of [...CHIPS].reverse())
    while (rest >= value) {
      out.push(value);
      rest -= value;
    }
  return out;
}

/**
 * The roulette table (see `rules.ts` and `sim.ts`): a casino's table at night, the betting layout printed on its
 * baize and the wheel (`wheel.ts`) at its left end, under a long lamp (`room.ts`). A tap on the layout bets the chosen
 * chip there (the spot under it, by `spotAt`); the chips, the bets' buttons and the recent numbers stand over the
 * table's foot (the page's own controls, which play their moves through `onMove`). A spin is shown from the state's
 * seed: the camera comes down over the wheel and drifts round it while the rotor turns and the ball runs round,
 * drops, clicks over the diamonds and frets and comes to rest in the pocket the rules have already counted; the
 * camera leans in to the pocket, then goes back to the layout, where the dolly is set on the number, the losing chips
 * are swept to the chip float and the winnings are paid out beside the winning bets.
 */
export class RouletteView extends TableView<State> {
  private wheel = new T.Group();
  private rotor: T.Group;
  private ball: T.Mesh;
  private kit: ChipKit;
  private pile: ChipPile;
  private bank: ChipPile;
  private dolly: T.Group;
  private glow: T.Mesh;
  private rings = new T.Group();
  private ghost: T.Mesh;
  private cursor: T.Mesh;
  private hovered = -1;
  /** 0 over the layout, 1 down over the wheel; `close` leans in to the ball's pocket, `swing` turns round the wheel. */
  private focus = 0;
  private close = 0;
  private swing = 0;
  private tablePose = { position: new T.Vector3(), target: new T.Vector3() };
  private rotorAngle = 0;
  private ballSlot = -1;
  private spinning = false;
  /** While the ball runs: the state before the spin, which the table and the bar keep showing (the number is not told before it is seen). */
  private spinFrom: State | null = null;
  /** Where the croupier's float keeps its columns of chips (lost chips go to them, winnings come from them). */
  private float: { x: number; z: number; w: number; d: number };
  private bar: HTMLElement;
  private history: HTMLElement;
  onKnock?: ((kind: string, strength: number) => void) | null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#120c0a");
    const rich = capable(),
      keep: Keep = (r) => this.own(r);
    // The far room fades into the dark (where a graphics card draws; the processor is spared the per-pixel fog).
    if (rich) this.scene.fog = new T.Fog("#120c0a", 14, 30);
    this.scene.add(new T.HemisphereLight("#ffe7c8", "#2a1410", 1.25));
    const lamp = new T.DirectionalLight("#fff0d8", 2.0);
    lamp.position.set(-1.5, 9, 3.5);
    lamp.castShadow = rich;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.left = -6;
    lamp.shadow.camera.right = 4;
    lamp.shadow.camera.top = 3;
    lamp.shadow.camera.bottom = -3;
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp);
    if (rich) {
      // The lamp's pools of light on the wheel and on the layout.
      for (const [x, z, power] of [
        [WHEEL_AT.x, WHEEL_AT.z, 26],
        [FELT_AT.x, FELT_AT.z + 0.1, 18],
      ] as const) {
        const spot = new T.SpotLight("#ffe2b4", power, 9, 0.55, 0.65, 1.4);
        spot.position.set(x, 4.2, z + 0.4);
        spot.target.position.set(x, 0, z);
        this.scene.add(spot, spot.target);
      }
    } else this.renderer.shadowMap.enabled = false;
    const room = buildRoom(this.scene, keep, rich);
    this.float = room.float;
    // The wheel.
    this.wheel.position.set(WHEEL_AT.x, WHEEL_BASE, WHEEL_AT.z);
    this.wheel.scale.setScalar(WHEEL_SCALE);
    const wheel = buildWheel(keep, rich, -WHEEL_BASE / WHEEL_SCALE);
    this.rotor = wheel.rotor;
    this.wheel.add(wheel.stator, wheel.rotor);
    this.scene.add(this.wheel);
    // The layout printed on the baize.
    const print = new T.Mesh(keep(new T.PlaneGeometry(FELT.right - FELT.left, FELT.near - FELT.far)), keep(new T.MeshStandardMaterial({ map: feltTexture(keep), roughness: 0.92 })));
    print.rotation.x = -Math.PI / 2;
    print.position.set(FELT_AT.x + (FELT.left + FELT.right) / 2, FELT_Y - 0.001, FELT_AT.z + (FELT.far + FELT.near) / 2);
    print.receiveShadow = true;
    this.scene.add(print);
    if (!rich)
      // Where the processor draws, a picture seen at a slant is not filtered more finely than the old table's were
      // (anisotropic filtering costs it dearly): only the layout keeps its fine filtering.
      this.scene.traverse((thing) => {
        const material = (thing as T.Mesh).material as T.MeshStandardMaterial | undefined;
        for (const m of Array.isArray(material) ? material : material ? [material] : []) if (m.map && thing !== print) m.map.anisotropy = 1;
      });
    // The chips: those on the layout (and on their way), and the float's columns.
    this.kit = new ChipKit(keep, rich);
    this.pile = new ChipPile(this.kit, keep, rich, 260);
    this.bank = new ChipPile(this.kit, keep, false, 120);
    this.scene.add(this.pile.group, this.bank.group, this.rings);
    this.bank.begin();
    room.columns.forEach((c, k) => {
      const value = CHIPS[3 - Math.floor(k / 2)],
        high = (rich ? 9 : 6) + ((k * 5) % 4);
      for (let n = 0; n < high; n++) this.bank.put(value, c.x + Math.sin(n * 2.1 + k) * 0.003, 0.03 + CHIP_H * (n + 0.5), c.z + Math.cos(n * 1.3 + k) * 0.003, n * 0.7 + k);
    });
    this.bank.end();
    this.pile.begin();
    this.pile.end();
    // The dolly on the winning number: a cut-glass column under a gold crown; and the cell's glow under it.
    this.dolly = new T.Group();
    const glassShape = [
        [0.0, 0.0],
        [0.07, 0.0],
        [0.075, 0.012],
        [0.055, 0.03],
        [0.05, 0.16],
        [0.062, 0.18],
        [0.062, 0.19],
        [0.0, 0.19],
      ].map(([r, y]) => new T.Vector2(r, y)),
      glass = new T.Mesh(
        keep(new T.LatheGeometry(glassShape, rich ? 12 : 8)),
        keep(new T.MeshStandardMaterial({ color: "#e4f0ff", transparent: true, opacity: 0.55, roughness: 0.06, metalness: 0.2, flatShading: true })),
      ),
      crown = new T.Mesh(
        keep(
          new T.LatheGeometry(
            [
              [0.0, 0.19],
              [0.064, 0.19],
              [0.068, 0.2],
              [0.05, 0.215],
              [0.03, 0.225],
              [0.02, 0.245],
              [0.0, 0.25],
            ].map(([r, y]) => new T.Vector2(r, y)),
            rich ? 24 : 12,
          ),
        ),
        metal(keep, rich, "#e2b64c", 0.22),
      );
    glass.castShadow = crown.castShadow = rich;
    this.dolly.add(glass, crown);
    this.dolly.visible = false;
    this.scene.add(this.dolly);
    this.glow = new T.Mesh(keep(new T.PlaneGeometry(W * 0.92, H * 0.92)), keep(new T.MeshBasicMaterial({ color: "#ffe680", transparent: true, opacity: 0.35, depthWrite: false })));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.scene.add(this.glow);
    this.ghost = new T.Mesh(this.kit.geometry, keep(new T.MeshBasicMaterial({ color: "#fff6cf", transparent: true, opacity: 0.45, depthWrite: false })));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.cursor = new T.Mesh(keep(new T.RingGeometry(CHIP_R * 1.15, CHIP_R * 1.45, 32)), keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.ball = new T.Mesh(keep(new T.SphereGeometry(BALL_R * WHEEL_SCALE, rich ? 28 : 18, rich ? 18 : 12)), ballMaterial(keep, rich));
    this.ball.castShadow = rich;
    this.ball.visible = false;
    this.scene.add(this.ball);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -FELT_Y);
    // The page's own controls over the table: the chips, the bets' buttons, the balance; and the numbers lately come.
    this.bar = document.createElement("div");
    this.bar.className = "rl-bar";
    this.bar.innerHTML =
      `<div class="rl-chips" role="group" aria-label="칩 고르기">${CHIPS.map((v, k) => `<button class="rl-chip rl-chip-${v}" data-chip="${k}" aria-label="${v}칩" aria-pressed="false"><span>${v}</span></button>`).join("")}</div>` +
      `<p class="rl-purse" aria-live="polite"></p>` +
      `<div class="rl-acts"><button data-act="${UNDO}">되돌리기</button><button data-act="${CLEAR}">지우기</button><button data-act="${REBET}">다시 걸기</button><button data-act="${CASH}">일어나기</button><button class="rl-spin" data-act="${SPIN}">돌리기</button></div>`;
    this.bar.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest("button");
      if (!button || button.disabled || this.animating) return;
      const to = button.dataset.chip !== undefined ? CHIP + Number(button.dataset.chip) : Number(button.dataset.act);
      this.onMove({ from: -1, to, extra: -1 });
    });
    this.history = document.createElement("div");
    this.history.className = "rl-history";
    this.history.setAttribute("aria-label", "최근 나온 숫자");
    host.append(this.bar, this.history);
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    return betSubject(aspect);
  }
  protected spots(): TapSpot[] {
    return [];
  }
  /** The spot under the pointer, by where the ray meets the felt. */
  protected pick(ray: T.Ray) {
    if (this.focus > 0.01) return -1;
    const at = new T.Vector3();
    if (!ray.intersectPlane(this.floor, at)) return -1;
    return spotAt(at.x - FELT_AT.x, at.z - FELT_AT.z);
  }
  protected hover(point: number) {
    this.hovered = point;
    this.showGhost();
  }
  private showGhost() {
    const s = this.state,
      ok = !!s && this.hovered >= 0 && !this.spinning && canBet(s, this.hovered) && !capturing();
    this.ghost.visible = ok;
    if (ok) {
      const p = spotPlace(this.hovered),
        height = Math.min(STACK_MOST, chipsOf(s!.bets[this.hovered]).length);
      this.ghost.position.set(p.x, p.y + CHIP_H * (height + 0.5), p.z);
    }
  }
  /** The ball's place in the world now. */
  private ballAt() {
    return this.ball.position.clone();
  }
  /**
   * The camera between its pose over the layout and its pose over the wheel: over the wheel it stands where
   * `swing` turns it round the wheel's middle, and `close` brings it down toward the ball in its pocket.
   */
  private aimCamera() {
    const p = ease(this.focus);
    this.renderer.domElement.dataset.focus = this.focus.toFixed(2);
    if (p <= 0) {
      this.camera.position.copy(this.tablePose.position);
      this.camera.lookAt(this.tablePose.target);
      return;
    }
    const aspect = this.camera.aspect,
      d = cameraDistance(aspect, false, WHEEL_SUBJECT),
      c = ease(this.close),
      // The middle a little toward the viewer, so the wheel stands clear above the bar of chips at the foot.
      middle = new T.Vector3(WHEEL_AT.x + Math.sin(this.swing) * 0.2, WHEEL_BASE + WHEEL_SUBJECT.lookY, WHEEL_AT.z + Math.cos(this.swing) * 0.2),
      target = middle.clone().lerp(this.ballAt(), c * 0.85),
      tilt = WHEEL_SUBJECT.tilt + c * 0.22,
      reach = d * (1 - 0.42 * c),
      way = new T.Vector3(Math.sin(this.swing) * Math.cos(tilt), Math.sin(tilt), Math.cos(this.swing) * Math.cos(tilt)),
      position = target.clone().addScaledVector(way, reach);
    this.camera.position.lerpVectors(this.tablePose.position, position, p);
    this.camera.lookAt(new T.Vector3().lerpVectors(this.tablePose.target, target, p));
  }
  protected resize() {
    super.resize();
    const pose = betCamera(this.camera.aspect);
    this.tablePose.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.tablePose.target.set(pose.target.x, pose.target.y, pose.target.z);
    this.aimCamera();
  }
  /** The ball resting in the pocket of `slot`, the rotor turned to `rotor`. */
  private restBall(slot: number) {
    this.ballSlot = slot;
    if (slot < 0) {
      this.ball.visible = false;
      return;
    }
    const a = this.rotorAngle + (slot + 0.5) * SLOT,
      r = POCKET_IN + BALL_R;
    this.ball.visible = true;
    this.ball.position.set(WHEEL_AT.x + Math.cos(a) * r * WHEEL_SCALE, WHEEL_BASE + (floorY(r) + BALL_R) * WHEEL_SCALE, WHEEL_AT.z - Math.sin(a) * r * WHEEL_SCALE);
  }
  private poseFrame(f: Frame) {
    this.renderer.domElement.dataset.ball = f.phase;
    this.rotorAngle = f.rotor;
    this.rotor.rotation.y = f.rotor;
    this.ball.visible = true;
    this.ball.position.set(WHEEL_AT.x + f.x * WHEEL_SCALE, WHEEL_BASE + (f.y + BALL_R) * WHEEL_SCALE, WHEEL_AT.z + f.z * WHEEL_SCALE);
  }
  /** Where the chips of a stack at a spot go: the bet at the spot, the winnings in a stack just right of it. */
  private stackAt(id: number, winnings = false) {
    const p = spotPlace(id);
    return winnings ? { x: p.x + CHIP_R * 1.55, z: p.z + CHIP_R * 0.55 } : { x: p.x, z: p.z };
  }
  /** Lays `amount` as chips in a stack (and another beside it when tall) at (x, z); `jitter` keeps each stack its own. */
  private lay(amount: number, x: number, z: number, key: number) {
    const list = chipsOf(amount);
    list.forEach((value, k) => {
      const column = Math.floor(k / STACK_MOST),
        n = k % STACK_MOST;
      if (column > 1) return;
      this.pile.put(value, x + column * CHIP_R * 2.05 + Math.sin(k * 2.3 + key) * 0.005, FELT_Y + CHIP_H * (n + 0.5), z + Math.cos(k * 1.7 + key) * 0.005, k * 0.9 + key);
    });
  }
  /** The chips on the layout, as `bets` has them (with the winnings beside the bets that won, after a spin). */
  private stack(bets: number[], won: Set<number> | null) {
    this.pile.begin();
    for (const child of [...this.rings.children]) child.removeFromParent();
    bets.forEach((amount, id) => {
      if (amount <= 0) return;
      const at = this.stackAt(id);
      this.lay(amount, at.x, at.z, id);
      if (won?.has(id)) {
        const pay = this.stackAt(id, true);
        this.lay(amount * payoutOf(SPOTS[id].numbers.length), pay.x, pay.z, id + 7);
        const ring = new T.Mesh(this.cursor.geometry, this.glow.material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(at.x, FELT_Y + 0.002, at.z);
        ring.scale.setScalar(1.05);
        this.rings.add(ring);
      }
    });
    this.pile.end();
  }
  protected place(now: State) {
    // A spin whose animation was cut off (the table laid out afresh while it ran) is over: the ball goes to its pocket.
    if (this.spinning && !this.animating) {
      this.spinning = false;
      this.spinFrom = null;
      this.close = 0;
      this.swing = 0;
      this.onKnock?.("roll", 0);
    }
    const state = this.spinning && this.spinFrom ? this.spinFrom : now,
      r = state.result,
      showing = !!r && staked(state) === 0;
    // After a spin the losing chips are gone to the float; the winning bets stay, glowing, their winnings beside them, until the next bet is laid.
    const won = new Set(r?.won ?? []);
    this.stack(showing ? (state.lastBets ?? state.bets).map((amount, id) => (won.has(id) ? amount : 0)) : state.bets, showing ? won : null);
    // The dolly stays on the last number until then too.
    this.dolly.visible = this.glow.visible = showing;
    if (showing) this.setDolly(r!.number, 1);
    if (!this.spinning) {
      this.focus = 0;
      this.aimCamera();
      this.restBall(r ? ORDER.indexOf(r.number) : -1);
    }
    this.controls(state);
    this.showGhost();
    const canvas = this.renderer.domElement;
    canvas.dataset.phase = this.spinning ? "spin" : "bet";
    canvas.dataset.result = r ? String(r.number) : "";
    canvas.dataset.spins = String(now.spins);
  }
  /** The dolly over `number`'s cell, `p` of the way down onto it (it is set down from above). */
  private setDolly(number: number, p: number) {
    const c = cellOf(number),
      x = c.x + FELT_AT.x,
      z = c.z + FELT_AT.z,
      fall = 1 - ease(clamp01(p));
    this.dolly.position.set(x, FELT_Y + 0.9 * fall, z);
    this.dolly.visible = true;
    this.glow.visible = p >= 1;
    this.glow.position.set(x, FELT_Y + 0.001, z);
    this.glow.scale.set(1, number === 0 ? 3 : 1, 1);
  }
  /** The bar's buttons, the balance and the recent numbers, as the state has them. */
  private controls(state: State) {
    const busy = this.spinning || state.winner !== null,
      on = staked(state);
    this.bar.querySelectorAll<HTMLButtonElement>("[data-chip]").forEach((button) => {
      const k = Number(button.dataset.chip);
      button.setAttribute("aria-pressed", String(k === state.chip));
      button.disabled = busy || CHIPS[k] > state.balance + on;
    });
    const act = (to: number, ok: boolean) => {
      const button = this.bar.querySelector<HTMLButtonElement>(`[data-act="${to}"]`)!;
      button.disabled = busy || !ok;
    };
    act(UNDO, state.placed.length > 0);
    act(CLEAR, state.placed.length > 0);
    act(REBET, canRebet(state));
    act(SPIN, state.placed.length > 0);
    act(CASH, state.placed.length === 0);
    this.bar.querySelector<HTMLButtonElement>(`[data-act="${REBET}"]`)!.hidden = !canRebet(state);
    this.bar.querySelector<HTMLButtonElement>(`[data-act="${CASH}"]`)!.hidden = state.placed.length > 0;
    this.bar.querySelector(".rl-purse")!.innerHTML = `<span>칩 <b>${state.balance}</b></span><span>건 칩 <b>${on}</b></span>`;
    this.history.innerHTML = state.history.map((n, k) => `<i class="rl-n rl-${colourOf(n)}${k === 0 ? " rl-last" : ""}">${n}</i>`).join("");
  }
  /**
   * The croupier's settling, `ms` into it: the losing chips swept off to the float (one bet after another), the
   * winnings counted out of the float and slid beside the bets that won, the dolly set down on the number.
   */
  private settle(ms: number, bets: number[], won: Set<number>, number: number) {
    const float = this.float;
    this.pile.begin();
    let lost = 0,
      paid = 0;
    bets.forEach((amount, id) => {
      if (amount <= 0) return;
      const at = this.stackAt(id);
      if (won.has(id)) {
        this.lay(amount, at.x, at.z, id);
        // The winnings: chip by chip out of the float, on an arc, onto their stack.
        const pay = this.stackAt(id, true),
          list = chipsOf(amount * payoutOf(SPOTS[id].numbers.length));
        list.forEach((value, k) => {
          const column = Math.floor(k / STACK_MOST),
            n = k % STACK_MOST;
          if (column > 1) return;
          const start = 520 + paid * 45 + k * 32,
            p = ease(clamp01((ms - start) / 420)),
            from = { x: float.x - float.w / 2 + ((1 + 2 * (3 - CHIPS.indexOf(value))) / 8) * float.w, y: 0.3, z: float.z },
            to = { x: pay.x + column * CHIP_R * 2.05, y: FELT_Y + CHIP_H * (n + 0.5), z: pay.z };
          if (ms < start) return;
          this.pile.put(value, from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p + Math.sin(Math.PI * p) * 0.35, from.z + (to.z - from.z) * p, k * 0.9 + id + 7);
        });
        paid++;
        return;
      }
      // The lost bet: swept as one stack over the felt to the float, shrinking into it.
      const start = lost * 90,
        p = ease(clamp01((ms - start) / 560)),
        to = { x: float.x + (((id * 37) % 7) - 3) * 0.2, z: float.z };
      lost++;
      if (p >= 1) return;
      chipsOf(amount)
        .slice(0, STACK_MOST)
        .forEach((value, k) => this.pile.put(value, at.x + (to.x - at.x) * p, FELT_Y + CHIP_H * (k + 0.5) + Math.sin(Math.PI * p) * 0.06, at.z + (to.z - at.z) * p, k * 0.9 + id, 0, 1 - 0.35 * p));
    });
    this.pile.end();
    this.setDolly(number, ms / 320);
  }
  protected animate(before: State, state: State) {
    if (state.spins !== before.spins + 1 || !state.result) return false;
    const spin = runSpin(state.result.seed),
      frames = spin.frames,
      run = spin.time * 1000,
      settleAt = TO_WHEEL + run + LOOK + BACK,
      total = settleAt + SETTLE,
      bets = before.bets,
      won = new Set(state.result.won),
      number = state.result.number,
      anyLost = bets.some((amount, id) => amount > 0 && !won.has(id));
    this.spinning = true;
    this.spinFrom = { ...before, result: null };
    this.ghost.visible = this.cursor.visible = false;
    this.dolly.visible = this.glow.visible = false;
    for (const child of [...this.rings.children]) child.removeFromParent();
    this.renderer.domElement.dataset.phase = "spin";
    let shown = 0,
      swept = false,
      counted = false;
    this.poseFrame(frames[0]);
    this.tween(0, total, (p) => {
      const ms = p * total;
      this.focus = ms < TO_WHEEL ? ms / TO_WHEEL : ms < TO_WHEEL + run + LOOK ? 1 : clamp01(1 - (ms - TO_WHEEL - run - LOOK) / BACK);
      // The camera drifts round the wheel while the ball runs, and leans in to its pocket once it lies there.
      this.swing = -0.32 + 0.5 * clamp01((ms - TO_WHEEL) / Math.max(1, run + LOOK));
      this.close = ms < TO_WHEEL + run ? 0 : ms < TO_WHEEL + run + LOOK ? clamp01((ms - TO_WHEEL - run) / 700) : clamp01(1 - (ms - TO_WHEEL - run - LOOK) / BACK);
      const t = Math.max(0, ms - TO_WHEEL) / 1000,
        index = Math.min(frames.length - 1, Math.floor(t * 60));
      for (; shown <= index; shown++) this.hear(frames[shown]);
      this.poseFrame(frames[index]);
      const f = frames[index];
      // The ball rolling round the track and the cone (louder the quicker), silent in its pocket.
      const next = frames[Math.min(frames.length - 1, index + 1)],
        speed = Math.hypot(next.x - f.x, next.z - f.z) * 60;
      this.onKnock?.("roll", f.phase === "rest" || ms > TO_WHEEL + run ? 0 : Math.min(1, speed / 5));
      if (ms >= settleAt) {
        if (!swept && anyLost) this.onKnock?.("sweep", 1);
        swept = true;
        if (!counted && state.result!.paid > 0 && ms >= settleAt + 520) {
          counted = true;
          this.onKnock?.("pay", 1);
        }
        this.settle(ms - settleAt, bets, won, number);
      }
      if (p >= 1) {
        this.spinning = false;
        this.spinFrom = null;
        this.close = 0;
        this.onKnock?.("roll", 0);
        if (state.result!.paid > 0) this.onKnock?.("win", Math.min(1, state.result!.paid / 200));
        this.place(state);
      }
      this.aimCamera();
    });
    // Until the ball rests the board shows the bets as they were laid, and the bar the chips as they were.
    this.place(state);
    return true;
  }
  private hear(f: Frame) {
    for (const e of f.events) {
      if (e.kind === "drop") this.onKnock?.("drop", 1);
      else if (e.kind === "diamond") this.onKnock?.("diamond", e.strength);
      else if (e.kind === "fret") this.onKnock?.("fret", e.strength);
      else if (e.kind === "rotor") this.onKnock?.("fret", 0.5);
      else if (e.kind === "rest") this.onKnock?.("rest", 1);
    }
  }
  protected mark(marks: Marks) {
    const at = marks.cursor;
    this.cursor.visible = at !== null && at >= 0 && at < SPOTS.length && !this.spinning && !capturing();
    if (this.cursor.visible) {
      const p = spotPlace(at!);
      this.cursor.position.set(p.x, p.y + 0.004, p.z);
    }
  }
  dispose() {
    this.bar.remove();
    this.history.remove();
    this.onKnock?.("roll", 0);
    super.dispose();
  }
}
