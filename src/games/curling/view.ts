import * as T from "three";
import { block, glossy, stuff } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { FlickView } from "../flick/view";
import { copy, shotOf, strike, type Disc } from "../flick/physics";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { ARENA, BACK, CURL, HACK, HOG, HOUSE, R, STONE, STONES, TEE, speedOf, type State } from "./rules";

export const CURLING_COLORS: [string, string] = ["#c8321f", "#e0b020"];
export const CURLING_SUBJECT: TableSubject = { half: 7.5, halfZ: 2.7, height: 0.4, lookY: 0, tilt: 1.0 };
/** Where the stones not yet thrown wait, beside the sheet at the hack's end: mine on the near side, the computer's across. */
export const waitingAt = (side: number, k: number) => ({ x: -6.9 + k * 0.48, z: side === 0 ? 2.15 : -2.15 });
/** The ice: pebbled white with the house in blue and red rings, and the lines across. */
function iceTexture() {
  const W = 2048,
    H = 512,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    sx = (x: number) => ((x + ARENA.halfX) / (2 * ARENA.halfX)) * W,
    sz = (z: number) => ((z + ARENA.halfZ) / (2 * ARENA.halfZ)) * H,
    unit = W / (2 * ARENA.halfX);
  ctx.fillStyle = "#f4f8fb";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${180 + (i % 40)}, ${205 + (i % 30)}, 230, 0.25)`;
    ctx.fillRect((i * 811) % W, (i * 367) % H, 2, 2);
  }
  // The house: twelve-foot blue, eight-foot white, four-foot red, the button white.
  for (const [r, color] of [[HOUSE, "#2f62c0"], [HOUSE * 0.68, "#f4f8fb"], [HOUSE * 0.36, "#c8321f"], [0.15, "#f4f8fb"]] as [number, string][]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx(TEE), sz(0), r * unit, r * unit, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const line = (x: number, color: string, width: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(sx(x) - width / 2, 0, width, H);
  };
  line(HOG, "#c8321f", 10);
  line(TEE, "#2a2a35", 4);
  line(BACK, "#2a2a35", 4);
  line(HACK.x - 0.3, "#2a2a35", 4);
  ctx.fillStyle = "#2a2a35";
  ctx.fillRect(sx(HACK.x - 0.3), sz(0) - 2, sx(BACK) - sx(HACK.x - 0.3), 4);
  // The hack itself: two dark rubber footholds.
  ctx.fillStyle = "#1d1f23";
  ctx.fillRect(sx(HACK.x - 0.45), sz(-0.18), 0.22 * unit, 0.14 * unit);
  ctx.fillRect(sx(HACK.x - 0.45), sz(0.04), 0.22 * unit, 0.14 * unit);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A curling stone: polished granite with a bevelled band, and a coloured handle on top. */
function stoneShape() {
  const profile = [[0, 0], [0.12, 0], [0.16, 0.02], [0.17, 0.05], [0.17, 0.09], [0.16, 0.12], [0.12, 0.14], [0, 0.145]].map(([r, y]) => new T.Vector2(r, y));
  return new T.LatheGeometry(profile, 32);
}
/** A sheet of ice seen from its side, with the hack at the left and the house at the right; stones are pulled back and let go. */
export class CurlingView extends FlickView<State> {
  private stones: T.Group[] = [];
  /** A stone of each side standing in the hack, ready to be slid (the stones of an end scored may still lie on the ice). */
  private ready: T.Group[] = [];
  private turnMark: T.Mesh;
  private cursor: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#26303a");
    this.daylight("#f2f7ff", "#5a6878", "#ffffff", 9, 2.0);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...stuff("boards", "#5c4a3a", 6, keep), roughness: 0.8 }), 0, -0.25, 0).castShadow = false;
    const ice = this.standard({ map: keep(iceTexture()), roughness: 0.18, metalness: 0.05 }),
      boards = this.standard({ color: "#d9dfe6", roughness: 0.5 });
    this.add(block(ARENA.halfX * 2, 0.1, ARENA.halfZ * 2, 0.02), [boards, boards, ice, boards, boards, boards], 0, -0.05, 0).castShadow = false;
    // Low boards along the sides and the ends, and the snow beyond where the waiting stones stand.
    for (const z of [-ARENA.halfZ - 0.08, ARENA.halfZ + 0.08]) this.add(block(ARENA.halfX * 2 + 0.3, 0.18, 0.12, 0.04), boards, 0, 0.04, z);
    for (const x of [-ARENA.halfX - 0.08, ARENA.halfX + 0.08]) this.add(block(0.12, 0.18, ARENA.halfZ * 2 + 0.3, 0.04), boards, x, 0.04, 0);
    const granite = keep(glossy({ ...stuff("stone", "#8a8d92", 0.4, keep), roughness: 0.25 })),
      body = keep(stoneShape()),
      grip = keep(new T.CapsuleGeometry(0.035, 0.16, 4, 8).rotateZ(Math.PI / 2)),
      post = keep(new T.CylinderGeometry(0.03, 0.03, 0.05, 8));
    CURLING_COLORS.forEach((color, side) => {
      const paint = keep(glossy({ color, roughness: 0.3 }));
      for (let k = 0; k <= STONES; k++) {
        const g = new T.Group(),
          b = new T.Mesh(body, granite),
          h = new T.Mesh(grip, paint);
        b.castShadow = b.receiveShadow = true;
        h.position.set(0, 0.2, 0);
        h.castShadow = true;
        for (const dx of [-0.07, 0.07]) {
          const p = new T.Mesh(post, paint);
          p.position.set(dx, 0.16, 0);
          g.add(p);
        }
        g.add(b, h);
        this.scene.add(g);
        if (k < STONES) this.stones.push(g);
        else this.ready.push(g);
      }
    });
    // An arrow on the ice by the hack shows the turn chosen.
    const shape = new T.Shape();
    shape.absarc(0, 0, 0.32, 0.3, Math.PI * 1.6, false);
    shape.absarc(0, 0, 0.24, Math.PI * 1.6, 0.3, true);
    this.turnMark = new T.Mesh(keep(new T.ShapeGeometry(shape)), keep(new T.MeshBasicMaterial({ color: "#2f62c0", transparent: true, opacity: 0.8, side: T.DoubleSide })));
    this.turnMark.rotation.x = -Math.PI / 2;
    this.turnMark.position.set(HACK.x, 0.02, HACK.z);
    this.scene.add(this.turnMark);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.26, 0.32, "#ffd24a");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected aimColor() {
    return "#2f62c0";
  }
  protected subject() {
    return CURLING_SUBJECT;
  }
  protected discs(state: State) {
    return state.stones;
  }
  protected arena() {
    return ARENA;
  }
  protected mesh(id: number) {
    return this.stones[id];
  }
  protected struck(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return null;
    const shot = shotOf(last.code)!,
      live = copy(before.done ? [] : before.stones),
      stone: Disc = { id: last.id, x: HACK.x, z: HACK.z, vx: 0, vz: 0, r: R, m: 1, on: true, curl: CURL[last.spin] || undefined };
    strike(stone, shot.angle, speedOf(shot.power));
    live.push(stone);
    // The stones of an end already scored are cleared before the first of the next; the stone in the hack goes.
    if (before.done) for (const g of this.stones) g.visible = false;
    for (const g of this.ready) g.visible = false;
    this.mesh(last.id).visible = true;
    return live;
  }
  protected shooter(point: number) {
    return point === STONE && this.marks.movable.includes(STONE) ? { ...HACK } : null;
  }
  protected shoot(point: number, degrees: number, power: number) {
    this.onMove({ from: point, to: 1000 + ((((Math.round(degrees) % 360) + 360) % 360) * 32 + Math.max(1, Math.min(20, power))), extra: -1 });
  }
  protected place(state: State) {
    super.place(state);
    const onIce = new Set(state.stones.map((d) => d.id));
    // Stones not on the ice: those still to be thrown wait by the hack, those thrown and taken off are gone.
    for (const side of [0, 1])
      for (let k = 0; k < STONES; k++) {
        const id = side * STONES + k,
          g = this.stones[id];
        if (onIce.has(id)) continue;
        const left = state.done ? false : k >= state.thrown[side] + (side === state.turn ? 1 : 0);
        g.visible = left;
        if (left) g.position.set(waitingAt(side, k).x, 0, waitingAt(side, k).z);
      }
    // The stone in the hack: the next one of the side to throw.
    this.ready.forEach((g, side) => {
      g.visible = state.winner === null && side === state.turn;
      g.position.set(HACK.x, 0, HACK.z);
    });
    this.turnMark.visible = state.winner === null && state.spin !== 0;
    this.turnMark.scale.set(state.spin === 2 ? -1 : 1, 1, 1);
  }
  protected spots(): Spot[] {
    return [{ ...HACK, y: 0.1, r: 0.4, point: STONE }];
  }
  protected mark(marks: Marks) {
    const mine = marks.movable.includes(STONE) && !this.animating;
    this.cursor.visible = mine;
    this.cursor.position.set(HACK.x, 0.015, HACK.z);
  }
}
