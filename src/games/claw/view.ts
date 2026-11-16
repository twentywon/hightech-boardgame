import * as T from "three";
import { cryptoRandom } from "../../core/random";
import { block, glossy } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot } from "../table/view";
import { AIM_HEIGHT, BUTTON, CLAW_SUBJECT, DECK } from "./layout";
import { BONUS, DROP, MISSED, PRIZE, STEER, type State } from "./rules";
import { AIM_TIME, CHUTE, DT, KINDS, PIT, REACH, TOP, aimAt, createWorld, drop, nudge, step, surface, type Happening, type World } from "./sim";

export const CLAW_COLORS: [string, string] = ["#ff6fae", "#b9b3a4"];
/** The cabinet: its posts' corners, the floor of the room under it, the gantry's height, and the top of the glass. */
const CAB = { x: 2.66, z: 2.06, ground: -2.6, rail: TOP + 0.95, glass: 3.95 };
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** A canvas texture of `w` × `h` painted by `paint`. */
function painted(w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/** A heart, as a path. */
function heart(pen: CanvasRenderingContext2D, x: number, y: number, s: number) {
  pen.beginPath();
  pen.moveTo(x, y + s * 0.35);
  pen.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.45);
  pen.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
  pen.fill();
}
/** The backdrop at the back of the cabinet: pastel, with hearts, stars and the machine's name. */
const backdrop = () =>
  painted(1024, 768, (pen) => {
    const sky = pen.createLinearGradient(0, 0, 0, 768);
    sky.addColorStop(0, "#c9b6ff");
    sky.addColorStop(1, "#ffc3e0");
    pen.fillStyle = sky;
    pen.fillRect(0, 0, 1024, 768);
    const random = sequence(12);
    for (let k = 0; k < 40; k++) {
      pen.fillStyle = ["rgba(255,255,255,0.7)", "rgba(255,120,180,0.55)", "rgba(120,170,255,0.5)"][k % 3];
      if (k % 2) heart(pen, random() * 1024, random() * 768, 18 + random() * 22);
      else {
        const x = random() * 1024,
          y = random() * 768,
          r = 10 + random() * 16;
        pen.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5,
            rr = i % 2 ? r * 0.45 : r;
          pen.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        pen.fill();
      }
    }
    pen.font = '900 120px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = 26;
    pen.strokeStyle = "#ffffff";
    pen.strokeText("PRIZE CATCHER", 512, 330);
    pen.fillStyle = "#ff4f9a";
    pen.fillText("PRIZE CATCHER", 512, 330);
  });
/** The pit's floor: soft pink pile. */
const plush = () =>
  painted(512, 512, (pen) => {
    pen.fillStyle = "#ffb3d1";
    pen.fillRect(0, 0, 512, 512);
    const random = sequence(4);
    for (let k = 0; k < 9000; k++) {
      pen.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.18)" : "rgba(200,90,140,0.14)";
      pen.fillRect(random() * 512, random() * 512, 2, 2);
    }
  });
/** The sign over the glass: the name in bubbly letters on pink, with a row of bulbs painted round it. */
const signFace = () =>
  painted(1024, 220, (pen) => {
    const paint = pen.createLinearGradient(0, 0, 0, 220);
    paint.addColorStop(0, "#ff86c0");
    paint.addColorStop(1, "#e2408c");
    pen.fillStyle = paint;
    pen.fillRect(0, 0, 1024, 220);
    pen.font = '900 128px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = 22;
    pen.strokeStyle = "#7a1450";
    pen.strokeText("인형뽑기", 512, 116);
    pen.fillStyle = "#fff6c0";
    pen.fillText("인형뽑기", 512, 116);
  });
/** One toy as built: its group, the part that turns while it falls, and its kind. */
interface ToyModel {
  root: T.Group;
  body: T.Group;
}
/**
 * A claw machine in an arcade, seen from where a player stands before it: a glass cabinet on a pink frame, a pit
 * of soft toys, the claw hanging from a gantry under the sign, a chute in the front left corner behind a clear
 * wall, and the control deck below the glass with the lights, the joystick and the big button. The view plays the
 * machine in real time (see `sim.ts`): steps and the button come from the screen as moves, what a try came to goes
 * back as a move.
 */
export class ClawView extends TableView<State> {
  private world: World;
  private toys: ToyModel[] = [];
  private hub = new T.Group();
  private prongs: T.Group[] = [];
  private cable: T.Mesh;
  private bridge: T.Mesh;
  private trolley: T.Mesh;
  private target: T.Mesh;
  private stick = new T.Group();
  private button!: T.Mesh;
  private pressed = -1e9;
  private led: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private shelf = new T.Group();
  private shelved = -1;
  private bulbs: T.MeshStandardMaterial[] = [];
  private words: { sprite: T.Sprite; at: number }[] = [];
  private paused = false;
  private shown = 0;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  /** Shapes and paints the toys share. */
  private kit: Record<string, T.BufferGeometry | T.Material>;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1a1236");
    this.world = createWorld(1, cryptoRandom);
    this.scene.add(new T.HemisphereLight("#fff6f0", "#4a3a6a", 1.5));
    const sun = new T.DirectionalLight("#fff4e6", 1.6);
    sun.position.set(2, 10, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -6;
    sun.shadow.camera.right = sun.shadow.camera.top = 6;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    // A lamp inside the cabinet under the sign: the toys are well lit.
    const lamp = new T.PointLight("#fff0f6", 9, 9, 1.6);
    lamp.position.set(0, CAB.glass - 0.2, 0.4);
    this.scene.add(lamp);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.room(keep);
    this.cabinet(keep);
    this.kit = this.toyKit(keep);
    // The claw, its cable and the gantry it runs on.
    const chrome = keep(glossy({ color: "#d8dde4", roughness: 0.18, metalness: 0.9 }, 0.4)),
      dark = this.standard({ color: "#3a3f48", roughness: 0.4, metalness: 0.6 });
    this.add(new T.CylinderGeometry(0.16, 0.2, 0.26, 20), chrome, 0, 0, 0, this.hub);
    this.add(new T.SphereGeometry(0.1, 14, 10), chrome, 0, 0.16, 0, this.hub);
    const upper = keep(new T.CylinderGeometry(0.035, 0.035, 0.42, 8)),
      lower = keep(new T.CylinderGeometry(0.035, 0.028, 0.24, 8)),
      ball = keep(new T.SphereGeometry(0.05, 10, 8));
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3,
        arm = new T.Group(),
        hinge = new T.Group();
      hinge.position.set(Math.cos(a) * 0.12, -0.13, Math.sin(a) * 0.12);
      hinge.rotation.y = -a;
      hinge.add(arm);
      // Down and outward, then the tip bent back in.
      const top = new T.Mesh(upper, chrome);
      top.position.y = -0.21;
      const tip = new T.Group();
      tip.position.y = -0.42;
      tip.rotation.z = -0.8;
      const end = new T.Mesh(lower, chrome);
      end.position.y = -0.12;
      const knob = new T.Mesh(ball, chrome);
      knob.position.y = -0.24;
      tip.add(end, knob);
      arm.add(top, tip);
      arm.traverse((o) => ((o as T.Mesh).castShadow = true));
      this.hub.add(hinge);
      this.prongs.push(arm);
    }
    this.scene.add(this.hub);
    this.cable = this.add(new T.CylinderGeometry(0.018, 0.018, 1, 6), dark, 0, 0, 0);
    this.bridge = this.add(block(2 * PIT.x1 + 0.4, 0.1, 0.14, 0.03), dark, 0, CAB.rail, 0);
    this.trolley = this.add(block(0.34, 0.16, 0.34, 0.04), chrome, 0, CAB.rail - 0.08, 0);
    // A red ring on whatever lies under the claw while it is being steered.
    this.target = ringMesh((r) => this.own(r), 0.16, 0.24, "#ff2a5a");
    this.scene.add(this.target);
    this.led = this.controls(keep);
    this.scene.add(this.shelf);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -AIM_HEIGHT);
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The arcade round the machine: a dark carpet with bright shapes, a wall with neon strips behind. */
  private room(keep: <R extends { dispose(): void }>(r: R) => R) {
    const carpet = painted(512, 512, (pen) => {
      pen.fillStyle = "#1c1642";
      pen.fillRect(0, 0, 512, 512);
      const random = sequence(77);
      pen.lineWidth = 5;
      for (let k = 0; k < 80; k++) {
        pen.strokeStyle = ["rgba(255,74,176,0.45)", "rgba(56,224,255,0.4)", "rgba(255,226,58,0.4)"][k % 3];
        const x = random() * 512,
          y = random() * 512;
        pen.beginPath();
        if (k % 2) pen.arc(x, y, 9, 0, Math.PI * 2);
        else {
          pen.moveTo(x - 12, y + 8);
          pen.lineTo(x, y - 10);
          pen.lineTo(x + 12, y + 8);
          pen.closePath();
        }
        pen.stroke();
      }
    });
    carpet.wrapS = carpet.wrapT = T.RepeatWrapping;
    carpet.repeat.set(6, 6);
    keep(carpet);
    this.add(new T.PlaneGeometry(50, 50).rotateX(-Math.PI / 2), this.standard({ map: carpet, roughness: 0.95 }), 0, CAB.ground, 0).castShadow = false;
    const wall = this.add(new T.PlaneGeometry(50, 20), this.standard({ color: "#2a2156", roughness: 0.9 }), 0, 6, -7);
    wall.castShadow = false;
    for (const [y, color] of [[2.2, "#ff4ab0"], [3.0, "#38e0ff"]] as const) {
      const strip = this.add(new T.BoxGeometry(30, 0.08, 0.05), this.own(new T.MeshBasicMaterial({ color })), 0, y, -6.95);
      strip.castShadow = false;
    }
  }
  /** The cabinet: base, posts, the pit's floor with the chute cut out, the glass, the backdrop and the sign with bulbs. */
  private cabinet(keep: <R extends { dispose(): void }>(r: R) => R) {
    const pink = keep(glossy({ color: "#ff6fae", roughness: 0.3 }, 0.5)),
      white = this.standard({ color: "#fbf4f8", roughness: 0.4 }),
      { x: X, z: Z, ground } = CAB;
    // The base under the pit, white with a pink stripe: solid below the chute's shaft, walls round the rest
    // (a solid top would close the chute's mouth).
    const low = -1.65;
    this.add(block(2 * X, low - ground, 2 * Z, 0.08), white, 0, (low + ground) / 2, 0).castShadow = false;
    for (const side of [-1, 1]) {
      this.add(block(2 * X, -0.02 - low, 0.1, 0.03), white, 0, (low - 0.02) / 2, side * (Z - 0.05)).castShadow = false;
      this.add(block(0.1, -0.02 - low, 2 * Z, 0.03), white, side * (X - 0.05), (low - 0.02) / 2, 0).castShadow = false;
    }
    this.add(block(2 * X + 0.02, 0.18, 2 * Z + 0.02, 0.05), pink, 0, -0.5, 0).castShadow = false;
    // Four posts.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.add(block(0.22, CAB.glass - ground + 0.7, 0.22, 0.06), pink, sx * X, (CAB.glass + ground + 0.7) / 2, sz * Z);
    // The pit's floor, cut through at the chute.
    const shape = new T.Shape();
    shape.moveTo(PIT.x0, -PIT.z1);
    shape.lineTo(PIT.x1, -PIT.z1);
    shape.lineTo(PIT.x1, -PIT.z0);
    shape.lineTo(PIT.x0, -PIT.z0);
    shape.closePath();
    const hole = new T.Path();
    hole.moveTo(CHUTE.x0 + 0.02, -CHUTE.z1 + 0.02);
    hole.lineTo(CHUTE.x0 + 0.02, -CHUTE.z0);
    hole.lineTo(CHUTE.x1, -CHUTE.z0);
    hole.lineTo(CHUTE.x1, -CHUTE.z1 + 0.02);
    hole.closePath();
    shape.holes.push(hole);
    const floor = new T.ShapeGeometry(shape),
      uv = floor.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
    floor.rotateX(-Math.PI / 2);
    const pile = keep(plush());
    pile.wrapS = pile.wrapT = T.RepeatWrapping;
    this.add(floor, this.standard({ map: pile, roughness: 1 }), 0, 0, 0).castShadow = false;
    // Round the pit, low walls (the floor's edges); the chute's dark shaft and its clear wall.
    const shaft = this.standard({ color: "#2a1a2a", roughness: 0.9, side: T.BackSide }),
      w = CHUTE.x1 - CHUTE.x0,
      d = CHUTE.z1 - CHUTE.z0;
    this.add(new T.BoxGeometry(w, 1.6, d), shaft, (CHUTE.x0 + CHUTE.x1) / 2, -0.8, (CHUTE.z0 + CHUTE.z1) / 2).castShadow = false;
    const acrylic = this.own(new T.MeshStandardMaterial({ color: "#e8f6ff", roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide }));
    this.add(new T.PlaneGeometry(d, 0.6).rotateY(Math.PI / 2), acrylic, CHUTE.x1, 0.3, (CHUTE.z0 + CHUTE.z1) / 2).castShadow = false;
    this.add(new T.PlaneGeometry(w, 0.6), acrylic, (CHUTE.x0 + CHUTE.x1) / 2, 0.3, CHUTE.z0).castShadow = false;
    const edge = this.standard({ color: "#ffffff", roughness: 0.3 });
    this.add(block(0.05, 0.05, d, 0.02), edge, CHUTE.x1, 0.6, (CHUTE.z0 + CHUTE.z1) / 2);
    this.add(block(w, 0.05, 0.05, 0.02), edge, (CHUTE.x0 + CHUTE.x1) / 2, 0.6, CHUTE.z0);
    // A yellow band round the chute's mouth, painted on the floor, and the word for it.
    // The backdrop at the back and the glass on the other three sides.
    const back = this.add(new T.PlaneGeometry(2 * X - 0.2, CAB.glass), this.standard({ map: keep(backdrop()), roughness: 0.7 }), 0, CAB.glass / 2, -Z + 0.12);
    back.castShadow = false;
    const glass = this.own(new T.MeshStandardMaterial({ color: "#eaf4ff", roughness: 0.03, metalness: 0.1, transparent: true, opacity: 0.1, depthWrite: false, side: T.DoubleSide }));
    for (const side of [-1, 1]) this.add(new T.PlaneGeometry(2 * Z - 0.2, CAB.glass).rotateY(Math.PI / 2), glass, side * (X - 0.04), CAB.glass / 2, 0).castShadow = false;
    const front = this.add(new T.PlaneGeometry(2 * X - 0.2, CAB.glass), glass, 0, CAB.glass / 2, Z - 0.04);
    front.castShadow = false;
    // Light caught on the front glass: two faint slanting streaks.
    const streak = this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.08, depthWrite: false }));
    for (const [x, wide] of [[-1.2, 0.5], [-0.4, 0.18]] as const) {
      const band = this.add(new T.PlaneGeometry(wide, CAB.glass * 1.1), streak, x, CAB.glass / 2, Z - 0.03);
      band.rotation.z = -0.5;
      band.castShadow = false;
    }
    // The roof and the sign over the glass, with bulbs round the sign.
    this.add(block(2 * X + 0.3, 0.5, 2 * Z + 0.3, 0.1), pink, 0, CAB.glass + 0.45, 0);
    const sign = this.add(new T.PlaneGeometry(2 * X - 0.3, 0.62), this.standard({ map: keep(signFace()), roughness: 0.5, emissive: "#ffffff", emissiveMap: keep(signFace()), emissiveIntensity: 0.25 }), 0, CAB.glass + 0.45, Z + 0.16);
    sign.castShadow = false;
    const bulb = keep(new T.SphereGeometry(0.06, 10, 8));
    for (let k = 0; k < 18; k++) {
      const paint = this.standard({ color: "#fff6c0", emissive: "#ffd04a", emissiveIntensity: 1 });
      this.bulbs.push(paint);
      const x = -X + 0.15 + (k * (2 * X - 0.3)) / 17;
      this.add(bulb, paint, x, CAB.glass + 0.12, Z + 0.17).castShadow = false;
    }
    // The gantry's two rails along the sides, under the roof.
    const rail = this.standard({ color: "#3a3f48", roughness: 0.4, metalness: 0.6 });
    for (const side of [-1, 1]) this.add(block(0.12, 0.12, 2 * PIT.z1 + 0.4, 0.03), rail, side * (PIT.x1 + 0.12), CAB.rail, 0);
  }
  /** The control deck under the glass: the lights (tries, seconds, prizes), the joystick, the big button and a tray for prizes. */
  private controls(keep: <R extends { dispose(): void }>(r: R) => R) {
    const deck = new T.Group(),
      top = this.standard({ color: "#2a2340", roughness: 0.5 }),
      pink = keep(glossy({ color: "#ff6fae", roughness: 0.3 }, 0.5));
    deck.position.set(0, DECK.y, DECK.z);
    deck.rotation.x = DECK.tilt;
    this.scene.add(deck);
    this.add(block(2 * CAB.x, 0.22, 0.95, 0.07), [pink, pink, top, pink, pink, pink], 0, -0.11, 0, deck);
    // The lights.
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 160;
    const texture = keep(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    const screen = this.add(new T.PlaneGeometry(1.9, 0.48).rotateX(-Math.PI / 2), this.own(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), -0.75, 0.005, 0, deck);
    screen.castShadow = screen.receiveShadow = false;
    // The joystick: a black boot, a steel stick, a red ball.
    this.add(new T.CylinderGeometry(0.16, 0.2, 0.06, 20), this.standard({ color: "#141018", roughness: 0.6 }), 0.55, 0.03, 0, deck);
    this.add(new T.CylinderGeometry(0.025, 0.025, 0.36, 10), this.standard({ color: "#cfd4da", roughness: 0.25, metalness: 0.8 }), 0, 0.18, 0, this.stick);
    this.add(new T.SphereGeometry(0.11, 18, 14), keep(glossy({ color: "#e8252a", roughness: 0.3 }, 0.6)), 0, 0.38, 0, this.stick);
    this.stick.position.set(0.55, 0.03, 0);
    deck.add(this.stick);
    // The big button in a white ring (where `BUTTON` says, for taps and tests).
    this.add(new T.CylinderGeometry(0.27, 0.29, 0.06, 28), this.standard({ color: "#ffffff", roughness: 0.4 }), BUTTON.x, 0.03, 0, deck);
    this.button = this.add(new T.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), keep(glossy({ color: "#ff2a4a", emissive: "#600010", roughness: 0.3 }, 0.6)), BUTTON.x, 0.05, 0, deck);
    // The prize tray at the left end.
    this.add(block(0.8, 0.12, 0.75, 0.04), this.standard({ color: "#ffd6ea", roughness: 0.5 }), -2.15, 0.06, 0, deck);
    deck.add(this.shelf);
    this.shelf.position.set(-2.15, 0.16, 0);
    return { canvas, texture, said: "" };
  }
  /** Paints the lights: tries left, seconds to aim, prizes caught. */
  private lights(state: State) {
    const seconds = this.world.claw.phase === "aim" && state.winner === null ? Math.ceil(this.world.aimLeft) : 0,
      said = `${state.tries}|${seconds}|${state.prizes.length}`;
    if (said === this.led.said) return;
    this.led.said = said;
    const pen = this.led.canvas.getContext("2d")!;
    pen.fillStyle = "#0c0a10";
    pen.fillRect(0, 0, 640, 160);
    pen.textBaseline = "middle";
    pen.textAlign = "center";
    const cell = (label: string, value: string, x: number, color: string) => {
      pen.font = '800 26px "Inter", "Noto Sans KR", sans-serif';
      pen.fillStyle = "#ffcf5a";
      pen.fillText(label, x, 34);
      pen.font = '900 78px "Courier New", monospace';
      pen.shadowColor = color;
      pen.shadowBlur = 18;
      pen.fillStyle = color;
      pen.fillText(value, x, 104);
      pen.shadowBlur = 0;
    };
    cell("남은 횟수", String(state.tries).padStart(2, "0"), 110, "#ff4a2a");
    cell("시간", seconds ? String(seconds).padStart(2, "0") : "--", 320, seconds && seconds <= 5 ? "#ffe23a" : "#ff4a2a");
    cell("인형", String(state.prizes.length).padStart(2, "0"), 530, "#5aff8a");
    this.led.texture.needsUpdate = true;
  }
  /** Shapes and paints the toys share. */
  private toyKit(keep: <R extends { dispose(): void }>(r: R) => R) {
    return {
      ball: keep(new T.SphereGeometry(1, 24, 18)),
      ear: keep(new T.SphereGeometry(0.3, 14, 10)),
      long: keep(new T.CapsuleGeometry(0.16, 0.7, 6, 12)),
      eye: keep(new T.SphereGeometry(0.1, 12, 8)),
      beak: keep(new T.ConeGeometry(0.16, 0.32, 14)),
      cheek: keep(new T.CircleGeometry(0.13, 16)),
      black: this.standard({ color: "#141018", roughness: 0.3 }),
      white: this.standard({ color: "#ffffff", roughness: 0.6 }),
      blush: this.own(new T.MeshBasicMaterial({ color: "#ff9ab8", transparent: true, opacity: 0.8 })),
      fur0: this.standard({ color: "#a86a3a", roughness: 0.95 }),
      snout0: this.standard({ color: "#f0d2a8", roughness: 0.95 }),
      fur1: this.standard({ color: "#ffd2e4", roughness: 0.95 }),
      inner1: this.standard({ color: "#ff8ab4", roughness: 0.9 }),
      fur2: this.standard({ color: "#ffd83a", roughness: 0.9 }),
      beak2: this.standard({ color: "#ff8a1a", roughness: 0.6 }),
      fur3: this.standard({ color: "#5aa0f0", roughness: 0.9 }),
      belly3: this.standard({ color: "#e8f2ff", roughness: 0.9 }),
      fur4: this.standard({ color: "#6ac85a", roughness: 0.9 }),
    } as Record<string, T.BufferGeometry | T.Material>;
  }
  /** Builds a soft toy of a kind: a plump body with a face, ears or a beak, sized to its radius. */
  private toy(kind: number, r: number): ToyModel {
    const k = this.kit as Record<string, never>,
      root = new T.Group(),
      body = new T.Group(),
      part = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, s: number | [number, number, number] = 1) => {
        const mesh = new T.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        if (Array.isArray(s)) mesh.scale.set(...s);
        else mesh.scale.setScalar(s);
        mesh.castShadow = true;
        body.add(mesh);
        return mesh;
      };
    const fur = [k.fur0, k.fur1, k.fur2, k.fur3, k.fur4][kind] as T.Material;
    if (kind === 3) part(k.ball, fur, 0, 0, 0, [1.12, 0.82, 0.95]);
    else part(k.ball, fur, 0, 0, 0, [1, 0.95, 0.92]);
    // The face, on the front upper part.
    const eyeY = kind === 4 ? 0.62 : 0.25,
      eyeZ = kind === 4 ? 0.55 : 0.82;
    if (kind === 4) for (const s of [-1, 1]) part(k.ball, k.white, s * 0.36, 0.62, 0.45, 0.24);
    for (const s of [-1, 1]) part(k.eye, k.black, s * 0.3, eyeY, eyeZ, kind === 4 ? 1 : 0.9);
    for (const s of [-1, 1]) {
      const cheek = part(k.cheek, k.blush, s * 0.52, 0.02, 0.8);
      cheek.rotation.y = s * 0.6;
      cheek.castShadow = false;
    }
    if (kind === 0) {
      part(k.ball, k.snout0, 0, -0.05, 0.82, [0.36, 0.26, 0.22]);
      part(k.eye, k.black, 0, 0.03, 1.0, 0.8);
      for (const s of [-1, 1]) part(k.ear, fur, s * 0.62, 0.72, 0.05, 1);
    } else if (kind === 1) {
      for (const s of [-1, 1]) {
        const ear = part(k.long, fur, s * 0.3, 1.15, -0.05, 1);
        ear.rotation.z = -s * 0.22;
        const inside = part(k.long, k.inner1 as T.Material, s * 0.3, 1.15, 0.06, [0.55, 0.85, 0.4]);
        inside.rotation.z = -s * 0.22;
      }
      part(k.eye, k.inner1 as T.Material, 0, 0.0, 0.94, 0.7);
    } else if (kind === 2) {
      const beak = part(k.beak, k.beak2 as T.Material, 0, 0.02, 1.02, 1);
      beak.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) part(k.ear, fur, s * 0.9, -0.15, 0, [0.6, 1, 1.2]);
      part(k.ear, fur, 0, 1.0, 0, [0.5, 0.8, 0.5]);
    } else if (kind === 3) {
      part(k.ball, k.belly3 as T.Material, 0, -0.32, 0.25, [0.85, 0.45, 0.72]);
      for (const s of [-1, 1]) {
        const fin = part(k.ball, fur, s * 0.32, 0.18, -1.05, [0.35, 0.12, 0.3]);
        fin.rotation.y = s * 0.6;
      }
    } else {
      part(k.ball, k.inner1 as T.Material, 0, -0.08, 0.78, [0.42, 0.08, 0.2]);
    }
    body.scale.setScalar(r);
    root.add(body);
    this.scene.add(root);
    return { root, body };
  }
  protected subject() {
    return CLAW_SUBJECT;
  }
  /** The big button: a tap on it is the screen's own pick of `DROP`. */
  protected spots(): Spot[] {
    return [{ ...BUTTON, r: 0.42, point: DROP }];
  }
  /** A press on the glass sends the claw over the point under it, and it follows the finger while it is held. */
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    if (point === DROP || !this.running()) return false;
    aimAt(this.world, at.x, at.z);
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    aimAt(this.world, at.x, at.z);
  }
  /** The table never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Tells the screen what a try came to. */
  private report(events: Happening[]) {
    for (const event of events) {
      if (event.kind === "closed") this.onContact();
      else if (event.kind === "missed") {
        this.onMove({ from: -1, to: MISSED, extra: -1 });
        this.onContact();
      } else {
        this.say(event.bonus ? "보너스!" : "획득!", performance.now());
        this.onMove({ from: -1, to: (event.bonus ? BONUS : PRIZE) + event.sort, extra: -1 });
        this.onContact();
      }
    }
  }
  /** A word that rises over the chute and fades. */
  private say(text: string, now: number) {
    if (capturing()) return;
    const texture = painted(320, 128, (pen) => {
      pen.font = '900 84px "Inter", "Noto Sans KR", sans-serif';
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.lineJoin = "round";
      pen.lineWidth = 16;
      pen.strokeStyle = "#7a1450";
      pen.strokeText(text, 160, 66);
      pen.fillStyle = "#fff36a";
      pen.fillText(text, 160, 66);
    });
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(1.8, 0.72, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.words.push({ sprite, at: now });
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    if (this.running()) {
      this.left += real;
      while (this.left >= DT && this.state?.winner === null) {
        this.left -= DT;
        this.report(step(this.world));
      }
    }
    if (this.state) this.lights(this.state);
    this.pose(now);
    this.redraw();
  }
  /** Puts everything where the machine has it. */
  private pose(now: number) {
    const { claw, toys } = this.world;
    // Models for toys laid since the last time (a new game lays a new pit).
    while (this.toys.length < toys.length) this.toys.push(this.toy(toys[this.toys.length].kind, toys[this.toys.length].r));
    toys.forEach((toy, i) => {
      const model = this.toys[i];
      model.root.visible = !toy.gone;
      model.root.position.set(toy.x, toy.y, toy.z);
      // Lying, a toy leans back to look up out of the pit; held, it hangs facing the glass; falling, it tumbles.
      if (toy.vy !== null) model.root.rotation.set(-0.5 + (now / 140) % (Math.PI * 2), toy.turn, 0.3);
      else if (toy.held) model.root.rotation.set(0.15, Math.sin(now / 300) * 0.2, Math.sin(now / 230) * 0.08);
      else model.root.rotation.set(-0.55, toy.turn, 0);
    });
    // The claw, its cable to the trolley, the trolley on its bridge across the rails.
    this.hub.position.set(claw.x, claw.y, claw.z);
    const open = 0.08 + claw.open * 0.5;
    for (const arm of this.prongs) arm.rotation.z = open;
    const above = CAB.rail - 0.16,
      span = above - (claw.y + 0.16);
    this.cable.position.set(claw.x, claw.y + 0.16 + span / 2, claw.z);
    this.cable.scale.y = Math.max(0.01, span);
    this.bridge.position.z = claw.z;
    this.trolley.position.set(claw.x, CAB.rail - 0.08, claw.z);
    // Where the claw would come down, while it is steered.
    const aiming = claw.phase === "aim" && !capturing() && this.state?.winner === null;
    this.target.visible = aiming;
    if (aiming) {
      this.target.position.set(claw.x, surface(toys, claw.x, claw.z) + 0.03, claw.z);
      this.target.scale.setScalar(1 + 0.12 * Math.sin(now / 160));
    }
    // The joystick leans the way the claw is going; the button sinks a moment when pressed.
    const dx = claw.target.x - claw.x,
      dz = claw.target.z - claw.z,
      far = Math.hypot(dx, dz),
      lean = aiming && far > 0.02 ? 0.35 : 0;
    this.stick.rotation.set(lean * (far ? dz / far : 0), 0, -lean * (far ? dx / far : 0));
    const pressing = now - this.pressed < 180;
    this.button.position.y = pressing ? 0.0 : 0.05;
    // The sign's bulbs chase round.
    this.bulbs.forEach((bulb, k) => (bulb.emissiveIntensity = (k + Math.floor(now / 160)) % 3 === 0 ? 1.6 : 0.35));
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 1100;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.set((CHUTE.x0 + CHUTE.x1) / 2 + 0.3, 1.4 + p * 0.9, (CHUTE.z0 + CHUTE.z1) / 2);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
  }
  /** The toys caught so far, small, in the tray on the deck. */
  private stock(state: State) {
    if (state.prizes.length === this.shelved) return;
    this.shelved = state.prizes.length;
    for (const child of [...this.shelf.children]) child.removeFromParent();
    state.prizes.slice(-6).forEach((kind, i) => {
      const model = this.toy(kind, KINDS[kind].r * 0.45);
      model.root.removeFromParent();
      model.root.position.set(-0.24 + (i % 3) * 0.24, 0.12 + Math.floor(i / 3) * 0.16, 0.12 - Math.floor(i / 3) * 0.24);
      model.root.rotation.set(-0.4, 0, 0);
      this.shelf.add(model.root);
    });
  }
  protected place(state: State) {
    // A new game, known by the count of moves going back to nothing: a new pit and the claw over the chute.
    const anew = state.ply === 0 && this.shown > 0;
    if (anew || this.world.level !== state.level) {
      this.world = createWorld(state.level, cryptoRandom);
      for (const model of this.toys) model.root.removeFromParent();
      this.toys = [];
      for (const word of this.words) word.sprite.removeFromParent();
      this.words = [];
    } else if (state.ply === this.shown + 1 && state.last !== null) {
      // The player's steps and the button are passed on to the machine.
      if (state.last >= STEER && state.last < STEER + 4) nudge(this.world, state.last - STEER);
      else if (state.last === DROP) {
        drop(this.world);
        this.pressed = performance.now();
      }
    }
    this.shown = state.ply;
    this.lights(state);
    this.stock(state);
    this.pose(performance.now());
  }
  protected animate() {
    return false;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    for (const word of this.words) {
      (word.sprite.material as T.SpriteMaterial).map?.dispose();
      word.sprite.material.dispose();
    }
    super.dispose();
  }
}
/** Seconds to aim, for the guide. */
export const AIM_SECONDS = AIM_TIME;
/** How far the prongs reach, for tests that want the claw's tip. */
export const PRONG_REACH = REACH;
