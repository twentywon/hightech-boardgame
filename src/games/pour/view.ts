import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { goalText, type State } from "./rules";

export const POUR_COLORS: [string, string] = ["#8e1f2f", "#b9b3a4"];
/** Where the three vessels stand, how wide they are, and how tall a litre makes them. */
const XS = [-3.4, 0, 3.4],
  RADIUS = 0.95,
  LITRE = 0.3;
/** Three plain glass vessels on a counter, the wine in them, a card before each with what it holds, and a slate with the goal. */
export class PourView extends TableView<State> {
  private glasses: T.Mesh[] = [];
  private wines: T.Mesh[] = [];
  private cards: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }[] = [];
  private slate: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private chosen: T.Mesh;
  private aims: T.Mesh[] = [];
  private cursor: T.Mesh;
  private arrow = new T.Group();
  private shaft: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a211c");
    this.daylight("#fff3da", "#4a3a2c", "#ffe9c4", 9, 2.0);
    const top = this.own(wood(true));
    top.repeat.set(3, 1);
    this.add(new T.BoxGeometry(16, 0.5, 5), this.standard({ map: top, roughness: 0.45 }), 0, -0.25, 0.4);
    this.add(new T.PlaneGeometry(40, 20), this.standard({ color: "#3a2c24", roughness: 1 }), 0, 6, -3).castShadow = false;
    const sign = (w: number, h: number, px: number, py: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = px;
      canvas.height = py;
      const texture = this.own(new T.CanvasTexture(canvas));
      texture.colorSpace = T.SRGBColorSpace;
      texture.anisotropy = 4;
      const mesh = new T.Mesh(this.own(new T.PlaneGeometry(w, h)), this.own(new T.MeshBasicMaterial({ map: texture })));
      this.scene.add(mesh);
      return { canvas, texture, said: "", mesh };
    };
    const tube = this.own(new T.CylinderGeometry(RADIUS, RADIUS, 1, 40, 1, true)),
      body = this.own(new T.CylinderGeometry(RADIUS * 0.93, RADIUS * 0.93, 1, 40)),
      glass = this.own(new T.MeshPhysicalMaterial({ color: "#dff1f5", transparent: true, opacity: 0.28, roughness: 0.05, side: T.DoubleSide, depthWrite: false })),
      wine = this.standard({ color: "#8e1f2f", roughness: 0.25 }),
      own = <X extends { dispose(): void }>(r: X) => this.own(r);
    for (const x of XS) {
      const vessel = new T.Mesh(tube, glass),
        fill = new T.Mesh(body, wine);
      vessel.position.x = fill.position.x = x;
      vessel.renderOrder = 2;
      fill.castShadow = true;
      this.glasses.push(vessel);
      this.wines.push(fill);
      this.scene.add(fill, vessel);
      this.add(new T.CylinderGeometry(RADIUS * 1.02, RADIUS * 1.02, 0.06, 40), this.standard({ color: "#cfe3e8", roughness: 0.2 }), x, 0.03, 0);
      const card = sign(1.9, 1.0, 304, 160);
      card.mesh.position.set(x, 0.52, 1.75);
      card.mesh.rotation.x = -0.35;
      this.cards.push(card);
    }
    const slate = sign(9, 1.1, 1152, 140);
    slate.mesh.position.set(0, 7.3, -2.9);
    this.slate = slate;
    this.chosen = ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#ffd24a");
    this.cursor = ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#9fc6ff");
    for (let i = 0; i < 2; i++) this.aims.push(ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#ffffff"));
    // The arrow of a hint, standing upright over the vessels: from the one to pour toward the one to fill.
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffc21a", depthTest: false, transparent: true, opacity: 0.95, side: T.DoubleSide })),
      tip = new T.Mesh(this.own(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.6, 0.42), new T.Vector2(-0.6, -0.42)]))), gold);
    this.shaft = new T.Mesh(this.own(new T.PlaneGeometry(1, 0.28)), gold);
    tip.name = "tip";
    this.shaft.renderOrder = tip.renderOrder = 9;
    this.arrow.add(this.shaft, tip);
    this.arrow.visible = false;
    this.scene.add(this.chosen, this.cursor, ...this.aims, this.arrow);
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.2 : 6.4, halfZ: 1.2, height: 8.2, lookY: 3.6, tilt: 0.3 };
  }
  protected spots(): Spot[] {
    const state = this.state;
    return state ? XS.map((x, i) => ({ x, y: (state.caps[i] * LITRE) / 2, z: 0, r: 1.5, point: i })) : [];
  }
  private write(sign: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }, text: string, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    if (sign.said === text) return;
    sign.said = text;
    paint(sign.canvas.getContext("2d")!, sign.canvas.width, sign.canvas.height);
    sign.texture.needsUpdate = true;
  }
  /** Lays the vessels out with so much in each (fractions while a pour is shown). */
  private fill(state: State, amounts: number[]) {
    XS.forEach((_, i) => {
      const tall = state.caps[i] * LITRE,
        deep = Math.max(0.0001, amounts[i] * LITRE);
      this.glasses[i].scale.y = tall + 0.25;
      this.glasses[i].position.y = (tall + 0.25) / 2;
      this.wines[i].visible = amounts[i] > 0.001;
      this.wines[i].scale.y = deep;
      this.wines[i].position.y = deep / 2 + 0.04;
      const now = Math.round(amounts[i]);
      this.write(this.cards[i], `${now}/${state.caps[i]}`, (ctx, w, h) => {
        ctx.fillStyle = "#fbf7ec";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#8e1f2f";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.textBaseline = "middle";
        ctx.textAlign = "right";
        ctx.fillStyle = "#8e1f2f";
        ctx.font = '800 104px "Helvetica Neue", Arial, sans-serif';
        ctx.fillText(String(now), w * 0.46, h * 0.54);
        ctx.textAlign = "left";
        ctx.fillStyle = "#5c5a55";
        ctx.font = '700 44px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
        ctx.fillText(`/ ${state.caps[i]}리터`, w * 0.5, h * 0.58);
      });
    });
    this.write(this.slate, goalText(state), (ctx, w, h) => {
      ctx.fillStyle = "#1f2a26";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#b98a4e";
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = "#f4f1e6";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '700 64px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
      ctx.fillText(`목표: ${goalText(state)}`, w / 2, h / 2 + 4);
    });
  }
  protected place(state: State) {
    this.fill(state, state.amounts);
  }
  protected animate(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return false;
    // One level sinks as the other rises.
    this.tween(0, 420, (p) => {
      const ease = p * p * (3 - 2 * p);
      this.fill(state, before.amounts.map((v, i) => v + (state.amounts[i] - v) * ease));
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const put = (ring: T.Mesh, point: number | null | undefined) => {
      ring.visible = point !== null && point !== undefined && point >= 0 && point < 3;
      if (ring.visible) ring.position.set(XS[point!], 0.012, 0);
    };
    put(this.chosen, marks.selected);
    put(this.cursor, marks.cursor);
    this.aims.forEach((ring, i) => put(ring, marks.targets[i]));
    const hint = marks.hint,
      state = this.state;
    this.arrow.visible = !!hint && !!state;
    if (hint && state) {
      const way = Math.sign(XS[hint.to] - XS[hint.from]),
        length = Math.abs(XS[hint.to] - XS[hint.from]) - RADIUS * 1.2;
      this.arrow.position.set(XS[hint.from] + way * RADIUS * 0.6, state.caps[0] * LITRE + 1.1, 0.3);
      this.arrow.rotation.y = way > 0 ? 0 : Math.PI;
      this.shaft.scale.x = length - 0.6;
      this.shaft.position.x = (length - 0.6) / 2;
      this.arrow.getObjectByName("tip")!.position.x = length;
    }
  }
}
