import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, capable, furry, glossy, hop, stuff, travel } from "../../engine/scene-utils";
import { Grove } from "../../engine/foliage";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { HOP_MS, RADIUS, TILE_TOP, hexAt, hexUnder, trapSubject } from "./layout";
import { CELLS, SIZE, colOf, isEdge, rowOf, type State } from "./rules";

export const TRAP_COLORS: [string, string] = ["#e58a3a", "#4f7f3a"];
/** How much larger than its model the cat is shown, so that it reads well among the hexes. */
const CAT_SCALE = 1.45;
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A sequence for scenery and for the little differences between bushes, the same every time. */
const sequence = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const merged = (pieces: T.BufferGeometry[]) => {
  const flat = pieces.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.getAttribute("uv")) g.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count * 2) | 0), 2));
    return g;
  });
  const out = mergeGeometries(flat)!;
  for (const p of pieces) p.dispose();
  return out;
};
const canvasOf = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
};
const textureOf = (c: HTMLCanvasElement) => {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/**
 * The ginger tabby's coat for a body whose poles lie along its spine: rings of darker stripes round it (rows of the
 * picture), strongest along the back (u ≈ 0.75) and fading into a cream belly (u ≈ 0.25).
 */
function tabbyCoat() {
  const { c, ctx } = canvasOf(512, 256),
    rand = sequence(4242);
  for (let x = 0; x < 512; x++) {
    const u = x / 512,
      back = (1 - Math.cos((u - 0.25) * Math.PI * 2)) / 2,
      cream = Math.max(0, 1 - back * 2.2);
    ctx.fillStyle = `rgb(${Math.round(222 + 26 * cream)}, ${Math.round(126 + 96 * cream)}, ${Math.round(58 + 128 * cream)})`;
    ctx.fillRect(x, 0, 1, 256);
  }
  // Stripes: wavy rows, broad over the back and thin toward the belly.
  for (let k = 0; k < 13; k++) {
    const y0 = 14 + k * 18 + (rand() - 0.5) * 6,
      w = 4 + rand() * 4;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const u = x / 512,
        back = (1 - Math.cos((u - 0.25) * Math.PI * 2)) / 2,
        y = y0 + Math.sin(x * 0.03 + k) * 3;
      if (back < 0.35) {
        ctx.moveTo(x, y);
        continue;
      }
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(150, 66, 18, 0.75)";
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  return textureOf(c);
}
/** The head's coat (poles up and down, the face toward u = 0.25): ginger, with the tabby's stripes on the brow. */
function tabbyHead() {
  const { c, ctx } = canvasOf(256, 128);
  ctx.fillStyle = "#e08a42";
  ctx.fillRect(0, 0, 256, 128);
  // Paler round the mouth and under the chin.
  const g = ctx.createRadialGradient(64, 92, 4, 64, 92, 46);
  g.addColorStop(0, "rgba(255, 238, 214, 1)");
  g.addColorStop(1, "rgba(255, 238, 214, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 40, 128, 88);
  ctx.strokeStyle = "rgba(146, 62, 16, 0.85)";
  ctx.lineCap = "round";
  for (const [x, w] of [
    [56, 5],
    [64, 6],
    [72, 5],
  ]) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 12);
    ctx.lineTo(x + (x - 64) * 0.2, 40);
    ctx.stroke();
  }
  // Stripes round the back of the head.
  for (let k = 0; k < 4; k++) {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(150 + k * 22, 14);
    ctx.quadraticCurveTo(160 + k * 22, 40, 150 + k * 22, 62);
    ctx.stroke();
  }
  return textureOf(c);
}
/** A speech bubble saying 냐옹. */
function bubbleTexture() {
  const { c, ctx } = canvasOf(256, 160);
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.strokeStyle = "rgba(70, 50, 40, 0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(10, 10, 236, 104, 46);
  ctx.moveTo(98, 112);
  ctx.lineTo(112, 150);
  ctx.lineTo(136, 112);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(10, 10, 236, 104, 46);
  ctx.stroke();
  ctx.fillStyle = "#5a3424";
  ctx.font = "bold 62px 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("냐옹…", 128, 64);
  return textureOf(c);
}
/** A round warm glow for the lamps along the fence. */
function glowTexture() {
  const { c, ctx } = canvasOf(64),
    g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255, 236, 190, 1)");
  g.addColorStop(0.3, "rgba(255, 200, 120, 0.55)");
  g.addColorStop(1, "rgba(255, 180, 90, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return textureOf(c);
}
/** One joint of the tail: rotated about its base, its own piece of the tail on it, the next joint at its end. */
interface Joint {
  pivot: T.Group;
  rest: T.Euler;
}
/** The cat, piece by piece, so that its parts can move on their own. */
interface Cat {
  root: T.Group;
  /** Everything but the legs: lowered and flattened when it crouches. */
  torso: T.Group;
  body: T.Mesh;
  head: T.Group;
  eyes: T.Group;
  ears: T.Group[];
  legs: T.Group[];
  tail: Joint[];
  bubble: T.Sprite;
}
/**
 * A garden at the end of a summer day: a bed of earth laid with hexagonal lawn tiles (the edge's paler, the way out),
 * a gravel path round it, flower beds, a picket fence with lamps lit along it, a bench, a tree, a bowl of milk and a
 * ball of wool. My blocks are terracotta pots of flowers that spring up where I set them; the field's own are round
 * box bushes. The cat is a ginger tabby modelled in code (a furry coat, green eyes, whiskers, a tail of joints) that
 * hops from hex to hex facing its way, looks about and sways its tail while it waits, crouches with its ears down and
 * says 냐옹 when it is trapped, and dashes off over the edge into the garden when it gets out.
 */
export class TrapCatView extends TableView<State> {
  private tiles: T.InstancedMesh;
  private tileColor: T.Color[] = [];
  private blocks = new Map<number, { object: T.Object3D; mine: boolean }>();
  private blockLayer = new T.Group();
  private paint: Record<string, T.Material> = {};
  private shapes: Record<string, T.BufferGeometry> = {};
  private cat: Cat;
  private hovered = -1;
  private cursorRing: T.Mesh;
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private hinted = -1;
  /** A press: the hex it began on and where. */
  private press: { cell: number; x: number; z: number } | null = null;
  private live: boolean;
  private clock = 0;
  /** Where the cat's head is turning to as it looks about, and when it picks somewhere new. */
  private gaze = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0, next: 0 };
  private blink = 0;
  private lookRand = sequence(77);
  private lamps: T.Sprite[] = [];
  private caster = new T.Raycaster();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#8fa874");
    this.live = capable() && !this.reducedMotion;
    const keep: Own = (r) => this.own(r);
    this.scene.background = new T.Color("#a9b98a");
    // Late afternoon: a low warm sun from the far left, a sky of soft blue over warm ground.
    this.scene.add(new T.HemisphereLight("#d6e2ff", "#7a6a4a", 1.6));
    const sun = new T.DirectionalLight("#ffd9a8", 2.4);
    sun.position.set(-7, 9, -4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -10;
    sun.shadow.camera.right = sun.shadow.camera.top = 10;
    sun.shadow.camera.far = 40;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    const fill = new T.DirectionalLight("#fff4e6", 0.55);
    fill.position.set(3, 8, 9);
    this.scene.add(sun, fill);
    const p = <M extends T.Material>(name: string, material: M) => (this.paint[name] = keep(material));
    const g = (name: string, geometry: T.BufferGeometry) => (this.shapes[name] = keep(geometry));
    p("lawn", new T.MeshStandardMaterial({ ...stuff("grass", "#9cc46a", 0.35, keep), roughness: 1 }));
    p("tileSide", new T.MeshStandardMaterial({ ...stuff("earth", "#6e4c33", 0.5, keep), roughness: 1 }));
    p("bed", new T.MeshStandardMaterial({ ...stuff("earth", "#5e4130", 3, keep), roughness: 1 }));
    p("grass", new T.MeshStandardMaterial({ ...stuff("grass", "#86ad5c", 9, keep), roughness: 1 }));
    p("gravel", new T.MeshStandardMaterial({ ...stuff("gravel", "#c7b9a0", 6, keep, 1), roughness: 1 }));
    p("edging", new T.MeshStandardMaterial({ ...stuff("brick", "#9a5a3e", 6, keep, 0.3), roughness: 0.9 }));
    p("bush", new T.MeshStandardMaterial({ color: "#4c7f38", roughness: 0.85, flatShading: true }));
    p("bushDark", new T.MeshStandardMaterial({ color: "#3a6a2c", roughness: 0.9, flatShading: true }));
    p("bloomWhite", new T.MeshStandardMaterial({ color: "#fde7ef", roughness: 0.6 }));
    p("pot", glossy({ color: "#c4673e", roughness: 0.7 }, 0.3));
    p("soil", new T.MeshStandardMaterial({ color: "#3f2a1d", roughness: 1 }));
    p("leaf", new T.MeshStandardMaterial({ color: "#5f9a3e", roughness: 0.75, flatShading: true }));
    for (const [i, color] of ["#e2463a", "#ffc93c", "#f07fb0", "#9d6bd8"].entries()) p(`flower${i}`, new T.MeshStandardMaterial({ color, roughness: 0.6 }));
    p("heart", new T.MeshStandardMaterial({ color: "#ffe28a", roughness: 0.5 }));
    p("wood", new T.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 }));
    p("bench", new T.MeshStandardMaterial({ color: "#8a5a3a", roughness: 0.7 }));
    p("iron", new T.MeshStandardMaterial({ color: "#2f3236", roughness: 0.5, metalness: 0.6 }));
    p("bark", new T.MeshStandardMaterial({ color: "#6b4e38", roughness: 0.95 }));
    p("bowl", glossy({ color: "#5d8fd1", roughness: 0.3 }));
    p("milk", new T.MeshStandardMaterial({ color: "#fbfaf5", roughness: 0.25 }));
    p("wool", new T.MeshStandardMaterial({ color: "#d9566b", roughness: 0.9 }));
    p("lamp", new T.MeshBasicMaterial({ color: "#ffe7b0" }));

    // The tiles: a hexagonal prism each, lawn on top, earth at the sides.
    g("tile", new T.CylinderGeometry(RADIUS * 0.94, RADIUS * 0.97, 0.16, 6).translate(0, TILE_TOP - 0.08, 0));
    this.tiles = new T.InstancedMesh(this.shapes.tile, [this.paint.tileSide, this.paint.lawn, this.paint.tileSide], CELLS);
    this.tiles.receiveShadow = true;
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      tint = new T.Color();
    for (let i = 0; i < CELLS; i++) {
      const at = hexAt(i),
        rand = sequence(i * 7919 + 11);
      m.compose(new T.Vector3(at.x, 0, at.z), q.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.floor(rand() * 6) * (Math.PI / 3)), new T.Vector3(1, 1, 1));
      this.tiles.setMatrixAt(i, m);
      // The edge, the way out, is paler and warmer, like grass in the sun at the garden's rim.
      const edge = isEdge(i);
      tint.setHSL(edge ? 0.125 + rand() * 0.015 : 0.27 + rand() * 0.04, edge ? 0.62 : 0.3 + rand() * 0.12, edge ? 0.8 + rand() * 0.04 : 0.66 + rand() * 0.08);
      this.tileColor.push(tint.clone());
      this.tiles.setColorAt(i, tint);
    }
    this.scene.add(this.tiles, this.blockLayer);

    // A box bush: a heap of leafy balls; a few white flowers on it.
    const bushRand = sequence(31337),
      balls: T.BufferGeometry[] = [new T.IcosahedronGeometry(0.25, 1).scale(1, 0.85, 1).translate(0, 0.22, 0)];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + bushRand() * 0.4;
      balls.push(new T.IcosahedronGeometry(0.15 + bushRand() * 0.05, 1).translate(Math.cos(a) * 0.17, 0.13 + bushRand() * 0.12, Math.sin(a) * 0.17));
    }
    balls.push(new T.IcosahedronGeometry(0.16, 1).translate(0.02, 0.4, -0.02));
    g("bush", merged(balls));
    const blooms: T.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const a = bushRand() * Math.PI * 2,
        y = 0.14 + bushRand() * 0.3,
        r = Math.sqrt(Math.max(0, 0.1 - (y - 0.24) ** 2)) + 0.1;
      blooms.push(new T.SphereGeometry(0.04, 7, 5).scale(1, 0.6, 1).translate(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    g("blooms", merged(blooms));
    // A flower pot: a turned terracotta pot with a rim, earth in it, leaves and a cluster of flowers.
    const profile = [
      [0, 0],
      [0.15, 0],
      [0.165, 0.015],
      [0.2, 0.22],
      [0.235, 0.225],
      [0.24, 0.29],
      [0.225, 0.3],
      [0.21, 0.3],
      [0.205, 0.27],
      [0, 0.27],
    ].map(([x, y]) => new T.Vector2(x, y));
    g("pot", new T.LatheGeometry(profile, 28));
    g("potSoil", new T.CircleGeometry(0.206, 24).rotateX(-Math.PI / 2).translate(0, 0.275, 0));
    const leafRand = sequence(911),
      leaves: T.BufferGeometry[] = [],
      flowers: T.BufferGeometry[] = [],
      hearts: T.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      leaves.push(
        new T.SphereGeometry(0.09, 8, 6)
          .scale(0.55, 0.2, 1.3)
          .rotateX(-0.5)
          .translate(0, 0.02, 0.1)
          .rotateY(a)
          .translate(0, 0.3, 0),
      );
    }
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3,
        r = k === 4 ? 0 : 0.09,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        y = 0.42 + leafRand() * 0.06 + (k === 4 ? 0.04 : 0);
      for (let petal = 0; petal < 5; petal++) {
        const b = (petal / 5) * Math.PI * 2;
        flowers.push(new T.SphereGeometry(0.035, 7, 5).scale(1, 0.45, 1).translate(x + Math.cos(b) * 0.035, y, z + Math.sin(b) * 0.035));
      }
      hearts.push(new T.SphereGeometry(0.022, 7, 5).translate(x, y + 0.01, z));
      leaves.push(new T.CylinderGeometry(0.008, 0.01, y - 0.28, 4).translate(x * 0.5, 0.28 + (y - 0.28) / 2, z * 0.5));
    }
    g("leaves", merged(leaves));
    g("flowers", merged(flowers));
    g("hearts", merged(hearts));

    // Marks: the keyboard's place, and the hint's gold ring with a soft glow.
    this.cursorRing = ringMesh(keep, RADIUS * 0.72, RADIUS * 0.86, "#ffffff");
    this.hintRing = ringMesh(keep, RADIUS * 0.66, RADIUS * 0.86, "#ffb21f");
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(RADIUS * 0.66, 6)), keep(new T.MeshBasicMaterial({ color: "#ffd36a", transparent: true, opacity: 0.4, depthWrite: false })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    this.scene.add(this.cursorRing, this.hintRing, this.hintGlow);

    this.cat = this.buildCat(keep);
    this.scene.add(this.cat.root);
    this.garden(keep);
    this.begin();
    this.kick();
  }
  /** The ginger tabby: a body, a head with ears, eyes, a muzzle and whiskers, four legs and a tail of seven joints. */
  private buildCat(keep: Own): Cat {
    const coat = keep(furry({ map: keep(tabbyCoat()), roughness: 0.85 }, 0.45, 2, 1, keep, false)),
      face = keep(furry({ map: keep(tabbyHead()), roughness: 0.85 }, 0.45, 2, 1, keep, false)),
      ginger = keep(furry({ color: "#dc823d", roughness: 0.85 }, 0.45, 2, 2, keep)),
      stripe = keep(furry({ color: "#a9531f", roughness: 0.85 }, 0.45, 2, 2, keep)),
      cream = keep(furry({ color: "#fbeedd", roughness: 0.85 }, 0.4, 2, 2, keep)),
      pink = keep(new T.MeshStandardMaterial({ color: "#f2a3a6", roughness: 0.6 })),
      iris = keep(glossy({ color: "#8fd14f", roughness: 0.15, emissive: "#2f5a10", emissiveIntensity: 0.25 })),
      pupil = keep(glossy({ color: "#111111", roughness: 0.1 })),
      shape = (geometry: T.BufferGeometry) => keep(geometry),
      mesh = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) => {
        const out = new T.Mesh(geometry, material);
        out.position.set(x, y, z);
        out.castShadow = true;
        parent.add(out);
        return out;
      };
    const root = new T.Group(),
      torso = new T.Group();
    root.add(torso);
    // The body with its poles along the spine, so that the coat's rows ring it as a tabby's stripes do.
    const body = mesh(shape(new T.SphereGeometry(1, 28, 18).rotateX(Math.PI / 2)), coat, torso, 0, 0.3, -0.02);
    body.scale.set(0.165, 0.155, 0.3);
    mesh(shape(new T.SphereGeometry(1, 16, 12)), cream, torso, 0, 0.29, 0.19).scale.set(0.115, 0.13, 0.1);
    // Legs: capsules with white paws.
    const legShape = shape(new T.CapsuleGeometry(0.04, 0.14, 4, 10).translate(0, -0.11, 0)),
      paw = shape(new T.SphereGeometry(0.048, 10, 8).scale(1, 0.6, 1.25).translate(0, -0.2, 0.012)),
      legs: T.Group[] = [];
    for (const [x, z] of [
      [-0.085, 0.17],
      [0.085, 0.17],
      [-0.09, -0.17],
      [0.09, -0.17],
    ]) {
      const leg = new T.Group();
      leg.position.set(x, 0.22, z);
      mesh(legShape, ginger, leg);
      mesh(paw, cream, leg);
      root.add(leg);
      legs.push(leg);
    }
    // The head.
    const head = new T.Group();
    head.position.set(0, 0.45, 0.27);
    torso.add(head);
    mesh(shape(new T.SphereGeometry(1, 24, 16)), face, head).scale.set(0.15, 0.132, 0.138);
    const cheek = shape(new T.SphereGeometry(0.05, 12, 10));
    mesh(cheek, cream, head, -0.036, -0.045, 0.105).scale.set(1, 0.85, 0.9);
    mesh(cheek, cream, head, 0.036, -0.045, 0.105).scale.set(1, 0.85, 0.9);
    mesh(shape(new T.SphereGeometry(0.04, 10, 8)), cream, head, 0, -0.075, 0.09).scale.set(1, 0.7, 0.9);
    mesh(shape(new T.SphereGeometry(0.02, 10, 8).scale(1.2, 0.8, 0.8)), pink, head, 0, -0.022, 0.138);
    const eyes = new T.Group();
    head.add(eyes);
    const eyeball = shape(new T.SphereGeometry(0.03, 14, 10)),
      slit = shape(new T.SphereGeometry(0.03, 10, 8).scale(0.28, 0.9, 0.3));
    for (const s of [-1, 1]) {
      mesh(eyeball, iris, eyes, s * 0.058, 0.022, 0.104).scale.set(1, 1.05, 0.7);
      mesh(slit, pupil, eyes, s * 0.06, 0.022, 0.124);
    }
    // Ears: three-sided cones with a pink inside.
    const earShape = shape(new T.ConeGeometry(0.055, 0.11, 3).rotateY(Math.PI / 6).translate(0, 0.055, 0)),
      innerShape = shape(new T.ConeGeometry(0.033, 0.075, 3).rotateY(Math.PI / 6).translate(0, 0.04, 0.012)),
      ears: T.Group[] = [];
    for (const s of [-1, 1]) {
      const ear = new T.Group();
      ear.position.set(s * 0.075, 0.095, -0.01);
      ear.rotation.set(-0.15, 0, -s * 0.32);
      mesh(earShape, ginger, ear);
      mesh(innerShape, pink, ear);
      head.add(ear);
      ears.push(ear);
    }
    // Whiskers: three a side, fanning out from the muzzle.
    const whisker: number[] = [];
    for (const s of [-1, 1])
      for (const k of [-1, 0, 1]) whisker.push(s * 0.06, -0.04 + k * 0.012, 0.13, s * 0.21, -0.03 + k * 0.035, 0.1 + k * 0.01);
    const lines = new T.LineSegments(
      shape(new T.BufferGeometry().setAttribute("position", new T.Float32BufferAttribute(whisker, 3))),
      keep(new T.LineBasicMaterial({ color: "#fffdf8", transparent: true, opacity: 0.85 })),
    );
    head.add(lines);
    // The tail: seven joints rising and curling, ringed orange and darker orange.
    const tail: Joint[] = [];
    let parent: T.Object3D = torso;
    const piece = shape(new T.CapsuleGeometry(0.032, 0.05, 4, 8).translate(0, 0.04, 0));
    for (let k = 0; k < 7; k++) {
      const pivot = new T.Group();
      if (k === 0) pivot.position.set(0, 0.36, -0.29);
      else pivot.position.set(0, 0.075, 0);
      const rest = new T.Euler(k === 0 ? -1.15 : k < 3 ? 0.3 : 0.22, 0, 0);
      pivot.rotation.copy(rest);
      const seg = mesh(piece, k % 2 ? stripe : ginger, pivot);
      seg.scale.setScalar(1 - k * 0.06);
      parent.add(pivot);
      tail.push({ pivot, rest });
      parent = pivot;
    }
    const bubble = new T.Sprite(keep(new T.SpriteMaterial({ map: keep(bubbleTexture()), transparent: true, depthTest: false, depthWrite: false })));
    bubble.scale.set(0.8, 0.5, 1);
    bubble.position.set(0, 0.9, 0);
    bubble.renderOrder = 9;
    bubble.visible = false;
    root.add(bubble);
    return { root, torso, body, head, eyes, ears, legs, tail, bubble };
  }
  /** The garden round the field, laid by a fixed sequence; nothing tall stands on the near side or casts on the field. */
  private garden(keep: Own) {
    const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = false) => {
      const out = new T.Mesh(geometry, material);
      out.position.set(x, y, z);
      out.receiveShadow = true;
      out.castShadow = shadow;
      this.scene.add(out);
      return out;
    };
    const half = (SIZE * 1) / 2 + 0.45,
      halfZ = ((SIZE - 1) * Math.sqrt(3)) / 4 + RADIUS + 0.35;
    // The lawn all round, the gravel path, the bed of earth and its brick edging.
    add(keep(new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2)), this.paint.grass, 0, -0.07, 0);
    add(keep(new T.PlaneGeometry(half * 2 + 2.2, halfZ * 2 + 2.2).rotateX(-Math.PI / 2)), this.paint.gravel, 0, -0.055, 0);
    add(keep(block(half * 2, 0.1, halfZ * 2, 0.03)), this.paint.bed, 0, -0.05, 0);
    const kerb = keep(block(half * 2 + 0.3, 0.12, 0.15, 0.03)),
      side = keep(block(0.15, 0.12, halfZ * 2 + 0.3, 0.03));
    add(kerb, this.paint.edging, 0, -0.02, -halfZ - 0.075);
    add(kerb, this.paint.edging, 0, -0.02, halfZ + 0.075);
    add(side, this.paint.edging, -half - 0.075, -0.02, 0);
    add(side, this.paint.edging, half + 0.075, -0.02, 0);
    const rand = sequence(2024);
    // A white picket fence along the far side, with lamps on its posts.
    const fenceZ = -halfZ - 1.9,
      picket = keep(merged([block(0.11, 0.8, 0.04, 0.015).translate(0, 0.4, 0), new T.ConeGeometry(0.078, 0.1, 4).rotateY(Math.PI / 4).translate(0, 0.85, 0)])),
      rail = keep(block(20, 0.07, 0.04, 0.01)),
      post = keep(block(0.14, 1.05, 0.14, 0.02).translate(0, 0.52, 0)),
      bulb = keep(new T.SphereGeometry(0.06, 10, 8)),
      glow = keep(new T.SpriteMaterial({ map: keep(glowTexture()), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    const pickets = new T.InstancedMesh(picket, this.paint.wood, 80),
      mtx = new T.Matrix4();
    for (let k = 0; k < 80; k++) {
      mtx.makeTranslation(-10 + k * 0.25, -0.07, fenceZ);
      pickets.setMatrixAt(k, mtx);
    }
    pickets.receiveShadow = true;
    this.scene.add(pickets);
    add(rail, this.paint.wood, 0, 0.18, fenceZ - 0.03);
    add(rail, this.paint.wood, 0, 0.58, fenceZ - 0.03);
    for (let k = -4; k <= 4; k++) {
      add(post, this.paint.wood, k * 2.4, -0.07, fenceZ + 0.04);
      add(bulb, this.paint.lamp, k * 2.4, 1.08, fenceZ + 0.04);
      const halo = new T.Sprite(glow);
      halo.scale.setScalar(0.7);
      halo.position.set(k * 2.4, 1.08, fenceZ + 0.06);
      this.scene.add(halo);
      this.lamps.push(halo);
    }
    // Flower beds along the fence and at the sides.
    const flowerBall = keep(new T.SphereGeometry(0.07, 7, 5)),
      tuft = keep(new T.IcosahedronGeometry(0.18, 0)),
      colours = ["flower0", "flower1", "flower2", "flower3", "bloomWhite"];
    const bed = (x0: number, z0: number, w: number, d: number, count: number) => {
      for (let k = 0; k < count; k++) {
        const x = x0 + (rand() - 0.5) * w,
          z = z0 + (rand() - 0.5) * d;
        add(tuft, this.paint.bushDark, x, 0.02, z).scale.set(1, 0.6 + rand() * 0.4, 1);
        add(flowerBall, this.paint[colours[Math.floor(rand() * colours.length)]], x + (rand() - 0.5) * 0.1, 0.17 + rand() * 0.06, z + (rand() - 0.5) * 0.1);
      }
    };
    bed(0, fenceZ + 0.55, 18, 0.6, 46);
    bed(-half - 2.2, 0, 1.4, halfZ * 2, 30);
    bed(half + 2.2, -1.2, 1.4, halfZ * 1.4, 22);
    // A garden bench at the far left, a tree behind the fence at the right (neither casts on the field).
    const bench = new T.Group(),
      slat = keep(block(1.7, 0.05, 0.12, 0.015)),
      leg = keep(block(0.06, 0.42, 0.42, 0.015));
    for (let k = 0; k < 4; k++) {
      const s = new T.Mesh(slat, this.paint.bench);
      s.position.set(0, 0.42, -0.15 + k * 0.13);
      bench.add(s);
    }
    for (let k = 0; k < 2; k++) {
      const s = new T.Mesh(slat, this.paint.bench);
      s.position.set(0, 0.62 + k * 0.17, -0.27);
      s.rotation.x = -0.25;
      bench.add(s);
    }
    for (const x of [-0.75, 0.75]) {
      const l = new T.Mesh(leg, this.paint.iron);
      l.position.set(x, 0.21, 0);
      bench.add(l);
    }
    bench.position.set(-half - 1.6, -0.07, fenceZ + 1.0);
    bench.rotation.y = 0.45;
    this.scene.add(bench);
    const tree = new T.Group(),
      crowns = new Grove(tree, keep, { shadow: false, bright: 1.55, lift: 1.25 });
    tree.add(Object.assign(new T.Mesh(keep(new T.CylinderGeometry(0.16, 0.22, 2.2, 8).translate(0, 1.1, 0)), this.paint.bark), { castShadow: false }));
    for (const [x, y, z, r] of [
      [0, 2.5, 0, 1.1],
      [-0.6, 2.1, 0.2, 0.8],
      [0.7, 2.2, -0.1, 0.85],
      [0.1, 3.1, 0.1, 0.75],
    ])
      // A crown of painted leaves on cards round a dark core (`Grove`), casting no shadow on the field.
      crowns.crown("broad", [x, y, z], r * 1.02, "#5b8c45", x + z);
    crowns.build();
    tree.position.set(half + 1.4, -0.07, fenceZ - 1.2);
    this.scene.add(tree);
    // A bowl of milk and a ball of wool on the gravel at the near right.
    const bowl = new T.LatheGeometry(
      [
        [0, 0],
        [0.18, 0],
        [0.22, 0.1],
        [0.2, 0.11],
        [0.16, 0.03],
        [0, 0.03],
      ].map(([x, y]) => new T.Vector2(x, y)),
      24,
    );
    add(keep(bowl), this.paint.bowl, half + 0.85, -0.055, halfZ - 0.4, true);
    add(keep(new T.CircleGeometry(0.17, 20).rotateX(-Math.PI / 2)), this.paint.milk, half + 0.85, 0.03, halfZ - 0.4);
    const wool = add(keep(new T.SphereGeometry(0.16, 16, 12)), this.paint.wool, half + 0.95, 0.1, halfZ - 1.15, true);
    wool.rotation.z = 0.4;
    const thread = new T.TubeGeometry(
      new T.CatmullRomCurve3([new T.Vector3(half + 0.95, 0.1, halfZ - 1.0), new T.Vector3(half + 1.2, -0.03, halfZ - 0.7), new T.Vector3(half + 1.6, -0.03, halfZ - 0.9), new T.Vector3(half + 1.9, -0.03, halfZ - 0.5)]),
      24,
      0.012,
      5,
    );
    add(keep(thread), this.paint.wool, 0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const winding = new T.Mesh(keep(new T.TorusGeometry(0.158, 0.008, 4, 28)), this.paint.wool);
      winding.position.set(half + 0.95, 0.1, halfZ - 1.15);
      winding.rotation.set(rand() * 3, rand() * 3, 0);
      this.scene.add(winding);
    }
  }
  protected subject(aspect: number): TableSubject {
    return trapSubject(aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null) return [];
    return Array.from({ length: CELLS }, (_, i) => ({ ...hexAt(i), y: TILE_TOP, r: RADIUS * 0.98, point: i }));
  }
  /**
   * The hex a ray points at: the open hex under it on the lawn, where there is one (a pot or the cat standing in
   * front of it does not take the tap); otherwise what it strikes first, a block or the cat standing for its own hex.
   */
  protected pick(ray: T.Ray): number | null {
    const state = this.state;
    if (!state || state.winner !== null) return -1;
    const at = new T.Vector3(),
      ground = ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -TILE_TOP), at) ? hexUnder(at.x, at.z) : -1;
    if (ground >= 0 && !state.blocked[ground] && ground !== state.cat) return ground;
    this.caster.ray.copy(ray);
    for (const hit of this.caster.intersectObjects([this.blockLayer, this.cat.torso, ...this.cat.legs], true)) {
      if (hit.object.type === "LineSegments" || hit.object.type === "Sprite") continue;
      for (let o: T.Object3D | null = hit.object; o; o = o.parent) {
        if (o.userData.cell !== undefined) return o.userData.cell as number;
        if (o === this.cat.root) return state.cat;
      }
    }
    return ground;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    const old = this.hovered;
    this.hovered = point;
    if (old >= 0) this.lift(old, false);
    if (point >= 0 && this.state && !this.state.blocked[point] && point !== this.state.cat) this.lift(point, true);
    this.redraw();
  }
  /** Raises an open tile a little (and brightens it) under the mouse, or sets it back. */
  private lift(cell: number, up: boolean) {
    const at = hexAt(cell),
      m = new T.Matrix4(),
      q = new T.Quaternion(),
      s = new T.Vector3(),
      p = new T.Vector3();
    this.tiles.getMatrixAt(cell, m);
    m.decompose(p, q, s);
    m.compose(new T.Vector3(at.x, up ? 0.06 : 0, at.z), q, s);
    this.tiles.setMatrixAt(cell, m);
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.setColorAt(cell, up ? this.tileColor[cell].clone().lerp(new T.Color("#ffffff"), 0.25) : this.tileColor[cell]);
    this.tiles.instanceColor!.needsUpdate = true;
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here, so that a press on a bush or on the cat is a move too (and is refused with words).
    this.press = { cell: point, x: at.x, z: at.z };
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    if (!press || !at || !state || state.winner !== null || press.cell < 0) return;
    // A tap: let go where it was pressed (a finger that slides far away has changed its mind).
    if (Math.hypot(at.x - press.x, at.z - press.z) > RADIUS * 1.2) return;
    this.onMove({ from: -1, to: press.cell, extra: -1 });
    if (this.state === state && press.cell === state.cat) this.twitch();
  }
  /** The cat's ears flick when its own hex is pressed. */
  private twitch() {
    if (this.reducedMotion) return;
    this.tween(0, 320, (p) => {
      const k = Math.sin(p * Math.PI * 3) * 0.35 * (1 - p);
      this.cat.ears.forEach((ear, i) => (ear.rotation.x = -0.15 - k * (i ? 1 : -1)));
    });
  }
  /** A block for `cell`: a box bush of the field's own, or a pot of flowers of mine. */
  private blockFor(cell: number, mine: boolean, index: number) {
    const rand = sequence(cell * 104729 + 7),
      group = new T.Group(),
      at = hexAt(cell);
    const add = (geometry: T.BufferGeometry, material: T.Material) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    if (mine) {
      add(this.shapes.pot, this.paint.pot);
      add(this.shapes.potSoil, this.paint.soil);
      add(this.shapes.leaves, this.paint.leaf);
      add(this.shapes.flowers, this.paint[`flower${index % 4}`]);
      add(this.shapes.hearts, this.paint.heart);
      group.rotation.y = rand() * Math.PI * 2;
    } else {
      add(this.shapes.bush, rand() < 0.5 ? this.paint.bush : this.paint.bushDark);
      if (rand() < 0.45) add(this.shapes.blooms, this.paint.bloomWhite);
      group.rotation.y = rand() * Math.PI * 2;
      const s = 0.92 + rand() * 0.16;
      group.scale.set(s, 0.9 + rand() * 0.2, s);
    }
    group.position.set(at.x, TILE_TOP, at.z);
    group.userData.cell = cell;
    group.userData.scale = group.scale.clone();
    return group;
  }
  /** Sets the blocks to those of `state`: new ones are made, gone ones (undone) taken away. */
  private layBlocks(state: State) {
    const mineIndex = new Map(state.mine.map((cell, i) => [cell, i]));
    for (const [cell, entry] of this.blocks)
      if (!state.blocked[cell] || entry.mine !== mineIndex.has(cell)) {
        this.blockLayer.remove(entry.object);
        this.blocks.delete(cell);
      }
    for (let cell = 0; cell < CELLS; cell++) {
      if (!state.blocked[cell]) continue;
      const mine = mineIndex.has(cell);
      let entry = this.blocks.get(cell);
      if (!entry) {
        entry = { object: this.blockFor(cell, mine, mineIndex.get(cell) ?? 0), mine };
        this.blocks.set(cell, entry);
        this.blockLayer.add(entry.object);
      }
      entry.object.scale.copy(entry.object.userData.scale as T.Vector3);
      entry.object.visible = true;
    }
  }
  /** The cat standing (or crouching, trapped) on its hex, facing `facing`. */
  private pose(crouched: boolean) {
    const cat = this.cat;
    cat.torso.position.y = crouched ? -0.1 : 0;
    cat.torso.scale.set(crouched ? 1.08 : 1, crouched ? 0.92 : 1, 1);
    for (const leg of cat.legs) leg.scale.y = crouched ? 0.55 : 1;
    cat.ears.forEach((ear, i) => {
      const s = i ? 1 : -1;
      ear.rotation.set(crouched ? -0.9 : -0.15, 0, crouched ? -s * 1.05 : -s * 0.32);
    });
    cat.head.rotation.set(crouched ? 0.35 : 0, 0, 0);
    cat.head.position.set(0, crouched ? 0.39 : 0.45, crouched ? 0.3 : 0.27);
    cat.eyes.scale.y = crouched ? 0.45 : 1;
    // A trapped cat wraps its tail round itself, low; a standing one carries it up in a curve.
    cat.tail.forEach((joint, k) => {
      if (crouched) joint.pivot.rotation.set(k === 0 ? -1.75 : 0.05, k === 0 ? 0 : 0.42, 0);
      else joint.pivot.rotation.copy(joint.rest);
    });
    cat.bubble.visible = crouched;
    cat.bubble.material.opacity = 1;
  }
  /** Which way to face to go from one place to another. */
  private static heading(from: { x: number; z: number }, to: { x: number; z: number }) {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }
  protected place(state: State) {
    this.layBlocks(state);
    // A tile raised under the mouse goes back down once something stands on it.
    if (this.hovered >= 0 && (state.blocked[this.hovered] || state.cat === this.hovered)) this.lift(this.hovered, false);
    const at = hexAt(state.cat),
      cat = this.cat;
    cat.root.position.set(at.x, TILE_TOP, at.z);
    cat.root.scale.setScalar(CAT_SCALE);
    if (state.last && state.last.from !== state.last.to) cat.root.rotation.y = TrapCatView.heading(hexAt(state.last.from), at);
    else if (!state.last) cat.root.rotation.y = 0;
    // Out over the edge: gone into the garden.
    cat.root.visible = !(state.last?.escaped && state.winner === 1);
    this.pose(state.winner === 0);
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.given !== state.given) return false;
    const cat = this.cat,
      block = this.blocks.get(last.block);
    this.layBlocks(state);
    const made = this.blocks.get(last.block) ?? block;
    // The pot springs up out of the lawn, overshooting a little.
    if (made) {
      const full = made.object.userData.scale as T.Vector3;
      made.object.scale.set(full.x * 0.01, full.y * 0.01, full.z * 0.01);
      this.tween(0, 300, (p) => {
        const c1 = 2.2,
          e = p === 1 ? 1 : 1 + (c1 + 1) * (p - 1) ** 3 + c1 * (p - 1) ** 2;
        made.object.scale.set(full.x * Math.max(0.01, e), full.y * Math.max(0.01, e), full.z * Math.max(0.01, e));
      });
      this.onContact();
    }
    const from = hexAt(last.from),
      to = hexAt(last.to),
      start = 200;
    if (last.trapped) {
      // Nowhere to go: it looks about, then crouches with its ears down and says 냐옹.
      this.tween(start, 520, (p) => {
        const k = Math.min(1, p * 1.4),
          e = 1 - (1 - k) ** 3;
        cat.torso.position.y = -0.1 * e;
        for (const leg of cat.legs) leg.scale.y = 1 - 0.45 * e;
        cat.head.rotation.y = Math.sin(p * Math.PI * 2) * 0.5 * (1 - p);
        cat.ears.forEach((ear, i) => {
          const s = i ? 1 : -1;
          ear.rotation.set(-0.15 - 0.75 * e, 0, -s * (0.32 + 0.73 * e));
        });
        if (p === 1) this.pose(true);
      });
      this.tween(start + 420, 380, (p) => {
        cat.bubble.visible = true;
        cat.bubble.material.opacity = Math.min(1, p * 2);
        cat.bubble.scale.set(0.8 * (0.6 + 0.4 * p), 0.5 * (0.6 + 0.4 * p), 1);
      });
      return true;
    }
    const face0 = cat.root.rotation.y;
    let face1 = TrapCatView.heading(from, to);
    while (face1 - face0 > Math.PI) face1 -= Math.PI * 2;
    while (face1 - face0 < -Math.PI) face1 += Math.PI * 2;
    // A turn toward the way, then a hop over to the next hex.
    this.tween(start - 60, 140, (p) => (cat.root.rotation.y = face0 + (face1 - face0) * (1 - (1 - p) ** 2)));
    this.tween(start + 60, HOP_MS, (p) => {
      const t = travel(p);
      cat.root.position.set(from.x + (to.x - from.x) * t, TILE_TOP + hop(p) * 0.28, from.z + (to.z - from.z) * t);
      // Legs tucked in the air, the body stretched.
      const air = Math.sin(Math.min(1, p / 0.84) * Math.PI);
      cat.legs.forEach((leg, i) => (leg.rotation.x = (i < 2 ? -0.7 : 0.7) * air));
      cat.torso.rotation.x = -0.15 * air;
      if (p === 1) {
        cat.legs.forEach((leg) => (leg.rotation.x = 0));
        cat.torso.rotation.x = 0;
      }
    });
    if (last.escaped) {
      // Out: it runs on over the edge and away into the garden.
      const r = rowOf(last.to),
        c = colOf(last.to),
        outward = new T.Vector2(c === 0 ? -1 : c === SIZE - 1 ? 1 : 0, r === 0 ? -1 : r === SIZE - 1 ? 1 : 0),
        way = new T.Vector2(to.x - from.x, to.z - from.z).normalize().add(outward.normalize()).normalize(),
        run = 5.5;
      const face2 = Math.atan2(way.x, way.y);
      this.tween(start + 60 + HOP_MS, 820, (p) => {
        const e = p * p * (1.6 - 0.6 * p),
          bound = Math.abs(Math.sin(p * Math.PI * 7));
        cat.root.rotation.y = face1 + (face2 - face1) * Math.min(1, p * 4);
        cat.root.position.set(to.x + way.x * run * e, TILE_TOP + bound * 0.12, to.z + way.y * run * e);
        cat.legs.forEach((leg, i) => (leg.rotation.x = (i < 2 ? -1 : 1) * Math.sin(p * Math.PI * 7) * 0.8));
        cat.tail[0].pivot.rotation.x = -1.4;
        if (p === 1) cat.root.visible = false;
      });
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const live = state.winner === null && !capturing(),
      hint = live && marks.hint ? marks.hint.to : -1,
      cursor = live ? (marks.cursor ?? -1) : -1;
    this.hinted = hint;
    this.hintRing.visible = this.hintGlow.visible = hint >= 0;
    if (hint >= 0) {
      const at = hexAt(hint);
      this.hintRing.position.set(at.x, TILE_TOP + 0.012, at.z);
      this.hintGlow.position.set(at.x, TILE_TOP + 0.008, at.z);
      this.hintGlow.rotation.z = Math.PI / 6 + Math.PI / 2;
    }
    this.cursorRing.visible = cursor >= 0;
    if (cursor >= 0) {
      const at = hexAt(cursor);
      this.cursorRing.position.set(at.x, TILE_TOP + (cursor === this.hovered ? 0.075 : 0.015), at.z);
    }
    // For browser tests: the cat's hex, the hint's hex (-1 for none), and where each hex lies on the canvas.
    const el = this.renderer.domElement;
    el.dataset.cat = String(state.cat);
    el.dataset.hint = String(hint);
    el.dataset.places = this.places();
    this.redraw();
  }
  /** Where the middle of every hex's top is on the canvas, in CSS pixels, as "x,y" joined by spaces. */
  private places() {
    const el = this.renderer.domElement,
      v = new T.Vector3(),
      out: string[] = [];
    this.camera.updateMatrixWorld();
    for (let i = 0; i < CELLS; i++) {
      const at = hexAt(i);
      v.set(at.x, TILE_TOP, at.z).project(this.camera);
      out.push(`${Math.round(((v.x + 1) / 2) * el.clientWidth)},${Math.round(((1 - v.y) / 2) * el.clientHeight)}`);
    }
    return out.join(" ");
  }
  /** The garden's own frame loop: what moves by itself while the cat waits. */
  private kick() {
    if (!this.clock && !this.disposed && this.live) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    this.idle(now / 1000);
    this.redraw();
    this.kick();
  };
  private idle(t: number) {
    const cat = this.cat,
      state = this.state,
      trapped = state?.winner === 0,
      busy = this.animating;
    // The tail sways in a slow wave along its joints (tucked and still twitching at the tip when trapped).
    cat.tail.forEach((joint, k) => {
      if (busy && k === 0) return;
      const wave = Math.sin(t * 1.7 - k * 0.55);
      if (trapped) joint.pivot.rotation.z = k > 4 ? wave * 0.25 : 0;
      else {
        joint.pivot.rotation.x = joint.rest.x + (k ? Math.sin(t * 0.9 - k * 0.4) * 0.05 : 0);
        joint.pivot.rotation.z = wave * (0.12 + k * 0.03);
      }
    });
    if (!busy) {
      // Breathing.
      const b = Math.sin(t * 2.4);
      cat.body.scale.set(0.165 * (1 + 0.012 * b), 0.155 * (1 + 0.02 * b), 0.3);
      // Looking about: a new place to look at every few seconds, turned to smoothly.
      const gaze = this.gaze;
      if (t > gaze.next) {
        gaze.toYaw = trapped ? (this.lookRand() - 0.5) * 0.4 : (this.lookRand() - 0.5) * 1.6;
        gaze.toPitch = trapped ? 0.35 : (this.lookRand() - 0.6) * 0.35;
        gaze.next = t + 1.2 + this.lookRand() * 2.4;
      }
      gaze.yaw += (gaze.toYaw - gaze.yaw) * 0.06;
      gaze.pitch += (gaze.toPitch - gaze.pitch) * 0.06;
      cat.head.rotation.y = gaze.yaw;
      cat.head.rotation.x = gaze.pitch;
      // A blink now and then (never in a picture taken for the collection).
      if (t > this.blink + 0.13) this.blink = t + 2.2 + this.lookRand() * 3;
      const shut = t > this.blink && !document.documentElement.dataset.capture;
      cat.eyes.scale.y = shut ? 0.1 : trapped ? 0.45 : 1;
      // An ear flicks now and then.
      if (!trapped) {
        const flick = Math.max(0, Math.sin(t * 0.7) - 0.96) * 12;
        cat.ears[0].rotation.x = -0.15 - flick * 0.3;
      }
    }
    if (trapped && cat.bubble.visible) cat.bubble.position.y = 0.9 + Math.sin(t * 2) * 0.025;
    // The hint glows; the lamps flicker a little.
    if (this.hinted >= 0) (this.hintGlow.material as T.MeshBasicMaterial).opacity = 0.28 + 0.2 * Math.sin(t * 4);
    this.lamps.forEach((lamp, k) => lamp.scale.setScalar(0.66 + 0.06 * Math.sin(t * 3 + k * 1.7)));
  }
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    super.dispose();
  }
}
