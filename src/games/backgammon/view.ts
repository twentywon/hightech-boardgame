import * as T from "three";
import { capable, hop, travel } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { CUP, SIZE as DIE_MODEL, diceCup, diceKit } from "../yacht/dice";
import { cafe, clearColor } from "./cafe";
import { BAR_W, CUBE_SIZE, HALF, R, THICK, TOP, TRAY_X, W, WALL, backgammonCase, checkerGeometry, checkerMaterial, cubeTurn, doublingCube } from "./case";
import { BAR, DOUBLE, OFF, ROLL, canDouble, type State } from "./rules";

// Browser tests import this file's layout numbers under plain Node, so it imports nothing that needs Vite (the page's
// banner brings pictures): the capture flag and the two small helpers below are its own.
/** Whether the page is being photographed for the collection (`capturing` in `src/ui/banner.ts`): no marks then. */
const capturing = () => typeof document !== "undefined" && document.documentElement.dataset.capture === "1";
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}
/** A soft round spot of light, white in the middle and fading to nothing. */
function glowTexture(own: <R extends { dispose(): void }>(r: R) => R) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return own(t);
}
export const BG_COLORS: [string, string] = ["#f2ead8", "#7a1f1f"];
export const BG_SUBJECT: TableSubject = { half: 5.9, halfZ: 3.7, height: 0.8, lookY: 0, tilt: 1.12 };
/** Where the dice lie: on the right half of the board, across its middle. */
export const DICE_AT = { x: 2.3, z: 0 };
/** The column of a point as seen from my seat: 0 at the far left to 11 at the far right; and whether it is in the near row. */
function column(p: number) {
  return p < 12 ? { col: 11 - p, near: true } : { col: p - 12, near: false };
}
const colX = (col: number) => (col - 5.5) * W + (col >= 6 ? BAR_W / 2 : -BAR_W / 2);
/** Where the `k`-th checker on a point stands (five to a row along the point, then a second layer over the gaps). */
export function pointSpot(p: number, k = 0) {
  const { col, near } = column(p),
    row = k % 5,
    layer = Math.floor(k / 5),
    z = (HALF - R - 0.04 - row * 2 * R - layer * R) * (near ? 1 : -1);
  return { x: colX(col), y: TOP + THICK / 2 + layer * THICK, z };
}
/** Where a side's checkers wait on top of the bar (its own half of it, three in a row, then stacked). */
const barSpot = (side: number, k: number) => ({ x: 0, y: WALL + THICK / 2 + Math.floor(k / 3) * THICK, z: (side === 0 ? 1 : -1) * (0.62 + (k % 3) * 0.6) });
/** Where the `k`-th checker borne off stands on its edge in its side's half of the tray at the right. */
const offSpot = (side: number, k: number) => ({ x: TRAY_X, y: TOP + R, z: (side === 0 ? 1 : -1) * (HALF - 0.14 - k * 0.148) });
/** Points of the board as the screen counts them, for taps. */
export function spotOf(point: number, side: number) {
  if (point === BAR) return { x: 0, z: (side === 0 ? 1 : -1) * 1.2 };
  if (point === OFF) return { x: 6 * W + BAR_W / 2 + 0.75, z: (side === 0 ? 1 : -1) * 2 };
  const { col, near } = column(point);
  return { x: colX(col), z: (near ? 1 : -1) * (HALF - 1.3) };
}
/** The side whose throw the dice show: the side moving, or (between turns) the side that threw last. */
const rollerOf = (s: State) => (s.phase === "move" || s.winner !== null || !s.dice.length ? s.turn : ((1 - s.turn) as 0 | 1));
/** The dice and the cups, as the view handles them: a die's size on the felt and in the cup, the cup's size. */
const DIE = 0.42,
  DIE_SCALE = DIE / DIE_MODEL,
  IN_CUP = 0.8,
  CUP_SCALE = 0.42;
/** Where each side's cup waits: in the left tray, in that side's half. */
const cupRest = (side: number) => new T.Vector3(-TRAY_X, TOP, side === 0 ? 1.62 : -1.62);
/** Where the cup is held to be shaken over the side's own throwing half, and where the dice are thrown to. */
const cupHold = (side: number) => new T.Vector3(side === 0 ? 0.55 : -0.55, 1.35, side === 0 ? 1.55 : -1.55);
/** Where the dice lie in the cup, in the cup's own measures. */
const SLOTS = [
  { at: new T.Vector3(-0.4, CUP.floor + 0.42, 0.12), turn: new T.Quaternion().setFromEuler(new T.Euler(0, 0.4, 0)) },
  { at: new T.Vector3(0.38, CUP.floor + 0.5, -0.14), turn: new T.Quaternion().setFromEuler(new T.Euler(0.3, -0.5, 0.2)) },
];
/**
 * The throw, in milliseconds from the press: the dice hop into the cup as it is lifted from the tray and carried over
 * the board, it is shaken, tipped, and the dice strike the felt at `LAND`, bounce once and roll to their faces; the
 * cup goes back to the tray.
 */
const GATHER = 320,
  SHAKE = 640,
  LAUNCH = 700,
  LAND = 860,
  BOUNCE = 1020,
  REST = 1360,
  STAGGER = 40,
  CUP_MS = 1200,
  TIP = 1.95;
const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0),
  Z = new T.Vector3(0, 0, 1);
/** Rotation that turns `face` upward (the faces of `diceKit`). */
function upright(face: number) {
  const q = new T.Quaternion();
  if (face === 6) q.setFromAxisAngle(X, Math.PI);
  else if (face === 2) q.setFromAxisAngle(X, -Math.PI / 2);
  else if (face === 5) q.setFromAxisAngle(X, Math.PI / 2);
  else if (face === 3) q.setFromAxisAngle(Z, Math.PI / 2);
  else if (face === 4) q.setFromAxisAngle(Z, -Math.PI / 2);
  return q;
}
const ease = (p: number) => 1 - (1 - p) * (1 - p),
  smooth = (p: number) => p * p * (3 - 2 * p),
  clamp = (p: number) => Math.max(0, Math.min(1, p));
/** A glow the shape of a point, lying on it (a target to move to): a gold rim round a fill that fades toward the tip. */
function pointGlow(own: <R extends { dispose(): void }>(r: R) => R) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext("2d")!,
    g = ctx.createLinearGradient(0, 512, 0, 0),
    shape = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(4 + inset, 512 - inset * 0.6);
      ctx.lineTo(124 - inset, 512 - inset * 0.6);
      ctx.lineTo(64, inset * 2.2);
      ctx.closePath();
    };
  g.addColorStop(0, "rgba(255,206,84,0.75)");
  g.addColorStop(1, "rgba(255,206,84,0.2)");
  ctx.fillStyle = g;
  shape(0);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,236,160,1)";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  shape(5);
  ctx.stroke();
  const map = own(new T.CanvasTexture(c));
  map.colorSpace = T.SRGBColorSpace;
  return own(new T.MeshBasicMaterial({ map, transparent: true, opacity: 0.85, depthWrite: false }));
}
/**
 * The backgammon case open on a café table: the case, its checkers and dice, two leather cups the dice are thrown
 * from and a doubling cube on the bar (turned and offered when the cube is played, a decoration otherwise).
 */
export class BackgammonView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private checkers: T.Mesh[][] = [[], []];
  private dice: T.Mesh[] = [];
  /** Each die's six face materials, darkened when its number has been played. */
  private faces: T.MeshStandardMaterial[][] = [];
  private cups: T.Group[] = [];
  private cube: T.Mesh;
  private rings: T.Mesh[] = [];
  private glows: T.Mesh[] = [];
  private trayGlow: T.Mesh;
  private diceGlows: T.Mesh[] = [];
  private cursor: T.Mesh;
  private chosen: T.Mesh;
  /** The checker lifted because it is picked up, and the height it rests at. */
  private lifted: { mesh: T.Mesh; y: number } | null = null;
  private pulse = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, clearColor());
    this.daylight("#fff4e0", "#5a4634", "#fff0d4", 9, 2.3);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.add(cafe(own), backgammonCase(own));
    const segments = capable() ? 40 : 24,
      paint = checkerMaterial(own),
      shapes = [own(checkerGeometry(BG_COLORS[0], "#6a4128", segments)), own(checkerGeometry(BG_COLORS[1], "#e6d3a6", segments))];
    shapes.forEach((shape, side) => {
      for (let k = 0; k < 15; k++) {
        const mesh = new T.Mesh(shape, paint);
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.checkers[side].push(mesh);
      }
    });
    const kit = diceKit(own);
    for (let i = 0; i < 2; i++) {
      const materials = i ? kit.materials.map((m) => own(m.clone())) : kit.materials,
        die = new T.Mesh(kit.geometry, materials);
      die.castShadow = true;
      die.scale.setScalar(DIE_SCALE);
      this.faces.push(materials as T.MeshStandardMaterial[]);
      this.scene.add(die);
      this.dice.push(die);
    }
    for (let side = 0; side < 2; side++) {
      const cup = diceCup(own);
      cup.scale.setScalar(CUP_SCALE);
      cup.position.copy(cupRest(side));
      // Red's cup is of darker, redder leather.
      if (side)
        cup.traverse((thing) => {
          if (thing instanceof T.Mesh && (thing.material as T.MeshStandardMaterial).map) (thing.material as T.MeshStandardMaterial).color.set("#b07068");
        });
      this.cups.push(cup);
      this.scene.add(cup);
    }
    this.cube = doublingCube(own);
    this.scene.add(this.cube);
    // The marks: gold rings on the checkers that may move, glows on the points they may go to, the keyboard's ring.
    for (let i = 0; i < 16; i++) {
      const ring = ringMesh(own, 0.2, 0.285, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    const glow = pointGlow(own),
      blade = own(new T.PlaneGeometry(W * 0.92, HALF * 2 * 0.42));
    for (let i = 0; i < 8; i++) {
      const mesh = new T.Mesh(blade, glow);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 4;
      this.glows.push(mesh);
      this.scene.add(mesh);
    }
    const soft = own(new T.MeshBasicMaterial({ map: glowTexture(own), color: "#ffd46a", transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }));
    this.trayGlow = new T.Mesh(own(new T.PlaneGeometry(1.5, 2.6)), soft);
    for (let i = 0; i < 4; i++) {
      const g = new T.Mesh(own(new T.PlaneGeometry(1, 1)), soft);
      g.rotation.x = -Math.PI / 2;
      g.visible = false;
      g.renderOrder = 4;
      this.diceGlows.push(g);
      this.scene.add(g);
    }
    this.trayGlow.rotation.x = -Math.PI / 2;
    this.trayGlow.visible = false;
    this.trayGlow.renderOrder = 4;
    this.scene.add(this.trayGlow);
    this.cursor = ringMesh(own, 0.3, 0.36, "#ffffff");
    this.chosen = ringMesh(own, 0.2, 0.3, "#ff8a3c");
    this.scene.add(this.cursor, this.chosen);
    this.begin();
  }
  protected subject() {
    return BG_SUBJECT;
  }
  /** Where every checker stands, by side. */
  private stands(s: State) {
    return [0, 1].map((side) => {
      const out: { x: number; y: number; z: number; flat?: boolean }[] = [];
      for (let p = 0; p < 24; p++) for (let k = 0; k < s.points[side][p]; k++) out.push(pointSpot(p, k));
      for (let k = 0; k < s.bar[side]; k++) out.push(barSpot(side, k));
      for (let k = 0; k < s.off[side]; k++) out.push({ ...offSpot(side, k), flat: true });
      return out;
    });
  }
  /** The top checker of `side` on a point (or the bar), where it stands. */
  private topOf(s: State, side: number, point: number) {
    if (point === BAR) return s.bar[side] ? barSpot(side, s.bar[side] - 1) : null;
    if (point < 0 || point > 23) return null;
    const n = s.points[side][point];
    return n ? pointSpot(point, n - 1) : null;
  }
  private meshAt(side: number, at: { x: number; y: number; z: number }) {
    return this.checkers[side].find((m) => Math.abs(m.position.x - at.x) < 0.01 && Math.abs(m.position.z - at.z) < 0.01 && Math.abs(m.position.y - at.y) < 0.01) ?? null;
  }
  /** Where die `i` comes to rest for the throw shown: in the thrower's own half, a little askew. */
  private diceRest(s: State, i: number) {
    const values = s.dice.length ? s.dice : [5, 2],
      roller = rollerOf(s),
      jitter = seeded(values[0] * 7 + values[1] * 13 + roller * 31 + 1),
      sign = roller === 0 ? 1 : -1,
      dx = (jitter() - 0.5) * 0.16,
      dz = (jitter() - 0.5) * 0.16,
      yaw = (jitter() - 0.5) * 0.9 + (roller ? Math.PI : 0) + (i ? 0.25 : 0);
    if (i) jitter();
    return {
      at: new T.Vector3(sign * DICE_AT.x + (i ? 0.34 : -0.34) * sign + dx, TOP + DIE / 2, DICE_AT.z + (i ? 0.14 : -0.14) * sign + dz),
      turn: new T.Quaternion().setFromAxisAngle(Y, yaw).multiply(upright(values[i])),
    };
  }
  /** Where the cube is: in the middle of the bar, on its owner's half of it, or held up turned to the next value while a double is offered. */
  private cubeRest(s: State) {
    const y = WALL + CUBE_SIZE / 2 + 0.004,
      cube = s.cube;
    if (!cube || (cube.owner === null && s.phase !== "answer")) return { at: new T.Vector3(0, y, 0), turn: cubeTurn(64, 0) };
    if (s.phase === "answer") {
      const to = 1 - s.turn;
      return {
        at: new T.Vector3(0, y + 0.42, to === 0 ? 2.38 : -2.38),
        turn: new T.Quaternion().setFromAxisAngle(X, to === 0 ? 0.42 : -0.42).multiply(cubeTurn(cube.value * 2, to)),
      };
    }
    return { at: new T.Vector3(0, y, cube.owner === 0 ? 2.38 : -2.38), turn: cubeTurn(cube.value, cube.owner!) };
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s) return [];
    const out: Spot[] = [];
    for (let p = 0; p < 24; p++) out.push({ ...spotOf(p, 0), y: TOP, r: 1.3, point: p });
    out.push({ ...spotOf(BAR, s.turn), y: TOP, r: 0.7, point: BAR }, { ...spotOf(OFF, s.turn), y: TOP, r: 1.2, point: OFF }, { ...DICE_AT, y: 0.3, r: 0.8, point: ROLL });
    if (s.phase === "roll" && s.winner === null) {
      // The dice where they lie and the thrower's cup may be tapped to throw as well.
      for (const die of this.dice) out.push({ x: die.position.x, y: die.position.y, z: die.position.z, r: 0.4, point: ROLL });
      const cup = cupRest(s.turn);
      out.push({ x: cup.x, y: 0.45, z: cup.z, r: 0.55, point: ROLL });
    }
    if (canDouble(s)) out.push({ ...this.cube.position, r: 0.42, point: DOUBLE });
    return out;
  }
  private showDice(s: State) {
    this.dice.forEach((die, i) => {
      const rest = this.diceRest(s, i);
      die.position.copy(rest.at);
      die.quaternion.copy(rest.turn);
      die.scale.setScalar(DIE_SCALE);
      this.dim(s, i);
    });
  }
  /** A die whose number has been played is darkened (with doubles, the second after two moves, the first after four). */
  private dim(s: State, i: number) {
    const value = s.dice[i],
      left = s.left.filter((v) => v === value).length,
      spent = s.phase === "move" && s.dice.length === 2 && (s.dice[0] === s.dice[1] ? left <= (i ? 2 : 0) : left === 0);
    for (const m of this.faces[i]) m.color.set(spent ? "#8d877d" : "#ffffff");
  }
  protected place(s: State) {
    const canvas = this.renderer.domElement;
    // The dice as they lie and the checkers (each side's points, bar and borne off), for tests (two devices over Wi-Fi
    // must show the same throw and position); the cube, where it is played.
    canvas.dataset.dice = s.dice.join(",");
    canvas.dataset.pieces = [0, 1].map((p) => `${s.points[p].join(",")};${s.bar[p]};${s.off[p]}`).join("|");
    if (s.cube) canvas.dataset.cube = `${s.cube.value}:${s.cube.owner ?? "-"}${s.phase === "answer" ? ":offered" : ""}`;
    else delete canvas.dataset.cube;
    this.lifted = null;
    this.stands(s).forEach((spots, side) =>
      this.checkers[side].forEach((mesh, k) => {
        const p = spots[k];
        mesh.visible = !!p;
        if (!p) return;
        mesh.position.set(p.x, p.y, p.z);
        // A checker borne off stands on its edge in the tray, as in a real case.
        mesh.rotation.set(p.flat ? Math.PI / 2 : 0, 0, 0);
      }),
    );
    this.showDice(s);
    this.cups.forEach((cup, side) => {
      cup.position.copy(cupRest(side));
      cup.quaternion.identity();
    });
    const cube = this.cubeRest(s);
    this.cube.position.copy(cube.at);
    this.cube.quaternion.copy(cube.turn);
  }
  protected animate(before: State, s: State) {
    const last = s.last;
    if (!last || s.ply !== before.ply + 1) return false;
    if (last.rolled) return this.throwDice(before, s, last.side);
    if (last.cube) return this.turnCube(s, last.cube);
    return this.moveChecker(before, s, last.side, last.from, last.to, last.hit);
  }
  /** The cup's pose `t` ms into a throw by `side`. */
  private cupPose(side: number, t: number) {
    const cup = this.cups[side],
      rest = cupRest(side),
      hold = cupHold(side),
      toward = new T.Vector3(side === 0 ? 1 : -1, 0, side === 0 ? -0.75 : 0.75).normalize(),
      axis = new T.Vector3().crossVectors(Y, toward).normalize(),
      tipped = new T.Quaternion().setFromAxisAngle(axis, TIP),
      poured = hold.clone().addScaledVector(toward, 0.25).add(new T.Vector3(0, 0.12, 0));
    if (t < GATHER) {
      const e = smooth(t / GATHER);
      cup.position.lerpVectors(rest, hold, e);
      cup.position.y += Math.sin(Math.PI * e) * 0.5;
      cup.quaternion.identity();
    } else if (t < SHAKE) {
      // Shaken: quick jerks to and fro with a rocking tilt.
      const k = Math.sin(((t - GATHER) / 64) * Math.PI * 2);
      cup.position.copy(hold).addScaledVector(toward, k * 0.12).add(new T.Vector3(0, Math.abs(k) * 0.06, 0));
      cup.quaternion.setFromAxisAngle(axis, k * 0.18);
    } else if (t < LAUNCH + 60) {
      const e = ease(clamp((t - SHAKE) / (LAUNCH + 60 - SHAKE)));
      cup.position.lerpVectors(hold, poured, e);
      cup.quaternion.identity().slerp(tipped, e);
    } else {
      const e = smooth(clamp((t - LAUNCH - 60) / (CUP_MS - LAUNCH - 60)));
      cup.position.lerpVectors(poured, rest, e);
      cup.position.y += Math.sin(Math.PI * e) * 0.35;
      cup.quaternion.copy(tipped).slerp(new T.Quaternion(), e);
    }
  }
  /** Where die `i` lies in `side`'s cup as the cup stands now. */
  private inCup(side: number, i: number, at: T.Vector3, turn: T.Quaternion) {
    const cup = this.cups[side];
    cup.updateMatrixWorld();
    at.copy(SLOTS[i].at).applyMatrix4(cup.matrixWorld);
    turn.copy(cup.quaternion).multiply(SLOTS[i].turn);
  }
  /** The dice gathered into the thrower's cup, shaken and thrown, tumbling and rolling to their faces. */
  private throwDice(before: State, s: State, side: number) {
    this.onRoll(2, LAND / 1000);
    this.tween(0, CUP_MS, (p) => {
      this.cupPose(side, p * CUP_MS);
      if (p === 1) this.cups[side].position.copy(cupRest(side));
    });
    const at = new T.Vector3(),
      turn = new T.Quaternion(),
      spinning = new T.Quaternion(),
      hold = cupHold(side);
    this.dice.forEach((die, i) => {
      for (const m of this.faces[i]) m.color.set("#ffffff");
      const from = die.position.clone(),
        fromTurn = die.quaternion.clone(),
        rest = this.diceRest(s, i),
        mouth = new T.Vector3(hold.x + (side === 0 ? 0.6 : -0.6), TOP + DIE / 2, hold.z + (side === 0 ? -0.5 : 0.5)),
        first = new T.Vector3().lerpVectors(rest.at, mouth, 0.46 + i * 0.08),
        second = new T.Vector3().lerpVectors(rest.at, first, 0.36),
        way = new T.Vector3().subVectors(rest.at, second).setY(0),
        rolling = way.length(),
        rollAxis = rolling > 1e-4 ? new T.Vector3().crossVectors(Y, way.normalize()) : X.clone(),
        rollAngle = (rolling / DIE) * (Math.PI / 2) + Math.PI / 2,
        spinAxis = new T.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize(),
        spins = 1.5 + Math.random() * 1.5,
        stagger = i * STAGGER,
        end = REST + stagger;
      first.y = second.y = TOP + DIE / 2;
      let launch: T.Vector3 | null = null;
      this.tween(0, end, (p) => {
        const ms = p * end,
          spin = spins * Math.PI * 2 * (1 - ease(clamp((ms - LAUNCH) / (BOUNCE - LAUNCH)))),
          roll = ms < BOUNCE ? rollAngle : rollAngle * (1 - ease(clamp((ms - BOUNCE) / (end - BOUNCE))));
        if (ms < LAUNCH + stagger) {
          // Leaping into the cup as it comes, then shaken in it.
          this.inCup(side, i, at, turn);
          const q = clamp((ms - stagger) / (GATHER - 40));
          if (q < 1) {
            die.position.lerpVectors(from, at, smooth(q));
            die.position.y += Math.sin(Math.PI * q) * 0.7;
            die.quaternion.slerpQuaternions(fromTurn, turn, smooth(q));
          } else {
            die.position.copy(at);
            die.quaternion.copy(turn);
          }
          die.scale.setScalar(DIE_SCALE * (1 - (1 - IN_CUP) * smooth(q)));
          return;
        }
        die.quaternion.setFromAxisAngle(rollAxis, -roll).multiply(spinning.setFromAxisAngle(spinAxis, spin)).multiply(rest.turn);
        if (ms < LAND + stagger) {
          if (!launch) {
            this.inCup(side, i, at, turn);
            launch = at.clone();
          }
          const q = (ms - LAUNCH - stagger) / (LAND - LAUNCH);
          die.position.lerpVectors(launch, first, q);
          die.position.y += Math.sin(Math.PI * q) * 0.3;
          die.scale.setScalar(DIE_SCALE * (IN_CUP + (1 - IN_CUP) * q));
        } else if (ms < BOUNCE + stagger) {
          const q = (ms - LAND - stagger) / (BOUNCE - LAND);
          die.position.lerpVectors(first, second, q);
          die.position.y += Math.sin(Math.PI * q) * 0.26;
          die.scale.setScalar(DIE_SCALE);
        } else {
          const q = clamp((ms - BOUNCE - stagger) / (end - BOUNCE - stagger));
          die.position.lerpVectors(second, rest.at, ease(q));
          // A cube rolling over its edges rises and falls.
          die.position.y = TOP + DIE / 2 + DIE * 0.17 * Math.abs(Math.sin(roll * 2));
        }
        if (p === 1) {
          die.position.copy(rest.at);
          die.quaternion.copy(rest.turn);
        }
      });
    });
    // Nothing could be played: the dice are looked at a moment before the turn passes.
    if (s.turn !== before.turn) this.tween(REST + STAGGER, 700, () => {});
    return true;
  }
  /** A double offered (the cube lifted and turned to the next number), taken (set down on the taker's side) or dropped. */
  private turnCube(s: State, what: "double" | "take" | "drop") {
    const cube = this.cube,
      from = cube.position.clone(),
      fromTurn = cube.quaternion.clone(),
      rest = this.cubeRest(s),
      duration = what === "double" ? 560 : 420;
    if (what === "double") this.onKnock?.("cushion", 0.4);
    cube.userData.landed = false;
    this.tween(0, duration, (p) => {
      const e = what === "double" ? smooth(p) : travel(p);
      cube.position.lerpVectors(from, rest.at, e);
      cube.position.y += (what === "double" ? Math.sin(Math.PI * p) * 0.5 : hop(p) * 0.35);
      cube.quaternion.slerpQuaternions(fromTurn, rest.turn, e);
      if (what === "double") cube.quaternion.multiply(new T.Quaternion().setFromAxisAngle(Y, Math.sin(Math.PI * p) * 0.6));
      if (what !== "double" && p >= 0.84 && !cube.userData.landed) {
        cube.userData.landed = true;
        this.onKnock?.("cushion", 0.7);
      }
      if (p === 1) cube.userData.landed = false;
    });
    return true;
  }
  /**
   * One checker carried from point to point in a hop scaled to the way it goes (higher over the bar), landing with a
   * small bounce and a knock; a blot it lands on is knocked aside and flies to the bar; a checker borne off turns
   * on its edge as it goes and drops into the tray.
   */
  private moveChecker(before: State, s: State, side: number, from: number, to: number, hit: boolean) {
    const a = from === BAR ? barSpot(side, before.bar[side] - 1) : pointSpot(from, before.points[side][from] - 1),
      b = to === OFF ? offSpot(side, s.off[side] - 1) : pointSpot(to, s.points[side][to] - 1),
      mover = this.meshAt(side, a);
    if (!mover) return false;
    const way = Math.hypot(b.x - a.x, b.z - a.z),
      across = Math.sign(a.x) !== Math.sign(b.x) || from === BAR,
      height = Math.min(0.95, Math.max(across ? 0.6 : 0.32, 0.3 + way * 0.06)),
      duration = Math.min(580, 300 + way * 30),
      dx = (b.x - a.x) / (way || 1),
      dz = (b.z - a.z) / (way || 1),
      off = to === OFF;
    let landed = false;
    this.tween(0, duration, (p) => {
      const e = travel(p),
        lean = Math.sin(Math.PI * Math.min(1, p / 0.84)) * 0.28;
      mover.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + hop(p) * height, a.z + (b.z - a.z) * e);
      mover.rotation.set((off ? (Math.PI / 2) * e : 0) + dz * lean, 0, -dx * lean);
      if (p >= 0.84 && !landed) {
        landed = true;
        if (hit) this.onKnock?.("disc", 0.9);
        else if (off) this.onKnock?.("pocket", 0.8);
        else this.onContact();
      }
    });
    if (hit) {
      const other = 1 - side,
        at = pointSpot(to, 0),
        victim = this.meshAt(other, at),
        dest = barSpot(other, s.bar[other] - 1);
      if (victim) {
        // Knocked aside the way the hitter came, spinning, then lifted onto the bar.
        const aside = { x: at.x + dx * 0.5, z: at.z + dz * 0.5 };
        let down = false;
        this.tween(duration * 0.8, 640, (p) => {
          if (p < 0.25) {
            const q = ease(p / 0.25);
            victim.position.set(at.x + (aside.x - at.x) * q, at.y + Math.sin(Math.PI * q) * 0.12, at.z + (aside.z - at.z) * q);
            victim.rotation.set(dz * 0.5 * Math.sin(Math.PI * q), q * 2.4, -dx * 0.5 * Math.sin(Math.PI * q));
            return;
          }
          const q = (p - 0.25) / 0.75,
            e = travel(q);
          victim.position.set(aside.x + (dest.x - aside.x) * e, at.y + (dest.y - at.y) * e + hop(q) * 1.1, aside.z + (dest.z - aside.z) * e);
          victim.rotation.set(0, 2.4 + q * 3.9, 0);
          if (q >= 0.84 && !down) {
            down = true;
            this.onKnock?.("disc", 0.4);
          }
        });
      }
    }
    return true;
  }
  protected mark(marks: Marks) {
    const s = this.state,
      hide = !s || capturing(),
      lit = hide ? [] : [...new Set(marks.movable)],
      targets = hide ? [] : [...new Set(marks.targets)];
    // A checker picked up is lifted a little off its point.
    if (this.lifted) {
      this.lifted.mesh.position.y = this.lifted.y;
      this.lifted = null;
    }
    const selected = hide || marks.selected === null ? null : marks.selected;
    let ring = 0;
    const ringOn = (at: { x: number; y: number; z: number }, mesh: T.Mesh) => {
      mesh.visible = true;
      mesh.position.set(at.x, at.y + THICK / 2 + 0.006, at.z);
    };
    for (const point of lit) {
      if (!s || point === selected) continue;
      const top = this.topOf(s, s.turn, point);
      if (top && ring < this.rings.length) ringOn(top, this.rings[ring++]);
    }
    for (; ring < this.rings.length; ring++) this.rings[ring].visible = false;
    this.chosen.visible = false;
    if (s && selected !== null) {
      const top = this.topOf(s, s.turn, selected),
        mesh = top && !this.animating ? this.meshAt(s.turn, top) : null;
      if (top && mesh) {
        this.lifted = { mesh, y: mesh.position.y };
        mesh.position.y += 0.12;
        ringOn({ ...top, y: top.y + 0.12 }, this.chosen);
      }
    }
    let glow = 0;
    this.trayGlow.visible = false;
    for (const point of targets) {
      if (point === OFF && s) {
        this.trayGlow.visible = true;
        this.trayGlow.position.set(TRAY_X, TOP + 0.004, (s.turn === 0 ? 1 : -1) * (HALF - 1.4));
        continue;
      }
      if (point < 0 || point > 23 || glow >= this.glows.length) continue;
      const { col, near } = column(point),
        mesh = this.glows[glow++];
      mesh.visible = true;
      mesh.position.set(colX(col), TOP + 0.004, (near ? 1 : -1) * (HALF - HALF * 0.42));
      mesh.rotation.z = near ? 0 : Math.PI;
    }
    for (; glow < this.glows.length; glow++) this.glows[glow].visible = false;
    // The dice and the cup glow while a throw is wanted, the cube while a double may be offered.
    const throwing = !!s && (lit.includes(ROLL) || targets.includes(ROLL)),
      doubling = !!s && targets.includes(DOUBLE);
    this.diceGlows.forEach((g, i) => {
      g.visible = i < 3 ? throwing : doubling;
      if (!g.visible) return;
      const at = i < 2 ? this.dice[i].position : i === 2 ? cupRest(s!.turn) : this.cube.position;
      g.position.set(at.x, (i === 3 ? WALL : TOP) + 0.006, at.z);
      g.scale.setScalar(i < 2 ? 0.9 : i === 2 ? 1.5 : 1);
    });
    this.cursor.visible = !hide && marks.cursor !== null;
    if (this.cursor.visible) {
      const point = marks.cursor!,
        at = point === ROLL ? DICE_AT : spotOf(point, s!.turn);
      this.cursor.position.set(at.x, (point === BAR ? WALL : TOP) + 0.012, at.z);
    }
    this.breathe();
  }
  /** Where a graphics card draws, the glows breathe while they are shown. */
  private breathe() {
    const shown = [...this.glows, this.trayGlow, ...this.diceGlows].some((g) => g.visible);
    if (!shown || !capable() || this.reducedMotion || this.disposed || this.pulse) return;
    const tick = (now: number) => {
      const live = [...this.glows, this.trayGlow, ...this.diceGlows].some((g) => g.visible);
      if (!live || this.disposed) {
        this.pulse = 0;
        return;
      }
      const k = 0.5 + 0.5 * Math.sin(now / 260);
      (this.glows[0].material as T.MeshBasicMaterial).opacity = 0.6 + 0.35 * k;
      (this.trayGlow.material as T.MeshBasicMaterial).opacity = 0.5 + 0.3 * k;
      this.redraw();
      this.pulse = requestAnimationFrame(tick);
    };
    this.pulse = requestAnimationFrame(tick);
  }
  dispose() {
    cancelAnimationFrame(this.pulse);
    super.dispose();
  }
}
