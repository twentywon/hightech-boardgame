import * as T from "three";
import { aim, block, glossy, hop, fall, planks, wood, fitCanvas } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { hash, territoryAt, type WorldMap } from "./map";
import { CONQUEST_SUBJECT, MAP_D, MAP_W, MAP_X, MAP_Y, MAX_ZOOM, TRAY, clampView, pieceScale, placeCamera, toGrid, toWorld, type View } from "./layout";
import { OVERLAY_H, OVERLAY_W, paintMap, type Overlay, type Plate } from "./paint";
import { paintWorld } from "./paint-world";
import { KIND_HEIGHT, MOST_GUNS, formation, pieceGeometries } from "./pieces";
import type { Roll, State } from "./rules";
import { noZoom } from "../../engine/zoom";

/** The players' colours: red, blue, green, yellow, purple, black; and the neutral army's grey. */
export const PLAYER_COLORS = ["#c9392b", "#2a62c4", "#3b9a4c", "#e2a21b", "#8a4ec2", "#2c2c30"];
export const COLOR_NAMES = ["빨강", "파랑", "초록", "노랑", "보라", "검정"];
export const NEUTRAL_COLOR = "#9a958b";
/** The colour of a seat of `state`: a player's, or the neutral army's grey. */
export const seatColor = (state: Pick<State, "neutral">, seat: number) => (seat === state.neutral && seat >= 0 ? NEUTRAL_COLOR : (PLAYER_COLORS[seat] ?? "#777"));
/** What the screen has picked out on the map. */
export interface Selection {
  /** The territory picked up, or -1. */
  selected: number;
  /** Where it may go: red to attack, blue to move to. */
  targets: number[];
  kind: "attack" | "move";
  /** Territories a tap would choose now (lit faintly under the mouse). */
  open: number[];
  /** The keyboard's place, or -1. */
  cursor: number;
  /** An arrow from one territory to another: the attack or the move chosen. */
  arrow: [number, number] | null;
}
const NONE: Selection = { selected: -1, targets: [], kind: "attack", open: [], cursor: -1, arrow: null };
const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
function dieFace(value: number, body: string, pip: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    spots: Record<number, [number, number][]> = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = pip;
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(32 + x * 32, 32 + y * 32, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** The faces of a die in the order of a box's sides, and how to turn it so that `face` is up. */
const FACES = [3, 4, 1, 6, 2, 5];
function upright(face: number, yaw: number) {
  const q = new T.Quaternion(),
    x = new T.Vector3(1, 0, 0),
    z = new T.Vector3(0, 0, 1);
  if (face === 6) q.setFromAxisAngle(x, Math.PI);
  else if (face === 2) q.setFromAxisAngle(x, -Math.PI / 2);
  else if (face === 5) q.setFromAxisAngle(x, Math.PI / 2);
  else if (face === 3) q.setFromAxisAngle(z, Math.PI / 2);
  else if (face === 4) q.setFromAxisAngle(z, -Math.PI / 2);
  return new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw).multiply(q);
}
/** Where a die rests in the tray: the attacker's three across its far half, the defender's two across its near half. */
export function diePlace(attacker: boolean, i: number) {
  // Each defending die lies under the attacking die it is compared with.
  return { x: TRAY.x + (i - 1) * 0.56, z: attacker ? TRAY.z - 0.75 : TRAY.z + 0.95 };
}
/** Which dice lost their pair: the attacker's first `n`, the defender's after them. */
function losers(roll: Roll) {
  const out = new Set<number>();
  for (let k = 0; k < Math.min(roll.attack.length, roll.defend.length); k++) out.add(roll.attack[k] > roll.defend[k] ? 3 + k : k);
  return out;
}
function trayFelt() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 476;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1f4a36";
  ctx.fillRect(0, 0, 256, 476);
  for (let k = 0; k < 1400; k++) {
    ctx.fillStyle = `rgba(${hash(k, 1, 2) < 0.5 ? "0,0,0" : "255,255,255"}, 0.05)`;
    ctx.fillRect(hash(k, 3, 2) * 256, hash(k, 4, 2) * 476, 2, 2);
  }
  ctx.strokeStyle = "rgba(240, 226, 190, 0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(18, 250);
  ctx.lineTo(238, 250);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#f1e4c3";
  ctx.font = '800 38px "Inter", "Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("공격", 128, 42);
  ctx.fillText("방어", 128, 438);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The pieces of one kind: what is painted in the holder's colour, its trim, and which territory each instance stands on. */
interface Troop {
  paint: T.InstancedMesh;
  trim: T.InstancedMesh;
  holder: number[];
  count: number;
}
/**
 * The war room: a large table with the world painted on a framed board, each territory's armies standing on it as
 * the fewest pieces (cannons for tens, a rider for five, soldiers for the rest) in its holder's colour under a plate
 * with their number, each player's colour laid along the borders of what they hold, a dice tray beside the map (red
 * for the attacker, white for the defender), and towers on the capitals. The map can be dragged and pinched (or
 * turned with a wheel) to look closer; `fit` shows it all again.
 */
export class ConquestView extends TableView<State> {
  /** A tap on the map: the territory under it, or -1. */
  onTap: (territory: number) => void = () => {};
  private readonly map: WorldMap;
  private readonly scale: number;
  private readonly anchors: { x: number; z: number }[];
  private readonly names: Plate[];
  private look: View = { zoom: 1, x: 0, z: 0 };
  private troops: Troop[] = [];
  private plates: { sprite: T.Sprite; ctx: CanvasRenderingContext2D; texture: T.CanvasTexture; key: string }[] = [];
  private owners: number[] = [];
  private counts: number[] = [];
  private neutral = -1;
  /** Territories whose pieces are forming anew, and how far along (0 to 1); a placement also drops them in. */
  private forming = new Map<number, { p: number; drop: boolean }>();
  private flight: { owner: number; count: number; x: number; y: number; z: number } | null = null;
  private overlay: { ctx: CanvasRenderingContext2D; image: ImageData; texture: T.CanvasTexture; data: Overlay };
  private selection: Selection = NONE;
  private hovered = -1;
  private colors: T.Color[];
  private neutralColor = new T.Color(NEUTRAL_COLOR);
  private dice: T.Mesh[] = [];
  private roll: Roll = { attack: [6, 4, 2], defend: [5, 3], lostA: 0, lostD: 0 };
  private towers: T.Group[] = [];
  private arrow: T.Mesh;
  private arrowKey = "";
  private picker = new T.Raycaster();
  constructor(host: HTMLElement, quality: "high" | "low", map: WorldMap) {
    super(host, quality, "#1b1712");
    // Two fingers on this canvas are the game's own (its map zooms by itself).
    noZoom(this.renderer.domElement);
    this.map = map;
    this.scale = pieceScale(map);
    this.anchors = map.territories.map((t) => {
      const w = toWorld(map, t.x, t.y);
      return { x: w.x, z: w.z };
    });
    this.colors = PLAYER_COLORS.map((c) => new T.Color(c));
    this.daylight("#fff2de", "#3a3026", "#ffe8c6", 11, 2.15);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    const table = this.add(new T.BoxGeometry(48, 0.4, 34), this.standard(planks(6, keep, 4)), 0, -0.2, 0);
    table.castShadow = false;
    // The board: dark polished wood round the painted map, with a brass line at its edge.
    this.add(block(MAP_W + 0.8, 0.2, MAP_D + 0.8, 0.09), this.standard({ map: keep(wood(true)), roughness: 0.42 }), MAP_X, 0.1, 0).castShadow = false;
    const brass = this.standard({ color: "#c9a24e", metalness: 0.75, roughness: 0.32 });
    for (const z of [-MAP_D / 2 - 0.12, MAP_D / 2 + 0.12]) this.add(new T.BoxGeometry(MAP_W + 0.3, 0.015, 0.05), brass, MAP_X, MAP_Y + 0.008, z).castShadow = false;
    for (const x of [-MAP_W / 2 - 0.12, MAP_W / 2 + 0.12]) this.add(new T.BoxGeometry(0.05, 0.015, MAP_D + 0.3), brass, MAP_X + x, MAP_Y + 0.008, 0).castShadow = false;
    const painted = map.shapes ? paintWorld(map) : paintMap(map),
      face = keep(new T.CanvasTexture(painted.canvas));
    this.names = painted.plates;
    face.colorSpace = T.SRGBColorSpace;
    face.anisotropy = 8;
    const sheet = this.add(new T.PlaneGeometry(MAP_W, MAP_D), this.standard({ map: face, roughness: 0.86 }), MAP_X, MAP_Y + 0.002, 0);
    sheet.rotation.x = -Math.PI / 2;
    sheet.castShadow = false;
    // The players' colours along the borders, and what is picked out, on a sheet just over the map.
    const canvas = document.createElement("canvas");
    canvas.width = OVERLAY_W;
    canvas.height = OVERLAY_H;
    const ctx = canvas.getContext("2d")!,
      tint = keep(new T.CanvasTexture(canvas));
    tint.colorSpace = T.SRGBColorSpace;
    this.overlay = { ctx, image: ctx.createImageData(OVERLAY_W, OVERLAY_H), texture: tint, data: painted.overlay };
    const film = this.add(new T.PlaneGeometry(MAP_W, MAP_D), this.standard({ map: tint, transparent: true, depthWrite: false, roughness: 0.86 }), MAP_X, MAP_Y + 0.006, 0);
    film.rotation.x = -Math.PI / 2;
    film.castShadow = false;
    film.renderOrder = 1;
    // The dice tray.
    this.add(block(TRAY.w, 0.22, TRAY.d, 0.07), this.standard({ map: keep(wood(true)), roughness: 0.45 }), TRAY.x, 0.11, TRAY.z).castShadow = false;
    const felt = this.add(new T.PlaneGeometry(TRAY.w - 0.28, TRAY.d - 0.28), this.standard({ map: keep(trayFelt()), roughness: 0.95 }), TRAY.x, 0.222, TRAY.z);
    felt.rotation.x = -Math.PI / 2;
    felt.castShadow = false;
    const cube = keep(block(0.38, 0.38, 0.38, 0.06)),
      red = FACES.map((v) => keep(glossy({ map: keep(dieFace(v, "#c22a22", "#fbf4e6")), roughness: 0.35 }))),
      white = FACES.map((v) => keep(glossy({ map: keep(dieFace(v, "#f6f0e2", "#16181a")), roughness: 0.35 })));
    for (let i = 0; i < 5; i++) {
      const die = new T.Mesh(cube, i < 3 ? red : white);
      die.castShadow = true;
      this.scene.add(die);
      this.dice.push(die);
    }
    // The pieces: for each kind one instanced mesh in the holders' colours and one for its trim, room for every
    // territory's and for those on their way.
    const s = this.scale,
      paint = this.standard({ color: "#ffffff", roughness: 0.48, metalness: 0.05 }),
      trim = this.standard({ vertexColors: true, roughness: 0.42, metalness: 0.45 }),
      room = [4, 1, MOST_GUNS];
    pieceGeometries().forEach((g, kind) => {
      g.paint.scale(s, s, s);
      g.trim.scale(s, s, s);
      const capacity = (map.territories.length + 1) * room[kind],
        troop: Troop = { paint: new T.InstancedMesh(keep(g.paint), paint, capacity), trim: new T.InstancedMesh(keep(g.trim), trim, capacity), holder: [], count: 0 };
      for (const mesh of [troop.paint, troop.trim]) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.count = 0;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
      }
      troop.paint.setColorAt(0, this.colors[0]);
      this.troops.push(troop);
    });
    for (let t = 0; t < map.territories.length; t++) {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 72;
      const texture = keep(new T.CanvasTexture(c));
      texture.colorSpace = T.SRGBColorSpace;
      const sprite = new T.Sprite(keep(new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true })));
      sprite.scale.set(0.46 * s, 0.26 * s, 1);
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      this.plates.push({ sprite, ctx: c.getContext("2d")!, texture, key: "" });
    }
    this.arrow = new T.Mesh(new T.BufferGeometry(), keep(new T.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })));
    this.arrow.visible = false;
    this.arrow.renderOrder = 6;
    this.scene.add(this.arrow);
    this.gestures();
    this.begin();
  }
  // The shared table's ways of choosing are not used: the map is tapped through `onTap`.
  protected subject() {
    return CONQUEST_SUBJECT;
  }
  protected spots(): Spot[] {
    return [];
  }
  protected pick() {
    return -1;
  }
  protected dragStart() {
    // Every press is the map's own: a tap, a drag that moves the view, or a pinch.
    return true;
  }
  protected mark(_marks: Marks) {}
  /** The camera at the zoom and place chosen, never in the shared table's way. */
  protected resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    fitCanvas(this.renderer, w, h);
    this.aimCamera();
  }
  private aimCamera() {
    const el = this.renderer.domElement,
      w = el.clientWidth || this.host.clientWidth,
      h = el.clientHeight || this.host.clientHeight;
    if (!w || !h) return;
    this.look = clampView(this.look);
    placeCamera(this.camera, w / h, this.look);
    this.publish();
    this.redraw();
  }
  /** Shows the whole map again. */
  fit() {
    this.look = { zoom: 1, x: 0, z: 0 };
    this.aimCamera();
  }
  /** Looks closer (a factor over 1) or further, about the middle of the view. */
  zoomBy(factor: number) {
    const el = this.renderer.domElement;
    this.zoomAbout(el.clientWidth / 2, el.clientHeight / 2, factor);
  }
  get zoom() {
    return this.look.zoom;
  }
  private groundAt(x: number, y: number) {
    const el = this.renderer.domElement,
      rect = el.getBoundingClientRect();
    aim(this.picker, { clientX: rect.left + x, clientY: rect.top + y } as PointerEvent, el, this.camera);
    const hit = new T.Vector3();
    return this.picker.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -MAP_Y), hit) ? hit : null;
  }
  private zoomAbout(x: number, y: number, factor: number) {
    const before = this.groundAt(x, y);
    this.look = clampView({ ...this.look, zoom: Math.max(1, Math.min(MAX_ZOOM, this.look.zoom * factor)) });
    placeCamera(this.camera, this.camera.aspect, this.look);
    const after = this.groundAt(x, y);
    if (before && after) this.look = { ...this.look, x: this.look.x + before.x - after.x, z: this.look.z + before.z - after.z };
    this.aimCamera();
  }
  /** What a press at a place of the canvas lands on: a piece or a number plate first, then a name, then the map under it. */
  private territoryAt(x: number, y: number) {
    const el = this.renderer.domElement,
      rect = el.getBoundingClientRect();
    aim(this.picker, { clientX: rect.left + x, clientY: rect.top + y } as PointerEvent, el, this.camera);
    // Right on the place where a territory's armies stand (as the browser tests tap): that territory, whatever stands over it.
    const v = new T.Vector3();
    let closest = -1,
      near = 10;
    this.anchors.forEach((a, t) => {
      v.set(a.x, MAP_Y, a.z).project(this.camera);
      const d = Math.hypot(((v.x + 1) / 2) * el.clientWidth - x, ((1 - v.y) / 2) * el.clientHeight - y);
      if (d < near) {
        near = d;
        closest = t;
      }
    });
    if (closest >= 0) return closest;
    let nearest = Infinity,
      found = -1;
    for (const troop of this.troops) {
      if (!troop.count) continue;
      const hits = this.picker.intersectObject(troop.paint);
      if (hits.length && hits[0].instanceId !== undefined && hits[0].distance < nearest && troop.holder[hits[0].instanceId] >= 0) {
        nearest = hits[0].distance;
        found = troop.holder[hits[0].instanceId];
      }
    }
    if (found >= 0) return found;
    // A plate is as large on the screen as it is drawn.
    for (let t = 0; t < this.plates.length; t++) {
      const sprite = this.plates[t].sprite;
      if (!sprite.visible) continue;
      v.copy(sprite.position).project(this.camera);
      const px = ((v.x + 1) / 2) * el.clientWidth,
        py = ((1 - v.y) / 2) * el.clientHeight,
        half = this.screenSize(sprite.position, sprite.scale.x / 2);
      if (Math.abs(px - x) < half && Math.abs(py - y) < half * 0.56) return t;
    }
    const ground = this.groundAt(x, y);
    if (!ground) return -1;
    const { gx, gy } = toGrid(this.map, ground.x, ground.z),
      under = territoryAt(this.map, gx, gy);
    if (under >= 0) return under;
    // A small island's name stands over the sea: it chooses its own region.
    for (const plate of this.names) if (gx >= plate.x0 && gx <= plate.x1 && gy >= plate.y0 && gy <= plate.y1) return plate.territory;
    return -1;
  }
  /** How many pixels `size` table units at `at` span on the screen. */
  private screenSize(at: T.Vector3, size: number) {
    const a = at.clone().project(this.camera),
      b = at.clone().add(new T.Vector3(size, 0, 0)).project(this.camera);
    return (Math.abs(b.x - a.x) / 2) * this.renderer.domElement.clientWidth;
  }
  private gestures() {
    const el = this.renderer.domElement,
      pointers = new Map<number, { x: number; y: number }>();
    let start = { x: 0, y: 0 },
      moved = false,
      pinched = false,
      anchor: T.Vector3 | null = null,
      pinch: { distance: number; zoom: number; anchor: T.Vector3 | null } | null = null;
    const local = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const middle = () => {
      const [a, b] = [...pointers.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      if (pointers.size === 1) {
        start = p;
        moved = pinched = false;
        anchor = this.groundAt(p.x, p.y);
      } else if (pointers.size === 2) {
        pinched = true;
        const m = middle();
        pinch = { distance: Math.max(1, m.d), zoom: this.look.zoom, anchor: this.groundAt(m.x, m.y) };
      }
    });
    el.addEventListener("pointermove", (e) => {
      const p = local(e);
      if (!pointers.has(e.pointerId)) {
        if (e.pointerType === "mouse") this.hover(this.territoryAt(p.x, p.y));
        return;
      }
      pointers.set(e.pointerId, p);
      if (pointers.size >= 2 && pinch) {
        const m = middle();
        this.look = clampView({ ...this.look, zoom: pinch.zoom * (m.d / pinch.distance) });
        placeCamera(this.camera, this.camera.aspect, this.look);
        const now = this.groundAt(m.x, m.y);
        if (now && pinch.anchor) this.look = { ...this.look, x: this.look.x + pinch.anchor.x - now.x, z: this.look.z + pinch.anchor.z - now.z };
        this.aimCamera();
        return;
      }
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) > 9) moved = true;
      if (moved && anchor && this.look.zoom > 1.001) {
        const now = this.groundAt(p.x, p.y);
        if (now) {
          this.look = { ...this.look, x: this.look.x + anchor.x - now.x, z: this.look.z + anchor.z - now.z };
          this.aimCamera();
        }
      }
    });
    const up = (e: PointerEvent, cancelled: boolean) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size === 1) {
        // From a pinch back to one finger: that finger drags on from where it is.
        const [rest] = [...pointers.values()];
        anchor = this.groundAt(rest.x, rest.y);
        pinch = null;
        return;
      }
      if (pointers.size || cancelled || moved || pinched || this.disposed) return;
      const p = local(e);
      this.onTap(this.territoryAt(p.x, p.y));
    };
    el.addEventListener("pointerup", (e) => up(e, false));
    el.addEventListener("pointercancel", (e) => up(e, true));
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const p = { x: e.offsetX, y: e.offsetY };
        this.zoomAbout(p.x, p.y, Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0022));
      },
      { passive: false },
    );
  }
  protected hover(territory: number) {
    const lit = this.selection.open.includes(territory) || this.selection.targets.includes(territory) ? territory : -1;
    this.renderer.domElement.style.cursor = lit >= 0 ? "pointer" : this.look.zoom > 1.001 ? "grab" : "default";
    if (lit === this.hovered) return;
    this.hovered = lit;
    this.compose();
    this.redraw();
  }
  /** Picks out territories on the map. */
  select(selection: Selection) {
    this.selection = selection;
    if (!selection.open.includes(this.hovered) && !selection.targets.includes(this.hovered)) this.hovered = -1;
    this.compose();
    this.pointArrow();
    this.redraw();
  }
  /** The nearest territory from `from` in a direction on the table (dx, dz), for the keyboard. */
  toward(from: number, dx: number, dz: number) {
    if (from < 0) return this.anchors.reduce((best, a, t) => (Math.hypot(a.x - MAP_X, a.z) < Math.hypot(this.anchors[best].x - MAP_X, this.anchors[best].z) ? t : best), 0);
    const a = this.anchors[from];
    let best = from,
      score = Infinity;
    this.anchors.forEach((b, t) => {
      if (t === from) return;
      const x = b.x - a.x,
        z = b.z - a.z,
        d = Math.hypot(x, z),
        along = (x * dx + z * dz) / d;
      if (along < 0.35) return;
      const value = d * (2.2 - along * 1.2);
      if (value < score) {
        score = value;
        best = t;
      }
    });
    return best;
  }
  /** Lays each player's colour along the borders held, and the picked-out territories over it. */
  private compose() {
    const { ids, band } = this.overlay.data,
      data = this.overlay.image.data,
      n = this.map.territories.length,
      base = new Float32Array(n * 3),
      lit = new Float32Array(n * 4),
      sel = capturing() ? NONE : this.selection,
      paint = (t: number, hex: string, alpha: number) => {
        if (t < 0 || t >= n) return;
        const [r, g, b] = rgb(hex);
        lit.set([r, g, b, Math.max(alpha, lit[t * 4 + 3])], t * 4);
      };
    for (let t = 0; t < n; t++) {
      const o = this.owners[t] ?? -1,
        [r, g, b] = rgb(o < 0 ? "#ffffff" : seatColor({ neutral: this.neutral }, o));
      base.set([r, g, b], t * 3);
    }
    for (const t of sel.open) paint(t, "#ffffff", 0.001);
    if (this.hovered >= 0 && sel !== NONE) paint(this.hovered, "#ffffff", 0.2);
    for (const t of sel.targets) paint(t, sel.kind === "attack" ? "#ff3b2e" : "#4fb3ff", 0.36);
    if (sel.cursor >= 0 && sel.cursor !== sel.selected && !sel.targets.includes(sel.cursor)) paint(sel.cursor, "#ffffff", 0.3);
    paint(sel.selected, "#ffd23f", 0.42);
    for (let k = 0; k < ids.length; k++) {
      const t = ids[k],
        q = k * 4;
      if (t < 0 || this.owners[t] === undefined) {
        data[q + 3] = 0;
        continue;
      }
      const edge = band[k] / 255,
        ab = edge * (this.owners[t] < 0 ? 0 : 0.72),
        h = lit[t * 4 + 3] > 0.01 ? Math.min(1, lit[t * 4 + 3] + edge * 0.45) : 0,
        a = h + ab * (1 - h);
      if (a <= 0.004) {
        data[q + 3] = 0;
        continue;
      }
      data[q] = (lit[t * 4] * h + base[t * 3] * ab * (1 - h)) / a;
      data[q + 1] = (lit[t * 4 + 1] * h + base[t * 3 + 1] * ab * (1 - h)) / a;
      data[q + 2] = (lit[t * 4 + 2] * h + base[t * 3 + 2] * ab * (1 - h)) / a;
      data[q + 3] = a * 255;
    }
    this.overlay.ctx.putImageData(this.overlay.image, 0, 0);
    this.overlay.texture.needsUpdate = true;
  }
  /** A flat arrow over the map from the territory picked to the one chosen; across the map's side, to its edge. */
  private pointArrow() {
    const pair = capturing() ? null : this.selection.arrow,
      key = pair ? `${pair[0]}:${pair[1]}:${this.selection.kind}` : "";
    if (key === this.arrowKey) return;
    this.arrowKey = key;
    this.arrow.visible = !!pair;
    if (!pair) return;
    const a = this.anchors[pair[0]],
      wrap = this.map.links.some((l) => l.wrap && ((l.a === pair[0] && l.b === pair[1]) || (l.b === pair[0] && l.a === pair[1]))),
      edge = MAP_X + (a.x < MAP_X ? -MAP_W / 2 : MAP_W / 2),
      b = wrap ? { x: edge + (a.x < MAP_X ? -0.35 : 0.35), z: a.z } : this.anchors[pair[1]],
      length = Math.hypot(b.x - a.x, b.z - a.z),
      s = this.scale,
      w = 0.09 * s,
      head = 0.26 * s,
      from = 0.24 * s,
      to = Math.max(from + 0.1, length - (wrap ? 0 : 0.3 * s)),
      shape = new T.Shape();
    shape.moveTo(from, -w);
    shape.lineTo(to - head, -w);
    shape.lineTo(to - head, -w * 2.6);
    shape.lineTo(to, 0);
    shape.lineTo(to - head, w * 2.6);
    shape.lineTo(to - head, w);
    shape.lineTo(from, w);
    shape.closePath();
    this.arrow.geometry.dispose();
    const geometry = new T.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    this.arrow.geometry = geometry;
    this.arrow.position.set(a.x, MAP_Y + 0.03, a.z);
    this.arrow.rotation.set(0, -Math.atan2(b.z - a.z, b.x - a.x), 0);
    (this.arrow.material as T.MeshBasicMaterial).color.set(this.selection.kind === "attack" ? "#ff3b2e" : "#2f8fe0");
  }
  private colorOf(owner: number) {
    return owner === this.neutral && owner >= 0 ? this.neutralColor : (this.colors[owner] ?? this.colors[0]);
  }
  /** How large the pieces of a forming territory stand, and how high above the map, at `p` of their forming. */
  private formed(t: number) {
    const f = this.forming.get(t);
    if (!f) return { size: 1, lift: 0 };
    const p = f.p;
    return { size: 0.62 + 0.38 * Math.min(1, p * 1.25) + Math.sin(Math.PI * p) * 0.08, lift: f.drop ? fall(p) * 0.6 : 0 };
  }
  private arrange() {
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      position = new T.Vector3(),
      size = new T.Vector3(),
      up = new T.Vector3(0, 1, 0),
      s = this.scale;
    for (const troop of this.troops) {
      troop.count = 0;
      troop.holder = [];
    }
    const lay = (t: number, count: number, owner: number, x: number, y: number, z: number, form: { size: number; lift: number }) => {
      const colour = this.colorOf(owner);
      for (const piece of formation(count).pieces) {
        const troop = this.troops[piece.kind],
          k = troop.count++;
        q.setFromAxisAngle(up, (hash(t, k, 3) - 0.5) * (piece.kind === 0 ? 0.5 : 0.22));
        position.set(x + piece.x * s * form.size, y + form.lift, z + piece.z * s * form.size);
        size.setScalar(form.size);
        m.compose(position, q, size);
        troop.paint.setMatrixAt(k, m);
        troop.trim.setMatrixAt(k, m);
        troop.paint.setColorAt(k, colour);
        troop.holder[k] = t;
      }
    };
    for (let t = 0; t < this.anchors.length; t++) {
      if (!(this.counts[t] > 0) || this.owners[t] === undefined || this.owners[t] < 0) continue;
      const a = this.anchors[t];
      lay(t, this.counts[t], this.owners[t], a.x, MAP_Y + 0.006, a.z, this.formed(t));
    }
    // The pieces on their way from one territory to another.
    const f = this.flight;
    if (f) lay(-1, f.count, f.owner, f.x, f.y, f.z, { size: 1, lift: 0 });
    for (const troop of this.troops) {
      for (const mesh of [troop.paint, troop.trim]) {
        mesh.count = troop.count;
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (troop.paint.instanceColor) troop.paint.instanceColor.needsUpdate = true;
      troop.paint.computeBoundingSphere();
    }
    this.labels();
    this.redraw();
  }
  /** Each territory's plate: its armies' number on its holder's colour, over its pieces. */
  private labels() {
    const s = this.scale;
    this.plates.forEach((plate, t) => {
      const count = this.counts[t],
        owner = this.owners[t],
        { pieces, depth } = formation(count),
        tallest = Math.max(0.2, ...pieces.map((p) => KIND_HEIGHT[p.kind])),
        form = this.formed(t);
      // Over the back of the pieces: seen from above, it stands just beyond their heads.
      plate.sprite.position.set(this.anchors[t].x, MAP_Y + (tallest * 0.9 * form.size + 0.1) * s + form.lift, this.anchors[t].z - (depth / 2 + 0.05) * s * form.size);
      plate.sprite.visible = count > 0 && owner >= 0;
      const key = `${owner}:${count}:${owner === this.neutral}`;
      if (key === plate.key) return;
      plate.key = key;
      const ctx = plate.ctx;
      ctx.clearRect(0, 0, 128, 72);
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.beginPath();
      ctx.roundRect(8, 9, 114, 58, 16);
      ctx.fill();
      ctx.fillStyle = owner >= 0 ? seatColor({ neutral: this.neutral }, owner) : "#777";
      ctx.beginPath();
      ctx.roundRect(5, 5, 114, 58, 16);
      ctx.fill();
      ctx.strokeStyle = "#fff8ea";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.font = `900 ${count >= 100 ? 34 : 44}px "Inter", "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeText(String(count), 62, 37);
      ctx.fillText(String(count), 62, 37);
      plate.texture.needsUpdate = true;
    });
  }
  /** A tower on every capital, flying the colour of the player whose capital it is. */
  private raiseTowers(s: State) {
    if (this.towers.length || !s.seats.some((seat) => seat.capital >= 0)) return;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      sc = this.scale,
      stone = this.standard({ color: "#efe4c6", roughness: 0.55 }),
      gold = this.standard({ color: "#d9ad48", metalness: 0.7, roughness: 0.3 });
    s.seats.forEach((seat, p) => {
      if (seat.capital < 0) return;
      const group = new T.Group(),
        a = this.anchors[seat.capital],
        flag = this.standard({ color: PLAYER_COLORS[p], roughness: 0.6, side: T.DoubleSide });
      // A keep with six merlons, a gold roof and its player's pennant.
      this.add(new T.CylinderGeometry(0.1 * sc, 0.13 * sc, 0.42 * sc, 16), stone, 0, 0.21 * sc, 0, group);
      for (let k = 0; k < 6; k++) {
        const angle = (k / 6) * Math.PI * 2;
        this.add(block(0.05 * sc, 0.06 * sc, 0.05 * sc, 0.01 * sc), stone, Math.cos(angle) * 0.095 * sc, 0.45 * sc, Math.sin(angle) * 0.095 * sc, group);
      }
      this.add(new T.ConeGeometry(0.085 * sc, 0.18 * sc, 16), gold, 0, 0.54 * sc, 0, group);
      this.add(new T.CylinderGeometry(0.01 * sc, 0.01 * sc, 0.3 * sc, 6), gold, 0, 0.74 * sc, 0, group);
      const pennant = new T.Mesh(keep(new T.PlaneGeometry(0.24 * sc, 0.13 * sc)), flag);
      pennant.position.set(0.12 * sc, 0.82 * sc, 0);
      pennant.castShadow = true;
      group.add(pennant);
      group.position.set(a.x - 0.36 * sc, MAP_Y, a.z - 0.2 * sc);
      this.scene.add(group);
      this.towers.push(group);
    });
  }
  private showDice(roll: Roll) {
    this.roll = roll;
    this.dice.forEach((die, i) => {
      const attacker = i < 3,
        k = attacker ? i : i - 3,
        values = attacker ? roll.attack : roll.defend,
        at = diePlace(attacker, k);
      die.visible = k < values.length;
      die.scale.setScalar(1);
      die.position.set(at.x, 0.222 + 0.19, at.z);
      this.sink(die, i, roll);
      if (die.visible) die.quaternion.copy(upright(values[k], (hash(i, values[k], 7) - 0.5) * 0.7));
    });
  }
  /** A die that lost its pair lies a little smaller, so that the winners stand out. */
  private sink(die: T.Mesh, i: number, roll: Roll) {
    const lost = losers(roll).has(i);
    die.scale.setScalar(lost ? 0.8 : 1);
    die.position.y = 0.222 + (lost ? 0.152 : 0.19);
  }
  protected place(s: State) {
    this.neutral = s.neutral;
    this.owners = [...s.owner];
    this.counts = [...s.armies];
    this.forming.clear();
    this.flight = null;
    this.raiseTowers(s);
    if (s.last?.kind === "battle") this.showDice(s.last.rolls[s.last.rolls.length - 1]);
    else this.showDice(this.roll);
    this.compose();
    this.arrange();
  }
  sync(state: State, animate = true) {
    super.sync(state, animate);
    // For the browser tests: who holds what, as everyone at the table sees it.
    const el = this.renderer.domElement;
    el.dataset.owners = state.owner.join(",");
    el.dataset.armies = state.armies.join(",");
  }
  /** Tells where every territory's armies stand on the canvas (CSS pixels), for the browser tests. */
  private publish() {
    const el = this.renderer.domElement,
      w = el.clientWidth,
      h = el.clientHeight,
      v = new T.Vector3();
    el.dataset.places = JSON.stringify(this.anchors.map((a) => (v.set(a.x, MAP_Y, a.z).project(this.camera), [Math.round(((v.x + 1) / 2) * w), Math.round(((1 - v.y) / 2) * h)])));
    el.dataset.zoom = this.look.zoom.toFixed(2);
  }
  private tumble(roll: Roll, delay: number, duration: number) {
    this.tween(delay, duration, (p) => {
      if (p === 0 || !this.dice[0]) return;
      if (this.roll !== roll) {
        this.showDice(roll);
        this.onRoll(roll.attack.length + roll.defend.length, duration / 1000);
      }
      this.dice.forEach((die, i) => {
        if (!die.visible) return;
        const k = i < 3 ? i : i - 3,
          values = i < 3 ? roll.attack : roll.defend,
          end = upright(values[k], (hash(i, values[k], 7) - 0.5) * 0.7),
          axis = new T.Vector3(1, 0.4 + i * 0.3, 0.6 - i * 0.2).normalize(),
          spin = new T.Quaternion().setFromAxisAngle(axis, (1 - p) ** 1.5 * Math.PI * 4);
        die.quaternion.copy(end).multiply(spin);
        die.scale.setScalar(1);
        die.position.y = 0.222 + 0.19 + hop(p) * 0.55;
        if (p === 1) this.sink(die, i, roll);
      });
      this.redraw();
    });
  }
  /** A territory's pieces form anew (smaller, growing back to their size), dropping in if armies were placed there. */
  private reform(t: number, delay: number, drop: boolean, duration = 300) {
    this.tween(delay, duration, (p) => {
      if (p >= 1) this.forming.delete(t);
      else this.forming.set(t, { p, drop });
      if (p >= 1 && drop) this.onContact();
      this.arrange();
    });
  }
  /** Pieces carried in a hop from one territory to another. */
  private carry(owner: number, count: number, from: number, to: number, delay: number, duration: number, land: () => void) {
    const a = this.anchors[from],
      b = this.anchors[to],
      wrap = Math.abs(b.x - a.x) > MAP_W * 0.6;
    this.tween(delay, duration, (p) => {
      const e = p * p * (3 - 2 * p),
        // Across the map's side the pieces go out at one edge and come in at the other.
        bx = wrap ? (e < 0.5 ? a.x + (a.x < MAP_X ? -1 : 1) * Math.abs(MAP_X + MAP_W / 2 - Math.abs(a.x - MAP_X)) * e * 2 : b.x) : a.x + (b.x - a.x) * e;
      this.flight = p < 1 ? { owner, count, x: bx, y: MAP_Y + hop(p) * (0.5 + Math.min(4, Math.hypot(b.x - a.x, b.z - a.z)) * 0.08), z: a.z + (b.z - a.z) * e } : null;
      if (p === 1) {
        land();
        this.onContact();
      }
      this.arrange();
    });
  }
  protected animate(before: State, s: State) {
    const last = s.last;
    if (!last || s.ply === before.ply) return false;
    if (last.kind === "place" || (last.kind === "trade" && last.bonus >= 0)) {
      const t = last.kind === "place" ? last.territory : last.bonus;
      this.counts[t] = s.armies[t];
      this.owners[t] = s.owner[t];
      if (before.owner[t] !== s.owner[t]) this.compose();
      // Setting up, one army at a time: quickly.
      this.reform(t, 0, true, before.phase === "claim" || before.phase === "deploy" ? 170 : 340);
      return true;
    }
    if (last.kind === "battle") {
      const { rolls, from, to } = last,
        n = rolls.length,
        each = n <= 2 ? 620 : Math.max(230, 2400 / n);
      let a = before.armies[from],
        d = before.armies[to];
      rolls.forEach((roll, i) => {
        const delay = i * each;
        this.tumble(roll, delay, each * 0.78);
        a -= roll.lostA;
        d -= roll.lostD;
        const left = { a, d },
          hit = { a: roll.lostA > 0, d: roll.lostD > 0 };
        this.tween(delay + each * 0.78, 1, () => {
          this.counts[from] = left.a;
          this.counts[to] = left.d;
          this.arrange();
        });
        // The side that lost armies re-forms.
        if (hit.a) this.reform(from, delay + each * 0.78, false, 220);
        if (hit.d && left.d > 0) this.reform(to, delay + each * 0.78, false, 220);
      });
      if (last.conquered) {
        this.tween(n * each, 1, () => {
          this.counts[from] = s.armies[from];
          this.counts[to] = 0;
          this.owners[to] = last.player;
          this.compose();
          this.arrange();
        });
        this.carry(last.player, last.moved, from, to, n * each, 460, () => (this.counts[to] = last.moved));
      } else this.tween(n * each, 180, () => {});
      return true;
    }
    if (last.kind === "occupy" || last.kind === "fortify") {
      if (!last.count) return false;
      const { from, to, count, player } = last;
      this.counts[from] = before.armies[from] - count;
      this.carry(player, count, from, to, 0, 480, () => {
        this.counts[to] = before.armies[to] + count;
        this.reform(to, 0, false, 220);
      });
      return true;
    }
    return false;
  }
}
