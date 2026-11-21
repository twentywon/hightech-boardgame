import * as T from "three";
import { block, capable, glossy, hop, travel } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { BOARD_TOP, BULB_Y, CELL, GLOW_MS, REACH, RUN_MS, bulbSubject, cellAt, cellUnder } from "./layout";
import type { Move } from "../points/types";
import { benchProps, bench, spanOf, bulbKit, canvasOf, emptySockets, flickerOn, framedBoard, makeBulb, placesOf, sequence, shine, textureOf, workshop, type Bulb, type Kit } from "./kit";
import { BOX, BULB, type State } from "./rules";

export const BULB_COLORS: [string, string] = ["#ffc35a", "#6c7178"];
/** Where a wire leaves a socket, how high its ends sit and how thick it is. */
const WIRE_OUT = 0.3,
  WIRE_Y = 0.055,
  WIRE_R = 0.022,
  WIRE_SEGMENTS = 48,
  WIRE_SIDES = 7;
/** A cloth-covered cable's braid: two tones of red woven on the slant, repeated along the wire. */
function braid() {
  const { c, ctx } = canvasOf(64, 32);
  ctx.fillStyle = "#8f2f22";
  ctx.fillRect(0, 0, 64, 32);
  for (let k = -4; k < 12; k++) {
    ctx.fillStyle = k % 2 ? "#b8442f" : "#6e2219";
    ctx.beginPath();
    ctx.moveTo(k * 8, 0);
    ctx.lineTo(k * 8 + 6, 0);
    ctx.lineTo(k * 8 + 6 + 16, 32);
    ctx.lineTo(k * 8 + 16, 32);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 220, 190, 0.18)";
  for (let y = 0; y < 32; y += 4) ctx.fillRect(0, y, 64, 1);
  const t = textureOf(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** The label round the battery: black, with a copper band and a plus sign. */
function batteryLabel() {
  const { c, ctx } = canvasOf(256, 64);
  ctx.fillStyle = "#1c1d20";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#c8793a";
  ctx.fillRect(176, 0, 80, 64);
  ctx.fillStyle = "#f2e6d0";
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("+", 216, 33);
  ctx.fillStyle = "#e9e3d6";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("1.5V", 92, 33);
  return textureOf(c);
}
/** A wire laid from one bulb to the next. */
interface Wire {
  from: number;
  to: number;
  mesh: T.Mesh;
  curve: T.CubicBezierCurve3;
}
/**
 * An electrician's workbench: a pegboard panel on a framed board lies on a wooden bench, a socket of white porcelain
 * at every place of the grid. Some sockets hold a glass bulb (clear glass, a coiled filament on two supports, a brass
 * screw base); grey junction boxes with four screws stand on others. A bulb is dark until the wire reaches it, then it
 * flickers on and glows warm, with a halo and a pool of light on the board. Each wire is a red cloth-covered cable
 * drawn from socket to socket in a low arch over the empty sockets between (no wire passes over a bulb); it runs out from the head with
 * a spark at its tip. The first bulb lit is joined to a battery that hops over to it. When everything is lit the bulbs
 * flare one after another along the wire. Marks: the head's blue ring, faint rings round the bulbs the wire can reach,
 * the hint's gold ring and the keyboard's white one (all left out of a picture taken for the collection).
 */
export class BulbLinkView extends TableView<State> {
  private size = 0;
  private cells: number[] | null = null;
  private bulbs = new Map<number, Bulb>();
  private boxes = new Map<number, T.Group>();
  private wires: Wire[] = [];
  private layer = new T.Group();
  private wireLayer = new T.Group();
  private kit: Kit;
  private paint: Record<string, T.Material> = {};
  private shapes: Record<string, T.BufferGeometry> = {};
  private textures: Record<string, T.Texture> = {};
  /** What belongs to the board laid now (made again for another board). */
  private boardOwned: { dispose(): void }[] = [];
  private battery: T.Group;
  private lead: T.Mesh | null = null;
  private spark: T.Sprite;
  private pulse: T.Sprite;
  private headRing: T.Mesh;
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private cursorRing: T.Mesh;
  private reachRings: T.Mesh[] = [];
  private hovered = -1;
  private hinted = -1;
  private headCell = -1;
  private press: { cell: number; x: number; z: number } | null = null;
  private caster = new T.Raycaster();
  private live: boolean;
  private soft: boolean;
  private clock = 0;
  /** The celebration's start (performance time), or 0. */
  private flareAt = 0;
  /**
   * Taps are taken while a wire is laid, so that the screen can keep them and play them in order (`queueMoves: "all"`).
   * The table counts as moving only while the wire runs out (`running`) and during the celebration (`finale`): the
   * bulb's flicker as it comes on runs on its own frames (`flickering`), so the next wire can start under it.
   */
  protected pressWhileMoving = true;
  private running = false;
  private finale = false;
  private flickering = new Set<number>();
  get animating() {
    return this.running || (super.animating && this.finale);
  }
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a221c");
    this.soft = !capable();
    this.live = !this.soft && !this.reducedMotion;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The workshop's light, the bench, the board's frame and the bulbs are shared with lights on (`kit.ts`).
    workshop(this.scene, keep);
    this.kit = bulbKit(keep, this.soft);
    this.textures.glow = this.kit.glow;
    const p = <M extends T.Material>(name: string, material: M) => (this.paint[name] = keep(material));
    const g = (name: string, geometry: T.BufferGeometry) => (this.shapes[name] = keep(geometry));
    this.textures.braid = keep(braid());
    p("steel", glossy({ color: "#8d949b", roughness: 0.42, metalness: 0.75 }, 0.3));
    p("lid", glossy({ color: "#a4abb2", roughness: 0.38, metalness: 0.7 }, 0.3));
    this.paint.screw = this.kit.paint.screw;
    p("slot", new T.MeshStandardMaterial({ color: "#3b3e42", roughness: 0.6 }));
    p("cable", new T.MeshStandardMaterial({ map: this.textures.braid, roughness: 0.85 }));
    p("lead", new T.MeshStandardMaterial({ color: "#c7322a", roughness: 0.5 }));
    p("label", new T.MeshStandardMaterial({ map: keep(batteryLabel()), roughness: 0.45, metalness: 0.2 }));
    p("cap", glossy({ color: "#c9cbcd", roughness: 0.25, metalness: 0.9 }));
    p("rubber", new T.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.8 }));

    bench(this.scene, this.kit, keep);
    // A junction box: a grey steel box with a lid, four screws and a cable gland.
    g("box", block(0.74, 0.32, 0.74, 0.05));
    g("lid", block(0.66, 0.03, 0.66, 0.012));
    g("screwHead", new T.CylinderGeometry(0.035, 0.035, 0.018, 14));
    g("slot", new T.BoxGeometry(0.056, 0.006, 0.01));
    g("gland", new T.CylinderGeometry(0.07, 0.08, 0.07, 16).rotateX(Math.PI / 2));
    this.scene.add(this.layer, this.wireLayer);

    // The battery, lying on its side, a red lead from its plus end; and the spark that runs along a new wire.
    this.battery = new T.Group();
    const cellBody = new T.Mesh(keep(new T.CylinderGeometry(0.075, 0.075, 0.36, 24, 1, true).rotateZ(Math.PI / 2)), this.paint.label);
    const ends = new T.Mesh(keep(new T.CylinderGeometry(0.073, 0.073, 0.364, 24).rotateZ(Math.PI / 2)), this.paint.cap);
    const nub = new T.Mesh(keep(new T.CylinderGeometry(0.028, 0.028, 0.03, 14).rotateZ(Math.PI / 2).translate(0.195, 0, 0)), this.paint.cap);
    for (const m of [cellBody, ends, nub]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.battery.add(m);
    }
    this.battery.children.forEach((m) => (m.position.y = 0.075));
    this.scene.add(this.battery);
    const sparkPaint = keep(new T.SpriteMaterial({ map: this.textures.glow, color: "#fff2c4", transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    this.spark = new T.Sprite(sparkPaint);
    this.spark.scale.setScalar(0.36);
    this.spark.visible = false;
    this.pulse = new T.Sprite(keep(sparkPaint.clone()));
    this.pulse.scale.setScalar(0.22);
    this.pulse.visible = false;
    this.scene.add(this.spark, this.pulse);

    // Marks.
    this.headRing = ringMesh(keep, 0.31, 0.4, "#46d2ff");
    this.hintRing = ringMesh(keep, 0.33, 0.44, "#ffc21f");
    this.cursorRing = ringMesh(keep, 0.4, 0.45, "#ffffff");
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(0.44, 32)), keep(new T.MeshBasicMaterial({ color: "#ffd56a", transparent: true, opacity: 0.35, depthWrite: false })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    for (let k = 0; k < 8; k++) {
      const ring = ringMesh(keep, 0.32, 0.36, "#d8f4ff");
      (ring.material as T.MeshBasicMaterial).opacity = 0.75;
      this.reachRings.push(ring);
      this.scene.add(ring);
    }
    this.scene.add(this.headRing, this.hintRing, this.cursorRing, this.hintGlow);
    this.begin();
    this.kick();
  }
  /** The board's frame, pegboard, sockets, bulbs and boxes for the cells of `state`, made anew. */
  private build(state: State) {
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    this.layer.clear();
    this.bulbs.clear();
    this.boxes.clear();
    this.clearWires();
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r);
    const n = (this.size = state.size);
    this.cells = state.cells;
    const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], parent: T.Object3D, shadow = true) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    framedBoard(this.layer, n, this.kit, keep);
    // An empty socket where there is no bulb (a box stands on one too); a bulb in its black socket where there is.
    emptySockets(this.layer, this.kit, n, state.cells.flatMap((kind, i) => (kind === BULB ? [] : [i])));
    for (let cell = 0; cell < n * n; cell++) {
      const at = cellAt(n, cell);
      if (state.cells[cell] === BULB) this.bulbs.set(cell, makeBulb(this.layer, this.kit, n, cell, keep));
      else if (state.cells[cell] === BOX) {
        const box = new T.Group(),
          rand = sequence(cell * 104729 + 5);
        add(this.shapes.box, this.paint.steel, box).position.y = 0.16 + 0.002;
        add(this.shapes.lid, this.paint.lid, box).position.y = 0.335;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const head = add(this.shapes.screwHead, this.paint.screw, box, false);
          head.position.set(sx * 0.27, 0.354, sz * 0.27);
          const slot = add(this.shapes.slot, this.paint.slot, box, false);
          slot.position.set(sx * 0.27, 0.364, sz * 0.27);
          slot.rotation.y = rand() * Math.PI;
        }
        add(this.shapes.gland, this.paint.rubber, box).position.set(0, 0.16, 0.39);
        box.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2);
        box.position.set(at.x, 0, at.z);
        box.userData.cell = cell;
        this.layer.add(box);
        this.boxes.set(cell, box);
      }
    }
    // A spool of wire and a screwdriver on the bench beside the board.
    benchProps(this.layer, this.kit, spanOf(n), keep);
  }
  /** Where a wire from `a` to `b` runs: a low arch over the empty sockets between (no wire passes over a bulb). */
  private curveOf(a: number, b: number, index: number) {
    const n = this.size,
      A = cellAt(n, a),
      B = cellAt(n, b),
      dx = B.x - A.x,
      dz = B.z - A.z,
      length = Math.hypot(dx, dz),
      ux = dx / length,
      uz = dz / length;
    const lift = Math.min(0.42, 0.12 + 0.05 * length),
      side = (sequence(index * 31 + a * 7 + b)() - 0.5) * 0.1,
      px = -uz * side,
      pz = ux * side;
    const p0 = new T.Vector3(A.x + ux * WIRE_OUT, WIRE_Y, A.z + uz * WIRE_OUT),
      p3 = new T.Vector3(B.x - ux * WIRE_OUT, WIRE_Y, B.z - uz * WIRE_OUT),
      reach = Math.min(0.35, length * 0.16);
    return new T.CubicBezierCurve3(
      p0,
      new T.Vector3(p0.x + ux * reach + px, WIRE_Y + lift * 1.3, p0.z + uz * reach + pz),
      new T.Vector3(p3.x - ux * reach + px, WIRE_Y + lift * 1.3, p3.z - uz * reach + pz),
      p3,
    );
  }
  private wireFor(a: number, b: number, index: number): Wire {
    const curve = this.curveOf(a, b, index),
      geometry = new T.TubeGeometry(curve, WIRE_SEGMENTS, WIRE_R, WIRE_SIDES, false),
      uv = geometry.getAttribute("uv"),
      along = curve.getLength() * 7;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * along);
    const mesh = new T.Mesh(geometry, this.paint.cable);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.wireLayer.add(mesh);
    return { from: a, to: b, mesh, curve };
  }
  private clearWires() {
    for (const w of this.wires) {
      w.mesh.geometry.dispose();
      this.wireLayer.remove(w.mesh);
    }
    this.wires = [];
  }
  /** The wires of `path`: those already laid kept, others made or taken away. */
  private layWires(path: number[]) {
    let keepCount = 0;
    while (keepCount < this.wires.length && keepCount + 1 < path.length && this.wires[keepCount].from === path[keepCount] && this.wires[keepCount].to === path[keepCount + 1]) keepCount++;
    for (const w of this.wires.splice(keepCount)) {
      w.mesh.geometry.dispose();
      this.wireLayer.remove(w.mesh);
    }
    for (let i = this.wires.length + 1; i < path.length; i++) this.wires.push(this.wireFor(path[i - 1], path[i], i));
    for (const w of this.wires) w.mesh.geometry.setDrawRange(0, Infinity);
  }
  /** Sets a bulb's brightness: 0 dark, 1 lit; above 1 while it flares. */
  private shine(bulb: Bulb, glow: number) {
    shine(this.kit, bulb, glow);
  }
  /** The battery: beside the first bulb lit, or at rest on the near edge of the frame. */
  private batteryAt(state: State) {
    const n = this.size;
    if (!state.path.length) {
      const edge = ((n * CELL + 0.7) / 2) + 0.12;
      return { x: -edge + 0.6, z: edge, turn: 0, y: -0.06 };
    }
    const start = state.path[0],
      at = cellAt(n, start),
      r = Math.floor(start / n),
      c = start % n;
    // The corner of its cell with the most room: away from other bulbs on that diagonal and inside the board.
    let best = { sx: 1, sz: 1 },
      score = -Infinity;
    for (const [sx, sz] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const rr = r + sz,
        cc = c + sx,
        inside = rr >= 0 && cc >= 0 && rr < n && cc < n,
        kind = inside ? state.cells[rr * n + cc] : 0,
        value = (kind === 0 ? 2 : 0) + (sz > 0 ? 0.5 : 0) + (sx > 0 ? 0.25 : 0) + (inside ? 0 : 1);
      if (value > score) {
        score = value;
        best = { sx, sz };
      }
    }
    return { x: at.x + best.sx * 0.42, z: at.z + best.sz * 0.42, turn: Math.atan2(best.sz, -best.sx), y: 0 };
  }
  /** The red lead from the battery's plus end to its bulb's socket. */
  private layLead(state: State) {
    if (this.lead) {
      this.lead.geometry.dispose();
      this.scene.remove(this.lead);
      this.lead = null;
    }
    if (!state.path.length) return;
    const b = this.batteryAt(state),
      at = cellAt(this.size, state.path[0]),
      plus = new T.Vector3(b.x + Math.cos(b.turn) * 0.2, b.y + 0.075, b.z - Math.sin(b.turn) * 0.2),
      to = new T.Vector3(at.x + (b.x - at.x) * 0.45, WIRE_Y, at.z + (b.z - at.z) * 0.45),
      curve = new T.QuadraticBezierCurve3(plus, new T.Vector3((plus.x + to.x) / 2, 0.16, (plus.z + to.z) / 2), to);
    this.lead = new T.Mesh(new T.TubeGeometry(curve, 16, 0.014, 6, false), this.paint.lead);
    this.lead.castShadow = true;
    this.scene.add(this.lead);
  }
  protected subject(aspect: number): TableSubject {
    return bulbSubject(this.size || 5, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null) return [];
    return state.cells.map((kind, i) => ({ ...cellAt(state.size, i), y: kind === BULB ? BULB_Y : BOARD_TOP, r: REACH, point: i }));
  }
  /** What a ray points at: the bulb or box it strikes first, else the socket under it on the board. */
  protected pick(ray: T.Ray): number | null {
    const state = this.state;
    if (!state || state.winner !== null) return -1;
    this.caster.ray.copy(ray);
    for (const hit of this.caster.intersectObjects(this.layer.children.filter((o) => o.userData.cell !== undefined), true)) {
      for (let o: T.Object3D | null = hit.object; o; o = o.parent) if (o.userData.cell !== undefined) return o.userData.cell as number;
    }
    const at = new T.Vector3();
    return ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -BOARD_TOP), at) ? cellUnder(state.size, at.x, at.z) : -1;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    this.hovered = point;
    this.mark(this.marks);
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here, so that a press on a box or an empty socket is a move too (and refused with words).
    this.press = { cell: point, x: at.x, z: at.z };
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    if (!press || !at || !state || state.winner !== null || press.cell < 0) return;
    // A tap: let go near where it was pressed (a finger that slides far away has changed its mind).
    if (Math.hypot(at.x - press.x, at.z - press.z) > CELL * 0.9) return;
    // The screen plays it, keeps it until the wire running now has arrived, or refuses it (then `refused` shakes it).
    this.onMove({ from: -1, to: press.cell, extra: -1 });
  }
  /** The screen refused a tap of mine (now or when its turn in the queue came): the bulb or box tapped shakes. */
  refused(move: Move) {
    this.shake(move.to);
  }
  sync(state: State, animate = true) {
    this.running = this.finale = false;
    super.sync(state, animate);
  }
  /** A bulb coming on: a flicker before it holds steady, on its own frames (taken back, it stops). */
  private flicker(bulb: Bulb) {
    const start = performance.now(),
      cell = bulb.cell;
    this.flickering.add(cell);
    const step = (now: number) => {
      if (this.disposed || this.bulbs.get(cell) !== bulb || !this.state?.lit[cell]) {
        this.flickering.delete(cell);
        return;
      }
      const p = Math.min(1, (now - start) / GLOW_MS);
      this.shine(bulb, flickerOn(p));
      this.redraw();
      if (p < 1) requestAnimationFrame(step);
      else this.flickering.delete(cell);
    };
    step(start);
  }
  /**
   * A bulb or box that may not be chosen shakes a little in its socket. It runs on its own frames, not as a tween, so
   * that it neither holds the next tap back nor counts as the table moving.
   */
  private shake(cell: number) {
    const object = this.bulbs.get(cell)?.root ?? this.boxes.get(cell);
    if (!object || this.reducedMotion) return;
    const start = performance.now(),
      step = (now: number) => {
        if (this.disposed) return;
        const p = Math.min(1, (now - start) / 360);
        object.rotation.z = p < 1 ? Math.sin(p * Math.PI * 5) * 0.12 * (1 - p) : 0;
        this.redraw();
        if (p < 1) requestAnimationFrame(step);
      };
    requestAnimationFrame(step);
  }
  protected place(state: State) {
    // A board not built yet (or another one): built, and the camera set for its size, which lays it out again.
    if (state.cells !== this.cells || state.size !== this.size) {
      this.build(state);
      this.resize();
    }
    this.layWires(state.path);
    const won = state.winner === 0;
    for (const bulb of this.bulbs.values()) {
      // A bulb still flickering on is left to its flicker.
      if (!state.lit[bulb.cell] || !this.flickering.has(bulb.cell)) this.shine(bulb, state.lit[bulb.cell] ? (won ? 1.08 : 1) : 0);
      bulb.root.position.y = 0;
    }
    const b = this.batteryAt(state);
    this.battery.position.set(b.x, b.y, b.z);
    this.battery.rotation.set(0, b.turn, 0);
    this.layLead(state);
    this.spark.visible = false;
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.cells !== state.cells) return false;
    const bulb = this.bulbs.get(last.to);
    if (!bulb) return false;
    let lightAt = 0;
    if (last.from < 0) {
      // The battery hops over to the first bulb, its lead comes, and the bulb lights.
      const from = this.batteryAt(before),
        to = this.batteryAt(state);
      this.layLead(before);
      this.tween(0, 420, (p) => {
        const t = travel(p);
        this.battery.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t + hop(p) * 0.5, from.z + (to.z - from.z) * t);
        this.battery.rotation.y = from.turn + (to.turn - from.turn) * t;
        if (p === 1) this.layLead(state);
      });
      lightAt = 380;
    } else {
      // The wire runs out from the head, a spark at its tip, and the bulb comes on as it arrives.
      this.layWires(state.path);
      const wire = this.wires[this.wires.length - 1],
        geometry = wire.mesh.geometry;
      geometry.setDrawRange(0, 0);
      const ms = RUN_MS * Math.min(1.6, 0.7 + wire.curve.getLength() * 0.18);
      this.spark.visible = true;
      this.tween(0, ms, (p) => {
        const e = 1 - (1 - p) ** 2,
          rows = Math.ceil(e * WIRE_SEGMENTS);
        geometry.setDrawRange(0, rows * WIRE_SIDES * 6);
        this.spark.position.copy(wire.curve.getPoint(e));
        this.spark.scale.setScalar(0.3 + 0.08 * Math.sin(p * 40));
        if (p === 1) this.spark.visible = false;
      });
      lightAt = ms - 20;
    }
    // On: a click and a flicker before it holds steady. As the wire arrives the table counts as at rest, so that a tap
    // given ahead starts the next wire while this bulb still flickers on.
    this.running = true;
    this.shine(bulb, 0);
    this.tween(lightAt, 1, (p) => {
      if (p < 1 || !this.running) return;
      this.onContact();
      this.flicker(bulb);
      this.running = false;
      this.onSettled();
    });
    if (state.winner === 0) {
      this.finale = true;
      // Everything lit: a wave of light along the wire, from the battery to the last bulb.
      const start = lightAt + GLOW_MS + 120;
      state.path.forEach((cell, k) => {
        const b = this.bulbs.get(cell)!;
        this.tween(start + k * 70, 520, (p) => this.shine(b, 1 + Math.sin(p * Math.PI) * 0.9 + p * 0.08));
      });
      this.flareAt = performance.now() + start;
    }
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state || !this.cells) return;
    const n = this.size,
      live = state.winner === null && !capturing(),
      hint = live && marks.hint ? marks.hint.to : -1,
      cursor = live ? (marks.cursor ?? (this.hovered >= 0 && state.cells[this.hovered] === BULB && !state.lit[this.hovered] ? this.hovered : -1)) : -1,
      headCell = state.path.length ? state.path[state.path.length - 1] : -1,
      ringAt = (ring: T.Mesh, cell: number, lift = 0) => {
        const at = cellAt(n, cell);
        ring.position.set(at.x, BOARD_TOP + 0.067 + lift, at.z);
      };
    this.hinted = hint;
    this.headCell = live ? headCell : -1;
    this.hintRing.visible = this.hintGlow.visible = hint >= 0;
    if (hint >= 0) {
      ringAt(this.hintRing, hint, 0.002);
      ringAt(this.hintGlow, hint, -0.001);
    }
    this.headRing.visible = this.headCell >= 0;
    if (this.headCell >= 0) ringAt(this.headRing, this.headCell, 0.001);
    this.cursorRing.visible = cursor >= 0;
    if (cursor >= 0) ringAt(this.cursorRing, cursor, 0.003);
    // The bulbs the wire can reach, once it has begun.
    const targets = live && state.path.length ? marks.targets.filter((cell) => cell !== hint) : [];
    this.reachRings.forEach((ring, k) => {
      ring.visible = k < targets.length;
      if (ring.visible) ringAt(ring, targets[k]);
    });
    // For browser tests: the bulbs, the boxes, the path lit, the head, the hint, the bulbs the wire reaches, and where every cell lies on the canvas.
    const el = this.renderer.domElement;
    el.dataset.size = String(n);
    el.dataset.bulbs = [...this.bulbs.keys()].join(" ");
    el.dataset.boxes = [...this.boxes.keys()].join(" ");
    el.dataset.lit = state.path.join(" ");
    el.dataset.head = String(headCell);
    el.dataset.hint = String(hint);
    el.dataset.reach = (state.path.length && state.winner === null ? marks.targets : []).join(" ");
    el.dataset.places = this.places(state);
    this.redraw();
  }
  /** Where every cell is on the canvas (a bulb at its glass, anything else at the board), in CSS pixels, "x,y" joined by spaces. */
  private places(state: State) {
    return placesOf(this.camera, this.renderer.domElement, state.size, (cell) => state.cells[cell] === BULB);
  }
  /** The bench's own frame loop: the head's ring breathes, the hint glows, and a pulse of current runs along the wire. */
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
    if (this.headCell >= 0) {
      (this.headRing.material as T.MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(t * 3.2);
      this.headRing.scale.setScalar(1 + 0.05 * Math.sin(t * 3.2));
    }
    if (this.hinted >= 0) (this.hintGlow.material as T.MeshBasicMaterial).opacity = 0.25 + 0.18 * Math.sin(t * 4);
    // A pulse runs from the battery along the wires every few seconds, a quarter second a wire.
    const state = this.state;
    const wires = this.wires;
    if (!state || !wires.length || this.animating || capturing()) {
      this.pulse.visible = false;
      return;
    }
    const each = 0.28,
      period = wires.length * each + 2.4,
      into = (t % period) / each,
      k = Math.floor(into);
    this.pulse.visible = k < wires.length;
    if (this.pulse.visible) {
      this.pulse.position.copy(wires[k].curve.getPoint(into - k));
      this.pulse.position.y += WIRE_R;
    }
    // The lit bulbs hum: a faint, slow breathing of their glow (stronger for a moment after the celebration).
    const after = this.flareAt ? Math.max(0, 1 - (performance.now() - this.flareAt) / 6000) : 0;
    for (const bulb of this.bulbs.values())
      if (state.lit[bulb.cell] && !this.flickering.has(bulb.cell)) this.shine(bulb, (state.winner === 0 ? 1.08 : 1) + 0.03 * Math.sin(t * 2.1 + bulb.cell) + after * 0.05 * Math.sin(t * 5 + bulb.cell));
  }
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    this.clearWires();
    this.lead?.geometry.dispose();
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    super.dispose();
  }
}
