import * as T from "three";
import { block, glossy } from "../../engine/scene-utils";
import { funfair } from "../../engine/scenery";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { GROUND, shooterCamera, swipe } from "./layout";
import { FINAL, MISS, SCORE, SHOT, TICK, onFire, worth, type State } from "./rules";
import { BALL, BOARD, DT, HAND, HOOP, LANE, READY, arc, canShoot, createWorld, flightTime, floorAt, shoot, step, type Happening, type World } from "./sim";

export const BASKETBALL_COLORS: [string, string] = ["#e8641c", "#1f4fae"];
/** A tiny fixed sequence, so that painted pictures come out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const canvasTexture = (canvas: HTMLCanvasElement, repeat?: [number, number]) => {
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
};
/** A basketball's skin: orange pebbled leather with the black seams (two great circles and the two curved ones). */
function ballSkin() {
  const W = 512,
    H = 256,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    random = sequence(7);
  ctx.fillStyle = "#d8611f";
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 14000; k++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(110,36,6,0.28)" : "rgba(255,178,120,0.2)";
    ctx.fillRect(random() * W, random() * H, 1.6, 1.6);
  }
  ctx.strokeStyle = "#1b120d";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  const line = (points: [number, number][]) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  line([[0, H / 2], [W, H / 2]]);
  for (const x of [3, W / 2, W - 3]) line([[x, 0], [x, H]]);
  for (const centre of [0.25, 0.75])
    for (const side of [-1, 1]) {
      const points: [number, number][] = [];
      for (let k = 0; k <= 40; k++) {
        const v = k / 40,
          lat = (0.5 - v) * Math.PI;
        points.push([(centre + side * 0.15 * Math.cos(lat) ** 0.7) * W, v * H]);
      }
      line(points);
    }
  return canvasTexture(c);
}
/** A net: knotted cord in diamonds on nothing, `colour` on a clear ground. */
function netTexture(colour: string, width: number, repeat: [number, number]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  for (const [a, b] of [[[0, 0], [128, 128]], [[128, 0], [0, 128]], [[-64, 64], [64, -64]], [[64, 192], [192, 64]], [[-64, 64], [64, 192]], [[64, -64], [192, 64]]] as [number, number][][]) {
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  }
  return canvasTexture(c, repeat);
}
/** The lane's floor: maple boards, an orange key toward the hoop and the machine's own star at the tray. */
function courtTexture() {
  const W = 512,
    H = 1024,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    random = sequence(11);
  for (let x = 0; x < W; x += 32)
    for (let y = -((x * 7) % 200); y < H; y += 200) {
      const tone = 196 + random() * 28;
      ctx.fillStyle = `rgb(${tone + 20}, ${tone - 18}, ${tone - 80})`;
      ctx.fillRect(x, y, 32, 200);
      ctx.fillStyle = "rgba(90,50,20,0.35)";
      ctx.fillRect(x, y, 1.5, 200);
      ctx.fillRect(x, y, 32, 1.5);
    }
  for (let k = 0; k < 900; k++) {
    ctx.fillStyle = `rgba(120,70,30,${0.05 + random() * 0.08})`;
    ctx.fillRect(random() * W, random() * H, 1 + random() * 2, 8 + random() * 30);
  }
  // The key under the hoop and its circle, toward the top of the picture (the far end).
  ctx.fillStyle = "rgba(232,100,28,0.55)";
  ctx.fillRect(W * 0.3, 0, W * 0.4, H * 0.3);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 8;
  ctx.strokeRect(W * 0.3, -10, W * 0.4, H * 0.3 + 10);
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.3, W * 0.2, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.12, W * 0.62, 0.2, Math.PI - 0.2);
  ctx.stroke();
  return canvasTexture(c);
}
/** The cabinet's sides: deep blue with orange flashes, stars and a ball flying through them. */
function sidePrint() {
  const W = 1024,
    H = 256,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    random = sequence(23),
    sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#1d3f9a");
  sky.addColorStop(1, "#0e1f55");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f07a1e";
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    const x = 140 + k * 300;
    ctx.moveTo(x, H);
    ctx.lineTo(x + 120, 0);
    ctx.lineTo(x + 170, 0);
    ctx.lineTo(x + 50, H);
    ctx.fill();
  }
  ctx.fillStyle = "#ffd84a";
  for (let k = 0; k < 26; k++) {
    const x = random() * W,
      y = random() * H,
      r = 4 + random() * 8;
    ctx.beginPath();
    for (let p = 0; p < 10; p++) {
      const a = (p / 10) * Math.PI * 2 - Math.PI / 2,
        rr = p % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.fill();
  }
  ctx.font = 'italic 900 120px "Inter", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#0b1638";
  ctx.strokeText("SHOOT!", W / 2, H / 2 + 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillText("SHOOT!", W / 2, H / 2 + 6);
  return canvasTexture(c);
}
/** The wall behind the backboard: a dark arena with spotlights and a crowd of dots. */
function backdrop() {
  const W = 512,
    H = 256,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    random = sequence(31);
  ctx.fillStyle = "#101a3c";
  ctx.fillRect(0, 0, W, H);
  for (const x of [0.15, 0.5, 0.85]) {
    const g = ctx.createRadialGradient(x * W, 0, 4, x * W, 0, 220);
    g.addColorStop(0, "rgba(255,240,200,0.55)");
    g.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  for (let k = 0; k < 700; k++) {
    ctx.fillStyle = ["#e8641c", "#ffffff", "#ffd84a", "#4aa8ff", "#ff5a8a"][Math.floor(random() * 5)];
    ctx.globalAlpha = 0.35 + random() * 0.4;
    ctx.beginPath();
    ctx.arc(random() * W, H * 0.55 + random() * H * 0.45, 2 + random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvasTexture(c);
}
/** The backboard's face: clear, with a white border and the white box over the rim. */
function boardFace() {
  const W = 512,
    H = Math.round((W * (BOARD.top - BOARD.bottom)) / (BOARD.half * 2)),
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    unit = W / (BOARD.half * 2);
  ctx.fillStyle = "rgba(220,235,255,0.22)";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.lineWidth = 10;
  const box = { w: 0.62 * unit, h: 0.45 * unit },
    rimAt = H - (HOOP.y - BOARD.bottom) * unit;
  ctx.strokeRect(W / 2 - box.w / 2, rimAt - box.h, box.w, box.h);
  return canvasTexture(c);
}
interface Word {
  sprite: T.Sprite;
  at: number;
  y: number;
}
/**
 * A basketball shooting machine in the amusement park (with the other arcade machines), seen from where the player
 * stands: a tray of balls at the front, a lane of maple boards rising to a hoop on a clear backboard, nets at the
 * sides and over the top, and a lit sign with the score and the clock. A swipe up throws the ready ball; the view
 * plays the machine in real time (`sim.ts`) and reports throws, baskets, misses and seconds as moves.
 */
export class BasketballView extends TableView<State> {
  /** A knock to be heard: the rim (`disc`), the backboard or the floor (`cushion`), the net (`pocket`). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private world: World = createWorld(1);
  private balls: T.Mesh[] = [];
  /** Where each ball was drawn last frame, for its roll. */
  private drawn: T.Vector3[] = [];
  private ballPaint: T.MeshStandardMaterial;
  private hoop = new T.Group();
  private net: T.Mesh;
  private rimPaint: T.MeshStandardMaterial;
  private dots: T.Mesh[] = [];
  private led: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private fair: { wheel: T.Group; bulbs: T.MeshStandardMaterial[] };
  private lamps: T.MeshStandardMaterial[] = [];
  private words: Word[] = [];
  /** The swipe under way (where it began, in page pixels), the keyboard's charge and turn, and how far the ready ball is lifted. */
  private press: { id: number; x: number; y: number; dx: number; dy: number } | null = null;
  private charge: { from: number; yaw: number } | null = null;
  private keyYaw = 0;
  private lift = 0;
  private paused = false;
  private last = performance.now();
  private left = 0;
  private ticker = 0;
  private shown = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#cfe9ff");
    this.scene.add(new T.HemisphereLight("#fff6e8", "#40305a", 1.5));
    const sun = new T.DirectionalLight("#fff2dc", 1.9);
    sun.position.set(-4, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
    sun.shadow.camera.right = sun.shadow.camera.top = 8;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    // A lamp under the roof net lights the hoop and the lane.
    const lamp = new T.PointLight("#fff4dc", 9, 9, 1.6);
    lamp.position.set(0, LANE.roof - 0.3, -2.6);
    this.scene.add(lamp);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.fair = funfair(this.scene, keep, GROUND);
    this.cabinet(keep);
    // The hoop: backboard, rim, net and the bracket, moving together from side to side.
    this.rimPaint = keep(glossy({ color: "#f05a14", roughness: 0.35, metalness: 0.4, emissive: "#ff4a00", emissiveIntensity: 0 }, 0.4));
    const boardDepth = 0.06,
      face = this.add(new T.PlaneGeometry(BOARD.half * 2, BOARD.top - BOARD.bottom), keep(new T.MeshStandardMaterial({ map: keep(boardFace()), transparent: true, roughness: 0.05, metalness: 0.1, depthWrite: false })), 0, (BOARD.top + BOARD.bottom) / 2, BOARD.z + 0.002, this.hoop);
    face.castShadow = false;
    face.renderOrder = 2;
    const frame = this.standard({ color: "#c9cfd6", roughness: 0.3, metalness: 0.8 });
    this.add(new T.BoxGeometry(BOARD.half * 2 + 0.08, 0.06, boardDepth), frame, 0, BOARD.top + 0.03, BOARD.z - boardDepth / 2, this.hoop);
    this.add(new T.BoxGeometry(BOARD.half * 2 + 0.08, 0.06, boardDepth), frame, 0, BOARD.bottom - 0.03, BOARD.z - boardDepth / 2, this.hoop);
    for (const sx of [-1, 1]) this.add(new T.BoxGeometry(0.06, BOARD.top - BOARD.bottom + 0.12, boardDepth), frame, sx * (BOARD.half + 0.01), (BOARD.top + BOARD.bottom) / 2, BOARD.z - boardDepth / 2, this.hoop);
    this.add(new T.TorusGeometry(HOOP.r, HOOP.tube, 10, 48).rotateX(Math.PI / 2), this.rimPaint, 0, HOOP.y, HOOP.z, this.hoop);
    this.add(new T.BoxGeometry(0.22, 0.05, HOOP.z - HOOP.r - BOARD.z + 0.04), this.rimPaint, 0, HOOP.y - 0.02, (BOARD.z + HOOP.z - HOOP.r) / 2, this.hoop);
    this.add(new T.BoxGeometry(0.3, 0.22, 0.04), this.rimPaint, 0, HOOP.y - 0.08, BOARD.z + 0.02, this.hoop);
    // The net hangs from hooks under the rim, narrowing as it goes down.
    const netProfile = [0, 0.15, 0.3, 0.45, 0.6].map((d) => new T.Vector2(HOOP.r - 0.02 - d * 0.24, -d));
    this.net = this.add(new T.LatheGeometry(netProfile, 24), keep(new T.MeshStandardMaterial({ map: keep(netTexture("#ffffff", 7, [8, 2])), transparent: true, alphaTest: 0.35, side: T.DoubleSide, roughness: 0.9 })), 0, HOOP.y, HOOP.z, this.hoop);
    this.net.castShadow = false;
    this.scene.add(this.hoop);
    // The balls: pebbled orange leather, and the aiming dots.
    this.ballPaint = keep(new T.MeshStandardMaterial({ map: keep(ballSkin()), roughness: 0.62, emissive: "#ff5a00", emissiveIntensity: 0 }));
    const ballShape = keep(new T.SphereGeometry(BALL, 40, 24));
    for (const _ of this.world.balls) {
      const mesh = new T.Mesh(ballShape, this.ballPaint);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.balls.push(mesh);
      this.drawn.push(new T.Vector3());
    }
    const dotShape = keep(new T.SphereGeometry(0.045, 12, 8)),
      dotPaint = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false }));
    for (let k = 0; k < 9; k++) {
      const dot = new T.Mesh(dotShape, dotPaint);
      dot.visible = false;
      dot.renderOrder = 5;
      this.scene.add(dot);
      this.dots.push(dot);
    }
    this.led = this.marquee(keep);
    this.listen();
    this.pose(performance.now(), 0);
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /**
   * The cabinet: a blue body on the ground, the tray at the front with a padded lip, the maple lane rising to the
   * back, printed side panels below the side nets, chrome posts, the roof net and the arena painted on the back wall.
   */
  private cabinet(keep: <R extends { dispose(): void }>(r: R) => R) {
    const body = this.standard({ color: "#1f4fae", roughness: 0.45 }),
      dark = this.standard({ color: "#121722", roughness: 0.6 }),
      chrome = this.standard({ color: "#d7dde4", roughness: 0.25, metalness: 0.85 }),
      pad = this.standard({ color: "#e8641c", roughness: 0.55 }),
      half = LANE.half,
      wall = 0.12,
      back = LANE.back,
      front = LANE.front + 0.08,
      trayTop = floorAt(READY.z);
    // The lane: a slab of maple following the ramp.
    const rise = floorAt(back) - floorAt(0.55),
      length = 0.55 - back,
      lane = this.add(new T.BoxGeometry(half * 2, 0.1, Math.hypot(length, rise)), [dark, dark, this.standard({ map: keep(courtTexture()), roughness: 0.5 }), dark, dark, dark], 0, 0, 0);
    lane.rotation.x = Math.atan2(rise, length);
    lane.position.set(0, (floorAt(back) + floorAt(0.55)) / 2 - 0.05, (back + 0.55) / 2);
    // The tray: a trough the balls roll down into, with a padded lip toward the player.
    this.add(new T.BoxGeometry(half * 2, 0.1, front - 0.55), dark, 0, trayTop - 0.05, (front + 0.55) / 2);
    this.add(block(half * 2 + wall * 2, 0.32, 0.22, 0.08), pad, 0, trayTop + 0.12, front + 0.06);
    // The body under it all, standing on the ground.
    const tall = trayTop - GROUND - 0.1;
    this.add(block(half * 2 + wall * 2, tall, front - back + 0.3, 0.06), body, 0, GROUND + tall / 2, (front + back) / 2 - 0.1);
    this.add(new T.BoxGeometry(half * 2 + wall * 2 + 0.06, 0.08, front - back + 0.36), chrome, 0, GROUND + tall - 0.02, (front + back) / 2 - 0.1).castShadow = false;
    // Printed side panels from the floor to the foot of the nets, and low walls along the tray.
    const print = this.standard({ map: keep(sidePrint()), roughness: 0.5 }),
      panelHigh = 1.05,
      panelFrom = floorAt(0.55);
    for (const sx of [-1, 1]) {
      this.add(new T.BoxGeometry(wall, panelHigh, 0.55 - back), [print, print, body, body, body, body], sx * (half + wall / 2), panelFrom + panelHigh / 2 - 0.05, (0.55 + back) / 2);
      this.add(block(wall, 0.42, front - 0.55, 0.04), body, sx * (half + wall / 2), trayTop + 0.16, (front + 0.55) / 2);
    }
    // The side nets and the roof net, held by chrome posts and rails.
    const sideNet = keep(new T.MeshStandardMaterial({ map: keep(netTexture("#20242c", 5, [14, 8])), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.9 })),
      roofNet = keep(new T.MeshStandardMaterial({ map: keep(netTexture("#20242c", 5, [6, 14])), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.9 })),
      netFoot = panelFrom + panelHigh - 0.05,
      netHigh = LANE.roof - netFoot;
    for (const sx of [-1, 1]) {
      const mesh = this.add(new T.PlaneGeometry(0.55 - back, netHigh).rotateY(Math.PI / 2), sideNet, sx * (half + wall / 2), netFoot + netHigh / 2, (0.55 + back) / 2);
      mesh.castShadow = false;
    }
    this.add(new T.PlaneGeometry(half * 2 + wall, 0.55 - back).rotateX(Math.PI / 2), roofNet, 0, LANE.roof, (0.55 + back) / 2).castShadow = false;
    const tube = 0.045;
    for (const sx of [-1, 1]) {
      for (const z of [0.55, (0.55 + back) / 2, back]) this.add(new T.CylinderGeometry(tube, tube, LANE.roof - panelFrom + 0.1, 12), chrome, sx * (half + wall / 2), (LANE.roof + panelFrom) / 2, z);
      this.add(new T.CylinderGeometry(tube, tube, 0.55 - back, 12).rotateX(Math.PI / 2), chrome, sx * (half + wall / 2), LANE.roof, (0.55 + back) / 2);
      this.add(new T.CylinderGeometry(tube, tube, 0.55 - back, 12).rotateX(Math.PI / 2), chrome, sx * (half + wall / 2), netFoot, (0.55 + back) / 2);
    }
    for (const z of [0.55, back]) this.add(new T.CylinderGeometry(tube, tube, half * 2 + wall, 12).rotateZ(Math.PI / 2), chrome, 0, LANE.roof, z);
    // The back wall: the arena painted on it, from the lane up to the roof.
    const backHigh = LANE.roof - floorAt(back);
    this.add(new T.BoxGeometry(half * 2 + wall * 2, backHigh, 0.12), [body, body, body, body, this.standard({ map: keep(backdrop()), roughness: 0.7 }), body], 0, floorAt(back) + backHigh / 2, back - 0.06);
    // A row of bulbs along the front of the roof, twinkling with the park's.
    const bulbShape = keep(new T.SphereGeometry(0.07, 10, 8));
    for (let k = 0; k < 11; k++) {
      const colour = k % 2 ? "#fff3a0" : "#ff9a3a",
        paint = this.standard({ color: colour, emissive: colour, emissiveIntensity: 0.8, roughness: 0.4 });
      this.lamps.push(paint);
      const bulb = new T.Mesh(bulbShape, paint);
      bulb.position.set(-half + (k / 10) * half * 2, LANE.roof + 0.09, 0.6);
      this.scene.add(bulb);
    }
  }
  /** The sign over the back of the machine: its name, and the lit score and clock under it. */
  private marquee(keep: <R extends { dispose(): void }>(r: R) => R) {
    const sign = new T.Group(),
      W = LANE.half * 2 + 0.5,
      high = 1.15,
      name = document.createElement("canvas");
    name.width = 1024;
    name.height = 200;
    const pen = name.getContext("2d")!,
      glow = pen.createLinearGradient(0, 0, 0, 200);
    glow.addColorStop(0, "#132a74");
    glow.addColorStop(1, "#0a163f");
    pen.fillStyle = glow;
    pen.fillRect(0, 0, 1024, 200);
    pen.font = 'italic 900 128px "Inter", Arial, sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    const letters = pen.createLinearGradient(0, 40, 0, 170);
    letters.addColorStop(0, "#ffe27a");
    letters.addColorStop(1, "#ff7a1e");
    pen.lineWidth = 14;
    pen.strokeStyle = "#1b0d00";
    pen.strokeText("BASKETBALL", 512, 106);
    pen.fillStyle = letters;
    pen.fillText("BASKETBALL", 512, 106);
    const body = this.standard({ color: "#14306f", roughness: 0.4 });
    this.add(block(W, high, 0.28, 0.08), body, 0, 0, 0, sign);
    this.add(new T.PlaneGeometry(W - 0.16, 0.44), keep(new T.MeshBasicMaterial({ map: keep(canvasTexture(name)), toneMapped: false })), 0, 0.3, 0.145, sign).castShadow = false;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const texture = keep(canvasTexture(canvas));
    this.add(new T.PlaneGeometry(W - 0.4, 0.5), keep(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, -0.24, 0.145, sign).castShadow = false;
    sign.position.set(0, LANE.roof + 0.7, LANE.back + 0.05);
    this.scene.add(sign);
    return { canvas, texture, said: "" };
  }
  /** Paints the lit panel: the score, the seconds left, and how many points a basket is worth now. */
  private lights(state: State) {
    const fire = onFire(state),
      said = `${state.score}|${state.left}|${worth(state)}|${fire}|${state.level}`;
    if (said === this.led.said) return;
    this.led.said = said;
    const ctx = this.led.canvas.getContext("2d")!;
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = '800 34px "Inter", "Noto Sans KR", Arial, sans-serif';
    ctx.fillStyle = "#ffd45a";
    ctx.fillText("SCORE", 230, 40);
    ctx.fillText("TIME", 800, 40);
    ctx.fillText(fire ? "ON FIRE" : state.left <= FINAL ? "3 POINTS" : `LEVEL ${state.level}`, 515, 40);
    ctx.font = '900 150px "Courier New", monospace';
    const digit = (text: string, x: number, colour: string) => {
      ctx.shadowColor = colour;
      ctx.shadowBlur = 26;
      ctx.fillStyle = colour;
      ctx.fillText(text, x, 152);
    };
    digit(String(state.score).padStart(3, "0"), 230, "#ff4a2a");
    digit(String(state.left).padStart(2, "0"), 800, state.left <= FINAL ? "#ff4a2a" : "#3aff7a");
    ctx.font = '900 110px "Inter", Arial, sans-serif';
    digit(`×${worth(state)}`, 515, fire ? "#ff9a2a" : "#ffd45a");
    ctx.shadowBlur = 0;
    this.led.texture.needsUpdate = true;
  }
  /** The hand: a swipe up from anywhere throws; Space held charges a throw and ← → turn it. */
  private listen() {
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || !this.running() || this.press) return;
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer that has already gone.
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.press || this.press.id !== e.pointerId) return;
      this.press.dx = e.clientX - this.press.x;
      this.press.dy = e.clientY - this.press.y;
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!this.press || this.press.id !== e.pointerId) return;
      const { x, y } = this.press;
      this.press = null;
      if (cancelled || !this.running()) return;
      const made = swipe(e.clientX - x, e.clientY - y, el.clientHeight || 1);
      if (made) this.throwBall(made.power, made.yaw);
    };
    el.addEventListener("pointerup", (e) => end(e, false));
    el.addEventListener("pointercancel", (e) => end(e, true));
    el.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (!e.repeat && !this.charge && this.running()) this.charge = { from: performance.now(), yaw: this.keyYaw };
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        this.keyYaw = Math.max(-0.3, Math.min(0.3, this.keyYaw + (e.key === "ArrowLeft" ? -0.02 : 0.02)));
        if (this.charge) this.charge.yaw = this.keyYaw;
      }
    });
    el.addEventListener("keyup", (e) => {
      if ((e.key !== " " && e.key !== "Spacebar") || !this.charge) return;
      e.preventDefault();
      const power = this.charged(performance.now());
      this.charge = null;
      if (this.running()) this.throwBall(power, this.keyYaw);
    });
    el.addEventListener("blur", () => (this.charge = null));
  }
  /** The keyboard's charge: up to full power in 1.2 seconds and back down, over and over. */
  private charged(now: number) {
    if (!this.charge) return 0;
    const t = ((now - this.charge.from) / 1200) % 2;
    return t < 1 ? t : 2 - t;
  }
  /** What the hand is about to throw, if it is aiming. */
  private aiming(now: number) {
    if (this.press) return swipe(this.press.dx, this.press.dy, this.renderer.domElement.clientHeight || 1);
    if (this.charge) return { power: this.charged(now), yaw: this.keyYaw };
    return null;
  }
  private throwBall(power: number, yaw: number) {
    if (!shoot(this.world, power, yaw)) return;
    this.lift = 0;
    this.onMove({ from: -1, to: SHOT, extra: -1 });
  }
  /** The machine never makes the screen wait. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.press = this.charge = null;
  }
  private running() {
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && !document.querySelector("dialog[open]");
  }
  /** Every press is the hand's (a swipe), never a pick. */
  protected dragStart() {
    return this.running();
  }
  /** Tells the screen what has happened in the machine, with a word over the hoop for a basket. */
  private report(events: Happening[], now: number) {
    const move = (to: number) => this.onMove({ from: -1, to, extra: -1 });
    for (const event of events) {
      if (event.kind === "second") move(TICK);
      else if (event.kind === "score" && this.state) {
        const points = worth(this.state);
        this.say(`+${points}`, points >= 4 ? "#ffb02a" : "#ffffff", now);
        move(SCORE + points);
        this.onKnock?.("pocket", 1);
      } else if (event.kind === "miss") move(MISS);
      else if (event.kind === "rim") this.onKnock?.("disc", event.strength);
      else if (event.kind === "board" || event.kind === "bounce") this.onKnock?.("cushion", event.strength);
    }
  }
  /** A word that rises from the hoop and fades. */
  private say(text: string, colour: string, now: number) {
    if (capturing()) return;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const pen = canvas.getContext("2d")!;
    pen.font = '900 92px "Inter", "Noto Sans KR", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineJoin = "round";
    pen.lineWidth = 16;
    pen.strokeStyle = "rgba(20, 10, 40, 0.85)";
    pen.strokeText(text, 128, 66);
    pen.fillStyle = colour;
    pen.fillText(text, 128, 66);
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthTest: false }));
    sprite.scale.set(1.0, 0.5, 1);
    sprite.renderOrder = 20;
    this.scene.add(sprite);
    this.words.push({ sprite, at: now, y: HOOP.y + 0.55 });
  }
  private advance(now: number) {
    const real = Math.min(0.3, (now - this.last) / 1000);
    this.last = now;
    const running = this.running();
    if (running || (this.state && this.state.winner !== null && !this.paused)) {
      // The machine keeps the wall clock's time; once the round is over the balls still come down and roll back.
      this.left += real;
      while (this.left >= DT) {
        this.left -= DT;
        const events = step(this.world);
        if (running && this.state?.winner === null) this.report(events, now);
      }
    }
    this.pose(now, real);
    this.redraw();
  }
  /** Puts everything where the machine has it: the hoop, the balls (rolling as they go), the dots, the words. */
  private pose(now: number, real: number) {
    const { world } = this;
    this.hoop.position.x = world.hoopX;
    // The net stretches and sways after a basket.
    const since = world.time - world.swish,
      swing = since >= 0 && since < 0.9 ? Math.exp(-since * 4) : 0;
    this.net.scale.set(1 - swing * 0.12, 1 + swing * 0.28 * Math.abs(Math.cos(since * 14)), 1 - swing * 0.12);
    const fire = !!this.state && onFire(this.state),
      glow = fire ? 0.55 + 0.25 * Math.sin(now / 90) : 0;
    this.ballPaint.emissiveIntensity = glow * 0.6;
    this.rimPaint.emissiveIntensity = glow;
    // The ready ball comes up into the hand while a throw is being aimed.
    const aim = this.running() ? this.aiming(now) : null;
    this.lift += ((aim ? 1 : 0) - this.lift) * Math.min(1, real * 12);
    const ready = canShoot(world) ? world.tray[0] : -1;
    world.balls.forEach((ball, k) => {
      const mesh = this.balls[k],
        target = new T.Vector3(ball.x, ball.y, ball.z);
      if (k === ready && this.lift > 0.001) target.lerp(new T.Vector3(0, HAND.y, HAND.z), this.lift);
      const was = this.drawn[k];
      if (ball.phase === "flight") mesh.rotateOnWorldAxis(new T.Vector3(1, 0, 0), ball.spin * real);
      else {
        const dx = target.x - was.x,
          dz = target.z - was.z,
          along = Math.hypot(dx, dz);
        if (along > 1e-5 && along < 0.5) mesh.rotateOnWorldAxis(new T.Vector3(dz, 0, -dx).normalize(), along / BALL);
      }
      mesh.position.copy(target);
      was.copy(target);
    });
    // The aiming dots: the first part of the throw's way, up to a little past the top of its arc.
    const shown = aim && !capturing() ? arc(aim.power, aim.yaw, flightTime(aim.power) * 0.5, (flightTime(aim.power) * 0.5) / this.dots.length) : [];
    this.dots.forEach((dot, k) => {
      dot.visible = k < shown.length;
      if (dot.visible) dot.position.set(shown[k].x, shown[k].y, shown[k].z);
    });
    // The park's wheel turns and the bulbs twinkle.
    const { wheel, bulbs } = this.fair;
    wheel.rotation.z = now / 9000;
    for (const car of wheel.children) if (car.userData.gondola) car.rotation.z = -wheel.rotation.z;
    bulbs.forEach((bulb, k) => (bulb.emissiveIntensity = (k + Math.floor(now / 300)) % 3 === 0 ? 1.4 : 0.5));
    this.lamps.forEach((bulb, k) => (bulb.emissiveIntensity = fire ? ((k + Math.floor(now / 90)) % 2 ? 1.8 : 0.4) : (k + Math.floor(now / 400)) % 3 === 0 ? 1.5 : 0.6));
    this.words = this.words.filter((word) => {
      const p = (now - word.at) / 900;
      if (p >= 1) {
        word.sprite.removeFromParent();
        (word.sprite.material as T.SpriteMaterial).map?.dispose();
        word.sprite.material.dispose();
        return false;
      }
      word.sprite.position.set(world.hoopX, word.y + p * 0.7, HOOP.z + 0.2);
      (word.sprite.material as T.SpriteMaterial).opacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      return true;
    });
    const data = this.renderer.domElement.dataset;
    data.balls = String(world.tray.length);
    data.hoop = world.hoopX.toFixed(2);
  }
  protected subject(): TableSubject {
    return { half: LANE.half + 0.4, halfZ: 5, height: 4, lookY: 1.8, tilt: 0.4 };
  }
  protected resize() {
    super.resize();
    shooterCamera(this.camera, this.camera.aspect);
    this.redraw();
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new round, known by the count of moves going back to nothing: every ball back in the tray, the clock stopped.
    const anew = state.ply === 0 && this.shown > 0;
    this.shown = state.ply;
    if (anew || this.world.level !== state.level) {
      this.world = createWorld(state.level);
      this.press = this.charge = null;
      for (const word of this.words) word.sprite.removeFromParent();
      this.words = [];
    }
    this.lights(state);
    this.pose(performance.now(), 0);
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
