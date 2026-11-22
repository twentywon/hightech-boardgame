import * as T from "three";
import { block, glossy, stuff, wood } from "../../engine/scene-utils";
import { hanokYard } from "../../engine/scenery";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { SCALE, gesture, tremor, tuhoCamera } from "./layout";
import { ARROWS, IDEAL, lying, throwCode, type State } from "./rules";
import { ARROW_LENGTH, DISTANCE, EAR_BOTTOM, HOLES, PROFILE, RELEASE, SAMPLE, airPath, fly, type Knock, type Pose, type V3 } from "./sim";

/** The feathers of each side's arrows: 홍 (red) and 청 (blue). */
export const TUHO_COLORS: [string, string] = ["#c8322b", "#2456b8"];
const S = SCALE;
/** How long a finished round's arrows stay before they are gathered, and the gathering (ms). */
const REST = 1100,
  GATHER = 650,
  /** How much of the flight the dotted line shows ahead of the hand (s), and its dots. */
  PREVIEW = 0.34,
  DOTS = 15,
  /** The arrow is drawn a little thicker than bamboo, so that it reads from the line. */
  SHAFT = 0.0075 * S,
  /** Where the hand holds the arrow, from its point (m). */
  GRIP = 0.36,
  /** How far above the level the arrow is held, pointing at the pot, before the throw lifts it (rad). */
  HOLD = 0.28;
const v3 = (p: V3) => new T.Vector3(p.x * S, p.y * S, p.z * S);
/** A wooden knock (an arrow against another) goes to the screen as a disc's knock this much stronger, so that it can be told from bronze. */
export const WOOD_KNOCK = 10;
/** How long a struck arrow quivers (ms), how far at most (rad) and how fast (rad/s). */
const QUIVER = 520,
  QUIVER_MOST = 0.05,
  QUIVER_RATE = 42;
const canvasTexture = (canvas: HTMLCanvasElement) => {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};
/** A tiny fixed sequence, so that painted pictures and scattered needles come out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
/** The bronze of the pot: a warm metal with darker bands, a band of cloud scrolls round the belly and a little green in the hollows. */
function bronzeSkin() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d")!,
    random = sequence(31);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#c08a48");
  g.addColorStop(0.5, "#a8743a");
  g.addColorStop(1, "#8e5f2e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  // Patina: soft green clouds, a few of them.
  for (let k = 0; k < 60; k++) {
    const x = random() * 1024,
      y = random() * 512,
      r = 8 + random() * 40,
      cloud = ctx.createRadialGradient(x, y, 0, x, y, r);
    cloud.addColorStop(0, `rgba(70, 120, 96, ${0.12 + random() * 0.12})`);
    cloud.addColorStop(1, "rgba(70, 120, 96, 0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Bands cast round the pot, and a row of cloud scrolls between two of them (the belly lies at about a third up).
  const band = (y: number, h: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.fillRect(0, y, 1024, h);
  };
  for (const [y, h] of [[96, 10], [182, 10], [300, 6], [420, 8]] as const) {
    band(y, h, "rgba(60, 34, 12, 0.55)");
    band(y - 3, 3, "rgba(255, 220, 160, 0.35)");
  }
  ctx.strokeStyle = "rgba(62, 36, 14, 0.6)";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  for (let k = 0; k < 12; k++) {
    const x = k * (1024 / 12) + 42,
      y = 142;
    ctx.beginPath();
    ctx.arc(x, y, 16, Math.PI * 0.2, Math.PI * 1.7);
    ctx.arc(x + 22, y + 4, 9, Math.PI * 1.2, Math.PI * 2.6);
    ctx.stroke();
  }
  return canvasTexture(c);
}
/** Bamboo: a pale yellow-green with long fibres. */
function bambooSkin() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 512;
  const ctx = c.getContext("2d")!,
    random = sequence(7);
  ctx.fillStyle = "#d8c27a";
  ctx.fillRect(0, 0, 64, 512);
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? "120, 96, 40" : "250, 240, 200"}, ${0.08 + random() * 0.12})`;
    ctx.fillRect(random() * 64, 0, 1 + random() * 2, 512);
  }
  return canvasTexture(c);
}
/** The front of the hall: white plaster in a dark timber frame, and lattice doors over hanji in the middle bays. */
function hallFront() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 362;
  const ctx = c.getContext("2d")!,
    unit = 2048 / 26;
  ctx.fillStyle = "#efe8d8";
  ctx.fillRect(0, 0, 2048, 362);
  const timber = "#5a3a22";
  ctx.fillStyle = timber;
  ctx.fillRect(0, 0, 2048, 18);
  ctx.fillRect(0, 344, 2048, 18);
  ctx.fillRect(0, 180, 2048, 10);
  // Posts every three units (the porch's posts stand at ±3 and ±9).
  for (let x = -12; x <= 12; x += 3) ctx.fillRect((x + 13) * unit - 9, 0, 18, 362);
  // Lattice doors in the four middle bays.
  for (const bay of [-6, -3, 0, 3]) {
    for (const half of [0, 1]) {
      const x0 = (bay + 13) * unit + 14 + half * (1.5 * unit - 6),
        w = 1.5 * unit - 22;
      ctx.fillStyle = "#f6f0de";
      ctx.fillRect(x0, 26, w, 310);
      ctx.fillStyle = "#6b4626";
      ctx.fillRect(x0, 26, w, 7);
      ctx.fillRect(x0, 329, w, 7);
      ctx.fillRect(x0, 26, 7, 310);
      ctx.fillRect(x0 + w - 7, 26, 7, 310);
      for (let gx = x0 + 7; gx < x0 + w - 7; gx += 16) ctx.fillRect(gx, 33, 3, 230);
      for (let gy = 33; gy < 263; gy += 16) ctx.fillRect(x0 + 7, gy, w - 14, 3);
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(x0 + 7, 263, w - 14, 66);
    }
  }
  return canvasTexture(c);
}
/** Grey roof tiles: rows of round tiles running down the slope. */
function roofTiles() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#55585e";
  ctx.fillRect(0, 0, 1024, 256);
  for (let x = 0; x < 1024; x += 12) {
    const g = ctx.createLinearGradient(x, 0, x + 12, 0);
    g.addColorStop(0, "#3c3f44");
    g.addColorStop(0.5, "#6e7178");
    g.addColorStop(1, "#3c3f44");
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 12, 256);
  }
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = "rgba(20, 20, 24, 0.25)";
    ctx.fillRect(0, y, 1024, 3);
  }
  return canvasTexture(c);
}
/** A straw mat (돗자리): woven rows of pale reed with a cloth border of dark blue. */
function matSkin() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const ctx = c.getContext("2d")!,
    random = sequence(11);
  ctx.fillStyle = "#cfb47a";
  ctx.fillRect(0, 0, 256, 1024);
  for (let y = 0; y < 1024; y += 6) {
    ctx.fillStyle = `rgba(${110 + random() * 30}, ${86 + random() * 20}, 40, ${0.18 + random() * 0.12})`;
    ctx.fillRect(0, y, 256, 2);
  }
  for (let x = 24; x < 232; x += 26) {
    ctx.fillStyle = "rgba(96, 70, 30, 0.35)";
    ctx.fillRect(x, 0, 2, 1024);
  }
  ctx.fillStyle = "#24345e";
  ctx.fillRect(0, 0, 16, 1024);
  ctx.fillRect(240, 0, 16, 1024);
  return canvasTexture(c);
}
/**
 * The court of a hanok on a clear day, seen from the throwing line: the bronze pot with its long neck and two ears
 * on a straw runner, a pine at the left, the score written on a wooden board at the right, and a red and a blue
 * banner behind. A press anywhere takes the arrow in the hand; pulled back (down) and let go it is thrown, the way
 * opposite the pull and as hard as it was pulled (pushed up, it goes that way). While it is held the hand trembles
 * (`tremor`) and a dotted line shows how the throw will leave the hand. The flight is the rules' own, replayed:
 * the arrow arcs, turns nose down, clacks on a rim, drops into the pot with a hollow ring or lies where it fell, until
 * the round is over and every arrow is gathered up.
 */
export class TuhoView extends TableView<State> {
  /** Each side's arrows of a round, used in turn, and the arrow in the hand. */
  private sets: T.Group[][] = [[], []];
  private hands: T.Group[] = [];
  private dots: T.InstancedMesh;
  private board: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  /** The pull under way (where it began and how far it has moved, in page pixels), and the keyboard's throw. */
  private press: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  private keyAim: { yaw: number; speed: number } | null = null;
  /** The hand while it holds a throw: when it began (-1 at rest), where in the tremor, and how far it has moved the throw now. */
  private hand = { since: -1, seed: 0, yaw: 0, speed: 0 };
  private shaking = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai",
  ) {
    super(host, quality, "#bcd4e6");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.background = new T.Color("#bcd4e6");
    this.scene.fog = new T.Fog("#cfdde8", 26, 60);
    const sun = this.daylight("#eaf2ff", "#8a7350", "#fff1d6", 12, 2.2);
    sun.position.set(-5, 12, 7);
    hanokYard(this.scene, keep);
    this.court(keep);
    this.hall(keep);
    this.pot(keep);
    this.board = this.scoreboard(keep);
    // The arrows: a bamboo shaft with nodes, a weighted brass point, and three feathers of the side's colour.
    const bamboo = this.standard({ map: keep(bambooSkin()), roughness: 0.55 }),
      node = this.standard({ color: "#9a8448", roughness: 0.6 }),
      brass = keep(glossy({ color: "#c9a04a", roughness: 0.3, metalness: 0.75 }, 0.4)),
      length = ARROW_LENGTH * S,
      shaft = keep(new T.CylinderGeometry(SHAFT, SHAFT * 0.92, length, 10).rotateX(Math.PI / 2).translate(0, 0, length / 2)),
      ring = keep(new T.CylinderGeometry(SHAFT * 1.25, SHAFT * 1.25, 0.014, 10).rotateX(Math.PI / 2)),
      tip = keep(new T.SphereGeometry(SHAFT * 1.7, 12, 8).scale(1, 1, 1.9).translate(0, 0, SHAFT * 1.2)),
      outline = new T.Shape();
    outline.moveTo(0, 0);
    outline.lineTo(0.05, 0.02);
    outline.quadraticCurveTo(0.06, 0.12, 0.045, 0.2);
    outline.lineTo(0, 0.22);
    outline.closePath();
    const vane = keep(new T.ShapeGeometry(outline, 4));
    const arrow = (colour: string) => {
      const g = new T.Group(),
        feather = this.standard({ color: colour, roughness: 0.75, side: T.DoubleSide });
      for (const [shape, paint, z] of [[shaft, bamboo, 0], [tip, brass, 0]] as const) {
        const mesh = new T.Mesh(shape, paint);
        mesh.position.z = z;
        mesh.castShadow = true;
        g.add(mesh);
      }
      for (const z of [0.3, 0.6, 0.9]) {
        const mesh = new T.Mesh(ring, node);
        mesh.position.z = z * length;
        g.add(mesh);
      }
      // A band of the side's colour below the feathers, so that an arrow standing in the pot tells whose it is.
      const band = new T.Mesh(ring, feather);
      band.scale.set(1.15, 1.15, 3);
      band.position.z = length - 0.3;
      g.add(band);
      for (let q = 0; q < 3; q++) {
        const mesh = new T.Mesh(vane, feather);
        mesh.rotation.set(Math.PI / 2, 0, 0);
        mesh.position.y = SHAFT * 0.5;
        const holder = new T.Group();
        holder.add(mesh);
        holder.rotation.z = (q * Math.PI * 2) / 3;
        holder.position.z = length - 0.25;
        mesh.castShadow = true;
        g.add(holder);
      }
      g.visible = false;
      this.scene.add(g);
      return g;
    };
    // The thrower's hand: a fist round the shaft a little behind its middle, in a white sleeve.
    const skin = this.standard({ color: "#e2b48e", roughness: 0.7 }),
      sleeve = this.standard({ color: "#f4f1e8", roughness: 0.95 }),
      fist = keep(block(0.085 * S, 0.075 * S, 0.1 * S, 0.03)),
      cuff = keep(new T.CylinderGeometry(0.06 * S, 0.075 * S, 0.5 * S, 16).rotateX(Math.PI / 2).translate(0, 0, 0.25 * S));
    for (const side of [0, 1]) {
      for (let k = 0; k < ARROWS; k++) this.sets[side].push(arrow(TUHO_COLORS[side]));
      const held = arrow(TUHO_COLORS[side]),
        hold = new T.Mesh(fist, skin),
        arm = new T.Mesh(cuff, sleeve);
      hold.position.set(0.01 * S, -0.02 * S, GRIP * S);
      // The sleeve runs back from the wrist toward the thrower, down and to the right.
      arm.position.set(0.03 * S, -0.04 * S, (GRIP + 0.05) * S);
      arm.rotation.set(0.5, 0.35, 0);
      held.add(hold, arm);
      this.hands.push(held);
    }
    // The dotted line ahead of the hand while a throw is held.
    this.dots = new T.InstancedMesh(keep(new T.SphereGeometry(0.022, 10, 8)), keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 })), DOTS);
    this.dots.visible = false;
    this.dots.renderOrder = 8;
    this.scene.add(this.dots);
    // Presses are pulls, taken here and never as picks.
    this.listen();
    this.begin();
  }
  /** The runner from the line to past the pot, the line itself (a cord), a pine at the left and the two banners. */
  private court(keep: <R extends { dispose(): void }>(r: R) => R) {
    const mat = this.standard({ map: keep(matSkin()), roughness: 0.95 }),
      long = (DISTANCE + 1.1) * S;
    const runner = this.add(new T.PlaneGeometry(1.5 * S, long), mat, 0, 0.004, (DISTANCE * S) / 2 - 0.55 * S + 0.2);
    runner.rotation.x = -Math.PI / 2;
    runner.castShadow = false;
    // The line: a red cord across the runner's near end, held by two pegs.
    const cord = this.standard({ color: "#a52a24", roughness: 0.7 });
    this.add(new T.CylinderGeometry(0.018, 0.018, 1.7 * S, 8).rotateZ(Math.PI / 2), cord, 0, 0.02, DISTANCE * S);
    // A pine: a leaning trunk of red bark and layered clouds of needles.
    const bark = this.standard({ ...stuff("stone", "#7a4a32", 1.5, keep), roughness: 1 }),
      needles = this.standard({ color: "#2f5a35", roughness: 0.9 }),
      dark = this.standard({ color: "#264a2c", roughness: 0.9 }),
      curve = new T.CatmullRomCurve3([new T.Vector3(-5.4, 0, -4.4), new T.Vector3(-5.3, 1.4, -4.5), new T.Vector3(-4.7, 2.7, -4.3), new T.Vector3(-4.1, 3.7, -4.6), new T.Vector3(-3.3, 4.4, -4.8)]);
    this.add(new T.TubeGeometry(curve, 24, 0.22, 10, false), bark).castShadow = true;
    const random = sequence(5),
      blob = keep(new T.IcosahedronGeometry(1, 1));
    for (const [x, y, z, r] of [[-4.6, 3.0, -4.2, 1.1], [-3.4, 4.1, -4.7, 1.3], [-5.5, 3.9, -4.8, 0.9], [-2.5, 4.6, -4.9, 1.0], [-4.2, 4.9, -5.1, 1.1]] as const)
      for (let k = 0; k < 4; k++) {
        const mesh = new T.Mesh(blob, k % 2 ? dark : needles);
        mesh.position.set(x + (random() - 0.5) * r, y + (random() - 0.5) * 0.3, z + (random() - 0.5) * r * 0.6);
        mesh.scale.set(r * (0.7 + random() * 0.4), r * 0.28, r * (0.6 + random() * 0.3));
        mesh.rotation.y = random() * 3;
        mesh.castShadow = true;
        this.scene.add(mesh);
      }
    // Two banners on poles behind the pot, 홍 at the left and 청 at the right.
    const pole = this.standard({ map: keep(wood(true)), roughness: 0.6 }),
      gold = this.standard({ color: "#d4a640", roughness: 0.4, metalness: 0.5 });
    [-1, 1].forEach((side, i) => {
      const x = side * 2.9,
        z = -3.2;
      this.add(new T.CylinderGeometry(0.04, 0.05, 3.4, 8), pole, x, 1.7, z);
      this.add(new T.SphereGeometry(0.08, 10, 8), gold, x, 3.45, z);
      const cloth = new T.PlaneGeometry(0.9, 1.6, 8, 4),
        at = cloth.getAttribute("position");
      // A gentle wave along the cloth.
      for (let k = 0; k < at.count; k++) at.setZ(k, Math.sin((at.getX(k) + 0.45) * 5) * 0.05 * (at.getX(k) + 0.45));
      cloth.computeVertexNormals();
      const flag = this.add(cloth, this.standard({ color: TUHO_COLORS[i], roughness: 0.85, side: T.DoubleSide }), x - side * 0.5, 2.55, z);
      flag.castShadow = false;
    });
  }
  /** The hall behind the porch: plastered walls in a timber frame with lattice doors, a beam and the tiled eaves. */
  private hall(keep: <R extends { dispose(): void }>(r: R) => R) {
    const front = this.standard({ map: keep(hallFront()), roughness: 0.9 }),
      timber = this.standard({ map: keep(wood(true)), roughness: 0.7 }),
      tiles = this.standard({ map: keep(roofTiles()), roughness: 0.75 });
    const wall = this.add(new T.PlaneGeometry(26, 4.6), front, 0, 0.94 + 2.3, -9.9);
    wall.castShadow = false;
    // The hall runs on past the court at either side, plain plaster.
    const plaster = this.standard({ color: "#e9e1cf", roughness: 0.95 });
    for (const side of [-1, 1]) this.add(new T.PlaneGeometry(8, 4.6), plaster, side * 17, 0.94 + 2.3, -9.9).castShadow = false;
    this.add(new T.BoxGeometry(26.4, 0.34, 0.34), timber, 0, 5.62, -7.2);
    this.add(new T.BoxGeometry(26.4, 0.3, 0.3), timber, 0, 5.62, -9.75);
    // The eaves: a sloping roof of grey tiles reaching out over the porch, with a row of round tile ends.
    // Under the eaves the rafters are dark timber, not tiles.
    const roof = this.add(new T.BoxGeometry(40, 0.3, 6.4), [tiles, tiles, tiles, timber, tiles, tiles], 0, 6.55, -8.4);
    roof.rotation.x = 0.36;
    const ends = keep(new T.CylinderGeometry(0.13, 0.13, 0.12, 12).rotateX(Math.PI / 2)),
      dark = this.standard({ color: "#43464c", roughness: 0.6 });
    const count = 111,
      row = new T.InstancedMesh(ends, dark, count),
      m = new T.Matrix4().makeRotationX(0.36);
    for (let k = 0; k < count; k++) row.setMatrixAt(k, m.setPosition(-19.8 + k * 0.36, 5.5, -5.3));
    this.scene.add(row);
  }
  /** The pot: the bronze body on its foot, the long neck with its rolled rim, and the two ears on bridges. */
  private pot(keep: <R extends { dispose(): void }>(r: R) => R) {
    const skin = keep(bronzeSkin()),
      bronze = keep(glossy({ map: skin, color: "#e0b880", roughness: 0.38, metalness: 0.55 }, 0.25)),
      inside = this.standard({ color: "#2a1a0e", roughness: 0.9, side: T.BackSide }),
      beans = this.standard({ color: "#5a1f1a", roughness: 0.95 });
    const profile = PROFILE.map(([y, r]) => new T.Vector2(r * S, y * S));
    this.add(new T.LatheGeometry(profile, 48), bronze);
    // The foot's underside and the closed bottom, so that the pot never shows through.
    this.add(new T.CircleGeometry(PROFILE[0][1] * S, 32).rotateX(-Math.PI / 2), bronze, 0, 0.002, 0).castShadow = false;
    // Raised rings on the neck and the shoulder.
    for (const [y, r] of [[0.5, 0.07], [0.44, 0.075], [0.34, 0.153]] as const) {
      const ring = this.add(new T.TorusGeometry(r * S, 0.006 * S, 8, 48), bronze, 0, y * S, 0);
      ring.rotation.x = Math.PI / 2;
    }
    HOLES.forEach((hole) => {
      const ring = this.add(new T.TorusGeometry((hole.inner + hole.tube) * S, hole.tube * S, 10, 48), bronze, hole.x * S, (hole.top - hole.tube) * S, hole.z * S);
      ring.rotation.x = Math.PI / 2;
      // Inside: a dark wall down to the beans (the mouth) or the closed bottom (an ear).
      const deep = hole.depth;
      this.add(new T.CylinderGeometry(hole.inner * S, hole.inner * S, deep * S, 24, 1, true), inside, hole.x * S, (hole.top - hole.tube - deep / 2) * S, hole.z * S).castShadow = false;
      this.add(new T.CircleGeometry(hole.inner * S, 24).rotateX(-Math.PI / 2), hole.kind === "mouth" ? beans : inside, hole.x * S, (hole.top - deep) * S, hole.z * S).castShadow = false;
      if (hole.kind !== "ear") return;
      const outer = hole.inner + hole.tube * 2,
        height = hole.top - hole.tube - EAR_BOTTOM;
      this.add(new T.CylinderGeometry(outer * S, outer * S * 0.9, height * S, 24, 1, true), bronze, hole.x * S, (EAR_BOTTOM + height / 2) * S, hole.z * S);
      this.add(new T.SphereGeometry(outer * S * 0.9, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bronze, hole.x * S, EAR_BOTTOM * S, hole.z * S);
      // The bridge to the neck.
      const side = Math.sign(hole.x),
        from = 0.064,
        to = Math.abs(hole.x) - outer + 0.004;
      this.add(block((to - from) * S, 0.03 * S, 0.026 * S, 0.008), bronze, side * ((from + to) / 2) * S, 0.47 * S, 0);
    });
  }
  /** The scoreboard: a board of pale wood on two legs at the right of the pot, painted afresh with each throw. */
  private scoreboard(keep: <R extends { dispose(): void }>(r: R) => R) {
    const oak = keep(wood(false)),
      frame = this.standard({ map: oak, color: "#a06a3c", roughness: 0.6 }),
      x = 2.25,
      z = -1.0,
      w = 1.7,
      h = 1.15,
      y = 1.55,
      turn = -0.42;
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    this.scene.add(group);
    this.add(block(w + 0.12, h + 0.12, 0.06, 0.03), frame, 0, y, 0, group);
    for (const side of [-1, 1]) this.add(block(0.08, y - h / 2 + 0.04, 0.08, 0.02), frame, side * (w / 2 - 0.12), (y - h / 2) / 2, -0.02, group);
    const canvas = document.createElement("canvas");
    canvas.width = 680;
    canvas.height = Math.round((680 * h) / w);
    const texture = keep(canvasTexture(canvas));
    this.add(new T.PlaneGeometry(w, h), this.standard({ map: texture, roughness: 0.85 }), 0, y, 0.031, group).castShadow = false;
    return { canvas, texture, said: "" };
  }
  /** Writes the board: each side's total, its arrows left as strokes, the rounds' own scores, and who throws. */
  private writeBoard(state: State) {
    const said = `${state.ply}|${state.turn}|${state.winner}|${this.mode}`;
    if (said === this.board.said) return;
    this.board.said = said;
    const { canvas } = this.board,
      W = canvas.width,
      H = canvas.height,
      ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#efe2c4");
    g.addColorStop(1, "#e2d0a8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(90, 60, 30, 0.5)";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const ink = "#2a1d12",
      font = (size: number, weight = 700) => (ctx.font = `${weight} ${size}px "Noto Serif KR", "Noto Sans KR", serif`);
    ctx.fillStyle = ink;
    font(44, 800);
    ctx.fillText("投壺 투호", W / 2, 58);
    font(28, 600);
    const round = Math.min(state.round, state.rounds);
    ctx.fillText(state.winner !== null ? "놀이 끝" : state.rounds > 1 ? `${round} / ${state.rounds}판` : "한 판", W / 2, 100);
    const names = this.mode === "ai" ? ["나 · 홍", "컴퓨터 · 청"] : ["홍", "청"],
      cols = [W * 0.27, W * 0.73];
    ctx.fillStyle = "rgba(60, 40, 20, 0.35)";
    ctx.fillRect(W / 2 - 1.5, 124, 3, H - 160);
    names.forEach((name, side) => {
      const x = cols[side];
      ctx.fillStyle = TUHO_COLORS[side];
      font(32, 800);
      ctx.fillText(name, x, 148);
      if (state.winner === null && state.turn === side) {
        const left = x - ctx.measureText(name).width / 2 - 22;
        ctx.beginPath();
        ctx.moveTo(left - 12, 136);
        ctx.lineTo(left + 4, 148);
        ctx.lineTo(left - 12, 160);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = ink;
      font(96, 800);
      ctx.fillText(String(state.scores[side]), x, 236);
      // The arrows still in hand, as upright strokes.
      const left = state.winner !== null ? 0 : ARROWS - state.thrown[side];
      for (let k = 0; k < ARROWS; k++) {
        const ax = x - (ARROWS - 1) * 11 + k * 22;
        ctx.fillStyle = k < left ? TUHO_COLORS[side] : "rgba(60, 40, 20, 0.18)";
        ctx.fillRect(ax - 3, 300, 6, 40);
      }
      if (state.rounds > 1) {
        font(22, 600);
        ctx.fillStyle = ink;
        ctx.fillText(state.history.map((r, i) => `${i + 1}판 ${r[side]}`).join(" · ") || " ", x, 370);
      }
    });
    this.board.texture.needsUpdate = true;
  }
  /** Who may throw now by hand. */
  private canThrow() {
    const state = this.state;
    return !!state && state.winner === null && !this.animating && (this.mode === "local" || state.turn === 0) && !document.hidden && !document.querySelector("dialog[open]");
  }
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || !this.canThrow() || this.press) return;
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
      this.aimShown();
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.press || this.press.id !== e.pointerId) return;
      this.press.dx = e.clientX - this.press.x;
      this.press.dy = e.clientY - this.press.y;
      this.aimShown();
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.press || this.press.id !== e.pointerId) return;
      const { x, y } = this.press,
        made = cancelled || !this.canThrow() ? null : gesture(e.clientX - x, e.clientY - y, el.clientHeight || 1),
        hand = this.trembled();
      this.press = null;
      this.aimShown();
      if (made) this.throwWith(made.yaw + hand.yaw, made.speed + hand.speed);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => {
      const steps: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (steps[e.key]) {
        e.preventDefault();
        if (!this.canThrow()) return;
        const fine = e.shiftKey ? 0.25 : 1,
          from = this.keyAim ?? { ...IDEAL[0] };
        this.keyAim = {
          yaw: Math.max(-0.3, Math.min(0.3, from.yaw + steps[e.key][0] * 0.004 * fine)),
          speed: Math.max(2.5, Math.min(7, from.speed + steps[e.key][1] * 0.02 * fine)),
        };
        this.aimShown();
      } else if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
        e.preventDefault();
        if (!this.canThrow()) return;
        const aim = this.keyAim ?? IDEAL[0],
          hand = this.trembled();
        this.throwWith(aim.yaw + hand.yaw, aim.speed + hand.speed);
      }
    });
    el.addEventListener("blur", () => {
      this.keyAim = null;
      this.aimShown();
    });
  }
  /** A person's throw: exactly what the hand let go with, no scatter of its own. */
  private throwWith(yaw: number, speed: number) {
    this.dots.visible = false;
    this.onMove({ from: -1, to: throwCode(yaw, speed), extra: 0 });
  }
  /** How far the hand had moved the throw when it was last drawn; a throw made before it was shown is caught somewhere in the tremor. */
  private trembled() {
    return this.hand.since >= 0 ? { yaw: this.hand.yaw, speed: this.hand.speed } : tremor(0, Math.random() * 1000);
  }
  /** The throw the pull under way, or the keyboard, would make now. */
  private aimed() {
    if (this.press) return gesture(this.press.dx, this.press.dy, this.renderer.domElement.clientHeight || 1);
    return this.keyAim;
  }
  /** Lays the dotted line where the hand now has the throw, trembling as it does. */
  private aimShown() {
    const el = this.renderer.domElement,
      aim = this.aimed(),
      shown = !!aim && !capturing() && this.canThrow();
    if (!aim) this.hand.since = -1;
    if (aim && shown) {
      const now = performance.now();
      if (this.hand.since < 0) this.hand = { since: now, seed: Math.random() * 1000, yaw: 0, speed: 0 };
      const off = tremor((now - this.hand.since) / 1000, this.hand.seed);
      this.hand.yaw = off.yaw;
      this.hand.speed = off.speed;
      const points = airPath(aim.yaw + off.yaw, aim.speed + off.speed, PREVIEW, DOTS),
        m = new T.Matrix4();
      points.forEach((p, k) => {
        const fade = 1 - (k / DOTS) * 0.55;
        m.makeScale(fade, fade, fade).setPosition(v3(p));
        this.dots.setMatrixAt(k, m);
      });
      this.dots.count = points.length;
      this.dots.instanceMatrix.needsUpdate = true;
      if (!this.shaking) this.shaking = requestAnimationFrame(this.tremble);
    }
    this.dots.visible = shown;
    const said = aim && shown ? `${(aim.yaw + this.hand.yaw).toFixed(5)},${(aim.speed + this.hand.speed).toFixed(3)}` : "";
    if (el.dataset.aim !== said) el.dataset.aim = said;
    this.handPose();
    this.redraw();
  }
  private tremble = () => {
    this.shaking = 0;
    if (!this.disposed) this.aimShown();
  };
  /** Every press is the hand's, never a pick. */
  protected dragStart() {
    return this.canThrow();
  }
  protected subject(): TableSubject {
    return { half: 2.2, halfZ: 2.2, height: 1, lookY: 1, tilt: 0.3 };
  }
  protected resize() {
    super.resize();
    tuhoCamera(this.camera, this.camera.aspect);
    this.handPose();
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Points a model's tail along `tail` (its point leads the other way). */
  private point(model: T.Object3D, tail: T.Vector3) {
    model.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), tail.clone().normalize());
  }
  private lay(model: T.Object3D, pose: Pose) {
    model.visible = true;
    model.scale.setScalar(1);
    model.position.copy(v3(pose.tip));
    if (pose.q) model.quaternion.set(...pose.q);
    else this.point(model, new T.Vector3(-pose.dir.x, -pose.dir.y, -pose.dir.z));
  }
  /** The model of the `k`-th arrow of a round's `arrows`: each side's arrows are used in turn. */
  private modelOf(arrows: State["arrows"], k: number) {
    const side = arrows[k].side;
    return this.sets[side][arrows.slice(0, k).filter((a) => a.side === side).length];
  }
  /** An arrow struck by another quivers about its point, a little and quickly dying away, then stands as it was. */
  private quiver(model: T.Object3D, pose: Pose, knock: Knock, at: number) {
    const dir = new T.Vector3(pose.dir.x, pose.dir.y, pose.dir.z),
      axis = new T.Vector3().crossVectors(dir, new T.Vector3(0, 1, 0));
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const base = pose.q ? new T.Quaternion(...pose.q) : new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), dir.clone().negate()),
      most = QUIVER_MOST * Math.min(1, knock.strength * 2.5),
      turn = new T.Quaternion();
    this.tween(at, QUIVER, (p) => {
      const t = (p * QUIVER) / 1000,
        angle = p >= 1 ? 0 : most * Math.exp(-t * 9) * Math.sin(t * QUIVER_RATE);
      model.quaternion.copy(turn.setFromAxisAngle(axis, angle).multiply(base));
    });
  }
  /** The arrow in the hand: held at the release, along the throw it would make, drawn back as far as it is pulled. */
  private handPose() {
    const state = this.state,
      side = state?.turn ?? 0,
      aim = this.aimed() ?? IDEAL[0];
    this.hands.forEach((hand, k) => {
      hand.visible = k === side && this.canThrow() && !capturing();
      if (!hand.visible) return;
      const yaw = aim.yaw + (this.hand.since >= 0 ? this.hand.yaw : 0),
        up = Math.sin(HOLD),
        level = Math.cos(HOLD),
        dir = new T.Vector3(Math.sin(yaw) * level, up, -Math.cos(yaw) * level),
        pull = this.press ? Math.min(0.35, Math.hypot(this.press.dx, this.press.dy) / (this.renderer.domElement.clientHeight || 1)) : 0;
      hand.position.copy(v3(RELEASE)).addScaledVector(dir, -pull * 0.4 * S);
      this.point(hand, dir.clone().multiplyScalar(-1));
    });
  }
  protected place(state: State) {
    for (const set of this.sets) for (const model of set) model.visible = false;
    state.arrows.forEach((arrow, k) => this.lay(this.modelOf(state.arrows, k), arrow.rest));
    this.writeBoard(state);
    this.handPose();
    this.aimShown();
  }
  protected animate(before: State, state: State) {
    const arrow = state.last;
    if (!arrow || state.ply !== before.ply + 1) return false;
    const model = this.sets[arrow.side][before.thrown[arrow.side]],
      flight = fly(arrow.yaw, arrow.speed, { record: true, others: lying(before) }),
      path = flight.path,
      last = path.length - 1,
      duration = Math.max(SAMPLE, flight.time) * 1000,
      from = new T.Quaternion(),
      to = new T.Quaternion();
    for (const hand of this.hands) hand.visible = false;
    this.dots.visible = false;
    model.visible = true;
    // The flight as the rules flew it, point and turn: a sample every `SAMPLE` seconds, and the rest at the end.
    this.tween(0, duration, (p) => {
      const time = p * flight.time,
        at = Math.min(last - 1, Math.floor(time / SAMPLE)),
        a = path[Math.max(0, at)],
        b = path[Math.min(last, at + 1)],
        span = at + 1 >= last ? Math.max(SAMPLE * 0.5, flight.time - at * SAMPLE) : SAMPLE,
        f = p >= 1 ? 1 : Math.max(0, Math.min(1, (time - at * SAMPLE) / span));
      model.position.copy(v3(a.tip).lerp(v3(b.tip), f));
      if (a.q && b.q) model.quaternion.copy(from.set(...a.q)).slerp(to.set(...b.q), f);
    });
    // What it strikes is heard as it strikes it, and an arrow it knocks against quivers.
    for (const knock of flight.knocks) {
      const when = Math.min(knock.t * 1000, duration);
      this.tween(when, 1, (p) => {
        if (p < 1) return;
        if (knock.kind === "rim" || knock.kind === "pot") this.onKnock?.("disc", knock.strength);
        else if (knock.kind === "in" || knock.kind === "inside") this.onKnock?.("pocket", knock.strength);
        else if (knock.kind === "arrow") this.onKnock?.("disc", knock.strength + WOOD_KNOCK);
        else this.onKnock?.("cushion", knock.strength);
      });
      if (knock.kind === "arrow" && knock.other !== undefined && before.arrows[knock.other]) this.quiver(this.modelOf(before.arrows, knock.other), before.arrows[knock.other].rest, knock, when);
    }
    if (!state.cleared) return true;
    // The round is over: every arrow stays a moment, then all are gathered up.
    const all = [...before.arrows.map((_, k) => this.modelOf(before.arrows, k)), model];
    let start: T.Vector3[] | null = null;
    this.tween(duration + QUIVER + REST, GATHER, (p) => {
      start ??= all.map((m) => m.position.clone());
      all.forEach((m, k) => {
        if (!start) return;
        m.position.copy(start[k]);
        m.position.y += p * p * 1.6;
        m.scale.setScalar(Math.max(0.001, 1 - p));
        if (p === 1) {
          m.visible = false;
          m.scale.setScalar(1);
        }
      });
    });
    return true;
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.shaking);
    super.dispose();
  }
}
