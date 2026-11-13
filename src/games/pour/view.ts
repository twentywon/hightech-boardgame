import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { goalText, type State } from "./rules";

export const POUR_COLORS: [string, string] = ["#2f8fd0", "#b9b3a4"];
/** Where the three beakers stand, how wide they are, and how tall a litre makes them. */
const XS = [-3.4, 0, 3.4],
  RADIUS = 0.95,
  LITRE = 0.3,
  LIQUID = "#2f8fd0";
/** Pale wall tiles, as in a laboratory. */
function tiles() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e3ecee";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#c3d0d4";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 256, 256);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(16, 8);
  return t;
}
/**
 * A laboratory bench: three plain beakers without marks, the liquid in them,
 * a card before each with what it holds, and a board with the goal. A pour is
 * shown as it is made: the beaker is lifted, tipped over the other, and the
 * liquid runs across.
 */
export class PourView extends TableView<State> {
  private beakers: T.Group[] = [];
  private glasses: T.Mesh[] = [];
  private rims: T.Mesh[] = [];
  private liquids: T.Mesh[] = [];
  private stream: T.Mesh;
  private cards: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string }[] = [];
  private slate: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private chosen: T.Mesh;
  private aims: T.Mesh[] = [];
  private cursor: T.Mesh;
  private arrow = new T.Group();
  private shaft: T.Mesh;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#dfe7ea");
    this.daylight("#ffffff", "#aab6ba", "#ffffff", 9, 1.6);
    // The room: tiled wall, a white bench with a dark edge, a shelf of flasks and a rack of tubes behind.
    this.add(new T.PlaneGeometry(48, 24), this.standard({ map: this.own(tiles()), roughness: 0.6 }), 0, 8, -3.2).castShadow = false;
    this.add(new T.BoxGeometry(18, 0.5, 5.6), this.standard({ color: "#f4f6f6", roughness: 0.35 }), 0, -0.25, 0.3);
    this.add(new T.BoxGeometry(18, 0.9, 0.2), this.standard({ color: "#3d4a52", roughness: 0.6 }), 0, -0.9, 3.0).castShadow = false;
    const steel = this.standard({ color: "#9aa7ad", roughness: 0.3, metalness: 0.7 }),
      clear = this.own(new T.MeshPhysicalMaterial({ color: "#e8f6fa", transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }));
    // The shelf throws no shadow: on the wall behind it would be a grey slab.
    this.add(new T.BoxGeometry(14, 0.14, 1.1), steel, 0, 5.2, -2.6).castShadow = false;
    [["#e0a92a", -5.6], ["#3fa66b", -4.2], ["#c8452f", 4.4], ["#7a4fb5", 5.8]].forEach(([color, x]) => {
      // A flask: a cone of liquid under a narrow neck.
      this.add(new T.ConeGeometry(0.55, 0.9, 24), this.standard({ color: color as string, roughness: 0.25 }), x as number, 5.72, -2.6);
      this.add(new T.CylinderGeometry(0.14, 0.14, 0.5, 16), clear, x as number, 6.35, -2.6).castShadow = false;
    });
    this.add(new T.BoxGeometry(2.6, 0.5, 0.7), this.standard({ color: "#b98a4e", roughness: 0.6 }), 6.6, 0.25, -1.6);
    for (let i = 0; i < 5; i++) {
      this.add(new T.CylinderGeometry(0.13, 0.13, 1.5, 14), clear, 5.6 + i * 0.5, 1.0, -1.6).castShadow = false;
      this.add(new T.CylinderGeometry(0.11, 0.11, 0.5 + (i % 3) * 0.25, 14), this.standard({ color: ["#3fa66b", "#e0a92a", "#c8452f"][i % 3], roughness: 0.3 }), 5.6 + i * 0.5, 0.55 + (i % 3) * 0.12, -1.6);
    }
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
    // A beaker: a straight wall of glass, a thick rolled lip with a spout to either side, a flat bottom.
    const wall = this.own(new T.CylinderGeometry(RADIUS, RADIUS, 1, 40, 1, true)),
      body = this.own(new T.CylinderGeometry(RADIUS * 0.93, RADIUS * 0.93, 1, 40)),
      lip = this.own(new T.TorusGeometry(RADIUS * 1.03, 0.07, 10, 40)),
      spout = this.own(new T.ConeGeometry(0.2, 0.34, 12)),
      bottom = this.own(new T.CylinderGeometry(RADIUS, RADIUS, 0.07, 40)),
      glass = this.own(new T.MeshPhysicalMaterial({ color: "#d9f0f6", transparent: true, opacity: 0.3, roughness: 0.05, side: T.DoubleSide, depthWrite: false })),
      thick = this.own(new T.MeshPhysicalMaterial({ color: "#cfe9f0", transparent: true, opacity: 0.75, roughness: 0.08 })),
      liquid = this.own(new T.MeshPhysicalMaterial({ color: LIQUID, transparent: true, opacity: 0.86, roughness: 0.15 })),
      own = <X extends { dispose(): void }>(r: X) => this.own(r);
    XS.forEach((x) => {
      const beaker = new T.Group(),
        vessel = new T.Mesh(wall, glass),
        fill = new T.Mesh(body, liquid),
        rim = new T.Group(),
        ring = new T.Mesh(lip, thick),
        base = new T.Mesh(bottom, thick);
      ring.rotation.x = Math.PI / 2;
      rim.add(ring);
      for (const way of [-1, 1]) {
        const beak = new T.Mesh(spout, thick);
        beak.rotation.z = -way * 1.9;
        beak.position.x = way * (RADIUS + 0.12);
        rim.add(beak);
      }
      base.position.y = 0.035;
      vessel.renderOrder = 2;
      fill.castShadow = true;
      beaker.add(fill, base, vessel, rim);
      beaker.position.x = x;
      this.beakers.push(beaker);
      this.glasses.push(vessel);
      this.rims.push(rim as unknown as T.Mesh);
      this.liquids.push(fill);
      this.scene.add(beaker);
      const card = sign(1.9, 1.0, 304, 160);
      card.mesh.position.set(x, 0.52, 1.85);
      card.mesh.rotation.x = -0.35;
      this.cards.push(card);
    });
    // What runs from one beaker into the other while it is poured.
    this.stream = new T.Mesh(this.own(new T.CylinderGeometry(0.09, 0.07, 1, 12)), liquid);
    this.stream.visible = false;
    this.scene.add(this.stream);
    const slate = sign(9, 1.1, 1152, 140);
    slate.mesh.position.set(0, 7.9, -3.1);
    this.slate = slate;
    this.chosen = ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#f0a020");
    this.cursor = ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#3f8cff");
    for (let i = 0; i < 2; i++) this.aims.push(ringMesh(own, RADIUS * 1.12, RADIUS * 1.32, "#3fa66b"));
    // The arrow of a hint, standing upright over the beakers: from the one to pour toward the one to fill.
    const gold = this.own(new T.MeshBasicMaterial({ color: "#f0a020", depthTest: false, transparent: true, opacity: 0.95, side: T.DoubleSide })),
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
  /** Lays the beakers out with so much in each (fractions while a pour is shown), standing in their places. */
  private fill(state: State, amounts: number[]) {
    XS.forEach((x, i) => {
      const tall = state.caps[i] * LITRE + 0.25,
        deep = Math.max(0.0001, amounts[i] * LITRE);
      this.beakers[i].position.set(x, 0, 0);
      this.beakers[i].rotation.z = 0;
      this.glasses[i].scale.y = tall;
      this.glasses[i].position.y = tall / 2;
      this.rims[i].position.y = tall;
      this.liquids[i].visible = amounts[i] > 0.001;
      this.liquids[i].scale.y = deep;
      this.liquids[i].position.y = deep / 2 + 0.07;
      const now = Math.round(amounts[i]);
      this.write(this.cards[i], `${now}/${state.caps[i]}`, (ctx, w, h) => {
        ctx.fillStyle = "#fbf7ec";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#2f6fa8";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        // The amount large, the size of the vessel small beside it; both are made to fit the card whatever the numbers.
        const big = String(now),
          small = `/ ${state.caps[i]}리터`,
          room = w - 36;
        let size = 104;
        const widths = () => {
          ctx.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`;
          const a = ctx.measureText(big).width;
          ctx.font = `700 ${Math.round(size * 0.42)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
          return [a, ctx.measureText(small).width];
        };
        let [a, b] = widths();
        while (a + 12 + b > room && size > 40) {
          size -= 4;
          [a, b] = widths();
        }
        const left = (w - (a + 12 + b)) / 2;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = "#1f5f98";
        ctx.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`;
        ctx.fillText(big, left, h * 0.54);
        ctx.fillStyle = "#5c5a55";
        ctx.font = `700 ${Math.round(size * 0.42)}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
        ctx.fillText(small, left + a + 12, h * 0.6);
      });
    });
    this.write(this.slate, goalText(state), (ctx, w, h) => {
      // A whiteboard in a metal frame.
      ctx.fillStyle = "#fdfdfb";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#8f9ca2";
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = "#1f3a52";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // The longest goal must fit the slate as well as the shortest.
      let size = 64;
      do ctx.font = `700 ${size}px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`;
      while (ctx.measureText(`목표: ${goalText(state)}`).width > w - 60 && (size -= 3) > 30);
      ctx.fillText(`목표: ${goalText(state)}`, w / 2, h / 2 + 4);
    });
  }
  protected place(state: State) {
    this.stream.visible = false;
    this.fill(state, state.amounts);
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    const { from, to } = last,
      way = Math.sign(XS[to] - XS[from]),
      tall = state.caps[from] * LITRE + 0.25,
      over = state.caps[to] * LITRE + 0.25,
      smooth = (p: number) => p * p * (3 - 2 * p);
    let heard = false;
    // Lifted and carried over, tipped until it runs, held while the levels change, then set back.
    this.tween(0, 1500, (p) => {
      const lift = smooth(Math.min(1, p / 0.28)),
        back = smooth(Math.max(0, (p - 0.78) / 0.22)),
        pouring = Math.max(0, Math.min(1, (p - 0.28) / 0.5)),
        held = lift * (1 - back),
        // Fuller beakers need less of a tip, emptier ones more.
        angle = held * (0.75 + 0.6 * pouring),
        amounts = before.amounts.map((v, i) => v + (state.amounts[i] - v) * smooth(pouring));
      this.fill(state, amounts);
      // The spout, as the tipped beaker carries it: it is brought to hang just inside the other beaker's lip.
      const sx = way * (RADIUS * Math.cos(angle) + tall * Math.sin(angle)),
        sy = tall * Math.cos(angle) - RADIUS * Math.sin(angle),
        aimX = XS[to] - way * RADIUS * 0.35,
        aimY = over + 0.45,
        x = XS[from] + (aimX - sx - XS[from]) * held,
        y = Math.max(0, aimY - sy) * held;
      this.beakers[from].position.set(x, y, 0);
      this.beakers[from].rotation.z = -way * angle;
      const running = pouring > 0.02 && pouring < 0.98,
        surface = amounts[to] * LITRE + 0.07;
      this.stream.visible = running;
      if (running) {
        const top = y + sy,
          drop = Math.max(0.1, top - surface);
        this.stream.scale.y = drop;
        this.stream.position.set(x + sx, top - drop / 2, 0);
        if (!heard) {
          heard = true;
          this.onContact();
        }
      }
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
      this.arrow.position.set(XS[hint.from] + way * RADIUS * 0.6, state.caps[0] * LITRE + 1.2, 0.3);
      this.arrow.rotation.y = way > 0 ? 0 : Math.PI;
      this.shaft.scale.x = length - 0.6;
      this.shaft.position.x = (length - 0.6) / 2;
      this.arrow.getObjectByName("tip")!.position.x = length;
    }
  }
}
