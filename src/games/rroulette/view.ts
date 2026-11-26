import * as T from "three";
import { block, capable, glossy, planks } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { CHAMBERS, PULL, SEATS, type State } from "./rules";
import { RR } from "./layout";

/** The sides' colours (my party hat and the first other's), for the panel. */
export const RR_COLORS: [string, string] = ["#e0453a", "#2f7fd8"];
/** Each seat's party hat and shirt, as the seat sits round the table seen from my device (0 is me). */
const HATS = ["#e0453a", "#2f7fd8", "#f2b81f", "#3fae5a"];
const SHIRTS = ["#ff8a6b", "#7fb8ff", "#ffd769", "#8fd99b"];
const SKINS = ["#f6cfae", "#e9b48e", "#f3d2b8", "#c98f6a"];
const HAIRS = ["#3a2618", "#7a4a22", "#1c1c22", "#d9a441"];
const PEOPLE = ["나", "왼쪽", "맞은편", "오른쪽"];
const CONFETTI = 180;
const FONT = '"Inter", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
type Own = <R extends { dispose(): void }>(resource: R) => R;
const smooth = (u: number) => u * u * (3 - 2 * u);

/** The way from the table's middle to a seat (seat 0 near me, 1 at my left, 2 across, 3 at my right). */
export function seatWay(seat: number) {
  return [
    { x: 0, z: 1 },
    { x: -1, z: 0 },
    { x: 0, z: -1 },
    { x: 1, z: 0 },
  ][seat];
}

interface Guest {
  root: T.Group;
  body: T.Group;
  head: T.Group;
  face: T.MeshStandardMaterial;
  skin: T.Color;
  hat: T.Group;
  spikes: T.Group;
  mouth: T.Mesh;
  gasp: T.Mesh;
  stars: T.Group;
  arms: { arm: T.Mesh; hand: T.Mesh; shoulder: T.Vector3 }[];
  tag: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; sprite: T.Sprite; said: string };
  chair: T.Group;
}
interface Toy {
  /** Where a holding hand closes on the grip. */
  grip: T.Object3D;
  pivot: T.Group;
  gun: T.Group;
  drum: T.Group;
  hammer: T.Group;
  trigger: T.Group;
  flag: T.Group;
  tip: T.Object3D;
}

/**
 * 러시안 룰렛's party: a round table with a chequered cloth in a room hung with bunting, balloons and fairy lights, a
 * cake and snacks round the edge, and up to four guests in party hats round it (me near, my left, across, my right; a
 * closed seat an empty chair). The toy is a bright plastic cap revolver (blue frame, yellow cylinder, red grip, the
 * orange tip toys carry), held up in front of whoever's turn it is, pointing up over the table, never at anyone. A pull
 * cocks the hammer and squeezes the trigger slowly while a heart beats; a click turns the cylinder a chamber on; a 펑
 * springs a "펑!" flag out of the barrel and bursts confetti over the one holding it, whose hair stands on end and
 * face goes sooty (comic, no harm), and who is out. Then the toy goes on to the next round the table.
 *
 * I may also press and hold the toy itself: the trigger comes back as I hold, and goes off when it is all the way in
 * (let go before, and nothing happens). In the middle of the table a card shows the chambers fired since the last
 * spin, so the chance of a 펑 can be read off it.
 */
export class RRouletteView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private guests: Guest[] = [];
  private toy: Toy;
  private confetti: T.InstancedMesh;
  private bits: { p: T.Vector3; v: T.Vector3; r: T.Euler; w: T.Vector3; rest: boolean }[] = [];
  private card: { ctx: CanvasRenderingContext2D; texture: T.CanvasTexture; said: string };
  private dummy = new T.Object3D();
  /** The trigger held in, 0 to 1, while I press the toy; the move it makes then needs no squeeze of its own. */
  private squeeze = 0;
  private holding = false;
  private heldPull = false;
  private holdFrame = 0;
  private heartAt = 0;
  private rich = capable();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#f6e3cf");
    const keep: Own = (r) => this.own(r);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -0.0);
    this.lights();
    this.room(keep);
    this.table(keep);
    for (let seat = 0; seat < SEATS; seat++) this.guests.push(this.guest(seat, keep));
    this.toy = this.makeToy(keep);
    const bit = keep(new T.PlaneGeometry(0.07, 0.11));
    this.confetti = new T.InstancedMesh(bit, keep(new T.MeshStandardMaterial({ side: T.DoubleSide, roughness: 0.6, metalness: 0.1 })), CONFETTI);
    const palette = ["#ff4f6d", "#ffd43b", "#3bc9db", "#69db7c", "#b197fc", "#ff922b", "#ffffff"];
    for (let i = 0; i < CONFETTI; i++) {
      this.confetti.setColorAt(i, new T.Color(palette[i % palette.length]));
      this.bits.push({ p: new T.Vector3(), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3(), rest: false });
    }
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
    const { c, ctx } = canvasOf(512, 512),
      texture = keep(new T.CanvasTexture(c));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    this.card = { ctx, texture, said: "" };
    const disc = this.add(new T.CylinderGeometry(0.62, 0.62, 0.03, 48), [this.standard({ color: "#fffaf0", roughness: 0.5 }), this.standard({ map: texture, roughness: 0.55 }), this.standard({ color: "#fffaf0" })], 0, 0.035, 0);
    disc.rotation.y = Math.PI / 2;
    disc.castShadow = false;
    this.begin();
  }
  protected photographic() {
    return true;
  }
  protected subject(aspect: number): TableSubject {
    // A tall screen (a phone held upright) has the guests at the sides close in; a wide one shows the room round them.
    return aspect < 1 ? { ...RR.SUBJECT, half: 4.7, halfZ: 4.4 } : RR.SUBJECT;
  }
  // ── The room ──────────────────────────────────────────────────────────────────────────────────────────────────
  private lights() {
    this.scene.add(new T.HemisphereLight("#fff4e6", "#8a6a58", 1.55));
    const sun = new T.DirectionalLight("#fff1dc", 1.9);
    sun.position.set(-5, 12, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
    sun.shadow.camera.right = sun.shadow.camera.top = 8;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    // A warm lamp over the table, and the glow of the fairy lights at the back.
    const lamp = new T.PointLight("#ffd9a0", 9, 9, 1.6);
    lamp.position.set(0, 4.2, 0.4);
    this.scene.add(lamp);
    const back = new T.PointLight("#ffb6d6", 4, 9, 1.8);
    back.position.set(0, 3, -6);
    this.scene.add(back);
  }
  private room(keep: Own) {
    const FLOOR = RR.FLOOR_Y;
    const floor = this.add(new T.PlaneGeometry(30, 22), this.standard(planks(5, keep, 3.6)), 0, FLOOR, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    // A round rug under the table.
    const { c: rugC, ctx: rug } = canvasOf(512, 512);
    for (let r = 256; r > 0; r -= 32) {
      rug.fillStyle = (r / 32) % 2 ? "#e9637a" : "#ffd3a8";
      rug.beginPath();
      rug.arc(256, 256, r, 0, Math.PI * 2);
      rug.fill();
    }
    const rugMap = keep(new T.CanvasTexture(rugC));
    rugMap.colorSpace = T.SRGBColorSpace;
    const mat = this.add(new T.CircleGeometry(5.4, 64), this.standard({ map: rugMap, roughness: 1 }), 0, FLOOR + 0.01, 0);
    mat.rotation.x = -Math.PI / 2;
    mat.castShadow = false;
    // Striped wallpaper behind and at the sides, a white skirting board.
    const { c: wallC, ctx: wall } = canvasOf(512, 512);
    for (let x = 0; x < 512; x += 64) {
      wall.fillStyle = "#fbe6ef";
      wall.fillRect(x, 0, 32, 512);
      wall.fillStyle = "#fff6e9";
      wall.fillRect(x + 32, 0, 32, 512);
      wall.fillStyle = "rgba(240, 150, 180, 0.35)";
      for (let y = 16; y < 512; y += 64) {
        wall.beginPath();
        wall.arc(x + 48, y + ((x / 64) % 2) * 32, 5, 0, Math.PI * 2);
        wall.fill();
      }
    }
    const paper = keep(new T.CanvasTexture(wallC));
    paper.colorSpace = T.SRGBColorSpace;
    paper.wrapS = paper.wrapT = T.RepeatWrapping;
    paper.repeat.set(8, 3);
    const papered = this.standard({ map: paper, roughness: 0.95 }),
      side = this.standard({ map: paper.clone(), roughness: 0.95 });
    keep((side as T.MeshStandardMaterial).map!);
    const back = this.add(new T.PlaneGeometry(26, 10), papered, 0, FLOOR + 5, -7.2);
    back.castShadow = false;
    for (const s of [-1, 1]) {
      const w = this.add(new T.PlaneGeometry(18, 10), side, s * 9.5, FLOOR + 5, 1.8);
      w.rotation.y = -s * Math.PI / 2;
      w.castShadow = false;
    }
    const skirt = this.standard({ color: "#ffffff", roughness: 0.5 });
    this.add(new T.BoxGeometry(26, 0.3, 0.06), skirt, 0, FLOOR + 0.15, -7.15).castShadow = false;
    // A banner over the back wall: 게임의 밤.
    const { c: banC, ctx: ban } = canvasOf(1024, 192);
    ban.fillStyle = "#3b2a6b";
    ban.fillRect(0, 0, 1024, 192);
    const letters = "즐거운 게임의 밤";
    ban.font = `900 104px ${FONT}`;
    ban.textAlign = "center";
    ban.textBaseline = "middle";
    const width = ban.measureText(letters).width;
    let x = 512 - width / 2;
    [...letters].forEach((ch, i) => {
      const w = ban.measureText(ch).width;
      ban.fillStyle = ["#ffd43b", "#ff8fab", "#74c0fc", "#8ce99a"][i % 4];
      ban.fillText(ch, x + w / 2, 100);
      x += w;
    });
    const banMap = keep(new T.CanvasTexture(banC));
    banMap.colorSpace = T.SRGBColorSpace;
    this.add(new T.PlaneGeometry(6.4, 1.2), this.standard({ map: banMap, roughness: 0.8 }), 0, FLOOR + 6.3, -7.1).castShadow = false;
    // Bunting: two strings of little flags sagging across the back wall.
    const flagGeo = keep(new T.BufferGeometry().setFromPoints([new T.Vector3(-0.22, 0, 0), new T.Vector3(0.22, 0, 0), new T.Vector3(0, -0.42, 0)]));
    flagGeo.computeVertexNormals();
    const flagMats = ["#ff6b6b", "#ffd43b", "#4dabf7", "#69db7c", "#da77f2"].map((color) => this.standard({ color, side: T.DoubleSide, roughness: 0.7 })),
      cord = this.own(new T.LineBasicMaterial({ color: "#7a5a48" }));
    for (const [y0, sag, from, to] of [
      [FLOOR + 7.6, 1.0, -11, 11],
      [FLOOR + 7.2, 0.7, -10, 10],
    ] as const) {
      const pts: T.Vector3[] = [];
      for (let k = 0; k <= 40; k++) {
        const u = k / 40,
          x = from + (to - from) * u;
        pts.push(new T.Vector3(x, y0 - sag * 4 * u * (1 - u), -7.0));
      }
      this.scene.add(new T.Line(keep(new T.BufferGeometry().setFromPoints(pts)), cord));
      for (let k = 1; k < 40; k += 2) {
        const f = new T.Mesh(flagGeo, flagMats[(k + (y0 > FLOOR + 7.4 ? 0 : 2)) % flagMats.length]);
        f.position.copy(pts[k]);
        f.rotation.z = Math.sin(k) * 0.08;
        this.scene.add(f);
      }
    }
    // Fairy lights: little glowing bulbs along a lower string.
    const bulb = keep(new T.SphereGeometry(0.07, 10, 8)),
      glows = ["#fff3b0", "#ffc9de", "#bde0fe"].map((color) => this.own(new T.MeshBasicMaterial({ color })));
    for (let k = 0; k <= 30; k++) {
      const u = k / 30,
        b = new T.Mesh(bulb, glows[k % 3]);
      b.position.set(-11 + 22 * u, FLOOR + 6.7 - 1.3 * 4 * u * (1 - u), -7.05);
      this.scene.add(b);
    }
    // Balloons in clusters at the back corners and one bunch tied to my left's chair side.
    const balloon = keep(new T.SphereGeometry(0.42, 24, 18)),
      knot = keep(new T.ConeGeometry(0.06, 0.1, 8)),
      string = this.own(new T.LineBasicMaterial({ color: "#cfcfcf" }));
    const balloonMats = ["#ff5c7a", "#ffd43b", "#5cc8ff", "#9b6bff", "#5fd38a", "#ff9f43"].map((color) => keep(glossy({ color, roughness: 0.25 }, 0.8)));
    const bunch = (x: number, z: number, base: number, n: number, seed: number) => {
      for (let k = 0; k < n; k++) {
        const a = seed + k * 2.1,
          px = x + Math.cos(a) * 0.45 * (k % 3),
          pz = z + Math.sin(a) * 0.35 * (k % 2),
          py = base + 1.6 + (k % 3) * 0.55,
          m = new T.Mesh(balloon, balloonMats[(k + seed) % balloonMats.length]);
        m.scale.set(1, 1.2, 1);
        m.position.set(px, py, pz);
        m.castShadow = true;
        this.scene.add(m);
        const kn = new T.Mesh(knot, balloonMats[(k + seed) % balloonMats.length]);
        kn.position.set(px, py - 0.52, pz);
        kn.rotation.x = Math.PI;
        this.scene.add(kn);
        this.scene.add(new T.Line(keep(new T.BufferGeometry().setFromPoints([new T.Vector3(px, py - 0.56, pz), new T.Vector3(x, base, z)])), string));
      }
    };
    bunch(-7.6, -5.8, FLOOR + 0.6, 6, 0);
    bunch(7.4, -5.6, FLOOR + 0.6, 5, 3);
    bunch(-8.4, 1.2, FLOOR + 0.3, 4, 1);
    // A sideboard at the back with a stack of presents and a lamp.
    const cab = this.standard({ color: "#f4ede0", roughness: 0.55 });
    this.add(block(4.2, 1.6, 0.9, 0.05), cab, -3.6, FLOOR + 0.8, -6.5);
    this.add(block(4.3, 0.08, 1.0, 0.03), this.standard({ color: "#c79a6a", roughness: 0.45 }), -3.6, FLOOR + 1.64, -6.5);
    const wraps = [
      ["#ff6b8b", "#ffe066"],
      ["#4dabf7", "#ffffff"],
      ["#8ce99a", "#ff6b6b"],
    ];
    [
      [-4.7, 0.5, 0.6, 0.5],
      [-4.1, 0.38, 0.42, 0.4],
      [-4.45, 0.3, 0.3, 0.3],
    ].forEach(([x, w, h, d], i) => {
      const y = FLOOR + 1.68 + (i === 2 ? 0.6 : 0) + h / 2;
      this.add(block(w, h, d, 0.02), this.standard({ color: wraps[i][0], roughness: 0.6 }), x, y, -6.45);
      this.add(new T.BoxGeometry(w + 0.01, h + 0.01, 0.07), this.standard({ color: wraps[i][1], roughness: 0.5 }), x, y, -6.45);
      this.add(new T.BoxGeometry(0.07, h + 0.01, d + 0.01), this.standard({ color: wraps[i][1], roughness: 0.5 }), x, y, -6.45);
    });
    const lampShade = this.add(new T.CylinderGeometry(0.28, 0.42, 0.5, 24, 1, true), this.own(new T.MeshStandardMaterial({ color: "#fff0d2", emissive: "#ffcf80", emissiveIntensity: 0.6, side: T.DoubleSide })), -2.2, FLOOR + 2.55, -6.5);
    lampShade.castShadow = false;
    this.add(new T.CylinderGeometry(0.04, 0.04, 0.8, 10), this.standard({ color: "#b08a5a", metalness: 0.5, roughness: 0.4 }), -2.2, FLOOR + 2.05, -6.5);
    // A tall plant at the right.
    const pot = this.standard({ color: "#d9774f", roughness: 0.7 }),
      leaf = this.standard({ color: "#3f8f4f", roughness: 0.6, side: T.DoubleSide });
    this.add(new T.CylinderGeometry(0.45, 0.35, 0.8, 24), pot, 6.8, FLOOR + 0.4, -5.6);
    const leafGeo = keep(new T.SphereGeometry(0.5, 12, 8).scale(0.4, 1, 0.12));
    for (let k = 0; k < 11; k++) {
      const m = new T.Mesh(leafGeo, leaf),
        a = k * 2.4;
      m.position.set(6.8 + Math.cos(a) * 0.25, FLOOR + 1.3 + (k % 4) * 0.35, -5.6 + Math.sin(a) * 0.25);
      m.rotation.set(Math.sin(a) * 0.7, a, Math.cos(a) * 0.7);
      m.castShadow = true;
      this.scene.add(m);
    }
  }
  private table(keep: Own) {
    const R = RR.TABLE_R,
      FLOOR = RR.FLOOR_Y;
    // A chequered cloth over a round top, falling in a skirt.
    const { c, ctx } = canvasOf(512, 512);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#ffffff" : "#e8465c";
        ctx.fillRect(x * 64, y * 64, 64, 64);
      }
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let y = 0; y < 512; y += 4) ctx.fillRect(0, y, 512, 1);
    const cloth = keep(new T.CanvasTexture(c));
    cloth.colorSpace = T.SRGBColorSpace;
    cloth.wrapS = cloth.wrapT = T.RepeatWrapping;
    cloth.repeat.set(2.2, 2.2);
    const clothMat = this.standard({ map: cloth, roughness: 0.9 });
    const top = this.add(new T.CylinderGeometry(R, R, 0.06, 72), clothMat, 0, -0.03, 0);
    top.receiveShadow = true;
    const skirtMap = cloth.clone();
    keep(skirtMap);
    skirtMap.repeat.set(10, 1);
    const skirt = this.add(new T.CylinderGeometry(R + 0.02, R + 0.18, 0.75, 72, 1, true), this.standard({ map: skirtMap, roughness: 0.9, side: T.DoubleSide }), 0, -0.4, 0);
    skirt.castShadow = false;
    // The table's foot under it.
    this.add(new T.CylinderGeometry(0.22, 0.5, Math.abs(FLOOR) - 0.7, 24), this.standard({ color: "#6b4a34", roughness: 0.5 }), 0, (FLOOR - 0.7) / 2, 0);
    // The cake, cups, plates, a bowl of popcorn and party blowers round the edge, between the seats.
    const plate = this.standard({ color: "#ffffff", roughness: 0.35 });
    const diag = (k: number, r: number) => ({ x: Math.cos(Math.PI / 4 + (k * Math.PI) / 2) * r, z: Math.sin(Math.PI / 4 + (k * Math.PI) / 2) * r });
    // Cake (back left).
    const ck = diag(2, R - 0.75);
    this.add(new T.CylinderGeometry(0.62, 0.62, 0.04, 40), plate, ck.x, 0.02, ck.z);
    this.add(new T.CylinderGeometry(0.5, 0.5, 0.36, 40), this.standard({ color: "#fff3e3", roughness: 0.7 }), ck.x, 0.22, ck.z);
    this.add(new T.CylinderGeometry(0.51, 0.51, 0.07, 40), this.standard({ color: "#ff8fab", roughness: 0.6 }), ck.x, 0.38, ck.z);
    const candle = keep(new T.CylinderGeometry(0.025, 0.025, 0.22, 8)),
      flame = keep(new T.SphereGeometry(0.035, 8, 6).scale(1, 1.7, 1)),
      flameMat = this.own(new T.MeshBasicMaterial({ color: "#ffcf5a" }));
    ["#74c0fc", "#ffd43b", "#8ce99a", "#da77f2", "#ff8787"].forEach((color, k) => {
      const a = (k / 5) * Math.PI * 2,
        cx = ck.x + Math.cos(a) * 0.28,
        cz = ck.z + Math.sin(a) * 0.28;
      const m = new T.Mesh(candle, this.standard({ color, roughness: 0.5 }));
      m.position.set(cx, 0.52, cz);
      this.scene.add(m);
      const f = new T.Mesh(flame, flameMat);
      f.position.set(cx, 0.66, cz);
      this.scene.add(f);
    });
    // Popcorn (back right).
    const pc = diag(3, R - 0.7);
    this.add(new T.CylinderGeometry(0.42, 0.3, 0.32, 24, 1, true), this.standard({ color: "#e03131", roughness: 0.6, side: T.DoubleSide }), pc.x, 0.16, pc.z);
    const kernel = keep(new T.IcosahedronGeometry(0.06, 0)),
      corn = this.standard({ color: "#fff4cf", roughness: 0.9 });
    for (let k = 0; k < 40; k++) {
      const a = k * 2.39,
        r = 0.32 * Math.sqrt((k % 20) / 20),
        m = new T.Mesh(kernel, corn);
      m.position.set(pc.x + Math.cos(a) * r, 0.3 + (k % 3) * 0.04 + (k < 20 ? 0 : 0.06), pc.z + Math.sin(a) * r);
      m.rotation.set(k, k * 2, k * 3);
      this.scene.add(m);
    }
    // Cups of juice (front left and right).
    for (const k of [0, 1]) {
      const at = diag(k, R - 0.55);
      for (const d of [-0.25, 0.25]) {
        const x = at.x + d * (k ? 1 : -1) * 0.7,
          z = at.z + d * 0.7;
        this.add(new T.CylinderGeometry(0.13, 0.1, 0.32, 20, 1, true), this.own(new T.MeshStandardMaterial({ color: k ? "#ffd43b" : "#74c0fc", roughness: 0.4, side: T.DoubleSide })), x, 0.16, z);
        this.add(new T.CylinderGeometry(0.12, 0.12, 0.02, 20), this.standard({ color: k ? "#ff922b" : "#e64980", roughness: 0.2 }), x, 0.26, z);
        const straw = this.add(new T.CylinderGeometry(0.012, 0.012, 0.42, 6), this.standard({ color: "#ffffff" }), x + 0.04, 0.4, z);
        straw.rotation.z = 0.25;
      }
    }
  }
  // ── The guests ────────────────────────────────────────────────────────────────────────────────────────────────
  private guest(seat: number, keep: Own): Guest {
    const way = seatWay(seat),
      root = new T.Group();
    root.position.set(way.x * RR.SEAT_R, 0, way.z * RR.SEAT_R);
    // The guest faces the middle: its face is on its own -z side.
    root.rotation.y = Math.atan2(way.x, way.z);
    this.scene.add(root);
    // The chair: a seat, four legs and a back behind the guest.
    const chair = new T.Group();
    root.add(chair);
    const wood = this.standard({ color: "#c58b5b", roughness: 0.55 });
    this.add(block(1.1, 0.1, 1.0, 0.03), wood, 0, RR.FLOOR_Y + 1.15, 0.15, chair);
    for (const [x, z] of [
      [-0.45, -0.25],
      [0.45, -0.25],
      [-0.45, 0.55],
      [0.45, 0.55],
    ])
      this.add(new T.CylinderGeometry(0.04, 0.04, 1.15, 8), wood, x, RR.FLOOR_Y + 0.575, z, chair);
    this.add(block(1.1, 1.2, 0.08, 0.03), wood, 0, RR.FLOOR_Y + 1.8, 0.66, chair);
    const body = new T.Group();
    root.add(body);
    const shirt = this.standard({ color: SHIRTS[seat], roughness: 0.75 });
    this.add(new T.CapsuleGeometry(0.46, 0.5, 6, 16), shirt, 0, RR.BODY_Y, 0.2, body);
    // A collar stripe.
    this.add(new T.TorusGeometry(0.28, 0.05, 8, 24), this.standard({ color: "#ffffff", roughness: 0.6 }), 0, RR.BODY_Y + 0.6, 0.18, body).rotation.x = Math.PI / 2;
    const head = new T.Group();
    head.position.set(0, RR.HEAD_Y, 0.12);
    body.add(head);
    const skin = new T.Color(SKINS[seat]),
      face = this.standard({ color: skin.clone(), roughness: 0.65 }) as T.MeshStandardMaterial;
    this.add(new T.SphereGeometry(0.42, 28, 20), face, 0, 0, 0, head);
    // Ears, eyes with a glint, rosy cheeks, a smile (or a round gasp).
    for (const s of [-1, 1]) {
      this.add(new T.SphereGeometry(0.09, 10, 8), face, s * 0.41, -0.02, 0.02, head);
      this.add(new T.SphereGeometry(0.055, 12, 10), this.standard({ color: "#1b1b22", roughness: 0.3 }), s * 0.14, 0.06, -0.37, head);
      this.add(new T.SphereGeometry(0.018, 8, 6), this.own(new T.MeshBasicMaterial({ color: "#ffffff" })), s * 0.14 + 0.015, 0.08, -0.42, head);
      const cheek = this.add(new T.CircleGeometry(0.07, 16), this.own(new T.MeshBasicMaterial({ color: "#ff9aa2", transparent: true, opacity: 0.55 })), s * 0.24, -0.08, -0.35, head);
      cheek.rotation.y = Math.PI + s * 0.5;
      cheek.castShadow = false;
    }
    const mouth = this.add(new T.TorusGeometry(0.1, 0.02, 6, 16, Math.PI), this.standard({ color: "#8a2f2f" }), 0, -0.13, -0.385, head);
    mouth.rotation.set(0, 0, Math.PI);
    const gasp = this.add(new T.SphereGeometry(0.07, 12, 10), this.standard({ color: "#4a1f1f" }), 0, -0.15, -0.38, head);
    gasp.scale.set(1, 1.2, 0.5);
    gasp.visible = false;
    // Hair: a cap over the back of the head, and spikes standing up after a 펑.
    const hairMat = this.standard({ color: HAIRS[seat], roughness: 0.8 }),
      cap = this.add(new T.SphereGeometry(0.44, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat, 0, 0.02, 0.03, head);
    cap.rotation.x = 0.35;
    const spikes = new T.Group();
    head.add(spikes);
    const spike = keep(new T.ConeGeometry(0.07, 0.38, 6));
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2,
        m = new T.Mesh(spike, hairMat);
      m.position.set(Math.cos(a) * 0.24, 0.38, Math.sin(a) * 0.24);
      m.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      spikes.add(m);
    }
    spikes.visible = false;
    // The party hat: a striped cone with a pompom, a little to one side.
    const { c, ctx } = canvasOf(256, 256);
    ctx.fillStyle = HATS[seat];
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let k = -256; k < 512; k += 64) {
      ctx.beginPath();
      ctx.moveTo(k, 256);
      ctx.lineTo(k + 28, 256);
      ctx.lineTo(k + 28 + 120, 0);
      ctx.lineTo(k + 120, 0);
      ctx.fill();
    }
    const hatMap = keep(new T.CanvasTexture(c));
    hatMap.colorSpace = T.SRGBColorSpace;
    const hat = new T.Group();
    hat.position.set(0.06, 0.36, 0);
    hat.rotation.z = -0.18;
    head.add(hat);
    this.add(new T.ConeGeometry(0.22, 0.6, 24, 1, true), this.standard({ map: hatMap, roughness: 0.6, side: T.DoubleSide }), 0, 0.3, 0, hat);
    this.add(new T.SphereGeometry(0.08, 12, 10), this.standard({ color: "#ffffff", roughness: 0.9 }), 0, 0.62, 0, hat);
    // Dizzy stars round the head after a 펑.
    const stars = new T.Group();
    stars.position.y = 0.62;
    head.add(stars);
    const star = keep(new T.OctahedronGeometry(0.07, 0)),
      starMat = this.own(new T.MeshBasicMaterial({ color: "#ffe066" }));
    for (let k = 0; k < 4; k++) {
      const m = new T.Mesh(star, starMat),
        a = (k / 4) * Math.PI * 2;
      m.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
      stars.add(m);
    }
    stars.visible = false;
    // Arms: from the shoulders to the hands, resting on the table or holding the toy up.
    const sleeve = this.standard({ color: SHIRTS[seat], roughness: 0.75 }),
      armGeo = keep(new T.CylinderGeometry(0.1, 0.1, 1, 10).translate(0, 0.5, 0)),
      handGeo = keep(new T.SphereGeometry(0.12, 14, 10));
    const arms = [-1, 1].map((s) => {
      const arm = new T.Mesh(armGeo, sleeve),
        hand = new T.Mesh(handGeo, face);
      arm.castShadow = hand.castShadow = true;
      body.add(arm, hand);
      return { arm, hand, shoulder: new T.Vector3(s * 0.52, RR.SHOULDER_Y, 0.15) };
    });
    // The name over the head.
    const { c: tagC, ctx: _tag } = canvasOf(512, 160),
      tagMap = keep(new T.CanvasTexture(tagC));
    tagMap.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(this.own(new T.SpriteMaterial({ map: tagMap, depthWrite: false, transparent: true })));
    sprite.scale.set(1.6, 0.5, 1);
    sprite.position.set(way.x * RR.SEAT_R, RR.HEAD_Y + 1.15, way.z * RR.SEAT_R);
    // Mine stands at my left, low: over my head it would cover the toy held up before me.
    if (seat === 0) {
      sprite.position.set(-1.75, RR.HEAD_Y + 0.15, RR.SEAT_R);
      sprite.scale.set(1.3, 0.41, 1);
    }
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    return { root, body, head, face, skin, hat, spikes, mouth, gasp, stars, arms, tag: { canvas: tagC, texture: tagMap, sprite, said: "" }, chair };
  }
  /** Puts a guest's hands at `hands` (two places in the guest's own frame) and its arms between them and its shoulders. */
  private reach(g: Guest, hands: [T.Vector3, T.Vector3]) {
    const up = new T.Vector3(0, 1, 0);
    g.arms.forEach(({ arm, hand, shoulder }, k) => {
      const to = hands[k],
        d = to.clone().sub(shoulder),
        len = Math.max(0.05, d.length());
      arm.position.copy(shoulder);
      arm.scale.set(1, len, 1);
      arm.quaternion.setFromUnitVectors(up, d.normalize());
      hand.position.copy(to);
    });
  }
  /** Where a guest's hands rest on the table. */
  private resting(g: Guest) {
    this.reach(g, [new T.Vector3(-0.5, 0.1, -1.05), new T.Vector3(0.5, 0.1, -1.05)]);
  }
  /**
   * Where the toy is held up for a seat (in the room): before the guest and off to its right hand, so that it stands
   * clear of the guest's head (mine is between the toy and the camera otherwise).
   */
  private held(seat: number) {
    const way = seatWay(seat);
    return { x: way.x * RR.HOLD_R + way.z * RR.HOLD_SIDE, y: RR.HOLD_Y, z: way.z * RR.HOLD_R - way.x * RR.HOLD_SIDE };
  }
  /** The right hand on the toy's grip (wherever the toy now stands), the left resting on the table. */
  private holdHands(g: Guest) {
    this.toy.pivot.updateMatrixWorld(true);
    g.root.updateMatrixWorld(true);
    const at = g.root.worldToLocal(this.toy.grip.getWorldPosition(new T.Vector3()));
    this.reach(g, [new T.Vector3(-0.5, 0.1, -1.05), at]);
  }
  /** A guest's look: in the game or out (sooty, hair on end), and its name tag. */
  private dress(g: Guest, seat: number, s: State) {
    const out = s.out[seat],
      empty = !s.seated[seat];
    g.body.visible = !empty;
    g.spikes.scale.setScalar(1);
    g.tag.sprite.visible = !empty && !capturing();
    g.face.color.copy(out ? g.skin.clone().lerp(new T.Color("#4a4a52"), 0.72) : g.skin);
    g.spikes.visible = out;
    g.stars.visible = out && s.last?.seat === seat && s.last.bang;
    g.mouth.visible = !out;
    g.gasp.visible = out;
    g.hat.rotation.z = out ? -0.9 : -0.18;
    g.hat.position.set(out ? 0.3 : 0.06, out ? 0.22 : 0.36, 0);
    g.head.rotation.set(0, 0, 0);
    g.body.position.set(0, 0, 0);
    if (s.seat === seat && s.winner === null) this.holdHands(g);
    else this.resting(g);
    this.tagOf(g, seat, s);
  }
  private tagOf(g: Guest, seat: number, s: State) {
    const out = s.out[seat],
      turn = s.seat === seat && s.winner === null,
      champ = s.champion === seat,
      line = champ ? "우승!" : out ? "펑! 탈락" : `돌리기 ${s.spins[seat]}번`,
      said = `${PEOPLE[seat]}|${line}|${turn}|${out}`;
    if (said === g.tag.said) return;
    g.tag.said = said;
    const ctx = g.tag.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 512, 160);
    ctx.fillStyle = turn ? "#ffe066" : champ ? "#ffd43b" : out ? "rgba(60,60,70,0.85)" : "rgba(255,255,255,0.92)";
    roundRect(ctx, 16, 12, 480, 136, 36);
    ctx.fill();
    ctx.strokeStyle = HATS[seat];
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = out ? "#ffffff" : "#2b2233";
    ctx.font = `900 56px ${FONT}`;
    ctx.fillText(PEOPLE[seat], 256, 58);
    ctx.font = `700 36px ${FONT}`;
    ctx.fillStyle = out ? "#ffc9c9" : "#5a4a66";
    ctx.fillText(line, 256, 114);
    g.tag.texture.needsUpdate = true;
  }
  // ── The toy ───────────────────────────────────────────────────────────────────────────────────────────────────
  private makeToy(keep: Own): Toy {
    const pivot = new T.Group();
    this.scene.add(pivot);
    // The revolver is built lying along +x (its barrel), then tipped up in `pivot` so the barrel points up and away
    // over the table, the grip down toward the hand.
    const gun = new T.Group();
    gun.rotation.z = 1.05;
    pivot.add(gun);
    const blue = keep(glossy({ color: "#2f7fd8", roughness: 0.28 }, 0.7)),
      yellow = keep(glossy({ color: "#ffc61a", roughness: 0.3 }, 0.6)),
      red = keep(glossy({ color: "#e8434f", roughness: 0.35 }, 0.5)),
      white = this.standard({ color: "#f8f8f8", roughness: 0.4 }),
      orange = this.standard({ color: "#ff7a1a", roughness: 0.45, emissive: "#ff5a00", emissiveIntensity: 0.15 }),
      dark = this.standard({ color: "#20242c", roughness: 0.6 });
    const along = (geo: T.BufferGeometry) => geo.rotateZ(-Math.PI / 2);
    // Barrel with a rib and sight, and the orange tip.
    this.add(along(new T.CylinderGeometry(0.07, 0.075, 0.6, 20)), blue, 0.44, 0.1, 0, gun);
    this.add(new T.BoxGeometry(0.56, 0.05, 0.05), blue, 0.44, 0.17, 0, gun);
    this.add(new T.BoxGeometry(0.04, 0.06, 0.03), white, 0.7, 0.2, 0, gun);
    const tip = this.add(along(new T.CylinderGeometry(0.085, 0.085, 0.08, 20)), orange, 0.77, 0.1, 0, gun);
    this.add(along(new T.CylinderGeometry(0.035, 0.035, 0.09, 12)), dark, 0.78, 0.1, 0, gun);
    // The frame and the top strap over the cylinder.
    this.add(block(0.42, 0.24, 0.13, 0.04), blue, -0.02, 0.0, 0, gun);
    this.add(new T.BoxGeometry(0.34, 0.05, 0.1), blue, 0.0, 0.17, 0, gun);
    // The cylinder: six chambers round its axis, below the barrel's line.
    const drum = new T.Group();
    drum.position.set(0.0, -0.01, 0);
    gun.add(drum);
    this.add(along(new T.CylinderGeometry(0.155, 0.155, 0.26, 30)), yellow, 0, 0, 0, drum);
    for (let k = 0; k < CHAMBERS; k++) {
      const a = (k / CHAMBERS) * Math.PI * 2;
      this.add(along(new T.CylinderGeometry(0.036, 0.036, 0.265, 12)), dark, 0, Math.cos(a) * 0.1, Math.sin(a) * 0.1, drum);
      // Flutes between the chambers.
      const flute = this.add(new T.BoxGeometry(0.2, 0.03, 0.02), this.standard({ color: "#e0a800", roughness: 0.4 }), 0, Math.cos(a + Math.PI / CHAMBERS) * 0.15, Math.sin(a + Math.PI / CHAMBERS) * 0.15, drum);
      flute.rotation.x = a + Math.PI / CHAMBERS;
    }
    // The hammer at the back, a pivot at its foot.
    const hammer = new T.Group();
    hammer.position.set(-0.2, 0.12, 0);
    gun.add(hammer);
    this.add(block(0.06, 0.16, 0.06, 0.015), white, -0.02, 0.07, 0, hammer).rotation.z = 0.35;
    this.add(new T.BoxGeometry(0.08, 0.035, 0.08), white, -0.06, 0.15, 0, hammer);
    // The trigger guard and the trigger, on a pivot.
    const guard = this.add(new T.TorusGeometry(0.1, 0.018, 8, 24, Math.PI * 1.25), blue, -0.04, -0.15, 0, gun);
    guard.rotation.z = Math.PI * 0.95;
    const trigger = new T.Group();
    trigger.position.set(-0.01, -0.11, 0);
    gun.add(trigger);
    const t = this.add(new T.TorusGeometry(0.07, 0.022, 8, 12, Math.PI * 0.55), white, 0.04, -0.06, 0, trigger);
    t.rotation.z = Math.PI * 0.95;
    // The grip, raked back and down, with a star.
    const grip = new T.Group();
    grip.position.set(-0.21, -0.06, 0);
    grip.rotation.z = 0.4;
    gun.add(grip);
    this.add(block(0.17, 0.48, 0.15, 0.06), red, -0.02, -0.22, 0, grip);
    this.add(new T.CylinderGeometry(0.1, 0.1, 0.03, 20), red, -0.02, -0.47, 0, grip);
    const hold = new T.Object3D();
    hold.position.set(-0.02, -0.25, 0);
    grip.add(hold);
    const starShape = new T.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2,
        r = k % 2 ? 0.025 : 0.06;
      if (!k) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (const s of [-1, 1]) {
      const st = this.add(new T.ShapeGeometry(starShape), this.standard({ color: "#ffe066", roughness: 0.4, side: T.DoubleSide }), -0.02, -0.2, s * 0.077, grip);
      st.castShadow = false;
    }
    // The "펑!" flag on its spring, folded inside the barrel until it goes off.
    const flag = new T.Group();
    flag.position.set(0.8, 0.1, 0);
    gun.add(flag);
    this.add(new T.CylinderGeometry(0.016, 0.016, 0.75, 6).rotateZ(-Math.PI / 2), this.standard({ color: "#bfbfbf", metalness: 0.7, roughness: 0.3 }), 0.37, 0, 0, flag);
    const { c, ctx } = canvasOf(256, 160);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = "#e8434f";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 146);
    ctx.fillStyle = "#e8434f";
    ctx.font = `900 104px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("펑!", 128, 86);
    const flagMap = keep(new T.CanvasTexture(c));
    flagMap.colorSpace = T.SRGBColorSpace;
    const banner = this.add(new T.PlaneGeometry(0.85, 0.53), this.standard({ map: flagMap, side: T.DoubleSide, roughness: 0.7 }), 0.5, -0.29, 0, flag);
    banner.rotation.z = -Math.PI / 2;
    flag.visible = false;
    pivot.scale.setScalar(RR.TOY_SCALE);
    return { grip: hold, pivot, gun, drum, hammer, trigger, flag, tip };
  }
  /** Sets the toy before `seat`, pointing up over the table (leaning away from the holder), turned a little to show its side. */
  private aimToy(seat: number, s: State, lift = 0) {
    const at = this.held(seat),
      way = seatWay(seat),
      p = this.toy.pivot;
    p.position.set(at.x, at.y + lift, at.z);
    // Local +x (where the barrel leans) away from the holder, over the table; then a turn to show its side.
    const face = Math.atan2(way.z, -way.x);
    p.rotation.set(0, face + 0.55, 0);
    this.toy.drum.rotation.x = (s.turn * Math.PI * 2) / CHAMBERS;
  }
  private restToy(s: State) {
    this.toy.hammer.rotation.z = 0;
    this.toy.trigger.rotation.z = 0;
    this.toy.flag.visible = false;
    this.toy.flag.scale.setScalar(1);
    this.toy.flag.position.x = 0.8;
    if (s.winner !== null) {
      // Laid down in the middle once the game is over.
      const p = this.toy.pivot;
      p.position.set(0.15, 0.11, 0.1);
      p.rotation.set(0, 0.4, 0);
      p.rotateX(-Math.PI / 2);
      p.rotateZ(Math.PI / 2);
      this.toy.drum.rotation.x = (s.turn * Math.PI * 2) / CHAMBERS;
    } else this.aimToy(s.seat, s);
  }
  // ── The card in the middle: the chambers fired since the last spin ──────────────────────────────────────────────
  private writeCard(s: State) {
    const fired = CHAMBERS - s.left,
      said = `${s.left}|${s.winner}`;
    if (said === this.card.said) return;
    this.card.said = said;
    const ctx = this.card.ctx;
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(0, 0, 512, 512);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let k = 0; k < CHAMBERS; k++) {
      const a = (k / CHAMBERS) * Math.PI * 2 - Math.PI / 2,
        x = 256 + Math.cos(a) * 150,
        y = 256 + Math.sin(a) * 150;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, Math.PI * 2);
      ctx.fillStyle = k < fired ? "#c7c2b8" : "#ffe9a8";
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = k < fired ? "#9a948a" : "#e8a400";
      ctx.stroke();
      if (k < fired) {
        ctx.fillStyle = "#6f6a62";
        ctx.font = `900 44px ${FONT}`;
        ctx.fillText("✓", x, y + 3);
      }
    }
    ctx.fillStyle = s.winner !== null ? "#3b2a6b" : s.left <= 2 ? "#e03131" : "#3b2a6b";
    ctx.font = `900 92px ${FONT}`;
    ctx.fillText(s.winner !== null ? "끝" : `1/${s.left}`, 256, 250);
    this.card.texture.needsUpdate = true;
  }
  // ── Laying out ────────────────────────────────────────────────────────────────────────────────────────────────
  protected place(s: State) {
    if (s.ply === 0) this.clearConfetti();
    this.restToy(s);
    this.guests.forEach((g, seat) => this.dress(g, seat, s));
    this.writeCard(s);
    this.dataset(s);
    this.redraw();
  }
  private dataset(s: State) {
    const d = this.renderer.domElement.dataset;
    d.seat = String(s.seat);
    d.left = String(s.left);
    d.out = s.out.map((o) => (o ? 1 : 0)).join("");
    d.spins = s.spins.join(",");
    d.last = s.last ? `${s.last.seat},${s.last.spun ? 1 : 0},${s.last.bang ? 1 : 0},${s.last.odds}` : "";
    d.champion = s.champion === null ? "" : String(s.champion);
    // Where my toy is on the canvas (CSS pixels), for a press to be aimed at it (tests).
    this.camera.updateMatrixWorld();
    const at = this.held(0),
      v = new T.Vector3(at.x, at.y, at.z).project(this.camera),
      el = this.renderer.domElement;
    d.toy = `${Math.round(((v.x + 1) / 2) * el.clientWidth)},${Math.round(((1 - v.y) / 2) * el.clientHeight)}`;
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s || s.winner !== null || s.seat !== 0) return [];
    const at = this.held(0);
    return [{ x: at.x, y: at.y, z: at.z, r: 0.8, point: PULL }];
  }
  protected mark(_marks: Marks) {
    this.renderer.domElement.style.cursor = this.mayPull() ? "pointer" : "default";
  }
  private mayPull() {
    return !!this.state && this.state.winner === null && this.marks.targets.includes(PULL) && !this.animating;
  }
  // ── Press and hold the toy to pull ────────────────────────────────────────────────────────────────────────────
  protected dragStart(point: number) {
    if (point !== PULL || !this.mayPull()) return false;
    this.holding = true;
    this.heartAt = 0;
    const started = performance.now(),
      from = this.squeeze;
    this.onKnock?.("cushion", 0.2);
    const frame = (now: number) => {
      if (this.disposed) return;
      const s = this.state;
      if (!s) return;
      if (this.holding) this.squeeze = Math.min(1, from + (now - started) / RR.HOLD_MS);
      else this.squeeze = Math.max(0, this.squeeze - 0.08);
      if (this.holding && now - this.heartAt > 520) {
        this.heartAt = now;
        this.onKnock?.("cushion", 0.8);
      }
      this.pose(this.squeeze, s);
      this.renderer.domElement.dataset.squeeze = this.squeeze.toFixed(2);
      this.redraw();
      if (this.holding && this.squeeze >= 1) {
        this.holding = false;
        this.heldPull = true;
        this.onPick(PULL);
        // Refused (not mine after all): the trigger goes back.
        if (this.state === s) {
          this.heldPull = false;
          this.holdFrame = requestAnimationFrame(frame);
        }
        return;
      }
      if (this.holding || this.squeeze > 0) this.holdFrame = requestAnimationFrame(frame);
    };
    cancelAnimationFrame(this.holdFrame);
    this.holdFrame = requestAnimationFrame(frame);
    return true;
  }
  protected dragEnd() {
    this.holding = false;
  }
  /** The hammer back and the trigger in, by how far the trigger is squeezed (0 to 1). */
  private pose(squeeze: number, s: State) {
    this.toy.hammer.rotation.z = Math.min(1, squeeze * 1.6) * 0.75;
    this.toy.trigger.rotation.z = squeeze * 0.42;
    // A tremble as it comes near.
    const shake = squeeze > 0.5 ? (squeeze - 0.5) * 0.02 : 0;
    this.aimToy(s.seat, s);
    this.toy.pivot.position.x += Math.sin(performance.now() * 0.05) * shake;
  }
  // ── The move ──────────────────────────────────────────────────────────────────────────────────────────────────
  protected animate(before: State, s: State): boolean {
    const shot = s.last;
    if (!shot || s.ply !== before.ply + 1) {
      this.heldPull = false;
      return false;
    }
    const seat = shot.seat,
      g = this.guests[seat],
      held = this.heldPull;
    this.heldPull = false;
    cancelAnimationFrame(this.holdFrame);
    let t = 0;
    const once = (delay: number, act: () => void) => {
      let done = false;
      this.tween(delay, 1, () => {
        if (done) return;
        done = true;
        act();
      });
    };
    const turnBefore = (before.turn * Math.PI * 2) / CHAMBERS;
    // The toy stays before the holder all through; its pose is set again by each step.
    this.aimToy(seat, before);
    this.holdHands(g);
    if (shot.spun) {
      // The cylinder whirls and slows, ticking.
      const end = Math.PI * 6 + (((s.turn - 1 + CHAMBERS) % CHAMBERS) * Math.PI * 2) / CHAMBERS;
      this.tween(t, 1150, (p) => (this.toy.drum.rotation.x = turnBefore + (end - turnBefore) * (1 - (1 - p) * (1 - p))));
      for (let k = 0; k < 9; k++) once(t + 1150 * (1 - Math.sqrt(1 - k / 9)), () => this.onKnock?.("disc", 0.25 + (9 - k) * 0.03));
      t += 1250;
    }
    const firedFrom = shot.spun ? ((s.turn - 1 + CHAMBERS) % CHAMBERS) : before.turn;
    // Cock and squeeze (unless the trigger was already held all the way in), the heart beating.
    if (!held) {
      once(t, () => this.onKnock?.("cushion", 0.2));
      this.tween(t, 300, (p) => (this.toy.hammer.rotation.z = smooth(p) * 0.75));
      t += 320;
      const squeeze = RR.SQUEEZE_MS;
      once(t, () => this.onKnock?.("cushion", 0.8));
      once(t + squeeze * 0.5, () => this.onKnock?.("cushion", 0.8));
      this.tween(t, squeeze, (p) => {
        this.toy.trigger.rotation.z = smooth(p) * 0.42;
        const shake = p > 0.4 ? (p - 0.4) * 0.025 : 0;
        this.aimToy(seat, { ...before, turn: firedFrom });
        this.toy.pivot.position.x += Math.sin(performance.now() * 0.05) * shake;
        this.toy.hammer.rotation.z = 0.75;
        g.head.rotation.x = -smooth(p) * 0.12;
      });
      t += squeeze;
    }
    if (!shot.bang) {
      // Click: the hammer falls, the cylinder steps a chamber on.
      once(t, () => this.onKnock?.("pocket", 0.3));
      this.tween(t, 160, (p) => {
        this.toy.hammer.rotation.z = 0.75 * (1 - p);
        this.toy.drum.rotation.x = ((firedFrom + smooth(p)) * Math.PI * 2) / CHAMBERS;
      });
      this.tween(t + 60, 520, (p) => {
        g.head.rotation.x = -0.12 * (1 - p);
        // A sigh of relief: a little bob.
        g.body.position.y = Math.sin(p * Math.PI) * 0.06;
      });
      t += 600;
    } else {
      // 펑: the flag springs out, confetti bursts over the holder, whose hair stands up and face goes sooty.
      once(t, () => {
        this.onKnock?.("pocket", 0.7);
        this.burst(seat);
        this.toy.flag.visible = true;
        this.toy.hammer.rotation.z = 0;
      });
      this.tween(t, 360, (p) => {
        const e = 1 - Math.pow(1 - p, 3),
          over = Math.sin(p * Math.PI) * 0.25;
        this.toy.flag.position.x = 0.8 + 0.05 * e;
        this.toy.flag.scale.setScalar(Math.max(0.01, e + over * 0.4));
      });
      this.tween(t, 1900, (p) => this.fly(p));
      this.tween(t + 60, 700, (p) => {
        if (p > 0.05) {
          g.face.color.copy(g.skin.clone().lerp(new T.Color("#4a4a52"), 0.72 * Math.min(1, p * 3)));
          g.spikes.visible = true;
          g.spikes.scale.setScalar(0.3 + 0.7 * Math.min(1, p * 2.5));
          g.mouth.visible = false;
          g.gasp.visible = true;
          g.stars.visible = true;
        }
        g.stars.rotation.y = p * 7;
        g.body.position.y = Math.sin(Math.min(1, p * 2) * Math.PI) * 0.35;
        g.head.rotation.z = Math.sin(p * Math.PI * 4) * 0.12 * (1 - p);
        g.hat.position.set(0.06 + 0.24 * p, 0.36 + Math.sin(p * Math.PI) * 0.6 - 0.14 * p, 0);
        g.hat.rotation.z = -0.18 - 0.72 * p;
      });
      t += 1900;
      once(t - 10, () => this.settleConfetti());
    }
    if (s.winner === null) {
      // Pass it on round the table: the toy floats over to the next one up.
      const from = this.held(seat),
        to = this.held(s.seat),
        next = this.guests[s.seat];
      once(t, () => {
        this.toy.flag.visible = false;
        this.resting(g);
      });
      this.tween(t, RR.PASS_MS, (p) => {
        const e = smooth(p),
          q = new T.Vector3(from.x + (to.x - from.x) * e, from.y + Math.sin(e * Math.PI) * 0.7, from.z + (to.z - from.z) * e);
        this.aimToy(e < 0.5 ? seat : s.seat, s);
        this.toy.pivot.position.copy(q);
        this.toy.hammer.rotation.z = 0;
        this.toy.trigger.rotation.z = 0;
        if (p > 0.6) this.holdHands(next);
      });
      t += RR.PASS_MS;
    } else {
      const champ = s.champion;
      once(t, () => {
        this.onKnock?.("pocket", 1);
        this.toy.flag.visible = false;
        this.restToy(s);
      });
      if (champ !== null) {
        const w = this.guests[champ];
        this.tween(t, 1000, (p) => {
          w.body.position.y = Math.abs(Math.sin(p * Math.PI * 3)) * 0.3 * (1 - p * 0.5);
          this.reach(w, [new T.Vector3(-0.55, 1.4 + Math.sin(p * 20) * 0.1, -0.2), new T.Vector3(0.55, 1.4 + Math.cos(p * 20) * 0.1, -0.2)]);
        });
        t += 1000;
      }
    }
    return true;
  }
  // ── Confetti ──────────────────────────────────────────────────────────────────────────────────────────────────
  private burstFrom = new T.Vector3();
  private burst(seat: number) {
    const way = seatWay(seat),
      at = this.held(seat);
    this.burstFrom.set(at.x, at.y + 0.9 * RR.TOY_SCALE, at.z);
    let seed = (seat + 1) * 7919 + (this.state?.ply ?? 0) * 104729;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    this.bits.forEach((b) => {
      b.p.copy(this.burstFrom);
      // Mostly up and over the holder (a party popper turned back on its owner), spreading wide.
      const a = rnd() * Math.PI * 2,
        r = 1.2 + rnd() * 2.8;
      b.v.set(Math.cos(a) * r + way.x * 1.4, 3.6 + rnd() * 3.2, Math.sin(a) * r + way.z * 1.4);
      b.r.set(rnd() * 6, rnd() * 6, rnd() * 6);
      b.w.set(rnd() * 14 - 7, rnd() * 14 - 7, rnd() * 14 - 7);
      b.rest = false;
    });
    this.confetti.count = CONFETTI;
    this.flyTime = 0;
  }
  private flyTime = 0;
  private fly(p: number) {
    const t = p * 1.9,
      dt = Math.max(0, Math.min(0.1, t - this.flyTime));
    this.flyTime = t;
    this.bits.forEach((b, i) => {
      if (!b.rest) {
        // Air slows a paper bit fast; it flutters down.
        b.v.y -= 9.8 * dt * 0.55;
        b.v.multiplyScalar(Math.pow(0.32, dt));
        b.v.y = Math.max(b.v.y, -1.3);
        b.p.addScaledVector(b.v, dt);
        b.r.x += b.w.x * dt;
        b.r.y += b.w.y * dt;
        b.r.z += b.w.z * dt;
        const ground = Math.hypot(b.p.x, b.p.z) < RR.TABLE_R ? 0.012 : RR.FLOOR_Y + 0.02;
        if (b.p.y <= ground) {
          b.p.y = ground;
          b.rest = true;
          b.r.set(-Math.PI / 2, b.r.y, 0);
        }
      }
      this.dummy.position.copy(b.p);
      this.dummy.rotation.copy(b.r);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }
  /** Brings every bit still in the air down where it would fall, so that it lies on the table or floor. */
  private settleConfetti() {
    this.bits.forEach((b, i) => {
      if (!b.rest) {
        const ground = Math.hypot(b.p.x, b.p.z) < RR.TABLE_R ? 0.012 : RR.FLOOR_Y + 0.02;
        b.p.y = ground;
        b.rest = true;
        b.r.set(-Math.PI / 2, b.r.y, 0);
      }
      this.dummy.position.copy(b.p);
      this.dummy.rotation.copy(b.r);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }
  private clearConfetti() {
    this.confetti.count = 0;
  }
  dispose() {
    cancelAnimationFrame(this.holdFrame);
    super.dispose();
  }
}

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
