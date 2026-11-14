import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DX, DY, H, W, direction, moves, type State } from "./rules";

export const MARBLE_COLORS: [string, string] = ["#2f9f8f", "#b9b3a4"];
/** A hollow's width and a marble's radius; the marbles lie on the board, over small hollows. */
const S = 1,
  R = 0.4,
  PAINT = ["#149aa3", "#7a3fb5", "#c9342c"];
const cx = (i: number) => ((i % W) - (W - 1) / 2) * S,
  cz = (i: number) => (Math.floor(i / W) - (H - 1) / 2) * S;
/** The face of the board: pale wood with a small dark hollow at every place. */
function face() {
  const c = document.createElement("canvas");
  c.width = W * 96;
  c.height = H * 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#cfa474";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < W * H; i++) {
    const x = (i % W) * 96 + 48,
      y = Math.floor(i / W) * 96 + 48;
    ctx.fillStyle = "#b08658";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** A flat board in a dark frame, seen from straight above, with glossy marbles of three colours; a shot rolls them one into the next. */
export class MarbleView extends TableView<State> {
  private balls: T.Mesh[] = [];
  private paints: T.Material[];
  private chosen: T.Mesh;
  private aims: T.Mesh[] = [];
  private cursor: T.Mesh;
  /** The arrow of a hint: a shaft and a head, lying over the marbles from the one to shoot toward the one to strike. */
  private arrow = new T.Group();
  private shaft: T.Mesh;
  private from: { point: number; x: number; z: number } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#e9eef0");
    // Lit from the upper left, as a picture is: each marble shows one bright spot.
    this.scene.add(new T.HemisphereLight("#ffffff", "#c9b8a0", 1.5));
    const sun = new T.DirectionalLight("#ffffff", 1.7);
    sun.position.set(-2.2, 12, -2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -7;
    sun.shadow.camera.right = sun.shadow.camera.top = 7;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    const frame = this.standard({ color: "#4a2f22", roughness: 0.6 }),
      rim = this.standard({ color: "#5c3a29", roughness: 0.6 });
    this.add(new T.BoxGeometry(W * S + 0.8, 0.3, H * S + 0.8), frame, 0, -0.2, 0);
    this.add(new T.BoxGeometry(W * S + 0.44, 0.3, H * S + 0.44), rim, 0, -0.17, 0).castShadow = false;
    const board = this.add(new T.BoxGeometry(W * S + 0.1, 0.3, H * S + 0.1), [rim, rim, this.standard({ map: this.own(face()), roughness: 0.85 }), rim, rim, rim], 0, -0.15, 0);
    board.castShadow = false;
    const own = <X extends { dispose(): void }>(r: X) => this.own(r);
    const sphere = this.own(new T.SphereGeometry(R, 32, 24)),
      dot = this.own(new T.SphereGeometry(0.1, 14, 10)),
      shine = this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8 }));
    this.paints = PAINT.map((color) => this.own(new T.MeshPhysicalMaterial({ color, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })));
    for (let i = 0; i < W * H; i++) {
      const ball = new T.Mesh(sphere, this.paints[0]);
      ball.castShadow = true;
      ball.visible = false;
      // The gleam of the light on it, up and to the left.
      const gleam = new T.Mesh(dot, shine);
      gleam.position.set(-0.13, 0.34, -0.14);
      gleam.scale.set(1, 0.3, 1);
      ball.add(gleam);
      this.balls.push(ball);
      this.scene.add(ball);
    }
    this.chosen = ringMesh(own, R * 1.12, R * 1.36, "#ffd24a");
    this.cursor = ringMesh(own, R * 1.12, R * 1.36, "#3f8cff");
    for (let i = 0; i < 4; i++) this.aims.push(ringMesh(own, R * 1.12, R * 1.36, "#ffffff"));
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffc21a", depthTest: false, transparent: true, opacity: 0.95, side: T.DoubleSide })),
      head = new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.42, 0.3), new T.Vector2(-0.42, -0.3)]),
      tip = new T.Mesh(this.own(new T.ShapeGeometry(head)), gold);
    this.shaft = new T.Mesh(this.own(new T.PlaneGeometry(1, 0.2)), gold);
    // Both lie flat, pointing along +x; the group is turned to the way of the shot.
    this.shaft.rotation.x = tip.rotation.x = -Math.PI / 2;
    tip.name = "tip";
    this.shaft.renderOrder = tip.renderOrder = 9;
    this.arrow.add(this.shaft, tip);
    this.arrow.visible = false;
    this.scene.add(this.chosen, this.cursor, ...this.aims, this.arrow);
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    // Straight down, or as good as: the board fills the view like a picture of it.
    return { half: 3.95, halfZ: 5.0, height: 0.6, lookY: 0, tilt: 1.52 };
  }
  protected spots(): Spot[] {
    return this.state ? this.state.cells.flatMap((marble, i) => (marble ? [{ x: cx(i), y: R, z: cz(i), r: 0.48, point: i }] : [])) : [];
  }
  protected place(state: State) {
    state.cells.forEach((marble, i) => {
      const ball = this.balls[i];
      ball.visible = marble;
      if (!marble) return;
      ball.material = this.paints[(state.tints[i] - 1 + PAINT.length) % PAINT.length];
      ball.scale.setScalar(1);
      ball.position.set(cx(i), R, cz(i));
    });
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return false;
    this.place(before);
    let at = 0;
    for (const roll of last.rolls) {
      const ball = this.balls[roll.from],
        // Off the board: three places past the edge, shrinking as it goes.
        steps = roll.to < 0 ? 3 + (last.dir === 0 ? Math.floor(roll.from / W) : last.dir === 2 ? H - 1 - Math.floor(roll.from / W) : last.dir === 1 ? W - 1 - (roll.from % W) : roll.from % W) : Math.abs(roll.to - roll.from) / (last.dir % 2 ? 1 : W),
        x0 = cx(roll.from),
        z0 = cz(roll.from),
        duration = 90 + steps * 60;
      this.tween(at, duration, (p) => {
        ball.position.set(x0 + DX[last.dir] * steps * S * p, R, z0 + DY[last.dir] * steps * S * p);
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
    // A hint: an arrow from just past the marble to shoot up to the marble it strikes.
    const hint = marks.hint;
    this.arrow.visible = !!hint;
    if (hint) {
      const dir = direction(hint.from, hint.to),
        length = Math.hypot(cx(hint.to) - cx(hint.from), cz(hint.to) - cz(hint.from)) - R * 2;
      this.arrow.position.set(cx(hint.from) + DX[dir] * R, R * 2 + 0.05, cz(hint.from) + DY[dir] * R);
      this.arrow.rotation.y = -Math.atan2(DY[dir], DX[dir]);
      this.shaft.scale.x = Math.max(0.05, length - 0.4);
      this.shaft.position.x = Math.max(0.05, length - 0.4) / 2;
      this.arrow.getObjectByName("tip")!.position.x = length;
    }
  }
}
