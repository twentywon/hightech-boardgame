import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import { copy, shotCode, shotOf, speedOf, strike, type Disc } from "../flick/physics";
import { GO, GO_STEP, HINGES, arenaOf, goPoint, type Mode, type State } from "./rules";

export const STONE_COLORS: [string, string] = ["#1b1c20", "#f1ece0"];
export const PIECE_COLORS: [string, string] = ["#2f7d4f", "#c0392b"];
function boardTexture(mode: Mode) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#d9a85c";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(110,62,20,${0.02 + (i % 5) * 0.008})`;
    ctx.fillRect(0, (i * 197) % 1024, 1024, 1 + (i % 3));
  }
  ctx.strokeStyle = "#3a2a16";
  ctx.lineWidth = 3;
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  if (mode === "go") {
    // The board is 9.6 wide; lines lie half a unit apart.
    const px = (v: number) => 512 + (v / 4.8) * 512;
    for (let i = 0; i < GO; i++) {
      const v = px((i - 9) * GO_STEP);
      line(v, px(-4.5), v, px(4.5));
      line(px(-4.5), v, px(4.5), v);
    }
    ctx.fillStyle = "#3a2a16";
    for (const r of [3, 9, 15])
      for (const col of [3, 9, 15]) {
        ctx.beginPath();
        ctx.arc(px((col - 9) * GO_STEP), px((r - 9) * GO_STEP), 8, 0, Math.PI * 2);
        ctx.fill();
      }
    // The middle line, which neither side may set a stone on or beyond.
    ctx.strokeStyle = "rgba(160,40,30,0.5)";
    ctx.lineWidth = 6;
    line(px(-4.5), px(0), px(4.5), px(0));
  } else {
    const x = (v: number) => 512 + (v / 4.55) * 512,
      y = (v: number) => 512 + (v / 5.05) * 512;
    for (let f = -4; f <= 4; f++) line(x(f), y(-4.5), x(f), y(4.5));
    for (let r = 0; r < 10; r++) line(x(-4), y(r - 4.5), x(4), y(r - 4.5));
    // The two palaces.
    for (const [a, b] of [[-4.5, -2.5], [2.5, 4.5]]) {
      line(x(-1), y(a), x(1), y(b));
      line(x(1), y(a), x(-1), y(b));
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function labelTexture(label: string, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ecd9a8";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = '700 74px "Noto Serif CJK KR", "Noto Serif KR", "Apple SD Gothic Neo", "Malgun Gothic", serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 68);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/** A board of stones to flick, on a low table. */
export class AlkkagiView extends FlickView<State> {
  private meshes: T.Object3D[] = [];
  private built: Disc[] | null = null;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private stone: T.BufferGeometry;
  private paints: T.Material[];
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: Mode,
  ) {
    super(host, quality, "#2c2119");
    this.daylight("#fff4dc", "#3a2c22", "#fff0d2", 9);
    const floor = this.add(new T.PlaneGeometry(90, 90), this.standard({ map: this.own(wood(true)) }), 0, -1.2, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const arena = arenaOf(mode),
      side = this.standard({ color: "#a9793e", roughness: 0.6 });
    // A thick board on four short feet: a stone pushed over the edge drops off it.
    this.add(new T.BoxGeometry(arena.halfX * 2, 0.7, arena.halfZ * 2), [side, side, this.standard({ map: this.own(boardTexture(mode)), roughness: 0.7 }), side, side, side], 0, -0.35, 0);
    for (const x of [-1, 1]) for (const z of [-1, 1]) this.add(new T.CylinderGeometry(0.4, 0.3, 0.5, 16), side, x * (arena.halfX - 0.7), -0.95, z * (arena.halfZ - 0.7));
    if (mode === "janggi") {
      // The fold of the board and its two brass hinges, which stones bounce off.
      this.add(new T.BoxGeometry(arena.halfX * 2, 0.012, 0.035), this.standard({ color: "#5a3a1c" }), 0, 0.004, 0).castShadow = false;
      const brass = this.standard({ color: "#c9a23a", roughness: 0.3, metalness: 0.7 });
      for (const x of HINGES) {
        this.add(new T.BoxGeometry(0.8, 0.05, 0.3), brass, x, 0.025, 0);
        this.add(new T.CylinderGeometry(0.09, 0.09, 0.78, 14), brass, x, 0.1, 0).rotation.z = Math.PI / 2;
        for (const dx of [-0.26, 0.26]) for (const dz of [-0.09, 0.09]) this.add(new T.CylinderGeometry(0.03, 0.03, 0.07, 8), this.standard({ color: "#6a5320", metalness: 0.6 }), x + dx, 0.05, dz);
      }
    }
    this.stone = this.own(new T.SphereGeometry(1, 28, 18));
    this.paints = STONE_COLORS.map((color) => this.standard({ color, roughness: 0.25 }));
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    for (let i = 0; i < 16; i++) {
      const ring = ringMesh(own, 0.3, 0.37, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.26, 0.33, "#ffffff");
    this.scene.add(this.cursor);
    this.begin();
  }
  protected subject(): TableSubject {
    return { half: 5.3, halfZ: 5.5, height: 0.8, lookY: 0, tilt: 1.05 };
  }
  protected discs(state: State) {
    this.build(state);
    return state.discs;
  }
  protected arena(state: State) {
    return arenaOf(state.mode);
  }
  /** Makes a mesh for every stone of the state that has none yet; a new game starts over. */
  private build(state: State) {
    if (this.built && state.discs.length < this.meshes.length) {
      this.meshes.forEach((mesh) => mesh.removeFromParent());
      this.meshes = [];
    }
    this.built = state.discs;
    for (let id = this.meshes.length; id < state.discs.length; id++) {
      const disc = state.discs[id],
        owner = state.owners[id];
      let mesh: T.Mesh;
      if (state.mode === "go") {
        mesh = new T.Mesh(this.stone, this.paints[owner]);
        mesh.scale.set(disc.r, disc.r * 0.42, disc.r);
        mesh.position.y = disc.r * 0.42;
      } else {
        const rim = this.standard({ color: "#d9be86", roughness: 0.5 });
        mesh = new T.Mesh(this.own(new T.CylinderGeometry(disc.r, disc.r, 0.22, 8)), [rim, this.standard({ map: this.own(labelTexture(state.labels[id], PIECE_COLORS[owner])), roughness: 0.5 }), rim]);
        // The writing reads upright from the near side, whoever the piece belongs to.
        mesh.rotation.y = Math.PI / 8 + Math.PI / 2;
        mesh.position.y = 0.11;
      }
      mesh.castShadow = true;
      const holder = new T.Group();
      holder.add(mesh);
      this.meshes.push(holder);
      this.scene.add(holder);
    }
  }
  protected mesh(id: number) {
    return this.meshes[id];
  }
  protected struck(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return null;
    const shot = shotOf(state.last.code)!,
      live = copy(before.discs);
    strike(live[state.last.disc], shot.angle, speedOf(shot.power));
    return live;
  }
  protected shooter(point: number) {
    const state = this.state,
      disc = state?.phase === "play" ? state.discs[point] : undefined;
    // Only a stone the screen has marked as mine to move.
    return disc?.on && this.marks.movable.includes(point) ? { x: disc.x, z: disc.z } : null;
  }
  protected shoot(point: number, degrees: number, power: number) {
    this.onMove({ from: point, to: shotCode(degrees, power), extra: -1 });
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    if (state.phase === "place") return Array.from({ length: GO * GO }, (_, point) => ({ ...goPoint(point), y: 0, r: 0.25, point }));
    return state.discs.filter((d) => d.on).map((d) => ({ x: d.x, y: 0.1, z: d.z, r: d.r + 0.12, point: d.id }));
  }
  protected mark(marks: Marks) {
    const state = this.state,
      playing = state?.phase === "play",
      mine = playing ? marks.movable.map((id) => state!.discs[id]).filter((d) => d?.on) : [];
    this.rings.forEach((ring, i) => {
      const disc = mine[i];
      ring.visible = !!disc;
      if (disc) {
        ring.position.set(disc.x, 0.012, disc.z);
        ring.scale.setScalar((disc.r + 0.1) / 0.335);
      }
    });
    const at = marks.cursor !== null && state?.phase === "place" ? goPoint(marks.cursor) : null;
    this.cursor.visible = !!at;
    if (at) this.cursor.position.set(at.x, 0.013, at.z);
  }
}
