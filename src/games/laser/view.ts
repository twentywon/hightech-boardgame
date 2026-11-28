import * as T from "three";
import { block, hop, travel } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { bench } from "./bench";
import {
  BEAM,
  BEAM_MAX,
  BEAM_MIN,
  BEAM_SPEED,
  CARRY,
  CELL,
  FOOT,
  PAD,
  PLATE_HALF,
  TOP,
  TRAY_SCALE,
  TRAY_STEP,
  TRAY_TOP,
  boardMiddle,
  cellAt,
  cellUnder,
  keyPlaces,
  laserSubject,
  onPlate,
  sideways,
  toTable,
  trayBox,
  trayPlaces,
} from "./layout";
import { Optics, type Figure } from "./optics";
import { CELLS, GO, PUT, SIZE, attempt, judge, occupancy, trace, type Beam, type Kind, type Piece, type State } from "./rules";

export const LASER_COLORS: [string, string] = ["#ff3b2a", "#23262c"];
/** A piece's turn (clockwise quarters seen from above) as a turn about the upright. */
const spin = (dir: number) => (-dir * Math.PI) / 2;
const canvasOf = (w: number, h = w) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, pen: canvas.getContext("2d")! };
};
/**
 * The breadboard's top: black anodised aluminium with a tapped hole every quarter unit, a faint engraved square round
 * each of the 25 mounts, ruler ticks along its edges and the columns and rows engraved in its margin.
 */
function plateTexture() {
  const size = 1024,
    { canvas, pen } = canvasOf(size),
    scale = size / (2 * PLATE_HALF),
    at = (u: number) => size / 2 + u * scale;
  pen.fillStyle = "#2a2e35";
  pen.fillRect(0, 0, size, size);
  // Holes, with a light lip on their near side.
  for (let i = -11; i <= 11; i++)
    for (let k = -11; k <= 11; k++) {
      const x = at(i * 0.25),
        y = at(k * 0.25);
      pen.fillStyle = "rgba(170, 180, 192, 0.22)";
      pen.beginPath();
      pen.arc(x, y + 1.2, 6.2, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = "#121418";
      pen.beginPath();
      pen.arc(x, y, 5.4, 0, Math.PI * 2);
      pen.fill();
    }
  // The squares of the mounts.
  pen.strokeStyle = "rgba(210, 220, 232, 0.28)";
  pen.lineWidth = 2;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const x = at((c - 2) * CELL),
        y = at((r - 2) * CELL),
        h = (CELL / 2 - 0.04) * scale;
      pen.strokeRect(x - h, y - h, 2 * h, 2 * h);
    }
  // Ruler ticks and the engraved letters and numbers of the columns and rows.
  pen.strokeStyle = "rgba(225, 232, 240, 0.55)";
  pen.fillStyle = "rgba(225, 232, 240, 0.6)";
  pen.font = "700 30px Inter, Arial, sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  for (let k = -22; k <= 22; k++) {
    const u = k * 0.125,
      long = k % 4 === 0 ? 18 : 9;
    pen.lineWidth = k % 4 === 0 ? 2.4 : 1.4;
    pen.beginPath();
    pen.moveTo(at(u), 0);
    pen.lineTo(at(u), long);
    pen.moveTo(at(u), size);
    pen.lineTo(at(u), size - long);
    pen.moveTo(0, at(u));
    pen.lineTo(long, at(u));
    pen.moveTo(size, at(u));
    pen.lineTo(size - long, at(u));
    pen.stroke();
  }
  for (let i = 0; i < SIZE; i++) {
    const u = at((i - 2) * CELL);
    pen.fillText("ABCDE"[i], u, at(PLATE_HALF - 0.17));
    pen.fillText(String(i + 1), at(-PLATE_HALF + 0.17), u);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** A flare: a bright middle, a soft glow and four thin rays. */
function flareTexture() {
  const { canvas, pen } = canvasOf(128);
  const g = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.12, "rgba(255, 235, 225, 0.9)");
  g.addColorStop(0.35, "rgba(255, 120, 90, 0.35)");
  g.addColorStop(1, "rgba(255, 60, 40, 0)");
  pen.fillStyle = g;
  pen.fillRect(0, 0, 128, 128);
  pen.globalCompositeOperation = "lighter";
  for (const [w, h] of [
    [128, 5],
    [5, 128],
  ]) {
    const ray = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
    ray.addColorStop(0, "rgba(255, 240, 230, 0.85)");
    ray.addColorStop(1, "rgba(255, 80, 60, 0)");
    pen.fillStyle = ray;
    pen.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** A beam's fading: bright at its near end (the bottom of the picture), gone at its far one. */
function fadeTexture() {
  const { canvas, pen } = canvasOf(4, 64);
  const g = pen.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#000000");
  pen.fillStyle = g;
  pen.fillRect(0, 0, 4, 64);
  return new T.CanvasTexture(canvas);
}
/** How far a beam that leaves the board is seen fading beyond the plate's edge. */
const TAIL = 0.9;
/** One stretch of the beam drawn: its glowing core and the haze round it, and where it runs. */
interface Ray {
  layers: T.Mesh[];
  from: T.Vector3;
  to: T.Vector3;
  start: number;
}
/** The press the player is making on the table. */
interface Press {
  /** What it began on: a tray piece still in the tray, one of mine on the board, a given piece, the laser, a cell, nothing. */
  kind: "tray" | "mine" | "given" | "laser" | "cell" | "none";
  index: number;
  cell: number;
  x: number;
  y: number;
  moving: boolean;
}
/**
 * An optics bench: a black perforated breadboard with a 5 × 5 grid of mounts on a steel optical table, the pieces
 * modelled in code (`Optics`), the tray an aluminium case lined with foam before the board (at its right on a wide
 * canvas). A tray piece is dragged to a mount (a green ring shows where it lands, a red one where it may not), a
 * piece of mine is carried between mounts or off the board back to the tray, and a tap turns a piece a quarter; a
 * tap on the laser fires it. The beam runs out from the laser as a glowing red line with a faint haze, flaring where
 * it strikes, and stays until a piece moves; targets it lights glow, a checkpoint it passes shows green, and pieces it
 * missed get red rings.
 */
export class LaserView extends TableView<State> {
  /** The laser fired ("disc"), a target lit ("pocket"), the beam stopped on a face ("cushion"). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private aspect = 1;
  private built = "";
  private optics: Optics;
  private plate = new T.Group();
  private given: Figure[] = [];
  private tray: Figure[] = [];
  private caseGroup = new T.Group();
  private caseShapes: T.BufferGeometry[] = [];
  private casePaint: Record<"alu" | "foam" | "hollow", T.Material>;
  private cut: T.BufferGeometry;
  private scenery: ReturnType<typeof bench>;
  private caster = new T.Raycaster();
  /** What the last ray struck. */
  private struck: Pick<Press, "kind" | "index" | "cell"> = { kind: "none", index: -1, cell: -1 };
  private press: Press | null = null;
  private pointer = { x: 0, y: 0 };
  private hear = (e: PointerEvent) => {
    this.pointer = { x: e.clientX, y: e.clientY };
  };
  /** Where a carried piece was let go, so that it goes on from there. */
  private dropped: { piece: number; at: T.Vector3 } | null = null;
  /** The beam: its stretches, its flares, the halos of targets lit. */
  private tube: T.BufferGeometry;
  private beamPaint: T.Material[];
  private rays: Ray[] = [];
  private tails: Ray[] = [];
  private tailPaint: T.Material[];
  private flares: { sprite: T.Sprite; at: number; size: number; phase: number }[] = [];
  private flarePaint: Record<"red" | "gold" | "green", T.SpriteMaterial>;
  private shown: Beam | null = null;
  /** How far along the beam is drawn (Infinity for all of it). */
  private reach = Infinity;
  private rings: Record<"cursor" | "chosen" | "from" | "to" | "laser" | "aim" | "refuse", T.Mesh>;
  private targets: T.Mesh[] = [];
  private warnings: T.Mesh[] = [];
  private ghosts = new Map<Kind, Figure>();
  private ghostPaint: T.Material;
  private arrow: T.Mesh;
  private clock = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1c2026");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.daylight("#eef3fa", "#2a2f38", "#fff4e6", 9, 2.1);
    // A cool lamp over the bench from the right, as in a lab.
    const lamp = new T.PointLight("#dce8ff", 5, 16, 1.6);
    lamp.position.set(4.5, 5.5, 2);
    this.scene.add(lamp);
    this.optics = new Optics(keep);
    this.scenery = bench(this.scene, keep);
    this.ghostPaint = keep(new T.MeshBasicMaterial({ color: "#ffb21f", transparent: true, opacity: 0.45, depthWrite: false }));
    // The breadboard and its mounts.
    const top = this.standard({ map: keep(plateTexture()), roughness: 0.55, metalness: 0.25 }),
      edge = this.standard({ color: "#1f2227", roughness: 0.5, metalness: 0.3 }),
      slab = this.add(block(2 * PLATE_HALF, TOP, 2 * PLATE_HALF, 0.03), [edge, edge, top, edge, edge, edge], 0, TOP / 2, 0, this.plate);
    slab.castShadow = false;
    const pad = keep(new T.CylinderGeometry(0.19, 0.2, PAD, 36)),
      tap = keep(new T.CircleGeometry(0.045, 16).rotateX(-Math.PI / 2)),
      alu = this.standard({ color: "#6f767f", roughness: 0.4, metalness: 0.45 }),
      dark = this.standard({ color: "#101215", roughness: 1 });
    for (let cell = 0; cell < CELLS; cell++) {
      const at = toTable(cell % SIZE, Math.floor(cell / SIZE), 1),
        m = boardMiddle(1),
        mount = new T.Mesh(pad, alu);
      mount.position.set(at.x - m.x, TOP + PAD / 2, at.z - m.z);
      mount.receiveShadow = true;
      const hole = new T.Mesh(tap, dark);
      hole.position.set(at.x - m.x, FOOT + 0.001, at.z - m.z);
      this.plate.add(mount, hole);
    }
    this.scene.add(this.plate, this.caseGroup);
    this.casePaint = {
      alu: this.standard({ color: "#c3c9d0", roughness: 0.35, metalness: 0.45 }),
      foam: this.standard({ color: "#3b3f45", roughness: 1 }),
      hollow: this.standard({ color: "#1d1f23", roughness: 1 }),
    };
    this.cut = keep(new T.CircleGeometry(0.3, 32).rotateX(-Math.PI / 2));
    // The beam's shapes and paints: a white-hot core in a red glow, and a wider faint haze.
    this.tube = keep(new T.CylinderGeometry(1, 1, 1, 10, 1, true));
    const glow = (color: string, opacity: number) => keep(new T.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: opacity < 1 ? T.AdditiveBlending : T.NormalBlending, depthWrite: false, toneMapped: false }));
    this.beamPaint = [glow("#fff1ec", 1), glow("#ff2a14", 0.8), glow("#ff3a1c", 0.13)];
    const fade = keep(fadeTexture());
    this.tailPaint = [
      ["#fff1ec", 0.9],
      ["#ff2a14", 0.8],
      ["#ff3a1c", 0.13],
    ].map(([color, opacity]) => keep(new T.MeshBasicMaterial({ color: color as string, alphaMap: fade, transparent: true, opacity: opacity as number, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })));
    const flare = keep(flareTexture()),
      sprite = (color: string) => keep(new T.SpriteMaterial({ map: flare, color, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flarePaint = { red: sprite("#ffd0c4"), gold: sprite("#ffc070"), green: sprite("#9dffb8") };
    // The marks.
    const flat = (color: string, opacity: number) => keep(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
    const ring = (inner: number, outer: number, material: T.Material) => {
      const mesh = new T.Mesh(keep(new T.RingGeometry(inner, outer, 48).rotateX(-Math.PI / 2)), material);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      return mesh;
    };
    const gold = flat("#ffb21f", 0.95);
    this.rings = {
      cursor: ring(0.44, 0.49, flat("#ffffff", 0.95)),
      chosen: ring(0.38, 0.44, flat("#62cfff", 0.95)),
      from: ring(0.38, 0.45, gold),
      to: ring(0.38, 0.45, gold),
      laser: ring(0.4, 0.47, gold),
      aim: ring(0.36, 0.44, flat("#7fe0a0", 0.95)),
      refuse: ring(0.36, 0.44, flat("#e0392b", 0.95)),
    };
    const faint = flat("#ffffff", 0.5),
      red = flat("#ff4a3a", 0.9);
    for (let k = 0; k < CELLS; k++) this.targets.push(ring(0.18, 0.23, faint));
    for (let k = 0; k < 12; k++) this.warnings.push(ring(0.33, 0.4, red));
    this.arrow = new T.Mesh(keep(new T.ConeGeometry(0.1, 0.24, 16).rotateX(Math.PI)), keep(new T.MeshBasicMaterial({ color: "#ffffff" })));
    this.arrow.visible = false;
    this.arrow.renderOrder = 10;
    this.scene.add(this.arrow);
    // A carried piece is followed over a plane above the pieces, so that it is never lost among them.
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -CARRY);
    host.addEventListener("pointerdown", this.hear, true);
    host.addEventListener("pointermove", this.hear, true);
    this.renderer.domElement.dataset.fired = "false";
    this.renderer.domElement.dataset.lit = "0";
    this.begin();
  }
  /** The table's own lamps are enough under the reflected room too; its film-like light would grey the white target faces. */
  protected filmic() {
    return false;
  }

  /*
   * Laying the bench out.
   */
  /** Builds the pieces and the tray when the puzzle changes, or the canvas turns wide or narrow. */
  private lay(state: State) {
    const key = `${sideways(this.aspect)}|${state.given.map((p) => `${p.kind}${p.at}${p.locked ? "" : "*"}`).join(",")}|${state.tray.map((p) => `${p.kind}${p.locked ? p.dir : ""}`).join(",")}`;
    if (key === this.built) return;
    this.built = key;
    for (const f of [...this.given, ...this.tray]) f.group.removeFromParent();
    const look = (p: Piece, given: boolean) => ({ given, locked: p.locked });
    this.given = state.given.map((p, g) => {
      const f = this.optics.figure(p.kind, look(p, true));
      f.proxy.userData = { side: "given", index: g };
      this.scene.add(f.group);
      return f;
    });
    this.tray = state.tray.map((p, j) => {
      const f = this.optics.figure(p.kind, look(p, false));
      f.proxy.userData = { side: "tray", index: j };
      this.scene.add(f.group);
      return f;
    });
    // The tray: an aluminium case lined with dark foam, a round cut-out for each piece (made again with the puzzle).
    this.caseGroup.clear();
    for (const shape of this.caseShapes) shape.dispose();
    this.caseShapes = [];
    const box = trayBox(this.aspect),
      side = sideways(this.aspect),
      wide = side ? box.wide : Math.max(2.4, state.tray.length * TRAY_STEP + 0.5),
      deep = side ? Math.max(2.4, state.tray.length * TRAY_STEP + 0.5) : box.deep,
      part = (geometry: T.BufferGeometry, paint: T.Material, x: number, y: number, z: number) => {
        this.caseShapes.push(geometry);
        const mesh = new T.Mesh(geometry, paint);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        this.caseGroup.add(mesh);
        return mesh;
      };
    part(block(wide, 0.05, deep, 0.02), this.casePaint.alu, box.x, 0.025, box.z);
    part(block(wide - 0.12, 0.05, deep - 0.12, 0.015), this.casePaint.foam, box.x, 0.075, box.z).castShadow = false;
    for (const s of [-1, 1]) {
      part(block(0.06, 0.16, deep, 0.02), this.casePaint.alu, box.x + s * (wide / 2 - 0.03), 0.08, box.z);
      part(block(wide, 0.16, 0.06, 0.02), this.casePaint.alu, box.x, 0.08, box.z + s * (deep / 2 - 0.03));
    }
    for (const at of trayPlaces(state.tray.length, this.aspect)) {
      const cut = new T.Mesh(this.cut, this.casePaint.hollow);
      cut.position.set(at.x, TRAY_TOP + 0.002, at.z);
      cut.receiveShadow = true;
      this.caseGroup.add(cut);
    }
    const middle = boardMiddle(this.aspect);
    this.plate.position.set(middle.x, 0, middle.z);
    this.scenery.place({
      left: Math.min(middle.x - PLATE_HALF, box.x - wide / 2),
      right: Math.max(middle.x + PLATE_HALF, box.x + wide / 2),
      back: middle.z - PLATE_HALF,
      front: Math.max(middle.z + PLATE_HALF, box.z + deep / 2),
    });
  }
  protected subject(aspect: number): TableSubject {
    return laserSubject(aspect);
  }
  protected layout(aspect: number) {
    const turned = sideways(aspect) !== sideways(this.aspect);
    this.aspect = aspect;
    if (turned) this.built = "";
  }
  /** Where a piece stands: on its mount, or smaller in its place in the tray. */
  private home(state: State, side: "given" | "tray", index: number) {
    const p = side === "given" ? state.given[index] : state.tray[index];
    if (p.at >= 0) {
      const at = cellAt(p.at, this.aspect);
      return { position: new T.Vector3(at.x, FOOT, at.z), scale: 1, turn: spin(p.dir) };
    }
    const at = trayPlaces(state.tray.length, this.aspect)[index];
    return { position: new T.Vector3(at.x, TRAY_TOP, at.z), scale: TRAY_SCALE, turn: spin(p.dir) };
  }
  private stand(figure: Figure, home: ReturnType<LaserView["home"]>) {
    figure.group.position.copy(home.position);
    figure.group.scale.setScalar(home.scale);
    figure.turn.rotation.y = home.turn;
  }
  protected place(state: State) {
    this.lay(state);
    state.given.forEach((_, g) => this.stand(this.given[g], this.home(state, "given", g)));
    state.tray.forEach((_, j) => {
      if (this.press?.moving && this.press.index === j && this.press.kind !== "given") return;
      this.stand(this.tray[j], this.home(state, "tray", j));
    });
    this.showBeam(state, state.fired ? trace(state) : null, Infinity);
    this.mark(this.marks);
  }

  /*
   * The beam.
   */
  /** A stretch of the beam (or the fading tail of one that leaves the board): three tubes about one line, made as they are needed and kept. */
  private part(k: number, tail = false) {
    const pool = tail ? this.tails : this.rays,
      paints = tail ? this.tailPaint : this.beamPaint;
    while (pool.length <= k) {
      const layers = paints.map((paint, i) => {
        const mesh = new T.Mesh(this.tube, paint);
        mesh.renderOrder = 8 + i;
        mesh.visible = false;
        this.scene.add(mesh);
        return mesh;
      });
      pool.push({ layers, from: new T.Vector3(), to: new T.Vector3(), start: 0 });
    }
    return pool[k];
  }
  private flare(k: number) {
    while (this.flares.length <= k) {
      const sprite = new T.Sprite(this.flarePaint.red);
      sprite.renderOrder = 12;
      sprite.visible = false;
      this.scene.add(sprite);
      this.flares.push({ sprite, at: 0, size: 0.3, phase: 0 });
    }
    return this.flares[k];
  }
  /** Lays a stretch's tubes from its start to `share` of its way. */
  private stretch(ray: Ray, share: number) {
    const length = ray.from.distanceTo(ray.to) * share,
      way = new T.Vector3().subVectors(ray.to, ray.from).normalize(),
      middle = ray.from.clone().addScaledVector(way, length / 2),
      turn = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), way);
    [0.009, 0.026, 0.085].forEach((radius, i) => {
      const mesh = ray.layers[i];
      mesh.visible = share > 0.001;
      mesh.position.copy(middle);
      mesh.quaternion.copy(turn);
      mesh.scale.set(radius, Math.max(0.001, length), radius);
    });
  }
  /**
   * Shows the beam as far as `reach` along it (or none): its stretches, a flare where it strikes and where it leaves
   * the laser, the targets it has lit, the checkpoints it has passed, and the laser's lamp and switch.
   */
  private showBeam(state: State, beam: Beam | null, reach: number) {
    this.shown = beam;
    this.reach = reach;
    const canvas = this.renderer.domElement,
      table = (x: number, z: number) => {
        const at = toTable(x, z, this.aspect);
        return new T.Vector3(at.x, BEAM, at.z);
      };
    let k = 0,
      tails = 0;
    for (const s of beam?.segments ?? []) {
      const ray = this.part(k++);
      ray.from.copy(table(...s.from));
      ray.to.copy(table(...s.to));
      ray.start = s.start;
      const length = ray.from.distanceTo(ray.to) / CELL;
      this.stretch(ray, Math.max(0, Math.min(1, (reach - s.start) / Math.max(1e-6, length))));
      if (!s.leaves) continue;
      // Past the plate's edge the beam fades into the room.
      const tail = this.part(tails++, true),
        way = new T.Vector3().subVectors(ray.to, ray.from).normalize();
      tail.from.copy(ray.to);
      tail.to.copy(ray.to).addScaledVector(way, TAIL * CELL);
      this.stretch(tail, Math.max(0, Math.min(1, (reach - s.start - length) / TAIL)));
    }
    for (; k < this.rays.length; k++) for (const mesh of this.rays[k].layers) mesh.visible = false;
    for (; tails < this.tails.length; tails++) for (const mesh of this.tails[tails].layers) mesh.visible = false;
    // Flares: at the laser's lens and wherever the beam strikes.
    let f = 0;
    if (beam) {
      const source = state.given[0],
        lens = table(...(beam.segments[0]?.from ?? [source.at % SIZE, Math.floor(source.at / SIZE)]));
      const first = this.flare(f++);
      first.sprite.material = this.flarePaint.red;
      first.sprite.position.copy(lens);
      first.at = 0;
      first.size = 0.34;
      first.phase = 0.3;
      for (const strike of beam.strikes) {
        const spark = this.flare(f++);
        spark.sprite.material = strike.kind === "lit" ? this.flarePaint.gold : strike.kind === "pass" ? this.flarePaint.green : this.flarePaint.red;
        spark.sprite.position.copy(table(strike.x, strike.z));
        spark.at = strike.at;
        spark.size = strike.kind === "lit" ? 0.62 : strike.kind === "stop" ? 0.22 : strike.kind === "pass" ? 0.3 : 0.36;
        spark.phase = strike.at * 1.7 + f;
      }
    }
    for (let i = 0; i < this.flares.length; i++) {
      const flare = this.flares[i];
      flare.sprite.visible = i < f && reach >= flare.at;
      flare.sprite.scale.setScalar(flare.size);
    }
    // What the beam has reached: targets lit, checkpoints passed; the laser shows it is on.
    const reached = (cell: number) => !!beam && beam.strikes.some((s) => s.cell === cell && s.at <= reach);
    const pieceAt = (side: "given" | "tray", index: number) => (side === "given" ? state.given[index] : state.tray[index]);
    for (const [side, list] of [
      ["given", this.given],
      ["tray", this.tray],
    ] as const)
      list.forEach((figure, i) => {
        const p = pieceAt(side, i);
        if (!p) return;
        const on = !!beam && p.at >= 0 && reached(p.at);
        const lit = on && beam!.lit.includes(p.at);
        if (figure.disc) figure.disc.material = lit ? this.optics.paint.discOn : this.optics.paint.discOff;
        if (figure.top) figure.top.material = lit ? this.optics.paint.topOn : this.optics.paint.topOff;
        const passed = on && beam!.strikes.some((s) => s.cell === p.at && s.kind === "pass" && s.at <= reach);
        if (figure.ring) figure.ring.material = passed ? this.optics.paint.ringOn : this.optics.paint.ringOff;
        if (figure.bulb) figure.bulb.material = passed ? this.optics.paint.ringOn : this.optics.paint.ringOff;
      });
    const laser = this.given[0];
    if (laser) {
      laser.lens!.material = beam ? this.optics.paint.lensOn : this.optics.paint.lensOff;
      laser.lamp!.material = beam ? this.optics.paint.lampOn : this.optics.paint.lampOff;
      laser.lever!.rotation.x = beam ? -0.55 : 0.55;
    }
    const lit = beam ? beam.lit.filter((cell) => reached(cell)).length : 0;
    canvas.dataset.fired = String(!!beam);
    canvas.dataset.lit = String(lit);
    this.redraw();
    if (beam && reach === Infinity) this.kick();
  }
  /** The flares twinkle and the haze shimmers while the beam is shown (not under reduced motion, nor in a picture). */
  private kick() {
    if (!this.clock && !this.disposed && !this.reducedMotion) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    const t = now / 1000,
      still = capturing();
    let busy = false;
    if (this.shown && this.reach === Infinity) {
      busy = true;
      for (const flare of this.flares) {
        if (!flare.sprite.visible) continue;
        const wave = still ? 1 : 0.82 + 0.18 * Math.sin(t * 7.3 + flare.phase) + 0.08 * Math.sin(t * 19 + flare.phase * 3);
        flare.sprite.scale.setScalar(flare.size * wave);
      }
      (this.beamPaint[2] as T.MeshBasicMaterial).opacity = still ? 0.13 : 0.11 + 0.035 * Math.sin(t * 3.1);
    }
    if (this.arrow.visible && this.state) {
      busy = true;
      const at = cellAt(this.state.given[0].at, this.aspect);
      this.arrow.position.set(at.x, FOOT + 1.05 + 0.07 * Math.sin(t * 4.5), at.z);
    }
    if (busy) {
      this.redraw();
      this.kick();
    }
  };

  /*
   * The hand.
   */
  /** Every piece; the laser's spot is its own, for the hover of a mouse (presses are judged by `pick`). */
  protected spots(): Spot[] {
    return [];
  }
  /** What a press strikes first: a piece's box, or the cell of the board under it. */
  protected pick(ray: T.Ray) {
    const state = this.state;
    if (!state) return null;
    this.scene.updateMatrixWorld(true);
    this.caster.ray.copy(ray);
    const carried = this.press?.moving ? this.press.index : -2,
      proxies = [...this.given.map((f) => f.proxy), ...this.tray.filter((_, j) => j !== carried).map((f) => f.proxy)],
      hit = this.caster.intersectObjects(proxies, false)[0],
      on = new T.Vector3(),
      cell = ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -FOOT), on) ? cellUnder(on.x, on.z, this.aspect) : -1;
    if (!hit) {
      this.struck = { kind: cell >= 0 ? "cell" : "none", index: -1, cell };
      return cell;
    }
    const { side, index } = hit.object.userData as { side: "given" | "tray"; index: number };
    if (side === "given") {
      const p = state.given[index];
      this.struck = { kind: index === 0 ? "laser" : "given", index, cell: p.at };
      return p.at;
    }
    const p = state.tray[index];
    this.struck = { kind: p.at < 0 ? "tray" : "mine", index, cell: p.at };
    return p.at < 0 ? CELLS + index : p.at;
  }
  protected hover() {
    const state = this.state;
    if (!state || this.press?.moving) return;
    const s = this.struck,
      live = state.winner === null && (s.kind === "tray" || s.kind === "mine" || (s.kind === "laser" && !state.fired) || (s.kind === "given" && !state.given[s.index].locked));
    this.renderer.domElement.style.cursor = live ? "pointer" : "default";
  }
  /** Every press is taken here: a piece of mine pressed and moved is carried; a press let go where it began is a tap. */
  protected dragStart() {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    this.press = { ...this.struck, x: this.pointer.x, y: this.pointer.y, moving: false };
    return true;
  }
  /** The move a carried piece makes if let go over `cell` (-1 off the board), or null when it goes nowhere. */
  private carryMove(state: State, j: number, cell: number, off: boolean): Move | null {
    const p = state.tray[j];
    if (p.at < 0) return cell >= 0 ? { from: CELLS + j, to: cell, extra: -1 } : null;
    if (cell < 0) return off ? { from: p.at, to: CELLS + j, extra: -1 } : null;
    return cell === p.at ? null : { from: p.at, to: cell, extra: -1 };
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const press = this.press,
      state = this.state;
    if (!press || !state || (press.kind !== "tray" && press.kind !== "mine")) return;
    if (!press.moving && Math.hypot(this.pointer.x - press.x, this.pointer.y - press.y) < 7) return;
    press.moving = true;
    this.renderer.domElement.style.cursor = "grabbing";
    const j = press.index,
      figure = this.tray[j],
      cell = cellUnder(at.x, at.z, this.aspect);
    figure.group.scale.setScalar(1);
    figure.group.position.set(at.x, CARRY, at.z);
    this.rings.aim.visible = this.rings.refuse.visible = false;
    const move = cell >= 0 ? this.carryMove(state, j, cell, false) : null,
      next = move ? attempt(state, move) : null;
    if (cell >= 0 && move) this.ringOnCell(next && typeof next !== "string" ? this.rings.aim : this.rings.refuse, cell);
    // Once something moves, the beam is gone.
    if (this.shown) this.showBeam(state, null, 0);
    this.redraw();
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    this.rings.aim.visible = this.rings.refuse.visible = false;
    this.renderer.domElement.style.cursor = "default";
    if (!press || !state) return;
    if (!press.moving) {
      if (!at) return;
      // A tap: the laser fires; a piece on the board turns; a tray piece or a cell is chosen (for a tap there next).
      if (press.kind === "laser") return this.onMove({ from: -1, to: GO, extra: -1 });
      if (press.kind === "mine" || press.kind === "given") return this.onMove({ from: press.cell, to: press.cell, extra: -1 });
      if (press.kind === "tray") return this.onPick(CELLS + press.index);
      return this.onPick(press.cell);
    }
    if (press.kind !== "tray" && press.kind !== "mine") return;
    const j = press.index,
      figure = this.tray[j],
      cell = at ? cellUnder(at.x, at.z, this.aspect) : -1,
      move = at ? this.carryMove(state, j, cell, !onPlate(at.x, at.z, this.aspect)) : null;
    if (move) {
      this.dropped = { piece: j, at: figure.group.position.clone() };
      this.onMove(move);
      if (this.state !== state) return;
      this.dropped = null;
    }
    // Back where it was, and its beam with it.
    const from = figure.group.position.clone(),
      fromScale = figure.group.scale.x,
      to = this.home(state, "tray", j);
    this.tween(0, 220, (p) => {
      const e = 1 - (1 - p) ** 3;
      figure.group.position.lerpVectors(from, to.position, e);
      figure.group.scale.setScalar(fromScale + (to.scale - fromScale) * e);
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    if (last.kind === "fire") {
      const beam = trace(state),
        far = beam.segments.reduce((most, s) => Math.max(most, s.start + Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) + (s.leaves ? TAIL : 0)), 0),
        ms = Math.max(BEAM_MIN, Math.min(BEAM_MAX, (far / BEAM_SPEED) * 1000)),
        strikes = beam.strikes.filter((s) => s.kind === "lit" || s.kind === "stop").sort((a, b) => a.at - b.at);
      let heard = 0;
      this.onKnock?.("disc", 0.8);
      this.showBeam(state, beam, 0);
      this.tween(0, ms, (p) => {
        const reach = p * far;
        this.showBeam(state, beam, p >= 1 ? Infinity : reach);
        for (; heard < strikes.length && strikes[heard].at <= reach; heard++) this.onKnock?.(strikes[heard].kind === "lit" ? "pocket" : "cushion", 0.6);
      });
      return true;
    }
    this.showBeam(state, null, 0);
    const side = last.side,
      figure = side === "given" ? this.given[last.index] : this.tray[last.index];
    if (!figure) return false;
    const to = this.home(state, side, last.index),
      dropped = side === "tray" && this.dropped?.piece === last.index ? this.dropped : null,
      was = this.home(before, side, last.index),
      from = dropped ? { ...was, position: dropped.at, scale: 1 } : was,
      turning = last.kind === "turn" && !dropped;
    this.dropped = null;
    let turnTo = to.turn;
    while (turnTo - from.turn > Math.PI) turnTo -= Math.PI * 2;
    while (turnTo - from.turn < -Math.PI) turnTo += Math.PI * 2;
    let landed = false;
    this.tween(0, turning ? 240 : 340, (p) => {
      const q = turning ? p * p * (3 - 2 * p) : travel(p);
      figure.group.position.set(
        from.position.x + (to.position.x - from.position.x) * q,
        from.position.y + (to.position.y - from.position.y) * q + hop(p) * (turning ? 0.06 : dropped ? 0.1 : 0.35),
        from.position.z + (to.position.z - from.position.z) * q,
      );
      figure.group.scale.setScalar(from.scale + (to.scale - from.scale) * q);
      figure.turn.rotation.y = from.turn + (turnTo - from.turn) * q;
      if (!landed && p >= (turning ? 0.98 : 0.84)) {
        landed = true;
        this.onContact();
      }
    });
    return true;
  }

  /*
   * Marks.
   */
  private ringOnCell(ring: T.Mesh, cell: number) {
    const at = cellAt(cell, this.aspect);
    ring.visible = true;
    ring.position.set(at.x, FOOT + 0.008, at.z);
  }
  private ringOnPoint(ring: T.Mesh, state: State, point: number | null | undefined) {
    ring.visible = false;
    if (point === null || point === undefined || point < 0) return;
    if (point < CELLS) return this.ringOnCell(ring, point);
    const j = point - CELLS;
    if (j >= state.tray.length) return;
    const p = state.tray[j];
    if (p.at >= 0) return this.ringOnCell(ring, p.at);
    const at = trayPlaces(state.tray.length, this.aspect)[j];
    ring.visible = true;
    ring.position.set(at.x, TRAY_TOP + 0.008, at.z);
  }
  /** The gold ghost of a piece where the hint sets it, turned as it should be. */
  private ghost(kind: Kind) {
    let ghost = this.ghosts.get(kind);
    if (!ghost) {
      ghost = this.optics.ghost(kind, this.ghostPaint);
      ghost.group.visible = false;
      this.scene.add(ghost.group);
      this.ghosts.set(kind, ghost);
    }
    return ghost;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const hint = marks.hint ?? null,
      occ = occupancy(state),
      G = state.given.length;
    this.ringOnPoint(this.rings.cursor, state, marks.cursor);
    this.ringOnPoint(this.rings.chosen, state, hint ? null : marks.selected);
    this.targets.forEach((ring, k) => this.ringOnPoint(ring, state, hint || marks.selected === null ? null : (marks.targets[k] ?? null)));
    for (const ghost of this.ghosts.values()) ghost.group.visible = false;
    this.rings.from.visible = this.rings.to.visible = this.rings.laser.visible = false;
    if (hint && (hint.to === GO || (hint.from === -1 && hint.to === state.given[0].at))) this.ringOnCell(this.rings.laser, state.given[0].at);
    else if (hint) {
      this.ringOnPoint(this.rings.from, state, hint.from);
      const id = hint.from >= CELLS ? G + hint.from - CELLS : hint.from >= 0 ? occ[hint.from] : -1,
        piece = id < 0 ? null : id < G ? state.given[id] : state.tray[id - G];
      if (piece && hint.to >= PUT) {
        const cell = Math.floor((hint.to - PUT) / 4),
          dir = (hint.to - PUT) % 4,
          ghost = this.ghost(piece.kind),
          at = cellAt(cell, this.aspect);
        ghost.group.visible = true;
        ghost.group.position.set(at.x, FOOT + 0.004, at.z);
        ghost.turn.rotation.y = spin(dir);
        this.ringOnCell(this.rings.to, cell);
      } else if (hint.to >= CELLS && hint.to < CELLS + state.tray.length) {
        const at = trayPlaces(state.tray.length, this.aspect)[hint.to - CELLS];
        this.rings.to.visible = true;
        this.rings.to.position.set(at.x, TRAY_TOP + 0.008, at.z);
      }
    }
    // After a firing that did not solve it: red rings round the pieces the beam missed and those left in the tray.
    for (const ring of this.warnings) ring.visible = false;
    if (state.fired && state.winner === null && !this.animating && !capturing()) {
      const verdict = judge(state),
        points = [...verdict.untouched.map((id) => (id < G ? state.given[id].at : state.tray[id - G].at)), ...verdict.left.map((j) => CELLS + j)];
      points.slice(0, this.warnings.length).forEach((point, k) => this.ringOnPoint(this.warnings[k], state, point));
    }
    // While every piece is set and the laser has not been fired, an arrow points at it.
    const ready = state.winner === null && !state.fired && state.tray.every((p) => p.at >= 0) && !capturing() && !hint;
    this.arrow.visible = ready;
    if (ready) {
      const at = cellAt(state.given[0].at, this.aspect);
      this.arrow.position.set(at.x, FOOT + 1.05, at.z);
      this.kick();
    }
    this.redraw();
  }
  dispose() {
    for (const shape of this.caseShapes) shape.dispose();
    this.caseShapes = [];
    cancelAnimationFrame(this.clock);
    this.clock = 0;
    this.host.removeEventListener("pointerdown", this.hear, true);
    this.host.removeEventListener("pointermove", this.hear, true);
    super.dispose();
  }
}
/** The keyboard's points: the cells as they lie on the table, then the tray's places. */
export function laserKeyPoints(state: State) {
  const canvas = typeof document === "undefined" ? null : document.querySelector<HTMLCanvasElement>("#board canvas");
  return keyPlaces(state.tray.length, canvas?.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1);
}
