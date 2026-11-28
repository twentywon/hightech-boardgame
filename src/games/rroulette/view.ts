import * as T from "three";
import { grain, grainUV } from "../../engine/grain";
import { block, glossy, planks, stuff } from "../../engine/scene-utils";
import { lifelike, place, smooth as smoothed } from "../../engine/lifelike";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { CHAMBERS, PULL, SEATS, type State } from "./rules";
import { RR } from "./layout";
import { blink, buildPerson, feel, reachArm, type Look, type Person } from "./figure";

/** The sides' colours (my party hat and the first other's), for the panel. */
export const RR_COLORS: [string, string] = ["#e0453a", "#2f7fd8"];
/** Each seat's party hat and shirt, as the seat sits round the table seen from my device (0 is me). */
const HATS = ["#e0453a", "#2f7fd8", "#f2b81f", "#3fae5a"];
/** Each seat's own person: skin, hair and its style, eyes, a jacket in the seat's colour over a shirt, and the felt hat. */
const LOOKS: Look[] = [
  { skin: "#f0c4a0", hair: "#3b2618", style: 0, eyes: "#5a3a22", jacket: "#8e2a24", shirt: "#f2ede4", hat: HATS[0], neck: 0, trousers: "#2a2420" },
  { skin: "#e2a982", hair: "#7a4524", style: 1, eyes: "#3f6f8a", jacket: "#24497e", shirt: "#e9eef5", hat: HATS[1], neck: 1, trousers: "#22242c" },
  { skin: "#c98d64", hair: "#17141a", style: 2, eyes: "#3a2516", jacket: "#9c7414", shirt: "#f4efe2", hat: HATS[2], neck: 2, trousers: "#2b2620" },
  { skin: "#9c6646", hair: "#d8ad5c", style: 3, eyes: "#5b6a3a", jacket: "#2d6b3c", shirt: "#efe8dc", hat: HATS[3], neck: 1, trousers: "#26261f" },
];
const PEOPLE = ["나", "왼쪽", "맞은편", "오른쪽"];
/** Where the felt hat sits on a head, and its tilt. */
const HAT = { x: 0.03, y: 0.27, z: 0.02, tilt: -0.14 };
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
  mouth: T.Group;
  gasp: T.Group;
  stars: T.Group;
  person: Person;
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
  /** The crane the cylinder swings out on to be loaded, and the cartridge that goes in. */
  crane: T.Group;
  round: T.Group;
  /** The muzzle's flash (and the cylinder gap's), its light, and the puffs of smoke. */
  flash: T.Group;
  light: T.PointLight;
  smoke: T.Sprite[];
  tip: T.Object3D;
}

/**
 * 러시안 룰렛's back room at night (the user asked for a dark mood): brick walls, a red neon sign and wall lamps
 * glowing in the dark, one lamp hanging low over a round table of reddish wood with a pale ring on it, a candle, nuts
 * and glasses of pop round the edge, and up to four players in felt hats round it (me near, my left, across, my right;
 * a closed seat an empty chair). The gun is a real revolver (the user asked for a real bullet instead of the toy's
 * 펑): blued steel, a fluted cylinder of six chambers on a crane, hammer, trigger guard and a walnut grip. At the start
 * of a round the cylinder swings out, a brass cartridge goes into a chamber, and it swings back and is spun. Whoever's
 * turn it is holds it to the right temple (the user asked). A pull cocks the hammer and squeezes the trigger slowly
 * while a heart beats; a click (철컥) turns the cylinder a chamber on; a shot (탕) flashes at the muzzle and the
 * cylinder gap, kicks the gun up and leaves smoke curling, and flings the one holding it off the chair like a rag doll,
 * tumbling through the air limp and landing flat on the floor with its legs in the air, where it lies for the rest of
 * the game. Nothing is shown on the head: no blood, no wound (kept non-graphic on purpose); the flash and the fling tell it.
 * No words tell each pull (the user asked): the gun and the faces do; only the game's end is said.
 *
 * I may also press and hold the gun itself: the trigger comes back as I hold, and goes off when it is all the way in
 * (let go before, and nothing happens). In the middle of the table a card shows the chambers fired since the last
 * spin, so the chance of a shot can be read off it.
 */
export class RRouletteView extends TableView<State> {
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private guests: Guest[] = [];
  /** The chairs' wood, one paint for all four. */
  private chairWood?: T.MeshStandardMaterial;
  private toy: Toy;
  private card: { ctx: CanvasRenderingContext2D; texture: T.CanvasTexture; said: string };
  private dummy = new T.Object3D();
  /** The trigger held in, 0 to 1, while I press the toy; the move it makes then needs no squeeze of its own. */
  private squeeze = 0;
  private holding = false;
  private heldPull = false;
  private holdFrame = 0;
  private heartAt = 0;
  /** The lifelike look (fine shapes, photographed stuffs, a real room's light), on every device for now (`lifelike`). */
  private rich = lifelike();
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#0b0706");
    const keep: Own = (r) => this.own(r);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -0.0);
    this.lights();
    this.room(keep);
    this.table(keep);
    for (let seat = 0; seat < SEATS; seat++) this.guests.push(this.guest(seat, keep));
    this.toy = this.makeToy(keep);
    const { c, ctx } = canvasOf(512, 512),
      texture = keep(new T.CanvasTexture(c));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    this.card = { ctx, texture, said: "" };
    const disc = this.add(new T.CylinderGeometry(0.62, 0.62, 0.03, 48), [this.standard({ color: "#fffaf0", roughness: 0.5 }), this.standard({ map: texture, roughness: 0.55 }), this.standard({ color: "#fffaf0" })], 0, 0.035, 0);
    disc.rotation.y = Math.PI / 2;
    disc.castShadow = false;
    this.begin();
    // The lifelike look: the light of a warm wooden bar room, low (the back room stays dark), film-like tone.
    if (this.rich) place(this.renderer, this.scene, "saloon", 0.22, { exposure: 1.15 });
    // Now and then someone blinks (two frames drawn, no tween, so nothing waits on it).
    this.blinker = setInterval(() => this.blinkSome(), 250);
  }
  private blinker: ReturnType<typeof setInterval>;
  private blinkSome() {
    if (this.disposed || document.hidden || capturing()) return;
    for (const g of this.guests) {
      if (!g.body.visible || Math.random() > 0.065) continue;
      blink(g.person, true);
      this.redraw();
      setTimeout(() => {
        if (this.disposed) return;
        blink(g.person, false);
        this.redraw();
      }, 110 + Math.random() * 60);
    }
  }
  // The lifelike look brings its own light (`place`); the plain look keeps the tables' photographic one.
  protected photographic() {
    return !this.rich;
  }
  protected subject(aspect: number): TableSubject {
    // A tall screen (a phone held upright) has the guests at the sides close in; a wide one shows the room round them.
    return aspect < 1 ? { ...RR.SUBJECT, half: 4.7, halfZ: 4.4 } : RR.SUBJECT;
  }
  // ── The room ──────────────────────────────────────────────────────────────────────────────────────────────────
  /**
   * The back room at night (the user asked for a dark mood like a picture of a smoky bar): one hanging lamp pools warm
   * light on the table, a red neon sign and two wall lamps glow against brick in the dark, and a low warm light off the
   * table lights the faces from below. One light casts shadows (the lamp), as the room's sun did before.
   */
  private lights() {
    this.scene.fog = new T.Fog("#0d0807", 11, 24);
    this.scene.add(new T.HemisphereLight("#5e4a54", "#1c120e", 0.78));
    const lamp = new T.SpotLight("#ffc48a", 80, 18, 0.62, 0.6, 1.25);
    lamp.position.set(0, 6.4, 0.2);
    lamp.target.position.set(0, -0.4, 0.2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.near = 1;
    lamp.shadow.camera.far = 14;
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    // The neon's red on the back wall, a wall lamp's orange at the left, and the table's warm glow from below.
    const neon = new T.PointLight("#ff3a2e", 10, 11, 1.5);
    neon.position.set(3.4, RR.FLOOR_Y + 2.8, -6.2);
    const sconce = new T.PointLight("#ff8a3c", 6, 10, 1.6);
    sconce.position.set(-6.4, RR.FLOOR_Y + 3.1, -5.6);
    const under = new T.PointLight("#ff9b5c", 3.4, 6.5, 1.5);
    under.position.set(0, 0.45, 0.2);
    this.scene.add(neon, under);
    // Each lamp costs every lit pixel its sum: where the processor draws, the wall lamps' orange is their halos alone,
    // so that the room has as many lights as the party had and draws as fast.
    if (this.rich) this.scene.add(sconce);
  }
  /** A soft round glow (a lamp's halo in the haze), drawn over everything else and never fogged. */
  private halo(color: string, size: number, x: number, y: number, z: number) {
    const { c, ctx } = canvasOf(128, 128),
      g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.25, color.replace(/[\d.]+\)$/, "0.35)"));
    g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const map = this.own(new T.CanvasTexture(c));
    map.colorSpace = T.SRGBColorSpace;
    const glow = new T.Sprite(this.own(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })));
    glow.scale.set(size, size, 1);
    glow.position.set(x, y, z);
    this.scene.add(glow);
    return glow;
  }
  private room(keep: Own) {
    const FLOOR = RR.FLOOR_Y;
    // Old dark boards underfoot, and a worn maroon rug under the table.
    const floor = this.add(new T.PlaneGeometry(30, 22), this.standard({ ...planks(5, keep, 3.6), color: "#6b5546" }), 0, FLOOR, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const { c: rugC, ctx: rug } = canvasOf(512, 512);
    rug.fillStyle = "#3a1416";
    rug.beginPath();
    rug.arc(256, 256, 256, 0, Math.PI * 2);
    rug.fill();
    rug.strokeStyle = "#7a4a2a";
    rug.lineWidth = 10;
    for (const r of [236, 214]) {
      rug.beginPath();
      rug.arc(256, 256, r, 0, Math.PI * 2);
      rug.stroke();
    }
    // Wear: lighter scuffs where chairs are drawn back and forth.
    for (let k = 0; k < 900; k++) {
      const a = (k * 2.399) % (Math.PI * 2),
        r = 60 + ((k * 97) % 180);
      rug.fillStyle = `rgba(120, 70, 60, ${0.05 + (k % 5) * 0.02})`;
      rug.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 3, 3);
    }
    const rugMap = keep(new T.CanvasTexture(rugC));
    rugMap.colorSpace = T.SRGBColorSpace;
    const mat = this.add(new T.CircleGeometry(5.4, 64), this.standard({ map: rugMap, roughness: 1 }), 0, FLOOR + 0.01, 0);
    mat.rotation.x = -Math.PI / 2;
    mat.castShadow = false;
    // Brick walls behind and at the sides, and a low ceiling's beams lost in the dark.
    const brick = this.standard({ ...stuff("brick", "#6a3a2c", 6, keep, 2.4), roughness: 0.95 }),
      sideBrick = this.standard({ ...stuff("brick", "#5a3226", 4.2, keep, 2.4), roughness: 0.95 });
    const back = this.add(new T.PlaneGeometry(26, 10), brick, 0, FLOOR + 5, -7.2);
    back.castShadow = false;
    for (const s of [-1, 1]) {
      const w = this.add(new T.PlaneGeometry(18, 10), sideBrick, s * 9.5, FLOOR + 5, 1.8);
      w.rotation.y = -s * Math.PI / 2;
      w.castShadow = false;
    }
    const beam = this.standard({ ...grain(keep, "#3a2618", { kind: "dark" }), roughness: 0.8 });
    for (const z of [-5.5, -2.5, 0.5]) this.add(grainUV(block(19, 0.4, 0.5, 0.03), 1.6, 0), beam, 0, FLOOR + 8.2, z).castShadow = false;
    // A brick pillar at the back right.
    this.add(new T.BoxGeometry(1.3, 10, 1.3), this.standard({ ...stuff("brick", "#5e3428", 1, keep, 7), roughness: 0.95 }), 6.6, FLOOR + 5, -6.4).castShadow = false;
    // The red neon sign: 행운의 6, its tube drawn glowing on the dark wall.
    const { c: neonC, ctx: n } = canvasOf(1024, 256);
    n.font = `800 132px ${FONT}`;
    n.textAlign = "center";
    n.textBaseline = "middle";
    for (const [blur, colour, width] of [
      [38, "rgba(255, 50, 40, 0.9)", 18],
      [16, "rgba(255, 90, 70, 1)", 9],
      [0, "rgba(255, 220, 210, 1)", 3],
    ] as const) {
      n.shadowColor = "rgba(255, 40, 30, 1)";
      n.shadowBlur = blur;
      n.strokeStyle = colour;
      n.lineWidth = width;
      n.lineJoin = "round";
      n.strokeText("행운의 6", 512, 132);
    }
    const neonMap = keep(new T.CanvasTexture(neonC));
    neonMap.colorSpace = T.SRGBColorSpace;
    const sign = this.add(new T.PlaneGeometry(3.4, 0.85), this.own(new T.MeshBasicMaterial({ map: neonMap, transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending })), 3.4, FLOOR + 2.75, -7.12);
    sign.castShadow = sign.receiveShadow = false;
    this.halo("rgba(255, 60, 40, 0.4)", 5, 3.4, FLOOR + 2.75, -7.0);
    // Wall lamps: a shade on a bracket, its bulb glowing, a halo in the haze.
    const metal = this.standard({ color: "#2c2a28", metalness: 0.7, roughness: 0.4 }),
      bulbLit = this.own(new T.MeshBasicMaterial({ color: "#ffd0a0", fog: false }));
    for (const [x, z, rot] of [
      [-6.4, -7.0, 0],
      [-9.35, -1.0, Math.PI / 2],
      [9.35, -2.6, -Math.PI / 2],
    ] as const) {
      const lampGroup = new T.Group();
      lampGroup.position.set(x, FLOOR + 3.1, z);
      lampGroup.rotation.y = rot;
      this.scene.add(lampGroup);
      this.add(new T.BoxGeometry(0.1, 0.5, 0.1), metal, 0, 0, 0.05, lampGroup).castShadow = false;
      this.add(new T.CylinderGeometry(0.12, 0.3, 0.32, 20, 1, true), this.standard({ color: "#7a1e18", roughness: 0.6, side: T.DoubleSide, emissive: "#ff5a2a", emissiveIntensity: 0.35 }), 0, 0.12, 0.3, lampGroup).castShadow = false;
      this.add(new T.SphereGeometry(0.08, 12, 10), bulbLit, 0, 0.04, 0.3, lampGroup).castShadow = false;
    }
    this.halo("rgba(255, 130, 60, 0.55)", 2.6, -6.4, FLOOR + 3.15, -6.7);
    this.halo("rgba(255, 130, 60, 0.55)", 2.6, -9.05, FLOOR + 3.15, -1.0);
    this.halo("rgba(255, 130, 60, 0.55)", 2.6, 9.05, FLOOR + 3.15, -2.6);
    // A dark sideboard at the back with crates, bottles of fizzy pop and an old radio.
    const cab = this.standard({ ...grain(keep, "#3b261a", { kind: "dark" }), roughness: 0.6 });
    this.add(grainUV(block(4.2, 1.6, 0.9, 0.05), 1.4), cab, -3.6, FLOOR + 0.8, -6.5);
    this.add(grainUV(block(4.3, 0.08, 1.0, 0.03), 1.4), this.standard({ ...grain(keep, "#5a3a24"), roughness: 0.45 }), -3.6, FLOOR + 1.64, -6.5);
    const crate = this.standard({ ...grain(keep, "#8a6440"), roughness: 0.8 });
    this.add(grainUV(block(0.9, 0.6, 0.6, 0.02), 0.8), crate, -4.9, FLOOR + 1.98, -6.45);
    this.add(grainUV(block(0.7, 0.45, 0.5, 0.02), 0.8), crate, -4.75, FLOOR + 2.51, -6.45).rotation.y = 0.2;
    const glass = ["#1f4a2a", "#5a2a14", "#1c2a44"].map((color) => keep(glossy({ color, roughness: 0.15, transparent: true, opacity: 0.85 }, 0.6)));
    for (let k = 0; k < 7; k++) {
      const x = -3.7 + k * 0.28,
        m = this.add(new T.CylinderGeometry(0.08, 0.1, 0.5, 14), glass[k % 3], x, FLOOR + 1.93, -6.55 + (k % 2) * 0.12);
      this.add(new T.CylinderGeometry(0.03, 0.06, 0.18, 10), glass[k % 3], x, FLOOR + 2.27, m.position.z);
    }
    const radio = this.standard({ ...grain(keep, "#6a4426"), roughness: 0.5 });
    this.add(grainUV(block(1.0, 0.62, 0.45, 0.06), 0.8), radio, -2.0, FLOOR + 1.99, -6.45);
    this.add(new T.CircleGeometry(0.18, 20), this.standard({ color: "#c79a5a", emissive: "#ff9a3c", emissiveIntensity: 0.5 }), -2.2, FLOOR + 2.02, -6.22).castShadow = false;
    // Stacked crates and a barrel in the dark at the right.
    this.add(grainUV(block(1.2, 0.9, 1.0, 0.03), 0.8), crate, 7.6, FLOOR + 0.45, -4.6);
    this.add(grainUV(block(1.0, 0.8, 0.9, 0.03), 0.8), crate, 7.5, FLOOR + 1.3, -4.5).rotation.y = -0.25;
    this.add(grainUV(new T.CylinderGeometry(0.62, 0.62, 1.5, 24), 1.2, 1), this.standard({ ...grain(keep, "#5a3a22", { kind: "dark" }), roughness: 0.7 }), 8.0, FLOOR + 0.75, -2.2);
  }
  private table(keep: Own) {
    const R = RR.TABLE_R,
      FLOOR = RR.FLOOR_Y;
    // A round top of reddish wood with a pale ring painted on it, a dark rim round its edge.
    const topMat = this.standard({ ...grain(keep, "#8e3a26", { kind: "light", contrast: 1.2 }), roughness: 0.42 });
    const top = this.add(grainUV(new T.CylinderGeometry(R, R, 0.08, 72), 1.8, 0), topMat, 0, -0.04, 0);
    top.receiveShadow = true;
    const ring = this.add(new T.RingGeometry(1.55, 1.6, 96), this.standard({ color: "#e9dcc4", roughness: 0.6 }), 0, 0.002, 0);
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    const rimMat = this.standard({ ...grain(keep, "#3a1e14", { kind: "dark" }), roughness: 0.5 });
    const rim = this.add(new T.TorusGeometry(R, 0.07, 10, 96), rimMat, 0, -0.03, 0);
    rim.rotation.x = Math.PI / 2;
    this.add(new T.CylinderGeometry(R - 0.05, R - 0.3, 0.16, 72, 1, true), rimMat, 0, -0.16, 0).castShadow = false;
    // The table's foot under it.
    this.add(grainUV(new T.CylinderGeometry(0.22, 0.5, Math.abs(FLOOR) - 0.25, 24), 1.2, 1), this.standard({ ...grain(keep, "#3e2618", { kind: "dark" }), roughness: 0.5 }), 0, (FLOOR - 0.25) / 2, 0);
    // The hanging lamp over the table: a cord into the dark, a deep metal shade and its bright bulb.
    const lampY = 6.5;
    this.add(new T.CylinderGeometry(0.015, 0.015, 4, 6), this.standard({ color: "#141414" }), 0, lampY + 2.1, 0.2).castShadow = false;
    this.add(new T.CylinderGeometry(0.22, 1.05, 0.62, 40, 1, true), this.standard({ color: "#263022", metalness: 0.6, roughness: 0.45, side: T.FrontSide }), 0, lampY, 0.2).castShadow = false;
    this.add(new T.CylinderGeometry(0.21, 1.03, 0.6, 40, 1, true), this.own(new T.MeshBasicMaterial({ color: "#ffd9a8", side: T.BackSide, fog: false })), 0, lampY, 0.2).castShadow = false;
    this.add(new T.SphereGeometry(0.2, 16, 12), this.own(new T.MeshBasicMaterial({ color: "#fff3dc", fog: false })), 0, lampY - 0.25, 0.2).castShadow = false;
    this.halo("rgba(255, 200, 140, 0.7)", 3.2, 0, lampY - 0.3, 0.2);
    // A soft shaft of light in the haze under the lamp: only where a graphics card draws (see-through and large).
    if (this.rich) {
      const shaftGeo = keep(new T.CylinderGeometry(1.0, R + 0.2, lampY - 0.3, 48, 1, true)),
        colours: number[] = [],
        pos = shaftGeo.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getY(i) + (lampY - 0.3) / 2) / (lampY - 0.3);
        colours.push(0.05 * u * u, 0.036 * u * u, 0.022 * u * u);
      }
      shaftGeo.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
      const shaft = new T.Mesh(shaftGeo, this.own(new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false })));
      shaft.position.set(0, (lampY - 0.3) / 2, 0.2);
      shaft.renderOrder = 5;
      this.scene.add(shaft);
    }
    // Round the edge, between the seats: a candle in a glass, a bowl of peanuts, glasses of fizzy pop.
    const diag = (k: number, r: number) => ({ x: Math.cos(Math.PI / 4 + (k * Math.PI) / 2) * r, z: Math.sin(Math.PI / 4 + (k * Math.PI) / 2) * r });
    const ck = diag(2, R - 0.65),
      clearGlass = keep(glossy({ color: "#d8c8b0", roughness: 0.1, transparent: true, opacity: 0.35 }, 0.9));
    const cut = (n: number) => (this.rich ? n * 2 : n);
    this.add(new T.CylinderGeometry(0.17, 0.15, 0.3, cut(20), 1, true), clearGlass, ck.x, 0.15, ck.z).castShadow = false;
    this.add(new T.CylinderGeometry(0.12, 0.12, 0.16, cut(16)), this.standard({ color: "#efe3cc", roughness: 0.8 }), ck.x, 0.08, ck.z);
    this.add(new T.SphereGeometry(0.04, cut(8), cut(6)).scale(1, 1.8, 1), this.own(new T.MeshBasicMaterial({ color: "#ffcf5a", fog: false })), ck.x, 0.22, ck.z).castShadow = false;
    this.halo("rgba(255, 180, 80, 0.6)", 0.9, ck.x, 0.24, ck.z);
    const pc = diag(3, R - 0.7);
    this.add(new T.CylinderGeometry(0.4, 0.28, 0.22, cut(24), 1, true), this.standard({ color: "#2a2624", metalness: 0.6, roughness: 0.35, side: T.DoubleSide }), pc.x, 0.11, pc.z);
    const kernel = keep(new T.SphereGeometry(0.05, cut(6) + 2, cut(5)).scale(1, 0.75, 1.4)),
      nut = this.standard({ color: "#b98a52", roughness: 0.8 });
    for (let k = 0; k < 34; k++) {
      const a = k * 2.39,
        r = 0.3 * Math.sqrt((k % 17) / 17),
        m = new T.Mesh(kernel, nut);
      m.position.set(pc.x + Math.cos(a) * r, 0.2 + (k % 3) * 0.03 + (k < 17 ? 0 : 0.05), pc.z + Math.sin(a) * r);
      m.rotation.set(k, k * 2, k * 3);
      this.scene.add(m);
    }
    for (const k of [0, 1]) {
      const at = diag(k, R - 0.55);
      for (const d of [-0.25, 0.25]) {
        const x = at.x + d * (k ? 1 : -1) * 0.7,
          z = at.z + d * 0.7;
        this.add(new T.CylinderGeometry(0.12, 0.1, 0.3, cut(20), 1, true), clearGlass, x, 0.15, z).castShadow = false;
        this.add(new T.CylinderGeometry(0.11, 0.095, 0.2, cut(18)), this.standard({ color: k ? "#c26a1e" : "#6a2a1a", roughness: 0.15, emissive: k ? "#5a2a08" : "#2a0a04", emissiveIntensity: 0.6 }), x, 0.1, z);
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
    // Real wood (the photograph of oak graded to the chair's colour), its grain along each piece.
    const wood = this.chairWood ??= this.standard({ ...grain(keep, "#c58b5b"), roughness: 0.55 });
    this.add(grainUV(block(1.1, 0.1, 1.0, 0.03), 0.9, 0), wood, 0, RR.FLOOR_Y + 1.15, 0.15, chair);
    for (const [x, z] of [
      [-0.45, -0.25],
      [0.45, -0.25],
      [-0.45, 0.55],
      [0.45, 0.55],
    ])
      this.add(grainUV(new T.CylinderGeometry(0.04, 0.04, 1.15, 8), 0.9), wood, x, RR.FLOOR_Y + 0.575, z, chair);
    this.add(grainUV(block(1.1, 1.2, 0.08, 0.03), 0.9, 1), wood, 0, RR.FLOOR_Y + 1.8, 0.66, chair);
    const body = new T.Group();
    root.add(body);
    const person = buildPerson(body, LOOKS[seat], seat * 37 + 11, keep, this.rich, RR.HEAD_Y, RR.SHOULDER_Y);
    const { head, face, hat, spikes, mouth, gasp, stars } = person,
      skin = new T.Color(LOOKS[seat].skin);
    // The name over the head.
    const { c: tagC, ctx: _tag } = canvasOf(512, 160),
      tagMap = keep(new T.CanvasTexture(tagC));
    tagMap.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(this.own(new T.SpriteMaterial({ map: tagMap, depthWrite: false, transparent: true, fog: false })));
    sprite.scale.set(1.6, 0.5, 1);
    sprite.position.set(way.x * RR.SEAT_R, RR.HEAD_Y + 1.15, way.z * RR.SEAT_R);
    // Mine stands at my left, low: over my head it would cover the toy held up before me.
    if (seat === 0) {
      sprite.position.set(-1.75, RR.HEAD_Y + 0.15, RR.SEAT_R);
      sprite.scale.set(1.3, 0.41, 1);
    }
    sprite.renderOrder = 10;
    this.scene.add(sprite);
    return { root, body, head, face, skin, hat, spikes, mouth, gasp, stars, person, tag: { canvas: tagC, texture: tagMap, sprite, said: "" }, chair };
  }
  /** Puts a guest's hands at `hands` (two places in the guest's own frame), the arms bent at the elbows to reach; `grip` closes the right. */
  private reach(g: Guest, hands: [T.Vector3, T.Vector3], grip = false) {
    g.person.arms.forEach((arm, k) => reachArm(arm, hands[k], grip && k === 1));
  }
  /** Where a guest's hands rest on the table. */
  private resting(g: Guest) {
    this.reach(g, [new T.Vector3(-0.5, 0.1, -1.05), new T.Vector3(0.5, 0.1, -1.05)]);
  }
  /** The right hand on the toy's grip (wherever the toy now stands), the left resting on the table. */
  private holdHands(g: Guest) {
    this.toy.pivot.updateMatrixWorld(true);
    g.root.updateMatrixWorld(true);
    const at = g.root.worldToLocal(this.toy.grip.getWorldPosition(new T.Vector3()));
    this.reach(g, [new T.Vector3(-0.5, 0.1, -1.05), at], true);
  }
  /** How one flung off by a shot lies on the floor: on its back with its head away to its left, its legs in the air. */
  private static readonly LYING = new T.Quaternion()
    .setFromAxisAngle(new T.Vector3(0, 1, 0), -Math.PI / 2)
    .multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2));
  private static readonly LIE_AT = new T.Vector3(RR.LIE_X, RR.FLOOR_Y + 0.3, RR.LIE_Z);
  /** Lays a guest flat on the floor beside its chair, arms flung wide and the head lolled (`k` 1); less of the loll as `k` is less. */
  private lie(g: Guest, k: number) {
    g.body.position.copy(RRouletteView.LIE_AT);
    g.body.quaternion.copy(RRouletteView.LYING);
    g.head.rotation.set(0.25 * k, 0.5 * k, 0.3 * k);
    this.reach(g, [new T.Vector3(-1.0, 0.75, -0.35), new T.Vector3(1.0, 0.95, 0.05)]);
  }
  /**
   * The fling (the user asked: flung away limp, as if shot): off the chair to its left and back, cartwheeling once
   * through the air with its arms and head flopping loose, then flat on its back on the floor with a bounce (`p` 0 to 1).
   */
  private fling(g: Guest, p: number) {
    const LAND = 0.78,
      end = RRouletteView.LIE_AT,
      body = g.body;
    if (p < LAND) {
      const u = p / LAND;
      // Thrown hard: fast off the chair, slowing as it goes; up in an arc and down onto the floor.
      const h = 1 - (1 - u) * (1 - u) * 0.6 - 0.4 * (1 - u);
      body.position.set(end.x * h, end.y * u + 4 * 1.25 * u * (1 - u), end.z * h);
      const spin = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI * 2 * smooth(u));
      body.quaternion.identity().slerp(RRouletteView.LYING, smooth(u)).multiply(spin);
      // Loose as a rag doll: the arms flail and the head flops.
      this.reach(g, [
        new T.Vector3(-0.8 + 0.3 * Math.sin(u * 19), 0.85 + 0.45 * Math.cos(u * 23), -0.15 + 0.35 * Math.sin(u * 13)),
        new T.Vector3(0.8 + 0.3 * Math.cos(u * 17), 0.95 + 0.45 * Math.sin(u * 21), 0.1 + 0.35 * Math.cos(u * 11)),
      ]);
      g.head.rotation.set(Math.cos(u * 17) * 0.35, Math.sin(u * 13) * 0.3, Math.sin(u * 21) * 0.5);
      return;
    }
    // Down: a bounce off the floor, the limbs settling.
    const v = (p - LAND) / (1 - LAND),
      bob = Math.sin(Math.PI * Math.min(1, v * 1.4)) * (1 - v);
    this.lie(g, smooth(v));
    body.position.y += bob * 0.25;
    body.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -bob * 0.3));
  }
  /** A guest's look: in the game or out (sooty, hair on end), and its name tag. */
  private dress(g: Guest, seat: number, s: State) {
    const out = s.out[seat],
      empty = !s.seated[seat];
    g.body.visible = !empty;
    g.tag.sprite.visible = !empty && !capturing();
    // (Nothing is shown on the head of one who was shot: no soot, no wound; only the fall tells it.)
    g.face.color.copy(g.skin);
    g.spikes.visible = false;
    g.stars.visible = false;
    g.mouth.visible = !out;
    g.gasp.visible = out;
    g.hat.rotation.z = out ? -1.15 : HAT.tilt;
    g.hat.position.set(out ? 0.4 : HAT.x, out ? 0.08 : HAT.y, out ? 0.12 : HAT.z);
    feel(g.person, out ? { shock: 0.6 } : {});
    g.head.rotation.set(0, 0, 0);
    g.body.position.set(0, 0, 0);
    g.body.quaternion.identity();
    // One who was shot lies where the fling left it, on the floor beside its chair.
    if (out && !empty) this.lie(g, 1);
    else if (s.seat === seat && s.winner === null) this.holdHands(g);
    else this.resting(g);
    this.tagOf(g, seat, s);
  }
  private tagOf(g: Guest, seat: number, s: State) {
    const out = s.out[seat],
      turn = s.seat === seat && s.winner === null,
      champ = s.champion === seat,
      line = champ ? "우승!" : out ? "탈락" : `돌리기 ${s.spins[seat]}번`,
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
    const rich = this.rich,
      fine = (n: number) => (rich ? n : Math.max(8, Math.round(n * 0.5))),
      // Blued steel, worn a little; the bore and the chambers' dark insides; brass and the lead of a round.
      // (Smooth blued steel: the room's light gives it its sheen; a photographed plate's relief read as engraving.)
      steel = this.standard({ color: rich ? "#5b626e" : "#4a505a", metalness: rich ? 0.95 : 0.85, roughness: rich ? 0.3 : 0.35 }),
      bright = this.standard({ color: "#8d939c", metalness: 1, roughness: 0.22 }),
      bore = this.standard({ color: "#050506", roughness: 0.9 }),
      brass = this.standard({ color: "#c9973a", metalness: 1, roughness: 0.28 }),
      lead = this.standard({ color: "#8a8478", metalness: 0.6, roughness: 0.45 }),
      walnut = this.standard({ ...grain(keep, "#4a2a18", { kind: "walnut", rich, contrast: 1.6 }), roughness: 0.38 });
    const along = (geo: T.BufferGeometry) => geo.rotateZ(-Math.PI / 2);
    const part = (geo: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = gun) => this.add(rich ? smoothed(geo, 0.9) : geo, m, x, y, z, parent);
    // The barrel: a round tube with a rib on top, the front sight, the muzzle's dark bore, the ejector rod's shroud under it.
    part(along(new T.CylinderGeometry(0.05, 0.054, 0.56, fine(32))), steel, 0.43, 0.085, 0);
    part(block(0.54, 0.035, 0.05, 0.012), steel, 0.43, 0.135, 0);
    part(block(0.035, 0.05, 0.016, 0.006), steel, 0.69, 0.16, 0);
    part(along(new T.CylinderGeometry(0.029, 0.029, 0.4, fine(24))), steel, 0.38, 0.015, 0);
    part(along(new T.CylinderGeometry(0.018, 0.018, 0.02, fine(16))), bright, 0.585, 0.015, 0);
    const tip = part(along(new T.CylinderGeometry(0.056, 0.056, 0.012, fine(32))), steel, 0.715, 0.085, 0);
    part(along(new T.CylinderGeometry(0.022, 0.022, 0.016, fine(16))), bore, 0.719, 0.085, 0);
    // The frame round the cylinder: its window, the top strap over it, the recoil shield behind it.
    part(block(0.44, 0.07, 0.11, 0.025), steel, -0.02, -0.105, 0);
    part(block(0.34, 0.05, 0.1, 0.02), steel, 0.0, 0.155, 0);
    part(block(0.08, 0.3, 0.11, 0.03), steel, 0.17, 0.02, 0);
    part(along(new T.CylinderGeometry(0.15, 0.15, 0.06, fine(36))), steel, -0.165, 0.0, 0);
    part(block(0.12, 0.24, 0.11, 0.03), steel, -0.23, 0.02, 0);
    // The cylinder on its crane (it swings out to the left to be loaded): six chambers, fluted between them.
    const crane = new T.Group();
    crane.position.set(0, -0.085, 0);
    gun.add(crane);
    const drum = new T.Group();
    drum.position.set(0, 0.075, 0);
    crane.add(drum);
    const outline = new T.Shape(),
      R = 0.142,
      cut = 0.036,
      steps = fine(96);
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      // A flute between each two chambers: a shallow round groove along the cylinder.
      let r = R;
      for (let k = 0; k < CHAMBERS; k++) {
        const f = ((k + 0.5) / CHAMBERS) * Math.PI * 2,
          d = Math.atan2(Math.sin(a - f), Math.cos(a - f));
        if (Math.abs(d) < 0.2) r = Math.min(r, R - cut * Math.cos((d / 0.2) * (Math.PI / 2)));
      }
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      if (i) outline.lineTo(x, y);
      else outline.moveTo(x, y);
    }
    for (let k = 0; k < CHAMBERS; k++) {
      const a = (k / CHAMBERS) * Math.PI * 2,
        hole = new T.Path();
      hole.absarc(Math.cos(a) * 0.088, Math.sin(a) * 0.088, 0.031, 0, Math.PI * 2, true);
      outline.holes.push(hole);
    }
    const body = new T.ExtrudeGeometry(outline, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: rich ? 3 : 1, curveSegments: fine(24) })
      .translate(0, 0, -0.12)
      .rotateY(Math.PI / 2);
    // (The shape lies in y and -z: turned so that its first chamber stands at the top, like the old cylinder's.)
    body.rotateX(Math.PI / 2);
    part(body, steel, 0, 0, 0, drum);
    for (let k = 0; k < CHAMBERS; k++) {
      const a = (k / CHAMBERS) * Math.PI * 2;
      // The chambers' dark insides.
      part(along(new T.CylinderGeometry(0.03, 0.03, 0.2, fine(16))), bore, 0, Math.cos(a) * 0.088, Math.sin(a) * 0.088, drum);
    }
    part(along(new T.CylinderGeometry(0.03, 0.03, 0.27, fine(16))), bright, 0, 0, 0, drum);
    // The cartridge that is loaded: a brass case with its rim, the lead bullet's round nose. Hidden once loaded.
    const round = new T.Group();
    drum.add(round);
    part(along(new T.CylinderGeometry(0.028, 0.028, 0.2, fine(20))), brass, 0, 0, 0, round);
    part(along(new T.CylinderGeometry(0.035, 0.035, 0.014, fine(20))), brass, -0.105, 0, 0, round);
    part(new T.SphereGeometry(0.027, fine(20), fine(12), 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(1.6, 1, 1), lead, 0.1, 0, 0, round);
    round.visible = false;
    // The hammer at the back, on its pivot: its body and the chequered spur.
    const hammer = new T.Group();
    hammer.position.set(-0.24, 0.12, 0);
    gun.add(hammer);
    part(block(0.05, 0.13, 0.045, 0.015), steel, -0.01, 0.055, 0, hammer).rotation.z = 0.4;
    part(block(0.085, 0.03, 0.06, 0.012), steel, -0.06, 0.115, 0, hammer).rotation.z = 0.25;
    // The trigger guard and the trigger, on a pivot.
    const guard = part(new T.TorusGeometry(0.085, 0.014, fine(12), fine(32), Math.PI * 1.2), steel, -0.06, -0.19, 0);
    guard.rotation.z = Math.PI * 0.98;
    guard.scale.set(1.15, 0.9, 1.2);
    const trigger = new T.Group();
    trigger.position.set(-0.04, -0.14, 0);
    gun.add(trigger);
    const t = part(new T.TorusGeometry(0.07, 0.011, fine(10), fine(16), Math.PI * 0.5), bright, 0.03, -0.06, 0, trigger);
    t.rotation.z = Math.PI * 0.95;
    t.scale.set(1, 1, 2.2);
    // The grip: the frame's backstrap and two walnut panels, raked back and down, a steel butt.
    const grip = new T.Group();
    grip.position.set(-0.24, -0.08, 0);
    grip.rotation.z = 0.32;
    gun.add(grip);
    part(grainUV(block(0.15, 0.4, 0.13, 0.05), 0.4, 1), walnut, -0.015, -0.2, 0, grip);
    part(block(0.04, 0.41, 0.09, 0.015), steel, -0.085, -0.2, 0, grip);
    part(block(0.16, 0.035, 0.12, 0.015), steel, -0.02, -0.41, 0, grip);
    // A screw through the panels.
    for (const z of [-0.066, 0.066]) part(new T.CylinderGeometry(0.012, 0.012, 0.006, fine(12)).rotateX(Math.PI / 2), bright, -0.01, -0.18, z, grip);
    const hold = new T.Object3D();
    hold.position.set(-0.02, -0.23, 0);
    grip.add(hold);
    // The shot: a flash at the muzzle and at the cylinder's gap, a burst of light, and puffs of smoke.
    const flash = new T.Group();
    gun.add(flash);
    const { c, ctx } = canvasOf(128, 128),
      burst = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    burst.addColorStop(0, "rgba(255,250,225,1)");
    burst.addColorStop(0.18, "rgba(255,214,120,0.95)");
    burst.addColorStop(0.45, "rgba(255,140,40,0.45)");
    burst.addColorStop(1, "rgba(255,90,20,0)");
    ctx.fillStyle = burst;
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2,
        r = k % 2 ? 26 : 64;
      ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    ctx.fill();
    const flashMap = keep(new T.CanvasTexture(c));
    flashMap.colorSpace = T.SRGBColorSpace;
    const flashMat = this.own(new T.SpriteMaterial({ map: flashMap, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    for (const [x, y, size] of [
      [0.8, 0.085, 0.36],
      [0.15, 0.06, 0.3],
    ]) {
      const sprite = new T.Sprite(flashMat);
      sprite.position.set(x, y, 0);
      sprite.scale.setScalar(size);
      flash.add(sprite);
    }
    flash.visible = false;
    const light = new T.PointLight("#ffb860", 0, 5, 1.8);
    light.position.set(0.9, 0.1, 0);
    gun.add(light);
    const { c: sc, ctx: sx } = canvasOf(64, 64),
      puff = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
    puff.addColorStop(0, "rgba(210,205,200,0.55)");
    puff.addColorStop(0.6, "rgba(180,175,170,0.22)");
    puff.addColorStop(1, "rgba(160,160,160,0)");
    sx.fillStyle = puff;
    sx.fillRect(0, 0, 64, 64);
    const smokeMap = keep(new T.CanvasTexture(sc));
    smokeMap.colorSpace = T.SRGBColorSpace;
    const smoke: T.Sprite[] = [];
    for (let k = 0; k < 7; k++) {
      const sprite = new T.Sprite(this.own(new T.SpriteMaterial({ map: smokeMap, transparent: true, depthWrite: false, opacity: 0 })));
      sprite.visible = false;
      this.scene.add(sprite);
      smoke.push(sprite);
    }
    pivot.scale.setScalar(RR.TOY_SCALE);
    return { grip: hold, pivot, gun, drum, hammer, trigger, crane, round, flash, light, smoke, tip };
  }
  /** The toy's turn in a holder's frame at the temple: the barrel into the head from the front right, its top up. */
  private static readonly AT_HEAD = (() => {
    const x = new T.Vector3(-0.86, -0.06, 0.5).normalize(),
      y = new T.Vector3(0, 1, 0).sub(x.clone().multiplyScalar(x.y)).normalize(),
      z = new T.Vector3().crossVectors(x, y);
    return { barrel: x, turn: new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z)) };
  })();
  /**
   * Sets the toy at `seat`'s right temple (the user asked for it put to the head): its muzzle on the temple, the barrel
   * pointing in, the gun standing out to the front right where the right hand holds its grip. `lift` raises it.
   */
  private aimToy(seat: number, s: State, lift = 0) {
    const g = this.guests[seat],
      p = this.toy.pivot,
      at = RRouletteView.AT_HEAD;
    g.root.updateMatrixWorld(true);
    p.scale.setScalar(RR.TEMPLE_SCALE);
    p.quaternion.copy(g.root.quaternion).multiply(at.turn).multiply(this.toy.gun.quaternion.clone().invert());
    p.position.set(0, 0, 0);
    p.updateMatrixWorld(true);
    // The muzzle's middle a little out from the temple along the barrel.
    const tip = this.toy.tip.getWorldPosition(new T.Vector3()),
      temple = g.root.localToWorld(at.barrel.clone().multiplyScalar(-0.06 * RR.TEMPLE_SCALE).add(new T.Vector3(RR.TEMPLE_X, RR.HEAD_Y + RR.TEMPLE_UP + lift, RR.TEMPLE_Z)));
    p.position.copy(temple.sub(tip));
    this.toy.drum.rotation.x = (s.turn * Math.PI * 2) / CHAMBERS;
  }
  /** The toy's place and turn held at `seat`'s temple (the toy put back as it was). */
  private poseOf(seat: number, s: State) {
    const p = this.toy.pivot,
      was = { at: p.position.clone(), turn: p.quaternion.clone(), size: p.scale.x, drum: this.toy.drum.rotation.x };
    this.aimToy(seat, s);
    const pose = { at: p.position.clone(), turn: p.quaternion.clone() };
    p.position.copy(was.at);
    p.quaternion.copy(was.turn);
    p.scale.setScalar(was.size);
    this.toy.drum.rotation.x = was.drum;
    return pose;
  }
  /** Where the gun lies once a shot has flung its holder away: dropped onto the empty chair, tipped on its side. */
  private dropped(seat: number, s: State) {
    const held = this.poseOf(seat, s),
      g = this.guests[seat];
    g.root.updateMatrixWorld(true);
    const seatTop = g.root.localToWorld(new T.Vector3(0.15, RR.FLOOR_Y + 1.2 + 0.12, 0.2));
    return { at: new T.Vector3(held.at.x + (seatTop.x - held.at.x) * 0.6, seatTop.y, held.at.z + (seatTop.z - held.at.z) * 0.6), turn: held.turn.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 1.35)) };
  }
  /** Where the toy's cylinder is, held at `seat`'s temple (the toy put back as it was). */
  private toyAt(seat: number, s: State) {
    const p = this.toy.pivot,
      was = { at: p.position.clone(), turn: p.quaternion.clone(), size: p.scale.x, drum: this.toy.drum.rotation.x };
    this.aimToy(seat, s);
    p.updateMatrixWorld(true);
    const at = this.toy.drum.getWorldPosition(new T.Vector3());
    p.position.copy(was.at);
    p.quaternion.copy(was.turn);
    p.scale.setScalar(was.size);
    this.toy.drum.rotation.x = was.drum;
    p.updateMatrixWorld(true);
    return at;
  }
  private restToy(s: State) {
    this.toy.hammer.rotation.z = 0;
    this.toy.trigger.rotation.z = 0;
    this.toy.flash.visible = false;
    this.toy.light.intensity = 0;
    this.toy.crane.rotation.x = 0;
    this.toy.round.visible = false;
    for (const puff of this.toy.smoke) puff.visible = false;
    if (s.winner !== null) {
      // Laid down in the middle once the game is over.
      const p = this.toy.pivot;
      p.scale.setScalar(RR.TOY_SCALE);
      p.quaternion.identity();
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
    this.restToy(s);
    this.guests.forEach((g, seat) => this.dress(g, seat, s));
    this.writeCard(s);
    this.dataset(s);
    this.redraw();
  }
  /** Every pull of this game as it was shown ("seat,spun,bang,odds"), for tests to read back after the computers go on. */
  private shots: string[] = [];
  private dataset(s: State) {
    const d = this.renderer.domElement.dataset;
    if (s.ply === 0) this.shots = [];
    else if (s.last && s.ply === this.shots.length + 1) this.shots.push(`${s.last.seat},${s.last.spun ? 1 : 0},${s.last.bang ? 1 : 0},${s.last.odds}`);
    d.shots = this.shots.join(";");
    d.seat = String(s.seat);
    d.left = String(s.left);
    d.out = s.out.map((o) => (o ? 1 : 0)).join("");
    d.spins = s.spins.join(",");
    d.last = s.last ? `${s.last.seat},${s.last.spun ? 1 : 0},${s.last.bang ? 1 : 0},${s.last.odds}` : "";
    d.champion = s.champion === null ? "" : String(s.champion);
    // Where my toy is on the canvas (CSS pixels), for a press to be aimed at it (tests).
    this.camera.updateMatrixWorld();
    const v = this.toyAt(0, s).project(this.camera),
      el = this.renderer.domElement;
    d.toy = `${Math.round(((v.x + 1) / 2) * el.clientWidth)},${Math.round(((1 - v.y) / 2) * el.clientHeight)}`;
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s || s.winner !== null || s.seat !== 0) return [];
    const at = this.toyAt(0, s);
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
  /**
   * The round loaded (the start of a game, and after a shot): the cylinder swings out to the left on its crane, a brass
   * cartridge slides into a chamber, the cylinder swings back in and is spun, ticking. It ends turned to `turn`, as the
   * rules have it (where the round lies, nobody knows: the rules draw each pull's chance). Returns how long it takes.
   */
  private load(t: number, turn: number, once: (delay: number, act: () => void) => void) {
    const toy = this.toy,
      out = -1.35,
      end = Math.PI * 4 + (turn * Math.PI * 2) / CHAMBERS;
    once(t, () => {
      toy.round.visible = true;
      toy.round.position.set(-0.5, 0.088, 0);
      toy.drum.rotation.x = 0;
    });
    this.tween(t, 260, (p) => (toy.crane.rotation.x = out * smooth(p)));
    // The cartridge into the chamber standing at the top, rim last.
    this.tween(t + 240, 340, (p) => {
      toy.round.visible = true;
      toy.round.position.set(-0.5 + 0.5 * smooth(p), 0.088, 0);
    });
    once(t + 580, () => this.onKnock?.("cushion", 0.2));
    this.tween(t + 620, 200, (p) => (toy.crane.rotation.x = out * (1 - smooth(p))));
    once(t + 820, () => {
      this.onKnock?.("cushion", 0.2);
      toy.round.visible = false;
    });
    this.tween(t + 860, 760, (p) => (toy.drum.rotation.x = end * (1 - (1 - p) * (1 - p))));
    for (let k = 0; k < 7; k++) once(t + 860 + 760 * (1 - Math.sqrt(1 - k / 7)), () => this.onKnock?.("disc", 0.22 + (7 - k) * 0.03));
    return 1680;
  }
  /** The shot: flashes at the muzzle and the cylinder's gap, a burst of light, the gun kicked up, smoke curling away. */
  private fire(t: number, seat: number, before: State) {
    const toy = this.toy,
      puffs: { at: T.Vector3; up: T.Vector3 }[] = [];
    this.tween(t, 90, (p) => {
      toy.flash.visible = p < 1;
      toy.flash.scale.setScalar(0.6 + p * 0.8);
      toy.flash.rotation.x = p * 2;
      toy.light.intensity = 22 * (1 - p);
      if (p >= 1) toy.light.intensity = 0;
    });
    // The kick: the muzzle thrown up and out, coming back down as it falls from the hand.
    this.tween(t, 260, (p) => {
      const k = Math.sin(Math.min(1, p * 1.6) * Math.PI) * (1 - p * 0.4);
      this.aimToy(seat, before, 0.05 * k);
      toy.pivot.rotateZ(0.45 * k);
      toy.hammer.rotation.z = 0;
    });
    // Smoke from the muzzle and the gap, rising and spreading, then gone.
    this.tween(t + 30, 1600, (p) => {
      if (!puffs.length) {
        toy.pivot.updateMatrixWorld(true);
        const muzzle = toy.tip.getWorldPosition(new T.Vector3()),
          gap = toy.drum.getWorldPosition(new T.Vector3());
        toy.smoke.forEach((_, k) =>
          puffs.push({ at: (k < 4 ? muzzle : gap).clone(), up: new T.Vector3(Math.sin(k * 2.1) * 0.25, 0.55 + (k % 3) * 0.12, Math.cos(k * 1.7) * 0.25) }),
        );
      }
      toy.smoke.forEach((puff, k) => {
        const q = Math.max(0, p - k * 0.04);
        puff.visible = q > 0 && p < 1;
        puff.position.copy(puffs[k].at).addScaledVector(puffs[k].up, Math.sqrt(q) * 1.2);
        puff.scale.setScalar(0.18 + q * (0.9 + (k % 2) * 0.4));
        (puff.material as T.SpriteMaterial).opacity = 0.85 * (1 - q) * Math.min(1, q * 12);
      });
    });
  }
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
    // The gun stays at the holder's temple all through; its pose is set again by each step.
    this.aimToy(seat, before);
    this.holdHands(g);
    // The first pull of a game: the round is loaded first (a held pull has already squeezed: it goes straight on).
    if (before.ply === 0 && !held) t += this.load(t, before.turn, once);
    const turnBefore = (before.turn * Math.PI * 2) / CHAMBERS;
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
        feel(g.person, { tension: smooth(p) });
      });
      t += squeeze;
    }
    if (!shot.bang) {
      // Click (철컥): the hammer falls, the cylinder steps a chamber on.
      once(t, () => this.onKnock?.("pocket", 0.3));
      this.tween(t, 160, (p) => {
        this.toy.hammer.rotation.z = 0.75 * (1 - p);
        this.toy.drum.rotation.x = ((firedFrom + smooth(p)) * Math.PI * 2) / CHAMBERS;
      });
      this.tween(t + 60, 520, (p) => {
        g.head.rotation.x = -0.12 * (1 - p);
        feel(g.person, { tension: 1 - smooth(Math.min(1, p * 2)), smile: Math.sin(p * Math.PI) });
        // A sigh of relief: a little bob.
        g.body.position.y = Math.sin(p * Math.PI) * 0.06;
      });
      t += 600;
    } else {
      // 탕: the hammer falls, the flash and the kick, smoke; the one holding it is flung off the chair (the user
      // asked), limp, onto the floor; the gun, let go, drops onto the empty chair. Nothing is shown on the head.
      once(t, () => {
        this.onKnock?.("pocket", 0.7);
        this.toy.hammer.rotation.z = 0;
      });
      this.fire(t, seat, before);
      this.tween(t, RR.FLING_MS, (p) => this.fling(g, p));
      const held = this.poseOf(seat, before),
        fallen = this.dropped(seat, before);
      this.tween(t + 260, 520, (p) => {
        const e = p * p,
          pivot = this.toy.pivot;
        pivot.position.lerpVectors(held.at, fallen.at, e);
        pivot.quaternion.slerpQuaternions(held.turn, fallen.turn, e);
      });
      this.tween(t + 60, 700, (p) => {
        g.mouth.visible = p < 0.05;
        g.gasp.visible = p >= 0.05;
        // The hat flies off in the fall.
        g.hat.position.set(HAT.x + 0.27 * p, HAT.y + Math.sin(p * Math.PI) * 0.6 - 0.11 * p, HAT.z);
        g.hat.rotation.z = HAT.tilt - 0.76 * p;
        if (p > 0.05) feel(g.person, { shock: Math.min(1, p * 3) * (1 - 0.4 * p) });
      });
      t += 1900;
    }
    if (s.winner === null) {
      // Pass it on round the table: the gun floats over from one's temple to the next one's; after a shot a new round
      // is loaded on the way (the rules spin it for whoever is next).
      const to = this.poseOf(s.seat, s),
        from = shot.bang ? this.dropped(seat, before) : this.poseOf(seat, before),
        next = this.guests[s.seat];
      once(t, () => {
        this.toy.flash.visible = false;
        if (!shot.bang) this.resting(g);
      });
      this.tween(t, RR.PASS_MS, (p) => {
        const e = smooth(p),
          pivot = this.toy.pivot;
        pivot.position.lerpVectors(from.at, to.at, e);
        pivot.position.y += Math.sin(e * Math.PI) * 0.7;
        pivot.quaternion.slerpQuaternions(from.turn, to.turn, e);
        pivot.scale.setScalar(RR.TEMPLE_SCALE);
        if (!shot.bang) this.toy.drum.rotation.x = (s.turn * Math.PI * 2) / CHAMBERS;
        this.toy.hammer.rotation.z = 0;
        this.toy.trigger.rotation.z = 0;
        if (p > 0.6) this.holdHands(next);
      });
      if (shot.bang) t += Math.max(RR.PASS_MS, this.load(t, s.turn, once));
      else t += RR.PASS_MS;
    } else {
      const champ = s.champion;
      once(t, () => {
        this.onKnock?.("pocket", 1);
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
  dispose() {
    cancelAnimationFrame(this.holdFrame);
    clearInterval(this.blinker);
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
