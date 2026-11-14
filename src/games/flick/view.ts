import * as T from "three";
import type { Marks } from "../points/view";
import { TableView } from "../table/view";
import { DT, POWERS, lift, moving, step, type Arena, type Disc } from "./physics";

/**
 * A table of discs that are flicked: the view lays them out, replays a shot
 * with the same physics the rules used, and turns a pull on a disc into a
 * shot (pull back and let go, like a catapult).
 */
export abstract class FlickView<S> extends TableView<S> {
  private arrow: T.Mesh;
  private pull: T.Mesh;
  private aiming: { point: number; x: number; z: number; degrees: number; power: number } | null = null;
  /** Height of the playing surface, and of the discs' middles above it. */
  protected top = 0;
  constructor(host: HTMLElement, quality: "high" | "low", clear: string) {
    super(host, quality, clear);
    // The line of aim and the line of the pull: thin and dashed (the user asked), black unless a table says otherwise.
    const bar = this.own(new T.PlaneGeometry(1, 0.05).rotateX(-Math.PI / 2)),
      dashes = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 4;
        const pen = canvas.getContext("2d")!;
        pen.fillStyle = "#ffffff";
        pen.fillRect(0, 0, 9, 4);
        const texture = this.own(new T.CanvasTexture(canvas));
        texture.wrapS = T.RepeatWrapping;
        texture.magFilter = T.NearestFilter;
        return texture;
      },
      line = (opacity: number) => new T.Mesh(bar, this.own(new T.MeshBasicMaterial({ color: this.aimColor(), map: dashes(), depthTest: false, transparent: true, opacity, side: T.DoubleSide })));
    this.arrow = line(0.95);
    this.pull = line(0.45);
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
    mesh.scale.set(length, 1, 1);
    (mesh.material as T.MeshBasicMaterial).map!.repeat.x = length / 0.22;
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
    const arena = this.arena(before),
      heard = { hits: 0 },
      falling = new Map<number, number>();
    let done = 0,
      sounded = 0;
    // Replayed in step with the clock; the rules have already said where it ends.
    this.tween(0, 14000, () => {});
    const started = performance.now(),
      run = () => {
        const due = Math.floor((performance.now() - started) / (DT * 1000));
        while (done < due && moving(live)) {
          for (const id of step(live, arena, heard)) falling.set(id, 0);
          done++;
        }
        if (heard.hits > sounded) {
          sounded = heard.hits;
          this.onContact();
        }
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
        else this.finish(state);
      };
    this.ticker = requestAnimationFrame(run);
    return true;
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
      reach = 0.6 + aim.power * 0.3;
    this.arrow.visible = this.pull.visible = show;
    const angle = Math.atan2(dz, dx);
    this.aimed(show ? { x: aim.x, z: aim.z, angle, power: aim.power } : null);
    if (!show) return;
    this.arrow.position.set(aim.x + (Math.cos(angle) * reach) / 2, this.top + 0.25, aim.z + (Math.sin(angle) * reach) / 2);
    this.stretch(this.arrow, reach);
    this.arrow.rotation.y = -angle;
    this.pull.position.set((aim.x + at.x) / 2, this.top + 0.25, (aim.z + at.z) / 2);
    this.stretch(this.pull, length);
    this.pull.rotation.y = -angle;
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
