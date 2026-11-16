import * as T from "three";
import type { Marks } from "../points/view";
import { TableView } from "../table/view";
import { DT, POWERS, lift, moving, step, type Arena, type Disc, type Heard } from "./physics";

/**
 * A table of discs that are flicked: the view lays them out, replays a shot
 * with the same physics the rules used, and turns a pull on a disc into a
 * shot (pull back and let go, like a catapult).
 */
/** How wide the aiming line is: the size of its dots. */
const DOT = 0.075;
export abstract class FlickView<S> extends TableView<S> {
  /**
   * What a shot is heard to strike: a disc, a cushion or a pocket, with how hard (0 to 1). Left unset, a knock of
   * disc on disc or post is the table's one contact sound and cushions and pockets are not heard.
   */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private arrow: T.Mesh;
  private pull: T.Mesh;
  private aiming: { point: number; x: number; z: number; degrees: number; power: number } | null = null;
  /** Height of the playing surface, and of the discs' middles above it. */
  protected top = 0;
  constructor(host: HTMLElement, quality: "high" | "low", clear: string) {
    super(host, quality, clear);
    // The line of aim: a short row of round dots along the way the shot will go (the user asked: nothing on the side
    // of the pull, round dots, short), black unless a table says otherwise.
    const dots = document.createElement("canvas");
    dots.width = 64;
    dots.height = 32;
    const pen = dots.getContext("2d")!;
    pen.fillStyle = "#ffffff";
    pen.beginPath();
    pen.arc(16, 16, 13, 0, Math.PI * 2);
    pen.fill();
    const row = this.own(new T.CanvasTexture(dots));
    row.wrapS = T.RepeatWrapping;
    this.arrow = new T.Mesh(this.own(new T.PlaneGeometry(1, DOT).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ color: this.aimColor(), map: row, depthTest: false, transparent: true, opacity: 0.95, side: T.DoubleSide })));
    // The pull itself is not drawn.
    this.pull = new T.Mesh(this.arrow.geometry, this.own(new T.MeshBasicMaterial({ visible: false })));
    this.arrow.renderOrder = this.pull.renderOrder = 9;
    this.arrow.visible = this.pull.visible = false;
    this.scene.add(this.arrow, this.pull);
  }
  /** The colour of the aiming line. */
  protected aimColor() {
    return "#111111";
  }
  /** Stretches a dashed line to a length, keeping its dashes the same size. */
  private stretch(mesh: T.Mesh, length: number) {
    // Each dot with its gap is twice as long as the line is wide, so the dots stay round.
    mesh.scale.set(length, 1, 1);
    const map = (mesh.material as T.MeshBasicMaterial).map;
    if (map) map.repeat.x = length / (DOT * 2);
  }
  /** The discs of a state at rest, and the table they lie on. */
  protected abstract discs(state: S): Disc[];
  protected abstract arena(state: S): Arena;
  /** The discs of `before` with the shot that led to `state` just struck, or null when `state` did not come from a shot. */
  protected abstract struck(before: S, state: S): Disc[] | null;
  /** The mesh of a disc. */
  protected abstract mesh(id: number): T.Object3D;
  /** Where the disc a pull on `point` would shoot lies, or null when that point cannot shoot now. */
  protected abstract shooter(point: number): { x: number; z: number } | null;
  /** Makes the shot. */
  protected abstract shoot(point: number, degrees: number, power: number): void;
  private put(disc: Disc) {
    const mesh = this.mesh(disc.id);
    mesh.visible = disc.on;
    mesh.position.set(disc.x, this.top, disc.z);
  }
  protected place(state: S) {
    for (const disc of this.discs(state)) this.put(disc);
  }
  protected animate(before: S, state: S) {
    const live = this.struck(before, state);
    if (!live) return false;
    this.replay(live, this.arena(before), () => this.finish(state));
    return true;
  }
  /** Called before each slice of a shot that is run (`n` from 0): for a table where something changes as it goes (a stone swept). */
  protected beforeStep(_live: Disc[], _n: number) {}
  /**
   * Runs discs in step with the clock until they all rest, moving their meshes and sounding what they strike, then
   * calls `done`. A shot from a state is replayed so (the rules have already said where it ends); a table may also
   * run one live this way before it is made, as curling does while its stone is swept.
   */
  protected replay(live: Disc[], arena: Arena, done: () => void) {
    cancelAnimationFrame(this.ticker);
    const heard: Heard = { hits: 0, discs: 0, walls: 0, force: 0 },
      falling = new Map<number, number>();
    let count = 0,
      sounded = 0,
      discs = 0,
      walls = 0;
    // Run in step with the clock; a long tween stands for it meanwhile, so that the table counts as busy.
    this.tween(0, 20000, () => {});
    const started = performance.now(),
      run = () => {
        const due = Math.floor((performance.now() - started) / (DT * 1000));
        let dropped = false;
        while (count < due && moving(live)) {
          this.beforeStep(live, count);
          for (const id of step(live, arena, heard)) {
            falling.set(id, 0);
            dropped = true;
          }
          count++;
        }
        const knock = this.onKnock;
        if (knock) {
          const strength = Math.min(1, (heard.force ?? 0) / 10);
          if (heard.discs! > discs) knock("disc", strength);
          else if (heard.hits > sounded) knock("disc", 0.3);
          if (heard.walls! > walls) knock("cushion", strength);
          if (dropped) knock("pocket", 1);
          heard.force = 0;
        } else if (heard.hits > sounded) this.onContact();
        sounded = heard.hits;
        discs = heard.discs!;
        walls = heard.walls!;
        for (const disc of live) {
          const mesh = this.mesh(disc.id),
            fell = falling.get(disc.id);
          if (fell === undefined) {
            mesh.visible = disc.on;
            this.rolled(disc.id, mesh, disc.x - mesh.position.x, disc.z - mesh.position.z);
            // A disc struck too hard sails over the others in an arc.
            mesh.position.set(disc.x, this.top + lift(disc) * 1.5, disc.z);
          } else {
            // Off the table: it drops out of sight.
            falling.set(disc.id, fell + 1);
            mesh.position.y = this.top - fell * fell * 0.012;
            mesh.visible = fell < 18;
          }
        }
        this.redraw();
        if (moving(live) || [...falling.values()].some((n) => n < 18)) this.ticker = requestAnimationFrame(run);
        else done();
      };
    this.ticker = requestAnimationFrame(run);
  }
  /** Stops a shot being run, leaving its discs where they are. */
  protected stopReplay() {
    cancelAnimationFrame(this.ticker);
  }
  private ticker = 0;
  /** Ends the replay: the long placeholder tween is dropped and the state laid out. */
  private finish(state: S) {
    cancelAnimationFrame(this.ticker);
    this.settleNow();
    this.place(state);
    this.onSettled();
    this.redraw();
  }
  protected dragStart(point: number, _at: { x: number; z: number }) {
    const from = point >= 0 ? this.shooter(point) : null;
    if (!from) return false;
    this.aiming = { point, ...from, degrees: 0, power: 0 };
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    const aim = this.aiming;
    if (!aim) return;
    // Pulled back like a catapult: the shot goes the other way, harder the farther the pull.
    const dx = aim.x - at.x,
      dz = aim.z - at.z,
      length = Math.hypot(dx, dz);
    aim.degrees = (Math.atan2(dz, dx) * 180) / Math.PI;
    aim.power = Math.min(POWERS, Math.round(length * 7));
    const show = aim.power >= 1,
      reach = 0.35 + aim.power * 0.075;
    this.arrow.visible = this.pull.visible = show;
    const angle = Math.atan2(dz, dx);
    this.aimed(show ? { x: aim.x, z: aim.z, angle, power: aim.power } : null);
    if (!show) return;
    // It lies at the height of the discs' middles, starting at the disc's edge, so that it lines up with the shot from any side.
    const from = 0.3 + reach / 2;
    this.arrow.position.set(aim.x + Math.cos(angle) * from, this.top + 0.02, aim.z + Math.sin(angle) * from);
    this.stretch(this.arrow, reach);
    this.arrow.rotation.y = -angle;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const aim = this.aiming;
    this.aiming = null;
    this.arrow.visible = this.pull.visible = false;
    this.aimed(null);
    if (aim && at && aim.power >= 1) this.shoot(aim.point, aim.degrees, aim.power);
  }
  /** A disc has gone this far along the table since the last frame of a shot: for a view whose discs are balls that roll. */
  protected rolled(_id: number, _mesh: T.Object3D, _dx: number, _dz: number) {}
  /** Told where a pull is aiming and how hard, or null when there is none: for a view that shows something of its own. */
  protected aimed(_aim: { x: number; z: number; angle: number; power: number } | null) {}
  protected abstract mark(marks: Marks): void;
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
