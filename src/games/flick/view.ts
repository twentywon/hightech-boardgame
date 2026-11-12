import * as T from "three";
import type { Marks } from "../points/view";
import { TableView } from "../table/view";
import { DT, POWERS, moving, step, type Arena, type Disc } from "./physics";

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
    const bar = this.own(new T.BoxGeometry(1, 0.03, 0.09));
    this.arrow = new T.Mesh(bar, this.own(new T.MeshBasicMaterial({ color: "#ffd24a", depthTest: false, transparent: true, opacity: 0.95 })));
    this.pull = new T.Mesh(bar, this.own(new T.MeshBasicMaterial({ color: "#ffffff", depthTest: false, transparent: true, opacity: 0.5 })));
    this.arrow.renderOrder = this.pull.renderOrder = 9;
    this.arrow.visible = this.pull.visible = false;
    this.scene.add(this.arrow, this.pull);
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
            mesh.position.set(disc.x, this.top, disc.z);
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
      reach = 0.4 + aim.power * 0.16;
    this.arrow.visible = this.pull.visible = show;
    if (!show) return;
    const angle = Math.atan2(dz, dx);
    this.arrow.position.set(aim.x + (Math.cos(angle) * reach) / 2, this.top + 0.25, aim.z + (Math.sin(angle) * reach) / 2);
    this.arrow.scale.set(reach, 1, 1 + aim.power / POWERS);
    this.arrow.rotation.y = -angle;
    this.pull.position.set((aim.x + at.x) / 2, this.top + 0.25, (aim.z + at.z) / 2);
    this.pull.scale.set(length, 1, 0.5);
    this.pull.rotation.y = -angle;
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const aim = this.aiming;
    this.aiming = null;
    this.arrow.visible = this.pull.visible = false;
    if (aim && at && aim.power >= 1) this.shoot(aim.point, aim.degrees, aim.power);
  }
  protected abstract mark(marks: Marks): void;
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
