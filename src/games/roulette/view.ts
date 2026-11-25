import * as T from "three";
import { cameraDistance } from "../../engine/camera";
import { block, capable, glossy, weave, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot as TapSpot, type TableSubject } from "../table/view";
import { FELT, H, ROW, SPOTS, W, cellOf, spotAt } from "./bets";
import { FELT_AT, FELT_Y, TABLE, WHEEL_AT, WHEEL_BASE, WHEEL_SCALE, WHEEL_SUBJECT, betCamera, betSubject, spotPlace } from "./layout";
import { CASH, CHIP, CHIPS, CLEAR, REBET, SPIN, UNDO, canBet, canRebet, staked, type State } from "./rules";
import { BALL_R, CONE_OUT, DIAMONDS, DIAMOND_R, DIAMOND_SIZE, ORDER, POCKET_IN, RIM, SLOT, TRACK_R, colourOf, runSpin, type Frame } from "./sim";

export const ROULETTE_COLORS: [string, string] = ["#c9a13b", "#1d6b3f"];
/** The chips' paint by value: body, the inserts round the rim, the ink of the value. */
const CHIP_PAINT: Record<number, { body: string; stripe: string; ink: string }> = {
  1: { body: "#f2efe6", stripe: "#2f63c4", ink: "#2f63c4" },
  5: { body: "#c8312b", stripe: "#f4efe2", ink: "#c8312b" },
  25: { body: "#2c8a4f", stripe: "#f4efe2", ink: "#2c8a4f" },
  100: { body: "#1d1d22", stripe: "#e8c25a", ink: "#1d1d22" },
};
const CHIP_R = 0.105,
  CHIP_H = 0.026,
  /** The most chips a stack shows (a bigger bet is told by its top chip and its height). */
  STACK_MOST = 8;
/** How long the camera takes to come down to the wheel and to go back, and how long the result is looked at first. */
const TO_WHEEL = 700,
  LOOK = 1500,
  BACK = 800;
const RED = "#b52a24",
  BLACK = "#1b1b1f",
  GREEN = "#13804a";
const paintOf = (n: number) => (colourOf(n) === "red" ? RED : colourOf(n) === "black" ? BLACK : GREEN);
const ease = (p: number) => p * p * (3 - 2 * p);
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
/** The printed felt: the numbers in their red and black cells, 0, the columns' 2 to 1, the dozens and the even chances. */
function feltTexture(keep: Keep) {
  const PX = 480,
    width = (FELT.right - FELT.left) * PX,
    depth = (FELT.near - FELT.far) * PX,
    px = (x: number) => (x - FELT.left) * PX,
    pz = (z: number) => (z - FELT.far) * PX;
  return canvasTexture(keep, Math.round(width), Math.round(depth), (pen) => {
    pen.fillStyle = "#11613a";
    pen.fillRect(0, 0, width, depth);
    const line = "#efe4c0",
      box = (x0: number, z0: number, x1: number, z1: number, fill?: string) => {
        if (fill) {
          pen.fillStyle = fill;
          pen.fillRect(px(x0) + 7, pz(z0) + 7, (x1 - x0) * PX - 14, (z1 - z0) * PX - 14);
        }
        pen.strokeStyle = line;
        pen.lineWidth = 5;
        pen.strokeRect(px(x0), pz(z0), (x1 - x0) * PX, (z1 - z0) * PX);
      },
      write = (text: string, x: number, z: number, size: number, colour = line, turn = 0) => {
        pen.save();
        pen.translate(px(x), pz(z));
        pen.rotate(turn);
        pen.fillStyle = colour;
        pen.font = `800 ${size}px "Inter", "Noto Sans KR", sans-serif`;
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
      write(String(n), c.x, c.z, 86, "#fbf5e3");
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
    pen.lineWidth = 5;
    pen.stroke();
    write("0", left - W * 0.45, 0, 96, "#fbf5e3");
    for (let r = 0; r < 3; r++) {
      box(-left, far + r * H, -left + W, far + (r + 1) * H);
      write("2:1", -left + W / 2, far + (r + 0.5) * H, 62, line, -Math.PI / 2);
    }
    ["1~12", "13~24", "25~36"].forEach((text, d) => {
      box(left + 4 * d * W, near, left + 4 * (d + 1) * W, near + ROW);
      write(text, left + (4 * d + 2) * W, near + ROW / 2, 78);
    });
    ["1~18", "짝수", "", "", "홀수", "19~36"].forEach((text, k) => {
      const x0 = left + 2 * k * W;
      box(x0, near + ROW, x0 + 2 * W, near + 2 * ROW);
      if (text) write(text, x0 + W, near + ROW * 1.5, 70);
      else {
        // The red and black diamonds.
        const cx = px(x0 + W),
          cz = pz(near + ROW * 1.5);
        pen.fillStyle = k === 2 ? RED : BLACK;
        pen.beginPath();
        pen.moveTo(cx - 92, cz);
        pen.lineTo(cx, cz - 52);
        pen.lineTo(cx + 92, cz);
        pen.lineTo(cx, cz + 52);
        pen.closePath();
        pen.fill();
        pen.strokeStyle = line;
        pen.lineWidth = 4;
        pen.stroke();
      }
    });
  });
}
/** The rotor's ring of pockets seen from above: each pocket's colour, and its number on the band round them. */
function pocketTexture(keep: Keep) {
  const size = 1024,
    c = size / 2,
    scale = c / RIM,
    band = RIM - 0.022;
  return canvasTexture(keep, size, size, (pen) => {
    ORDER.forEach((n, k) => {
      const a0 = k * SLOT,
        a1 = (k + 1) * SLOT;
      pen.fillStyle = paintOf(n);
      pen.beginPath();
      // The canvas's y runs down, the wheel's angles anticlockwise seen from above: angles are drawn negated.
      pen.arc(c, c, RIM * scale, -a1, -a0);
      pen.arc(c, c, POCKET_IN * scale * 0.96, -a0, -a1, true);
      pen.closePath();
      pen.fill();
      const mid = (a0 + a1) / 2,
        r = ((band + RIM) / 2) * scale;
      pen.save();
      pen.translate(c + Math.cos(mid) * r, c - Math.sin(mid) * r);
      pen.rotate(Math.PI / 2 - mid);
      pen.fillStyle = "#fbf3dc";
      pen.font = `800 ${Math.round(0.016 * scale)}px "Inter", sans-serif`;
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillText(String(n), 0, 0);
      pen.restore();
    });
    // The gold line between the pockets and the band of numbers.
    pen.strokeStyle = "#d9b45a";
    pen.lineWidth = 3;
    pen.beginPath();
    pen.arc(c, c, band * scale, 0, Math.PI * 2);
    pen.stroke();
  });
}
/** A chip's face: its colour, the inserts round its rim and its value in an inlay. */
function chipFace(keep: Keep, value: number) {
  const p = CHIP_PAINT[value];
  return canvasTexture(keep, 256, 256, (pen) => {
    pen.fillStyle = p.body;
    pen.beginPath();
    pen.arc(128, 128, 128, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = p.stripe;
    for (let k = 0; k < 6; k++) {
      pen.save();
      pen.translate(128, 128);
      pen.rotate((k * Math.PI) / 3);
      pen.fillRect(-14, -128, 28, 34);
      pen.restore();
    }
    pen.fillStyle = "#f6f1e4";
    pen.beginPath();
    pen.arc(128, 128, 70, 0, Math.PI * 2);
    pen.fill();
    pen.strokeStyle = p.stripe === "#f4efe2" ? p.body : p.stripe;
    pen.lineWidth = 5;
    pen.setLineDash([10, 8]);
    pen.beginPath();
    pen.arc(128, 128, 84, 0, Math.PI * 2);
    pen.stroke();
    pen.fillStyle = p.ink;
    pen.font = `900 ${value >= 100 ? 60 : 72}px "Inter", sans-serif`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText(String(value), 128, 132);
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
 * The roulette table (see `rules.ts` and `sim.ts`): a casino's green table, the betting layout printed on its felt and
 * the wheel at its left end, under warm lamps. A tap on the layout bets the chosen chip there (the spot under it, by
 * `spotAt`); the chips, the bets' buttons and the recent numbers stand over the table's foot (the page's own controls,
 * which play their moves through `onMove`). A spin is shown from the state's seed: the camera comes down over the
 * wheel, the rotor turns and the ball runs round, drops, clicks over the frets and rests in the pocket the rules have
 * already counted; then the camera goes back to the layout, where a marker stands on the number and the winning bets
 * glow.
 */
export class RouletteView extends TableView<State> {
  private wheel = new T.Group();
  private rotor = new T.Group();
  private ball: T.Mesh;
  private chips = new T.Group();
  private chipGeometry: T.CylinderGeometry;
  private chipMaterials = new Map<number, T.Material[]>();
  private dolly: T.Group;
  private glow: T.Mesh;
  private ghost: T.Mesh;
  private cursor: T.Mesh;
  private hovered = -1;
  /** 0 over the layout, 1 down over the wheel. */
  private focus = 0;
  private tablePose = { position: new T.Vector3(), target: new T.Vector3() };
  private rotorAngle = 0;
  private ballSlot = -1;
  private spinning = false;
  /** While the ball runs: the state before the spin, which the table and the bar keep showing (the number is not told before it is seen). */
  private spinFrom: State | null = null;
  private bar: HTMLElement;
  private history: HTMLElement;
  onKnock?: ((kind: string, strength: number) => void) | null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#140e0b");
    const rich = capable(),
      keep: Keep = (r) => this.own(r);
    this.scene.add(new T.HemisphereLight("#ffe9cf", "#2b1a12", 1.35));
    const lamp = new T.DirectionalLight("#fff0d8", 2.1);
    lamp.position.set(-1.5, 9, 4.5);
    lamp.castShadow = rich;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.left = -6;
    lamp.shadow.camera.right = 4;
    lamp.shadow.camera.top = 3;
    lamp.shadow.camera.bottom = -3;
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp);
    if (!rich) this.renderer.shadowMap.enabled = false;
    this.room(keep, rich);
    this.table(keep);
    this.buildWheel(keep, rich);
    this.chipGeometry = keep(new T.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, rich ? 40 : 24));
    for (const value of CHIPS) {
      const face = keep(glossy({ map: chipFace(keep, value), roughness: 0.4 }, 0.4)),
        rim = keep(new T.MeshStandardMaterial({ color: CHIP_PAINT[value].body, roughness: 0.5 }));
      this.chipMaterials.set(value, [rim, face, face]);
    }
    this.scene.add(this.chips);
    // The marker on the winning number: a little glass column with a gold cap; and the cell's glow under it.
    this.dolly = new T.Group();
    const glass = new T.Mesh(keep(new T.CylinderGeometry(0.06, 0.075, 0.2, 24)), keep(new T.MeshStandardMaterial({ color: "#e8f4ff", transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 })));
    glass.position.y = 0.1;
    const cap = new T.Mesh(keep(new T.CylinderGeometry(0.068, 0.06, 0.04, 24)), keep(new T.MeshStandardMaterial({ color: "#e2b64c", metalness: 0.85, roughness: 0.25 })));
    cap.position.y = 0.22;
    this.dolly.add(glass, cap);
    this.dolly.visible = false;
    this.scene.add(this.dolly);
    this.glow = new T.Mesh(keep(new T.PlaneGeometry(W * 0.92, H * 0.92)), keep(new T.MeshBasicMaterial({ color: "#ffe680", transparent: true, opacity: 0.35, depthWrite: false })));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.visible = false;
    this.scene.add(this.glow);
    this.ghost = new T.Mesh(this.chipGeometry, keep(new T.MeshBasicMaterial({ color: "#fff6cf", transparent: true, opacity: 0.45, depthWrite: false })));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.cursor = new T.Mesh(keep(new T.RingGeometry(CHIP_R * 1.15, CHIP_R * 1.45, 32)), keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.ball = new T.Mesh(keep(new T.SphereGeometry(BALL_R * WHEEL_SCALE, 20, 14)), keep(glossy({ color: "#f8f6f0", roughness: 0.18 }, 0.8)));
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
  private room(keep: Keep, rich: boolean) {
    // A dark carpet and a panelled wall, warm lamps hanging over the table.
    const carpet = new T.Mesh(keep(new T.PlaneGeometry(40, 30)), keep(new T.MeshStandardMaterial({ color: "#3a1418", roughness: 0.95 })));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = -1.0;
    carpet.receiveShadow = true;
    this.scene.add(carpet);
    const wall = new T.Mesh(keep(new T.PlaneGeometry(40, 12)), keep(new T.MeshStandardMaterial({ color: "#4a2a1c", roughness: 0.85 })));
    wall.position.set(0, 4, -7);
    this.scene.add(wall);
    const brass = keep(new T.MeshStandardMaterial({ color: "#c9a04a", metalness: 0.8, roughness: 0.3 })),
      shade = keep(new T.MeshStandardMaterial({ color: "#1f4a33", roughness: 0.6, side: T.DoubleSide, emissive: "#3a2a10", emissiveIntensity: 0.3 })),
      bulb = keep(new T.MeshBasicMaterial({ color: "#ffe2a8" }));
    for (const x of [-3.6, -0.6, 1.9]) {
      const hood = new T.Mesh(keep(new T.ConeGeometry(0.55, 0.32, 24, 1, true)), shade);
      hood.position.set(x, 4.3, -0.6);
      const glow = new T.Mesh(keep(new T.SphereGeometry(0.12, 12, 8)), bulb);
      glow.position.set(x, 4.15, -0.6);
      const rod = new T.Mesh(keep(new T.CylinderGeometry(0.015, 0.015, 3, 6)), brass);
      rod.position.set(x, 5.9, -0.6);
      this.scene.add(hood, glow, rod);
      if (rich) {
        const light = new T.PointLight("#ffd9a0", 4, 7, 1.6);
        light.position.set(x, 4.0, -0.6);
        this.scene.add(light);
      }
    }
  }
  private table(keep: Keep) {
    const w = TABLE.right - TABLE.left,
      d = TABLE.near - TABLE.far,
      cx = (TABLE.left + TABLE.right) / 2,
      cz = (TABLE.far + TABLE.near) / 2;
    const felt = new T.Mesh(keep(new T.BoxGeometry(w, 0.2, d)), keep(new T.MeshStandardMaterial({ color: "#0f5a35", roughness: 0.92, ...weave(w / 2, d / 2, keep, 0.6) })));
    felt.position.set(cx, -0.1, cz);
    felt.receiveShadow = true;
    this.scene.add(felt);
    // The padded rail round it, and the wooden apron under it.
    const rail = keep(glossy({ color: "#3a2014", roughness: 0.35 }, 0.6)),
      apron = keep(new T.MeshStandardMaterial({ map: keep(wood(true)), roughness: 0.6 }));
    const side = (sx: number, sz: number, x: number, z: number) => {
      const mesh = new T.Mesh(keep(block(sx, 0.16, sz, 0.07)), rail);
      mesh.position.set(x, 0.04, z);
      mesh.castShadow = true;
      this.scene.add(mesh);
    };
    side(w + 0.5, 0.25, cx, TABLE.near + 0.12);
    side(w + 0.5, 0.25, cx, TABLE.far - 0.12);
    side(0.25, d, TABLE.left - 0.12, cz);
    side(0.25, d, TABLE.right + 0.12, cz);
    const body = new T.Mesh(keep(new T.BoxGeometry(w + 0.4, 0.8, d + 0.4)), apron);
    body.position.set(cx, -0.6, cz);
    this.scene.add(body);
    const print = new T.Mesh(keep(new T.PlaneGeometry(FELT.right - FELT.left, FELT.near - FELT.far)), keep(new T.MeshStandardMaterial({ map: feltTexture(keep), roughness: 0.9, transparent: false })));
    print.rotation.x = -Math.PI / 2;
    print.position.set(FELT_AT.x + (FELT.left + FELT.right) / 2, FELT_Y - 0.001, FELT_AT.z + (FELT.far + FELT.near) / 2);
    print.receiveShadow = true;
    this.scene.add(print);
  }
  /** The wheel in its own metres (`sim.ts`): the wooden bowl, the track, the cone with its diamonds, the rotor with its pockets, frets and turret. */
  private buildWheel(keep: Keep, rich: boolean) {
    const g = this.wheel;
    g.position.set(WHEEL_AT.x, WHEEL_BASE, WHEEL_AT.z);
    g.scale.setScalar(WHEEL_SCALE);
    this.scene.add(g);
    const base = -WHEEL_BASE / WHEEL_SCALE,
      bowl = keep(new T.MeshStandardMaterial({ map: keep(wood(true)), roughness: 0.45, side: T.DoubleSide })),
      track = keep(glossy({ color: "#5b3420", roughness: 0.28, side: T.DoubleSide }, 0.7)),
      cone = keep(new T.MeshStandardMaterial({ color: "#d9c7a4", roughness: 0.5, side: T.DoubleSide })),
      chrome = keep(new T.MeshStandardMaterial({ color: "#e8e8ec", metalness: 0.95, roughness: 0.18 }));
    const lathe = (points: [number, number][], material: T.Material) => {
      const mesh = new T.Mesh(keep(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), rich ? 96 : 56)), material);
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    // The bowl: from the table up its outside, over the rim and down its inner wall to the track.
    lathe([[0.47, base], [0.475, 0.04], [0.468, 0.08], [0.448, 0.088], [0.43, 0.085], [0.392, 0.078]], bowl).castShadow = true;
    // The track (where the ball runs), banked toward the cone.
    lathe([[0.392, 0.078], [0.388, 0.06], [TRACK_R, 0.05 - BALL_R * 0.4], [CONE_OUT + 0.004, 0.042]], track);
    // The cone down to the rotor.
    lathe([[CONE_OUT + 0.004, 0.042], [CONE_OUT, 0.04], [RIM + 0.004, 0.006], [RIM + 0.003, -0.002]], cone);
    for (const [k, a] of DIAMONDS.entries()) {
      const diamond = new T.Mesh(keep(new T.OctahedronGeometry(DIAMOND_SIZE, 0)), chrome),
        y = 0.004 + (0.036 * (DIAMOND_R - RIM)) / (CONE_OUT - RIM);
      diamond.position.set(Math.cos(a) * DIAMOND_R, y + 0.004, -Math.sin(a) * DIAMOND_R);
      diamond.scale.set(k % 2 ? 1.6 : 0.8, 0.5, k % 2 ? 0.8 : 1.6);
      diamond.rotation.y = a;
      g.add(diamond);
    }
    // The rotor, turned by the spin.
    g.add(this.rotor);
    const pockets = new T.Mesh(keep(new T.RingGeometry(POCKET_IN * 0.96, RIM, rich ? 148 : 74, 1)), keep(new T.MeshStandardMaterial({ map: pocketTexture(keep), roughness: 0.45 })));
    pockets.rotation.x = -Math.PI / 2;
    pockets.position.y = -0.012;
    this.rotor.add(pockets);
    const rimWall = new T.Mesh(keep(new T.CylinderGeometry(RIM + 0.002, RIM + 0.002, 0.016, rich ? 96 : 56, 1, true)), chrome);
    rimWall.position.y = -0.004;
    this.rotor.add(rimWall);
    const fretGeometry = keep(new T.BoxGeometry(RIM - POCKET_IN, 0.011, 0.0022));
    for (let k = 0; k < ORDER.length; k++) {
      const a = k * SLOT,
        fret = new T.Mesh(fretGeometry, chrome),
        r = (RIM + POCKET_IN) / 2;
      fret.position.set(Math.cos(a) * r, -0.0065, -Math.sin(a) * r);
      fret.rotation.y = a;
      this.rotor.add(fret);
    }
    // The turret: a polished dome in the middle, a spindle and a cross with knobs.
    const dome = new T.Mesh(keep(new T.CylinderGeometry(0.05, POCKET_IN, 0.04, rich ? 64 : 40)), keep(glossy({ map: keep(wood(false)), roughness: 0.3 }, 0.6)));
    dome.position.y = 0.008;
    this.rotor.add(dome);
    const spindle = new T.Mesh(keep(new T.CylinderGeometry(0.012, 0.03, 0.09, 20)), chrome);
    spindle.position.y = 0.07;
    this.rotor.add(spindle);
    for (let k = 0; k < 4; k++) {
      const arm = new T.Mesh(keep(new T.CylinderGeometry(0.005, 0.005, 0.14, 10)), chrome),
        a = (k * Math.PI) / 2;
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = a;
      arm.position.set(Math.cos(a) * 0.07, 0.09, -Math.sin(a) * 0.07);
      const knob = new T.Mesh(keep(new T.SphereGeometry(0.012, 12, 8)), chrome);
      knob.position.set(Math.cos(a) * 0.14, 0.09, -Math.sin(a) * 0.14);
      this.rotor.add(arm, knob);
    }
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
  /** The camera between its pose over the layout and its pose over the wheel. */
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
      target = new T.Vector3(WHEEL_AT.x, WHEEL_BASE + WHEEL_SUBJECT.lookY, WHEEL_AT.z),
      position = new T.Vector3(WHEEL_AT.x, WHEEL_BASE + Math.sin(WHEEL_SUBJECT.tilt) * d, WHEEL_AT.z + Math.cos(WHEEL_SUBJECT.tilt) * d);
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
    this.ball.position.set(WHEEL_AT.x + Math.cos(a) * r * WHEEL_SCALE, WHEEL_BASE + (-0.012 + BALL_R) * WHEEL_SCALE, WHEEL_AT.z - Math.sin(a) * r * WHEEL_SCALE);
  }
  private poseFrame(f: Frame) {
    this.renderer.domElement.dataset.ball = f.phase;
    this.rotorAngle = f.rotor;
    this.rotor.rotation.y = f.rotor;
    this.ball.visible = true;
    this.ball.position.set(WHEEL_AT.x + f.x * WHEEL_SCALE, WHEEL_BASE + (f.y + BALL_R) * WHEEL_SCALE, WHEEL_AT.z + f.z * WHEEL_SCALE);
  }
  /** The chips on the layout, as `bets` has them (glowing for the bets that won, after a spin). */
  private stack(bets: number[], won: Set<number> | null) {
    for (const child of [...this.chips.children]) child.removeFromParent();
    bets.forEach((amount, id) => {
      if (amount <= 0) return;
      const p = spotPlace(id),
        // Largest at the bottom; only the top `STACK_MOST` are shown.
        list = chipsOf(amount).slice(-STACK_MOST);
      list.forEach((value, k) => {
        const chip = new T.Mesh(this.chipGeometry, this.chipMaterials.get(value)!);
        chip.position.set(p.x + Math.sin(k * 2.3 + id) * 0.006, p.y + CHIP_H * (k + 0.5), p.z + Math.cos(k * 1.7 + id) * 0.006);
        chip.rotation.y = k * 0.9 + id;
        chip.castShadow = true;
        this.chips.add(chip);
      });
      if (won?.has(id)) {
        const ring = new T.Mesh(this.cursor.geometry, this.glow.material);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(p.x, p.y + 0.002, p.z);
        ring.scale.setScalar(1.05);
        this.chips.add(ring);
      }
    });
  }
  protected place(now: State) {
    // A spin whose animation was cut off (the table laid out afresh while it ran) is over: the ball goes to its pocket.
    if (this.spinning && !this.animating) {
      this.spinning = false;
      this.spinFrom = null;
      this.onKnock?.("roll", 0);
    }
    const state = this.spinning && this.spinFrom ? this.spinFrom : now,
      r = state.result,
      showing = !!r && staked(state) === 0;
    // After a spin the losing chips are swept away; the winning bets stay, glowing, until the next bet is laid.
    const won = new Set(r?.won ?? []);
    this.stack(showing ? (state.lastBets ?? state.bets).map((amount, id) => (won.has(id) ? amount : 0)) : state.bets, showing ? won : null);
    // The marker stays on the last number until then too.
    this.dolly.visible = this.glow.visible = showing;
    if (showing) {
      const c = cellOf(r!.number);
      this.dolly.position.set(c.x + FELT_AT.x, FELT_Y, c.z + FELT_AT.z);
      this.glow.position.set(c.x + FELT_AT.x, FELT_Y + 0.001, c.z + FELT_AT.z);
      this.glow.scale.set(r!.number === 0 ? 1 : 1, r!.number === 0 ? 3 : 1, 1);
    }
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
  protected animate(before: State, state: State) {
    if (state.spins !== before.spins + 1 || !state.result) return false;
    const spin = runSpin(state.result.seed),
      frames = spin.frames,
      run = spin.time * 1000,
      total = TO_WHEEL + run + LOOK + BACK;
    this.spinning = true;
    this.spinFrom = { ...before, result: null };
    this.ghost.visible = this.cursor.visible = false;
    this.renderer.domElement.dataset.phase = "spin";
    let shown = 0;
    this.poseFrame(frames[0]);
    this.tween(0, total, (p) => {
      const ms = p * total;
      this.focus = ms < TO_WHEEL ? ms / TO_WHEEL : ms < TO_WHEEL + run + LOOK ? 1 : 1 - (ms - TO_WHEEL - run - LOOK) / BACK;
      const t = Math.max(0, ms - TO_WHEEL) / 1000,
        index = Math.min(frames.length - 1, Math.floor(t * 60));
      for (; shown <= index; shown++) this.hear(frames[shown]);
      this.poseFrame(frames[index]);
      const f = frames[index];
      // The ball rolling round the track and the cone (louder the quicker), silent in its pocket.
      const next = frames[Math.min(frames.length - 1, index + 1)],
        speed = Math.hypot(next.x - f.x, next.z - f.z) * 60;
      this.onKnock?.("roll", f.phase === "rest" || ms > TO_WHEEL + run ? 0 : Math.min(1, speed / 5));
      if (p >= 1) {
        this.spinning = false;
        this.spinFrom = null;
        this.onKnock?.("roll", 0);
        if (state.result!.paid > 0) this.onKnock?.("win", Math.min(1, state.result!.paid / 200));
      }
      this.aimCamera();
    });
    // Until the ball rests the board shows the bets as they were laid, and the bar the chips as they were.
    this.place(state);
    return true;
  }
  private hear(f: Frame) {
    for (const e of f.events) {
      if (e.kind === "diamond") this.onKnock?.("diamond", e.strength);
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
