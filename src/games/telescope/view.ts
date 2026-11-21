import * as T from "three";
import { block, capable, glossy, planks, wood } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Marks } from "../points/view";
import type { Move } from "../points/types";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { AXIS_Y, BALL_R, BOARD_TOP, CELL, DROP_MS, HOLE_R, REACH_TAP, STEP_MS, WAY, cellAt, spanOf, telescopeSubject } from "./layout";
import { REACHES, stepFrom, type Reach, type State } from "./rules";

export const TELESCOPE_COLORS: [string, string] = ["#c9a14a", "#6c7178"];
/**
 * The lacquer of each kind, by reach: the dew cap and ring at the tip tell how far the
 * telescope draws out (green 2 cells beyond its base, yellow 3, purple 4). Clear, saturated colours that stand apart
 * from the brass, the yellow a lemon one so that it does not pass for brass.
 */
export const COLOUR_OF: Record<Reach, string> = { 2: "#1fb04a", 3: "#fff02a", 4: "#8a3ee0" };
/**
 * The nested tubes of a telescope: the base (widest, with a leather grip and the eyepiece behind it) and as many draw
 * tubes as cells it can reach (2, 3 or 4), each a little narrower, that slide out one from inside the other. Along the
 * telescope's own x, from the base's middle: the base spans `BASE_BACK`..`BASE_FRONT`, a draw tube at offset o spans
 * o − `DRAW_BACK`..o + `DRAW_FRONT`, and the last carries the dew cap to o + `TIP`, where a ball one cell on rests
 * against it. Fully drawn out, the last tube is at its reach, so the telescope stands on exactly its cells.
 */
const BASE_R = 0.19,
  BASE_BACK = -0.42,
  BASE_FRONT = 0.42,
  /** The widest and the narrowest draw tube; those between are spaced evenly. */
  DRAW_WIDEST = 0.168,
  DRAW_NARROWEST = 0.103,
  /** The radii of the draw tubes of a telescope of `reach`, widest first. */
  drawRadii = (reach: number) => Array.from({ length: reach }, (_, k) => DRAW_WIDEST - ((DRAW_WIDEST - DRAW_NARROWEST) * k) / (reach - 1)),
  DRAW_BACK = 0.55,
  DRAW_FRONT = 0.47,
  TIP = 0.72,
  /** How high over the board the hint's arrow hovers. */
  ARROW_Y = AXIS_Y + 0.34;
/** A little sequence for the board's small differences, the same every time. */
const sequence = (seed: number) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
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
/** White marble with faint grey veins, so that the ball is seen to roll. */
function marbleSkin() {
  const { c, ctx } = canvasOf(512, 256);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, 512, 256);
  const rand = sequence(77);
  for (let k = 0; k < 9; k++) {
    ctx.strokeStyle = `rgba(${120 + rand() * 40}, ${124 + rand() * 40}, ${132 + rand() * 40}, ${0.18 + rand() * 0.25})`;
    ctx.lineWidth = 0.8 + rand() * 2.4;
    ctx.beginPath();
    let x = rand() * 512,
      y = rand() * 256;
    ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) {
      x += 20 + rand() * 30;
      y += (rand() - 0.5) * 50;
      ctx.lineTo(x % 512, y);
      if (x > 512) {
        x -= 512;
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  return textureOf(c);
}
/** The grid engraved in the board's face (a dark groove with a light lip), transparent between the lines. */
function engraving(n: number, span: number) {
  const size = 1024,
    { c, ctx } = canvasOf(size),
    px = size / span,
    off = (span - n * CELL) / 2;
  for (let k = 0; k <= n; k++) {
    const at = (off + k * CELL) * px,
      from = off * px,
      to = (off + n * CELL) * px;
    ctx.fillStyle = "rgba(40, 22, 10, 0.55)";
    ctx.fillRect(at - 2, from - 2, 3, to - from + 4);
    ctx.fillRect(from - 2, at - 2, to - from + 4, 3);
    ctx.fillStyle = "rgba(255, 228, 180, 0.28)";
    ctx.fillRect(at + 1, from, 1.5, to - from);
    ctx.fillRect(from, at + 1, to - from, 1.5);
  }
  return textureOf(c);
}
/** The inside of the hole: dark, a little lighter at its rim. */
function well() {
  const { c, ctx } = canvasOf(128);
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "#050302");
  g.addColorStop(0.7, "#120a05");
  g.addColorStop(1, "#3a2414");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return textureOf(c);
}
/** A soft round glow, for sparkles. */
function glow() {
  const { c, ctx } = canvasOf(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,236,170,0.7)");
  g.addColorStop(1, "rgba(255,200,90,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return textureOf(c);
}
/** One telescope as built: its group (turned to its direction) and the draw tubes that slide. */
interface Scope {
  root: T.Group;
  draws: T.Object3D[];
  /** Its length as drawn now (in cells, may be between two while it moves). */
  shown: number;
}
/**
 * A wooden board with an engraved grid on a dark plank table; brass spyglasses standing on their cells, each on a
 * small brass foot, pointing the way they draw out; a white marble ball and a round hole with a brass rim that it
 * drops into. A press draws a telescope's tubes out (or slides them home) a cell at a time, the ball rolling with the
 * tip; a ball dropped in sinks into the dark, a gold ring spreads and sparks rise. Marks: the hint's gold ring and the
 * hover or keyboard's white ring round a telescope's foot (left out of a picture taken for the collection).
 */
export class TelescopeView extends TableView<State> {
  private layer = new T.Group();
  private boardOwned: { dispose(): void }[] = [];
  private scopes: Scope[] = [];
  private builtFor: { scopes: State["scopes"]; hole: number; size: number } | null = null;
  private size = 0;
  private ball: T.Mesh;
  private paint: Record<string, T.Material> = {};
  private shapes: Record<string, T.BufferGeometry> = {};
  private hintRing: T.Mesh;
  private hintGlow: T.Mesh;
  private hintArrow: T.Mesh;
  private cursorRing: T.Mesh;
  private burst: T.Mesh;
  private sparks: T.Sprite[] = [];
  private hovered = -1;
  private hinted = -1;
  private press: { t: number; x: number; z: number } | null = null;
  private caster = new T.Raycaster();
  private clock = 0;
  private lastBall = new T.Vector3();
  /** Presses given while a telescope moves are kept by the screen and played in order (`queueMoves: "all"`). */
  protected pressWhileMoving = true;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#241a14");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    const p = <M extends T.Material>(name: string, material: M) => (this.paint[name] = keep(material));
    const g = (name: string, geometry: T.BufferGeometry) => (this.shapes[name] = keep(geometry));
    const fine = capable();
    this.scene.background = new T.Color("#241a14");
    this.scene.add(new T.HemisphereLight("#e8e2d6", "#5a3c26", 1.45));
    const lamp = new T.DirectionalLight("#fff0d8", 2.35);
    lamp.position.set(-5, 11, 5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.left = lamp.shadow.camera.bottom = -10;
    lamp.shadow.camera.right = lamp.shadow.camera.top = 10;
    lamp.shadow.camera.far = 40;
    lamp.shadow.normalBias = 0.02;
    keep(lamp.shadow);
    const fill = new T.DirectionalLight("#ffe6c4", 0.45);
    fill.position.set(5, 7, 8);
    this.scene.add(lamp, fill);

    // Paints.
    p("table", new T.MeshStandardMaterial(planks(3, keep)));
    p("brass", glossy({ color: "#caa24c", roughness: 0.3, metalness: 0.85 }, 0.5));
    p("darkBrass", glossy({ color: "#a07a32", roughness: 0.36, metalness: 0.85 }, 0.4));
    p("leather", new T.MeshStandardMaterial({ color: "#3d2417", roughness: 0.78 }));
    p("rubber", new T.MeshStandardMaterial({ color: "#1b1715", roughness: 0.7 }));
    p("lens", glossy({ color: "#1a2a3a", roughness: 0.08, metalness: 0.3 }, 1));
    for (const reach of REACHES) p(`lacquer${reach}`, glossy({ color: COLOUR_OF[reach], roughness: 0.3, metalness: 0.05, emissive: COLOUR_OF[reach], emissiveIntensity: 0.12 }, 1));
    p("enamel", new T.MeshStandardMaterial({ color: "#1a120c", roughness: 0.5 }));
    p("ball", glossy({ map: keep(marbleSkin()), roughness: 0.16, metalness: 0 }, 1));
    p("well", new T.MeshBasicMaterial({ map: keep(well()) }));
    p("wall", new T.MeshStandardMaterial({ color: "#2b190d", roughness: 0.95, side: T.BackSide }));

    // Shapes, laid along x (the way a telescope points before it is turned).
    const along = (geometry: T.BufferGeometry) => geometry.rotateZ(-Math.PI / 2);
    g("foot", new T.CylinderGeometry(0.2, 0.24, 0.04, 28).translate(0, 0.02, 0));
    g("post", new T.CylinderGeometry(0.032, 0.04, AXIS_Y - BASE_R + 0.02, 12).translate(0, (AXIS_Y - BASE_R + 0.02) / 2 + 0.03, 0));
    g("cradle", along(new T.CylinderGeometry(BASE_R + 0.018, BASE_R + 0.018, 0.08, 28)));
    g("base", along(new T.CylinderGeometry(BASE_R, BASE_R, BASE_FRONT - BASE_BACK, 30, 1, false)).translate((BASE_BACK + BASE_FRONT) / 2, 0, 0));
    g("grip", along(new T.CylinderGeometry(BASE_R + 0.008, BASE_R + 0.008, 0.36, 30)).translate(-0.04, 0, 0));
    g("lip", along(new T.CylinderGeometry(BASE_R + 0.016, BASE_R + 0.016, 0.05, 30)));
    g("eyepiece", along(new T.CylinderGeometry(0.075, 0.095, 0.14, 22)).translate(BASE_BACK - 0.07, 0, 0));
    g("eyecup", along(new T.CylinderGeometry(0.085, 0.08, 0.05, 22)).translate(BASE_BACK - 0.165, 0, 0));
    for (const reach of REACHES)
      drawRadii(reach).forEach((r, k) => {
        g(`draw${reach}-${k}`, along(new T.CylinderGeometry(r, r, DRAW_BACK + DRAW_FRONT, 28, 1, false)).translate((DRAW_FRONT - DRAW_BACK) / 2, 0, 0));
        g(`drawLip${reach}-${k}`, along(new T.CylinderGeometry(r + 0.012, r + 0.012, 0.045, 28)).translate(DRAW_FRONT - 0.022, 0, 0));
      });
    const last = DRAW_NARROWEST;
    g("cap", along(new T.CylinderGeometry(last + 0.03, last + 0.024, TIP - DRAW_FRONT, 28)).translate((TIP + DRAW_FRONT) / 2, 0, 0));
    // The dew cap is lacquered in the kind's colour, with a wider ring round it edged in black, so that the colour
    // reads from afar and on a phone.
    g("band", along(new T.CylinderGeometry(last + 0.055, last + 0.055, 0.15, 28)).translate(TIP - 0.11, 0, 0));
    g("bandEdge", along(new T.CylinderGeometry(last + 0.05, last + 0.05, 0.185, 28)).translate(TIP - 0.11, 0, 0));
    g("glass", new T.CircleGeometry(last + 0.016, 24).rotateY(Math.PI / 2).translate(TIP - 0.012, 0, 0));
    g("ring", new T.RingGeometry(HOLE_R, HOLE_R + 0.06, 40).rotateX(-Math.PI / 2));
    g("rim", new T.TorusGeometry(HOLE_R + 0.02, 0.028, 10, 40).rotateX(Math.PI / 2));

    const table = new T.Mesh(keep(new T.PlaneGeometry(60, 60).rotateX(-Math.PI / 2)), this.paint.table);
    table.position.y = -0.4;
    table.receiveShadow = true;
    this.scene.add(table, this.layer);

    this.ball = new T.Mesh(keep(new T.SphereGeometry(BALL_R, fine ? 40 : 26, fine ? 28 : 18)), this.paint.ball);
    this.ball.castShadow = this.ball.receiveShadow = true;
    this.scene.add(this.ball);

    // Marks and the celebration.
    this.hintRing = ringMesh(keep, 0.4, 0.5, "#ffc21f");
    this.cursorRing = ringMesh(keep, 0.44, 0.5, "#ffffff");
    // A gold arrow hovering over the telescope to press, pointing down at it (the ring round its foot is half hidden by it).
    this.hintArrow = new T.Mesh(
      keep(new T.ConeGeometry(0.17, 0.4, 24).rotateX(Math.PI).translate(0, 0.2, 0)),
      keep(new T.MeshStandardMaterial({ color: "#ffc21f", emissive: "#b37a00", emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.3 })),
    );
    this.hintArrow.visible = false;
    this.hintGlow = new T.Mesh(keep(new T.CircleGeometry(0.5, 32)), keep(new T.MeshBasicMaterial({ color: "#ffd56a", transparent: true, opacity: 0.32, depthWrite: false })));
    this.hintGlow.rotation.x = -Math.PI / 2;
    this.hintGlow.renderOrder = 4;
    this.hintGlow.visible = false;
    this.burst = ringMesh(keep, 0.3, 0.42, "#ffd56a");
    const sparkPaint = keep(new T.SpriteMaterial({ map: keep(glow()), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    for (let k = 0; k < 14; k++) {
      const s = new T.Sprite(sparkPaint);
      s.visible = false;
      this.sparks.push(s);
      this.scene.add(s);
    }
    this.scene.add(this.hintRing, this.cursorRing, this.hintGlow, this.hintArrow, this.burst);
    this.begin();
  }
  /** The board for `state` (its size, its telescopes and its hole), made anew. */
  private build(state: State) {
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    this.layer.clear();
    this.scopes = [];
    const keep = <R extends { dispose(): void }>(r: R) => (this.boardOwned.push(r), r);
    const n = (this.size = state.size),
      span = spanOf(n),
      add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], parent: T.Object3D, shadow = true) => {
        const mesh = new T.Mesh(geometry, material);
        mesh.castShadow = shadow;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      };
    // The board: a slab of pale wood with the hole cut through, on a darker body; a groove round its edge.
    const face = keep(wood(false, 0.75));
    face.repeat.set(1 / 6, 1 / 6);
    const facePaint = keep(new T.MeshStandardMaterial({ map: face, roughness: 0.62 })),
      sidePaint = keep(new T.MeshStandardMaterial({ map: keep(wood(true)), roughness: 0.7 })),
      hole = cellAt(n, state.hole),
      shape = new T.Shape();
    shape.moveTo(-span / 2, -span / 2);
    shape.lineTo(span / 2, -span / 2);
    shape.lineTo(span / 2, span / 2);
    shape.lineTo(-span / 2, span / 2);
    shape.closePath();
    const cut = new T.Path();
    cut.absarc(hole.x, -hole.z, HOLE_R, 0, Math.PI * 2, true);
    shape.holes.push(cut);
    const slab = keep(new T.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 40 }));
    slab.rotateX(-Math.PI / 2);
    slab.translate(0, BOARD_TOP - 0.14 - 0.015, 0);
    add(slab, [facePaint, sidePaint], this.layer).castShadow = false;
    add(keep(block(span + 0.04, 0.24, span + 0.04, 0.05).translate(0, -0.16 - 0.12, 0)), sidePaint, this.layer).castShadow = false;
    const grid = new T.Mesh(keep(new T.PlaneGeometry(span, span).rotateX(-Math.PI / 2)), keep(new T.MeshStandardMaterial({ map: keep(engraving(n, span)), transparent: true, roughness: 0.7, depthWrite: false })));
    grid.position.y = BOARD_TOP + 0.002;
    grid.receiveShadow = true;
    grid.renderOrder = 1;
    this.layer.add(grid);
    // The hole: a dark well under a brass rim.
    const wall = add(keep(new T.CylinderGeometry(HOLE_R, HOLE_R, 0.16, 32, 1, true)), this.paint.wall, this.layer, false);
    wall.position.set(hole.x, BOARD_TOP - 0.08, hole.z);
    const bottom = add(keep(new T.CircleGeometry(HOLE_R, 32).rotateX(-Math.PI / 2)), this.paint.well, this.layer, false);
    bottom.position.set(hole.x, BOARD_TOP - 0.15, hole.z);
    const rim = add(this.shapes.rim, this.paint.brass, this.layer);
    rim.position.set(hole.x, BOARD_TOP + 0.006, hole.z);
    // The telescopes.
    state.scopes.forEach((s, t) => {
      const root = new T.Group(),
        body = new T.Group(),
        at = cellAt(n, s.cell);
      root.position.set(at.x, 0, at.z);
      // Its own x points the way it draws out.
      root.rotation.y = -Math.atan2(WAY[s.dir][1], WAY[s.dir][0]);
      root.userData.scope = t;
      add(this.shapes.foot, this.paint.darkBrass, root);
      add(this.shapes.post, this.paint.brass, root);
      body.position.y = AXIS_Y;
      root.add(body);
      add(this.shapes.cradle, this.paint.darkBrass, body);
      add(this.shapes.base, this.paint.brass, body);
      add(this.shapes.grip, this.paint.leather, body);
      add(this.shapes.lip, this.paint.darkBrass, body).position.x = BASE_FRONT;
      add(this.shapes.eyepiece, this.paint.brass, body);
      add(this.shapes.eyecup, this.paint.rubber, body);
      const lacquer = this.paint[`lacquer${s.reach}`];
      const draws: T.Object3D[] = [];
      for (let k = 0; k < s.reach; k++) {
        const tube = new T.Group();
        add(this.shapes[`draw${s.reach}-${k}`], k % 2 ? this.paint.darkBrass : this.paint.brass, tube);
        add(this.shapes[`drawLip${s.reach}-${k}`], this.paint.darkBrass, tube);
        if (k === s.reach - 1) {
          add(this.shapes.cap, lacquer, tube);
          add(this.shapes.bandEdge, this.paint.enamel, tube);
          add(this.shapes.band, lacquer, tube);
          add(this.shapes.glass, this.paint.lens, tube, false);
        }
        body.add(tube);
        draws.push(tube);
      }
      this.layer.add(root);
      this.scopes.push({ root, draws, shown: 0 });
    });
    this.builtFor = { scopes: state.scopes, hole: state.hole, size: n };
  }
  /** Draws telescope `t` out to `length` cells (a fraction while it moves): each tube goes out no further than its own place. */
  private extend(t: number, length: number) {
    const scope = this.scopes[t];
    if (!scope) return;
    scope.shown = length;
    scope.draws.forEach((tube, k) => (tube.position.x = Math.min(k + 1, length) * CELL));
  }
  /** Puts the ball at a place on the board, rolled by the way it came. */
  private rollTo(x: number, y: number, z: number) {
    const dx = x - this.lastBall.x,
      dz = z - this.lastBall.z,
      d = Math.hypot(dx, dz);
    if (d > 1e-6 && d < 3) {
      const axis = new T.Vector3(dz, 0, -dx).normalize();
      this.ball.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis, d / BALL_R));
    }
    this.ball.position.set(x, y, z);
    this.lastBall.set(x, y, z);
  }
  private ballCell(cell: number, y = BALL_R) {
    const at = cellAt(this.size, cell);
    this.rollTo(at.x, y, at.z);
  }
  protected subject(aspect: number): TableSubject {
    return telescopeSubject(this.size || 7, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state || state.winner !== null) return [];
    const out: Spot[] = [];
    state.scopes.forEach((s, t) => {
      for (let k = 0; k <= state.lens[t]; k++) {
        const at = cellAt(state.size, stepFrom(state.size, s.cell, s.dir, k));
        out.push({ x: at.x, y: AXIS_Y, z: at.z, r: REACH_TAP, point: t });
      }
    });
    return out;
  }
  /** What a ray points at: the telescope it strikes first; else left to the spots (a tap beside one still counts). */
  protected pick(ray: T.Ray): number | null {
    const state = this.state;
    if (!state || state.winner !== null) return -1;
    this.caster.ray.copy(ray);
    for (const hit of this.caster.intersectObjects(this.scopes.map((s) => s.root), true))
      for (let o: T.Object3D | null = hit.object; o; o = o.parent) if (o.userData.scope !== undefined) return o.userData.scope as number;
    return null;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    this.hovered = point;
    this.mark(this.marks);
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null) return false;
    // Every press is taken here, so that a press on a telescope that cannot be drawn out is a move too (refused with words).
    this.press = { t: point, x: at.x, z: at.z };
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press,
      state = this.state;
    this.press = null;
    if (!press || !at || !state || state.winner !== null || press.t < 0) return;
    // A tap: let go near where it was pressed.
    if (Math.hypot(at.x - press.x, at.z - press.z) > CELL * 0.9) return;
    this.onMove({ from: -1, to: press.t, extra: -1 });
  }
  /** A press the screen refused: the telescope shakes a little on its foot (on its own frames, holding nothing back). */
  refused(move: Move) {
    const object = this.scopes[move.to]?.root;
    if (!object || this.reducedMotion) return;
    const start = performance.now(),
      turn = object.rotation.y,
      step = (now: number) => {
        if (this.disposed) return;
        const p = Math.min(1, (now - start) / 380);
        object.rotation.y = turn + (p < 1 ? Math.sin(p * Math.PI * 5) * 0.09 * (1 - p) : 0);
        this.redraw();
        if (p < 1) requestAnimationFrame(step);
      };
    requestAnimationFrame(step);
  }
  protected place(state: State) {
    const b = this.builtFor;
    if (!b || b.scopes !== state.scopes || b.hole !== state.hole || b.size !== state.size) {
      this.build(state);
      this.resize();
    }
    state.lens.forEach((len, t) => this.extend(t, len));
    const won = state.winner === 0;
    this.ball.visible = !won;
    const at = cellAt(this.size, state.ball);
    this.ball.position.set(at.x, BALL_R, at.z);
    this.lastBall.copy(this.ball.position);
    this.burst.visible = false;
    for (const s of this.sparks) s.visible = false;
    this.mark(this.marks);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || before.scopes !== state.scopes) return false;
    const steps = Math.abs(last.to - last.from),
      sign = Math.sign(last.to - last.from),
      n = this.size;
    this.ball.visible = true;
    for (let k = 0; k < steps; k++) {
      const a = cellAt(n, last.balls[k]),
        b = cellAt(n, last.balls[k + 1]);
      this.tween(k * STEP_MS, STEP_MS, (p) => {
        this.extend(last.t, last.from + sign * (k + p));
        if (!(last.fell && this.dropped(last, k))) this.rollTo(a.x + (b.x - a.x) * p, BALL_R, a.z + (b.z - a.z) * p);
      });
    }
    const end = steps * STEP_MS;
    // The ball meets the tip or the tubes come home: a knock (a drop into the hole sounds as it falls in).
    if (!last.fell) this.tween(end - 1, 1, (p) => p === 1 && this.onContact());
    else {
      const k = last.balls.indexOf(state.hole),
        at = cellAt(n, state.hole),
        sinkFrom = Math.max(0, k) * STEP_MS;
      this.tween(sinkFrom, DROP_MS, (p) => {
        // Over the rim and down into the dark, quickening.
        this.rollTo(at.x, BALL_R - p * p * (BALL_R + 0.45), at.z);
        if (p === 1) {
          this.ball.visible = false;
          this.onContact();
        }
      });
      this.celebrate(sinkFrom + DROP_MS * 0.7, at);
    }
    return true;
  }
  /** Whether the ball of `last` has gone into the hole by step `k` (it stays there while the tubes go on closing). */
  private dropped(last: NonNullable<State["last"]>, k: number) {
    const i = last.balls.indexOf(this.state?.hole ?? -1);
    return i >= 0 && k >= i;
  }
  /** A gold ring spreading from the hole and sparks rising. */
  private celebrate(delay: number, at: { x: number; z: number }) {
    const ring = this.burst,
      paint = ring.material as T.MeshBasicMaterial;
    this.tween(delay, 900, (p) => {
      ring.visible = p < 1 && !capturing();
      ring.position.set(at.x, BOARD_TOP + 0.01, at.z);
      ring.scale.setScalar(1 + p * 2.6);
      paint.opacity = 0.9 * (1 - p);
    });
    const rand = sequence(Math.floor(at.x * 13 + at.z * 7 + 99));
    this.sparks.forEach((s, i) => {
      const angle = (i / this.sparks.length) * Math.PI * 2 + rand() * 0.4,
        out = 0.25 + rand() * 0.55,
        up = 0.6 + rand() * 0.9;
      this.tween(delay + rand() * 160, 760, (p) => {
        s.visible = p < 1 && !capturing();
        s.position.set(at.x + Math.cos(angle) * out * p, BOARD_TOP + 0.1 + up * Math.sin(p * Math.PI * 0.8), at.z + Math.sin(angle) * out * p);
        s.scale.setScalar(0.2 * (1 - p * 0.7));
        (s.material as T.SpriteMaterial).opacity = 1;
      });
    });
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state || !this.builtFor) return;
    const n = this.size,
      live = state.winner === null && !capturing(),
      hint = live && marks.hint ? marks.hint.to : -1,
      cursor = live ? (marks.cursor ?? this.hovered) : -1,
      ringAt = (ring: T.Mesh, t: number, lift = 0) => {
        const at = cellAt(n, state.scopes[t].cell);
        ring.position.set(at.x, BOARD_TOP + 0.008 + lift, at.z);
      };
    this.hinted = hint;
    this.hintRing.visible = this.hintGlow.visible = this.hintArrow.visible = hint >= 0;
    if (hint >= 0) {
      ringAt(this.hintRing, hint, 0.002);
      ringAt(this.hintGlow, hint, -0.001);
      ringAt(this.hintArrow, hint, ARROW_Y);
    }
    this.cursorRing.visible = cursor >= 0 && cursor < state.scopes.length;
    if (this.cursorRing.visible) ringAt(this.cursorRing, cursor, 0.003);
    // For browser tests: the telescopes (base/direction), their lengths, the ball, the hole, the hint, and where each
    // telescope's base is on the canvas.
    const el = this.renderer.domElement;
    el.dataset.size = String(n);
    el.dataset.scopes = state.scopes.map((s) => `${s.cell}/${s.dir}`).join(" ");
    el.dataset.reach = state.scopes.map((s) => s.reach).join(" ");
    el.dataset.lens = state.lens.join(" ");
    el.dataset.ball = String(state.ball);
    el.dataset.hole = String(state.hole);
    el.dataset.hint = String(hint);
    el.dataset.won = String(state.winner === 0);
    el.dataset.places = this.places(state);
    this.kick();
    this.redraw();
  }
  /** Where every telescope's base is on the canvas, in CSS pixels, "x,y" joined by spaces. */
  private places(state: State) {
    const el = this.renderer.domElement,
      w = el.clientWidth,
      h = el.clientHeight,
      v = new T.Vector3();
    this.camera.updateMatrixWorld();
    return state.scopes
      .map((s) => {
        const at = cellAt(state.size, s.cell);
        v.set(at.x, AXIS_Y, at.z).project(this.camera);
        return `${(((v.x + 1) / 2) * w).toFixed(1)},${(((1 - v.y) / 2) * h).toFixed(1)}`;
      })
      .join(" ");
  }
  /** The hint's glow breathes on frames of its own while it is shown. */
  private kick() {
    if (!this.clock && !this.disposed && this.hinted >= 0 && !this.reducedMotion) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed || this.hinted < 0) return;
    (this.hintGlow.material as T.MeshBasicMaterial).opacity = 0.22 + 0.16 * Math.sin(now / 250);
    this.hintArrow.position.y = BOARD_TOP + 0.008 + ARROW_Y + 0.07 * Math.sin(now / 220);
    this.hintArrow.rotation.y = now / 900;
    this.redraw();
    this.kick();
  };
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    for (const r of this.boardOwned) r.dispose();
    this.boardOwned = [];
    super.dispose();
  }
}
