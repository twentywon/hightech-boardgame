import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { DOWN, LEFT, N, RIGHT, UP, type State } from "./rules";

export const MERGE_COLORS: [string, string] = ["#2f7d6d", "#b9b3a4"];
/** The side of a square, the gap between tiles, and how thick a tile is. */
const CELL = 1.5,
  GAP = 0.14,
  THICK = 0.34;
const where = (i: number) => ({ x: ((i % N) - (N - 1) / 2) * CELL, z: (Math.floor(i / N) - (N - 1) / 2) * CELL });
/** Glazed tiles, deeper in colour the larger the number. */
const GLAZE: Record<number, [string, string]> = {
  2: ["#eef3ee", "#27413b"],
  4: ["#d9ebe2", "#27413b"],
  8: ["#9fd6c2", "#123a31"],
  16: ["#5fbfa5", "#ffffff"],
  32: ["#2f9f8f", "#ffffff"],
  64: ["#1f7f8f", "#ffffff"],
  128: ["#3f6fb5", "#ffffff"],
  256: ["#5457b0", "#ffffff"],
  512: ["#7a48a8", "#ffffff"],
  1024: ["#a8408a", "#ffffff"],
  2048: ["#d8a31a", "#3a2600"],
};
/** A four by four tray of numbered tiles on a desk; a swipe across it slides them. */
export class MergeView extends TableView<State> {
  private tiles: T.Mesh[] = [];
  private box: T.BufferGeometry;
  private faces = new Map<number, T.Material[]>();
  private from: { x: number; z: number } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#c9d3cf");
    this.daylight("#ffffff", "#8c9a94", "#fff4dc", 8, 1.5);
    const desk = this.own(wood());
    desk.repeat.set(3, 3);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ map: desk, color: "#e8d9bd", roughness: 0.6 }), 0, -0.5, 0).castShadow = false;
    // The tray: a dark slate bed with a pale rim and a hollow for each tile.
    const side = N * CELL + 0.5;
    this.add(new T.BoxGeometry(side + 0.5, 0.3, side + 0.5), this.standard({ color: "#f3efe4", roughness: 0.5 }), 0, -0.15, 0);
    this.add(new T.BoxGeometry(side, 0.3, side), this.standard({ color: "#2c3836", roughness: 0.9 }), 0, -0.12, 0).castShadow = false;
    const hollow = this.own(new T.BoxGeometry(CELL - GAP, 0.02, CELL - GAP)),
      bed = this.standard({ color: "#3b4a47", roughness: 1 });
    for (let i = 0; i < N * N; i++) {
      const mesh = new T.Mesh(hollow, bed);
      mesh.position.set(where(i).x, 0.035, where(i).z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    // A pencil and a cup beside the tray: nothing of them reaches over it.
    const pencil = this.add(new T.CylinderGeometry(0.06, 0.06, 2.6, 6), this.standard({ color: "#e0b020" }), side / 2 + 1.5, -0.24, 1.2);
    pencil.rotation.set(Math.PI / 2, 0, 0.5);
    this.add(new T.CylinderGeometry(0.5, 0.42, 0.9, 28), this.standard({ color: "#f6f3ea", roughness: 0.3 }), -side / 2 - 1.7, 0.15, -1.6);
    this.add(new T.CylinderGeometry(0.44, 0.44, 0.02, 28), this.standard({ color: "#5a3a22", roughness: 0.4 }), -side / 2 - 1.7, 0.55, -1.6).castShadow = false;
    this.box = this.own(new T.BoxGeometry(CELL - GAP, THICK, CELL - GAP));
    for (let i = 0; i < N * N; i++) {
      const mesh = new T.Mesh(this.box, this.face(2));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      this.tiles.push(mesh);
      this.scene.add(mesh);
    }
    this.begin();
  }
  /** The materials of a tile: its number on top, its glaze on the sides. */
  private face(value: number) {
    let made = this.faces.get(value);
    if (!made) {
      const [paint, ink] = GLAZE[value] ?? ["#20262a", "#ffd24a"],
        canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = paint;
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 236, 236);
      ctx.fillStyle = ink;
      const text = String(value);
      ctx.font = `800 ${text.length > 3 ? 84 : text.length > 2 ? 104 : 132}px "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 128, 136);
      const map = this.own(new T.CanvasTexture(canvas));
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = 4;
      const plain = this.standard({ color: paint, roughness: 0.35 }),
        top = this.standard({ map, roughness: 0.35 });
      made = [plain, plain, top, plain, plain, plain];
      this.faces.set(value, made);
    }
    return made;
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 3.7 : 4.6, halfZ: 4.1, height: 0.5, lookY: 0, tilt: 1.12 };
  }
  protected spots(): Spot[] {
    return [];
  }
  private put(cells: number[]) {
    cells.forEach((value, i) => {
      const mesh = this.tiles[i];
      mesh.visible = value > 0;
      if (!value) return;
      mesh.material = this.face(value);
      mesh.position.set(where(i).x, THICK / 2 + 0.05, where(i).z);
      mesh.scale.setScalar(1);
    });
  }
  protected place(state: State) {
    this.put(state.cells);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    // The tiles slide to where the move sends them; then the joined ones swell and the new one grows in.
    this.put(before.cells);
    this.tween(0, 110, (p) => {
      const ease = 1 - (1 - p) * (1 - p);
      before.cells.forEach((value, i) => {
        if (!value) return;
        const a = where(i),
          b = where(last.slides[i]);
        this.tiles[i].position.set(a.x + (b.x - a.x) * ease, THICK / 2 + 0.05, a.z + (b.z - a.z) * ease);
      });
    });
    let laid = false;
    this.tween(110, 150, (p) => {
      if (!laid) {
        laid = true;
        this.put(state.cells);
        this.onContact();
      }
      const swell = 1 + Math.sin(p * Math.PI) * 0.16;
      for (const i of last.merged) this.tiles[i].scale.setScalar(swell);
      if (last.spawn >= 0) this.tiles[last.spawn].scale.setScalar(Math.max(0.05, p));
    });
    return true;
  }
  /** A swipe anywhere over the desk: the tiles go the way the finger went. */
  protected dragStart(_point: number, at: { x: number; z: number }) {
    this.from = at;
    return true;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const from = this.from;
    this.from = null;
    if (!from || !at) return;
    const dx = at.x - from.x,
      dz = at.z - from.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 0.6) return;
    this.onMove({ from: -1, to: Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? RIGHT : LEFT) : dz > 0 ? DOWN : UP, extra: -1 });
  }
  protected mark(_marks: Marks) {}
}
