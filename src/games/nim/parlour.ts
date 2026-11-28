import * as T from "three";
import { block, glossy, hop, stuff, travel } from "../../engine/scene-utils";
import type { TableSubject } from "../table/view";
import { BOWL, COLS, CUP, HEAP_SCALE, ROW_STEP, SCOOP_RADIUS, SCOOP_Y, bowlAt, cupAt, heapSpot, iceSubject } from "./layout";
import { ICE, left, takenBy, type State } from "./rules";
import { TakeView } from "./view";

/** The two sides' colours: my bowl (mint) and the other side's (lemon). */
export const ICE_COLORS: [string, string] = ["#55c4a0", "#f0c43c"];
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A flavour: its name, its colour, and what is in it (chips, bits, a ripple of sauce). */
interface Flavour {
  name: string;
  color: string;
  bits?: string;
  ripple?: string;
}
/** Thirty-one flavours, one a scoop, laid so that no two neighbours look alike. */
export const FLAVOURS: Flavour[] = [
  { name: "바닐라", color: "#f6ecd0", bits: "#2b1d14" },
  { name: "딸기", color: "#f3a6b2", bits: "#d2405a" },
  { name: "초콜릿", color: "#6e4129" },
  { name: "민트 초코칩", color: "#aee5d2", bits: "#3a2416" },
  { name: "녹차", color: "#a7c278" },
  { name: "망고", color: "#ffbf47" },
  { name: "블루베리", color: "#8f87cc", bits: "#4a3e8c" },
  { name: "쿠키 크림", color: "#f1e9d6", bits: "#2b2420" },
  { name: "레몬 셔벗", color: "#fbe97f" },
  { name: "캐러멜", color: "#dca15c", ripple: "#9c5a22" },
  { name: "흑임자", color: "#a19a90", bits: "#26221f" },
  { name: "고구마", color: "#efb35a", bits: "#7a3c6a" },
  { name: "피스타치오", color: "#c4d79a", bits: "#7d9a48" },
  { name: "커피", color: "#b3855e" },
  { name: "복숭아", color: "#ffcaa6" },
  { name: "포도 셔벗", color: "#b18ad4" },
  { name: "요거트", color: "#fbfaf3" },
  { name: "체리", color: "#d8566c", bits: "#8c1d34" },
  { name: "꿀", color: "#f5cf68", ripple: "#d48f1c" },
  { name: "오렌지 셔벗", color: "#ffa95a" },
  { name: "코코넛", color: "#f4efe4", bits: "#ffffff" },
  { name: "밤", color: "#c39a6b" },
  { name: "메론", color: "#c6e89c" },
  { name: "인절미", color: "#e6cf9c", bits: "#b48b4c" },
  { name: "라즈베리", color: "#e05c7c", bits: "#9b1f45" },
  { name: "초코칩", color: "#f2e5c6", bits: "#3a2214" },
  { name: "홍차", color: "#caa07a" },
  { name: "무지개 셔벗", color: "#ffd7a3", ripple: "#8fd6c4" },
  { name: "쑥", color: "#9db58a" },
  { name: "바나나", color: "#f8e6a0" },
  { name: "생크림", color: "#fffaf0" },
];
/** The paper cups come in four pastels of the parlour (no two neighbours alike along a row). */
const CUPS = ["#bfe8da", "#fbeaa0", "#cfe3f7", "#fff6e2"];
/** A fixed sequence of numbers in [0, 1), so that the parlour is painted the same every time. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const canvasOf = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
const FONT = '"Inter", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const textureOf = (c: HTMLCanvasElement, own: Own) => {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/**
 * A scoop of ice cream as a scoop leaves it: a ball whose surface is ridged where the scoop dragged round it, the
 * ridges running in a slant, with a ragged lip below where it overhangs the cup. `phase` varies the ridges.
 */
function scoopShape(phase: number) {
  const g = new T.SphereGeometry(SCOOP_RADIUS, 48, 32),
    p = g.attributes.position as T.BufferAttribute,
    v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const turn = Math.atan2(v.z, v.x),
      up = v.y / SCOOP_RADIUS,
      ridge = 0.05 * Math.max(0, Math.sin(7 * turn + 9 * up + phase)) ** 2 + 0.018 * Math.sin(13 * turn - 5 * up + phase * 2),
      lip = up < -0.15 ? 0.1 * (1 + 0.35 * Math.sin(11 * turn + phase)) * Math.min(1, (-0.15 - up) * 3) : 0;
    v.multiplyScalar(1 + ridge * Math.min(1, up + 1.1) + lip);
    // The underside sits flat in the cup.
    if (v.y < -SCOOP_RADIUS * 0.42) v.y = -SCOOP_RADIUS * 0.42;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
/** A flavour painted round its scoop: the colour, a little lighter on the ridges, and its chips or ripple. */
function flavourTexture(flavour: Flavour, seed: number, own: Own) {
  const { c, ctx } = canvasOf(256, 128),
    rand = sequence(seed),
    base = new T.Color(flavour.color);
  ctx.fillStyle = flavour.color;
  ctx.fillRect(0, 0, 256, 128);
  // Soft mottling, as cream that has been worked.
  for (let k = 0; k < 90; k++) {
    const light = rand() < 0.5,
      shade = base.clone().lerp(new T.Color(light ? "#ffffff" : "#000000"), light ? 0.16 : 0.07);
    ctx.fillStyle = `#${shade.getHexString()}`;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 128, 6 + rand() * 18, 3 + rand() * 6, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (flavour.ripple) {
    ctx.strokeStyle = flavour.ripple;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      const y0 = 18 + k * 28 + rand() * 10;
      ctx.moveTo(0, y0);
      for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 22 + k) * 8);
      ctx.stroke();
    }
  }
  if (flavour.bits)
    for (let k = 0; k < 70; k++) {
      ctx.fillStyle = flavour.bits;
      const x = rand() * 256,
        y = 10 + rand() * 108,
        r = 1.6 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      for (let a = 1; a <= 5; a++) ctx.lineTo(x + Math.cos(a * 1.26) * r * (0.6 + rand() * 0.6), y + Math.sin(a * 1.26) * r * (0.6 + rand() * 0.6));
      ctx.fill();
    }
  return textureOf(c, own);
}
/** A cup's paper: pleated in its pastel, with a white band round the middle. */
function cupTexture(color: string, own: Own) {
  const { c, ctx } = canvasOf(256, 64);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 8) {
    ctx.fillStyle = x % 16 ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(x, 0, 4, 64);
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(0, 26, 256, 10);
  return textureOf(c, own);
}
/** The card on a cup's front with its number, as flavours are labelled in a dipping cabinet; 31's is gold with a star. */
function cardTexture(n: number, own: Own) {
  const { c, ctx } = canvasOf(160, 104),
    last = n === ICE.total;
  ctx.fillStyle = last ? "#ffd75a" : "#fffdf6";
  ctx.beginPath();
  ctx.roundRect(3, 3, 154, 98, 18);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = last ? "#c98a12" : "#7fcfb5";
  ctx.stroke();
  ctx.fillStyle = last ? "#a3261c" : "#22312c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${last ? 70 : 78}px ${FONT}`;
  ctx.fillText(String(n), last ? 88 : 80, 57);
  if (last) {
    ctx.font = `900 30px ${FONT}`;
    ctx.fillText("★", 24, 30);
  }
  return textureOf(c, own);
}

/**
 * 아이스크림 31 at the counter of an ice-cream parlour of our own (pastel mint, cream and lemon; the chain the game is
 * named after lent nothing: no colours, dots, logo or numerals of its). Thirty-one scoops of as many flavours stand
 * in paper cups in four rows, each with a card that carries its number, read left to right from the back row; 31 has
 * a cherry on top and a gold card. A take sends the next scoops hopping into the taker's bowl (mine in front, the
 * other side's behind), where they heap up; their cups stay with their cards, tinted in the taker's colour. Behind
 * the counter a glass dipping cabinet of tubs and a menu board with the parlour's sign and the rule.
 */
export class ParlourView extends TakeView {
  private scoops: T.Group[] = [];
  private flavours: T.MeshStandardMaterial[] = [];
  private cards: T.MeshStandardMaterial[] = [];
  private stickers: T.Mesh[] = [];
  private stickerPaint: T.Material[];
  private caster = new T.Raycaster();
  private pickable: T.Object3D[] = [];
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#f4ecdc");
    const keep: Own = (r) => this.own(r);
    this.daylight("#fffaf0", "#c9bca4", "#fff6e6", 8, 1.7);
    // A softer sky light than the other tables': the parlour is all pale things, and they washed out.
    this.scene.traverse((thing) => {
      if (thing instanceof T.HemisphereLight) thing.intensity = 1.55;
    });
    this.counter(keep);
    this.backdrop(keep);
    this.stickerPaint = ICE_COLORS.map((color) => this.standard({ color, roughness: 0.5 }));
    const shapes = [0, 1.7, 3.3].map((phase) => keep(scoopShape(phase))),
      cup = keep(
        new T.LatheGeometry(
          [
            [0, 0.004],
            [CUP.bottom - 0.01, 0],
            [CUP.bottom, 0.012],
            [CUP.top, CUP.height],
            [CUP.top + 0.018, CUP.height + 0.008],
          ].map(([r, y]) => new T.Vector2(r, y)),
          40,
        ),
      ),
      rim = keep(new T.TorusGeometry(CUP.top + 0.012, 0.016, 8, 40).rotateX(Math.PI / 2)),
      card = keep(new T.PlaneGeometry(0.44, 0.31)),
      sticker = keep(new T.CircleGeometry(0.07, 24)),
      cupPaints = CUPS.map((color) => this.standard({ map: cupTexture(color, keep), roughness: 0.85, side: T.DoubleSide })),
      rimPaint = this.standard({ color: "#ffffff", roughness: 0.7 });
    for (let n = 1; n <= ICE.total; n++) {
      const at = cupAt(n),
        flavour = FLAVOURS[n - 1],
        paint = this.standard({ map: flavourTexture(flavour, n * 37, keep), roughness: 0.62 }),
        place = new T.Group();
      place.position.set(at.x, 0, at.z);
      this.scene.add(place);
      const paper = new T.Mesh(cup, cupPaints[(n + Math.floor((n - 1) / COLS)) % CUPS.length]);
      paper.castShadow = paper.receiveShadow = true;
      const lip = new T.Mesh(rim, rimPaint);
      lip.position.y = CUP.height + 0.006;
      // The card leans back a little against the cup's front, so that it faces the eye over the counter.
      const label = this.standard({ map: cardTexture(n, keep), roughness: 0.6 }),
        front = new T.Mesh(card, label);
      front.position.set(0, 0.17, CUP.top * 0.84 + 0.05);
      front.rotation.x = -0.32;
      const dot = new T.Mesh(sticker, this.stickerPaint[0]);
      dot.position.set(0.16, 0.27, CUP.top * 0.84 + 0.09);
      dot.rotation.x = -0.32;
      dot.visible = false;
      place.add(paper, lip, front, dot);
      for (const thing of [paper, lip, front]) thing.userData.scoop = n;
      this.cards.push(label);
      this.stickers.push(dot);
      // The scoop itself, which leaves its cup when it is eaten.
      const scoop = new T.Group(),
        ball = new T.Mesh(shapes[n % shapes.length], paint);
      ball.rotation.y = n * 2.4;
      ball.castShadow = ball.receiveShadow = true;
      ball.userData.scoop = n;
      scoop.add(ball);
      if (n === ICE.total) this.cherry(scoop, keep);
      this.scene.add(scoop);
      this.scoops.push(scoop);
      this.flavours.push(paint);
      this.pickable.push(paper, lip, front, ball);
    }
    this.begin();
  }
  /** The cherry on top of the last scoop, on its stalk. */
  private cherry(scoop: T.Group, keep: Own) {
    const top = SCOOP_RADIUS * 1.02,
      fruit = new T.Mesh(keep(new T.SphereGeometry(0.085, 24, 16).scale(1, 0.92, 1)), keep(glossy({ color: "#c8142a", roughness: 0.25 }, 0.8)));
    fruit.position.y = top + 0.06;
    fruit.castShadow = true;
    fruit.userData.scoop = ICE.total;
    const stalk = new T.Mesh(
      keep(new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(0, 0.07, 0), new T.Vector3(0.02, 0.17, 0), new T.Vector3(0.09, 0.22, 0.02)), 12, 0.011, 6)),
      this.standard({ color: "#5d3a1c", roughness: 0.6 }),
    );
    stalk.position.y = top + 0.06;
    scoop.add(fruit, stalk);
  }
  /** The counter: pale stone with a mint edge, two bowls, cones in a stand, spoons in a jar and the card with the rule. */
  private counter(keep: Own) {
    const top = this.add(block(14, 0.3, 9.6, 0.06), this.standard({ ...stuff("stone", "#e9dfcc", 2.5, keep), roughness: 0.42 }), 0, -0.15, 0.2);
    top.castShadow = false;
    const mint = this.standard({ color: "#9fdcc6", roughness: 0.45 });
    this.add(block(14.1, 0.1, 0.16, 0.04), mint, 0, -0.05, 5.04).castShadow = false;
    // The bowls, glazed in the sides' colours with a cream inside.
    for (const side of [0, 1] as const) {
      const at = bowlAt(side),
        glaze = keep(glossy({ color: ICE_COLORS[side], roughness: 0.3, side: T.DoubleSide }, 0.6)),
        r = BOWL.radius;
      const bowl = this.add(
        new T.LatheGeometry(
          [
            [0, 0],
            [0.36, 0],
            [0.38, 0.03],
            [0.3, 0.08],
            [0.33, 0.12],
            [0.62, 0.2],
            [0.86, 0.34],
            [r, BOWL.height],
            [r - 0.04, BOWL.height + 0.02],
            [r - 0.08, BOWL.height - 0.02],
            [0.78, 0.36],
            [0.52, 0.24],
            [0.26, 0.18],
            [0, 0.17],
          ].map(([x, y]) => new T.Vector2(x, y)),
          48,
        ),
        glaze,
        at.x,
        0,
        at.z,
      );
      bowl.receiveShadow = true;
      // A long spoon in each bowl.
      const spoon = this.add(block(0.08, 0.02, 1.0, 0.01), this.standard({ color: "#fdfaf2", roughness: 0.4 }), at.x + 0.75, 0.62, at.z + (side ? -0.2 : 0.2));
      spoon.rotation.set(0.5, 0.6, 0);
    }
    // The card with the rule in the place after 31.
    const { c, ctx } = canvasOf(320, 200);
    ctx.fillStyle = "#fffdf6";
    ctx.beginPath();
    ctx.roundRect(4, 4, 312, 192, 22);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#7fcfb5";
    ctx.stroke();
    ctx.fillStyle = "#24332e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 46px ${FONT}`;
    ctx.fillText(`1~${ICE.most}개씩`, 160, 70);
    ctx.font = `700 34px ${FONT}`;
    ctx.fillStyle = "#b02a1f";
    ctx.fillText("31을 먹으면 짐", 160, 138);
    const sign = this.standard({ map: textureOf(c, keep), roughness: 0.7 }),
      back = this.standard({ color: "#fffdf6", roughness: 0.7 }),
      at = cupAt(ICE.total + 1),
      tent = new T.Group();
    tent.position.set(at.x, 0, at.z + 0.05);
    const face = new T.PlaneGeometry(0.74, 0.46);
    const front = this.add(face, sign, 0, 0.21, 0.1, tent);
    front.rotation.x = -0.42;
    const rear = this.add(face.clone(), back, 0, 0.21, -0.1, tent);
    rear.rotation.x = 0.42;
    rear.rotation.y = Math.PI;
    this.scene.add(tent);
    // Waffle cones standing in a stand at the right, and pastel spoons in a jar at the left, clear of the scoops.
    const waffle = canvasOf(128, 128);
    waffle.ctx.fillStyle = "#e0a85a";
    waffle.ctx.fillRect(0, 0, 128, 128);
    waffle.ctx.strokeStyle = "#b27532";
    waffle.ctx.lineWidth = 5;
    for (let k = -128; k < 256; k += 22) {
      waffle.ctx.beginPath();
      waffle.ctx.moveTo(k, 0);
      waffle.ctx.lineTo(k + 128, 128);
      waffle.ctx.moveTo(k + 128, 0);
      waffle.ctx.lineTo(k, 128);
      waffle.ctx.stroke();
    }
    const coneMap = textureOf(waffle.c, keep);
    coneMap.wrapS = coneMap.wrapT = T.RepeatWrapping;
    coneMap.repeat.set(3, 2);
    const cone = this.standard({ map: coneMap, roughness: 0.8 }),
      stand = this.standard({ color: "#fff6e2", roughness: 0.5 });
    this.add(block(0.5, 0.16, 1.5, 0.05), stand, 4.85, 0.08, -0.2);
    for (let k = 0; k < 3; k++) {
      const c3 = this.add(new T.ConeGeometry(0.17, 0.62, 24, 1, true).rotateX(Math.PI), cone, 4.85, 0.42, -0.65 + k * 0.45);
      (c3.material as T.MeshStandardMaterial).side = T.DoubleSide;
    }
    const jar = keep(new T.MeshStandardMaterial({ color: "#e8f6f2", roughness: 0.08, transparent: true, opacity: 0.35 }));
    this.add(new T.CylinderGeometry(0.26, 0.24, 0.56, 28, 1, true), jar, 4.85, 0.28, 1.3).castShadow = false;
    ["#9fdcc6", "#fbe08a", "#bcd8f2", "#9fdcc6", "#fbe08a"].forEach((color, i) => {
      const spoon = this.add(block(0.06, 0.76, 0.02, 0.01), this.standard({ color, roughness: 0.45 }), 4.85 + (i - 2) * 0.06, 0.56, 1.3 + ((i * 7) % 3) * 0.05 - 0.05);
      spoon.rotation.z = (i - 2) * 0.12;
    });
    // The parlour's own standing sign at the left of the counter: ICE CREAM over 아이스크림, a cone between.
    const board = canvasOf(320, 448),
      b = board.ctx;
    b.fillStyle = "#3f8a73";
    b.beginPath();
    b.roundRect(0, 0, 320, 448, 34);
    b.fill();
    b.lineWidth = 12;
    b.strokeStyle = "#fff4dc";
    b.stroke();
    b.textAlign = "center";
    b.textBaseline = "middle";
    b.fillStyle = "#fff4dc";
    b.font = `900 62px ${FONT}`;
    b.fillText("ICE", 160, 70);
    b.fillText("CREAM", 160, 132);
    b.fillStyle = "#f2c372";
    b.beginPath();
    b.moveTo(118, 236);
    b.lineTo(202, 236);
    b.lineTo(160, 340);
    b.closePath();
    b.fill();
    b.fillStyle = "#bdf0dc";
    b.beginPath();
    b.arc(160, 222, 48, Math.PI, 0);
    b.quadraticCurveTo(160, 252, 112, 222);
    b.fill();
    b.fillStyle = "#fbe08a";
    b.font = `800 46px ${FONT}`;
    b.fillText("아이스크림", 160, 394);
    const easel = new T.Group();
    easel.position.set(-4.9, 0, -1.0);
    easel.rotation.y = 0.25;
    const panel = this.add(block(1.06, 1.46, 0.06, 0.03), [mint, mint, mint, mint, this.standard({ map: textureOf(board.c, keep), roughness: 0.7 }), mint], 0, 0.78, 0, easel);
    panel.rotation.x = -0.18;
    const leg = this.add(block(0.06, 1.4, 0.06, 0.02), mint, 0, 0.7, -0.38, easel);
    leg.rotation.x = 0.3;
    this.scene.add(easel);
  }
  /** Behind the counter: the glass dipping cabinet with its tubs, a wall of cream and mint, bunting and the menu board. */
  private backdrop(keep: Own) {
    const z = -6.0,
      body = this.standard({ color: "#fff8ea", roughness: 0.5 }),
      mint = this.standard({ color: "#9fdcc6", roughness: 0.5 });
    this.add(block(12.6, 1.4, 1.7, 0.06), body, 0, -0.75, z);
    this.add(block(12.7, 0.3, 0.1, 0.03), mint, 0, -0.6, z + 0.86);
    const tub = keep(new T.CylinderGeometry(0.42, 0.38, 0.3, 28)),
      cream = keep(scoopShape(0.6).scale(1.35, 0.42, 1.35));
    for (let k = 0; k < 12; k++) {
      const x = -5.25 + (k % 6) * 2.1 + (k >= 6 ? 0 : 0.0),
        zz = z + (k >= 6 ? 0.42 : -0.42),
        flavour = FLAVOURS[(k * 5 + 2) % FLAVOURS.length];
      this.add(tub, body, x, -0.06, zz).castShadow = false;
      this.add(cream, this.standard({ color: flavour.color, roughness: 0.6 }), x, 0.1, zz).castShadow = false;
    }
    const glass = keep(new T.MeshStandardMaterial({ color: "#eafaf6", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }));
    const pane = this.add(new T.PlaneGeometry(12.4, 1.2), glass, 0, 0.42, z + 0.6);
    pane.rotation.x = -0.7;
    pane.castShadow = false;
    // The wall: cream above, mint below, a skirting of lemon.
    const wall = this.add(new T.PlaneGeometry(40, 16), this.standard({ color: "#fbf3e1", roughness: 0.95 }), 0, 6, -7.4);
    wall.castShadow = false;
    this.add(new T.PlaneGeometry(40, 1.6), this.standard({ color: "#b9e6d6", roughness: 0.9 }), 0, -0.2, -7.38).castShadow = false;
    this.add(new T.PlaneGeometry(40, 0.12), this.standard({ color: "#f6dc7c", roughness: 0.8 }), 0, 0.64, -7.36).castShadow = false;
    // Bunting along the top of the wall.
    const flag = keep(new T.BufferGeometry().setFromPoints([new T.Vector3(-0.22, 0, 0), new T.Vector3(0.22, 0, 0), new T.Vector3(0, -0.42, 0)]));
    flag.computeVertexNormals();
    const pennants = ["#9fdcc6", "#fbe08a", "#fff6e2", "#bcd8f2"].map((color) => this.standard({ color, roughness: 0.8, side: T.DoubleSide }));
    for (let k = 0; k < 26; k++) {
      const x = -13 + k * 1.04,
        sag = 0.25 * Math.cos(((k % 9) / 8) * Math.PI * 2);
      const m = new T.Mesh(flag, pennants[k % pennants.length]);
      m.position.set(x, 5.2 - sag * 0.4, -7.3);
      this.scene.add(m);
    }
    // The menu board: the parlour's own sign over a cone, and the rule of the game.
    const { c, ctx } = canvasOf(1024, 512);
    ctx.fillStyle = "#3f7f6c";
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 40);
    ctx.fill();
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#fff4dc";
    ctx.stroke();
    ctx.fillStyle = "#fff4dc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 120px ${FONT}`;
    ctx.fillText("ICE CREAM", 600, 150);
    ctx.font = `700 64px ${FONT}`;
    ctx.fillStyle = "#fbe08a";
    ctx.fillText("아이스크림 가게", 600, 262);
    ctx.font = `600 44px ${FONT}`;
    ctx.fillStyle = "#e8fbf4";
    ctx.fillText("컵 · 콘 · 한 스쿱씩 골라 담아요", 600, 372);
    // A cone with a scoop of mint, drawn in the board's colours.
    ctx.fillStyle = "#f2c372";
    ctx.beginPath();
    ctx.moveTo(110, 250);
    ctx.lineTo(230, 250);
    ctx.lineTo(170, 450);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c98f3e";
    ctx.lineWidth = 6;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(122 + k * 30, 250);
      ctx.lineTo(170 + k * 8, 440);
      ctx.stroke();
    }
    ctx.fillStyle = "#bdf0dc";
    ctx.beginPath();
    ctx.arc(170, 205, 78, Math.PI, 0);
    ctx.lineTo(248, 252);
    ctx.quadraticCurveTo(170, 280, 92, 252);
    ctx.closePath();
    ctx.fill();
    const menu = this.standard({ map: textureOf(c, keep), roughness: 0.8 });
    this.add(block(7.4, 3.7, 0.12, 0.08), this.standard({ color: "#fff4dc", roughness: 0.6 }), 0, 3.0, -7.3);
    this.add(new T.PlaneGeometry(7.2, 3.6), menu, 0, 3.0, -7.23).castShadow = false;
  }
  protected subject(aspect: number): TableSubject {
    return iceSubject(aspect);
  }
  /** A press strikes a scoop, its cup or its card: its place from the next scoop to be eaten. */
  protected placeUnder(ray: T.Ray) {
    const state = this.state!,
      eaten = state.takers.length;
    this.scene.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const hit = this.caster.intersectObjects(this.pickable, false).find((h) => (h.object.userData.scoop as number) > eaten);
    return hit ? (hit.object.userData.scoop as number) - 1 - eaten : -1;
  }
  protected raise(count: number) {
    const state = this.state!,
      eaten = state.takers.length;
    for (let n = eaten + 1; n <= ICE.total; n++) {
      const up = n <= eaten + count,
        at = cupAt(n);
      this.scoops[n - 1].position.set(at.x, SCOOP_Y + (up ? 0.1 : 0), at.z);
      this.flavours[n - 1].emissive.set(up ? "#ffcf6a" : "#000000");
      this.flavours[n - 1].emissiveIntensity = up ? 0.3 : 0;
    }
  }
  protected refuse(count: number) {
    const eaten = this.state!.takers.length;
    this.shake(this.scoops.slice(eaten, Math.min(ICE.total, eaten + count)));
  }
  /** Where a scoop eaten as `side`'s `k`-th lies in that side's bowl. */
  private heaped(side: 0 | 1, k: number) {
    const bowl = bowlAt(side),
      at = heapSpot(k);
    return { x: bowl.x + at.x, y: 0.17 + at.y, z: bowl.z + at.z };
  }
  protected place(state: State) {
    this.calm();
    const counts = [0, 0];
    for (let n = 1; n <= ICE.total; n++) {
      const scoop = this.scoops[n - 1],
        side = state.takers[n - 1],
        card = this.cards[n - 1],
        dot = this.stickers[n - 1];
      this.flavours[n - 1].emissive.set("#000000");
      if (side === undefined) {
        const at = cupAt(n);
        scoop.position.set(at.x, SCOOP_Y, at.z);
        scoop.rotation.set(0, 0, 0);
        scoop.scale.setScalar(1);
        card.color.set("#ffffff");
        dot.visible = false;
        continue;
      }
      const at = this.heaped(side, counts[side]++);
      scoop.position.set(at.x, at.y, at.z);
      scoop.rotation.set(0, n * 0.9, 0);
      scoop.scale.setScalar(HEAP_SCALE);
      // The empty cup's card keeps its number, greyed a little, with a sticker in the eater's colour.
      card.color.set("#d9d4c8");
      dot.material = this.stickerPaint[side];
      dot.visible = true;
    }
    const canvas = this.renderer.domElement;
    canvas.dataset.left = String(left(state));
    canvas.dataset.total = String(state.total);
    canvas.dataset.mode = "ice";
    this.lifted();
  }
  protected animate(before: State, state: State) {
    this.calm();
    const t = state.takers.length - before.takers.length;
    if (t <= 0 || !state.last) return false;
    const side = state.last.side,
      already = takenBy(before, side),
      first = before.takers.length + 1,
      STAGGER = 240,
      FLY = 620;
    const hops = Array.from({ length: t }, (_, i) => {
      const n = first + i,
        cup = cupAt(n);
      return { scoop: this.scoops[n - 1], from: { x: cup.x, y: SCOOP_Y, z: cup.z }, to: this.heaped(side, already + i), landed: false, delay: i * STAGGER };
    });
    const whole = (t - 1) * STAGGER + FLY,
      // A scoop from the back row going to my bowl in front flies higher over the rows between.
      lift = 0.9 + ROW_STEP * 0.3;
    this.tween(0, whole, (p) => {
      const ms = p * whole;
      for (const hop1 of hops) {
        const q = Math.min(1, Math.max(0, (ms - hop1.delay) / FLY)),
          a = travel(q),
          { from, to, scoop } = hop1;
        scoop.position.set(from.x + (to.x - from.x) * a, from.y + (to.y - from.y) * a + hop(q) * lift, from.z + (to.z - from.z) * a);
        scoop.scale.setScalar(1 + (HEAP_SCALE - 1) * a);
        scoop.rotation.y = q * 1.2;
        if (!hop1.landed && q >= 0.84) {
          hop1.landed = true;
          this.onContact();
        }
      }
    });
    return true;
  }
}
