import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DX, DY, H, W, direction, moves, type State } from "./rules";

export const MARBLE_COLORS: [string, string] = ["#2f9f8f", "#b9b3a4"];
/** A hollow's width, and a marble's radius. */
const S = 1,
  R = 0.36,
  /** How high a marble's middle lies when it sits in its hollow. */
  REST = 0.25;
const cx = (i: number) => ((i % W) - (W - 1) / 2) * S,
  cz = (i: number) => (Math.floor(i / W) - (H - 1) / 2) * S;
/** The skin of a marble: clear glass with a twist of colour through it. */
function glass() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e6f1ee";
  ctx.fillRect(0, 0, 256, 128);
  for (const [color, shift] of [["#2f9f8f", 0], ["#e0a92a", 86], ["#c8452f", 170]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 15;
    ctx.beginPath();
    for (let x = -40; x <= 300; x += 6) {
      const y = 64 + Math.sin(((x + shift) / 256) * Math.PI * 2) * 38;
      if (x === -40) ctx.moveTo(x + shift * 0.3, y);
      else ctx.lineTo(x + shift * 0.3, y);
    }
    ctx.stroke();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = T.RepeatWrapping;
  return t;
}
function tray() {
  const c = document.createElement("canvas");
  c.width = W * 96;
  c.height = H * 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#c99a5e";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(60,30,10,0.05)";
    ctx.fillRect((i * 173) % c.width, (i * 311) % c.height, 30, 2);
  }
  for (let i = 0; i < W * H; i++) {
    const x = (i % W) * 96 + 48,
      y = Math.floor(i / W) * 96 + 48,
      shade = ctx.createRadialGradient(x, y - 12, 4, x, y, 34);
    shade.addColorStop(0, "rgba(40, 22, 8, 0.8)");
    shade.addColorStop(1, "rgba(40, 22, 8, 0.3)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A wooden tray of hollows with glass marbles in some of them; a shot rolls them one into the next. */
export class MarbleView extends TableView<State> {
  private balls: T.Mesh[] = [];
  private chosen: T.Mesh;
  private aims: T.Mesh[] = [];
  private cursor: T.Mesh;
  private from: { point: number; x: number; z: number } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#3c2c22");
    this.daylight("#fff6e6", "#6b5335", "#ffe9c4", 9, 2.2);
    const floor = this.own(wood(true));
    floor.repeat.set(4, 4);
    this.add(new T.BoxGeometry(60, 0.4, 44), this.standard({ map: floor, roughness: 0.75 }), 0, -0.55, 0).castShadow = false;
    const side = this.standard({ map: this.own(wood()), roughness: 0.5 });
    this.add(new T.BoxGeometry(W * S + 0.7, 0.36, H * S + 0.7), [side, side, this.standard({ map: this.own(tray()), roughness: 0.6 }), side, side, side], 0, -0.18, 0);
    const own = <X extends { dispose(): void }>(r: X) => this.own(r);
    const sphere = this.own(new T.SphereGeometry(R, 28, 20)),
      paint = this.standard({ map: this.own(glass()), roughness: 0.08, metalness: 0.05 });
    for (let i = 0; i < W * H; i++) {
      const ball = new T.Mesh(sphere, paint);
      ball.castShadow = true;
      ball.visible = false;
      // Each lies turned its own way, so that no two look alike.
      ball.rotation.set(i * 1.3, i * 2.1, i * 0.7);
      this.balls.push(ball);
      this.scene.add(ball);
    }
    this.chosen = ringMesh(own, R * 1.15, R * 1.45, "#ffd24a");
    this.cursor = ringMesh(own, R * 1.15, R * 1.45, "#9fc6ff");
    for (let i = 0; i < 4; i++) this.aims.push(ringMesh(own, R * 1.15, R * 1.45, "#ffffff"));
    this.scene.add(this.chosen, this.cursor, ...this.aims);
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 4.1 : 4.6, halfZ: 4.7, height: 0.8, lookY: 0, tilt: 1.16 };
  }
  protected spots(): Spot[] {
    return this.state ? this.state.cells.flatMap((marble, i) => (marble ? [{ x: cx(i), y: R, z: cz(i), r: 0.48, point: i }] : [])) : [];
  }
  protected place(state: State) {
    state.cells.forEach((marble, i) => {
      const ball = this.balls[i];
      ball.visible = marble;
      ball.scale.setScalar(1);
      ball.position.set(cx(i), REST, cz(i));
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    this.place(before);
    let at = 0;
    for (const roll of last.rolls) {
      const ball = this.balls[roll.from],
        // Off the tray: three hollows past the edge, shrinking as it goes.
        steps = roll.to < 0 ? 3 + (last.dir === 0 ? Math.floor(roll.from / W) : last.dir === 2 ? H - 1 - Math.floor(roll.from / W) : last.dir === 1 ? W - 1 - (roll.from % W) : roll.from % W) : Math.abs(roll.to - roll.from) / (last.dir % 2 ? 1 : W),
        x0 = cx(roll.from),
        z0 = cz(roll.from),
        duration = 90 + steps * 60;
      this.tween(at, duration, (p) => {
        // It rises out of its hollow, rolls over the tray and settles into the next (or goes over the edge).
        const lift = Math.min(1, (roll.to < 0 ? p : Math.min(p, 1 - p)) * 6) * (R - REST);
        ball.position.set(x0 + DX[last.dir] * steps * S * p, REST + lift, z0 + DY[last.dir] * steps * S * p);
        // It turns as it rolls.
        ball.rotation.x += DY[last.dir] * 0.25;
        ball.rotation.z -= DX[last.dir] * 0.25;
        if (roll.to < 0) ball.scale.setScalar(p > 0.6 ? Math.max(0.01, 1 - (p - 0.6) / 0.4) : 1);
        if (p === 1) this.onContact();
      });
      at += duration;
    }
    return true;
  }
  /** A press on a marble: let go at once it picks the marble; dragged, it shoots it that way. */
  protected dragStart(point: number, at: { x: number; z: number }) {
    if (point < 0) return false;
    this.from = { point, ...at };
    return true;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const from = this.from,
      state = this.state;
    this.from = null;
    if (!from || !at || !state) return;
    const dx = at.x - from.x,
      dz = at.z - from.z;
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 0.45) return this.onPick(from.point);
    const dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0,
      shot = moves(state).find((m) => m.from === from.point && direction(m.from, m.to) === dir);
    if (shot) this.onMove(shot);
  }
  protected mark(marks: Marks) {
    const put = (ring: T.Mesh, point: number | null | undefined) => {
      ring.visible = point !== null && point !== undefined && point >= 0;
      if (ring.visible) ring.position.set(cx(point!), 0.012, cz(point!));
    };
    put(this.chosen, marks.selected);
    put(this.cursor, marks.cursor);
    this.aims.forEach((ring, i) => put(ring, marks.targets[i]));
  }
}
